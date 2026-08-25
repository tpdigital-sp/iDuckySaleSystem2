#!/usr/bin/env node
/**
 * ตรวจราคา "Griptok อะคริลิค (5-10cm)" (id 1-4) กับหน้าตารางราคาสด
 *
 *   node scripts/griptok-acrylic-check.mjs             # ดึงเว็บสด เทียบกับฐานข้อมูล (ไม่เขียน)
 *   node scripts/griptok-acrylic-check.mjs --refresh   # บังคับดึงหน้าเว็บใหม่ ไม่ใช้แคช
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/griptok
 *   บล็อกหัวข้อ "GRIPTOK Acrylic | Resin Coat" (หน้านั้นมี GRIPTOK หลายแบบ ยึดหัวข้อ ไม่ใช่ลำดับตาราง)
 *   ในบล็อกมี 5 ตาราง (ก่อนถึงหัวข้อย่อย "ปั๊มนูน" ซึ่งเป็นสินค้าอีกตัว griptok-emboss):
 *     1) เรทที่ 1 คละดีเทล   : จำนวน | 5cm..10cm      (ฐานราคา = สกรีน 1 ด้าน ใส/ขาวขุ่น)
 *     2) เรทที่ 2 ไม่คละดีเทล : จำนวน | 5-6 | 7-8 | 9-10 cm (ขั้นต่ำ 50 · ช่วงจำนวนคนละชุดกับเรท 1)
 *     3) Add On ติ่งห้อย     : 11-29 = 15 · 30+ = 12
 *     4) Add On งานสกรีน    : สกรีน 2 ด้าน / 3 เลเยอร์ / 4 เลเยอร์ ต่อขนาด (4 เลเยอร์ไม่ขายในสินค้านี้)
 *     5) Add On อคล.พิเศษ   : เรทปลีก (tier 1-10 ชิ้น) กับเรทส่ง (tier อื่นทั้งหมด) ต่อขนาด
 *   นอกตาราง: เคลือบนูน Resin +40/ชิ้น · ฐานใส +5 (ดำ/ขาวฟรี) — อ่านจากข้อความบนหน้าเดียวกัน
 *
 * ราคาในระบบเก็บเป็น cells "ขนาด│งานสกรีน│สีอะคริลิค (เรทราคา)" ต่อเรท (priceRates r1/r2)
 * สคริปต์นี้ "ประกอบราคาที่ควรเป็น" จากตารางเว็บสด แล้ว diff กับทุก cell ในฐานข้อมูล
 * ตรงหมด = จบ · ไม่ตรง = พิมพ์รายการต่าง ให้คนตัดสินใจก่อนแก้ (สคริปต์นี้ไม่เขียนฐานข้อมูล)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REFRESH = process.argv.includes("--refresh");
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const CACHE = ".cache/pricelist/griptok.html";
const SECTION = "GRIPTOK Acrylic | Resin Coat";
const ID = "1-4";

/* ── โหลดหน้าเว็บ (Wix สลับส่งหน้าเปล่า ~460KB กับหน้าที่มีตาราง ~4.8MB — ลองซ้ำ) ── */
const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) =>
  decode(String(s).replace(/<[^>]+>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function loadPage() {
  if (!REFRESH && existsSync(CACHE)) {
    const html = readFileSync(CACHE, "utf8");
    if (html.includes(SECTION)) return { html, from: "cache" };
  }
  for (let i = 1; i <= 8; i++) {
    const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
    if (!res.ok) throw new Error(`โหลดหน้าเว็บไม่ได้ — HTTP ${res.status}`);
    const html = await res.text();
    if (html.includes(SECTION) && html.includes("<table")) {
      mkdirSync(".cache/pricelist", { recursive: true });
      writeFileSync(CACHE, html);
      return { html, from: `live (ครั้งที่ ${i})` };
    }
    console.log(`   ครั้งที่ ${i}: ได้หน้าเปล่า (${Math.round(html.length / 1024)}KB) — ลองใหม่`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("ลอง 8 ครั้งแล้วยังได้หน้าที่ไม่มีตาราง — Wix อาจเปลี่ยนวิธีเรนเดอร์ มาดูเองก่อน");
}

/* ── ตัดบล็อก + กางตาราง ───────────────────────────────────────────── */
const { html, from } = await loadPage();
console.log(`📄 ใช้หน้า: ${from}`);
const start = html.indexOf(SECTION);
if (start < 0) throw new Error(`ไม่เจอหัวข้อ "${SECTION}" บนหน้าเว็บ`);
let sec = html.slice(start);
const emboss = sec.indexOf("ปั๊มนูน", 100);
if (emboss > 0) sec = sec.slice(0, emboss);

const tables = [...sec.matchAll(/<table[\s\S]*?<\/table>/g)].map((t) =>
  [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) => strip(c[0])))
);
if (tables.length !== 5) throw new Error(`คาดว่าในบล็อกมี 5 ตาราง แต่เจอ ${tables.length} — โครงหน้าเว็บเปลี่ยน มาดูเองก่อน`);
const [rate1T, rate2T, charmT, screenT, specialT] = tables;

const num = (s) => {
  const n = Number(String(s).replace(/[,฿\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`อ่านตัวเลขไม่ได้: "${s}"`);
  return n;
};
const SIZES = ["5cm", "6cm", "7cm", "8cm", "9cm", "10cm"];

/* เรทที่ 1: จำนวน | 5cm..10cm — 6 tier ตามแถว */
if (rate1T.length !== 7 || rate1T[0].length !== 7) throw new Error("โครงตารางเรทที่ 1 เปลี่ยน");
const rate1 = {}; // size -> [ราคา 6 tier]
SIZES.forEach((sz, c) => (rate1[sz] = rate1T.slice(1).map((row) => num(row[c + 1]))));

/* เรทที่ 2: จำนวน | 5-6 | 7-8 | 9-10 — กางคู่ขนาดเป็นรายขนาด */
if (rate2T.length !== 7 || rate2T[0].length !== 4) throw new Error("โครงตารางเรทที่ 2 เปลี่ยน");
const pairCol = { "5cm": 1, "6cm": 1, "7cm": 2, "8cm": 2, "9cm": 3, "10cm": 3 };
const rate2 = {};
SIZES.forEach((sz) => (rate2[sz] = rate2T.slice(1).map((row) => num(row[pairCol[sz]]))));

/* Add On งานสกรีน ต่อขนาด (แถว: 2 ด้าน / 3 เลเยอร์ / 4 เลเยอร์) */
const screenAdd = {}; // "2side"|"3layer" -> size -> บวก
[["2side", 1], ["3layer", 2]].forEach(([key, r]) => {
  screenAdd[key] = {};
  SIZES.forEach((sz, c) => (screenAdd[key][sz] = num(screenT[r][c + 1])));
});

/* Add On อคล.พิเศษ: แถวปลีก (ใช้กับ tier แรกของเรท 1) กับแถวส่ง (tier อื่นทั้งหมด) */
const specialRetail = {}, specialWholesale = {};
SIZES.forEach((sz, c) => {
  specialRetail[sz] = num(specialT[1][c + 1]);
  specialWholesale[sz] = num(specialT[2][c + 1]);
});

/* ติ่งห้อย + ข้อความนอกตาราง */
const charm = { small: num(charmT[1][1]), big: num(charmT[2][1]) };
const secText = strip(sec);
const resinM = secText.match(/เคลือบนูน\s*บวกเพิ่ม\s*ชิ้นละ\s*(\d+)\s*บาท/);
const baseClearM = secText.match(/เฉพาะฐานใส\s*บวกเงินเพิ่ม\s*(\d+)\s*บาท/);
if (!resinM || !baseClearM) throw new Error("หาข้อความ เคลือบนูน/ฐานใส บนหน้าเว็บไม่เจอ — รูปประโยคเปลี่ยน มาดูเองก่อน");
const resinFee = num(resinM[1]);
const baseClearFee = num(baseClearM[1]);

/* ── ประกอบราคาที่ควรเป็นต่อเรท แล้ว diff กับฐานข้อมูล ─────────────── */
const SCREENS = {
  "สกรีน 1 ด้าน (ใต้)": null,
  "สกรีน 1 ด้าน (บน)": null,
  "สกรีน 2 ด้าน (ใต้-บน)": "2side",
  "สกรีน 2 ด้าน (บน-บน)": "2side",
  "สกรีน 3 เลเยอร์": "3layer",
};
const ACR = { "ใส / ขาวขุ่น (ปกติ)": false, "อะคริลิคพิเศษ (โฮโลแกรม/กลิตเตอร์/สี)": true };

/** เรท 1 tier แรกคือ 1-10 ชิ้น = เรทปลีกของ อคล.พิเศษ · เรท 2 ไม่มี tier ปลีก */
function expectedCells(base, retailTierIdx) {
  const cells = {};
  for (const sz of SIZES)
    for (const [scr, addKey] of Object.entries(SCREENS))
      for (const [acr, isSpecial] of Object.entries(ACR)) {
        cells[`${sz}│${scr}│${acr}`] = base[sz].map((p, t) => {
          let v = p + (addKey ? screenAdd[addKey][sz] : 0);
          if (isSpecial) v += t === retailTierIdx ? specialRetail[sz] : specialWholesale[sz];
          return v;
        });
      }
  return cells;
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
const d = row.data;
console.log(`🛒 สินค้า: ${row.name} (id ${ID})`);

let diffs = 0;
const compareCells = (label, dbCells, webCells) => {
  const dbKeys = Object.keys(dbCells || {}).sort();
  const webKeys = Object.keys(webCells).sort();
  for (const k of webKeys)
    if (!dbCells?.[k]) { console.log(`❌ ${label}: ฐานข้อมูลไม่มีช่อง ${k}`); diffs++; }
  for (const k of dbKeys)
    if (!webCells[k]) { console.log(`❌ ${label}: ฐานข้อมูลมีช่องเกิน ${k}`); diffs++; }
  for (const k of webKeys) {
    const a = dbCells?.[k], b = webCells[k];
    if (a && JSON.stringify(a) !== JSON.stringify(b)) {
      console.log(`❌ ${label} ${k}: ฐานข้อมูล [${a}] ≠ เว็บ [${b}]`);
      diffs++;
    }
  }
};

const r1 = (d.priceRates || []).find((r) => r.id === "r1");
const r2 = (d.priceRates || []).find((r) => r.id === "r2");
if (!r1 || !r2) throw new Error("สินค้าไม่มี priceRates r1/r2 แล้ว — โครงข้อมูลเปลี่ยน");
compareCells("เรทที่ 1", r1.pricing?.cells, expectedCells(rate1, 0));
compareCells("เรทที่ 2", r2.pricing?.cells, expectedCells(rate2, -1));
compareCells("pricing หลัก (สำเนาเรทที่ 1)", d.pricing?.cells, expectedCells(rate1, 0));

const check = (label, db, web) => {
  if (db !== web) { console.log(`❌ ${label}: ฐานข้อมูล ${db} ≠ เว็บ ${web}`); diffs++; }
};
const opt = (label) => (d.options || []).find((o) => o.label === label);
check("เคลือบนูน Resin (+/ชิ้น)", opt("เคลือบผิว")?.choices.find((c) => /เคลือบนูน/.test(c.name))?.extra, resinFee);
check("ฐานใส (+/ชิ้น)", opt("ฐาน Griptok")?.choices.find((c) => /ใส/.test(c.name))?.extra, baseClearFee);
const charmOpt = opt("ติ่งห้อย");
check("ติ่งห้อย 30+ (extra)", charmOpt?.choices.find((c) => /เพิ่ม/.test(c.name) && c.extra)?.extra, charm.big);
check("ติ่งห้อย 11-29 (smallQtyFee)", charmOpt?.smallQtyFee?.fee, charm.small);
check("เรทที่ 2 ขั้นต่ำ", r2.minQty, num(rate2T[1][0].match(/^(\d+)/)?.[1] ?? NaN));

if (diffs === 0) console.log("\n✅ ราคาในระบบตรงกับหน้าเว็บทุกช่อง (เรท 1 · เรท 2 · Add On สกรีน/อคล.พิเศษ/ติ่งห้อย · เคลือบนูน · ฐานใส)");
else console.log(`\n⚠️ พบต่างกัน ${diffs} จุด — ดูรายการข้างบนก่อนตัดสินใจแก้`);

#!/usr/bin/env node
/**
 * "สแตนดี้อะคริลิค+จุกใส" — เพิ่ม "เรทที่ 2 (สั่งแบบไม่คละดีเทล)" (ราคาส่งโรงงาน ขั้นต่ำ 50 ชิ้น)
 *
 *   node scripts/standee-clear-stopper-rate2.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-clear-stopper-rate2.mjs --write   # เขียนจริง
 *
 * ผู้ใช้แจ้ง 2 ก.ย. 69 พร้อมใบเสนอราคาจริง 3 บรรทัด:
 *   1 เซ็ต  (เรทปลีก)   = 140 + 20 + 10 (จุกใส) + ฐาน 3cm ฟรี = 170  ← เรทที่ 1 ช่วง 1-10 ✅ ตรงอยู่แล้ว
 *   11 เซ็ต (เรทส่งที่ 1) = 69 + 20 + 10 + ฐาน 10 = 109              ← เรทที่ 1 ช่วง 11-29 ✅ (แก้แล้วรอบก่อน)
 *   50 เซ็ต (เรทส่งที่ 2) = 55 + 20 + 10 + ฐาน 10 = 95               ← ต้องใช้ "เรทที่ 2" ที่ยังไม่มี
 * 55 มาจากตารางบล็อก "เรทที่ 2 (สั่งแบบ ไม่คละดีเทล)" ของ /pricestandy ช่วง 50-100 ชิ้น
 * (เรทที่ 1 ช่วง 50-199 คิด 60 — คนละตาราง จึงได้ 100 แทนที่จะเป็น 95)
 *
 * โครงเดียวกับ standy (id "rate-nomix") ที่ร้านใช้อยู่แล้ว:
 *   ขั้นต่ำ 50 ชิ้น · แต่ละดีเทลขั้นต่ำ 25 ชิ้น · 4 ช่วงจำนวน (50-100 · 101-199 · 200-4,999 · 5,000+)
 *
 * ⚠️ ตารางเรทที่ 2 เริ่มที่ 5cm — ตัวสแตนดี้ 3cm/4cm จึง "ไม่มีขายในเรทนี้"
 *    (ไม่ใส่คีย์ในตาราง = หน้าร้านซ่อนตัวเลือกนั้นเมื่ออยู่เรท 2 — กติกาเดียวกับ standy)
 * ⚠️ ค่าฐาน/ค่าสกรีน/ค่าอคล.พิเศษ ของบล็อกเรทที่ 2 เท่ากับเรทที่ 1 ทุกช่อง (ตรวจสดในสคริปต์)
 *    จึงใช้กลุ่มตัวเลือกชุดเดิมร่วมกันทั้งสองเรทได้ ไม่ต้องแยกกลุ่ม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy";
const ID = "new-mt1k6h3q-6601";
const NAME = "สแตนดี้อะคริลิค+จุกใส";

const BODY = "ขนาดตัวสแตนดี้ (แผ่นล่าง)";
const SCREEN = "งานสกรีน (แผ่นล่าง)";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";
const RATE_ID = "rate-nomix";
const RATE_LABEL = "เรทที่ 2 (สั่งแบบไม่คละดีเทล)";
const RATE_DESC =
  "ราคาส่งโรงงาน · สั่งขั้นต่ำ 50 ชิ้นขึ้นไป · ราคารวมแผ่นบน + จุกใส แล้ว (ค่าฐานคิดตามขนาดฐาน) · " +
  "คละลาย คละขนาดได้ แต่ละดีเทลขั้นต่ำ 25 ชิ้นขึ้นไป (ไม่ถึงตามจำนวน คิดตามเรทที่ 1)";
const MIN_QTY = 50;
const MIN_PER_DESIGN = 25;

const cm = (n) => `${n} ซม.`;
const STOPPER_FEE = 10;
/** ราคาแผ่นบนต่อชิ้น — คงที่ทุกช่วงจำนวน (ดู scripts/standee-clear-stopper-topplate-flat.mjs) */
const topPlatePrice = (size) => 20 + (size - 2) * 10;
/** ช่องตรวจจากใบเสนอราคา: ตัว 6cm · สกรีนใต้ · แผ่นบน 2cm · 50 ชิ้น = 55 + 10 + 20 = 85 (+ ฐาน 3cm 10 = 95) */
const SAMPLE = `6 ซม.│สกรีน 1 ด้าน (ใต้)│2 ซม.`;
const SAMPLE_FIRST = 85;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* ══ 1. อ่านตารางบล็อก "เรทที่ 2" สดจากเว็บ ═══════════════════════════ */
const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
if (!res.ok) throw new Error(`โหลด ${PAGE} ไม่ได้ — HTTP ${res.status}`);
const html = (await res.text()).replace(/\x00/g, ""); // กับดักเดิม: เซลล์ Wix มี NUL คั่นกลางคำ
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const r1 = html.indexOf("เรทที่ 1 (สั่งแบบคละดีเทล)");
const r2 = html.indexOf("เรทที่ 2 (สั่งแบบ ไม่คละดีเทล)");
if (r1 < 0 || r2 < 0 || r2 < r1) throw new Error("หาหัวข้อ เรทที่ 1 / เรทที่ 2 ในหน้าไม่เจอ — โครงหน้าเว็บเปลี่ยน");
const parse = (m) =>
  [...m[0].matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1])));
const raw = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)];
const T1 = raw.filter((m) => m.index > r1 && m.index < r2).map(parse);
const T2 = raw.filter((m) => m.index > r2).map(parse);

const find = (tables, pred, what) => {
  const t = tables.find((rows) => pred(rows.flat()));
  if (!t) throw new Error(`ไม่เจอตาราง ${what} — โครงหน้าเว็บเปลี่ยน ตรวจก่อน`);
  return t;
};
const spread = (head) => {
  const m = head.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) throw new Error(`หัวคอลัมน์อ่านไม่ออก: "${head}"`);
  const out = [];
  for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) out.push(s);
  return out;
};
const bySize = (rows) => {
  const heads = rows[0].slice(1);
  const out = {};
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    const map = {};
    heads.forEach((h, i) => {
      const v = Number(String(row[i + 1]).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(v)) throw new Error(`ค่าในตารางไม่ใช่ตัวเลข: "${row[0]}" คอลัมน์ "${h}"`);
      for (const s of spread(h)) map[s] = v;
    });
    out[row[0]] = map;
  }
  return out;
};

/* 1.1 ราคาแผ่นอะคริลิคของเรทที่ 2 */
const sheetRows = find(T2, (c) => c[0] === "จำนวน" && c.some((x) => /^50\s*-\s*100/.test(x)), "ราคาแผ่นอะคริลิค เรทที่ 2");
const TIER_LABELS = sheetRows.slice(1).map((r) => r[0]);
const tierUpTo = (label) => {
  const m = label.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (m) return Number(m[2].replace(/,/g, ""));
  if (/ขึ้นไป/.test(label)) return null;
  throw new Error(`อ่านช่วงจำนวนไม่ออก: "${label}"`);
};
/** จัดรูปตัวเลขให้มีคอมมาแบบเดียวกับ standy ("200-4,999 ชิ้น") */
const prettyTier = (label) => label.replace(/\d{4,}/g, (n) => Number(n).toLocaleString("en-US"));
const SHEET2 = {};
{
  const heads = sheetRows[0].slice(1);
  for (const [i, h] of heads.entries()) for (const s of spread(h)) SHEET2[s] = sheetRows.slice(1).map((r) => Number(r[i + 1]));
}

/* 1.2 ค่าสกรีน / ค่าฐาน / อคล.พิเศษ ของสองบล็อกต้องเท่ากัน — ไม่งั้นใช้กลุ่มตัวเลือกร่วมกันไม่ได้ */
const same = (pred, what) => {
  const a = bySize(find(T1, pred, `${what} (เรทที่ 1)`));
  const b = bySize(find(T2, pred, `${what} (เรทที่ 2)`));
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`ตาราง ${what} ของเรทที่ 1 กับเรทที่ 2 ไม่เท่ากันแล้ว — ต้องแยกกลุ่มตัวเลือกต่อเรท หยุดก่อน`);
  return b;
};
const screenTable = same((c) => c.includes("สกรีน 2 ด้าน") && c.includes("สกรีน 3 เลเยอร์"), "Add on งานสกรีน");
same((c) => c.includes("ไม่สกรีนฐาน") && c.includes("สกรีนฐาน"), "ราคาฐาน");
same((c) => c.some((x) => x.includes("อคล.พิเศษ")), "Add on อะคริลิคพิเศษ");
const WEB_2SIDE = screenTable["สกรีน 2 ด้าน"];

/* ══ 2. อ่านสินค้า + ดึงค่าสกรีนที่สินค้าคิดอยู่จริง (ครอบคลุม 17-20cm ที่เว็บไม่มี) ══ */
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} ตอนนี้เป็นสินค้า "${row.name}" ไม่ใช่ "${NAME}" — หยุดก่อน`);
const d = structuredClone(row.data);

const r1m = (d.priceRates ?? []).find((r) => /เรทที่ 1/.test(r.label))?.pricing;
if (!r1m) throw new Error("สินค้าไม่มีเรทที่ 1 แล้ว — ตรวจก่อน");
if (JSON.stringify(r1m.driverLabels) !== JSON.stringify([BODY, SCREEN, TOP]))
  throw new Error(`แกนตารางเปลี่ยนแล้ว: ${JSON.stringify(r1m.driverLabels)} — ตรวจก่อน`);
if ((d.priceRates ?? []).some((r) => r.id === RATE_ID || /เรทที่ 2/.test(r.label)))
  throw new Error("สินค้ามีเรทที่ 2 อยู่แล้ว — ไม่ต้องรันซ้ำ (ถ้าจะสร้างใหม่ ลบเรทเดิมก่อน)");

const groupOf = (label) => {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`สินค้าไม่มีกลุ่ม "${label}" แล้ว — ตรวจก่อน`);
  return g;
};
const SCREENS = groupOf(SCREEN).choices.map((c) => c.name);
const BASE_SCREEN = SCREENS.find((n) => /^สกรีน 1 ด้าน \(ใต้\)/.test(n));
const TWO_SIDE = SCREENS.filter((n) => /2 ด้าน/.test(n));
if (!BASE_SCREEN || !TWO_SIDE.length) throw new Error(`กลุ่ม "${SCREEN}" เปลี่ยนโครงแล้ว (${SCREENS.join(" · ")}) — ตรวจก่อน`);
const BODY_SIZES = groupOf(BODY).choices.map((c) => parseInt(c.name, 10));
const TOP_SIZES = groupOf(TOP).choices.map((c) => parseInt(c.name, 10));

/**
 * ค่าสกรีน 2 ด้านของแต่ละขนาด — เว็บมีถึง 16cm เท่านั้น
 * ที่เหลือถอดกลับจากตารางเรทที่ 1 ของสินค้าเอง: (2 ด้าน − 1 ด้าน) ที่แผ่นบน 2cm = SF[body] + SF[2]
 */
const SF = {};
const SF2 = WEB_2SIDE[2];
if (!Number.isFinite(SF2)) throw new Error("ตารางเว็บไม่มีค่าสกรีนของขนาด 2cm — ตรวจก่อน");
for (const s of new Set([...BODY_SIZES, ...TOP_SIZES])) {
  if (WEB_2SIDE[s] !== undefined) {
    SF[s] = WEB_2SIDE[s];
    continue;
  }
  const one = r1m.cells[`${cm(s)}│${BASE_SCREEN}│${cm(2)}`];
  const two = r1m.cells[`${cm(s)}│${TWO_SIDE[0]}│${cm(2)}`];
  if (!one || !two) throw new Error(`ถอดค่าสกรีนขนาด ${s}cm จากเรทที่ 1 ไม่ได้ — ไม่มีช่องราคา`);
  SF[s] = two[0] - one[0] - SF2;
}
/* กันเหนียว: ค่าที่ถอดมาต้องอธิบายตารางเรทที่ 1 ได้ครบทุกช่อง */
for (const b of BODY_SIZES)
  for (const t of TOP_SIZES)
    for (const sc of TWO_SIDE) {
      const got = r1m.cells[`${cm(b)}│${sc}│${cm(t)}`][0] - r1m.cells[`${cm(b)}│${BASE_SCREEN}│${cm(t)}`][0];
      if (got !== SF[b] + SF[t])
        throw new Error(`ค่าสกรีนไม่ลงตัวที่ ตัว ${b}cm · บน ${t}cm (เรทที่ 1 ต่าง ${got} · คำนวณได้ ${SF[b] + SF[t]}) — ตรวจก่อน`);
    }

/* ══ 3. สร้างตารางเรทที่ 2 ══════════════════════════════════════════ */
const SIZES2 = BODY_SIZES.filter((s) => SHEET2[s]);
const DROPPED = BODY_SIZES.filter((s) => !SHEET2[s]);
if (!SIZES2.length) throw new Error("ตารางเรทที่ 2 ไม่มีขนาดที่สินค้านี้ขายเลย — ตรวจก่อน");
for (const s of SIZES2)
  if (SHEET2[s].some((n) => !Number.isFinite(n))) throw new Error(`ตารางเรทที่ 2 ขนาด ${s}cm มีค่าไม่ใช่ตัวเลข — ตรวจก่อน`);

const cells = {};
for (const b of SIZES2)
  for (const sc of SCREENS) {
    const twoSide = TWO_SIDE.includes(sc);
    for (const t of TOP_SIZES)
      cells[`${cm(b)}│${sc}│${cm(t)}`] = SHEET2[b].map(
        (p) => p + (twoSide ? SF[b] : 0) + STOPPER_FEE + topPlatePrice(t) + (twoSide ? SF[t] : 0)
      );
  }

const rate2 = {
  id: RATE_ID,
  label: RATE_LABEL,
  desc: RATE_DESC,
  minQty: MIN_QTY,
  minPerDesign: MIN_PER_DESIGN,
  pricing: {
    unit: r1m.unit ?? "ชิ้น",
    driverLabels: [BODY, SCREEN, TOP],
    tiers: TIER_LABELS.map((label) => ({ upTo: tierUpTo(label), label: prettyTier(label) })),
    cells,
  },
};
d.priceRates = [...d.priceRates, rate2];
const all = [d.pricing, ...d.priceRates.map((r) => r.pricing)].flatMap((m) => Object.values(m.cells).flat());
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

/* ══ 4. รายงาน + ตรวจกับใบเสนอราคา ═════════════════════════════════ */
console.log(`📦 ${NAME} (${ID})`);
console.log(`   เรทใหม่: ${RATE_LABEL} · ขั้นต่ำ ${MIN_QTY} ชิ้น · ลายละ ${MIN_PER_DESIGN} ชิ้น`);
console.log(`   ช่วงจำนวน: ${rate2.pricing.tiers.map((t) => t.label).join(" · ")}`);
console.log(`   ขนาดตัวสแตนดี้ที่ขายในเรทนี้: ${SIZES2.join(",")} cm` + (DROPPED.length ? `  (ไม่มีในเรทนี้: ${DROPPED.join(",")} cm)` : ""));
console.log(`   ตาราง ${Object.keys(cells).length} ช่อง × ${TIER_LABELS.length} ช่วงจำนวน`);
console.log(`   ช่วงราคาสินค้า: ${row.data.priceMin}-${row.data.priceMax} → ${d.priceMin}-${d.priceMax}`);
if (cells[SAMPLE]?.[0] !== SAMPLE_FIRST)
  throw new Error(`ช่องตรวจ "${SAMPLE}" ได้ ${cells[SAMPLE]?.[0]} ไม่ใช่ ${SAMPLE_FIRST} — หยุดก่อน`);
console.log(`\n   ตัวอย่าง ${SAMPLE}: ${cells[SAMPLE].join(" · ")}`);
console.log(`   ✅ 50 ชิ้น: ตัว ${SHEET2[6][0]} + แผ่นบน ${topPlatePrice(2)} + จุกใส ${STOPPER_FEE} = ${SAMPLE_FIRST} · + ฐาน 3cm 10 = ${SAMPLE_FIRST + 10} บาท/ชิ้น (ตรงใบเสนอราคา)`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d, price: d.priceMin }).eq("id", ID);
if (e2) throw new Error(`บันทึกไม่ได้ — ${e2.message}`);
console.log("\n💾 บันทึกแล้ว");

#!/usr/bin/env node
/**
 * สร้างสินค้า "สแตนดี้อะคริลิค+จุกใส" (ร่าง id: new-mt1k6h3q-6601) จากตารางราคาสดของเว็บ
 *
 *   node scripts/standee-clear-stopper-art.mjs --upload    # 1) วาด + อัปภาพจำลองตัวเลือก
 *   node scripts/standee-clear-stopper-build.mjs           # 2) ดูก่อน (ไม่เขียน) — โชว์ราคาตัวอย่าง
 *   node scripts/standee-clear-stopper-build.mjs --write   # 3) บันทึกจริง (ยังเป็นฉบับร่าง)
 *
 * ผู้ใช้สั่ง 1 ก.ย. 69: "เรทที่ 1 (สั่งแบบคละดีเทล) ทำคล้าย ๆ ที่ทำกับ พวงกุญแจ+จุกใส
 * แต่เพิ่มฐานเข้ามาเหมือนสแตนดี้" → โครงสินค้าจึงเป็น
 *
 *   โครงราคา = พวงกุญแจ+จุกใส (keyring-clear-stopper) — ตาราง 3 แกน
 *              ขนาดตัวสแตนดี้ (แผ่นล่าง) × งานสกรีน (แผ่นล่าง) × ขนาดแผ่นบน (อะคริลิคใส)
 *   ฐาน       = ระบบฐานสแตนดี้ชุดกลางของ standy (ฐานสแตนดี้ · ขนาดฐาน · ทรงฐาน · สีอะคริลิคฐาน + เฉด ×19)
 *
 * ที่มาราคา (https://www.iduckyofficial-pricelists.com/pricestandy · อ่านสดทุกครั้งที่รัน):
 *   ตารางบล็อก "เรทที่ 1 (สั่งแบบคละดีเทล)" 4 ตาราง
 *     1) ราคาแผ่นอะคริลิค 3-20cm × 6 ช่วงจำนวน          → ราคาตัวสแตนดี้
 *     2) ราคาฐาน (ไม่สกรีนฐาน/สกรีนฐาน)                  → ตรวจว่าตรงกับกลุ่มฐานของ standy ที่โคลนมา
 *     3) Add on งานสกรีน (2 ด้าน / 3-4 เลเยอร์) 2-16cm    → ค่าสกรีน คิดทั้งแผ่นล่างและแผ่นบน
 *     4) Add on อคล.พิเศษ (ปลีก/ส่ง) 2-20cm               → +฿ ของกลุ่มเฉดสีพิเศษ
 *   ค่าสกรีน 17-20cm ไม่มีในตาราง — ยึดตามที่ standy คิดอยู่จริง (สินค้าที่ร้านใช้งานแล้ว)
 *
 * ราคา/ชิ้น = ราคาแผ่นล่างตามขนาด + ค่าสกรีนของแผ่นล่าง + จุกใส 10 บาท
 *             + ค่าแผ่นบนตามขนาด (20/15/12 + เซนละ 10 จาก 2 ซม.) + ค่าสกรีนของแผ่นบนตามขนาดแผ่นบน
 *   (สูตรแผ่นบน = ของพวงกุญแจ+จุกใส เป๊ะ ๆ ดู scripts/keyring-stopper-top-plate.mjs)
 *   ค่าฐานคิดแยกที่กลุ่ม "ขนาดฐาน" (extraFromQty 11 · extraBelow ช่วงปลีก) เหมือน standy ทุกประการ
 *
 * ⚠️ สคริปต์นี้ "เขียนทับทั้งก้อน" ของสินค้าร่างตัวนี้ — ถ้าต่อไปมีการแก้ในหน้าแอดมินแล้วรันซ้ำ ของที่แก้จะหาย
 *    (มี guard: ถ้า id ไปตรงกับสินค้าชื่ออื่นจะไม่ยอมเขียน)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy";
const ID = "new-mt1k6h3q-6601";
const NAME = "สแตนดี้อะคริลิค+จุกใส";
const STANDY = "standy"; // ต้นแบบระบบฐาน
const KEYRING = "keyring-clear-stopper"; // ต้นแบบโครงราคา 2 แผ่น + จุกใส

/* ชื่อกลุ่มตัวเลือก (แกนตารางราคา 3 ตัวแรก) */
const BODY = "ขนาดตัวสแตนดี้ (แผ่นล่าง)";
const SCREEN = "งานสกรีน (แผ่นล่าง)";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";
const TOP_SCREEN = "งานสกรีน (แผ่นบน)";
const COLOR = "สีอะคริลิค (แผ่นล่าง)";
const SPECIAL = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";
const C02 = "อะคริลิคขาวขุ่น C-02";
const CLEAR = "อะคริลิคใส";
/** กลุ่มฐานชุดกลางที่โคลนจาก standy (ตามลำดับที่ผู้ใช้จัดไว้: เรื่องตัวก่อน แล้วเรื่องฐานทั้งยวง) */
const BASE_GROUPS = ["ฐานสแตนดี้", "ขนาดฐาน", "ทรงฐาน", "สีอะคริลิคฐาน"];
const ACCESSORY = "อุปกรณ์เสริม";

const BODY_SIZES = Array.from({ length: 18 }, (_, i) => i + 3); // 3-20 ซม.
const TOP_SIZES = Array.from({ length: 9 }, (_, i) => i + 2); // 2-10 ซม.
const cm = (n) => `${n} ซม.`;
/** ค่าจุกใส (หน้าเว็บ: "เพิ่มจุกยางหมุนได้ ชุดละ 10 บาท") — รวมในราคาที่แสดงเลย */
const STOPPER_FEE = 10;
/** ราคาแผ่นบนต่อชิ้น ตามขนาด × index ของช่วงจำนวน (0 = 1-10 · 1 = 11-29 · 2+ = 30 ขึ้นไป) */
const topPlatePrice = (size, tierIdx) => (tierIdx === 0 ? 20 : tierIdx === 1 ? 15 : 12) + (size - 2) * 10;

/* ภาพจำลอง — ชุดเดียวกับ standee-clear-stopper-art.mjs */
const FOLDER = "standee-clear-stopper";
const REV = "v1";

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
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${FOLDER}/optart-${name}-${REV}.jpg`;
const HOWTO = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/acrylic-howto/howto-print-v1.jpg`;

/* ══ 1. อ่านตารางราคาสดจากเว็บ ══════════════════════════════════════════ */
const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
if (!res.ok) throw new Error(`โหลด ${PAGE} ไม่ได้ — HTTP ${res.status}`);
const html = (await res.text()).replace(/\x00/g, ""); // กับดักเดิม: เซลล์ Wix มี NUL คั่นกลางคำ
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** ขอบเขตของบล็อก "เรทที่ 1" — หน้านี้มีตารางหน้าตาเหมือนกันของเรทที่ 2 ต่อท้ายอีกชุด */
const r1 = html.indexOf("เรทที่ 1 (สั่งแบบคละดีเทล)");
const r2 = html.indexOf("เรทที่ 2 (สั่งแบบ ไม่คละดีเทล)");
if (r1 < 0 || r2 < 0 || r2 < r1) throw new Error("หาหัวข้อ เรทที่ 1 / เรทที่ 2 ในหน้าไม่เจอ — โครงหน้าเว็บเปลี่ยน");
const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)]
  .filter((m) => m.index > r1 && m.index < r2)
  .map((m) => [...m[0].matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))));

const findTable = (pred, what) => {
  const t = tables.find((rows) => pred(rows.flat()));
  if (!t) throw new Error(`ไม่เจอตาราง ${what} ในบล็อกเรทที่ 1 — โครงหน้าเว็บเปลี่ยน ตรวจก่อน`);
  return t;
};
/** หัวคอลัมน์ "3cm"/"8"/"3-5cm" → กางเป็นเลขขนาดทีละเซนติเมตร */
const spread = (head) => {
  const m = head.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) throw new Error(`หัวคอลัมน์อ่านไม่ออก: "${head}"`);
  const out = [];
  for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) out.push(s);
  return out;
};
/** ตารางที่แถวแรกเป็นหัวขนาด แถวถัดไปเป็นค่า → { ชื่อแถว: { ขนาด: ค่า } } */
const bySize = (rows) => {
  const heads = rows[0].slice(1);
  const out = {};
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    const map = {};
    heads.forEach((h, i) => {
      const v = Number(String(row[i + 1]).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(v)) throw new Error(`ค่าในตารางไม่ใช่ตัวเลข: "${row[0]}" คอลัมน์ "${h}" = "${row[i + 1]}"`);
      for (const s of spread(h)) map[s] = v;
    });
    out[row[0]] = map;
  }
  return out;
};

/* 1.1 ราคาแผ่นอะคริลิค (ตัวสแตนดี้) — แถว = ช่วงจำนวน */
const sheetRows = findTable((c) => c[0] === "จำนวน" && c.includes("1-10 ชิ้น"), "ราคาแผ่นอะคริลิค เรทที่ 1");
const TIERS = sheetRows.slice(1).map((r) => r[0]);
const tierUpTo = (label) => {
  const m = label.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (m) return Number(m[2].replace(/,/g, ""));
  if (/ขึ้นไป/.test(label)) return null;
  throw new Error(`อ่านช่วงจำนวนไม่ออก: "${label}"`);
};
const SHEET = {}; // ขนาด → ราคาต่อชิ้นเรียงตามช่วงจำนวน
{
  const heads = sheetRows[0].slice(1);
  for (const [i, h] of heads.entries())
    for (const s of spread(h)) SHEET[s] = sheetRows.slice(1).map((r) => Number(r[i + 1]));
}
for (const s of BODY_SIZES)
  if (!SHEET[s] || SHEET[s].some((n) => !Number.isFinite(n)))
    throw new Error(`ตารางราคาไม่มีขนาด ${s}cm ครบทุกช่วงจำนวน — ตรวจหน้าเว็บ`);

/* 1.2 Add on งานสกรีน (คิดตามขนาดของ "แผ่นนั้น ๆ") */
const screenTable = bySize(findTable((c) => c.includes("สกรีน 2 ด้าน") && c.includes("สกรีน 3 เลเยอร์"), "Add on งานสกรีน"));
const WEB_2SIDE = screenTable["สกรีน 2 ด้าน"];

/* 1.3 Add on อะคริลิคพิเศษ (ปลีก/ส่ง) */
const specialTable = bySize(findTable((c) => c.some((x) => x.includes("อคล.พิเศษ")), "Add on อะคริลิคพิเศษ"));
const rowLike = (t, kw) => {
  const k = Object.keys(t).find((n) => n.includes(kw));
  if (!k) throw new Error(`ไม่เจอแถว "${kw}" ในตาราง Add on อะคริลิคพิเศษ`);
  return t[k];
};
const SPECIAL_RETAIL = rowLike(specialTable, "ปลีก");
const SPECIAL_WHOLESALE = rowLike(specialTable, "ส่ง");

/* 1.4 ราคาฐาน — ไว้ตรวจว่ากลุ่มฐานที่โคลนจาก standy ยังตรงกับเว็บ */
const baseTable = bySize(findTable((c) => c.includes("ไม่สกรีนฐาน") && c.includes("สกรีนฐาน"), "ราคาฐาน สแตนดี้"));
const BASE_PLAIN = baseTable["ไม่สกรีนฐาน"];
const BASE_PRINT = baseTable["สกรีนฐาน"];

console.log(`📄 อ่านตารางสดแล้ว — ช่วงจำนวน: ${TIERS.join(" · ")}`);
console.log(`   ตัวสแตนดี้ 3-20cm (ช่วงแรก) : ${BODY_SIZES.map((s) => SHEET[s][0]).join(",")}`);
console.log(`   สกรีน 2 ด้าน 2-16cm         : ${Object.keys(WEB_2SIDE).map((s) => WEB_2SIDE[s]).join(",")}`);
console.log(`   อคล.พิเศษ ปลีก/ส่ง ที่ 3cm  : ${SPECIAL_RETAIL[3]}/${SPECIAL_WHOLESALE[3]} · ที่ 20cm: ${SPECIAL_RETAIL[20]}/${SPECIAL_WHOLESALE[20]}`);

/* ══ 2. อ่านสินค้าต้นแบบ (standy = ฐาน · keyring = โครง 2 แผ่น) ═══════════ */
const load = async (id) => {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw new Error(`อ่าน ${id} ไม่ได้ — ${error.message}`);
  return structuredClone(data.data);
};
const st = await load(STANDY);
const kr = await load(KEYRING);
const groupOf = (d, label, who) => {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`${who} ไม่มีกลุ่ม "${label}" แล้ว — โครงสินค้าต้นแบบเปลี่ยน ตรวจก่อน`);
  return structuredClone(g);
};

/* 2.1 ค่าสกรีน: ยึดตามที่ standy คิดจริง (ครอบคลุม 3-20cm) แล้ว assert กับตารางเว็บช่วงที่ทับกัน */
const stMatrix = (st.priceRates ?? []).find((r) => /เรทที่ 1/.test(r.label))?.pricing;
if (!stMatrix) throw new Error("standy ไม่มีเรทที่ 1 แล้ว — ตรวจก่อน");
const stCell = (size, screen) => stMatrix.cells[`${size}cm│${screen}│${CLEAR}`];
const SCREEN_FEE = {}; // ขนาด → ค่าสกรีน 2 ด้าน
for (const s of BODY_SIZES) {
  const base = stCell(s, "สกรีน 1 ด้าน (ใต้)");
  const two = stCell(s, "สกรีน 2 ด้าน (บน-บน)");
  if (!base || !two) throw new Error(`standy ไม่มีช่องราคาขนาด ${s}cm แล้ว — ตรวจก่อน`);
  if (base[0] !== SHEET[s][0])
    throw new Error(`ราคาเว็บกับ standy ไม่ตรงที่ ${s}cm (เว็บ ${SHEET[s][0]} · standy ${base[0]}) — ตรวจก่อนเขียน`);
  const diffs = new Set(two.map((v, i) => v - base[i]));
  if (diffs.size !== 1) throw new Error(`ค่าสกรีน 2 ด้านของ standy ที่ ${s}cm ไม่คงที่ทุกช่วงจำนวน — ตรวจก่อน`);
  SCREEN_FEE[s] = [...diffs][0];
  if (WEB_2SIDE[s] !== undefined && WEB_2SIDE[s] !== SCREEN_FEE[s])
    throw new Error(`ค่าสกรีน 2 ด้าน ${s}cm เว็บ ${WEB_2SIDE[s]} ≠ standy ${SCREEN_FEE[s]} — ตรวจก่อนเขียน`);
}
for (const s of TOP_SIZES) {
  if (WEB_2SIDE[s] === undefined) throw new Error(`ตารางเว็บไม่มีค่าสกรีนของขนาด ${s}cm (แผ่นบน) — ตรวจก่อน`);
  SCREEN_FEE[s] = WEB_2SIDE[s]; // แผ่นบนเล็กสุด 2cm ซึ่ง standy ไม่มี
}

/* 2.2 กลุ่มฐานของ standy — ตรวจว่ายังตรงกับตารางราคาฐานบนเว็บ ก่อนโคลนมาใช้ */
const baseSize = groupOf(st, "ขนาดฐาน", "standy");
for (const c of baseSize.choices) {
  const n = parseInt(c.name, 10);
  const web = BASE_PLAIN[n] ?? BASE_PLAIN[3]; // ฐาน 2cm ใช้เรทช่วง 3-5cm (ตรรกะเดิมของ standy)
  if (c.extra !== web) throw new Error(`ขนาดฐาน ${c.name}: standy คิด ${c.extra} · เว็บ ${web} — ตรวจก่อนโคลน`);
}
const basePlate = groupOf(st, "ฐานสแตนดี้", "standy");
const printFee = basePlate.choices.find((c) => c.name === "สกรีนฐาน")?.extra;
const webPrintFee = new Set(Object.keys(BASE_PRINT).map((s) => BASE_PRINT[s] - BASE_PLAIN[s]));
if (webPrintFee.size !== 1 || printFee !== [...webPrintFee][0])
  throw new Error(`ค่าสกรีนฐาน standy ${printFee} ไม่ตรงกับเว็บ (${[...webPrintFee].join(",")}) — ตรวจก่อน`);

/* 2.3 กลุ่มเฉดสีพิเศษของฐาน (19 กลุ่ม) + อุปกรณ์เสริม — โคลนทั้งยวง */
const baseShadeGroups = (st.options ?? []).filter((o) => o.showWhen?.label === "ขนาดฐาน").map((o) => structuredClone(o));
if (baseShadeGroups.length !== baseSize.choices.length)
  throw new Error(`กลุ่มเฉดสีของฐาน ${baseShadeGroups.length} กลุ่ม ≠ ขนาดฐาน ${baseSize.choices.length} ขนาด — ตรวจก่อน`);
const accessory = groupOf(st, ACCESSORY, "standy");

/* 2.4 โครง 2 แผ่นจากพวงกุญแจ+จุกใส: ตัวเลือกงานสกรีน + ชุดสีอะคริลิค */
const krScreen = groupOf(kr, SCREEN, "พวงกุญแจ+จุกใส");
const krTopScreen = groupOf(kr, TOP_SCREEN, "พวงกุญแจ+จุกใส");
const krColor = groupOf(kr, COLOR, "พวงกุญแจ+จุกใส");
/** ชุดเฉด 44 สี (พร้อมภาพชุดกลาง) — ยกจากกลุ่มเฉดของพวงกุญแจ แล้วเปลี่ยนแค่ +฿ ตามขนาด */
const krShade = (kr.options ?? []).find((o) => o.showWhenAlso?.label === COLOR);
if (!krShade) throw new Error("พวงกุญแจ+จุกใส ไม่มีกลุ่มเฉดสีพิเศษแล้ว — ตรวจก่อน");
const SHADES = krShade.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
/** รายชื่อเฉด "เนื้อทึบ" ที่ต้องล็อกให้สกรีนได้เฉพาะผิวบน (กติกาเดียวกับทั้งร้าน) */
const isTransparent = (n) =>
  /^อะคริลิ(ค)?ใส$/.test(n) || n.startsWith("อะคริลิคกลิตเตอร์-") || (n.startsWith("hologram-") && n !== "hologram-01");
const OPAQUE = SHADES.map((c) => c.name).filter((n) => !isTransparent(n));
const TOP_ONLY = krScreen.choices.map((c) => c.name).filter((n) => /\(บน\)|\(บน-บน\)/.test(n));
if (TOP_ONLY.length !== 2) throw new Error(`กลุ่มงานสกรีนของพวงกุญแจเปลี่ยนโครง (เจอ "ผิวบน" ${TOP_ONLY.length} แบบ) — ตรวจก่อน`);

/* ══ 3. ตารางราคา 3 แกน ═════════════════════════════════════════════════ */
const cells = {};
for (const b of BODY_SIZES)
  for (const sc of krScreen.choices) {
    const twoSide = /2 ด้าน/.test(sc.name);
    for (const t of TOP_SIZES)
      cells[`${cm(b)}│${sc.name}│${cm(t)}`] = SHEET[b].map(
        (p, i) =>
          p +
          (twoSide ? SCREEN_FEE[b] : 0) + // ค่าสกรีนแผ่นล่าง ตามขนาดแผ่นล่าง
          STOPPER_FEE +
          topPlatePrice(t, i) +
          (twoSide ? SCREEN_FEE[t] : 0) // ค่าสกรีนแผ่นบน ตามขนาดแผ่นบน
      );
  }
const PRICING = {
  unit: "ชิ้น",
  driverLabels: [BODY, SCREEN, TOP],
  tiers: TIERS.map((label) => ({ upTo: tierUpTo(label), label })),
  cells,
};
const all = Object.values(cells).flat();
const PRICE_MIN = Math.min(...all);
const PRICE_MAX = Math.max(...all);

/* ══ 4. กลุ่มตัวเลือก ═══════════════════════════════════════════════════ */
/** กลุ่มเฉดสีพิเศษของ "ตัวสแตนดี้" — +฿ ต่างกันตามขนาด จึงต้องแยกกลุ่มต่อขนาดแล้วโชว์ด้วย showWhen */
const bodyShadeGroups = BODY_SIZES.map((s) => {
  const retail = SPECIAL_RETAIL[s];
  const wholesale = SPECIAL_WHOLESALE[s];
  if (!Number.isFinite(retail) || !Number.isFinite(wholesale))
    throw new Error(`ตาราง Add on อะคริลิคพิเศษ ไม่มีขนาด ${s}cm — ตรวจก่อน`);
  return {
    label:
      retail === wholesale
        ? `เลือกสีพิเศษ (ตัวสแตนดี้ ${s} ซม. · +${wholesale} บาท/ชิ้น)`
        : `เลือกสีพิเศษ (ตัวสแตนดี้ ${s} ซม. · 1-10 ชิ้น +${retail} · 11 ชิ้นขึ้นไป +${wholesale} บาท/ชิ้น)`,
    display: "dropdown",
    stockBearing: true,
    showWhen: { label: BODY, choices: [cm(s)] },
    showWhenAlso: { label: COLOR, choices: [SPECIAL] },
    ...(retail === wholesale ? {} : { smallQtyFee: { fee: retail, upToQty: 10 } }),
    choices: SHADES.map((c) => ({ ...c, extra: wholesale })),
  };
});

const options = [
  /* ── เรื่อง "ตัวงาน" ── */
  {
    label: BODY,
    stockBearing: true,
    display: "dropdown",
    note: "ชิ้นหลักที่สกรีนลาย — วัดจากด้านที่ยาวที่สุด (ไม่นับฐาน)",
    choices: BODY_SIZES.map((s) => ({ name: cm(s), imageSrc: IMG(`body-${s}`) })),
  },
  { ...krScreen, label: SCREEN, display: "cards" },
  {
    label: TOP,
    stockBearing: true,
    display: "dropdown",
    note: "งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ — แผ่นบนใสประกบด้วยจุกใส หมุน/ขยับได้ (ราคารวมแล้ว)",
    choices: TOP_SIZES.map((s) => ({ name: cm(s), imageSrc: IMG(`top-${s}`) })),
  },
  {
    ...krTopScreen,
    label: TOP_SCREEN,
    display: "cards",
    note: "แผ่นบนสกรีนได้ 1 ด้าน — เลือกสกรีนผิวใต้หรือผิวบน (อะคริลิคใส · ไม่มีค่าสกรีนเพิ่ม)",
  },
  { ...krColor, label: COLOR, display: "cards" },
  ...bodyShadeGroups,
  /* ── เรื่อง "ฐาน" ทั้งยวง (ชุดกลางจาก standy) ── */
  ...BASE_GROUPS.map((label) => groupOf(st, label, "standy")),
  ...baseShadeGroups,
  { ...accessory, collapsible: true },
];

/* กฎ: เนื้อทึบสกรีนใต้ไม่ได้ (ยิงจากกลุ่มประเภท C-02 + ทุกกลุ่มเฉดทึบของตัวสแตนดี้) */
const rules = [
  { when: { label: COLOR, choice: C02, choices: [C02] }, limit: { label: SCREEN, allow: TOP_ONLY } },
  ...bodyShadeGroups.map((g) => ({
    when: { label: g.label, choice: OPAQUE[0], choices: OPAQUE },
    limit: { label: SCREEN, allow: TOP_ONLY },
  })),
];

/* ══ 5. เนื้อหาหน้าสินค้า ═══════════════════════════════════════════════ */
const money = (n) => n.toLocaleString("th-TH");
const sample = (b, s, t, i) => cells[`${cm(b)}│${s}│${cm(t)}`][i];
const tabByTitle = (d, title) => (d.tabs ?? []).find((t) => t.title === title);
const warranty = tabByTitle(kr, "การรับประกันสินค้า");
if (!warranty) throw new Error("พวงกุญแจ+จุกใส ไม่มีแท็บการรับประกันสินค้าแล้ว — ตรวจก่อน");

const TABS = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      `${NAME} — สแตนดี้อะคริลิคสกรีนลายตามสั่ง ประกอบจากอะคริลิค 2 ชิ้นที่ยึดกันด้วย "จุกใส" ` +
      "แผ่นบนจึงหมุน/ขยับรอบจุกได้ แล้วเสียบลงฐานสแตนดี้ตั้งโชว์ได้เลย\n" +
      "• งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ — ตัวสแตนดี้ (แผ่นล่าง) + แผ่นบนอะคริลิคใส\n" +
      "• เลือกขนาดแผ่นบนแยกจากตัวสแตนดี้ได้ 2-10 ซม. (ราคารวมอยู่ในที่แสดงแล้ว)\n" +
      `• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ ${STOPPER_FEE} บาท) และรวมฐานสแตนดี้แล้ว\n` +
      "• อะคริลิคใส / ขาวขุ่น C-02 หนา 3 มม. ไดคัทตามลาย พิมพ์ระบบ UV Printing\n" +
      "• ตัวสแตนดี้ทำได้ 3-20 ซม. (วัดจากด้านที่ยาวที่สุด ไม่นับฐาน)\n" +
      "• เลือกฐานได้ทั้งขนาด 2-20 ซม. · ทรงกลม/สี่เหลี่ยม/ไดคัทตามทรง · สีอะคริลิคของฐาน\n" +
      "• อะคริลิคสีพิเศษกว่า 40 เฉด (สี/กลิตเตอร์/โฮโลแกรม) ระบบบวกราคาตามขนาดให้อัตโนมัติ\n" +
      "• 1-10 ชิ้น เรทราคาปลีก คละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป",
  },
  {
    title: "จุกใส + แผ่นบน",
    text:
      "จุกใสคืออะไร::\n" +
      "• จุกยาง/ซิลิโคนใส สวมในรูเจาะ ยึดอะคริลิค 2 แผ่นเข้าด้วยกันแทนหมุดหรือห่วงเหล็ก\n" +
      "• แผ่นบนหมุน/ขยับรอบจุกได้ — เล่นมุกลายซ้อนลาย เปลี่ยนหน้า/เปลี่ยนท่าได้\n" +
      "• กันรูเจาะสึกหรือบิ่น และเป็นสีใสจึงไม่บังลาย ใช้ได้กับอะคริลิคทุกสี\n" +
      `• ค่าจุกใสชุดละ ${STOPPER_FEE} บาท รวมอยู่ในราคาที่แสดงแล้ว (ไม่ต้องบวกเอง)\n\n` +
      "แผ่นบน (ชิ้นที่ 2)::\n" +
      "• เป็นอะคริลิคใสอย่างเดียว เลือกสีไม่ได้ · สกรีนได้ 1 ด้าน (เลือกผิวใต้/ผิวบน ไม่มีค่าสกรีนเพิ่ม)\n" +
      "• เลือกขนาดแยกจากตัวสแตนดี้ได้ 2-10 ซม. — ราคารวมอยู่ในตารางแล้ว\n" +
      "• ขนาด 2 ซม. = 20 บาท (1-10 ชิ้น) · 15 บาท (11-29) · 12 บาท (30 ชิ้นขึ้นไป) ต่อชิ้น\n" +
      "• 3 ซม. ขึ้นไปบวกเพิ่มเซนติเมตรละ 10 บาท (5 ซม. = 50/45/42 · 10 ซม. = 100/95/92)\n" +
      "• เลือกสกรีน 2 ด้าน ระบบคิดค่าสกรีนให้ทั้งแผ่นล่างและแผ่นบนตามขนาดของแต่ละแผ่น",
    images: [IMG("parts"), IMG("stopper")],
    imageSize: "md",
  },
  {
    title: "ขนาดและงานสกรีน",
    text:
      "ขนาดชิ้นงาน::\n" +
      "• ตัวสแตนดี้ 3-20 ซม. · แผ่นบน 2-10 ซม. (วัดจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง)\n" +
      "• อะคริลิคหนา 3 มม. · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n" +
      "• ขนาดที่สั่งไม่นับรวมฐาน — ฐานเลือกขนาดแยกในช่อง 'ขนาดฐาน'\n\n" +
      "งานสกรีน (เลือกให้แผ่นล่าง)::\n" +
      "• สกรีน 1 ด้าน (ใต้ / บน) — ราคามาตรฐานตามตาราง\n" +
      `• สกรีน 2 ด้าน (ใต้-บน / บน-บน) — บวกตามขนาด: 3-5 ซม. +${SCREEN_FEE[3]} · 6-7 ซม. +${SCREEN_FEE[6]} · 8-10 ซม. +${SCREEN_FEE[8]} · ใหญ่กว่านั้นดูตารางราคา\n` +
      "• เนื้อทึบ (ขาวขุ่น C-02 · สีพิเศษ · กระจก · hologram-01) สกรีนใต้ไม่ได้ ระบบจะเหลือเฉพาะสกรีนผิวบนให้\n" +
      "• ระบบรวมค่าสกรีนไว้ในตารางราคาแล้ว เลือกแล้วเห็นราคาจริงทันที",
    images: [HOWTO],
    imageSize: "lg",
  },
  {
    title: "ฐานสแตนดี้",
    text:
      "ฐานรวมอยู่ในราคาแล้ว::\n" +
      "• ทุกชิ้นได้ฐานอะคริลิค เลือกได้ว่าจะสกรีนลายลงฐานด้วยหรือไม่ (สกรีนฐาน +" +
      `${printFee} บาท/ชิ้น)\n` +
      "• ขนาดฐาน 2-20 ซม. — ช่วงราคาปลีก 1-10 ชิ้น ฐานเล็ก (ไม่เกิน 6 ซม.) รวมในราคาแล้ว\n" +
      `• ตั้งแต่ 11 ชิ้นขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. +${BASE_PLAIN[3]} · 8 ซม. +${BASE_PLAIN[8]} · 20 ซม. +${BASE_PLAIN[20]} บาท/ชิ้น\n` +
      "• ทรงฐาน: ทรงกลม / ทรงสี่เหลี่ยม (ไม่บวกเพิ่ม) · ทรงพิเศษไดคัทตามทรง (บวกเพิ่ม)\n" +
      "• สีอะคริลิคของฐานเลือกแยกจากตัวสแตนดี้ได้ รวมถึงเฉดพิเศษ (คิดเพิ่มตามขนาดฐาน)",
  },
  {
    title: "ชนิดอะคริลิค",
    text:
      "อะคริลิคใส / ขาวขุ่น C-02 (มาตรฐาน)::\n" +
      "• ราคาตามตารางคืออะคริลิคใส หรือขาวขุ่น C-02 หนา 3 มม. ราคาเท่ากัน เลือกได้ในหน้าสั่งซื้อ\n" +
      "• อะคริลิคใส = เนื้อใสมองทะลุ · ขาวขุ่น C-02 = เนื้อทึบ ลายเด่นกว่าเพราะไม่มีพื้นหลังทะลุมา\n\n" +
      "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)::\n" +
      `• ช่วง 1-10 ชิ้น +${SPECIAL_RETAIL[3]} บาท/ชิ้นทุกขนาดถึง 10 ซม.\n` +
      `• ตั้งแต่ 11 ชิ้นขึ้นไป: 3-5 ซม. +${SPECIAL_WHOLESALE[3]} · 6-8 ซม. +${SPECIAL_WHOLESALE[6]} · 9-10 ซม. +${SPECIAL_WHOLESALE[9]} บาท/ชิ้น\n` +
      `• ขนาด 11 ซม. ขึ้นไปคิดเท่ากันทั้งปลีก/ส่ง: 11 ซม. +${SPECIAL_RETAIL[11]} … 20 ซม. +${SPECIAL_RETAIL[20]} บาท/ชิ้น\n` +
      "• แผ่นบนเป็นอะคริลิคใสอย่างเดียว ไม่มีค่าสีพิเศษของแผ่นบน",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกขนาดตัวสแตนดี้ · งานสกรีน · ขนาดแผ่นบน · สีอะคริลิค · ฐาน แล้วใส่จำนวน\n" +
      '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ตำแหน่งจุกใส · ทิศทางที่อยากให้แผ่นบนหมุน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ชิ้นขึ้นไป สั่งลายละ 5 ชิ้นขึ้นไป)\n" +
      "• ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แยกไฟล์ 2 ชิ้นให้ชัด — ลายของตัวสแตนดี้ (แผ่นล่าง) และลายของแผ่นบน\n" +
      "• ออกแบบให้อยู่ในขนาดที่สั่ง · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n" +
      "• เผื่อพื้นที่รูจุกใส (ประมาณ 4-5 มม.) ไว้ในจุดที่ทั้งสองแผ่นซ้อนกัน — เลี่ยงวางรายละเอียดสำคัญตรงนั้น\n" +
      "• เผื่อส่วนที่เสียบลงฐานด้านล่างของตัวสแตนดี้ ประมาณ 5 มม.\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
  },
  warranty,
];

const saved = {
  ...(await load(ID)),
  id: ID,
  name: NAME,
  emoji: "🧍",
  badge: "ใหม่",
  price: PRICE_MIN,
  priceMin: PRICE_MIN,
  priceMax: PRICE_MAX,
  hidden: true, // ยังเป็นร่าง — ผู้ใช้กดเผยแพร่เอง
  rating: 5,
  sold: 0,
  featured: false,
  tierByDesign: true,
  bulkAskQty: 50,
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: IMG("parts"),
  images: [
    { src: IMG("parts"), emoji: "🧍", label: "ส่วนประกอบ — 2 แผ่น + จุกใส + ฐาน", gradient: "from-sky-200 to-cyan-300" },
    { src: IMG("stopper"), emoji: "🧍", label: "จุกใส — แผ่นบนหมุนได้", gradient: "from-sky-200 to-cyan-300" },
  ],
  description:
    "สแตนดี้อะคริลิค 2 ชิ้นประกบกันด้วยจุกใส (ตัวสแตนดี้ + แผ่นบนอะคริลิคใสที่หมุน/ขยับได้) พร้อมฐานสแตนดี้ " +
    "อะคริลิคหนา 3 มม. พิมพ์ระบบ UV ไดคัทตามลาย ตัวสแตนดี้ทำได้ 3-20 ซม. แผ่นบน 2-10 ซม. " +
    `ราคาต่อชิ้นรวมทั้ง 2 แผ่น + จุกใส + ฐานแล้ว เริ่มต้น ${money(PRICE_MIN)} บาท`,
  highlights: [
    "อะคริลิค 2 ชิ้นประกบด้วยจุกใส — แผ่นบนหมุน/ขยับได้ เล่นมุกลายซ้อนลาย",
    "ราคารวมตัวสแตนดี้ + แผ่นบน + จุกใส + ฐาน แล้วในราคาเดียว",
    "ตัวสแตนดี้ 3-20 ซม. · แผ่นบนเลือกขนาดแยก 2-10 ซม.",
    "ฐานเลือกได้ครบ: ขนาด 2-20 ซม. · ทรงกลม/สี่เหลี่ยม/ไดคัทตามทรง · สี + เฉดพิเศษ",
    "อะคริลิคสีพิเศษกว่า 40 เฉด ระบบบวกราคาตามขนาดให้อัตโนมัติ",
    "ไม่มีขั้นต่ำ · 11 ชิ้นขึ้นไป คละลาย/คละขนาด ลายละ 5 ชิ้นขึ้นไป",
  ],
  terms:
    "*ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด และไม่นับรวมฐาน หากต้องการให้นับรวมต้องแจ้ง\n" +
    "*ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15% · ผลิตคนละเครื่องสีต่างกันได้ 5-10%",
  options,
  rules,
  tabs: TABS,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1 (สั่งแบบคละดีเทล)",
      desc:
        "อะคริลิคหนา 3 มม. · ราคารวมแผ่นบน + จุกใส + ฐานแล้ว · 1-10 ชิ้น ราคาปลีก คละดีเทลได้ไม่จำกัด " +
        "· 11 ชิ้นขึ้นไป คละลาย คละขนาดได้ แต่ละดีเทลขั้นต่ำ 5 ชิ้นขึ้นไป",
      minPerDesign: 5,
      freeMixBelowQty: 11,
      underMinPieceFee: 5,
      pricing: PRICING,
    },
  ],
  seo: {
    title: `${NAME} | iDucky Prints Studio`,
    description:
      "สแตนดี้อะคริลิค 2 ชิ้นประกบด้วยจุกใส แผ่นบนหมุนได้ พร้อมฐาน สกรีนลายตามสั่ง หนา 3 มม. " +
      `ตัวสแตนดี้ 3-20 ซม. เริ่มต้น ${money(PRICE_MIN)} บาท`,
    faqs: [
      {
        q: `${NAME} ราคาเท่าไหร่?`,
        a:
          `ราคารวมทั้ง 2 แผ่น จุกใส และฐานแล้ว เริ่มต้นชิ้นละ ${money(PRICE_MIN)} บาท ` +
          `(ตัวสแตนดี้ 3 ซม. + แผ่นบน 2 ซม. สกรีน 1 ด้าน ที่ ${TIERS.at(-1)}) · ` +
          `สั่ง 1-10 ชิ้น ตัวสแตนดี้ 8 ซม. + แผ่นบน 3 ซม. อยู่ที่ ${money(sample(8, "สกรีน 1 ด้าน (ใต้)", 3, 0))} บาท/ชิ้น`,
      },
      {
        q: "จุกใสคืออะไร ต่างจากสแตนดี้ธรรมดายังไง?",
        a:
          "จุกใสเป็นจุกยางใสที่ยึดอะคริลิค 2 แผ่นเข้าด้วยกัน ทำให้แผ่นบนหมุน/ขยับรอบจุกได้ " +
          "ต่างจากสแตนดี้ธรรมดาที่เป็นอะคริลิคแผ่นเดียว · ค่าจุกใสรวมอยู่ในราคาที่แสดงแล้ว",
      },
      {
        q: "เลือกขนาดแผ่นบนแยกจากตัวสแตนดี้ได้ไหม?",
        a: "ได้ ตัวสแตนดี้เลือกได้ 3-20 ซม. ส่วนแผ่นบนอะคริลิคใสเลือกแยกได้ 2-10 ซม. ระบบคิดราคารวมให้แล้วในตาราง",
      },
      {
        q: "ราคานี้รวมฐานหรือยัง?",
        a:
          "รวมแล้ว ทุกชิ้นได้ฐานอะคริลิค เลือกทรงกลม/สี่เหลี่ยมได้ไม่บวกเพิ่ม · " +
          "ช่วง 11 ชิ้นขึ้นไปฐานขนาดใหญ่คิดเพิ่มตามตาราง และเลือกสกรีนลายลงฐานได้",
      },
      {
        q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
        a: "ไม่มีขั้นต่ำ · 1-10 ชิ้นคละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไปคละลาย/คละขนาดได้ ลายละ 5 ชิ้นขึ้นไป",
      },
    ],
  },
  savedAt: new Date().toISOString(),
};

/* ══ 6. สรุป + บันทึก ═══════════════════════════════════════════════════ */
console.log(`\n📦 ${NAME} (${ID})`);
console.log(`   ตารางราคา ${Object.keys(cells).length} ช่อง × ${TIERS.length} ช่วงจำนวน (${BODY_SIZES.length} ขนาด × ${krScreen.choices.length} งานสกรีน × ${TOP_SIZES.length} ขนาดแผ่นบน)`);
console.log(`   กลุ่มตัวเลือก ${options.length} กลุ่ม · กฎ ${rules.length} ข้อ · ช่วงราคา ${money(PRICE_MIN)}-${money(PRICE_MAX)} บาท`);
console.log("\n   ตัวอย่างราคา/ชิ้น (ตัวสแตนดี้ × แผ่นบน × งานสกรีน):");
for (const [b, t, s] of [
  [3, 2, "สกรีน 1 ด้าน (ใต้)"],
  [8, 3, "สกรีน 1 ด้าน (ใต้)"],
  [8, 3, "สกรีน 2 ด้าน (ใต้-บน)"],
  [20, 10, "สกรีน 2 ด้าน (ใต้-บน)"],
]) {
  const row = cells[`${cm(b)}│${s}│${cm(t)}`];
  const check = `${SHEET[b][1]} + ${/2 ด้าน/.test(s) ? SCREEN_FEE[b] : 0} + ${STOPPER_FEE} + ${topPlatePrice(t, 1)} + ${/2 ด้าน/.test(s) ? SCREEN_FEE[t] : 0}`;
  console.log(`     ตัว ${b}cm · บน ${t}cm · ${s.padEnd(20)} → ${row.map((v, i) => `${TIERS[i].replace(" ชิ้น", "")}: ${v}`).join(" · ")}`);
  console.log(`        (ช่วง 11-29 = ${check} = ${row[1]})`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (!existing) throw new Error(`ไม่พบร่างเดิม id ${ID} — ตรวจก่อน`);
if (existing.name !== NAME) throw new Error(`id ${ID} เป็นของ "${existing.name}" ไม่ใช่ร่าง ${NAME} — ตรวจก่อน`);

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,price,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.data.savedAt !== saved.savedAt || check.price !== PRICE_MIN)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ บันทึกแล้ว — ยังเป็นฉบับร่าง (กดเผยแพร่เองที่ /admin/products)`);
console.log(`   หน้าแก้ไข: http://localhost:3006/admin/products/${ID}`);

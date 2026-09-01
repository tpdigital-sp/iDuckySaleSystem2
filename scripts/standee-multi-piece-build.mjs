#!/usr/bin/env node
/**
 * สร้างสินค้า "สแตนดี้ หลายชิ้นใน 1 ฐาน" (ร่าง id: new-mt1dwpc1-6773) จากตารางราคาสดของเว็บ
 *
 *   node scripts/standee-multi-piece-art.mjs --upload   # 1) วาด + อัปภาพจำลองตัวเลือก
 *   node scripts/standee-multi-piece-build.mjs          # 2) ดูก่อน (ไม่เขียน) — โชว์ราคาตัวอย่าง + ด่านตรวจ
 *   node scripts/standee-multi-piece-build.mjs --write  # 3) บันทึกจริง (ยังเป็นฉบับร่าง)
 *
 * ผู้ใช้สั่ง 1 ก.ย. 69 (พร้อมใบเสนอราคาจริง): "สแตนดี้ หลายชิ้นใน 1 ฐาน ลูกค้าเลือกได้ว่าจะมีกี่ชิ้น
 * แต่ไม่เกิน 5 ชิ้นใน 1 ฐาน ถ้าเกิน ต้องสอบถามแอดมิน · ดึงราคาจากตาราง เรทที่ 1 (สั่งแบบคละดีเทล)"
 *
 * ที่มาราคา (https://www.iduckyofficial-pricelists.com/pricestandy · อ่านสดทุกครั้งที่รัน)
 * เฉพาะบล็อก "เรทที่ 1 (สั่งแบบคละดีเทล)" 4 ตาราง
 *   1) ราคาแผ่นอะคริลิค 3-20cm × 6 ช่วงจำนวน   → ราคาชิ้นที่ 1 (แกนตารางราคา)
 *   2) ราคาฐาน (ไม่สกรีนฐาน/สกรีนฐาน)           → ตรวจกลุ่มฐานชุดกลางที่โคลนจาก standy
 *   3) Add on งานสกรีน (2 ด้าน/3-4 เลเยอร์)       → ค่าสกรีน คิดตามขนาดของ "ชิ้นนั้น ๆ"
 *   4) Add on อคล.พิเศษ (ปลีก/ส่ง)                → ค่าเนื้อพิเศษ คิดตามขนาดของชิ้นนั้น
 *
 * สูตรราคาต่อ 1 ชุด (= 1 ฐาน) ตามใบเสนอราคาที่ผู้ใช้ส่งมา
 *   ชิ้นที่ 1  = ช่องตาราง (ขนาด × งานสกรีน × เนื้ออะคริลิค) ณ ช่วงจำนวน "ชุด" ที่สั่ง
 *   ชิ้นที่ 2-5 = min( 20 + (ขนาด-2)×10 , ราคาในตารางของขนาดนั้นในช่วงจำนวนเดียวกัน )
 *                ("หลักการคิดเพิ่มเซนละ 10 บาท / ถ้าราคาส่งในตารางถูกกว่าให้เอาราคาในตาราง")
 *                + ค่าสกรีนของชิ้นนั้นตามขนาดชิ้นนั้น + ค่าเนื้อพิเศษของชิ้นนั้นตามขนาดชิ้นนั้น
 *   ฐาน       = ระบบฐานสแตนดี้ชุดกลางของ standy — คิดครั้งเดียวต่อชุด ไม่ใช่ต่อชิ้น
 *
 * ตรวจกับใบเสนอราคาจริงในสคริปต์ (ต้องผ่านก่อนถึงจะยอมเขียน)
 *   1 ชุด  (ปลีก)      : ชิ้นหน้า 6cm 140 + ชิ้นหลัง 10cm 100 + ฐาน 7cm 5  = 245
 *   11 ชุด (เรทส่งที่1) : ชิ้นหน้า 6cm  69 + ชิ้นหลัง 10cm 100 + ฐาน 7cm 15 = 184
 *
 * ⚠️ ค่าเนื้ออะคริลิคพิเศษของ "ชิ้นที่ 2-5" คิดผ่าน sizeFee ซึ่งไม่มีมิติจำนวน จึงยึด "คอลัมน์ปลีก"
 *    (ตรงเป๊ะช่วง 1-10 ชุด · ช่วงส่งแพงกว่าคอลัมน์ส่ง 2-5 บาท เฉพาะขนาด 2-8 ซม.)
 *    ชิ้นที่ 1 ไม่มีปัญหานี้ เพราะค่าเนื้อพิเศษฝังอยู่ในช่องตาราง (แกน "สีอะคริลิค") ตามจำนวนจริง
 *
 * ⚠️ สคริปต์นี้ "เขียนทับทั้งก้อน" ของสินค้าร่างตัวนี้ — ถ้าต่อไปมีการแก้ในหน้าแอดมินแล้วรันซ้ำ ของที่แก้จะหาย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy";
const ID = "new-mt1dwpc1-6773";
const NAME = "สแตนดี้ หลายชิ้นใน 1 ฐาน";
const STANDY = "standy"; // ต้นแบบ: ตารางราคา + ระบบฐาน + ชุดตัวเลือกงานสกรีน/สี/เฉด

/* ── ชื่อกลุ่มตัวเลือก ────────────────────────────────────────────────── */
const MAX_PIECES = 5;
const COUNT = "จำนวนชิ้นใน 1 ฐาน";
const MORE = `มากกว่า ${MAX_PIECES} ชิ้น (สอบถามแอดมิน)`;
const SIZE = (k) => `ขนาดชิ้นที่ ${k}`;
const SCREEN = (k) => `งานสกรีน ชิ้นที่ ${k}`;
const COLOR = (k) => `สีอะคริลิค ชิ้นที่ ${k}`;
const SHADE = (k) => `เลือกเฉดสีพิเศษ ชิ้นที่ ${k}`;
const SECTION = (k) => (k === 1 ? "ชิ้นที่ 1 (ตัวหลัก)" : `ชิ้นที่ ${k}`);
const TRIM = (k) => `ชิ้นที่ ${k}`;
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const C02 = "อะคริลิคขาวขุ่น C-02";
const BASE_GROUPS = ["ฐานสแตนดี้", "ขนาดฐาน", "ทรงฐาน", "สีอะคริลิคฐาน"];
const ACCESSORY = "อุปกรณ์เสริม";

const MAIN_SIZES = Array.from({ length: 18 }, (_, i) => i + 3); // ชิ้นที่ 1 : 3-20 ซม. (ตามตาราง)
const SUB_SIZES = Array.from({ length: 19 }, (_, i) => i + 2); // ชิ้นถัดไป : 2-20 ซม.
const cm = (n) => `${n}cm`;
/** ราคาชิ้นถัดไปตามหลักของร้าน: 2 ซม. = 20 บาท แล้วเพิ่มเซนละ 10 บาท (ยังไม่เทียบตาราง) */
const subFormula = (n) => 20 + (n - 2) * 10;

/* ภาพจำลอง — ชุดเดียวกับ standee-multi-piece-art.mjs */
const FOLDER = "standee-multi-piece";
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

/* 1.1 ราคาแผ่นอะคริลิค — แถว = ช่วงจำนวน */
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
for (const s of MAIN_SIZES)
  if (!SHEET[s] || SHEET[s].some((n) => !Number.isFinite(n)))
    throw new Error(`ตารางราคาไม่มีขนาด ${s}cm ครบทุกช่วงจำนวน — ตรวจหน้าเว็บ`);

/* 1.2 Add on งานสกรีน (คิดตามขนาดของ "แผ่นนั้น ๆ") */
const screenTable = bySize(findTable((c) => c.includes("สกรีน 2 ด้าน") && c.includes("สกรีน 3 เลเยอร์"), "Add on งานสกรีน"));
const WEB_2SIDE = screenTable["สกรีน 2 ด้าน"];
const WEB_3LAYER = screenTable["สกรีน 3 เลเยอร์"];

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

/* ══ 2. อ่านสินค้าต้นแบบ (standy) ═══════════════════════════════════════ */
const load = async (id) => {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw new Error(`อ่าน ${id} ไม่ได้ — ${error.message}`);
  return structuredClone(data.data);
};
const st = await load(STANDY);
const groupOf = (d, label, who) => {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`${who} ไม่มีกลุ่ม "${label}" แล้ว — โครงสินค้าต้นแบบเปลี่ยน ตรวจก่อน`);
  return structuredClone(g);
};

const stScreen = groupOf(st, "งานสกรีน", "standy");
const stColor = groupOf(st, "สีอะคริลิค", "standy");
const stShade = groupOf(st, "เลือกเฉดสีพิเศษ (ตัวสแตนดี้)", "standy");
const stSize = groupOf(st, "ขนาดตัวสแตนดี้", "standy");
const SCREENS = stScreen.choices.map((c) => c.name);
const COLORS = stColor.choices.map((c) => c.name);
if (!COLORS.includes(SPECIAL) || !COLORS.includes(C02))
  throw new Error(`กลุ่มสีอะคริลิคของ standy เปลี่ยนชื่อตัวเลือก (${COLORS.join(" / ")}) — ตรวจก่อน`);
const SHADES = stShade.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
/** รายชื่อเฉด "เนื้อทึบ" ที่ต้องล็อกให้สกรีนได้เฉพาะผิวบน (กติกาเดียวกับทั้งร้าน) */
const isTransparent = (n) =>
  /^อะคริลิ(ค)?ใส$/.test(n) || n.startsWith("อะคริลิคกลิตเตอร์-") || (n.startsWith("hologram-") && n !== "hologram-01");
const OPAQUE = SHADES.map((c) => c.name).filter((n) => !isTransparent(n));
const TOP_ONLY = SCREENS.filter((n) => /\(บน\)|\(บน-บน\)/.test(n));
if (TOP_ONLY.length !== 2) throw new Error(`กลุ่มงานสกรีนของ standy เปลี่ยนโครง (เจอ "ผิวบน" ${TOP_ONLY.length} แบบ) — ตรวจก่อน`);
/** ภาพประจำขนาดของ standy — ใช้กับกลุ่มขนาดเป็นตัวสำรอง (ภาพชุดใหม่วาดเองอยู่แล้ว) */
const stSizeImage = Object.fromEntries(stSize.choices.map((c) => [parseInt(c.name, 10), c.imageSrc]));

/* 2.1 ค่าสกรีนของแต่ละแบบ ตามขนาด — ถอดจากช่องราคาจริงของ standy แล้ว assert กับตารางเว็บ */
const stMatrix = (st.priceRates ?? []).find((r) => /เรทที่ 1/.test(r.label))?.pricing;
if (!stMatrix) throw new Error("standy ไม่มีเรทที่ 1 แล้ว — ตรวจก่อน");
const stCell = (size, screen, color = "อะคริลิคใส") => stMatrix.cells[`${cm(size)}│${screen}│${color}`];
const BASE_SCREEN = SCREENS[0]; // "สกรีน 1 ด้าน (ใต้)" = ราคาตามตาราง ไม่มีค่าสกรีนเพิ่ม
/** ค่าสกรีนตามชื่อแบบ → { ขนาด: ค่า } (ครอบ 2-20 ซม. ทั้งชิ้นหลักและชิ้นถัดไป) */
const SCREEN_FEE = Object.fromEntries(SCREENS.map((n) => [n, {}]));
for (const s of MAIN_SIZES) {
  const base = stCell(s, BASE_SCREEN);
  if (!base) throw new Error(`standy ไม่มีช่องราคาขนาด ${s}cm แล้ว — ตรวจก่อน`);
  if (base[0] !== SHEET[s][0])
    throw new Error(`ราคาเว็บกับ standy ไม่ตรงที่ ${s}cm (เว็บ ${SHEET[s][0]} · standy ${base[0]}) — ตรวจก่อนเขียน`);
  for (const name of SCREENS) {
    const cell = stCell(s, name);
    if (!cell) continue; // standy ไม่มีช่อง 3 เลเยอร์ที่ 17-20cm — เติมด้วยสูตรด้านล่าง
    const diffs = new Set(cell.map((v, i) => v - base[i]));
    if (diffs.size !== 1) throw new Error(`ค่าสกรีน "${name}" ของ standy ที่ ${s}cm ไม่คงที่ทุกช่วงจำนวน — ตรวจก่อน`);
    SCREEN_FEE[name][s] = [...diffs][0];
  }
}
/** ชิ้นถัดไปเล็กได้ถึง 2 ซม. ซึ่ง standy ไม่มีขนาดนั้น — เติมจากตารางเว็บ */
for (const name of SCREENS) {
  // สกรีน 1 ด้าน (ใต้/บน) = ราคาตามตาราง ไม่มี add on — ตรวจว่า standy ก็คิด 0 จริง
  if (/1 ด้าน/.test(name)) {
    for (const s of MAIN_SIZES)
      if (SCREEN_FEE[name][s]) throw new Error(`standy คิดค่าสกรีน "${name}" ที่ ${s}cm = ${SCREEN_FEE[name][s]} ไม่ใช่ 0 — ตรวจก่อน`);
    SCREEN_FEE[name][2] = 0;
    continue;
  }
  const web = /2 ด้าน/.test(name) ? WEB_2SIDE : /เลเยอร์/.test(name) ? WEB_3LAYER : null;
  if (!web) throw new Error(`ไม่รู้จะเอาค่าสกรีนของ "${name}" มาจากตารางไหน — ตรวจก่อน`);
  // ช่วงที่ทับกัน (2-16cm) เว็บต้องตรงกับที่ standy คิดจริง
  for (const s of Object.keys(web).map(Number))
    if (SCREEN_FEE[name][s] !== undefined && SCREEN_FEE[name][s] !== web[s])
      throw new Error(`ค่าสกรีน "${name}" ${s}cm เว็บ ${web[s]} ≠ standy ${SCREEN_FEE[name][s]} — ตรวจก่อนเขียน`);
  if (SCREEN_FEE[name][2] === undefined) SCREEN_FEE[name][2] = web[2];
  if (SCREEN_FEE[name][2] === undefined) throw new Error(`ตารางเว็บไม่มีค่าสกรีน "${name}" ที่ 2cm — ตรวจก่อน`);
}
/**
 * 17-20 ซม. ของ "3 เลเยอร์" ไม่มีทั้งในตารางเว็บ (มีถึง 16) และใน standy
 * ตารางเว็บทุกขนาดที่มี ค่า 3 เลเยอร์ = 2 เท่าของ 2 ด้านพอดี — ตรวจก่อนแล้วค่อยใช้สูตรนี้เติม
 */
const twoSideName = SCREENS.find((n) => /2 ด้าน \(ใต้-บน\)/.test(n)) ?? SCREENS.find((n) => /2 ด้าน/.test(n));
const layerName = SCREENS.find((n) => /3 เลเยอร์/.test(n));
for (const s of Object.keys(WEB_3LAYER).map(Number))
  if (WEB_3LAYER[s] !== WEB_2SIDE[s] * 2)
    throw new Error(`ตารางเว็บ: 3 เลเยอร์ ${s}cm (${WEB_3LAYER[s]}) ไม่ใช่ 2 เท่าของ 2 ด้าน (${WEB_2SIDE[s]}) — สูตรเติม 17-20cm ใช้ไม่ได้แล้ว`);
let filled = [];
for (const s of MAIN_SIZES)
  if (SCREEN_FEE[layerName][s] === undefined) {
    SCREEN_FEE[layerName][s] = SCREEN_FEE[twoSideName][s] * 2;
    filled.push(`${s}cm=${SCREEN_FEE[layerName][s]}`);
  }
for (const name of SCREENS)
  for (const s of SUB_SIZES)
    if (!Number.isFinite(SCREEN_FEE[name][s])) throw new Error(`ยังไม่มีค่าสกรีน "${name}" ที่ ${s}cm — ตรวจก่อน`);

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
const baseShadeGroups = (st.options ?? []).filter((o) => o.showWhen?.label === "ขนาดฐาน").map((o) => structuredClone(o));
if (baseShadeGroups.length !== baseSize.choices.length)
  throw new Error(`กลุ่มเฉดสีของฐาน ${baseShadeGroups.length} กลุ่ม ≠ ขนาดฐาน ${baseSize.choices.length} ขนาด — ตรวจก่อน`);
const accessory = groupOf(st, ACCESSORY, "standy");

/* ══ 3. ตารางราคา 3 แกน (ชิ้นที่ 1) ═════════════════════════════════════ */
const specialFee = (size, tierIdx) => (tierIdx === 0 ? SPECIAL_RETAIL[size] : SPECIAL_WHOLESALE[size]);
for (const s of SUB_SIZES)
  if (!Number.isFinite(SPECIAL_RETAIL[s]) || !Number.isFinite(SPECIAL_WHOLESALE[s]))
    throw new Error(`ตาราง Add on อะคริลิคพิเศษ ไม่มีขนาด ${s}cm — ตรวจก่อน`);

const cells = {};
for (const s of MAIN_SIZES)
  for (const sc of SCREENS)
    for (const col of COLORS)
      cells[`${cm(s)}│${sc}│${col}`] = SHEET[s].map(
        (p, i) => p + SCREEN_FEE[sc][s] + (col === SPECIAL ? specialFee(s, i) : 0)
      );

/** ด่าน: ทุกช่องที่ standy มีอยู่จริง ต้องได้เลขเดียวกันเป๊ะ */
let checked = 0;
for (const key of Object.keys(cells)) {
  const ref = stMatrix.cells[key];
  if (!ref) continue;
  if (JSON.stringify(ref) !== JSON.stringify(cells[key]))
    throw new Error(`ช่องราคา "${key}" ไม่ตรงกับ standy — เรา ${cells[key].join(",")} · standy ${ref.join(",")}`);
  checked++;
}

const PRICING = {
  unit: "ชุด",
  driverLabels: [SIZE(1), SCREEN(1), COLOR(1)],
  tiers: TIERS.map((label) => ({ upTo: tierUpTo(label), label: label.replace("ชิ้น", "ชุด") })),
  cells,
};

/* ══ 4. ราคาชิ้นที่ 2-5 ═════════════════════════════════════════════════ */
/** min(สูตรเซนละ 10, ราคาในตารางของช่วงนั้น) — ตามหมายเหตุใต้ใบเสนอราคาของร้าน */
const subPrice = (size, tierIdx) => Math.min(subFormula(size), SHEET[size]?.[tierIdx] ?? Infinity);
const subTiers = (size) => TIERS.map((label, i) => ({ upTo: tierUpTo(label), extra: subPrice(size, i) }));
/** ค่าบริการตามขนาดของชิ้นนั้น (sizeFee) — อ่านขนาดจากกลุ่ม "ขนาดชิ้นที่ k" ("6cm" → 6) */
const feeBySize = (k, table) => ({
  onlyWhen: { label: COUNT, choices: countFrom(k) },
  widthLabel: SIZE(k),
  heightLabel: SIZE(k),
  tiers: SUB_SIZES.map((s) => ({ upTo: s, fee: table[s] })),
});
/** ค่าที่กลุ่ม COUNT ต้องเป็น ถึงจะมีชิ้นที่ k จริง */
const countFrom = (k) => [...Array.from({ length: MAX_PIECES - k + 1 }, (_, i) => `${k + i} ชิ้น`), MORE];

/* ══ 5. กลุ่มตัวเลือก ═══════════════════════════════════════════════════ */
const pieceSection = (k) => ({ section: SECTION(k), sectionTrim: TRIM(k) });

/** ชุดสเปคของชิ้นที่ k — ชิ้นที่ 1 เป็นแกนตารางราคา · ชิ้นที่ 2-5 คิด +฿ ในตัวเอง */
const pieceGroups = (k) => {
  const main = k === 1;
  const show = main ? {} : { showWhen: { label: COUNT, choices: countFrom(k) } };
  const sizes = main ? MAIN_SIZES : SUB_SIZES;
  return [
    {
      label: SIZE(k),
      ...pieceSection(k),
      ...show,
      stockBearing: true,
      display: "dropdown",
      note: main
        ? "ชิ้นหลักที่คิดราคาตามตาราง — วัดจากด้านที่ยาวที่สุด (ไม่นับฐาน)"
        : "ชิ้นนี้คิดเพิ่มตามขนาด: 2 ซม. = 20 บาท แล้วเพิ่มเซนละ 10 บาท (สั่งเยอะเทียบตารางให้อัตโนมัติ)",
      choices: sizes.map((s) => ({
        name: cm(s),
        imageSrc: IMG(main ? `main-${s}` : `sub-${s}`),
        ...(main ? {} : { extraTiers: subTiers(s) }),
      })),
    },
    {
      ...structuredClone(stScreen),
      label: SCREEN(k),
      ...pieceSection(k),
      ...show,
      display: "cards",
      ...(main
        ? {}
        : {
            note: "งานสกรีนของชิ้นนี้ คิดค่าสกรีนตามขนาดของชิ้นนี้เอง",
            choices: stScreen.choices.map((c) => ({
              ...structuredClone(c),
              ...(SCREEN_FEE[c.name][2] || SCREEN_FEE[c.name][20]
                ? { sizeFee: feeBySize(k, SCREEN_FEE[c.name]) }
                : {}),
            })),
          }),
    },
    {
      ...structuredClone(stColor),
      label: COLOR(k),
      ...pieceSection(k),
      ...show,
      display: "cards",
      ...(main
        ? {}
        : {
            choices: stColor.choices.map((c) => ({
              ...structuredClone(c),
              ...(c.name === SPECIAL
                ? {
                    // คำอธิบายของ standy พูดถึง "เรทที่สั่ง" ซึ่งใช้กับชิ้นที่ 1 (ฝังในตาราง) เท่านั้น
                    desc: "กลิตเตอร์ · โฮโลแกรม · กระจก · อะคริลิคสีทึบ รวม 44 เฉด (เลือกเฉดได้หลังกดแบบนี้) — คิดเพิ่มตามขนาดของชิ้นนี้",
                    sizeFee: feeBySize(k, SPECIAL_RETAIL),
                  }
                : {}),
            })),
          }),
    },
    {
      label: SHADE(k),
      ...pieceSection(k),
      display: "dropdown",
      stockBearing: true,
      note: "ค่าเนื้อพิเศษคิดตามขนาดของชิ้นนี้ ระบบบวกให้แล้ว — เลือกเฉดที่ต้องการได้เลย",
      ...(main
        ? { showWhen: { label: COLOR(1), choices: [SPECIAL] } }
        : {
            showWhenAll: [
              { label: COUNT, choices: countFrom(k) },
              { label: COLOR(k), choices: [SPECIAL] },
            ],
          }),
      choices: SHADES.map((c) => ({ ...c })),
    },
  ];
};

const options = [
  {
    label: COUNT,
    display: "cards",
    note: `1 ชุด = ชิ้นงานหลายชิ้นปักอยู่บนฐานเดียวกัน · ค่าฐานคิดครั้งเดียวต่อชุด (เกิน ${MAX_PIECES} ชิ้นต้องคุยกับแอดมินก่อน)`,
    choices: [
      ...Array.from({ length: MAX_PIECES - 1 }, (_, i) => {
        const n = i + 2;
        return {
          name: `${n} ชิ้น`,
          desc: `ชิ้นที่ 1 คิดตามตารางราคา · อีก ${n - 1} ชิ้นคิดเพิ่มตามขนาดของแต่ละชิ้น`,
          imageSrc: IMG(`set-${n}`),
          ...(n === 2 ? { popular: true } : {}),
        };
      }),
      {
        name: MORE,
        desc: "ฐานต้องกว้างขึ้นและคำนวณร่องเสียบใหม่ — ทักไลน์ร้านพร้อมไฟล์ลาย ทางร้านตีราคาให้ก่อนสั่ง",
        imageSrc: IMG("set-more"),
      },
    ],
  },
  ...Array.from({ length: MAX_PIECES }, (_, i) => pieceGroups(i + 1)).flat(),
  /* ── เรื่อง "ฐาน" ทั้งยวง (ชุดกลางจาก standy) ── */
  ...BASE_GROUPS.map((label) => groupOf(st, label, "standy")),
  ...baseShadeGroups,
  { ...accessory, collapsible: true },
];

/* กฎ: เนื้อทึบสกรีนใต้ไม่ได้ — ยิงทีละชิ้น (กลุ่มประเภท C-02 + กลุ่มเฉดทึบของชิ้นนั้น) */
const rules = Array.from({ length: MAX_PIECES }, (_, i) => i + 1).flatMap((k) => [
  { when: { label: COLOR(k), choice: C02, choices: [C02] }, limit: { label: SCREEN(k), allow: TOP_ONLY } },
  { when: { label: SHADE(k), choice: OPAQUE[0], choices: OPAQUE }, limit: { label: SCREEN(k), allow: TOP_ONLY } },
]);

/* ══ 6. ด่านตรวจกับใบเสนอราคาจริงของร้าน ═══════════════════════════════ */
const baseExtraAt = (size, qty) => {
  const c = baseSize.choices.find((x) => x.name === cm(size));
  if (!c) throw new Error(`กลุ่มขนาดฐานไม่มี ${cm(size)} — ตรวจก่อน`);
  return qty >= (baseSize.extraFromQty ?? 1) ? (c.extra ?? 0) : (c.extraBelow ?? 0);
};
const tierIdxOf = (qty) => {
  const i = PRICING.tiers.findIndex((t) => t.upTo == null || qty <= t.upTo);
  return i < 0 ? PRICING.tiers.length - 1 : i;
};
/** ราคา 1 ชุด แบบเรียงบรรทัดเหมือนใบเสนอราคา */
const quote = (qty, front, back, baseCm) => {
  const i = tierIdxOf(qty);
  const a = cells[`${cm(front)}│${BASE_SCREEN}│อะคริลิคใส`][i];
  const b = subPrice(back, i);
  const c = baseExtraAt(baseCm, qty);
  return { i, a, b, c, total: a + b + c };
};
const CASES = [
  { qty: 1, front: 6, back: 10, baseCm: 7, want: 245, parts: [140, 100, 5] },
  { qty: 11, front: 6, back: 10, baseCm: 7, want: 184, parts: [69, 100, 15] },
];
for (const t of CASES) {
  const q = quote(t.qty, t.front, t.back, t.baseCm);
  const got = [q.a, q.b, q.c];
  if (q.total !== t.want || got.join(",") !== t.parts.join(","))
    throw new Error(
      `ไม่ตรงใบเสนอราคา ${t.qty} ชุด — ได้ ${got.join(" + ")} = ${q.total} · ควรเป็น ${t.parts.join(" + ")} = ${t.want}`
    );
}

const all = Object.values(cells).flat();
const PRICE_MIN = Math.min(...all) + subPrice(2, TIERS.length - 1);
const PRICE_MAX = Math.max(...all) + subPrice(20, 0) * (MAX_PIECES - 1) + 80;

/* ══ 7. เนื้อหาหน้าสินค้า ═══════════════════════════════════════════════ */
const money = (n) => n.toLocaleString("th-TH");
const tabByTitle = (d, title) => (d.tabs ?? []).find((t) => t.title === title);
const warranty = tabByTitle(st, "การรับประกันสินค้า");
if (!warranty) throw new Error("standy ไม่มีแท็บการรับประกันสินค้าแล้ว — ตรวจก่อน");

const TABS = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      `${NAME} — สแตนดี้อะคริลิคหลายชิ้นปักอยู่บน "ฐานเดียวกัน" ตั้งโชว์เป็นชุดได้เลย ` +
      "เหมาะกับงานตัวละครหลัก + ตัวประกอบ · ตัวหลัก + ข้อความ · หรือฉากเล็ก ๆ ในกล่องเดียว\n" +
      `• เลือกได้ 2-${MAX_PIECES} ชิ้นใน 1 ฐาน (เกินกว่านั้นต้องคุยกับแอดมินก่อนสั่ง)\n` +
      "• แต่ละชิ้นเลือก ขนาด / เนื้ออะคริลิค / งานสกรีน แยกกันได้ ไม่ต้องเหมือนกันทั้งชุด\n" +
      "• ชิ้นที่ 1 (ตัวหลัก) ทำได้ 3-20 ซม. · ชิ้นถัดไปทำได้ 2-20 ซม. (วัดจากด้านที่ยาวที่สุด ไม่นับฐาน)\n" +
      "• ค่าฐานคิดครั้งเดียวต่อชุด ไม่ได้คิดรายชิ้น — เลือกขนาด/ทรง/สีของฐานได้\n" +
      "• อะคริลิคใส / ขาวขุ่น C-02 หนา 3 มม. ไดคัทตามลาย พิมพ์ระบบ UV Printing\n" +
      "• อะคริลิคสีพิเศษกว่า 40 เฉด (สี/กลิตเตอร์/โฮโลแกรม) ระบบบวกราคาตามขนาดให้อัตโนมัติ\n" +
      "• ราคาคิดเป็น \"ชุด\" — สั่ง 11 ชุดขึ้นไปได้เรทส่ง คละลาย/คละขนาดได้ ลายละ 5 ชุดขึ้นไป",
    images: [IMG("parts")],
    imageSize: "lg",
  },
  {
    title: "ราคาคิดยังไง",
    text:
      "ราคา 1 ชุด = ชิ้นที่ 1 + ชิ้นถัดไป + ฐาน::\n" +
      "• ชิ้นที่ 1 (ตัวหลัก) คิดตามตารางราคาของขนาดนั้น ตามจำนวนชุดที่สั่ง\n" +
      "• ชิ้นที่ 2 เป็นต้นไป คิดเพิ่มตามขนาดของชิ้นนั้น — 2 ซม. = 20 บาท แล้วเพิ่มเซนติเมตรละ 10 บาท\n" +
      "  (สั่งจำนวนมาก ระบบเทียบกับตารางราคาให้ ถ้าราคาในตารางถูกกว่าจะคิดราคาในตารางให้อัตโนมัติ)\n" +
      "• ค่าฐานคิดครั้งเดียวต่อชุด — ช่วงปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว\n" +
      "• งานสกรีน 2 ด้าน / 3 เลเยอร์ คิดเพิ่ม \"รายชิ้น\" ตามขนาดของชิ้นนั้น ๆ\n" +
      "• เนื้ออะคริลิคพิเศษก็คิดเพิ่มรายชิ้นตามขนาดของชิ้นนั้นเช่นกัน\n\n" +
      "ตัวอย่างจากใบเสนอราคาจริง::\n" +
      "• 1 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 140 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 5 = 245 บาท/ชุด\n" +
      "• 11 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 69 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 15 = 184 บาท/ชุด",
    images: [IMG("set-2"), IMG("set-3")],
    imageSize: "md",
  },
  {
    title: "จำนวนชิ้นใน 1 ฐาน",
    text:
      `เลือกได้ 2-${MAX_PIECES} ชิ้น::\n` +
      "• ทุกชิ้นปักอยู่บนฐานอะคริลิคเดียวกัน ร่องเสียบเจาะตามจำนวนชิ้นที่สั่ง\n" +
      "• แต่ละชิ้นตั้งสเปคแยกกันได้ทั้งขนาด เนื้ออะคริลิค และงานสกรีน\n" +
      "• ชิ้นที่วางซ้อนกันควรเรียงจากใหญ่ไปเล็ก ลายด้านหลังจะได้ไม่ถูกบัง\n" +
      `• เกิน ${MAX_PIECES} ชิ้นใน 1 ฐาน ระบบยังไม่ตีราคาให้อัตโนมัติ — ทักไลน์ร้านก่อนสั่ง\n` +
      "• อยากได้ฐานกว้างขึ้นให้ชิ้นเรียงไม่ชนกัน เลือกขนาดฐานใหญ่ขึ้นในช่อง \"ขนาดฐาน\" ได้เลย",
    images: [IMG("set-4"), IMG("set-5")],
    imageSize: "md",
  },
  {
    title: "ขนาดและงานสกรีน",
    text:
      "ขนาดชิ้นงาน::\n" +
      "• ชิ้นที่ 1 (ตัวหลัก) 3-20 ซม. · ชิ้นที่ 2-5 ทำได้ 2-20 ซม.\n" +
      "• วัดจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง และไม่นับส่วนฐาน\n" +
      "• อะคริลิคหนา 3 มม. · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n\n" +
      "งานสกรีน (เลือกแยกได้ทีละชิ้น)::\n" +
      "• สกรีน 1 ด้าน (ใต้ / บน) — ราคามาตรฐานตามตาราง ไม่บวกเพิ่ม\n" +
      `• สกรีน 2 ด้าน — บวกตามขนาดของชิ้นนั้น: 2-5 ซม. +${SCREEN_FEE[twoSideName][3]} · 6-7 ซม. +${SCREEN_FEE[twoSideName][6]} · 8-10 ซม. +${SCREEN_FEE[twoSideName][8]} บาท/ชิ้น\n` +
      `• สกรีน 3 เลเยอร์ — บวกเป็น 2 เท่าของสกรีน 2 ด้าน (2-5 ซม. +${SCREEN_FEE[layerName][3]} · 8-10 ซม. +${SCREEN_FEE[layerName][8]} บาท/ชิ้น)\n` +
      "• เนื้อทึบ (ขาวขุ่น C-02 · สีพิเศษ · กระจก · hologram-01) สกรีนใต้ไม่ได้ ระบบจะเหลือเฉพาะสกรีนผิวบนให้",
    images: [HOWTO],
    imageSize: "lg",
  },
  {
    title: "ฐานสแตนดี้",
    text:
      "ฐานรวมอยู่ในราคาแล้ว — คิดครั้งเดียวต่อชุด::\n" +
      `• ทุกชุดได้ฐานอะคริลิค 1 อัน เลือกได้ว่าจะสกรีนลายลงฐานด้วยไหม (สกรีนฐาน +${printFee} บาท/ชุด)\n` +
      "• ขนาดฐาน 2-20 ซม. — ช่วงราคาปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว\n" +
      `• ตั้งแต่ 11 ชุดขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. +${BASE_PLAIN[3]} · 8 ซม. +${BASE_PLAIN[8]} · 20 ซม. +${BASE_PLAIN[20]} บาท/ชุด\n` +
      "• ทรงฐาน: ทรงกลม / ทรงสี่เหลี่ยม (ไม่บวกเพิ่ม) · ทรงพิเศษไดคัทตามทรง (บวกเพิ่ม)\n" +
      "• งานหลายชิ้นควรเผื่อฐานให้กว้างกว่าปกติ ชิ้นจะได้ไม่เบียดกัน",
  },
  {
    title: "ชนิดอะคริลิค",
    text:
      "อะคริลิคใส / ขาวขุ่น C-02 (มาตรฐาน)::\n" +
      "• ราคาตามตารางคืออะคริลิคใส หรือขาวขุ่น C-02 หนา 3 มม. ราคาเท่ากัน เลือกได้ทีละชิ้น\n" +
      "• อะคริลิคใส = เนื้อใสมองทะลุ · ขาวขุ่น C-02 = เนื้อทึบ ลายเด่นกว่าเพราะไม่มีพื้นหลังทะลุมา\n\n" +
      "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)::\n" +
      `• ช่วง 1-10 ชุด +${SPECIAL_RETAIL[3]} บาท/ชิ้นทุกขนาดถึง 10 ซม.\n` +
      `• ตั้งแต่ 11 ชุดขึ้นไป (ชิ้นที่ 1): 3-5 ซม. +${SPECIAL_WHOLESALE[3]} · 6-8 ซม. +${SPECIAL_WHOLESALE[6]} · 9-10 ซม. +${SPECIAL_WHOLESALE[9]} บาท/ชิ้น\n` +
      `• ขนาด 11 ซม. ขึ้นไปคิดเท่ากันทั้งปลีก/ส่ง: 11 ซม. +${SPECIAL_RETAIL[11]} … 20 ซม. +${SPECIAL_RETAIL[20]} บาท/ชิ้น\n` +
      "• เลือกเนื้อพิเศษให้เฉพาะบางชิ้นในชุดก็ได้ ระบบคิดเพิ่มเฉพาะชิ้นนั้น",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกจำนวนชิ้นใน 1 ฐาน แล้วตั้งสเปคทีละชิ้น (ขนาด · งานสกรีน · เนื้ออะคริลิค) จากนั้นเลือกฐาน\n" +
      '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ" — แยกไฟล์ให้ครบทุกชิ้น\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ลำดับการวางชิ้นหน้า-ชิ้นหลัง\n' +
      "• สั่งหลายชุดลายต่างกัน ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ชุดขึ้นไป สั่งลายละ 5 ชุดขึ้นไป)\n" +
      "• ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แยกไฟล์ให้ชัดว่าชิ้นไหนเป็นชิ้นที่ 1 (ตัวหลัก) ชิ้นไหนเป็นชิ้นที่ 2-5\n" +
      "• ออกแบบให้อยู่ในขนาดที่สั่ง · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n" +
      "• เผื่อส่วนที่เสียบลงฐานด้านล่างของทุกชิ้น ประมาณ 5 มม.\n" +
      "• ชิ้นที่วางซ้อนกันควรเช็คว่าลายชิ้นหลังไม่ถูกชิ้นหน้าบังส่วนสำคัญ\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
  },
  warranty,
];

const saved = {
  ...(await load(ID)),
  id: ID,
  name: NAME,
  category: "acrylic",
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
  bulkAskQty: 100,
  pieceCountLabel: COUNT,
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: IMG("parts"),
  images: [
    { src: IMG("parts"), emoji: "🧍", label: "หลายชิ้นบนฐานเดียว", gradient: "from-sky-200 to-cyan-300" },
    { src: IMG("set-3"), emoji: "🧍", label: "3 ชิ้นใน 1 ฐาน", gradient: "from-sky-200 to-cyan-300" },
    { src: IMG("set-5"), emoji: "🧍", label: "5 ชิ้นใน 1 ฐาน", gradient: "from-sky-200 to-cyan-300" },
  ],
  artworkConsult: {
    enabled: true,
    block: true,
    when: { label: COUNT, choices: [MORE] },
    note:
      `มากกว่า ${MAX_PIECES} ชิ้นใน 1 ฐาน ต้องคุยกับแอดมินก่อนนะครับ — ฐานต้องกว้างขึ้นและคำนวณร่องเสียบใหม่ ` +
      "ส่งไฟล์/แบบที่ต้องการมาทางไลน์ ทางร้านจะตีราคาให้ก่อน ตกลงกันเรียบร้อยแล้วค่อยกดสั่ง",
  },
  description:
    `สแตนดี้อะคริลิคหลายชิ้นปักบนฐานเดียวกัน เลือกได้ 2-${MAX_PIECES} ชิ้นใน 1 ฐาน แต่ละชิ้นเลือกขนาด เนื้ออะคริลิค ` +
    "และงานสกรีนแยกกันได้ อะคริลิคหนา 3 มม. พิมพ์ระบบ UV ไดคัทตามลาย ตัวหลักทำได้ 3-20 ซม. " +
    `ค่าฐานคิดครั้งเดียวต่อชุด เริ่มต้นชุดละ ${money(PRICE_MIN)} บาท`,
  highlights: [
    `หลายชิ้นบนฐานเดียว — เลือกได้ 2-${MAX_PIECES} ชิ้นใน 1 ฐาน`,
    "แต่ละชิ้นตั้งขนาด/เนื้ออะคริลิค/งานสกรีน แยกกันได้",
    "ตัวหลัก 3-20 ซม. · ชิ้นถัดไป 2-20 ซม. คิดเพิ่มเซนละ 10 บาท",
    "ค่าฐานคิดครั้งเดียวต่อชุด ไม่ได้คิดรายชิ้น",
    "อะคริลิคสีพิเศษกว่า 40 เฉด ระบบบวกราคาตามขนาดให้อัตโนมัติ",
    "ไม่มีขั้นต่ำ · 11 ชุดขึ้นไป คละลาย/คละขนาดได้ ลายละ 5 ชุดขึ้นไป",
  ],
  terms:
    "*ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด และไม่นับรวมฐาน หากต้องการให้นับรวมต้องแจ้ง\n" +
    `*เกิน ${MAX_PIECES} ชิ้นใน 1 ฐาน ต้องสอบถามแอดมินก่อนสั่ง\n` +
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
        "อะคริลิคหนา 3 มม. · ราคาต่อ 1 ชุด (รวมทุกชิ้นในฐานเดียวกัน + ฐาน) · 1-10 ชุด ราคาปลีก คละดีเทลได้ไม่จำกัด " +
        "· 11 ชุดขึ้นไป คละลาย คละขนาดได้ แต่ละดีเทลขั้นต่ำ 5 ชุดขึ้นไป",
      minPerDesign: 5,
      freeMixBelowQty: 11,
      underMinPieceFee: 5,
      pricing: PRICING,
    },
  ],
  seo: {
    title: `${NAME} | iDucky Prints Studio`,
    description:
      `สแตนดี้อะคริลิคหลายชิ้นในฐานเดียว เลือกได้ 2-${MAX_PIECES} ชิ้น แต่ละชิ้นเลือกขนาด/เนื้อ/งานสกรีนแยกกัน ` +
      `หนา 3 มม. ตัวหลัก 3-20 ซม. เริ่มต้น ${money(PRICE_MIN)} บาท/ชุด`,
    faqs: [
      {
        q: `${NAME} ราคาเท่าไหร่?`,
        a:
          "ราคาคิดเป็นชุด = ชิ้นที่ 1 ตามตารางขนาด + ชิ้นถัดไปตามขนาดของชิ้นนั้น + ฐาน · " +
          "ตัวอย่างจริง 2 ชิ้นใน 1 ฐาน (ชิ้นหน้า 6 ซม. ชิ้นหลัง 10 ซม. ฐาน 7 ซม.) สั่ง 1 ชุด = 245 บาท · สั่ง 11 ชุด = 184 บาท/ชุด",
      },
      {
        q: "ใส่ได้กี่ชิ้นใน 1 ฐาน?",
        a: `เลือกได้ 2-${MAX_PIECES} ชิ้นใน 1 ฐาน แต่ละชิ้นตั้งขนาด เนื้ออะคริลิค และงานสกรีนแยกกันได้ · เกิน ${MAX_PIECES} ชิ้นต้องสอบถามแอดมินก่อนสั่ง`,
      },
      {
        q: "ชิ้นที่ 2 เป็นต้นไปคิดราคายังไง?",
        a:
          "คิดตามขนาดของชิ้นนั้น เริ่มที่ 2 ซม. = 20 บาท แล้วเพิ่มเซนติเมตรละ 10 บาท " +
          "(สั่งจำนวนมาก ระบบเทียบกับตารางราคาให้ ถ้าราคาในตารางถูกกว่าจะคิดราคาในตารางให้อัตโนมัติ)",
      },
      {
        q: "ค่าฐานคิดต่อชิ้นหรือต่อชุด?",
        a: "คิดครั้งเดียวต่อชุด เพราะทุกชิ้นใช้ฐานเดียวกัน · ช่วงปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว",
      },
      {
        q: "สั่งขั้นต่ำกี่ชุด คละลายได้ไหม?",
        a: "ไม่มีขั้นต่ำ · 1-10 ชุดคละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชุดขึ้นไปคละลาย/คละขนาดได้ ลายละ 5 ชุดขึ้นไป",
      },
    ],
  },
  savedAt: new Date().toISOString(),
};

/* ══ 8. สรุป + บันทึก ═══════════════════════════════════════════════════ */
console.log(`\n📦 ${NAME} (${ID})`);
console.log(`   ตารางราคา ${Object.keys(cells).length} ช่อง × ${TIERS.length} ช่วงจำนวน (${MAIN_SIZES.length} ขนาด × ${SCREENS.length} งานสกรีน × ${COLORS.length} เนื้ออะคริลิค)`);
console.log(`   ✅ ช่องราคาที่ standy มีอยู่ ตรงกันหมด ${checked} ช่อง · เติมค่าสกรีน 3 เลเยอร์ 17-20cm เอง: ${filled.join(" ")}`);
console.log(`   กลุ่มตัวเลือก ${options.length} กลุ่ม · กฎ ${rules.length} ข้อ · ช่วงราคา ${money(PRICE_MIN)}-${money(PRICE_MAX)} บาท/ชุด`);
console.log(`\n   ✅ ตรงกับใบเสนอราคาจริงของร้าน:`);
for (const t of CASES) {
  const q = quote(t.qty, t.front, t.back, t.baseCm);
  console.log(`     ${String(t.qty).padStart(2)} ชุด (${TIERS[q.i]}) · ชิ้นหน้า ${t.front}cm ${q.a} + ชิ้นหลัง ${t.back}cm ${q.b} + ฐาน ${t.baseCm}cm ${q.c} = ${q.total} บาท/ชุด`);
}
console.log(`\n   ราคาชิ้นถัดไป (min ของ "เซนละ 10" กับตาราง):`);
for (const s of [2, 5, 10, 20])
  console.log(`     ${String(s).padStart(2)}cm → ${TIERS.map((t, i) => `${t.replace(" ชิ้น", "")}: ${subPrice(s, i)}`).join(" · ")}`);

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

/**
 * Photo Fram Acrylic (กรอบใส่รูปอะคริลิค) — ดึงราคาสดจากเว็บตารางราคา + ติดภาพจำลองให้ทุกกลุ่มตัวเลือก
 * ผู้ใช้สั่ง 1 ก.ย. 69: "ดึงราคาจากตาราง Photo Fram Acrylic + ทำภาพจำลองของแต่ละกลุ่มให้ด้วย"
 *
 *   npx tsx scripts/photo-frame-acrylic-build.mts           # ดูผล/ตรวจ (ไม่เขียนฐานข้อมูล ไม่อัปรูป)
 *   npx tsx scripts/photo-frame-acrylic-build.mts --write   # อัปรูป + บันทึกจริง (รันซ้ำได้ ผลเหมือนเดิม)
 *
 * ราคา: หน้า /cardholder ไม่ได้วางตารางนี้เป็น <table> — เป็น repeater ของ Wix ที่ข้อมูลจริงฝังมาใน
 * warmupData ท้ายไฟล์ (คอลเลกชัน "PhotoFramAcrylic") จึงอ่านจาก JSON ก้อนนั้นแทนการไล่ DOM
 *   title = ช่วงจำนวน · text = ราคา อะคริลิคใส · text1 = ราคา อะคริลิคพิเศษ
 * ชื่อคอลัมน์อ่านจาก schema ของคอลเลกชัน (displayName) — เว็บเปลี่ยนหัวคอลัมน์เมื่อไหร่ สคริปต์จะร้อง
 *
 * ⚠️ ส่วนต่างของ 2 คอลัมน์บนหน้า /cardholder คือ "อะคริลิคพิเศษ +10 บาท" — ใช้เป็นตัวตรวจสอบเท่านั้น
 *    ราคาจริงของค่าเนื้อพิเศษมาจากตาราง "Add on อะคริลิคพิเศษ" หน้า /keyring (ผู้ใช้สั่ง 2 ก.ย. 69)
 *    ห้ามใส่ extra ทับที่ตัวเลือกอีก — กลุ่มที่เป็นแกนตารางระบบไม่คิด extra ให้อยู่แล้ว (ดู unitPriceFor)
 *
 * 💰 ค่าบริการ 2 ตัวที่ "คิดตามขนาดชิ้นงาน" ดึงสดจากหน้า /keyring (ผู้ใช้ส่งภาพตารางมาสั่งเอง):
 *   • Add on งานสกรีน 2 ด้าน  → ผูกที่ตัวเลือกด้วย choice.sizeFee (ขั้นบันไดตามขนาด ไม่ขึ้นกับจำนวน)
 *   • Add on อะคริลิคพิเศษ    → ต้องอยู่ใน "ช่องตาราง" เพราะราคาต่างกันทั้ง 2 มิติ (ขนาด × ปลีก/ส่ง)
 *     ⇒ ตารางราคาจึงมี 2 แกน: ประเภทเนื้ออะคริลิค × ขนาดชิ้นงาน (แถวปลีก = ช่วง 1-10 อัน · ที่เหลือ = แถวส่ง
 *     ตรงกับที่ standy ทำไว้เป๊ะ — ตรวจแล้ว 2 ก.ย. 69) · ค่าเพิ่มขนาด ซม. ละ 15 ก็ถูกยุบเข้าช่องตารางด้วย
 *     เพราะกลุ่มที่เป็นแกนตารางระบบไม่คิด extra ให้ (ดู [[iducky-price-driver-trap]])
 *
 * ภาพจำลอง: วาดเองด้วย scripts/photo-frame-acrylic-art.mjs (12 ภาพ แนวเรนเดอร์สินค้า ทรงกรอบขอบหยักเหมือนงานจริง)
 *   ยกเว้นกลุ่ม "สีตะขอโซ่ไข่ปลา" ที่ยืมรูปถ่ายจริงชุด hookcolor-C* ของ standee-keyring มาใช้
 *   (ชื่อสีตรงกัน 1:1 อยู่แล้ว — รูปถ่ายจริงดีกว่าวาดสวอตช์เอง)
 *   และกลุ่ม "เลือกเฉดอะคริลิคพิเศษ" ที่ดึงเฉดสดจากคลังกลางใน 3d-acrylic (ดูหัวข้อ 2.5)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photo-fram-acrylic";
const EXPECT_NAME = "Photo Fram Acrylic";
const PAGE = "https://www.iduckyofficial-pricelists.com/cardholder";
const ADDON_PAGE = "https://www.iduckyofficial-pricelists.com/keyring";
const BASE_PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy"; // ตารางค่าฐานสแตนดี้ (ชุดกลาง)
const REV = "v3"; // v3 = สไตล์เรนเดอร์สินค้า (มีความหนา/เงา/ผิวเงา) ที่ผู้ใช้เลือก 1 ก.ย. 69
const ART_DIR = ".cache/photo-fram-acrylic/upload";

/* ── ชื่อกลุ่ม/ตัวเลือกหลังเกลา ────────────────────────────────────────────
 * ของเดิมสะกด "สรีน" ตกตัว ก และตัวเลือกแกนราคาชื่อยกมาจากหัวคอลัมน์ตรง ๆ ("ราคา อะคริลิคใส")
 * ซึ่งอ่านไม่ได้เรื่องบนการ์ดหน้าร้าน — เปลี่ยนชื่อพร้อมกับย้ายคีย์ตารางราคาให้ตรงกัน
 * (สินค้ายังเป็นฉบับร่าง ไม่มีกฎเงื่อนไข/ออเดอร์อ้างชื่อเก่าอยู่)
 */
const G_TYPE = "แบบ";
const G_MAT = "ประเภทเนื้ออะคริลิค";
const G_MAT_OLD = "ประเภท";
const G_SHADE = "เลือกเฉดอะคริลิคพิเศษ";
const G_SIZE = "ขนาดชิ้นงาน";
const G_SIZE_OLD = "ขนาด 5-6 cm";
const G_SCREEN = "สกรีนกี่ด้าน";
const G_SCREEN_OLD = "สรีนกี่ด้าน";
const SCREEN_1 = "สกรีน 1 ด้าน (ด้านหลังอะคริลิคขาวขุ่น C-02)";
const SCREEN_1_OLD = "1 ด้าน (ด้านหลังอะคริลิคขาวขุ่น C-02)";
const SCREEN_2 = "สกรีน 2 ด้าน";
const SCREEN_2_OLD = "2 ด้าน";
const G_HOOK = "สีตะขอโซ่ไข่ปลา";
const G_BASE_SIZE = "ขนาดฐาน";
const G_BASE = "ฐาน";

const MAT_CLEAR = "อะคริลิคใส";
const MAT_SPECIAL = "อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม · กระจก)";
/** ขนาดที่เปิดให้สั่ง — ตารางฐานครอบ 5-6 ซม. ส่วนบนสุดจบที่ 20 ซม. เท่าที่ตาราง Add on บอกราคาไว้ */
const SIZES = Array.from({ length: 16 }, (_, i) => i + 5);
const sizeName = (n: number) => `${n}cm`;
const SIZE_STD_MAX = 6; // ราคาในตารางฐานคือขนาด 5-6 ซม.
const SIZE_ADD_FEE = 15; // เกินจากนั้นคิด ซม. ละ 15 บาท (หน้า /cardholder)

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const pub = (path: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
const art = (name: string) => pub(`products/${ID}/${name}-${REV}.jpg`);

/* ── 1. ตารางราคาสดจากเว็บ ────────────────────────────────────────────── */
const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then(
  (r) => {
    if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
    return r.text();
  }
);

/** ตัดก้อน JSON ที่เริ่มที่ตำแหน่ง i (ต้องเป็น "{") ออกมาโดยนับวงเล็บ — warmupData ยาวเป็นล้านตัวอักษร */
function jsonAt(src: string, i: number): any {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(src.slice(i, j + 1));
  }
  throw new Error("อ่านก้อน JSON ไม่จบ — โครงหน้าเว็บเปลี่ยน");
}

function liveTable() {
  // หัวคอลัมน์อยู่ใน schema ของคอลเลกชัน · ตัวเลขอยู่ในก้อน record ต่างหาก (คนละที่ในไฟล์)
  const schemaAt = html.indexOf('"PhotoFramAcrylic":{"id":"PhotoFramAcrylic"');
  if (schemaAt < 0) throw new Error('หา schema คอลเลกชัน "PhotoFramAcrylic" ไม่เจอ — โครงหน้าเว็บเปลี่ยน');
  const schema = jsonAt(html, html.indexOf("{", schemaAt + '"PhotoFramAcrylic":'.length));
  const head = (f: string) => String(schema.fields?.[f]?.displayName ?? "").replace(/\s+/g, " ").trim();
  const [hQty, hClear, hSpecial] = [head("title"), head("text"), head("text1")];
  if (hQty !== "จำนวน" || !/ใส$/.test(hClear) || !/พิเศษ$/.test(hSpecial))
    throw new Error(`หัวคอลัมน์บนเว็บเปลี่ยน ("${hQty}" | "${hClear}" | "${hSpecial}") — ตรวจก่อน`);

  // ก้อน record คือ "PhotoFramAcrylic" ตัวที่ค่าเป็น map ของ _id → แถว (มีคีย์ "title" อยู่ข้างใน)
  let rows: any[] | null = null;
  for (let i = html.indexOf('"PhotoFramAcrylic":{'); i >= 0; i = html.indexOf('"PhotoFramAcrylic":{', i + 1)) {
    const obj = jsonAt(html, html.indexOf("{", i + '"PhotoFramAcrylic":'.length));
    const vals = Object.values(obj) as any[];
    if (vals.length && vals.every((v) => v && typeof v === "object" && "title" in v && "text" in v)) {
      rows = vals.sort((a, b) =>
        String(a["_manualSort_72246688-8196-4287-a50f-de06197b7aa7"] ?? "").localeCompare(
          String(b["_manualSort_72246688-8196-4287-a50f-de06197b7aa7"] ?? "")
        )
      );
      break;
    }
  }
  if (!rows?.length) throw new Error("หาแถวข้อมูลของ PhotoFramAcrylic ไม่เจอ — โครงหน้าเว็บเปลี่ยน");
  return { hClear, hSpecial, rows };
}

const { hClear, hSpecial, rows } = liveTable();

const tiers = rows.map((r: any) => {
  const label = String(r.title).replace(/\s+/g, " ").trim();
  const m = label.match(/([\d,]+)\s*[-–]\s*([\d,]+)/);
  return { upTo: m ? Number(m[2].replace(/,/g, "")) : null, label };
});
const num = (v: any, where: string) => {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคา ${where} อ่านไม่ออก ("${v}")`);
  return n;
};
const clear = rows.map((r: any, i: number) => num(r.text, `${hClear} แถว ${tiers[i].label}`));
const special = rows.map((r: any, i: number) => num(r.text1, `${hSpecial} แถว ${tiers[i].label}`));

// กันหยิบตารางผิดตัว/อ่านสลับคอลัมน์: ราคาต้องไม่เพิ่มเมื่อจำนวนมากขึ้น · พิเศษต้องแพงกว่าใสเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo) || tiers.at(-1)!.upTo !== null)
  throw new Error(`ช่วงจำนวนบนเว็บอ่านไม่ครบ (${tiers.map((t) => t.label).join(" · ")})`);
for (const [name, col] of [
  [hClear, clear],
  [hSpecial, special],
] as [string, number[]][])
  if (col.some((v, i) => i > 0 && v > col[i - 1])) throw new Error(`ราคา ${name} ไม่ได้ไล่ลง (${col.join(", ")})`);
const gaps = [...new Set(special.map((v, i) => v - clear[i]))];
if (gaps.some((g) => g <= 0)) throw new Error(`อะคริลิคพิเศษถูกกว่าอะคริลิคใสในบางช่วง (${gaps.join(", ")})`);
// คำที่เอาไปเขียนในหมายเหตุ/แท็บ — วันไหนเว็บตั้งส่วนต่างไม่เท่ากันทุกช่วง จะได้ไม่โกหกว่า "+10 ทุกช่วง"
const gapText = gaps.length === 1 ? `฿${gaps[0]}` : `฿${Math.min(...gaps)}-${Math.max(...gaps)} แล้วแต่ช่วงจำนวน`;

console.log(`📊 ตาราง "Photo Fram Acrylic" จาก ${PAGE}`);
console.log(`   ${"จำนวน".padEnd(16)} ${hClear} / ${hSpecial}`);
tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(16)} ${clear[i]} / ${special[i]}`));
console.log(`   ส่วนต่างเนื้อพิเศษ: ${gaps.map((g) => `+${g}`).join(" · ")} บาท`);

/* ── 1b. ตาราง Add on จากหน้า /keyring ─────────────────────────────────────
 * ผู้ใช้ส่งภาพตาราง 2 อันมาสั่ง (2 ก.ย. 69): "สกรีน 2 ด้าน / อะคริลิคพิเศษ คิดตามตารางนี้"
 * หน้านี้วางเป็น <table> จริง (ต่างจาก /cardholder ที่เป็น repeater) — แต่ตารางชุดเดียวกันถูก
 * วางซ้ำหลายรอบตามหมวดสินค้าในหน้า จึงอ่านทุกอันแล้วเทียบกันเอง: ช่องที่ขนาดตรงกันต้องราคาตรงกัน
 * ไม่งั้นแปลว่าหยิบตารางข้ามหมวดมาปน — throw ทิ้งดีกว่าเดาว่าอันไหนใช่
 */
const addonHtml = await fetch(ADDON_PAGE, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" },
}).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${ADDON_PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

/** กาง <table> ทุกอันในหน้าออกมาเป็นตารางข้อความ (แถว × ช่อง) */
function tablesOf(src: string): string[][][] {
  const out: string[][][] = [];
  for (const chunk of src.split(/<table[^>]*>/i).slice(1)) {
    const end = chunk.search(/<\/table>/i);
    if (end < 0) continue;
    const rows = chunk
      .slice(0, end)
      .split(/<tr[^>]*>/i)
      .slice(1)
      .map((r) =>
        r
          .split(/<t[dh][^>]*>/i)
          .slice(1)
          .map((c) =>
            c
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/\s+/g, " ")
              .trim()
          )
      )
      .filter((r) => r.length);
    if (rows.length > 1) out.push(rows);
  }
  return out;
}

/** หัวคอลัมน์ "2cm 3cm …" → [2,3,…] (ช่องแรกเป็นชื่อแถว ข้ามไป) */
function sizeCols(head: string[], where: string): number[] {
  const cols = head.slice(1).map((h) => {
    const m = h.match(/^(\d+)\s*cm$/i);
    if (!m) throw new Error(`หัวคอลัมน์ของตาราง ${where} ไม่ใช่ขนาดเป็น cm ("${h}") — โครงหน้าเว็บเปลี่ยน`);
    return Number(m[1]);
  });
  if (!cols.length || cols.some((n, i) => i > 0 && n <= cols[i - 1]))
    throw new Error(`ขนาดในหัวตาราง ${where} ไม่ได้ไล่จากเล็กไปใหญ่ (${cols.join(", ")})`);
  return cols;
}

/**
 * รวมแถวชื่อ rowName จากทุกตารางที่มีแถวนั้น → Map ขนาด(ซม.) → ราคา
 * ตารางไหนให้ราคาช่องเดียวกันไม่ตรงกัน = หยิบข้ามหมวด ให้ล้มไปเลย
 */
function feeRow(tables: string[][][], rowName: string, where: string): Map<number, number> {
  const fees = new Map<number, number>();
  let found = 0;
  for (const rows of tables) {
    const row = rows.find((r) => r[0] === rowName);
    if (!row) continue;
    const cols = sizeCols(rows[0], where);
    found++;
    cols.forEach((cm, i) => {
      const raw = row[i + 1];
      const v = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`ช่อง ${rowName} ${cm}cm ในตาราง ${where} อ่านไม่ออก ("${raw}")`);
      const had = fees.get(cm);
      if (had != null && had !== v)
        throw new Error(`ตาราง ${where} ขัดกันเอง: ${rowName} ${cm}cm ได้ทั้ง ${had} และ ${v} — ตรวจหน้าเว็บก่อน`);
      fees.set(cm, v);
    });
  }
  if (!found) throw new Error(`หาแถว "${rowName}" ในหน้า ${ADDON_PAGE} ไม่เจอ — โครงหน้าเว็บเปลี่ยน`);
  return fees;
}

const addonTables = tablesOf(addonHtml).filter((rows) => rows[0]?.[0] === "เพิ่มเติม");
if (addonTables.length < 2) throw new Error(`หาตาราง Add on ในหน้า ${ADDON_PAGE} ไม่เจอ — โครงหน้าเว็บเปลี่ยน`);

const R_SCREEN2 = "สกรีน 2 ด้าน";
const R_SPECIAL_RETAIL = "(เรทราคาปลีก) อคล.พิเศษ";
const R_SPECIAL_WHOLE = "(เรทราคาส่ง) อคล.พิเศษ";
const screen2Row = feeRow(addonTables, R_SCREEN2, "Add on งานสกรีน");
const specialRetailRow = feeRow(addonTables, R_SPECIAL_RETAIL, "Add on อะคริลิคพิเศษ");
const specialWholeRow = feeRow(addonTables, R_SPECIAL_WHOLE, "Add on อะคริลิคพิเศษ");

/* หมายเหตุใต้ตาราง = กติกาต่อขนาดที่เกินคอลัมน์สุดท้าย ("บวกเพิ่ม cm ละ 5 บาท") — อ่านสดเหมือนกัน */
const addonText = addonHtml
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ");
/** อ่านหมายเหตุ "…cm ขึ้นไป บวกเพิ่ม cm ละ N บาท" แล้วต่อขั้นบันไดจากคอลัมน์สุดท้ายของตาราง */
function extendBeyond(fees: Map<number, number>, re: RegExp, where: string) {
  const m = addonText.match(re);
  if (!m) throw new Error(`หาหมายเหตุขนาดเกินตารางของ ${where} ไม่เจอ — โครงหน้าเว็บเปลี่ยน`);
  const [from, step] = [Number(m[1]), Number(m[2])];
  const last = Math.max(...fees.keys());
  // "ตั้งแต่ 17cm บวกเพิ่ม cm ละ 5" ต่อจากคอลัมน์ 16 พอดี — ไม่พอดีเมื่อไหร่แปลว่าเว็บแก้ตาราง ให้ล้ม
  if (from !== last + 1) throw new Error(`หมายเหตุ ${where} เริ่มที่ ${from}cm แต่ตารางจบที่ ${last}cm — ตรวจก่อน`);
  for (const n of SIZES) if (n > last) fees.set(n, fees.get(last)! + step * (n - last));
  return { from, step };
}
const screenBeyond = extendBeyond(
  screen2Row,
  /สกรีน 2 ด้าน ขนาดมากกว่า (\d+)\s*cm ขึ้นไป บวกเพิ่ม cm ละ (\d+) บาท/,
  "สกรีน 2 ด้าน"
);
// ตาราง อคล.พิเศษ ยาวถึง 20cm ครบทุกขนาดที่เราขายอยู่แล้ว — อ่านหมายเหตุไว้เผื่อวันหลังเปิดขายใหญ่กว่านี้
const specialBeyond = extendBeyond(
  specialRetailRow,
  /อคล\.พิเศษ ขนาดตั้งแต่ (\d+)\s*cm บวกเพิ่ม cm ละ (\d+) บาท/,
  "อะคริลิคพิเศษ (เรทปลีก)"
);
extendBeyond(specialWholeRow, /อคล\.พิเศษ ขนาดตั้งแต่ (\d+)\s*cm บวกเพิ่ม cm ละ (\d+) บาท/, "อะคริลิคพิเศษ (เรทส่ง)");

const feeAt = (fees: Map<number, number>, n: number, where: string) => {
  const v = fees.get(n);
  if (v == null) throw new Error(`ตาราง ${where} ไม่มีราคาของขนาด ${n}cm — ตรวจก่อน`);
  return v;
};
const screen2Fee = (n: number) => feeAt(screen2Row, n, "สกรีน 2 ด้าน");
const specialFee = (n: number, retail: boolean) =>
  feeAt(retail ? specialRetailRow : specialWholeRow, n, `อะคริลิคพิเศษ (${retail ? "ปลีก" : "ส่ง"})`);

/* ✅ ตรวจไขว้กับหน้า /cardholder: ช่องปลีกของขนาดมาตรฐาน 5-6 ซม. ต้องได้เท่ากับส่วนต่าง 2 คอลัมน์เดิม
 *    (ตอนนี้ทั้งคู่ = +10) — วันไหนไม่ตรงแปลว่าหน้าใดหน้าหนึ่งแก้ราคาแล้ว ต้องมาดูก่อนว่าจะเชื่ออันไหน */
for (const n of [5, 6])
  if (!gaps.includes(specialFee(n, true)))
    throw new Error(
      `ค่าเนื้อพิเศษเรทปลีก ${n}cm จาก /keyring = +${specialFee(n, true)} แต่ /cardholder เขียนไว้ +${gapText} — ตรวจก่อน`
    );

console.log(`\n📊 ตาราง Add on จาก ${ADDON_PAGE}`);
console.log(
  `   ${R_SCREEN2.padEnd(24)} ${SIZES.map((n) => `${n}cm:${screen2Fee(n)}`).join(" ")}` +
    ` (เกิน ${screenBeyond.from}cm +${screenBeyond.step}/ซม.)`
);
console.log(`   ${"อคล.พิเศษ ปลีก".padEnd(24)} ${SIZES.map((n) => `${n}cm:${specialFee(n, true)}`).join(" ")}`);
console.log(
  `   ${"อคล.พิเศษ ส่ง".padEnd(24)} ${SIZES.map((n) => `${n}cm:${specialFee(n, false)}`).join(" ")}` +
    ` (เกิน ${specialBeyond.from}cm +${specialBeyond.step}/ซม.)`
);

/** ช่วง "฿ต่ำ-฿สูง" ของค่าบริการตามขนาด — เอาไปเขียนใน note/desc ให้ลูกค้าเห็นกรอบราคาก่อนเลือก */
const rangeText = (vals: number[]) => {
  const [lo, hi] = [Math.min(...vals), Math.max(...vals)];
  return lo === hi ? `฿${lo}` : `฿${lo}-${hi}`;
};
const screenText = rangeText(SIZES.map(screen2Fee));
const specialText = rangeText(SIZES.flatMap((n) => [specialFee(n, true), specialFee(n, false)]));

/* ── 1c. ตารางค่าฐานสแตนดี้ จากหน้า /pricestandy ────────────────────────────
 * ผู้ใช้สั่ง 2 ก.ย. 69 (ส่งภาพตารางมา): "ค่าฐานสแตนดี้ทั้งปลีกและส่ง บวกเพิ่มตามตารางได้เลย"
 * ของเดิมกลุ่มฐานเขียนไว้ว่า "ทุกขนาดฐานรวมอยู่ในราคาแล้ว" ซึ่งไม่มีที่มา — หน้า /cardholder
 * ไม่พูดถึงฐานเลยสักคำ (ตารางที่นั่นเป็นราคาตัวกรอบล้วน ๆ) ค่าฐานจึงต้องมาจากตารางชุดกลางหน้านี้
 *   • เป็นตารางเดียวกับที่ระบบฐานสแตนดี้ของ standy ใช้ (ดู scripts/acrylic-mirror-build.mts ที่ assert ไว้)
 *   • หน้านี้วางตารางซ้ำ 2 รอบ → อ่านทุกอันแล้วเทียบกันเอง ช่องเดียวกันต้องราคาตรงกัน ไม่งั้น throw
 *   • ⚠️ ไม่ตั้ง extraFromQty ให้กลุ่มฐาน = คิดเท่ากันทุกช่วงจำนวน (นี่คือ "ทั้งปลีกและส่ง" ที่ผู้ใช้สั่ง)
 *     ต่างจาก standy ที่แยก 2 ขั้น (ปลีก extraBelow / ส่ง extra)
 */
const baseHtml = await fetch(BASE_PAGE, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" },
}).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${BASE_PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

const R_BASE_PLAIN = "ไม่สกรีนฐาน";
const R_BASE_PRINT = "สกรีนฐาน";

/**
 * หัวคอลัมน์ตารางค่าฐานเป็น "ช่วง" บ้าง ("3-5cm" · "6-7cm") เป็นเลขเดี่ยวบ้าง ("8" · "9cm")
 * → เก็บเป็นช่วง [from,to] เพื่อกางออกเป็น "รายเซนติเมตร" ได้ (ผู้ใช้สั่งแยก 3,4,5,6,7 · 2 ก.ย. 69)
 */
type BaseBand = { from: number; to: number; plain: number; print: number };
function baseFeeBands(): BaseBand[] {
  const bands = new Map<string, BaseBand>();
  let found = 0;
  for (const rows of tablesOf(baseHtml)) {
    const plain = rows.find((r) => r[0] === R_BASE_PLAIN);
    const print = rows.find((r) => r[0] === R_BASE_PRINT);
    if (!plain || !print) continue;
    found++;
    rows[0].slice(1).forEach((h, i) => {
      const m = h.replace(/cm/gi, "").replace(/\s/g, "").match(/^(\d+)(?:[-–](\d+))?$/);
      if (!m) throw new Error(`หัวคอลัมน์ตารางค่าฐานอ่านไม่ออก ("${h}") — โครงหน้าเว็บเปลี่ยน`);
      const band: BaseBand = {
        from: Number(m[1]),
        to: Number(m[2] ?? m[1]),
        plain: Number(plain[i + 1]),
        print: Number(print[i + 1]),
      };
      if (!(band.plain > 0) || !(band.print > 0))
        throw new Error(`ช่องค่าฐาน ${h} อ่านไม่ออก ("${plain[i + 1]}" / "${print[i + 1]}")`);
      const key = `${band.from}-${band.to}`;
      const had = bands.get(key);
      if (had && (had.plain !== band.plain || had.print !== band.print))
        throw new Error(`ตารางค่าฐานในหน้า ${BASE_PAGE} ขัดกันเองที่ช่อง ${h} — ตรวจหน้าเว็บก่อน`);
      bands.set(key, band);
    });
  }
  if (!found)
    throw new Error(`หาตารางค่าฐาน ("${R_BASE_PLAIN}" / "${R_BASE_PRINT}") ในหน้า ${BASE_PAGE} ไม่เจอ — โครงหน้าเว็บเปลี่ยน`);
  const list = [...bands.values()].sort((a, b) => a.from - b.from);
  // ช่วงต้องต่อกันสนิท ไม่งั้นกางรายเซนติเมตรแล้วจะมีขนาดที่ไม่มีราคาโดยไม่รู้ตัว
  list.forEach((b, i) => {
    if (b.to < b.from || (i > 0 && b.from !== list[i - 1].to + 1))
      throw new Error(`ช่วงขนาดในตารางค่าฐานไม่ต่อกัน (${list.map((x) => `${x.from}-${x.to}`).join(" ")}) — ตรวจก่อน`);
  });
  return list;
}
const BASE_BANDS = baseFeeBands();
// ส่วนต่างของแถว "สกรีนฐาน" ต้องคงที่ทุกช่อง ถึงจะแยกออกมาเป็น +฿ ของกลุ่ม "ฐาน" กลุ่มเดียวได้
const printDiffs = [...new Set(BASE_BANDS.map((b) => b.print - b.plain))];
if (printDiffs.length !== 1 || printDiffs[0] <= 0)
  throw new Error(`ส่วนต่าง "${R_BASE_PRINT}" ไม่คงที่ (${printDiffs.join(", ")}) — แยกเป็น +฿ กลุ่มเดียวไม่ได้ ตรวจก่อน`);
const BASE_PRINT_FEE = printDiffs[0];
/** ค่าฐาน (ยังไม่สกรีน) ของฐานขนาด n ซม. */
const baseFee = (n: number) => {
  const b = BASE_BANDS.find((x) => n >= x.from && n <= x.to);
  if (!b)
    throw new Error(
      `ตารางค่าฐานไม่ครอบขนาด ${n}cm (มี ${BASE_BANDS.map((x) => `${x.from}-${x.to}`).join(" ")}) — ตรวจก่อน`
    );
  return b.plain;
};

/* ขนาดฐานที่เปิดให้เลือก — ผู้ใช้สั่ง 2 ก.ย. 69: "แยกขนาดฐานออก 3,4,5,6,7 และทำเป็น dropdown"
 * (ของเดิมเป็นการ์ด 3 ใบตามชื่อคอลัมน์ตาราง "3-5 / 6-7 / 8" ซึ่งลูกค้าต้องเดาเองว่าฐานตัวเองกี่ ซม.)
 * เก็บ 8 ซม. ไว้ด้วย = ฐานใหญ่สุดที่หน้าเว็บร้านเปิดขาย · ชื่อทรง "Ncm" เหมือนกลุ่มขนาดชิ้นงาน */
const BASE_SIZES = [3, 4, 5, 6, 7, 8];
const baseName = (n: number) => `${n}cm`;
const baseFile = (n: number) => `base-${n}`;
const baseText = rangeText(BASE_SIZES.map(baseFee));
/** ช่วงราคาตามที่ร้านคิด เอาไปเขียนใน note ให้เห็นที่มา ("3-5 ซม. ฿10 · 6-7 ซม. ฿15 · 8 ซม. ฿20") */
const bandText = BASE_BANDS.filter((b) => b.from <= BASE_SIZES[BASE_SIZES.length - 1])
  .map((b) => `${b.from === b.to ? b.from : `${b.from}-${b.to}`} ซม. ฿${b.plain}`)
  .join(" · ");

console.log(`\n📐 ตารางค่าฐานสแตนดี้ จาก ${BASE_PAGE}`);
console.log(`   ${"ช่วงราคาในตาราง".padEnd(24)} ${bandText}`);
console.log(
  `   ${R_BASE_PLAIN.padEnd(24)} ${BASE_SIZES.map((n) => `${baseName(n)}:${baseFee(n)}`).join(" ")}` +
    ` · ${R_BASE_PRINT} +${BASE_PRINT_FEE} (คิดทั้งเรทปลีกและเรทส่ง)`
);

/* ── 2. รูปตะขอ — ยืมรูปถ่ายจริงจาก standee-keyring (ชื่อสีตรงกันอยู่แล้ว) ── */
const { data: kr, error: krErr } = await sb.from("products").select("data").eq("id", "standee-keyring").single();
if (krErr) throw new Error(`อ่าน standee-keyring (คลังรูปตะขอ) ไม่สำเร็จ — ${krErr.message}`);
const hookLib = new Map<string, string>();
for (const o of (kr.data as any)?.options ?? [])
  if (/^ตะขอ$|^สีตะขอ C /.test(String(o.label)))
    for (const c of o.choices ?? []) if (c.imageSrc) hookLib.set(String(c.name), String(c.imageSrc));
/** ชื่อสีของเรา ↔ ชื่อในคลัง: ของเราตัดคำว่า "(สีเงิน) — ฟรี" ออกจากหัวโซ่ Z2 */
const hookImage = (name: string) =>
  hookLib.get(name) ?? hookLib.get(name.replace(/^ตะขอ Z2 โซ่ไข่ปลาสีเงิน$/, "Z2 โซ่ไข่ปลา (สีเงิน) — ฟรี"));

/* ── 2.5 เฉดอะคริลิคพิเศษ — ดึงจากคลังเฉดกลาง (3d-acrylic) แล้วกรองเอา 3 ตระกูล ────
 * หน้า /cardholder ระบุของสินค้าตัวนี้ไว้ชัดว่า "อะคริลิคกลิสเตอร์ | โฮโลแกรม | กระจก บวกเพิ่ม 10 บาท"
 * — ไม่ได้พูดถึงอะคริลิค "สีทึบ" เลย เมนูเฉดจึงกรองเหลือเฉพาะ 3 ตระกูลนี้ (17 เฉด) ไม่ใช่ยกมาทั้ง 44
 * ดึงสดทุกครั้งเพื่อให้ชื่อ/รูปตามคลังกลาง — วันไหนคลังเพิ่มเฉดโฮโลแกรม สินค้านี้ได้ตามอัตโนมัติ
 */
const SHADE_FAMILY = /กากเพชร|กลิตเตอร์|hologram|กระจก/i;
const { data: lib, error: libErr } = await sb.from("products").select("data").eq("id", "3d-acrylic").single();
if (libErr) throw new Error(`อ่าน 3d-acrylic (คลังเฉดอะคริลิคพิเศษ) ไม่สำเร็จ — ${libErr.message}`);
const libGroup = ((lib.data as any)?.options ?? []).find((o: any) => /^เลือกเฉดสีพิเศษ/.test(String(o.label)));
if (!libGroup) throw new Error('ไม่เจอกลุ่ม "เลือกเฉดสีพิเศษ" ใน 3d-acrylic — คลังเฉดกลางย้ายที่แล้ว ตรวจก่อน');
const SHADES = (libGroup.choices ?? [])
  .filter((c: any) => SHADE_FAMILY.test(String(c.name)))
  // เฉดทุกตัวราคาเท่ากัน — ค่าเนื้อพิเศษคิดไปแล้วที่ช่องตาราง จึงต้องไม่มี extra ติดมาจากคลัง
  .map((c: any) => ({ name: String(c.name), imageSrc: c.imageSrc }));
if (SHADES.length < 12) throw new Error(`กรองเฉดพิเศษได้แค่ ${SHADES.length} เฉด — คลังกลางเปลี่ยนชื่อ ตรวจก่อน`);
if (SHADES.some((s: any) => !s.imageSrc)) throw new Error("มีเฉดที่ไม่มีรูปในคลังกลาง — ตรวจก่อน");

/* ── 3. อ่านสินค้าเดิม แล้วแก้เฉพาะส่วนที่ตั้งใจ (ไม่เขียนทับทั้งใบ) ────── */
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
if (row.name !== EXPECT_NAME) throw new Error(`ชื่อไม่ตรงที่คาด ("${row.name}") — หยุดกันเขียนทับผิดตัว`);
const d: any = structuredClone(row.data);
const opts: any[] = d.options ?? [];
const log: string[] = [];

const group = (label: string, oldLabel?: string) => {
  const g = opts.find((o) => o.label === label) ?? (oldLabel ? opts.find((o) => o.label === oldLabel) : undefined);
  if (!g) throw new Error(`ไม่เจอกลุ่ม "${label}"${oldLabel ? ` / "${oldLabel}"` : ""} — โครงสินค้าเปลี่ยน ตรวจก่อน`);
  if (g.label !== label) {
    log.push(`เปลี่ยนชื่อกลุ่ม "${g.label}" → "${label}"`);
    g.label = label;
  }
  return g;
};
/** ตั้งค่าตัวเลือก (เปลี่ยนชื่อจากชื่อเดิมได้) — รันซ้ำแล้วผลเหมือนเดิม */
const setChoice = (g: any, name: string, patch: any, oldName?: string) => {
  const c = g.choices.find((x: any) => x.name === name) ?? (oldName ? g.choices.find((x: any) => x.name === oldName) : undefined);
  if (!c) throw new Error(`กลุ่ม "${g.label}" ไม่มีตัวเลือก "${name}"${oldName ? ` / "${oldName}"` : ""}`);
  if (c.name !== name) {
    log.push(`  เปลี่ยนชื่อตัวเลือก "${c.name}" → "${name}"`);
    c.name = name;
  }
  Object.assign(c, patch);
  return c;
};

/* 3.1 แบบ (พวงกุญแจ / สแตนดี้) */
const gType = group(G_TYPE);
gType.display = "cards";
gType.note = `พวงกุญแจ = เจาะรู + โซ่ไข่ปลา · สแตนดี้ = ตัวงานราคาเท่ากัน แต่คิดค่าฐานเพิ่มตามขนาด ${baseText}`;
setChoice(gType, "พวงกุญแจ", {
  desc: "เจาะรูด้านบน ร้อยโซ่ไข่ปลา ห้อยกระเป๋า/กุญแจได้ — แถมโซ่สีเงินให้ทุกอัน",
  imageSrc: art("type-keyring"),
});
setChoice(gType, "สแตนดี้", {
  desc: `เสียบฐานอะคริลิค ตั้งโชว์บนโต๊ะ — เลือกขนาดฐานและจะสกรีนลายฐานด้วยก็ได้ (ค่าฐาน ${baseText} ต่ออัน)`,
  imageSrc: art("type-standee"),
});

/* 3.2 ประเภทเนื้ออะคริลิค = แกนตารางราคา (2 คอลัมน์) */
const gMat = group(G_MAT, G_MAT_OLD);
gMat.display = "cards";
gMat.stockBearing = true;
gMat.note = `เนื้อพิเศษบวกเพิ่มตามขนาดชิ้นงาน ${specialText} (คิดในตารางราคาให้แล้ว)`;
// extra:10 ของเดิมเป็นของตายซาก — กลุ่มที่เป็นแกนตารางระบบไม่คิด extra อยู่แล้ว (ดู unitPriceFor)
setChoice(
  gMat,
  MAT_CLEAR,
  { desc: "เนื้อใสมองทะลุ หนาประมาณ 3 มม. · ราคาตามตาราง ไม่บวกเพิ่ม", imageSrc: art("mat-clear"), extra: undefined },
  hClear
);
setChoice(
  gMat,
  MAT_SPECIAL,
  {
    desc: `เนื้อกลิตเตอร์ / โฮโลแกรม / กระจก หนาประมาณ 2.5-3 มม. · บวกเพิ่มตามขนาด ${specialText}`,
    imageSrc: art("mat-special"),
    extra: undefined,
  },
  hSpecial
);
for (const c of gMat.choices) delete c.extra;

/* 3.2b เลือกเฉด — โผล่เฉพาะตอนเลือกเนื้อพิเศษ (แบบเดียวกับ standy / 3d-acrylic)
 * ทุกเฉดราคาเท่ากัน (+0) เพราะค่าเนื้อพิเศษคิดไปแล้วที่คอลัมน์ตาราง — ห้ามใส่ extra ซ้ำ
 */
const shadeGroup = {
  label: G_SHADE,
  display: "dropdown",
  showWhen: { label: G_MAT, choices: [MAT_SPECIAL] },
  note: `${SHADES.length} เฉด ราคาเท่ากันทุกเฉด — ค่าเนื้อพิเศษคิดแล้วที่ตารางราคา (${specialText} ต่ออัน ตามขนาด)`,
  choices: SHADES,
};
const shadeAt = opts.findIndex((o) => o.label === G_SHADE);
if (shadeAt < 0) {
  opts.splice(opts.indexOf(gMat) + 1, 0, shadeGroup);
  log.push(`เพิ่มกลุ่ม "${G_SHADE}" (${SHADES.length} เฉด) ต่อท้ายกลุ่มเนื้ออะคริลิค`);
} else {
  // รันซ้ำ: คงตัวเลือกที่ลูกค้า/แอดมินเลือกไว้ไม่ได้อยู่แล้ว (เป็นรายการเฉด) — ทับด้วยของสดจากคลัง
  opts[shadeAt] = { ...opts[shadeAt], ...shadeGroup };
}

/* 3.3 ขนาดชิ้นงาน — เลือกเป็น ซม. ตรง ๆ (กลายเป็นแกนตารางราคาที่ 2)
 * ของเดิมเป็นช่องกด "เพิ่มขนาดเกิน 6 ซม. กี่ ซม." ซึ่งอ่านเป็นตัวเลขขนาดไม่ได้ — พอค่าสกรีน 2 ด้าน
 * กับค่าเนื้อพิเศษต้องคิดตามขนาด (ตาราง Add on) ก็ต้องรู้ "ขนาดจริง" ไม่ใช่แค่ส่วนที่เกิน
 * ⇒ เปลี่ยนเป็นเมนู 5cm-20cm ทรงเดียวกับ standy/keyring · ค่าเพิ่ม ซม. ละ 15 ยุบเข้าช่องตารางแทน extra
 */
const gSize = group(G_SIZE, G_SIZE_OLD);
gSize.display = "dropdown";
gSize.note =
  `ราคาในตารางคือขนาดมาตรฐาน 5-6 ซม. — ใหญ่กว่านั้นคิดเพิ่ม ซม. ละ ฿${SIZE_ADD_FEE} (คิดให้ในราคาแล้ว)` +
  " · วัดจากด้านที่ยาวที่สุดของชิ้นงาน";
gSize.choices = SIZES.map((n) => ({ name: sizeName(n) }));

/* 3.4 สกรีนกี่ด้าน */
const gScreen = group(G_SCREEN, G_SCREEN_OLD);
gScreen.display = "cards";
gScreen.note = `ค่าสกรีน 2 ด้าน คิดตามขนาดชิ้นงาน ${screenText} ต่ออัน (ตาราง Add on หน้าราคาพวงกุญแจอะคริลิค)`;
// ชื่อในฐานข้อมูลถูกเติมคำว่า "สกรีน" นำหน้าไว้ทีหลัง — รับได้ทั้งชื่อเก่า/ใหม่ สคริปต์จะได้รันซ้ำได้
setChoice(
  gScreen,
  SCREEN_1,
  {
    desc: "พิมพ์ลายด้านหน้าด้านเดียว ด้านหลังเป็นอะคริลิคขาวขุ่น C-02 — แบบมาตรฐานตามตารางราคา",
    imageSrc: art("screen-1side"),
  },
  SCREEN_1_OLD
);
setChoice(gScreen, SCREEN_2, {
  desc: `พิมพ์ลายทั้งสองด้าน ใช้คนละลายได้ — บวกเพิ่มตามขนาด ${screenText} ต่ออัน`,
  imageSrc: art("screen-2side"),
  /* 📏 ค่าสกรีน 2 ด้าน = ขั้นบันไดตามขนาดชิ้นงาน (ไม่ขึ้นกับจำนวน จึงไม่ต้องเข้าตาราง)
   * ชี้ทั้งด้านกว้าง/ด้านยาวไปที่เมนูขนาดกลุ่มเดียว — sizeFee อ่าน "8cm" เป็น 8 ให้เอง
   * (ทรงเดียวกับที่ standee-multi-piece ใช้) */
  sizeFee: {
    widthLabel: G_SIZE,
    heightLabel: G_SIZE,
    tiers: SIZES.map((n) => ({ upTo: n, fee: screen2Fee(n) })),
  },
}, SCREEN_2_OLD);

/* 3.5 สีตะขอโซ่ไข่ปลา — รูปถ่ายจริงจากคลัง standee-keyring */
const gHook = group(G_HOOK);
gHook.display = "dropdown";
gHook.note = "โซ่ไข่ปลาสีเงินแถมให้ทุกอัน · เปลี่ยนเป็นสีอื่น 11 อันขึ้นไปคิดเพิ่มอันละ ฿3";
const missing: string[] = [];
for (const c of gHook.choices) {
  const src = hookImage(c.name);
  if (src) c.imageSrc = src;
  else missing.push(c.name);
}
if (missing.length) throw new Error(`ไม่เจอรูปตะขอในคลัง standee-keyring: ${missing.join(", ")}`);

/* 3.6 ขนาดฐาน (เฉพาะแบบสแตนดี้) */
const gBaseSize = group(G_BASE_SIZE);
gBaseSize.display = "dropdown"; // ผู้ใช้สั่ง 2 ก.ย. 69 — 6 ขนาดเรียงเป็นการ์ดแล้วยาวเกินไป
// ไม่ตั้ง extraFromQty = +฿ นี้คิดเท่ากันทุกช่วงจำนวน (ผู้ใช้สั่ง "ทั้งปลีกและส่ง" 2 ก.ย. 69)
delete gBaseSize.extraFromQty;
gBaseSize.note =
  `ค่าฐานคิดเพิ่มตามขนาด ${baseText} ต่ออัน — เท่ากันทั้งราคาปลีกและราคาส่ง` +
  ` (ร้านคิดเป็นช่วง: ${BASE_BANDS.filter((b) => b.from <= BASE_SIZES.at(-1)!).map((b) => `${b.from === b.to ? `${b.from}` : `${b.from}-${b.to}`} ซม. ฿${b.plain}`).join(" · ")})`;
const BASE_DESC: Record<number, string> = {
  3: "ฐานเล็กสุด เหมาะกับกรอบเล็ก 5-6 ซม. ที่ไม่อยากให้ฐานเด่นกว่าตัวงาน",
  4: "ฐานเล็ก ตั้งบนโต๊ะทำงาน/ชั้นแคบได้สบาย",
  5: "ฐานเล็กที่มั่นคงขึ้น — คู่กับกรอบขนาดมาตรฐาน 5-6 ซม.",
  6: "ฐานกลาง เริ่มรับกรอบที่สั่งใหญ่กว่ามาตรฐานได้",
  7: "ฐานกลาง ตั้งได้มั่นคงขึ้นสำหรับกรอบทรงสูง",
  8: "ฐานใหญ่สุดที่สั่งผ่านหน้าเว็บได้ — มั่นคงที่สุด",
};
gBaseSize.choices = BASE_SIZES.map((n) => ({
  name: baseName(n),
  desc: `${BASE_DESC[n]} · บวกเพิ่มอันละ ฿${baseFee(n)}`,
  imageSrc: art(baseFile(n)),
  extra: baseFee(n),
}));
log.push(`ขนาดฐาน: แยกเป็นรายเซนติเมตร ${BASE_SIZES.map(baseName).join(" · ")} (dropdown)`);

/* 3.7 ฐาน ใส / สกรีนลาย */
const gBase = group(G_BASE);
gBase.display = "cards";
delete gBase.extraFromQty; // เช่นเดียวกับขนาดฐาน: คิดทั้งเรทปลีกและเรทส่ง
gBase.note = `สกรีนลายบนฐาน บวกเพิ่มอันละ ฿${BASE_PRINT_FEE} — เท่ากันทั้งราคาปลีกและราคาส่ง`;
setChoice(gBase, "แบบใส", {
  desc: "ฐานอะคริลิคใส ไม่มีลาย — แบบมาตรฐาน ไม่บวกเพิ่มจากค่าฐาน",
  imageSrc: art("base-plain"),
  extra: undefined,
  extraBelow: undefined,
});
setChoice(
  gBase,
  "สกรีนลาย",
  {
    desc: `พิมพ์ลายลงบนฐาน (คนละไฟล์กับลายบนกรอบ) — แจ้งลายฐานในหมายเหตุถึงร้าน · บวกเพิ่มอันละ ฿${BASE_PRINT_FEE}`,
    imageSrc: art("base-printed"),
    extra: BASE_PRINT_FEE,
    extraBelow: undefined,
  },
  "สรีนลาย"
);

/* ── 4. ราคา — เขียนทับด้วยตัวเลขสดจากเว็บ ──────────────────────────────── */
/*
 * ช่องราคา = ราคาอะคริลิคใสตามช่วงจำนวน + ค่าเพิ่มขนาด (ซม. ละ 15 จากขนาดมาตรฐาน 6 ซม.)
 *            + ค่าเนื้อพิเศษตามขนาด (แถวปลีกใช้กับช่วง 1-10 อัน · แถวส่งใช้กับช่วงที่เหลือ)
 * ⚠️ คอลัมน์ "ราคา อะคริลิคพิเศษ" ของ /cardholder (+10 ทุกช่วง) ไม่ได้ใช้คิดเงินแล้ว — เหลือไว้ตรวจไขว้
 *    เฉพาะช่องปลีกขนาดมาตรฐาน (ดูหัวข้อ 1b)
 */
const isRetailTier = (i: number) => i === 0; // แถวแรก = 1-10 อัน = เรทราคาปลีกของตาราง Add on
const cells: Record<string, number[]> = {};
for (const n of SIZES) {
  const sizeAdd = Math.max(0, n - SIZE_STD_MAX) * SIZE_ADD_FEE;
  cells[`${MAT_CLEAR}│${sizeName(n)}`] = clear.map((v) => v + sizeAdd);
  cells[`${MAT_SPECIAL}│${sizeName(n)}`] = clear.map((v, i) => v + sizeAdd + specialFee(n, isRetailTier(i)));
}
const pricing = {
  unit: "อัน",
  tiers,
  driverLabels: [G_MAT, G_SIZE],
  cells,
};
d.pricing = pricing;
// เรทเดียว minQty 11 = "1-10 อัน ยังเป็นราคาปลีก" (ไม่ใช่ขั้นต่ำที่บล็อกการสั่ง — เว็บบอกไม่มีขั้นต่ำ)
d.priceRates = [
  {
    ...(d.priceRates?.[0] ?? { id: "r1", label: "เรทที่ 1" }),
    minQty: 11,
    minPerDesign: 5,
    freeMixBelowQty: 11,
    pricing,
  },
];
const allCells = Object.values(cells).flat();
d.price = cells[`${MAT_CLEAR}│${sizeName(SIZES[0])}`][0];
d.priceMin = Math.min(...allCells);
d.priceMax = Math.max(...allCells);

/* ── 5. แท็บรายละเอียด — ยกข้อความจากหน้าตารางราคา ─────────────────────── */
const DETAIL = [
  "• กรอบใส่รูปอะคริลิค (Photo Fram Acrylic) — แผ่นอะคริลิคไดคัทเป็นกรอบ เจาะช่องกลางไว้สอดรูป/โฟโต้การ์ด สกรีนลายได้ตามสั่ง",
  "• อะคริลิคใส หนาประมาณ 3 มม. · อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม · กระจก) หนาประมาณ 2.5-3 มม.",
  "• พิมพ์ด้วยระบบ UV Printing สีสวยคมชัด สีไม่ซีดไม่หลุดลอก",
  "• ไม่มีขั้นต่ำในการสั่งผลิต · สกรีน 1 ด้าน เป็นแบบมาตรฐานตามตารางราคา",
  `• ขนาดมาตรฐาน 5-6 ซม. — ใหญ่กว่านั้นคิดเพิ่ม ซม. ละ ${SIZE_ADD_FEE} บาท (สั่งได้ถึง ${SIZES.at(-1)} ซม.)`,
  `• สกรีน 2 ด้าน บวกเพิ่มตามขนาดชิ้นงาน ${screenText} ต่ออัน` +
    ` (${SIZES.filter((n) => n <= 10).map((n) => `${n} ซม. ${screen2Fee(n)}`).join(" · ")} … ${SIZES.at(-1)} ซม. ${screen2Fee(SIZES.at(-1)!)})`,
  `• อะคริลิคกลิตเตอร์ / โฮโลแกรม / กระจก บวกเพิ่มตามขนาด ${specialText} ต่ออัน` +
    ` — ช่วง 1-10 อัน คิดเรทปลีก (ขนาดมาตรฐาน +${specialFee(6, true)}) · 11 อันขึ้นไป คิดเรทส่ง (ขนาดมาตรฐาน +${specialFee(6, false)})`,
  `• แบบสแตนดี้ คิดค่าฐานอะคริลิคเพิ่มตามขนาดฐาน (${BASE_SIZES.map((n) => `${n} ซม. ${baseFee(n)}`).join(" · ")} บาท)` +
    ` · สกรีนลายบนฐานบวกเพิ่มอีกอันละ ${BASE_PRINT_FEE} บาท — คิดเท่ากันทั้งราคาปลีกและราคาส่ง`,
  "• แบบพวงกุญแจ มีโซ่ไข่ปลาสีเงินให้ · เปลี่ยนเป็นสีอื่นได้ (11 อันขึ้นไป คิดเพิ่มอันละ 3 บาท)",
  "• จำนวน 11 อันขึ้นไปคละลายได้ ขั้นต่ำลายละ 5 อัน — ไม่ถึงตามจำนวน คิดตามราคาปลีก",
].join("\n");
d.tabs = [
  { title: "รายละเอียดเพิ่มเติม", text: DETAIL },
  ...(d.tabs ?? []).filter((t: any) => t.title !== "รายละเอียดเพิ่มเติม"),
];
d.description = "กรอบใส่รูปอะคริลิค สกรีนลายตามสั่ง ทำได้ทั้งแบบพวงกุญแจและสแตนดี้ตั้งโต๊ะ";
d.highlights = ["สกรีนลายตามสั่ง", "เลือกเนื้อใส / กลิตเตอร์ / โฮโลแกรม / กระจก", "ไม่มีขั้นต่ำ · 11 อันขึ้นไปคละลายได้"];
d.savedAt = new Date().toISOString();

console.log(`\n🧩 ตัวเลือก ${opts.length} กลุ่ม · แกนราคา: ${pricing.driverLabels.join(" × ")} (${Object.keys(cells).length} ช่อง)`);
for (const l of log) console.log(`   ${l}`);
for (const o of opts) {
  const n = (o.choices ?? []).filter((c: any) => c.imageSrc).length;
  console.log(`   ${String(o.label).padEnd(28)} ${n}/${o.choices?.length ?? 0} มีรูป · display=${o.display ?? "pills"}`);
}
console.log(`💰 ราคา ฿${d.priceMin}-${d.priceMax} (ตั้งต้น ฿${d.price})`);

if (!WRITE) {
  console.log(`\n(ยังไม่เขียน — ดูภาพใน ${ART_DIR} ก่อน แล้วใส่ --write เพื่ออัปรูป + บันทึกลง Supabase)`);
  process.exit(0);
}

/* ── 6. อัปรูป + บันทึก ─────────────────────────────────────────────────── */
execFileSync("node", ["scripts/photo-frame-acrylic-art.mjs", `--out=${ART_DIR}`], { stdio: "inherit" });
for (const file of readdirSync(ART_DIR).filter((f) => f.endsWith(".jpg"))) {
  const dest = `products/${ID}/${file.replace(/\.jpg$/, `-${REV}.jpg`)}`;
  const up = await sb.storage
    .from("product-images")
    .upload(dest, readFileSync(`${ART_DIR}/${file}`), { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file} ไม่สำเร็จ — ${up.error.message}`);
  console.log(`⬆️  ${dest}`);
}

// คอลัมน์กระจก (name/category/price) ต้องอัปพร้อม data ไม่งั้นลิสต์หลังบ้าน/หน้าร้านโชว์ราคาเก่า
const { error: wErr } = await sb.from("products").update({ price: d.price, data: d }).eq("id", ID);
if (wErr) throw new Error(`บันทึกไม่สำเร็จ — ${wErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}${d.hidden ? " (ยังเป็นฉบับร่าง — กดเผยแพร่ที่ /admin/products)" : ""}`);

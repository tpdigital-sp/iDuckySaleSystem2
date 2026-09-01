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
 * ⚠️ ส่วนต่างของ 2 คอลัมน์คือ "อะคริลิคพิเศษ +10 บาท" ตามที่หน้าเว็บเขียนไว้ — ราคาพิเศษอยู่ใน
 *    ช่องตารางแล้ว ห้ามใส่ extra:10 ทับที่ตัวเลือกอีก (กลุ่มที่เป็นแกนตารางระบบไม่คิด extra ให้อยู่แล้ว
 *    ดู unitPriceFor — ของเดิมมี extra:10 ค้างไว้ สคริปต์นี้ถอดทิ้ง)
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
const G_HOOK = "สีตะขอโซ่ไข่ปลา";
const G_BASE_SIZE = "ขนาดฐาน";
const G_BASE = "ฐาน";

const MAT_CLEAR = "อะคริลิคใส";
const MAT_SPECIAL = "อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม · กระจก)";
const SIZE_ADD = "เพิ่มขนาดเกิน 6 ซม. (ระบุกี่ ซม.)";
const SIZE_ADD_OLD = "เพิ่มขนาด cm. ละ";
const SIZE_ADD_FEE = 15;

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
gType.note = "พวงกุญแจ = เจาะรู + โซ่ไข่ปลา · สแตนดี้ = มาพร้อมฐานอะคริลิค (ราคาเท่ากัน)";
setChoice(gType, "พวงกุญแจ", {
  desc: "เจาะรูด้านบน ร้อยโซ่ไข่ปลา ห้อยกระเป๋า/กุญแจได้ — แถมโซ่สีเงินให้ทุกอัน",
  imageSrc: art("type-keyring"),
});
setChoice(gType, "สแตนดี้", {
  desc: "เสียบฐานอะคริลิค ตั้งโชว์บนโต๊ะ — เลือกขนาดฐานและจะสกรีนลายฐานด้วยก็ได้",
  imageSrc: art("type-standee"),
});

/* 3.2 ประเภทเนื้ออะคริลิค = แกนตารางราคา (2 คอลัมน์) */
const gMat = group(G_MAT, G_MAT_OLD);
gMat.display = "cards";
gMat.stockBearing = true;
gMat.note = `เนื้อพิเศษบวกเพิ่มอันละ ${gapText} (คิดในตารางราคาให้แล้ว)`;
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
    desc: `เนื้อกลิตเตอร์ / โฮโลแกรม / กระจก หนาประมาณ 2.5-3 มม. · บวกเพิ่มอันละ ${gapText}`,
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
  note: `${SHADES.length} เฉด ราคาเท่ากันทุกเฉด — ค่าเนื้อพิเศษคิดแล้วที่ตารางราคา (+${gapText}/อัน)`,
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

/* 3.3 ขนาดชิ้นงาน — มาตรฐาน 5-6 ซม. เกินกว่านั้นคิด ซม. ละ 15 บาท */
const gSize = group(G_SIZE, G_SIZE_OLD);
gSize.display = "multi";
gSize.note = `ขนาดมาตรฐาน 5-6 ซม. รวมในราคาแล้ว — ใหญ่กว่านั้นคิดเพิ่ม ซม. ละ ฿${SIZE_ADD_FEE} (วัดจากด้านที่ยาวที่สุด)`;
setChoice(
  gSize,
  SIZE_ADD,
  {
    qty: true,
    qtyMax: 10,
    extra: SIZE_ADD_FEE,
    desc: `เช่น อยากได้ 8 ซม. = เพิ่ม 2 ซม. = +฿${SIZE_ADD_FEE * 2} ต่ออัน`,
    imageSrc: art("size-add"),
  },
  SIZE_ADD_OLD
);

/* 3.4 สกรีนกี่ด้าน */
const gScreen = group(G_SCREEN, G_SCREEN_OLD);
gScreen.display = "cards";
setChoice(gScreen, "1 ด้าน (ด้านหลังอะคริลิคขาวขุ่น C-02)", {
  desc: "พิมพ์ลายด้านหน้าด้านเดียว ด้านหลังเป็นอะคริลิคขาวขุ่น C-02 — แบบมาตรฐานตามตารางราคา",
  imageSrc: art("screen-1side"),
});
setChoice(gScreen, "2 ด้าน", {
  desc: "พิมพ์ลายทั้งสองด้าน ใช้คนละลายได้",
  imageSrc: art("screen-2side"),
});

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
gBaseSize.display = "cards";
gBaseSize.note = "ทุกขนาดฐานรวมอยู่ในราคาแล้ว ไม่บวกเพิ่ม";
for (const [name, file, desc] of [
  ["3-5 cm", "base-3-5", "ฐานเล็ก เหมาะกับกรอบขนาดมาตรฐาน 5-6 ซม."],
  ["6-7 cm", "base-6-7", "ตั้งได้มั่นคงขึ้น เหมาะกับกรอบที่สั่งใหญ่กว่ามาตรฐาน"],
  ["8 cm", "base-8", "ฐานใหญ่สุดที่สั่งผ่านหน้าเว็บได้"],
] as const)
  setChoice(gBaseSize, name, { desc, imageSrc: art(file) });

/* 3.7 ฐาน ใส / สกรีนลาย */
const gBase = group(G_BASE);
gBase.display = "cards";
setChoice(gBase, "แบบใส", { desc: "ฐานอะคริลิคใส ไม่มีลาย — แบบมาตรฐาน", imageSrc: art("base-plain") });
setChoice(
  gBase,
  "สกรีนลาย",
  { desc: "พิมพ์ลายลงบนฐาน (คนละไฟล์กับลายบนกรอบ) — แจ้งลายฐานในหมายเหตุถึงร้าน", imageSrc: art("base-printed") },
  "สรีนลาย"
);

/* ── 4. ราคา — เขียนทับด้วยตัวเลขสดจากเว็บ ──────────────────────────────── */
const pricing = {
  unit: "อัน",
  tiers,
  driverLabels: [G_MAT],
  cells: { [MAT_CLEAR]: clear, [MAT_SPECIAL]: special },
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
d.price = clear[0];
d.priceMin = Math.min(...clear, ...special);
d.priceMax = Math.max(...clear, ...special);

/* ── 5. แท็บรายละเอียด — ยกข้อความจากหน้าตารางราคา ─────────────────────── */
const DETAIL = [
  "• กรอบใส่รูปอะคริลิค (Photo Fram Acrylic) — แผ่นอะคริลิคไดคัทเป็นกรอบ เจาะช่องกลางไว้สอดรูป/โฟโต้การ์ด สกรีนลายได้ตามสั่ง",
  "• อะคริลิคใส หนาประมาณ 3 มม. · อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม · กระจก) หนาประมาณ 2.5-3 มม.",
  "• พิมพ์ด้วยระบบ UV Printing สีสวยคมชัด สีไม่ซีดไม่หลุดลอก",
  "• ไม่มีขั้นต่ำในการสั่งผลิต · สกรีน 1 ด้าน เป็นแบบมาตรฐานตามตารางราคา",
  "• ขนาดมาตรฐาน 5-6 ซม. — ใหญ่กว่านั้นคิดเพิ่ม ซม. ละ 15 บาท",
  `• อะคริลิคกลิตเตอร์ / โฮโลแกรม / กระจก บวกเพิ่มอันละ ${gapText}`,
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

console.log(`\n🧩 ตัวเลือก ${opts.length} กลุ่ม · แกนราคา: ${pricing.driverLabels.join(", ")}`);
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

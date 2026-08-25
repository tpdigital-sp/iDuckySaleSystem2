#!/usr/bin/env npx tsx
/**
 * ปฏิทินตั้งโต๊ะ ทรงมาตราฐาน (3x3-7-62cm) — เพิ่มกลุ่ม "เคลือบ" + "ลายฟิล์มเคลือบพิเศษ" ตาม Mini Calendar
 *
 *   npx tsx scripts/calendar-standard-coating.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/calendar-standard-coating.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (25 ส.ค. 69) ให้ก๊อปโครงจาก /products/mini-calendar พร้อมกติกาจากหน้า /calendar:
 *   เคลือบ เงา/ด้าน  บวกด้านละ 10 บาท ต่อ A3
 *   เคลือบพิเศษ [เนื้อทราย | กลิสเตอร์ | โฮโลแกรม] บวกชุดละ 40 บาท ต่อ A3
 *   จำนวนกระดาษ 8 แผ่น ใช้ 4 A3 · 14 แผ่น ใช้ 7 A3
 *
 * ⚠️ ต่างจาก Mini Calendar ตรงนี้ (อย่าก๊อปทื่อ ๆ):
 *   Mini 1 เล่ม = 1 A3 → sheetFee.from ชี้กลุ่มตัวเอง perSheet 1 (1 แผ่นได้ 1 เล่ม)
 *   ทรงมาตราฐาน 1 เล่มกิน 4/7 A3 → sheetFee.from ชี้กลุ่ม "ขนาด" แล้วใช้ sheetsPerUnit (แผ่นต่อเล่ม)
 *   ซึ่งเป็นฟิลด์ที่เพิ่มเข้า products.ts รอบนี้ (perSheet เดิมบอกได้แค่ "หลายชิ้นต่อ 1 แผ่น")
 *
 * ภาพ/คลิปฟิล์มใช้ร่วมกับโฟลเดอร์ mini-calendar (ฟิล์มม้วนเดียวกัน) — ไม่ก๊อปไฟล์ซ้ำใน storage
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "3x3-7-62cm";
const FROM = "mini-calendar";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// ── ต้นแบบ: อ่านกลุ่มเคลือบสดจาก Mini Calendar (ลายฟิล์มเพิ่ม/ลด จะตามกันเอง) ──
const { data: src, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
// ⚠️ Mini Calendar แยกกลุ่มเป็น "(ด้านหน้า)/(ด้านหลัง)" แล้ว (25 ส.ค. 69) — ยึดกลุ่มด้านหน้าเป็นต้นแบบ
// (ชื่อเดิมไม่มีวงเล็บยังรองรับไว้ เผื่ออ่านสินค้าต้นแบบรุ่นก่อนหน้า)
const srcOf = (...labels: string[]) => {
  const g = (src.data.options ?? []).find((o: { label: string }) => labels.includes(o.label));
  if (!g) throw new Error(`${FROM} ไม่มีกลุ่ม "${labels[0]}" แล้ว — โครงต้นแบบเปลี่ยน มาดูเองก่อน`);
  return g;
};
const srcCoat = srcOf("เคลือบ (ด้านหน้า)", "เคลือบ");
const srcFilm = srcOf("ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)", "ลายฟิล์มเคลือบพิเศษ");
console.log(`📋 ต้นแบบ ${src.name}: เคลือบ ${srcCoat.choices.length} แบบ · ลายฟิล์ม ${srcFilm.choices.length} ลาย`);

// ── สินค้าปลายทาง ──
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/ทรงมาตราฐาน/.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

// 1) กลุ่ม "ขนาด" บอกว่า 1 เล่มกินกี่แผ่น A3 (ตัวหารของค่าเคลือบ)
const SHEETS_PER_BOOK: Record<string, number> = { "8 แผ่น (16หน้า)": 4, "14 แผ่น (28หน้า)": 7 };
const sizeGroup = (d.options ?? []).find((o: { label: string }) => o.label === "ขนาด");
if (!sizeGroup) throw new Error('ไม่เจอกลุ่ม "ขนาด" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน');
for (const c of sizeGroup.choices) {
  const n = SHEETS_PER_BOOK[c.name];
  if (!n) throw new Error(`ไม่รู้ว่า "${c.name}" ใช้กี่แผ่น A3 — ตารางเว็บเพิ่มขนาดใหม่? มาดูเองก่อน`);
  c.sheetsPerUnit = n;
}

// 2) กลุ่มเคลือบ "ด้านละกลุ่ม" — เว็บคิดค่าฟิล์ม **ด้านละ** 10/40 บาทต่อ A3 (ผู้ใช้สั่ง 25 ส.ค. 69)
//    แยกเป็น 2 กลุ่มเพราะ sheetFeeTotalOf บวกทุกกลุ่มที่ตั้ง sheetFee เข้าด้วยกัน → เลือกเคลือบ 2 ด้าน = ค่าฟิล์ม 2 ชุด
//    (ทำเป็นกลุ่มเดียวแล้วติ๊ก "หน้า-หลัง" ไม่ได้ ระบบไม่มีตัวคูณค่าธรรมเนียมตามกลุ่มอื่น)
const FEE: Record<string, number> = { ไม่เคลือบ: 0, เคลือบเงา: 10, เคลือบด้าน: 10, เคลือบพิเศษ: 40 };
const SHEET_NOTE = "(8 แผ่น ใช้ 4 แผ่น A3 ต่อเล่ม · 14 แผ่น ใช้ 7 แผ่น A3 ต่อเล่ม)";

/** ก๊อปกลุ่มเคลือบต้นแบบมาทำเป็นด้านหนึ่ง — ราคาเท่ากันทั้งสองด้าน ต่างกันแค่ป้ายและโน้ต */
function coatGroup(label: string, note: string, keepPopular: boolean) {
  const g = structuredClone(srcCoat);
  g.label = label;
  g.note = note;
  g.sheetFee = { from: "ขนาด", unit: "แผ่น A3" };
  // ตัวล็อก "เคลือบด้าน (มากับงานฟอยล์)" ของต้นแบบ ใช้กับสินค้านี้ไม่ได้ — สินค้านี้ยังไม่มีกลุ่มฟอยล์
  // (ทิ้งไว้จะกลายเป็นตัวเลือกเคลือบด้านฟรีที่กดเองได้ ทั้งที่งานจริงต้องมากับงานฟอยล์เท่านั้น)
  g.choices = g.choices.filter((c: { name: string }) => !/มากับงานฟอยล์/.test(c.name));
  for (const c of g.choices) {
    delete c.perSheet; // ของ Mini (1 เล่ม = 1 A3) ใช้กับสินค้านี้ไม่ได้ — จำนวนแผ่นมาจากกลุ่ม "ขนาด" แทน
    if (!keepPopular) delete c.popular; // ป้าย "นิยม" ไว้ด้านหน้าพอ ด้านหลังส่วนใหญ่ไม่เคลือบ
    if (!(c.name in FEE)) throw new Error(`ตัวเลือกเคลือบใหม่ "${c.name}" จาก ${FROM} — ยังไม่รู้ราคา มาดูเองก่อน`);
    if (FEE[c.name]) c.extra = FEE[c.name];
    else delete c.extra;
  }
  return g;
}

// 📝 note สั้นเข้าไว้ — ราคาอยู่บนการ์ดทุกใบ และจำนวนแผ่น A3 กางให้เองในแถบ 📄 ใต้กลุ่ม
// (ผู้ใช้ทัก 25 ส.ค. 69 ว่าแผงเคลือบดูรก: note ยาว + ไฮไลต์ชมพูเกือบทุกวลี)
const coatFront = coatGroup(
  "เคลือบด้านหน้า",
  "เคลือบฟิล์มด้านหน้าของกระดาษทุกแผ่นในเล่ม · คิดเป็นค่าวัสดุต่อแผ่น A3",
  true
);
const coatBack = coatGroup(
  "เคลือบด้านหลัง",
  "เคลือบเพิ่มอีกด้านได้ คิดแยกจากด้านหน้า · เลือกคนละแบบกับด้านหน้าได้",
  false
);
// 🔽 ด้านหลังเป็นของเสริม — หน้าสินค้าปิดไว้ก่อน โชว์แค่สวิตช์ กดเปิดถึงกางการ์ด
coatBack.collapsible = true;

// 3) กลุ่มลายฟิล์ม — แยกด้านละกลุ่ม (showWhen ต่อได้แบบ "และ" เท่านั้น ใช้กลุ่มเดียวคุมสองด้านไม่ได้)
function filmGroup(label: string, whenLabel: string, note: string) {
  const g = structuredClone(srcFilm);
  g.label = label;
  g.note = note;
  g.showWhen = { label: whenLabel, choices: ["เคลือบพิเศษ"] };
  return g;
}
const FILM_NOTE = "10 ลาย ราคาเท่ากัน (รวมในค่าเคลือบพิเศษแล้ว) · การ์ดเล่นคลิปฟิล์มจริง";
const filmFront = filmGroup("ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)", "เคลือบด้านหน้า", FILM_NOTE);
const filmBack = filmGroup("ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)", "เคลือบด้านหลัง", FILM_NOTE);

// ใส่ต่อท้าย (แทนของเดิมถ้าเคยมี) — ลำดับ: ขนาด → แนวปฏิทิน → เคลือบหน้า → ลายหน้า → เคลือบหลัง → ลายหลัง
const COAT_LABELS = [
  "เคลือบ", // ชื่อเดิมรอบก่อน (ก่อนแยกหน้า-หลัง) — กวาดทิ้ง
  "ลายฟิล์มเคลือบพิเศษ",
  coatFront.label,
  filmFront.label,
  coatBack.label,
  filmBack.label,
];
d.options = [
  ...d.options.filter((o: { label: string }) => !COAT_LABELS.includes(o.label)),
  coatFront,
  filmFront,
  coatBack,
  filmBack,
];

// 4) FAQ เรื่องเคลือบ (เขียนทับข้อเดิมถ้ามี)
const faqQ = "ปฏิทินตั้งโต๊ะ ทรงมาตราฐาน เคลือบฟิล์มได้ไหม คิดเงินยังไง?";
d.seo.faqs = [
  ...(d.seo.faqs ?? []).filter((f: { q: string }) => f.q !== faqQ),
  {
    q: faqQ,
    a:
      "ได้ครับ เลือกได้ทั้งด้านหน้าและด้านหลัง แยกกันคนละแบบก็ได้ — คิดด้านละ: เคลือบเงา/ด้าน 10 บาทต่อแผ่น A3 · " +
      "เคลือบพิเศษ (เนื้อทราย/กลิสเตอร์/โฮโลแกรม 10 ลาย) 40 บาทต่อแผ่น A3 — " +
      "ปฏิทิน 8 แผ่นใช้กระดาษ 4 แผ่น A3 ต่อเล่ม (เคลือบเงา/ด้าน +40 บาท/เล่ม/ด้าน · พิเศษ +160 บาท/เล่ม/ด้าน) · " +
      "14 แผ่นใช้ 7 แผ่น A3 ต่อเล่ม (เคลือบเงา/ด้าน +70 บาท/เล่ม/ด้าน · พิเศษ +280 บาท/เล่ม/ด้าน) — " +
      "เคลือบเงาทั้งสองด้าน 8 แผ่น = +80 บาท/เล่ม",
  },
];

// ── ตรวจเลขก่อนเขียน (คิดมือตามกติกาเว็บ: ค่าฟิล์ม = เรทด้านหน้า + เรทด้านหลัง คูณจำนวนแผ่น) ──
const expect: [size: string, front: string, back: string, qty: number, total: number][] = [
  ["8 แผ่น (16หน้า)", "เคลือบเงา", "ไม่เคลือบ", 1, 40], // 10 × 4 A3 ด้านเดียว
  ["8 แผ่น (16หน้า)", "เคลือบเงา", "เคลือบเงา", 1, 80], // เคลือบสองด้าน = 2 ชุด
  ["8 แผ่น (16หน้า)", "เคลือบพิเศษ", "ไม่เคลือบ", 1, 160], // 40 × 4 A3
  ["8 แผ่น (16หน้า)", "เคลือบพิเศษ", "เคลือบด้าน", 1, 200], // (40+10) × 4 A3 — คนละแบบสองด้าน
  ["14 แผ่น (28หน้า)", "เคลือบด้าน", "ไม่เคลือบ", 1, 70], // 10 × 7 A3
  ["14 แผ่น (28หน้า)", "เคลือบพิเศษ", "เคลือบพิเศษ", 10, 5600], // (40+40) × 70 A3
  ["8 แผ่น (16หน้า)", "ไม่เคลือบ", "ไม่เคลือบ", 5, 0],
];
console.log("\n🧮 ตรวจค่าเคลือบ (เรทหน้า + เรทหลัง × แผ่นต่อเล่มจากกลุ่มขนาด):");
for (const [size, front, back, qty, want] of expect) {
  const sheets = Math.ceil(qty * SHEETS_PER_BOOK[size]);
  const got = (FEE[front] ?? 0) * sheets + (FEE[back] ?? 0) * sheets;
  const mark = got === want ? "✓" : "✗";
  console.log(`   ${mark} ${size} · หน้า ${front} + หลัง ${back} · ${qty} เล่ม = ${sheets} A3 → ฿${got} (คาด ฿${want})`);
  if (got !== want) throw new Error("สูตรค่าเคลือบไม่ตรงที่คาด — หยุดก่อนเขียน");
}
console.log("\nกลุ่มตัวเลือกหลังแก้:");
for (const g of d.options)
  console.log(
    ` - ${g.label} (${g.display ?? "pills"})${g.sheetFee ? ` [ค่าต่อ${g.sheetFee.unit} จากกลุ่ม "${g.sheetFee.from}"]` : ""}${g.showWhen ? ` [โชว์เมื่อ ${g.showWhen.label}=${g.showWhen.choices.join("/")}]` : ""}: ` +
      g.choices.map((c: { name: string; extra?: number }) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" · ")
  );

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
const bOpts = back.data.options;
const byLabel = (label: string) => bOpts.find((o: { label: string }) => o.label === label);
const bSize = byLabel("ขนาด");
const specialOf = (label: string) =>
  byLabel(label)?.choices.find((c: { name: string }) => c.name === "เคลือบพิเศษ")?.extra;
const checks: [string, unknown, unknown][] = [
  ["จำนวนกลุ่ม", bOpts.length, 6],
  ["ไม่มีกลุ่ม “เคลือบ” ชื่อเดิมค้าง", byLabel("เคลือบ") ? "ค้างอยู่" : "ไม่มี", "ไม่มี"],
  ["ฐานคิดค่าเคลือบ ด้านหน้า", byLabel("เคลือบด้านหน้า")?.sheetFee?.from, "ขนาด"],
  ["ฐานคิดค่าเคลือบ ด้านหลัง", byLabel("เคลือบด้านหลัง")?.sheetFee?.from, "ขนาด"],
  ["แผ่นต่อเล่ม 8 แผ่น", bSize?.choices.find((c: { name: string }) => /^8 /.test(c.name))?.sheetsPerUnit, 4],
  ["แผ่นต่อเล่ม 14 แผ่น", bSize?.choices.find((c: { name: string }) => /^14 /.test(c.name))?.sheetsPerUnit, 7],
  ["ค่าเคลือบพิเศษ ด้านหน้า", specialOf("เคลือบด้านหน้า"), 40],
  ["ค่าเคลือบพิเศษ ด้านหลัง", specialOf("เคลือบด้านหลัง"), 40],
  ["ลายฟิล์ม ด้านหน้า", byLabel("ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)")?.choices.length, srcFilm.choices.length],
  ["ลายฟิล์ม ด้านหลัง", byLabel("ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)")?.choices.length, srcFilm.choices.length],
  ["ลายฟิล์มหลังผูกกับกลุ่มหลัง", byLabel("ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)")?.showWhen?.label, "เคลือบด้านหลัง"],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log("\n✅ บันทึกแล้ว — กลุ่มเคลือบคิดค่าฟิล์มต่อแผ่น A3 ตามจำนวนแผ่นจริงของแต่ละขนาด");

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
const srcCoat = (src.data.options ?? []).find((o: { label: string }) => o.label === "เคลือบ");
const srcFilm = (src.data.options ?? []).find((o: { label: string }) => o.label === "ลายฟิล์มเคลือบพิเศษ");
if (!srcCoat || !srcFilm) throw new Error(`${FROM} ไม่มีกลุ่มเคลือบ/ลายฟิล์มแล้ว — โครงต้นแบบเปลี่ยน มาดูเองก่อน`);
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

// 2) กลุ่ม "เคลือบ" — ก๊อปการ์ด/ภาพ/คลิปจาก Mini Calendar แล้วเปลี่ยนฐานคิดเป็นแผ่นต่อเล่ม
const coat = structuredClone(srcCoat);
coat.sheetFee = { from: "ขนาด", unit: "แผ่น A3" };
coat.note =
  "เคลือบฟิล์มด้านหน้ากระดาษทุกแผ่นในเล่ม — เงา/ด้าน **ด้านละ 10 บาท ต่อแผ่น A3** · " +
  "เคลือบพิเศษ (เนื้อทราย / กลิสเตอร์ / โฮโลแกรม) **ชุดละ 40 บาท ต่อแผ่น A3** " +
  "(8 แผ่น ใช้ 4 แผ่น A3 ต่อเล่ม · 14 แผ่น ใช้ 7 แผ่น A3 ต่อเล่ม) — ต้องการเคลือบ 2 ด้าน แจ้งในหมายเหตุถึงร้าน";
for (const c of coat.choices) {
  delete c.perSheet; // ของ Mini (1 เล่ม = 1 A3) ใช้กับสินค้านี้ไม่ได้ — จำนวนแผ่นมาจากกลุ่ม "ขนาด" แทน
}
const FEE: Record<string, number> = { ไม่เคลือบ: 0, เคลือบเงา: 10, เคลือบด้าน: 10, เคลือบพิเศษ: 40 };
for (const c of coat.choices) {
  if (!(c.name in FEE)) throw new Error(`ตัวเลือกเคลือบใหม่ "${c.name}" จาก ${FROM} — ยังไม่รู้ราคา มาดูเองก่อน`);
  if (FEE[c.name]) c.extra = FEE[c.name];
  else delete c.extra;
}

// 3) กลุ่ม "ลายฟิล์มเคลือบพิเศษ" — ยกมาทั้งดุ้น (โผล่เฉพาะตอนเลือกเคลือบพิเศษ)
const film = structuredClone(srcFilm);

// ใส่ต่อท้าย (แทนของเดิมถ้าเคยมี) — ลำดับ: ขนาด → แนวปฏิทิน → เคลือบ → ลายฟิล์ม
d.options = [...d.options.filter((o: { label: string }) => o.label !== "เคลือบ" && o.label !== "ลายฟิล์มเคลือบพิเศษ"), coat, film];

// 4) FAQ เรื่องเคลือบ (เขียนทับข้อเดิมถ้ามี)
const faqQ = "ปฏิทินตั้งโต๊ะ ทรงมาตราฐาน เคลือบฟิล์มได้ไหม คิดเงินยังไง?";
d.seo.faqs = [
  ...(d.seo.faqs ?? []).filter((f: { q: string }) => f.q !== faqQ),
  {
    q: faqQ,
    a:
      "ได้ครับ เคลือบเงา/ด้าน คิดด้านละ 10 บาทต่อแผ่น A3 · เคลือบพิเศษ (เนื้อทราย/กลิสเตอร์/โฮโลแกรม 10 ลาย) ชุดละ 40 บาทต่อแผ่น A3 — " +
      "ปฏิทิน 8 แผ่นใช้กระดาษ 4 แผ่น A3 ต่อเล่ม (เคลือบเงา/ด้าน +40 บาท/เล่ม · พิเศษ +160 บาท/เล่ม) · " +
      "14 แผ่นใช้ 7 แผ่น A3 ต่อเล่ม (เคลือบเงา/ด้าน +70 บาท/เล่ม · พิเศษ +280 บาท/เล่ม)",
  },
];

// ── ตรวจเลขก่อนเขียน (คิดมือตามกติกาเว็บ) ──
const expect: [size: string, coating: string, qty: number, total: number][] = [
  ["8 แผ่น (16หน้า)", "เคลือบเงา", 1, 40], // 10 × 4 A3
  ["8 แผ่น (16หน้า)", "เคลือบพิเศษ", 1, 160], // 40 × 4 A3
  ["14 แผ่น (28หน้า)", "เคลือบด้าน", 1, 70], // 10 × 7 A3
  ["14 แผ่น (28หน้า)", "เคลือบพิเศษ", 10, 2800], // 40 × 70 A3
  ["8 แผ่น (16หน้า)", "ไม่เคลือบ", 5, 0],
];
console.log("\n🧮 ตรวจค่าเคลือบ (คิดตาม sheetsPerUnit ของกลุ่มขนาด):");
for (const [size, coating, qty, want] of expect) {
  const sheets = Math.ceil(qty * SHEETS_PER_BOOK[size]);
  const got = (FEE[coating] ?? 0) * sheets;
  const mark = got === want ? "✓" : "✗";
  console.log(`   ${mark} ${size} · ${coating} · ${qty} เล่ม = ${sheets} A3 → ฿${got} (คาด ฿${want})`);
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
const bCoat = bOpts.find((o: { label: string }) => o.label === "เคลือบ");
const bSize = bOpts.find((o: { label: string }) => o.label === "ขนาด");
const checks: [string, unknown, unknown][] = [
  ["จำนวนกลุ่ม", bOpts.length, 4],
  ["ฐานคิดค่าเคลือบ", bCoat?.sheetFee?.from, "ขนาด"],
  ["แผ่นต่อเล่ม 8 แผ่น", bSize?.choices.find((c: { name: string }) => /^8 /.test(c.name))?.sheetsPerUnit, 4],
  ["แผ่นต่อเล่ม 14 แผ่น", bSize?.choices.find((c: { name: string }) => /^14 /.test(c.name))?.sheetsPerUnit, 7],
  ["ค่าเคลือบพิเศษ", bCoat?.choices.find((c: { name: string }) => c.name === "เคลือบพิเศษ")?.extra, 40],
  ["ลายฟิล์ม", bOpts.find((o: { label: string }) => o.label === "ลายฟิล์มเคลือบพิเศษ")?.choices.length, srcFilm.choices.length],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log("\n✅ บันทึกแล้ว — กลุ่มเคลือบคิดค่าฟิล์มต่อแผ่น A3 ตามจำนวนแผ่นจริงของแต่ละขนาด");

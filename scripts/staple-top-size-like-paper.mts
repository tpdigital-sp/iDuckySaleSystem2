/**
 * 📐 กระดาษเย็บบน (package-staple-top) — "📐 กำหนดขนาดเอง" ใช้ตรรกะเดียวกับงานกระดาษ
 *
 * เจ้าของร้านสั่ง 21 ก.ย. 69: "📐 กำหนดขนาดเอง (ระบุ ก.×ส.) ให้ตรรกะเหมือนกับงานกระดาษ"
 * เคาะเพิ่ม: **ไม่เผื่อส่วนพับครอบปากถุง** (กลุ่มชื่อ "ขนาดแบบที่ยังไม่พับ" = ที่กรอกคือแผ่นที่พิมพ์จริงอยู่แล้ว)
 *           **ปุ่มขนาดสำเร็จ 5 ปุ่มคงเลขเดิมที่ร้านวัดมาเอง** (18/15/10/8/5 ใบ/1A3 — ไม่แตะชื่อ/ราคา)
 *
 * ยกสเปกของกลุ่ม "ขนาดตัด" ในงานกระดาษ (paper-art-pet) มาทั้งชุด:
 *   - พื้นที่วาง 43.76 × 28.89 เว้น 5 มม. + printFitOnly (ตรงกับโปรแกรม Print-Fit ที่ร้านใช้หน้างาน)
 *     แทนสเปกเดิม 47 × 26.75 + addH 2 ที่จูนไว้ให้ล้อเลขปุ่มขนาดสำเร็จ — ดู [[iducky-sheet-yield-printfit]]
 *   - เพดานช่องกรอกเท่าแผ่น A3: กว้าง 3–29.7 · สูง 3–42 ซม. (เดิม 2–28 × 2–20 ซม.)
 *   - ข้อความใต้ช่องบอกให้กรอก "ขนาดตอนยังไม่พับ" ให้ตรงกับวิธีนับใหม่ (เดิมเขียน "ขนาดใบสำเร็จ หลังพับ"
 *     ซึ่งขัดกับทั้งชื่อกลุ่มและวิธีนับ — ลูกค้ากรอกขนาดหลังพับแล้วระบบจะบอกจำนวนใบเกินจริง)
 *
 * ⚠️ ผลที่เปลี่ยน: กรอกขนาดเองจะได้จำนวนใบ/แผ่น "มากกว่าเดิม" (ไม่หักที่พับแล้ว)
 *    ใบเสนอราคา QT-260918-3533 ของร้านเขียน 10.5 × 5.08 ซม. (ก่อนพับ) = 15 ใบ/A3 · สูตรนี้ตอบ 20
 *    ถ้าของจริงได้น้อยกว่านี้ ให้ใส่ addH กลับ (แก้ SHEET ให้มี addH แล้วรันซ้ำ)
 *
 *   npx tsx scripts/staple-top-size-like-paper.mts --dry   (ดูตารางเทียบ ไม่บันทึก)
 *   npx tsx scripts/staple-top-size-like-paper.mts         (เขียนจริง · idempotent · อ่านกลับเทียบ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetFitCount, type SheetYield } from "../src/lib/products";

const ID = "package-staple-top";
const GROUP = "ขนาดแบบที่ยังไม่พับ";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดใบ (กว้าง)";
const H_LABEL = "ขนาดใบ (สูง)";

/** สเปกแผ่นชุดเดียวกับกลุ่ม "ขนาดตัด" ของงานกระดาษ (paper-art-pet) */
const SHEET: SheetYield = {
  pairLabel: W_LABEL,
  sheetW: 43.76,
  sheetH: 28.89,
  gap: 0.5,
  sheetName: "แผ่น A3",
  printFitOnly: true,
};
const W_INPUT = {
  kind: "number",
  unit: "ซม.",
  min: 3,
  max: 29.7,
  placeholder: "เช่น 7",
  hint: "ขนาดแผ่นตอนยังไม่พับ (รวมส่วนที่พับครอบปากถุงแล้ว) วัดด้านที่กว้างที่สุด",
};
const H_INPUT = { kind: "number", unit: "ซม.", min: 3, max: 42, placeholder: "เช่น 6" };

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");
const die = (m: string) => { console.error("✗ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p: any = (row as any).data;
const opts: any[] = p.options || [];

const group = opts.find((o) => o.label?.trim() === GROUP);
if (!group) die(`ไม่พบกลุ่ม "${GROUP}"`);
if (!group.choices?.some((c: any) => c.name === CUSTOM)) die(`ไม่พบตัวเลือก "${CUSTOM}"`);
const wOpt = opts.find((o) => o.label === W_LABEL);
const hOpt = opts.find((o) => o.label === H_LABEL);
if (!wOpt || !hOpt) die("ไม่พบกลุ่มช่องกรอกกว้าง/สูง");
// ช่องกรอกต้องผูกกับตัวเลือก "กำหนดขนาดเอง" ของกลุ่มนี้จริง (ถ้าหลุด = ช่องไม่โผล่ ดู scripts/staple-top-size-showwhen-fix.mjs)
for (const o of [wOpt, hOpt])
  if (o.showWhen?.label?.trim() !== GROUP || !o.showWhen.choices?.includes(CUSTOM))
    die(`showWhen ของ "${o.label}" ไม่ได้ผูกกับ "${CUSTOM}" ของกลุ่ม ${GROUP} — ซ่อมอันนั้นก่อน`);

const before: SheetYield = hOpt.sheetYield;
const rows: [number, number, number | undefined][] = [
  ...group.choices
    .map((c: any) => {
      const m = String(c.name).match(/^([\d.]+)x([\d.]+)cm/);
      return m ? ([Number(m[1]), Number(m[2]), c.piecesPerUnit] as [number, number, number | undefined]) : null;
    })
    .filter(Boolean),
  [10.5, 5.08, undefined] as [number, number, undefined], // ขนาดจากใบเสนอราคาจริง QT-260918-3533 (ร้านตอบ 15)
];
console.log(`ขนาด (ก.×ส.) | เลขที่ปุ่มบอก | เดิม ${before.sheetW}×${before.sheetH}${before.addH ? ` +เผื่อพับ ${before.addH}` : ""} | ใหม่ ${SHEET.sheetW}×${SHEET.sheetH} (แบบงานกระดาษ)`);
for (const [w, h, per] of rows)
  console.log(`${w}×${h} | ${per ?? "—"} | ${sheetFitCount(before, w, h)} | ${sheetFitCount(SHEET, w, h)}`);

hOpt.sheetYield = { ...SHEET };
wOpt.input = { ...W_INPUT };
hOpt.input = { ...H_INPUT };
// ปุ่มขนาดสำเร็จ: ไม่แตะชื่อ/piecesPerUnit/ราคา — เจ้าของร้านสั่งให้คงเลขที่ร้านวัดมาเอง
const namesBefore = group.choices.map((c: any) => c.name).join("│");

p.options = opts;
p.savedAt = new Date().toISOString();
if (DRY) { console.log("\n(--dry ไม่บันทึก)"); process.exit(0); }

const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q: any = (back as any)?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const qh = (q.options || []).find((o: any) => o.label === H_LABEL);
const qw = (q.options || []).find((o: any) => o.label === W_LABEL);
if (qh?.sheetYield?.addH != null) die("อ่านกลับ ยังมี addH ค้างอยู่");
for (const [k, v] of Object.entries(SHEET))
  if ((qh.sheetYield as any)[k] !== v) die(`อ่านกลับ sheetYield.${k} ไม่ตรง (${(qh.sheetYield as any)[k]})`);
if (qw?.input?.max !== W_INPUT.max || qh?.input?.max !== H_INPUT.max || qw.input.min !== 3 || qh.input.min !== 3)
  die("อ่านกลับ เพดานช่องกรอกไม่ตรง");
if (qw.input.hint !== W_INPUT.hint) die("อ่านกลับ ข้อความใต้ช่องกว้างไม่ตรง");
const qGroup = (q.options || []).find((o: any) => o.label?.trim() === GROUP);
if (qGroup.choices.map((c: any) => c.name).join("│") !== namesBefore) die("อ่านกลับ ชื่อปุ่มขนาดสำเร็จเปลี่ยน — ห้ามแตะ");
if (JSON.stringify(q.priceRates) !== JSON.stringify(p.priceRates)) die("อ่านกลับ ตารางราคาขยับ — ห้ามแตะ");
console.log("\n✅ บันทึกแล้ว + อ่านกลับตรวจครบ (ปุ่มขนาดสำเร็จ/ราคา ไม่ขยับ)");

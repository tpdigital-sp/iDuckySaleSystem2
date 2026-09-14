/**
 * ✂️ อะคริลิคกระจก — ย่อ note ของ 3 กลุ่มแรก (รูปแบบงาน / ขนาด / ตะขอ) ให้สั้น
 * แล้วจัดเป็น "ประโยคนำ + หัวข้อย่อย" (บรรทัดขึ้นต้น "• ") ให้ ProductDetail วาดเป็นกล่องอ่านง่าย
 * เดิมเป็นย่อหน้าเดียวยาว ๆ มีชิปชมพูแทรกกลาง กวาดตาหาไม่เจอ — เจ้าของร้านทัก 14 ก.ย. 69
 *
 * กลุ่ม "ตะขอ" ตัดประโยค "กดรูปแผ่นอะไหล่ด้านล่าง…" ออก เพราะปุ่ม 👀 กดดูรูปตัวอย่าง
 * อยู่ในกล่องเดียวกันอยู่แล้ว (noteImageSrc)
 *
 * ⚠️ ทับงานของ scripts/mirror-size-note-trim.mjs (กลุ่ม "ขนาด") — ข้อความในสองไฟล์ตรงกัน
 * รันไฟล์ไหนก่อนก็ได้ผลเท่ากัน
 *
 * รันซ้ำได้ (ตรงอยู่แล้วก็ข้าม) · เขียนแล้วอ่านกลับมาเทียบทุกกลุ่ม ดู memory: iducky-script-write-product
 *
 *   node scripts/mirror-option-notes.mjs          # dry-run
 *   node scripts/mirror-option-notes.mjs --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "new-mt2rqayf-7835"; // อะคริลิคกระจก

const NOTES = {
  รูปแบบงาน: [
    "ราคาตัวชิ้นงานเท่ากันทั้งสองแบบ ต่างกันที่ค่าอะไหล่",
    "• **พวงกุญแจ** — คิดค่าตะขอ/ห่วงตามแบบที่เลือก",
    "• **สแตนดี้** — คิดค่าฐานตามขนาด/ทรง/สีฐาน",
  ].join("\n"),
  ขนาด: [
    "ประกบ 2 ชั้น หนารวม ~3 มม. — หน้ากระจก หลังอะคริลิคขาว",
    "• วัดด้านที่ยาวที่สุด ไม่วัดแนวทแยง ไม่นับรูตะขอ",
    "• ใหญ่กว่า 6 ซม. เลือก “กำหนดขนาดเอง” — คิดจากแถว 6 ซม. **+ ซม. ละ 15 บาท/ชิ้น** (เกิน 20 ซม. แอดมินตีราคาให้)",
  ].join("\n"),
  ตะขอ: [
    "เจาะรูให้ฟรี เลือกตะขอ/ห่วงได้ 1 แบบต่อชิ้น",
    "• **ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรีทุกจำนวน**",
    "• แบบอื่น สั่ง 1-10 ชิ้นฟรี · ตั้งแต่ 11 ชิ้นคิดตามราคาอะไหล่จริง ~2-15 บาท/ชิ้น",
    "• ต้องการหลายแบบในออเดอร์เดียว เขียนบอกในหมายเหตุถึงร้าน",
  ].join("\n"),
};

const apply = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) die(error.message);
const data = row.data;

let changed = 0;
for (const [label, note] of Object.entries(NOTES)) {
  const g = (data.options ?? []).find((o) => o.label === label);
  if (!g) die(`ไม่เจอกลุ่ม "${label}"`);
  console.log(`\n=== ${label} ===\n— เดิม —\n${g.note}\n— ใหม่ —\n${note}`);
  if (g.note === note) {
    console.log("(ตรงอยู่แล้ว)");
    continue;
  }
  g.note = note;
  changed++;
}

if (!changed) {
  console.log("\nข้อความตรงทุกกลุ่มแล้ว ไม่ต้องเขียนซ้ำ");
  process.exit(0);
}
if (!apply) {
  console.log(`\n(dry-run — จะแก้ ${changed} กลุ่ม · ใส่ --apply เพื่อเขียนจริง)`);
  process.exit(0);
}

data.savedAt = new Date().toISOString(); // ต้องเป็น ISO string เท่านั้น ไม่งั้นหน้าแก้ไขติด 409
const { data: wrote, error: e2 } = await sb
  .from("products")
  .update({ data })
  .eq("id", PRODUCT_ID)
  .select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update โดน 0 แถว");

const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (e3) die(e3.message);
for (const [label, note] of Object.entries(NOTES)) {
  const g = (back.data.options ?? []).find((o) => o.label === label);
  if (typeof g?.note !== "string" || g.note !== note) die(`อ่านกลับแล้วกลุ่ม "${label}" ไม่ตรง`);
}
if (back.data.savedAt !== data.savedAt) die("savedAt ไม่ตรง");
console.log(`\n✓ เขียนแล้ว ${changed} กลุ่ม + อ่านกลับตรงทุกกลุ่ม · savedAt =`, back.data.savedAt);

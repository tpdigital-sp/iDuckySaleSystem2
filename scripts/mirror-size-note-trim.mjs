/**
 * 📐 อะคริลิคกระจก — ย่อ note กลุ่ม "ขนาด" ให้สั้นลง แล้วจัดเป็นประโยคนำ + หัวข้อย่อย
 * (เดิมเป็นย่อหน้าเดียวยาว 3 บรรทัด มีกรอบชมพูคร่อมบรรทัด อ่านยาก — เจ้าของร้านทัก 14 ก.ย. 69)
 *
 * รันซ้ำได้ (เจอข้อความใหม่แล้วข้าม) · อ่านกลับมาเทียบก่อนบอกว่าสำเร็จ
 * ดู memory: iducky-script-write-product
 *
 *   node scripts/mirror-size-note-trim.mjs          # dry-run
 *   node scripts/mirror-size-note-trim.mjs --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "new-mt2rqayf-7835"; // อะคริลิคกระจก
const GROUP = "ขนาด";
// ⚠️ ข้อความชุดนี้ต้องตรงกับ scripts/mirror-option-notes.mjs (ย่อ note ทั้ง 3 กลุ่มรอบเดียว)
// ไม่งั้นรันสลับไฟล์กันแล้วข้อความเด้งไปมา
const NOTE = [
  "ประกบ 2 ชั้น หนารวม ~3 มม. — หน้ากระจก หลังอะคริลิคขาว",
  "• วัดด้านที่ยาวที่สุด ไม่วัดแนวทแยง ไม่นับรูตะขอ",
  "• ใหญ่กว่า 6 ซม. เลือก “กำหนดขนาดเอง” — คิดจากแถว 6 ซม. **+ ซม. ละ 15 บาท/ชิ้น** (เกิน 20 ซม. แอดมินตีราคาให้)",
].join("\n");

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
const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) die(`ไม่เจอกลุ่ม "${GROUP}"`);

console.log("— เดิม —\n" + g.note + "\n");
console.log("— ใหม่ —\n" + NOTE + "\n");
if (g.note === NOTE) {
  console.log("ข้อความตรงอยู่แล้ว ไม่ต้องเขียนซ้ำ");
  process.exit(0);
}
if (!apply) {
  console.log("(dry-run — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}

g.note = NOTE;
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
const gBack = (back.data.options ?? []).find((o) => o.label === GROUP);
if (typeof gBack?.note !== "string" || gBack.note !== NOTE) die("อ่านกลับแล้วข้อความไม่ตรง");
if (back.data.savedAt !== data.savedAt) die("savedAt ไม่ตรง");
console.log("✓ เขียนแล้ว + อ่านกลับตรง · savedAt =", back.data.savedAt);

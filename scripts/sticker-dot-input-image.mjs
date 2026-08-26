/**
 * ช่องกรอก "จำนวนจุดไดคัท" ทั้ง 8 ตัว (สติ๊กเกอร์ Digital + UV/Solvent/RainBow/NEON/สะท้อนแสง/Gold/Hologram)
 * — ผู้ใช้สั่ง 26 ส.ค. 69: "(ดูวิธีนับจากรูปในแท็บ)" ให้กดดูภาพได้เลย
 *
 * ตั้ง noteImageSrc = อินโฟกราฟิก "การนับจุด DICUT" (รูปกลางที่ storage ของ sticker-pp)
 * ให้ทุกกลุ่มที่ชื่อขึ้นต้น "จำนวนจุดไดคัท" + แก้ hint ท้ายช่องเป็น "วิธีนับดูจากรูปตัวอย่าง —"
 * (ปุ่ม 👀 กดดูรูปตัวอย่าง ต่อท้าย hint เอง จากกลไก noteImageSrc ของกลุ่มช่องกรอก)
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram"];
const OLD_HINT = "นับจุดของลาย 1 ชิ้น (ดูวิธีนับจากรูปในแท็บ)";
const NEW_HINT = "นับจุดของลาย 1 ชิ้น — วิธีนับดูจากรูปตัวอย่าง";

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// รูปกลาง — อัปไว้ที่ sticker-pp แล้ว (สคริปต์ sticker-digital-size-and-diecut-edge.mjs) ทุกตัวชี้รูปเดียวกัน
const DOT_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/sticker-pp/dicut-dots.jpg`;

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  const hits = (p.options || []).filter((o) => /^จำนวนจุดไดคัท/.test(o.label));
  if (!hits.length) throw new Error(`${id}: ไม่พบกลุ่ม "จำนวนจุดไดคัท"`);
  console.log(`\n=== ${id}`);
  for (const o of hits) {
    o.noteImageSrc = DOT_URL;
    if (o.input?.hint === OLD_HINT) o.input.hint = NEW_HINT;
    console.log(` • [${o.label}] hint: ${o.input?.hint} · noteImageSrc ✓`);
  }
  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}

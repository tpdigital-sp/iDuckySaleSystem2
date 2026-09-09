/**
 * เรียงเมนู "ขนาดตัด" (ไดคัท 50%) ใหม่ทั้ง 9 ตัว — เจ้าของร้านทัก 9 ก.ย. 69 (A3 ไปโผล่หลัง A7 ดูไม่เป็นระเบียบ)
 * ลำดับใหม่: ใหญ่ → เล็ก · ขนาดครึ่งแนวตั้งต่อท้ายขนาดแม่ทันที · 4 × 6 นิ้ว · กำหนดขนาดเอง ท้ายสุด
 *   A3 · A4 · ครึ่ง A4 แนวตั้ง · A5 · ครึ่ง A5 แนวตั้ง · A6 · ครึ่ง A6 แนวตั้ง · A7 · 4 × 6 นิ้ว · 📐 กำหนดขนาดเอง
 * ⚠️ ตัวแรกของเมนู = ค่าเริ่มต้นของหน้า → เปลี่ยนจาก A4 เป็น A3 (เต็มแผ่น 1 ชิ้น)
 * ชื่อที่ไม่อยู่ในรายการเรียงต่อท้ายตามลำดับเดิม · เปลี่ยนแค่ลำดับ choices ไม่แตะโควตา/ป้าย · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram", "washi-sticker"];
const ORDER = ["A3", "A4", "ครึ่ง A4 แนวตั้ง", "A5", "ครึ่ง A5 แนวตั้ง", "A6", "ครึ่ง A6 แนวตั้ง", "A7", "4 × 6 นิ้ว", "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)"];
const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, ""); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  console.log(`\n=== ${id}`);
  const groups = (p.options || []).filter((o) => /^ขนาดตัด/.test(o.label) && o.choices?.length);
  if (!groups.length) throw new Error(`${id}: ไม่พบกลุ่มขนาดตัด`);
  for (const g of groups) {
    const rank = (c) => { const i = ORDER.indexOf(c.name); return i < 0 ? ORDER.length : i; };
    g.choices = g.choices.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
    console.log(` • [${g.label}] ${g.choices.map((c) => c.name).join(" · ")}`);
  }
  if (!WRITE) console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  else { const { error: e } = await sb.from("products").update({ data: p }).eq("id", id); console.log(e ? "   ❌ " + e.message : "   ✅ saved"); }
}

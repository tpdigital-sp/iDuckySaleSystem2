/**
 * ทาสีตัวเลือกขนาดตัด "ครึ่ง A4/A5/A6 แนวตั้ง" ในเมนูเลื่อนเป็นสีเขียว (choice.color) ทั้ง 9 ตัว — เจ้าของร้านสั่ง 9 ก.ย. 69
 * สีเขียวตามที่ร้านเขียนคำว่า "ครึ่ง …" ในตารางของตัวเอง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram", "washi-sticker"];
const COLOR = "#15803d"; // green-700
const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, ""); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  let n = 0;
  for (const g of (p.options || []).filter((o) => /^ขนาดตัด/.test(o.label) && o.choices?.length))
    for (const c of g.choices) { if (/^ครึ่ง /.test(c.name)) { c.color = COLOR; n++; } else delete c.color; }
  console.log(`${id}: ทาสี ${n} ตัว`);
  if (WRITE) { const { error: e } = await sb.from("products").update({ data: p }).eq("id", id); console.log(e ? "   ❌ " + e.message : "   ✅ saved"); }
}

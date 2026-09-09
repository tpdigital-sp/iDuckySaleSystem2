/**
 * เพิ่มขนาดตัด "ครึ่ง A4 / ครึ่ง A5 / ครึ่ง A6 แนวตั้ง" ให้สติ๊กเกอร์ดิจิตอล (sticker-pp) — เจ้าของร้านทัก 9 ก.ย. 69
 * (ตัวเดียวในครอบครัวไดคัท 50% ที่ยังไม่มี · อีก 8 ตัวมีตั้งแต่ 28 ส.ค. 69 ด้วย add-half-cut-sizes-7.mjs)
 * ชิ้น/แผ่น = 2 เท่าของขนาดต้นทาง (A4=2 → ครึ่ง A4=4 · A5=4 → 8 · A6=8 → 16) แทรกต่อจาก A3 ก่อน 4 × 6 นิ้ว
 * โควตาจุดไม่ต้องทำที่นี่ — รัน scripts/sticker-dots-quota-a3.mjs --write ต่อ (จับคู่ครึ่ง A6→A7 · ครึ่ง A5→A6 · ครึ่ง A4→A5 ตามภาพร้าน)
 * แล้ว sticker-cut-size-dot-badge.mjs --write เพื่อติดป้าย · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const ID = "sticker-pp";
const BASE = ["A4", "A5", "A6"];
const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, ""); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) throw new Error(error?.message || "ไม่พบสินค้า");
const p = row.data;
for (const g of (p.options || []).filter((o) => /^ขนาดตัด/.test(o.label) && o.choices?.length)) {
  const added = [];
  for (const L of BASE) {
    const name = `ครึ่ง ${L} แนวตั้ง`;
    if (g.choices.some((c) => c.name === name)) continue;
    const src = g.choices.find((c) => c.name === L);
    if (!src?.piecesPerUnit) throw new Error(`${g.label}: ไม่พบ ${L}`);
    const pieces = src.piecesPerUnit * 2;
    added.push({ name, badge: `ได้ ${pieces} ชิ้น / ${(src.badge || "").split(" / ")[1]?.split(" · ")[0] || "แผ่น A3"}`, piecesPerUnit: pieces });
  }
  let at = g.choices.findIndex((c) => c.name === "4 × 6 นิ้ว");
  if (at < 0) at = g.choices.findIndex((c) => /กำหนดขนาดเอง/.test(c.name));
  g.choices.splice(at < 0 ? g.choices.length : at, 0, ...added);
  console.log(`[${g.label}] เพิ่ม ${added.length} ตัว → ${g.choices.map((c) => `${c.name}${c.piecesPerUnit ? `=${c.piecesPerUnit}` : ""}`).join(" · ")}`);
}
if (!WRITE) console.log("(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
else { const { error: e } = await sb.from("products").update({ data: p }).eq("id", ID); console.log(e ? "❌ " + e.message : "✅ saved"); }

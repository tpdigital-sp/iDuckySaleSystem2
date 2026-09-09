// สลับรูปปกสินค้ามาใหม่หน้าแรก (เจ้าของร้านขอ 9 ก.ย. 69): เสื้อ CROP + เสื้อ OVER SIZE
// เอารูป gallery-2 ขึ้นเป็นปก = ตั้ง data.imageSrc + ย้ายรูปนั้นไปเป็น images[0] (หน้าสินค้าใช้ images[0] เป็นรูปหลัก)
// รันซ้ำได้ · dry-run ค่าเริ่มต้น · --apply เขียนจริง แล้วอ่านกลับเทียบ
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const die = (m) => { console.error("✗", m); process.exit(1); };
const PLAN = { crop: "gallery-2.jpg", oversize: "gallery-2.jpg" };

for (const [id, file] of Object.entries(PLAN)) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) die(`${id}: ${error.message}`);
  const d = row.data;
  const imgs = Array.isArray(d.images) ? d.images : [];
  const idx = imgs.findIndex((g) => typeof g.src === "string" && g.src.endsWith("/" + file));
  if (idx < 0) die(`${id}: ไม่พบ ${file} ในแกลเลอรี`);
  const target = imgs[idx].src;
  const already = d.imageSrc === target && idx === 0;
  console.log(`# ${id} ${row.name}\n  ปกเดิม: ${d.imageSrc?.split("/").pop()} → ${file}${already ? " (ทำไปแล้ว)" : ""}`);
  if (already || !APPLY) continue;
  const images = [imgs[idx], ...imgs.filter((_, i) => i !== idx)];
  const savedAt = new Date().toISOString();
  const next = { ...d, imageSrc: target, images, savedAt };
  const { data: upd, error: e2 } = await sb.from("products").update({ data: next }).eq("id", id).select("data");
  if (e2) die(`${id}: ${e2.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);
  const { data: back } = await sb.from("products").select("data").eq("id", id).single();
  const b = back.data;
  const ok = typeof b.imageSrc === "string" && b.imageSrc.startsWith("https://") && b.imageSrc === target && b.images?.[0]?.src === target && b.images.length === imgs.length && b.savedAt === savedAt;
  if (!ok) die(`${id}: อ่านกลับไม่ตรง imageSrc=${b.imageSrc} images[0]=${b.images?.[0]?.src} savedAt=${b.savedAt}`);
  console.log(`  ✓ เขียนแล้ว อ่านกลับตรง (images ${b.images.length} รูป)`);
}
console.log(APPLY ? "เสร็จ" : "dry-run — ใส่ --apply เพื่อเขียนจริง");

// ปกใหม่สินค้ามาใหม่หน้าแรก — ภาพสร้างด้วย Gemini (gemini-3-pro-image) จากรูปแกลเลอรีเดิมเป็นภาพอ้างอิง (เจ้าของร้านสั่ง 9 ก.ย. 69)
// อัปโหลดขึ้น product-images แล้วตั้ง imageSrc + แทนที่ gallery-1 (ปกเดิมที่ไม่เอา) ด้วยรูปใหม่ที่ตำแหน่ง images[0]
// ใช้: node scripts/fresh-cover-ai.mjs <dir ที่มีไฟล์> [--apply]   · รันซ้ำได้
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const die = (m) => { console.error("✗", m); process.exit(1); };
if (!DIR) die("ต้องระบุโฟลเดอร์ไฟล์ภาพ");
const PLAN = [
  { id: "crop", local: "new-crop-a.jpg", file: "cover-duck-icecream-v1.jpg", replace: "gallery-1.jpg" },
  { id: "oversize", local: "new-oversize-a.jpg", file: "cover-duck-skate-v1.jpg", replace: "gallery-1.jpg" },
];
for (const p of PLAN) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", p.id).single();
  if (error) die(`${p.id}: ${error.message}`);
  const d = row.data;
  const imgs = Array.isArray(d.images) ? d.images : [];
  const path = `products/${p.id}/${p.file}`;
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
  const done = d.imageSrc === url && imgs[0]?.src === url;
  console.log(`# ${p.id} ${row.name}\n  ปก: ${d.imageSrc?.split("/").pop()} → ${p.file}${done ? " (ทำไปแล้ว)" : ""}`);
  if (done || !APPLY) continue;
  const buf = await sharp(join(DIR, p.local)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`${p.id}: upload ${up.error.message}`);
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) die(`${p.id}: ดึงรูปที่อัปแล้วไม่ได้ ${head.status}`);
  console.log(`  ↑ อัปโหลดแล้ว ${(buf.length / 1024).toFixed(0)} KB`);
  const tmpl = imgs[0] ?? { emoji: "👕", label: "", gradient: "" };
  const newImg = { ...tmpl, src: url, label: "" };
  const rest = imgs.filter((g) => !(typeof g.src === "string" && (g.src.endsWith("/" + p.replace) || g.src === url)));
  const images = [newImg, ...rest].slice(0, 5);
  const savedAt = new Date().toISOString();
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, imageSrc: url, images, savedAt } }).eq("id", p.id).select("data");
  if (e2) die(`${p.id}: ${e2.message}`);
  if (!upd?.length) die(`${p.id}: update โดน 0 แถว`);
  const { data: back } = await sb.from("products").select("data").eq("id", p.id).single();
  const b = back.data;
  const ok = typeof b.imageSrc === "string" && b.imageSrc.startsWith("https://") && b.imageSrc === url && b.images?.[0]?.src === url && b.images.length === images.length && b.savedAt === savedAt;
  if (!ok) die(`${p.id}: อ่านกลับไม่ตรง imageSrc=${b.imageSrc} images[0]=${b.images?.[0]?.src}`);
  console.log(`  ✓ เขียนแล้ว อ่านกลับตรง แกลเลอรี: ${b.images.map((g) => g.src.split("/").pop()).join(" · ")}`);
}
console.log(APPLY ? "เสร็จ" : "dry-run — ใส่ --apply เพื่อเขียนจริง");

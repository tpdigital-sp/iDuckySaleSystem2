// เติมแกลเลอรีสินค้าด้วยภาพสร้างจาก Gemini (เสื้อมีแค่ขาว/ดำ) — เจ้าของร้านสั่ง 9 ก.ย. 69
// ใช้: node scripts/gallery-fill-ai.mjs <productId> <dir> [--apply] · รันซ้ำได้ (ข้ามรูปที่อยู่ในแกลเลอรีแล้ว) · แทรกต่อจากรูปปก
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const [ID, DIR] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗", m); process.exit(1); };
const PLANS = {
  crop: [
    { local: "crop-black-worn-cut.jpg", file: "photo-black-worn-moon-v1.jpg" },
    { local: "crop-white-black-pair.jpg", file: "photo-white-black-hangers-v1.jpg" },
  ],
  oversize: [
    { local: "os-black-worn-a.jpg", file: "photo-black-worn-headphones-v1.jpg" },
    { local: "os-white-worn-cut.jpg", file: "photo-white-worn-sunflower-v1.jpg" },
    { local: "os-black-hanger.jpg", file: "photo-black-hanger-crown-v1.jpg" },
    { local: "os-black-worn-b-cut.jpg", file: "photo-black-worn-boba-v1.jpg" },
  ],
};
const NEW = PLANS[ID];
if (!NEW || !DIR) die("ใช้: node scripts/gallery-fill-ai.mjs <crop|oversize> <dir> [--apply]");
const MAX_PHOTOS = 12; // ตรงกับ ProductEditor.tsx
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const imgs = Array.isArray(d.images) ? d.images : [];
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const todo = NEW.filter((n) => !imgs.some((g) => g.src === urlOf(n.file)));
console.log(`# ${row.name} ตอนนี้ ${imgs.length} รูป: ${imgs.map((g) => g.src.split("/").pop()).join(" · ")}`);
console.log(todo.length ? `  จะเพิ่ม ${todo.length}: ${todo.map((n) => n.file).join(" · ")}` : "  ครบแล้ว");
if (imgs.length + todo.length > MAX_PHOTOS) die(`เกิน ${MAX_PHOTOS} รูป`);
if (!todo.length || !APPLY) { console.log(APPLY ? "เสร็จ" : "dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
const added = [];
for (const n of todo) {
  const buf = await sharp(join(DIR, n.local)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${n.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`upload ${n.file}: ${up.error.message}`);
  const head = await fetch(urlOf(n.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${n.file} ไม่ได้ ${head.status}`);
  console.log(`  ↑ ${n.file} ${(buf.length / 1024).toFixed(0)} KB`);
  added.push({ ...(imgs[0] ?? { emoji: "👕", gradient: "" }), src: urlOf(n.file), label: "" });
}
const images = [imgs[0], ...added, ...imgs.slice(1)].filter(Boolean);
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, images, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const ok = b.savedAt === savedAt && b.images.length === images.length && added.every((a, i) => typeof b.images[i + 1]?.src === "string" && b.images[i + 1].src.startsWith("https://") && b.images[i + 1].src === a.src) && b.imageSrc === d.imageSrc;
if (!ok) die(`อ่านกลับไม่ตรง: ${JSON.stringify(b.images.map((g) => g.src.split("/").pop()))}`);
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง ${b.images.length} รูป: ${b.images.map((g) => g.src.split("/").pop()).join(" · ")}\nเสร็จ`);

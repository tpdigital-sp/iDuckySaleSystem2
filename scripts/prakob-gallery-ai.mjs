/**
 * 🖼 เติมแกลเลอรีอะคริลิคประกบด้วยภาพที่สร้างเอง (Gemini) — เจ้าของร้านสั่ง 21 ก.ย. 69 "สร้างภาพเพิ่มให้หน่อย"
 * ภาพต่อท้ายรูปจริงเดิม 4 ใบ (ปก 01.jpg ไม่ขยับ) · prompt อยู่ที่ .cache/prakob-gallery-ai/gen.mjs (ไม่ commit)
 * ดู [[iducky-ai-product-photo]] · รันซ้ำได้ (ใบที่อยู่ในแกลเลอรีแล้วข้าม)
 *
 *   node scripts/prakob-gallery-ai.mjs .cache/prakob-gallery-ai            # dry-run
 *   node scripts/prakob-gallery-ai.mjs .cache/prakob-gallery-ai --apply
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ID = "acrylic-prakob";
const MAX_PHOTOS = 12;   // ตรงกับ ProductEditor.tsx
const PLAN = [
  { local: "g1-flatlay.jpg", file: "ai-flatlay-6charms-v1.jpg" },
  { local: "g2-hand.jpg", file: "ai-hand-clear-v1.jpg" },
  { local: "g3-edge.jpg", file: "ai-edge-3mm-v1.jpg" },
  { local: "g4-bag.jpg", file: "ai-bag-2charms-v1.jpg" },
  { local: "g5-standee.jpg", file: "ai-standee-desk-v1.jpg" },
  { local: "g6-pack.jpg", file: "ai-stack-parts-v1.jpg" },
];
const APPLY = process.argv.includes("--apply");
const DIR = process.argv.slice(2).find((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!DIR) die("ใช้: node scripts/prakob-gallery-ai.mjs <dir> [--apply]");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) die(error.message);
const p = row.data;
const imgs = Array.isArray(p.images) ? p.images : [];
const todo = PLAN.filter((n) => !imgs.some((g) => g.src === urlOf(n.file)));
console.log(`# ${p.name} ตอนนี้ ${imgs.length} รูป: ${imgs.map((g) => g.src.split("/").pop()).join(" · ")}`);
console.log(todo.length ? `  จะเพิ่ม ${todo.length}: ${todo.map((n) => n.file).join(" · ")}` : "  ครบแล้ว");
if (imgs.length + todo.length > MAX_PHOTOS) die(`เกิน ${MAX_PHOTOS} รูป (หน้าแก้ไขรับได้เท่านี้)`);
if (!todo.length || !APPLY) { console.log(APPLY ? "เสร็จ" : "— dry-run · ใส่ --apply เพื่ออัปโหลด+เขียนจริง"); process.exit(0); }

const added = [];
for (const n of todo) {
  const buf = await sharp(join(DIR, n.local)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${n.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`upload ${n.file}: ${up.error.message}`);
  const head = await fetch(urlOf(n.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${n.file} ไม่ได้ ${head.status}`);
  console.log(`  ↑ ${n.file} ${(buf.length / 1024).toFixed(0)} KB`);
  added.push({ ...(imgs[0] ?? { emoji: "🧊", gradient: "" }), src: urlOf(n.file), label: "" });
}
const images = [...imgs, ...added];
const savedAt = new Date().toISOString();
const upd = await sb.from("products").update({ data: { ...p, images, savedAt } }).eq("id", ID).select("data");
if (upd.error) die(upd.error.message);
if (!upd.data?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
if (b.savedAt !== savedAt) die("อ่านกลับ savedAt ไม่ตรง");
if (b.images.length !== images.length) die("อ่านกลับ จำนวนรูปไม่ตรง");
if (b.imageSrc !== p.imageSrc) die("อ่านกลับ รูปปกเปลี่ยน (ไม่ควรเปลี่ยน)");
if (!added.every((a) => b.images.some((g) => g.src === a.src))) die("อ่านกลับ รูปที่เพิ่มหาย");
console.log(`✅ เขียนแล้ว อ่านกลับตรง ${b.images.length} รูป: ${b.images.map((g) => g.src.split("/").pop()).join(" · ")}`);

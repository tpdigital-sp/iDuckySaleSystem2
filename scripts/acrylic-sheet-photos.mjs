/**
 * แผ่นอะคริลิค (acrylic-sheet) — เปลี่ยนแกลเลอรีเป็น "แผ่นอะคริลิคพิมพ์ลาย ไม่ใส่ตะขอ" · 15 ก.ย. 69
 *
 *   node scripts/acrylic-sheet-photos.mjs            # ดูผล (ไม่เขียน)
 *   node scripts/acrylic-sheet-photos.mjs --apply    # อัปรูป + เขียนจริง
 *
 * เจ้าของร้านสั่ง: สินค้าตัวนี้คือ "งานพิมพ์ลาย แต่ไม่ใส่ตะขอ" — รูปที่ก๊อปมาจากพวงกุญแจมีโซ่/ตะขอทุกใบ ต้องเปลี่ยนทั้งชุด
 * ที่มาของรูป (เจ้าของสั่ง "ทำทั้งสองอย่าง"):
 *   - รูปงานจริงของร้าน 4 ใบ คัดจาก /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/ตัวอย่าง.รูปภาพ
 *     (เฉพาะใบที่ชิ้นงานไม่มีโซ่/ตะขอติดอยู่จริง ๆ)
 *   - รูปสร้างด้วย Gemini 4 ใบ อ้างอิงรูปจริง 2 ใบข้างบน (ดู memory iducky-ai-product-photo)
 * ไฟล์ต้นทางเก็บไว้ที่ .tmpwork/acrylic-sheet/ (ไม่ขึ้น git) — รันซ้ำได้ตราบที่ไฟล์ยังอยู่
 *
 * ครอป 4:3 ให้เท่ากันทั้งชุด (แกลเลอรีเดิมของร้านเป็น 900×675) · ชื่อไฟล์ตามเนื้อหา ไม่ใช่ลำดับ
 * เขียน data.imageSrc + data.images พร้อมกัน (การ์ดหน้าแรกอ่าน imageSrc · หน้าสินค้าอ่าน images[0])
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const ID = "acrylic-sheet";
const SRC_DIR = new URL("../.tmpwork/acrylic-sheet/", import.meta.url).pathname;
const MAX_PHOTOS = 12; // ตรงกับ MAX_PHOTOS ใน ProductEditor.tsx

/** เรียงสลับรูปจริง/รูปสร้าง — ปกเป็นรูปงานจริงเสมอ */
const PLAN = [
  { local: "real-glitter-round-hand.jpg", file: "photo-glitter-round-hand-v1.jpg", note: "งานจริง · แผ่นกลมกลิตเตอร์ไล่สี เจาะรู ไม่มีตะขอ (ปก)" },
  { local: "ai-clear-pieces-wood.jpg", file: "photo-clear-pieces-wood-v1.jpg", note: "สร้างใหม่ · ชิ้นใสพิมพ์ลายวางบนโต๊ะไม้" },
  { local: "real-glitter-charms-tray.jpg", file: "photo-glitter-charms-tray-v1.jpg", note: "งานจริง · ชิ้นกลิตเตอร์หลายทรงหลายสี" },
  { local: "ai-glitter-pastel-flatlay.jpg", file: "photo-glitter-flatlay-v1.jpg", note: "สร้างใหม่ · ชิ้นกลิตเตอร์เรียงบนผ้าขนนุ่ม" },
  { local: "real-butterfly-white.jpg", file: "photo-butterfly-pieces-v1.jpg", note: "งานจริง · ผีเสื้อพิมพ์ลาย ไม่ใส่ตะขอ" },
  { local: "ai-white-c02-hand.jpg", file: "photo-white-c02-hand-v1.jpg", note: "สร้างใหม่ · ชิ้นขาวขุ่น C-02 ในมือ" },
  { local: "real-purple-piece-hand.jpg", file: "photo-purple-piece-hand-v1.jpg", note: "งานจริง · ชิ้นสีม่วงพิมพ์ลายในมือ" },
  { local: "ai-holographic-desk.jpg", file: "photo-holographic-desk-v1.jpg", note: "สร้างใหม่ · ชิ้นโฮโลแกรมบนสมุด" },
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
if (error) die(error.message);
if (!row) die(`ไม่พบสินค้า ${ID}`);
const d = row.data;
if (PLAN.length > MAX_PHOTOS) die(`เกิน ${MAX_PHOTOS} รูป`);

console.log(`# ${row.name} (${ID}) — แกลเลอรีตอนนี้ ${d.images?.length ?? 0} รูป`);
for (const g of d.images ?? []) console.log(`   เดิม: ${g.src.split("/").pop().slice(0, 60)}`);
console.log(`\nจะเปลี่ยนเป็น ${PLAN.length} รูป:`);
for (const [i, p] of PLAN.entries()) console.log(`   ${i + 1}. ${p.file} — ${p.note}`);
if (!APPLY) {
  console.log("\n— ดูอย่างเดียว ใส่ --apply เพื่ออัปรูปและเขียนจริง —");
  process.exit(0);
}

/** ครอปกลางเป็น 4:3 กว้าง 1600 — ให้ทุกใบสัดส่วนเท่ากันในแกลเลอรี */
const images = [];
for (const p of PLAN) {
  const buf = await sharp(join(SRC_DIR, p.local))
    .resize(1600, 1200, { fit: "cover", position: "centre", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${p.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`อัป ${p.file}: ${up.error.message}`);
  const head = await fetch(urlOf(p.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${p.file} กลับไม่ได้ (${head.status})`);
  const meta = await sharp(buf).metadata();
  console.log(`  ↑ ${p.file} ${meta.width}×${meta.height} ${(buf.length / 1024).toFixed(0)} KB`);
  // emoji เดิมเป็น 🗝️ (กุญแจ) ติดมาจากพวงกุญแจ — สินค้านี้ไม่มีตะขอ ใช้ 🔷
  images.push({ src: urlOf(p.file), emoji: "🔷", label: "", gradient: d.images?.[0]?.gradient ?? "from-sky-100 to-teal-200" });
}

const savedAt = new Date().toISOString();
const next = { ...d, images, imageSrc: images[0].src, emoji: "🔷", savedAt };
const { data: upd, error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");

const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (e3 || !back) die(`อ่านกลับไม่ได้: ${e3?.message ?? "ไม่พบแถว"}`);
const b = back.data;
const checks = [
  [`แกลเลอรี ${PLAN.length} รูป`, b.images?.length === PLAN.length],
  ["ทุกรูปเป็น url จริงของ storage ตัวนี้", (b.images ?? []).every((g, i) => typeof g.src === "string" && g.src.startsWith("https://") && g.src === images[i].src)],
  ["ไม่มีรูปเก่าจาก wixstatic เหลือ", !(b.images ?? []).some((g) => g.src.includes("wixstatic"))],
  ["รูปปก (imageSrc) = รูปแรก", b.imageSrc === images[0].src],
  ["savedAt ตรง", b.savedAt === savedAt],
  ["ตัวเลือกยังครบ (ไม่ได้เขียนทับส่วนอื่น)", (b.options?.length ?? 0) === (d.options?.length ?? 0)],
  ["ตารางราคายังอยู่", JSON.stringify(b.pricing) === JSON.stringify(d.pricing)],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) bad++;
}
if (bad) die(`อ่านกลับไม่ตรง ${bad} ข้อ`);
console.log(`\n✓ เปลี่ยนแกลเลอรีแล้ว ${b.images.length} รูป — /admin/products/${ID}`);

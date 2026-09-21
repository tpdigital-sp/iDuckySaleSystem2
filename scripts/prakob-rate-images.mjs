/**
 * 🖼 ภาพประจำเรทราคา + ลำดับเรท ของอะคริลิคประกบ (acrylic-prakob)
 * เจ้าของร้านสั่ง 21 ก.ย. 69: "กลุ่มเรทราคา สร้างภาพสินค้าให้หน่อย" + เรียงเรท พวงกุญแจ → 2 ชิ้นใน 1 พวง → สแตนดี้
 *
 * ภาพสร้างด้วย Gemini (gemini-3-pro-image) โดยส่งรูปจริงของสินค้า 2 ใบเป็นภาพอ้างอิง (style only)
 * สคริปต์สร้างอยู่ที่ .cache/prakob-rate-ai/gen.mjs (ไม่ commit) — ดู [[iducky-ai-product-photo]]
 *
 *   node scripts/prakob-rate-images.mjs .cache/prakob-rate-ai            # dry-run
 *   node scripts/prakob-rate-images.mjs .cache/prakob-rate-ai --apply    # อัปโหลด + เขียนฐาน
 *
 * รันซ้ำได้ · อ่านกลับเทียบ · ข้อมูลล้วน ไม่ต้อง deploy
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ID = "acrylic-prakob";
const APPLY = process.argv.includes("--apply");
const DIR = process.argv.slice(2).find((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!DIR) die("ใช้: node scripts/prakob-rate-images.mjs <dir> [--apply]");

/** เรทไหนใช้ภาพไหน + ลำดับที่จะเรียง (เรทตัวแทนใช้ภาพเดียวกับใบปกติ และตามหลังใบ public เสมอ) */
const PLAN = [
  { id: "r1", local: "rate-keyring.jpg", file: "rate-keyring-v1.jpg" },
  { id: "r-2pc", local: "rate-2pieces.jpg", file: "rate-2pieces-v1.jpg" },
  { id: "r-stand", local: "rate-standee.jpg", file: "rate-standee-v1.jpg" },
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const p = row.data;
const rates = p.priceRates || [];
for (const n of PLAN) if (!rates.some((r) => r.id === n.id)) die(`ไม่พบเรท ${n.id}`);

// ── ลำดับใหม่: public ตาม PLAN แล้วตามด้วยเรทตัวแทนของแต่ละใบ (ใบไหนไม่อยู่ใน PLAN ต่อท้ายไว้)
const order = [...PLAN.map((n) => n.id), ...PLAN.map((n) => `${n.id}-dealer`)];
const ranked = [...rates].sort((a, b) => {
  const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
if (ranked[0]?.dealerOnly) die("เรทแรกกลายเป็นเรทตัวแทน — ห้าม (pricing หลัก fallback ที่ใบแรก)");

console.log("ลำดับใหม่: " + ranked.map((r) => r.label).join(" → "));
console.log("ภาพ: " + PLAN.map((n) => `${n.id}=${n.file}`).join(" · "));
if (!APPLY) { console.log("— dry-run · ใส่ --apply เพื่ออัปโหลด+เขียนจริง"); process.exit(0); }

for (const n of PLAN) {
  const buf = await sharp(join(DIR, n.local)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${n.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`upload ${n.file}: ${up.error.message}`);
  const head = await fetch(urlOf(n.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${n.file} ไม่ได้ ${head.status}`);
  console.log(`  ↑ ${n.file} ${(buf.length / 1024).toFixed(0)} KB`);
  for (const r of ranked) if (r.id === n.id || r.id === `${n.id}-dealer`) r.imageSrc = urlOf(n.file);
}

p.priceRates = ranked;
p.savedAt = new Date().toISOString();
const upd = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (upd.error) die(upd.error.message);
if (!upd.data?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const q = back.data;
if (q.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง");
if ((q.priceRates || []).map((r) => r.id).join(",") !== ranked.map((r) => r.id).join(",")) die("อ่านกลับ ลำดับเรทไม่ตรง");
for (const n of PLAN)
  for (const id of [n.id, `${n.id}-dealer`]) {
    const r = q.priceRates.find((x) => x.id === id);
    if (r && r.imageSrc !== urlOf(n.file)) die(`อ่านกลับ ภาพของ ${id} ไม่ตรง`);
  }
console.log("✅ เขียนแล้ว + อ่านกลับตรวจครบ: " + q.priceRates.map((r) => `${r.label}${r.imageSrc ? " 🖼" : ""}`).join(" · "));

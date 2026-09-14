// 🖼 ภาพตัวอย่างประจำ "กลุ่มตัวเลือก" ของอะคริลิคคิท (new-mt2rpb1j-2194) — เจ้าของร้านสั่ง 14 ก.ย. 69
// กลุ่มของเสริม 3 กลุ่มที่ปิดไว้ก่อน (ฐานรูเสียบ / แม่เหล็ก / เพิ่มจำนวนชิ้นงาน) หน้าร้านเห็นแค่บรรทัดเดียว
// ชื่อกลุ่มอย่างเดียวนึกภาพไม่ออกว่าของเสริมนี้หน้าตายังไง → ใส่ภาพย่อในแถวสวิตช์ (ProductOption.imageSrc)
// และตั้ง noteImageSrc ตัวเดียวกันด้วย เปิดสวิตช์แล้วจะมีปุ่ม "👀 กดดูรูปตัวอย่าง" ท้ายคำอธิบายให้ดูเต็มจอ
//
// ภาพสร้างด้วย Gemini (gemini-3-pro-image) โดยส่งรูปจริงของสินค้าเป็นภาพอ้างอิง — ดู [[iducky-ai-product-photo]]
//
//   node scripts/acrylic-kit-option-group-art.mjs <โฟลเดอร์ไฟล์ภาพ>            # ดูก่อน (ไม่เขียน)
//   node scripts/acrylic-kit-option-group-art.mjs <โฟลเดอร์ไฟล์ภาพ> --apply    # เขียนจริง
//
// ไฟล์ที่ต้องมีในโฟลเดอร์: optart-standee-base.png · optart-magnet-crop.png · optart-more-pieces.png
// รันซ้ำได้ (ตั้งค่าเดิมซ้ำ = ไม่มีอะไรค้าง) · เขียนแล้วอ่านกลับเทียบเสมอ
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

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

const APPLY = process.argv.includes("--apply");
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
if (!DIR) die("ต้องระบุโฟลเดอร์ไฟล์ภาพ");

const ID = "new-mt2rpb1j-2194";
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;

/** กลุ่ม → ไฟล์ภาพ (local = ไฟล์ที่สร้างไว้ · file = ชื่อบน storage ตั้งตาม "รูปอะไร" ไม่ใช่ลำดับ) */
const PLAN = [
  { label: "ฐานรูเสียบสแตนดี้", local: "optart-standee-base.png", file: "optgroup-standee-base-v1.jpg" },
  { label: "แม่เหล็ก (Acrylic Kit Magnet)", local: "optart-magnet-crop.png", file: "optgroup-magnet-v1.jpg" },
  { label: "เพิ่มจำนวนชิ้นงาน (เกิน 5 ชิ้นต่อกรอบ)", local: "optart-more-pieces.png", file: "optgroup-more-pieces-v1.jpg" },
];

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const opts = Array.isArray(d.options) ? d.options : [];
console.log(`# ${ID} ${row.name}`);

let pending = 0;
for (const p of PLAN) {
  const hits = opts.filter((o) => o.label === p.label);
  if (hits.length !== 1) die(`กลุ่ม "${p.label}" เจอ ${hits.length} กลุ่ม (ต้องเจอ 1)`); // ชื่อกลุ่มซ้ำ = เขียนผิดกลุ่ม
  const done = hits[0].imageSrc === urlOf(p.file) && hits[0].noteImageSrc === urlOf(p.file);
  if (!done) pending++;
  console.log(`  ${p.label}: ${done ? "ทำไปแล้ว" : `→ ${p.file}`}`);
}
if (!pending) {
  console.log("ทำไปแล้วทั้งหมด");
  process.exit(0);
}
if (!APPLY) {
  console.log("dry-run — ใส่ --apply เพื่อเขียนจริง");
  process.exit(0);
}

// รูปกลุ่มโชว์ที่ 44px และเปิดดูเต็มจอได้ → เก็บจัตุรัส 900 พอ (ช่องบนหน้าร้านเป็นจัตุรัส ไม่ครอป)
for (const p of PLAN) {
  const buf = await sharp(join(DIR, p.local))
    .resize(900, 900, { fit: "cover" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${p.file}`, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) die(`${p.file}: upload ${up.error.message}`);
  const head = await fetch(urlOf(p.file), { method: "HEAD" });
  if (!head.ok) die(`${p.file}: ดึงรูปที่อัปแล้วไม่ได้ ${head.status}`);
  console.log(`  ↑ ${p.file} ${(buf.length / 1024).toFixed(0)} KB`);
}

const options = opts.map((o) => {
  const p = PLAN.find((p) => p.label === o.label);
  return p ? { ...o, imageSrc: urlOf(p.file), noteImageSrc: urlOf(p.file) } : o;
});
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
if (b.savedAt !== savedAt) die("อ่านกลับแล้ว savedAt ไม่ตรง — ยังไม่ลงจริง");
for (const p of PLAN) {
  const o = b.options.find((o) => o.label === p.label);
  if (o?.imageSrc !== urlOf(p.file) || o?.noteImageSrc !== urlOf(p.file)) die(`อ่านกลับ "${p.label}" ไม่ตรง`);
}
// ตัวเลือกในกลุ่มต้องครบเท่าเดิม (กันสคริปต์เผลอทับ choices)
const before = opts.reduce((n, o) => n + (o.choices?.length ?? 0), 0);
const after = b.options.reduce((n, o) => n + (o.choices?.length ?? 0), 0);
if (before !== after) die(`จำนวนตัวเลือกเปลี่ยน ${before} → ${after}`);
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง ${PLAN.length} กลุ่ม (ตัวเลือกครบ ${after} ตัวเท่าเดิม)`);

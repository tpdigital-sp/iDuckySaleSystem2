// ภาพตัวเลือก "สีเสื้อ" เสื้อ CROP ใหม่ทั้ง 4 สี (ดำ/ขาว/เบจ/ผ้าดิบ) — ภาพสร้างด้วย Gemini (gemini-3-pro-image) ชุดเดียวกัน: เสื้อบนไม้แขวน ผนังขาว ลายเป็ดมงกุฎเล็กกลางอก 1:1 (เจ้าของร้านสั่ง 10 ก.ย. 69)
// ของเดิม color-*.jpg เป็นรูปจากเว็บราคา (คนละมุม · ผ้าดิบเป็นแผ่นสีเฉย ๆ) → อัปชื่อไฟล์ใหม่ (CDN แคชชื่อเดิม) แล้วชี้ทุก choice ที่ยังใช้ color-<สี>.jpg ทั้งกลุ่ม "สีเสื้อ" และ "สีเสื้อ (งานซับลิเมชั่น)"
// ใช้: node scripts/crop-color-option-ai.mjs <dir ที่มี new-color-{black,white,beige,natural}.jpg> [--apply]   · รันซ้ำได้
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
const ID = "crop";
const COLORS = ["black", "white", "beige", "natural"];
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const PLAN = COLORS.map((c) => ({ c, local: `new-color-${c}.jpg`, old: `color-${c}.jpg`, file: `color-${c}-hanger-v1.jpg` }));
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const opts = Array.isArray(d.options) ? d.options : [];
let pending = 0;
console.log(`# ${ID} ${row.name}`);
for (const o of opts) for (const ch of o.choices ?? []) {
  const p = PLAN.find((p) => typeof ch.imageSrc === "string" && (ch.imageSrc.endsWith("/" + p.old) || ch.imageSrc === urlOf(p.file)));
  if (!p) continue;
  const done = ch.imageSrc === urlOf(p.file);
  if (!done) pending++;
  console.log(`  ${o.label ?? o.name} | ${ch.name}: ${ch.imageSrc.split("/").pop()}${done ? " (ทำไปแล้ว)" : " → " + p.file}`);
}
if (!pending) { console.log("ทำไปแล้วทั้งหมด"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
for (const p of PLAN) {
  const buf = await sharp(join(DIR, p.local)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${p.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`${p.c}: upload ${up.error.message}`);
  const head = await fetch(urlOf(p.file), { method: "HEAD" });
  if (!head.ok) die(`${p.c}: ดึงรูปที่อัปแล้วไม่ได้ ${head.status}`);
  console.log(`  ↑ ${p.file} ${(buf.length / 1024).toFixed(0)} KB`);
}
const options = opts.map((o) => ({ ...o, choices: (o.choices ?? []).map((ch) => { const p = PLAN.find((p) => typeof ch.imageSrc === "string" && ch.imageSrc.endsWith("/" + p.old)); return p ? { ...ch, imageSrc: urlOf(p.file) } : ch; }) }));
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const left = b.options.flatMap((o) => o.choices ?? []).filter((ch) => PLAN.some((p) => typeof ch.imageSrc === "string" && ch.imageSrc.endsWith("/" + p.old)));
const now = b.options.flatMap((o) => o.choices ?? []).filter((ch) => PLAN.some((p) => ch.imageSrc === urlOf(p.file)));
if (b.savedAt !== savedAt || left.length || now.length !== pending) die(`อ่านกลับไม่ตรง เหลือของเก่า ${left.length} ใหม่ ${now.length}/${pending}`);
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง ${now.length} ตัวเลือก`);

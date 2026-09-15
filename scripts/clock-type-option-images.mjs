// ภาพตัวเลือกกลุ่ม "ชนิด" นาฬิกาอะคริลิค (oclockdigital-1) 3 แบบ — ครอปจตุรัสจากรูปถ่ายจริงหน้า /oclockdigital ของเว็บ pricelists
// (ชุดเดียวกับที่เจ้าของร้านส่งสกรีนช็อตมา 11 ก.ย. 69: แขวนผนัง=จรวด 17:01 · ตั้งโต๊ะ=จรวดซูม 16:15 · แบบเข็ม=สีเหลืองบนฐานไม้)
// ใช้: node scripts/clock-type-option-images.mjs <dir ที่มี type-digital-wall.jpg type-digital-desk.jpg type-analog.jpg> [--apply]   · รันซ้ำได้
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
const ID = "oclockdigital-1";
const GROUP = "ชนิด";
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const PLAN = [
  { choice: "ดิจิตอล แบบแขวนผนัง", local: "type-digital-wall.jpg", file: "type-digital-wall-v1.jpg" },
  { choice: "ดิจิตอล แบบตั้งโต๊ะ", local: "type-digital-desk.jpg", file: "type-digital-desk-v1.jpg" },
  { choice: "นาฬิกา แบบเข็ม", local: "type-analog.jpg", file: "type-analog-v1.jpg" },
];
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const opts = Array.isArray(d.options) ? d.options : [];
const groups = opts.filter((o) => (o.label ?? o.name) === GROUP);
if (groups.length !== 1) die(`กลุ่ม "${GROUP}" พบ ${groups.length} กลุ่ม`);
const g = groups[0];
let pending = 0;
console.log(`# ${ID} ${row.name} · กลุ่ม ${GROUP}`);
for (const p of PLAN) {
  const ch = (g.choices ?? []).find((c) => c.name === p.choice);
  if (!ch) die(`ไม่พบตัวเลือก "${p.choice}"`);
  const done = ch.imageSrc === urlOf(p.file);
  if (!done) pending++;
  console.log(`  ${p.choice}: ${ch.imageSrc ? ch.imageSrc.split("/").pop() : "(ไม่มีภาพ)"}${done ? " (ทำไปแล้ว)" : " → " + p.file}`);
}
if (!pending) { console.log("ทำไปแล้วทั้งหมด"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
for (const p of PLAN) {
  const buf = await sharp(join(DIR, p.local)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${p.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`${p.file}: upload ${up.error.message}`);
  const head = await fetch(urlOf(p.file), { method: "HEAD" });
  if (!head.ok) die(`${p.file}: ดึงรูปที่อัปแล้วไม่ได้ ${head.status}`);
  console.log(`  ↑ ${p.file} ${(buf.length / 1024).toFixed(0)} KB`);
}
const options = opts.map((o) => o !== g ? o : { ...o, choices: (o.choices ?? []).map((ch) => { const p = PLAN.find((p) => p.choice === ch.name); return p ? { ...ch, imageSrc: urlOf(p.file) } : ch; }) });
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bg = b.options.find((o) => (o.label ?? o.name) === GROUP);
const now = PLAN.filter((p) => bg.choices.find((c) => c.name === p.choice)?.imageSrc === urlOf(p.file));
if (b.savedAt !== savedAt || now.length !== PLAN.length) die(`อ่านกลับไม่ตรง ${now.length}/${PLAN.length}`);
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง ${now.length} ตัวเลือก`);

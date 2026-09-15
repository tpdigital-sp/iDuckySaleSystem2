// ภาพประจำเรท "พิมพ์ DTF/DFT" ของเสื้อ CROP ใหม่ — ภาพสร้างด้วย Gemini (gemini-3-pro-image) จากปก + รูปแกลเลอรีเดิมเป็นภาพอ้างอิง (เจ้าของร้านสั่ง 10 ก.ย. 69)
// ของเดิม rate-dtf.jpg เป็นรูปเสื้อเบจจากเว็บราคา (สีที่ไม่มีขาย) → รูปใหม่ ขาว+ดำวางคู่ ลายเดียวกัน สื่อว่า DTF พิมพ์ได้ทั้งผ้าอ่อน/เข้ม
// อัปขึ้น product-images ชื่อไฟล์ใหม่ (CDN แคชชื่อเดิม) แล้วชี้ priceRates ทุกตัวที่ยังใช้ rate-dtf.jpg (r1 + r1-dealer) มาที่รูปใหม่
// ใช้: node scripts/crop-rate-dtf-ai.mjs <ไฟล์ภาพ> [--apply]   · รันซ้ำได้
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const FILE = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const die = (m) => { console.error("✗", m); process.exit(1); };
if (!FILE) die("ต้องระบุไฟล์ภาพ");
const ID = "crop", OLD = "rate-dtf.jpg", NEW = "rate-dtf-duo-v1.jpg";
const path = `products/${ID}/${NEW}`;
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const rates = Array.isArray(d.priceRates) ? d.priceRates : [];
const targets = rates.filter((r) => typeof r.imageSrc === "string" && (r.imageSrc.endsWith("/" + OLD) || r.imageSrc === url));
console.log(`# ${ID} ${row.name}`);
for (const r of rates) console.log(`  ${r.id.padEnd(20)} ${r.imageSrc?.split("/").pop()}${targets.includes(r) ? (r.imageSrc === url ? " (ทำไปแล้ว)" : " → " + NEW) : ""}`);
if (!targets.length) die(`ไม่มีเรทที่ใช้ ${OLD}`);
if (targets.every((r) => r.imageSrc === url)) { console.log("ทำไปแล้วทั้งหมด"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
const buf = await sharp(FILE).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
const up = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
if (up.error) die(`upload ${up.error.message}`);
const head = await fetch(url, { method: "HEAD" });
if (!head.ok) die(`ดึงรูปที่อัปแล้วไม่ได้ ${head.status}`);
console.log(`  ↑ อัปโหลดแล้ว ${(buf.length / 1024).toFixed(0)} KB`);
const priceRates = rates.map((r) => (targets.includes(r) ? { ...r, imageSrc: url } : r));
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, priceRates, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const ok = b.savedAt === savedAt && targets.every((t) => b.priceRates.find((r) => r.id === t.id)?.imageSrc === url) && b.priceRates.length === rates.length;
if (!ok) die("อ่านกลับไม่ตรง");
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง: ${targets.map((t) => t.id).join(" · ")} → ${NEW}`);

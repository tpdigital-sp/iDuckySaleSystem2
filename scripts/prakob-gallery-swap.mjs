/**
 * 🔁 สลับรูปในแกลเลอรีอะคริลิคประกบเป็นไฟล์ใหม่ (ชื่อไฟล์ใหม่เสมอ — ทับพาธเดิมแล้วลูกค้าเห็นรูปเก่าจากแคช
 * ดู [[iducky-image-cache-bust]]) แล้วลบไฟล์เก่าทิ้งจาก storage
 *   node scripts/prakob-gallery-swap.mjs <dir> <ไฟล์ในเครื่อง> <ชื่อไฟล์เก่าใน storage> <ชื่อไฟล์ใหม่> [--apply]
 * ครั้งแรกใช้กับ: กองงาน "ติดฟิล์มกันรอย" → กองงานเปล่า (เจ้าของร้านสั่ง 21 ก.ย. 69 "ไม่ต้องมีฟิล์มกันรอย")
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ID = "acrylic-prakob";
const APPLY = process.argv.includes("--apply");
const [DIR, LOCAL, OLD, NEW] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!DIR || !LOCAL || !OLD || !NEW) die("ใช้: node scripts/prakob-gallery-swap.mjs <dir> <local.jpg> <old.jpg> <new.jpg> [--apply]");

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
const imgs = [...(p.images ?? [])];
const at = imgs.findIndex((g) => g.src === urlOf(OLD));
if (at < 0) die(`ไม่เจอรูป ${OLD} ในแกลเลอรี (${imgs.map((g) => g.src.split("/").pop()).join(" · ")})`);
if (p.imageSrc === urlOf(OLD)) die("รูปนี้เป็นรูปปกด้วย — สลับปกใช้ scripts/fresh-cover-swap.mjs");
console.log(`สลับรูปที่ ${at + 1}: ${OLD} → ${NEW}`);
if (!APPLY) { console.log("— dry-run · ใส่ --apply เพื่ออัปโหลด+เขียนจริง"); process.exit(0); }

const buf = await sharp(join(DIR, LOCAL)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
const up = await sb.storage.from("product-images").upload(`products/${ID}/${NEW}`, buf, { contentType: "image/jpeg", upsert: true });
if (up.error) die(`upload ${NEW}: ${up.error.message}`);
const head = await fetch(urlOf(NEW), { method: "HEAD" });
if (!head.ok) die(`ดึง ${NEW} ไม่ได้ ${head.status}`);
console.log(`  ↑ ${NEW} ${(buf.length / 1024).toFixed(0)} KB`);

imgs[at] = { ...imgs[at], src: urlOf(NEW) };
const savedAt = new Date().toISOString();
const upd = await sb.from("products").update({ data: { ...p, images: imgs, savedAt } }).eq("id", ID).select("data");
if (upd.error) die(upd.error.message);
if (!upd.data?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
if (b.savedAt !== savedAt) die("อ่านกลับ savedAt ไม่ตรง");
if (b.images[at]?.src !== urlOf(NEW)) die("อ่านกลับ รูปใหม่ไม่อยู่ในตำแหน่งเดิม");
if (b.images.length !== imgs.length || b.imageSrc !== p.imageSrc) die("อ่านกลับ แกลเลอรี/ปกเพี้ยน");
const rm = await sb.storage.from("product-images").remove([`products/${ID}/${OLD}`]);
if (rm.error) console.log("  ⚠️ ลบไฟล์เก่าไม่สำเร็จ (ไม่กระทบหน้าเว็บ): " + rm.error.message);
else console.log("  🗑 ลบ " + OLD + " แล้ว");
console.log(`✅ เขียนแล้ว อ่านกลับตรง ${b.images.length} รูป: ${b.images.map((g) => g.src.split("/").pop()).join(" · ")}`);

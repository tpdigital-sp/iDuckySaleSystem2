#!/usr/bin/env node
/**
 * เปลี่ยน "ชาร์ตสีอะคริลิค" ในสินค้าให้เป็นฉบับใหม่ของร้าน (ตัวที่ออกแบบใหม่ โทนฟ้า มีโลโก้เป็ด)
 *
 *   node scripts/acrylic-color-chart-update.mjs --id=keyring-clear-stopper           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/acrylic-color-chart-update.mjs --id=keyring-clear-stopper --write   # อัปไฟล์ + บันทึก
 *
 * ต้นฉบับอยู่ในไดรฟ์ร้าน (5710×6000 — คมสุดเท่าที่มี · ดู memory "shop photo sources")
 *   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/P-สีอะคริลิค-01.jpg
 * ชาร์ตเก่าที่เคยใช้เป็นภาพถ่ายแผ่นสีวางบนโต๊ะ (มีรอยขีดฆ่าทับช่อง C-02) อ่านยากกว่ามาก
 * ฉบับใหม่มีสีครบกว่า (เพิ่มชุด Hologram/กากเพชร) และเขียนกำกับไว้ว่าสีไหนสกรีนใต้/บนอะคริลิค
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — สคริปต์เลยขยับเลขรุ่นให้เอง (color-chart-v3 → v4)
 * สินค้าอื่นที่ใช้ชาร์ตสีก็รันตัวนี้ได้เหมือนกัน (แต่ละตัวเก็บไฟล์ในโฟลเดอร์ของตัวเอง คนละรุ่นกัน):
 *   standee-rotating · rotating-stand · standee-frame-card · standee-clip · standee-keyring
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const WRITE = process.argv.includes("--write");
const ID = arg("id");
if (!ID) {
  console.error("ต้องใส่ --id=<product-id>");
  process.exit(1);
}

const SRC =
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/P-สีอะคริลิค-01.jpg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ── หาไฟล์ชาร์ตเดิมของสินค้านี้ แล้วตั้งชื่อรุ่นถัดไป ───────────── */
const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const json = JSON.stringify(row.data);
const found = json.match(/products\/([^/"]+)\/(color-chart-v(\d+))\.jpg/);
if (!found) throw new Error(`สินค้า ${ID} ไม่ได้ใช้ไฟล์ color-chart-v*.jpg — ตรวจก่อน`);
const [, dir, oldName, oldRev] = found;
const newName = `color-chart-v${Number(oldRev) + 1}`;
const hits = (json.match(new RegExp(oldName, "g")) || []).length;

console.log(`📦 ${row.data.name} (${ID})`);
console.log(`   ${oldName}.jpg → ${newName}.jpg  (อ้างถึง ${hits} จุด · โฟลเดอร์ ${dir})`);

/* ── เตรียมไฟล์จากต้นฉบับในไดรฟ์ร้าน ────────────────────────────── */
let src;
try {
  src = readFileSync(SRC);
} catch {
  throw new Error(`เปิดต้นฉบับไม่ได้ — ต่อไดรฟ์ iDuckyShop ก่อนแล้วรันใหม่\n   ${SRC}`);
}
const meta = await sharp(src).metadata();
// ชาร์ตมีตัวหนังสือเล็ก (รหัสสี) — เก็บด้านยาวไว้ 2400 px ให้ลูกค้ากดขยายแล้วยังอ่านออก
const chart = await sharp(src)
  .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toBuffer();
console.log(`   ต้นฉบับ ${meta.width}×${meta.height} → ${newName}.jpg (${Math.round(chart.length / 1024)} KB)`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write เพื่ออัปไฟล์ + เขียนลง Supabase)");
  process.exit(0);
}

const up = await sb.storage
  .from("product-images")
  .upload(`products/${dir}/${newName}.jpg`, chart, { contentType: "image/jpeg", upsert: true });
if (up.error) throw new Error(`อัปไฟล์ไม่สำเร็จ — ${up.error.message}`);
console.log(`⬆️  ${newName}.jpg`);

const patched = JSON.parse(json.replaceAll(oldName, newName));
const save = await sb.from("products").update({ data: patched }).eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ บันทึกแล้ว (ไฟล์เก่ายังอยู่ใน storage — ถ้าจะย้อนกลับ ชี้ชื่อเดิมได้เลย)");

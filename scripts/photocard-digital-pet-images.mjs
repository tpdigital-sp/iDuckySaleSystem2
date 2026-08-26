#!/usr/bin/env node
/**
 * Photo card Digital — เปลี่ยนภาพการ์ดตัวเลือก "PET สีขาว" / "PET สีใส"
 *
 *   node scripts/photocard-digital-pet-images.mjs <dir>           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-pet-images.mjs <dir> --write
 *   <dir> = โฟลเดอร์ที่มี new-pet-white.jpg / new-pet-clear.jpg
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: ภาพเดิมเป็นเฟรมหัวคลิป (ขาว = การ์ดเปล่าเอียง ๆ · ใส = โปสเตอร์มีตัวหนังสือ)
 *   → ขาว: เฟรมกลางคลิป "PhotoCard pet - white" (การ์ดชมพูลายเด็กผู้หญิง ครอปตัวหนังสือออก)
 *   → ใส: ภาพนิ่งการ์ดใสลาย music player จากหน้า /photocard (ไม่มีตัวหนังสือทับ)
 * อัปเป็นชื่อไฟล์ใหม่ pet-white-2 / pet-clear-2 — ห้ามทับชื่อเดิม (Next image cache ค้าง)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const DIR = process.argv[2];
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";
const FILES = [
  { local: "new-pet-white.jpg", remote: "pet-white-2.jpg", choice: "PET สีขาว" },
  { local: "new-pet-clear.jpg", remote: "pet-clear-2.jpg", choice: "PET สีใส" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const PUB = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products/${ID}`;

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};
if (!DIR || DIR.startsWith("--")) die("ต้องบอกโฟลเดอร์ภาพ: node scripts/photocard-digital-pet-images.mjs <dir> [--write]");

const bufs = FILES.map((f) => {
  try {
    return readFileSync(`${DIR}/${f.local}`);
  } catch {
    die(`ไม่พบไฟล์ ${DIR}/${f.local}`);
  }
});

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name})`);
const d = row.data;
const petG = (d.options ?? []).find((o) => o.label === "สี PET");
if (!petG) die('ไม่พบกลุ่ม "สี PET"');
for (const f of FILES) if (!petG.choices.some((c) => c.name === f.choice)) die(`ไม่มีตัวเลือก "${f.choice}"`);

console.log(FILES.map((f, i) => `${f.choice}: ${f.local} (${(bufs[i].length / 1024).toFixed(0)}KB) → ${PUB}/${f.remote}`).join("\n"));

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่ออัปโหลด + เขียนจริง)");
  process.exit(0);
}

for (let i = 0; i < FILES.length; i++) {
  const f = FILES[i];
  const { error: eUp } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${f.remote}`, bufs[i], { contentType: "image/jpeg", upsert: true });
  if (eUp) die(`อัปโหลด ${f.remote} ไม่ผ่าน: ${eUp.message}`);
  petG.choices.find((c) => c.name === f.choice).imageSrc = `${PUB}/${f.remote}`;
}
d.savedAt = new Date().toISOString();

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows)");

// อ่านกลับ + เช็คว่าภาพเปิดได้จริง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const bPet = back[0].data.options.find((o) => o.label === "สี PET");
let ok = true;
for (const f of FILES) {
  const src = bPet.choices.find((c) => c.name === f.choice).imageSrc;
  const res = await fetch(src);
  console.log(`${f.choice}: ${src.split("/").pop()} → HTTP ${res.status} (${((await res.arrayBuffer()).byteLength / 1024).toFixed(0)}KB)`);
  if (!res.ok || !src.endsWith(f.remote)) ok = false;
}
if (!ok) die("อ่านกลับ/เปิดภาพไม่ผ่าน — ยังไม่เสร็จ");
console.log("✓ อัปโหลด + เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับและเปิด URL ภาพ)");

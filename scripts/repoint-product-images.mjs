#!/usr/bin/env node
/**
 * ชี้ภาพของสินค้าไปที่ "รุ่นใหม่" โดยไม่แตะข้อมูลอื่นของสินค้าเลย
 *
 *   node scripts/repoint-product-images.mjs --id=<product-id> --from=v4 --to=v5          # ดูก่อน (ไม่เขียน)
 *   node scripts/repoint-product-images.mjs --id=<product-id> --from=v4 --to=v5 --write  # เขียนจริง
 *   node scripts/repoint-product-images.mjs --id=rotating-stand --dir=rotating-stand-frame --add=v2 --write
 *
 * ทำไมต้องมีตัวนี้:
 *   สคริปต์ add-*.ts เขียนสินค้า "ทั้งก้อน" ทับของเดิม — ถ้าสินค้านั้นเผยแพร่ไปแล้ว หรือทีมงาน
 *   แก้อะไรไว้ในหน้าแอดมิน (ติ๊กตรวจแล้ว · แก้ข้อความ · จัดลำดับ) การรันใหม่จะทับของพวกนั้นหมด
 *   ตัวนี้เลยแก้เฉพาะ "URL ของรูป" ในก้อน data แล้วบันทึกกลับ — อย่างอื่นคงเดิมทุกตัวอักษร
 *
 * โหมด:
 *   --from/--to  เปลี่ยนรุ่นไฟล์ที่มี suffix อยู่แล้ว  ("hero-v4.jpg" → "hero-v5.jpg")
 *   --add        ใส่ suffix ให้ไฟล์ที่ยังไม่มีรุ่น      ("hero.jpg"    → "hero-v2.jpg")
 *   --dir        โฟลเดอร์รูปใน storage ถ้าไม่ตรงกับ id ของสินค้า (เช่น rotating-stand เก็บที่ rotating-stand-frame)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const WRITE = process.argv.includes("--write");
const ID = arg("id");
const FROM = arg("from");
const TO = arg("to");
const ADD = arg("add");
const DIR = arg("dir") || ID;

if (!ID || (!ADD && (!FROM || !TO))) {
  console.error("ต้องใส่ --id=<product-id> แล้วเลือก --from=<รุ่นเดิม> --to=<รุ่นใหม่> หรือ --add=<รุ่นใหม่>");
  process.exit(1);
}

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

const marker = `/products/${DIR}/`;
let hits = 0;
const samples = [];

/** แก้เฉพาะ URL รูปของสินค้านี้ (ต้องมี /products/<dir>/ อยู่ในสตริง) */
const fixString = (s) => {
  if (typeof s !== "string" || !s.includes(marker)) return s;
  const before = s;
  const after = ADD
    ? s.replace(new RegExp(`(${marker}[^"'\\s]+?)(?<!-${ADD})\\.(jpg|jpeg|png|mp4)`, "g"), `$1-${ADD}.$2`)
    : s.replaceAll(`-${FROM}.jpg`, `-${TO}.jpg`).replaceAll(`-${FROM}.mp4`, `-${TO}.mp4`);
  if (after !== before) {
    hits++;
    if (samples.length < 3) samples.push(`${before.split("/").pop()} → ${after.split("/").pop()}`);
  }
  return after;
};

const walk = (v) =>
  typeof v === "string"
    ? fixString(v)
    : Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        : v;

const { data, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้: ${error.message}`);

const next = walk(data.data);
console.log(`📦 ${data.name} (${ID})`);
console.log(`   โฟลเดอร์รูป: products/${DIR}/ · ${ADD ? `เติมรุ่น -${ADD}` : `${FROM} → ${TO}`}`);
console.log(`   URL ที่แก้: ${hits} จุด`);
for (const s of samples) console.log(`   ตัวอย่าง ${s}`);

if (!hits) {
  console.log("\n(ไม่มีอะไรต้องแก้ — อาจชี้ไปรุ่นใหม่อยู่แล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ ชี้ภาพไปรุ่นใหม่แล้ว — สถานะเผยแพร่/ข้อมูลอื่นของสินค้าคงเดิมทั้งหมด`);

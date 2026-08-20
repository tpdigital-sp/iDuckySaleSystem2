#!/usr/bin/env node
/**
 * อัปภาพของสินค้าขึ้น Supabase Storage จากโฟลเดอร์ในเครื่อง — ใช้กับสินค้าที่ทำภาพไว้แล้ว
 * และอยาก "เปลี่ยนรุ่นไฟล์" โดยไม่ต้องรันสคริปต์ add-*.ts ทั้งก้อน (ซึ่งจะทับข้อมูลสินค้าที่แอดมินแก้ไว้)
 *
 *   node scripts/upload-product-images.mjs --dir=.cache/wobble/upload --to=products/new-xxx --rev=v4
 *   node scripts/upload-product-images.mjs --dir=.cache/wobble/parts --to=products/new-xxx --from=v3 --to-rev=v4
 *
 *   --dir      โฟลเดอร์ไฟล์ .jpg ในเครื่อง
 *   --to       path ปลายทางใน bucket product-images (เช่น products/standee-keyring)
 *   --rev      เติมรุ่นให้ชื่อไฟล์ที่ยังไม่มีรุ่น  ("hero.jpg" → "hero-v4.jpg")
 *   --from/--to-rev  เปลี่ยนรุ่นของไฟล์ที่มีรุ่นอยู่แล้ว ("part-figure-v3.jpg" → "part-figure-v4.jpg")
 *   --only     อัปเฉพาะไฟล์ที่ชื่อขึ้นต้นด้วยคำนี้ (คั่นด้วยจุลภาคได้)
 *
 * คู่กับ scripts/repoint-product-images.mjs (ชี้ URL ในฐานข้อมูลไปรุ่นใหม่)
 */
import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const DIR = arg("dir");
const TO = arg("to");
const REV = arg("rev");
const FROM = arg("from");
const TO_REV = arg("to-rev");
const ONLY = (arg("only") || "").split(",").filter(Boolean);

if (!DIR || !TO) {
  console.error("ต้องใส่ --dir=<โฟลเดอร์ในเครื่อง> --to=<path ใน bucket เช่น products/xxx>");
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

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".jpg"))
  .filter((f) => !ONLY.length || ONLY.some((p) => f.startsWith(p)));

let done = 0;
for (const f of files) {
  const base = f.replace(/\.jpg$/, "");
  const name =
    FROM && TO_REV ? `${base.replace(new RegExp(`-${FROM}$`), "")}-${TO_REV}` : REV ? `${base}-${REV}` : base;
  const buf = await readFile(`${DIR.replace(/\/$/, "")}/${f}`);
  const { error } = await sb.storage
    .from("product-images")
    .upload(`${TO.replace(/\/$/, "")}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`${f}: ${error.message}`);
  done++;
  if (done % 25 === 0 || done === files.length) console.log(`⬆️  ${done}/${files.length}`);
}
console.log(`✅ อัปขึ้น ${TO} แล้ว ${done} ไฟล์`);

#!/usr/bin/env node
/**
 * เติมภาพประกอบให้ตัวเลือกของสินค้า Carabiner Acrylic ที่ยังไม่มีภาพเลย
 *   ขนาด (5-10 ซม.) · อะไหล่ (ก้านตะขอ 1.8/2.8 ซม.) · สกรีน (1/2 ด้าน) · เพิ่มก้านตะขอ
 * และเปลี่ยนภาพ "อะคริลิคใส" เป็นรุ่นใหม่ที่วาดตรงกับตัวสินค้าจริง (v1 วาดเป็นห่วงคาราไบเนอร์
 * โลหะแยกชิ้น ซึ่งไม่ใช่ของจริง — ของจริงอะคริลิคไดคัทเป็นตัวตะขอในตัว + ก้านสแตนเลส)
 *
 *   node scripts/carabiner-art.mjs                          # เตรียมภาพก่อน
 *   node scripts/carabiner-option-art.mjs                   # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/carabiner-option-art.mjs --upload --write
 *
 * แก้เฉพาะฟิลด์ imageSrc ของตัวเลือกที่ระบุไว้ในตาราง MAP — ไม่เขียนทับสินค้าทั้ง row
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const ART_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1] || ".cache/carabiner/upload";

const ID = "carabiner-acrylic";

/** ตัวเลือก → ชื่อไฟล์ภาพ (ชื่อไฟล์ต้องไม่ซ้ำของเดิม CDN แคชชื่อเดิมไว้) */
const MAP = {
  ประเภทอะคริลิค: { อะคริลิคใส: "clear-plain-v3" },
  // ดรอปดาวน์สีก็มี "อะคริลิคใส" ที่ไม่มีสวอตช์ในชาร์ตสีกลาง — ใช้ภาพเดียวกัน
  สีอะคริลิค: { อะคริลิคใส: "clear-plain-v3" },
  ขนาด: {
    "5 cm": "size-5-v2",
    "6cm": "size-6-v2",
    "7cm": "size-7-v2",
    "8cm": "size-8-v2",
    "9cm": "size-9-v2",
    "10cm": "size-10-v2",
  },
  อะไหล่: { "เล็ก (ขนาด 1.8 cm)": "part-small-v2", "ใหญ่ (ขนาด 2.8 cm)": "part-large-v2" },
  สกรีน: { "1 ด้าน": "print-1-v2", "2 ด้าน": "print-2-v2" },
  เพิ่มก้านตะขอ: { ชิ้นละ: "hook-extra-v2" },
};

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
const url = (art) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${art}.jpg`;
const ARTS = Object.values(MAP).flatMap((m) => Object.values(m));

async function uploadArt() {
  for (const art of ARTS) {
    const file = `${ART_DIR.replace(/\/$/, "")}/${art}.jpg`;
    if (!existsSync(file)) throw new Error(`ไม่พบ ${file} — รัน node scripts/carabiner-art.mjs ก่อน`);
    const buf = await readFile(file);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${art}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${art}: ${error.message}`);
    console.log(`⬆️  ${art}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(error.message);
const product = data.data;

let done = 0;
const missing = [];
for (const [label, byChoice] of Object.entries(MAP)) {
  const opt = (product.options ?? []).find((o) => o.label === label);
  if (!opt) {
    missing.push(`ไม่มีกลุ่มตัวเลือก "${label}"`);
    continue;
  }
  for (const [name, art] of Object.entries(byChoice)) {
    const choice = (opt.choices ?? []).find((c) => c.name === name);
    if (!choice) {
      missing.push(`"${label}" ไม่มีตัวเลือก "${name}"`);
      continue;
    }
    choice.imageSrc = url(art);
    done++;
    console.log(`🖼  ${label} → ${name}  =  ${art}.jpg`);
  }
}
if (missing.length) throw new Error(`ตัวเลือกไม่ตรงกับฐานข้อมูล:\n  - ${missing.join("\n  - ")}`);

const noImage = (product.options ?? []).flatMap((o) =>
  (o.choices ?? []).filter((c) => !c.imageSrc).map((c) => `${o.label}: ${c.name}`)
);
console.log(`\n📦 ${product.name} — ใส่ภาพให้ ${done} ตัวเลือก`);
console.log(`   ตัวเลือกที่ยังไม่มีภาพ: ${noImage.length ? noImage.join(" · ") : "ไม่มีแล้ว"}`);

if (UPLOAD) await uploadArt();
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
product.savedAt = new Date().toISOString();
const w = await sb.from("products").update({ data: product }).eq("id", ID);
if (w.error) throw new Error(w.error.message);
console.log("\n✅ บันทึกแล้ว");

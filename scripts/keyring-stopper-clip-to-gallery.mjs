#!/usr/bin/env node
/**
 * ย้าย "คลิปงานจริง" ของพวงกุญแจจุกสีใส จากท้ายแท็บ → เข้าไปอยู่ในแกลเลอรีรูปสินค้าด้านบน
 *
 *   node scripts/keyring-stopper-clip-to-gallery.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/keyring-stopper-clip-to-gallery.mjs --write   # บันทึกจริง
 *
 * ไฟล์คลิป/โปสเตอร์อัปไว้แล้วโดย scripts/keyring-stopper-clear-media.mjs (ตัวนี้ไม่อัปไฟล์อะไรเพิ่ม)
 *
 * ช่องแกลเลอรีที่เป็นคลิปเก็บแบบนี้ (ดู ProductImage ใน src/lib/products.ts):
 *   { src: <โปสเตอร์ .jpg>, videoSrc: <คลิป .mp4> }
 *   — src ทำหน้าที่เป็นภาพปก รูปย่อ/การ์ดหน้ารายการ/ตะกร้า จึงยังเห็นเป็นรูปนิ่งตามปกติ
 *
 * ⚠️ วางเป็นช่องที่ 2 เสมอ ห้ามเป็นช่องแรก — รูปแรกถูกใช้เป็นภาพหน้าปกสินค้าในที่อื่นทั้งเว็บ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";
const REV = "v3";
const AT = 1; // ช่องที่ 2 (นับจาก 0)

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

const IMG = (name, ext = "jpg") =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.${ext}`;

const CLIP = {
  emoji: "🎬",
  gradient: "from-sky-100 to-cyan-200",
  // ปุ่มรูปย่ออ่านออกเสียงว่า "ดูคลิป" + ชื่อนี้ต่อกัน — ตั้งชื่อให้ต่อแล้วเป็นประโยค
  label: "งานจริง — จุกสีใสเชื่อมอะคริลิค หมุน/ขยับได้",
  src: IMG("clip-stopper-poster"),
  videoSrc: IMG("clip-stopper", "mp4"),
};

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const changes = [];

// 1. ใส่ช่องคลิปในแกลเลอรี (ถ้ายังไม่มี)
const images = (d.images ?? []).filter((im) => im.videoSrc !== CLIP.videoSrc);
images.splice(AT, 0, CLIP);
d.images = images;
changes.push(`แกลเลอรี → ใส่คลิปเป็นช่องที่ ${AT + 1} (รวม ${images.length} ช่อง)`);

// 2. เอาบล็อกวิดีโอออกจากแท็บ (เนื้อหาตัวหนังสือคงไว้เหมือนเดิม) — ไม่ให้คลิปโผล่ซ้ำสองที่
for (const t of d.tabs ?? []) {
  if (!t.html || !t.html.includes("<video")) continue;
  const before = t.html;
  t.html = before
    .replace(/<p><strong>คลิปงานจริง<\/strong><\/p>/, "")
    .replace(/<video[\s\S]*?<\/video>/, "")
    .replace(/<p style="font-size:13px;color:#64748b">คลิปจาก[\s\S]*?<\/p>/, "");
  if (t.html !== before) changes.push(`แท็บ "${t.title}" → ถอดบล็อกวิดีโอออก (ย้ายขึ้นแกลเลอรีแล้ว)`);
}

console.log(`📦 ${d.name} (${ID})`);
changes.forEach((c) => console.log(`   • ${c}`));
console.log(`   คลิป: ${CLIP.videoSrc.split("/").pop()} · โปสเตอร์: ${CLIP.src.split("/").pop()}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");

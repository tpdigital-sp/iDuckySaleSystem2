#!/usr/bin/env node
/**
 * Semi Bag (semi-bag) — ภาพประจำตัวเลือก: กดเลือก "ขนาด" / "หูกระเป๋า" แล้วรูปใหญ่สลับตาม
 *
 *   node scripts/semi-bag-option-images.mjs           # dry-run
 *   node scripts/semi-bag-option-images.mjs --write   # บันทึกจริง
 *
 * ใช้รูปงานจริง 4 ใบจาก 5 ใบที่มีอยู่ในแกลเลอรีสินค้าอยู่แล้ว (ไม่อัปรูปใหม่)
 * ⚠️ ค่า imageSrc ต้องตรงกับ product.images[].src เป๊ะ ๆ ไม่งั้น jumpToImage หาไม่เจอ
 *    แล้วจะได้แค่ภาพย่อบนปุ่ม รูปใหญ่ไม่สลับ (ดู ProductDetail: galleryImages / jumpToImage)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "semi-bag";
const WRITE = process.argv.includes("--write");

/** ตัวเลือก → รูปในแกลเลอรี (ระบุด้วย id ไฟล์บน wixstatic + เหตุผลที่เลือกใบนี้) */
const PICKS = {
  "ขนาด (รวมสาย)": {
    "เล็ก (23x37.5cm)": ["7e5112d85e3441dfb9ffaaca8f2294ed", "ใบเล็กสามใบวางเทียบกัน เห็นสเกลเทียบมือ"],
    "ใหญ่ (37x63cm)":  ["57a97acc6cfe4d4ca731b3f6c4fff997", "ใบใหญ่สะพายไหล่ ใส่นิตยสารเล่มโตได้"],
  },
  "หูกระเป๋า": {
    "หูเท่า":    ["a372db71e858416db7f5fa7e17f02e13", "วางแบน เห็นหูสองข้างยาวเท่ากัน (เจ้าของร้านยืนยัน 3 ก.ย. 69)"],
    "หูไม่เท่า": ["31d19783a7a94552bb79a13702fc985c", "ใบลายดอก HAPPY — หูข้างหนึ่งยาวกว่า ไว้คล้องผูก"],
  },
};

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;

const gallery = (row.data.images ?? []).map((im, i) => im.src ?? (i === 0 ? row.data.imageSrc : undefined)).filter(Boolean);
const find = (fileId) => {
  const hit = gallery.find((src) => src.includes(fileId));
  if (!hit) throw new Error(`ไม่พบรูป ${fileId} ในแกลเลอรีของ ${ID} — ตรวจ product.images ก่อน`);
  return hit;
};

let changed = 0;
for (const [label, picks] of Object.entries(PICKS)) {
  const g = (row.data.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`ไม่พบกลุ่มตัวเลือก "${label}"`);
  for (const [name, [fileId, why]] of Object.entries(picks)) {
    const c = (g.choices ?? []).find((x) => x.name === name);
    if (!c) throw new Error(`ไม่พบตัวเลือก "${name}" ในกลุ่ม "${label}"`);
    const src = find(fileId);
    if (c.imageSrc === src) { console.log(`= ${label} / ${name} — มีรูปนี้อยู่แล้ว`); continue; }
    c.imageSrc = src;
    changed++;
    console.log(`+ ${label} / ${name}\n    ${why}\n    ${src}`);
  }
}

console.log(`\n${changed} ตัวเลือกจะได้รูปประจำตัว${WRITE ? "" : " (dry-run — เติม --write เพื่อบันทึกจริง)"}`);
if (WRITE && changed) {
  const { error: e2 } = await sb.from("products").update({ data: row.data }).eq("id", ID);
  if (e2) throw e2;
  console.log("บันทึกแล้ว ✅");
}

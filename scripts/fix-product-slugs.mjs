#!/usr/bin/env node
/**
 * เติม "✏️ ตั้งลิงก์เอง" (slug) จากชื่อสินค้าให้อัตโนมัติ
 *
 *   node scripts/fix-product-slugs.mjs               # ดูอย่างเดียว (auto-id ที่ยังไม่มีลิงก์)
 *   node scripts/fix-product-slugs.mjs --write       # เขียนจริง
 *   node scripts/fix-product-slugs.mjs --mismatch    # กว้างขึ้น: ทุกตัวที่ลิงก์ไม่ตรงชื่อ
 *   node scripts/fix-product-slugs.mjs --only a,b    # เจาะจงเฉพาะ id/slug ที่ระบุ
 *
 * โหมดปกติจับเฉพาะสินค้าที่ลิงก์ยังเป็นรหัสอัตโนมัติแบบ new-mt1dwpc1-6773 และยังไม่เคยตั้ง slug
 * — ลิงก์เดิม (/products/<id>) ยังเปิดได้ตามปกติหลังตั้ง slug ของเก่าที่แชร์ไปแล้วจึงไม่ตาย
 *
 * กติกาแปลงชื่อ = slugifyProductName() ใน src/lib/products.ts (ตัดอักขระพิเศษ, ช่องว่าง → "-")
 * และกันชนกับ id/slug ของสินค้าตัวอื่นแบบเดียวกับหน้าแก้ไขสินค้า (ชนแล้วต่อท้าย -2, -3)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const MISMATCH = argv.includes("--mismatch");
const onlyArg = argv[argv.indexOf("--only") + 1];
const ONLY = argv.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;

/** เหมือน slugifyProductName() ฝั่งเว็บเป๊ะ ๆ */
const slugify = (name) =>
  String(name ?? "")
    .trim()
    .replace(/[()[\]{}<>#%?&=+/\\'"`!,;:@^|~*$]/g, " ")
    .trim()
    .replace(/\s+/g, "-");

/** รหัสอัตโนมัติที่ระบบตั้งให้ตอนกด "เพิ่มสินค้า" เช่น new-mt1dwpc1-6773 */
const isAutoId = (id) => /^new-[a-z0-9]+-\d+$/i.test(id);

const rows = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await sb.from("products").select("id,name,data").range(from, from + 499);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 500) break;
}

// แถวพิเศษ (เทมเพลต / คลังตัวเลือก / ตั้งค่าร้าน) ไม่ใช่สินค้า — ข้าม
const products = rows.filter((r) => !String(r.id).startsWith("__"));
const slugOf = (r) => String(r.data?.slug ?? "").trim();
const linkOf = (r) => slugOf(r) || r.id;

// คีย์ที่ถูกจองแล้วทั้งเว็บ — ทั้ง id และ slug ของสินค้าตัวอื่น
const taken = new Set();
for (const r of rows) {
  taken.add(r.id);
  if (slugOf(r)) taken.add(slugOf(r));
}

const targets = products.filter((r) => {
  if (ONLY) return ONLY.has(r.id) || ONLY.has(slugOf(r));
  if (MISMATCH) return linkOf(r) !== slugify(r.name);
  return isAutoId(r.id) && !slugOf(r);
});

let changed = 0;
let skipped = 0;
for (const r of targets) {
  const base = slugify(r.name);
  if (!base) {
    console.log(`?  ${r.id} — ชื่อว่าง ตั้งลิงก์ไม่ได้`);
    skipped++;
    continue;
  }
  if (base === linkOf(r)) {
    skipped++;
    continue;
  }
  // ชนกับของคนอื่น → ต่อท้าย -2, -3 (ของตัวเองไม่นับว่าชน)
  let slug = base;
  for (let n = 2; taken.has(slug) && slug !== r.id && slug !== slugOf(r); n++) slug = `${base}-${n}`;
  if (slug !== base) console.log(`   (ชื่อ "${base}" ถูกใช้แล้ว — ใช้ "${slug}" แทน)`);
  if (slug === r.id) {
    // ชื่อบังเอิญตรงกับ id อยู่แล้ว ไม่ต้องตั้ง slug
    skipped++;
    continue;
  }

  console.log(`${WRITE ? "✓" : "→"} ${r.name}\n   /products/${linkOf(r)}  →  /products/${slug}`);
  changed++;
  if (!WRITE) continue;

  const { error } = await sb
    .from("products")
    .update({ data: { ...r.data, slug } })
    .eq("id", r.id);
  if (error) {
    console.log(`   ❌ เขียนไม่สำเร็จ: ${error.message}`);
    changed--;
    continue;
  }
  taken.add(slug);
}

console.log(
  `\n${WRITE ? "เขียนแล้ว" : "จะแก้"} ${changed} รายการ · ข้าม ${skipped} · จากที่เข้าเงื่อนไข ${targets.length}` +
    (WRITE ? "" : "\nเติม --write เพื่อเขียนจริง")
);

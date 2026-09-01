#!/usr/bin/env npx tsx
/**
 * ย้ายสินค้าที่ค้างอยู่ในหมวดที่ร้านลบทิ้งไปแล้ว มาไว้หมวดที่ใช้จริง
 *
 *   npx tsx scripts/fix-orphan-category.mjs          # ดูอย่างเดียว
 *   npx tsx scripts/fix-orphan-category.mjs --write  # เขียนจริง
 *
 * ที่มา (1 ก.ย. 69): POLAROID กับ PHOTO BOOTH (กระดาษ) ถูกสร้างไว้ในหมวด "card-photo"
 * ซึ่งไม่มีในรายการหมวดของร้าน (__categories__) แล้ว — หน้าสินค้าหลังบ้านโหมด "ตามหมวด"
 * วาดลิสต์จากรายการหมวด ทั้งคู่จึงหายไปเงียบ ๆ (ค้นหาเจอตัวเลข แต่ไม่มีแถว)
 *
 * อัปทั้งคอลัมน์กระจก category และ data.category ให้ตรงกัน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const WRITE = process.argv.includes("--write");

/** หมวดปลายทางของแต่ละหมวดกำพร้า — ตัวไหนไม่ได้ระบุไว้ สคริปต์จะแค่รายงาน */
const MOVE_TO = { "card-photo": "sticker-paper" };

const { data: catRow } = await sb.from("products").select("data").eq("id", "__categories__").maybeSingle();
const known = new Set((catRow?.data?.categories ?? []).map((c) => c.id));
if (known.size === 0) throw new Error("อ่านรายการหมวด (__categories__) ไม่ได้ — หยุดไว้ก่อน");

const { data: rows, error } = await sb.from("products").select("id,name,category,data");
if (error) throw error;

const orphans = rows.filter((r) => !String(r.id).startsWith("__") && !known.has(r.category));
if (orphans.length === 0) {
  console.log("✓ ไม่มีสินค้าค้างหมวดที่ถูกลบ");
  process.exit(0);
}

for (const r of orphans) {
  const to = MOVE_TO[r.category];
  console.log(`${to ? "→" : "?"} ${r.name} (${r.id})  ${r.category} ${to ? `→ ${to}` : "— ยังไม่ได้ตั้งปลายทางใน MOVE_TO"}`);
  if (!to || !WRITE) continue;
  const next = { ...(r.data ?? {}), category: to };
  const { error: upErr } = await sb.from("products").update({ category: to, data: next }).eq("id", r.id);
  if (upErr) throw upErr;
  console.log(`   ✓ ย้ายแล้ว`);
}

if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)");

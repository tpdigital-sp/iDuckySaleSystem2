#!/usr/bin/env node
/**
 * GIVEAWAY STICKER / สติ๊กเกอร์แจก (new-mti1vpmh-5692) — ผู้ใช้สั่ง 4 ก.ย. 69
 *
 *   node scripts/giveaway-sticker-dropdown-groups.mjs           (ดูก่อน ไม่เขียน)
 *   node scripts/giveaway-sticker-dropdown-groups.mjs --write   (เขียน + อ่านกลับเทียบ)
 *
 * เปลี่ยนกลุ่มตัวเลือกทุกกลุ่มเป็นเมนูเลื่อน (display "dropdown") ยกเว้นกลุ่ม "รูปแบบ"
 * ที่ยังเป็นการ์ด — เพราะ 4 ทรง (กลม/หัวใจ/สี่เหลี่ยม/ดาว) ต้องเห็นภาพเทียบกัน
 * กลุ่มที่โดนเปลี่ยน: ชนิดสติ๊กเกอร์ · เคลือบ (เฉพาะด้านหน้า) · เคลือบ (ลายฟิล์มพิเศษ)
 *
 * เมนูเลื่อนโชว์ภาพของตัวเลือกที่เลือกอยู่ข้าง ๆ ช่อง (ProductDetail.tsx) ภาพเดิมจึงไม่เสียเปล่า
 * แตะแค่ฟิลด์ display ของกลุ่ม — ตัวเลือก/ราคา/showWhen/presetId คงเดิมทุกตัว
 * ⚠️ data.savedAt ต้องเป็น ISO string (ไม่ใช่ตัวเลข)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "new-mti1vpmh-5692";
const KEEP_CARDS = "รูปแบบ"; // กลุ่มเดียวที่ยังเป็นการ์ด
const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) throw error;
const data = row.data;
const groups = data.options ?? [];
if (!groups.length) throw new Error("ไม่พบกลุ่มตัวเลือก — หยุดก่อนเขียนทับ");
if (!groups.some((g) => g.label === KEEP_CARDS)) throw new Error(`ไม่พบกลุ่ม "${KEEP_CARDS}"`);

for (const g of groups) {
  const before = g.display ?? "(ปุ่ม)";
  if (g.label === KEEP_CARDS) g.display = "cards";
  else g.display = "dropdown";
  console.log(`${before === g.display ? "=" : "→"} "${g.label}"  ${before} → ${g.display}`);
}

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)");
  process.exit(0);
}

data.savedAt = new Date().toISOString();
const { error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID);
if (updErr) throw updErr;

const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (backErr) throw backErr;
const bad = (back.data.options ?? []).filter((g) =>
  g.label === KEEP_CARDS ? g.display !== "cards" : g.display !== "dropdown",
);
if (bad.length) throw new Error("อ่านกลับไม่ตรง: " + bad.map((g) => `${g.label}=${g.display}`).join(", "));
console.log(
  `\n✓ ${back.data.options.length} กลุ่ม: "${KEEP_CARDS}" การ์ด · ที่เหลือเมนูเลื่อน · savedAt =`,
  back.data.savedAt,
);

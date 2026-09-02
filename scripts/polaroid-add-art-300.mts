#!/usr/bin/env npx tsx
/**
 * POLAROID / โพลารอยด์ — เอา "กระดาษอาร์ตมัน 300 แกรม" กลับเข้าเมนู (ผู้ใช้สั่ง 2 ก.ย. 69)
 *
 *   npx tsx scripts/polaroid-add-art-300.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/polaroid-add-art-300.mts --write   # เขียนสินค้า
 *
 * เมื่อเช้าถอด "กระดาษอาร์ตเกาหลี 300 แกรม" ออกไปเพราะชื่อซ้ำ (เนื้อเดียวกับอาร์ตมัน 300)
 * รอบนี้เอากลับมาในชื่อของตระกูลหลักให้ตรงกับโปสการ์ด — ใช้ภาพ/คำอธิบายใบเดิมที่อัปไว้แล้ว
 *
 * สคริปต์นี้ทำแค่ "ใส่ตัวเลือกกลับ" (+ แก้ช่วงแกรมในคำอธิบาย) — ราคา/จำนวนชนิด/แท็บ/FAQ
 * ให้ scripts/polaroid-price-from-postcard.mts เป็นคนเขียนตามหลัง (มันก๊อปจากโปสการ์ดสด ๆ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1wu6o-1002";
const PAPER = "ชนิดกระดาษ";
const ADD = "กระดาษอาร์ตมัน 300 แกรม";
const BEFORE = "กระดาษอาร์ตมัน 350 แกรม"; // แทรกไว้หน้าน้องมัน เรียงแกรมน้อย→มาก
const CHOICE = {
  name: ADD,
  desc: "ผิวเรียบเนียน สีสดคมชัด",
  popular: true,
  imageSrc:
    "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/new-mti1wu6o-1002/paper-art-korea-300-v1.jpg",
};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/POLAROID|โพลารอยด์/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d: any = structuredClone(row.data);

const group = (d.options ?? []).find((o: any) => o.label === PAPER);
if (!group) throw new Error(`ไม่เจอกลุ่ม "${PAPER}"`);
if (group.choices.some((c: any) => c.name === ADD)) {
  console.log(`"${ADD}" อยู่ในเมนูแล้ว — ไม่ต้องเพิ่ม`);
} else {
  const at = group.choices.findIndex((c: any) => c.name === BEFORE);
  group.choices.splice(at < 0 ? 0 : at, 0, CHOICE);
}
// ช่วงแกรมในคำอธิบาย — จำนวนชนิดปล่อยให้สคริปต์ราคาเขียนทับอีกที
d.description = d.description.replace(/ตั้งแต่อาร์ตมัน (?:300\/)?350\/400 แกรม/, "ตั้งแต่อาร์ตมัน 300/350/400 แกรม");

console.log(`ชนิดกระดาษ ${group.choices.length} ชนิด:`);
console.log("   " + group.choices.map((c: any) => c.name).join(" · "));
console.log(`description: ${d.description.slice(0, 180)}…`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log(`\n✅ ใส่ "${ADD}" กลับแล้ว — ต่อด้วย: npx tsx scripts/polaroid-price-from-postcard.mts --write`);

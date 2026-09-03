#!/usr/bin/env node
/**
 * ตะขอแขวนสูญญากาศ (vacuum-hook) — เพิ่มกลุ่ม "ขนาด" ตายตัว 58 มม. (ตัวเลือกเดียว)
 *
 *   node scripts/vacuum-hook-size-group.mjs            (ดูก่อนว่าจะเปลี่ยนอะไร ไม่เขียน DB)
 *   node scripts/vacuum-hook-size-group.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * เจ้าของร้านยืนยัน (3 ก.ย. 69): สินค้ามีขนาดเดียว จานกลม 58 มม. — ต้องการกลุ่ม "ขนาด"
 * แบบตายตัวให้ลูกค้าเห็นขนาดชัด ๆ และค่า "ขนาด: …" ติดไป selections → ออเดอร์/ใบงาน/ใบเสร็จ
 * (ตัวเลือกแรกของกลุ่มถูกเลือกให้อัตโนมัติเสมอ — ดู initialSelections ใน ProductDetail)
 *
 * ไม่คิดเงินเพิ่ม (ไม่มี extra/perUnit) และไม่แตะ pricing/driverLabels — ราคาเท่าเดิมทุกบาท
 * ภาพประจำตัวเลือกใช้รูป size-58 ที่อยู่ในแกลเลอรีแล้ว (กดเลือกแล้วแกลเลอรีเด้งไปรูปนั้น
 * ไม่เพิ่มรูปซ้ำ — แกลเลอรีกันซ้ำด้วย src)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "vacuum-hook";
const LABEL = "ขนาด";
const SIZE_IMG =
  "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/vacuum-hook/size-58-v1.jpg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const sizeGroup = {
  label: LABEL,
  display: "cards",
  choices: [
    {
      name: "จานกลม 58 มม. (ขนาดเดียว)",
      desc: "พิมพ์ลายเต็มหน้าจานระบบ UV · ตัวเรือนพลาสติกสีขาว ด้านหลังจุกยางสูญญากาศ",
      imageSrc: SIZE_IMG,
    },
  ],
};

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = data.options ?? [];
// รันซ้ำได้: ถ้าเคยเพิ่มกลุ่ม "ขนาด" ไว้แล้ว ตัดทิ้งแล้ววางใหม่ที่หัวแถว (ไม่ให้มีสองชุด)
const options = [sizeGroup, ...before.filter((o) => o.label !== LABEL)];

console.log("กลุ่มก่อนแก้ :", before.map((o) => o.label).join("  ·  "));
console.log("กลุ่มหลังแก้:", options.map((o) => o.label).join("  ·  "));

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const g = got.filter((o) => o.label === LABEL);
const fails = [
  [got.length === options.length, `จำนวนกลุ่มไม่ตรง (${got.length} ≠ ${options.length})`],
  [g.length === 1, `กลุ่ม "${LABEL}" มี ${g.length} ชุด (ต้องมีชุดเดียว)`],
  [got[0]?.label === LABEL, "กลุ่มขนาดไม่ได้อยู่หัวแถว"],
  [g[0]?.choices?.length === 1 && g[0].choices[0].name === sizeGroup.choices[0].name, "ตัวเลือก 58 มม. ไม่ลง"],
  [g[0]?.choices?.[0]?.imageSrc === SIZE_IMG, "ภาพประจำตัวเลือกไม่ลง"],
  [!g[0]?.choices?.[0]?.extra && !g[0]?.choices?.[0]?.perUnit, "มีค่าใช้จ่ายเกินมาในกลุ่มขนาด (ต้องฟรี)"],
  [back.data.savedAt === data.savedAt, "savedAt ไม่อัป (โดนเขียนทับ?)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);

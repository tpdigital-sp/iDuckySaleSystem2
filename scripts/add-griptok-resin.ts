/**
 * เพิ่ม Add On "เคลือบเรซิ่น" ให้สินค้า กริ๊บต๊อก (griptok-th)
 *
 *   npx tsx scripts/add-griptok-resin.ts            # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-griptok-resin.ts --write    # บันทึกลง Supabase
 *
 * กติกาจากผู้ใช้ (25 ส.ค. 69):
 *   • 1-10 ชิ้น บวกเพิ่มชิ้นละ 30 บาท
 *   • 11 ชิ้นขึ้นไป บวกเพิ่มชิ้นละ 15 บาท
 * → ใช้กลไก extraFromQty (กลุ่ม) + extra/extraBelow (ตัวเลือก) ที่มีอยู่แล้ว
 *
 * อ้างอิงหน้า pricelists (ตาราง GRIPTOK Resin Coat):
 *   "Griptok เคลือบนูน คือจะเกิดการสะท้อนกลับของสีทำให้งานดูเข้มขึ้น"
 *   ⚠️ ส่วนต่างจริงบนตารางเว็บ: 1-10 = +30 · 11-499 = +15 · 500-4999 = +20 · 5000+ = +23
 *      กลไกนี้รองรับ 2 เรท จึงคิด +15 ตั้งแต่ 11 ชิ้นขึ้นไปตามที่ผู้ใช้สั่ง
 *
 * อ่านข้อมูลจริงจาก DB มาแก้ทับ (ไม่เขียนสินค้าใหม่ทั้งก้อน กันข้อมูลที่แก้ทีหลังหาย)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "griptok-th";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const GROUP_LABEL = "เคลือบเรซิ่น (Add On)";
const RESIN_GROUP: ProductOption = {
  label: GROUP_LABEL,
  display: "multi",
  // 11 ชิ้นขึ้นไปคิด extra ปกติ (+15) · ต่ำกว่านั้นคิด extraBelow (+30)
  extraFromQty: 11,
  note: "งานเคลือบเรซิ่นจะเกิดการสะท้อนกลับของสี ทำให้ชิ้นงานดูเข้มขึ้น",
  choices: [{ name: "เคลือบเรซิ่น", extra: 15, extraBelow: 30 }],
};

const TERMS_LINES = [
  "*เคลือบเรซิ่น (Add On) 1-10 ชิ้น บวกเพิ่มชิ้นละ 30 บาท · ตั้งแต่ 11 ชิ้นขึ้นไป บวกเพิ่มชิ้นละ 15 บาท",
  "*งานเคลือบเรซิ่นจะเกิดการสะท้อนกลับของสี ทำให้งานดูเข้มขึ้น",
];

const TAB_LINES = [
  "• Add On เคลือบเรซิ่น: 1-10 ชิ้น บวกเพิ่มชิ้นละ 30 บาท · ตั้งแต่ 11 ชิ้นขึ้นไป บวกเพิ่มชิ้นละ 15 บาท",
  "• งานเคลือบเรซิ่นจะเกิดการสะท้อนกลับของสี ทำให้งานดูเข้มขึ้น",
];

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
  if (error || !row) {
    console.error("อ่านสินค้าไม่สำเร็จ:", error?.message ?? "ไม่พบสินค้า " + ID);
    process.exit(1);
  }
  if (!/griptok|กริ๊บต๊อก/i.test(row.name)) {
    console.error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
    process.exit(1);
  }

  const product = row.data as Product;

  // เพิ่ม/แทนที่กลุ่มเคลือบเรซิ่น (รันซ้ำได้ ไม่งอกกลุ่มซ้ำ)
  const options = [...(product.options ?? [])];
  const at = options.findIndex((o) => o.label === GROUP_LABEL);
  if (at >= 0) options[at] = RESIN_GROUP;
  else options.push(RESIN_GROUP);

  // เติมเงื่อนไขใน terms (เฉพาะบรรทัดที่ยังไม่มี)
  let terms = product.terms ?? "";
  for (const line of TERMS_LINES) if (!terms.includes(line)) terms = terms ? `${terms}\n${line}` : line;

  // เติมบรรทัดในแท็บ "รายละเอียดเพิ่มเติม" (เฉพาะบรรทัดที่ยังไม่มี)
  const tabs = (product.tabs ?? []).map((t) => {
    if (t.title !== "รายละเอียดเพิ่มเติม") return t;
    let text = t.text;
    for (const line of TAB_LINES) if (!text.includes(line)) text = `${text}\n${line}`;
    return { ...t, text };
  });

  const saved: Product = { ...product, options, terms, tabs, savedAt: new Date().toISOString() };

  console.log("สินค้า:", row.name);
  console.log("กลุ่มตัวเลือก:", options.map((o) => o.label).join(" · "));
  console.log("กลุ่มเรซิ่น:", JSON.stringify(RESIN_GROUP, null, 2));
  console.log("terms:\n" + terms);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกลง Supabase)");
    return;
  }

  const { error: e2 } = await sb.from("products").update({ data: saved }).eq("id", ID);
  if (e2) {
    console.error("บันทึกไม่สำเร็จ:", e2.message);
    process.exit(1);
  }
  console.log("\n✅ บันทึกแล้ว: " + ID);
}

main();

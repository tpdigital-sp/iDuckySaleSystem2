/**
 * 🔧 กู้กลุ่มตัวเลือก "แบบงานปัก" ของหมวก Bucket / หมวกแก๊ป กลับมา
 *
 * กลุ่มนี้หายไปจาก DB (data.options ว่างเปล่า) เมื่อ 26 ส.ค. 69 ~11:51-11:52 น.
 * สคริปต์นี้เขียนกลับตามของเดิมทุกอย่าง — ยกเว้นป้าย "ฟรี" ที่ผู้ใช้สั่งถอดไปแล้ว
 *   · โผล่เฉพาะตอนเลือกเรทงานปัก (showWhen: เรทราคา = งานปัก)
 *   · อยู่ในแผงงานสั่งทำ (madeToOrder) ราคาให้แอดมินตีให้ (askPrice)
 *   · การ์ดมีรูป (display cards) — รูปชี้ไฟล์เดิมใน storage ของสินค้าแต่ละตัว
 * เขียนทับเฉพาะกลุ่มชื่อ "แบบงานปัก" · กลุ่มอื่น (ถ้ามี) ไม่แตะ
 *
 * รันดูก่อน: node scripts/hat-restore-embroidery-group.mjs
 * เขียนจริง: node scripts/hat-restore-embroidery-group.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");
const LABEL = "แบบงานปัก";
const img = (id, file) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${id}/${file}`;

/** ของเดิมของแต่ละตัว — note/รูปไม่เหมือนกัน จึงกางไว้ทีละตัว */
const GROUPS = {
  "new-mt2omund-2845": {
    label: LABEL,
    display: "cards",
    askPrice: true,
    madeToOrder: true,
    note: "**ปักนูน** ทำได้เฉพาะฟอนต์/ตัวอักษร · มีค่าขึ้นบล๊อคเพิ่ม (ราคาตามความยากง่ายของแบบ)",
    showWhen: { label: "เรทราคา", choices: ["งานปัก"] },
    choices: [
      { name: "ปักธรรมดา", desc: "ปักไหมเรียบไปกับเนื้อผ้าตามลาย", imageSrc: img("new-mt2omund-2845", "rate-emb-v1.jpg") },
      {
        name: "ปักนูน",
        extra: 50,
        desc: "ปักเสริมให้ลายนูนเด่นขึ้นจากผ้า (ทำได้เฉพาะฟอนต์)",
        imageSrc: img("new-mt2omund-2845", "choice-emboss-v1.jpg"),
      },
    ],
  },
  "new-mt2omp9n-3490": {
    label: LABEL,
    display: "cards",
    askPrice: true,
    madeToOrder: true,
    note: "**ปักนูน** ทำได้เฉพาะฟอนต์/ตัวอักษร เท่านั้น · ขนาดปัก สูงไม่เกิน 7 ซม. × กว้างไม่เกิน 15 ซม.",
    showWhen: { label: "เรทราคา", choices: ["งานปัก"] },
    choices: [
      { name: "ปักธรรมดา", desc: "ปักไหมเรียบไปกับเนื้อผ้าตามลาย", imageSrc: img("new-mt2omp9n-3490", "photo-embro-close-v1.jpg") },
      {
        name: "ปักนูน",
        extra: 50,
        desc: "ปักเสริมให้ลายนูนเด่นขึ้นจากผ้า (ทำได้เฉพาะฟอนต์)",
        imageSrc: img("new-mt2omp9n-3490", "photo-embro-name-v1.jpg"),
      },
    ],
  },
};

for (const [id, group] of Object.entries(GROUPS)) {
  const { data: row, error } = await sb.from("products").select("data,name").eq("id", id).single();
  if (error) {
    console.log(`❌ ${id}: ${error.message}`);
    continue;
  }
  const d = row.data;
  const before = (d.options ?? []).length;
  const others = (d.options ?? []).filter((o) => o.label !== LABEL);
  const options = [group, ...others];

  console.log(`\n=== ${id} · ${row.name} (กลุ่มเดิม ${before} กลุ่ม)`);
  console.log(`   GROUP "${group.label}" · โผล่เมื่อ เรทราคา = ${group.showWhen.choices.join("/")} · อยู่ในงานสั่งทำ`);
  for (const c of group.choices)
    console.log(`      - ${c.name} | +฿${c.extra ?? 0} | รูป ${c.imageSrc.split("/").pop()} | ${c.desc}`);

  if (!WRITE) {
    console.log("   [dry-run] ใส่ --write เพื่อเขียนจริง");
    continue;
  }
  const { error: upErr } = await sb.from("products").update({ data: { ...d, options } }).eq("id", id);
  console.log(upErr ? `   ❌ เขียนไม่สำเร็จ: ${upErr.message}` : "   ✅ กู้กลับแล้ว");
}

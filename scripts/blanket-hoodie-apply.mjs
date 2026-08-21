#!/usr/bin/env node
/**
 * อัปภาพตัวเลือกของ BLANKET HOODIE ขึ้น storage แล้วผูกเป็นภาพประจำตัวเลือก
 *
 *   node scripts/blanket-hoodie-art.mjs            # วาดไฟล์ก่อน (.cache/blanket-hoodie/upload)
 *   node scripts/blanket-hoodie-apply.mjs          # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/blanket-hoodie-apply.mjs --write  # อัป + บันทึก
 *
 * ผูกภาพเข้ากลุ่ม "ขนาด" (Small/Large) และ "พิมพ์กี่ด้าน" (1/2 ด้าน)
 * หน้าสินค้าเอาภาพประจำตัวเลือกเข้าแกลเลอรีให้เอง — กดเลือกแบบไหน ภาพใหญ่สลับตาม
 *
 * ชื่อไฟล์ลงท้าย -v2 (v1 เป็นภาพแนวนอน โดนแกลเลอรีครอปข้าง) · แก้ภาพรอบหน้าให้ขึ้นเป็น -v3 (อัปทับชื่อเดิมไม่ได้ CDN/Next แคชไว้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "blanket-hoodie";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/blanket-hoodie/upload";
const REV = "v2";

/** [ชื่อกลุ่ม, ข้อความที่ต้องมีในชื่อตัวเลือก, ชื่อไฟล์] — จับด้วย "ขึ้นต้นด้วย" กันชื่อยาวที่มีวงเล็บต่อท้าย */
const MAP = [
  ["ขนาด", "Small", "size-small"],
  ["ขนาด", "Large", "size-large"],
  ["พิมพ์กี่ด้าน", "1 ด้าน", "side-1"],
  ["พิมพ์กี่ด้าน", "2 ด้าน", "side-2"],
];

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
const url = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);

for (const [group, startsWith, file] of MAP) {
  const opt = (d.options ?? []).find((o) => o.label === group);
  if (!opt) throw new Error(`ไม่เจอกลุ่ม "${group}" — ตรวจก่อน`);
  const choice = opt.choices.find((c) => c.name.startsWith(startsWith));
  if (!choice) throw new Error(`กลุ่ม "${group}" ไม่มีตัวเลือกที่ขึ้นต้นด้วย "${startsWith}"`);
  const buf = readFileSync(`${DIR}/${file}.jpg`);
  console.log(`   • ${group} / ${choice.name} → ${file}-${REV}.jpg (${Math.round(buf.length / 1024)} KB)`);
  if (!WRITE) continue;
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  choice.imageSrc = url(`${file}-${REV}`);
}

console.log(`📦 ${d.name} (${ID}) · ${MAP.length} ภาพ (จาก ${DIR})`);
if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const save = await sb.from("products").update({ data: d }).eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปไฟล์ + ผูกภาพประจำตัวเลือกแล้ว");

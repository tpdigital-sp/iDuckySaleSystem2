#!/usr/bin/env node
/**
 * อัปภาพชุด "แผ่นล่าง / แผ่นบน" ขึ้น storage แล้วผูกเป็นภาพประจำตัวเลือกของทั้งสองกลุ่มขนาด
 *
 *   node scripts/keyring-stopper-plates-art.mjs                 # วาดไฟล์ก่อน (.cache/keyring-stopper/plates)
 *   node scripts/keyring-stopper-plates-apply.mjs               # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/keyring-stopper-plates-apply.mjs --write       # อัป + บันทึก
 *
 * ชื่อไฟล์: size-<cm>-v4.jpg (ของเดิม v3 เป็นภาพแผ่นเดียว ทับไม่ได้เพราะ CDN แคชไว้) · top-<cm>-v1.jpg
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/keyring-stopper/plates";

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const BOTTOM = "ขนาดแผ่นล่าง";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";
/** [ชื่อกลุ่มตัวเลือก, ชื่อไฟล์ในเครื่อง, ชื่อไฟล์บน storage] */
const SETS = [
  [BOTTOM, (cm) => `size-${cm}`, (cm) => `size-${cm}-v4`],
  [TOP, (cm) => `top-${cm}`, (cm) => `top-${cm}-v1`],
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

let files = 0;
for (const [group, local, remote] of SETS) {
  const opt = (d.options ?? []).find((o) => o.label === group);
  if (!opt) throw new Error(`ไม่เจอกลุ่ม "${group}" — ตรวจก่อน`);
  for (const cm of SIZES) {
    const buf = readFileSync(`${DIR}/${local(cm)}.jpg`);
    const choice = opt.choices.find((c) => c.name === `${cm} ซม.`);
    if (!choice) throw new Error(`กลุ่ม "${group}" ไม่มีตัวเลือก ${cm} ซม.`);
    files++;
    if (!WRITE) continue;
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${remote(cm)}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`อัป ${remote(cm)}: ${up.error.message}`);
    choice.imageSrc = url(remote(cm));
  }
  console.log(`   • ${group}: ${SIZES.length} ภาพ → ${remote(SIZES[0])}.jpg … ${remote(SIZES.at(-1))}.jpg`);
}

console.log(`📦 ${d.name} (${ID}) · ไฟล์ทั้งหมด ${files} ภาพ (จาก ${DIR})`);
if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const save = await sb.from("products").update({ data: d }).eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปไฟล์ + บันทึกแล้ว (ภาพชุดเก่า size-*-v3 ยังอยู่ใน storage ถ้าจะย้อนกลับ)");

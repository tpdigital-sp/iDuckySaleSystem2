/**
 * MiNi FOLDER (mini-folder) — อัปโหลดภาพประจำตัวเลือกกลุ่ม "แบบปก" + ตั้ง choice.imageSrc
 *
 *   node scripts/mini-folder-cover-art.mjs            # ดูว่าจะอัป/ผูกอะไร (ไม่เขียน)
 *   node scripts/mini-folder-cover-art.mjs --write    # อัปโหลด storage + เขียน DB + อ่านกลับตรวจ
 *
 * ภาพมาจาก scripts/mini-folder-cover-art.py (วางไว้ที่ .cache/mini-folder/upload/):
 *   cover-clear-v1.jpg   = รูปจริงปกใส (ใบเดียวกับการ์ดขนาดใหญ่)
 *   cover-glitter-v4.jpg = รูปจริงแฟ้มกลิสเตอร์ (พวงกุญแจ) จากเจ้าของร้าน ครอปจัตุรัสกลางแฟ้ม 900×900 — v1–v3 ภาพสังเคราะห์ถูกแทน (30 ก.ย. 69)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพให้ขึ้น VER ใหม่ · ต้องมีกลุ่ม "แบบปก" ก่อน (scripts/mini-folder-cover-type.mjs)
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mini-folder";
const GROUP_LABEL = "แบบปก";
const VER = "v1";
const SRC = ".cache/mini-folder/upload";
const BUCKET = "product-images";
const PREFIX = `products/${ID}`;

const ART = {
  "แบบใส": `cover-clear-${VER}.jpg`,
  "แบบกลิสเตอร์": `cover-glitter-v4.jpg`, // v4 30 ก.ย. 69: รูปจริงจากเจ้าของร้าน (ครอปจัตุรัส) แทนภาพสังเคราะห์ v1–v3
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};

for (const f of Object.values(ART)) if (!existsSync(`${SRC}/${f}`)) die(`ไม่พบไฟล์ ${SRC}/${f} — รัน python3 scripts/mini-folder-cover-art.py ก่อน`);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PUBLIC = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}`;

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
if (error || !row) die(`อ่านสินค้าไม่สำเร็จ: ${error?.message ?? "ไม่พบ " + ID}`);
const d = structuredClone(row.data);
const groups = (d.options ?? []).filter((o) => o.label === GROUP_LABEL);
if (groups.length !== 1) die(`พบกลุ่ม "${GROUP_LABEL}" ${groups.length} กลุ่ม (คาด 1) — รัน mini-folder-cover-type.mjs ก่อน`);
const g = groups[0];

const plan = [];
for (const c of g.choices) {
  const file = ART[c.name];
  if (!file) die(`ตัวเลือก "${c.name}" ไม่มีภาพในตาราง ART`);
  const url = `${PUBLIC}/${file}`;
  plan.push({ choice: c, file, url, was: c.imageSrc });
}
console.log(`สินค้า: ${row.name} (${ID}) · กลุ่ม ${GROUP_LABEL}`);
for (const p of plan) console.log(`  ${p.choice.name}: ${p.file} → ${p.url}${p.was ? `\n      (เดิม ${p.was})` : ""}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่ออัปโหลด+บันทึกจริง)");
  process.exit(0);
}

for (const p of plan) {
  const buf = readFileSync(`${SRC}/${p.file}`);
  const { error: e } = await sb.storage.from(BUCKET).upload(`${PREFIX}/${p.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (e) die(`อัปโหลด ${p.file} ไม่สำเร็จ: ${e.message}`);
  const head = await fetch(p.url, { method: "HEAD" });
  if (!head.ok) die(`อัปโหลดแล้วแต่เปิดไม่ได้ (${head.status}): ${p.url}`);
  p.choice.imageSrc = p.url;
  console.log(`  ↑ ${p.file} (${(buf.length / 1024).toFixed(0)} KB) ✓`);
}

d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ: ${e2.message}`);
if (!upd || upd.length !== 1) die(`update โดน ${upd?.length ?? 0} แถว`);

const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3 || !back) die(`อ่านกลับไม่สำเร็จ: ${e3?.message}`);
const bg = (back.data.options ?? []).filter((o) => o.label === GROUP_LABEL);
if (bg.length !== 1) die("อ่านกลับ: กลุ่มหาย/ซ้ำ");
for (const p of plan) {
  const bc = bg[0].choices.find((c) => c.name === p.choice.name);
  const v = bc?.imageSrc;
  // เทียบรูปร่างค่าจริง ไม่ใช่ตัวแปรกับตัวแปร (undefined === undefined ผ่านได้ — กับดักเดิม)
  if (typeof v !== "string" || !v.startsWith("https://") || v !== p.url) die(`อ่านกลับ ${p.choice.name}: imageSrc = ${v}`);
}
if (back.data.savedAt !== d.savedAt) die("savedAt อ่านกลับไม่ตรง");
if (JSON.stringify(back.data.pricing) !== JSON.stringify(row.data.pricing)) die("ตารางราคาเปลี่ยน — ไม่ควรเกิด");
console.log(`\n✓ ผูกภาพครบ ${plan.length} ตัวเลือก · อ่านกลับตรง · savedAt ${back.data.savedAt}`);

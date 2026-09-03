#!/usr/bin/env node
/**
 * เขียน "คำอธิบายสินค้า" (data.description) ทีละชุดจากไฟล์ข้อเสนอ proposals-*.json
 * (ทีมอ่านใบสเปคจาก '/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า' เสนอไว้ — 3 ก.ย. 69)
 *
 *   node scripts/apply-descriptions-from-sheets.mjs <dir>            # dry-run + ตรวจความถูกต้อง
 *   node scripts/apply-descriptions-from-sheets.mjs <dir> --write    # เขียนจริง + อ่านกลับเทียบ
 *   เพิ่ม --only=id1,id2 เพื่อเลือกเขียนบางตัว · --skip=id1,id2 เพื่อเว้น
 *
 * ตรวจก่อนเขียนทุกข้อเสนอ:
 *   - id มีจริงในตาราง products และไม่ใช่แถวระบบ (__*)
 *   - ข้อความไม่มี \n ไม่มี markdown หนัก ๆ ยาว 150-600 ตัวอักษร
 *   - ถ้ามี "เริ่มต้น...X บาท" ตัวเลข X ต้องตรง data.priceMin จริง ณ ตอนเขียน (กันใบสเปคราคาเก่า)
 * เขียนแล้วอ่านกลับเทียบ + อัป savedAt (ISO) — ดูเหตุผลใน scripts/bag-description-from-issue-sheet.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const dir = args.find(a => !a.startsWith("--"));
const only = (args.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const skip = (args.find(a => a.startsWith("--skip=")) || "").slice(7).split(",").filter(Boolean);
if (!dir) { console.error("ระบุโฟลเดอร์ที่มี proposals-*.json"); process.exit(1); }

const files = readdirSync(dir).filter(f => /^proposals-.*\.json$/.test(f));
if (!files.length) { console.error("ไม่พบ proposals-*.json ใน " + dir); process.exit(1); }

const all = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const p of j.proposals ?? []) all.push({ ...p, src: f });
}
console.log(`อ่านข้อเสนอ ${all.length} รายการจาก ${files.length} ไฟล์\n`);

// ข้อเสนอซ้ำ id เดียวกันจากคนละไฟล์ = ต้องตัดสินใจเอง อย่าเขียนมั่ว
const byId = new Map();
for (const p of all) {
  if (byId.has(p.id)) { console.error(`✗ id ซ้ำ 2 ข้อเสนอ: ${p.id} (${byId.get(p.id).src} กับ ${p.src}) — ใช้ --only/--skip เลือกเอง`); process.exit(1); }
  byId.set(p.id, p);
}

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) throw error;
const dbById = new Map(rows.map(r => [r.id, r]));

let ok = 0, bad = 0, written = 0, unchanged = 0;
for (const p of all) {
  if (only.length && !only.includes(p.id)) continue;
  if (skip.includes(p.id)) { console.log(`— ข้าม (สั่ง skip): ${p.id}`); continue; }
  const row = dbById.get(p.id);
  const errs = [];
  if (!row) errs.push("ไม่พบ id ใน DB");
  if (p.id.startsWith("__")) errs.push("แถวระบบ ห้ามแตะ");
  const d = (p.description || "").trim();
  if (/\n/.test(d)) errs.push("มีขึ้นบรรทัดใหม่");
  if (/\*\*|##|<[a-z]/i.test(d)) errs.push("มี markdown/HTML");
  // เจ้าของร้านกำหนด (3 ก.ย. 69): คำอธิบายยาวแค่ 2-3 บรรทัด ≈ 140-240 ตัวอักษร (เผื่อขอบ 120-300)
  if (d.length < 120 || d.length > 300) errs.push(`ยาว ${d.length} ตัว (ต้อง 120-300)`);
  if (row) {
    const m = d.match(/เริ่มต้น[^0-9]*([\d,]+)\s*บาท/);
    const pm = row.data?.priceMin;
    if (m && pm && Number(m[1].replace(/,/g, "")) !== Number(pm))
      errs.push(`ราคาในข้อความ ${m[1]} ≠ priceMin ${pm}`);
  }
  if (errs.length) { bad++; console.log(`✗ ${p.id} (${p.src}) — ${errs.join(" · ")}`); continue; }
  ok++;
  if (row.data.description === d) { unchanged++; continue; }
  if (!WRITE) continue;

  const savedAt = new Date().toISOString();
  const data = { ...row.data, description: d, savedAt };
  const { data: upd, error: e2 } = await sb.from("products").update({ data }).eq("id", p.id).select("data");
  if (e2) throw e2;
  if (!upd?.length) { console.error(`✗ ${p.id} อัปเดตโดน 0 แถว`); process.exit(1); }
  const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", p.id).single();
  if (e3) throw e3;
  if (back.data.description !== d || back.data.savedAt !== savedAt) {
    console.error(`✗ ${p.id} อ่านกลับไม่ตรง — หยุด รันซ้ำเพื่อทำต่อได้`); process.exit(1);
  }
  written++;
  console.log(`✏️ ${p.id} — ${row.name}`);
}

console.log(`\nผ่านตรวจ ${ok} · ไม่ผ่าน ${bad} · ตรงของเดิมอยู่แล้ว ${unchanged}${WRITE ? ` · เขียนจริง ${written} ✅` : " · (dry-run — เติม --write เพื่อเขียนจริง)"}`);
if (bad) process.exit(1);

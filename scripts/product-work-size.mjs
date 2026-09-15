/**
 * 📐 ขนาดงานตายตัว (data.workSize) — สินค้าที่มีขนาดเดียว ไม่มีกลุ่มขนาดให้ลูกค้าเลือก
 *
 *   node scripts/product-work-size.mjs                  # ดูรายการที่เสนอ (ไม่เขียน)
 *   node scripts/product-work-size.mjs --apply          # เขียนทุกตัวที่เสนอ
 *   node scripts/product-work-size.mjs --apply --id cup-sleeve --size "27.7 × 7.6 ซม."
 *
 * เจ้าของร้านทัก 15 ก.ย. 69 (OD-260914-2080 · CUP SLEEVE): การ์ดรายการในออเดอร์ไม่บอกขนาด
 * กราฟฟิกต้องเปิดหน้าสินค้าหาเอง — ขนาดของสินค้าพวกนี้เขียนไว้แต่ในจุดเด่น/คำอธิบาย
 * สคริปต์นี้จึงอ่านขนาดจากตรงนั้นมาเสนอ แล้วเก็บเป็นฟิลด์จริงให้ทุกจอหยิบไปโชว์ได้ (ดู withWorkSize)
 *
 * รันซ้ำได้ · มี workSize อยู่แล้วข้าม (เว้นแต่ระบุ --size เอง) · เขียนแล้วอ่านกลับเทียบทุกตัว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ""; };

const APPLY = process.argv.includes("--apply");
const ONLY = arg("--id");
const FORCE_SIZE = arg("--size");
if (FORCE_SIZE && !ONLY) die("--size ต้องมาคู่กับ --id");

/** ขนาดสองด้านในข้อความ — "ขนาด 27.7 × 7.6 ซม." · "5.5x8.5 ซม." (เอาที่มีคำว่า "ขนาด" นำหน้าก่อน) */
const UNIT = String.raw`ซม\.?|ซ\.ม\.|cm|มม\.?|mm|นิ้ว|inch`;
const WITH_WORD = new RegExp(String.raw`ขนาด\s*([\d.]+)\s*[×xX]\s*([\d.]+)\s*(${UNIT})`);
const BARE = new RegExp(String.raw`([\d.]+)\s*[×xX]\s*([\d.]+)\s*(${UNIT})`);
/** คู่ตัวเลข "NxN" แบบไม่บังคับหน่วย — ใช้นับว่าข้อความพูดถึงกี่ขนาด ("ถุง 10x10 · ถุง 11x13") */
const ANY_PAIR = new RegExp(String.raw`([\d.]+)\s*[×xX]\s*([\d.]+)\s*(${UNIT})?`, "g");

/** หน่วยเขียนให้เหมือนกันทั้งร้าน — "ซม." (ไม่ใช่ cm/ซ.ม.) */
function tidyUnit(u) {
  const t = u.toLowerCase().replace(/\s/g, "");
  if (/^(ซม\.?|ซ\.ม\.|cm)$/.test(t)) return "ซม.";
  if (/^(มม\.?|mm)$/.test(t)) return "มม.";
  return /นิ้ว|inch/.test(t) ? "นิ้ว" : u;
}

/**
 * ขนาดเดียวในข้อความถึงจะเอา — เขียนไว้หลายขนาด (กระจกถือ "สี่เหลี่ยม 9x16 · หัวใจ 13x18.5")
 * แปลว่าสินค้ามีหลายทรง เดาแทนไม่ได้ ต้องให้ร้านกรอกเองที่หน้าแก้ไขสินค้า
 */
function sizeFromText(text) {
  const all = [...text.matchAll(ANY_PAIR)].map((m) => `${m[1]} × ${m[2]}${m[3] ? ` ${tidyUnit(m[3])}` : ""}`);
  const uniq = [...new Set(all)];
  if (uniq.length > 1) return { size: "", many: uniq };
  const m = WITH_WORD.exec(text) || BARE.exec(text);
  return { size: m ? `${m[1]} × ${m[2]} ${tidyUnit(m[3])}` : "", many: [] };
}

/** สินค้ามีกลุ่มขนาดให้ลูกค้าเลือกอยู่แล้วไหม (มี = ไม่ต้องตั้งขนาดตายตัว บรรทัดจากตัวเลือกชนะ) */
const hasSizeOption = (p) => (p.options || []).some((o) => /ขนาด|size/i.test(o.label || ""));

const { data: rows, error } = await sb.from("products").select("id,data");
if (error) die(error.message);

const plan = [];
/** สินค้าที่เดาไม่ได้ — มีหลายขนาดในข้อความ (ต้องให้ร้านกรอกเอง) */
const skipped = [];
for (const row of rows ?? []) {
  const p = row.data;
  if (!p?.id || String(row.id).startsWith("__")) continue;
  if (ONLY && p.id !== ONLY) continue;
  if (!ONLY && (hasSizeOption(p) || p.workSize)) continue;
  const found = sizeFromText([...(p.highlights || []), p.description || ""].join(" · "));
  const size = FORCE_SIZE || found.size;
  if (!size) {
    if (found.many.length) skipped.push(`${p.id} · ${p.name} — เจอ ${found.many.length} ขนาด (${found.many.join(" / ")}) ต้องกรอกเองที่หน้าแก้ไขสินค้า`);
    continue;
  }
  if (p.workSize === size) continue;
  plan.push({ rowId: row.id, p, size });
  console.log(`${p.id} · ${p.name} → ขนาด ${size}${p.workSize ? ` (เดิม ${p.workSize})` : ""}`);
}

if (skipped.length) {
  console.log(`\n⚠️ เดาไม่ได้ ${skipped.length} ตัว (มีหลายขนาด — กรอกเองที่ช่อง "ขนาดงาน" ในหน้าแก้ไขสินค้า):`);
  for (const line of skipped) console.log("   " + line);
}
console.log(`\nรวม ${plan.length} สินค้า`);
if (!plan.length || !APPLY) {
  if (!APPLY && plan.length) console.log("(ยังไม่เขียน — ใส่ --apply)");
  process.exit(0);
}

for (const { rowId, p, size } of plan) {
  const next = { ...p, workSize: size, savedAt: new Date().toISOString() };
  const up = await sb.from("products").update({ data: next }).eq("id", rowId).select("data");
  if (up.error) die(`${p.id}: ${up.error.message}`);
  if (!up.data?.length) die(`${p.id}: update โดน 0 แถว`);
  const { data: back } = await sb.from("products").select("data").eq("id", rowId).maybeSingle();
  if (back?.data?.workSize !== size) die(`${p.id}: อ่านกลับไม่ตรง (ได้ "${back?.data?.workSize ?? "-"}") — รันซ้ำอีกรอบ`);
  console.log(`✓ ${p.id} — ขนาด ${size}`);
}
console.log("✓ เขียนครบ อ่านกลับตรงทุกตัว");

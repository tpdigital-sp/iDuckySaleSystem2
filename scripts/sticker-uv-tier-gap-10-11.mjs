/**
 * 🩹 สติ๊กเกอร์ UV (sticker-uv) — ปิดช่องว่างขั้นราคา 10-11 แผ่น A3 (พนักงานแจ้ง 21 ต.ค. 69)
 *
 * ต้นตอ: เรท "ขายแบบ ขนาด A3" ตั้งขั้นแรก upTo 9 (ป้าย 3-9) แล้วขั้นถัดไป upTo 49 (ป้าย 12-49)
 *        → tierIndex() ให้ 10 และ 11 แผ่นตกไปขั้น 12-49 ได้ราคาส่ง (120) ทั้งที่ตารางไม่ได้กำหนด
 *        (ร้านเดิมสั่งเป็นชุดละ 3 แผ่น ป้ายเลยกระโดด 9 → 12 · ตอนนี้ไม่ได้บังคับหาร 3 แล้ว)
 * กติกาใหม่จากพนักงาน: 10 แผ่น = ราคาปลีก (130) · 11 แผ่น = ราคาส่ง (120)
 *        → ขั้นแรก upTo 10 ป้าย "3-10 แผ่น A3" · ขั้นสอง ป้าย "11-49 แผ่น A3" (upTo 49 เท่าเดิม)
 *        + แก้ข้อความที่อ้าง "3-9 แผ่น" (FAQ + แท็บรายละเอียด) ให้เป็น "3-10 แผ่น"
 *
 * เขียนทั้ง data.pricing (ตัวจริงของหน้าแก้ไข) และ priceRates[0].pricing (เงาที่หน้าร้านอ่าน) ให้เหมือนกัน
 * รัน:  node scripts/sticker-uv-tier-gap-10-11.mjs           → dry-run
 *       node scripts/sticker-uv-tier-gap-10-11.mjs --write   → เขียนจริง + อ่านกลับเทียบ
 * รันซ้ำได้ · หลังเขียนต้องรัน  node scripts/dealer-rates-apply.mjs --apply --only=sticker-uv  ให้ตารางตัวแทนตาม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("❌ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = structuredClone(row.data);

const NEW0 = { upTo: 10, label: "3-10 แผ่น A3" };
const NEW1 = { upTo: 49, label: "11-49 แผ่น A3" };
const tierOk = (t, n) => t && t.upTo === n.upTo && t.label === n.label;

/** ปรับ tiers ของตารางหนึ่ง — คืน "done" ถ้าเป็นค่าใหม่อยู่แล้ว · "fix" ถ้าแก้ · die ถ้าหน้าตาไม่ตรงที่คาด */
function patchMatrix(m, where) {
  const t = m?.tiers ?? [];
  if (tierOk(t[0], NEW0) && tierOk(t[1], NEW1)) return "done";
  const old0 = t[0]?.upTo === 9 && /^3-9/.test(t[0]?.label ?? "");
  const old1 = t[1]?.upTo === 49 && /^12-49/.test(t[1]?.label ?? "");
  if (!old0 || !old1) die(`${where}: ขั้นราคาไม่ใช่หน้าตาที่คาด (${JSON.stringify(t.slice(0, 2))}) — มีคนแก้ไปแล้ว? ตรวจก่อน`);
  t[0] = { ...t[0], ...NEW0 };
  t[1] = { ...t[1], ...NEW1 };
  return "fix";
}

const r1 = (d.priceRates ?? [])[0];
if (!r1 || r1.id !== "r1" || r1.dealerOnly) die(`priceRates[0] ไม่ใช่เรท r1 (เจอ ${r1?.id})`);
const log = [];
log.push(`priceRates[0] (${r1.label}): ${patchMatrix(r1.pricing, "priceRates[0]")}`);
log.push(`data.pricing: ${patchMatrix(d.pricing, "data.pricing")}`);

// ข้อความที่อ้างช่วงเก่า "3-9 แผ่น" → "3-10 แผ่น" (FAQ + แท็บรายละเอียด)
const textFix = (s) => s.replace(/3[-–]9 แผ่น/g, "3-10 แผ่น");
let textChanged = 0;
for (const f of d.seo?.faqs ?? []) { const a = textFix(f.a ?? ""); if (a !== f.a) { f.a = a; textChanged++; } const q = textFix(f.q ?? ""); if (q !== f.q) { f.q = q; textChanged++; } }
for (const tab of d.tabs ?? []) { const t = textFix(tab.text ?? ""); if (t !== tab.text) { tab.text = t; textChanged++; } }
for (const k of ["description", "body", "terms", "rules"]) if (typeof d[k] === "string") { const t = textFix(d[k]); if (t !== d[k]) { d[k] = t; textChanged++; } }
log.push(`ข้อความอ้าง "3-9 แผ่น" แก้ ${textChanged} จุด`);

console.log(`${WRITE ? "✍️ เขียน" : "🔍 dry-run"} ${ID} · ${row.name}`);
console.log(log.map((l) => "  " + l).join("\n"));
console.log("  ขั้นใหม่:", r1.pricing.tiers.slice(0, 3).map((t) => `${t.label} (≤${t.upTo})`).join(" · "));
for (const [k, v] of Object.entries(r1.pricing.cells)) console.log(`    ${k}: 10 แผ่น → ${v[0]} · 11 แผ่น → ${v[1]}`);

const changed = JSON.stringify(d) !== JSON.stringify(row.data);
if (!changed) { console.log("✓ ค่าในฐานเป็นแบบใหม่อยู่แล้ว ไม่ต้องเขียน"); process.exit(0); }
if (!WRITE) { console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบรูปร่างค่าจริง (ทั้งตัวจริงและเงา + ข้อความ)
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back?.data ?? {};
const chk = [
  tierOk(b.priceRates?.[0]?.pricing?.tiers?.[0], NEW0), tierOk(b.priceRates?.[0]?.pricing?.tiers?.[1], NEW1),
  tierOk(b.pricing?.tiers?.[0], NEW0), tierOk(b.pricing?.tiers?.[1], NEW1),
  b.savedAt === d.savedAt,
  !JSON.stringify(b.seo?.faqs ?? []).match(/3[-–]9 แผ่น/),
  !JSON.stringify(b.tabs ?? []).match(/3[-–]9 แผ่น/),
];
if (chk.some((x) => !x)) die(`อ่านกลับไม่ตรง: ${JSON.stringify(chk)} — รันซ้ำ`);
console.log("✅ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt", d.savedAt);
console.log("👉 ต่อด้วย: node scripts/dealer-rates-apply.mjs --apply --only=sticker-uv");

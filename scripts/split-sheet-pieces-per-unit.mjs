#!/usr/bin/env node
/**
 * งานแบ่งแผ่น — เติม piecesPerUnit ("ขนาดตัดนี้ได้กี่ชิ้นต่อ 1 หน่วยสั่ง") ให้กลุ่มขนาดตัด
 *
 *   node scripts/split-sheet-pieces-per-unit.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/split-sheet-pieces-per-unit.mjs --write
 *
 * ที่มา: กลุ่มขนาดตัดเดิมบอกจำนวนไว้ในป้าย (badge) เป็นข้อความเฉย ๆ เช่น "ได้ 4 ชิ้น / แผ่น A3"
 * หน้าสินค้าเลยคูณจำนวนที่ลูกค้าสั่งให้ไม่ได้ → ย้ายเลขในป้ายมาเก็บเป็นตัวเลขจริงที่ตัวเลือก
 * (ป้ายยังอยู่เหมือนเดิม — โชว์บนปุ่มก่อนลูกค้าเลือก · สรุป "สั่ง 10 แผ่น A3 = 40 ชิ้น" อ่านจาก piecesPerUnit)
 *
 * รันซ้ำได้ (เขียนค่าเดิมทับค่าเดิม) · ตรวจชื่อสินค้าก่อนเขียนกันเขียนผิดตัว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

/** สินค้าที่ขายแบบแบ่งแผ่น (id → ชื่อที่คาด กันเขียนทับผิดตัว) */
const TARGETS = [
  { id: "paper-art-pet", name: "กระดาษอาร์ตมัน | PET" },
  { id: "sticker-pp", name: "สติ๊กเกอร์" },
  { id: "sticker-uv", name: "Sticker-uv" },
];

/** อ่านจำนวนชิ้นจากป้าย เช่น "ได้ 16 ชิ้น / ตร.ม." → { per: 16, unit: "ตร.ม." } · ไม่เข้าแบบ = null */
function parseBadge(badge) {
  const m = /ได้\s*([\d,]+)\s*ชิ้น\s*\/\s*(.+)$/.exec(badge ?? "");
  if (!m) return null;
  const per = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(per) && per > 0 ? { per, unit: m[2].trim() } : null;
}

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb
  .from("products")
  .select("id,name,data")
  .in("id", TARGETS.map((t) => t.id));
if (error) die(error.message);

const writes = [];
for (const t of TARGETS) {
  const row = rows?.find((r) => r.id === t.id);
  if (!row) die(`ไม่พบสินค้า id=${t.id}`);
  if (row.name !== t.name) die(`${t.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
  const d = row.data;
  /** หน่วยขายของสินค้านี้ (ทุกเรท) — ใช้เตือนถ้าป้ายอ้างหน่วยที่ไม่มีในเรทไหนเลย */
  const saleUnits = new Set(
    [d.pricing?.unit, ...(d.priceRates ?? []).map((r) => r.pricing?.unit)].filter(Boolean)
  );
  let touched = 0;
  console.log("=".repeat(66));
  console.log(`${t.id} | ${row.name} (หน่วยขาย: ${[...saleUnits].join(" / ") || "—"})`);
  for (const opt of d.options ?? []) {
    const parsed = (opt.choices ?? []).map((c) => ({ c, y: parseBadge(c.badge) }));
    if (!parsed.some((x) => x.y)) continue;
    // ทุกตัวในกลุ่มต้องอ่านออก ไม่งั้นสรุปให้ลูกค้าได้ไม่ครบกลุ่ม — ปล่อยผ่านครึ่ง ๆ อันตรายกว่าหยุด
    const bad = parsed.filter((x) => !x.y).map((x) => x.c.name);
    if (bad.length) die(`${t.id} · ${opt.label}: อ่านป้ายไม่ออก (${bad.join(", ")})`);
    const units = [...new Set(parsed.map((x) => x.y.unit))];
    if (units.length > 1) die(`${t.id} · ${opt.label}: ป้ายในกลุ่มเดียวกันอ้างหน่วยไม่ตรงกัน (${units.join(" / ")})`);
    // piecesPerUnit นับ "ต่อ 1 หน่วยขาย" — ป้ายที่อ้างหน่วยอื่นเอามาคูณจำนวนที่สั่งไม่ได้
    if (!saleUnits.has(units[0])) die(`${t.id} · ${opt.label}: ป้ายอ้าง "${units[0]}" ซึ่งไม่ใช่หน่วยขายของสินค้านี้`);
    console.log(`- ${opt.label} (ต่อ 1 ${units[0]})`);
    for (const { c, y } of parsed) {
      const before = c.piecesPerUnit;
      c.piecesPerUnit = y.per;
      touched++;
      console.log(`    · ${c.name} → ${y.per} ชิ้น${before === y.per ? " (เท่าเดิม)" : before ? ` (เดิม ${before})` : ""}`);
    }
  }
  if (!touched) die(`${t.id}: ไม่พบกลุ่มขนาดตัดที่มีป้ายจำนวนชิ้น — โครงสร้างเปลี่ยน หยุดก่อน`);
  d.savedAt = new Date().toISOString();
  writes.push({ id: t.id, data: d, touched });
}

console.log("=".repeat(66));
console.log(`รวม ${writes.reduce((n, w) => n + w.touched, 0)} ตัวเลือก จาก ${writes.length} สินค้า`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

for (const w of writes) {
  const { error: e2 } = await sb.from("products").update({ data: w.data }).eq("id", w.id);
  if (e2) die(`${w.id}: ${e2.message}`);
  console.log(`✓ เขียน ${w.id} แล้ว`);
}

#!/usr/bin/env node
/**
 * 📏 หน่วยขายของเรท "ขายแบบ ขนาด ตารางเมตร" (สติ๊กเกอร์ UV) — pricing.unit เคยเป็น "แผ่น A3"
 *
 *   node scripts/sticker-uv-sqm-unit.mjs            # ดูอย่างเดียว
 *   node scripts/sticker-uv-sqm-unit.mjs --apply    # เขียนจริง (รันซ้ำได้)
 *
 * ทำไม: หน่วยนี้ไม่ใช่แค่ป้าย — ทุกจออ่านมันเป็น "1 หน่วยที่ลูกค้าสั่ง"
 *   ตั้งผิด → บรรทัดสรุปอ่านว่า "สั่ง 1 แผ่น A3 (ขนาดตัด A6) ได้ 64 ชิ้น" ทั้งที่ลูกค้าสั่ง 1 ตร.ม.
 *   (OD-260914-7004 · เจ้าของร้านทัก 15 ก.ย. 69) และตัวคูณ unitSheets["ตร.ม."] = 8 ของกลุ่มขนาดที่กรอกเอง
 *   ไม่มีวันแมตช์ → จำนวนชิ้นของงานไดคัทตามขนาดนับเป็น "ต่อแผ่น A3" ต่ำกว่าจริง 8 เท่า
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes("--apply");
const UNIT = "ตร.ม.";
const die = (m) => {
  console.error("⛔", m);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) throw error;

/** เรทที่ "ขายเป็นตารางเมตร" จริง — ดูจากชื่อเรท/คำโปรย/ชื่อช่วงราคาที่ร้านเขียนไว้เอง */
const isSqmRate = (r) =>
  /ตารางเมตร|ตร\.\s?ม\./.test(`${r.label ?? ""} ${r.desc ?? ""}`) ||
  (r.pricing?.tiers ?? []).some((t) => /ตร\.\s?ม\./.test(t.label ?? ""));

const targets = [];
for (const row of rows ?? []) {
  const d = row.data;
  for (const r of d?.priceRates ?? []) {
    if (isSqmRate(r) && (r.pricing?.unit ?? "").trim() !== UNIT) targets.push({ row, rateId: r.id, label: r.label, was: r.pricing?.unit });
  }
}

if (!targets.length) {
  console.log(`✅ ไม่มีเรทตารางเมตรที่หน่วยเพี้ยนแล้ว (ทุกใบเป็น "${UNIT}")`);
  process.exit(0);
}
for (const t of targets) console.log(`${t.row.id} · ${t.row.name} · เรท ${t.rateId} "${t.label}" — หน่วย "${t.was}" → "${UNIT}"`);
if (!APPLY) {
  console.log(`\n(ดูอย่างเดียว ${targets.length} เรท — ใส่ --apply เพื่อเขียนจริง)`);
  process.exit(0);
}

for (const id of [...new Set(targets.map((t) => t.row.id))]) {
  const row = rows.find((r) => r.id === id);
  const ids = targets.filter((t) => t.row.id === id).map((t) => t.rateId);
  const next = {
    ...row.data,
    priceRates: row.data.priceRates.map((r) => (ids.includes(r.id) ? { ...r, pricing: { ...r.pricing, unit: UNIT } } : r)),
    savedAt: new Date().toISOString(), // ISO เท่านั้น — ตัวเลขทำให้หน้าแก้ไขติด 409 ตลอด
  };
  const { data: back, error: wErr } = await sb.from("products").update({ data: next }).eq("id", id).select("data");
  if (wErr) die(`เขียน ${id} ไม่ผ่าน: ${wErr.message}`);
  if (!back?.length) die(`เขียน ${id} แล้วไม่โดนแถวไหนเลย`);
  // อ่านกลับมาเทียบ — update() คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง (เคยเจอกับ sticker-uv เอง)
  const { data: fresh, error: rErr } = await sb.from("products").select("data").eq("id", id).single();
  if (rErr) die(`อ่านกลับ ${id} ไม่ได้: ${rErr.message}`);
  const bad = (fresh.data.priceRates ?? []).filter((r) => ids.includes(r.id) && r.pricing?.unit !== UNIT);
  if (bad.length) die(`${id} อ่านกลับแล้วหน่วยยังไม่ใช่ "${UNIT}" (${bad.map((r) => r.id).join(", ")})`);
  console.log(`✅ ${id} — เรท ${ids.join(", ")} หน่วยเป็น "${UNIT}" แล้ว`);
}

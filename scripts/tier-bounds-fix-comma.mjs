/**
 * 🩹 ซ่อมขอบเขตขั้นราคา (tiers[].upTo) ที่โดนตัดตรงลูกน้ำตอนนำเข้า
 *
 * เจอ 7 ก.ย. 69 ด้วย scripts/tier-bounds-audit.mjs — ป้ายเขียน "10,000-19,999 อัน" แต่ upTo
 * ถูกเก็บเป็น 19 (parse หยุดที่ลูกน้ำ) → ออเดอร์หลักหมื่นไม่ตรงกับขั้นที่ป้ายบอก
 *   cardholder-white : #7 19→19999 · #8 39→39999 · #9 49→49999
 *   gadgetphone-4    : #6 9→9999
 * แก้ทั้ง priceRates ที่ไม่ใช่เรทตัวแทน และ pricing (ตารางกระจกของเรทแรก)
 * เรทตัวแทนไม่แตะ — ให้ scripts/dealer-rates-apply.mjs สร้างใหม่จากราคาปกติที่ถูกต้อง
 *
 * รัน: node scripts/tier-bounds-fix-comma.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** ขอบเขตที่ถูกต้อง อ่านจากป้ายของขั้นนั้นเอง (ตัวเลขท้ายช่วง · ป้าย "ขึ้นไป" = null) */
function wantUpTo(label) {
  const t = String(label).replace(/,/g, "");
  const m = t.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Number(m[2]);
  if (/(\+\+|\+|ขึ้นไป)/.test(t)) return null;
  const m3 = t.match(/(\d+)/);
  return m3 ? Number(m3[1]) : undefined;
}

for (const id of ["cardholder-white", "gadgetphone-4"]) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) throw error;
  const tables = [
    ...(row.data.priceRates ?? []).filter((r) => !r.dealerOnly).map((r) => [r.label, r.pricing]),
    ...(row.data.pricing ? [["(pricing เดี่ยว)", row.data.pricing]] : []),
  ];
  let changed = 0;
  for (const [label, m] of tables) {
    for (const t of m.tiers ?? []) {
      const want = wantUpTo(t.label ?? "");
      if (want === undefined || want === t.upTo) continue;
      console.log(`${id} · ${label} · "${t.label}": upTo ${t.upTo} → ${want}`);
      t.upTo = want;
      changed++;
    }
  }
  if (!changed) { console.log(`${id}: ตรงอยู่แล้ว`); continue; }
  if (!APPLY) { console.log(`${id}: (dry-run) จะแก้ ${changed} ขั้น`); continue; }
  const { error: e2 } = await sb.from("products").update({ data: { ...row.data, savedAt: new Date().toISOString() } }).eq("id", id);
  if (e2) throw e2;
  const { data: back } = await sb.from("products").select("data").eq("id", id).single();
  const bad = [...(back.data.priceRates ?? []).filter((r) => !r.dealerOnly).map((r) => r.pricing), back.data.pricing]
    .filter(Boolean)
    .flatMap((m) => (m.tiers ?? []).filter((t) => wantUpTo(t.label ?? "") !== undefined && wantUpTo(t.label) !== t.upTo));
  if (bad.length) throw new Error(`${id}: อ่านกลับยังไม่ตรง ${bad.length} ขั้น`);
  console.log(`✅ ${row.name}: แก้ ${changed} ขั้น (อ่านกลับตรงแล้ว)`);
}

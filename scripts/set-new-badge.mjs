/**
 * ติดป้าย "ใหม่" บนการ์ดสินค้าให้รายการที่เจ้าของร้านเลือกเอง (26 ก.ย. 69 — หลังล้างป้ายทั้งร้านด้วย clear-new-badge.mjs)
 * เขียนทั้งคอลัมน์กระจก badge + data.badge + savedAt ISO · รันซ้ำได้ · อ่านกลับมาเทียบทุกแถว
 *   node scripts/set-new-badge.mjs          → dry-run
 *   node scripts/set-new-badge.mjs --apply  → เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const IDS = [
  "new-mt2s2cme-5226",          // กรอบรูปอะคริลิค ขอบเงิน/ทอง/ดำ/โรสโกล
  "photoframe-3",               // กรอบรูปจิ๊กซอร์ อะคริลิค
  "photoframe-2",               // กรอบรูปอะคริลิคขาตั้ง
  "360-phone-stand",            // 360° PHONE STAND
  "mobile-phone-hanging-diecut",// MOBILE PHONE HANGING (ไดคัทตามทรง)
  "sticker-solvent",            // SolventPremium
  "sport",                      // เสื้อกีฬา ทรง SPORT
  "unisex",                     // เสื้อยืด ทรง UNISEX
  "new-mt2pl7cv-132",           // COMFY PANTS กางเกงทรงกระบอก
  "case-frame-card",            // Case Frame Card
];
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,badge,data").in("id", IDS);
if (error) die(error.message);
const missing = IDS.filter((id) => !rows.some((r) => r.id === id));
if (missing.length) die("ไม่พบสินค้า: " + missing.join(", "));
console.log(`${APPLY ? "APPLY" : "DRY-RUN"} · ${rows.length} ตัว`);
for (const r of rows) console.log(`  - ${r.id} | ${r.data?.name} | ป้ายเดิม: ${r.data?.badge || "ไม่มี"}`);
if (!APPLY) process.exit(0);

let ok = 0;
for (const r of rows) {
  const data = { ...r.data, badge: "ใหม่", savedAt: new Date().toISOString() };
  const { data: back, error: e } = await sb.from("products").update({ badge: "ใหม่", data }).eq("id", r.id).select("badge,data");
  if (e) die(`${r.id}: ${e.message}`);
  if (!back?.length) die(`${r.id}: update โดน 0 แถว`);
  const b = back[0];
  if (b.badge !== "ใหม่" || b.data?.badge !== "ใหม่" || b.data?.savedAt !== data.savedAt) die(`${r.id}: อ่านกลับไม่ตรง ${JSON.stringify({ badge: b.badge, dataBadge: b.data?.badge })}`);
  ok++;
}
console.log(`✓ ติดป้าย "ใหม่" แล้ว ${ok}/${rows.length} ตัว`);

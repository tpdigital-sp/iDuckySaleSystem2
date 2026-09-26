/**
 * ล้างป้าย "ใหม่" บนการ์ดสินค้าออกทั้งร้าน (เจ้าของร้านสั่ง 26 ก.ย. 69 — "เดี๋ยวฉันจะเลือกสินค้าเอง")
 * แตะเฉพาะสินค้าที่ data.badge === "ใหม่" · ป้ายอื่น (ขายดี/ลดราคา) ไม่แตะ
 * เขียนทั้งคอลัมน์กระจก badge (หลังบ้านอ่าน) + data.badge (หน้าร้านอ่าน) + savedAt ISO
 * รันซ้ำได้ · อ่านกลับมาเทียบทุกแถว
 *   node scripts/clear-new-badge.mjs          → dry-run
 *   node scripts/clear-new-badge.mjs --apply  → เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,badge,data").not("id", "like", "\\_\\_%");
if (error) die(error.message);
const targets = rows.filter((r) => r.data?.badge === "ใหม่" || r.badge === "ใหม่");
console.log(`${APPLY ? "APPLY" : "DRY-RUN"} · สินค้าทั้งหมด ${rows.length} · ติดป้าย "ใหม่" ${targets.length} ตัว`);
for (const r of targets) console.log(`  - ${r.id} | ${r.data?.name}`);
if (!APPLY) process.exit(0);

let ok = 0;
for (const r of targets) {
  const data = { ...r.data };
  delete data.badge;
  data.savedAt = new Date().toISOString();
  const { data: back, error: e } = await sb.from("products").update({ badge: null, data }).eq("id", r.id).select("badge,data");
  if (e) die(`${r.id}: ${e.message}`);
  if (!back?.length) die(`${r.id}: update โดน 0 แถว`);
  const b = back[0];
  if (b.badge !== null || "badge" in (b.data ?? {}) || b.data?.savedAt !== data.savedAt) die(`${r.id}: อ่านกลับไม่ตรง ${JSON.stringify({ badge: b.badge, dataBadge: b.data?.badge, savedAt: b.data?.savedAt })}`);
  ok++;
}
console.log(`✓ ล้างป้ายแล้ว ${ok}/${targets.length} ตัว — รันซ้ำแบบ dry-run เพื่อยืนยันอีกรอบ`);

#!/usr/bin/env node
/**
 * ตัดท้ายป้ายขนาดตัด "· ไดคัทฟรี N จุด (สูงสุด M)" ออก — เหลือแค่ "ได้ N ชิ้น / แผ่น A3"
 *   node scripts/cut-size-badge-drop-dot-quota.mjs [--write]
 *
 * ป้ายยาวเกินจนตัวเลือกขนาดครึ่งขึ้นบรรทัดที่ 2-3 อ่านยาก · ให้เหมือนวาชิที่เป็นป้ายสั้นอยู่แล้ว
 * ⚠️ ข้อมูลโควตาไม่หาย — ยังโชว์ที่บรรทัดใต้ช่องกรอกจุด ("🎁 ขนาด X ได้สูงสุด N จุด … รับไม่เกิน M")
 *    และในแท็บรายละเอียด/FAQ ตามเดิม
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TAIL = /\s*·\s*ไดคัทฟรี\s*[\d,]+\s*จุด\s*\(สูงสุด\s*[\d,]+\)\s*$/;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: rows, error } = await sb.from("products").select("id,data");
if (error) { console.error(error); process.exit(1); }

const updates = [];
for (const row of rows) {
  const d = JSON.parse(JSON.stringify(row.data));
  const changed = [];
  for (const g of d.options ?? []) {
    for (const c of g.choices ?? []) {
      if (!TAIL.test(String(c.badge ?? ""))) continue;
      const before = c.badge;
      c.badge = c.badge.replace(TAIL, "");
      changed.push(`${g.label} / ${c.name}: "${before}" → "${c.badge}"`);
    }
  }
  if (!changed.length) continue;
  console.log(`\n### ${row.id}  (${changed.length} ป้าย)`);
  for (const line of changed) console.log("   " + line);
  updates.push({ id: row.id, before: row.data, after: d });
}

if (!updates.length) { console.log("ไม่มีป้ายที่ต้องแก้"); process.exit(0); }
if (!WRITE) { console.log(`\nรวม ${updates.length} สินค้า · (ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)`); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-cutbadge-${stamp}.json`, import.meta.url),
  JSON.stringify(updates.map((u) => ({ id: u.id, data: u.before })), null, 2));
console.log(`\nสำรองไว้ที่ .backup-cutbadge-${stamp}.json`);
for (const u of updates) {
  const { error: e2 } = await sb.from("products").update({ data: u.after }).eq("id", u.id);
  if (e2) { console.error(u.id, e2); process.exit(1); }
  console.log("  ✓", u.id);
}
console.log("\n✅ บันทึกแล้ว");

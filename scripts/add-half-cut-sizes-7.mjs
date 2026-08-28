#!/usr/bin/env node
/**
 * เพิ่มขนาดตัด "ครึ่ง A4 / ครึ่ง A5 / ครึ่ง A6 แนวตั้ง" ให้สติ๊กเกอร์อีก 7 ตัว
 *   node scripts/add-half-cut-sizes-7.mjs [--write]
 *
 * ตัวเลข (ร้านยืนยัน 2026-08-28): ครึ่งของขนาดไหน = ได้เป็น "2 เท่า" ของขนาดนั้น
 *   ตาราง A3 ของ 7 ตัวนี้ A4=2 · A5=4 · A6=8 → ครึ่ง A4=4 · ครึ่ง A5=8 · ครึ่ง A6=16
 *   (วาชิตารางคนละชุด A4=1 · A5=2 · A6=4 → ครึ่ง = 2/4/8 · ทำแยกไปแล้ว)
 *   UV มี 2 กลุ่ม (เรทแผ่น A3 / เรทตารางเมตร) — คิดด้วยสูตรเดียวกันทั้งคู่
 *
 * โควตาจุดไดคัทฟรี: จับตาม "ด้านที่ยาวที่สุด" ตามตารางที่หน้าสินค้าพวกนี้ประกาศไว้เอง
 *   ครึ่ง A4 แนวตั้ง = 10.5×29.7 ซม. → ด้านยาว 29.7 (เกิน 21) → ใช้โควตาชั้น A4
 *   ครึ่ง A5 แนวตั้ง = 7.4×21     ซม. → ด้านยาว 21           → ชั้น A5
 *   ครึ่ง A6 แนวตั้ง = 5.25×14.85 ซม. → ด้านยาว 14.85        → ชั้น A6
 *   (คนละแบบกับวาชิที่จับคู่ตามพื้นที่ เพราะวาชิประกาศเกณฑ์เป็นชื่อขนาด ไม่ใช่ ซม.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const IDS = ["sticker-uv", "neon", "sticker-rainbow-film", "reflective-sticker",
             "sticker-gold-silver-rosegold", "sticker-hologram", "sticker-solvent"];
const BASE = ["A4", "A5", "A6"];               // ครึ่งของขนาดพวกนี้ · โควตาใช้ชั้นเดียวกับชื่อเดิม
const nameOf = (L) => `ครึ่ง ${L} แนวตั้ง`;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: rows, error } = await sb.from("products").select("id,data").in("id", IDS);
if (error) { console.error(error); process.exit(1); }

const updates = [];
for (const id of IDS) {
  const row = rows.find((r) => r.id === id);
  if (!row) { console.error(`❌ ไม่พบสินค้า ${id}`); process.exit(1); }
  const d = JSON.parse(JSON.stringify(row.data));
  console.log(`\n### ${id}`);

  const groups = (d.options ?? []).filter((o) => /^ขนาดตัด/.test(o.label) && o.choices?.length);
  if (!groups.length) { console.error("   ❌ ไม่พบกลุ่มขนาดตัดที่มีตัวเลือก"); process.exit(1); }

  for (const g of groups) {
    const added = [];
    for (const L of BASE) {
      const src = g.choices.find((c) => c.name === L);
      if (!src || src.piecesPerUnit == null) { console.error(`   ❌ ${g.label}: ไม่พบขนาด ${L} หรือไม่มี piecesPerUnit`); process.exit(1); }
      const name = nameOf(L);
      if (g.choices.some((c) => c.name === name)) { console.log(`   (มี ${name} อยู่แล้ว)`); continue; }
      const pieces = src.piecesPerUnit * 2;
      const badge = String(src.badge ?? "").replace(/ได้ [\d,]+ ชิ้น/, `ได้ ${pieces.toLocaleString("th-TH")} ชิ้น`);
      if (!badge) { console.error(`   ❌ ${g.label}: ${L} ไม่มี badge ให้ลอกรูปแบบ`); process.exit(1); }
      added.push({ choice: { name, badge, piecesPerUnit: pieces }, quotaFrom: L });
    }
    if (!added.length) continue;

    // แทรกไว้ก่อน "กำหนดขนาดเอง" ให้เรียงต่อจากขนาดมาตรฐาน
    const at = g.choices.findIndex((c) => /กำหนดขนาดเอง/.test(c.name));
    g.choices.splice(at < 0 ? g.choices.length : at, 0, ...added.map((a) => a.choice));
    console.log(`   ${g.label}: ` + g.choices.map((c) => `${c.name}${c.piecesPerUnit != null ? `=${c.piecesPerUnit}` : ""}`).join(" · "));

    // โควตาจุดไดคัทฟรี — เข้าชั้นเดียวกับขนาดต้นทาง (เรทที่ผูกกับกลุ่มนี้เท่านั้น)
    for (const { choice, quotaFrom } of added) {
      let hit = 0;
      for (const opt of d.options ?? []) {
        for (const r of opt.inputFee?.rates ?? []) {
          if (r.when?.label !== g.label || !(r.when.choices ?? []).includes(quotaFrom)) continue;
          if (!r.when.choices.includes(choice.name)) r.when.choices.push(choice.name);
          hit++;
          console.log(`     โควตา ${opt.label}: [${r.when.choices.join(", ")}] ฟรี ${r.free} · สูงสุด ${r.max}`);
        }
      }
      if (!hit) { console.error(`     ❌ ไม่พบเรทโควตาของ ${quotaFrom} (when.label=${g.label})`); process.exit(1); }
    }
  }
  updates.push({ id, before: row.data, after: d });
}

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-halfsizes-${stamp}.json`, import.meta.url),
  JSON.stringify(updates.map((u) => ({ id: u.id, data: u.before })), null, 2));
console.log(`\nสำรองไว้ที่ .backup-halfsizes-${stamp}.json`);
for (const u of updates) {
  const { error: e2 } = await sb.from("products").update({ data: u.after }).eq("id", u.id);
  if (e2) { console.error(u.id, e2); process.exit(1); }
  console.log("  ✓", u.id);
}
console.log("\n✅ บันทึกแล้ว");

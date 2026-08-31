#!/usr/bin/env node
/**
 * 🐛 แก้บั๊ก: กรอกขนาดตัดเต็มแผ่น A3 (29.7 × 42) แล้วระบบฟ้อง "ใหญ่เกิน 1 แผ่น A3"
 *
 *   node scripts/fix-cut-size-sheet-a3.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/fix-cut-size-sheet-a3.mjs --write
 *
 * ผู้ใช้แจ้ง 31 ส.ค. 69 (สติ๊กเกอร์วาชิ · กรอก 29.7 × 42 แล้วปุ่มสั่งตัน)
 *
 * ต้นเหตุ: กลุ่ม "ขนาดตัด" ของ 2 ตัวนี้ตั้งแผ่นอ้างอิง (sheetYield) ผิด —
 *   · paper-art-pet   ใช้ 43.76 × 28.89 gap 0.5 = พื้นที่วางของงาน **ไดคัท** (เว้นขอบ+ระยะห่าง)
 *   · washi-sticker   ใช้ 28 × 40 gap 0  = แผ่นวาชิเก่า
 * ทั้งที่ช่องกรอกและคำอธิบายบอกชัดว่า "ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.)"
 * งานตัดตามขนาดใช้ A3 ได้เต็มแผ่น ไม่ต้องเว้นขอบ → ต้องเป็น 42 × 29.7 gap 0
 * (เหมือนพี่น้องอีก 9 ตัว: sticker-pp/uv/solvent/hologram/gold/neon/reflective/rainbow · texture-paper · paper-foil)
 *
 * ⚠️ แตะเฉพาะกลุ่ม "ขนาดตัด" — กลุ่ม "ขนาดไดคัท" ต้องคงพื้นที่วางจริงไว้ (ไดคัทเต็มแผ่นไม่ได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

/** แผ่น A3 เต็ม — งานตัดตามขนาดตัดชิดขอบได้ ไม่ต้องเว้นระยะ */
const A3 = { sheetW: 42, sheetH: 29.7, gap: 0 };

const TARGETS = [
  { id: "washi-sticker", name: "สติ๊กเกอร์วาชิ", label: "ขนาดตัด (สูง)" },
  { id: "paper-art-pet", name: "กระดาษอาร์ตมัน | PET", label: "ขนาดตัด (สูง)" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

let changed = 0;
for (const t of TARGETS) {
  const { data: rows, error } = await sb.from("products").select("id,name,data").eq("id", t.id);
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die(`ไม่พบสินค้า id=${t.id}`);
  if (row.name !== t.name) die(`${t.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);

  const d = row.data;
  const opt = (d.options ?? []).find((o) => o.label === t.label);
  if (!opt) die(`${t.id}: ไม่มีกลุ่ม "${t.label}"`);
  const cfg = opt.sheetYield;
  if (!cfg) die(`${t.id} / ${t.label}: ไม่ได้ตั้ง sheetYield`);

  const before = `${cfg.sheetW} × ${cfg.sheetH} gap ${cfg.gap ?? 0}`;
  if (cfg.sheetW === A3.sheetW && cfg.sheetH === A3.sheetH && (cfg.gap ?? 0) === 0) {
    console.log(`= ${t.id} / ${t.label} — ถูกอยู่แล้ว (${before})`);
    continue;
  }
  Object.assign(cfg, A3);
  changed++;
  console.log(`✎ ${t.id} / ${t.label}  ${before} → 42 × 29.7 gap 0`);
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
    if (e2) die(`${t.id}: ${e2.message}`);
  }
}

console.log(`\n${changed} กลุ่มที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");

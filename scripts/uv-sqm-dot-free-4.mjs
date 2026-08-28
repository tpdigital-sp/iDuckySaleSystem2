#!/usr/bin/env node
/**
 * Sticker UV — เรท "ขายแบบ ขนาด ตารางเมตร": ฟรีค่าจุดไดคัทเมื่อสั่ง 4 ตร.ม. ขึ้นไปต่อ 1 ลาย
 *   node scripts/uv-sqm-dot-free-4.mjs [--write]
 *
 * เรทนี้ลูกค้ากรอกจำนวนเป็น ตร.ม. (tiers = 1-4 / 5-9 / 10-29 / 30+ ตร.ม.) เกณฑ์ 25 ของเรทแผ่น A3
 * จึงใช้ไม่ได้ — 1 ตร.ม. ≈ 8 แผ่น A3 → 4 ตร.ม. ≈ 32 แผ่น (ร้านเลือกเอง 2026-08-28)
 * ⚠️ pricing.unit ของเรทนี้ยังเป็น "แผ่น A3" (ไม่ตรงกับ tiers) จึงตั้ง freeFromQtyUnit ทับให้ข้อความถูก
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const GROUP = "จำนวนจุดไดคัท (ตร.ม.)";
const THRESHOLD = 4, UNIT = "ตร.ม.";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const d = JSON.parse(JSON.stringify(row.data));
const g = (d.options ?? []).find((o) => o.label === GROUP);
if (!g?.inputFee) { console.error(`ไม่พบกลุ่ม ${GROUP}`); process.exit(1); }

g.inputFee.freeFromQtyPerDesign = THRESHOLD;
g.inputFee.freeFromQtyUnit = UNIT;
console.log(`freeFromQtyPerDesign = ${THRESHOLD} ${UNIT} / ลาย`);

const OLD = "สั่ง 25 แผ่นขึ้นไปต่อ 1 ลาย ฟรีค่าจุด";
const NEW = `สั่ง ${THRESHOLD} ${UNIT} ขึ้นไปต่อ 1 ลาย ฟรีค่าจุด`;
if (!g.note?.includes(OLD)) { console.error("note ไม่ตรงแบบที่คาด:", g.note); process.exit(1); }
g.note = g.note.replace(OLD, NEW);
console.log("note:", g.note);

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-${ID}-${stamp}.json`, import.meta.url), JSON.stringify(row.data, null, 2));
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("\n✅ บันทึกแล้ว");

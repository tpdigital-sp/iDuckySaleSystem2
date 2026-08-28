#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — ติดป้าย "ฟรี!" ที่ตัวเลือก "เคลือบเงา" ของกลุ่มเคลือบด้านหน้า
 *
 *   node scripts/texture-paper-front-coating-free-badge.mjs           # ดูก่อน
 *   node scripts/texture-paper-front-coating-free-badge.mjs --write
 *
 * ตัวเลือกที่ไม่คิดเงินหน้าร้านไม่ขึ้นอะไรเลย (ไม่มี +฿) ลูกค้าไม่รู้ว่า "ฟรี" หรือ "ยังไม่ได้ใส่ราคา"
 * ใช้ ProductOptionChoice.badge (ป้ายเขียวที่แอดมินพิมพ์เองได้) → ปุ่มขึ้น "เคลือบเงา [ฟรี!]"
 * แล้วถอด note ของกลุ่มที่พูดเรื่องเดียวกันออก ไม่ให้บอกซ้ำสองที่
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const GROUP = "เคลือบ (ด้านหน้า)";
const CHOICE = "เคลือบเงา";
const BADGE = "ฟรี!";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;
const d = JSON.parse(JSON.stringify(before));

const opt = d.options.find((o) => o.label === GROUP);
if (!opt) { console.error(`หากลุ่ม "${GROUP}" ไม่เจอ — หยุด`); process.exit(1); }
const ch = opt.choices.find((c) => c.name === CHOICE);
if (!ch) { console.error(`หาตัวเลือก "${CHOICE}" ไม่เจอ — หยุด`); process.exit(1); }
if (ch.extra) { console.error(`⛔ "${CHOICE}" ยังคิดเงินอยู่ +${ch.extra} — ติดป้าย "ฟรี!" ไม่ได้`); process.exit(1); }

ch.badge = BADGE;
const oldNote = opt.note;
delete opt.note;

console.log(`กลุ่ม "${GROUP}"`);
for (const c of opt.choices) console.log(`   - ${c.name}${c.badge ? `  [${c.badge}]` : ""}${c.extra ? `  +${c.extra}` : ""}`);
console.log(`\nnote ของกลุ่ม: ${oldNote ? `ถอดออก (เดิม "${oldNote}") — ป้ายบนปุ่มบอกแทนแล้ว` : "(ไม่มีอยู่แล้ว)"}`);

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");

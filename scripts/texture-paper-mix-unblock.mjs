#!/usr/bin/env node
/**
 * 🔓 กระดาษ Texture Paper — ปลดล็อกคละลายในแผ่นเดียว
 *
 *   node scripts/texture-paper-mix-unblock.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-mix-unblock.mjs --write
 *
 * ผู้ใช้สั่ง 8 ก.ย. 69: "ตรงคละลายถ้าจำนวนเป็น 1 A3 เหมือนจะเพิ่มจำนวนลายไม่ได้"
 *
 * ต้นเหตุ: mixRule.tiers มี 2 แถวที่ fromQty = 1 เท่ากัน และแถวหลังติด onePerUnit
 *   → mixTierFor() เลือกแถวหลัง → เพดานลาย = จำนวนแผ่น → สั่ง 1 แผ่นคละได้ 1 ลาย
 *   ทั้งที่งานนี้เรียงหลายลายในแผ่น A3 เดียวแล้วค่อยตัด (ดู scripts/mix-fee-5-per-design.mjs
 *   ที่เคยถอด onePerUnitFromQty ออกจาก paper-art-pet ด้วยเหตุผลเดียวกัน)
 *
 * ทำ: ตัดแถวที่ติด onePerUnit ทิ้ง + ลบ onePerUnitFromQty ระดับบน · แถวแรก (10/4 ลาย/10) คงเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const NAME = "กระดาษเนื้อพิเศษ";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า ${ID}`);
if (row.name !== NAME) die(`${ID}: ชื่อไม่ตรงที่คาด (${row.name})`);

const d = row.data;
const mr = d.mixRule;
if (!mr?.tiers?.length) die("ไม่มี mixRule.tiers — ไม่มีอะไรให้แก้");

const before = JSON.stringify(mr);
const tiers = mr.tiers.filter((t) => !t.onePerUnit);
if (!tiers.length) die("ตัดแล้วไม่เหลือแถวเลย — หยุด");
const already = tiers.length === mr.tiers.length && mr.onePerUnitFromQty == null;

const next = { ...mr, tiers };
delete next.onePerUnitFromQty;
// 4 ค่าระดับบน = แถวแรก (โค้ดเก่าอ่าน)
next.baseFee = tiers[0].baseFee;
next.includedDesigns = tiers[0].includedDesigns;
next.extraFee = tiers[0].extraFee;

console.log(`${already ? "ทำไปแล้ว" : WRITE ? "เขียน" : "ดูก่อน"} · ${ID}\n  ก่อน ${before}\n  หลัง ${JSON.stringify(next)}`);
if (already) process.exit(0);
if (!WRITE) { console.log("— ยังไม่ได้เขียน (ใส่ --write)"); process.exit(0); }

d.mixRule = next;
d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบของจริง (อย่าเชื่อว่าไม่ error = ลง)
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const bm = back?.[0]?.data?.mixRule;
const okShape =
  Array.isArray(bm?.tiers) && bm.tiers.length === tiers.length && bm.tiers.every((t) => !t.onePerUnit) &&
  bm.onePerUnitFromQty == null && back[0].data.savedAt === d.savedAt;
if (!okShape) die(`อ่านกลับไม่ตรง: ${JSON.stringify(bm)}`);
console.log("✓ เขียนแล้ว + อ่านกลับตรง");

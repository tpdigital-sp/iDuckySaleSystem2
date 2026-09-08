#!/usr/bin/env node
/**
 * 🎨 กระดาษ Texture Paper — ค่าคละลาย "ลายละ 5 บาท ลายแรกไม่คิด"
 *
 *   node scripts/texture-paper-mix-5.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-mix-5.mjs --write
 *
 * ผู้ใช้สั่ง 8 ก.ย. 69: "คละลาย ยังไม่ตรง ต้องเป็นคละตั้งแต่ลายที่ 2 บวกเพิ่มลายละ 5 บาท"
 *
 * ของเดิม: mixRule 10 บาท/แผ่น รวม 4 ลาย เกินลายละ 10 (แบบเดียวกับที่ paper-art-pet เคยใช้ก่อน 24 ส.ค.)
 * ของใหม่: {baseFee:5, includedDesigns:2, extraFee:5} → แผ่นที่มี n ลาย จ่าย (n−1)×5
 *   (กติกาเดียวกับ paper-art-pet — ดู scripts/mix-fee-5-per-design.mjs · ด้านหลังตั้งลายละ 5 อยู่แล้วใน backDesign.mixRule)
 * แก้ข้อความที่อ้างเลขเดิมด้วย: terms · tabs[0] Add On · tabs[2] · highlights · FAQ "สั่งขั้นต่ำกี่แผ่น คละลายได้ไหม?"
 * รันต่อจาก texture-paper-mix-unblock.mjs ได้ (ตัวนั้นคงค่าแถวแรกไว้ ไม่ย้อนกลับ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const NAME = "กระดาษเนื้อพิเศษ";
const TIER = { fromQty: 1, baseFee: 5, includedDesigns: 2, extraFee: 5 };

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => { console.error("✗ " + m); process.exit(1); };
/** jsonb คืนคีย์เรียงใหม่ — เทียบแบบไม่สนลำดับคีย์ */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);

/** แทนข้อความแบบต้องเจอเป๊ะ — มี to อยู่แล้ว = ผ่าน (รันซ้ำได้) · ไม่เจอทั้งคู่ = โครงสร้างเปลี่ยน หยุด */
const swap = (where, text, from, to) => {
  if (text?.includes(to)) return text;
  if (!text?.includes(from)) die(`${where}: ไม่พบข้อความ "${from.slice(0, 50)}…"`);
  return text.replaceAll(from, to);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า ${ID}`);
if (row.name !== NAME) die(`${ID}: ชื่อไม่ตรงที่คาด (${row.name})`);
const d = row.data;
const beforeAll = canon(d);

// 1) กติกาคละ — แถวเดียว + 4 ค่าระดับบนให้โค้ดเก่าอ่านตรงกัน (ไม่มี onePerUnit ตามที่ unblock ทำไว้)
if (d.mixRule?.tiers?.some((t) => t.onePerUnit) || d.mixRule?.onePerUnitFromQty != null)
  die("ยังมี onePerUnit อยู่ — รัน scripts/texture-paper-mix-unblock.mjs --write ก่อน");
d.mixRule = { tiers: [{ ...TIER }], baseFee: TIER.baseFee, includedDesigns: TIER.includedDesigns, extraFee: TIER.extraFee };

// 2) ข้อความ
const MIX_TXT = "คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด";
d.terms = swap("terms", d.terms,
  "1 แผ่น (A3) ต่อ 1 ลาย — คละลายบวกแผ่นละ 10 บาท (คละไม่เกิน 3-4 ลาย)",
  `1 แผ่น (A3) ต่อ 1 ลาย — ${MIX_TXT} (ระบบคิดให้อัตโนมัติ)`);
d.tabs[0].text = swap("tabs[0]", d.tabs[0].text,
  "• คละลาย บวกแผ่นละ 10 บาท (คละไม่เกิน 3-4 ลาย)",
  "• คละลายในแผ่นเดียวกัน ลายละ 5 บาท ลายแรกไม่คิด (เช่น คละ 3 ลาย = 10 บาท/แผ่น)");
d.tabs[2].text = swap("tabs[2]", d.tabs[2].text,
  "• 1 แผ่น A3 ต่อ 1 ลาย — ถ้าคละลายในแผ่นเดียว แจ้งจำนวนลายมาด้วย (บวกแผ่นละ 10 บาท คละไม่เกิน 3-4 ลาย)",
  "• 1 แผ่น A3 ต่อ 1 ลาย — ถ้าคละลายในแผ่นเดียว แจ้งจำนวนลายมาด้วย (ค่าคละลายละ 5 บาท ลายแรกไม่คิด)");
const hi = d.highlights.findIndex((h) => h.includes("คละลายได้ บวกแผ่นละ 10 บาท") || h.includes("คละลายได้ ลายละ 5 บาท"));
if (hi < 0) die("ไม่พบ highlight เรื่องคละลาย");
d.highlights[hi] = swap("highlights", d.highlights[hi],
  "(คละลายได้ บวกแผ่นละ 10 บาท)", "(คละลายได้ ลายละ 5 บาท ลายแรกไม่คิด)");
const faq = d.seo?.faqs?.find((f) => f.q === "สั่งขั้นต่ำกี่แผ่น คละลายได้ไหม?");
if (!faq) die("ไม่พบ FAQ คละลาย");
faq.a = swap("faq", faq.a,
  "ถ้าคละลายในแผ่นเดียวบวกแผ่นละ 10 บาท (คละไม่เกิน 3-4 ลาย)",
  "คละลายในแผ่นเดียวกันได้ คิดค่าคละลายละ 5 บาท ลายแรกไม่คิด (เช่น คละ 3 ลายในแผ่นเดียว = 10 บาท) ระบบคิดให้อัตโนมัติ");

const already = canon(d) === beforeAll;
console.log(`${already ? "ทำไปแล้ว" : WRITE ? "เขียน" : "ดูก่อน"} · ${ID}`);
console.log("  mixRule →", JSON.stringify(d.mixRule));
console.log("  terms   →", d.terms.split("\n")[0]);
console.log("  hl      →", d.highlights[hi]);
console.log("  faq     →", faq.a);
if (already) process.exit(0);
if (!WRITE) { console.log("— ยังไม่ได้เขียน (ใส่ --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID);
const bd = back?.[0]?.data;
const ok = canon(bd?.mixRule) === canon(d.mixRule) && bd?.savedAt === d.savedAt &&
  bd?.terms === d.terms && bd?.seo?.faqs?.find((f) => f.q === faq.q)?.a === faq.a;
if (!ok) die(`อ่านกลับไม่ตรง: ${JSON.stringify(bd?.mixRule)}`);
console.log("✓ เขียนแล้ว + อ่านกลับตรง");

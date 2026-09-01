#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — "เรทราคา" นับตามจำนวนพวง ไม่ใช่จำนวนชิ้นรวม
 * (ผู้ใช้สั่ง 1 ก.ย. 69: สั่ง 15 พวง พวงละ 2 ชิ้น = เรท 15 ไม่ใช่ 30 · เทียบใบเสนอราคาจริง
 *  15 พวง → ตัวหลัก 5cm ฿59 + ติ่งห้อย 2cm ฿15 + ตะขอ ฿8 = ฿82 · 30 พวง → 55+12+8 = ฿75)
 *
 *   node scripts/multi-charm-tier-by-set.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-tier-by-set.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ทำ 3 อย่าง:
 *  1. ตั้ง extraQtyScope: "extraPieces" ให้กลุ่ม "ขนาดชิ้นที่ 2-10" — ค่าติ่งห้อย 20/15/12
 *     ยังคิดเรทตาม "จำนวนติ่งห้อยรวม" (พวง × ติ่งห้อยต่อพวง) ตามที่ผู้ใช้เคาะ
 *     (ราคาฐานคิดเรทตามจำนวนพวงแล้ว — กลไกอยู่ใน tierQtyFor/optionFeeQty)
 *  2. เปลี่ยนป้ายช่วงราคาในตาราง "ชิ้น" → "พวง" (ทั้ง pricing และทุกเรท)
 *  3. แก้ข้อความทุกที่ที่ยังบอกว่าเรทนับจากชิ้นรวม (แท็บ · ไฮไลต์ · FAQ · คำอธิบายเรท · terms)
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 * ⚠️ ต้อง deploy โค้ด (optionFeeQty/extraQtyScope) ก่อน ไม่งั้นค่าติ่งห้อยจะคิดเรทตามจำนวนพวงแทน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;

/** ป้ายช่วงราคา: นับเป็นพวงแล้ว */
const TIER_LABEL = [
  ["1-10 ชิ้น", "1-10 พวง"],
  ["11-29 ชิ้น", "11-29 พวง"],
  ["30-49 ชิ้น", "30-49 พวง"],
  ["50-199 ชิ้น", "50-199 พวง"],
  ["200-499 ชิ้น", "200-499 พวง"],
  ["500 ชิ้นขึ้นไป", "500 พวงขึ้นไป"],
];

/** ข้อความที่ต้องตามไปแก้ให้ตรงกับกติกาใหม่ — คู่ [ของเดิม, ของใหม่] */
const TEXT = [
  [
    'ช่วงราคาขั้นบันไดนับจาก "จำนวนชิ้นรวมทุกพวง" เช่น สั่ง 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น เข้าช่วง 11-29 ชิ้น',
    'ช่วงราคาขั้นบันไดนับจาก "จำนวนพวงที่สั่ง" — พวงละกี่ชิ้นก็นับ 1 พวง เช่น สั่ง 15 พวง เข้าช่วง 11-29 พวง',
  ],
  [
    "• 1-10 ชิ้นคละอิสระ (ราคาปลีก) · 11 ชิ้นขึ้นไป ดีเทลละ 5 ชิ้นขึ้นไป",
    "• 1-10 พวงคละอิสระ (ราคาปลีก) · 11 พวงขึ้นไป ดีเทลละ 5 พวงขึ้นไป",
  ],
  [
    "ชิ้นที่เหลือคือติ่งห้อย คิดตามเรทติ่งห้อย: เริ่ม 2cm ชิ้นละ 20.- (1-10 ชิ้น) / 15.- (11-29 ชิ้น) / 12.- (30 ชิ้นขึ้นไป)",
    "ชิ้นที่เหลือคือติ่งห้อย คิดตามเรทติ่งห้อยซึ่งนับจากจำนวนติ่งห้อยรวมทั้งออเดอร์: เริ่ม 2cm ชิ้นละ 20.- (1-10 ติ่ง) / 15.- (11-29 ติ่ง) / 12.- (30 ติ่งขึ้นไป)",
  ],
  [
    "**ราคาต่อชิ้นถูกลงตามจำนวนชิ้นรวมที่สั่ง**: 1-10 ชิ้น 20.- · 11-29 ชิ้น 15.- · 30 ชิ้นขึ้นไป 12.-",
    "**ราคาต่อชิ้นถูกลงตามจำนวนติ่งห้อยรวมทั้งออเดอร์**: 1-10 ติ่ง 20.- · 11-29 ติ่ง 15.- · 30 ติ่งขึ้นไป 12.- (เช่น 15 พวง พวงละ 1 ติ่ง = 15 ติ่ง คิดชิ้นละ 15.-)",
  ],
  [
    "ราคารวมตามขนาดจริงของทุกชิ้น — ช่วงราคานับจากชิ้นรวม",
    "ราคารวมตามขนาดจริงของทุกชิ้น — ช่วงราคานับจากจำนวนพวง",
  ],
  [
    "นับจากจำนวนชิ้นรวมทุกพวง เช่น สั่ง 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น เข้าช่วงราคา 11-29 ชิ้น ราคาต่อชิ้นถูกลงตามจำนวนรวม",
    "นับจากจำนวนพวงที่สั่ง พวงละกี่ชิ้นก็นับ 1 พวง เช่น สั่ง 15 พวง = เข้าช่วงราคา 11-29 พวง · ส่วนค่าติ่งห้อยคิดเรทของตัวเองตามจำนวนติ่งห้อยรวมทั้งออเดอร์",
  ],
  [
    "คละลาย คละขนาด อะไหล่ได้ · ช่วงราคานับจากจำนวนชิ้นรวมทุกพวง (เช่น 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น) · 1-10 ชิ้นคละอิสระ (ราคาปลีก) · 11 ชิ้นขึ้นไป ดีเทลละ 5 ชิ้นขึ้นไป",
    "คละลาย คละขนาด อะไหล่ได้ · ช่วงราคานับจากจำนวนพวงที่สั่ง (พวงละกี่ชิ้นก็นับ 1 พวง) · 1-10 พวงคละอิสระ (ราคาปลีก) · 11 พวงขึ้นไป ดีเทลละ 5 พวงขึ้นไป",
  ],
  ["ราคาตามจำนวนชิ้นรวม (คละดีเทลได้)", "ราคาตามจำนวนพวงที่สั่ง (คละดีเทลได้)"],
  [
    "• ตะขอ/อะไหล่: สั่ง 1-10 ชิ้น เลือกตะขอ +10 บาท/ชิ้น",
    "• ตะขอ/อะไหล่: สั่ง 1-10 พวง เลือกตะขอ +10 บาท/พวง",
  ],
  [
    "ช่วงราคานับจากจำนวนชิ้นรวมทุกพวง ตะขอคิดครั้งเดียวต่อพวง",
    "ช่วงราคานับจากจำนวนพวงที่สั่ง ตะขอคิดครั้งเดียวต่อพวง",
  ],
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const before = JSON.stringify(row.data);
const p = row.data;
const log = [];

// 1) ค่าติ่งห้อยคิดเรทตาม "จำนวนติ่งห้อยรวม" (ชิ้นที่ 2 เป็นต้นไป)
let scoped = 0;
for (let k = 2; k <= MAX_PIECES; k++) {
  const o = p.options.find((x) => x.label === `ขนาดชิ้นที่ ${k}`);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "ขนาดชิ้นที่ ${k}"`);
  if (!o.extraFromQty || !o.extraSmallUpToQty) throw new Error(`กลุ่ม "${o.label}" ไม่มีขั้นราคาติ่งห้อย — รัน multi-charm-charm-price.mjs ก่อน`);
  if (o.extraQtyScope !== "extraPieces" || o.extraQtyWord !== "ติ่งห้อย") scoped++;
  o.extraQtyScope = "extraPieces";
  o.extraQtyWord = "ติ่งห้อย"; // บรรทัด 💡 เขียนว่า "ครบ 30 ติ่งห้อย" ไม่ใช่ "30 ชิ้น" (ชวนสับสนกับจำนวนพวง)
}
if (scoped) log.push(`ตั้ง extraQtyScope: "extraPieces" ให้ "ขนาดชิ้นที่ 2-${MAX_PIECES}" (${scoped} กลุ่ม) — ค่าติ่งห้อยคิดเรทตามจำนวนติ่งห้อยรวม`);

// 2) ป้ายช่วงราคา ชิ้น → พวง
const fixTiers = (pricing, where) => {
  for (const t of pricing?.tiers ?? []) {
    const hit = TIER_LABEL.find(([from]) => t.label === from);
    if (hit) {
      t.label = hit[1];
      log.push(`ป้ายช่วงราคา ${where}: "${hit[0]}" → "${hit[1]}"`);
    }
  }
};
fixTiers(p.pricing, "pricing");
for (const r of p.priceRates ?? []) fixTiers(r.pricing, `เรท ${r.id}`);

// 3) ข้อความทั้งก้อน
const walk = (v) => {
  if (typeof v === "string") {
    let out = v;
    for (const [from, to] of TEXT) if (out.includes(from)) out = out.split(from).join(to);
    return out;
  }
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  return v;
};
const blob = JSON.stringify(p);
for (const [from] of TEXT) if (blob.includes(JSON.stringify(from).slice(1, -1))) log.push(`แก้ข้อความ: "${from.slice(0, 46)}…"`);
const next = walk(p);

console.log(log.length ? log.map((l) => "• " + l).join("\n") : "(ไม่มีอะไรต้องแก้)");
if (before === JSON.stringify(next)) {
  console.log("\nไม่มีอะไรต้องแก้ (ทำไปแล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าจะบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb
  .from("products")
  .update({ data: next, name: next.name, category: next.category, price: next.price })
  .eq("id", ID);
if (upErr) throw upErr;
console.log("\n✅ บันทึกแล้ว");

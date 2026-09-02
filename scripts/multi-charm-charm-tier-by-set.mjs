#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — "ค่าติ่งห้อย" ก็คิดเรทตามจำนวนพวง ไม่ใช่จำนวนติ่งห้อยรวม
 * (ผู้ใช้ทัก 2 ก.ย. 69 พร้อมใบเสนอราคาจริง: 15 พวง พวงละ 3 ชิ้น = ตัวหลัก 59 + ติ่งห้อย 15 + 15 + ตะขอ 8 = ฿97
 *  ของเดิมนับติ่งห้อยรวม 15×2 = 30 ติ่ง → ตกไปขั้น 30+ เหลือติ่งละ 12 = ฿91 ซึ่งผิด
 *  ตอนเลือก 2 ชิ้นไม่เห็นบั๊ค เพราะ 15 พวง = 15 ติ่ง เลขบังเอิญตรงกัน)
 *
 *   node scripts/multi-charm-charm-tier-by-set.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-charm-tier-by-set.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ทำ 2 อย่าง (ข้อมูลล้วน ไม่ต้อง deploy โค้ด):
 *  1. ถอด extraQtyScope/extraQtyWord ของกลุ่ม "ขนาดชิ้นที่ 2-10" → optionFeeQty() คืนค่า tierQty (จำนวนพวง)
 *     กลไก extraQtyScope ยังอยู่ในโค้ดให้สินค้าตัวอื่นใช้ แค่สินค้านี้ไม่ใช้แล้ว
 *  2. แก้ข้อความทุกที่ที่ยังบอกว่าเรทติ่งห้อยนับจากจำนวนติ่งห้อยรวม (แท็บ · FAQ · note ของกลุ่ม)
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;

/** ข้อความที่ต้องตามไปแก้ให้ตรงกับกติกาใหม่ — คู่ [ของเดิม, ของใหม่] */
const TEXT = [
  [
    "· ส่วนค่าติ่งห้อยคิดเรทของตัวเองตามจำนวนติ่งห้อยรวมทั้งออเดอร์",
    "· ค่าติ่งห้อยก็นับช่วงราคาจากจำนวนพวงเหมือนกัน",
  ],
  [
    "ชิ้นที่เหลือคือติ่งห้อย คิดตามเรทติ่งห้อยซึ่งนับจากจำนวนติ่งห้อยรวมทั้งออเดอร์: เริ่ม 2cm ชิ้นละ 20.- (1-10 ติ่ง) / 15.- (11-29 ติ่ง) / 12.- (30 ติ่งขึ้นไป)",
    "ชิ้นที่เหลือคือติ่งห้อย คิดตามเรทติ่งห้อยซึ่งนับช่วงราคาจากจำนวนพวงเหมือนตัวหลัก: เริ่ม 2cm ชิ้นละ 20.- (1-10 พวง) / 15.- (11-29 พวง) / 12.- (30 พวงขึ้นไป)",
  ],
  [
    "**ราคาต่อชิ้นถูกลงตามจำนวนติ่งห้อยรวมทั้งออเดอร์**: 1-10 ติ่ง 20.- · 11-29 ติ่ง 15.- · 30 ติ่งขึ้นไป 12.- (เช่น 15 พวง พวงละ 1 ติ่ง = 15 ติ่ง คิดชิ้นละ 15.-)",
    "**ราคาต่อติ่งถูกลงตามจำนวนพวงที่สั่ง**: 1-10 พวง 20.- · 11-29 พวง 15.- · 30 พวงขึ้นไป 12.- (เช่น 15 พวง พวงละ 2 ติ่ง = ติ่งละ 15.-)",
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

// 1) ถอด scope ของกลุ่มติ่งห้อย — ขั้น +฿ (20/15/12) ยังอยู่ครบ แค่เทียบกับ "จำนวนพวง" แทน
let cleared = 0;
for (let k = 2; k <= MAX_PIECES; k++) {
  const o = p.options.find((x) => x.label === `ขนาดชิ้นที่ ${k}`);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "ขนาดชิ้นที่ ${k}"`);
  if (!o.extraFromQty || !o.extraSmallUpToQty) throw new Error(`กลุ่ม "${o.label}" ไม่มีขั้นราคาติ่งห้อย — รัน multi-charm-charm-price.mjs ก่อน`);
  if (o.extraQtyScope || o.extraQtyWord) cleared++;
  delete o.extraQtyScope;
  delete o.extraQtyWord;
}
if (cleared) log.push(`ถอด extraQtyScope/extraQtyWord ของ "ขนาดชิ้นที่ 2-${MAX_PIECES}" (${cleared} กลุ่ม) — ค่าติ่งห้อยคิดเรทตามจำนวนพวง`);

// 2) ข้อความทั้งก้อน
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

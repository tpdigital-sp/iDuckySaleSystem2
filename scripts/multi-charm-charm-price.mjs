#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — ราคาติ่งห้อย (ชิ้นที่ 2 ขึ้นไป) กลับไปใช้เรทติ่งห้อยเดิม
 * (ผู้ใช้สั่ง 1 ก.ย. 69: คิดตามตารางอะคริลิคเต็มใบ = 2cm ตั้ง ฿80 แพงเกินไป)
 *
 *   node scripts/multi-charm-charm-price.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-charm-price.mjs --write   # เขียนลงฐานข้อมูล
 *
 * เรท: เริ่ม 2 ซม. ใหญ่กว่านั้นบวก ซม. ละ 10 บาท · ราคาต่อชิ้นถูกลงตาม "จำนวนชิ้นรวมที่สั่ง"
 *   1-10 ชิ้น 20.- · 11-29 ชิ้น 15.- · 30 ชิ้นขึ้นไป 12.-   (เท่าของเสริมติ่งห้อยเดิมเป๊ะ)
 * วิธีทำ: ถอด priceAsDriver/priceAsDriverAlso ของ "ขนาดชิ้นที่ k" (k≥2) ที่ดึงราคาสดจากตารางเรท
 *         แล้วตั้ง +฿ ต่อขนาดเองแบบ 3 ขั้น (extraSmall ≤10 ชิ้น · extraBelow 11-29 · extra 30+)
 * ⚠️ ชิ้นที่ 1 (ตัวหลัก) ไม่แตะ — ยังเป็นแกนตารางเรทเหมือนเดิม
 * ⚠️ ผลพลอยได้: เนื้ออะคริลิค/งานสกรีนของติ่งห้อย ไม่บวกราคาเพิ่มแล้ว (เดิมบวกผ่านตารางเรท)
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;
/** ราคาติ่งห้อยขนาดมาตรฐาน 2 ซม. ตามช่วงจำนวนชิ้นรวม */
const BASE = { small: 20, below: 15, big: 12 };
const PER_CM = 10; // ใหญ่กว่า 2 ซม. บวก ซม. ละ
const SMALL_UP_TO = 10; // ≤10 ชิ้นรวม = ช่วงปลีก (extraSmall)
const FROM_QTY = 30; // 30 ชิ้นรวมขึ้นไป = ราคาต่ำสุด (extra)
const NOTE =
  "ติ่งห้อยเริ่มที่ 2 ซม. ใหญ่กว่านั้นบวก ซม. ละ 10 บาท · **ราคาต่อชิ้นถูกลงตามจำนวนชิ้นรวมที่สั่ง**: 1-10 ชิ้น 20.- · 11-29 ชิ้น 15.- · 30 ชิ้นขึ้นไป 12.-";

/** ข้อความที่ต้องตามไปแก้ให้ตรงกับเรทใหม่ — คู่ [ของเดิม, ของใหม่] */
const TEXT = [
  [
    "• ชิ้นแรกในพวงคือตัวหลัก ชิ้นที่เหลือคือติ่งห้อย — ทุกชิ้นเลือกสเปคเองได้ คิดราคาตามตารางเดียวกัน",
    "• ชิ้นแรกในพวงคือตัวหลัก (คิดราคาตามตาราง) · ชิ้นที่เหลือคือติ่งห้อย คิดตามเรทติ่งห้อย: เริ่ม 2cm ชิ้นละ 20.- (1-10 ชิ้น) / 15.- (11-29 ชิ้น) / 12.- (30 ชิ้นขึ้นไป) · ใหญ่กว่า 2cm บวก cm ละ 10.-",
  ],
  [
    "**ชิ้นแรกคือตัวหลัก ที่เหลือคือติ่งห้อย** แต่ละชิ้นเลือกขนาด/เนื้อ/งานสกรีนเองได้ ราคารวมตามสเปคของทุกชิ้น",
    "**ชิ้นแรกคือตัวหลัก ที่เหลือคือติ่งห้อย** (ติ่งห้อยคิดเรทของตัวเอง เริ่ม 2 ซม. ชิ้นละ 20 บาท) แต่ละชิ้นเลือกขนาด/เนื้อ/งานสกรีนเองได้",
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
const p = row.data;
const log = [];

for (let k = 2; k <= MAX_PIECES; k++) {
  const o = p.options.find((x) => x.label === `ขนาดชิ้นที่ ${k}`);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "ขนาดชิ้นที่ ${k}"`);
  delete o.priceAsDriver; // เลิกดึงราคาสดจากตารางเรทของชิ้นที่ 1
  delete o.priceAsDriverAlso;
  o.extraSmallUpToQty = SMALL_UP_TO;
  o.extraFromQty = FROM_QTY;
  for (const c of o.choices) {
    const cm = parseInt(c.name, 10);
    if (!Number.isFinite(cm)) throw new Error(`ตัวเลือก "${c.name}" อ่านขนาดเป็นตัวเลขไม่ได้`);
    const up = Math.max(0, cm - 2) * PER_CM;
    c.extraSmall = BASE.small + up;
    c.extraBelow = BASE.below + up;
    c.extra = BASE.big + up;
  }
  if (k === 2) o.note = NOTE; // หัวชุดบอกชิ้นไหนอยู่แล้ว — คำอธิบายเรทขึ้นครั้งเดียวที่ติ่งห้อยชิ้นแรก
  else delete o.note;
}
const sample = p.options.find((o) => o.label === "ขนาดชิ้นที่ 2").choices;
log.push(
  `ตั้งเรทติ่งห้อยให้ "ขนาดชิ้นที่ 2-${MAX_PIECES}" (ถอดการดึงราคาจากตารางเรทออก) — ` +
    sample.map((c) => `${c.name} ${c.extraSmall}/${c.extraBelow}/${c.extra}`).join(" · ")
);

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
const next = walk(p);
for (const [from] of TEXT) if (JSON.stringify(p).includes(from)) log.push(`แก้ข้อความ: "${from.slice(0, 40)}…"`);

console.log(log.map((l) => "• " + l).join("\n"));
if (JSON.stringify(row.data) === JSON.stringify(next)) {
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

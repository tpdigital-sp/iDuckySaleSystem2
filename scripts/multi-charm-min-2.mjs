#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — ขั้นต่ำ 2 ชิ้นต่อพวง (ผู้ใช้สั่ง 1 ก.ย. 69)
 * สินค้าตัวนี้คือ "หลายชิ้นใน 1 พวง" — พวงละ 1 ชิ้นให้ไปสั่งพวงกุญแจอะคริลิคปกติแทน
 *
 *   node scripts/multi-charm-min-2.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-min-2.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ถอดตัวเลือก "1 ชิ้น" ออกจากกลุ่ม "จำนวนชิ้นใน 1 พวง" (ค่าเริ่มต้นจึงกลายเป็น 2 ชิ้น)
 * + แก้ข้อความที่บอกช่วง "1-10 ชิ้นต่อพวง" ให้เป็น 2-10
 * ⚠️ ไม่แตะข้อความที่ "1-10 ชิ้น" หมายถึงช่วงราคาตามจำนวนชิ้นรวมที่สั่ง (tiers / ตะขอ / ติ่งห้อย)
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const COUNT = "จำนวนชิ้นใน 1 พวง";
const DROP = "1 ชิ้น";

/** ข้อความที่พูดถึง "จำนวนชิ้นในพวง" เท่านั้น — คู่ [ของเดิม, ของใหม่] */
const TEXT = [
  ["เลือกอิสระว่า 1 พวงมีอะคริลิคกี่ชิ้น (สูงสุด 10 ชิ้น)", "เลือกอิสระว่า 1 พวงมีอะคริลิคกี่ชิ้น (2-10 ชิ้น)"],
  ["เลือกได้อิสระว่าจะใส่กี่ชิ้น (1-10 ชิ้น)", "เลือกได้อิสระว่าจะใส่กี่ชิ้น (2-10 ชิ้น)"],
  ["1 พวง ใส่อะคริลิคได้อิสระ 1-10 ชิ้น", "1 พวง ใส่อะคริลิคได้อิสระ 2-10 ชิ้น"],
  ["1 พวง เลือกจำนวนชิ้นได้ 1-10 ชิ้น", "1 พวง เลือกจำนวนชิ้นได้ 2-10 ชิ้น"],
  ["เลือกได้อิสระตั้งแต่ 1-10 ชิ้นต่อพวง", "เลือกได้อิสระตั้งแต่ 2-10 ชิ้นต่อพวง"],
  ["หลายชิ้นใน 1 พวง เลือกได้ 1-10 ชิ้น", "หลายชิ้นใน 1 พวง เลือกได้ 2-10 ชิ้น"],
  ["เลือกจำนวนชิ้นอิสระ 1-10 ชิ้น", "เลือกจำนวนชิ้นอิสระ 2-10 ชิ้น"],
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

const count = p.options.find((o) => o.label === COUNT);
if (!count) throw new Error(`ไม่เจอกลุ่ม "${COUNT}"`);
const before = count.choices.length;
count.choices = count.choices.filter((c) => c.name !== DROP);
log.push(
  before === count.choices.length
    ? `กลุ่ม "${COUNT}" ไม่มี "${DROP}" อยู่แล้ว (เริ่มที่ ${count.choices[0].name})`
    : `ถอด "${DROP}" ออกจากกลุ่ม "${COUNT}" — เหลือ ${count.choices.length} ตัวเลือก เริ่มที่ ${count.choices[0].name}`
);

/** เงื่อนไข showWhen ที่อ้าง "1 ชิ้น" (ไม่มีอยู่แล้ววันนี้ แต่กันไว้เผื่อสคริปต์รุ่นก่อนหน้าใส่กลับมา) */
let cleaned = 0;
for (const o of p.options) {
  for (const cond of [o.showWhen, ...(o.showWhenAll || []), ...(o.showWhenAny || [])]) {
    if (cond?.label === COUNT && cond.choices?.includes(DROP)) {
      cond.choices = cond.choices.filter((c) => c !== DROP);
      cleaned++;
    }
  }
}
if (cleaned) log.push(`ล้าง "${DROP}" ออกจากเงื่อนไขการแสดงผล ${cleaned} ข้อ`);

/** แทนข้อความทั่วทั้งก้อน (JSON round-trip) — คู่ที่ไม่เจอ = แก้ไปแล้ว */
let json = JSON.stringify(p);
for (const [from, to] of TEXT) {
  const hits = json.split(from).length - 1;
  if (hits) log.push(`แก้ข้อความ ${hits} จุด: "${from}" → "${to}"`);
  json = json.split(from).join(to);
}
const next = JSON.parse(json);

console.log(log.map((l) => "• " + l).join("\n"));
const changed = JSON.stringify(row.data) !== JSON.stringify(next);
if (!changed) {
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

#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — สั่งมากกว่า 10 ชิ้นในพวงเดียว ให้แอดมินคิดราคาให้ (ผู้ใช้สั่ง 3 ก.ย. 69)
 *
 *   node scripts/multi-charm-over-10-quote.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-over-10-quote.mjs --write   # เขียนลงฐานข้อมูล
 *
 * เพิ่มตัวเลือก "มากกว่า 10 ชิ้น (แอดมินคิดราคาให้)" ท้ายกลุ่ม "จำนวนชิ้นใน 1 พวง" ติดธง askPrice
 * → needsQuote จับ ราคาเป็น 0 ตะกร้าขึ้น "💬 รอตีราคา" ลูกค้าสั่งไว้ก่อนได้ แอดมินใส่ราคาที่ออเดอร์
 * ชุดสเปคชิ้นที่ 2-10 / รูปแบบการห้อย ไม่โชว์ตอนเลือกตัวนี้ (showWhen อ้างรายชื่อ 2-10 ชิ้นอยู่แล้ว
 * — จงใจไม่เติม ให้คุยสเปคทั้งพวงกับแอดมินในแชทแทน) + เติมคำอธิบายท้าย note ของกลุ่ม
 * + ตั้ง data.quoteOption = true (ธงการ์ดหน้ารายการ "เริ่มต้น ฿X" — ปกติ /api/admin/products เขียนให้)
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const COUNT = "จำนวนชิ้นใน 1 พวง";
const NAME = "มากกว่า 10 ชิ้น (แอดมินคิดราคาให้)";
const NOTE_ADD =
  " · อยากได้มากกว่า 10 ชิ้นในพวงเดียว เลือกตัวเลือกสุดท้ายแล้วทักไลน์คุยสเปคได้เลย แอดมินคิดราคาให้";

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
const p = structuredClone(row.data);
const log = [];

const count = p.options.find((o) => o.label === COUNT);
if (!count) throw new Error(`ไม่เจอกลุ่ม "${COUNT}"`);
if (!Array.isArray(count.choices)) throw new Error(`กลุ่ม "${COUNT}" ไม่มี choices เป็น array`);

if (count.choices.some((c) => c.name === NAME)) {
  log.push(`กลุ่ม "${COUNT}" มี "${NAME}" อยู่แล้ว`);
} else {
  count.choices.push({ name: NAME, askPrice: true });
  log.push(`เพิ่ม "${NAME}" (askPrice) ท้ายกลุ่ม "${COUNT}" — รวม ${count.choices.length} ตัวเลือก`);
}
// เผื่อรอบก่อนเขียนไว้แต่ธงหาย
const added = count.choices.find((c) => c.name === NAME);
if (added.askPrice !== true) {
  added.askPrice = true;
  log.push(`ติดธง askPrice ให้ "${NAME}" (ของเดิมไม่มี)`);
}

if (!(count.note ?? "").includes("แอดมินคิดราคาให้")) {
  count.note = (count.note ?? "") + NOTE_ADD;
  log.push(`เติมคำอธิบายท้าย note ของกลุ่ม "${COUNT}"`);
} else {
  log.push(`note ของกลุ่ม "${COUNT}" พูดถึงแอดมินคิดราคาอยู่แล้ว`);
}

if (p.quoteOption !== true) {
  p.quoteOption = true;
  log.push("ตั้ง data.quoteOption = true (ธง 💬 ตีราคา ให้การ์ดหน้ารายการ)");
} else {
  log.push("data.quoteOption เป็น true อยู่แล้ว");
}

console.log(log.map((l) => "• " + l).join("\n"));
const changed = JSON.stringify(row.data) !== JSON.stringify(p);
if (!changed) {
  console.log("\nไม่มีอะไรต้องแก้ (ทำไปแล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าจะบันทึกจริง)");
  process.exit(0);
}

p.savedAt = new Date().toISOString();
const { data: upd, error: upErr } = await sb
  .from("products")
  .update({ data: p, name: p.name, category: p.category, price: p.price })
  .eq("id", ID)
  .select("data");
if (upErr) throw upErr;
if (!upd?.length) throw new Error("update โดน 0 แถว — ไม่มีอะไรถูกเขียน");

// อ่านกลับมาเทียบ อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
const bCount = back.data.options.find((o) => o.label === COUNT);
const bChoice = bCount?.choices.find((c) => c.name === NAME);
if (!bChoice || bChoice.askPrice !== true || back.data.quoteOption !== true || back.data.savedAt !== p.savedAt) {
  console.error("read-back:", JSON.stringify({ choice: bChoice, quoteOption: back.data.quoteOption, savedAt: back.data.savedAt }));
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันสคริปต์ซ้ำอีกรอบ");
}
console.log("\n✅ บันทึกแล้ว + อ่านกลับตรงตามที่เขียน (savedAt " + p.savedAt + ")");

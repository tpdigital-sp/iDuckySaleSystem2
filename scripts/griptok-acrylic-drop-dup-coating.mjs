#!/usr/bin/env node
/**
 * Griptok อะคริลิค (id 1-4 · slug Griptokอะคริลิค) — ถอดกลุ่ม "งานเคลือบ" ที่ซ้ำซ้อน
 *
 *   node scripts/griptok-acrylic-drop-dup-coating.mjs           # ซ้อม (ไม่เขียน)
 *   node scripts/griptok-acrylic-drop-dup-coating.mjs --write   # เขียนจริง
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: กลุ่ม "งานเคลือบ" (ไม่เคลือบนูน / เคลือบนูน (เรซิ่น) +40)
 * ซ้ำกับกลุ่ม "เคลือบผิว" (ไม่เคลือบ / เคลือบนูน Resin +40) ที่มีอยู่แล้ว
 *   - "เคลือบผิว" (ผู้ใช้เปลี่ยนชื่อเป็น "งานเคลือบนูน (เรซิ่น)") โผล่ทุกเนื้ออะคริลิค + มีรูปประกอบครบ → เก็บตัวนี้ไว้
 *   - "งานเคลือบ" โผล่เฉพาะตอนเลือก "อะคริลิคใส" → ลูกค้าเห็น 2 กลุ่มพร้อมกัน เสี่ยงโดน +40 สองเด้ง
 * ทั้งสองกลุ่มไม่ใช่แกนตารางราคา (driverLabels = ขนาด / งานสกรีน / สีอะคริลิค (เรทราคา))
 * และไม่มี rule/showWhen ตัวไหนอ้างถึง "งานเคลือบ" → ถอดได้ ราคาไม่ขยับ
 *
 * ก่อนเขียนจะเก็บ data ปัจจุบันลง product_revisions กู้คืนได้ด้วย
 * scripts/product-revisions.mjs 1-4
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const GROUP = "งานเคลือบ";
const KEEP = ["เคลือบผิว", "งานเคลือบนูน (เรซิ่น)"]; // ผู้ใช้เปลี่ยนชื่อกลุ่มนี้ระหว่างทาง — รับได้ทั้งสองชื่อ

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);
console.log(`🛒 ${row.name} (id ${ID})`);

/* ต้องมีกลุ่มที่เก็บไว้จริง ๆ ก่อน ไม่งั้นถอดแล้วลูกค้าสั่งเคลือบนูนไม่ได้เลย */
const keep = (d.options || []).find((o) => KEEP.includes(o.label));
if (!keep) throw new Error(`ไม่เจอกลุ่มเคลือบนูนที่จะเก็บไว้ (${KEEP.join(" / ")}) — ห้ามถอด "${GROUP}" ทิ้ง ไม่งั้นสั่งเคลือบนูนไม่ได้`);
console.log(`  เก็บไว้: "${keep.label}" → ${keep.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | ")}`);

const target = (d.options || []).find((o) => o.label === GROUP);
if (!target) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — อาจถูกถอดไปแล้ว`);
console.log(`  จะถอด: "${GROUP}" → ${target.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | ")}`);

/* กลุ่มที่ถอดต้องไม่ใช่แกนตารางราคา */
const drivers = new Set([...(d.pricing?.driverLabels || []), ...(d.priceRates || []).flatMap((r) => r.driverLabels || [])]);
if (drivers.has(GROUP)) throw new Error(`"${GROUP}" เป็นแกนตารางราคา (driverLabels) — ถอดแล้วราคาหล่น หยุดก่อน`);

/* กันพลาด: ต้องไม่มี rule / showWhen ของกลุ่มอื่นอ้างถึงกลุ่มนี้
   (เทียบชื่อแบบเป๊ะ ๆ ไม่ใช่ includes — "งานเคลือบ" เป็นคำนำหน้าของ "งานเคลือบนูน (เรซิ่น)") */
const labelsIn = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((n) => labelsIn(n, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) k === "label" && typeof v === "string" ? out.push(v) : labelsIn(v, out);
  return out;
};
const refs = labelsIn({ rules: d.rules, options: (d.options || []).filter((o) => o !== target) });
if (refs.includes(GROUP)) throw new Error(`มีกฎ/เงื่อนไขอ้างถึงกลุ่ม "${GROUP}" — ตรวจก่อนถอด`);

const before = d.options.length;
d.options = d.options.filter((o) => o !== target);
console.log(`  ถอดกลุ่ม "${GROUP}" (${before} → ${d.options.length} กลุ่ม)`);

if (!WRITE) {
  console.log("\n(ซ้อมเฉย ๆ — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: revErr } = await sb
  .from("product_revisions")
  .insert({ product_id: ID, data: row.data, action: "save", editor: "script", editor_name: "griptok-acrylic-drop-dup-coating.mjs" });
if (revErr) console.log(`  ⚠️ เก็บ product_revisions ไม่ได้ (${revErr.message}) — เขียนต่อ`);
else console.log("  📜 เก็บเวอร์ชันเดิมลง product_revisions แล้ว");

d.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw upErr;
console.log("✅ เขียนเรียบร้อย");

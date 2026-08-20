#!/usr/bin/env node
/**
 * ถอดอุปกรณ์เสริม 4 อย่างออกจากสินค้า "สแตนดี้อะคริลิค (Acrylic Standee)" — id: standy
 *   สปริง (ตัวโยก) · แปะกาวหนีบรูปด้านหลัง · แปะกาวใส่รูปด้านหลัง · จุกยางหมุนได้ (ชุด)
 *
 *   node scripts/remove-standy-accessories.mjs           # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/remove-standy-accessories.mjs --write   # บันทึกจริง
 *
 * ชื่อพวกนี้ไม่ได้อยู่แค่ในกลุ่มตัวเลือก — ไปโผล่ในแท็บ "Add-on / อุปกรณ์เสริม" กับคำถามที่พบบ่อย
 * ของ SEO ด้วย ถ้าลบแค่ตัวเลือก ลูกค้าจะยังอ่านเจอของที่สั่งไม่ได้แล้ว จึงแก้ให้ตรงกันทั้งสามที่
 *
 * ℹ️ กลุ่มนี้ไม่ใช่แกนตารางราคา (ราคาบวกอยู่ที่ choice.extra) — ลบแล้วตารางราคาไม่ต้องแก้ตาม
 *    ออเดอร์เก่าที่เคยสั่งของพวกนี้ไม่กระทบ เพราะเก็บชื่อที่เลือกไว้เป็นข้อความในตัวออเดอร์แล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "standy";
const GROUP = "อุปกรณ์เสริม";
const REMOVE = ["สปริง (ตัวโยก)", "แปะกาวหนีบรูปด้านหลัง", "แปะกาวใส่รูปด้านหลัง", "จุกยางหมุนได้ (ชุด)"];

/** บรรทัดในแท็บ Add-on ที่ไล่ราคาอุปกรณ์เสริม — เขียนใหม่ให้เหลือเฉพาะของที่ยังขาย */
const TAB_TITLE = "Add-on / อุปกรณ์เสริม";
const TAB_FROM =
  "• อุปกรณ์เสริม: สปริง +20.- · แปะกาวหนีบรูปด้านหลัง +10.- · แปะกาวใส่รูปด้านหลัง +50.- · จี้ห้อยหัวใจ คู่ละ 15.- · จุกยางหมุน 10.- · NFC 20.- · แม่เหล็ก 5.- · เซาะร่องติดแม่เหล็ก/จุดหมุน จุดละ 15.-";
const TAB_TO =
  "• อุปกรณ์เสริม: จี้ห้อยหัวใจ คู่ละ 15.- · NFC 20.- · แม่เหล็ก 5.- · เซาะร่องติดแม่เหล็ก/จุดหมุน จุดละ 15.-";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);

// ── 1. กลุ่มตัวเลือก ──────────────────────────────────────────────────────
const opt = d.options?.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
if ((d.pricing?.driverLabels ?? []).includes(GROUP) || (d.priceRates ?? []).some((r) => (r.pricing?.driverLabels ?? []).includes(GROUP)))
  throw new Error(`"${GROUP}" เป็นแกนตารางราคา — ลบตัวเลือกต้องรื้อช่องราคาด้วย ไม่บันทึก`);

const missing = REMOVE.filter((n) => !opt.choices.some((c) => c.name === n));
const before = opt.choices.length;
opt.choices = opt.choices.filter((c) => !REMOVE.includes(c.name));

console.log(`📦 ${d.name} (${ID})`);
if (missing.length) console.log(`   ⚠️ ไม่เจอในกลุ่ม (ถอดไปแล้ว?): ${missing.join(" · ")}`);
console.log(`   [${GROUP}] ${before} → ${opt.choices.length} ตัว`);
opt.choices.forEach((c) => console.log(`        ${c.name}${c.extra ? ` +฿${c.extra}` : ""}`));

// ── 2. แท็บ Add-on ────────────────────────────────────────────────────────
const tab = d.tabs?.find((t) => t.title === TAB_TITLE);
if (tab?.text.includes(TAB_FROM)) {
  tab.text = tab.text.replace(TAB_FROM, TAB_TO);
  console.log(`   แท็บ "${TAB_TITLE}": อัปเดตรายการราคาแล้ว`);
} else if (tab?.text.includes(TAB_TO)) {
  console.log(`   แท็บ "${TAB_TITLE}": อัปเดตไว้แล้ว`);
} else {
  throw new Error(`ข้อความในแท็บ "${TAB_TITLE}" ไม่ตรงกับที่คาดไว้ — ไม่บันทึก`);
}

// ── 3. คำถามที่พบบ่อย (SEO) — ไล่ชื่อตัวเลือกไว้ ต้องตรงกับของจริง ────────
for (const f of d.seo?.faqs ?? []) {
  if (!f.a?.includes(`${GROUP}:`)) continue;
  f.a = f.a.replace(new RegExp(`(${GROUP}:\\s*)([^·]*)`), `$1${opt.choices.map((c) => c.name).join(", ")}`);
  console.log(`   คำถามที่พบบ่อย: อัปเดตรายการอุปกรณ์เสริมแล้ว`);
}

// ── ตรวจก่อนบันทึก — ต้องไม่เหลือชื่อที่ถอดออกอยู่ที่ไหนอีก ────────────────
const left = REMOVE.filter((n) => JSON.stringify(d).includes(n));
if (left.length) throw new Error(`ยังเหลือชื่อที่ถอดออกอยู่ในข้อมูล: ${left.join(" · ")} — ไม่บันทึก`);
console.log("   ไม่เหลือชื่อที่ถอดออกในข้อมูลสินค้าแล้ว ✅");

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);

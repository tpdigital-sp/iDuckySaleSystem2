#!/usr/bin/env node
/**
 * สแตนดี้อะคริลิค (standy) — ปรับกลุ่ม "อุปกรณ์เสริม"
 *
 *   node scripts/standy-accessories-qty.mjs           # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/standy-accessories-qty.mjs --write   # บันทึกจริง
 *
 * ที่ทางร้านสั่ง:
 *   1. ถอด "จี้ห้อยหัวใจ (คู่)" ออก
 *   2. แม่เหล็ก 10mm กับ เซาะร่อง ติดแม่เหล็ก 3mm — ลูกค้าต้องระบุ "จำนวน" ด้วย
 *      และต้องทักมาคุยกับแอดมินก่อน (ไม่ให้จบเองในหน้าเว็บ)
 *
 * ⚠️ "ระบุจำนวน" (choice.qty) ใช้ได้เฉพาะกลุ่มแบบติ๊กหลายอย่าง (display: 'multi') เท่านั้น
 *    — ดู hasChoiceQty ใน src/lib/products.ts · กลุ่มนี้เดิมเป็นเมนูเลื่อน (dropdown) จึงต้องเปลี่ยนชนิด
 *    ผลพลอยได้คือลูกค้าติ๊กอุปกรณ์เสริมได้หลายอย่างพร้อมกัน (เดิมเลือกได้อย่างเดียว)
 * ⚠️ พอเป็นกลุ่มติ๊กแล้ว ตัวเลือก "ไม่เพิ่ม" ไม่จำเป็น (ไม่ติ๊กอะไรเลย = ไม่เพิ่ม)
 *    ถ้าเก็บไว้ ลูกค้าติ๊ก "ไม่เพิ่ม" พร้อมของอย่างอื่นได้ ซึ่งขัดกันเอง — จึงถอดออก
 * ⚠️ askPrice ที่ตัวเลือก = เลือกแล้วทั้งออเดอร์กลายเป็น "รอแอดมินตีราคา"
 *    ลูกค้ากดสั่งไว้ก่อนได้ แล้วส่งลิงก์ให้แอดมินทางไลน์ (ดู hasQuoteOption)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "standy";
const GROUP = "อุปกรณ์เสริม";
const REMOVE = ["จี้ห้อยหัวใจ (คู่)", "ไม่เพิ่ม"];
/** ต้องระบุจำนวน + ทักแอดมินก่อน */
const NEEDS_QTY_AND_CHAT = ["แม่เหล็ก 10mm", "เซาะร่อง ติดแม่เหล็ก 3mm"];
const QTY_MAX = 20;

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

const opt = (d.options ?? []).find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
if ((d.pricing?.driverLabels ?? []).includes(GROUP) || (d.priceRates ?? []).some((r) => (r.pricing?.driverLabels ?? []).includes(GROUP)))
  throw new Error(`"${GROUP}" เป็นแกนตารางราคา — เปลี่ยนชนิดกลุ่ม/ลบตัวเลือกต้องรื้อตารางด้วย ไม่บันทึก`);

const before = opt.choices.map((c) => c.name);
opt.display = "multi";
opt.choices = opt.choices.filter((c) => !REMOVE.includes(c.name));
const missing = NEEDS_QTY_AND_CHAT.filter((n) => !opt.choices.some((c) => c.name === n));
if (missing.length) throw new Error(`ไม่เจอตัวเลือก: ${missing.join(" · ")} — ไม่บันทึก`);
for (const c of opt.choices) {
  if (!NEEDS_QTY_AND_CHAT.includes(c.name)) continue;
  c.qty = true;
  c.qtyMax = QTY_MAX;
  c.askPrice = true;
}

console.log(`📦 ${d.name} (${ID}) · กลุ่ม "${GROUP}"`);
console.log(`   ชนิดกลุ่ม: เมนูเลื่อน → ติ๊กได้หลายอย่าง (ต้องเป็นแบบนี้ ระบุจำนวนถึงจะใช้ได้)`);
console.log(`   ถอดออก: ${before.filter((n) => !opt.choices.some((c) => c.name === n)).join(" · ")}`);
for (const c of opt.choices)
  console.log(
    `   • ${c.name}${c.extra ? ` +฿${c.extra}` : ""}${c.qty ? ` · ระบุจำนวนได้ (ไม่เกิน ${c.qtyMax})` : ""}${c.askPrice ? " · 💬 ทักแอดมินก่อน" : ""}`
  );

// แท็บที่ไล่ราคาอุปกรณ์เสริม — ให้ตรงกับของจริง
const tab = (d.tabs ?? []).find((t) => t.title === "Add-on / อุปกรณ์เสริม");
const LINE = `• อุปกรณ์เสริม: NFC 20.- · แม่เหล็ก 10mm 5.- · เซาะร่องติดแม่เหล็ก 3mm จุดละ 15.- — แม่เหล็กและเซาะร่องต้องระบุจำนวน และทักคุยกับแอดมินก่อนสั่ง`;
if (tab) {
  const lines = tab.text.split("\n");
  const at = lines.findIndex((l) => /^•\s*อุปกรณ์เสริม:/.test(l));
  if (at < 0) throw new Error(`ไม่เจอบรรทัด "• อุปกรณ์เสริม:" ในแท็บ — ไม่บันทึก`);
  if (lines[at] !== LINE) {
    lines[at] = LINE;
    tab.text = lines.join("\n");
    console.log(`   แท็บ "${tab.title}": เขียนรายการอุปกรณ์เสริมใหม่`);
  }
}

// คำถามที่พบบ่อยไล่ชื่อตัวเลือกไว้
for (const f of d.seo?.faqs ?? []) {
  if (f.a?.includes(`${GROUP}:`))
    f.a = f.a.replace(new RegExp(`(${GROUP}:\\s*)([^·]*)`), `$1${opt.choices.map((c) => c.name).join(", ")}`);
}

const left = REMOVE.filter((n) => n !== "ไม่เพิ่ม" && JSON.stringify(d).includes(n));
if (left.length) throw new Error(`ยังเหลือชื่อที่ถอดออกในข้อมูล: ${left.join(" · ")} — ไม่บันทึก`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);

#!/usr/bin/env node
/**
 * 3D Acrylic — ให้ลูกค้าเลือกขนาด "อะคริลิค 2 ชิ้น" จริง ๆ บนแผงสั่งซื้อ
 *
 *   node scripts/3d-acrylic-two-size-picks.mjs           # ดูก่อนว่าจะแก้อะไร (ไม่เขียนจริง)
 *   node scripts/3d-acrylic-two-size-picks.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ตารางราคา: 1 ชุด = อะคริลิค 2 ชิ้น (เลือกขนาดได้) สกรีน 1 ด้าน/ชิ้น — คิดราคาจากชิ้นที่ใหญ่ที่สุด
 * เดิมหน้าเว็บมีดรอปดาวน์ "ขนาด" ช่องเดียว ลูกค้าเลยเลือกได้ชิ้นเดียว จึงแยกเป็น 2 กลุ่ม:
 *   • "ขนาดชิ้นที่ 1" = ชิ้นใหญ่สุด → เป็นตัวคุมราคา (driver ของตารางราคา ชื่อเดิมคือ "ขนาด")
 *   • "ขนาดชิ้นที่ 2" = อีกชิ้น รวมอยู่ในราคาชุดแล้ว (ไม่บวกเพิ่ม)
 * แล้วใส่กฎเงื่อนไขให้ชิ้นที่ 2 เลือกได้ไม่เกินชิ้นที่ 1 — ชิ้นที่ 1 จะเป็นชิ้นใหญ่สุดเสมอ
 * ราคาต่อชุดในตารางไม่เปลี่ยน (คีย์ของ cells คือ "ชื่อตัวเลือก" ไม่ใช่ชื่อกลุ่ม จึงไม่ต้องแก้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "3d-acrylic";
const OLD_LABEL = "ขนาด";
const L1 = "ขนาดชิ้นที่ 1";
const L2 = "ขนาดชิ้นที่ 2";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const log = [];
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;

const size = p.options.find((o) => o.label === OLD_LABEL || o.label === L1);
if (!size) throw new Error("ไม่พบกลุ่มขนาด — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์");
const sizes = size.choices.map((c) => c.name); // 2cm … 6cm (เรียงเล็ก→ใหญ่)

// ── 1) เปลี่ยนชื่อกลุ่มขนาดเดิมเป็น "ขนาดชิ้นที่ 1" (ต้องตามไปเปลี่ยนใน driverLabels ทุกที่ด้วย) ──
if (size.label !== L1) {
  log.push(`เปลี่ยนชื่อกลุ่ม "${size.label}" → "${L1}"`);
  size.label = L1;
  const fix = (m) => {
    if (!m?.driverLabels) return;
    m.driverLabels = m.driverLabels.map((l) => (l === OLD_LABEL ? L1 : l));
  };
  fix(p.pricing);
  for (const r of p.priceRates ?? []) fix(r.pricing);
  log.push(`  ↳ อัปเดต driverLabels ใน pricing + priceRates ${(p.priceRates ?? []).length} เรท`);
}
const note1 = "ชิ้นที่ใหญ่ที่สุดของงาน — ราคาต่อชุดคิดจากชิ้นนี้ (สกรีน 1 ด้าน/ชิ้น)";
if (size.note !== note1) {
  log.push(`ข้อความกำกับกลุ่ม "${L1}": ${note1}`);
  size.note = note1;
}

// ── 2) เพิ่มกลุ่ม "ขนาดชิ้นที่ 2" ต่อท้ายกลุ่มแรก (ไม่บวกเงิน — รวมในราคาชุดแล้ว) ──
if (!p.options.some((o) => o.label === L2)) {
  const g2 = {
    label: L2,
    display: "dropdown",
    note: "อีกชิ้นที่มาประกบกัน รวมอยู่ในราคาชุดแล้ว (ไม่บวกเพิ่ม) — เลือกได้ไม่เกินขนาดชิ้นที่ 1 จะเท่ากันก็ได้",
    choices: sizes.map((n) => ({ name: n })),
  };
  const at = p.options.findIndex((o) => o.label === L1) + 1;
  p.options.splice(at, 0, g2);
  log.push(`เพิ่มกลุ่ม "${L2}" (${sizes.join(" / ")}) ต่อจาก "${L1}"`);
}

// ── 3) กฎ: ชิ้นที่ 2 ต้องไม่ใหญ่กว่าชิ้นที่ 1 (ชิ้นที่ 1 = ชิ้นใหญ่สุดเสมอ ราคาจะได้ไม่เพี้ยน) ──
p.rules = (p.rules ?? []).filter((r) => r.limit?.label !== L2);
const added = [];
sizes.forEach((s, i) => {
  if (i === sizes.length - 1) return; // ใหญ่สุด = เลือกได้ทุกขนาด ไม่ต้องมีกฎ
  const allow = sizes.slice(0, i + 1);
  p.rules.push({ when: { label: L1, choice: s, choices: [s] }, limit: { label: L2, allow } });
  added.push(`${s} → ${allow.join(",")}`);
});
log.push(`กฎจำกัดขนาดชิ้นที่ 2: ${added.join(" · ")}`);

// ── 4) ข้อความที่เคยบอกให้ "เขียนขนาดอีกชิ้นในหมายเหตุ" — ตอนนี้เลือกเองได้แล้ว ──
const swap = (obj, key, from, to) => {
  if (typeof obj?.[key] !== "string" || !obj[key].includes(from)) return;
  obj[key] = obj[key].replace(from, to);
  log.push(`แก้ข้อความ: ${to.slice(0, 70)}…`);
};
const tab = (p.tabs ?? []).find((t) => t.title === "วิธีสั่งงาน");
swap(
  tab,
  "text",
  "• เลือกขนาด (ยึดชิ้นที่ใหญ่ที่สุด) → งานสกรีน → ชนิดอะคริลิค → ใส่จำนวน (นับเป็นชุด ชุดละ 2 ชิ้น) — ชิ้นที่เล็กกว่าเขียนขนาดบอกในช่อง “หมายเหตุถึงร้าน”",
  "• เลือกขนาดชิ้นที่ 1 (ชิ้นใหญ่สุด) → ขนาดชิ้นที่ 2 → งานสกรีน → ชนิดอะคริลิค → ใส่จำนวน (นับเป็นชุด ชุดละ 2 ชิ้น)"
);
const faq = (p.seo?.faqs ?? []).find((f) => f.q === "อะคริลิค 2 ชิ้นเลือกคนละขนาดได้ไหม?");
if (faq) {
  const a =
    "ได้ครับ หน้าสั่งซื้อมีช่องเลือกขนาดให้ 2 ช่อง (ชิ้นที่ 1 และชิ้นที่ 2) เลือกได้ตั้งแต่ 2-6cm " +
    "ไม่ต้องเท่ากัน — ชิ้นที่ 1 คือชิ้นที่ใหญ่ที่สุดและเป็นตัวคิดราคา ส่วนชิ้นที่ 2 รวมอยู่ในราคาชุดแล้ว";
  if (faq.a !== a) {
    faq.a = a;
    log.push("แก้คำตอบ FAQ ‘อะคริลิค 2 ชิ้นเลือกคนละขนาดได้ไหม?’");
  }
}

console.log(log.map((l) => "• " + l).join("\n") || "ไม่มีอะไรต้องแก้");
console.log("\nตัวเลือกหลังแก้:", p.options.map((o) => o.label).join(" | "));
console.log("driverLabels:", p.pricing.driverLabels.join(" │ "));

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}
p.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw upErr;
console.log("\nบันทึกแล้ว ✓");

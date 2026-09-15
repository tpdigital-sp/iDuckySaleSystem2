#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — เพิ่ม "เรทที่ 2 แบบไม่คละดีเทล" (ราคาส่งโรงงาน ขั้นต่ำ 50 พวง · ดีเทลละ 25 พวง)
 * (เจ้าของร้านสั่ง 14 ก.ย. 69 — ก่อนหน้านี้สินค้ามีแค่เรท 1 ทำให้ 50 พวง พวงละ 3 ชิ้น เว็บได้ ฿82
 *  แต่ใบเสนอราคาจริงเป็น ฿77 เพราะใบเสนอราคาใช้เรทส่งที่ 2 ของพวงกุญแจอะคริลิคต้นทาง)
 *
 *   node scripts/multi-charm-rate-2.mjs           # ดูก่อนว่าจะแก้อะไร (dry-run)
 *   node scripts/multi-charm-rate-2.mjs --write   # เขียนลงฐานข้อมูล + อ่านกลับมาเทียบ
 *
 * ทำอะไร:
 *  1. คัดลอกตารางเรท 2 (+ เรท 2 ตัวแทน) จากต้นทาง `keyring-copy-copy` สด ๆ จาก DB
 *     เปลี่ยนชื่อแกนตาราง "ขนาด/งานสกรีน/ประเภทอะคริลิค" → "… ชิ้นที่ 1" (แกนของสินค้านี้)
 *     ป้ายช่วงราคา "ชิ้น" → "พวง" · ตรวจว่าคีย์ช่องราคาตรงกับเรท 1 ของสินค้านี้ทุกช่อง (270 ช่อง)
 *  2. ตั้งชื่อเรทให้เป็นคู่กัน: r1 "เรทที่ 1 แบบคละดีเทล" · r2 "เรทที่ 2 แบบไม่คละดีเทล" (+ "(ตัวแทน)")
 *     (ไม่มีออเดอร์/ใบเสนอราคาอ้างชื่อเรทเดิมของสินค้านี้ — ตรวจแล้ว 14 ก.ย. 69)
 *  3. แก้ข้อความแท็บวิธีคิดราคา + FAQ + คำอธิบาย (ราคาเริ่มต้น) ให้รู้จักเรท 2
 *  4. คำนวณ priceMin/priceMax ใหม่แบบเดียวกับ priceRange (เรท public เท่านั้น) + savedAt
 * ไม่แตะ data.pricing (ตารางเรท 1 ตัวจริง) — เรท 2 เก็บที่ priceRates ที่เดียว ไม่มีปัญหาเงา
 * รันซ้ำได้ — ถ้าทำไปแล้วจะไม่มีอะไรเปลี่ยน · ข้อมูลล้วน ไม่ต้อง deploy โค้ด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const SRC = "keyring-copy-copy";

const R1_LABEL = "เรทที่ 1 แบบคละดีเทล";
const R1_DEALER_LABEL = "เรทที่ 1 แบบคละดีเทล (ตัวแทน)";
const R2_LABEL = "เรทที่ 2 แบบไม่คละดีเทล";
const R2_DEALER_LABEL = "เรทที่ 2 แบบไม่คละดีเทล (ตัวแทน)";
const R2_DESC =
  "ราคาส่งโรงงาน สั่งขั้นต่ำ 50 พวง · คละลาย/คละขนาดได้ ดีเทลละ 25 พวงขึ้นไป (ไม่ถึงคิดตามเรทที่ 1) · ช่วงราคานับจากจำนวนพวงเหมือนเรทที่ 1 · ค่าติ่งห้อย/ตะขอคิดเหมือนเดิม";

/** แกนตารางต้นทาง → แกนของสินค้านี้ (ชุดสเปคของชิ้นที่ 1) */
const DRIVER_MAP = {
  ความหนาอะคริลิค: "ความหนาอะคริลิค",
  ขนาด: "ขนาดชิ้นที่ 1",
  งานสกรีน: "งานสกรีน ชิ้นที่ 1",
  ประเภทอะคริลิค: "ประเภทอะคริลิค ชิ้นที่ 1",
};

/** ข้อความที่ต้องแก้ — คู่ [ของเดิม, ของใหม่] */
const TAB_OLD = "• 1-10 พวงคละอิสระ (ราคาปลีก) · 11 พวงขึ้นไป ดีเทลละ 5 พวงขึ้นไป";
const TAB_NEW =
  "• เรทที่ 1 แบบคละดีเทล: 1-10 พวงคละอิสระ (ราคาปลีก) · 11 พวงขึ้นไป ดีเทลละ 5 พวงขึ้นไป\n" +
  "• เรทที่ 2 แบบไม่คละดีเทล (ราคาส่งโรงงาน): สั่งขั้นต่ำ 50 พวงขึ้นไป · คละลาย/คละขนาดได้ โดยแต่ละดีเทลขั้นต่ำ 25 พวง — ไม่ถึงตามจำนวน คิดตามเรทที่ 1 · ระบบเลือกเรทให้เองตามจำนวนที่สั่ง";
const FAQ_Q = "ราคาขั้นบันไดนับยังไง?";
const FAQ_TAIL = " · สั่ง 50 พวงขึ้นไปแบบไม่คละดีเทล (ดีเทลละ 25 พวง) ระบบเข้าเรทที่ 2 ราคาส่งโรงงานให้เอง";

/** stringify แบบเรียงคีย์ — JSONB ของ Supabase ไม่รักษาลำดับคีย์ เทียบตรง ๆ จะไม่เท่ากันทั้งที่ค่าเดียวกัน */
const canon = (v) =>
  Array.isArray(v)
    ? "[" + v.map(canon).join(",") + "]"
    : v && typeof v === "object"
      ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
      : JSON.stringify(v);

const die = (m) => {
  console.error("✖ " + m);
  process.exit(1);
};

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

const load = async (id) => {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw error;
  return row.data;
};
const p = await load(ID);
const src = await load(SRC);
const before = JSON.stringify(p);
const log = [];

// ── 1) สร้างเรท 2 (+ ตัวแทน) จากต้นทาง ──
const r1 = (p.priceRates ?? []).find((r) => r.id === "r1");
if (!r1) die(`ไม่เจอเรท r1 ใน ${ID}`);
const r1Keys = new Set(Object.keys(r1.pricing.cells));
const srcR2 = (src.priceRates ?? []).find((r) => r.id === "r2" && !r.dealerOnly);
const srcR2D = (src.priceRates ?? []).find((r) => r.id === "r2-dealer" && r.dealerOnly);
if (!srcR2) die(`ไม่เจอเรท r2 ในต้นทาง ${SRC}`);
if (!srcR2D) die(`ไม่เจอเรท r2-dealer ในต้นทาง ${SRC}`);

const convertPricing = (pr, tag) => {
  const driverLabels = pr.driverLabels.map((d) => {
    const to = DRIVER_MAP[d];
    if (!to) die(`${tag}: แกนตาราง "${d}" ไม่มีใน DRIVER_MAP`);
    return to;
  });
  if (driverLabels.join("│") !== r1.pricing.driverLabels.join("│"))
    die(`${tag}: แกนตารางหลังแปลง (${driverLabels.join(" · ")}) ไม่ตรงกับเรท 1 (${r1.pricing.driverLabels.join(" · ")})`);
  const keys = Object.keys(pr.cells);
  const missing = [...r1Keys].filter((k) => !(k in pr.cells));
  const extra = keys.filter((k) => !r1Keys.has(k));
  if (missing.length || extra.length)
    die(`${tag}: คีย์ช่องราคาไม่ตรงเรท 1 — ขาด ${missing.length} (${missing.slice(0, 3).join(" | ")}) · เกิน ${extra.length} (${extra.slice(0, 3).join(" | ")})`);
  const tiers = pr.tiers.map((t) => ({ ...t, label: (t.label ?? "").replace(/ชิ้น/g, "พวง") }));
  const cells = {};
  for (const k of keys) {
    const v = pr.cells[k];
    if (!Array.isArray(v) || v.length !== tiers.length || v.some((n) => typeof n !== "number" || !(n > 0)))
      die(`${tag}: ช่อง "${k}" ค่าผิดรูป ${JSON.stringify(v)} (ต้อง ${tiers.length} ขั้น เป็นเลข > 0)`);
    cells[k] = [...v];
  }
  return { ...pr, unit: "พวง", driverLabels, tiers, cells };
};

const pickRateFields = (r) => {
  // ฟิลด์เงื่อนไขของเรทที่ต้นทางตั้งไว้ ยกมาทั้งชุด (ยกเว้น pricing/label/desc/id ที่ตั้งเอง)
  const { id, label, desc, pricing, imageSrc, ...rest } = r;
  return rest;
};

const r2 = { id: "r2", label: R2_LABEL, desc: R2_DESC, ...pickRateFields(srcR2), pricing: convertPricing(srcR2.pricing, "r2") };
const r2d = {
  id: "r2-dealer",
  label: R2_DEALER_LABEL,
  desc: srcR2D.desc ?? "ราคาตัวแทนจำหน่าย",
  ...pickRateFields(srcR2D),
  dealerOnly: true,
  pricing: convertPricing(srcR2D.pricing, "r2-dealer"),
};
if (r2.minQty !== 50 || r2.minPerDesign !== 25) die(`r2 ต้นทางเงื่อนไขไม่ใช่ที่คาด (minQty ${r2.minQty} · minPerDesign ${r2.minPerDesign})`);
if (r2.dealerOnly) die("r2 ต้องไม่เป็นเรทตัวแทน");

const upsertRate = (rate) => {
  const i = p.priceRates.findIndex((r) => r.id === rate.id);
  if (i < 0) {
    // แทรกต่อจากเรทคู่ของมัน: r2 ต่อจาก r1 · r2-dealer ต่อจาก r1-dealer (ถ้ามี) ไม่งั้นต่อท้าย
    const after = rate.id === "r2" ? "r1" : "r1-dealer";
    const ai = p.priceRates.findIndex((r) => r.id === after);
    if (ai < 0) p.priceRates.push(rate);
    else p.priceRates.splice(ai + 1, 0, rate);
    log.push(`เพิ่มเรท ${rate.id} "${rate.label}" (${Object.keys(rate.pricing.cells).length} ช่อง · ${rate.pricing.tiers.length} ขั้น · minQty ${rate.minQty} · ดีเทลละ ${rate.minPerDesign})`);
  } else if (canon(p.priceRates[i]) !== canon(rate)) {
    p.priceRates[i] = rate;
    log.push(`อัปเดตเรท ${rate.id} ให้ตรงต้นทาง`);
  }
};
upsertRate(r2);
upsertRate(r2d);

// ── 2) ชื่อเรทให้เป็นคู่กัน ──
const rename = (id, label) => {
  const r = p.priceRates.find((x) => x.id === id);
  if (!r) return;
  if (r.label !== label) {
    log.push(`เปลี่ยนชื่อเรท ${id}: "${r.label}" → "${label}"`);
    r.label = label;
  }
};
rename("r1", R1_LABEL);
rename("r1-dealer", R1_DEALER_LABEL);
// เรทตัวแทนต้องอยู่หลังเรท public เสมอ (เรทแรกถูก fallback เป็น pricing หลัก)
if (p.priceRates[0].dealerOnly) die("เรทแรกกลายเป็นเรทตัวแทน");

// ── 3) ข้อความ ──
const tab0 = (p.tabs ?? [])[0];
if (!tab0) die("ไม่เจอแท็บวิธีคิดราคา (tabs[0])");
if (tab0.text.includes(TAB_OLD)) {
  tab0.text = tab0.text.replace(TAB_OLD, TAB_NEW);
  log.push("แท็บวิธีคิดราคา: เพิ่มบรรทัดเรทที่ 1 / เรทที่ 2");
} else if (!tab0.text.includes("เรทที่ 2 แบบไม่คละดีเทล")) die("แท็บวิธีคิดราคาไม่มีบรรทัดเดิมที่จะแทน และยังไม่มีบรรทัดเรท 2");
const faq = (p.seo?.faqs ?? []).find((f) => f.q === FAQ_Q);
if (!faq) die(`ไม่เจอ FAQ "${FAQ_Q}"`);
if (!faq.a.includes("เรทที่ 2")) {
  faq.a = faq.a + FAQ_TAIL;
  log.push(`FAQ "${FAQ_Q}": เพิ่มท้ายเรื่องเรทที่ 2`);
}

// ── 4) ช่วงราคา (แบบเดียวกับ priceRange: เรท public เท่านั้น) + คำอธิบาย ──
const pub = p.priceRates.filter((r) => !r.dealerOnly);
const all = pub.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
const min = Math.min(...all);
const max = Math.max(...all);
if (p.priceMin !== min || p.priceMax !== max) {
  log.push(`ช่วงราคา priceMin/priceMax: ${p.priceMin}/${p.priceMax} → ${min}/${max}`);
  p.priceMin = min;
  p.priceMax = max;
}
const descRe = /เริ่มต้นพวงละ (\d+) บาท/;
const dm = (p.description ?? "").match(descRe);
if (dm && Number(dm[1]) !== min) {
  p.description = p.description.replace(descRe, `เริ่มต้นพวงละ ${min} บาท`);
  log.push(`คำอธิบาย: "เริ่มต้นพวงละ ${dm[1]} บาท" → "เริ่มต้นพวงละ ${min} บาท"`);
}

console.log(log.length ? log.map((l) => "• " + l).join("\n") : "(ไม่มีอะไรต้องแก้)");
if (canon(JSON.parse(before)) === canon(p)) {
  console.log("\nไม่มีอะไรต้องแก้ (ทำไปแล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าจะบันทึกจริง)");
  process.exit(0);
}

p.savedAt = new Date().toISOString();
const { data: upd, error: uerr } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (uerr) throw uerr;
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

// อ่านกลับมาเทียบของจริง (ไม่เชื่อว่าไม่ error = สำเร็จ)
const back = await load(ID);
const bR2 = (back.priceRates ?? []).find((r) => r.id === "r2");
const bR2D = (back.priceRates ?? []).find((r) => r.id === "r2-dealer");
const checks = [
  ["savedAt ตรง", back.savedAt === p.savedAt],
  ["มีเรท r2 ชื่อถูก", bR2?.label === R2_LABEL && !bR2.dealerOnly],
  ["r2 minQty 50 · ดีเทลละ 25", bR2?.minQty === 50 && bR2?.minPerDesign === 25],
  ["r2 ตาราง 270 ช่อง ตรงต้นทางทุกค่า", bR2 && canon(bR2.pricing.cells) === canon(r2.pricing.cells) && Object.keys(bR2.pricing.cells).length === 270],
  ["r2 แกนตาราง = แกนเรท 1", bR2?.pricing.driverLabels.join("│") === r1.pricing.driverLabels.join("│")],
  ["r2 ป้ายช่วงราคาเป็น 'พวง'", bR2?.pricing.tiers.every((t) => /พวง/.test(t.label) && !/ชิ้น/.test(t.label))],
  ["r2 ช่อง 3mm│5cm│สกรีน 1 ด้าน (บน)│อะคริลิคใส ขั้นแรก = 45 (ตามใบเสนอราคา 50 พวง)", bR2?.pricing.cells["3mm│5cm│สกรีน 1 ด้าน (บน)│อะคริลิคใส"]?.[0] === 45],
  ["มีเรท r2-dealer เป็นเรทตัวแทน 270 ช่อง", bR2D?.dealerOnly === true && bR2D.label === R2_DEALER_LABEL && Object.keys(bR2D.pricing.cells).length === 270],
  ["ชื่อเรท r1 เป็นคู่กับ r2", back.priceRates[0].id === "r1" && back.priceRates[0].label === R1_LABEL],
  ["ลำดับเรท r1, r2, r1-dealer, r2-dealer", back.priceRates.map((r) => r.id).join(",") === "r1,r2,r1-dealer,r2-dealer"],
  ["data.pricing (เรท 1 ตัวจริง) ไม่ถูกแตะ", canon(back.pricing) === canon(JSON.parse(before).pricing)],
  ["แท็บวิธีคิดราคามีบรรทัดเรท 2", (back.tabs?.[0]?.text ?? "").includes("เรทที่ 2 แบบไม่คละดีเทล")],
  ["FAQ รู้จักเรท 2", (back.seo?.faqs ?? []).some((f) => f.q === FAQ_Q && f.a.includes("เรทที่ 2"))],
  [`priceMin/priceMax = ${min}/${max}`, back.priceMin === min && back.priceMax === max],
];
let bad = 0;
for (const [name, pass] of checks) {
  console.log(pass ? "✅" : "❌", name);
  if (!pass) bad++;
}
if (bad) die(`อ่านกลับไม่ตรง ${bad} ข้อ — รันซ้ำอีกรอบ (Supabase เคยรับค่าไม่ครบ)`);
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ");

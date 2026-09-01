#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — ชิ้นที่ 2 เป็นต้นไป = "ติ่งห้อย" (ผู้ใช้สั่ง 1 ก.ย. 69)
 *
 *   node scripts/multi-charm-charm-pieces.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-charm-pieces.mjs --write   # เขียนลงฐานข้อมูล
 *
 * 1) เปลี่ยน "ชื่อชุด" ที่โชว์บนหน้าสินค้า: ชิ้นที่ 1 → "ตัวหลัก" · ชิ้นที่ k → "ติ่งห้อย ชิ้นที่ k-1"
 *    (ตั้ง sectionTrim = "ชิ้นที่ k" ให้หัวข้อในกรอบยังตัดเหลือ "ขนาด/ประเภทอะคริลิค/งานสกรีน")
 *    ⚠️ ชื่อกลุ่มจริงไม่เปลี่ยน — ตะกร้า/ออเดอร์/ใบงาน/แกนตารางราคา ยังอ้าง "ขนาดชิ้นที่ 2" เหมือนเดิม
 * 2) ถอดกลุ่มของเสริม "ติ่งห้อย" (และ "การห้อยติ่งห้อย" ที่ขึ้นกับมัน — ไม่มีทางโผล่อีกแล้ว)
 *    ติ่งห้อยจากนี้สั่งผ่านจำนวนชิ้นในพวง คิดราคาตามตารางอะคริลิคของชิ้นนั้น ๆ
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;
const CHARM = "ติ่งห้อย";
const CHARM_HANG = "การห้อยติ่งห้อย";
/** ชื่อชุดที่โชว์ของชิ้นที่ k */
const SECTION = (k) => (k === 1 ? "ตัวหลัก" : `${CHARM} ชิ้นที่ ${k - 1}`);

/** ข้อความที่ต้องแก้เพราะกลุ่มของเสริม "ติ่งห้อย" ไม่มีแล้ว — คู่ [ของเดิม, ของใหม่] */
const TEXT = [
  [
    "เลือกอิสระว่า 1 พวงมีอะคริลิคกี่ชิ้น (2-10 ชิ้น) — แต่ละชิ้นเลือกขนาดเองได้ ราคารวมตามขนาดของทุกชิ้น",
    "เลือกอิสระว่า 1 พวงมีอะคริลิคกี่ชิ้น (2-10 ชิ้น) — **ชิ้นแรกคือตัวหลัก ที่เหลือคือติ่งห้อย** แต่ละชิ้นเลือกขนาด/เนื้อ/งานสกรีนเองได้ ราคารวมตามสเปคของทุกชิ้น",
  ],
  ["เลือกวิธีเรียงชิ้นงานหลักในพวง — ไม่มีค่าใช้จ่ายเพิ่ม", "เลือกวิธีเรียงชิ้นในพวง (ตัวหลัก + ติ่งห้อยทุกชิ้น) — ไม่มีค่าใช้จ่ายเพิ่ม"],
  [
    "• เลือกรูปแบบการห้อยได้ฟรี ทั้งของชิ้นงานหลักและของติ่งห้อย (แยกกันคนละข้อ): ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ แจ้งแอดมินก่อนสั่ง",
    "• ชิ้นแรกในพวงคือตัวหลัก ชิ้นที่เหลือคือติ่งห้อย — ทุกชิ้นเลือกสเปคเองได้ คิดราคาตามตารางเดียวกัน\n• เลือกรูปแบบการห้อยได้ฟรี: ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ แจ้งแอดมินก่อนสั่ง",
  ],
];
/** บรรทัดในแท็บที่ต้องหายไปทั้งบรรทัด (ราคาของเสริมที่ไม่มีตัวเลือกนั้นแล้ว) */
const DROP_LINE = "• ส่วนเสริมติ่งห้อย (มาตรฐาน 2cm):";

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

// ── 1) ชื่อชุดใหม่ ────────────────────────────────────────────────────────────
let renamed = 0;
for (const o of p.options) {
  // ชิ้นที่ 10 ต้องเทียบก่อนชิ้นที่ 1 ไม่งั้น "ขนาดชิ้นที่ 10" จะไปเข้าชุดชิ้นที่ 1 (ไม่ลงท้ายพอดี)
  const k = [...Array(MAX_PIECES)].map((_, i) => MAX_PIECES - i).find((n) => o.label.endsWith(`ชิ้นที่ ${n}`));
  if (!k) continue;
  o.section = SECTION(k);
  o.sectionTrim = `ชิ้นที่ ${k}`; // หัวข้อในกรอบยังเหลือ "ขนาด/ประเภทอะคริลิค/งานสกรีน"
  renamed++;
}
log.push(`ตั้งชื่อชุดใหม่ ${renamed} กลุ่ม — ${SECTION(1)} · ${SECTION(2)} … ${SECTION(MAX_PIECES)}`);

// ── 2) ถอดกลุ่มของเสริมติ่งห้อย + กลุ่มที่ขึ้นกับมัน ──────────────────────────
const before = p.options.length;
p.options = p.options.filter((o) => ![CHARM, CHARM_HANG].includes(o.label));
log.push(
  before === p.options.length
    ? `ไม่มีกลุ่ม "${CHARM}" / "${CHARM_HANG}" อยู่แล้ว`
    : `ถอดกลุ่ม ${before - p.options.length} กลุ่ม: "${CHARM}" · "${CHARM_HANG}" (เหลือ ${p.options.length} กลุ่ม)`
);
/** เงื่อนไข/กฎที่ยังชี้กลุ่มที่ถอดไปแล้ว = ค้างเปล่า ๆ ต้องล้างตาม */
const gone = (label) => [CHARM, CHARM_HANG].includes(label);
for (const o of p.options) {
  if (gone(o.showWhen?.label)) delete o.showWhen;
  for (const key of ["showWhenAll", "showWhenAny"]) {
    if (!o[key]) continue;
    o[key] = o[key].filter((c) => !gone(c.label));
    if (!o[key].length) delete o[key];
  }
}
const rulesBefore = (p.rules || []).length;
if (p.rules) p.rules = p.rules.filter((r) => !gone(r.when?.label) && !gone(r.then?.label) && !gone(r.label));
if (rulesBefore !== (p.rules || []).length) log.push(`ล้างกฎที่ชี้กลุ่มที่ถอดไป ${rulesBefore - p.rules.length} ข้อ`);
for (const key of ["whenAny", "whenAll", "when"]) {
  const w = p.artworkConsult?.[key];
  if (!Array.isArray(w)) continue;
  const n = w.length;
  p.artworkConsult[key] = w.filter((c) => !gone(c.label));
  if (n !== p.artworkConsult[key].length) log.push(`กล่องคุยแอดมิน: ตัดเงื่อนไขที่ชี้ "${CHARM_HANG}" ออก (เหลือ ${p.artworkConsult[key].length} ข้อ)`);
}

// ── 3) ข้อความ ────────────────────────────────────────────────────────────────
/** ไล่แทนข้อความในทุก string ของก้อนสินค้า (ข้อความบางชุดมีขึ้นบรรทัดใหม่ แทนบน JSON ดิบไม่ได้) */
const hits = new Map(TEXT.map(([from]) => [from, 0]));
const walk = (v) => {
  if (typeof v === "string") {
    let out = v;
    for (const [from, to] of TEXT) {
      if (!out.includes(from)) continue;
      hits.set(from, hits.get(from) + out.split(from).length - 1);
      out = out.split(from).join(to);
    }
    return out;
  }
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  return v;
};
const next = walk(p);
for (const [from, n] of hits) if (n) log.push(`แก้ข้อความ ${n} จุด: "${from.slice(0, 42)}…"`);
for (const tab of next.tabs || []) {
  if (typeof tab.text !== "string" || !tab.text.includes(DROP_LINE)) continue;
  tab.text = tab.text
    .split("\n")
    .filter((line) => !line.startsWith(DROP_LINE))
    .join("\n");
  log.push(`ตัดบรรทัดราคาของเสริมติ่งห้อยออกจากแท็บ "${tab.label ?? "-"}"`);
}

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

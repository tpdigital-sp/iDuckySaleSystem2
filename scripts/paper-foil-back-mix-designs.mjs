#!/usr/bin/env node
/**
 * 🔄 Paper Foil — คละลาย/แนบลาย "ด้านหลัง" แยกจากด้านหน้า (แบบเดียวกับกระดาษอาร์ตมัน | PET)
 *
 *   node scripts/paper-foil-back-mix-designs.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-foil-back-mix-designs.mjs --write
 *
 * ผู้ใช้สั่ง 8 ก.ย. 69 บนหน้า Paper-Foil:
 *   1) สั่ง 1 แผ่น A3 พิมพ์ 2 ด้าน ระบุ 1 ลาย แล้วแนบรูปหน้า+หลัง → ระบบนับเป็น "แนบเกิน 1 ลาย"
 *      บังคับเพิ่มเป็น 2 ลาย (เสียค่าคละทั้งที่เป็นลายเดียวหน้า-หลัง)
 *   2) ต้องรู้ว่าลายไหนด้านหน้า ลายไหนด้านหลัง
 *   3) จำนวนรูปงาน 2 ด้านต้องนับด้านหลังด้วย
 * → ตั้ง Product.backDesign เหมือน paper-art-pet: หน้าสินค้าจะแยกช่องแนบ "ด้านหน้า/ด้านหลัง"
 *   จำนวนลายแต่ละด้านนับตามรูปในช่องนั้น และคิดค่าคละด้านหลังแยกอีกชุด (ลายละ 5 บาท ลายแรกไม่คิด)
 *
 * ⚠️ paper-foil ไม่มี mixRule ระดับสินค้า — กติกาคละอยู่บนตัวเลือก "ตัดตามขนาด" / "ไดคัทตามทรง"
 *    (scripts/paper-foil-mix-only-cut.mjs) สคริปต์กลาง paper-back-mix-designs.mjs จึง die
 *    ตัวนี้เช็คที่ตัวเลือกแทน · งาน "ไม่ไดคัท (เต็มแผ่น A3)" ไม่มีช่องคละลายทั้งหน้า/หลังตามเดิม
 *    แต่ยังได้ช่องแนบรูปหน้า/หลังแยกกัน (ช่องแนบแยกตาม backDesign ไม่ได้ผูกกับ mixRule)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "paper-foil";
const NAME = "กระดาษเคลือบฟอยล์";
const SIDES_LABEL = "จำนวนด้านที่พิมพ์";
const TWO_SIDES = "พิมพ์ 2 ด้าน";
const CUT_LABEL = "การตัด";
const CUT_WITH_MIX = ["ตัดตามขนาด", "ไดคัทตามทรง"];

/** กติกาค่าคละของด้านหลัง — ชุดเดียวกับงานกระดาษอีก 5 ตัว (scripts/back-mix-fee-5.mjs) */
const BACK_MIX = { baseFee: 0, includedDesigns: 1, extraFee: 5 };

/** บรรทัด terms — ข้อความเดียวกับงานกระดาษอีก 5 ตัว (เช็คทั้งบรรทัด กันรันซ้ำแล้วซ้อน) */
const TERM_LINE =
  "• พิมพ์ 2 ด้าน คละลายด้านหลังได้ด้วย — คิดค่าคละแยกจากด้านหน้าอีกชุดหนึ่ง ลายละ 5 บาท (ลายแรกไม่คิด · ด้านหลังใช้ลายเดียวกันทั้งหมด = ไม่มีค่าคละ)";
/** บรรทัดในแท็บ "ข้อควรทราบ" ต่อท้ายบรรทัดคละลายเดิม */
const TAB_LINE =
  "• พิมพ์ 2 ด้าน แนบลายแยกช่อง “ด้านหน้า” / “ด้านหลัง” — จำนวนลายแต่ละด้านนับตามรูปในช่องนั้น · คละลายด้านหลังคิดแยกอีกชุด ลายละ 5 บาท (ลายแรกไม่คิด · ด้านหลังลายเดียวกันทั้งหมด = ไม่มีค่าคละ)";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== NAME) die(`${ID}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);

const d = structuredClone(row.data);

// กลุ่ม "จำนวนด้านที่พิมพ์" + ตัวเลือก "พิมพ์ 2 ด้าน" ต้องมีจริง ไม่งั้นเงื่อนไขไม่มีวันเข้า
const sides = (d.options ?? []).find((o) => o.label === SIDES_LABEL);
if (!sides) die(`ไม่มีกลุ่ม "${SIDES_LABEL}"`);
if (!(sides.choices ?? []).some((c) => c.name === TWO_SIDES)) die(`กลุ่ม "${SIDES_LABEL}" ไม่มีตัวเลือก "${TWO_SIDES}"`);
// กติกาคละด้านหน้าอยู่บนตัวเลือกการตัด — ต้องมีอยู่จริงอย่างน้อย 1 ตัว
const cut = (d.options ?? []).find((o) => o.label === CUT_LABEL);
if (!cut) die(`ไม่มีกลุ่ม "${CUT_LABEL}"`);
const withMix = (cut.choices ?? []).filter((c) => CUT_WITH_MIX.includes(c.name) && c.mixRule).map((c) => c.name);
if (!withMix.length) die(`ตัวเลือก ${CUT_WITH_MIX.join("/")} ยังไม่มี mixRule (รัน scripts/paper-foil-mix-only-cut.mjs ก่อน)`);

const before = JSON.stringify(d.backDesign ?? null);
d.backDesign = { label: SIDES_LABEL, choices: [TWO_SIDES], mixRule: { ...BACK_MIX } };

// terms — ต่อท้ายบรรทัดเดียว
const terms = typeof d.terms === "string" ? d.terms : "";
const addTerm = !terms.includes(TERM_LINE);
if (addTerm) d.terms = terms.trim() ? `${terms.replace(/\n+$/, "")}\n${TERM_LINE}` : TERM_LINE;

// แท็บ "ข้อควรทราบ" — แทรกใต้บรรทัดคละลายเดิม (ไม่มีแท็บ/บรรทัดนั้น = ต่อท้าย)
let addTab = false;
d.tabs = (d.tabs ?? []).map((t) => {
  if (t.title !== "ข้อควรทราบ" || typeof t.text !== "string" || t.text.includes(TAB_LINE)) return t;
  addTab = true;
  const lines = t.text.split("\n");
  const at = lines.findIndex((l) => /คละลาย/.test(l));
  if (at >= 0) lines.splice(at + 1, 0, TAB_LINE);
  else lines.push(TAB_LINE);
  return { ...t, text: lines.join("\n") };
});

// ให้ savedAt ขยับ — หน้าเว็บใช้ทำ cache-bust รูป และให้รู้ว่าแก้ล่าสุดเมื่อไร
d.savedAt = new Date().toISOString();

console.log(`${WRITE ? "เขียน" : "ดูก่อน"} · ${ID} (${row.name})`);
console.log(`  backDesign ${before} → ${JSON.stringify(d.backDesign)}`);
console.log(`  กติกาคละด้านหน้าอยู่บนตัวเลือก: ${withMix.join(", ")}`);
console.log(`  terms: ${addTerm ? "+1 บรรทัด" : "มีอยู่แล้ว"} · แท็บข้อควรทราบ: ${addTab ? "+1 บรรทัด" : "มีอยู่แล้ว/ไม่มีแท็บ"}`);

if (WRITE) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(`.backup-paperfoil-backmix-${stamp}.json`, JSON.stringify(row, null, 2));
  const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
  if (e2) die(e2.message);
  if (!upd?.length) die("update โดน 0 แถว — ไม่มีอะไรถูกเขียน");
  // อ่านกลับมาเทียบของจริง — update ไม่ error ไม่ได้แปลว่าลง (เคยเจอกับ sticker-uv)
  const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
  if (e3) die(e3.message);
  const bd = back?.data?.backDesign;
  const ok =
    bd?.label === SIDES_LABEL &&
    Array.isArray(bd?.choices) &&
    bd.choices[0] === TWO_SIDES &&
    bd?.mixRule?.extraFee === BACK_MIX.extraFee &&
    bd?.mixRule?.includedDesigns === BACK_MIX.includedDesigns &&
    back?.data?.savedAt === d.savedAt &&
    typeof back?.data?.terms === "string" &&
    back.data.terms.includes(TERM_LINE);
  if (!ok) die(`อ่านกลับแล้วไม่ตรง: backDesign=${JSON.stringify(bd)} savedAt=${back?.data?.savedAt}`);
  console.log(`✓ เขียนแล้ว อ่านกลับตรง · สำรองของเดิมไว้ที่ .backup-paperfoil-backmix-${stamp}.json`);
} else {
  console.log("— ยังไม่ได้เขียน (ใส่ --write)");
}

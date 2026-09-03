#!/usr/bin/env node
/**
 * Shoulder Bag (shoulder-bag) — เพิ่ม 2 กลุ่มตัวเลือกงานปัก ให้เหมือนสินค้างานปักตัวอื่นของร้าน
 *
 *   node scripts/shoulder-bag-thread-font.mjs            (ดูก่อนว่าจะเปลี่ยนอะไร ไม่เขียน DB)
 *   node scripts/shoulder-bag-thread-font.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * ที่มาของตัวเลือก (ใช้ URL รูปร่วมกัน ไม่สร้างรูปใหม่ — ต้นทางเปลี่ยนรูปแล้วเปลี่ยนตามทันที):
 *   สีไหม 80 เบอร์ + ชาร์ตสีเต็ม           ← products.armpatch-1 (อาร์มปัก)
 *   ฟอนต์ 26 แบบ (E1-E11 อังกฤษ · T1-T15 ไทย) + ชาร์ตฟอนต์ ← products.new-mt2saszv-9863 (DOLL SEWING)
 *   แถบ "ไม่มีตัวอักษร"                    ← products.crossbody-bag (วาดไว้แล้วที่ crossbody-bag-no-text-strip.mjs)
 *
 * ทรงกลุ่มสีไหมยึดตาม clothbag-4 (ไม่ใช่ crossbody-bag) เพราะกระเป๋าใบนี้ยังมีกลุ่มเดิม
 * "สีไหมไม่เกิน 3  สี" (ช่องกรอกจำนวนสีที่เกิน ฿10/สี) อยู่ — กลุ่มสวอตช์ใหม่จึง **ห้ามใส่ extra**
 * ไม่งั้นค่าสีเกินโดนบวกสองรอบ · ค่าสีเกินยังคิดที่กลุ่มเดิมที่เดียวเหมือนเดิม
 *
 * กลุ่มฟอนต์เติมตัวเลือกแรก "ไม่มีตัวอักษร (ปักเฉพาะลาย)" (ชุดของตุ๊กตาไม่มี เพราะบังคับปักชื่อเสมอ)
 * — จำเป็น เพราะกลุ่มเลือกอย่างเดียวเริ่มต้นที่ choices[0] (ProductDetail:366)
 *   ถ้าไม่มี ออเดอร์ที่ปักแค่โลโก้จะติดฟอนต์ "E1 (อังกฤษ)" ไปเงียบ ๆ
 *
 * ⚠️ เขียน DB ตรงผ่าน supabase-js = ไม่ผ่าน API เลยไม่มี snapshot ใน product_revisions
 *    จึง dump ของเดิมลง .cache/shoulder-bag/before-*.json ทุกครั้งก่อนเขียน (ดู iducky-option-group-loss-guard)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "shoulder-bag";
const THREAD_FROM = "armpatch-1";
const FONT_FROM = "new-mt2saszv-9863";
const NONE_FROM = "crossbody-bag";

const THREAD_LABEL = "สีไหมเย็บชิ้นงาน";
const FONT_LABEL = "ฟอนต์ตัวปัก";
const OVER_LABEL = "สีไหมไม่เกิน 3  สี"; // ชื่อจริงใน DB มีเว้นวรรค 2 เคาะ — กลุ่มค่าสีเกิน ฿10/สี
const NO_TEXT = "ไม่มีตัวอักษร (ปักเฉพาะลาย)";
const THREAD_MAX = 3;
const EXTRA_PER_COLOR = 10;
const CACHE = ".cache/shoulder-bag";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* ── 1. อ่านสินค้าปลายทาง + ต้นทางทั้ง 3 ตัว ─────────────────────────── */
const { data: rows, error: readErr } = await sb.from("products").select("id,data").in("id", [PRODUCT_ID, THREAD_FROM, FONT_FROM, NONE_FROM]);
if (readErr) { console.error(readErr); process.exit(1); }
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const row = byId[PRODUCT_ID];
if (!row) { console.error("ไม่เจอสินค้า", PRODUCT_ID); process.exit(1); }
const data = row.data;

const srcThread = (byId[THREAD_FROM]?.data.options ?? []).find((o) => o.swatchGrid);
const srcFont = (byId[FONT_FROM]?.data.options ?? []).find((o) => o.label === FONT_LABEL);
const srcNone = (byId[NONE_FROM]?.data.options ?? []).find((o) => o.sampleGrid)?.choices?.find((c) => c.name === NO_TEXT);
if (!srcThread?.chartSrc || (srcThread.choices ?? []).length < 50) { console.error(`กลุ่มสีไหมของ ${THREAD_FROM} หน้าตาไม่ตรงคาด — โครงต้นทางเปลี่ยน ตรวจก่อน`); process.exit(1); }
if (!srcFont?.chartSrc || (srcFont.choices ?? []).length < 20) { console.error(`กลุ่มฟอนต์ของ ${FONT_FROM} หน้าตาไม่ตรงคาด`); process.exit(1); }
if (!srcNone?.imageSrc) { console.error(`ไม่เจอแถบ "${NO_TEXT}" ใน ${NONE_FROM}`); process.exit(1); }

/* ── 2. ประกอบกลุ่มใหม่ ─────────────────────────────────────────────── */
const threadGroup = {
  label: THREAD_LABEL,
  display: "multi",
  swatchGrid: true,
  chartSrc: srcThread.chartSrc,
  note:
    `ไหมปัก Madeira โพลีเอสเตอร์ 100% — **ปักได้ไม่เกิน ${THREAD_MAX} สีไหม รวมในราคาแล้ว** · ` +
    `เกิน ${THREAD_MAX} สี คิดเพิ่มสีละ ฿${EXTRA_PER_COLOR} ต่อใบ (ใส่จำนวนสีที่เกินในกลุ่ม “สีไหมไม่เกิน ${THREAD_MAX} สี” ด้านล่าง) · ` +
    `แตะสีเพื่อดูตัวอย่างใหญ่ หรือกดดูชาร์ตสีเต็มทุกเบอร์ · ไม่เลือกก็ได้ — ทางร้านจับคู่สีให้เข้ากับลายและสีกระเป๋า`,
  // ไม่ใส่ extra ต่อสี — ค่าสีเกินคิดที่กลุ่ม "สีไหมไม่เกิน 3  สี" อยู่แล้ว ใส่ตรงนี้ด้วยจะบวกซ้ำ
  choices: srcThread.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
};

const fontGroup = {
  label: FONT_LABEL,
  display: "dropdown",
  sampleGrid: true,
  chartSrc: srcFont.chartSrc,
  note:
    "แตะเลือกจากตัวอย่างลายมือจริงได้เลย — **E1-E11 เป็นฟอนต์อังกฤษ · T1-T15 เป็นฟอนต์ไทย** · " +
    "ปักเฉพาะลาย/โลโก้ ไม่มีข้อความ ให้เลือก “ไม่มีตัวอักษร” · ข้อความที่ต้องการปักบอกในช่องหมายเหตุถึงร้าน",
  choices: [{ name: NO_TEXT, imageSrc: srcNone.imageSrc }, ...srcFont.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc }))],
};

/* ── 3. วางลำดับกลุ่ม: ...ขนาดปัก → ฟอนต์ → สีไหม(สวอตช์) → สีไหมไม่เกิน 3 สี ── */
const before = data.options ?? [];
const at = before.findIndex((o) => o.label === OVER_LABEL);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${OVER_LABEL}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
const kept = before.filter((o) => o.label !== THREAD_LABEL && o.label !== FONT_LABEL); // รันซ้ำ = ไม่งอกกลุ่มซ้ำ
const pos = kept.findIndex((o) => o.label === OVER_LABEL);
const options = [...kept.slice(0, pos), fontGroup, threadGroup, ...kept.slice(pos)];

console.log("กลุ่มก่อนแก้ :", before.map((o) => `${o.label} (${o.choices?.length ?? 0})`).join("  ·  "));
console.log("กลุ่มหลังแก้:", options.map((o) => `${o.label} (${o.choices?.length ?? 0})`).join("  ·  "));
console.log(`\nสีไหม ${threadGroup.choices.length} เบอร์ · ฟอนต์ ${fontGroup.choices.length} ตัวเลือก (รวม "${NO_TEXT}")`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

/* ── 4. สำรองของเดิม แล้วเขียน + อ่านกลับเทียบ ───────────────────────── */
mkdirSync(CACHE, { recursive: true });
const backup = `${CACHE}/before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(row.data, null, 2));
console.log("สำรองของเดิมไว้ที่", backup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const th = got.find((o) => o.label === THREAD_LABEL);
const fo = got.find((o) => o.label === FONT_LABEL);
const lost = before.filter((o) => !got.some((n) => n.label === o.label));
const fails = [
  [got.length === options.length, `จำนวนกลุ่มไม่ตรง (${got.length} ≠ ${options.length})`],
  [!lost.length, `กลุ่มเดิมหายไป: ${lost.map((o) => o.label).join(", ")}`],
  [th?.choices?.length === srcThread.choices.length && th?.swatchGrid === true && th?.chartSrc === srcThread.chartSrc, "กลุ่มสีไหมไม่ครบ"],
  [th?.choices?.every((c) => c.imageSrc && c.extra === undefined), "ชิปสีไหมขาดรูป หรือมี extra ติดมา (จะบวกซ้ำกับกลุ่มค่าสีเกิน)"],
  [fo?.choices?.length === srcFont.choices.length + 1 && fo?.sampleGrid === true, "กลุ่มฟอนต์ไม่ครบ"],
  [fo?.choices?.[0]?.name === NO_TEXT && !!fo?.choices?.[0]?.imageSrc, "ตัวเลือก “ไม่มีตัวอักษร” ไม่ได้อยู่ตัวแรก/ไม่มีแถบตัวอย่าง"],
  [got.find((o) => o.label === OVER_LABEL)?.choices?.[0]?.extra === EXTRA_PER_COLOR, "กลุ่มค่าสีเกินเพี้ยน"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);

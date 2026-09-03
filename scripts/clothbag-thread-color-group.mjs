#!/usr/bin/env node
/**
 * เพิ่มกลุ่ม "สีไหมเย็บชิ้นงาน" ให้ "กระเป๋าผ้าแคนวาส งานปัก" (clothbag-4)
 * ทรงเดียวกับกลุ่มสีไหมของ DOLL SEWING (new-mt2saszv-9863) — swatchGrid 80 เบอร์ Madeira
 *
 *   node scripts/clothbag-thread-color-group.mjs            (พรีวิว ไม่เขียน DB)
 *   node scripts/clothbag-thread-color-group.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * ต้นทางรูปสวอตช์ + ชาร์ตสีเต็ม = products/armpatch-1 (ใช้ URL ร่วม แบบเดียวกับที่ DOLL SEWING ทำ)
 * — armpatch เปลี่ยนรูปเมื่อไหร่ สินค้านี้เปลี่ยนตาม ไม่ต้องอัปซ้ำ
 *
 * ต่างจาก DOLL SEWING ตรง "note" อย่างเดียว: กระเป๋าใบนี้เกิน 3 สีคิดเพิ่มสีละ ฿10 ต่อแบบ
 * (ตัวเลขมาจากกลุ่มเดิม "สีไหมไม่เกิน 3  สี" extra 10 + terms ในสินค้า) ส่วนตุ๊กตาไม่คิดเพิ่ม
 * กลุ่มใหม่นี้ "ไม่มี extra" — ค่าสีเกินยังคิดที่กลุ่มเดิมเหมือนเดิม จะได้ไม่บวกซ้ำ
 *
 * ⚠️ สคริปต์เขียน DB ตรงผ่าน supabase-js = ไม่ผ่าน API เลยไม่มี snapshot ใน product_revisions
 *    จึง dump ของเดิมลง .cache/clothbag-4/before-*.json ทุกครั้งก่อนเขียน (ดู iducky-option-group-loss-guard)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "clothbag-4";
const ARMPATCH_ID = "armpatch-1"; // ต้นทางกลุ่มสีไหม Madeira 80 เบอร์
const GROUP = "สีไหมเย็บชิ้นงาน";
const BEFORE_GROUP = "สีไหมไม่เกิน 3  สี"; // กลุ่มค่าสีเกิน (ชื่อมีเว้นวรรค 2 เคาะจริง ๆ ใน DB) — แทรกกลุ่มใหม่ไว้ก่อนหน้า
const THREAD_MAX = 3;
const EXTRA_PER_COLOR = 10;
const CACHE = ".cache/clothbag-4";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* ── 1. อ่านกลุ่มสีไหมต้นทางจากอาร์มปัก + ตรวจว่าโครงยังเป็นทรงเดิม ── */
const { data: apRow, error: apErr } = await sb.from("products").select("data").eq("id", ARMPATCH_ID).single();
if (apErr) { console.error(`อ่านสินค้าอาร์มปัก ${ARMPATCH_ID} ไม่ได้:`, apErr.message); process.exit(1); }
const apThread = (apRow.data.options ?? []).find((o) => o.swatchGrid);
if (!apThread || !apThread.chartSrc || (apThread.choices ?? []).length < 50) {
  console.error(`กลุ่มสีไหม swatchGrid ของ ${ARMPATCH_ID} หน้าตาไม่ตรงคาด — โครงต้นทางเปลี่ยน ตรวจก่อน`);
  process.exit(1);
}

const threadGroup = {
  label: GROUP,
  display: "multi",
  swatchGrid: true,
  chartSrc: apThread.chartSrc,
  note:
    `ไหมปัก Madeira โพลีเอสเตอร์ 100% — **ปักได้ไม่เกิน ${THREAD_MAX} สีไหม รวมในราคาแล้ว** · ` +
    `เกิน ${THREAD_MAX} สี คิดเพิ่มสีละ ฿${EXTRA_PER_COLOR} ต่อแบบ (ใส่จำนวนสีที่เกินในกลุ่ม “สีไหมไม่เกิน ${THREAD_MAX} สี” ด้านล่าง) · ` +
    `แตะสีเพื่อดูตัวอย่างใหญ่ หรือกดดูชาร์ตสีเต็มทุกเบอร์ · ไม่เลือกก็ได้ — ทางร้านจับคู่สีให้เข้ากับลายและสีกระเป๋า`,
  // ไม่ใส่ extra ต่อสี — ค่าสีเกิน 3 คิดที่กลุ่มเดิมอยู่แล้ว ใส่ตรงนี้ด้วยจะบวกซ้ำ
  choices: apThread.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
};
console.log(`🧵 สีไหมจาก ${ARMPATCH_ID}: ${threadGroup.choices.length} เบอร์ · ชาร์ต ${threadGroup.chartSrc.split("/").pop()}`);

/* ── 2. อ่านสินค้าปลายทาง + แทรกกลุ่ม ── */
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) {
  options[at] = threadGroup; // รันซ้ำ = ทับกลุ่มเดิมที่เดิม (ไม่งอกซ้ำ)
  console.log(`↻ มีกลุ่ม "${GROUP}" อยู่แล้วที่ลำดับ ${at + 1} — เขียนทับ`);
} else {
  const before = options.findIndex((o) => o.label === BEFORE_GROUP);
  const pos = before >= 0 ? before : options.length; // ไม่เจอกลุ่มค่าสีเกิน = ต่อท้าย
  options.splice(pos, 0, threadGroup);
  console.log(`＋ แทรกกลุ่ม "${GROUP}" ที่ลำดับ ${pos + 1} จาก ${options.length} กลุ่ม`);
}
data.options = options;
console.log("ลำดับกลุ่มตัวเลือกหลังแก้:", options.map((o) => o.label).join(" · "));

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

/* ── 3. dump ของเดิม แล้วเขียน + อ่านกลับเทียบ ── */
mkdirSync(CACHE, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${CACHE}/before-${stamp}.json`;
writeFileSync(backup, JSON.stringify(row.data, null, 2));
console.log("สำรองของเดิมไว้ที่", backup);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = (back.data.options ?? []).find((o) => o.label === GROUP);
if (!got || got.choices.length !== threadGroup.choices.length || got.chartSrc !== threadGroup.chartSrc || !got.swatchGrid) {
  console.error("อ่านกลับไม่ตรง!", got && { n: got.choices?.length, chart: got.chartSrc, swatch: got.swatchGrid });
  process.exit(1);
}
const lost = (row.data.options ?? []).filter((o) => !(back.data.options ?? []).some((n) => n.label === o.label));
if (lost.length) { console.error("⚠️ กลุ่มเดิมหายไป:", lost.map((o) => o.label)); process.exit(1); }
console.log(`✓ เพิ่มกลุ่ม "${GROUP}" ${got.choices.length} เบอร์ · กลุ่มเดิมอยู่ครบ ${back.data.options.length} กลุ่ม · savedAt =`, back.data.savedAt);

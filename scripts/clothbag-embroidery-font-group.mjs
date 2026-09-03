#!/usr/bin/env node
/**
 * เพิ่มกลุ่ม "ฟอนต์ตัวปัก" ให้ "กระเป๋าผ้าแคนวาส งานปัก" (clothbag-4)
 * ทรงเดียวกับกลุ่มฟอนต์ของ DOLL SEWING (new-mt2saszv-9863) — sampleGrid แถบตัวอย่างลายมือจริง 26 แบบ
 *
 *   node scripts/clothbag-embroidery-font-group.mjs            (พรีวิว ไม่เขียน DB)
 *   node scripts/clothbag-embroidery-font-group.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * ต้นทางแถบตัวอย่าง + ชาร์ตเต็ม = products/new-mt2saszv-9863 (ครอปจากชาร์ต YOUR CHOICE ไว้แล้วตอนสร้างตุ๊กตา)
 * — ใช้ URL ร่วมแบบเดียวกับที่ตุ๊กตายืมสีไหมจาก armpatch-1 ไม่ต้อง mount ไดรฟ์ ไม่ต้องครอปซ้ำ
 *   ถ้าจะแยกไฟล์เป็นของตัวเอง ต้องรัน doll-sewing-build.mts ใหม่ (ต้องต่อ /Volumes/iDuckyShop)
 *
 * ต่างจาก DOLL SEWING ตรง note อย่างเดียว: ตุ๊กตามีกลุ่ม "ข้อความปักชื่อ" ให้พิมพ์ข้อความ
 * แต่กระเป๋าใบนี้ยังไม่มี — note เลยชี้ให้พิมพ์ข้อความที่ช่อง "หมายเหตุถึงร้าน" แทน
 *
 * ⚠️ เขียน DB ตรงผ่าน supabase-js = ไม่มี snapshot ใน product_revisions
 *    จึง dump ของเดิมลง .cache/clothbag-4/before-*.json ก่อนเขียนทุกครั้ง (ดู iducky-option-group-loss-guard)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "clothbag-4";
const DOLL_ID = "new-mt2saszv-9863"; // ต้นทางกลุ่มฟอนต์ (sampleGrid 26 แบบ + chartSrc)
const GROUP = "ฟอนต์ตัวปัก";
const BEFORE_GROUP = "สีไหมเย็บชิ้นงาน"; // วางฟอนต์ไว้ติดกับสีไหม — เป็นเรื่องงานปักเหมือนกัน
const CACHE = ".cache/clothbag-4";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* ── 1. อ่านกลุ่มฟอนต์ต้นทาง + ตรวจว่าโครงยังเป็นทรงเดิม ── */
const { data: dollRow, error: dollErr } = await sb.from("products").select("data").eq("id", DOLL_ID).single();
if (dollErr) { console.error(`อ่านสินค้าตุ๊กตา ${DOLL_ID} ไม่ได้:`, dollErr.message); process.exit(1); }
const src = (dollRow.data.options ?? []).find((o) => o.sampleGrid);
if (!src || !src.chartSrc || (src.choices ?? []).length < 20) {
  console.error(`กลุ่มฟอนต์ sampleGrid ของ ${DOLL_ID} หน้าตาไม่ตรงคาด — โครงต้นทางเปลี่ยน ตรวจก่อน`);
  process.exit(1);
}
const missing = (src.choices ?? []).filter((c) => !c.imageSrc);
if (missing.length) { console.error("ตัวเลือกฟอนต์ไม่มีรูปแถบตัวอย่าง:", missing.map((c) => c.name)); process.exit(1); }

const fontGroup = {
  label: GROUP,
  display: "dropdown", // sampleGrid ทับค่านี้บนหน้าร้านอยู่แล้ว (เก็บไว้ให้เหมือนต้นทาง)
  sampleGrid: true,
  chartSrc: src.chartSrc,
  note:
    "แตะเลือกจากตัวอย่างลายมือจริงได้เลย — **E1-E11 เป็นฟอนต์อังกฤษ · T1-T15 เป็นฟอนต์ไทย** · " +
    "แถบใต้ตารางคือตัวอย่างเต็มประโยคของแบบที่เลือกอยู่ · " +
    "ข้อความที่อยากให้ปักพิมพ์ไว้ในช่อง “หมายเหตุถึงร้าน” ด้านล่างได้เลย",
  choices: src.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
};
const en = fontGroup.choices.filter((c) => c.name.startsWith("E")).length;
console.log(`✍️  ฟอนต์จาก ${DOLL_ID}: ${fontGroup.choices.length} แบบ (อังกฤษ ${en} · ไทย ${fontGroup.choices.length - en}) · ชาร์ต ${fontGroup.chartSrc.split("/").pop()}`);

/* ── 2. อ่านสินค้าปลายทาง + แทรกกลุ่ม ── */
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) {
  options[at] = fontGroup; // รันซ้ำ = ทับกลุ่มเดิมที่เดิม (ไม่งอกซ้ำ)
  console.log(`↻ มีกลุ่ม "${GROUP}" อยู่แล้วที่ลำดับ ${at + 1} — เขียนทับ`);
} else {
  const before = options.findIndex((o) => o.label === BEFORE_GROUP);
  const pos = before >= 0 ? before : options.length;
  options.splice(pos, 0, fontGroup);
  console.log(`＋ แทรกกลุ่ม "${GROUP}" ที่ลำดับ ${pos + 1} จาก ${options.length} กลุ่ม`);
}
data.options = options;
console.log("ลำดับกลุ่มตัวเลือกหลังแก้:", options.map((o) => o.label).join(" · "));

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

/* ── 3. dump ของเดิม แล้วเขียน + อ่านกลับเทียบ ── */
mkdirSync(CACHE, { recursive: true });
const backup = `${CACHE}/before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(row.data, null, 2));
console.log("สำรองของเดิมไว้ที่", backup);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = (back.data.options ?? []).find((o) => o.label === GROUP);
if (!got || got.choices.length !== fontGroup.choices.length || got.chartSrc !== fontGroup.chartSrc || !got.sampleGrid) {
  console.error("อ่านกลับไม่ตรง!", got && { n: got.choices?.length, chart: got.chartSrc, sample: got.sampleGrid });
  process.exit(1);
}
const lost = (row.data.options ?? []).filter((o) => !(back.data.options ?? []).some((n) => n.label === o.label));
if (lost.length) { console.error("⚠️ กลุ่มเดิมหายไป:", lost.map((o) => o.label)); process.exit(1); }
console.log(`✓ เพิ่มกลุ่ม "${GROUP}" ${got.choices.length} แบบ · กลุ่มเดิมอยู่ครบ ${back.data.options.length} กลุ่ม · savedAt =`, back.data.savedAt);

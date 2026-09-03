#!/usr/bin/env node
/**
 * Crossbody Bag (crossbody-bag) — เพิ่มกลุ่ม "สีไหมปัก" (สวอตช์ 80 เบอร์) และ "ฟอนต์ตัวปัก" (26 แบบ)
 * ให้เหมือนสินค้างานปักตัวอื่นของร้าน
 *
 *   node scripts/crossbody-bag-thread-font.mjs            (ดูก่อนว่าจะเปลี่ยนอะไร ไม่เขียน DB)
 *   node scripts/crossbody-bag-thread-font.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * ที่มาของตัวเลือก (ก๊อปชุดเดียวกัน ไม่สร้างรูปใหม่ — รูปชิปสี/แถบฟอนต์โฮสต์ไว้แล้ว):
 *   สีไหม 80 เบอร์ + ชาร์ตสีเต็ม ← products.armpatch-1 (อาร์มปัก)
 *   ฟอนต์ 26 แบบ (E1-E11 อังกฤษ · T1-T15 ไทย) + ชาร์ตฟอนต์ ← products.new-mt2saszv-9863 (DOLL SEWING)
 *
 * ⚠️ กลุ่มเดิม "สีไหมไม่เกิน 3  สี" (ช่องกรอกจำนวนสีที่เกิน ฿10/สี) ถูก "แทนที่" ด้วยกลุ่มสวอตช์
 *    ไม่ใช่เพิ่มซ้อน — ไม่งั้นลูกค้าโดนคิดค่าสีเกินสองรอบ
 *    คิดเงินเท่าเดิมทุกบาท: freeFirstN 3 (3 สีแรกรวมในราคา) + choice.extra 10 ต่อสีที่เกิน
 *    และไม่ตั้ง extraPerDesign เหมือนกลุ่มเดิม → ตัวคูณต่อจำนวนชิ้นคงเดิม
 *
 * ฟอนต์เป็นกลุ่ม "ไม่บังคับ" — เติมตัวเลือกแรก "ไม่มีตัวอักษร (ปักเฉพาะลาย)" เข้าไป
 * เพราะลูกค้าส่วนใหญ่ปักโลโก้/ลาย ไม่ได้ปักข้อความ (ชุดต้นทางของตุ๊กตาบังคับเลือกเสมอ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "crossbody-bag";
const THREAD_FROM = "armpatch-1";
const FONT_FROM = "new-mt2saszv-9863";
const OLD_THREAD_LABEL = "สีไหมไม่เกิน 3  สี"; // (สองช่องว่างตามที่เก็บใน DB จริง)
const THREAD_LABEL = "สีไหมปัก (รวมในราคา 3 สี · สีที่ 4 ขึ้นไป +฿10/สี)";
const FONT_LABEL = "ฟอนต์ตัวปัก (ถ้ามีข้อความ)";
const NO_TEXT = "ไม่มีตัวอักษร (ปักเฉพาะลาย)";

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

const { data: rows, error: readErr } = await sb
  .from("products")
  .select("id,data")
  .in("id", [PRODUCT_ID, THREAD_FROM, FONT_FROM]);
if (readErr) { console.error(readErr); process.exit(1); }
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const data = byId[PRODUCT_ID]?.data;
if (!data) { console.error("ไม่เจอสินค้า", PRODUCT_ID); process.exit(1); }

const srcThread = byId[THREAD_FROM].data.options.find((o) => /^สีไหม Madeira/.test(o.label));
// การ์ดอธิบายกติกา "นับ 3 สี" ที่วาดไว้ใน crossbody-bag-option-art.mjs — ยกมาไว้กับกลุ่มใหม่ต่อ
const oldNoteImg = (data.options ?? []).find((o) => o.label === OLD_THREAD_LABEL)?.noteImageSrc;
const srcFont = byId[FONT_FROM].data.options.find((o) => o.label === "ฟอนต์ตัวปัก");
if (!srcThread || !srcFont) { console.error("ไม่เจอกลุ่มต้นทาง"); process.exit(1); }

// ── กลุ่มสีไหม: สวอตช์ 80 เบอร์ · 3 สีแรกฟรี · เกินสีละ ฿10 ────────────
const threadGroup = {
  label: THREAD_LABEL,
  display: "multi",
  swatchGrid: true,
  chartSrc: srcThread.chartSrc,
  freeFirstN: 3,
  note:
    "ไหมปัก Madeira โพลีเอสเตอร์ 100% — **3 สีแรกรวมในราคาแล้ว สีที่ 4 ขึ้นไปคิดเพิ่มสีละ ฿10** · " +
    "แตะสีเพื่อดูตัวอย่างใหญ่ หรือกดดูชาร์ตสีเต็มทุกเบอร์ · ไม่เลือกก็ได้ — แจ้งโทนที่ต้องการมา ทางร้านจับคู่สีให้",
  ...(oldNoteImg ? { noteImageSrc: oldNoteImg } : {}),
  choices: srcThread.choices.map((c) => ({ name: c.name, extra: 10, imageSrc: c.imageSrc })),
};

// ── กลุ่มฟอนต์: แถบตัวอย่าง 26 แบบ + ตัวเลือก "ไม่มีตัวอักษร" ─────────
const fontGroup = {
  label: FONT_LABEL,
  display: "dropdown",
  sampleGrid: true,
  chartSrc: srcFont.chartSrc,
  note:
    "แตะเลือกจากตัวอย่างลายมือจริงได้เลย — **E1-E11 เป็นฟอนต์อังกฤษ · T1-T15 เป็นฟอนต์ไทย** · " +
    "ปักเฉพาะลายไม่มีข้อความ ให้เลือก “ไม่มีตัวอักษร” · ข้อความที่ต้องการพิมพ์บอกในช่องหมายเหตุถึงร้าน",
  choices: [{ name: NO_TEXT }, ...srcFont.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc }))],
};

// ── ประกอบกลุ่มใหม่: แทนที่กลุ่มสีไหมเดิมในตำแหน่งเดิม แล้วต่อฟอนต์ท้ายกลุ่มสีไหม ──
// (แทนที่ในตำแหน่งเดิม ไม่ push ท้ายสุด — ลำดับกลุ่มบนหน้าสินค้าจะได้ไม่สลับ)
const before = data.options ?? [];
const at = before.findIndex((o) => o.label === OLD_THREAD_LABEL);
if (at < 0) { console.error(`ไม่เจอกลุ่มเดิม "${OLD_THREAD_LABEL}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
const options = [...before.slice(0, at), threadGroup, fontGroup, ...before.slice(at + 1)];

console.log("กลุ่มก่อนแก้ :", before.map((o) => `${o.label} (${o.choices?.length})`).join("  ·  "));
console.log("กลุ่มหลังแก้:", options.map((o) => `${o.label} (${o.choices?.length})`).join("  ·  "));
console.log(`\nสีไหม ${threadGroup.choices.length} เบอร์ · ฟอนต์ ${fontGroup.choices.length} ตัวเลือก (รวม "${NO_TEXT}")`);

if (!process.argv.includes("--write")) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const th = got.find((o) => o.label === THREAD_LABEL);
const fo = got.find((o) => o.label === FONT_LABEL);
const fails = [
  [got.length === options.length, `จำนวนกลุ่มไม่ตรง (${got.length} ≠ ${options.length})`],
  [!got.some((o) => o.label === OLD_THREAD_LABEL), "กลุ่มสีไหมเดิมยังอยู่ (คิดเงินซ้ำ)"],
  [th?.choices?.length === 80 && th.freeFirstN === 3 && th.swatchGrid === true, "กลุ่มสีไหมใหม่ไม่ครบ"],
  [th?.choices?.every((c) => c.extra === 10 && c.imageSrc), "ชิปสีไหมขาด extra/imageSrc"],
  [fo?.choices?.length === 27 && fo.sampleGrid === true, "กลุ่มฟอนต์ไม่ครบ"],
  [fo?.choices?.[0]?.name === NO_TEXT, "ตัวเลือก “ไม่มีตัวอักษร” ไม่ได้อยู่ตัวแรก"],
  [!oldNoteImg || th?.noteImageSrc === oldNoteImg, "การ์ดอธิบายกติกา 3 สี หลุดไปตอนย้ายกลุ่ม"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);

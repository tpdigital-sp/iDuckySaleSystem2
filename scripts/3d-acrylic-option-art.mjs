#!/usr/bin/env node
/**
 * 3D Acrylic — อัปภาพประจำตัวเลือก แล้วผูก imageSrc ให้ตัวเลือกที่ยังไม่มีภาพ
 *
 *   node scripts/3d-acrylic-art.mjs                      # เตรียมภาพก่อน (.cache/3d-acrylic/upload)
 *   node scripts/3d-acrylic-option-art.mjs               # ดูก่อนว่าจะแตะอะไร (ไม่อัป ไม่เขียน)
 *   node scripts/3d-acrylic-option-art.mjs --upload --write
 *
 * โจทย์: "ทุกตัวเลือกต้องมีภาพว่าหน้าตาเป็นแบบไหน"
 *   ขนาดชิ้นที่ 1 / ขนาดชิ้นที่ 2      → การ์ดภาพจำลอง "อะคริลิค 2 ชิ้นประกบกัน" (มองด้านหน้า + ตัดขวาง)
 *                                      แยกไฟล์ 2 ชุด p1-/p2- เพราะการ์ดไฮไลต์คนละชิ้นกัน
 *   งานสกรีน (ชิ้นที่ 1 / ชิ้นที่ 2)   → ภาพชุดกลาง acrylic-howto (ใช้ร่วมกับสินค้าอะคริลิคตัวอื่น)
 *   ชนิดอะคริลิค (ชิ้นที่ 1 / ชิ้นที่ 2) → ใส / ขาวขุ่น C-02 / พิเศษ
 *   เพิ่มจำนวนชิ้น                     → การ์ด "ชิ้นที่ 3 ขึ้นไป" แบบสกรีน / ไม่สกรีน
 *
 * แตะเฉพาะฟิลด์ imageSrc ของตัวเลือกในตาราง MAP — ไม่แตะราคา ไม่แตะกฎ ไม่เขียนทับสินค้าทั้ง row
 * ตัวเลือกไหนโผล่มาใหม่แล้วไม่มีในตาราง = สคริปต์เตือน (ไปเพิ่มภาพใน 3d-acrylic-art.mjs ก่อน)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ตอนนี้การ์ดขนาด p1-/p2- = v1 · ชนิดอะคริลิค = v1
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const ART_DIR = ((process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/3d-acrylic/upload").replace(/\/$/, "");

const ID = "3d-acrylic";
const EXPECT_NAME = "3D Acrylic"; // กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง

/**
 * กลุ่มตัวเลือก → { ชื่อตัวเลือก: ภาพ }
 * ค่าภาพเป็น "ชื่อไฟล์" = โฟลเดอร์ของสินค้านี้ (products/3d-acrylic/…)
 * ใส่ "โฟลเดอร์/ชื่อไฟล์" ได้ด้วย ถ้าเป็นภาพชุดกลางที่ใช้ร่วมกับสินค้าอื่น (เช่น acrylic-howto)
 */
const SIZES = ["2cm", "3cm", "4cm", "5cm", "6cm"];
/** ภาพชุด "HOW TO สกรีน" ของงานอะคริลิค — ใช้ร่วมกันทั้งชิ้นที่ 1 และชิ้นที่ 2 */
const SCREEN_ART = {
  "สกรีน 1 ด้าน (ใต้)": "acrylic-howto/screen-1side-under-v1",
  "สกรีน 1 ด้าน (บน)": "acrylic-howto/screen-1side-top-v1",
  "สกรีน 2 ด้าน (ใต้-บน)": "acrylic-howto/screen-2side-under-top-v1",
  "สกรีน 2 ด้าน (บน-บน)": "acrylic-howto/screen-2side-top-top-v1",
  "สกรีน 3 เลเยอร์": "acrylic-howto/screen-3layer-v1",
  "สกรีน 4 เลเยอร์": "acrylic-howto/screen-4layer-v1",
};
const ACRYLIC_ART = {
  อะคริลิคใส: "acrylic-clear-v1",
  "อะคริลิคขาวขุ่น C-02": "acrylic-c02-v1",
  "อะคริลิคพิเศษ (สี / โฮโลแกรม / กลิตเตอร์)": "acrylic-special-v1",
};
const sizeArt = (prefix) => Object.fromEntries(SIZES.map((s) => [s, `${prefix}-size-${s.replace("cm", "")}-v1`]));

const MAP = {
  "ขนาดชิ้นที่ 1": sizeArt("p1"),
  "งานสกรีน (ชิ้นที่ 1)": SCREEN_ART,
  "ชนิดอะคริลิค (ชิ้นที่ 1)": ACRYLIC_ART,
  "ขนาดชิ้นที่ 2": sizeArt("p2"),
  // กลุ่มของชิ้นที่ 2 แตกเป็นใบละช่วงขนาด (ดู 3d-acrylic-build.mjs) — ภาพชุดเดียวกันทุกใบ
  "งานสกรีน (ชิ้นที่ 2)": SCREEN_ART,
  "งานสกรีน (ชิ้นที่ 2) · ขนาด 6cm": SCREEN_ART,
  "ชนิดอะคริลิค (ชิ้นที่ 2)": ACRYLIC_ART,
  "ชนิดอะคริลิค (ชิ้นที่ 2) · ขนาด 6cm": ACRYLIC_ART,
  // กลุ่ม "เพิ่มจำนวนชิ้น" — ทุกขนาด/ชนิดอะคริลิคของแบบเดียวกันใช้ภาพใบเดียว
  // (การ์ดมีตารางราคาครบทุกขนาดอยู่แล้ว · แกลเลอรีตัดภาพซ้ำ src เดียวกันทิ้งให้เอง)
  เพิ่มจำนวนชิ้น: Object.fromEntries(
    SIZES.flatMap((sz) =>
      ["สกรีน", "ไม่สกรีน"].flatMap((kind) =>
        ["", " · อคล.พิเศษ"].map((sp) => [`${sz} · ${kind}${sp}`, kind === "สกรีน" ? "extra-screen-v1" : "extra-plain-v1"])
      )
    )
  ),
};

/** กลุ่มที่ตั้งใจไม่แตะ (ตอนนี้ไม่มี — ทุกกลุ่มมีภาพครบแล้ว) */
const SKIP = [];

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
/** "ชื่อไฟล์" = โฟลเดอร์สินค้านี้ · "โฟลเดอร์/ชื่อไฟล์" = ชุดภาพกลางที่ใช้ร่วมกับสินค้าอื่น */
const url = (art) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${art.includes("/") ? art : `${ID}/${art}`}.jpg`;

/** ชื่อไฟล์ที่สคริปต์นี้ต้องอัปเอง (ชุดกลางที่มี "/" มีอยู่บน Storage แล้ว ไม่ต้องอัปทับ) */
const ARTS = [...new Set(Object.values(MAP).flatMap((m) => Object.values(m)))].filter((a) => !a.includes("/"));

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
if (p.name !== EXPECT_NAME) throw new Error(`สินค้า id "${ID}" ตอนนี้ชื่อ "${p.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);

// ── เทียบตัวเลือกจริงกับตาราง MAP ก่อน แล้วค่อยลงมือ ──
const plan = [];
const problems = [];
for (const opt of p.options ?? []) {
  if (SKIP.includes(opt.label)) continue;
  const m = MAP[opt.label];
  if (!m) {
    problems.push(`กลุ่ม "${opt.label}" ไม่มีในตาราง MAP — ยังไม่มีภาพประจำตัวเลือก`);
    continue;
  }
  for (const ch of opt.choices ?? []) {
    const art = m[ch.name];
    if (!art) {
      problems.push(`"${opt.label} → ${ch.name}" ไม่มีในตาราง MAP — ไปเพิ่มภาพใน 3d-acrylic-art.mjs ก่อน`);
      continue;
    }
    const src = url(art);
    if (ch.imageSrc === src) continue;
    plan.push({ opt: opt.label, choice: ch.name, art, from: ch.imageSrc, to: src, ref: ch });
  }
}
const noImage = (p.options ?? [])
  .filter((o) => SKIP.includes(o.label))
  .flatMap((o) => (o.choices ?? []).filter((c) => !c.imageSrc).map((c) => `${o.label} → ${c.name}`));

console.log(`สินค้า: ${p.name} (${ID})`);
for (const pl of plan) console.log(`  🖼  ${pl.opt} → ${pl.choice}\n       ${pl.from ? `เดิม ${pl.from.split("/").pop()} → ` : "(ยังไม่มีภาพ) → "}${pl.art}.jpg`);
if (!plan.length) console.log("  (ไม่มีอะไรต้องแก้ — ทุกตัวเลือกชี้ภาพถูกอยู่แล้ว)");
if (noImage.length) console.log(`\n⚠️ กลุ่มที่ข้ามไว้แต่ยังไม่มีภาพ: ${noImage.join(" · ")}`);
if (problems.length) {
  console.log("\n⛔ หยุดก่อน:");
  for (const t of problems) console.log(`   • ${t}`);
  process.exit(1);
}

if (UPLOAD) {
  for (const art of ARTS) {
    const file = `${ART_DIR}/${art}.jpg`;
    if (!existsSync(file)) throw new Error(`ไม่พบ ${file} — รัน node scripts/3d-acrylic-art.mjs ก่อน`);
    const buf = await readFile(file);
    const { error: upErr } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${art}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`${art}: ${upErr.message}`);
    console.log(`⬆️  ${art}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
} else if (plan.length) {
  console.log("\n(ยังไม่อัปภาพ — ใส่ --upload ถ้าจะอัปจริง)");
}

if (!plan.length) process.exit(0);
if (!WRITE) {
  console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}

for (const pl of plan) pl.ref.imageSrc = pl.to;
p.savedAt = new Date().toISOString();
const { error: wErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (wErr) throw wErr;
console.log(`\nบันทึกแล้ว ✓ (${plan.length} ตัวเลือก)`);

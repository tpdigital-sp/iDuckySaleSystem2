#!/usr/bin/env node
/**
 * เคลือบทั้งร้าน — เปลี่ยนภาพตัวเลือกในกลุ่มเคลือบทุกกลุ่ม/ทุกสินค้า
 * ให้เป็นภาพงานจริงชุดกลางของร้าน (โฟลเดอร์ "เคลือบแบบต่างๆ" ชุด A- บนไดรฟ์ Print.iDuckyOfficial)
 *
 *   node scripts/coating-photos-shopwide.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/coating-photos-shopwide.mjs --write
 *
 * ผู้ใช้สั่ง 1 ก.ย. 69: "กลุ่มเคลือบต่างๆ ของสินค้าทุกตัว เปลี่ยนเป็นภาพตาม path นี้ .../A-Dust.jpg"
 * → ในโฟลเดอร์มี 13 ใบ ใบละผิวเคลือบ (มีชื่อผิวพิมพ์อยู่บนการ์ดในรูป) จึงจับคู่ "ตามชนิดเคลือบ"
 *   ไม่ใช่เอาใบเดียวไปแปะทุกตัวเลือก (ป้ายในรูปจะไม่ตรงกับชื่อตัวเลือก)
 * แล้วสั่งต่อ: ขอลองชุด B (ตั้งเอียง มีไฮไลต์แสง — เห็นผิวเงา/ด้าน/ทรายชัดกว่าชุด A ที่วางแบน)
 *   → สลับ SET ข้างล่างได้ ไฟล์ชุดเก่ายังอยู่บนคลัง กลับไป "a" เมื่อไหร่ก็ได้
 *
 * ต้นฉบับย่อไว้ที่ scripts/assets/coating-<SET>/ (รันซ้ำได้โดยไม่ต้องต่อไดรฟ์)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชค้าง) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 *
 * ไม่แตะชื่อกลุ่ม / ชื่อตัวเลือก / ราคา / display เลย · รันซ้ำได้ ผลลัพธ์เท่าเดิม
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const BASE = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products`;

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/* ── คลังภาพกลาง ─────────────────────────────────────────────────── */

const SET = "b"; // "a" = วางแบนพื้นครีม (ชุดแรก) · "b" = ตั้งเอียงมีไฮไลต์แสง
const REV = "v1";
const DIR = fileURLToPath(new URL(`./assets/coating-${SET}/`, import.meta.url));
const KEYS = [
  "none", "gloss", "matte", "glitter", "sand",
  "rainbow", "star", "snow", "heart", "facet", "dot", "dust", "stardust",
];
const src = (k) => `${BASE}/coating-${SET}/${k}-${REV}.jpg`;
const buf = Object.fromEntries(KEYS.map((k) => [k, readFileSync(`${DIR}${k}.jpg`)]));

/* ── จับคู่ชื่อตัวเลือก → ภาพ (ลำดับสำคัญ: กฎบนชนะ) ───────────────── */

const RULES = [
  [/ไม่เคลือบ/, "none"],           // ไม่เคลือบ · ไม่เคลือบด้านหลัง
  [/stardust/i, "stardust"],       // ต้องมาก่อน Dust
  [/dust/i, "dust"],
  [/รุ้ง/, "rainbow"],
  [/ดาว/, "star"],
  [/หิมะ/, "snow"],
  [/หัวใจ/, "heart"],
  [/เหลี่ยม/, "facet"],
  [/จุด/, "dot"],
  [/ทราย/, "sand"],
  [/กลิตเตอร์|กลิสเตอร์|glitter/i, "glitter"],
  [/พิเศษ/, "glitter"],            // "เคลือบพิเศษ" = ฟิล์มลายพิเศษ ใช้กลิตเตอร์เป็นภาพตัวแทน
  [/ธรรมดา/, "gloss"],             // "เคลือบธรรมดา (ฟรี)" = เงา/ด้าน
  [/เงา/, "gloss"],                // ต้องมาก่อน "ด้าน" (มีตัวเลือก "เคลือบเงา / ด้าน")
  [/ด้าน/, "matte"],
];
const keyOf = (name) => RULES.find(([re]) => re.test(name))?.[1];

/** กลุ่มที่ชื่อมีคำว่าเคลือบ/ฟิล์ม แต่ไม่ใช่ฟิล์มลามิเนต — ไม่แตะ */
const SKIP_GROUP = (label) =>
  /ฟอยล์/.test(label) ||        // เคลือบฟอยล์ (ปั๊มฟอยล์ คนละเรื่อง)
  /เรซิ่น|นูน/.test(label) ||   // เคลือบนูนเรซิ่นบนอะคริลิค
  label === "ชนิดฟิล์ม";        // สติ๊กเกอร์ฟิล์ม RainBow (เนื้อสติ๊กเกอร์ ไม่ใช่เคลือบ)

const IS_COAT_GROUP = (label) => /เคลือบ|ฟิล์ม|laminat/i.test(label ?? "");

/* ── กวาดทั้งร้าน ─────────────────────────────────────────────────── */

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) die(error.message);

const edits = [];   // [{ id, name, data, hits: [[groupLabel, choiceName, key]] }]
const unknown = []; // ชื่อตัวเลือกที่ไม่เข้ากฎไหนเลย
const stray = [];   // กลุ่มที่ชื่อไม่มีคำว่าเคลือบ แต่มีตัวเลือกเป็นผิวฟิล์ม

/** กลุ่มตัวเลือกของแถวนี้ — สินค้าปกติอยู่ใน data.options · คลังตัวเลือกกลาง (/admin/options) เป็นกลุ่มเดียวที่ data */
const groupsOf = (d, id) => (id.startsWith("__preset") ? [d] : d.options ?? []);

for (const row of rows) {
  const d = structuredClone(row.data ?? {});
  const hits = [];
  for (const g of groupsOf(d, row.id)) {
    const label = g.label ?? "";
    if (!IS_COAT_GROUP(label)) {
      const filmish = (g.choices ?? []).filter((c) => /hologram|โฮโลแกรม|กลิตเตอร์|กลิสเตอร์/i.test(c.name));
      if (filmish.length >= 3) stray.push(`${row.id} · [${label}] (${filmish.length} ตัวเลือก)`);
      continue;
    }
    if (SKIP_GROUP(label)) continue;
    for (const c of g.choices ?? []) {
      const key = keyOf(c.name);
      if (!key) {
        unknown.push(`${row.id} · [${label}] · "${c.name}"`);
        continue;
      }
      if (c.imageSrc === src(key)) continue; // ตรงอยู่แล้ว
      c.imageSrc = src(key);
      hits.push([label, c.name, key]);
    }
  }
  if (hits.length) edits.push({ id: row.id, name: row.name, data: d, hits });
}

if (stray.length) {
  console.log("⚠️  กลุ่มที่ชื่อไม่มีคำว่าเคลือบ/ฟิล์ม แต่ดูเป็นผิวฟิล์ม — ยังไม่แตะ มาดูเองก่อน:");
  for (const s of stray) console.log("   " + s);
  console.log("");
}
if (unknown.length) die(`ตัวเลือกที่จับคู่ภาพไม่ได้ ${unknown.length} รายการ:\n   ` + unknown.join("\n   "));

let n = 0;
for (const e of edits) {
  console.log(`\n■ ${e.id} · ${e.name}${e.data.hidden ? " (ร่าง)" : ""}`);
  let last = "";
  for (const [label, name, key] of e.hits) {
    if (label !== last) console.log(`   [${label}]`);
    last = label;
    console.log(`     • ${name}  →  coating-${SET}/${key}-${REV}.jpg`);
    n++;
  }
}
console.log(`\nรวม ${edits.length} สินค้า · ${n} ตัวเลือก`);

if (!WRITE) {
  console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

/* ── อัปภาพ + บันทึก ─────────────────────────────────────────────── */

for (const k of KEYS) {
  const path = `products/coating-${SET}/${k}-${REV}.jpg`;
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(path, buf[k], { contentType: "image/jpeg", upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) die(upErr.message);
  console.log(`⬆️  coating-${SET}/${k}-${REV}.jpg ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}

for (const e of edits) {
  const { error: saveErr } = await sb.from("products").update({ data: e.data }).eq("id", e.id);
  if (saveErr) die(`${e.id}: ${saveErr.message}`);
  console.log(`💾 ${e.id}`);
}

/* ── อ่านกลับ + เปิดภาพจริงทุกใบ ─────────────────────────────────── */

const { data: back, error: backErr } = await sb.from("products").select("id,data");
if (backErr) die(backErr.message);
let checked = 0;
for (const row of back) {
  for (const g of groupsOf(row.data ?? {}, row.id)) {
    if (!IS_COAT_GROUP(g.label ?? "") || SKIP_GROUP(g.label ?? "")) continue;
    for (const c of g.choices ?? []) {
      const key = keyOf(c.name);
      if (key && c.imageSrc !== src(key)) die(`${row.id} · ${g.label} · ${c.name}: อ่านกลับแล้วไม่ตรง`);
      if (key) checked++;
    }
  }
}
for (const k of KEYS) {
  const res = await fetch(src(k));
  console.log(`   ${res.ok ? "✓" : "✗"} HTTP ${res.status} coating-${SET}/${k}-${REV}.jpg`);
  if (!res.ok) die("เปิดภาพไม่ได้ — ยังไม่เสร็จ");
}
console.log(`\n✅ บันทึกแล้ว · ยืนยันจากการอ่านกลับ ${checked} ตัวเลือก และเปิดภาพครบ ${KEYS.length} ใบ`);

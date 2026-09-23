/**
 * 🧵 ผ้าแขวนผนัง (fabric-poster) — เพิ่มผ้า 9 ชนิดที่ "ยังไม่มีราคา" + แก้ราคาผ้าซิติโน่
 * ตามตารางที่เจ้าของร้านส่งมา 23 ก.ย. 69 (ราคา/หลา 4 ช่วง: 1-10 · 11-29 · 30-49 · 50 ขึ้นไป)
 *
 *   satino ในตาราง = ผ้าซาติโน่ ที่มีอยู่แล้ว (เจ้าของร้านยืนยัน) → แก้ราคาเดิม 350/300/270/240 → 290/250/220/190
 *   (ชื่อตัวเลือกถูกเปลี่ยนจาก "ผ้าซิติโน่" เป็น "ผ้าซาติโน่" จากหน้าแก้ไขสินค้าระหว่างทำงานนี้ —
 *    สคริปต์จึงตามแก้ชื่อในแท็บชนิดผ้า และกวาดช่องราคาที่ไม่มีตัวเลือกคู่ทิ้ง)
 *
 * เขียนตามกติกาโน้ต iducky-script-write-product:
 *   • ตารางเรทแรกอยู่ 2 ที่ (data.pricing + data.priceRates[0].pricing) ต้องเขียนให้ตรงกันทั้งคู่
 *   • savedAt เป็น ISO string · อัปเดต priceMin/priceMax · อ่านกลับมาเทียบค่าจริง
 *   • รันซ้ำได้ (เช็คว่าทำไปแล้วหรือยังทีละขั้น)
 * รันเสร็จแล้วต้องตามด้วย: node scripts/dealer-rates-apply.mjs --apply --only=fabric-poster
 *
 * รัน:  node scripts/fabric-poster-new-fabrics.mjs           → dry-run
 *       node scripts/fabric-poster-new-fabrics.mjs --apply   → เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ID = "fabric-poster";
const GROUP = "ชนิดผ้า";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("❌", m); process.exit(1); };

/** ผ้าใหม่ตามภาพ — ราคา/หลา [1-10, 11-29, 30-49, 50+] */
const NEW_FABRICS = [
  ["ผ้า Satin Indo", [290, 250, 220, 190]],
  ["ผ้า Satin พรีเมี่ยม", [350, 320, 300, 280]],
  ["ผ้า Satin โรม่า", [290, 250, 220, 190]],
  ["ผ้า Satin ไดมอน", [350, 200, 180, 160]],
  ["ผ้าชีฟอง", [270, 230, 200, 170]],
  ["ผ้าไมโครพีช", [270, 230, 200, 170]],
  ["ผ้าไหมอิตาลี", [300, 260, 230, 200]],
  ["ผ้า Olivia Satin", [300, 260, 230, 200]],
  ["ผ้า Double Nano", [270, 230, 200, 170]],
];
/** satino = ผ้าซาติโน่ เดิม (แก้ราคา ไม่เพิ่มตัวเลือกใหม่) */
const REPRICE = [["ผ้าซาติโน่", [290, 250, 220, 190]]];

/** แก้ข้อความที่นับจำนวนชนิดผ้าไว้ (13 → 22 · มาตรฐาน 9 → 18) — เฉพาะประโยคที่ระบุ ไม่แตะ "สีไหม 13 สี" */
const TEXT_FIXES = [
  ["• ผ้าซิติโน่ — ", "• ผ้าซาติโน่ — "], // ตามชื่อตัวเลือกที่ร้านเปลี่ยนไว้
  ["เลือกเนื้อผ้าได้ 13 ชนิด", "เลือกเนื้อผ้าได้ 22 ชนิด"],
  ["เนื้อผ้าให้เลือก 13 ชนิด — ผ้ามาตรฐาน 9 ชนิด + ผ้าสะท้อนน้ำ 4 ชนิด", "เนื้อผ้าให้เลือก 22 ชนิด — ผ้ามาตรฐาน 18 ชนิด + ผ้าสะท้อนน้ำ 4 ชนิด"],
  ["เนื้อผ้าให้เลือก 13 ชนิด", "เนื้อผ้าให้เลือก 22 ชนิด"],
  ["ผ้าสกรีนยกหลา 13 เนื้อผ้า", "ผ้าสกรีนยกหลา 22 เนื้อผ้า"],
  ["เลือกเนื้อผ้า 13 ชนิดพร้อมภาพตัวอย่าง", "เลือกเนื้อผ้า 22 ชนิดพร้อมภาพตัวอย่าง"],
  [
    "มี 13 ชนิด — ผ้ามาตรฐาน 9 ชนิด เช่น ผ้าฮาร์มิต แคนวาส (8/14 Oz) Short Plush ซาติน ลูกฟูก",
    "มี 22 ชนิด — ผ้ามาตรฐาน 18 ชนิด เช่น ผ้าฮาร์มิต แคนวาส (8/14 Oz) Short Plush ซาติน (Peach · Silk · Indo · พรีเมี่ยม · โรม่า · ไดมอน) ชีฟอง ไมโครพีช ไหมอิตาลี Olivia Satin Double Nano ลูกฟูก",
  ],
  ["ทุกชนิดมีภาพตัวอย่างเนื้อผ้าและคำอธิบายให้ดูตอนเลือกในหน้าสินค้า", "เลือกชนิดผ้าได้ในหน้าสินค้า (ผ้าส่วนใหญ่มีภาพตัวอย่างเนื้อผ้าและคำอธิบายให้ดูประกอบ)"],
];
/** เติมชื่อผ้าใหม่ต่อท้ายรายการ "ผ้ามาตรฐาน" ในแท็บชนิดผ้า */
const TAB_ANCHOR = "• ผ้าซาติโน่ — โพลีเอสเตอร์ 100% เนื้อเรียบเนียน ผิวนิ่มลื่น อยู่ทรง สัมผัสเย็นสบาย";
const TAB_ADD = NEW_FABRICS.map(([n]) => `• ${n}`).join("\n");

/** เดินทุกสตริงใน object แล้วแทนที่ข้อความ */
function walkText(node, fn) {
  if (typeof node === "string") return fn(node);
  if (Array.isArray(node)) return node.map((v) => walkText(v, fn));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = walkText(v, fn);
    return out;
  }
  return node;
}

const { data: row, error } = await sb.from("products").select("id,name,price,data").eq("id", ID).single();
if (error) die(error.message);
const d = structuredClone(row.data);

// 1) ตัวเลือกชนิดผ้า
const grp = (d.options ?? []).find((o) => o.label === GROUP) ?? die(`ไม่พบกลุ่ม ${GROUP}`);
const have = new Set(grp.choices.map((c) => c.name));
const added = [];
for (const [name] of NEW_FABRICS) {
  if (have.has(name)) continue;
  grp.choices.push({ name });
  added.push(name);
}

// 2) ตารางราคา — เรทแรกเก็บ 2 ที่ ต้องเขียนทั้งคู่
const orphans = new Set();
const matrices = [d.pricing, d.priceRates?.[0]?.pricing].filter(Boolean);
if (matrices.length !== 2) die("คาดว่าจะมีตารางเรทแรก 2 ที่ (data.pricing + priceRates[0].pricing)");
for (const m of matrices) {
  if ((m.tiers ?? []).length !== 4) die("จำนวนช่วงราคาไม่ใช่ 4 ช่วง — ตารางเปลี่ยนไปแล้ว หยุดก่อน");
  for (const [name, prices] of [...NEW_FABRICS, ...REPRICE]) m.cells[name] = [...prices];
  // กวาดช่องราคาที่ไม่มีตัวเลือกคู่ (เช่นชื่อเก่าหลังร้านเปลี่ยนชื่อผ้า) — คีย์ที่ไม่มีตัวเลือกจะหาไม่เจอตลอดไป
  for (const key of Object.keys(m.cells)) {
    if (!grp.choices.some((c) => c.name === key)) {
      delete m.cells[key];
      orphans.add(key);
    }
  }
}

// 3) ช่วงราคาที่หน้าร้านโชว์
const all = Object.values(d.pricing.cells).flat().filter((n) => typeof n === "number");
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

// 4) ข้อความที่นับจำนวนชนิดผ้า + รายการในแท็บ
let tabDone = false;
const patched = walkText(d, (s) => {
  let out = s;
  for (const [from, to] of TEXT_FIXES) if (out.includes(from)) out = out.split(from).join(to);
  if (out.includes(TAB_ANCHOR) && !out.includes(TAB_ADD)) {
    out = out.replace(TAB_ANCHOR, `${TAB_ANCHOR}\n${TAB_ADD}`);
    tabDone = true;
  }
  return out;
});
Object.assign(d, patched);
d.savedAt = new Date().toISOString();

console.log("• เพิ่มตัวเลือก:", added.length ? added.join(" · ") : "(มีครบแล้ว)");
console.log("• แก้ราคา:", REPRICE.map(([n, p]) => `${n} → ${p.join("/")}`).join(" · "));
console.log("• รายการในแท็บชนิดผ้า:", tabDone ? "เติมชื่อผ้าใหม่แล้ว" : "(เติมไว้แล้ว/ไม่พบจุดเติม)");
console.log("• ช่องราคาที่ไม่มีตัวเลือกคู่ (ลบทิ้ง):", orphans.size ? [...orphans].join(" · ") : "(ไม่มี)");
console.log("• ชนิดผ้าทั้งหมด:", grp.choices.length, "· ช่องราคา:", Object.keys(d.pricing.cells).length);
console.log("• priceMin/priceMax:", d.priceMin, "/", d.priceMax);
if (!APPLY) { console.log("\n(dry-run) ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (wrote?.length !== 1) die(`เขียนโดน ${wrote?.length} แถว`);

// 5) อ่านกลับมาเทียบของจริง
const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3) die(e3.message);
const b = back.data;
const bgrp = b.options.find((o) => o.label === GROUP);
for (const [name, prices] of [...NEW_FABRICS, ...REPRICE]) {
  if (!bgrp.choices.some((c) => c.name === name)) die(`อ่านกลับ: ไม่มีตัวเลือก ${name}`);
  for (const m of [b.pricing, b.priceRates[0].pricing]) {
    const cell = m.cells[name];
    if (!Array.isArray(cell) || cell.length !== 4 || cell.some((v, i) => v !== prices[i]))
      die(`อ่านกลับ: ราคา ${name} ไม่ตรง (${JSON.stringify(cell)})`);
  }
}
if (typeof b.savedAt !== "string" || b.savedAt !== d.savedAt) die("อ่านกลับ: savedAt ไม่ตรง");
if (b.priceMin !== d.priceMin || b.priceMax !== d.priceMax) die("อ่านกลับ: priceMin/Max ไม่ตรง");
for (const m of [b.pricing, b.priceRates[0].pricing])
  for (const key of Object.keys(m.cells))
    if (!bgrp.choices.some((c) => c.name === key)) die(`อ่านกลับ: ยังมีช่องราคาไร้ตัวเลือก ${key}`);
if (JSON.stringify(b.tabs).includes("ผ้าซิติโน่")) die("อ่านกลับ: ยังมีชื่อเก่า ผ้าซิติโน่ ในแท็บ");
if (JSON.stringify(b.seo).includes("13 ชนิด") || JSON.stringify(b.tabs).includes("13 ชนิด")) die("อ่านกลับ: ยังมีข้อความ 13 ชนิด ค้าง");
console.log("\n✅ เขียนแล้ว + อ่านกลับตรงทุกข้อ (ชนิดผ้า", bgrp.choices.length, "· ช่องราคา", Object.keys(b.pricing.cells).length, ")");
console.log("👉 ต่อด้วย: node scripts/dealer-rates-apply.mjs --apply --only=fabric-poster");

#!/usr/bin/env node
/**
 * ฐานสแตนดี้ของ 3D Acrylic — เพิ่มระบบฐานแบบเลือกได้ (ตรรกะเดียวกับอะคริลิคประกบ/standy)
 *
 *   node scripts/3d-acrylic-standee-base.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/3d-acrylic-standee-base.mjs --write   # บันทึกจริง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: สินค้า 3D-Acrylic + สแตนดี้ "เรทราคา 11 ชิ้นขึ้นไป ให้ไปดึงราคาที่
 * ตารางราคาฐาน สแตนดี้" (https://www.iduckyofficial-pricelists.com/pricestandy ตาราง "ราคาฐาน สแตนดี้")
 *
 * ตรวจแล้ว: standy คิดค่าฐานเรท 11+ ตรงตารางนี้อยู่แล้ว (ขนาดฐาน.extra 10..80 + สกรีนฐาน +10
 * ทดสอบบนเว็บจริง ตัว 3cm + ฐาน 2cm ที่ 11 ชิ้น = 39+10 = ฿49/ชิ้น) → สคริปต์นี้แค่ assert ซ้ำ
 * ส่วน 3D Acrylic ("ทำเป็นสแตนดี้ได้") ยังไม่มีฐานเลย → เพิ่มทั้งชุดโดยโคลนจาก standy:
 *
 *   ฐาน           ไม่มีฐาน (ค่าเริ่มต้น) / ฐานไม่สกรีน / ฐานสกรีนลาย(+10 ตามส่วนต่างในตาราง)
 *   ขนาดฐาน       2-20cm · extra = แถว "ไม่สกรีนฐาน" ของตารางสด (เรทส่ง extraFromQty 11)
 *                 · extraBelow = ช่วงปลีกตรรกะ standy เดิม (≤6cm ฟรี · 7cm ขึ้นไป = ตาราง −10)
 *   ทรงฐาน        กลม/สี่เหลี่ยมฟรี · ทรงพิเศษ ปลีกเหมา 10 / ส่ง 11+ +5 (ตามหมายเหตุใต้ตาราง)
 *   สีอะคริลิคฐาน + เลือกสีพิเศษของฐาน ×19 ขนาด (ค่าตามตาราง Add on อคล.พิเศษ — อยู่ในชุดโคลน)
 *
 * ทุกกลุ่มฐานโชว์เฉพาะตอนเลือก ฐานไม่สกรีน/ฐานสกรีนลาย (กลุ่มเฉดใช้ showWhenAll เพิ่มเงื่อนไข
 * เพราะค่าเดิมใน showWhen/showWhenAlso ถูกใช้ครบแล้ว — แพตเทิร์นเดียวกับ acrylic-prakob)
 * ราคา 1 ชุด = สแตนดี้ 1 ตัว = ฐาน 1 ชิ้น → คิดค่าฐานต่อชุดได้ตรง ๆ · ตารางราคาหลักไม่ถูกแตะ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy";
const GATE = { label: "ฐาน", choices: ["ฐานไม่สกรีน", "ฐานสกรีนลาย"] };

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

/* ── 1. อ่านตาราง "ราคาฐาน สแตนดี้" สดจากเว็บ ── */
const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
if (!res.ok) throw new Error(`โหลด ${PAGE} ไม่ได้ — HTTP ${res.status}`);
const html = (await res.text()).replace(/\x00/g, ""); // กับดักเดิม: เซลล์ Wix มี NUL คั่น
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) =>
  [...m[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);
const baseTable = tables.find((cells) => cells.includes("ไม่สกรีนฐาน") && cells.includes("สกรีนฐาน"));
if (!baseTable) throw new Error("ไม่เจอตาราง ราคาฐาน สแตนดี้ ในหน้า — โครงหน้าเว็บอาจเปลี่ยน");

// หัวคอลัมน์เป็นช่วงขนาด (3-5cm, 6-7cm, 8, 9cm … 20cm) → กางเป็นราคาต่อขนาด 2-20
const heads = baseTable.slice(1, baseTable.indexOf("ไม่สกรีนฐาน"));
const rowOf = (name) => {
  const i = baseTable.indexOf(name);
  return baseTable.slice(i + 1, i + 1 + heads.length).map(Number);
};
const plainRow = rowOf("ไม่สกรีนฐาน");
const printRow = rowOf("สกรีนฐาน");
const FEE = {}; // ขนาด(ซม.) → ค่าฐานไม่สกรีน เรทส่ง 11+
heads.forEach((h, i) => {
  const m = h.match(/^(\d+)(?:-(\d+))?/);
  if (!m) throw new Error(`หัวคอลัมน์อ่านไม่ออก: "${h}"`);
  for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) FEE[s] = plainRow[i];
  if (+m[1] === 3) FEE[2] = plainRow[i]; // ตารางเริ่ม 3-5cm — ฐาน 2cm ใช้เรทช่วงเดียวกัน (ตรรกะ standy เดิม)
});
const printDiffs = new Set(heads.map((_, i) => printRow[i] - plainRow[i]));
if (printDiffs.size !== 1) throw new Error(`ส่วนต่างสกรีนฐานไม่คงที่: ${[...printDiffs].join(",")} — โครงสร้างค่าธรรมเนียมใช้ต่อไม่ได้`);
const PRINT_FEE = [...printDiffs][0];
console.log(`📄 ตารางราคาฐานสด: ${heads.length} ช่วงขนาด → ฐาน 2-20cm = ${Object.values(FEE).join(",")} · สกรีนฐาน +${PRINT_FEE}`);

/* ── 2. ตรวจ standy ว่าเรท 11+ ตรงตารางอยู่แล้ว (ตามที่ผู้ใช้สั่งให้ยึดตารางนี้) ── */
const load = async (id) => {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw new Error(`อ่าน ${id} ไม่สำเร็จ — ${error.message}`);
  return structuredClone(data.data);
};
const standy = await load("standy");
const p3d = await load("3d-acrylic");
const optOf = (d, label) => d.options.find((o) => o.label === label);

{
  const sizeGrp = optOf(standy, "ขนาดฐาน");
  if (sizeGrp.extraFromQty !== 11) throw new Error(`standy: ขนาดฐาน extraFromQty = ${sizeGrp.extraFromQty} (ต้องเป็น 11)`);
  const bad = sizeGrp.choices.filter((c) => (c.extra ?? 0) !== FEE[parseInt(c.name)]);
  if (bad.length) throw new Error(`standy: ค่าฐานเรท 11+ ไม่ตรงตาราง — ${bad.map((c) => `${c.name}:${c.extra}≠${FEE[parseInt(c.name)]}`).join(", ")}`);
  const printed = optOf(standy, "ฐานสแตนดี้").choices.find((c) => c.name === "สกรีนฐาน");
  if ((printed?.extra ?? 0) !== PRINT_FEE) throw new Error(`standy: สกรีนฐาน extra ${printed?.extra} ≠ ${PRINT_FEE}`);
  console.log(`✅ standy: ค่าฐานเรท 11+ ตรงตารางสดครบ ${sizeGrp.choices.length} ขนาด (ไม่ต้องแก้)`);
}

/* ── 3. เพิ่มชุดฐานให้ 3d-acrylic (โคลนจาก standy + ประตู "ฐาน" แบบ acrylic-prakob) ── */
if (optOf(p3d, "ฐาน") || optOf(p3d, "ขนาดฐาน")) throw new Error("3d-acrylic มีกลุ่มฐานอยู่แล้ว — ไม่ต้องรันซ้ำ");
const baseCards = optOf(standy, "ฐานสแตนดี้").choices;
const img = (n) => baseCards.find((c) => c.name === n)?.imageSrc;

const gateGroup = {
  label: "ฐาน",
  display: "cards",
  note: "อยากตั้งเป็นสแตนดี้ เพิ่มฐานได้ — ค่าฐานคิดตามขนาดฐาน (11 ชุดขึ้นไปคิดเรทส่งตามตารางราคาฐานสแตนดี้)",
  choices: [
    { name: "ไม่มีฐาน", desc: "งานชิ้นประกบอย่างเดียว — ทำเป็นพวงกุญแจ Griptok หรืออื่น ๆ" },
    { name: "ฐานไม่สกรีน", desc: "ฐานอะคริลิคเปล่า ไม่พิมพ์ลาย", ...(img("ไม่สกรีนฐาน") ? { imageSrc: img("ไม่สกรีนฐาน") } : {}) },
    { name: "ฐานสกรีนลาย", desc: `พิมพ์ลายของคุณลงบนฐานด้วย — บวกเพิ่ม ฿${PRINT_FEE}`, extra: PRINT_FEE, ...(img("สกรีนฐาน") ? { imageSrc: img("สกรีนฐาน") } : {}) },
  ],
};

const newGroups = [gateGroup];
for (const label of ["ขนาดฐาน", "ทรงฐาน", "สีอะคริลิคฐาน"]) {
  const g = structuredClone(optOf(standy, label));
  if (!g) throw new Error(`standy ไม่มีกลุ่ม ${label}`);
  if (g.showWhen) throw new Error(`standy: "${label}" มี showWhen อยู่แล้ว — โครงไม่ตรงที่คาด`);
  g.showWhen = structuredClone(GATE);
  newGroups.push(g);
}
const shadeGroups = standy.options.filter((o) => o.label.startsWith("เลือกสีพิเศษของฐาน ("));
if (shadeGroups.length !== 19) throw new Error(`standy: กลุ่มเฉดฐานต้องมี 19 กลุ่ม เจอ ${shadeGroups.length}`);
for (const src of shadeGroups) {
  const g = structuredClone(src);
  if (!g.showWhen || !g.showWhenAlso) throw new Error(`standy: "${g.label}" ไม่มี showWhen/showWhenAlso ครบ`);
  g.showWhenAll = [...(g.showWhenAll ?? []), structuredClone(GATE)];
  newGroups.push(g);
}
p3d.options.push(...newGroups);
console.log(`📦 3d-acrylic: + ฐาน (3 ตัวเลือก) · ขนาดฐาน (${optOf(p3d, "ขนาดฐาน").choices.length}) · ทรงฐาน · สีอะคริลิคฐาน · เลือกสีพิเศษของฐาน ×19 — รวม ${newGroups.length} กลุ่มใหม่ ต่อท้าย options`);

/* ── 4. ตรวจก่อนเขียน ── */
{
  const labels = p3d.options.map((o) => o.label);
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dup.length) throw new Error(`3d-acrylic: label ซ้ำ — ${dup.join(", ")}`);
  for (const o of p3d.options) {
    for (const cond of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter(Boolean)) {
      const target = optOf(p3d, cond.label);
      if (!target) throw new Error(`3d-acrylic: "${o.label}" ชี้กลุ่ม "${cond.label}" ที่ไม่มีจริง`);
      const names = target.choices.map((c) => c.name);
      const miss = cond.choices.filter((c) => !names.includes(c));
      if (miss.length) throw new Error(`3d-acrylic: "${o.label}" ชี้ตัวเลือกที่ไม่มีจริง — ${miss.join(", ")}`);
    }
  }
  for (const r of p3d.priceRates ?? [])
    for (const lb of r.pricing?.driverLabels ?? [])
      if (!optOf(p3d, lb)) throw new Error(`3d-acrylic: driver "${lb}" หาย — ห้ามเกิด`);
  const sz = optOf(p3d, "ขนาดฐาน");
  const bad = sz.choices.filter((c) => (c.extra ?? 0) !== FEE[parseInt(c.name)]);
  if (bad.length) throw new Error(`3d-acrylic: ค่าฐานที่โคลนมาไม่ตรงตาราง — ${bad.map((c) => c.name).join(", ")}`);
  console.log(`✅ 3d-acrylic: ตรวจผ่าน (options รวม ${p3d.options.length} · ขนาดฐาน extra ตรงตารางสดทุกขนาด · extraFromQty ${sz.extraFromQty})`);
}

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: p3d }).eq("id", "3d-acrylic");
if (up.error) throw new Error(`เขียน 3d-acrylic ไม่สำเร็จ — ${up.error.message}`);
console.log("💾 บันทึก 3d-acrylic แล้ว (standy ไม่ถูกแตะ — ตรงตารางอยู่แล้ว)");

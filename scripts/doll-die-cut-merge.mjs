#!/usr/bin/env node
/**
 * ยุบ DOLL DIE-CUT 2 หน้าให้เหลือหน้าเดียว "ตุ๊กตาไดคัท (DOLL DIE-CUT)"
 * (ผู้ใช้สั่ง 4 ก.ย. 69 จาก 2 ลิงก์: /products/DOLL-DIE-CUT-งานสกรีน + /products/DOLL-DIE-CUT-งานปัก)
 *
 *   node scripts/doll-die-cut-merge.mjs           # กางผลลัพธ์ที่จะเขียน (ไม่แตะ DB)
 *   node scripts/doll-die-cut-merge.mjs --write   # เขียน DB + เก็บ product_revisions + อ่านกลับเทียบ
 *
 * โครงที่ใช้ = "เรทราคาเป็นแบบสินค้า" ชุดเดียวกับ crop / yuedpao-blank / mdf / collar-animal
 * (26 สินค้าในร้านทำแบบนี้อยู่แล้ว): 1 สินค้า 2 เรท — "งานสกรีน" กับ "งานปัก"
 * ตารางราคาของแต่ละเรท **ยกมาทั้งก้อนไม่แตะเลขสักช่อง** จากสินค้าเดิมของมันเอง
 *
 * ⚠️ 3 กับดักที่ตั้งใจหลบ (เช็คได้จาก scripts/doll-die-cut-merge-check.mts):
 *
 * 1) กลุ่ม "ขนาด" ใช้กลุ่มเดียวร่วมกันทั้ง 2 เรท และ **ชื่อตัวเลือกต้องไม่ซ้ำข้ามเรท**
 *    (งานปักขึ้นต้น "ขนาดไม่เกิน …" · งานสกรีนเป็น "15x15cm" เฉย ๆ) — หน้าร้านซ่อนตัวที่ไม่มีราคา
 *    ในเรทที่เลือกอยู่ให้เอง (matrixChoiceAvailable) และที่สำคัญกว่านั้น: ตะกร้ารวมล็อต (ratePoolsFor)
 *    จะ "ย้ายบรรทัดไปเรทแรก" ถ้าสเปคของบรรทัดนั้นมีช่องราคาในเรทนั้น — ชื่อขนาดคนละชุด = หาช่องไม่เจอ
 *    = บรรทัดงานปักอยู่เรทงานปักเสมอ ไม่โดนคิดราคาด้วยตารางงานสกรีน
 *
 * 2) กลุ่มที่มีเฉพาะบางเรท **ห้ามผูก showWhen กับ "เรทราคา"** (ต่างจาก crop/yuedpao) เพราะ
 *    "พิมพ์ลาย" เป็นแกนตารางราคา → ตะกร้าเก็บค่าไว้กับบรรทัดงานปักด้วยเสมอ (priceDriverLabels)
 *    แล้ว repairRateFromOptions จะอ่านว่า "บรรทัดนี้มีค่าของกลุ่มที่โผล่เฉพาะเรทงานสกรีน"
 *    → สลับเรทให้เป็นงานสกรีน → คีย์ราคาหาไม่เจอ → ราคาหล่นไป product.price เงียบ ๆ
 *    จึงผูก showWhen กับ **ค่าของกลุ่ม "ขนาด"** แทน (ชื่อขนาดบอกอยู่แล้วว่าเป็นงานไหน)
 *    ⚠️ เพิ่มขนาดใหม่ทีหลัง ต้องเติมชื่อขนาดนั้นใน showWhen ของกลุ่มฝั่งเดียวกันด้วย
 *
 * 3) เรทเดิมทั้งคู่ตั้ง minQty 11 — พอมี 2 เรทในหน้าเดียว ปุ่มเลือกเรทจะล็อก 🔒 ตอนสั่ง < 11
 *    (ลูกค้าเลือกแบบงานไม่ได้เลย) ทั้งที่ตารางราคามีช่วง "1-10" ขายอยู่ → ตัด minQty ออกทั้งคู่
 *    กติกาคละลายที่เหลือ (minPerDesign 5 · freeMixBelowQty 11 · underMinPieceFee 5) คงเดิมเป๊ะ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const OUT = ".cache/doll-merge";
mkdirSync(OUT, { recursive: true });

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

const KEEP = "doll-die-cut"; // สินค้าที่เหลืออยู่ (เดิม = งานปัก) — หน้ารวมอยู่ที่ id นี้
const GONE = "doll-die-cut-2"; // เดิม = งานสกรีน — ปิดการมองเห็นหลังยุบรวม
const NAME = "ตุ๊กตาไดคัท (DOLL DIE-CUT)";
const SLUG = "ตุ๊กตาไดคัท-DOLL-DIE-CUT"; // = slugifyProductName(NAME) — วงเล็บถูกตัดเป็นช่องว่าง→ขีด
const RATE_SCREEN = "งานสกรีน";
const RATE_EMB = "งานปัก";
const SIZE = "ขนาด";

const clone = (v) => JSON.parse(JSON.stringify(v));

// ── อ่านของจริงจาก DB ────────────────────────────────────────────────
const { data: rows, error } = await sb.from("products").select("id,name,price,category,sold,featured,badge,sort,data").in("id", [KEEP, GONE]);
if (error) throw error;
const rowOf = (id) => {
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error(`ไม่เจอสินค้า ${id}`);
  return r;
};
const emb = rowOf(KEEP); // งานปัก
const scr = rowOf(GONE); // งานสกรีน
const stamp = Date.now();
writeFileSync(`${OUT}/before-${KEEP}-${stamp}.json`, JSON.stringify(emb, null, 1));
writeFileSync(`${OUT}/before-${GONE}-${stamp}.json`, JSON.stringify(scr, null, 1));

const optOf = (data, label) => {
  const o = (data.options ?? []).find((x) => x.label === label);
  if (!o) throw new Error(`${data.id}: ไม่เจอกลุ่ม "${label}"`);
  return clone(o);
};
const sizeNames = (data) => optOf(data, SIZE).choices.map((c) => c.name);

const SCREEN_SIZES = sizeNames(scr.data); // 15x15cm … 85x85cm (8 ขนาด)
const EMB_SIZES = sizeNames(emb.data); // ขนาดไม่เกิน 15/25/35x…cm (3 ขนาด)

// กับดักข้อ 1 — ชื่อขนาดซ้ำกันเมื่อไหร่ ตะกร้าจะย้ายบรรทัดข้ามเรทได้ ห้ามเขียนต่อ
const dup = SCREEN_SIZES.filter((n) => EMB_SIZES.includes(n));
if (dup.length) throw new Error(`ชื่อขนาดซ้ำข้ามเรท: ${dup.join(", ")} — ตะกร้าจะคิดราคาข้ามเรทได้`);

// ── ตารางราคา: ยกมาทั้งก้อนจากเรทเดิมของแต่ละสินค้า ──────────────────
const screenTable = clone(scr.data.priceRates?.[0]?.pricing ?? scr.data.pricing);
const embTable = clone(emb.data.priceRates?.[0]?.pricing ?? emb.data.pricing);

/** ทุกคีย์ในตารางต้องประกอบจากชื่อตัวเลือกที่ยังมีอยู่จริง (กันคีย์ค้างชื่อเก่า) */
function checkTable(tag, table, axes) {
  const keys = Object.keys(table.cells);
  const combos = axes.reduce((acc, names) => acc.flatMap((pre) => names.map((n) => [...pre, n])), [[]]).map((c) => c.join("│"));
  for (const k of combos) if (!table.cells[k]) throw new Error(`${tag}: ไม่มีช่องราคา "${k}"`);
  if (keys.length !== combos.length) throw new Error(`${tag}: จำนวนช่องไม่ตรง (${keys.length} vs ${combos.length})`);
  return keys.length;
}
const SIDES = optOf(scr.data, "พิมพ์ลาย").choices.map((c) => c.name);
checkTable("ตารางงานสกรีน", screenTable, [SCREEN_SIZES, SIDES]);
checkTable("ตารางงานปัก", embTable, [EMB_SIZES]);

// ── กลุ่มตัวเลือกของหน้ารวม ───────────────────────────────────────────
const sizeGroup = {
  ...optOf(scr.data, SIZE),
  note: "เลือกแบบงานด้านบนก่อน แล้วรายการขนาดจะเปลี่ยนตามแบบงานนั้น · ขนาดที่ระบุคือกรอบใหญ่สุดของชิ้นงาน ตัวงานไดคัทตามทรงลายจริง",
  choices: [...optOf(scr.data, SIZE).choices, ...optOf(emb.data, SIZE).choices],
};
const whenScreen = { label: SIZE, choices: [...SCREEN_SIZES] };
const whenEmb = { label: SIZE, choices: [...EMB_SIZES] };
const withWhen = (opt, when) => ({ ...opt, showWhen: when });

const options = [
  sizeGroup,
  withWhen(optOf(scr.data, "พิมพ์ลาย"), whenScreen),
  withWhen(optOf(scr.data, "เนื้อผ้า"), whenScreen),
  withWhen(optOf(scr.data, "สีไหมเย็บชิ้นงาน"), whenScreen),
  withWhen(optOf(emb.data, "สีไหมไม่เกิน 3 สี"), whenEmb),
];

// ── เรทราคา = แบบงาน ─────────────────────────────────────────────────
const rateBase = (r) => {
  const { id, label, minQty, pricing, ...rest } = r; // ตัด minQty (กับดักข้อ 3) · เก็บกติกาคละที่เหลือ
  return rest;
};
const priceRates = [
  {
    ...rateBase(scr.data.priceRates[0]),
    id: "r-screen",
    label: RATE_SCREEN,
    desc: "พิมพ์ลายลงผ้าระบบซับลิเมชั่น · 8 ขนาด 15-85 ซม. · เลือกเนื้อผ้าได้ 4 แบบ สกรีน 1-2 ด้าน",
    imageSrc: scr.data.images?.[0]?.src ?? scr.data.imageSrc,
    pricing: screenTable,
  },
  {
    ...rateBase(emb.data.priceRates[0]),
    id: "r-embroidery",
    label: RATE_EMB,
    desc: "ปักลายด้วยเส้นไหม ผิวสัมผัสนูน · 3 ขนาด ไม่เกิน 15/25/35 ซม. · ไหมไม่เกิน 3 สี",
    imageSrc: emb.data.images?.[0]?.src ?? emb.data.imageSrc,
    pricing: embTable,
  },
];

const allCells = priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
const priceMin = Math.min(...allCells);
const priceMax = Math.max(...allCells);

// ── ข้อมูลสินค้าหน้ารวม ──────────────────────────────────────────────
const merged = {
  ...clone(emb.data),
  id: KEEP,
  name: NAME,
  slug: SLUG,
  price: scr.data.price, // ราคาเริ่มต้นที่ลูกค้าเห็นบนการ์ด = งานสกรีน 15x15 ปลีก
  priceMin,
  priceMax,
  description:
    "ตุ๊กตาไดคัทตามทรงลายของคุณ เลือกได้ 2 แบบงานในหน้าเดียว — งานสกรีนพิมพ์ซับลิเมชั่น 8 ขนาด (15-85 ซม.) เลือกเนื้อผ้าได้ 4 แบบ และงานปักด้วยเส้นไหม 3 ขนาด ผิวนูนพรีเมี่ยม ยิ่งสั่งเยอะยิ่งถูก",
  highlights: ["เลือกได้ 2 แบบงาน: สกรีน / ปัก", "ไดคัทตามทรงลาย 15-85 ซม.", "ราคาปรับตามจำนวน"],
  // แกลเลอรีรวม: งานสกรีน 4 รูป + งานปัก 1 รูป (ภาพประจำเรทต้องอยู่ในแกลเลอรี กดเลือกเรทแล้วภาพใหญ่ถึงจะตาม)
  images: [...clone(scr.data.images ?? []), ...clone(emb.data.images ?? [])],
  imageSrc: scr.data.imageSrc ?? scr.data.images?.[0]?.src,
  bulkAskQty: scr.data.bulkAskQty ?? emb.data.bulkAskQty,
  options,
  pricing: clone(screenTable), // ตารางระดับสินค้า = เรทแรก (ธรรมเนียมเดียวกับสินค้าหลายเรทตัวอื่น)
  priceRates,
  tierByDesign: true,
  // งานปักต้องคุยลายกับแอดมินก่อนสั่ง (ของเดิมบังคับทั้งสินค้า) — ย้ายมาบังคับเฉพาะเรทงานปัก
  // ตรงตามตัวอย่างในนิยาม ArtworkConsult: หมวก/เสื้อที่ขายทั้งงานพิมพ์และงานปัก
  artworkConsult: { enabled: true, when: { label: "เรทราคา", choices: [RATE_EMB] } },
  seo: {
    title: "รับทำตุ๊กตาไดคัท (DOLL DIE-CUT) งานสกรีน & งานปัก พิมพ์ลายตามสั่ง",
    description:
      "รับทำตุ๊กตาไดคัทตามทรงลายของคุณ เลือกงานสกรีนซับลิเมชั่น 8 ขนาด (15-85 ซม.) หรืองานปักเส้นไหม 3 ขนาด · ราคาปรับตามจำนวน ตรวจแบบก่อนผลิตทุกชิ้น ส่งไวทั่วไทย",
    keywords: [
      "ตุ๊กตาไดคัท",
      "DOLL DIE-CUT",
      "รับทำตุ๊กตาไดคัท",
      "ตุ๊กตาไดคัทงานสกรีน",
      "ตุ๊กตาไดคัทงานปัก",
      "หมอนตุ๊กตาไดคัท",
      "ตุ๊กตาจากรูป",
      "รับปักตุ๊กตา",
      "รับผลิตตุ๊กตา",
      "งานสั่งทำ",
      "ของขวัญ",
      "พิมพ์ลายตามสั่ง",
    ],
    faqs: [
      {
        q: "ตุ๊กตาไดคัท (DOLL DIE-CUT) ราคาเท่าไหร่?",
        a: "งานสกรีนขนาด 15x15cm เริ่มใบละ 230 บาท (สั่งจำนวนมากลดถึงใบละ 85) · งานปักเริ่มตัวละ 390 บาท (สั่งจำนวนมากลดถึงตัวละ 360) — ราคาจริงขึ้นกับแบบงาน ขนาด และจำนวนที่สั่ง ดูตารางราคาได้ในหน้าสินค้า",
      },
      {
        q: "งานสกรีนกับงานปัก ต่างกันยังไง?",
        a: "งานสกรีนพิมพ์ลายลงผ้าด้วยระบบซับลิเมชั่น ลายละเอียดหลายสีได้ เลือกเนื้อผ้าได้ 4 แบบ และสกรีนได้ 1-2 ด้าน · งานปักใช้เส้นไหมปักลายลงบนตัวงาน ผิวสัมผัสนูนดูพรีเมี่ยม เหมาะกับลายเรียบง่ายไม่เกิน 3 สี",
      },
      {
        q: "ตุ๊กตาไดคัท มีขนาดอะไรให้เลือกบ้าง?",
        a: "งานสกรีนมี 8 ขนาด: 15x15, 25x25, 35x35, 45x45, 55x55, 65x65, 75x75, 85x85 ซม. · งานปักมี 3 ขนาด: ไม่เกิน 15x15, 25x25, 35x35 ซม. — ขนาดที่ระบุคือกรอบใหญ่สุด ตัวงานไดคัทตามทรงลายจริง",
      },
      {
        q: "สั่งแล้วกี่วันได้ของ?",
        a: "หลังยืนยันการชำระเงินและอนุมัติแบบ ทีมงานจะเริ่มผลิตและจัดส่งทั่วไทย ติดตามสถานะได้จากลิงก์ออเดอร์ตลอดเวลา",
      },
    ],
  },
};
delete merged.hidden;

// ── ตรวจก่อนเขียน ────────────────────────────────────────────────────
const problems = [];
for (const [label, when] of [
  ["พิมพ์ลาย", whenScreen],
  ["เนื้อผ้า", whenScreen],
  ["สีไหมเย็บชิ้นงาน", whenScreen],
  ["สีไหมไม่เกิน 3 สี", whenEmb],
]) {
  const o = merged.options.find((x) => x.label === label);
  if (!o?.showWhen) problems.push(`กลุ่ม "${label}" ไม่มี showWhen`);
  if (o?.showWhen?.label !== SIZE) problems.push(`กลุ่ม "${label}" ผูกเงื่อนไขผิดกลุ่ม (${o?.showWhen?.label})`);
  const miss = when.choices.filter((n) => !sizeGroup.choices.some((c) => c.name === n));
  if (miss.length) problems.push(`กลุ่ม "${label}" อ้างขนาดที่ไม่มีในกลุ่ม: ${miss.join(", ")}`);
}
for (const r of merged.priceRates) {
  if (r.minQty) problems.push(`เรท "${r.label}" ยังมี minQty`);
  for (const lab of r.pricing.driverLabels) {
    if (!merged.options.some((o) => o.label === lab)) problems.push(`เรท "${r.label}" อ้างแกน "${lab}" ที่ไม่มีกลุ่ม`);
  }
}
if (merged.options.filter((o) => o.label === SIZE).length !== 1) problems.push('มีกลุ่ม "ขนาด" ไม่ใช่ 1 กลุ่ม');
if (problems.length) {
  console.error("❌ ตรวจไม่ผ่าน:\n" + problems.map((p) => " · " + p).join("\n"));
  process.exit(1);
}

writeFileSync(`${OUT}/merged.json`, JSON.stringify(merged, null, 1));
console.log(`หน้ารวม: ${NAME}  (/products/${SLUG})`);
console.log(`  เรท: ${merged.priceRates.map((r) => `${r.label} [${r.pricing.driverLabels.join("+")} · ${Object.keys(r.pricing.cells).length} ช่อง · ${r.pricing.tiers.length} ช่วง · หน่วย ${r.pricing.unit}]`).join("\n       ")}`);
console.log(`  กลุ่มตัวเลือก: ${merged.options.map((o) => `${o.label}(${o.choices.length}${o.showWhen ? ` เมื่อ ${o.showWhen.choices.length} ขนาด` : ""})`).join(" · ")}`);
console.log(`  ราคา ฿${merged.price} · ช่วง ฿${priceMin}-${priceMax} · รูป ${merged.images.length} ใบ`);
console.log(`  ไฟล์: ${OUT}/merged.json · ของเดิม ${OUT}/before-*-${stamp}.json`);
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — เติม --write เมื่อพร้อม)");
  process.exit(0);
}

// ── เขียน DB ─────────────────────────────────────────────────────────
for (const [pid, data] of [[KEEP, emb.data], [GONE, scr.data]]) {
  const { error: e } = await sb.from("product_revisions").insert({ product_id: pid, data, action: "save", editor: "script", editor_name: "doll-die-cut-merge" });
  if (e) console.warn(`เก็บ product_revisions ของ ${pid} ไม่สำเร็จ:`, e.message);
}

merged.savedAt = new Date().toISOString();
const { data: u1, error: e1 } = await sb
  .from("products")
  .update({ name: merged.name, price: merged.price, category: merged.category, data: merged })
  .eq("id", KEEP)
  .select("id");
if (e1 || !u1?.length) { console.error("update หน้ารวมพัง", e1); process.exit(1); }

// สินค้าเดิมฝั่งงานสกรีน — ปิดการมองเห็น (หน้าเว็บ 404 · ไม่ขึ้นรายการ/เมนู/บอทราคา) แต่ข้อมูลยังอยู่ครบ
const goneName = "DOLL DIE-CUT งานสกรีน (ยุบรวมกับ ตุ๊กตาไดคัท แล้ว)";
const goneData = { ...clone(scr.data), name: goneName, hidden: true, savedAt: new Date().toISOString() };
const { data: u2, error: e2 } = await sb.from("products").update({ name: goneName, data: goneData }).eq("id", GONE).select("id");
if (e2 || !u2?.length) { console.error("ปิดการมองเห็นสินค้าเดิมพัง", e2); process.exit(1); }

// ── อ่านกลับมาเทียบ (อย่าเชื่อว่าไม่ error = สำเร็จ) ────────────────
const { data: back } = await sb.from("products").select("id,name,price,data").in("id", [KEEP, GONE]);
const b = back.find((r) => r.id === KEEP);
const g = back.find((r) => r.id === GONE);
const fail = [];
if (b.name !== NAME || b.data.name !== NAME) fail.push("ชื่อไม่ตรง");
if (b.data.slug !== SLUG) fail.push("slug ไม่ตรง");
if (b.data.priceRates?.length !== 2) fail.push("จำนวนเรทไม่ตรง");
if (JSON.stringify(b.data.priceRates[0].pricing) !== JSON.stringify(scr.data.priceRates[0].pricing)) fail.push("ตารางงานสกรีนเพี้ยนจากของเดิม");
if (JSON.stringify(b.data.priceRates[1].pricing) !== JSON.stringify(emb.data.priceRates[0].pricing)) fail.push("ตารางงานปักเพี้ยนจากของเดิม");
for (const o of b.data.options) {
  const src = o.label === SIZE ? null : (o.showWhen?.choices ?? []);
  if (src && !src.length) fail.push(`กลุ่ม "${o.label}" showWhen หายหลังเขียน`);
}
if (b.data.options.find((o) => o.label === SIZE)?.choices.length !== SCREEN_SIZES.length + EMB_SIZES.length) fail.push("จำนวนขนาดไม่ครบ");
if (g.data.hidden !== true) fail.push("สินค้าเดิมยังไม่ถูกปิดการมองเห็น");
if (fail.length) { console.error("❌ อ่านกลับไม่ตรง:\n" + fail.map((f) => " · " + f).join("\n")); process.exit(1); }

writeFileSync(`${OUT}/after-${KEEP}.json`, JSON.stringify(b, null, 1));
console.log(`\n✓ เขียนแล้ว · ${KEEP} = "${NAME}" (${b.data.savedAt})`);
console.log(`✓ ${GONE} ปิดการมองเห็นแล้ว (หน้าเดิม /products/DOLL-DIE-CUT-งานสกรีน จะกลายเป็น 404)`);
console.log(`ตรวจราคาต่อด้วย: npx tsx scripts/doll-die-cut-merge-check.mts`);

#!/usr/bin/env npx tsx
/**
 * SHAPE STICKER / สติ๊กเกอร์รูปทรง — สร้างสินค้าจากร่างเปล่าที่ผู้ใช้กด "＋ เพิ่มสินค้า" ไว้
 *
 *   npx tsx scripts/shape-sticker-build.mts           # ดึงราคา/ภาพลง .cache แล้วสรุปให้ดู (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/shape-sticker-build.mts --write   # อัปภาพ + เขียนลง Supabase (ยังเป็นฉบับร่าง)
 *
 * ── ที่มาของราคา (ผู้ใช้สั่ง 1 ก.ย. 69 รอบสอง) ──────────────────────────────
 * ยกตารางราคามาจากสินค้า "สติ๊กเกอร์ Digital" (sticker-pp) — เฉพาะสไลซ์
 *   แบบไดคัท = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)" × ชนิดสติ๊กเกอร์ = "PP ขาวมัน"
 * เหลือแกนเดียวคือการเคลือบ × 9 ขั้นจำนวน (อ่านสดจาก Supabase ทุกครั้งที่รัน)
 *
 * ทำไมสไลซ์นี้: สติ๊กเกอร์รูปทรงคืองาน PP ขาวเงา ตัดครึ่งเนื้อ ลอกทีละดวง = ไดคัท 50% บน PP ขาวมัน
 * และราคาขั้นแรกตรงกับหน้าร้านจริงพอดี (90 บาท/แผ่น A3) — สคริปต์เช็คให้ทุกครั้ง (ดู CROSS-CHECK ข้างล่าง)
 * ⚠️ ทับคำสั่งเดิมที่ให้ใช้ค่าเคลือบของโปสการ์ด (พิเศษ +30) — ชุดสติ๊กเกอร์ Digital คิดพิเศษ +20 ในขั้นแรก
 *    และส่วนต่างไม่คงที่ทุกขั้น (ขั้นลึก ๆ เคลือบพิเศษมีราคาพื้น 90) จึงห้ามเขียนเป็น "+N คงที่" ในคำอธิบาย
 *
 * ── ที่มาของตัวเลือก/ภาพ ───────────────────────────────────────────────────
 * หน้าสินค้าจริงของร้าน https://www.iduckyprintsstudio.com/shapesticker/
 * เป็นเพจ Nuxt ที่ยิง API ของ getprintbox — สคริปต์อ่านสดทุกครั้ง:
 *   • product-families/376/  → รายการตัวเลือก (ขนาด 9 ทรง · การเคลือบ 6 แบบ)
 *   • prices/                → ราคาต่อจำนวน (ใช้เป็น cross-check เฉย ๆ แล้ว ไม่ได้เอามาเป็นราคาขาย)
 * ทั้งสองต้องใส่ header X-version: v6 + X-Pbx-Store-Name: iDuckyOfficial ไม่งั้นตอบ 400
 * ราคาที่อ่านคือ net (= ตัวเลขที่หน้าเว็บโชว์ ฿90.00) ไม่ใช่ gross ที่รวม VAT แล้ว
 *
 * หน่วยขาย: เว็บนับ quantity = "แผ่น A3" — 1 A3 ตัดได้ 6 แผ่นสติ๊กเกอร์ (ป้ายบนเว็บ "จำนวน 6 แผ่น / 1A3")
 * ทุกทรงราคาเท่ากัน (ตรวจแล้ว: ยิงราคาพร้อม param size แล้วได้เท่ากันทุกทรง) → "ขนาด" ไม่ใช่แกนตารางราคา
 * ชุดตัวเลือกเคลือบยกมาจากโปสการ์ดทั้งชุด (4 แบบ + เคลือบพิเศษ 10 ลายจากคลัง preset-2)
 *
 * ── ภาพประกอบตัวเลือก (ผู้ใช้สั่ง: อยากเห็นว่าแต่ละแบบหน้าตาเป็นยังไง) ──────
 *   • "ขนาด" — ภาพงานจริงรายทรงจากหน้า /shapesticker/ (9 ใบ) ตัดแถบคำบรรยายท้ายภาพออก
 *     (แถบนั้นของทรง "กรอบรูป" พิมพ์ผิดเป็น 4 ดวง ทั้งที่ในรูปมี 9 ดวง — ชื่อตัวเลือกยึดตาม API)
 *   • "เคลือบ" — ใช้ภาพชุดกลาง products/coating-b/* (ชุด B) ที่โปสการ์ด/สติ๊กเกอร์ตัวอื่นใช้อยู่แล้ว
 *   • แกลเลอรี 5 ใบ — แบนเนอร์ iDucky + ภาพงานจริง 4 ทรงจากหน้าสินค้าเดิม
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceTier, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1vffx-1253"; // ร่างเปล่าที่ผู้ใช้สร้างไว้ 1 ก.ย. 69
const NAME = "SHAPE STICKER / สติ๊กเกอร์รูปทรง";
const DIR = ".cache/shape-sticker";
const OUT = `${DIR}/upload`;
const V = "v1";
const PF = 376; // product family ของ SHAPE STICKER บนระบบ getprintbox
mkdirSync(`${DIR}/src`, { recursive: true });
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

const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${V}.jpg`;
/**
 * ภาพเคลือบชุดกลางทั้งร้าน — ชุด B (ตั้งเอียงเห็นผิวจริง) ที่ผู้ใช้เลือกไว้ 1 ก.ย. 69
 * โปสการ์ด / สติ๊กเกอร์ Digital / คลังตัวเลือก preset-2 ใช้ชุดนี้กันหมดแล้ว
 */
const COAT = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/coating-b/${name}-v1.jpg`;

/* ── 1. ราคาสดจาก API ของหน้าร้าน ───────────────────────────────── */
const PBX = "https://tpdigital-pbx2.getprintbox.com/api/editor";
const HEADERS = {
  "X-version": "v6",
  "Accept-Language": "th",
  "X-Currency": "THB",
  "X-Pbx-Store-Name": "iDuckyOfficial",
};
const api = async (path: string) => {
  const res = await fetch(`${PBX}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`ดึง ${path} ไม่ได้ — HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
};

const family = await api(`product-families/${PF}/?moduleId=374&channel=web`);
const attrOf = (id: string) => {
  const a = (family.attributes ?? []).find((x: any) => x.id === id);
  if (!a) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${id}" ในเว็บต้นทางแล้ว — โครงหน้าเปลี่ยน มาดูเองก่อน`);
  return a;
};
/** ขนาด/ทรง: id ฝั่งเว็บ (อังกฤษ) → ชื่อไทยที่ลูกค้าเห็น */
const sizes: { id: string; name: string }[] = attrOf("size").values.map((v: any) => ({
  id: v.id,
  name: String(v.displayName).split("|")[0].trim(),
}));
const laminates: string[] = attrOf("Laminate").values.map((v: any) => v.id);
console.log(`📋 เว็บต้นทาง: ขนาด ${sizes.length} ทรง · การเคลือบ ${laminates.length} แบบ`);

/** ราคารวม (net) ของจำนวน qty แผ่น A3 เมื่อเลือกการเคลือบ lam */
const priceOf = async (qty: number, lam: string): Promise<number> => {
  const params = encodeURIComponent(JSON.stringify([{ Laminate: lam }]));
  const rows = await api(`prices/?productFamilyId=${PF}&currency=THB&quantity=${qty}&params=${params}`);
  const net = rows?.[0]?.net;
  if (typeof net !== "number") throw new Error(`ราคา qty=${qty} lam=${lam} อ่านไม่ได้: ${JSON.stringify(rows)}`);
  return net;
};

/* ── 1b. ตารางราคา: สไลซ์ "ไดคัท 50% × PP ขาวมัน" ของสติ๊กเกอร์ Digital ──── */
const FROM = "sticker-pp";
const DIECUT = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)";
const MATERIAL = "PP ขาวมัน";
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";

const { data: srcRow, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
const src: any = srcRow.data;
const srcPricing = src.pricing;
const WANT_DRIVERS = ["แบบไดคัท", "ชนิดสติ๊กเกอร์", COAT_LABEL];
if (String(srcPricing?.driverLabels) !== String(WANT_DRIVERS))
  throw new Error(
    `แกนตารางราคาของ ${FROM} เปลี่ยนไปแล้ว (${srcPricing?.driverLabels?.join(" × ")}) — มาดูเองก่อน`
  );

const TIERS: PriceTier[] = structuredClone(srcPricing.tiers) as PriceTier[];
const COATS = ["ไม่เคลือบ", "เคลือบเงา", "เคลือบด้าน", "เคลือบพิเศษ"] as const;
const CELLS: Record<string, number[]> = {};
for (const coat of COATS) {
  const row = srcPricing.cells[`${DIECUT}│${MATERIAL}│${coat}`];
  if (!row) throw new Error(`ไม่เจอแถวราคา "${DIECUT}│${MATERIAL}│${coat}" ใน ${FROM} — โครงต้นทางเปลี่ยน`);
  CELLS[coat] = [...row];
}
console.log(
  `💰 ราคายกมาจาก "${srcRow.name}" — ${DIECUT} × ${MATERIAL} · ${TIERS.length} ขั้น (หน่วย ${srcPricing.unit})`
);

/*
 * CROSS-CHECK: หน้าร้านจริง (getprintbox) ยังขายสติ๊กเกอร์รูปทรงขั้นแรกเท่าตารางนี้อยู่ไหม
 * ไม่ตรง = ราคาฝั่งใดฝั่งหนึ่งขยับแล้ว — เตือนไว้ให้เห็น ไม่ใช่หยุด (ราคาขายยึดตาราง sticker-pp ตามที่ผู้ใช้สั่ง)
 */
const siteBase = await priceOf(1, "No liminate");
const siteGloss = await priceOf(1, "gloss");
const siteSpecial = await priceOf(1, "glitter");
const same = siteBase === CELLS["ไม่เคลือบ"][0] && siteGloss === CELLS["เคลือบเงา"][0];
console.log(
  `🔎 เทียบหน้าร้านจริง (1 แผ่น A3): ไม่เคลือบ ${siteBase} · เงา ${siteGloss} · กลิตเตอร์ ${siteSpecial} → ` +
    (same ? "ตรงกับตาราง (พิเศษของเว็บถูกกว่าตาราง 10 บาท)" : "⚠️ ไม่ตรงกับตารางแล้ว มาดูก่อนว่าฝั่งไหนขยับ")
);

/* ── 2. ภาพ ─────────────────────────────────────────────────────── */
/** ภาพงานจริงรายทรงบนหน้า /shapesticker/ (คีย์ = id ขนาดฝั่งเว็บ) */
const SHAPE_IMG: Record<string, string> = {
  "Circle 4pcs": "25/e1/15/1752207993/SSTK-ทรงกลม 5x5cm (4 ดวง).png",
  "Circle 9pcs": "9d/7b/09/1752207993/SSTK-ทรงกลม 3x3cm (9 ดวง).png",
  "Cloud 9pcs": "84/2d/9a/1752207993/SSTK-ก้อนเมฆ 3.5x2.5cm (9 ดวง).png",
  "Flower 4pcs": "bd/22/e4/1752207993/SSTK-ดอกไม้ 5x5cm (4 ดวง).png",
  "Frame 9pcs": "fc/31/ae/1752207993/SSTK-กรอบรูป 3x3cm (4 ดวง).png",
  "Heart 9pcs": "da/f7/c2/1752207993/SSTK-หัวใจ 3.5x3.5cm (9 ดวง).png",
  "Square 4pcs": "77/f4/b9/1752208404/SSTK-5x5cm(4ดวง).png",
  "Square 9pcs": "03/b3/1f/1752208404/SSTK-3x3cm(9ดวง).png",
  "Star 4pcs": "a3/68/39/1752207993/SSTK-ดาว 5x4.78cm (4ดวง).png",
};
const slugOf = (id: string) => id.toLowerCase().replace(/\s+/g, "-").replace("pcs", "");
/** แกลเลอรี: แบนเนอร์ + ภาพงานจริงจากหน้าสินค้าเดิม (cdn ของ getprintbox) */
const GALLERY: [name: string, url: string, label: string][] = [
  [
    "gallery-1",
    "https://storage.googleapis.com/pbx-sw-tpdigital/media/22/db/89/1771991856/SSTK.jpg",
    "สติ๊กเกอร์รูปทรงกลม พิมพ์ลาย iDucky",
  ],
  [
    "gallery-2",
    "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/d573868e-2aea-4051-829c-ed69b2b1c50e/SHAPE%20STICKER_thumb_900x900",
    "ทรงกลม 5x5 ซม. 4 ดวง — งานจริง",
  ],
  [
    "gallery-3",
    "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/3dff3564-216c-40ec-8ac7-2d469c1908f4/shikishi_thumb_900x900",
    "สี่เหลี่ยม 3x3 ซม. 9 ดวง — งานจริง",
  ],
  [
    "gallery-4",
    "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/88193a6c-aa76-4a6b-b594-4b38ec7c8d62/shikishi_thumb_900x900",
    "หัวใจ 3.5x3.5 ซม. 9 ดวง — งานจริง",
  ],
  [
    "gallery-5",
    "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/1e9fc2c2-7bbb-4719-89d7-76b4fa8165a1/shikishi_thumb_900x900",
    "สี่เหลี่ยม 5x5 ซม. 4 ดวง — งานจริง",
  ],
];
/** ผังตัวอย่างการวางแบบ (Print size) จากหน้าเว็บ — ใช้ในแท็บการเตรียมไฟล์ */
const LAYOUT = "https://storage.googleapis.com/pbx-sw-tpdigital/media/53/56/ec/1767612034/PS-SHAPE STICKER-01.jpg";

const grab = async (url: string, file: string) => {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(encodeURI(url).replace(/%25/g, "%"));
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
};

// ภาพรายทรง: 765×664 มีแถบคำบรรยายอยู่ท้ายภาพ ~80px — ตัดออกเหลือเฉพาะรูป (ชื่อทรงโชว์ใต้การ์ดอยู่แล้ว)
for (const s of sizes) {
  const path = SHAPE_IMG[s.id];
  if (!path) throw new Error(`เว็บเพิ่มทรงใหม่ "${s.id}" ที่ยังไม่มีภาพในสคริปต์ — มาเติมเองก่อน`);
  const raw = await grab(`https://storage.googleapis.com/pbx-sw-tpdigital/media/${path}`, `${DIR}/src/${slugOf(s.id)}.png`);
  const meta = await sharp(raw).metadata();
  const h = Math.round((meta.height ?? 664) * 0.88);
  await sharp(raw)
    .flatten({ background: "#ffffff" })
    .extract({ left: 0, top: 0, width: meta.width ?? 765, height: h })
    .jpeg({ quality: 88 })
    .toFile(`${OUT}/size-${slugOf(s.id)}-${V}.jpg`);
}
console.log(`🖼  ภาพรายทรง ${sizes.length} ใบ → ${OUT}/size-*.jpg`);

for (const [name, url] of GALLERY) {
  const raw = await grab(url, `${DIR}/src/${name}.bin`);
  await sharp(raw).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(`${OUT}/${name}-${V}.jpg`);
}
const layoutRaw = await grab(LAYOUT, `${DIR}/src/layout.jpg`);
await sharp(layoutRaw).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/layout-${V}.jpg`);
console.log(`🖼  แกลเลอรี ${GALLERY.length} ใบ + ผังวางแบบ 1 ใบ`);

/* ── 3. ตัวสินค้า ───────────────────────────────────────────────── */
/** จำนวนดวงต่อแผ่นสติ๊กเกอร์ (อ่านจากชื่อ id ฝั่งเว็บ "Circle 4pcs") */
const dotsOf = (id: string) => Number(/(\d+)\s*pcs/i.exec(id)?.[1] ?? 0);
const SHEETS_PER_A3 = 6; // ป้ายบนเว็บ: "จำนวน 6 แผ่น / 1A3"

const sizeGroup: ProductOption = {
  label: "ขนาด",
  note: `ราคาคิดเป็น **แผ่น A3** — 1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์ (ทุกทรงราคาเท่ากัน)`,
  display: "cards",
  choices: sizes.map((s) => {
    const dots = dotsOf(s.id);
    return {
      name: s.name,
      // ป้ายนับเป็น "แผ่น" ไม่ใช่ "ดวง" (ผู้ใช้สั่ง 1 ก.ย. 69) — ทุกทรงได้ 6 แผ่นเท่ากัน จำนวนดวงบอกไว้ในคำอธิบาย
      desc: `1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่น · แผ่นละ ${dots} ดวง`,
      badge: `${SHEETS_PER_A3} แผ่น / แผ่น A3`,
      imageSrc: IMG(`size-${slugOf(s.id)}`),
      piecesPerUnit: SHEETS_PER_A3,
      perUnit: SHEETS_PER_A3,
      ...(s.id === "Circle 4pcs" ? { popular: true } : {}),
    };
  }),
};

/** ชุดเคลือบยกมาจาก postcard-th ทั้งชุด (ชื่อ · คำอธิบาย · ภาพ) */
const coatGroup: ProductOption = {
  label: "เคลือบ (เฉพาะด้านหน้า)",
  note:
    `ค่าเคลือบรวมอยู่ในราคาต่อแผ่น A3 แล้ว — ชุดเดียวกับ**สติ๊กเกอร์ Digital (ไดคัท 50%)** · ` +
    `ช่วง ${TIERS[0].label}: ไม่เคลือบ ${CELLS["ไม่เคลือบ"][0]} · เงา/ด้าน ${CELLS["เคลือบเงา"][0]} · พิเศษ ${CELLS["เคลือบพิเศษ"][0]} บาท`,
  display: "cards",
  choices: [
    { name: "ไม่เคลือบ", desc: "งานพิมพ์เปลือย ไม่เคลือบฟิล์ม — ราคาเบาที่สุด", imageSrc: COAT("none") },
    { name: "เคลือบเงา", desc: "ฟิล์มใสผิวเงา สีดูสดขึ้น กันรอยขีดข่วน/ความชื้นได้ดีขึ้น", imageSrc: COAT("gloss"), popular: true },
    { name: "เคลือบด้าน", desc: "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน ให้ลุคมินิมอลดูแพง", imageSrc: COAT("matte") },
    { name: "เคลือบพิเศษ", desc: "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม (เลือกลายด้านล่าง)", imageSrc: COAT("glitter") },
  ],
};

/** ลายฟิล์มเคลือบพิเศษ 10 แบบ — ลิงก์คลังตัวเลือกกลาง preset-2 (ชุดเดียวกับโปสการ์ด/สติ๊กเกอร์ Digital) */
const SPECIAL = [
  ["กลิตเตอร์", "glitter"],
  ["ทราย", "sand"],
  ["hologram-รุ้ง", "rainbow"],
  ["hologram-ดาว", "star"],
  ["hologram-หิมะ", "snow"],
  ["hologram-หัวใจ", "heart"],
  ["hologram-เหลี่ยม", "facet"],
  ["hologram-จุด", "dot"],
  ["hologram-Dust", "dust"],
  ["hologram-Stardust", "stardust"],
] as const;
const specialGroup: ProductOption = {
  label: "เคลือบ",
  presetId: "preset-2",
  display: "cards",
  showWhen: { label: "เคลือบ (เฉพาะด้านหน้า)", choices: ["เคลือบพิเศษ"] },
  choices: SPECIAL.map(([name, file]) => ({ name, imageSrc: COAT(file) })),
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::เนื้อสติ๊กเกอร์::",
      "• กระดาษสติ๊กเกอร์ PP (ขาวเงา) — กันน้ำ ไม่ฉีกขาดง่าย ลอกใช้ทีละดวง",
      "• พิมพ์ระบบ Digital สีคมชัด · ไดคัทตามรูปทรงสำเร็จ ไม่ต้องออกแบบเส้นตัดเอง",
      "::รูปทรงและจำนวน::",
      `• เลือกได้ ${sizes.length} ทรง: ${sizes.map((s) => s.name).join(" · ")}`,
      `• 1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์เท่ากันทุกทรง — จำนวนดวงต่อแผ่นต่างกันตามทรงที่เลือก (4 หรือ 9 ดวง)`,
      "::ราคา::",
      `• คิดเป็นแผ่น A3 — ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50% · ${MATERIAL}) ลดเป็นขั้นตามจำนวน ${TIERS.length} ขั้น`,
      `• ${TIERS[0].label} ไม่เคลือบ ${CELLS["ไม่เคลือบ"][0]} บาท/แผ่น A3 · เคลือบเงา/ด้าน ${CELLS["เคลือบเงา"][0]} · เคลือบพิเศษ ${CELLS["เคลือบพิเศษ"][0]}`,
      `• สั่งเยอะสุด (${TIERS[TIERS.length - 1].label}) เหลือแผ่นละ ${CELLS["ไม่เคลือบ"][TIERS.length - 1]} บาท — ดูราคาทุกขั้นได้ที่ตารางราคาด้านบน`,
      "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
      "::ระยะเวลาผลิต::",
      "• 2-3 วันทำการ ไม่รวมเวลาจัดส่ง",
    ].join("\n"),
    images: [IMG("gallery-1"), IMG("gallery-3")],
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      "• ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
      "• งานสติ๊กเกอร์/กระดาษ การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้",
      "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. จากข้อจำกัดของเครื่องตัด",
      "• งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% — ผลิตคนละรอบ/คนละเครื่องสีอาจไม่เท่ากัน",
    ].join("\n"),
  },
  {
    title: "วิธีสั่งงาน",
    text:
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกทรง → การเคลือบ → จำนวนแผ่น A3 แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนลายที่คละ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n' +
      "หรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ทรง/การเคลือบที่เลือก · จำนวนแผ่น A3 · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์ JPG / PNG ขนาดไฟล์ไม่เกิน 10,000 pixels · ความละเอียดไม่ต่ำกว่า 300 dpi",
      "• งานกระดาษ/สติ๊กเกอร์พิมพ์สี RGB — ควรตั้งโหมดไฟล์เป็น RGB ก่อนวาด Artwork",
      "• ขนาดไฟล์ควรเท่าหรือใหญ่กว่าขนาดงานที่สั่ง และเผื่อตัดตกด้านละ 1 มม.",
      "• ข้อความหรือส่วนสำคัญ ควรวางให้อยู่ในระยะปลอดภัย ไม่ชิดขอบตัด",
      "• แนบไฟล์โดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว",
    ].join("\n"),
    images: [IMG("layout")],
    imageSize: "lg",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n• รอยขีดข่วน รอยขนแมว รอยจุด รอยเปื้อนเล็กน้อยที่ไม่มีผลต่อการใช้งาน\n• กรณีงานเคลม ทางบริษัทใช้ไฟล์เดิมเท่านั้น\n\n" +
      "ระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  slug: "shape-sticker",
  name: NAME,
  category: "sticker-paper",
  price: CELLS["ไม่เคลือบ"][TIERS.length - 1], // ราคาต่ำสุดในตาราง (ขั้นสั่งเยอะสุด)
  emoji: "🏷️",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "สติ๊กเกอร์รูปทรง (SHAPE STICKER) พิมพ์ลายตามสั่งบนกระดาษสติ๊กเกอร์ PP ขาวเงา ระบบ Digital Printing " +
    `ไดคัทเป็นรูปทรงสำเร็จให้เลือก ${sizes.length} ทรง — ทรงกลม สี่เหลี่ยม หัวใจ ดาว ดอกไม้ ก้อนเมฆ กรอบรูป ` +
    `คิดราคาเป็นแผ่น A3 (1 แผ่น A3 ได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์) เลือกเคลือบเงา ด้าน ` +
    "หรือเคลือบพิเศษกลิตเตอร์/ทราย/โฮโลแกรม 10 ลาย · ไม่มีขั้นต่ำ สั่ง 1 แผ่นก็ได้ ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    `รูปทรงสำเร็จ ${sizes.length} แบบ — ไม่ต้องออกแบบเส้นไดคัทเอง`,
    `1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์ทุกทรง (แผ่นละ 4 หรือ 9 ดวงตามทรง)`,
    "เคลือบเงา / ด้าน / เคลือบพิเศษ กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย",
    "กระดาษสติ๊กเกอร์ PP ขาวเงา กันน้ำ · พิมพ์ Digital สีคมชัด",
    `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) — ${CELLS["ไม่เคลือบ"][0]} บาท/แผ่น A3 สั่งเยอะเหลือ ${CELLS["ไม่เคลือบ"][TIERS.length - 1]} บาท`,
  ],
  images: [
    ...GALLERY.map(([name, , label]) => ({
      emoji: "🏷️",
      gradient: "from-sky-100 to-cyan-200",
      label,
      src: IMG(name),
    })),
  ],
  pricing: {
    unit: "แผ่น A3",
    driverLabels: ["เคลือบ (เฉพาะด้านหน้า)"],
    tiers: TIERS,
    cells: CELLS,
  },
  options: [sizeGroup, coatGroup, specialGroup],
  // เลือก "เคลือบพิเศษ" แล้วต้องระบุลายฟิล์ม — ชุดเดียวกับโปสการ์ด
  rules: [
    {
      when: { label: "เคลือบ (เฉพาะด้านหน้า)", choice: "เคลือบพิเศษ", choices: ["เคลือบพิเศษ"] },
      limit: { label: "เคลือบ", allow: SPECIAL.map(([name]) => name) },
    },
  ],
  // ค่าคละลายชุดเดียวกับโปสการ์ด / สติ๊กเกอร์ Digital (ลายละ 5 บาท ลายแรกไม่คิด)
  mixRule: { baseFee: 5, includedDesigns: 2, extraFee: 5, tiers: [{ fromQty: 1, baseFee: 5, includedDesigns: 2, extraFee: 5 }] },
  terms: [
    `• 1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์ — ราคาและจำนวนที่สั่งนับเป็นแผ่น A3`,
    "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
    `• เคลือบเงา/ด้าน/พิเศษ คิดรวมอยู่ในตารางราคาแล้ว — เลือกที่ตัวเลือกได้เลย (ชุดราคาเดียวกับสติ๊กเกอร์ Digital ไดคัท 50%)`,
    "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. · งานเคลือบลามิเนตอาจมีฝุ่นเล็กน้อย",
    "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
  ].join("\n"),
  tabs: TABS,
  seo: {
    title: "รับผลิตสติ๊กเกอร์รูปทรง 9 แบบ พิมพ์ลายตามสั่ง | iDucky Prints",
    description:
      "รับผลิตสติ๊กเกอร์รูปทรง (Shape Sticker) ทรงกลม สี่เหลี่ยม หัวใจ ดาว ดอกไม้ ก้อนเมฆ กรอบรูป " +
      `กระดาษสติ๊กเกอร์ PP กันน้ำ เคลือบเงา/ด้าน/กลิตเตอร์/โฮโลแกรม คิดเป็นแผ่น A3 (1 แผ่น A3 ได้ ${SHEETS_PER_A3} แผ่น) เริ่ม ${CELLS["ไม่เคลือบ"][TIERS.length - 1]} บาท ไม่มีขั้นต่ำ ส่งทั่วไทย`,
    faqs: [
      {
        q: "สติ๊กเกอร์รูปทรงคิดราคายังไง 1 แผ่น A3 ได้กี่แผ่น?",
        a:
          `คิดเป็นแผ่น A3 — 1 แผ่น A3 ตัดได้ ${SHEETS_PER_A3} แผ่นสติ๊กเกอร์เท่ากันทุกทรง ` +
          `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50% · ${MATERIAL}) เริ่ม ${CELLS["ไม่เคลือบ"][0]} บาท/แผ่น A3 ` +
          `สั่งเยอะลดเป็นขั้นถึงแผ่นละ ${CELLS["ไม่เคลือบ"][TIERS.length - 1]} บาท`,
      },
      {
        q: "มีรูปทรงอะไรให้เลือกบ้าง?",
        a: `เลือกได้ ${sizes.length} ทรง: ${sizes.map((s) => s.name).join(" · ")}`,
      },
      {
        q: "เคลือบมีกี่แบบ ราคาเท่าไหร่?",
        a:
          `เลือกได้ 4 แบบ: ไม่เคลือบ ${CELLS["ไม่เคลือบ"][0]} · เคลือบเงา ${CELLS["เคลือบเงา"][0]} · เคลือบด้าน ${CELLS["เคลือบด้าน"][0]} · ` +
          `เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย) ${CELLS["เคลือบพิเศษ"][0]} บาท/แผ่น A3 ในช่วง ${TIERS[0].label} — สั่งเยอะราคาลดทุกแบบ`,
      },
      { q: "ใช้เวลาผลิตกี่วัน มีขั้นต่ำไหม?", a: "ผลิต 2-3 วันทำการ ไม่รวมจัดส่ง · ไม่มีขั้นต่ำ สั่ง 1 แผ่น A3 ก็ได้" },
    ],
  },
  hidden: true, // ยังเป็นฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log("\n📦 สรุปสินค้า");
console.log(`   ราคา ${range.min}-${range.max} บาท/แผ่น A3 · ${saved.options.length} กลุ่มตัวเลือก`);
for (const [k, v] of Object.entries(CELLS)) console.log(`   ${k.padEnd(14)} ${v.join(" / ")}`);
console.log(`   ขนาด: ${sizes.map((s) => s.name).join(" · ")}`);

// แกนตารางราคาต้องมีกลุ่มรองรับ ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
const labels = new Set(saved.options.map((o) => o.label));
for (const d of saved.pricing!.driverLabels) if (!labels.has(d)) throw new Error(`แกนราคา "${d}" ไม่มีกลุ่มตัวเลือกรองรับ`);
for (const r of saved.rules ?? [])
  for (const l of [r.when.label, r.limit.label]) if (!labels.has(l)) throw new Error(`กฎอ้างกลุ่ม "${l}" ที่ไม่มีจริง`);

if (!WRITE) {
  console.log(`\n(ยังไม่เขียน — เปิดภาพใน ${OUT} ดูก่อน แล้วใส่ --write เพื่ออัปภาพ + บันทึกลง Supabase)`);
  process.exit(0);
}

const { data: row, error: rowErr } = await sb.from("products").select("id,name,sort").eq("id", ID).maybeSingle();
if (rowErr) throw rowErr;
if (row && row.name !== NAME) throw new Error(`id ${ID} เป็นสินค้าอื่นแล้ว: "${row.name}" — หยุดไว้ก่อน`);

for (const file of readdirSync(OUT).filter((f) => f.endsWith(".jpg"))) {
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, readFileSync(`${OUT}/${file}`), { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file} ไม่สำเร็จ: ${up.error.message}`);
  console.log(`⬆️  ${file}`);
}

const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
const sort = (row?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
const { error } = await sb.from("products").upsert(
  {
    id: saved.id,
    name: saved.name,
    category: saved.category, // คอลัมน์กระจกต้องอัปตามด้วย ไม่งั้นหน้ารายการยังโชว์หมวดเก่า
    price: saved.price,
    sold: saved.sold,
    featured: false,
    badge: saved.badge ?? null,
    sort,
    data: saved,
  },
  { onConflict: "id" }
);
if (error) throw error;
console.log(`\n✅ บันทึกแล้ว: ${ID} (sort ${sort}) — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);

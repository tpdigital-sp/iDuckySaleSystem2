#!/usr/bin/env npx tsx
/**
 * GIVEAWAY STICKER / สติ๊กเกอร์แจก — สร้างสินค้าจากร่างเปล่าที่ผู้ใช้กด "＋ เพิ่มสินค้า" ไว้
 *
 *   npx tsx scripts/giveaway-sticker-build.mts           # ดึงราคา/ภาพลง .cache แล้วสรุปให้ดู (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/giveaway-sticker-build.mts --write   # อัปภาพ + เขียนลง Supabase (ยังเป็นฉบับร่าง)
 *
 * ── ที่มาของราคา (ผู้ใช้สั่ง 1 ก.ย. 69) ─────────────────────────────────────
 * "ชนิดสติ๊กเกอร์ + เคลือบเงา/ด้าน/พิเศษ ราคาเดียวกับสติ๊กเกอร์ Digital"
 * → ยกตารางจาก sticker-pp เฉพาะสไลซ์ แบบไดคัท = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)"
 *   เหลือ 2 แกน: ชนิดสติ๊กเกอร์ (5 เนื้อ) × เคลือบ (4 แบบ) × 9 ขั้นจำนวน — อ่านสดจาก Supabase ทุกครั้ง
 *
 * ทำไมสไลซ์ไดคัท 50%: ราคาบนหน้าร้านจริงของสติ๊กเกอร์แจก (90 บาท/แผ่น A3 ช่วง 1-10 · 80 ช่วง 11+)
 * ตรงกับแถว "ไดคัท 50% × PP ขาวมัน" พอดี — สคริปต์ยิง API หน้าร้านมา cross-check ให้ทุกครั้ง
 * (สินค้าเดิมบนหน้าร้านมีเนื้อเดียว PP ขาวเงา · ที่นี่เปิดให้เลือก 5 เนื้อตามที่ผู้ใช้สั่ง)
 *
 * ── ที่มาของตัวเลือก/ภาพ ───────────────────────────────────────────────────
 * https://www.iduckyprintsstudio.com/giveawaysticker/ — เพจ Nuxt ยิง API getprintbox
 *   • product-families/381/  → กลุ่ม "รูปแบบ" 4 ทรง (ทรงกลม · หัวใจ · สี่เหลี่ยม · ดาว) ทรงละ 35 ดวง/แผ่น A3
 *   • prices/                → ใช้ cross-check เฉย ๆ ไม่ได้เอามาเป็นราคาขาย
 * ต้องใส่ header X-version: v6 + X-Pbx-Store-Name: iDuckyOfficial ไม่งั้นตอบ 400 · ใช้ค่า net (ไม่รวม VAT)
 *
 * ภาพประกอบตัวเลือก (ผู้ใช้สั่ง: อยากเห็นว่าแต่ละแบบหน้าตาเป็นยังไง):
 *   • "รูปแบบ" — ภาพงานจริงรายทรงจากหน้าเว็บ GWS-3..6 (เรียงตรงกับ Circle/Heart/Square/Star)
 *   • "ชนิดสติ๊กเกอร์" — ใช้ภาพเนื้อสติ๊กเกอร์ชุดเดิมของ sticker-pp (products/sticker-pp/pp-*.jpg)
 *   • "เคลือบ" — ภาพชุดกลางทั้งร้าน products/coating-b/* (ชุด B)
 *   • แกลเลอรี 3 ใบ — ภาพหน้าปกสินค้า + แบนเนอร์งานจริง 2 ใบ (ภาพรายทรง/เนื้อ/เคลือบ ระบบดูดเข้าแกลเลอรีเอง)
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceTier, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1vpmh-5692"; // ร่างเปล่าที่ผู้ใช้สร้างไว้ 1 ก.ย. 69
const NAME = "GIVEAWAY STICKER / สติ๊กเกอร์แจก";
const DIR = ".cache/giveaway-sticker";
const OUT = `${DIR}/upload`;
const V = "v1";
const PF = 381; // product family ของ GIVEAWAY STICKER บนระบบ getprintbox
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

/* ── 1. ตัวเลือก "รูปแบบ" จาก API หน้าร้าน ─────────────────────────── */
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

const family = await api(`product-families/${PF}/?moduleId=379&channel=web`);
const attrOf = (id: string) => {
  const a = (family.attributes ?? []).find((x: any) => x.id === id);
  if (!a) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${id}" ในเว็บต้นทางแล้ว — โครงหน้าเปลี่ยน มาดูเองก่อน`);
  return a;
};
/** รูปแบบ (ทรง): id ฝั่งเว็บ (อังกฤษ) → ชื่อไทยที่ลูกค้าเห็น เช่น "ทรงกลม 4x4cm (35 ดวง)" */
const shapes: { id: string; name: string }[] = attrOf("size").values.map((v: any) => ({
  id: v.id,
  name: String(v.displayName).split("|")[0].trim(),
}));
console.log(`📋 เว็บต้นทาง: รูปแบบ ${shapes.length} ทรง — ${shapes.map((s) => s.name).join(" · ")}`);

/** ราคารวม (net) ของจำนวน qty แผ่น A3 เมื่อเลือกการเคลือบ lam */
const priceOf = async (qty: number, lam: string): Promise<number> => {
  const params = encodeURIComponent(JSON.stringify([{ Laminate: lam }]));
  const rows = await api(`prices/?productFamilyId=${PF}&currency=THB&quantity=${qty}&params=${params}`);
  const net = rows?.[0]?.net;
  if (typeof net !== "number") throw new Error(`ราคา qty=${qty} lam=${lam} อ่านไม่ได้: ${JSON.stringify(rows)}`);
  return net;
};

/* ── 2. ตารางราคา: สไลซ์ "ไดคัท 50%" ของสติ๊กเกอร์ Digital ────────── */
const FROM = "sticker-pp";
const DIECUT = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)";
const MAT_LABEL = "ชนิดสติ๊กเกอร์";
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";
const SPECIAL_LABEL = "เคลือบ";

const { data: srcRow, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
const src: any = srcRow.data;
const srcPricing = src.pricing;
const WANT_DRIVERS = ["แบบไดคัท", MAT_LABEL, COAT_LABEL];
if (String(srcPricing?.driverLabels) !== String(WANT_DRIVERS))
  throw new Error(`แกนตารางราคาของ ${FROM} เปลี่ยนไปแล้ว (${srcPricing?.driverLabels?.join(" × ")}) — มาดูเองก่อน`);

/** ยกกลุ่มตัวเลือกของ sticker-pp มาทั้งกลุ่ม (ชื่อ · คำอธิบาย · ภาพ) — ผูกกันกับตารางราคาอยู่แล้ว */
const groupOf = (label: string): ProductOption => {
  const g = (src.options ?? []).find((o: any) => o.label === label);
  if (!g) throw new Error(`ไม่เจอกลุ่ม "${label}" ใน ${FROM} — โครงต้นทางเปลี่ยน มาดูเองก่อน`);
  return structuredClone(g) as ProductOption;
};
const matGroup = groupOf(MAT_LABEL);
const coatGroup = groupOf(COAT_LABEL);
const specialGroup = groupOf(SPECIAL_LABEL); // ลายฟิล์มเคลือบพิเศษ 10 ลาย (ลิงก์คลัง preset-2)

const TIERS: PriceTier[] = structuredClone(srcPricing.tiers) as PriceTier[];
const MATERIALS = matGroup.choices.map((c) => c.name);
const COATS = coatGroup.choices.map((c) => c.name);
const CELLS: Record<string, number[]> = {};
for (const mat of MATERIALS)
  for (const coat of COATS) {
    const row = srcPricing.cells[`${DIECUT}│${mat}│${coat}`];
    if (!row) throw new Error(`ไม่เจอแถวราคา "${DIECUT}│${mat}│${coat}" ใน ${FROM} — โครงต้นทางเปลี่ยน`);
    CELLS[`${mat}│${coat}`] = [...row];
  }
console.log(
  `💰 ราคายกมาจาก "${srcRow.name}" — ${DIECUT} · ${MATERIALS.length} เนื้อ × ${COATS.length} เคลือบ × ${TIERS.length} ขั้น`
);

/*
 * CROSS-CHECK: หน้าร้านจริง (getprintbox) ยังขายสติ๊กเกอร์แจกเท่าแถว PP ขาวมันของตารางนี้อยู่ไหม
 * ไม่ตรง = ราคาฝั่งใดฝั่งหนึ่งขยับแล้ว — เตือนไว้ให้เห็น ไม่ใช่หยุด (ราคาขายยึดตาราง sticker-pp ตามที่ผู้ใช้สั่ง)
 */
const REF = `PP ขาวมัน│ไม่เคลือบ`;
const siteBase = await priceOf(1, "No liminate");
const siteGloss = await priceOf(1, "gloss");
console.log(
  `🔎 เทียบหน้าร้านจริง (1 แผ่น A3): ไม่เคลือบ ${siteBase} · เงา ${siteGloss} · ตาราง ${REF} = ${CELLS[REF][0]} → ` +
    (siteBase === CELLS[REF][0] ? "ตรงกัน" : "⚠️ ไม่ตรงแล้ว มาดูก่อนว่าฝั่งไหนขยับ")
);

/* ── 3. ภาพ ─────────────────────────────────────────────────────── */
const GS = "https://storage.googleapis.com/pbx-sw-tpdigital/media";
/** ภาพงานจริงรายทรงบนหน้า /giveawaysticker/ (คีย์ = id รูปแบบฝั่งเว็บ) — ตรวจแล้วว่าตรงทรง */
const SHAPE_IMG: Record<string, string> = {
  Circle: `${GS}/80/74/e8/1750483522/GWS-3.jpg`,
  Heart: `${GS}/87/fa/a9/1750483522/GWS-4.jpg`,
  Square: `${GS}/2f/06/70/1750483522/GWS-5.jpg`,
  Star: `${GS}/bb/a3/4c/1750483522/GWS-6.jpg`,
};
/** แกลเลอรี: หน้าปกสินค้าจาก cdn + แบนเนอร์งานจริง 2 ใบ */
const GALLERY: [name: string, url: string, label: string][] = [
  [
    "gallery-1",
    `${GS}/6f/3c/08/1750483522/GWS-1.jpg`,
    "สติ๊กเกอร์แจก 4 ทรง — งานจริงบนสมุด",
  ],
  [
    "gallery-2",
    "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/0c7d2570-599b-4f06-9fe5-12863bd9e4bc/GIVEAWAY%20STICKER_thumb_900x900",
    "สติ๊กเกอร์แจก พิมพ์ลายตามสั่ง",
  ],
  ["gallery-3", `${GS}/f0/2a/8e/1750483522/GWS-2.jpg`, "สติ๊กเกอร์แจก — ลอกใช้ทีละดวง"],
];
/** ผังตัวอย่างการวางแบบ (Print size) จากหน้าเว็บ — ใช้ในแท็บการเตรียมไฟล์ */
const LAYOUT = `${GS}/ea/77/9f/1767613610/PS-GIVEAWAY STICKER-01.jpg`;

const grab = async (url: string, file: string) => {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(encodeURI(url).replace(/%25/g, "%"));
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
};

const slugOf = (id: string) => id.toLowerCase();
for (const s of shapes) {
  const url = SHAPE_IMG[s.id];
  if (!url) throw new Error(`เว็บเพิ่มรูปแบบใหม่ "${s.id}" ที่ยังไม่มีภาพในสคริปต์ — มาเติมเองก่อน`);
  const raw = await grab(url, `${DIR}/src/shape-${slugOf(s.id)}.jpg`);
  await sharp(raw).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(`${OUT}/shape-${slugOf(s.id)}-${V}.jpg`);
}
console.log(`🖼  ภาพรายทรง ${shapes.length} ใบ → ${OUT}/shape-*.jpg`);

for (const [name, url] of GALLERY) {
  const raw = await grab(url, `${DIR}/src/${name}.bin`);
  await sharp(raw).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(`${OUT}/${name}-${V}.jpg`);
}
const layoutRaw = await grab(LAYOUT, `${DIR}/src/layout.jpg`);
await sharp(layoutRaw).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/layout-${V}.jpg`);
console.log(`🖼  แกลเลอรี ${GALLERY.length} ใบ + ผังวางแบบ 1 ใบ`);

/* ── 4. ตัวสินค้า ───────────────────────────────────────────────── */
/** จำนวนดวงต่อแผ่น A3 — อ่านจากชื่อทรงฝั่งเว็บ "ทรงกลม 4x4cm (35 ดวง)" (ทุกทรงเท่ากัน) */
const dotsOf = (name: string) => Number(/\((\d+)\s*ดวง\)/.exec(name)?.[1] ?? 0);
const DOTS = dotsOf(shapes[0].name);
if (!DOTS || shapes.some((s) => dotsOf(s.name) !== DOTS))
  throw new Error(`จำนวนดวงต่อแผ่นไม่เท่ากันทุกทรงแล้ว (${shapes.map((s) => s.name).join(" · ")}) — มาปรับเองก่อน`);

const shapeGroup: ProductOption = {
  label: "รูปแบบ",
  note: `ราคาคิดเป็น **แผ่น A3** — 1 แผ่น A3 ได้ ${DOTS} ดวงเท่ากันทุกทรง (ทรงไม่มีผลกับราคา)`,
  display: "cards",
  choices: shapes.map((s) => ({
    name: s.name,
    desc: `ไดคัทตัดครึ่งเนื้อ ลอกออกทีละดวง · 1 แผ่น A3 ได้ ${DOTS} ดวง`,
    imageSrc: IMG(`shape-${slugOf(s.id)}`),
    piecesPerUnit: DOTS,
    perUnit: DOTS,
    ...(s.id === "Circle" ? { popular: true } : {}),
  })),
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::เนื้อสติ๊กเกอร์::",
      "• PP พรีเมี่ยม กันน้ำได้ ไม่ฉีกขาดง่าย · Removable ลอกออกได้โดยไม่ทิ้งคราบกาว",
      `• เลือกได้ ${MATERIALS.length} แบบ: ${MATERIALS.join(" · ")}`,
      "• พิมพ์ระบบ Digital สีคมชัด · ไดคัท 50% (ตัดครึ่งเนื้อ) ลอกใช้ทีละดวง",
      "::รูปแบบ::",
      `• ${shapes.length} ทรง: ${shapes.map((s) => s.name).join(" · ")}`,
      `• 1 แผ่น A3 ได้ ${DOTS} ดวงเท่ากันทุกทรง — ทรงไม่มีผลกับราคา`,
      "::ราคา::",
      `• คิดเป็นแผ่น A3 — ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) ลดเป็นขั้นตามจำนวน ${TIERS.length} ขั้น`,
      `• ${TIERS[0].label} · PP ขาวมัน: ไม่เคลือบ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} · เคลือบเงา/ด้าน ${CELLS["PP ขาวมัน│เคลือบเงา"][0]} · เคลือบพิเศษ ${CELLS["PP ขาวมัน│เคลือบพิเศษ"][0]} บาท/แผ่น A3`,
      `• สั่งเยอะสุด (${TIERS[TIERS.length - 1].label}) เหลือแผ่นละ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][TIERS.length - 1]} บาท — ดูราคาทุกแบบได้ที่ตารางราคาด้านบน`,
      "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 20 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
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
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกรูปแบบ → ชนิดสติ๊กเกอร์ → การเคลือบ → จำนวนแผ่น A3 แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนลายที่คละ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n' +
      "หรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: รูปแบบ/เนื้อสติ๊กเกอร์/การเคลือบที่เลือก · จำนวนแผ่น A3 · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
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

const cheapest = Math.min(...Object.values(CELLS).flat());
const product: Product = {
  id: ID,
  slug: "giveaway-sticker",
  name: NAME,
  category: "sticker-paper",
  price: cheapest,
  emoji: "🎁",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "สติ๊กเกอร์แจก (GIVEAWAY STICKER) พิมพ์ลายตามสั่งบนสติ๊กเกอร์ PP กันน้ำ ระบบ Digital Printing " +
    `ไดคัท 50% ตัดครึ่งเนื้อ ลอกใช้ทีละดวง — เลือกรูปทรงได้ ${shapes.length} แบบ ` +
    `${shapes.map((s) => s.name.replace(/\s*\(.*\)$/, "")).join(" · ")} · 1 แผ่น A3 ได้ ${DOTS} ดวง ` +
    `เลือกเนื้อสติ๊กเกอร์ได้ ${MATERIALS.length} แบบ และเคลือบเงา ด้าน หรือเคลือบพิเศษกลิตเตอร์/ทราย/โฮโลแกรม 10 ลาย ` +
    "เหมาะทำของแจก ของแถม ของที่ระลึก — ไม่มีขั้นต่ำ ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    `${shapes.length} รูปทรงให้เลือก — ทรงกลม · หัวใจ · สี่เหลี่ยม · ดาว (ขนาด ~4 ซม.)`,
    `1 แผ่น A3 ได้ ${DOTS} ดวงเท่ากันทุกทรง`,
    `เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ — ขาวมัน · ใสรองขาว · ใสไม่รองขาว · ขาวด้าน · ขาวมุก`,
    "เคลือบเงา / ด้าน / เคลือบพิเศษ กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย",
    `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) — เริ่ม ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} บาท/แผ่น A3 สั่งเยอะเหลือ ${cheapest} บาท`,
  ],
  images: GALLERY.map(([name, , label]) => ({
    emoji: "🎁",
    gradient: "from-sky-100 to-cyan-200",
    label,
    src: IMG(name),
  })),
  pricing: {
    unit: "แผ่น A3",
    driverLabels: [MAT_LABEL, COAT_LABEL],
    tiers: TIERS,
    cells: CELLS,
  },
  options: [shapeGroup, matGroup, coatGroup, specialGroup],
  // เลือก "เคลือบพิเศษ" แล้วต้องระบุลายฟิล์ม — กฎเดียวกับสติ๊กเกอร์ Digital
  rules: [
    {
      when: { label: COAT_LABEL, choice: "เคลือบพิเศษ", choices: ["เคลือบพิเศษ"] },
      limit: { label: SPECIAL_LABEL, allow: specialGroup.choices.map((c) => c.name) },
    },
  ],
  // งานไดคัท 50% ล้วน → ค่าคละลายละ 20 บาท ลายแรกไม่คิด (กติกาไดคัท 50% 26 ส.ค. 69)
  mixRule: { baseFee: 20, includedDesigns: 2, extraFee: 20, tiers: [{ fromQty: 1, baseFee: 20, includedDesigns: 2, extraFee: 20 }] },
  terms: [
    `• 1 แผ่น A3 ได้ ${DOTS} ดวงเท่ากันทุกทรง — ราคาและจำนวนที่สั่งนับเป็นแผ่น A3`,
    "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 20 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
    "• เนื้อสติ๊กเกอร์และการเคลือบคิดรวมอยู่ในตารางราคาแล้ว (ชุดเดียวกับสติ๊กเกอร์ Digital ไดคัท 50%)",
    "• งานไดคัท 50% ตัดครึ่งเนื้อ ได้มาทั้งแผ่น ลอกออกทีละดวง",
    "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. · งานเคลือบลามิเนตอาจมีฝุ่นเล็กน้อย",
    "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
  ].join("\n"),
  tabs: TABS,
  seo: {
    title: "รับผลิตสติ๊กเกอร์แจก 4 ทรง พิมพ์ลายตามสั่ง | iDucky Prints",
    description:
      "รับผลิตสติ๊กเกอร์แจก (Giveaway Sticker) ทรงกลม หัวใจ สี่เหลี่ยม ดาว ขนาด 4 ซม. " +
      `สติ๊กเกอร์ PP กันน้ำ ${MATERIALS.length} เนื้อ เคลือบเงา/ด้าน/กลิตเตอร์/โฮโลแกรม คิดเป็นแผ่น A3 (1 แผ่นได้ ${DOTS} ดวง) เริ่ม ${cheapest} บาท ไม่มีขั้นต่ำ ส่งทั่วไทย`,
    faqs: [
      {
        q: "สติ๊กเกอร์แจกคิดราคายังไง 1 แผ่น A3 ได้กี่ดวง?",
        a:
          `คิดเป็นแผ่น A3 — 1 แผ่น A3 ได้ ${DOTS} ดวงเท่ากันทุกทรง ` +
          `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) เริ่ม ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} บาท/แผ่น A3 ` +
          `สั่งเยอะลดเป็นขั้นถึงแผ่นละ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][TIERS.length - 1]} บาท`,
      },
      { q: "มีรูปทรงอะไรให้เลือกบ้าง?", a: `เลือกได้ ${shapes.length} ทรง: ${shapes.map((s) => s.name).join(" · ")}` },
      {
        q: "เนื้อสติ๊กเกอร์กับการเคลือบมีอะไรบ้าง?",
        a:
          `เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ: ${MATERIALS.join(" · ")} · ` +
          "เคลือบเลือกได้ 4 แบบ: ไม่เคลือบ · เคลือบเงา · เคลือบด้าน · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย) — ราคาต่างกันตามตาราง",
      },
      { q: "ใช้เวลาผลิตกี่วัน มีขั้นต่ำไหม?", a: "ผลิต 2-3 วันทำการ ไม่รวมจัดส่ง · ไม่มีขั้นต่ำ สั่ง 1 แผ่น A3 ก็ได้" },
    ],
  },
  hidden: true, // ยังเป็นฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log("\n📦 สรุปสินค้า");
console.log(`   ราคา ${range.min}-${range.max} บาท/แผ่น A3 · ${saved.options.length} กลุ่มตัวเลือก · ${Object.keys(CELLS).length} ช่องราคา`);
for (const coat of COATS) console.log(`   PP ขาวมัน │ ${coat.padEnd(12)} ${CELLS[`PP ขาวมัน│${coat}`].join(" / ")}`);
console.log(`   รูปแบบ: ${shapes.map((s) => s.name).join(" · ")}`);

// แกนตารางราคาต้องมีกลุ่มรองรับ ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
const labels = new Set(saved.options.map((o) => o.label));
for (const d of saved.pricing!.driverLabels) if (!labels.has(d)) throw new Error(`แกนราคา "${d}" ไม่มีกลุ่มตัวเลือกรองรับ`);
for (const r of saved.rules ?? [])
  for (const l of [r.when.label, r.limit.label]) if (!labels.has(l)) throw new Error(`กฎอ้างกลุ่ม "${l}" ที่ไม่มีจริง`);
// กลุ่มที่ยกมามี showWhen อ้างกลุ่มอื่นได้ — ต้องมีกลุ่มนั้นด้วย ไม่งั้นซ่อนตลอด
for (const o of saved.options)
  for (const c of [o.showWhen, o.showWhenAlso].filter(Boolean) as { label: string }[])
    if (!labels.has(c.label)) throw new Error(`กลุ่ม "${o.label}" อ้าง showWhen กลุ่ม "${c.label}" ที่ไม่มีจริง`);

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

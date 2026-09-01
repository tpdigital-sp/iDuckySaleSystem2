#!/usr/bin/env npx tsx
/**
 * CARD STICKER / สติ๊กเกอร์ติดบัตร — สร้างสินค้าจากร่างเปล่าที่ผู้ใช้กด "＋ เพิ่มสินค้า" ไว้
 *
 *   npx tsx scripts/card-sticker-build.mts           # ดึงราคา/วาดภาพลง .cache แล้วสรุปให้ดู (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/card-sticker-build.mts --write   # อัปภาพ + เขียนลง Supabase (ยังเป็นฉบับร่าง)
 *
 * ── ที่มาของราคา (ผู้ใช้สั่ง 1 ก.ย. 69) ─────────────────────────────────────
 * "ดึงราคาจาก https://www.iduckyprintsstudio.com/CardSticker/ · ชนิดสติ๊กเกอร์ + เคลือบเงา/ด้าน/พิเศษ
 *  ราคาเดียวกับสติ๊กเกอร์ Digital"
 * → ยกตารางจาก sticker-pp เฉพาะสไลซ์ แบบไดคัท = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)"
 *   เหลือ 2 แกน: ชนิดสติ๊กเกอร์ (5 เนื้อ) × เคลือบ (4 แบบ) × 9 ขั้นจำนวน — อ่านสดจาก Supabase ทุกครั้ง
 *   (ชุดเดียวกับ [[iducky-giveaway-sticker]] / [[iducky-shape-sticker]])
 *
 * ทำไมสไลซ์ไดคัท 50%: ราคาหน้าร้านจริง (1 แผ่น A3) ตรงกับแถว "ไดคัท 50% × PP ขาวมัน" ทั้งสามแบบเคลือบพอดี
 *   ไม่เคลือบ 90 · เงา/ด้าน 100 · กลิตเตอร์/Stardust/Dust 110  → สคริปต์ยิง API ไปเทียบให้ทุกครั้ง
 *   (หน้าร้านจริงขายเนื้อเดียว PP ขาวเงา · ที่เว็บเราเปิดครบ 5 เนื้อ ตามที่ผู้ใช้สั่งให้อิงสติ๊กเกอร์ Digital)
 *
 * ── ที่มาของตัวเลือก (ดึงสดจาก API หน้าร้าน ไม่ hardcode) ──────────────────
 * product family 386 บน getprintbox — header X-version: v6 + X-Pbx-Store-Name ไม่งั้นตอบ 400
 *   • size        → ขนาด 9.6 × 6.4 ซม. (18 ใบ / แผ่น A3)  [มีขนาดเดียว]
 *   • Option      → การตัด: แบบมุมมน / แบบมุมเหลี่ยม
 *   • Laminate    → ไม่เคลือบ/ด้าน/เงา/กลิตเตอร์/Stardust/Dust  (ฝั่งเราใช้กลุ่มเคลือบของสติ๊กเกอร์ Digital
 *                   ที่มีลายฟิล์มพิเศษครบ 10 ลาย — ครอบของหน้าร้านจริงอยู่แล้ว)
 *
 * ── ภาพประกอบตัวเลือก (ผู้ใช้สั่ง: อยากเห็นว่าแต่ละแบบหน้าตาเป็นยังไง) ──────
 *   • "ขนาด"            — วาดผัง 1 แผ่น A3 = 18 ใบ (6 × 3) ให้เห็นยอดต่อแผ่นทันที
 *   • "การตัด"          — วาดใบสติ๊กเกอร์ทรงเดียวกันเป๊ะ ต่างกันแค่มุม + มีวงซูมมุมขยาย
 *                          (หน้าร้านจริงไม่มีรูปคู่นี้ให้ดูด — เลยวาดเองให้เทียบกันได้ตรง ๆ)
 *   • "ชนิดสติ๊กเกอร์"   — ยกกลุ่มจาก sticker-pp ทั้งกลุ่ม ภาพเนื้อสติ๊กเกอร์ติดมาเอง
 *   • "เคลือบ"          — เช่นกัน (ภาพชุดกลางทั้งร้าน products/coating-b/*)
 *   • แกลเลอรี 2 ใบ + ผังวางแบบ 1 ใบ — ภาพงานจริงจากหน้า /CardSticker/
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v2 ครั้งหน้าขึ้น v3
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";
import { priceRange, type PriceTier, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1whnn-5683"; // ร่างเปล่าที่ผู้ใช้สร้างไว้ 1 ก.ย. 69
const NAME = "CARD STICKER / สติ๊กเกอร์ติดบัตร";
const DIR = ".cache/card-sticker";
const OUT = `${DIR}/upload`;
const V = "v2"; // v2 = ภาพ "การตัด" วาดใหม่ให้เหมือนงานจริง (แผ่นพิมพ์ + เส้นไดคัท + มุมลอก)
const PF = 386; // product family ของ สติ๊กเกอร์ติดบัตร บนระบบ getprintbox
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

/* ── 1. ตัวเลือกจาก API หน้าร้าน ───────────────────────────────────── */
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

const family = await api(`product-families/${PF}/?channel=web`);
const attrOf = (id: string) => {
  const a = (family.attributes ?? []).find((x: any) => x.id === id);
  if (!a) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${id}" ในเว็บต้นทางแล้ว — โครงหน้าเปลี่ยน มาดูเองก่อน`);
  return a;
};

/** ขนาด: หน้าร้านมีค่าเดียว "9.6x6.4cm | จำนวน 18 ใบ" — อ่านเลขจริงมา ไม่ hardcode */
const sizeValues = attrOf("size").values;
if (sizeValues.length !== 1)
  throw new Error(`หน้าร้านเพิ่มขนาดใหม่แล้ว (${sizeValues.map((v: any) => v.displayName).join(" · ")}) — มาปรับกลุ่ม "ขนาด" เองก่อน`);
const sizeText = String(sizeValues[0].displayName);
const dim = /([\d.]+)\s*x\s*([\d.]+)\s*cm/i.exec(sizeText);
const perSheetM = /จำนวน\s*(\d+)\s*ใบ/.exec(sizeText);
if (!dim || !perSheetM) throw new Error(`อ่านขนาด/จำนวนใบจาก "${sizeText}" ไม่ออก — รูปแบบข้อความฝั่งเว็บเปลี่ยน`);
const [W_CM, H_CM] = [Number(dim[1]), Number(dim[2])];
const PER_SHEET = Number(perSheetM[1]); // ใบต่อแผ่น A3
const SIZE_NAME = `${W_CM} × ${H_CM} ซม.`;

/** การตัด: id ฝั่งเว็บ (อังกฤษ) → ชื่อไทยที่ลูกค้าเห็น */
const cuts: { id: string; name: string }[] = attrOf("Option").values.map((v: any) => ({
  id: v.id,
  name: String(v.displayName).trim(),
}));
console.log(`📋 เว็บต้นทาง: ขนาด ${SIZE_NAME} (${PER_SHEET} ใบ/แผ่น A3) · การตัด ${cuts.map((c) => c.name).join(" · ")}`);

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
const CUT_LABEL = "การตัด";
const SIZE_LABEL = "ขนาด";

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
 * CROSS-CHECK: หน้าร้านจริง (getprintbox) ยังขายสติ๊กเกอร์ติดบัตรเท่าแถว PP ขาวมันของตารางนี้อยู่ไหม
 * ไม่ตรง = ราคาฝั่งใดฝั่งหนึ่งขยับแล้ว — เตือนไว้ให้เห็น ไม่ใช่หยุด (ราคาขายยึดตาราง sticker-pp ตามที่ผู้ใช้สั่ง)
 */
const CHECK: [lam: string, coat: string][] = [
  ["No liminate", "ไม่เคลือบ"],
  ["gloss", "เคลือบเงา"],
  ["matte", "เคลือบด้าน"],
  ["glitter", "เคลือบพิเศษ"],
];
for (const [lam, coat] of CHECK) {
  const site = await priceOf(1, lam);
  const ours = CELLS[`PP ขาวมัน│${coat}`][0];
  console.log(
    `🔎 หน้าร้านจริง 1 แผ่น A3 · ${coat.padEnd(12)} ${String(site).padStart(3)} / ตาราง ${String(ours).padStart(3)} → ` +
      (site === ours ? "ตรงกัน" : "⚠️ ไม่ตรงแล้ว มาดูก่อนว่าฝั่งไหนขยับ")
  );
}

/* ── 3. ภาพ ─────────────────────────────────────────────────────── */
const GS = "https://storage.googleapis.com/pbx-sw-tpdigital/media";
/** ภาพงานจริงบนหน้า /CardSticker/ (อยู่ในบล็อกเนื้อหาของ product family 386) */
const GALLERY: [name: string, url: string, label: string][] = [
  ["gallery-1", `${GS}/84/5e/4a/1771991159/stkb (2).jpg`, "สติ๊กเกอร์ติดบัตร พิมพ์ลายตามสั่ง"],
  ["gallery-2", `${GS}/c3/af/ee/1771991159/stkb (3).jpg`, "ลอกออกจากแผ่นรอง แล้วติดลงบัตรได้เลย"],
];
/** ผังตัวอย่างการวางแบบ (Print size) ของร้าน — บอกเส้นไดคัท 8.6×5.4 + เผื่อตัดตก 5 มม. */
const LAYOUT = `${GS}/af/0d/3c/1763806962/PS-สตกติดบัตร-01.jpg`;

const grab = async (url: string, file: string) => {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(encodeURI(url).replace(/%25/g, "%"));
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
};

for (const [name, url] of GALLERY) {
  const raw = await grab(url, `${DIR}/src/${name}.jpg`);
  await sharp(raw).resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(`${OUT}/${name}-${V}.jpg`);
}
const layoutRaw = await grab(LAYOUT, `${DIR}/src/layout.jpg`);
await sharp(layoutRaw).resize(1800, 1800, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/layout-${V}.jpg`);
console.log(`🖼  ภาพงานจริง ${GALLERY.length} ใบ + ผังวางแบบ 1 ใบ`);

/* ── ภาพวาดประจำตัวเลือก ────────────────────────────────────────────
 * การ์ดตัวเลือกโชว์ภาพเล็ก (ดู ProductDetail display "cards") ภาพจึงต้อง "อ่านออกที่ขนาดเล็ก"
 * → วาดแบนเรียบ มองจากด้านบนตรง ๆ ใช้ใบสติ๊กเกอร์ชุดเดียวกันเป๊ะทั้งสองภาพ
 *   ต่างกันแค่ "มุม" — สายตาจับความต่างได้โดยไม่ต้องอ่านชื่อ + มีวงซูมมุมขยายให้ดูชัดตอนเปิดเต็มจอ
 */
const S = 900; // จัตุรัส — การ์ดครอปเป็นจัตุรัส (object-cover)
const BG = "#eef3f7";
const INK = "#33454e";
const { uri: duck } = await mascotDataUri("peace", 420); // คืนเป็น { uri, ratio } — ต้องหยิบ uri ออกมา

/** สี่เหลี่ยมมุมมนเป็น path (มุมฉากได้ด้วยการใส่ r = 0) */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  r <= 0
    ? `M${x} ${y}h${w}v${h}h${-w}z`
    : `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

/** ลายที่พิมพ์บนแผ่นสติ๊กเกอร์ — ธีมหิมะแบบงานตัวอย่างของร้าน (ฟ้า + ภูเขาขาว + เนินหิมะ + มาสคอตเป็ด) */
const artwork = (x: number, y: number, w: number, h: number) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${x + w * 0.2}" cy="${y + h * 0.2}" r="${h * 0.14}" fill="#ffffff" opacity=".5"/>
  <path d="M${x} ${y + h * 0.62} L${x + w * 0.2} ${y + h * 0.3} L${x + w * 0.4} ${y + h * 0.62} Z" fill="#ffffff" opacity=".75"/>
  <path d="M${x + w * 0.28} ${y + h * 0.64} L${x + w * 0.52} ${y + h * 0.26} L${x + w * 0.78} ${y + h * 0.64} Z" fill="#ffffff" opacity=".62"/>
  <path d="M${x + w * 0.66} ${y + h * 0.63} L${x + w * 0.86} ${y + h * 0.34} L${x + w} ${y + h * 0.63} Z" fill="#ffffff" opacity=".7"/>
  <path d="M${x} ${y + h * 0.74} Q${x + w * 0.3} ${y + h * 0.56} ${x + w * 0.62} ${y + h * 0.76} T${x + w} ${y + h * 0.72} V${y + h} H${x} Z" fill="#ffffff" opacity=".85"/>
  <image href="${duck}" x="${x + w * 0.5}" y="${y + h * 0.18}" width="${w * 0.42}" height="${h * 0.72}" preserveAspectRatio="xMidYMid meet"/>`;

/**
 * ภาพ "การตัด" — เลียนภาพงานจริงของร้าน (ดูรูปที่ผู้ใช้ส่งมา 1 ก.ย. 69):
 *   แผ่นพิมพ์ 9.6 × 6.4 ซม. วางเอียงเล็กน้อย · มี "เส้นไดคัท" ของใบสติ๊กเกอร์ 8.6 × 5.4 อยู่ข้างใน
 *   (เว้นขอบด้านละ 5 มม. รอบด้าน) · มุมล่างซ้ายลอกขึ้นมาให้เห็นแผ่นรองขาวเหมือนรูปที่ 1
 * ต่างกันแค่ "มุมของเส้นไดคัท" — มุมมน / มุมเหลี่ยม + วงซูมมุมขยายให้เทียบชัด ๆ
 * @param r รัศมีมุมของใบไดคัท (px ในระบบพิกัดของภาพ) — 0 = มุมฉาก
 */
const cutArt = (r: number) => {
  const CW = 640; // แผ่นพิมพ์ (9.6 ซม.)
  const CH = (CW * H_CM) / W_CM;
  const CX = (S - CW) / 2;
  const CY = 290;
  const K = CW / W_CM; // px ต่อ 1 ซม.
  const IW = 8.6 * K; // ใบไดคัทที่แกะไปติดบัตร
  const IH = 5.4 * K;
  const IX = CX + (CW - IW) / 2;
  const IY = CY + (CH - IH) / 2;
  const [MX, MY] = [CX + CW / 2, CY + CH / 2];
  const TILT = -4; // องศา — วางเอียงนิดเดียวแบบรูปถ่ายงานจริง
  const rot = (x: number, y: number): [number, number] => {
    const a = (TILT * Math.PI) / 180;
    const [dx, dy] = [x - MX, y - MY];
    return [MX + dx * Math.cos(a) - dy * Math.sin(a), MY + dx * Math.sin(a) + dy * Math.cos(a)];
  };

  // มุมที่ลอกขึ้น = มุมล่างซ้ายของใบไดคัท · แผ่นที่ลอกขึ้นมาคือ "ภาพสะท้อน" ของสามเหลี่ยมที่หายไป
  const L = Math.min(IW, IH) * 0.4;
  const [px, py] = [IX, IY + IH];
  const peel =
    `<path d="M${px} ${py - L} L${px} ${py} L${px + L} ${py} Z" fill="#dfe7ec"/>` +
    `<path d="M${px} ${py - L} Q${px + L * 0.45} ${py - L * 1.05} ${px + L * 0.9} ${py - L * 0.9} ` +
    `Q${px + L * 1.05} ${py - L * 0.45} ${px + L} ${py} Z" fill="url(#peel)" stroke="#d3dde4" stroke-width="1.5" filter="url(#peelSh)"/>`;

  const die = rr(IX, IY, IW, IH, r);
  const card = `
    <g transform="rotate(${TILT} ${MX} ${MY})">
      <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="4" fill="#ffffff"/>
      <g clip-path="url(#sheetClip)">
        ${artwork(CX, CY, CW, CH)}
        <g clip-path="url(#dieClip)">${peel}</g>
      </g>
      <path d="${die}" fill="none" stroke="#ffffff" stroke-width="4" opacity=".95"/>
      <path d="${die}" fill="none" stroke="#5d8496" stroke-width="1.6" opacity=".5"/>
      <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="4" fill="none" stroke="#93b0be" stroke-width="2" opacity=".5"/>
    </g>`;

  // วงซูม: เล็งที่ "มุมขวาบนของเส้นไดคัท" (จุดหลังหมุนแล้ว ไม่งั้นซูมไปคนละที่)
  const [ZPX, ZPY] = rot(IX + IW, IY);
  const Z = 3.4;
  const [BX, BY, BR] = [706, 132, 112];
  const dx = ZPX - BX;
  const dy = ZPY - BY;
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe7f6"/><stop offset="1" stop-color="#7fcbe8"/>
    </linearGradient>
    <linearGradient id="peel" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7edf1"/>
    </linearGradient>
    <clipPath id="sheetClip"><rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="4"/></clipPath>
    <clipPath id="dieClip"><path d="${die}"/></clipPath>
    <clipPath id="bubble"><circle cx="${BX}" cy="${BY}" r="${BR}"/></clipPath>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#3d5866" flood-opacity=".22"/>
    </filter>
    <filter id="peelSh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="4" dy="-3" stdDeviation="6" flood-color="#3d5866" flood-opacity=".3"/>
    </filter>
  </defs>
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <ellipse cx="${MX}" cy="${CY + CH + 46}" rx="${CW * 0.44}" ry="26" fill="#c8d6de" opacity=".45"/>
  <g filter="url(#sh)">${card}</g>

  <!-- วงซูมมุมของเส้นไดคัท ขยาย ${Z}× (มีเส้นโยงบอกว่าซูมมาจากมุมไหน) -->
  <circle cx="${ZPX.toFixed(1)}" cy="${ZPY.toFixed(1)}" r="26" fill="none" stroke="${INK}" stroke-width="3" opacity=".35"/>
  <line x1="${(ZPX - ux * 26).toFixed(1)}" y1="${(ZPY - uy * 26).toFixed(1)}" x2="${(BX + ux * BR).toFixed(1)}" y2="${(BY + uy * BR).toFixed(1)}" stroke="${INK}" stroke-width="3" opacity=".3" stroke-dasharray="8 8"/>
  <circle cx="${BX}" cy="${BY}" r="${BR}" fill="#ffffff"/>
  <g clip-path="url(#bubble)">
    <rect x="${BX - BR}" y="${BY - BR}" width="${BR * 2}" height="${BR * 2}" fill="${BG}"/>
    <g transform="translate(${BX} ${BY}) scale(${Z}) translate(${-ZPX} ${-ZPY})">${card}</g>
  </g>
  <circle cx="${BX}" cy="${BY}" r="${BR}" fill="none" stroke="#ffffff" stroke-width="12"/>
  <circle cx="${BX}" cy="${BY}" r="${BR + 6}" fill="none" stroke="${INK}" stroke-width="3" opacity=".35"/>
</svg>`;
};

/** ภาพ "ขนาด" — 1 แผ่น A3 วางได้กี่ใบ (เรียงตามจริง 6 × 3 = 18 ใบ) */
const sheetArt = () => {
  const A3W = 42;
  const A3H = 29.7;
  const SW = 730; // ความกว้างแผ่น A3 บนภาพ
  const K = SW / A3W; // px ต่อ 1 ซม.
  const SH = Math.round(A3H * K);
  const SX = (S - SW) / 2;
  const SY = (S - SH) / 2;
  // ใบสติ๊กเกอร์วางตั้ง (กว้าง H_CM ตามแนวนอนของแผ่น) — 6 คอลัมน์ × 3 แถว = 18 ใบ
  const cols = Math.floor(A3W / H_CM);
  const rows = Math.floor(A3H / W_CM);
  if (cols * rows !== PER_SHEET)
    throw new Error(`วางได้ ${cols}×${rows} = ${cols * rows} ใบ แต่หน้าร้านบอก ${PER_SHEET} ใบ — มาดูผังก่อน`);
  const cw = H_CM * K;
  const ch = W_CM * K;
  const gx = (SW - cols * cw) / (cols + 1);
  const gy = (SH - rows * ch) / (rows + 1);
  const cells: string[] = [];
  for (let c = 0; c < cols; c++)
    for (let rw = 0; rw < rows; rw++) {
      const x = SX + gx + c * (cw + gx);
      const y = SY + gy + rw * (ch + gy);
      cells.push(
        `<path d="${rr(x, y, cw, ch, 9)}" fill="url(#sky)" stroke="#ffffff" stroke-width="3"/>` +
          `<image href="${duck}" x="${x + cw * 0.12}" y="${y + ch * 0.3}" width="${cw * 0.76}" height="${ch * 0.5}" preserveAspectRatio="xMidYMid meet"/>`
      );
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe7f6"/><stop offset="1" stop-color="#7fcbe8"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#3d5866" flood-opacity=".2"/>
    </filter>
  </defs>
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <g filter="url(#sh)"><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="6" fill="#ffffff"/></g>
  ${cells.join("\n  ")}
  <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="6" fill="none" stroke="#c9d6de" stroke-width="3"/>
</svg>`;
};

/** มุมของแต่ละแบบ: id ฝั่งเว็บ → รัศมีมุมที่ใช้วาด (ขยายให้เห็นชัดที่ภาพย่อ) */
const CUT_RADIUS: Record<string, number> = { "Rounded edges": 46, "Square edge": 0 };
const cutFile = (id: string) => `cut-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
for (const c of cuts) {
  const r = CUT_RADIUS[c.id];
  if (r === undefined) throw new Error(`เว็บเพิ่มแบบการตัดใหม่ "${c.id}" ที่ยังไม่มีภาพในสคริปต์ — มาเติมเองก่อน`);
  await sharp(Buffer.from(cutArt(r))).jpeg({ quality: 92 }).toFile(`${OUT}/${cutFile(c.id)}-${V}.jpg`);
}
await sharp(Buffer.from(sheetArt())).jpeg({ quality: 92 }).toFile(`${OUT}/size-a3-${V}.jpg`);
console.log(`🖼  วาดภาพตัวเลือก: ขนาด 1 ใบ + การตัด ${cuts.length} ใบ`);

/* ── 4. ตัวสินค้า ───────────────────────────────────────────────── */
const sizeGroup: ProductOption = {
  label: SIZE_LABEL,
  // note สั้น ๆ พอ — ขนาดงานอยู่ที่ชื่อตัวเลือก · ยอดต่อแผ่นอยู่ที่ป้ายแล้ว (ผู้ใช้สั่งกระชับ 1 ก.ย. 69)
  note: "เส้นไดคัทแกะไปติดบัตร **8.6 × 5.4 ซม.** (เท่าบัตร ATM) · เผื่อตัดตกด้านละ 5 มม.",
  noteImageSrc: IMG("layout"),
  display: "cards",
  choices: [
    {
      name: SIZE_NAME,
      desc: "ติดบัตร ATM / บัตรพนักงาน / บัตรนักเรียน",
      badge: `${PER_SHEET} ใบ / แผ่น A3`,
      imageSrc: IMG("size-a3"),
      piecesPerUnit: PER_SHEET,
      perUnit: PER_SHEET,
      // ไม่ติดป้าย "นิยม" — มีขนาดเดียว ป้ายกับคำอธิบายป้ายรกเปล่า ๆ
    },
  ],
};

const CUT_DESC: Record<string, string> = {
  "Rounded edges": "มุมโค้งมนตามทรงบัตร ขอบไม่สะดุดมือ",
  "Square edge": "มุมฉาก 90° ขอบตรงคม ได้พื้นที่ลายเต็มมุม",
};
const cutGroup: ProductOption = {
  label: CUT_LABEL,
  note: "ราคาเท่ากันทั้งสองแบบ",
  display: "cards",
  choices: cuts.map((c) => ({
    name: c.name,
    desc: CUT_DESC[c.id],
    imageSrc: IMG(cutFile(c.id)),
    ...(c.id === "Rounded edges" ? { popular: true } : {}),
  })),
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวสินค้า::",
      `• ขนาดงานพิมพ์ ${W_CM} × ${H_CM} ซม. · เส้นไดคัทสำหรับแกะไปติดบัตร 8.6 × 5.4 ซม. (เท่าบัตร ATM)`,
      `• 1 แผ่น A3 ได้ ${PER_SHEET} ใบ — ราคาและจำนวนที่สั่งนับเป็นแผ่น A3`,
      `• การตัดเลือกได้ ${cuts.length} แบบ: ${cuts.map((c) => c.name).join(" · ")} (ราคาเท่ากัน)`,
      "::เนื้อสติ๊กเกอร์::",
      "• PP พรีเมี่ยม กันน้ำได้ ไม่ฉีกขาดง่าย · Removable ลอกออกได้โดยไม่ทิ้งคราบกาว",
      `• เลือกได้ ${MATERIALS.length} แบบ: ${MATERIALS.join(" · ")}`,
      "• พิมพ์ระบบ Digital สีคมชัด · ไดคัท 50% (ตัดครึ่งเนื้อ) ลอกใช้ทีละใบ",
      "::ราคา::",
      `• คิดเป็นแผ่น A3 — ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) ลดเป็นขั้นตามจำนวน ${TIERS.length} ขั้น`,
      `• ${TIERS[0].label} · PP ขาวมัน: ไม่เคลือบ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} · เคลือบเงา/ด้าน ${CELLS["PP ขาวมัน│เคลือบเงา"][0]} · เคลือบพิเศษ ${CELLS["PP ขาวมัน│เคลือบพิเศษ"][0]} บาท/แผ่น A3`,
      `• สั่งเยอะสุด (${TIERS[TIERS.length - 1].label}) เหลือแผ่นละ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][TIERS.length - 1]} บาท — ดูราคาทุกแบบได้ที่ตารางราคาด้านบน`,
      "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
      "::ระยะเวลาผลิต::",
      "• 2-3 วันทำการ ไม่รวมเวลาจัดส่ง",
    ].join("\n"),
    images: [IMG("gallery-1"), IMG("gallery-2")],
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
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกขนาด → ชนิดสติ๊กเกอร์ → การตัด → การเคลือบ → จำนวนแผ่น A3 แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนลายที่คละ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n' +
      "หรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: เนื้อสติ๊กเกอร์/การตัด/การเคลือบที่เลือก · จำนวนแผ่น A3 · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์ JPG / PNG ขนาดไฟล์ไม่เกิน 10,000 pixels · ความละเอียดไม่ต่ำกว่า 300 dpi",
      "• งานกระดาษ/สติ๊กเกอร์พิมพ์สี RGB — ควรตั้งโหมดไฟล์เป็น RGB ก่อนวาด Artwork",
      `• วางลายเต็มขนาด ${W_CM} × ${H_CM} ซม. และเผื่อตัดตกด้านละ 5 มม.`,
      "• ส่วนสำคัญ (ข้อความ/โลโก้) ควรอยู่ในเส้นไดคัท 8.6 × 5.4 ซม. ไม่ชิดขอบตัด",
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
  slug: "card-sticker",
  name: NAME,
  category: "sticker-paper",
  price: cheapest,
  emoji: "💳",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    `สติ๊กเกอร์ติดบัตร (CARD STICKER) ขนาด ${W_CM} × ${H_CM} ซม. พิมพ์ลายตามสั่งบนสติ๊กเกอร์ PP กันน้ำ ` +
    `ระบบ Digital Printing ไดคัท 50% ลอกออกจากแผ่นรองแล้วติดลงบัตร ATM / บัตรพนักงาน / บัตรนักเรียนได้ทันที — ` +
    `เลือกการตัดได้ ${cuts.length} แบบ (${cuts.map((c) => c.name).join(" · ")}) เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ ` +
    "และเคลือบเงา ด้าน หรือเคลือบพิเศษกลิตเตอร์/ทราย/โฮโลแกรม 10 ลาย · ไม่มีขั้นต่ำ ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    `ขนาด ${SIZE_NAME} พอดีบัตร — 1 แผ่น A3 ได้ ${PER_SHEET} ใบ`,
    `การตัด ${cuts.length} แบบ: ${cuts.map((c) => c.name).join(" · ")} ราคาเท่ากัน`,
    `เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ — ขาวมัน · ใสรองขาว · ใสไม่รองขาว · ขาวด้าน · ขาวมุก`,
    "เคลือบเงา / ด้าน / เคลือบพิเศษ กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย",
    `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) — เริ่ม ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} บาท/แผ่น A3 สั่งเยอะเหลือ ${cheapest} บาท`,
  ],
  images: GALLERY.map(([name, , label]) => ({
    emoji: "💳",
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
  options: [sizeGroup, matGroup, cutGroup, coatGroup, specialGroup],
  // เลือก "เคลือบพิเศษ" แล้วต้องระบุลายฟิล์ม — กฎเดียวกับสติ๊กเกอร์ Digital
  rules: [
    {
      when: { label: COAT_LABEL, choice: "เคลือบพิเศษ", choices: ["เคลือบพิเศษ"] },
      limit: { label: SPECIAL_LABEL, allow: specialGroup.choices.map((c) => c.name) },
    },
  ],
  // ค่าคละลายชุดเดียวกับสติ๊กเกอร์ Digital (ลายละ 5 บาท ลายแรกไม่คิด)
  mixRule: structuredClone(src.mixRule),
  terms: [
    `• ขนาดงานพิมพ์ ${W_CM} × ${H_CM} ซม. · เส้นไดคัทสำหรับแกะไปติดบัตร 8.6 × 5.4 ซม. · เผื่อตัดตกด้านละ 5 มม.`,
    `• 1 แผ่น A3 ได้ ${PER_SHEET} ใบ — ราคาและจำนวนที่สั่งนับเป็นแผ่น A3`,
    "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
    "• เนื้อสติ๊กเกอร์และการเคลือบคิดรวมอยู่ในตารางราคาแล้ว (ชุดเดียวกับสติ๊กเกอร์ Digital ไดคัท 50%)",
    "• การตัดมุมมน/มุมเหลี่ยม ราคาเท่ากัน",
    "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. · งานเคลือบลามิเนตอาจมีฝุ่นเล็กน้อย",
    "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
  ].join("\n"),
  tabs: TABS,
  seo: {
    title: "รับผลิตสติ๊กเกอร์ติดบัตร พิมพ์ลายตามสั่ง ขั้นต่ำน้อย | iDucky Prints",
    description:
      `รับผลิตสติ๊กเกอร์ติดบัตร (Card Sticker) ขนาด ${W_CM} × ${H_CM} ซม. ติดบัตร ATM บัตรพนักงาน บัตรนักเรียน ` +
      `สติ๊กเกอร์ PP กันน้ำ ${MATERIALS.length} เนื้อ เลือกมุมมน/มุมเหลี่ยม เคลือบเงา ด้าน กลิตเตอร์ โฮโลแกรม ` +
      `คิดเป็นแผ่น A3 (1 แผ่นได้ ${PER_SHEET} ใบ) เริ่ม ${cheapest} บาท ไม่มีขั้นต่ำ ส่งทั่วไทย`,
    faqs: [
      {
        q: "สติ๊กเกอร์ติดบัตรขนาดเท่าไหร่ 1 แผ่น A3 ได้กี่ใบ?",
        a: `ขนาดงานพิมพ์ ${W_CM} × ${H_CM} ซม. มีเส้นไดคัทสำหรับแกะไปติดบัตร 8.6 × 5.4 ซม. (เท่าบัตร ATM) · 1 แผ่น A3 ได้ ${PER_SHEET} ใบ`,
      },
      {
        q: "คิดราคายังไง เริ่มต้นกี่บาท?",
        a:
          `คิดเป็นแผ่น A3 ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) — ${TIERS[0].label} PP ขาวมัน ` +
          `ไม่เคลือบ ${CELLS["PP ขาวมัน│ไม่เคลือบ"][0]} บาท · เคลือบเงา/ด้าน ${CELLS["PP ขาวมัน│เคลือบเงา"][0]} บาท · ` +
          `เคลือบพิเศษ ${CELLS["PP ขาวมัน│เคลือบพิเศษ"][0]} บาท ต่อแผ่น A3 · สั่งเยอะลดเป็นขั้นถึงแผ่นละ ${cheapest} บาท`,
      },
      {
        q: "มุมมนกับมุมเหลี่ยมต่างกันยังไง ราคาต่างกันไหม?",
        a: "ต่างกันที่รูปทรงมุมของใบสติ๊กเกอร์ — มุมมนโค้งตามทรงบัตร ขอบไม่สะดุดมือ · มุมเหลี่ยมตัดมุมฉาก 90° ขอบตรงคม · ราคาเท่ากันทั้งสองแบบ",
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
console.log(`   ขนาด: ${SIZE_NAME} (${PER_SHEET} ใบ/แผ่น A3) · การตัด: ${cuts.map((c) => c.name).join(" · ")}`);

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

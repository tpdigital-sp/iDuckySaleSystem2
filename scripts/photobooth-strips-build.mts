#!/usr/bin/env npx tsx
/**
 * PHOTO BOOTH (สติ๊กเกอร์) — สร้างสินค้าจากร่างเปล่าที่ผู้ใช้กด "＋ เพิ่มสินค้า" ไว้
 *
 *   npx tsx scripts/photobooth-strips-build.mts           # ดึงราคา/ภาพลง .cache แล้วสรุปให้ดู (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/photobooth-strips-build.mts --write   # อัปภาพ + เขียนลง Supabase (ยังเป็นฉบับร่าง)
 *
 * ── ที่มาของราคา (ผู้ใช้สั่ง 1 ก.ย. 69) ──────────────────────────────────────
 * หน้าร้านจริง https://www.iduckyprintsstudio.com/photoboothstrips/ ขายเป็น "แผ่น A3"
 * ราคาที่เว็บโชว์ (PP ขาวเงา): 1-10 แผ่น = 90 · 11 แผ่นขึ้นไป = 80 บาท (คงที่ยาวถึง 3,000 แผ่น)
 * ตรงกับสไลซ์ "ไดคัท 50% (ตัดครึ่ง) × PP ขาวมัน" ของสินค้า "สติ๊กเกอร์ Digital" (sticker-pp) เป๊ะ 2 ขั้นแรก
 * จึงยกตารางสไลซ์นั้นมาทั้งชุด — ได้ทั้ง **ชนิดสติ๊กเกอร์ 5 แบบ** และ **เคลือบ 4 แบบ** ตามที่ผู้ใช้สั่ง
 * และได้ขั้นลดราคาลึกกว่าเว็บ (51 แผ่นขึ้นไปเว็บยังคิด 80 · ตารางนี้ลงถึง 36 บาท/แผ่น A3)
 * ⚠️ อ่านสดจาก Supabase ทุกครั้ง ไม่ hardcode — sticker-pp ขยับราคาเมื่อไหร่ รันซ้ำแล้วตามทันที
 *
 * ── ที่มาของตัวเลือก/ภาพ ───────────────────────────────────────────────────
 * หน้า /photoboothstrips/ เป็นเพจ Nuxt ยิง API getprintbox (product family 382 · module 380)
 * สคริปต์อ่านสดทุกครั้ง: product-families/382/ = รายชื่อขนาด + ภาพ/คำบรรยายในหน้า · prices/ = cross-check
 * ต้องใส่ header X-version: v6 + X-Pbx-Store-Name: iDuckyOfficial ไม่งั้นตอบ 400 · ใช้ net (ไม่รวม VAT)
 *
 * ขนาด 2 แบบ (เว็บบอกว่าราคาเท่ากัน — attribute size ตั้ง alters.price = false):
 *   • 4.2 × 12 ซม. (รูป 2 ช่อง) — 20 ใบ / แผ่น A3
 *   • 5 × 15.2 ซม. (รูป 3 ช่อง) — 12 ใบ / แผ่น A3
 *
 * ── ภาพประกอบตัวเลือก (ผู้ใช้สั่ง: อยากเห็นว่าแต่ละแบบหน้าตาเป็นยังไง) ──────
 *   • "ขนาด" — ครอปจากภาพงานจริง PSB2.jpg ของหน้าร้าน (ในภาพเดียวมีทั้ง 2 ช่อง และ 3 ช่อง)
 *     ซ้าย = สตริป 2 ช่อง (4.2×12) · ขวา = สตริป 3 ช่อง (5×15.2)
 *     ⚠️ ครอปเป็นจัตุรัสและเห็นสตริปทั้งใบเสมอ — การ์ดตัวเลือกเป็นกรอบจัตุรัส object-cover
 *        ครอปแนวตั้งจะโดนกินหัว-ท้ายจนดูไม่ออกว่าใบยาวแค่ไหน (ผู้ใช้ทักมา 1 ก.ย. 69)
 *   • "ชนิดสติ๊กเกอร์" — ใช้ภาพเนื้อสติ๊กเกอร์ชุดเดียวกับ sticker-pp (อ่าน imageSrc สดจากแถวนั้น)
 *   • "เคลือบ" — ภาพชุดกลางทั้งร้าน products/coating-b/* (ชุด B)
 *   • ภาพจำลองขนาด (size-*-art) — วาดเองจาก SVG ตามสัดส่วนจริง + กรอบประของอีกขนาดเทียบข้าง ๆ
 *     สไตล์เดียวกับภาพจำลองของโปสการ์ด (scripts/postcard-option-art.mjs) · อยู่ในแกลเลอรี
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v2 ครั้งหน้าขึ้น v3
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceTier, type Product, type ProductOption, type ProductOptionChoice } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1w47u-7312"; // ร่างเปล่าที่ผู้ใช้สร้างไว้ 1 ก.ย. 69
const NAME = "PHOTO BOOTH (สติ๊กเกอร์)";
const DIR = ".cache/photobooth";
const OUT = `${DIR}/upload`;
const V = "v2"; // v1 = ครอปแนวตั้ง (การ์ดตัวเลือกกินหัว-ท้าย) — เปลี่ยนชื่อไฟล์เพราะอัปทับแล้ว CDN/Next แคชค้าง
const PF = 382; // product family ของ PHOTO BOOTH (สติ๊กเกอร์) บนระบบ getprintbox
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
/** ภาพเคลือบชุดกลางทั้งร้าน — ชุด B (ตั้งเอียงเห็นผิวจริง) ที่ผู้ใช้เลือกไว้ 1 ก.ย. 69 */
const COAT = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/coating-b/${name}-v1.jpg`;

/* ── 1. ตัวเลือกสดจาก API ของหน้าร้าน ────────────────────────────── */
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

const family = await api(`product-families/${PF}/?moduleId=380&channel=web`);
const attrOf = (id: string) => {
  const a = (family.attributes ?? []).find((x: any) => x.id === id);
  if (!a) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${id}" ในเว็บต้นทางแล้ว — โครงหน้าเปลี่ยน มาดูเองก่อน`);
  return a;
};
/** ขนาดฝั่งเว็บ: displayName = "4.2x12cm | จำนวน 20 ใบ" */
const webSizes: { id: string; label: string; sheets: number }[] = attrOf("size").values.map((v: any) => {
  const [label, count] = String(v.displayName).split("|").map((s) => s.trim());
  const sheets = Number(/(\d+)/.exec(count ?? "")?.[1]);
  if (!sheets) throw new Error(`อ่านจำนวนใบต่อแผ่น A3 ของ "${v.displayName}" ไม่ได้`);
  return { id: v.id, label, sheets };
});
if (attrOf("size").alters?.price !== false)
  console.log("⚠️ เว็บเปลี่ยนให้ 'ขนาด' มีผลกับราคาแล้ว — ตอนนี้สคริปต์ยังตั้งให้ทุกขนาดราคาเท่ากัน มาดูก่อน");
console.log(`📋 เว็บต้นทาง: ขนาด ${webSizes.map((s) => `${s.label} (${s.sheets} ใบ)`).join(" · ")}`);

/** ราคารวม (net) ของจำนวน qty แผ่น A3 เมื่อเลือกการเคลือบ lam */
const priceOf = async (qty: number, lam: string): Promise<number> => {
  const params = encodeURIComponent(
    JSON.stringify([{ Laminate: lam, size: webSizes[0].id, "Sticker Type": "PP Sticker", Option: "simplex" }])
  );
  const rows = await api(`prices/?productFamilyId=${PF}&currency=THB&quantity=${qty}&params=${params}`);
  const net = rows?.[0]?.net;
  if (typeof net !== "number") throw new Error(`ราคา qty=${qty} lam=${lam} อ่านไม่ได้: ${JSON.stringify(rows)}`);
  return net;
};

/* ── 2. ตารางราคา: สไลซ์ "ไดคัท 50%" ของสติ๊กเกอร์ Digital ───────── */
const FROM = "sticker-pp";
const DIECUT = "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)";
const MAT_LABEL = "ชนิดสติ๊กเกอร์";
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";

const { data: srcRow, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
const src: any = srcRow.data;
const srcPricing = src.pricing;
const WANT_DRIVERS = ["แบบไดคัท", MAT_LABEL, COAT_LABEL];
if (String(srcPricing?.driverLabels) !== String(WANT_DRIVERS))
  throw new Error(`แกนตารางราคาของ ${FROM} เปลี่ยนไปแล้ว (${srcPricing?.driverLabels?.join(" × ")}) — มาดูเองก่อน`);

/** กลุ่ม "ชนิดสติ๊กเกอร์" ของ sticker-pp ทั้งชุด (ชื่อ · คำอธิบาย · ภาพ) — ยกมาตรง ๆ ตามที่ผู้ใช้สั่ง */
const srcMatGroup = (src.options as ProductOption[]).find((o) => o.label === MAT_LABEL);
if (!srcMatGroup) throw new Error(`ไม่เจอกลุ่ม "${MAT_LABEL}" ใน ${FROM}`);
const MATERIALS: ProductOptionChoice[] = structuredClone(srcMatGroup.choices);

const TIERS: PriceTier[] = structuredClone(srcPricing.tiers) as PriceTier[];
const COATS = ["ไม่เคลือบ", "เคลือบเงา", "เคลือบด้าน", "เคลือบพิเศษ"] as const;
const CELLS: Record<string, number[]> = {};
for (const mat of MATERIALS)
  for (const coat of COATS) {
    const row = srcPricing.cells[`${DIECUT}│${mat.name}│${coat}`];
    if (!row) throw new Error(`ไม่เจอแถวราคา "${DIECUT}│${mat.name}│${coat}" ใน ${FROM} — โครงต้นทางเปลี่ยน`);
    CELLS[`${mat.name}│${coat}`] = [...row];
  }
const BASE = (coat: string, i: number) => CELLS[`${MATERIALS[0].name}│${coat}`][i]; // แถว PP ขาวมัน = แถวอ้างอิงในคำอธิบาย
console.log(`💰 ราคายกมาจาก "${srcRow.name}" — ${DIECUT} · ${MATERIALS.length} เนื้อ × ${COATS.length} เคลือบ × ${TIERS.length} ขั้น`);

/*
 * CROSS-CHECK: หน้าร้านจริงยังขายเท่าตารางนี้อยู่ไหม (เทียบแถว PP ขาวเงา = PP ขาวมัน)
 * ไม่ตรง = ราคาฝั่งใดฝั่งหนึ่งขยับแล้ว — เตือนไว้ให้เห็น ไม่ใช่หยุด (ราคาขายยึดตาราง sticker-pp ตามที่ผู้ใช้สั่ง)
 */
for (const [qty, i] of [[1, 0], [11, 1], [51, 2]] as const) {
  const [none, gloss, matte, glitter] = await Promise.all([
    priceOf(qty, "No liminate"),
    priceOf(qty, "gloss"),
    priceOf(qty, "matte"),
    priceOf(qty, "glitter"),
  ]);
  const per = (n: number) => Math.round((n / qty) * 100) / 100;
  const ok = per(none) === BASE("ไม่เคลือบ", i) && per(gloss) === BASE("เคลือบเงา", i) && per(matte) === BASE("เคลือบด้าน", i);
  console.log(
    `🔎 เว็บจริง ${qty} แผ่น A3 → ไม่เคลือบ ${per(none)} · เงา ${per(gloss)} · ด้าน ${per(matte)} · กลิตเตอร์ ${per(glitter)} ` +
      `| ตาราง ${BASE("ไม่เคลือบ", i)} / ${BASE("เคลือบเงา", i)} / ${BASE("เคลือบด้าน", i)} / ${BASE("เคลือบพิเศษ", i)} → ` +
      (ok ? "ตรงกัน" : "⚠️ ไม่ตรง (ตารางร้านลดลึกกว่าเว็บในขั้นนี้)")
  );
}

/* ── 3. ภาพ ─────────────────────────────────────────────────────── */
const MEDIA = "https://storage.googleapis.com/pbx-sw-tpdigital/media";
/** ภาพงานจริงบนหน้า /photoboothstrips/ (ดึงมาจาก HTML ของ product family เพื่อไม่ให้ลิงก์ตายเงียบ) */
const familyRaw = JSON.stringify(family);
const mediaIn = (needle: string) => {
  const m = new RegExp(`${MEDIA}/([^"\\\\]*${needle}[^"\\\\]*)`).exec(familyRaw);
  if (!m) throw new Error(`ไม่เจอรูป "${needle}" ในหน้าเว็บต้นทางแล้ว — เขาเปลี่ยนรูป มาดูเองก่อน`);
  return `${MEDIA}/${m[1]}`;
};
const HERO = mediaIn("PSB1"); // สตริปลอกแผ่นรอง (ภาพหลัก)
const BOTH = mediaIn("PSB2"); // งานจริงทั้ง 2 แบบในภาพเดียว — ใช้ครอปเป็นภาพรายขนาด
const LAYOUT = mediaIn("PS-PHOTO"); // ผัง Print size ของ 4.2×12 (ใช้ในแท็บการเตรียมไฟล์)

const grab = async (url: string, file: string) => {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(encodeURI(url).replace(/%25/g, "%"));
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
};

const heroRaw = await grab(HERO, `${DIR}/src/PSB1.jpg`);
const bothRaw = await grab(BOTH, `${DIR}/src/PSB2.jpg`);
const layoutRaw = await grab(LAYOUT, `${DIR}/src/layout.jpg`);

/*
 * ครอปภาพรายขนาดจาก PSB2 (1920×1200) — ซ้าย = สตริป 2 ช่อง · ขวา = สตริป 3 ช่อง
 * ⚠️ ต้องครอปเป็น "จัตุรัส" และให้เห็นสตริปทั้งใบ: การ์ดตัวเลือกเป็นกรอบจัตุรัส object-cover
 *    ครอปแนวตั้งมาจะโดนกินหัว-ท้ายจนดูไม่ออกว่าใบยาวแค่ไหน (ผู้ใช้ทักมา 1 ก.ย. 69 → v2)
 * ปรับแสง/สีขึ้นนิดหน่อยให้ภาพไม่ทึม (ต้นฉบับถ่ายบนพื้นไม้โทนอุ่น)
 */
const meta = await sharp(bothRaw).metadata();
if (meta.width !== 1920 || meta.height !== 1200)
  throw new Error(`PSB2 ขนาดเปลี่ยนเป็น ${meta.width}×${meta.height} — พิกัดครอปรายขนาดใช้ไม่ได้แล้ว มาดูเองก่อน`);
const CROP: Record<string, { left: number; top: number; width: number; height: number }> = {
  "Photo Booth Strips 4.2x12cm": { left: 180, top: 240, width: 900, height: 900 },
  "Photo Booth Strips 5x15.2cm": { left: 700, top: 50, width: 1100, height: 1100 },
};
const slugOf = (id: string) => (id.includes("4.2") ? "4-2x12" : "5x15-2");
for (const s of webSizes) {
  const box = CROP[s.id];
  if (!box) throw new Error(`เว็บเพิ่มขนาดใหม่ "${s.id}" ที่ยังไม่มีภาพในสคริปต์ — มาเติมเองก่อน`);
  await sharp(bothRaw)
    .extract(box)
    .resize(900, 900)
    .modulate({ brightness: 1.05, saturation: 1.08 })
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 90 })
    .toFile(`${OUT}/size-${slugOf(s.id)}-${V}.jpg`);
}

/* ── 3b. ภาพจำลองขนาด (วาดเอง) ───────────────────────────────────
 * สไตล์เดียวกับภาพจำลองของโปสการ์ด/Photo card Digital (scripts/postcard-option-art.mjs):
 * พื้นฟ้าอ่อน · ตัวงานวาดตามสัดส่วนจริง · กรอบประของอีกขนาดเทียบข้าง ๆ · หัวข้อน้ำเงิน + คำอธิบายเทา
 * ภาพถ่ายงานจริงบอกไม่ได้ว่าใบใหญ่แค่ไหนและต่างกันตรงไหน — ภาพนี้บอกทั้งขนาดจริงและจำนวนช่อง
 */
const A_W = 800;
const A_H = 800;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const C_BG = "#eff6fe";
const C_BLUE = "#2f7fd4";
const C_SUB = "#767d85";
const C_LABEL = "#5b6673";
const C_EDGE = "#d8e3f2";
const C_DIM = "#9fb3c8";
const PPCM = 26; // พิกเซลต่อเซนติเมตร — สเกลเดียวกันทั้งสองภาพ ใบ 5×15.2 จึงใหญ่กว่าจริง ๆ
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const duckBuf = readFileSync("scripts/assets/photocard-pvc/duck.png");

interface Strip { w: number; h: number; frames: number; capCm: number }
const STRIP: Record<string, Strip> = {
  "Photo Booth Strips 4.2x12cm": { w: 4.2, h: 12, frames: 2, capCm: 1.5 },
  "Photo Booth Strips 5x15.2cm": { w: 5, h: 15.2, frames: 3, capCm: 1.6 },
};
const px = (cm: number) => Math.round(cm * PPCM);

/** โครงสตริป 1 ใบ: กระดาษขาว + ช่องรูป n ช่อง + บรรทัดข้อความใต้ช่องสุดท้าย */
function stripSvg(x: number, y: number, s: Strip) {
  const w = px(s.w);
  const h = px(s.h);
  const pad = px(0.3);
  const gap = px(0.2);
  const cap = px(s.capCm);
  const fw = w - pad * 2;
  const fh = Math.round((h - pad * 2 - cap - gap * (s.frames - 1)) / s.frames);
  const frames: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < s.frames; i++) frames.push({ x: x + pad, y: y + pad + i * (fh + gap), w: fw, h: fh });
  const capY = y + pad + s.frames * fh + gap * (s.frames - 1) + Math.round(cap / 2);
  return {
    frames,
    svg: `
      <rect x="${x + 5}" y="${y + 7}" width="${w}" height="${h}" rx="8" fill="#000" opacity="0.07"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fffdf8" stroke="${C_EDGE}" stroke-width="2"/>
      ${frames
        .map((f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="3" fill="url(#gf)"/>`)
        .join("")}
      <line x1="${x + pad + fw * 0.18}" y1="${capY - 5}" x2="${x + pad + fw * 0.82}" y2="${capY - 5}"
            stroke="${C_EDGE}" stroke-width="4" stroke-linecap="round"/>
      <line x1="${x + pad + fw * 0.3}" y1="${capY + 7}" x2="${x + pad + fw * 0.7}" y2="${capY + 7}"
            stroke="${C_EDGE}" stroke-width="4" stroke-linecap="round"/>`,
  };
}
const dimsSvg = (x: number, y: number, w: number, h: number, wTxt: string, hTxt: string) => `
  <line x1="${x}" y1="${y + h + 22}" x2="${x + w}" y2="${y + h + 22}" stroke="${C_DIM}" stroke-width="2"/>
  <line x1="${x}" y1="${y + h + 14}" x2="${x}" y2="${y + h + 30}" stroke="${C_DIM}" stroke-width="2"/>
  <line x1="${x + w}" y1="${y + h + 14}" x2="${x + w}" y2="${y + h + 30}" stroke="${C_DIM}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h + 50}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${C_LABEL}">${esc(wTxt)}</text>
  <line x1="${x + w + 22}" y1="${y}" x2="${x + w + 22}" y2="${y + h}" stroke="${C_DIM}" stroke-width="2"/>
  <line x1="${x + w + 14}" y1="${y}" x2="${x + w + 30}" y2="${y}" stroke="${C_DIM}" stroke-width="2"/>
  <line x1="${x + w + 14}" y1="${y + h}" x2="${x + w + 30}" y2="${y + h}" stroke="${C_DIM}" stroke-width="2"/>
  <text x="${x + w + 38}" y="${y + h / 2 + 7}" font-family="${TH}" font-size="21" fill="${C_LABEL}">${esc(hTxt)}</text>`;

const BOTTOM = 540; // ขอบล่างของงานทั้งสองใบ (วางชิดเส้นเดียวกันให้เทียบความยาวได้)
for (const s of webSizes) {
  const me = STRIP[s.id];
  const other = STRIP[webSizes.find((o) => o.id !== s.id)!.id];
  const mw = px(me.w);
  const ow = px(other.w);
  const GAP = 140; // เว้นที่ให้เส้นบอกความสูงของใบหลัก
  const x0 = Math.round((A_W - (mw + GAP + ow)) / 2);
  const my = BOTTOM - px(me.h);
  const oy = BOTTOM - px(other.h);
  const built = stripSvg(x0, my, me);
  const otherName = `${other.w} × ${other.h} ซม.`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A_W}" height="${A_H}" viewBox="0 0 ${A_W} ${A_H}">
    <defs><linearGradient id="gf" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#cfe6ff"/><stop offset="1" stop-color="#ffe1ef"/>
    </linearGradient></defs>
    <rect width="${A_W}" height="${A_H}" fill="${C_BG}"/>
    ${built.svg}
    <rect x="${x0 + mw + GAP}" y="${oy}" width="${ow}" height="${px(other.h)}" rx="8" fill="none"
          stroke="${C_DIM}" stroke-width="2" stroke-dasharray="7 6"/>
    <text x="${x0 + mw + GAP + ow / 2}" y="${BOTTOM + 50}" font-family="${TH}" font-size="19"
          text-anchor="middle" fill="${C_DIM}">${esc(otherName)}</text>
    ${dimsSvg(x0, my, mw, px(me.h), `${me.w} ซม.`, `${me.h} ซม.`)}
    <text x="${A_W / 2}" y="${640}" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${C_BLUE}">ขนาด ${me.w} × ${me.h} ซม.</text>
    ${[`สตริปรูป ${me.frames} ช่อง — วาดตามสัดส่วนจริง เทียบกับอีกขนาด (กรอบประ)`, `ได้ ${s.sheets} ใบ ต่อกระดาษ 1 แผ่น A3`]
      .map((l, i) => `<text x="${A_W / 2}" y="${688 + i * 36}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${C_SUB}">${esc(l)}</text>`)
      .join("")}
  </svg>`;
  // เป็ดของร้าน 1 ตัวต่อ 1 ช่องรูป (ยืมจากแผ่น HOW TO PRINT — ตัวเดียวกับภาพจำลองสินค้าอื่น)
  const ducks = await Promise.all(
    built.frames.map(async (f, i) => {
      const dh = Math.round(f.h * 0.62);
      const buf = await sharp(duckBuf)[i % 2 ? "flop" : "clone"]().resize({ height: dh }).toBuffer();
      const { width = 0 } = await sharp(buf).metadata();
      return { input: buf, left: Math.round(f.x + (f.w - width) / 2), top: Math.round(f.y + (f.h - dh) / 2) };
    })
  );
  await sharp(Buffer.from(svg))
    .composite(ducks)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(`${OUT}/size-${slugOf(s.id)}-art-${V}.jpg`);
}
await sharp(heroRaw).resize(1400, 1400, { fit: "inside" }).jpeg({ quality: 88 }).toFile(`${OUT}/gallery-1-${V}.jpg`);
await sharp(bothRaw).resize(1400, 1400, { fit: "inside" }).jpeg({ quality: 88 }).toFile(`${OUT}/gallery-2-${V}.jpg`);
await sharp(layoutRaw).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/layout-${V}.jpg`);
console.log(`🖼  ภาพรายขนาด ${webSizes.length} ใบ + ภาพจำลองขนาด ${webSizes.length} ใบ + แกลเลอรี 2 ใบ + ผังวางแบบ 1 ใบ → ${OUT}`);

/* ── 4. ตัวสินค้า ───────────────────────────────────────────────── */
const CHANNELS: Record<string, string> = {
  "Photo Booth Strips 4.2x12cm": "รูป 2 ช่อง",
  "Photo Booth Strips 5x15.2cm": "รูป 3 ช่อง",
};
const sizeGroup: ProductOption = {
  label: "ขนาด",
  note: "ราคาคิดเป็น **แผ่น A3** — ทั้งสองขนาดราคาเท่ากัน ต่างกันที่จำนวนใบที่ได้ต่อแผ่น",
  display: "cards",
  choices: webSizes.map((s) => ({
    name: `${s.label.replace("x", " × ").replace("cm", " ซม.")} (${CHANNELS[s.id]})`,
    desc: `สตริป${CHANNELS[s.id]} — 1 แผ่น A3 ตัดได้ ${s.sheets} ใบ`,
    badge: `${s.sheets} ใบ / แผ่น A3`,
    imageSrc: IMG(`size-${slugOf(s.id)}`),
    piecesPerUnit: s.sheets,
    perUnit: s.sheets,
    ...(s.id === "Photo Booth Strips 4.2x12cm" ? { popular: true } : {}),
  })),
};

/** ชนิดสติ๊กเกอร์ยกทั้งชุดจาก sticker-pp (เป็นแกนตารางราคาด้วย) */
const matGroup: ProductOption = {
  label: MAT_LABEL,
  note: "เนื้อสติ๊กเกอร์ PP กันน้ำทุกแบบ — ราคาต่างกันตามเนื้อ (ดูตารางราคาด้านบน)",
  display: "cards",
  choices: MATERIALS,
};

const coatGroup: ProductOption = {
  label: COAT_LABEL,
  note:
    `ค่าเคลือบรวมอยู่ในราคาต่อแผ่น A3 แล้ว — ชุดราคาเดียวกับ**สติ๊กเกอร์ Digital (ไดคัท 50%)** · ` +
    `ช่วง ${TIERS[0].label} เนื้อ ${MATERIALS[0].name}: ไม่เคลือบ ${BASE("ไม่เคลือบ", 0)} · เงา/ด้าน ${BASE("เคลือบเงา", 0)} · พิเศษ ${BASE("เคลือบพิเศษ", 0)} บาท`,
  display: "cards",
  choices: [
    { name: "ไม่เคลือบ", desc: "งานพิมพ์เปลือย ไม่เคลือบฟิล์ม — ราคาเบาที่สุด", imageSrc: COAT("none") },
    { name: "เคลือบเงา", desc: "ฟิล์มใสผิวเงา สีดูสดขึ้น กันรอยขีดข่วน/ความชื้นได้ดีขึ้น", imageSrc: COAT("gloss"), popular: true },
    { name: "เคลือบด้าน", desc: "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน ให้ลุคมินิมอลดูแพง", imageSrc: COAT("matte") },
    { name: "เคลือบพิเศษ", desc: "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม (เลือกลายด้านล่าง)", imageSrc: COAT("glitter") },
  ],
};

/** ลายฟิล์มเคลือบพิเศษ 10 แบบ — ลิงก์คลังตัวเลือกกลาง preset-2 (ชุดเดียวกับสติ๊กเกอร์ Digital) */
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
  showWhen: { label: COAT_LABEL, choices: ["เคลือบพิเศษ"] },
  choices: SPECIAL.map(([name, file]) => ({ name, imageSrc: COAT(file) })),
};

const sizeLine = webSizes.map((s) => `${s.label.replace("x", " × ").replace("cm", " ซม.")} (${CHANNELS[s.id]}) ${s.sheets} ใบ/แผ่น A3`).join(" · ");
const last = TIERS.length - 1;

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวสินค้า::",
      "• โฟโต้บูธสตริปแบบสติ๊กเกอร์ ออกแบบลายเองได้ทั้งใบ — เก็บสะสม ทำรูปที่ระลึก หรือแจกเป็นของขวัญ/ของชำร่วยในงานอีเวนต์",
      "• พิมพ์ระบบ Digital สีคมชัด บนกระดาษสติ๊กเกอร์ PP กันน้ำ ลอกแผ่นรองแล้วแปะได้เลย",
      "::ขนาดที่มี::",
      ...webSizes.map((s) => `• ${s.label.replace("x", " × ").replace("cm", " ซม.")} (${CHANNELS[s.id]}) — 1 แผ่น A3 ตัดได้ ${s.sheets} ใบ`),
      "::เนื้อสติ๊กเกอร์::",
      ...MATERIALS.map((m) => `• ${m.name}${m.desc ? ` — ${m.desc}` : ""}`),
      "::ราคา::",
      `• คิดเป็นแผ่น A3 — ชุดราคาเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) ลดเป็นขั้นตามจำนวน ${TIERS.length} ขั้น`,
      `• ${TIERS[0].label} เนื้อ ${MATERIALS[0].name}: ไม่เคลือบ ${BASE("ไม่เคลือบ", 0)} บาท/แผ่น A3 · เคลือบเงา/ด้าน ${BASE("เคลือบเงา", 0)} · เคลือบพิเศษ ${BASE("เคลือบพิเศษ", 0)}`,
      `• สั่งเยอะสุด (${TIERS[last].label}) เหลือแผ่นละ ${BASE("ไม่เคลือบ", last)} บาท — ดูราคาทุกเนื้อ/ทุกขั้นได้ที่ตารางราคาด้านบน`,
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
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกขนาด → เนื้อสติ๊กเกอร์ → การเคลือบ → จำนวนแผ่น A3 แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนลายที่คละ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n' +
      "หรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ขนาด/เนื้อ/การเคลือบที่เลือก · จำนวนแผ่น A3 · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์ JPG / PNG ขนาดไฟล์ไม่เกิน 10,000 pixels · ความละเอียดไม่ต่ำกว่า 300 dpi",
      "• งานกระดาษ/สติ๊กเกอร์พิมพ์สี RGB — ควรตั้งโหมดไฟล์เป็น RGB ก่อนวาด Artwork",
      "• ขนาดไฟล์ควรเท่าหรือใหญ่กว่าขนาดงานที่สั่ง และเผื่อตัดตกด้านละ 2 มม.",
      "• วางภาพให้เต็มพื้นที่ template ไม่ควรเหลือขอบ · ข้อความหรือส่วนสำคัญให้อยู่ในระยะปลอดภัย ไม่ชิดขอบตัด",
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
  slug: "photo-booth-sticker",
  name: NAME,
  category: "sticker-paper",
  price: BASE("ไม่เคลือบ", last), // ราคาต่ำสุดในตาราง (ขั้นสั่งเยอะสุด)
  emoji: "📸",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "โฟโต้บูธสตริป (PHOTO BOOTH) แบบสติ๊กเกอร์ พิมพ์ลายตามสั่งบนกระดาษสติ๊กเกอร์ PP กันน้ำ ระบบ Digital Printing " +
    `เลือกได้ 2 ขนาด — ${sizeLine} · เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ ` +
    "เคลือบเงา ด้าน หรือเคลือบพิเศษกลิตเตอร์/ทราย/โฮโลแกรม 10 ลาย " +
    "คิดราคาเป็นแผ่น A3 ไม่มีขั้นต่ำ สั่ง 1 แผ่นก็ได้ ยิ่งสั่งเยอะยิ่งถูก — ทำเก็บสะสม ของที่ระลึก หรือแจกในงานอีเวนต์",
  highlights: [
    `2 ขนาด — ${sizeLine}`,
    `เนื้อสติ๊กเกอร์ PP กันน้ำ ${MATERIALS.length} แบบ (ขาวมัน ขาวด้าน ขาวมุก ใสรองขาว ใสไม่รองขาว)`,
    "เคลือบเงา / ด้าน / เคลือบพิเศษ กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย",
    "ออกแบบลายเองได้ทั้งใบ · คละลายในแผ่นเดียวกันได้ ลายละ 5 บาท",
    `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) — ${BASE("ไม่เคลือบ", 0)} บาท/แผ่น A3 สั่งเยอะเหลือ ${BASE("ไม่เคลือบ", last)} บาท`,
  ],
  images: [
    { emoji: "📸", gradient: "from-sky-100 to-cyan-200", label: "โฟโต้บูธสตริปสติ๊กเกอร์ — งานจริง", src: IMG("gallery-1") },
    { emoji: "📸", gradient: "from-sky-100 to-cyan-200", label: "ทั้ง 2 ขนาด — 2 ช่อง และ 3 ช่อง", src: IMG("gallery-2") },
    ...webSizes.map((s) => ({
      emoji: "📸",
      gradient: "from-sky-100 to-cyan-200",
      label: `${s.label.replace("x", " × ").replace("cm", " ซม.")} (${CHANNELS[s.id]}) — ${s.sheets} ใบ/แผ่น A3`,
      src: IMG(`size-${slugOf(s.id)}`),
    })),
    // ภาพจำลองขนาด — เทียบสัดส่วนสองใบให้เห็นว่าใบไหนยาวกว่าและมีกี่ช่อง
    ...webSizes.map((s) => ({
      emoji: "📐",
      gradient: "from-sky-100 to-cyan-200",
      label: `ภาพจำลองขนาด ${s.label.replace("x", " × ").replace("cm", " ซม.")} (${CHANNELS[s.id]})`,
      src: IMG(`size-${slugOf(s.id)}-art`),
    })),
  ],
  pricing: {
    unit: "แผ่น A3",
    driverLabels: [MAT_LABEL, COAT_LABEL],
    tiers: TIERS,
    cells: CELLS,
  },
  options: [sizeGroup, matGroup, coatGroup, specialGroup],
  // เลือก "เคลือบพิเศษ" แล้วต้องระบุลายฟิล์ม — ชุดเดียวกับสติ๊กเกอร์ Digital
  rules: [
    {
      when: { label: COAT_LABEL, choice: "เคลือบพิเศษ", choices: ["เคลือบพิเศษ"] },
      limit: { label: "เคลือบ", allow: SPECIAL.map(([name]) => name) },
    },
  ],
  // ค่าคละลายชุดเดียวกับสติ๊กเกอร์รูปทรง / สติ๊กเกอร์ Digital (ลายละ 5 บาท ลายแรกไม่คิด)
  mixRule: { baseFee: 5, includedDesigns: 2, extraFee: 5, tiers: [{ fromQty: 1, baseFee: 5, includedDesigns: 2, extraFee: 5 }] },
  terms: [
    // terms เป็นข้อความล้วน (ไม่ผ่านตัวแปลง **เน้น** เหมือน note ของกลุ่มตัวเลือก) — ห้ามใส่ ** ที่นี่
    "• ราคาและจำนวนที่สั่งนับเป็นแผ่น A3 — " +
      webSizes.map((s) => `${s.label.replace("x", " × ").replace("cm", " ซม.")} ได้ ${s.sheets} ใบ`).join(" · "),
    "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
    "• เนื้อสติ๊กเกอร์และการเคลือบคิดรวมอยู่ในตารางราคาแล้ว — เลือกที่ตัวเลือกได้เลย",
    "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. · งานเคลือบลามิเนตอาจมีฝุ่นเล็กน้อย",
    "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
  ].join("\n"),
  tabs: TABS,
  seo: {
    title: "รับผลิตโฟโต้บูธสตริปสติ๊กเกอร์ ออกแบบเอง 2 ขนาด | iDucky Prints",
    description:
      "รับผลิต Photo Booth Strips แบบสติ๊กเกอร์ ออกแบบลายเอง 4.2×12 ซม. (2 ช่อง) และ 5×15.2 ซม. (3 ช่อง) " +
      `กระดาษสติ๊กเกอร์ PP กันน้ำ เคลือบเงา/ด้าน/กลิตเตอร์/โฮโลแกรม คิดเป็นแผ่น A3 เริ่ม ${BASE("ไม่เคลือบ", last)} บาท ไม่มีขั้นต่ำ ส่งทั่วไทย`,
    faqs: [
      {
        q: "โฟโต้บูธสตริปคิดราคายังไง 1 แผ่น A3 ได้กี่ใบ?",
        a:
          `คิดเป็นแผ่น A3 — ${webSizes.map((s) => `${s.label} ได้ ${s.sheets} ใบ`).join(" · ")} ` +
          `ราคาชุดเดียวกับสติ๊กเกอร์ Digital (ไดคัท 50%) เริ่ม ${BASE("ไม่เคลือบ", 0)} บาท/แผ่น A3 ` +
          `สั่งเยอะลดเป็นขั้นถึงแผ่นละ ${BASE("ไม่เคลือบ", last)} บาท`,
      },
      { q: "มีกี่ขนาด ต่างกันยังไง?", a: `2 ขนาด: ${sizeLine} — ทั้งสองขนาดราคาเท่ากัน` },
      {
        q: "เนื้อสติ๊กเกอร์กับการเคลือบมีให้เลือกอะไรบ้าง?",
        a:
          `เนื้อสติ๊กเกอร์ ${MATERIALS.length} แบบ: ${MATERIALS.map((m) => m.name).join(" · ")} · ` +
          `เคลือบ 4 แบบ: ไม่เคลือบ ${BASE("ไม่เคลือบ", 0)} · เคลือบเงา ${BASE("เคลือบเงา", 0)} · เคลือบด้าน ${BASE("เคลือบด้าน", 0)} · ` +
          `เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย) ${BASE("เคลือบพิเศษ", 0)} บาท/แผ่น A3 ในช่วง ${TIERS[0].label}`,
      },
      { q: "ใช้เวลาผลิตกี่วัน มีขั้นต่ำไหม?", a: "ผลิต 2-3 วันทำการ ไม่รวมจัดส่ง · ไม่มีขั้นต่ำ สั่ง 1 แผ่น A3 ก็ได้" },
    ],
  },
  hidden: true, // ยังเป็นฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log("\n📦 สรุปสินค้า");
console.log(`   ราคา ${range.min}-${range.max} บาท/แผ่น A3 · ${saved.options.length} กลุ่มตัวเลือก · ${Object.keys(CELLS).length} แถวราคา`);
for (const coat of COATS) console.log(`   ${MATERIALS[0].name} │ ${coat.padEnd(12)} ${CELLS[`${MATERIALS[0].name}│${coat}`].join(" / ")}`);
console.log(`   ขนาด: ${sizeLine}`);
console.log(`   เนื้อ: ${MATERIALS.map((m) => m.name).join(" · ")}`);

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
const sort = (row?.sort as number | undefined) || ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
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

#!/usr/bin/env npx tsx
/**
 * POLAROID / โพลารอยด์ — สร้างสินค้าจากร่างเปล่าที่ผู้ใช้กด "＋ เพิ่มสินค้า" ไว้
 *
 *   npx tsx scripts/polaroid-build.mts           # ดึงราคา/ภาพลง .cache แล้วสรุปให้ดู (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/polaroid-build.mts --write   # อัปภาพ + เขียนลง Supabase (ยังเป็นฉบับร่าง)
 *
 * ── ที่มาของราคา (ผู้ใช้สั่ง 1 ก.ย. 69 · รอบสอง) ────────────────────────────
 * "ต้องการให้ราคาตาม postcard-th" → ยกตารางราคาของโปสการ์ดมาทั้งชุด (อ่านสดจาก Supabase):
 *   ขั้นจำนวน 7 ขั้น × ทุกช่อง ชนิดกระดาษ │ เคลือบ — ค่าเคลือบฝังอยู่ในตารางแล้ว (เงา/ด้าน +10 · พิเศษ +30)
 *
 * ⚠️ ทับของเดิม 2 อย่างที่เคยทำไว้รอบแรก:
 *   • ราคาจากหน้าร้านจริง (อาร์ตเกาหลี 80/60 · ผิวพิเศษ 130/110 · Stardream 150/130 · 2 ขั้น)
 *     — ตารางโปสการ์ดคิดกระดาษเกือบทุกชนิดเท่ากันที่ 90 บาท/แผ่น A3 ผิวพิเศษจึงถูกลงมาก
 *   • ค่าเคลือบพิเศษ +20 ของสติ๊กเกอร์ Digital — ของโปสการ์ดคือ +30
 *   สคริปต์ยังยิงราคาหน้าร้านมา log ไว้เทียบให้เห็นทุกครั้ง (CROSS-CHECK)
 *
 * ── ชนิดกระดาษ ─────────────────────────────────────────────────────────────
 * ยกชื่อ/คำอธิบายมาจากโปสการ์ด (postcard-th) · เอากระดาษที่หน้า Polaroid มี + ตัด Eggshell 280 ทิ้ง
 * (ร้านเลิกขายทั้งระบบ) + เพิ่ม **อาร์ตมัน 350 / 400 แกรม** ตามที่ผู้ใช้สั่ง (หน้าร้านไม่มีในเมนู แต่โปสการ์ดมีราคา)
 * กติกา "กระดาษผิวพิเศษเคลือบไม่ได้" (Canvas / Stardream / Stardream Crystal / Extra) อ่านสดจาก rules ของโปสการ์ด
 *
 * ── หน่วยขาย ───────────────────────────────────────────────────────────────
 * เว็บนับ quantity = แผ่น A3 · ป้ายขนาดบนเว็บ "10x8.5cm | จำนวน 12 ใบ" = 1 แผ่น A3 ตัดได้ 12 ใบ
 * (ทรงเดียว ขนาดเดียว — กลุ่ม "ขนาด" จึงมีตัวเลือกเดียว ไว้บอกขนาด/จำนวนใบต่อแผ่น)
 *
 * ── ภาพประกอบตัวเลือก (ผู้ใช้สั่ง: อยากเห็นว่าแต่ละแบบหน้าตาเป็นยังไง) ──────
 *   • "ชนิดกระดาษ" — ภาพเนื้อกระดาษจริงชุด PBS-* จากหน้า /Polaroid/ ตัดแถบคำบรรยายท้ายภาพออก
 *     (Stardream กับ Stardream Crystal ใช้ภาพใบเดียวกัน — เว็บถ่ายรวมไว้ใบเดียว)
 *     อาร์ตมัน 350/400 ไม่มีภาพบนหน้านั้น — ยืมการ์ดความหนาที่มีอยู่แล้วในคลัง products/paper-foil/gram-*.jpg
 *   • "เคลือบ" — ภาพชุดกลางทั้งร้าน products/coating-b/* (ชุด B) ผ่านกลุ่มที่ยกมาจาก sticker-pp
 *   • แกลเลอรี 5 ใบ — ภาพงานจริงจากหน้าสินค้าเดิม 4 ใบ + แบนเนอร์ 1 ใบ
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceTier, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1wu6o-1002"; // ร่างเปล่าที่ผู้ใช้สร้างไว้ 1 ก.ย. 69
const NAME = "POLAROID / โพลารอยด์";
const DIR = ".cache/polaroid";
const OUT = `${DIR}/upload`;
const V = "v1";
const PF = 385; // product family ของ POLAROID บนระบบ getprintbox
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

/* ── 1. ราคากระดาษสดจาก API หน้าร้าน ────────────────────────────── */
const PBX = "https://tpdigital-pbx2.getprintbox.com/api/editor";
const HEADERS = { "X-version": "v6", "Accept-Language": "th", "X-Currency": "THB", "X-Pbx-Store-Name": "iDuckyOfficial" };
const api = async (path: string) => {
  const res = await fetch(`${PBX}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`ดึง ${path} ไม่ได้ — HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
};

const family = await api(`product-families/${PF}/?moduleId=383&channel=web`);
const attrOf = (id: string) => {
  const a = (family.attributes ?? []).find((x: any) => x.id === id);
  if (!a) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${id}" ในเว็บต้นทางแล้ว — โครงหน้าเปลี่ยน มาดูเองก่อน`);
  return a;
};
const sizeValue = attrOf("size").values[0];
const SIZE_RAW = String(sizeValue.displayName); // "10x8.5cm | จำนวน 12 ใบ"
const PER_A3 = Number(/(\d+)\s*ใบ/.exec(SIZE_RAW)?.[1] ?? 0);
const SIZE_NAME = SIZE_RAW.split("|")[0].trim().replace(/x/i, " × ").replace(/cm/i, " ซม.");
if (!PER_A3) throw new Error(`อ่านจำนวนใบต่อแผ่น A3 จาก "${SIZE_RAW}" ไม่ได้ — ป้ายบนเว็บเปลี่ยน`);
console.log(`📋 ขนาด: ${SIZE_NAME} · 1 แผ่น A3 ได้ ${PER_A3} ใบ`);

/** ชนิดกระดาษฝั่งเว็บ → ชื่อที่ใช้ในร้าน (ตรงกับกลุ่มของ postcard-th) · null = ไม่เอา */
const PAPER_MAP: Record<string, string | null> = {
  "Paper 300 gram": "กระดาษอาร์ตเกาหลี 300 แกรม",
  "Canvas Paper": "Canvas Paper 260 แกรม",
  "Eggshell Paper": null, // ร้านเลิกขายแล้ว (ถอดทั้งระบบ)
  "100 Pound Paper": "100 Pound Paper 300 แกรม",
  "E-Photo Paper": "E-Photo Paper 290 แกรม",
  "Stardream Crystal Paper": "Stardream Crystal Paper 285 แกรม",
  "Stardream  Paper": "Stardream Paper 285 แกรม",
  "Extra Paper": "Extra Paper 260 แกรม",
};
/**
 * กระดาษที่หน้าร้านยังไม่มีในเมนู แต่ผู้ใช้สั่งให้เพิ่ม (1 ก.ย. 69) — ราคาอยู่ในตารางโปสการ์ดอยู่แล้ว
 * เสียบต่อจากอาร์ตเกาหลี 300 (กระดาษอาร์ตด้วยกัน) · id ตั้งเองเพราะฝั่งเว็บไม่มี
 */
const EXTRA_PAPERS: { id: string; name: string; after: string }[] = [
  { id: "_art-gloss-350", name: "กระดาษอาร์ตมัน 350 แกรม", after: "Paper 300 gram" },
  { id: "_art-gloss-400", name: "กระดาษอาร์ตมัน 400 แกรม", after: "Paper 300 gram" },
];
const sitePapers: string[] = attrOf("PaperType").values.map((v: any) => v.id);
for (const id of sitePapers)
  if (!(id in PAPER_MAP)) throw new Error(`เว็บเพิ่มกระดาษใหม่ "${id}" ที่สคริปต์ยังไม่รู้จัก — มาเติมเองก่อน`);
const papers: { id: string; name: string }[] = [];
for (const id of sitePapers) {
  if (PAPER_MAP[id]) papers.push({ id, name: PAPER_MAP[id]! });
  for (const x of EXTRA_PAPERS) if (x.after === id) papers.push({ id: x.id, name: x.name });
}

/** ราคารวม (net) ของจำนวน qty แผ่น A3 · null = เว็บไม่ได้ตั้งราคาให้ชุดนี้ (unknown_price) */
const priceOf = async (qty: number, paper: string, lam = "No liminate"): Promise<number | null> => {
  const params = encodeURIComponent(JSON.stringify([{ Laminate: lam, PaperType: paper }]));
  const rows = await api(`prices/?productFamilyId=${PF}&currency=THB&quantity=${qty}&params=${params}`);
  return typeof rows?.[0]?.net === "number" ? rows[0].net : null;
};

/*
 * ราคายกมาจากโปสการ์ด (postcard-th) ทั้งตาราง — ผู้ใช้สั่ง 1 ก.ย. 69 "ต้องการให้ราคาตาม postcard-th"
 * ทับของเดิมที่เคยดึงราคาจากหน้าร้าน (อาร์ตเกาหลี 80/60 · ผิวพิเศษ 130-150) และค่าเคลือบของสติ๊กเกอร์ Digital
 * ตารางโปสการ์ดคิดกระดาษทุกชนิดเท่ากันที่ 90 บาท/แผ่น A3 (ยกเว้นอาร์ตมัน 350/400 ที่แพงขึ้นตามความหนา)
 * และมี 7 ขั้นจำนวน · ค่าเคลือบฝังอยู่ในตารางแล้ว (เงา/ด้าน +10 · พิเศษ +30 ในขั้นแรก)
 */

/* ── 2. ตารางราคา + กลุ่มตัวเลือก ───────────────────────────────── */
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";
const SPECIAL_LABEL = "เคลือบ";
const FROM_PAPER = "postcard-th";
const { data: pcRow, error: pcErr } = await sb.from("products").select("name,data").eq("id", FROM_PAPER).single();
if (pcErr) throw pcErr;
const postcard: any = pcRow.data;
const pcPaper = (postcard.options ?? []).find((o: any) => o.label === "ชนิดกระดาษ");
if (!pcPaper) throw new Error(`ไม่เจอกลุ่ม "ชนิดกระดาษ" ใน ${FROM_PAPER} — โครงต้นทางเปลี่ยน`);
const pcDesc = new Map<string, string | undefined>(pcPaper.choices.map((c: any) => [c.name, c.desc]));
for (const p of papers)
  if (!pcDesc.has(p.name)) throw new Error(`โปสการ์ดไม่มีกระดาษ "${p.name}" แล้ว — ชื่อกระดาษสองฝั่งไม่ตรงกัน`);

/** กระดาษที่เคลือบไม่ได้ — ยกกฎมาจากโปสการ์ด (ผิวลายผ้าใบ/มุก/คราฟต์ ลามิเนตไม่ติด) */
const NO_COAT = new Set(
  (postcard.rules ?? [])
    .filter((r: any) => r.limit?.label === "เคลือบ (เฉพาะด้านหน้า)" && String(r.limit.allow) === "ไม่เคลือบ")
    .flatMap((r: any) => r.when.choices ?? [r.when.choice])
    .filter((n: string) => papers.some((p) => p.name === n))
);
console.log(`🚫 กระดาษที่เคลือบไม่ได้ (ตามโปสการ์ด): ${[...NO_COAT].join(" · ") || "ไม่มี"}`);

/* กลุ่มเคลือบ: ยกจากสติ๊กเกอร์ Digital เพราะเป็นทรงการ์ด (display "cards") มีรูป+คำอธิบายครบ
   — ของโปสการ์ดเป็น dropdown ไม่โชว์รูป · ชื่อตัวเลือกสองฝั่งตรงกันอยู่แล้ว ราคาจึงยังอ่านจากตารางโปสการ์ดได้ */
const FROM_COAT = "sticker-pp";
const { data: stickerRow, error: stickerErr } = await sb.from("products").select("name,data").eq("id", FROM_COAT).single();
if (stickerErr) throw stickerErr;
const sticker: any = stickerRow.data;
const coatGroup: ProductOption = structuredClone((sticker.options ?? []).find((o: any) => o.label === COAT_LABEL));
const specialGroup: ProductOption = structuredClone((sticker.options ?? []).find((o: any) => o.label === SPECIAL_LABEL));
if (!coatGroup || !specialGroup) throw new Error(`ไม่เจอกลุ่มเคลือบใน ${FROM_COAT} — โครงต้นทางเปลี่ยน`);
const COATS = coatGroup.choices.map((c) => c.name);

/* ตารางราคา: ยกจากโปสการ์ดตรง ๆ (ขั้นจำนวน + ทุกช่องของกระดาษที่สินค้านี้มี) */
const pcPricing = postcard.pricing;
if (String(pcPricing?.driverLabels) !== String(["ชนิดกระดาษ", COAT_LABEL]))
  throw new Error(`แกนตารางราคาของ ${FROM_PAPER} เปลี่ยนไปแล้ว (${pcPricing?.driverLabels?.join(" × ")}) — มาดูเองก่อน`);
const TIERS: PriceTier[] = structuredClone(pcPricing.tiers) as PriceTier[];
const CELLS: Record<string, number[]> = {};
for (const p of papers)
  for (const coat of COATS) {
    const row = pcPricing.cells[`${p.name}│${coat}`];
    if (!row) throw new Error(`โปสการ์ดไม่มีช่องราคา "${p.name}│${coat}" — ชื่อกระดาษ/เคลือบสองฝั่งไม่ตรงกัน`);
    CELLS[`${p.name}│${coat}`] = [...row];
  }
/** ราคาไม่เคลือบต่อกระดาษ (ใช้เขียนข้อความ) + ส่วนต่างค่าเคลือบของกระดาษหลัก */
const BASE: Record<string, number[]> = Object.fromEntries(papers.map((p) => [p.name, CELLS[`${p.name}│ไม่เคลือบ`]]));
const REF = papers[0].name;
const COAT_DELTA: Record<string, number[]> = Object.fromEntries(
  COATS.filter((c) => c !== "ไม่เคลือบ").map((c) => [c, TIERS.map((_, i) => CELLS[`${REF}│${c}`][i] - BASE[REF][i])])
);
console.log(
  `💰 ราคายกมาจาก "${pcRow.name}" — ${papers.length} กระดาษ × ${COATS.length} เคลือบ × ${TIERS.length} ขั้น · ` +
    `ค่าเคลือบขั้นแรก: ${COATS.filter((c) => c !== "ไม่เคลือบ").map((c) => `${c} +${COAT_DELTA[c][0]}`).join(" · ")}`
);

/* CROSS-CHECK: หน้าร้านจริงยังขายเท่าไหร่ (คนละชุดราคากันแล้ว — log ไว้ให้เห็นว่าต่างกันตรงไหน) */
const siteRef = await priceOf(1, "Paper 300 gram");
console.log(`🔎 หน้าร้านจริง (${REF} · ไม่เคลือบ · 1 แผ่น A3) = ${siteRef} · ตารางโปสการ์ดที่ใช้ = ${BASE[REF][0]}`);

/* ── 5. ภาพ ─────────────────────────────────────────────────────── */
const GS = "https://storage.googleapis.com/pbx-sw-tpdigital/media";
const CDN = "https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage";
/** ภาพเนื้อกระดาษจริงบนหน้า /Polaroid/ (คีย์ = id กระดาษฝั่งเว็บ) */
const PAPER_IMG: Record<string, [slug: string, url: string]> = {
  "Paper 300 gram": ["art-korea-300", `${GS}/fd/0a/51/1750231043/PBS-Art300g.png`],
  "Canvas Paper": ["canvas", `${GS}/03/g0/d5/1750231043/PBS-Canvas Paper.png`],
  "100 Pound Paper": ["pound-100", `${GS}/bd/f3/49/1750231043/PBS-100 Pound Paper.png`],
  "E-Photo Paper": ["e-photo", `${GS}/50/1d/4b/1750231044/PBS-E-photo.png`],
  // เว็บถ่าย Stardream กับ Stardream Crystal รวมไว้ในใบเดียว — ใช้ไฟล์เดียวกันทั้งคู่
  "Stardream Crystal Paper": ["stardream", `${GS}/43/e5/2b/1750231044/PBS-Stardream.png`],
  "Stardream  Paper": ["stardream", `${GS}/43/e5/2b/1750231044/PBS-Stardream.png`],
  "Extra Paper": ["extra", `${GS}/61/4d/9a/1750231044/PBS-Extra Paper.png`],
};
/**
 * กระดาษที่ใช้ภาพ "ที่มีอยู่แล้วในคลัง" ไม่ต้องอัปใหม่ — อาร์ตมัน 350/400 มีการ์ดความหนาของ paper-foil อยู่แล้ว
 * (หน้า /Polaroid/ ไม่มีภาพอาร์ตมันให้ดึง)
 */
const SHOP_IMG = (path: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${path}`;
const PAPER_IMG_REUSE: Record<string, string> = {
  "_art-gloss-350": SHOP_IMG("paper-foil/gram-350.jpg"),
  "_art-gloss-400": SHOP_IMG("paper-foil/gram-400.jpg"),
};
const GALLERY: [name: string, url: string, label: string][] = [
  ["gallery-1", `${CDN}/fedd11ed-0262-4f9c-b799-d7a678b610c2/Polaroid_thumb_900x900`, "โพลารอยด์พิมพ์ลาย — งานจริง"],
  ["gallery-2", `${CDN}/a5295518-334b-4ce0-900f-bfa4bdc94bbe/Polaroid_thumb_900x900`, "โพลารอยด์ — ชุดลายเที่ยว"],
  ["gallery-3", `${CDN}/55207d22-9805-4445-850a-c99fcd77d658/Polaroid_thumb_900x900`, "โพลารอยด์ — ระยะใกล้เห็นเนื้อกระดาษ"],
  ["gallery-4", `${CDN}/d634e87a-79f6-4e45-a4a3-188928d2cb3d/Polaroid_thumb_900x900`, "โพลารอยด์ — จัดวางพร้อมของสะสม"],
  ["gallery-5", `${GS}/72/a6/84/1772444776/PRL1.jpg`, "โพลารอยด์ — งานจริงหลายใบ"],
];
const LAYOUT = `${GS}/77/60/fe/1767611694/PS-POLAROID-01.jpg`;

const grab = async (url: string, file: string) => {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(encodeURI(url).replace(/%25/g, "%"));
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
};

// ภาพเนื้อกระดาษ: 765×664 มีแถบคำบรรยายท้ายภาพ ~12% — ตัดออก (ชื่อกระดาษโชว์บนการ์ดอยู่แล้ว
// และแถบของ Stardream เขียนรวม 2 ชนิดไว้ในใบเดียว ถ้าไม่ตัดจะขัดกับชื่อบนการ์ด)
const doneImg = new Set<string>();
for (const p of papers) {
  if (PAPER_IMG_REUSE[p.id]) continue; // ใช้ภาพในคลังอยู่แล้ว
  const [slug, url] = PAPER_IMG[p.id] ?? [];
  if (!slug) throw new Error(`ยังไม่มีภาพเนื้อกระดาษของ "${p.id}" ในสคริปต์ — มาเติมเองก่อน`);
  if (doneImg.has(slug)) continue;
  doneImg.add(slug);
  const raw = await grab(url, `${DIR}/src/paper-${slug}.png`);
  const meta = await sharp(raw).metadata();
  await sharp(raw)
    .flatten({ background: "#ffffff" })
    .extract({ left: 0, top: 0, width: meta.width ?? 765, height: Math.round((meta.height ?? 664) * 0.88) })
    .jpeg({ quality: 88 })
    .toFile(`${OUT}/paper-${slug}-${V}.jpg`);
}
console.log(`🖼  ภาพเนื้อกระดาษ ${doneImg.size} ใบ → ${OUT}/paper-*.jpg`);

for (const [name, url] of GALLERY) {
  const raw = await grab(url, `${DIR}/src/${name}.bin`);
  await sharp(raw).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(`${OUT}/${name}-${V}.jpg`);
}
const layoutRaw = await grab(LAYOUT, `${DIR}/src/layout.jpg`);
await sharp(layoutRaw).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/layout-${V}.jpg`);
console.log(`🖼  แกลเลอรี ${GALLERY.length} ใบ + ผังวางแบบ 1 ใบ`);

/* ── 6. ตัวสินค้า ───────────────────────────────────────────────── */
const sizeGroup: ProductOption = {
  label: "ขนาด",
  note: `ราคาคิดเป็น **แผ่น A3** — 1 แผ่น A3 ตัดได้ ${PER_A3} ใบ`,
  choices: [{ name: SIZE_NAME, badge: `ได้ ${PER_A3} ใบ / แผ่น A3`, piecesPerUnit: PER_A3, perUnit: PER_A3 }],
};
const paperGroup: ProductOption = {
  label: "ชนิดกระดาษ",
  display: "cards",
  choices: papers.map((p) => ({
    name: p.name,
    ...(pcDesc.get(p.name) ? { desc: pcDesc.get(p.name) } : {}),
    imageSrc: PAPER_IMG_REUSE[p.id] ?? IMG(`paper-${PAPER_IMG[p.id][0]}`),
    ...(p.id === "Paper 300 gram" ? { popular: true } : {}),
  })),
};

const cheapest = Math.min(...Object.values(CELLS).flat());
const startPrice = BASE[papers[0].name][0];

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวงาน::",
      `• โพลารอยด์ขนาด ${SIZE_NAME} พิมพ์ระบบ Digital สีคมชัด — ออกแบบลายเองได้ทั้งใบ`,
      `• 1 แผ่น A3 ตัดได้ ${PER_A3} ใบ (ราคาและจำนวนที่สั่งนับเป็นแผ่น A3)`,
      "::ชนิดกระดาษ::",
      ...papers.map((p) => `• ${p.name} — ${BASE[p.name][0]} บาท/แผ่น A3 (${TIERS[0].label})`),
      "::การเคลือบ::",
      `• เคลือบเงา / เคลือบด้าน +${COAT_DELTA["เคลือบเงา"][0]} บาท/แผ่น A3 · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย) +${COAT_DELTA["เคลือบพิเศษ"][0]} บาท/แผ่น A3`,
      `• กระดาษผิวพิเศษ ${[...NO_COAT].join(" · ")} เคลือบไม่ได้ (ลามิเนตไม่ติดผิว)`,
      "::ราคา/คละลาย::",
      `• สั่ง ${TIERS[1].label} ราคาต่อแผ่นลดลงทุกชนิดกระดาษ — ดูตารางราคาด้านบน`,
      "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
      "::ระยะเวลาผลิต::",
      "• 2-3 วันทำการ ไม่รวมเวลาจัดส่ง",
    ].join("\n"),
    images: [IMG("gallery-1"), IMG("gallery-5")],
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      "• ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
      "• งานกระดาษ การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้",
      "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. จากข้อจำกัดของเครื่องตัด",
      "• งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% — ผลิตคนละรอบ/คนละเครื่องสีอาจไม่เท่ากัน",
    ].join("\n"),
  },
  {
    title: "วิธีสั่งงาน",
    text:
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกชนิดกระดาษ → การเคลือบ → จำนวนแผ่น A3 แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนลายที่คละ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n' +
      "หรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ชนิดกระดาษ/การเคลือบที่เลือก · จำนวนแผ่น A3 · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์ JPG / PNG ขนาดไฟล์ไม่เกิน 10,000 pixels · ความละเอียดไม่ต่ำกว่า 300 dpi",
      "• งานกระดาษพิมพ์สี RGB — ควรตั้งโหมดไฟล์เป็น RGB ก่อนวาด Artwork",
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
  slug: "polaroid",
  name: NAME,
  category: "card-photo",
  price: cheapest,
  emoji: "📸",
  gradient: "from-sky-100 to-indigo-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    `โพลารอยด์ (POLAROID) พิมพ์ลายตามสั่ง ขนาด ${SIZE_NAME} ระบบ Digital Printing สีคมชัด ` +
    `เลือกเนื้อกระดาษได้ ${papers.length} ชนิด ตั้งแต่อาร์ตเกาหลี 300 แกรม · อาร์ตมัน 350/400 แกรม ไปจนถึงกระดาษผิวพิเศษ Canvas · E-Photo · Stardream · Extra ` +
    `คิดราคาเป็นแผ่น A3 (1 แผ่นตัดได้ ${PER_A3} ใบ) เลือกเคลือบเงา ด้าน หรือเคลือบพิเศษกลิตเตอร์/ทราย/โฮโลแกรม 10 ลาย ` +
    "เหมาะทำรูปที่ระลึก ของสะสม ของขวัญ — ไม่มีขั้นต่ำ ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    `ขนาด ${SIZE_NAME} — 1 แผ่น A3 ตัดได้ ${PER_A3} ใบ`,
    `กระดาษให้เลือก ${papers.length} ชนิด พร้อมภาพเนื้อกระดาษจริงให้ดูก่อนเลือก`,
    "เคลือบเงา / ด้าน / เคลือบพิเศษ กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย",
    `เริ่ม ${startPrice} บาท/แผ่น A3 — สั่ง ${TIERS[1].label} เหลือแผ่นละ ${BASE[papers[0].name][1]} บาท`,
    "คละลายในแผ่นเดียวกันได้ ลายละ 5 บาท ลายแรกไม่คิด",
  ],
  images: GALLERY.map(([name, , label]) => ({
    emoji: "📸",
    gradient: "from-sky-100 to-indigo-200",
    label,
    src: IMG(name),
  })),
  pricing: { unit: "แผ่น A3", driverLabels: ["ชนิดกระดาษ", COAT_LABEL], tiers: TIERS, cells: CELLS },
  options: [sizeGroup, paperGroup, coatGroup, specialGroup],
  rules: [
    // เลือก "เคลือบพิเศษ" แล้วต้องระบุลายฟิล์ม — กฎเดียวกับสติ๊กเกอร์ Digital / โปสการ์ด
    {
      when: { label: COAT_LABEL, choice: "เคลือบพิเศษ", choices: ["เคลือบพิเศษ"] },
      limit: { label: SPECIAL_LABEL, allow: specialGroup.choices.map((c) => c.name) },
    },
    // กระดาษผิวพิเศษเคลือบไม่ได้ (ยกกฎมาจากโปสการ์ด)
    ...(NO_COAT.size
      ? [
          {
            when: { label: "ชนิดกระดาษ", choice: [...NO_COAT][0] as string, choices: [...NO_COAT] as string[] },
            limit: { label: COAT_LABEL, allow: ["ไม่เคลือบ"] },
          },
        ]
      : []),
  ],
  // ค่าคละลายชุดเดียวกับโปสการ์ด / สติ๊กเกอร์ Digital (ลายละ 5 บาท ลายแรกไม่คิด)
  mixRule: structuredClone(postcard.mixRule),
  terms: [
    `• 1 แผ่น A3 ตัดได้ ${PER_A3} ใบ — ราคาและจำนวนที่สั่งนับเป็นแผ่น A3`,
    "• คละลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)",
    `• กระดาษผิวพิเศษ ${[...NO_COAT].join(" · ")} เคลือบไม่ได้`,
    "• ชนิดกระดาษและการเคลือบคิดรวมอยู่ในตารางราคาแล้ว",
    "• การตัดชิ้นงานอาจคลาดเคลื่อน ±0.5-2 มม. · งานเคลือบลามิเนตอาจมีฝุ่นเล็กน้อย",
    "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
  ].join("\n"),
  tabs: TABS,
  seo: {
    title: `รับพิมพ์โพลารอยด์ ${SIZE_NAME} พิมพ์ลายตามสั่ง | iDucky Prints`,
    description:
      `รับพิมพ์โพลารอยด์ (Polaroid) ขนาด ${SIZE_NAME} พิมพ์ลายตามสั่ง เลือกกระดาษได้ ${papers.length} ชนิด ` +
      `รวมกระดาษผิวพิเศษ Canvas / Stardream / E-Photo เคลือบเงา/ด้าน/พิเศษ คิดเป็นแผ่น A3 (1 แผ่นได้ ${PER_A3} ใบ) เริ่ม ${startPrice} บาท ไม่มีขั้นต่ำ`,
    faqs: [
      {
        q: `โพลารอยด์คิดราคายังไง 1 แผ่น A3 ได้กี่ใบ?`,
        a:
          `คิดเป็นแผ่น A3 — 1 แผ่น A3 ตัดได้ ${PER_A3} ใบ ขนาด ${SIZE_NAME} ` +
          `เริ่มแผ่นละ ${startPrice} บาท (${papers[0].name}) · สั่ง ${TIERS[1].label} เหลือแผ่นละ ${BASE[papers[0].name][1]} บาท`,
      },
      { q: "มีกระดาษอะไรให้เลือกบ้าง?", a: `เลือกได้ ${papers.length} ชนิด: ${papers.map((p) => p.name).join(" · ")}` },
      {
        q: "เคลือบได้ไหม ราคาเท่าไหร่?",
        a:
          `เคลือบเงา/เคลือบด้าน +${COAT_DELTA["เคลือบเงา"][0]} บาท/แผ่น A3 · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย) +${COAT_DELTA["เคลือบพิเศษ"][0]} บาท/แผ่น A3 · ` +
          `กระดาษผิวพิเศษ ${[...NO_COAT].join(" · ")} เคลือบไม่ได้`,
      },
      { q: "ใช้เวลาผลิตกี่วัน มีขั้นต่ำไหม?", a: "ผลิต 2-3 วันทำการ ไม่รวมจัดส่ง · ไม่มีขั้นต่ำ สั่ง 1 แผ่น A3 ก็ได้" },
    ],
  },
  hidden: true, // ยังเป็นฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log("\n📦 สรุปสินค้า");
console.log(`   ราคา ${range.min}-${range.max} บาท/แผ่น A3 · ${saved.options.length} กลุ่ม · ${Object.keys(CELLS).length} ช่องราคา`);
for (const p of papers)
  console.log(`   ${p.name.padEnd(30)} ${COATS.map((c) => CELLS[`${p.name}│${c}`].join("/")).join("  ·  ")}`);

// แกนตารางราคาต้องมีกลุ่มรองรับ ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
const labels = new Set(saved.options.map((o) => o.label));
for (const d of saved.pricing!.driverLabels) if (!labels.has(d)) throw new Error(`แกนราคา "${d}" ไม่มีกลุ่มตัวเลือกรองรับ`);
for (const r of saved.rules ?? [])
  for (const l of [r.when.label, r.limit.label]) if (!labels.has(l)) throw new Error(`กฎอ้างกลุ่ม "${l}" ที่ไม่มีจริง`);
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

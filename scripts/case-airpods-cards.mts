/**
 * CASE AIRPODS (case-airpods): ราคา + ภาพประกอบตัวเลือก ตามหน้า pricelists /caseairpods
 * (ผู้ใช้สั่ง 25 ส.ค. 69 — ราคาใน DB ตรงกับเว็บอยู่แล้ว สคริปต์นี้ "ตรวจ" ราคาแล้วเติมภาพ/ตัวเลือก)
 *
 *   npx tsx scripts/case-airpods-cards.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/case-airpods-cards.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * สิ่งที่ทำ:
 * 1. ตรวจตารางราคาใน DB ให้ตรงเว็บ pricelists ทุกช่อง (ไม่ตรง = หยุด ไม่เขียนทับ)
 * 2. เปลี่ยนชื่อกลุ่ม "ขนาด" → "แบบสกรีน" (ชื่อเดิมมาจาก import ไม่ตรงความหมาย)
 *    ⚠️ เป็นแกนตารางราคา — เปลี่ยน pricing.driverLabels ให้ตรงกันในคราวเดียว (สินค้ายังเป็นร่าง ไม่มีตะกร้าค้าง)
 * 3. กลุ่ม "แบบสกรีน" → การ์ด (รูปตัวอย่างงานจริงจากหน้า pricelists + คำอธิบาย)
 * 4. เพิ่มกลุ่ม "รุ่น Airpods" (ปุ่ม 5 รุ่น — ไม่มีผลกับราคา)
 * 5. เพิ่มกลุ่ม "สีเคส" → การ์ด 10 สี A1-A10 รูปครอปจากผังสีใหม่ (มีให้เลือก "10แบบ")
 *    ผังสีเป็นไฟล์ในรีโป scripts/assets/case-airpods-color-chart.webp (ยังไม่ขึ้นเว็บ pricelists)
 *    ข้อจำกัดรุ่นของแต่ละสี (เช่น A7/A8 เฉพาะ Airpods 1/2) เขียนไว้ใน desc ของการ์ด
 * 6. แกลเลอรี: เติมผังสี + รูปงานจริง 3 ใบ (รวมของเดิม = 5 ครบเพดาน MAX_PHOTOS)
 *
 * ⛔ อย่ารัน --write ซ้ำ: ภาพการ์ด "แบบสกรีน" ถูกเปลี่ยนเป็นชุด v2 แล้ว (case-airpods-screen-art-v2.mts
 *    ตามรูปที่ผู้ใช้ชี้เอง 25 ส.ค. 69) — รันทับจะดึงกลับเป็นชุด v1
 * ⚠️ ห้ามเปลี่ยนชื่อตัวเลือกสกรีน 3 ตัว — เป็นคอลัมน์ตารางราคา (pricing.cells)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const ID = "case-airpods";
const V = "v1";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const { data: row, error: readErr } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr || !row) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const product = row.data as Product;

/* ── 1. ตรวจราคาให้ตรงเว็บ pricelists (www.iduckyofficial-pricelists.com/caseairpods · เช็ค 25 ส.ค. 69) ── */
const SITE_CELLS: Record<string, number[]> = {
  "สกรีนบอดี้ 1 ด้าน": [200, 180, 150, 100, 90, 80],
  "สกรีนบอดี้ 2 ด้าน และ ฝา": [260, 250, 200, 140, 130, 120],
  "สกรีนบอดี้ หรือ ฝา": [230, 210, 180, 120, 110, 100],
};
const SITE_TIERS = [10, 29, 49, 99, 499, null];
const pricing = (product as { pricing?: { cells: Record<string, number[]>; tiers: { upTo: number | null }[]; driverLabels: string[] } }).pricing;
if (!pricing) throw new Error("สินค้าไม่มีตารางราคา (pricing) — โครงต่างจากที่สคริปต์คาดไว้ ตรวจก่อน");
for (const [col, prices] of Object.entries(SITE_CELLS)) {
  const got = pricing.cells[col];
  if (!got || got.join() !== prices.join())
    throw new Error(`ราคาคอลัมน์ "${col}" ใน DB (${got?.join()}) ไม่ตรงเว็บ (${prices.join()}) — ตรวจก่อน ไม่เขียนทับ`);
}
if (pricing.tiers.map((t) => t.upTo).join() !== SITE_TIERS.join())
  throw new Error(`ขั้นจำนวน (tiers) ใน DB ไม่ตรงเว็บ — ตรวจก่อน`);
console.log("✓ ตารางราคาใน DB ตรงกับเว็บ pricelists ทุกช่อง (3 คอลัมน์ × 6 ขั้น)");

/* ── เตรียมรูป: ผังสีจากไฟล์ในรีโป + รูปงานจริงจาก wixstatic (หน้า pricelists) ── */
const CHART = new URL("./assets/case-airpods-color-chart.webp", import.meta.url).pathname;
if (!existsSync(CHART)) throw new Error(`ไม่พบไฟล์ผังสี ${CHART}`);
const chartBuf = readFileSync(CHART);
const chartMeta = await sharp(chartBuf).metadata();
if (chartMeta.width !== 1580 || chartMeta.height !== 1580)
  throw new Error(`ผังสีไม่ใช่ 1580×1580 (ได้ ${chartMeta.width}×${chartMeta.height}) — กรอบครอปคำนวณจาก 1580 ตรวจก่อน`);

async function wix(id: string, expectWidth: number): Promise<Buffer> {
  const buf = Buffer.from(await (await fetch(`https://static.wixstatic.com/media/${id}`)).arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (meta.width !== expectWidth)
    throw new Error(`รูป ${id} กว้าง ${meta.width} ไม่ตรงที่คาด (${expectWidth}) — ต้นทางอาจเปลี่ยน ตรวจกรอบครอปก่อน`);
  return buf;
}
const photo1Side = await wix("959b83_7a423073d23545bf92458df94c633a0b~mv2.jpg", 4333); // เคสใสขุ่น สกรีนบอดี้ด้านหน้า
const photoBear = await wix("959b83_25663cb44767467f86322e2305e2e973~mv2.jpg", 3883); // เคสดำ สกรีนฝา+บอดี้
const photoLid = await wix("959b83_fe52dd3fd1fe44398860c88a0346d707~mv2.jpg", 4242); // เคสขาว สกรีนที่ฝา
const photoTray = await wix("959b83_1936665d72cf4a438532dbaf39737e45~mv2.jpg", 4419); // เคสใสแข็ง 3 ใบบนถาดไม้
const photoPastel = await wix("959b83_13d52b25695e4e8ea25a40b0315e88b7~mv2.jpg", 4872); // เคสนิ่มพาสเทล 4 สี

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}
const crop = (src: Buffer, box: sharp.Region, width: number) =>
  sharp(src).extract(box).resize({ width }).jpeg({ quality: 88 }).toBuffer();

/** กรอบครอปสี A1-A10 บนผัง 1580×1580 (แถวบน A1-A6 · ล่างซ้าย A7-A8 · ล่างขวา A9-A10) */
const COLOR_CROPS: Record<string, sharp.Region> = {
  a1: { left: 118, top: 528, width: 205, height: 268 },
  a2: { left: 390, top: 548, width: 195, height: 255 },
  a3: { left: 612, top: 548, width: 195, height: 250 },
  a4: { left: 832, top: 558, width: 190, height: 240 },
  a5: { left: 1052, top: 566, width: 190, height: 236 },
  a6: { left: 1268, top: 528, width: 195, height: 285 },
  a7: { left: 180, top: 1145, width: 205, height: 272 },
  a8: { left: 438, top: 1162, width: 215, height: 262 },
  a9: { left: 862, top: 1192, width: 215, height: 238 },
  a10: { left: 1135, top: 1192, width: 230, height: 238 },
};
const colorArt: Record<string, string> = {};
for (const [name, box] of Object.entries(COLOR_CROPS))
  colorArt[name] = await put(`color-${name}`, await crop(chartBuf, box, 600));

const screenArt = {
  oneSide: await put("screen-1side", await crop(photo1Side, { left: 1230, top: 420, width: 2050, height: 2300 }, 600)),
  twoSideLid: await put("screen-2side-lid", await crop(photoBear, { left: 416, top: 1988, width: 2265, height: 1710 }, 600)),
  bodyOrLid: await put("screen-body-or-lid", await crop(photoLid, { left: 253, top: 1616, width: 1414, height: 1263 }, 600)),
};
const galleryArt = {
  chart: await put("color-chart", await sharp(chartBuf).resize({ width: 1200 }).jpeg({ quality: 90 }).toBuffer()),
  tray: await put("gallery-clearhard", await sharp(photoTray).resize({ width: 1200 }).jpeg({ quality: 88 }).toBuffer()),
  pastel: await put("gallery-pastel", await sharp(photoPastel).resize({ width: 1200 }).jpeg({ quality: 88 }).toBuffer()),
};

/* ── 2-3. กลุ่ม "ขนาด" → "แบบสกรีน" + การ์ด ── */
const OLD_LABEL = "ขนาด";
const NEW_LABEL = "แบบสกรีน";
const screenOpt = product.options.find((o) => o.label === OLD_LABEL) ?? product.options.find((o) => o.label === NEW_LABEL);
if (!screenOpt) throw new Error(`ไม่พบกลุ่ม "${OLD_LABEL}"/"${NEW_LABEL}" — ตรวจก่อน`);
const missingScreen = Object.keys(SITE_CELLS).filter((n) => !screenOpt.choices.some((c) => c.name === n));
if (missingScreen.length) throw new Error(`ไม่พบตัวเลือก ${missingScreen.join(", ")} — ชื่อใน DB อาจเปลี่ยน ตรวจก่อน`);
screenOpt.label = NEW_LABEL;
pricing.driverLabels = pricing.driverLabels.map((l) => (l === OLD_LABEL ? NEW_LABEL : l));
screenOpt.display = "cards";
const SCREEN_CARD: Record<string, { img: string; desc: string; popular?: boolean }> = {
  "สกรีนบอดี้ 1 ด้าน": { img: screenArt.oneSide, desc: "สกรีนลายที่ตัวเคส (บอดี้) ด้านหน้า 1 ด้าน — แบบมาตรฐานที่นิยมสั่ง", popular: true },
  "สกรีนบอดี้ 2 ด้าน และ ฝา": { img: screenArt.twoSideLid, desc: "สกรีนตัวเคสทั้งด้านหน้า-หลัง พร้อมฝาเคส — ได้ลายครบรอบตัว" },
  "สกรีนบอดี้ หรือ ฝา": { img: screenArt.bodyOrLid, desc: "สกรีนตำแหน่งเดียว ที่บอดี้ หรือที่ฝาเคส (ระบุตำแหน่งที่ต้องการในหมายเหตุถึงร้าน)" },
};
for (const c of screenOpt.choices) {
  const card = SCREEN_CARD[c.name];
  if (!card) continue;
  c.imageSrc = card.img;
  c.desc = card.desc;
  if (card.popular) c.popular = true;
}

/* ── 4. กลุ่ม "รุ่น Airpods" (ไม่มีผลกับราคา — ให้ร้านรู้ว่าผลิตเคสรุ่นไหน) ── */
const MODEL_LABEL = "รุ่น Airpods";
if (!product.options.some((o) => o.label === MODEL_LABEL)) {
  const modelOpt: ProductOption = {
    label: MODEL_LABEL,
    choices: [
      { name: "Airpods 1/2", popular: true },
      { name: "Airpods 3" },
      { name: "Airpods 4" },
      { name: "Airpods Pro" },
      { name: "Airpods Pro 2" },
    ],
  };
  product.options.splice(product.options.indexOf(screenOpt) + 1, 0, modelOpt);
}

/* ── 5. กลุ่ม "สีเคส" การ์ด 10 สี — ข้อจำกัดรุ่นตามผังสี เขียนใน desc ── */
const COLOR_LABEL = "สีเคส";
const COLOR_CARD: [string, string, string, string?][] = [
  // [ชื่อ, คีย์รูป, desc, badge]
  ["A1 เหลืองอ่อน", "a1", "เคสนิ่มสีเหลืองอ่อน — มีครบทุกรุ่น Airpods 1/2/3(4) และ Pro/Pro 2"],
  ["A2 ดำนิ่ม (ด้าน)", "a2", "เคสนิ่มสีดำ ผิวด้าน — มีถึงรุ่น Airpods 4 (ไม่มีรุ่น Pro/Pro 2)", "NEW"],
  ["A3 ดำแข็ง (เงา)", "a3", "เคสแข็งสีดำ ผิวเงา — มีครบทุกรุ่น · ไม่มีที่ห้อยพวงกุญแจ"],
  ["A4 ขาว", "a4", "เคสนิ่มสีขาว — มีครบทุกรุ่น Airpods 1/2/3(4) และ Pro/Pro 2"],
  ["A5 ใสขุ่น", "a5", "เคสใสขุ่น ผิวด้าน — มีถึงรุ่น Airpods 4 (ไม่มีรุ่น Pro/Pro 2)", "NEW"],
  ["A6 สีครีม", "a6", "เคสนิ่มสีครีม — มีครบทุกรุ่น Airpods 1/2/3(4) และ Pro/Pro 2"],
  ["A7 เขียวอ่อน", "a7", "เคสนิ่มสีเขียวอ่อน — เฉพาะรุ่น Airpods 1/2"],
  ["A8 ใสแข็ง", "a8", "เคสแข็งใส — เฉพาะรุ่น Airpods 1/2 · ไม่มีที่ห้อยพวงกุญแจ"],
  ["A9 ม่วงอ่อน", "a9", "เคสนิ่มสีม่วงอ่อน — เฉพาะรุ่น Airpods 3"],
  ["A10 ฟ้า", "a10", "เคสนิ่มสีฟ้า — เฉพาะรุ่น Airpods Pro 2"],
];
let colorOpt = product.options.find((o) => o.label === COLOR_LABEL);
if (!colorOpt) {
  colorOpt = { label: COLOR_LABEL, choices: [], display: "cards" };
  const modelIdx = product.options.findIndex((o) => o.label === MODEL_LABEL);
  product.options.splice(modelIdx + 1, 0, colorOpt);
}
colorOpt.display = "cards";
colorOpt.choices = COLOR_CARD.map(([name, key, desc, badge]) => ({
  name,
  imageSrc: colorArt[key],
  desc,
  ...(badge ? { badge } : {}),
}));

/* ── 6. แกลเลอรี: ของเดิม 1 + ผังสี + งานจริง 3 = 5 (เพดาน MAX_PHOTOS) ── */
const GALLERY_ADD: { src: string; label: string }[] = [
  { src: galleryArt.chart, label: "สีเคส Airpods มีให้เลือก 10 แบบ" },
  { src: galleryArt.tray, label: "ตัวอย่างงานจริง เคสใสแข็ง" },
  { src: galleryArt.pastel, label: "ตัวอย่างงานจริง เคสนิ่มสีพาสเทล" },
];
product.images = product.images ?? [];
for (const g of GALLERY_ADD) {
  if (product.images.some((im) => im.src === g.src)) continue;
  if (product.images.length >= 5) break;
  product.images.push({ emoji: "🎧", gradient: "from-slate-100 to-blue-100", label: g.label, src: g.src });
}
product.savedAt = new Date().toISOString();

console.log(`\n📦 ${row.name} (${ID})${product.hidden ? " · ร่าง" : " · เผยแพร่อยู่"}`);
console.log(`   「${NEW_LABEL}」(เดิม "${OLD_LABEL}" · แกนตารางราคา เปลี่ยนคู่กับ driverLabels) → การ์ด ${screenOpt.choices.length} ใบ`);
for (const c of screenOpt.choices) console.log(`   - ${c.name}: ${c.desc}`);
console.log(`   「${MODEL_LABEL}」ปุ่ม ${product.options.find((o) => o.label === MODEL_LABEL)!.choices.length} รุ่น`);
console.log(`   「${COLOR_LABEL}」→ การ์ด ${colorOpt.choices.length} สี (รูปครอปจากผังสี 10 แบบ)`);
for (const c of colorOpt.choices) console.log(`   - ${c.name}${c.badge ? ` [${c.badge}]` : ""}: ${c.desc}`);
console.log(`   แกลเลอรี ${product.images.length} รูป: ${product.images.map((im) => im.label).join(" · ")}`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", ID);
if (writeErr) throw new Error(`บันทึกไม่สำเร็จ: ${writeErr.message}`);
const { data: check } = await sb.from("products").select("data->>savedAt").eq("id", ID).single();
if ((check as { savedAt?: string } | null)?.savedAt !== product.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log(`\n✅ อัปรูป + บันทึกแล้ว — http://localhost:3005/products/${ID}`);

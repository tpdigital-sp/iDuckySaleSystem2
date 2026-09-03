#!/usr/bin/env node
/**
 * ภาพสีไหม MADEIRA ชุดใหม่ (v2) — คมชัด ไม่เบลอ
 *
 *   node scripts/thread-color-art.mjs            # วาดลง .tmpwork/thread-art/ ให้ดูก่อน
 *   node scripts/thread-color-art.mjs --write    # อัปขึ้นคลังกลาง + ชี้ URL ใหม่ให้คลัง/สินค้า
 *
 * ⚠️ ทำไมชุดเดิม (v1) เบลอ: ครอปหลอดจากชาร์ตย่อ 2000×1036 ได้ภาพแค่ 116×370 px
 *    พอแกลเลอรีเปิดเต็มจอ (~700px) = ขยาย 6 เท่า
 *
 * ต้นฉบับความละเอียดสูงอยู่บนไดรฟ์ร้าน (ต้อง mount):
 *   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/สีเส้นไหม.jpg  (8988×4658)
 * เก็บสำเนาย่อไว้ที่ scripts/assets/thread-colors/chart-hi.jpg เพื่อรันซ้ำได้โดยไม่ต้องต่อไดรฟ์
 *
 * 🎨 ภาพ 1000×1000 จตุรัส: หลอดไหมเต็มใบวางกลางพื้นขาว (เงาใต้หลอดติดมาจากชาร์ตจริง)
 *    - จตุรัสเพราะกรอบแกลเลอรีเกือบจตุรัส — ภาพผอม 1:3.6 แบบเดิมโดน object-cover ซูมจนเห็นแต่เนื้อไหม
 *    - ไม่ใส่ป้ายรหัส/ชื่อไทยลงภาพ (ลองแล้วดูรก และชื่อมีอยู่บนการ์ดตัวเลือกอยู่แล้ว)
 *    - ครอปชิดหลอด (halfW 235) กันแถบเงาสี่เหลี่ยมจาง ๆ จากพื้นชาร์ตติดมา
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const V = "v2";
const LIB = "products/thread-colors";
const PRESET_ROW = "__preset_preset-4";
const OUT = ".tmpwork/thread-art/";
const ASSET = "scripts/assets/thread-colors/chart-hi.jpg";
const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/สีเส้นไหม.jpg";

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
mkdirSync(OUT, { recursive: true });

/* ── ต้นฉบับ: ใช้สำเนาใน repo ก่อน ไม่มีค่อยดึงจากไดรฟ์ ── */
if (!existsSync(ASSET)) {
  if (!existsSync(DRIVE)) die(`ไม่มีทั้งสำเนา ${ASSET} และไดรฟ์ร้าน — ต้อง mount ไดรฟ์ iDuckyShop ก่อน`);
  mkdirSync("scripts/assets/thread-colors", { recursive: true });
  // ย่อครึ่ง (4494px) — ยังคมกว่าชาร์ตเดิม 2.2 เท่า และไฟล์ไม่บวม repo
  await sharp(DRIVE).resize({ width: 4494 }).jpeg({ quality: 88 }).toFile(ASSET);
  console.log(`📥 ก๊อปต้นฉบับจากไดรฟ์ → ${ASSET}`);
}
const meta = await sharp(ASSET).metadata();
console.log(`📐 ชาร์ตต้นทาง ${meta.width}×${meta.height}`);

/** พิกัดวัดบนต้นฉบับ 8988×4658 — สเกลตามความกว้างจริงของไฟล์ที่ใช้ */
const K = meta.width / 8988;
const px = (n) => Math.round(n * K);
const SPOOL = { top: px(1860), height: px(1620), width: px(470) }; // หลอด + พื้นขาวรอบนิดหน่อย
const THREADS = [
  { code: "1803", name: "ขาว", cx: 950 },
  { code: "1816", name: "ชมพู", cx: 1520 },
  { code: "1637", name: "แดง", cx: 2104 },
  { code: "1866", name: "เหลือง", cx: 2664 },
  { code: "1521", name: "ส้ม", cx: 3256 },
  { code: "1702", name: "เขียวอ่อน", cx: 3836 },
  { code: "1851", name: "เขียวเข้ม", cx: 4410 },
  { code: "1827", name: "ฟ้า", cx: 4988 },
  { code: "1742", name: "น้ำเงิน", cx: 5584 },
  { code: "1711", name: "ม่วง", cx: 6166 },
  { code: "1614", name: "เทา", cx: 6744 },
  { code: "1658", name: "น้ำตาล", cx: 7340 },
  { code: "1800", name: "ดำ", cx: 7948 },
];

/* ── กันพิกัดเลื่อน: กลางหลอดต้องไม่ใช่พื้นชาร์ต และช่องว่างระหว่างหลอดต้องเป็นพื้น ── */
{
  const { data, info } = await sharp(ASSET).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const bg = (p) => p[0] > 244 && p[1] > 244 && p[2] > 244;
  const midY = SPOOL.top + Math.round(SPOOL.height / 2);
  for (let i = 0; i < THREADS.length; i++) {
    const cx = px(THREADS[i].cx);
    if (bg(at(cx, midY))) die(`ไม่เจอหลอดไหมตรงกลาง ${THREADS[i].name} (${THREADS[i].code}) — พิกัดเลื่อน`);
    if (i && !bg(at(Math.round((px(THREADS[i - 1].cx) + cx) / 2), midY)))
      die(`ช่องว่าง ${THREADS[i - 1].name}-${THREADS[i].name} ไม่ใช่พื้นขาว — พิกัดเลื่อน`);
  }
  console.log("✓ พิกัดหลอดครบ 13 ตรงตำแหน่ง");
}

/* ── ภาพจตุรัส 1000×1000: หลอดกลางพื้นขาว ── */
const CARD = 1000;
const S_H = 880; // ความสูงหลอดในภาพ — เว้นขอบบน-ล่างข้างละ 60

const cards = {};
for (const t of THREADS) {
  const strip = await sharp(ASSET)
    .extract({
      left: px(t.cx) - Math.round(SPOOL.width / 2),
      top: SPOOL.top,
      width: SPOOL.width,
      height: SPOOL.height,
    })
    .resize({ height: S_H })
    .toBuffer();
  const sW = (await sharp(strip).metadata()).width;

  const buf = await sharp({ create: { width: CARD, height: CARD, channels: 3, background: "#ffffff" } })
    .composite([{ input: strip, left: Math.round((CARD - sW) / 2), top: Math.round((CARD - S_H) / 2) }])
    .jpeg({ quality: 92 })
    .toBuffer();
  writeFileSync(`${OUT}thread-${t.code}-${V}.jpg`, buf);
  cards[t.code] = buf;
}
const S_W = Math.round((S_H * SPOOL.width) / SPOOL.height);
// ชาร์ตเต็มความละเอียดสูงสำหรับปุ่ม 👀 (กว้าง 2400 พอสำหรับดูเต็มจอ)
const chart = await sharp(ASSET).resize({ width: 2400 }).jpeg({ quality: 88 }).toBuffer();
writeFileSync(`${OUT}thread-chart-${V}.jpg`, chart);
console.log(`🎨 วาดภาพ ${THREADS.length} ใบ + ชาร์ต → ${OUT} (หลอด ${S_W}×${S_H} px ในกรอบ ${CARD}×${CARD})`);

if (!WRITE) {
  console.log("\n(dry-run) ดูรูปใน .tmpwork/thread-art/ แล้วรันซ้ำด้วย --write");
  process.exit(0);
}

/* ── อัป + ชี้ URL ใหม่ ── */
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const PUB = `${SUPA}/storage/v1/object/public/product-images`;
const imgOf = (code) => `${PUB}/${LIB}/thread-${code}-${V}.jpg`;
const CHART_URL = `${PUB}/${LIB}/thread-chart-${V}.jpg`;
const codeOf = (name) => THREADS.find((t) => name.includes(t.code))?.code;

for (const t of THREADS) {
  const { error } = await sb.storage
    .from("product-images")
    .upload(`${LIB}/thread-${t.code}-${V}.jpg`, cards[t.code], { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัป ${t.code}: ${error.message}`);
}
const upC = await sb.storage
  .from("product-images")
  .upload(`${LIB}/thread-chart-${V}.jpg`, chart, { contentType: "image/jpeg", upsert: true });
if (upC.error) die(`อัปชาร์ต: ${upC.error.message}`);
console.log(`↑ อัปขึ้น ${LIB}/ แล้ว ${THREADS.length + 1} ไฟล์`);

/* คลังตัวเลือกกลาง — ตัวจริงที่หน้าร้านอ่าน (resolveOptions ทับ choices ของสินค้า) */
const { data: pr, error: prErr } = await sb.from("products").select("data").eq("id", PRESET_ROW).maybeSingle();
if (prErr || !pr) die(`อ่านคลัง ${PRESET_ROW} ไม่ได้`);
const pd = structuredClone(pr.data);
pd.choices = pd.choices.map((c) => {
  const code = codeOf(c.name);
  if (!code) die(`คลัง: "${c.name}" ไม่มีรหัสสีไหม`);
  return { ...c, imageSrc: imgOf(code) };
});
const { data: pBack, error: pErr } = await sb.from("products").update({ data: pd }).eq("id", PRESET_ROW).select("data");
if (pErr) die(`เขียนคลัง: ${pErr.message}`);
if (!pBack?.length) die("เขียนคลังโดน 0 แถว");
for (const c of pBack[0].data.choices) {
  if (c.imageSrc !== imgOf(codeOf(c.name))) die(`คลัง: imageSrc "${c.name}" ไม่ลง`);
  if (!c.stockItemId) die(`คลัง: stockItemId "${c.name}" หาย`);
}
console.log("✓ คลัง preset-4 ชี้รูป v2 แล้ว (stockItemId ครบ)");

/* สินค้าที่มี snapshot รูปเก่า + ชาร์ตใน noteImageSrc */
const { data: rows, error: rErr } = await sb
  .from("products")
  .select("id,name,data")
  .neq("category", "__presets__")
  .limit(3000);
if (rErr) die(rErr.message);
let n = 0;
for (const p of rows) {
  const data = structuredClone(p.data);
  let touched = 0;
  for (const o of data.options || []) {
    if (!/สีไหม/.test(o.label || "")) continue;
    const names = (o.choices || []).map((c) => (typeof c === "string" ? c : c.name));
    if (names.length !== THREADS.length || !THREADS.every((t) => names.some((x) => x.includes(t.code)))) continue;
    if (o.noteImageSrc && o.noteImageSrc.includes("/thread-colors/")) o.noteImageSrc = CHART_URL;
    o.choices = o.choices.map((c) => {
      const ch = typeof c === "string" ? { name: c } : { ...c };
      return ch.imageSrc?.includes("/thread-colors/") ? { ...ch, imageSrc: imgOf(codeOf(ch.name)) } : ch;
    });
    touched++;
  }
  if (!touched) continue;
  data.savedAt = new Date().toISOString();
  const { data: back, error } = await sb.from("products").update({ data }).eq("id", p.id).select("data");
  if (error) die(`${p.id}: ${error.message}`);
  if (!back?.length) die(`${p.id}: update โดน 0 แถว`);
  n++;
  console.log(`  · ${p.id} (${p.name}) — ${touched} กลุ่ม → รูป v2`);
}
for (const t of THREADS) {
  const head = await fetch(imgOf(t.code), { method: "HEAD" });
  if (!head.ok) die(`รูป ${t.code} เปิดไม่ได้ (${head.status})`);
}
console.log(`\n✅ เสร็จ — คลัง 1 + สินค้า ${n} รายการ · รูปทั้ง 13 เปิดได้`);

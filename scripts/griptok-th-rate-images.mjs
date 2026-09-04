#!/usr/bin/env node
/**
 * กริ๊บต๊อก (GripTok) ทรงกลม | ทรงหัวใจ — id `griptok-th` (URL /products/กริ๊บต๊อก-GripTok-ทรงกลม-ทรงหัวใจ)
 * ภาพประจำ "เรทราคา" 2 เรท — แผงเลือกเรทเป็นการ์ดรูป 80 px แต่ยังไม่มีภาพเลยสักเรท
 *
 *   node scripts/griptok-th-rate-images.mjs           (ทำภาพลง .cache/griptok/upload ดูก่อน)
 *   node scripts/griptok-th-rate-images.mjs --write   (+ อัปโหลด storage + ติดภาพให้เรท + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: "สร้างภาพตัวอย่าง ที่กลุ่มตัวเลือก เรทราคา"
 *
 * 2 เรทต่างกันแค่ "ผิวหน้า" (ราคาต่างกัน ~30-40%) — ใช้ **ภาพงานจริงของสินค้าเอง** ไม่ได้วาดใหม่:
 *   r1 แบบปกติ      ← รูปแกลเลอรี 075b0a5a… (กริ๊บต๊อกพิมพ์ UV ผิวเรียบ ครอปจัตุรัสรอบตัวชิ้นงาน)
 *   r2 เคลือบเรซิ่น ← โปสเตอร์คลิปงานจริง resin-clip-poster-v1 (กองงานเคลือบเรซิ่น ผิวนูนเงาสะท้อนไฟ)
 * แล้วแปะแถบล่างบอกผิว + ภาพตัดขวาง (เรียบ vs นูน) ให้ต่างกันชัดตอนดูภาพใหญ่ในแกลเลอรี
 * ตอนย่อ 80 px อ่านจาก "หน้าตาภาพ" ได้อยู่แล้ว: ชิ้นเดียวพื้นฟ้า vs กองชิ้นเงาวาว ([[iducky-option-thumb-crop]])
 *
 * ⚠️ ภาพประจำเรทไหลเข้าแกลเลอรีเองด้วย (galleryImages ใน ProductDetail รวม priceRates[].imageSrc)
 *    — ตั้งใจ: กดเลือกเรทแล้วภาพใหญ่เด้งไปภาพนั้น ถ้าไม่อยู่ในแกลเลอรีจะกดแล้วเงียบ
 * ⚠️ แก้ภาพเมื่อไหร่ขึ้นรุ่น VER ใหม่ อย่าอัปทับชื่อเดิม ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: อ่านของเดิมมาแก้เฉพาะ `priceRates[].imageSrc` ไม่แตะราคา/ตัวเลือก/แกนตาราง
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "griptok-th";
const VER = "v1";
const SRC = ".cache/griptok/src";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/griptok/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b";

/**
 * ภาพตัดขวางของชิ้นงาน (มองด้านข้าง) — บอกจุดต่างจริงของ 2 เรท
 * ฐานคือตัวหนีบพลาสติก · ทับด้วยแผ่นพิมพ์ UV · เรทเรซิ่นมีโดมใสนูนคลุมอีกชั้น
 */
const crossSection = (x, y, { resin }) => {
  const w = 132, h = 20;                       // แผ่นพิมพ์ UV
  const dome = resin
    ? `<path d="M${x - w / 2} ${y} q ${w / 2} -46 ${w} 0 z" fill="#e0f2fe" stroke="#0891b2" stroke-width="4"/>
       <path d="M${x - w / 2 + 22} ${y - 9} q ${w * 0.28} -22 ${w * 0.42} -3" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`
    : "";
  return `
    ${dome}
    <rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="4" fill="#38bdf8"/>
    <path d="M${x - w / 2 - 10} ${y + h} h ${w + 20} l -22 30 h -${w - 24} z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="3"/>`;
};

/** แถบล่างบอกผิวงาน + ภาพตัดขวาง (พื้นขาวโปร่งวางบนภาพถ่าย) */
const band = ({ title, sub, resin }) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}">
  <rect x="34" y="${W - 210}" width="${W - 68}" height="176" rx="28" fill="#ffffff" opacity="0.94"/>
  <g>${crossSection(150, W - 132, { resin })}</g>
  <text x="256" y="${W - 137}" font-family="${TH}" font-size="44" font-weight="700" fill="${INK}">${title}</text>
  <text x="256" y="${W - 88}" font-family="${TH}" font-size="27" fill="${SUB}">${sub}</text>
</svg>`);

/** ครอปจัตุรัสจากรูปงานจริง → 900×900 แล้วแปะแถบล่าง */
const make = async ({ file, crop, title, sub, resin, out }) => {
  const base = await sharp(`${SRC}/${file}`).extract(crop).resize(W, W).toBuffer();
  const buf = await sharp(base).composite([{ input: band({ title, sub, resin }) }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${out}`, buf);
  // ⚠️ sharp: .resize() ต่อกัน 2 ครั้งในไปป์ไลน์เดียว ครั้งหลังทับครั้งแรก — ต้องคั่น toBuffer()
  await sharp(await sharp(buf).resize(80, 80).toBuffer()).resize(480, 480, { kernel: "nearest" }).toFile(`${OUT}/thumb-zoom-${out}`);
  console.log(`🖼  ${OUT}/${out}  ${Math.round(buf.length / 1024)} KB — ${title}`);
  return buf;
};

const RATES = [
  {
    id: "r1",
    label: "GripTok UV แบบปกติ",
    out: `rate-uv-${VER}.jpg`,
    // รูปแกลเลอรี 1200×750 — ชิ้นงานอยู่กลางค่อนขวา ครอบจัตุรัส 700 รอบตัวชิ้น
    file: "075b0a5a-5fc0-47ac-bcb0-ad8af9007008.jpg",
    crop: { left: 236, top: 30, width: 700, height: 700 },
    title: "ผิวเรียบ",
    sub: "พิมพ์ UV ลงหน้าชิ้นงานตรง ๆ · ผิวเสมอกันทั้งใบ",
    resin: false,
  },
  {
    id: "r2-ve8ue",
    label: "GripTok UV แบบเคลือบเรซิ่น",
    out: `rate-resin-${VER}.jpg`,
    // โปสเตอร์คลิปงานจริง 640×1136 — ครอปช่วงกลางที่เห็นโดมเรซิ่นสะท้อนไฟชัดที่สุด
    file: "resin-clip-poster-v1.jpg",
    crop: { left: 20, top: 250, width: 600, height: 600 },
    title: "ผิวนูนเงา",
    sub: "เคลือบเรซิ่นทับอีกชั้น นูนหนา เงาวาว สีเข้มขึ้น",
    resin: true,
  },
];

const built = [];
for (const r of RATES) built.push({ ...r, buf: await make(r) });

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ติดภาพให้เรท ───────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.out}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  b.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", b.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-rate-images-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

for (const b of built) {
  const rate = (data.priceRates ?? []).find((r) => r.id === b.id);
  if (!rate) { console.error(`ไม่เจอเรท id=${b.id} — หยุดก่อน`); process.exit(1); }
  if (rate.label !== b.label) { console.error(`ชื่อเรท ${b.id} เปลี่ยนไป (${rate.label}) — หยุดก่อน กันติดภาพผิดเรท`); process.exit(1); }
  rate.imageSrc = b.url;
}
data.savedAt = new Date().toISOString(); // ให้เว็บติด ?v= ใหม่ กันแคชรูปเก่า

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]] ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const rates = back.data.priceRates ?? [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fails = [
  [rates.length === (row.data.priceRates ?? []).length, "จำนวนเรทเปลี่ยน"],
  [built.every((b) => rates.find((r) => r.id === b.id)?.imageSrc === b.url), "ภาพประจำเรทไม่ตรง"],
  [same(rates.map((r) => r.pricing), (row.data.priceRates ?? []).map((r) => r.pricing)), "ตารางราคาในเรทเปลี่ยนไป"],
  [same(back.data.pricing, row.data.pricing), "ตารางราคาหลัก (data.pricing) เปลี่ยนไป"],
  [same(back.data.options, row.data.options), "กลุ่มตัวเลือกเปลี่ยนไป"],
  [back.data.priceMin === row.data.priceMin && back.data.priceMax === row.data.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ต้องเป็น ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\n✓ ติดภาพให้เรทราคาครบ อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);
for (const r of rates) console.log("  ", r.id, "|", r.label, "→", r.imageSrc);

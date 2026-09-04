#!/usr/bin/env node
/**
 * POSTER (poster-a3) — ภาพตัวเลือก "กระดาษหนา 350 แกรม" (ใบที่ยังขาดในกลุ่ม "ชนิดกระดาษ")
 *
 *   node scripts/poster-a3-paper-350-art.mjs           (วาดลง .cache/poster-a3/upload ดูก่อน)
 *   node scripts/poster-a3-paper-350-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * ทำตามชุดเดิมของสินค้านี้เป๊ะ ๆ (paper-130/150/300/400.jpg — วัดพิกัดจากไฟล์จริงมา):
 *   ผืน 800×800 พื้นสีอ่อน · เลขแกรมตัวใหญ่กลางภาพ (กล่องอักษร y 186–406) · คำว่า "แกรม" ใต้เลข
 *   แท่งตัดขวางกระดาษ x 150–650 เส้นขอบหนา 6 ไส้ในขาว = ความหนาจริง + เงาสีอ่อนใต้แท่ง (ห่าง 10 สูง 10)
 *   คำโปรยล่างสุด
 * ความหนาไส้ใน: 130→5px · 150→15 · 300→41 · 400→63 → 350 = 52 (อยู่ระหว่าง 300 กับ 400 ตามจริง)
 * สีชุดนี้ไล่ตาม Tailwind 100/700/300: 130 ฟ้า · 150 เขียวน้ำทะเล · 300 เหลืองอำพัน · 400 ชมพู
 *   → 350 ใช้ "ม่วง" (violet-100/700/300) สีเดียวที่ยังไม่ซ้ำใครในกลุ่ม แยกออกจาก 300/400 ตอนย่อเป็นปุ่ม
 * ⚠️ ชื่อตัวเลือกเป็นคีย์ตารางราคา ("กระดาษหนา 350 แกรม│ไม่เคลือบ" ฯลฯ) — สคริปต์เติมแค่ imageSrc
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "poster-a3";
const GROUP = "ชนิดกระดาษ";
const CHOICE = "กระดาษหนา 350 แกรม";
const FILE = "paper-350-v1.jpg";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/poster-a3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const S = 800;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
/** พาเลตต์ violet — โทนเดียวกับที่ชุดเดิมใช้ (Tailwind 100 / 700 / 300) */
const BG = "#ede9fe";
const INK = "#6d28d9";
const SHADE = "#c4b5fd";

/** พิกัดแท่งกระดาษ — วัดจาก paper-*.jpg ของจริง (ขอบบน 590 · เส้นขอบหนา 6 · กว้าง 150→650) */
const BAR_X = 150;
const BAR_W = 500;
const BAR_TOP = 590;
const STROKE = 6;
const CORE = 52; // ไส้ในขาว = ความหนากระดาษ 350 แกรม (300→41 · 400→63)
const BAR_BOTTOM = BAR_TOP + STROKE + CORE + STROKE; // เส้นขอบวาดเข้าใน (ขยับ ±STROKE/2) ให้ขอบนอก/ไส้ในตรงกับชุดเดิมเป๊ะ

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <text x="400" y="399" font-family="${TH}" font-size="275" text-anchor="middle" fill="${INK}">350</text>
  <text x="400" y="516" font-family="${TH}" font-size="68" text-anchor="middle" fill="${INK}">แกรม</text>

  <!-- แท่งตัดขวาง = ความหนากระดาษ (ไส้ในขาวยิ่งหนา = กระดาษยิ่งหนา) -->
  <rect x="${BAR_X + STROKE / 2}" y="${BAR_TOP + STROKE / 2}" width="${BAR_W - STROKE}" height="${BAR_BOTTOM - BAR_TOP - STROKE}" fill="#ffffff" stroke="${INK}" stroke-width="${STROKE}"/>
  <rect x="${BAR_X}" y="${BAR_BOTTOM + 10}" width="${BAR_W}" height="10" fill="${SHADE}"/>

  <text x="400" y="744" font-family="${TH}" font-size="36" text-anchor="middle" fill="${INK}">หนาพิเศษ · 2 ด้านได้</text>
</svg>`;

const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
/* ครอปกลาง (ปุ่มตัวเลือกครอป 50% กลางภาพ) ไว้ตรวจว่ายังอ่านเลขแกรมออก */
await sharp(buf).extract({ left: 200, top: 200, width: 400, height: 400 }).toFile(`${OUT}/_thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE} (+ _thumb ครอปกลาง)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const group = (data.options ?? []).find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
const choice = group.choices.find((c) => c.name === CHOICE);
if (!choice) { console.error(`ไม่เจอตัวเลือก "${CHOICE}" (ชื่ออาจถูกแก้)`, group.choices.map((c) => c.name)); process.exit(1); }
choice.imageSrc = url;
/* ทุกใบในกลุ่มต้องมีภาพครบ ไม่งั้นปุ่มเรียงกันแล้วขาดหาย */
const missing = group.choices.filter((c) => !c.imageSrc).map((c) => c.name);
if (missing.length) console.warn("⚠️ ยังมีตัวเลือกที่ไม่มีภาพ:", missing);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
const c = g?.choices.find((x) => x.name === CHOICE);
if (c?.imageSrc !== url) { console.error("อ่านกลับไม่ตรง!", c); process.exit(1); }
/* กันเผลอ: คีย์ตารางราคาของ 350 แกรมต้องยังอยู่ครบทั้ง 3 คอลัมน์เคลือบ */
for (const coat of ["ไม่เคลือบ", "เคลือบเงา / ด้าน", "เคลือบพิเศษ"]) {
  if (!back.data.pricing?.cells?.[`${CHOICE}│${coat}`]) { console.error("คีย์ราคาหาย!", `${CHOICE}│${coat}`); process.exit(1); }
}
console.log(`✓ "${CHOICE}" มีภาพแล้ว · ภาพครบ ${g.choices.filter((x) => x.imageSrc).length}/${g.choices.length} ใบ · savedAt =`, back.data.savedAt);

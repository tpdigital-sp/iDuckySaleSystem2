#!/usr/bin/env node
/**
 * สแตนดี้ฐานไฟ (id "1-3") — กลุ่ม "ฐานไฟ" เป็นการ์ด + ภาพงานจริง + บอกเรทเพิ่มขนาดบนภาพ
 *
 *   node scripts/light-standee-base-option-art.mjs           (วาดลง .cache/1-3/upload ดูก่อน)
 *   node scripts/light-standee-base-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: "กลุ่มตัวเลือกฐานไฟให้มีภาพตัวอย่าง + บอกว่าเพิ่มขนาด
 *   ทรงสี่เหลี่ยม ซม.ละ 10 บาท · ทรงกลม ซม.ละ 15 บาท"
 * เรทเดียวกับที่กลุ่ม "ขนาด" คิดเงินจริง (scripts/light-standee-size-option.mjs) — ตรงนี้แค่ "บอก"
 * ให้เห็นตั้งแต่ตอนเลือกทรงฐาน จะได้ไม่ต้องเลื่อนลงไปอ่านในกลุ่มขนาด ไม่มีการคิดเงินซ้ำ
 *
 * ภาพ: รูปงานจริงจากไดรฟ์ร้าน โฟลเดอร์ .../10_อะคริลิค/สแตนดี้อะคริลิค/07-3-3_สแตนดี้ฐานไฟ - ฐานดนตรี-Album CD/
 *   • ภาพใหญ่ = **ซูมที่ตัวฐาน** (ผู้ใช้สั่ง 4 ก.ย. 69 "อยากให้ภาพเห็นฐานชัด ๆ")
 *   • ภาพเล็กมุมขวาบน = ทั้งชิ้นตอนเปิดไฟ ไว้ให้เห็นภาพรวมว่าประกอบแล้วเป็นยังไง
 *   สำเนาต้นฉบับไว้ใน .cache/1-3/ ทุกไฟล์ — ไดรฟ์ไม่ได้ต่อก็รันซ้ำได้
 *
 * ⚠️ กลุ่ม "ฐานไฟ" เป็นแกนตารางราคา (pricing.driverLabels) — แตะได้แค่ display/note/desc/imageSrc
 *    ห้ามแก้ชื่อกลุ่มหรือชื่อตัวเลือกเด็ดขาด (ดู [[iducky-price-driver-trap]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "1-3";
const VER = "v2";   // v1 = ภาพเต็มตัวสแตนดี้ (ฐานเล็กเกินไป) · v2 = ซูมที่ฐาน + ภาพเต็มตัวเป็นภาพเล็ก
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/1-3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const BASE_GROUP = "ฐานไฟ";          // แกนตารางราคา — ห้ามแตะชื่อ
const ROUND = "ทรงกลม";
const SQUARE = "ทรงสี่เหลี่ยม";
const FREE = 15;                      // 15 ซม. แรกรวมในราคาแล้ว

/** ไฟล์ต้นฉบับบนไดรฟ์ร้าน — ใช้ไดรฟ์ก่อน แล้วสำเนาไว้ในแคช (รันซ้ำได้ตอนไดรฟ์ไม่ได้ต่อ) */
const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/สแตนดี้อะคริลิค/07-3-3_สแตนดี้ฐานไฟ - ฐานดนตรี-Album CD";
const SRC = {
  spec: { drive: `${DRIVE}/P-nรวมStandy3-01.jpg`, cache: ".cache/1-3/spec-standy3.jpg" },          // ใบสเปค 2520×4000
  photoSq: { drive: `${DRIVE}/รูป/2020_2.11.2_210812.jpg`, cache: ".cache/1-3/photo-square.jpg" },  // 2048×1280
  photoRd: { drive: `${DRIVE}/รูป/2020.11.2_210812.jpg`, cache: ".cache/1-3/photo-round.jpg" },     // 2048×2048
};
function srcPath(name) {
  const { drive, cache } = SRC[name];
  if (existsSync(drive)) {
    mkdirSync(".cache/1-3", { recursive: true });
    if (!existsSync(cache) || readFileSync(drive).length !== readFileSync(cache).length) copyFileSync(drive, cache);
    return drive;
  }
  if (existsSync(cache)) return cache;
  throw new Error(`ไม่เจอไฟล์ต้นฉบับ ${drive} — ต่อไดรฟ์ iDuckyShop แล้วรันใหม่`);
}

const SHAPES = {
  [SQUARE]: {
    key: "square",
    rate: 10,
    // ซูมที่ฐาน: ครึ่งขวา (เปิดไฟ) ของคู่ภาพในใบสเปค — เห็นแท่งฐานเต็มความยาว + สาย USB
    hero: { src: "spec", crop: { left: 1745, top: 3250, width: 520, height: 303 } },
    // ภาพเล็ก = ทั้งชิ้น (ครอปเดียวกับรุ่น v1)
    full: { src: "spec", crop: { left: 1676, top: 2975, width: 620, height: 516 } },
    baseText: "ฐานไม้ทรงสี่เหลี่ยม 15 × 4.5 × 3 ซม.",
    thick: "อะคริลิคใส 15 ซม. หนา 3 มม. · สกรีน 1 ด้าน",
  },
  [ROUND]: {
    key: "round",
    rate: 15,
    hero: { src: "photoRd", crop: { left: 363, top: 1231, width: 1400, height: 817 } },
    full: { src: "spec", crop: { left: 1692, top: 1757, width: 614, height: 616 } },
    baseText: "ฐานไม้ทรงกลม กว้าง 10 ซม.",
    thick: "อะคริลิคใส 15 ซม. หนา 5 มม. · สกรีน 1 ด้าน",
  },
};

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

const HERO = { x: 84, y: 158, w: 732, h: 424 };   // ภาพซูมฐาน — ตัวเอกของการ์ด
const INSET_W = 172;                              // ภาพเล็ก "ทั้งชิ้น" มุมขวาบนของภาพใหญ่

/** ครอปจากต้นฉบับแล้วย่อให้เต็มกรอบที่กำหนด (ครอปมาได้สัดส่วนตรงกรอบอยู่แล้ว) */
async function fitJpeg(spec, w, h) {
  const buf = await sharp(srcPath(spec.src)).extract(spec.crop).resize(w, h, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** การ์ด 1 ใบ = ชื่อทรงฐาน + ภาพซูมฐาน (+ ภาพเล็กทั้งชิ้น) + สเปคฐาน + แถบเรทเพิ่มขนาด */
async function cardFor(shape) {
  const s = SHAPES[shape];
  const hero = await fitJpeg(s.hero, HERO.w, HERO.h);
  const insetH = Math.round((s.full.crop.height / s.full.crop.width) * INSET_W);
  const inset = await fitJpeg(s.full, INSET_W, insetH);
  const ix = HERO.x + HERO.w - INSET_W - 18;
  const iy = HERO.y + 18;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">ฐานไฟ${shape}</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ฐานไม้ + ไฟ LED ในตัว เสียบสาย USB</text>

  <clipPath id="hero"><rect x="${HERO.x}" y="${HERO.y}" width="${HERO.w}" height="${HERO.h}" rx="22"/></clipPath>
  <image href="${hero}" x="${HERO.x}" y="${HERO.y}" width="${HERO.w}" height="${HERO.h}" clip-path="url(#hero)"/>
  <rect x="${HERO.x}" y="${HERO.y}" width="${HERO.w}" height="${HERO.h}" rx="22" fill="none" stroke="#e2e8f0" stroke-width="2"/>

  <!-- ภาพเล็ก: ประกอบเสร็จแล้วหน้าตาแบบนี้ -->
  <clipPath id="inset"><rect x="${ix}" y="${iy}" width="${INSET_W}" height="${insetH}" rx="14"/></clipPath>
  <rect x="${ix - 5}" y="${iy - 5}" width="${INSET_W + 10}" height="${insetH + 10}" rx="18" fill="#ffffff" opacity="0.95"/>
  <image href="${inset}" x="${ix}" y="${iy}" width="${INSET_W}" height="${insetH}" clip-path="url(#inset)"/>

  <!-- ป้ายบอกว่าภาพใหญ่คือภาพซูม ไม่ใช่ขนาดจริงของชิ้นงาน -->
  <rect x="${HERO.x + 18}" y="${HERO.y + HERO.h - 62}" width="176" height="44" rx="22" fill="#0f172a" opacity="0.62"/>
  <text x="${HERO.x + 106}" y="${HERO.y + HERO.h - 32}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="#ffffff">🔍 ซูมที่ฐาน</text>

  <rect x="112" y="612" width="${W - 224}" height="62" rx="18" fill="#f1f5f9"/>
  <text x="${W / 2}" y="652" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">${s.baseText}</text>

  <rect x="86" y="696" width="${W - 172}" height="68" rx="34" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="740" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">เพิ่มขนาดจาก ${FREE} ซม. — ซม.ละ ฿${s.rate}</text>

  <text x="${W / 2}" y="806" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${s.thick}</text>
  <text x="${W / 2}" y="844" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ลายบนอะคริลิคในภาพเป็นตัวอย่างงานลูกค้า</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

const FILES = [];
for (const shape of [SQUARE, ROUND]) {
  const s = SHAPES[shape];
  FILES.push({ shape, tag: s.key, file: `base-${s.key}-${VER}.jpg`, buf: await cardFor(shape) });
}
for (const f of FILES) {
  writeFileSync(`${OUT}/${f.file}`, f.buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(f.buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, f.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[f.tag] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", url[f.tag]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = JSON.stringify(data.pricing);

const group = (data.options ?? []).find((o) => o.label === BASE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${BASE_GROUP}"`); process.exit(1); }
const names = (group.choices ?? []).map((c) => c.name);
if (!names.includes(SQUARE) || !names.includes(ROUND)) { console.error("ชื่อตัวเลือกในกลุ่มฐานไฟไม่ตรงที่คาด:", names.join(" · ")); process.exit(1); }

group.display = "cards";
group.note = `ราคาเริ่มต้นและเรท "เพิ่มขนาด" ต่างกันตามทรงฐาน — ${SQUARE} ซม.ละ ฿${SHAPES[SQUARE].rate} · ${ROUND} ซม.ละ ฿${SHAPES[ROUND].rate}`;
for (const c of group.choices) {
  const s = SHAPES[c.name];
  if (!s) continue;                     // มีตัวเลือกอื่นโผล่มาในอนาคตก็ไม่ไปยุ่ง
  c.desc = `${s.baseText} · ${s.thick} · เพิ่มขนาดจาก ${FREE} ซม. คิด ซม.ละ ฿${s.rate}`;
  c.imageSrc = url[s.key];
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ ──────────────────────────────────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === BASE_GROUP);
const sizeGroups = back.data.options.filter((o) => o.label === "ขนาด");
const fails = [
  [!!g && g.display === "cards", "กลุ่มฐานไฟไม่ได้เป็นการ์ด"],
  [g?.choices?.length === 2 && g.choices.every((c) => [SQUARE, ROUND].includes(c.name)), "ชื่อตัวเลือกฐานไฟเปลี่ยน = ตารางราคาพัง"],
  [g?.choices?.every((c) => !!c.imageSrc && c.imageSrc.includes(`-${VER}.jpg`)), "ภาพตัวเลือกฐานไฟไม่ครบ"],
  [g?.choices?.every((c) => (c.desc ?? "").includes(`฿${SHAPES[c.name].rate}`)), "คำอธิบายไม่ได้บอกเรทเพิ่มขนาด"],
  [JSON.stringify(back.data.pricing) === before, "ตารางราคาถูกแตะ"],
  [sizeGroups.length === 2 && sizeGroups.every((o) => o.choices?.some((c) => c.sizeFee)), "กลุ่มขนาด/ค่าบริการตามขนาดหาย"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string (ภาพจะไม่ล้างแคช)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${BASE_GROUP}" เป็นการ์ด + ภาพงานจริง 2 ใบ + บอกเรทเพิ่มขนาด (${SQUARE} ฿${SHAPES[SQUARE].rate} · ${ROUND} ฿${SHAPES[ROUND].rate}) · savedAt =`, back.data.savedAt);

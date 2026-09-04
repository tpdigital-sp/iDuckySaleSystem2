#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกขาว · cardholder-white) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/cardholder-white-size-option.mjs           (วาดภาพลง .cache/cardholder-white/upload ดูก่อน)
 *   node scripts/cardholder-white-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: มีกลุ่มเดียวคือ "แบบ" (แกนตารางราคา) ไม่มีกลุ่มขนาดเลย
 *   ขนาดถูกซ่อนอยู่ในบล็อก body ("ขนาด 69x110 mm") ลูกค้าต้องเลื่อนอ่านเอง
 *
 * ที่มาของตัวเลข:
 *   • body ของสินค้าเอง + ใบสเปค `30_อุปกรณ์มือถือ/Card-Holder/CARD Ho.png` → ตัวการ์ด 69 × 110 มม.
 *   • รูปสินค้าจริง (UHOO ID CARD) พิมพ์กำกับ "规格 54×85mm" = ช่องใส่บัตรขนาดบัตรมาตรฐาน · ใส่ได้ 2 ใบ (ตาม terms)
 *   • ใบสเปคสายคล้อง `Lanyard-สายคล้อง/P-nLanyard-01.jpg` → "สายคล้องคอ แบบ Card Holder" กว้าง 1.5 ซม.
 *   → สินค้ามี "ขนาดเดียว" ทุกแบบ (ไม่รับสาย / สกรีนเค่ตัวการ์ด / สกรีนสาย) จึงเป็นการ์ดใบเดียว ไม่บวกราคา
 *
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = ["แบบ"]
 *   ตั้งชื่อกลุ่มว่า "ขนาด" จึงไม่ชนแกนราคา ([[iducky-price-driver-trap]]) และไม่มี extra = ราคาไม่ขยับ
 *
 * ภาพ 900×900 วาดตัวการ์ดตามสัดส่วนจริง (30 px = 1 ซม.) กรอบพิมพ์ลาย + ช่องใสตรงกลาง + คลิปหนีบสาย
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300-600) — ตัวเลขขนาดจึงวางไว้ "ในช่องใสกลางการ์ด" ซึ่งตกอยู่ในกรอบครอปพอดี
 *    ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 260);

const PRODUCT_ID = "cardholder-white";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "6.9 × 11 ซม. (ใส่บัตรได้ 2 ใบ)";
const FILE = `size-69x110mm-${VER}.jpg`;

// ── ขนาดจริงของชิ้นงาน (ซม.) ────────────────────────────────────────
const CARD_W = 6.9, CARD_H = 11;          // ตัวการ์ดพลาสติกขาว
const SLOT_W = 5.4, SLOT_H = 8.5;         // ช่องใส่บัตร = บัตรมาตรฐาน
const STRAP_W = 1.5;                       // สายคล้องคอแบบ Card Holder

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const PRINT = "#bae6fd", PRINT_DK = "#7dd3fc";   // ลายที่ลูกค้าสกรีนบนกรอบ (ตัวอย่าง)

const PX = 30;                 // 30 px = 1 ซม.
const CX = 450;                // กลางการ์ด = กลางภาพ (ให้ตกอยู่ในกรอบครอป 300-600 ทั้งใบ)
const TOP = 252;               // ขอบบนตัวการ์ด
const cw = CARD_W * PX, ch = CARD_H * PX;
const L = CX - cw / 2, R = CX + cw / 2, B = TOP + ch;

// ระยะกรอบพิมพ์รอบช่องใส (วัดจากรูปสินค้าจริง): ข้างละ 1 ซม. · บน 1.9 ซม. · ล่าง 0.9 ซม.
const winL = L + 1.0 * PX, winR = R - 1.0 * PX;
const winT = TOP + 1.9 * PX, winB = B - 0.9 * PX;

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 32 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

const pill = (cx, y, text) => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

/** ก้อนเมฆบนกรอบพิมพ์ — ใช้แทน "ลายที่ลูกค้าสกรีน" ให้เห็นว่ากรอบพิมพ์ได้เต็มขอบ */
const cloud = (cx, cy, s) => `
  <g fill="#ffffff" opacity="0.85">
    <circle cx="${cx - 7 * s}" cy="${cy}" r="${5 * s}"/>
    <circle cx="${cx}" cy="${cy - 3 * s}" r="${7 * s}"/>
    <circle cx="${cx + 8 * s}" cy="${cy}" r="${5.5 * s}"/>
    <rect x="${cx - 12 * s}" y="${cy}" width="${24 * s}" height="${5 * s}" rx="${2.5 * s}"/>
  </g>`;

function sizeArt() {
  const mw = 46, mh = mw / MASCOT.ratio;   // มาสคอต = ลายลูกค้าบนแถบบนของกรอบ
  const strapW = STRAP_W * PX;             // สายคล้อง 1.5 ซม.
  const clipY = TOP - 34;                  // คลิปหนีบพลาสติกขาวเหนือการ์ด

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดการ์ดใส่บัตร — ขนาดเดียว</text>
  <text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">กว้าง 6.9 × สูง 11 ซม. (69 × 110 มม.) · ใช้ขนาดนี้ทุกแบบ</text>
  <text x="${W / 2}" y="158" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ภาพวาดตามสัดส่วนจริง 1 ซม. = 30 px</text>

  <!-- สายคล้องคอ (กว้าง 1.5 ซม.) โผล่ลงมาเข้าคลิป -->
  <rect x="${CX - strapW / 2}" y="184" width="${strapW}" height="${clipY - 178}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${CX + strapW / 2 + 16}" y="${210}" font-family="${TH}" font-size="20" fill="${SUB}">สายคล้องคอ กว้าง ${STRAP_W} ซม.</text>

  <!-- คลิปหนีบพลาสติกขาว -->
  <rect x="${CX - 21}" y="${clipY}" width="42" height="46" rx="9" fill="#ffffff" stroke="#94a3b8" stroke-width="2.5"/>
  <rect x="${CX - 11}" y="${clipY + 12}" width="22" height="8" rx="4" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>

  <!-- เงาใต้ตัวการ์ด -->
  <rect x="${L + 6}" y="${TOP + 8}" width="${cw}" height="${ch}" rx="20" fill="#0f172a" opacity="0.08"/>

  <!-- ตัวการ์ดพลาสติกขาว + กรอบที่สกรีนลายเต็มถึงขอบ -->
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="20" fill="${PRINT}" stroke="${INK}" stroke-width="3"/>
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="20" fill="none" stroke="${PRINT_DK}" stroke-width="10" opacity="0.35"/>
  ${cloud(L + 30, TOP + 108, 1)}
  ${cloud(R - 28, TOP + 190, 0.9)}
  ${cloud(L + 26, TOP + 268, 0.85)}
  ${cloud(CX + 4, B - 15, 1)}
  <image href="${MASCOT.uri}" x="${L + 16}" y="${TOP + 8}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>

  <!-- ช่องเสียบคลิปบนแถบบน -->
  <rect x="${CX - 23}" y="${TOP + 16}" width="46" height="13" rx="6.5" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>

  <!-- ช่องใส่บัตร (ส่วนใส) — ตกอยู่กลางกรอบครอปปุ่มตัวเลือกพอดี -->
  <rect x="${winL}" y="${winT}" width="${winR - winL}" height="${winB - winT}" rx="11" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  <text x="${CX}" y="${winT + 52}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ขนาดตัวการ์ด</text>
  <text x="${CX}" y="${winT + 110}" font-family="${TH}" font-size="36" font-weight="700" text-anchor="middle" fill="${INK}">6.9 × 11</text>
  <text x="${CX}" y="${winT + 142}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${SUB}">เซนติเมตร</text>
  <line x1="${winL + 20}" y1="${winT + 168}" x2="${winR - 20}" y2="${winT + 168}" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${CX}" y="${winT + 196}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">= 69 × 110 มม.</text>
  <text x="${CX}" y="${winT + 226}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${OK}">ใส่บัตรได้ 2 ใบ</text>

  <!-- ลูกศรวัดขนาดตัวการ์ด -->
  ${dim(L - 46, TOP, L - 46, B, `${CARD_H} ซม.`)}
  ${dim(L, B + 30, R, B + 30, `${CARD_W} ซม.`, "below")}

  ${pill(W / 2, 712, `ช่องใส่บัตร ${SLOT_W} × ${SLOT_H} ซม. (ขนาดบัตรมาตรฐาน) ใส่ได้ 2 ใบ`)}

  <text x="${W / 2}" y="${H - 104}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">สกรีนลายเต็มถึงขอบด้านข้าง ส่วนขอบจะฟุ้งขาวหน่อย ๆ · ตรงกลางเป็นช่องใส</text>
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">สายคล้องคอแบบ Card Holder กว้าง ${STRAP_W} ซม. — เลือกสกรีนสายได้ในกลุ่ม “แบบ”</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">การ์ดใส่บัตรมีขนาดเดียว ไม่มีตัวเลือกขนาดอื่น · ลายบนภาพเป็นตัวอย่างเท่านั้น</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
// ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${SIZE_CHOICE}`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: `การ์ดใส่บัตรมีขนาดเดียว — กว้าง ${CARD_W} × สูง ${CARD_H} ซม. (69 × 110 มม.) ทุกแบบ ไม่บวกราคาเพิ่ม`,
  choices: [{
    name: SIZE_CHOICE,
    popular: true,
    imageSrc: sizeUrl,
    desc: `ตัวการ์ด ${CARD_W} × ${CARD_H} ซม. · ช่องใส่บัตร ${SLOT_W} × ${SLOT_H} ซม. (ขนาดบัตรมาตรฐาน) ใส่ได้ 2 ใบ · สายคล้องคอกว้าง ${STRAP_W} ซม.`,
  }],
};

// รันซ้ำได้: มีอยู่แล้ว = เขียนทับตัวเดิม · ยังไม่มี = แทรกไว้หน้าสุด
const options = data.options ?? [];
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.unshift(sizeGroup);
data.options = options;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);
const c = g?.choices?.[0];
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 1, "จำนวนการ์ดไม่ใช่ 1"],
  [c?.name === SIZE_CHOICE, "ชื่อการ์ดไม่ตรง"],
  [c?.imageSrc === sizeUrl, "ภาพการ์ดไม่ตรง"],
  [!c?.extra, "การ์ดดันมีราคาเพิ่ม"],
  [!!c?.desc, "การ์ดขาดคำอธิบาย"],
  // กลุ่มเดิมต้องอยู่ครบ ([[iducky-option-group-loss-guard]])
  [got.some((o) => o.label === "แบบ"), 'กลุ่ม "แบบ" หาย'],
  [(got.find((o) => o.label === "แบบ")?.choices ?? []).length === 3, 'ตัวเลือกในกลุ่ม "แบบ" ไม่ครบ 3'],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา
  [!(back.data.pricing?.driverLabels ?? []).includes(SIZE_GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(SIZE_GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 35 && back.data.priceMax === 130, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด 1 ใบ + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

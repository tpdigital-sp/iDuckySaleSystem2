#!/usr/bin/env node
/**
 * สแตนดี้ฐานดนตรี (standymusic-1) — ภาพ "อะคริลิคใส" ในกลุ่ม "สีอะคริลิค"
 *
 *   node scripts/standymusic-clear-acrylic-art.mjs           (วาดดูก่อน)
 *   node scripts/standymusic-clear-acrylic-art.mjs --write   (+ อัปโหลด + ติดภาพ + อ่านกลับเทียบ)
 *
 * ผู้ใช้ทัก 4 ก.ย. 69: "สีอะคริลิค: อะคริลิคใส , อะคริลิคขาวขุ่น C-02 ควรแยกออกจากกัน"
 * ต้นเหตุ: ในกลุ่มนี้ 46 ตัวเลือก **"อะคริลิคใส" เป็นตัวเดียวที่ไม่มีรูป** (อีก 45 ตัวมีครบ)
 * กลุ่มเป็น dropdown ซึ่งโชว์รูปเฉพาะ "ตัวที่เลือกอยู่" (44px ข้างเมนู) → เลือกใสแล้วช่องรูปหายไปเฉย ๆ
 * เทียบกับ C-02 ที่มีรูป ลูกค้าเลยแยกสองตัวนี้ไม่ออก
 *
 * ทำไมไม่ยืมรูปที่มีอยู่: ทั้งร้านไม่มีรูป "อะคริลิคใส" กลาง — ต่างคนต่างทำ 23 ไฟล์
 * ตัวที่ใช้ซ้ำมากสุด `standee-keyring/clear-plain-v6.jpg` (8 สินค้า) เป็น **การ์ดทรงพวงกุญแจ (มีห่วง)**
 * ซึ่งผู้ใช้เคยสั่งไว้แล้วว่า **ห้ามยืมรูปพวงกุญแจ** มาใช้กับสินค้าที่ไม่ใช่พวงกุญแจ ([[iducky-acrylic-clip]])
 * → วาดใหม่เป็น "ทรงสแตนดี้บนฐานดนตรี" โดยคง **เลย์เอาต์/ถ้อยคำชุดเดียวกับการ์ดใสของร้าน** ไว้
 * (หัวข้อ / บรรทัดสเปค / ภาพกลาง / ท้าย 2 บรรทัด) จะได้เป็นภาษาเดียวกันทั้งร้าน
 *
 * เนื้อ "ใส" สื่อด้วยการวางจุดสีไว้ใต้แผ่นแล้วให้แผ่นทับ — เห็นจุดทะลุแบบจางลงนิดเดียว
 * (ทรงเดียวกับที่ใช้ในการ์ด "อะคริลิคธรรมดา" scripts/standymusic-acrylic-type-art.mjs)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 * แตะแค่ choice.imageSrc ของ "อะคริลิคใส" ตัวเดียว · ไม่แตะราคา/กติกา/ตัวเลือกอื่น
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "standymusic-1";
const VER = "v1";
const GROUP = "สีอะคริลิค";
const CHOICE = "อะคริลิคใส";
const PAIR = "อะคริลิคขาวขุ่น C-02";   // อีกตัวในชุด "ธรรมดา" ที่ต้องแยกออกจากกันให้ได้
const FILE = `color-clear-standee-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/standymusic/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 420);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b";
const CM = 17;                       // 1 ซม. = 17 px (สแตนดี้ 15 ซม. = 255 px พอดีกรอบกลาง)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ฐานกล่องดนตรีไม้ทรงกลม ⌀ 7.5 ซม. (ย่อจาก scripts/standymusic-size-option-art.mjs) */
const musicBase = (cx, yBottom) => {
  const d = 7.5 * CM, bodyH = 3.2 * CM, ry = d * 0.155, yTop = yBottom - bodyH, x = cx - d / 2;
  const discW = d * 1.06, discH = ry * 0.66;
  return `
  <ellipse cx="${cx}" cy="${yBottom + discH * 0.9}" rx="${d * 0.62}" ry="${ry * 0.55}" fill="#0f172a" opacity="0.10"/>
  <ellipse cx="${cx}" cy="${yBottom + 2}" rx="${discW / 2}" ry="${discH}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5"/>
  <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#wood)"/>
  <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#woodShade)"/>
  <ellipse cx="${cx}" cy="${yTop}" rx="${d / 2}" ry="${ry}" fill="#e3c49b" stroke="#c8a274" stroke-width="1.5"/>
  <rect x="${cx - d * 0.26}" y="${yTop - 2.5}" width="${d * 0.52}" height="5" rx="2.5" fill="#8b6a47" opacity="0.75"/>`;
};

/** แผ่นสแตนดี้ "ใส" — ทึบแสงต่ำ ให้จุดสีข้างหลังทะลุขึ้นมาเห็นได้ */
const clearStandee = (cx, yBottom) => {
  const h = 15 * CM, w = 10.6 * CM, x = cx - w / 2, y = yBottom - h;
  const mh = h * 0.5, mw = mh * MASCOT.ratio;
  return `
  <g>
    <path d="M ${x} ${y + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L ${x + w} ${yBottom} L ${x} ${yBottom} Z"
      fill="#e6f5fa" fill-opacity="0.55" stroke="#5fbcc0" stroke-width="4"/>
    <path d="M ${x + w * 0.14} ${y + w * 0.6} A ${w / 2} ${w / 2} 0 0 1 ${x + w * 0.44} ${y + w * 0.12} L ${x + w * 0.31} ${yBottom - 10} L ${x + w * 0.11} ${yBottom - 10} Z"
      fill="#ffffff" opacity="0.5"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${yBottom - mh - h * 0.17}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
};

const svg = () => {
  const bx = 60, by = 196, bw = W - 120, bh = 430;   // กรอบภาพกลาง (ทรงเดียวกับการ์ดใสชุดเดิมของร้าน)
  const cx = W / 2, ground = by + bh - 42;
  const dot = (dx, dy, r, fill) => `<circle cx="${cx + dx}" cy="${by + dy}" r="${r}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c79a68"/><stop offset="0.35" stop-color="#e7c79c"/><stop offset="1" stop-color="#b98b5c"/>
    </linearGradient>
    <linearGradient id="woodShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.06"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <clipPath id="box"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${cx}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${esc(CHOICE)}</text>
  <text x="${cx}" y="134" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">ชนิดมาตรฐาน หนาประมาณ 3 มม. · เนื้อใสมองทะลุ</text>

  <g clip-path="url(#box)">
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#f2f8fb"/>
    <!-- จุดสี "ข้างหลัง" ชิ้นงาน — ครึ่งหนึ่งโผล่พ้นแผ่น ครึ่งหนึ่งอยู่หลังแผ่น เทียบกันเห็นว่าทะลุจริง -->
    ${dot(0, 126, 30, "#8fd0ea")}
    ${dot(-90, 200, 34, "#f6a5c0")}
    ${dot(92, 252, 28, "#ffd977")}
    ${dot(-232, 110, 26, "#c9b6f2")}
    ${dot(230, 330, 30, "#9ee0c4")}
    ${clearStandee(cx, ground - 3.2 * CM + 6)}
    ${musicBase(cx, ground)}
  </g>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26" fill="none" stroke="#d7e6ee" stroke-width="3"/>
  <text x="${cx}" y="${by + bh + 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#8fb9c4">จุดสีที่อยู่หลังแผ่นยังมองเห็นได้ (จางลงนิดเดียว) = เนื้อใส</text>

  <text x="${cx}" y="770" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ราคาตามตารางคือชนิดนี้ ไม่บวกเพิ่ม (เท่ากับ${esc(PAIR.replace("อะคริลิค", ""))})</text>
  <text x="${cx}" y="812" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">อยากได้สี / กลิตเตอร์ / โฮโลแกรม เลือก “อะคริลิคพิเศษ” ได้</text>
  <text x="${cx}" y="856" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">ฐานไม้กล่องดนตรีเป็นไม้ทึบเสมอ — “ใส” หมายถึงตัวสแตนดี้</text>
</svg>`;
};

const buf = await sharp(Buffer.from(svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(44, 44).toFile(`${OUT}/thumb-${FILE}`); // dropdown โชว์ 44×44 ข้างเมนู
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

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
const before = JSON.parse(JSON.stringify(data));
writeFileSync(`${OUT}/../before-clear-${VER}.json`, JSON.stringify(before, null, 2));

const groups = (data.options ?? []).filter((o) => o.label === GROUP);
if (groups.length !== 1) { console.error(`เจอกลุ่ม "${GROUP}" ${groups.length} กลุ่ม — หยุดก่อน`); process.exit(1); }
const g = groups[0];
const clear = (g.choices ?? []).find((c) => c.name === CHOICE);
const pair = (g.choices ?? []).find((c) => c.name === PAIR);
if (!clear || !pair) { console.error(`ไม่เจอตัวเลือก "${CHOICE}" หรือ "${PAIR}" ในกลุ่ม`); process.exit(1); }
clear.imageSrc = url;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gb = (back.data.options ?? []).find((o) => o.label === GROUP);
const cb = (gb?.choices ?? []).find((c) => c.name === CHOICE);
const noImg = (gb?.choices ?? []).filter((c) => !c.imageSrc).map((c) => c.name);
const fails = [
  [cb?.imageSrc === url, `ภาพของ "${CHOICE}" ไม่ตรง`],
  [noImg.length === 0, `ยังมีตัวเลือกที่ไม่มีรูป: ${noImg.join(", ")}`],
  [(gb?.choices ?? []).find((c) => c.name === PAIR)?.imageSrc === pair.imageSrc, `ภาพของ "${PAIR}" ถูกแตะ`],
  [new Set((gb?.choices ?? []).map((c) => c.imageSrc)).size === (gb?.choices ?? []).length, "มีตัวเลือกใช้รูปซ้ำกัน (แยกออกจากกันไม่ได้)"],
  [gb?.choices?.length === before.options.find((o) => o.label === GROUP).choices.length, "จำนวนตัวเลือกในกลุ่มเปลี่ยน"],
  [(back.data.options ?? []).map((o) => o.label).join("|") === (before.options ?? []).map((o) => o.label).join("|"), "ลำดับ/รายชื่อกลุ่มเปลี่ยน"],
  [JSON.stringify(back.data.rules) === JSON.stringify(before.rules), "กติกาตัวเลือก (rules) เปลี่ยนไป"],
  [JSON.stringify(back.data.pricing) === JSON.stringify(before.pricing), "ตารางราคาเปลี่ยนไป"],
  [back.data.priceMin === before.priceMin && back.data.priceMax === before.priceMax, "ช่วงราคาเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ "${CHOICE}" มีรูปของตัวเองแล้ว · ทั้งกลุ่ม ${gb.choices.length} ตัวเลือกมีรูปครบ ไม่ซ้ำกันสักคู่`);
console.log("  savedAt =", back.data.savedAt);

#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "งานสกรีน" ของสินค้าสแตนดี้อะคริลิค (Acrylic Standee) — id: standy
 *
 *   node scripts/standy-print-art.mjs [--out=<dir>]     # วาดลง .cache/standy/print
 *
 * ได้ 4 ใบ: opt-print-1side-v6 · opt-print-2side-v6 · opt-print-3layer-v6 · opt-print-4layer-v6
 *
 * ทำไมต้องวาดใหม่: ชุดเดิม (-v5) ใช้ตัวการ์ตูนคนละตัวกับมาสคอตเป็ด iDucky (เป็นตัวคล้ายมะม่วง
 * มีใบไม้บนหัว) ขนาดไม่เท่ากันสักใบ (460×340 / 460×310 / 460×295 / 460×282 ทั้งที่ภาพตัวเลือก
 * ของทั้งเว็บเป็น 700×700) และวางป้ายชี้จนอ่านไม่ออกว่าต่างกันตรงไหน
 *
 * ภาษาภาพยึดตามชุดพวงกุญแจ (scripts/keyring-stopper-art.mjs) — ด้านหน้า/ด้านหลัง สำหรับ 1-2 ด้าน
 * และ ด้านหน้า/ชั้นที่ซ้อนกัน สำหรับ 3-4 เลเยอร์ เพื่อให้ลูกค้าเทียบข้ามสินค้าได้
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ชุดนี้ลงท้าย -v6
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงาน = มาสคอตเป็ด iDucky ของฝ่าย Content (ตัวเดียวกับสินค้าอะคริลิคตัวอื่น)
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");

const ID = "standy";
const GROUP = "งานสกรีน";
/** ตัวเลือกในกลุ่ม → ชื่อไฟล์ภาพของตัวนั้น */
const PICK = {
  "สกรีน 1 ด้าน": "opt-print-1side-v6",
  "สกรีน 2 ด้าน": "opt-print-2side-v6",
  "สกรีน 3 เลเยอร์": "opt-print-3layer-v6",
  "สกรีน 4 เลเยอร์": "opt-print-4layer-v6",
};

const MASCOT = await mascotDataUri("heart", 560);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/standy/print").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  <text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const caption = (cx, y, t) =>
  `<text x="${cx}" y="${y}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${t}</text>`;

/** ลายที่สกรีน — คงสัดส่วนภาพจริง ไม่ให้เป็ดยืด */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

const PW = 196; // กว้างตัวสแตนดี้
const PH = 244; // สูงตัวสแตนดี้
const TOP = 232;

/** ตัวสแตนดี้ 1 ชิ้น = แผ่นอะคริลิค + ฐานเสียบด้านล่าง */
function standee(cx, o = {}) {
  const { art = true, blank = false, offset = 0, opacity = 1 } = o;
  const x = cx - PW / 2 + offset;
  const y = TOP + offset * 0.5;
  return `
    <g opacity="${opacity}">
      <rect x="${x}" y="${y}" width="${PW}" height="${PH}" rx="22" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
      ${art && !blank ? artwork(x + PW / 2, y + PH * 0.46, Math.min(PW * 0.78, PH * 0.72)) : ""}
      ${
        blank
          ? `<text x="${x + PW / 2}" y="${y + PH * 0.52}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${LINE}">ใสไม่มีลาย</text>`
          : ""
      }
    </g>`;
}

/** ฐานเสียบ (มองจากด้านข้าง) — บอกว่านี่คือสแตนดี้ ไม่ใช่พวงกุญแจ */
const base = (cx, y) => `
  <rect x="${cx - PW * 0.46}" y="${y}" width="${PW * 0.92}" height="26" rx="13" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <line x1="${cx - 26}" y1="${y + 13}" x2="${cx + 26}" y2="${y + 13}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`;

/** ภาพแบบ "ด้านหน้า / ด้านหลัง" — ใช้กับสกรีน 1-2 ด้าน */
function sidesArt(t, sub, backBlank, foots) {
  const L = 218;
  const R = 482;
  return frame(`
    ${title(t, sub)}
    ${caption(L, 190, "ด้านหน้า")}
    ${caption(R, 190, "ด้านหลัง")}
    ${standee(L)}
    ${base(L, TOP + PH + 14)}
    ${standee(R, { blank: backBlank })}
    ${base(R, TOP + PH + 14)}
    ${foot(foots)}`);
}

/** ภาพแบบ "ด้านหน้า / ชั้นที่ซ้อนกัน" — ใช้กับสกรีน 3-4 เลเยอร์ */
function layersArt(t, sub, layers, foots) {
  const L = 218;
  const R = 482;
  const ghosts = Array.from({ length: layers - 1 }, (_, i) =>
    standee(R, { art: false, offset: (layers - 1 - i) * 13, opacity: 0.42 })
  ).join("");
  return frame(`
    ${title(t, sub)}
    ${caption(L, 190, "ด้านหน้า")}
    ${caption(R, 190, `ชั้นที่ซ้อนกัน (${layers} ชั้น)`)}
    ${standee(L)}
    ${base(L, TOP + PH + 14)}
    ${ghosts}
    ${standee(R)}
    ${base(R, TOP + PH + 14)}
    ${foot(foots)}`);
}

const PRICE_NOTE = "ราคาต่างกันตามแบบที่เลือก — ระบบคิดให้ในตารางแล้ว";

const SHOTS = {
  "opt-print-1side-v6": sidesArt("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", true, [
    "ด้านหลังปล่อยเป็นอะคริลิคใส มองทะลุเห็นลายด้านหน้า",
    PRICE_NOTE,
  ]),
  "opt-print-2side-v6": sidesArt("สกรีน 2 ด้าน", "พิมพ์ลายทั้งด้านหน้าและด้านหลัง", false, [
    "หันด้านไหนก็เห็นลายเต็ม ๆ ไม่ทะลุจากอีกด้าน",
    PRICE_NOTE,
  ]),
  "opt-print-3layer-v6": layersArt("สกรีน 3 เลเยอร์", "พิมพ์ซ้อน 3 ชั้น ให้ลายมีมิติ", 3, [
    "ซ้อนชั้นสี-ขาว ลายทึบขึ้น สีสดกว่าสกรีนธรรมดา",
    PRICE_NOTE,
  ]),
  "opt-print-4layer-v6": layersArt("สกรีน 4 เลเยอร์", "พิมพ์ซ้อน 4 ชั้น ลายคมทั้งสองด้าน", 4, [
    "ชั้นขาวคั่นกลาง มองด้านไหนลายก็คมและทึบเท่ากัน",
    PRICE_NOTE,
  ]),
};

const files = {};
for (const [name, svg] of Object.entries(SHOTS)) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  files[name] = buf;
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);

if (!UPLOAD && !WRITE) {
  console.log("\n(ยังไม่อัปขึ้นคลัง/ไม่แตะฐานข้อมูล — ใส่ --upload --write ถ้าต้องการใช้จริง)");
  process.exit(0);
}

const { readFileSync } = await import("node:fs");
const { createClient } = await import("@supabase/supabase-js");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

if (UPLOAD) {
  for (const [name, buf] of Object.entries(files)) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}.jpg`);
  }
}

if (!WRITE) process.exit(0);

// ── ชี้ตัวเลือกในกลุ่ม "งานสกรีน" มาที่ภาพชุดใหม่ (แตะแค่ imageSrc ไม่ยุ่งราคา/ชื่อ) ──
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);
const opt = d.options?.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
const unmapped = opt.choices.filter((c) => !PICK[c.name]);
if (unmapped.length) throw new Error(`มีตัวเลือกที่ยังไม่รู้ว่าใช้ภาพไหน: ${unmapped.map((c) => c.name).join(" · ")}`);
for (const c of opt.choices) c.imageSrc = IMG(PICK[c.name]);

console.log(`\n📦 ${d.name} (${ID})`);
opt.choices.forEach((c) => console.log(`   ${c.name.padEnd(18)} → ${c.imageSrc.split("/").pop()}`));
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`✅ บันทึกแล้ว: ${ID}`);

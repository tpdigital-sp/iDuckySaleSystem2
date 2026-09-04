#!/usr/bin/env node
/**
 * หมวก Bucket สกรีนเต็มใบ (new-mt2omz1g-3978) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/bucket-hat-size-option.mjs            (วาดภาพลง .cache/bucket-hat/upload ดูก่อน)
 *   node scripts/bucket-hat-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค 40_เสื้อผ้าและงานผ้า/หมวก/P-nหมวก-01.jpg (ช่อง "หมวกสกรีนเต็มใบ"):
 *   วัสดุ ผ้าดิบแคนวาส · ขนาด 22 นิ้ว · สกรีนงานซับลิเมชั่น · สกรีน 2 ด้าน (ใส่ได้ทั้ง 2 ด้าน)
 *   → มีขนาดเดียว 22 นิ้ว (รอบศีรษะ ≈ 56 ซม.) ตรงกับ terms ในหน้าสินค้า
 *
 * เพิ่มกลุ่ม "ขนาด" ไว้เป็นกลุ่มแรก display "cards" — ตัวเลือกเดียว ไม่บวกราคา
 * ⚠️ pricing/priceRates ตัวนี้เป็นคอลัมน์เดียว (cells [""] · driverLabels []) — กลุ่มนี้ต้องไม่เป็นแกนราคา
 *    ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "new-mt2omz1g-3978";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/bucket-hat/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "22 นิ้ว (ฟรีไซส์)";
const SIZE_DESC = "รอบศีรษะ 22 นิ้ว (≈ 56 ซม.) ขนาดเดียว ใส่ได้ทั้งชาย-หญิง · ผ้าแคนวาสหนา 8 ออนซ์ สกรีนเต็มใบทั้งด้านนอกและด้านใน";
const FILE = `size-22inch-${VER}.jpg`;

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ scrunchy-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดหมวกบักเก็ต" — ตัวหมวกมองด้านหน้า (กลางภาพ ตรงกับกรอบที่ปุ่มการ์ดครอป 300–600)
 * ลายสกรีนเป็นเส้นคลื่นเหมือนตัวอย่างงานจริงในใบสเปค · พลิกให้เห็นลายด้านในที่ปีกหมวก
 * ด้านล่างเป็นวงรอบศีรษะ 22 นิ้ว (≈56 ซม.) พร้อมลูกศรวัด ให้เห็นที่มาของตัวเลข
 */
function sizeArt() {
  const cx = W / 2;
  /* ทรงบักเก็ต = ครอบทรงกรวยตัดยอด (บนแคบ ล่างกว้าง) + ปีกสั้นลาดลง — ไม่ใช่ทรงโดม */
  const topY = 276;            // ยอดหมวก
  const botY = 452;            // แนวปากหมวก (ครอบต่อกับปีก)
  const TOPW = 150;            // ครึ่งความกว้างยอด
  const BOTW = 190;            // ครึ่งความกว้างปากหมวก
  const BRIM = 100;             // ปีกยื่นออกข้างละ
  const BRIMY = botY + 66;     // ปลายปีก (ลาดลง)
  const LIP = 16;              // ความหนาขอบปีกที่เห็นด้านใน

  /* เส้นคลื่นลายสกรีน — พาดขวางทั้งใบ (ตัดด้วย clip) เหมือนงานจริงบนใบสเปค */
  const waves = (y0, y1, step, amp, stroke, width, op) => {
    let s = "";
    for (let y = y0; y <= y1; y += step) {
      let d = `M ${cx - BOTW - BRIM - 30} ${y}`;
      for (let x = cx - BOTW - BRIM - 30; x <= cx + BOTW + BRIM + 30; x += 40) d += ` q 20 ${amp} 40 0`;
      s += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" opacity="${op}" stroke-linecap="round"/>`;
    }
    return s;
  };

  /* ครอบหมวก: ยอดโค้งมน ด้านข้างสอบเข้า */
  const crownPath = `M ${cx - BOTW} ${botY}
      L ${cx - TOPW} ${topY + 34}
      Q ${cx - TOPW + 6} ${topY} ${cx - TOPW + 42} ${topY - 2}
      L ${cx + TOPW - 42} ${topY - 2}
      Q ${cx + TOPW - 6} ${topY} ${cx + TOPW} ${topY + 34}
      L ${cx + BOTW} ${botY} Z`;
  /* ปีกหมวก: จากปากหมวกลาดลงออกข้าง ขอบล่างโค้ง */
  const brimPath = `M ${cx - BOTW} ${botY}
      C ${cx - BOTW - BRIM * 0.75} ${botY + 6} ${cx - BOTW - BRIM} ${BRIMY - 26} ${cx - BOTW - BRIM} ${BRIMY - 6}
      C ${cx - BOTW * 0.55} ${BRIMY + 30} ${cx + BOTW * 0.55} ${BRIMY + 30} ${cx + BOTW + BRIM} ${BRIMY - 6}
      C ${cx + BOTW + BRIM} ${BRIMY - 26} ${cx + BOTW + BRIM * 0.75} ${botY + 6} ${cx + BOTW} ${botY} Z`;
  /* ขอบปีกด้านใน — แถบใต้ขอบปีกที่มองเห็นเพราะปีกลาดลง (โชว์ว่าสกรีนด้านในด้วย) */
  const lipPath = `M ${cx - BOTW - BRIM} ${BRIMY - 6}
      C ${cx - BOTW * 0.55} ${BRIMY + 30} ${cx + BOTW * 0.55} ${BRIMY + 30} ${cx + BOTW + BRIM} ${BRIMY - 6}
      C ${cx + BOTW + BRIM} ${BRIMY - 6 + LIP} ${cx + BOTW + BRIM} ${BRIMY - 4 + LIP} ${cx + BOTW + BRIM - 4} ${BRIMY + LIP}
      C ${cx + BOTW * 0.55} ${BRIMY + 30 + LIP} ${cx - BOTW * 0.55} ${BRIMY + 30 + LIP} ${cx - BOTW - BRIM + 4} ${BRIMY + LIP}
      C ${cx - BOTW - BRIM} ${BRIMY - 4 + LIP} ${cx - BOTW - BRIM} ${BRIMY - 6 + LIP} ${cx - BOTW - BRIM} ${BRIMY - 6} Z`;

  /* ย่อทั้งใบลงเหลือ 70% แล้ววางกลางภาพที่ (450, 415) — กรอบครอปของปุ่มการ์ดจะเห็นทรงหมวกครบ */
  const S = 0.70;
  const HCX = 450;
  const HCY = 415;
  const T = (x, y) => ({ x: +(HCX + (x - 450) * S).toFixed(1), y: +(HCY + (y - 405) * S).toFixed(1) });

  const ringY = 655;   // วงรอบศีรษะใต้หมวก

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- ผ้าแคนวาสพิมพ์ซับลิเมชั่น โทนฟ้า-teal ของแบรนด์ -->
    <linearGradient id="hat" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#eafcff"/>
      <stop offset="0.45" stop-color="#a8e6f0"/>
      <stop offset="1" stop-color="#57c2d7"/>
    </linearGradient>
    <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8bdcea"/>
      <stop offset="1" stop-color="#3fb2c8"/>
    </linearGradient>
    <!-- ลายด้านใน (อีกด้านที่พลิกใส่ได้) โทนชมพู ให้เห็นว่าเป็นคนละลายกับด้านนอก -->
    <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f9a8d4"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <!-- ลายทอผ้าแคนวาส -->
    <pattern id="canvas" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 0 4 H 8" stroke="#0f172a" stroke-width="0.8" opacity="0.07"/>
      <path d="M 4 0 V 8" stroke="#0f172a" stroke-width="0.8" opacity="0.05"/>
    </pattern>
    <clipPath id="crown"><path d="${crownPath}"/></clipPath>
    <clipPath id="brimClip"><path d="${brimPath}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 22 นิ้ว (ฟรีไซส์)</text>
  <text x="${cx}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผ้าแคนวาส 8 ออนซ์ · สกรีนเต็มใบ ด้านนอก + ด้านใน — ขนาดเดียว</text>

  <!-- ทั้งใบย่อ+เลื่อนให้อยู่กลางภาพ — ปุ่มการ์ดครอปกลาง 300–600 จะต้องเห็นเป็น "หมวก" ไม่ใช่ผืนผ้าเปล่า
       (ทรงหมวกด้านบนเขียนด้วยพิกัดจริงตามสัดส่วนงาน แล้วค่อยย่อทั้งกลุ่มทีเดียว) -->
  <g transform="translate(${HCX} ${HCY}) scale(${S}) translate(${-450} ${-405})">
  <!-- เงาหมวก -->
  <ellipse cx="${cx}" cy="${BRIMY + 34}" rx="${BOTW + BRIM * 0.9}" ry="20" fill="#0f172a" opacity="0.09"/>

  <!-- ขอบปีกด้านใน (แถบชมพู) วาดก่อน แล้วปีกทับด้านบน -->
  <path d="${lipPath}" fill="url(#inner)" stroke="#be185d" stroke-width="2" opacity="0.95"/>

  <!-- ปีกหมวก -->
  <g clip-path="url(#brimClip)">
    <rect x="${cx - BOTW - BRIM - 10}" y="${botY - 10}" width="${(BOTW + BRIM) * 2 + 20}" height="140" fill="url(#brim)"/>
    <rect x="${cx - BOTW - BRIM - 10}" y="${botY - 10}" width="${(BOTW + BRIM) * 2 + 20}" height="140" fill="url(#canvas)"/>
    ${waves(botY + 2, BRIMY + 26, 18, 12, "#0e7490", 4, 0.45)}
    ${waves(botY + 11, BRIMY + 26, 18, 12, "#ffffff", 3, 0.5)}
    <ellipse cx="${cx + BOTW * 0.9}" cy="${botY + 40}" rx="${BOTW * 0.5}" ry="60" fill="#0f172a" opacity="0.08"/>
  </g>
  <path d="${brimPath}" fill="none" stroke="#2b93a6" stroke-width="3"/>
  <!-- ตะเข็บเย็บรอบปีก (งานจริงเย็บเป็นวงหลายเส้น) -->
  ${[0.42, 0.72].map((t) => `<path d="M ${cx - BOTW - BRIM * (1 - t * 0.22)} ${botY + (BRIMY - botY) * t + 4}
      C ${cx - BOTW * 0.55} ${botY + (BRIMY - botY) * t + 34} ${cx + BOTW * 0.55} ${botY + (BRIMY - botY) * t + 34} ${cx + BOTW + BRIM * (1 - t * 0.22)} ${botY + (BRIMY - botY) * t + 4}"
      fill="none" stroke="#0e7490" stroke-width="1.8" stroke-dasharray="8 6" opacity="0.4"/>`).join("")}

  <!-- ครอบหมวก -->
  <g clip-path="url(#crown)">
    <rect x="${cx - BOTW - 10}" y="${topY - 20}" width="${BOTW * 2 + 20}" height="${botY - topY + 40}" fill="url(#hat)"/>
    <rect x="${cx - BOTW - 10}" y="${topY - 20}" width="${BOTW * 2 + 20}" height="${botY - topY + 40}" fill="url(#canvas)"/>
    ${waves(topY - 4, botY, 20, 14, "#0e7490", 4, 0.5)}
    ${waves(topY + 6, botY, 20, 14, "#ffffff", 3, 0.55)}
    <ellipse cx="${cx + BOTW * 0.95}" cy="${(topY + botY) / 2}" rx="${BOTW * 0.4}" ry="${(botY - topY) * 0.8}" fill="#0f172a" opacity="0.10"/>
    <ellipse cx="${cx - TOPW * 0.55}" cy="${topY + 40}" rx="${TOPW * 0.42}" ry="24" transform="rotate(-16 ${cx - TOPW * 0.55} ${topY + 40})" fill="#ffffff" opacity="0.28"/>
  </g>
  <path d="${crownPath}" fill="none" stroke="#2b93a6" stroke-width="3"/>
  <!-- ตะเข็บรอบครอบ + รูระบายอากาศสองข้าง (ทรงบักเก็ตมาตรฐาน) -->
  ${[0.4, 0.72].map((t) => `<path d="M ${cx - (TOPW + (BOTW - TOPW) * t) + 4} ${topY + (botY - topY) * t} Q ${cx} ${topY + (botY - topY) * t + 12} ${cx + (TOPW + (BOTW - TOPW) * t) - 4} ${topY + (botY - topY) * t}" fill="none" stroke="#0e7490" stroke-width="1.8" stroke-dasharray="8 6" opacity="0.42"/>`).join("")}
  <circle cx="${cx - 92}" cy="${botY - 44}" r="5" fill="#0e7490" opacity="0.5"/>
  <circle cx="${cx + 92}" cy="${botY - 44}" r="5" fill="#0e7490" opacity="0.5"/>
  </g>

  <!-- ป้ายชี้ขอบปีกด้านใน (พิกัดแปลงจากกลุ่มที่ย่อแล้ว) -->
  <line x1="${T(cx - BOTW - BRIM + 30, BRIMY + 12).x}" y1="${T(cx - BOTW - BRIM + 30, BRIMY + 12).y}"
        x2="${T(cx - BOTW - BRIM + 30, BRIMY + 12).x - 44}" y2="${T(cx - BOTW - BRIM + 30, BRIMY + 12).y + 46}" stroke="#be185d" stroke-width="2"/>
  <text x="${T(cx - BOTW - BRIM + 30, BRIMY + 12).x - 44}" y="${T(cx - BOTW - BRIM + 30, BRIMY + 12).y + 70}"
        font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="#be185d">ด้านในสกรีนอีกลาย</text>

  <!-- วงรอบศีรษะ 22 นิ้ว -->
  <ellipse cx="${cx}" cy="${ringY}" rx="196" ry="44" fill="#f1f5f9" stroke="#94a3b8" stroke-width="3" stroke-dasharray="11 8"/>
  <text x="${cx}" y="${ringY - 2}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">รอบศีรษะ 22 นิ้ว</text>
  <text x="${cx}" y="${ringY + 28}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">≈ 56 ซม. · ใส่ได้ทั้งชาย-หญิง</text>

  <text x="${cx}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ซับลิเมชั่นรอบใบ ทั้งด้านนอกและด้านใน — ใส่สลับได้ 2 ด้าน</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
/* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มการ์ด (48×48 object-cover) ยังอ่านออกว่าเป็นหมวกบักเก็ต */
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — หมวกบักเก็ต 22 นิ้ว (+ _thumb ครอปกลาง)`);

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

const { data: row, error: readErr } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
if (!row.name.includes("Bucket")) { console.error("id ไม่ใช่หมวก Bucket:", row.name); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "หมวกบักเก็ตสกรีนเต็มใบมีขนาดเดียว — รอบศีรษะ 22 นิ้ว (≈ 56 ซม.) ตามใบสเปคร้าน",
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = g?.choices?.[0];
if (g?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl || got?.desc !== SIZE_DESC) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", g); process.exit(1);
}
/* กันเผลอ: กลุ่มนี้ต้องไม่กลายเป็นแกนตารางราคา (ราคาเป็นคอลัมน์เดียว คีย์ "") */
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((rr) => rr.pricing)]) {
  if ((p?.driverLabels ?? []).includes(SIZE_GROUP) || !p?.cells?.[""]) { console.error("ตารางราคาเพี้ยน!", p?.driverLabels, Object.keys(p?.cells ?? {})); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) เป็นการ์ด + ภาพ · ตารางราคาไม่ถูกแตะ · savedAt =`, back.data.savedAt);

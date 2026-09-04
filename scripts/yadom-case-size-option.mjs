#!/usr/bin/env node
/**
 * ที่ใส่ยาดม / YADOM CASE PU (otherbag-7) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด 3 ใบ + ภาพวาด
 *
 *   node scripts/yadom-case-size-option.mjs           (วาดภาพลง .cache/otherbag-7/upload ดูก่อน)
 *   node scripts/yadom-case-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: ไม่มีกลุ่มขนาดเลย — ขนาดอยู่ในช่อง terms อย่างเดียว
 *   "ขนาดสูง 10 cm กว้าง 6cm · ช่องใส่ยาดมสูง 6 cm กว้าง 4 cm · หนัง PU ประกบหน้าหลัง หนา 3mm"
 * ใบสเปค `40_เสื้อผ้าและงานผ้า/งานปัก/04_ยาดม/P-Yadom-01.jpg` เขียนตารางราคาไว้ว่า
 *   "Size start (10 cm)" + "เพิ่มขนาดบวกเพิ่ม cm ละ 15 บาท"
 *
 * ⚠️ ตีความเอง 1 จุด รอร้านยืนยัน: ใบสเปคคิดขนาดด้วย "ความสูง" (Size start = 10 cm)
 *    สคริปต์นี้จึงอ่านว่า **เพิ่มเฉพาะความสูง** ทีละ 1 ซม. ความกว้างคง 6 ซม. (10×6 → 11×6 → 12×6)
 *    ถ้าร้านหมายถึงขยายทั้งสองด้าน ต้องแก้ชื่อการ์ด/ภาพใหม่ (ยอดเงินเท่าเดิม ซม. ละ ฿15)
 * ⚠️ ใบสเปคยังมีป้าย "Size.L (5.5×6.5cm)" ที่รูปแบบห้อยคอ — ไม่ชัดว่าเป็นขนาดตัวเรือนหรือขนาดลายปัก
 *    จึงยังไม่ทำเป็นการ์ด รอร้านยืนยันก่อน
 *
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = ["เทคนิค"] (งานปัก/งานสกรีน)
 *   ตั้งชื่อกลุ่มว่า "ขนาด" จึงไม่ชนแกนราคา · ค่า extra ของการ์ดบวกผ่าน groupAddOf ตามปกติ
 *   (บวกต่อชิ้น ทุกช่วงจำนวน) ดู [[iducky-price-driver-trap]]
 *
 * ภาพ 900×900 สามใบวาดด้วย "สเกลเดียวกัน" (32 px = 1 ซม.) ขอบบนชิ้นงานตรงกันทุกใบ ใบสูงกว่าจึงยาวลงล่างจริง
 *   + มี **หลอดยาดมขนาดคงที่** (1.4 × 7 ซม.) ทุกใบไว้เทียบสัดส่วน
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300-600) — ป้ายขนาดตัวใหญ่จึงวางคาบกลางภาพไว้ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = ตัดทิ้งแล้ววางใหม่หน้าสุด ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "otherbag-7";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const RATE = 15;      // บาทต่อ 1 ซม. ที่เพิ่ม (ต่อชิ้น) — ตามใบสเปค
const BASE_H = 10;    // ความสูงมาตรฐาน (ซม.)
const WIDE = 6;       // ความกว้าง (ซม.) คงที่ทุกการ์ด

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", AMBER = "#b45309";
/**
 * วางแบบ 2 คอลัมน์: ซ้าย = ตัวสินค้า · ขวา = ตัวเลขขนาดใหญ่
 * ทั้งคู่ตกอยู่ในกรอบครอป 300-600 ทั้งแนวตั้ง-แนวนอน ([[iducky-option-thumb-crop]])
 * จงใจไม่เอาป้ายขนาดไปทับตัวสินค้า — ชิ้นงานทรงสูงแคบ ทับแล้วช่องใส่ยาดมหายไปทั้งช่อง
 */
const PX_PER_CM = 27;  // สเกลเดียวกันทั้ง 3 ใบ — ใบสูงกว่าต้องดูสูงจริง
const TOP_Y = 250;     // ขอบบนชิ้นหนัง ตรงกันทุกใบ (ใบสูงกว่ายาวลงล่าง)
const CASE_CX = 372;   // กลางชิ้นงาน (คอลัมน์ซ้าย)
const NUM_CX = 540;    // กลางตัวเลขขนาด (คอลัมน์ขวา) — ตัวเลขต้องไม่ล้นขอบครอปที่ x=600

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14.5 + 56;
  const c = tone === "warn" ? AMBER : tone === "mute" ? SUB : OK;
  const bg = tone === "warn" ? "#fffbeb" : tone === "mute" ? "#f8fafc" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

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

// ── ตัวสินค้า: ที่ใส่ยาดมหนัง PU ไดคัททรงอุ้งเท้าแมว ปักลายรอบขอบ ────────
// วาดในสเปซหน่วย "มิลลิเมตร" (กว้าง 60 = 6 ซม.) แล้ว scale ด้วย PX_PER_CM/10
const LEATHER = "#f3e08a", LEATHER_DK = "#e6cf6d", EDGE = "#41527d";  // หนังเหลือง + ปักขอบน้ำเงิน
const PAD = "#f7bcd0", PAD_DK = "#eb9cb8";                            // อุ้งเท้าปักชมพู

/**
 * ที่ใส่ยาดม 1 ชิ้น — cx = กลางชิ้น, topY = ขอบบนสุดของหนัง, cm = ความสูงจริง (ซม.)
 * ทรง: หัวอุ้งเท้า (กว้างเต็ม 6 ซม. สูง ~4 ซม.) + ก้าน/ช่องใส่ยาดม (กว้าง 4 ซม.) ยาวลงล่าง
 * เพิ่มความสูง = ก้านยาวขึ้นอย่างเดียว หัวอุ้งเท้าเท่าเดิม (ตามที่ช่างตัดจริง)
 */
const yadomCase = (cx, topY, cm) => {
  const s = PX_PER_CM / 10;            // 1 หน่วย = 1 มม.
  const HEAD = 40;                     // ความสูงหัวอุ้งเท้า (มม.)
  const armH = cm * 10 - HEAD;         // ความยาวก้าน (มม.) — ยืดตามขนาด
  const armTop = HEAD - 14;            // ก้านซ้อนใต้หัวเล็กน้อย ไม่ให้มีรอยต่อ
  const bottom = cm * 10;
  const pocketTop = HEAD + 2;          // ปากช่องอยู่ใต้หัวอุ้งเท้า — ใบสูงกว่า ช่องยาวขึ้นตาม (มาตรฐาน = 5.8 ≈ 6 ซม.)
  const TUBE_W = 14;                   // หลอดยาดมจริง ~1.4 ซม. — โผล่พ้นปากช่อง 1.4 ซม.
  const tubeTop = pocketTop - 14;

  /** รูปทรงชิ้นหนัง (ไว้วาดซ้ำ 2 ชั้น: ชั้นนอกสีปักขอบ / ชั้นในสีหนัง) */
  const body = (grow, fill) => `
    <g fill="${fill}">
      <rect x="${-20 - grow}" y="${armTop}" width="${40 + grow * 2}" height="${armH + 14 + grow}" rx="${6 + grow}"/>
      <ellipse cx="0" cy="${16 + grow * 0.2}" rx="${29 + grow}" ry="${17 + grow}"/>
      <circle cx="${-21.5}" cy="${8}" r="${8.5 + grow}"/>
      <circle cx="${-7.5}" cy="${0}" r="${9 + grow}"/>
      <circle cx="${7.5}" cy="${0}" r="${9 + grow}"/>
      <circle cx="${21.5}" cy="${8}" r="${8.5 + grow}"/>
    </g>`;

  return `
  <g transform="translate(${cx} ${topY}) scale(${s})">
    <!-- เงาใต้ชิ้นงาน -->
    <ellipse cx="3" cy="${bottom + 4}" rx="24" ry="5" fill="#0f172a" opacity="0.12"/>
    <!-- ห่วงคล้อง (พ้นตัวชิ้นหนัง ไม่นับในขนาด) -->
    <circle cx="0" cy="-9" r="7.5" fill="none" stroke="#b8c0cc" stroke-width="3"/>
    <!-- ชิ้นหนังไดคัท: ชั้นปักขอบน้ำเงิน แล้วทับด้วยเนื้อหนัง -->
    ${body(2.6, EDGE)}
    ${body(0, LEATHER)}
    <!-- ไฮไลต์ผิวหนัง PU -->
    <ellipse cx="-12" cy="12" rx="13" ry="9" fill="#fbf0bd" opacity="0.55"/>
    <!-- อุ้งเท้าปักชมพู: ฝ่าเท้า + 4 นิ้ว -->
    <ellipse cx="0" cy="20" rx="12.5" ry="9" fill="${PAD}"/>
    <ellipse cx="0" cy="20" rx="12.5" ry="9" fill="none" stroke="${PAD_DK}" stroke-width="1" opacity="0.7"/>
    ${[[-21.5, 8, 4.6], [-7.5, 0.5, 5], [7.5, 0.5, 5], [21.5, 8, 4.6]]
      .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.85}" fill="${PAD}"/>`).join("")}
    <!-- ตาไก่ร้อยห่วง -->
    <circle cx="0" cy="4.5" r="3.4" fill="#eef2f7" stroke="#9aa5b4" stroke-width="2"/>
    <!-- หลอดยาดม โผล่พ้นปากช่องขึ้นมา (ส่วนที่เหลืออยู่หลังแผ่นหน้า) -->
    <rect x="${-TUBE_W / 2}" y="${tubeTop}" width="${TUBE_W}" height="24" rx="5" fill="#f7fbff" stroke="#c8d6e5" stroke-width="1.2"/>
    <rect x="${-TUBE_W / 2 + 1.6}" y="${tubeTop + 7}" width="${TUBE_W - 3.2}" height="15" rx="2.5" fill="#7cc5e8" opacity="0.7"/>
    <rect x="${-TUBE_W / 2}" y="${tubeTop}" width="${TUBE_W}" height="7" rx="3.5" fill="#e2ecf6"/>
    <!-- แผ่นหน้า = ช่องใส่ยาดม (กว้าง 4 ซม. สูง 6 ซม.) ปักขอบรอบ + ลายวัว -->
    <rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6" fill="${LEATHER_DK}"/>
    <clipPath id="pk${cm}"><rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6"/></clipPath>
    <g clip-path="url(#pk${cm})">
      <path d="M -24 ${pocketTop + 16} c 12 -9 22 0 19 11 c -3 12 -9 14 -6 22 c 3 8 -6 14 -16 11 l -8 -2 Z" fill="${EDGE}" opacity="0.9"/>
      <path d="M 22 ${bottom - 30} c -10 -6 -16 3 -12 11 c 3 7 8 9 6 15 l 8 0 Z" fill="${EDGE}" opacity="0.75"/>
    </g>
    <rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6" fill="none" stroke="${EDGE}" stroke-width="2.6"/>
    <!-- เส้นด้ายเย็บรอบขอบแผ่นหน้า -->
    <rect x="-16.5" y="${pocketTop + 3.5}" width="33" height="${bottom - pocketTop - 7}" rx="4" fill="none"
      stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>
  </g>`;
};

// ── การ์ด 1 ใบต่อ 1 ขนาด ────────────────────────────────────────────
function sizeArt(cm, extra) {
  const h = cm * PX_PER_CM;
  const wpx = WIDE * PX_PER_CM;
  const top = TOP_Y, bottom = TOP_Y + h;
  const left = CASE_CX - wpx / 2, right = CASE_CX + wpx / 2;
  const baseBottom = TOP_Y + BASE_H * PX_PER_CM;
  return frame(`
    ${title(extra ? `สูงขึ้นเป็น ${cm} ซม.` : `ขนาดมาตรฐาน สูง ${BASE_H} × กว้าง ${WIDE} ซม.`,
      extra ? `สูงกว่ามาตรฐาน ${cm - BASE_H} ซม. — เพิ่มชิ้นละ ฿${extra}` : "หนัง PU ประกบหน้า-หลัง หนา 3 มม. — รวมในราคาแล้ว")}
    <!-- กรอบขนาดจริงของชิ้นหนัง -->
    <rect x="${left}" y="${top}" width="${wpx}" height="${h}" rx="10" fill="none" stroke="${OK}" stroke-width="3" stroke-dasharray="12 9" opacity="0.5"/>
    ${extra ? `<!-- เส้นบอกความสูงมาตรฐาน 10 ซม. ไว้เทียบว่ายาวขึ้นเท่าไร -->
    <line x1="${left - 14}" y1="${baseBottom}" x2="${right + 14}" y2="${baseBottom}" stroke="${AMBER}" stroke-width="2.5" stroke-dasharray="8 7" opacity="0.9"/>
` : ""}
    ${yadomCase(CASE_CX, top, cm)}
    ${dim(left - 52, top, left - 52, bottom, `${cm} ซม.`)}
    ${dim(left, bottom + 34, right, bottom + 34, `${WIDE} ซม.`, "below")}
    <!-- คอลัมน์ขวา: ตัวเลขขนาดตัวใหญ่ ให้อ่านออกตอนย่อเป็นปุ่ม 62×62 -->
    <text x="${NUM_CX}" y="336" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">สูง</text>
    <text x="${NUM_CX}" y="440" font-family="${TH}" font-size="94" font-weight="700" text-anchor="middle" fill="${INK}">${cm}</text>
    <text x="${NUM_CX}" y="488" font-family="${TH}" font-size="32" font-weight="700" text-anchor="middle" fill="${SUB}">× ${WIDE} ซม.</text>
    <text x="${NUM_CX + 10}" y="546" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle"
      fill="${extra ? AMBER : OK}">${extra ? `เพิ่ม ฿${extra} / ชิ้น` : "ขนาดมาตรฐาน"}</text>
    ${extra
      ? pill(W / 2, 706, `เพิ่มความสูง ซม. ละ ฿${RATE} · สูงขึ้น ${cm - BASE_H} ซม. คิดเพิ่มชิ้นละ ฿${extra}`, "warn")
      : pill(W / 2, 706, "ราคานี้รวมในราคาสินค้าแล้ว")}
    ${foot([
      extra
        ? `ภาพทั้ง 3 ใบวาดสเกลเดียวกัน · เส้นประสีส้ม = ความสูงมาตรฐาน ${BASE_H} ซม.`
        : "ภาพทั้ง 3 ใบวาดสเกลเดียวกัน · หัวอุ้งเท้าเท่าเดิม ยาวขึ้นที่ช่องใส่ยาดม",
      extra
        ? `เพิ่มความสูงคิด ซม. ละ ฿${RATE} ต่อชิ้น · สูงกว่านี้ทักแชทให้แอดมินตีราคา`
        : "ช่องใส่ยาดม กว้าง 4 × สูง 6 ซม. · เลือกได้ทั้งแบบพวงกุญแจและที่ห้อยคอ",
      "งานกึ่งแฮนด์เมด ตัด-ประกอบด้วยมือ ขนาดแต่ละชิ้นอาจไม่เท่ากันเป๊ะ",
    ])}`);
}

const CARDS = [0, 1, 2].map((n) => ({
  cm: BASE_H + n,
  extra: RATE * n,
  file: `size-${BASE_H + n}x${WIDE}-${VER}.jpg`,
  name: `${BASE_H + n} × ${WIDE} ซม.`,
}));

for (const c of CARDS) {
  c.buf = await sharp(Buffer.from(sizeArt(c.cm, c.extra))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${c.file}`, c.buf);
  // ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
  await sharp(c.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${c.file}`);
  console.log(`🖼  ${OUT}/${c.file}  ${Math.round(c.buf.length / 1024)} KB — ${c.name}${c.extra ? ` (+฿${c.extra})` : ""}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const c of CARDS) {
  const key = `products/${PRODUCT_ID}/${c.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  c.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", c.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: `ขนาดมาตรฐาน สูง ${BASE_H} × กว้าง ${WIDE} ซม. (ช่องใส่ยาดม กว้าง 4 × สูง 6 ซม.) — เพิ่มความสูงได้ ซม. ละ ฿${RATE} ต่อชิ้น · งานกึ่งแฮนด์เมด ขนาดแต่ละชิ้นอาจไม่เท่ากันเป๊ะ`,
  choices: [
    {
      name: CARDS[0].name, popular: true, imageSrc: CARDS[0].url,
      desc: "ขนาดมาตรฐานของร้าน รวมในราคาแล้ว — หนัง PU ประกบหน้า-หลัง หนา 3 มม. ช่องใส่ยาดม 4 × 6 ซม.",
    },
    {
      name: CARDS[1].name, extra: RATE, imageSrc: CARDS[1].url,
      desc: `สูงขึ้นจากมาตรฐาน 1 ซม. — คิดเพิ่ม ซม. ละ ฿${RATE} เป็นชิ้นละ +฿${RATE}`,
    },
    {
      name: CARDS[2].name, extra: RATE * 2, imageSrc: CARDS[2].url,
      desc: `สูงขึ้นจากมาตรฐาน 2 ซม. — คิดเพิ่ม ซม. ละ ฿${RATE} เป็นชิ้นละ +฿${RATE * 2} · สูงกว่านี้ทักแชทให้แอดมินตีราคา`,
    },
  ],
};

// รันซ้ำได้: ตัดกลุ่มเดิมทิ้งก่อน แล้ววางไว้หน้าสุด
const options = (data.options ?? []).filter((o) => o.label !== GROUP);
data.options = [sizeGroup, ...options];
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 3, "จำนวนการ์ดไม่ครบ 3"],
  ...CARDS.map((c, i) => [
    g?.choices?.[i]?.name === c.name && g?.choices?.[i]?.imageSrc === c.url && (g?.choices?.[i]?.extra ?? 0) === c.extra,
    `การ์ด ${c.name} ไม่ตรง (ชื่อ/ภาพ/ราคาเพิ่ม)`,
  ]),
  [g?.choices?.every((c) => c.desc), "การ์ดขาดคำอธิบาย"],
  // กลุ่มเดิมต้องอยู่ครบ ([[iducky-option-group-loss-guard]])
  ...["รูปแบบ", "เทคนิค", "สีหนัง", "สีไหมไม่เกิน 3 สี"].map((l) => [got.some((o) => o.label === l), `กลุ่ม "${l}" หาย`]),
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 140 && back.data.priceMax === 189, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nราคาต่อชิ้นที่ลูกค้าจะเห็น (ฐาน 189 / 180 / 160 / 150 / 145 / 140 ตามช่วงจำนวน):");
for (const c of CARDS) console.log(`  ${c.name}  →  +฿${c.extra}  = ${[189, 180, 160, 150, 145, 140].map((b) => b + c.extra).join(" / ")}`);
console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 3 ใบ + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

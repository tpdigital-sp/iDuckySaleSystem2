#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกที่ยังไม่มีรูปของ "พวงกุญแจ หลายชิ้นใน 1 พวง" (keyring-multi-charm)
 *
 *   node scripts/multi-charm-option-art.mjs            # วาดลง .cache/keyring-multi-charm/upload (ไม่เขียน DB)
 *   node scripts/multi-charm-option-art.mjs --write    # + อัป storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ
 *
 * 4 ชุด (23 ใบ):
 *   thick-3mm / thick-2mm      ความหนาอะคริลิค — ตัดขวางสเกลเดียวกัน เห็นว่าหนาต่างกันจริง  → การ์ด
 *   pieces-2..10 / pieces-over10   จำนวนชิ้นใน 1 พวง — ห่วงเดียวห้อยกี่ชิ้น                → ปุ่มกลม (คงเดิม)
 *   size-2cm..10cm             ขนาดชิ้น — ทุกใบสเกลเดียวกัน มีบัตร ATM เทียบขนาด          → เมนูเลื่อน (คงเดิม)
 *   hook-yes / hook-no         รับตะขอไหม — ได้ตะขอมาด้วย vs ได้เฉพาะชิ้นเจาะรู           → การ์ด
 *
 * ภาพ "ขนาด" ใบเดียวใช้ซ้ำทั้ง 10 กลุ่ม (ขนาดชิ้นที่ 1..10) — แกลเลอรีตัดซ้ำด้วย src อยู่แล้ว
 * ⚠️ ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก — "ขนาดชิ้นที่ 1 / ประเภท / งานสกรีน" เป็นแกนตารางราคา
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "keyring-multi-charm";
const VER = "v1";
const OUT = ".cache/keyring-multi-charm/upload";
mkdirSync(OUT, { recursive: true });

const HEART = await mascotDataUri("heart", 520);
const PEACE = await mascotDataUri("peace", 520);
const HELLO = await mascotDataUri("hello", 520);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8", CYAN = "#0891b2";
const GLASS = "#e8f6fd", EDGE = "#7dd3fc", METAL = "#94a3b8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="30" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="82" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="126" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) => lines.map((t, i) =>
  `<text x="${W / 2}" y="${H - 44 - (lines.length - 1 - i) * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`).join("");

/** ป้ายตัวเลขใหญ่ — วางกลางภาพให้อ่านออกตั้งแต่รูปย่อบนปุ่ม */
const tag = (cx, cy, text, w) => `
  <rect x="${cx - w / 2}" y="${cy - 36}" width="${w}" height="72" rx="20" fill="#ffffff" opacity="0.97" stroke="${EDGE}" stroke-width="3"/>
  <text x="${cx}" y="${cy + 18}" font-family="${TH}" font-size="46" font-weight="800" text-anchor="middle" fill="${INK}">${text}</text>`;

const ring = (cx, cy, r, sw = 8, color = METAL) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${(sw * 0.3).toFixed(1)}" opacity="0.7"/>`;

/** ตะขอสปริงย่อ — ปลายล่างจบที่ (cx,y2) ให้ห่วงมาคล้อง */
const hookTop = (cx, y1, y2) => `
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="${METAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>`;

/** ลูกศรวัดแนวนอน — ป้ายวางบนเส้นถ้าช่วงกว้างพอ ไม่งั้นยกขึ้นไว้เหนือเส้น (ไม่ให้ทับขีดปลาย) */
const dimH = (x1, x2, y, label) => {
  const lw = label.length * 15 + 26;
  const inline = x2 - x1 >= lw + 28;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${SUB}" stroke-width="3"/>
    ${inline ? `<rect x="${(x1 + x2) / 2 - lw / 2}" y="${y - 20}" width="${lw}" height="40" rx="10" fill="#ffffff" opacity="0.95"/>` : ""}
    <text x="${(x1 + x2) / 2}" y="${inline ? y + 10 : y - 26}" font-family="${TH}" font-size="26" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ชิ้นอะคริลิคมองจากด้านหน้า — แผ่นโค้งมนเนื้อใส เจาะรูบน มีลายสกรีนอยู่กลาง */
function charm(cx, top, h, { art = HEART, w = null, hole = true, ghost = false } = {}) {
  const bw = w ?? h * 0.82;
  const r = Math.min(bw, h) * 0.16;
  const holeR = Math.max(5, Math.min(bw, h) * 0.055);
  const topHole = { x: cx, y: top + h * 0.1 };
  const aw = art.ratio >= 1 ? bw * 0.7 : h * 0.6 * art.ratio;
  const ah = art.ratio >= 1 ? (bw * 0.7) / art.ratio : h * 0.6;
  if (ghost) {
    return { topHole, svg: `
      <rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="${r}" fill="#f1f5f9" stroke="${LINE}" stroke-width="3" stroke-dasharray="10 8"/>` };
  }
  return { topHole, svg: `
    <rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="${r}" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${cx - bw / 2 + 5}" y="${top + 5}" width="${bw - 10}" height="${h - 10}" rx="${r * 0.8}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
    <image href="${art.uri}" x="${cx - aw / 2}" y="${top + h * 0.53 - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    ${hole ? `<circle cx="${topHole.x}" cy="${topHole.y}" r="${holeR}" fill="#ffffff" stroke="${EDGE}" stroke-width="3"/>` : ""}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) ความหนาอะคริลิค — ตัดขวางสเกลเดียวกัน (1 มม. = 46 px) เห็นว่า 3 กับ 2 ต่างกันจริง
// ─────────────────────────────────────────────────────────────────────────────
const THICK = [
  { choice: "3mm", file: "thick-3mm", mm: 3, title: "หนา 3 มม.",
    desc: "แผ่นหนา แข็งแรง ขอบมีมิติจับแล้วรู้สึกแน่น — ความหนามาตรฐานของร้าน เหมาะกับชิ้นหลักและงานที่ใช้ทุกวัน",
    use: "แข็งแรง ขอบหนามีมิติ — ใช้ทุกวันไม่งอ" },
  { choice: "2mm", file: "thick-2mm", mm: 2, title: "หนา 2 มม.",
    desc: "บางลง เบากว่า ห้อยรวมกันหลายชิ้นแล้วไม่ถ่วง — เหมาะกับพวงที่มีชิ้นเยอะหรือชิ้นเล็ก",
    use: "บางเบา ห้อยหลายชิ้นไม่ถ่วง" },
];
/** 1 มม. = 46 px — ขยายมากพอให้ 1 มม. ที่ต่างกันเห็นชัดในรูปย่อ */
const MM = 46;
function thickCard(s) {
  const CX = 300, EX = 660;              // ซ้าย = มองด้านหน้า · ขวา = ตัดขวางขยาย
  const slabTop = 310, slabH = 300;
  const bw = s.mm * MM;
  const ch = charm(CX, 300, 300, { art: HEART });   // รูอยู่ที่ y = 330
  return frame(`
    ${title(s.title, s.use)}
    ${hookTop(CX, 178, ch.topHole.y - 26)}
    ${ch.svg}
    ${ring(CX, ch.topHole.y, 26, 8)}
    <text x="${CX}" y="668" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">มองด้านหน้า</text>

    <!-- ตัดขวาง: แผ่นตั้งขึ้น ความกว้าง = ความหนาจริง คูณสเกลเดียวกันทั้ง 2 ใบ -->
    <rect x="${EX - bw / 2}" y="${slabTop}" width="${bw}" height="${slabH}" rx="10" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${EX - bw / 2 + 4}" y="${slabTop + 4}" width="${bw - 8}" height="${slabH - 8}" rx="7" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
    ${dimH(EX - bw / 2, EX + bw / 2, slabTop - 42, `${s.mm} มม.`)}
    <text x="${EX}" y="668" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ตัดขวาง (ขยาย)</text>

    ${tag(W / 2, 748, `${s.mm} มม.`, 240)}
    ${foot(["ภาพตัดขวางทั้ง 2 แบบสเกลเดียวกัน — วางเทียบกันแล้วเห็นความหนาต่างจริง"])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) จำนวนชิ้นใน 1 พวง — ห่วงหลัก 1 วง ห้อยกี่ชิ้น (2..10) + ใบ "มากกว่า 10"
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ชิ้นงานเรียงใต้ห่วงหลัก — n ≤ 4 แถวเดียว · มากกว่านั้นซอย 2 แถว
 * ขนาดชิ้นคิดจากที่ว่างที่เหลือ (ชิ้นน้อย = ชิ้นใหญ่เต็มกรอบ) เพราะสิ่งที่ต้องอ่านออกคือ "กี่ชิ้น" ไม่ใช่ชิ้นใหญ่แค่ไหน
 * เส้นโยงลากให้ครบก่อนแล้วค่อยวางชิ้นทับ ไม่งั้นเส้นของแถวล่างพาดหน้าชิ้นแถวบน
 */
function fanCharms(n, { lastGhost = false } = {}) {
  const RX = 450, RY = 268, RR = 46;
  const AREA_W = 700, AREA_TOP = 352, AREA_H = 396, GAP = 16, ROW_GAP = 34;
  const rows = n <= 4 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const maxCnt = Math.max(...rows);
  const h = Math.min(
    260,
    (AREA_W - (maxCnt - 1) * GAP) / (maxCnt * 0.82),
    (AREA_H - (rows.length - 1) * ROW_GAP) / rows.length
  );
  const blockH = rows.length * h + (rows.length - 1) * ROW_GAP;
  const top0 = AREA_TOP + (AREA_H - blockH) / 2;
  const step = h * 0.82 + GAP;

  const spots = [];
  rows.forEach((cnt, ri) => {
    const x0 = RX - ((cnt - 1) * step) / 2;
    for (let i = 0; i < cnt; i++) spots.push({ cx: x0 + i * step, top: top0 + ri * (h + ROW_GAP) });
  });

  const holeY = (top) => top + h * 0.1;
  let lines = "", pieces = "";
  spots.forEach((sp, i) => {
    lines += `<line x1="${RX}" y1="${RY + RR * 0.8}" x2="${sp.cx}" y2="${holeY(sp.top)}" stroke="${LINE}" stroke-width="2.5" stroke-dasharray="1 6" stroke-linecap="round"/>`;
    const ghost = lastGhost && i === spots.length - 1;
    const ch = charm(sp.cx, sp.top, h, { art: i % 2 ? PEACE : HEART, ghost });
    pieces += ring(sp.cx, ch.topHole.y - 4, 12, 5) + ch.svg;
    if (ghost) pieces += `<text x="${sp.cx}" y="${sp.top + h * 0.62}" font-family="${TH}" font-size="${h * 0.4}" font-weight="800" text-anchor="middle" fill="${LINE}">…</text>`;
  });
  return hookTop(RX, 158, RY - RR - 2) + ring(RX, RY, RR, 11) + lines + pieces;
}

const PIECES = [];
for (let n = 2; n <= 10; n++) {
  PIECES.push({
    choice: `${n} ชิ้น`, file: `pieces-${n}`, n,
    desc: `พวงเดียวมีชิ้นงาน ${n} ชิ้น — เลือกขนาด/เนื้ออะคริลิค/งานสกรีนแยกกันได้ทุกชิ้น`,
  });
}
function piecesCard(p) {
  return frame(`
    ${title(`${p.n} ชิ้นใน 1 พวง`, "ห่วงหลัก 1 วง ห้อยชิ้นงานตามจำนวนที่เลือก")}
    ${fanCharms(p.n)}
    ${tag(W / 2, 788, `${p.n} ชิ้น`, 230)}
    ${foot(["แต่ละชิ้นตั้งขนาด/เนื้ออะคริลิค/งานสกรีนของตัวเองได้ · ตะขอคิดครั้งเดียวต่อพวง"])}`);
}
/* ใบ "มากกว่า 10" ใช้ผังเดียวกับ 10 ชิ้น แต่ชิ้นสุดท้ายเป็นเงา … = ต่อได้อีก */
function piecesOverCard() {
  return frame(`
    ${title("มากกว่า 10 ชิ้น", "พวงใหญ่พิเศษ — แอดมินคิดราคาให้")}
    ${fanCharms(10, { lastGhost: true })}
    ${tag(W / 2, 788, "10+ ชิ้น", 260)}
    ${foot(["สั่งไว้ก่อนได้เลย ตะกร้าขึ้น \"รอตีราคา\" — แอดมินคุยสเปคแล้วใส่ราคาให้ในออเดอร์"])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) ขนาดชิ้น 2–10 ซม. — ทุกใบสเกลเดียวกัน (1 ซม. = 62 px) + บัตร ATM เทียบขนาด
// ─────────────────────────────────────────────────────────────────────────────
/** 1 ซม. = 58 px → 10 ซม. = 580 px (เหลือที่ให้ลูกศรวัดใต้ชิ้นใหญ่สุด) */
const CM = 58;
const CARD_W = 8.56, CARD_H = 5.4;      // บัตร ATM/บัตรประชาชน — ของเทียบขนาดที่ทุกคนมีในกระเป๋า
const S_CX = 450, S_CY = 462;
const SIZES = [];
for (let cm = 2; cm <= 10; cm++) {
  SIZES.push({
    choice: `${cm}cm`, file: `size-${cm}cm`, cm,
    desc: `ด้านที่ยาวที่สุด ${cm} ซม. (ลายจะพอดีกรอบ ${cm} × ${cm} ซม.)`,
  });
}
function sizeCard(s) {
  const side = s.cm * CM;
  const cw = CARD_W * CM, chh = CARD_H * CM;
  const ch = charm(S_CX, S_CY - side / 2, side, { art: HEART, w: side });
  const dimY = S_CY + side / 2 + 44;
  return frame(`
    ${title(`ขนาด ${s.cm} ซม.`, "ด้านที่ยาวที่สุดของชิ้นงาน")}
    ${ch.svg}
    ${ring(S_CX, ch.topHole.y - 4, Math.max(11, side * 0.055), 5)}
    <!-- บัตร ATM สเกลเดียวกัน วาดทับอยู่ข้างหน้า — ชิ้นใหญ่ ๆ จะได้ยังเห็นกรอบเทียบ -->
    <rect x="${S_CX - cw / 2}" y="${S_CY - chh / 2}" width="${cw}" height="${chh}" rx="20"
      fill="#ffffff" fill-opacity="0.22" stroke="${SUB}" stroke-width="3.5" stroke-dasharray="12 9"/>
    <text x="${S_CX - cw / 2}" y="${S_CY - chh / 2 - 16}" font-family="${TH}" font-size="22" font-weight="700" fill="${SUB}">กรอบเส้นประ = บัตร ATM</text>
    ${dimH(S_CX - side / 2, S_CX + side / 2, dimY, `${s.cm} ซม.`)}
    ${foot(["ภาพชุดขนาดทุกใบสเกลเดียวกัน — เทียบกับกรอบบัตร ATM ได้เลย"])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) รับตะขอไหม — ได้ตะขอ+ห่วงมาด้วย vs ได้เฉพาะชิ้นอะคริลิคเจาะรู
// ─────────────────────────────────────────────────────────────────────────────
function hookYesCard() {
  const ch = charm(450, 372, 300, { art: HEART });
  return frame(`
    ${title("รับตะขอ", "ได้ตะขอ + ห่วง ประกอบมาให้พร้อมใช้")}
    ${hookTop(450, 176, 264)}${ring(450, 292, 34, 9)}
    ${ring(450, ch.topHole.y - 2, 18, 7)}
    ${ch.svg}
    <rect x="252" y="716" width="396" height="66" rx="20" fill="#ecfeff" stroke="${CYAN}" stroke-width="3"/>
    <text x="450" y="760" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">แกะกล่องแล้วห้อยได้เลย</text>
    ${foot(["เลือกแบบตะขอและสีตะขอได้ในกลุ่มถัดไป · ตะขอคิดครั้งเดียวต่อพวง"])}`);
}
function hookNoCard() {
  const ch = charm(450, 372, 300, { art: HEART });
  return frame(`
    ${title("ไม่รับตะขอ", "ได้เฉพาะชิ้นอะคริลิค เจาะรูมาให้แล้ว")}
    <g opacity="0.45">
      ${hookTop(450, 176, 264)}${ring(450, 292, 34, 9)}
    </g>
    <line x1="368" y1="192" x2="546" y2="348" stroke="#ef4444" stroke-width="9" stroke-linecap="round"/>
    ${ch.svg}
    <circle cx="450" cy="${ch.topHole.y}" r="34" fill="none" stroke="${CYAN}" stroke-width="3.5" stroke-dasharray="8 7"/>
    <text x="574" y="${ch.topHole.y + 9}" font-family="${TH}" font-size="24" font-weight="700" fill="${CYAN}">เจาะรูมาให้</text>
    <rect x="230" y="716" width="440" height="66" rx="20" fill="#f8fafc" stroke="${LINE}" stroke-width="3"/>
    <text x="450" y="760" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${SUB}">มีตะขอเองอยู่แล้ว / เอาไปประกอบเอง</text>
    ${foot(["ราคาถูกลงเพราะไม่รวมค่าตะขอ · รูเจาะขนาดมาตรฐาน ใส่ห่วงทั่วไปได้"])}`);
}

// ── วาด ─────────────────────────────────────────────────────────────────────
const FILES = [
  ...THICK.map((s) => ({ file: s.file, svg: thickCard(s), note: s.title })),
  ...PIECES.map((p) => ({ file: p.file, svg: piecesCard(p), note: `${p.n} ชิ้น` })),
  { file: "pieces-over10", svg: piecesOverCard(), note: "มากกว่า 10 ชิ้น" },
  ...SIZES.map((s) => ({ file: s.file, svg: sizeCard(s), note: `${s.cm} ซม.` })),
  { file: "hook-yes", svg: hookYesCard(), note: "รับตะขอ" },
  { file: "hook-no", svg: hookNoCard(), note: "ไม่รับตะขอ" },
];

const built = [];
for (const f of FILES) {
  const name = `${f.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${name}`, buf);
  built.push({ ...f, name, buf });
  console.log(`🖼  ${OUT}/${name}  ${Math.round(buf.length / 1024)} KB — ${f.note}`);
}
/* แผ่นรวมย่อ — ตรวจว่ารูปย่อบนปุ่มยังแยกออกจากกัน (โดยเฉพาะชุดขนาดกับชุดจำนวนชิ้น) */
const TS = 150;
const cols = 8;
await sharp({ create: { width: TS * cols, height: TS * Math.ceil(built.length / cols), channels: 3, background: "#ffffff" } })
  .composite(await Promise.all(built.map(async (b, i) => ({
    input: await sharp(b.buf).resize(TS, TS).toBuffer(),
    left: (i % cols) * TS, top: Math.floor(i / cols) * TS,
  }))))
  .jpeg({ quality: 88 })
  .toFile(`${OUT}/_thumbs-all.jpg`);
console.log(`🔎 ${OUT}/_thumbs-all.jpg — รูปย่อ ${built.length} ใบเรียงเทียบ`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัป storage + เขียน options ─────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.name}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.file] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`⬆️  อัปโหลด ${built.length} ไฟล์ขึ้น storage แล้ว`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const groupOf = (label) => (data.options ?? []).find((o) => o.label === label);

/** เติมภาพ/คำอธิบายให้กลุ่มหนึ่ง — ตัวเลือกใน DB ต้องมีในตารางครบ ไม่งั้นหยุด */
const applied = [];
function apply(label, rows, { display } = {}) {
  const g = groupOf(label);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${label}" — หยุดก่อน`); process.exit(1); }
  if (display) g.display = display;
  for (const c of g.choices ?? []) {
    const r = rows.find((x) => x.choice === c.name);
    if (!r) { console.error(`ตัวเลือกใน DB ไม่มีในสคริปต์: ${label} / ${c.name}`); process.exit(1); }
    c.imageSrc = url[r.file];
    if (r.desc) c.desc = r.desc;
    applied.push({ label, name: c.name, file: r.file, desc: r.desc });
  }
}

apply("ความหนาอะคริลิค", THICK, { display: "cards" });
apply("จำนวนชิ้นใน 1 พวง", [
  ...PIECES,
  { choice: "มากกว่า 10 ชิ้น (แอดมินคิดราคาให้)", file: "pieces-over10",
    desc: "พวงใหญ่กว่า 10 ชิ้น — สั่งไว้ก่อนได้ แอดมินคุยสเปคแล้วใส่ราคาให้ในออเดอร์" },
]);
apply("รับตะขอไหม", [
  { choice: "รับตะขอ", file: "hook-yes", desc: "ได้ตะขอ + ห่วงประกอบมาให้พร้อมใช้ (เลือกแบบ/สีตะขอได้ด้านล่าง)" },
  { choice: "ไม่รับตะขอ", file: "hook-no", desc: "ได้เฉพาะชิ้นอะคริลิคเจาะรู ไม่รวมตะขอ — ราคาถูกลง" },
], { display: "cards" });
/* ภาพชุดขนาดใช้ซ้ำทุกชิ้น (ชิ้นที่ 1..10) — คงเมนูเลื่อนไว้ เพราะการ์ด 9 ใบ × 10 กลุ่มทำหน้ายาวเกิน */
for (let k = 1; k <= 10; k++) if (groupOf(`ขนาดชิ้นที่ ${k}`)) apply(`ขนาดชิ้นที่ ${k}`, SIZES);

data.savedAt = new Date().toISOString();                 // ISO เท่านั้น (ตัวเลข = หน้าแก้ไขติด 409 ตลอด)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — "ไม่ error" ไม่ได้แปลว่าค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const a of applied) {
  const g = back.data.options.find((o) => o.label === a.label);
  const c = g?.choices?.find((x) => x.name === a.name);
  if (c?.imageSrc !== url[a.file] || (a.desc && c?.desc !== a.desc)) {
    console.error("อ่านกลับไม่ตรง:", a.label, a.name, c); process.exit(1);
  }
}
for (const label of ["ความหนาอะคริลิค", "รับตะขอไหม"]) {
  const g = back.data.options.find((o) => o.label === label);
  if (g?.display !== "cards") { console.error(`display ของ "${label}" ไม่ใช่ cards:`, g?.display); process.exit(1); }
}
console.log(`✓ เติมภาพ ${applied.length} ตัวเลือก (${built.length} ไฟล์) อ่านกลับตรงทั้งหมด · savedAt = ${back.data.savedAt}`);

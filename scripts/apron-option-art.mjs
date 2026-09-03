#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "ผ้ากันเปื้อน" (doormat-2, slug ผ้ากันเปื้อน)
 *
 *   node scripts/apron-option-art.mjs            (วาดภาพลง .cache/apron/upload)
 *   node scripts/apron-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * 2 กลุ่มที่ยังไม่มีภาพ (กลุ่ม "สีไหมเย็บชิ้นงาน" ใช้คลัง thread-colors ครบแล้ว):
 *
 *   เนื้อผ้าแคนวาส (8oz/14oz)  → เทียบชั้นผ้าบาง vs หนา ไฮไลต์ตัวที่เลือก — ราคาเท่ากัน
 *   OPTION (multi)             → เพิ่มกระเป๋า ฿20 · เพิ่มสาย+ตะขอเกี่ยว ฿15 · เพิ่มตัวปรับระดับ ฿15
 *                                ทุกตัว qty สูงสุด 2 — วาดผ้ากันเปื้อน + ชี้ตำแหน่งของที่เพิ่ม + ขยายชิ้นส่วน
 *
 * ได้ 5 ไฟล์ (900x900 — ปุ่มตัวเลือกครอปจัตุรัส):
 *   canvas-8oz.jpg   เนื้อผ้า 8 ออนซ์ — บาง เบา ใส่สบาย
 *   canvas-14oz.jpg  เนื้อผ้า 14 ออนซ์ — หนา ทน อยู่ทรง
 *   opt-pocket.jpg   เพิ่มกระเป๋า (มาตรฐานมี 3 ช่องแล้ว)
 *   opt-hook.jpg     เพิ่มสาย+ตะขอเกี่ยว — v2 ตามภาพงานจริง: สายผ้าพิมพ์ลายทาง + ตะขอก้ามปู
 *   opt-adjust.jpg   เพิ่มตัวปรับระดับ — v2 ตามภาพงานจริง: สายคอโพลีน้ำเงิน + ตัวเลื่อนพลาสติกดำ
 *
 * ที่มาของตัวเลข: products.doormat-2 ใน DB (3 ก.ย. 69)
 *   OPTION: เพิ่มกระเป๋า extra 20 qtyMax 2 · เพิ่มสาย+ตะขอเกี่ยว / เพิ่มตัวปรับระดับ extra 15 qtyMax 2
 *   ขนาดชิ้นงาน 76×66 ซม. (data.description)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "doormat-2";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/apron/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** ผ้าแคนวาสดิบโทนครีม — พื้นการ์ดขาวจึงต้องมีขอบเข้มพอให้เห็นทรง */
const CANVAS = "#f3ecdd";
const CANVAS_DK = "#e8dec8";
const EDGE = "#c9bda6";
const METAL = "#8b95a5";
const METAL_LT = "#c3cbd8";
/** สายโพลีน้ำเงินตามงานจริง + ตัวปรับพลาสติกดำ */
const BLUE = "#2b3fc0";
const BLUE_DK = "#1e2c8f";
const BLACK = "#26282c";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ป้ายราคา/สถานะ */
const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 15 + 56;
  const bg = tone === "ok" ? "#ecfeff" : "#f1f5f9";
  const bd = tone === "ok" ? OK : SUB;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${bd}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 31}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${bd}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลาย + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 12 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 7 : y2 + (side === "below" ? 27 : -12);
  const tick = (x, y) => `<line x1="${x - (vertical ? 7 : 0)}" y1="${y - (vertical ? 0 : 7)}" x2="${x + (vertical ? 7 : 0)}" y2="${y + (vertical ? 0 : 7)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 11 : (label.length * 11) / 2)}" y="${ly - 21}"
      width="${label.length * 11}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="21" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** ป้ายชี้จุด — จุดกลม + เส้น + ข้อความ (ให้รู้ว่ากำลังพูดถึงชิ้นไหนบนตัวเสื้อ) */
const callout = (x, y, tx, ty, text, tone = "ok") => {
  const c = tone === "ok" ? OK : SUB;
  const anchor = tx < x ? "end" : "start";
  return `
    <circle cx="${x}" cy="${y}" r="9" fill="${c}"/>
    <circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.5"/>
    <line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${c}" stroke-width="2.5"/>
    <text x="${tx + (anchor === "start" ? 8 : -8)}" y="${ty + 7}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="${anchor}" fill="${c}">${text}</text>`;
};

/** ลายที่พิมพ์ — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, boxW, boxH) => {
  const r = MASCOT.ratio;
  let aw = boxH * r;
  let ah = boxH;
  if (aw > boxW) { aw = boxW; ah = boxW / r; }
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

/**
 * ผ้ากันเปื้อนเต็มตัว (bib apron): อกบนแคบ + สายคอ + สายเอวผูกข้าง + กระเป๋าแถว 3 ช่อง
 * opts: neck = "plain" | "hook" | "adjust" · bibPocket = วาดกระเป๋าเสริมบนอก (เส้นประ)
 * คืน geometry ให้วาง callout ต่อได้
 */
const apron = (cx, top, w, h, o = {}) => {
  const bibW = w * 0.46;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const bx0 = cx - bibW / 2, bx1 = cx + bibW / 2;
  const armY = top + h * 0.30;
  const bottom = top + h;
  const body = `M${bx0} ${top} L${bx1} ${top} L${bx1} ${top + h * 0.08}
    Q ${bx1} ${armY} ${x1} ${armY} L${x1} ${bottom - 26}
    Q ${x1} ${bottom} ${x1 - 26} ${bottom} L${x0 + 26} ${bottom}
    Q ${x0} ${bottom} ${x0} ${bottom - 26} L${x0} ${armY}
    Q ${bx0} ${armY} ${bx0} ${top + h * 0.08} Z`;

  // ── สายคอ 3 แบบ ──
  const strapRise = h * 0.30;
  const strapCurve = (fromX, toX) =>
    `M${fromX} ${top + 4} C ${fromX + bibW * 0.12} ${top - strapRise} ${toX - bibW * 0.12} ${top - strapRise} ${toX} ${top + 4}`;
  const strapFill = o.strapFill || CANVAS;
  const strapEdge = o.strapFill ? BLUE_DK : EDGE;
  const strapStroke = (d, wpx = 13) => `
    <path d="${d}" fill="none" stroke="${strapFill}" stroke-width="${wpx}" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${strapEdge}" stroke-width="${wpx}" stroke-linecap="round" opacity="0.4"/>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.7"/>`;

  let neck = strapStroke(strapCurve(bx0 + 14, bx1 - 14));
  let adjPt = null;
  if (o.neck === "adjust") {
    // ตัวปรับพลาสติกดำเกาะข้างสายแบบงานจริง — หาจุด+มุมบนเส้นโค้งจริง (bezier t=0.25)
    const p0 = [bx0 + 14, top + 4], p3 = [bx1 - 14, top + 4];
    const p1 = [bx0 + 14 + bibW * 0.12, top - strapRise], p2 = [bx1 - 14 - bibW * 0.12, top - strapRise];
    const bez = (t, a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
    const dbez = (t, a, b, c, d) => 3 * (1 - t) ** 2 * (b - a) + 6 * (1 - t) * t * (c - b) + 3 * t ** 2 * (d - c);
    const t = 0.25;
    const ax = bez(t, p0[0], p1[0], p2[0], p3[0]), ay = bez(t, p0[1], p1[1], p2[1], p3[1]);
    const deg = (Math.atan2(dbez(t, p0[1], p1[1], p2[1], p3[1]), dbez(t, p0[0], p1[0], p2[0], p3[0])) * 180) / Math.PI;
    adjPt = [ax, ay];
    neck += `
      <g transform="translate(${ax},${ay}) rotate(${deg.toFixed(1)})">
        <rect x="-14" y="-19" width="28" height="38" rx="5" fill="${BLACK}" stroke="#0f1115" stroke-width="2.5"/>
        <rect x="-4" y="-14" width="8" height="28" rx="3" fill="#4a4e57"/>
      </g>`;
  }

  // ── สายเอวผูกออกสองข้าง ──
  const tieY = armY + 10;
  const ties = `
    ${strapStroke(`M${x0 + 4} ${tieY} Q ${x0 - w * 0.14} ${tieY + h * 0.02} ${x0 - w * 0.19} ${tieY + h * 0.12}`, 11)}
    ${strapStroke(`M${x1 - 4} ${tieY} Q ${x1 + w * 0.14} ${tieY + h * 0.02} ${x1 + w * 0.19} ${tieY + h * 0.12}`, 11)}`;

  // ── กระเป๋าแถวมาตรฐาน 3 ช่อง + ปากกาช่องแรก ──
  const pw = w * 0.66, ph = h * 0.20;
  const px = cx - pw / 2, py = top + h * 0.62;
  const pockets = `
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10" fill="${CANVAS_DK}" stroke="${EDGE}" stroke-width="3"/>
    <rect x="${px + 5}" y="${py + 5}" width="${pw - 10}" height="${ph - 10}" rx="7" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="5 5" opacity="0.8"/>
    <line x1="${px + pw / 3}" y1="${py}" x2="${px + pw / 3}" y2="${py + ph}" stroke="${EDGE}" stroke-width="2.5"/>
    <line x1="${px + (pw * 2) / 3}" y1="${py}" x2="${px + (pw * 2) / 3}" y2="${py + ph}" stroke="${EDGE}" stroke-width="2.5"/>
    <rect x="${px + pw / 6 - 5}" y="${py - 26}" width="10" height="44" rx="5" fill="#3fa1b6"/>
    <path d="M${px + pw / 6 - 5} ${py - 26} l 5 -12 l 5 12 Z" fill="#2c7f92"/>`;

  // ── กระเป๋าเสริมบนอก (ของ OPTION เพิ่มกระเป๋า) ──
  const bpW = bibW * 0.66, bpH = h * 0.125;
  const bpX = cx - bpW / 2, bpY = top + h * 0.075;
  const bibPocket = o.bibPocket
    ? `
    <rect x="${bpX}" y="${bpY}" width="${bpW}" height="${bpH}" rx="8" fill="#ecfeff" stroke="${OK}" stroke-width="3" stroke-dasharray="9 6"/>
    <line x1="${bpX + 4}" y1="${bpY + 8}" x2="${bpX + bpW - 4}" y2="${bpY + 8}" stroke="${OK}" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.6"/>`
    : "";

  return {
    svg: `
    ${neck}
    <path d="${body}" fill="${CANVAS}" stroke="${EDGE}" stroke-width="4"/>
    <path d="${body}" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="5 6" opacity="0.55" transform="translate(0,0)"/>
    ${ties}
    ${o.art !== false ? artwork(cx, top + h * 0.45, w * 0.42, h * 0.24) : ""}
    ${pockets}
    ${bibPocket}`,
    x0, x1, bx0, bx1, top, bottom, armY, cx,
    pocket: { x: px, y: py, w: pw, h: ph },
    bibPocket: { x: bpX, y: bpY, w: bpW, h: bpH },
    adjPt,
  };
};

/** ตะขอก้ามปู (lobster clasp) แบบงานจริง — จุดกำเนิดคือปลายสายที่จีบปลอกโลหะ ชี้ลงล่าง */
const claspSvg = (s) => `
  <g transform="scale(${s})">
    <rect x="-11" y="0" width="22" height="15" rx="5" fill="${METAL_LT}" stroke="${METAL}" stroke-width="3"/>
    <circle cx="0" cy="27" r="11" fill="none" stroke="${METAL}" stroke-width="7"/>
    <rect x="-7" y="38" width="14" height="12" rx="4" fill="${METAL_LT}" stroke="${METAL}" stroke-width="3"/>
    <path d="M0 50 C 28 52 36 84 22 106 C 10 124 -16 122 -26 104 C -34 88 -30 62 -8 52"
      fill="none" stroke="${METAL}" stroke-width="12" stroke-linecap="round"/>
    <path d="M2 52 C 24 56 30 82 20 100" fill="none" stroke="#e8edf4" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
    <line x1="-8" y1="52" x2="-24" y2="74" stroke="${METAL_LT}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="-28" cy="82" r="6" fill="${METAL}"/>
  </g>`;

/** สายผ้าพิมพ์ลายทาง (กรม-เขียว-ฟ้า ตามงานจริง) ห้อยลง ปลายเป็นตะขอก้ามปู */
const hangStrap = (x, y0, len, w, claspScale) => {
  const bands = [["#1e3a6e", 0.26], ["#5da345", 0.24], ["#a8cdec", 0.26], ["#1e3a6e", 0.24]];
  let bx = x - w / 2;
  const stripes = bands
    .map(([c, f]) => { const r = `<rect x="${bx}" y="${y0}" width="${w * f + 0.5}" height="${len}" fill="${c}"/>`; bx += w * f; return r; })
    .join("");
  return `
    ${stripes}
    <rect x="${x - w / 2}" y="${y0}" width="${w}" height="${len}" fill="none" stroke="#0f2a52" stroke-width="2"/>
    <line x1="${x - w / 2 + 3}" y1="${y0 + 12}" x2="${x + w / 2 - 3}" y2="${y0 + 12}" stroke="#fff" stroke-width="2" stroke-dasharray="4 4" opacity="0.85"/>
    <line x1="${x - w / 2 + 3}" y1="${y0 + len - 12}" x2="${x + w / 2 - 3}" y2="${y0 + len - 12}" stroke="#fff" stroke-width="2" stroke-dasharray="4 4" opacity="0.85"/>
    <g transform="translate(${x},${y0 + len})">${claspSvg(claspScale)}</g>`;
};

// ── ภาพ "เนื้อผ้าแคนวาส 8oz / 14oz" — ผ้ากันเปื้อน + เทียบชั้นผ้าบาง/หนา ──
function ozArt(oz) {
  const thin = oz === 8;
  const g = apron(W / 2, 226, 350, 300);

  /** กองผ้าพับมองข้าง — ผ้าบางชั้นบาง ผ้าหนาชั้นหนา + ลูกศรบอกความหนา */
  const stack = (cx, layerH, label, selected) => {
    const y0 = 738, lw = 200;
    const layers = [0, 1, 2]
      .map((i) => {
        const y = y0 - (i + 1) * (layerH + 4);
        return `
        <rect x="${cx - lw / 2}" y="${y}" width="${lw}" height="${layerH}" rx="${layerH / 2}"
          fill="${i % 2 ? CANVAS : CANVAS_DK}" stroke="${EDGE}" stroke-width="2.5"/>`;
      })
      .join("");
    const topY = y0 - 3 * (layerH + 4);
    return `
    <g opacity="${selected ? 1 : 0.38}">
      ${layers}
      ${dim(cx + lw / 2 + 30, topY, cx + lw / 2 + 30, y0, layerH > 14 ? "หนา" : "บาง")}
      <text x="${cx}" y="${y0 + 38}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${selected ? INK : SUB}">${label}</text>
    </g>
    ${selected ? `
      <rect x="${cx - lw / 2 - 28}" y="595" width="${lw + 106}" height="200" rx="18" fill="none" stroke="${OK}" stroke-width="3" stroke-dasharray="10 7"/>
      <text x="${cx}" y="628" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${OK}">ตัวเลือกนี้</text>` : ""}`;
  };

  const body = `
    ${title(`เนื้อผ้าแคนวาส ${oz} ออนซ์`, thin ? "ผ้าบาง น้ำหนักเบา ใส่สบาย แห้งไว" : "ผ้าหนา แน่น ทนทาน อยู่ทรงสวย")}
    ${g.svg}
    ${dim(g.x0, g.bottom + 24, g.x1, g.bottom + 24, "66 ซม.")}
    ${dim(g.x1 + 88, g.top, g.x1 + 88, g.bottom, "76 ซม.")}
    ${stack(255, 10, "8 ออนซ์ — บาง เบา", thin)}
    ${stack(645, 20, "14 ออนซ์ — หนา ทน", !thin)}
    ${foot(["ออนซ์ (oz) = น้ำหนักเนื้อผ้า ตัวเลขยิ่งมากผ้ายิ่งหนา", "พิมพ์ลายซับลิเมชั่นได้คมชัดทั้ง 2 เนื้อ · ราคาเท่ากัน"])}`;
  return frame(body);
}

// ── ภาพ "เพิ่มกระเป๋า" — กระเป๋ามาตรฐาน 3 ช่อง + ใบที่เย็บเพิ่มบนอก ──
function pocketArt() {
  const g = apron(W / 2, 296, 400, 350, { bibPocket: true });
  const bp = g.bibPocket, pk = g.pocket;
  const body = `
    ${title("เพิ่มกระเป๋า", "เย็บกระเป๋าเพิ่มจากมาตรฐาน — เลือกตำแหน่งที่ต้องการได้")}
    ${g.svg}
    ${callout(bp.x + bp.w, bp.y + bp.h / 2, 640, bp.y - 46, "ใบที่เย็บเพิ่ม", "ok")}
    <rect x="${g.cx - 105}" y="${pk.y + pk.h + 16}" width="210" height="36" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${g.cx}" y="${pk.y + pk.h + 41}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${SUB}">3 ช่องมีให้อยู่แล้ว</text>
    ${pill(W / 2, g.bottom + 60, "ใบละ ฿20 · เพิ่มได้สูงสุด 2 ใบ")}
    ${foot(["กระเป๋าหน้า 3 ช่อง + ที่เสียบปากกา รวมในราคาอยู่แล้ว", "แจ้งตำแหน่ง/ขนาดกระเป๋าที่อยากเพิ่มกับแอดมินตอนสั่งได้เลย"])}`;
  return frame(body);
}

// ── ภาพ "เพิ่มสาย+ตะขอเกี่ยว" — สายผ้าพิมพ์ลายห้อยหน้าเสื้อ ปลายตะขอก้ามปู (ตามภาพงานจริง) ──
function hookArt() {
  const g = apron(268, 320, 300, 264, { art: false });
  // สายห้อย 2 เส้นตาม qtyMax 2 — ห้อยจากแนวอกลงมาทับตัวเสื้อ
  const straps = `
    ${hangStrap(g.cx - 46, g.armY - 26, 112, 22, 0.42)}
    ${hangStrap(g.cx + 46, g.armY - 26, 112, 22, 0.42)}`;
  const zx = 668, zy = 408;
  const zoom = `
    <circle cx="${zx}" cy="${zy}" r="170" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
    <line x1="${g.cx + 58}" y1="${g.armY + 116}" x2="${zx - 124}" y2="${zy - 56}" stroke="${SUB}" stroke-width="2.5" stroke-dasharray="7 6"/>
    ${hangStrap(zx, zy - 158, 150, 56, 1.12)}
    <text x="${zx}" y="${zy + 212}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">สายผ้าพิมพ์ลาย + ตะขอก้ามปู</text>`;
  const body = `
    ${title("เพิ่มสาย + ตะขอเกี่ยว", "สายผ้าพิมพ์ลายเข้าชุดชิ้นงาน ปลายเป็นตะขอก้ามปูไว้เกี่ยวของ")}
    ${g.svg}
    ${straps}
    ${zoom}
    ${pill(W / 2, 682, "ชุดละ ฿15 · เพิ่มได้สูงสุด 2 ชุด")}
    ${foot(["สายพิมพ์ซับลิเมชั่นลายเดียวกับตัวผ้ากันเปื้อน", "ไว้เกี่ยวผ้าเช็ดมือ กุญแจ หรือของที่หยิบใช้บ่อย"])}`;
  return frame(body);
}

// ── ภาพ "เพิ่มตัวปรับระดับ" — สายคอโพลีน้ำเงิน + ตัวเลื่อนพลาสติกดำข้างสาย (ตามภาพงานจริง) ──
function adjArt() {
  const g = apron(268, 320, 300, 264, { neck: "adjust", strapFill: BLUE });
  const [ax, ay] = g.adjPt;
  const zx = 668, zy = 408, sw = 50;
  // ขยาย: สายน้ำเงินแนวตั้ง ตัวเลื่อนดำคาดกลาง หางสายพับกลับโผล่ใต้ตัวเลื่อน + ลูกศรเลื่อนขึ้นลง
  const webbing = (x, y0, y1, w, fill) => `
    <rect x="${x - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="4" fill="${fill}"/>
    <line x1="${x - w / 2 + 5}" y1="${y0 + 6}" x2="${x - w / 2 + 5}" y2="${y1 - 6}" stroke="#fff" stroke-width="2" stroke-dasharray="5 5" opacity="0.55"/>
    <line x1="${x + w / 2 - 5}" y1="${y0 + 6}" x2="${x + w / 2 - 5}" y2="${y1 - 6}" stroke="#fff" stroke-width="2" stroke-dasharray="5 5" opacity="0.55"/>`;
  const zoom = `
    <circle cx="${zx}" cy="${zy}" r="170" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
    <line x1="${ax + 12}" y1="${ay - 4}" x2="${zx - 124}" y2="${zy - 100}" stroke="${SUB}" stroke-width="2.5" stroke-dasharray="7 6"/>
    ${webbing(zx, zy - 156, zy + 150, sw, BLUE)}
    ${webbing(zx + 7, zy - 16, zy + 92, sw - 8, BLUE_DK)}
    <path d="M${zx + 7 - (sw - 8) / 2} ${zy + 92} l ${sw - 8} 0 l -6 12 l -${sw - 20} 0 Z" fill="${BLUE_DK}"/>
    <rect x="${zx - sw / 2 - 14}" y="${zy - 44}" width="${sw + 28}" height="52" rx="8" fill="${BLACK}" stroke="#0f1115" stroke-width="3"/>
    <rect x="${zx - sw / 2 - 4}" y="${zy - 24}" width="${sw + 8}" height="12" rx="5" fill="#4a4e57"/>
    <path d="M${zx + 118} ${zy - 84} l 0 150 m -15 -135 l 15 -15 l 15 15 m -30 120 l 15 15 l 15 -15"
      fill="none" stroke="${OK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${zx}" y="${zy + 212}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">ตัวเลื่อนปรับสั้น–ยาว</text>`;
  const body = `
    ${title("เพิ่มตัวปรับระดับ", "ตัวเลื่อนบนสายคอ ปรับความยาวให้พอดีผู้ใส่")}
    ${g.svg}
    ${zoom}
    ${pill(W / 2, 682, "ชิ้นละ ฿15 · เพิ่มได้สูงสุด 2 ชิ้น")}
    ${foot(["เลื่อนปรับสายคอสั้น–ยาวได้ตามสรีระ ไม่ต้องผูกปม", "ใส่ได้พอดีทั้งผู้ใหญ่และเด็ก เหมาะผ้ากันเปื้อนที่ใช้หลายคน"])}`;
  return frame(body);
}

// ── รายการภาพ ────────────────────────────────────────────────────────
const ART = {
  "canvas-8oz": { svg: ozArt(8), group: "เนื้อผ้าแคนวาส", choice: "8oz", note: "ผ้า 8 ออนซ์ — บางเบา" },
  "canvas-14oz": { svg: ozArt(14), group: "เนื้อผ้าแคนวาส", choice: "14oz", note: "ผ้า 14 ออนซ์ — หนาทน" },
  "opt-pocket": { svg: pocketArt(), group: "OPTION", choice: "เพิ่มกระเป๋า", note: "เพิ่มกระเป๋า ฿20" },
  "opt-hook": { svg: hookArt(), ver: "v2", group: "OPTION", choice: "เพิ่มสาย+ตะขอเกี่ยว", note: "สาย+ตะขอก้ามปู ฿15" },
  "opt-adjust": { svg: adjArt(), ver: "v2", group: "OPTION", choice: "เพิ่มตัวปรับระดับ", note: "ตัวปรับระดับ ฿15" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${art.ver ?? VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc ───────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  const c = grp?.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === f.group)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);

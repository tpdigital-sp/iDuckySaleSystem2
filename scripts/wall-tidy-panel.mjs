/**
 * โมดูลวาด "แผงกระเป๋าแขวนผนัง WALL TIDY" ใช้ร่วมกันทุกการ์ดของสินค้า wall-tidy
 *   - scripts/wall-tidy-size-option.mjs   (การ์ดกลุ่ม "ขนาด")
 *   - scripts/wall-tidy-option-art.mjs    (การ์ดกลุ่ม OPTION)
 *
 * โครงสร้างอิงรูปงานจริงในแกลเลอรี (wixstatic 3 ใบ) — ซูมดูแล้วได้ความว่า:
 *   1. เป็นแผงผ้าแคนวาสผืนเดียว พิมพ์ซับลิเมชั่นทั้งผืน (ลายพาดถึงขอบ)
 *   2. หัวและท้ายเย็บเป็น "ปลอกสอดไม้ดาม" — ไม้โผล่ปลายทั้งสองข้าง เชือกแขวนผูกที่ปลายไม้ด้านบน
 *   3. ช่องใส่ของ 7 ช่อง เรียง 2-3-2 ปากช่องกุ๊นผ้าสีตัดกัน (ของจริงเป็นสีชมพู)
 *   4. "สายเกี่ยว 2 เส้น" = สายผ้าพิมพ์ลาย ปลายตะขอก้ามปู เย็บติดหน้าแผงมุมซ้ายบน (ไว้ห้อยพวงกุญแจ/ชาร์ม)
 *      ⚠️ ไม่ใช่ตัวแขวนผนัง — ตัวแขวนคือไม้ดาม+เชือกด้านบน
 *
 * ทุกการ์ดใช้กรอบขาว 900×900 ชุดเดียวกับสคริปต์ option-art ตัวอื่น (apron / crossbody-bag)
 */
import { mascotDataUri } from "./iducky-assets.mjs";

export const W = 900;
export const H = 900;
export const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
export const INK = "#0f172a";
export const SUB = "#64748b";
export const OK = "#0891b2";
export const AMBER = "#b45309";

/** ผ้าแคนวาสครีม + ช่องผ้าโทนน้ำเงิน/พาสเทล + กุ๊นชมพู (ตามรูปงานจริง) */
export const CANVAS = "#f7f0e0";
export const CANVAS_DK = "#ece2cd";
export const EDGE = "#cbbfa5";
export const PINK = "#f2a7bf";
export const WOOD = "#c89a63";
export const WOOD_DK = "#a4763f";
export const METAL = "#8b95a5";
export const METAL_LT = "#c3cbd8";
const POCKET_FILLS = ["#33416f", "#a9cde8", "#33416f", "#7ab648", "#5f77b0", "#33416f", "#a9cde8"];

export const MASCOT = await mascotDataUri("peace", 360);

// ── กรอบการ์ด/ตัวหนังสือชุดกลาง ─────────────────────────────────────
export const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

export const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

export const foot = (lines) =>
  lines
    .filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

/** ป้ายราคา/สถานะทรงแคปซูล */
export const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14.5 + 56;
  const bg = tone === "ok" ? "#ecfeff" : "#f8fafc";
  const bd = tone === "ok" ? OK : SUB;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${bd}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 31}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${bd}">${text}</text>`;
};

/** ป้ายชี้จุด — จุดกลม + เส้น + ข้อความ */
export const callout = (x, y, tx, ty, text, tone = "ok") => {
  const c = tone === "ok" ? OK : SUB;
  const anchor = tx < x ? "end" : "start";
  return `
    <circle cx="${x}" cy="${y}" r="8" fill="${c}"/>
    <circle cx="${x}" cy="${y}" r="15" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.5"/>
    <line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${c}" stroke-width="2.5"/>
    <text x="${tx + (anchor === "start" ? 8 : -8)}" y="${ty + 7}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="${anchor}" fill="${c}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลขบนพื้นขาว */
export const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ตะขอก้ามปู (lobster clasp) — จุดกำเนิดคือปลายสายที่จีบปลอกโลหะ ชี้ลงล่าง
 * ตัวตะขอทำเป็นทรงรีสูง (ไม่ใช่วงกลม) + คันโยกเปิดพาดเฉียง ให้อ่านออกว่าเป็นตะขอเปิด-ปิดได้
 */
export const claspSvg = (s) => `
  <g transform="scale(${s})">
    <rect x="-11" y="0" width="22" height="15" rx="5" fill="${METAL_LT}" stroke="${METAL}" stroke-width="3"/>
    <circle cx="0" cy="28" r="10" fill="none" stroke="${METAL}" stroke-width="7"/>
    <rect x="-7" y="39" width="14" height="12" rx="4" fill="${METAL_LT}" stroke="${METAL}" stroke-width="3"/>
    <!-- ตัวตะขอทรงหยดน้ำ: คอแคบด้านบน ท้องกว้างด้านล่าง -->
    <path d="M2 52 C 20 58 30 80 30 104 C 30 128 14 144 -4 144 C -24 144 -35 126 -35 104 C -35 84 -26 68 -12 60"
      fill="none" stroke="${METAL}" stroke-width="13" stroke-linecap="round"/>
    <path d="M6 62 C 20 70 24 86 24 104" fill="none" stroke="#eef2f7" stroke-width="4.5" stroke-linecap="round" opacity="0.95"/>
    <!-- คันโยกเปิดปาก: พาดเฉียงลงมาจากคอ ปลายเว้นช่องไว้ให้เห็นว่าเปิดได้ -->
    <line x1="-10" y1="62" x2="-31" y2="96" stroke="${METAL_LT}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-33" cy="100" r="6" fill="${METAL}"/>
    <!-- ปุ่มนิ้วดันเปิด -->
    <rect x="-24" y="60" width="13" height="9" rx="4" transform="rotate(-32 -18 64)" fill="${METAL}"/>
  </g>`;

/**
 * ตะขอย่อสำหรับวาดบนแผง (สเกลเล็ก) — ห่วง + ตัวตะขอสั้น
 * ตัวเต็ม claspSvg รายละเอียดเยอะเกินจนเละเมื่อย่อ และยาว 142 หน่วยจนห้อยไปทับปากช่อง
 */
export const claspSmall = (s) => `
  <g transform="scale(${s})">
    <rect x="-7" y="0" width="14" height="9" rx="3" fill="${METAL_LT}" stroke="${METAL}" stroke-width="2"/>
    <circle cx="0" cy="15" r="5.5" fill="none" stroke="${METAL}" stroke-width="4"/>
    <path d="M0 21 C 11 22 14 32 9 38 C 3 45 -9 42 -11 34 C -13 26 -7 21 -2 21"
      fill="none" stroke="${METAL}" stroke-width="6" stroke-linecap="round"/>
  </g>`;

/**
 * สายผ้าพิมพ์ลายทางห้อยลง ปลายเป็นตะขอก้ามปู (สายเกี่ยวของจริง)
 * o.compact = ใช้ตะขอย่อ (เวลาวาดบนแผง) · o.dashed = สายที่ยังไม่ได้ซื้อ วาดจาง ๆ
 */
export const hangStrap = (x, y0, len, w, claspScale, o = {}) => {
  const { dashed = false, compact = false } = o;
  const bands = [["#1e3a6e", 0.26], ["#5da345", 0.24], ["#a8cdec", 0.26], ["#1e3a6e", 0.24]];
  let bx = x - w / 2;
  const stripes = bands
    .map(([c, f]) => { const r = `<rect x="${bx}" y="${y0}" width="${w * f + 0.5}" height="${len}" fill="${c}"/>`; bx += w * f; return r; })
    .join("");
  return `
    <g opacity="${dashed ? 0.55 : 1}">
      ${stripes}
      <rect x="${x - w / 2}" y="${y0}" width="${w}" height="${len}" fill="none" stroke="#0f2a52" stroke-width="2"/>
      <line x1="${x - w / 2 + 2}" y1="${y0 + 9}" x2="${x + w / 2 - 2}" y2="${y0 + 9}" stroke="#fff" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.85"/>
      <g transform="translate(${x},${y0 + len})">${compact ? claspSmall(claspScale) : claspSvg(claspScale)}</g>
    </g>`;
};

/**
 * แผงกระเป๋าแขวนผนังเต็มใบ (สัดส่วนจริง 33 กว้าง × 55 สูง)
 * opts:
 *   straps      = จำนวนสายเกี่ยวที่วาด (ปกติ 2 = ที่รวมในราคา)
 *   extraPocket = วาดช่องที่ 8 แบบเส้นประ (ของ OPTION เพิ่มกระเป๋า)
 *   art         = วาดมาสคอตแทนลายลูกค้าบนหัวแผง (ค่าเริ่มต้น true)
 * คืน geometry ให้การ์ดเอาไปวาง callout / ลูกศรวัดต่อ
 */
export const panel = (cx, top, w, h, o = {}) => {
  const { straps: nStrap = 2, extraPocket = false, art = true } = o;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const bottom = top + h;
  const sleeveH = h * 0.052; // ปลอกสอดไม้ดาม หัว-ท้าย
  const headerH = h * 0.225; // โซนหัวแผง (โลโก้/ลาย + สายเกี่ยว)
  const rowsTop = top + headerH;
  const rowsH = bottom - sleeveH - 6 - rowsTop;
  const gap = h * 0.016;
  const rowH = (rowsH - gap * 2) / 3;
  const pad = w * 0.045;

  // ── ไม้ดาม + เชือกแขวน (หัวแผง) · ไม้ดามท้ายแผงถ่วงให้ผืนตรง ──
  const dowel = (y) => `
    <rect x="${x0 - 16}" y="${y - 6}" width="${w + 32}" height="12" rx="6" fill="${WOOD}" stroke="${WOOD_DK}" stroke-width="2.5"/>`;
  const cord = `
    <path d="M ${x0 - 10} ${top + sleeveH / 2} C ${cx - w * 0.2} ${top - h * 0.11} ${cx + w * 0.2} ${top - h * 0.11} ${x1 + 10} ${top + sleeveH / 2}"
      fill="none" stroke="#d8cbb4" stroke-width="4" stroke-linecap="round"/>`;

  // ── ช่องใส่ของ 2-3-2 · ปากช่องกุ๊นผ้าสีตัดกัน ──
  // แถวบนร่นเข้าทางขวา เว้นคอลัมน์ซ้ายไว้ให้สายเกี่ยวห้อย (ตรงตามรูปงานจริงทั้ง 3 ใบ)
  const leftCol = w * 0.34;
  let pk = 0;
  const pocketBoxes = [];
  const row = (y, n, indent = 0) => {
    const gw = (w - pad * 2 - indent - gap * (n - 1)) / n;
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = x0 + pad + indent + i * (gw + gap);
      const fill = POCKET_FILLS[pk % POCKET_FILLS.length];
      pocketBoxes.push({ x, y, w: gw, h: rowH });
      out += `
      <rect x="${x}" y="${y}" width="${gw}" height="${rowH}" rx="7" fill="${fill}"/>
      <rect x="${x}" y="${y}" width="${gw}" height="${rowH}" rx="7" fill="none" stroke="#00000022" stroke-width="2"/>
      <rect x="${x - 2}" y="${y - 5}" width="${gw + 4}" height="10" rx="5" fill="${PINK}"/>
      <line x1="${x + 5}" y1="${y + rowH - 6}" x2="${x + gw - 5}" y2="${y + rowH - 6}" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="5 5" opacity="0.5"/>`;
      pk++;
    }
    return out;
  };

  // ── สายเกี่ยว: สายผ้า + ตะขอ ห้อยในคอลัมน์ซ้ายของหัวแผง (สัดส่วนตามรูปงานจริง) ──
  const strapW = w * 0.075;
  const strapLen = h * 0.13;
  const strapY = top + sleeveH + h * 0.045;
  const strapX = (i) => x0 + w * 0.13 + strapW / 2 + i * (strapW + w * 0.035);
  const strapScale = strapW / 22;
  const strapsSvg = Array.from({ length: nStrap }, (_, i) =>
    hangStrap(strapX(i), strapY, strapLen, strapW, strapScale, { compact: true })
  ).join("");

  // ── ช่องที่เย็บเพิ่ม (OPTION) — คอลัมน์ซ้ายใต้สายเกี่ยว เสมอแถวแรก
  // (ตำแหน่งนี้ร้านชี้มาเอง: กรอบแดงในรูปงานจริงตรงที่ห้อยชาร์มเป็ด) ──
  const ep = { x: x0 + pad, y: rowsTop, w: leftCol - pad - gap, h: rowH };
  const extraPocketSvg = extraPocket
    ? `
    <rect x="${ep.x}" y="${ep.y}" width="${ep.w}" height="${ep.h}" rx="7" fill="#ecfeff" stroke="${OK}" stroke-width="3" stroke-dasharray="9 6"/>
    <rect x="${ep.x - 2}" y="${ep.y - 5}" width="${ep.w + 4}" height="10" rx="5" fill="${PINK}" opacity="0.75"/>
    <path d="M${ep.x + ep.w / 2 - 13} ${ep.y + ep.h / 2 + 3} h 26 M${ep.x + ep.w / 2} ${ep.y + ep.h / 2 - 10} v 26"
      stroke="${OK}" stroke-width="4.5" stroke-linecap="round"/>`
    : "";

  // ── ลายที่พิมพ์ (มาสคอตแทนไฟล์ลูกค้า) — วางหัวแผง เลี่ยงสายเกี่ยวและช่องที่เพิ่ม ──
  const artH = headerH * 0.55;
  const artW = artH * MASCOT.ratio;
  const artCx = x0 + w * 0.6;
  const artSvg = art
    ? `<image href="${MASCOT.uri}" x="${artCx - artW / 2}" y="${top + sleeveH + headerH * 0.2}" width="${artW}" height="${artH}" preserveAspectRatio="xMidYMid meet"/>`
    : "";

  return {
    svg: `
    ${cord}
    <!-- ผืนผ้าแคนวาสพิมพ์ลายทั้งผืน -->
    <rect x="${x0}" y="${top}" width="${w}" height="${h}" rx="10" fill="${CANVAS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${x0 + 6}" y="${top + 6}" width="${w - 12}" height="${h - 12}" rx="7" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-dasharray="6 6" opacity="0.75"/>
    <!-- ปลอกสอดไม้ดาม หัว-ท้าย -->
    <line x1="${x0}" y1="${top + sleeveH}" x2="${x1}" y2="${top + sleeveH}" stroke="${EDGE}" stroke-width="2.5" stroke-dasharray="7 5"/>
    <line x1="${x0}" y1="${bottom - sleeveH}" x2="${x1}" y2="${bottom - sleeveH}" stroke="${EDGE}" stroke-width="2.5" stroke-dasharray="7 5"/>
    <rect x="${x0}" y="${bottom - sleeveH}" width="${w}" height="${sleeveH}" fill="${CANVAS_DK}" opacity="0.75"/>
    ${dowel(top + sleeveH / 2)}
    ${dowel(bottom - sleeveH / 2)}
    ${artSvg}
    ${extraPocketSvg}
    ${strapsSvg}
    ${row(rowsTop, 2, leftCol)}
    ${row(rowsTop + rowH + gap, 3)}
    ${row(rowsTop + (rowH + gap) * 2, 2)}`,
    x0, x1, top, bottom, cx, w, h,
    sleeveH, headerH, rowsTop, rowH, leftCol,
    pockets: pocketBoxes,
    extraPocket: ep,
    strap: { x: strapX(0), x2: strapX(nStrap - 1), y: strapY, len: strapLen, w: strapW, scale: strapScale },
  };
};

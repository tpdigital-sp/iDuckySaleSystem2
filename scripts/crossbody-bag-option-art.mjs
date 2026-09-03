#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Crossbody Bag / กระเป๋าสะพายข้าง" (crossbody-bag)
 *
 *   node scripts/crossbody-bag-option-art.mjs            (วาดภาพลง .cache/crossbody-bag/upload)
 *   node scripts/crossbody-bag-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: แกลเลอรีมีแต่รูปถ่ายใบสีครีมลายดอกไม้ — ไม่มีรูปใบสีดำ ไม่มีรูปที่บอกว่า
 * "ปักไม่เกิน 8×4 ซม." กินพื้นที่แค่ไหนบนใบจริง และไม่มีรูปอธิบายว่า "ไม่เกิน 3 สี" นับยังไง
 * สไตล์การ์ดยึดตาม drawstring-bag-option-art.mjs (การ์ดขาว 900×900 หัวเรื่อง+ป้ายชี้+ฟุตโน้ต)
 *
 * ได้ 4 ไฟล์:
 *   bag-white.jpg   สีกระเป๋า → สีขาว   (choice.imageSrc — ขึ้นเป็นภาพย่อบนปุ่ม + เข้าแกลเลอรี)
 *   bag-black.jpg   สีกระเป๋า → สีดำ    (choice.imageSrc)
 *   emb-size.jpg    ขนาดปักไม่เกิน 8*4 cm  (option.noteImageSrc + choice.imageSrc)
 *   thread-3.jpg    สีไหมไม่เกิน 3 สี      (option.noteImageSrc + choice.imageSrc)
 *
 * ที่มาของตัวเลข: products.crossbody-bag ใน DB (3 ก.ย. 69)
 *   terms: ขนาดใบ 30×7×22 ซม. · ปักไม่เกิน กว้าง 8 × สูง 4 ซม. · ไม่มีซับใน · ปิดด้วยซิป · สายปรับได้
 *   options: "ขนาดปักไม่เกิน 8*4 cm" เกินเพิ่มเซนละ ฿15 · "สีไหมไม่เกิน 3  สี" เกินเพิ่มสีละ ฿10 (สูงสุด 15)
 *   pricing: 290 / 280 / 260 / 250 ต่อใบ ตามช่วง 1-10 / 11-29 / 30-49 / 50+
 *
 * สเกลในภาพเป็นสัดส่วนจริง: ตัวกระเป๋ากว้าง 600px = 30 ซม. → 20px ต่อ 1 ซม.
 * กรอบปักจึงเป็น 160×80px พอดีกับ 8×4 ซม. (ดูใหญ่แค่ไหนบนใบจริงก็เท่านั้นจริง ๆ)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "crossbody-bag";
const VER = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/crossbody-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const AMBER = "#b45309";

/** ผิวใบสองสีตามตัวเลือก "สีกระเป๋า" (ครีมตามรูปถ่ายจริง ไม่ใช่ขาวจั๊วะ) */
const SKIN = {
  white: { cloth: "#faf4e6", shade: "#f0e6d0", edge: "#dccfae", zip: "#c9b78d", strap: "#f6efdd" },
  black: { cloth: "#2c2c33", shade: "#232329", edge: "#15151a", zip: "#8e8e99", strap: "#26262c" },
};

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

/** ป้ายชี้ชิ้นส่วน — จุด + เส้นบาง + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start", color = SUB) => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${color}">${text}</text>`;

// ── ทรงกระเป๋าสะพายข้างทรงเสี้ยวพระจันทร์ (อิงรูปถ่ายจริงในแกลเลอรี) ──
/**
 * ลักษณะเด่นที่ทำให้อ่านออกว่าเป็นทรงเสี้ยว (ไม่ใช่กระเป๋าถือทรงตะกร้า):
 *   1. ขอบบน "แอ่นลง" ตรงกลาง — ปลายซ้าย/ขวาเชิดขึ้นเป็นเขา ไม่ใช่โค้งนูนขึ้นแบบวงรี
 *   2. ท้องใบเป็นส่วนโค้งลึกเส้นเดียวยาวตลอด
 *   3. สายเป็นแถบผ้าแบน "กว้าง" (ราว 7% ของความกว้างใบ) มีตัวปรับพลาสติกดำ ไม่ใช่เส้นเรียวแบบหูหิ้ว
 * คืน geometry — cx กลางใบ, x ซ้ายสุด, top ระดับปลายเขา, w กว้าง, h สูงจากปลายเขาถึงท้องใบ
 */
const bagGeom = (cx, top, w, h) => ({ cx, x: cx - w / 2, top, w, h, bottom: top + h });

/** ขอบบนแอ่นลง: จุดควบคุมอยู่ "ใต้" ปลายเขา ทำให้กลางขอบบนยุบลงราว 0.22h */
const bagBody = (g) => {
  const { x, top: t, w, h, cx } = g;
  return `M ${x} ${t}
    C ${x + w * 0.29} ${t + h * 0.26} ${x + w * 0.71} ${t + h * 0.26} ${x + w} ${t}
    C ${x + w * 1.01} ${t + h * 0.52} ${x + w * 0.76} ${t + h} ${cx} ${t + h}
    C ${x + w * 0.24} ${t + h} ${x - w * 0.01} ${t + h * 0.52} ${x} ${t} Z`;
};

/** แนวซิปปิดปาก — วิ่งขนานใต้ขอบบนที่แอ่นลง */
const zipPath = (g) => {
  const { x, top: t, w, h } = g;
  return `M ${x + w * 0.045} ${t + h * 0.045}
    C ${x + w * 0.31} ${t + h * 0.28} ${x + w * 0.69} ${t + h * 0.28} ${x + w * 0.955} ${t + h * 0.045}`;
};

/** จุดควบคุมของแถบสายสะพาย (ใช้ทั้งวาดเส้น หาตำแหน่งและมุมของตัวปรับ) */
const strapPts = (g) => {
  const { x, top: t, w, h } = g;
  return [
    [x + w * 0.05, t + h * 0.01],
    [x + w * 0.2, t - h * 0.62],
    [x + w * 0.8, t - h * 0.62],
    [x + w * 0.95, t + h * 0.01],
  ];
};

/** จุดบนเส้นสายที่พารามิเตอร์ u (0=ปลายซ้าย 1=ปลายขวา) — เบซิเยร์กำลังสาม */
const strapAt = (g, u) => {
  const p = strapPts(g);
  const b = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u ** 2, u ** 3];
  return [0, 1].map((k) => p.reduce((s, pt, i) => s + b[i] * pt[k], 0));
};

/** มุมเอียงของสาย ณ จุด u (องศา) — ใช้หมุนตัวปรับให้แนบไปกับสาย */
const strapAngle = (g, u) => {
  const p = strapPts(g);
  const d = [0, 1].map((k) =>
    3 * (1 - u) ** 2 * (p[1][k] - p[0][k]) + 6 * (1 - u) * u * (p[2][k] - p[1][k]) + 3 * u ** 2 * (p[3][k] - p[2][k])
  );
  return (Math.atan2(d[1], d[0]) * 180) / Math.PI;
};

/**
 * ใบกระเป๋าเต็มตัว: สายแถบกว้าง + ตัวปรับ → หูเกี่ยวสายที่ปลายเขา → ตัวใบ → ริ้วผ้า/เงา → ซิป
 * opts.strap = false → วาดแค่หูเกี่ยวสายสั้น ๆ (การ์ดที่ต้องการที่ว่างด้านบน เช่น การ์ดขนาดปัก)
 * clipId = id ของ clipPath ตัวใบ ผู้เรียกเอาไปตัดลายปักไม่ให้ล้นขอบ
 */
const bag = (g, sk, clipId = "bagclip", opts = {}) => {
  const { strap: withStrap = true } = opts;
  const { x, top: t, w, h } = g;
  const strapW = w * 0.062; // แถบผ้าแบนกว้างตามรูปถ่าย ไม่ใช่เส้นเรียว
  const [s0, s1, s2, s3] = strapPts(g);
  const strapD = `M ${s0[0]} ${s0[1]} C ${s1[0]} ${s1[1]} ${s2[0]} ${s2[1]} ${s3[0]} ${s3[1]}`;
  // ตัวปรับความยาวสาย (พลาสติกดำ) — วางบนเส้นจริงที่ u=0.12 พร้อมหมุนตามมุมสาย เหมือนในรูปถ่าย
  const [bx, by] = strapAt(g, 0.12);
  const bAng = strapAngle(g, 0.12);
  const bW = strapW * 0.55;
  // หูเกี่ยวสายที่ปลายเขาทั้งสองข้าง (ผ้าพับเย็บติดตัวใบ)
  const tab = (tx, ty) =>
    `<rect x="${tx - strapW * 0.6}" y="${ty - 6}" width="${strapW * 1.2}" height="${h * 0.14}" rx="${strapW * 0.3}" fill="${sk.strap}" stroke="${sk.edge}" stroke-width="3"/>`;
  // ริ้วผ้าลูกฟูกแนวตั้ง (ตามเนื้อผ้าในรูปถ่าย) — จาง ๆ พอให้ไม่แบน
  const ribs = Array.from({ length: 19 }, (_, i) => {
    const rx = x + w * (0.04 + (i * 0.92) / 18);
    return `<line x1="${rx.toFixed(1)}" y1="${t}" x2="${rx.toFixed(1)}" y2="${t + h}" stroke="${sk.edge}" stroke-width="1.5" opacity="0.14"/>`;
  }).join("");
  return `
    <clipPath id="${clipId}"><path d="${bagBody(g)}"/></clipPath>
    ${
      withStrap
        ? `<!-- สายสะพายแถบกว้างปรับความยาวได้ (อยู่หลังตัวใบ) -->
    <path d="${strapD}" fill="none" stroke="${sk.edge}" stroke-width="${strapW + 5}" stroke-linecap="butt" opacity="0.4"/>
    <path d="${strapD}" fill="none" stroke="${sk.strap}" stroke-width="${strapW}" stroke-linecap="butt"/>
    <g transform="translate(${bx} ${by}) rotate(${bAng})">
      <rect x="${-bW * 0.75}" y="${-strapW * 0.66}" width="${bW * 1.5}" height="${strapW * 1.32}" rx="${bW * 0.34}" fill="#2f2f36"/>
      <rect x="${-bW * 0.3}" y="${-strapW * 0.34}" width="${bW * 0.6}" height="${strapW * 0.68}" rx="${bW * 0.16}" fill="${sk.strap}" opacity="0.85"/>
    </g>`
        : ""
    }
    ${tab(s0[0], s0[1] - 4)}
    ${tab(s3[0], s3[1] - 4)}
    <!-- ตัวใบ + ริ้วผ้า + เงาท้องใบ (ตัดด้วย clip ของตัวใบทั้งหมด) -->
    <path d="${bagBody(g)}" fill="${sk.cloth}"/>
    <linearGradient id="${clipId}-sh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.3" stop-color="${sk.shade}" stop-opacity="0"/>
      <stop offset="1" stop-color="${sk.shade}" stop-opacity="0.85"/>
    </linearGradient>
    <g clip-path="url(#${clipId})">
      ${ribs}
      <rect x="${x}" y="${t}" width="${w}" height="${h}" fill="url(#${clipId}-sh)"/>
    </g>
    <path d="${bagBody(g)}" fill="none" stroke="${sk.edge}" stroke-width="4"/>
    <!-- ซิปปิดปากกระเป๋า + หัวรูดซิปฝั่งขวา -->
    <path d="${zipPath(g)}" fill="none" stroke="${sk.zip}" stroke-width="6" stroke-linecap="round"/>
    <path d="${zipPath(g)}" fill="none" stroke="${sk.cloth}" stroke-width="2.5" stroke-dasharray="3 5" opacity="0.7"/>
    ${(() => {
      const px = x + w * 0.955, py = t + h * 0.045;
      return `<circle cx="${px}" cy="${py}" r="8" fill="${sk.zip}"/><rect x="${px - 4}" y="${py}" width="8" height="24" rx="4" fill="${sk.zip}"/>`;
    })()}`;
};

// ── ลายปัก (ดอกไม้ตามงานจริง) ────────────────────────────────────────
/** ดอกไม้ 5 กลีบ + ก้าน — โทนเดียวกับงานปักในรูปถ่าย */
const flower = (x, y, r, petal, core = "#e8c94a", stem = "#6fc2b4") => {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return `<circle cx="${(x + Math.cos(a) * r * 0.6).toFixed(1)}" cy="${(y + Math.sin(a) * r * 0.6).toFixed(1)}" r="${(r * 0.52).toFixed(1)}" fill="${petal}"/>`;
  }).join("");
  return `<g>
    ${stem ? `<path d="M${x} ${y + r * 0.5} q ${r * 0.15} ${r * 0.9} ${-r * 0.35} ${r * 1.45}" fill="none" stroke="${stem}" stroke-width="${(r * 0.24).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x - r * 0.1} ${y + r * 1.5} q ${-r * 0.9} ${-r * 0.15} ${-r * 0.75} ${r * 0.55}" fill="none" stroke="${stem}" stroke-width="${(r * 0.26).toFixed(1)}" stroke-linecap="round"/>` : ""}
    ${petals}
    <circle cx="${x}" cy="${y}" r="${(r * 0.3).toFixed(1)}" fill="${core}"/>
  </g>`;
};

/** ดอกทิวลิปเล็ก ๆ แซมระหว่างดอกใหญ่ */
const tulip = (x, y, r, petal, stem = "#7fc9d8") => `<g>
  <path d="M${x} ${y + r * 0.45} L${x} ${y + r * 1.4}" stroke="${stem}" stroke-width="${(r * 0.24).toFixed(1)}" stroke-linecap="round"/>
  <path d="M${x - r * 0.75} ${y + r * 0.95} q ${r * 0.75} ${-r * 0.1} ${r * 0.75} ${-r * 0.1}" stroke="${stem}" stroke-width="${(r * 0.22).toFixed(1)}" fill="none" stroke-linecap="round"/>
  <path d="M${x + r * 0.75} ${y + r * 1.05} q ${-r * 0.75} ${-r * 0.1} ${-r * 0.75} ${-r * 0.1}" stroke="${stem}" stroke-width="${(r * 0.22).toFixed(1)}" fill="none" stroke-linecap="round"/>
  <path d="M${x - r * 0.72} ${y - r * 0.1} C ${x - r * 0.8} ${y - r * 0.95} ${x - r * 0.2} ${y - r * 0.9} ${x} ${y - r * 0.3}
           C ${x + r * 0.2} ${y - r * 0.9} ${x + r * 0.8} ${y - r * 0.95} ${x + r * 0.72} ${y - r * 0.1}
           C ${x + r * 0.72} ${y + r * 0.6} ${x - r * 0.72} ${y + r * 0.6} ${x - r * 0.72} ${y - r * 0.1} Z" fill="${petal}"/>
</g>`;

/** เม็ดปักจุดเล็ก ๆ (French knot) โรยรอบ ๆ ให้เหมือนงานจริง */
const knots = (pts, c) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r ?? 3.5}" fill="${c}" opacity="0.8"/>`).join("");

/** ช่อลายปักมาตรฐาน วางกึ่งกลางกรอบ (bw × bh) — ใช้ทั้งการ์ดสีและการ์ดขนาด */
const bouquet = (cx, cy, s = 1, cols = ["#b79ae0", "#f6a58f", "#7fc9bd"]) => `
  ${flower(cx - 52 * s, cy - 14 * s, 20 * s, cols[0])}
  ${flower(cx + 30 * s, cy - 22 * s, 17 * s, cols[0])}
  ${tulip(cx - 8 * s, cy + 6 * s, 15 * s, cols[1])}
  ${tulip(cx + 62 * s, cy + 10 * s, 13 * s, cols[1])}
  ${flower(cx + 4 * s, cy + 30 * s, 14 * s, cols[0])}
  ${knots(
    [
      [cx - 74 * s, cy + 24 * s, 4 * s],
      [cx - 26 * s, cy - 34 * s, 3.5 * s],
      [cx + 48 * s, cy + 32 * s, 4 * s],
      [cx + 78 * s, cy - 30 * s, 3.5 * s],
    ],
    cols[2]
  )}`;

/**
 * ลายปักกระจายทั่วหน้าใบ (ตามรูปถ่ายจริง — ดอกเล็กโปรยเป็นทุ่ง ไม่ใช่ช่อกระจุกเดียว)
 * พิกัดเป็นสัดส่วนของกล่องใบ: u ตามความกว้าง, v ตามความสูง · ขนาดดอกคิดเป็นสัดส่วนของความกว้างใบ
 */
const FIELD = [
  [0.30, 0.44, "f", 0.028], [0.42, 0.38, "t", 0.020], [0.55, 0.42, "f", 0.024],
  [0.22, 0.58, "t", 0.019], [0.36, 0.56, "f", 0.032], [0.49, 0.60, "t", 0.021],
  [0.62, 0.54, "f", 0.027], [0.72, 0.60, "t", 0.019],
  [0.28, 0.74, "f", 0.026], [0.41, 0.78, "t", 0.020], [0.55, 0.75, "f", 0.030],
  [0.67, 0.79, "t", 0.019], [0.47, 0.90, "f", 0.024],
];
const scatter = (g, cols = ["#b79ae0", "#f6a58f", "#7fc9bd"]) =>
  FIELD.map(([u, v, kind, k]) => {
    const px = g.x + g.w * u;
    const py = g.top + g.h * v;
    const r = g.w * k;
    return kind === "f" ? flower(px, py, r, cols[0]) : tulip(px, py, r, cols[1]);
  }).join("") +
  knots(
    [[0.35, 0.34], [0.60, 0.34], [0.25, 0.5], [0.68, 0.46], [0.45, 0.68], [0.75, 0.7], [0.33, 0.86], [0.62, 0.9]].map(
      ([u, v]) => [g.x + g.w * u, g.top + g.h * v, g.w * 0.006]
    ),
    cols[2]
  );

// ── การ์ดที่ 1-2: สีกระเป๋า ──────────────────────────────────────────
function colorArt(kind) {
  const white = kind === "white";
  const sk = white ? SKIN.white : SKIN.black;
  const g = bagGeom(W / 2, 330, 600, 300);
  const clip = "bagclip";
  const fx = g.cx - 30; // จุดกลางช่อลายปัก
  const fy = g.top + g.h * 0.52;
  const body = `
    ${title(white ? "สีขาว" : "สีดำ", white ? "ผ้าสีครีมธรรมชาติ — สีไหมปักเด่นชัดทุกเฉด" : "ผ้าสีดำ — ไหมสีสว่าง/พาสเทลตัดกับผ้าได้สวย")}
    ${bag(g, sk, clip)}
    <g clip-path="url(#${clip})">${scatter(g)}</g>
    <!-- ป้ายชี้กางออกคนละฝั่ง เส้นสั้น ๆ ไม่ลากพาดทับเนื้อกระเป๋า -->
    ${callout(...strapAt(g, 0.86), W - 96, 214, "ตัวปรับความยาวสาย", "end")}
    <!-- ลายปัก: แปะป้ายใต้ใบตรง ๆ (ลากเส้นจากกลางใบลงมาจะพาดทับผ้าเป็นทางยาว) -->
    <text x="${g.cx}" y="${g.bottom + 46}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ลายปักตามไฟล์ของลูกค้า (ภาพเป็นตัวอย่าง)</text>
    ${foot(["ขนาดใบ 30 × 7 × 22 ซม. · ปิดด้วยซิป · ไม่มีซับในและช่องด้านใน", "เริ่มต้น ฿290/ใบ (1-10 ใบ) — 50 ใบขึ้นไป เหลือ ฿250/ใบ"])}`;
  return frame(body);
}

// ── การ์ดที่ 3: ขนาดปักไม่เกิน 8 × 4 ซม. ─────────────────────────────
/**
 * สเกลตามความกว้าง: ใบกว้าง 600px = 30 ซม. → 20px ต่อ 1 ซม.
 * กรอบปักจึงเป็น 160 × 80px = 8 × 4 ซม. จริง ๆ (ทั้งสองด้านสเกลเดียวกัน)
 */
function sizeArt() {
  const PX = 20; // px ต่อ 1 ซม.
  const g = bagGeom(W / 2, 320, 30 * PX, 300);
  const clip = "bagclip";
  const bw = 8 * PX;
  const bh = 4 * PX;
  const bx = g.cx - 30 - bw / 2;
  const by = g.top + g.h * 0.5 - bh / 2;

  const body = `
    ${title("ขนาดปัก ไม่เกิน 8 × 4 ซม.", "กรอบในภาพคือขนาดจริง เทียบกับใบกระเป๋ากว้าง 30 ซม.")}
    ${bag(g, SKIN.white, clip)}
    <g clip-path="url(#${clip})">${bouquet(bx + bw / 2, by + bh / 2, 0.6)}</g>
    <!-- กรอบพื้นที่ปักมาตรฐาน -->
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${AMBER}" stroke-width="3" stroke-dasharray="9 7" rx="4"/>
    <!-- เส้นวัดกว้าง 8 ซม. (ใต้กรอบ) -->
    <g stroke="${AMBER}" stroke-width="2.5">
      <line x1="${bx}" y1="${by + bh + 24}" x2="${bx + bw}" y2="${by + bh + 24}"/>
      <line x1="${bx}" y1="${by + bh + 16}" x2="${bx}" y2="${by + bh + 32}"/>
      <line x1="${bx + bw}" y1="${by + bh + 16}" x2="${bx + bw}" y2="${by + bh + 32}"/>
    </g>
    <text x="${bx + bw / 2}" y="${by + bh + 55}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${AMBER}">กว้าง 8 ซม.</text>
    <!-- เส้นวัดสูง 4 ซม. (ซ้ายกรอบ) -->
    <g stroke="${AMBER}" stroke-width="2.5">
      <line x1="${bx - 24}" y1="${by}" x2="${bx - 24}" y2="${by + bh}"/>
      <line x1="${bx - 32}" y1="${by}" x2="${bx - 16}" y2="${by}"/>
      <line x1="${bx - 32}" y1="${by + bh}" x2="${bx - 16}" y2="${by + bh}"/>
    </g>
    <text x="${bx - 36}" y="${by + bh / 2 + 7}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${AMBER}">สูง 4 ซม.</text>
    <!-- ป้าย "อยู่ในกรอบ = ราคาปกติ" แปะข้างกรอบเลย ไม่ลากเส้นทับตัวใบ -->
    <g>
      <rect x="${bx + bw + 16}" y="${by + bh / 2 - 20}" width="228" height="40" rx="20" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="2"/>
      <text x="${bx + bw + 130}" y="${by + bh / 2 + 7}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="#047857">อยู่ในกรอบ = ราคาปกติ</text>
    </g>

    <!-- แถบตัวอย่างการคิดเงินเมื่อปักเกินกรอบ -->
    <rect x="112" y="700" width="${W - 224}" height="98" rx="20" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
    <text x="${W / 2}" y="736" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${AMBER}">ปักเกินกรอบ คิดเพิ่ม ซม. ละ 15 บาท</text>
    <text x="${W / 2}" y="770" font-family="${TH}" font-size="20" text-anchor="middle" fill="#92400e">พิมพ์ขนาดจริงลงช่อง เช่น กว้าง 11 ซม. → เกิน 3 ซม. ระบบคิด +45 บาท ให้เอง</text>
    ${foot(["คิดแยกทีละด้าน — ด้านที่ยังไม่เกินกรอบไม่คิดเงิน", "ไม่แน่ใจว่าลายกินพื้นที่เท่าไหร่ — เว้นช่องว่างไว้ แนบไฟล์มา ทีมงานวัดให้"])}`;
  return frame(body);
}

// ── การ์ดที่ 4: สีไหมไม่เกิน 3 สี ─────────────────────────────────────
/** หลอดไหมปัก 1 หลอด (แกนกรวย + เส้นไหมพัน) */
const spool = (x, y, w, h, c, dim = false) => {
  const o = dim ? 0.34 : 1;
  return `<g opacity="${o}">
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w * 0.18}" fill="${c}"/>
    ${Array.from({ length: 6 }, (_, i) => `<line x1="${x - w / 2 + 4}" y1="${y - h / 2 + 10 + i * ((h - 20) / 5)}" x2="${x + w / 2 - 4}" y2="${y - h / 2 + 16 + i * ((h - 20) / 5)}" stroke="#ffffff" stroke-width="2" opacity="0.35"/>`).join("")}
    <rect x="${x - w / 2 - 5}" y="${y - h / 2 - 12}" width="${w + 10}" height="14" rx="6" fill="#e7e2d6"/>
    <rect x="${x - w / 2 - 5}" y="${y + h / 2 - 2}" width="${w + 10}" height="14" rx="6" fill="#e7e2d6"/>
  </g>`;
};

function threadArt() {
  const cols = ["#a985dd", "#f2896d", "#4fb8a8"];
  const extra = "#e0a92c";
  const cx = W / 2;

  // ลายตัวอย่างขยายใหญ่ + ป้ายชี้ว่าสีไหนคือสีที่ 1/2/3 (ป้ายกางออกซ้าย-ขวา ไม่ทับกัน)
  const artY = 282;
  const art = `
    <circle cx="${cx}" cy="${artY}" r="126" fill="#fdfbf4" stroke="#eee7d5" stroke-width="3"/>
    ${flower(cx - 44, artY - 30, 31, cols[0])}
    ${tulip(cx + 40, artY - 12, 25, cols[1])}
    ${flower(cx + 2, artY + 44, 23, cols[0])}
    ${knots([[cx - 68, artY + 44, 6], [cx + 76, artY + 50, 5.5], [cx - 6, artY - 80, 5]], cols[2])}`;

  const labels = `
    ${callout(cx - 54, artY - 38, 214, 200, "สีที่ 1 · กลีบดอก", "end")}
    ${callout(cx + 46, artY - 22, W - 214, 200, "สีที่ 2 · ทิวลิป", "start")}
    ${callout(cx - 68, artY + 44, 214, 386, "สีที่ 3 · ก้าน/ใบ", "end")}`;

  // แถวหลอดไหม: 3 หลอดแรก "รวมในราคา" · หลอดที่ 4 จาง ๆ = ส่วนที่คิดเพิ่ม
  // จัดกล่องให้ชุดรวม (กว้าง 400) + ชุดคิดเพิ่ม (กว้าง 190) อยู่กึ่งกลางการ์ดพอดี
  const GW = 400, AW = 190, GAP = 22;
  const gx = (W - (GW + GAP + AW)) / 2;
  const ax = gx + GW + GAP;
  const boxTop = 462, boxH = 214;
  const sy = boxTop + 118; // จุดกลางหลอดไหม
  const inc = [0, 1, 2].map((i) => gx + (GW * (2 * i + 1)) / 6);
  const spools = `
    <rect x="${gx}" y="${boxTop}" width="${GW}" height="${boxH}" rx="24" fill="#f0fdfa" stroke="#5eead4" stroke-width="2"/>
    <text x="${gx + GW / 2}" y="${boxTop + 38}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="#0f766e">รวมในราคาแล้ว — 3 สี</text>
    ${inc.map((sx, i) => `${spool(sx, sy, 58, 96, cols[i])}
      <text x="${sx}" y="${boxTop + boxH - 18}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${INK}">สีที่ ${i + 1}</text>`).join("")}
    <rect x="${ax}" y="${boxTop}" width="${AW}" height="${boxH}" rx="24" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
    <text x="${ax + AW / 2}" y="${boxTop + 38}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${AMBER}">สีที่ 4 ขึ้นไป</text>
    ${spool(ax + AW / 2, sy, 58, 96, extra, true)}
    <text x="${ax + AW / 2}" y="${boxTop + boxH - 18}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${AMBER}">+10 บาท / สี</text>`;

  const body = `
    ${title("สีไหมปัก ไม่เกิน 3 สี", "นับ “จำนวนเฉดสีไหมที่ใช้ในลาย” ไม่ใช่จำนวนดอก")}
    ${art}
    ${labels}
    ${spools}
    <!-- ตัวอย่างการนับที่ลูกค้าถามบ่อย: ดอกเยอะแต่ใช้ไหมไม่กี่เฉด = ยังอยู่ในโควตา -->
    <rect x="112" y="706" width="${W - 224}" height="70" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${cx}" y="${706 + 43}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#475569">ลายมีดอกไม้ 12 ดอก แต่ใช้ไหมแค่ 3 เฉด = ยังอยู่ในโควตา ไม่คิดเพิ่ม</text>
    ${foot(["สีที่เกินโควตากรอกจำนวนในช่องตัวเลือก — เพิ่มได้สูงสุด 15 สี", "เลือกเบอร์สีจากตาราง “สีไหม / thread color” ด้านล่างหน้าสินค้า"])}`;
  return frame(body);
}

// ── เรนเดอร์ ─────────────────────────────────────────────────────────
const ART = {
  "bag-white": {
    svg: colorArt("white"),
    group: "สีกระเป๋า",
    choice: "สีขาว",
    note: "ใบสีครีม/ขาว",
  },
  "bag-black": {
    svg: colorArt("black"),
    group: "สีกระเป๋า",
    choice: "สีดำ",
    note: "ใบสีดำ",
  },
  "emb-size": {
    svg: sizeArt(),
    group: "ขนาดปักไม่เกิน 8*4 cm",
    choice: "เกินเพิ่มเซนละ",
    groupNote: "พื้นที่ปักมาตรฐาน กว้าง 8 × สูง 4 ซม. รวมในราคาแล้ว — พิมพ์ขนาดลายจริงลงช่องได้เลย ส่วนที่เกินกรอบระบบคิดให้เอง ซม. ละ ฿15",
    note: "กรอบปัก 8×4 ซม. เทียบขนาดจริงบนใบ",
  },
  "thread-3": {
    svg: threadArt(),
    group: "สีไหมปัก (รวมในราคา 3 สี · สีที่ 4 ขึ้นไป +฿10/สี)",
    groupNote: "นับจำนวนเฉดสีไหมที่ใช้ในลาย — 3 สีแรกรวมในราคาแล้ว สีที่ 4 ขึ้นไปคิดเพิ่มสีละ ฿10 (สูงสุด 15 สี)",
    note: "นับสีไหม 3 สีรวมในราคา · เกินสีละ ฿10",
  },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด storage + เขียน DB + อ่านกลับเทียบ ───────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
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
  if (!grp) { console.error(`ไม่เจอกลุ่ม "${f.group}"`); process.exit(1); }
  // กลุ่มสวอตช์ 80 เบอร์ไม่มีตัวเลือกให้ผูกภาพ (f.choice ว่าง) — ใช้เฉพาะรูปประกอบ note ของกลุ่ม
  if (f.choice) {
    const c = grp.choices?.find((c) => c.name === f.choice);
    if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
    c.imageSrc = f.url;
  }
  // กลุ่มที่ตัวเลือกเป็นช่องจำนวน (multi) — ปุ่มไม่มีที่โชว์ภาพย่อ จึงผูกเป็นรูปประกอบ note ของกลุ่มแทน
  // (ท้าย note จะมีปุ่ม "👀 กดดูรูปตัวอย่าง" เปิดเต็มจอ — ดู ProductDetail:2706)
  if (f.groupNote) {
    grp.note = f.groupNote;
    grp.noteImageSrc = f.url;
  }
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const grp = back.data.options.find((o) => o.label === f.group);
  if (f.choice) {
    const got = grp?.choices?.find((c) => c.name === f.choice)?.imageSrc;
    if (got !== f.url) { console.error("อ่านกลับไม่ตรง (choice)", f.choice, got); process.exit(1); }
  }
  if (f.groupNote && grp.noteImageSrc !== f.url) { console.error("อ่านกลับไม่ตรง (noteImageSrc)", f.group, grp.noteImageSrc); process.exit(1); }
}
console.log(`✓ ตั้งภาพครบ ${files.length} จุด อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);

#!/usr/bin/env node
/**
 * เตรียมภาพประกอบตัวเลือกของสินค้า "สแตนดี้ตั้งโทรศัพท์ (แบบฐานดัดง้อ)" — แบบที่ 5
 * ต้นทาง: iduckyofficial-pricelists.com/standyphonebase
 *
 *   node scripts/phone-base-bend-art.mjs [--out=<dir>]
 *
 * ได้ 3 ชุด แล้วให้ scripts/add-phone-base-bend.ts อัปขึ้น Supabase Storage:
 *   1. gallery-1..4   ภาพงานจริงจากเว็บตารางราคา (หัวข้อ "ตัวอย่าง สแตนดี้ที่ตั้งโทรศัพท์ (แบบฐานดัดง้อ) แบบที่ 5")
 *   2. bend-points    ภาพอธิบาย "จุดดัดงอ 3 จุด" + ขนาด (สูง 14 ซม. · ฐานกว้าง 8 ซม.)
 *   3. clear          ภาพประกอบตัวเลือก "อะคริลิคใส" (สีพิเศษใช้ชาร์ตชุดกลาง acrylic-colors.mjs)
 *
 * สินค้านี้มี "ขนาดเดียว" (สูง 14 ซม.) จึงไม่มีชุดภาพขนาดให้ติดปุ่มตัวเลือกเหมือนสินค้าตัวอื่น
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขยับ REV ใน add-phone-base-bend.ts เสมอ
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/phonebend/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const CACHE = ".cache/phonebend";
mkdirSync(CACHE, { recursive: true });

const WIX = "https://static.wixstatic.com/media";
const UA = "Mozilla/5.0 (compatible; iDuckyStockSync/1.0)";

async function grab(file, url) {
  const p = `${CACHE}/${file}`;
  if (existsSync(p)) return p;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  await new Promise((r) => setTimeout(r, 250));
  return p;
}

// ── 1. ภาพงานจริง (แกลเลอรี) ───────────────────────────────────────────────
/** เรียงให้ภาพแรกเป็นภาพ "ตัวสินค้าเต็มตัว" เพราะใช้เป็นรูปหน้าการ์ดสินค้าด้วย */
const GALLERY = [
  "959b83_63aa34eed2e3421cb366af05363a5d12~mv2.jpg", // ตัวสินค้าเต็มตัว เห็นทั้ง 3 จุดดัด
  "959b83_e2671f6225764b04ae089b45839c6cec~mv2.jpg", // วางมือถือแนวตั้ง
  "959b83_cf286445e91c40f3b556d8af2ba72e5a~mv2.jpg", // วางมือถือแนวนอน
  "959b83_dd5806b637984178b0df0d92b5f547f1~mv2.jpg", // มุมข้าง เห็นองศาการดัด
];
for (const [i, id] of GALLERY.entries()) {
  const src = await grab(`src-g${i + 1}.jpg`, `${WIX}/${id}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  await sharp(src).resize(1100, 1100, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/gallery-${i + 1}.jpg`);
}
/** ภาพประกอบตัวเลือก "อะคริลิคใส" — ครอปจากภาพงานจริงใบแรกให้เป็นจัตุรัส เข้าชุดกับภาพสีอื่น */
await sharp(await grab("src-g1.jpg", `${WIX}/${GALLERY[0]}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`))
  .resize(700, 700, { fit: "cover" })
  .jpeg({ quality: 88 })
  .toFile(`${OUT}/clear.jpg`);

// ── 2. ภาพวาด SVG ─────────────────────────────────────────────────────────
const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const AMBER = "#f59e0b";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 20}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="30" font-weight="700" fill="${CYAN}">${label}</text>`;

const PX_PER_CM = 19.5; // 20cm = 390px (พอดีใต้หัวเรื่อง)
const GROUND = 548;
const MAX_CM = 20;
const BASE_CM = 8; // ฐานกว้าง 8 ซม. (ตามเว็บ)

/**
 * สัดส่วนตามแนวสูงของแผ่น (หน่วย ซม. วัดจากพื้น) — อ่านจากภาพงานจริงบนเว็บตารางราคา
 * ริมกันลื่น → ฐานวางเครื่อง → ช่วงยกเอียง → แผ่นหลังพิงเครื่อง
 * ความสูงที่เพิ่มขึ้นทั้งหมดไปลงที่ "แผ่นหลัง" (ฐานคงที่ 8 ซม. ทุกขนาด)
 */
const LIP_TOP = 0.35;
const BASE_TOP = 1.6;
const PANEL_BOTTOM = 3.2;
const PANEL_W = BASE_CM * 0.85;

/** ลายสกรีนจำลองบนแผ่นหลัง — บอกว่าพิมพ์เต็มแผ่นได้ */
const artwork = (cx, cy, w, h) => {
  const r = Math.min(w, h * 0.9);
  return `
  <g opacity="0.92">
    <circle cx="${cx - w * 0.16}" cy="${cy}" r="${r * 0.22}" fill="#fbbf24"/>
    <circle cx="${cx - w * 0.22}" cy="${cy - r * 0.05}" r="${r * 0.035}" fill="#0f172a"/>
    <circle cx="${cx - w * 0.08}" cy="${cy - r * 0.05}" r="${r * 0.035}" fill="#0f172a"/>
    <path d="M${cx - w * 0.2} ${cy + r * 0.1} q${r * 0.1} ${r * 0.08} ${r * 0.2} 0" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx + w * 0.2}" cy="${cy - h * 0.22}" rx="${r * 0.2}" ry="${r * 0.12}" fill="#ffffff"/>
    <ellipse cx="${cx + w * 0.08}" cy="${cy + h * 0.24}" rx="${r * 0.15}" ry="${r * 0.09}" fill="#ffffff"/>
  </g>`;
};

const PRINT = "#93c5fd";
const PRINT_WARM = "#fdba74";
const PRINT_BASE = "#fcd34d";

/** ── ภาพ "จุดดัดงอ 3 จุด" = มองจากด้านข้าง (เห็นองศาการดัด + มือถือที่พิง) ── */
const SIDE = (() => {
  const total = 14;
  const baseD = 4.9; // ความลึกฐานเมื่อมองจากข้าง
  const rise = 1.0;
  const lean = 0.7;
  return {
    total,
    pts: [
      { x: 0.3, y: 1.0 }, // ปลายบนริมกันลื่น
      { x: 0.6, y: 0 }, // ดัด 1
      { x: 0.6 + baseD, y: 0 }, // ดัด 2
      { x: 0.6 + baseD + rise, y: PANEL_BOTTOM }, // ดัด 3
      { x: 0.6 + baseD + rise + lean, y: total }, // ยอดแผ่นหลัง
    ],
  };
})();

function bendShot() {
  const SIDE_PX = 26; // มุมข้างแคบกว่ามุมหน้า — ขยายสเกลให้เต็มกรอบ
  const cx = W / 2 - 46;
  const spanX = SIDE.pts[4].x;
  const X = (v) => cx + (v - spanX / 2) * SIDE_PX;
  const Y = (v) => GROUND - v * SIDE_PX;
  const P = SIDE.pts.map((p) => ({ px: X(p.x), py: Y(p.y) }));
  const poly = (stroke, width) =>
    `<polyline points="${P.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")}"
       fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;

  // มือถือ: ก้นเครื่องอยู่ในร่องหลังริมกันลื่น แล้วเอนไปพิงแผ่นหลัง
  const foot = { x: P[1].px + 10, y: GROUND - 3 };
  const contact = { x: P[3].px + (P[4].px - P[3].px) * 0.66, y: P[3].py + (P[4].py - P[3].py) * 0.66 };
  const dx = contact.x - foot.x;
  const dy = contact.y - foot.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const tip = { x: foot.x + ux * len * 1.14, y: foot.y + uy * len * 1.14 };
  const th = 15;

  const labels = [
    { i: 1, t: "ดัดจุดที่ 1", s: "ริมกันเครื่องไหล", ax: -18, ay: 4, tx: -204, ty: -18 },
    { i: 2, t: "ดัดจุดที่ 2", s: "ยกแผ่นหลังขึ้น", ax: 14, ay: 6, tx: 56, ty: 12 },
    { i: 3, t: "ดัดจุดที่ 3", s: "ตั้งองศาพิงเครื่อง", ax: 16, ay: 0, tx: 46, ty: 6 },
  ];

  const topY = Y(SIDE.total);
  const dimX = W - 100; // ริมขวาสุด — พ้นป้ายชื่อจุดดัดที่ยื่นออกไปทางขวา
  const baseL = P[1].px;
  const baseR = P[2].px;
  return frame(`
    ${title("จุดดัดงอ 3 จุด", "อะคริลิคแผ่นเดียว ดัดขึ้นรูป ไม่ต้องประกอบ")}
    <line x1="70" y1="${GROUND + 6}" x2="${W - 70}" y2="${GROUND + 6}" stroke="#e2e8f0" stroke-width="4"/>
    <line x1="${dimX}" y1="${topY}" x2="${dimX}" y2="${GROUND}" stroke="${CYAN}" stroke-width="3"/>
    <line x1="${dimX - 12}" y1="${topY}" x2="${dimX + 12}" y2="${topY}" stroke="${CYAN}" stroke-width="3"/>
    <line x1="${dimX - 12}" y1="${GROUND}" x2="${dimX + 12}" y2="${GROUND}" stroke="${CYAN}" stroke-width="3"/>
    <text x="${dimX}" y="${topY - 16}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${CYAN}">14 ซม.</text>
    <line x1="${baseL}" y1="${GROUND + 34}" x2="${baseR}" y2="${GROUND + 34}" stroke="${LINE}" stroke-width="3"/>
    <line x1="${baseL}" y1="${GROUND + 25}" x2="${baseL}" y2="${GROUND + 43}" stroke="${LINE}" stroke-width="3"/>
    <line x1="${baseR}" y1="${GROUND + 25}" x2="${baseR}" y2="${GROUND + 43}" stroke="${LINE}" stroke-width="3"/>
    <text x="${(baseL + baseR) / 2}" y="${GROUND + 62}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ฐานกว้าง 8 ซม.</text>
    <g opacity="0.55">
      <polygon points="${foot.x},${foot.y} ${tip.x},${tip.y} ${tip.x + uy * th},${tip.y - ux * th} ${foot.x + uy * th},${foot.y - ux * th}"
        fill="#e2e8f0" stroke="#94a3b8" stroke-width="3" stroke-linejoin="round"/>
      <text x="${(foot.x + tip.x) / 2 - 46}" y="${(foot.y + tip.y) / 2}" font-family="${TH}" font-size="20" fill="#64748b" transform="rotate(-8 ${(foot.x + tip.x) / 2 - 46} ${(foot.y + tip.y) / 2})">มือถือ</text>
    </g>
    ${poly(GLASS_EDGE, 12)}
    ${poly("#e0f2fe", 5)}
    ${labels
      .map(({ i, t, s, ax, ay, tx, ty }) => {
        const p = P[i];
        const lx = p.px + tx;
        const ly = p.py + ty;
        return `<line x1="${p.px + ax}" y1="${p.py + ay}" x2="${lx + (tx < 0 ? 176 : 8)}" y2="${ly - 8}" stroke="${AMBER}" stroke-width="2"/>
                <circle cx="${p.px}" cy="${p.py}" r="12" fill="#ffffff" stroke="${AMBER}" stroke-width="6"/>
                <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700" fill="${AMBER}">${t}</text>
                <text x="${lx}" y="${ly + 26}" font-family="${TH}" font-size="20" fill="${SUB}">${s}</text>`;
      })
      .join("")}
    <text x="${W / 2}" y="${H - 46}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">พิมพ์ลายเต็มแผ่นทั้งฐานและแผ่นหลัง · วางได้ทั้งแนวตั้งและแนวนอน</text>
    <text x="${W / 2}" y="${H - 22}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${LINE}">ขนาดเป็นขนาดโดยประมาณ ขึ้นกับการดัดง้อ แต่ละชิ้นอาจไม่เท่ากัน</text>`);
}

const svgs = { "bend-points": bendShot() };
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}

console.log(`✅ ${GALLERY.length} ภาพงานจริง (+clear) · ${Object.keys(svgs).length} ภาพวาด → ${OUT}`);

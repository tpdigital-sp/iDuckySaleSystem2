#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "FOLDING FAN" (พัดพับ + ถุงเก็บพัด)
 *
 *   node scripts/folding-fan-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 2 ทาง:
 *
 * 1) รูปงานจริงจากหน้าตารางราคาของร้าน (บล็อก FOLDING FAN บน iduckyofficial-pricelists.com)
 *    เอามาวางเป็นภาพหลักของ "การ์ดตัวเลือก" พร้อมหัวข้อ/ราคา — ลูกค้าจะได้เห็นว่าเลือกแล้วได้อะไรจริง ๆ
 *    (ตัวพัดกับกล่องมาด้วยกันเสมอ · ถุงเก็บพัดเป็น Add-on ที่บวกเพิ่ม)
 *
 * 2) วาดเอง — การ์ดสเปกขนาด (พัด 24.5×24.5 · กล่อง 9.2×6 · ถุง 10×10)
 *    และการ์ดอธิบายสปริงพับเก็บ 3 สเต็ป
 *    รูปงานจริงไม่มีเส้นวัด/ป้ายบอกขนาด จึงวาดการ์ดอธิบายแทน ไม่แปะรูปแล้วเขียนตัวเลขทับ
 *
 * รูปงานจริงสำหรับ "แกลเลอรี" ไม่ได้ทำที่นี่ — folding-fan-apply.mjs ดึงจากหน้าเว็บให้เอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/folding-fan/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";

/** สเปกงานจริงตามหน้าตารางราคา — apply ทวนตัวเลขชุดนี้กับที่อ่านได้จากเว็บอีกที */
export const SPEC = {
  fan: { cm: [24.5, 24.5], sides: 1 },
  box: { cm: [9.2, 6], sides: 2 },
  bag: { cm: [10, 10] },
};

/** รูปงานจริงในบล็อก FOLDING FAN (id wixstatic — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง) */
const WIX = {
  fanHand: "959b83_e9bb5db69179461b85543af3329e4930", // มือถือพัดกางเต็มใบ + กล่องห้อยอยู่
  fanBox: "959b83_83cef0e30d86484ebfd5c2d628e8999a", // พัดกาง + กล่องโชว์ทั้งสองด้าน
  fanPair: "959b83_4fae48b1ed81449c8fbfdd450f50bca6", // พัดกาง + กล่อง 2 ใบ
  fanFlat: "959b83_50e396863b27465cb82b8aa5dd8ba089", // พัดวางแบน เห็นตัวกล่องพับติดอยู่
  bagHand: "959b83_8b9f510694104d64a4d8eaef18bcb73e", // มือถือพัดพับเก็บในกล่อง + ถุงผ้า
  bagHang: "959b83_c23bb45fae344de28751804ea3a78260", // ถุงผ้าห้อยกระเป๋า เห็นเชือก + ห่วง
  bagPack: "959b83_245e96ad5ff94653869d553e269ce6e4", // หยิบถุงใส่กระเป๋าเป้
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${812 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const save = (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};
const saveSvg = async (name, svg) =>
  save(name, await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const wixUrl = (id) => `https://static.wixstatic.com/media/${id}~mv2.png/v1/fit/w_1400,h_1400/x.png`;

/* ── 1. การ์ดตัวเลือก (รูปงานจริง + หัวข้อ) ───────────────────────── */

/**
 * การ์ดที่มีรูปงานจริงเรียงกลางกรอบ — ใช้กับตัวเลือก "ถุงเก็บพัด" ทั้งสองแบบ
 * contain ไม่ใช่ cover: รูปของร้านเป็นภาพจัดฉาก ครอปแล้วตัวสินค้าหาย
 */
async function photoCard(name, cardTitle, cardSub, ids, captions, notes) {
  const gap = 22;
  const tw = Math.min(Math.floor((760 - gap * (ids.length - 1)) / ids.length), 560);
  const thh = Math.min(Math.round(tw * 1.0), 470);
  const tiles = [];
  for (const id of ids) {
    tiles.push(
      await sharp(await get(wixUrl(id)))
        .flatten({ background: "#ffffff" })
        .resize({ width: tw, height: thh, fit: "contain", background: "#ffffff" })
        .toBuffer()
    );
  }
  const x0 = Math.round((W - (tw * ids.length + gap * (ids.length - 1))) / 2);
  const y0 = Math.round(180 + (520 - thh) / 2);
  const labels = captions
    .map(
      (c, i) =>
        `<text x="${x0 + i * (tw + gap) + tw / 2}" y="${y0 + thh + 44}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">${esc(c)}</text>`
    )
    .join("");
  const svg = frame(`${title(cardTitle, cardSub)}${labels}${foot(notes)}`);
  const buf = await sharp(Buffer.from(svg))
    .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

/** ราคาถุงส่งมาจาก apply (อ่านสดจากตารางเว็บ) — การ์ดจะได้ไม่บอกราคาผิดเวลาเว็บปรับ */
async function optionCards({ bagLow, bagHigh } = {}) {
  console.log("🖼  การ์ดตัวเลือกถุงเก็บพัด (รูปงานจริงจากเว็บ)");
  await photoCard(
    "bag-none",
    "รับเฉพาะพัดพับ",
    "ได้ตัวพัด + กล่องเก็บพัด (มาคู่กันเสมอ)",
    [WIX.fanBox, WIX.fanFlat],
    ["พัดกาง + กล่องเก็บ", "พับเก็บลงกล่องได้"],
    ["ราคาในตารางคือราคานี้ — ไม่บวกเพิ่ม", "กล่องเก็บพัดสกรีนลายได้ 2 ด้าน รวมอยู่ในราคาแล้ว"]
  );
  await photoCard(
    "bag-add",
    "เพิ่มถุงเก็บพัด",
    "ถุงผ้าใส่พัด — สกรีนลายได้ทั้งใบ",
    [WIX.bagHand, WIX.bagHang],
    ["ใส่พัดที่พับแล้วลงถุง", "ห้อยกระเป๋าได้ด้วยห่วงเงิน"],
    [
      bagLow && bagHigh ? `บวกเพิ่มใบละ ${bagHigh} บาท (สั่งเยอะเหลือใบละ ${bagLow} บาท)` : "บวกเพิ่มต่อใบตามจำนวนที่สั่ง",
      "ถุง 1 ใบต่อพัด 1 อัน — ราคาในตารางรวมค่าถุงให้แล้ว",
    ]
  );
}

/* ── 2. การ์ดสเปกขนาด (วาดเอง) ───────────────────────────────────── */

/** เส้นบอกขนาดพร้อมหัวลูกศรสองข้าง */
const dimH = (x1, x2, y, text) => `
  <g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x1} ${y} L ${x2} ${y}"/>
    <path d="M ${x1} ${y - 10} L ${x1} ${y + 10} M ${x2} ${y - 10} L ${x2} ${y + 10}"/>
  </g>
  <text x="${(x1 + x2) / 2}" y="${y + 36}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(text)}</text>`;

const dimV = (y1, y2, x, text) => `
  <g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x} ${y1} L ${x} ${y2}"/>
    <path d="M ${x - 10} ${y1} L ${x + 10} ${y1} M ${x - 10} ${y2} L ${x + 10} ${y2}"/>
  </g>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${esc(text)}</text>`;

/**
 * พัดกางเต็มใบ — ทรงกลมพร้อมกลีบพับ (สปริงที่กางออกเป็นวงกลม) และหมุดกลางที่ก้าน
 * r = รัศมี · pleats = จำนวนรอยพับที่วาด
 */
function fanOpen(cx, cy, r, { pleats = 22, fill = "#fde68a", edge = "#f59e0b" } = {}) {
  const spokes = Array.from({ length: pleats }, (_, i) => {
    const a = (i / pleats) * 360;
    const x = cx + r * 0.94 * Math.cos((a * Math.PI) / 180);
    const y = cy + r * 0.94 * Math.sin((a * Math.PI) / 180);
    return `<path d="M ${cx} ${cy} L ${x.toFixed(1)} ${y.toFixed(1)}" stroke="${edge}" stroke-width="1.6" opacity="0.35"/>`;
  }).join("");
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.94}" fill="none" stroke="${edge}" stroke-width="1.6" opacity="0.5"/>
    ${spokes}
    <circle cx="${cx}" cy="${cy}" r="${r * 0.12}" fill="#ffffff" stroke="${edge}" stroke-width="3"/>
  </g>`;
}

/** กล่องเก็บพัด — ทรงครึ่งวงกลมปลายมน มีหมุดกดตรงกลางด้านบน */
function fanBox(cx, cy, w, h, { fill = "#bbf7d0", edge = "#16a34a" } = {}) {
  return `<g>
    <path d="M ${cx - w / 2} ${cy - h / 2} L ${cx + w / 2} ${cy - h / 2} L ${cx + w / 2} ${cy + h / 2 - h * 0.34}
             Q ${cx + w / 2} ${cy + h / 2} ${cx + w / 2 - w * 0.2} ${cy + h / 2}
             L ${cx - w / 2 + w * 0.2} ${cy + h / 2}
             Q ${cx - w / 2} ${cy + h / 2} ${cx - w / 2} ${cy + h / 2 - h * 0.34} Z"
      fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy - h / 2 + 6}" r="15" fill="#ffffff" stroke="${edge}" stroke-width="3"/>
  </g>`;
}

/** ถุงผ้า — ปากถุงพับ + สายผ้าสีขาว + ห่วงกลมสีเงินคล้องอยู่ปลายสาย (ตามงานจริง) */
function pouch(cx, cy, w, h, { fill = "#a7f3d0", edge = "#0d9488" } = {}) {
  const top = cy - h / 2;
  return `<g>
    <circle cx="${cx}" cy="${top - 92}" r="21" fill="none" stroke="#94a3b8" stroke-width="7"/>
    <rect x="${cx - 17}" y="${top - 84}" width="34" height="88" rx="9" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <path d="M ${cx - w / 2} ${top + h * 0.26} L ${cx + w / 2} ${top + h * 0.26}" stroke="${edge}" stroke-width="2.5" opacity="0.7"/>
  </g>`;
}

async function specCards() {
  console.log("🖼  การ์ดสเปกขนาด (วาดเอง — สัดส่วนตามขนาดจริง)");

  // พัด 24.5 × 24.5 ซม. · สกรีน 1 ด้าน
  const r = 208;
  await saveSvg(
    "spec-fan",
    frame(`
      ${title(`ตัวพัด ${SPEC.fan.cm[0]} × ${SPEC.fan.cm[1]} ซม.`, `กางออกเป็นวงกลม · สกรีนลาย ${SPEC.fan.sides} ด้าน`)}
      ${fanOpen(470, 410, r)}
      ${dimH(470 - r, 470 + r, 410 + r + 54, `${SPEC.fan.cm[0]} ซม.`)}
      ${dimV(410 - r, 410 + r, 470 - r - 44, `${SPEC.fan.cm[1]} ซม.`)}
      ${foot(["สกรีนลายด้านหน้าด้านเดียว — อีกด้านเป็นสีพื้นของวัสดุ", "ภาพวาดอธิบายสัดส่วน ไม่ใช่ลายจริง"])}`)
  );

  // กล่อง 9.2 × 6 ซม. · สกรีน 2 ด้าน — วาดสองใบเทียบหน้า/หลัง เส้นวัดกำกับใบซ้าย
  const bw = 300;
  const bh = Math.round((bw * SPEC.box.cm[1]) / SPEC.box.cm[0]);
  const bx = 285;
  const by = 400;
  await saveSvg(
    "spec-box",
    frame(`
      ${title(`กล่องเก็บพัด ${SPEC.box.cm[0]} × ${SPEC.box.cm[1]} ซม.`, `สกรีนลายได้ ${SPEC.box.sides} ด้าน — รวมอยู่ในราคาพัดแล้ว`)}
      ${fanBox(bx, by, bw, bh)}
      ${fanBox(W - bx, by, bw, bh, { fill: "#dcfce7" })}
      <text x="${bx}" y="${by + bh / 2 + 52}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
      <text x="${W - bx}" y="${by + bh / 2 + 52}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหลัง</text>
      ${dimH(bx - bw / 2, bx + bw / 2, by + bh / 2 + 110, `${SPEC.box.cm[0]} ซม.`)}
      ${dimV(by - bh / 2, by + bh / 2, bx - bw / 2 - 40, `${SPEC.box.cm[1]} ซม.`)}
      ${foot(["ตัวพัดพับเก็บลงกล่องใบนี้ได้พอดี", "กล่องมาพร้อมพัดทุกอัน ไม่ได้คิดเงินเพิ่ม"])}`)
  );

  // ถุง 10 × 10 ซม. + สายผ้าขาว + ห่วงเงิน
  const pw = 300;
  await saveSvg(
    "spec-bag",
    frame(`
      ${title(`ถุงเก็บพัด ${SPEC.bag.cm[0]} × ${SPEC.bag.cm[1]} ซม.`, "ถุงผ้า + เชือกสีขาว + ห่วงกลมสีเงิน 1 อัน")}
      ${pouch(450, 480, pw, pw)}
      ${dimH(450 - pw / 2, 450 + pw / 2, 480 + pw / 2 + 46, `${SPEC.bag.cm[0]} ซม.`)}
      ${dimV(480 - pw / 2, 480 + pw / 2, 450 - pw / 2 - 40, `${SPEC.bag.cm[1]} ซม.`)}
      <g stroke="#94a3b8" stroke-width="2" fill="none">
        <path d="M 476 238 L 600 238"/>
        <path d="M 476 290 L 600 290"/>
      </g>
      <text x="610" y="246" font-family="${TH}" font-size="23" fill="${SUB}">ห่วงกลมสีเงิน</text>
      <text x="610" y="298" font-family="${TH}" font-size="23" fill="${SUB}">เชือกสีขาว</text>
      ${foot(["เป็นตัวเลือกเสริม (Add-on) — สั่งเพิ่มได้ในหน้าสินค้า", "สกรีนลายบนถุงได้ · ห้อยกระเป๋า/เป้ได้ด้วยห่วงเงิน"])}`)
  );
}

/* ── 3. การ์ดสปริงพับเก็บ (วาดเอง) ───────────────────────────────── */

/** พัดกางครึ่งใบ — ใช้วาดสเต็ปกลางของการพับ */
function fanHalf(cx, cy, r, deg) {
  const a0 = -90 - deg / 2;
  const a1 = -90 + deg / 2;
  const p = (a, rad) => [(cx + rad * Math.cos((a * Math.PI) / 180)).toFixed(1), (cy + rad * Math.sin((a * Math.PI) / 180)).toFixed(1)];
  const [x1, y1] = p(a0, r);
  const [x2, y2] = p(a1, r);
  return `<g>
    <path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x2} ${y2} Z"
      fill="#fde68a" stroke="#f59e0b" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="13" fill="#ffffff" stroke="#f59e0b" stroke-width="3"/>
  </g>`;
}

async function foldCard() {
  console.log("🖼  การ์ดสปริงพับเก็บ (วาดเอง)");
  const steps = [
    { cx: 190, label: "1. กางใช้งาน", sub: "สปริงดีดเป็นวงกลม", deg: 360 },
    { cx: 450, label: "2. บิดพับ", sub: "หมุนม้วนเข้าหากัน", deg: 200 },
    { cx: 710, label: "3. เก็บลงกล่อง", sub: "พกในกระเป๋าได้เลย", deg: 0 },
  ];
  const art = steps
    .map((s) =>
      s.deg === 360 ? fanOpen(s.cx, 420, 104) : s.deg === 0 ? fanBox(s.cx, 420, 200, 130) : fanHalf(s.cx, 478, 108, s.deg)
    )
    .join("");
  const labels = steps
    .map(
      (s) => `<text x="${s.cx}" y="600" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${esc(s.label)}</text>
      <text x="${s.cx}" y="638" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(s.sub)}</text>`
    )
    .join("");
  const arrows = [320, 580]
    .map(
      (x) => `<path d="M ${x - 22} 420 L ${x + 22} 420" stroke="${SUB}" stroke-width="4" stroke-linecap="round"/>
      <path d="M ${x + 8} 406 L ${x + 24} 420 L ${x + 8} 434" stroke="${SUB}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join("");
  await saveSvg(
    "spring-fold",
    frame(`
      ${title("มีสปริง พับเก็บลงกล่องได้", "กางใช้งานง่าย เก็บแล้วไม่กินที่")}
      ${art}${arrows}${labels}
      ${foot(["ตัวพัดเป็นสปริง กางออกเองเมื่อปล่อยจากกล่อง", "ภาพวาดอธิบายวิธีใช้งาน ไม่ใช่ลายจริง"])}`)
  );
}

/* ── รัน ─────────────────────────────────────────────────────────── */

/** apply เรียกใช้ซ้ำได้ (ส่งราคาถุงที่อ่านจากเว็บเข้ามา) — รันตรง ๆ ก็ได้การ์ดครบเหมือนกัน */
export async function buildArt(opts = {}) {
  console.log(`📁 ${OUT}`);
  await optionCards(opts);
  await specCards();
  await foldCard();
  return OUT;
}

export const ART_FILES = ["bag-none", "bag-add", "spec-fan", "spec-box", "spec-bag", "spring-fold"];
export { WIX };

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildArt();
  console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/folding-fan-apply.mjs --write");
}

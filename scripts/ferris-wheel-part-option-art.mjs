#!/usr/bin/env node
/**
 * ชิงช้าสวรรค์อะคริลิค (acrylic-ferris-wheel) — ภาพประกอบตัวเลือก 4 กลุ่มชิ้นส่วน (8 ใบ)
 *
 *   node scripts/ferris-wheel-part-option-art.mjs           (วาดลง .cache/ferris-wheel/parts ดูก่อน)
 *   node scripts/ferris-wheel-part-option-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * 4 กลุ่มชิ้นส่วน (ตัวห้อย · แกนกลาง · เสาตั้ง · ฐาน) กลุ่มละ 2 ตัวเลือกเหมือนกัน:
 *   "อะคริลิคสีพิเศษ บวกเพิ่ม…"  → ภาพชิ้นนั้น "ผ่าครึ่ง" ซ้ายเนื้อใส ขวาเนื้อสีพิเศษ เทียบกันในชิ้นเดียว
 *   "สกรีน2ด้าน บวกเพิ่ม…"       → ภาพชิ้นนั้นวางคู่ ด้านหน้า-ด้านหลัง มีลายทั้งสองหน้า + ลูกศรพลิก
 * ทุกใบมี "ผังชิ้นส่วน" มุมซ้ายล่าง ไฮไลต์ว่าชิ้นไหนของชิงช้าสวรรค์ (กลุ่มมี 4 กลุ่มหน้าตาคล้ายกัน)
 *
 * ⚠️ ปุ่มกลุ่มติ๊กหลายอย่างย่อรูปเป็น "วงกลม 28 px" (ProductDetail.tsx — h-7 w-7 rounded-full object-cover)
 *    จุดต่างจึงต้องอยู่ "กลางภาพ" เสมอ: ผ่าครึ่งใส/สีพิเศษ กับรอยต่อหน้า-หลัง วางไว้กลางภาพพอดี
 *    (ผังชิ้นส่วน/หัวเรื่องอยู่ขอบ ถูกครอปทิ้งในวงกลม แต่กดแล้วแกลเลอรีเด้งภาพเต็มให้ดู)
 *
 * ราคาบวกเพิ่มบนภาพ "อ่านจาก DB ตอนรัน" ไม่ฮาร์ดโค้ด — ตัวเลขบนภาพกับบนปุ่มจะตรงกันเสมอ
 *
 * รันซ้ำได้: เขียนทับ imageSrc ตัวเดิม ไม่แตะโครงกลุ่ม/ตัวเลือก
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 360);

const PRODUCT_ID = "acrylic-ferris-wheel";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/ferris-wheel/parts").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const EDGE = "#e879a8";
const GHOST = "#cbd5e1";

/** ชิ้นส่วนทั้ง 4 — ชื่อกลุ่มใน DB ต้องตรงเป๊ะ ไม่งั้นสคริปต์หยุด */
const PARTS = [
  { key: "hanger", group: "ตัวห้อย / จำนวนไม่เกิน 6 ชิ้น (ขนาดไม่เกิน 4.5 cm (รวมรูเจาะ))", name: "ตัวห้อย", size: "ไม่เกิน 4.5 ซม. · ไม่เกิน 6 ชิ้น" },
  { key: "disc", group: "แกนกลาง (แผ่นทรงกลม หมุนได้)(ขนาด 13 cm.)", name: "แกนกลาง", size: "แผ่นทรงกลม Ø 13 ซม. หมุนได้" },
  { key: "post", group: "เสาตั้ง /จำนวน 2ชิ้น (ขนาด 14.8 x 9.6 cm)", name: "เสาตั้ง", size: "14.8 × 9.6 ซม. · 2 ชิ้นประกบ" },
  { key: "base", group: "ฐาน (ขนาด 9.5 x 5.5 cm)", name: "ฐาน", size: "9.5 × 5.5 ซม. · 1 ชิ้น" },
];

// ── อ่าน DB ก่อนวาด: เอาราคาบวกเพิ่มจริงมาปั๊มบนภาพ ────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const die = (m) => { console.error("✗", m); process.exit(1); };
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(`อ่าน ${PRODUCT_ID} ไม่สำเร็จ — ${readErr.message}`);
const data = structuredClone(row.data);

const SPECIAL_PREFIX = "อะคริลิคสีพิเศษ";
const TWOSIDE_PREFIX = "สกรีน2ด้าน";
for (const p of PARTS) {
  const opt = (data.options ?? []).find((o) => o.label === p.group);
  if (!opt) die(`ไม่เจอกลุ่ม "${p.group}"`);
  p.special = opt.choices.find((c) => c.name.startsWith(SPECIAL_PREFIX));
  p.twoSide = opt.choices.find((c) => c.name.startsWith(TWOSIDE_PREFIX));
  if (!p.special || !p.twoSide) die(`กลุ่ม "${p.group}" ไม่ครบ 2 ตัวเลือก (มี: ${opt.choices.map((c) => c.name).join(", ")})`);
  // ตัวเลือกที่ระบุจำนวนได้ = คิดต่อชิ้น ต้องบอกให้ชัดบนภาพว่าคูณตามจำนวนชิ้น
  p.specialPer = p.special.qty ? "ต่อชิ้น" : "";
  p.twoSidePer = p.twoSide.qty ? "ต่อชิ้น" : "";
}

// ── ชิ้นส่วนแต่ละแบบ วาดในกรอบ 1 หน่วย (คืน <path>/<g> ที่ fill ได้) ────
/** ตัวห้อย — ชิ้นไดคัทกลมพร้อมรูเจาะด้านบน */
const hangerShape = (s) => `<circle cx="0" cy="0" r="${s}" />`;
/** แกนกลาง — แผ่นทรงกลม */
const discShape = (s) => `<circle cx="0" cy="0" r="${s}" />`;
/** เสาตั้ง — ทรงรูกุญแจ (หัวกลม + ฐานผายออก) ตามของจริง */
const postShape = (s) => {
  const hw = s * 0.65;      // ครึ่งความกว้างที่ฐาน
  const hr = s * 0.30;      // รัศมีหัวกลม
  const top = -s;
  const cy = top + hr;
  return `<path d="M ${-hw} ${s} L ${-hr * 0.62} ${cy + hr * 0.78}
    A ${hr} ${hr} 0 1 1 ${hr * 0.62} ${cy + hr * 0.78} L ${hw} ${s} Z" />`;
};
/** ฐาน — แผ่นสี่เหลี่ยมมุมมน มีร่องเสียบกลางแผ่น */
const baseShape = (s) => `<rect x="${-s}" y="${-s * 0.58}" width="${s * 2}" height="${s * 1.16}" rx="${s * 0.16}" />`;
const SHAPE = { hanger: hangerShape, disc: discShape, post: postShape, base: baseShape };

/** รายละเอียดที่วาดทับชิ้นส่วน (ซี่ล้อ/ดุม/ร่องเสียบ) — สื่อว่าเป็นชิ้นไหน */
const detail = (key, s) => {
  if (key === "disc") {
    const spokes = [0, 60, 120, 180, 240, 300].map((d) => {
      const a = (d * Math.PI) / 180;
      return `<line x1="0" y1="0" x2="${(s * 0.9 * Math.cos(a)).toFixed(1)}" y2="${(s * 0.9 * Math.sin(a)).toFixed(1)}" stroke="#ffffff" stroke-width="7" opacity="0.85"/>`;
    }).join("");
    return `${spokes}<circle cx="0" cy="0" r="${s * 0.14}" fill="#ffffff" stroke="${EDGE}" stroke-width="3"/><circle cx="0" cy="0" r="${s * 0.05}" fill="${EDGE}"/>`;
  }
  if (key === "hanger") return `<circle cx="0" cy="${-s * 0.78}" r="${s * 0.13}" fill="#ffffff" stroke="${EDGE}" stroke-width="4"/>`;
  if (key === "base") return `<rect x="${-s * 0.62}" y="${-s * 0.1}" width="${s * 1.24}" height="${s * 0.2}" rx="${s * 0.1}" fill="#ffffff" opacity="0.9" stroke="${EDGE}" stroke-width="2.5"/>`;
  return `<line x1="${-s * 0.42}" y1="${s * 0.86}" x2="${s * 0.42}" y2="${s * 0.86}" stroke="#ffffff" stroke-width="6" opacity="0.7"/>`;
};

/** ลายลูกค้า (มาสคอตแทน) วางกลางชิ้น — mirror = พลิกซ้าย-ขวาเหมือนมองจากด้านหลัง */
const artOn = (s, mirror = false, opacity = 1) => {
  const ah = s * (mirror ? 0.86 : 0.9);
  const aw = ah * MASCOT.ratio;
  return `<g transform="${mirror ? "scale(-1 1)" : ""}" opacity="${opacity}">
    <image href="${MASCOT.uri}" x="${-aw / 2}" y="${-ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
};

/** กลิตเตอร์/ดาว ตำแหน่งตายตัว (ไม่สุ่ม จะได้วาดซ้ำได้เหมือนเดิม) */
const glitter = (x0, y0, w0, h0, n, step) => {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = x0 + (((i * step) % 97) / 97) * w0;
    const y = y0 + (((i * (step + 17)) % 89) / 89) * h0;
    const r = 2.4 + ((i * 5) % 4);
    out += i % 3 === 0
      ? `<path d="M ${x} ${y - r * 2} L ${x + r * 0.6} ${y - r * 0.6} L ${x + r * 2} ${y} L ${x + r * 0.6} ${y + r * 0.6} L ${x} ${y + r * 2} L ${x - r * 0.6} ${y + r * 0.6} L ${x - r * 2} ${y} L ${x - r * 0.6} ${y - r * 0.6} Z" fill="#ffffff" opacity="0.9"/>`
      : `<circle cx="${x}" cy="${y}" r="${r * 0.8}" fill="#ffffff" opacity="0.75"/>`;
  }
  return out;
};

/** เวทีภาพ (กรอบที่ชิ้นงานอยู่) — ลายไม้/ชิ้นส่วนถูกครอปในกรอบนี้ ไม่ล้นการ์ด */
const STAGE = { x: 46, y: 204, w: 808, h: 486 };
const CY = STAGE.y + STAGE.h / 2;

/** ผังชิ้นส่วนย่อ มุมซ้ายล่าง — ไฮไลต์ว่ากลุ่มนี้พูดถึงชิ้นไหนของชิงช้าสวรรค์ */
function miniMap(activeKey) {
  const BX = 46, BY = 700, BW = 150, BH = 150; // กล่องผัง
  const K = 6.4;                                // px ต่อ 1 ซม. (ย่อจากสเกลจริง 22)
  const ox = BX + BW / 2;
  const groundY = BY + BH - 12;
  const baseH = 6;
  const baseTop = groundY - baseH;
  const headR = 2.35 * K;
  const postTop = baseTop - 14.8 * K;
  const pivotY = postTop + headR;
  const discR = 6.5 * K;
  const hangR = 2.25 * K;
  const on = (key) => (key === activeKey ? EDGE : GHOST);
  const wide = (key) => (key === activeKey ? 3 : 1.8);
  const fill = (key) => (key === activeKey ? "#fce7f3" : "#f1f5f9");
  const hangs = [90, 30, -30, -90, -150, 150].map((d) => {
    const a = (d * Math.PI) / 180;
    return { x: ox + discR * Math.cos(a), y: pivotY - discR * Math.sin(a) + hangR * 0.9 };
  });
  return `
  <rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="18" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
  <path d="M ${ox - 4.8 * K} ${baseTop} L ${ox - headR * 0.62} ${pivotY + headR * 0.78}
    A ${headR} ${headR} 0 1 1 ${ox + headR * 0.62} ${pivotY + headR * 0.78} L ${ox + 4.8 * K} ${baseTop} Z"
    fill="${fill("post")}" stroke="${on("post")}" stroke-width="${wide("post")}"/>
  <circle cx="${ox}" cy="${pivotY}" r="${discR}" fill="${fill("disc")}" fill-opacity="0.9" stroke="${on("disc")}" stroke-width="${wide("disc")}"/>
  ${hangs.map((h) => `<circle cx="${h.x}" cy="${h.y}" r="${hangR}" fill="#ffffff" stroke="${on("hanger")}" stroke-width="${wide("hanger")}"/>`).join("")}
  <rect x="${ox - 4.75 * K}" y="${baseTop}" width="${9.5 * K}" height="${baseH}" rx="3"
    fill="${fill("base")}" stroke="${on("base")}" stroke-width="${wide("base")}"/>
  <text x="${ox}" y="${BY + BH + 26}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${SUB}">ชิ้นที่เลือกอยู่</text>`;
}

/** หัวเรื่อง 2 บรรทัด + ป้ายราคาฝั่งขวา */
const header = (title, sub, badge, tone) => `
  <text x="46" y="74" font-family="${TH}" font-size="36" font-weight="700" fill="${INK}">${title}</text>
  <text x="46" y="112" font-family="${TH}" font-size="22" fill="${SUB}">${sub}</text>
  <rect x="${W - 46 - 206}" y="42" width="206" height="50" rx="25" fill="${tone.bg}" stroke="${tone.edge}" stroke-width="2.5"/>
  <text x="${W - 46 - 103}" y="76" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${tone.ink}">${badge}</text>`;

/** บรรทัดคำอธิบายท้ายภาพ (ขวาของผังชิ้นส่วน) */
const notes = (lines) => `<g font-family="${TH}" font-size="20" fill="${SUB}">
  ${lines.map((t, i) => `<text x="220" y="${744 + i * 32}">${t}</text>`).join("")}
</g>`;

/** พื้นหลังลายไม้ในเวที — ของจริงที่ทะลุ "เนื้อใส" ขึ้นมาให้เห็น (แพตเทิร์นเดียวกับคลังกลาง) */
const woodBand = () => {
  let out = `<rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" fill="#e0c4a1"/>`;
  for (let i = 0; i * 26 < STAGE.h; i++)
    out += `<rect x="${STAGE.x}" y="${STAGE.y + 8 + i * 26}" width="${STAGE.w}" height="13" fill="#b98a5c" opacity="${i % 2 ? 0.5 : 0.26}"/>`;
  return out;
};

/**
 * ภาพ "อะคริลิคสีพิเศษ" — ชิ้นเดียวผ่าครึ่งกลางภาพ
 *   ซ้าย = เนื้อใส (ลายไม้ทะลุขึ้นมา)  ·  ขวา = เนื้อสีพิเศษ (กลิตเตอร์/โฮโลแกรม ทึบ ไม่ทะลุ)
 * รอยผ่าอยู่กลางภาพพอดี — ปุ่มติ๊กย่อเป็นวงกลม 28 px ก็ยังเห็นทั้งสองเนื้อ
 */
function specialArt(part) {
  const s = 196;
  const cx = W / 2;
  const shape = SHAPE[part.key](s);
  const per = part.specialPer ? ` ${part.specialPer}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="0.3" stop-color="#f0abfc"/>
      <stop offset="0.6" stop-color="#67e8f9"/><stop offset="1" stop-color="#fbcfe8"/>
    </linearGradient>
    <clipPath id="stage"><rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" rx="24"/></clipPath>
    <clipPath id="half-l"><rect x="${STAGE.x}" y="${STAGE.y}" width="${cx - STAGE.x}" height="${STAGE.h}"/></clipPath>
    <clipPath id="half-r"><rect x="${cx}" y="${STAGE.y}" width="${STAGE.x + STAGE.w - cx}" height="${STAGE.h}"/></clipPath>
    <clipPath id="piece" transform="translate(${cx} ${CY})">${shape}</clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${header(`${part.name} — อะคริลิคสีพิเศษ`, `${part.size}`,
    `+฿${part.special.extra}${per}`, { bg: "#fdf2f8", edge: "#fbcfe8", ink: "#be185d" })}

  <!-- ป้ายบอกว่าครึ่งไหนคือเนื้ออะไร -->
  <g font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle">
    <rect x="${cx - 236}" y="146" width="216" height="46" rx="23" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <text x="${cx - 128}" y="177" fill="${SUB}">อะคริลิคใส</text>
    <rect x="${cx + 20}" y="146" width="216" height="46" rx="23" fill="#fdf2f8" stroke="#fbcfe8" stroke-width="2"/>
    <text x="${cx + 128}" y="177" fill="#be185d">อะคริลิคสีพิเศษ</text>
  </g>

  <g clip-path="url(#stage)">
    ${woodBand()}
    <!-- ครึ่งซ้าย: เนื้อใส (มองทะลุเห็นลายไม้) -->
    <g clip-path="url(#half-l)">
      <g transform="translate(${cx} ${CY})" fill="#eaf6fd" fill-opacity="0.16" stroke="#ffffff" stroke-width="7">${shape}</g>
      <g transform="translate(${cx} ${CY})">${detail(part.key, s)}${artOn(s * 0.82)}</g>
    </g>
    <!-- ครึ่งขวา: เนื้อสีพิเศษ (ทึบ + กลิตเตอร์) -->
    <g clip-path="url(#half-r)">
      <g transform="translate(${cx} ${CY})" fill="url(#holo)" stroke="#ffffff" stroke-width="7">${shape}</g>
      <g clip-path="url(#piece)">${glitter(cx - 10, CY - s, s + 30, s * 2, 44, 31)}</g>
      <g transform="translate(${cx} ${CY})">${detail(part.key, s)}${artOn(s * 0.82)}</g>
    </g>
    <line x1="${cx}" y1="${STAGE.y}" x2="${cx}" y2="${STAGE.y + STAGE.h}" stroke="#ffffff" stroke-width="5"/>
    <line x1="${cx}" y1="${STAGE.y}" x2="${cx}" y2="${STAGE.y + STAGE.h}" stroke="${INK}" stroke-width="2" stroke-dasharray="9 8"/>
  </g>
  <rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" rx="24" fill="none" stroke="#e2e8f0" stroke-width="2"/>

  ${miniMap(part.key)}
  ${notes([
    "เลือกเฉดต่อได้ที่กลุ่ม “สีอะคริลิค” (กลิตเตอร์ / โฮโลแกรม / สี)",
    "เนื้อสีพิเศษเป็นเนื้อทึบ ลายเด่นขึ้น แต่มองไม่ทะลุเหมือนเนื้อใส",
    "คิดเฉพาะชิ้นที่ติ๊ก ชิ้นอื่นในชุดยังเป็นเนื้อที่เลือกไว้",
  ])}
</svg>`;
}

/**
 * ภาพ "สกรีน 2 ด้าน" — ชิ้นเดียวกันวางคู่ ด้านหน้า | ด้านหลัง มีลายทั้งสองหน้า
 * รอยต่อ (ลูกศรพลิก) อยู่กลางภาพพอดี — วงกลม 28 px จะเห็นทั้งสองหน้า
 */
function twoSideArt(part) {
  const s = 148;
  const gap = 34;
  const lx = W / 2 - s - gap;
  const rx = W / 2 + s + gap;
  const cy = CY - 34;
  const shape = SHAPE[part.key](s);
  const per = part.twoSidePer ? ` ${part.twoSidePer}` : "";
  const tone = { bg: "#ecfeff", edge: "#a5f3fc", ink: OK };
  const face = (x, mirror, label) => `
    <g transform="translate(${x} ${cy})" fill="#fdf2f8" stroke="${EDGE}" stroke-width="6">${shape}</g>
    <g transform="translate(${x} ${cy})">${detail(part.key, s)}${artOn(s * 0.84, mirror)}</g>
    <rect x="${x - 108}" y="${cy + s + 30}" width="216" height="48" rx="24" fill="${tone.bg}" stroke="${tone.edge}" stroke-width="2"/>
    <text x="${x}" y="${cy + s + 62}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${tone.ink}">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${header(`${part.name} — สกรีน 2 ด้าน`, `${part.size}`, `+฿${part.twoSide.extra}${per}`, tone)}

  <rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
  ${face(lx, false, "ด้านหน้า")}
  ${face(rx, true, "ด้านหลัง")}

  <!-- ลูกศรพลิกกลางภาพ -->
  <g transform="translate(${W / 2} ${cy})">
    <circle cx="0" cy="0" r="56" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <path d="M -30 -13 A 32 32 0 1 1 -30 13" fill="none" stroke="${OK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M -30 13 l -2 -19 l 20 8 z" fill="${OK}"/>
    <text x="0" y="88" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${OK}">พลิกอีกด้าน</text>
  </g>

  ${miniMap(part.key)}
  ${notes([
    "ไม่ติ๊ก = สกรีน 1 ด้าน อีกด้านเป็นเนื้ออะคริลิคเปล่า",
    "ส่งลายมา 2 ไฟล์ (หน้า/หลัง) หรือใช้ลายเดิมพิมพ์ทั้งสองหน้าก็ได้",
    "คิดเฉพาะชิ้นที่ติ๊ก ชิ้นอื่นในชุดยังเป็นสกรีน 1 ด้าน",
  ])}
</svg>`;
}

// ── วาดทั้ง 8 ใบ ────────────────────────────────────────────────────
const BASE_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;
const jobs = [];
for (const part of PARTS) {
  for (const [kind, svg, choice] of [
    ["special", specialArt(part), part.special],
    ["2side", twoSideArt(part), part.twoSide],
  ]) {
    const file = `part-${part.key}-${kind}-${VER}.jpg`;
    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    writeFileSync(`${OUT}/${file}`, buf);
    // ย่อ 28 px แบบที่ปุ่มติ๊กเห็นจริง (ขยายกลับด้วย nearest ให้ตรวจด้วยตาได้)
    // ⚠️ ต่อ .resize() 2 ครั้งในไพป์ไลน์เดียวไม่ได้ — sharp ใช้ครั้งสุดท้ายครั้งเดียว ต้องคั่น toBuffer()
    const tiny = await sharp(buf).resize(28, 28).toBuffer();
    await sharp(tiny).resize(224, 224, { kernel: "nearest" }).toFile(`${OUT}/_thumb28-${part.key}-${kind}.jpg`);
    const key = `products/${PRODUCT_ID}/${file}`;
    jobs.push({ part, choice, file, key, buf, url: `${BASE_URL}/${key}` });
    console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${part.name} · ${kind}`);
  }
}
console.log(`🔎 ${OUT}/_thumb28-*.jpg — ย่อ 28 px แบบที่ปุ่มติ๊กเห็นจริง`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน imageSrc ────────────────────────────────────────
for (const j of jobs) {
  const { error } = await sb.storage.from("product-images").upload(j.key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัปโหลดพัง ${j.key} — ${error.message}`);
  j.choice.imageSrc = j.url;
}
console.log(`อัปโหลด ${jobs.length} ใบเรียบร้อย`);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) die(`update พัง/0 แถว — ${updErr?.message ?? ""}`);

// อ่านกลับมาเทียบทีละใบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of jobs) {
  const opt = back.data.options.find((o) => o.label === j.part.group);
  const got = opt?.choices.find((c) => c.name === j.choice.name);
  if (got?.imageSrc !== j.url) die(`อ่านกลับไม่ตรง: ${j.part.name} / ${j.choice.name}\n  ได้ ${got?.imageSrc}`);
}
console.log(`✓ ${jobs.length} ตัวเลือกใน ${PARTS.length} กลุ่ม มี imageSrc ตรงทุกใบ · savedAt =`, back.data.savedAt);

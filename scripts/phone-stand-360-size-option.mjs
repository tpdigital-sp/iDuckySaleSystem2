#!/usr/bin/env node
/**
 * 360° PHONE STAND (360-phone-stand) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/phone-stand-360-size-option.mjs           (วาดภาพลง .cache/360-phone-stand/upload ดูก่อน)
 *   node scripts/phone-stand-360-size-option.mjs --write   (+ อัปโหลด storage + เขียน options/rules + อ่านกลับเทียบ)
 *
 * ขนาดจากใบสเปคของสินค้าเอง (data.body + data.terms · ภาพหน้า-หลังพร้อมลูกศรวัด):
 *   ทรงรี (Oval)        — แผ่นพิมพ์ 7 × 12 ซม. ทรงโดมด้านบน · ฐานใสสี่เหลี่ยม
 *   ทรงสี่เหลี่ยม (Rect) — แผ่นพิมพ์ 6.8 × 10.5 ซม. สกรีนเต็มแผ่นถึงขอบ · ฐานกลม
 *     (8 × 13 ซม. บนใบสเปคคือ "แผ่นหลัง" ไม่ใช่กรอบขาวรอบลาย — ห้ามวาดเป็นขอบขาวรอบชิ้นงาน)
 * ทั้งคู่: ABS · สกรีน 1 ด้าน (หน้า) · แถบกันลื่นด้านบน + ที่ตั้งโทรศัพท์ใส 2 ตัวด้านล่าง · หมุน 360°
 *
 * ⚠️ ขนาดผูกกับรูปทรง 1:1 — ลูกค้าเลือกได้ทางเดียวเท่านั้น ไม่งั้นสั่งขัดกันเอง
 *   → ให้ "ขนาด" เป็นกลุ่มที่กด (การ์ด + ภาพ) แล้วใช้ OptionRule บังคับกลุ่ม "รูปทรง" ตามให้เอง
 *     (กลุ่มที่เหลือตัวเลือกเดียวจากกฎ ProductDetail โชว์เป็นบรรทัดล็อก 🔒 — ดังนั้นกลุ่มที่โดนล็อก
 *      ต้องเป็น "รูปทรง" ไม่ใช่ "ขนาด" ไม่งั้นการ์ด+ภาพที่วาดจะไม่ถูกแสดงเลย)
 *   → ทำด้วย "กลุ่มชื่อซ้ำ + showWhen" ไม่ได้ (initialSelections/allowedChoices คีย์ด้วยชื่อกลุ่ม)
 *
 * ราคา: pricing.driverLabels = [] (cells มีคีย์เดียว "") — กลุ่มใหม่จึงไม่ใช่แกนตารางราคา
 *   การ์ดไม่มี extra → ยอดเงินเท่าเดิมทุกช่วงจำนวน (290/250/235/220/200) · ยังเช็คซ้ำตอนอ่านกลับ
 *
 * ภาพ 900×900 วาดสเกลจริงเดียวกันทั้งสองใบ (1 ซม. = 42 px) วางชิ้นงานเต็มเฟรม
 * — การ์ด display "cards" ย่อภาพจัตุรัสทั้งใบเหลือ ~80 px จึงต้องอ่านออกจาก "เงาทรง + ป้ายขนาด"
 *   ไม่ใช่รายละเอียดเล็ก ๆ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด"/กฎเดิมอยู่แล้ว = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "360-phone-stand";
const VER = "v1";        // รุ่นของไฟล์สำรอง before-*.json
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SHAPE_GROUP = "รูปทรง";

/** ขนาด ↔ รูปทรง ผูกกัน 1:1 — ชื่อ shape ต้องตรงกับ choices ในกลุ่ม "รูปทรง" เป๊ะ ๆ */
const SIZES = [
  {
    key: "oval",
    ver: "v2",            // v2 = จัดบรรทัดท้ายภาพ/เส้นวัดใหม่ (เนื้อภาพเปลี่ยน = ต้องขึ้นรุ่น ห้ามอัปทับ v1)
    name: "7 × 12 ซม.",
    shape: "ทรงรี",
    title: "ทรงรี (Oval)",
    w: 7, h: 12,
    desc: "แผ่นพิมพ์ทรงโดมด้านบน 7 × 12 ซม. — พิมพ์เต็มหน้า 1 ด้าน · ฐานใสทรงสี่เหลี่ยม",
    foot: "ABS · สกรีน UV 1 ด้าน · แถบกันลื่นด้านบน + ที่ตั้งโทรศัพท์ใส 2 ตัว · หมุน 360°",
  },
  {
    key: "rect",
    ver: "v3",            // v3 = สกรีนเต็มชิ้นงาน ไม่มีส่วนขาวเลย (เจ้าของร้านสั่ง 4 ก.ย. 69)
                          //      v1 = แผ่นพิมพ์ลอยบนตัวเครื่องขาว · v2 = ตัดแถบขาวบนแผ่นพิมพ์ออก — ทั้งคู่ยัง "ขาวเกิน"
    name: "6.8 × 10.5 ซม.",
    shape: "ทรงสี่เหลี่ยม",
    title: "ทรงสี่เหลี่ยม (Rectangle)",
    w: 6.8, h: 10.5,
    desc: "แผ่นพิมพ์ทรงสี่เหลี่ยมมุมมน 6.8 × 10.5 ซม. — สกรีนเต็มแผ่นถึงขอบ 1 ด้าน · ฐานกลม",
    foot: "ABS · สกรีน UV เต็มแผ่น 1 ด้าน · ที่ตั้งโทรศัพท์ใส 2 ตัว · หมุนได้ 360°",
  },
];

const MASCOT = await mascotDataUri("heart", 460);

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 36;             // 1 ซม. = 36 px — สเกลเดียวกันทั้งสองใบ ให้เทียบขนาดกันได้จริง
const MIDY = 400;          // กึ่งกลางแนวตั้งของชิ้นงาน (ทั้งสองใบใช้ค่าเดียวกัน)
const dimY = (baseBottom) => Math.min(712, baseBottom + 42); // เส้นวัดด้านกว้าง เกาะใต้ฐานของแต่ละใบ
const PILLY = 788;         // ป้ายขนาดตัวใหญ่

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t) =>
  `<text x="${W / 2}" y="84" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 42 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const right = vertical && side === "right"; // ป้ายอยู่ขวาเส้น (เส้นวัดที่อยู่ขอบขวาชิ้นงาน)
  const lx = vertical ? x1 + (right ? 14 : -14) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? (right ? 0 : label.length * 12.5) : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? (right ? "start" : "end") : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ที่ตั้งโทรศัพท์ใส 2 ตัว + ตัวล็อกขาวตรงกลาง (มีเหมือนกันทั้งสองทรง)
 * วาดชิดขอบล่างของแผ่นพิมพ์ — ในของจริงเป็นอะคริลิคใสยื่นออกมารับตัวเครื่อง
 */
const rests = (cx, yBottom, panelW) => {
  const rw = panelW * 0.27, rh = rw * 0.86, gap = panelW * 0.1;
  const y = yBottom - rh - panelW * 0.045;
  const r = (x) => `
    <rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="${rw * 0.22}" fill="#e8f4f8" opacity="0.92" stroke="#ffffff" stroke-width="3"/>
    <rect x="${x + rw * 0.14}" y="${y + rh * 0.16}" width="${rw * 0.72}" height="${rh * 0.68}" rx="${rw * 0.14}" fill="#ffffff" opacity="0.85"/>`;
  return `${r(cx - gap / 2 - rw)}${r(cx + gap / 2)}
    <rect x="${cx - gap / 2 - 2}" y="${y + rh * 0.3}" width="${gap + 4}" height="${rh * 0.5}" rx="5" fill="#ffffff" opacity="0.9"/>`;
};

/** ป้ายขนาดตัวใหญ่ท้ายภาพ — สิ่งเดียวที่ยังอ่านออกตอนย่อการ์ดเหลือ 80 px */
const sizePill = (label, y) => {
  const lw = label.length * 27 + 80;
  return `
    <rect x="${(W - lw) / 2}" y="${y - 38}" width="${lw}" height="76" rx="38" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3.5"/>
    <text x="${W / 2}" y="${y + 18}" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;
};

/** นิยามร่วม: ลายพิมพ์ · เงา · ผิวอะคริลิคใส */
const defs = `
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d8f2f8"/>
      <stop offset="0.55" stop-color="#bfe8f4"/>
      <stop offset="1" stop-color="#a7dcee"/>
    </linearGradient>
    <linearGradient id="abs" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#fdfefe"/>
      <stop offset="1" stop-color="#dbe4ea"/>
    </linearGradient>
    <linearGradient id="grip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef4f7"/>
    </linearGradient>
    <pattern id="confetti" width="74" height="74" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="16" r="5" fill="#ffffff" opacity="0.55"/>
      <circle cx="52" cy="44" r="3.4" fill="#ffffff" opacity="0.5"/>
      <circle cx="30" cy="62" r="2.4" fill="#ffffff" opacity="0.45"/>
    </pattern>
  </defs>`;

/** ตราหมุน 360° มุมบนขวาของแผ่น — วงแหวนลูกศรล้อมตัวเลข (เส้นไม่พาดทับตัวหนังสือ) */
const badge360 = (cx, cy) => {
  const R = 31;
  const a = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = a(140), [ex, ey] = a(70);
  // หัวลูกศรที่ปลายเส้น ชี้ไปตามแนวสัมผัสวงกลม (ทวนเข็ม) — ไม่ใช่สามเหลี่ยมลอย
  const tx = Math.sin((70 * Math.PI) / 180), ty = -Math.cos((70 * Math.PI) / 180);
  const head = [[ex + tx * 13, ey + ty * 13], [ex - ty * 9 - tx * 4, ey + tx * 9 - ty * 4], [ex + ty * 9 - tx * 4, ey - tx * 9 - ty * 4]]
    .map(([x, y]) => `${x} ${y}`).join(" L ");
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="45" fill="#ffffff" opacity="0.96" stroke="${OK}" stroke-width="3"/>
    <path d="M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}" fill="none" stroke="${OK}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M ${head} Z" fill="${OK}"/>
    <text x="${cx}" y="${cy + 7}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${OK}">360°</text>
  </g>`;
};

/** ทรงรี — แผ่นพิมพ์โดมด้านบน 7 × 12 ซม. ทั้งใบคือพื้นที่พิมพ์ */
function ovalArt(s) {
  const pw = s.w * CM, ph = s.h * CM;               // 294 × 504
  const cx = W / 2, y0 = MIDY - ph / 2, y1 = y0 + ph;
  const x0 = cx - pw / 2, x1 = cx + pw / 2;
  const dome = pw * 0.5;                            // รัศมีโดนหัว = ครึ่งความกว้าง
  const rb = pw * 0.13;                             // มุมล่างมน
  const path = `M ${x0} ${y0 + dome}
    A ${dome} ${dome} 0 0 1 ${x1} ${y0 + dome}
    L ${x1} ${y1 - rb} A ${rb} ${rb} 0 0 1 ${x1 - rb} ${y1}
    L ${x0 + rb} ${y1} A ${rb} ${rb} 0 0 1 ${x0} ${y1 - rb} Z`;
  const r = MASCOT.ratio, ah = ph * 0.42, aw = ah * r;

  return frame(`
    ${title(s.title)}
    ${defs}
    <path d="${path}" transform="translate(8,14)" fill="#0f172a" opacity="0.08"/>
    <path d="${path}" fill="url(#print)" stroke="#cfe3ea" stroke-width="3"/>
    <clipPath id="clipOval"><path d="${path}"/></clipPath>
    <g clip-path="url(#clipOval)">
      <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="url(#confetti)"/>
      <!-- แถบกันลื่นขาวคาดหัวโดม -->
      <path d="M ${x0} ${y0 + dome} A ${dome} ${dome} 0 0 1 ${x1} ${y0 + dome} L ${x1} ${y0 + dome * 0.72} L ${x0} ${y0 + dome * 0.72} Z"
        fill="url(#grip)" stroke="#e2e8f0" stroke-width="2"/>
      <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${MIDY - ah / 2 - ph * 0.03}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
      ${rests(cx, y1, pw)}
    </g>
    ${badge360(x1 - 4, y0 + dome * 0.62)}

    <!-- ฐานใสทรงสี่เหลี่ยม + ก้านพับ (ของจริงพับเก็บได้ หมุนรอบตัว) -->
    <rect x="${cx - pw * 0.36}" y="${y1 + 12}" width="${pw * 0.72}" height="${pw * 0.21}" rx="14"
      fill="#eaf4f8" stroke="#d5e6ec" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${y1 + 12 + pw * 0.105}" rx="${pw * 0.15}" ry="${pw * 0.065}" fill="#ffffff" stroke="#dbe6ec" stroke-width="2.5"/>

    ${dim(x0, dimY(y1 + 12 + pw * 0.21), x1, dimY(y1 + 12 + pw * 0.21), `${s.w} ซม.`)}
    ${dim(x0 - 44, y0, x0 - 44, y1, `${s.h} ซม.`)}

    ${sizePill(s.name, PILLY)}
    ${foot([s.foot])}`);
}

/** ทรงสี่เหลี่ยม — แผ่นพิมพ์ 6.8 × 10.5 ซม. สกรีนเต็มแผ่นถึงขอบ ไม่มีขอบขาว */
function rectArt(s) {
  const pw = s.w * CM, ph = s.h * CM;               // 244.8 × 378
  const cx = W / 2, y0 = MIDY - ph / 2, y1 = y0 + ph;
  const x0 = cx - pw / 2, x1 = cx + pw / 2;
  const rr = pw * 0.11;
  const r = MASCOT.ratio, ah = ph * 0.45, aw = ah * r;

  return frame(`
    ${title(s.title)}
    ${defs}
    <rect x="${x0 + 7}" y="${y0 + 13}" width="${pw}" height="${ph}" rx="${rr}" fill="#0f172a" opacity="0.08"/>
    <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" rx="${rr}" fill="url(#print)" stroke="#cfe3ea" stroke-width="3"/>
    <clipPath id="clipRect"><rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" rx="${rr}"/></clipPath>
    <g clip-path="url(#clipRect)">
      <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="url(#confetti)"/>
      <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${MIDY - ah / 2 - ph * 0.04}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
      ${rests(cx, y1, pw)}
    </g>
    ${badge360(x1 - 4, y0 + ph * 0.12)}

    <!-- ฐานกลม + ก้านพับ (หมุนรอบตัว) -->
    <ellipse cx="${cx}" cy="${y1 + 34}" rx="${pw * 0.42}" ry="${pw * 0.135}" fill="#f1f6f9" stroke="#dde6ec" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${y1 + 29}" rx="${pw * 0.17}" ry="${pw * 0.058}" fill="#ffffff" stroke="#e2eaef" stroke-width="2.5"/>

    ${dim(x0, dimY(y1 + 34 + pw * 0.135), x1, dimY(y1 + 34 + pw * 0.135), `${s.w} ซม.`)}
    ${dim(x0 - 44, y0, x0 - 44, y1, `${s.h} ซม.`)}

    ${sizePill(s.name, PILLY)}
    ${foot([s.foot])}`);
}

// ── วาด + เซฟ ────────────────────────────────────────────────────────
const built = [];
for (const s of SIZES) {
  const svg = s.key === "oval" ? ovalArt(s) : rectArt(s);
  const file = `size-${s.key}-${s.ver}.jpg`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  // การ์ดย่อภาพจัตุรัสทั้งใบเหลือ 80 px — เก็บตัวอย่างขนาดจริงไว้ดูว่ายังแยกออกไหม
  await sharp(buf).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/thumb80-${file}`);
  // ⚠️ เก็บ "ตัว s เดิม" ไว้ ไม่ใช่สำเนา — ตอนอัปโหลดต้องเขียน url กลับเข้า SIZES ที่เอาไปสร้างการ์ด
  built.push({ s, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${s.title} ${s.name}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options/rules ───────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  b.s.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", b.s.url);
}
if (SIZES.some((s) => !s.url)) { console.error("ยังมีขนาดที่ไม่ได้ url ของภาพ"); process.exit(1); }

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const shapeGroup = (data.options ?? []).find((o) => o.label === SHAPE_GROUP);
const shapeNames = (shapeGroup?.choices ?? []).map((c) => c.name);
const missing = SIZES.map((s) => s.shape).filter((n) => !shapeNames.includes(n));
if (missing.length) { console.error(`กลุ่ม "${SHAPE_GROUP}" ไม่มีตัวเลือก:`, missing); process.exit(1); }

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "แต่ละขนาดคือคนละรูปทรง — เลือกขนาดแล้วรูปทรงจะถูกกำหนดให้เองโดยอัตโนมัติ · ราคาเท่ากันทั้งสองแบบ",
  choices: SIZES.map((s, i) => ({
    name: s.name,
    popular: i === 0,
    imageSrc: s.url,
    desc: s.desc,
  })),
};

// รันซ้ำได้: ตัดกลุ่มขนาดเดิมทิ้งก่อน แล้ววางไว้หน้ากลุ่มรูปทรง
const rest = (data.options ?? []).filter((o) => o.label !== SIZE_GROUP);
const at = rest.findIndex((o) => o.label === SHAPE_GROUP);
data.options = at < 0 ? [sizeGroup, ...rest] : [...rest.slice(0, at), sizeGroup, ...rest.slice(at)];

// กฎ: เลือกขนาดไหน → กลุ่มรูปทรงเหลือทรงเดียวที่คู่กัน (หน้าร้านโชว์เป็นบรรทัดล็อก 🔒 ให้เอง)
const keptRules = (data.rules ?? []).filter((r) => !(r?.limit?.label === SHAPE_GROUP && r?.when?.label === SIZE_GROUP));
const newRules = SIZES.map((s) => ({
  when: { label: SIZE_GROUP, choice: s.name, choices: [s.name] },
  limit: { label: SHAPE_GROUP, allow: [s.shape] },
}));
data.rules = [...keptRules, ...newRules];
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);

/** จำลอง allowedChoices() ของกลุ่มรูปทรง ณ ขนาดที่เลือก */
const simulate = (size) => {
  const shape = (back.data.options.find((o) => o.label === SHAPE_GROUP)?.choices ?? []).map((c) => c.name);
  let allowed = shape;
  for (const r of back.data.rules ?? []) {
    if (r.limit?.label !== SHAPE_GROUP) continue;
    if ((r.when.choices ?? [r.when.choice]).includes(size)) allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : shape;
};

const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === SIZES.length, "จำนวนการ์ดไม่ครบ"],
  [SIZES.every((s, i) => g?.choices?.[i]?.name === s.name), "ชื่อการ์ดไม่ตรง"],
  // ⚠️ ต้องเช็คว่าเป็น URL จริง ไม่ใช่แค่ "เท่ากับตัวแปร" — เคยพลาดเพราะ url หลุดเป็น undefined ทั้งสองฝั่ง
  [SIZES.every((s, i) => typeof g?.choices?.[i]?.imageSrc === "string" && g.choices[i].imageSrc.startsWith("https://") && g.choices[i].imageSrc === s.url), "ภาพการ์ดไม่ตรง/ไม่มีภาพ"],
  [g?.choices?.every((c) => !!c.desc), "การ์ดขาดคำอธิบาย"],
  [g?.choices?.every((c) => !c.extra), "การ์ดขนาดต้องไม่บวกราคา"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === SHAPE_GROUP), "กลุ่มขนาดต้องอยู่ก่อนกลุ่มรูปทรง"],
  [got.find((o) => o.label === SHAPE_GROUP)?.choices?.length === shapeNames.length, "ตัวเลือกในกลุ่มรูปทรงหาย"],
  // กับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(SIZE_GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(SIZE_GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 200 && back.data.priceMax === 290, "ช่วงราคาสินค้าเปลี่ยนไป"],
  ...SIZES.map((s) => [simulate(s.name).join("|") === s.shape, `เลือก ${s.name} แล้วรูปทรงไม่ถูกล็อกเป็น ${s.shape}`]),
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด ${SIZES.length} ใบ + ภาพ + กฎล็อกรูปทรง อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
for (const s of SIZES) console.log(`  ${s.name} → ${SHAPE_GROUP} = ${simulate(s.name).join(" · ")}`);
console.log("ราคาต่อชิ้นเท่าเดิมทุกช่วงจำนวน: 290 / 250 / 235 / 220 / 200");

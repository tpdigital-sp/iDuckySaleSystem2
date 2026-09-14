#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก 2 กลุ่มของ "พวงกุญแจเขย่า Shake Shake" (new-mt2rp5i3-9488)
 *
 *   node scripts/shake-shake-option-art.mjs            # วาดลง .cache/shake-shake/upload (ไม่เขียน DB)
 *   node scripts/shake-shake-option-art.mjs --write    # + อัป storage + ตั้ง imageSrc/desc + display cards + อ่านกลับเทียบ
 *
 * 5 ใบ (เจ้าของร้านสั่ง 14 ก.ย. 69 — 2 กลุ่มนี้เป็นแถบ pill เปล่า ลูกค้านึกภาพไม่ออก):
 *   hook-yes / hook-hole / hook-none    ตะขอ (กลุ่มประตู) → การ์ด
 *   close-glue / close-magnet           วิธีปิดกรอบ → การ์ด
 *
 * วาดทรงเดียวกับ multi-charm-option-art.mjs (กรอบขาว หัวเรื่อง ป้ายใหญ่กลาง บรรทัดท้าย)
 * ⚠️ กลุ่มประตูชื่อ "ตะขอ" (เดิม "รับตะขอไหม" — เปลี่ยน 14 ก.ย. 69 ดู scripts/shake-shake-hook-label.mjs)
 *    และกลุ่มเลือกอะไหล่ 31 แบบชื่อ "แบบตะขอ" · ห้ามแก้ชื่อตัวเลือก — เป็นประตู showWhen ของกลุ่มอื่น
 * ⚠️ อีโมจิใน SVG เรนเดอร์เป็นก้อนดำ (sharp ไม่มีฟอนต์อีโมจิ) — ข้อความในภาพห้ามใส่
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "new-mt2rp5i3-9488";
const VER = "v1";
const OUT = ".cache/shake-shake/upload";
mkdirSync(OUT, { recursive: true });

const DUCK = await mascotDataUri("heart", 520);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8", CYAN = "#0891b2", RED = "#ef4444";
const GLASS = "#e8f6fd", EDGE = "#7dd3fc", METAL = "#94a3b8", GLUE = "#f59e0b", MAG = "#475569";

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

/** ป้ายคำใหญ่กลางภาพ — ตัวชี้ขาดว่าใบไหนเป็นใบไหนตอนย่อ 80 px */
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

/** วงกลมประที่ตำแหน่งรู + เส้นโยงป้ายออกไปนอกชิ้นงาน (ป้ายทับขอบกรอบแล้วอ่านยาก) */
const callout = (s, color, text) => `
  <circle cx="450" cy="${s.holeY}" r="${s.holeR + 17}" fill="none" stroke="${color}" stroke-width="3.5" stroke-dasharray="8 7"/>
  <line x1="${450 + s.holeR + 23}" y1="${s.holeY}" x2="638" y2="${s.holeY}" stroke="${color}" stroke-width="2.5" opacity="0.6"/>
  <text x="648" y="${s.holeY + 9}" font-family="${TH}" font-size="25" font-weight="700" fill="${color}">${text}</text>`;

const slash = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RED}" stroke-width="9" stroke-linecap="round"/>`;

// ── ตัวน้อยเขย่าที่ลอยอยู่ในกรอบ ─────────────────────────────────────────────
const heart = (cx, cy, s, fill) =>
  `<path transform="translate(${cx} ${cy}) scale(${s / 20})" d="M0 8 C-11 0 -10 -9 -4.5 -9 C-1.5 -9 0 -6.6 0 -6.6 C0 -6.6 1.5 -9 4.5 -9 C10 -9 11 0 0 8 Z" fill="${fill}"/>`;
const star = (cx, cy, r, fill) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${p.join(" ")}" fill="${fill}"/>`;
};
/** ตัวน้อย 5 ตัว + เม็ดกลิตเตอร์ — ตำแหน่งตายตัวทุกใบ ภาพชุดนี้จะได้เทียบกันได้ */
const CONFETTI = [
  { k: "h", x: -0.30, y: -0.30, s: 0.20, c: "#f472b6" },
  { k: "s", x: 0.29, y: -0.24, s: 0.11, c: "#fbbf24" },
  { k: "h", x: 0.26, y: 0.28, s: 0.17, c: "#38bdf8" },
  { k: "s", x: -0.27, y: 0.30, s: 0.10, c: "#a78bfa" },
  { k: "d", x: 0.02, y: 0.36, s: 0.06, c: "#fbbf24" },
  { k: "d", x: -0.36, y: 0.03, s: 0.045, c: "#38bdf8" },
  { k: "d", x: 0.36, y: 0.02, s: 0.045, c: "#f472b6" },
];
const confetti = (cx, cy, w, h) => CONFETTI.map((c) => {
  const x = cx + c.x * w, y = cy + c.y * h, s = c.s * Math.min(w, h);
  return c.k === "h" ? heart(x, y, s, c.c)
    : c.k === "s" ? star(x, y, s, c.c)
    : `<circle cx="${x}" cy="${y}" r="${s}" fill="${c.c}"/>`;
}).join("");

/**
 * กรอบเขย่ามองจากด้านหน้า — แผ่นอะคริลิคใส ลายสกรีนจาง ๆ อยู่หลัง ตัวน้อยลอยอยู่หน้า
 * hole: เจาะรูบนหัว · plateOnly: วาดเฉพาะแผ่นหน้าใส (ใช้ตอนยกฝาเปิด)
 */
function shaker(cx, top, w, h, { hole = true, opacity = 1 } = {}) {
  const r = Math.min(w, h) * 0.17;
  const holeY = top + h * 0.085, holeR = Math.min(w, h) * 0.05;
  const iw = w - 46, ih = h - 46, icx = cx, icy = top + h / 2 + 6;
  const ah = ih * 0.60, aw = ah * DUCK.ratio;
  return { holeY, holeR, svg: `<g opacity="${opacity}">
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${r}" fill="${GLASS}" stroke="${EDGE}" stroke-width="5"/>
    <rect x="${cx - iw / 2}" y="${icy - ih / 2}" width="${iw}" height="${ih}" rx="${r * 0.72}" fill="#ffffff" stroke="${EDGE}" stroke-width="2.5"/>
    <image href="${DUCK.uri}" x="${icx - aw / 2}" y="${icy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet" opacity="0.88"/>
    ${confetti(icx, icy, iw, ih)}
    ${hole ? `<circle cx="${cx}" cy="${holeY}" r="${holeR}" fill="#ffffff" stroke="${EDGE}" stroke-width="3.5"/>` : ""}
  </g>` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) รับตะขอไหม — 3 แบบ: ได้ตะขอมาด้วย / เจาะรูให้เฉย ๆ / ไม่เจาะรูเลย
// ─────────────────────────────────────────────────────────────────────────────
const SH = { cx: 450, top: 330, w: 330, h: 366 };

function hookYesCard() {
  const s = shaker(SH.cx, SH.top, SH.w, SH.h);
  return frame(`
    ${title("รับตะขอ", "ได้ตะขอ + ห่วง ประกอบมาให้พร้อมใช้")}
    ${hookTop(450, 212, s.holeY - 21)}
    ${s.svg}
    ${ring(450, s.holeY, s.holeR + 18, 8)}
    ${tag(W / 2, 760, "มีตะขอ", 250)}
    ${foot(["แกะกล่องแล้วห้อยได้เลย — เลือกแบบตะขอและสีตะขอได้ในกลุ่มถัดไป"])}`);
}

function hookHoleCard() {
  const s = shaker(SH.cx, SH.top, SH.w, SH.h);
  return frame(`
    ${title("เจาะรู / ไม่รับตะขอ", "เจาะรูมาให้ แต่ไม่แถมตะขอ")}
    <g opacity="0.38">${hookTop(450, 212, s.holeY - 21)}${ring(450, s.holeY, s.holeR + 18, 8)}</g>
    ${slash(374, 228, 530, 336)}
    ${s.svg}
    ${callout(s, CYAN, "เจาะรูมาให้")}
    ${tag(W / 2, 760, "มีรู ไม่มีตะขอ", 400)}
    ${foot(["มีห่วง/ตะขอเองอยู่แล้ว — รูขนาดมาตรฐาน ใส่ห่วงทั่วไปได้"])}`);
}

function hookNoneCard() {
  /* ใบนี้ไม่วาดตะขอเลย — ที่ต้องอ่านออกคือ "ขอบบนเต็ม ไม่มีรู" · ชิ้นงานจึงใหญ่เต็มกรอบ
     (ใบ "เจาะรู" มีตะขอจาง + เส้นทับสูง ๆ อยู่แล้ว รูปย่อ 80 px จะได้ไม่ซ้ำกัน) */
  const s = shaker(450, 262, 372, 412, { hole: false });
  const hy = 262 + 412 * 0.085;
  return frame(`
    ${title("ไม่เจาะรูตะขอ", "ขอบบนเต็มทั้งแผ่น ไม่มีรู")}
    ${s.svg}
    <circle cx="450" cy="${hy}" r="34" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-dasharray="8 7"/>
    ${slash(450 - 38, hy - 38, 450 + 38, hy + 38)}
    <line x1="${450 + 44}" y1="${hy}" x2="672" y2="${hy}" stroke="${SUB}" stroke-width="2.5" opacity="0.6"/>
    <text x="682" y="${hy + 9}" font-family="${TH}" font-size="25" font-weight="700" fill="${SUB}">ไม่เจาะรู</text>
    ${tag(W / 2, 760, "ไม่มีรู", 250)}
    ${foot(["เอาไปตั้งโชว์ / ติดกาวเอง — ลายเต็มแผ่น ไม่มีรูคาบลาย"])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) วิธีปิดกรอบ — ซ้ายมองด้านหน้า · ขวาตัดขวางให้เห็นว่าประกบกันยังไง
//    (ทรงเดียวกับการ์ด "ความหนาอะคริลิค" ของพวงกุญแจหลายชิ้น)
// ─────────────────────────────────────────────────────────────────────────────
const CX = 286, EX = 650;               // ซ้าย = ด้านหน้า · ขวา = ตัดขวาง
const FW = 268, FH = 300, FTOP = 252;   // ชิ้นงานมองด้านหน้า
const SEC = { x: EX - 130, w: 260, top: 300, plate: 28, gap: 104 };
const CAPY = 596;                        // บรรทัดกำกับใต้ภาพทั้งสองฝั่ง
const cap = (x, t) => `<text x="${x}" y="${CAPY}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${t}</text>`;

/** ตัดขวาง 3 ชั้น: แผ่นหน้า + ช่องว่าง (ตัวน้อยเขย่าอยู่ข้างใน) + แผ่นหลัง — lift = ยกแผ่นหน้าขึ้นกี่ px */
function section({ lift = 0, seam }) {
  const { x, w, top, plate, gap } = SEC;
  const frontY = top - lift, midY = top + plate, backY = midY + gap;
  const plateSvg = (y) => `
    <rect x="${x}" y="${y}" width="${w}" height="${plate}" rx="9" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${x + 5}" y="${y + 4}" width="${w - 10}" height="${plate - 8}" rx="5" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>`;
  return `
    ${plateSvg(frontY)}
    <!-- ผนังข้าง (ชั้นกลาง) + ตัวน้อยที่เขย่าอยู่ในช่อง -->
    <rect x="${x}" y="${midY}" width="26" height="${gap}" rx="7" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${x + w - 26}" y="${midY}" width="26" height="${gap}" rx="7" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    ${heart(x + w * 0.38, midY + gap * 0.40, 34, "#f472b6")}
    ${star(x + w * 0.63, midY + gap * 0.62, 19, "#fbbf24")}
    <circle cx="${x + w * 0.52}" cy="${midY + gap * 0.22}" r="8" fill="#38bdf8"/>
    ${plateSvg(backY)}
    ${seam(frontY, midY, backY)}`;
}

function closeGlueCard() {
  const s = shaker(CX, FTOP, FW, FH);
  const { x, w, top, plate, gap } = SEC;
  // กาว = เม็ดสีส้มเรียงตามรอยต่อทั้งบนและล่าง
  const beads = (y) => Array.from({ length: 9 }, (_, i) =>
    `<circle cx="${x + 24 + i * ((w - 48) / 8)}" cy="${y}" r="7" fill="${GLUE}"/>`).join("");
  return frame(`
    ${title("ติดกาวปิดถาวร", "ประกบแน่นสนิท ตัวน้อยไม่หลุด")}
    ${s.svg}
    <!-- เส้นกาวเดินรอบขอบด้านหน้า -->
    <rect x="${CX - FW / 2 + 13}" y="${FTOP + 13}" width="${FW - 26}" height="${FH - 26}" rx="38"
      fill="none" stroke="${GLUE}" stroke-width="5" stroke-dasharray="3 13" stroke-linecap="round"/>
    ${cap(CX, "กาวเดินรอบขอบ")}

    ${section({ seam: (f, m, b) => beads(m + 1) + beads(b + 1) })}
    ${cap(EX, "ตัดขวาง (ขยาย) — จุดส้ม = กาว")}

    ${tag(W / 2, 706, "ปิดถาวร", 280)}
    ${foot(["แบบมาตรฐานของร้าน — ปิดแล้วเปิดไม่ได้ ตัวน้อยอยู่ครบตลอดอายุงาน"])}`);
}

function closeMagnetCard() {
  const LIFT = 62;
  const s = shaker(CX, FTOP + 26, FW, FH - 26);
  const { x, w, top, plate } = SEC;
  const mag = (cx, cy) => `<rect x="${cx - 18}" y="${cy - 10}" width="36" height="20" rx="6" fill="${MAG}"/>
    <rect x="${cx - 18}" y="${cy - 10}" width="36" height="20" rx="6" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.7"/>`;
  const lidW = FW - 44, lidX = CX - lidW / 2;
  return frame(`
    ${title("ติดแม่เหล็ก (เปิด-ปิดได้)", "แกะเปิด เปลี่ยน/เพิ่มตัวน้อยทีหลังได้")}
    <!-- ฝาหน้าถูกยกลอยขึ้น (เส้นประโยงกลับที่เดิม) -->
    <rect x="${lidX}" y="166" width="${lidW}" height="82" rx="26" fill="${GLASS}" stroke="${EDGE}" stroke-width="5"/>
    ${mag(lidX + 34, 232)}${mag(lidX + lidW - 34, 232)}
    <line x1="${lidX}" y1="252" x2="${lidX}" y2="${FTOP + 46}" stroke="${LINE}" stroke-width="2.5" stroke-dasharray="7 7"/>
    <line x1="${lidX + lidW}" y1="252" x2="${lidX + lidW}" y2="${FTOP + 46}" stroke="${LINE}" stroke-width="2.5" stroke-dasharray="7 7"/>
    ${s.svg}
    ${mag(lidX + 34, FTOP + 42)}${mag(lidX + lidW - 34, FTOP + 42)}
    ${cap(CX, "ยกฝาหน้าออกได้")}

    ${section({ lift: LIFT, seam: (f, m) => `
      ${mag(x + 36, m + 13)}${mag(x + w - 36, m + 13)}
      ${mag(x + 36, f + plate - 11)}${mag(x + w - 36, f + plate - 11)}
      <path d="M${x + w / 2} ${m - 8} L${x + w / 2} ${f + plate + 22}" stroke="${CYAN}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M${x + w / 2 - 14} ${f + plate + 36} L${x + w / 2} ${f + plate + 21} L${x + w / 2 + 14} ${f + plate + 36}" fill="none" stroke="${CYAN}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` })}
    ${cap(EX, "ตัดขวาง (ขยาย) — แท่งเทา = แม่เหล็ก")}

    ${tag(W / 2, 706, "เปิด-ปิดได้", 340)}
    ${foot(["ราคาเท่าแบบกาว — แต่ปิดสนิทน้อยกว่า ถ้าตกแรง ๆ ฝาอาจเผยอ"])}`);
}

// ── วาด ─────────────────────────────────────────────────────────────────────
const FILES = [
  { file: "hook-yes", svg: hookYesCard(), note: "รับตะขอ" },
  { file: "hook-hole", svg: hookHoleCard(), note: "เจาะรู / ไม่รับตะขอ" },
  { file: "hook-none", svg: hookNoneCard(), note: "ไม่เจาะรูตะขอ" },
  { file: "close-glue", svg: closeGlueCard(), note: "ติดกาวปิดถาวร" },
  { file: "close-magnet", svg: closeMagnetCard(), note: "ติดแม่เหล็ก" },
];

const built = [];
for (const f of FILES) {
  const name = `opt-${f.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${name}`, buf);
  built.push({ ...f, name, buf });
  console.log(`🖼  ${OUT}/${name}  ${Math.round(buf.length / 1024)} KB — ${f.note}`);
}
/* แผ่นรวมย่อขนาดจริงบนการ์ด (80 px) — ตรวจว่าย่อแล้วยังแยกออกจากกัน */
for (const TS of [80, 220]) {
  const cols = built.length;
  await sharp({ create: { width: TS * cols, height: TS, channels: 3, background: "#ffffff" } })
    .composite(await Promise.all(built.map(async (b, i) => ({
      input: await sharp(b.buf).resize(TS, TS).toBuffer(), left: i * TS, top: 0,
    }))))
    .jpeg({ quality: 90 })
    .toFile(`${OUT}/_thumbs-${TS}.jpg`);
  console.log(`🔎 ${OUT}/_thumbs-${TS}.jpg`);
}

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

/** เติมภาพ/คำอธิบายให้กลุ่มหนึ่ง — ตัวเลือกใน DB ต้องมีในตารางครบ ไม่งั้นหยุด (กันชื่อเพี้ยนเงียบ ๆ) */
const applied = [];
function apply(label, rows, { display } = {}) {
  const g = (data.options ?? []).filter((o) => (o.label ?? o.name) === label);
  if (g.length !== 1) { console.error(`กลุ่ม "${label}" พบ ${g.length} กลุ่ม — หยุดก่อน`); process.exit(1); }
  if (display) g[0].display = display;
  for (const c of g[0].choices ?? []) {
    const r = rows.find((x) => x.choice === c.name);
    if (!r) { console.error(`ตัวเลือกใน DB ไม่มีในสคริปต์: ${label} / ${c.name}`); process.exit(1); }
    c.imageSrc = url[r.file];
    c.desc = r.desc;
    applied.push({ label, name: c.name, file: r.file, desc: r.desc });
  }
}

apply("ตะขอ", [
  { choice: "รับตะขอ", file: "hook-yes",
    desc: "ได้ตะขอ + ห่วงประกอบมาให้พร้อมห้อย — เลือกแบบและสีตะขอได้ในกลุ่มถัดไป" },
  { choice: "เจาะรู / ไม่รับตะขอ", file: "hook-hole",
    desc: "เจาะรูบนหัวมาให้ แต่ไม่แถมตะขอ — มีห่วงเองอยู่แล้ว ใส่เองได้เลย" },
  { choice: "ไม่เจาะรูตะขอ", file: "hook-none",
    desc: "ไม่เจาะรูเลย ลายเต็มแผ่น — เอาไปตั้งโชว์ หรือติดกาวเอง" },
], { display: "cards" });

apply("วิธีปิดกรอบ", [
  { choice: "ติดกาวปิดถาวร", file: "close-glue",
    desc: "เดินกาวรอบขอบแล้วประกบแน่นสนิท ตัวน้อยไม่หลุด — แบบมาตรฐานของร้าน (ปิดแล้วเปิดไม่ได้)" },
  { choice: "ติดแม่เหล็ก (เปิด-ปิดได้)", file: "close-magnet",
    desc: "ฝาหน้าติดแม่เหล็ก แกะเปิดเปลี่ยน/เพิ่มตัวน้อยทีหลังได้ — ราคาเท่ากัน แต่ปิดสนิทน้อยกว่า" },
], { display: "cards" });

data.savedAt = new Date().toISOString();                 // ISO เท่านั้น (ตัวเลข = หน้าแก้ไขติด 409 ตลอด)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — "ไม่ error" ไม่ได้แปลว่าค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const a of applied) {
  const g = back.data.options.find((o) => (o.label ?? o.name) === a.label);
  const c = g?.choices?.find((x) => x.name === a.name);
  if (c?.imageSrc !== url[a.file] || c?.desc !== a.desc) { console.error("อ่านกลับไม่ตรง:", a.label, a.name, c); process.exit(1); }
}
for (const label of ["ตะขอ", "วิธีปิดกรอบ"]) {
  const g = back.data.options.find((o) => (o.label ?? o.name) === label);
  if (g?.display !== "cards") { console.error(`display ของ "${label}" ไม่ใช่ cards:`, g?.display); process.exit(1); }
}
console.log(`✓ เติมภาพ ${applied.length} ตัวเลือก (${built.length} ไฟล์) อ่านกลับตรงทั้งหมด · savedAt = ${back.data.savedAt}`);

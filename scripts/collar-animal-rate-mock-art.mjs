// ภาพประจำเรท ปลอกคอสัตว์เลี้ยง 3 แบบ → วาด SVG จัตุรัส 1200×1200 → JPG →
// อัปโหลด storage `product-images/products/collar-animal/` → ผูก priceRates[i].imageSrc
// รันซ้ำได้ (อัปทับชื่อไฟล์เดิม + เขียน DB เฉพาะเมื่อค่ายังไม่ตรง) · --dry = เรนเดอร์ดูก่อน ไม่อัป
// เรทตัวแทน "… (ตัวแทน)" ผูกภาพเดียวกับเรทปลีก
// v3 (23 ต.ค. 69 เจ้าของร้านสั่ง "ช่วยสร้างและออกแบบให้ใหม่เลย" + ภาพเรทเดิมบนหน้าสินค้า):
//   หน้าสินค้าโชว์ภาพเรทเป็นช่องจัตุรัส 80px (object-cover) — ภาพ 4:3 เดิมโดนครอปขอบ ตัวหนังสือเล็กอ่านไม่ออก
//   + เดิมวาดเป็นแถบผ้ายาว แต่ของจริง (เทมเพลต .ai) เป็นผ้าพันคอทรงสามเหลี่ยม
//   → จัตุรัส · ทรงผ้าพันคอตามเทมเพลตตัวใหญ่กลางภาพ · ลายเป็ด · แยกสีพื้น/ผ้าต่อแบบให้แยกออกจากภาพเล็ก
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg) => { console.error("✗", msg); process.exit(1); };

const FONT = `'Thonburi','Sukhumvit Set','Noto Sans Thai',sans-serif`;
const INK = "#1d3b41";

// นับความกว้างข้อความไทยโดยตัดสระบน-ล่าง/วรรณยุกต์ออก
const baseLen = (s) => s.replace(/[ัำ-ฺ็-๎]/g, "").length;

// 🦆 เป็ดเหลือง (จุดกลาง ≈ ลำตัว · s = สเกล · flip = หันขวา)
const duck = (x, y, s, flip = false, o = 1) => `
<g transform="translate(${x},${y}) scale(${flip ? -s : s},${s})" opacity="${o}">
  <ellipse cx="2" cy="10" rx="27" ry="19" fill="#ffd43b" stroke="#e9a800" stroke-width="2"/>
  <path d="M 24 2 Q 38 -6 34 10 Q 30 16 22 14 Z" fill="#ffd43b" stroke="#e9a800" stroke-width="2"/>
  <circle cx="-14" cy="-14" r="15" fill="#ffd43b" stroke="#e9a800" stroke-width="2"/>
  <path d="M -27 -12 Q -40 -11 -41 -6 Q -36 -3 -26 -6 Z" fill="#ff8c2b"/>
  <circle cx="-18" cy="-17" r="2.8" fill="#1d3b41"/>
  <circle cx="-9" cy="-9" r="3.2" fill="#ff9fb0" opacity="0.8"/>
  <path d="M -2 6 Q 10 0 18 10 Q 8 18 -2 12 Z" fill="#f5bd00"/>
</g>`;

/** ธีมต่อแบบ — พื้น / ผ้า / ผ้าด้านหลัง / สีหลัก (หัวข้อ ป้าย) */
const THEMES = {
  tie: { bg: ["#effafb", "#cfeef3"], fab: ["#8fd8e2", "#4fb3c3"], back: ["#d8f1f5", "#b6e3ea"], main: "#127885", deep: "#0d5a64" },
  button: { bg: ["#fff8ef", "#ffe4c8"], fab: ["#ffb4c1", "#f27d93"], back: ["#ffe9b8", "#f6cf7c"], main: "#c4506a", deep: "#8f3049" },
  strap: { bg: ["#f5f3ff", "#ddd6ff"], fab: ["#9fb0ff", "#6a7ef0"], back: ["#d7defd", "#b7c3fb"], main: "#4c56c9", deep: "#363e9a" },
};

const defs = (t) => `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="1" stop-color="${t.bg[1]}"/></linearGradient>
  <linearGradient id="fab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.fab[0]}"/><stop offset="1" stop-color="${t.fab[1]}"/></linearGradient>
  <linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.back[0]}"/><stop offset="1" stop-color="${t.back[1]}"/></linearGradient>
  <linearGradient id="strapG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a96a3"/><stop offset="1" stop-color="#5b6672"/></linearGradient>
  <pattern id="ducks" width="190" height="170" patternUnits="userSpaceOnUse" patternTransform="translate(20 10)">
    ${duck(55, 52, 1.05)}${duck(150, 138, 0.9, true)}
    <g fill="#fff" opacity="0.85"><circle cx="140" cy="40" r="7"/><circle cx="40" cy="135" r="6"/><circle cx="105" cy="95" r="4"/></g>
  </pattern>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="${t.deep}" flood-opacity="0.22"/>
  </filter>
</defs>`;

// หัวภาพ: เลขแบบ + ชื่อ + รายละเอียดสั้น (ตัวใหญ่ อ่านได้ตอนภาพขยายในแกลเลอรี)
const header = (t, no, title, sub) => `
<g font-family="${FONT}">
  <rect x="64" y="64" width="96" height="96" rx="28" fill="${t.main}"/>
  <text x="112" y="132" font-size="58" font-weight="700" fill="#fff" text-anchor="middle">${no}</text>
  <text x="188" y="116" font-size="62" font-weight="700" fill="${INK}">${title}</text>
  <text x="190" y="166" font-size="32" fill="${t.deep}">${sub}</text>
</g>`;

// ชิปท้ายภาพ (จัดกลาง)
const chips = (t, items) => {
  const ws = items.map((s) => 56 + baseLen(s) * 24);
  const total = ws.reduce((a, b) => a + b, 0) + 20 * (items.length - 1);
  let x = (1200 - total) / 2;
  return `<g font-family="${FONT}">${items
    .map((s, i) => {
      const g = `<rect x="${x}" y="1060" width="${ws[i]}" height="72" rx="36" fill="#fff" stroke="${t.main}" stroke-opacity="0.35" stroke-width="3"/>
  <text x="${x + ws[i] / 2}" y="1108" font-size="32" font-weight="700" fill="${t.deep}" text-anchor="middle">${s}</text>`;
      x += ws[i] + 20;
      return g;
    })
    .join("")}</g>`;
};

// ป้ายชี้ (tx,ty = กลางป้าย · px,py = จุดชี้)
const callout = (t, tx, ty, px, py, label) => {
  const w = 56 + baseLen(label) * 23;
  return `
<g font-family="${FONT}">
  <line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}" stroke="${t.deep}" stroke-width="3.5" stroke-dasharray="1 9" stroke-linecap="round"/>
  <circle cx="${px}" cy="${py}" r="9" fill="#fff" stroke="${t.deep}" stroke-width="4"/>
  <rect x="${tx - w / 2}" y="${ty - 33}" width="${w}" height="66" rx="33" fill="${t.deep}"/>
  <text x="${tx}" y="${ty + 11}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>
</g>`;
};

// ผ้า: ลงสีพื้น + ลายเป็ดทับในทรงเดียวกัน
const cloth = (d, extra = "") => `<path d="${d}" fill="url(#fab)"/><path d="${d}" fill="url(#ducks)"/>${extra}`;
// ชื่อสัตว์เลี้ยงบนป้ายรองสีเข้ม (ไม่งั้นทับลายเป็ดอ่านไม่ออก)
const name = (t, x, y, size = 58) => `
<rect x="${x - 150}" y="${y - size + 2}" width="300" height="${size + 26}" rx="${(size + 26) / 2}" fill="${t.deep}" opacity="0.88"/>
<text x="${x}" y="${y + 4}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="8">MOCHI</text>`;

const page = (t, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
${defs(t)}
<rect width="1200" height="1200" fill="url(#bg)"/>
${duck(1110, 620, 1.2, true, 0.16)}${duck(110, 980, 1.6, false, 0.16)}${duck(1100, 960, 1.1, true, 0.14)}
${body}
</svg>`;

// ---------- แบบที่ 1: แบบผูก — ผ้าสามเหลี่ยมชิ้นเดียว ปลายสองข้างยาวไว้ผูกรอบคอ ----------
const T1 = THEMES.tie;
const tri1 = "M 110 400 Q 600 470 1090 400 Q 1040 470 960 520 L 640 900 Q 600 945 560 900 L 240 520 Q 160 470 110 400 Z";
const svg1 = page(T1, `
${header(T1, 1, "ปลอกคอ แบบผูก", "ผ้าพันคอสามเหลี่ยม · ผ้า 1 ชิ้น · สกรีน 1 ด้าน")}
<g filter="url(#soft)">
  ${cloth(tri1)}
  <path d="M 150 418 Q 600 484 1050 418 M 262 530 L 600 900 L 938 530" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="18 12" stroke-linecap="round" opacity="0.95"/>
</g>
${name(T1, 600, 600)}
${callout(T1, 300, 300, 150, 410, "ปลายผ้าผูกรอบคอ")}
${callout(T1, 900, 300, 760, 462, "สกรีนลายด้านหน้า")}
${callout(T1, 930, 900, 760, 735, "เย็บม้วนริมขอบ")}
${chips(T1, ["ผ้า 1 ชิ้น", "สกรีน 1 ด้าน", "XS – XXL"])}
`);

// ---------- แบบที่ 2: แบบติดกระดุม — ผ้า 2 ชิ้นเย็บประกบ พันรอบคอแล้วติดกระดุมแป๊ก ----------
const T2 = THEMES.button;
const tri2 = "M 150 420 L 1050 420 L 600 900 Z";
const zig = (pts) => {
  // ซิกแซกขนานขอบ (เย็บโพ้ง) จากจุด a ไป b
  let d = "";
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
    const L = Math.hypot(bx - ax, by - ay), n = Math.floor(L / 26);
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let i = 0; i <= n; i++) {
      const u = i / n, k = i % 2 ? 7 : -7;
      d += `${d ? "L" : "M"} ${(ax + (bx - ax) * u + nx * k).toFixed(1)} ${(ay + (by - ay) * u + ny * k).toFixed(1)} `;
    }
  }
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" opacity="0.95"/>`;
};
const snap = (x, y, female = false) => `
<g><circle cx="${x}" cy="${y}" r="24" fill="#fbfbfb" stroke="#c9b9bd" stroke-width="4"/>
${female ? `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#a48f95" stroke-width="5"/>` : `<circle cx="${x}" cy="${y}" r="10" fill="#a48f95"/>`}</g>`;
const svg2 = page(T2, `
${header(T2, 2, "ปลอกคอ แบบติดกระดุม", "ผ้า 2 ชิ้นเย็บประกบ · สกรีน 2 ด้าน")}
<g filter="url(#soft)">
  <path d="M 178 446 L 1078 446 L 628 922 Z" fill="url(#back)"/>
  ${cloth(tri2)}
  ${zig([[200, 450], [600, 862], [1000, 450]])}
  ${snap(212, 462)}${snap(290, 462)}${snap(988, 462, true)}
</g>
${name(T2, 600, 600)}
${callout(T2, 300, 300, 212, 440, "ติดกระดุมแป๊ก")}
${callout(T2, 920, 300, 1062, 470, "ด้านหลังสกรีนได้")}
${callout(T2, 930, 900, 760, 735, "เย็บขอบแบบโพ้ง")}
${chips(T2, ["ผ้า 2 ชิ้น", "สกรีน 2 ด้าน", "XS – XL"])}
`);

// ---------- แบบที่ 3: แบบใส่กับสาย — ผ้า 2 ชิ้นเย็บประกบ มีช่องสอดสายปลอกคอเดิม ----------
const T3 = THEMES.strap;
const tri3 = "M 250 430 L 950 430 L 950 470 L 600 880 L 250 470 Z";
const svg3 = page(T3, `
${header(T3, 3, "ปลอกคอ แบบใส่กับสาย", "สอดกับสายปลอกคอเดิม · ผ้า 2 ชิ้น · สกรีน 2 ด้าน")}
<g filter="url(#soft)">
  <rect x="60" y="410" width="1080" height="56" rx="14" fill="url(#strapG)"/>
  <line x1="70" y1="422" x2="1130" y2="422" stroke="#fff" stroke-width="3" opacity="0.35"/>
  <rect x="1040" y="392" width="110" height="92" rx="20" fill="#3d4650"/>
  <rect x="1062" y="414" width="66" height="48" rx="12" fill="${T3.bg[1]}"/>
  <path d="M 276 452 L 976 452 L 976 492 L 626 902 L 276 492 Z" fill="url(#back)"/>
  ${cloth(tri3)}
  <path d="M 250 430 L 950 430 L 950 510 Q 600 540 250 510 Z" fill="#000" opacity="0.08"/>
  <path d="M 262 512 Q 600 542 938 512" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="18 12" stroke-linecap="round" opacity="0.95"/>
  <path d="M 285 500 L 600 862 L 915 500" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="18 12" stroke-linecap="round" opacity="0.95"/>
</g>
<g font-family="${FONT}">
  <path d="M 980 430 L 1004 430 M 992 430 L 992 512 M 980 512 L 1004 512" fill="none" stroke="${T3.deep}" stroke-width="4"/>
</g>
${name(T3, 600, 650)}
${callout(T3, 300, 300, 160, 438, "สายปลอกคอเดิม (ไม่รวม)")}
${callout(T3, 960, 300, 992, 470, "ช่องสอดสาย ~3 cm")}
${callout(T3, 930, 900, 760, 690, "สกรีนได้ 2 ด้าน")}
${chips(T3, ["ผ้า 2 ชิ้น", "สกรีน 2 ด้าน", "S – XL"])}
`);

// ---------- อัปโหลด + ผูกเข้าเรท ----------
const PRODUCT_ID = "collar-animal";
const BUCKET = "product-images";
const DIR = `products/${PRODUCT_ID}`;
// จับคู่ด้วย label เรทจริงใน DB → ชื่อไฟล์ตามเนื้อหาภาพ (ไม่ใช่ลำดับ)
const jobs = [
  { rateLabel: "ปลอกคอ แบบผูก", file: "rate-tie-mock-v3.jpg", svg: svg1 },
  { rateLabel: "ปลอกคอ แบบติดกระดุม", file: "rate-button-mock-v3.jpg", svg: svg2 },
  { rateLabel: "ปลอกคอ แบบใส่กับสาย", file: "rate-strap-mock-v3.jpg", svg: svg3 },
];

// --dry = เขียน JPG ลง $TMPDIR/collar-rate-mock/ ให้ดูก่อน ไม่อัป ไม่แตะ DB
if (process.argv.includes("--dry")) {
  const out = `${process.env.TMPDIR ?? "/tmp"}/collar-rate-mock/`;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(out, { recursive: true });
  for (const j of jobs) writeFileSync(out + j.file, await sharp(Buffer.from(j.svg), { density: 96 }).jpeg({ quality: 88 }).toBuffer());
  console.log("dry-run →", out);
  process.exit(0);
}

const urls = {};
for (const j of jobs) {
  const jpg = await sharp(Buffer.from(j.svg), { density: 96 }).jpeg({ quality: 88 }).toBuffer();
  const { error } = await sb.storage.from(BUCKET).upload(`${DIR}/${j.file}`, jpg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) die(`อัปโหลด ${j.file} ไม่ผ่าน: ${error.message}`);
  urls[j.rateLabel] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${DIR}/${j.file}`;
  console.log("✓ อัปโหลด", j.file);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr.message);
const data = row.data;
if (!Array.isArray(data.priceRates) || !data.priceRates.length) die("ไม่มี priceRates");

// เรทตัวแทน "… (ตัวแทน)" ใช้ภาพเดียวกับเรทปลีก
const baseLabel = (l) => l.replace(/\s*\(ตัวแทน\)$/, "");
let changed = false;
for (const r of data.priceRates) {
  const url = urls[baseLabel(r.label)];
  if (!url) die(`ไม่รู้จักเรท "${r.label}" — label ใน DB เปลี่ยนไปจากที่สคริปต์รู้จัก`);
  if (r.imageSrc !== url) { r.imageSrc = url; changed = true; }
}

if (!changed) {
  console.log("• imageSrc ตรงอยู่แล้วทุกเรท ไม่ต้องเขียน DB");
} else {
  data.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
  if (updErr) die(updErr.message);
  if (!upd?.length) die("update โดน 0 แถว");
}

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const r of back.data.priceRates || []) {
  if (r.imageSrc !== urls[baseLabel(r.label)]) die(`อ่านกลับไม่ตรง: ${r.label} → ${r.imageSrc}`);
  console.log("✓ ผูกแล้ว", r.label, "→", r.imageSrc.split("/").pop());
}
console.log("เสร็จ — หน้าสินค้าแคช 5 นาที เปิดด้วย ?v=<เลขใหม่> เพื่อดูผลทันที");

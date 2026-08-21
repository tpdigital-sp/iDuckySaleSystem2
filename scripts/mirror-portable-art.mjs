#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "กระจกพกพา" (บล็อก กระจกพกพาทรงกลม / กระจกพวงกุญแจ)
 *
 *   node scripts/mirror-portable-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 3 ทาง:
 *
 * 1) รูปงานจริงในบล็อกนั้นของหน้า pricelists (wixstatic) — ครอปเป็นภาพประจำตัวเลือก
 *    ⚠️ หน้าเว็บติดป้ายบอกชนิดไว้แค่ 2 รูป (ทรงกลม / พวงกุญแจ) ไม่ได้บอก "ขนาดกี่มิล" ของแต่ละรูป
 *       การ์ดจึงใช้รูปเป็น "ตัวอย่างงานชนิดนั้น" แล้ววาดวงกลมตามสเกลจริงกำกับขนาดไว้ข้าง ๆ
 *
 * 2) ภาพฟิล์มเคลือบจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *    ใช้ทำการ์ด "เคลือบธรรมดา" / "เคลือบพิเศษ" — ตัวเลือกผิวฟิล์มรายตัวลิงก์ไฟล์คลังตรง ๆ ไม่อัปซ้ำ
 *
 * 3) วาดเอง — เทียบขนาด 58/75 มม. และการ์ด "1 เซ็ต = 5 ชิ้น"
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mirror-portable/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";

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

/** wix id → รูปต้นฉบับ (ขอ fit ไม่ให้ Wix ครอปทิ้งเอง) */
const wix = (id) => `https://static.wixstatic.com/media/${id}~mv2.jpg/v1/fit/w_2000,h_2000/x.jpg`;
/** ไฟล์ในคลังฟิล์มเคลือบของร้าน (ใช้ในสินค้าตัวอื่นอยู่แล้ว) */
const COAT_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";

/* ── ชนิดกระจก (3 แบบ) ───────────────────────────────────────────── */

/**
 * 3 แบบที่ขายในบล็อกนี้ · mm = เส้นผ่านศูนย์กลางจริงของหน้ากระจก
 * photo = รูปงานจริงในบล็อกเดียวกัน (crop = [left, top, width, height] สัดส่วน 0-1)
 */
export const TYPES = [
  {
    key: "round58",
    name: "กระจกทรงกลม (ขนาด 58 มม.)",
    mm: 58,
    kind: "round",
    photo: "959b83_f5c196f240cc4aed8d62b6efc57702df",
    crop: [0.04, 0.12, 0.92, 0.76],
    note: "ขนาดพกพา ใส่กระเป๋าเสื้อ/กระเป๋าสตางค์ได้",
  },
  {
    key: "round75",
    name: "กระจกทรงกลม (ขนาด 75 มม.)",
    mm: 75,
    kind: "round",
    photo: "959b83_c555ce48c8024b34ac03b30434acb617",
    crop: [0.06, 0.1, 0.88, 0.8],
    note: "หน้ากระจกใหญ่กว่า เห็นลายเต็มตา ส่องชัดกว่า",
  },
  {
    key: "keyring58",
    name: "กระจกพวงกุญแจ (ขนาด 58 มม.)",
    mm: 58,
    kind: "keyring",
    photo: "959b83_992e483cb57d4e91a7d7400f89b96249",
    crop: [0.02, 0.06, 0.96, 0.88],
    note: "มีหูจับ + โซ่ลูกปัด แขวนกระเป๋า/พวงกุญแจได้",
  },
];

/** วงกลมกระจกวาดตามสเกลจริง (1 มม. = SCALE px) */
const SCALE = 3.1;
function mirrorShape(cx, cy, mm, kind, { label = true } = {}) {
  const r = (mm * SCALE) / 2;
  const chain =
    kind === "keyring"
      ? `<g>
      <rect x="${cx - 15}" y="${cy - r - 46}" width="30" height="56" rx="15" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.5"/>
      <circle cx="${cx}" cy="${cy - r - 34}" r="7" fill="#ffffff" stroke="#94a3b8" stroke-width="2.5"/>
      ${Array.from({ length: 7 }, (_, i) => `<circle cx="${cx + 2 + i * 11}" cy="${cy - r - 52 - Math.abs(3 - i) * 3}" r="5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5"/>`).join("")}
    </g>`
      : "";
  return `<g>
    ${chain}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="#e0f2fe" stroke="#bae6fd" stroke-width="2"/>
    <path d="M ${cx - r * 0.55} ${cy + r * 0.35} L ${cx + r * 0.35} ${cy - r * 0.55}" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
    ${
      label
        ? `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
        <path d="M ${cx - r} ${cy + r + 30} L ${cx + r} ${cy + r + 30}"/>
        <path d="M ${cx - r} ${cy + r + 20} L ${cx - r} ${cy + r + 40} M ${cx + r} ${cy + r + 20} L ${cx + r} ${cy + r + 40}"/>
      </g>
      <text x="${cx}" y="${cy + r + 72}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${CYAN}">${mm} มม.</text>`
        : ""
    }
  </g>`;
}

/** การ์ดชนิดกระจก — รูปงานจริงครึ่งบน + วงกลมสเกลจริงครึ่งล่าง */
async function typeCards() {
  console.log("🖼  การ์ดชนิดกระจก 3 แบบ (รูปงานจริง + วงกลมสเกลจริง)");
  for (const t of TYPES) {
    const srcBuf = await get(wix(t.photo));
    const meta = await sharp(srcBuf).metadata();
    const [l, tp, w, h] = t.crop;
    const photo = await sharp(srcBuf)
      .extract({
        left: Math.round(meta.width * l),
        top: Math.round(meta.height * tp),
        width: Math.round(meta.width * w),
        height: Math.round(meta.height * h),
      })
      .resize({ width: 470, height: 380, fit: "cover" })
      .toBuffer();
    const svg = frame(`
      ${title(t.name, "งานจริงของร้าน + ขนาดจริงเทียบสเกล")}
      <rect x="52" y="165" width="474" height="384" rx="20" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="2"/>
      ${mirrorShape(700, 360, t.mm, t.kind)}
      <text x="700" y="600" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ขนาดจริงของหน้ากระจก</text>
      <text x="${W / 2}" y="665" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t.note)}</text>
      ${foot(["ขายเป็นเซ็ต — 1 เซ็ต 5 ชิ้น (1 เซ็ต 1 ลาย)", "ฟรี! เคลือบเงา หรือ เคลือบด้าน"])}`);
    const buf = await sharp(Buffer.from(svg))
      .composite([{ input: photo, left: 54, top: 167 }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    save(`type-${t.key}`, buf);
  }
}

/** การ์ดเทียบขนาด 58 / 75 มม. + พวงกุญแจ (ใช้ในแท็บ) */
async function sizeCompare() {
  console.log("🖼  การ์ดเทียบขนาด (วาดเอง)");
  const svg = frame(`
    ${title("เทียบขนาดกระจกพกพา", "วาดตามสัดส่วนจริง — 58 มม. · 75 มม. · พวงกุญแจ 58 มม.")}
    ${mirrorShape(215, 380, 58, "round")}
    ${mirrorShape(465, 380, 75, "round")}
    ${mirrorShape(715, 395, 58, "keyring")}
    <text x="215" y="640" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">ทรงกลม 58 มม.</text>
    <text x="465" y="640" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">ทรงกลม 75 มม.</text>
    <text x="715" y="640" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">พวงกุญแจ 58 มม.</text>
    <text x="215" y="682" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พกพาง่าย</text>
    <text x="465" y="682" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เห็นลายเต็มตา</text>
    <text x="715" y="682" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">มีหูจับ + โซ่</text>
    ${foot(["ตัวเลขขนาด = เส้นผ่านศูนย์กลางหน้ากระจก", "ภาพวาดตามสัดส่วนจริง เพื่อเทียบขนาดระหว่างแบบ"])}`);
  await saveSvg("size-compare", svg);
}

/** การ์ด "1 เซ็ต = 5 ชิ้น" */
async function setCard() {
  console.log("🖼  การ์ด 1 เซ็ต = 5 ชิ้น (วาดเอง)");
  const circles = Array.from({ length: 5 }, (_, i) => {
    const cx = 190 + (i % 3) * 260;
    const cy = i < 3 ? 330 : 590;
    return mirrorShape(i < 3 ? cx : 320 + (i - 3) * 260, cy, 58, "round", { label: false });
  }).join("");
  const svg = frame(`
    ${title("1 เซ็ต = 5 ชิ้น", "ราคาในตารางคิดเป็น “ต่อเซ็ต” · 1 เซ็ตใช้ได้ 1 ลาย")}
    ${circles}
    ${foot(["สั่ง 2 เซ็ต = 10 ชิ้น คละได้ 2 ลาย (ลายละ 5 ชิ้น)", "อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย"])}`);
  await saveSvg("set-of-5", svg);
}

/* ── การ์ดชนิดเคลือบ (ใช้ภาพฟิล์มจริงจากคลังของร้าน) ─────────────── */

/** วางภาพฟิล์มเรียงกันในการ์ดเดียว + ป้ายชื่อใต้ภาพ */
async function coatCard(name, cardTitle, cardSub, films, notes) {
  const tiles = [];
  const gap = 24;
  const tw = Math.floor((W - 100 - gap * (films.length - 1)) / films.length);
  const thh = Math.round(tw * 0.72);
  for (const f of films) {
    // contain ไม่ใช่ cover — ภาพฟิล์มของร้านมีป้ายชื่อผิวอยู่มุมขวาล่าง ครอปแล้วป้ายขาด
    tiles.push(
      await sharp(await get(`${COAT_BASE}/${f.file}.jpg`))
        .resize({ width: tw, height: thh, fit: "contain", background: "#ffffff" })
        .toBuffer()
    );
  }
  const x0 = 50;
  const y0 = 300;
  const labels = films
    .map((f, i) => `<text x="${x0 + i * (tw + gap) + tw / 2}" y="${y0 + thh + 44}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">${esc(f.label)}</text>`)
    .join("");
  const svg = frame(`${title(cardTitle, cardSub)}${labels}${foot(notes)}`);
  const buf = await sharp(Buffer.from(svg))
    .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

async function coatCards() {
  console.log("🖼  การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน)");
  await coatCard(
    "coat-normal",
    "เคลือบธรรมดา — ฟรี!",
    "เลือกได้ 1 แบบต่อ 1 เซ็ต",
    [
      { file: "gloss", label: "ผิวเงา" },
      { file: "gloss-matte", label: "ผิวด้าน" },
    ],
    ["ผิวเงา — สีสดจัด เงาวาว", "ผิวด้าน — นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด"]
  );
  await coatCard(
    "coat-special",
    "เคลือบพิเศษ — เพิ่มเซ็ตละ 40 บาท",
    "เนื้อทราย · กลิตเตอร์ · โฮโลแกรม (เลือกลายฟิล์มได้อีก 1 แบบ)",
    [
      { file: "sand", label: "เนื้อทราย" },
      { file: "glitter", label: "กลิตเตอร์" },
      { file: "rainbow", label: "โฮโลแกรม" },
    ],
    ["ภาพฟิล์มจริงของร้าน — พื้นผิวเห็นชัดเมื่อโดนแสง", "โฮโลแกรมมีให้เลือกหลายลาย (รุ้ง ดาว หิมะ หัวใจ ฯลฯ)"]
  );
}

async function main() {
  await typeCards();
  await sizeCompare();
  await setCard();
  await coatCards();
  console.log(`\n✅ เสร็จ — ไฟล์อยู่ที่ ${OUT}`);
}

if (process.argv[1] && process.argv[1].endsWith("mirror-portable-art.mjs")) await main();

#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "สมุดโน๊ต" (notebook-ring)
 *
 *   node scripts/notebook-art.mjs [--out=<dir>]
 *
 * ได้ 8 ไฟล์ ลง .cache/notebook/upload — ที่มาแยกเป็น 3 ทาง:
 *
 * 1) ครอปรูปงานจริงในบล็อก "สมุดโน๊ต" ของหน้าตารางราคา → การ์ดประจำ "ขนาด"
 *      size-a7  เล่มเล็กในมือ — เห็น "ห่วงสีขาว" ชัด (ตรงกับที่เว็บเขียนว่า A7 = ห่วงสีขาว)
 *      size-a6  เล่มกลางสีแดง — ห่วงสีเงิน
 *      size-a5  เล่มใหญ่สีฟ้า — ห่วงสีเงิน
 *    ⚠️ เว็บไม่ได้เขียนกำกับใต้รูปว่ารูปไหนขนาดอะไร — ไล่จากรูปที่ถ่ายเล่มซ้อนกัน
 *    (ea8d3793 / f2d1ab92) ที่เห็นทั้ง 3 เล่มเทียบกัน + สีห่วงที่เว็บระบุไว้ จึงจับคู่ได้แน่นอนว่า
 *    เล็ก=A7(ห่วงขาว) · กลางแดง=A6 · ใหญ่ฟ้า=A5 (ทั้งคู่ห่วงเงิน)
 *
 * 2) ภาพฟิล์มเคลือบจริงจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *      coat-gloss / coat-matte / coat-special
 *    (ผิวฟิล์มย่อย 10 แบบในกลุ่ม "เคลือบ" ลิงก์ไฟล์คลังตรง ๆ ผ่าน preset ไม่ต้องอัปซ้ำ)
 *
 * 3) วาดเอง
 *      size-chart  เทียบขนาด A7 / A6 / A5 ตามสเกลเดียวกัน + สีห่วงของแต่ละขนาด
 *      howto-file  ผังทำไฟล์ปก (ตัดตก · พื้นที่ปลอดภัย · แนวห่วงริมซ้าย)
 *    ขนาดที่ใช้วาดเป็นขนาดมาตรฐานกระดาษ A (A7 74x105 · A6 105x148 · A5 148x210 มม.)
 *    เว็บบอกแค่ชื่อขนาด ไม่ได้บอกมิลลิเมตร — การ์ดจึงเขียนกำกับว่า "โดยประมาณ"
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/notebook/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const PAPER = "#f8fafc";
const CYAN = "#0891b2";

/** ไฟล์ในคลังฟิล์มเคลือบของร้าน (สินค้าตัวอื่นใช้ไฟล์ชุดนี้อยู่แล้ว) */
const COAT_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="132" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${810 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const caption = (cx, y, text, size = 26) =>
  `<text x="${cx}" y="${y}" font-family="${TH}" font-size="${size}" font-weight="600" text-anchor="middle" fill="${INK}">${esc(text)}</text>`;

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

/** wix id → ภาพต้นฉบับ (fit ไม่ให้ Wix ครอปทิ้งเอง) */
const wix = (id) => `https://static.wixstatic.com/media/${id}/v1/fit/w_1600,h_1600/x.jpg`;

/* ── 1. การ์ดขนาด — ครอปรูปงานจริง ───────────────────────────────── */

/**
 * รูปงานจริงในบล็อก "สมุดโน๊ต" (id wixstatic — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง)
 * crop = [left, top, width, height] เป็นสัดส่วน 0-1 ของภาพต้นฉบับ — ครอปให้เหลือเล่มที่ต้องการเล่มเดียว
 */
const SIZE_PHOTO = {
  "size-a7": {
    id: "959b83_cd83234918ec4659851193fa5b2cf376~mv2.jpg",
    crop: [0.0, 0.0, 0.74, 1.0],
    card: ["ขนาด A7", "เล่มเล็กพกพา · ห่วงสีขาว"],
    notes: ["ประมาณ 7.4 x 10.5 ซม. (ขนาดกระดาษ A7)", "รูปงานจริงของร้าน — เห็นห่วงสีขาวชัดตามที่ระบุไว้ในตารางราคา"],
  },
  "size-a6": {
    id: "959b83_95e786866122425990218d6c1862acd0~mv2.jpg",
    crop: [0.06, 0.0, 0.68, 1.0],
    card: ["ขนาด A6", "เล่มกลาง · ห่วงสีเงิน"],
    notes: ["ประมาณ 10.5 x 14.8 ซม. (ขนาดกระดาษ A6)", "รูปงานจริงของร้าน — ปกเคลือบพิเศษผิวกลิตเตอร์"],
  },
  "size-a5": {
    id: "959b83_f2d1ab929ada465d8b1c665ea1abca43~mv2.jpg",
    crop: [0.3, 0.0, 0.7, 1.0],
    card: ["ขนาด A5", "เล่มใหญ่ · ห่วงสีเงิน"],
    notes: ["ประมาณ 14.8 x 21 ซม. (ขนาดกระดาษ A5)", "รูปงานจริงของร้าน — ปกเคลือบพิเศษผิวโฮโลแกรม"],
  },
};

async function sizeCards() {
  console.log('🖼  การ์ดขนาด (ครอปรูปงานจริงในบล็อก "สมุดโน๊ต")');
  for (const [name, a] of Object.entries(SIZE_PHOTO)) {
    const img = sharp(await get(wix(a.id)));
    const meta = await img.metadata();
    const [l, t, w, h] = a.crop;
    const fitted = await img
      .extract({
        left: Math.round(meta.width * l),
        top: Math.round(meta.height * t),
        width: Math.round(meta.width * w),
        height: Math.round(meta.height * h),
      })
      .resize({ width: 720, height: 500, fit: "inside" })
      .toBuffer();
    const m = await sharp(fitted).metadata();
    const svg = frame(`${title(a.card[0], a.card[1])}${foot(a.notes)}`);
    const buf = await sharp(Buffer.from(svg))
      .composite([{ input: fitted, left: Math.round((W - m.width) / 2), top: 200 + Math.round((500 - m.height) / 2) }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    save(name, buf);
  }
}

/* ── 2. การ์ดเคลือบ — ภาพฟิล์มจริงจากคลังของร้าน ─────────────────── */

async function coatCard(name, cardTitle, cardSub, films, notes) {
  const gap = 22;
  const tw = Math.min(Math.floor((830 - gap * (films.length - 1)) / films.length), 560);
  const thh = Math.min(Math.round(tw * 0.78), 420);
  const tiles = [];
  for (const f of films) {
    // inside ไม่ใช่ cover — ภาพฟิล์มของร้านมีป้ายชื่อผิวอยู่มุมภาพ ครอปแล้วป้ายขาด
    tiles.push(
      await sharp(await get(`${COAT_BASE}/${f.file}.jpg`))
        .resize({ width: tw, height: thh, fit: "inside" })
        .toBuffer()
    );
  }
  // จัดกลางตาม "ความสูงจริงหลังย่อ" ไม่ใช่ความสูงกล่อง — ไม่งั้นภาพลอยต่ำ เหลือที่ว่างโล่งด้านบน
  const real = Math.max(...(await Promise.all(tiles.map(async (t) => (await sharp(t).metadata()).height))));
  const x0 = Math.round((W - (tw * films.length + gap * (films.length - 1))) / 2);
  const y0 = Math.round(175 + (525 - (real + 82)) / 2); // 82 = ระยะจากก้นภาพถึงป้ายชื่อ
  const labels = films.map((f, i) => caption(x0 + i * (tw + gap) + tw / 2, y0 + real + 52, f.label)).join("");
  const svg = frame(`${title(cardTitle, cardSub)}${labels}${foot(notes)}`);
  const buf = await sharp(Buffer.from(svg))
    .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

/** 1 แผ่นฟิล์ม A3 เคลือบได้กี่เล่ม — A3 พับครึ่งไปเรื่อย ๆ ได้ A5 4 · A6 8 · A7 16 */
const PER_SHEET_TEXT = "A7 16 เล่ม · A6 8 เล่ม · A5 4 เล่ม";

async function coatCards(specialFee) {
  console.log("🖼  การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน)");
  await coatCard("coat-gloss", "เคลือบเงา", "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน", [{ file: "gloss", label: "ผิวเงา" }], [
    "สีสดขึ้น เงาวาว ปกทนรอยเปื้อนกว่าไม่เคลือบ",
    "ฟรี! ไม่บวกเพิ่มจากราคาในตาราง",
  ]);
  await coatCard("coat-matte", "เคลือบด้าน", "ฟิล์มผิวด้านนวล — ตัวอย่างผิวงานจริงของร้าน", [{ file: "gloss-matte", label: "ผิวด้าน" }], [
    "นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด",
    "ฟรี! ไม่บวกเพิ่มจากราคาในตาราง",
  ]);
  await coatCard(
    "coat-special",
    "เคลือบพิเศษ",
    "กลิตเตอร์ · ทราย · โฮโลแกรม (เลือกผิวย่อยได้อีก 10 แบบ)",
    [
      { file: "glitter", label: "กลิตเตอร์" },
      { file: "rainbow", label: "โฮโลแกรม-รุ้ง" },
      { file: "sand", label: "ทราย" },
    ],
    [
      `ค่าฟิล์มแผ่นละ ${specialFee} บาท — 1 แผ่น A3 เคลือบได้ ${PER_SHEET_TEXT}`,
      "เลือกผิวฟิล์มย่อยได้ในกลุ่ม “เคลือบ” · ปกที่เห็นวิบวับในรูปงานจริงคือเคลือบแบบนี้",
    ]
  );
}

/* ── 3. ของที่วาดเอง ──────────────────────────────────────────────── */

/**
 * สมุดห่วง 1 เล่ม — ปกสี่เหลี่ยมมุมมน + ห่วงลวดคู่เรียงริมซ้าย
 * x,y = มุมซ้ายบนของปก · ring = สีลวดห่วง (ขาว/เงิน)
 */
function notebook(x, y, w, h, { ring = "#cbd5e1", ringEdge = "#94a3b8", cover = "#e2e8f0", coverEdge = "#94a3b8", art = true } = {}) {
  const n = Math.max(4, Math.round(h / 34));
  const step = h / (n + 0.6);
  const rw = Math.max(9, Math.min(17, w * 0.11)); // ครึ่งความกว้างของห่วง (คร่อมสันซ้าย)
  const rh = Math.max(3.4, step * 0.3);
  const rings = Array.from({ length: n }, (_, i) => {
    const cy = y + step * (i + 0.8);
    return `<ellipse cx="${x.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rw.toFixed(1)}" ry="${rh.toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${Math.max(2.2, rh * 0.62).toFixed(1)}"/>
      <ellipse cx="${x.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rw.toFixed(1)}" ry="${rh.toFixed(1)}" fill="none" stroke="${ringEdge}" stroke-width="1" opacity="0.65"/>`;
  }).join("");
  // ลายบนปก = แถบสีจาง ๆ พอให้ดูออกว่าเป็นงานพิมพ์ ไม่ใช่ปกเปล่า
  const deco = art
    ? `<rect x="${x + w * 0.16}" y="${y + h * 0.17}" width="${w * 0.68}" height="${h * 0.3}" rx="${w * 0.05}" fill="#bae6fd" opacity="0.9"/>
       <rect x="${x + w * 0.16}" y="${y + h * 0.56}" width="${w * 0.5}" height="${h * 0.06}" rx="${h * 0.03}" fill="#fde68a"/>
       <rect x="${x + w * 0.16}" y="${y + h * 0.68}" width="${w * 0.68}" height="${h * 0.06}" rx="${h * 0.03}" fill="#e2e8f0"/>`
    : "";
  return `<g>
    <rect x="${x + w * 0.035}" y="${y + h * 0.03}" width="${w}" height="${h}" rx="${Math.min(14, w * 0.07)}" fill="#0f172a" opacity="0.07"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, w * 0.07)}" fill="${cover}" stroke="${coverEdge}" stroke-width="2"/>
    <line x1="${x + w * 0.22}" y1="${y}" x2="${x + w * 0.22}" y2="${y + h}" stroke="${coverEdge}" stroke-width="1" opacity="0.35"/>
    ${deco}${rings}
  </g>`;
}

/** ขนาดกระดาษมาตรฐาน A (มม.) — เว็บบอกแค่ชื่อขนาด การ์ดจึงกำกับว่า "โดยประมาณ" */
const SIZES = [
  { name: "A7", mm: [74, 105], ring: "ห่วงสีขาว", ringFill: "#ffffff", ringEdge: "#cbd5e1" },
  { name: "A6", mm: [105, 148], ring: "ห่วงสีเงิน", ringFill: "#cbd5e1", ringEdge: "#94a3b8" },
  { name: "A5", mm: [148, 210], ring: "ห่วงสีเงิน", ringFill: "#cbd5e1", ringEdge: "#94a3b8" },
];

/** การ์ดเทียบขนาด — วาด 3 เล่มด้วยสเกลเดียวกัน ยืนเส้นฐานเดียวกัน */
async function sizeChart() {
  const TALL = 388; // A5 (สูงสุด 210 มม.)
  const pxPerMm = TALL / 210;
  const base = 230 + TALL;
  const gap = 46;
  const widths = SIZES.map((s) => s.mm[0] * pxPerMm);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (SIZES.length - 1);
  let x = (W - total) / 2;
  const books = [];
  const labels = [];
  for (const [i, s] of SIZES.entries()) {
    const w = widths[i];
    const h = s.mm[1] * pxPerMm;
    books.push(notebook(x, base - h, w, h, { ring: s.ringFill, ringEdge: s.ringEdge }));
    labels.push(caption(x + w / 2, base + 46, s.name, 30));
    labels.push(
      `<text x="${x + w / 2}" y="${base + 82}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(`${s.mm[0] / 10} x ${s.mm[1] / 10} ซม.`)}</text>` +
        `<text x="${x + w / 2}" y="${base + 112}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${CYAN}">${esc(s.ring)}</text>`
    );
    x += w + gap;
  }
  await saveSvg(
    "size-chart",
    frame(`${title("เทียบขนาด A7 · A6 · A5", "วาดตามสเกลเดียวกัน — เทียบขนาดกันได้จริง")}
      ${books.join("")}${labels.join("")}
      ${foot(["ขนาดโดยประมาณตามมาตรฐานกระดาษ A · A7 ใช้ห่วงสีขาว · A6 และ A5 ใช้ห่วงสีเงิน"])}`)
  );
}

/** ผังทำไฟล์ปก — ตัดตก / พื้นที่ปลอดภัย / แนวเจาะห่วงริมซ้าย */
async function howtoCard() {
  const bw = 300;
  const bh = 426;
  const x = W / 2 - bw / 2;
  const y = 190;
  const bleed = 24;
  const safe = 32;
  const ringZone = 48;
  /** แถวคำอธิบายสัญลักษณ์ — ชิปสี + ข้อความ เรียงกลางการ์ด (ไม่ให้ป้ายไปทับรูป) */
  const legend = [
    { fill: "#fef3c7", stroke: "#f59e0b", text: "เผื่อตัดตก 2-3 มม." },
    { fill: "#ffffff", stroke: CYAN, dash: true, text: "พื้นที่ปลอดภัย" },
    { fill: "#eef2f6", stroke: "#94a3b8", text: "แนวเจาะห่วง" },
  ];
  const lw = 250;
  const lx = (W - lw * legend.length) / 2;
  const ly = 700;
  await saveSvg(
    "howto-file",
    frame(`${title("การทำไฟล์ปก", "ทำไฟล์ตามขนาดที่สั่ง + เผื่อตัดตกรอบด้าน")}
      <rect x="${x - bleed}" y="${y - bleed}" width="${bw + bleed * 2}" height="${bh + bleed * 2}" rx="18" fill="#fef3c7"/>
      <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>
      <rect x="${x}" y="${y}" width="${ringZone}" height="${bh}" rx="12" fill="#0f172a" opacity="0.07"/>
      <rect x="${x + safe}" y="${y + safe}" width="${bw - safe * 2}" height="${bh - safe * 2}" rx="8" fill="none" stroke="${CYAN}" stroke-width="2" stroke-dasharray="9 7"/>
      ${Array.from({ length: 10 }, (_, i) => {
        const cy = y + 26 + i * ((bh - 52) / 9);
        return `<ellipse cx="${x + ringZone / 2}" cy="${cy.toFixed(1)}" rx="12" ry="5.5" fill="none" stroke="#94a3b8" stroke-width="3"/>`;
      }).join("")}
      ${legend
        .map((l, i) => {
          const cxx = lx + lw * i;
          return `<rect x="${cxx + 8}" y="${ly - 22}" width="34" height="28" rx="7" fill="${l.fill}" stroke="${l.stroke}" stroke-width="2"${l.dash ? ' stroke-dasharray="6 5"' : ""}/>
            <text x="${cxx + 52}" y="${ly}" font-family="${TH}" font-size="23" fill="${INK}">${esc(l.text)}</text>`;
        })
        .join("")}
      ${foot([
        "ไฟล์ .AI / .PSD / .PNG พื้นหลังใส · ความละเอียด 300 dpi ขึ้นไป",
        "เลี่ยงวางข้อความ/จุดสำคัญของลายไว้ริมซ้าย เพราะเป็นแนวเจาะห่วง",
      ])}`)
  );
}

/* ── รัน ──────────────────────────────────────────────────────────── */

const SPECIAL_FEE = Number((process.argv.find((a) => a.startsWith("--special-fee=")) || "").split("=")[1] || 30);

console.log(`🎨 ภาพประกอบตัวเลือก "สมุดโน๊ต" → ${OUT}`);
await sizeCards();
await coatCards(SPECIAL_FEE);
console.log("🖼  ของที่วาดเอง");
await sizeChart();
await howtoCard();
console.log(`\n✅ เสร็จ — ต่อด้วย node scripts/notebook-apply.mjs (--write เพื่ออัปจริง)`);

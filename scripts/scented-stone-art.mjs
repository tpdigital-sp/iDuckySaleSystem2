/**
 * เตรียมภาพสินค้า "แผ่นหินน้ำหอม (Scented Stone)" จากรูปงานจริงบนหน้า pricelists
 *
 *   node scripts/scented-stone-art.mjs            # โหลด + ครอป + ย่อ ลง .cache/scented-stone/upload
 *   node scripts/scented-stone-art.mjs --sheet    # ทำคอนแทคชีตไว้ตรวจก่อนอัป
 *
 * ที่มา: iduckyofficial-pricelists.com/รับทำแผ่นหินน้ำหอม (รูปงานจริงของร้านเอง โฮสต์บน static.wixstatic.com)
 * ทุกไฟล์ย่อกว้าง 1400px คุณภาพ 88 — พอสำหรับแกลเลอรีและภาพประจำตัวเลือก
 *
 * ภาพไหนคือทรงอะไร อ่านจากลำดับในหน้าเว็บ: บล็อกรูป 4 ใบใต้หัวข้อ "ทรง และ ขนาด"
 * เรียงตรงกับรายการ Plum blossom · Circle · Rhombus · Oval
 * ส่วนถุงผ้า ยึดจากคำบรรยายที่วางไว้ใต้รูป ("ถุงผ้า ขนาด 10x10 cm" · "ถุงหูหิ้ว ขนาด 11x12.5 cm")
 *
 * crop = [left, top, width, height] เป็นสัดส่วน 0-1 ของภาพต้นฉบับ
 * ใช้ตัดเฉพาะจุดที่ตัวเลือกนั้นพูดถึง ให้รูปย่อบนปุ่มอ่านออก
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import sharp from "sharp";

const OUT = ".cache/scented-stone/upload";
const SHEET = process.argv.includes("--sheet");
const WIDTH = 1400;

const src = (id) => `https://static.wixstatic.com/media/${id}/v1/fit/w_2000,h_2000/x.jpg`;

/** ชื่อไฟล์ → รูปต้นฉบับ (+ ครอป) · คำอธิบายไว้ให้คนอ่านสคริปต์รู้ว่าภาพไหนคืออะไร */
const ART = {
  // ── แกลเลอรีรูปสินค้า ────────────────────────────────────────────
  "photo-1": { id: "959b83_423e19fd91314e3a8bde43c784ea4275~mv2.jpg", note: "แผ่นหิน 4 ทรงเรียงรวม (ภาพปก)" },
  "photo-2": { id: "959b83_65a7edadcbd041a788c1e010b1bc07a1~mv2.jpg", note: "ทรงดอกไม้ + ถุงหูรูดแดง" },
  "photo-3": { id: "959b83_2867cdacbdd94425a3046ed47a2e6a25~mv2.jpg", note: "ทรงดอกไม้ + ถุงหูรูดเขียวมิ้นต์" },
  "photo-4": { id: "959b83_6ee8f3e2c5e04be7aa4293ff8e789a47~mv2.jpg", note: "ชุดแผ่นหิน + น้ำหอม 2ml ในซองใส" },
  "photo-5": { id: "959b83_4990de7717b34678b2fc7ce96d5170e6~mv2.jpg", note: "ถุงผ้า 2 แบบ (11x13 เจาะรู · 10x10 เชือกติดถุง)" },
  "photo-6": { id: "959b83_175a7819cd404c1895ea304015afc25c~mv2.jpg", note: "ถุงหูรูด 11x12.5 ซม." },
  "photo-7": { id: "959b83_35be93fc072d406e9787d2f8b8757ee2~mv2.jpg", note: "ถุงหูรูด + ถุงผ้าเรียงคู่" },

  // ── ภาพประจำตัวเลือก "ทรงแผ่นหิน" (4 ใบใต้หัวข้อ ทรง และ ขนาด) ──
  "shape-plum": { id: "959b83_456afeca5d1345b58e0e939fd976919b~mv2.jpg", note: "Plum blossom (ดอกไม้) 6.9x6.6cm" },
  "shape-circle": { id: "959b83_bda4a1ae44074362a61f5f72071510ae~mv2.jpg", note: "Circle (วงกลม) 6.8cm" },
  "shape-rhombus": { id: "959b83_9fa5c6fdb11041d5a541dd90dc8be328~mv2.jpg", note: "Rhombus 5x9cm" },
  "shape-oval": { id: "959b83_1f1f5f372a3b404a97e784643454c452~mv2.jpg", note: "Oval (วงรี) 5x9.2cm" },

  // ── ภาพประจำตัวเลือก "ถุงบรรจุ" ────────────────────────────────
  "bag-none": {
    id: "959b83_423e19fd91314e3a8bde43c784ea4275~mv2.jpg",
    crop: [0.3, 0.05, 0.55, 0.9],
    note: "ไม่ใส่ถุง — เฉพาะแผ่นหิน",
  },
  "bag-pouch10": { id: "959b83_d49d69c99935414ab9c77f3dc6749af4~mv2.jpg", note: "ถุงผ้า 10x10cm เชือกขาวติดกับถุง" },
  "bag-pouch13": { id: "959b83_83498abed4e8481997afbf06f7c9a796~mv2.jpg", note: "ถุงผ้า 11x13cm เจาะรูห้อยเชือก" },
  "bag-drawstring": { id: "959b83_175a7819cd404c1895ea304015afc25c~mv2.jpg", note: "ถุงหูรูด 11x12.5cm" },

  // ── ภาพประกอบแท็บ ──────────────────────────────────────────────
  "set-perfume": {
    id: "959b83_6ee8f3e2c5e04be7aa4293ff8e789a47~mv2.jpg",
    crop: [0.08, 0.15, 0.62, 0.8],
    note: "ขวดน้ำหอม 2ml ที่แถมไปกับแผ่นหิน",
  },
  "bag-hole": {
    id: "959b83_4990de7717b34678b2fc7ce96d5170e6~mv2.jpg",
    crop: [0.05, 0.15, 0.55, 0.7],
    note: "ถุงผ้า 11x13cm — เห็นตาไก่ที่เจาะรูห้อยเชือก",
  },
};

const cache = new Map();
async function fetchSrc(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch(src(id));
  if (!res.ok) throw new Error(`โหลดรูปไม่สำเร็จ (${res.status}) ${id}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`รูปเล็กผิดปกติ ${buf.length} ไบต์ — ${id}`);
  cache.set(id, buf);
  return buf;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [name, art] of Object.entries(ART)) {
    const buf = await fetchSrc(art.id);
    let img = sharp(buf);
    if (art.crop) {
      const { width, height } = await img.metadata();
      const [l, t, w, h] = art.crop;
      img = sharp(buf).extract({
        left: Math.round(l * width),
        top: Math.round(t * height),
        width: Math.round(w * width),
        height: Math.round(h * height),
      });
    }
    const out = await img
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    await writeFile(`${OUT}/${name}.jpg`, out);
    console.log(`🖼  ${name}.jpg  ${Math.round(out.length / 1024)} KB — ${art.note}`);
  }
  console.log(`\n✅ เตรียมภาพครบ ${Object.keys(ART).length} ไฟล์ ที่ ${OUT}`);
  if (SHEET) await sheet();
}

/** คอนแทคชีตไว้ตรวจด้วยตาก่อนอัปขึ้น Supabase */
async function sheet() {
  const files = readdirSync(OUT).filter((f) => f.endsWith(".jpg")).sort();
  const CELL = 260;
  const LABEL = 26;
  const COLS = 5;
  const rows = Math.ceil(files.length / COLS);
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const cell = await sharp(`${OUT}/${files[i]}`)
      .resize(CELL, CELL, { fit: "contain", background: "#ffffff" })
      .toBuffer();
    const label = await sharp(
      Buffer.from(
        `<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/>` +
          `<text x="6" y="19" font-family="monospace" font-size="16" fill="#fff">${files[i].replace(".jpg", "")}</text></svg>`
      )
    )
      .png()
      .toBuffer();
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    comps.push({ input: cell, left: c * CELL, top: r * (CELL + LABEL) });
    comps.push({ input: label, left: c * CELL, top: r * (CELL + LABEL) + CELL });
  }
  const path = ".cache/scented-stone/sheet.jpg";
  await sharp({ create: { width: COLS * CELL, height: rows * (CELL + LABEL), channels: 3, background: "#ffffff" } })
    .composite(comps)
    .jpeg({ quality: 82 })
    .toFile(path);
  console.log(`🧾 คอนแทคชีต: ${path}`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

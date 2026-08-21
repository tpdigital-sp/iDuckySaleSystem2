/**
 * เตรียมภาพสินค้า "กระเป๋า Wallet" จากรูปงานจริงบนหน้า pricelists
 *
 *   node scripts/wallet-art.mjs                 # โหลด + ครอป + ย่อ ลง .cache/wallet/upload
 *   node scripts/wallet-art.mjs --sheet         # ทำคอนแทคชีตไว้ตรวจก่อนอัป
 *
 * ที่มา: iduckyofficial-pricelists.com/wallet (รูปงานจริงของร้านเอง โฮสต์บน static.wixstatic.com)
 * ทุกไฟล์ย่อกว้าง 1400px คุณภาพ 88 — พอสำหรับแกลเลอรีและภาพประจำตัวเลือก
 *
 * crop = [left, top, width, height] เป็นสัดส่วน 0-1 ของภาพต้นฉบับ
 * ใช้ตัดเฉพาะจุดที่ตัวเลือกนั้นพูดถึง (ซิป · เชือกหูห้อย · งานปักชื่อ) ให้รูปย่อบนปุ่มอ่านออก
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import sharp from "sharp";

const OUT = ".cache/wallet/upload";
const SHEET = process.argv.includes("--sheet");
const WIDTH = 1400;

const src = (id) => `https://static.wixstatic.com/media/${id}/v1/fit/w_2000,h_2000/x.jpg`;

/** ชื่อไฟล์ → รูปต้นฉบับ (+ ครอป) · คำอธิบายไว้ให้คนอ่านสคริปต์รู้ว่าภาพไหนคืออะไร */
const ART = {
  // ── แกลเลอรีรูปสินค้า ────────────────────────────────────────────
  "photo-1": { id: "959b83_82f22680d7bc44a9b7204dc367aac8a2~mv2.jpg", note: "Wallet 4 เนื้อผ้าเรียงซ้อน (ภาพปก)" },
  "photo-2": { id: "959b83_0be9b45abd6c412596a3be6e0140093a~mv2.jpg", note: "แคนวาสซิปดำ + มือถือเทียบขนาด" },
  "photo-3": { id: "959b83_59161dd0dfcf41cba379380c727d9feb~mv2.jpg", note: "ไดคัทตามทรง (แมว)" },
  "photo-4": { id: "959b83_6590e72ac6534b60bf11d87e6d72bda1~mv2.jpg", note: "ผ้าขนยาว" },
  "photo-5": { id: "959b83_1073d65c6f974975bb931c759246c9f7~mv2.jpg", note: "ผ้าลูกฟูก" },
  "photo-6": { id: "959b83_ceea0d02b976429bbc1d42e2ee332084~mv2.jpg", note: "เปิดดูซับใน + ซิปขาว" },
  "photo-7": { id: "959b83_56a30759131d4aeca2dc171dae71f8ad~mv2.jpg", note: "ใส่เชือกหูห้อยสีขาว" },
  "photo-8": { id: "959b83_1b7142af3cd34737b794d17e6f77c39e~mv2.jpg", note: "ทรงเล็ก 10x11.5 ซม." },

  // ── ภาพประจำตัวเลือก "ขนาด / ทรง" ───────────────────────────────
  "size-small": { id: "959b83_1b7142af3cd34737b794d17e6f77c39e~mv2.jpg", note: "10x11.5cm ทรงสี่เหลี่ยมจัตุรัสเล็ก" },
  "size-large": { id: "959b83_32e51cd5d013492db8b5514475a6a1af~mv2.jpg", note: "14.5x18.5cm ทรงใหญ่แนวนอน" },
  "size-diecut": { id: "959b83_59161dd0dfcf41cba379380c727d9feb~mv2.jpg", note: "ไดคัทตามทรง 12x14cm" },

  // ── ภาพประจำตัวเลือก "เนื้อผ้า" ─────────────────────────────────
  "fab-canvas": { id: "959b83_0be9b45abd6c412596a3be6e0140093a~mv2.jpg", note: "ผ้าแคนวาส (เห็นลายทอ)" },
  "fab-shortfur": { id: "959b83_60831782e0f54308b9bbb0b1a1dab228~mv2.jpg", note: "ผ้าขนสั้น (ขนกำมะหยี่สั้น)" },
  "fab-corduroy": { id: "959b83_1073d65c6f974975bb931c759246c9f7~mv2.jpg", note: "ผ้าลูกฟูก (ร่องริ้ว)" },
  "fab-pu": { id: "959b83_40df52a0d86244f38cea60d57e774018~mv2.jpg", note: "หนังนิ่ม PU สีขาว (ผิวเรียบ)" },
  "fab-longfur": { id: "959b83_3f945c6099ae486cacfa822c5e6381da~mv2.jpg", note: "ผ้าขนยาว (ขนฟู)" },

  // ── ภาพประจำตัวเลือกย่อย (ครอปเฉพาะจุด) ───────────────────────
  "zip-white": {
    id: "959b83_32e51cd5d013492db8b5514475a6a1af~mv2.jpg",
    crop: [0.1, 0.38, 0.78, 0.5],
    note: "ซิปสีขาว",
  },
  "zip-black": {
    id: "959b83_0be9b45abd6c412596a3be6e0140093a~mv2.jpg",
    crop: [0.35, 0.25, 0.65, 0.45],
    note: "ซิปสีดำ",
  },
  strap: {
    id: "959b83_56a30759131d4aeca2dc171dae71f8ad~mv2.jpg",
    crop: [0.05, 0.45, 0.55, 0.55],
    note: "เชือกหูห้อยสีขาว",
  },
  embroidery: {
    id: "959b83_60831782e0f54308b9bbb0b1a1dab228~mv2.jpg",
    crop: [0.33, 0.45, 0.6, 0.55],
    note: "งานปักชื่อ",
  },
  lining: {
    id: "959b83_ceea0d02b976429bbc1d42e2ee332084~mv2.jpg",
    note: "ซับในด้านใน",
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
      .resize(CELL, CELL, { fit: "contain", background: "#fff" })
      .toBuffer();
    const left = (i % COLS) * CELL;
    const top = Math.floor(i / COLS) * (CELL + LABEL);
    comps.push({ input: cell, left, top });
    comps.push({
      input: Buffer.from(
        `<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#eef"/>` +
          `<text x="6" y="18" font-size="15" font-family="monospace">${files[i].replace(".jpg", "")}</text></svg>`
      ),
      left,
      top: top + CELL,
    });
  }
  await sharp({
    create: { width: COLS * CELL, height: rows * (CELL + LABEL), channels: 3, background: "#fff" },
  })
    .composite(comps)
    .jpeg({ quality: 84 })
    .toFile(".cache/wallet/sheet.jpg");
  console.log("📋 คอนแทคชีต: .cache/wallet/sheet.jpg");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

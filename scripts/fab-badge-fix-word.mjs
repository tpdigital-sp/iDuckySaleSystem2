/**
 * ✏️ แก้ตัวอักษร "ในรูป" ของป้ายปุ่มลอย — ใบบอท: คุยกับบ"อก" → คุยกับบ"อท"
 *    (เจ้าของร้านแจ้ง 22 ก.ย. 69 "มันต้องเขียนว่า คุยกับบอท ไม่ใช่คุยกับบอก")
 *
 * ปกติเวลาข้อความในภาพผิด ทางที่ถูกคือขอภาพใหม่จากเจ้าของร้านแล้วตัดใหม่ทั้งกอง
 * (scripts/fab-badges-from-sheet.mjs) — รอบนี้ภาพใหม่ส่งมาแล้วแต่ไฟล์ไม่ถึงเครื่อง
 * เลยต้องแก้ที่พิกเซลเอง สคริปต์นี้คือวิธีที่ใช้ เก็บไว้ให้ทำซ้ำ/ตรวจได้
 *
 *   node scripts/fab-badge-fix-word.mjs
 *   → public/landing/bot-chat-badge-v4b.webp   (ใบอื่นยังเป็น -v4 ตามเดิม ไม่ได้แตะ)
 *
 * ── วิธีที่ใช้: ยืมตัว "ท" จากป้ายอื่นในชุดเดียวกัน ไม่ได้เรนเดอร์ฟอนต์ใหม่ ──
 * ป้าย LINE ในชุดเดียวกันเขียนว่า "ทักเราได้เลยนะ" — ตัว ท ตัวแรกเป็นฟอนต์/สไตล์เดียวกันเป๊ะ
 * (ภาพทั้งกองมาจากไฟล์ต้นฉบับใบเดียวกัน) จึงตัดตัว ท ตัวนั้นมาเป็น "มาสก์" แล้วย้อมขาว
 * ดีกว่าเรนเดอร์ด้วย Mitr เพราะฟอนต์ในภาพไม่ใช่ Mitr — ตัวเดียวที่ไม่เข้าพวกจะสะดุดตาทันที
 *
 * ขั้นตอน:
 *   1. ทำมาสก์ ท จากป้าย LINE — ตัวหนังสือเขียวเข้มบนพื้นเขียวอ่อน
 *      alpha = (ความสว่างพื้น − ความสว่างพิกเซล) / (ความสว่างพื้น − ความสว่างหมึก)
 *   2. ขยายให้สูงเท่าตัว ก ที่จะไปแทน (ตัวหนังสือป้าย LINE เล็กกว่าป้ายบอท ~12%)
 *   3. ลบตัว ก เดิมออก แล้วปะพื้นหลังคืน — ไล่สีตามแนวนอนจากพื้นซ้าย→ขวาของช่องที่ลบ
 *      (พื้นป้ายไล่เฉดตามแนวตั้ง ไล่ทีละแถวแบบนี้จึงต่อเนียน ไม่เห็นรอย)
 *   4. วางเงาอ่อน ๆ ก่อน แล้วค่อยวางตัวอักษรขาวทับ — ตัวอักษรในภาพนี้มีเงาฟุ้งใต้ตัวจาง ๆ
 *      (วัดจากขา อ: ใต้ตัวอักษรพื้นเข้มลงจากพื้นปกติราว 10–15 หน่วย)
 *
 * ⚠️ พิกัดทั้งหมดผูกกับไฟล์ -v4 เป๊ะ ๆ ถ้าเปลี่ยนภาพชุดใหม่ สคริปต์นี้ใช้ไม่ได้แล้ว
 *    ให้กลับไปใช้ fab-badges-from-sheet.mjs ตัดจากภาพต้นฉบับแทน แล้วลบสคริปต์นี้ทิ้งได้เลย
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANDING = path.join(HERE, "..", "public", "landing");
const SRC_BOT = path.join(LANDING, "bot-chat-badge-v4.webp");
const SRC_LINE = path.join(LANDING, "line-chat-badge-v4.webp");
const OUT = path.join(LANDING, "bot-chat-badge-v4b.webp");

/* พิกัดที่วัดจากไฟล์ -v4 (หน่วย px ในไฟล์ภาพ ไม่ใช่บนจอ) */
const T_SRC = { x: 334, y: 102, w: 37, h: 42 }; // ตัว ท ในป้าย LINE (เผื่อขอบ 1px ให้ขอบฟุ้ง)
const T_BODY = { x: 335, y: 103, w: 35, h: 40 }; // ตัวอักษรจริง ๆ ไม่รวมขอบเผื่อ
const K_BODY = { x: 632, y: 101, w: 42, h: 45 }; // ตัว ก ที่จะเอาออก ในป้ายบอท
const ERASE = { x0: 630, x1: 679, y0: 96, y1: 154 }; // ช่องที่ลบแล้วปะพื้นคืน (เผื่อเงาใต้ตัว)
const BG_L = [627, 628, 629]; // คอลัมน์พื้นหลังสะอาดฝั่งซ้ายของช่องที่ลบ
const BG_R = [680, 681, 682]; // ฝั่งขวา
/* ⚠️ ต้องใช้ความสว่าง "กลาง ๆ ของเนื้อเส้น" ไม่ใช่จุดที่เข้มที่สุด
   เนื้อเส้นตัวอักษรไล่อยู่ราว 48–58 ถ้าตั้ง INK ตามจุดเข้มสุด (32) เนื้อในจะไม่ทึบเต็ม
   ตัวอักษรที่ได้จะโปร่งจาง ๆ เห็นพื้นฟ้าทะลุ ตัวจะหม่นกว่าเพื่อนข้าง ๆ ทันที */
const INK = 60; // ความสว่างของหมึกเขียวเข้มในป้าย LINE (เนื้อเส้น ไม่ใช่จุดเข้มสุด)
const PAPER = 231; // ความสว่างพื้นเขียวอ่อนรอบตัว ท

const lumOf = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

/* ── 1) มาสก์ตัว ท ──────────────────────────────────────────────────────── */
const line = await sharp(SRC_LINE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const LW = line.info.width;
const mask = Buffer.alloc(T_SRC.w * T_SRC.h);
let solid = 0;
for (let y = 0; y < T_SRC.h; y++) {
  for (let x = 0; x < T_SRC.w; x++) {
    const i = ((T_SRC.y + y) * LW + (T_SRC.x + x)) * 4;
    const a = (PAPER - lumOf(line.data, i)) / (PAPER - INK);
    const v = Math.max(0, Math.min(1, a));
    mask[y * T_SRC.w + x] = Math.round(v * 255);
    if (v > 0.95) solid++;
  }
}
console.log(`มาสก์ ท ${T_SRC.w}×${T_SRC.h} — พิกเซลทึบเต็ม ${solid} จุด`);

/* ── 2) ขยายให้ "ตัวอักษรจริง" สูงเท่าตัว ก ที่จะไปแทน ──────────────────── */
const scale = K_BODY.h / T_BODY.h;
const outW = Math.round(T_SRC.w * scale);
const outH = Math.round(T_SRC.h * scale);
/* ⚠️ sharp คืน raw ออกมาเป็น 3 ช่องสี แม้ป้อนเข้าไปช่องเดียว (มันแปลงเข้า sRGB ให้เอง)
   ถ้าอ่านเป็นช่องเดียวจะได้ลายทางแทนตัวอักษร — ต้องสั่ง toColourspace("b-w") และเช็คจำนวนช่อง */
const big = await sharp(mask, { raw: { width: T_SRC.w, height: T_SRC.h, channels: 1 } })
  .resize(outW, outH, { kernel: "lanczos3" })
  .toColourspace("b-w")
  .raw()
  .toBuffer({ resolveWithObject: true });
const MC = big.info.channels;
const maskBig = MC === 1 ? big.data : Buffer.from({ length: outW * outH }, (_, i) => big.data[i * MC]);
if (MC !== 1) console.log(`(sharp คืนมา ${MC} ช่อง — ดึงช่องแรกมาใช้)`);
// ขอบเผื่อ 1px ก็ถูกขยายไปด้วย ต้องเลื่อนจุดวางกลับมาเท่ากัน ตัวอักษรถึงจะทับที่ ก เดิมพอดี
const padX = Math.round((T_BODY.x - T_SRC.x) * scale);
const padY = Math.round((T_BODY.y - T_SRC.y) * scale);
const putX = K_BODY.x - padX;
const putY = K_BODY.y - padY;
console.log(
  `ขยาย ×${scale.toFixed(3)} → ${outW}×${outH} · ตัวอักษรกว้าง ${Math.round(T_BODY.w * scale)}px ` +
    `(ของเดิม ก กว้าง ${K_BODY.w}px) · วางที่ x${putX} y${putY}`,
);

/* ── 3) ลบตัว ก แล้วปะพื้นหลังคืนทีละแถว ────────────────────────────────── */
const bot = await sharp(SRC_BOT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const BW = bot.info.width;
const BH = bot.info.height;
const px = Buffer.from(bot.data);
const avg = (cols, y) => {
  const s = [0, 0, 0, 0];
  for (const x of cols) {
    const i = (y * BW + x) * 4;
    for (let c = 0; c < 4; c++) s[c] += px[i + c];
  }
  return s.map((v) => v / cols.length);
};
for (let y = ERASE.y0; y <= ERASE.y1; y++) {
  const L = avg(BG_L, y);
  const R = avg(BG_R, y);
  for (let x = ERASE.x0; x <= ERASE.x1; x++) {
    const t = (x - (ERASE.x0 - 1)) / (ERASE.x1 + 1 - (ERASE.x0 - 1));
    const i = (y * BW + x) * 4;
    for (let c = 0; c < 4; c++) px[i + c] = Math.round(L[c] + (R[c] - L[c]) * t);
  }
}

/* ── 4) เงาอ่อน + ตัวอักษรขาว ───────────────────────────────────────────── */
const blurRaw = await sharp(maskBig, { raw: { width: outW, height: outH, channels: 1 } })
  .blur(2.2)
  .toColourspace("b-w")
  .raw()
  .toBuffer({ resolveWithObject: true });
const BC = blurRaw.info.channels;
const blur = BC === 1 ? blurRaw.data : Buffer.from({ length: outW * outH }, (_, i) => blurRaw.data[i * BC]);
const SHADOW_DY = 4; // เงาเยื้องลงเท่าไร (วัดจากตัวอักษรข้าง ๆ ในภาพเดียวกัน)
const SHADOW_A = 0.13; // ความเข้มเงา
const INK_RGB = [249, 252, 253]; // สีขาวของตัวหนังสือในป้ายบอท (เฉลี่ยจากตัว อ ที่อยู่ติดกัน)
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const sx = putX + x;
    const sy = putY + y + SHADOW_DY;
    if (sx < 0 || sx >= BW || sy < 0 || sy >= BH) continue;
    const a = (blur[y * outW + x] / 255) * SHADOW_A;
    if (a <= 0) continue;
    const i = (sy * BW + sx) * 4;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * (1 - a));
  }
}
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const sx = putX + x;
    const sy = putY + y;
    if (sx < 0 || sx >= BW || sy < 0 || sy >= BH) continue;
    const a = maskBig[y * outW + x] / 255;
    if (a <= 0) continue;
    const i = (sy * BW + sx) * 4;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * (1 - a) + INK_RGB[c] * a);
  }
}

await sharp(px, { raw: { width: BW, height: BH, channels: 4 } }).webp({ quality: 92 }).toFile(OUT);
console.log(`เขียนแล้ว ${OUT.replace(/.*\/public\//, "public/")} (${BW}×${BH})`);

/**
 * 🎨 ปุ่มลอยมุมขวาทั้งกอง — ตัด "ภาพรวมกอง" ที่เจ้าของร้านส่งมา ออกเป็นไฟล์ละใบ
 *    (เจ้าของร้านส่งภาพรวมกองมาเรื่อย ๆ รอบละชุด: v3 · v4 · … สั่งสั้น ๆ ว่า
 *     "นำภาพที่ 1 ไปใส่แทนที่ภาพที่ 2" = เปลี่ยนทั้งกอง 4 ใบพร้อมกัน ไม่ใช่ทีละใบ)
 *
 * ต้นฉบับ = ภาพใบเดียวที่มีปุ่มเรียงกัน 4 ใบ พื้นหลังโปร่ง เรียงจากบนลงล่างตามกองปุ่มจริง:
 *   scripts/assets/fab-badges/fab-stack-owner-<ver>.webp
 * สคริปต์นี้แค่ "ตัดแยก" ไม่ได้แต่งสี/ย่อขยาย — ของที่ได้จึงตรงภาพต้นฉบับเป๊ะ
 *
 *   node scripts/fab-badges-from-sheet.mjs              → ใช้ ver ใหม่สุดที่มีในโฟลเดอร์
 *   node scripts/fab-badges-from-sheet.mjs --ver=v4     → ระบุรอบเอง
 *   node scripts/fab-badges-from-sheet.mjs --dry        → วัดอย่างเดียว ไม่เขียนไฟล์
 *
 * ⚠️ ทุกรอบเซฟเป็นชื่อใหม่ (-v3 · -v4 · …) ไม่ทับไฟล์เดิม
 *    ทับพาธเดิมแล้ว CDN/เบราว์เซอร์ยังจ่ายรูปเก่า · ของเก่ายังอยู่ครบ ย้อนได้ด้วยการชี้ชื่อไฟล์กลับ
 *
 * ── ทำไมต้องพิมพ์ตัวเลขออกมา ───────────────────────────────────────────────
 * กองปุ่มมุมขวาต้องกว้าง "เท่ากันทุกใบ" (แคปซูล 208px · ห่างขอบขวา 20px · ห่างกัน 12px)
 * แต่ในไฟล์ภาพ แต่ละใบมีเป็ด/ขีดกระเด็นโผล่พ้นขอบแคปซูลคนละระยะ และภาพแต่ละรอบก็ไม่เท่ากัน
 * ถ้าเอาขอบ "ไฟล์" ไปชิดขอบจอตรง ๆ แคปซูลจะเหลื่อมกันทันที
 * สคริปต์จึงวัดว่า "ตัวแคปซูล" อยู่ตรงไหนในไฟล์ แล้วคำนวณ width/height/right/bottom ให้เสร็จ
 * เอาเลขที่พิมพ์ออกมาไปวางใน landing.css ได้เลย (บล็อกท้ายไฟล์ของแต่ละปุ่ม)
 * 🔁 เปลี่ยนภาพใบไหนก็ตาม ต้องรันใหม่ "ทั้งกอง" แล้ววางเลขใหม่ทั้ง 4 ใบ
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ART = path.join(HERE, "assets", "fab-badges");
const OUT = path.join(HERE, "..", "public", "landing");
const DRY = process.argv.includes("--dry");

/** รอบที่จะตัด — ระบุด้วย --ver=v4 หรือปล่อยว่างให้หยิบเลขมากสุดที่มีในโฟลเดอร์ */
const VER =
  process.argv.find((a) => a.startsWith("--ver="))?.slice(6) ??
  readdirSync(ART)
    .map((f) => /^fab-stack-owner-v(\d+)\.webp$/.exec(f))
    .filter(Boolean)
    .map((m) => +m[1])
    .sort((a, b) => b - a)
    .map((n) => `v${n}`)[0];
if (!VER) throw new Error(`ไม่เจอภาพต้นฉบับใน ${ART} (ต้องชื่อ fab-stack-owner-v<เลข>.webp)`);
const SRC = path.join(ART, `fab-stack-owner-${VER}.webp`);

/** ชื่อไฟล์ปลายทาง เรียงจากใบบนสุดของภาพต้นฉบับลงมา (= เรียงจากบนสุดของกองปุ่มจริงพอดี) */
const NAMES = ["cart-shop-badge", "bot-chat-badge", "line-chat-badge", "admin-home-badge"].map(
  (n) => `${n}-${VER}`,
);

/** กติกาของกองปุ่มมุมขวา (หน่วย px บนจอจริง) — ชุดเดียวกับที่ใช้มาตั้งแต่ 21 ก.ย. 69 */
const CAPSULE_W = 208; // ความกว้างแคปซูลที่ทุกใบต้องเท่ากัน
const EDGE = 20; // ระยะจากขอบขวาของจอถึงขอบขวาแคปซูล
const GAP = 12; // ช่องไฟระหว่างแคปซูล
const FLOOR = 20; // ขอบล่างแคปซูลใบล่างสุด (ปุ่มทีมงาน)

const OPAQUE = 150; // อัลฟาที่ถือว่า "เนื้อปุ่ม" ไม่ใช่เงาฟุ้ง
const INK = 20; // อัลฟาที่ถือว่า "มีอะไรอยู่" (ใช้หาว่าแถวไหนมีปุ่ม)

const raw = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = raw.info;
const data = raw.data;
const alpha = (x, y) => data[(y * W + x) * 4 + 3];

/** แบ่งภาพต้นฉบับเป็นแถบ ๆ ตามช่องว่างโปร่งระหว่างปุ่ม */
function bands() {
  const ink = [];
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (alpha(x, y) > INK) c++;
    ink.push(c);
  }
  const out = [];
  let start = -1;
  for (let y = 0; y < H; y++) {
    const on = ink[y] > 8;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start > 40) out.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0 && H - start > 40) out.push([start, H - 1]);
  return out;
}

/** ขอบซ้าย-ขวาของแถบ (รวมเป็ด/เงา) */
function xRange(y0, y1) {
  let x0 = W, x1 = -1;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) <= INK) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  return [x0, x1];
}

/**
 * หา "ตัวแคปซูล" ในภาพที่ตัดมาแล้ว
 * แนวนอน: ใช้แถวที่มีเนื้อทึบต่อเนื่องยาวที่สุด = แถวกลางแคปซูล (เป็ดไม่ยาวเท่าแคปซูล)
 * แนวตั้ง: ส่องคอลัมน์ที่ 12% จากซ้าย — พ้นปลายโค้งแล้ว และยังไม่ถึงเป็ดที่อยู่ทางขวา
 */
function capsule(buf, w, h) {
  const a = (x, y) => buf[(y * w + x) * 4 + 3];
  let mid = 0, best = 0;
  for (let y = 0; y < h; y++) {
    let run = 0, mx = 0;
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 200) { run++; if (run > mx) mx = run; } else run = 0;
    }
    if (mx > best) { best = mx; mid = y; }
  }
  let left = 0, right = w - 1;
  while (left < w && a(left, mid) < OPAQUE) left++;
  while (right > 0 && a(right, mid) < OPAQUE) right--;
  const col = Math.round(left + (right - left) * 0.12);
  let top = 0, bottom = h - 1;
  while (top < h && a(col, top) < OPAQUE) top++;
  while (bottom > 0 && a(col, bottom) < OPAQUE) bottom--;
  return { left, right, top, bottom, w: right - left + 1, h: bottom - top + 1 };
}

const rows = bands();
if (rows.length !== NAMES.length) {
  throw new Error(`ภาพต้นฉบับควรมีปุ่ม ${NAMES.length} ใบ แต่ตัดได้ ${rows.length} แถบ — ภาพเปลี่ยนไปจากเดิมหรือเปล่า`);
}

const cut = [];
for (let i = 0; i < rows.length; i++) {
  const [y0, y1] = rows[i];
  const [x0, x1] = xRange(y0, y1);
  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const buf = await sharp(SRC).extract(box).ensureAlpha().raw().toBuffer();
  const cap = capsule(buf, box.width, box.height);
  cut.push({ name: NAMES[i], box, cap });
  if (!DRY) {
    await sharp(SRC).extract(box).webp({ quality: 92 }).toFile(path.join(OUT, `${NAMES[i]}.webp`));
  }
}

/* ── คำนวณเลขที่ต้องไปวางใน landing.css ────────────────────────────────────
   scale   = ย่อภาพเท่าไรแคปซูลถึงกว้าง 208px
   right   = EDGE ลบ "ที่ว่างทางขวาของแคปซูลในไฟล์" (ย่อแล้ว) → แคปซูลห่างขอบจอ 20px เป๊ะ
   bottom  = ขอบล่างแคปซูลที่อยากได้ ลบ "ที่ว่างใต้แคปซูลในไฟล์" (ย่อแล้ว)
   ไล่จากใบล่างสุดขึ้นไป ช่องไฟระหว่างแคปซูล 12px เท่ากันทุกคู่                       */
const stack = [...cut].reverse(); // ล่างสุด (ทีมงาน) → บนสุด (ตะกร้า)
let floor = FLOOR;
const lines = [];
for (const it of stack) {
  const scale = CAPSULE_W / it.cap.w;
  const dispW = it.box.width * scale;
  const dispH = it.box.height * scale;
  const capH = it.cap.h * scale;
  const right = EDGE - (it.box.width - 1 - it.cap.right) * scale;
  const bottom = floor - (it.box.height - 1 - it.cap.bottom) * scale;
  lines.push(
    `  ${it.name.padEnd(20)} ไฟล์ ${it.box.width}×${it.box.height}` +
      `  แคปซูลในไฟล์ x ${it.cap.left}–${it.cap.right} · y ${it.cap.top}–${it.cap.bottom}\n` +
      `  ${" ".repeat(20)} → width:${dispW.toFixed(1)}px; height:${dispH.toFixed(1)}px;` +
      ` right:${right.toFixed(1)}px; bottom:${bottom.toFixed(1)}px;` +
      `   (แคปซูลสูง ${capH.toFixed(1)}px · ขอบล่าง ${floor.toFixed(1)}px)`,
  );
  floor += capH + GAP;
}

console.log(`\n${DRY ? "วัดอย่างเดียว (--dry)" : "เขียนไฟล์แล้ว"} — ${SRC.replace(/.*\/scripts\//, "scripts/")} ${W}×${H}\n`);
console.log("เลขสำหรับ landing.css (ไล่จากใบล่างสุดของกองขึ้นไป):\n");
console.log(lines.join("\n\n"));
console.log(`\nความสูงรวมของกองปุ่ม ≈ ${(floor - GAP).toFixed(0)}px จากขอบล่างจอ\n`);

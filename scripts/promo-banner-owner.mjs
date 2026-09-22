/**
 * 🖼 เตรียมไฟล์ป้ายประชาสัมพันธ์จาก "ภาพที่เจ้าของร้านทำเอง" → .webp ขนาดจริง คมขึ้น
 *
 *   node scripts/promo-banner-owner.mjs [--dry] [id ...]
 *
 * ภาพต้นฉบับอยู่ที่ ~/Desktop/ป้ายประชาสัมพันธ์-iDucky-ชุด3/<id>-d.png (จอคอม) และ <id>-m.png (มือถือ)
 * (ไม่เก็บใน repo — ไฟล์ละ ~1.5MB · ชุดล่าสุด 22 ก.ย. 69 โทนฟ้า-ขาว เข้ากับหน้าเว็บ · สคริปต์นี้แยกสีพื้นให้ทีหลัง)
 *
 * ทำ 4 อย่าง:
 *   1) ย่อ/ขยายเป็นขนาดตาม BANNER_SPEC — จอคอม 2320×810 (ต้นฉบับ 2120×742 ขยาย ~9%) · มือถือ 1536×1024 (พอดีอยู่แล้ว)
 *   2) เปลี่ยนสีพื้นหลังจาง ๆ ให้แต่ละใบไม่ซ้ำกัน (ดูตาราง BANNERS) — ของอย่างอื่นในภาพไม่โดน
 *   3) เร่งความคม (unsharp เบา ๆ) ไม่ให้ตัวหนังสือเบลอตอนขยาย แล้วเซฟ webp คุณภาพ 92
 *   4) หา "ปุ่มในรูป" ให้เอง แล้วเขียนตำแหน่งวงแหวนเรียกกด (tap) ลง layers-<VER>.json
 *      — หาจากก้อนสีทึบที่ใหญ่ที่สุดในภาพ (ปุ่มกรม / ปุ่มเขียว LINE) ไม่ต้องไล่พิกัดเอง
 *
 * ผลลัพธ์ลง scripts/assets/promo-banners/ แล้วอัปขึ้นเว็บด้วย scripts/promo-banners-calm.mjs (ไฟล์นี้ไม่แตะฐานข้อมูล)
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(os.homedir(), "Desktop", "ป้ายประชาสัมพันธ์-iDucky-ชุด3");
const OUT = path.join(HERE, "assets", "promo-banners");
const VER = "v23"; // 22 ก.ย. 69: ภาพ "สั่งเองผ่านเว็บ" รอบล่าสุด — ขยับเลขทุกครั้งที่เปลี่ยนเนื้อรูป ไม่งั้น CDN จ่ายของเก่า

/**
 * ปุ่มของแต่ละป้าย: สีที่ใช้ตามหาก้อนปุ่ม + สีวงแหวนที่จะวาดทับ (ต้องตัดกับสีปุ่ม)
 * tint = หมุนสี "พื้นหลังฟ้าจาง" ไปเป็นสีพาสเทลประจำใบ (เจ้าของร้าน 22 ก.ย. 69: "โทนเดียวกันหมด ขอแตกต่างแต่คุมโทน")
 *   ทุกใบยังใช้ตัวหนังสือกรม การ์ดขาว ขีดเน้นเหลือง และของสีน้ำเงินเข้มในภาพเหมือนเดิม — เปลี่ยนแค่พื้นจาง ๆ
 *   deg = หมุนกี่องศา (พื้นเดิมฟ้า ~205°) · sat = คูณความจัดของสี (ต่ำกว่า 1 = จางลง ไม่ให้แสบตา)
 */
const NAVY = { r: 24, g: 56, b: 108 };
const BLUE = { r: 21, g: 101, b: 216 }; // ปุ่มน้ำเงินสดในภาพชุดใหม่
const LINE_GREEN = { r: 6, g: 199, b: 85 }; // เขียว LINE มาตรฐาน
const LINE_GREEN2 = { r: 78, g: 183, b: 68 }; // เขียวปุ่มในภาพชุด 22 ก.ย. 69 (อ่อนกว่า/อมเหลืองกว่า)

/**
 * ✨ จุดขยับเพิ่ม (เจ้าของร้าน 22 ก.ย. 69: "เพิ่มจุดขยับ ๆ ให้หน่อย") — วางในที่ว่างของภาพ ไม่ทับตัวหนังสือ/หน้าเป็ด
 * ดาววิบวับ (twinkle) + หัวใจลอยขึ้นแล้วจางหาย (rise) · รูปหยิบจาก /public/landing ที่หน้าเว็บใช้อยู่แล้ว
 * x/y/w = % ของป้าย (มุมซ้ายบนของชิ้น) · delay = เหลื่อมจังหวะ ไม่ให้กะพริบพร้อมกันเป็นแผง
 */
const STAR = "/landing/star.webp"; // ดาวเหลือง
const STAR4 = "/landing/star4.webp"; // ดาวฟ้า
const HEART = "/landing/heart.webp"; // หัวใจ (anim rise ย้อมเป็นชมพูให้เอง)
const sparkle = (src, x, y, w, delay = 0, opacity) => ({ src, x, y, w, anim: "twinkle", delay, opacity });
const floatHeart = (x, y, w, delay = 0) => ({ src: HEART, x, y, w, anim: "rise", delay });

const BANNERS = [
  {
    id: "web-order-24h", btn: NAVY, ring: "#FFB627", // ฟ้า — ใบหลัก คงสีเดิมของภาพไว้
    fx: {
      d: [sparkle(STAR, 33, 3, 2.3), sparkle(STAR4, 48, 4, 1.7, 1.1), sparkle(STAR, 24, 89, 1.5, 0.6, 0.85), floatHeart(50, 88, 2)],
      m: [sparkle(STAR, 46, 6, 3), sparkle(STAR4, 88, 30, 2.3, 1.1), sparkle(STAR, 33, 89, 2.2, 0.6, 0.85), floatHeart(58, 88, 2.8)],
    },
  },
  {
    id: "early-pay", btn: NAVY, ring: "#FFB627", // ใช้สีเดิมของภาพ — เจ้าของร้านสั่ง 22 ก.ย. 69 "ใช้ภาพที่ส่งให้ แทนที่ไปเลย" (เคยไล่เป็นพีช แล้วไม่เอา)
    fx: {
      d: [sparkle(STAR, 33, 4, 2.3), sparkle(STAR4, 66, 6, 1.7, 1.2), sparkle(STAR, 22, 89, 1.5, 0.6, 0.85), floatHeart(68, 86, 2)],
      m: [sparkle(STAR, 36, 4, 3), sparkle(STAR4, 52, 8, 2.3, 1.2), sparkle(STAR, 27, 89, 2.2, 0.6, 0.85), floatHeart(62, 88, 2.8)],
    },
  },
  {
    id: "member-tier", btn: NAVY, ring: "#FFB627", // ใช้สีเดิมของภาพ — เจ้าของร้านส่งภาพใหม่มาแทน 22 ก.ย. 69 (เคยไล่เป็นลาเวนเดอร์ แล้วไม่เอา)
    fx: {
      d: [sparkle(STAR, 47, 5, 2.3), sparkle(STAR4, 57, 13, 1.6, 1), sparkle(STAR, 34, 88, 1.5, 0.5, 0.85), floatHeart(62, 86, 2)],
      m: [sparkle(STAR, 66, 6, 3), sparkle(STAR4, 87, 34, 2.3, 1), sparkle(STAR, 30, 88, 2.2, 0.5, 0.85), floatHeart(60, 88, 2.8)],
    },
  },
  {
    id: "dealer", btn: BLUE, ring: "#FFB627", // ใช้สีเดิมของภาพ — ภาพชุดใหม่ 22 ก.ย. 69 (ปุ่มเป็นน้ำเงินสด ไม่ใช่กรม)
    fx: {
      d: [sparkle(STAR, 35, 3, 2.3), sparkle(STAR4, 48, 3, 1.6, 1), sparkle(STAR, 30, 90, 1.5, 0.5, 0.85), floatHeart(46, 88, 2)],
      m: [sparkle(STAR, 43, 5, 3), sparkle(STAR4, 88, 36, 2.3, 1), sparkle(STAR, 30, 89, 2.2, 0.5, 0.85), floatHeart(58, 88, 2.8)],
    },
  },
  {
    // ปุ่มเขียวของภาพแต่ละชุดคนละเฉด — ใส่ไว้ทั้งคู่ ให้ไล่หาจนเจอ (ภาพชุด 14:22 น. เขียวอ่อนกว่าเขียว LINE มาตรฐาน)
    id: "line-consult", btn: [LINE_GREEN2, LINE_GREEN], ring: "#FFFFFF", fadeHue: [140, 235], // พื้นใบนี้ออกเขียวมิ้นต์ ต้องเปิดช่วงเฉดให้กว้างกว่าใบอื่น
    fx: {
      d: [sparkle(STAR, 26, 2, 2.2), sparkle(STAR4, 62, 8, 1.6, 0.8), sparkle(STAR, 23, 90, 1.5, 0.4, 0.85), floatHeart(70, 84, 1.8)],
      m: [sparkle(STAR, 63, 5, 2.6), sparkle(STAR4, 14, 86, 2.2, 0.8), sparkle(STAR, 46, 88, 2, 0.4, 0.85), floatHeart(62, 84, 2.4)],
    },
  },
];

const SIZES = { d: { w: 2320, h: 810 }, m: { w: 1536, h: 1024 } };
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/**
 * กรอบปุ่มในภาพ (เป็น % ของป้าย) — ย่อภาพให้เล็กก่อน ทำหน้ากากสีปุ่ม
 * แล้วไล่หาก้อนที่ติดกันก้อนใหญ่สุดที่ทรงเป็นแคปซูล (ตัวหนังสือสีเดียวกันเป็นก้อนเล็ก ๆ จึงไม่ปน)
 */
async function findButton(file, target) {
  // รับหลายสีได้ — ลองไล่ทีละสีจนเจอ (ภาพแต่ละชุดใช้เฉดปุ่มไม่เท่ากัน)
  if (Array.isArray(target)) {
    for (const t of target) {
      const hit = await findButton(file, t);
      if (hit) return hit;
    }
    return null;
  }
  const W = 420;
  const { data, info } = await sharp(file).resize(W).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const near = (i) => {
    const dr = data[i] - target.r, dg = data[i + 1] - target.g, db = data[i + 2] - target.b;
    return dr * dr + dg * dg + db * db < 62 * 62;
  };
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let p = 0; p < w * h; p++) {
    if (seen[p] || !near(p * channels)) continue;
    // ไล่ก้อนที่ติดกันแบบ 4 ทิศ (stack ไม่ใช่ recursion — ก้อนใหญ่เป็นหมื่นพิกเซล)
    const stack = [p];
    seen[p] = 1;
    let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (stack.length) {
      const q = stack.pop();
      const x = q % w, y = (q / w) | 0;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (x > 0 && !seen[q - 1] && near((q - 1) * channels)) (seen[q - 1] = 1), stack.push(q - 1);
      if (x < w - 1 && !seen[q + 1] && near((q + 1) * channels)) (seen[q + 1] = 1), stack.push(q + 1);
      if (y > 0 && !seen[q - w] && near((q - w) * channels)) (seen[q - w] = 1), stack.push(q - w);
      if (y < h - 1 && !seen[q + w] && near((q + w) * channels)) (seen[q + w] = 1), stack.push(q + w);
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const ratio = bw / bh;
    // ปุ่มเป็นแคปซูลนอน กว้างกว่าสูง 1.8–9 เท่า และกินพื้นที่ในกรอบตัวเองเกินครึ่ง (ตัวหนังสือจะโปร่ง)
    if (ratio < 1.8 || ratio > 9 || n < bw * bh * 0.45 || n < 300) continue;
    if (!best || n > best.n) best = { n, x0, y0, bw, bh };
  }
  if (!best) return null;
  const pc = (v) => Math.round(v * 10) / 10;
  const pad = 0.02; // เผื่อขอบให้วงแหวนไม่ทับตัวหนังสือในปุ่ม
  return {
    x: pc((best.x0 / w - pad / 2) * 100),
    y: pc((best.y0 / h - pad) * 100),
    w: pc((best.bw / w + pad) * 100),
    h: pc((best.bh / h + pad * 2) * 100),
  };
}

/**
 * หมุนสีเฉพาะ "พื้นหลังฟ้าจาง" ในภาพ (แก้บัฟเฟอร์ตรง ๆ)
 * เงื่อนไขที่ยอมให้เปลี่ยน: สีโทนฟ้า-ม่วง (170–268°) · สว่างพอ (ไม่ใช่ตัวหนังสือ/ปุ่มกรม) · สีไม่จัด (ไม่ใช่ถุงน้ำเงิน ป้าย % ฟ้าเข้ม)
 * ของที่ "จงใจให้เหมือนกันทุกใบ" จึงรอด: ตัวหนังสือกรม ปุ่มกรม ปุ่มเขียว LINE เป็ดเหลือง กล่องน้ำตาล
 */
function tintBackground(data, ch, { deg, sat = 1, lo = 170, hi = 268, vMin = 0.5, sMax = 0.45 }) {
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max < vMin || d < 0.03 || d / max > sMax) continue;
    let h;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < lo || h > hi) continue;
    const s = Math.min(1, (d / max) * sat);
    const nh = (((h + deg) % 360) + 360) % 360;
    const c = max * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = max - c;
    const k = Math.floor(nh / 60);
    const rgb =
      k === 0 ? [c, x, 0] : k === 1 ? [x, c, 0] : k === 2 ? [0, c, x] : k === 3 ? [0, x, c] : k === 4 ? [x, 0, c] : [c, 0, x];
    data[i] = (rgb[0] + m) * 255;
    data[i + 1] = (rgb[1] + m) * 255;
    data[i + 2] = (rgb[2] + m) * 255;
  }
}

await mkdir(OUT, { recursive: true });
const layers = {};

for (const b of BANNERS.filter((b) => !ONLY.length || ONLY.includes(b.id))) {
  layers[b.id] = {};
  for (const [key, size] of Object.entries(SIZES)) {
    const src = path.join(SRC, `${b.id}-${key}.png`);
    const meta = await sharp(src).metadata();
    const out = path.join(OUT, `${b.id}-${key}-${VER}.webp`);
    if (!DRY) {
      const resized = sharp(src).resize(size.w, size.h, { kernel: "lanczos3" }).removeAlpha();
      // เปลี่ยนสีพื้นก่อน แล้วค่อยเร่งความคม (สลับกันจะได้ขอบเงาตามสีเดิม)
      const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
      if (b.tint) tintBackground(data, info.channels, b.tint);
      await sharp(data, { raw: info })
        // เร่งความคมเบา ๆ — แรงกว่านี้ขอบตัวหนังสือจะมีเงาขาว
        .sharpen({ sigma: 0.8, m1: 0.6, m2: 2.5 })
        .webp({ quality: 92, effort: 6 })
        .toFile(out);
    }
    const rect = await findButton(src, b.btn);
    const ring = rect ? [{ ...rect, anim: "tap", color: b.ring }] : [];
    const fx = [...ring, ...(b.fx?.[key] ?? [])];
    if (fx.length) layers[b.id][key] = fx;
    const kb = DRY ? 0 : Math.round((await stat(out)).size / 1024);
    console.log(
      `${rect ? "✓" : "⚠"} ${b.id}-${key}: ${meta.width}×${meta.height} → ${size.w}×${size.h}${DRY ? " (dry)" : ` ${kb}KB`}` +
        (rect ? ` · ปุ่มที่ ${rect.x}%,${rect.y}% ขนาด ${rect.w}×${rect.h}%` : " · หาปุ่มไม่เจอ (ไม่ใส่วงแหวน)")
    );
  }
}

if (!DRY) {
  // รันเฉพาะบางใบ (เช่น `node ... dealer`) ต้องไม่ลบตำแหน่งปุ่มของใบอื่นที่ทำไว้แล้ว
  const file = path.join(OUT, `layers-${VER}.json`);
  const old = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  await writeFile(file, JSON.stringify({ ...old, ...layers }, null, 2) + "\n");
  console.log(`\nเสร็จแล้ว — ไฟล์รุ่น ${VER} อยู่ที่ scripts/assets/promo-banners/`);
  console.log("อัปขึ้นเว็บ: node --env-file=.env.local scripts/promo-banners-calm.mjs");
}

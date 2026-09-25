/**
 * 🎨 ปุ่มลอยมุมขวาทั้งกอง — ย้อมภาพชุดเดิมให้เป็น "โทนเว็บ" (เจ้าของร้านสั่ง 22 ก.ย. 69)
 *
 *   "ทั้ง 4 อันนี้ออกแบบให้ใหม่หน่อย เดิมสีมันจัดจ้านไปหน่อย ไม่ค่อยเข้ากับเว็บ"
 *
 * ไม่ได้วาดใหม่ — หยิบไฟล์เดิมใน /public/landing มา "เปลี่ยนเฉพาะสี" ทรงจึงอยู่ที่เดิมเป๊ะ
 * ระยะที่วัดไว้ใน landing.css (width/height/right/bottom ของแต่ละใบ) ใช้ต่อได้ไม่ต้องแก้
 *
 * แยกชิ้นด้วย "เฉดสี (hue)" ล้วน ๆ — ภาพต้นฉบับแยกกันชัดอยู่แล้ว:
 *   ตัวเป็ด (เหลือง 30–60°) · ปากส้ม · แก้มชมพู · ขาว-ดำ  →  ไม่แตะเลยทุกใบ
 *   ที่เหลือคือพื้น/ขอบ/ของประกอบของแต่ละใบ → ย้ายเข้าชุดสีเว็บตามตาราง PRESET
 *
 * ⚠️ เซฟเป็นชื่อใหม่ (-v2) ไม่ทับไฟล์เดิม — ทับพาธเดิมแล้ว CDN/เบราว์เซอร์ยังจ่ายรูปเก่า
 *    ของเดิมยังอยู่ครบ ย้อนกลับได้ด้วยการชี้ชื่อไฟล์กลับ
 *
 *   node scripts/fab-badges-calm.mjs [cart|bot|line ...]
 */
import sharp from "sharp";

/** ช่วงเฉดสีของ "พื้น/ขอบ" แต่ละใบ + ปลายทางที่อยากได้ */
const PRESET = {
  // ตะกร้า — ฟ้านีออน #2F98FF + น้ำเงินสด #0372F5 (ป้าย SHOP!) → ฟ้าอ่อนชุดเว็บ + กรม
  cart: {
    file: "cart-shop-badge",
    hue: [165, 265],
    map: ({ h, s, l }) =>
      l < 0.35                                   // ไอคอนรถเข็น + คำว่า "ตะกร้า" → กรม #173A6B
        ? { h: 214 + (h - 215) * 0.25, s: Math.min(0.64, s * 0.66), l: 0.1 + l * 0.45 }
        : h >= 206                               // ป้าย SHOP! (น้ำเงินสด) → ฟ้าเข้มที่ยังอ่านตัวขาวออก
        ? { h: 210 + (h - 215) * 0.3, s: s * 0.66, l: l + (1 - l) * 0.1 }
        : { h: 200 + (h - 198) * 0.4, s: s * 0.76, l: l + (1 - l) * 0.28 }, // ขอบ ถุง ขีดกระเด็น
  },
  // คุยกับบอท — น้ำเงินสดทั้งใบ → กรมชุดเว็บ (สีเดียวกับปุ่มหลัก .btn-primary)
  bot: {
    file: "bot-chat-badge",
    hue: [165, 265],
    map: ({ h, s, l }) => ({
      h: 213 + (h - 210) * 0.35,
      s: Math.min(0.66, s * 0.68),
      l: l * 0.82,                               // พื้นเข้มลง ตัวหนังสือขาวยิ่งอ่านชัด
    }),
  },
  // LINE — เขียวสด → เขียว LINE ที่นุ่มลง (คงเฉดเขียวไว้ ไม่งั้นไม่รู้ว่าเป็น LINE)
  line: {
    file: "line-chat-badge",
    hue: [80, 165],
    map: ({ h, s, l }) => ({
      h: 140 + (h - 132) * 0.4,
      s: s * 0.72,
      l: l * 1.0 + 0.04,
    }),
  },
};

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const l = (mx + mn) / 2;
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return t.map((v) => Math.round((v + m) * 255));
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

for (const [key, p] of Object.entries(PRESET)) {
  if (only.length && !only.includes(key)) continue;
  const src = `public/landing/${p.file}.webp`;
  const out = `public/landing/${p.file}-v2.webp`;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let touched = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 8) continue;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    // ขาว/ดำ/ไฮไลต์ ปล่อยไว้ ไม่งั้นตัวหนังสือในป้ายทึบ · นอกช่วงเฉด = ตัวเป็ด ปล่อยไว้
    if (s < 0.12 || l > 0.9 || l < 0.04) continue;
    if (h < p.hue[0] || h > p.hue[1]) continue;

    const n = p.map({ h, s, l });
    const [r2, g2, b2] = hsl2rgb(n.h, n.s, n.l);
    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
    touched++;
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .webp({ quality: 92, effort: 6, alphaQuality: 100 })
    .toFile(out);
  console.log(`✅ ${out} — ${info.width}×${info.height} · แก้สีไป ${touched.toLocaleString("th-TH")} จุด`);
}

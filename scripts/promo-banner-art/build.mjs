/**
 * 🎨 วาดไฟล์ป้ายประชาสัมพันธ์หน้าแรกจาก HTML ในโฟลเดอร์นี้ → .webp ขนาดจริง
 *
 *   node scripts/promo-banner-art/build.mjs [id ...]
 *
 * ทำไมเป็น HTML: ป้ายชุดนี้ใช้ "โทน/ฟอนต์/ปุ่ม ชุดเดียวกับหน้าเว็บ" (landing.css) — เขียนเป็น CSS
 * แล้วให้ Chrome วาด จึงได้ตัวหนังสือไทยที่สระ/วรรณยุกต์ถูกตำแหน่ง และแก้คำในป้ายได้เองทีหลัง
 * รูปประกอบทุกชิ้นหยิบจาก /public (มาสคอต ไอคอน 3 มิติ ชุดเดียวกับที่ใช้ในเว็บ) — ไม่ต้องจ้างวาดใหม่
 *
 * ขนาดตาม BANNER_SPEC ใน src/lib/promo-banners.ts : จอคอม 2320×810 (วาด 1160×405 ×2)
 * มือถือ 1536×1024 (วาด 384×256 ×4) · เปลี่ยนเนื้อรูปต้องขยับ VER ไม่งั้น CDN ยังจ่ายของเก่า
 *
 * ผลลัพธ์ลง scripts/assets/promo-banners/ แล้วค่อยอัปขึ้นเว็บด้วย scripts/promo-banners-calm.mjs
 * (ไฟล์นี้ไม่แตะฐานข้อมูล)
 *
 * ⚠️ ฟอนต์ Mitr / IBM Plex Sans Thai Looped โหลดจาก Google Fonts — ต้องต่อเน็ตตอนรัน
 *    ถ้าฟอนต์มาไม่ทัน Chrome จะวาดหน้าเปล่า (ตัวหนังสือหาย) สคริปต์จึงนับพิกเซลสีกรมก่อนเซฟ
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "assets", "promo-banners");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VER = "v9"; // 22 ก.ย. 69: ชุดโทนเว็บ (ของเดิมสีจัดจ้านเกินไป — เจ้าของร้านสั่ง)

/** ป้ายทั้งชุด · ringColor = สีวงแหวนเรียกกดที่ครอบปุ่มในรูป (ตัดกับสีปุ่ม) */
const BANNERS = [
  { id: "web-order-24h", ring: "#FFB627" },
  { id: "early-pay", ring: "#FFB627" },
  { id: "member-tier", ring: "#FFB627" },
  { id: "dealer", ring: "#FFB627" },
  { id: "line-consult", ring: "#FFFFFF" },
];

const SIZES = {
  d: { w: 1160, h: 405, scale: 2, suffix: "" },
  m: { w: 384, h: 256, scale: 4, suffix: ".m" },
};

/** ชั้น CSS ตอน "วัดตำแหน่งปุ่ม": ซ่อนทุกอย่าง เหลือปุ่มทาสีชมพูจัด แล้วไปหากรอบสีนั้นในภาพ */
const PROBE = `<style>
  .bn *{visibility:hidden!important}
  .bn{background:#fff!important}
  .cta{visibility:visible!important;background:#FF00FF!important;color:transparent!important;box-shadow:none!important}
  .cta *{visibility:hidden!important}
  .orb,.cloud,.duck{display:none!important}
</style>`;

async function shot(htmlPath, pngPath, { w, h, scale }) {
  await run(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    "--virtual-time-budget=8000",
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ]).catch((e) => {
    // Chrome คืน exit code ไม่ 0 ได้ทั้งที่ถ่ายรูปสำเร็จ (คำเตือน CVDisplayLink บนแมค)
    if (!e?.stdout?.includes("written to file") && !e?.stderr?.includes("written to file")) throw e;
  });
}

/** ตัวหนังสือสีกรมต้องโผล่มาจริง — ฟอนต์โหลดไม่ทัน = ป้ายว่างเปล่า ปล่อยผ่านไม่ได้ */
async function hasInk(pngPath) {
  const { data, info } = await sharp(pngPath).resize(600, null, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 90 && data[i + 1] < 110 && data[i + 2] < 150) dark++;
  }
  return dark > 400;
}

/** กรอบของปุ่มในภาพวัดตำแหน่ง → เป็น % ของป้าย (วงแหวน tap ใช้พิกัดแบบนี้) */
async function ctaRect(pngPath) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] < 90 && data[i + 2] > 200) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pc = (v) => Math.round(v * 10) / 10;
  // เผื่อขอบรอบปุ่มนิดหน่อยให้วงแหวนไม่ทับตัวหนังสือ
  const pad = 0.012;
  return {
    x: pc(((x0 / info.width) - pad / 2) * 100),
    y: pc(((y0 / info.height) - pad) * 100),
    w: pc(((x1 - x0) / info.width + pad) * 100),
    h: pc(((y1 - y0) / info.height + pad * 2) * 100),
  };
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
await mkdir(OUT, { recursive: true });
const layers = {};

for (const b of BANNERS.filter((b) => !only.length || only.includes(b.id))) {
  layers[b.id] = {};
  for (const [key, size] of Object.entries(SIZES)) {
    const html = path.join(HERE, `${b.id}${size.suffix}.html`);
    const png = path.join(OUT, `${b.id}-${key}-${VER}.png`);
    await shot(html, png, size);
    if (!(await hasInk(png))) throw new Error(`${b.id} (${key}): ตัวหนังสือไม่ขึ้น — ฟอนต์โหลดไม่ทัน ลองรันใหม่`);
    const webp = png.replace(/\.png$/, ".webp");
    await sharp(png).webp({ quality: 88, effort: 6 }).toFile(webp);

    // วัดตำแหน่งปุ่มจากไฟล์ probe (ถ่ายเล็ก ๆ พอ — คิดเป็น % อยู่แล้ว)
    const probeHtml = path.join(HERE, `.probe-${b.id}${size.suffix}.html`);
    await writeFile(probeHtml, (await readFile(html, "utf8")) + PROBE);
    const probePng = path.join(OUT, `.probe-${b.id}-${key}.png`);
    await shot(probeHtml, probePng, { ...size, scale: 1 });
    const rect = await ctaRect(probePng);
    if (rect) layers[b.id][key] = [{ ...rect, anim: "tap", color: b.ring }];
    await rm(probeHtml, { force: true });
    await rm(probePng, { force: true });
    await rm(png, { force: true });

    const kb = Math.round((await stat(webp)).size / 1024);
    console.log(`✓ ${path.basename(webp)} ${size.w * size.scale}×${size.h * size.scale} ${kb}KB`, rect ? `· ปุ่ม ${rect.x}%,${rect.y}%` : "· ไม่พบปุ่ม");
  }
}

await writeFile(path.join(HERE, "layers.json"), JSON.stringify(layers, null, 2) + "\n");
console.log(`\nเสร็จแล้ว — ไฟล์อยู่ที่ scripts/assets/promo-banners/ (รุ่น ${VER})`);
console.log("อัปขึ้นเว็บ: node --env-file=.env.local scripts/promo-banners-calm.mjs");

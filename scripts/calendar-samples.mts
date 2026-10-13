/**
 * 🖼 ภาพตัวอย่างการ์ดตัวเลือกปฏิทิน (พิมพ์ 1/2 ด้าน · รายปี/รายเดือน) — วาดด้วยตัววาดจริง lib/calendar-card
 *
 *   npx tsx --tsconfig tsconfig.json scripts/calendar-samples.mts <โฟลเดอร์ที่ลง @napi-rs/canvas> scripts/assets/calendar-samples
 *
 * @napi-rs/canvas ไม่ได้อยู่ในโปรเจกต์ (ใช้ครั้งคราว) — ลงไว้ที่อื่น: npm i @napi-rs/canvas@0.1.65 แล้วส่งโฟลเดอร์นั้นเข้ามา
 * ฟอนต์ใช้ Sukhumvit Set ของ macOS แทน Kanit · รูปในการ์ดเป็นวิวที่วาดขึ้นเอง (ไม่ใช่รูปลูกค้า)
 * ไฟล์ที่ได้ → calendar-photocard-build / calendar-postcard-build อัปขึ้นเป็นรูปการ์ดตัวเลือก
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { calFormat, coverPlacement, defaultBack, defaultText, drawPage, fmtW, fmtH, type CalDesign, type ImgRef } from "../src/lib/calendar-card";
const require = createRequire(process.argv[2] + "/");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/SukhumvitSet.ttc", "Kanit");
// ลายหลังโปสการ์ดใช้ Poppins (บนเว็บ) — ในเครื่องใช้ Avenir Next แทน
GlobalFonts.registerFromPath("/System/Library/Fonts/Avenir Next.ttc", "Poppins");
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const YEAR = 2027;

/** "รูปลูกค้า" สมมติ — ภาพวิวทะเล/ภูเขา เปลี่ยนโทนตาม hue */
function scene(hue: number): ImgRef {
  const W = 1600, H = 1200;
  const c = createCanvas(W, H);
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, `hsl(${hue},70%,62%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360},85%,82%)`);
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.fillStyle = `hsla(${(hue + 50) % 360},100%,92%,0.95)`;
  x.beginPath(); x.arc(W * 0.7, H * 0.33, 110, 0, Math.PI * 2); x.fill();
  const hill = (base: number, amp: number, col: string, ph: number) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= W; i += 20) x.lineTo(i, base - Math.sin(i / 260 + ph) * amp - Math.sin(i / 90 + ph * 2) * amp * 0.25);
    x.lineTo(W, H); x.fill();
  };
  hill(H * 0.6, 90, `hsl(${(hue + 150) % 360},28%,58%)`, 1);
  hill(H * 0.68, 60, `hsl(${(hue + 130) % 360},35%,38%)`, 3);
  const sea = x.createLinearGradient(0, H * 0.72, 0, H);
  sea.addColorStop(0, `hsl(${(hue + 5) % 360},60%,52%)`);
  sea.addColorStop(1, `hsl(${(hue + 15) % 360},65%,30%)`);
  x.fillStyle = sea; x.fillRect(0, H * 0.72, W, H);
  return { el: c, w: W, h: H };
}

/** วาดหน้าหนึ่งของรูปแบบ → canvas (k พิกเซล/มม.) */
function page(fmtKey: string, idx: number, k: number, hue = 200) {
  const f = calFormat(fmtKey);
  const p = f.pages[idx];
  const b = { ...defaultBack(YEAR), font: "kanit", accent: "#0f766e" };
  const d: CalDesign = { bg: "#ffffff", text: { ...defaultText(YEAR, f), font: "kanit" }, photos: {} };
  if (p.kind !== "photo" || idx > 0) d.text = idx === 0 ? d.text : null;
  const img = scene(hue);
  // ใส่รูปลงช่องตรง ๆ — ช่องว่างไม่ยืมรูปแล้ว (photoOf/slotSrc 13 ต.ค. 69) ไม่ใส่ = การ์ดตัวอย่างไม่มีรูป
  if (p.photo && p.kind !== "postback") d.photos = { [p.key]: { src: 0, pl: coverPlacement(p.photo, img) } };
  const c = createCanvas(Math.round(fmtW(f) * k), Math.round(fmtH(f) * k));
  drawPage(c.getContext("2d"), k, f, p, d, b, [img]);
  // ตัดขอบตัดตกออก = หน้าตาหลังตัดจริง
  const bl = f.bleed * k;
  const t = createCanvas(Math.round(f.trimW * k), Math.round(f.trimH * k));
  t.getContext("2d").drawImage(c, -bl, -bl);
  return t;
}

const S = 1000;
function board() {
  const c = createCanvas(S, S);
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#f0f9ff"); g.addColorStop(1, "#ecfdf5");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return { c, x };
}
function put(x: any, img: any, cx: number, cy: number, w: number, rot = 0) {
  const h = (img.height / img.width) * w;
  x.save(); x.translate(cx, cy); x.rotate((rot * Math.PI) / 180);
  x.shadowColor = "rgba(15,23,42,0.28)"; x.shadowBlur = 28; x.shadowOffsetY = 10;
  x.fillStyle = "#fff"; x.fillRect(-w / 2, -h / 2, w, h);
  x.shadowColor = "transparent";
  x.drawImage(img, -w / 2, -h / 2, w, h);
  x.strokeStyle = "rgba(15,23,42,0.08)"; x.lineWidth = 1.5; x.strokeRect(-w / 2, -h / 2, w, h);
  x.restore();
  return h;
}
function label(x: any, text: string, cx: number, cy: number, size = 34, color = "#334155") {
  x.font = `700 ${size}px Kanit`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = color;
  x.fillText(text, cx, cy);
}
function badge(x: any, text: string) {
  x.font = `700 40px Kanit`;
  const w = x.measureText(text).width + 56;
  x.fillStyle = "#0f766e";
  x.beginPath(); x.roundRect(S / 2 - w / 2, S - 112, w, 72, 36); x.fill();
  label(x, text, S / 2, S - 76, 40, "#ffffff");
}
const save = (c: any, name: string) => writeFileSync(`${OUT}/${name}.jpg`, c.toBuffer("image/jpeg", 90));

/* ── โปสการ์ด: 1 ด้าน / 2 ด้าน ── */
{
  const { c, x } = board();
  put(x, page("postcard-year1-P", 0, 6), S / 2, 455, 470);
  badge(x, "พิมพ์ 1 ด้าน · รูป + ปฏิทินด้านเดียว");
  save(c, "postcard-side-1");
}
{
  const { c, x } = board();
  put(x, page("postcard-year2-P", 0, 6), 285, 450, 400, -4);
  put(x, page("postcard-year2-P", 1, 6), 715, 450, 400, 4);
  label(x, "ด้านหน้า", 285, 790); label(x, "ด้านหลัง", 715, 790);
  badge(x, "พิมพ์ 2 ด้าน · หน้ารูป หลังปฏิทิน");
  save(c, "postcard-side-2");
}
{
  // 📮 พิมพ์ 2 ด้าน หลังลายโปสการ์ด (13 ต.ค. 69) — หน้า = รูป + ปฏิทิน · หลัง = ลายโปสการ์ด (แนวนอนให้เห็นลายชัด)
  const { c, x } = board();
  put(x, page("postcard-yearpb-L", 0, 6), 300, 300, 520, -3);
  put(x, page("postcard-yearpb-L", 1, 6), 700, 640, 520, 3);
  label(x, "ด้านหน้า", 300, 510); label(x, "ด้านหลัง", 700, 852);
  badge(x, "พิมพ์ 2 ด้าน · หลังเป็นลายโปสการ์ด");
  save(c, "postcard-side-pb");
}
/* ── โปสการ์ด: รายปี 8 ใบ / รายเดือน 13 ใบ ── */
{
  const { c, x } = board();
  const card = page("postcard-year1-L", 0, 5);
  for (let i = 7; i >= 0; i--) put(x, card, S / 2 + i * 9 - 30, 430 + i * 9 - 30, 700, 0);
  badge(x, "รายปี · 8 ใบ/ชุด (ปฏิทินทั้งปีทุกใบ)");
  save(c, "postcard-type-year");
}
{
  const { c, x } = board();
  const picks = [12, 9, 6, 3, 0]; // หน้า: ปก=0 · เดือน = 1..12
  const fan = [-24, -12, 0, 12, 24];
  picks.forEach((pi, i) => put(x, page("postcard-month-P", pi, 5, 200 + pi * 12), S / 2 + fan[i] * 8.5, 450 + Math.abs(fan[i]) * 2, 320, fan[i]));
  badge(x, "รายเดือน · 13 ใบ/ชุด (ปก + 12 เดือน)");
  save(c, "postcard-type-month");
}
/* ── โฟโต้การ์ด: 1 ด้าน / 2 ด้าน ── */
{
  const { c, x } = board();
  put(x, page("card1", 0, 14), S / 2, 450, 440);
  badge(x, "พิมพ์ 1 ด้าน · รูป + ปฏิทินด้านเดียว");
  save(c, "photocard-side-1");
}
{
  const { c, x } = board();
  put(x, page("card", 0, 14), 290, 450, 380, -4);
  put(x, page("card", 1, 14), 710, 450, 380, 4);
  label(x, "ด้านหน้า", 290, 820); label(x, "ด้านหลัง", 710, 820);
  badge(x, "พิมพ์ 2 ด้าน · หน้ารูป หลังปฏิทิน");
  save(c, "photocard-side-2");
}
/* ── โฟโต้การ์ด: แนวตั้ง / แนวนอน (13 ต.ค. 69) — หน้าเดียว (รูป + ปฏิทิน) ให้เห็นทรงชัด ── */
{
  const { c, x } = board();
  put(x, page("card1", 0, 14, 200), S / 2, 440, 400);
  badge(x, "แนวตั้ง · 5.5 × 8.5 ซม.");
  save(c, "photocard-ori-P");
}
{
  const { c, x } = board();
  put(x, page("card1-L", 0, 14, 200), S / 2, 440, 720);
  badge(x, "แนวนอน · 8.5 × 5.5 ซม.");
  save(c, "photocard-ori-L");
}
console.log("ok", OUT);

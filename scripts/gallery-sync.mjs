/**
 * 📸 ดึงอัลบั้มผลงานจากเว็บเดิม https://www.iduckyofficial.com/gallery → src/lib/gallery-data.json
 *
 * ใช้กับหน้า /gallery (เมนู "ผลงาน") — เจ้าของร้านสั่ง 17 ต.ค. 69 "เพิ่มหน้า ผลงาน โดยดึงภาพมาจากหน้า gallery"
 * เก็บแค่ชื่อไฟล์ ภาพจริงยังอยู่บน image.makewebcdn.com (ต่อขนาดผ่าน path เช่น r_400x400 / m_1200x0 ใน src/lib/gallery.ts)
 * เพิ่มอัลบั้มที่เว็บเดิมแล้วอยากให้ขึ้นหน้านี้ → รันใหม่: node scripts/gallery-sync.mjs แล้ว deploy
 *
 * ⚠️ เว็บเดิมจำกัดความถี่ (429) → ยิงทีละ 2 + รอแล้วลองใหม่ · หน้าอัลบั้มว่างก็ลองซ้ำ
 */
import { writeFileSync } from "node:fs";

const SITE = "https://www.iduckyofficial.com";
const UA = { headers: { "User-Agent": "Mozilla/5.0 (iDucky gallery sync)" } };
const PHOTO = "https://image.makewebcdn.com/makeweb/m_1920x0/uccSzrU5X/DefaultData/";
const COVER = "https://image.makewebcdn.com/makeweb/r_400x400/uccSzrU5X/DefaultData/";
const OUT = new URL("../src/lib/gallery-data.json", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
const fileOf = (url, base) => (url.startsWith(base) ? decodeURI(url.slice(base.length).replace(/\?v=\d+$/, "")) : null);

async function get(url) {
  for (let t = 0; ; t++) {
    const r = await fetch(url, UA);
    if (r.ok) return r.text();
    if (r.status !== 429 || t >= 8) throw new Error(`${r.status} ${url}`);
    await sleep(3000 * (t + 1));
  }
}

// 1) รายชื่ออัลบั้มทุกหน้า (หน้าละ 15 · ไล่จนหน้าที่ไม่มีอัลบั้ม)
const albums = [];
for (let p = 1; p < 100; p++) {
  const h = await get(`${SITE}/gallery&p=${p}`);
  const re = /<a href="\/album\/(\d+)\/[^"]*">[\s\S]*?<img src="([^"]+)"[\s\S]*?alt="([^"]*)"/g;
  let m;
  let n = 0;
  while ((m = re.exec(h))) {
    if (albums.some((a) => a.id === +m[1])) continue;
    albums.push({ id: +m[1], title: dec(m[3]), cover: fileOf(m[2], COVER) });
    n++;
  }
  if (!n) break;
}
console.log("อัลบั้ม", albums.length);

// 2) ภาพในแต่ละอัลบั้ม (class="gall-item" = ภาพในอัลบั้ม · ภาพอื่นบนหน้าเป็นแถบข้าง/ท้ายเว็บ)
let next = 0;
async function worker() {
  while (next < albums.length) {
    const a = albums[next++];
    for (let t = 0; t < 4; t++) {
      const h = await get(`${SITE}/album/${a.id}/x`);
      a.photos = [...h.matchAll(/class="gall-item" href="([^"]+)"/g)].map((x) => fileOf(x[1], PHOTO)).filter(Boolean);
      a.desc = dec((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
      if (a.photos.length) break;
      await sleep(1500 * (t + 1));
    }
    await sleep(250);
  }
}
await Promise.all([worker(), worker()]);

const empty = albums.filter((a) => !a.photos.length);
if (empty.length) console.warn("⚠️ อัลบั้มที่ไม่มีภาพ (ข้าม):", empty.map((a) => `${a.id} ${a.title}`).join(", "));

const out = albums
  .filter((a) => a.photos.length)
  .map((a) => ({
    id: a.id,
    // ชื่อที่ขึ้นต้นด้วยสระ/วรรณยุกต์ลอย (พิมพ์พลาดในเว็บเดิม) ตัดทิ้ง
    t: a.title.replace(/^[ัิ-ฺ็-๎]+/, ""),
    ...(a.desc && a.desc !== a.title ? { d: a.desc } : {}),
    c: a.cover && a.photos.includes(a.cover) ? a.cover : a.cover || a.photos[0],
    p: a.photos,
  }));
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log("เขียน", out.length, "อัลบั้ม ·", out.reduce((s, a) => s + a.p.length, 0), "ภาพ →", OUT.pathname);

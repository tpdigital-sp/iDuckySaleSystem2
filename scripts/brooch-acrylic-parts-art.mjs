#!/usr/bin/env node
/**
 * เข็มกลัดอะคริลิค (product id "1") — กลุ่ม "อะไหล่เข็มกลัด" เป็นการ์ด + ภาพอะไหล่ 7 ใบ
 *
 *   node scripts/brooch-acrylic-parts-art.mjs           (ครอปรูป + ประกอบการ์ดลง .cache/brooch-acrylic/parts ดูก่อน)
 *   node scripts/brooch-acrylic-parts-art.mjs --write   (+ อัปโหลด storage + ตั้ง display cards/imageSrc/desc + อ่านกลับ)
 *
 * รูปมาจากใบสเปคของร้าน (ไม่ได้วาดเอง — เป็นรูปถ่ายอะไหล่จริง):
 *   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/50_ของใช้และของที่ระลึก/เข็มกลัด/06-1_เข็มกลัดอคล/อะไหล่เข็มกลัด.jpg (6202×4135)
 *   ใบนี้มีครบทั้ง 7 ตัวที่อยู่ใน DB พอดี: P1 · P2 · P3 เงิน/ทอง/ใส · P4 · P7
 *   ⚠️ ไดรฟ์ไม่ได้ต่อตลอด — ครอปแล้ว "แคช" ไว้ที่ .cache/brooch-acrylic/parts-src/ รอบหน้ารันได้โดยไม่ต้องต่อไดรฟ์
 *
 * ⚠️ 7 ตัวเลือก ≥ CARDS_DENSE_FROM (6) → การ์ดเข้าโหมดกระชับ: รูป 48×48 · ไม่โชว์ desc
 *    รูปจึงครอปชิดตัวอะไหล่ให้เต็มเฟรมที่สุด (เงาโลหะ/พลาสติกขาว/พลาสติกใส แยกออกจากกันที่ 48 px)
 *    ข้อความบนภาพมีไว้ตอนกดดูรูปใหญ่ในแกลเลอรี
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "1";
const GROUP = "อะไหล่เข็มกลัด";
const VER = "v1";
const SHEET =
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/50_ของใช้และของที่ระลึก/เข็มกลัด/06-1_เข็มกลัดอคล/อะไหล่เข็มกลัด.jpg";
const SRC_CACHE = ".cache/brooch-acrylic/parts-src";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/brooch-acrylic/parts").replace(/\/$/, "");
mkdirSync(SRC_CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const BAND = 158;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";

/**
 * กรอบขาวของแต่ละช่องบนใบสเปค — พิกัดวัดจากภาพย่อกว้าง 620 px (หาโดยไล่หา "ก้อนสีขาวใหญ่" ในใบ)
 * เผื่อขอบเข้ามาเล็กน้อยแล้ว ให้ป้ายรหัส/ป้ายราคาของใบสเปคหลุดออกนอกกรอบ
 */
const SHEET_W = 6202;
const S = SHEET_W / 620;
const box = (x1, y1, x2, y2) => ({
  left: Math.round(x1 * S), top: Math.round(y1 * S),
  width: Math.round((x2 - x1) * S), height: Math.round((y2 - y1) * S),
});

/** ชื่อ `choice` ต้องตรงกับใน DB เป๊ะ ๆ (กลุ่มนี้ไม่ใช่แกนราคา แต่ `extra` ผูกกับชื่อ) */
const PARTS = [
  {
    choice: "P1", file: "part-p1", panel: box(70, 138, 190, 214), extra: 3,
    title: "P1 · เข็มกลัดติดอะคริลิค (สีเงิน)",
    desc: "แป้นโลหะแบนมีรู ติดกาวกับหลังชิ้นงาน + เข็มกลัดนิรภัยในตัว · เหมาะกับชิ้นงาน 3 ซม. ขึ้นไป",
  },
  {
    choice: "P2", file: "part-p2", panel: box(248, 134, 374, 214), extra: 10,
    title: "P2 · เข็มกลัดหัวล็อคได้ (สีเงิน)",
    desc: "เข็มยาวล็อคหัวได้ แน่นกว่า P1 กันหลุดระหว่างใช้งาน · เหมาะกับชิ้นงาน 3 ซม. ขึ้นไป",
  },
  {
    choice: "P3 สีเงิน", file: "part-p3-silver", panel: box(426, 136, 468, 190), extra: 10,
    title: "P3 · เข็มกลัดหมุด สีเงิน",
    desc: "หมุดเสียบ + ตัวล็อคหลัง แป้นขนาด 1 ซม. · ทรงเดียวกับเข็มกลัดสะสม (pin badge)",
  },
  {
    choice: "P3 สีทอง", file: "part-p3-gold", panel: box(474, 136, 512, 190), extra: 10,
    title: "P3 · เข็มกลัดหมุด สีทอง",
    desc: "หมุดเสียบ + ตัวล็อคหลัง แป้นขนาด 1 ซม. · สีทองเข้ากับงานโทนอุ่น/ฟอยล์ทอง",
  },
  {
    choice: "P3 สีใส", file: "part-p3-clear", panel: box(518, 136, 558, 190), extra: 10,
    title: "P3 · เข็มกลัดหมุด สีใส",
    desc: "หมุดเสียบ + ตัวล็อคหลังพลาสติกใส แป้นขนาด 1 ซม. · ตัวล็อคกลืนไปกับเสื้อ ไม่เด่น",
  },
  {
    choice: "P4", file: "part-p4", panel: box(128, 272, 272, 350), extra: 3,
    title: "P4 · เข็มกลัดพลาสติก (สีขาว)",
    desc: "ตัวเรือนพลาสติกขาว น้ำหนักเบา ไม่เป็นสนิม · เหมาะกับชิ้นงาน 3 ซม. ขึ้นไป",
  },
  {
    choice: "P7", file: "part-p7", panel: box(346, 272, 478, 350), extra: 5,
    title: "P7 · คลิปหนีบ + เข็มกลัด (สีใส)",
    desc: "หนีบกับกระเป๋า/กระเป๋าเสื้อได้เลย ไม่ต้องแทงเข็มผ่านผ้า · ตัวใสมองแทบไม่เห็น",
  },
];

/** หากรอบตัวอะไหล่จริงในช่อง (นับพิกเซลที่ไม่ใช่พื้นขาว) แล้วครอปชิด + เผื่อขอบนิดหน่อย */
async function inkCrop(panel) {
  const probeW = 400;
  const { data, info } = await sharp(SHEET).extract(panel).resize({ width: probeW }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const rows = new Int32Array(h);
  const cols = new Int32Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 226) { rows[y]++; cols[x]++; }
    }
  const firstAt = (a) => a.findIndex((v) => v >= 2);
  const lastAt = (a) => a.length - 1 - [...a].reverse().findIndex((v) => v >= 2);
  const x0 = firstAt([...cols]), x1 = lastAt(cols), y0 = firstAt([...rows]), y1 = lastAt(rows);
  if (x0 < 0 || y0 < 0) throw new Error("หาตัวอะไหล่ในช่องไม่เจอ — พิกัดกรอบเพี้ยน");
  const sc = panel.width / w;
  const pad = Math.round(18 * sc);
  return {
    left: Math.max(0, Math.round(panel.left + x0 * sc) - pad),
    top: Math.max(0, Math.round(panel.top + y0 * sc) - pad),
    width: Math.round((x1 - x0 + 1) * sc) + pad * 2,
    height: Math.round((y1 - y0 + 1) * sc) + pad * 2,
  };
}

/** รูปต้นทางของอะไหล่ 1 ตัว — ครอปจากไดรฟ์ถ้าต่ออยู่ ไม่งั้นใช้ที่แคชไว้ */
async function partPhoto(p) {
  const cached = `${SRC_CACHE}/${p.file}-src.png`;
  if (existsSync(SHEET)) {
    const buf = await sharp(SHEET).extract(await inkCrop(p.panel)).png().toBuffer();
    writeFileSync(cached, buf);
    return buf;
  }
  if (existsSync(cached)) return readFileSync(cached);
  throw new Error(`ไม่มีทั้งไดรฟ์และแคช — ต่อไดรฟ์ iDuckyShop แล้วรันใหม่ (${p.file})`);
}

/** การ์ด 1 ใบ: รูปอะไหล่เต็มพื้นที่ด้านบน + แถบชื่อ/ราคาด้านล่าง */
async function card(p) {
  const photo = await sharp(await partPhoto(p))
    .resize({ width: W - 64, height: H - BAND - 64, fit: "inside", withoutEnlargement: false })
    .toBuffer({ resolveWithObject: true });
  const px = Math.round((W - photo.info.width) / 2);
  const py = Math.round((H - BAND - photo.info.height) / 2);
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/></svg>`;
  const band = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND}">
    <rect width="${W}" height="${BAND}" fill="#0f172a"/>
    <text x="${W / 2}" y="62" font-family="${TH}" font-size="36" font-weight="700"
      text-anchor="middle" fill="#ffffff">${p.title}</text>
    <text x="${W / 2}" y="112" font-family="${TH}" font-size="30" font-weight="700"
      text-anchor="middle" fill="#7dd3fc">+ ${p.extra} บาท/ชิ้น (ตั้งแต่ 11 ชิ้นขึ้นไป)</text>
  </svg>`;
  return sharp(Buffer.from(bg))
    .composite([
      { input: photo.data, left: px, top: py },
      { input: Buffer.from(band), left: 0, top: H - BAND },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// ── ประกอบภาพ ──────────────────────────────────────────────────────
const built = [];
for (const p of PARTS) {
  const file = `${p.file}-${VER}.jpg`;
  const buf = await card(p);
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ ...p, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${p.title}`);
}
/* แผ่นรวม "ย่อ 48 px" แบบที่การ์ดโหมดกระชับเห็นจริง */
const T = 48;
const small = await Promise.all(built.map((b) => sharp(b.buf).resize(T, T).toBuffer()));
await sharp({ create: { width: T * built.length, height: T, channels: 3, background: "#ffffff" } })
  .composite(small.map((input, i) => ({ input, left: i * T, top: 0 })))
  .png()
  .toBuffer()
  .then((png) => sharp(png).resize(T * built.length * 4, T * 4, { kernel: "nearest" }).jpeg({ quality: 92 }).toFile(`${OUT}/_thumbs48-all.jpg`));
console.log(`🔎 ${OUT}/_thumbs48-all.jpg — ย่อ 48 px ทั้ง ${built.length} ใบเรียงเทียบ (ขยาย 4 เท่า)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/brooch-acrylic/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", key);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const group = (data.options ?? []).find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}" — หยุดก่อน`); process.exit(1); }

/* แตะแค่ display / imageSrc / desc / note — ชื่อตัวเลือกกับ extra ปล่อยไว้อย่างเดิม */
group.display = "cards";
group.note = "อะไหล่ที่ติดหลังชิ้นงานให้ · ราคาปลีก 1-10 ชิ้นรวมอะไหล่แล้ว — คิดเพิ่มตั้งแต่ 11 ชิ้นขึ้นไป";
for (const c of group.choices ?? []) {
  const p = built.find((x) => x.choice === c.name);
  if (!p) { console.error("ตัวเลือกใน DB ไม่มีในสคริปต์:", c.name); process.exit(1); }
  if (c.extra !== p.extra) { console.error(`extra ไม่ตรงใบสเปค: ${c.name} DB=${c.extra} ใบ=${p.extra}`); process.exit(1); }
  c.imageSrc = url[c.name];
  c.desc = p.desc;
}
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (g?.display !== "cards") { console.error("display ไม่ใช่ cards", g?.display); process.exit(1); }
for (const b of built) {
  const c = g.choices.find((x) => x.name === b.choice);
  if (c?.imageSrc !== url[b.choice] || c?.desc !== b.desc || c?.extra !== b.extra) {
    console.error("อ่านกลับไม่ตรง:", b.choice, c); process.exit(1);
  }
}
console.log(`✓ กลุ่ม "${GROUP}" การ์ด + ภาพครบ ${built.length} ตัวเลือก · extra ครบ อ่านกลับตรง · savedAt =`, back.data.savedAt);

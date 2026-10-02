// ภาพ SKU ฟิล์มเคลือบพิเศษใน /admin/stock ให้ "แยกออกจากกัน" ตอนย่อเป็น 40 px
//   เดิม SKU กลิตเตอร์/ทราย/hologram-* ยืมภาพชุดเคลือบกลาง coating-b (การ์ดเป็ดใบเดียวกันทุกผิว ต่างแค่ผิวฟิล์ม)
//   → ย่อเป็นแถวในหน้าคลังแล้วเป็นรูปเดียวกันหมด (เจ้าของร้านทัก 2 ต.ค. 69 "ภาพมันควรแยก")
//   ทำแผ่นใหม่ต่อผิว = ซูมผิวฟิล์มจากรูปงานจริง (เห็นเกล็ด/รุ้ง/ดาว/หิมะ) + ป้ายชื่อตัวใหญ่ด้านล่าง
//   เก็บที่ products/stock/coating/<key>-v1.jpg (ชื่อไฟล์ใหม่ + ?v= กันแคช) · ไม่แตะภาพตัวเลือกหน้าร้าน (coating-b เดิม)
//   SKU ที่ยืมภาพ "ไม่เคลือบ" (none-v1) เพราะเงื่อนไข เคลือบ(หลัง)=ไม่เคลือบ → คืนภาพของตัวเลือกเจ้าของลิงก์ (กระดาษ 130/150/… แกรม)
//
//   node scripts/stock-coating-tiles.mjs            # วาดลง .cache/stock-coating/ + ดูว่าจะเขียน SKU ไหน (ไม่เขียน)
//   node scripts/stock-coating-tiles.mjs --apply    # อัป Storage + เขียน imageUrl ลง stockItems
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const OUT = ".cache/stock-coating";
const VER = "v1";
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** key ชุดกลาง → ป้าย + มุมครอป (สัดส่วนของภาพ 1000 px · เลือกจุดที่เห็นผิวฟิล์มชัดสุด) */
const TILES = {
  glitter: { label: "กลิตเตอร์", at: [0.34, 0.58] },
  sand: { label: "ทราย", at: [0.32, 0.64] }, // ขอบการ์ด+เงา เห็นเนื้อด้านเม็ดทราย
  rainbow: { label: "รุ้ง", at: [0.44, 0.52] },
  star: { label: "ดาว", at: [0.34, 0.22] },
  snow: { label: "หิมะ", at: [0.56, 0.3] },
  heart: { label: "หัวใจ", at: [0.44, 0.5] },
  facet: { label: "เหลี่ยม", at: [0.44, 0.5] },
  dot: { label: "จุด", at: [0.44, 0.5] },
  dust: { label: "Dust", at: [0.44, 0.5] },
  stardust: { label: "Stardust", at: [0.44, 0.5] },
};
const W = 900, Z = 260; // ซูมหน้าต่าง 260 px จากต้นฉบับ 1000 px → ขยายเป็น 900
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";

const tile = async (key) => {
  const { label, at } = TILES[key];
  const tex = await sharp(`scripts/assets/coating-b/${key}.jpg`).extract({ left: Math.round(1000 * at[0]), top: Math.round(1000 * at[1]), width: Z, height: Z }).resize(W, W).sharpen({ sigma: 1 }).toBuffer();
  const fs = label.length > 6 ? 150 : 190;
  const svg = `<svg width="${W}" height="${W}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${W - 270}" width="${W}" height="270" fill="#ffffff" opacity="0.94"/>
    <text x="${W / 2}" y="${W - 82}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#0f172a">${label}</text></svg>`;
  return sharp(tex).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
};

// 1) วาดทุกแผ่น + พรีวิวขนาดแถวจริง 40 px
const bufs = {};
const strip = [];
for (const [i, key] of Object.keys(TILES).entries()) {
  bufs[key] = await tile(key);
  writeFileSync(`${OUT}/${key}-${VER}.jpg`, bufs[key]);
  strip.push({ input: await sharp(bufs[key]).resize(40, 40).toBuffer(), left: i * 48, top: 0 }, { input: await sharp(bufs[key]).resize(120, 120).toBuffer(), left: i * 120, top: 50 });
}
await sharp({ create: { width: 1200, height: 170, channels: 3, background: "#eef5fb" } }).composite(strip).png().toFile(`${OUT}/_preview.png`);
console.log(`🖼 วาด ${Object.keys(TILES).length} แผ่น → ${OUT}/ (ดู _preview.png = ขนาดแถวจริง 40 px + 120 px)`);

// 2) SKU ที่ต้องเปลี่ยนภาพ
const { data: products, error } = await sb.from("products").select("id,data");
if (error) throw new Error(error.message);
/** stockItemId → ภาพของตัวเลือกเจ้าของลิงก์ (ใช้คืนภาพให้ SKU ที่ยืม "ไม่เคลือบ") */
const hostImg = new Map();
for (const p of products ?? []) for (const o of p.data?.options ?? []) for (const c of o.choices ?? []) {
  if (!c.imageSrc) continue;
  if (c.stockItemId) hostImg.set(c.stockItemId, c.imageSrc);
  for (const l of c.stockLinks ?? []) if (l.stockItemId && !hostImg.has(l.stockItemId)) hostImg.set(l.stockItemId, c.imageSrc);
}
const docs = (await db.collection("stockItems").get()).docs.filter((d) => d.data().active !== false && !d.data().deletedAt && /\/coating-[ab]\/[a-z]+-v\d+\.jpg/.test(d.data().imageUrl ?? ""));
const ver = Date.now().toString(36);
const pub = (key) => `${sb.storage.from("product-images").getPublicUrl(`products/stock/coating/${key}-${VER}.jpg`).data.publicUrl}?v=${ver}`;
const plan = [];
for (const d of docs) {
  const { code, name, imageUrl } = d.data();
  const key = imageUrl.match(/\/coating-[ab]\/([a-z]+)-v\d+\.jpg/)[1];
  if (TILES[key]) plan.push({ id: d.id, code, name, from: key, to: pub(key), why: `ซูมผิว ${TILES[key].label}` });
  else if (key === "none" && hostImg.get(d.id) && !/\/coating-[ab]\//.test(hostImg.get(d.id))) plan.push({ id: d.id, code, name, from: key, to: hostImg.get(d.id), why: "คืนภาพตัวเลือกเจ้าของลิงก์" });
  else console.log(`⚠️ ${code} "${name}" ยืม coating-b/${key} — ไม่มีแผ่นให้ ข้าม`);
}
for (const x of plan) console.log(`  ${x.code.padEnd(20)} ${x.name.padEnd(28)} coating-b/${x.from} → ${x.to.replace(/^.*\/products\//, "…/").replace(/\?v=.*$/, "")}  (${x.why})`);
if (!APPLY) { console.log(`\n(ดูอย่างเดียว ${plan.length} SKU — ใส่ --apply เพื่ออัปภาพ + เขียนจริง)`); process.exit(0); }

// 3) อัป Storage + เขียน imageUrl
for (const key of Object.keys(TILES)) {
  const path = `products/stock/coating/${key}-${VER}.jpg`;
  const up = await sb.storage.from("product-images").upload(path, bufs[key], { contentType: "image/jpeg", upsert: true });
  if (up.error) { console.log("⛔ อัปไม่ได้", path, up.error.message); process.exit(1); }
}
console.log(`☁️ อัป ${Object.keys(TILES).length} แผ่น → products/stock/coating/`);
writeFileSync(`${OUT}/before-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(plan.map((x) => ({ id: x.id, code: x.code, imageUrl: docs.find((d) => d.id === x.id).data().imageUrl })), null, 1));
let n = 0;
for (const x of plan) { await db.collection("stockItems").doc(x.id).update({ imageUrl: x.to, updatedAt: new Date().toISOString() }); n++; }
console.log(`✅ เขียน imageUrl ${n}/${plan.length} SKU (สำรองของเดิมที่ ${OUT}/before-*.json)`);
process.exit(0);

#!/usr/bin/env node
/**
 * เข็มกลัดอะคริลิค (product id "1") — กลุ่ม "ขนาดด้านที่ยาวที่สุด" เป็นการ์ด + ภาพประกอบ 9 ใบ
 *
 *   node scripts/brooch-acrylic-size-cards.mjs           (วาดภาพลง .cache/brooch-acrylic/upload ดูก่อน)
 *   node scripts/brooch-acrylic-size-cards.mjs --write   (+ อัปโหลด storage + ตั้ง display cards/imageSrc/desc + อ่านกลับ)
 *
 * ⚠️ ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก — เป็นแกนตารางราคา driverLabels ["ขนาดด้านที่ยาวที่สุด","ชนิดอะคริลิค"]
 *    (คีย์ในตารางคือ "2cm│ธรรมดา" … "10cm│อะคริลิคพิเศษ") เปลี่ยนชื่อเมื่อไหร่ราคาหาย
 *
 * ดีไซน์: ทุกใบ "สเกลเดียวกัน" บนตารางช่องละ 1 ซม. — ชิ้นงานโตขึ้นทีละช่อง เห็นความต่างทันที
 *   ⚠️ 9 ตัวเลือก = การ์ดเข้าโหมดกระชับ (CARDS_DENSE_FROM = 6) → รูปเรนเดอร์แค่ 48×48 และ "ไม่โชว์ desc"
 *      ภาพจึงต้องอ่านออกด้วยรูปทรงล้วน ๆ: ตารางคงที่ + ชิ้นงานโต + เลขขนาดตัวใหญ่เต็มแถบล่าง
 *   ภาพจัตุรัส 900×900 ลงกล่องจัตุรัส = ย่อทั้งใบ ไม่ถูกครอป
 *
 * ข้อมูลจากใบสเปคร้าน (ไดรฟ์ 50_ของใช้และของที่ระลึก/เข็มกลัด/06-1_เข็มกลัดอคล/ราคา.jpg):
 *   ขนาดตั้งแต่ 5 cm ขึ้นไป บวกเพิ่ม cm. ละ 10 บาท · สีอะคริลิคพิเศษบวกเพิ่ม 10 บาท
 *   อะไหล่ P1/P2/P4/P7 เหมาะกับชิ้นงาน 3 cm ขึ้นไป
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "1";
const SIZE_GROUP = "ขนาดด้านที่ยาวที่สุด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/brooch-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลร่วมของทุกใบ — 1 ซม. = 52 px (10 ซม. = 520 px) */
const CM = 52;
/** ตาราง 14 × 12 ช่อง (ช่องละ 1 ซม.) — คงที่ทุกใบ เป็นไม้บรรทัดให้เทียบขนาดกัน */
const GW = 14;
const GH = 12;
const GX = (W - GW * CM) / 2;
const GY = 44;
const CX = GX + (GW * CM) / 2;
const CY = GY + (GH * CM) / 2;

/** ราคาปลีก 1-10 ชิ้น (รวมอะไหล่) และเรทถูกสุด 500++ ของเนื้อธรรมดา — ตรงกับ data.pricing ใน DB */
const SIZES = [
  { cm: 2, retail: 80, bulk: 12, note: "เล็กสุด · อะไหล่เข็มกลัดเหมาะกับชิ้นงาน 3 ซม. ขึ้นไป" },
  { cm: 3, retail: 80, bulk: 20, note: "ไซซ์เล็ก ติดปกเสื้อ/สายกระเป๋า ลายเดี่ยวชัด" },
  { cm: 4, retail: 90, bulk: 30, note: "ไซซ์ยอดนิยม คุ้มราคา ลายตัวคาแรกเตอร์ยังอ่านออก" },
  { cm: 5, retail: 90, bulk: 40, note: "เริ่มคิดเพิ่ม ซม. ละ ฿10 จากไซซ์นี้ขึ้นไป" },
  { cm: 6, retail: 100, bulk: 50, note: "เห็นรายละเอียดลายครบ เหมาะลายครึ่งตัว" },
  { cm: 7, retail: 110, bulk: 60, note: "ใส่ตัวหนังสือ/ชื่อได้สบาย" },
  { cm: 8, retail: 120, bulk: 70, note: "เด่นบนกระเป๋า/สายสะพาย" },
  { cm: 9, retail: 130, bulk: 80, note: "ลายเต็มตัว + ฉากหลังชัด" },
  { cm: 10, retail: 140, bulk: 90, note: "ใหญ่สุด · ลายซับซ้อนอ่านออกครบ" },
];

/** ลูกศรวัดแนวตั้ง — ขีดปลายสองข้าง + ป้ายตัวเลขคร่อมเส้น */
const dimV = (x, y1, y2, label) => {
  const lw = label.length * 14 + 24;
  const ly = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${OK}" stroke-width="2.5"/>
    <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${OK}" stroke-width="3"/>
    <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${OK}" stroke-width="3"/>
    <rect x="${x - lw / 2}" y="${ly - 20}" width="${lw}" height="40" rx="10" fill="#ffffff" opacity="0.96"/>
    <text x="${x}" y="${ly + 10}" font-family="${TH}" font-size="27" font-weight="700"
      text-anchor="middle" fill="${OK}">${label}</text>`;
};

/** ตาราง 1 ซม. — ไม้บรรทัดพื้นหลัง เหมือนกันทุกใบ */
const grid = () => {
  const lines = [];
  for (let i = 0; i <= GW; i++)
    lines.push(`<line x1="${GX + i * CM}" y1="${GY}" x2="${GX + i * CM}" y2="${GY + GH * CM}"
      stroke="#e2e8f0" stroke-width="${i % 5 === 0 ? 2.4 : 1.2}"/>`);
  for (let i = 0; i <= GH; i++)
    lines.push(`<line x1="${GX}" y1="${GY + i * CM}" x2="${GX + GW * CM}" y2="${GY + i * CM}"
      stroke="#e2e8f0" stroke-width="${i % 5 === 0 ? 2.4 : 1.2}"/>`);
  return `<rect x="${GX}" y="${GY}" width="${GW * CM}" height="${GH * CM}" fill="#fbfdff"/>
    ${lines.join("")}
    <rect x="${GX}" y="${GY}" width="${CM}" height="${CM}" fill="#ecfeff" opacity="0.9"/>
    <text x="${GX + CM / 2}" y="${GY + CM / 2 + 8}" font-family="${TH}" font-size="20" font-weight="700"
      text-anchor="middle" fill="${OK}">1 ซม.</text>`;
};

/**
 * ชิ้นงานเข็มกลัดอะคริลิค 1 ชิ้น — ไดคัทตามทรงลาย ขอบขาว 2 มม. เนื้ออะคริลิคใส
 * ด้านยาวสุด (ความสูง) = s.cm ซม. ตามชื่อกลุ่ม "ขนาดด้านที่ยาวที่สุด"
 */
const piece = (s) => {
  const h = s.cm * CM;
  const w = h * MASCOT.ratio;
  const x = CX - w / 2;
  const y = CY - h / 2;
  const r = Math.min(w, h) * 0.22;
  /* ขอบไดคัทขาว ~2 มม. — บางลงตามสัดส่วนชิ้นงานเล็ก */
  const pad = Math.max(CM * 0.2, 5);
  const mh = h * 0.82;
  const mw = mh * MASCOT.ratio;
  return `
  <rect x="${x - pad + 3}" y="${y - pad + 7}" width="${w + pad * 2}" height="${h + pad * 2}" rx="${r + pad}"
    fill="#0f172a" opacity="0.12"/>
  <!-- ขอบไดคัทขาว -->
  <rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="${r + pad}"
    fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <!-- เนื้ออะคริลิคใส + ลายพิมพ์ -->
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#e8f4fb"/>
  <rect x="${x}" y="${y + h * 0.58}" width="${w}" height="${h * 0.42}" rx="${r}" fill="#d3e9f7"/>
  <rect x="${x}" y="${y + h * 0.58}" width="${w}" height="${h * 0.2}" fill="#d3e9f7"/>
  <image href="${MASCOT.uri}" x="${CX - mw / 2}" y="${CY - mh / 2}" width="${mw}" height="${mh}"
    preserveAspectRatio="xMidYMid meet"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.75"/>
  <!-- แสงสะท้อนผิวอะคริลิค -->
  <path d="M ${x + w * 0.08} ${y + h} L ${x + w * 0.44} ${y} L ${x + w * 0.62} ${y} L ${x + w * 0.26} ${y + h} Z"
    fill="#ffffff" opacity="0.16"/>
  ${dimV(x - pad - 44, y - pad, y + h + pad, `${s.cm} ซม.`)}`;
};

function card(s) {
  const tag = `${s.cm} ซม.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${grid()}
  ${piece(s)}

  <!-- แถบเลขขนาดตัวใหญ่ — ตัวเดียวที่ยังอ่านออกตอนการ์ดย่อเหลือ 48 px -->
  <rect x="0" y="${GY + GH * CM + 12}" width="${W}" height="${H - (GY + GH * CM) - 12}" fill="#0f172a"/>
  <text x="${W / 2}" y="${H - 74}" font-family="${TH}" font-size="128" font-weight="800"
    text-anchor="middle" fill="#ffffff">${tag}</text>
  <text x="${W / 2}" y="${H - 26}" font-family="${TH}" font-size="26" text-anchor="middle" fill="#94a3b8">ด้านที่ยาวที่สุด · ไดคัทตามทรงลาย</text>
</svg>`;
}

// ── วาดภาพ ─────────────────────────────────────────────────────────
const built = [];
for (const s of SIZES) {
  const file = `size-${s.cm}cm-${VER}.jpg`;
  const buf = await sharp(Buffer.from(card(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ ...s, choice: `${s.cm}cm`, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ด้านยาวสุด ${s.cm} ซม.`);
}
/* แผ่นรวม "ย่อ 48 px" แบบที่การ์ดโหมดกระชับเห็นจริง — เรียงเทียบว่าแยกออกจากกันไหม */
const T = 48;
const scaled = await Promise.all(built.map((b) => sharp(b.buf).resize(T, T).toBuffer()));
await sharp({ create: { width: T * built.length, height: T, channels: 3, background: "#ffffff" } })
  .composite(scaled.map((input, i) => ({ input, left: i * T, top: 0 })))
  .png()
  .toBuffer()
  .then((png) => sharp(png).resize(T * built.length * 4, T * 4, { kernel: "nearest" }).jpeg({ quality: 92 }).toFile(`${OUT}/_thumbs48-all.jpg`));
console.log(`🔎 ${OUT}/_thumbs48-all.jpg — ย่อ 48 px ทั้ง 9 ใบเรียงเทียบ (ขยาย 4 เท่าให้ดูออก)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
const desc = {};
for (const b of built) {
  const key = `products/brooch-acrylic/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  desc[b.choice] = `ด้านที่ยาวที่สุด ${b.cm} ซม. · ${b.note} · ปลีก 1-10 ชิ้น ฿${b.retail} (รวมอะไหล่) · สั่ง 500 ชิ้นขึ้นไป ฿${b.bulk}`;
  console.log("อัปโหลดแล้ว", key);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}" — หยุดก่อน`); process.exit(1); }

/* แตะได้แค่ display / imageSrc / desc — ชื่อกลุ่มกับชื่อตัวเลือกเป็นคีย์ตารางราคา */
group.display = "cards";
for (const c of group.choices ?? []) {
  if (!url[c.name]) { console.error("ตัวเลือกใน DB ไม่มีในสคริปต์:", c.name); process.exit(1); }
  c.imageSrc = url[c.name];
  c.desc = desc[c.name];
}
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
if (g?.display !== "cards") { console.error("display ไม่ใช่ cards", g?.display); process.exit(1); }
for (const b of built) {
  const c = g.choices.find((x) => x.name === b.choice);
  if (c?.imageSrc !== url[b.choice] || c?.desc !== desc[b.choice]) { console.error("อ่านกลับไม่ตรง:", b.choice, c); process.exit(1); }
}
/* ตารางราคายังต้องหาคีย์เดิมเจอครบ — กันเผลอทำชื่อตัวเลือกเพี้ยน */
const cells = back.data.pricing?.cells ?? {};
for (const b of built)
  for (const kind of ["ธรรมดา", "อะคริลิคพิเศษ"])
    if (!cells[`${b.choice}│${kind}`]) { console.error("คีย์ตารางราคาหาย:", `${b.choice}│${kind}`); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" การ์ด + ภาพครบ ${built.length} ตัวเลือก · คีย์ราคาครบ · savedAt =`, back.data.savedAt);

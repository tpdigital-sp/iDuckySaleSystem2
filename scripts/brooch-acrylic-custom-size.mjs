/**
 * 📐 เข็มกลัดอะคริลิค (id "1") — ย้าย "กำหนดขนาดเอง" เข้ากลุ่มแกนราคา "ขนาดด้านที่ยาวที่สุด"
 * ตรรกะเดียวกับพวงกุญแจ (scripts/keyring-custom-size.mjs · ProductOption.sizeInput):
 *
 *  1) ลบกล่องติ๊ก product.custom (โหมด quote — กล่อง "กำหนดขนาดเอง" ลอยอยู่นอกกลุ่ม ราคา 0 รอตีราคาทุกงาน)
 *  2) เพิ่มการ์ด "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" ท้ายกลุ่มขนาด (ภาพการ์ดสเกลเดียวกับ 9 ใบเดิม)
 *  3) ลูกค้าสั่งขนาดทศนิยมได้ (3.5 × 2.8 ซม.) — ราคาคิดตามด้านที่ยาวที่สุด แล้วไปเกาะแถวขนาดในตารางเดิม
 *     ผ่อนเศษให้ครึ่งหน่วย (3.5 → แถว 3cm · 3.6 → แถว 4cm) · เกิน 10 ซม. = "รอแอดมินตีราคา" (สั่งไว้ก่อนได้)
 *
 * ใช้:  node scripts/brooch-acrylic-custom-size.mjs --dry     (วาดภาพ + โชว์ที่จะเขียน ไม่แตะ DB)
 *       node scripts/brooch-acrylic-custom-size.mjs           (อัปโหลดภาพ + เขียน DB + อ่านกลับเทียบ)
 * รันซ้ำได้ (idempotent) · ⚠️ ชื่อกลุ่ม/ชื่อ 9 ไซซ์เดิมห้ามแตะ — เป็นคีย์ตารางราคา
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import fs from "fs";
import sharp from "sharp";

const ID = "1";                                   // slug = เข็มกลัดอะคริลิค
const SIZE_LABEL = "ขนาดด้านที่ยาวที่สุด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (สูง)";
const UNIT = "ซม.";
const ASK_OVER = 10;                              // ตารางครอบถึง 10cm — เกินนี้แอดมินตีราคา
const MAX_CM = 30;                                // กันพิมพ์เลขหลุด (เกิน 10 ยังกรอกได้ = ขอตีราคา)
const VER = "v1";
const FILE = `size-custom-${VER}.jpg`;
const KEY = `products/brooch-acrylic/${FILE}`;
const OUT = ".cache/brooch-acrylic/upload";

const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

// ── ภาพการ์ด "กำหนดเอง" — ตาราง 1 ซม. สเกลเดียวกับ scripts/brooch-acrylic-size-cards.mjs ──
const W = 900, H = 900, CM = 52, GW = 14, GH = 12, GX = (W - GW * CM) / 2, GY = 44;
const CX = GX + (GW * CM) / 2, CY = GY + (GH * CM) / 2;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const OK = "#0891b2";
function cardSvg() {
  const lines = [];
  for (let i = 0; i <= GW; i++)
    lines.push(`<line x1="${GX + i * CM}" y1="${GY}" x2="${GX + i * CM}" y2="${GY + GH * CM}" stroke="#e2e8f0" stroke-width="${i % 5 === 0 ? 2.4 : 1.2}"/>`);
  for (let i = 0; i <= GH; i++)
    lines.push(`<line x1="${GX}" y1="${GY + i * CM}" x2="${GX + GW * CM}" y2="${GY + i * CM}" stroke="#e2e8f0" stroke-width="${i % 5 === 0 ? 2.4 : 1.2}"/>`);
  // ชิ้นงานเส้นประ ~6.5 × 5 ซม. + ลูกศรวัด 2 ด้าน ป้าย "?" = ลูกค้ากรอกเอง
  const pw = 6.5 * CM, ph = 5 * CM, x = CX - pw / 2, y = CY - ph / 2 - 10, r = 40;
  const tick = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${OK}" stroke-width="3"/>`;
  const pill = (cx, cy, label) => `
    <rect x="${cx - 44}" y="${cy - 24}" width="88" height="48" rx="12" fill="#ffffff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${cy + 12}" font-family="${TH}" font-size="32" font-weight="800" text-anchor="middle" fill="${OK}">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="${GX}" y="${GY}" width="${GW * CM}" height="${GH * CM}" fill="#fbfdff"/>
  ${lines.join("")}
  <rect x="${GX}" y="${GY}" width="${CM}" height="${CM}" fill="#ecfeff" opacity="0.9"/>
  <text x="${GX + CM / 2}" y="${GY + CM / 2 + 8}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${OK}">1 ซม.</text>
  <rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r}" fill="#e8f4fb" opacity="0.7"/>
  <rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r}" fill="none" stroke="${OK}" stroke-width="5" stroke-dasharray="22 14"/>
  <text x="${CX}" y="${y + ph / 2 + 30}" font-family="${TH}" font-size="86" font-weight="800" text-anchor="middle" fill="${OK}">📐</text>
  <!-- ลูกศรวัดแนวนอน (กว้าง) ใต้ชิ้นงาน -->
  <line x1="${x}" y1="${y + ph + 44}" x2="${x + pw}" y2="${y + ph + 44}" stroke="${OK}" stroke-width="2.5"/>
  ${tick(x, y + ph + 32, x, y + ph + 56)}${tick(x + pw, y + ph + 32, x + pw, y + ph + 56)}
  ${pill(CX, y + ph + 44, "? ซม.")}
  <!-- ลูกศรวัดแนวตั้ง (สูง) ข้างชิ้นงาน -->
  <line x1="${x - 44}" y1="${y}" x2="${x - 44}" y2="${y + ph}" stroke="${OK}" stroke-width="2.5"/>
  ${tick(x - 56, y, x - 32, y)}${tick(x - 56, y + ph, x - 32, y + ph)}
  ${pill(x - 44, y + ph / 2, "? ซม.")}
  <rect x="0" y="${GY + GH * CM + 12}" width="${W}" height="${H - (GY + GH * CM) - 12}" fill="#0f172a"/>
  <text x="${W / 2}" y="${H - 84}" font-family="${TH}" font-size="104" font-weight="800" text-anchor="middle" fill="#ffffff">กำหนดเอง</text>
  <text x="${W / 2}" y="${H - 26}" font-family="${TH}" font-size="26" text-anchor="middle" fill="#94a3b8">ระบุ กว้าง × สูง ทศนิยมได้ · คิดตามด้านที่ยาวที่สุด</text>
</svg>`;
}
mkdirSync(OUT, { recursive: true });
const buf = await sharp(Buffer.from(cardSvg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(48, 48).resize(192, 192, { kernel: "nearest" }).jpeg().toFile(`${OUT}/_thumb48-custom.jpg`);
console.log(`🖼  ${OUT}/${FILE} ${Math.round(buf.length / 1024)} KB (+ _thumb48-custom.jpg ย่อแบบการ์ดกระชับ)`);

// ── DB ─────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const IMG = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${KEY}`;

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const size = opts.find((o) => o.label.trim() === SIZE_LABEL);
if (!size) die("ไม่พบกลุ่ม " + SIZE_LABEL);

// 1) ลบกล่องติ๊ก custom (โหมด quote) — ภาพที่ 1 ที่ผู้ใช้สั่งเอาออก · เก็บของเดิมไว้ในล็อกเผื่อย้อน
if (p.custom) {
  console.log("🗑  ลบ product.custom เดิม:", JSON.stringify(p.custom));
  delete p.custom;
}

// 2) การ์ด "กำหนดขนาดเอง" ท้ายกลุ่มขนาด (ภาพ + คำอธิบาย — โหมดกระชับโชว์แค่ภาพ 48px กับชื่อ)
const desc = `ระบุกว้าง×สูงเอง ใส่ทศนิยมได้ · ราคาคิดตามด้านที่ยาวที่สุด เท่าขนาดมาตรฐานที่ครอบได้ (3.5 ซม. = แถว 3cm) · เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`;
const existing = size.choices.find((c) => c.name === CUSTOM);
if (existing) Object.assign(existing, { imageSrc: IMG, desc });
else size.choices.push({ name: CUSTOM, imageSrc: IMG, desc });

// 3) สเปกคิดราคา (ด้านยาวสุด → แถวในตาราง เศษ ≤ 0.5 อยู่แถวเดิม · เกิน 10 ซม. = ตีราคา)
size.sizeInput = { choice: CUSTOM, widthLabel: W_LABEL, heightLabel: H_LABEL, askOver: ASK_OVER, unit: UNIT };

// 4) ช่องกรอกกว้าง/สูง — โผล่เมื่อเลือกการ์ดกำหนดเอง · อยู่ชุดเดียวกับกลุ่มขนาด (section "1. ขนาด")
const showWhen = { label: SIZE_LABEL, choices: [CUSTOM] };
const sectionBits = {
  ...(size.section ? { section: size.section } : {}),
  ...(size.sectionTrim ? { sectionTrim: size.sectionTrim } : {}),
  ...(size.sectionClosed ? { sectionClosed: true } : {}),
};
const field = (label, hint) => ({
  label,
  display: "input",
  standardInput: true,
  showWhen,
  choices: [],
  input: { kind: "number", unit: UNIT, min: 1, max: MAX_CM, placeholder: "3.5", required: true, hint },
  ...sectionBits,
});
const pair = [
  field(W_LABEL, "ใส่ทศนิยมได้ เช่น 3.5"),
  field(
    H_LABEL,
    `ราคาคิดจากด้านที่ยาวที่สุด เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (3.5 ซม. = แถว 3cm · 3.6 ซม. = แถว 4cm) · ด้านยาวสุดเกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`
  ),
];
for (const f of pair) {
  const i = opts.findIndex((o) => o.label === f.label);
  if (i >= 0) opts[i] = { ...opts[i], ...f };
}
const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);

// 5) กฎที่จำกัดรายชื่อขนาด (ตอนนี้ไม่มี) ต้องอนุญาตตัวเลือกใหม่ด้วย
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) { r.limit.allow.push(CUSTOM); ruleFix++; }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log("ตัวเลือกในกลุ่มขนาด:", size.choices.length, "· ช่องกรอกที่เพิ่ม:", missing.length, "· กฎที่เติม allow:", ruleFix, "· custom เหลือ:", p.custom ?? "ไม่มี");
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, custom: size.choices.at(-1), pair }, null, 1));
  process.exit(0);
}

const upImg = await sb.storage.from("product-images").upload(KEY, buf, { contentType: "image/jpeg", upsert: true });
if (upImg.error) die("อัปโหลดภาพพัง: " + upImg.error.message);
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 6) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
const qSize = (q?.options || []).find((o) => o.label.trim() === SIZE_LABEL);
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
if (q.custom) die("อ่านกลับ product.custom ยังอยู่");
if (qSize?.sizeInput?.choice !== CUSTOM) die("อ่านกลับ sizeInput ไม่ตรง");
const qc = qSize.choices.find((c) => c.name === CUSTOM);
if (!qc || qc.imageSrc !== IMG) die("อ่านกลับ การ์ด custom หาย/ภาพไม่ตรง");
for (const f of pair)
  if (!(q.options || []).some((o) => o.label === f.label && o.display === "input" && o.section === size.section)) die("อ่านกลับ ช่องกรอกหาย: " + f.label);
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ ·", IMG);

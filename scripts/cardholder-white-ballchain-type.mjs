#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกขาว · cardholder-white) — เพิ่มแบบที่ 4 "การ์ด + โซ่ไข่ปลา"
 *   เจ้าของร้านสั่ง 24 ก.ย. 69: "เพิ่มตัวเลือก Card + โซ่ไข่ปลา อีก 1 ·
 *    โซ่ไข่ปลาสีเงินและสีต่าง ๆ ราคาเท่ากับรับสายขาวเลย"
 *
 *   node scripts/cardholder-white-ballchain-type.mjs           # วาดภาพ + ดูผลก่อน (ไม่เขียน DB)
 *   node scripts/cardholder-white-ballchain-type.mjs --write   # อัปโหลดรูป + เขียน DB + อ่านกลับเทียบ
 *
 * ⚠️ กลุ่ม "แบบ" เป็นแกนตารางราคา (pricing.driverLabels = ["แบบ"]) → ชื่อตัวเลือก = คีย์ `pricing.cells`
 *    เพิ่มตัวเลือกใหม่ = ต้องเติมแถวราคาพร้อมกันทุกตาราง ([[iducky-price-driver-trap]]):
 *      1) data.pricing.cells          2) priceRates[].pricing.cells ทุกเรท (รวมเรทตัวแทนจำหน่าย)
 *    ตัวเลือกที่ไม่มีแถวในตาราง = ลูกค้ากดแล้วราคาหาย/สั่งไม่ได้
 *    ราคา "เท่ากับรับสายขาว" → ก๊อปแถวของ "…+ สายขาว" มาทั้งแถว ทุกตาราง (ห้ามพิมพ์ตัวเลขเอง)
 *
 * สีโซ่ไม่บวกเพิ่ม (ต่างจากตัวใส cardholder-clear ที่โซ่สี +3) → ทำเป็นกลุ่มเดียว "สีโซ่ไข่ปลา"
 *    dropdown (เงิน + 23 สีตามชาร์ตร้าน P-ตะขอ+อะไหล่-01.jpg ชุดเดียวกับ cardholder-clear/frame-card)
 *    showWhen = แบบที่ 4 เท่านั้น · ทุกตัวเลือก extra 0
 *
 * ⚠️ อัปทับชื่อไฟล์รูปเดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขึ้น VER ใหม่ ([[iducky-image-cache-bust]])
 * รันซ้ำได้: มีตัวเลือก/กลุ่มอยู่แล้วก็เขียนทับค่าเดิม ไม่เพิ่มซ้ำ ไม่แตะตัวเลือกอื่น
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 260);

const PRODUCT_ID = "cardholder-white";
const GROUP = "แบบ";
const SECTION = "1. ขนาด + แบบ";
const COLOR_GROUP = "สีโซ่ไข่ปลา";
const VER = "v1";
const WRITE = process.argv.includes("--write");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** ชื่อ = คีย์ตารางราคา · ตั้งให้อ่านแล้วรู้ว่าอยู่ในกล่องอะไร (บรรทัด "แบบ:" ในใบงาน/สถานีแพ็คโชว์แต่ชื่อ) */
const SRC_NAME = "การ์ดพลาสติกขาว (สกรีนแค่ตัวการ์ด) + สายขาว"; // แถวราคาต้นแบบ
const NEW_NAME = "การ์ดพลาสติกขาว (สกรีนแค่ตัวการ์ด) + โซ่ไข่ปลา";
const NEW_DESC =
  "สกรีนลายเฉพาะตัวการ์ด แล้วได้ “โซ่ไข่ปลา” ร้อยช่องบนสุดแทนสายคล้องคอ (ไม่ได้สายและคลิปหนีบ) — เลือกสีโซ่ได้ ราคาเท่าแบบสายขาว";
const FILE = `type-ball-chain-${VER}.jpg`;

/** ชาร์ตสีตะขอของร้าน (P-ตะขอ+อะไหล่-01.jpg) — ชุดเดียวกับ cardholder-clear · ที่นี่ไม่บวกเพิ่มสักสี */
const CHAIN_COLORS = [
  "โซ่ไข่ปลาสีเงิน (Z2)",
  "C1 สีดำ", "C2 สีเทาเข้ม", "C3 สีเทาอ่อน", "C4 สีขาว", "C5 สีน้ำตาล", "C6 สีส้มเข้ม", "C7 สีส้ม",
  "C9 สีเหลือง", "C10 สีเหลืองอ่อน", "C11 สีเขียวอ่อน", "C12 สีเขียวกรม", "C13 สีเขียว", "C15 สีเขียวมิ้นท์",
  "C16 สีฟ้าอ่อน", "C17 สีฟ้า", "C18 สีฟ้าเข้ม", "C20 สีน้ำเงินเข้ม", "C21 สีม่วงเข้ม", "C22 สีม่วงอ่อน",
  "C23 สีชมพูพีช", "C25 สีชมพู", "C26 สีชมพูบานเย็น", "C27 สีแดง",
];

// ── ภาพ 900×900 สไตล์เดียวกับอีก 3 ใบ (scripts/cardholder-white-type-option-art.mjs) ──
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", MUTE = "#94a3b8";
const PRINT = "#bae6fd", PRINT_DK = "#7dd3fc";
const CARD_W = 6.9, CARD_H = 11;
const CX = 450, PX = 21, TOP = 512;
const cw = CARD_W * PX, ch = CARD_H * PX;
const L = CX - cw / 2, R = CX + cw / 2, B = TOP + ch;
const winL = L + 1.0 * PX, winR = R - 1.0 * PX;
const winT = TOP + 1.9 * PX, winB = B - 0.9 * PX;
const SLOT_Y = TOP + 16;               // ช่องร้อยบนหัวการ์ด — โซ่มุดเข้าตรงนี้ (ไม่มีคลิปหนีบ)

/** ห่วงโซ่ทรงหยดน้ำ ปลายทั้งสองมุดเข้าช่องร้อย — ช่องกลางเว้นไว้ให้ป้าย/สวอตช์สี */
const CHAIN = `M ${CX - 12} ${SLOT_Y}
  C 330 440, 300 320, 372 256
  C 416 216, 484 216, 528 256
  C 600 320, 570 440, ${CX + 12} ${SLOT_Y}`;

const cloud = (cx, cy, s) => `
  <g fill="#ffffff" opacity="0.85">
    <circle cx="${cx - 7 * s}" cy="${cy}" r="${5 * s}"/>
    <circle cx="${cx}" cy="${cy - 3 * s}" r="${7 * s}"/>
    <circle cx="${cx + 8 * s}" cy="${cy}" r="${5.5 * s}"/>
    <rect x="${cx - 12 * s}" y="${cy}" width="${24 * s}" height="${5 * s}" rx="${2.5 * s}"/>
  </g>`;

/** ตัวการ์ดพลาสติกขาวสกรีนลายแล้ว — ไม่มีคลิปหนีบ (คลิปมากับสาย) เหลือช่องร้อยบนหัวการ์ด */
const cardHolder = () => {
  const mw = 34, mh = mw / MASCOT.ratio;
  return `
  <rect x="${L + 5}" y="${TOP + 7}" width="${cw}" height="${ch}" rx="15" fill="#0f172a" opacity="0.08"/>
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="15" fill="${PRINT}" stroke="${INK}" stroke-width="3"/>
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="15" fill="none" stroke="${PRINT_DK}" stroke-width="8" opacity="0.35"/>
  ${cloud(L + 22, TOP + 80, 0.8)}
  ${cloud(R - 20, TOP + 140, 0.75)}
  ${cloud(CX + 3, B - 11, 0.85)}
  <image href="${MASCOT.uri}" x="${L + 12}" y="${TOP + 6}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <rect x="${CX - 17}" y="${TOP + 11}" width="34" height="10" rx="5" fill="#ffffff" stroke="${MUTE}" stroke-width="2"/>
  <rect x="${winL}" y="${winT}" width="${winR - winL}" height="${winB - winT}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  <rect x="${winL + 12}" y="${winT + 14}" width="30" height="36" rx="5" fill="#e2e8f0"/>
  ${[0, 1, 2].map((i) => `<rect x="${winL + 50}" y="${winT + 18 + i * 13}" width="${46 - i * 12}" height="7" rx="3.5" fill="#e2e8f0"/>`).join("")}
  ${[0, 1, 2, 3].map((i) => `<rect x="${winL + 12}" y="${winT + 66 + i * 15}" width="${winR - winL - 24 - (i === 3 ? 34 : 0)}" height="7" rx="3.5" fill="#eef2f7"/>`).join("")}
  <text x="${CX}" y="${winB - 12}" font-family="${TH}" font-size="13" font-weight="700" text-anchor="middle" fill="${MUTE}">ใส่บัตรได้ 2 ใบ</text>`;
};

/**
 * โซ่ไข่ปลา = เม็ดกลมเรียงตามเส้น (เส้นบาง + จุดหัวมนถี่ ๆ)
 * เม็ดวาดใหญ่กว่าของจริงมาก (จริง ~2.4 มม.) — ที่ 48px ต้องเห็น "ช่องว่างระหว่างเม็ด"
 * ไม่งั้นย่อแล้วแยกไม่ออกจากใบ "สายขาวเปล่า" ([[iducky-option-thumb-crop]] การ์ดย่อทั้งใบ ไม่ครอป)
 */
const ballChain = () => `
  <path d="${CHAIN}" fill="none" stroke="#94a3b8" stroke-width="5"/>
  <path d="${CHAIN}" fill="none" stroke="#475569" stroke-width="21" stroke-linecap="round" stroke-dasharray="0.5 25"/>
  <path d="${CHAIN}" fill="none" stroke="url(#silver)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0.5 25"/>
  <path d="${CHAIN}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.5 25" opacity="0.75"/>
  <!-- หัวล็อกโซ่ — วางเหนือขอบบนการ์ด (ใต้ลงไปโดนตัวการ์ดบัง) ปลายโซ่ลอดช่องร้อยไปด้านหลัง -->
  <rect x="${CX - 25}" y="${TOP - 32}" width="50" height="24" rx="12" fill="url(#silver)" stroke="#475569" stroke-width="3"/>`;

/** สวอตช์สีในช่องกลางห่วง — บอกว่าเลือกสีได้ โดยไม่ต้องพิมพ์จำนวนสี (กันข้อมูลเก่าค้าง) */
const swatches = () => {
  // แถวสวอตช์ต้องแคบกว่าช่องในห่วงโซ่ ไม่งั้นทับเส้นโซ่จนอ่านยากตอนย่อ
  const cols = ["#e2e8f0", "#0f172a", "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#ec4899"];
  const gap = 25, y = 400, x0 = CX - ((cols.length - 1) * gap) / 2;
  return cols
    .map((c, i) => `<circle cx="${x0 + i * gap}" cy="${y}" r="11" fill="${c}" stroke="#475569" stroke-width="2.5"/>`)
    .join("");
};

const badge = (text) => {
  const w = text.length * 13.5 + 54;
  return `
    <rect x="${CX - w / 2}" y="312" width="${w}" height="52" rx="26" fill="#ecfeff" stroke="${OK}" stroke-width="3"/>
    <text x="${CX}" y="345" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

const foot = ["ได้โซ่ไข่ปลาร้อยช่องบนสุดของการ์ด แทนสายคล้องคอ", "สีเงินหรือสีอื่น ราคาเท่ากันหมด ไม่บวกเพิ่ม"];
const art = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/><stop offset="50%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="90" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">การ์ด + โซ่ไข่ปลา</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">สกรีนลายเฉพาะตัวการ์ด + ได้โซ่ไข่ปลาแทนสายคล้องคอ</text>
  ${ballChain()}
  ${badge("โซ่ไข่ปลา เลือกสีได้")}
  ${swatches()}
  ${cardHolder()}
  ${foot.map((t, i) => `<text x="${W / 2}" y="${786 + i * 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${t}</text>`).join("")}
  <text x="${W / 2}" y="${H - 52}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${MUTE}">ตัวการ์ด ${CARD_W} × ${CARD_H} ซม. · ภาพวาดประกอบ เม็ดโซ่วาดใหญ่กว่าของจริงให้เห็นชัด</text>
</svg>`;

const buf = await sharp(Buffer.from(art())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(48, 48).png().toFile(`${OUT}/mini-${FILE}.png`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${NEW_NAME}`);
console.log(`🔎 ${OUT}/mini-${FILE}.png — ย่อ 48×48 เทียบกับอีก 3 ใบใน ${OUT}/mini-row-v2.png`);

// ── DB ────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("⛔ " + m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die("อ่านสินค้าไม่ได้: " + readErr.message);
const data = structuredClone(row.data);
writeFileSync(`${OUT}/../before-ballchain-${VER}.json`, JSON.stringify(row.data, null, 2));

const IMG_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/${FILE}`;

// 1) ตัวเลือกใหม่ในกลุ่ม "แบบ" — วางต่อจากแบบสายขาว (ราคาเท่ากัน อ่านไล่ราคาแล้วไม่สะดุด)
const groups = (data.options ?? []).filter((g) => g.label === GROUP);
if (groups.length !== 1) die(`กลุ่ม "${GROUP}" มี ${groups.length} กลุ่ม (คาด 1) — [[iducky-duplicate-group-label]]`);
const g = groups[0];
const srcIdx = g.choices.findIndex((c) => c.name === SRC_NAME);
if (srcIdx < 0) die(`ไม่เจอตัวเลือกต้นแบบ "${SRC_NAME}" — ชื่ออาจถูกแก้ไปแล้ว`);
const existing = g.choices.find((c) => c.name === NEW_NAME);
if (existing) { existing.desc = NEW_DESC; existing.imageSrc = IMG_URL; delete existing.extra; }
else g.choices.splice(srcIdx + 1, 0, { name: NEW_NAME, desc: NEW_DESC, imageSrc: IMG_URL });
g.note =
  "ทุกแบบสกรีนลายตัวการ์ดเหมือนกัน — ต่างกันที่ของที่ได้ไปด้วย: ไม่รับสาย / สายขาวเปล่า / โซ่ไข่ปลา (เลือกสีได้) / สกรีนลายสายด้วย";

// 2) เติมแถวราคาให้ครบทุกตาราง — ก๊อปจากแถว "สายขาว" ทั้งแถว ห้ามพิมพ์ตัวเลขเอง
const tables = [["data.pricing", data.pricing], ...(data.priceRates ?? []).map((r) => [`เรท "${r.label}"`, r.pricing])];
const priced = [];
for (const [name, p] of tables) {
  if (!p?.cells) continue;
  if ((p.driverLabels ?? []).join("│") !== GROUP) die(`${name}: แกนตารางไม่ใช่ "${GROUP}" (${(p.driverLabels ?? []).join("│")}) — คีย์ cells คนละแบบ หยุดก่อน`);
  const src = p.cells[SRC_NAME];
  if (!Array.isArray(src)) die(`${name}: ไม่มีแถวราคาของ "${SRC_NAME}"`);
  p.cells[NEW_NAME] = [...src];
  priced.push(`${name} ${src.join("/")}`);
}
if (!priced.length) die("ไม่เจอตารางราคาสักตาราง");

// 3) กลุ่ม "สีโซ่ไข่ปลา" — โผล่เฉพาะตอนเลือกแบบโซ่ไข่ปลา · ทุกสีราคาเท่ากัน
const colorGroup = {
  label: COLOR_GROUP,
  section: SECTION,
  display: "dropdown",
  showWhen: { label: GROUP, choices: [NEW_NAME] },
  note: "เลือกสีโซ่ได้ทุกสีในราคาเดียวกัน ไม่บวกเพิ่ม (ตามชาร์ตสีตะขอของร้าน)",
  choices: CHAIN_COLORS.map((name) => ({ name })),
};
const atColor = (data.options ?? []).findIndex((o) => o.label === COLOR_GROUP);
if (atColor >= 0) data.options[atColor] = colorGroup;
else data.options.splice((data.options ?? []).findIndex((o) => o.label === GROUP) + 1, 0, colorGroup);

// 4) ข้อความหน้าร้านที่ไล่ชื่อแบบไว้
const hi = data.highlights ?? [];
const hiAt = hi.findIndex((t) => t.includes("สกรีนสายคล้อง"));
if (hiAt >= 0) hi[hiAt] = "🧵 เลือกได้ทั้งแบบไม่มีสาย / มีสายคล้อง / สกรีนสายคล้อง / โซ่ไข่ปลา (เลือกสีได้)";
const TERM = "*แบบ “+ โซ่ไข่ปลา” จะได้โซ่ไข่ปลาร้อยช่องบนสุดแทนสายคล้องคอ (ไม่ได้สายและคลิปหนีบ) เลือกสีโซ่ได้ทุกสีในราคาเดียวกัน";
if (typeof data.terms === "string" && !data.terms.includes("โซ่ไข่ปลา")) data.terms = `${data.terms}\n${TERM}`;
data.savedAt = new Date().toISOString();

const preview = {
  แบบ: g.choices.map((c) => c.name),
  ราคาที่เติม: priced,
  สีโซ่: `${CHAIN_COLORS.length} สี (ไม่บวกเพิ่ม)`,
  ช่วงราคา: [data.priceMin, data.priceMax],
};
console.log("\n" + JSON.stringify(preview, null, 1));

if (!WRITE) { console.log("\n(ยังไม่เขียน DB — ดูรูปแล้วรันซ้ำด้วย --write)"); process.exit(0); }

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) die("อัปโหลดรูปพัง: " + upErr.message);
console.log("อัปโหลดแล้ว", IMG_URL);

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) die("update พัง/0 แถว: " + (updErr?.message ?? ""));

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ─────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gb = (back.data.options ?? []).find((o) => o.label === GROUP);
const cb = gb?.choices?.find((c) => c.name === NEW_NAME);
const colb = (back.data.options ?? []).find((o) => o.label === COLOR_GROUP);
const tablesBack = [["data.pricing", back.data.pricing], ...(back.data.priceRates ?? []).map((r) => [`เรท "${r.label}"`, r.pricing])];
const fails = [
  [!!gb && gb.choices.length === row.data.options.find((o) => o.label === GROUP).choices.length + (row.data.options.find((o) => o.label === GROUP).choices.some((c) => c.name === NEW_NAME) ? 0 : 1), "จำนวนตัวเลือกในกลุ่มแบบไม่ตรง"],
  [cb?.imageSrc === IMG_URL && cb?.desc === NEW_DESC, "ตัวเลือกใหม่ ภาพ/คำอธิบายไม่ตรง"],
  [!cb?.extra, "ตัวเลือกใหม่ดันมีราคาเพิ่ม (ต้องเท่าแบบสายขาวเป๊ะ)"],
  ...tablesBack.map(([name, p]) => [
    !p?.cells || JSON.stringify(p.cells[NEW_NAME]) === JSON.stringify(p.cells[SRC_NAME]),
    `${name}: แถวราคาโซ่ไข่ปลาไม่เท่าแถวสายขาว`,
  ]),
  ...tablesBack.map(([name, p]) => [
    !p?.cells || Object.keys(p.cells).length === gb.choices.length,
    `${name}: จำนวนแถวราคาไม่เท่าจำนวนตัวเลือก (ตัวเลือกที่ไม่มีแถว = ราคาหาย)`,
  ]),
  // ของเดิมต้องไม่ขยับสักช่อง
  ...tablesBack.map(([name, p]) => {
    const beforeT = name === "data.pricing" ? row.data.pricing : (row.data.priceRates ?? []).find((r) => `เรท "${r.label}"` === name)?.pricing;
    const same = Object.entries(beforeT?.cells ?? {}).every(([k, v]) => JSON.stringify(p?.cells?.[k]) === JSON.stringify(v));
    return [same, `${name}: ราคาของแบบเดิมขยับ!`];
  }),
  [colb?.choices?.length === CHAIN_COLORS.length, "กลุ่มสีโซ่ไม่ครบ"],
  [colb?.showWhen?.label === GROUP && colb?.showWhen?.choices?.[0] === NEW_NAME, "กลุ่มสีโซ่ไม่ได้ผูกกับแบบโซ่ไข่ปลา (จะโผล่ทุกแบบ)"],
  [(colb?.choices ?? []).every((c) => !c.extra), "สีโซ่ดันมีราคาเพิ่ม"],
  [(back.data.options ?? []).some((o) => o.label === "ขนาด"), 'กลุ่ม "ขนาด" หาย ([[iducky-option-group-loss-guard]])'],
  [back.data.priceMin === row.data.priceMin && back.data.priceMax === row.data.priceMax, "ช่วงราคาสินค้าเปลี่ยน"],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง: " + fails.map((f) => f[1]).join(" · "));

console.log(`\n✓ เพิ่มแบบ "${NEW_NAME}" แล้ว · ราคาเท่าแบบสายขาวทุกตาราง (${priced.length} ตาราง) · สีโซ่ ${CHAIN_COLORS.length} สีไม่บวกเพิ่ม · savedAt =`, back.data.savedAt);

#!/usr/bin/env node
/**
 * ชิงช้าสวรรค์อะคริลิค (acrylic-ferris-wheel) — แยก "อะคริลิคใส / ขาวขุ่น C-02" ออกจาก "ธรรมดา"
 *
 *   node scripts/ferris-wheel-acrylic-type-split.mjs           (วาดภาพ + ตรวจ ไม่เขียน DB)
 *   node scripts/ferris-wheel-acrylic-type-split.mjs --write   (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * เจ้าของร้านสั่ง (4 ก.ย. 69): "สีอะคริลิค: อะคริลิคใส , อะคริลิคขาวขุ่น C-02 แยกออกจากธรรมดา"
 * เดิมกลุ่ม "ประเภทอะคริลิค" มี 2 ค่า (ธรรมดา / พิเศษ) แล้วต้องไปเลือกซ้ำในเมนู "สีอะคริลิค" 45 เฉด
 * ทั้งที่ฝั่งธรรมดามีแค่ 2 เนื้อ → ยกขึ้นมาเป็นตัวเลือกชั้นบนเลย เหลือเมนูสีไว้ใช้ตอนเลือกอะคริลิคพิเศษ
 * (แพตเทิร์นเดียวกับพวงกุญแจอะคริลิค keyring-acrylic-type-cards.mts และคลิปหนีบ acrylic-clip-color-special-only.mjs)
 *
 *   ประเภทอะคริลิค (การ์ด 3 ใบ):  อะคริลิคใส · อะคริลิคขาวขุ่น C-02 · อะคริลิคพิเศษ
 *   สีอะคริลิค (45 เฉด):          showWhen → โผล่เฉพาะตอนเลือก "อะคริลิคพิเศษ"
 *
 * ✅ ตัวนี้ปลอดกับดัก "กฎข้ามเมื่อกลุ่มต้นทางถูกซ่อน" (products.ts allowedChoices) เพราะสินค้านี้
 *    ไม่มีกลุ่มเทคนิค/สกรีนที่ผูกกฎไว้กับกลุ่ม "สีอะคริลิค" — กฎที่มีชี้จาก ประเภท → สี ทิศเดียวเท่านั้น
 * ⛔ ห้ามใส่กฎย้อนทิศ (สี → ประเภท) เด็ดขาด จะล็อกตายเหมือนเคสพวงกุญแจ (ดู iducky-keyring-acrylic-type)
 *
 * ภาพการ์ด 3 ใบวาดใหม่เป็นชุดเดียวกัน: ชิงช้าสวรรค์ทั้งชุดบนโต๊ะไม้ เปลี่ยนแค่ "เนื้ออะคริลิค"
 * — ใส = เห็นลายไม้ทะลุ · C-02 = ทึบขาว ลายไม้หายไป · พิเศษ = โฮโลแกรม/กลิตเตอร์
 *
 * รันซ้ำได้ · ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 300);

const PRODUCT_ID = "acrylic-ferris-wheel";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/ferris-wheel/type").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const TYPE = "ประเภทอะคริลิค";
const COLOR = "สีอะคริลิค";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "อะคริลิคพิเศษ";
const OLD_NORMAL = "ธรรมดา";
const OLD_SPECIAL = "พิเศษ";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const EDGE = "#e879a8";

const STAGE = { x: 46, y: 176, w: 808, h: 536 };

// ── ชิงช้าสวรรค์ทั้งชุด สเกลจริง (px ต่อ 1 ซม.) ────────────────────────
const K = 23;
const cm = (n) => n * K;
const OX = W / 2;
const GROUND = STAGE.y + STAGE.h - 34;
const BASE_H = 15;
const BASE_TOP = GROUND - BASE_H;
const POST_H = cm(14.8);
const POST_W = cm(9.6);
const POST_TOP = BASE_TOP - POST_H;
const HEAD_R = cm(2.35);
const PIVOT_Y = POST_TOP + HEAD_R;
const DISC_R = cm(13) / 2;
const HANG_R = cm(4.5) / 2;
const HANGERS = [90, 30, -30, -90, -150, 150].map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  const px = OX + DISC_R * Math.cos(a);
  const py = PIVOT_Y - DISC_R * Math.sin(a);
  return { i, px, py, cy: py + HANG_R * 0.92 };
});
const POST_PATH = `M ${OX - POST_W / 2} ${BASE_TOP} L ${OX - HEAD_R * 0.62} ${PIVOT_Y + HEAD_R * 0.78}
  A ${HEAD_R} ${HEAD_R} 0 1 1 ${OX + HEAD_R * 0.62} ${PIVOT_Y + HEAD_R * 0.78} L ${OX + POST_W / 2} ${BASE_TOP} Z`;

/** ลายไม้ในเวที — ของจริงที่ "ทะลุ" เนื้อใสขึ้นมาให้เห็น (แพตเทิร์นเดียวกับคลังกลาง normal-mix) */
const woodBand = () => {
  let out = `<rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" fill="#e0c4a1"/>`;
  for (let i = 0; i * 26 < STAGE.h; i++)
    out += `<rect x="${STAGE.x}" y="${STAGE.y + 8 + i * 26}" width="${STAGE.w}" height="13" fill="#b98a5c" opacity="${i % 2 ? 0.5 : 0.26}"/>`;
  return out;
};

/** กลิตเตอร์ตำแหน่งตายตัว (ไม่สุ่ม จะได้วาดซ้ำได้เหมือนเดิม) */
const glitter = (x0, y0, w0, h0, n, step) => {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = x0 + (((i * step) % 97) / 97) * w0;
    const y = y0 + (((i * (step + 17)) % 89) / 89) * h0;
    const r = 2.2 + ((i * 5) % 4);
    out += i % 3 === 0
      ? `<path d="M ${x} ${y - r * 2} L ${x + r * 0.6} ${y - r * 0.6} L ${x + r * 2} ${y} L ${x + r * 0.6} ${y + r * 0.6} L ${x} ${y + r * 2} L ${x - r * 0.6} ${y + r * 0.6} L ${x - r * 2} ${y} L ${x - r * 0.6} ${y - r * 0.6} Z" fill="#ffffff" opacity="0.9"/>`
      : `<circle cx="${x}" cy="${y}" r="${r * 0.8}" fill="#ffffff" opacity="0.72"/>`;
  }
  return out;
};

/** เนื้ออะคริลิค 3 แบบ — เปลี่ยนแค่ fill/stroke ตัวโครงชิงช้าสวรรค์เดิม */
const MATS = {
  clear: { fill: "#eaf6fd", op: 0.16, stroke: "#ffffff", sw: 6, sparkle: false },
  c02: { fill: "#fdfdfc", op: 1, stroke: "#e4e7ec", sw: 4, sparkle: false },
  special: { fill: "url(#holo)", op: 1, stroke: "#ffffff", sw: 6, sparkle: true },
};

/**
 * ภาพการ์ด "ประเภทอะคริลิค" — ชิงช้าสวรรค์ทั้งชุดบนโต๊ะไม้ เปลี่ยนแค่เนื้ออะคริลิค
 * (ชุดเดียวกันทั้ง 3 ใบ ลูกค้าจะเทียบเนื้อได้ทันทีว่าต่างกันตรงไหน)
 */
function typeArt({ mat, title, sub, badge, tone, notes }) {
  const m = MATS[mat];
  const piece = (inner) => `fill="${m.fill}" fill-opacity="${m.op}" stroke="${m.stroke}" stroke-width="${m.sw}"${inner ?? ""}`;
  const ah = HANG_R * 1.15;
  const aw = ah * MASCOT.ratio;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="0.32" stop-color="#f0abfc"/>
      <stop offset="0.64" stop-color="#67e8f9"/><stop offset="1" stop-color="#fbcfe8"/>
    </linearGradient>
    <clipPath id="stage"><rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" rx="24"/></clipPath>
    <clipPath id="disc" clipPathUnits="userSpaceOnUse"><circle cx="${OX}" cy="${PIVOT_Y}" r="${DISC_R}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="46" y="76" font-family="${TH}" font-size="40" font-weight="700" fill="${INK}">${title}</text>
  <text x="46" y="118" font-family="${TH}" font-size="23" fill="${SUB}">${sub}</text>
  <rect x="${W - 46 - 250}" y="42" width="250" height="52" rx="26" fill="${tone.bg}" stroke="${tone.edge}" stroke-width="2.5"/>
  <text x="${W - 46 - 125}" y="77" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${tone.ink}">${badge}</text>

  <g clip-path="url(#stage)">
    ${woodBand()}
    <!-- เสาค้ำ 2 ชิ้นประกบ (ชิ้นหลังเยื้องให้เห็นว่ามี 2 แผ่น) แล้วค่อยวางฐานทับปลายเสา -->
    <g transform="translate(12 -8)" opacity="0.5"><path d="${POST_PATH}" ${piece()}/></g>
    <path d="${POST_PATH}" ${piece()}/>
    <rect x="${OX - cm(9.5) / 2}" y="${BASE_TOP}" width="${cm(9.5)}" height="${BASE_H}" rx="6" ${piece()}/>

    <!-- แกนกลาง Ø 13 ซม. -->
    <circle cx="${OX}" cy="${PIVOT_Y}" r="${DISC_R}" ${piece()}/>
    ${m.sparkle ? `<g clip-path="url(#disc)">${glitter(OX - DISC_R, PIVOT_Y - DISC_R, DISC_R * 2, DISC_R * 2, 40, 31)}</g>` : ""}
    ${HANGERS.map((h) => `<line x1="${OX}" y1="${PIVOT_Y}" x2="${h.px}" y2="${h.py}" stroke="#ffffff" stroke-width="4" opacity="0.7"/>`).join("")}
    <circle cx="${OX}" cy="${PIVOT_Y}" r="11" fill="#ffffff" stroke="${EDGE}" stroke-width="2.5"/>

    <!-- ตัวห้อย 6 ชิ้น (ลายลูกค้าแทนด้วยมาสคอต) -->
    ${HANGERS.map((h) => `
      <line x1="${h.px}" y1="${h.py}" x2="${h.px}" y2="${h.cy - HANG_R * 0.9}" stroke="${EDGE}" stroke-width="2.5"/>
      <circle cx="${h.px}" cy="${h.cy}" r="${HANG_R}" ${piece()}/>
      ${m.sparkle ? glitter(h.px - HANG_R * 0.7, h.cy - HANG_R * 0.7, HANG_R * 1.4, HANG_R * 1.4, 6, 23) : ""}
      <image href="${MASCOT.uri}" x="${h.px - aw / 2}" y="${h.cy - ah / 2 + 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
      <circle cx="${h.px}" cy="${h.py}" r="6" fill="#ffffff" stroke="${EDGE}" stroke-width="2"/>`).join("")}
  </g>
  <rect x="${STAGE.x}" y="${STAGE.y}" width="${STAGE.w}" height="${STAGE.h}" rx="24" fill="none" stroke="#e2e8f0" stroke-width="2"/>

  <g font-family="${TH}" font-size="23" fill="${SUB}">
    ${notes.map((t, i) => `<text x="${W / 2}" y="${772 + i * 36}" text-anchor="middle">${t}</text>`).join("")}
  </g>
</svg>`;
}

const CARDS = [
  {
    key: "clear", mat: "clear", name: CLEAR,
    title: "อะคริลิคใส", sub: "เนื้อใสมาตรฐาน · ทั้งชุด 4 ชิ้นส่วน",
    badge: "ราคาเริ่มต้น ไม่บวกเพิ่ม", tone: { bg: "#f1f5f9", edge: "#cbd5e1", ink: SUB },
    desc: "เนื้อใสมองทะลุ เห็นพื้นหลัง — เนื้อมาตรฐาน ไม่บวกเพิ่ม",
    notes: ["มองทะลุเห็นพื้นหลัง เหมาะกับลายที่อยากให้ดูลอย", "ไม่ต้องเลือกเฉดต่อ — เนื้อใสมีแบบเดียว"],
  },
  {
    key: "c02", mat: "c02", name: C02,
    title: "อะคริลิคขาวขุ่น C-02", sub: "เนื้อทึบสีขาว เงา 2 ด้าน · ทั้งชุด 4 ชิ้นส่วน",
    badge: "ราคาเริ่มต้น ไม่บวกเพิ่ม", tone: { bg: "#f1f5f9", edge: "#cbd5e1", ink: SUB },
    desc: "เนื้อทึบขาว เงา 2 ด้าน ลายเด่นชัด — ราคาเท่าอะคริลิคใส",
    notes: ["เนื้อทึบ พื้นหลังไม่ทะลุขึ้นมา สีลายเลยเด่นกว่าเนื้อใส", "ไม่ต้องเลือกเฉดต่อ — C-02 มีแบบเดียว"],
  },
  {
    key: "special", mat: "special", name: SPECIAL,
    title: "อะคริลิคพิเศษ", sub: "กลิตเตอร์ / โฮโลแกรม / อะคริลิคสี",
    badge: "บวกเพิ่มตามชิ้นที่ติ๊ก", tone: { bg: "#fdf2f8", edge: "#fbcfe8", ink: "#be185d" },
    desc: "กลิตเตอร์ / โฮโลแกรม / อะคริลิคสี — เลือกเฉดต่อได้ 40+ เฉด",
    notes: ["เลือกเฉดต่อที่กลุ่ม “สีอะคริลิค” ที่จะโผล่ขึ้นมาให้", "ค่าเนื้อพิเศษคิดเป็นชิ้น — ติ๊กเลือกได้ทีละชิ้นส่วนด้านล่าง"],
  },
];

// ── วาดภาพ 3 ใบ ─────────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const BASE_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;

for (const c of CARDS) {
  c.buf = await sharp(Buffer.from(typeArt(c))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  c.file = `type-${c.key}-${VER}.jpg`;
  c.storageKey = `products/${PRODUCT_ID}/${c.file}`;
  c.url = `${BASE_URL}/${c.storageKey}`;
  writeFileSync(`${OUT}/${c.file}`, c.buf);
  // ⚠️ ต่อ .resize() 2 ครั้งในไพป์ไลน์เดียวไม่ได้ — sharp ใช้ครั้งสุดท้ายครั้งเดียว ต้องคั่น toBuffer()
  const tiny = await sharp(c.buf).resize(80, 80).toBuffer();
  await sharp(tiny).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/_thumb80-${c.key}.jpg`);
  console.log(`🖼  ${OUT}/${c.file}  ${Math.round(c.buf.length / 1024)} KB — ${c.title}`);
}
console.log(`🔎 ${OUT}/_thumb80-*.jpg — ย่อ 80 px แบบที่การ์ดเห็นจริง`);

// ── ตรวจโครงเดิม ────────────────────────────────────────────────────
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗", m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(`อ่าน ${PRODUCT_ID} ไม่สำเร็จ — ${readErr.message}`);
const data = structuredClone(row.data);
const optOf = (label) => (data.options ?? []).find((o) => o.label === label);
const typeOpt = optOf(TYPE);
const colorOpt = optOf(COLOR);
if (!typeOpt) die(`ไม่เจอกลุ่ม "${TYPE}"`);
if (!colorOpt) die(`ไม่เจอกลุ่ม "${COLOR}"`);

// ⚠️ "ประเภทอะคริลิค" ต้องไม่ใช่แกนตารางราคา ไม่งั้นเปลี่ยนชื่อตัวเลือก = ราคาหาย (ดู iducky-price-driver-trap)
const drivers = new Set([
  ...(data.pricing?.driverLabels ?? []),
  ...(data.priceRates ?? []).flatMap((r) => r.pricing?.driverLabels ?? []),
]);
if (drivers.has(TYPE)) die(`"${TYPE}" เป็นแกนตารางราคา — เปลี่ยนชื่อตัวเลือกไม่ได้ ต้องแก้ cells ก่อน`);

// รายชื่อเฉดพิเศษเดิม เอามาจากกฎเดิม (อย่าพิมพ์ใหม่ จะตกหล่น)
const oldSpecialRule = (data.rules ?? []).find(
  (r) => r.when?.label === TYPE && (r.when.choices?.[0] ?? r.when.choice) === OLD_SPECIAL && r.limit?.label === COLOR
);
const SPECIAL_SHADES = oldSpecialRule?.limit?.allow;
if (!SPECIAL_SHADES?.length) die(`ไม่เจอกฎเดิม "${TYPE}: ${OLD_SPECIAL} → ${COLOR}" ที่จะยกรายชื่อเฉดมาใช้ต่อ`);
for (const n of [CLEAR, C02]) {
  if (!colorOpt.choices.some((c) => c.name === n)) die(`กลุ่ม "${COLOR}" ไม่มีเฉด "${n}"`);
  if (SPECIAL_SHADES.includes(n)) die(`"${n}" ไปอยู่ในรายการเฉดพิเศษด้วย — ตรวจกฎเดิมก่อน`);
}
console.log(`เฉดพิเศษที่ยกมาจากกฎเดิม: ${SPECIAL_SHADES.length} เฉด`);

// ── เขียนโครงใหม่ลงสำเนา ────────────────────────────────────────────
const byKey = Object.fromEntries(CARDS.map((c) => [c.key, c]));
typeOpt.display = "cards";
typeOpt.note = "เลือกเนื้ออะคริลิคหลักของทั้งชุด — เนื้อใสกับ C-02 ราคาเท่ากัน";
typeOpt.choices = CARDS.map((c) => ({ name: c.name, desc: c.desc, imageSrc: c.url }));
colorOpt.showWhen = { label: TYPE, choices: [SPECIAL] };
// เฉด "อะคริลิคใส" ในเมนูสียังไม่มีรูป — ใช้ใบเดียวกับการ์ดประเภท
const clearShade = colorOpt.choices.find((c) => c.name === CLEAR);
clearShade.imageSrc = byKey.clear.url;

/* กฎ: ประเภท → กรองรายการสี (ทิศเดียว ⛔ ห้ามใส่ย้อนทิศ สี → ประเภท จะล็อกตาย) */
const rule = (choice, allow) => ({ when: { label: TYPE, choice, choices: [choice] }, limit: { label: COLOR, allow } });
const WANT = [rule(CLEAR, [CLEAR]), rule(C02, [C02]), rule(SPECIAL, SPECIAL_SHADES)];
data.rules = [
  // ทิ้งกฎเก่าที่ชี้จากกลุ่มประเภท (ธรรมดา/พิเศษ ไม่มีอยู่แล้ว) + กฎที่ WANT จะเขียนทับ
  ...(data.rules ?? []).filter((r) => r.when?.label !== TYPE),
  ...WANT,
];

const sel = (label) => (data.options.find((o) => o.label === label)?.choices ?? []).map((c) => c.name);
console.log(`\n${TYPE} → ${sel(TYPE).join(" · ")}`);
console.log(`${COLOR} → โผล่เมื่อเลือก "${colorOpt.showWhen.choices[0]}" (${colorOpt.choices.length} เฉด)`);
console.log(`rules → ${data.rules.length} ข้อ (ชี้จาก ${TYPE} ${WANT.length} ข้อ)`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB + อ่านกลับเทียบ ──────────────────────────────
for (const c of CARDS) {
  const { error } = await sb.storage.from("product-images").upload(c.storageKey, c.buf, { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัปโหลดพัง ${c.storageKey} — ${error.message}`);
}
console.log(`อัปโหลด ${CARDS.length} ใบเรียบร้อย`);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) die(`update พัง/0 แถว — ${updErr?.message ?? ""}`);

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bType = back.data.options.find((o) => o.label === TYPE);
const bColor = back.data.options.find((o) => o.label === COLOR);
if (bType?.display !== "cards") die("อ่านกลับ: กลุ่มประเภทไม่ใช่การ์ด");
for (const c of CARDS) {
  const got = bType.choices.find((x) => x.name === c.name);
  if (got?.imageSrc !== c.url || got?.desc !== c.desc) die(`อ่านกลับการ์ด "${c.name}" ไม่ตรง — ${JSON.stringify(got)}`);
}
if (bType.choices.length !== CARDS.length) die(`อ่านกลับ: การ์ดมี ${bType.choices.length} ใบ (ควรเป็น ${CARDS.length})`);
if (bColor?.showWhen?.choices?.[0] !== SPECIAL) die("อ่านกลับ: กลุ่มสียังไม่ผูก showWhen");
if (bColor.choices.find((c) => c.name === CLEAR)?.imageSrc !== byKey.clear.url) die("อ่านกลับ: เฉดอะคริลิคใสยังไม่มีรูป");
const backRules = back.data.rules.filter((r) => r.when?.label === TYPE);
if (backRules.length !== 3) die(`อ่านกลับ: กฎจากกลุ่มประเภทมี ${backRules.length} ข้อ (ควรเป็น 3)`);
if (back.data.rules.some((r) => r.when?.label === COLOR)) die("อ่านกลับ: เจอกฎย้อนทิศ สี → ประเภท (ห้ามมี)");
if (back.data.options.length !== data.options.length) die("อ่านกลับ: จำนวนกลุ่มเปลี่ยน");
console.log(`✓ ${TYPE} เป็นการ์ด 3 ใบ · ${COLOR} ซ่อนไว้ให้ "${SPECIAL}" · กฎ 3 ข้อทิศเดียว · savedAt =`, back.data.savedAt);

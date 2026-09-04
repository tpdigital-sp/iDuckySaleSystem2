#!/usr/bin/env node
/**
 * เข็มกลัดอะคริลิค (product id "1") — กลุ่ม "ชนิดอะคริลิค" ทำให้เหมือนพวงกุญแจอะคริลิค
 *
 *   node scripts/brooch-acrylic-type-cards.mjs           (วาดภาพ + ตรวจ ไม่เขียน DB)
 *   node scripts/brooch-acrylic-type-cards.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * อ้างแพตเทิร์นของ /products/keyring (`scripts/keyring-acrylic-type-cards.mts`):
 *   ให้ลูกค้า "เลือกเนื้อก่อน" เป็นการ์ดที่มีรูป + คำอธิบาย + ส่วนต่างราคา แล้วค่อยเลือกเฉด
 *
 * ⚠️ ต่างจากพวงกุญแจตรงที่แกนราคาของตัวนี้มีแค่ 2 ค่า — `ธรรมดา` / `อะคริลิคพิเศษ`
 *    (คีย์ตารางคือ "2cm│ธรรมดา" … ) ห้ามแตกเป็น 3 การ์ดแบบพวงกุญแจ ราคาจะหาย
 *    "ธรรมดา" ครอบทั้งอะคริลิคใสและขาวขุ่น C-02 (กฎ rules เดิมกรองไว้ให้แล้ว) จึงทำภาพรวม 2 เนื้อไว้ในใบเดียว
 *
 * กลุ่ม "สีอะคริลิค" ยังโชว์ตลอด (ต่างจากพวงกุญแจที่ซ่อนตอนไม่ใช่สีพิเศษ) เพราะ "ธรรมดา"
 * ยังต้องเลือกต่อว่าจะเอา ใส หรือ C-02 — เติม note บอกให้ชัดแทน
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "1";
const TYPE = "ชนิดอะคริลิค";
const COLOR = "สีอะคริลิค";
const NORMAL = "ธรรมดา";
const SPECIAL = "อะคริลิคพิเศษ";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const VER = "v1";

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
/** ภาพสีพิเศษ = ไฟล์กลางใบเดียวกับที่พวงกุญแจใช้ (ดู keyring-special-color-art.mts) */
const SPECIAL_IMG = `${IMG}/acrylic-colors/special-mix-v1.jpg`;
/** ภาพเนื้อธรรมดา = ใบใหม่ วางไว้ในคลังกลางชุดเดียวกัน สินค้าตัวอื่นหยิบไปใช้ต่อได้ */
const NORMAL_KEY = `products/acrylic-colors/normal-mix-${VER}.jpg`;
const NORMAL_IMG = `${IMG.replace(/\/products$/, "")}/${NORMAL_KEY}`;

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/brooch-acrylic/type").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/**
 * ภาพ "เนื้อธรรมดา" — วางชิ้นงาน 2 ชิ้นบนพื้นลายเดียวกัน ให้เห็นความต่างของเนื้อชัด ๆ
 *   ซ้าย = อะคริลิคใส (พื้นด้านหลังทะลุขึ้นมาให้เห็น)  ·  ขวา = ขาวขุ่น C-02 (ทึบ ลายเด่นไม่ทะลุ)
 */
function normalMixArt() {
  const tile = (x, y, w, h, clear) => {
    const r = 46;
    const mh = h * 0.6;
    const mw = mh * MASCOT.ratio;
    return `
    <rect x="${x + 5}" y="${y + 11}" width="${w}" height="${h}" rx="${r}" fill="#0f172a" opacity="0.14"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
      fill="${clear ? "#eaf6fd" : "#fdfdfc"}" fill-opacity="${clear ? 0.14 : 1}"
      stroke="${clear ? "#ffffff" : "#e4e7ec"}" stroke-width="${clear ? 6 : 3}"/>
    ${clear ? `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${r - 3}" fill="none" stroke="#9dc9de" stroke-width="2" opacity="0.75"/>` : ""}
    <image href="${MASCOT.uri}" x="${x + w / 2 - mw / 2}" y="${y + h / 2 - mh / 2}" width="${mw}" height="${mh}"
      preserveAspectRatio="xMidYMid meet"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.8"/>
    <path d="M ${x + w * 0.1} ${y + h} L ${x + w * 0.46} ${y} L ${x + w * 0.64} ${y} L ${x + w * 0.28} ${y + h} Z"
      fill="#ffffff" opacity="${clear ? 0.3 : 0.22}"/>`;
  };
  /* พื้นหลัง "โต๊ะไม้ + กระดาษ" — ของจริงที่ทะลุแผ่นใสขึ้นมาให้เห็น */
  const stripes = [];
  for (let i = 0; i < 22; i++)
    stripes.push(`<rect x="0" y="${150 + i * 26}" width="${W}" height="14" fill="#b98a5c" opacity="${i % 2 ? 0.5 : 0.26}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="150" width="${W}" height="570" fill="#e0c4a1"/>
  ${stripes.join("")}
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="46" font-weight="800" text-anchor="middle" fill="${INK}">อะคริลิคธรรมดา</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">เลือกได้ 2 เนื้อ · ราคาเริ่มต้น ไม่บวกเพิ่ม</text>

  ${tile(66, 214, 348, 420, true)}
  ${tile(486, 214, 348, 420, false)}

  <rect x="66" y="656" width="348" height="60" rx="30" fill="#ffffff" opacity="0.95" stroke="#cbd5e1" stroke-width="2"/>
  <text x="240" y="696" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${INK}">อะคริลิคใส</text>
  <rect x="486" y="656" width="348" height="60" rx="30" fill="#ffffff" opacity="0.95" stroke="#cbd5e1" stroke-width="2"/>
  <text x="660" y="696" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${INK}">ขาวขุ่น C-02</text>

  <text x="240" y="768" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">มองทะลุ เห็นพื้นหลัง</text>
  <text x="660" y="768" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">ทึบ เงา 2 ด้าน ลายเด่น</text>
  <text x="${W / 2}" y="846" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">ทั้ง 2 เนื้อราคาเท่ากัน — เลือกเฉดต่อที่กลุ่ม “สีอะคริลิค”</text>
</svg>`;
}

const normalBuf = await sharp(Buffer.from(normalMixArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/normal-mix-${VER}.jpg`, normalBuf);
await sharp(normalBuf).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/_thumb80-normal-mix.jpg`);
console.log(`🖼  ${OUT}/normal-mix-${VER}.jpg  ${Math.round(normalBuf.length / 1024)} KB — ใส vs ขาวขุ่น C-02`);
console.log(`🔎 ${OUT}/_thumb80-normal-mix.jpg — ย่อ 80 px แบบที่การ์ดเห็นจริง`);

// ── อ่าน DB มาคิดส่วนต่างราคาจริง (ไม่เดาตัวเลข) ────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = structuredClone(row.data);

const deltas = new Set();
for (const rate of data.priceRates ?? []) {
  const drivers = rate.pricing.driverLabels ?? [];
  const at = drivers.indexOf(TYPE);
  if (at < 0) continue;
  for (const [key, vals] of Object.entries(rate.pricing.cells ?? {})) {
    const parts = key.split("│");
    if (parts[at] !== SPECIAL) continue;
    const base = rate.pricing.cells[parts.map((p, i) => (i === at ? NORMAL : p)).join("│")];
    if (base) vals.forEach((v, i) => deltas.add(v - base[i]));
  }
}
if (!deltas.size) { console.error("คิดส่วนต่างราคาไม่ได้ — โครงตารางเปลี่ยนไปแล้ว หยุดก่อน"); process.exit(1); }
const lo = Math.min(...deltas);
const hi = Math.max(...deltas);
const RANGE = lo === hi ? `฿${lo}` : `฿${lo}-${hi}`;
console.log(`ส่วนต่าง "${SPECIAL}" เทียบ "${NORMAL}": ${RANGE}/ชิ้น (ค่าที่เจอ: ${[...deltas].sort((a, b) => a - b).join(", ")})`);

// ── ประกอบกลุ่มใหม่ ─────────────────────────────────────────────────
const type = (data.options ?? []).find((o) => o.label === TYPE);
const color = (data.options ?? []).find((o) => o.label === COLOR);
if (!type || !color) { console.error(`ไม่เจอกลุ่ม "${TYPE}" หรือ "${COLOR}" — หยุดก่อน`); process.exit(1); }
const names = type.choices.map((c) => c.name).sort().join("|");
if (names !== [NORMAL, SPECIAL].sort().join("|")) { console.error("ตัวเลือกในกลุ่มชนิดไม่ใช่ 2 ค่าเดิม:", names); process.exit(1); }

const shadesOf = (choice) => {
  const rule = (data.rules ?? []).find((r) => r.when?.label === TYPE && r.limit?.label === COLOR &&
    (r.when.choices ?? [r.when.choice]).includes(choice));
  return rule?.limit?.allow ?? [];
};
const normalShades = shadesOf(NORMAL);
const specialShades = shadesOf(SPECIAL);
if (normalShades.length !== 2 || specialShades.length < 40) {
  console.error("กฎ ชนิด → สี ไม่เป็นอย่างที่คิด:", normalShades.length, specialShades.length); process.exit(1);
}

type.display = "cards";
type.note = "เนื้ออะคริลิคที่ใช้ทำตัวชิ้นงาน — ราคาต่อชิ้นคิดตามแบบที่เลือก (ดูตารางราคาด้านบน)";
const DESC = {
  [NORMAL]: `${CLEAR} หรือ ${C02} — เลือกเฉดต่อได้ที่กลุ่ม "${COLOR}" · ราคาเริ่มต้น ไม่บวกเพิ่ม`,
  [SPECIAL]: `กลิตเตอร์ · โฮโลแกรม · กระจก · อะคริลิคสีทึบ รวม ${specialShades.length} เฉด (เลือกเฉดได้หลังกดแบบนี้) — บวกเพิ่ม ${RANGE}/ชิ้น ตามขนาดและจำนวนที่สั่ง`,
};
for (const c of type.choices) {
  c.imageSrc = c.name === NORMAL ? NORMAL_IMG : SPECIAL_IMG;
  c.desc = DESC[c.name];
  if (c.name === NORMAL) c.popular = true;
  else delete c.popular;
}
color.note = `เฉดของเนื้อที่กดไว้ด้านบน — "${NORMAL}" มี 2 เฉด · "${SPECIAL}" มี ${specialShades.length} เฉด (ราคาเท่ากันทุกเฉด)`;

// ── ตรวจก่อนเขียน: จำลอง allowedChoices + resolveSelections ตามลำดับกลุ่มจริง ──
const ruleHits = (r, sel) => {
  const cur = sel[r.when.label];
  return !!cur && (r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur);
};
const allowedFor = (label, sel) => {
  const all = (data.options.find((o) => o.label === label)?.choices ?? []).map((c) => c.name);
  let allowed = all;
  for (const r of data.rules ?? []) {
    if (r.limit?.label !== label || !ruleHits(r, sel)) continue;
    allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : all;
};
const resolve = (seed) => {
  const out = {};
  for (const o of data.options) {
    const view = { ...seed, ...out };
    const allowed = allowedFor(o.label, view);
    const cur = seed[o.label];
    out[o.label] = cur && allowed.includes(cur) ? cur : allowed[0];
  }
  return out;
};
const rate0 = data.priceRates[0];
const priceOf = (sel) => rate0.pricing.cells[rate0.pricing.driverLabels.map((l) => sel[l]).join("│")]?.[0];

let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log(`   ${ok ? "✅" : "❌"} ${msg}`); };
console.log("\n🔍 ตรวจผล (ขนาด 4cm · เรทที่ 1 ช่วง 1-10 ชิ้น):");
const base = { "ขนาดด้านที่ยาวที่สุด": "4cm" };
for (const t of [NORMAL, SPECIAL]) {
  const sel = resolve({ ...base, [TYPE]: t });
  const shades = allowedFor(COLOR, sel);
  check(sel[TYPE] === t && priceOf(sel) != null,
    `กดการ์ด "${t}" → ช่องราคา "${sel[TYPE]}" ฿${priceOf(sel)}/ชิ้น · เฉดที่เลือกได้ ${shades.length} (${shades.slice(0, 2).join(", ")}${shades.length > 2 ? ", …" : ""})`);
}
{
  /* กับดักเดิมของพวงกุญแจ: กดสีพิเศษแล้วกดกลับไม่ได้ เพราะเฉดที่ค้างดันชนิดกลับ */
  const sp = resolve({ ...base, [TYPE]: SPECIAL, [COLOR]: specialShades[3] });
  const back = resolve({ ...sp, [TYPE]: NORMAL });
  check(back[TYPE] === NORMAL && normalShades.includes(back[COLOR]),
    `กด "${SPECIAL}" (${specialShades[3]}) แล้วกดกลับ "${NORMAL}" → ชนิด "${back[TYPE]}" · เฉด "${back[COLOR]}"`);
  check(priceOf(sp) > priceOf(back), `ราคาต่างกันจริง — พิเศษ ฿${priceOf(sp)} > ธรรมดา ฿${priceOf(back)}`);
}
{
  const cells = rate0.pricing.cells;
  const miss = (data.options.find((o) => o.label === "ขนาดด้านที่ยาวที่สุด")?.choices ?? [])
    .flatMap((c) => [NORMAL, SPECIAL].map((k) => `${c.name}│${k}`)).filter((k) => !cells[k]);
  check(miss.length === 0, `คีย์ตารางราคาครบทุกช่อง (${miss.length ? miss.join(", ") : "ไม่มีคีย์หาย"})`);
}
if (bad) { console.error(`\n❌ ตรวจไม่ผ่าน ${bad} ข้อ — ไม่เขียน DB`); process.exit(1); }

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน ─────────────────────────────────────────
const { error: upErr } = await sb.storage.from("product-images").upload(NORMAL_KEY, normalBuf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", NORMAL_KEY, upErr); process.exit(1); }
console.log("อัปโหลดแล้ว", NORMAL_IMG);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gt = back.data.options.find((o) => o.label === TYPE);
const gc = back.data.options.find((o) => o.label === COLOR);
if (gt?.display !== "cards" || gt?.note !== type.note || gc?.note !== color.note) {
  console.error("อ่านกลับ note/display ไม่ตรง", gt?.display, gt?.note, gc?.note); process.exit(1);
}
for (const c of gt.choices) {
  const want = c.name === NORMAL ? NORMAL_IMG : SPECIAL_IMG;
  if (c.imageSrc !== want || c.desc !== DESC[c.name]) { console.error("อ่านกลับตัวเลือกไม่ตรง:", c.name, c); process.exit(1); }
}
console.log(`✓ กลุ่ม "${TYPE}" การ์ด + ภาพ + คำอธิบายส่วนต่าง ${RANGE}/ชิ้น · อ่านกลับตรง · savedAt =`, back.data.savedAt);

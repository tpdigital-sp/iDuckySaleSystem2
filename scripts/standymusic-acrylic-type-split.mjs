#!/usr/bin/env node
/**
 * สแตนดี้ฐานดนตรี (standymusic-1) — แยก "อะคริลิคใส" กับ "ขาวขุ่น C-02" ออกจาก "อะคริลิคธรรมดา"
 *
 *   node scripts/standymusic-acrylic-type-split.mjs           (วาดการ์ด C-02 ดูก่อน)
 *   node scripts/standymusic-acrylic-type-split.mjs --write   (+ อัปโหลด + ปรับโครงกลุ่ม + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: "อะคริลิคใส , อะคริลิคขาวขุ่น C-02 ควรแยกออกจากอะคริลิคธรรมดา"
 *
 * เดิม: ประเภทะคริลิค = ธรรมดา / พิเศษ → เลือกธรรมดาแล้วต้องไปเลือกต่อใน dropdown ที่มีแค่ 2 ตัว = ซ้ำซ้อน
 * ใหม่: ทำตาม **แพตเทิร์นที่ร้านใช้อยู่แล้ว** กับ `keyring-copy-copy` (และ `standy` ต้นแบบ) —
 *   ประเภทะคริลิค = อะคริลิคใส / อะคริลิคขาวขุ่น C-02 / อะคริลิคพิเศษ (+฿20)   ← 3 การ์ด เลือกจบในที่เดียว
 *   สีอะคริลิค (43 เฉด) ตั้ง showWhen ให้โผล่เฉพาะตอนเลือก "อะคริลิคพิเศษ"
 *   rules 3 ข้อ: ใส → allow[ใส] · C-02 → allow[C-02] · พิเศษ → allow[43 เฉด]
 *
 * ทำไมต้องมี rules ล็อกทีละ 1 สี ทั้งที่กลุ่มถูกซ่อน: `resolveSelections` จะสแนปค่าของกลุ่มที่ซ่อน
 * ไปที่ตัวแรกที่ "allow" → สีที่ติดไปกับงานผลิตตรงกับที่ลูกค้าเลือกเสมอ (ไม่ใช่ค่า default ค้าง)
 * และ `allowedChoices` ข้ามกฎที่กลุ่มต้นทางถูกซ่อน — ประเภทะคริลิคโชว์ตลอด กฎจึงทำงานครบทั้ง 3 ข้อ
 *
 * ⚠️ ตัวเลือก "อะคริลิคธรรมดา" หายไปจากรายการ — ออเดอร์เก่าที่บันทึกค่านี้ไว้ยังอ่านได้ (เก็บเป็น snapshot)
 *    แต่จะไม่ตรงกับรายการปัจจุบันแล้ว · ชื่อ "กลุ่ม" ไม่แตะ (rules + ออเดอร์เก่าอ้างอยู่)
 * ⚠️ ราคาไม่ขยับ: ใส/C-02 ไม่บวก · พิเศษ +฿20 เท่าเดิม · driverLabels ว่าง (ไม่ใช่แกนตาราง)
 *
 * ภาพการ์ด: ใส = color-clear-standee-v1.jpg (มีแล้ว) · พิเศษ = type-special-v1.jpg (มีแล้ว)
 *   C-02 = วาดใหม่ในไฟล์นี้ **เลย์เอาต์เดียวกับการ์ดใสเป๊ะ** ต่างกันแค่แผ่นทึบจนบังจุดสีข้างหลัง
 *   → วางคู่กันแล้วเห็นความต่างทันทีว่า "ทะลุ" กับ "ทึบ" (ทรง A/B เดียวกัน เทียบง่ายกว่าคนละองค์ประกอบ)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "standymusic-1";
const VER = "v1";
const TYPE_GROUP = "ประเภทะคริลิค";      // ⚠️ สะกดตกอักษร อ ตามของเดิม — ห้ามแก้ (rules + ออเดอร์เก่าอ้างชื่อนี้)
const COLOR_GROUP = "สีอะคริลิค";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "อะคริลิคพิเศษ";
const OLD_PLAIN = "อะคริลิคธรรมดา";
const EXTRA_SPECIAL = 20;
const FILE_C02 = `type-c02-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/standymusic/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 420);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b";
const CM = 17;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ฐานกล่องดนตรีไม้ทรงกลม ⌀ 7.5 ซม. (ทรงเดียวกับสคริปต์พี่น้องในชุดนี้) */
const musicBase = (cx, yBottom) => {
  const d = 7.5 * CM, bodyH = 3.2 * CM, ry = d * 0.155, yTop = yBottom - bodyH, x = cx - d / 2;
  const discW = d * 1.06, discH = ry * 0.66;
  return `
  <ellipse cx="${cx}" cy="${yBottom + discH * 0.9}" rx="${d * 0.62}" ry="${ry * 0.55}" fill="#0f172a" opacity="0.10"/>
  <ellipse cx="${cx}" cy="${yBottom + 2}" rx="${discW / 2}" ry="${discH}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5"/>
  <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#wood)"/>
  <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#woodShade)"/>
  <ellipse cx="${cx}" cy="${yTop}" rx="${d / 2}" ry="${ry}" fill="#e3c49b" stroke="#c8a274" stroke-width="1.5"/>
  <rect x="${cx - d * 0.26}" y="${yTop - 2.5}" width="${d * 0.52}" height="5" rx="2.5" fill="#8b6a47" opacity="0.75"/>`;
};

/** แผ่นสแตนดี้ "ขาวขุ่น C-02" — ทึบเต็มใบ จุดสีข้างหลังถูกบังหมด (คู่เทียบกับการ์ดใส) */
const opaqueStandee = (cx, yBottom) => {
  const h = 15 * CM, w = 10.6 * CM, x = cx - w / 2, y = yBottom - h;
  const mh = h * 0.5, mw = mh * MASCOT.ratio;
  const d = `M ${x} ${y + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L ${x + w} ${yBottom} L ${x} ${yBottom} Z`;
  return `
  <g>
    <path d="${d}" fill="#0f172a" opacity="0.10" transform="translate(5 7)"/>
    <path d="${d}" fill="#fbfcfc" stroke="#c8d4d8" stroke-width="3"/>
    <!-- เงา 2 ด้าน: แถบไฮไลต์บาง ๆ ริมซ้ายให้ดูเป็นผิวเงา ไม่ใช่กระดาษด้าน -->
    <path d="M ${x + w * 0.09} ${y + w * 0.66} A ${w / 2} ${w / 2} 0 0 1 ${x + w * 0.34} ${y + w * 0.15} L ${x + w * 0.24} ${yBottom - 10} L ${x + w * 0.1} ${yBottom - 10} Z"
      fill="#ffffff" opacity="0.9"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${yBottom - mh - h * 0.17}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
};

const svgC02 = () => {
  const bx = 60, by = 196, bw = W - 120, bh = 430;
  const cx = W / 2, ground = by + bh - 42;
  const dot = (dx, dy, r, fill) => `<circle cx="${cx + dx}" cy="${by + dy}" r="${r}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c79a68"/><stop offset="0.35" stop-color="#e7c79c"/><stop offset="1" stop-color="#b98b5c"/>
    </linearGradient>
    <linearGradient id="woodShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.06"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <clipPath id="box"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${cx}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${esc(C02)}</text>
  <text x="${cx}" y="134" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">ชนิดมาตรฐาน หนาประมาณ 3 มม. · เนื้อทึบขาว เงา 2 ด้าน</text>

  <g clip-path="url(#box)">
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#f2f8fb"/>
    <!-- จุดสีชุดเดียวกับการ์ด "อะคริลิคใส" เป๊ะ — ใบนี้ถูกแผ่นบังหมด เทียบกันแล้วเห็นความต่างทันที -->
    ${dot(0, 126, 30, "#8fd0ea")}
    ${dot(-90, 200, 34, "#f6a5c0")}
    ${dot(92, 252, 28, "#ffd977")}
    ${dot(-232, 110, 26, "#c9b6f2")}
    ${dot(230, 330, 30, "#9ee0c4")}
    ${opaqueStandee(cx, ground - 3.2 * CM + 6)}
    ${musicBase(cx, ground)}
  </g>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26" fill="none" stroke="#d7e6ee" stroke-width="3"/>
  <text x="${cx}" y="${by + bh + 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#8fb9c4">จุดสีข้างหลังถูกแผ่นบังจนหมด = เนื้อทึบ</text>

  <text x="${cx}" y="770" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ราคาตามตารางคือชนิดนี้ ไม่บวกเพิ่ม (เท่ากับอะคริลิคใส)</text>
  <text x="${cx}" y="812" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">อยากได้สี / กลิตเตอร์ / โฮโลแกรม เลือก “${esc(SPECIAL)}” ได้</text>
  <text x="${cx}" y="856" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">มีพื้นขาวหนุนหลัง สีลายจึงสดกว่าเนื้อใส</text>
</svg>`;
};

const buf = await sharp(Buffer.from(svgC02())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE_C02}`, buf);
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE_C02}`);
console.log(`🖼  ${OUT}/${FILE_C02}  ${Math.round(buf.length / 1024)} KB — ${C02}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE_C02}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const urlC02 = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", urlC02);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = JSON.parse(JSON.stringify(data));
writeFileSync(`${OUT}/../before-split-${VER}.json`, JSON.stringify(before, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", `${OUT}/../before-split-${VER}.json`);

const typeG = (data.options ?? []).filter((o) => o.label === TYPE_GROUP);
const colorG = (data.options ?? []).filter((o) => o.label === COLOR_GROUP);
if (typeG.length !== 1 || colorG.length !== 1) { console.error("กลุ่มไม่ครบ/ซ้ำ — หยุดก่อน"); process.exit(1); }

// ภาพของใส/พิเศษ ยืมจากที่ทำไว้แล้วในรอบก่อน (ต้องมีอยู่จริง ไม่งั้นหยุด)
const oldChoices = Object.fromEntries((typeG[0].choices ?? []).map((c) => [c.name, c]));
const colorChoices = Object.fromEntries((colorG[0].choices ?? []).map((c) => [c.name, c]));
const urlClear = colorChoices[CLEAR]?.imageSrc;
const urlSpecial = oldChoices[SPECIAL]?.imageSrc;
if (!urlClear || !urlSpecial) { console.error("ไม่เจอภาพเดิมของ 'อะคริลิคใส' หรือ 'อะคริลิคพิเศษ' — รันสคริปต์รอบก่อนให้ครบก่อน"); process.exit(1); }
if (!colorChoices[C02] || !colorChoices[CLEAR]) { console.error(`กลุ่ม "${COLOR_GROUP}" ไม่มี ${CLEAR}/${C02}`); process.exit(1); }

const specialShades = (before.rules ?? []).find((r) => r.when?.label === TYPE_GROUP && r.when?.choice === SPECIAL)?.limit?.allow;
if (!specialShades?.length) { console.error("ไม่เจอกฎเดิมของ 'อะคริลิคพิเศษ' (รายชื่อ 43 เฉด)"); process.exit(1); }

// ── 1) กลุ่มประเภท: ธรรมดา → แตกเป็น ใส + C-02 (พิเศษ คงเดิมทั้งชื่อและ extra) ──
typeG[0].display = "cards";
typeG[0].choices = [
  { name: CLEAR, imageSrc: urlClear, desc: "เนื้อใสมองทะลุ — ราคาตามตาราง ไม่บวกเพิ่ม\nลายลอยเบา เห็นฉากหลังผ่านชิ้นงาน" },
  { name: C02, imageSrc: urlC02, desc: "เนื้อทึบขาว เงา 2 ด้าน — ราคาตามตาราง ไม่บวกเพิ่ม\nมีพื้นขาวหนุนหลัง สีลายสดกว่าเนื้อใส" },
  { ...oldChoices[SPECIAL], name: SPECIAL, extra: EXTRA_SPECIAL, imageSrc: urlSpecial,
    desc: `กลิตเตอร์ / โฮโลแกรม / อะคริลิคสี รวม ${specialShades.length} เฉด\nเลือกเฉดต่อในกลุ่ม “${COLOR_GROUP}” ที่จะโผล่ขึ้นมา` },
];

// ── 2) กลุ่มสี: โผล่เฉพาะตอนเลือก "อะคริลิคพิเศษ" (ใส/C-02 เลือกจบที่การ์ดแล้ว) ──
colorG[0].showWhen = { label: TYPE_GROUP, choices: [SPECIAL] };

// ── 3) กฎ: ล็อกสีให้ตรงกับการ์ดที่เลือก (กลุ่มที่ซ่อนจะถูกสแนปไปที่สีนั้น ไม่ค้างค่า default) ──
data.rules = [
  ...(data.rules ?? []).filter((r) => !(r.when?.label === TYPE_GROUP && r.limit?.label === COLOR_GROUP)),
  { when: { label: TYPE_GROUP, choice: CLEAR, choices: [CLEAR] }, limit: { label: COLOR_GROUP, allow: [CLEAR] } },
  { when: { label: TYPE_GROUP, choice: C02, choices: [C02] }, limit: { label: COLOR_GROUP, allow: [C02] } },
  { when: { label: TYPE_GROUP, choice: SPECIAL, choices: [SPECIAL] }, limit: { label: COLOR_GROUP, allow: specialShades } },
];
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ ─────────────────────────────────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bt = (back.data.options ?? []).find((o) => o.label === TYPE_GROUP);
const bc = (back.data.options ?? []).find((o) => o.label === COLOR_GROUP);
const ruleFor = (choice) => (back.data.rules ?? []).find((r) => r.when?.label === TYPE_GROUP && r.when?.choice === choice && r.limit?.label === COLOR_GROUP);
const names = (bt?.choices ?? []).map((c) => c.name);
const imgs = (bt?.choices ?? []).map((c) => c.imageSrc);
const fails = [
  [(back.data.options ?? []).map((o) => o.label).join("|") === (before.options ?? []).map((o) => o.label).join("|"), "ลำดับ/รายชื่อกลุ่มเปลี่ยน ([[iducky-option-group-loss-guard]])"],
  [names.join("|") === [CLEAR, C02, SPECIAL].join("|"), `ตัวเลือกในกลุ่มประเภทไม่ตรง: ${names.join(", ")}`],
  [!names.includes(OLD_PLAIN), `"${OLD_PLAIN}" ยังค้างอยู่`],
  [bt?.display === "cards", "กลุ่มประเภทไม่ใช่การ์ด"],
  [imgs.every(Boolean) && new Set(imgs).size === 3, "การ์ด 3 ใบมีภาพไม่ครบ/ซ้ำกัน"],
  [(bt?.choices ?? []).every((c) => c.desc), "การ์ดบางใบไม่มีคำอธิบาย"],
  [!bt?.choices?.find((c) => c.name === CLEAR)?.extra && !bt?.choices?.find((c) => c.name === C02)?.extra, "ใส/C-02 ต้องไม่บวกราคา"],
  [bt?.choices?.find((c) => c.name === SPECIAL)?.extra === EXTRA_SPECIAL, `พิเศษต้องบวก ฿${EXTRA_SPECIAL} เท่าเดิม`],
  [bc?.showWhen?.label === TYPE_GROUP && bc?.showWhen?.choices?.join("|") === SPECIAL, "showWhen ของกลุ่มสีไม่ตรง"],
  [bc?.choices?.length === (before.options.find((o) => o.label === COLOR_GROUP).choices ?? []).length, "จำนวนสีในกลุ่มสีเปลี่ยน"],
  [ruleFor(CLEAR)?.limit.allow.join("|") === CLEAR, "กฎของ 'ใส' ไม่ได้ล็อกสีเป็นใส"],
  [ruleFor(C02)?.limit.allow.join("|") === C02, "กฎของ C-02 ไม่ได้ล็อกสีเป็น C-02"],
  [ruleFor(SPECIAL)?.limit.allow.length === specialShades.length, `กฎของพิเศษต้องคง ${specialShades.length} เฉด`],
  [!(back.data.rules ?? []).some((r) => r.when?.choice === OLD_PLAIN), `ยังมีกฎที่อ้าง "${OLD_PLAIN}"`],
  [(back.data.rules ?? []).length === 3, `จำนวนกฎควรเป็น 3 (ได้ ${(back.data.rules ?? []).length})`],
  [JSON.stringify(back.data.pricing) === JSON.stringify(before.pricing), "ตารางราคาเปลี่ยนไป"],
  [JSON.stringify(back.data.priceRates) === JSON.stringify(before.priceRates), "ตารางราคาเงาเปลี่ยนไป"],
  [back.data.priceMin === before.priceMin && back.data.priceMax === before.priceMax, "ช่วงราคาเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ "${TYPE_GROUP}" = ${names.join(" / ")} (การ์ด 3 ใบ มีภาพครบ)`);
console.log(`✓ "${COLOR_GROUP}" ${bc.choices.length} เฉด โผล่เฉพาะตอนเลือก "${SPECIAL}" · กฎ 3 ข้อล็อกสีตรงการ์ด`);
console.log("  savedAt =", back.data.savedAt);

#!/usr/bin/env node
/**
 * บัคเคิ้ลอะคริลิค (/products/บัคเคิ้ลอะคริลิค · id buckle-acrylic)
 * — เปลี่ยนกลุ่มขนาดให้เป็น "การ์ด" + วาดภาพประกอบทุกใบ
 *
 *   node scripts/buckle-acrylic-size-option.mjs           (วาดภาพลง .cache/buckle-acrylic/upload ดูก่อน)
 *   node scripts/buckle-acrylic-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: กลุ่ม "ตัวขนาด 2.5 cm" มีตัวเลือกเดียวเป็นช่องนับจำนวน
 *   "เพิ่มขนาด  เซนละ" (extra 10 · qtyMax 5) = ขนาดมาตรฐาน 2.5 ซม. เพิ่มได้อีกไม่เกิน 5 ซม. ซม.ละ ฿10
 * ของใหม่: กลุ่ม "ขนาด (ด้านยาวสุด)" การ์ด 6 ใบ 2.5 / 3.5 / 4.5 / 5.5 / 6.5 / 7.5 ซม.
 *   ค่าเพิ่ม 0 / 10 / 20 / 30 / 40 / 50 ต่อชิ้น = เลขเดียวกับสเต็ปเปอร์เดิมเป๊ะ แต่ลูกค้าเห็นเป็นขนาดจริง
 *   (กลุ่มเดิมถูกตัดทิ้งพร้อมกัน ไม่งั้นบวกค่าขยายขนาดซ้ำสองที่)
 *
 * ภาพ 900×900 หกใบ **สเกลเดียวกันทุกใบ** (1 ซม. = 70 px):
 *   ชิ้นงานไดคัทขอบขาว (มาสคอตเป็ด) + บัคเคิ้ลใสของจริงขนาดคงที่ 1.15 × 0.85 ซม. กลางชิ้น
 *   + ไม้บรรทัด 0–8 ซม. ไฮไลต์ถึงขนาดของใบนั้น — เทียบกันแล้วเห็นทันทีว่าใบไหนใหญ่กว่า
 *   ⚠️ การ์ด 6 ใบ = โหมดกระชับ 2 คอลัมน์ (ไม่โชว์ desc · รูป 48px) จึงเบิร์นตัวเลขขนาดไว้ในภาพด้วย
 *
 * รันซ้ำได้: เจอกลุ่มเดิม/กลุ่มใหม่อยู่แล้ว = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { assetPath, MASCOTS } from "./iducky-assets.mjs";

const PRODUCT_ID = "buckle-acrylic";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/buckle-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด (ด้านยาวสุด)";
const OLD_GROUP = "ตัวขนาด 2.5 cm";   // กลุ่มสเต็ปเปอร์เดิมที่กลุ่มใหม่มาแทน
const AFTER_GROUP = "อะคริลิค";        // กลุ่มขนาดต้องอยู่ "หน้า" กลุ่มนี้ (บนสุดเหมือนเดิม)
const BASE_CM = 2.5;                   // ขนาดมาตรฐาน รวมในราคาแล้ว
const RATE = 10;                       // ฿ ต่อ ซม. ที่ใหญ่ขึ้นจากมาตรฐาน
const STEPS = [2.5, 3.5, 4.5, 5.5, 6.5, 7.5];

const W = 900;
const H = 900;
const CM = 60;                         // สเกลจริง — ทุกใบเท่ากัน (8 ซม. = 480 px พอดีการ์ด)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const HL = "#f59e0b";

// ── ชิ้นงานไดคัทขอบขาว (พอง alpha ของมาสคอตจริง blur→threshold) ──────
// ⚠️ ห้ามต่อ .blur().threshold() ในไพป์ไลน์เดียว — ต้องคั่น toBuffer() ไม่งั้น threshold ไม่ทำงาน
async function dieCut(mascot, width = 520) {
  const art = await sharp(assetPath(MASCOTS[mascot] ?? mascot)).trim({ threshold: 1 }).resize({ width }).png().toBuffer();
  const m = await sharp(art).metadata();
  const pad = 80;
  const cw = m.width + pad * 2;
  const ch = m.height + pad * 2;
  const canvas = () => sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  const padded = await canvas().composite([{ input: art, left: pad, top: pad }]).png().toBuffer();
  const hard = await sharp(await sharp(padded).extractChannel("alpha").toBuffer()).threshold(140).toBuffer();
  const S = width * 0.05;
  const dil = await sharp(hard).blur(S).threshold(58).toBuffer();    // ขอบขาวไดคัท
  const dil2 = await sharp(hard).blur(S).threshold(20).toBuffer();   // เส้นขอบนอก + เงา
  const fill = (hex, mask) => sharp({ create: { width: cw, height: ch, channels: 3, background: hex } }).joinChannel(mask).png().toBuffer();
  const shadow = await sharp(await fill("#0f172a", dil2)).blur(13).toBuffer();

  const buf = await canvas().composite([
    { input: shadow, left: 5, top: 13, opacity: 0.26 },
    { input: await fill("#c7d2de", dil2) },
    { input: await fill("#ffffff", dil) },
    { input: padded },
  ]).png({ compressionLevel: 9 }).toBuffer();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, ratio: cw / ch };
}

const CHARM = await dieCut("heart");

/** บัคเคิ้ลใส (ก้าน) — ขนาดจริงคงที่ทุกใบ 1.15 × 0.85 ซม. วางกลางชิ้นงาน */
const buckle = (cx, cy) => {
  const bw = 1.15 * CM;
  const bh = 0.85 * CM;
  const x = cx - bw / 2;
  const y = cy - bh / 2;
  const slotH = bh * 0.24;
  const inset = bw * 0.14;
  return `
    <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${bh * 0.18}" fill="#f2f8fc" fill-opacity="0.92" stroke="#a9bccd" stroke-width="2.2"/>
    <rect x="${x + inset}" y="${y + bh * 0.2}" width="${bw - inset * 2}" height="${slotH}" rx="${slotH / 2}" fill="#cfdde8"/>
    <rect x="${x + inset}" y="${y + bh - bh * 0.2 - slotH}" width="${bw - inset * 2}" height="${slotH}" rx="${slotH / 2}" fill="#cfdde8"/>
    <rect x="${x + 3}" y="${y + 3}" width="${bw * 0.22}" height="${bh - 6}" rx="${bh * 0.1}" fill="#ffffff" opacity="0.75"/>`;
};

/** ลูกศรวัดขนาดแนวตั้ง + ป้ายตัวเลข */
const dimV = (x, y1, y2, label) => `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 9}" y1="${y1}" x2="${x + 9}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 9}" y1="${y2}" x2="${x + 9}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" fill="${SUB}">${label}</text>`;

/** ไม้บรรทัด 0–8 ซม. ตำแหน่งเดียวกันทุกใบ — ไฮไลต์ช่วง 0 ถึงขนาดของใบนี้ */
const ruler = (cm) => {
  const len = 8 * CM;
  const x0 = (W - len) / 2;
  const y = 748;
  const h = 46;
  let ticks = "";
  for (let i = 0; i <= 8; i++) {
    const x = x0 + i * CM;
    const tall = i % 1 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + (tall ? 17 : 11)}" stroke="#94a3b8" stroke-width="2"/>
      <text x="${x}" y="${y + h - 6}" font-family="${TH}" font-size="18" text-anchor="middle" fill="#94a3b8">${i}</text>`;
    if (i < 8) ticks += `<line x1="${x + CM / 2}" y1="${y}" x2="${x + CM / 2}" y2="${y + 10}" stroke="#cbd5e1" stroke-width="2"/>`;
  }
  return `
    <rect x="${x0}" y="${y}" width="${len}" height="${h}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="${x0}" y="${y}" width="${cm * CM}" height="${h}" rx="8" fill="${HL}" opacity="0.16"/>
    <line x1="${x0 + cm * CM}" y1="${y - 8}" x2="${x0 + cm * CM}" y2="${y + h + 8}" stroke="${HL}" stroke-width="3"/>
    ${ticks}
    <text x="${x0 + len + 14}" y="${y + 30}" font-family="${TH}" font-size="20" fill="#94a3b8">ซม.</text>`;
};

function art(cm) {
  const add = Math.round((cm - BASE_CM) * RATE);
  const ph = cm * CM;                       // ด้านยาวสุด = ความสูงชิ้นงาน
  const pw = ph * CHARM.ratio;
  const cx = W / 2;
  const cy = 462;
  const top = cy - ph / 2;
  const sub = add === 0
    ? "ขนาดมาตรฐาน — รวมในราคาแล้ว"
    : `ใหญ่ขึ้นจากมาตรฐาน ${(cm - BASE_CM).toFixed(0)} ซม.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="92" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${cm} ซม.</text>
  <text x="${cx}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${add === 0
    ? `<rect x="${cx - 108}" y="152" width="216" height="44" rx="22" fill="#ecfeff" stroke="${OK}" stroke-width="2"/>
       <text x="${cx}" y="182" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">ไม่บวกเพิ่ม</text>`
    : `<rect x="${cx - 118}" y="152" width="236" height="44" rx="22" fill="#fffbeb" stroke="${HL}" stroke-width="2"/>
       <text x="${cx}" y="182" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="#b45309">+${add} บาท / ชิ้น</text>`}
  <image href="${CHARM.uri}" x="${cx - pw / 2}" y="${top}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid meet"/>
  ${buckle(cx, cy + ph * 0.06)}
  ${dimV(cx + pw / 2 + 30, top, top + ph, `${cm} ซม.`)}
  ${ruler(cm)}
  <text x="${cx}" y="${H - 66}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">บัคเคิ้ลใส (ก้าน) ขนาดเท่าเดิมทุกไซซ์ — ร้อยสายคล้องมือถือได้</text>
  <text x="${cx}" y="${H - 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วัดจากด้านยาวสุดของชิ้นงาน · ลายในภาพเป็นตัวอย่าง</text>
</svg>`;
}

const FILES = STEPS.map((cm) => ({
  cm,
  choice: cm === BASE_CM ? `${cm} ซม. (มาตรฐาน)` : `${cm} ซม.`,
  file: `size-${String(cm).replace(".", "-")}cm-${VER}.jpg`,
  svg: art(cm),
}));

const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: `ขนาดมาตรฐาน ${BASE_CM} ซม. รวมในราคาแล้ว — ใหญ่ขึ้นคิดเพิ่ม ซม.ละ ฿${RATE} (ใหญ่สุด ${STEPS[STEPS.length - 1]} ซม.)`,
  choices: FILES.map((f) => ({
    name: f.choice,
    ...(f.cm === BASE_CM ? { popular: true } : { extra: Math.round((f.cm - BASE_CM) * RATE) }),
    desc: f.cm === BASE_CM
      ? "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว · ไดคัทตามทรงลาย"
      : `ใหญ่ขึ้นจากมาตรฐาน ${(f.cm - BASE_CM).toFixed(0)} ซม. · +฿${Math.round((f.cm - BASE_CM) * RATE)} ต่อชิ้น`,
    imageSrc: urls[f.choice],
  })),
};

// รันซ้ำได้: ตัดกลุ่มเดิม + กลุ่มใหม่ทิ้งก่อน แล้ววางกลุ่มใหม่ไว้หน้ากลุ่ม "อะคริลิค" (บนสุดเหมือนเดิม)
const cleaned = options.filter((o) => o.label !== SIZE_GROUP && o.label !== OLD_GROUP);
const at = cleaned.findIndex((o) => o.label === AFTER_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${AFTER_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
cleaned.splice(at, 0, sizeGroup);

data.options = cleaned;
data.savedAt = new Date().toISOString();   // ⚠️ ต้องเป็น ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [!got.some((o) => o.label === OLD_GROUP), "กลุ่มสเต็ปเปอร์เดิมยังอยู่ (คิดค่าขยายขนาดซ้ำ)"],
  [g?.display === "cards", "ไม่ได้เป็นการ์ด"],
  [g?.choices?.length === STEPS.length, "จำนวนการ์ดไม่ครบ"],
  [FILES.every((f, i) => g?.choices?.[i]?.name === f.choice && g?.choices?.[i]?.imageSrc === urls[f.choice]), "ชื่อ/ภาพการ์ดไม่ตรง"],
  [FILES.every((f, i) => (g?.choices?.[i]?.extra ?? 0) === Math.round((f.cm - BASE_CM) * RATE)), "ค่าเพิ่มต่อการ์ดไม่ตรง"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === AFTER_GROUP), "กลุ่มขนาดไม่ได้อยู่บนสุด"],
  [got.some((o) => o.label === "สีอะคริลิค") && got.some((o) => o.label === AFTER_GROUP), "กลุ่มอื่นหายไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nค่าเพิ่มต่อชิ้นของแต่ละการ์ด:");
for (const f of FILES) console.log(`  ${String(f.cm).padStart(3)} ซม.  →  +฿${Math.round((f.cm - BASE_CM) * RATE)}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด ${STEPS.length} ใบ + ภาพครบ · ตัดกลุ่ม "${OLD_GROUP}" ออกแล้ว · savedAt =`, back.data.savedAt);

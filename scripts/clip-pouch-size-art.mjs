#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือก "ขนาด" ของ CLIP POUCH / กระเป๋าต๊อบแต๊บ (clip-pouch)
 *
 *   node scripts/clip-pouch-size-art.mjs            (วาดภาพลง .cache/clip-pouch/upload)
 *   node scripts/clip-pouch-size-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็น dropdown 4 ตัวเลือก เดิมไม่มีภาพเลย ลูกค้านึกไม่ออกว่าแต่ละขนาดใหญ่แค่ไหน
 * เลยวาด 4 ภาพด้วย "สเกลเดียวกันทุกภาพ" (1 ซม. = 28 px):
 *   - ขนาดที่เลือก = ตัวกระเป๋าเต็มใบ (โครงสปริงปากกระเป๋า + ลายเป็ดซับลิเมชั่น)
 *   - อีก 3 ขนาด = เส้นประซ้อนอยู่ข้างหลัง เทียบกันเห็น ๆ ว่าเล็ก/ใหญ่กว่ากันเท่าไหร่
 *   - บัตร ATM (8.6 × 5.4 ซม.) วางข้าง ๆ ที่สเกลเดียวกัน เป็นของจริงไว้กะขนาด
 *
 * ที่มาของตัวเลข: products.clip-pouch ใน DB (3 ก.ย. 69)
 *   ขนาด 4 ตัวเลือก: 9.5x9cm · 11.5x10cm · 14.5x10cm · 17.5x14.5cm (กว้าง×สูง)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "clip-pouch";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/clip-pouch/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลกลางทุกภาพ — 1 ซม. = 28 px (ใหญ่สุด 17.5 ซม. = 490 px ยังพอดีการ์ด) */
const CM = 28;
const GROUND = 660; // เส้นโต๊ะ ก้นกระเป๋า/บัตรวางบรรทัดเดียวกัน
const POUCH_CX = 330;
const CARD_CX = 740;

/** ขนาดทั้ง 4 จาก DB (กว้าง×สูง ซม.) — key = choice.name เป๊ะ ๆ */
const SIZES = [
  { choice: "9.5x9cm", wcm: 9.5, hcm: 9, file: "size-9-5x9", use: "เหรียญ · หูฟัง · ลิปสติก" },
  { choice: "11.5x10cm", wcm: 11.5, hcm: 10, use: "หูฟัง · สายชาร์จ · ของจุกจิก", file: "size-11-5x10" },
  { choice: "14.5x10cm", wcm: 14.5, hcm: 10, use: "แบตสำรอง · เครื่องเขียน", file: "size-14-5x10" },
  { choice: "17.5x14.5cm", wcm: 17.5, hcm: 14.5, use: "มือถือ · เครื่องสำอาง", file: "size-17-5x14-5" },
];

/** ผ้ากระเป๋า — ฟ้าพาสเทลตามรูปงานจริงในแกลเลอรี */
const FABRIC = "#d7ebf9";
const FABRIC_EDGE = "#8fb8d8";
const STAR = "#b8552f";
const CLIP = "#5b6572";
const CLIP_HI = "#8b95a3";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข
 *  แนวตั้งหมุนป้าย 90° แนบเส้น (ใบใหญ่สุดชิดขอบการ์ด ป้ายแนวนอนจะตกขอบ) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const tick = (x, y) => `<line x1="${x - (vertical ? 7 : 0)}" y1="${y - (vertical ? 0 : 7)}" x2="${x + (vertical ? 7 : 0)}" y2="${y + (vertical ? 0 : 7)}" stroke="${SUB}" stroke-width="3"/>`;
  const lw = label.length * 11;
  const labelSvg = vertical
    ? `<g transform="rotate(-90 ${x1 - 14} ${(y1 + y2) / 2})">
        <rect x="${x1 - 14 - lw / 2}" y="${(y1 + y2) / 2 - 14}" width="${lw}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
        <text x="${x1 - 14}" y="${(y1 + y2) / 2 + 7}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
      </g>`
    : `<rect x="${(x1 + x2) / 2 - lw / 2}" y="${y2 + 6}" width="${lw}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
      <text x="${(x1 + x2) / 2}" y="${y2 + 27}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    ${labelSvg}`;
};

/** ป้ายไฮไลต์ใต้หัวข้อ — บอกว่าขนาดนี้เหมาะใส่อะไร */
const pill = (cx, y, text) => {
  const w = text.length * 14 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="44" rx="22" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

/** ลายเป็ดที่พิมพ์ — สเกลตามกรอบที่ให้ ไม่ล้น */
const artwork = (cx, cy, boxW, boxH) => {
  const r = MASCOT.ratio;
  let aw = boxH * r;
  let ah = boxH;
  if (aw > boxW) { aw = boxW; ah = boxW / r; }
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

/**
 * ตัวกระเป๋าต๊อบแต๊บที่สเกลจริง — ทรงแบน ปากบนเป็นแท่งโครงสปริง (บีบเปิด)
 * มีแถบโลหะเล็กโผล่หัวท้ายตามรูปงานจริง + ตะเข็บใต้ปาก + ลายดาว/เป็ดซับลิเมชั่น
 */
const pouch = (cx, groundY, wcm, hcm, clipId) => {
  const w = wcm * CM;
  const h = hcm * CM;
  const x = cx - w / 2;
  const top = groundY - h;
  const barH = Math.min(26, Math.max(18, h * 0.09));
  const bodyTop = top + barH / 2;
  // ดาวห้าแฉกเล็ก ๆ กระจายบนผ้า (ตำแหน่งคงที่สัมพัทธ์กับใบ — ใบเล็กดาวน้อยตามพื้นที่)
  const starAt = (sx, sy, r) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      return `${(sx + rr * Math.cos(a)).toFixed(1)},${(sy + rr * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="${STAR}" opacity="0.85"/>`;
  };
  const stars = [
    [0.14, 0.3, 9], [0.86, 0.24, 11], [0.2, 0.82, 12], [0.85, 0.72, 9],
    [0.08, 0.58, 7], [0.92, 0.5, 7], [0.55, 0.14, 7],
  ]
    .map(([fx, fy, r]) => starAt(x + w * fx, bodyTop + (h - barH / 2) * fy, r))
    .join("");
  const dots = [[0.3, 0.18], [0.72, 0.86], [0.05, 0.9], [0.95, 0.88], [0.42, 0.9]]
    .map(([fx, fy]) => `<circle cx="${x + w * fx}" cy="${bodyTop + (h - barH / 2) * fy}" r="5" fill="#ffffff" opacity="0.9"/>`)
    .join("");
  return `
    <clipPath id="${clipId}"><rect x="${x}" y="${bodyTop}" width="${w}" height="${groundY - bodyTop}" rx="14"/></clipPath>
    <rect x="${x}" y="${bodyTop}" width="${w}" height="${groundY - bodyTop}" rx="14" fill="${FABRIC}" stroke="${FABRIC_EDGE}" stroke-width="3.5"/>
    <g clip-path="url(#${clipId})">
      ${stars}${dots}
      ${artwork(cx, bodyTop + (groundY - bodyTop) * 0.58, w * 0.52, (groundY - bodyTop) * 0.52)}
    </g>
    <!-- ตะเข็บใต้ปากกระเป๋า -->
    <line x1="${x + 8}" y1="${top + barH + 10}" x2="${x + w - 8}" y2="${top + barH + 10}" stroke="${FABRIC_EDGE}" stroke-width="2" stroke-dasharray="5 5" opacity="0.8"/>
    <!-- โครงสปริงปากกระเป๋า + แถบโลหะหัวท้าย -->
    <rect x="${x - 9}" y="${top + barH * 0.22}" width="12" height="${barH * 0.62}" rx="4" fill="${CLIP_HI}"/>
    <rect x="${x + w - 3}" y="${top + barH * 0.22}" width="12" height="${barH * 0.62}" rx="4" fill="${CLIP_HI}"/>
    <rect x="${x}" y="${top}" width="${w}" height="${barH}" rx="${barH / 2}" fill="${CLIP}"/>
    <rect x="${x + 6}" y="${top + 3.5}" width="${w - 12}" height="${barH * 0.32}" rx="${barH * 0.16}" fill="${CLIP_HI}" opacity="0.7"/>`;
};

/** เงาขนาดอื่น — เส้นประก้นชนบรรทัดเดียวกัน ไว้เทียบว่าใบที่เลือกเล็ก/ใหญ่แค่ไหน
 *  ขนาดที่ "เล็กกว่า" ใบที่เลือกต้องวาดทับบนตัวกระเป๋า (ไม่งั้นโดนใบเต็มสีบังหมด) */
const ghost = (cx, groundY, wcm, hcm, onTop = false) => {
  const w = wcm * CM;
  const h = hcm * CM;
  return `<rect x="${cx - w / 2}" y="${groundY - h}" width="${w}" height="${h}" rx="14"
    fill="none" stroke="${onTop ? "#64809c" : "#cbd5e1"}" stroke-width="${onTop ? 2 : 2.5}" stroke-dasharray="8 7"${onTop ? ' opacity="0.38"' : ""}/>`;
};

/** บัตร ATM เทียบขนาด — 8.6 × 5.4 ซม. ที่สเกลเดียวกับกระเป๋า */
const refCard = (cx, groundY) => {
  const w = 8.6 * CM;
  const h = 5.4 * CM;
  const x = cx - w / 2;
  const y = groundY - h;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#eef2f7" stroke="#b6c2d2" stroke-width="3"/>
    <rect x="${x + 22}" y="${y + 34}" width="44" height="34" rx="7" fill="#d3a84c" stroke="#b98f35" stroke-width="2"/>
    <line x1="${x + 22}" y1="${y + h - 34}" x2="${x + w - 60}" y2="${y + h - 34}" stroke="#b6c2d2" stroke-width="7" stroke-linecap="round"/>
    <line x1="${x + 22}" y1="${y + h - 16}" x2="${x + w - 110}" y2="${y + h - 16}" stroke="#cdd7e2" stroke-width="7" stroke-linecap="round"/>
    <text x="${cx}" y="${groundY + 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">บัตร ATM 8.6 × 5.4 ซม.</text>`;
};

// ── ภาพต่อขนาด — ใบที่เลือกเต็มสี + เงาอีก 3 ขนาด + บัตรเทียบ ────────
function sizeArt(sel) {
  const w = sel.wcm * CM;
  const h = sel.hcm * CM;
  const left = POUCH_CX - w / 2;
  const others = SIZES.filter((s) => s.choice !== sel.choice);
  const bigger = (s) => s.wcm * s.hcm > sel.wcm * sel.hcm;
  const ghostsBehind = others.filter(bigger).map((s) => ghost(POUCH_CX, GROUND, s.wcm, s.hcm)).join("");
  const ghostsFront = others.filter((s) => !bigger(s)).map((s) => ghost(POUCH_CX, GROUND, s.wcm, s.hcm, true)).join("");
  const body = `
    ${title(`ขนาด ${sel.wcm} × ${sel.hcm} ซม.`, "ทุกอย่างในภาพย่อด้วยสเกลเดียวกัน — เส้นประคือขนาดอื่นอีก 3 ขนาด")}
    ${pill(W / 2, 146, `ขนาดนี้เหมาะใส่ ${sel.use}`)}
    ${ghostsBehind}
    ${pouch(POUCH_CX, GROUND, sel.wcm, sel.hcm, `pc-${sel.file}`)}
    ${ghostsFront}
    ${dim(left, GROUND + 24, left + w, GROUND + 24, `${sel.wcm} ซม.`)}
    ${dim(left - 30, GROUND - h, left - 30, GROUND, `${sel.hcm} ซม.`)}
    ${refCard(CARD_CX, GROUND)}
    ${foot(["ปากกระเป๋าโครงสปริง บีบข้างเดียวก็เปิด ไม่ต้องรูดซิป", "พิมพ์ลายตามสั่งระบบซับลิเมชั่น · วัดกว้าง × สูงตัวกระเป๋า"])}`;
  return frame(body);
}

// ── วาด + เซฟไฟล์ ────────────────────────────────────────────────────
const files = [];
for (const s of SIZES) {
  const buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${s.file}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...s, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${s.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc ───────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const grp = (data.options ?? []).find((o) => o.label === "ขนาด");
if (!grp) { console.error('ไม่เจอกลุ่ม "ขนาด"'); process.exit(1); }
for (const f of files) {
  const c = grp.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "ขนาด"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === "ขนาด")?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);

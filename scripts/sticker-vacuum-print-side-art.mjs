#!/usr/bin/env node
/**
 * สติ๊กเกอร์สูญญากาศ (sticker-vacuum) — ภาพตัวอย่างกลุ่ม "พิมพ์ลาย"
 *
 *   node scripts/sticker-vacuum-print-side-art.mjs           (วาดลง .cache/sticker-vacuum/upload ดูก่อน)
 *   node scripts/sticker-vacuum-print-side-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc/desc + อ่านกลับเทียบ)
 *
 * ตัวเลือกใน DB (ห้ามแก้ชื่อ — ตะกร้า/ออเดอร์เก่าอ้างชื่อนี้):
 *   "ด้านใต้ (ลายหันเข้าหากระจก)"   ฿0
 *   "ด้านบน (ลายหันออกจากกระจก)"   ฿0
 * กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels = ["ขนาด","พิมพ์กี่ด้าน"]) — สคริปต์แตะแค่ imageSrc/desc
 *
 * ประวัติดีไซน์: v1 ภาพตัดขวางล้วน → v2 ฉากนั่งในรถ (ผู้ใช้สั่ง) → **v3 ผู้ใช้สั่ง "ให้เข้าใจง่ายกว่านี้"**
 * v3 = 2 ช่องเทียบกันตรง ๆ ช่องละคำตอบเดียว ไม่มีภาพตัดขวาง/ป้ายซ้อนให้อ่านหลายชั้น
 *   ซ้าย "มองจากในรถ" · ขวา "มองจากนอกรถ" — กรอบกระจกขนาดเท่ากันทั้งสองช่อง ต่างกันแค่ฉากรอบ ๆ
 *   (ในรถ = หลังคา/เสา/แผงประตู/คนนั่ง · นอกรถ = ตัวถังรถ/กระจกมองข้าง/ล้อ/ถนน/คนยืนดู)
 *   สติ๊กเกอร์ในกรอบเป็นลายถูกด้าน/กลับด้านจริงตามตัวเลือก + ป้ายสรุปใต้ภาพ (ช่องที่ถูกด้านมี ✓ และกรอบฟ้า)
 * ตรรกะ (แปะสติ๊กเกอร์จากในรถ ตามคำอธิบายสินค้า):
 *   ด้านใต้ = หมึกแนบกระจก → ในรถเห็นกลับด้าน · นอกรถเห็นถูกด้าน
 *   ด้านบน = หมึกหันเข้าห้องโดยสาร → ในรถเห็นถูกด้าน · นอกรถเห็นกลับด้าน
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "sticker-vacuum";
const VER = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "พิมพ์ลาย";
const UNDER = "ด้านใต้ (ลายหันเข้าหากระจก)";
const TOP = "ด้านบน (ลายหันออกจากกระจก)";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const ACC = "#0ea5e9";
const DEEP = "#0369a1";

// ── ชิ้นส่วนภาพ ──────────────────────────────────────────────────────
const card = (title, subtitle, body, note1, note2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9eefb"/>
      <stop offset="1" stop-color="#f4fbff"/>
    </linearGradient>
    <linearGradient id="door" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dfe7ee"/>
      <stop offset="1" stop-color="#c5d1dc"/>
    </linearGradient>
    <linearGradient id="cabin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#93a6b8"/>
      <stop offset="1" stop-color="#6d8194"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d3e3f1"/>
      <stop offset="1" stop-color="#b3cadf"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="130" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note1}</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">${note2}</text>
</svg>`;

/** ลายตัวอย่าง (เส้นโค้ง + คำว่า ลาย + จุด) — mirror = มองจากอีกผิวของแผ่น */
const logo = (cx, cy, r, mirror) => {
  const k = r / 70;
  const inner = `
    <path d="M ${cx - 42 * k} ${cy + 2 * k} Q ${cx} ${cy - 46 * k} ${cx + 42 * k} ${cy + 2 * k}" fill="none"
      stroke="#38bdf8" stroke-width="${13 * k}" stroke-linecap="round"/>
    <text x="${cx}" y="${cy + 34 * k}" font-family="${TH}" font-size="${34 * k}" font-weight="700" text-anchor="middle" fill="${INK}">ลาย</text>
    <circle cx="${cx - 30 * k}" cy="${cy + 50 * k}" r="${7 * k}" fill="#fbbf24"/>
    <circle cx="${cx + 28 * k}" cy="${cy + 50 * k}" r="${7 * k}" fill="#f472b6"/>`;
  return mirror ? `<g transform="translate(${cx * 2} 0) scale(-1 1)">${inner}</g>` : inner;
};

/** สติ๊กเกอร์เนื้อใสแปะบนกระจก (สี่เหลี่ยมมุมมน) */
const sticker = (cx, cy, size, mirror) => `
  <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="${size * 0.14}" fill="#ffffff" opacity="0.5"/>
  <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="${size * 0.14}" fill="none" stroke="#ffffff" stroke-width="4"/>
  <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="${size * 0.14}" fill="none" stroke="#8ea6ba" stroke-width="1.6"/>
  <circle cx="${cx}" cy="${cy}" r="${size * 0.39}" fill="#e0f2fe" opacity="0.95"/>
  ${logo(cx, cy, size * 0.39, mirror)}`;

/** วิวนอกกระจก (ท้องฟ้า ต้นไม้ ถนน) — กรอบเดียวกันทั้งสองช่อง */
const outside = (x, y, w, h, id) => `
  <clipPath id="w${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath>
  <g clip-path="url(#w${id})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/>
    <ellipse cx="${x + w * 0.28}" cy="${y + h * 0.24}" rx="${w * 0.13}" ry="${h * 0.07}" fill="#ffffff" opacity="0.9"/>
    <ellipse cx="${x + w * 0.36}" cy="${y + h * 0.2}" rx="${w * 0.09}" ry="${h * 0.08}" fill="#ffffff" opacity="0.9"/>
    <rect x="${x}" y="${y + h * 0.62}" width="${w}" height="${h * 0.16}" fill="#b9dcc4" opacity="0.8"/>
    <rect x="${x + w * 0.12}" y="${y + h * 0.5}" width="7" height="${h * 0.2}" fill="#a8977f"/>
    <circle cx="${x + w * 0.135}" cy="${y + h * 0.47}" r="${w * 0.075}" fill="#8fc6a4"/>
    <rect x="${x + w * 0.85}" y="${y + h * 0.52}" width="6" height="${h * 0.18}" fill="#a8977f"/>
    <circle cx="${x + w * 0.86}" cy="${y + h * 0.5}" r="${w * 0.055}" fill="#9dd0b1"/>
    <rect x="${x}" y="${y + h * 0.78}" width="${w}" height="${h * 0.22}" fill="#dde4e9"/>
    <path d="M ${x} ${y + h * 0.89} L ${x + w} ${y + h * 0.885}" stroke="#ffffff" stroke-width="7" stroke-dasharray="30 26"/>
  </g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="#8fa4b8" stroke-width="5"/>`;

/** วิวในกระจกของช่อง "มองจากนอกรถ" — มองเข้าไปเจอห้องโดยสาร (เบาะ/พนักพิงหัว) */
const cabin = (x, y, w, h, id) => `
  <clipPath id="w${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath>
  <g clip-path="url(#w${id})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#cabin)"/>
    <rect x="${x + w * 0.58}" y="${y + h * 0.2}" width="${w * 0.3}" height="${h * 0.26}" rx="${w * 0.07}" fill="#5c6f81"/>
    <path d="M ${x + w * 0.55} ${y + h} L ${x + w * 0.56} ${y + h * 0.5} Q ${x + w * 0.73} ${y + h * 0.42} ${x + w * 0.9} ${y + h * 0.5} L ${x + w * 0.92} ${y + h} Z" fill="#5c6f81"/>
    <path d="M ${x} ${y + h * 0.78} L ${x + w * 0.5} ${y + h * 0.72} L ${x + w * 0.5} ${y + h} L ${x} ${y + h} Z" fill="#7e91a3"/>
    <path d="M ${x + w * 0.06} ${y + h} L ${x + w * 0.42} ${y} L ${x + w * 0.56} ${y} L ${x + w * 0.2} ${y + h} Z" fill="#ffffff" opacity="0.18"/>
  </g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="#8fa4b8" stroke-width="5"/>`;

/**
 * 1 ช่องเปรียบเทียบ — กรอบกระจกขนาดเท่ากันทั้งสองช่อง ต่างกันที่ฉากรอบ ๆ
 *   inside = true  → ฉากในรถ · inside = false → ฉากนอกรถ
 */
function panel({ x, inside, ok, mirror, head, verdict, hint }) {
  const PY = 165, PW = 385, PH = 535;
  const ix = x + 18, iy = 237, iw = PW - 36, ih = 290;            // กรอบภาพ
  const wx = ix + 42, wy = iy + 42, ww = iw - 84, wh = ih - 104;  // กระจก (เท่ากันทั้งสองช่อง)
  const id = inside ? "in" : "out";
  const scene = inside
    ? `
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="12" fill="#e7ecf1"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="26" fill="#d8e0e8"/>
    <rect x="${ix}" y="${iy}" width="26" height="${ih}" fill="#ccd6e0"/>
    <path d="M ${ix} ${iy + ih - 52} L ${ix + iw} ${iy + ih - 56} L ${ix + iw} ${iy + ih} L ${ix} ${iy + ih} Z" fill="url(#door)"/>
    <rect x="${ix + 40}" y="${iy + ih - 36}" width="72" height="20" rx="10" fill="#b9c6d2"/>
    <g fill="#93a3b3">
      <path d="M ${ix + iw - 108} ${iy + ih} Q ${ix + iw - 100} ${iy + ih - 46} ${ix + iw - 52} ${iy + ih - 56}
               Q ${ix + iw - 4} ${iy + ih - 46} ${ix + iw + 4} ${iy + ih} Z"/>
      <circle cx="${ix + iw - 52}" cy="${iy + ih - 80}" r="27"/>
    </g>`
    : `
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="12" fill="#eaf6fe"/>
    <rect x="${ix}" y="${iy + ih - 44}" width="${iw}" height="44" fill="#dfe5e9"/>
    <path d="M ${ix + 8} ${iy + 26} Q ${ix + iw / 2} ${iy + 8} ${ix + iw - 8} ${iy + 26}
             L ${ix + iw - 8} ${iy + ih - 40} L ${ix + 8} ${iy + ih - 40} Z" fill="url(#body)" stroke="#9fb8cd" stroke-width="3"/>
    <rect x="${ix - 6}" y="${iy + 92}" width="28" height="46" rx="11" fill="#b3cadf" stroke="#9fb8cd" stroke-width="3"/>
    <circle cx="${ix + 84}" cy="${iy + ih - 40}" r="27" fill="#8f9aa6"/>
    <circle cx="${ix + 84}" cy="${iy + ih - 40}" r="11" fill="#c9d2da"/>
    <g fill="#93a3b3">
      <path d="M ${ix + iw - 74} ${iy + ih} Q ${ix + iw - 70} ${iy + ih - 44} ${ix + iw - 40} ${iy + ih - 52}
               Q ${ix + iw - 10} ${iy + ih - 44} ${ix + iw - 6} ${iy + ih} Z"/>
      <circle cx="${ix + iw - 40}" cy="${iy + ih - 72}" r="20"/>
    </g>`;
  const vw = verdict.length * 15.5 + (ok ? 78 : 52);
  return `
  <rect x="${x}" y="${PY}" width="${PW}" height="${PH}" rx="26" fill="#ffffff" stroke="${ok ? ACC : "#e2e8f0"}" stroke-width="${ok ? 3.5 : 2.5}"/>
  <path d="M ${x} ${PY + 26} Q ${x} ${PY} ${x + 26} ${PY} L ${x + PW - 26} ${PY} Q ${x + PW} ${PY} ${x + PW} ${PY + 26} L ${x + PW} ${PY + 60} L ${x} ${PY + 60} Z"
    fill="${ok ? "#e0f2fe" : "#f1f5f9"}"/>
  <text x="${x + PW / 2}" y="${PY + 42}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${ok ? DEEP : "#475569"}">${head}</text>
  ${scene}
  ${inside ? outside(wx, wy, ww, wh, id) : cabin(wx, wy, ww, wh, id)}
  ${sticker(wx + ww / 2, wy + wh / 2, 152, mirror)}
  <rect x="${x + PW / 2 - vw / 2}" y="546" width="${vw}" height="58" rx="29"
    fill="${ok ? "#e0f2fe" : "#f1f5f9"}" stroke="${ok ? ACC : "#cbd5e1"}" stroke-width="3"/>
  <text x="${x + PW / 2}" y="585" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle"
    fill="${ok ? DEEP : SUB}">${ok ? "✓ " : ""}${verdict}</text>
  <text x="${x + PW / 2}" y="638" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">${hint}</text>`;
}

/** การ์ด 1 ใบต่อ 1 ตัวเลือก */
function sideArt(under) {
  const body = `
  ${panel({
    x: 55, inside: true, ok: !under, mirror: under,
    head: "มองจากในรถ",
    verdict: under ? "เห็นลายกลับด้าน" : "เห็นลายถูกด้าน",
    hint: under ? "มองผ่านเนื้อแผ่นไปเจอหลังลาย" : "เจอผิวที่พิมพ์ตรง ๆ",
  })}
  ${panel({
    x: 460, inside: false, ok: under, mirror: !under,
    head: "มองจากนอกรถ",
    verdict: under ? "เห็นลายถูกด้าน" : "เห็นลายกลับด้าน",
    hint: under ? "มองทะลุกระจกไปเจอผิวที่พิมพ์" : "มองผ่านกระจกไปเจอหลังลาย",
  })}
  <rect x="55" y="726" width="790" height="66" rx="33" fill="#f0f9ff" stroke="#bae6fd" stroke-width="2.5"/>
  <text x="450" y="768" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${DEEP}">${
    under ? "เลือกแบบนี้ ถ้าอยากให้คนนอกรถอ่านลายออก" : "เลือกแบบนี้ ถ้าอยากให้คนในรถเห็นลายชัด"
  }</text>`;

  return under
    ? card("พิมพ์ลายด้านใต้", "ลายหันเข้าหากระจก (แปะกระจกจากในรถ)", body,
      "หมึกมีเนื้อสติ๊กเกอร์คลุมไว้ ไม่โดนขูด",
      "ใช้กับงานพิมพ์ 1 ด้าน (พิมพ์ 2 ด้านมีลายทั้งสองผิวอยู่แล้ว) · ภาพวาดจำลอง")
    : card("พิมพ์ลายด้านบน", "ลายหันออกจากกระจก (แปะกระจกจากในรถ)", body,
      "หมึกอยู่ผิวนอก เลี่ยงการขูดหรือเช็ดแรง",
      "ใช้กับงานพิมพ์ 1 ด้าน (พิมพ์ 2 ด้านมีลายทั้งสองผิวอยู่แล้ว) · ภาพวาดจำลอง");
}

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const JOBS = [
  {
    file: `print-side-under-${VER}.jpg`, svg: sideArt(true), choice: UNDER,
    desc: "หมึกอยู่ผิวที่แนบกระจก — คนนอกรถมองเข้ามาเห็นลายถูกด้าน (คนในรถเห็นกลับด้าน) หมึกมีเนื้อสติ๊กเกอร์คลุมไว้",
  },
  {
    file: `print-side-top-${VER}.jpg`, svg: sideArt(false), choice: TOP,
    desc: "หมึกอยู่ผิวที่หันเข้าห้องโดยสาร — คนในรถเห็นลายถูกด้าน (คนนอกรถมองเข้ามาเห็นกลับด้าน)",
  },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ย่อ 28px เท่าภาพบนปุ่มตัวเลือกจริง — ตรวจว่ายังพอบอกความต่างได้
  await sharp(j.buf).resize(28, 28).png().toFile(`${OUT}/_pill-${j.file}.png`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

// อ่าน DB สดก่อนเขียนเสมอ (อาจมีคนแก้สินค้าตัวเดียวกันอยู่)
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const group = (data.options ?? []).find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc/desc — ชื่อ/ค่าอื่นคงเดิม (กลุ่มยังเป็นปุ่ม pill เหมือนกลุ่มอื่นของสินค้านี้)
  c.desc = j.desc;
}

data.savedAt = new Date().toISOString(); // กันแคชรูปเดิม ([[iducky-image-cache-bust]])
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]])
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
const fails = [
  [bg?.choices?.length === 2, "จำนวนตัวเลือกเปลี่ยน"],
  ...JOBS.map((j) => {
    const c = bg?.choices?.find((c) => c.name === j.choice);
    return [c?.imageSrc === j.url && c?.desc === j.desc, `ตัวเลือก "${j.choice}" ไม่ตรง (ภาพ/คำอธิบาย)`];
  }),
  [bg?.choices?.every((c) => !(c.extra ?? 0)), "มีค่าเพิ่มโผล่มาในกลุ่มนี้"],
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "กลุ่มไปชนแกนตารางราคา"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "กลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 10.5 && back.data.priceMax === 57, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [(back.data.images ?? []).length === 5, "แกลเลอรีเปลี่ยนจำนวน"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`✓ imageSrc+desc ${JOBS.length} ตัวเลือกกลุ่ม "${GROUP}" อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

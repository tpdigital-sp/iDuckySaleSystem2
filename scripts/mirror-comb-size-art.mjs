#!/usr/bin/env node
/**
 * Mirror Comb Set (mirror-comb-set) — เพิ่มกลุ่ม "ขนาด" แบบการ์ด + ภาพประกอบทุกกลุ่มตัวเลือก
 * + เปลี่ยนชื่อตัวเลือก "สกรีนกี่ด้าน": 1 ด้าน → สกรีน 1 ด้าน · 2 ด้าน → สกรีน 2 ด้าน
 *
 *   node scripts/mirror-comb-size-art.mjs            (วาดภาพลง .cache/mirror-comb/upload ดูก่อน)
 *   node scripts/mirror-comb-size-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตาม terms ของสินค้า: เซ็ตหวี+กระจกพกพา ขนาด 10.5×7.2 ซม. ขนาดเดียว
 * (ของจริงในรูป: เคสกระจกพับสีครีม ฝาหน้าสกรีนลายเต็มแผ่น + หวี 2 ด้านเสียบเก็บกับตัวเคส)
 *
 * ทำ 3 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" (display cards) ไว้บนสุด — ตัวเลือกเดียว "10.5×7.2 ซม." ไม่บวกราคา + ภาพวาดลูกศรวัด
 *   2. กลุ่ม "สกรีนกี่ด้าน": เปลี่ยนชื่อตัวเลือกเป็น "สกรีน 1 ด้าน"/"สกรีน 2 ด้าน" (desc/extra เดิมคงอยู่) + ภาพ
 *   3. กลุ่ม "Add on" (สกรีนบนหวี): เติมภาพ 3 ตัวเลือก ไม่สกรีน / 1 ด้าน / 2 ด้าน
 *
 * รันซ้ำได้: กลุ่ม "ขนาด" เจอแล้วเขียนทับ · ชื่อใหม่เจอแล้วไม่เปลี่ยนซ้ำ (หาได้ทั้งชื่อเก่า-ใหม่)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);

const PRODUCT_ID = "mirror-comb-set";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mirror-comb/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "10.5×7.2 ซม.";
const SCREEN_GROUP = "สกรีนกี่ด้าน";
const ADDON_GROUP = "Add on";
/** ชื่อเก่า → ชื่อใหม่ ในกลุ่มสกรีนกี่ด้าน */
const SCREEN_RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** สีตัวเคส/หวีตามของจริง — พลาสติกครีมงาช้าง */
const CREAM = "#f6f1e0";
const CREAM_EDGE = "#d9cfae";
const CREAM_DK = "#e9e1c8";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ lighter-size-option-art) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ ใช้ร่วมทุกภาพ */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/**
 * ตัวเคสกระจกพับ มองด้านฝา — สี่เหลี่ยมมุมโค้งแนวตั้ง 7.2×10.5 ซม. สีครีม
 * mascot = ลายสกรีนเต็มฝา (null = ฝาเปล่าไม่พิมพ์)
 */
function mirrorCase(cx, topY, CM, mascot = null, id = "g") {
  const w = 7.2 * CM;
  const h = 10.5 * CM;
  const bx = cx - w / 2;
  const r = 0.9 * CM;
  // ลายสกรีนกินเกือบเต็มฝา (คลิปตามมุมโค้งเคส)
  let art = "";
  if (mascot) {
    let ah = h - 1.6 * CM;
    let aw = ah * mascot.ratio;
    if (aw > w - 1.2 * CM) { aw = w - 1.2 * CM; ah = aw / mascot.ratio; }
    art = `
    <clipPath id="clip-${id}"><rect x="${bx + 8}" y="${topY + 8}" width="${w - 16}" height="${h - 16}" rx="${r - 6}"/></clipPath>
    <g clip-path="url(#clip-${id})">
      <image href="${mascot.uri}" x="${cx - aw / 2}" y="${topY + (h - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    </g>`;
  }
  return `
  <rect x="${bx}" y="${topY}" width="${w}" height="${h}" rx="${r}" fill="${CREAM}" stroke="${CREAM_EDGE}" stroke-width="3.5"/>
  <rect x="${bx + 7}" y="${topY + 7}" width="${w - 14}" height="${h - 14}" rx="${r - 6}" fill="none" stroke="${CREAM_DK}" stroke-width="2"/>
  ${art}
  <!-- เงาบานพับด้านบนของฝา -->
  <line x1="${bx + r}" y1="${topY + 4}" x2="${bx + w - r}" y2="${topY + 4}" stroke="#ffffff" stroke-width="2.5" opacity="0.7"/>`;
}

/**
 * หวี 2 ด้านตามของจริง — แถบทึบกลาง + ซี่หยาบด้านบน + ซี่ถี่ด้านล่าง สีครีม
 * mascot = ลายสกรีนบนแถบกลาง (null = ไม่พิมพ์)
 */
function comb(cx, topY, CM, mascot = null, id = "cb") {
  const w = 6.2 * CM;
  const hTeethTop = 2.6 * CM;
  const hBand = 2.3 * CM;
  const hTeethBot = 2.6 * CM;
  const bx = cx - w / 2;
  const bandY = topY + hTeethTop;
  const teeth = (n, y, hh, up) => {
    const gap = w / n;
    let out = "";
    for (let i = 0; i < n; i++) {
      const tx = bx + i * gap + gap * 0.18;
      out += `<rect x="${tx}" y="${y}" width="${gap * 0.62}" height="${hh}" rx="${gap * 0.28}" fill="${CREAM}" stroke="${CREAM_EDGE}" stroke-width="2"/>`;
    }
    return out;
  };
  let art = "";
  if (mascot) {
    let ah = hBand - 0.35 * CM;
    let aw = ah * mascot.ratio;
    art = `<image href="${mascot.uri}" x="${cx - aw / 2}" y="${bandY + (hBand - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `
  ${teeth(9, topY, hTeethTop + 8, true)}
  ${teeth(16, bandY + hBand - 8, hTeethBot + 8, false)}
  <rect x="${bx - 0.15 * CM}" y="${bandY}" width="${w + 0.3 * CM}" height="${hBand}" rx="${0.5 * CM}" fill="${CREAM}" stroke="${CREAM_EDGE}" stroke-width="3"/>
  <rect x="${bx - 0.15 * CM}" y="${bandY}" width="${w + 0.3 * CM}" height="${hBand * 0.4}" rx="${0.5 * CM}" fill="#ffffff" opacity="0.25"/>
  ${art}`;
}

/** ป้ายชื่อใต้ชิ้นงาน (ด้านหน้า/ด้านหลัง) */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

// ── 1. ภาพกลุ่ม "ขนาด" — 10.5×7.2 ซม. ────────────────────────────────
function sizeArt() {
  const CM = 46;
  const cx = 355;
  const topY = 190;
  const w = 7.2 * CM;
  const h = 10.5 * CM;
  const body = `
  ${comb(cx + w / 2 + 118, topY + 1.6 * CM, CM * 0.82, null, "szc")}
  ${mirrorCase(cx, topY, CM, HEART, "szm")}
  ${dim(cx - w / 2 - 46, topY, cx - w / 2 - 46, topY + h, "10.5 ซม.")}
  ${dim(cx - w / 2, topY + h + 36, cx + w / 2, topY + h + 36, "7.2 ซม.")}`;
  return card("ขนาด 10.5 × 7.2 ซม.", "เซ็ตหวี + กระจกพกพา — ขนาดเดียว", body,
    "ได้ทั้งกระจกพับและหวี 2 ด้านในชิ้นเดียว พกใส่กระเป๋าสะดวก",
    "พิมพ์ลายตามสั่งระบบ UV · สกรีนฝากระจกได้ 1-2 ด้าน");
}

// ── 2. ภาพสกรีน 1 ด้าน / 2 ด้าน (ฝากระจก) ───────────────────────────
function screenArt(sides) {
  const CM = 38;
  const topY = 210;
  const h = 10.5 * CM;
  const lx = W / 2 - 170;
  const rx = W / 2 + 170;
  const one = sides === 1;
  const body = `
  ${mirrorCase(lx, topY, CM, HEART, "sa")}
  ${mirrorCase(rx, topY, CM, one ? null : PEACE, "sb")}
  ${tag(lx, topY + h + 26, "ด้านหน้า — มีลาย")}
  ${tag(rx, topY + h + 26, one ? "ด้านหลัง — ไม่พิมพ์" : "ด้านหลัง — มีลาย", !one)}`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายฝากระจกด้านเดียว", body, "อีกด้านเป็นสีครีมล้วน ไม่มีลาย")
    : card("สกรีน 2 ด้าน", "พิมพ์ลายฝากระจกทั้งสองด้าน", body, "หน้า-หลังคนละลายได้");
}

// ── 3. ภาพ Add on — สกรีนบนหวี ───────────────────────────────────────
function combArt(kind) {
  const CM = 46;
  const topY = 250;
  const hTotal = 7.5 * CM;
  if (kind === "none") {
    const body = `
    ${comb(W / 2, topY, CM, null, "cn")}
    ${tag(W / 2, topY + hTotal + 30, "หวีสีครีมล้วน — ไม่พิมพ์ลาย", false)}`;
    return card("ไม่สกรีนบนหวี", "พิมพ์ลายเฉพาะตัวกระจก", body, "หวี 2 ด้านสีครีม ไม่มีลาย ไม่บวกราคา");
  }
  const one = kind === "1side";
  const lx = W / 2 - 190;
  const rx = W / 2 + 190;
  const body = `
  ${comb(lx, topY, CM * 0.86, HEART, "ca")}
  ${comb(rx, topY, CM * 0.86, one ? null : PEACE, "cb2")}
  ${tag(lx, topY + hTotal * 0.86 + 30, "ด้านหน้า — มีลาย")}
  ${tag(rx, topY + hTotal * 0.86 + 30, one ? "ด้านหลัง — ไม่พิมพ์" : "ด้านหลัง — มีลาย", !one)}`;
  return one
    ? card("สกรีนบนหวี 1 ด้าน", "พิมพ์ลายบนแถบหวีด้านเดียว (+10.-)", body, "อีกด้านเป็นสีครีมล้วน ไม่มีลาย")
    : card("สกรีนบนหวี 2 ด้าน", "พิมพ์ลายบนแถบหวีทั้งสองด้าน (+20.-)", body, "หน้า-หลังคนละลายได้");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
/** ชื่อไฟล์ → svg + ปลายทาง (group/choice ชื่อสุดท้ายหลัง rename) */
const JOBS = [
  { file: `size-10-5x7-2-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: SIZE_CHOICE },
  { file: `screen-1side-${VER}.jpg`, svg: screenArt(1), group: SCREEN_GROUP, choice: "สกรีน 1 ด้าน" },
  { file: `screen-2side-${VER}.jpg`, svg: screenArt(2), group: SCREEN_GROUP, choice: "สกรีน 2 ด้าน" },
  { file: `comb-none-${VER}.jpg`, svg: combArt("none"), group: ADDON_GROUP, choice: "ไม่สกรีนบนหวี" },
  { file: `comb-1side-${VER}.jpg`, svg: combArt("1side"), group: ADDON_GROUP, choice: "สกรีนบนหวี 1 ด้าน" },
  { file: `comb-2side-${VER}.jpg`, svg: combArt("2side"), group: ADDON_GROUP, choice: "สกรีนบนหวี 2 ด้าน" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
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

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));
const options = data.options ?? [];

// 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้บนสุด (หน้ากลุ่มสกรีนกี่ด้าน)
const sizeJob = JOBS.find((j) => j.group === SIZE_GROUP);
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: "เซ็ตหวี + กระจกพกพา ขนาดเดียว", imageSrc: sizeJob.url }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atScreen = options.findIndex((o) => o.label === SCREEN_GROUP);
  options.splice(atScreen < 0 ? 0 : atScreen, 0, sizeGroup);
}

// 2. กลุ่ม "สกรีนกี่ด้าน" — เปลี่ยนชื่อ 1 ด้าน/2 ด้าน → สกรีน 1 ด้าน/สกรีน 2 ด้าน (desc/extra คงเดิม)
const screenGroup = options.find((o) => o.label === SCREEN_GROUP);
if (!screenGroup) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
for (const [oldName, newName] of Object.entries(SCREEN_RENAME)) {
  const c = screenGroup.choices.find((c) => c.name === newName) || screenGroup.choices.find((c) => c.name === oldName);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SCREEN_GROUP}: ${oldName}"`); process.exit(1); }
  c.name = newName;
}

// 2-3. เติม imageSrc ให้ตัวเลือกเดิม (desc/extra ของเดิมอยู่ครบ)
for (const j of JOBS.filter((j) => j.group !== SIZE_GROUP)) {
  const g = options.find((o) => o.label === j.group);
  const c = g?.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const got = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, got); process.exit(1); }
}
const backScreen = back.data.options.find((o) => o.label === SCREEN_GROUP);
if (backScreen.choices.some((c) => SCREEN_RENAME[c.name])) { console.error("ชื่อเก่ายังอยู่!", backScreen.choices.map((c) => c.name)); process.exit(1); }
if (backScreen.choices.find((c) => c.name === "สกรีน 2 ด้าน")?.extra !== 10) { console.error("extra สกรีน 2 ด้าน หาย!"); process.exit(1); }
const backAddon = back.data.options.find((o) => o.label === ADDON_GROUP);
if (backAddon.choices.find((c) => c.name === "สกรีนบนหวี 1 ด้าน")?.extra !== 10 ||
    backAddon.choices.find((c) => c.name === "สกรีนบนหวี 2 ด้าน")?.extra !== 20) { console.error("extra สกรีนบนหวี หาย!"); process.exit(1); }
const backSize = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backSize?.display !== "cards" || back.data.options[0]?.label !== SIZE_GROUP) { console.error("กลุ่มขนาดไม่อยู่บนสุด/ไม่ใช่ cards!"); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards) + rename สกรีน 1/2 ด้าน + ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);

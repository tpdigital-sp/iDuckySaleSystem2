#!/usr/bin/env node
/**
 * กระเป๋าใส่พวงกุญแจ งานปัก / KEY COVER (otherbag-9) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด 3 ใบ + ภาพวาด
 *
 *   node scripts/keycover-size-option.mjs           (วาดภาพลง .cache/otherbag-9/upload ดูก่อน)
 *   node scripts/keycover-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: กลุ่ม "ขนาด 4x4 นิ้ว เพิ่มขนาด" เป็นช่องติ๊ก multi ตัวเดียว
 *   { qty:true, name:"นิ้วละ", extra:20, qtyMax:2 }  → ลูกค้าต้องติ๊กเองแล้วเลือกจำนวนนิ้ว
 * ของใหม่: กลุ่ม "ขนาด" การ์ด 3 ใบ (เลือกอย่างเดียว) ยอดเท่ากันเป๊ะ — 4×4 ฿0 · 5×5 +฿20 · 6×6 +฿40
 *   ข้อดี: มีค่าตั้งต้นเสมอ ไม่มีเคส "อยากได้ใหญ่ขึ้นแต่ลืมติ๊ก" และเห็นขนาดจริงเทียบกันเป็นภาพ
 *
 * ⚠️ ตีความเอง 1 จุด รอร้านยืนยัน: ใบสเปคเขียนแค่ "เพิ่มขนาด นิ้วละ 20 (สูงสุด 2 นิ้ว)"
 *    สคริปต์นี้อ่านว่า **ขยายทั้งสองด้านพร้อมกัน** (4×4 → 5×5 → 6×6) ตามที่สินค้าเป็นทรงจัตุรัส
 *    ถ้าร้านหมายถึงเพิ่มด้านเดียว ต้องแก้ชื่อการ์ด/ภาพใหม่ (ยอดเงินเท่าเดิม)
 *
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = ["ขนาด 4x4นิ้ว เพิ่มขนาด"]
 *   (ชื่อไม่ตรงกับกลุ่มไหนเลย คีย์จึงเป็น "" ตรงกับ cells[""] อยู่แล้ว) จงใจไม่ตั้งชื่อกลุ่มใหม่ให้ไปตรงกับ
 *   driverLabels เพราะจะทำให้หาช่องราคาไม่เจอแล้วราคาหล่นไป product.price เงียบ ๆ
 *   ค่า extra ของการ์ดบวกผ่าน groupAddOf ตามปกติ (บวกต่อใบ ทุกช่วงราคา)
 *
 * ภาพ 900×900 สามใบวาดด้วย "สเกลเดียวกัน" (62 px = 1 นิ้ว) และมี **กุญแจขนาดคงที่** ทุกใบไว้เทียบสัดส่วน
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300-600) — ป้ายขนาดตัวใหญ่จึงวางคาบกลางภาพไว้ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด"/กลุ่มเก่าอยู่แล้ว = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "otherbag-9";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const OLD_GROUP = "ขนาด 4x4 นิ้ว เพิ่มขนาด"; // กลุ่มเดิมที่ถูกแทนที่
const RATE = 20; // บาทต่อนิ้วที่เพิ่ม (ต่อใบ)

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", AMBER = "#b45309";
const PX_PER_INCH = 62; // สเกลเดียวกันทั้ง 3 ใบ — ใบใหญ่ต้องดูใหญ่จริง

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14.5 + 56;
  const c = tone === "warn" ? AMBER : tone === "mute" ? SUB : OK;
  const bg = tone === "warn" ? "#fffbeb" : tone === "mute" ? "#f8fafc" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 32 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

// ── ตัวสินค้า: ปลอกกุญแจหนัง PU ไดคัททรงหัวเป็ด ปักโบว์/ตา/ปาก ─────────
// วาดในสเปซ -100..100 (= กรอบขนาดจริงของชิ้นหนัง) แล้ว scale ตามขนาดนิ้ว
const LEATHER = "#efd97a", LEATHER_DK = "#e2c85c", STITCH = "#7a2e2e";
const PINK = "#ff5fa2", PINK_DK = "#e33f88", BEAK = "#ef9d21", EYE = "#5b1a1a";

/** ปลอกกุญแจ 1 ชิ้น — cx,cy = กลางชิ้นหนัง · size = ความกว้าง/สูงเป็น px */
const keyCover = (cx, cy, size) => {
  const s = size / 200; // สเปซภายใน 200 หน่วย
  return `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <!-- เงาใต้ชิ้นงาน -->
    <ellipse cx="4" cy="104" rx="80" ry="12" fill="#0f172a" opacity="0.10"/>
    <!-- เชือกยางยืด + ตัวล็อกพลาสติก (โผล่พ้นชิ้นหนังด้านบน ไม่นับในขนาด)
         ⚠️ สูงไม่เกิน -118 หน่วย ไม่งั้นใบ 6 นิ้วจะชนหัวเรื่องการ์ด -->
    <path d="M -16 -70 C -32 -96 -22 -118 2 -118 C 24 -118 34 -100 26 -82 C 24 -78 23 -74 22 -70"
      fill="none" stroke="#e7e2d6" stroke-width="9" stroke-linecap="round"/>
    <path d="M -16 -70 C -32 -96 -22 -118 2 -118 C 24 -118 34 -100 26 -82 C 24 -78 23 -74 22 -70"
      fill="none" stroke="#c9c2b2" stroke-width="2.5" stroke-dasharray="5 7" stroke-linecap="round"/>
    <rect x="-9" y="-134" width="30" height="21" rx="8" transform="rotate(12 6 -123)" fill="#f1eee6" stroke="#cfc9bb" stroke-width="2.5"/>
    <!-- ชิ้นหนังไดคัท: หัวกลม + จุกสองข้าง (เติมสีล้วน ไม่ตีเส้น เพื่อให้เชื่อมเป็นชิ้นเดียว) -->
    <g fill="${LEATHER}">
      <circle cx="-52" cy="-40" r="23"/>
      <circle cx="52" cy="-40" r="23"/>
      <circle cx="0" cy="14" r="86"/>
    </g>
    <!-- ไฮไลต์ผิวหนัง PU -->
    <ellipse cx="-30" cy="-16" rx="44" ry="34" fill="#f6e79b" opacity="0.55"/>
    <path d="M -86 14 A 86 86 0 0 0 86 14" fill="${LEATHER_DK}" opacity="0.35"/>
    <!-- เส้นด้ายเย็บรอบชิ้น (ปักตามรูปทรง) -->
    <circle cx="0" cy="14" r="74" fill="none" stroke="${STITCH}" stroke-width="3" stroke-dasharray="9 7" opacity="0.9"/>
    <!-- โบว์ปัก -->
    <g>
      <path d="M -48 -50 C -66 -74 -30 -92 -12 -72 L 12 -72 C 30 -92 66 -74 48 -50 C 40 -34 -40 -34 -48 -50 Z" fill="${PINK}"/>
      <path d="M -44 -52 C -58 -70 -32 -82 -16 -66" fill="none" stroke="#ff8dbe" stroke-width="7" stroke-linecap="round"/>
      <path d="M 44 -52 C 58 -70 32 -82 16 -66" fill="none" stroke="#ff8dbe" stroke-width="7" stroke-linecap="round"/>
      <path d="M -13 -72 C -6 -56 6 -56 13 -72 C 8 -44 -8 -44 -13 -72 Z" fill="${PINK_DK}"/>
      <path d="M -48 -50 C -66 -74 -30 -92 -12 -72 L 12 -72 C 30 -92 66 -74 48 -50 C 40 -34 -40 -34 -48 -50 Z"
        fill="none" stroke="${PINK_DK}" stroke-width="2.5" stroke-dasharray="6 5" opacity="0.8"/>
    </g>
    <!-- หน้า: ตา / แก้ม / ปาก -->
    <circle cx="-30" cy="4" r="9" fill="${EYE}"/>
    <circle cx="30" cy="4" r="9" fill="${EYE}"/>
    <ellipse cx="-52" cy="28" rx="13" ry="8" fill="#ff5c9e" opacity="0.85"/>
    <ellipse cx="52" cy="28" rx="13" ry="8" fill="#ff5c9e" opacity="0.85"/>
    <path d="M -32 30 C -30 12 30 12 32 30 C 34 50 -34 50 -32 30 Z" fill="${BEAK}"/>
    <path d="M -26 28 C -22 18 22 18 26 28" fill="none" stroke="#ffbe5c" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
  </g>`;
};

/**
 * กุญแจบ้าน 1 ดอก ขนาด "คงที่" ทุกใบ (ยาว ~7 ซม.) — วาดไว้หลังชิ้นหนัง
 * ปลายกุญแจเสียบซ่อนอยู่ในปลอก เหลือหัวห่วงโผล่ใต้ขอบล่าง แบบรูปงานจริง
 * ขนาดกุญแจเท่ากันทุกการ์ด จึงใช้เทียบได้ว่าปลอกแต่ละขนาดใหญ่แค่ไหน
 * จุดอ้างอิง (x,y) = กลางห่วงกุญแจ · ตัวกุญแจพุ่งไปทาง +y ก่อนหมุน
 */
const KEY_LEN_INCH = 2.75;
const realKey = (x, y, rot) => {
  const k = (KEY_LEN_INCH * PX_PER_INCH) / 100; // สเปซภายใน 100 หน่วย = ความยาวกุญแจ
  return `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">
    <circle cx="0" cy="0" r="15" fill="none" stroke="#b9c1cd" stroke-width="7"/>
    <circle cx="0" cy="20" r="13" fill="#cbd2dc"/>
    <rect x="-4.5" y="20" width="9" height="66" fill="#cbd2dc"/>
    <rect x="-4.5" y="20" width="4" height="66" fill="#eef2f7"/>
    <!-- ร่องฟันกุญแจ -->
    <path d="M 4.5 52 l 8 0 l 0 7 l -8 0 Z M 4.5 63 l 8 0 l 0 7 l -8 0 Z M 4.5 74 l 6 0 l 0 6 l -6 0 Z" fill="#aeb7c4"/>
    <path d="M -4.5 86 L 4.5 86 L 0 93 Z" fill="#aeb7c4"/>
  </g>`;
};

// ── การ์ด 1 ใบต่อ 1 ขนาด ────────────────────────────────────────────
const CY = 380;        // กลางชิ้นหนัง
const LABEL_Y = 505;   // ป้ายขนาดตัวใหญ่ — อยู่ในกรอบครอป 300-600 ทุกใบ

function sizeArt(inch, extra) {
  const size = inch * PX_PER_INCH;
  const half = size / 2;
  const top = CY - half, bottom = CY + half, left = W / 2 - half, right = W / 2 + half;
  const label = `${inch} × ${inch} นิ้ว`;
  const lw = label.length * 26 + 70;
  return frame(`
    ${title(extra ? `ขยายเป็น ${inch} × ${inch} นิ้ว` : "ขนาดมาตรฐาน 4 × 4 นิ้ว",
      extra ? `ใหญ่ขึ้นด้านละ ${inch - 4} นิ้ว — เพิ่มใบละ ฿${extra}` : "หนัง PU ปักลาย 1 ด้าน — รวมในราคาแล้ว")}
    <!-- กรอบขนาดจริงของชิ้นหนัง + ลูกศรวัด 2 แกน (แนวนอนวางไว้เหนือกรอบ กันชนกุญแจ/ป้ายขนาด) -->
    <rect x="${left}" y="${top}" width="${size}" height="${size}" rx="10" fill="none" stroke="${OK}" stroke-width="3" stroke-dasharray="12 9" opacity="0.55"/>
    ${dim(left - 40, top, left - 40, bottom, `${inch} นิ้ว`)}
    <!-- กุญแจอ้างอิงวางนิ่งที่เดิมทุกใบ (ไม่สเกลตามขนาด) — เทียบข้าง ๆ แล้วเห็นเลยว่าปลอกใหญ่ขึ้นแค่ไหน -->
    ${realKey(770, 322, 8)}
    <text x="770" y="546" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">กุญแจ 1 ดอก</text>
    <text x="770" y="572" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">(เท่ากันทุกใบ)</text>
    ${keyCover(W / 2, CY, size)}
    <!-- ป้ายขนาดตัวใหญ่ คาบกลางภาพไว้ให้เห็นตอนย่อเป็นปุ่ม 62×62 -->
    <rect x="${(W - lw) / 2}" y="${LABEL_Y - 36}" width="${lw}" height="72" rx="36" fill="#ffffff" opacity="0.93" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${LABEL_Y + 17}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
    ${extra
      ? pill(W / 2, 648, `เพิ่มใบละ ฿${extra}`, "warn")
      : pill(W / 2, 648, "ขนาดมาตรฐาน รวมในราคาสินค้าแล้ว")}
    ${foot([
      "ภาพทั้ง 3 ขนาดวาดสเกลเดียวกัน · กุญแจในภาพขนาดเท่ากันทุกใบ ไว้เทียบสัดส่วน",
      extra
        ? `เพิ่มขนาดคิดนิ้วละ ฿${RATE} ต่อใบ (สูงสุด 2 นิ้ว) · ใหญ่กว่านี้ทักแชทให้แอดมินตีราคา`
        : "งานปัก 1 ด้าน · เชือกยางยืดพร้อมตัวล็อก สอดเก็บกุญแจได้ทั้งดอก",
      "ขนาดแต่ละชิ้นอาจมีความเคลื่อน 2-5 ซม.",
    ])}`);
}

const CARDS = [
  { inch: 4, extra: 0, file: `size-4x4-${VER}.jpg` },
  { inch: 5, extra: RATE, file: `size-5x5-${VER}.jpg` },
  { inch: 6, extra: RATE * 2, file: `size-6x6-${VER}.jpg` },
];
for (const c of CARDS) {
  c.name = `${c.inch} × ${c.inch} นิ้ว`;
  c.buf = await sharp(Buffer.from(sizeArt(c.inch, c.extra))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${c.file}`, c.buf);
  // ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
  await sharp(c.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${c.file}`);
  console.log(`🖼  ${OUT}/${c.file}  ${Math.round(c.buf.length / 1024)} KB — ${c.name}${c.extra ? ` (+฿${c.extra})` : ""}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const c of CARDS) {
  const key = `products/${PRODUCT_ID}/${c.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  c.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", c.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: `ขนาดมาตรฐาน 4×4 นิ้ว — ขยายได้นิ้วละ ฿${RATE} ต่อใบ (สูงสุด 2 นิ้ว) · ขนาดแต่ละชิ้นอาจมีความเคลื่อน 2-5 ซม.`,
  choices: [
    {
      name: CARDS[0].name, popular: true, imageSrc: CARDS[0].url,
      desc: "ขนาดมาตรฐานของร้าน รวมในราคาแล้ว — หนัง PU ปักลาย 1 ด้าน พร้อมเชือกยางยืดและตัวล็อก",
    },
    {
      name: CARDS[1].name, extra: RATE, imageSrc: CARDS[1].url,
      desc: `ใหญ่ขึ้นด้านละ 1 นิ้ว — คิดเพิ่มนิ้วละ ฿${RATE} เป็นใบละ +฿${RATE}`,
    },
    {
      name: CARDS[2].name, extra: RATE * 2, imageSrc: CARDS[2].url,
      desc: `ใหญ่ขึ้นด้านละ 2 นิ้ว — คิดเพิ่มนิ้วละ ฿${RATE} เป็นใบละ +฿${RATE * 2} · ใหญ่กว่านี้ทักแชทให้แอดมินตีราคา`,
    },
  ],
};

// รันซ้ำได้: ตัดกลุ่มเดิม + กลุ่มที่เคยวางไว้ทิ้งก่อน แล้ววางไว้หน้าสุด
const options = (data.options ?? []).filter((o) => o.label !== GROUP && o.label !== OLD_GROUP);
data.options = [sizeGroup, ...options];
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [!got.some((o) => o.label === OLD_GROUP), "กลุ่มเก่ายังอยู่ (คิดเงินเพิ่มขนาดซ้ำ 2 ทาง)"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 3, "จำนวนการ์ดไม่ครบ 3"],
  ...CARDS.map((c, i) => [
    g?.choices?.[i]?.name === c.name && g?.choices?.[i]?.imageSrc === c.url && (g?.choices?.[i]?.extra ?? 0) === c.extra,
    `การ์ด ${c.name} ไม่ตรง (ชื่อ/ภาพ/ราคาเพิ่ม)`,
  ]),
  [g?.choices?.every((c) => c.desc), "การ์ดขาดคำอธิบาย"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 170 && back.data.priceMax === 195, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nราคาต่อใบที่ลูกค้าจะเห็น (ฐาน 195 / 190 / 180 / 170 ตามช่วงจำนวน):");
for (const c of CARDS) console.log(`  ${c.name}  →  +฿${c.extra}  = ${[195, 190, 180, 170].map((b) => b + c.extra).join(" / ")}`);
console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 3 ใบ + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

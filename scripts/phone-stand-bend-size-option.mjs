#!/usr/bin/env node
/**
 * สแตนดี้ตั้งโทรศัพท์ (แบบฐานดัดง้อ) — id `phone-stand-bend-base`
 * เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + วาดภาพประกอบให้การ์ด
 *
 *   node scripts/phone-stand-bend-size-option.mjs           (วาดลง .cache/phone-stand-bend/upload ดูก่อน)
 *   node scripts/phone-stand-bend-size-option.mjs --write   (+ อัปโหลด storage + เขียนกลุ่มลง DB + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: "เพิ่มกลุ่มตัวเลือกขนาด เป็นแบบการ์ด" + "สร้างภาพตัวอย่างที่กลุ่มตัวเลือก"
 *
 * ขนาดที่ใช้มาจากแท็บ "รายละเอียดเพิ่มเติม" ของสินค้าเอง (ไม่ได้เดา):
 *   สูงประมาณ 14 ซม. · ฐานกว้าง 8 ซม. · จุดดัดงอ 3 จุด · อะคริลิคหนา ~3 มม.
 *   "เพิ่มขนาด ซม. ละ 10 บาท (หน้าเว็บขายขนาดเดียว — อยากได้ใหญ่กว่านี้ทักแอดมินเป็นงานสั่งพิเศษ)"
 *   → การ์ดจึงมี **ใบเดียว ไม่บวกราคา** ไม่ทำ "กำหนดขนาดเอง" (ต่างจาก [[iducky-coaster-opener-size]]
 *     ที่ใบสเปคให้ขายขนาดกำหนดเองบนเว็บได้) และไม่แตะ tabs/terms
 *
 * ราคา: `pricing.driverLabels` ของตัวนี้ว่าง (`[]`) ทั้งเรทหลักและ priceRates[0] — กลุ่มใหม่ชื่อ "ขนาด"
 *   จึงไม่ไปชนแกนตารางราคา ([[iducky-price-driver-trap]]) สคริปต์เช็คซ้ำตอนอ่านกลับ
 *
 * ภาพ: ภาพด้านข้าง (โปรไฟล์) แบบเดียวกับภาพ bend-points ในแกลเลอรี แต่วาดตัวอะคริลิคเป็น "แถบหนา"
 *   ให้เป็นก้อนรูปตัว L อ่านออกตอนย่อเหลือ 80 px บนการ์ด ([[iducky-option-thumb-crop]])
 *   ชิ้นงานกินเต็มเฟรม หัวเรื่อง/ท้ายภาพอย่างละบรรทัด (ชื่อ+คำอธิบายมีบนการ์ดอยู่แล้ว)
 *
 * ⚠️ แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ อย่าอัปทับชื่อเดิม (CDN/Next แคช 30 วัน — [[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: มีกลุ่ม "ขนาด" อยู่แล้วก็แก้ทับแบบ read-modify-write ไม่ย้ายลำดับกลุ่มอื่น ไม่แตะฟิลด์อื่น
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "phone-stand-bend-base";
const VER = "v1";
const GROUP = "ขนาด";
const CHOICE = "สูง 14 ซม. × ฐานกว้าง 8 ซม.";
const DESC = "ขนาดเดียว — อะคริลิคแผ่นเดียวดัดง้อ 3 จุด หนา ~3 มม. · วางมือถือได้ทั้งแนวตั้ง-แนวนอน · อยากได้ใหญ่กว่านี้ทักแอดมิน (เพิ่ม ซม. ละ ฿10 เป็นงานสั่งพิเศษ)";
const FILE = `size-14cm-base8-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/phone-stand-bend/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", LINE = "#cbd5e1";
const S = 44;              // 1 ซม. = 44 px → สูง 14 ซม. = 616 px
const FLOOR = 746;         // เส้นพื้น (สูง 14 ซม. = 616 px → ยอดอยู่ที่ y=130)
const X0 = 210;            // พิกัด x ของ "ซม. ที่ 0" (ปลายตีนหน้า)
const px = (cx) => X0 + cx * S;
const py = (cy) => FLOOR - cy * S;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว (ทรงเดียวกับสคริปต์ขนาดตัวอื่น) */
const dim = (x1, y1, x2, y2, label, { flip = false } = {}) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 + (flip ? 16 : -16) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 9 : y2 + 36;
  const tick = (x, y) => `<line x1="${x - (vertical ? 10 : 0)}" y1="${y - (vertical ? 0 : 10)}" x2="${x + (vertical ? 10 : 0)}" y2="${y + (vertical ? 0 : 10)}" stroke="${SUB}" stroke-width="3"/>`;
  const bw = label.length * 14 + 18;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${vertical ? (flip ? lx - 6 : lx - bw + 6) : lx - bw / 2}" y="${ly - 27}" width="${bw}" height="35" rx="8" fill="#ffffff" opacity="0.95"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="27" font-weight="700"
      text-anchor="${vertical ? (flip ? "start" : "end") : "middle"}" fill="${SUB}">${esc(label)}</text>`;
};

/**
 * โครงอะคริลิคด้านข้าง — เดินเส้นตามจุดดัด 3 จุดของงานจริง (อ่านจากภาพ bend-points ในแกลเลอรี)
 *   ตีนหน้า (กันเครื่องไหล) → ดัดจุดที่ 1 → ฐานยาว 8 ซม. → ดัดจุดที่ 2 → ท่อนสั้นเอียงขึ้น
 *   → ดัดจุดที่ 3 → แผ่นหลังพิงเครื่อง สูงสุด 14 ซม. จากพื้น
 * วาดเป็น "แถบหนา" (เกินสเกลจริงนิดหน่อย 3 มม. ≈ 13 px วาด 18 px) ไม่ใช่เส้นบาง จะได้เป็นก้อนตัว L ตอนย่อ 80 px
 */
const P = {
  toe: [0.15, 0.85],   // ปลายตีนหน้า
  b1: [0.62, 0.06],    // ดัดจุดที่ 1
  b2: [8.62, 0.06],    // ดัดจุดที่ 2 (ฐานกว้าง 8 ซม. ระหว่าง b1–b2)
  b3: [9.02, 2.0],     // ดัดจุดที่ 3
  top: [9.72, 14.0],   // ยอดแผ่นหลัง = สูง 14 ซม.
};
const pt = ([x, y]) => `${px(x)},${py(y)}`;
const frame = `
  <polyline points="${pt(P.toe)} ${pt(P.b1)} ${pt(P.b2)} ${pt(P.b3)} ${pt(P.top)}"
    fill="none" stroke="#0e7490" stroke-width="26" stroke-linejoin="round" stroke-linecap="round" opacity="0.25"/>
  <polyline points="${pt(P.toe)} ${pt(P.b1)} ${pt(P.b2)} ${pt(P.b3)} ${pt(P.top)}"
    fill="none" stroke="url(#acr)" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>`;

/** จุดดัด 3 จุด — วงกลมเล็กบอกตำแหน่ง (ไม่ใส่ป้ายคำ ภาพ bend-points ในแกลเลอรีอธิบายไว้แล้ว) */
const bendDots = [P.b1, P.b2, P.b3]
  .map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="10" fill="#ffffff" stroke="#f59e0b" stroke-width="5"/>`)
  .join("");

/**
 * มือถือวางพิงอยู่ (มองด้านข้าง = เห็นเป็นแผ่นบาง) — บอกว่าของชิ้นนี้ไว้ทำอะไร และเทียบขนาดได้
 * มุมเอน 39° จากแนวดิ่ง ไม่ได้กะเอา: ก้นเครื่องตกร่องตีนหน้า แล้วหลังเครื่องต้องไปแตะ
 * แผ่นหลังที่อยู่ถอยไป 8 ซม. — เครื่องยาว ~14.5 ซม. จึงพิงได้ที่มุมนี้พอดี (ตรงกับภาพ bend-points)
 */
const phone = (() => {
  const pl = 14.5 * S, pt2 = 1.7 * S;   // ยาว 14.5 ซม. · หนา (ที่มองเห็นด้านข้าง) 1.7 ซม.
  const ang = 39;
  const bx = px(1.6), byy = py(0.1);   // จุดหมุน = มุมล่างด้านหลังเครื่องที่นั่งอยู่บนฐาน (มุมล่างด้านหน้าจะไปพิงตีนหน้าพอดี)
  return `
    <g transform="translate(${bx} ${byy}) rotate(${ang})">
      <rect x="${-pt2}" y="${-pl}" width="${pt2}" height="${pl}" rx="14" fill="#cbd5e1" stroke="#94a3b8" stroke-width="3"/>
      <rect x="${-pt2 + 8}" y="${-pl + 8}" width="${pt2 - 16}" height="${pl - 16}" rx="9" fill="#eef2f7"/>
      <text x="${-pt2 / 2}" y="${-pl * 0.45}" font-family="${TH}" font-size="22" text-anchor="middle" fill="#94a3b8">มือถือ</text>
    </g>`;
})();

const svg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="acr" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/><stop offset="0.5" stop-color="#38bdf8"/><stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">สูง 14 ซม. · ฐานกว้าง 8 ซม.</text>

  <!-- พื้น -->
  <line x1="150" y1="${FLOOR}" x2="${W - 90}" y2="${FLOOR}" stroke="${LINE}" stroke-width="3"/>

  ${phone}
  ${frame}
  ${bendDots}

  <!-- วัดความสูง 14 ซม. (เริ่มจากพื้นฐานตามที่แท้บสินค้าระบุ) -->
  ${dim(px(10.9), py(0), px(10.9), py(14), "14 ซม.", { flip: true })}
  <!-- วัดฐาน 8 ซม. ระหว่างจุดดัดที่ 1 กับจุดดัดที่ 2 -->
  ${dim(px(0.62), FLOOR + 44, px(8.62), FLOOR + 44, "8 ซม.")}

  <text x="${W / 2}" y="${H - 34}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ขนาดโดยประมาณ ขึ้นกับการดัดง้อ · วัดความสูงจากพื้นฐาน</text>
</svg>`;

const buf = await sharp(Buffer.from(svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE}`);            // = ที่ลูกค้าเห็นบนการ์ดจริง
// ⚠️ sharp: .resize() ต่อกัน 2 ครั้งในไปป์ไลน์เดียว ครั้งหลังทับครั้งแรก — ต้องคั่น toBuffer()
await sharp(await sharp(buf).resize(80, 80).toBuffer()).resize(480, 480, { kernel: "nearest" }).toFile(`${OUT}/thumb-zoom-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียนกลุ่มลง DB ────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-size-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const before = data.options ?? [];
if (before.filter((o) => o.label === GROUP).length > 1) { console.error(`มีกลุ่มชื่อ "${GROUP}" ซ้ำหลายกลุ่ม — หยุดก่อน`); process.exit(1); }
const card = { name: CHOICE, imageSrc: url, desc: DESC };
const existing = before.find((o) => o.label === GROUP);
if (existing) {                       // รันซ้ำ — แก้ทับกลุ่มเดิม ไม่ย้ายลำดับ
  existing.display = "cards";
  existing.choices = [{ ...(existing.choices?.[0] ?? {}), ...card }];
} else {                              // ครั้งแรก — ขนาดคือสเปคชิ้นงาน วางไว้กลุ่มแรกก่อน "สีอะคริลิค"
  data.options = [{ label: GROUP, display: "cards", choices: [card] }, ...before];
}
data.savedAt = new Date().toISOString(); // ให้เว็บติด ?v= ใหม่ กันแคชรูปเก่า

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]] ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gb = got.find((o) => o.label === GROUP);
const kept = before.filter((o) => o.label !== GROUP).map((o) => o.label);
const fails = [
  [got.length === kept.length + 1, "จำนวนกลุ่มตัวเลือกไม่ตรง (กลุ่มหาย/งอก)"],
  [kept.every((l) => got.some((o) => o.label === l)), "กลุ่มเดิมหายไปบางกลุ่ม"],
  [gb?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gb?.choices?.length === 1 && gb.choices[0].name === CHOICE, "การ์ดขนาดไม่ตรง"],
  [gb?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!gb?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [!(back.data.priceRates ?? []).some((r) => (r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนราคาของเรท"],
  [back.data.priceMin === row.data.priceMin && back.data.priceMax === row.data.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ต้องเป็น ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด "${CHOICE}" + ภาพ อ่านกลับตรงทุกข้อ · กลุ่มทั้งหมด =`, got.map((o) => o.label).join(" / "));
console.log("savedAt =", back.data.savedAt);

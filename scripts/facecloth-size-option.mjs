#!/usr/bin/env node
/**
 * ผ้าเช็ดหน้า (facecloth) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/facecloth-size-option.mjs           (วาดภาพลง .cache/facecloth/upload ดูก่อน)
 *   node scripts/facecloth-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค: 40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/18_ผ้าขนหนู…/P-nผ้าเช็ดหน้า+ขนหนู-01.jpg
 *   ผ้าเช็ดหน้า = ผ้า Micro Fiber สีขาว **ขนาดเดียว 30 × 30 ซม.** เริ่มต้น 120 บาท (ตรงกับ pricing ใน DB)
 *   พิมพ์ซับลิเมชั่นได้ 1 ด้าน (ฝั่ง Micro Fiber) · ความหนา 280 GSM · ซักเครื่องได้
 *   1-10 ชิ้นคละลายได้ · 11 ชิ้นขึ้นไปคละลายละ 5 ชิ้น (ตรงกับ priceRates.r1 ใน DB)
 *   ⚠️ ขนาดที่เห็นในตารางบนใบสเปคเดียวกัน (30×60 … 80×180) เป็นของ "ผ้าขนหนู" คนละสินค้า ไม่เอามาใส่ที่นี่
 *
 * ของเดิมใน DB: data.options = [] (ไม่มีกลุ่มตัวเลือกเลย) → กลุ่มนี้เป็นกลุ่มแรกของสินค้า
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = [] คีย์ราคาจึงเป็น "" ตรงกับ cells[""]
 *   การ์ดใบเดียวไม่มี extra → ยอดเงินเท่าเดิมทุกช่วงจำนวน (120/90/80/75)
 *   ยังเช็คซ้ำตอนอ่านกลับว่าชื่อกลุ่มไม่ไปชน driverLabels ([[iducky-price-driver-trap]])
 *
 * ภาพ 900×900 วาดสเกลจริง (1 ซม. = 15 px) ผืนผ้าจัตุรัส 30×30 ซม. ขนหนูฟู ๆ พิมพ์เต็มผืน
 * มี "มือถือ" (สูง 15.5 ซม.) วาดสเกลเดียวกันวางเทียบข้าง ๆ ให้เห็นว่าผืนจริงใหญ่แค่ไหน + ลูกศรวัดสองแกน
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300-600) — ป้ายขนาดตัวใหญ่จึงคาบกลางภาพไว้ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = ตัดทิ้งแล้ววางใหม่หน้าสุด ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "facecloth";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const CHOICE = "30 × 30 ซม.";
const FILE = `size-30x30-${VER}.jpg`;

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 15; // 1 ซม. = 15 px → ผืน 30×30 ซม. = 450×450 px

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

const pill = (cx, y, text) => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
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

/**
 * มือถือขนาด "คงที่" ไว้เทียบสัดส่วน — เครื่องทั่วไปสูง ~15.5 ซม. กว้าง ~7.5 ซม.
 * วาดด้วยสเกล CM เดียวกับผืนผ้า จึงอ่านขนาดจริงของผืนผ้าได้จากภาพเดียว
 */
const phone = (cx, cy) => {
  const w = 7.5 * CM, h = 15.5 * CM;
  const x = cx - w / 2, y = cy - h / 2;
  return `
  <g>
    <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#0f172a" opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#1e293b"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${w * 0.13}" fill="#e2e8f0"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${w * 0.13}" fill="url(#screen)"/>
    <rect x="${cx - 13}" y="${y + 11}" width="26" height="7" rx="3.5" fill="#1e293b" opacity="0.55"/>
    <rect x="${cx - 18}" y="${y + h - 17}" width="36" height="5" rx="2.5" fill="#1e293b" opacity="0.35"/>
  </g>`;
};

/** ผืนผ้าเช็ดหน้า Micro Fiber 30×30 ซม. พิมพ์ซับลิเมชั่นเต็มผืน */
function sizeArt() {
  const S = 30 * CM;              // 450 px
  const cx = 450, cy = 360;       // กลางผืน — วางกลางการ์ด ให้ป้ายขนาดอยู่ในกรอบครอปปุ่มพอดี
  const x0 = cx - S / 2, y0 = cy - S / 2;
  const r = MASCOT.ratio;
  const ah = S * 0.5, aw = ah * r;
  const my = 300; // กลางมาสคอต — เหนือป้ายขนาด ไม่ให้ป้ายทับขาเป็ด
  const label = CHOICE;
  const lw = label.length * 26 + 70;
  const LABEL_Y = 505; // คาบกรอบครอปปุ่ม 300-600

  return frame(`
    ${title("ขนาด 30 × 30 ซม.", "ผ้า Micro Fiber สีขาว — ขนาดเดียว")}

    <defs>
      <!-- เนื้อผ้า Micro Fiber สีขาว ไล่แสงนุ่ม -->
      <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.62" stop-color="#f7fafc"/>
        <stop offset="1" stop-color="#e9eef3"/>
      </linearGradient>
      <!-- ขนผ้าละเอียด — จุดถี่ ๆ ให้ดูฟู ไม่ใช่กระดาษ -->
      <pattern id="pile" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1.5" fill="#cfd9e2" opacity="0.45"/>
        <circle cx="7.5" cy="7.5" r="1.2" fill="#dbe3ea" opacity="0.5"/>
      </pattern>
      <!-- จอมือถือที่ใช้เทียบขนาด -->
      <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f1f5f9"/>
        <stop offset="1" stop-color="#cbd5e1"/>
      </linearGradient>
      <!-- ลายพิมพ์ซับลิเมชั่นโทนแบรนด์ เต็มผืน -->
      <pattern id="print" width="86" height="86" patternUnits="userSpaceOnUse">
        <circle cx="18" cy="18" r="5" fill="#67d1e0" opacity="0.7"/>
        <circle cx="60" cy="52" r="3" fill="#8ad9e6" opacity="0.7"/>
        <circle cx="36" cy="72" r="2" fill="#a5e2ec" opacity="0.7"/>
      </pattern>
    </defs>

    <!-- เงาใต้ผืนผ้า -->
    <rect x="${x0 + 7}" y="${y0 + 15}" width="${S}" height="${S}" rx="14" fill="#0f172a" opacity="0.07"/>
    <!-- ตัวผืนผ้า -->
    <rect x="${x0}" y="${y0}" width="${S}" height="${S}" rx="14" fill="url(#cloth)" stroke="#d7dee6" stroke-width="3"/>
    <clipPath id="sq"><rect x="${x0 + 3}" y="${y0 + 3}" width="${S - 6}" height="${S - 6}" rx="12"/></clipPath>
    <g clip-path="url(#sq)">
      <rect x="${x0}" y="${y0}" width="${S}" height="${S}" fill="url(#pile)"/>
      <rect x="${x0}" y="${y0}" width="${S}" height="${S}" fill="url(#print)"/>
      <!-- แถบสีมุมล่าง สื่อว่าพิมพ์ได้ถึงขอบผืน -->
      <path d="M ${x0} ${y0 + S} L ${x0 + S * 0.42} ${y0 + S} L ${x0} ${y0 + S * 0.58} Z" fill="#7fd6e3" opacity="0.42"/>
    </g>
    <!-- เส้นเย็บริมรอบผืน -->
    <rect x="${x0 + 13}" y="${y0 + 13}" width="${S - 26}" height="${S - 26}" rx="8" fill="none"
      stroke="#b6c3ce" stroke-width="2.5" stroke-dasharray="10 7"/>
    <!-- มาสคอตแทนลายสกรีนของลูกค้า -->
    <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${my - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>

    <!-- ลูกศรวัดสองแกน -->
    ${dim(x0, y0 + S + 40, x0 + S, y0 + S + 40, "30 ซม.")}
    ${dim(x0 - 40, y0, x0 - 40, y0 + S, "30 ซม.")}

    <!-- มือถือเทียบสัดส่วน สูง ~15.5 ซม. วาดสเกลเดียวกับผืนผ้า -->
    ${phone(790, 340)}
    <text x="790" y="510" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">มือถือทั่วไป</text>
    <text x="790" y="536" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">(สูง ~15.5 ซม.)</text>

    <!-- ป้ายขนาดตัวใหญ่ คาบกลางภาพไว้ให้เห็นตอนย่อเป็นปุ่ม 62×62 -->
    <rect x="${(W - lw) / 2}" y="${LABEL_Y - 36}" width="${lw}" height="72" rx="36" fill="#ffffff" opacity="0.93" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${LABEL_Y + 17}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>

    ${pill(W / 2, 706, "ขนาดเดียว รวมในราคาสินค้าแล้ว")}
    ${foot([
      "พิมพ์ซับลิเมชั่นเต็มผืน 1 ด้าน (ฝั่ง Micro Fiber) · ผ้าสีขาว หนา 280 GSM",
      "ซักเครื่องได้ · 1-10 ชิ้นคละลายได้ · 11 ชิ้นขึ้นไปคละลายละ 5 ชิ้น",
      "ระยะสกรีนอาจคลาดเคลื่อน 2-5 ซม. เพราะผ้าแต่ละผืนขนาดไม่เท่ากัน",
    ])}`);
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
// ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
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
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: "ผ้าเช็ดหน้ามีขนาดเดียว 30 × 30 ซม. · ระยะสกรีนอาจคลาดเคลื่อน 2-5 ซม. เพราะผ้าแต่ละผืนขนาดไม่เท่ากัน",
  choices: [{
    name: CHOICE,
    popular: true,
    imageSrc: url,
    desc: "ผ้า Micro Fiber สีขาว หนา 280 GSM · พิมพ์ซับลิเมชั่นเต็มผืน 1 ด้าน (ฝั่ง Micro Fiber) · ซักเครื่องได้ — รวมในราคาแล้ว",
  }],
};

// รันซ้ำได้: ตัดกลุ่มเดิมทิ้งก่อน แล้ววางไว้หน้าสุด
const options = (data.options ?? []).filter((o) => o.label !== GROUP);
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
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 1, "จำนวนการ์ดไม่ใช่ 1 ใบ"],
  [g?.choices?.[0]?.name === CHOICE, "ชื่อการ์ดไม่ตรง"],
  [g?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!g?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [!!g?.choices?.[0]?.desc, "การ์ดขาดคำอธิบาย"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 75 && back.data.priceMax === 120, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 1 ใบ (${CHOICE}) + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
console.log("ราคาต่อชิ้นเท่าเดิมทุกช่วงจำนวน: 120 / 90 / 80 / 75");

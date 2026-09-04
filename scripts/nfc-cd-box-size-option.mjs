#!/usr/bin/env node
/**
 * กล่องซีดี + NFC (nfc) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/nfc-cd-box-size-option.mjs           (วาดภาพลง .cache/nfc/upload ดูก่อน)
 *   node scripts/nfc-cd-box-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: หน้าสินค้ามีแต่กลุ่ม "สีตะขอ C (โซ่ไข่ปลา)" ยังไม่บอกขนาดเลย
 *
 * ใบสเปค ACRYLIC MUSIC & ALBUM CD BOX +NFC
 *   (10_อะคริลิค/สแตนดี้อะคริลิค/07-3-3_สแตนดี้ฐานไฟ - ฐานดนตรี-Album CD/P-SAmusic1-01.jpg คอลัมน์ขวาสุด):
 *   - ขนาด 5.2 x 5.2 cm (ขนาดรวมรูใส่ห่วง)   ← ขนาดเดียว ไม่มีตัวเลือกเพิ่มขนาด
 *   - แผ่น CD เป็นอะคริลิคเคลือบโฮโลแกรม
 *   - ปกหน้า-ปกหลัง เป็นกระดาษอาร์ตมัน · ปกใส่กรอบอัลบั้มสำเร็จรูป
 *   - ติดแผ่น NFC แบบสติ๊กเกอร์ที่ปกด้านหลัง · สกรีนด้วยระบบ UV | Digital
 *   (คอลัมน์ Music Box มี "เพิ่มขนาด บวกเพิ่ม cm ละ 30" — ของ Album CD Box **ไม่มี** จึงเป็นขนาดเดียวจริง)
 *
 * ภาพวาด 900×900: กล่องอัลบั้ม 2 หน้า สเกลเดียวกัน (60 px/ซม.)
 *   ซ้าย = ด้านหน้า ปกลายลูกค้า + หูรูใส่ห่วง (ลูกศรวัด 5.2 ทั้งสองแกน รวมหูแล้ว)
 *   ขวา = ด้านหลัง เห็นแผ่น CD อะคริลิคโฮโลแกรม + สติ๊กเกอร์ NFC ที่ปกหลัง
 *
 * ⚠️ การ์ดโชว์ภาพ 80×80 object-cover บนภาพจัตุรัส = เห็นเต็มภาพแต่เล็กมาก
 *    องค์ประกอบหลักจึงมีแค่ 2 ก้อน + ป้ายขนาดตัวใหญ่กลางภาพ ให้ยังอ่านออกตอนย่อ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * ราคา: pricing.driverLabels = [] (ราคาขึ้นกับจำนวนอย่างเดียว) — กลุ่ม "ขนาด" ไม่ไปชนแกนตารางราคา
 *   สคริปต์เช็คซ้ำตอนอ่านกลับ ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิมที่ตำแหน่งเดิม ไม่เพิ่มซ้ำ ไม่แตะกลุ่มสีตะขอ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "nfc";
const VER = "v1";
const GROUP = "ขนาด";
const CHOICE = "5.2 × 5.2 ซม.";
const DESC =
  "กล่องอัลบั้มทรงจัตุรัส ขนาดเดียว — วัดรวมหูรูใส่ห่วงแล้ว · แผ่น CD อะคริลิคเคลือบโฮโลแกรม ปกหน้า-ปกหลังกระดาษอาร์ตมัน ติดแผ่น NFC ที่ปกด้านหลัง";
const FILE = `size-5.2x5.2-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/nfc/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("peace", 420);

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 60;                 // 1 ซม. = 60 px → กล่อง 5.2 ซม. = 312 px (สองหน้าสเกลเดียวกัน)
const BOX = 5.2 * CM;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว
 * แกนตั้งหมุนป้าย 90° เพราะแถบซ้ายของภาพนี้แคบ (ป้ายแนวนอนจะล้นออกนอกกรอบ)
 */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const w = label.length * 12.5;
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  const lx = vertical ? x1 - 22 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 : y2 + 32;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <g ${vertical ? `transform="rotate(-90 ${lx} ${ly})"` : ""}>
      <rect x="${lx - w / 2}" y="${ly - (vertical ? 21 : 24)}" width="${w}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
      <text x="${lx}" y="${ly + (vertical ? 2 : 0)}" font-family="${TH}" font-size="24" font-weight="700"
        text-anchor="middle" fill="${SUB}">${esc(label)}</text>
    </g>`;
};

const pill = (cx, y, text, tone = OK, bg = "#ecfeff") => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${tone}">${esc(text)}</text>`;
};

/**
 * กล่องอัลบั้ม 1 หน้า — กรอบพลาสติกใส + สันซ้ายมีบานพับ + หูรูใส่ห่วงโผล่ที่มุมบนขวา
 * ความสูงรวมหู = ความกว้าง = 5.2 ซม. (ใบสเปคบอก "ขนาดรวมรูใส่ห่วง")
 * back = หน้าหลัง: เห็นแผ่น CD โฮโลแกรมผ่านกล่อง + สติ๊กเกอร์ NFC กลม
 */
const albumBox = (x, y, s, { back = false } = {}) => {
  const tab = s * 0.13;                      // หูรูใส่ห่วงกินความสูงส่วนบน
  const bx = x, by = y + tab, bw = s, bh = s - tab;
  const pad = s * 0.05;                      // ขอบกล่องใสรอบปก
  const cx0 = bx + pad, cy0 = by + pad, cw = bw - pad * 2, ch = bh - pad * 2;
  const r = MASCOT.ratio;
  const mh = ch * 0.5, mw = mh * r;
  const hx = bx + bw * 0.74, hy = y + tab * 0.62;  // ตำแหน่งหู
  const cdR = ch * 0.29, cdX = cx0 + cw * 0.46, cdY = cy0 + ch * 0.62;
  return `
  <!-- เงากล่อง -->
  <rect x="${bx + 6}" y="${by + 10}" width="${bw}" height="${bh}" rx="9" fill="#0f172a" opacity="0.09"/>
  <!-- หูรูใส่ห่วง (พลาสติกใสชิ้นเดียวกับฝากล่อง) -->
  <path d="M ${hx - tab * 0.85} ${by + 6} L ${hx - tab * 0.72} ${hy} A ${tab * 0.8} ${tab * 0.8} 0 0 1 ${hx + tab * 0.72} ${hy} L ${hx + tab * 0.85} ${by + 6} Z"
    fill="#e2f4fb" stroke="#a9cfe0" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${hx}" cy="${hy + tab * 0.05}" r="${tab * 0.28}" fill="#f8fafc" stroke="#a9cfe0" stroke-width="2.5"/>
  <!-- ตัวกล่องพลาสติกใส -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="9" fill="url(#case)" stroke="#a9cfe0" stroke-width="3"/>
  <!-- สันบานพับด้านซ้าย -->
  <rect x="${bx + bw * 0.045}" y="${by + 6}" width="${bw * 0.052}" height="${bh - 12}" rx="4" fill="#ffffff" opacity="0.85"/>
  <line x1="${bx + bw * 0.1}" y1="${by + 6}" x2="${bx + bw * 0.1}" y2="${by + bh - 6}" stroke="#bcdcea" stroke-width="2"/>
  <!-- ปกกระดาษอาร์ตมัน (พื้นที่ลายลูกค้า) -->
  <rect x="${cx0}" y="${cy0}" width="${cw}" height="${ch}" rx="3" fill="${back ? "#eef4f8" : "url(#art)"}"/>
  ${back
      ? `<!-- ปกหลัง: เห็นแผ่น CD อะคริลิคเคลือบโฮโลแกรม + สติ๊กเกอร์ NFC -->
         <circle cx="${cdX}" cy="${cdY}" r="${cdR}" fill="url(#holo)" stroke="#cbd5e1" stroke-width="2"/>
         <circle cx="${cdX}" cy="${cdY}" r="${cdR * 0.62}" fill="none" stroke="#ffffff" stroke-width="${cdR * 0.1}" opacity="0.55"/>
         <circle cx="${cdX}" cy="${cdY}" r="${cdR * 0.17}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
         <g transform="translate(${cx0 + cw * 0.84} ${cy0 + ch * 0.83})">
           <circle r="${ch * 0.13}" fill="#ffffff" stroke="${OK}" stroke-width="3"/>
           ${[0.42, 0.66, 0.9].map((k) => `<path d="M ${-ch * 0.02} ${-ch * 0.13 * k} A ${ch * 0.13 * k} ${ch * 0.13 * k} 0 0 1 ${-ch * 0.02} ${ch * 0.13 * k}" fill="none" stroke="${OK}" stroke-width="3" stroke-linecap="round"/>`).join("")}
         </g>
         <text x="${cx0 + cw / 2}" y="${cy0 + ch * 0.13}" font-family="${TH}" font-size="${s * 0.062}" font-weight="700" text-anchor="middle" fill="#64748b">TRACK LIST</text>
         ${[0.2, 0.26].map((k) => `<line x1="${cx0 + cw * 0.16}" y1="${cy0 + ch * k}" x2="${cx0 + cw * 0.84}" y2="${cy0 + ch * k}" stroke="#cbd5e1" stroke-width="2.5"/>`).join("")}`
      : `<!-- ปกหน้า: ลายลูกค้า (ใช้มาสคอตแทน) + แถบหัวปกแบบอัลบั้ม -->
         <rect x="${cx0}" y="${cy0}" width="${cw}" height="${ch * 0.13}" fill="#ffffff" opacity="0.82"/>
         <text x="${cx0 + cw * 0.08}" y="${cy0 + ch * 0.095}" font-family="${TH}" font-size="${s * 0.055}" font-weight="700" fill="#475569">iDK STUDIO</text>
         ${[0, 1, 2, 3].map((i) => `<rect x="${cx0 + cw * (0.62 + i * 0.08)}" y="${cy0 + ch * 0.038}" width="${cw * 0.05}" height="${cw * 0.05}" fill="${["#67d1e0", "#f8b26a", "#8ad9e6", "#f2748c"][i]}"/>`).join("")}
         <image href="${MASCOT.uri}" x="${cx0 + (cw - mw) / 2}" y="${cy0 + ch * 0.66 - mh}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
         <text x="${cx0 + cw / 2}" y="${cy0 + ch * 0.84}" font-family="${TH}" font-size="${s * 0.058}" font-weight="700" text-anchor="middle" fill="#0e7490">SEA OF LOVE SONG</text>`}
  <!-- ไฮไลต์ผิวพลาสติกใส -->
  <path d="M ${bx + bw * 0.16} ${by + bh - 8} L ${bx + bw * 0.42} ${by + 8}" stroke="#ffffff" stroke-width="${bw * 0.055}" opacity="0.35" stroke-linecap="round"/>`;
};

const svg = () => {
  const gap = 84;
  const leftX = (W - (BOX * 2 + gap)) / 2;
  const rightX = leftX + BOX + gap;
  const topY = 214;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="case" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#f4fbfe"/><stop offset="0.5" stop-color="#e6f4fa"/><stop offset="1" stop-color="#d3e9f3"/>
    </linearGradient>
    <linearGradient id="art" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#dff0fb"/><stop offset="0.6" stop-color="#a9d9f2"/><stop offset="1" stop-color="#f7e3c8"/>
    </linearGradient>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#cfe9f7"/><stop offset="0.3" stop-color="#e7d6f5"/>
      <stop offset="0.6" stop-color="#d5f2e4"/><stop offset="1" stop-color="#f8dfd0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 5.2 × 5.2 ซม.</text>
  <text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">กล่องอัลบั้มทรงจัตุรัส — มีขนาดเดียว วัดรวมหูรูใส่ห่วงแล้ว</text>

  <text x="${leftX + BOX / 2}" y="192" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า · ปกลายของคุณ</text>
  <text x="${rightX + BOX / 2}" y="192" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหลัง · แผ่น CD + NFC</text>

  ${albumBox(leftX, topY, BOX)}
  ${albumBox(rightX, topY, BOX, { back: true })}

  ${dim(leftX, topY + BOX + 34, leftX + BOX, topY + BOX + 34, "5.2 ซม.")}
  ${dim(leftX - 44, topY, leftX - 44, topY + BOX, "5.2 ซม.")}

  <text x="${W / 2}" y="${topY + BOX + 104}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">สองภาพเป็นสเกลเดียวกัน · ความสูง 5.2 ซม. นับรวมหูรูใส่ห่วงด้านบน</text>

  <rect x="${(W - 372) / 2}" y="${702 - 36}" width="372" height="72" rx="36" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3"/>
  <text x="${W / 2}" y="${702 + 17}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${esc(CHOICE)}</text>

  ${pill(W / 2, 778, "แผ่น CD อะคริลิคเคลือบโฮโลแกรม")}

  <text x="${W / 2}" y="830" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ปกหน้า-ปกหลังกระดาษอาร์ตมัน ใส่กรอบอัลบั้มสำเร็จรูป · สกรีน UV | Digital</text>
  <text x="${W / 2}" y="862" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ติดแผ่น NFC แบบสติ๊กเกอร์ที่ปกด้านหลัง — แตะมือถือเปิดเพลง/ลิงก์ได้</text>
</svg>`;
};

const buf = await sharp(Buffer.from(svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE}`); // = ที่ลูกค้าเห็นบนการ์ดจริง (80×80)
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

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
const before = JSON.parse(JSON.stringify(data));

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
// ตั้งชื่อตามเวลา: รันซ้ำแล้วไฟล์สำรองรอบแรก (ก่อนมีกลุ่มขนาด) จะไม่ถูกทับ
const dump = `${OUT}/../before-size-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(dump, JSON.stringify(before, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const options = data.options ?? [];
const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: "ร้านทำขนาดเดียว 5.2 × 5.2 ซม. วัดรวมรูใส่ห่วงแล้ว — ไม่มีค่าบวกเพิ่มตามขนาด",  // note ขึ้นให้ลูกค้าเห็นใต้ชื่อกลุ่ม จึงเขียนเป็นภาษาลูกค้า ไม่อ้างใบสเปค
  choices: [{ name: CHOICE, desc: DESC, imageSrc: url }],
};
const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) options[at] = sizeGroup;      // รันซ้ำ = ทับตัวเดิมที่ตำแหน่งเดิม
else options.unshift(sizeGroup);           // ยังไม่มี = ขึ้นก่อนกลุ่มสีตะขอ
data.options = options;
data.savedAt = new Date().toISOString();   // ให้เว็บติด ?v= ใหม่ กันแคชรูปเก่า

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gb = got.find((o) => o.label === GROUP);
const hook = got.find((o) => o.label === "สีตะขอ C (โซ่ไข่ปลา)");
const hookBefore = (before.options ?? []).find((o) => o.label === "สีตะขอ C (โซ่ไข่ปลา)");
const fails = [
  [got.length === (before.options ?? []).length + (at >= 0 ? 0 : 1), "จำนวนกลุ่มตัวเลือกไม่ตรงที่ตั้งใจ (กลุ่มหาย/งอก)"],
  [got[0]?.label === GROUP, "กลุ่มขนาดไม่ได้อยู่ลำดับแรก"],
  [gb?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gb?.choices?.length === 1 && gb.choices[0].name === CHOICE, "การ์ดขนาดไม่ตรง"],
  [gb?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!gb?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [JSON.stringify(hook) === JSON.stringify(hookBefore), "กลุ่มสีตะขอถูกแก้ไปด้วย"],
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [back.data.priceMin === before.priceMin && back.data.priceMax === before.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด ${CHOICE} + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

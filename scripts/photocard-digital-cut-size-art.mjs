#!/usr/bin/env node
/**
 * ภาพตัวอย่างตัวเลือก "ขนาดตัด → ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต)" ของโฟโต้การ์ด (photocard-digital)
 * [เจ้าของร้านสั่ง 9 ก.ย. 69: เมนูขนาดตัดยังไม่มีภาพ]
 *
 *   node scripts/photocard-digital-cut-size-art.mjs           # วาดลง scripts/assets/photocard-digital/cut-size.jpg (ไม่เขียน DB)
 *   node scripts/photocard-digital-cut-size-art.mjs --write   # อัปขึ้นคลัง products/photocard-digital/cut-size-v1.jpg + ผูก imageSrc
 *
 * สไตล์เดียวกับ photocard-digital-option-art.mjs (พื้นฟ้า #eff6fe · การ์ดขาว · หัวข้อน้ำเงิน · เป็ดจากแผ่น HOW TO PRINT)
 * ซ้าย = 1 เซ็ต 20 ใบ (ตาราง 5×4) · ขวา = ใบเดียวขยาย มีลูกศรบอก 5.5 × 8.5 ซม.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const GROUP = "ขนาดตัด";
const CHOICE = "ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต)";
const REV = "v1";
const OUT = "scripts/assets/photocard-digital";
const DUCK = "scripts/assets/photocard-pvc/duck.png";

const W = 800, H = 800;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const BG = "#eff6fe", BLUE = "#2f7fd4", SUB = "#767d85", LABEL = "#5b6673", EDGE = "#d8e3f2", DIM = "#e0566f";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ตาราง 20 ใบ (5×4) ซ้าย — สัดส่วน 5.5:8.5 */
const MW = 54, MH = 84, MG = 9;
const GX = 56, GY = 96;
const GW = MW * 5 + MG * 4, GH = MH * 4 + MG * 3;
/* ใบขยายขวา */
const BW = 186, BH = 288, BX = 512, BY = 88;

const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const PAL = [["#cfe6ff", "#ffe1ef"], ["#d8f3e4", "#ffeccc"], ["#e6dcff", "#d4f0ff"], ["#ffe4d6", "#fff4c2"]];

let svg = `<defs>${PAL.map(([a, b], i) => grad("g" + i, a, b)).join("")}</defs>`;
// ตาราง 20 ใบ
for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
  const x = GX + c * (MW + MG), y = GY + r * (MH + MG);
  svg += `<rect x="${x + 2}" y="${y + 3}" width="${MW}" height="${MH}" rx="7" fill="#000" opacity="0.06"/>
          <rect x="${x}" y="${y}" width="${MW}" height="${MH}" rx="7" fill="url(#g${(r + c) % 4})" stroke="${EDGE}" stroke-width="1.5"/>`;
}
svg += `<text x="${GX + GW / 2}" y="${GY + GH + 44}" font-family="${TH}" font-size="24" font-weight="600" text-anchor="middle" fill="${LABEL}">1 เซ็ต = 20 ใบ</text>
        <text x="${GX + GW / 2}" y="${GY + GH + 74}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ตัดแยกใบให้เรียบร้อย</text>`;
// ใบขยาย + ลูกศรขนาด
svg += `<rect x="${BX + 5}" y="${BY + 7}" width="${BW}" height="${BH}" rx="14" fill="#000" opacity="0.07"/>
        <rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="14" fill="url(#g0)" stroke="${EDGE}" stroke-width="2"/>`;
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DIM}" stroke-width="3" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
svg += `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${DIM}"/></marker></defs>`;
// กว้าง 5.5 ซม. (บนใบ)
svg += arrow(BX + 4, BY - 22, BX + BW - 4, BY - 22);
svg += `<text x="${BX + BW / 2}" y="${BY - 34}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${DIM}">5.5 ซม.</text>`;
// สูง 8.5 ซม. (ขวาใบ)
svg += arrow(BX + BW + 26, BY + 4, BX + BW + 26, BY + BH - 4);
svg += `<text transform="translate(${BX + BW + 56} ${BY + BH / 2}) rotate(90)" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${DIM}">8.5 ซม.</text>`;
svg += `<text x="${BX + BW / 2}" y="${BY + BH + 40}" font-family="${TH}" font-size="24" font-weight="600" text-anchor="middle" fill="${LABEL}">ขนาดต่อใบ</text>
        <text x="${BX + BW / 2}" y="${BY + BH + 70}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">เท่าโฟโต้การ์ดมาตรฐาน</text>`;
// หัวข้อ + คำอธิบาย
svg += `<text x="${W / 2}" y="616" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${BLUE}">ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม.</text>
        <text x="${W / 2}" y="666" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ขายเป็นเซ็ต เซ็ตละ 20 ใบ ขนาดเท่าโฟโต้การ์ดมาตรฐาน</text>
        <text x="${W / 2}" y="704" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ตัดแยกใบให้พร้อมใช้ ฟรีไดคัทมุมมน</text>`;

// เป็ดกลางใบขยาย
const dh = Math.round(BH * 0.5);
const duckBuf = await sharp(readFileSync(DUCK)).resize({ height: dh }).toBuffer();
const { width: dw } = await sharp(duckBuf).metadata();
const buf = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${BG}"/>${svg}</svg>`))
  .composite([{ input: duckBuf, left: Math.round(BX + (BW - dw) / 2), top: Math.round(BY + (BH - dh) / 2) }])
  .jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/cut-size.jpg`, buf);
console.log(`✓ ${OUT}/cut-size.jpg  ${Math.round(buf.length / 1024)} KB`);
if (!WRITE) { console.log("(ยังไม่เขียน DB — ใส่ --write)"); process.exit(0); }

/* ── อัป + ผูกกับตัวเลือก ── */
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const path = `products/${ID}/cut-size-${REV}.jpg`;
const src = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/${path}`;
const { error: upErr } = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) throw upErr;
console.log(`⬆️  ${path}`);
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = row.data;
const g = d.options.find((o) => o.label === GROUP);
if (!g) throw new Error(`ไม่เจอกลุ่ม ${GROUP}`);
const c = g.choices.find((x) => x.name === CHOICE);
if (!c) throw new Error(`ไม่เจอตัวเลือก ${CHOICE} (มี: ${g.choices.map((x) => x.name).join(" | ")})`);
c.imageSrc = src;
d.savedAt = new Date().toISOString();
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bc = back.data.options.find((o) => o.label === GROUP).choices.find((x) => x.name === CHOICE);
const res = await fetch(bc.imageSrc);
console.log(`${res.ok && bc.imageSrc === src ? "✅" : "❌"} อ่านกลับ imageSrc=${bc.imageSrc} HTTP ${res.status}`);

#!/usr/bin/env node
/**
 * ปลั๊กไฟ (otheracrylicproducts3-1) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/power-strip-size-option.mjs            (วาดภาพลง .cache/power-strip/upload ดูก่อน)
 *   node scripts/power-strip-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค (AdminBuddy/academy-assets/gifts/plug.jpg):
 * ปลั๊กไฟมี "ขนาดเดียว" — รุ่น USB-T303U-GNTHT-3M
 * 3 ช่องเสียบ (แยกสวิตช์ควบคุม) + ช่อง USB 2 ช่อง · สายยาว 3 เมตร · หัวเสียบปลั๊ก 3 ขา
 * ทองแดงทั้งหมดนำไฟฟ้าได้ดี · มีเครื่องหมาย มอก. 2432-2555 · มีที่แขวน 2 ที่ · พิมพ์ลายระบบ UV
 *
 * เพิ่มกลุ่ม "ขนาด" ตัวเลือกเดียว ไม่บวกราคา พร้อมภาพวาดใหม่ (900×900)
 * โชว์รางปลั๊กมองจากด้านบน 3 ช่อง+สวิตช์ฟ้า+USB 2 ช่อง สายไฟถึงหัวเสียบ 3 ขา + ป้ายสายยาว 3 ม.
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 300);

const PRODUCT_ID = "otheracrylicproducts3-1";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/power-strip/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "3 ช่องเสียบ + USB 2 ช่อง · สายยาว 3 เมตร";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ golf-umbrella-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const lx = (x1 + x2) / 2;
  const ly = y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ช่องเสียบ 3 ขา (2 ขาแบน + กราวด์กลม) — มองจากด้านบน */
const socket = (cx, cy) => `
  <rect x="${cx - 44}" y="${cy - 40}" width="88" height="80" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2.5"/>
  <circle cx="${cx}" cy="${cy - 18}" r="6.5" fill="#334155"/>
  <rect x="${cx - 26}" y="${cy + 4}" width="9" height="22" rx="3" fill="#334155" transform="rotate(-14 ${cx - 21} ${cy + 15})"/>
  <rect x="${cx + 17}" y="${cy + 4}" width="9" height="22" rx="3" fill="#334155" transform="rotate(14 ${cx + 21} ${cy + 15})"/>`;

/** สวิตช์เปิด-ปิดสีฟ้า แยกคุมรายช่อง */
const switchBtn = (cx, cy) => `
  <rect x="${cx - 22}" y="${cy - 30}" width="44" height="60" rx="14" fill="#7dd3fc" stroke="#0369a1" stroke-width="2.5"/>
  <rect x="${cx - 22}" y="${cy - 30}" width="44" height="30" rx="14" fill="#bae6fd"/>
  <circle cx="${cx}" cy="${cy + 12}" r="4.5" fill="#0369a1"/>`;

/**
 * ภาพ "ขนาดปลั๊กไฟ" — รางปลั๊กแนวนอนมองด้านบน 3 ช่อง (แยกสวิตช์) + USB 2 ช่อง
 * สายไฟโค้งลงไปหัวเสียบ 3 ขา + ลูกศรวัดสายยาว 3 เมตร
 */
function sizeArt() {
  const bx = 130; // ขอบซ้ายราง
  const bw = 640; // ความกว้างราง
  const by = 236; // ขอบบนราง
  const bh = 210; // ความสูงราง
  const midY = by + bh / 2;
  const sockXs = [bx + 120, bx + 250, bx + 380]; // 3 ช่องเสียบ
  const usbX = bx + bw - 130; // โซน USB

  /** มาสคอต = ลายลูกค้าพิมพ์ UV บนราง (ช่องว่างซ้ายก่อนถึงช่องเสียบแรก) */
  const mw = 58;
  const mh = mw / MASCOT.ratio;

  /** สายไฟจากท้ายรางขวา โค้งลงล่างไปหัวเสียบ 3 ขาซ้ายล่าง */
  const cordY = 640;
  const plugX = 250;
  const cord = `M ${bx + bw - 24} ${by + bh} C ${bx + bw + 60} ${cordY - 60}, ${bx + bw - 120} ${cordY}, ${bx + bw / 2} ${cordY}
    S ${plugX + 130} ${cordY - 46}, ${plugX + 92} ${cordY - 8}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดปลั๊กไฟ — ขนาดเดียว</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">3 ช่องเสียบแยกสวิตช์ + USB 2 ช่อง · สายยาว 3 เมตร</text>
  <text x="${W / 2}" y="162" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">รุ่น USB-T303U-GNTHT-3M</text>

  <!-- รางปลั๊ก มองจากด้านบน -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="30" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
  <rect x="${bx + 10}" y="${by + 10}" width="${bw - 20}" height="${bh - 20}" rx="24" fill="#fdfdfd" stroke="#e2e8f0" stroke-width="2"/>

  <!-- ที่แขวน 2 ที่ (หัว-ท้ายราง) -->
  <circle cx="${bx + 30}" cy="${by + 28}" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2.5"/>
  <circle cx="${bx + bw - 30}" cy="${by + 28}" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2.5"/>

  <!-- ลายลูกค้า (มาสคอตแทน) พิมพ์ UV บนราง -->
  <image href="${MASCOT.uri}" x="${bx + 18}" y="${midY - mh / 2 + 10}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>

  <!-- 3 ช่องเสียบ + สวิตช์ฟ้าแยกคุมรายช่อง -->
  ${sockXs.map((x) => socket(x, midY + 26) + switchBtn(x, by + 44)).join("")}

  <!-- โซน USB 2 ช่อง -->
  <rect x="${usbX - 52}" y="${midY - 58}" width="104" height="116" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2.5"/>
  <rect x="${usbX - 30}" y="${midY - 36}" width="60" height="22" rx="4" fill="#0f172a"/>
  <rect x="${usbX - 22}" y="${midY - 31}" width="44" height="12" rx="2" fill="#f1f5f9"/>
  <rect x="${usbX - 30}" y="${midY + 12}" width="60" height="22" rx="4" fill="#0f172a"/>
  <rect x="${usbX - 22}" y="${midY + 17}" width="44" height="12" rx="2" fill="#f1f5f9"/>
  <text x="${usbX}" y="${midY - 66}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${SUB}">USB × 2</text>

  <!-- สายไฟ + หัวเสียบ 3 ขา -->
  <path d="${cord}" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round"/>
  <g transform="rotate(-18 ${plugX + 40} ${cordY - 20})">
    <rect x="${plugX}" y="${cordY - 52}" width="96" height="72" rx="18" fill="#1e293b"/>
    <rect x="${plugX - 34}" y="${cordY - 40}" width="38" height="10" rx="4" fill="#b45309"/>
    <rect x="${plugX - 34}" y="${cordY - 21}" width="38" height="10" rx="4" fill="#b45309"/>
    <rect x="${plugX - 34}" y="${cordY - 2}" width="38" height="10" rx="4" fill="#b45309"/>
  </g>
  <text x="${plugX + 52}" y="${cordY + 56}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${SUB}">หัวเสียบ 3 ขา</text>

  <!-- ลูกศรวัดสายยาว 3 เมตร (แนวสายไฟช่วงล่าง) -->
  ${dim(plugX + 130, cordY + 44, bx + bw - 40, cordY + 44, "สายยาว 3 เมตร")}

  <!-- จุดเด่นวัสดุ -->
  <rect x="${W / 2 - 330}" y="${H - 158}" width="660" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="${H - 127}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">สวิตช์แยกควบคุมรายช่อง · ทองแดงทั้งหมด · มอก. 2432-2555</text>
  <text x="${W / 2}" y="${H - 76}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งระบบ UV · มีที่แขวน 2 ที่</text>
  <text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ไม่ทำให้เกิดประกายไฟ ปลอดภัยต่อการใช้งาน</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-plug-3ch-usb2-3m-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — รางปลั๊ก 3 ช่อง+USB 2 + หัวเสียบ 3 ขา + สายยาว 3 ม.`);

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
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้าสุด
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotSize = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.[0];
if (gotSize?.name !== SIZE_CHOICE || gotSize?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", gotSize); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) อ่านกลับตรง · savedAt =`, back.data.savedAt);

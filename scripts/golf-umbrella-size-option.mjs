#!/usr/bin/env node
/**
 * ร่มกอล์ฟ (golf-umbrella) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/golf-umbrella-size-option.mjs            (วาดภาพลง .cache/golf-umbrella/upload ดูก่อน)
 *   node scripts/golf-umbrella-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค (AdminBuddy/academy-assets/fabric/umbrella.jpg):
 * ร่มกอล์ฟมี "ขนาดเดียว" — ก้านยาว 93 ซม. · รัศมีตอนกางร่ม 62 ซม. · คลาดเคลื่อน 2-5 ซม.
 * โครงไฟเบอร์กลาส · ด้ามพลาสติกหุ้มยาง · ปุ่มกดกางอัตโนมัติ · ผ้ากัน UV ด้านใน
 *
 * เพิ่มกลุ่ม "ขนาด" ตัวเลือกเดียว ไม่บวกราคา พร้อมภาพวาดใหม่ (900×900)
 * โชว์ร่มกางด้านข้าง + ลูกศรวัดรัศมี 62 / ก้าน 93 ซม.
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 300);

const PRODUCT_ID = "golf-umbrella";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/golf-umbrella/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "รัศมีกางร่ม 62 ซม. · ก้านยาว 93 ซม.";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 + 24 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? 0 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "start" : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดร่มกอล์ฟ" — ร่มกางมองด้านข้าง ผ้าสลับสีแบบงานจริง 4 แฉก
 * ลูกศรวัดรัศมีตอนกางร่ม 62 ซม. (กึ่งกลาง→ขอบผ้า) + ก้านยาว 93 ซม. (ปลายยอด→สุดด้าม)
 */
function sizeArt() {
  /** 1 ซม. = 4.6 px → ก้าน 93 = 428 px · รัศมี 62 = 285 px วางกลางการ์ดพอดี */
  const CM = 4.6;
  const R = 62 * CM; // รัศมีกางร่ม
  const L = 93 * CM; // ก้านยาว (ปลายยอดถึงสุดด้าม)
  const cx = W / 2 - 40; // เลื่อนซ้ายนิด เผื่อที่ลูกศรวัดก้านด้านขวา
  const tipY = 196; // ปลายยอดร่ม
  const apexY = tipY + 44; // จุดยอดผ้าร่ม
  const edgeY = apexY + 118; // แนวขอบผ้าร่มซ้าย-ขวา
  const botY = tipY + L; // สุดปลายด้าม
  const lx = cx - R;
  const rx = cx + R;

  /** ผ้าร่ม 4 แฉก (มองด้านข้างเห็น 4 ช่อง) — สีสดแบบรูปงานจริง
   *  ซี่ร่มโค้งแบบโดม: ออกจากยอดแนวราบ แล้วดิ่งลงหาปลายซี่ · ชายผ้าหยักขึ้นระหว่างซี่ */
  const panels = ["#ef4444", "#3b82f6", "#f97316", "#22c55e"];
  const xs = [lx, cx - R * 0.45, cx, cx + R * 0.45, rx];
  const ys = [edgeY, edgeY - 24, edgeY - 30, edgeY - 24, edgeY];
  /** จุดคุมโค้งซี่: ใกล้ยอดแนวนอน (dy น้อย) → ปลายซี่ดิ่ง = ทรงโดม */
  const ribC = (i) => [cx + (xs[i] - cx) * 0.6, apexY + (ys[i] - apexY) * 0.15];
  let canopy = "";
  for (let i = 0; i < 4; i++) {
    const [c1x, c1y] = ribC(i);
    const [c2x, c2y] = ribC(i + 1);
    canopy += `<path d="M ${cx} ${apexY} Q ${c1x} ${c1y} ${xs[i]} ${ys[i]}
        Q ${(xs[i] + xs[i + 1]) / 2} ${(ys[i] + ys[i + 1]) / 2 - 18} ${xs[i + 1]} ${ys[i + 1]}
        Q ${c2x} ${c2y} ${cx} ${apexY} Z"
      fill="${panels[i]}" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>`;
  }

  /** มาสคอตประกอบมุมภาพ — ยืนข้างก้านร่ม ไม่ทับตัวร่ม/ลูกศรวัด */
  const mw = 132;
  const mh = mw / MASCOT.ratio;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดร่มกอล์ฟ — ขนาดเดียว</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">รัศมีตอนกางร่ม 62 ซม. · ก้านยาว 93 ซม.</text>

  <!-- ปลายยอด -->
  <rect x="${cx - 5}" y="${tipY}" width="10" height="${apexY - tipY + 6}" rx="4" fill="#1e293b"/>
  <!-- ผ้าร่ม 4 แฉก -->
  ${canopy}
  <!-- มาสคอตยืนข้างก้านร่ม -->
  <image href="${MASCOT.uri}" x="${cx + 74}" y="${botY - mh - 4}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>

  <!-- ก้านร่ม + ด้ามหุ้มยาง -->
  <line x1="${cx}" y1="${edgeY - 30}" x2="${cx}" y2="${botY - 74}" stroke="#334155" stroke-width="9" stroke-linecap="round"/>
  <!-- ปุ่มกดกางอัตโนมัติ -->
  <circle cx="${cx}" cy="${botY - 96}" r="8" fill="#0891b2" stroke="#0f172a" stroke-width="2"/>
  <rect x="${cx - 13}" y="${botY - 78}" width="26" height="78" rx="12" fill="#1e293b"/>

  <!-- ลูกศรวัดรัศมีกางร่ม: กึ่งกลาง → ขอบผ้าขวา -->
  ${dim(cx, edgeY + 34, rx, edgeY + 34, "รัศมีกางร่ม 62 ซม.")}
  <line x1="${cx}" y1="${edgeY - 30}" x2="${cx}" y2="${edgeY + 42}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="4 5"/>
  <line x1="${rx}" y1="${edgeY + 4}" x2="${rx}" y2="${edgeY + 42}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="4 5"/>

  <!-- ลูกศรวัดก้านยาว: ปลายยอด → สุดด้าม -->
  ${dim(rx + 64, tipY, rx + 64, botY, "ก้านยาว")}
  <text x="${rx + 88}" y="${(tipY + botY) / 2 + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="start" fill="${SUB}">93 ซม.</text>
  <line x1="${cx + 8}" y1="${tipY}" x2="${rx + 72}" y2="${tipY}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="4 5"/>
  <line x1="${cx + 16}" y1="${botY}" x2="${rx + 72}" y2="${botY}" stroke="${SUB}" stroke-width="1.5" stroke-dasharray="4 5"/>

  <!-- จุดเด่นวัสดุ -->
  <rect x="${W / 2 - 330}" y="${H - 158}" width="660" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="${H - 127}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">โครงไฟเบอร์กลาส · ปุ่มกดกางอัตโนมัติ · ผ้ากัน UV ด้านใน</text>
  <text x="${W / 2}" y="${H - 76}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ผ้า Taffeta 190T กันน้ำ · พิมพ์ลายตามสั่งระบบซับลิเมชั่น</text>
  <text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">*ขนาดอาจมีความคลาดเคลื่อน 2-5 ซม.</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-golf-93x62-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ร่มกาง + ลูกศรวัดรัศมี 62 / ก้าน 93`);

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

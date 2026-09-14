#!/usr/bin/env node
/**
 * ภาพตัวอย่างประจำตัวเลือกกลุ่ม "ชนิดกระดาษ" ของ "กระดาษอาร์ตมัน | PET" (paper-art-pet)
 * [เจ้าของร้านสั่ง 14 ก.ย. 69 — เมนูชนิดกระดาษยังไม่มีภาพ]
 * กลุ่ม "ขนาดตัด" อยู่ที่ scripts/cut-size-option-art.mjs (ภาพชุดกลางทั้งร้าน)
 *
 *   node scripts/paper-art-pet-option-art.mjs                    # วาดลง .cache/paper-art-pet/ ดูก่อน
 *   node scripts/paper-art-pet-option-art.mjs --write            # + อัปคลัง + ผูก imageSrc + อ่านกลับเทียบ
 * *
 * ดีไซน์เดียวกับ scripts/paper-print-sides-option-art.mjs ของสินค้าตัวนี้เอง
 *   (จัตุรัส 900×900 · พื้น #f8fafc · การ์ดขาวขอบมน · หัวข้อเข้ม + บรรทัดรองเทา · ไล่สีฟ้า-ฟ้าอมเขียว)
 *   เมนูเลื่อนโชว์ภาพของตัวที่เลือกอยู่ในกรอบจัตุรัส 44px ข้างเมนู + กดแล้วเด้งไปแกลเลอรีภาพใหญ่
 *   → จุดต่างต้องอยู่กลางภาพและใหญ่พอจะอ่านออกที่ 44px
 *
 * เลขแกรมตัวใหญ่กลางภาพ + แถบเทียบความหนาทั้ง 6 ชนิด (ตัวที่เลือกไฮไลต์)
 *
 * ⚠️ ไม่ใส่ราคาลงในภาพ — ตารางราคาแก้กันคนละที่
 * ⚠️ CDN แคชตามพาธ — แก้ภาพเมื่อไหร่ต้องขึ้น VER ใหม่
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const VER = "v1";
const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const ID = "paper-art-pet";
const EXPECT_NAME = /กระดาษอาร์ตมัน/;
const OUT = ".cache/paper-art-pet";

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", EDGE = "#cbd5e1", FAINT = "#e2e8f0";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#0284c7"/><stop offset="1" stop-color="#0891b2"/>
    </linearGradient>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const head = (title, sub) => `
  <text x="${W / 2}" y="112" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(title)}</text>
  <text x="${W / 2}" y="156" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>`;

const foot = (t) => `<text x="${W / 2}" y="${H - 56}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`;

/* ════════════════ 1. ชนิดกระดาษ ════════════════ */

const PAPER_GROUP = "ชนิดกระดาษ";
/** เรียงตามเมนูจริง · gsm ใช้ทั้งเลขกลางภาพและความสูงแท่งเทียบความหนา */
const PAPERS = [
  { name: "กระดาษอาร์ตมัน 130 แกรม", slug: "paper-130", gsm: 130, big: "130", short: "130",
    sub: "กระดาษอาร์ตมันนำเข้าจากเกาหลี ผิวเงาในตัว", use: "บางที่สุด · ใบปลิว แผ่นพับ โปสเตอร์" },
  { name: "กระดาษอาร์ตมัน 150 แกรม", slug: "paper-150", gsm: 150, big: "150", short: "150",
    sub: "กระดาษอาร์ตมันนำเข้าจากเกาหลี ผิวเงาในตัว", use: "บาง อยู่ตัวขึ้น · ใบปลิว โปสเตอร์" },
  { name: "กระดาษอาร์ตมัน 300 แกรม", slug: "paper-300", gsm: 300, big: "300", short: "300",
    sub: "กระดาษอาร์ตมันนำเข้าจากเกาหลี ผิวเงาในตัว", use: "หนามาตรฐาน · การ์ด โปสการ์ด" },
  { name: "กระดาษอาร์ตมัน 350 แกรม", slug: "paper-350", gsm: 350, big: "350", short: "350",
    sub: "กระดาษอาร์ตมันนำเข้าจากเกาหลี ผิวเงาในตัว", use: "หนา แข็งแรง · การ์ดแข็ง ภาพตกแต่ง" },
  { name: "กระดาษอาร์ตมัน 400 แกรม", slug: "paper-400", gsm: 400, big: "400", short: "400",
    sub: "กระดาษอาร์ตมันนำเข้าจากเกาหลี ผิวเงาในตัว", use: "หนาที่สุด · การ์ดแข็งพิเศษ" },
  { name: "พลาสติก PET 250 แกรม", slug: "paper-pet", gsm: 250, big: "PET", short: "PET", pet: true,
    sub: "แผ่นพลาสติก PET เลือกสีขาว / สีใส", use: "ไม่ฉีกขาด โดนน้ำได้ · ไม่ต้องเคลือบ" },
];

function paperArt(p) {
  const cx = W / 2;
  /* แถบเทียบความหนา — แท่งเรียงตามลำดับเมนู สูงตามแกรม ตัวที่เลือกไฮไลต์ */
  const BASE = 734, BW = 96, GAP = 24;
  const n = PAPERS.length;
  const x0 = cx - (BW * n + GAP * (n - 1)) / 2;
  const hOf = (g) => 16 + Math.round((g / 400) * 62);
  const bars = PAPERS.map((q, i) => {
    const on = q.name === p.name;
    const bh = hOf(q.gsm), x = x0 + i * (BW + GAP);
    return `<rect x="${x}" y="${BASE - bh}" width="${BW}" height="${bh}" rx="7"
              fill="${on ? "url(#ink)" : FAINT}" ${on ? `stroke="#0369a1" stroke-width="2"` : ""}/>
            <text x="${x + BW / 2}" y="${BASE + 33}" font-family="${TH}" font-size="21"
              font-weight="${on ? 700 : 400}" text-anchor="middle" fill="${on ? "#0369a1" : "#94a3b8"}">${esc(q.short)}</text>`;
  }).join("");

  const bigSize = p.pet ? 150 : 180;
  return frame(`
  ${head(p.name, p.sub)}
  <!-- แผ่นกระดาษซ้อนกันจาง ๆ หลังเลขแกรม — ให้รู้ว่าพูดถึงเนื้อแผ่น ไม่ใช่ตัวเลขลอย -->
  <rect x="${cx - 227}" y="${224}" width="430" height="290" rx="16" fill="#f1f5f9" stroke="${FAINT}" stroke-width="2"/>
  <rect x="${cx - 215}" y="${212}" width="430" height="290" rx="16" fill="#ffffff" stroke="${EDGE}" stroke-width="2"/>
  <text x="${cx + 12}" y="${p.pet ? 390 : 405}" font-family="${TH}" font-size="${bigSize}" font-weight="800"
        text-anchor="middle" fill="url(#ink)" letter-spacing="-4">${esc(p.big)}</text>
  <text x="${cx + 12}" y="${p.pet ? 452 : 468}" font-family="${TH}" font-size="34" font-weight="700"
        text-anchor="middle" fill="${SUB}">${p.pet ? "250 แกรม" : "แกรม"}</text>

  <text x="${cx}" y="562" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(p.use)}</text>
  <line x1="150" y1="600" x2="${W - 150}" y2="600" stroke="${FAINT}" stroke-width="2"/>
  <text x="${cx}" y="641" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เทียบความหนาทั้ง 6 ชนิดในหน้านี้</text>
  ${bars}
  ${foot("ยิ่งแกรมสูง แผ่นยิ่งหนาและแข็งขึ้น")}`);
}

/* กลุ่ม "ขนาดตัด" ย้ายไปสคริปต์กลางแล้ว → scripts/cut-size-option-art.mjs
   (ภาพชุดกลางใช้ร่วมกับสติ๊กเกอร์ทุกตัว+แบนเนอร์ เก็บที่ products/shared/cut-size/)
   ⚠️ ห้ามเอาโค้ดวาดขนาดตัดกลับมาไว้ที่นี่ ไม่งั้นรันแล้วจะทับ imageSrc ของชุดกลาง */

/* ════════════════ วาด ════════════════ */

const JOBS = [
  { group: PAPER_GROUP, list: PAPERS, draw: paperArt },
].filter((j) => !ONLY || j.group === ONLY);
if (!JOBS.length) { console.error(`--only=${ONLY} ไม่ตรงกลุ่มไหน (มี: ${PAPER_GROUP})`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
for (const job of JOBS) {
  for (const item of job.list) {
    const file = `${item.slug}-${VER}.jpg`;
    const buf = await sharp(Buffer.from(job.draw(item))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    writeFileSync(`${OUT}/${file}`, buf);
    await sharp(buf).resize(44, 44).toFile(`${OUT}/_thumb-${file}`); // กรอบจริงข้างเมนูเลื่อน 44px
    item.file = file; item.buf = buf;
    console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${item.name}`);
  }
}
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

/* ════════════════ อัป + ผูก + อ่านกลับ ════════════════ */
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
if (!EXPECT_NAME.test(row.name)) { console.error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`); process.exit(1); }

for (const job of JOBS) {
  for (const item of job.list) {
    const key = `products/${ID}/${item.file}`;
    const { error: upErr } = await sb.storage.from("product-images").upload(key, item.buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
    item.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
    console.log("⬆️ ", item.url);
  }
}

const d = row.data;
for (const job of JOBS) {
  const g = (d.options ?? []).find((o) => o.label === job.group);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${job.group}"`); process.exit(1); }
  for (const c of g.choices) {
    const item = job.list.find((x) => x.name === c.name);
    if (!item) { console.error(`${job.group}: มีตัวเลือกที่สคริปต์ไม่ได้วาด — "${c.name}"`); process.exit(1); }
    c.imageSrc = item.url;
  }
}
d.savedAt = new Date().toISOString(); // กันแคชรูปเก่า (?v=savedAt)
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
for (const job of JOBS) {
  const g = back.data.options.find((o) => o.label === job.group);
  for (const item of job.list) {
    const c = g.choices.find((x) => x.name === item.name);
    if (c?.imageSrc !== item.url) { console.error("❌ อ่านกลับไม่ตรง", item.name, c?.imageSrc); process.exit(1); }
    const res = await fetch(item.url, { method: "HEAD" });
    if (res.status !== 200) { console.error(`❌ เปิดไฟล์ไม่ได้ ${item.url} HTTP ${res.status}`); process.exit(1); }
  }
  console.log(`✅ ${job.group} — ผูกรูปครบ ${g.choices.length} ตัวเลือก`);
}

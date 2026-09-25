/**
 * แก้วมัค 11 ออนซ์ (mug-11oz) — เพิ่มกลุ่ม "ตำแหน่งสกรีน" ให้ลูกค้าเลือกเอง
 *
 *   npx tsx scripts/mug-screen-position.mts            # วาดการ์ดลง .cache/mug-11oz/position ดูก่อน (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/mug-screen-position.mts --write    # อัปรูป + เขียนกลุ่มลง Supabase + อ่านกลับเทียบ
 *
 * ต้นตอ (พนักงานแจ้ง 25 ก.ย. 69): "งานแก้วมัคต้องเพิ่มตำแหน่งที่ต้องการสกรีนให้ลูกค้าเลือกด้วย"
 * เดิมสินค้ามีกลุ่มเดียวคือ "ประเภท" (ขาวเงา/ใส/ขาวขุ่น) ลูกค้าบอกไม่ได้ว่าอยากให้ลายอยู่ฝั่งไหนของหูจับ
 * ทีมผลิตต้องทักถามทุกใบ → เพิ่มกลุ่มการ์ด 5 ตัวเลือก: ด้านหน้า (ตรงข้ามหูจับ) · หูจับด้านขวา · หูจับด้านซ้าย · สกรีน 2 ด้าน · รอบแก้ว
 * (รอบแรก 4 ตัว · เจ้าของร้านสั่งเพิ่ม "ด้านหน้า" รอบสอง 25 ก.ย. 69 — สคริปต์เขียนทับกลุ่มเดิมให้เอง)
 * ค่าที่เลือกติดไปตะกร้า/ออเดอร์/ใบงานทางปกติ (selections["ตำแหน่งสกรีน"])
 *
 * ⚠️ "ประเภท" เป็นแกนตารางราคา (driverLabels) — สคริปต์นี้ไม่แตะชื่อกลุ่ม/ตัวเลือก/pricing เลย
 *    กลุ่มใหม่ไม่มี extra = ราคาไม่ขยับ (ร้านยังไม่ได้บอกว่าคิดเพิ่ม ถ้าจะคิดค่อยเติม extra ในหน้าแก้ไข)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขึ้น VER ใหม่ ([[iducky-image-cache-bust]])
 * รันซ้ำได้: มีกลุ่มครบ (ชื่อ/ลำดับ/desc/รูป) แล้วไม่เขียนซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "mug-11oz";
const VER = "v1";
const OUT = `.cache/${ID}/position`;
mkdirSync(OUT, { recursive: true });

const G_TYPE = "ประเภท";
const G_POS = "ตำแหน่งสกรีน";
const SECTION = "2. ตำแหน่งสกรีน";
const NOTE =
  "ตำแหน่งนับตอนมองลายตรง ๆ ว่าหูจับอยู่ฝั่งไหน · งานทรานเฟอร์อาจเคลื่อน/เอียงเล็กน้อยตามข้อควรทราบ · มีรายละเอียดเพิ่มบอกได้ในช่องหมายเหตุตอนสั่ง";

/** ตัวเลือก (ตัวแรก = ค่าเริ่มต้น) */
const CHOICES: { name: string; file: string; desc: string }[] = [
  { name: "ด้านหน้า (ตรงข้ามหูจับ)", file: "pos-front", desc: "ลายอยู่กลางฝั่งตรงข้ามหูจับ — หันหูเข้าหาตัวแล้วเห็นลายเต็ม ๆ" },
  { name: "หูจับด้านขวา", file: "pos-handle-right", desc: "มองลายตรง ๆ หูจับอยู่ขวามือ — ถือมือขวาแล้วลายหันเข้าหาตัวเอง" },
  { name: "หูจับด้านซ้าย", file: "pos-handle-left", desc: "มองลายตรง ๆ หูจับอยู่ซ้ายมือ — ถือมือขวาแล้วลายหันออกให้คนอื่นเห็น" },
  { name: "สกรีน 2 ด้าน", file: "pos-both", desc: "ลายทั้งสองฝั่งของหูจับ — ลายเดียวกันหรือคนละลายก็ได้ (ระบุในหมายเหตุ)" },
  { name: "รอบแก้ว", file: "pos-wrap", desc: "ลายต่อเนื่องรอบตัวแก้ว เว้นช่วงหูจับ — ไม่สามารถสกรีนเต็มใบชิดขอบได้" },
];

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน (เหมือน mini-standee-option-art) ─────────
const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const MUG_EDGE = "#c7d2de";
const { uri: DUCK, ratio: DUCK_R } = await mascotDataUri("heart", 420);

const card = (title: string, subtitle: string, body: string, note = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="mug" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#eef2f6"/><stop offset="0.18" stop-color="#ffffff"/>
      <stop offset="0.82" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e9ef"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#bfe6f0"/><stop offset="0.5" stop-color="#e6f7fb"/><stop offset="1" stop-color="#bfe6f0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  ${subtitle ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>` : ""}
  ${body}
  ${note ? `<text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note}</text>` : ""}
</svg>`;

const tag = (cx: number, y: number, text: string, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

/**
 * แก้วมัคมองตรง — ตัวแก้วทรงกระบอก + หูจับซ้าย/ขวา
 * print: "none" | "art" (ลายเป็ดกลางตัว) | "wrap" (แถบลายเต็มความกว้าง เว้นช่วงหู) · s = สเกล (1 = ใหญ่ใบเดียว)
 */
function mug(cx: number, cy: number, handle: "left" | "right" | "back", print: "none" | "art" | "wrap", s = 1, label = ""): string {
  const bw = 300 * s;
  const bh = 360 * s;
  const x = cx - bw / 2;
  const y = cy - bh / 2;
  const ry = 22 * s; // ความรีของปากแก้ว
  const hs = handle === "left" ? -1 : 1;
  const hx = handle === "left" ? x : x + bw; // จุดที่หูออกจากตัวแก้ว
  const hy1 = y + 90 * s;
  const hy2 = y + 250 * s;
  // "back" = หูอยู่ด้านหลัง มองตรงเห็นแค่ขอบหูโผล่บาง ๆ ข้างตัวแก้ว
  const hr = (handle === "back" ? 22 : 78) * s; // ยื่นออกไปกว้างแค่ไหน
  const handlePath = `M ${hx} ${hy1} C ${hx + hs * hr * 1.35} ${hy1 - 10 * s}, ${hx + hs * hr * 1.35} ${hy2 + 10 * s}, ${hx} ${hy2}`;
  let art = "";
  if (print === "art") {
    const ah = 210 * s;
    const aw = ah * DUCK_R;
    art = `<image href="${DUCK}" x="${cx - aw / 2}" y="${y + 80 * s}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
  } else if (print === "wrap") {
    const by = y + 48 * s;
    const bhh = bh - 96 * s;
    const ah = 190 * s;
    const aw = ah * DUCK_R;
    art = `
    <rect x="${x + 4}" y="${by}" width="${bw - 8}" height="${bhh}" fill="url(#band)"/>
    <image href="${DUCK}" x="${cx - aw / 2}" y="${by + (bhh - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x + 22 * s}" y="${by + bhh / 2 + 10 * s}" font-family="${TH}" font-size="${34 * s}" fill="#0e7490" opacity="0.7">‹</text>
    <text x="${x + bw - 40 * s}" y="${by + bhh / 2 + 10 * s}" font-family="${TH}" font-size="${34 * s}" fill="#0e7490" opacity="0.7">›</text>`;
  }
  return `
  <g>
    <!-- หูจับ (วาดก่อนตัวแก้วให้ตัวแก้วทับโคนหู) -->
    <path d="${handlePath}" fill="none" stroke="${MUG_EDGE}" stroke-width="${52 * s}" stroke-linecap="round"/>
    <path d="${handlePath}" fill="none" stroke="#ffffff" stroke-width="${40 * s}" stroke-linecap="round"/>
    <!-- ตัวแก้ว -->
    <path d="M ${x} ${y + ry} L ${x} ${y + bh - 28 * s} Q ${x} ${y + bh} ${x + 28 * s} ${y + bh} L ${x + bw - 28 * s} ${y + bh} Q ${x + bw} ${y + bh} ${x + bw} ${y + bh - 28 * s} L ${x + bw} ${y + ry} Z"
      fill="url(#mug)" stroke="${MUG_EDGE}" stroke-width="3"/>
    ${art}
    <!-- ปากแก้ว -->
    <ellipse cx="${cx}" cy="${y + ry}" rx="${bw / 2}" ry="${ry}" fill="#f1f5f9" stroke="${MUG_EDGE}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${y + ry}" rx="${bw / 2 - 14 * s}" ry="${ry - 9 * s}" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    ${label ? tag(cx, y + bh + 28 * s, label) : ""}
  </g>`;
}

/** ป้ายชี้หูจับ */
const handleHint = (x: number, y: number, text: string) =>
  `<text x="${x}" y="${y}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;

const SVGS: Record<string, string> = {
  "pos-front": card(
    "ด้านหน้า (ตรงข้ามหูจับ)",
    "หูจับอยู่ด้านหลัง ลายอยู่กลางด้านหน้า",
    mug(450, 470, "back", "art", 1, "ลายอยู่ด้านหน้า") + handleHint(660, 300, "หูจับอยู่ด้านหลัง"),
    "หันหูเข้าหาตัว — เห็นลายเต็ม ๆ ตรงหน้า"
  ),
  "pos-handle-right": card(
    "หูจับด้านขวา",
    "มองลายตรง ๆ หูจับอยู่ขวามือ",
    mug(430, 470, "right", "art", 1, "ลายอยู่ฝั่งนี้") + handleHint(640, 300, "หูจับ ›"),
    "ถือมือขวา — ลายหันเข้าหาตัวเอง"
  ),
  "pos-handle-left": card(
    "หูจับด้านซ้าย",
    "มองลายตรง ๆ หูจับอยู่ซ้ายมือ",
    mug(470, 470, "left", "art", 1, "ลายอยู่ฝั่งนี้") + handleHint(260, 300, "‹ หูจับ"),
    "ถือมือขวา — ลายหันออกให้คนอื่นเห็น"
  ),
  "pos-both": card(
    "สกรีน 2 ด้าน",
    "ลายทั้งสองฝั่งของหูจับ",
    mug(255, 470, "right", "art", 0.72, "ฝั่งซ้ายของหู") + mug(645, 470, "left", "art", 0.72, "ฝั่งขวาของหู"),
    "ลายเดียวกันหรือคนละลายก็ได้ — บอกไว้ในหมายเหตุ"
  ),
  "pos-wrap": card(
    "รอบแก้ว",
    "ลายต่อเนื่องรอบตัวแก้ว เว้นช่วงหูจับ",
    mug(450, 470, "right", "wrap", 1, "ลายพันรอบตัวแก้ว"),
    "สกรีนเต็มใบชิดขอบบน-ล่างไม่ได้ (ตามข้อควรทราบ)"
  ),
};

type Job = { file: string; buf: Buffer; url?: string };
const JOBS: Job[] = [];
for (const c of CHOICES) {
  const file = `${c.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(SVGS[c.file])).jpeg({ quality: 90 }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  JOBS.push({ file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${c.name}`);
}

// ── Supabase ──────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg: string): never => {
  console.error("✗", msg);
  process.exit(1);
};
const urlOf = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;
for (const j of JOBS) j.url = urlOf(j.file);

const { data: row, error: readErr } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr || !row) die(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const d = row!.data as Product;

const typeGroup = d.options.find((o) => o.label === G_TYPE);
if (!typeGroup) die(`ไม่เจอกลุ่ม "${G_TYPE}"`);
if (String(d.pricing?.driverLabels) !== G_TYPE) die(`แกนตารางราคาไม่ใช่ "${G_TYPE}" (${JSON.stringify(d.pricing?.driverLabels)}) — ข้อมูลเปลี่ยน ตรวจก่อน`);

const wantGroup: ProductOption = {
  label: G_POS,
  section: SECTION,
  display: "cards",
  note: NOTE,
  choices: CHOICES.map((c, i) => ({ name: c.name, desc: c.desc, imageSrc: JOBS[i].url! })),
};
const sig = (o: ProductOption | undefined) =>
  !o
    ? ""
    : JSON.stringify({
        section: o.section,
        display: o.display,
        note: o.note,
        choices: o.choices.map((c) => [c.name, c.desc, c.imageSrc, c.extra ?? 0]),
      });

const existing = d.options.find((o) => o.label === G_POS);
const wantIdx = d.options.indexOf(typeGroup!) + 1;
const upToDate = existing && sig(existing) === sig(wantGroup) && d.options.indexOf(existing) === wantIdx;

console.log(`\n📦 ${row!.name} (${ID})${d.hidden ? " · ร่าง" : " · เผยแพร่อยู่"}`);
if (upToDate) {
  console.log(`= กลุ่ม "${G_POS}" ตรงตามที่ต้องการอยู่แล้ว ไม่ต้องเขียน`);
  process.exit(0);
}
if (existing) {
  // เก็บ extra ที่ร้านอาจเติมไว้เองในหน้าแก้ไข (ชื่อตรงกัน) — สคริปต์นี้ไม่ตั้งราคา
  for (const c of wantGroup.choices) {
    const old = existing.choices.find((x) => x.name === c.name);
    if (old?.extra) c.extra = old.extra;
  }
  console.log(`~ กลุ่ม "${G_POS}" มีอยู่แล้วแต่ไม่ตรง → เขียนทับด้วยชุดใหม่ (คง extra เดิมถ้ามี)`);
} else console.log(`+ เพิ่มกลุ่ม "${G_POS}" [${SECTION}] การ์ด ${CHOICES.length} ใบ ต่อจาก "${G_TYPE}"`);
for (const c of wantGroup.choices) console.log(`   - ${c.name}${c.extra ? ` (+${c.extra})` : ""}: ${c.desc}`);

d.options = d.options.filter((o) => o.label !== G_POS);
d.options.splice(d.options.indexOf(typeGroup!) + 1, 0, wantGroup);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียน DB — ดูการ์ดใน", OUT, "แล้วรันด้วย --write)");
  process.exit(0);
}

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(row!.data, null, 1));

for (const j of JOBS) {
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${j.file}`, j.buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`อัป ${j.file}: ${up.error.message}`);
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${ID}/`);

d.savedAt = new Date().toISOString();
const { data: up, error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (upErr) die(upErr.message);
if (!up?.length) die("update โดน 0 แถว");

// ── อ่านกลับเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ─────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back!.data as Product;
const g = b.options.find((o) => o.label === G_POS);
if (sig(g) !== sig(wantGroup)) die("อ่านกลับ: กลุ่มตำแหน่งสกรีนไม่ตรง");
if (b.options.indexOf(g!) !== b.options.findIndex((o) => o.label === G_TYPE) + 1) die("อ่านกลับ: ลำดับกลุ่มไม่ตรง");
if (b.savedAt !== d.savedAt) die("อ่านกลับ: savedAt ไม่ตรง");
// แกนราคาต้องไม่ถูกแตะ: driverLabels + คีย์คอลัมน์ทุกเรท
for (const p of [b.pricing, ...(b.priceRates ?? []).map((r) => r.pricing)].filter(Boolean)) {
  if (String(p!.driverLabels) !== G_TYPE) die(`อ่านกลับ: driverLabels เพี้ยน ${JSON.stringify(p!.driverLabels)}`);
  for (const c of typeGroup!.choices) if (!(c.name in (p!.cells ?? {}))) die(`อ่านกลับ: คีย์ราคา "${c.name}" หาย`);
}
console.log(`\n✓ เพิ่มกลุ่ม "${G_POS}" ${CHOICES.length} การ์ด + อ่านกลับตรงทุกข้อ · savedAt = ${b.savedAt}`);
console.log(`   ตรวจ: http://localhost:3005/products/${ID}?v=${Date.now()}`);

#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกขาว · cardholder-white) — ภาพประกอบกลุ่มตัวเลือก "แบบ" 3 ใบ + เปลี่ยนเป็นการ์ด
 *
 *   node scripts/cardholder-white-type-option-art.mjs           (วาดภาพลง .cache/cardholder-white/upload ดูก่อน)
 *   node scripts/cardholder-white-type-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * กลุ่ม "แบบ" เดิมเป็นปุ่มยาว 3 ปุ่ม ไม่มีรูป — ลูกค้าอ่านชื่อแล้วยังไม่รู้ว่า "ได้สายมาด้วยไหม"
 *   ฿95  การ์ดพลาสติกขาว (ไม่รับสาย)        — สกรีนตัวการ์ด ไม่เอาสายคล้อง (ถูกกว่า ฿5)
 *   ฿100 การ์ดพลาสติกขาว (สกรีนเค่ตัวการ์ด) — สกรีนตัวการ์ด + ได้สายคล้องคอ "สีขาวเปล่า" มาด้วย
 *   ฿130 การ์ดพลาสติกขาว + สกรีนสาย         — สกรีนทั้งตัวการ์ดและสายคล้อง
 * (เรื่องสายขาวมาจากใบสเปค `30_อุปกรณ์มือถือ/Card-Holder/CARD Ho.png`:
 *  "ทุกออเดอร์ที่สั่ง Card Holder แต่ไม่ได้สกรีนสาย จะได้สายคล้องคอสีขาว")
 *
 * ⚠️ **ห้ามแก้ชื่อตัวเลือก** — เป็นคีย์ของ pricing.cells และเป็นแกนตารางราคา (driverLabels = ["แบบ"])
 *    สคริปต์นี้เติมแค่ imageSrc + desc + เปลี่ยน display เป็น "cards" ([[iducky-price-driver-trap]])
 *
 * ทำไมเป็นการ์ด: ปุ่มทรง pill ย่อรูปเหลือวงกลม 28×28 — จุดต่าง (มี/ไม่มีสาย) มองไม่ออก
 *    ทรงการ์ดโชว์รูป 48×48 + ชื่อ + คำอธิบาย และเป็นทรงที่ร้านสั่งใช้กับกลุ่ม "แบบ" อยู่แล้ว ([[iducky-option-cards]])
 *
 * ⚠️ ภาพต้นทาง 900×900 (จัตุรัส) ในการ์ดถูก **ย่อทั้งใบ ไม่ได้ครอป** — จุดต่างจึงต้องเป็นก้อนใหญ่
 *    คนละกติกากับปุ่มที่ครอปกลาง 300-600 ([[iducky-option-thumb-crop]])
 *    ที่วางไว้: ห่วงสายคล้องกินพื้นที่ครึ่งบนของภาพทั้งใบ — ไม่มีสาย / สายขาวเปล่า / สายสกรีนลาย ต่างกันตั้งแต่ย่อ
 * ⚠️ ภาพตัวเลือกไหลเข้าแกลเลอรีสินค้าเองอีก 3 รูป (ตั้งใจ — กดการ์ดแล้วแกลเลอรีเด้งไปรูปนั้น)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เขียนทับ imageSrc/desc ของตัวเลือกเดิมตามชื่อ ไม่เพิ่ม/ลบ/สลับตัวเลือก
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 260);

const PRODUCT_ID = "cardholder-white";
const GROUP = "แบบ";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const CARD_W = 6.9, CARD_H = 11, STRAP_W = 1.5;

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", MUTE = "#94a3b8";
const PRINT = "#bae6fd", PRINT_DK = "#7dd3fc";   // ลายที่ลูกค้าสกรีน (ตัวอย่าง)

const CX = 450;
const PX = 21;                 // 21 px = 1 ซม. (ตัวการ์ดอยู่ครึ่งล่าง เหลือครึ่งบนให้ห่วงสาย)
const CLIP_Y = 466;            // ขอบบนคลิปหนีบ
const TOP = 512;               // ขอบบนตัวการ์ด
const cw = CARD_W * PX, ch = CARD_H * PX;
const L = CX - cw / 2, R = CX + cw / 2, B = TOP + ch;
const winL = L + 1.0 * PX, winR = R - 1.0 * PX;
const winT = TOP + 1.9 * PX, winB = B - 0.9 * PX;

/** ห่วงสายคล้องคอ — เส้นเดียววาดทั้งวง จากคลิปขึ้นไปอ้อมบนแล้ววกกลับ */
const LOOP = `M ${CX - 16} ${CLIP_Y + 6}
  C ${340} ${420}, ${296} ${318}, ${372} ${248}
  C ${416} ${208}, ${484} ${208}, ${528} ${248}
  C ${604} ${318}, ${560} ${420}, ${CX + 16} ${CLIP_Y + 6}`;

/** ก้อนเมฆ = ลายที่ลูกค้าสกรีน (ตัวอย่าง) */
const cloud = (cx, cy, s) => `
  <g fill="#ffffff" opacity="0.85">
    <circle cx="${cx - 7 * s}" cy="${cy}" r="${5 * s}"/>
    <circle cx="${cx}" cy="${cy - 3 * s}" r="${7 * s}"/>
    <circle cx="${cx + 8 * s}" cy="${cy}" r="${5.5 * s}"/>
    <rect x="${cx - 12 * s}" y="${cy}" width="${24 * s}" height="${5 * s}" rx="${2.5 * s}"/>
  </g>`;

/**
 * ตัวการ์ดพลาสติกขาวที่สกรีนลายแล้ว + ช่องใสตรงกลางที่เห็นบัตร
 * withClip = วาดคลิปหนีบพลาสติกขาวเหนือการ์ดด้วยไหม — **คลิปมาพร้อมสายคล้อง**
 * แบบ "ไม่รับสาย" จึงไม่มีทั้งสายและคลิป เหลือแต่ตัวการ์ดกับช่องร้อยบนหัวการ์ด
 */
const cardHolder = (withClip) => {
  const mw = 34, mh = mw / MASCOT.ratio;
  return `
  <!-- เงาใต้ตัวการ์ด -->
  <rect x="${L + 5}" y="${TOP + 7}" width="${cw}" height="${ch}" rx="15" fill="#0f172a" opacity="0.08"/>
  <!-- ตัวการ์ด: กรอบสกรีนลายเต็มถึงขอบ -->
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="15" fill="${PRINT}" stroke="${INK}" stroke-width="3"/>
  <rect x="${L}" y="${TOP}" width="${cw}" height="${ch}" rx="15" fill="none" stroke="${PRINT_DK}" stroke-width="8" opacity="0.35"/>
  ${cloud(L + 22, TOP + 80, 0.8)}
  ${cloud(R - 20, TOP + 140, 0.75)}
  ${cloud(CX + 3, B - 11, 0.85)}
  <image href="${MASCOT.uri}" x="${L + 12}" y="${TOP + 6}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <!-- ช่องเสียบคลิป -->
  <rect x="${CX - 17}" y="${TOP + 11}" width="34" height="10" rx="5" fill="#ffffff" stroke="${MUTE}" stroke-width="2"/>
  <!-- ช่องใส (เห็นบัตรที่ใส่อยู่) -->
  <rect x="${winL}" y="${winT}" width="${winR - winL}" height="${winB - winT}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  <rect x="${winL + 12}" y="${winT + 14}" width="30" height="36" rx="5" fill="#e2e8f0"/>
  ${[0, 1, 2].map((i) => `<rect x="${winL + 50}" y="${winT + 18 + i * 13}" width="${46 - i * 12}" height="7" rx="3.5" fill="#e2e8f0"/>`).join("")}
  ${[0, 1, 2, 3].map((i) => `<rect x="${winL + 12}" y="${winT + 66 + i * 15}" width="${winR - winL - 24 - (i === 3 ? 34 : 0)}" height="7" rx="3.5" fill="#eef2f7"/>`).join("")}
  <text x="${CX}" y="${winB - 12}" font-family="${TH}" font-size="13" font-weight="700" text-anchor="middle" fill="${MUTE}">ใส่บัตรได้ 2 ใบ</text>
  ${withClip ? `<!-- คลิปหนีบพลาสติกขาว (มาพร้อมสายคล้อง) -->
  <rect x="${CX - 20}" y="${CLIP_Y}" width="40" height="52" rx="9" fill="#ffffff" stroke="${MUTE}" stroke-width="2.5"/>
  <rect x="${CX - 10}" y="${CLIP_Y + 13}" width="20" height="8" rx="4" fill="#e2e8f0" stroke="${MUTE}" stroke-width="2"/>` : ""}`;
};

/** ป้ายกลมบอกสถานะของสาย — วางกลางห่วง อ่านออกตั้งแต่ย่อ */
const badge = (text, tone) => {
  const c = tone === "no" ? MUTE : tone === "plain" ? "#0f172a" : OK;
  const bg = tone === "no" ? "#f1f5f9" : tone === "plain" ? "#ffffff" : "#ecfeff";
  const w = text.length * 13.5 + 54;
  return `
    <rect x="${CX - w / 2}" y="${312}" width="${w}" height="52" rx="26" fill="${bg}" stroke="${c}" stroke-width="3"/>
    <text x="${CX}" y="${345}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** สาย 1 แบบ: none = ไม่มี (วาดเป็นเส้นประจาง ๆ ให้เห็นว่าตรงนี้เคยมีสาย) · plain = ขาวเปล่า · print = สกรีนลาย */
const strap = (kind) => {
  if (kind === "none")
    return `
    <path d="${LOOP}" fill="none" stroke="#eef2f7" stroke-width="24" stroke-linecap="butt" stroke-dasharray="14 18"/>
    <g stroke="${MUTE}" stroke-width="12" stroke-linecap="round">
      <line x1="${CX - 34}" y1="${228}" x2="${CX + 34}" y2="${296}"/>
      <line x1="${CX + 34}" y1="${228}" x2="${CX - 34}" y2="${296}"/>
    </g>`;
  if (kind === "plain")
    return `
    <path d="${LOOP}" fill="none" stroke="#64748b" stroke-width="33" stroke-linecap="round"/>
    <path d="${LOOP}" fill="none" stroke="#ffffff" stroke-width="25" stroke-linecap="round"/>
    <path d="${LOOP}" fill="none" stroke="#e2e8f0" stroke-width="7" stroke-linecap="round"/>`;
  return `
    <path d="${LOOP}" fill="none" stroke="${OK}" stroke-width="32" stroke-linecap="round"/>
    <path d="${LOOP}" fill="none" stroke="${PRINT_DK}" stroke-width="26" stroke-linecap="round"/>
    <path d="${LOOP}" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="butt" stroke-dasharray="7 30" opacity="0.95"/>
    <path d="${LOOP}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="butt" stroke-dasharray="3 16" opacity="0.8"/>`;
};

function art({ title, sub, kind, badgeText, badgeTone, foot }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="90" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${strap(kind)}
  ${badge(badgeText, badgeTone)}
  ${cardHolder(kind !== "none")}
  ${foot.map((t, i) => `<text x="${W / 2}" y="${786 + i * 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${t}</text>`).join("")}
  <text x="${W / 2}" y="${H - 52}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${MUTE}">ตัวการ์ด ${CARD_W} × ${CARD_H} ซม.${kind === "none" ? " · ไม่มีสายคล้องคอและคลิปหนีบมาให้" : ` · สายกว้าง ${STRAP_W} ซม. · ภาพวาดประกอบ สายวาดย่อ ไม่ใช่ความยาวจริง`}</text>
</svg>`;
}

// ⚠️ name = ชื่อเดิมใน DB เป๊ะ ๆ (คีย์ตารางราคา) ห้ามแก้ แม้จะสะกด "เค่" ผิด
const TYPES = [
  {
    name: "การ์ดพลาสติกขาว (ไม่รับสาย)",
    file: `type-no-strap-${VER}.jpg`,
    title: "ไม่รับสายคล้อง",
    sub: "ได้เฉพาะตัวการ์ดที่สกรีนลายแล้ว — ไม่เอาสายคล้องคอและคลิปหนีบ",
    kind: "none",
    badgeText: "ไม่มีสายคล้องคอ + ไม่มีคลิปหนีบ",
    badgeTone: "no",
    foot: ["เหมาะกับคนที่มีสายคล้องอยู่แล้ว", "หรือเอาไปห้อยกับที่หนีบ / พวงกุญแจเอง"],
    desc: "สกรีนลายเฉพาะตัวการ์ด แล้วไม่รับสายคล้องคอ (คลิปหนีบมากับสาย จึงไม่ได้มาด้วย) — ถูกกว่าแบบที่มีสาย เหมาะกับคนที่มีสายอยู่แล้ว",
  },
  {
    name: "การ์ดพลาสติกขาว (สกรีนเค่ตัวการ์ด)",
    file: `type-plain-strap-${VER}.jpg`,
    title: "สกรีนแค่ตัวการ์ด",
    sub: "สกรีนลายเฉพาะตัวการ์ด + ได้สายคล้องคอสีขาวเปล่ามาด้วย",
    kind: "plain",
    badgeText: "สายคล้องคอสีขาว ไม่สกรีน",
    badgeTone: "plain",
    foot: ["ทุกออเดอร์ที่ไม่ได้สั่งสกรีนสาย", "ทางร้านแถมสายคล้องคอสีขาวให้ในชุด"],
    desc: "สกรีนลายเฉพาะตัวการ์ด แล้วแถมสายคล้องคอ “สีขาวเปล่า” (ไม่สกรีนลาย) มาให้ในชุด",
  },
  {
    name: "การ์ดพลาสติกขาว + สกรีนสาย",
    file: `type-printed-strap-${VER}.jpg`,
    title: "สกรีนการ์ด + สกรีนสาย",
    sub: "สกรีนลายทั้งตัวการ์ดและสายคล้องคอ เป็นชุดเดียวกัน",
    kind: "print",
    badgeText: "สายคล้องคอสกรีนลาย",
    badgeTone: "print",
    foot: ["สายสกรีนวางภาพให้เต็ม เผื่อขอบตัดตกด้านละ 2.5 มม.", "เชือกแบ่งสกรีนทีละครึ่งเส้น จะมีรอยต่อนิดหน่อย"],
    desc: "สกรีนลายทั้งตัวการ์ดและสายคล้องคอ ได้เป็นชุดลายเดียวกันทั้งใบ — ขายดีเวลาทำของแฟนคลับ/ของพนักงาน",
  },
];

for (const t of TYPES) {
  t.buf = await sharp(Buffer.from(art(t))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${t.file}`, t.buf);
  // การ์ดย่อ "ทั้งใบ" เหลือ 48×48 — เรนเดอร์ตัวอย่างไว้ดูว่ายังแยกออกไหม
  await sharp(t.buf).resize(48, 48).png().toFile(`${OUT}/mini-${t.file}.png`);
  console.log(`🖼  ${OUT}/${t.file}  ${Math.round(t.buf.length / 1024)} KB — ${t.name}`);
}
// เรียง 3 ใบย่อไว้ในภาพเดียว เทียบง่าย ๆ ว่าตอนเป็นการ์ดยังแยกออก
await sharp({ create: { width: 48 * 3 + 24, height: 48, channels: 3, background: "#ffffff" } })
  .composite(TYPES.map((t, i) => ({ input: `${OUT}/mini-${t.file}.png`, left: i * 60, top: 0 })))
  .png().toFile(`${OUT}/mini-row-${VER}.png`);
console.log(`🔎 ${OUT}/mini-row-${VER}.png — 3 ใบย่อ 48×48 เรียงเทียบกัน`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const t of TYPES) {
  const key = `products/${PRODUCT_ID}/${t.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, t.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  t.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", t.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const dump = `${OUT}/../before-type-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const before = JSON.stringify(data.pricing?.cells ?? {});
const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
// เติมรูป/คำอธิบายให้ตัวเลือกเดิม "ตามชื่อ" — ไม่เพิ่ม/ลบ/สลับ เพราะชื่อคือคีย์ตารางราคา
for (const t of TYPES) {
  const c = g.choices?.find((x) => x.name === t.name);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${t.name}" ในกลุ่ม "${GROUP}"`); process.exit(1); }
  c.imageSrc = t.url;
  c.desc = t.desc;
}
g.display = "cards";
g.note = "ทุกแบบสกรีนลายตัวการ์ดเหมือนกัน — ต่างกันที่ “สายคล้องคอ” ว่าไม่รับ / ได้สายขาวเปล่า / สกรีนลายสายด้วย";
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gb = (back.data.options ?? []).find((o) => o.label === GROUP);
const fails = [
  [!!gb, `กลุ่ม "${GROUP}" หาย`],
  [gb?.display === "cards", "กลุ่มแบบไม่ใช่การ์ด"],
  [gb?.choices?.length === 3, "จำนวนตัวเลือกไม่ครบ 3"],
  ...TYPES.map((t, i) => [
    gb?.choices?.[i]?.name === t.name, `ตัวเลือกลำดับ ${i + 1} ชื่อเพี้ยน (คีย์ตารางราคาพัง)`,
  ]),
  ...TYPES.map((t) => {
    const c = gb?.choices?.find((x) => x.name === t.name);
    return [c?.imageSrc === t.url && c?.desc === t.desc, `"${t.name}" ภาพ/คำอธิบายไม่ตรง`];
  }),
  // ราคาต้องไม่ขยับแม้แต่ช่องเดียว
  [JSON.stringify(back.data.pricing?.cells ?? {}) === before, "ตารางราคาเปลี่ยน!"],
  [(back.data.pricing?.driverLabels ?? []).join() === GROUP, "แกนตารางราคาเปลี่ยน"],
  [back.data.priceMin === 35 && back.data.priceMax === 130, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [gb?.choices?.every((c) => !c.extra), "ตัวเลือกดันมีราคาเพิ่ม"],
  // กลุ่มขนาดที่เพิ่งเพิ่มต้องยังอยู่ ([[iducky-option-group-loss-guard]])
  [(back.data.options ?? []).some((o) => o.label === "ขนาด"), 'กลุ่ม "ขนาด" หาย'],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" เป็นการ์ด 3 ใบ + ภาพ/คำอธิบาย · ตารางราคาไม่ขยับ · savedAt =`, back.data.savedAt);

#!/usr/bin/env node
/**
 * สแตนดี้ฐานดนตรี (standymusic-1) — ภาพประกอบกลุ่ม "ประเภทะคริลิค" + เปลี่ยนเป็นการ์ด
 *
 *   node scripts/standymusic-acrylic-type-art.mjs           (วาดลง .cache/standymusic/upload ดูก่อน)
 *   node scripts/standymusic-acrylic-type-art.mjs --write   (+ อัปโหลด storage + ติดภาพ + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69 (ต่อจากกลุ่ม "ขนาด" — scripts/standymusic-size-option-art.mjs)
 * กลุ่มนี้เดิมเป็นปุ่มเปล่า 2 ปุ่ม ลูกค้าไม่รู้ว่า "ธรรมดา" กับ "พิเศษ" ต่างกันตรงไหน ทั้งที่ต่างกันด้วย "หน้าตาเนื้อ"
 * ล้วน ๆ → เปลี่ยนเป็นการ์ด (รูป 80×80 + คำอธิบาย) แทนปุ่มกลมที่โชว์รูปได้แค่ 28px
 *
 * สิ่งที่ต้องสื่อ = สองกลุ่มนี้ "เลือกสีได้คนละชุด" (กติกาใน data.rules ของสินค้าเอง):
 *   ธรรมดา → อะคริลิคใส · ขาวขุ่น C-02            (2 สี · ราคาตามตาราง ไม่บวกเพิ่ม)
 *   พิเศษ  → C-01 / กลิตเตอร์ / โฮโลแกรม / สี      (43 เฉด · +฿20 ต่อชิ้น)
 * สคริปต์อ่านจำนวนสีจาก rules จริงตอนรัน ถ้าไม่ตรงกับที่เขียนบนภาพจะหยุด (กันภาพค้างเลขเก่า)
 *
 * รูปเนื้ออะคริลิคยกมาจาก "คลังกลาง" ที่สินค้าตัวอื่นใช้อยู่แล้ว — products/acrylic-colors/*.jpg
 * (รูปถ่ายจริงของร้าน ดีกว่าวาดเอง) แคชไว้ที่ .cache/standymusic/swatch/ รันซ้ำได้แม้เน็ตหลุด
 * "อะคริลิคใส" ไม่มีรูปในคลัง (ใสจนถ่ายไม่ติด) จึงวาดเป็นแผ่นใสขอบเขียวฟ้าแทน
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 * ⚠️ ห้ามแก้ "ชื่อกลุ่ม" (สะกดตกอักษร อ) — rules ทั้ง 2 ข้อชี้ที่ชื่อนี้ และออเดอร์เก่าเก็บตัวเลือกด้วยชื่อกลุ่ม
 * ราคา: แตะแค่ display/imageSrc/desc — extra 20 ของ "พิเศษ" คงเดิม สคริปต์เทียบตอนอ่านกลับ
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "standymusic-1";
const VER = "v1";
const GROUP = "ประเภทะคริลิค";
const PLAIN = "อะคริลิคธรรมดา";
const SPECIAL = "อะคริลิคพิเศษ";
const N_PLAIN = 2, N_SPECIAL = 43;   // ต้องตรงกับ data.rules ตอนเขียน ไม่งั้นหยุด
const EXTRA_SPECIAL = 20;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/standymusic/upload`).replace(/\/$/, "");
const SWATCH = ".cache/standymusic/swatch";
mkdirSync(OUT, { recursive: true });
mkdirSync(SWATCH, { recursive: true });

const SUPA = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images";

/** รูปเนื้ออะคริลิคจากคลังกลาง — โหลดครั้งเดียวแล้วแคชไว้ (รันซ้ำได้แม้ไดรฟ์/เน็ตหลุด) */
async function swatch(name) {
  const f = `${SWATCH}/${name}.jpg`;
  if (!existsSync(f)) {
    const res = await fetch(`${SUPA}/products/acrylic-colors/${name}.jpg`);
    if (!res.ok) throw new Error(`โหลดรูปเนื้อ ${name} ไม่ได้ (HTTP ${res.status})`);
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`;
}

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pill = (cx, y, text, tone = OK, bg = "#ecfeff") => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${tone}">${esc(text)}</text>`;
};

/** ช่องรูปเนื้ออะคริลิค 1 ช่อง — รูปถ่ายจริงในกรอบมน + ชื่อเฉดใต้ช่อง */
const tile = (x, y, s, uri, label, id) => `
  <defs><clipPath id="clip${id}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.09}"/></clipPath></defs>
  <rect x="${x + 3}" y="${y + 6}" width="${s}" height="${s}" rx="${s * 0.09}" fill="#0f172a" opacity="0.10"/>
  <image href="${uri}" x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip${id})"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.09}" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${x + s / 2}" y="${y + s + 30}" font-family="${TH}" font-size="${s > 280 ? 25 : 21}" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>`;

/** แผ่น "อะคริลิคใส" — ไม่มีรูปถ่ายในคลัง (ใสจนถ่ายไม่ติด) วาดเป็นแผ่นใสขอบเขียวฟ้าตามของจริง */
/**
 * แผ่น "อะคริลิคใส" — ไม่มีรูปถ่ายในคลัง (ใสจนถ่ายไม่ติด) จึงวาดเอง
 * วางจุดสีไว้ "ใต้" แผ่นแล้วให้แผ่นทับ = เห็นจุดทะลุผ่านเนื้อแบบจาง ๆ → สื่อคำว่า "ใส" ได้ในภาพเดียว
 */
const clearTile = (x, y, s, label) => {
  const cx = x + s / 2, cy = y + s / 2;
  const dot = (dx, dy, r, fill) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="${r}" fill="${fill}"/>`;
  return `
  <rect x="${x + 3}" y="${y + 6}" width="${s}" height="${s}" rx="${s * 0.09}" fill="#0f172a" opacity="0.10"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.09}" fill="#ffffff"/>
  <!-- จุดสีใต้แผ่น — ครึ่งหนึ่งโผล่พ้นแผ่น ครึ่งหนึ่งอยู่ใต้แผ่น เทียบกันได้ว่าสีจางลงนิดเดียว -->
  ${dot(-s * 0.3, -s * 0.26, s * 0.075, "#f6a5c0")}
  ${dot(s * 0.02, -s * 0.33, s * 0.06, "#8fd0ea")}
  ${dot(s * 0.31, s * 0.08, s * 0.08, "#ffd977")}
  ${dot(-s * 0.24, s * 0.3, s * 0.062, "#9ee0c4")}
  <g transform="translate(${cx} ${cy}) rotate(-14)">
    <rect x="${-s * 0.29}" y="${-s * 0.29}" width="${s * 0.58}" height="${s * 0.58}" rx="${s * 0.035}" fill="#e6f5fa" opacity="0.62"/>
    <rect x="${-s * 0.29}" y="${-s * 0.29}" width="${s * 0.58}" height="${s * 0.58}" rx="${s * 0.035}" fill="none" stroke="#5fbcc0" stroke-width="7"/>
    <rect x="${-s * 0.29}" y="${-s * 0.29}" width="${s * 0.58}" height="${s * 0.58}" rx="${s * 0.035}" fill="none" stroke="#ffffff" stroke-width="2"/>
    <path d="M ${-s * 0.22} ${s * 0.2} L ${s * 0.07} ${-s * 0.24} L ${s * 0.18} ${-s * 0.24} L ${-s * 0.11} ${s * 0.2} Z" fill="#ffffff" opacity="0.7"/>
  </g>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.09}" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${x + s / 2}" y="${y + s + 30}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>`;
};

const frame = (title, subtitle, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(title)}</text>
  <text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(subtitle)}</text>
  ${body}
</svg>`;

// ── ภาพที่ 1: อะคริลิคธรรมดา — 2 สี ราคาตามตาราง ────────────────────
const plainSvg = async () => {
  const s = 330, y = 200;
  return frame(
    "อะคริลิคธรรมดา",
    `ราคาตามตาราง ไม่บวกเพิ่ม — เลือกได้ ${N_PLAIN} สี`,
    `
    ${clearTile(96, y, s, "อะคริลิคใส")}
    ${tile(474, y, s, await swatch("c02-v2"), "ขาวขุ่น C-02", "c02")}
    <text x="261" y="${y + s + 62}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">เห็นพื้นหลังทะลุแผ่น ลอยเบา</text>
    <text x="639" y="${y + s + 62}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ทึบขาว สีลายสด ไม่โปร่ง</text>
    ${pill(W / 2, 700, "ราคาตามตาราง ไม่บวกเพิ่ม")}
    <text x="${W / 2}" y="790" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เลือกเฉดจริงในกลุ่ม “สีอะคริลิค” ด้านล่าง</text>
    <text x="${W / 2}" y="828" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">อยากได้กลิตเตอร์ / โฮโลแกรม / อะคริลิคสี → เลือก “อะคริลิคพิเศษ” (+฿${EXTRA_SPECIAL})</text>`
  );
};

// ── ภาพที่ 2: อะคริลิคพิเศษ +฿20 — กลิตเตอร์/โฮโลแกรม/สี ────────────
const SPECIAL_TILES = [
  ["glitter-gold-v2", "กลิตเตอร์ทอง"],
  ["glitter-rainbow-v2", "กลิตเตอร์รุ้ง"],
  ["holo-01-v2", "hologram-01"],
  ["holo-rainbow-v2", "hologram รุ้ง"],
  ["holo-star-v2", "hologram ดาว"],
  ["p-v2", "อะคริลิคสี (P)"],
];
const specialSvg = async () => {
  const s = 232, gap = 22;
  const x0 = (W - (s * 3 + gap * 2)) / 2;
  const rows = [190, 468];
  const tiles = [];
  for (let i = 0; i < SPECIAL_TILES.length; i++) {
    const [file, label] = SPECIAL_TILES[i];
    tiles.push(tile(x0 + (i % 3) * (s + gap), rows[Math.floor(i / 3)], s, await swatch(file), label, `sp${i}`));
  }
  return frame(
    `อะคริลิคพิเศษ + ฿${EXTRA_SPECIAL}`,
    `กลิตเตอร์ · โฮโลแกรม · อะคริลิคสี — เลือกได้ ${N_SPECIAL} เฉด`,
    `
    ${tiles.join("")}
    ${pill(W / 2, 800, `ตัวอย่าง 6 เฉด จากทั้งหมด ${N_SPECIAL} เฉด`)}
    <text x="${W / 2}" y="858" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เลือกเฉดจริงในกลุ่ม “สีอะคริลิค” ด้านล่าง · บวกเพิ่มชิ้นละ ฿${EXTRA_SPECIAL}</text>`
  );
};

const JOBS = [
  { choice: PLAIN, file: `type-plain-${VER}.jpg`, svg: await plainSvg(),
    desc: `อะคริลิคใส หรือ ขาวขุ่น C-02 (${N_PLAIN} สี) — ราคาตามตาราง ไม่บวกเพิ่ม\nเลือกเฉดจริงในกลุ่ม “สีอะคริลิค” ด้านล่าง` },
  { choice: SPECIAL, file: `type-special-${VER}.jpg`, svg: await specialSvg(),
    desc: `กลิตเตอร์ / โฮโลแกรม / อะคริลิคสี รวม ${N_SPECIAL} เฉด\nเลือกเฉดจริงในกลุ่ม “สีอะคริลิค” ด้านล่าง` },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  await sharp(j.buf).resize(80, 80).toFile(`${OUT}/thumb-${j.file}`); // = ที่ลูกค้าเห็นบนการ์ดจริง
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.choice}`);
}

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ติดภาพให้การ์ด ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", j.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = JSON.parse(JSON.stringify(data));
const dump = `${OUT}/../before-type-${VER}.json`;
writeFileSync(dump, JSON.stringify(before, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

// จำนวนสีบนภาพต้องตรงกับกติกาจริง ไม่งั้นภาพโกหกลูกค้า
const allowOf = (choice) => (data.rules ?? []).find((r) => r.when?.label === GROUP && r.when?.choice === choice)?.limit?.allow ?? [];
if (allowOf(PLAIN).length !== N_PLAIN || allowOf(SPECIAL).length !== N_SPECIAL) {
  console.error(`จำนวนสีใน rules เปลี่ยนไป (ธรรมดา ${allowOf(PLAIN).length} · พิเศษ ${allowOf(SPECIAL).length}) — แก้เลขบนภาพก่อน`);
  process.exit(1);
}
const drivers = [data.pricing?.driverLabels ?? [], ...(data.priceRates ?? []).map((r) => r.pricing?.driverLabels ?? [])].flat();
if (drivers.includes(GROUP)) { console.error(`ชื่อกลุ่ม "${GROUP}" ชนแกนตารางราคา — หยุดก่อน`); process.exit(1); }

const groups = (data.options ?? []).filter((o) => o.label === GROUP);
if (groups.length !== 1) { console.error(`เจอกลุ่ม "${GROUP}" ${groups.length} กลุ่ม — หยุดก่อน`); process.exit(1); }
const g = groups[0];
const names = (g.choices ?? []).map((c) => c.name);
if (names.length !== 2 || names[0] !== PLAIN || names[1] !== SPECIAL) { console.error("ตัวเลือกในกลุ่มไม่ตรงกับที่คาด", names); process.exit(1); }
g.display = "cards";
for (const j of JOBS) {
  const c = g.choices.find((x) => x.name === j.choice);
  c.imageSrc = j.url;
  c.desc = j.desc;
}
data.savedAt = new Date().toISOString(); // ISO เท่านั้น ([[iducky-script-write-product]] ข้อ 8) + บัสต์แคชรูป

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]] ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gb = got.find((o) => o.label === GROUP);
const fails = [
  [got.map((o) => o.label).join("|") === (before.options ?? []).map((o) => o.label).join("|"), "ลำดับ/รายชื่อกลุ่มตัวเลือกเปลี่ยน ([[iducky-option-group-loss-guard]])"],
  [gb?.display === "cards", "กลุ่มประเภทอะคริลิคไม่ใช่การ์ด"],
  [gb?.choices?.length === 2, "จำนวนตัวเลือกในกลุ่มเปลี่ยน"],
  [gb?.choices?.[0]?.name === PLAIN && gb?.choices?.[1]?.name === SPECIAL, "ชื่อ/ลำดับตัวเลือกเปลี่ยน (rules ชี้ที่ชื่อนี้)"],
  [JOBS.every((j) => gb?.choices?.find((c) => c.name === j.choice)?.imageSrc === j.url), "ภาพการ์ดไม่ตรง"],
  [JOBS.every((j) => gb?.choices?.find((c) => c.name === j.choice)?.desc === j.desc), "คำอธิบายการ์ดไม่ตรง"],
  [!gb?.choices?.find((c) => c.name === PLAIN)?.extra, "อะคริลิคธรรมดาต้องไม่บวกราคา"],
  [gb?.choices?.find((c) => c.name === SPECIAL)?.extra === EXTRA_SPECIAL, `อะคริลิคพิเศษต้องบวก ฿${EXTRA_SPECIAL} เท่าเดิม`],
  [JSON.stringify(back.data.rules) === JSON.stringify(before.rules), "กติกาตัวเลือก (rules) เปลี่ยนไป"],
  [JSON.stringify(back.data.pricing) === JSON.stringify(before.pricing), "ตารางราคา (data.pricing) เปลี่ยนไป"],
  [JSON.stringify(back.data.priceRates) === JSON.stringify(before.priceRates), "ตารางราคาเงา (priceRates) เปลี่ยนไป"],
  [back.data.priceMin === before.priceMin && back.data.priceMax === before.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string (หน้าแก้ไขจะติด 409)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" เป็นการ์ด + ภาพ 2 ใบ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);

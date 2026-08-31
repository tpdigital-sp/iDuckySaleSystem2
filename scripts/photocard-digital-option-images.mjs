#!/usr/bin/env node
/**
 * Photo card Digital — ภาพจำลองให้กลุ่มตัวเลือกที่ยังเป็น dropdown เปล่า ๆ
 *
 *   node scripts/photocard-digital-option-images.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-option-images.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: "เพิ่มภาพจำลองให้หน่อย" (กลุ่มพิมพ์กี่ด้าน · เคลือบหน้า/หลัง · ฟอยล์หน้า/หลัง)
 * → เปลี่ยนกลุ่มพวกนี้เป็นการ์ด (display "cards") + ติดภาพและคำอธิบายสั้น ๆ ต่อตัวเลือก
 *
 * ภาพมาจาก 3 ทาง — ไม่วาดใหม่ถ้าร้านมีของจริงอยู่แล้ว:
 *   1. คลังฟิล์มเคลือบกลางของร้าน products/preset-coating/*  (ผิวฟิล์มพิเศษ 10 แบบ)
 *   2. ภาพงานจริงชุดงานกระดาษ products/paper-art-pet/coat-*  (ไม่เคลือบ/เงา/ด้าน/พิเศษ — ตัวเดียวกับ
 *      ที่ Texture Paper กับป้ายแขวนประตูใช้อยู่ ลูกค้าจะได้เห็นภาพเดียวกันทั้งร้าน)
 *   3. วาดเอง — พิมพ์ 1/2 ด้าน และ "ไม่เคลือบฟอยล์" (scripts/photocard-digital-option-art.mjs)
 *      ไฟล์ต้นทางอยู่ที่ scripts/assets/photocard-digital/ · สคริปต์นี้อัปขึ้นคลังให้ตอน --write
 *      ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชค้าง) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 *
 * ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก/ราคาเลย (ชื่อตัวเลือกบางกลุ่มเป็นแกนตารางราคา — ดู memory
 * iducky-price-driver-trap) · รันซ้ำได้ ผลลัพธ์เท่าเดิม
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const BASE = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products`;

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/* ── ภาพ ─────────────────────────────────────────────────────────── */

const REV = "v1"; // ภาพที่วาดเองชุดแรก (พิมพ์กี่ด้าน / ไม่เคลือบฟอยล์)
const ART_DIR = fileURLToPath(new URL("./assets/photocard-digital/", import.meta.url));
const DRAWN = ["sides-1", "sides-2", "foil-none"];
const drawn = Object.fromEntries(DRAWN.map((n) => [n, `${BASE}/${ID}/${n}-${REV}.jpg`]));
const drawnBuf = Object.fromEntries(DRAWN.map((n) => [n, readFileSync(`${ART_DIR}${n}.jpg`)]));

/** ภาพงานจริงชุดงานกระดาษ (ใช้ร่วมกันทั้งร้าน) */
const coat = (n) => `${BASE}/paper-art-pet/coat-${n}.jpg`;
/** คลังฟิล์มเคลือบกลาง */
const film = (n) => `${BASE}/preset-coating/${n}.jpg`;
/** ภาพฟอยล์ชุดเดิมของสินค้าตัวนี้ */
const own = (n) => `${BASE}/${ID}/${n}.jpg`;

/* ── ตัวเลือกแต่ละกลุ่ม: [ชื่อตัวเลือก, ภาพ, คำอธิบายสั้น] ───────────── */

const FILMS = [
  ["กลิตเตอร์", film("glitter"), "ผงกลิตเตอร์วิบวับทั้งใบ"],
  ["ทราย", film("sand"), "ผิวทรายละเอียด สัมผัสสาก ๆ ไม่สะท้อนแสง"],
  ["hologram-รุ้ง", film("rainbow"), "โฮโลแกรมไล่สีรุ้งทั้งใบ"],
  ["hologram-ดาว", film("star"), "โฮโลแกรมลายดาวกระจาย"],
  ["hologram-หิมะ", film("snow"), "โฮโลแกรมลายเกล็ดหิมะ"],
  ["hologram-หัวใจ", film("heart"), "โฮโลแกรมลายหัวใจ"],
  ["hologram-เหลี่ยม", film("facet"), "โฮโลแกรมลายเหลี่ยมคริสตัล"],
  ["hologram-จุด", film("dot"), "โฮโลแกรมลายจุดกลม"],
  ["hologram-Dust", film("dust"), "โฮโลแกรมผงละเอียด ประกายนุ่ม"],
  ["hologram-Stardust", film("stardust"), "โฮโลแกรมผงดาว ประกายถี่"],
];

const COAT_FRONT = [
  ["ไม่เคลือบ", coat("none"), "งานพิมพ์เปลือย ไม่เคลือบฟิล์ม"],
  ["เคลือบเงา", coat("gloss"), "ฟิล์มใสผิวเงา สีสดขึ้น กันรอย/ความชื้นได้ดีขึ้น"],
  ["เคลือบด้าน", coat("matte"), "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน ดูมินิมอล"],
  ["เคลือบพิเศษ", coat("special"), "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม"],
  ["เคลือบด้าน (มากับงานฟอยล์)", coat("matte"), "งานฟอยล์เคลือบด้านมาให้ในตัว ไม่คิดเพิ่ม"],
];

const COAT_BACK = [
  ["ไม่เคลือบด้านหลัง", coat("none"), "ด้านหลังปล่อยเป็นเนื้อกระดาษ ไม่เคลือบฟิล์ม"],
  ["เคลือบเงา (ด้านหลัง)", coat("gloss"), "ฟิล์มใสผิวเงาที่ด้านหลัง สีสดขึ้น กันรอย"],
  ["เคลือบด้าน (ด้านหลัง)", coat("matte"), "ฟิล์มผิวด้านนุ่มที่ด้านหลัง ลดแสงสะท้อน"],
  ["เคลือบพิเศษ (ด้านหลัง)", coat("special"), "ฟิล์มลายพิเศษที่ด้านหลัง เลือกผิวได้ 10 แบบ"],
  ["เคลือบด้าน (ด้านหลัง · มากับงานฟอยล์)", coat("matte"), "ฟอยล์ด้านหลังมีเคลือบด้านมาให้ในตัว ไม่คิดเพิ่ม"],
];

const SIDES = [
  ["พิมพ์ 1 ด้าน", drawn["sides-1"], "พิมพ์ลายด้านหน้า ด้านหลังเป็นกระดาษเปล่า"],
  ["พิมพ์ 2 ด้าน", drawn["sides-2"], "พิมพ์ลายทั้งสองด้าน ด้านหลังใช้คนละลายได้"],
];

const FOIL_FRONT = [
  ["ไม่เคลือบฟอยล์", drawn["foil-none"], "งานพิมพ์สีปกติ ไม่มีฟอยล์"],
  ["พิมพ์ 1 เลเยอร์ / 1 ด้าน", own("foil-1layer-info"), "ปั๊มฟอยล์อย่างเดียวบนกระดาษเปล่า ลายเป็นสีฟอยล์ล้วน"],
  ["พิมพ์ 2 เลเยอร์ / 1 ด้าน", own("foil-2layer-info"), "พิมพ์สีก่อนแล้วปั๊มฟอยล์ทับ ได้ทั้งลายสีและฟอยล์"],
];

const FOIL_BACK = [
  ["ไม่เคลือบฟอยล์ด้านหลัง", drawn["foil-none"], "ด้านหลังไม่ปั๊มฟอยล์"],
  ["พิมพ์ 1 เลเยอร์ (ด้านหลัง)", own("foil-1layer-info"), "ปั๊มฟอยล์อย่างเดียวที่ด้านหลัง ลายเป็นสีฟอยล์ล้วน"],
  ["พิมพ์ 2 เลเยอร์ (ด้านหลัง)", own("foil-2layer-info"), "พิมพ์สีที่ด้านหลังแล้วปั๊มฟอยล์ทับ"],
];

const FOIL_COLOR = [
  ["สีเงิน", own("foil-silver"), "ฟอยล์สีเงินเงาวาว"],
  ["สีทอง", own("foil-gold"), "ฟอยล์สีทองเงาวาว"],
  ["สีโรสโกลด์", own("foil-rosegold"), "ฟอยล์สีโรสโกลด์ โทนชมพูทอง"],
  ["สีโฮโลแกรม", own("foil-hologram"), "ฟอยล์โฮโลแกรมไล่สีรุ้ง"],
];

/** กลุ่มที่จะเปลี่ยนเป็นการ์ด + ติดภาพ (ชื่อกลุ่มต้องตรงเป๊ะ ไม่มีก็หยุด) */
const JOBS = [
  { label: "พิมพ์กี่ด้าน", items: SIDES },
  { label: "เคลือบ (เฉพาะด้านหน้า)", items: COAT_FRONT },
  { label: "เคลือบ", items: FILMS },
  { label: "เคลือบด้านหลัง", items: COAT_BACK },
  { label: "ผิวฟิล์มพิเศษ (ด้านหลัง)", items: FILMS },
  { label: "เคลือบฟอยล์", items: FOIL_FRONT },
  { label: "สีฟอยล์", items: FOIL_COLOR },
  { label: "เคลือบฟอยล์ด้านหลัง", items: FOIL_BACK },
  { label: "สีฟอยล์ (ด้านหลัง)", items: FOIL_COLOR },
];

/* ── เขียนลงข้อมูลสินค้า ─────────────────────────────────────────── */

const { data: rows, error } = await sb.from("products").select("name,data").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = structuredClone(row.data);

for (const job of JOBS) {
  const g = (d.options ?? []).find((o) => o.label === job.label);
  if (!g) die(`ไม่เจอกลุ่ม "${job.label}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  const names = (g.choices ?? []).map((c) => c.name);
  const missing = job.items.map(([n]) => n).filter((n) => !names.includes(n));
  if (missing.length) die(`กลุ่ม "${job.label}" ไม่มีตัวเลือก: ${missing.join(" · ")}`);
  const extra = names.filter((n) => !job.items.some(([x]) => x === n));
  if (extra.length) die(`กลุ่ม "${job.label}" มีตัวเลือกที่ยังไม่มีภาพ: ${extra.join(" · ")}`);

  const was = g.display ?? "-";
  g.display = "cards";
  for (const [name, src, desc] of job.items) {
    const c = g.choices.find((x) => x.name === name);
    c.imageSrc = src;
    c.desc = desc;
  }
  console.log(`■ ${job.label} — display ${was} → cards · ติดภาพ+คำอธิบาย ${job.items.length} ตัวเลือก`);
  for (const [name, src] of job.items) console.log(`   - ${name} → ${src.split("/").slice(-2).join("/")}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

for (const n of DRAWN) {
  const path = `products/${ID}/${n}-${REV}.jpg`;
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(path, drawnBuf[n], { contentType: "image/jpeg", upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) die(upErr.message);
  console.log(`⬆️  ${n}-${REV}.jpg ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) die(saveErr.message);

// อ่านกลับ + เปิดภาพจริงทุกใบ กันตั้ง URL ผิดแล้วขึ้นการ์ดว่าง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const srcs = new Set();
for (const job of JOBS) {
  const g = back[0].data.options.find((o) => o.label === job.label);
  if (g.display !== "cards") die(`${job.label}: อ่านกลับแล้ว display ไม่ใช่ cards`);
  for (const c of g.choices) srcs.add(c.imageSrc);
}
for (const src of srcs) {
  const res = await fetch(src);
  console.log(`   ${res.ok ? "✓" : "✗"} HTTP ${res.status} ${src.split("/").slice(-2).join("/")}`);
  if (!res.ok) die("เปิดภาพไม่ได้ — ยังไม่เสร็จ");
}
console.log("\n✅ บันทึกแล้ว (ยืนยันจากการอ่านกลับและเปิดภาพครบทุกใบ)");

#!/usr/bin/env node
/**
 * SHOPPING BAG (id 20x34-5cm) — กลุ่ม "แบบ" ให้มีรูปประจำแบบ กดเลือกแล้วภาพเปลี่ยนตาม
 *
 *   node scripts/shopping-bag-pattern-images.mjs           # ดูก่อน
 *   node scripts/shopping-bag-pattern-images.mjs --write   # อัปรูป + เขียนสินค้า
 *
 * ที่มารูป: หน้า pricelists /premiumbag หัวข้อ "SHOPPING BAG แบบ A..E" — แต่ละหัวข้อมีรูปวัดขนาด
 * ของตัวเอง (รูปอยู่ **ก่อน** หัวข้อในหน้า HTML ราว 2,400 ตัวอักษร) ดึงสดทุกครั้งที่รัน
 *
 * ทำ 3 อย่าง:
 *  1. rehost รูป A-E ที่ products/20x34-5cm/pattern-<X>-v1.jpg (1000×1000 จากต้นทาง Wix)
 *  2. กลุ่ม "แบบ" → display cards + imageSrc + desc (ขนาด + รูปแบบพับ/สายรัด ตามป้ายในรูป)
 *  3. images[0] (เดิมเป็นรูปแบบ E บน wixstatic) → ชี้ไฟล์ pattern-E ตัวเดียวกับ choice
 *     ไม่งั้นแกลเลอรีจะมีรูปแบบ E ซ้ำสองใบ (galleryImages ดูด choice.imageSrc เข้ามาเอง)
 *
 * ⚠️ "แบบ" เป็นแกนตารางราคา (driverLabels ["แบบ"]) — ห้ามแก้ชื่อตัวเลือก คีย์ cells จะหลุด
 * ⚠️ เรทแรกเก็บ 2 ที่ (data.pricing + priceRates[0].pricing) — สคริปต์นี้ไม่แตะราคา แต่ตรวจว่ายังตรงกัน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "20x34-5cm";
const FOLDER = `products/${ID}`;
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/premiumbag";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const PUB = `${SUPA}/storage/v1/object/public/product-images`;
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

/** คำอธิบายใต้ชื่อบนการ์ด — ตัวเลขตรงกับป้ายที่พิมพ์ในรูปของแต่ละแบบ */
const DESC = {
  A: "แบบกระเป๋าพับเก็บได้ · ใบเล็ก ก้นถุงกว้าง 16 ซม.",
  B: "แบบสายรัดเก็บได้ · ก้นถุง 10 ซม.",
  C: "แบบกระเป๋าพับเก็บได้ · ใบใหญ่ หูหิ้วแยก 2 เส้น",
  D: "แบบกระเป๋าพับเก็บได้ · ใบใหญ่ ปากกว้าง หูหิ้วโค้ง",
  E: "แบบสายรัดเก็บได้ · ก้นถุง 10 ซม.",
};
const LETTERS = ["A", "B", "C", "D", "E"];
const fileOf = (L) => `pattern-${L}-${V}.jpg`;
const urlOf = (L) => `${PUB}/${FOLDER}/${fileOf(L)}`;

/* ── 1) หารูปประจำแบบจากหน้าเว็บ (ดึงสด) ── */
const html = await (await fetch(PAGE)).text();
const picks = {};
for (const L of LETTERS) {
  const heads = [...html.matchAll(new RegExp(`SHOPPING BAG แบบ ${L}`, "g"))].map((m) => m.index);
  if (heads.length !== 1) die(`หัวข้อ "SHOPPING BAG แบบ ${L}" เจอ ${heads.length} จุด (คาด 1) — โครงหน้าเว็บเปลี่ยน`);
  const before = html.slice(Math.max(0, heads[0] - 4000), heads[0]);
  const imgs = [...before.matchAll(/static\.wixstatic\.com\/media\/(959b83_[0-9a-f]+~mv2\.jpg)/g)].map((m) => m[1]);
  const last = [...new Set(imgs)].pop();
  if (!last) die(`ไม่เจอรูปก่อนหัวข้อแบบ ${L}`);
  picks[L] = last;
}
const uniq = new Set(Object.values(picks));
if (uniq.size !== LETTERS.length) die(`รูป 5 แบบซ้ำกัน: ${JSON.stringify(picks)}`);
console.log("🖼  รูปประจำแบบจากหน้าเว็บ:");
for (const L of LETTERS) console.log(`   ${L} → ${picks[L]}`);

/* ── 2) rehost ขึ้น storage ── */
if (WRITE) {
  for (const L of LETTERS) {
    const src = `https://static.wixstatic.com/media/${picks[L]}/v1/fill/w_1000,h_1000,al_c,q_90/file.jpg`;
    const res = await fetch(src);
    if (!res.ok) die(`โหลดรูปแบบ ${L} ไม่ได้ (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20000) die(`รูปแบบ ${L} เล็กผิดปกติ (${buf.length} bytes)`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`${FOLDER}/${fileOf(L)}`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) die(`อัปรูปแบบ ${L} ไม่ได้: ${error.message}`);
    console.log(`   ↑ ${fileOf(L)} (${buf.length} bytes)`);
  }
}

/* ── 3) เขียนสินค้า ── */
const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (error) die(error.message);
if (!row) die(`ไม่เจอสินค้า ${ID}`);

const data = structuredClone(row.data);
// ⚠️ สินค้าอาจมีกลุ่มชื่อซ้ำกันคนละ showWhen — วนทุกกลุ่ม อย่าใช้ .find()
const groups = (data.options || []).filter((o) => o.label === "แบบ");
if (!groups.length) die('ไม่เจอกลุ่มตัวเลือก "แบบ"');
for (const grp of groups) {
  if (grp.choices.length !== LETTERS.length) die(`กลุ่ม "แบบ" มี ${grp.choices.length} ตัวเลือก (คาด 5)`);
  grp.display = "cards";
  grp.choices = grp.choices.map((c) => {
    const ch = typeof c === "string" ? { name: c } : { ...c };
    const L = (ch.name.match(/แบบ\s*([A-E])/) || [])[1];
    if (!L) die(`ตัวเลือก "${ch.name}" อ่านตัวอักษรแบบไม่ออก`);
    return { ...ch, imageSrc: urlOf(L), desc: DESC[L] };
  });
}

// แกลเลอรี: รูปแรกเดิมคือแบบ E บน wixstatic → ชี้ไฟล์เดียวกับ choice กันภาพซ้ำ
const before0 = data.images?.[0]?.src;
if (data.images?.[0]) data.images[0] = { ...data.images[0], src: urlOf("E") };
data.imageSrc = urlOf("E");

console.log(`\n📄 กลุ่ม "แบบ" (${groups.length} กลุ่ม) → การ์ด + รูป + คำอธิบาย 5 แบบ`);
for (const c of groups[0].choices) console.log(`   · ${c.name} — ${c.desc}`);
console.log(`🖼  images[0]: ${before0?.slice(0, 60)}… → ${fileOf("E")}`);

// ราคาไม่ถูกแตะ — ตรวจว่าเรทแรกกับเงายังตรงกัน (ถ้าไม่ตรงแปลว่าเคยโดนบันทึกทับ)
const shadow = data.priceRates?.[0]?.pricing;
if (shadow && JSON.stringify(Object.keys(shadow.cells || {}).sort()) !== JSON.stringify(Object.keys(data.pricing?.cells || {}).sort()))
  die("data.pricing กับ priceRates[0].pricing คีย์ไม่ตรงกัน — ต้องตรวจราคาก่อน");

if (!WRITE) {
  console.log("\n(dry-run) ใส่ --write เพื่อเขียนจริง");
  process.exit(0);
}

data.savedAt = new Date().toISOString();
const { data: back, error: upErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (upErr) die(`เขียนไม่ได้: ${upErr.message}`);
if (!back?.length) die("update โดน 0 แถว");

const back2 = (back[0].data.options || []).filter((o) => o.label === "แบบ");
if (back2.length !== groups.length) die(`อ่านกลับได้ ${back2.length} กลุ่ม (เขียนไป ${groups.length})`);
for (const g2 of back2) {
  if (g2.display !== "cards") die(`display ไม่ลง (${g2.display})`);
  for (const c of g2.choices) {
    const L = (c.name.match(/แบบ\s*([A-E])/) || [])[1];
    if (c.imageSrc !== urlOf(L)) die(`imageSrc ของ "${c.name}" ไม่ลง`);
    if (c.desc !== DESC[L]) die(`desc ของ "${c.name}" ไม่ลง`);
  }
}
if (back[0].data.images?.[0]?.src !== urlOf("E")) die("images[0] ไม่ลง");
for (const L of LETTERS) {
  const head = await fetch(urlOf(L), { method: "HEAD" });
  if (!head.ok) die(`รูป ${fileOf(L)} เปิดไม่ได้ (${head.status})`);
}
console.log("\n✅ เขียนแล้ว · อ่านกลับตรงทุกช่อง · รูปทั้ง 5 เปิดได้");

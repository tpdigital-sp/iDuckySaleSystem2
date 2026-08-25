/**
 * แก้วมัค 11 ออนซ์ (mug-11oz): กลุ่ม "ประเภท" (แก้วขาว/ใส/ขาวขุ่น) → การ์ดมีรูป+คำอธิบาย
 * (display: cards ทรงเดียวกับแผงเรทราคา — ผู้ใช้สั่งเพิ่มสินค้าตัวนี้ 25 ส.ค. 69)
 *
 *   npx tsx scripts/mug-type-cards.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/mug-type-cards.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * ภาพประจำตัวเลือก: ครอปจากรูปแกลเลอรีใบที่ 3 (เทียบแก้ว 3 แบบเรียงกัน ใส-ขาว-ขาวขุ่น)
 * คำอธิบายอิงข้อควรทราบเดิมของสินค้า (แก้วขุ่นสีอ่อนกว่าขาว 30-50% · แก้วใสงานพิมพ์โปร่งแสง)
 * ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก — "ประเภท" เป็นแกนตารางราคา (driverLabels)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const ID = "mug-11oz";
const V = "v1";
const GROUP = "ประเภท";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const { data: row, error: readErr } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr || !row) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const product = row.data as Product;

/** รูปเทียบ 3 แบบ = แกลเลอรีใบที่ 3 (index 2) — ตรวจว่ายังเป็นใบเดิมก่อนครอป */
const compareSrc = product.images?.[2]?.src;
if (!compareSrc || !/3cd68c01/.test(compareSrc))
  throw new Error(`แกลเลอรีใบที่ 3 ไม่ใช่รูปเทียบ 3 แบบ (ได้ ${compareSrc}) — แกลเลอรีอาจถูกจัดใหม่ ตรวจกรอบครอปก่อน`);
const compareBuf = Buffer.from(await (await fetch(compareSrc)).arrayBuffer());
const meta = await sharp(compareBuf).metadata();
if (meta.width !== 1200) throw new Error(`ขนาดรูปเทียบไม่ใช่ 1200px (ได้ ${meta.width}) — กรอบครอปคำนวณจาก 1200 ตรวจก่อน`);

/** กรอบครอปบนรูป 1200×848 — ซ้าย: แก้วใส · กลาง: แก้วขาว · ขวา: แก้วขาวขุ่น */
const CROPS: Record<string, { left: number; top: number; width: number; height: number }> = {
  "type-clear": { left: 55, top: 150, width: 420, height: 420 },
  "type-white": { left: 400, top: 235, width: 420, height: 420 },
  "type-frosted": { left: 770, top: 165, width: 420, height: 420 },
};

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const art: Record<string, string> = {};
for (const [name, box] of Object.entries(CROPS))
  art[name] = await put(name, await sharp(compareBuf).extract(box).jpeg({ quality: 90 }).toBuffer());

/** ชื่อตัวเลือก (ห้ามเปลี่ยน — คอลัมน์ตารางราคา) → รูป + คำอธิบาย */
const CARD: Record<string, { img: string; desc: string }> = {
  "แก้วขาว": { img: art["type-white"], desc: "แก้วเซรามิกขาวทึบ สีพิมพ์สดชัดที่สุด — แบบมาตรฐานที่นิยมสั่ง" },
  "แก้วใส": { img: art["type-clear"], desc: "แก้วใสมองทะลุได้ งานพิมพ์เป็นสีโปร่งแสง — ลายสีอ่อนจะมองเห็นยาก" },
  "แก้วขาวขุ่น": { img: art["type-frosted"], desc: "แก้วเนื้อขุ่นผิวฝ้า ลุคนุ่มละมุน — สีพิมพ์อ่อนกว่าแก้วขาวราว 30-50%" },
};

const opt = product.options.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่พบกลุ่ม "${GROUP}" ในสินค้า — ตรวจก่อน`);
const missing = Object.keys(CARD).filter((n) => !opt.choices.some((c) => c.name === n));
if (missing.length) throw new Error(`ไม่พบตัวเลือก ${missing.join(", ")} — ชื่อใน DB อาจเปลี่ยน ตรวจก่อน`);
opt.display = "cards";
for (const c of opt.choices) {
  const card = CARD[c.name];
  if (!card) continue;
  c.imageSrc = card.img;
  c.desc = card.desc;
}
product.savedAt = new Date().toISOString();

console.log(`📦 ${row.name} (${ID})${product.hidden ? " · ร่าง" : " · เผยแพร่อยู่"}`);
console.log(`   「${GROUP}」→ การ์ด ${opt.choices.length} ใบ (รูปครอปจากภาพเทียบ 3 แบบ + คำอธิบายครบ)`);
for (const c of opt.choices) console.log(`   - ${c.name}: ${c.desc}`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", ID);
if (writeErr) throw new Error(`บันทึกไม่สำเร็จ: ${writeErr.message}`);
const { data: check } = await sb.from("products").select("data->>savedAt").eq("id", ID).single();
if ((check as { savedAt?: string } | null)?.savedAt !== product.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log(`\n✅ อัปรูป + บันทึกแล้ว — http://localhost:3005/products/${ID}`);

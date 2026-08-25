/**
 * CASE AIRPODS: เปลี่ยนภาพการ์ดกลุ่ม "แบบสกรีน" เป็นรูปที่ผู้ใช้ชี้จากแกลเลอรีหน้า pricelists
 * (ผู้ใช้ส่งลิงก์ pgid ทั้ง 3 ใบมาเอง 25 ส.ค. 69 — แทนชุดแรกที่ผมเลือกให้ใน case-airpods-cards.mts)
 *
 *   npx tsx scripts/case-airpods-screen-art-v2.mts            # ดูข้อมูลที่จะบันทึก
 *   npx tsx scripts/case-airpods-screen-art-v2.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * mapping จาก pgid → mediaUrl (อ่านจาก comp-ltqmq86h3_galleryData ในหน้า /caseairpods):
 *   สกรีนบอดี้ 1 ด้าน        → DSC09116 (959b83_ba906ab9…) เคสขาว/ใสลายหมา สกรีนบอดี้ด้านหน้า
 *   สกรีนบอดี้ 2 ด้าน และ ฝา  → DSC03616 (959b83_2331958d…) เคสนิ่มพาสเทล สกรีนทั้งฝาและบอดี้
 *   สกรีนบอดี้ หรือ ฝา        → DSC00175 (959b83_1936665d…) เคสใสขุ่น 3 ใบบนถาดไม้
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ -v2 · ครั้งหน้า -v3
 * ⚠️ อย่ารัน case-airpods-cards.mts --write ซ้ำหลังจากนี้ (จะดึงภาพกลับเป็นชุด v1)
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
const ID = "case-airpods";
const GROUP = "แบบสกรีน";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const { data: row, error: readErr } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr || !row) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const product = row.data as Product;

async function wix(id: string, expectWidth: number): Promise<Buffer> {
  const buf = Buffer.from(await (await fetch(`https://static.wixstatic.com/media/${id}`)).arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (meta.width !== expectWidth)
    throw new Error(`รูป ${id} กว้าง ${meta.width} ไม่ตรงที่คาด (${expectWidth}) — ต้นทางอาจเปลี่ยน ตรวจกรอบครอปก่อน`);
  return buf;
}
async function put(file: string, buf: Buffer): Promise<string> {
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}
const crop = (src: Buffer, box: sharp.Region) =>
  sharp(src).extract(box).resize({ width: 600 }).jpeg({ quality: 88 }).toBuffer();

const ART: Record<string, string> = {
  "สกรีนบอดี้ 1 ด้าน": await put(
    "screen-1side-v2.jpg",
    await crop(await wix("959b83_ba906ab905204e0aae3b516453a42e3d~mv2.jpg", 4755), { left: 760, top: 1000, width: 2560, height: 2560 })
  ),
  "สกรีนบอดี้ 2 ด้าน และ ฝา": await put(
    "screen-2side-lid-v2.jpg",
    await crop(await wix("959b83_2331958d91ac43e48f3a6c2968b3d536~mv2.jpg", 5089), { left: 745, top: 108, width: 3600, height: 3600 })
  ),
  "สกรีนบอดี้ หรือ ฝา": await put(
    "screen-body-or-lid-v2.jpg",
    await crop(await wix("959b83_1936665d72cf4a438532dbaf39737e45~mv2.jpg", 4419), { left: 660, top: 150, width: 3100, height: 3100 })
  ),
};

const opt = product.options.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่พบกลุ่ม "${GROUP}" — ตรวจก่อน`);
const missing = Object.keys(ART).filter((n) => !opt.choices.some((c) => c.name === n));
if (missing.length) throw new Error(`ไม่พบตัวเลือก ${missing.join(", ")} — ชื่อใน DB อาจเปลี่ยน ตรวจก่อน`);
for (const c of opt.choices) if (ART[c.name]) c.imageSrc = ART[c.name];
product.savedAt = new Date().toISOString();

console.log(`📦 ${row.name} (${ID})${product.hidden ? " · ร่าง" : " · เผยแพร่อยู่"}`);
for (const c of opt.choices) console.log(`   - ${c.name} → ${c.imageSrc?.split("/").pop()}`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", ID);
if (writeErr) throw new Error(`บันทึกไม่สำเร็จ: ${writeErr.message}`);
const { data: check } = await sb.from("products").select("data->>savedAt").eq("id", ID).single();
if ((check as { savedAt?: string } | null)?.savedAt !== product.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log(`\n✅ เปลี่ยนภาพการ์ดแบบสกรีนแล้ว — http://localhost:3005/products/${ID}`);

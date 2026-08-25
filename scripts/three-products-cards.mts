/**
 * การ์ดตัวเลือก (display: cards) + ภาพครอปจากแกลเลอรี ให้ 3 สินค้าที่ผู้ใช้สั่ง 25 ส.ค. 69:
 *   • frame-card (Frame Card การ์ดใส)     — ชิ้นงาน (เจาะรู/ไม่เจาะรู มีรูป) · สกรีนกี่ด้าน · ตะขอโซ่ไข่ปลา
 *   • coaster-ceramic (Ceramic Coaster)   — รูปทรง (กลม/สี่เหลี่ยม/หกเหลี่ยม มีรูปครอปจากภาพเทียบ 3 ทรง)
 *   • cardholder-clear (CARD HOLDER ใส)   — สกรีน (1/2 ด้าน — คำอธิบายอย่างเดียว ไม่มีรูปแยก)
 *
 *   npx tsx scripts/three-products-cards.mts            # ดูข้อมูลที่จะบันทึก
 *   npx tsx scripts/three-products-cards.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก (แกนตารางราคา + เป้า showWhen เช่น สีตะขอ โผล่เมื่อเลือกตะขอแบบสี)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Box = { left: number; top: number; width: number; height: number };
/** ครอปจากรูปแกลเลอรี: [index ในแกลเลอรี, ลายเซ็นชื่อไฟล์กันแกลเลอรีถูกจัดใหม่, กรอบ (คำนวณจากรูปกว้าง 1200)] */
type CropSpec = { imgIndex: number; sig: RegExp; box: Box };
type CardSpec = { desc: string; crop?: CropSpec; cropName?: string };
type Plan = { group: string; cards: Record<string, CardSpec> }[];

const PLANS: Record<string, Plan> = {
  "frame-card": [
    {
      group: "ชิ้นงาน",
      cards: {
        "เจาะรู": {
          desc: "เจาะรูมุมการ์ด พร้อมใส่โซ่ไข่ปลา ห้อยกระเป๋า/ทำพวงกุญแจได้",
          cropName: "work-hole",
          crop: { imgIndex: 0, sig: /a0ee4cfc/, box: { left: 260, top: 80, width: 440, height: 440 } },
        },
        "ไม่เจาะรู": {
          desc: "การ์ดเรียบไม่เจาะรู เหมาะเก็บสะสม/ตั้งโชว์",
          cropName: "work-nohole",
          crop: { imgIndex: 4, sig: /ce8de35f/, box: { left: 400, top: 60, width: 480, height: 480 } },
        },
      },
    },
    {
      group: "สกรีนกี่ด้าน",
      cards: {
        "สกรีน 1 ด้าน": { desc: "พิมพ์ลายด้านเดียว" },
        "สกรีน 2 ด้าน": { desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้" },
      },
    },
    {
      group: "ตะขอโซ่ไข่ปลา",
      cards: {
        "ตะขอ Z2 โซ่ไข่ปลาสีเงิน": { desc: "โซ่ไข่ปลาสีเงิน พร้อมตะขอ Z2 เกี่ยวกระเป๋า/ห้อยของได้" },
        "โซ่ไข่ปลาสีเงินแบบสี": { desc: "โซ่ไข่ปลาสีเงิน คู่ตะขอแบบสี — เลือกสีตะขอได้ด้านล่าง" },
        "❌ ไม่รับตะขอ": { desc: "รับเฉพาะการ์ดเจาะรู ไม่ใส่โซ่/ตะขอ" },
      },
    },
  ],
  "coaster-ceramic": [
    {
      group: "รูปทรง",
      cards: {
        "ทรงกลม": {
          desc: "ทรงกลมคลาสสิก เข้าได้กับทุกโต๊ะ",
          cropName: "shape-round",
          crop: { imgIndex: 3, sig: /8b1ab94d/, box: { left: 30, top: 230, width: 380, height: 380 } },
        },
        "ทรงสี่เหลี่ยม": {
          desc: "ทรงสี่เหลี่ยมมุมโค้ง ลุคเรียบโมเดิร์น",
          cropName: "shape-square",
          crop: { imgIndex: 3, sig: /8b1ab94d/, box: { left: 415, top: 230, width: 380, height: 380 } },
        },
        "ทรงหกเหลี่ยม": {
          desc: "ทรงหกเหลี่ยม วางเรียงต่อกันเป็นแพทเทิร์นสวย",
          cropName: "shape-hex",
          crop: { imgIndex: 3, sig: /8b1ab94d/, box: { left: 790, top: 230, width: 380, height: 380 } },
        },
        "ทรงสัตว์เลี้ยง": { desc: "ไดคัทตามรูปทรงสัตว์เลี้ยง/คาแรกเตอร์ในลายของคุณ" },
      },
    },
  ],
  "cardholder-clear": [
    {
      group: "สกรีน",
      cards: {
        "ราคาสกรีน 1 ด้าน": { desc: "พิมพ์ลายด้านหน้าด้านเดียว" },
        "ราคาสกรีน 2 ด้าน": { desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้" },
      },
    },
  ],
};

for (const [id, plan] of Object.entries(PLANS)) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error || !row) throw new Error(`อ่านสินค้า ${id} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
  const product = row.data as Product;
  console.log(`\n📦 ${row.name} (${id})${product.hidden ? " · ร่าง" : " · เผยแพร่อยู่"}`);

  const bufCache = new Map<string, Buffer>();
  async function galleryBuf(spec: CropSpec): Promise<Buffer> {
    const src = product.images?.[spec.imgIndex]?.src;
    if (!src || !spec.sig.test(src))
      throw new Error(`${id}: แกลเลอรีใบที่ ${spec.imgIndex + 1} ไม่ตรงลายเซ็น ${spec.sig} (ได้ ${src}) — แกลเลอรีอาจถูกจัดใหม่ ตรวจกรอบครอปก่อน`);
    if (!bufCache.has(src)) bufCache.set(src, Buffer.from(await (await fetch(src)).arrayBuffer()));
    return bufCache.get(src)!;
  }
  async function put(name: string, buf: Buffer): Promise<string> {
    const file = `${name}-v1.jpg`;
    const publicUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${id}/${file}`;
    if (!WRITE) return publicUrl;
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${id}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
    return publicUrl;
  }

  for (const { group, cards } of plan) {
    const opt = product.options.find((o) => o.label === group);
    if (!opt) throw new Error(`${id}: ไม่พบกลุ่ม "${group}" — ตรวจก่อน`);
    const missing = Object.keys(cards).filter((n) => !opt.choices.some((c) => c.name === n));
    if (missing.length) throw new Error(`${id} · ${group}: ไม่พบตัวเลือก ${missing.join(", ")} — ตรวจชื่อก่อน`);
    opt.display = "cards";
    for (const c of opt.choices) {
      const spec = cards[c.name];
      if (!spec) continue;
      c.desc = spec.desc;
      if (spec.crop && spec.cropName) {
        const meta = await sharp(await galleryBuf(spec.crop)).metadata();
        if (meta.width !== 1200)
          throw new Error(`${id}: รูปต้นทางไม่ใช่ 1200px (ได้ ${meta.width}) — กรอบครอปคำนวณจาก 1200 ตรวจก่อน`);
        c.imageSrc = await put(spec.cropName, await sharp(await galleryBuf(spec.crop)).extract(spec.crop.box).jpeg({ quality: 90 }).toBuffer());
      }
    }
    const withImg = opt.choices.filter((c) => cards[c.name]?.crop).length;
    console.log(`   「${group}」→ การ์ด ${opt.choices.length} ใบ (รูปครอป ${withImg} · คำอธิบายครบ)`);
  }

  product.savedAt = new Date().toISOString();
  if (!WRITE) continue;
  const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", id);
  if (writeErr) throw new Error(`บันทึก ${id} ไม่สำเร็จ: ${writeErr.message}`);
  const { data: check } = await sb.from("products").select("data->>savedAt").eq("id", id).single();
  if ((check as { savedAt?: string } | null)?.savedAt !== product.savedAt)
    throw new Error(`${id}: อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ`);
  console.log("   ✅ บันทึกแล้ว");
}

if (!WRITE) console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");

/**
 * ปรับสินค้า "เสื้อยืด ทรง UNISEX (พิมพ์ลายเต็มตัว)" (id: unisex)
 * ให้ตรงกับตารางราคาเว็บ iduckyofficial-pricelists.com/tshirtprinting + ใส่ภาพประกอบทุกตัวเลือก
 *
 *   npx tsx scripts/add-unisex-fullprint.ts                    # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-unisex-fullprint.ts --upload --images=<dir>  # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-unisex-fullprint.ts --write            # เขียนลง Supabase
 *
 * ตารางราคาบนเว็บ (ตรงกับที่มีอยู่แล้วในระบบ — ไม่ได้แก้ตัวเลข):
 *   จำนวน            Size S,M,L   Size XL,2XL,3XL
 *   1-10 ตัว            350            380
 *   11-29 ตัว           280            300
 *   30-49 ตัว           250            280
 *   50-99 ตัว           220            240
 *   100-199 ตัว         190            210
 *   200 ตัวขึ้นไป        180            200
 * เงื่อนไขใต้ตาราง: 1-10 ตัว คละลายได้อิสระ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป
 *   → เก็บเป็นเรทราคา 1 เรท (freeMixBelowQty 11 · minPerDesign 3) แทนตารางเปล่า ๆ แบบเดิม
 *
 * ภาพประกอบ — ดึงจากหน้าเดียวกัน (static.wixstatic.com/media/<id>) ย่อเหลือกว้าง 1400 px คุณภาพ 85:
 *   gallery-1 959b83_d88f61dca6df4c09a2fd980472d1f73e~mv2.png  เสื้อวางราบ ด้านหน้า
 *   gallery-2 959b83_ed49456d772343bda01432bf08fe03ff~mv2.png  หน้า+หลัง
 *   gallery-3 959b83_e90d5f3e114446e196ba7b34b3c7e4a0~mv2.png  นายแบบ
 *   gallery-4 959b83_6173967050e844d8b593882d7065c342~mv2.png  คู่ชาย-หญิง
 *   gallery-5 959b83_0af7f4df49324793acc4987c720d7449~mv2.png  หน้า+หลังบนตัวจริง
 *   gallery-6 959b83_19efffb25f6840b39821ca693c8bc041~mv2.png  นางแบบ
 *   gallery-7 959b83_7f8ad05b8f76401ca987613b630862cd~mv2.png  นางแบบ (2)
 *   gallery-8 959b83_02d85d4c964445f1b61c785f09c4b96b~mv2.png  ระยะใกล้ เห็นเนื้อผ้า/งานพิมพ์
 *   size-chart 959b83_54faf294bccd49a9b2236d8fc6d215f7~mv2.jpg ตารางไซซ์ของเว็บ (แท็บ "Size เสื้อ")
 *             ครอปเฉพาะบล็อก UNISEX ของเสื้อไม่มียี่ห้อ (กลุ่มที่ระบุว่าพิมพ์ Sublimation ได้)
 *   size-s … size-3xl  การ์ดไซซ์รายตัว วาดขึ้นจากตัวเลขในตารางเดียวกัน (รอบอก/ความยาว/ความยาวแขน)
 *             3XL ในตารางเว็บยังไม่มีตัวเลข → การ์ดเขียนว่าให้สอบถามแอดมิน
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceMatrix, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const UPLOAD = process.argv.includes("--upload");
const IMAGES_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ID = "unisex";
const FILES = [
  "gallery-1.jpg",
  "gallery-2.jpg",
  "gallery-3.jpg",
  "gallery-4.jpg",
  "gallery-5.jpg",
  "gallery-6.jpg",
  "gallery-7.jpg",
  "gallery-8.jpg",
  "size-chart.jpg",
  "size-s.jpg",
  "size-m.jpg",
  "size-l.jpg",
  "size-xl.jpg",
  "size-2xl.jpg",
  "size-3xl.jpg",
];
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

/** ตารางราคาเดิม (ตรงกับเว็บอยู่แล้ว) — เขียนไว้ตรงนี้ให้เห็นที่มาทั้งก้อน */
const PRICING: PriceMatrix = {
  unit: "ตัว",
  driverLabels: ["ขนาด"],
  tiers: [
    { upTo: 10, label: "1-10 ตัว" },
    { upTo: 29, label: "11-29 ตัว" },
    { upTo: 49, label: "30-49 ตัว" },
    { upTo: 99, label: "50-99 ตัว" },
    { upTo: 199, label: "100-199 ตัว" },
    { upTo: null, label: "200 ตัวขึ้นไป" },
  ],
  // เว็บคิดราคาเป็น 2 คอลัมน์ (S,M,L / XL,2XL,3XL) — ที่นี่แยกเป็นไซซ์ละบรรทัด
  // ให้ลูกค้าเลือกไซซ์ตรง ๆ ราคาแต่ละไซซ์ยังเท่ากับคอลัมน์เดิมทุกช่วง
  cells: {
    S: [350, 280, 250, 220, 190, 180],
    M: [350, 280, 250, 220, 190, 180],
    L: [350, 280, 250, 220, 190, 180],
    XL: [380, 300, 280, 240, 210, 200],
    "2XL": [380, 300, 280, 240, 210, 200],
    "3XL": [380, 300, 280, 240, 210, 200],
  },
};

const DETAIL_TAB = {
  title: "รายละเอียดเพิ่มเติม",
  text:
    "ลักษณะงาน::\n" +
    "• พิมพ์ลายเต็มตัว 360° (หน้า + หลัง + แขน + ปก) สีสด ระบายอากาศดี\n" +
    "• ระบบพิมพ์: Sublimation — พิมพ์ลงผ้าโดยตรงก่อนเย็บ\n" +
    "• เสื้อแขนสั้น คอกลม · ไซซ์ S M L XL 2XL 3XL\n" +
    "• ไม่มีขั้นต่ำในการสั่งผลิต\n\n" +
    "การคละลาย::\n" +
    "• จำนวน 1-10 ตัว สามารถคละลายได้ (คละได้ทุกตัว)\n" +
    "• จำนวน 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป\n\n" +
    "รายละเอียดเนื้อผ้า::\n" +
    "• วัสดุ: ผ้าไมโครเรียบ\n" +
    "• ผิวสัมผัสด้านนอก: เรียบ เนียน ไม่เป็นขน บางเบา ใส่สบาย ไม่แข็งกระด้าง แม้ผ่านความร้อนและการซัก\n" +
    "• เนื้อผ้ามีรูระบายเหงื่อ แห้งเร็ว ไม่ร้อน ไม่เหม็นอับ ผ้ายืดหยุ่น",
};

const SIZE_TAB = {
  title: "ตารางไซซ์",
  text:
    "ตารางไซซ์ UNISEX (หน่วยเป็นนิ้ว)::\n" +
    "• S — รอบอก 30 · ความยาว 24 · ความยาวแขน 7\n" +
    "• M — รอบอก 32 · ความยาว 26 · ความยาวแขน 8\n" +
    "• L — รอบอก 34 · ความยาว 28 · ความยาวแขน 9\n" +
    "• XL — รอบอก 39 · ความยาว 29.5 · ความยาวแขน 10.5\n" +
    "• 2XL — รอบอก 41 · ความยาว 31 · ความยาวแขน 10.5\n" +
    "• 3XL — สอบถามแอดมิน (ตารางไซซ์บนเว็บตารางราคายังไม่ได้ระบุ)\n\n" +
    "หมายเหตุ::\n" +
    "• แต่ละไซซ์อาจมีความคลาดเคลื่อน + - ไม่เกินครึ่งนิ้ว\n" +
    "• วัดรอบอก = วัดจากใต้วงแขนด้านหนึ่งไปอีกด้าน (ตามภาพ) · ความยาว = วัดจากไหล่ถึงชายเสื้อ",
  images: [IMG("size-chart")],
  imageSize: "lg" as const,
};

const product: Partial<Product> = {
  id: ID,
  name: "เสื้อยืด ทรง UNISEX (พิมพ์ลายเต็มตัว)",
  category: "apparel",
  price: 350,
  emoji: "👕",
  gradient: "from-sky-100 to-blue-200",
  imageSrc: IMG("gallery-1"),
  description:
    "เสื้อยืดทรง UNISEX คอกลม แขนสั้น พิมพ์ลายเต็มตัวรอบตัว 360° (หน้า + หลัง + แขน + ปก) " +
    "ด้วยระบบ Sublimation พิมพ์ลงผ้าโดยตรงก่อนเย็บ ลายจึงคมชัด สีสด ไม่ลอกไม่แตก และไม่มีแผ่นฟิล์มปิดทับให้ร้อน " +
    "เนื้อผ้าไมโครเรียบ บางเบา ยืดหยุ่น มีรูระบายเหงื่อ แห้งเร็ว ใส่สบายไม่เหม็นอับ " +
    "ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1-10 ตัวคละลายได้อิสระ สั่ง 11 ตัวขึ้นไปคละลายได้ ลายละ 3 ชิ้นขึ้นไป " +
    "มีไซซ์ S M L XL 2XL 3XL ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ 180 บาท",
  highlights: [
    "พิมพ์ลายเต็มตัว 360° — หน้า + หลัง + แขน + ปก",
    "ระบบ Sublimation พิมพ์ลงผ้าก่อนเย็บ ลายไม่ลอก ไม่ร้อน",
    "ผ้าไมโครเรียบ บางเบา ระบายอากาศดี แห้งเร็ว",
    "ไซซ์ S M L XL 2XL 3XL · ไม่มีขั้นต่ำในการสั่ง",
    "ยิ่งสั่งเยอะยิ่งถูก — 200 ตัวขึ้นไป เหลือตัวละ 180 บาท",
  ],
  images: [
    { emoji: "👕", gradient: "from-sky-100 to-blue-200", label: "เสื้อพิมพ์ลายเต็มตัว (ด้านหน้า)", src: IMG("gallery-1") },
    { emoji: "🔄", gradient: "from-sky-100 to-cyan-200", label: "ด้านหน้า + ด้านหลัง", src: IMG("gallery-2") },
    { emoji: "🧍", gradient: "from-blue-100 to-indigo-200", label: "ตัวอย่างเมื่อสวมใส่", src: IMG("gallery-3") },
    { emoji: "👫", gradient: "from-cyan-100 to-sky-200", label: "ใส่ได้ทั้งชาย-หญิง (UNISEX)", src: IMG("gallery-4") },
    { emoji: "↔️", gradient: "from-sky-100 to-blue-100", label: "ลายต่อเนื่องรอบตัว 360°", src: IMG("gallery-5") },
    { emoji: "✨", gradient: "from-indigo-100 to-blue-200", label: "ทรงใส่สบาย คอกลม แขนสั้น", src: IMG("gallery-6") },
    { emoji: "🎽", gradient: "from-blue-100 to-sky-200", label: "งานจริงบนตัวจริง", src: IMG("gallery-7") },
    { emoji: "🔍", gradient: "from-slate-100 to-sky-100", label: "ระยะใกล้ — เนื้อผ้าไมโครเรียบ + งานพิมพ์", src: IMG("gallery-8") },
    { emoji: "📏", gradient: "from-slate-100 to-blue-100", label: "ตารางไซซ์ UNISEX", src: IMG("size-chart") },
  ],
  options: [
    {
      label: "ขนาด",
      choices: [
        { name: "S", imageSrc: IMG("size-s") },
        { name: "M", imageSrc: IMG("size-m") },
        { name: "L", imageSrc: IMG("size-l") },
        { name: "XL", imageSrc: IMG("size-xl") },
        { name: "2XL", imageSrc: IMG("size-2xl") },
        { name: "3XL", imageSrc: IMG("size-3xl") },
      ],
    },
  ],
  pricing: PRICING,
  priceRates: [
    {
      id: "sublimation-fullprint",
      label: "พิมพ์ลายเต็มตัว 360° (Sublimation)",
      desc: "ผ้าไมโครเรียบ · พิมพ์หน้า + หลัง + แขน + ปก · คอกลม แขนสั้น",
      imageSrc: IMG("gallery-1"),
      // เงื่อนไขใต้ตารางราคาของเว็บ: 1-10 ตัวคละอิสระ · 11 ตัวขึ้นไป ลายละ 3 ชิ้นขึ้นไป
      freeMixBelowQty: 11,
      minPerDesign: 3,
      pricing: PRICING,
    },
  ],
  tabs: [DETAIL_TAB, SIZE_TAB],
};

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้>");
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name} (${Math.round(buf.length / 1024)} KB)`);
  }
}

async function main() {
  if (UPLOAD) await uploadImages();

  const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
  if (error || !row) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${error?.message}`);
  const current = row.data as Product;

  // ต่อยอดของเดิม: แท็บ "วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน" และ SEO เดิมเก็บไว้เหมือนเดิม
  const keepTabs = (current.tabs ?? []).filter(
    (t) => !["รายละเอียดเพิ่มเติม", "ตารางไซซ์"].includes(t.title)
  );
  const next: Product = {
    ...current,
    ...product,
    tabs: [...(product.tabs ?? []), ...keepTabs],
    savedAt: new Date().toISOString(),
  } as Product;
  // FAQ ข้อ "มีขนาดอะไรบ้าง" เขียนไว้ตั้งแต่ตอนที่ตัวเลือกยังรวมเป็น 2 กลุ่ม — อัปเดตให้ตรงกับไซซ์ที่แยกแล้ว
  if (next.seo?.faqs?.length) {
    next.seo = {
      ...next.seo,
      faqs: next.seo.faqs.map((f) =>
        f.q.includes("ขนาด")
          ? { ...f, a: "มีไซซ์ S M L XL 2XL 3XL — ไซซ์ S/M/L ราคาเดียวกัน ส่วน XL ขึ้นไปเพิ่มตัวละ 20-30 บาทตามช่วงจำนวน" }
          : f
      ),
    };
  }

  const range = priceRange(next);
  next.priceMin = range.min;
  next.priceMax = range.max;

  console.log(`📦 ${next.name}`);
  console.log(`   ราคา ${next.priceMin}-${next.priceMax} บาท/ตัว · ตัวเลือก ${next.options.length} กลุ่ม · รูป ${next.images.length} ภาพ`);
  console.log(`   แท็บ: ${(next.tabs ?? []).map((t) => t.title).join(" · ")}`);
  console.log(`   ภาพประจำตัวเลือก: ${next.options[0].choices.map((c) => `${c.name} → ${c.imageSrc?.split("/").pop()}`).join(" · ")}`);
  console.log(`   สถานะ: ${next.hidden ? "ฉบับร่าง (ยังไม่เผยแพร่)" : "เผยแพร่แล้ว"}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }
  const { error: upErr } = await sb.from("products").update({ data: next, name: next.name }).eq("id", ID);
  if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
  console.log("\n✅ บันทึกลง Supabase แล้ว");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

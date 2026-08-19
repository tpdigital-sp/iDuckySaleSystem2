/**
 * ปรับสินค้า "เสื้อกีฬา ทรง SPORT (พิมพ์ลายเต็มตัว)" (id: sport)
 * ให้ตรงกับตารางราคาเว็บ iduckyofficial-pricelists.com/tshirtprinting + ใส่ภาพประกอบทุกตัวเลือก
 * (สินค้ามีอยู่แล้วในระบบตั้งแต่รอบนำเข้าจากเว็บ — สคริปต์นี้เติมภาพ/รายละเอียด ไม่ได้สร้างตัวใหม่)
 *
 *   npx tsx scripts/add-sport-fullprint.ts                          # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-sport-fullprint.ts --upload --images=<dir>  # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-sport-fullprint.ts --write                  # เขียนลง Supabase
 *
 * ตารางราคาบนเว็บ (ตรงกับที่มีอยู่แล้วในระบบ — ไม่ได้แก้ตัวเลข):
 *   จำนวน            Size S,M,L   Size XL
 *   1-10 ตัว            350            380
 *   11-29 ตัว           280            300
 *   30-49 ตัว           250            280
 *   50-99 ตัว           220            240
 *   100-199 ตัว         190            210
 *   200 ตัวขึ้นไป        180            200
 * เงื่อนไขใต้ตาราง: 1-10 ตัว คละลายได้อิสระ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป
 *   → เก็บเป็นเรทราคา 1 เรท (freeMixBelowQty 11 · minPerDesign 3)
 *
 * ภาพประกอบ — ดึงจากบล็อก SPORT ของหน้าเดียวกัน (static.wixstatic.com/media/<id>) ย่อกว้าง 1400 px:
 *   gallery-1 959b83_558aa680decc4e59aa42efa80aa8ac4d~mv2.png  คู่ชาย-หญิง (ลานสเก็ต)
 *   gallery-2 959b83_0d102073eb1543adb64e57d35924559b~mv2.png  เล่นสเก็ตบอร์ด เห็นด้านหลัง
 *   gallery-3 959b83_b38f54af059740daae636a8a6a737ff8~mv2.png  ด้านหน้าเต็มตัว (ลายเขียว-ดำ)
 *   gallery-4 959b83_db26b3b6676d4f5ebadd1f3874298238~mv2.png  ลายขาว-แดง
 *   gallery-5 959b83_63bfe18f56614891a654695c2d081c7c~mv2.png  ใส่เล่นฟุตบอล
 *   gallery-6 959b83_8549fc8783d247f78ade8d4497c05aa6~mv2.png  ด้านหลัง เห็นชื่อ/เบอร์
 *   gallery-7 959b83_8440853c464d477cbed31c6bacfcbd6a~mv2.png  ใส่เล่นเทนนิส
 *   size-chart · size-s … size-xl  ตารางไซซ์ + การ์ดไซซ์รายตัว วาดเองจากตารางไซซ์ของทางร้าน
 *     (ทางร้านให้มา 19 ส.ค. 69 — ทรง SPORT มีถึง XL เท่านั้น)
 *       Size       S     M   L     XL
 *       รอบอก      39    42  45    48
 *       ความยาว    22.5  25  27.5  30    (หน่วยนิ้ว)
 *     ⚠️ อัปภาพใหม่ทับ "ชื่อไฟล์เดิม" ไม่ได้ — Next/CDN แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
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

const ID = "sport";
const FILES = [
  "gallery-1.jpg",
  "gallery-2.jpg",
  "gallery-3.jpg",
  "gallery-4.jpg",
  "gallery-5.jpg",
  "gallery-6.jpg",
  "gallery-7.jpg",
  "size-chart.jpg",
  "size-s.jpg",
  "size-m.jpg",
  "size-l.jpg",
  "size-xl.jpg",
];
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

/** ตารางราคาของเว็บ — แยกเป็นไซซ์ละบรรทัดให้ลูกค้าเลือกไซซ์ตรง ๆ (ราคาเท่าคอลัมน์เดิมทุกช่วง) */
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
  cells: {
    S: [350, 280, 250, 220, 190, 180],
    M: [350, 280, 250, 220, 190, 180],
    L: [350, 280, 250, 220, 190, 180],
    XL: [380, 300, 280, 240, 210, 200],
  },
};

const DETAIL_TAB = {
  title: "รายละเอียดเพิ่มเติม",
  text:
    "ลักษณะงาน::\n" +
    "• พิมพ์ลายเต็มตัว 360° (หน้า + หลัง + แขน + ปก) สีสด ระบายอากาศดี\n" +
    "• ระบบพิมพ์: Sublimation — พิมพ์ลงผ้าโดยตรงก่อนเย็บ\n" +
    "• เสื้อแขนสั้น คอกลม · ไซซ์ S M L XL\n" +
    "• ใส่ชื่อ/เบอร์หลังเสื้อ โลโก้ทีม หรือสปอนเซอร์ได้ในลายเดียวกัน ไม่คิดเพิ่ม\n" +
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
    "ตารางไซซ์ SPORT พิมพ์ลายเต็มตัว (หน่วยเป็นนิ้ว)::\n" +
    "• S — รอบอก 39 · ความยาว 22.5\n" +
    "• M — รอบอก 42 · ความยาว 25\n" +
    "• L — รอบอก 45 · ความยาว 27.5\n" +
    "• XL — รอบอก 48 · ความยาว 30\n\n" +
    "ราคาเริ่มต้น::\n" +
    "• ไซซ์ S / M / L — เริ่มต้น 350 บาท/ตัว\n" +
    "• ไซซ์ XL — เริ่มต้น 380 บาท/ตัว\n" +
    "• สั่งจำนวนมากราคาลดตามช่วง ต่ำสุด 180 บาท/ตัว (ดูตารางราคาในหน้าสั่งซื้อ)",
  images: [IMG("size-chart")],
  imageSize: "lg" as const,
};

const product: Partial<Product> = {
  id: ID,
  name: "เสื้อกีฬา ทรง SPORT (พิมพ์ลายเต็มตัว)",
  category: "apparel",
  price: 350,
  emoji: "🏅",
  gradient: "from-emerald-100 to-teal-200",
  imageSrc: IMG("gallery-1"),
  description:
    "เสื้อกีฬาทรง SPORT คอกลม แขนสั้น พิมพ์ลายเต็มตัวรอบตัว 360° (หน้า + หลัง + แขน + ปก) " +
    "ด้วยระบบ Sublimation พิมพ์ลงผ้าโดยตรงก่อนเย็บ ลายคมชัด สีสด ไม่ลอกไม่แตก และไม่มีแผ่นฟิล์มปิดทับให้ร้อน " +
    "เนื้อผ้าไมโครเรียบ บางเบา ยืดหยุ่น มีรูระบายเหงื่อ แห้งเร็ว เหมาะกับชุดทีมกีฬา ชุดวิ่ง ชุดกิจกรรมสี " +
    "ใส่ชื่อ-เบอร์หลังเสื้อ โลโก้ทีม หรือสปอนเซอร์ได้ในลายเดียวกัน " +
    "ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1-10 ตัวคละลายได้อิสระ สั่ง 11 ตัวขึ้นไปคละลายได้ ลายละ 3 ชิ้นขึ้นไป " +
    "มีไซซ์ S M L XL ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ 180 บาท",
  highlights: [
    "พิมพ์ลายเต็มตัว 360° — หน้า + หลัง + แขน + ปก",
    "ใส่ชื่อ-เบอร์รายคน / โลโก้ทีม / สปอนเซอร์ ได้ ไม่คิดเพิ่ม",
    "ระบบ Sublimation พิมพ์ลงผ้าก่อนเย็บ ลายไม่ลอก ไม่ร้อน",
    "ผ้าไมโครเรียบ ระบายเหงื่อ แห้งเร็ว เหมาะกับชุดทีม/ชุดกีฬาสี",
    "ยิ่งสั่งเยอะยิ่งถูก — 200 ตัวขึ้นไป เหลือตัวละ 180 บาท",
  ],
  images: [
    { emoji: "🏅", gradient: "from-emerald-100 to-teal-200", label: "เสื้อกีฬาพิมพ์ลายเต็มตัว", src: IMG("gallery-1") },
    { emoji: "🛹", gradient: "from-teal-100 to-emerald-200", label: "ลายต่อเนื่องรอบตัว 360°", src: IMG("gallery-2") },
    { emoji: "👕", gradient: "from-green-100 to-teal-100", label: "ด้านหน้าเต็มตัว", src: IMG("gallery-3") },
    { emoji: "🎽", gradient: "from-rose-100 to-orange-100", label: "อีกลายตัวอย่าง (ขาว-แดง)", src: IMG("gallery-4") },
    { emoji: "⚽", gradient: "from-lime-100 to-emerald-200", label: "ใส่ลงสนามจริง", src: IMG("gallery-5") },
    { emoji: "🔢", gradient: "from-emerald-100 to-green-200", label: "ด้านหลัง — ใส่ชื่อ/เบอร์ได้", src: IMG("gallery-6") },
    { emoji: "🎾", gradient: "from-amber-100 to-lime-100", label: "ใส่เล่นกีฬาได้ทุกประเภท", src: IMG("gallery-7") },
    { emoji: "📏", gradient: "from-slate-100 to-blue-100", label: "ตารางไซซ์ SPORT (S – XL)", src: IMG("size-chart") },
  ],
  options: [
    {
      label: "ขนาด",
      choices: [
        { name: "S", imageSrc: IMG("size-s") },
        { name: "M", imageSrc: IMG("size-m") },
        { name: "L", imageSrc: IMG("size-l") },
        { name: "XL", imageSrc: IMG("size-xl") },
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

  const keepTabs = (current.tabs ?? []).filter(
    (t) => !["รายละเอียดเพิ่มเติม", "ตารางไซซ์"].includes(t.title)
  );
  const next: Product = {
    ...current,
    ...product,
    tabs: [...(product.tabs ?? []), ...keepTabs],
    savedAt: new Date().toISOString(),
  } as Product;

  // FAQ ข้อ "มีขนาดอะไรบ้าง" เขียนไว้ตอนตัวเลือกยังรวมเป็น 2 กลุ่ม — อัปเดตให้ตรงกับไซซ์ที่แยกแล้ว
  if (next.seo?.faqs?.length) {
    next.seo = {
      ...next.seo,
      faqs: next.seo.faqs.map((f) =>
        f.q.includes("ขนาด")
          ? { ...f, a: "มีไซซ์ S M L XL — ไซซ์ S/M/L ราคาเดียวกัน ส่วน XL เพิ่มตัวละ 20-30 บาทตามช่วงจำนวน" }
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

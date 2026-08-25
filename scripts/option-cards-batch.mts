/**
 * เปลี่ยนกลุ่มตัวเลือก "แบบ/ชนิด/เนื้อ" ของสินค้าสติ๊กเกอร์-การ์ด ให้แสดงเป็น "การ์ด" (display: cards)
 * หน้าตาเดียวกับแผงเลือกเรทราคา (รูปใหญ่ + วิทยุ + ชื่อ + คำอธิบาย) — ผู้ใช้สั่ง 25 ส.ค. 69
 * "ปรับให้เรทราคาเป็นแบบภาพที่ 1 และไล่ปรับสินค้าอื่น ๆ เพราะฉันว่ามันสวยดี"
 *
 *   npx tsx scripts/option-cards-batch.mts            # ดูว่าจะแก้อะไร (ไม่เขียน)
 *   npx tsx scripts/option-cards-batch.mts --write    # เขียนลง Supabase
 *
 * วิธี: ตั้ง display "cards" + เติม desc (คำอธิบายใต้ชื่อ) ให้ตัวเลือกในกลุ่มที่กำหนด
 *   ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือกเด็ดขาด — เป็นแกนตารางราคา (driverLabels) และเป้า showWhen
 *      ของกลุ่มอื่น เปลี่ยนแล้วราคาหล่น/กลุ่มลูกหาย (กับดัก price driver)
 *   ตัวเลือกที่ไม่อยู่ในตาราง DESC จะได้ display cards แต่ไม่มีคำอธิบาย (โชว์ชื่ออย่างเดียว)
 *
 * รันซ้ำได้ (idempotent) — เขียนทับ display/desc ค่าเดิมด้วยค่าล่าสุดในไฟล์นี้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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

/** คำอธิบายไดคัทชุดกลาง — สินค้าสติ๊กเกอร์ทุกตัวใช้ความหมายเดียวกัน */
const DIECUT_50 = "ตัดเฉพาะเนื้อสติ๊กเกอร์ ลายยังติดอยู่บนแผ่นรอง ลอกใช้ทีละดวง — เหมาะแจกทั้งแผ่น/ทยอยใช้";
const DIECUT_100 = "ตัดขาดทั้งแผ่นรอง แยกเป็นชิ้น ๆ พร้อมใช้พร้อมแจกทันที";

/**
 * สินค้า → กลุ่มที่เปลี่ยนเป็นการ์ด → คำอธิบายรายตัวเลือก (คีย์ = ชื่อตัวเลือกตรงตัว)
 * กลุ่มที่ตัวเลือกเยอะ (เช่น ลายเคลือบพิเศษ 10 ลาย) ไม่แปลง — การ์ดยาวเกิน ปุ่มเดิมเหมาะแล้ว
 */
const PLAN: Record<string, Record<string, Record<string, string>>> = {
  /* สติ๊กเกอร์ PP Digital — /products/Sticker-PP-Digital */
  "sticker-pp": {
    "แบบไดคัท": {
      "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)": DIECUT_50,
      "ไดคัท 100% (ตัดขาดทีละชิ้น)": DIECUT_100,
    },
    "ชนิดสติ๊กเกอร์": {
      "PP ขาวมัน": "เนื้อขาวผิวมันเงา สีสดคมชัด — แบบมาตรฐานที่ลูกค้าสั่งบ่อยที่สุด",
      "PP ขาวด้าน": "เนื้อขาวผิวด้าน ไม่สะท้อนแสง ให้ลุคเรียบหรู",
      "PP ขาวมุก": "เนื้อขาวประกายมุกวิ้ง ๆ เปลี่ยนเฉดตามมุมมอง ดูพรีเมียม",
      "PP ใส (รองขาว) +20฿": "เนื้อใสพิมพ์รองพื้นขาวใต้ลาย — ลายสีทึบสดบนขอบใส",
      "PP ใส (ไม่รองขาว)": "เนื้อใสไม่รองขาว ลายโปร่งแสงมองทะลุได้ เหมาะติดกระจก/ผิวใส",
    },
    "เคลือบ (เฉพาะด้านหน้า)": {
      "ไม่เคลือบ": "งานพิมพ์เปลือย ไม่มีฟิล์มเคลือบ — ราคาเบาที่สุด",
      "เคลือบเงา": "ฟิล์มใสผิวเงา สีดูสดขึ้น กันรอยขีดข่วน/ความชื้นได้ดีขึ้น",
      "เคลือบด้าน": "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน ให้ลุคมินิมอลดูแพง",
      "เคลือบพิเศษ": "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม — เลือกลายได้ด้านล่าง",
    },
  },
  /* สติ๊กเกอร์ UV PVC — /products/Sticker-UV (เรทราคา A3/ตร.ม. มีการ์ดสวยอยู่แล้ว — จัดกลุ่มตัวเลือกให้เข้าชุดกัน) */
  "sticker-uv": {
    "เนื้อสติ๊กเกอร์": {
      "เนื้อพลาสติกใส-แผ่นรองขุ่น (พิมพ์รองขาว)": "เนื้อใสพิมพ์รองพื้นขาวใต้ลาย — ลายสีทึบสด ขอบใสสวย · แผ่นรองสีขุ่น",
      "เนื้อขาว (เงา/ด้าน)-แผ่นรองกระดาษขาว": "เนื้อขาวทึบ ลายเด่นชัด เลือกผิวเงาหรือผิวด้านได้ · แผ่นรองกระดาษขาว",
      "เนื้อใส-แผ่นรองกระดาษขาว": "เนื้อใสไม่รองขาว ลายโปร่งแสงมองทะลุได้ เหมาะติดกระจก/ขวด/ผิวใส",
    },
    "แบบไดคัท": {
      "ไดคัท 50%": DIECUT_50,
      "ไดคัท 100%": DIECUT_100,
    },
  },
  /* Photo card PVC UV — /products/Photo-card-pvc-uv */
  "photocard-pvc-uv": {
    "ชนิดบัตร PVC": {
      "PVC สีขาว": "บัตรพลาสติกแข็งสีขาวทึบ ลายเด่นชัดเต็มใบ แบบเดียวกับบัตรสมาชิก",
      "PVC สีใส": "บัตรพลาสติกแข็งเนื้อใส ลายลอยบนความใส มองทะลุได้ ให้ลุคโมเดิร์น",
    },
    "สกรีนกี่ด้าน": {
      "สกรีน 1 ด้าน": "พิมพ์ลายด้านหน้าด้านเดียว — ด้านหลังเป็นเนื้อบัตรเปล่า",
      "สกรีน 2 ด้าน": "พิมพ์ลายทั้งสองหน้า หน้า-หลังคนละลายได้",
    },
  },
  /* Sticker Gold | Silver | RoseGold — /products/Sticker-Gold-Silver-RoseGold */
  "sticker-gold-silver-rosegold": {
    "สีเนื้อสติ๊กเกอร์": {
      "เนื้อสีเงิน": "ฟอยล์สีเงินเงาวาวแบบโลหะ — ลุคเมทัลลิกคลาสสิก",
      "เนื้อสีทอง": "ฟอยล์สีทองหรูหรา เหมาะงานพรีเมียม/ฉลากสินค้า",
      "เนื้อสีโรสโกล": "ฟอยล์สีโรสโกลด์อมชมพู หวานหรู ถ่ายรูปขึ้นกล้อง",
    },
    "ผิว": {
      "ผิวเงา": "สะท้อนแสงวิ้งเหมือนกระจก เห็นประกายโลหะชัด",
      "ผิวด้าน": "ประกายโลหะนุ่ม ๆ ไม่สะท้อนแสงจ้า ดูเรียบหรู",
    },
    "ขายแบบ": {
      "พิมพ์ลาย": "พิมพ์ลายของคุณลงบนเนื้อฟอยล์ด้วยระบบ UV",
      "ไม่พิมพ์ลาย": "แผ่นฟอยล์เปล่าไดคัทตามทรงที่สั่ง — ไม่พิมพ์ลาย ราคาเบากว่า",
    },
    "แบบไดคัท": {
      "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)": DIECUT_50,
      "ไดคัท 100% (ตัดขาดทีละชิ้น)": DIECUT_100,
    },
  },
};

for (const [id, groups] of Object.entries(PLAN)) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error || !row) throw new Error(`อ่านสินค้า ${id} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
  const product = row.data as Product;
  const report: string[] = [];

  for (const [label, descs] of Object.entries(groups)) {
    const opt = product.options.find((o) => o.label === label);
    if (!opt) throw new Error(`${id}: ไม่พบกลุ่ม "${label}" — ชื่อกลุ่มใน DB อาจเปลี่ยน ตรวจก่อน`);
    opt.display = "cards";
    const missing = Object.keys(descs).filter((n) => !opt.choices.some((c) => c.name === n));
    if (missing.length) throw new Error(`${id} · ${label}: ไม่พบตัวเลือก ${missing.join(", ")} — ตรวจชื่อก่อน`);
    let described = 0;
    for (const c of opt.choices) {
      if (descs[c.name]) {
        c.desc = descs[c.name];
        described++;
      }
    }
    report.push(`「${label}」→ การ์ด ${opt.choices.length} ใบ (คำอธิบาย ${described}/${opt.choices.length})`);
  }

  product.savedAt = new Date().toISOString();
  console.log(`\n📦 ${row.name} (${id})${product.hidden ? " · ร่าง" : ""}`);
  for (const r of report) console.log(`   ${r}`);

  if (!WRITE) continue;
  const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", id);
  if (writeErr) throw new Error(`บันทึก ${id} ไม่สำเร็จ: ${writeErr.message}`);
  const { data: check } = await sb.from("products").select("data->>savedAt").eq("id", id).single();
  if ((check as { savedAt?: string } | null)?.savedAt !== product.savedAt)
    throw new Error(`${id}: อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ`);
  console.log("   ✅ บันทึกแล้ว");
}

if (!WRITE) console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");

/**
 * ไล่เปลี่ยนกลุ่มตัวเลือกเชิง "สไตล์" ทั้งแคตตาล็อกให้แสดงเป็นการ์ด (display: cards)
 * — ต่อจาก option-cards-batch.mts (4 ตัวแรกตามที่ผู้ใช้สั่ง) ผู้ใช้ขอ "ไล่ปรับสินค้าอื่น ๆ" 25 ส.ค. 69
 *
 *   npx tsx scripts/option-cards-sweep.mts            # ดูว่าจะแก้อะไร (ไม่เขียน)
 *   npx tsx scripts/option-cards-sweep.mts --write    # เขียนลง Supabase
 *
 * เงื่อนไขกลุ่มที่แปลง (คัดอัตโนมัติ — รันซ้ำได้ สินค้าใหม่เข้าเงื่อนไขก็โดนด้วย):
 *   • display ปุ่มแยก (pills/ไม่ตั้ง) · ตัวเลือก 2-5 ตัว · มีภาพประกอบอย่างน้อย 2 ตัว
 *   • ชื่อกลุ่มเป็นเชิงสไตล์: แบบ/ชนิด/เนื้อ/ผิว/เคลือบ/วัสดุ/ทรง/ฐาน
 *   • ยกเว้นกลุ่มซ้ำรายชิ้น (ชิ้นที่ 2-4 · ฐานซ้าย/ขวา) — การ์ดซ้ำหลายชุดทำหน้ายาวเกิน
 *   • ไม่แตะกลุ่มลิงก์คลัง (presetId) — choices ของกลุ่มพวกนั้นมาจากคลัง desc ต้องแก้ที่คลัง
 * คำอธิบายใต้ชื่อ (desc) เติมจากพจนานุกรมกลางเฉพาะตัวเลือกที่ความหมายเหมือนกันทุกสินค้า
 * (เคลือบ/ไดคัท/อะคริลิค/สกรีนฐาน …) — ไม่ทับ desc ที่มีอยู่แล้ว · ไม่มีในพจนานุกรม = การ์ดโชว์ชื่ออย่างเดียว
 * ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก (แกนตารางราคา + เป้า showWhen)
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

const STYLE_LABEL = /แบบ|ชนิด|เนื้อ|ผิว|เคลือบ|วัสดุ|ทรง|ฐาน/;
const SKIP_LABEL = /ชิ้นที่|\(ซ้าย\)|\(ขวา\)/;

/** คำอธิบายกลาง — คีย์ = ชื่อตัวเลือกตรงตัว ใส่เฉพาะที่ความหมายเหมือนกันทุกสินค้า */
const DESC: Record<string, string> = {
  // เคลือบผิวงาน (ลามิเนต) — ชุดเดียวกับที่เขียนให้ sticker-pp
  "ไม่เคลือบ": "งานพิมพ์เปลือย ไม่เคลือบฟิล์ม — ราคาเบาที่สุด",
  "เคลือบเงา": "ฟิล์มใสผิวเงา สีดูสดขึ้น กันรอยขีดข่วน/ความชื้นได้ดีขึ้น",
  "เคลือบด้าน": "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน ให้ลุคมินิมอลดูแพง",
  "เคลือบพิเศษ": "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม",
  "เคลือบเงา / ด้าน": "ฟิล์มใสเลือกผิวเงาหรือด้านได้ กันรอย/กันชื้นดีขึ้น",
  "ไม่เคลือบด้านหลัง": "ด้านหลังเป็นงานพิมพ์เปลือย ไม่เคลือบฟิล์ม",
  "เคลือบเงา (ด้านหลัง)": "เคลือบฟิล์มเงาด้านหลังด้วย กันรอยครบสองหน้า",
  "เคลือบด้าน (ด้านหลัง)": "เคลือบฟิล์มด้านนุ่มที่ด้านหลังด้วย",
  "เคลือบพิเศษ (ด้านหลัง)": "ฟิล์มลายพิเศษด้านหลัง กลิตเตอร์ / ทราย / โฮโลแกรม",
  // ไดคัทสติ๊กเกอร์
  "ไดคัท 50%": "ตัดเฉพาะเนื้อสติ๊กเกอร์ ลายยังติดอยู่บนแผ่นรอง ลอกใช้ทีละดวง",
  "ไดคัท 100%": "ตัดขาดทั้งแผ่นรอง แยกเป็นชิ้น ๆ พร้อมใช้พร้อมแจกทันที",
  // ขายแบบ (สติ๊กเกอร์ฟอยล์/สะท้อนแสง/นีออน)
  "พิมพ์ลาย": "พิมพ์ลายของคุณลงบนเนื้อสติ๊กเกอร์",
  "ไม่พิมพ์ลาย": "แผ่นเปล่าไดคัทตามทรงที่สั่ง — ไม่พิมพ์ลาย ราคาเบากว่า",
  // ชนิดอะคริลิค
  "อะคริลิคใส": "เนื้อใสมองทะลุได้ ลายลอยบนความใส",
  "อะคริลิคขาวขุ่น C-02": "เนื้อขาวขุ่นพื้นทึบ ลายเด่นชัด",
  "อะคริลิคพิเศษ (สี · กลิตเตอร์ · โฮโลแกรม)": "เลือกลาย สี / กลิตเตอร์ / โฮโลแกรม ได้ในขั้นถัดไป",
  "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม)": "เลือกลาย สี / กลิตเตอร์ / โฮโลแกรม ได้ในขั้นถัดไป",
  "อะคริลิคพิเศษ (สี / โฮโลแกรม / กลิตเตอร์)": "เลือกลาย สี / กลิตเตอร์ / โฮโลแกรม ได้ในขั้นถัดไป",
  "อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม)": "เลือกลาย กลิตเตอร์ / โฮโลแกรม ได้ในขั้นถัดไป",
  // ฐานสแตนดี้
  "ไม่สกรีนฐาน": "ฐานอะคริลิคเปล่า ไม่พิมพ์ลาย",
  "สกรีนฐาน": "พิมพ์ลายของคุณลงบนฐานด้วย",
  "สกรีนลายฐาน": "พิมพ์ลายของคุณลงบนฐานด้วย",
  // งานปักหมวก
  "ปักธรรมดา": "ปักไหมเรียบไปกับเนื้อผ้าตามลาย",
  "ปักนูน": "ปักเสริมให้ลายนูนเด่นขึ้นจากผ้า (ทำได้เฉพาะฟอนต์)",
  // ผิวงาน FLEX / ผิวฟอยล์
  "ผิวเงา": "ผิวมันเงา สะท้อนแสง สีดูสด",
  "ผิวด้าน": "ผิวด้านนุ่ม ไม่สะท้อนแสง ดูเรียบหรู",
};

const { data, error } = await sb.from("products").select("id,name,category,data");
if (error) throw error;

let totalGroups = 0;
let totalDesc = 0;
const touched: string[] = [];

for (const row of data!) {
  if (String(row.category ?? "").startsWith("__")) continue;
  const product = row.data as Product;
  if (!product?.options?.length) continue;
  const report: string[] = [];

  for (const opt of product.options) {
    const display = opt.display ?? "pills";
    if (display !== "pills") continue;
    if (opt.presetId) continue;
    if (!STYLE_LABEL.test(opt.label) || SKIP_LABEL.test(opt.label)) continue;
    const choices = opt.choices ?? [];
    const withImg = choices.filter((c) => c.imageSrc).length;
    if (choices.length < 2 || choices.length > 5 || withImg < 2) continue;

    opt.display = "cards";
    let described = 0;
    for (const c of choices) {
      if (!c.desc && DESC[c.name]) {
        c.desc = DESC[c.name];
        described++;
      }
    }
    totalGroups++;
    totalDesc += described;
    report.push(`「${opt.label}」→ การ์ด ${choices.length} ใบ (คำอธิบาย +${described})`);
  }

  if (!report.length) continue;
  product.savedAt = new Date().toISOString();
  touched.push(row.id);
  console.log(`\n📦 ${row.name} (${row.id})${product.hidden ? " · ร่าง" : ""}`);
  for (const r of report) console.log(`   ${r}`);

  if (!WRITE) continue;
  const { error: writeErr } = await sb.from("products").update({ data: product }).eq("id", row.id);
  if (writeErr) throw new Error(`บันทึก ${row.id} ไม่สำเร็จ: ${writeErr.message}`);
  console.log("   ✅ บันทึกแล้ว");
}

console.log(`\nรวม ${touched.length} สินค้า · ${totalGroups} กลุ่ม · เติมคำอธิบาย ${totalDesc} ตัวเลือก`);
if (!WRITE) console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");

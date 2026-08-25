/**
 * แผ่นแม่เหล็กติดรถยนต์ (acrylicmagnet-4) — เพิ่มช่องกรอกขนาดชิ้นงาน (บังคับกรอก)
 *
 *   npx tsx scripts/car-magnet-size-input.mts            # ดูข้อมูลที่จะบันทึก (ไม่เขียน)
 *   npx tsx scripts/car-magnet-size-input.mts --write    # เขียนลง Supabase
 *
 * ผู้ใช้สั่ง 25 ส.ค. 69: ลูกค้าต้องระบุขนาดชิ้นงานเสมอ เริ่มต้นที่ 3×3 ซม. ใหญ่สุดไม่เกินแผ่น A3
 * และต้องโชว์ "จำนวนชิ้นที่ได้ต่อ 1 แผ่น A3" คำนวณแบบเดียวกับหน้าสติ๊กเกอร์ (sticker-pp)
 *  - ช่องกรอกคู่ กว้าง×สูง แบบ standardInput (แสดงเสมอ ไม่มี showWhen — ทั้งสองเรทต้องระบุขนาด)
 *    standardInput = บังคับกรอกก่อนกดสั่ง (inputError บล็อกปุ่มพร้อมข้อความใต้ช่อง)
 *  - sheetYield ใช้สเปกแผ่นเดียวกับ sticker-pp: พื้นที่วางจริง 43.76×28.89 ซม. ช่องไฟ 0.5
 *    (ชีทไดคัทของโปรแกรม Print-Fit — sheetName "แผ่น A3" ตรงหน่วยขาย จึงคูณจำนวนที่สั่งให้อัตโนมัติ)
 *  - min 3 (เริ่มต้น 3×3 ซม.) · max 42 (ด้านยาวสุดของงานไม่เกินแผ่น A3 — กรอกใหญ่เกินจัดวางแล้ว
 *    ไม่พอ 1 แผ่น หน้าเว็บโชว์คำเตือน "ขนาดนี้ใหญ่เกิน 1 แผ่น" ให้เอง)
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้ (เขียนทับกลุ่มชื่อเดิม ไม่เพิ่มซ้ำ)
 * ⚠️ ถ้ารัน car-magnet-prices-art.mts (รีเฟรชราคา) ทีหลัง สคริปต์นั้นคงกลุ่มตัวเลือกใน DB ไว้แล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product, ProductOption } from "../src/lib/products";

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const ID = "acrylicmagnet-4";
const W_LABEL = "ขนาดชิ้นงาน (กว้าง)";
const H_LABEL = "ขนาดชิ้นงาน (สูง)";

/** สเปกช่องกรอกร่วม — ก๊อปเกณฑ์จาก sticker-pp แต่ min 3 ตามกติกาหน้าเว็บ (เริ่มต้น 3×3 ซม.) */
const INPUT = {
  kind: "number" as const,
  unit: "ซม.",
  min: 3,
  max: 42,
  placeholder: "เช่น 15",
};

const SIZE_OPTIONS: ProductOption[] = [
  {
    label: W_LABEL,
    choices: [],
    display: "input",
    standardInput: true,
    input: { ...INPUT, hint: "เริ่มต้นที่ 3×3 ซม. ใหญ่สุดไม่เกินแผ่น A3 — วัดด้านที่กว้างที่สุดของชิ้นงาน" },
  },
  {
    label: H_LABEL,
    choices: [],
    display: "input",
    standardInput: true,
    input: { ...INPUT },
    /** สเปกแผ่นเดียวกับ sticker-pp (ชีทไดคัท Print-Fit) — sheetName ตรงหน่วยขาย "แผ่น A3" */
    sheetYield: { pairLabel: W_LABEL, sheetW: 43.76, sheetH: 28.89, gap: 0.5, sheetName: "แผ่น A3" },
  },
];

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบสินค้า"}`);
const p = row.data as Product;

// เขียนทับกลุ่มชื่อเดิมถ้ามี (รันซ้ำ) — กลุ่มอื่นคงไว้ตามเดิม แล้วต่อคู่ขนาดท้ายรายการ
const others = (p.options ?? []).filter((o) => o.label !== W_LABEL && o.label !== H_LABEL);
const saved: Product = { ...p, options: [...others, ...SIZE_OPTIONS], savedAt: new Date().toISOString() };

console.log(`\n📦 ${p.name} (${ID}) · สถานะ: ${p.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
console.log(`   กลุ่มตัวเลือกเดิม ${p.options?.length ?? 0} → ใหม่ ${saved.options.length}`);
for (const o of SIZE_OPTIONS)
  console.log(
    `   • ${o.label}: กรอกเลข ${o.input!.min}-${o.input!.max} ${o.input!.unit} (บังคับกรอก)` +
      (o.sheetYield ? ` · sheetYield ${o.sheetYield.sheetW}×${o.sheetYield.sheetH} ช่องไฟ ${o.sheetYield.gap} → ${o.sheetYield.sheetName}` : "")
  );

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ บันทึกแล้ว`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);

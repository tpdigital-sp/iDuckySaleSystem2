/**
 * ตรวจราคา photo-fram-acrylic ด้วยฟังก์ชันจริงที่หน้าร้าน/ตะกร้าใช้ (unitPriceFor)
 * ไม่ได้เทียบกับตัวเลขที่สคริปต์ build เขียนลงไป แต่เทียบกับ "ตารางบนเว็บ" ที่ผู้ใช้สั่งมาตรง ๆ
 *   npx tsx scripts/photo-frame-acrylic-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { unitPriceFor, type Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await sb.from("products").select("id,name,price,data").eq("id", "photo-fram-acrylic").single();
if (error) throw error;
const p = { id: data.id, name: data.name, price: data.price, ...(data.data as any) } as Product;

const MAT_CLEAR = "อะคริลิคใส";
const MAT_SPECIAL = "อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม · กระจก)";
const S1 = "สกรีน 1 ด้าน (ด้านหลังอะคริลิคขาวขุ่น C-02)";
const S2 = "สกรีน 2 ด้าน";
const sel = (mat: string, cm: number, screen: string) => ({
  แบบ: "พวงกุญแจ",
  ประเภทเนื้ออะคริลิค: mat,
  ขนาดชิ้นงาน: `${cm}cm`,
  สกรีนกี่ด้าน: screen,
  สีตะขอโซ่ไข่ปลา: "ตะขอ Z2 โซ่ไข่ปลาสีเงิน",
});

/* คาดหวัง = ราคาใสตามช่วง + 15×(ซม.-6) + ค่าเนื้อพิเศษ/ค่าสกรีน จากตาราง Add on หน้า /keyring */
const CLEAR: Record<number, number> = { 1: 169, 11: 140, 30: 130, 50: 120, 200: 100 };
const SPECIAL_RETAIL: Record<number, number> = { 5: 10, 6: 10, 8: 10, 10: 10, 11: 15, 14: 30, 20: 60 };
const SPECIAL_WHOLE: Record<number, number> = { 5: 5, 6: 8, 8: 8, 10: 10, 11: 15, 14: 30, 20: 60 };
const SCREEN2: Record<number, number> = { 5: 10, 6: 15, 8: 25, 10: 25, 11: 30, 14: 35, 17: 40, 20: 55 };

let fail = 0;
const check = (label: string, got: number, want: number) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${label.padEnd(58)} ฿${got}${ok ? "" : ` (ควรได้ ฿${want})`}`);
};
const sizeAdd = (cm: number) => Math.max(0, cm - 6) * 15;

for (const qty of [1, 11, 30, 50, 200]) {
  const base = CLEAR[qty];
  for (const cm of [5, 6, 8, 11, 20]) {
    check(`${qty} อัน · ใส · ${cm}cm · 1 ด้าน`, unitPriceFor(p, sel(MAT_CLEAR, cm, S1), qty), base + sizeAdd(cm));
    const sp = (qty === 1 ? SPECIAL_RETAIL : SPECIAL_WHOLE)[cm];
    check(`${qty} อัน · พิเศษ · ${cm}cm · 1 ด้าน`, unitPriceFor(p, sel(MAT_SPECIAL, cm, S1), qty), base + sizeAdd(cm) + sp);
  }
}
for (const cm of [5, 6, 8, 10, 11, 14, 17, 20]) {
  check(`1 อัน · ใส · ${cm}cm · 2 ด้าน`, unitPriceFor(p, sel(MAT_CLEAR, cm, S2), 1), CLEAR[1] + sizeAdd(cm) + SCREEN2[cm]);
}
// รวมทุกอย่าง: 11 อัน · พิเศษ 8cm · สกรีน 2 ด้าน · ตะขอสีอื่น (+3 ตั้งแต่ 11 อัน)
check(
  "11 อัน · พิเศษ · 8cm · 2 ด้าน · ตะขอ C4 สีขาว",
  unitPriceFor(p, { ...sel(MAT_SPECIAL, 8, S2), สีตะขอโซ่ไข่ปลา: "C4 สีขาว" }, 11),
  140 + 30 + 8 + 25 + 3
);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านทุกข้อ");
process.exit(fail ? 1 : 0);

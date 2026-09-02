/**
 * 🧪 เทียบราคา "ก่อน/หลัง" ของอะคริลิคกระจก หลังปรับค่าตะขอ/ค่าฐาน/ค่าคละ
 * (ใช้เครื่องคิดราคาตัวเดียวกับตะกร้า repriceCartGroups)
 *
 *   node scripts/acrylic-mirror-fees.mjs --json /tmp/after.json
 *   npx tsx scripts/acrylic-mirror-fees-test.mts /tmp/after.json
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { repriceCartGroups, DESIGN_LABEL, type Product } from "../src/lib/products";

const AFTER = process.argv[2];
if (!AFTER) throw new Error("ใส่ path ของไฟล์ผลลัพธ์จาก --json ด้วย");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ID = "new-mt2rqayf-7835";
const { data: row, error } = await sb.from("products").select("id,name,price,category,data").eq("id", ID).single();
if (error) throw error;
const toP = (r: any) => ({ id: r.id, name: r.name, price: r.price, category: r.category, ...(r.data as any) }) as Product;
const before = toP(row);
const after = toP(JSON.parse(readFileSync(AFTER, "utf8")));

const KEYRING = { รูปแบบงาน: "พวงกุญแจกระจก", ขนาด: "5cm" };
const STANDEE = (cm: string, screen = "ไม่สกรีนฐาน") => ({
  รูปแบบงาน: "สแตนดี้กระจก",
  ขนาด: "5cm",
  ฐานสแตนดี้: screen,
  ขนาดฐาน: cm,
  ทรงฐาน: "ทรงกลม",
  สีอะคริลิคฐาน: "อะคริลิคใส",
});

const price = (p: Product, sel: Record<string, string>, qty: number, designs?: number) => {
  const cart = [{ productId: p.id, qty, selections: designs && designs > 1 ? { ...sel, [DESIGN_LABEL]: String(designs) } : { ...sel } }];
  const out = repriceCartGroups(cart, (id) => (id === p.id ? p : undefined));
  return { unit: out[0].unitPrice, fee: out[0].extraFee ?? 0, total: out[0].unitPrice * qty + (out[0].extraFee ?? 0) };
};

type Case = { name: string; sel: Record<string, string>; qty: number; designs?: number };
const cases: Case[] = [
  { name: "พวงกุญแจ 5 ชิ้น · ตะขอ Z1", sel: { ...KEYRING, ตะขอ: "Z1 ห่วงกลม (สีเงิน)" }, qty: 5 },
  { name: "พวงกุญแจ 10 ชิ้น · ตะขอ F เงิน", sel: { ...KEYRING, ตะขอ: "F ตะขอสปริง 12×35mm (เงิน/ทอง/โรสโกลด์/รุ้ง)", "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, qty: 10 },
  { name: "พวงกุญแจ 11 ชิ้น · ตะขอ F เงิน", sel: { ...KEYRING, ตะขอ: "F ตะขอสปริง 12×35mm (เงิน/ทอง/โรสโกลด์/รุ้ง)", "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, qty: 11 },
  { name: "พวงกุญแจ 50 ชิ้น · ตะขอ Z1", sel: { ...KEYRING, ตะขอ: "Z1 ห่วงกลม (สีเงิน)" }, qty: 50 },
  { name: "สแตนดี้ 5 ชิ้น · ฐาน 4cm", sel: STANDEE("4cm"), qty: 5 },
  { name: "สแตนดี้ 20 ชิ้น · ฐาน 4cm", sel: STANDEE("4cm"), qty: 20 },
  { name: "สแตนดี้ 5 ชิ้น · ฐาน 8cm", sel: STANDEE("8cm"), qty: 5 },
  { name: "สแตนดี้ 20 ชิ้น · ฐาน 8cm", sel: STANDEE("8cm"), qty: 20 },
  { name: "สแตนดี้ 20 ชิ้น · ฐาน 8cm สกรีนฐาน", sel: STANDEE("8cm", "สกรีนฐาน"), qty: 20 },
  { name: "สแตนดี้ 20 ชิ้น · ฐาน 12cm สีพิเศษ", sel: { ...STANDEE("12cm"), สีอะคริลิคฐาน: "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)", "เลือกสีพิเศษของฐาน (ขนาดฐาน 12 ซม. · +20 บาท/ชิ้น)": "อะคริลิคใสขุ่น C-01" }, qty: 20 },
  { name: "คละ 20 ชิ้น 4 ลาย (ในโควตา)", sel: { ...KEYRING, ตะขอ: "ไม่รับตะขอ (เจาะรูอย่างเดียว)" }, qty: 20, designs: 4 },
  { name: "คละ 20 ชิ้น 6 ลาย (เกินโควตา 2 ลาย)", sel: { ...KEYRING, ตะขอ: "ไม่รับตะขอ (เจาะรูอย่างเดียว)" }, qty: 20, designs: 6 },
  { name: "คละ 11 ชิ้น 11 ลาย (เกินสุด)", sel: { ...KEYRING, ตะขอ: "ไม่รับตะขอ (เจาะรูอย่างเดียว)" }, qty: 11, designs: 11 },
  { name: "คละ 8 ชิ้น 8 ลาย (ช่วงปลีก)", sel: { ...KEYRING, ตะขอ: "ไม่รับตะขอ (เจาะรูอย่างเดียว)" }, qty: 8, designs: 8 },
];

console.log(`📦 ${before.name} — เทียบราคาก่อน/หลัง (ขนาดชิ้นงาน 5 ซม. ทุกเคส)\n`);
console.log("   " + "สถานการณ์".padEnd(42) + "ก่อน".padStart(16) + "หลัง".padStart(16));
for (const c of cases) {
  const a = price(before, c.sel, c.qty, c.designs);
  const b = price(after, c.sel, c.qty, c.designs);
  const fmt = (x: typeof a) => `฿${x.unit}×${c.qty}${x.fee ? `+${x.fee}` : ""}=${x.total.toLocaleString("th-TH")}`;
  const tag = b.total < a.total ? "⬇️ ถูกลง" : b.total > a.total ? "⬆️ แพงขึ้น" : "= เท่าเดิม";
  console.log("   " + c.name.padEnd(42) + fmt(a).padStart(18) + fmt(b).padStart(18) + "  " + tag);
}

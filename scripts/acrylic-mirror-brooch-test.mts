/**
 * 🧪 ราคาเข็มกลัดกระจก (อะคริลิคกระจก new-mt2rqayf-7835) — เครื่องคิดราคาตัวเดียวกับตะกร้า
 *
 *   node scripts/acrylic-mirror-brooch.mjs --json /tmp/after.json   # ก่อนเขียน
 *   npx tsx scripts/acrylic-mirror-brooch-test.mts [/tmp/after.json] # ไม่ใส่ไฟล์ = อ่านจาก DB
 *
 * กติกา: ปลีก 1-10 = ราคาตารางพวงกุญแจ (รวมอะไหล่) · 11+ และเรทตัวแทน = ราคาตาราง + ค่าอะไหล่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { repriceCartGroups, resolveSelections, orderableSelections, RATE_LABEL, type Product } from "../src/lib/products";

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
const data = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : row.data;
const p = { id: row.id, name: row.name, price: row.price, category: row.category, ...data } as Product;

const price = (sel: Record<string, string>, qty: number) => {
  const out = repriceCartGroups([{ productId: p.id, qty, selections: sel }], (id) => (id === p.id ? p : undefined));
  return out[0].unitPrice;
};
const B = (size: string, part: string, extra: Record<string, string> = {}) => ({ รูปแบบงาน: "เข็มกลัดกระจก", ขนาด: size, อะไหล่เข็มกลัด: part, ...extra });
const K = (size: string) => ({ รูปแบบงาน: "พวงกุญแจกระจก", ขนาด: size, ตะขอ: "ไม่รับตะขอ (เจาะรูอย่างเดียว)" });
const DEALER = { [RATE_LABEL]: "เรทตัวแทนจำหน่าย" };

let bad = 0;
const ok = (name: string, got: number, want: number) => {
  const pass = got === want;
  if (!pass) bad++;
  console.log(`${pass ? "✅" : "❌"} ${name.padEnd(44)} ฿${got}${pass ? "" : `  (ควรเป็น ฿${want})`}`);
};
ok("ปลีก 1 ชิ้น 4cm P2 (รวมอะไหล่)", price(B("4cm", "P2"), 1), 120);
ok("ปลีก 10 ชิ้น 5cm P3 สีทอง (รวมอะไหล่)", price(B("5cm", "P3 สีทอง"), 10), price(K("5cm"), 10));
ok("ส่ง 11 ชิ้น 4cm P1 = 89 + 3", price(B("4cm", "P1"), 11), 92);
ok("ส่ง 50 ชิ้น 5cm P2 = 95 + 10", price(B("5cm", "P2"), 50), 105);
ok("ส่ง 1000 ชิ้น 6cm P7 = 90 + 5", price(B("6cm", "P7"), 1000), 95);
ok("ส่ง 11 ชิ้น = พวงกุญแจ + อะไหล่ P4", price(B("6cm", "P4"), 11), price(K("6cm"), 11) + 3);
ok("ตัวแทน 11 ชิ้น 4cm P1 = 85 + 3", price(B("4cm", "P1", DEALER), 11), 88);
ok("ตัวแทน 200 ชิ้น 5cm P2 = 86 + 10", price(B("5cm", "P2", DEALER), 200), 96);

// (orderableSelections = ค่าที่ลงตะกร้าจริง) กลุ่มอะไหล่เข็มกลัดต้องไม่ติดไปกับพวงกุญแจ/สแตนดี้ และตะขอ/ฐานต้องไม่ติดไปกับเข็มกลัด
const rk = orderableSelections(p, resolveSelections(p, { รูปแบบงาน: "พวงกุญแจกระจก", ขนาด: "4cm" }));
const rb = orderableSelections(p, resolveSelections(p, { รูปแบบงาน: "เข็มกลัดกระจก", ขนาด: "4cm" }));
const ghost = (name: string, cond: boolean) => (cond ? console.log(`✅ ${name}`) : (bad++, console.log(`❌ ${name}`)));
ghost("พวงกุญแจ: ไม่มีอะไหล่เข็มกลัด", !("อะไหล่เข็มกลัด" in rk));
ghost(`เข็มกลัด: ไม่มีตะขอ/ฐาน · อะไหล่เริ่มต้น = ${rb["อะไหล่เข็มกลัด"]}`, !("ตะขอ" in rb) && !("ฐานสแตนดี้" in rb) && !!rb["อะไหล่เข็มกลัด"]);
console.log(bad ? `\n⛔ ไม่ผ่าน ${bad} ข้อ` : "\n🎉 ผ่านทุกข้อ");
process.exit(bad ? 1 : 0);

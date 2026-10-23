/**
 * OD-261015-7299 รายการที่ 1 (Photo Fram Acrylic แบบพิเศษ) ฿279 → ฿434/ชิ้น × 7 (เจ้าของร้านสั่ง 23 ต.ค. 69)
 * พนักงานแก้เป็น ฿434 ไว้ แล้วกด + จำนวน ระบบคิดตารางทับเหลือ ฿279 (แก้โค้ดแล้ว 7a2c0bb) — ลูกค้าโอนที่ ฿279 ไปแล้ว → ค้าง ฿1,085
 * ยอดโตบนใบที่จ่ายแล้ว = เด้งกลับรอชำระเงิน จำขั้นเดิม (กติกาเดียวกับ PATCH /api/admin/orders · REOPEN_FOR_BALANCE)
 * npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-od-261015-7299-price-434.mts [--apply]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { awaitingPayment, hasUnpaidBalance, orderBalance, orderTotal, REOPEN_FOR_BALANCE, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ID = "OD-261015-7299", BY = "เจ้าของร้าน (สคริปต์)", TO = 434;
const apply = process.argv.includes("--apply");

const { data } = await sb.from("orders").select("data").eq("id", ID).single();
const order = data!.data as Order;
const it = order.items[0];
if (!it.name.startsWith("Photo Fram Acrylic") || it.qty !== 7 || it.unitPrice !== 279) throw new Error(`รายการที่ 1 ไม่ตรงที่คาด: ${it.name} ×${it.qty} @${it.unitPrice}`);
console.log("ก่อน:", order.status, "ยอด", orderTotal(order), "จ่ายแล้ว", order.paidTotal, "ค้าง", orderBalance(order));

const items = order.items.map((x, i) => (i === 0 ? { ...x, unitPrice: TO, priceManual: { by: BY, at: new Date().toISOString() } } : x));
let next = withLog({ ...order, items }, BY, "แก้ราคา/หน่วย", `${it.name}: ฿279 → ฿${TO}/หน่วย ×7 = ฿${(TO * 7).toLocaleString()} (คืนราคาที่ Pang ตั้งไว้ 16 ต.ค. — ถูกคิดตารางทับตอนกดเพิ่มจำนวน 19 ต.ค.)`);
if (!next.deposit && !awaitingPayment(next) && REOPEN_FOR_BALANCE.includes(next.status) && hasUnpaidBalance(next))
  next = withLog({ ...next, status: "รอชำระเงิน", reopenedFrom: order.status }, BY, "ยอดรวมเพิ่มขึ้น — กลับไปรอชำระเงิน",
    `ค้างอีก ${orderBalance(next).toLocaleString("th-TH")} บาท (จ่ายมาแล้ว ${(next.paidTotal ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(next).toLocaleString("th-TH")})`);
console.log("หลัง:", next.status, "reopenedFrom", next.reopenedFrom, "ยอด", orderTotal(next), "ค้าง", orderBalance(next));
if (!apply) process.exit(0);
const { order: saved, error } = await updateOrder(sb as never, next, { prev: order, by: BY });
if (error) throw error;
console.log("บันทึกแล้ว:", saved.status, "ยอด", orderTotal(saved), "ค้าง", orderBalance(saved), "earlyPay", JSON.stringify(saved.earlyPay ?? null));

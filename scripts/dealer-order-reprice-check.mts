/**
 * 🤝 ลองคิดราคาตัวแทนให้ออเดอร์ที่ระบุ — ดูว่าปุ่ม "คิดราคาตัวแทน" ในหน้าออเดอร์จะได้ตัวเลขอะไร (ไม่เขียนฐาน)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/dealer-order-reprice-check.mts OD-260915-3447
 *   npx tsx --tsconfig tsconfig.json scripts/dealer-order-reprice-check.mts OD-… --off   # ลองถอดกลับราคาปกติ
 *   npx tsx --tsconfig tsconfig.json scripts/dealer-order-reprice-check.mts OD-… --apply # เขียนจริง (ก่อนปุ่มในหน้าออเดอร์ขึ้นเว็บ)
 *
 * ใช้กติกาตัวเดียวกับที่ระบบคิดจริง (repriceOrderForDealer ใน src/lib/order-dealer.ts)
 * — ไม่มีกฎก๊อปมาไว้ในสคริปต์ ถ้ากติกาเปลี่ยน สคริปต์นี้ตามเอง
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { dealerRepriceBlockedBy, repriceOrderForDealer } from "../src/lib/order-dealer";
import { orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import type { Product } from "../src/lib/products";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// สคริปต์รันนอก Next จึงโหลดสินค้าเอง (products-server ติด "server-only")
const cache = new Map<string, Product | undefined>();
async function loadProduct(id: string): Promise<Product | undefined> {
  if (cache.has(id)) return cache.get(id);
  const { data } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  const p = (data?.data as Product | undefined) ?? undefined;
  cache.set(id, p);
  return p;
}

const args = process.argv.slice(2);
const on = !args.includes("--off");
const apply = args.includes("--apply");
const id = args.find((a) => /^OD-/i.test(a))?.toUpperCase();
if (!id) {
  console.error("ใส่เลขออเดอร์ด้วย เช่น OD-260915-3447");
  process.exit(1);
}

const { data: row } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
if (!row) {
  console.error(`ไม่พบออเดอร์ ${id}`);
  process.exit(1);
}
const order = row.data as Order;
const thb = (n: number) => `฿${n.toLocaleString("th-TH")}`;

console.log(`\n${id} · ${order.customer} · ${order.status}${order.dealer ? " · 🤝 ตัวแทน" : ""}`);
const blocked = dealerRepriceBlockedBy(order);
console.log(blocked ? `⛔ เปลี่ยนราคาไม่ได้ — ${blocked}` : "✓ ใบนี้ยังเปลี่ยนราคาได้");

const { order: next, changed, skipped } = await repriceOrderForDealer(order, on, loadProduct);
console.log(`\n${on ? "→ ราคาตัวแทน" : "→ ราคาปกติ"}`);
for (const c of changed) console.log(`   ${c.name}: ${thb(c.from)} → ${thb(c.to)} /หน่วย × ${c.qty}  [${c.rate}]`);
if (!changed.length) console.log("   (ไม่มีบรรทัดไหนราคาเปลี่ยน)");
if (skipped.length) console.log(`   ⚠️ ไม่มีราคาตัวแทน ${skipped.length} รายการ: ${skipped.join(" · ")}`);
if (order.earlyPay && on) console.log(`   ถอดส่วนลดโอนไว −${thb(order.earlyPay.amount)} (ตัวแทนไม่ได้ส่วนลดนี้)`);
if (order.discount?.tierId && on) console.log(`   ถอดส่วนลดระดับสมาชิก −${thb(order.discount.amount)} (ตัวแทนไม่ได้ส่วนลดนี้)`);
console.log(`\n💰 ยอดรวมทั้งบิล ${thb(orderTotal(order))} → ${thb(orderTotal(next))}`);

if (!apply) {
  console.log("(dry-run — ใส่ --apply ถึงจะเขียนจริง)\n");
  process.exit(0);
}
if (blocked) {
  console.error(`\n⛔ ไม่เขียน — ${blocked}\n`);
  process.exit(1);
}
const detail = [
  ...changed.map((c) => `${c.name} ${thb(c.from)} → ${thb(c.to)}/หน่วย × ${c.qty}`),
  ...(skipped.length ? [`ไม่ได้สลับ ${skipped.length} รายการ (ไม่มีราคาตัวแทน): ${skipped.join(" · ")}`] : []),
  `ยอดรวม ${thb(orderTotal(order))} → ${thb(orderTotal(next))}`,
].join(" · ");
const logged = withLog(next, "ระบบ", on ? "🤝 เปลี่ยนเป็นราคาตัวแทนจำหน่าย" : "ถอดราคาตัวแทนจำหน่าย (กลับราคาปกติ)", detail);
// เขียนผ่านประตูเดียวกับทั้งระบบ (ดู src/lib/server/order-write.ts) — ห้ามยิง sb.from("orders").update เอง
const { error } = await updateOrder(sb as never, logged);
if (error) {
  console.error(`\n⛔ บันทึกไม่สำเร็จ: ${error.message}\n`);
  process.exit(1);
}
console.log("✅ บันทึกแล้ว\n");

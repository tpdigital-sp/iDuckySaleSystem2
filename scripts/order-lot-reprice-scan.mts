/**
 * 🧮 ไล่หาใบที่ "ลูกค้าสั่งเพิ่มจนยอดรวมเข้าเรทส่ง แต่ของเดิมยังค้างราคาแพงกว่า"
 *
 *   npx tsx --tsconfig tsconfig.json scripts/order-lot-reprice-scan.mts                    (ดูเฉย ๆ ทุกใบ)
 *   npx tsx --tsconfig tsconfig.json scripts/order-lot-reprice-scan.mts OD-260917-1401
 *   npx tsx --tsconfig tsconfig.json scripts/order-lot-reprice-scan.mts OD-260917-1401 --apply
 *   npx tsx --tsconfig tsconfig.json scripts/order-lot-reprice-scan.mts --apply            (แก้ทุกใบที่เจอ)
 *
 * ทำไม (เจ้าของร้านสั่ง 21 ก.ย. 69 · OD-260917-1401): ผ้าคลุมไหล่ 10 ผืน ฿400 + สั่งเพิ่ม 3 ผืน
 * รวม 13 ผืนเข้าขั้นส่ง ฿350 — ของที่เพิ่มได้ ฿350 แต่ 10 ผืนแรกยังค้าง ฿400 ทั้งที่ผลิตรอบเดียวกัน
 * ตั้งแต่ 21 ก.ย. 69 ประตูสั่งเพิ่ม (/api/orders/append) ปรับให้เองแล้ว — ตัวนี้ไว้เก็บใบเก่า
 *
 * ใช้กติกาตัวเดียวกับที่ระบบคิดจริง (repriceOrderLot ใน src/lib/order-lot-reprice.ts) — ลดอย่างเดียว ไม่ขึ้นราคา
 * ⚠️ ไม่แตะสถานะ/ยอดชำระ — ใบที่กลายเป็นจ่ายเกิน ให้แอดมินคุยกับลูกค้า (คืนเงิน/เก็บเป็นเครดิต) เอง
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { lotRepriceBlockedBy, lotRepriceNote, repriceOrderLot } from "../src/lib/order-lot-reprice";
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
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => /^OD-/i.test(a)).map((a) => a.toUpperCase()));
const thb = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const BY = "ปรับราคาล็อตย้อนหลัง (สคริปต์)";

const { data, error } = await sb.from("orders").select("id,data");
if (error) {
  console.error(error.message);
  process.exit(1);
}

let hit = 0;
for (const row of (data ?? []) as { id: string; data: Order }[]) {
  if (only.size && !only.has(row.id.toUpperCase())) continue;
  const order = row.data;
  // ของที่ "เพิ่มเข้าใบทีหลัง" = บรรทัดที่มี addedAt (ประทับโดยประตูเขียนออเดอร์) — ไม่มีเลย = ใบนี้ไม่เคยสั่งเพิ่ม
  const addedIdx = (order.items ?? []).map((it, i) => (it.addedAt ? i : -1)).filter((i) => i >= 0);
  if (!addedIdx.length) continue;
  const blocked = lotRepriceBlockedBy(order);
  if (blocked && !only.size) continue;

  const { order: next, changed } = await repriceOrderLot(order, loadProduct, addedIdx);
  if (!changed.length) continue;
  hit++;
  console.log(`\n${row.id} · ${order.customer} · ${order.status}`);
  for (const c of changed) console.log(`   ${c.name}: ${thb(c.from)} → ${thb(c.to)} /หน่วย × ${c.qty}`);
  console.log(`   💰 ยอดรวม ${thb(orderTotal(order))} → ${thb(orderTotal(next))}`);
  if (blocked) {
    console.log(`   ⛔ ไม่แก้ให้ — ${blocked}`);
    continue;
  }
  if (!apply) continue;

  const logged = withLog(
    next,
    BY,
    "ปรับราคาต่อชิ้นให้เท่ากันทั้งบิล",
    `ยอดรวมทั้งใบเข้าเรทส่ง · ${lotRepriceNote(changed)} · ยอดรวม ${thb(orderTotal(order))} → ${thb(orderTotal(next))}`
  );
  const { error: saveErr } = await updateOrder(sb as never, logged, { prev: order, by: BY });
  console.log(saveErr ? `   ⛔ บันทึกไม่สำเร็จ: ${saveErr.message}` : "   ✅ บันทึกแล้ว");
}

console.log(`\n${hit ? `เจอ ${hit} ใบ` : "ไม่เจอใบที่ต้องแก้"}${apply ? "" : " (dry-run — ใส่ --apply ถึงจะเขียนจริง)"}\n`);

/**
 * ⚡ เติม "ส่วนลดโอนไว" ย้อนหลังให้ออเดอร์ที่ยังไม่มี (ใบที่สร้างจากหลังบ้านแล้วลูกค้าใส่ของเองก่อน 10 ก.ย. 69
 * ที่ระบบเพิ่งคิดให้ทางสั่งเพิ่ม — เคส OD-260910-7269 ที่พนักงานแจ้ง)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/early-pay-backfill.mts OD-260910-7269 [OD-…]          (dry-run)
 *   npx tsx --tsconfig tsconfig.json scripts/early-pay-backfill.mts OD-260910-7269 --apply         (เขียนจริง)
 *
 * กติกาเดียวกับ /api/orders + /api/orders/append: เฉพาะออเดอร์ราคาปลีกล้วน (earlyPayBase) · ตัวแทนไม่ได้ ·
 * ต้องยังไม่มีเงินเข้า · เวลาหมดอายุนับจากตอนรัน (windowMinutes ในตั้งค่าร้าน) · รันซ้ำได้ (ใบที่มีแล้วข้าม)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { earlyPayAmount, earlyPayBase, earlyPayExpiresAt, earlyPayOf, EARLY_PAY_LABEL, type EarlyPayDiscount } from "../src/lib/early-pay";
import type { Product } from "../src/lib/products";
import type { Order } from "../src/lib/admin-data";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ids = args.filter((a) => a.startsWith("OD-"));
if (!ids.length) {
  console.log("ระบุเลขออเดอร์อย่างน้อย 1 ใบ เช่น OD-260910-7269 (ใส่ --apply เพื่อเขียนจริง)");
  process.exit(1);
}

const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);
const prods = new Map<string, Product>();
const productOf = (id: string) => prods.get(id);

for (const id of ids) {
  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) {
    console.log(`✗ ${id} ไม่พบ`);
    continue;
  }
  if (o.earlyPay) {
    console.log(`– ${id} มีส่วนลดอยู่แล้ว ${JSON.stringify(o.earlyPay)}`);
    continue;
  }
  if (o.dealer || (o.paidTotal ?? 0) > 0 || o.status === "ชำระแล้ว" || o.status === "ยกเลิก" || !o.items?.length) {
    console.log(`– ${id} ข้าม (${o.dealer ? "ตัวแทน" : o.items?.length ? `สถานะ ${o.status} / paidTotal ${o.paidTotal ?? 0}` : "ไม่มีรายการ"})`);
    continue;
  }
  for (const pid of [...new Set(o.items.map((i) => i.productId).filter(Boolean))]) {
    if (prods.has(pid)) continue;
    const { data: p } = await sb.from("products").select("data").eq("id", pid).maybeSingle();
    if (p?.data) prods.set(pid, p.data as Product);
  }
  const goods = earlyPayBase(
    o.items.map((i) => ({ productId: i.productId, selections: i.sel, qty: i.qty, amount: i.qty * i.unitPrice })),
    productOf,
    { mergeLots: true }
  );
  const amount = earlyPayAmount(goods, cfg);
  if (!amount) {
    console.log(`– ${id} ไม่เข้าเงื่อนไข (มีรายการเรทส่ง/ยอด 0) ฐานปลีก ${goods}`);
    continue;
  }
  const now = new Date();
  const expiresAt = earlyPayExpiresAt(cfg, now);
  const earlyPay: Order["earlyPay"] = { label: EARLY_PAY_LABEL, amount, ...(expiresAt ? { expiresAt } : {}) };
  console.log(`${apply ? "✓" : "○"} ${id} ${o.status} ฐานปลีก ฿${goods} → ลด ฿${amount} หมดเวลา ${expiresAt ?? "ไม่จำกัด"}${apply ? "" : " (dry-run)"}`);
  if (!apply) continue;
  const updated: Order = {
    ...o,
    earlyPay,
    log: [
      ...(o.log ?? []),
      { at: now.toISOString(), by: "ระบบ", action: "เพิ่มส่วนลดโอนไวย้อนหลัง", detail: `ใบสร้างจากหลังบ้านก่อนระบบคิดให้ — ลด ฿${amount} แจ้งโอนภายใน ${cfg.windowMinutes || "ไม่จำกัด"} นาทีจากตอนนี้` },
    ],
    savedAt: now.toISOString(),
  };
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", id);
  if (error) console.log(`  ✗ เขียนไม่สำเร็จ ${error.message}`);
  else {
    const { data: back } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
    console.log(`  อ่านกลับ: ${JSON.stringify((back?.data as Order).earlyPay)}`);
  }
}

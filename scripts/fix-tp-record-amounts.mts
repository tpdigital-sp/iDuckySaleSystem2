#!/usr/bin/env node
/**
 * 🔧 ซ่อมยอดของ "เรคอร์ดสะพาน iDucky → msVerify" (Firestore tp-fixflow / iduckyPaidOrders)
 * ที่ค้างยอดเก่าเพราะออเดอร์ถูกแก้หลังเรคอร์ดถูกสร้าง (.create() ครั้งเดียว ยิงซ้ำไม่ทับ)
 *
 * เคสต้นเรื่อง 14 ก.ย. 69 — พนักงานแจ้ง "มัดจำไม่จับคู่": OD-260911-8026 เปิดโหมดมัดจำ 50% *หลัง*
 * กดยืนยันเงินเข้า → เรคอร์ดส่งยอดทั้งบิล 21,330.92 ขณะที่ลูกค้าโอนงวดแรก 10,665.46 → msDaily จับคู่ไม่เจอ
 *
 *   npx tsx scripts/fix-tp-record-amounts.mts                          # ดูอย่างเดียว (ทั้ง collection)
 *   npx tsx scripts/fix-tp-record-amounts.mts --id OD-260911-8026      # ดูใบเดียว
 *   npx tsx scripts/fix-tp-record-amounts.mts --apply                  # เขียนจริง
 *
 * ซ่อมเฉพาะ "ยอดในเรคอร์ดไม่ใช่ยอดของงวดนี้" — ใบที่ออเดอร์ถูกแก้ยอดหลังชำระ (สั่งเพิ่ม/ลด) จะขึ้นรายการเตือนเฉย ๆ
 * กติกาการคิดยอดอยู่ที่ tpAmountsFix (src/lib/tp-amounts.ts) ตัวเดียวกับที่ syncAmountsToTP ใช้ตอนแอดมินแก้ออเดอร์
 * — ข้ามเรคอร์ดสลิปใบเพิ่ม/รับบางส่วน · บิลของงวดไม่เปลี่ยน = ไม่แตะยอดที่ SlipOK อ่านไว้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { amountsForRecord, tpAmountsFix } from "../src/lib/tp-amounts.ts";
import type { Order } from "../src/lib/admin-data.ts";

const APPLY = process.argv.includes("--apply");
const onlyId = process.argv.includes("--id") ? process.argv[process.argv.indexOf("--id") + 1] : "";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
) as Record<string, string>;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;
const orderById = new Map<string, Order>((rows ?? []).map((r) => [r.id as string, (r.data ?? {}) as Order]));

const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const snap = await db.collection("iduckyPaidOrders").get();
let fixed = 0, ok = 0, skipped = 0, noOrder = 0;
const drifted: string[] = [];
for (const doc of snap.docs) {
  const d = doc.data();
  const orderId = (d.orderId as string) || doc.id.replace(/-(final|p[^-]*)$/, "");
  if (onlyId && orderId !== onlyId) continue;
  const isFinal = /-final$/.test(doc.id);
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  if (d.installment === "extra" || d.partial === true) { skipped++; continue; }
  const money = tpAmountsFix(order, isFinal, d);
  if (!money) {
    // ยอดบิลของออเดอร์วันนี้ไม่ตรงกับที่เคยรายงาน แต่ไม่ใช่อาการที่ซ่อมได้ (ออเดอร์ถูกแก้ยอดหลังชำระ) → เตือนไว้เฉย ๆ
    const now = amountsForRecord(order, isFinal);
    const hadBill = Number(d.orderTotal) || 0;   // 0 = doc เก่าก่อนมีฟิลด์นี้ (ไม่รู้ว่าเคยรายงานยอดอะไร)
    if (hadBill > 0 && Math.abs(hadBill - now.bill) > 0.01)
      drifted.push(`      ${doc.id}  เรคอร์ด ${thb(hadBill)} · ออเดอร์วันนี้ ${thb(now.bill)}  (${d.customerName || ""})`);
    ok++;
    continue;
  }
  fixed++;
  console.log(
    `  ${APPLY ? "✍" : "→"} ${doc.id}  (${d.customerName || ""})\n` +
      `      บิล ${thb(Number(d.orderTotal) || 0)} → ${thb(money.bill)} · หัก ณ ที่จ่าย ${thb(Number(d.wht) || 0)} → ${thb(money.wht)}\n` +
      `      เงินเข้าจริง ${thb(Number(d.slipAmount) || 0)} → ${thb(money.received)} · ค่าธรรมเนียม ${thb(Number(d.fee) || 0)} → ${thb(money.fee)}`
  );
  if (!APPLY) continue;
  const patch: Record<string, unknown> = {
    slipAmount: money.received,
    orderTotal: money.bill,
    wht: money.wht,
    fee: money.fee,
    receivedUpdatedAt: new Date().toISOString(),
  };
  if (!isFinal && order.deposit && !d.noteText) {
    patch.noteText = "มัดจำ 50% งวดแรก";
    patch.note = `มัดจำ 50% งวดแรก · ${d.note ?? ""}`.slice(0, 120);
  }
  await doc.ref.update(patch);
}
if (drifted.length)
  console.log(`\nℹ️  ยอดออเดอร์เปลี่ยนหลังชำระ ${drifted.length} ใบ (ไม่แก้ให้ — เรคอร์ดต้องคงยอดที่ลูกค้าโอนจริงวันนั้น):\n${drifted.join("\n")}`);
console.log(
  `\nรวม ${snap.size} เรคอร์ด · ${APPLY ? "แก้แล้ว" : "ต้องแก้"} ${fixed} · ตรงอยู่แล้ว ${ok} · ข้าม (ใบเพิ่ม/รับบางส่วน) ${skipped} · ไม่พบออเดอร์ ${noOrder}` +
    (APPLY ? "" : "\n(ใส่ --apply เพื่อเขียนจริง)")
);

#!/usr/bin/env node
/**
 * เติม orderTotal / earlyPay + แก้ slipAmount เป็นยอดที่ SlipOK อ่านจากสลิปจริง ให้เรคอร์ดสะพาน iDucky → msVerify
 * (collection iduckyPaidOrders) ที่ยิงไปก่อน 9 ก.ย. 69
 *
 * ปัญหา: ลูกค้าบางคนโอน "ยอดเต็ม" ไม่หักส่วนลดโอนไว ฿5/฿10 (เช่น OD-260908-3989 ออเดอร์ 3,740 โอน 3,750)
 * doc เดิมส่งยอดออเดอร์ไป → msVerify จับคู่กับธนาคารไม่เจอ · ของใหม่ tp-report.ts ส่งยอดจริง + orderTotal + earlyPay แล้ว
 *
 *   node scripts/backfill-tp-amounts.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-amounts.mjs --write    # เขียนจริง
 *
 * orderTotal = slipAmount เดิมของ doc (คือยอดออเดอร์/งวดที่เคยรายงาน) · slipAmount ใหม่ = ยอดที่ SlipOK อ่านได้ (ถ้าผ่านและต่างกัน)
 * ใบที่มี orderTotal แล้วข้าม · update ไม่แตะฟิลด์อื่น
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;
const orderById = new Map(rows.map((r) => [r.id, r.data || {}]));

const snap = await db.collection("iduckyPaidOrders").get();
let changed = 0, same = 0, noOrder = 0, amtFixed = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  if (typeof d.orderTotal === "number") { same++; continue; }
  const isFinal = /-final$/.test(doc.id);
  const orderId = d.orderId || doc.id.replace(/-final$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  const v = isFinal ? order.deposit?.balanceVerify : order.slipVerify;
  const verified = v?.status === "pass" && typeof v.amount === "number" && v.amount > 0 ? v.amount : 0;
  const orderTotal = Number(d.slipAmount) || 0;
  const earlyPay = Number(order.earlyPay?.amount) || 0;
  const upd = { orderTotal, earlyPay, amountsBackfilledAt: new Date().toISOString() };
  let amtNote = "";
  if (verified && Math.abs(verified - orderTotal) > 0.01) { upd.slipAmount = verified; amtFixed++; amtNote = `  💳 สลิปจริง ${orderTotal} → ${verified} (${verified - orderTotal > 0 ? "+" : ""}${(verified - orderTotal).toFixed(2)})`; }
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  orderTotal ${orderTotal} · earlyPay ${earlyPay}${amtNote}  (${d.customerName || ""})`);
  if (WRITE) await doc.ref.update(upd);
}
console.log(`\nรวม ${snap.size} ใบ · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} (แก้ยอดสลิป ${amtFixed}) · มีแล้ว ${same} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

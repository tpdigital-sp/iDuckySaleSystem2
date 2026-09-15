#!/usr/bin/env node
/**
 * เติม slipRefNo (เลขอ้างอิงธุรกรรมที่ SlipOK อ่านได้) ให้เรคอร์ดสะพาน iDucky → msVerify (collection iduckyPaidOrders)
 * ที่ยิงไปก่อน 11 ก.ย. 69 — msVerify ใช้แยก "สลิปคนละธุรกรรมที่ยอดเท่ากัน" ตอนตรวจสลิปซ้ำ
 * (เคส: สลิป Gift ฿300 11:53 ถูกบล็อกเพราะชนเรคอร์ด Kaew ฿300 ที่ไม่มีเลขอ้างอิงให้เทียบ)
 *
 *   node scripts/backfill-tp-slipref.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-slipref.mjs --write    # เขียนจริง
 *
 * แหล่งเลข: doc หลัก → order.slipVerify.transRef · -final → deposit.balanceVerify.transRef · -<paymentId> → payments[].verify.transRef
 * ใบที่มี slipRefNo แล้ว / ไม่มีเลขในออเดอร์ (แอดมินยืนยันเอง) ข้าม · update ไม่แตะฟิลด์อื่น
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
let changed = 0, same = 0, noOrder = 0, noRef = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  if (typeof d.slipRefNo === "string" && d.slipRefNo) { same++; continue; }
  const orderId = d.orderId || doc.id.replace(/-final$/, "").replace(/-p[a-z0-9]+$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  let ref = "";
  const pays = Array.isArray(order.payments) ? order.payments : [];
  if (/-final$/.test(doc.id)) ref = order.deposit?.balanceVerify?.transRef || "";
  else if (d.installment === "extra" || /-p[a-z0-9]+$/.test(doc.id)) {
    // ใบเพิ่ม: ต้องมาจาก payments[] เท่านั้น (จับคู่ path ก่อน id) — ไม่มี = ข้าม ห้ามตกไปใช้เลขของสลิปหลัก
    //   (11 ก.ย. 69 OD-260910-3497-pmtwhasl20epf เคยได้เลขสลิปหลักผิด เพราะ payments ถูกลบไปแล้ว)
    const pid = (doc.id.match(/-(p[a-z0-9]+)$/) || [])[1];
    const p = pays.find((x) => d.slipPath && x.path === d.slipPath) || pays.find((x) => pid && x.id === pid);
    ref = p?.verify?.transRef || "";
  } else ref = order.slipVerify?.transRef || "";
  ref = String(ref).trim();
  if (!ref) { noRef++; continue; }
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  slipRefNo ${ref}  (${d.customerName || ""} ฿${d.slipAmount ?? "?"})`);
  if (WRITE) await doc.ref.update({ slipRefNo: ref, slipRefBackfilledAt: new Date().toISOString() });
}
console.log(`\nรวม ${snap.size} ใบ · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} · มีแล้ว ${same} · ไม่มีเลขในออเดอร์ ${noRef} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

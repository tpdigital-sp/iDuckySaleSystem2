#!/usr/bin/env node
/**
 * เติม "เวลาโอนจริงบนสลิป" (slipTransAt · ISO จาก SlipOK) ให้เรคอร์ดสะพาน iDucky → msVerify (collection iduckyPaidOrders) ที่ยิงไปก่อนมีฟิลด์นี้
 *
 *   node scripts/backfill-tp-transat.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-transat.mjs --write    # เขียนจริง
 *
 * ทำไม (17 ก.ย. 69): เรคอร์ดมีแต่ date/time = เวลายืนยันเงิน → ฝั่ง Admin ไม่มี slipTime ให้กรอง จับคู่ด้วยยอดอย่างเดียว
 *   สลิป PANEE.C ฿80 โอน 17:06 เลยไปจับคู่แถวโอนค้าง ฿80 ของวันที่ 15
 * เลือกใบเดียวกับ slipRefNoFor ใน tp-report.ts: ใบเพิ่ม (slipPath) → payments[].verify · -final → deposit.balanceVerify · ใบหลัก → slipVerify
 * เขียนเฉพาะ slipTransAt (update ไม่แตะฟิลด์อื่น) · ใบที่มีค่าตรงกันอยู่แล้ว/ออเดอร์ไม่มี transAt ข้าม
 * ของใหม่ tp-report.ts ใส่ให้ตอนสร้าง — สคริปต์นี้ใช้ครั้งเดียว/ซ่อมเก่า
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

const thai = (iso) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + 7 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
};

const snap = await db.collection("iduckyPaidOrders").get();
let changed = 0, same = 0, noOrder = 0, noTransAt = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const orderId = d.orderId || doc.id.replace(/-final$/, "").replace(/-p[0-9a-z]{6,}$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  let v;
  if (d.slipPath && d.installment === "extra") v = (order.payments ?? []).find((x) => x.path === d.slipPath)?.verify;
  else if (/-final$/.test(doc.id)) v = order.deposit?.balanceVerify;
  else v = order.slipVerify;
  const transAt = String(v?.transAt ?? "").trim();
  if (!transAt) { noTransAt++; continue; }
  if (d.slipTransAt === transAt) { same++; continue; }
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  slipTransAt ${d.slipTransAt === undefined ? "(ไม่มี)" : `"${d.slipTransAt}"`}→"${transAt}"  (ยืนยัน ${d.date} ${d.time} · โอนจริง ${thai(transAt)} · ${d.customerName || ""} ฿${d.slipAmount ?? "?"})`);
  if (WRITE) await doc.ref.update({ slipTransAt: transAt });
}
console.log(`\nรวม ${snap.size} ใบ · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} · ตรงอยู่แล้ว ${same} · ออเดอร์ไม่มี transAt (SlipOK ไม่ส่ง/แอดมินยืนยันเอง) ${noTransAt} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

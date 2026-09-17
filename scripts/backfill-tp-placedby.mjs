#!/usr/bin/env node
/**
 * เติม "ใครทำใบสั่งซื้อ" (placedBy) + LINE userId ของลูกค้า (lineUserId) ให้เรคอร์ดสะพาน iDucky → msVerify (collection iduckyPaidOrders) ที่ยิงไปก่อนมีฟิลด์นี้
 *
 *   node scripts/backfill-tp-placedby.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-placedby.mjs --write    # เขียนจริง
 *
 * placedBy = ชื่อพนักงานที่ทำบิลให้ลูกค้า · "" = ลูกค้าสั่งเองจากเว็บ
 * lineUserId = กุญแจจับคู่ออเดอร์ ↔ งานลูกค้า ในรายงานตรวจคนทำใบสั่งซื้อ (หน้า Reward) · "" = ออเดอร์ยังไม่ผูก LINE
 * เขียนเฉพาะ placedBy/lineUserId (update ไม่แตะฟิลด์อื่น) · ใบที่ค่าตรงกันอยู่แล้วข้าม
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

const snap = await db.collection("iduckyPaidOrders").get();
let changed = 0, same = 0, noOrder = 0, staff = 0, self = 0, withLine = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const orderId = d.orderId || doc.id.replace(/-final$/, "").replace(/-p[0-9a-z]{6,}$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  const placedBy = String(order.placedBy || "").trim();
  const lineUserId = String(order.lineUserId || "").trim();
  if (placedBy) staff++; else self++;
  if (lineUserId) withLine++;
  const patch = {};
  if (d.placedBy !== placedBy) patch.placedBy = placedBy;
  if (d.lineUserId !== lineUserId) patch.lineUserId = lineUserId;
  if (!Object.keys(patch).length) { same++; continue; }
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  ${Object.keys(patch).map((k) => `${k} ${d[k] === undefined ? "(ไม่มี)" : `"${d[k]}"`}→"${k === "lineUserId" && patch[k] ? patch[k].slice(0, 6) + "…" : patch[k]}"`).join(" · ")}  (${d.customerName || ""})`);
  if (WRITE) await doc.ref.update(patch);
}
console.log(`\nรวม ${snap.size} ใบ · พนักงานทำบิล ${staff} · ลูกค้าสั่งเอง ${self} · ผูก LINE แล้ว ${withLine} · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} · ตรงอยู่แล้ว ${same} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

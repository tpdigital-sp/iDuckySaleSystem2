#!/usr/bin/env node
/**
 * เติม "งานเร่ง + วันที่ลูกค้าต้องใช้งาน" ให้เรคอร์ดสะพาน iDucky → บอร์ด WIP (collection iduckyPaidOrders) ที่ยิงไปก่อนมีฟิลด์นี้
 *
 *   node scripts/backfill-tp-rush.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-rush.mjs --write    # เขียนจริง
 *
 * เขียนเฉพาะ rush/useByDate (update ไม่แตะฟิลด์อื่น) · ใบที่ค่าตรงกันอยู่แล้วข้าม
 * ของใหม่ tp-report.ts ใส่ให้ตอนสร้าง + syncRushToTP ตอนแอดมินแก้ — สคริปต์นี้ใช้ครั้งเดียว/ซ่อมเก่า
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
let changed = 0, same = 0, noOrder = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const orderId = d.orderId || doc.id.replace(/-final$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; continue; }
  const rush = !!order.rush, useByDate = order.useByDate || "";
  if (!!d.rush === rush && (d.useByDate || "") === useByDate) { same++; continue; }
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  rush ${!!d.rush}→${rush}  useBy "${d.useByDate || ""}"→"${useByDate}"  (${d.customerName || ""})`);
  if (WRITE) await doc.ref.update({ rush, useByDate, rushUpdatedAt: new Date().toISOString() });
}
console.log(`\nรวม ${snap.size} ใบ · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} · ตรงอยู่แล้ว ${same} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

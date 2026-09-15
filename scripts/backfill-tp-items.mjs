#!/usr/bin/env node
/**
 * เติม items (รายการสินค้าแบบโครงสร้าง) + noteText ให้เรคอร์ดสะพาน iDucky → msVerify (collection iduckyPaidOrders)
 * ที่ยิงไปก่อน 9 ก.ย. 69 — ฝั่ง Admin เอา items ไปใส่คอลัมน์ "รายการสินค้า" ของหน้ารายการวันนี้
 * (ก่อนหน้านี้มีแค่ note "ชื่อ ×N, ชื่อ ×N" ตัด 120 ตัวอักษร → ใบยาวหายท้าย)
 *
 *   node scripts/backfill-tp-items.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-items.mjs --write    # เขียนจริง
 *
 * update เฉพาะ items/noteText ไม่แตะฟิลด์อื่น · ใบที่มี items แล้วข้าม · noteText = ส่วนหน้า " · " ของ note (ถ้ามี)
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
  if (Array.isArray(d.items) && d.items.length) { same++; continue; }
  const orderId = d.orderId || doc.id.replace(/-final$/, "");
  const order = orderById.get(orderId);
  if (!order || !Array.isArray(order.items)) { noOrder++; console.log(`  ⚠ ${doc.id} ไม่พบออเดอร์ในฐาน — ข้าม`); continue; }
  const items = order.items.map((i) => ({ name: String(i.name || ""), qty: Number(i.qty) || 1 }));
  const note = String(d.note || "");
  const cut = note.indexOf(" · ");
  const noteText = cut >= 0 && note.slice(cut + 3).includes("×") ? note.slice(0, cut) : (note.includes("×") ? "" : note);
  changed++;
  console.log(`  ${WRITE ? "✍" : "→"} ${doc.id}  ${items.length} รายการ: ${items.map((i) => `${i.name} ×${i.qty}`).join(", ").slice(0, 90)}${noteText ? `  · note "${noteText}"` : ""}`);
  if (WRITE) await doc.ref.update({ items, noteText, itemsBackfilledAt: new Date().toISOString() });
}
console.log(`\nรวม ${snap.size} ใบ · ${WRITE ? "อัปเดต" : "จะอัปเดต"} ${changed} · มี items แล้ว ${same} · ไม่พบออเดอร์ ${noOrder}${WRITE ? "" : "\n(ใส่ --write เพื่อเขียนจริง)"}`);

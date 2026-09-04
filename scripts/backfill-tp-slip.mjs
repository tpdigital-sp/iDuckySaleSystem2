#!/usr/bin/env node
/**
 * เติม "ลิงก์สลิป" ให้เรคอร์ดสะพาน iDucky → msVerify ที่ยิงไปก่อนหน้านี้ (collection iduckyPaidOrders)
 *
 *   node scripts/backfill-tp-slip.mjs            # ดูอย่างเดียว
 *   node scripts/backfill-tp-slip.mjs --write    # เขียนจริง
 *
 * ทำไมต้องมี: ตอนแรกสะพานส่งแค่ชื่อ/ยอด/ลิงก์ออเดอร์ · หน้า msVerify (และบอร์ด WIP) อยากเห็นรูปสลิปด้วย
 * สลิปอยู่ใน bucket ส่วนตัว payment-slips-private → ต้องเซ็น URL (อายุ 1 ปี เท่ากับที่ tp-report.ts ใช้)
 * doc ที่ลงท้าย -final = งวดหลังของออเดอร์มัดจำ 50% → ใช้ deposit.balanceSlipPath
 * เขียนแบบ update เฉพาะฟิลด์สลิป ไม่แตะข้อมูลเดิม · ใบที่มี slipUrl อยู่แล้วข้าม (ใส่ --resign เพื่อเซ็นใหม่)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const RESIGN = process.argv.includes("--resign");
const BUCKET = "payment-slips-private";
const TTL = 365 * 24 * 60 * 60;

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
let filled = 0, already = 0, noSlip = 0, noOrder = 0;

for (const doc of snap.docs) {
  const d = doc.data();
  if (d.slipUrl && !RESIGN) { already++; continue; }
  const isFinal = /-final$/.test(doc.id);
  const orderId = d.orderId || doc.id.replace(/-final$/, "");
  const order = orderById.get(orderId);
  if (!order) { noOrder++; console.log(`  ⚠ ${doc.id} — ไม่พบออเดอร์ในฐาน`); continue; }

  const path = isFinal ? order.deposit?.balanceSlipPath : order.slipPath;
  let slipUrl = "", slipPath = "";
  if (path) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, TTL);
    slipUrl = signed?.signedUrl || "";
    slipPath = path;
  } else if (!isFinal && order.slipUrl) {
    slipUrl = order.slipUrl;   // ออเดอร์เก่า — public URL ถาวร
  }
  if (!slipUrl) { noSlip++; console.log(`  – ${doc.id} — ออเดอร์นี้ไม่มีสลิปเก็บไว้`); continue; }

  filled++;
  console.log(`  ✓ ${doc.id} — ${slipPath || "public URL"}`);
  if (WRITE) await doc.ref.update({ slipUrl, slipPath, slipSignedAt: new Date().toISOString() });
}

console.log(`\nรวม ${snap.size} ใบ · เติมสลิป ${filled} · มีอยู่แล้ว ${already} · ไม่มีสลิป ${noSlip} · ไม่พบออเดอร์ ${noOrder}`);
console.log(WRITE ? "เขียนลง Firestore แล้ว" : "โหมดดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง");

#!/usr/bin/env node
/**
 * 🧰➡️🎨 ซ่อมย้อนหลัง: "ออเดอร์เคลม/ทำใหม่ฟรี ไม่ขึ้นบอร์ด WIP ให้กราฟฟิก" (เจ้าของร้านแจ้ง 21 ก.ย. 69)
 *
 *   node scripts/tp-claim-backfill.mjs           # ดูอย่างเดียว
 *   node scripts/tp-claim-backfill.mjs --apply   # เขียนจริง
 *
 * สาเหตุ: ใบเคลมเกิดมาพร้อมสถานะ "ชำระแล้ว" ที่ /api/admin/orders/redo เลย ไม่ได้ผ่าน PATCH เปลี่ยนสถานะ
 * และไม่มีสลิปให้ตรวจ → ไม่มีใครยิงเรคอร์ดสะพาน (iduckyPaidOrders) = กราฟฟิกไม่เห็นงานเลย
 * ของใหม่ยิงให้เองแล้วตอนสร้างใบเคลม (redo/route.ts) + ตาข่ายชั้นสอง tp-bridge-audit — ตัวนี้ไว้เก็บใบเก่า
 *
 * เขียนเรคอร์ดใบเดียวยอด 0 (create — ใบที่มีอยู่แล้วข้าม ไม่ทับของเดิม)
 * ⚠️ ยอด 0 ฝั่ง msVerify ไม่ดึงเข้าระบบบัญชี (จับคู่ยอดธนาคารไม่ได้) จึงไม่รบกวนงานเคลียยอด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SITE_URL = (env.NEXT_PUBLIC_SITE_URL || "https://iduckystore.com").replace(/\/+$/, "");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

/** วัน/เวลาแบบไทยที่ msVerify + บอร์ด WIP ใช้ (date=YYYY-MM-DD, time=HH:MM) */
function bkkParts(iso) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
}

/** รายการสินค้าแบบโครงสร้าง — ชุดเดียวกับ tpItem ใน src/lib/server/tp-report.ts */
const tpItem = (i) => ({
  name: i.name,
  qty: i.qty,
  unit: i.unitYield?.unit || "ชิ้น",
  pieces: i.qty * Math.max(1, i.unitYield?.per ?? 1),
  piece: i.unitYield?.piece || "ชิ้น",
});

const { data: rows, error } = await sb.from("orders").select("id,data,created_at");
if (error) throw error;
const claims = (rows ?? []).filter((r) => r.data?.claimOf && r.data?.status === "ชำระแล้ว");
console.log(`ออเดอร์เคลม/ทำใหม่ที่สถานะ "ชำระแล้ว": ${claims.length} ใบ`);

let wrote = 0;
for (const r of claims) {
  const o = r.data;
  const ref = db.collection("iduckyPaidOrders").doc(o.id);
  if ((await ref.get()).exists) {
    console.log(`  ✓ ${o.id} — มีเรคอร์ดอยู่แล้ว ข้าม`);
    continue;
  }
  const at = o.savedAt || r.created_at || new Date().toISOString();
  const { date, time } = bkkParts(at);
  const noteText = `งานเคลม ไม่คิดเงิน · จาก ${o.claimOf}`;
  const summary = o.items.map((i) => `${i.name} ×${i.qty}`).join(", ").slice(0, 120);
  const doc = {
    id: `iducky-${o.id}`,
    orderId: o.id,
    date,
    time,
    customerName: o.customer || "",
    phone: o.phone || "",
    slipAmount: 0,
    orderTotal: 0,
    wht: 0,
    fee: 0,
    installment: "first",
    partial: false,
    earlyPay: 0,
    bank: "iDucky Store",
    orderLink: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}`,
    note: `${noteText} · ${summary}`.slice(0, 120),
    items: o.items.map(tpItem),
    newWorkItems: [],
    noteText,
    slipUrl: "",
    slipPath: "",
    slipSignedAt: new Date().toISOString(),
    slipRefNo: "",
    slipTransAt: "",
    verifiedBy: o.placedBy || "งานเคลม (เติมย้อนหลัง)",
    placedBy: o.placedBy || "",
    lineUserId: o.lineUserId || "",
    rush: !!o.rush,
    useByDate: o.useByDate || "",
    shipDate: o.shipDate?.from || o.shipDate?.to ? { from: o.shipDate.from || "", to: o.shipDate.to || "" } : null,
    stockWait: o.needsPurchase
      ? { at: o.needsPurchase.at, by: o.needsPurchase.by, note: o.needsPurchase.note ?? "", arrivedAt: o.needsPurchase.arrivedAt ?? "" }
      : null,
    claimOf: o.claimOf,
    claimReason: o.claimReason ?? "",
    paymentStatus: "ชำระแล้ว",
    origin: "iducky",
    createdAt: at,
    healedAt: new Date().toISOString(),
  };
  console.log(`  ${APPLY ? "➕ เขียน" : "🔎 จะเขียน"} ${o.id} · ${doc.customerName} · ${doc.note}`);
  if (APPLY) {
    await ref.create(doc);
    wrote++;
  }
}
console.log(APPLY ? `เขียนแล้ว ${wrote} ใบ` : "ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง");

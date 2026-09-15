/**
 * 👤 ซ่อมชื่อลูกค้าบนการ์ดบอร์ด WIP กราฟฟิก (iduckyPaidOrders) ให้ตรงหน้าออเดอร์
 * — ใบที่ลูกค้า/แอดมินแก้ชื่อผู้รับ "หลัง" ชำระแล้ว ก่อนที่ระบบจะ sync ให้เอง (syncCustomerToTP, 11 ก.ย. 69)
 *   เช่น OD-260910-5703 ชำระด้วยชื่อ LINE "🌻•Tood Tu•🌻92♾" แล้วเปลี่ยนเป็นชื่อจริง 7 นาทีต่อมา
 * — เขียนเหมือน syncCustomerToTP: customerName/phone ใหม่ + customerNameWas[] เก็บชื่อเก่า (บอร์ดใช้จับคู่โฟลเดอร์ชื่อเดิม)
 *
 *   node scripts/backfill-tp-customer.mjs            # dry-run ทุกใบ
 *   node scripts/backfill-tp-customer.mjs --apply    # เขียนจริง
 *   node scripts/backfill-tp-customer.mjs OD-260910-5703 --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.filter((a) => /^OD-/i.test(a)).map((a) => a.toUpperCase());

const snap = await db.collection("iduckyPaidOrders").get();
const docs = snap.docs.filter((d) => !only.length || only.includes(String(d.data().orderId || d.id).replace(/-final$/, "")));
const ids = [...new Set(docs.map((d) => String(d.data().orderId || d.id).replace(/-final$/, "")))];
const orders = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await sb.from("orders").select("id,data").in("id", ids.slice(i, i + 200));
  if (error) throw error;
  for (const r of data) orders.set(r.id, r.data);
}

let changed = 0;
for (const d of docs) {
  const rec = d.data();
  const oid = String(rec.orderId || d.id).replace(/-final$/, "");
  const o = orders.get(oid);
  if (!o) continue;
  const newName = (o.customer || "").trim();
  const newPhone = (o.phone || "").trim();
  const oldName = (rec.customerName || "").trim();
  const oldPhone = (rec.phone || "").trim();
  if (oldName === newName && oldPhone === newPhone) continue;
  changed++;
  console.log(`${d.id}: "${oldName}" → "${newName}"${oldPhone !== newPhone ? ` · เบอร์ "${oldPhone}" → "${newPhone}"` : ""}`);
  if (!apply) continue;
  const patch = { customerName: newName, phone: newPhone, customerUpdatedAt: new Date().toISOString() };
  if (oldName && oldName !== newName) patch.customerNameWas = FieldValue.arrayUnion(oldName);
  await d.ref.update(patch);
}
console.log(`${apply ? "เขียนแล้ว" : "dry-run"} ${changed} ใบ จาก ${docs.length} เรคอร์ด`);

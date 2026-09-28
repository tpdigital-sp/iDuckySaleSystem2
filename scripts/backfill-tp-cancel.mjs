/**
 * 🚫 ซ่อมธง "ออเดอร์ถูกยกเลิก" บนเรคอร์ดสะพานบอร์ด WIP กราฟฟิก (iduckyPaidOrders) ให้ตรงสถานะจริงใน iDucky
 * — ใบที่ถูกยกเลิก "หลัง" เงินเข้า ก่อนที่ระบบจะ sync ให้เอง (syncCancelToTP, 28 ก.ย. 69)
 *   การ์ดบนบอร์ดจะขึ้นคาดทะแยง 🚫 ออเดอร์ถูกยกเลิก ทันทีที่ธงลง (บอร์ดฟัง onSnapshot)
 * — เขียนเหมือน syncCancelToTP: orderStatus + orderCancelled { at, by } (at/by จาก log เปลี่ยนสถานะล่าสุด · ไม่มี = savedAt/ระบบ)
 *   ใบที่สถานะไม่ใช่ยกเลิกแต่เรคอร์ดค้างธงอยู่ (ถอนการยกเลิกก่อนมีระบบ) → เขียน null กลับ
 *
 *   node scripts/backfill-tp-cancel.mjs            # dry-run ทุกใบ
 *   node scripts/backfill-tp-cancel.mjs --apply    # เขียนจริง
 *   node scripts/backfill-tp-cancel.mjs OD-260924-1902 --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
// เฉพาะเรคอร์ดหลัก + -final (ใบเพิ่ม -p… บอร์ดอ่านธงจากใบหลักเอง)
const docs = snap.docs.filter((d) => !/-p[0-9a-z]{6,}$/.test(d.id) && (!only.length || only.includes(d.id.replace(/-final$/, ""))));
const ids = [...new Set(docs.map((d) => d.id.replace(/-final$/, "")))];
const orders = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await sb.from("orders").select("id,data").in("id", ids.slice(i, i + 200));
  if (error) throw error;
  for (const r of data) orders.set(r.id, r.data);
}

/** เวลา/คนที่เปลี่ยนสถานะเป็นยกเลิก จาก log (เอาอันล่าสุด) */
function cancelInfo(order) {
  const log = order.log || [];
  // 1) แอดมินเปลี่ยนสถานะ "… → ยกเลิก" (ล่าสุด) · 2) ลูกค้ายกเลิกเอง · ไม่มีทั้งคู่ = savedAt/ระบบ (ข้าม log ของ LINE ที่แค่แจ้งสถานะ)
  const hit = [...log].reverse().find((l) => l.by !== "LINE" && ((l.action === "เปลี่ยนสถานะ" && /→\s*ยกเลิก\s*$/.test(l.detail || "")) || l.action === "ยกเลิกออเดอร์เอง"));
  if (!hit) return { at: order.savedAt || new Date().toISOString(), by: "ระบบ (backfill)" };
  return { at: hit.at, by: hit.by === "ลูกค้า" ? "ลูกค้า" : `แอดมิน ${hit.by}` };
}

let toSet = 0, toClear = 0, ok = 0, missing = 0;
for (const d of docs) {
  const oid = d.id.replace(/-final$/, "");
  const order = orders.get(oid);
  if (!order) { missing++; continue; }
  const x = d.data();
  const isCancelled = order.status === "ยกเลิก";
  const hasFlag = !!(x.orderCancelled && x.orderCancelled.at) || x.orderStatus === "ยกเลิก";
  if (isCancelled === hasFlag) { ok++; continue; }
  const now = new Date().toISOString();
  const patch = isCancelled
    ? { orderStatus: "ยกเลิก", orderCancelled: cancelInfo(order), orderCancelledUpdatedAt: now }
    : { orderStatus: order.status, orderCancelled: null, orderCancelledUpdatedAt: now };
  if (isCancelled) toSet++; else toClear++;
  console.log(`${apply ? "✍️" : "👀"} ${d.id.padEnd(22)} ${isCancelled ? "→ ติดธงยกเลิก" : "→ ถอนธง (สถานะจริง " + order.status + ")"}  ${x.customerName || ""}  ${isCancelled ? patch.orderCancelled.at + " " + patch.orderCancelled.by : ""}`);
  if (apply) await d.ref.update(patch);
}
console.log(`\nสรุป: เรคอร์ด ${docs.length} · ตรงอยู่แล้ว ${ok} · ต้องติดธง ${toSet} · ต้องถอนธง ${toClear} · ไม่พบออเดอร์ในฐาน ${missing}${apply ? " · เขียนแล้ว" : " · (dry-run — ใส่ --apply เพื่อเขียนจริง)"}`);

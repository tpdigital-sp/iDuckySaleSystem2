/**
 * 🚫 ซ่อม OD-260922-2240 — สลิปโอนเข้าบัญชี หจก. เอดีมีเดีย (xxx-x-x8919-x) ไม่ใช่บัญชีร้าน แต่ SlipOK ผ่านเพราะยอด 1,300 ≥ 750
 * (22 ก.ย. 69 · ต้นตอ: ตัวตรวจสลิปไม่เคยเทียบผู้รับ — แก้ที่ matchSlipReceiver ใน src/lib/server/slipok.ts แล้ว)
 *
 * ทำอะไร:
 *   1. ผลตรวจสลิป (slipVerify) → fail + wrongReceiver (หน้าออเดอร์ขึ้นกล่องแดง "เงินไม่ได้เข้าร้าน")
 *   2. paidTotal 750 → 0 (เงินไม่ได้เข้าจริง) · สถานะคงเดิม "จัดส่งแล้ว" (ของแพ็คแล้ว รอลูกค้ามารับ — เก็บเงินตอนมารับได้)
 *   3. ลบเรคอร์ด msVerify ฝั่ง iDucky (Firestore tp-fixflow / iduckyPaidOrders / OD-260922-2240) ที่ส่งยอด 1,300 ไปผิด
 *      ⚠️ สำเนาที่หน้า msVerify ดึงไปเป็นหลักฐานของระบบนั้นเอง (idk-OD-260922-2240 · "ค้างจับคู่") อยู่คนละโปรเจกต์ Firebase
 *         สคริปต์นี้แตะไม่ได้ — เจ้าของร้านกด 🗑 ในหน้า msVerify เอง (ระบบนั้นจะจดกันดึงกลับให้)
 *   4. ลง log ไว้ในประวัติออเดอร์
 * ไม่แตะ: แต้ม/สต๊อก/ยอดขาย (ของผลิตแล้ว — ถ้าลูกค้าโอนใหม่ถูกบัญชี แนบสลิปตามปกติ ระบบนับให้เอง และแต้มกันซ้ำต่อออเดอร์อยู่แล้ว)
 *
 * รัน: npx tsx --tsconfig tsconfig.json scripts/fix-2240-wrong-receiver.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { getFirestoreAdmin } from "../src/lib/server/firebase-admin";
import { TP_PAID_COLLECTION } from "../src/lib/server/tp-report";

const ID = "OD-260922-2240";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("orders").select("data").eq("id", ID).single();
if (error || !row) throw new Error(error?.message ?? "ไม่พบออเดอร์");
const order = row.data as Order;
console.log("ก่อน:", { status: order.status, paidTotal: order.paidTotal, slipVerify: order.slipVerify, payments: order.payments?.length ?? 0, cashReceived: order.cashReceived });

const v = order.slipVerify;
if (!v || v.transRef !== "016265164320CTF02137") throw new Error("ผลตรวจสลิปไม่ตรงกับที่คาด — หยุด (อาจถูกแก้ไปแล้ว)");
if (v.wrongReceiver) { console.log("ซ่อมไปแล้ว — ไม่ทำซ้ำ"); process.exit(0); }

const now = new Date().toISOString();
const detail =
  'สลิปนี้โอนเข้าบัญชี "หจก. เอดีมีเดีย เ xxx-x-x8919-x" ไม่ใช่บัญชีร้าน (กสิกร 027-8-75332-8) — เงินไม่ได้เข้าร้าน ห้ามยืนยันเงินเข้า · ' +
  "ระบบเดิมผ่านให้เพราะเทียบแต่ยอด (1,300 ≥ 750) แก้ตัวตรวจแล้ว 24 ก.ย. 69";
let fixed: Order = {
  ...order,
  paidTotal: 0,
  slipVerify: {
    status: "fail",
    at: now,
    amount: v.amount,
    transRef: v.transRef,
    ...(v.transAt ? { transAt: v.transAt } : {}),
    receiver: "หจก. เอดีมีเดีย เ",
    receiverAccount: "xxx-x-x8919-x",
    wrongReceiver: true,
    noRetry: true,
    detail,
  },
};
fixed = withLog(
  fixed,
  "ระบบ (ซ่อม 24 ก.ย. 69)",
  "🚫 ถอนการยืนยันเงินเข้า — สลิปโอนเข้าบัญชีอื่น ไม่ใช่บัญชีร้าน",
  `${detail} · ถอย paidTotal 750 → 0 · สถานะคงเดิม (ของแพ็คแล้ว รอลูกค้ามารับ) · ลบเรคอร์ด msVerify ฝั่ง iDucky แล้ว — ติดต่อลูกค้าให้โอนใหม่เข้าบัญชีร้าน`
);
console.log("หลัง:", { status: fixed.status, paidTotal: fixed.paidTotal, slipVerify: fixed.slipVerify });

const db = getFirestoreAdmin();
const tpRef = db ? db.collection(TP_PAID_COLLECTION).doc(ID) : null;
const tpSnap = tpRef ? await tpRef.get() : null;
console.log("msVerify doc:", tpSnap?.exists ? tpSnap.data() : "(ไม่มี/ต่อ Firestore ไม่ได้)");

if (!APPLY) { console.log("\n(dry-run) ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const f = `backups/${ID}-before-wrong-receiver-fix-${now.replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(f, JSON.stringify({ order, tp: tpSnap?.exists ? tpSnap.data() : null }, null, 1));
console.log("backup ->", f);

const r = await updateOrder(sb, fixed, { prev: order, by: "ระบบ (ซ่อม 24 ก.ย. 69)" });
if (r.error) throw new Error(r.error.message);
console.log("✅ เขียนออเดอร์แล้ว");
if (tpRef && tpSnap?.exists) { await tpRef.delete(); console.log("✅ ลบ msVerify doc", ID, "แล้ว"); }

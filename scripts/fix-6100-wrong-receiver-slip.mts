/**
 * 🩹 ซ่อม OD-260922-6100 — สลิปใบแรก 50 บาทโอนเข้า "บัญชีคนอื่น" แต่ระบบนับเป็นรับบางส่วน (22 ก.ย. 69)
 *
 * เรื่องเดิม: ลูกค้าแนบสลิปพร้อมเพย์ 50 บาท ผู้รับ "นาย ศุภชัย แ" (xxx-xxx-1129) ไม่ใช่กสิกร บจก.ทีพีดิจิตอล 027-8-75332-8
 * SlipOK ตอบ "สลิปแท้" (แค่ธุรกรรมมีจริง ไม่ได้เช็คผู้รับ) → judge() เทียบแต่ยอด → "รับบางส่วน 50 ค้าง 69"
 * → ยิง msVerify (iduckyPaidOrders/OD-260922-6100 slipAmount 50) → สลิปจริง 119 ตามมา ระบบเลยบันทึก "โอนเกิน 50 คืนลูกค้า"
 * ต้นตอในโค้ดอุดแล้ว (matchSlipReceiver ใน slipok.ts — ด่านผู้รับก่อนด่านยอด)
 *
 * ซ่อม: slipVerify ใบแรก → fail + wrongReceiver ไม่นับ 50 · payments[0] นับ 119 เต็ม ถอน "โอนเกิน" · paidTotal คง 119 (เงินจริงที่เข้า)
 *      · doc TP หลัก → slipAmount 0 + voided (msVerify ไม่ดึงใบยอด 0 · แถวที่ mirror ไปแล้วต้องกด 🗑 ในหน้า msVerify เอง)
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-6100-wrong-receiver-slip.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { orderTotal, orderBalance, paidSoFar, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260922-6100";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const o = data.data as Order;
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-wrong-receiver-fix.json`, JSON.stringify(o, null, 1));

const first = o.slipVerify;
const extra = o.payments?.[0];
console.log(`${ID} ก่อนแก้ : ${o.status} · ยอดบิล ${orderTotal(o)} · paidTotal ${o.paidTotal} · paidSoFar ${paidSoFar(o)} · ค้าง ${orderBalance(o)}`);
console.log(`  สลิปแรก: ${first?.status} ยอด ${first?.amount} credited ${first?.credited} ref ${first?.transRef}`);
console.log(`  ใบเพิ่ม : ${extra?.id} credited ${extra?.credited} expected ${extra?.expected} over ${extra?.verify?.over} ref ${extra?.verify?.transRef}`);
if (first?.transRef !== "016265182045DPP05663" || first.credited !== 50) throw new Error("สลิปแรกไม่ใช่สภาพที่คาด (อาจซ่อมไปแล้ว) — หยุด");
if (!extra || extra.verify?.transRef !== "0462655o96mae789C09j" || extra.credited !== 69 || o.paidTotal !== 119) throw new Error("ใบเพิ่มไม่ใช่สภาพที่คาด — หยุด");
if (o.payments!.length !== 1) throw new Error("มีสลิปใบเพิ่มมากกว่า 1 ใบ — ตรวจเอง");

const { credited: _c, over: _o, ...firstRest } = first;
void _c; void _o;
const { over: _ov, ...extraVerifyRest } = extra.verify!;
void _ov;
let next: Order = {
  ...o,
  slipVerify: {
    ...firstRest,
    status: "fail",
    wrongReceiver: true,
    noRetry: true,
    receiver: "นาย ศุภชัย แ",
    receiverAccount: "xxx-xxx-1129",
    detail:
      "สลิปนี้โอนเข้าบัญชี \"นาย ศุภชัย แ xxx-xxx-1129\" (พร้อมเพย์) ไม่ใช่บัญชีร้าน (กสิกร 027-8-75332-8) — เงินไม่ได้เข้าร้าน ไม่นับยอด · ซ่อมย้อนหลัง 24 ก.ย. 69 (เดิมระบบนับเป็นรับบางส่วน 50)",
  },
  payments: [{ ...extra, expected: 119, credited: 119, verify: { ...extraVerifyRest, detail: "ผู้รับ: บจก. ท xxx-x-x5332-x", receiver: "บจก. ท", receiverAccount: "xxx-x-x5332-x" } }],
  paidTotal: 119,
};
next = withLog(
  next,
  BY,
  "🩹 ถอนยอดสลิปที่โอนเข้าบัญชีคนอื่นออก",
  "สลิปแรก 50 บาท (อ้างอิง 016265182045DPP05663) เป็นพร้อมเพย์โอนให้ \"นาย ศุภชัย แ\" ไม่ใช่บัญชีร้าน — ไม่นับ 50 · สลิปที่สอง 119 บาท (0462655o96mae789C09j) เข้าบัญชีร้านครบ ยอดชำระ 119 ถูกแล้ว ไม่มี \"โอนเกิน 50\" ให้คืน · เรคอร์ด msVerify ยอด 50 ถูก void · ต้นเหตุ: SlipOK ยืนยันแค่ธุรกรรมมีจริง ไม่ได้เช็คผู้รับ — อุดโค้ดแล้ว (ด่านผู้รับ) · ไม่แจ้งไลน์"
);
console.log(`${ID} หลังแก้ : paidTotal ${next.paidTotal} · paidSoFar ${paidSoFar(next)} · ค้าง ${orderBalance(next)} · สลิปแรก ${next.slipVerify?.status}/wrongReceiver · ใบเพิ่ม credited ${next.payments![0].credited} over ${next.payments![0].verify?.over}`);

if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกออเดอร์แล้ว");

// ── void เรคอร์ด msVerify หลัก (ยอด 50 ที่ไม่มีวันเข้า) — ใบเพิ่ม -pmucmq1h195at ยอด 119 ถูกอยู่แล้ว คงไว้ ──
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const ref = db.collection("iduckyPaidOrders").doc(ID);
const snap = await ref.get();
if (!snap.exists) throw new Error("ไม่พบ doc TP หลัก");
const cur = snap.data()!;
if (cur.slipAmount !== 50) throw new Error(`doc TP หลัก slipAmount ${cur.slipAmount} ไม่ใช่ 50 — หยุด`);
await ref.update({
  slipAmount: 0,
  orderTotal: 0,
  voided: true,
  voidedAt: new Date().toISOString(),
  voidReason: "สลิป 50 บาทโอนเข้าบัญชีคนอื่น (พร้อมเพย์ นาย ศุภชัย แ) ไม่ใช่บัญชีร้าน — เงินไม่ได้เข้า · ยอดจริง 119 อยู่ที่ใบ -pmucmq1h195at",
  note: "⛔ void: สลิป 50 โอนผิดบัญชี ไม่มีเงินเข้า · ยอดจริง 119 อยู่ใบ -pmucmq1h195at · CASE ADAPTER ×1 เซ็ต",
  noteText: "⛔ void: สลิป 50 โอนผิดบัญชี ไม่มีเงินเข้า",
  paymentStatus: "ยกเลิก (โอนผิดบัญชี)",
  slipRefNo: "",
});
console.log("✅ void doc TP หลักแล้ว (slipAmount 0) — แถวที่ msVerify ดึงไปก่อนหน้า ต้องกด 🗑 ในหน้านั้น");

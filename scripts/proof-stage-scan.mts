/**
 * 🚦 ไล่หาใบที่ "ข้ามประตูการเงิน" — สถานะเดินไปขั้นแบบ/ผลิตแล้ว ทั้งที่ยังค้างเงินและเคยถูกเด้งกลับรอชำระเงิน
 *
 *   node --conditions=react-server --import tsx scripts/proof-stage-scan.mts                 (ดูเฉย ๆ ทุกใบ)
 *   node --conditions=react-server --import tsx scripts/proof-stage-scan.mts OD-260915-7543
 *   node --conditions=react-server --import tsx scripts/proof-stage-scan.mts OD-260915-7543 --apply
 *
 * ต้นตอ (OD-260915-7543 · เจ้าของร้านแจ้ง 23 ก.ย. 69): ลูกค้าสั่งเพิ่ม → ใบเด้งกลับ "รอชำระเงิน" (reopenedFrom จำขั้นเดิมไว้)
 * → กราฟฟิกส่งแบบ + ลูกค้ากดอนุมัติ → ทาง /api/orders/review กับ /api/admin/orders/proof เขียน status ทับ
 * ทั้งที่สลิปใหม่ 3 ใบ SlipOK ตรวจไม่ผ่านสักใบ → ใบดูเหมือนจ่ายครบ เข้าคิวปริ้น/ส่งผลิต
 * ตั้งแต่ 23 ก.ย. 69 สองทางนั้นใช้ withProofStage แล้ว (ขั้นแบบไปจำที่ proofStage) — ตัวนี้ไว้เก็บใบเก่า
 *
 * ลายนิ้วมือของบั๊ก: reopenedFrom ยังติดอยู่ (ไม่มีใครล้าง) แต่ status พ้นขั้นรอเงินไปแล้ว
 * --apply = ถอยสถานะกลับ "รอชำระเงิน" + ย้ายขั้นแบบไปไว้ที่ proofStage (เงินเข้าครบเมื่อไหร่ระบบพากลับขั้นเดิมเอง)
 * ⚠️ ไม่แตะยอดเงิน/สลิป และไม่ยิงไลน์
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { awaitingPayment, hasUnpaidBalance, orderBalance, orderTotal, paidSoFar, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.filter((a) => !a.startsWith("--"));

const thb = (n: number) => n.toLocaleString("th-TH");

const { data, error } = await sb.from("orders").select("data");
if (error) throw new Error(error.message);
const orders = (data ?? []).map((r) => r.data as Order).filter((o) => (only.length ? only.includes(o.id) : true));

const hit = orders.filter((o) => !!o.reopenedFrom && !awaitingPayment(o) && o.status !== "ยกเลิก" && hasUnpaidBalance(o));
hit.sort((a, b) => a.id.localeCompare(b.id));

console.log(`ตรวจ ${orders.length} ใบ · เจอใบที่ข้ามประตูการเงิน ${hit.length} ใบ\n`);
for (const o of hit) {
  const unverified = (o.payments ?? []).filter((p) => !(p.credited ?? 0) && p.verify?.status !== "pass").length;
  console.log(
    `${o.id} · สถานะ "${o.status}" (เด้งมาจาก "${o.reopenedFrom}") · ค้าง ${thb(orderBalance(o))} จาก ${thb(orderTotal(o))} บาท` +
      ` · รับแล้ว ${thb(paidSoFar(o))}` +
      (unverified ? ` · สลิปที่ยังไม่นับยอด ${unverified} ใบ` : "")
  );
  if (!apply) continue;
  const next = withLog(
    { ...o, status: "รอชำระเงิน" as const, proofStage: o.status, reopenedFrom: undefined },
    "ระบบ (แก้ย้อนหลัง)",
    "ถอยกลับรอชำระเงิน — ขั้นแบบข้ามประตูการเงินไป",
    `"${o.status}" → "รอชำระเงิน" · จำขั้นแบบไว้ที่ proofStage ค้างอีก ${thb(orderBalance(o))} บาท (เงินเข้าครบแล้วระบบพากลับขั้นเดิมเอง)`
  );
  const { error: e } = await updateOrder(sb, next);
  console.log(e ? `   ❌ ${e.message}` : `   ✅ แก้แล้ว → รอชำระเงิน (proofStage = ${o.status})`);
}

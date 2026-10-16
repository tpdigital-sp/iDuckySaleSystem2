/**
 * 🩹 OD-261007-2540 (16 ต.ค. 69) — ยอดมัดจำค้างฉบับเก่าหลังเอกสาร FlowAccount ถูกแก้ · "โอนขาด 1,313" ที่จริงคือหัก ณ ที่จ่าย
 *
 * เรื่องเดิม: เปิดมัดจำ 66,192.88 จากใบ 132,385.75 (หัก 3,711.75) → QT010841 ถูกแก้เป็น 129,684 (หัก 3,636) ก่อนลูกค้าโอน
 * ลูกค้าโอนงวดแรก 63,024 = 64,842 − 1,818 (ครึ่งของใบใหม่หลังหักภาษี) ถูกต้อง แต่ระบบรอ 64,337 ของใบเก่า → บันทึก firstShort 1,313
 * ซิงก์เอกสารทีหลัง (16 ต.ค.) ไม่แตะ deposit.amount → งวด 1 ยังขึ้น "โอนขาด ฿1,313 → ยกไปรวมงวดที่ 2" ทั้งที่ลูกค้าโอนครบ
 * งวด 2 โอน 63,024 อีกใบ (ถูกต้องเช่นกัน) ถูกมองว่าขาด 1,780.12 (= ภาษีงวด 2) จนแอดมินกด "รับครบ" เอง → paidTotal ครบ 129,684 แล้ว
 * แต่ใบยังค้าง "รอตรวจสอบ" (พักไว้ตอนสลิปใบเพิ่มตก · reopenedFrom = อนุมัติแบบ) เพราะปุ่มรับครบไม่ปลดพัก
 *
 * แก้: deposit.amount 66,192.88 → 64,842 (50% ของ 129,684) · ลบ firstShort · สถานะกลับขั้นที่จำไว้ · paidTotal คงเดิม (ครบแล้ว)
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-2540-deposit-doc-resync.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { clearStageMemory, depositInstallments, orderTotal, orderWhtAmount, stageAfterPayment, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-261007-2540";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;
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
writeFileSync(`backups/${ID}-before-deposit-doc-resync.json`, JSON.stringify(o, null, 1));

const total = orderTotal(o);
const before = depositInstallments(o);
console.log(`${ID} ก่อนแก้ : ${o.status} (reopenedFrom ${o.reopenedFrom ?? "-"}) · ยอดบิล ${total} · หัก ${orderWhtAmount(o)} · paidTotal ${o.paidTotal}`);
console.log(`  deposit ${JSON.stringify(o.deposit)}`);
console.log(`  งวด 1 ${before?.first} (โอนจริง ${before?.firstNet}) · งวด 2 ${before?.second} (โอนจริง ${before?.secondNet})`);

if (!o.deposit?.firstPaidAt || !o.deposit.settledAt) throw new Error("สภาพใบไม่ใช่แบบที่คาดไว้ (ต้องเป็นใบมัดจำที่เก็บครบแล้ว) — หยุด");
if (Math.abs(total - 129684) >= 0.01 || Math.abs(o.deposit.amount - 66192.88) >= 0.01 || (o.deposit.firstShort ?? 0) !== 1313)
  throw new Error("ตัวเลขในใบไม่ตรงกับที่สคริปต์นี้เขียนไว้ — ตรวจก่อน");

const amount = r2(total / 2); // 64,842
const { firstShort: _drop, ...dep } = o.deposit;
let next: Order = { ...o, deposit: { ...dep, amount } };
const after = depositInstallments(next)!;
console.log(`หลังแก้ : มัดจำ ${amount} · งวด 1 ${after.first} (โอนจริง ${after.firstNet}) · งวด 2 ${after.second} (โอนจริง ${after.secondNet})`);
if (Math.abs(after.firstNet - 63024) >= 0.01 || Math.abs(after.secondNet - 63024) >= 0.01) throw new Error("ยอดโอนจริงต่องวดไม่ออกมาเป็น 63,024 — หยุด");

next = withLog(
  next,
  BY,
  "แก้ยอดมัดจำตามเอกสารที่ถูกแก้ (ลบ “โอนขาด”)",
  `เอกสาร QT010841 ถูกแก้ 132,385.75 → 129,684 ก่อนลูกค้าโอน แต่ยอดมัดจำในระบบยังเป็นครึ่งของใบเก่า (66,192.88) — ลูกค้าโอนงวดแรก 63,024 = 64,842 − หัก ณ ที่จ่าย 1,818 ถูกต้อง ไม่ใช่โอนขาด 1,313 · มัดจำงวดแรก 66,192.88 → 64,842 · งวด 2 โอน 63,024 ก็ครบพอดี (1,780.12 ที่เคยบอกว่าขาด = ภาษีงวด 2) · ยอดรับ ${o.paidTotal} คงเดิม`
);
const parked = (o.status === "รอตรวจสอบ" || o.status === "รอชำระเงิน") && !!o.reopenedFrom;
if (parked) {
  const to = stageAfterPayment(next);
  next = withLog({ ...next, status: to, ...clearStageMemory }, BY, "เก็บครบแล้ว — กลับไปขั้นเดิม", `${o.status} → ${to} (ใบถูกพักรอตรวจสลิปใบเพิ่ม ทั้งที่รับครบ 100% แล้ว)`);
  console.log(`สถานะ : ${o.status} → ${to}`);
}
if (!APPLY) {
  console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");

/**
 * 🏅 ใส่ส่วนลดระดับสมาชิกให้ OD-261014-3893 (#357 Silver 5%) — ผูกผู้ติดต่อหลังลูกค้าโอนครบ ระบบเลยไม่คิดให้เอง
 * ร้านสั่งให้ลด (14 ต.ค. 69) · เขียนผ่าน updateOrder (ประตูเขียนออเดอร์) · ส่วนเกินที่ลูกค้าโอนมาจะขึ้นกล่อง 💸 ให้คืนเงิน/ออกคูปอง
 *
 *   node --env-file=.env.local --require ./scripts/_tmp/shim-award.cjs --import tsx scripts/_tmp/tier-3893.mts          (ดูก่อน ไม่เขียน)
 *   node --env-file=.env.local --require ./scripts/_tmp/shim-award.cjs --import tsx scripts/_tmp/tier-3893.mts --apply  (เขียนจริง)
 */
import { createClient } from "@supabase/supabase-js";
import { orderItemDiscounts, orderSubtotal, orderTotal, withLog, type Order } from "../../src/lib/admin-data";
import { overpaidAmount } from "../../src/lib/payments";
import { tierDiscountAmount } from "../../src/lib/tiers";
import { memberTierLabel } from "../../src/lib/server/order-member-tier";
import { memberTierOfContact } from "../../src/lib/server/quote-member-tier";
import { updateOrder } from "../../src/lib/server/order-write";

const ID = "OD-261014-3893";
const apply = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data, error } = await sb.from("orders").select("data").eq("id", ID).single();
if (error || !data) throw error ?? new Error("ไม่พบออเดอร์");
const o = (data as { data: Order }).data;
if (o.discount) throw new Error(`ใบนี้มีส่วนลดอยู่แล้ว: ${o.discount.label} −${o.discount.amount} — ไม่แตะ`);
if (!o.contactId) throw new Error("ใบนี้ไม่ได้ผูกผู้ติดต่อ");

const tier = await memberTierOfContact(sb as never, o.contactId);
if (!tier) throw new Error(`ผู้ติดต่อ #${o.contactId} ไม่มีระดับส่วนลด`);
const base = Math.max(0, orderSubtotal(o) - orderItemDiscounts(o));
const amount = tierDiscountAmount(base, tier.pct);
const label = memberTierLabel(tier.name, tier.pct);
// ⚡ ส่วนลดโอนไวใช้ร่วมส่วนลดอื่นไม่ได้ (ปลีกล้วน) — ได้ส่วนลดสมาชิกแล้วเอา ฿5 ออก
const { earlyPay, ...noEarly } = o;
const dropped = earlyPay
  ? withLog(noEarly, "ระบบ", "เอาส่วนลดโอนไวออก", `ใช้ร่วมกับส่วนลดระดับสมาชิกไม่ได้ · ส่วนลดเดิม ${earlyPay.amount} บาท`)
  : noEarly;
const next = withLog(
  { ...dropped, discount: { label, amount, tierId: tier.id } },
  "ระบบ",
  "คิดส่วนลดระดับสมาชิก",
  `${label} −${amount} บาท (ผูกผู้ติดต่อหลังลูกค้าโอนครบ · ร้านสั่งให้ลดย้อนหลัง · ส่วนเกินคืนเงิน/ออกคูปองจากกล่อง 💸)`
);

console.log(`${ID} · ${o.customer} · ${o.status}`);
console.log(`ส่วนลด: ${label} −฿${amount} (ฐาน ฿${base})`);
console.log(`ยอดรวม: ฿${orderTotal(o)} → ฿${orderTotal(next)} · รับมาแล้ว ฿${o.paidTotal ?? 0} · โอนเกิน ฿${overpaidAmount(next)}`);
if (!apply) {
  console.log("\n(ยังไม่เขียน — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}
const { order: saved, error: saveErr } = await updateOrder(sb as never, next, { prev: o, by: "ระบบ" });
if (saveErr) throw saveErr;
console.log(`\n✅ บันทึกแล้ว · ยอดใหม่ ฿${orderTotal(saved)} · โอนเกิน ฿${overpaidAmount(saved)}`);

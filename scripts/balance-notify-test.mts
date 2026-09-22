/**
 * 🧪 เทสคิวแจ้ง "ยอดที่ต้องโอนเพิ่ม" (src/lib/balance-notify.ts)
 *
 *   npm run check:balance-notify
 *
 * เคสจริงที่เป็นต้นเรื่อง (พนักงานแจ้ง 22 ก.ย. 69):
 * แอดมินเพิ่มรายการเข้าออเดอร์ทีละชิ้น → ลูกค้าได้ไลน์ "ยอดที่ต้องโอนเพิ่ม" ทุกชิ้น
 * เพิ่มผิดแล้วลบออกแก้ใหม่ ก็ยังเด้งไปหาลูกค้าอีกข้อความ (เห็นในแชท OD-260918-1267)
 * → ยอดที่ขยับต้องรอในคิวจนแอดมินกดปุ่ม 📣 เอง (หรือ cron แจ้งแทนเมื่อเงียบครบกำหนด)
 */
import { BALANCE_AUTO_NOTIFY_MINUTES, balanceNotifyMinutesLeft, balanceNotifyOverdue, planBalanceQueue } from "../src/lib/balance-notify";
import type { Order } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

// ── ใบที่จ่ายครบแล้ว แอดมินเริ่มเพิ่มรายการ ────────────────────────────────
{
  // ชิ้นแรก: ยอดค้าง 0 → 300 = เปิดคิว (ยังไม่ส่งไลน์)
  const p1 = planBalanceQueue({ balBefore: 0, balNow: 300, pending: null, triggered: true });
  eq("เพิ่มชิ้นแรก → เปิดคิว ไม่ส่งไลน์", p1, { action: "start", from: 0, balance: 300 });

  // ชิ้นที่สอง: คิวเดิมยังอยู่ → อัปเดตยอด ไม่ใช่เปิดคิวใหม่ (ลูกค้าไม่ได้ข้อความที่ 2)
  const p2 = planBalanceQueue({ balBefore: 300, balNow: 800, pending: { from: 0 }, triggered: true });
  eq("เพิ่มชิ้นที่สอง → อัปเดตคิวเดิม", p2, { action: "refresh", from: 0, balance: 800 });

  // ลบชิ้นที่เพิ่มผิดออก 1 ชิ้น — ยังต่างจากยอดเดิม คิวยังอยู่
  const p3 = planBalanceQueue({ balBefore: 800, balNow: 300, pending: { from: 0 }, triggered: false });
  eq("ลบออก 1 ชิ้น → คิวยังอยู่ ยอดตามจริง", p3, { action: "refresh", from: 0, balance: 300 });

  // ลบออกหมดจนยอดกลับเท่าเดิม → ทิ้งคิว ลูกค้าไม่ต้องรู้เรื่องเลย
  const p4 = planBalanceQueue({ balBefore: 300, balNow: 0, pending: { from: 0 }, triggered: false });
  eq("ลบออกหมด → ทิ้งคิว ไม่แจ้งลูกค้า", p4, { action: "cancel" });
}

// ── บันทึกเรื่องอื่นระหว่างที่คิวค้างอยู่ (ติ๊กงาน/อัปแบบ/แก้ที่อยู่) ────────
{
  const p = planBalanceQueue({ balBefore: 500, balNow: 500, pending: { from: 0 }, triggered: false });
  eq("ยอดไม่ขยับ → ไม่เลื่อนนาฬิกา ลูกค้าไม่ต้องรอนานขึ้น", p, { action: "keep" });
}

// ── ยอดขยับแต่ไม่เข้าเงื่อนไขต้องบอกลูกค้า (ใบยังไม่เคยรับเงิน) ─────────────
{
  const p = planBalanceQueue({ balBefore: 0, balNow: 0, pending: null, triggered: false });
  eq("ใบที่ยังไม่มีเงินเข้า → ไม่เปิดคิว", p, { action: "keep" });
}

// ── เคยแจ้งไปแล้ว แล้วแอดมินใส่ส่วนลดทีหลัง (ยอดลด) ────────────────────────
{
  const p = planBalanceQueue({ balBefore: 730, balNow: 680, pending: null, triggered: true });
  eq("ใส่ส่วนลดหลังแจ้งยอดไปแล้ว → เปิดคิวแจ้งยอดใหม่", p, { action: "start", from: 730, balance: 680 });
  // แล้วแอดมินถอนส่วนลดออก — ยอดกลับเท่าที่ลูกค้าถืออยู่ ไม่ต้องกวนอีก
  const back = planBalanceQueue({ balBefore: 680, balNow: 730, pending: { from: 730 }, triggered: false });
  eq("ถอนส่วนลดกลับ → ทิ้งคิว", back, { action: "cancel" });
}

// ── เศษสตางค์ (ปัดทศนิยม) ต้องไม่นับว่ายอดขยับ ──────────────────────────────
{
  const p = planBalanceQueue({ balBefore: 500, balNow: 500.3, pending: { from: 0 }, triggered: false });
  eq("ต่างไม่ถึง 50 สตางค์ = ยอดเท่าเดิม", p, { action: "keep" });
  const c = planBalanceQueue({ balBefore: 500, balNow: 0.25, pending: { from: 0 }, triggered: false });
  eq("กลับมาเหลือเศษ 25 สตางค์ = เท่ายอดเดิม → ทิ้งคิว", c, { action: "cancel" });
}

// ── นาฬิกาให้ cron แจ้งแทน ──────────────────────────────────────────────────
{
  const now = Date.parse("2026-09-22T10:00:00+07:00");
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const mk = (minsAgo: number) => ({ id: "OD-TEST", balancePending: { at: at(minsAgo), from: 0, balance: 300 } }) as unknown as Order;

  eq("เพิ่งแก้ 1 นาที → ยังไม่ถึงเวลาแจ้งแทน", balanceNotifyOverdue(mk(1), now), false);
  eq(`เงียบครบ ${BALANCE_AUTO_NOTIFY_MINUTES} นาที → cron แจ้งแทน`, balanceNotifyOverdue(mk(BALANCE_AUTO_NOTIFY_MINUTES), now), true);
  eq("ไม่มีคิว → ไม่มีอะไรให้แจ้ง", balanceNotifyOverdue({ id: "OD-TEST" } as Order, now), false);
  eq("เหลืออีกกี่นาที", balanceNotifyMinutesLeft(mk(5), now), BALANCE_AUTO_NOTIFY_MINUTES - 5);
  eq("เลยเวลาแล้วไม่ติดลบ", balanceNotifyMinutesLeft(mk(99), now), 0);
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ ผ่านทั้ง ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);

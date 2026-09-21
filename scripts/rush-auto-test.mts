/**
 * 🔥 เทสกติกา "งานเร่งอัตโนมัติ" — npm run check:rush
 *
 * พนักงานแจ้ง 21 ก.ย. 69: ใบที่ลูกค้าสั่งเองไม่มีใครกดปุ่ม 🔥 ให้ กราฟฟิกกว่าจะรู้ว่าเร่งก็เลยรอบส่งผลิต
 * → ระบบติ๊กธงให้เองเมื่อวันใช้งานเหลือไม่ถึง 3 วันทำการ (lib/rush-auto.ts) ที่ประตูเขียนออเดอร์
 *
 * ตรึงไว้ 3 เรื่องที่พลาดแล้วเจ็บ: นับวันทำการข้ามเสาร์-อาทิตย์/วันหยุด · คนกดเองชนะระบบเสมอ · แจ้งไลน์ครั้งเดียว
 */
import type { Order } from "../src/lib/admin-data";
import { setShopHolidays } from "../src/lib/ship-date";
import { applyAutoRush, autoRushReason, stampRushAlert, rushManualStamp, workingDaysUntil } from "../src/lib/rush-auto";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

// ปฏิทินร้านของเทส: จันทร์ 21 ก.ย. 2026 เป็นวันทำการปกติ · ศุกร์ 25 ก.ย. ตั้งให้เป็นวันหยุดร้าน
setShopHolidays({ "2026-09-25": "วันหยุดร้าน (เทส)" });

const mk = (o: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "",
    customer: "A",
    phone: "",
    address: "",
    status: "รอชำระเงิน",
    payment: "โอนธนาคาร",
    shipping: "",
    shippingCost: 0,
    items: [{ productId: "p1", name: "ของ 1", qty: 1, unitPrice: 100 }],
    ...o,
  }) as Order;

// ── นับวันทำการ (วันนี้ = จันทร์ 21 ก.ย. 2026) ──────────────────────────────────
const MON = "2026-09-21";
eq("ใช้งานพุธ 23 = เหลือ 1 วันทำการ (อังคาร)", workingDaysUntil("2026-09-23", MON), 1);
eq("ใช้งานพฤ 24 = เหลือ 2 วันทำการ", workingDaysUntil("2026-09-24", MON), 2);
eq("ใช้งานจันทร์ถัดไป 28 = เหลือ 3 (ศ.25 เป็นวันหยุดร้าน · ส-อา ไม่นับ)", workingDaysUntil("2026-09-28", MON), 3);
eq("ใช้งานวันนี้ = 0", workingDaysUntil(MON, MON), 0);
eq("เลยวันใช้งานมาแล้ว = -1", workingDaysUntil("2026-09-18", MON), -1);
eq("วันผิดรูป = -1", workingDaysUntil("ไม่รู้", MON), -1);

// ── ใบไหนเข้าข่ายงานเร่ง ───────────────────────────────────────────────────────
eq("ไม่ระบุวันใช้งาน = ไม่เร่ง", autoRushReason(mk({}), MON), null);
eq("ใช้งานจันทร์ถัดไป (3 วันทำการ) = ยังไม่เร่ง", autoRushReason(mk({ useByDate: "2026-09-28" }), MON), null);
eq("ใช้งานพฤ 24 (2 วันทำการ) = เร่ง", !!autoRushReason(mk({ useByDate: "2026-09-24" }), MON), true);
eq("ใบยกเลิก/จบแล้ว = ไม่เร่ง", autoRushReason(mk({ useByDate: "2026-09-23", status: "ยกเลิก" }), MON), null);
eq("เลยวันใช้งานแล้ว = ไม่ปลุกธงใหม่ (ทุกจอมีป้าย 'เลยกำหนด' อยู่แล้ว)", autoRushReason(mk({ useByDate: "2026-09-18" }), MON), null);

// ── ธงที่ระบบติ๊ก/ปลดให้ ───────────────────────────────────────────────────────
const tight = applyAutoRush(mk({ useByDate: "2026-09-23" }), MON);
eq("วันใช้งานกระชั้น → ติ๊กให้เอง + จดว่าเป็นธงของระบบ", [tight.turned, tight.order.rush, !!tight.order.rushAuto], ["on", true, true]);
eq("ติ๊กแล้วบันทึกซ้ำ = ไม่ติ๊กใหม่", applyAutoRush(tight.order, MON).turned, null);

const pushed = applyAutoRush({ ...tight.order, useByDate: "2026-10-30" }, MON);
eq("เลื่อนวันใช้งานออกไป → ปลดธงให้เอง", [pushed.turned, !!pushed.order.rush, pushed.order.rushAuto], ["off", false, undefined]);

const late = applyAutoRush({ ...tight.order, useByDate: "2026-09-18" }, MON);
eq("เลยวันใช้งานมาแล้ว → คงธงไว้ ห้ามปลด (ยิ่งต้องเร่ง)", [late.turned, late.order.rush], [null, true]);
const lateDone = applyAutoRush({ ...tight.order, useByDate: "2026-09-18", status: "เสร็จสิ้น" }, MON);
eq("ใบจบแล้วแม้เลยวันใช้งาน → ปลดธงได้", [lateDone.turned, !!lateDone.order.rush], ["off", false]);

// ── คนตัดสินชนะระบบเสมอ ────────────────────────────────────────────────────────
const cancelled = mk({ useByDate: "2026-09-23", rush: false, rushManual: rushManualStamp("แอดมินหนึ่ง", false) });
eq("แอดมินกดยกเลิกงานเร่งเอง → ระบบไม่ติ๊กกลับ", [applyAutoRush(cancelled, MON).turned, !!applyAutoRush(cancelled, MON).order.rush], [null, false]);
const byHand = mk({ useByDate: "2026-10-30", rush: true, rushManual: rushManualStamp("แอดมินหนึ่ง", true) });
eq("แอดมินกดเร่งเองทั้งที่วันยังไกล → ระบบไม่ปลดให้", [applyAutoRush(byHand, MON).turned, applyAutoRush(byHand, MON).order.rush], [null, true]);
const legacy = mk({ useByDate: "2026-10-30", rush: true });
eq("ใบเก่าที่คนติ๊กไว้ก่อนมีระบบนี้ (ไม่มี rushAuto) → ไม่ปลดให้", [applyAutoRush(legacy, MON).turned, applyAutoRush(legacy, MON).order.rush], [null, true]);

// ── แจ้งกลุ่มไลน์ร้านครั้งเดียว และเฉพาะใบที่เงินเข้าแล้ว ────────────────────────
const unpaid = stampRushAlert(null, tight.order);
eq("ใบยังไม่จ่าย = ยังไม่แจ้ง", [unpaid.due, unpaid.order.rushAuto?.alertedAt], [false, undefined]);
const paid = stampRushAlert(null, { ...tight.order, status: "ชำระแล้ว" });
eq("เงินเข้าแล้ว = แจ้ง 1 ครั้ง + ประทับตรา", [paid.due, !!paid.order.rushAuto?.alertedAt], [true, true]);
eq("งานเข้าไลน์ผลิตแล้ว = ไม่ต้องเตือนให้รีบทำแบบ", stampRushAlert(null, { ...tight.order, status: "กำลังผลิต" }).due, false);
eq("บันทึกซ้ำ = ไม่แจ้งอีก", stampRushAlert(paid.order, paid.order).due, false);
// หน้าจอค้างส่งก้อนที่ไม่มีตรา alertedAt กลับมา → ต้องคงตราเดิม ไม่เด้งซ้ำ (กติกาเดียวกับ needs-purchase)
const stale = { ...paid.order, rushAuto: { at: paid.order.rushAuto!.at, reason: paid.order.rushAuto!.reason } };
eq("หน้าจอค้างทับ = ไม่แจ้งซ้ำ", stampRushAlert(paid.order, stale).due, false);

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส (ผ่าน ${pass})\n\n${fails.join("\n\n")}` : `✅ ผ่านทั้งหมด ${pass} เคส`);
process.exit(fails.length ? 1 : 0);

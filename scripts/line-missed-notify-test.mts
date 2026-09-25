/**
 * 📨 เทสกติกา "ส่งย้อนหลังหลังผูก LINE" — missedLineNotifies (lib/server/notify.ts) + inBackground นอก request scope
 *
 *   npm run check:line-missed
 *
 * ที่มา 25 ก.ย. 69: ลูกค้าโอนภายในนาทีแรกหลังสั่ง การ์ด "ยืนยันการชำระเงิน" ขึ้น "ยังไม่ได้ผูก LINE" แล้วพนักงานเพิ่งผูกตามหลัง
 * → ไม่มีใครส่งซ้ำ ลูกค้าไม่ได้การ์ดเงินเข้า · ตอนนี้ line-bind route ส่งการ์ดสถานะล่าสุดให้เองเมื่อมีเรื่องค้าง
 */
import assert from "node:assert/strict";
import { missedLineNotifies } from "../src/lib/server/notify.ts";
import { inBackground } from "../src/lib/server/background.ts";
import { lastProofNotify } from "../src/lib/proof-notify.ts";
import type { Order } from "../src/lib/admin-data.ts";

const L = (action: string, detail?: string, by = "LINE") => ({ at: new Date().toISOString(), by, action, detail });
const order = (log: ReturnType<typeof L>[]) => ({ id: "OD-TEST", items: [], log }) as unknown as Order;

// 1) ไม่เคยพลาดอะไร → ว่าง (ผูกแล้วต้องเงียบ)
assert.deepEqual(missedLineNotifies(order([L("สร้างออเดอร์"), L("ยืนยันการชำระเงินอัตโนมัติ", "ยอด 405 บาท", "SlipOK")])), []);

// 2) พลาดการ์ดเงินเข้าเพราะยังไม่ผูก → คืน "ยืนยันการชำระเงิน"
assert.deepEqual(
  missedLineNotifies(order([L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "ยืนยันการชำระเงิน · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้")])),
  ["ยืนยันการชำระเงิน"]
);

// 3) เคยส่งถึงแล้วหลังจากนั้น → ของเก่าก่อนหน้าไม่นับ (ลูกค้าได้ข่าวล่าสุดไปแล้ว)
assert.deepEqual(
  missedLineNotifies(
    order([
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "ยืนยันการชำระเงิน · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้"),
      L("แจ้งลูกค้าทางไลน์แล้ว", "แจ้งสถานะ \"กำลังผลิต\" · ผ่าน LINE ที่พนักงานผูกไว้"),
    ])
  ),
  []
);

// 4) หลายเรื่อง + ซ้ำ + สาเหตุอื่น (ต่อ LINE ไม่ได้ / ปิดรับ) → เฉพาะ "ยังไม่ได้ผูก" ไม่ซ้ำ เรียงเก่า→ใหม่
assert.deepEqual(
  missedLineNotifies(
    order([
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "ยืนยันการชำระเงิน · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้"),
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แบบงาน 2 รูป · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้", "372"),
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แบบงาน 2 รูป · แจ้งซ้ำ · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้", "372"),
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แจ้งสถานะ \"จัดส่งแล้ว\" · ผ่าน LINE ที่พนักงานผูกไว้ · ต่อ LINE ไม่ได้ (เน็ต/ปลายทางไม่ตอบ)"),
      L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "ทวงยอดคงเหลือ 100 บาท · ลูกค้าปิดรับแจ้งเตือน"),
    ])
  ),
  ["ยืนยันการชำระเงิน", "แบบงาน 2 รูป"]
);

// 5) inBackground นอก request scope (สคริปต์/เทส): after() โยน → ต้องไม่ระเบิด และงานยังวิ่งจนจบ · งานล้มก็ไม่ระเบิด
let ran = false;
inBackground("test-ok", (async () => { await new Promise((r) => setTimeout(r, 10)); ran = true; })());
inBackground("test-fail", Promise.reject(new Error("จงใจล้ม")));
await new Promise((r) => setTimeout(r, 50));
assert.equal(ran, true);

// 6) กล่องใต้แบบงานต้องบอกผลจริง — proofNotifiedAt ปักเวลาแม้ส่งไม่ถึง (เจ้าของร้านถาม 25 ก.ย. 69 "ปุ่มนี้กดแล้วแจ้งเตือนไหม")
assert.equal(lastProofNotify(order([])), null);
assert.equal(lastProofNotify(order([L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แบบงาน 1 รูป · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้", "372")]))?.unbound, true);
assert.equal(lastProofNotify(order([L("แจ้งลูกค้าทางไลน์แล้ว", "แบบงาน 2 รูป", "372")]))?.ok, true);
// ล้มเพราะยังไม่ผูก แล้วแอดมินผูก → ส่งย้อนหลังถึงแล้ว = ok
assert.equal(
  lastProofNotify(order([
    L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แบบงาน 1 รูป · ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้", "372"),
    L("แจ้งลูกค้าทางไลน์แล้ว", "ส่งย้อนหลังหลังผูก LINE — การ์ดสถานะ \"อนุมัติแบบ\" (ที่พลาดไป: แบบงาน 1 รูป)"),
  ]))?.ok,
  true
);
// ล้มเพราะลูกค้าบล็อก แล้วมีข้อความสถานะอื่นส่งถึง — แบบงานยังถือว่าไม่ถึง
assert.equal(
  lastProofNotify(order([
    L("แจ้งลูกค้าทางไลน์ไม่สำเร็จ", "แบบงาน 1 รูป · ลูกค้าบล็อกบัญชีร้าน หรือไม่ได้เป็นเพื่อนกับ OA", "372"),
    L("แจ้งลูกค้าทางไลน์แล้ว", "แจ้งสถานะ \"กำลังผลิต\" · ผ่าน LINE ที่พนักงานผูกไว้"),
  ]))?.ok,
  false
);

console.log("✅ line-missed-notify: ผ่านทั้ง 6 ข้อ");

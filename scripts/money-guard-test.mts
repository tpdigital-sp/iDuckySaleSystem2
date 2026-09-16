/**
 * 💰 เทสด่าน "กันหน้าจอค้างทับข้อมูลการเงิน" — npx tsx --tsconfig tsconfig.json scripts/money-guard-test.mts
 *
 * เคสจริงที่ทำให้ต้องมีด่านนี้ (OD-260915-6742 · 15 ก.ย. 69):
 *   15:38 ลูกค้าแนบสลิป 495 → SlipOK ผ่าน · ยืนยันชำระ · ล็อกส่วนลดโอนไว
 *   15:42 หน้าออเดอร์ที่เปิดค้างตั้งแต่ 15:16 กดบันทึก → ก้อนเก่าทับ เงิน/สลิป/ล็อกส่วนลดหายหมด
 *         → ไลน์บอกลูกค้าที่จ่ายครบว่า "รอชำระเงิน" · ส่วนลดกลายเป็นหมดเวลา ยอดเด้ง 495 → 500
 *         → ลูกค้าแนบสลิปใบเดิมซ้ำ SlipOK ตอบ "สลิปซ้ำ" ใบค้าง "รอตรวจสอบ"
 *
 * กติกา (src/lib/server/order-money-guard.ts): ฐานมีเรื่องเงินใหม่กว่าทั้งเวลาที่หน้าจอเห็นล่าสุด
 * และเรื่องเงินที่หน้าจอส่งกลับมา = หน้าจอยังไม่รู้ว่ามีเงินเข้า → คงของในฐาน
 */
import { keepServerMoney, moneyStamp } from "../src/lib/server/order-money-guard";
import { earlyPayState, orderTotal, type Order } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const mk = (o: Partial<Order>): Order =>
  ({ id: "OD-TEST", date: "", customer: "", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 50, items: [{ productId: "1-4", name: "กริ๊บต๊อกอะคริลิค", qty: 3, unitPrice: 150 }], ...o }) as Order;

// ── เคสจริง OD-260915-6742 ────────────────────────────────────────────────────────
/** ก้อนเก่าที่หน้าจอถือไว้ตั้งแต่ 15:16 (ยังไม่มีเงินเข้า) */
const stale = mk({ earlyPay: { label: "⚡ ส่วนลดโอนไว", amount: 5, expiresAt: "2026-09-15T09:16:00.589Z" } });
/** ของจริงในฐานหลัง SlipOK ผ่าน 15:38 */
const paid: Order = {
  ...stale,
  status: "ชำระแล้ว",
  paidTotal: 495,
  paidReportedAt: "2026-09-15T08:38:04.231Z",
  slipHash: "f0762646",
  slipPath: "OD-260915-6742/slip.jpg",
  slipVerify: { status: "pass", amount: 495, transRef: "016258153747DTF09152", at: "2026-09-15T08:38:06.507Z" },
  earlyPay: { ...stale.earlyPay!, lockedAt: "2026-09-15T08:38:04.231Z", lockedBy: "ลูกค้า" },
};

const guarded = keepServerMoney(paid, stale, "2026-09-15T08:16:06.982Z");
eq("หน้าจอค้าง: ยอดที่รับแล้วไม่หาย", guarded.order.paidTotal, 495);
eq("หน้าจอค้าง: ผลตรวจสลิปไม่หาย", guarded.order.slipVerify?.status, "pass");
eq("หน้าจอค้าง: สถานะไม่เด้งกลับรอชำระเงิน", guarded.order.status, "ชำระแล้ว");
eq("หน้าจอค้าง: ส่วนลดโอนไวยังล็อกอยู่", earlyPayState(guarded.order, Date.parse("2026-09-15T12:00:00Z")), "locked");
eq("หน้าจอค้าง: ยอดรวมยังเป็น 495 ไม่เด้งเป็น 500", orderTotal(guarded.order), 495);
eq("หน้าจอค้าง: ลง log ว่าคงอะไรไว้บ้าง", guarded.kept.includes("paidTotal") && guarded.kept.includes("status"), true);
eq("ไม่มีด่าน = เงินหายจริง (ยืนยันว่าเคสนี้พังได้จริง)", [stale.paidTotal, stale.status, orderTotal(stale)], [undefined, "รอชำระเงิน", 500]);

// ── หน้าจอที่เห็นเงินก้อนล่าสุดแล้ว ต้องแก้เรื่องเงินได้ตามปกติ ─────────────────────────
eq(
  "หน้าจอสด: แอดมินตั้งใจดึงกลับ 'รอชำระเงิน' ได้",
  keepServerMoney(paid, { ...paid, status: "รอชำระเงิน" }, "2026-09-15T08:40:00.000Z").kept,
  []
);
eq(
  "หน้าจอสด: ติ๊ก 'ลูกค้าไม่รับส่วนลดโอนไว' ได้ (waivedAt ไม่นับเป็นเรื่องเงินของเซิร์ฟเวอร์)",
  keepServerMoney(paid, { ...paid, earlyPay: { ...paid.earlyPay!, waivedAt: "2026-09-15T10:00:00.000Z", waivedBy: "แอดมิน" } }, "2026-09-15T08:40:00.000Z").kept,
  []
);
eq(
  "ติ๊กออกทีหลัง (waivedAt หาย) ก็ไม่โดนคงกลับ",
  keepServerMoney({ ...paid, earlyPay: { ...paid.earlyPay!, waivedAt: "2026-09-15T10:00:00.000Z" } }, paid, "2026-09-15T08:40:00.000Z").kept,
  []
);
eq(
  "ใบเก่าที่ savedAt ค้างก่อนเงินเข้า (ก่อนประตูประทับ savedAt ให้ทุกครั้ง) — หน้าจอถือเรื่องเงินชุดเดียวกับฐาน = ไม่กัน",
  keepServerMoney(paid, { ...paid, customer: "ชื่อใหม่" }, "").kept,
  []
);
eq("ใบที่ยังไม่มีเรื่องเงินเลย = ไม่มีอะไรให้กัน", keepServerMoney(stale, { ...stale, customer: "x" }, "").kept, []);
eq(
  "หน้าจอค้างดันงานไปขั้นหลังเงิน (กำลังผลิต) = สถานะปล่อยผ่าน แต่เงินยังคงไว้",
  (() => {
    const g = keepServerMoney(paid, { ...stale, status: "กำลังผลิต" }, "2026-09-15T08:16:06.982Z");
    return [g.order.status, g.order.paidTotal];
  })(),
  ["กำลังผลิต", 495]
);

// ── moneyStamp: นับทุกทางที่เงินขยับ ───────────────────────────────────────────────
eq("นับสลิปใบเพิ่ม (payments[])", moneyStamp(mk({ payments: [{ id: "a", path: "p", at: "2026-09-15T09:00:00.000Z", by: "ลูกค้า" }] })), "2026-09-15T09:00:00.000Z");
eq("นับค่าบริการที่เก็บเพิ่ม (charges[])", moneyStamp(mk({ charges: [{ id: "c", label: "ค่าเร่ง", amount: 50, by: "แอดมิน", at: "2026-09-15T09:30:00.000Z" }] })), "2026-09-15T09:30:00.000Z");
eq("นับงวดมัดจำ", moneyStamp(mk({ deposit: { amount: 100, firstPaidAt: "2026-09-15T07:00:00.000Z" } })), "2026-09-15T07:00:00.000Z");
eq("ไม่นับ waivedAt", moneyStamp(mk({ earlyPay: { label: "x", amount: 5, waivedAt: "2026-09-20T00:00:00.000Z" } })), "");

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);

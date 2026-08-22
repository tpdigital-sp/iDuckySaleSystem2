"use client";

/**
 * ป้ายสถานะออเดอร์ + สีประจำสถานะ — ใช้ร่วมกันทุกหน้าในดีไซน์ "รางเบนโตะกระจก"
 * (หน้าภาพรวม /admin และหน้าคำสั่งซื้อ /admin/orders)
 *
 * กติกา: งานที่จบแล้วต้องเงียบกว่างานค้างเสมอ — ป้ายไม่มีพื้น ตัวอักษรจาง
 * และแยกสถานะได้ด้วย "สี + จุด + น้ำหนักตัวอักษร" ไม่ใช่สีอย่างเดียว
 * ⚠️ สีทั้งหมดมาจาก token ใน dashboard.css — ห้ามเขียน hex ที่นี่
 */

import { CLOSED } from "@/lib/admin-dash";
import type { OrderStatus } from "@/lib/admin-data";

const CHIP: Record<OrderStatus, { fg: string; bg: string }> = {
  รอชำระเงิน: { fg: "var(--dk-yolk-ink)", bg: "var(--dk-yolk-wash)" },
  รอตรวจสอบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  ชำระแล้ว: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  รอตรวจแบบ: { fg: "var(--dk-lilac-ink)", bg: "var(--dk-lilac-wash)" },
  แก้ไขแบบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  อนุมัติแบบ: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  กำลังผลิต: { fg: "var(--dk-blue-deep)", bg: "var(--dk-sky)" },
  จัดส่งแล้ว: { fg: "var(--dk-navy-soft)", bg: "transparent" },
  เสร็จสิ้น: { fg: "var(--dk-faint)", bg: "transparent" },
  ยกเลิก: { fg: "var(--dk-faint)", bg: "transparent" },
};

/** สีแถบซ้ายของแถว + แถบความคืบหน้า — เข้มกว่าสีป้ายเพราะเป็นแถบบาง ๆ */
export const STATUS_TONE: Record<OrderStatus, string> = {
  รอชำระเงิน: "var(--dk-yolk-deep)",
  รอตรวจสอบ: "var(--dk-coral-deep)",
  ชำระแล้ว: "var(--dk-mint)",
  รอตรวจแบบ: "var(--dk-lilac)",
  แก้ไขแบบ: "var(--dk-coral-deep)",
  อนุมัติแบบ: "var(--dk-mint)",
  กำลังผลิต: "var(--dk-blue)",
  จัดส่งแล้ว: "var(--dk-quiet)",
  เสร็จสิ้น: "var(--dk-quiet)",
  ยกเลิก: "var(--dk-quiet)",
};

export function chipStyle(s: OrderStatus) {
  const t = CHIP[s] ?? CHIP["เสร็จสิ้น"];
  return { color: t.fg, background: t.bg };
}

export default function StatusChip({ s }: { s: OrderStatus }) {
  return (
    <span className="dkb-chip" data-done={CLOSED.includes(s) ? "1" : undefined} style={chipStyle(s)}>
      <i />
      {s}
    </span>
  );
}

"use client";

/**
 * 📦 แถบ "ห้อย" ใต้รายการในตะกร้า — ค่ากล่อง/ค่าแพ็คที่ระบบบวกให้เองตามชนิดงาน
 * (สไตล์เดียวกับร้านค้าออนไลน์ที่ห้อยของแถม/ของบวกเพิ่มไว้ใต้สินค้าตัวนั้น)
 *
 * ค่ากล่องคิด "ครั้งเดียวต่อออเดอร์" — ป้ายราคาแขวนที่รายการแรกที่เข้าเงื่อนไข (lines)
 * รายการอื่นที่เข้าเงื่อนไขเหมือนกันได้ป้ายเบา ๆ ว่าใช้กล่องเดียวกัน ไม่คิดเพิ่ม (included)
 * ตัวเลขทั้งหมดคิดที่ @/lib/box-fee — ที่นี่แค่แสดงผล
 */
import { formatPrice } from "@/lib/products";
import type { BoxFee, OrderBoxFee } from "@/lib/box-fee";

export default function BoxFeeTag({
  lines = [],
  included = [],
  className = "",
}: {
  /** กติกาที่แขวนป้ายราคาไว้กับรายการนี้ (รายการแรกที่เข้าเงื่อนไข) */
  lines?: OrderBoxFee[];
  /** กติกาที่รายการนี้เข้าเงื่อนไขด้วย แต่คิดเงินไปแล้วที่รายการอื่น */
  included?: BoxFee[];
  className?: string;
}) {
  if (lines.length === 0 && included.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {lines.map((l) => (
        <div key={l.fee.id} className="cart-hang">
          <span className="cart-hang-i" aria-hidden>
            📦
          </span>
          <span className="min-w-0 flex-1">
            <b>
              {l.fee.name}
              {l.boxes > 1 && <span className="cart-hang-x"> ×{l.boxes}</span>}
              <span className="cart-hang-x"> (ครั้งเดียวต่อออเดอร์)</span>
            </b>
            {l.fee.note && <small>{l.fee.note}</small>}
          </span>
          <span className="cart-hang-plus">+{formatPrice(l.amount)}</span>
        </div>
      ))}
      {included.map((f) => (
        <div key={f.id} className="cart-hang muted">
          <span className="cart-hang-i" aria-hidden>
            📦
          </span>
          <span className="min-w-0 flex-1">
            <b>{f.name} — ใช้กล่องเดียวกับรายการอื่น</b>
          </span>
          <span className="cart-hang-plus free">ไม่คิดเพิ่ม</span>
        </div>
      ))}
    </div>
  );
}

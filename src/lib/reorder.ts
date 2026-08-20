"use client";

/**
 * สั่งซ้ำจากออเดอร์เดิม — ดึงรายการเดิมเข้าตะกร้า (ใช้ตัวเลือกเดิมถ้ามี) แล้วพาไปหน้าตะกร้า
 * ใช้ร่วมกันระหว่างหน้า "ประวัติการสั่งซื้อ" กับ "ไฟล์งานของฉัน"
 */
import { useRouter } from "next/navigation";
import { useCart } from "./cart-context";
import type { Order } from "./admin-data";

export function useReorder(onFail: (msg: string) => void) {
  const router = useRouter();
  const { addItem, productOf } = useCart();

  /** สินค้าในออเดอร์ยังมีขายอยู่อย่างน้อย 1 รายการไหม (ไว้ซ่อน/โชว์ปุ่มสั่งซ้ำ) */
  const canReorder = (o: Order) => o.items.some((it) => productOf(it.productId));

  function reorder(o: Order) {
    let added = 0;
    for (const it of o.items) {
      if (!productOf(it.productId)) continue; // สินค้าถูกลบไปแล้ว → ข้าม
      addItem(it.productId, it.sel ?? {}, it.qty);
      added++;
    }
    if (added === 0) return onFail("สินค้าในออเดอร์นี้ไม่มีขายแล้ว สั่งซ้ำไม่ได้");
    router.push("/cart");
  }

  return { reorder, canReorder };
}

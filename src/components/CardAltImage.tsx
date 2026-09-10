"use client";

import { useState } from "react";
import { fallbackToOriginal, imgProps } from "@/lib/img";

/* eslint-disable @next/next/no-img-element */

/**
 * รูปพรีวิวที่สองบนการ์ดสินค้า (ต้นแบบ data-alt บน <a class="card">)
 *  - ซ้อนทับรูปแรกใน .thumb แล้วครอสเฟดตอนชี้การ์ด (CSS .thumb .alt-img / .card:hover .thumb .alt-img)
 *  - โหลดแบบขี้เกียจ: สร้าง <img> ต่อเมื่อเมาส์เข้าการ์ด/โฟกัส/แตะครั้งแรก ไม่ถ่วงตอนเปิดหน้า
 *  - จุด 2 จุดใต้รูป (.thumb-dots) บอกว่ามีมากกว่าหนึ่งรูป — จอสัมผัสโชว์ค้างไว้ (CSS @media(hover:none))
 * ใช้: const alt = useAltImage(p.altSrc) → กาง {...alt.hoverProps} บนการ์ด และวาง {alt.nodes} ท้าย .thumb
 */
export function useAltImage(src: string | undefined, sizes = "(max-width: 768px) 45vw, 260px") {
  const [wanted, setWanted] = useState(false);
  const want = () => setWanted(true);
  const hoverProps: Pick<React.DOMAttributes<HTMLElement>, "onMouseEnter" | "onFocus" | "onTouchStart"> = src
    ? { onMouseEnter: want, onFocus: want, onTouchStart: want }
    : {};
  const nodes = src ? (
    <>
      {wanted && <img className="alt-img" {...imgProps(src, sizes)} alt="" decoding="async" onError={fallbackToOriginal(src)} />}
      <div className="thumb-dots" aria-hidden="true">
        <i />
        <i />
      </div>
    </>
  ) : null;
  return { hoverProps, nodes };
}

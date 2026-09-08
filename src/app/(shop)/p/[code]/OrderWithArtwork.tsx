"use client";

import { useState } from "react";
import { PRICE_LINK_ADD_PARAM, PRICE_LINK_PARAM, encodePriceLink, type PriceLinkSpec } from "@/lib/price-link";
import ArtDrop, { type Art } from "./ArtDrop";

/**
 * 🛒 ใบราคารายการเดียว — วางไฟล์ลายได้ตั้งแต่บนการ์ด แล้วกด "สั่งตามสเปคนี้" ทีเดียวจบ
 *
 * ⚠️ ปุ่มสั่งต้องอยู่ในคอมโพเนนต์นี้ด้วย เพราะ href ต้องคิดใหม่ทุกครั้งที่แนบ/ลบรูป
 */
export default function OrderWithArtwork({
  productPath,
  spec,
  artRequired = false,
  children,
}: {
  productPath: string;
  spec: PriceLinkSpec;
  /** สินค้าที่ต้องมีไฟล์ลายก่อนผลิต — บอกให้ชัดแต่ไม่ล็อกปุ่ม (ดูเหตุผลใน ArtDrop) */
  artRequired?: boolean;
  /** คำอธิบายใต้ปุ่ม (วันยืนราคา) — เรนเดอร์มาจากฝั่งเซิร์ฟเวอร์ */
  children?: React.ReactNode;
}) {
  const [arts, setArts] = useState<Art[]>([]);

  // ?add=1 = หน้าสินค้าติ๊กสเปคเสร็จแล้วหย่อนลงตะกร้าให้เลย แล้วพาไปหน้าตะกร้า (ลูกค้ากดปุ่มเดียวจบ)
  const href = `${productPath}?${PRICE_LINK_PARAM}=${encodePriceLink(
    arts.length ? { ...spec, a: arts.map((a) => a.url) } : spec
  )}&${PRICE_LINK_ADD_PARAM}=1`;
  /** งานต้องมีลายแต่ยังไม่ได้วาง — สั่งได้ แต่ต้องบอกชัดว่าจะส่งลายทีหลังทางไลน์ */
  const artLater = artRequired && arts.length === 0;

  return (
    <>
      <ArtDrop arts={arts} setArts={setArts} artRequired={artRequired}>
        {/* ใบราคาแช่ราคาไว้ตามจำนวนลายที่ตกลงกัน — แนบมากกว่านั้นราคาจะขยับตามจริงในหน้าถัดไป */}
        {spec.d != null && arts.length > spec.d && (
          <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-amber-700">
            หมายเหตุ: ใบนี้ตีราคาไว้ที่ {spec.d} ลาย — แนบมา {arts.length} ลาย ราคาจะคิดตามจำนวนลายจริงในหน้าถัดไป
          </p>
        )}
      </ArtDrop>

      <a
        href={href}
        className="block w-full rounded-full bg-amber-500 py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition hover:bg-amber-600"
      >
        🛒 สั่งตามสเปคนี้
        {arts.length > 0 ? ` (แนบลาย ${arts.length} รูป)` : artLater ? " (ส่งลายทีหลัง)" : ""}
      </a>
      {artLater && (
        /* บอกก่อนกด ไม่ใช่หลังกด — ลูกค้าจะได้รู้ว่าออเดอร์เข้าตะกร้าแบบ "รอลาย" แล้วต้องส่งลายทางไลน์ต่อ */
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-amber-700 ring-1 ring-amber-200">
          ยังไม่ได้วางลาย — สั่งได้เลย แล้วส่งไฟล์ลายให้ร้านทางไลน์ทีหลัง ทางร้านจะเริ่มทำแบบเมื่อได้ลายครับ
        </p>
      )}
      {children}
    </>
  );
}

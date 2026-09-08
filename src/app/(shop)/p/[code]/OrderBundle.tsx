"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import {
  PRICE_LINK_ADD_PARAM,
  PRICE_LINK_PARAM,
  encodePriceLink,
  startPriceLinkBundle,
} from "@/lib/price-link";
import type { PriceLinkItem } from "@/lib/price-links";
import ArtDrop, { type Art } from "./ArtDrop";

/**
 * 🧾 ใบราคาหลายรายการ — ลูกค้าเห็นทุกรายการในใบเดียว แล้วกดสั่งครั้งเดียวได้ทั้งใบ
 *
 * กดแล้วระบบพาเดินหน้าสินค้าทีละตัวเองอัตโนมัติ (ติ๊กสเปค → ลงตะกร้า → ตัวถัดไป) จบที่หน้าตะกร้า
 * ทำแบบนี้เพราะสูตรราคา/ด่านตรวจ/การรวมบรรทัดอยู่ที่หน้าสินค้าที่เดียว — ดูคิวใน lib/price-link.ts
 *
 * ⚠️ ปุ่มต้องอยู่ในคอมโพเนนต์นี้ เพราะลิงก์ของทุกรายการต้องคิดใหม่ทุกครั้งที่แนบ/ลบรูป
 */

export type BundleItem = PriceLinkItem & { artRequired?: boolean };

export default function OrderBundle({
  code,
  items,
  closedNote,
  children,
}: {
  code: string;
  items: BundleItem[];
  /**
   * ใบที่ปิด/หมดอายุแล้ว — โชว์รายการให้ลูกค้าอ่านได้เหมือนเดิม แต่ไม่มีกล่องแนบลาย/ปุ่มสั่ง
   * (เอาข้อความนี้ไปไว้ตรงที่ปุ่มอยู่ ลูกค้าจะได้รู้ว่าต้องทักร้านขอราคาใหม่)
   */
  closedNote?: React.ReactNode;
  /** คำอธิบายใต้ปุ่ม (วันยืนราคา) — เรนเดอร์มาจากฝั่งเซิร์ฟเวอร์ */
  children?: React.ReactNode;
}) {
  /** ลายที่แนบไว้ของแต่ละรายการ (คีย์ = ลำดับรายการ) */
  const [arts, setArts] = useState<Record<number, Art[]>>({});

  /** ลิงก์หน้าสินค้าของรายการนี้ พร้อมสเปค+ลายที่เพิ่งแนบ (?add=1 = ลงตะกร้าให้เอง) */
  const stopUrl = (it: BundleItem, i: number) => {
    const mine = arts[i] ?? [];
    const spec = mine.length ? { ...it.spec, a: mine.map((a) => a.url) } : it.spec;
    return `${it.productPath}?${PRICE_LINK_PARAM}=${encodePriceLink(spec)}&${PRICE_LINK_ADD_PARAM}=1`;
  };

  const urls = items.map(stopUrl);
  const artCount = Object.values(arts).reduce((s, a) => s + a.length, 0);
  /** รายการที่ต้องมีลายแต่ยังไม่ได้วาง — สั่งได้ แต่ต้องบอกชัดว่าจะส่งลายทีหลัง */
  const artLater = items.some((it, i) => it.artRequired && !(arts[i]?.length ?? 0));
  const total = items.reduce((s, it) => s + (it.askPrice ? 0 : it.total), 0);
  const askSome = items.some((it) => it.askPrice);

  return (
    <>
      {/* ── รายการในใบ ── */}
      <div className="divide-y divide-stone-100 border-t border-stone-100">
        {items.map((it, i) => (
          <div key={`${it.productId}-${i}`} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-[11px] font-extrabold text-stone-500">
                {i + 1}
              </span>
              {it.imageSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageSrc}
                  alt={it.productName}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-stone-200"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold leading-snug text-stone-900">{it.productName}</p>
                <dl className="mt-1 space-y-0.5">
                  {it.lines.map(([k, v], j) => (
                    <div key={j} className="flex flex-wrap gap-x-2 text-[12px] leading-relaxed">
                      <dt className="font-bold text-stone-600">{k}:</dt>
                      <dd className="min-w-0 flex-1 text-stone-500">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] text-stone-500">
                  <span>
                    {it.qty.toLocaleString("th-TH")} {it.unit}
                    {!it.askPrice && ` × ${formatPrice(it.unitPrice)}`}
                  </span>
                  <span className="font-extrabold text-stone-700">
                    {it.askPrice ? "รอร้านตีราคา" : formatPrice(it.total)}
                  </span>
                </p>
              </div>
            </div>

            {!closedNote && (
              <div className="mt-2.5">
                <ArtDrop
                  compact
                  artRequired={!!it.artRequired}
                  arts={arts[i] ?? []}
                  setArts={(update) =>
                    setArts((cur) => {
                      const mine = cur[i] ?? [];
                      return { ...cur, [i]: typeof update === "function" ? update(mine) : update };
                    })
                  }
                >
                  {/* ใบราคาแช่ราคาไว้ตามจำนวนลายที่ตกลงกัน — แนบมากกว่านั้นราคาจะขยับตามจริงในหน้าถัดไป */}
                  {it.spec.d != null && (arts[i]?.length ?? 0) > it.spec.d && (
                    <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-amber-700">
                      หมายเหตุ: รายการนี้ตีราคาไว้ที่ {it.spec.d} ลาย — แนบมา {arts[i]?.length} ลาย
                      ราคาจะคิดตามจำนวนลายจริงในหน้าถัดไป
                    </p>
                  )}
                </ArtDrop>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── ยอดรวมทั้งใบ ── */}
      <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4">
        <div className="flex items-end justify-between">
          <span className="text-sm font-bold text-stone-700">ยอดรวม {items.length} รายการ</span>
          <span className="text-3xl font-extrabold text-amber-600">{formatPrice(total)}</span>
        </div>
        <p className="mt-1 text-right text-[11px] text-stone-400">
          ยังไม่รวมค่าจัดส่ง{askSome ? " · ยังไม่รวมรายการที่รอร้านตีราคา" : ""}
        </p>
      </div>

      {/* ── ปุ่มสั่งทั้งใบ ── */}
      <div className="border-t border-stone-100 px-5 py-5">
        {closedNote ?? (
          <>
            <a
              href={urls[0]}
              onClick={() => startPriceLinkBundle(code, urls)}
              className="block w-full rounded-full bg-amber-500 py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition hover:bg-amber-600"
            >
              🛒 สั่งทั้งหมด {items.length} รายการ
              {artCount > 0 ? ` (แนบลาย ${artCount} รูป)` : ""}
            </a>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-stone-400">
              ระบบจะเปิดหน้าสินค้าให้ทีละรายการแล้วใส่ตะกร้าให้เอง — รอสักครู่จนถึงหน้าตะกร้า ไม่ต้องกดอะไรเพิ่ม
            </p>
            {artLater && (
              /* บอกก่อนกด ไม่ใช่หลังกด — ลูกค้าจะได้รู้ว่างานเข้าตะกร้าแบบ "รอลาย" แล้วต้องส่งลายทางไลน์ต่อ */
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-amber-700 ring-1 ring-amber-200">
                มีรายการที่ยังไม่ได้วางลาย — สั่งได้เลย แล้วส่งไฟล์ลายให้ร้านทางไลน์ทีหลัง ทางร้านจะเริ่มทำแบบเมื่อได้ลายครับ
              </p>
            )}
            {children}
          </>
        )}
      </div>
    </>
  );
}

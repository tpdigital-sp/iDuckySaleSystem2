"use client";

import { useEffect, useState } from "react";
import { fetchShopPayment, giftPromosOf } from "@/lib/shop-settings";
import { activeGiftPromos, giftMatches, giftsFor, type GiftPromo } from "@/lib/gifts";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/lib/products";

/**
 * 🎁 ป้ายโปรของแถมบนหน้าสินค้า (โชว์เฉพาะสินค้าที่ร่วมรายการ)
 *
 * - ยังไม่มีของในตะกร้า → "สั่งครบ N ชิ้น รับ…ฟรี" + ปุ่มดูรายละเอียด (เปิด popover)
 * - มีของที่ร่วมโปรในตะกร้าแล้ว → โชว์ความคืบหน้า "ตอนนี้มี X / N ชิ้น เพิ่มอีก Y ชิ้น"
 *   (ตัวเลขอัปเดตเองทันทีหลังกดเพิ่มลงตะกร้า — ทำหน้าที่เป็น mini notification ไปในตัว)
 *
 * ดึงโปรจากตั้งค่าร้านเอง (fetchShopPayment มีแคช/รวมคำขอ ไม่ยิงซ้ำ) — ไม่ต้องส่ง props อะไรเพิ่ม
 */
export default function GiftPromoBadge({ product, className = "" }: { product: Product; className?: string }) {
  const { items, productOf } = useCart();
  const [promos, setPromos] = useState<GiftPromo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchShopPayment().then((p) => setPromos(activeGiftPromos(giftPromosOf(p))));
  }, []);

  // เฉพาะโปรที่สินค้าตัวนี้ร่วมรายการ
  const mine = promos.filter((g) => giftMatches(g, product.id, product.category));
  if (mine.length === 0) return null;

  // ความคืบหน้าจากของในตะกร้าตอนนี้ (รวมทุกสินค้าที่ร่วมโปร ไม่ใช่แค่ตัวนี้)
  const rows = giftsFor(
    items.map((i) => ({ productId: i.productId, qty: i.qty })),
    (id) => (id === product.id ? product.category : productOf(id)?.category),
    mine
  );

  return (
    <div className={className}>
      {rows.map((r) => {
        const target = r.nextAt ?? r.promo.minQty;
        return (
          <div
            key={r.promo.id}
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold leading-relaxed text-emerald-900 ring-1 ring-emerald-200"
          >
            <span>
              🎁 มีของแถม — สั่งสินค้าที่ร่วมรายการครบ {r.promo.minQty.toLocaleString("th-TH")} ชิ้น รับ{" "}
              <strong>{r.promo.name}</strong> ฟรี!
            </span>
            {r.qty > 0 &&
              (r.earned > 0 ? (
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  🎉 ปลดล็อกแล้ว ×{r.earned}
                </span>
              ) : (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-emerald-200">
                  ตอนนี้มี {r.qty.toLocaleString("th-TH")} / {target.toLocaleString("th-TH")} ชิ้น — เพิ่มอีก{" "}
                  {(r.need ?? 0).toLocaleString("th-TH")} ชิ้น
                </span>
              ))}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="font-bold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
            >
              ดูรายละเอียด
            </button>
          </div>
        );
      })}

      {/* Popover รายละเอียดโปร (กดพื้นหลัง/ปุ่มปิดเพื่อออก) */}
      {open && (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-slate-900/45 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-slate-900">🎁 โปรโมชั่นของแถมฟรี</p>
            <div className="mt-3 space-y-3">
              {mine.map((g) => (
                <div key={g.id} className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  {g.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- รูปของแถมจากคลังรูปร้าน
                    <img src={g.image} alt="" className="h-14 w-14 shrink-0 rounded-xl border-2 border-white object-cover shadow-sm" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white text-3xl">🎁</span>
                  )}
                  <div className="min-w-0 text-[13px] leading-relaxed text-emerald-900">
                    <p className="font-bold">{g.name}</p>
                    {g.note && <p className="text-[12px] opacity-80">{g.note}</p>}
                    <p className="mt-1">
                      สั่งสินค้าที่ร่วมรายการครบ <strong>{g.minQty.toLocaleString("th-TH")} ชิ้น</strong> รับฟรี{" "}
                      {Math.max(1, Math.floor(g.giveQty ?? 1)).toLocaleString("th-TH")} ชุด
                      {(g.value ?? 0) > 0 && (
                        <>
                          {" "}
                          (<s className="opacity-60">{formatPrice(g.value!)}</s> <strong>ฟรี</strong>)
                        </>
                      )}
                    </p>
                    <p className="text-[12px] opacity-80">
                      นับรวมทุกสินค้าที่ร่วมรายการในตะกร้า · ทุก ๆ{" "}
                      {Math.max(1, Math.floor(g.step || g.minQty)).toLocaleString("th-TH")} ชิ้นถัดไปได้เพิ่มอีก
                      {(g.maxQty ?? 0) > 0 && <> · สูงสุด {g.maxQty!.toLocaleString("th-TH")} ชุด/ออเดอร์</>}
                      {g.to && <> · ถึง {g.to}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-full bg-amber-400 py-2.5 text-sm font-bold text-white transition hover:bg-amber-500"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

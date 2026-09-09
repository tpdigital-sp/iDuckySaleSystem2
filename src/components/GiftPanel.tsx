"use client";

import { formatPrice } from "@/lib/products";
import { giftUnlock, resolveGiftSize, type GiftResult } from "@/lib/gifts";

/**
 * 🎁 การ์ดโปรของแถมฟรีในตะกร้า/หน้าชำระเงิน (UX แบบร้านค้าออนไลน์)
 *
 * 3 สถานะต่อโปร:
 *  1. ยังไม่ถึงขั้นต่ำ  → แถบเหลือง "35 / 50 ชิ้น" + หลอดความคืบหน้า
 *  2. ใกล้ถึง (เหลือ ≤20% ของเป้า) → 🔥 เร่งให้เห็นชัด "อีกแค่ 5 ชิ้น!"
 *  3. ปลดล็อกแล้ว → การ์ดเขียว 🎉 + "ระบบเพิ่มของแถมให้คุณอัตโนมัติแล้ว"
 *
 * ตัวเลข/หลอดคำนวณสดจาก state ตะกร้าทุกครั้งที่จำนวนเปลี่ยน — ไม่ต้องรีเฟรชหน้า
 * ⚠️ โชว์เฉพาะโปรที่ลูกค้ามีของเข้าเงื่อนไขอยู่แล้ว (qty > 0) — ไม่งั้นตะกร้ารกด้วยโปรที่ไม่เกี่ยว
 *
 * 🔓 "ปลดล็อก" ตัดสินด้วย giftUnlock (ได้ของจริงอย่างน้อย 1 ชิ้นหลังคิดกติกาแผ่น A3) ไม่ใช่ earned > 0
 *    — โปรรองหลัง 1 ชิ้น = 1 ใบ เคยขึ้น "🎉 ปลดล็อกแล้ว ×0 + ซองใส ×1" ตั้งแต่ชิ้นแรก (9 ก.ย. 69)
 *    ตอนนี้ยังไม่ถึงแผ่นแรกจะขึ้นแถบ "สั่งครบ 24 ชิ้น ปลดล็อก…" พร้อมหลอดแทน
 */
export default function GiftPanel({
  rows,
  sizes,
  className = "",
}: {
  rows: GiftResult[];
  /** ขนาดของแถมที่ลูกค้าเลือกไว้ ({ promoId: "9 × 9 cm" }) — ใช้บอกว่าเศษได้ของแทนกี่ชิ้น */
  sizes?: Record<string, string>;
  className?: string;
}) {
  const show = rows.filter((r) => r.earned > 0 || r.qty > 0);
  if (show.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {show.map((r) => {
        const per = Math.max(1, Math.floor(r.promo.giveQty ?? 1));
        const size = resolveGiftSize(r.promo, sizes?.[r.promo.id]);
        const u = giftUnlock(r, size);
        const sp = u.split;
        // เป้าที่โชว์: ยังไม่ปลดล็อก = จุดปลดล็อก (แผ่นแรก) · ปลดล็อกแล้ว = ขั้นถัดไปของโปร
        const target = u.unlocked ? (r.nextAt ?? r.promo.minQty) : u.unlockAt;
        const need = u.unlocked ? r.need : u.need;
        const progress = u.unlocked ? r.progress : u.progress;
        const pct = Math.round(progress * 100);
        // 🔥 ใกล้ปลดล็อก: เหลือ ≤20% ของเป้า → เร่งให้เด่นขึ้น
        const urgent = !u.unlocked && u.need > 0 && u.progress >= 0.8;
        // ป้ายขนาดที่ใช้คิด (มีเฉพาะโปรที่มีกติกาแผ่น) เช่น "7 × 7 cm · 24 ใบ/แผ่น A3"
        const sizeHint = size && sp.threshold > 0 ? `${size.label}${(size.perSheet ?? 0) > 0 ? ` · ${size.perSheet} ใบ/แผ่น A3` : ""}` : "";

        const img = (extra: string) =>
          r.promo.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- รูปของแถมมาจากคลังรูปร้าน (URL อิสระ)
            <img src={r.promo.image} alt="" className={`h-12 w-12 shrink-0 rounded-xl border-2 border-white object-cover shadow-sm ${extra}`} />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/70 text-2xl">🎁</span>
          );

        /* ── สถานะ 3: ปลดล็อกแล้ว (ได้ของจริงอย่างน้อย 1 ชิ้น) ── */
        if (u.unlocked) {
          return (
            <div key={r.promo.id} className="ord-note ok flex items-start gap-3 px-4 py-3 text-xs leading-relaxed">
              {img("")}
              <span className="min-w-0 flex-1">
                <strong className="block text-[.86rem]">
                  🎉 ปลดล็อกของแถมแล้ว — {r.promo.name}
                  {size ? ` (${size.label})` : ""} ×{sp.fallback > 0 ? sp.printed : r.earned}
                </strong>
                {sp.fallback > 0 && (
                  <span className="block">🧾 + {sp.fallbackName} ×{sp.fallback} (เศษไม่ถึงเกณฑ์แผ่น A3)</span>
                )}
                {r.promo.note && <span className="block opacity-80">{r.promo.note}</span>}
                <span className="mt-0.5 block">
                  {(r.promo.value ?? 0) > 0 && (
                    <s className="mr-1 opacity-60">{formatPrice((r.promo.value ?? 0) * sp.printed)}</s>
                  )}
                  <strong>ฟรี ฿0</strong> · ระบบเพิ่มของแถมให้คุณอัตโนมัติแล้ว ✓
                </span>
                {/* มีกติกาแผ่น: ชวนสั่งเพิ่มให้เศษพิมพ์ครบ · ไม่มี: ชวนไปขั้นถัดไปของโปรเหมือนเดิม */}
                {sp.threshold > 0 ? (
                  u.moreForFull > 0 && (
                    <span className="mt-1 block font-semibold">
                      สั่งอีก {u.moreForFull.toLocaleString("th-TH")} ชิ้น ได้พิมพ์ลายครบทุกชิ้น! ({sp.fallback.toLocaleString("th-TH")} / {sp.threshold.toLocaleString("th-TH")} ใบ)
                      <span className="ord-bar block">
                        <i style={{ width: `${Math.round((sp.fallback / sp.threshold) * 100)}%` }} />
                      </span>
                    </span>
                  )
                ) : (
                  need != null && need > 0 && (
                    <span className="mt-1 block font-semibold">
                      สั่งอีก {need.toLocaleString("th-TH")} ชิ้น รับเพิ่มอีก {per} ชุด! ({r.qty.toLocaleString("th-TH")} / {target.toLocaleString("th-TH")} ชิ้น)
                      <span className="ord-bar block">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  )
                )}
              </span>
            </div>
          );
        }

        /* ── สถานะ 2: ใกล้ถึงขั้นต่ำ (🔥 เร่ง) ── */
        if (urgent) {
          return (
            <div
              key={r.promo.id}
              className="ord-note warn flex items-start gap-3 px-4 py-3 text-xs leading-relaxed"
              style={{ borderWidth: 2, borderColor: "rgba(255,140,20,.75)", background: "#FFF0DB" }}
            >
              {img("")}
              <span className="min-w-0 flex-1">
                <strong className="block text-[.92rem]">🔥 อีกแค่ {u.need.toLocaleString("th-TH")} ชิ้น!</strong>
                สั่งครบ {target.toLocaleString("th-TH")} ชิ้น รับ <strong>{r.promo.name}</strong>
                {sizeHint ? ` (${sizeHint})` : ""} ฟรี 🎁
                {(r.promo.value ?? 0) > 0 && sp.threshold === 0 && <> (มูลค่า {formatPrice(r.promo.value!)})</>}
                <span className="mt-0.5 block font-semibold">
                  ตอนนี้คุณมี {r.qty.toLocaleString("th-TH")} / {target.toLocaleString("th-TH")} ชิ้น ({pct}%)
                </span>
                <span className="ord-bar block">
                  <i style={{ width: `${pct}%` }} />
                </span>
              </span>
            </div>
          );
        }

        /* ── สถานะ 1: ยังไม่ถึงขั้นต่ำ ── */
        return (
          <div key={r.promo.id} className="ord-note warn flex items-start gap-3 px-4 py-3 text-xs leading-relaxed">
            {img("opacity-70")}
            <span className="min-w-0 flex-1">
              <strong className="block text-[.86rem]">🎁 สั่งครบ {target.toLocaleString("th-TH")} ชิ้น ปลดล็อก{r.promo.name}ฟรี</strong>
              สั่งสินค้าที่ร่วมรายการครบ {target.toLocaleString("th-TH")} ชิ้น รับ <strong>{r.promo.name}</strong>
              {sizeHint ? ` (${sizeHint})` : ""}
              {(r.promo.value ?? 0) > 0 && sp.threshold === 0 ? (
                <>
                  {" "}
                  <s className="opacity-60">{formatPrice(r.promo.value!)}</s> <strong>ฟรี!</strong>
                </>
              ) : (
                <strong> ฟรี!</strong>
              )}
              {r.promo.note && <span className="block opacity-80">{r.promo.note}</span>}
              <span className="mt-0.5 block font-semibold">
                ตอนนี้คุณมี {r.qty.toLocaleString("th-TH")} / {target.toLocaleString("th-TH")} ชิ้น ({pct}%)
              </span>
              <span className="ord-bar block">
                <i style={{ width: `${pct}%` }} />
              </span>
              <span className="mt-0.5 block">เพิ่มอีก {u.need.toLocaleString("th-TH")} ชิ้น รับของแถมฟรี!</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

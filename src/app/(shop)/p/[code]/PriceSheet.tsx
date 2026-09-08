"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import {
  PRICE_LINK_ADD_PARAM,
  PRICE_LINK_PARAM,
  encodePriceLink,
  startPriceLinkBundle,
} from "@/lib/price-link";
import { priceLinkPiecesText, type PriceLinkItem } from "@/lib/price-links";
import { LINE_URL } from "@/components/LineButton";
import ArtDrop, { type Art } from "./ArtDrop";

/**
 * 🧾 เนื้อในใบราคา — รายการทางซ้าย + สรุปยอด/ปุ่มสั่งทางขวา (มือถือเรียงลงมา)
 *
 * ใบรายการเดียวและใบหลายรายการใช้ตัวเดียวกัน (ต่างกันแค่ตอนกดสั่ง):
 *   · 1 รายการ → เปิดหน้าสินค้าพร้อมสเปค + &add=1 หย่อนลงตะกร้าให้เอง แล้วพาไปหน้าตะกร้า
 *   · หลายรายการ → ตั้งคิวใน sessionStorage (startPriceLinkBundle) ระบบพาเดินหน้าสินค้าทีละตัวจนถึงตะกร้า
 * ทำแบบนี้เพราะสูตรราคา/ด่านตรวจ/การรวมบรรทัดอยู่ที่หน้าสินค้าที่เดียว — ดูคิวใน lib/price-link.ts
 *
 * ⚠️ ปุ่มสั่งกับกล่องแนบลายต้องอยู่คอมโพเนนต์เดียวกัน เพราะลิงก์ของทุกรายการต้องคิดใหม่ทุกครั้งที่แนบ/ลบรูป
 */

export type SheetItem = PriceLinkItem & { artRequired?: boolean };

export default function PriceSheet({
  code,
  items,
  open,
  note,
  closedNote,
  holdNote,
}: {
  code: string;
  items: SheetItem[];
  /** ใบยังใช้ได้ (ไม่ปิด/ไม่หมดอายุ) — ถึงจะมีกล่องแนบลาย + ปุ่มสั่ง */
  open: boolean;
  /** ข้อความจากแอดมินถึงลูกค้า */
  note?: string;
  /** ใบที่ปิด/หมดอายุ — ขึ้นแทนที่ปุ่มสั่ง (เรนเดอร์จากฝั่งเซิร์ฟเวอร์) */
  closedNote: React.ReactNode;
  /** ยืนราคาถึงเมื่อไร — ใต้ปุ่มสั่ง (เรนเดอร์จากฝั่งเซิร์ฟเวอร์) */
  holdNote: React.ReactNode;
}) {
  /** ลายที่แนบไว้ของแต่ละรายการ (คีย์ = ลำดับรายการ) */
  const [arts, setArts] = useState<Record<number, Art[]>>({});
  const bundle = items.length > 1;

  /** ลิงก์หน้าสินค้าของรายการนี้ พร้อมสเปค+ลายที่เพิ่งแนบ (?add=1 = ลงตะกร้าให้เอง) */
  const urls = items.map((it, i) => {
    const mine = arts[i] ?? [];
    const spec = mine.length ? { ...it.spec, a: mine.map((a) => a.url) } : it.spec;
    return `${it.productPath}?${PRICE_LINK_PARAM}=${encodePriceLink(spec)}&${PRICE_LINK_ADD_PARAM}=1`;
  });
  const artCount = Object.values(arts).reduce((s, a) => s + a.length, 0);
  /** รายการที่ต้องมีลายแต่ยังไม่ได้วาง — สั่งได้ แต่ต้องบอกชัดว่าจะส่งลายทีหลัง */
  const artLater = items.some((it, i) => it.artRequired && !(arts[i]?.length ?? 0));
  const total = items.reduce((s, it) => s + (it.askPrice ? 0 : it.total), 0);
  const askSome = items.some((it) => it.askPrice);
  const askAll = items.every((it) => it.askPrice);

  const buttonLabel = bundle
    ? `🛒 สั่งทั้งหมด ${items.length} รายการ${artCount > 0 ? ` (แนบลาย ${artCount} รูป)` : ""}`
    : `🛒 สั่งตามสเปคนี้${artCount > 0 ? ` (แนบลาย ${artCount} รูป)` : artLater ? " (ส่งลายทีหลัง)" : ""}`;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── ซ้าย: ข้อความจากร้าน + รายการทีละใบ ── */}
      <section className="space-y-4">
        {note && (
          <div className="ord-note info px-4 py-3">
            <span className="ord-eyebrow block" style={{ color: "inherit" }}>
              💬 ข้อความจากทางร้าน
            </span>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{note}</p>
          </div>
        )}

        {items.map((it, i) => {
          const mine = arts[i] ?? [];
          return (
            <article key={`${it.productId}-${i}`} className="ord-card p-4 sm:p-5">
              <div className="flex gap-4">
                <div className="relative flex-none">
                  {it.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.imageSrc}
                      alt={it.productName}
                      className="h-[76px] w-[76px] rounded-2xl border border-sky-100 bg-white object-cover sm:h-24 sm:w-24"
                    />
                  ) : (
                    <div
                      className="h-[76px] w-[76px] rounded-2xl border border-sky-100 bg-sky-50 text-3xl sm:h-24 sm:w-24"
                      style={{ display: "grid", placeItems: "center" }}
                    >
                      🐥
                    </div>
                  )}
                  {bundle && (
                    <span
                      className="absolute -left-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-[var(--navy)] px-1.5 text-[11px] text-white shadow"
                      style={{ fontFamily: "var(--display)" }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="cart-name">{it.productName}</h3>
                  {it.lines.length > 0 && (
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12.5px] leading-relaxed">
                      {it.lines.map(([k, v], j) => (
                        <div key={j} className="contents">
                          <dt className="t-soft whitespace-nowrap">{k}</dt>
                          <dd className="t-ink min-w-0 break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>

              {/* จำนวน × ราคา/หน่วย = ยอดรายการ */}
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-sky-100 pt-3">
                <span className="text-[12.5px] t-soft">
                  {it.qty.toLocaleString("th-TH")} {it.unit}
                  {!it.askPrice && (
                    <>
                      {" "}
                      × {formatPrice(it.unitPrice)}
                      <span className="t-faint">/{it.unit}</span>
                    </>
                  )}
                  {/* 📐 งานแบ่งแผ่น/เซ็ต — บอกด้วยว่าได้กี่ชิ้น (ประโยคเดียวกับตะกร้า) ไม่งั้น "25 แผ่น A3" ลูกค้าไม่รู้ว่าได้กี่ชิ้น */}
                  {it.pieces && (
                    <span className="block font-semibold t-blue">
                      {`📐 สั่ง ${it.qty.toLocaleString("th-TH")} ${it.unit}${it.pieces.size ? ` (${it.pieces.size})` : ""} ${priceLinkPiecesText(it.pieces)}`}
                    </span>
                  )}
                </span>
                {it.askPrice ? (
                  <span className="ord-chip yolk">รอร้านตีราคา</span>
                ) : (
                  <span className="cart-price">{formatPrice(it.total)}</span>
                )}
              </div>

              {open && (
                <div className="mt-3">
                  <ArtDrop
                    compact
                    artRequired={!!it.artRequired}
                    arts={mine}
                    setArts={(update) =>
                      setArts((cur) => {
                        const now = cur[i] ?? [];
                        return { ...cur, [i]: typeof update === "function" ? update(now) : update };
                      })
                    }
                  >
                    {/* ใบราคาแช่ราคาไว้ตามจำนวนลายที่ตกลงกัน — แนบมากกว่านั้นราคาจะขยับตามจริงในหน้าถัดไป */}
                    {it.spec.d != null && mine.length > it.spec.d && (
                      <p className="mt-1.5 text-[11px] font-semibold leading-relaxed t-warn">
                        หมายเหตุ: รายการนี้ตีราคาไว้ที่ {it.spec.d} ลาย — แนบมา {mine.length} ลาย
                        ราคาจะคิดตามจำนวนลายจริงในหน้าถัดไป
                      </p>
                    )}
                  </ArtDrop>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* ── ขวา: สรุปยอด + ปุ่มสั่ง (เกาะขอบบนตอนเลื่อนบนจอกว้าง) ── */}
      <aside className="ord-card cart-sum p-5 sm:p-6">
        <h2 className="ord-title text-lg">สรุปใบราคา</h2>

        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <li key={`${it.productId}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 flex-1 leading-snug">
                <span className="t-ink">
                  {bundle && <span className="t-faint">{i + 1}. </span>}
                  {it.productName}
                </span>
                <span className="block text-[11.5px] t-soft">
                  {it.qty.toLocaleString("th-TH")} {it.unit}
                  {it.pieces && ` · ${priceLinkPiecesText(it.pieces)}`}
                </span>
              </span>
              <span
                className={`whitespace-nowrap ${it.askPrice ? "text-[12px] t-warn" : "t-ink"}`}
                style={{ fontFamily: "var(--display)" }}
              >
                {it.askPrice ? "รอตีราคา" : formatPrice(it.total)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-sky-100 pt-4">
          {askAll ? (
            <p className="text-sm leading-relaxed t-ink">💬 งานนี้ทางร้านตีราคาให้อีกที — ทักไลน์ได้เลยครับ</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <span className="ord-title text-[15px]">ยอดรวม{bundle ? ` ${items.length} รายการ` : ""}</span>
                <span className="ord-title text-[2rem] leading-none t-blue">{formatPrice(total)}</span>
              </div>
              <p className="mt-1.5 text-right text-[11px] t-faint">
                ยังไม่รวมค่าจัดส่ง{askSome ? " · ยังไม่รวมรายการที่รอร้านตีราคา" : ""}
              </p>
            </>
          )}
        </div>

        <div className="mt-5">
          {open ? (
            <>
              <a
                href={urls[0]}
                onClick={bundle ? () => startPriceLinkBundle(code, urls) : undefined}
                className="ord-btn yolk block lg"
              >
                {buttonLabel}
              </a>
              {artLater && (
                /* บอกก่อนกด ไม่ใช่หลังกด — ลูกค้าจะได้รู้ว่าออเดอร์เข้าตะกร้าแบบ "รอลาย" แล้วต้องส่งลายทางไลน์ต่อ */
                <p className="ord-note warn mt-3 px-3 py-2 text-center text-[11.5px] font-semibold leading-relaxed">
                  {bundle ? "มีรายการที่ยังไม่ได้วางลาย" : "ยังไม่ได้วางลาย"} — สั่งได้เลย
                  แล้วส่งไฟล์ลายให้ร้านทางไลน์ทีหลัง ทางร้านจะเริ่มทำแบบเมื่อได้ลายครับ
                </p>
              )}
              {holdNote}
              {bundle && (
                <p className="mt-2 text-center text-[11px] leading-relaxed t-faint">
                  ระบบจะเปิดหน้าสินค้าให้ทีละรายการแล้วใส่ตะกร้าให้เอง — รอสักครู่จนถึงหน้าตะกร้า ไม่ต้องกดอะไรเพิ่ม
                </p>
              )}
            </>
          ) : (
            closedNote
          )}
        </div>

        <a href={LINE_URL} target="_blank" rel="noreferrer" className="ord-btn ghost block mt-3">
          💬 มีข้อสงสัย ทักแชทร้าน
        </a>
      </aside>
    </div>
  );
}

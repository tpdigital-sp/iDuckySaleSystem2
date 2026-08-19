"use client";

/**
 * 💬 แผงช่วยตีราคา — เปิดขึ้นมาตอนแอดมินกดตีราคาในหน้าออเดอร์
 *
 * งานสั่งทำ (กำหนดขนาดเอง / ช่องกรอก) เข้ามาที่ราคา ฿0 แอดมินต้องตีราคาเอง
 * เดิมต้องเปิดแท็บสินค้าไปส่องตารางราคา + อ่านเงื่อนไขเอง แล้วกลับมาพิมพ์
 * แผงนี้ยกทุกอย่างที่ต้องใช้มาไว้ข้างช่องกรอก และกดตัวเลขในตารางเติมลงช่องได้เลย
 *
 * ทุกตัวเลขในแผงนี้เป็น "ราคาอ้างอิงจากตารางของสินค้า" ไม่ใช่ราคาสุดท้าย —
 * งานสั่งทำต้องบวกค่าขนาด/ค่าสกรีนตามเงื่อนไขเอง คนตีราคาเป็นคนตัดสิน
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { specEntries } from "@/components/SpecLines";
import { fetchProductsByIds } from "@/lib/product-repo";
import {
  RATE_LABEL,
  activeMatrix,
  activeRate,
  formatPrice,
  isInputOption,
  priceMatrixKey,
  tierIndex,
  type PriceMatrix,
  type Product,
} from "@/lib/products";
import type { OrderItem } from "@/lib/admin-data";

/** ราคา/หน่วยในตาราง m ที่ช่วงจำนวน tier ตามตัวเลือกที่ลูกค้าเลือก (0 = ไม่มีราคาในช่องนั้น) */
function cellPrice(m: PriceMatrix, sel: Record<string, string>, tier: number): number {
  const cells = m.cells[priceMatrixKey(m, sel)];
  return cells?.[tier] ?? 0;
}

export default function QuotePanel({
  item,
  onPick,
  onNote,
  onDone,
}: {
  item: OrderItem;
  /** กดตัวเลขในแผง → เติมลงช่องราคา/หน่วย (ยังไม่บันทึก แอดมินกด Enter เอง) */
  onPick: (unitPrice: number) => void;
  /** บันทึก "ที่มาของราคา" (เรียกตอนออกจากช่อง) — ไม่ส่งมา = ไม่ให้แก้ */
  onNote?: (text: string) => void;
  /** กด "✓ บันทึก" — เก็บทั้งราคาที่พิมพ์ไว้และที่มาของราคาในครั้งเดียว แล้วปิดแผง */
  onDone?: (note: string) => void;
}) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [note, setNote] = useState(item.quoteNote ?? "");

  useEffect(() => {
    let alive = true;
    // งานพิเศษที่แอดมินพิมพ์เอง ไม่มีสินค้าในระบบให้อ้างตาราง
    if (!item.productId || item.productId === "special-item") {
      setProduct(null);
      return;
    }
    setProduct(undefined);
    void fetchProductsByIds([item.productId]).then((list) => {
      if (alive) setProduct(list[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [item.productId]);

  // ตัวเลือกที่ลูกค้าเลือกมา (ออเดอร์เก่าไม่มี sel — กางจากข้อความรวมให้)
  const sel: Record<string, string> = Object.fromEntries(specEntries(item.sel, item.selections, []));

  const box = "rounded-xl bg-white p-2.5 ring-1 ring-slate-200";
  const head = "text-[10px] font-bold uppercase tracking-wide text-slate-400";

  if (product === undefined) {
    return (
      <div className="mt-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="text-[11px] font-semibold text-slate-400">กำลังดึงตารางราคาของสินค้านี้…</p>
      </div>
    );
  }

  const rate = product ? activeRate(product, sel) : undefined;
  const matrix = product ? activeMatrix(product, sel) : undefined;
  const tier = matrix ? tierIndex(matrix, item.qty) : 0;
  const refPrice = matrix ? cellPrice(matrix, sel, tier) : 0;

  // ขนาด/ค่าที่ลูกค้าพิมพ์เข้ามาเอง (ช่องกรอก) — หัวใจของการตีราคา ต้องเด่นสุด
  const inputLabels = new Set((product?.options ?? []).filter(isInputOption).map((o) => o.label));
  const typed = Object.entries(sel).filter(([k]) => inputLabels.has(k));

  // ตัวเลือกเสริมที่มีราคาบวกต่อหน่วย — ไว้บวกเองตอนตีราคา (เช่น สกรีนฐาน +15 · เพิ่มขนาดเซนละ +10)
  const addOns = (product?.options ?? []).flatMap((o) =>
    o.choices.filter((c) => (c.extra ?? 0) > 0).map((c) => ({ group: o.label, name: c.name, extra: c.extra! }))
  );

  return (
    <div
      /* ช่องราคาเช็ค attribute นี้ตอน blur — โฟกัสย้ายมาในแผง = ยังตีราคาไม่เสร็จ อย่าปิดแผง */
      data-quote-panel=""
      className="mt-2 rounded-2xl bg-gradient-to-br from-amber-50 to-white p-3 ring-1 ring-amber-200"
      /**
       * กันโฟกัสหลุดจากช่องราคา — ช่องนั้นบันทึกตอน blur ถ้าคลิกในแผงนี้แล้วโฟกัสหลุด
       * มันจะเด้งบันทึก+ปิดแผงทั้งที่แอดมินยังเลือกราคาไม่เสร็จ (คลิกยังทำงานปกติ)
       * ช่องกรอกในแผง (ที่มาของราคา) หยุด event นี้ไว้เอง เพื่อให้คลิกโฟกัสได้
       */
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold text-amber-800">💬 ช่วยตีราคา · {item.name}</p>
        {product && (
          <span className="flex items-center gap-2 text-[10px] font-bold">
            <Link
              href={`/admin/products/${encodeURIComponent(product.id)}`}
              target="_blank"
              className="rounded-full bg-white px-2 py-0.5 text-slate-500 ring-1 ring-slate-200 transition hover:text-indigo-600"
            >
              ✏️ ตารางราคาเต็ม ↗
            </Link>
            <Link
              href={`/products/${encodeURIComponent(product.slug ?? product.id)}`}
              target="_blank"
              className="rounded-full bg-white px-2 py-0.5 text-slate-500 ring-1 ring-slate-200 transition hover:text-indigo-600"
            >
              🛍️ หน้าร้าน ↗
            </Link>
          </span>
        )}
      </div>

      {!product && (
        <p className="mt-2 rounded-xl bg-white p-2.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
          {item.productId === "special-item"
            ? "🛠 งานพิเศษที่กรอกเอง — ไม่มีตารางราคาในระบบให้อ้าง ตีราคาตามหน้างาน"
            : "⚠️ หาสินค้าตัวนี้ในระบบไม่เจอ (อาจถูกลบไปแล้ว) — ตีราคาตามหน้างาน"}
        </p>
      )}

      {/* ── 📝 ที่มาของราคา — แอดมินโชว์วิธีคิดให้ลูกค้าเห็น (กันลูกค้าทักถามว่าทำไมเท่านี้) ── */}
      {onNote && (
        <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-indigo-200">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">
            📝 ที่มาของราคา · <span className="text-rose-500">ลูกค้าเห็นข้อความนี้</span>
          </p>
          <textarea
            value={note}
            /* แผงกัน mousedown ไว้ (กันโฟกัสหลุดจากช่องราคา) — ช่องนี้ต้องคลิกโฟกัสได้ จึงหยุดไว้ตรงนี้ */
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onNote(note)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onNote(note);
            }}
            rows={2}
            placeholder="เช่น 230 (แบบที่ 3) + 10 (เพิ่มขนาดตัวหลัง 20 ซม.) + 50 (สกรีนฐาน) = 290 บาท/ชิ้น"
            className="mt-1 w-full resize-y rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-700 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] leading-relaxed text-slate-400">
              แสดงใต้รายการในหน้าเช็คออเดอร์ของลูกค้า และติดไปกับข้อความแจ้งราคาทางไลน์
              {" · "}บันทึกภายในที่ลูกค้าไม่เห็น ใช้ “📝 หมายเหตุใบงาน” ด้านล่างแทน
            </p>
            {onDone && (
              <button
                type="button"
                onClick={() => onDone(note)}
                title="เก็บทั้งราคาที่พิมพ์ไว้และที่มาของราคา แล้วปิดแผงนี้"
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-700"
              >
                ✓ บันทึกราคา + ที่มา
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {/* ── ขนาด/ค่าที่ลูกค้าพิมพ์มาเอง ── */}
        {typed.length > 0 && (
          <div className={`${box} lg:col-span-2`}>
            <p className={head}>📐 ขนาด/รายละเอียดที่ลูกค้ากรอกมาเอง</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {typed.map(([k, v]) => (
                <span key={k} className="rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 ring-1 ring-sky-200">
                  {k}: <span className="text-sm">{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── ตารางราคาของเรทที่ลูกค้าเลือก ── */}
        {matrix && matrix.tiers.length > 0 && (
          <div className={box}>
            <p className={head}>
              💰 ราคาตามตาราง{rate ? ` · ${rate.label}` : ""}
            </p>
            {refPrice > 0 ? (
              <button
                type="button"
                onClick={() => onPick(refPrice)}
                className="mt-1 flex w-full items-baseline justify-between gap-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-left ring-1 ring-amber-300 transition hover:bg-amber-200"
              >
                <span className="text-[11px] font-bold text-amber-900">
                  ราคาปกติที่ {item.qty.toLocaleString("th-TH")} {matrix.unit}
                </span>
                <span className="text-base font-extrabold text-amber-900">{formatPrice(refPrice)} →</span>
              </button>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-slate-400">
                ตัวเลือกชุดนี้ไม่มีราคาในตาราง — ต้องตีเองทั้งก้อน
              </p>
            )}
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400">ทุกช่วงจำนวน (กดเพื่อเติมลงช่อง)</p>
            <div className="mt-1 space-y-0.5">
              {matrix.tiers.map((t, ti) => {
                const p = cellPrice(matrix, sel, ti);
                const now = ti === tier;
                return (
                  <button
                    key={t.label}
                    type="button"
                    disabled={p <= 0}
                    onClick={() => onPick(p)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      now ? "bg-amber-50 font-bold text-amber-800 ring-1 ring-amber-200" : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      {now ? "▸ " : ""}
                      {t.label}
                    </span>
                    <span className="font-bold">{p > 0 ? formatPrice(p) : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── เรทอื่นของสินค้าตัวเดียวกัน เทียบที่จำนวนเดียวกัน ── */}
        {(product?.priceRates?.length ?? 0) > 1 && (
          <div className={box}>
            <p className={head}>🔀 เรทอื่นของสินค้านี้ · ที่ {item.qty.toLocaleString("th-TH")} ชิ้น</p>
            <div className="mt-1 space-y-0.5">
              {product!.priceRates!.map((r) => {
                const p = cellPrice(r.pricing, sel, tierIndex(r.pricing, item.qty));
                const picked = sel[RATE_LABEL] === r.label;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={p <= 0}
                    onClick={() => onPick(p)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-0.5 text-left text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      picked ? "bg-sky-50 font-bold text-sky-800 ring-1 ring-sky-200" : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">
                      {picked ? "✓ " : ""}
                      {r.label}
                      {picked ? " (ลูกค้าเลือก)" : ""}
                    </span>
                    <span className="shrink-0 font-bold">{p > 0 ? formatPrice(p) : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ตัวเลือกเสริมที่มีราคาบวก — ไว้บวกเองตามที่ลูกค้าสั่ง ── */}
        {addOns.length > 0 && (
          <div className={box}>
            <p className={head}>➕ ค่าเสริมต่อหน่วยในตารางสินค้า</p>
            <div className="mt-1 space-y-0.5">
              {addOns.slice(0, 8).map((a, n) => (
                <p key={`${a.group}-${a.name}-${n}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="truncate">
                    {a.name} <span className="text-slate-300">· {a.group}</span>
                  </span>
                  <span className="shrink-0 font-bold text-slate-700">+{formatPrice(a.extra)}</span>
                </p>
              ))}
              {addOns.length > 8 && <p className="text-[10px] text-slate-400">…อีก {addOns.length - 8} รายการ</p>}
            </div>
          </div>
        )}

        {/* ── เงื่อนไข/ข้อควรทราบของสินค้า — กฎการคิดราคาเพิ่มมักอยู่ในนี้ ── */}
        {product?.terms?.trim() && (
          <div className={`${box} lg:col-span-2`}>
            <p className={head}>📋 เงื่อนไขราคาของสินค้านี้</p>
            <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-600">{product.terms.trim()}</p>
          </div>
        )}

        {/* ── ลายที่ลูกค้าแนบ — ดูก่อนตีราคา (จำนวนสี/ความยากมีผล) ── */}
        {(item.artworkUrls?.length ?? 0) > 0 && (
          <div className={`${box} lg:col-span-2`}>
            <p className={head}>🎨 ลายที่ลูกค้าแนบ ({item.artworkUrls!.length})</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {item.artworkUrls!.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="ลายลูกค้า" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-amber-400" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] font-semibold leading-relaxed text-amber-700">
        ⚠️ ตัวเลขข้างบนคือ<b>ราคาตามตารางของสินค้าปกติ</b> — งานสั่งทำต้องบวกค่าขนาด/ค่าสกรีน/ค่าวัสดุพิเศษตามเงื่อนไขเอง
        กดตัวเลขเพื่อเติมลงช่อง แล้วแก้เป็นราคาจริงก่อนกด Enter
      </p>
    </div>
  );
}

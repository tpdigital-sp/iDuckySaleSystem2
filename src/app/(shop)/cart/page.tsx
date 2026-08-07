"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LINE_URL } from "@/components/LineButton";
import { activeRate, formatPrice, productPath } from "@/lib/products";
import {
  fetchShopPayment,
  freeShippingMinOf,
  shippingOf,
  DEFAULT_SHIPPING,
  type ShippingMethod,
} from "@/lib/shop-settings";
import { useCart } from "@/lib/cart-context";
import ProductVisual from "@/components/ProductVisual";
import { getAppendTarget, clearAppendTarget, setAppendPicks, getAppendPicks, clearAppendPicks, type AppendTarget } from "@/lib/append-order";
import { getQuoteTarget, clearQuoteTarget, type QuoteTarget } from "@/lib/append-quote";
import { cartQtyShipFee, pickShipping, shipProfileOf, shippingAllowed } from "@/lib/shipping-auto";

const USE_BY_KEY = "ducky-use-by-date";

export default function CartPage() {
  const { items, subtotal: cartSubtotal, totalQty: cartQty, setQty, removeItem, clear, productOf } = useCart();
  const router = useRouter();
  // สั่งเป็นออเดอร์ใหม่ หรือเพิ่มเข้าออเดอร์เดิม (ลูกค้ากดมาจากหน้าออเดอร์)
  const [appendTo, setAppendTo] = useState<AppendTarget | null>(null);
  /** รายการที่เลือกส่งเข้าออเดอร์เดิม (คีย์ของ cart item) — null = ยังไม่เคยเลือก (ถือว่าเลือกทุกอัน) */
  const [picks, setPicks] = useState<string[] | null>(null);
  // 📄 โหมดหยิบใส่ใบเสนอราคา (แอดมินกดมาจากหน้าใบเสนอราคา) — ของที่หยิบจะเข้าใบนั้น ไม่สร้างออเดอร์
  const [quoteTo, setQuoteTo] = useState<QuoteTarget | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState("");
  useEffect(() => {
    setAppendTo(getAppendTarget());
    setPicks(getAppendPicks());
    setQuoteTo(getQuoteTarget());
  }, []);

  async function sendToQuote() {
    if (!quoteTo) return;
    setQuoteBusy(true);
    setQuoteErr("");
    const res = await fetch("/api/admin/quotes/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: quoteTo.id,
        items: items.map((i) => {
          // แยกภาพลาย/ธงเช็คสต๊อกออกจากข้อความตัวเลือก (เหมือนตอน checkout) ไม่งั้น URL ยาวจะรกใบเสนอราคา
          const { "ภาพลายที่แนบ": artRaw, "รอเช็คสต๊อก": _bulk, ...restSel } = i.selections;
          const artworkUrls = (artRaw ?? "").split(" | ").map((u) => u.trim()).filter(Boolean);
          return {
            productId: i.productId,
            name: productOf(i.productId)?.name ?? i.productId,
            selections: Object.entries(restSel).map(([k, v]) => `${k}: ${v}`).join(" · "),
            qty: i.qty,
            unitPrice: i.unitPrice,
            ...(artworkUrls.length ? { artworkUrls } : {}),
          };
        }),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setQuoteBusy(false);
    if (!res.ok) return setQuoteErr(j.error ?? "เพิ่มเข้าใบเสนอราคาไม่สำเร็จ");
    clear();
    clearQuoteTarget();
    router.push(`/admin/quotes/${encodeURIComponent(quoteTo.id)}`);
  }
  const isPicked = (key: string) => !appendTo || picks === null || picks.includes(key);
  const pickedItems = items.filter((i) => isPicked(i.key));
  const subtotal = appendTo ? pickedItems.reduce((n, i) => n + i.unitPrice * i.qty + (i.extraFee ?? 0), 0) : cartSubtotal;
  const totalQty = appendTo ? pickedItems.reduce((n, i) => n + i.qty, 0) : cartQty;
  function togglePick(key: string) {
    setPicks((cur) => {
      const base = cur ?? items.map((i) => i.key);
      const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
      setAppendPicks(next);
      return next;
    });
  }

  // วันที่ต้องใช้งาน — เก็บไว้ให้หน้า checkout ส่งเข้าออเดอร์
  const [useBy, setUseBy] = useState("");
  useEffect(() => {
    try {
      setUseBy(localStorage.getItem(USE_BY_KEY) ?? "");
    } catch {}
  }, []);
  function saveUseBy(v: string) {
    setUseBy(v);
    try {
      if (v) localStorage.setItem(USE_BY_KEY, v);
      else localStorage.removeItem(USE_BY_KEY);
    } catch {}
  }
  // รูปแบบจัดส่ง + โปรส่งฟรี ดึงจากที่แอดมินตั้งค่าไว้ (ระหว่างโหลดใช้ค่าเริ่มต้นไปก่อน)
  const [methods, setMethods] = useState<ShippingMethod[]>(DEFAULT_SHIPPING);
  const [freeMin, setFreeMin] = useState(0);
  const [shippingId, setShippingId] = useState<string>(DEFAULT_SHIPPING[0].id);

  useEffect(() => {
    fetchShopPayment().then((p) => {
      const list = shippingOf(p);
      setMethods(list);
      setFreeMin(freeShippingMinOf(p));
      // ถ้าที่จำไว้ไม่มีในรายการแล้ว → กลับไปใช้ตัวแรก
      setShippingId((cur) => (list.some((m) => m.id === cur) ? cur : list[0].id));
    });
  }, []);

  // จำวิธีจัดส่งที่เลือก เพื่อส่งต่อไปหน้าแจ้งโอนเงิน
  useEffect(() => {
    const s = localStorage.getItem("iducky-shipping-v1");
    if (s) setShippingId(s);
  }, []);
  useEffect(() => {
    localStorage.setItem("iducky-shipping-v1", shippingId);
  }, [shippingId]);

  // 📦 สินค้าที่ตั้ง "ค่าส่งตามจำนวนชิ้น" ไว้ (ของหนัก เช่น แผ่นหินรองแก้ว)
  // รวมจำนวนต่อสินค้า (สินค้าเดียวกันอาจอยู่หลายแถวเพราะเลือกตัวเลือกต่างกัน)
  // 🎛️ ขนาดที่แอดมินตั้งตารางค่าส่งของตัวเองไว้ = นับแยกกลุ่ม (คนละกล่อง คนละตาราง)
  const qtyShip = (() => {
    const groups = new Map<
      string,
      { name: string; qty: number; tiers?: ReturnType<typeof shipProfileOf>["tiers"]; extra?: number; overflowMethodId?: string }
    >();
    for (const i of items) {
      const p = productOf(i.productId);
      const prof = shipProfileOf(p, i.selections);
      const key = `${i.productId}|${prof.ruleKey}`;
      const cur = groups.get(key);
      if (cur) {
        cur.qty += i.qty;
        continue;
      }
      groups.set(key, {
        name: (p?.name ?? i.productId) + (prof.ruleKey ? ` (${prof.ruleLabel})` : ""),
        qty: i.qty,
        tiers: prof.tiers,
        extra: prof.extra,
        overflowMethodId: prof.overflowMethodId,
      });
    }
    return cartQtyShipFee([...groups.values()].filter((x) => x.tiers?.length), methods);
  })();

  // 🚚 ระบบเลือกวิธีจัดส่งให้เอง — ของเยอะ/ของชิ้นใหญ่ ต้องกล่องใหญ่ ไม่ปล่อยให้ค้างที่กล่องเล็ก
  // รวมทั้งของที่เกินขั้นค่าส่งจนต้องเปลี่ยนวิธีส่ง (เช่น ส่งแมส)
  const auto = pickShipping(methods, {
    totalQty,
    subtotal,
    requiredIds: [
      // ค่าส่งขั้นต่ำ — เอาตามตัวเลือกที่เลือกจริง (ขนาดใหญ่บังคับกล่องใหญ่ได้)
      ...(items.map((i) => shipProfileOf(productOf(i.productId), i.selections).shippingId).filter(Boolean) as string[]),
      ...qtyShip.forceIds,
    ],
  });
  // ลูกค้าเปลี่ยนเองได้ แต่ถ้าตะกร้าเปลี่ยนจนต้องใช้กล่องใหญ่ขึ้น ระบบยกระดับให้ทันที
  useEffect(() => {
    if (!methods.length || !auto.id) return;
    const cur = methods.find((m) => m.id === shippingId);
    if (!cur || !shippingAllowed(cur, methods, auto)) setShippingId(auto.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.id, auto.floorId, methods.length, shippingId]);

  const shippingMethod = methods.find((s) => s.id === shippingId) ?? methods[0];
  const freeShipping = freeMin > 0 && subtotal >= freeMin;

  // สั่งเพิ่มเข้าออเดอร์เดิม = ส่งรวมกล่องเดียวกัน ไม่คิดค่าส่งซ้ำ
  // มีของคิดตามจำนวน = ใช้ค่าที่แพงกว่าระหว่างวิธีที่เลือกกับค่าตามจำนวน (ค่าตามจำนวนรวมค่ากล่องแล้ว)
  // มารับเอง (ราคา 0) = ไม่มีพัสดุ ไม่คิดค่าตามจำนวน · วิธีส่งจริงคิดค่าที่แพงกว่า
  const shippingCost =
    appendTo ? 0 : freeShipping ? 0 : shippingMethod.price === 0 ? 0 : Math.max(shippingMethod.price, qtyShip.fee);
  const qtyShipApplied = !appendTo && !freeShipping && qtyShip.fee > 0;

  // 📦 มีค่าตามจำนวน → วิธีส่งที่ถูกกว่าค่านี้จ่ายเท่ากันหมด ยุบรวมเป็นแถวเดียวราคาตรงกับที่จ่ายจริง
  // (กันลูกค้างงว่าทำไมติ๊ก EMS 50 แต่โดนคิด 100) · วิธีที่แพงกว่า กับมารับเอง ยังแยกแถวปกติ
  const shipRows: { id: string; name: string; price: number; note?: string; covers?: string[] }[] = (() => {
    if (!qtyShipApplied) return methods;
    const paid = methods.filter((m) => m.price > 0);
    const covered = paid.filter((m) => m.price <= qtyShip.fee);
    const rows: { id: string; name: string; price: number; note?: string; covers?: string[] }[] = [];
    if (covered.length) {
      // ตัวแทนแถวยุบ: ใช้วิธีที่ระบบเลือก (ถ้าอยู่ในกลุ่ม) ไม่งั้นตัวแพงสุดในกลุ่ม (กล่องใหญ่สุดที่คุ้มแล้ว)
      const rep = covered.find((m) => m.id === auto.id) ?? covered[covered.length - 1];
      rows.push({
        id: rep.id,
        name: "📦 ส่งพัสดุ (คิดตามจำนวนชิ้น)",
        price: qtyShip.fee,
        note: "รวมค่ากล่อง/น้ำหนักของออเดอร์นี้แล้ว",
        covers: covered.map((m) => m.id),
      });
    }
    rows.push(...paid.filter((m) => m.price > qtyShip.fee));
    rows.push(...methods.filter((m) => m.price === 0));
    return rows;
  })();
  const total = subtotal + shippingCost;
  const remainForFree = freeMin - subtotal;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
        <span className="text-7xl">🛒</span>
        <h1 className="mt-4 text-2xl font-extrabold text-amber-950">ตะกร้ายังว่างอยู่เลย</h1>
        <p className="mt-2 text-sm text-stone-500">
          ไปเลือกสินค้าน่ารัก ๆ มาใส่ตะกร้ากันเถอะ 🐥
        </p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105"
        >
          🛍️ ไปช้อปเลย
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <h1 className="text-2xl font-extrabold text-amber-950 md:text-3xl">
        🛒 ตะกร้าสินค้า <span className="text-base font-semibold text-stone-400">({items.length} รายการ · {totalQty} ชิ้น)</span>
      </h1>

      {/* 📄 แอดมินกำลังหยิบของใส่ใบเสนอราคา — ไม่ต้องผ่านหน้าชำระเงิน โยนเข้าใบได้เลย */}
      {quoteTo && (
        <div className="mt-4 rounded-3xl bg-teal-50 p-4 ring-1 ring-teal-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-teal-900">📄 กำลังหยิบใส่ใบเสนอราคา {quoteTo.id}</p>
              <p className="mt-0.5 text-xs text-teal-700">
                ลูกค้า: {quoteTo.customer} · หยิบสินค้าให้ครบก่อน แล้วกดปุ่มขวาเพื่อโยนเข้าใบทีเดียว (ยังไม่สร้างออเดอร์)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void sendToQuote()}
                disabled={quoteBusy}
                className="rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-40"
              >
                {quoteBusy ? "กำลังเพิ่ม…" : `➕ ใส่ในใบเสนอราคา (${items.length} รายการ)`}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearQuoteTarget();
                  setQuoteTo(null);
                }}
                className="rounded-full px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                ยกเลิกโหมดนี้
              </button>
            </div>
          </div>
          {quoteErr && <p className="mt-2 text-xs font-bold text-rose-600">{quoteErr}</p>}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* รายการสินค้า */}
        <div className="space-y-3">
          {items.map((item) => {
            const product = productOf(item.productId);
            if (!product) return null;
            return (
              <div
                key={item.key}
                className={`flex gap-4 rounded-3xl p-4 shadow-sm ring-1 transition ${
                  appendTo && !isPicked(item.key) ? "bg-stone-50 opacity-60 ring-stone-200" : "bg-white ring-amber-100"
                }`}
              >
                {/* เลือกว่าจะส่งรายการนี้เข้าออเดอร์เดิมไหม (เห็นเฉพาะโหมดสั่งเพิ่ม) */}
                {appendTo && (
                  <label className="flex shrink-0 cursor-pointer items-start pt-1" title="ติ๊ก = ส่งรายการนี้เข้าออเดอร์เดิม">
                    <input
                      type="checkbox"
                      checked={isPicked(item.key)}
                      onChange={() => togglePick(item.key)}
                      className="h-5 w-5 accent-sky-600"
                    />
                  </label>
                )}
                {(() => {
                  // ลายที่ลูกค้าแนบ (เก็บมาในตัวเลือกเป็น url คั่นด้วย " | ") — โชว์ลายจริงแทนรูปสินค้า
                  const artUrls = String(item.selections["ภาพลายที่แนบ"] ?? "")
                    .split("|")
                    .map((u) => u.trim())
                    .filter(Boolean);
                  return (
                    <Link href={productPath(product)} className="relative shrink-0">
                      {artUrls[0] ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={artUrls[0]}
                            alt={`ลายที่แนบของ ${product.name}`}
                            className="h-24 w-24 rounded-2xl object-cover ring-1 ring-sky-200"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-sky-600/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            🎨 ลายของคุณ{artUrls.length > 1 ? ` +${artUrls.length - 1}` : ""}
                          </span>
                        </>
                      ) : (
                        <ProductVisual
                          emoji={product.emoji}
                          gradient={product.gradient}
                          src={product.imageSrc}
                          alt={product.name}
                          size="text-4xl"
                          className="h-24 w-24 rounded-2xl"
                        />
                      )}
                    </Link>
                  );
                })()}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={productPath(product)}
                      className="line-clamp-1 text-sm font-bold text-stone-800 hover:text-amber-700"
                    >
                      {product.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`ลบ ${product.name} ออกจากตะกร้า`}
                    >
                      ✕ ลบ
                    </button>
                  </div>
                  {(() => {
                    // ซ่อน url ลาย/ธงภายในระบบ — สรุปเป็นข้อความสั้นแทน
                    const artCount = String(item.selections["ภาพลายที่แนบ"] ?? "").split("|").filter((u) => u.trim()).length;
                    const shown = Object.entries(item.selections).filter(
                      ([k]) => k !== "ภาพลายที่แนบ" && k !== "รอเช็คสต๊อก"
                    );
                    if (!shown.length && !artCount) return null;
                    return (
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-400">
                        {shown.map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        {artCount > 0 && (
                          <span className="ml-1 font-semibold text-sky-600">
                            {shown.length ? "· " : ""}🎨 แนบลายแล้ว {artCount} รูป
                          </span>
                        )}
                      </p>
                    );
                  })()}
                  {(() => {
                    // ขั้นต่ำของเรทที่เลือก (สินค้าหลายเรท) — ลดต่ำกว่านี้ไม่ได้ / เตือนถ้าหลุดเกณฑ์
                    const itemRate = activeRate(product, item.selections);
                    const minQ = itemRate?.minQty ?? 1;
                    return (
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div>
                    <div className="flex items-center rounded-full bg-amber-50 ring-1 ring-amber-200">
                      <button
                        type="button"
                        onClick={() => setQty(item.key, Math.max(minQ, item.qty - 1))}
                        disabled={item.qty <= minQ}
                        className="h-9 w-9 rounded-l-full font-bold text-stone-600 hover:bg-amber-100 disabled:opacity-30"
                        aria-label="ลดจำนวน"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(item.key, item.qty + 1)}
                        className="h-9 w-9 rounded-r-full font-bold text-stone-600 hover:bg-amber-100"
                        aria-label="เพิ่มจำนวน"
                      >
                        +
                      </button>
                    </div>
                    {item.qty < minQ && (
                      <p className="mt-1 text-[11px] font-bold text-rose-600">
                        ⚠️ เรทนี้สั่งขั้นต่ำ {minQ.toLocaleString("th-TH")} ชิ้น
                      </p>
                    )}
                    </div>
                    <div className="text-right">
                      {item.unitPrice <= 0 ? (
                        <span className="text-sm font-bold text-amber-600">💬 รอตีราคา</span>
                      ) : (
                        <>
                          <span className="text-base font-extrabold text-amber-600">
                            {formatPrice(item.unitPrice * item.qty + (item.extraFee ?? 0))}
                          </span>
                          {item.qty > 1 && (
                            <span className="block text-[11px] text-stone-400">
                              {formatPrice(item.unitPrice)} / ชิ้น
                              {(item.extraFee ?? 0) > 0 && <> · 🎨 ค่าคละลาย +{formatPrice(item.extraFee!)}</>}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={clear}
            className="text-xs font-semibold text-stone-400 underline-offset-2 hover:text-rose-500 hover:underline"
          >
            ล้างตะกร้าทั้งหมด
          </button>
        </div>

        {/* สรุปยอด */}
        <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100 lg:sticky lg:top-20">
          <h2 className="text-lg font-extrabold text-amber-950">สรุปคำสั่งซื้อ</h2>

          {/* ── ออเดอร์ใหม่ หรือ เพิ่มเข้าออเดอร์เดิม — เลือกให้ชัดก่อนไปหน้าชำระเงิน ── */}
          {appendTo && (
            <div className="mt-3 space-y-2 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
              <p className="text-xs font-bold text-sky-900">สั่งซื้อแบบไหน?</p>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-2.5 ring-1 ring-sky-200">
                <input
                  type="radio"
                  name="order-mode"
                  checked
                  readOnly
                  className="mt-0.5 h-4 w-4 accent-sky-600"
                />
                <span className="text-xs leading-relaxed text-stone-700">
                  <strong className="block text-sm text-sky-800">➕ เพิ่มเข้าออเดอร์เดิม {appendTo.id}</strong>
                  ใช้ชื่อ/ที่อยู่เดิม · <strong className="text-emerald-700">ไม่คิดค่าส่งเพิ่ม</strong> เพราะส่งรวมกล่องเดียวกัน
                  <span className="mt-1 block font-bold text-sky-700">
                    ติ๊กเลือกรายการที่จะส่งเข้าออเดอร์เดิมได้ — เลือกแล้ว {items.filter((i) => isPicked(i.key)).length}/{items.length} รายการ
                    <span className="block font-normal text-stone-500">รายการที่ไม่ติ๊กจะยังอยู่ในตะกร้า สั่งทีหลังได้</span>
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  clearAppendTarget();
                  clearAppendPicks();
                  setAppendTo(null);
                  setPicks(null);
                }}
                className="flex w-full cursor-pointer items-start gap-2 rounded-xl bg-white p-2.5 text-left ring-1 ring-stone-200 transition hover:ring-stone-300"
              >
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ring-stone-300" />
                <span className="text-xs leading-relaxed text-stone-600">
                  <strong className="block text-sm text-stone-700">🆕 สั่งเป็นออเดอร์ใหม่</strong>
                  แยกออเดอร์ · คิดค่าส่งใหม่ · กรอกที่อยู่ใหม่ได้
                </span>
              </button>
            </div>
          )}

          {!freeShipping && remainForFree > 0 && (
            <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
              🚚 ซื้อเพิ่มอีก <strong>{formatPrice(remainForFree)}</strong> รับส่งฟรีเลย!
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ducky to-amber-500 transition-all"
                  style={{ width: `${freeMin > 0 ? Math.min(100, (subtotal / freeMin) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          {freeShipping && (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              🎉 ยินดีด้วย! คุณได้รับสิทธิ์ส่งฟรี
            </div>
          )}

          <div className="mt-4">
            <span className="mb-2 block text-sm font-bold text-stone-700">วิธีจัดส่ง</span>
            {auto.reason && (
              <p className="mb-2 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-200">
                🚚 ระบบเลือกกล่องที่พอดีกับออเดอร์นี้ให้แล้ว — {auto.reason}
              </p>
            )}
            {(qtyShipApplied || qtyShip.lines.some((l) => l.switchedTo)) && (
              <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
                📦 ออเดอร์นี้มีสินค้าที่<strong>คิดค่าส่งตามจำนวนชิ้น</strong> (ของมีน้ำหนัก):{" "}
                {qtyShip.lines
                  .map((l) =>
                    l.switchedTo
                      ? `${l.name} ${l.qty} ชิ้น → เกินเกณฑ์ ต้องส่งแบบ "${l.switchedTo.name}"`
                      : `${l.name} ${l.qty} ชิ้น = ${formatPrice(l.fee)}`
                  )
                  .join(" · ")}
                {qtyShip.fee > 0 && <> — เลือก "มารับเอง" ได้ ไม่คิดค่าส่งส่วนนี้</>}
              </p>
            )}
            <div className="space-y-2">
              {shipRows.map((s) => {
                const real = methods.find((m) => m.id === s.id);
                const ok = !real || shippingAllowed(real, methods, auto);
                const checked = s.covers ? s.covers.includes(shippingId) : shippingId === s.id;
                return (
                  <label
                    key={s.covers ? "__qty__" : s.id}
                    title={ok ? undefined : "ออเดอร์นี้ของเยอะเกินกล่องนี้"}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm ring-1 transition ${
                      !ok
                        ? "cursor-not-allowed bg-stone-50 text-stone-300 ring-stone-100"
                        : checked
                          ? "cursor-pointer bg-amber-50 font-bold ring-ducky"
                          : "cursor-pointer ring-amber-100 hover:bg-amber-50/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="shipping"
                        disabled={!ok}
                        checked={checked}
                        onChange={() => setShippingId(s.id)}
                        className="accent-amber-500"
                      />
                      <span>
                        {s.name}
                        {!ok && <span className="ml-1 text-[11px] font-semibold text-stone-400">· ของใส่ไม่พอ</span>}
                        {s.note && <span className="block text-[11px] font-normal text-stone-400">{s.note}</span>}
                      </span>
                    </span>
                    <span className={freeShipping && ok ? "text-stone-400 line-through" : ""}>
                      {formatPrice(s.price)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t border-amber-100 pt-4 text-sm">
            <div className="flex justify-between text-stone-600">
              <dt>ยอดรวมสินค้า ({totalQty} ชิ้น)</dt>
              <dd className="font-semibold">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-stone-600">
              <dt>{appendTo ? "ค่าจัดส่ง (รวมกล่องเดิม)" : "ค่าจัดส่ง"}</dt>
              <dd className="font-semibold">
                {freeShipping ? (
                  <span className="text-emerald-600">ฟรี!</span>
                ) : (
                  formatPrice(shippingCost)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-amber-100 pt-3 text-base font-extrabold text-amber-950">
              <dt>ยอดชำระทั้งหมด</dt>
              <dd className="text-amber-600">{formatPrice(total)}</dd>
            </div>
          </dl>

          {/* 📅 วันที่ต้องใช้งาน — ทักเช็คคิวงานกับแอดมินก่อน */}
          <div className="mt-5 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-200">
            <label htmlFor="use-by" className="block text-sm font-bold text-stone-700">
              📅 ต้องใช้งานวันไหน? <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
              มีกำหนดใช้งาน (อีเวนต์ · วันเกิด · ของขวัญ) ระบุไว้ได้เลย —{" "}
              <strong className="text-sky-700">รบกวนทักแอดมินเช็คคิวงานก่อนนะครับ</strong> ทางร้านจะยืนยันว่าทันไหมก่อนเริ่มผลิต
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="use-by"
                type="date"
                value={useBy}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => saveUseBy(e.target.value)}
                className="rounded-xl bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              {useBy && (
                <button type="button" onClick={() => saveUseBy("")} className="rounded-full px-3 py-1 text-xs font-bold text-stone-400 hover:bg-white hover:text-stone-600">
                  ล้างวันที่
                </button>
              )}
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#06C755] px-3.5 py-1.5 text-xs font-bold text-white transition hover:brightness-95"
              >
                💬 ทักเช็คคิวงาน
              </a>
            </div>
          </div>

          {(() => {
            // รายการที่จำนวนต่ำกว่าขั้นต่ำของเรทที่เลือก — กันหลุดไปหน้าชำระเงิน
            const below = items.filter((it) => {
              const p = productOf(it.productId);
              const r = p ? activeRate(p, it.selections) : undefined;
              return r?.minQty != null && it.qty < r.minQty;
            });
            return (
              <>
                {below.length > 0 && (
                  <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-bold leading-relaxed text-rose-700 ring-1 ring-rose-200">
                    ⚠️ มี {below.length} รายการที่จำนวนยังไม่ถึงขั้นต่ำของเรทราคาที่เลือก — เพิ่มจำนวนก่อนสั่งซื้อ
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/checkout")}
                  disabled={below.length > 0}
                  className="mt-5 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.02] hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  ✅ ยืนยันการสั่งซื้อ
                </button>
              </>
            );
          })()}
          <p className="mt-2 text-center text-[11px] leading-relaxed text-stone-500">
            ตรวจสอบรายการ · ตัวเลือก · ลิงก์ไฟล์ลาย ให้ครบ แล้วไปหน้าแจ้งโอนเงิน
          </p>
          <Link
            href="/products"
            className="mt-3 block rounded-full bg-amber-100 px-6 py-3 text-center text-sm font-bold text-amber-900 transition hover:bg-amber-200"
          >
            ← เลือกซื้อสินค้าต่อ
          </Link>
        </aside>
      </div>
    </div>
  );
}

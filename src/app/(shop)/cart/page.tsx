"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LINE_URL } from "@/components/LineButton";
import { formatPrice } from "@/lib/products";
import {
  fetchShopPayment,
  freeShippingMinOf,
  shippingOf,
  DEFAULT_SHIPPING,
  type ShippingMethod,
} from "@/lib/shop-settings";
import { useCart } from "@/lib/cart-context";
import ProductVisual from "@/components/ProductVisual";

const USE_BY_KEY = "ducky-use-by-date";

export default function CartPage() {
  const { items, subtotal, totalQty, setQty, removeItem, clear, productOf } = useCart();
  const router = useRouter();
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

  const shippingMethod = methods.find((s) => s.id === shippingId) ?? methods[0];
  const freeShipping = freeMin > 0 && subtotal >= freeMin;
  const shippingCost = freeShipping ? 0 : shippingMethod.price;
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
        🛒 ตะกร้าสินค้า <span className="text-base font-semibold text-stone-400">({totalQty} ชิ้น)</span>
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* รายการสินค้า */}
        <div className="space-y-3">
          {items.map((item) => {
            const product = productOf(item.productId);
            if (!product) return null;
            return (
              <div
                key={item.key}
                className="flex gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-amber-100"
              >
                <Link href={`/products/${product.id}`} className="shrink-0">
                  <ProductVisual
                    emoji={product.emoji}
                    gradient={product.gradient}
                    src={product.imageSrc}
                    alt={product.name}
                    size="text-4xl"
                    className="h-24 w-24 rounded-2xl"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/products/${product.id}`}
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
                  {Object.entries(item.selections).length > 0 && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-stone-400">
                      {Object.entries(item.selections)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded-full bg-amber-50 ring-1 ring-amber-200">
                      <button
                        type="button"
                        onClick={() => setQty(item.key, item.qty - 1)}
                        disabled={item.qty <= 1}
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
                    <div className="text-right">
                      {item.unitPrice <= 0 ? (
                        <span className="text-sm font-bold text-amber-600">💬 รอตีราคา</span>
                      ) : (
                        <>
                          <span className="text-base font-extrabold text-amber-600">
                            {formatPrice(item.unitPrice * item.qty)}
                          </span>
                          {item.qty > 1 && (
                            <span className="block text-[11px] text-stone-400">
                              {formatPrice(item.unitPrice)} / ชิ้น
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
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
            <div className="space-y-2">
              {methods.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-sm ring-1 transition ${
                    shippingId === s.id
                      ? "bg-amber-50 font-bold ring-ducky"
                      : "ring-amber-100 hover:bg-amber-50/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingId === s.id}
                      onChange={() => setShippingId(s.id)}
                      className="accent-amber-500"
                    />
                    {s.name}
                  </span>
                  <span className={freeShipping ? "text-stone-400 line-through" : ""}>
                    {formatPrice(s.price)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t border-amber-100 pt-4 text-sm">
            <div className="flex justify-between text-stone-600">
              <dt>ยอดรวมสินค้า ({totalQty} ชิ้น)</dt>
              <dd className="font-semibold">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-stone-600">
              <dt>ค่าจัดส่ง</dt>
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

          <button
            type="button"
            onClick={() => router.push("/checkout")}
            className="mt-5 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.02] hover:bg-amber-500"
          >
            ✅ ยืนยันการสั่งซื้อ
          </button>
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

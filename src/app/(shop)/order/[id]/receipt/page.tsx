"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { orderTotal, type Order } from "@/lib/admin-data";
import { fetchOrderForCustomer } from "@/lib/order-repo";
import { fetchShopPayment, shopInfoOf, type ShopInfo } from "@/lib/shop-settings";

/** ใบเสร็จ/ใบรับเงิน ที่ลูกค้าเปิด+พิมพ์เองได้ (ต้องมี key) */
export default function CustomerReceiptPage() {
  const params = useParams<{ id: string }>();
  const orderId = decodeURIComponent(String(params?.id ?? ""));
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderKey, setOrderKey] = useState("");
  const [shop, setShop] = useState<ShopInfo>(shopInfoOf(null)); // ข้อมูลร้าน (แอดมินแก้ได้ที่ตั้งค่าระบบ)

  useEffect(() => {
    void fetchShopPayment().then((p) => setShop(shopInfoOf(p)));
  }, []);

  const load = useCallback(
    async (key: string) => {
      const res = await fetchOrderForCustomer(orderId, key);
      setLoading(false);
      if (res.order) setOrder(res.order);
      else setErr(res.error ?? "เปิดใบเสร็จไม่สำเร็จ");
    },
    [orderId]
  );

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") ?? "";
    setOrderKey(k);
    void load(k);
  }, [load]);

  if (loading) return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>;
  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <span className="text-5xl">🔒</span>
        <p className="mt-4 text-sm text-stone-500">{err}</p>
      </div>
    );
  }

  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const backHref = `/order/${encodeURIComponent(orderId)}${orderKey ? `?key=${encodeURIComponent(orderKey)}` : ""}`;

  return (
    <>
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff !important; } }`}</style>

      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="no-print mb-4 flex items-center justify-between">
          <Link href={backHref} className="text-sm font-semibold text-stone-400 hover:text-stone-600">← กลับหน้าออเดอร์</Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-white transition hover:bg-amber-500"
          >
            🖨️ พิมพ์ / บันทึก PDF
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 print:ring-0">
          {/* หัว */}
          <div className="flex items-start justify-between border-b border-stone-200 pb-4">
            <div>
              <p className="text-lg font-extrabold text-amber-950">{shop.name}</p>
              <p className="text-xs leading-snug text-stone-500">{shop.legalName}</p>
              <p className="text-xs leading-snug text-stone-500">{shop.address.replace(/\n+/g, " ")}</p>
              <p className="text-xs text-stone-500">โทร. {shop.phone}</p>
              {shop.taxId && <p className="text-xs text-stone-500">เลขผู้เสียภาษี {shop.taxId}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-stone-700">ใบรับเงิน</p>
              <p className="mt-0.5 font-mono text-xs text-stone-500">{order.id}</p>
              <p className="text-xs text-stone-400">{order.date}</p>
            </div>
          </div>

          {/* ลูกค้า */}
          <div className="border-b border-stone-100 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">ลูกค้า</p>
            <p className="mt-0.5 text-sm font-bold text-stone-800">{order.customer}</p>
            <p className="text-xs text-stone-500">{order.phone}</p>
            <p className="text-xs leading-snug text-stone-500">{order.address}</p>
          </div>

          {/* รายการ */}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-400">
                <th className="py-2">รายการ</th>
                <th className="py-2 text-center">จำนวน</th>
                <th className="py-2 text-right">ราคา</th>
                <th className="py-2 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i} className="border-b border-stone-100 align-top">
                  <td className="py-2">
                    <p className="font-semibold text-stone-800">{it.name}</p>
                    {it.selections && <p className="text-[11px] text-stone-400">{it.selections}</p>}
                  </td>
                  <td className="py-2 text-center tabular-nums">{it.qty}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(it.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatPrice(it.qty * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* สรุป */}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>รวมสินค้า</span>
              <span className="tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-stone-500">
              <span>ค่าจัดส่ง ({order.shipping})</span>
              <span className="tabular-nums">{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
            </div>
            {order.discount && order.discount.amount > 0 && (
              <div className="flex justify-between font-semibold text-emerald-600">
                <span>{order.discount.label}</span>
                <span className="tabular-nums">−{formatPrice(order.discount.amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold text-amber-950">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="tabular-nums">{formatPrice(orderTotal(order))}</span>
            </div>
            {(order.paidTotal ?? 0) > 0 && (
              <div className="flex justify-between text-xs text-emerald-600">
                <span>ชำระแล้ว</span>
                <span className="tabular-nums">{formatPrice(order.paidTotal ?? 0)}</span>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-[11px] text-stone-400">
            เอกสารนี้ออกโดยระบบอัตโนมัติ · ขอบคุณที่อุดหนุน {shop.name} 🦆
          </p>
        </div>
      </div>
    </>
  );
}

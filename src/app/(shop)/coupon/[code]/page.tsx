"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCustomer } from "@/lib/customer-context";
import { formatPrice } from "@/lib/products";

type Info = {
  found: boolean;
  code?: string;
  label?: string;
  status?: "active" | "redeemed" | "void";
  usable?: boolean;
  minSpend?: number | null;
  expiresAt?: string | null;
  restricted?: boolean;
};

export default function CouponLinkPage() {
  const params = useParams<{ code: string }>();
  const rawCode = decodeURIComponent(params.code ?? "").toUpperCase();
  const { customer } = useCustomer();
  const [info, setInfo] = useState<Info | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!rawCode) return;
    fetch(`/api/coupons/${encodeURIComponent(rawCode)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Info) => {
        setInfo(j);
        // เก็บโค้ดไว้ให้ตะกร้าดึงไปใช้ตอนสั่งซื้อ (แม้ยังไม่ล็อกอิน)
        if (j.found && j.usable) {
          localStorage.setItem("ducky_coupon", j.code ?? rawCode);
          setSaved(true);
        }
      })
      .catch(() => setInfo({ found: false }));
  }, [rawCode]);

  if (info === null) {
    return <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-stone-400">กำลังตรวจคูปอง…</div>;
  }

  const bad = !info.found || info.status === "void";
  const used = info.status === "redeemed";
  const expired = info.found && !info.usable && !used && info.status !== "void";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-amber-100">
        {/* หัวตั๋ว */}
        <div className={`relative px-6 py-8 text-center text-white ${info.usable ? "bg-gradient-to-br from-sky-400 to-teal-500" : "bg-stone-400"}`}>
          <span className="text-5xl">🎟️</span>
          <p className="mt-2 text-xs font-medium uppercase tracking-wider opacity-90">คูปองส่วนลด iDucky</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tracking-widest">{rawCode}</p>
        </div>

        {/* รอยฉีกตั๋ว */}
        <div className="relative h-0">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-amber-50" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-amber-50" />
        </div>

        <div className="px-6 py-6 text-center">
          {info.usable ? (
            <>
              <p className="text-lg font-extrabold text-stone-800">{info.label}</p>
              <ul className="mx-auto mt-3 max-w-xs space-y-1 text-sm text-stone-500">
                {info.minSpend ? <li>• ยอดสั่งซื้อขั้นต่ำ {formatPrice(info.minSpend)}</li> : null}
                {info.expiresAt ? <li>• ใช้ได้ถึง {new Date(info.expiresAt).toLocaleDateString("th-TH")}</li> : null}
                {info.restricted ? <li>• สงวนสำหรับบัญชีที่ได้รับสิทธิ์</li> : null}
                <li>• ใช้ได้ครั้งเดียว</li>
              </ul>

              {saved && (
                <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  ✓ เก็บคูปองไว้แล้ว — ระบบจะใส่ส่วนลดให้อัตโนมัติตอนสั่งซื้อ
                </p>
              )}

              {!customer && (
                <p className="mt-3 text-xs text-stone-500">
                  ต้อง <Link href="/account" className="font-bold text-sky-600 underline underline-offset-2">เข้าสู่ระบบ</Link> ก่อนถึงใช้คูปองได้ (กันการส่งต่อ)
                </p>
              )}

              <Link
                href="/products"
                className="mt-5 inline-block rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-[1.02] hover:bg-amber-500"
              >
                🛍️ เลือกซื้อสินค้าเลย
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-extrabold text-stone-700">
                {bad ? "คูปองนี้ใช้ไม่ได้" : used ? "คูปองนี้ถูกใช้ไปแล้ว" : expired ? "คูปองหมดอายุแล้ว" : "คูปองนี้ใช้ไม่ได้"}
              </p>
              <p className="mt-2 text-sm text-stone-500">
                {bad ? "ไม่พบคูปองนี้ หรือถูกยกเลิกไปแล้ว" : "ลองติดต่อร้านเพื่อขอคูปองใหม่ได้เลยนะครับ 🦆"}
              </p>
              <Link href="/products" className="mt-5 inline-block rounded-full bg-stone-200 px-8 py-3.5 text-sm font-bold text-stone-600 transition hover:bg-stone-300">
                ไปเลือกซื้อสินค้า
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

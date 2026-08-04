"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { daysToExpire, quoteStatusOf, quoteTotal, type Quote } from "@/lib/quotes";
import { LINE_URL } from "@/components/LineButton";

/** หน้าใบเสนอราคาสำหรับลูกค้า — เปิดจากลิงก์ที่ร้านส่งให้ (ต้องมี key) */
export default function CustomerQuotePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const key = search.get("key") ?? "";

  const [quote, setQuote] = useState<Quote | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/quotes/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.quote) setQuote(j.quote);
        else setErr(j.error ?? "เปิดใบเสนอราคาไม่ได้");
      })
      .catch(() => setErr("เชื่อมต่อไม่ได้"))
      .finally(() => setLoading(false));
  }, [id, key]);

  async function accept() {
    setAccepting(true);
    const res = await fetch(`/api/quotes/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`, { method: "POST" });
    const j = await res.json();
    setAccepting(false);
    if (!res.ok) return setErr(j.error ?? "ยืนยันไม่สำเร็จ");
    setAccepted(true);
  }

  if (loading) return <p className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-stone-400">กำลังโหลดใบเสนอราคา…</p>;

  if (err || !quote)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="text-4xl">📄</span>
        <p className="mt-3 font-bold text-stone-700">{err || "ไม่พบใบเสนอราคา"}</p>
        <a href={LINE_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-[#06C755] px-6 py-2.5 text-sm font-bold text-white">
          💬 ทักร้านทางไลน์
        </a>
      </div>
    );

  const st = quoteStatusOf(quote);
  const left = daysToExpire(quote);
  const closed = st === "ไม่รับ" || st === "หมดอายุ";
  const done = accepted || st === "ลูกค้าตกลง" || Boolean(quote.orderId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">ใบเสนอราคา</p>
            <p className="text-2xl font-extrabold tracking-wide text-stone-900">{quote.id}</p>
            <p className="mt-0.5 text-xs text-stone-400">{quote.date}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-400">ยอดรวม</p>
            <p className="text-2xl font-extrabold text-amber-600">{formatPrice(quoteTotal(quote))}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm">
          <p className="font-bold text-stone-800">{quote.customer}</p>
          {quote.phone && <p className="text-xs text-stone-500">{quote.phone}</p>}
          {quote.address && <p className="mt-0.5 text-xs text-stone-500">{quote.address}</p>}
        </div>

        {/* รายการที่เสนอ */}
        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-stone-200">
          <div className="flex items-center gap-3 bg-stone-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">
            <span className="flex-1">รายการ</span>
            <span className="w-12 text-center">จำนวน</span>
            <span className="w-24 text-right">ราคา/หน่วย</span>
            <span className="w-24 text-right">รวม</span>
          </div>
          {quote.items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3 border-t border-stone-100 px-4 py-3 text-sm">
              <span className="min-w-40 flex-1">
                <span className="block font-bold text-stone-800">
                  {i + 1}. {it.name}
                </span>
                {it.selections && <span className="mt-0.5 block whitespace-pre-line text-xs text-stone-500">{it.selections}</span>}
              </span>
              <span className="w-12 text-center text-stone-600">{it.qty}</span>
              <span className="w-24 text-right text-stone-600">{formatPrice(it.unitPrice)}</span>
              <span className="w-24 text-right font-bold text-stone-900">{formatPrice(it.qty * it.unitPrice)}</span>
            </div>
          ))}
          <div className="space-y-1 border-t border-stone-100 bg-stone-50/60 px-4 py-3 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>ค่าจัดส่ง</span>
              <span>{quote.shippingCost ? formatPrice(quote.shippingCost) : "ฟรี"}</span>
            </div>
            {(quote.discount ?? 0) > 0 && (
              <div className="flex justify-between font-semibold text-emerald-600">
                <span>ส่วนลด{quote.discountNote ? ` (${quote.discountNote})` : ""}</span>
                <span>−{formatPrice(quote.discount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-1.5 text-base font-extrabold text-stone-900">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="text-amber-600">{formatPrice(quoteTotal(quote))}</span>
            </div>
          </div>
        </div>

        {quote.note && (
          <div className="mt-4 rounded-2xl bg-amber-50/60 p-4 text-xs leading-relaxed text-stone-700 ring-1 ring-amber-100">
            <p className="font-bold text-amber-800">เงื่อนไข</p>
            <p className="mt-1 whitespace-pre-line">{quote.note}</p>
          </div>
        )}

        {left !== null && !closed && !done && (
          <p className={`mt-3 text-center text-xs font-bold ${left < 0 ? "text-rose-600" : "text-stone-500"}`}>
            {left < 0 ? "⌛ ใบเสนอราคานี้หมดอายุแล้ว" : `ยืนราคาถึงอีก ${left} วัน`}
          </p>
        )}

        {/* ปุ่มตกลง */}
        <div className="mt-5">
          {done ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
              <p className="text-base font-extrabold text-emerald-800">✅ ยืนยันแล้ว — ขอบคุณครับ</p>
              <p className="mt-1 text-xs text-emerald-700">ทางร้านจะเปิดงานและติดต่อกลับเรื่องการชำระเงินอีกครั้ง</p>
            </div>
          ) : closed ? (
            <div className="rounded-2xl bg-stone-100 p-4 text-center">
              <p className="text-sm font-bold text-stone-600">{st === "หมดอายุ" ? "ใบเสนอราคานี้หมดอายุแล้ว" : "ใบเสนอราคานี้ปิดแล้ว"}</p>
              <a href={LINE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#06C755] underline">
                ทักร้านเพื่อขอใบใหม่ →
              </a>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={accept}
                disabled={accepting}
                className="w-full rounded-full bg-amber-500 py-3.5 text-sm font-extrabold text-white shadow-lg transition hover:bg-amber-600 disabled:opacity-40"
              >
                {accepting ? "กำลังยืนยัน…" : "✅ ตกลงตามใบเสนอราคานี้"}
              </button>
              <p className="mt-2 text-center text-[11px] text-stone-400">
                กดยืนยันแล้วทางร้านจะเปิดงานให้ · มีคำถามทักไลน์ได้เลย
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-stone-400">
        มีข้อสงสัย?{" "}
        <a href={LINE_URL} target="_blank" rel="noreferrer" className="font-bold text-[#06C755]">
          ทักแชทร้าน
        </a>
      </p>
    </div>
  );
}

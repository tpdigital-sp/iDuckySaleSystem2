"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import { formatPrice } from "@/lib/products";
import {
  QUOTE_STYLES,
  daysToExpire,
  quoteStatusOf,
  quoteTotal,
  withQuoteLog,
  type Quote,
} from "@/lib/quotes";
import type { OrderItem } from "@/lib/admin-data";
import { card, faint, h1, muted } from "@/lib/admin-ui";
import { useActor } from "@/lib/perm-context";

/** หน้าแก้ไขใบเสนอราคา — กรอกลูกค้า/รายการ/ราคา แล้วส่งให้ลูกค้าดู หรือแปลงเป็นออเดอร์เมื่อตกลง */
function QuoteDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meName = useActor();
  const quoteId = decodeURIComponent(String(params?.id ?? ""));

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quotes", { cache: "no-store" });
    const j = await res.json();
    const found = (j.quotes ?? []).find((q: Quote) => q.id === quoteId) ?? null;
    setQuote(found);
    setLoading(false);
  }, [quoteId]);
  useEffect(() => {
    void load();
  }, [load]);

  /** บันทึกลงฐาน (เรียกทุกครั้งที่แก้เสร็จ — ไม่มีปุ่ม Save แยก) */
  const persist = useCallback(async (next: Quote) => {
    setQuote(next);
    const res = await fetch("/api/admin/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const patch = (p: Partial<Quote>) => quote && void persist({ ...quote, ...p });
  const patchItem = (i: number, p: Partial<OrderItem>) =>
    quote && void persist({ ...quote, items: quote.items.map((it, k) => (k === i ? { ...it, ...p } : it)) });

  async function acceptQuote() {
    if (!quote) return;
    const others = window.confirm(
      "ลูกค้าตกลงใบนี้ — ระบบจะสร้างออเดอร์จริงให้\n\nกด OK เพื่อปิดใบเสนอราคาใบอื่นของลูกค้ารายนี้เป็น “ไม่รับ” ด้วย (แนะนำ)\nกด Cancel ถ้าอยากเก็บใบอื่นไว้"
    );
    setBusy(true);
    const res = await fetch("/api/admin/quotes/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quote.id, closeOthers: others }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "แปลงเป็นออเดอร์ไม่สำเร็จ");
    router.push(`/admin/orders/${encodeURIComponent(j.orderId)}`);
  }

  async function declineQuote() {
    if (!quote) return;
    const reason = window.prompt("ลูกค้าไม่รับใบนี้ เพราะอะไร? (เก็บไว้ดูสถิติ)", "ราคาสูงเกินงบ");
    if (reason === null) return;
    await persist(
      withQuoteLog({ ...quote, status: "ไม่รับ", declineReason: reason.trim() }, meName || "แอดมิน", "ลูกค้าไม่รับใบนี้", reason.trim())
    );
  }

  async function removeQuote() {
    if (!quote) return;
    if (!window.confirm(`ลบใบเสนอราคา ${quote.id}?`)) return;
    const res = await fetch(`/api/admin/quotes?id=${encodeURIComponent(quote.id)}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) return setErr(j.error ?? "ลบไม่สำเร็จ");
    router.push("/admin/quotes");
  }

  if (loading) return <p className="py-20 text-center text-sm text-slate-400">กำลังโหลด…</p>;
  if (!quote)
    return (
      <div className="py-20 text-center">
        <span className="text-4xl">📄</span>
        <p className="mt-3 font-semibold text-slate-600">ไม่พบใบเสนอราคา {quoteId}</p>
        <Link href="/admin/quotes" className="mt-4 inline-block text-sm font-semibold text-amber-600 hover:underline">
          ← กลับรายการใบเสนอราคา
        </Link>
      </div>
    );

  const st = quoteStatusOf(quote);
  const left = daysToExpire(quote);
  const locked = Boolean(quote.orderId); // แปลงเป็นออเดอร์แล้ว = ล็อกไม่ให้แก้
  const customerUrl = origin ? `${origin}/quote/${encodeURIComponent(quote.id)}?key=${encodeURIComponent(quote.key)}` : "";
  const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-300 focus:outline-none";

  return (
    <div className={`mx-auto max-w-5xl overflow-hidden ${card}`}>
      {/* หัวใบ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 bg-slate-50/70 px-6 py-5">
        <div>
          <Link href="/admin/quotes" className="text-xs text-slate-400 hover:text-slate-600">
            ← ใบเสนอราคาทั้งหมด
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            {quote.id}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${QUOTE_STYLES[st]}`}>{st}</span>
          </h1>
          <p className={`text-xs ${faint}`}>
            {quote.date}
            {quote.createdBy ? ` · โดย ${quote.createdBy}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saved && <span className="text-xs font-bold text-emerald-600">✓ บันทึกแล้ว</span>}
          {!locked && (
            <>
              <button
                type="button"
                onClick={acceptQuote}
                disabled={busy || !quote.items.length}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
              >
                ✅ ลูกค้าตกลง — สร้างออเดอร์
              </button>
              <button
                type="button"
                onClick={declineQuote}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
              >
                ✕ ลูกค้าไม่รับ
              </button>
            </>
          )}
          {quote.orderId && (
            <Link
              href={`/admin/orders/${encodeURIComponent(quote.orderId)}`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              → เปิดออเดอร์ {quote.orderId}
            </Link>
          )}
          <span className="text-right">
            <span className={`block text-[11px] ${faint}`}>ยอดรวม</span>
            <span className="block text-xl font-extrabold text-slate-900">{formatPrice(quoteTotal(quote))}</span>
          </span>
        </div>
      </div>

      {err && <p className="border-b border-rose-100 bg-rose-50 px-6 py-2 text-xs font-bold text-rose-600">⚠️ {err}</p>}

      {locked && (
        <p className="border-b border-emerald-100 bg-emerald-50 px-6 py-2.5 text-xs font-bold text-emerald-800">
          ใบนี้ลูกค้าตกลงแล้ว และกลายเป็นออเดอร์ {quote.orderId} — แก้ไขต่อที่หน้าออเดอร์แทน
        </p>
      )}

      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ── ซ้าย: รายการ ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">รายการที่เสนอ</p>
          <div className="mt-2 space-y-2">
            {quote.items.map((it, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <input
                    value={it.name}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                    placeholder="ชื่องาน"
                    className={`${inp} min-w-40 flex-1 font-bold`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className={`${inp} w-20 text-center`}
                  />
                  <input
                    type="number"
                    min={0}
                    value={it.unitPrice}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                    className={`${inp} w-28 text-right`}
                  />
                  <span className="w-24 text-right text-sm font-bold text-slate-900">{formatPrice(it.qty * it.unitPrice)}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => patch({ items: quote.items.filter((_, k) => k !== i) })}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <textarea
                  value={it.selections ?? ""}
                  disabled={locked}
                  onChange={(e) => patchItem(i, { selections: e.target.value })}
                  rows={2}
                  placeholder="สเปค/รายละเอียดที่เสนอ เช่น ขนาด · วัสดุ · จำนวนสี"
                  className={`${inp} mt-1.5 resize-y text-xs`}
                />
              </div>
            ))}
            {!quote.items.length && (
              <p className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                ยังไม่มีรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม
              </p>
            )}
          </div>

          {!locked && (
            <button
              type="button"
              onClick={() =>
                patch({ items: [...quote.items, { productId: "special-item", name: "", selections: "", qty: 1, unitPrice: 0 }] })
              }
              className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700"
            >
              ＋ เพิ่มรายการ
            </button>
          )}

          {/* เงื่อนไข/หมายเหตุ */}
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">เงื่อนไข / หมายเหตุบนใบเสนอราคา</p>
          <textarea
            value={quote.note ?? ""}
            disabled={locked}
            onChange={(e) => patch({ note: e.target.value })}
            rows={3}
            placeholder="เช่น ราคานี้ยังไม่รวม VAT · ใช้เวลาผลิต 7–10 วันหลังอนุมัติแบบ · มัดจำ 50% ก่อนเริ่มงาน"
            className={`${inp} mt-1 resize-y text-xs`}
          />
        </div>

        {/* ── ขวา: ลูกค้า · ยอด · ลิงก์ ── */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ลูกค้า</p>
            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <input
                value={quote.customer}
                disabled={locked}
                onChange={(e) => patch({ customer: e.target.value })}
                placeholder="ชื่อลูกค้า"
                className={`${inp} font-bold`}
              />
              <input
                value={quote.phone}
                disabled={locked}
                onChange={(e) => patch({ phone: e.target.value.replace(/[^\d\-+ ]/g, "") })}
                placeholder="เบอร์โทร"
                className={inp}
              />
              <textarea
                value={quote.address ?? ""}
                disabled={locked}
                onChange={(e) => patch({ address: e.target.value })}
                rows={2}
                placeholder="ที่อยู่จัดส่ง (ไม่ใส่ก็ได้)"
                className={`${inp} resize-y`}
              />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ยอดเงิน</p>
            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={muted}>ค่าจัดส่ง</span>
                <input
                  type="number"
                  min={0}
                  value={quote.shippingCost}
                  disabled={locked}
                  onChange={(e) => patch({ shippingCost: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inp} w-24 text-right`}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={muted}>ส่วนลด</span>
                <input
                  type="number"
                  min={0}
                  value={quote.discount ?? 0}
                  disabled={locked}
                  onChange={(e) => patch({ discount: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inp} w-24 text-right`}
                />
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base font-extrabold text-slate-900">
                <span>ยอดรวม</span>
                <span>{formatPrice(quoteTotal(quote))}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ยืนราคาถึง</p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
              <input
                type="date"
                value={quote.expiresAt ? quote.expiresAt.slice(0, 10) : ""}
                disabled={locked}
                onChange={(e) => patch({ expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
                className={inp}
              />
              {left !== null && !locked && (
                <p className={`mt-1 text-[11px] font-bold ${left < 0 ? "text-amber-600" : "text-slate-400"}`}>
                  {left < 0 ? `หมดอายุมาแล้ว ${Math.abs(left)} วัน` : `เหลืออีก ${left} วัน`}
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ลิงก์ให้ลูกค้าดู</p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
              <p className="break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
                {customerUrl || "…"}
              </p>
              <button
                type="button"
                disabled={!customerUrl}
                onClick={() => {
                  navigator.clipboard?.writeText(customerUrl).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  if (quote.status === "ร่าง")
                    void persist(withQuoteLog({ ...quote, status: "ส่งให้ลูกค้าแล้ว" }, meName || "แอดมิน", "ส่งใบเสนอราคาให้ลูกค้า"));
                }}
                className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-bold text-white transition ${
                  copied ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {copied ? "✓ คัดลอกแล้ว" : "🔗 คัดลอกลิงก์ส่งลูกค้า"}
              </button>
              <p className={`mt-1.5 text-[10px] leading-relaxed ${faint}`}>
                คัดลอกครั้งแรกจะเปลี่ยนสถานะเป็น “ส่งให้ลูกค้าแล้ว” · ลูกค้ากดตกลงเองได้จากลิงก์นี้
              </p>
            </div>
          </div>

          {quote.declineReason && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
              ไม่รับ — {quote.declineReason}
            </p>
          )}

          {!locked && (
            <button
              type="button"
              onClick={removeQuote}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              🗑 ลบใบเสนอราคานี้
            </button>
          )}
        </div>
      </div>

      {/* ประวัติ */}
      {(quote.log?.length ?? 0) > 0 && (
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ประวัติ</p>
          <ul className="mt-2 space-y-1">
            {[...(quote.log ?? [])].reverse().map((l, i) => (
              <li key={i} className="text-[11px] text-slate-500">
                <span className="font-bold text-slate-600">{l.by}</span> · {l.action}
                {l.detail ? ` — ${l.detail}` : ""} ·{" "}
                {new Date(l.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminQuoteDetailPage() {
  return (
    <RequirePerm perm="orders.edit">
      <QuoteDetailInner />
    </RequirePerm>
  );
}

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
import { Banner, Btn, PageShell } from "@/components/admin/ui";
import { useActor } from "@/lib/perm-context";
import ItemAdder from "@/components/admin/ItemAdder";
import { setQuoteTarget } from "@/lib/append-quote";

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

  const soon = !locked && left !== null && left <= 3;

  return (
    <PageShell>
      {/* งานที่ต้องทำต่ออยู่บนสุดเสมอ — ใบเสนอราคาที่เงียบเกินวันยืนราคาคือใบที่หลุดมือ */}
      {soon && (
        <Banner
          tone="warm"
          title={left! < 0 ? `หมดอายุไปแล้ว ${Math.abs(left!)} วัน` : left === 0 ? "ยืนราคาหมดวันนี้" : `ยืนราคาเหลือ ${left} วัน`}
          detail="ลูกค้ายังไม่ตอบ — ทวงทาง LINE หรือขยายวันยืนราคาก่อนใบหลุดมือ"
        />
      )}
      {locked && (
        <Banner
          tone="warm"
          title={`ใบนี้ลูกค้าตกลงแล้ว และกลายเป็นออเดอร์ ${quote.orderId}`}
          detail="แก้ไขต่อที่หน้าออเดอร์แทน"
          href={quote.orderId ? `/admin/orders/${encodeURIComponent(quote.orderId)}` : undefined}
        />
      )}
      {err && (
        <div className={soon || locked ? "mt-3" : ""}>
          <Banner tone="hot" title={err} />
        </div>
      )}

      <div className={`dkb-g overflow-hidden ${soon || locked || err ? "mt-4" : ""}`}>
        {/* หัวใบ */}
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--dk-hair)" }}>
          <div className="min-w-0">
            <Link href="/admin/quotes" className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
              ใบเสนอราคาทั้งหมด
            </Link>
            <h1 className="dkb-display mt-1 flex flex-wrap items-center gap-2 text-[1.5rem] leading-tight">
              {quote.id}
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${QUOTE_STYLES[st]}`}>{st}</span>
            </h1>
            <p className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              {quote.date}
              {quote.createdBy ? ` · โดย ${quote.createdBy}` : ""}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {saved && (
              <span className="text-[12px] font-semibold" style={{ color: "var(--dk-mint-ink)" }}>
                บันทึกแล้ว
              </span>
            )}
            {!locked && (
              <>
                <Btn tone="navy" onClick={acceptQuote} disabled={busy || !quote.items.length}>
                  ลูกค้าตกลง — สร้างออเดอร์
                </Btn>
                <Btn onClick={declineQuote}>ลูกค้าไม่รับ</Btn>
              </>
            )}
            {quote.orderId && (
              <Btn tone="yolk" href={`/admin/orders/${encodeURIComponent(quote.orderId)}`}>
                เปิดออเดอร์ {quote.orderId}
              </Btn>
            )}
            <span className="text-right">
              <span className="block text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                ยอดรวม
              </span>
              <span className="dkb-num block text-[1.4rem]">{formatPrice(quoteTotal(quote))}</span>
            </span>
          </div>
        </div>

      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ── ซ้าย: รายการ ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">รายการที่เสนอ</p>

          {/* หัวตาราง — คอลัมน์ตรงกับแถวด้านล่าง อ่านง่ายเวลามีหลายรายการ */}
          {quote.items.length > 0 && (
            <div className="mt-2 hidden gap-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 lg:grid lg:grid-cols-[1.75rem_5rem_minmax(0,1fr)_4.5rem_6.5rem_6rem_1.75rem]">
              <span>#</span>
              <span>รูป</span>
              <span>ชื่องาน / สเปคที่เสนอ</span>
              <span className="text-center">จำนวน</span>
              <span className="text-right">ราคา/หน่วย</span>
              <span className="text-right">ยอดรวม</span>
              <span />
            </div>
          )}

          <div className="space-y-2">
            {quote.items.map((it, i) => (
              <div
                key={i}
                className={`grid items-start gap-2 rounded-xl border border-slate-200 p-3 lg:grid-cols-[1.75rem_5rem_minmax(0,1fr)_4.5rem_6.5rem_6rem_1.75rem] ${
                  i % 2 ? "bg-slate-50/70" : "bg-white"
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                  {i + 1}
                </span>

                {/* ภาพลายที่แนบมาจากตอนหยิบของ (ถ้ามี) */}
                <div className="flex flex-wrap gap-1">
                  {(it.artworkUrls ?? []).slice(0, 4).map((u, k) => (
                    <a key={k} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-9 w-9 rounded-md object-cover ring-1 ring-slate-200" />
                    </a>
                  ))}
                  {!it.artworkUrls?.length && (
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-sm text-slate-300">🖼️</span>
                  )}
                </div>

                <div className="min-w-0 space-y-1.5">
                  <input
                    value={it.name}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                    placeholder="ชื่องาน"
                    className={`${inp} font-bold`}
                  />
                  <textarea
                    value={it.selections ?? ""}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { selections: e.target.value })}
                    rows={2}
                    placeholder="สเปค/รายละเอียดที่เสนอ เช่น ขนาด · วัสดุ · จำนวนสี"
                    className={`${inp} resize-y text-xs`}
                  />
                </div>

                <label className="block lg:mt-0">
                  <span className="mb-0.5 block text-[10px] font-bold text-slate-400 lg:hidden">จำนวน</span>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className={`${inp} text-center font-bold`}
                  />
                </label>

                <label className="block">
                  <span className="mb-0.5 block text-[10px] font-bold text-slate-400 lg:hidden">ราคา/หน่วย</span>
                  <input
                    type="number"
                    min={0}
                    value={it.unitPrice}
                    disabled={locked}
                    onChange={(e) => patchItem(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                    className={`${inp} text-right font-bold`}
                  />
                </label>

                <span className="pt-2 text-right text-sm font-extrabold text-slate-900">{formatPrice(it.qty * it.unitPrice)}</span>

                {!locked ? (
                  <button
                    type="button"
                    onClick={() => patch({ items: quote.items.filter((_, k) => k !== i) })}
                    title="ลบรายการนี้"
                    className="mt-1 justify-self-end rounded-lg px-2 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-50"
                  >
                    ✕
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {!quote.items.length && (
              <p className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                ยังไม่มีรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม
              </p>
            )}
          </div>

          {/* ตัวเพิ่มรายการชุดเดียวกับหน้าออเดอร์งานพิเศษ — กรอกเอง (มีคลังสินค้าพิเศษ/แนบภาพลาย) หรือหยิบจากหน้าร้านจริง */}
          {!locked && (
            <ItemAdder
              draftKey={`quote.${quote.id}`}
              target="ใบเสนอราคา"
              onAdd={(item) => patch({ items: [...quote.items, item] })}
              onShopAdd={() => {
                setQuoteTarget({ id: quote.id, customer: quote.customer });
                window.open("/products", "_blank", "noopener");
              }}
            />
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
    </PageShell>
  );
}

export default function AdminQuoteDetailPage() {
  return (
    <RequirePerm perm="orders.edit">
      <QuoteDetailInner />
    </RequirePerm>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { artQtyOf, formatPrice } from "@/lib/products";
import { artworkSide } from "@/lib/admin-data";
import ImageLightbox from "@/components/ImageLightbox";
import { daysToExpire, quoteMemberDiscount, quoteStatusOf, quoteSubtotal, quoteTotal, type Quote, type QuoteStatus } from "@/lib/quotes";
import { LINE_URL } from "@/components/LineButton";
import { SpecLines } from "@/components/SpecLines";

/**
 * หน้าใบเสนอราคาสำหรับลูกค้า — เปิดจากลิงก์ที่ร้านส่งให้ (ต้องมี key)
 *
 * ดีไซน์ (8 ก.ย. 69): ยกเข้าระบบหน้าร้าน `.shopp` + `.ord-*` (วิธีที่ 2 ใน landing.css) ให้หน้าตาเดียวกับ
 * หน้าติดตามออเดอร์/ตะกร้า — ผังเป็น 2 คอลัมน์บนจอกว้าง: ซ้าย = รายการ · ขวา = สรุปยอด+ปุ่มตกลง (sticky)
 * รายการเลิกเป็นตารางคอลัมน์แคบ ๆ → เป็นการ์ดต่อรายการ ราคาอยู่กล่องขวา (บนมือถือย้ายลงใต้สเปค)
 * ⚠️ ห้ามครอบ `.dl` (รีเซ็ต margin/padding ทับ Tailwind ทั้งหน้า)
 */

/** ป้ายสถานะที่ลูกค้าเห็น — เรียบกว่าหลังบ้าน (ลูกค้าไม่ต้องรู้ว่า "สร้างออเดอร์แล้ว") */
function statusChip(st: QuoteStatus, done: boolean): { label: string; cls: string } {
  if (done) return { label: "✓ ยืนยันแล้ว", cls: "ok" };
  if (st === "หมดอายุ") return { label: "หมดอายุแล้ว", cls: "danger" };
  if (st === "ไม่รับ") return { label: "ปิดแล้ว", cls: "ghost" };
  return { label: "รอการยืนยัน", cls: "yolk" };
}

/** วันหมดอายุแบบไทยสั้น ๆ ("15 ก.ย. 2569") */
function expiryText(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** เมฆลอย — ชุดเดียวกับหน้าติดตามออเดอร์ */
function Sky() {
  return (
    <div className="shopp-sky no-print" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc1" src="/landing/cloud.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc2" src="/landing/cloud.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc4" src="/landing/cloud.webp" alt="" />
    </div>
  );
}

/** สไตล์ตอนพิมพ์/บันทึก PDF — ตัดเมฆ ปุ่ม และพื้นฟ้าออก ให้เหลือแต่ใบ */
const PRINT_CSS = `@media print {
  .no-print { display: none !important; }
  .shopp { background: #fff !important; margin-top: 0 !important; padding-top: 0 !important; min-height: 0 !important; }
  .shopp-in { width: 100% !important; padding: 0 !important; }
  .shopp .ord-card { background: #fff !important; box-shadow: none !important; border-color: #dbe7f3 !important; backdrop-filter: none !important; }
  .qt-grid { display: block !important; }
  .qt-side { position: static !important; margin-top: 16px; }
}`;

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
  /** ขยายดูลายที่แนบ — i = ลำดับรายการ · idx = รูปที่เท่าไรในรายการนั้น */
  const [lightbox, setLightbox] = useState<{ i: number; idx: number } | null>(null);

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

  // ── โหลด / เปิดไม่ได้ — อยู่ในโครง .shopp เดียวกัน พื้นหลังจะได้ไม่กระโดด ──
  if (loading || err || !quote)
    return (
      <div className="shopp">
        <Sky />
        <div className="shopp-in" style={{ maxWidth: 520, padding: "70px 0 90px" }}>
          <div className="ord-card p-8 text-center">
            {loading ? (
              <>
                <span className="text-4xl">📄</span>
                <p className="ord-title mt-3 text-base">กำลังโหลดใบเสนอราคา…</p>
                <p className="mt-1 text-xs t-faint">รอสักครู่นะครับ</p>
              </>
            ) : (
              <>
                <span className="text-4xl">📄</span>
                <p className="ord-title mt-3 text-base">{err || "ไม่พบใบเสนอราคา"}</p>
                <p className="mt-1 text-xs t-soft">ลิงก์อาจไม่ครบหรือใบนี้ถูกลบไปแล้ว — ทักร้านให้ส่งลิงก์ใหม่ได้เลยครับ</p>
                <a href={LINE_URL} target="_blank" rel="noreferrer" className="ord-btn line mt-5">
                  💬 ทักร้านทางไลน์
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    );

  const st = quoteStatusOf(quote);
  const left = daysToExpire(quote);
  const closed = st === "ไม่รับ" || st === "หมดอายุ";
  const done = accepted || st === "ลูกค้าตกลง" || Boolean(quote.orderId);
  const chip = statusChip(st, done);
  const subtotal = quoteSubtotal(quote);
  const memberOff = quoteMemberDiscount(quote);
  const adminOff = quote.discount ?? 0;
  const total = quoteTotal(quote);
  const totalQty = quote.items.reduce((s, i) => s + i.qty, 0);
  const expiry = expiryText(quote.expiresAt);

  return (
    <div className="shopp">
      <style>{PRINT_CSS}</style>
      <Sky />
      <div className="shopp-in" style={{ maxWidth: 1040 }}>
        {/* ── หัวใบ: เลขที่ · วันที่ · สถานะ · ยอดรวม ── */}
        <div className="ord-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="ord-eyebrow">ใบเสนอราคา · iDucky Shop</p>
              <p className="ord-title mt-1 select-all text-[1.7rem] leading-tight tracking-wide sm:text-3xl" style={{ fontWeight: 600 }}>
                {quote.id}
              </p>
              <p className="mt-1.5 text-xs t-soft">
                ออกเมื่อ {quote.date}
                {expiry && !done && (
                  <>
                    {" "}
                    · ยืนราคาถึง <span className={left !== null && left < 0 ? "t-danger font-semibold" : "t-ink font-semibold"}>{expiry}</span>
                  </>
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className={`ord-chip ${chip.cls}`}>{chip.label}</span>
                {quote.orderId && <span className="ord-chip ghost">🧾 ออเดอร์ {quote.orderId}</span>}
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <p className="ord-eyebrow">ยอดรวมทั้งสิ้น</p>
              <p className="ord-title t-blue text-3xl leading-none sm:text-[2.2rem]" style={{ fontWeight: 600 }}>
                {formatPrice(total)}
              </p>
              <p className="text-[11px] t-faint">
                {quote.items.length} รายการ · {totalQty.toLocaleString("th-TH")} ชิ้น
              </p>
            </div>
          </div>

          {/* เสนอให้ใคร */}
          <div className="ord-sub mt-4 flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="ord-eyebrow" style={{ fontSize: ".62rem" }}>เสนอราคาให้</p>
              <p className="ord-title mt-0.5 text-[.95rem]">{quote.customer}</p>
              {quote.phone && <p className="text-xs t-soft"><span className="mr-1">📞</span>{quote.phone}</p>}
              {quote.address && <p className="mt-0.5 text-xs leading-relaxed t-soft"><span className="mr-1">📍</span>{quote.address}</p>}
            </div>
            {quote.memberTier && !quote.memberTierOff && (
              <div className="ord-note ok flex items-center gap-2 px-3 py-2 text-xs">
                <span className="text-base leading-none">{quote.memberTier.icon}</span>
                <span>
                  สมาชิก <b>{quote.memberTier.name}</b> — ใบนี้คิดส่วนลด {quote.memberTier.pct}% ให้แล้ว
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── 2 คอลัมน์: รายการ | สรุปยอด ── */}
        <div className="qt-grid mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* รายการที่เสนอ */}
          <div className="ord-card p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.05rem]">รายการที่เสนอ</h2>
              <span className="text-[11px] t-faint">ราคาต่อหน่วย × จำนวน</span>
            </div>
            <ol className="mt-3 space-y-3">
              {quote.items.map((it, i) => (
                <li key={i} className="ord-sub p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2.5">
                        <span
                          className="ord-title grid h-6 w-6 flex-none place-items-center rounded-full text-[.72rem] text-white"
                          style={{ background: "linear-gradient(135deg,var(--blue),var(--blue-deep))" }}
                        >
                          {i + 1}
                        </span>
                        <p className="ord-title min-w-0 text-[.98rem] leading-snug">{it.name}</p>
                      </div>
                      <SpecLines
                        sel={it.sel}
                        text={it.selections}
                        stripLinks
                        labelClassName="t-ink"
                        className="mt-2 pl-[34px] text-[.8rem] leading-relaxed t-soft"
                      />
                      {/* 🎨 ลายที่ลูกค้าแนบมากับรายการ — โชว์ให้เห็นว่าราคานี้คิดจากลายไหน (แตะเพื่อขยาย) */}
                      {(it.artworkUrls?.length ?? 0) > 0 && (
                        <div className="mt-3 pl-[34px]">
                          <p className="ord-title text-[.78rem]">
                            🎨 ลายที่แนบ
                            <span className="ml-1 t-faint" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>
                              {it.artworkUrls!.length} รูป
                            </span>
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {it.artworkUrls!.map((u, k) => {
                              const side = artworkSide(it, u);
                              const n = artQtyOf(it, u, k);
                              return (
                                <div key={`${u}-${k}`} className="w-20 sm:w-24">
                                  {/* .ord-proof กว้าง 100% (unlayered ชนะ w-24 ของ Tailwind) → คุมความกว้างที่ตัวห่อแทน */}
                                  <button type="button" onClick={() => setLightbox({ i, idx: k })} className="ord-proof" title="แตะเพื่อดูเต็ม">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={u} alt={`ลายที่ ${k + 1}`} style={{ objectFit: "cover" }} />
                                    <span className="ord-proof-n">
                                      {side ?? `ลายที่ ${k + 1}`}
                                      {n ? ` · ${n.toLocaleString("th-TH")} ชิ้น` : ""}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {it.quoteNote && (
                        <p className="mt-2 pl-[34px] text-[11px] leading-relaxed t-faint">
                          💡 ที่มาของราคา: {it.quoteNote}
                        </p>
                      )}
                    </div>
                    {/* กล่องราคา — ขวาบนจอกว้าง / ใต้สเปคบนมือถือ */}
                    <div
                      className="flex flex-none items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:w-[168px] sm:flex-col sm:items-end sm:gap-0.5"
                      style={{ background: "var(--sky-50)", border: "1px solid var(--sky-200)" }}
                    >
                      <p className="text-xs t-soft">
                        <span className="ord-title t-ink text-sm">{it.qty.toLocaleString("th-TH")}</span> × {formatPrice(it.unitPrice)}
                      </p>
                      <p className="ord-title t-ink text-[1.1rem] leading-none" style={{ fontWeight: 600 }}>
                        {formatPrice(it.qty * it.unitPrice)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {/* เงื่อนไข — ขีดสีข้างซ้าย ไม่ใช่กล่องสีเต็มใบ (กัน "ลายตา") */}
            {quote.note && (
              <div className="mt-4 rounded-r-2xl py-2.5 pl-4 pr-3" style={{ borderLeft: "4px solid var(--yolk-deep)", background: "rgba(255,240,188,.35)" }}>
                <p className="ord-title text-[.82rem]">📌 เงื่อนไข / ข้อควรทราบ</p>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed t-soft">{quote.note}</p>
              </div>
            )}
          </div>

          {/* สรุปยอด + ปุ่มตกลง (sticky บนจอกว้าง) */}
          <aside className="qt-side lg:sticky lg:top-24">
            <div className="ord-card tint p-5">
              <h2 className="text-[1.05rem]">สรุปยอด</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="t-soft">รวมค่าสินค้า</dt>
                  <dd className="t-ink">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="t-soft">ค่าจัดส่ง</dt>
                  <dd className={quote.shippingCost ? "t-ink" : "t-ok font-semibold"}>{quote.shippingCost ? formatPrice(quote.shippingCost) : "ฟรี"}</dd>
                </div>
                {memberOff > 0 && quote.memberTier && (
                  <div className="flex justify-between gap-3 t-ok">
                    <dt>
                      {quote.memberTier.icon} ส่วนลดสมาชิก {quote.memberTier.name} ({quote.memberTier.pct}%)
                    </dt>
                    <dd className="font-semibold">−{formatPrice(memberOff)}</dd>
                  </div>
                )}
                {adminOff > 0 && (
                  <div className="flex justify-between gap-3 t-ok">
                    <dt>ส่วนลด{quote.discountNote ? ` (${quote.discountNote})` : ""}</dt>
                    <dd className="font-semibold">−{formatPrice(adminOff)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--sky-200)" }}>
                <span className="ord-title text-[.95rem]">ยอดรวมทั้งสิ้น</span>
                <span className="ord-title t-blue text-[1.6rem] leading-none" style={{ fontWeight: 600 }}>
                  {formatPrice(total)}
                </span>
              </div>

              {/* ── ปุ่ม / สถานะ ── */}
              <div className="mt-4">
                {done ? (
                  <div className="ord-note ok px-4 py-3.5 text-center">
                    <p className="ord-title text-[.95rem]" style={{ color: "inherit" }}>✅ ยืนยันแล้ว — ขอบคุณครับ</p>
                    <p className="mt-1 text-xs leading-relaxed">ทางร้านจะเปิดงานและติดต่อกลับเรื่องการชำระเงินอีกครั้ง</p>
                  </div>
                ) : closed ? (
                  <div className="ord-note plain px-4 py-3.5 text-center">
                    <p className="ord-title text-[.9rem]">{st === "หมดอายุ" ? "⌛ ใบเสนอราคานี้หมดอายุแล้ว" : "ใบเสนอราคานี้ปิดแล้ว"}</p>
                    <p className="mt-1 text-xs t-soft">ราคาอาจเปลี่ยน — ทักร้านเพื่อขอใบใหม่ได้เลยครับ</p>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={accept} disabled={accepting} className="ord-btn ok lg block no-print">
                      {accepting ? "กำลังยืนยัน…" : "✅ ตกลงตามใบเสนอราคานี้"}
                    </button>
                    <p className="mt-2 text-center text-[11px] leading-relaxed t-faint">
                      กดยืนยันแล้วทางร้านจะเปิดงานให้
                      {left !== null && (
                        <>
                          {" "}
                          · {left < 0 ? <span className="t-danger font-semibold">หมดอายุแล้ว</span> : `ยืนราคาอีก ${left} วัน`}
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>

              <div className="no-print mt-3 flex flex-col gap-2">
                <a href={LINE_URL} target="_blank" rel="noreferrer" className="ord-btn line block">
                  💬 มีคำถาม ทักแชทร้าน
                </a>
                <button type="button" onClick={() => window.print()} className="ord-btn ghost sm block">
                  🖨️ พิมพ์ / บันทึกเป็น PDF
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* ขยายดูลายที่แนบ — เลื่อนซ้าย/ขวาได้ภายในรายการเดียวกัน */}
        {lightbox &&
          (() => {
            const it = quote.items[lightbox.i];
            const urls = it?.artworkUrls ?? [];
            const src = urls[lightbox.idx];
            if (!src) return null;
            const many = urls.length > 1;
            const go = (d: number) => setLightbox({ i: lightbox.i, idx: (lightbox.idx + d + urls.length) % urls.length });
            const n = artQtyOf(it, src, lightbox.idx);
            return (
              <ImageLightbox
                src={src}
                alt={`ลายที่ ${lightbox.idx + 1}`}
                caption={`${lightbox.i + 1}. ${it.name} — ${artworkSide(it, src) ?? "ลายที่แนบ"}${n ? ` · ${n.toLocaleString("th-TH")} ชิ้น` : ""}`}
                counter={many ? `${lightbox.idx + 1} / ${urls.length}` : undefined}
                onPrev={many ? () => go(-1) : undefined}
                onNext={many ? () => go(1) : undefined}
                onClose={() => setLightbox(null)}
              />
            );
          })()}

        <p className="no-print mt-6 text-center text-[11px] t-faint">
          ใบเสนอราคานี้จัดทำโดย iDucky Shop · มีข้อสงสัยทักแชทร้านได้เลยครับ
        </p>
      </div>
    </div>
  );
}

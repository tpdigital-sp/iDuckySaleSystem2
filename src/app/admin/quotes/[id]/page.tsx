"use client";

/**
 * หน้าแก้ไขใบเสนอราคา — กรอกลูกค้า/รายการ/ราคา แล้วส่งให้ลูกค้าดู หรือแปลงเป็นออเดอร์เมื่อตกลง
 *
 * โครงหน้าเดียวกับหน้าออเดอร์ (/admin/orders/[id]) ทุกอย่าง — ใบเสนอราคาคือ "ออเดอร์ที่ยังไม่ตกลง"
 * คนที่ทำงานสองหน้านี้คือคนเดียวกัน สลับไปมาทั้งวัน ถ้าโครงคนละแบบต้องมานั่งหาของใหม่ทุกครั้ง:
 *   แถบหัว = ข้อมูลล้วน (เลขใบ · สถานะ · ยอด) แล้วปุ่มอยู่บรรทัดล่าง — "ขั้นถัดไป" เด่นอันเดียวชิดขวา
 *   ซ้าย   = งาน (ลูกค้า → รายการ → ยอดเงิน) · ขวา = ข้อมูลประกอบ (วันยืนราคา · ลิงก์ · เงื่อนไข · ประวัติ)
 *   หัวข้อกลุ่มขีดสี + การ์ดขอบซ้ายสีเดียวกัน (GH/soft) ชุดเดียวกับหน้าออเดอร์
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import { artQtyOf, artSizeOf, artSizeText, formatPrice, type Product } from "@/lib/products";
import { fetchProductsByIds } from "@/lib/product-repo";
import { itemPiecesLine } from "@/lib/item-yield";
import {
  QUOTE_STYLES,
  awaitingOrder,
  daysToExpire,
  quoteMemberDiscount,
  quoteStatusOf,
  quoteTotal,
  withQuoteLog,
  type Quote,
} from "@/lib/quotes";
import { artworkSide, type OrderItem } from "@/lib/admin-data";
import { faint, muted } from "@/lib/admin-ui";
import { Banner, Btn, CopyChip, GH, HBTN, LogTimeline, PageShell, soft } from "@/components/admin/ui";
import { ContactChip, CustomerContactInput } from "@/components/admin/CustomerContactInput";
import { useActor } from "@/lib/perm-context";
import ItemAdder from "@/components/admin/ItemAdder";
import PrevNextNav from "@/components/admin/PrevNextNav";
/** ลิงก์หน้ารายละเอียดใบเสนอราคา — คงที่นอกคอมโพเนนต์ */
const quoteHref = (id: string) => `/admin/quotes/${encodeURIComponent(id)}`;
import { setQuoteTarget } from "@/lib/append-quote";
import { formatPhone } from "@/lib/contacts";
import { fetchShopPayment, shippingOf, type ShippingMethod } from "@/lib/shop-settings";

/** ช่องกรอกชุดเดียวกับหน้าออเดอร์ */
const INP =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";
const MINI = "mb-1 text-[10.5px] font-bold text-slate-400";

function QuoteDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meName = useActor();
  const quoteId = decodeURIComponent(String(params?.id ?? ""));

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  /* 📐 สินค้าจริงของรายการในใบ — ไว้คิด "สั่ง N แผ่น ได้ X ชิ้น" ให้ใบเก่าที่ยังไม่ได้แช่ unitYield (ใบใหม่แช่มาแล้ว ไม่ต้องรอ) */
  const [prodById, setProdById] = useState<Record<string, Product>>({});
  const itemIdsKey = (quote?.items ?? []).map((i) => i.productId).filter((id) => id && !id.includes("#") && id !== "special-item").sort().join(",");
  useEffect(() => {
    if (!itemIdsKey) return;
    let alive = true;
    fetchProductsByIds(itemIdsKey.split(","))
      .then((list) => alive && setProdById(Object.fromEntries(list.map((p) => [p.id, p]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [itemIdsKey]);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  /** ชื่อที่กำลังพิมพ์ (ยังไม่บันทึก) — ระหว่างค้นผู้ติดต่อจะยิง PATCH ทุกตัวอักษรไม่ไหว บันทึกตอนออกจากช่องพอ */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // ลำดับใบทั้งหมดตามที่ API ส่งมา (created_at ใหม่→เก่า) ไว้ทำปุ่มก่อนหน้า/ถัดไป
  const [quoteIds, setQuoteIds] = useState<string[]>([]);
  /** วิธีส่งจากตั้งค่าร้าน — ชุดเดียวกับหน้าออเดอร์ (เลือกแล้วราคาเติมให้เอง แก้ตัวเลขต่อได้) */
  const [shipMethods, setShipMethods] = useState<ShippingMethod[]>([]);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    void fetchShopPayment().then((p) => setShipMethods(shippingOf(p)));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quotes", { cache: "no-store" });
    const j = await res.json();
    const found = (j.quotes ?? []).find((q: Quote) => q.id === quoteId) ?? null;
    setQuoteIds(((j.quotes ?? []) as Quote[]).map((q) => q.id));
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
    // เซิร์ฟเวอร์เติมส่วนลดระดับสมาชิกจากผู้ติดต่อที่ผูก (memberTier) — รับกลับมาโชว์ทันทีที่ผูก/ยกเลิกผูก
    const j = (await res.json().catch(() => ({}))) as { quote?: Quote };
    if (j.quote) setQuote((cur) => (cur && cur.id === j.quote!.id ? { ...cur, memberTier: j.quote!.memberTier } : cur));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const patch = (p: Partial<Quote>) => quote && void persist({ ...quote, ...p });

  /* เปิดใบที่ผูกผู้ติดต่อไว้ → บันทึกเปล่า 1 ครั้งให้เซิร์ฟเวอร์เช็คระดับสมาชิกสดจากผู้ติดต่อ (ยิงครั้งเดียวต่อใบ)
     ต้องทำแม้มี memberTier อยู่แล้ว — ระดับที่ล็อกในผู้ติดต่อเปลี่ยนได้ (ซีดใหม่/ขึ้น-ตกระดับ) แล้วใบต้องตามให้ทัน */
  const [backfilled, setBackfilled] = useState("");
  useEffect(() => {
    if (!quote || quote.orderId || !quote.contactId || backfilled === quote.id) return;
    setBackfilled(quote.id);
    void persist(quote);
  }, [quote, backfilled, persist]);
  const patchItem = (i: number, p: Partial<OrderItem>) =>
    quote && void persist({ ...quote, items: quote.items.map((it, k) => (k === i ? { ...it, ...p } : it)) });

  /** เอาภาพลายออกจากรายการ (ไฟล์ยังอยู่ในคลัง ลบเฉพาะการผูกกับใบนี้) — ล้าง artworkQty/artworkBackUrls ของรูปนั้นตามไปด้วย + ลงประวัติ */
  function removeArtwork(itemIndex: number, url: string) {
    if (!quote) return;
    const items = quote.items.map((it, k) =>
      k === itemIndex
        ? {
            ...it,
            artworkUrls: (it.artworkUrls ?? []).filter((u) => u !== url),
            ...(it.artworkQty ? { artworkQty: Object.fromEntries(Object.entries(it.artworkQty).filter(([key]) => key !== url)) } : {}),
            ...(it.artworkSize ? { artworkSize: Object.fromEntries(Object.entries(it.artworkSize).filter(([key]) => key !== url)) } : {}),
            ...(it.artworkBackUrls ? { artworkBackUrls: it.artworkBackUrls.filter((u) => u !== url) } : {}),
          }
        : it
    );
    void persist(withQuoteLog({ ...quote, items }, meName || "แอดมิน", "ลบภาพลาย", quote.items[itemIndex]?.name));
  }

  async function acceptQuote() {
    if (!quote) return;
    const others = window.confirm(
      "ลูกค้าตกลงใบนี้ — ระบบจะสร้างออเดอร์จริงให้\n\nกด OK เพื่อปิดใบเสนอราคาใบอื่นของลูกค้ารายนี้เป็น “ไม่รับ” ด้วย (แนะนำ)\nกด Cancel ถ้าอยากเก็บใบอื่นไว้"
    );
    setBusy(true);
    // เซิร์ฟเวอร์ตอบ 500 ตัวเปล่า/เน็ตหลุด → เดิม res.json() โยน error แล้ว busy ไม่ถูกปลด ปุ่มค้าง "กำลังสร้างออเดอร์…" ตลอด (11 ก.ย. 69)
    let j: { orderId?: string; error?: string } = {};
    let ok = false;
    try {
      const res = await fetch("/api/admin/quotes/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quote.id, closeOthers: others }),
      });
      ok = res.ok;
      j = (await res.json().catch(() => ({ error: `เซิร์ฟเวอร์ตอบผิดปกติ (HTTP ${res.status})` }))) as typeof j;
    } catch (e) {
      j = { error: `ติดต่อเซิร์ฟเวอร์ไม่ได้: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      setBusy(false);
    }
    if (!ok || !j.orderId) return setErr(j.error ?? "แปลงเป็นออเดอร์ไม่สำเร็จ");
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

  if (loading) return <p className="py-20 text-center text-sm text-slate-400">กำลังโหลดใบเสนอราคา…</p>;
  if (!quote)
    return (
      <div className="py-20 text-center">
        <span className="text-4xl">📄</span>
        <p className="mt-3 font-semibold text-slate-600">ไม่พบใบเสนอราคา {quoteId}</p>
        <Link href="/admin/quotes" className="mt-4 inline-block text-sm font-semibold text-amber-600 hover:underline">
          ← กลับไปหน้าใบเสนอราคา
        </Link>
      </div>
    );

  const st = quoteStatusOf(quote);
  const left = daysToExpire(quote);
  const locked = Boolean(quote.orderId); // แปลงเป็นออเดอร์แล้ว = ล็อกไม่ให้แก้
  /** ลูกค้ากดตกลงจากลิงก์เองแล้ว แต่ยังไม่มีใครกดเปิดงาน — ลูกค้ารออยู่จริง ต้องเด้งขึ้นบนสุด */
  const waiting = awaitingOrder(quote);
  const customerUrl = origin ? `${origin}/quote/${encodeURIComponent(quote.id)}?key=${encodeURIComponent(quote.key)}` : "";
  // ใบที่ลูกค้าตกลงแล้วไม่ต้องเตือนเรื่องวันยืนราคาอีก — จบขั้นตอน "รอลูกค้าตอบ" ไปแล้ว เหลือแค่รอเปิดงาน
  const soon = !locked && !waiting && st !== "ไม่รับ" && left !== null && left <= 3;

  const qty = quote.items.reduce((s, i) => s + i.qty, 0);
  const subtotal = quote.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const memberAmount = quoteMemberDiscount(quote);
  const total = quoteTotal(quote);
  const nItems = `${quote.items.length} รายการ`;

  /* ตัวเลขใหญ่บนแถบหัว — ยอดที่เสนอ พร้อมบรรทัดเทียบใต้เลขเสมอ (เลขไม่ลอยเดี่ยว)
     ใบที่ยืนราคาใกล้หมดคือใบที่กำลังจะหลุดมือ → ให้เลขเป็นสีเตือน เหมือน "ค้างชำระ" ของหน้าออเดอร์ */
  const money: { label: string; hot: boolean; sub: string; subTone?: string } = locked
    ? { label: "ยอดที่ตกลง", hot: false, sub: `✓ เป็นออเดอร์ ${quote.orderId} แล้ว`, subTone: "text-emerald-600" }
    : waiting
      ? { label: "ลูกค้าตกลงแล้ว", hot: false, sub: `${nItems} · รอกดสร้างออเดอร์`, subTone: "text-emerald-600" }
      : st === "ไม่รับ"
      ? { label: "ยอดที่เสนอไป", hot: false, sub: quote.declineReason ? `ลูกค้าไม่รับ — ${quote.declineReason}` : "ลูกค้าไม่รับใบนี้" }
      : soon
        ? {
            label: left! < 0 ? "หมดวันยืนราคาแล้ว" : "ใกล้หมดวันยืนราคา",
            hot: true,
            sub:
              left! < 0
                ? `เลยวันยืนราคามา ${Math.abs(left!)} วัน · ${nItems}`
                : `${left === 0 ? "ยืนราคาหมดวันนี้" : `เหลืออีก ${left} วัน`} · ${nItems}`,
          }
        : {
            label: "ยอดที่เสนอ",
            hot: false,
            sub: `${nItems} · รวมสินค้า ${formatPrice(subtotal)}${left !== null ? ` · ยืนราคาอีก ${left} วัน` : ""}`,
          };

  return (
    <PageShell>
      {/* งานที่ต้องทำต่ออยู่บนสุดเสมอ — ใบเสนอราคาที่เงียบเกินวันยืนราคาคือใบที่หลุดมือ */}
      {waiting && (
        <Banner
          tone="hot"
          title="✅ ลูกค้ากดตกลงตามใบนี้แล้ว — ยังไม่ได้สร้างออเดอร์"
          detail={
            quote.items.length
              ? "กดปุ่ม “ลูกค้าตกลง — สร้างออเดอร์” มุมขวาบน เพื่อเปิดงานจริงและเข้าคิวกราฟฟิก"
              : "ใบนี้ยังไม่มีรายการสินค้า — เติมรายการก่อน ถึงจะกดสร้างออเดอร์ได้"
          }
        />
      )}
      {soon && (
        <Banner
          tone="warm"
          title={left! < 0 ? `หมดอายุไปแล้ว ${Math.abs(left!)} วัน` : left === 0 ? "ยืนราคาหมดวันนี้" : `ยืนราคาเหลือ ${left} วัน`}
          detail="ลูกค้ายังไม่ตอบ — ทวงทาง LINE หรือขยายวันยืนราคาก่อนใบหลุดมือ"
        />
      )}
      {locked && (
        <div className={soon || waiting ? "mt-3" : ""}>
          <Banner
            tone="warm"
            title={`ใบนี้ลูกค้าตกลงแล้ว และกลายเป็นออเดอร์ ${quote.orderId}`}
            detail="แก้ไขต่อที่หน้าออเดอร์แทน"
            href={quote.orderId ? `/admin/orders/${encodeURIComponent(quote.orderId)}` : undefined}
          />
        </div>
      )}
      {err && (
        <div className={soon || waiting || locked ? "mt-3" : ""}>
          <Banner tone="hot" title={err} />
        </div>
      )}

      <div className={`dkb-g overflow-hidden ${soon || waiting || locked || err ? "mt-4" : ""}`}>
        {/* ── แถบหัว ── */}
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--dk-hair)" }}>
          {/* บรรทัดบน = ข้อมูลล้วน (เลขใบ · สถานะ · ยอด) ไม่มีปุ่มปน */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/admin/quotes" className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
                  ใบเสนอราคาทั้งหมด
                </Link>
                <PrevNextNav ids={quoteIds} current={quote.id} hrefOf={quoteHref} />
              </div>
              <h1 className="dkb-display mt-1 flex flex-wrap items-center gap-2 text-[1.55rem] leading-tight">
                {quote.id}
                {soon &&
                  (left! < 0 ? (
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                      หมดวันยืนราคา {Math.abs(left!)} วัน
                    </span>
                  ) : (
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200">
                      {left === 0 ? "ยืนราคาหมดวันนี้" : `ยืนราคาเหลือ ${left} วัน`}
                    </span>
                  ))}
              </h1>
              <p className={`text-xs ${faint}`}>
                {quote.date}
                {quote.createdBy ? ` · โดย ${quote.createdBy}` : ""}
              </p>
            </div>

            {/* ขวาบน = ยอด + สถานะชิดขวา (โครงเดียวกับแผงเงินหน้าออเดอร์) */}
            <div className="ml-auto flex flex-col items-end gap-2.5">
              <div className="text-right">
                <div className={`text-[11px] font-bold uppercase tracking-[0.09em] ${money.hot ? "text-rose-500" : "text-slate-400"}`}>
                  {money.label}
                </div>
                <div className={`dkb-num mt-0.5 text-[1.6rem] ${money.hot ? "text-rose-600" : ""}`}>{formatPrice(total)}</div>
                <p className={`mt-1 text-[11px] font-semibold ${money.subTone ?? "text-slate-400"}`}>{money.sub}</p>
              </div>
              <span className={`inline-flex rounded-xl px-3.5 py-2 text-sm font-bold ring-1 ${QUOTE_STYLES[st]}`}>{st}</span>
            </div>
          </div>

          {/* บรรทัดล่าง = ปุ่ม — งานรองอยู่ซ้าย (เงียบ) · "ขั้นถัดไป" อยู่ขวา เด่นอันเดียว */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!locked && (
              <button type="button" onClick={declineQuote} className={HBTN} title="ปิดใบนี้เป็น “ไม่รับ” พร้อมเก็บเหตุผล">
                🚫 ลูกค้าไม่รับ
              </button>
            )}
            {customerUrl && (
              <a href={customerUrl} target="_blank" rel="noreferrer" className={HBTN} title="เปิดหน้าที่ลูกค้าเห็น">
                👁 ดูใบที่ลูกค้าเห็น
              </a>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {saved && (
                <span className="text-[12px] font-semibold" style={{ color: "var(--dk-mint-ink)" }}>
                  บันทึกแล้ว
                </span>
              )}
              {locked ? (
                <Btn tone="yolk" href={`/admin/orders/${encodeURIComponent(quote.orderId!)}`}>
                  เปิดออเดอร์ {quote.orderId}
                </Btn>
              ) : (
                <Btn tone={waiting ? "yolk" : "navy"} onClick={acceptQuote} disabled={busy || !quote.items.length}>
                  {busy ? "กำลังสร้างออเดอร์…" : waiting ? "✅ ลูกค้าตกลงแล้ว — สร้างออเดอร์" : "ลูกค้าตกลง — สร้างออเดอร์"}
                </Btn>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ── ซ้าย: งาน ── */}
          <div className="px-4 py-6 sm:px-6">
            {/* 👤 ลูกค้า */}
            <div className="mb-5">
              <GH t="sky">👤 ลูกค้า / จัดส่ง</GH>
              <div className={`mt-2 space-y-2.5 ${soft("sky")}`}>
                {/* ⚠️ คอลัมน์เบอร์ต้องกว้าง 7rem + gap-2 — รายชื่อที่เด้งลงมายืดคลุมช่องเบอร์ด้วย (right-[-7.5rem]) */}
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                  <div className="min-w-0">
                    <p className={MINI}>ชื่อลูกค้า</p>
                    {locked ? (
                      <input value={quote.customer} disabled className={`${INP} font-bold`} />
                    ) : (
                      /* พิมพ์ชื่อ/เบอร์ ≥ 2 ตัว → ค้นคลังผู้ติดต่อ ~28,000 ราย เลือกแล้วเติมชื่อ/เบอร์/ที่อยู่ให้ทั้งชุด
                         (ชุดเดียวกับหน้าออเดอร์ — คนกรอกคือคนเดียวกัน ไม่ต้องจำว่าหน้าไหนพิมพ์เองหน้าไหนค้นได้) */
                      <CustomerContactInput
                        value={nameDraft ?? quote.customer}
                        onChange={setNameDraft}
                        onBlur={() => {
                          if (nameDraft !== null && nameDraft !== quote.customer) void persist({ ...quote, customer: nameDraft });
                          setNameDraft(null);
                        }}
                        onPick={(c) => {
                          setNameDraft(null);
                          void persist({
                            ...quote,
                            customer: c.name || quote.customer,
                            phone: c.phone || quote.phone,
                            address: c.address || quote.address,
                            contactId: c.id,
                          });
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <p className={MINI}>เบอร์โทร</p>
                    <input
                      value={quote.phone}
                      disabled={locked}
                      onChange={(e) => patch({ phone: e.target.value.replace(/[^\d\-+ ]/g, "") })}
                      inputMode="tel"
                      placeholder="08x-xxx-xxxx"
                      className={`${INP} tabular-nums`}
                    />
                  </div>
                </div>
                <div>
                  <p className={MINI}>ที่อยู่จัดส่ง</p>
                  <textarea
                    value={quote.address ?? ""}
                    disabled={locked}
                    onChange={(e) => patch({ address: e.target.value })}
                    rows={2}
                    placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                    className={`${INP} resize-y`}
                  />
                </div>
                {/* แถวลงมือทำต่อ — สถานะการผูกผู้ติดต่อ · คัดลอกไปตอบ LINE · โทรหาลูกค้า */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {quote.contactId ? (
                    <ContactChip contactId={quote.contactId} onUnlink={() => patch({ contactId: undefined })} />
                  ) : (
                    !locked && <span className="text-[11px] text-slate-400">💡 พิมพ์ชื่อเพื่อค้นผู้ติดต่อ — ตกลงแล้วแต้มเข้าคนนี้ตั้งแต่ออเดอร์แรก</span>
                  )}
                  {(quote.customer || quote.phone || quote.address) && (
                    <CopyChip
                      label="คัดลอกที่อยู่จัดส่ง"
                      text={() =>
                        [
                          [quote.customer, quote.phone && `โทร. ${formatPhone(quote.phone)}`].filter(Boolean).join("  "),
                          quote.address,
                        ]
                          .filter(Boolean)
                          .join("\n")
                      }
                    />
                  )}
                  {quote.phone && (
                    <a
                      href={`tel:${quote.phone.replace(/\D/g, "")}`}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                    >
                      📞 {formatPhone(quote.phone)}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* 🎨 รายการที่เสนอ */}
            <div className="mb-5">
              <GH t="indigo">🎨 รายการที่เสนอ · {nItems}</GH>

              <div className="mt-2 space-y-3">
                {quote.items.map((it, i) => (
                  <div
                    key={i}
                    className={`overflow-hidden rounded-2xl border-2 shadow-[0_2px_10px_rgba(15,23,42,0.05)] ${
                      i % 2 === 0 ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50/40"
                    }`}
                  >
                    {/* แถบหัวรายการ — สลับสีคู่/คี่ ให้ไล่สายตาแยกรายการได้ง่ายเวลามีหลายรายการ */}
                    <div
                      className={`flex items-center justify-between gap-2 border-b-2 px-4 py-2 ${
                        i % 2 === 0 ? "border-slate-100 bg-slate-50" : "border-sky-100 bg-sky-100/60"
                      }`}
                    >
                      <span className={`shrink-0 text-xs font-extrabold ${i % 2 === 0 ? "text-indigo-800" : "text-sky-800"}`}>
                        รายการที่ {i + 1}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="dkb-num text-[15px]">{formatPrice(it.qty * it.unitPrice)}</span>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => patch({ items: quote.items.filter((_, k) => k !== i) })}
                            title="ลบรายการนี้"
                            className="rounded-lg px-2 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-50"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
                      {/* ภาพลายที่แนบมาจากตอนหยิบของ (ถ้ามี) */}
                      <div className="flex flex-wrap gap-1">
                        {(it.artworkUrls ?? []).slice(0, 4).map((u, k) => (
                          <span key={k} className="relative block">
                            <a href={u} target="_blank" rel="noreferrer" className="relative block" title={[artworkSide(it, u), artQtyOf(it, u, k) ? `ลายที่ ${k + 1} × ${artQtyOf(it, u, k)} ชิ้น` : `ลายที่ ${k + 1}`, artSizeOf(it, u, k) ? `📐 ${artSizeText(artSizeOf(it, u, k)!)}` : ""].filter(Boolean).join(" · ")}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt={artworkSide(it, u) ?? ""} className="h-9 w-9 rounded-md object-cover ring-1 ring-slate-200" />
                              {/* งานพิมพ์ 2 ด้าน — ป้ายหน้า/หลังด้านบน · 🔢 จำนวนต่อลายด้านล่าง */}
                              {artworkSide(it, u) && (
                                <span className="absolute left-0 right-0 top-0 rounded-t-md bg-slate-800/85 text-center text-[7px] font-bold leading-tight text-white">
                                  {artworkSide(it, u) === "ด้านหลัง" ? "หลัง" : "หน้า"}
                                </span>
                              )}
                              {artQtyOf(it, u, k) ? (
                                <span className="absolute bottom-0 left-0 right-0 rounded-b-md bg-slate-900/75 text-center text-[8px] font-bold leading-tight text-white">
                                  ×{artQtyOf(it, u, k)}
                                </span>
                              ) : null}
                            </a>
                            {/* ✕ เอารูปออกจากใบ (ใบที่กลายเป็นออเดอร์แล้วล็อกทั้งรายการ ไม่มีปุ่ม) */}
                            {!locked && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`เอารูปลายที่ ${k + 1} ออกจากรายการนี้?\n(ไฟล์ยังอยู่ในคลัง ลบเฉพาะการผูกกับใบเสนอราคา)`)) removeArtwork(i, u);
                                }}
                                title="เอารูปนี้ออกจากใบเสนอราคา"
                                aria-label="เอารูปลายนี้ออก"
                                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow transition hover:bg-rose-600"
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                        {!it.artworkUrls?.length && (
                          <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-sm text-slate-300">🖼️</span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-2">
                        <div>
                          <p className={MINI}>ชื่องาน</p>
                          <input
                            value={it.name}
                            disabled={locked}
                            onChange={(e) => patchItem(i, { name: e.target.value })}
                            placeholder="ชื่องาน"
                            className={`${INP} font-bold`}
                          />
                        </div>
                        <div>
                          <p className={MINI}>สเปคที่เสนอ</p>
                          <textarea
                            value={it.selections ?? ""}
                            disabled={locked}
                            onChange={(e) => patchItem(i, { selections: e.target.value })}
                            rows={2}
                            placeholder="ขนาด · วัสดุ · จำนวนสี · รายละเอียดที่ตกลงกับลูกค้า"
                            className={`${INP} resize-y`}
                          />
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="block w-24">
                            <span className={`block ${MINI}`}>จำนวน</span>
                            <input
                              type="number"
                              min={1}
                              value={it.qty}
                              disabled={locked}
                              onChange={(e) => patchItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                              className={`${INP} text-center font-bold tabular-nums`}
                            />
                          </label>
                          <label className="block w-32">
                            <span className={`block ${MINI}`}>ราคา/หน่วย</span>
                            <input
                              type="number"
                              min={0}
                              value={it.unitPrice}
                              disabled={locked}
                              onChange={(e) => patchItem(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                              className={`${INP} text-right font-bold tabular-nums`}
                            />
                          </label>
                          <span className={`pb-1.5 text-[11px] ${faint}`}>
                            {it.qty} × {formatPrice(it.unitPrice)} = <b className="text-slate-700">{formatPrice(it.qty * it.unitPrice)}</b>
                          </span>
                        </div>
                        {/* 📐 งานแบ่งแผ่น/เซ็ต — จำนวนที่เสนอไม่ใช่จำนวนชิ้นงาน บอกยอดชิ้นจริงให้เห็นคู่กับราคา (เช่น สั่ง 2 แผ่น A3 ตัด A4 = 4 ชิ้น) */}
                        {itemPiecesLine(it, prodById[it.productId]) && (
                          <p className="mt-1.5 text-[12px] font-bold text-sky-700">{itemPiecesLine(it, prodById[it.productId])}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {!quote.items.length && (
                  <p className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                    ยังไม่มีรายการ — กดปุ่มด้านล่างเพื่อเพิ่มงานที่จะเสนอ
                  </p>
                )}
              </div>

              {/* ตัวเพิ่มรายการชุดเดียวกับหน้าออเดอร์งานพิเศษ — กรอกเอง (มีคลังสินค้าพิเศษ/แนบภาพลาย) หรือหยิบจากหน้าร้านจริง */}
              {!locked && (
                <ItemAdder
                  draftKey={`quote.${quote.id}`}
                  target="ใบเสนอราคา"
                  actor={meName}
                  onAdd={(item) => patch({ items: [...quote.items, item] })}
                  onShopAdd={() => {
                    setQuoteTarget({ id: quote.id, customer: quote.customer });
                    window.open("/products", "_blank", "noopener");
                  }}
                />
              )}
            </div>

            {/* 💰 ยอดเงิน — ตัวเลขอยู่คอลัมน์ขวาคอลัมน์เดียว (tabular) หลักตรงกันไล่ลงถึงยอดรวม */}
            <div>
              <GH t="emerald">💰 ยอดเงิน</GH>
              <div className={`mt-2 ${soft("emerald")}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className={muted}>รวมสินค้า · {qty} ชิ้น</span>
                  <span className="font-semibold tabular-nums text-slate-800">{formatPrice(subtotal)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  {/* เลือกวิธีส่งจากตั้งค่าร้าน — ราคาเติมอัตโนมัติ แล้วแก้ตัวเลขต่อได้ (แบบเดียวกับหน้าออเดอร์) */}
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 ${muted}`}>ค่าจัดส่ง</span>
                    {locked ? (
                      quote.shippingLabel && <span className="text-xs text-slate-600">{quote.shippingLabel}</span>
                    ) : (
                      <select
                        value={shipMethods.find((m) => m.name === quote.shippingLabel)?.id ?? ""}
                        onChange={(e) => {
                          const m = shipMethods.find((x) => x.id === e.target.value);
                          if (!m) return;
                          patch({ shippingLabel: m.name, shippingCost: Math.max(0, m.price) });
                        }}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                      >
                        <option value="" disabled>
                          {quote.shippingLabel || "เลือกวิธีส่ง…"}
                        </option>
                        {shipMethods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — ฿{m.price}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={quote.shippingCost}
                    disabled={locked}
                    onChange={(e) => patch({ shippingCost: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold tabular-nums text-slate-800 focus:border-amber-300 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
                {/* 🏅 ส่วนลดระดับสมาชิก — เซิร์ฟเวอร์คิดจากผู้ติดต่อที่ผูก แอดมินปิดได้ต่อใบ (เช่น ราคาที่เสนอรวมส่วนลดไว้แล้ว) */}
                {quote.memberTier && (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className={`flex items-center gap-1.5 ${quote.memberTierOff ? "text-slate-400 line-through" : "text-emerald-700"}`}>
                      {quote.memberTier.icon} ส่วนลดสมาชิก {quote.memberTier.name} ({quote.memberTier.pct}%)
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => patch({ memberTierOff: !quote.memberTierOff })}
                          className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 no-underline ring-1 ring-slate-200 transition hover:bg-slate-50"
                          title={quote.memberTierOff ? "เปิดใช้ส่วนลดสมาชิกสำหรับใบนี้" : "ไม่คิดส่วนลดสมาชิกในใบนี้ (เช่น ราคาที่เสนอรวมส่วนลดไว้แล้ว)"}
                        >
                          {quote.memberTierOff ? "เปิดใช้" : "ไม่ใช้"}
                        </button>
                      )}
                    </span>
                    <span className={`font-semibold tabular-nums ${quote.memberTierOff ? "text-slate-400 line-through" : "text-emerald-600"}`}>
                      −{formatPrice(quote.memberTierOff ? Math.floor((subtotal * quote.memberTier.pct) / 100) : memberAmount)}
                    </span>
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className={muted}>{quote.memberTier ? "ส่วนลดเพิ่ม (แอดมิน)" : "ส่วนลด"}</span>
                  <span className="flex items-center gap-1 font-semibold text-rose-500">
                    −
                    <input
                      type="number"
                      min={0}
                      value={quote.discount ?? 0}
                      disabled={locked}
                      onChange={(e) => patch({ discount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold tabular-nums text-rose-600 focus:border-amber-300 focus:outline-none disabled:bg-slate-50"
                    />
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-sm font-bold text-slate-700">ยอดรวมที่เสนอ</span>
                  <span className="dkb-num text-[1.15rem]">{formatPrice(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ขวา: ข้อมูล ── */}
          <div className="space-y-4 border-t border-slate-200/70 bg-slate-50/50 px-4 py-5 lg:border-l lg:border-t-0">
            {/* 📅 ยืนราคาถึง */}
            <div>
              <GH t="orange">📅 ยืนราคาถึง</GH>
              <div className={`mt-2 ${soft("orange")}`}>
                <input
                  type="date"
                  value={quote.expiresAt ? quote.expiresAt.slice(0, 10) : ""}
                  disabled={locked}
                  onChange={(e) => patch({ expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
                  className={INP}
                />
                {left !== null && !locked && (
                  <p className={`mt-1.5 text-[11px] font-bold ${left < 0 ? "text-rose-600" : left <= 3 ? "text-orange-600" : "text-slate-400"}`}>
                    {left < 0 ? `หมดอายุมาแล้ว ${Math.abs(left)} วัน — ขยายวันก่อนส่งให้ลูกค้าอีกครั้ง` : `เหลืออีก ${left} วัน`}
                  </p>
                )}
              </div>
            </div>

            {/* 🔗 ลิงก์สำหรับลูกค้า */}
            <div>
              <GH t="violet">🔗 ลิงก์สำหรับลูกค้า</GH>
              <div className={`mt-2 ${soft("violet")}`}>
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
                  className={`mt-2 min-h-[44px] w-full rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${
                    copied ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                  }`}
                >
                  {copied ? "✓ คัดลอกแล้ว — วางในแชทได้เลย" : "🔗 คัดลอกลิงก์ส่งลูกค้า"}
                </button>
                <p className={`mt-1.5 text-[10.5px] leading-relaxed ${faint}`}>
                  คัดลอกครั้งแรกจะเปลี่ยนสถานะเป็น “ส่งให้ลูกค้าแล้ว” · ลูกค้ากดตกลงเองได้จากลิงก์นี้
                </p>
              </div>
            </div>

            {/* 📝 เงื่อนไขที่พิมพ์ลงใบ */}
            <div>
              <GH t="rose">📝 เงื่อนไข / หมายเหตุบนใบ</GH>
              <div className={`mt-2 ${soft("rose")}`}>
                <textarea
                  value={quote.note ?? ""}
                  disabled={locked}
                  onChange={(e) => patch({ note: e.target.value })}
                  rows={4}
                  placeholder="เช่น ราคานี้ยังไม่รวม VAT · ใช้เวลาผลิต 7–10 วันหลังอนุมัติแบบ · มัดจำ 50% ก่อนเริ่มงาน"
                  className={`${INP} resize-y`}
                />
                <p className={`mt-1 text-[10.5px] ${faint}`}>ข้อความนี้ลูกค้าเห็นในใบเสนอราคา</p>
              </div>
            </div>

            {quote.declineReason && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
                🚫 ลูกค้าไม่รับ — {quote.declineReason}
              </p>
            )}

            {/* 🕘 ประวัติ */}
            <div>
              <GH t="slate">🕘 ประวัติการทำงาน{quote.log?.length ? ` (${quote.log.length})` : ""}</GH>
              <LogTimeline log={quote.log} empty="ยังไม่มีประวัติ — จะบันทึกอัตโนมัติเมื่อมีการเปลี่ยนแปลง" />
            </div>

            {!locked && (
              <button
                type="button"
                onClick={removeQuote}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                🗑 ลบใบเสนอราคานี้
              </button>
            )}
          </div>
        </div>
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

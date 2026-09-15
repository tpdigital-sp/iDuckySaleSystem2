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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import { artQtyOf, artSizeOf, artSizeText, formatPrice, productPath, type Product } from "@/lib/products";
import { fetchProductsByIds } from "@/lib/product-repo";
import { itemPiecesLine, itemUnitYield } from "@/lib/item-yield";
import { SelDetails } from "@/components/admin/SelDetails";
import { applySelectionsDraft, selectionsDraft, selectionsDraftChanged } from "@/lib/edit-selections";
import {
  applyReplaceMarker,
  cartSelectionsOf,
  isShopLine,
  orderItemQtyChange,
  qtyLockedByArea,
  readReplaceMarker,
  writeReplaceMarker,
} from "@/lib/order-item-qty";
import { cartItemKey } from "@/lib/cart-context";
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
  /* ─────────────────────────────────────────────────────────────────────────
   * 🧾 การ์ดรายการ "ชุดเดียวกับหน้าออเดอร์" — พนักงานแจ้ง 15 ก.ย. 69 ว่าแก้อะไรในใบเสนอราคาไม่ได้เท่าหน้าคำสั่งซื้อ
   * (QT-260914-8743) · คนทำงานสองหน้านี้คือคนเดียวกัน ปุ่มต้องอยู่ที่เดิมและทำงานเหมือนกันเป๊ะ:
   *   ✏️ แก้ชื่อ/รายละเอียด (ทีละหัวข้อ ผ่าน lib/edit-selections — เขียนกลับทั้ง sel และ selections)
   *   🛠 แก้ตัวเลือก (หน้าร้าน) — ไปเลือกใหม่ที่หน้าสินค้า ได้ราคา/ตัวเลือกจริง แล้วแทนที่รายการเดิม
   *   🔢 จำนวน [−][+] คิดราคาขั้นบันได/สลับเรทใหม่ให้เหมือนตะกร้า · 💬 ราคา/หน่วยกดแก้ได้
   *   📐 บรรทัด "สั่ง N แผ่น ได้ X ชิ้น" ตั้งตัวคูณเองได้
   * ───────────────────────────────────────────────────────────────────────── */
  /** กาง/ยุบการ์ดรายการ (ยุบ = รายละเอียดตัดเหลือ 2 บรรทัดเหมือนหน้าออเดอร์) */
  const [itemOpen, setItemOpen] = useState<Record<number, boolean>>({});
  const [editSel, setEditSel] = useState<number | null>(null);
  const [selDraft, setSelDraft] = useState("");
  /** ชื่อรายการระหว่างแก้ (คนละตัวกับ nameDraft ที่เป็นชื่อลูกค้า) */
  const [itemNameDraft, setItemNameDraft] = useState("");
  const [editPrice, setEditPrice] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  /** ข้อความในช่องจำนวนระหว่างพิมพ์ (บันทึกตอนออกจากช่อง/Enter) */
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  /** ตั้ง "1 หน่วย = กี่ชิ้น" ของรายการไหนอยู่ */
  const [editPer, setEditPer] = useState<number | null>(null);
  const [perDraft, setPerDraft] = useState("");
  /** กันแทนที่รายการซ้ำระหว่างรอผลบันทึกของรอบก่อน */
  const replaceBusy = useRef(false);
  const actor = meName || "แอดมิน";
  const productOfItem = (id: string): Product | undefined => prodById[id];

  /** บันทึกพร้อมลงประวัติ (ใบเสนอราคาไม่มีปุ่ม Save แยก — บันทึกทุกครั้งที่แก้เสร็จเหมือนเดิม) */
  const persistLog = (next: Quote, what: string, detail?: string) => void persist(withQuoteLog(next, actor, what, detail));

  /**
   * ✏️ บันทึกชื่อ + รายละเอียดจากช่องแก้ (ช่องเดียวกัน เหมือนหน้าออเดอร์)
   * ⚠️ ทุกจออ่านตัวเลือกแบบหัวข้อ (sel) ก่อนข้อความ — ต้องเขียนกลับทั้ง sel และ selections
   *    ไม่งั้น "แก้แล้วไม่เปลี่ยน" (ดู lib/edit-selections)
   */
  function saveItemSelections(itemIndex: number, text: string, name?: string) {
    if (!quote) return;
    const cur = quote.items[itemIndex];
    setEditSel(null);
    if (!cur) return;
    const newName = (name ?? cur.name).trim() || cur.name;
    const nameChanged = newName !== cur.name;
    const selChanged = selectionsDraftChanged(cur, text);
    if (!nameChanged && !selChanged) return;
    const p: Partial<OrderItem> = selChanged ? applySelectionsDraft(cur, text) : {};
    if (nameChanged) p.name = newName;
    const items = quote.items.map((it, k) => (k === itemIndex ? { ...it, ...p } : it));
    const what = nameChanged && selChanged ? "แก้ชื่อ+รายละเอียดรายการ" : nameChanged ? "แก้ชื่อรายการ" : "แก้รายละเอียดรายการ";
    persistLog({ ...quote, items }, what, nameChanged ? `${cur.name} → ${newName}` : cur.name);
  }

  /** 🔢 แก้จำนวน — สินค้าจากหน้าร้านคิดราคาขั้นบันได/สลับเรทให้ใหม่เหมือนตะกร้า (ตัวเดียวกับหน้าออเดอร์) */
  function changeItemQty(itemIndex: number, nextQty: number) {
    if (!quote) return;
    const it = quote.items[itemIndex];
    if (!it) return;
    const r = orderItemQtyChange(quote.items, itemIndex, nextQty, productOfItem);
    if (!r) return;
    const items = quote.items.map((x, k) => (k === itemIndex ? { ...x, ...r.patch } : x));
    const newQty = r.patch.qty ?? it.qty;
    const unit = r.unitPrice ?? it.unitPrice;
    const notes = [
      `${it.qty.toLocaleString("th-TH")} → ${newQty.toLocaleString("th-TH")}`,
      r.unitPrice !== undefined ? `ราคา/หน่วย ${formatPrice(it.unitPrice)} → ${formatPrice(r.unitPrice)}` : "",
      r.rateChanged ? `เรท ${r.rateChanged.from} → ${r.rateChanged.to}` : "",
      r.designCapped ? `โควตาลายเหลือ ${r.designCapped} ลาย` : "",
      unit > 0 ? `= ${formatPrice(unit * newQty)}` : "",
    ].filter(Boolean);
    persistLog({ ...quote, items }, "แก้จำนวน", `${it.name}: ${notes.join(" · ")}`);
  }

  /** 💬 บันทึกราคา/หน่วยที่ตีไว้ */
  function saveItemPrice(itemIndex: number, text: string) {
    setEditPrice(null);
    if (!quote) return;
    const it = quote.items[itemIndex];
    if (!it) return;
    const v = Math.max(0, Math.round(Number(text) || 0));
    if (v === it.unitPrice) return;
    const items = quote.items.map((x, k) => (k === itemIndex ? { ...x, unitPrice: v } : x));
    persistLog({ ...quote, items }, "แก้ราคา/หน่วย", `${it.name}: ${formatPrice(it.unitPrice)} → ${formatPrice(v)} (= ${formatPrice(v * it.qty)})`);
  }

  /** 📐 ตั้ง "1 เซ็ต/แผ่น = กี่ชิ้น" ให้รายการนี้ (แช่ลงใบ ไม่ไปแก้สินค้า — ตกลงแล้วติดไปกับออเดอร์ด้วย) */
  function saveItemPerUnit(itemIndex: number, per: number) {
    setEditPer(null);
    setPerDraft("");
    if (!quote) return;
    const it = quote.items[itemIndex];
    if (!it || !(per >= 1) || per > 99999) return;
    const y = itemUnitYield(it, prodById[it.productId]);
    const unit = it.unitYield?.unit || y?.unit || "หน่วย";
    const piece = it.unitYield?.piece || y?.piece || "ชิ้น";
    const next = Math.floor(per);
    if (next === (it.unitYield?.per ?? 0)) return;
    const items = quote.items.map((x, k) => (k === itemIndex ? { ...x, unitYield: { per: next, piece, unit } } : x));
    persistLog({ ...quote, items }, "ตั้งจำนวนต่อหน่วย", `${it.name} — 1 ${unit} = ${next} ${piece}`);
  }

  /**
   * 🛠 แก้ตัวเลือกของรายการที่หยิบจากหน้าร้าน — ทางเดียวกับหน้าออเดอร์ทุกขั้น:
   * ใส่บรรทัดนี้ลงตะกร้าในเครื่องแอดมินก่อน (สเปค/จำนวน/ลายเดิมครบ) → เปิดหน้าสินค้าโหมดแก้ไข (?edit=)
   * → ตั้ง "โหมดหยิบใส่ใบเสนอราคา" + ตัวบอกว่าให้แทนที่รายการไหน
   * พอของใหม่เข้าใบจากหน้าตะกร้า หน้านี้ถอดรายการเดิมออกให้เอง (ดู useEffect ด้านล่าง)
   */
  function editItemOptionsInShop(itemIndex: number) {
    if (!quote) return;
    const it = quote.items[itemIndex];
    if (!it) return;
    const p = productOfItem(it.productId);
    if (!isShopLine(p, it)) return;
    try {
      const selections = cartSelectionsOf(it);
      const key = cartItemKey(it.productId, selections);
      const raw = localStorage.getItem("iducky-cart-v1");
      const cart = (() => {
        try {
          const v = JSON.parse(raw ?? "[]");
          return Array.isArray(v) ? (v as { key: string }[]) : [];
        } catch {
          return [];
        }
      })();
      const line = { key, productId: it.productId, selections, qty: it.qty, unitPrice: it.unitPrice };
      localStorage.setItem("iducky-cart-v1", JSON.stringify([...cart.filter((c) => c?.key !== key), line]));
      setQuoteTarget({ id: quote.id, customer: quote.customer });
      writeReplaceMarker({
        kind: "quote",
        orderId: quote.id,
        index: itemIndex,
        productId: it.productId,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        itemCount: quote.items.length,
        at: Date.now(),
      });
    } catch {
      setErr("⚠️ เปิดโหมดแก้ไขไม่ได้ — เบราว์เซอร์ปิดการเก็บข้อมูลในเครื่อง");
      return;
    }
    window.open(`${productPath(p)}?edit=${encodeURIComponent(cartItemKey(it.productId, cartSelectionsOf(it)))}`, "_blank", "noopener");
  }

  /* ของใหม่จากหน้าร้านเข้าใบแล้ว → หิ้วภาพลาย/หมายเหตุจากรายการเดิมไปให้ แล้วถอดรายการเดิมออก (เหมือนตะกร้าตอนบันทึกแก้ไข) */
  useEffect(() => {
    if (!quote || quote.orderId || replaceBusy.current) return;
    const m = readReplaceMarker();
    if (!m || m.kind !== "quote" || m.orderId !== quote.id) return;
    const r = applyReplaceMarker(quote.items, m);
    if (!r) return;
    replaceBusy.current = true;
    writeReplaceMarker(null);
    void persist(
      withQuoteLog(
        { ...quote, items: r.items },
        meName || "แอดมิน",
        "แก้ตัวเลือกจากหน้าร้าน",
        `${r.old.name} ×${r.old.qty} @${formatPrice(r.old.unitPrice)} → ${r.fresh.name} ×${r.fresh.qty} @${formatPrice(r.fresh.unitPrice)} (แทนที่รายการเดิม)`
      )
    );
    setTimeout(() => {
      replaceBusy.current = false;
    }, 3000);
  }, [quote, persist, meName]);

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

            {/* 🎨 รายการที่เสนอ — การ์ด/ปุ่มชุดเดียวกับหน้าออเดอร์ (พนักงานขอ 15 ก.ย. 69 "ให้เหมือนกับหน้าคำสั่งซื้อ") */}
            <div className="mb-5">
              <GH t="indigo">🎨 รายการที่เสนอ · {nItems}</GH>

              {/* หัวตาราง (จอกว้างพอจะเรียงคอลัมน์เดียวกันได้) — อ่านรายการแบบใบสั่งงาน เหมือนหน้าออเดอร์ */}
              <div className="mt-3 hidden items-center gap-3 px-4 text-[11px] font-bold uppercase tracking-wide text-slate-400 xl:flex">
                <span className="w-6 shrink-0 text-center">#</span>
                <span className="w-20 shrink-0 text-center">รูป</span>
                <span className="min-w-0 flex-1">ชื่อสินค้า / รายละเอียด</span>
                <span className="w-24 shrink-0 text-center">จำนวน</span>
                <span className="w-28 shrink-0 text-right">ราคา/หน่วย</span>
                <span className="w-24 shrink-0 text-right">ยอดรวม</span>
              </div>

              <div className="mt-1.5 space-y-4">
                {quote.items.map((it, i) => {
                  const prod = prodById[it.productId];
                  const shopLine = isShopLine(prod, it);
                  const areaLocked = qtyLockedByArea(prod, it);
                  /* ใบเสนอราคามีไม่กี่รายการและสเปคคือเนื้อหาหลักของใบ — กางไว้ก่อน (หน้าออเดอร์มีของอย่างอื่นเยอะกว่าจึงยุบ) */
                  const open = itemOpen[i] ?? true;
                  const arts = it.artworkUrls ?? [];
                  const piecesLine = itemPiecesLine(it, prod);
                  const y = itemUnitYield(it, prod);
                  const perUnit = it.unitYield?.unit || y?.unit || "หน่วย";
                  const perPiece = it.unitYield?.piece || y?.piece || "ชิ้น";
                  const toggle = () => setItemOpen((cur) => ({ ...cur, [i]: !open }));
                  return (
                    <div
                      key={`${it.productId}-${i}`}
                      className={`overflow-hidden rounded-2xl border-2 shadow-[0_2px_10px_rgba(15,23,42,0.05)] ${
                        i % 2 === 0 ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50/40"
                      }`}
                    >
                      {/* แถบหัวรายการ — สลับสีคู่/คี่ ให้ไล่สายตาแยกรายการได้ง่ายเวลามีหลายรายการ */}
                      <div
                        className={`flex items-center justify-between gap-2 border-b-2 px-4 py-2 ${
                          open
                            ? "border-indigo-100 bg-indigo-50/70"
                            : i % 2 === 0
                              ? "border-slate-100 bg-slate-50"
                              : "border-sky-100 bg-sky-100/60"
                        }`}
                      >
                        <span className={`shrink-0 whitespace-nowrap text-xs font-extrabold ${i % 2 === 0 ? "text-indigo-800" : "text-sky-800"}`}>
                          รายการที่ {i + 1} / {quote.items.length}
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-xs font-bold text-slate-400">{it.name}</span>
                          <span className="dkb-num shrink-0 text-[15px]">{formatPrice(it.qty * it.unitPrice)}</span>
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`ลบ “${it.name}” ออกจากใบเสนอราคา?\n\n⚠️ ยอดที่เสนอจะลดลง ${formatPrice(it.qty * it.unitPrice)}`))
                                  persistLog({ ...quote, items: quote.items.filter((_, k) => k !== i) }, "ลบรายการ", `${it.name} ×${it.qty}`);
                              }}
                              title="ลบรายการนี้ออกจากใบเสนอราคา (ระบบลงประวัติทุกครั้ง)"
                              className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              🗑 ลบรายการ
                            </button>
                          )}
                        </span>
                      </div>

                      <div className="p-4">
                        {/* แถวรายการ — # · รูป · รายละเอียด · จำนวน · ราคา/หน่วย · ยอดรวม (พับทั้งชุดเมื่อจอแคบ) */}
                        <div className="flex flex-wrap items-start gap-3">
                          <button
                            type="button"
                            onClick={toggle}
                            title={open ? "ยุบรายการนี้" : "กางรายการนี้"}
                            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100"
                          >
                            {i + 1}
                          </button>
                          {/* รูปตัวอย่างในแถว — กดเพื่อกาง แล้วจัดการลายทั้งหมดด้านล่าง */}
                          <button type="button" onClick={toggle} className="w-20 shrink-0 text-left" title={open ? "ยุบรายการนี้" : "กางเพื่อจัดการภาพลาย"}>
                            {arts[0] ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={arts[0]} alt={it.name} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                            ) : (
                              <span className="grid h-20 w-20 place-items-center rounded-lg bg-slate-50 text-xl text-slate-300 ring-1 ring-slate-200">🖼️</span>
                            )}
                            <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">
                              {arts.length ? `🎨 ลาย ${arts.length}` : "ยังไม่มีลาย"}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1 basis-64">
                            <button type="button" onClick={toggle} className="text-left text-sm font-bold text-slate-800 hover:text-indigo-700">
                              {it.name} <span className="text-xs font-normal text-slate-400">{open ? "▴" : "▾"}</span>
                            </button>
                            {editSel === i ? (
                              // ✏️ ช่องแก้ชื่อ + รายละเอียด ชุดเดียวกับหน้าออเดอร์ — บันทึกเมื่อโฟกัสออกจากทั้งกล่อง · Cmd/Ctrl+Enter = บันทึก · Esc = ยกเลิก
                              <div
                                className="mt-1 space-y-1"
                                onBlur={(e) => {
                                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                                  saveItemSelections(i, selDraft, itemNameDraft);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditSel(null);
                                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveItemSelections(i, selDraft, itemNameDraft);
                                }}
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  value={itemNameDraft}
                                  onChange={(e) => setItemNameDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
                                      e.preventDefault();
                                      saveItemSelections(i, selDraft, itemNameDraft);
                                    }
                                  }}
                                  placeholder={it.name}
                                  aria-label="ชื่อรายการ"
                                  className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                />
                                <textarea
                                  value={selDraft}
                                  onChange={(e) => setSelDraft(e.target.value)}
                                  rows={5}
                                  placeholder="รายละเอียดงาน เช่น ขนาด · วัสดุ · จำนวนสี"
                                  className="w-full resize-y rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[11px] leading-snug text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                />
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  ช่องบน = ชื่อรายการ (ว่าง = คงชื่อเดิม) · รายละเอียดบรรทัดละหัวข้อ “หัวข้อ: ค่า” · คลิกนอกช่องเพื่อบันทึก · Esc = ยกเลิก · ระบบลงประวัติว่าใครแก้
                                </p>
                              </div>
                            ) : (
                              <div className={`mt-0.5 text-[11px] leading-snug text-slate-500 ${open ? "" : "line-clamp-2"}`}>
                                <SelDetails sel={it.sel} text={it.selections} />
                                {!locked && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelDraft(selectionsDraft(it));
                                      setItemNameDraft(it.name);
                                      setEditSel(i);
                                      setItemOpen((cur) => ({ ...cur, [i]: true }));
                                    }}
                                    title="แก้ชื่อ/รายละเอียดของรายการนี้ (จำนวนแก้ที่ช่องจำนวน · ราคาแก้ที่ช่องราคา)"
                                    className="mt-0.5 whitespace-nowrap rounded px-1 text-[10px] font-bold text-amber-600 transition hover:bg-amber-50"
                                  >
                                    ✏️ แก้ชื่อ/รายละเอียด
                                  </button>
                                )}
                                {/* 🛠 แก้ตัวเลือก — เฉพาะรายการที่หยิบจากหน้าร้าน (มีสินค้าจริง + ตัวเลือกแบบหัวข้อ)
                                    รายการที่กรอกชื่อ/ราคาเองไม่มีปุ่มนี้ เหมือนหน้าออเดอร์ */}
                                {!locked && shopLine && (
                                  <button
                                    type="button"
                                    onClick={() => editItemOptionsInShop(i)}
                                    title="เปิดหน้าสินค้าพร้อมตัวเลือก/จำนวน/ลายเดิม (เหมือนปุ่มแก้ไขในตะกร้า) — แก้แล้วกด “ใส่ใบเสนอราคา” ระบบจะแทนที่รายการนี้ให้"
                                    className="ml-1 mt-0.5 whitespace-nowrap rounded px-1 text-[10px] font-bold text-sky-600 transition hover:bg-sky-50"
                                  >
                                    🛠 แก้ตัวเลือก (หน้าร้าน)
                                  </button>
                                )}
                              </div>
                            )}

                            {/* 📐 งานแบ่งแผ่น/เซ็ต — จำนวนที่เสนอไม่ใช่จำนวนชิ้นงาน บอกยอดชิ้นจริงคู่กับราคา · กด ✏️ แก้ตัวคูณได้ */}
                            {editPer === i ? (
                              <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] font-bold text-sky-800">
                                📐 1 {perUnit} =
                                <input
                                  autoFocus
                                  type="number"
                                  min={1}
                                  value={perDraft}
                                  onChange={(e) => setPerDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditPer(null);
                                    if (e.key === "Enter") saveItemPerUnit(i, Number(perDraft));
                                  }}
                                  onBlur={() => saveItemPerUnit(i, Number(perDraft))}
                                  aria-label={`1 ${perUnit} เท่ากับกี่${perPiece}`}
                                  className="w-16 rounded-md border border-sky-300 bg-white px-1.5 py-0.5 text-center focus:border-sky-500 focus:outline-none"
                                />
                                {perPiece}
                                <span className="font-normal text-sky-600">· Enter บันทึก · Esc ยกเลิก</span>
                              </span>
                            ) : piecesLine ? (
                              <p className="mt-1.5 text-[12px] font-bold text-sky-700">
                                {piecesLine}
                                {!locked && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPerDraft(String(it.unitYield?.per ?? y?.per ?? ""));
                                      setEditPer(i);
                                    }}
                                    title="แก้ตัวเลขชิ้นต่อหน่วย — ร้านแก้ตารางทีหลังแล้วบรรทัดนี้ไม่ตรง ให้ตั้งเองตรงนี้"
                                    className="ml-1 whitespace-nowrap rounded px-1 text-[10px] font-bold text-sky-600 transition hover:bg-sky-50"
                                  >
                                    ✏️ แก้จำนวนชิ้น
                                  </button>
                                )}
                              </p>
                            ) : (
                              !locked &&
                              open && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPerDraft("");
                                    setEditPer(i);
                                  }}
                                  title="งานที่ขายเป็นเซ็ต/แผ่น — ตั้งว่า 1 หน่วยได้กี่ชิ้น แล้วทุกจอโชว์ยอดชิ้นจริงให้"
                                  className="mt-1.5 block whitespace-nowrap rounded px-1 text-[10px] font-bold text-slate-400 transition hover:bg-sky-50 hover:text-sky-600"
                                >
                                  📐 ตั้งจำนวนชิ้นต่อหน่วย
                                </button>
                              )
                            )}
                          </div>

                          {/* จำนวน · ราคา/หน่วย · ยอดรวม — มัดไว้ด้วยกัน จะพับลงบรรทัดใหม่ทั้งชุด ไม่แตกกลางทาง */}
                          <span className="ml-auto flex shrink-0 items-start gap-3">
                            {/* 🔢 จำนวน — แก้ได้เหมือนตะกร้า: [−] ช่องพิมพ์ [+] · ราคาขั้นบันได/เรทคิดใหม่ให้เอง */}
                            {locked || areaLocked ? (
                              <span
                                className="w-24 shrink-0 text-center text-sm font-semibold text-slate-700"
                                title={
                                  areaLocked
                                    ? "สินค้าคิดตามพื้นที่ — จำนวนล็อกตามขนาดที่กรอกไว้ (แก้ขนาดผ่าน “แก้ตัวเลือก” แทน)"
                                    : "ใบนี้เป็นออเดอร์แล้ว — แก้ที่หน้าออเดอร์"
                                }
                              >
                                {it.qty.toLocaleString("th-TH")}
                              </span>
                            ) : (
                              <span
                                className="flex w-24 shrink-0 items-center justify-center gap-0.5"
                                title={
                                  shopLine
                                    ? "แก้จำนวนแล้วระบบคิดราคาขั้นบันได/เรทให้ใหม่เหมือนตะกร้า (ลงประวัติทุกครั้ง)"
                                    : "แก้จำนวน — คงราคา/หน่วยเดิม (ลงประวัติทุกครั้ง)"
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => changeItemQty(i, it.qty - 1)}
                                  disabled={it.qty <= 1}
                                  aria-label="ลดจำนวน"
                                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold leading-none text-slate-600 transition enabled:hover:border-amber-300 enabled:hover:bg-amber-50 enabled:hover:text-amber-700 disabled:opacity-40"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  inputMode="numeric"
                                  value={qtyDraft[i] ?? String(it.qty)}
                                  onChange={(e) => setQtyDraft((cur) => ({ ...cur, [i]: e.target.value }))}
                                  onBlur={() => {
                                    const draft = qtyDraft[i];
                                    setQtyDraft((cur) => {
                                      const n = { ...cur };
                                      delete n[i];
                                      return n;
                                    });
                                    if (draft === undefined) return;
                                    const v = Math.floor(Number(draft));
                                    if (Number.isFinite(v) && v >= 1 && v !== it.qty) changeItemQty(i, v);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                    if (e.key === "Escape")
                                      setQtyDraft((cur) => {
                                        const n = { ...cur };
                                        delete n[i];
                                        return n;
                                      });
                                  }}
                                  aria-label={`จำนวนของ ${it.name}`}
                                  className="h-6 w-11 rounded-md border border-slate-200 bg-white px-1 text-center text-sm font-semibold text-slate-800 [appearance:textfield] focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => changeItemQty(i, it.qty + 1)}
                                  aria-label="เพิ่มจำนวน"
                                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold leading-none text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                                >
                                  +
                                </button>
                              </span>
                            )}

                            {/* ราคา/หน่วย — กดที่ตัวเลข (หรือป้าย "รอตีราคา") เพื่อตีราคา · Enter บันทึก · Esc ยกเลิก */}
                            <span className="w-28 shrink-0 text-right text-sm font-bold text-slate-900">
                              {editPrice === i ? (
                                <span className="flex items-center justify-end gap-1">
                                  <span className="text-[11px] font-semibold text-slate-400">฿</span>
                                  <input
                                    autoFocus
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={priceDraft}
                                    onChange={(e) => setPriceDraft(e.target.value)}
                                    onBlur={() => saveItemPrice(i, priceDraft)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setEditPrice(null);
                                      if (e.key === "Enter") saveItemPrice(i, priceDraft);
                                    }}
                                    placeholder="0"
                                    title="ราคาต่อ 1 หน่วย (ไม่ใช่ยอดรวม) — ระบบคูณจำนวนให้เอง"
                                    className="w-20 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-right text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                  />
                                </span>
                              ) : locked ? (
                                <span>{formatPrice(it.unitPrice)}</span>
                              ) : it.unitPrice > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPriceDraft(String(it.unitPrice));
                                    setEditPrice(i);
                                  }}
                                  title="กดเพื่อแก้ราคา/หน่วย (ลงประวัติว่าใครแก้จากเท่าไร)"
                                  className="rounded px-1 text-sm font-bold text-slate-900 transition hover:bg-amber-50 hover:text-amber-700"
                                >
                                  {formatPrice(it.unitPrice)}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPriceDraft("");
                                    setEditPrice(i);
                                  }}
                                  title="กดเพื่อตีราคา — ใส่ราคาต่อ 1 หน่วย แล้วกด Enter"
                                  className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-300 transition hover:bg-amber-100"
                                >
                                  💬 รอตีราคา · กดใส่ราคา
                                </button>
                              )}
                              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                                {it.qty.toLocaleString("th-TH")} × {formatPrice(it.unitPrice)}
                              </span>
                            </span>

                            <span className="w-24 shrink-0 text-right text-sm font-extrabold tabular-nums text-slate-900">
                              {formatPrice(it.qty * it.unitPrice)}
                            </span>
                          </span>
                        </div>

                        {/* 🎨 ภาพลายที่แนบมาตอนหยิบของ — กางการ์ดถึงจะจัดการได้ (เอาออกทีละรูป ไฟล์ยังอยู่ในคลัง) */}
                        {open && arts.length > 0 && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className={`${MINI} mb-1.5`}>ภาพลายที่แนบ · {arts.length} รูป</p>
                            <div className="flex flex-wrap gap-2">
                              {arts.map((u, k) => (
                                <span key={k} className="relative block">
                                  <a
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="relative block"
                                    title={[
                                      artworkSide(it, u),
                                      artQtyOf(it, u, k) ? `ลายที่ ${k + 1} × ${artQtyOf(it, u, k)} ชิ้น` : `ลายที่ ${k + 1}`,
                                      artSizeOf(it, u, k) ? `📐 ${artSizeText(artSizeOf(it, u, k)!)}` : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={u} alt={artworkSide(it, u) ?? ""} className="h-14 w-14 rounded-md object-cover ring-1 ring-slate-200" />
                                    {/* งานพิมพ์ 2 ด้าน — ป้ายหน้า/หลังด้านบน · 🔢 จำนวนต่อลายด้านล่าง */}
                                    {artworkSide(it, u) && (
                                      <span className="absolute left-0 right-0 top-0 rounded-t-md bg-slate-800/85 text-center text-[8px] font-bold leading-tight text-white">
                                        {artworkSide(it, u) === "ด้านหลัง" ? "หลัง" : "หน้า"}
                                      </span>
                                    )}
                                    {artQtyOf(it, u, k) ? (
                                      <span className="absolute bottom-0 left-0 right-0 rounded-b-md bg-slate-900/75 text-center text-[9px] font-bold leading-tight text-white">
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
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

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

"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { giftLinesOf, giftArtLabel } from "@/lib/gifts";
import Link from "next/link";
import ThaiPostTimeline from "@/components/ThaiPostTimeline";
import { useParams, useRouter } from "next/navigation";
import { artQtyOf, formatPrice, type Product } from "@/lib/products";
import { itemPiecesLine } from "@/lib/item-yield";
import { fetchProductsByIds } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import { adminDiscountAmount, amountDueNow, artworkSide, depositInstallments, earlyPayMsLeft, earlyPayState, itemDiscountAmount, orderBalance, orderEarlyPayAmount, orderFullyPaid, orderItemDiscounts, orderNetTransfer, orderStatusLabel, orderTotal, orderVatAmount, orderWhtAmount, paidSoFar, PROOF_STYLES, proofsOf, proofUnit, shipmentQty, STATUS_STYLES, STEP_OF, type Order, type OrderStatus } from "@/lib/admin-data";
import { overpaidAmount, paymentEntries, resolveSlipPhase } from "@/lib/payments";
import { cancelOrderByCustomer, fetchOrderForCustomer, reportPayment, requestOrderEdit, reviewGiftProof, reviewProof, submitRating, updateOrderAddress } from "@/lib/order-repo";
import { RATING_TAGS, SCORE_FACES } from "@/lib/ratings";
import { usePolling } from "@/lib/use-polling";
import { setAppendTarget } from "@/lib/append-order";
import ImageLightbox from "@/components/ImageLightbox";
import Portal from "@/components/Portal";
import { SpecLines } from "@/components/SpecLines";
import { LINE_URL } from "@/components/LineButton";
import { fetchShopPayment, shippingOf, type ShopPayment } from "@/lib/shop-settings";
import { resolveShipLabel } from "@/lib/ship-label";

/*
 * ── สไตล์ปุ่ม/ช่องกรอกใน lightbox ──
 * ImageLightbox เรนเดอร์ผ่าน Portal นอก .shopp — คลาส ord-btn/ord-input (scope .shopp) ไปไม่ถึง
 * จึงต้องแต่งเต็มในตัวเอง: โทนสำหรับพื้นมืด ปุ่มหลักเด่นชัด กดง่ายด้วยนิ้วโป้ง (≥44px)
 */
const LB_OK =
  "whitespace-nowrap rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50";
const LB_EDIT =
  "whitespace-nowrap rounded-full border border-rose-300/60 bg-white/5 px-5 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25 active:scale-95";
const LB_DANGER =
  "whitespace-nowrap rounded-full bg-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400 active:scale-95 disabled:opacity-50";
const LB_QUIET = "whitespace-nowrap rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/20 active:scale-95";
const LB_INPUT =
  "w-full rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-300";

/** แถวบัญชีเดียว (แยกเป็นคอมโพเนนต์ระดับโมดูล — ถ้าประกาศในฟังก์ชันแม่ React จะ remount ทุกครั้งที่กด ทำให้ป้าย "คัดลอกแล้ว" ไม่ขึ้น) */
function AccountRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-rose-200/70">
      <div className="min-w-0">
        <p className="text-[.72rem] leading-snug text-slate-500">{label}</p>
        <p className="select-all font-mono text-[1.05rem] font-bold tracking-wide text-slate-800">{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${copied ? "bg-emerald-500 text-white" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"}`}
      >
        {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  );
}

/** 🏦 การ์ดบัญชีร้าน/พร้อมเพย์ + ปุ่มคัดลอก — วางในกล่องรอชำระเงิน/ค้างชำระ (null = ยังโหลด/ร้านยังไม่ตั้งบัญชี) */
function PayAccounts({ payment }: { payment: ShopPayment | null }) {
  const [copied, setCopied] = useState("");
  if (!payment) return null;
  const banks = payment.banks.filter((b) => b.accountNo?.trim());
  const pp = payment.promptpay?.trim();
  if (banks.length === 0 && !pp) return null;
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
  };
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-bold">💳 โอนมาที่บัญชีร้าน</p>
      {banks.map((b) => (
        <AccountRow
          key={b.id}
          label={`${b.bank}${b.accountName ? ` · ${b.accountName}` : ""}`}
          value={b.accountNo}
          copied={copied === b.id}
          onCopy={() => copy(b.id, b.accountNo)}
        />
      ))}
      {pp && (
        <AccountRow
          label={`📱 พร้อมเพย์${payment.promptpayName ? ` · ${payment.promptpayName}` : ""}`}
          value={pp}
          copied={copied === "__pp"}
          onCopy={() => copy("__pp", pp)}
        />
      )}
      {payment.note?.trim() && <p className="text-[.72rem] leading-relaxed opacity-90">{payment.note}</p>}
    </div>
  );
}

/** ป้ายขั้นตอนฝั่งลูกค้า (คำอ่านง่ายกว่าฝั่งหลังบ้าน) — ลำดับตรงกับ STEP_OF */
const STEPS = ["สั่งซื้อ", "ชำระเงิน", "ตรวจแบบงาน", "ผลิต", "จัดส่ง"];
/** ไอคอนภาพจริงของแต่ละขั้น — ชุดเดียวกับแถบขั้นตอนในหน้าบัญชีของฉัน (null = ใช้เครื่องหมายถูก) */
const STEP_ART: (string | null)[] = [
  null,
  "/account/step/pay.webp",
  "/account/menu/proof.webp",
  "/account/menu/production.webp",
  "/account/step/truck.webp",
];

/** คำอธิบายใต้ขั้นที่กำลังทำอยู่ */
const STEP_HINT: Partial<Record<OrderStatus, string>> = {
  รอชำระเงิน: "รอโอน",
  รอตรวจสอบ: "ตรวจสลิป",
  ชำระแล้ว: "รอกราฟฟิก",
  รอตรวจแบบ: "รอคุณตรวจ",
  แก้ไขแบบ: "กำลังแก้ให้",
  อนุมัติแบบ: "อนุมัติแล้ว รอเข้าผลิต",
  กำลังผลิต: "กำลังทำ",
  จัดส่งแล้ว: "ส่งแล้ว",
};

export default function CustomerOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = decodeURIComponent(String(params?.id ?? ""));

  const [orderKey, setOrderKey] = useState("");
  // ป้าย "คัดลอกลิงก์ออเดอร์แล้ว" (กล่องรอตีราคา — ให้ลูกค้าส่งลิงก์ให้แอดมินใส่ราคา)
  const [linkCopied, setLinkCopied] = useState(false);
  // 💬 กดทักไลน์คุยออเดอร์แล้วหรือยัง (คัดลอกเลขออเดอร์+ลิงก์ให้วางในแชท)
  const [lineOpened, setLineOpened] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  // ⏳ นาฬิกานับถอยหลังส่วนลดโอนไว — เดินเฉพาะตอนยังอยู่ในเวลา พอหมดเวลาหน้าจอคิดยอดใหม่เอง (ยอดโอน/QR ตามไปด้วย)
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!order || earlyPayState(order) !== "active") return;
    const t = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [order]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  /* รายการที่กำลังพิมพ์ "ขอแก้ไข" อยู่ + ข้อความ */
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  /* ตรวจแบบ "ของแถม" — สถานะแยกจากรายการสินค้า (อ้างด้วย promoId) */
  const [giftEditing, setGiftEditing] = useState<string | null>(null);
  const [giftNote, setGiftNote] = useState("");
  const [giftBusy, setGiftBusy] = useState<string | null>(null);
  /* ขยายดูรูปของแถม — อ้างด้วย promoId+ตำแหน่ง (ไม่เก็บ src ตรง ๆ) ให้ปุ่มอนุมัติใน lightbox ใช้ข้อมูลล่าสุดเสมอ */
  const [giftLightbox, setGiftLightbox] = useState<{ promoId: string; kind: "art" | "proof"; idx: number } | null>(null);
  const [giftLbEdit, setGiftLbEdit] = useState(false);
  const [giftLbNote, setGiftLbNote] = useState("");
  const [giftLbConfirm, setGiftLbConfirm] = useState(false);
  const [actionErr, setActionErr] = useState("");
  // อ้างอิงด้วย index (ไม่เก็บ src ตรง ๆ) — ให้ปุ่มอนุมัติ/เลื่อนรูปใน lightbox ใช้ข้อมูลล่าสุดเสมอ
  const [lightbox, setLightbox] = useState<{ itemIdx: number; proofIdx: number } | null>(null);
  /* กล่องขอแก้ไข "รูปนี้" ใน lightbox */
  const [lbEdit, setLbEdit] = useState(false);
  const [lbNote, setLbNote] = useState("");
  const openLightbox = (itemIdx: number, proofIdx: number) => {
    setLightbox({ itemIdx, proofIdx });
    setLbEdit(false);
    setLbNote("");
    setLbConfirm(false);
  };
  /* แบบประเมินความพึงพอใจ (นิรนาม) — โชว์เมื่อได้รับของแล้วและยังไม่เคยประเมิน */
  /* กล่องยืนยันก่อนอนุมัติแบบงาน (modal ของเราเอง — แต่งสี/เน้นคำได้)
     ถามครั้งเดียวต่อออเดอร์ต่อเครื่อง — ยืนยันแล้วภาพถัดไปกดอนุมัติผ่านเลย (จำใน localStorage) */
  const [confirmApprove, setConfirmApprove] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  /* ยืนยันแบบ inline ในหน้าภาพขยาย (ไม่บังภาพ) */
  const [lbConfirm, setLbConfirm] = useState(false);
  const confirmedOnce = () => {
    try {
      return order ? !!localStorage.getItem(`ducky-approve-once-${order.id}`) : false;
    } catch {
      return true; // localStorage ปิด → ไม่ต้องถามซ้ำวนไป
    }
  };
  const markConfirmedOnce = () => {
    try {
      if (order) localStorage.setItem(`ducky-approve-once-${order.id}`, "1");
    } catch {
      /* ข้าม */
    }
  };
  /** ยืนยันผ่าน modal (ใช้กับปุ่มอนุมัติทุกภาพนอกหน้าภาพขยาย) — ข้ามถ้าเคยยืนยันแล้ว */
  const confirmViaModal = async (): Promise<boolean> => {
    if (confirmedOnce()) return true;
    const ok = await new Promise<boolean>((resolve) => setConfirmApprove({ resolve }));
    setConfirmApprove(null);
    if (ok) markConfirmedOnce();
    return ok;
  };

  /* คู่มือวิธีตรวจ/อนุมัติแบบงาน — เด้งเองครั้งแรกที่มีแบบรอตรวจ (จำต่อออเดอร์ต่อเครื่อง) */
  const [showGuide, setShowGuide] = useState(false);
  // ข้อควรทราบ/เงื่อนไขงานของสินค้าแต่ละตัว (แอดมินตั้งในหลังบ้าน) — ย้ำให้ลูกค้าเห็นในออเดอร์ด้วย
  const [termsById, setTermsById] = useState<Record<string, string>>({});
  /** ข้อมูลสินค้าไว้โชว์รูปประกอบรายการ (ลูกค้าจะได้รู้ว่าสั่งอะไรไว้ แม้ยังไม่มีแบบงาน) */
  const [picById, setPicById] = useState<Record<string, { emoji: string; gradient: string; imageSrc?: string }>>({});
  /* 📐 สินค้าจริงของรายการ — คิด "สั่ง N แผ่น ได้ X ชิ้น" ให้ออเดอร์เก่าที่ยังไม่ได้แช่ unitYield */
  const [prodById, setProdById] = useState<Record<string, Product>>({});
  // รายการ id สินค้าในออเดอร์นี้ (คีย์คงที่ ไม่ให้ effect วิ่งซ้ำทุกครั้งที่ order อัปเดต)
  const itemIdsKey = (order?.items ?? []).map((i) => i.productId).sort().join(",");
  useEffect(() => {
    let alive = true;
    const ids = itemIdsKey ? itemIdsKey.split(",") : [];
    if (ids.length === 0) return;
    fetchProductsByIds(ids)
      .then((list) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        const pics: Record<string, { emoji: string; gradient: string; imageSrc?: string }> = {};
        for (const p of list) {
          if (p.terms?.trim()) map[p.id] = p.terms.trim();
          pics[p.id] = { emoji: p.emoji, gradient: p.gradient, imageSrc: p.imageSrc };
        }
        setTermsById(map);
        setPicById(pics);
        setProdById(Object.fromEntries(list.map((p) => [p.id, p])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [itemIdsKey]);

  useEffect(() => {
    if (!order) return;
    const pending = order.items.some((it) => it.proofStatus !== "อนุมัติ" && proofsOf(it).some((p) => !p.review));
    if (!pending) return;
    try {
      if (localStorage.getItem(`ducky-review-guide-${order.id}`)) return;
    } catch {
      /* localStorage ปิด — เด้งได้ตามปกติ */
    }
    setShowGuide(true);
  }, [order]);
  const closeGuide = () => {
    setShowGuide(false);
    try {
      if (order) localStorage.setItem(`ducky-review-guide-${order.id}`, "1");
    } catch {
      /* ข้าม */
    }
  };

  /* 🧾 เงื่อนไขก่อนชำระเงิน — เด้งครั้งแรกที่ลูกค้าเปิดลิงก์ตอนสถานะ "รอชำระเงิน" (ยังไม่มีเงินเข้า + ราคาครบทุกรายการ)
     ย้ำให้ตรวจสินค้า/จำนวน/รายละเอียดก่อนโอน เพราะโอนแล้วเข้าสายผลิต แก้/ยกเลิกไม่ได้ตามเงื่อนไขร้าน
     จำต่อออเดอร์ต่อเครื่อง (localStorage) · กดเปิดอ่านซ้ำได้จากกล่องชำระเงิน */
  const [showPayTerms, setShowPayTerms] = useState(false);
  useEffect(() => {
    if (!order || order.status !== "รอชำระเงิน") return;
    const isClaim = !!(order.claimOf || order.claimReason);
    const quoting = !isClaim && order.items.some((it) => it.qty > 0 && it.unitPrice <= 0);
    if (quoting) return; // ยังรอตีราคา — หน้าแจ้งโอนยังไม่เปิด ไม่ต้องเตือน
    const paid =
      !!order.slipUrl || !!order.slipPath || !!order.paidReportedAt || (order.paidTotal ?? 0) > 0 || !!order.deposit?.firstPaidAt;
    if (paid) return; // โอนไปแล้ว/แนบสลิปแล้ว — เลยจุดที่ต้องเตือน
    try {
      if (localStorage.getItem(`ducky-pay-terms-${order.id}`)) return;
    } catch {
      /* localStorage ปิด — เด้งได้ตามปกติ */
    }
    setShowPayTerms(true);
  }, [order]);
  const closePayTerms = () => {
    setShowPayTerms(false);
    try {
      if (order) localStorage.setItem(`ducky-pay-terms-${order.id}`, "1");
    } catch {
      /* ข้าม */
    }
  };

  const [rateScore, setRateScore] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const [rateComment, setRateComment] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateDone, setRateDone] = useState(false);
  const [rateErr, setRateErr] = useState("");

  const [slipBusy, setSlipBusy] = useState(false);
  /** กำลังส่งสลิปใบที่เท่าไรจากทั้งหมด (เลือกหลายไฟล์) — "" = ใบเดียว */
  const [slipProgress, setSlipProgress] = useState("");
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefMsg, setPrefMsg] = useState("");
  const [slipErr, setSlipErr] = useState("");
  const [slipDrag, setSlipDrag] = useState(false);
  // 🏦 บัญชีร้าน/พร้อมเพย์ให้ลูกค้าโอน (ชุดเดียวกับหน้า checkout — ตั้งค่าที่ /admin/payment)
  const [payment, setPayment] = useState<ShopPayment | null>(null);
  useEffect(() => {
    fetchShopPayment().then(setPayment).catch(() => {});
  }, []);
  // กันวางไฟล์พลาดนอกกล่องแล้วเบราว์เซอร์เปิดรูปแทนหน้าเว็บ (สาเหตุ "โยนแล้วไม่ได้")
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  /* แก้ไขที่อยู่จัดส่ง (ได้จนกว่าร้านจะปริ้นใบงาน) */
  const [editAddr, setEditAddr] = useState(false);
  const [addrForm, setAddrForm] = useState({ customer: "", phone: "", address: "" });
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrErr, setAddrErr] = useState("");

  function startEditAddr() {
    if (!order) return;
    setAddrForm({ customer: order.customer, phone: order.phone, address: order.address });
    setAddrErr("");
    setEditAddr(true);
  }

  async function saveAddr() {
    if (!order) return;
    if (!addrForm.customer.trim() || !addrForm.phone.trim() || !addrForm.address.trim()) {
      setAddrErr("กรอกชื่อผู้รับ เบอร์โทร และที่อยู่ให้ครบ");
      return;
    }
    setAddrBusy(true);
    setAddrErr("");
    const res = await updateOrderAddress(orderId, orderKey, {
      customer: addrForm.customer.trim(),
      phone: addrForm.phone.trim(),
      address: addrForm.address.trim(),
    });
    setAddrBusy(false);
    if (!res.ok) {
      setAddrErr(res.error ?? "แก้ไขไม่สำเร็จ");
      if (res.locked && res.order) setOrder(res.order); // ร้านเพิ่งปริ้น → รีเฟรชให้เห็นสถานะล็อก
      else if (res.locked) void load(orderKey);
      return;
    }
    if (res.order) setOrder(res.order);
    setEditAddr(false);
  }

  /* ✏️ ขอแก้ไขออเดอร์ — ลูกค้าพิมพ์บอกว่าอยากแก้อะไร แล้วแอดมินแก้ให้ (ไม่ให้แก้ยอดเอง กันบิลเพี้ยนจากสลิป) */
  const [editReqOpen, setEditReqOpen] = useState(false);
  const [editReqText, setEditReqText] = useState("");
  const [editReqBusy, setEditReqBusy] = useState(false);
  const [editReqErr, setEditReqErr] = useState("");
  const [editReqSent, setEditReqSent] = useState(false);

  async function sendEditRequest() {
    if (!order) return;
    const text = editReqText.trim();
    if (text.length < 3) {
      setEditReqErr("พิมพ์บอกหน่อยครับว่าอยากแก้ตรงไหน");
      return;
    }
    setEditReqBusy(true);
    setEditReqErr("");
    const res = await requestOrderEdit(orderId, orderKey, text);
    setEditReqBusy(false);
    if (!res.ok) {
      setEditReqErr(res.error ?? "ส่งคำขอไม่สำเร็จ");
      if (res.locked) void load(orderKey);
      return;
    }
    if (res.order) setOrder(res.order);
    setEditReqOpen(false);
    setEditReqText("");
    setEditReqSent(true);
  }

  /* 🚫 ยกเลิกออเดอร์เอง — เปิดให้เฉพาะใบที่ยังไม่มีเงินเข้าเลย (เซิร์ฟเวอร์เช็คซ้ำอีกชั้น) */
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState("");

  async function doCancel() {
    if (!order) return;
    setCancelBusy(true);
    setCancelErr("");
    const res = await cancelOrderByCustomer(orderId, orderKey, cancelReason.trim() || undefined);
    setCancelBusy(false);
    if (!res.ok) {
      setCancelErr(res.error ?? "ยกเลิกไม่สำเร็จ");
      if (res.locked) void load(orderKey); // ร้านเพิ่งขยับสถานะ → รีเฟรชให้เห็นของจริง
      return;
    }
    if (res.order) setOrder(res.order);
    setCancelOpen(false);
    setCancelReason("");
  }

  const load = useCallback(
    async (key: string) => {
      setLoading(true);
      const res = await fetchOrderForCustomer(orderId, key);
      setLoading(false);
      if (res.order) setOrder(res.order);
      else setLoadErr(res.error ?? "เปิดออเดอร์ไม่สำเร็จ");
    },
    [orderId]
  );

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") ?? "";
    setOrderKey(k);
    void load(k);
  }, [load]);

  /** ดึงข้อมูลใหม่เงียบ ๆ — ให้แบบงานใหม่จากกราฟฟิกขึ้นเอง */
  const refresh = useCallback(async () => {
    // กันข้อมูลใหม่ทับตอนลูกค้ากำลังพิมพ์คำขอแก้ไข/แก้ที่อยู่/ขอแก้ออเดอร์/ยืนยันยกเลิก หรือกำลังส่งอยู่
    if (editingIdx !== null || busyIdx !== null || editAddr || editReqOpen || cancelOpen) return;
    const res = await fetchOrderForCustomer(orderId, orderKey);
    if (!res.order) return;
    setOrder((cur) => (JSON.stringify(cur) === JSON.stringify(res.order) ? cur : res.order!));
  }, [orderId, orderKey, editingIdx, busyIdx, editAddr, editReqOpen, cancelOpen]);

  const live = !!order && order.status !== "เสร็จสิ้น" && order.status !== "ยกเลิก";
  usePolling(refresh, { enabled: live });

  /** ส่งผลตรวจ — ระบุ proofIdx = เฉพาะรูปนั้น (per-image) · คืน order ล่าสุดให้ผู้เรียกใช้ต่อ (เช่น เด้งรูปถัดไป) */
  async function act(
    itemIndex: number,
    action: "approve" | "request",
    opts?: { proofIdx?: number; noteText?: string }
  ): Promise<Order | null> {
    setActionErr("");
    setBusyIdx(itemIndex);
    const res = await reviewProof(
      orderId,
      orderKey,
      itemIndex,
      action,
      action === "request" ? (opts?.noteText ?? note) : undefined,
      opts?.proofIdx
    );
    setBusyIdx(null);
    if (!res.ok) {
      setActionErr(res.error ?? "ส่งผลตรวจไม่สำเร็จ");
      return null;
    }
    if (res.order) setOrder(res.order);
    setEditingIdx(null);
    setNote("");
    return res.order ?? null;
  }

  /** ส่งผลตรวจแบบ "ของแถม" — อนุมัติ/ขอแก้ทั้งชุด · คืน true เมื่อสำเร็จ (lightbox ใช้ปิดกล่องพิมพ์) */
  async function actGift(promoId: string, action: "approve" | "request", noteText?: string): Promise<boolean> {
    setActionErr("");
    setGiftBusy(promoId);
    const res = await reviewGiftProof(orderId, orderKey, promoId, action, action === "request" ? (noteText ?? giftNote) : undefined);
    setGiftBusy(null);
    if (!res.ok) {
      setActionErr(res.error ?? "ส่งผลตรวจไม่สำเร็จ");
      return false;
    }
    if (res.order) setOrder(res.order);
    setGiftEditing(null);
    setGiftNote("");
    return true;
  }

  /**
   * ลูกค้าอัปโหลดสลิปแจ้งโอน — ปุ่มเดียวทุกกรณี (ใบแรก/มัดจำ/ยอดคงเหลือ/โอนขาดแล้วโอนตาม/สั่งเพิ่ม/ค่าบริการเพิ่ม)
   * เซิร์ฟเวอร์เลือกช่องเองจากยอดค้าง (resolveSlipPhase) · เลือกหลายไฟล์ได้ ส่งทีละใบต่อกัน (ล็อกต่อออเดอร์ฝั่งเซิร์ฟเวอร์)
   */
  async function uploadSlip(input: FileList | File[] | File | null) {
    if (!input) return;
    const files = input instanceof File ? [input] : Array.from(input);
    if (!files.length) return;
    setSlipErr("");
    if (files.some((f) => !f.type.startsWith("image/"))) {
      setSlipErr("แนบเป็นรูปสลิป (PNG / JPG)");
      return;
    }
    setSlipBusy(true);
    const errs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setSlipProgress(files.length > 1 ? `${i + 1}/${files.length}` : "");
      const res = await reportPayment(orderId, orderKey, files[i]);
      if (!res.ok) errs.push(files.length > 1 ? `ใบที่ ${i + 1}: ${res.error ?? "แจ้งโอนไม่สำเร็จ"}` : (res.error ?? "แจ้งโอนไม่สำเร็จ"));
    }
    setSlipBusy(false);
    setSlipProgress("");
    if (errs.length) setSlipErr(errs.join(" · "));
    void load(orderKey); // ดึงสถานะ/ยอดค้างใหม่
  }

  if (loading) {
    return (
      <div className="shopp">
        <div className="shopp-in" style={{ textAlign: "center", padding: "90px 0" }}>
          <p className="ord-eyebrow">iDucky Prints Studio</p>
          <p className="mt-2 text-sm t-soft">กำลังโหลดออเดอร์…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="shopp">
        <div className="shopp-sky" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="oc1" src="/landing/cloud.webp" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="oc2" src="/landing/cloud.webp" alt="" />
        </div>
        <div className="shopp-in" style={{ maxWidth: 520, padding: "70px 0 90px" }}>
          <div className="ord-card p-8 text-center">
            <span className="text-5xl">🔒</span>
            <h1 className="mt-3 text-xl">เปิดออเดอร์ไม่ได้</h1>
            <p className="mt-2 text-sm t-soft">{loadErr}</p>
            <p className="mt-1 text-xs t-faint">กรุณาเปิดจากลิงก์ที่ร้านส่งให้ (ลิงก์ต้องมีรหัสครบ)</p>
            <Link href="/products" className="ord-btn yolk lg mt-6">
              🛍️ ไปเลือกสินค้า
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const waiting = order.items.filter((it) => proofsOf(it).length && it.proofStatus === "รอตรวจ").length;
  /** รายการที่ยังมีภาพค้างตรวจ (นับทั้งสถานะรอตรวจและขอแก้ไข) — ใช้โชว์แบนเนอร์+คู่มือ */
  const waitingItems = order.items.filter(
    (it) => it.proofStatus !== "อนุมัติ" && proofsOf(it).some((p) => !p.review)
  ).length;
  /** จำนวน "ภาพ" ที่ลูกค้ายังไม่ได้ตรวจ (per-image) — ข้ามรายการที่อนุมัติครบแล้ว */
  const waitingProofs = order.items
    .filter((it) => proofsOf(it).length && it.proofStatus !== "อนุมัติ")
    .reduce((s, it) => s + proofsOf(it).filter((p) => !p.review).length, 0);
  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  // รายการที่ยังรอแอดมินตีราคา (งานกำหนดขนาดเอง ฯลฯ ราคายัง ฿0) — ต้องใส่ราคาครบก่อนถึงเปิดหน้าแจ้งโอน
  // กันลูกค้าโอนทั้งที่ยอดรวมยังไม่ครบทุกรายการ · ออเดอร์เคลมตั้งใจ ฿0 ไม่นับ
  const pendingQuote =
    order.claimOf || order.claimReason ? [] : order.items.filter((it) => it.qty > 0 && it.unitPrice <= 0);
  const step = STEP_OF[order.status];
  const balance = orderBalance(order);
  // ➗ ออเดอร์มัดจำที่หัก ณ ที่จ่าย: ยอดงวด (รวม VAT) กับเงินที่ต้องโอนจริงต่างกัน — โชว์คู่กันทุกจุดที่บอกยอดงวด
  const inst = depositInstallments(order);
  const whtRateTxt = order.wht?.rate ? ` ${order.wht.rate}%` : "";
  /** " (โอนจริง X หลังหัก ณ ที่จ่าย)" เมื่อยอดที่พูดถึงคือทั้งงวด — โอนมาบางส่วนแล้วไม่ใส่ (สัดส่วนหักจะไม่ตรง) */
  const netNote = (gross: number, net: number, actual: number = gross) =>
    inst && inst.wht > 0 && Math.abs(actual - gross) < 0.01 ? ` (โอนจริง ${formatPrice(net)} หลังหัก ณ ที่จ่าย${whtRateTxt})` : "";
  // สั่งเพิ่มได้เฉพาะออเดอร์ที่ยังไม่เข้าสายการผลิต
  const canAppend = (["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] as OrderStatus[]).includes(
    order.status
  );
  const cancelled = order.status === "ยกเลิก";
  /**
   * ยกเลิกเองได้ไหม — เงื่อนไขเดียวกับด่านฝั่งเซิร์ฟเวอร์ (/api/orders/cancel)
   * "ยังไม่มีเงินเข้าเลย + ร้านยังไม่เริ่มงาน" เท่านั้น · นอกนั้นให้ทักร้าน
   */
  const paidSomething =
    !!order.slipUrl || !!order.slipPath || !!order.paidReportedAt || (order.paidTotal ?? 0) > 0 || !!order.deposit?.firstPaidAt;
  const canCancelSelf = order.status === "รอชำระเงิน" && !paidSomething && !order.printedAt;
  // ขอแก้ไขได้จนกว่าของจะออกจากร้าน
  const canRequestEdit = !(["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"] as OrderStatus[]).includes(order.status);
  const openEditReq = order.editRequest && !order.editRequest.doneAt ? order.editRequest : null;
  // 💸 ช่องที่สลิปใบต่อไปจะลง (null = ไม่มียอดค้าง) + ยอดที่ต้องโอนตอนนี้ + สลิปทุกใบที่แนบไว้
  const slipPhase = resolveSlipPhase(order);
  const dueNow = amountDueNow(order);
  const slipEntries = paymentEntries(order);
  /**
   * กล่องแจ้งโอนขึ้นเมื่อยังมียอดค้างให้แนบ ไม่ว่าสถานะอะไร (โอนขาด · สั่งเพิ่ม · ค่าบริการเพิ่มระหว่างผลิต · ยอดคงเหลือใบมัดจำ)
   * ยกเว้นตอน "รอตรวจสอบ" ที่ใบแรกยังรอร้านตรวจ — แบนเนอร์ "ได้รับสลิปแล้ว" ดูแลอยู่ ไม่ต้องชวนโอนซ้ำ
   */
  const showDueBox =
    !!slipPhase && dueNow > 0 && !order.flowAccount && pendingQuote.length === 0 && !cancelled && !(order.status === "รอตรวจสอบ" && slipPhase === "first");

  /* ชุดชำระเงิน/สลิป — มือถือโชว์บนสุด (CTA ต้องเจอทันที) · เดสก์ท็อปย้ายไปคอลัมน์ขวา */
  const payFlow = (
    <>
      {/*
        💬 ทักไลน์คุยออเดอร์ — ปุ่มเดียวกับหน้า "สั่งซื้อสำเร็จ" เผื่อลูกค้าปิดแท็บไปแล้วกลับมาทีหลัง
        กดแล้วคัดลอก "เลขออเดอร์ + ลิงก์" ให้วางในแชทเลย แอดมินเปิดดูงานได้ทันทีไม่ต้องถามซ้ำ
        ออเดอร์ที่ยกเลิกแล้วไม่ต้องชวนคุย
      */}
      {!cancelled && (
        <div className="ord-note line mt-4 p-4">
          <p className="ord-title text-[.94rem]" style={{ color: "inherit" }}>💬 คุยออเดอร์นี้กับร้านได้เลย</p>
          <p className="mt-1 text-xs leading-relaxed">
            ยืนยันลาย/แบบงาน · เช็คคิวผลิตกับวันได้รับ · ติดปัญหาตรงไหนทักได้ตลอด (อ้างอิงเลข {order.id})
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(`🦆 ออเดอร์ ${order.id}\n🔗 ${window.location.href}`).catch(() => {});
              } catch {
                /* ข้าม — คัดลอกไม่ได้ก็ยังเปิดแชทได้ */
              }
              setLineOpened(true);
              window.open(LINE_URL, "_blank", "noopener,noreferrer");
            }}
            className="ord-btn line block mt-3"
          >
            💬 ทักไลน์ร้าน — คุยรายละเอียดออเดอร์
          </button>
          {lineOpened && (
            <p className="mt-2 text-center text-[11px] font-semibold">
              ✓ คัดลอกเลขออเดอร์ + ลิงก์ให้แล้ว — วาง (Ctrl/⌘+V) ส่งในแชทได้เลย
            </p>
          )}
        </div>
      )}

      {order.useByDate && (
        <p className="ord-card mt-4 px-4 py-3 text-sm">
          📅 วันที่คุณแจ้งว่าต้องใช้งาน: <strong className="t-blue">{order.useByDate}</strong>
          {order.rush ? <span className="ord-chip danger ml-2">🔥 งานเร่ง</span> : null}
        </p>
      )}

      {/* ── สั่งจำนวนมาก: รอร้านเช็คสต๊อก/คิวผลิตแล้วยืนยันกลับ ── */}
      {order.items.some((it) => it.needStockCheck) && !cancelled && (
        <div className="ord-note info mt-4 p-4">
          <p className="ord-title text-[.94rem]" style={{ color: "inherit" }}>📦 รายการสั่งจำนวนมาก — รอทางร้านยืนยัน</p>
          <p className="mt-1 text-xs leading-relaxed">
            ทางร้านกำลังเช็คสต๊อกและคิวผลิตของรายการที่สั่งจำนวนมาก จะรีบแจ้ง<strong>จำนวนที่ผลิตได้และวันจัดส่ง</strong>กลับทางไลน์ให้ครับ
            {order.status === "รอชำระเงิน" ? " — รอผลยืนยันก่อนโอนได้เลย ไม่ต้องรีบครับ" : ""}
          </p>
          <ul className="mt-2 space-y-0.5">
            {order.items
              .filter((it) => it.needStockCheck)
              .map((it, i) => (
                <li key={i} className="text-xs font-semibold">
                  • {it.name} × {it.qty.toLocaleString("th-TH")}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* ── มีรายการรอตีราคา: ยังไม่เปิดหน้าแจ้งโอน — กันโอนเงินทั้งที่ยอดรวมยังไม่ครบ ── */}
      {order.status === "รอชำระเงิน" && pendingQuote.length > 0 && (
        <div className="ord-note warn mt-4 p-4">
          <p className="ord-title text-[.94rem]" style={{ color: "inherit" }}>
            ⏳ รอทางร้านใส่ราคา {pendingQuote.length.toLocaleString("th-TH")} รายการ — <u>ยังไม่ต้องโอนตอนนี้</u>
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            ออเดอร์นี้มีงานที่แอดมินต้องตีราคาก่อน (เช่น งานกำหนดขนาดเอง) — เมื่อใส่ราคาครบทุกรายการ
            หน้าแจ้งโอนพร้อมยอดรวมที่ถูกต้องจะเปิดให้อัตโนมัติ ทางร้านจะรีบทักไปแจ้งครับ
          </p>
          <ul className="mt-2 space-y-0.5">
            {pendingQuote.map((it, i) => (
              <li key={i} className="text-xs font-semibold">
                • {it.name} × {it.qty.toLocaleString("th-TH")} — 💬 รอตีราคา
              </li>
            ))}
          </ul>
          {/* ให้เร็วขึ้น: copy ลิงก์ออเดอร์นี้ส่งให้แอดมินทางไลน์ เพื่อให้ใส่ราคาได้ทันที */}
          <p className="mt-3 text-xs font-semibold">
            ⚡ อยากได้ราคาไว ๆ — คัดลอกลิงก์ออเดอร์นี้ส่งให้แอดมินทางไลน์ได้เลย
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                });
              }}
              className={`ord-btn sm ${linkCopied ? "ok" : "blue"}`}
            >
              {linkCopied ? "✓ คัดลอกแล้ว — ส่งให้แอดมินได้เลย" : "📋 คัดลอกลิงก์ออเดอร์ (copy)"}
            </button>
            <a
              href={LINE_URL}
              target="_blank"
              rel="noreferrer"
              className="ord-btn line sm"
            >
              💬 ทักไลน์ร้าน — ให้แอดมินใส่ราคา
            </a>
          </div>
        </div>
      )}

      {/* ── ใบที่ออกบิลใน FlowAccount: ชำระตามเอกสารนั้น ไม่ต้องโอนเข้าบัญชีร้าน/แนบสลิปที่นี่ ── */}
      {order.status === "รอชำระเงิน" && order.flowAccount && (
        <div className="ord-note mt-4 p-4">
          <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>
            📄 {order.deposit && !order.deposit.firstPaidAt ? "โอนมัดจำงวดแรกตาม" : "ชำระตาม"}
            {order.flowAccount.docTypeLabel} {order.flowAccount.docNo}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {order.deposit && !order.deposit.firstPaidAt ? (
              // ➗ ใบมัดจำ 50% ของ FlowAccount: งวดแรกตามใบแจ้งหนี้มัดจำ · ยอดคงเหลือเก็บก่อนจัดส่ง
              <>
                ออเดอร์นี้ตกลงมัดจำก่อนเริ่มงาน — โอนมัดจำ {formatPrice(inst!.first)} ตามเอกสาร
                {netNote(inst!.first, inst!.firstNet)} แล้วแจ้งทางร้านได้เลย
                ไม่ต้องแนบสลิปในหน้านี้ · ยอดคงเหลือ {formatPrice(inst!.second)}
                {netNote(inst!.second, inst!.secondNet)} ชำระก่อนจัดส่ง
              </>
            ) : (
              <>
                ออเดอร์นี้ออกเอกสารผ่านระบบบัญชีของร้านแล้ว — ชำระตามยอดในเอกสาร
                {order.flowAccount.grandTotal != null ? ` (${formatPrice(order.flowAccount.grandTotal)} รวม VAT)` : ""} แล้วแจ้งทางร้านได้เลย
                ไม่ต้องแนบสลิปในหน้านี้
              </>
            )}
          </p>
          <a href={order.flowAccount.url} target="_blank" rel="noreferrer" className="ord-btn sm mt-3 inline-block">
            เปิดเอกสาร ↗
          </a>
        </div>
      )}
      {/* ➗ ใบมัดจำ FlowAccount ที่รับงวดแรกแล้ว: บอกยอดคงเหลือ (กล่องแนบสลิปปกติปิดไว้สำหรับใบ FlowAccount) */}
      {order.flowAccount && order.deposit?.firstPaidAt && !order.deposit.settledAt && !cancelled && (
        <div className="ord-note mt-4 p-4">
          <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>
            📄 ยอดคงเหลืองวดหลัง {formatPrice(Math.max(0, orderTotal(order) - paidSoFar(order)))}
            {inst ? netNote(inst.second, inst.secondNet, Math.max(0, orderTotal(order) - paidSoFar(order))) : ""}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            รับมัดจำงวดแรกแล้ว ✓ — ยอดคงเหลือชำระตามเอกสารของร้าน (ใบแจ้งหนี้ยอดคงเหลือ) ก่อนจัดส่ง แล้วแจ้งทางร้านได้เลย ไม่ต้องแนบสลิปในหน้านี้
          </p>
          <a href={order.flowAccount.url} target="_blank" rel="noreferrer" className="ord-btn sm mt-3 inline-block">
            เปิดเอกสาร ↗
          </a>
        </div>
      )}
      {/* ── ชำระเงิน / แจ้งสลิป — กล่องเดียวทุกกรณี (ใบแรก · มัดจำ · ยอดคงเหลือ · โอนขาด/สั่งเพิ่ม/ค่าบริการเพิ่ม) ตามยอดค้าง ── */}
      {showDueBox && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSlipDrag(true);
          }}
          onDragLeave={() => setSlipDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSlipDrag(false);
            void uploadSlip(e.dataTransfer.files);
          }}
          className={`ord-note danger mt-4 p-4${slipDrag ? " drop" : ""}`}
        >
          <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>
            💸{" "}
            {order.deposit && !order.deposit.firstPaidAt
              ? paidSoFar(order) > 0
                ? `โอนมัดจำเพิ่มอีก ${formatPrice(dueNow)}`
                : `โอนมัดจำ 50% ก่อนเริ่มงาน ${formatPrice(dueNow)}`
              : order.deposit && !order.deposit.settledAt
                ? `ค้างชำระยอดคงเหลือ ${formatPrice(dueNow)}`
                : paidSoFar(order) > 0
                  ? `มียอดค้างชำระ ${formatPrice(dueNow)}`
                  : `รอชำระเงิน ${formatPrice(orderTotal(order))}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {order.deposit && !order.deposit.firstPaidAt
              ? paidSoFar(order) > 0
                ? `รับมาแล้ว ${formatPrice(paidSoFar(order))} จากมัดจำ ${formatPrice(Math.min(orderTotal(order), order.deposit.amount))} — โอนส่วนที่ขาดแล้วแนบสลิปเพิ่ม ทางร้านจะเริ่มงานทันทีที่ครบ`
                : `ออเดอร์นี้ตกลงมัดจำก่อน — โอน ${formatPrice(dueNow)}${inst ? netNote(inst.first, inst.firstNet, dueNow) : ""} จากยอดทั้งหมด ${formatPrice(orderTotal(order))} แล้วแนบสลิป · ส่วนที่เหลือชำระก่อนจัดส่ง`
              : order.deposit && !order.deposit.settledAt
                ? `รับแล้ว ${formatPrice(paidSoFar(order))} จากยอดทั้งหมด ${formatPrice(orderTotal(order))} — โอนส่วนที่เหลือ ${formatPrice(dueNow)}${inst ? netNote(inst.second, inst.secondNet, dueNow) : ""} แล้วแนบสลิปตรงนี้ ก่อนทางร้านจัดส่งของ`
                : paidSoFar(order) > 0
                  ? `ยอดรวมเพิ่มขึ้นหลังโอนรอบแรก (โอนขาด · สั่งเพิ่ม · ค่าบริการเพิ่ม หรือทางร้านตีราคางานสั่งทำให้แล้ว) — โอนเฉพาะส่วนต่างมาที่บัญชีร้าน แล้วแนบสลิป (จ่ายแล้ว ${formatPrice(paidSoFar(order))} จาก ${formatPrice(orderTotal(order))})`
                  : "โอนเงินมาที่บัญชีร้านแล้วแนบสลิปที่นี่ ทางร้านจะตรวจสอบและเริ่มงานให้"}
          </p>
          <PayAccounts payment={payment} />
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              // ลากสลิปมาวางที่ปุ่มนี้ได้เลย (เดสก์ท็อป) — มือถือแตะเลือกไฟล์เหมือนเดิม
              e.preventDefault();
              void uploadSlip(e.dataTransfer.files);
            }}
            className="ord-btn danger wrap block mt-3 cursor-pointer"
          >
            {slipBusy ? (
              `กำลังส่งสลิป${slipProgress ? ` ${slipProgress}` : ""}…`
            ) : (
              <span className="flex flex-col items-center gap-[3px]">
                <span>📤 {paidSoFar(order) > 0 ? "แนบสลิปโอนเพิ่ม" : "แนบสลิปการโอน"}</span>
                <span className="text-[.72rem] opacity-90">แตะเลือกรูป (เลือกได้หลายใบ) หรือลากมาวางตรงนี้</span>
              </span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              disabled={slipBusy}
              onChange={(e) => {
                void uploadSlip(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {slipErr && <p className="mt-2 text-xs font-semibold">⚠️ {slipErr}</p>}
          <button type="button" onClick={() => setShowPayTerms(true)} className="ord-btn quiet sm block mt-2">
            📋 อ่านเงื่อนไขก่อนโอนอีกครั้ง
          </button>
        </div>
      )}
      {order.status === "รอตรวจสอบ" && (
        <div className="ord-note warn mt-4 p-4 text-sm">
          🧾 <strong>ได้รับสลิปแล้ว</strong> — ทางร้านกำลังตรวจสอบการชำระเงิน เดี๋ยวจะเริ่มงานให้ครับ
          {order.slipUrl && (
            <span className="mt-3 flex items-center gap-3">
              <a href={order.slipUrl} target="_blank" rel="noreferrer" className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-2 ring-white transition hover:ring-[#FFB627]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.slipUrl} alt="สลิปที่คุณแนบ" className="h-full w-full object-cover" />
              </a>
              <span className="min-w-0 text-xs">
                <span className="block font-bold">สลิปที่คุณแนบไว้ (แตะเพื่อดูเต็ม)</span>
                {order.paidReportedAt && (
                  <span className="block opacity-80">
                    แจ้งโอนเมื่อ {new Date(order.paidReportedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
                <label className="ord-btn ghost sm mt-1.5 cursor-pointer">
                  {slipBusy ? "กำลังส่ง…" : "📤 แนบสลิปใหม่ (แทนใบเดิม)"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={slipBusy}
                    onChange={(e) => {
                      void uploadSlip(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </span>
            </span>
          )}
        </div>
      )}

      {/* ── 🧾 สลิปทุกใบที่แนบไว้ (ใบแรก · มัดจำ · ยอดคงเหลือ · โอนเพิ่ม) — หลักฐานการชำระของลูกค้า
          ซ่อนตอน "รอตรวจสอบ" ที่มีใบเดียว (แบนเนอร์ด้านบนโชว์ใบนั้นอยู่แล้ว) ── */}
      {slipEntries.length > 0 && !(order.status === "รอตรวจสอบ" && slipEntries.length === 1) && (
        <div className="ord-card mt-4 p-4">
          <p className="ord-title text-sm">🧾 สลิปการโอนของคุณ{slipEntries.length > 1 ? ` (${slipEntries.length} ใบ)` : ""}</p>
          <ul className="mt-2 space-y-2">
            {slipEntries.map((e) => (
              <li key={e.key} className="flex items-center gap-3 text-xs t-soft">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-2 ring-white transition hover:ring-[#57B6E8]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.url} alt={`สลิปใบที่ ${e.n}`} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/70 text-lg">🧾</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {slipEntries.length > 1 ? `ใบที่ ${e.n} · ` : ""}
                    {e.phase === "first" && !order.deposit ? "สลิปการโอน" : e.label}
                  </span>
                  {e.at && <span className="block">{new Date(e.at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · แตะรูปเพื่อดูเต็ม</span>}
                </span>
                <span className={`ord-chip shrink-0 ${e.state === "pass" || e.state === "accepted" ? "ok" : "yolk"}`}>
                  {e.state === "pass" || e.state === "accepted"
                    ? `✓ รับแล้ว${e.credited ? ` ${formatPrice(e.credited)}` : e.verify?.amount ? ` ${formatPrice(e.verify.amount)}` : ""}`
                    : e.state === "partial"
                      ? `รับบางส่วน ${formatPrice(e.credited ?? 0)}`
                      : "รอร้านตรวจ"}
                </span>
              </li>
            ))}
          </ul>
          {overpaidAmount(order) > 0 && (
            <p className="mt-2 text-xs font-semibold t-ok">💚 โอนเกินมา {formatPrice(overpaidAmount(order))} — ทางร้านจะติดต่อคืนเงินหรือแปลงเป็นแต้มให้ครับ</p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="shopp">
      {/* เมฆลอย — ชุดเดียวกับหน้าแรก */}
      <div className="shopp-sky" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc1" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc2" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc3" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc4" src="/landing/cloud.webp" alt="" />
      </div>
      <div className="shopp-in">
      {/* ── หัวออเดอร์ + แถบขั้นตอน ── */}
      <div className="ord-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ord-eyebrow">เลขออเดอร์</p>
            <p className="ord-title select-all text-2xl tracking-wide" style={{ fontWeight: 600 }}>{order.id}</p>
            <p className="mt-1 text-xs t-soft">
              {order.date} · ยอดรวม <span className="ord-title t-blue" style={{ fontSize: ".95rem" }}>{formatPrice(orderTotal(order))}</span>
            </p>
            {live && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] t-faint">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                หน้านี้อัปเดตเองอัตโนมัติ ไม่ต้องรีเฟรช
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[order.status]}`}>
              {orderStatusLabel(order)}
            </span>
            {/* 🧾 ปุ่มใบเสร็จโชว์เมื่อชำระครบ 100% แล้วเท่านั้น (กติกาเดียวกับหน้าใบเสร็จที่ล็อกไว้ + /account/receipts) — เจ้าของร้านสั่ง 10 ก.ย. 69 */}
            {orderFullyPaid(order) && (
              <Link
                href={`/order/${encodeURIComponent(orderId)}/receipt${orderKey ? `?key=${encodeURIComponent(orderKey)}` : ""}`}
                className="ord-btn ghost sm"
              >
                🧾 ใบเสร็จ
              </Link>
            )}
          </div>
        </div>

        {/* ── ลูกค้าเลือกเองว่าอยากให้เราอัปเดตแค่ไหน (ส่งทาง LINE) ── */}
        {!cancelled && (
          <div className="mt-4 ord-sub p-3.5">
            <p className="ord-title text-[.82rem]">🔔 แจ้งความคืบหน้าทาง LINE</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "ทุกขั้นตอน"],
                  ["key", "เฉพาะเรื่องสำคัญ"],
                  ["off", "ไม่รับแจ้งเตือน"],
                ] as const
              ).map(([lv, label]) => {
                const on = (order.notifyLevel ?? "all") === lv;
                return (
                  <button
                    key={lv}
                    type="button"
                    disabled={prefBusy}
                    onClick={async () => {
                      setPrefBusy(true);
                      setPrefMsg("");
                      try {
                        const res = await fetch("/api/orders/notify-pref", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ orderId, key: orderKey, level: lv }),
                        });
                        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                        if (j.ok) {
                          setPrefMsg("บันทึกแล้ว ✓");
                          void load(orderKey);
                        } else setPrefMsg(j.error ?? "บันทึกไม่สำเร็จ");
                      } catch {
                        setPrefMsg("บันทึกไม่สำเร็จ");
                      } finally {
                        setPrefBusy(false);
                      }
                    }}
                    className={`ord-btn sm ${on ? "line" : "ghost"}`}
                  >
                    {on ? "✓ " : ""}
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug t-faint">
              “เฉพาะเรื่องสำคัญ” = แจ้งตอนยืนยันการชำระเงิน จัดส่ง และยกเลิกเท่านั้น ·
              เรื่องยอดค้างชำระจะแจ้งเสมอ เว้นแต่เลือก “ไม่รับแจ้งเตือน”
              {prefMsg && <span className="ml-1 font-semibold t-blue">{prefMsg}</span>}
            </p>
          </div>
        )}

        {/* แถบขั้นตอน */}
        {cancelled ? (
          <p className="ord-note plain mt-4 px-4 py-3 text-sm">
            ออเดอร์นี้ถูกยกเลิกแล้ว — สอบถามเพิ่มเติมทักร้านได้เลยครับ
          </p>
        ) : (
          <ol className="ord-steps mt-5">
            {STEPS.map((label, i) => {
              const done = i < step;
              const now = i === step;
              return (
                <li key={label} className={`ord-step${done ? " done" : now ? " now" : ""}`}>
                  <span className="sline" />
                  <span className="sdot">{STEP_ART[i] ? <img src={STEP_ART[i]!} alt="" /> : "✓"}</span>
                  <span className="slabel">{label}</span>
                  <span className="stime">{now ? (STEP_HINT[order.status] ?? "กำลังทำ") : done ? "เรียบร้อย" : "—"}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="lg:hidden">{payFlow}</div>


      {waitingItems > 0 && (
        <div className="ord-note warn mt-4 p-4 text-sm">
          🎨 <strong>มีแบบงานรอให้คุณตรวจ {waitingItems} รายการ — เหลืออีก {waitingProofs} ภาพ</strong> · แตะรูปเพื่อดูใหญ่ แล้วกดอนุมัติทีละภาพได้เลย{" "}
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="ord-btn ghost sm mt-1.5"
          >
            ❓ วิธีตรวจ/อนุมัติแบบ
          </button>
        </div>
      )}

      {/* ── กล่องยืนยันก่อนอนุมัติแบบงาน ── */}
      {confirmApprove && (
        // แขวนที่ body เหมือนไลท์บ็อกซ์ (หนีกรอบซ้อน .shopp-in) — z 110 จึงลอยเหนือภาพขยาย (z-[100]) ได้จริง
        <Portal>
          <div className="shopp-modal" onClick={() => confirmApprove.resolve(false)}>
          <div className="shopp-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* โทนเหลือง+❓ ไม่ใช่เขียว+✅ — ลูกค้าเคยเข้าใจว่ากล่องนี้ = อนุมัติเสร็จแล้ว แล้วปิดทิ้ง */}
            <div className="px-6 pb-2 pt-7 text-center" style={{ background: "linear-gradient(180deg,#FFF1CC,transparent)" }}>
              <span className="text-5xl">❓</span>
              <h2 className="mt-2 text-lg t-warn">อนุมัติแบบงานนี้ใช่ไหมคะ?</h2>
            </div>
            <div className="px-6 pb-6 pt-2">
              <p className="ord-note warn px-3 py-2 text-center text-sm font-bold">
                ⚠️ ตอนนี้ยังไม่ได้อนุมัตินะคะ
                <br />
                <span className="font-semibold">ต้องกดปุ่มสีเขียวด้านล่าง</span> จึงจะนับว่าอนุมัติ
              </p>
              <p className="mt-3 text-center text-sm leading-relaxed t-soft">
                เมื่ออนุมัติแล้ว ทางบริษัทจะ<strong className="t-danger">จัดทำงานตามภาพนี้ทันที</strong>
                <br />
                หาก<strong className="t-warn">ไม่มั่นใจ</strong> รบกวน
                <strong className="t-ink">ตรวจสอบอีกรอบ</strong>
                <br />
                หรือ<strong className="t-ok">สอบถามแอดมิน</strong>ก่อนนะคะ 🙏
              </p>
              <button
                type="button"
                onClick={() => confirmApprove.resolve(true)}
                className="ord-btn ok lg block mt-5 !py-4 !text-base !font-extrabold"
                style={{ boxShadow: "0 8px 22px rgba(18,135,106,.42), 0 0 0 4px rgba(18,135,106,.18)" }}
              >
                ✅ กดที่นี่เพื่ออนุมัติ — เริ่มผลิตได้เลย
              </button>
              <button
                type="button"
                onClick={() => confirmApprove.resolve(false)}
                className="ord-btn quiet sm block mt-2"
              >
                ↩️ ยังไม่อนุมัติ — ขอดูอีกครั้ง
              </button>
            </div>
          </div>
        </div>
          </Portal>
      )}

      {/* ── คู่มือวิธีตรวจแบบงาน (เด้งครั้งแรก / กดเปิดซ้ำได้) ── */}
      {showGuide && (
        <Portal>
          <div className="shopp-modal" style={{ zIndex: 120 }} onClick={closeGuide}>
          <div className="shopp-modal-box tall p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-4xl">🎨</p>
            <h2 className="mt-2 text-center text-lg">วิธีตรวจ &amp; อนุมัติแบบงาน</h2>
            <div className="mt-4 space-y-3 text-sm t-soft">
              <p className="flex gap-2.5">
                <span className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-[#E2F3FE] text-xs font-bold t-blue">1</span>
                <span>
                  <strong>แตะรูปแบบงาน</strong> เพื่อขยายดูเต็มจอ — เลื่อนซ้าย/ขวาดูภาพถัดไปได้ มีตัวเลขบอกว่าดูภาพที่เท่าไหร่จากทั้งหมด
                </span>
              </p>
              <p className="flex gap-2.5">
                <span className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-[#E2F3FE] text-xs font-bold t-blue">2</span>
                <span>
                  ในภาพขยาย กด <strong className="t-ok">✅ อนุมัติภาพนี้</strong> ถ้าถูกต้อง หรือ{" "}
                  <strong className="t-danger">✏️ ขอแก้ไขภาพนี้</strong> แล้วพิมพ์จุดที่อยากแก้ — ระบบจะเด้งภาพถัดไปให้อัตโนมัติจนครบ
                </span>
              </p>
              <p className="flex gap-2.5">
                <span className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-[#E2F3FE] text-xs font-bold t-blue">3</span>
                <span>
                  ถ้าดูครบและมั่นใจทั้งชุด กดปุ่ม <strong>✅ อนุมัติทุกภาพที่เหลือ</strong> ทีเดียวได้เลย
                </span>
              </p>
            </div>
            <p className="ord-note danger mt-4 px-3 py-2.5 text-xs leading-relaxed">
              ⚠️ <strong>ทางบริษัทจะจัดทำงานตามภาพที่อนุมัติทันที</strong> — หากไม่มั่นใจ รบกวนตรวจสอบอีกรอบ หรือสอบถามแอดมินก่อนนะคะ
            </p>
            <button
              type="button"
              onClick={closeGuide}
              className="ord-btn yolk block mt-4"
            >
              เข้าใจแล้ว เริ่มตรวจแบบ 🎨
            </button>
          </div>
        </div>
          </Portal>
      )}

      {/* ── 🧾 เงื่อนไขก่อนชำระเงิน (เด้งครั้งแรกตอนรอชำระ / กดเปิดซ้ำได้) ──
          ต่ำกว่าคู่มือตรวจแบบ (z 120) — ถ้าเด้งพร้อมกัน ลูกค้าอ่านคู่มือก่อนแล้วค่อยเจอใบนี้ */}
      {showPayTerms && order.status === "รอชำระเงิน" && (() => {
        // ข้อจำกัดการผลิตของสินค้าในออเดอร์นี้ (แอดมินตั้งในหลังบ้าน) — รวมไว้ในป๊อปอัพเดียว ไม่ให้ต้องไล่กางทีละรายการ
        const seen = new Set<string>();
        const productTerms = order.items
          .filter((it) => {
            if (!termsById[it.productId] || seen.has(it.productId)) return false;
            seen.add(it.productId);
            return true;
          })
          .map((it) => ({
            name: it.name,
            lines: termsById[it.productId]
              .split(/\n+/)
              .map((line) => line.replace(/^[-•*\s]+/, "").trim())
              .filter(Boolean),
          }));
        const depositFirst = !!order.deposit && !order.deposit.firstPaidAt;
        return (
          <Portal>
            <div className="shopp-modal" style={{ zIndex: 115 }} onClick={closePayTerms}>
              <div className="shopp-modal-box tall" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pb-2 pt-7 text-center" style={{ background: "linear-gradient(180deg,#FFF3D6,transparent)" }}>
                  <span className="text-5xl">🧾</span>
                  <h2 className="mt-2 text-lg">ตรวจสอบรายการก่อนชำระเงิน</h2>
                  <p className="mt-1 text-xs t-soft">
                    ออเดอร์ {order.id} · {depositFirst ? "มัดจำที่ต้องโอน" : "ยอดที่ต้องโอน"}{" "}
                    <strong className="t-ink">{formatPrice(amountDueNow(order))}</strong>
                    {depositFirst && inst ? netNote(inst.first, inst.firstNet, amountDueNow(order)) : ""}
                  </p>
                </div>
                <div className="px-6 pb-6 pt-2">
                  <p className="text-sm leading-relaxed t-soft">
                    ทางร้านจัดทำรายการสั่งซื้อให้เรียบร้อยแล้วค่ะ 😊 หากรายละเอียดถูกต้อง สามารถชำระเงินผ่านระบบได้เลยค่ะ 💳✨
                  </p>
                  <div className="ord-note danger mt-3 px-3.5 py-3 text-xs leading-relaxed">
                    <p>
                      ⚠️ <strong>แนะนำให้ตรวจสอบสินค้า จำนวน และรายละเอียดต่าง ๆ ให้เรียบร้อยก่อนชำระเงินค่ะ</strong>
                    </p>
                    <p className="mt-1.5">
                      เนื่องจากหลังชำระเงินแล้ว ทางร้านจะเข้าสู่ขั้นตอนดำเนินการผลิต และ
                      <strong>ไม่สามารถแก้ไขหรือยกเลิกออเดอร์ได้</strong>ตามเงื่อนไขของทางร้านค่ะ
                    </p>
                    {depositFirst && (
                      <p className="mt-1.5">
                        ออเดอร์นี้ตกลงมัดจำ 50% — โอน {formatPrice(amountDueNow(order))}
                        {inst ? netNote(inst.first, inst.firstNet, amountDueNow(order)) : ""} จากยอดทั้งหมด {formatPrice(orderTotal(order))}{" "}
                        ส่วนที่เหลือชำระก่อนจัดส่ง
                      </p>
                    )}
                  </div>
                  {productTerms.length > 0 && (
                    <div className="mt-3">
                      <p className="ord-title text-[.9rem]">📌 ข้อจำกัดการผลิตของสินค้าในออเดอร์นี้</p>
                      <div className="mt-1.5 space-y-2">
                        {productTerms.map((t) => (
                          <div key={t.name} className="ord-note warn px-3 py-2.5">
                            <p className="text-xs font-semibold">{t.name}</p>
                            <ul className="mt-1 space-y-1">
                              {t.lines.map((line, k) => (
                                <li key={k} className="flex gap-1.5 text-[11px] leading-relaxed">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F2456B]" />
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-center text-xs t-soft">ขอบคุณที่ไว้วางใจให้เราดูแลงานนะคะ 💖</p>
                  <button type="button" onClick={closePayTerms} className="ord-btn yolk block mt-4">
                    ✅ ตรวจสอบแล้ว — ไปชำระเงิน
                  </button>
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="ord-btn quiet block mt-2">
                    📖 อ่านเงื่อนไขการชำระเงิน &amp; การผลิตฉบับเต็ม
                  </a>
                </div>
              </div>
            </div>
          </Portal>
        );
      })()}

      {/* ── แบบประเมินความพึงพอใจ (นิรนาม) — โชว์เมื่อได้รับสินค้าแล้ว ── */}
      {(order.status === "จัดส่งแล้ว" || order.status === "เสร็จสิ้น") &&
        (order.rated || rateDone ? (
          rateDone && (
            <div className="ord-note ok mt-4 p-4 text-center text-sm font-semibold">
              🙏 ขอบคุณสำหรับการประเมินครับ — ความเห็นของคุณช่วยให้ร้านพัฒนาขึ้น 🦆
            </div>
          )
        ) : (
          <div className="ord-card mt-4 p-4 sm:p-5">
            <p className="ord-title text-[.98rem]">💬 ได้รับสินค้าแล้ว เป็นยังไงบ้างครับ?</p>
            {/* ป้ายนิรนาม — ต้องมองผ่าน ๆ แล้วรู้ทันทีว่าไม่ระบุตัวตน */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="ord-chip ok" style={{ background: "#12876A", color: "#fff", borderColor: "transparent" }}>
                🕵️ ไม่ระบุตัวตน 100%
              </span>
              <span className="text-[11px] t-soft">
                ร้าน<span className="mx-0.5 rounded bg-[#DEF5EC] px-1 py-0.5 font-semibold t-ok">ไม่มีทางรู้</span>ว่าใครประเมิน
                — <span className="font-semibold t-ink">ติได้เต็มที่ ชมได้เต็มใจ</span> 🦆
              </span>
            </div>

            {/* คะแนนอีโมจิ 1-5 */}
            <div className="mt-3 flex justify-between gap-1 sm:justify-start sm:gap-2">
              {SCORE_FACES.map((f) => (
                <button
                  key={f.score}
                  type="button"
                  onClick={() => setRateScore(f.score)}
                  className={`flex w-14 flex-col items-center rounded-2xl px-1 py-2 transition ${
                    rateScore === f.score ? "bg-[#E2F3FE] ring-2 ring-[#57B6E8]" : "hover:bg-[#F2FAFF]"
                  }`}
                >
                  <span className={`text-2xl ${rateScore && rateScore !== f.score ? "grayscale opacity-40" : ""}`}>{f.emoji}</span>
                  <span className="mt-0.5 text-[10px] font-semibold t-soft">{f.label}</span>
                </button>
              ))}
            </div>

            {rateScore > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold t-soft">
                  {rateScore >= 4 ? "ชอบตรงไหนเป็นพิเศษ?" : "อยากให้ปรับปรุงเรื่องไหน?"} (เลือกได้หลายข้อ)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RATING_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRateTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}
                      className={`ord-btn sm ${rateTags.includes(t) ? "blue" : "ghost"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* หมายเหตุ — โชว์ตลอด ไม่ต้องรอเลือกอีโมจิ */}
            <p className="mt-3 text-xs font-semibold t-soft">📝 หมายเหตุถึงร้าน (ไม่บังคับ)</p>
            <textarea
              value={rateComment}
              onChange={(e) => setRateComment(e.target.value)}
              rows={2}
              placeholder="เช่น สีเพี้ยนจากแบบนิดหน่อย · แพ็คดีมาก · อยากให้มีลายใหม่ ๆ"
              className="ord-input mt-1.5"
            />
            {rateErr && <p className="ord-note danger mt-2 px-3 py-2 text-xs">{rateErr}</p>}
            <button
              type="button"
              disabled={rateBusy || rateScore === 0}
              onClick={async () => {
                setRateBusy(true);
                setRateErr("");
                const res = await submitRating(orderId, orderKey, {
                  score: rateScore,
                  tags: rateTags,
                  comment: rateComment.trim() || undefined,
                });
                setRateBusy(false);
                if (!res.ok) {
                  setRateErr(res.error ?? "ส่งไม่สำเร็จ");
                  return;
                }
                setRateDone(true);
                setOrder((cur) => (cur ? { ...cur, rated: true } : cur));
              }}
              className="ord-btn yolk mt-3 w-full sm:w-auto"
            >
              {rateBusy ? "กำลังส่ง…" : rateScore === 0 ? "เลือกอีโมจิด้านบนก่อนครับ" : "ส่งแบบประเมิน"}
            </button>
          </div>
        ))}

      {actionErr && <p className="ord-note danger mt-4 px-4 py-2.5 text-sm">{actionErr}</p>}

      {/* งานเคลม — บอกลูกค้าชัดว่าไม่มีค่าใช้จ่าย ร้านทำส่งใหม่ให้ */}
      {order.claimOf && (
        <div className="ord-note ok mt-4 p-4">
          <p className="ord-title text-[.94rem]" style={{ color: "inherit" }}>♻️ งานทำใหม่ให้ (เคลม) — ไม่มีค่าใช้จ่าย</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            ทางร้านจัดทำงานชิ้นนี้ใหม่ให้จากออเดอร์ <span className="font-mono font-bold">{order.claimOf}</span>
            {order.claimReason ? ` · เหตุผล: ${order.claimReason}` : ""} — ไม่ต้องโอนเงินเพิ่มครับ
          </p>
        </div>
      )}

      {/* ── 2 คอลัมน์: ซ้าย=แบบงาน/รายการ · ขวา=สรุป (ติดหนึบ) ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* ซ้าย */}
        <div className="space-y-4">
          {order.items.map((it, i) => {
            const proofs = proofsOf(it);
            /* บรรทัดค่าธรรมเนียมที่ระบบใส่ให้ (#boxfee ค่ากล่อง · #designfee ค่า Add on)
               ไม่ใช่งานพิมพ์ — ไม่ต้องโชว์ส่วน "แบบงาน/รอแบบจากร้าน" ให้ลูกค้างง */
            const feeLine = it.productId.includes("#");
            return (
              <div
                key={`${it.productId}-${i}`}
                /* สลับสีคู่/คี่ — ออเดอร์ที่มีหลายรายการจะไล่สายตาแยกออกง่ายขึ้น */
                className={`ord-card p-4 sm:p-5${i % 2 === 0 ? "" : " tint"}`}
              >
                <div className="flex justify-between gap-3">
                  {picById[it.productId] && (
                    <ProductVisual
                      emoji={picById[it.productId].emoji}
                      gradient={picById[it.productId].gradient}
                      src={picById[it.productId].imageSrc}
                      alt={it.name}
                      size="text-3xl"
                      className="h-16 w-16 shrink-0 rounded-2xl"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="ord-title text-[1rem]">
                      {order.items.length > 1 && (
                        <span className={`mr-1.5 text-xs ${i % 2 === 0 ? "t-faint" : "t-blue"}`}>
                          {i + 1}.
                        </span>
                      )}
                      {it.name}
                    </p>
                    {/*
                      รายละเอียดของรายการ — บรรทัดละหัวข้อ อ่านง่ายกว่าต่อกันยาว ๆ
                      ลายหลายแบบก็แยกบรรทัดของใครของมัน · ซ่อนพิกัด/ลิงก์ของทีมผลิตไว้
                      (ออเดอร์เก่าที่ไม่มี sel ใช้ข้อความรวมแบบเดิม แต่ตัดลิงก์ออกให้)
                    */}
                    <SpecLines
                      sel={it.sel}
                      text={it.selections}
                      className="mt-1 text-xs t-soft"
                      stripLinks
                      /* 📐 งานแบ่งแผ่น/เซ็ต (สติ๊กเกอร์ตัด A4 · โฟโต้การ์ดเซ็ต) — จำนวนที่สั่งไม่ใช่จำนวนชิ้น บอกยอดชิ้นจริงประโยคเดียวเหมือนตะกร้า
                         ⚠️ SpecLines ใช้ truthy ของ after ตัดสินว่าจะวาดบล็อก — ไม่มีอะไรโชว์ต้องส่ง null */
                      after={itemPiecesLine(it, prodById[it.productId]) ? <p className="font-semibold t-blue">{itemPiecesLine(it, prodById[it.productId])}</p> : null}
                    />
                    {/* 💬 ที่มาของราคาที่ร้านตีให้ (งานสั่งทำ) — บอกวิธีคิดตรง ๆ ไม่ต้องทักถาม */}
                    {it.quoteNote && (
                      <p className="ord-note info mt-1.5 whitespace-pre-line px-2.5 py-1.5 text-[11px] leading-relaxed">
                        <span className="mr-1 font-semibold">💬 ที่มาของราคา:</span>{" "}
                        {it.quoteNote}
                      </p>
                    )}
                    {/* ⚠️ ข้อควรทราบของสินค้าตัวนี้ — ย้ำอีกครั้งหลังสั่ง กันเข้าใจผิด/เคลมทีหลัง */}
                    {termsById[it.productId] && (
                      <details className="group mt-1.5">
                        <summary className="ord-chip danger cursor-pointer list-none">
                          ⚠️ ข้อควรทราบของงานนี้
                          <span className="opacity-60 group-open:hidden">· แตะอ่าน</span>
                          <span className="hidden opacity-60 group-open:inline">· ย่อ</span>
                        </summary>
                        <ul className="ord-note danger mt-1.5 space-y-1 p-2.5">
                          {termsById[it.productId]
                            .split(/\n+/)
                            .map((line) => line.replace(/^[-•*\s]+/, "").trim())
                            .filter(Boolean)
                            .map((line, k) => (
                              <li key={k} className="flex gap-1.5 text-[11px] leading-relaxed">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F2456B]" />
                                {line}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <span className="ord-title shrink-0 text-right text-sm">
                    {it.unitPrice > 0 ? (
                      `${it.qty} × ${formatPrice(it.unitPrice)}`
                    ) : (
                      /* งานสั่งทำที่ร้านยังไม่ได้ตีราคา — บอกตรง ๆ ดีกว่าโชว์ ฿0 */
                      <span className="ord-chip yolk">{it.qty} ชิ้น · รอร้านแจ้งราคา</span>
                    )}
                    {itemDiscountAmount(it) > 0 && (
                      <span className="block text-[11px] font-semibold t-ok">
                        ส่วนลด{(it.discountPct ?? 0) > 0 ? ` ${it.discountPct}%` : ""} −{formatPrice(itemDiscountAmount(it))}
                      </span>
                    )}
                  </span>
                </div>

                {!feeLine && (<>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="ord-title text-[.82rem]">
                    🖼 แบบงาน
                    {proofs.length > 1 && <span className="ml-1 t-faint" style={{ fontFamily: "var(--body)" }}>{proofs.length} รูป</span>}
                    {!proofs.length && (it.artworkUrls?.length ?? 0) > 0 && !it.noProof && (
                      <span className="ml-1 t-faint" style={{ fontFamily: "var(--body)" }}>— ตอนนี้แสดงลายที่คุณส่งมาไว้ก่อน</span>
                    )}
                  </span>
                  {/* ยอดเพิ่ม/ค่าบริการที่ร้านติ๊กว่าไม่ต้องทำแบบ — บอกลูกค้าตรง ๆ จะได้ไม่รอแบบของรายการนี้ */}
                  {!proofs.length && it.noProof && <span className="ord-chip ghost">ไม่มีแบบให้ตรวจ — รายการนี้ไม่ต้องทำแบบ</span>}
                  {it.proofStatus && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${PROOF_STYLES[it.proofStatus]}`}>
                      {it.proofStatus}
                    </span>
                  )}
                </div>

                {/* ยังไม่มีแบบจากร้าน → โชว์ลายที่ลูกค้าส่งมาไว้ก่อน จะได้เห็นว่างานนี้ทำจากลายไหน */}
                {!proofs.length && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(it.artworkUrls ?? []).map((u, k) => (
                      <a key={`${u}-${k}`} href={u} target="_blank" rel="noreferrer" className="w-24" title="ลายที่คุณส่งมา — แตะเพื่อดูเต็ม">
                        <span className="ord-proof">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt={`ลายที่คุณส่ง ${k + 1}`} style={{ objectFit: "cover" }} />
                          {/* งานพิมพ์ 2 ด้าน — บอกว่ารูปนี้เป็นลายด้านไหน · 🔢 จำนวนที่ระบุไว้ตอนแนบ — ลูกค้าเช็คได้ว่าร้านได้เลขถูก */}
                          <span className="ord-proof-n">
                            {artworkSide(it, u) ?? "ลายที่คุณส่ง"}{artQtyOf(it, u, k) ? ` · ${artQtyOf(it, u, k)!.toLocaleString("th-TH")} ชิ้น` : ""}
                          </span>
                        </span>
                      </a>
                    ))}
                    {!it.noProof && (
                      <span className="ord-proof-empty" style={{ width: "6rem" }}>
                        🎨 รอแบบ<br />จากร้าน
                      </span>
                    )}
                  </div>
                )}
                {!proofs.length ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed t-faint">
                    {it.noProof
                      ? "รายการนี้เป็นยอดเพิ่ม/ค่าบริการ ไม่มีแบบให้ตรวจ — ร้านจะดำเนินการต่อจากรายการหลักได้เลย"
                      : "ทีมกราฟฟิกกำลังจัดทำแบบจากลายของคุณ เดี๋ยวจะแจ้งให้เข้ามาตรวจครับ"}
                  </p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proofs.map((p, j) => (
                        <div key={`${p.url}-${j}`} className="w-24">
                          <button
                            type="button"
                            onClick={() => openLightbox(i, j)}
                            aria-label={`ขยายดูแบบงาน ${it.name} รูปที่ ${j + 1}`}
                            className={`ord-proof${p.review === "อนุมัติ" ? " approved" : p.review === "ขอแก้ไข" ? " revise" : ""}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`แบบงาน ${it.name} รูปที่ ${j + 1}`} />
                            {/* เลขรูป — เลขเดียวกับที่ทีมงานเห็น อ้างถึงกันได้ตรง ๆ ว่า "รูปที่ N" */}
                            <span className="ord-proof-n">รูปที่ {j + 1}</span>
                            {p.review && (
                              <span
                                className={`ord-proof-mark ${p.review === "อนุมัติ" ? "ok" : "revise"}`}
                              >
                                {p.review === "อนุมัติ" ? "✓" : "✏"}
                              </span>
                            )}
                            {/* กราฟฟิกแก้ตามที่ขอแล้ว และยังไม่ได้ตรวจรอบใหม่ */}
                            {!p.review && p.revisedAt && (
                              <span className="ord-proof-n" style={{ left: 5, top: 5, bottom: "auto", background: "var(--yolk-deep)", color: "var(--navy)" }}>
                                🔄 แก้ไขให้แล้ว
                              </span>
                            )}
                          </button>
                          {!p.review && p.revisedAt && (
                            <p className="ord-note warn mt-1 px-2 py-1 text-[10px] leading-snug">
                              🔄 แก้ไขให้แล้ว — รบกวนตรวจอีกครั้ง
                              {p.revisedFromNote ? <span className="block opacity-80">แก้ตามที่ขอ: “{p.revisedFromNote}”</span> : null}
                            </p>
                          )}
                          {(p.qty || p.note) && (
                            <p className="mt-1 text-[11px] leading-tight t-soft">
                              {p.qty ? (
                                <span className="font-semibold t-ink">
                                  {p.qty} {proofUnit(p)}
                                </span>
                              ) : null}
                              {p.qty && p.note ? " · " : null}
                              {p.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] t-faint">
                      แตะรูปเพื่อดูขนาดเต็ม
                      {it.proofStatus !== "อนุมัติ" && proofs.some((p) => !p.review) && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className="font-semibold t-blue underline underline-offset-2"
                          >
                            ❓ วิธีตรวจ/อนุมัติแบบ
                          </button>
                        </>
                      )}
                    </p>
                  </>
                )}

                {it.proofStatus === "ขอแก้ไข" && it.proofNote && (
                  <p className="ord-note danger mt-3 px-3 py-2 text-xs">
                    ✏️ คุณขอแก้ไข: “{it.proofNote}” — ทีมกราฟฟิกกำลังแก้ให้ครับ
                  </p>
                )}

                {it.proofStatus === "อนุมัติ" && (
                  <p className="ord-note ok mt-3 px-3 py-2 text-xs font-semibold">
                    ✅ คุณอนุมัติแบบนี้แล้ว — ทางร้านจะเริ่มผลิตให้เลย
                  </p>
                )}

                {it.proofStatus === "รอตรวจ" &&
                  (editingIdx === i ? (
                    <div className="ord-sub mt-3 p-3">
                      <label className="ord-title mb-1.5 block text-xs">อยากให้แก้ตรงไหน?</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="เช่น ขอเปลี่ยนสีพื้นหลังเป็นฟ้า · ตัวหนังสือใหญ่ขึ้น"
                        className="ord-input"
                      />
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => act(i, "request")}
                          disabled={!note.trim() || busyIdx === i}
                          className="ord-btn danger sm"
                        >
                          {busyIdx === i ? "กำลังส่ง…" : "ส่งคำขอแก้ไข"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIdx(null);
                            setNote("");
                          }}
                          className="ord-btn quiet sm"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmViaModal()) void act(i, "approve");
                        }}
                        disabled={busyIdx === i}
                        className="ord-btn ok sm"
                      >
                        {busyIdx === i
                          ? "กำลังส่ง…"
                          : `✅ อนุมัติทุกภาพที่เหลือ${proofs.filter((p) => !p.review).length ? ` (${proofs.filter((p) => !p.review).length})` : ""}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(i);
                          setNote("");
                        }}
                        className="ord-btn danger-ghost sm"
                      >
                        ✏️ ขอแก้ไข
                      </button>
                    </div>
                  ))}
                </>)}
              </div>
            );
          })}

          {/* 🎁 การ์ดของแถม — งานคัสตอมเหมือนสินค้า: โชว์ลายที่ส่งมา + แบบจากร้าน ให้กดอนุมัติ/ขอแก้ได้ */}
          {(order.gifts ?? []).map((g) => {
            const gProofs = g.proofs ?? [];
            const showProofZone = g.needArtwork || gProofs.length > 0 || (g.artworkUrls?.length ?? 0) > 0;
            return (
              <div key={g.promoId} className="ord-card p-4 sm:p-5" style={{ borderColor: "var(--gift-line, #bbe7cd)" }}>
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="ord-title text-[1rem]">
                      🎁 ของแถมฟรี — {g.name}
                      {g.size ? ` (${g.size})` : ""}
                    </p>
                    <p className="mt-1 text-xs t-soft">
                      {giftLinesOf(g)
                        .map((ln) => `${ln.label} ×${ln.qty}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="ord-title shrink-0 text-sm t-ok">ฟรี</span>
                </div>

                {showProofZone && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="ord-title text-[.82rem]">
                        🖼 แบบงานของแถม
                        {!gProofs.length && (g.artworkUrls?.length ?? 0) > 0 && (
                          <span className="ml-1 t-faint" style={{ fontFamily: "var(--body)" }}>— ตอนนี้แสดงลายที่คุณส่งมาไว้ก่อน</span>
                        )}
                      </span>
                      {g.proofStatus && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${PROOF_STYLES[g.proofStatus]}`}>
                          {g.proofStatus}
                        </span>
                      )}
                    </div>

                    {/* ยังไม่มีแบบจากร้าน → โชว์ลายที่ลูกค้าส่งมาไว้ก่อน */}
                    {!gProofs.length ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(g.artworkUrls ?? []).map((u, k) => (
                            <button
                              key={`${u}-${k}`}
                              type="button"
                              onClick={() => setGiftLightbox({ promoId: g.promoId, kind: "art", idx: k })}
                              className="w-24"
                              title="ลายที่คุณส่งมา — แตะเพื่อดูเต็ม"
                            >
                              <span className="ord-proof">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={`ลายของแถมที่คุณส่ง ${k + 1}`} style={{ objectFit: "cover" }} />
                                <span className="ord-proof-n">ลายที่คุณส่ง</span>
                              </span>
                            </button>
                          ))}
                          <span className="ord-proof-empty" style={{ width: "6rem" }}>
                            🎨 รอแบบ<br />จากร้าน
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed t-faint">
                          {(g.artworkUrls?.length ?? 0) > 0
                            ? "ทีมกราฟฟิกกำลังจัดทำแบบของแถมจากลายของคุณ เดี๋ยวจะแจ้งให้เข้ามาตรวจครับ"
                            : "ของแถมจะใช้ลายเดียวกับสินค้าที่สั่ง — ถ้าอยากใช้ลายอื่น ส่งรูปมาทางไลน์ได้เลยครับ"}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {gProofs.map((p, j) => (
                            <button
                              key={`${p.url}-${j}`}
                              type="button"
                              onClick={() => setGiftLightbox({ promoId: g.promoId, kind: "proof", idx: j })}
                              className="w-24"
                              title="แตะเพื่อดูเต็ม"
                              aria-label={`ขยายดูแบบของแถม รูปที่ ${j + 1}`}
                            >
                              <span className={`ord-proof${p.review === "อนุมัติ" ? " approved" : p.review === "ขอแก้ไข" ? " revise" : ""}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.url} alt={`แบบของแถม รูปที่ ${j + 1}`} style={{ objectFit: "cover" }} />
                                <span className="ord-proof-n">รูปที่ {j + 1}</span>
                                {p.review && (
                                  <span className={`ord-proof-mark ${p.review === "อนุมัติ" ? "ok" : "revise"}`}>
                                    {p.review === "อนุมัติ" ? "✓" : "✏"}
                                  </span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] t-faint">แตะรูปเพื่อดูขนาดเต็ม</p>
                      </>
                    )}

                    {g.proofStatus === "ขอแก้ไข" && g.proofNote && (
                      <p className="ord-note danger mt-3 px-3 py-2 text-xs">
                        ✏️ คุณขอแก้ไข: “{g.proofNote}” — ทีมกราฟฟิกกำลังแก้ให้ครับ
                      </p>
                    )}
                    {g.proofStatus === "อนุมัติ" && (
                      <p className="ord-note ok mt-3 px-3 py-2 text-xs font-semibold">
                        ✅ คุณอนุมัติแบบของแถมแล้ว — ทางร้านจะจัดทำให้พร้อมออเดอร์เลย
                      </p>
                    )}
                    {g.proofStatus === "รอตรวจ" &&
                      (giftEditing === g.promoId ? (
                        <div className="ord-sub mt-3 p-3">
                          <label className="ord-title mb-1.5 block text-xs">อยากให้แก้ตรงไหน?</label>
                          <textarea
                            value={giftNote}
                            onChange={(e) => setGiftNote(e.target.value)}
                            rows={3}
                            placeholder="เช่น ขอเปลี่ยนสีพื้นหลัง · ขยับลายให้อยู่กลาง"
                            className="ord-input"
                          />
                          <div className="mt-2.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void actGift(g.promoId, "request")}
                              disabled={!giftNote.trim() || giftBusy === g.promoId}
                              className="ord-btn danger sm"
                            >
                              {giftBusy === g.promoId ? "กำลังส่ง…" : "ส่งคำขอแก้ไข"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGiftEditing(null);
                                setGiftNote("");
                              }}
                              className="ord-btn quiet sm"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void actGift(g.promoId, "approve")}
                            disabled={giftBusy === g.promoId}
                            className="ord-btn ok sm"
                          >
                            {giftBusy === g.promoId ? "กำลังส่ง…" : "✅ อนุมัติแบบของแถม"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setGiftEditing(g.promoId);
                              setGiftNote("");
                            }}
                            className="ord-btn danger-ghost sm"
                          >
                            ✏️ ขอแก้ไข
                          </button>
                        </div>
                      ))}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ขวา: สรุป (ติดหนึบตอนเลื่อน) */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="hidden lg:block">{payFlow}</div>
          <div className="ord-card p-4 sm:p-5">
            <p className="ord-eyebrow">สรุปยอด</p>
            <div className="mt-3 flex justify-between text-sm">
              <span className="t-soft">รวมสินค้า ({order.items.reduce((s, i) => s + i.qty, 0)} ชิ้น)</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm">
              <span className="t-soft">ค่าจัดส่ง ({resolveShipLabel(order, shippingOf(payment))})</span>
              <span>{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
            </div>
            {(order.gifts ?? []).map((g) => (
              <div key={g.promoId}>
                {giftLinesOf(g).map((ln, k) => (
                  <div key={k} className="mt-1.5 flex justify-between text-sm font-semibold t-ok">
                    <span>🎁 ของแถม — {ln.label} ×{ln.qty}</span>
                    <span>ฟรี</span>
                  </div>
                ))}
                {/* 🎨 สถานะลายบรรทัดเดียวพอ — รูปลาย/แบบงานย้ายไปการ์ดของแถมในรายการด้านซ้าย (ลูกค้ากดอนุมัติที่นั่น) */}
                {giftArtLabel(g) && (
                  <p className="mt-0.5 text-[11px] t-soft">🎨 {giftArtLabel(g)}</p>
                )}
              </div>
            ))}
            {order.discount && order.discount.amount > 0 && (
              <div className="mt-1.5 flex justify-between text-sm font-semibold t-ok">
                <span>{order.discount.label}</span>
                <span>−{formatPrice(order.discount.amount)}</span>
              </div>
            )}
            {earlyPayState(order, nowTick) === "expired" ? (
              <div className="mt-1.5 flex justify-between text-sm t-soft">
                <span>
                  {order.earlyPay!.label} <span className="text-xs">(หมดเวลาแจ้งโอนแล้ว)</span>
                </span>
                <span className="line-through">−{formatPrice(order.earlyPay!.amount)}</span>
              </div>
            ) : orderEarlyPayAmount(order, nowTick) > 0 ? (
              <div className="mt-1.5 flex justify-between gap-2 text-sm font-semibold t-ok">
                <span className="min-w-0">
                  {order.earlyPay!.label}
                  {earlyPayState(order, nowTick) === "active" && (
                    <span className="block text-xs font-normal">⏳ แจ้งโอนภายใน {Math.max(1, Math.ceil(earlyPayMsLeft(order, nowTick) / 60_000))} นาที</span>
                  )}
                </span>
                <span className="shrink-0">−{formatPrice(orderEarlyPayAmount(order, nowTick))}</span>
              </div>
            ) : null}
            {orderItemDiscounts(order) > 0 && (
              <div className="mt-1.5 flex justify-between text-sm font-semibold t-ok">
                <span>ส่วนลดรายการสินค้า</span>
                <span>−{formatPrice(orderItemDiscounts(order))}</span>
              </div>
            )}
            {adminDiscountAmount(order) > 0 && (
              <div className="mt-1.5 flex justify-between text-sm font-semibold t-ok">
                <span>{order.adminDiscount?.label?.trim() || "ส่วนลดพิเศษจากร้าน"}{(order.adminDiscount?.pct ?? 0) > 0 ? ` (${order.adminDiscount!.pct}%)` : ""}</span>
                <span>−{formatPrice(adminDiscountAmount(order))}</span>
              </div>
            )}
            {orderVatAmount(order) > 0 && (
              <div className="mt-1.5 flex justify-between text-sm">
                <span className="t-soft">ภาษีมูลค่าเพิ่ม {order.vat!.rate}%</span>
                <span>{formatPrice(orderVatAmount(order))}</span>
              </div>
            )}
            {/* 🧾 ค่าบริการเพิ่มที่ร้านเก็บทีหลัง (ค่าตัดภาพ/ค่าส่งเพิ่ม …) — บรรทัดแยก ให้รู้ว่ายอดโตเพราะอะไร */}
            {(order.charges ?? []).map((c) => (
              <div key={c.id} className="mt-1.5 flex justify-between text-sm">
                <span className="t-soft">🧾 {c.label}{c.note ? <span className="block text-[11px] opacity-80">{c.note}</span> : null}</span>
                <span>{formatPrice(c.amount)}</span>
              </div>
            ))}
            <div className="ord-title mt-3 flex justify-between pt-3 text-base" style={{ borderTop: "1px dashed var(--sky-200)" }}>
              <span>ยอดรวม</span>
              <span className="t-blue" style={{ fontWeight: 600 }}>{formatPrice(orderTotal(order))}</span>
            </div>
            {/* 💸 รับแล้ว/ค้าง — เฉพาะใบธรรมดาที่เคยรับเงินแล้วและยอดยังไม่ครบ (ใบมัดจำมีกล่องสองงวดของตัวเองด้านล่าง) */}
            {!order.deposit && paidSoFar(order) > 0 && balance > 0 && (
              <div className="ord-sub mt-2.5 space-y-1 p-2.5 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">ชำระแล้ว</span>
                  <span className="t-ok">{formatPrice(paidSoFar(order))}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">ค้างชำระ</span>
                  <span className="t-danger">{formatPrice(balance)}</span>
                </div>
              </div>
            )}
            {orderWhtAmount(order) > 0 && (
              <>
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="t-soft">หักภาษี ณ ที่จ่าย {order.wht!.rate}%</span>
                  <span>−{formatPrice(orderWhtAmount(order))}</span>
                </div>
                <div className="ord-title mt-1 flex justify-between text-base">
                  <span>ยอดชำระ (หลังหัก ณ ที่จ่าย)</span>
                  <span className="t-blue" style={{ fontWeight: 600 }}>{formatPrice(orderNetTransfer(order))}</span>
                </div>
              </>
            )}
            {order.deposit && (
              <div className="ord-sub mt-2.5 space-y-1 p-2.5 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">มัดจำ 50% {order.deposit.firstPaidAt ? "· รับแล้ว ✓" : "· รอโอน"}</span>
                  <span className={order.deposit.firstPaidAt ? "t-ok" : "t-danger"}>{formatPrice(order.deposit.amount)}</span>
                </div>
                {/* ➗ หัก ณ ที่จ่าย: เงินโอนจริงของงวด (ตรงกับ "ยอดชำระ" ในใบของร้าน) */}
                {inst && inst.wht > 0 && (
                  <div className="flex justify-between">
                    <span className="t-soft">↳ โอนจริงหลังหัก ณ ที่จ่าย{whtRateTxt}</span>
                    <span className="t-soft">{formatPrice(inst.firstNet)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">ยอดคงเหลือ {order.deposit.settledAt ? "· ครบแล้ว ✓" : "· ชำระก่อนจัดส่ง"}</span>
                  <span className={order.deposit.settledAt ? "t-ok" : "t-danger"}>
                    {formatPrice(Math.max(0, orderTotal(order) - order.deposit.amount))}
                  </span>
                </div>
                {inst && inst.wht > 0 && (
                  <div className="flex justify-between">
                    <span className="t-soft">↳ โอนจริงหลังหัก ณ ที่จ่าย{whtRateTxt}</span>
                    <span className="t-soft">{formatPrice(inst.secondNet)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 🚚 แบ่งส่ง: รอบที่ส่งไปแล้วก่อนรอบสุดท้าย — แต่ละรอบมีเลขพัสดุของตัวเอง เช็คสถานะ ปณ. ได้ทุกเลข */}
          {(order.shipments?.length ?? 0) > 0 &&
            order.shipments!.map((sh, n) => (
              <div key={`${sh.tracking}-${n}`} className="ord-note info p-4 sm:p-5">
                <p className="ord-eyebrow">
                  🚚 จัดส่งบางส่วน รอบที่ {n + 1}
                  {shipmentQty(sh) ? ` · ${shipmentQty(sh).toLocaleString("th-TH")} ชิ้น` : ""}
                </p>
                <p className="mt-1 select-all break-all font-mono text-lg font-bold t-ink">{sh.tracking}</p>
                <p className="mt-1 text-xs t-soft">
                  รอบนี้: {sh.proofs.map((p) => `${p.itemName ?? order.items[p.item]?.name ?? ""} รูปที่ ${p.proof + 1}${p.qty ? ` × ${p.qty}` : ""}`).join(" · ")}
                  {sh.note ? ` · ${sh.note}` : ""}
                </p>
                {/^[A-Z]{2}\d{9}TH$/i.test(sh.tracking.trim()) ? (
                  <CustomerThaiPostStatus orderId={order.id} orderKey={orderKey} tracking={sh.tracking.trim()} />
                ) : (
                  <p className="mt-1 text-xs t-soft">แตะค้างเพื่อคัดลอก แล้วนำไปเช็คสถานะกับขนส่งได้เลย</p>
                )}
                {!order.tracking && n === order.shipments!.length - 1 && (
                  <p className="mt-2 text-xs font-bold t-soft">ส่วนที่เหลือกำลังผลิต จะจัดส่งในรอบถัดไปและแจ้งเลขพัสดุอีกครั้งครับ</p>
                )}
              </div>
            ))}

          {order.tracking && (
            <div className="ord-note info p-4 sm:p-5">
              <p className="ord-eyebrow">{order.shipments?.length ? "เลขพัสดุ (รอบสุดท้าย)" : "เลขพัสดุ"}</p>
              <p className="mt-1 select-all break-all font-mono text-lg font-bold t-ink">{order.tracking}</p>
              {/^[A-Z]{2}\d{9}TH$/i.test(order.tracking.trim()) ? (
                <CustomerThaiPostStatus orderId={order.id} orderKey={orderKey} tracking={order.tracking.trim()} />
              ) : (
                <p className="mt-1 text-xs t-soft">แตะค้างเพื่อคัดลอก แล้วนำไปเช็คสถานะกับขนส่งได้เลย</p>
              )}
            </div>
          )}

          {/* 📸 ภาพของในกล่องก่อนปิด — ทีมแพ็คถ่ายเก็บไว้ ลูกค้าเห็นว่าของครบตามที่ส่งจริง */}
          {(order.packPhotos?.length ?? 0) > 0 && (
            <div className="ord-card p-4 sm:p-5">
              <p className="ord-eyebrow">📸 ภาพของในกล่องก่อนปิด</p>
              <p className="mt-1.5 text-xs t-soft">ทีมแพ็คถ่ายไว้ก่อนปิดกล่อง — ของตามภาพนี้ถูกจัดส่งไปกับพัสดุของคุณ</p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {(order.packPhotos ?? []).map((ph, i) => (
                  <a key={`${ph.url}-${i}`} href={ph.url} target="_blank" rel="noreferrer" className="group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ph.url}
                      alt={`ภาพก่อนปิดกล่อง ${i + 1}`}
                      className="h-24 w-full rounded-2xl object-cover ring-2 ring-white transition group-hover:ring-[#57B6E8]"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const addrLocked = !!order.printedAt || ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"].includes(order.status);
            return (
              <div className="ord-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="ord-eyebrow">จัดส่งถึง</p>
                  {!editAddr &&
                    (addrLocked ? (
                      <span className="text-[11px] font-semibold t-faint">🔒 ล็อกแล้ว</span>
                    ) : (
                      <button
                        type="button"
                        onClick={startEditAddr}
                        className="ord-btn ghost sm"
                      >
                        ✏️ แก้ไข
                      </button>
                    ))}
                </div>

                {editAddr ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={addrForm.customer}
                      onChange={(e) => setAddrForm((f) => ({ ...f, customer: e.target.value }))}
                      placeholder="ชื่อผู้รับ"
                      className="ord-input"
                    />
                    <input
                      value={addrForm.phone}
                      onChange={(e) => setAddrForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d\-+ ]/g, "") }))}
                      inputMode="tel"
                      placeholder="เบอร์โทร"
                      className="ord-input"
                    />
                    <textarea
                      value={addrForm.address}
                      onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))}
                      rows={3}
                      placeholder="บ้านเลขที่ · ถนน · ตำบล/อำเภอ · จังหวัด · รหัสไปรษณีย์"
                      className="ord-input"
                    />
                    {addrErr && <p className="ord-note danger px-3 py-2 text-xs">{addrErr}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveAddr}
                        disabled={addrBusy}
                        className="ord-btn yolk flex-1"
                      >
                        {addrBusy ? "กำลังบันทึก…" : "💾 บันทึกที่อยู่"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAddr(false)}
                        className="ord-btn quiet"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="ord-title mt-2 text-sm">{order.customer}</p>
                    <p className="text-sm leading-snug t-soft">{order.address}</p>
                    <p className="mt-1.5 text-xs t-faint">
                      {order.phone} · ชำระโดย{order.payment}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed t-faint">
                      {addrLocked
                        ? "🔒 ทางร้านเริ่มทำใบงานแล้ว แก้ไขที่อยู่ไม่ได้ — หากต้องแก้ ติดต่อร้านทางไลน์"
                        : "แก้ไขที่อยู่ได้จนกว่าทางร้านจะปริ้นใบงาน"}
                    </p>
                  </>
                )}
              </div>
            );
          })()}

          {order.log && order.log.length > 0 && (
            <details className="ord-card p-4 sm:p-5">
              <summary className="ord-eyebrow cursor-pointer">ประวัติทั้งหมด ({order.log.length})</summary>
              <ul className="mt-3 space-y-2 pl-4" style={{ borderLeft: "2px dashed var(--sky-200)" }}>
                {[...order.log].reverse().map((l, i) => (
                  <li key={i} className="text-xs t-soft">
                    <span className="font-semibold t-ink">{l.action}</span>
                    {l.detail ? ` · ${l.detail}` : ""}
                    <br />
                    <span className="t-faint">
                      {l.by} ·{" "}
                      {new Date(l.at).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      {/* สั่งเพิ่มในออเดอร์นี้ — กันลูกค้าเปิดออเดอร์ใหม่แล้วโดนค่าส่งซ้ำ */}
      <div className="ord-card mt-6 p-5 text-center sm:p-6">
        {canAppend ? (
          <>
            <p className="ord-title text-[1.05rem]">อยากสั่งเพิ่มไหม?</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed t-soft">
              สั่งเพิ่มในออเดอร์นี้ได้เลย — <strong className="t-blue">ไม่เสียค่าส่งเพิ่ม</strong> เพราะส่งรวมกล่องเดียวกัน
              (โอนเฉพาะส่วนต่างทีหลัง)
            </p>
            <button
              type="button"
              onClick={() => {
                setAppendTarget({ id: order.id, key: orderKey, shippingCost: order.shippingCost });
                router.push("/products");
              }}
              className="ord-btn yolk mt-4"
            >
              🛍️ สั่งเพิ่มในออเดอร์นี้
            </button>
          </>
        ) : (
          <>
            <p className="ord-title text-[1rem]">ออเดอร์นี้ปิดรับสินค้าเพิ่มแล้ว</p>
            <p className="mt-1 text-xs t-soft">
              เพราะอยู่ในขั้น “{order.status}” — ถ้าอยากสั่งเพิ่ม จะเป็นออเดอร์ใหม่ (คิดค่าส่งแยก)
            </p>
          </>
        )}
        <Link href="/products" className="mt-4 block text-xs font-semibold t-faint">
          ← ดูสินค้าทั้งหมด
        </Link>
      </div>

      {/*
        ✏️/🚫 แก้ไข–ยกเลิกออเดอร์
        แยกกันชัด ๆ: "ขอแก้ไข" = พิมพ์บอกร้าน แล้วร้านแก้ให้ (ไม่ให้ลูกค้าขยับยอดเอง กันบิลไม่ตรงสลิป)
        "ยกเลิกเอง" = เปิดเฉพาะใบที่ยังไม่มีเงินเข้าเลย · ใบที่โอนแล้ว/เริ่มงานแล้ว ต้องคุยกับร้าน
      */}
      {!cancelled && (
        <div className="ord-card mt-4 p-5 sm:p-6">
          <p className="ord-eyebrow">แก้ไข / ยกเลิกออเดอร์</p>

          {/* ── ขอแก้ไขออเดอร์ ── */}
          <div className="mt-3">
            {openEditReq && !editReqOpen ? (
              <div className="ord-note warn p-4">
                <p className="text-sm font-bold">✏️ ส่งคำขอแก้ไขให้ร้านแล้ว</p>
                <p className="mt-1 text-xs leading-relaxed">
                  “{openEditReq.text}”
                  <br />
                  <span className="opacity-75">
                    ส่งเมื่อ{" "}
                    {new Date(openEditReq.at).toLocaleString("th-TH", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — ทางร้านกำลังดูให้ครับ ถ้ามีผลกับยอดเงินจะทักกลับไปยืนยันก่อน
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditReqText(openEditReq.text);
                    setEditReqErr("");
                    setEditReqOpen(true);
                  }}
                  className="ord-btn ghost sm mt-3"
                >
                  ✏️ แก้ข้อความ / ส่งใหม่
                </button>
              </div>
            ) : editReqOpen ? (
              <div className="ord-note plain p-4">
                <p className="text-sm font-bold t-ink">อยากแก้ตรงไหนบอกได้เลยครับ</p>
                <p className="mt-1 text-xs leading-relaxed t-soft">
                  เช่น เปลี่ยนขนาด · เพิ่ม/ลดจำนวน · เปลี่ยนสี · เอาบางรายการออก — ทางร้านจะแก้ให้แล้วแจ้งยอดใหม่กลับไป
                </p>
                <textarea
                  value={editReqText}
                  onChange={(e) => setEditReqText(e.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder="เช่น พวงกุญแจอันที่ 2 ขอเปลี่ยนจาก 5 ซม. เป็น 7 ซม. ครับ"
                  className="ord-input mt-3"
                />
                {editReqErr && <p className="ord-note danger mt-2 px-3 py-2 text-xs">{editReqErr}</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={sendEditRequest} disabled={editReqBusy} className="ord-btn blue flex-1">
                    {editReqBusy ? "กำลังส่ง…" : "📨 ส่งคำขอให้ร้าน"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditReqOpen(false);
                      setEditReqErr("");
                    }}
                    className="ord-btn quiet"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <>
                {editReqSent && (
                  <p className="ord-note ok mb-2 px-3 py-2 text-xs">✓ ส่งคำขอให้ร้านแล้ว — ทางร้านจะติดต่อกลับครับ</p>
                )}
                <p className="text-xs leading-relaxed t-soft">
                  อยากเปลี่ยนขนาด/จำนวน/สเปคงาน? พิมพ์บอกร้านได้เลย — ทางร้านแก้ให้แล้วแจ้งยอดใหม่กลับไป
                  {canRequestEdit ? "" : " (ออเดอร์นี้ส่งของแล้ว ทักร้านทางไลน์แทนนะครับ)"}
                </p>
                {canRequestEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditReqText("");
                      setEditReqErr("");
                      setEditReqOpen(true);
                    }}
                    className="ord-btn ghost mt-3"
                  >
                    ✏️ ขอแก้ไขออเดอร์นี้
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── ยกเลิกออเดอร์ ── */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--sky-200)" }}>
            {cancelOpen ? (
              <div className="ord-note danger p-4">
                <p className="text-sm font-bold">ยืนยันยกเลิกออเดอร์ {order.id}?</p>
                <p className="mt-1 text-xs leading-relaxed">
                  ยกเลิกแล้วกลับมาแก้ไม่ได้ — ถ้าอยากได้ของอยู่แต่ขอปรับสเปค กด “ขอแก้ไขออเดอร์” ด้านบนดีกว่าครับ
                </p>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  maxLength={300}
                  placeholder="เหตุผล (ไม่บังคับ) — ช่วยให้ร้านปรับปรุงได้"
                  className="ord-input mt-3"
                />
                {cancelErr && <p className="mt-2 text-xs font-semibold">{cancelErr}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={doCancel} disabled={cancelBusy} className="ord-btn danger flex-1">
                    {cancelBusy ? "กำลังยกเลิก…" : "ยืนยันยกเลิกออเดอร์"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelOpen(false);
                      setCancelErr("");
                    }}
                    className="ord-btn quiet"
                  >
                    ไม่ยกเลิกแล้ว
                  </button>
                </div>
              </div>
            ) : canCancelSelf ? (
              <>
                <p className="text-xs leading-relaxed t-soft">
                  ยังไม่ได้โอนเงิน — ยกเลิกออเดอร์นี้เองได้เลย ไม่มีค่าใช้จ่ายครับ
                </p>
                <button type="button" onClick={() => setCancelOpen(true)} className="ord-btn danger-ghost sm mt-2">
                  🚫 ยกเลิกออเดอร์นี้
                </button>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed t-soft">
                  🔒 ออเดอร์นี้ยกเลิกเองไม่ได้แล้ว
                  {paidSomething ? " เพราะแจ้งโอนเข้ามาแล้ว" : " เพราะทางร้านเริ่มทำงานแล้ว"} — ทักร้านได้เลยครับ
                  เดี๋ยวทางร้านเช็คให้
                </p>
                <a href={LINE_URL} target="_blank" rel="noreferrer" className="ord-btn line sm mt-2">
                  💬 ทักร้านทางไลน์
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* ขยายดูรูปของแถม — footer มีปุ่มอนุมัติ/ขอแก้เหมือน lightbox ของสินค้า (ตัดสินทั้งชุดของแถม) */}
      {giftLightbox &&
        (() => {
          const g = (order.gifts ?? []).find((x) => x.promoId === giftLightbox.promoId);
          if (!g) return null;
          const isProof = giftLightbox.kind === "proof";
          const urls = isProof ? (g.proofs ?? []).map((p) => p.url) : (g.artworkUrls ?? []);
          const src = urls[giftLightbox.idx];
          if (!src) return null;
          const many = urls.length > 1;
          const go = (d: number) =>
            setGiftLightbox({ ...giftLightbox, idx: (giftLightbox.idx + d + urls.length) % urls.length });
          const closeAll = () => {
            setGiftLightbox(null);
            setGiftLbEdit(false);
            setGiftLbNote("");
            setGiftLbConfirm(false);
          };
          const busy = giftBusy === g.promoId;
          return (
            <ImageLightbox
              src={src}
              alt={isProof ? `แบบของแถม รูปที่ ${giftLightbox.idx + 1}` : `ลายของแถมที่คุณส่ง ${giftLightbox.idx + 1}`}
              caption={`🎁 ${g.name} — ${isProof ? "แบบของแถม" : "ลายที่คุณส่งมา"}`}
              counter={many ? `${giftLightbox.idx + 1} / ${urls.length}` : undefined}
              onPrev={many ? () => go(-1) : undefined}
              onNext={many ? () => go(1) : undefined}
              onClose={closeAll}
              footer={
                !isProof ? undefined : g.proofStatus === "อนุมัติ" ? (
                  <p className="text-center text-sm font-bold text-teal-300">✅ คุณอนุมัติแบบของแถมนี้แล้ว</p>
                ) : g.proofStatus === "ขอแก้ไข" ? (
                  <p className="text-center text-sm font-bold text-rose-300">
                    ✏️ ขอแก้ไขแบบของแถมแล้ว{g.proofNote ? ` — “${g.proofNote}”` : ""}
                  </p>
                ) : giftLbConfirm ? (
                  <div className="rounded-2xl bg-white/10 p-3 text-center">
                    <p className="text-sm font-bold text-amber-300">❓ อนุมัติแบบของแถมนี้ใช่ไหมคะ? — ตอนนี้ยังไม่ได้อนุมัตินะคะ</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/90">
                      ต้องกด<strong className="text-emerald-300">ปุ่มสีเขียว</strong>จึงจะนับว่าอนุมัติ แล้วทางบริษัทจะ
                      <strong className="text-rose-300">จัดทำของแถมตามภาพนี้ทันที</strong> — หาก
                      <strong className="text-amber-300">ไม่มั่นใจ</strong> รบกวน
                      <strong className="text-white">ตรวจสอบอีกรอบ</strong> หรือ
                      <strong className="text-teal-300">สอบถามแอดมิน</strong>ก่อนนะคะ 🙏
                    </p>
                    <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          markConfirmedOnce();
                          setGiftLbConfirm(false);
                          void (await actGift(g.promoId, "approve"));
                        }}
                        disabled={busy}
                        className={LB_OK}
                      >
                        ✅ กดที่นี่เพื่ออนุมัติแบบของแถม
                      </button>
                      <button
                        type="button"
                        onClick={() => setGiftLbConfirm(false)}
                        className={LB_QUIET}
                      >
                        ↩️ ยังไม่อนุมัติ — ขอดูอีกครั้ง
                      </button>
                    </div>
                  </div>
                ) : giftLbEdit ? (
                  <div className="rounded-2xl bg-white/10 p-3">
                    <textarea
                      value={giftLbNote}
                      onChange={(e) => setGiftLbNote(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="อยากให้แก้ตรงไหนในแบบของแถม?"
                      className={LB_INPUT}
                    />
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (await actGift(g.promoId, "request", giftLbNote)) {
                            setGiftLbEdit(false);
                            setGiftLbNote("");
                          }
                        }}
                        disabled={!giftLbNote.trim() || busy}
                        className={LB_DANGER}
                      >
                        {busy ? "กำลังส่ง…" : "ส่งคำขอแก้ไข"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGiftLbEdit(false)}
                        className={LB_QUIET}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirmedOnce()) {
                          setGiftLbConfirm(true);
                          return;
                        }
                        void actGift(g.promoId, "approve");
                      }}
                      disabled={busy}
                      className={LB_OK}
                    >
                      {busy ? "กำลังส่ง…" : "✅ อนุมัติแบบของแถม"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiftLbEdit(true)}
                      className={LB_EDIT}
                    >
                      ✏️ ขอแก้ไขแบบนี้
                    </button>
                  </div>
                )
              }
            />
          );
        })()}
      {lightbox &&
        (() => {
          const it = order.items[lightbox.itemIdx];
          const proofs = it ? proofsOf(it) : [];
          const p = proofs[lightbox.proofIdx];
          if (!it || !p) return null; // ข้อมูลเพิ่งรีเฟรชแล้วรูปหาย → ไม่แสดง
          const many = proofs.length > 1;
          const go = (d: number) => openLightbox(lightbox.itemIdx, (lightbox.proofIdx + d + proofs.length) % proofs.length);
          /** อนุมัติรูปนี้ แล้วเด้งไปรูปถัดไปที่ยังไม่ตรวจ (ถ้าไม่มีแล้วอยู่ที่เดิมให้เห็นป้ายเขียว) */
          const approveThis = async () => {
            // ครั้งแรกของออเดอร์: โชว์แถบยืนยันใต้ภาพ (ภาพยังเห็นเต็ม ๆ) — ครั้งถัดไปกดทีเดียวผ่านเลย
            if (!confirmedOnce()) {
              setLbConfirm(true);
              return;
            }
            const o = await act(lightbox.itemIdx, "approve", { proofIdx: lightbox.proofIdx });
            if (!o) return;
            const ps = proofsOf(o.items[lightbox.itemIdx] ?? it);
            const after = ps.findIndex((pp, idx) => idx > lightbox.proofIdx && !pp.review);
            const any = ps.findIndex((pp) => !pp.review);
            const target = after >= 0 ? after : any;
            if (target >= 0) openLightbox(lightbox.itemIdx, target);
          };
          return (
            <ImageLightbox
              src={p.url}
              alt={`แบบงาน ${it.name} รูปที่ ${lightbox.proofIdx + 1}`}
              caption={[it.name, p.qty ? `${p.qty} ${proofUnit(p)}` : "", p.note ?? ""].filter(Boolean).join(" · ")}
              counter={many ? `${lightbox.proofIdx + 1} / ${proofs.length}` : undefined}
              onPrev={many ? () => go(-1) : undefined}
              onNext={many ? () => go(1) : undefined}
              onClose={() => setLightbox(null)}
              footer={
                p.review === "อนุมัติ" ? (
                  <p className="text-center text-sm font-bold text-teal-300">✅ ภาพนี้อนุมัติแล้ว</p>
                ) : p.review === "ขอแก้ไข" ? (
                  <p className="text-center text-sm font-bold text-rose-300">
                    ✏️ ขอแก้ไขภาพนี้แล้ว{p.reviewNote ? ` — “${p.reviewNote}”` : ""}
                  </p>
                ) : lbConfirm ? (
                  <div className="rounded-2xl bg-white/10 p-3 text-center">
                    <p className="text-sm font-bold text-amber-300">❓ อนุมัติภาพนี้ใช่ไหมคะ? — ตอนนี้ยังไม่ได้อนุมัตินะคะ</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/90">
                      ต้องกด<strong className="text-emerald-300">ปุ่มสีเขียว</strong>จึงจะนับว่าอนุมัติ แล้วทางบริษัทจะ
                      <strong className="text-rose-300">จัดทำงานตามภาพนี้ทันที</strong> — หาก
                      <strong className="text-amber-300">ไม่มั่นใจ</strong> รบกวน
                      <strong className="text-white">ตรวจสอบอีกรอบ</strong> หรือ
                      <strong className="text-teal-300">สอบถามแอดมิน</strong>ก่อนนะคะ 🙏
                      <br />
                      <span className="text-white/60">(ยืนยันครั้งเดียว — ภาพถัดไปกดอนุมัติได้เลย)</span>
                    </p>
                    <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          markConfirmedOnce();
                          setLbConfirm(false);
                          const o = await act(lightbox.itemIdx, "approve", { proofIdx: lightbox.proofIdx });
                          if (!o) return;
                          const ps = proofsOf(o.items[lightbox.itemIdx] ?? it);
                          const after = ps.findIndex((pp, idx) => idx > lightbox.proofIdx && !pp.review);
                          const any = ps.findIndex((pp) => !pp.review);
                          const target = after >= 0 ? after : any;
                          if (target >= 0) openLightbox(lightbox.itemIdx, target);
                        }}
                        disabled={busyIdx === lightbox.itemIdx}
                        className={LB_OK}
                      >
                        ✅ กดที่นี่เพื่ออนุมัติ — เริ่มผลิตได้เลย
                      </button>
                      <button
                        type="button"
                        onClick={() => setLbConfirm(false)}
                        className={LB_QUIET}
                      >
                        ↩️ ยังไม่อนุมัติ — ขอดูอีกครั้ง
                      </button>
                    </div>
                  </div>
                ) : lbEdit ? (
                  <div className="rounded-2xl bg-white/10 p-3">
                    <textarea
                      value={lbNote}
                      onChange={(e) => setLbNote(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="อยากให้แก้ตรงไหนในภาพนี้?"
                      className={LB_INPUT}
                    />
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const o = await act(lightbox.itemIdx, "request", { proofIdx: lightbox.proofIdx, noteText: lbNote });
                          if (o) {
                            setLbEdit(false);
                            setLbNote("");
                          }
                        }}
                        disabled={!lbNote.trim() || busyIdx === lightbox.itemIdx}
                        className={LB_DANGER}
                      >
                        {busyIdx === lightbox.itemIdx ? "กำลังส่ง…" : "ส่งคำขอแก้ไขภาพนี้"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLbEdit(false)}
                        className={LB_QUIET}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <p className="w-full text-center text-xs font-semibold text-white/80">
                      เหลือรออนุมัติอีก {waitingProofs} ภาพ ·{" "}
                      <button type="button" onClick={() => setShowGuide(true)} className="font-bold text-amber-300 underline underline-offset-2">
                        ❓ วิธีตรวจ
                      </button>
                    </p>
                    <button
                      type="button"
                      onClick={approveThis}
                      disabled={busyIdx === lightbox.itemIdx}
                      className={LB_OK}
                    >
                      {busyIdx === lightbox.itemIdx ? "กำลังส่ง…" : "✅ อนุมัติภาพนี้"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLbEdit(true)}
                      className={LB_EDIT}
                    >
                      ✏️ ขอแก้ไขภาพนี้
                    </button>
                  </div>
                )
              }
            />
          );
        })()}
      </div>
    </div>
  );
}


/** สถานะพัสดุไปรษณีย์ไทยฝั่งลูกค้า — ใช้กุญแจออเดอร์ยืนยันตัว · ไม่มี token = ลิงก์ไปเว็บ ปณ. */
function CustomerThaiPostStatus({ orderId, orderKey, tracking }: { orderId: string; orderKey: string; tracking: string }) {
  const [st, setSt] = useState<{
    loading: boolean;
    configured?: boolean;
    events?: { status: string; description: string; location?: string; at: string }[];
    error?: string;
  }>({ loading: true });
  const trackUrl = `https://track.thailandpost.co.th/?trackNumber=${encodeURIComponent(tracking)}`;

  useEffect(() => {
    if (!orderKey) return;
    let live = true;
    fetch(`/api/orders/track?orderId=${encodeURIComponent(orderId)}&key=${encodeURIComponent(orderKey)}`)
      .then((r) => r.json())
      .then((j) => live && setSt({ loading: false, ...j }))
      .catch(() => live && setSt({ loading: false, error: "x" }));
    return () => {
      live = false;
    };
  }, [orderId, orderKey]);

  return (
    <div className="mt-2">
      {st.events?.length ? (
        <div className="ord-sub p-3">
          <ThaiPostTimeline events={st.events} />
        </div>
      ) : st.loading && orderKey ? (
        <p className="text-xs t-faint">กำลังเช็คสถานะกับไปรษณีย์ไทย…</p>
      ) : null}
      <a
        href={trackUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-xs font-semibold t-blue underline underline-offset-2"
      >
        เช็คสถานะเต็ม ๆ ที่เว็บไปรษณีย์ไทย ↗
      </a>
    </div>
  );
}

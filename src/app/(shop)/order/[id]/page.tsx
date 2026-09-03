"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { giftLinesOf, giftArtLabel } from "@/lib/gifts";
import Link from "next/link";
import ThaiPostTimeline from "@/components/ThaiPostTimeline";
import AdminEditFab from "@/components/AdminEditFab";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { fetchProductsByIds } from "@/lib/product-repo";
import ProductVisual from "@/components/ProductVisual";
import { adminDiscountAmount, amountDueNow, itemDiscountAmount, orderBalance, orderItemDiscounts, orderStatusLabel, orderTotal, PROOF_STYLES, proofsOf, proofUnit, STATUS_STYLES, STEP_OF, type Order, type OrderStatus } from "@/lib/admin-data";
import { fetchOrderForCustomer, reportPayment, reviewGiftProof, reviewProof, submitRating, updateOrderAddress } from "@/lib/order-repo";
import { RATING_TAGS, SCORE_FACES } from "@/lib/ratings";
import { usePolling } from "@/lib/use-polling";
import { setAppendTarget } from "@/lib/append-order";
import ImageLightbox from "@/components/ImageLightbox";
import Portal from "@/components/Portal";
import { SpecLines } from "@/components/SpecLines";
import { LINE_URL } from "@/components/LineButton";
import { canAccessAdmin } from "@/lib/auth";

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
  อนุมัติแบบ: "เตรียมผลิต",
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
  /** ทีมงานที่ล็อกอินหลังบ้านอยู่ (แอดมิน/กราฟฟิก/เจ้าของ) — ขึ้นปุ่มลัดเข้าออเดอร์นี้ในหลังบ้าน */
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    void canAccessAdmin().then(setIsStaff);
  }, []);
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

  const [rateScore, setRateScore] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const [rateComment, setRateComment] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateDone, setRateDone] = useState(false);
  const [rateErr, setRateErr] = useState("");

  const [slipBusy, setSlipBusy] = useState(false);
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefMsg, setPrefMsg] = useState("");
  const [slipErr, setSlipErr] = useState("");
  const [slipDrag, setSlipDrag] = useState(false);
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
    // กันข้อมูลใหม่ทับตอนลูกค้ากำลังพิมพ์คำขอแก้ไข/แก้ที่อยู่ หรือกำลังส่งอยู่
    if (editingIdx !== null || busyIdx !== null || editAddr) return;
    const res = await fetchOrderForCustomer(orderId, orderKey);
    if (!res.order) return;
    setOrder((cur) => (JSON.stringify(cur) === JSON.stringify(res.order) ? cur : res.order!));
  }, [orderId, orderKey, editingIdx, busyIdx, editAddr]);

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

  /** ลูกค้าอัปโหลดสลิปแจ้งโอน (ทั้งจ่ายครั้งแรกและจ่ายส่วนต่างที่สั่งเพิ่ม) */
  async function uploadSlip(file: File | null) {
    if (!file) return;
    setSlipErr("");
    if (!file.type.startsWith("image/")) {
      setSlipErr("แนบเป็นรูปสลิป (PNG / JPG)");
      return;
    }
    setSlipBusy(true);
    const res = await reportPayment(orderId, orderKey, file);
    setSlipBusy(false);
    if (!res.ok) {
      setSlipErr(res.error ?? "แจ้งโอนไม่สำเร็จ");
      return;
    }
    void load(orderKey); // ดึงสถานะใหม่ (เป็น "รอตรวจสอบ")
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
  // สั่งเพิ่มได้เฉพาะออเดอร์ที่ยังไม่เข้าสายการผลิต
  const canAppend = (["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] as OrderStatus[]).includes(
    order.status
  );
  const cancelled = order.status === "ยกเลิก";

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

      {/* ── ชำระเงิน / แจ้งสลิป ── */}
      {order.status === "รอชำระเงิน" && pendingQuote.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSlipDrag(true);
          }}
          onDragLeave={() => setSlipDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSlipDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void uploadSlip(f);
          }}
          className={`ord-note danger mt-4 p-4${slipDrag ? " drop" : ""}`}
        >
          <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>
            💸{" "}
            {order.deposit && !order.deposit.firstPaidAt
              ? `โอนมัดจำ 50% ก่อนเริ่มงาน ${formatPrice(amountDueNow(order))}`
              : (order.paidTotal ?? 0) > 0
                ? `มียอดค้างชำระ ${formatPrice(balance)}`
                : `รอชำระเงิน ${formatPrice(orderTotal(order))}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {order.deposit && !order.deposit.firstPaidAt
              ? `ออเดอร์นี้ตกลงมัดจำก่อน — โอน ${formatPrice(amountDueNow(order))} จากยอดทั้งหมด ${formatPrice(orderTotal(order))} แล้วแนบสลิป · ส่วนที่เหลือชำระก่อนจัดส่ง`
              : (order.paidTotal ?? 0) > 0
                ? `ยอดรวมเพิ่มขึ้นหลังโอนรอบแรก (สั่งเพิ่ม หรือทางร้านตีราคางานสั่งทำให้แล้ว) — โอนเฉพาะส่วนต่างมาที่บัญชีร้าน แล้วแนบสลิป (จ่ายแล้ว ${formatPrice(order.paidTotal ?? 0)} จาก ${formatPrice(orderTotal(order))})`
                : "โอนเงินมาที่บัญชีร้านแล้วแนบสลิปที่นี่ ทางร้านจะตรวจสอบและเริ่มงานให้"}
          </p>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              // ลากสลิปมาวางที่ปุ่มนี้ได้เลย (เดสก์ท็อป) — มือถือแตะเลือกไฟล์เหมือนเดิม
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void uploadSlip(f);
            }}
            className="ord-btn danger wrap block mt-3 cursor-pointer"
          >
            {slipBusy ? (
              "กำลังส่งสลิป…"
            ) : (
              <span className="flex flex-col items-center gap-[3px]">
                <span>📤 แนบสลิปการโอน</span>
                <span className="text-[.72rem] opacity-90">แตะเลือกรูป หรือลากมาวางตรงนี้</span>
              </span>
            )}
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
          {slipErr && <p className="mt-2 text-xs font-semibold">⚠️ {slipErr}</p>}
        </div>
      )}
      {/* ── มัดจำผ่านแล้ว: เก็บยอดคงเหลือก่อนจัดส่ง — แนบสลิปได้ตลอด ── */}
      {order.deposit?.firstPaidAt && !order.deposit.settledAt && order.status !== "รอชำระเงิน" && order.status !== "รอตรวจสอบ" && !cancelled && (
        <div className="ord-note danger mt-4 p-4">
          <p className="ord-title text-[.96rem]" style={{ color: "inherit" }}>💳 ค้างชำระยอดคงเหลือ {formatPrice(amountDueNow(order))}</p>
          <p className="mt-1 text-xs leading-relaxed">
            รับมัดจำ {formatPrice(order.deposit.amount)} แล้ว — โอนส่วนที่เหลือแล้วแนบสลิปตรงนี้ ก่อนทางร้านจัดส่งของ
          </p>
          <label className="ord-btn danger wrap block mt-3 cursor-pointer">
            {slipBusy ? "กำลังส่งสลิป…" : "📤 แนบสลิปยอดคงเหลือ"}
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
          {slipErr && <p className="mt-2 text-xs font-semibold">⚠️ {slipErr}</p>}
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

      {/* สลิปที่แนบ — โชว์ต่อหลังร้านยืนยันแล้วด้วย (หลักฐานการชำระของลูกค้า) */}
      {order.slipUrl && order.status !== "รอตรวจสอบ" && order.status !== "รอชำระเงิน" && (
        <div className="ord-card mt-4 flex items-center gap-3 p-4">
          <a href={order.slipUrl} target="_blank" rel="noreferrer" className="block h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 ring-white transition hover:ring-[#57B6E8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.slipUrl} alt="สลิปการโอน" className="h-full w-full object-cover" />
          </a>
          <span className="min-w-0 text-xs t-soft">
            <span className="ord-title block text-sm">🧾 สลิปการโอนของคุณ</span>
            {order.paidReportedAt && (
              <span className="block">
                แจ้งโอนเมื่อ {new Date(order.paidReportedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · แตะรูปเพื่อดูเต็ม
              </span>
            )}
          </span>
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
      {/*
        ทีมงานที่ล็อกอินหลังบ้านอยู่ (แอดมิน/กราฟฟิก/เจ้าของ) เปิดลิงก์ลูกค้ามาดู
        → มีปุ่มลัดเข้าออเดอร์นี้ในหลังบ้านเลย ไม่ต้องไปไล่หาในรายการออเดอร์
        (ลูกค้าทั่วไปไม่เห็นปุ่มนี้ เพราะไม่มี session หลังบ้าน)
      */}
      {isStaff && (
        <AdminEditFab
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          title="เปิดออเดอร์นี้ในระบบหลังบ้าน"
          label="เปิดในหลังบ้าน"
        />
      )}

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
            <Link
              href={`/order/${encodeURIComponent(orderId)}/receipt${orderKey ? `?key=${encodeURIComponent(orderKey)}` : ""}`}
              className="ord-btn ghost sm"
            >
              🧾 ใบเสร็จ
            </Link>
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
            <div className="px-6 pb-2 pt-7 text-center" style={{ background: "linear-gradient(180deg,#DEF5EC,transparent)" }}>
              <span className="text-5xl">✅</span>
              <h2 className="mt-2 text-lg t-ok">ยืนยันการอนุมัติแบบงาน</h2>
            </div>
            <div className="px-6 pb-6 pt-2">
              <p className="text-center text-sm leading-relaxed t-soft">
                ทางบริษัทจะ<strong className="t-danger">จัดทำงานตามภาพที่อนุมัติทันที</strong>
                <br />
                หาก<strong className="t-warn">ไม่มั่นใจ</strong> รบกวน
                <strong className="t-ink">ตรวจสอบอีกรอบ</strong>
                <br />
                หรือ<strong className="t-ok">สอบถามแอดมิน</strong>ก่อนนะคะ 🙏
              </p>
              <button
                type="button"
                onClick={() => confirmApprove.resolve(true)}
                className="ord-btn ok block mt-5"
              >
                ✅ ยืนยันอนุมัติ — ให้เริ่มผลิตได้เลย
              </button>
              <button
                type="button"
                onClick={() => confirmApprove.resolve(false)}
                className="ord-btn quiet block mt-2"
              >
                ↩️ ขอดูอีกครั้ง
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
                    {!proofs.length && (it.artworkUrls?.length ?? 0) > 0 && (
                      <span className="ml-1 t-faint" style={{ fontFamily: "var(--body)" }}>— ตอนนี้แสดงลายที่คุณส่งมาไว้ก่อน</span>
                    )}
                  </span>
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
                          <span className="ord-proof-n">ลายที่คุณส่ง</span>
                        </span>
                      </a>
                    ))}
                    <span className="ord-proof-empty" style={{ width: "6rem" }}>
                      🎨 รอแบบ<br />จากร้าน
                    </span>
                  </div>
                )}
                {!proofs.length ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed t-faint">
                    ทีมกราฟฟิกกำลังจัดทำแบบจากลายของคุณ เดี๋ยวจะแจ้งให้เข้ามาตรวจครับ
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
              <span className="t-soft">ค่าจัดส่ง ({order.shippingLabel || order.shipping})</span>
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
            <div className="ord-title mt-3 flex justify-between pt-3 text-base" style={{ borderTop: "1px dashed var(--sky-200)" }}>
              <span>ยอดรวม</span>
              <span className="t-blue" style={{ fontWeight: 600 }}>{formatPrice(orderTotal(order))}</span>
            </div>
            {order.deposit && (
              <div className="ord-sub mt-2.5 space-y-1 p-2.5 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">มัดจำ 50% {order.deposit.firstPaidAt ? "· รับแล้ว ✓" : "· รอโอน"}</span>
                  <span className={order.deposit.firstPaidAt ? "t-ok" : "t-danger"}>{formatPrice(order.deposit.amount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="t-soft">ยอดคงเหลือ {order.deposit.settledAt ? "· ครบแล้ว ✓" : "· ชำระก่อนจัดส่ง"}</span>
                  <span className={order.deposit.settledAt ? "t-ok" : "t-danger"}>
                    {formatPrice(Math.max(0, orderTotal(order) - order.deposit.amount))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {order.tracking && (
            <div className="ord-note info p-4 sm:p-5">
              <p className="ord-eyebrow">เลขพัสดุ</p>
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
                    <p className="text-xs leading-relaxed text-white/90">
                      ทางบริษัทจะ<strong className="text-rose-300">จัดทำของแถมตามภาพที่อนุมัติทันที</strong> — หาก
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
                        ✅ ยืนยันอนุมัติแบบของแถม
                      </button>
                      <button
                        type="button"
                        onClick={() => setGiftLbConfirm(false)}
                        className={LB_QUIET}
                      >
                        ↩️ ขอดูอีกครั้ง
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
                    <p className="text-xs leading-relaxed text-white/90">
                      ทางบริษัทจะ<strong className="text-rose-300">จัดทำงานตามภาพที่อนุมัติทันที</strong> — หาก
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
                        ✅ ยืนยันอนุมัติ — ให้เริ่มผลิตได้เลย
                      </button>
                      <button
                        type="button"
                        onClick={() => setLbConfirm(false)}
                        className={LB_QUIET}
                      >
                        ↩️ ขอดูอีกครั้ง
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

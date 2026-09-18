"use client";

import { shrinkImageFile } from "@/lib/shrink-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { giftLinesOf, giftArtLabel } from "@/lib/gifts";
import Link from "next/link";
import ThaiPostTimeline from "@/components/ThaiPostTimeline";
import PrevNextNav from "@/components/admin/PrevNextNav";
import FlowAccountSync from "@/components/admin/FlowAccountSync";
/** ลิงก์หน้ารายละเอียดออเดอร์ — ประกาศนอกคอมโพเนนต์ให้ reference คงที่ */
const orderHref = (id: string) => `/admin/orders/${encodeURIComponent(id)}`;
import { useParams, useRouter } from "next/navigation";
import CameraScanner from "@/components/admin/CameraScanner";
import { PackNextToast, PackQueueStrip } from "@/components/admin/PackQueueStrip";
import { extractOrderId } from "@/lib/scan-code";
import { artQtyOf, artSizeOf, artSizeText, formatPrice, isRetailRateLine, productPath, type Product } from "@/lib/products";
import { imgVersion, versionedSrc } from "@/lib/img";
import { specialImageProductId, type SpecialProduct } from "@/lib/special-product-image";
import ProductVisual from "@/components/ProductVisual";
import { autoShipQuote } from "@/lib/shipping-auto";
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
import { proofIssues, productWordIndex, type ProductWordIndex } from "@/lib/proof-check";
import { PROOF_AUTO_NOTIFY_MINUTES, pendingProofs, pendingProofsLabel } from "@/lib/proof-notify";
import { fetchProductNamesLite, fetchProductsByIds } from "@/lib/product-repo";
import { itemPiecesLine, itemQtyText, orderQtyText, staleUnitYield } from "@/lib/item-yield";
import { SSR_ORDER_SCRIPT_ID } from "@/lib/ssr-order-id";
import {
  allSelfDesignedApproved,
  MOCK_ORDERS,
  ORDER_STATUSES,
  adminDiscountAmount,
  amountDueNow,
  hasUnpaidBalance,
  orderBalance,
  paidSoFar,
  daysToUseBy,
  itemDiscountAmount,
  isBlankOrder,
  lineChatOf,
  lineUserOf,
  earlyPayMsLeft,
  earlyPayState,
  orderEarlyPayAmount,
  reinstateEarlyPay,
  setEarlyPayWaived,
  orderItemDiscounts,
  orderFullyPaid,
  orderNetTransfer,
  orderCashReceived,
  orderBankFee,
  flowAccountBillTotal,
  flowAccountGap,
  orderBilledTotal,
  orderTotal,
  orderWhtAmount,
  orderVatAmount,
  orderTaxBase,
  orderTaxDrift,
  taxFromRate,
  depositInstallments,
  packGate,
  pickupRoundRef,
  planPendingReason,
  nextPlannedRound,
  partialGate,
  SPLIT_WHOLE_HINT,
  partialShipSummary,
  plannedProofRounds,
  proofKey,
  proofShipStates,
  roundSel,
  type ProofShipState,
  shipmentQty,
  orderHasTaxInvoice,
  orderNeedsTaxInvoiceInBox,
  orderAwaitingStock,
  taxInvoiceDocOf,
  applyArrival,
  arrivalOverdue,
  PROOF_STYLES,
  proofsOf,
  STATUS_STYLES,
  withLog,
  NOTE_COLORS,
  NOTE_SIZES,
  NOTE_WEIGHTS,
  noteHasText,
  orderStatusLabel,
  PROOF_UNITS,
  proofUnit,
  type Order,
  type OrderCharge,
  type OrderItem,
  type OrderPayment,
  type OrderStatus,
  type Shipment,
  type ShipPlanRound,
  type Proof,
  proofQtyCheck,
  orderedPieces,
  type ProofStatus,
  type NoteColor,
  type NoteSize,
  type NoteWeight,
  artworkSide,
  orderIdIn,
  reuseArtText,
} from "@/lib/admin-data";
import { overpaidAmount, paymentEntries, resolveSlipPhase, type PaymentEntry } from "@/lib/payments";
import { dealerRepriceBlockedBy } from "@/lib/order-dealer";
import { fetchOrderAdmin, fetchOrdersAdmin, notifyProofReady, packScanHeaders, saveOrderAdminResult, setPackScanMode, uploadProof } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { btnSm, btnSmNeutral, card, faint, muted, shortTime } from "@/lib/admin-ui";
import { Banner, CopyChip, GH, HBTN, LogTimeline, PageShell, soft } from "@/components/admin/ui";
import ImageLightbox from "@/components/ImageLightbox";
import Portal from "@/components/Portal";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import NeedsPurchaseStrip from "@/components/admin/NeedsPurchaseStrip";
import PackCheckPanel from "@/components/PackCheckPanel";
import ArrivalPicker, { arrivalSummary, fmtExpected, type ArrivalPatch } from "@/components/admin/ArrivalPicker";
import ItemAdder from "@/components/admin/ItemAdder";
import QuotePanel from "@/components/admin/QuotePanel";
import Barcode from "@/components/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { useActor, useCan, useIsAdministrator, usePermsReady, useRoleLabel } from "@/lib/perm-context";
import { PACK_SCAN_PARAM, PACK_SCAN_PERMS, type Perm } from "@/lib/permissions";
import { publicOrigin } from "@/lib/shop-info";
import { fetchShopPayment, freeShippingMinOf, shippingOf, type ShippingMethod } from "@/lib/shop-settings";
import SenderPicker from "@/components/admin/SenderPicker";
import { isPickupOrder, normalizeShipLabel, resolveShipLabel, shippingUnset } from "@/lib/ship-label";
import { parsePrintFrame, PLACEMENT_SPEC_LABEL } from "@/lib/design-templates";
import { buildPrintAi, downloadBlob } from "@/lib/print-ai";
import { buildTplMergedAi, layerSplitJsx } from "@/lib/template-merge-ai";
import { foldSizeExtra, specEntries, specLabel, tidySpec } from "@/components/SpecLines";
import { SEL_HIDE_PRODUCTION, SelDetails, SelText } from "@/components/admin/SelDetails";
import { applySelectionsDraft, artQtyUnitOf, selectionsDraft, selectionsDraftChanged, withArtQtyMap } from "@/lib/edit-selections";
import { uploadArtworkFile } from "@/lib/artwork-upload";
import { formatPhone } from "@/lib/contacts";
import { thaiDateTime } from "@/lib/bangkok-time";
import { SHIP_WINDOW_RULE, earliestShipDate, orderDateYmd, shipWindowForUseBy, shipWindowWarnings, shortThaiDay } from "@/lib/ship-date";
import HolidayDatePicker from "@/components/HolidayDatePicker";
import { useShopHolidays } from "@/lib/use-shop-holidays";
import { ContactChip, CustomerContactInput } from "@/components/admin/CustomerContactInput";

/** ค่าในช่องเลือกวิธีส่งที่แปลว่า "ให้ระบบคิดให้" — ไม่ใช่ id ของวิธีส่งจริง */
const AUTO_SHIP = "__auto__";

/** บรรทัดในเอกสาร FlowAccount ที่เป็น "ค่าส่ง" ไม่ใช่งานผลิต (ชุดเดียวกับกล่องสร้างออเดอร์จากลิงก์) */
const DOC_SHIP_RE = /ค่าจัดส่ง|ค่าส่ง|ค่าขนส่ง|shipping|delivery/i;

/**
 * 📱 เปิดหน้าออเดอร์นี้ "มาจากนอกเว็บ" หรือเปล่า — ใช้เดาว่าเป็นการสแกน QR จากใบงาน
 *
 * ทำไมต้องเดา: ใบงานที่ปริ้นไว้ก่อน 4 ก.ย. 69 มี QR รุ่นเก่าที่ไม่มี ?pack=1 ติดมาด้วย
 * กระดาษที่แจกไปแล้วแก้ไม่ได้ แต่พนักงานยังส่องใบเดิมอยู่ทุกวัน — เลยต้องรู้จักท่านี้ด้วย
 *
 * เงื่อนไขที่ถือว่า "มาจากนอกเว็บ" ครบทั้ง 3 ข้อ:
 *   1. หน้านี้คือหน้าที่เบราว์เซอร์โหลดมาทั้งหน้า (ไม่ใช่กดลิงก์ในเว็บแล้วเปลี่ยนหน้าแบบ SPA)
 *      — เทียบ path ปัจจุบันกับ URL ที่เอกสารถูกโหลดมา (PerformanceNavigationTiming.name)
 *   2. ไม่มี referrer จากโดเมนเราเอง (กล้องสแกน QR / LINE / พิมพ์ลิงก์เอง = ไม่มี referrer)
 *   3. ไม่ใช่การกดปุ่มย้อนกลับ (back_forward) — คนกดย้อนกลับตั้งใจกลับไปที่เดิม ไม่ใช่เพิ่งสแกน
 *
 * ผลของการเดา: ใช้ "ยืมสิทธิ์งานแพ็ค" ให้เท่านั้น (คนไม่มีสิทธิ์แก้ออเดอร์จะเห็นหน้าแพ็คเอง
 * ผ่าน isPackOnly) — ไม่ลากแอดมินที่กดลิงก์ธรรมดาจากนอกเว็บเข้าโหมดแพ็ค
 * โหมดแพ็คเด้งอัตโนมัติเฉพาะ QR รุ่นใหม่ที่มี ?pack=1 จริง
 */
function openedFromOutside(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward") return false;
    // URL ที่เอกสารถูกโหลดมาจริง — ถ้าตรงกับหน้าที่กำลังดูอยู่ แปลว่าเปิดหน้านี้ตรง ๆ ไม่ได้กดลิงก์ในเว็บมา
    if (!nav?.name || new URL(nav.name).pathname !== window.location.pathname) return false;
    return !document.referrer || !document.referrer.startsWith(window.location.origin);
  } catch {
    return false;
  }
}

/** จำว่าผู้ใช้กดออกจากโหมดแพ็คของใบนี้เองแล้ว — เก็บต่อแท็บ (ปิดแท็บแล้วลืม) */
const packOptOutKey = (orderId: string) => `ducky_pack_optout_${orderId}`;
/**
 * อ่านออเดอร์ที่ layout แปะมากับ HTML (ดู lib/server/order-ssr.ts)
 * อ่านครั้งเดียวแล้วล้างข้อความข้างในทิ้ง — กันของเก่าค้างตอนสลับไปดูออเดอร์ใบอื่นในแท็บเดิม
 * ⚠️ ห้าม el.remove() — แท็กนี้ React (layout) เป็นเจ้าของ ลบเองแล้วตอน React ถอดหน้า
 * จะเจอ NotFoundError: Failed to execute 'removeChild' on 'Node'
 */
function readSsrOrder(orderId: string): Order | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(SSR_ORDER_SCRIPT_ID);
  if (!el?.textContent) return null;
  try {
    const o = JSON.parse(el.textContent) as Order;
    return o?.id === orderId ? o : null;
  } catch {
    return null;
  } finally {
    el.textContent = "";
  }
}

function packOptedOut(orderId: string): boolean {
  try {
    return sessionStorage.getItem(packOptOutKey(orderId)) === "1";
  } catch {
    return false;
  }
}

/**
 * 🔢 ช่องแก้จำนวนต่อลายใต้รูป (เจ้าของร้านสั่ง 10 ก.ย. 69 "แก้ไขจำนวนต่อลายได้")
 * พิมพ์แล้วบันทึกตอน blur/Enter เฉพาะเมื่อค่าเปลี่ยน · ว่าง/0 = ไม่ระบุ (ลบออก) · Esc = คืนค่าเดิม
 * ถือค่าในช่องเอง ไม่ผูกกับ state ออเดอร์โดยตรง — โพลลิง 15 วิ จะไม่ทับตัวเลขที่กำลังพิมพ์
 */
function ArtQtyInput({
  value,
  unit,
  label,
  disabled,
  onCommit,
}: {
  value: number | undefined;
  unit: string;
  label: string;
  disabled?: boolean;
  onCommit: (qty: number | undefined) => void;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  const seen = useRef(value);
  // ค่าจริงเปลี่ยนจากทางอื่น (คนอื่นแก้/โพล) → ซิงก์เข้าช่อง เฉพาะตอนไม่ได้พิมพ์อยู่
  useEffect(() => {
    if (seen.current !== value) {
      seen.current = value;
      setText(value ? String(value) : "");
    }
  }, [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    const next = Number.isFinite(n) && n > 0 ? n : undefined;
    if (next === value) {
      setText(value ? String(value) : "");
      return;
    }
    seen.current = next;
    onCommit(next);
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] ring-1 ${
        value ? "ring-sky-300 text-sky-900" : "ring-slate-200 text-slate-500"
      }`}
      title={`${label} — กี่${unit} (ว่าง = ไม่ระบุ)`}
    >
      <span className="font-bold">×</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        placeholder="—"
        aria-label={`${label} จำนวน (${unit})`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(value ? String(value) : "");
            (e.target as HTMLInputElement).blur();
          }
        }}
        onFocus={(e) => e.target.select()}
        className="w-12 bg-transparent text-right font-bold tabular-nums outline-none placeholder:text-slate-300 disabled:opacity-50"
      />
      <span className="font-semibold">{unit}</span>
    </span>
  );
}

/**
 * 🔢 สรุปยอดจำนวนต่อลายเทียบกับที่สั่ง (ชิ้นจริง) — เฉพาะที่แนบ ≥ 2 รูปหรือมีการระบุแล้ว
 * งาน 2 ด้าน: ด้านหลังนับแยก ยอดต้องเท่าที่สั่งเหมือนด้านหน้า (ไม่ใช่บวกกัน)
 */
function ArtQtySummary({ it }: { it: OrderItem }) {
  const urls = it.artworkUrls ?? [];
  const back = (it.artworkBackUrls ?? []).filter((u) => urls.includes(u));
  const front = urls.filter((u) => !back.includes(u));
  const sum = (list: string[]) => list.reduce((s, u) => s + (artQtyOf(it, u, urls.indexOf(u)) ?? 0), 0);
  const filled = (list: string[]) => list.filter((u) => artQtyOf(it, u, urls.indexOf(u))).length;
  const f = sum(front);
  const b = sum(back);
  if (urls.length < 2 && !f && !b) return null;
  const ord = orderedPieces(it);
  const target = ord.pieces;
  const unit = artQtyUnitOf(it, ord.piece);
  const line = (name: string, total: number, list: string[]) => {
    if (!list.length) return null;
    const done = filled(list);
    const cls =
      !done ? "text-slate-500" : total === target ? "text-emerald-700" : done < list.length ? "text-sky-700" : "text-amber-700";
    const hint =
      !done ? "ยังไม่ระบุ" : total === target ? "✓ ครบ" : total < target ? `ขาด ${(target - total).toLocaleString("th-TH")}` : `เกิน ${(total - target).toLocaleString("th-TH")}`;
    return (
      <span className={`font-semibold tabular-nums ${cls}`}>
        {[name, done < list.length && done > 0 ? `ระบุ ${done}/${list.length} ลาย ·` : "", `รวม ${total.toLocaleString("th-TH")}/${target.toLocaleString("th-TH")} ${unit} (${hint})`]
          .filter(Boolean)
          .join(" ")}
      </span>
    );
  };
  return (
    <p className="mt-1.5 text-[11px] text-slate-500">
      🔢 จำนวนต่อลาย: {line(back.length ? "หน้า" : "", f, front)}
      {back.length ? <> · {line("หลัง", b, back)}</> : null}
      {ord.math ? <span className="ml-1 text-slate-400">· {ord.math}</span> : null}
    </p>
  );
}

/**
 * แยกลายที่แนบมาของรายการหนึ่ง ออกเป็น "ไฟล์พร้อมพิมพ์" (ลูกค้าออกแบบมาเอง ขนาดตรงกรอบ)
 * กับ "ไฟล์ภาพต้นฉบับ" (ไว้ทำงานใหม่)
 *
 * แยกออกมาเป็นฟังก์ชันเพราะต้องใช้สองที่: ตอนวาดรายการไฟล์ในแต่ละรายการสินค้า และตอนถามระดับ
 * ออเดอร์ว่า "มีไฟล์ที่ผูกเทมเพลตอยู่ไหม" — แถบสคริปต์แยกเลเยอร์ต้องขึ้นครั้งเดียวทั้งใบ
 * ไม่ใช่ทุกรายการ (ออเดอร์ 6 รายการเคยได้แถบเดิม 6 อัน)
 */
function printFilesOf(it: OrderItem, orderId: string, itemIndex: number) {
  const arts = it.artworkUrls ?? [];
  const specs = (it.sel?.[PLACEMENT_SPEC_LABEL] ?? "").split(" | ").filter(Boolean);
  const matched = specs.length > 0 && arts.length === specs.length;
  const sourceSet = new Set(specs.map((sp) => sp.match(/ต้นฉบับ:\s*(\S+)/)?.[1]).filter(Boolean) as string[]);
  const isReady = (u: string) => matched || (!sourceSet.has(u) && /\.jpe?g(\?|$)/i.test(u));
  const ready = arts.filter(isReady).map((u, n) => {
    const sp = specs[n] ?? specs[0] ?? "";
    return {
      u,
      no: n + 1,
      frame: parsePrintFrame(sp),
      dpi: sp.match(/(\d+)\s*DPI/)?.[1],
      source: sp.match(/ต้นฉบับ:\s*(\S+)/)?.[1],
      name: `${orderId}-item${itemIndex + 1}-ลาย${n + 1}-พร้อมพิมพ์.ai`,
    };
  });
  return { arts, specs, matched, ready, raw: arts.filter((u) => !isReady(u)) };
}

/** ขั้นถัดไปที่ "ปกติจะกด" ของแต่ละสถานะ — ทำเป็นปุ่มเดียวจบ ไม่ต้องเปิดลิสต์ยาว */
const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  รอชำระเงิน: { to: "ชำระแล้ว", label: "ยืนยันว่าเงินเข้าแล้ว" },
  รอตรวจสอบ: { to: "ชำระแล้ว", label: "สลิปถูกต้อง — ชำระแล้ว" },
  ชำระแล้ว: { to: "รอตรวจแบบ", label: "ส่งแบบให้ลูกค้าตรวจ" },
  รอตรวจแบบ: { to: "อนุมัติแบบ", label: "ลูกค้าอนุมัติแบบแล้ว" },
  แก้ไขแบบ: { to: "รอตรวจแบบ", label: "ส่งแบบที่แก้แล้วให้ตรวจ" },
  อนุมัติแบบ: { to: "กำลังผลิต", label: "เริ่มผลิต" },
  กำลังผลิต: { to: "จัดส่งแล้ว", label: "ส่งของแล้ว" },
  จัดส่งแล้ว: { to: "เสร็จสิ้น", label: "ปิดงาน — เสร็จสิ้น" },
};

/** จัดกลุ่มสถานะในเมนู "เปลี่ยนสถานะ" ให้หาง่ายกว่ารายการยาว 10 บรรทัด */
const STATUS_GROUPS: { title: string; items: OrderStatus[] }[] = [
  { title: "💰 การเงิน", items: ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว"] },
  { title: "🎨 แบบงาน", items: ["รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] },
  { title: "📦 ผลิต · จัดส่ง", items: ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"] },
];

const LBL = "text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400";
/* HBTN · GTONE · GH · soft ย้ายไปอยู่ชุดเครื่องมือกลาง @/components/admin/ui แล้ว — หน้าใบเสนอราคาใช้ชุดเดียวกัน */

/** sanitize HTML หมายเหตุ — เก็บเฉพาะ span/div/br + inline style color/font-size/font-weight (กัน XSS) */
function sanitizeNoteHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmpl = document.createElement("template");
  tmpl.innerHTML = html;
  const clean = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.parentNode?.removeChild(child);
        return;
      }
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (["span", "div", "br", "b", "strong", "font"].includes(tag)) {
        const { color, fontSize, fontWeight } = el.style;
        Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
        if (color) el.style.color = color;
        if (fontSize) el.style.fontSize = fontSize;
        if (fontWeight) el.style.fontWeight = fontWeight;
        clean(el);
        return;
      }
      // แท็กอื่น (script ฯลฯ) → แกะออก เหลือแต่ข้อความข้างใน
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
  };
  clean(tmpl.content);
  return tmpl.innerHTML;
}

/**
 * ช่องกรอกหมายเหตุใบงานแบบ rich text — เลือก(ไฮไลต์)คำที่ต้องการ แล้วกดสี/ขนาด/น้ำหนัก
 * ใช้กับเฉพาะส่วนที่เลือก (ไม่เปลี่ยนทั้งข้อความ) · เก็บเป็น HTML
 */
function RichNoteEditor({
  value,
  onChange,
  placeholder,
}: {
  value?: string;
  onChange: (html: string, commit: boolean) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * ค่าล่าสุดที่ "เราเป็นคนส่งออกไป" — ใช้แยกว่า value ที่ไหลกลับมาเป็นของเราเอง (ไม่ต้องเขียน DOM ซ้ำ เดี๋ยวเคอร์เซอร์เด้ง)
   * หรือมาจากภายนอก (โหลดใหม่/โพลลิง) ที่ต้องเติมลงช่อง
   * ⚠️ ต้องเริ่มที่ "" เสมอ ห้ามเริ่มด้วย value — contentEditable ไม่มี children จาก React ข้อความจึงต้องถูกเขียนลง DOM
   *    ด้วย effect ข้างล่างเท่านั้น · เดิมเริ่มด้วย value ทำให้ตอนที่ออเดอร์มาพร้อม HTML ตั้งแต่แรก (SSR seed)
   *    หรือกล่องหมายเหตุรายการที่เปิดมาพร้อมข้อความ effect เห็นว่า "เท่าเดิม" แล้วข้าม → ช่องว่างทั้งที่ DB มีข้อความ
   *    และถ้าแอดมินคลิกช่องแล้วออก ยังเซฟค่าว่างทับของเดิมอีก (OD-260908-1744 "หมายเหตุหายหลังรีเฟรช")
   */
  const lastPushed = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [empty, setEmpty] = useState(!noteHasText(value));

  // เคลียร์ตัวตั้งเวลาเซฟตอน unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ซิงก์ค่าจากภายนอกเข้า editor (รวมตอน mount) — ไม่ทับตอนแอดมินกำลังพิมพ์เอง
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((value ?? "") !== lastPushed.current && el.innerHTML !== (value ?? "")) {
      el.innerHTML = value ?? "";
      lastPushed.current = value ?? "";
      setEmpty(!el.textContent?.trim());
    }
  }, [value]);

  function push(commit: boolean) {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeNoteHtml(el.innerHTML);
    lastPushed.current = html;
    setEmpty(!el.textContent?.trim());
    onChange(html, commit);
  }

  // พิมพ์: อัปเดตจอทันที + เซฟอัตโนมัติหลังหยุดพิมพ์ ~0.6 วิ (กันข้อความหายถ้ารีเฟรชก่อน blur)
  function handleInput() {
    push(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => push(true), 600);
  }
  function handleBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    push(true);
  }

  function applyStyle(style: { color?: string; fontSize?: string; fontWeight?: string }) {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer) || range.collapsed) return; // ต้องเลือกคำก่อน
    const span = document.createElement("span");
    if (style.color) span.style.color = style.color;
    if (style.fontSize) span.style.fontSize = style.fontSize;
    if (style.fontWeight) span.style.fontWeight = style.fontWeight;
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const r2 = document.createRange();
    r2.selectNodeContents(span);
    sel.addRange(r2);
    push(true);
  }

  // กัน mousedown บนปุ่มไม่ให้ contentEditable เสียการไฮไลต์
  const keepSel = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          className="min-h-[44px] w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] leading-snug focus:border-amber-300 focus:outline-none"
        />
        {empty && placeholder && (
          <span className="pointer-events-none absolute left-2.5 top-1.5 text-sm text-slate-400">{placeholder}</span>
        )}
      </div>
      <div className="space-y-1.5 rounded-lg bg-slate-50/80 p-2 ring-1 ring-slate-100">
        <p className="text-[10px] text-slate-400">✏️ ไฮไลต์คำที่ต้องการก่อน แล้วกดสี/ขนาด/น้ำหนัก</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
              <button
                key={c}
                type="button"
                title={NOTE_COLORS[c].label}
                onMouseDown={keepSel}
                onClick={() => applyStyle({ color: NOTE_COLORS[c].hex })}
                className="h-4 w-4 rounded-full ring-2 ring-transparent transition hover:ring-slate-300"
                style={{ backgroundColor: NOTE_COLORS[c].hex }}
              />
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
            {(Object.keys(NOTE_SIZES) as NoteSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onMouseDown={keepSel}
                onClick={() => applyStyle({ fontSize: `${NOTE_SIZES[sz].px}px` })}
                className="border-r border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition last:border-r-0 hover:bg-slate-100"
              >
                {NOTE_SIZES[sz].label}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
            {(Object.keys(NOTE_WEIGHTS) as NoteWeight[]).map((w) => (
              <button
                key={w}
                type="button"
                onMouseDown={keepSel}
                onClick={() => applyStyle({ fontWeight: String(NOTE_WEIGHTS[w].css) })}
                style={{ fontWeight: NOTE_WEIGHTS[w].css }}
                className="border-r border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 transition last:border-r-0 hover:bg-slate-100"
              >
                {NOTE_WEIGHTS[w].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * เดา "จำนวน + หน่วย + รายละเอียด" จากชื่อไฟล์แบบงาน — กราฟฟิกตั้งชื่อไฟล์บอกไว้อยู่แล้ว ไม่ต้องมาพิมพ์ซ้ำ
 * จำนวนรับเฉพาะรูปแบบที่ตั้งใจบอกจริง ๆ กันเลขรหัสรูป (IMG_2345 · ลาย02 · 10x15cm) หล่นลงช่องจำนวน
 *   • ต่อท้ายด้วยหน่วย — "ลายหน้า 3 ชิ้น.png" · "3ใบ.jpg" · "3 pcs.png" · "เจตนา 5 เซ็ต.png" (ได้หน่วยมาด้วย)
 *   • ตัวคูณ x / × — "ลายหน้า x3.png" · "ลายหลัง 3x.jpg" (ไม่มีหน่วย = ชิ้น)
 * ไม่เจอตัวบอกจำนวนชัด ๆ = ปล่อยช่องจำนวนว่างให้แอดมินพิมพ์เอง
 * ส่วนที่เหลือของชื่อไฟล์ (ตัดนามสกุลกับตัวบอกจำนวนออกแล้ว) ลงช่อง "รายละเอียด" เสมอ — ไว้เทียบว่าอัปครบ/ไม่ซ้ำไฟล์
 */
function proofFromFileName(name: string): { qty?: number; unit?: string; note?: string } {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ");
  const ok = (n: string | undefined) => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 1 && v <= 99999 ? Math.floor(v) : undefined;
  };
  // ตัดตัวบอกจำนวนออกจากชื่อ เหลือแต่ชื่อลาย ("ลายหน้า x3" → "ลายหน้า") — เลขไปอยู่ช่องจำนวนแล้ว ไม่ต้องซ้ำ
  const cut = (m: RegExpMatchArray) => {
    const at = m.index ?? 0;
    return noteFromFileName(base.slice(0, at) + base.slice(at + m[0].length));
  };
  // 1) ตัวเลข + หน่วยนับ (ชัดที่สุด) — เก็บหน่วยไว้ด้วย งานเซ็ตจะได้ไม่ไปโผล่ในใบงานว่า "ชิ้น"
  const unit = base.match(/(\d{1,5})\s*(ชิ้น|ใบ|ดวง|อัน|ตัว|แผ่น|เส้น|คู่|ชุด|เซ็ต|เซต|เล่ม|sets|set|pcs|pc)(?![ก-๙a-z0-9])/i);
  if (unit) {
    const qty = ok(unit[1]);
    if (qty) return { qty, unit: normalizeProofUnit(unit[2]), note: cut(unit) };
  }
  // 2) x นำหน้าเลข — x ต้องขึ้นต้นคำ ("max3" ไม่นับ) และหลังเลขต้องจบคำ ("x10x15" ไม่นับ)
  const mulPre = base.match(/(?:^|[\s\-([])[x×]\s*(\d{1,5})(?![\d.,ก-๙a-z])/i);
  if (mulPre?.[1] && ok(mulPre[1])) return { qty: ok(mulPre[1]), note: cut(mulPre) };
  // 3) เลขนำหน้า x — "3x" ต้องจบคำ ("10x15" ไม่นับ)
  const mulPost = base.match(/(?:^|[\s\-([])(\d{1,5})\s*[x×](?![\d.,ก-๙a-z])/i);
  if (mulPost?.[1] && ok(mulPost[1])) return { qty: ok(mulPost[1]), note: cut(mulPost) };
  return { note: noteFromFileName(base) };
}

/** ชื่อไฟล์ → ข้อความช่อง "รายละเอียด" — ยุบช่องว่าง ตัดตัวคั่นหัวท้าย และตัดที่ยาวเกินช่อง */
function noteFromFileName(raw: string): string | undefined {
  const txt = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—·.,()[\]]+/, "")
    .replace(/[\s\-–—·.,()[\]]+$/, "")
    .trim();
  if (!txt) return undefined;
  return txt.length > 60 ? `${txt.slice(0, 60)}…` : txt;
}

/** คำหน่วยจากชื่อไฟล์ → คำที่ระบบใช้จริง (set/sets → เซ็ต · pc/pcs → ชิ้น) */
function normalizeProofUnit(raw: string): string {
  const w = raw.trim().toLowerCase();
  if (w === "set" || w === "sets" || w === "เซต") return "เซ็ต";
  if (w === "pc" || w === "pcs") return "ชิ้น";
  return raw.trim();
}

/**
 * ช่อง "รายละเอียด" ของแบบ 1 รูป — ยืดความสูงตามข้อความเอง ไม่ตัดคำทิ้ง
 * ทำไมไม่ใช้ input บรรทัดเดียว: รายละเอียดมาจากชื่อไฟล์ ("(2ด้าน)Photocard 30") การ์ดกว้างแค่ 144px
 * ข้อความจะโดนตัดหายไปครึ่งหนึ่ง กราฟฟิกอ่านไม่ออกว่ารูปนี้คือลายอะไร
 */
function ProofNoteInput({
  value,
  label,
  onChange,
  onBlur,
}: {
  value: string;
  label: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // ยืด/หดตามจำนวนบรรทัดจริงทุกครั้งที่ข้อความเปลี่ยน (ตอนพิมพ์เองและตอนระบบเติมชื่อไฟล์ให้)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="รายละเอียด เช่น ลายหน้า"
      aria-label={label}
      title={value ? `${value}\n\n(ระบบเติมชื่อไฟล์ที่ลากเข้ามาให้ — แก้ทับได้)` : "ระบบเติมชื่อไฟล์ที่ลากเข้ามาให้ — แก้ทับได้"}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      // Enter = บันทึกแล้วออกจากช่อง (ไม่ต้องขึ้นบรรทัดใหม่ในชื่อลาย) · Shift+Enter ถ้าอยากขึ้นบรรทัดจริง ๆ
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="w-full resize-none overflow-hidden break-words rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] leading-snug focus:border-violet-300 focus:outline-none"
    />
  );
}

/** กี่บรรทัดถึงจะพับ — เหลือพื้นที่ให้รูปแบบงานที่อยู่ถัดลงไป */
const MAX_PROOF_ISSUES = 4;

/**
 * ตรวจชุดแบบก่อนส่งให้ลูกค้า — จับพลาดตอนลากไฟล์เข้ามา: ลากไฟล์เดิมซ้ำ · ชื่อลายซ้ำ · ยังไม่ระบุจำนวน · ยอดรวมไม่ตรงกับที่สั่ง
 * ทำไมต้องมี: กราฟฟิกลากไฟล์ทีละหลายสิบรูป ไฟล์เดิมหลุดมาซ้ำหรือตกลายไปหนึ่งตัวมองด้วยตาไม่ทัน
 * กว่าจะรู้คือลูกค้าอนุมัติไปแล้ว/ฝ่ายแพ็คนับไม่ครบ
 */
function ProofDropCheck({
  proofs,
  item,
  catalog,
  onSetPerUnit,
}: {
  proofs: Proof[];
  item: OrderItem;
  /** คำเฉพาะของสินค้าทั้งร้าน — ใช้จับไฟล์ของงานอื่นที่ปนมา (ยังโหลดไม่เสร็จ = ข้ามข้อนี้) */
  catalog?: ProductWordIndex;
  /** แอดมินตั้ง "1 เซ็ต = กี่ชิ้น" ให้รายการนี้ (undefined = ไม่มีสิทธิ์แก้) */
  onSetPerUnit?: (per: number) => void;
}) {
  /** กล่องเตือนยาวเกิน 4 บรรทัดให้ย่อไว้ก่อน — ไม่งั้นดันรูปแบบงานตกจอ ต้องเลื่อนหาทุกที */
  const [allIssues, setAllIssues] = useState(false);
  const qc = proofQtyCheck(item, proofs);
  const list = proofIssues(item, proofs, catalog);
  if (proofs.length === 0) return null;

  /* งานเซ็ตที่ยังไม่ได้ตั้งตัวคูณ — ให้ตั้งตรงนี้ได้เลย ตั้งแล้วทั้งใบงาน/โหมดแพ็คใช้เลขเดียวกันหมด */
  const perUnitRow = qc.needPerUnit && onSetPerUnit && (
    <PerUnitSetter
      unit={qc.saleUnit}
      qty={item.qty}
      suggest={qc.suggestPer}
      current={qc.per}
      piece={qc.piece}
      onSet={onSetPerUnit}
    />
  );

  if (!list.length)
    return (
      <>
        {perUnitRow}
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-emerald-800 ring-1 ring-emerald-200">
          ✅ ตรวจแล้ว — {proofs.length} รูป รวม {qc.total} {qc.unit} ตรงกับที่ลูกค้าสั่งพอดี
          {qc.per > 1 && <span className="font-normal"> ({qc.math})</span>}
        </p>
      </>
    );

  const bad = list.some((x) => x.level === "warn");
  return (
    <>
      {perUnitRow}
      <div
        className={`mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ring-1 ${
          bad ? "bg-rose-50 text-rose-800 ring-rose-300" : "bg-amber-50 text-amber-900 ring-amber-300"
        }`}
      >
        <p className="font-extrabold">
          {bad ? "⚠️ ตรวจแล้ว — มีจุดที่ต้องแก้ก่อนส่งให้ลูกค้า" : "💡 ตรวจแล้ว — มีจุดที่ควรเช็ก"}
          {list.length > 1 ? ` (${list.length} ข้อ)` : ""}
        </p>
        <ul className="mt-1 space-y-0.5">
          {(allIssues ? list : list.slice(0, MAX_PROOF_ISSUES)).map((x, k) => (
            <li key={k} className={x.level === "warn" ? "font-bold" : "font-normal opacity-90"}>
              {x.level === "warn" ? "⚠️ " : "· "}
              {x.text}
            </li>
          ))}
        </ul>
        {list.length > MAX_PROOF_ISSUES && (
          <button type="button" onClick={() => setAllIssues((v) => !v)} className="mt-1 font-extrabold underline underline-offset-2">
            {allIssues ? "ย่อลง ▴" : `+ อีก ${list.length - MAX_PROOF_ISSUES} ข้อ ▾`}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * 📐 ชิป "สั่ง 2 แผ่น A3 ได้ 56 ชิ้น" ใต้สเปครายการ + จุดแก้ตัวคูณ "1 แผ่น = กี่ชิ้น" ที่กดได้ทุกเมื่อ
 * ทำไมต้องแก้ได้ตรงนี้: ตัวคูณแช่ไว้ตอนสั่ง ร้านแก้ตาราง/กติกาชิ้นต่อแผ่นทีหลัง ใบเก่าค้างเลขเดิม
 * เดิมจุดแก้มีที่เดียวคือกล่องฟ้าในกล่องแบบงาน ซึ่งขึ้นหลังอัปแบบและป้ายหารลงตัวเท่านั้น — ใบที่ลูกค้าโอนแล้ว
 * แต่ยังไม่มีแบบ แอดมินเห็นเลขผิดก็แก้ไม่ได้ (OD-260915-9168 · 17 ก.ย. 69 · แช่ 24 สินค้าวันนี้ 28)
 * ตัวคูณไม่เกี่ยวกับยอดเงิน (ราคาคิดต่อหน่วยขาย) จึงแก้ได้แม้ชำระแล้ว
 */
function ItemPiecesChip({
  item,
  product,
  onSetPerUnit,
}: {
  item: OrderItem;
  product?: Product | null;
  /** undefined = ไม่มีสิทธิ์แก้ (เห็นแต่ชิป) */
  onSetPerUnit?: (per: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const line = itemPiecesLine(item, product);
  if (!line) return null;
  const stale = onSetPerUnit ? staleUnitYield(item, product) : null;
  const unit = item.unitYield?.unit || stale?.unit || "หน่วย";
  const piece = item.unitYield?.piece || "ชิ้น";
  return (
    <div className="mt-1">
      <p
        title="จำนวนชิ้นรวมที่ต้องทำ — คูณจากจำนวนที่ลูกค้าสั่ง"
        className="inline-block rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-800 ring-1 ring-indigo-200"
      >
        {line}
      </p>
      {onSetPerUnit && item.unitYield?.per ? (
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title={`แก้ว่า 1 ${unit} ได้กี่${piece} — ใช้เมื่อเลขไม่ตรงกับที่จัดวางได้จริง · ไม่กระทบยอดเงิน แก้ได้แม้ลูกค้าโอนแล้ว`}
          className="ml-1 whitespace-nowrap rounded px-1 text-[10px] font-bold text-sky-600 transition hover:bg-sky-50"
        >
          ✏️ แก้จำนวนต่อ{unit}
        </button>
      ) : null}
      {stale && onSetPerUnit && (
        <p className="mt-1 rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold leading-relaxed text-sky-900 ring-1 ring-sky-300">
          {`🕰 ใบนี้นับไว้ 1 ${unit} = ${item.unitYield!.per.toLocaleString("th-TH")} ${piece} (เลขวันที่สั่ง) · สินค้าวันนี้คิดได้ ${stale.per.toLocaleString("th-TH")} ${stale.piece} `}
          <button
            type="button"
            onClick={() => onSetPerUnit(stale.per)}
            className="rounded-lg bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white transition hover:bg-sky-700"
          >
            {`✔ ใช้ ${stale.per.toLocaleString("th-TH")} ${stale.piece} (รวม ${(item.qty * stale.per).toLocaleString("th-TH")} ${stale.piece})`}
          </button>
        </p>
      )}
      {editing && onSetPerUnit && (
        <PerUnitSetter
          unit={unit}
          qty={item.qty}
          suggest={0}
          current={item.unitYield?.per ?? 1}
          piece={piece}
          manual
          onSet={(per) => {
            onSetPerUnit(per);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * ตั้ง "1 เซ็ต = กี่ชิ้น" ให้รายการนี้ — งานที่ขายเป็นเซ็ต/ชุด/แผ่น ระบบไม่รู้เองว่าเซ็ตละกี่ชิ้น
 * ตั้งแล้วใช้ต่อทุกที่: แถบเทียบจำนวน · แถบตรวจชื่อไฟล์ · โหมดแพ็ค (หัวรายการขึ้น "12 เซ็ต = 240 ชิ้น")
 * ระบบเดาให้ได้เมื่อป้ายบนแบบรวมแล้วหารจำนวนที่สั่งลงตัว — กดปุ่มยืนยันทีเดียวจบ
 */
function PerUnitSetter({
  unit,
  qty,
  suggest,
  current,
  piece,
  manual,
  onSet,
}: {
  unit: string;
  qty: number;
  suggest: number;
  /** ตัวคูณที่รายการนี้ถืออยู่ตอนนี้ (1 = ยังไม่เคยตั้ง) */
  current: number;
  /** คำเรียกชิ้นย่อย เช่น "ใบ" */
  piece: string;
  /** เปิดจากปุ่ม "แก้จำนวนต่อหน่วย" เอง (ไม่ได้ขึ้นเพราะป้ายบนแบบไม่ตรง) — ตัดท่อน "แบบที่ทำมาไม่ตรง" ออก */
  manual?: boolean;
  onSet: (per: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const save = (v: number) => {
    if (v >= 1 && v <= 99999) onSet(Math.floor(v));
    setDraft("");
  };
  return (
    <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900 ring-1 ring-sky-300">
      <p className="font-extrabold">
        📦 งานนี้ขายเป็น “{unit}” — สั่ง {qty} {unit} ·{" "}
        {current > 1
          ? `ตอนนี้นับไว้ 1 ${unit} = ${current} ${piece} (เลขวันที่สั่ง)${manual ? "" : " แต่แบบที่ทำมาไม่ตรงกับเลขนี้"}`
          : `ยังไม่ได้ตั้งว่า 1 ${unit} เท่ากับกี่${piece}`}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {suggest > 0 && (
          <button
            type="button"
            onClick={() => save(suggest)}
            className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-sky-700"
          >
            ✔ {current > 1 ? "แก้เป็น" : "ตั้งเป็น"} 1 {unit} = {suggest} {piece} (ตรงกับป้ายบนแบบพอดี)
          </button>
        )}
        <span className="text-sky-700">หรือพิมพ์เอง 1 {unit} =</span>
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(Number(draft));
          }}
          onBlur={() => draft && save(Number(draft))}
          aria-label={`1 ${unit} เท่ากับกี่ชิ้น`}
          className="w-16 rounded-md border border-sky-300 px-1.5 py-0.5 text-center focus:border-sky-500 focus:outline-none"
        />
        <span className="text-sky-700">{piece}</span>
      </div>
    </div>
  );
}

/** ชื่อรายการเก็บเพิ่มที่ใช้บ่อย — กดเลือกแล้วแก้ต่อได้ */
const CHARGE_PRESETS = ["ค่าตัดภาพ", "ค่าส่งเพิ่ม", "ค่าเร่งงาน", "ค่าแก้ไฟล์", "ค่าออกแบบ"];

/**
 * แถบผลตรวจสลิปอัตโนมัติ (SlipOK) — ใช้ซ้ำทุกใบ (ใบแรก/งวดหลัง/ใบเพิ่ม)
 * credited = ยอดที่ใบนี้นับเข้าออเดอร์แล้วทั้งที่ตรวจ "ไม่ผ่าน" (สลิปแท้แต่โอนขาด → รับบางส่วน)
 */
function SlipVerifyNote({ v, credited, settled = true, onRecheck, rechecking }: { v: NonNullable<Order["slipVerify"]>; credited?: number; /** งวดของสลิปใบนี้ยืนยันเงินบนออเดอร์แล้วจริง — false = ผลตรวจผ่านแต่ใบยังค้างขั้นรอเงิน (ผลถูกลงย้อนหลัง/ซ่อมยอด) ห้ามเขียนว่า "ยืนยันให้อัตโนมัติ" */ settled?: boolean; onRecheck?: () => void; rechecking?: boolean }) {
  const partial = v.status !== "pass" && (credited ?? 0) > 0;
  return (
    <div
      className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${
        v.status === "pass" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : partial ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-amber-50 text-amber-800 ring-amber-200"
      }`}
    >
      {v.status === "pass" ? (
        <>
          ✅ SlipOK ตรวจแล้ว: ยอดถูกต้อง {v.amount ? formatPrice(v.amount) : ""}
          {settled ? " — นับยอด/ยืนยันการชำระให้อัตโนมัติ" : ""}
          {v.transRef ? ` · อ้างอิง ${v.transRef}` : ""}
          {/* ผลผ่านแต่ใบยังอยู่ขั้นรอเงิน = ผลถูกลงทีหลัง (ซ่อมยอด) ไม่ได้ผ่านตอนตรวจสด — เจ้าของร้านเห็น "ยืนยันให้อัตโนมัติ" แล้วเข้าใจว่าสถานะเปลี่ยนแล้ว (OD-260915-1705 · 16 ก.ย. 69) */}
          {!settled && (
            <span className="mt-1 block text-amber-700">⚠️ ยอดถูกแต่ใบยังอยู่ขั้น "รอตรวจสอบ" — ผลตรวจนี้ถูกลงย้อนหลังตอนแก้ยอด ไม่ได้ผ่านตอนตรวจสด กด "ยืนยันเงินเข้า" ด้านบนเพื่อปิดใบ</span>
          )}
          {v.deduction && (
            /*
             * เขียนเป็นสมการ "ยอดบิล − ส่วนต่าง = ยอดโอน ✓ ครบ" — เดิมเขียน "โอนน้อยกว่ายอดตั้ง ฿45.60"
             * เจ้าของร้านอ่านเป็น "ขาด 45.60" ทั้งที่ใบนับครบแล้ว (OD-260915-1705 · 16 ก.ย. 69)
             * หัก ณ ที่จ่าย = ภาษีที่ลูกค้าหักส่งสรรพากรแทนร้าน ร้านได้คืนเป็นเครดิตภาษีผ่านใบ 50 ทวิ ไม่ใช่ยอดค้าง
             */
            <span className="mt-1 block text-sky-700">
              {/* ขึ้นต้นด้วยเงินเข้าจริงเสมอ (ท่าเดียวกับกล่องสรุป รับแล้ว/ยอดบิล) — "ยอดบิล − หัก = โอน" ยังอ่านเป็นยอดบิลก่อน เจ้าของร้านทัก 16 ก.ย. 69 */}
              ✓ เงินเข้าจริง {formatPrice(v.amount ?? 0)} + {v.deduction.label} {formatPrice(v.deduction.amount)} = ยอดบิล{" "}
              {formatPrice(Math.round(((v.amount ?? 0) + v.deduction.amount) * 100) / 100)} ครบ
              {v.deduction.kind === "wht"
                ? ` · ${formatPrice(v.deduction.amount)} ไม่ใช่เงินที่ร้านได้รับและไม่ใช่ยอดค้าง — เป็นภาษีที่ลูกค้าหักส่งสรรพากรแทนร้าน ตามใบ 50 ทวิที่ลูกค้าส่งมาเก็บไว้`
                : v.deduction.kind === "bankFee"
                  ? " · ค่าธรรมเนียมที่ธนาคารหัก ไม่ต้องทวงลูกค้า"
                  : ""}
            </span>
          )}
          {(v.over ?? 0) > 0 && (
            <span className="mt-1 block text-amber-700">⚠️ โอนเกินยอดที่ต้องชำระ {formatPrice(v.over!)} — คืนลูกค้า หรือแปลงเป็นแต้ม</span>
          )}
        </>
      ) : partial ? (
        <>
          💸 สลิปแท้แต่โอนขาด — SlipOK อ่านยอด {formatPrice(v.amount ?? credited ?? 0)} นับเข้าออเดอร์แล้ว {formatPrice(credited!)} · ส่วนที่เหลือรอลูกค้าโอนเพิ่ม (แจ้งไลน์แล้ว)
          {v.transRef ? ` · อ้างอิง ${v.transRef}` : ""}
        </>
      ) : (
        <>
          ⚠️ SlipOK ตรวจไม่ผ่าน{v.detail ? `: ${v.detail}` : ""} — กรุณาตรวจสลิปเอง
          {/* 🔄 ยิง SlipOK ซ้ำด้วยไฟล์เดิม — เคสลูกค้าแนบเร็วกว่าธนาคารส่งข้อมูล (1010) รอสักครู่แล้วกดตรวจใหม่ก็ผ่านได้ ไม่ต้องลบ/แนบใหม่ */}
          {onRecheck && !v.noRetry && (
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onRecheck}
                disabled={rechecking}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {rechecking ? "⏳ กำลังตรวจ…" : "🔄 ตรวจสลิปอีกครั้ง"}
              </button>
              <span className="font-normal text-amber-700">ถ้าลูกค้าเพิ่งโอน รอ 2 นาทีแล้วกดตรวจใหม่ได้เลย</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = decodeURIComponent(String(params?.id ?? ""));

  const [order, setOrder] = useState<Order | null>(null);
  /**
   * 🧭 ก้อนล่าสุดที่ "เซิร์ฟเวอร์ให้มา" (โหลด · โพล · ก้อนที่ตอบกลับหลังบันทึก) — ไว้เทียบว่าหน้านี้แก้ช่องไหนจริงตอนส่ง PATCH
   * (changedOrderKeys → header x-changed-keys) ช่องที่ไม่ได้แก้ เซิร์ฟเวอร์เอาจากฐานเสมอ หน้าจอที่เปิดค้างจึงทับงานคนอื่นไม่ได้
   * ไม่อัปเดตในบางทาง (ตอบกลับจาก route อื่น) = ช่องนั้นถูกมองว่า "แก้" → เซิร์ฟเวอร์ทำแบบเดิม ปลอดภัยฝั่งเดียว
   */
  const baseRef = useRef<Order | null>(null);
  const adoptFromServer = useCallback((o: Order | null | undefined) => {
    if (o) baseRef.current = o;
  }, []);
  /** รับก้อนที่ route อื่นตอบกลับ (สลิป/ไลน์/ตัวแทน/แบบงาน/รูปแพ็ค…) มาเป็น state + base พร้อมกัน */
  const adoptOrder = useCallback((o: Order | null | undefined) => {
    if (!o) return;
    baseRef.current = o;
    setOrder(o);
  }, []);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  // 📣 แจ้งลูกค้าทางไลน์ครั้งเดียวหลังอัปแบบครบชุด — ตัวอัปโหลดยิงแบบ silent · แถบเตือนนับจาก order.proofNotifiedAt · cron แจ้งเองถ้าค้างเกิน 30 นาที
  const [notifyingProof, setNotifyingProof] = useState(false);
  // ผลการกดล่าสุด โชว์ในกล่องของรายการที่กด
  const [proofNotifyMsg, setProofNotifyMsg] = useState<{ item: number; text: string } | null>(null);
  async function notifyProofs(itemIndex: number, force = false) {
    if (!order || notifyingProof) return;
    if (demo) {
      setErr("ออเดอร์ตัวอย่าง — แจ้งลูกค้าได้เฉพาะออเดอร์จริง");
      return;
    }
    if (force) {
      const ok = await askConfirm({
        icon: "📣",
        title: "แจ้งลูกค้าซ้ำอีกครั้ง?",
        detail: "ไม่มีรูปใหม่ค้างแจ้ง — ระบบจะส่งไลน์ย้ำว่าแบบงานพร้อมให้ตรวจ (ทุกรูปที่ลูกค้ายังไม่อนุมัติ)",
        confirmLabel: "แจ้งอีกครั้ง",
      });
      if (!ok) return;
    }
    setNotifyingProof(true);
    setProofNotifyMsg(null);
    const res = await notifyProofReady(order.id, force);
    setNotifyingProof(false);
    if (!res.ok) {
      setErr(res.error ?? "แจ้งลูกค้าไม่สำเร็จ");
      return;
    }
    adoptOrder(res.order);
    setProofNotifyMsg({
      item: itemIndex,
      text: res.skipped
        ? "ไม่มีแบบให้แจ้ง"
        : res.sent
          ? `✅ แจ้งลูกค้าทางไลน์แล้ว (${res.count} รูป)`
          : `⚠️ ส่งไลน์ไม่ถึงลูกค้า — ${res.reason ?? "ไม่ทราบสาเหตุ"} · บันทึกไว้ในประวัติแล้ว`,
    });
  }
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [err, setErr] = useState("");
  /** กล่องยืนยันของระบบเอง — แทน confirm() ของเบราว์เซอร์ (ใช้ตัวเดียวกับหน้าอื่นในหลังบ้าน) */
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  // แอดมินแก้ "รายละเอียดงาน" ของรายการที่ลูกค้าสั่งได้ (แก้ได้เฉพาะรายละเอียด — ชื่อ/จำนวนไม่แตะ)
  const [editSel, setEditSel] = useState<number | null>(null);
  const [selDraft, setSelDraft] = useState("");
  /** ✏️ ชื่อรายการระหว่างแก้ (ช่องเดียวกับแก้รายละเอียด — เจ้าของร้านสั่ง 11 ก.ย. 69 ให้แก้หัวข้อรายการได้) */
  const [nameDraft, setNameDraft] = useState("");
  // 💬 ตีราคา — งานสั่งทำ (กำหนดขนาดเอง/ช่องกรอก) เข้ามาที่ราคา ฿0 แอดมินใส่ราคาต่อหน่วยที่นี่
  const [editPrice, setEditPrice] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  /**
   * 🔢 แก้จำนวนในออเดอร์ได้เหมือนตะกร้า (เจ้าของร้านสั่ง 10 ก.ย. 69) — ต้องรู้จักตัวสินค้าจริงถึงจะคิด
   * ราคาขั้นบันได/สลับเรทให้ถูก → โหลดสินค้าของทุกรายการในออเดอร์ทีเดียว (เฉพาะคนที่แก้ออเดอร์ได้)
   * ที่ถามไปแล้วไม่ได้กลับมา (สินค้าถูกลบ) จำไว้ ไม่ถามซ้ำทุกรอบ
   */
  const [shopProducts, setShopProducts] = useState<Map<string, Product>>(() => new Map());
  const askedProductIds = useRef<Set<string>>(new Set());
  /** ข้อความในช่องจำนวนระหว่างพิมพ์ (บันทึกตอนออกจากช่อง/Enter) */
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  /** กันแทนที่รายการซ้ำระหว่างรอผลบันทึกของรอบก่อน */
  const replaceBusy = useRef(false);
  /**
   * บันทึกชื่อ + รายละเอียดของรายการจากช่องแก้ (ช่องเดียวกัน)
   * ชื่อ: ว่าง = คงชื่อเดิม · เปลี่ยนชื่อต้องแนบ nameWas (ชื่อเดิม) ไปด้วย — เซิร์ฟเวอร์จับคู่รายการตามลำดับ+ชื่อ
   * ไม่แนบ = ถูกมองเป็นรายการใหม่ ติ๊กกราฟฟิก/แบบงานที่คนอื่นเพิ่งทำระหว่างหน้านี้เปิดค้างจะหาย (reconcileFullEdit)
   */
  function saveSelections(itemIndex: number, text: string, name?: string) {
    if (!order) return;
    const cur = order.items[itemIndex];
    setEditSel(null);
    if (!cur) return;
    const newName = (name ?? cur.name).trim() || cur.name;
    const nameChanged = newName !== cur.name;
    const selChanged = selectionsDraftChanged(cur, text);
    if (!nameChanged && !selChanged) return;
    // ⚠️ ทุกจออ่านตัวเลือกแบบหัวข้อ (sel) ก่อนข้อความ — ต้องเขียนกลับทั้ง sel และ selections ไม่งั้นแก้แล้วไม่เปลี่ยน (ดู lib/edit-selections)
    const patch: Partial<OrderItem> = selChanged ? applySelectionsDraft(cur, text) : {};
    if (nameChanged) {
      patch.name = newName;
      patch.nameWas = cur.name; // ชื่อที่ฐานถืออยู่ (บันทึกสำเร็จแล้วถอด nameWas ออก → แก้ซ้ำรอบต่อไปยังจับคู่ถูก)
    }
    const items = order.items.map((it, i) => (i === itemIndex ? { ...it, ...patch } : it));
    const what = nameChanged && selChanged ? "แก้ชื่อ+รายละเอียดรายการ" : nameChanged ? "แก้ชื่อรายการ" : "แก้รายละเอียดรายการ";
    const next = withLog({ ...order, items }, actor, what, nameChanged ? `${cur.name} → ${newName}` : cur.name);
    setOrder(next);
    if (demo) return;
    void saveOrWarn(next).then((ok) => {
      if (!ok || !nameChanged) return;
      setOrder((o) => (o ? { ...o, items: o.items.map((it) => (it.nameWas ? { ...it, nameWas: undefined } : it)) } : o));
    });
  }

  /*
   * คลังคำเฉพาะของสินค้าทั้งร้าน — ใช้จับ "ไฟล์ของงานอื่นปนมา" จากชื่อไฟล์
   * โหลดทีหลังและเฉพาะตอนมีแบบงานให้ตรวจ (~35KB) จะได้ไม่ถ่วงหน้าออเดอร์ตอนเปิด
   */
  const [nameIndex, setNameIndex] = useState<ProductWordIndex>();
  const hasProofs = (order?.items ?? []).some((it) => proofsOf(it).length > 0);
  useEffect(() => {
    if (!hasProofs || nameIndex) return;
    let alive = true;
    void fetchProductNamesLite()
      .then((rows) => {
        if (alive) setNameIndex(productWordIndex(rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }))));
      })
      .catch(() => {
        /* โหลดคลังชื่อไม่ได้ = ข้ามการจับไฟล์ข้ามงาน ตัวตรวจอื่นยังทำงานปกติ */
      });
    return () => {
      alive = false;
    };
  }, [hasProofs, nameIndex]);

  /**
   * ตั้ง "1 เซ็ต/ชุด/แผ่น = กี่ชิ้น" ให้รายการนี้ (แช่ลงออเดอร์ ไม่ไปแก้สินค้า)
   * งานที่ขายเป็นหน่วยรวมและร้านยังไม่ได้ตั้ง piecesPerUnit ไว้ที่สินค้า ระบบเดาเองไม่ได้ —
   * ตั้งที่นี่ทีเดียว ใช้ต่อทั้งแถบเทียบจำนวน ใบงาน และโหมดแพ็ค
   */
  function setItemPerUnit(itemIndex: number, per: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it) return;
    const unit = it.unitYield?.unit || "หน่วย";
    const items = order.items.map((x, i) =>
      i === itemIndex ? { ...x, unitYield: { per, piece: x.unitYield?.piece || "ชิ้น", unit } } : x
    );
    const next = withLog({ ...order, items }, actor, "ตั้งจำนวนต่อหน่วย", `${it.name} — 1 ${unit} = ${(it.unitYield?.per ?? 0) > 1 && it.unitYield!.per !== per ? `${it.unitYield!.per} → ` : ""}${per} ชิ้น`);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * รายการนี้แก้ราคาต่อหน่วยได้ไหม
   *   • ยังไม่ตีราคา (฿0) → แก้ได้เสมอ — ใส่ราคาทีหลังไม่ทำให้ยอดขัดกับสลิปที่โอนมาแล้ว (ไปโผล่เป็น "ยอดค้างชำระ")
   *   • ตีไปแล้วและลูกค้าโอนมาแล้ว → ล็อก กันยอดในบิลไม่ตรงกับสลิป/เรคอร์ดที่ส่ง msVerify ไปแล้ว
   * งานเคลมตั้งใจให้ ฿0 — ไม่ต้องตีราคา
   */
  function mayQuote(it: OrderItem): boolean {
    if (!mayEdit || !seesMoney || !order) return false;
    if (order.claimOf) return false;
    if (it.unitPrice <= 0) return true;
    const moneyIn = (order.paidTotal ?? 0) > 0 || !!order.slipUrl || !!order.slipPath || !!order.deposit?.firstPaidAt;
    return !moneyIn;
  }

  /**
   * บันทึกผลการตีราคาของรายการ — ราคา/หน่วย และ/หรือ "ที่มาของราคา" ในครั้งเดียว
   *
   * ⚠️ ต้องรวมเป็นฟังก์ชันเดียว: ถ้าแยกสองฟังก์ชันแล้วถูกเรียกติด ๆ กัน (เช่นกดปุ่ม
   * "บันทึกราคา" ที่ต้องเก็บทั้งสองอย่าง) ทั้งคู่จะอ่าน `order` จาก closure เดิม
   * แล้วตัวหลังเขียนทับตัวแรก — ของที่บันทึกไปก่อนหายเงียบ ๆ
   *
   * ส่ง price/note เป็น undefined = ไม่แตะค่านั้น · close = ปิดแผงตีราคาด้วย
   */
  function saveQuote(
    itemIndex: number,
    { price, note, close = true }: { price?: string; note?: string; close?: boolean }
  ) {
    if (close) setEditPrice(null);
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it) return;

    const patch: Partial<OrderItem> = {};
    const logs: string[] = [];

    // ราคา/หน่วย — ปล่อยว่าง = ไม่แก้ (ไม่ใช่ตั้งเป็น 0)
    const raw = (price ?? "").trim();
    if (price !== undefined && raw !== "") {
      const value = Math.max(0, Math.round(Number(raw) || 0));
      if (value !== it.unitPrice) {
        patch.unitPrice = value;
        logs.push(
          `${it.unitPrice > 0 ? `${formatPrice(it.unitPrice)} → ` : ""}${formatPrice(value)}/หน่วย ×${it.qty.toLocaleString("th-TH")} = ${formatPrice(value * it.qty)}`
        );
      }
    }

    // ที่มาของราคา (ลูกค้าเห็น)
    if (note !== undefined) {
      const value = note.trim();
      if (value !== (it.quoteNote ?? "").trim()) {
        patch.quoteNote = value || undefined;
        logs.push(value ? `ที่มาของราคา: ${value}` : "ลบที่มาของราคา");
      }
    }

    if (!logs.length) return; // ไม่มีอะไรเปลี่ยน — ไม่ต้องเขียนฐาน/ไม่ต้องรกประวัติ
    const items = order.items.map((x, i) => (i === itemIndex ? { ...x, ...patch } : x));
    const what = patch.unitPrice !== undefined ? (it.unitPrice > 0 ? "แก้ราคา/หน่วย" : "ตีราคา") : "ที่มาของราคา";
    applyOrder(withLog({ ...order, items }, actor, what, `${it.name}: ${logs.join(" · ")}`));
  }
  // ♻️ ทำงานใหม่จากออเดอร์นี้ — เคลม (ฟรี) หรือสั่งซ้ำ (คิดเงิน)
  const [redoOpen, setRedoOpen] = useState(false);
  const [redoMode, setRedoMode] = useState<"claim" | "reorder">("claim");
  const [redoReason, setRedoReason] = useState("");
  const [redoPicks, setRedoPicks] = useState<Record<number, boolean>>({});
  const [redoBusy, setRedoBusy] = useState(false);
  const [redoErr, setRedoErr] = useState("");
  async function submitRedo() {
    if (!order) return;
    const picks = order.items
      .map((_, i) => i)
      .filter((i) => redoPicks[i] ?? true)
      .map((i) => ({ index: i }));
    if (!picks.length) return setRedoErr("เลือกอย่างน้อย 1 รายการ");
    if (redoMode === "claim" && !redoReason.trim()) return setRedoErr("งานเคลมต้องระบุเหตุผล");
    setRedoBusy(true);
    setRedoErr("");
    try {
      const res = await fetch("/api/admin/orders/redo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: order.id, mode: redoMode, picks, reason: redoReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) setRedoErr(j.error ?? "สร้างงานใหม่ไม่สำเร็จ");
      else {
        // 🧰 งานเคลมผูกกับสมุดเคลมให้แล้ว — ผูกไม่สำเร็จให้บอกก่อนย้ายหน้า (ออเดอร์สร้างแล้ว แต่ต้องไปเปิดเคสเองในหน้าเคลม)
        if (j.claimWarn) alert(j.claimWarn);
        window.dispatchEvent(new Event("iducky:claims-changed"));
        router.push(`/admin/orders/${encodeURIComponent(j.id)}`);
      }
    } catch {
      setRedoErr("เชื่อมต่อไม่ได้");
    }
    setRedoBusy(false);
  }
  const [printMenu, setPrintMenu] = useState(false);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipRechecking, setSlipRechecking] = useState(false);
  /** กำลังลากไฟล์ค้างอยู่เหนือช่องแนบสลิปงวดที่ 2 — ไว้ไฮไลต์ช่องรับ */
  const [slipDragOver, setSlipDragOver] = useState(false);
  const adminSlipInput = useRef<HTMLInputElement | null>(null);
  /** แนบลาย "ของแถม" แทนลูกค้า — promoId ที่กำลังอัปโหลด (null = ว่าง) */
  const [giftArtBusy, setGiftArtBusy] = useState<string | null>(null);
  /** กำลังลากไฟล์ค้างเหนือช่องแนบลายของแถมโปรไหน — ไว้ไฮไลต์ช่องรับ */
  const [giftArtDragOver, setGiftArtDragOver] = useState<string | null>(null);
  /** กำลังอัป "แบบงานของแถม" ให้ลูกค้าตรวจอยู่โปรไหน */
  const [giftProofBusy, setGiftProofBusy] = useState<string | null>(null);
  /** สถานะที่รอเปลี่ยน "หลังแนบสลิปเสร็จ" — ตั้งตอนกด "แนบสลิปตอนนี้" ในกล่องเตือน */
  const pendingStatus = useRef<OrderStatus | null>(null);
  /**
   * สลิปที่กำลังจะแนบลงช่องไหน — auto = ให้เซิร์ฟเวอร์ตัดสินจากยอดค้าง (ใบแรก/งวดหลัง/ใบเพิ่ม)
   * first/balance = ช่องหลักเดิม · extra = ใบเพิ่มใน payments[] (ใบที่ 2, 3, … ไม่จำกัด)
   */
  const slipPhase = useRef<"auto" | "first" | "balance" | "extra">("auto");
  /** 🧾 ฟอร์มเก็บค่าบริการเพิ่ม (null = ปิด) */
  const [chargeForm, setChargeForm] = useState<{ label: string; amount: string; note: string } | null>(null);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [dealerBusy, setDealerBusy] = useState(false);
  /** สลิปใบเพิ่มที่กำลังกด "รับยอดเอง" อยู่ (paymentId) */
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null);
  /** 💰 กล่อง "รับยอดเอง" ที่เปิดอยู่ — สลิปใบเพิ่มที่แอดมินกำลังใส่ยอด (null = ปิด) */
  const [acceptForm, setAcceptForm] = useState<PaymentEntry | null>(null);
  /**
   * 🧾 ฟอร์มข้อมูลใบกำกับภาษี (null = ปิด) · docUrl = ลิงก์แชร์ FlowAccount ที่วางไว้ · docVat = VAT ตามเอกสาร (เสนอให้เปิด VAT ตามนั้น)
   * docItems/docShip/docDiscount = รายการ+ค่าส่ง+ส่วนลดตามเอกสาร (เสนอให้ดึงรายการมาใส่ในใบงานพร้อมกัน)
   */
  const [taxForm, setTaxForm] = useState<{
    company: string;
    taxId: string;
    branch: string;
    address: string;
    docUrl: string;
    docNo?: string;
    docTypeLabel?: string;
    docVat?: number;
    docVatRate?: number;
    applyDocVat?: boolean;
    docItems?: { name: string; selections: string; qty: number; unitPrice: number }[];
    docShip?: number;
    docShipLabel?: string;
    docDiscount?: number;
    docGrandTotal?: number;
    applyDocItems?: boolean;
    /** หัก ณ ที่จ่าย + ยอดสรุปตามเอกสาร — ไปพร้อมรายการเสมอ (ภาษีของเอกสารฉบับไหน ต้องมากับรายการฉบับนั้น) */
    docWht?: number;
    docWhtRate?: number;
    docSubtotal?: number;
    docNet?: number;
    docDate?: string;
  } | null>(null);
  const [taxFetching, setTaxFetching] = useState(false);
  const [artDropIdx, setArtDropIdx] = useState<number | null>(null);
  const [proofDropIdx, setProofDropIdx] = useState<number | null>(null);
  const [replaceDrop, setReplaceDrop] = useState<string | null>(null); // "itemIndex:proofIndex" ที่กำลังลากไฟล์ทับเพื่อเปลี่ยนรูป
  const [addProofDrop, setAddProofDrop] = useState<number | null>(null); // รายการที่กำลังลากไฟล์ทับปุ่ม "อัปแบบใหม่"
  const [addPicIdx, setAddPicIdx] = useState<number | null>(null); // เปิดเมนู "เพิ่มรูป" ของรายการไหนอยู่
  // ช่องส่วนลดรายรายการ — ซ่อนไว้ กดป้าย "＋ ใส่ส่วนลด" ท้ายแถวถึงจะโผล่ (นาน ๆ ใช้ที)
  const [discOpen, setDiscOpen] = useState<Record<number, boolean>>({});
  // ช่องหมายเหตุใบงานของแต่ละรายการ — ซ่อนไว้ กดที่รายการนั้นเพื่อเปิด
  const [noteOpen, setNoteOpen] = useState<Record<number, boolean>>({});
  // ยุบ/กางรายละเอียดของแต่ละรายการ — ออเดอร์ที่มีหลายรายการจะได้ไม่ยาวจนหาของไม่เจอ
  const [itemOpen, setItemOpen] = useState<Record<number, boolean>>({});
  /** รายการ "ไม่ต้องทำแบบ" ที่แอดมินกดขอเปิดช่องรูปเอง (ปกติซ่อนไว้เพราะไม่มีอะไรให้แนบ) */
  const [picOpen, setPicOpen] = useState<Record<number, boolean>>({});
  const [lightbox, setLightbox] = useState<{
    src: string;
    alt: string;
    caption?: string;
    /** ตำแหน่งของรูปแบบงาน — มีค่าเมื่อเปิดจากแกลเลอรี (ใช้แสดงปุ่มตรวจนับ) */
    at?: { item: number; proof: number };
  } | null>(null);
  const [origin, setOrigin] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [overrideLock, setOverrideLock] = useState(false); // แอดมินยืนยันให้ทำแบบก่อนจ่ายเงิน
  const [packMode, setPackMode] = useState(false); // แอดมินสลับเข้าโหมดแพ็ค (ตรวจนับ/ยืนยันอ่าน) เอง
  /**
   * 📱 เปิดหน้านี้มาจาก QR บนใบงาน (?pack=1) — พนักงานคนไหนก็ได้ที่ล็อกอินอยู่
   * ได้สิทธิ์งานแพ็คใบนี้ชั่วคราวและเข้าโหมดแพ็คให้เลย (เซิร์ฟเวอร์ตรวจซ้ำจาก header)
   * อ่านหลัง mount เพราะ URL ฝั่งเซิร์ฟเวอร์กับเบราว์เซอร์ต้องตรงกันตอน hydrate
   */
  const [viaScan, setViaScan] = useState(false);

  useEffect(() => {
    const explicit = new URLSearchParams(window.location.search).get(PACK_SCAN_PARAM) === "1";
    const on = explicit || openedFromOutside();
    setViaScan(on);
    setPackScanMode(on); // ทุกคำขอบันทึกจากแท็บนี้จะแนบ header บอกเซิร์ฟเวอร์
    // เด้งเข้าโหมดแพ็คเฉพาะ QR ที่มี ?pack=1 จริงเท่านั้น — ลิงก์ธรรมดาที่เปิดจากนอกเว็บ
    // (เช่น กดลิงก์ใน LINE) ให้เข้าหน้าตรวจสอบออเดอร์ปกติ · ตัวเดา openedFromOutside ยังใช้
    // "ยืมสิทธิ์" ให้คนสแกนใบงานรุ่นเก่าอยู่ — คนไม่มีสิทธิ์แก้ออเดอร์จะเห็นหน้าแพ็คเองผ่าน isPackOnly
    // เคยกด "กลับหน้าตรวจสอบออเดอร์" ของใบนี้ในแท็บนี้แล้ว = อย่าลากกลับเข้าโหมดแพ็คอีก
    if (explicit && !packOptedOut(orderId)) setPackMode(true);
    return () => setPackScanMode(false);
  }, [orderId]);

  const [skipGate, setSkipGate] = useState<string[] | null>(null); // โมดัลยืนยันข้ามด่านแพ็ค (เหตุผลที่ยังไม่ครบ)
  // 🚚 แบ่งส่ง: รูปที่ติ๊ก "ส่งรอบนี้" ในโหมดแพ็ค (คีย์ "item:proof" → จำนวนชิ้นที่จะส่งรอบนี้) + โมดัลยิงเลขรอบนี้
  const [shipSel, setShipSel] = useState<Map<string, number>>(() => new Map());
  const [partialOpen, setPartialOpen] = useState(false);
  // 📋 โมดัลแอดมินระบุแผนแบ่งส่ง (รูปไหนส่งก่อน)
  const [planOpen, setPlanOpen] = useState(false);
  /** ✏️ รอบในแผนแบ่งส่งที่กำลังแก้ (null = เพิ่มรอบใหม่) — แก้ได้เฉพาะรอบที่ยังไม่ส่ง */
  const [planEditIdx, setPlanEditIdx] = useState<number | null>(null);
  /** 🔍 รอบในแผนที่กางรายละเอียด (รูป + จำนวน) อยู่ */
  const [planDetail, setPlanDetail] = useState<number | null>(null);
  const [os, setOs] = useState<"mac" | "win" | "">(""); // เครื่องที่เปิดหน้านี้ (รู้หลัง mount) — ใช้เรียงตัวเลือกทางลัดแบบเนทีฟ
  useEffect(() => setOs(shortcutOs()), []);
  const trackingRef = useRef<string>(""); // เลขพัสดุที่บันทึกไปแล้ว กันบันทึกซ้ำตอน blur
  const pickupPendingRef = useRef(false); // 🏪 โมดัลข้ามด่านที่เปิดอยู่มาจากปุ่ม "แพ็คเสร็จ" (มารับเอง) ไม่ใช่ช่องเลขพัสดุ

  const rolCan = useCan();
  const permsReady = usePermsReady(); // สิทธิ์จริงมาถึงหรือยัง — ก่อนหน้านั้นห้ามสรุปว่าเป็นฝ่ายแพ็ค
  /** สแกน QR ใบงานมา = ยืมสิทธิ์งานแพ็ค (pack.check / pack.ship) ให้ ไม่ว่าจะแผนกไหน */
  const can = useCallback(
    (perm: Perm) => rolCan(perm) || (viaScan && PACK_SCAN_PERMS.includes(perm)),
    [rolCan, viaScan]
  );
  const actor = useActor(); // ชื่อคนที่ล็อกอินอยู่ (ไว้บันทึกประวัติว่าใครทำ)
  const seesMoney = can("orders.money"); // เห็นราคา/สลิป
  const isSuperAdmin = useRoleLabel() === "ผู้ดูแลระบบ"; // ลบสลิปได้เฉพาะผู้ดูแลระบบ (เซิร์ฟเวอร์บังคับซ้ำ)
  const mayEdit = can("orders.edit"); // เปลี่ยนสถานะ/แก้ข้อมูล
  /** 🤝 ใบนี้ยังสลับราคาตัวแทน/ราคาปกติได้ไหม (กติกาเดียวกับเซิร์ฟเวอร์ — ตรงนี้แค่ไม่ให้กดแล้วเด้ง error) */
  const dealerToggleReady = !!order && !dealerRepriceBlockedBy(order);
  /**
   * 💰 ยืนยันเงินเข้า — สิทธิ์แยกจาก orders.edit
   * ค่าเริ่มต้นมีแต่เจ้าของร้าน · พนักงานคนอื่นต้องให้เจ้าของเปิดให้เป็นรายคนที่หน้า /admin/staff
   * (เซิร์ฟเวอร์บังคับซ้ำใน PATCH /api/admin/orders — ตรงนี้แค่ไม่ให้กดแล้วเด้ง error)
   */
  const mayMarkPaid = can("orders.markPaid");
  const mayProof = can("proof.manage"); // อัปโหลด/ลบแบบงาน
  const mayCancel = can("orders.cancel");

  useEffect(() => setOrigin(publicOrigin()), []); // ลิงก์นี้ส่งให้ลูกค้า ต้องไม่ใช่ localhost

  /**
   * โหลดหน้าออเดอร์ — ⚠️ อย่ารวมสองคำขอเป็น Promise.all อีก
   * เดิมรอทั้ง "ใบนี้" และ "ออเดอร์ทั้งตาราง" ให้เสร็จก่อนถึงจะวาด → จอค้าง "กำลังโหลดออเดอร์…"
   * นานเท่าคำขอที่ช้ากว่า (ตารางทั้งหมด ~150 KB ขึ้นไป) ทั้งที่ข้อมูลที่ต้องใช้วาดหน้ามีแค่ใบเดียว
   * ตอนนี้: ใบนี้มาถึงก็วาดเลย · ตารางทั้งหมดตามมาเบื้องหลัง (ใช้แค่ "ออเดอร์อื่นของลูกค้าคนเดียวกัน"
   * กับการเดาห้องแชท LINE จากใบเก่า — สองอย่างนี้โผล่ทีหลังได้ ไม่ต้องกั๊กทั้งหน้าไว้)
   */
  const load = useCallback(async () => {
    // ข้อมูลที่ layout แปะมากับ HTML แล้ว — วาดได้ทันทีโดยไม่ต้องรอ API สักรอบ
    // (บนเว็บจริงค่าเรียก serverless function รอบละ ~0.6-0.8 วิ · ในเครื่องแทบไม่รู้สึกจึงเคยมองไม่เห็นปัญหา)
    const seeded = readSsrOrder(orderId);
    if (seeded) {
      adoptFromServer(seeded);
      setOrder(seeded);
      setDemo(false);
      setLoading(false);
    }
    const listLater = fetchOrdersAdmin({ lite: true }); // ยิงคู่ขนานไปเลย แต่ไม่รอ — ไม่ใช่ข้อมูลที่ใช้วาดหน้า
    const one = await fetchOrderAdmin(orderId); // ของสดจากเซิร์ฟเวอร์ (มี loginLine ที่ SSR ไม่ได้ดึงมา)
    if (one.order) {
      adoptFromServer(one.order);
      setOrder(one.order);
      // เลขพัสดุที่มีอยู่แล้ว = บันทึกแล้ว → ป้าย ✅ ในโหมดแพ็คขึ้นถูก และ blur ช่องเดิมไม่บันทึกซ้ำ
      trackingRef.current = (one.order.tracking ?? "").trim();
      setDemo(false);
      setLoading(false); // วาดหน้าได้แล้ว — ที่เหลือทยอยมา
    }
    const r = await listLater; // เอาเฉพาะฟิลด์ที่ใช้จริง — ก้อนเต็มไม่มีใครใช้ในหน้านี้
    const demoMode = r.orders.length === 0;
    const list = demoMode ? MOCK_ORDERS : r.orders;
    setDemo(demoMode);
    setAllOrders(list);
    // ใบเบาไม่มีรายการสินค้า → ใช้เป็นตัวออเดอร์หลักไม่ได้ ยกเว้นโหมดตัวอย่างที่ list เป็นข้อมูลเต็ม
    if (!one.order && demoMode) setOrder(list.find((o) => o.id === orderId) ?? null);
    setLoading(false);
  }, [orderId, adoptFromServer]);

  useEffect(() => {
    void load();
  }, [load]);

  /** ดึงข้อมูลใหม่เงียบ ๆ — ให้เห็นทันทีเมื่อลูกค้าอนุมัติ/ขอแก้ไข */
  const refresh = useCallback(async () => {
    if (uploadingIdx !== null) return; // กำลังอัปโหลดอยู่ อย่าเพิ่งทับ
    // กำลังพิมพ์ในช่องกรอก/หมายเหตุ (contentEditable) อยู่ → ข้ามรอบนี้ ไม่งั้นข้อความที่พิมพ์จะหาย
    const el = document.activeElement as HTMLElement | null;
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el?.isContentEditable
    )
      return;

    // ถามซ้ำทุก 15 วิ — ขอเฉพาะออเดอร์ใบนี้ใบเดียว (เดิมดึงทั้งตาราง + เซ็นลิงก์สลิปทุกใบ)
    const found = (await fetchOrderAdmin(orderId)).order;
    if (!found) return;
    adoptFromServer(found);
    setOrder((cur) => (JSON.stringify(cur) === JSON.stringify(found) ? cur : found));
  }, [orderId, uploadingIdx, adoptFromServer]);

  usePolling(refresh, { enabled: !demo && !!order });

  // 🔢 โหลดตัวสินค้าของรายการที่หยิบจากหน้าร้าน — ไว้คิดราคาใหม่ตอนแก้จำนวน (รอให้หน้าวาดเสร็จก่อนค่อยถาม)
  // 🖼 รายการพิเศษไม่ได้ผูกสินค้า → ยืมภาพปกจากสินค้าที่ร้านจับคู่ไว้ในคลังสินค้าพิเศษ (special-product-image.ts)
  // โหลดคลังเฉพาะใบที่มีรายการพิเศษ "ที่ยังไม่มีรูปอะไรเลย" — ใบส่วนใหญ่ไม่ต้องเสียคำขอนี้
  const [specialCatalog, setSpecialCatalog] = useState<SpecialProduct[] | null>(null);
  const needSpecialPics = (order?.items ?? []).some(
    (it) => it.productId === "special-item" && !it.picProductId && !it.noProof && !(it.artworkUrls?.length ?? 0)
  );
  useEffect(() => {
    if (demo || !needSpecialPics || specialCatalog) return;
    let alive = true;
    fetch("/api/admin/special-products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { list: [] }))
      .then((j) => alive && setSpecialCatalog(j.list ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [demo, needSpecialPics, specialCatalog]);
  /** สินค้าที่ให้ยืมภาพของรายการนี้ — สินค้าร้าน = ตัวมันเอง (บรรทัดค่าธรรมเนียม "id#…" ใช้สินค้าแม่) · รายการพิเศษ = คู่ในคลัง */
  const picProductIdOf = (it: OrderItem): string | undefined =>
    it.productId === "special-item"
      ? it.picProductId ?? (specialCatalog ? specialImageProductId(specialCatalog, it.name) : undefined)
      : it.productId.split("#")[0] || undefined;

  const itemProductIds = [
    ...(order?.items ?? []).map((it) => it.productId).filter((id) => id && !id.includes("#") && id !== "special-item"),
    ...(order?.items ?? []).filter((it) => it.productId === "special-item").map((it) => picProductIdOf(it) ?? ""),
  ]
    .filter((id, i, all) => id && all.indexOf(id) === i)
    .join("|");
  useEffect(() => {
    // ไม่ผูกกับสิทธิ์แก้ไข — กราฟฟิก/แพ็คก็ต้องเห็นภาพสินค้าในแถวรายการ (ข้อมูลสินค้าเป็นของสาธารณะอยู่แล้ว)
    if (demo || !itemProductIds) return;
    const want = itemProductIds.split("|").filter((id) => !shopProducts.has(id) && !askedProductIds.current.has(id));
    if (!want.length) return;
    want.forEach((id) => askedProductIds.current.add(id));
    let alive = true;
    const t = setTimeout(() => {
      void fetchProductsByIds(want)
        .then((ps) => {
          if (!alive || !ps.length) return;
          setShopProducts((cur) => {
            const next = new Map(cur);
            ps.forEach((p) => next.set(p.id, p));
            return next;
          });
        })
        .catch(() => {
          // โหลดไม่ได้ = แก้จำนวนได้แต่คงราคาเดิม (ให้ลองใหม่รอบหน้า)
          want.forEach((id) => askedProductIds.current.delete(id));
        });
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, itemProductIds]);

  /**
   * 🛠 แอดมินกด "แก้ตัวเลือก" → ไปแก้ที่หน้าร้าน → ของใหม่ถูกเพิ่มท้ายออเดอร์ (ทางเดียวกับ "สั่งเพิ่มในออเดอร์นี้")
   * พอรอบดึงข้อมูลเห็นของใหม่เข้ามา = หิ้วแบบงาน/หมายเหตุ/ติ๊กจากรายการเดิมไปให้ แล้วถอดรายการเดิมออก
   * (เหมือนตะกร้าที่ลบบรรทัดเดิมทิ้งตอนบันทึกแก้ไข) · ลงประวัติทุกครั้ง
   */
  useEffect(() => {
    if (!order || demo || !mayEdit || replaceBusy.current) return;
    const m = readReplaceMarker();
    if (!m || (m.kind ?? "order") !== "order" || m.orderId !== order.id) return;
    const r = applyReplaceMarker(order.items, m);
    if (!r) return;
    replaceBusy.current = true;
    writeReplaceMarker(null);
    const next = withLog(
      { ...order, items: r.items },
      actor,
      "แก้ตัวเลือกจากหน้าร้าน",
      `${r.old.name} ×${r.old.qty} @${formatPrice(r.old.unitPrice)} → ${r.fresh.name} ×${r.fresh.qty} @${formatPrice(r.fresh.unitPrice)} (แทนที่รายการเดิม)`
    );
    applyOrder(next);
    setTimeout(() => {
      replaceBusy.current = false;
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items.length, demo, mayEdit]);

  // วิธีจัดส่งจากตั้งค่าร้าน — ให้แอดมินเลือกแล้วเติมค่าส่งอัตโนมัติ (ใช้ในออเดอร์งานพิเศษ/สั่งแทน)
  const [shipMethods, setShipMethods] = useState<ShippingMethod[]>([]);
  /** โปรส่งฟรีเมื่อยอดถึง — ต้องใช้ตอนคิดค่าส่งอัตโนมัติให้ได้เลขเดียวกับหน้าตะกร้า (0 = ไม่มีโปร) */
  const [freeShipMin, setFreeShipMin] = useState(0);
  useEffect(() => {
    void fetchShopPayment().then((p) => {
      setShipMethods(shippingOf(p));
      setFreeShipMin(freeShippingMinOf(p));
    });
  }, []);

  /** เปิดหน้าต่างเลือกไฟล์สลิป (แอดมินแนบแทนลูกค้า) — งวดแรก หรืองวดหลังของออเดอร์มัดจำ */
  function pickAdminSlip(phase: "auto" | "first" | "balance" | "extra" = "auto") {
    slipPhase.current = phase;
    adminSlipInput.current?.click();
  }

  /** อัปโหลดสลิปที่แอดมินเลือก → ผูกกับออเดอร์ แล้วเปลี่ยนสถานะที่ค้างไว้ (ถ้ามี) ต่อให้เลย */
  async function uploadAdminSlip(file: File) {
    if (!order) return;
    if (demo) {
      setErr("โหมดตัวอย่างแนบสลิปไม่ได้");
      pendingStatus.current = null;
      return;
    }
    setErr("");
    setSlipUploading(true);
    try {
      const send = async (force: boolean) => {
        const fd = new FormData();
        fd.append("orderId", order.id);
        fd.append("file", file);
        fd.append("phase", slipPhase.current);
        if (force) fd.append("force", "1");
        const res = await fetch("/api/admin/orders/slip", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as { order?: Order; verified?: boolean; error?: string; duplicate?: boolean; owners?: { orderId: string }[] };
        return { res, j };
      };
      let { res, j } = await send(false);
      // 🧾 สลิปซ้ำกับออเดอร์อื่น (ไฟล์เดิม/เลขอ้างอิงเดิม) — ถามก่อน: โอนรวมหลายออเดอร์จริงถึงแนบซ้ำได้ (ลง log ว่าใครยืนยัน)
      if (res.status === 409 && j.duplicate && j.owners?.length) {
        const ok = await askConfirm({
          icon: "🧾",
          title: "สลิปใบนี้ถูกใช้กับออเดอร์อื่นแล้ว",
          detail: `${j.error ?? ""}\n\nแนบซ้ำเฉพาะกรณีลูกค้าโอนยอดรวมของหลายออเดอร์ในสลิปเดียว — ระบบจะบันทึกในประวัติว่าคุณยืนยันเอง`,
          confirmLabel: "ยืนยันว่าโอนรวม แนบเลย",
          danger: true,
        });
        if (!ok) return;
        ({ res, j } = await send(true));
      }
      if (!res.ok || !j.order) {
        setErr(j.error ?? "อัปโหลดสลิปไม่สำเร็จ");
        return;
      }
      let next = j.order;
      // SlipOK ตรวจผ่านและยืนยันรับเงินให้แล้ว → ไม่ทับสถานะที่ค้างไว้ (เช่นงานจัดวางเองที่ข้ามไป "อนุมัติแบบ")
      const want = j.verified ? null : pendingStatus.current;
      if (want && next.status !== want) {
        next = withLog({ ...next, status: want }, actor, "เปลี่ยนสถานะ", `${next.status} → ${want} · หลังแนบสลิป`);
        void saveOrWarn(next);
      }
      setOrder(next);
    } finally {
      pendingStatus.current = null;
      slipPhase.current = "auto";
      setSlipUploading(false);
    }
  }

  async function changeStatus(status: OrderStatus) {
    if (!order || order.status === status) return;
    // 💰 "ชำระแล้ว" = ยืนยันเงินเข้า — ต้องมีสิทธิ์เฉพาะ (เซิร์ฟเวอร์ปฏิเสธซ้ำอยู่แล้ว)
    if (status === "ชำระแล้ว" && !mayMarkPaid) {
      setErr("บัญชีนี้ยืนยันเงินเข้าไม่ได้ — ให้เจ้าของร้าน หรือคนที่เปิดสิทธิ์ “ยืนยันเงินเข้า” ไว้ เป็นคนกด");
      setOrder((cur) => (cur ? { ...cur } : cur)); // รีเซ็ต <select> กลับสถานะเดิม
      return;
    }
    // "ชำระแล้ว" ต้องมีสลิปเป็นหลักฐานเสมอ — ไม่มีสลิปให้แนบตรงนั้นเลย หรือยืนยันเองแล้วลง log
    const noSlip = status === "ชำระแล้ว" && !order.slipPath && !order.slipUrl && !(order.payments?.length);
    if (noSlip) {
      const ok = await askConfirm({
        icon: "🧾",
        title: "ออเดอร์นี้ยังไม่มีสลิปแนบ",
        detail:
          'ต้องมีสลิปเป็นหลักฐานก่อนเปลี่ยนเป็น "ชำระแล้ว" — ถ้าลูกค้าส่งสลิปมาทางแชท/ไลน์ ให้แนบตรงนี้ได้เลย\nถ้ารับเงินทางอื่นที่ไม่มีสลิปจริง ๆ (เงินสด) กดยืนยันได้ ระบบจะบันทึกในประวัติว่าใครยืนยันทั้งที่ไม่มีสลิป',
        confirmLabel: "ไม่มีสลิป — ยืนยันเอง",
        altLabel: "📎 แนบสลิปตอนนี้",
        danger: true,
      });
      // เลือก "แนบสลิป" → จำสถานะที่จะเปลี่ยนไว้ แล้วไปต่อหลังอัปโหลดเสร็จ
      if (ok === "alt") {
        pendingStatus.current = status;
        setOrder((cur) => (cur ? { ...cur } : cur));
        pickAdminSlip();
        return;
      }
      // ยกเลิก → สร้าง object ใหม่ให้ React รีเรนเดอร์ ไม่งั้น <select> ค้างค่าที่เพิ่งเลือกไป
      if (!ok) {
        setOrder((cur) => (cur ? { ...cur } : cur));
        return;
      }
    }
    const next = withLog(
      { ...order, status },
      actor,
      noSlip ? "เปลี่ยนสถานะ (ไม่มีสลิป)" : "เปลี่ยนสถานะ",
      `${order.status} → ${status}${noSlip ? " · ยืนยันรับเงินเองโดยไม่มีสลิปแนบ" : ""}`
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** แก้จำนวน/รายละเอียดของรูปแบบงาน (อัปเดตในจอก่อน แล้วค่อยบันทึกตอนออกจากช่อง) */
  function patchProof(itemIndex: number, proofIndex: number, patch: Partial<Proof>) {
    setOrder((cur) =>
      cur
        ? {
            ...cur,
            items: cur.items.map((it, i) =>
              i === itemIndex
                ? { ...it, proofs: proofsOf(it).map((p, j) => (j === proofIndex ? { ...p, ...patch } : p)) }
                : it
            ),
          }
        : cur
    );
  }

  /** แก้จำนวน/หน่วย/รายละเอียดของรูปแบบงาน แล้วบันทึกทันที (ใช้กับ select ที่ไม่มี blur) */
  function patchProofSave(itemIndex: number, proofIndex: number, patch: Partial<Proof>) {
    if (!order) return;
    const next = {
      ...order,
      items: order.items.map((it, i) =>
        i === itemIndex ? { ...it, proofs: proofsOf(it).map((p, j) => (j === proofIndex ? { ...p, ...patch } : p)) } : it
      ),
    };
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * 🔄 ตรวจสลิปใบเดิมกับ SlipOK อีกครั้ง — ใช้ไฟล์ที่แนบไว้แล้ว (ไม่ต้องลบ/แนบใหม่)
   * เคสหลัก: ลูกค้าแนบเร็วกว่าธนาคารส่งข้อมูล SlipOK ตอบ 1010 → รอสักครู่แล้วกดตรวจซ้ำ
   * ผ่าน = เซิร์ฟเวอร์ยืนยันรับเงิน/แจ้ง LINE ให้เหมือนตรวจรอบแรก
   */
  async function recheckSlip(phase: "first" | "balance" | "extra", paymentId?: string) {
    if (!order) return;
    if (demo) {
      setErr("โหมดตัวอย่างตรวจสลิปไม่ได้");
      return;
    }
    setErr("");
    setSlipRechecking(true);
    try {
      const res = await fetch("/api/admin/orders/slip/recheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, phase, paymentId }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; verified?: boolean; error?: string };
      if (!res.ok || !j.order) {
        setErr(j.error ?? "ตรวจสลิปไม่สำเร็จ");
        return;
      }
      adoptOrder(j.order);
    } finally {
      setSlipRechecking(false);
    }
  }

  /** ลบสลิป (เฉพาะผู้ดูแลระบบ) — รีเซ็ตการแจ้งโอน ออเดอร์กลับเป็น รอชำระเงิน */
  async function deleteSlip() {
    if (!order) return;
    if (!(await askConfirm({ icon: "🧾", title: `ลบสลิปของ ${order.id}?`, detail: 'การแจ้งโอนจะถูกรีเซ็ต ออเดอร์กลับเป็น "รอชำระเงิน" ให้ลูกค้าแนบใหม่', confirmLabel: "ลบสลิป", danger: true }))) return;
    const res = await fetch("/api/admin/orders/slip", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "ลบสลิปไม่สำเร็จ");
      return;
    }
    adoptOrder(j.order);
  }

  /** ลบสลิป "งวดหลัง" ของออเดอร์มัดจำ (แนบผิดใบ) — ไม่ยุ่งกับสถานะ/ยอดที่รับแล้ว */
  async function deleteBalanceSlip() {
    if (!order?.deposit?.balanceSlipPath) return;
    const settled = !!order.deposit.settledAt;
    if (
      !(await askConfirm({
        icon: "🧾",
        title: "ลบสลิปงวดหลังใบนี้?",
        detail: settled
          ? "⚠️ ออเดอร์นี้ยืนยันรับครบแล้ว — ลบไปจะไม่เหลือหลักฐานงวดหลัง (ยอดที่รับแล้วไม่ถูกแตะ) · บันทึกในประวัติว่าใครลบ"
          : "ลบแล้วให้ลูกค้าหรือแอดมินแนบใหม่ได้ · ยอดที่รับแล้วไม่ถูกแตะ",
        confirmLabel: "ลบสลิปงวดหลัง",
        danger: true,
      }))
    )
      return;
    const res = await fetch("/api/admin/orders/slip", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id, phase: "balance" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "ลบสลิปไม่สำเร็จ");
      return;
    }
    adoptOrder(j.order);
  }

  /** ลบสลิป "ใบเพิ่ม" ใบเดียว (แนบผิด/ทดสอบ) — ถ้าใบนั้นนับยอดแล้ว เซิร์ฟเวอร์ถอยยอดออกให้ (สถานะไม่เปลี่ยน) */
  async function deletePayment(e: PaymentEntry) {
    if (!order || !e.paymentId) return;
    if (
      !(await askConfirm({
        icon: "🧾",
        title: `ลบสลิปใบที่ ${e.n}?`,
        detail: e.credited
          ? `⚠️ ใบนี้นับยอดไว้ ${formatPrice(e.credited)} — ลบแล้วยอดที่รับจะถอยลงเท่านั้น (สถานะไม่เปลี่ยน ตรวจยอดค้างเอง) · บันทึกในประวัติว่าใครลบ`
          : "ใบนี้ยังไม่ได้นับยอด — ลบแล้วไม่กระทบยอดที่รับ",
        confirmLabel: "ลบสลิปใบนี้",
        danger: true,
      }))
    )
      return;
    const res = await fetch("/api/admin/orders/slip", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id, phase: "extra", paymentId: e.paymentId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "ลบสลิปไม่สำเร็จ");
      return;
    }
    adoptOrder(j.order);
  }

  /**
   * 💰 รับยอดของสลิปใบเพิ่มเอง — SlipOK ตรวจไม่ได้/ตรวจตก แต่แอดมินเทียบยอดกับธนาคารแล้ว
   * ต้องมีสิทธิ์ยืนยันเงินเข้า (เซิร์ฟเวอร์บังคับซ้ำ) · เซิร์ฟเวอร์นับยอด + ครบแล้วยืนยันงวด/แจ้งลูกค้า/msVerify เอง
   */
  function acceptPayment(e: PaymentEntry) {
    if (!order || !e.paymentId) return;
    if (!mayMarkPaid) {
      setErr("บัญชีนี้ยืนยันเงินเข้าไม่ได้ — ให้เจ้าของร้าน หรือคนที่เปิดสิทธิ์ “ยืนยันเงินเข้า” ไว้ เป็นคนกด");
      return;
    }
    setAcceptForm(e); // ใส่ยอดในกล่องของเว็บ (เดิมเป็น prompt() ของเบราว์เซอร์ — โชว์ยอดทศนิยมลอย ๆ อย่าง 46.89999999999998)
  }

  /** ยืนยันยอดจากกล่อง "รับยอดเอง" — เซิร์ฟเวอร์นับยอด + ครบแล้วยืนยันงวด/แจ้งลูกค้า/msVerify เอง */
  async function confirmAccept(e: PaymentEntry, amount: number) {
    if (!order || !e.paymentId || !(amount > 0)) return;
    setAcceptBusy(e.paymentId);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/slip", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, paymentId: e.paymentId, amount }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string };
      if (!res.ok || !j.order) {
        setErr(j.error ?? "รับยอดไม่สำเร็จ");
        return;
      }
      adoptOrder(j.order);
      setAcceptForm(null);
    } finally {
      setAcceptBusy(null);
    }
  }

  /** 🧾 เก็บค่าบริการเพิ่ม (ค่าตัดภาพ/ค่าส่งเพิ่ม/ค่าเร่งงาน …) — เซิร์ฟเวอร์บวกยอดรวม + เด้งสถานะ/แจ้งลูกค้าทางไลน์ให้ */
  async function addCharge() {
    if (!order || !chargeForm) return;
    const label = chargeForm.label.trim();
    const amount = Number(chargeForm.amount);
    if (!label) {
      setErr("ใส่ชื่อรายการที่เก็บเพิ่ม");
      return;
    }
    if (!(amount > 0)) {
      setErr("ยอดที่เก็บเพิ่มต้องมากกว่า 0");
      return;
    }
    if (demo) {
      setErr("โหมดตัวอย่างเก็บเพิ่มไม่ได้");
      return;
    }
    setChargeBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, label, amount, note: chargeForm.note.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string };
      if (!res.ok || !j.order) {
        setErr(j.error ?? "เก็บเพิ่มไม่สำเร็จ");
        return;
      }
      adoptOrder(j.order);
      setChargeForm(null);
    } finally {
      setChargeBusy(false);
    }
  }

  /** ถอดรายการเก็บเพิ่มออก (ใส่ผิด/ลูกค้าไม่เอา) — ยอดรวมลด · ถ้าลูกค้าโอนมาแล้วจะกลายเป็นโอนเกิน */
  async function removeCharge(c: OrderCharge) {
    if (!order) return;
    if (
      !(await askConfirm({
        icon: "🧾",
        title: `ถอดรายการ “${c.label}” ${formatPrice(c.amount)}?`,
        detail: "ยอดรวมจะลดลง — ถ้าลูกค้าโอนยอดนี้มาแล้วจะกลายเป็นโอนเกิน ต้องคืนเงิน/แปลงเป็นแต้มเอง · บันทึกในประวัติว่าใครถอด",
        confirmLabel: "ถอดรายการ",
        danger: true,
      }))
    )
      return;
    const res = await fetch("/api/admin/orders/charge", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id, chargeId: c.id }),
    });
    const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string };
    if (!res.ok || !j.order) {
      setErr(j.error ?? "ถอดรายการไม่สำเร็จ");
      return;
    }
    adoptOrder(j.order);
  }

  /**
   * 🤝 ทำใบนี้ให้เป็นราคาตัวแทนจำหน่าย (หรือถอดกลับ) — ตัวแทนลืมล็อกอินแล้วสั่ง เว็บเลยคิดราคาปลีกให้
   * เซิร์ฟเวอร์สลับทุกบรรทัดไปเรทตัวแทน + ถอดส่วนลดที่ตัวแทนไม่ได้ (โอนไว/ระดับสมาชิก/ของแถม) ให้เอง
   */
  async function setDealerPrice(on: boolean) {
    if (!order || dealerBusy) return;
    if (demo) {
      setErr("โหมดตัวอย่างเปลี่ยนราคาไม่ได้");
      return;
    }
    if (
      !(await askConfirm({
        icon: "🤝",
        title: on ? "คิดราคาตัวแทนจำหน่ายให้ใบนี้?" : "ถอดราคาตัวแทน กลับเป็นราคาปกติ?",
        detail: on
          ? "ทุกรายการที่มีราคาตัวแทนจะถูกคิดใหม่ตามเรทตัวแทน และถอดส่วนลดที่ตัวแทนไม่ได้ (โอนไว · ระดับสมาชิก · ของแถม) ออก\nยอดรวมของใบนี้จะเปลี่ยน — ใช้กับใบที่ยังไม่มีเงินเข้าเท่านั้น"
          : "ทุกรายการจะกลับไปคิดราคาปกติที่ลูกค้าทั่วไปได้ · ยอดรวมจะเปลี่ยน",
        confirmLabel: on ? "คิดราคาตัวแทน" : "กลับราคาปกติ",
        danger: !on,
      }))
    )
      return;
    setDealerBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/dealer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, on }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
        skipped?: string[];
        leftoverDiscount?: number;
      };
      if (!res.ok || !j.order) {
        setErr(j.error ?? "เปลี่ยนราคาไม่สำเร็จ");
        return;
      }
      adoptOrder(j.order);
      // บอกสิ่งที่ระบบทำให้ไม่ได้ ไม่ใช่ปล่อยให้แอดมินไปเจอเองทีหลัง
      const warn = [
        j.skipped?.length ? `ยังไม่มีราคาตัวแทน ${j.skipped.length} รายการ: ${j.skipped.join(" · ")}` : "",
        j.leftoverDiscount ? `ใบนี้ยังมีส่วนลดอื่นอยู่ ฿${j.leftoverDiscount.toLocaleString("th-TH")} (คูปอง/ส่วนลดที่ใส่เอง) — ตัวแทนไม่ได้ส่วนลดอื่น ถอดเองถ้าไม่ต้องการ` : "",
      ].filter(Boolean);
      if (warn.length) setErr(warn.join(" · "));
    } finally {
      setDealerBusy(false);
    }
  }

  /** คงลิงก์สลิปที่เซ็นไว้บนจอ เมื่อรับก้อนใหม่จากเซิร์ฟเวอร์ (PATCH คืนก้อนที่ล้าง signed URL แล้ว) */
  function keepSlipUrls(fresh: Order, cur: Order): Order {
    return {
      ...fresh,
      slipUrl: cur.slipUrl ?? fresh.slipUrl,
      deposit: fresh.deposit ? { ...fresh.deposit, balanceSlipUrl: cur.deposit?.balanceSlipUrl } : fresh.deposit,
      payments: fresh.payments?.map((p) => ({ ...p, url: cur.payments?.find((x) => x.id === p.id)?.url })),
    };
  }

  /** บันทึกแล้วรับก้อนจากเซิร์ฟเวอร์มาแทน (สถานะ/paidTotal/log ที่เซิร์ฟเวอร์ปรับให้ เช่น เด้งกลับรอชำระเงิน) */
  async function applyOrderFromServer(next: Order) {
    setOrder(next);
    if (demo) return;
    const r = await saveOrderAdminResult(next, { base: baseRef.current });
    if (!r.ok) {
      setErr(`⚠️ ${r.error ?? "บันทึกลงฐานข้อมูลไม่สำเร็จ"} — สิ่งที่เพิ่งทำยังไม่ถูกบันทึก ลองใหม่หรือรีเฟรชดูค่าจริง`);
      return;
    }
    adoptFromServer(r.order);
    if (r.order) setOrder((cur) => (cur ? keepSlipUrls(r.order!, cur) : r.order!));
  }

  /**
   * 🗑 ลบบิลบริษัทออกทั้งชุด — ลูกค้าเปลี่ยนใจไม่เอาใบกำกับภาษีแล้ว (OD-260915-6489 · 16 ก.ย. 69)
   * ถอด: เอกสาร FlowAccount ที่ผูก · ข้อมูลผู้ซื้อในใบกำกับ · VAT/หัก ณ ที่จ่าย · ธงใส่ใบกำกับลงกล่อง
   * รายการสินค้า/ค่าส่ง/ส่วนลดคงเดิม (ราคาต่อชิ้นตามใบเป็นราคาก่อน VAT อยู่แล้ว = ราคาที่ลูกค้าจ่ายเมื่อไม่มีบิล)
   * ยอดรวมเล็กลง → ผ่านเซิร์ฟเวอร์ (คิดยอดค้าง/แจ้งยอดใหม่ให้เอง) · ใบมัดจำ FlowAccount ยอดมัดจำไม่แตะ แอดมินตรวจเอง
   */
  async function removeCompanyBill() {
    if (!order || (!order.flowAccount && !order.taxInvoice)) return;
    const after: Order = { ...order, flowAccount: undefined, taxInvoice: undefined, vat: undefined, wht: undefined, taxInvoiceDelivery: undefined, taxInvoicePacked: undefined };
    const totalBefore = orderTotal(order);
    const totalAfter = orderTotal(after);
    const paid = paidSoFar(order);
    const docLabel = order.flowAccount ? `${order.flowAccount.docTypeLabel} ${order.flowAccount.docNo}` : "";
    const who = order.taxInvoice?.company ?? order.customer;
    const ok = await askConfirm({
      icon: "🗑",
      title: "ลบบิลบริษัทออกจากออเดอร์นี้?",
      detail: [
        `${docLabel ? `${docLabel} · ` : ""}${who} จะไม่มีใบกำกับภาษีอีก — ลบเอกสาร FlowAccount ที่ผูก ข้อมูลผู้ซื้อ VAT และหัก ณ ที่จ่ายออกทั้งหมด`,
        totalBefore !== totalAfter ? `ยอดรวม ${formatPrice(totalBefore)} → ${formatPrice(totalAfter)}` : "",
        paid > 0 ? `⚠️ มีเงินเข้าแล้ว ${formatPrice(paid)} — ถ้าลูกค้าโอนรวม VAT มาแล้วจะกลายเป็นโอนเกิน` : "",
        order.deposit ? "⚠️ ใบนี้เป็นใบมัดจำ ยอดมัดจำไม่เปลี่ยนตาม ตรวจอีกครั้ง" : "",
      ]
        .filter(Boolean)
        .join("\n"),
      confirmLabel: "ลบบิลบริษัท",
      danger: true,
    });
    if (!ok) return;
    await applyOrderFromServer(
      withLog(
        after,
        actor,
        "ลบบิลบริษัท (ลูกค้าไม่เอาใบกำกับแล้ว)",
        `${docLabel ? `${docLabel} · ` : ""}${who}${order.vat ? ` · VAT ${formatPrice(orderVatAmount(order))}` : ""}${
          order.wht ? ` · หัก ณ ที่จ่าย ${formatPrice(orderWhtAmount(order))}` : ""
        } → ยอดรวม ${formatPrice(totalBefore)} → ${formatPrice(totalAfter)}`
      )
    );
  }

  /**
   * 🧾 เปิด VAT 7% ทีหลัง — ลูกค้าจ่ายราคาหน้าร้านไปแล้ว มาขอใบกำกับภาษี → คิด VAT จากยอดบิลปัจจุบันบวกเข้าไป
   * เซิร์ฟเวอร์ (PATCH) ตั้ง paidTotal ให้ถ้ายังไม่มี · เด้งกลับ "รอชำระเงิน" ถ้ายังไม่เข้าไลน์ผลิต · แจ้งไลน์ยอดที่ต้องโอนเพิ่ม + ลิงก์เดิม
   */
  async function enableVat() {
    if (!order || order.vat) return;
    const base = orderTotal(order);
    const amt = Math.round(base * 7) / 100;
    const waitingNow = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
    const paid = order.paidTotal ?? (waitingNow ? 0 : base);
    const reopen = !order.deposit && (["รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] as OrderStatus[]).includes(order.status);
    const ok = await askConfirm({
      icon: "🧾",
      title: "เปิด VAT 7% ให้ออเดอร์นี้?",
      detail: `ลูกค้าขอใบกำกับภาษีทีหลัง — คิด VAT 7% จากยอดบิล ${formatPrice(base)} = ${formatPrice(amt)}\nยอดรวมใหม่ ${formatPrice(base + amt)} · รับแล้ว ${formatPrice(paid)} → ค้าง ${formatPrice(Math.max(0, base + amt - paid))}\nระบบจะแจ้งลูกค้าทางไลน์ให้โอนส่วนต่างแล้วแนบสลิปที่ลิงก์เดิม${reopen ? ' · ใบยังไม่เข้าไลน์ผลิต จะกลับไป "รอชำระเงิน"' : " · งานเดินต่อ แต่ยิงเลขพัสดุไม่ได้จนกว่าจะเก็บครบ"}`,
      confirmLabel: "เปิด VAT 7% + แจ้งลูกค้า",
    });
    if (!ok) return;
    await applyOrderFromServer(
      withLog({ ...order, vat: { rate: 7, amount: amt } }, actor, "เปิด VAT 7% (ออกใบกำกับภาษีทีหลัง)", `VAT ${formatPrice(amt)} จากยอด ${formatPrice(base)} → ยอดรวม ${formatPrice(base + amt)}`)
    );
  }

  /**
   * ⚡↩️ คืนส่วนลดโอนไวให้ใบที่ "หมดเวลา" — ใช้ตอน SlipOK อ่านเวลาโอนบนสลิปไม่ได้ (สลิป K BIZ ไม่มี QR · แนบแทนลูกค้า)
   * แต่แอดมินเห็นบนสลิปว่าโอนทัน หรือตกลงกับลูกค้าแล้ว · ทางอัตโนมัติอยู่ใน slip-apply (ดูเวลาโอนจาก SlipOK)
   * เงินที่รับไว้แล้วครบยอดใหม่ + ใบยังรอเงิน + มีสิทธิ์ยืนยันเงินเข้า → เปลี่ยนเป็น "ชำระแล้ว" ในคำขอเดียว (ไม่ต้องกด 2 รอบ)
   */
  async function restoreEarlyPay() {
    if (!order?.earlyPay || earlyPayState(order) !== "expired") return;
    const next = reinstateEarlyPay(order, new Date().toISOString(), actor);
    const total = orderTotal(next);
    const paid = paidSoFar(next);
    const waiting = next.status === "รอชำระเงิน" || next.status === "รอตรวจสอบ";
    const confirmPaid = paid > 0 && paid + 0.5 >= total && waiting && mayMarkPaid && !next.deposit;
    const ok = await askConfirm({
      icon: "⚡",
      title: `คืนส่วนลดโอนไว ${formatPrice(order.earlyPay.amount)} ให้ใบนี้?`,
      detail:
        `ส่วนลดหมดเวลาไปแล้วตามกติกา — กดคืนเมื่อเห็นบนสลิปว่าลูกค้าโอนทันเวลา หรือตกลงกับลูกค้าแล้ว\n` +
        `ยอดรวมใหม่ ${formatPrice(total)}${paid > 0 ? ` · รับแล้ว ${formatPrice(paid)}${paid + 0.5 >= total ? " → ครบแล้ว" : ` → ค้าง ${formatPrice(Math.max(0, total - paid))}`}` : ""}` +
        (confirmPaid ? '\nใบจะเปลี่ยนเป็น "ชำระแล้ว" ให้เลย (แจ้งลูกค้า + เข้าบอร์ดกราฟฟิก)' : ""),
      confirmLabel: "คืนส่วนลด",
    });
    if (!ok) return;
    await applyOrderFromServer(
      withLog(
        confirmPaid ? { ...next, status: "ชำระแล้ว" as OrderStatus } : next,
        actor,
        "คืนส่วนลดโอนไว",
        `${order.earlyPay.label} ${formatPrice(order.earlyPay.amount)} — แอดมินคืนให้หลังหมดเวลา (ลูกค้าโอนทัน/ตกลงกันแล้ว) · ยอดรวม ${formatPrice(total)}${confirmPaid ? " · เงินครบ → ชำระแล้ว" : ""}`
      )
    );
  }

  /** ยกเลิก VAT ที่เปิดไว้ (ใส่ผิด) — ยอดรวมกลับเท่าเดิม */
  async function removeVat() {
    if (!order?.vat) return;
    if (!(await askConfirm({ icon: "🧾", title: `ยกเลิก VAT ${order.vat.rate}% ${formatPrice(orderVatAmount(order))}?`, detail: "ยอดรวมจะกลับเท่าเดิม — ถ้าลูกค้าโอน VAT มาแล้วจะกลายเป็นโอนเกิน", confirmLabel: "ยกเลิก VAT", danger: true }))) return;
    await applyOrderFromServer(withLog({ ...order, vat: undefined }, actor, "ยกเลิก VAT", `ยอดรวมกลับเป็น ${formatPrice(orderTotal({ ...order, vat: undefined }))}`));
  }

  /**
   * 🧾 วางลิงก์แชร์ FlowAccount → ดึงชื่อผู้ซื้อ/เลขผู้เสียภาษี/สาขา/ที่อยู่ มาเติมฟอร์มให้ (ใช้ POST /api/admin/orders/flowaccount ตัวเดิม — อ่านอย่างเดียว ไม่สร้างออเดอร์)
   * เอกสารมี VAT → เสนอเปิด VAT ตามยอดในเอกสาร (แม่นกว่าคิด 7% เอง)
   * เอกสารมีรายการ → เสนอดึง "รายการ + ค่าส่ง + ส่วนลด" มาใส่ในใบงานพร้อมกัน
   * (14 ก.ย. 69 พนักงานแจ้ง "ดึงข้อมูลใบเสนอราคาแล้วมาแค่ยอด" — ใบงานว่างเปล่าแต่มี VAT กราฟฟิกไม่รู้ว่าต้องทำอะไร)
   */
  async function fetchTaxFromFlowAccount() {
    if (!taxForm) return;
    const url = taxForm.docUrl.trim();
    if (!/share\.flowaccount\.com/i.test(url)) {
      setErr("วางลิงก์แชร์ของ FlowAccount (share.flowaccount.com/…) ก่อน");
      return;
    }
    setTaxFetching(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/flowaccount", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        doc?: {
          docNo?: string;
          docTypeLabel?: string;
          vat?: number;
          vatRate?: number;
          wht?: number;
          whtRate?: number;
          subtotal?: number;
          net?: number;
          date?: string;
          discount?: number;
          grandTotal?: number;
          items?: { name: string; detail: string; qty: number; unitPrice: number; amount: number }[];
          customer?: { name?: string; taxId?: string; branch?: string; address?: string };
        };
        shipping?: ShippingMethod[];
      };
      if (!res.ok || !j.doc) {
        setErr(j.error ?? "อ่านเอกสาร FlowAccount ไม่สำเร็จ");
        return;
      }
      const c = j.doc.customer ?? {};
      const docVat = Number(j.doc.vat) || 0;
      // บรรทัด "ค่าส่ง" ในเอกสารไม่ใช่งานผลิต — แยกไปเป็นค่าจัดส่งของออเดอร์ (ท่าเดียวกับกล่องสร้างออเดอร์จากลิงก์)
      const docLines = j.doc.items ?? [];
      const shipLines = docLines.filter((it) => DOC_SHIP_RE.test(it.name));
      const workLines = docLines.filter((it) => !DOC_SHIP_RE.test(it.name));
      const docShip = shipLines.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
      const methods = j.shipping?.length ? j.shipping : shipMethods;
      setTaxForm((cur) =>
        cur
          ? {
              ...cur,
              company: c.name?.trim() || cur.company,
              taxId: c.taxId?.trim() || cur.taxId,
              branch: c.branch?.trim() || cur.branch,
              address: c.address?.trim() || cur.address,
              docNo: j.doc!.docNo,
              docTypeLabel: j.doc!.docTypeLabel,
              docVat: docVat > 0 ? docVat : undefined,
              docVatRate: Number(j.doc!.vatRate) || 7,
              applyDocVat: docVat > 0 && !order?.vat,
              docItems: workLines.map((it) => ({
                name: it.name,
                selections: it.detail ?? "",
                qty: Math.max(1, Math.round(Number(it.qty) || 0)),
                unitPrice: Math.max(0, Number(it.unitPrice) || 0),
              })),
              docShip: shipLines.length ? docShip : undefined,
              docShipLabel: shipLines.length ? normalizeShipLabel(shipLines.map((it) => it.name).join(" · "), docShip, methods) : undefined,
              docDiscount: Number(j.doc!.discount) > 0 ? Number(j.doc!.discount) : undefined,
              docGrandTotal: Number(j.doc!.grandTotal) || undefined,
              docWht: Number(j.doc!.wht) > 0 ? Number(j.doc!.wht) : undefined,
              docWhtRate: Number(j.doc!.whtRate) || undefined,
              docSubtotal: Number(j.doc!.subtotal) || undefined,
              docNet: Number(j.doc!.net) || undefined,
              docDate: j.doc!.date,
              // ใบงานยังไม่มีรายการ = ตั้งใจจะดึงมาอยู่แล้ว · มีรายการอยู่แล้วไม่ติ๊กให้ (ทับของเดิมต้องตั้งใจกด)
              applyDocItems: workLines.length > 0 && !order?.items.length,
            }
          : cur
      );
    } finally {
      setTaxFetching(false);
    }
  }

  /** 🧾 บันทึกข้อมูลใบกำกับภาษี (ชื่อบริษัท/เลขผู้เสียภาษี/สาขา/ที่อยู่ + อ้างอิงเอกสาร) — ขึ้นใบงาน/ใบเสร็จ · เลือกเปิด VAT ตามเอกสารพร้อมกันได้ */
  async function saveTaxInvoice() {
    if (!order || !taxForm) return;
    const company = taxForm.company.trim();
    if (!company) {
      setErr("ใส่ชื่อบริษัท/ผู้ซื้อในใบกำกับก่อน");
      return;
    }
    const docUrl = taxForm.docUrl.trim();
    const taxInvoice: NonNullable<Order["taxInvoice"]> = {
      company,
      taxId: taxForm.taxId.trim() || undefined,
      branch: taxForm.branch.trim() || undefined,
      address: taxForm.address.trim(),
      ...(taxForm.docNo ? { docNo: taxForm.docNo, docUrl: docUrl || undefined, docTypeLabel: taxForm.docTypeLabel } : {}),
    };
    const docVat = taxForm.docVat ?? 0;
    const docWht = taxForm.docWht ?? 0;
    const withVat = !!taxForm.applyDocVat && docVat > 0 && !order.vat;
    // 📋 ดึงรายการตามเอกสารมาใส่ใบงานด้วย (ค่าส่ง/ส่วนลดตามใบไปพร้อมกัน — ยอดจะได้เท่าบิล FlowAccount)
    const docItems = taxForm.applyDocItems ? (taxForm.docItems ?? []) : [];
    const withItems = docItems.length > 0;
    if (withItems && order.items.length) {
      const ok = await askConfirm({
        icon: "📋",
        title: `แทนที่รายการเดิม ${order.items.length} รายการ?`,
        detail: `ใบงานจะเหลือ ${docItems.length} รายการตาม${taxForm.docTypeLabel ?? "เอกสาร"} ${taxForm.docNo ?? ""} — แบบงาน/ติ๊กของกราฟฟิกในรายการเดิมจะหายไปด้วย`,
        confirmLabel: "แทนที่ตามเอกสาร",
        danger: true,
      });
      if (!ok) return;
    }
    const items: OrderItem[] = docItems.map((it) => ({ productId: "special-item", name: it.name, selections: it.selections, qty: it.qty, unitPrice: it.unitPrice }));
    const shipPatch =
      withItems && taxForm.docShip != null
        ? { shippingCost: taxForm.docShip, ...(isPickupOrder(order) || !taxForm.docShipLabel ? {} : { shippingLabel: taxForm.docShipLabel }) }
        : {};
    const discountPatch =
      withItems && (taxForm.docDiscount ?? 0) > 0 && !order.adminDiscount
        ? { adminDiscount: { label: `ส่วนลดตามใบ ${taxForm.docNo ?? ""}`.trim(), amount: taxForm.docDiscount! } }
        : {};
    /**
     * 🧾 ดึงรายการจากเอกสารเมื่อไหร่ "ภาษี + ยอดสรุปตามใบ" ต้องมาด้วยเสมอ
     * (OD-260915-1705 · 15 ก.ย. 69: QT010660 แก้จำนวน 12 → 5 ชิ้น · ดึงรายการมาใหม่แล้วแต่ VAT ยังค้าง 255.36
     *  ของ 12 ชิ้น หัก ณ ที่จ่ายค้าง 109.44 → ยอดในระบบ 1,775.36 ไม่ตรงทั้งใบเก่าและใบใหม่
     *  ลูกค้าโอนสุทธิตามใบ 1,580.80 ครบแล้ว ระบบกลับนับเป็นรับบางส่วนแล้วส่งไลน์ทวงอีก 194.56)
     * รายการของเอกสารฉบับหนึ่ง + ภาษีของอีกฉบับ = ยอดที่ไม่ใช่ของใครเลย ห้ามให้เกิดขึ้นอีก
     */
    const taxPatch: Partial<Order> = withItems
      ? {
          vat: docVat > 0 ? { rate: taxForm.docVatRate || 7, amount: docVat } : undefined,
          ...(docWht > 0 ? { wht: { rate: taxForm.docWhtRate || 3, amount: docWht } } : {}),
        }
      : withVat
        ? { vat: { rate: taxForm.docVatRate || 7, amount: docVat } }
        : {};
    /**
     * 📄 ใบที่ผูกกับเอกสารฉบับเดียวกันอยู่แล้ว → อัปยอดสรุปที่เก็บไว้ให้เป็นฉบับล่าสุดด้วย
     * ไม่งั้นระบบถือสองภาพของเอกสารเดียวกัน (รายการใหม่ · ยอดสรุปเก่า) แล้วด่านตรวจสลิปเทียบกับภาพที่ผิด
     * ใบมัดจำไม่แตะ — ยอดในช่องนั้นเป็น "มูลค่างานเต็ม" ที่รวมมาจาก 2 เอกสาร
     */
    const sameDoc = !!order.flowAccount && !!taxForm.docNo && order.flowAccount.docNo === taxForm.docNo && !order.flowAccount.deposit;
    const faPatch: Partial<Order> =
      withItems && sameDoc
        ? {
            flowAccount: {
              ...order.flowAccount!,
              ...(taxForm.docDate ? { date: taxForm.docDate } : {}),
              subtotal: taxForm.docSubtotal,
              vat: docVat,
              grandTotal: taxForm.docGrandTotal,
              wht: docWht,
              net: taxForm.docNet,
              fetchedAt: new Date().toISOString(),
            },
          }
        : {};
    const base = withLog(
      {
        ...order,
        taxInvoice,
        ...(withItems ? { items, ...shipPatch, ...discountPatch, ...faPatch } : {}),
        ...taxPatch,
      },
      actor,
      order.taxInvoice ? "แก้ข้อมูลใบกำกับภาษี" : "ใส่ข้อมูลใบกำกับภาษี",
      `${company}${taxInvoice.taxId ? ` · ${taxInvoice.taxId}` : ""}${taxInvoice.docNo ? ` · ${taxInvoice.docTypeLabel ?? "เอกสาร"} ${taxInvoice.docNo}` : ""}`
    );
    const withItemsLog = withItems
      ? withLog(
          base,
          actor,
          "ดึงรายการตามเอกสาร FlowAccount",
          `${docItems.length} รายการจาก ${taxForm.docTypeLabel ?? "เอกสาร"} ${taxForm.docNo ?? ""}${
            taxForm.docShip != null ? ` · ค่าส่ง ${formatPrice(taxForm.docShip)}` : ""
          }${discountPatch.adminDiscount ? ` · ส่วนลด ${formatPrice(taxForm.docDiscount!)}` : ""}`
        )
      : base;
    // ภาษีขยับจากของเดิม (เปิด VAT ครั้งแรก · หรือดึงรายการมาแล้วภาษีตามฉบับใหม่) — ต้องเห็นใน log ว่าเปลี่ยนจากเท่าไหร่
    const vatMoved = (taxPatch.vat?.amount ?? 0) !== (order.vat?.amount ?? 0);
    const whtMoved = (taxPatch.wht?.amount ?? order.wht?.amount ?? 0) !== (order.wht?.amount ?? 0);
    const next =
      vatMoved || whtMoved
        ? withLog(
            withItemsLog,
            actor,
            order.vat || order.wht ? "ภาษีตามเอกสาร FlowAccount" : "เปิด VAT ตามเอกสาร FlowAccount",
            `${vatMoved ? `VAT ${formatPrice(order.vat?.amount ?? 0)} → ${formatPrice(taxPatch.vat?.amount ?? 0)}` : ""}${vatMoved && whtMoved ? " · " : ""}${
              whtMoved ? `หัก ณ ที่จ่าย ${formatPrice(order.wht?.amount ?? 0)} → ${formatPrice(taxPatch.wht?.amount ?? 0)}` : ""
            } → ยอดรวม ${formatPrice(orderTotal(withItemsLog))}`
          )
        : withItemsLog;
    // ยอดตามใบไม่ตรงกับที่คิดได้จากรายการ = แอดมินต้องรู้ก่อนแจ้งลูกค้า (ลิงก์แชร์อาจเป็นฉบับเก่า)
    const gap = taxForm.docGrandTotal != null && withItems ? Math.round((orderTotal(next) - taxForm.docGrandTotal) * 100) / 100 : 0;
    setTaxForm(null);
    // ยอดโต (เปิด VAT/ดึงรายการ) → รับก้อนจากเซิร์ฟเวอร์ (สถานะเด้งกลับรอชำระเงิน/paidTotal/แจ้งไลน์) · แค่ข้อมูลผู้ซื้อ = บันทึกธรรมดา
    if (withVat || withItems || vatMoved || whtMoved) await applyOrderFromServer(next);
    else applyOrder(next);
    if (Math.abs(gap) >= 0.01)
      setErr(
        `⚠️ ยอดในระบบ ${formatPrice(orderTotal(next))} ไม่ตรงกับยอดตาม${taxForm.docTypeLabel ?? "เอกสาร"} ${formatPrice(taxForm.docGrandTotal!)} (ต่าง ${formatPrice(Math.abs(gap))}) — ตรวจรายการ/ค่าส่ง/ส่วนลดก่อนแจ้งลูกค้า`
      );
  }

  /** บันทึกออเดอร์ปัจจุบันลงฐานข้อมูล (เรียกตอน blur ช่องกรอก) */
  /**
   * บันทึกลงฐาน + ถ้าพลาดต้องขึ้นให้เห็น — เดิมทุกปุ่ม (ลบแบบ/ติ๊ก/แก้จำนวน) ยิงเงียบ ๆ
   * กราฟฟิกกด "ลบแบบ" แล้วเซิร์ฟเวอร์ตอบ 403 หน้าจอเหมือนลบได้ แต่พออัปรูปใหม่/รีเฟรช รูปเดิมกลับมา — งงกันทั้งร้าน
   */
  async function saveOrWarn(next: Order): Promise<boolean> {
    const r = await saveOrderAdminResult(next, { base: baseRef.current });
    if (!r.ok) {
      setErr(`⚠️ ${r.error ?? "บันทึกลงฐานข้อมูลไม่สำเร็จ"} — สิ่งที่เพิ่งทำยังไม่ถูกบันทึก อย่าเพิ่งปิดหน้านี้ ลองใหม่หรือรีเฟรชดูค่าจริง`);
      return false;
    }
    /**
     * 🕒 รับ savedAt ที่เซิร์ฟเวอร์ประทับกลับมาถือไว้เสมอ — รอบหน้าเซิร์ฟเวอร์จะรู้ว่าหน้านี้ "เห็นข้อมูลถึงตอนนี้แล้ว"
     * (ไม่ถือ = ถูกมองว่าเป็นหน้าจอค้าง ยกเลิกติ๊กที่เพิ่งกดเอง/ลบรูปที่เพิ่งอัปไม่ได้)
     * ถ้ายังไม่มีใครแก้ต่อจากก้อนที่เพิ่งส่ง (state ยังเป็นก้อนเดิม) รับติ๊ก/แบบงานที่เซิร์ฟเวอร์ประทับเวลาให้แล้วมาด้วย ให้ตรงฐาน
     * แก้ต่อไปแล้ว → รับแค่ savedAt ห้ามทับสิ่งที่เพิ่งทำ (คำขอถัดไปกำลังตามมา)
     * 🏅 ส่วนลดระดับสมาชิก เซิร์ฟเวอร์เป็นเจ้าของ (คิดจากผู้ติดต่อที่ผูก) — รับกลับมาเสมอ ไม่งั้นผูกผู้ติดต่อแล้วยอดบนจอยังเป็นราคาเต็ม
     */
    const saved = r.order;
    adoptFromServer(saved);
    if (saved)
      setOrder((cur) => {
        if (!cur || cur.id !== saved.id) return cur;
        if (cur === next && cur.items.length === saved.items.length)
          // 🛒 needsPurchase.alertedAt เซิร์ฟเวอร์ประทับตอนแจ้งกลุ่มไลน์ — รับกลับมาด้วย ไม่งั้นรอบหน้าช่องนี้ถูกมองว่า "แก้" ทั้งที่ไม่ได้แตะ
          return { ...cur, savedAt: saved.savedAt, discount: saved.discount, log: saved.log, needsPurchase: saved.needsPurchase, items: cur.items.map((it, i) => withServerStamps(it, saved.items[i])) };
        return { ...cur, savedAt: saved.savedAt, discount: saved.discount };
      });
    return true;
  }

  function persist() {
    if (!order || demo) return;
    void saveOrWarn(order);
  }

  /**
   * 📅 ใบที่มีวันใช้งานแต่ช่องวันส่งยังว่าง (ใบเก่าก่อนมีระบบ / ลูกค้าระบุตอนสั่ง) → เติมวันส่งให้เอง (วันเดียว from=to) แล้วบันทึก
   * ทำครั้งเดียวต่อใบ · เฉพาะคนที่มีสิทธิ์แก้ออเดอร์ (ฝ่ายแพ็ค/กราฟฟิกเซิร์ฟเวอร์ไม่รับฟิลด์นี้อยู่แล้ว ไม่ต้องยิงให้เด้ง error)
   */
  const shipAutoRef = useRef<string>("");
  /** 🗓 วันหยุดร้านจากปฏิทิน TP-Leader — โหลดเสร็จแล้ววาดคำเตือนวันส่งใหม่ด้วยวันหยุดชุดจริง */
  useShopHolidays();

  /**
   * 📅 เปิดช่อง "ถึง" ให้ใบไหน — เจ้าของร้านสั่ง 14 ก.ย. 69: "ระบุ 1 วันก็ได้ ระบุจาก–ถึงก็ได้"
   * ค่าเริ่มต้นปิด (ใบส่วนใหญ่นัดวันเดียว ตามที่สั่งไว้ 11 ก.ย. 69) · ใบที่เก็บเป็นช่วงไว้แล้วเปิดให้เอง
   * เก็บเป็น id ของใบ ไม่ใช่ true/false — สลับไปดูใบอื่นในจอเดียวกันจะได้ไม่ค้างเปิด
   */
  const [shipRangeFor, setShipRangeFor] = useState("");
  useEffect(() => {
    if (!order || demo || !permsReady || !rolCan("orders.edit")) return;
    if (!order.useByDate || order.shipDate?.from || order.shipDate?.to) return;
    if (shipAutoRef.current === order.id) return;
    const win = shipWindowForUseBy(order.useByDate, todayYmd(), orderDateYmd(order));
    if (!win) return;
    shipAutoRef.current = order.id;
    applyOrder({ ...order, shipDate: { from: win.from, to: win.from } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.useByDate, order?.shipDate?.from, order?.shipDate?.to, demo, permsReady]);

  /**
   * ⚡ ค่าส่งที่ระบบคิดให้จากของในออเดอร์ (กติกาเดียวกับหน้าตะกร้า — ของเยอะ/ของหนักเด้งกล่องใหญ่เอง)
   * ออเดอร์งานพิเศษไม่ได้ผ่านตะกร้า แอดมินเลยต้องเดาค่าส่งเองทุกใบ → เปิดให้เลือก "อัตโนมัติ" ในช่องวิธีส่ง
   * รายการที่ไม่มีในคลัง (งานพิเศษ) ไม่มีตารางค่าส่งของตัวเอง และไม่นับเป็นเรทปลีก (เกณฑ์ยอดจึงทำงานตามปกติ)
   */
  const autoShipOf = (o: Order) =>
    shipMethods.length
      ? autoShipQuote(
          o.items.map((it) => {
            const p = shopProducts.get(it.productId);
            return { productId: it.productId, name: it.name, qty: it.qty, selections: it.sel ?? {}, product: p };
          }),
          shipMethods,
          {
            subtotal: o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
            freeMin: freeShipMin,
            retailOnly: o.items.every((it) => {
              const p = shopProducts.get(it.productId);
              return p ? isRetailRateLine(p, it.sel ?? {}, it.qty) : false;
            }),
          }
        )
      : null;
  /**
   * 🚚 ใบที่ยังไม่เคยเลือกวิธีส่ง (สร้างออเดอร์งานพิเศษ/เพิ่มรายการเอง) → เติมวิธีส่ง+ค่าส่งอัตโนมัติลงช่องให้เลย
   * เจ้าของร้านทัก 18 ก.ย. 69 (OD-260917-9204): ช่องวิธีส่งค้าง "เลือกวิธีส่ง…" ค่าส่ง 0 แต่มีแถบ "⚡ ใช้ค่าส่งอัตโนมัติ EMS ฿50"
   * โผล่ใต้ช่องแทน — ค่าที่ระบบคิดให้ควรอยู่ในช่องเลยตั้งแต่แรก แอดมินแก้ตัวเลข/สลับวิธีต่อได้เหมือนเดิม
   * ทำครั้งเดียวต่อใบ · รอสินค้าในออเดอร์โหลดครบก่อน (ตารางค่าส่งตามจำนวน/กล่องใหญ่อยู่ในตัวสินค้า) · ไม่แตะใบที่มีเงินเข้าแล้ว/มารับเอง
   * ใบที่ตั้งใจให้ค่าส่ง 0 ต้องมีป้ายวิธีส่ง (เช่น "ส่งฟรี") ถึงไม่ถูกเติมทับ — ดู shippingUnset() · ใบจากใบเสนอราคา/FlowAccount/เคลม ข้ามทั้งหมด
   */
  const shipFillRef = useRef<string>("");
  useEffect(() => {
    if (!order || demo || !permsReady || !rolCan("orders.edit")) return;
    if (shipFillRef.current === order.id) return;
    // "ยังไม่เคยเลือกวิธีส่ง" = ไม่มีป้ายวิธีส่ง + ค่าส่ง 0 + ไม่ใช่มารับเอง (สูตรเดียวกับ shippingUnset ใน ship-label.ts)
    const unset = !(order.shippingLabel ?? "").trim() && !(order.shippingCost > 0) && !isPickupOrder(order);
    if (!order.items.length || !unset || paidSoFar(order) > 0) return;
    // ใบที่ยอดตกลงกันไว้แล้ว (ใบเสนอราคา/บิล FlowAccount/งานเคลมร้านออกค่าส่ง) ค่าส่ง 0 ไม่มีป้าย = ตั้งใจ ห้ามบวก ฿50 ทับ
    if (order.quoteOf || order.flowAccount || order.claimOf) return;
    const realIds = order.items.map((it) => it.productId).filter((id) => id && !id.includes("#") && id !== "special-item");
    if (realIds.some((id) => !shopProducts.has(id))) return; // สินค้ายังโหลดไม่ครบ — รอรอบหน้า
    const q = autoShipOf(order);
    if (!q?.method) return;
    shipFillRef.current = order.id;
    const cost = Math.max(0, q.cost);
    applyOrder(
      withLog(
        {
          ...order,
          shipping: (q.method.name.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา") as Order["shipping"],
          shippingLabel: q.method.name,
          shippingCost: cost,
        },
        actor,
        "เปลี่ยนวิธีส่ง",
        `— ${formatPrice(order.shippingCost)} → ${q.method.name} ${formatPrice(cost)} (อัตโนมัติ — ${q.reason})`
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items.length, order?.shippingLabel, order?.shippingCost, shipMethods, freeShipMin, shopProducts, demo, permsReady]);

  /** วันนี้แบบ YYYY-MM-DD ตามนาฬิกาเครื่องแอดมิน (ไว้กันช่วงวันส่งถอยไปก่อนวันนี้) */
  function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** อัปเดต order + บันทึกทันที (ใช้กับ select สี/ขนาด/วันที่ ที่ไม่มี blur) */
  function applyOrder(next: Order) {
    setOrder(next);
    if (demo) return;
    void saveOrWarn(next);
  }

  /** บันทึกหมายเหตุ (HTML) ของท้ายบิล หรือของรายการที่ index (itemIdx = null → ท้ายบิล) · commit = บันทึกลง DB */
  function setNote(itemIdx: number | null, html: string, commit: boolean) {
    setOrder((cur) => {
      if (!cur) return cur;
      const next =
        itemIdx === null
          ? { ...cur, billNote: html }
          : { ...cur, items: cur.items.map((it, i) => (i === itemIdx ? { ...it, adminNote: html } : it)) };
      if (commit && !demo) void saveOrWarn(next);
      return next;
    });
  }

  /**
   * 📌 หมายเหตุถึง "ลูกค้า" ของรายการนี้ — โชว์ในหน้าเช็คแบบ (เตือนก่อนลูกค้ากดอนุมัติ)
   * พิมพ์ในจอก่อน บันทึกตอนออกจากช่อง (persist) เหมือนช่องรายละเอียดของรูปแบบ
   * ⚠️ คนละช่องกับหมายเหตุใบงาน (adminNote) ที่ฝ่ายแพ็คเห็น — ช่องนี้ฝ่ายแพ็คไม่เห็น
   */
  function setProofMemo(itemIndex: number, v: string) {
    setOrder((cur) =>
      cur
        ? { ...cur, items: cur.items.map((it, i) => (i === itemIndex ? { ...it, proofMemo: v.trim() ? v : undefined } : it)) }
        : cur
    );
  }

  /** บันทึกเลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" + ลง log
   *  ด่านตรวจยังไม่ครบ → แอดมินยืนยันข้ามได้ (เซิร์ฟเวอร์ลง log "ข้ามด่านตรวจ") · ฝ่ายแพ็คโดนเซิร์ฟเวอร์ปฏิเสธ */
  function saveTracking() {
    if (!order) return;
    saveTrackingValue((order.tracking ?? "").trim());
  }

  /** บันทึกเลขพัสดุจากค่าที่ส่งมาตรง ๆ (กล้องมือถือสแกนได้) — ไม่ต้องรอ state ช่องกรอกอัปเดตก่อน */
  function saveTrackingValue(raw: string) {
    if (!order) return;
    const t = raw.trim();
    if (!t || t === trackingRef.current) return; // ไม่เปลี่ยน → ไม่ต้องบันทึกซ้ำ
    // ให้ช่องกรอก/โมดัลข้ามด่านเห็นเลขเดียวกับที่สแกนมา
    if (t !== (order.tracking ?? "").trim()) setOrder((cur) => (cur ? { ...cur, tracking: t } : cur));

    const g = packGate(order);
    if (!g.ready) {
      const reasons = [
        g.planPending ? planPendingReason(g.planPending) : "",
        g.uncounted.length ? `ตรวจนับแบบงานอีก ${g.uncounted.length} รูป` : "",
        g.unread.length ? `ยืนยันอ่านรายละเอียดอีก ${g.unread.length} รายการ` : "",
        g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
        g.missing.length ? `ของยังไม่มา/ไม่ครบ ${g.missing.length} รายการ (${g.missing.map((m) => m.item).join(", ")})` : "",
        g.unsampled.length ? `ยังไม่ยืนยันใส่ชิ้นงานตัวอย่าง ${g.unsampled.length} รายการ` : "",
        g.noPhoto ? "ยังไม่ได้ถ่ายภาพก่อนปิดกล่อง" : "",
        g.taxInvoiceUnpacked ? "ยังไม่ยืนยันใส่ใบกำกับภาษีลงกล่อง" : "",
        g.unpaidBalance ? (order?.deposit ? "ยังเก็บยอดคงเหลือ (มัดจำ 50%) ไม่ครบ" : "ยังเก็บส่วนต่างที่ตีราคาเพิ่มไม่ครบ") : "",
      ].filter(Boolean);
      if (!mayEdit) {
        setOrder((cur) => (cur ? { ...cur, tracking: trackingRef.current || undefined } : cur));
        setErr(`ยังยิงเลขพัสดุไม่ได้ — ต้องผ่านด่านตรวจก่อน: ${reasons.join(" · ")}`);
        return;
      }
      setSkipGate(reasons); // เปิดโมดัลยืนยัน — ตัดสินใจต่อใน confirmSkipGate/cancelSkipGate
      return;
    }
    commitTracking(t);
  }

  /** บันทึกเลขพัสดุจริง (ผ่านด่านแล้ว หรือแอดมินยืนยันข้าม) */
  function commitTracking(t: string) {
    if (!order) return;
    trackingRef.current = t;
    const next = withLog(
      { ...order, tracking: t, status: order.status === "เสร็จสิ้น" ? order.status : "จัดส่งแล้ว" },
      actor,
      "บันทึกเลขพัสดุ",
      t
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** เหตุผลที่ด่านแพ็คยังไม่ผ่าน — ใช้ทั้งช่องเลขพัสดุและปุ่มแพ็คเสร็จ (มารับเอง) */
  function gateReasonsOf(o: Order): string[] {
    const g = packGate(o);
    return [
      g.planPending ? planPendingReason(g.planPending) : "",
      g.uncounted.length ? `ตรวจนับแบบงานอีก ${g.uncounted.length} รูป` : "",
      g.unread.length ? `ยืนยันอ่านรายละเอียดอีก ${g.unread.length} รายการ` : "",
      g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
      g.missing.length ? `ของยังไม่มา/ไม่ครบ ${g.missing.length} รายการ (${g.missing.map((m) => m.item).join(", ")})` : "",
      g.unsampled.length ? `ยังไม่ยืนยันใส่ชิ้นงานตัวอย่าง ${g.unsampled.length} รายการ` : "",
      g.noPhoto ? "ยังไม่ได้ถ่ายภาพก่อนปิดกล่อง" : "",
      g.taxInvoiceUnpacked ? "ยังไม่ยืนยันใส่ใบกำกับภาษีลงกล่อง" : "",
      g.unpaidBalance ? (o.deposit ? "ยังเก็บยอดคงเหลือ (มัดจำ 50%) ไม่ครบ" : "ยังเก็บส่วนต่างที่ตีราคาเพิ่มไม่ครบ") : "",
    ].filter(Boolean);
  }

  /**
   * 🏪 มารับเอง: ฝ่ายแพ็คกด "แพ็คเสร็จ" แทนยิงเลขพัสดุ (เจ้าของร้านขอ 11 ก.ย. 69)
   * ด่านตรวจเดียวกับยิงเลข — ฝ่ายแพ็คข้ามไม่ได้ · แอดมินยืนยันข้ามได้ (เซิร์ฟเวอร์ลง log)
   */
  function confirmPackedPickup() {
    if (!order || order.packedAt) return;
    if (!packGate(order).ready) {
      const reasons = gateReasonsOf(order);
      if (!mayEdit) {
        setErr(`ยังยืนยันแพ็คเสร็จไม่ได้ — ต้องผ่านด่านตรวจก่อน: ${reasons.join(" · ")}`);
        return;
      }
      pickupPendingRef.current = true;
      setSkipGate(reasons);
      return;
    }
    commitPackedPickup();
  }

  /** บันทึก "แพ็คเสร็จ รอลูกค้ามารับ" จริง — สถานะเป็นจัดส่งแล้ว (สำหรับใบมารับเอง = พร้อมรับ) */
  function commitPackedPickup() {
    if (!order) return;
    const next = withLog(
      { ...order, packedAt: { at: new Date().toISOString(), by: actor }, status: order.status === "เสร็จสิ้น" ? order.status : "จัดส่งแล้ว" },
      actor,
      "📦 แพ็คเสร็จ — รอลูกค้ามารับ",
      "มารับเองที่ร้าน · ระบบแจ้งลูกค้าทางไลน์ให้มารับ"
    );
    setOrder(next);
    // ป้ายข้างเมนู "ลูกค้าที่มารับเอง" นับใหม่ทันที (AdminShell ฟังอีเวนต์นี้)
    if (!demo) void saveOrWarn(next).then(() => window.dispatchEvent(new Event("iducky:pickup-changed")));
  }

  /** แอดมินยืนยัน "ข้ามด่านตรวจ" จากโมดัล — เซิร์ฟเวอร์จะลง log ชื่อคนข้ามเสมอ */
  function confirmSkipGate() {
    setSkipGate(null);
    if (pickupPendingRef.current) {
      pickupPendingRef.current = false;
      commitPackedPickup();
      return;
    }
    const t = (order?.tracking ?? "").trim();
    if (t) commitTracking(t);
  }

  /** ยกเลิกข้ามด่าน → คืนช่องเลขพัสดุเป็นค่าเดิม */
  function cancelSkipGate() {
    setSkipGate(null);
    pickupPendingRef.current = false;
    setOrder((cur) => (cur ? { ...cur, tracking: trackingRef.current || undefined } : cur));
  }

  /** 🚚 ติ๊ก/ยกเลิกรูปที่จะไปกับรอบแบ่งส่งรอบนี้ — ติ๊กครั้งแรกได้ "ที่เหลือทั้งหมด" ของรูปนั้น แก้จำนวนต่อในโมดัลได้ */
  function toggleShipSel(itemIndex: number, proofIndex: number) {
    const k = proofKey(itemIndex, proofIndex);
    const left = order ? proofShipStates(order).get(k)?.remaining ?? 0 : 0;
    setShipSel((cur) => {
      const next = new Map(cur);
      if (next.has(k)) next.delete(k);
      else if (left > 0) next.set(k, left);
      return next;
    });
  }

  /**
   * 🚚 ยิงเลขพัสดุ "รอบแบ่งส่ง" — บันทึกลง Order.shipments (ใบยังไม่ปิด สถานะเดิม) + log
   * ด่านตรวจเฉพาะรูปที่เลือก (partialGate) ตัดสินในโมดัลแล้ว: ฝ่ายแพ็คผ่านถึงกดได้ · แอดมินข้ามได้ (เซิร์ฟเวอร์ลง log)
   * เซิร์ฟเวอร์แจ้งลูกค้าทางไลน์เองเมื่อเห็นรอบใหม่ (newShipmentsOf ใน route)
   */
  function commitPartialShipment(tracking: string, note: string, sel: Map<string, number>) {
    if (!order) return;
    const t = tracking.trim();
    if (!t) return;
    const states = proofShipStates(order);
    const proofs: Shipment["proofs"] = [];
    sel.forEach((qty, k) => {
      const [i, j] = k.split(":").map(Number);
      const it = order.items[i];
      const p = it ? proofsOf(it)[j] : undefined;
      if (!it || !p) return;
      // qty = จำนวนที่ไปกับรอบนี้ (อาจน้อยกว่าป้ายบนรูป) · ofQty = จำนวนเต็มบนรูป ไว้โชว์ "1/10"
      const go = Math.max(0, Math.min(Math.floor(qty) || 0, states.get(k)?.remaining ?? 0));
      if (!go) return;
      proofs.push({
        item: i,
        proof: j,
        url: p.url,
        ...(p.qty ? { qty: go, ofQty: p.qty } : {}),
        ...(p.unit ? { unit: p.unit } : {}),
        itemName: it.name,
      });
    });
    if (!proofs.length) return;
    const round = (order.shipments?.length ?? 0) + 1;
    // 🏪 ใบมารับเอง: รอบนี้ไม่มีเลขพัสดุ (โมดัลส่ง pickupRoundRef มาแทน) — ติดธง pickup ให้ทุกจอรู้ว่าไม่ต้องเช็คสถานะ ปณ.
    const pickupRound = isPickupOrder(order);
    const sh: Shipment = { tracking: t, at: new Date().toISOString(), by: actor, proofs, ...(note.trim() ? { note: note.trim() } : {}), ...(pickupRound ? { pickup: true as const } : {}) };
    const qty = shipmentQty(sh);
    const next = withLog(
      { ...order, shipments: [...(order.shipments ?? []), sh] },
      actor,
      pickupRound ? "🏪 แพ็คเสร็จบางส่วน — รอลูกค้ามารับ" : "🚚 ส่งบางส่วน",
      `รอบที่ ${round} · ${t} · ${proofs.map((p) => `${p.itemName} รูปที่ ${p.proof + 1}${p.qty ? ` ${p.qty}${p.ofQty && p.ofQty > p.qty ? `/${p.ofQty}` : ""} ชิ้น` : ""}`).join(", ")}${qty ? ` · รวม ${qty} ชิ้น` : ""}${sh.note ? ` · ${sh.note}` : ""}`
    );
    setShipSel(new Map());
    setPartialOpen(false);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** 🚚 แอดมินถอดรอบแบ่งส่งที่ยิงผิด (ฝ่ายแพ็คทำไม่ได้ — เซิร์ฟเวอร์รับแค่ต่อท้าย) */
  async function removeShipment(n: number) {
    if (!order || !mayEdit) return;
    const sh = order.shipments?.[n];
    if (!sh) return;
    if (
      !(await askConfirm({
        icon: "🚚",
        title: `ลบรอบแบ่งส่งที่ ${n + 1}?`,
        detail: `เลขพัสดุ ${sh.tracking} จะถูกถอดออกจากใบนี้ — ลูกค้าได้รับแจ้งเลขนี้ทางไลน์ไปแล้ว ต้องแจ้งลูกค้าเองว่ายกเลิก`,
        confirmLabel: "ลบรอบนี้",
        danger: true,
      }))
    )
      return;
    applyOrder(withLog({ ...order, shipments: order.shipments!.filter((_, i) => i !== n) }, actor, "ลบรอบแบ่งส่ง", `รอบที่ ${n + 1} · ${sh.tracking}`));
  }

  /**
   * 🚚 รูปที่จะไปกับรอบแบ่งส่งรอบถัดไป — มีแผนจากแอดมิน = ล็อกตามแผน (ฝ่ายแพ็คไม่ต้องรู้เอง)
   * ไม่มีแผน = แอดมิน (orders.edit) เลือกเองในโหมดแพ็คได้ · ฝ่ายแพ็คไม่มีปุ่มให้เลือก
   */
  const planNext = order ? nextPlannedRound(order) : null;
  const adHocSplit = !!order && mayEdit && !(order.shipPlan?.length ?? 0);
  const activeShipSel: Map<string, number> = planNext ? planNext.qty : adHocSplit ? shipSel : new Map();

  /**
   * 📋 แอดมินเพิ่ม/แก้รอบในแผนแบ่งส่ง (จากโมดัลเลือกรูป) + log · ฝ่ายแพ็คเห็นรูปพวกนี้ติดป้าย "ส่งก่อน" ทันที
   * editIndex = แก้รอบเดิม (เฉพาะรอบที่ยังไม่ส่ง — ส่งแล้วแก้ไม่ได้ · เจ้าของร้านสั่ง 16 ก.ย. 69) · แก้แล้วคำอนุมัติส่งตัวอย่างหลุด ต้องอนุมัติใหม่
   */
  function savePlanRound(sel: Map<string, number>, note: string, dueDate: string, editIndex: number | null = null) {
    if (!order || !mayEdit || !sel.size) return;
    if (editIndex !== null && (!order.shipPlan?.[editIndex] || order.shipments?.[editIndex])) return;
    const states = proofShipStates(order);
    const proofs: ShipPlanRound["proofs"] = [];
    sel.forEach((qty, k) => {
      const [i, j] = k.split(":").map(Number);
      const it = order.items[i];
      const p = it ? proofsOf(it)[j] : undefined;
      if (!it || !p) return;
      const go = Math.max(0, Math.min(Math.floor(qty) || 0, states.get(k)?.remaining ?? 0));
      if (!go) return;
      proofs.push({
        item: i,
        proof: j,
        url: p.url,
        ...(p.qty ? { qty: go, ofQty: p.qty } : {}),
        ...(p.unit ? { unit: p.unit } : {}),
        itemName: it.name,
      });
    });
    if (!proofs.length) return;
    const prev = editIndex !== null ? order.shipPlan![editIndex] : undefined;
    const round: ShipPlanRound = {
      proofs,
      by: actor,
      at: new Date().toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(dueDate ? { dueDate } : {}),
      // โฟลเดอร์ต้นทางของรอบตัวอย่างคงไว้ (หลักฐานว่ามาจากโฟลเดอร์ (…ตย)) · คำอนุมัติของเจ้าของร้านไม่ติดมา — ของเปลี่ยนต้องอนุมัติใหม่
      ...(prev?.sampleFolder ? { sampleFolder: prev.sampleFolder } : {}),
    };
    const n = (editIndex ?? order.shipPlan?.length ?? 0) + 1;
    const qty = proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
    const shipPlan = editIndex !== null ? order.shipPlan!.map((x, i) => (i === editIndex ? round : x)) : [...(order.shipPlan ?? []), round];
    setPlanOpen(false);
    setPlanEditIdx(null);
    applyOrder(
      withLog(
        { ...order, shipPlan },
        actor,
        editIndex !== null ? "✏️ แก้ไขแผนแบ่งส่ง" : "📋 ระบุแผนแบ่งส่ง",
        `รอบที่ ${n}: ${proofs.map((p) => `${p.itemName} รูปที่ ${p.proof + 1}${p.qty ? ` ${p.qty}${p.ofQty && p.ofQty > p.qty ? `/${p.ofQty}` : ""} ชิ้น` : ""}`).join(", ")}${qty ? ` · รวม ${qty} ชิ้น` : ""}${dueDate ? ` · ส่งภายใน ${dueDate}` : ""}${round.note ? ` · ${round.note}` : ""}${prev?.sampleApproved ? " · ⚠️ คำอนุมัติส่งตัวอย่างเดิมหลุด ต้องให้เจ้าของร้านอนุมัติใหม่" : ""}`
      )
    );
  }

  /** 📋 แอดมินถอดรอบออกจากแผน (เฉพาะรอบที่ยังไม่ได้ส่ง) */
  function removePlanRound(n: number) {
    if (!order || !mayEdit) return;
    const r = order.shipPlan?.[n];
    if (!r || order.shipments?.[n]) return;
    applyOrder(withLog({ ...order, shipPlan: order.shipPlan!.filter((_, i) => i !== n) }, actor, "ลบรอบในแผนแบ่งส่ง", `รอบที่ ${n + 1}`));
  }

  /** เปิดดูรูปแบบงานเต็มจอ (รู้ตำแหน่ง item/proof เพื่อเลื่อนรูปในรายการเดียวกันได้) */
  function showProof(itemIndex: number, proofIndex: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    const p = proofsOf(it)[proofIndex];
    if (!p) return;
    setLightbox({
      src: p.url,
      alt: `แบบงาน ${it.name} รูปที่ ${proofIndex + 1}`,
      caption: [
        it.name,
        p.qty ? `${p.qty} ${proofUnit(p)}` : "",
        p.note ?? "",
        p.review === "อนุมัติ" ? "✔ ลูกค้าอนุมัติรูปนี้" : "",
        p.review === "ขอแก้ไข" ? `✏️ ลูกค้าขอแก้รูปนี้${p.reviewNote ? ` — “${p.reviewNote}”` : ""}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      at: { item: itemIndex, proof: proofIndex },
    });
  }

  /** ปุ่มเลื่อนซ้าย/ขวาของไลต์บ็อกซ์ — เลื่อนได้ในรูปแบบงานของรายการเดียวกัน */
  function lightboxNav() {
    if (!lightbox?.at || !order) return {};
    const { item, proof } = lightbox.at;
    const total = proofsOf(order.items[item]).length;
    if (total <= 1) return {};
    return {
      counter: `${proof + 1} / ${total}`,
      onPrev: proof > 0 ? () => showProof(item, proof - 1) : undefined,
      onNext: proof < total - 1 ? () => showProof(item, proof + 1) : undefined,
    };
  }

  /** พนักงานแพ็คกดยืนยันผลตรวจนับของรูปแบบงาน 1 รูป */
  function setPackCheck(itemIndex: number, proofIndex: number, status: "ครบ" | "ไม่ครบ", got?: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const pack = { status, ...(status === "ไม่ครบ" ? { got: got ?? 0 } : {}), by: actor, at: new Date().toISOString() };
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, proofs: proofsOf(it).map((p, j) => (j === proofIndex ? { ...p, pack } : p)) } : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      status === "ครบ" ? "ตรวจนับ: ครบ" : "ตรวจนับ: ไม่ครบ",
      `${item?.name ?? ""} รูปที่ ${proofIndex + 1}${status === "ไม่ครบ" ? ` — นับได้ ${got ?? 0} ชิ้น` : ""}`
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** เปิดโหมดมัดจำ 50% — ลูกค้าโอนครึ่งแรกก่อนเริ่มงาน (แก้ยอดมัดจำไม่ได้ ระบบคิดครึ่งหนึ่งปัดขึ้น) */
  function enableDeposit() {
    if (!order) return;
    const amt = Math.ceil(orderTotal(order) / 2);
    applyOrder(withLog({ ...order, deposit: { amount: amt } }, actor, "เปิดโหมดมัดจำ 50%", `มัดจำ ${amt} บาท จากยอด ${orderTotal(order)} บาท`));
  }

  async function cancelDeposit() {
    if (!order?.deposit || order.deposit.firstPaidAt) return;
    if (!(await askConfirm({ icon: "➗", title: "ยกเลิกโหมดมัดจำ 50%?", detail: "ออเดอร์นี้จะกลับไปเก็บเงินเต็มจำนวน", confirmLabel: "ยกเลิกโหมดมัดจำ", danger: true }))) return;
    applyOrder(withLog({ ...order, deposit: undefined }, actor, "ยกเลิกโหมดมัดจำ 50%"));
  }

  /** แอดมินตรวจสลิปมัดจำเองแล้วกดยืนยัน (กรณี SlipOK ไม่ผ่าน/โอนช่องทางอื่น) */
  async function confirmDepositFirst() {
    if (!order?.deposit || order.deposit.firstPaidAt) return;
    // ทางนี้ก็ดันสถานะเป็น "ชำระแล้ว" เหมือนกัน — ไม่มีสลิปต้องเตือนให้เห็นก่อน
    const noSlip = !order.slipPath && !order.slipUrl;
    // ➗ ลูกค้าหัก ณ ที่จ่าย → เงินเข้าจริงงวดแรกน้อยกว่ายอดมัดจำ (ส่วนต่างตามใบ 50 ทวิ) บอกไว้ในกล่องยืนยันจะได้เทียบเงินเข้าถูก
    const inst = depositInstallments(order);
    const whtLine = inst && inst.wht > 0 ? `\nลูกค้าหัก ณ ที่จ่าย ${order.wht?.rate ?? ""}% → เงินเข้าจริง ${formatPrice(inst.firstNet)} (ส่วนต่าง ${formatPrice(inst.firstWht)} ตามใบ 50 ทวิ)` : "";
    if (
      !(await askConfirm({
        icon: "💰",
        title: `ยืนยันว่าได้รับมัดจำ ${formatPrice(order.deposit.amount)} แล้ว?`,
        detail:
          (noSlip
            ? '⚠️ ออเดอร์นี้ยังไม่มีสลิปแนบ — ถ้ามีสลิป ให้กดยกเลิกแล้วแนบที่ช่อง "🧾 หลักฐานการโอน" ก่อน\nยืนยันเลยก็ได้ ระบบจะบันทึกในประวัติว่าใครยืนยันทั้งที่ไม่มีสลิป'
            : "ระบบจะบันทึกว่าเก็บงวดแรกแล้ว เริ่มงานได้เลย") + whtLine,
        confirmLabel: "ยืนยันรับมัดจำ",
        danger: noSlip,
      }))
    )
      return;
    const now = new Date().toISOString();
    applyOrder(
      withLog(
        {
          ...order,
          deposit: { ...order.deposit, firstPaidAt: now },
          paidTotal: order.deposit.amount,
          status: (["รอชำระเงิน", "รอตรวจสอบ"] as OrderStatus[]).includes(order.status) ? ("ชำระแล้ว" as OrderStatus) : order.status,
        },
        actor,
        "ยืนยันรับมัดจำ 50%",
        `ยอด ${order.deposit.amount} บาท${inst && inst.wht > 0 ? ` (โอนจริง ${inst.firstNet} หลังหัก ณ ที่จ่าย)` : ""}${noSlip ? " · ไม่มีสลิปแนบ" : ""}`
      )
    );
  }

  /** แอดมินยืนยันว่าเก็บยอดคงเหลือครบแล้ว — ปลดล็อกพิมพ์เอกสาร/ยิงเลขพัสดุ */
  async function confirmDepositSettled() {
    if (!order?.deposit || !order.deposit.firstPaidAt || order.deposit.settledAt) return;
    const bal = Math.max(0, orderTotal(order) - (order.paidTotal ?? order.deposit.amount));
    // งวดหลังก็ต้องมีสลิปเป็นหลักฐานเหมือนงวดแรก — ไม่มีก็แนบตรงนี้ได้เลย
    const noSlip = !order.deposit.balanceSlipPath && !order.deposit.balanceSlipUrl;
    const ok = await askConfirm({
      icon: "💰",
      title: `ยืนยันว่าได้รับยอดคงเหลือ ${formatPrice(bal)} แล้ว?`,
      detail: noSlip
        ? "⚠️ ยังไม่มีสลิปงวดหลังในออเดอร์นี้ — ถ้าลูกค้าส่งสลิปมาทางแชท/ไลน์ ให้แนบตรงนี้ได้เลย\nครบ 100% แล้วจะปลดล็อกการพิมพ์ใบงาน/ใบเสร็จ และยิงเลขพัสดุได้"
        : "ครบ 100% แล้วจะปลดล็อกการพิมพ์ใบงาน/ใบเสร็จ และยิงเลขพัสดุได้",
      confirmLabel: noSlip ? "ไม่มีสลิป — ยืนยันเอง" : "ยืนยันรับครบแล้ว",
      altLabel: noSlip ? "📎 แนบสลิปงวดหลัง" : undefined,
      danger: noSlip,
    });
    if (ok === "alt") {
      pickAdminSlip("balance");
      return;
    }
    if (!ok) return;
    const now = new Date().toISOString();
    applyOrder(
      withLog(
        { ...order, deposit: { ...order.deposit, settledAt: now }, paidTotal: orderTotal(order) },
        actor,
        "รับยอดคงเหลือครบแล้ว",
        `ยอด ${bal} บาท — จ่ายครบ 100%${noSlip ? " · ไม่มีสลิปงวดหลังแนบ" : ""}`
      )
    );
  }

  /** แอดมินเช็คสต๊อก/คิวผลิตแล้วกดยืนยัน → เคลียร์ธง + ระบบแจ้งลูกค้าทางไลน์ให้อัตโนมัติ */
  async function confirmStock(itemIndex: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it?.needStockCheck) return;
    const ship = order.shipDate?.from ? ` (วันส่งที่ตั้งไว้: ${order.shipDate.from})` : "";
    if (!(await askConfirm({ icon: "📦", title: "ยืนยันว่าเช็คสต๊อก/คิวผลิตแล้ว?", detail: `${it.name} × ${itemQtyText(it, productOfItem(it.productId))}${ship} — ระบบจะแจ้งลูกค้าว่ารับผลิตได้`, confirmLabel: "ยืนยัน — แจ้งลูกค้า" }))) return;
    const items = order.items.map((x, i) => (i === itemIndex ? { ...x, needStockCheck: undefined } : x));
    applyOrder(
      withLog({ ...order, items }, actor, "ยืนยันสต๊อก/คิวผลิต", `${it.name} × ${it.qty} — แจ้งลูกค้าแล้ว`)
    );
  }

  /** ฝ่ายแพ็คถ่าย/แนบภาพของในกล่องก่อนปิด — บังคับอย่างน้อย 1 รูปก่อนยิงเลขพัสดุ */
  async function addPackPhotos(files: FileList | null) {
    if (!order || !files?.length) return;
    setErr("");
    if (demo) {
      // โหมดเดโม: เก็บเป็น URL ชั่วคราวในหน้า (ไม่ persist) ให้ทดลอง flow ได้
      const now = new Date().toISOString();
      const added = Array.from(files).map((f) => ({ url: URL.createObjectURL(f), by: actor, at: now }));
      setOrder({ ...order, packPhotos: [...(order.packPhotos ?? []), ...added] });
      return;
    }
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("orderId", order.id);
      // 🗜️ รูปจากกล้องมือถือ 3-5 MB → ย่อก่อนส่ง (ลูกค้าแค่เปิดดูว่าของในกล่องครบ)
      fd.append("file", await shrinkImageFile(f));
      const res = await fetch("/api/admin/orders/pack-photo", { method: "POST", body: fd, headers: packScanHeaders() });
      const j = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
      if (!res.ok || !j?.order) {
        setErr(j?.error ?? "อัปโหลดภาพไม่สำเร็จ");
        return;
      }
      adoptOrder(j.order);
    }
  }

  /** ลบภาพก่อนปิดกล่อง (ถ่ายผิด/ซ้ำ) */
  async function deletePackPhoto(index: number) {
    if (!order) return;
    if (!(await askConfirm({ icon: "📸", title: "ลบภาพก่อนปิดกล่องรูปนี้?", confirmLabel: "ลบรูป", danger: true }))) return;
    if (demo) {
      const photos = (order.packPhotos ?? []).filter((_, i) => i !== index);
      setOrder({ ...order, packPhotos: photos.length ? photos : undefined });
      return;
    }
    const res = await fetch("/api/admin/orders/pack-photo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...packScanHeaders() },
      body: JSON.stringify({ orderId: order.id, index }),
    });
    const j = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
    if (!res.ok || !j?.order) {
      setErr(j?.error ?? "ลบภาพไม่สำเร็จ");
      return;
    }
    adoptOrder(j.order);
  }

  /** พนักงานแพ็คกดยืนยันว่าอ่านรายละเอียดของรายการแล้ว (กดซ้ำ = ยกเลิก) */
  function toggleNoteAck(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const acked = !!item?.noteAck;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, noteAck: acked ? undefined : { by: actor, at: new Date().toISOString() } } : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      acked ? "ยกเลิกยืนยันอ่านรายละเอียด" : "ยืนยันอ่านรายละเอียดแล้ว",
      item?.name
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * 📦 ฝ่ายแพ็คปักว่าของรายการนี้ "ยังไม่มา / มาไม่ครบ / มาครบ"
   * ปักยังไม่มา → ออเดอร์ย้ายไปขั้น "รอของ" ที่สถานีแพ็ค–ส่ง + ห้ามยิงเลขพัสดุ · กดมาครบ = ปลดล็อก (เก็บเป็นประวัติ ไม่ลบ)
   * since = วันที่ปักครั้งแรกในรอบนี้ (แก้หมายเหตุ/วันคาดไม่รีเซ็ต · มาครบแล้วปักใหม่ = เริ่มนับใหม่)
   */
  function setArrival(itemIndex: number, patch: ArrivalPatch) {
    if (!order) return;
    const next = applyArrival(order, itemIndex, patch, actor);
    if (next === order) return;
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** กราฟฟิกยืนยันว่าอ่านรายละเอียดรายการแล้ว (ก่อนทำแบบงาน) · กดซ้ำ = ยกเลิก */
  function toggleGraphicAck(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const acked = !!item?.graphicAck;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, graphicAck: acked ? undefined : { by: actor, at: new Date().toISOString() } } : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      acked ? "กราฟฟิกยกเลิกยืนยันอ่านรายละเอียด" : "กราฟฟิกยืนยันอ่านรายละเอียดแล้ว",
      item?.name
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * ติ๊กว่ารายการนี้ "ไม่ต้องทำแบบ" — ยอดโอนเพิ่มภายหลัง/ค่าบริการ (ค่าตัดไฟล์, เพิ่มขนาด, คละลายเพิ่ม, ซื้อตะขอ ฯลฯ)
   * รายการจะไม่ค้างเป็น "รอกราฟฟิกทำแบบ" และไม่ติดป้ายยังไม่มีแบบในใบงาน · แนบภาพได้ถ้าอยาก · กดซ้ำ = ยกเลิก
   */
  function toggleNoProof(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const on = !!item?.noProof;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, noProof: on ? undefined : { by: actor, at: new Date().toISOString() } } : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      on ? "ยกเลิก: ไม่ต้องทำแบบ (กลับมารอกราฟฟิกทำแบบ)" : "ติ๊กว่ารายการนี้ไม่ต้องทำแบบ (ยอดเพิ่ม/ค่าบริการ)",
      item?.name
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * ♻️ ติ๊กว่ารายการนี้ "ใช้ไฟล์เก่า" (ลายจากออเดอร์ก่อน) — แอดมิน/กราฟฟิกติ๊กเองเมื่อลูกค้าบอกทางไลน์/ใบ FlowAccount
   * กดซ้ำ = ยกเลิก · เลขออเดอร์เดิมกรอกในช่องข้าง ๆ (setReuseArtRef) · เป็นแค่ป้าย ไม่ข้ามขั้นตรวจแบบ
   */
  function toggleReuseArt(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const on = !!item?.reuseArt;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, reuseArt: on ? undefined : { by: actor, at: new Date().toISOString() } } : it
    );
    const next = withLog({ ...order, items }, actor, on ? "ยกเลิกป้าย: ใช้ไฟล์เก่า" : "ติ๊กว่ารายการนี้ใช้ไฟล์เก่า (ลายจากออเดอร์ก่อน)", item?.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** เลขออเดอร์เดิม/ข้อความประกอบของป้าย ♻️ — บันทึกตอนออกจากช่อง (blur/Enter) · เลข OD-… ดึงออกให้เอง ที่เหลือเป็นหมายเหตุ */
  function setReuseArtRef(itemIndex: number, text: string) {
    if (!order) return;
    const item = order.items[itemIndex];
    if (!item?.reuseArt) return;
    const fromOrderId = orderIdIn(text);
    const note = (fromOrderId ? text.replace(/OD-\d{6}-\d{4}/i, "") : text).replace(/^[\s·,\-–—]+|[\s·,\-–—]+$/g, "").trim().slice(0, 200);
    if ((item.reuseArt.fromOrderId ?? "") === (fromOrderId ?? "") && (item.reuseArt.note ?? "") === note) return;
    const items = order.items.map((it, i) =>
      i === itemIndex
        ? { ...it, reuseArt: { by: it.reuseArt!.by, at: it.reuseArt!.at, ...(fromOrderId ? { fromOrderId } : {}), ...(note ? { note } : {}) } }
        : it
    );
    const next = withLog({ ...order, items }, actor, `ใช้ไฟล์เก่า: ${fromOrderId ?? "-"}${note ? ` · ${note}` : ""}`, item.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * ♻️ ดึงลาย/แบบจากออเดอร์เดิมมาใส่รายการนี้ในคลิกเดียว — เอาลายที่ลูกค้าแนบไว้ (artworkUrls) ของทุกรายการในใบเดิม
   * ใบเดิมไม่มีลายแต่มีแบบงาน (กราฟฟิกทำ) → เอารูปแบบงานมาแทน (ลงช่อง "ลายจากลูกค้า" ให้กดใช้เป็นแบบต่อได้)
   * ไม่ทับของเดิม — ต่อท้ายเฉพาะ url ที่ยังไม่มี
   */
  async function pullArtworkFromOld(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const fromId = item?.reuseArt?.fromOrderId;
    if (!fromId) return;
    setArtUpIdx(itemIndex);
    try {
      const src = (await fetchOrderAdmin(fromId)).order;
      if (!src) throw new Error(`ไม่พบออเดอร์ ${fromId}`);
      const have = new Set(item.artworkUrls ?? []);
      let urls = src.items.flatMap((it) => it.artworkUrls ?? []).filter((u) => !have.has(u));
      if (!urls.length) urls = src.items.flatMap((it) => proofsOf(it).map((p) => p.url)).filter((u) => !have.has(u));
      urls = [...new Set(urls)].slice(0, 12);
      if (!urls.length) throw new Error(`ออเดอร์ ${fromId} ไม่มีลาย/แบบงานให้ดึง (หรือมีครบแล้ว)`);
      setOrder((cur) => {
        if (!cur) return cur;
        const items = cur.items.map((it, i) => (i === itemIndex ? { ...it, artworkUrls: [...(it.artworkUrls ?? []), ...urls] } : it));
        const next = withLog({ ...cur, items }, actor, `ดึงลายจากออเดอร์เดิม ${fromId}`, `${cur.items[itemIndex]?.name} +${urls.length} รูป`);
        if (!demo) void saveOrWarn(next);
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ดึงลายจากออเดอร์เดิมไม่สำเร็จ");
    } finally {
      setArtUpIdx(null);
    }
  }

  /** กราฟฟิก/แอดมินติ๊กว่างานนี้มีชิ้นงานตัวอย่างที่ต้องส่งให้ลูกค้า · กดซ้ำ = ยกเลิก */
  function toggleSampleRequired(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const on = !!item?.sampleRequired;
    const items = order.items.map((it, i) =>
      i === itemIndex
        ? { ...it, sampleRequired: on ? undefined : { by: actor, at: new Date().toISOString() }, ...(on ? { samplePacked: undefined } : {}) }
        : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      on ? "ยกเลิก: มีงานตัวอย่าง" : "ติ๊กว่ามีงานตัวอย่างต้องส่งให้ลูกค้า",
      item?.name
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** พนักงานแพ็คยืนยันว่าใส่ชิ้นงานตัวอย่างลงกล่องแล้ว · กดซ้ำ = ยกเลิก */
  function toggleSamplePacked(itemIndex: number) {
    if (!order) return;
    const item = order.items[itemIndex];
    const acked = !!item?.samplePacked;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, samplePacked: acked ? undefined : { by: actor, at: new Date().toISOString() } } : it
    );
    const next = withLog(
      { ...order, items },
      actor,
      acked ? "ยกเลิกยืนยันใส่งานตัวอย่าง" : "ยืนยันใส่งานตัวอย่างลงกล่องแล้ว",
      item?.name
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * 🛒 รอของเข้า / ต้องสั่งของ (Order.needsPurchase) — แอดมินติ๊ก/แก้โน้ต/ยกเลิก · แอดมินหรือฝ่ายแพ็คกด "ของเข้าแล้ว"
   * ลูกค้าโอนแล้วขณะยังรอของ → เซิร์ฟเวอร์แจ้งกลุ่มไลน์ร้านเองที่ประตูเขียนออเดอร์ (needs-purchase.ts) หน้าจอไม่ต้องยิง
   */
  function saveNeedsPurchase(np: Order["needsPurchase"], action: string, detail?: string) {
    if (!order) return;
    const next = withLog({ ...order, needsPurchase: np }, actor, action, detail);
    setOrder(next);
    // ป้ายข้างเมนู "รอของเข้า" (AdminShell) นับใหม่ทันทีหลังบันทึก
    if (!demo) void saveOrWarn(next).then(() => window.dispatchEvent(new Event("iducky:stock-wait-changed")));
  }

  /** 🧾 พนักงานแพ็คยืนยันว่าใส่ใบกำกับภาษีลงกล่องแล้ว · กดซ้ำ = ยกเลิก (บิล FlowAccount/บิล VAT มักลืมพิมพ์ใบกำกับ) */
  function toggleTaxInvoicePacked() {
    if (!order) return;
    const acked = !!order.taxInvoicePacked;
    const doc = taxInvoiceDocOf(order);
    const next = withLog(
      { ...order, taxInvoicePacked: acked ? undefined : { by: actor, at: new Date().toISOString() } },
      actor,
      acked ? "ยกเลิกยืนยันใส่ใบกำกับภาษี" : "ยืนยันใส่ใบกำกับภาษีลงกล่องแล้ว",
      doc.docNo ? `${doc.label} ${doc.docNo}` : undefined
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** 🧾 ใบกำกับส่งทางไหน — "email" = ส่งไฟล์ให้ลูกค้าแล้ว ไม่ต้องแนบกล่อง (ปลดด่านยิงเลข) · "box" = ต้องใส่กล่อง */
  function setTaxInvoiceDelivery(v: "box" | "email") {
    if (!order || (order.taxInvoiceDelivery ?? "box") === v) return;
    const next = withLog(
      { ...order, taxInvoiceDelivery: v },
      actor,
      v === "email" ? "ใบกำกับภาษี: ส่ง E-tax/อีเมลแล้ว ไม่ต้องแนบกล่อง" : "ใบกำกับภาษี: ต้องใส่ลงกล่อง"
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** ส่งลายที่แนบไว้ "ทุกรูป" ของรายการนี้ให้ลูกค้าตรวจทีเดียว */
  function sendAllArtAsProofs(itemIndex: number) {
    if (!order) return;
    if (!paidOk && !overrideLock) {
      setErr(`ออเดอร์นี้ยังไม่ได้ยืนยันการชำระเงิน (สถานะ “${order.status}”) — กด “ทำแบบก่อนได้” ด้านบนถ้าจงใจ`);
      return;
    }
    const now = new Date().toISOString();
    let added = 0;
    const items = order.items.map((it, i) => {
      if (i !== itemIndex) return it;
      const have = new Set(proofsOf(it).map((p) => p.url));
      const fresh = (it.artworkUrls ?? []).filter((u) => !have.has(u));
      added = fresh.length;
      if (!fresh.length) return it;
      return {
        ...it,
        // 🔢 ลูกค้าระบุจำนวนต่อลายมาแล้ว → เติมลงแบบให้เลย ฝ่ายแพ็ค/ใบแปะกล่องจะได้เลขถูกโดยไม่ต้องพิมพ์ซ้ำ
        // 🔄 รูปด้านหลังของงาน 2 ด้านไม่เติมจำนวน — ทุกชิ้นมีทั้งหน้าและหลัง ถ้าเติมทั้งสองด้าน proofQtyCheck จะนับซ้ำเป็น 2 เท่า
        proofs: [
          ...proofsOf(it),
          ...fresh.map((url) => {
            const isBack = (it.artworkBackUrls ?? []).includes(url);
            const q = isBack ? undefined : artQtyOf(it, url, (it.artworkUrls ?? []).indexOf(url));
            return { url, at: now, by: actor, ...(q ? { qty: q } : {}) };
          }),
        ],
        proofStatus: "รอตรวจ" as ProofStatus,
        proofUpdatedAt: now,
      };
    });
    if (!added) return;
    const next = withLog({ ...order, items }, actor, "ส่งแบบให้ลูกค้าตรวจ", `${order.items[itemIndex]?.name} — ใช้ลายที่แนบ ${added} รูป`);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * ปิดคำขอแก้ไขที่ลูกค้าส่งมา (กด "จัดการแล้ว") — ไม่ได้แก้ออเดอร์ให้อัตโนมัติ
   * แค่บอกว่าคนดูแลรับเรื่องและจัดการเรียบร้อยแล้ว แบนเนอร์เตือนจะหายไป
   */
  function resolveEditRequest() {
    if (!order?.editRequest || order.editRequest.doneAt) return;
    const next = withLog(
      { ...order, editRequest: { ...order.editRequest, doneAt: new Date().toISOString(), doneBy: actor } },
      actor,
      "ปิดคำขอแก้ไขของลูกค้า",
      order.editRequest.text
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next).then(() => window.dispatchEvent(new Event("iducky:edit-requests-changed")));
  }

  /**
   * 🔢 รายการนี้แก้จำนวนได้ไหม — กติกาเดียวกับแก้ราคา: ลูกค้าโอนเข้ามาแล้วห้ามขยับยอด (กันบิลไม่ตรงสลิป)
   * งานเคลม (ฟรี) และรายการที่ยังไม่ตีราคา (฿0) แก้ได้เสมอ เพราะไม่กระทบยอดที่โอนมาแล้ว
   */
  function mayChangeQty(it: OrderItem): boolean {
    if (!mayEdit || !order) return false;
    if (order.claimOf || it.unitPrice <= 0) return true;
    const moneyIn = (order.paidTotal ?? 0) > 0 || !!order.slipUrl || !!order.slipPath || !!order.deposit?.firstPaidAt;
    return !moneyIn;
  }
  const productOfItem = (id: string) => shopProducts.get(id);

  /**
   * 🔢 แก้จำนวนของรายการ — คิดราคา/สลับเรท/หดโควตาลายให้เหมือนตะกร้า (ดู lib/order-item-qty) แล้วลงประวัติ
   * ทำอะไรให้บ้างบอกไว้ในประวัติหมด (ราคา/หน่วยเปลี่ยน · เรทเปลี่ยน · ลายถูกหด) แอดมินจะได้ไม่งงว่ายอดขยับเพราะอะไร
   */
  function changeItemQty(itemIndex: number, nextQty: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it || !mayChangeQty(it)) return;
    const r = orderItemQtyChange(order.items, itemIndex, nextQty, productOfItem);
    if (!r) return;
    const items = order.items.map((x, i) => (i === itemIndex ? { ...x, ...r.patch } : x));
    const newQty = r.patch.qty ?? it.qty;
    const unit = r.unitPrice ?? it.unitPrice;
    const notes = [
      `${it.qty.toLocaleString("th-TH")} → ${newQty.toLocaleString("th-TH")}`,
      r.unitPrice !== undefined ? `ราคา/หน่วย ${formatPrice(it.unitPrice)} → ${formatPrice(r.unitPrice)}` : "",
      r.rateChanged ? `เรท ${r.rateChanged.from} → ${r.rateChanged.to}` : "",
      r.designCapped ? `โควตาลายเหลือ ${r.designCapped} ลาย` : "",
      unit > 0 ? `= ${formatPrice(unit * newQty)}` : "",
    ].filter(Boolean);
    applyOrder(withLog({ ...order, items }, actor, "แก้จำนวน", `${it.name}: ${notes.join(" · ")}`));
  }

  /**
   * ✏️ แก้ไขรายการที่หยิบจากหน้าร้าน = ไปหน้าสินค้าเสมอ (เจ้าของร้านสั่ง 10 ก.ย. 69 — ข้อความรายละเอียดมีปุ่ม "แก้รายละเอียด" อยู่แล้ว
   * และรายการที่กรอกชื่อ/ราคาเองไม่มีปุ่มนี้) · เปิดหน้าสินค้าโหมดแก้ไข (?edit=) แบบเดียวกับปุ่ม ✏️ ในตะกร้า:
   * ใส่บรรทัดนี้ลงตะกร้าในเครื่องแอดมินก่อน (สเปค/จำนวน/ลายเดิมครบ) ให้หน้าสินค้าติ๊กคืนให้ + ตั้ง "โหมดสั่งเพิ่มในออเดอร์นี้"
   * + ตัวบอกว่าให้แทนที่รายการไหน → พอของใหม่เข้าออเดอร์ หน้านี้ถอดรายการเดิมให้เอง
   */
  function editItemOptionsInShop(itemIndex: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it || !mayChangeQty(it)) return;
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
      localStorage.setItem(
        "iducky-append-order-v1",
        JSON.stringify({ id: order.id, key: order.key ?? "", customer: order.customer, needShipping: shippingUnset(order) })
      );
      localStorage.removeItem("iducky-append-picks-v1");
      writeReplaceMarker({
        kind: "order",
        orderId: order.id,
        index: itemIndex,
        productId: it.productId,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        itemCount: order.items.length,
        at: Date.now(),
      });
    } catch {
      setErr("⚠️ เปิดโหมดแก้ไขไม่ได้ — เบราว์เซอร์ปิดการเก็บข้อมูลในเครื่อง");
      return;
    }
    window.open(`${productPath(p)}?edit=${encodeURIComponent(cartItemKey(it.productId, cartSelectionsOf(it)))}`, "_blank", "noopener");
  }

  /** ลบรายการออกจากออเดอร์ — ลง log ทุกครั้ง (ใคร ลบอะไร ยอดหายไปเท่าไร) */
  function removeItemFromOrder(itemIndex: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it) return;
    const lost = it.qty * it.unitPrice - itemDiscountAmount(it);
    const items = order.items.filter((_, i) => i !== itemIndex);
    const next = withLog(
      { ...order, items },
      actor,
      "ลบรายการออกจากออเดอร์",
      `${it.name} ×${it.qty} @${formatPrice(it.unitPrice)}${lost > 0 ? ` · ยอดลดลง ${formatPrice(lost)}` : ""}` +
        `${proofsOf(it).length ? ` · มีแบบงาน ${proofsOf(it).length} รูป` : ""}` +
        `${(it.artworkUrls?.length ?? 0) ? ` · ลายลูกค้า ${it.artworkUrls!.length} รูป` : ""}`
    );
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** ใช้ลายที่แนบไว้เป็นแบบให้ลูกค้ากดอนุมัติ/ขอแก้ไข (บางงานร้านใช้ลายลูกค้าเป็นแบบเลย) */
  function useArtAsProof(itemIndex: number, url: string) {
    if (!order) return;
    if (!paidOk && !overrideLock) {
      setErr(`ออเดอร์นี้ยังไม่ได้ยืนยันการชำระเงิน (สถานะ “${order.status}”) — กด “ทำแบบก่อนได้” ด้านบนถ้าจงใจ`);
      return;
    }
    const now = new Date().toISOString();
    const items = order.items.map((it, i) => {
      if (i !== itemIndex) return it;
      if (proofsOf(it).some((p) => p.url === url)) return it; // ส่งไปแล้ว
      return {
        ...it,
        proofs: [...proofsOf(it), { url, at: now, by: actor }],
        proofStatus: "รอตรวจ" as ProofStatus,
        proofUpdatedAt: now,
      };
    });
    const next = withLog({ ...order, items }, actor, "ส่งแบบให้ลูกค้าตรวจ", `${order.items[itemIndex]?.name} — ใช้ลายที่แนบไว้`);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** ลบภาพลายของลูกค้าออกจากรายการ (ไฟล์ยังอยู่ในคลัง แต่ไม่ผูกกับออเดอร์แล้ว) */
  function removeArtwork(itemIndex: number, url: string) {
    if (!order) return;
    const items = order.items.map((it, i) =>
      i === itemIndex
        ? {
            ...it,
            artworkUrls: (it.artworkUrls ?? []).filter((u) => u !== url),
            ...(it.artworkQty ? { artworkQty: Object.fromEntries(Object.entries(it.artworkQty).filter(([k]) => k !== url)) } : {}),
            ...(it.artworkSize ? { artworkSize: Object.fromEntries(Object.entries(it.artworkSize).filter(([k]) => k !== url)) } : {}),
            ...(it.artworkBackUrls ? { artworkBackUrls: it.artworkBackUrls.filter((u) => u !== url) } : {}),
          }
        : it
    );
    const next = withLog({ ...order, items }, actor, "ลบภาพลาย", order.items[itemIndex]?.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** แนบภาพลายเพิ่มให้รายการนี้ (ลากวาง/เลือกไฟล์ที่คอลัมน์รูป) */
  const [artUpIdx, setArtUpIdx] = useState<number | null>(null);
  /** กำลังสร้างไฟล์ .ai พร้อมพิมพ์ของรายการไหนอยู่ (คีย์ = ออเดอร์-ลำดับรายการ) */
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  /** ลบรูปลายออกจากออเดอร์ได้เฉพาะเจ้าของระบบ — พนักงานคนอื่นเห็นแต่โหลดไฟล์ */
  const isOwner = useIsAdministrator();
  /**
   * ลูกค้าจัดวางลายบนเทมเพลตเองแล้ว = "แบบ" เสร็จตั้งแต่หน้าเว็บ
   * ออเดอร์ที่สั่งก่อนมีระบบนี้ (หรือถูกลบแบบทิ้ง) จะยังไม่มีแบบในฝั่งขวา
   * → เติมให้อัตโนมัติครั้งเดียวตอนเปิดหน้า พร้อมตั้งเป็นอนุมัติแล้ว
   *   (ไม่ต้องให้กราฟฟิกทำแบบใหม่ · ลูกค้าไม่ต้องกดอนุมัติซ้ำ — เขาเห็นภาพจริงตอนสั่งแล้ว)
   * ทำเฉพาะคนที่มีสิทธิ์แก้ และเฉพาะรายการที่ยังไม่มีแบบเลย
   */
  const autoProofDone = useRef(false);
  useEffect(() => {
    if (!order || !mayEdit || demo || autoProofDone.current) return;
    const at = new Date().toISOString();
    let changed = false;
    const items = order.items.map((it) => {
      if (proofsOf(it).length) return it;
      const specs = (it.sel?.[PLACEMENT_SPEC_LABEL] ?? "").split(" | ").filter(Boolean);
      if (!specs.length) return it;
      const arts = it.artworkUrls ?? [];
      const sourceSet = new Set(specs.map((sp) => sp.match(/ต้นฉบับ:\s*(\S+)/)?.[1]).filter(Boolean) as string[]);
      const ready =
        arts.length === specs.length
          ? arts
          : arts.filter((u) => !sourceSet.has(u) && /\.jpe?g(\?|$)/i.test(u));
      if (ready.length !== specs.length) return it; // จับคู่ไม่ลงตัว ปล่อยให้ทีมงานจัดการเอง
      changed = true;
      return {
        ...it,
        proofs: ready.map((url, k) => {
          const qty = Number(specs[k]?.match(/×\s*(\d+)\s*ชิ้น/)?.[1]);
          return {
            url,
            at,
            review: "อนุมัติ" as const,
            note: `ลายที่ ${k + 1} — ลูกค้าจัดวางเองบนเทมเพลต (อนุมัติอัตโนมัติ)`,
            ...(Number.isFinite(qty) && qty > 0 ? { qty } : {}),
          };
        }),
        proofStatus: "อนุมัติ" as const,
        proofUpdatedAt: at,
      };
    });
    if (!changed) return;
    autoProofDone.current = true;
    const next = withLog({ ...order, items }, actor, "ใช้แบบที่ลูกค้าออกแบบเอง (อนุมัติอัตโนมัติ)");
    setOrder(next);
    void saveOrWarn(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, mayEdit, demo]);
  /**
   * งานที่ลูกค้าจัดวางลายเองมาครบทุกรายการ = ไม่มีอะไรให้กราฟฟิกทำ
   * พอเงินเข้าแล้วจึงข้ามขั้น "ส่งแบบให้ลูกค้าตรวจ" ไป "อนุมัติแบบ" ให้เลย
   * (ทำซ้ำไม่ได้ผล — พอเป็นอนุมัติแบบแล้วเงื่อนไขจะไม่เข้าอีก)
   */
  const selfDesignedReady = order ? allSelfDesignedApproved(order) : false;
  useEffect(() => {
    if (!order || !mayEdit || demo || !selfDesignedReady) return;
    if (order.status !== "ชำระแล้ว" && order.status !== "รอตรวจแบบ") return;
    const next = withLog(
      { ...order, status: "อนุมัติแบบ" as OrderStatus },
      actor,
      "ข้ามขั้นทำแบบ — ลูกค้าออกแบบเองมาแล้ว",
      `${order.status} → อนุมัติแบบ`,
    );
    setOrder(next);
    void saveOrWarn(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status, selfDesignedReady, mayEdit, demo]);

  async function addArtwork(itemIndex: number, fileList: FileList | File[] | null) {
    if (!order || !fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setArtUpIdx(itemIndex);
    const urls: string[] = [];
    for (const f of files.slice(0, 8)) {
      try {
        // ยิงตรงเข้า Supabase — รูปจากมือถือใหญ่เกินเพดาน body ของ Netlify ประจำ
        urls.push(await uploadArtworkFile(f));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดภาพลายไม่สำเร็จ");
        break;
      }
    }
    setArtUpIdx(null);
    if (!urls.length) return;
    setOrder((cur) => {
      if (!cur) return cur;
      const items = cur.items.map((it, i) =>
        i === itemIndex ? { ...it, artworkUrls: [...(it.artworkUrls ?? []), ...urls] } : it
      );
      const next = withLog({ ...cur, items }, actor, "แนบภาพลาย", `${cur.items[itemIndex]?.name} +${urls.length} รูป`);
      if (!demo) void saveOrWarn(next);
      return next;
    });
  }

  /**
   * 🔢 แก้จำนวนต่อลายทีละรูป (ช่องใต้รูปในแผง "ลายจากลูกค้า") — เจ้าของร้านสั่ง 10 ก.ย. 69
   * ลูกค้าระบุมาไม่ตรง/ไม่ระบุ → กราฟฟิกกรอกเองได้ ไม่ต้องเปิดช่อง "แก้รายละเอียด" พิมพ์ "ลายที่ 3 × 5 ชิ้น"
   * withArtQtyMap เขียน artworkQty + sel + selections ให้ตรงกันทั้ง 3 ที่ (ใบงาน/แพ็ค/ใบแปะกล่องเห็นเลขเดียวกัน)
   * ฝั่งเซิร์ฟเวอร์ทางสิทธิ์กราฟฟิก (mergeProofFields) รับ artworkQty แล้วสร้างข้อความเองซ้ำอีกที
   */
  function setArtQty(itemIndex: number, url: string, qty: number | undefined) {
    if (!order) return;
    setOrder((cur) => {
      if (!cur) return cur;
      const it = cur.items[itemIndex];
      if (!it) return cur;
      const no = (it.artworkUrls ?? []).indexOf(url) + 1;
      const before = artQtyOf(it, url, no - 1);
      const map: Record<string, number> = { ...(it.artworkQty ?? {}) };
      // รายการที่ยังไม่มี artworkQty (ใบเก่าแกะจากข้อความ) — เก็บเลขของลายอื่นที่ยังอ่านได้ไว้ด้วย ไม่งั้นหายตอนสร้างข้อความใหม่
      for (const u of it.artworkUrls ?? []) {
        const q = artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u));
        if (q && !map[u]) map[u] = q;
      }
      if (qty && qty > 0) map[url] = qty;
      else delete map[url];
      const items = cur.items.map((x, i) => (i === itemIndex ? { ...x, ...withArtQtyMap(x, map) } : x));
      const unit = artQtyUnitOf(it);
      const next = withLog(
        { ...cur, items },
        actor,
        "แก้จำนวนต่อลาย",
        `${it.name} — ลายที่ ${no || "?"}: ${before ? `${before} ${unit}` : "ไม่ระบุ"} → ${qty ? `${qty} ${unit}` : "ไม่ระบุ"}`
      );
      if (!demo) void saveOrWarn(next);
      return next;
    });
  }

  /**
   * 🔁 เปลี่ยนรูปลายใบเดิมเป็นรูปอื่น "ในตำแหน่งเดิม" — เจ้าของร้านขอ 9 ก.ย. 69
   * (ลูกค้าส่งไฟล์แก้มาทางไลน์ เดิมต้องกด ✕ ลบแล้วแนบใหม่ รูปไปต่อท้าย ลำดับเปลี่ยน
   *  จำนวน/ขนาดต่อลายที่ผูกกับ url เดิมหาย)
   * · คงลำดับ: "ลายที่ N" เท่าเดิม → กรอบงานจาก PLACEMENT_SPEC และ selections "ลายที่ N กี่ชิ้น" ยังตรง
   * · ย้าย artworkQty / artworkSize จากคีย์ url เก่าไปคีย์ใหม่ · ป้ายหน้า/หลัง (artworkBackUrls) ตามไปด้วย
   * · แบบงานฝั่งขวาที่เคยคัดลอกจากรูปเก่าไม่แตะ (ลูกค้าเคยเห็นแล้ว) — รูปใหม่จะโผล่ในปุ่ม
   *   "ใช้ลายนี้เป็นแบบ" ให้กราฟฟิกกดส่งให้ตรวจอีกที
   */
  async function replaceArtwork(itemIndex: number, oldUrl: string, file: File | null | undefined) {
    if (!order || !file) return;
    if (!file.type.startsWith("image/")) {
      setErr("เปลี่ยนรูปได้เฉพาะไฟล์ภาพ (JPG / PNG / WebP)");
      return;
    }
    setArtUpIdx(itemIndex);
    let url: string;
    try {
      // ยิงตรงเข้า Supabase เหมือนแนบลาย — ไฟล์ใหญ่เกินเพดาน body ของ Netlify ประจำ
      url = await uploadArtworkFile(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดรูปใหม่ไม่สำเร็จ");
      setArtUpIdx(null);
      return;
    }
    setArtUpIdx(null);
    setOrder((cur) => {
      if (!cur) return cur;
      const swap = (u: string) => (u === oldUrl ? url : u);
      const rekey = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [swap(k), v]));
      const no = (cur.items[itemIndex]?.artworkUrls ?? []).indexOf(oldUrl) + 1;
      const items = cur.items.map((it, i) =>
        i === itemIndex
          ? {
              ...it,
              artworkUrls: (it.artworkUrls ?? []).map(swap),
              ...(it.artworkQty ? { artworkQty: rekey(it.artworkQty) } : {}),
              ...(it.artworkSize ? { artworkSize: rekey(it.artworkSize) } : {}),
              ...(it.artworkBackUrls ? { artworkBackUrls: it.artworkBackUrls.map(swap) } : {}),
            }
          : it
      );
      const next = withLog({ ...cur, items }, actor, "เปลี่ยนภาพลาย", `${cur.items[itemIndex]?.name} — ลายที่ ${no || "?"}`);
      if (!demo) void saveOrWarn(next);
      return next;
    });
  }

  /**
   * แนบลายให้ "ของแถม" แทนลูกค้า (ส่งมาทางแชท/ไลน์) — งานร้านเป็นงานคัสตอม ของแถมก็สั่งลายได้
   * เก็บลง OrderGift.artworkUrls ของโปรนั้น + ติดธง needArtwork ให้ใบงานขึ้นบรรทัดลายเสมอ
   */
  async function addGiftArtwork(promoId: string, fileList: FileList | File[] | null) {
    if (!order || !fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setGiftArtBusy(promoId);
    const urls: string[] = [];
    for (const f of files.slice(0, 8)) {
      try {
        // ยิงตรงเข้า Supabase — รูปจากมือถือใหญ่เกินเพดาน body ของ Netlify ประจำ
        urls.push(await uploadArtworkFile(f));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดภาพลายไม่สำเร็จ");
        break;
      }
    }
    setGiftArtBusy(null);
    if (!urls.length) return;
    setOrder((cur) => {
      if (!cur) return cur;
      const gifts = (cur.gifts ?? []).map((g) =>
        g.promoId === promoId ? { ...g, needArtwork: true, artworkUrls: [...(g.artworkUrls ?? []), ...urls] } : g
      );
      const name = (cur.gifts ?? []).find((g) => g.promoId === promoId)?.name ?? "ของแถม";
      const next = withLog({ ...cur, gifts }, actor, "แนบลายของแถม", `${name} +${urls.length} รูป`);
      if (!demo) void saveOrWarn(next);
      return next;
    });
  }

  function removeGiftArtwork(promoId: string, url: string) {
    if (!order) return;
    const gifts = (order.gifts ?? []).map((g) =>
      g.promoId === promoId ? { ...g, artworkUrls: (g.artworkUrls ?? []).filter((u) => u !== url) } : g
    );
    const next = withLog({ ...order, gifts }, actor, "ลบลายของแถม", order.gifts?.find((g) => g.promoId === promoId)?.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /**
   * อัป "แบบงานของแถม" ให้ลูกค้าตรวจ — วงจรเดียวกับแบบสินค้า (รอตรวจ → ลูกค้าอนุมัติ/ขอแก้)
   * เก็บใน OrderGift.proofs · อัปรูปยิงตรง Supabase เหมือนลาย
   */
  async function addGiftProof(promoId: string, fileList: FileList | File[] | null) {
    if (!order || !fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setGiftProofBusy(promoId);
    const at = new Date().toISOString();
    const urls: string[] = [];
    for (const f of files.slice(0, 8)) {
      try {
        urls.push(await uploadArtworkFile(f));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดแบบของแถมไม่สำเร็จ");
        break;
      }
    }
    setGiftProofBusy(null);
    if (!urls.length) return;
    setOrder((cur) => {
      if (!cur) return cur;
      const gifts = (cur.gifts ?? []).map((g) =>
        g.promoId === promoId
          ? {
              ...g,
              proofs: [...(g.proofs ?? []), ...urls.map((url) => ({ url, at, by: actor }))],
              proofStatus: "รอตรวจ" as const,
              proofNote: undefined,
              proofUpdatedAt: at,
            }
          : g
      );
      const name = (cur.gifts ?? []).find((g) => g.promoId === promoId)?.name ?? "ของแถม";
      const next = withLog({ ...cur, gifts }, actor, "อัปแบบของแถมให้ลูกค้าตรวจ", `🎁 ${name} +${urls.length} รูป`);
      if (!demo) void saveOrWarn(next);
      return next;
    });
  }

  function removeGiftProof(promoId: string, url: string) {
    if (!order) return;
    const gifts = (order.gifts ?? []).map((g) => {
      if (g.promoId !== promoId) return g;
      const proofs = (g.proofs ?? []).filter((p) => p.url !== url);
      // ไม่เหลือแบบแล้ว → เคลียร์สถานะตรวจ กลับเป็น "ยังไม่ส่งแบบ"
      return proofs.length ? { ...g, proofs } : { ...g, proofs: undefined, proofStatus: undefined, proofNote: undefined };
    });
    const next = withLog({ ...order, gifts }, actor, "ลบแบบของแถม", order.gifts?.find((g) => g.promoId === promoId)?.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  function removeProof(itemIndex: number, proofIndex: number) {
    if (!order) return;
    const items = order.items.map((it, i) => {
      if (i !== itemIndex) return it;
      const proofs = proofsOf(it).filter((_, j) => j !== proofIndex);
      // ไม่เหลือรูปแล้ว → กลับไปสถานะ "รอกราฟฟิกทำแบบ"
      return proofs.length ? { ...it, proofs } : { ...it, proofs, proofStatus: undefined, proofNote: undefined };
    });
    const next = withLog({ ...order, items }, actor, "ลบแบบงาน", order.items[itemIndex]?.name);
    setOrder(next);
    if (!demo) void saveOrWarn(next);
  }

  /** อัปโหลดแบบงานได้หลายรูปพร้อมกัน — ทีละรูปเรียงกัน (กันชนกันตอน server ต่อ proofs) */
  async function sendProofs(itemIndex: number, fileList: FileList | File[] | null) {
    if (!order) return;
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      if (fileList && Array.from(fileList).length > 0) setErr("รองรับเฉพาะไฟล์รูปภาพ (PNG / JPG)");
      return;
    }
    setErr("");
    // กันกราฟฟิกทำงานฟรี — ออเดอร์ที่ยังไม่จ่าย/ยังไม่ตรวจสลิป ต้องยืนยันก่อน
    if (!paidOk && !overrideLock) {
      setErr(`ออเดอร์นี้ยังไม่ได้ยืนยันการชำระเงิน (สถานะ “${order.status}”) — กด “ทำแบบก่อนได้” ด้านล่างถ้าจงใจ`);
      return;
    }
    if (demo) {
      setErr("ออเดอร์ตัวอย่าง — อัปโหลดแบบได้เฉพาะออเดอร์จริง");
      return;
    }
    setUploadingIdx(itemIndex);
    let added = 0;
    for (const file of files) {
      // ชื่อไฟล์บอกจำนวน/หน่วย/ชื่อลายไว้ (เช่น "ลายหน้า x3.png" · "เจตนา 5 เซ็ต.png") → เติมช่องจำนวนกับรายละเอียดให้เลย
      // silent: ไม่ให้เซิร์ฟเวอร์ยิงไลน์ต่อไฟล์ — รวมแจ้งครั้งเดียวหลังครบชุด (เดิมอัป 10 รูป ลูกค้าโดน 10 ข้อความ)
      const res = await uploadProof(order.id, itemIndex, file, { ...proofFromFileName(file.name), silent: true });
      if (!res.ok) {
        setErr(res.error ?? "อัปโหลดแบบไม่สำเร็จ");
        break;
      }
      added++;
      adoptOrder(res.order);
    }
    setUploadingIdx(null);
    // รูปที่ขึ้นแล้วจะโชว์แถบ "ยังไม่ได้แจ้งลูกค้า" ให้กด 📣 ทีเดียวเมื่อพร้อม (กรอกจำนวน/รายละเอียดก่อนได้)
    if (added > 0) setProofNotifyMsg(null);
  }

  /** เปลี่ยนรูปทับตำแหน่งเดิม (กราฟฟิกแก้ตามคำขอลูกค้า) — เลขรูปไม่เลื่อน ผลตรวจรูปนั้นรีเซ็ตให้ลูกค้าตรวจใหม่ */
  async function replaceProof(itemIndex: number, proofIdx: number, file: File | null) {
    if (!order || !file) return;
    if (!file.type.startsWith("image/")) {
      setErr("รองรับเฉพาะไฟล์รูปภาพ (PNG / JPG)");
      return;
    }
    if (demo) {
      setErr("ออเดอร์ตัวอย่าง — เปลี่ยนรูปได้เฉพาะออเดอร์จริง");
      return;
    }
    setErr("");
    setUploadingIdx(itemIndex);
    // ชื่อไฟล์ใหม่บอกจำนวน/ชื่อลายมาด้วย = ทับค่าเดิม (รายละเอียดต้องเป็นของไฟล์ที่อยู่ในกรอบตอนนี้) · ไม่บอก = คงค่าที่ตั้งไว้
    const res = await uploadProof(order.id, itemIndex, file, { replaceIndex: proofIdx, ...proofFromFileName(file.name), silent: true });
    setUploadingIdx(null);
    if (!res.ok) {
      setErr(res.error ?? "เปลี่ยนรูปไม่สำเร็จ");
      return;
    }
    adoptOrder(res.order);
    setProofNotifyMsg(null);
  }

  if (loading) {
    return <p className="py-20 text-center text-sm text-slate-400">กำลังโหลดออเดอร์…</p>;
  }

  if (!order) {
    return (
      <div className="py-20 text-center">
        <span className="text-4xl">🗒️</span>
        <p className="mt-3 font-semibold text-slate-600">ไม่พบออเดอร์ {orderId}</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-sm font-semibold text-amber-600 hover:underline">
          ← กลับไปหน้าคำสั่งซื้อ
        </Link>
      </div>
    );
  }

  // ถือว่า "จ่ายแล้ว" เมื่อแอดมินยืนยันสลิปแล้ว (ชำระแล้วเป็นต้นไป)
  const paidOk = !(["รอชำระเงิน", "รอตรวจสอบ"] as OrderStatus[]).includes(order.status);
  const gate = packGate(order); // ขั้นตอนแพ็คผ่านครบหรือยัง
  // 📣 รูปแบบงานที่ยังไม่ได้แจ้งลูกค้า (นับจาก proofNotifiedAt) — โชว์แถบเตือนในกล่องแบบของรายการที่มีรูปค้าง
  const proofPending = pendingProofs(order);
  // ฝ่ายแพ็ค (ตรวจนับได้ แต่แก้ออเดอร์ไม่ได้) → เห็นหน้าแพ็คเสมอ · แอดมิน/พนักงานแอดมินกด "โหมดแพ็ค" เอง
  // ⚠️ ต้องรอสิทธิ์โหลดเสร็จก่อนค่อยตัดสิน (permsReady) — ช่วงที่สิทธิ์ยังไม่มา mayEdit เป็น false
  // แต่ viaScan ยืม pack.check ให้แล้ว → เงื่อนไขนี้จริงชั่วคราว = แอดมินเห็นหน้าแพ็คแว๊บนึงทุกครั้ง
  // ที่เปิดลิงก์จากนอกเว็บ (จาก msVerify/LINE/พิมพ์ URL เอง) ก่อนสลับกลับหน้าปกติ
  //
  // 🎨 กราฟฟิก (proof.manage แต่ไม่มี orders.edit) กดเลขออเดอร์จากบอร์ด WIP/LINE = เปิด "จากนอกเว็บ"
  // → ตัวเดา openedFromOutside ยืม pack.check ให้ → เคยถูกลากเข้าหน้าแพ็คถาวรทั้งที่ต้องมาทำแบบงาน
  // (OD-260908-1744 · 9 ก.ย. 69) · สิทธิ์ที่ "ยืมมา" จากการเดา ห้ามใช้ตัดสินว่าเป็นฝ่ายแพ็ค
  // ถ้าคนนั้นมีงานของตัวเองบนหน้าปกติอยู่แล้ว (ทำแบบงาน) — ให้เห็นหน้าปกติ แล้วกด "โหมดแพ็ค" เองได้
  // คนที่ไม่มีทั้งสิทธิ์แก้และสิทธิ์ทำแบบ (ฝ่ายผลิตสแกน QR รุ่นเก่า) ยังเข้าหน้าแพ็คให้เองเหมือนเดิม
  const isPackOnly = permsReady && !mayEdit && (rolCan("pack.check") || (can("pack.check") && !mayProof));
  const showPackView = isPackOnly || packMode;

  if (showPackView) {
    return (
      <>
        {packMode && !isPackOnly && (
          <div className="mx-auto mb-3 flex max-w-[480px] items-center justify-between px-3">
            <span className="text-sm font-bold text-slate-500">📦 โหมดแพ็ค</span>
            <button
              type="button"
              onClick={() => {
                setPackMode(false);
                // จำไว้ว่าคนนี้กดออกเอง — รีเฟรช/เปิดใบนี้ซ้ำในแท็บนี้จะไม่เด้งเข้าโหมดแพ็คอีก
                // (สิทธิ์ที่ยืมมาตอนสแกนยังอยู่จนกว่าจะปิดแท็บ — แค่ไม่ดันเข้าโหมดแพ็คให้)
                try {
                  sessionStorage.setItem(packOptOutKey(order.id), "1");
                } catch {}
                const u = new URL(window.location.href);
                if (u.searchParams.has(PACK_SCAN_PARAM)) {
                  u.searchParams.delete(PACK_SCAN_PARAM);
                  window.history.replaceState(null, "", u.pathname + u.search);
                }
              }}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ← กลับหน้าตรวจสอบออเดอร์
            </button>
          </div>
        )}
        {skipGate && <SkipGateModal reasons={skipGate} onCancel={cancelSkipGate} onConfirm={confirmSkipGate} />}
        {/* 🛒 รอของเข้า — ฝ่ายแพ็ค/ผลิตเป็นคนรับของ กด "ของเข้าแล้ว" จากตรงนี้ได้ */}
        <div className="mx-auto max-w-[480px] px-3">
          {order.needsPurchase && order.status !== "ยกเลิก" && (
            <NeedsPurchaseStrip
              key={order.needsPurchase.at}
              value={order.needsPurchase}
              paid={order.status !== "รอชำระเงิน" && order.status !== "รอตรวจสอบ"}
              canManage={mayEdit}
              canArrive={mayEdit || can("pack.check") || can("pack.ship")}
              onArrived={() =>
                saveNeedsPurchase(
                  { ...order.needsPurchase!, arrivedAt: new Date().toISOString(), arrivedBy: actor },
                  "🛒 ของเข้าแล้ว — ส่งเข้าผลิตได้",
                  order.needsPurchase!.note
                )
              }
              onUndoArrived={() =>
                saveNeedsPurchase({ ...order.needsPurchase!, arrivedAt: undefined, arrivedBy: undefined }, "🛒 ยกเลิก “ของเข้าแล้ว” — กลับไปรอของเข้า")
              }
              onNote={(note) => saveNeedsPurchase({ ...order.needsPurchase!, note: note || undefined }, "🛒 แก้รายการที่ต้องสั่ง", note || "ลบโน้ต")}
            />
          )}
        </div>
        {partialOpen && (
          <PartialShipModal
            order={order}
            sel={activeShipSel}
            mayEdit={mayEdit}
            editableQty={adHocSplit}
            defaultNote={planNext?.round.note ?? ""}
            pickup={isPickupOrder(order)}
            onCancel={() => setPartialOpen(false)}
            onConfirm={(t, note, sel) => commitPartialShipment(t, note, sel)}
          />
        )}
        <PackView
          order={order}
          shipSel={activeShipSel}
          onToggleShip={adHocSplit ? toggleShipSel : undefined}
          onPartialShip={() => setPartialOpen(true)}
          onPhotoAdd={addPackPhotos}
          onPhotoDelete={deletePackPhoto}
          workSizeOf={(id) => productOfItem(id)?.workSize}
          gate={gate}
          onCheck={setPackCheck}
          onAck={toggleNoteAck}
          onSampleAck={toggleSamplePacked}
          onSampleClear={mayProof || mayEdit ? toggleSampleRequired : undefined}
          onTaxInvoiceAck={toggleTaxInvoicePacked}
          onTaxInvoiceDelivery={setTaxInvoiceDelivery}
          onArrival={setArrival}
          onTrackingChange={(v) => setOrder((cur) => (cur ? { ...cur, tracking: v } : cur))}
          onTrackingSave={saveTracking}
          onTrackingScanned={saveTrackingValue}
          trackingSaved={!!(order.tracking ?? "").trim() && (order.tracking ?? "").trim() === trackingRef.current}
          pickup={isPickupOrder(order)}
          onPickupPacked={confirmPackedPickup}
          onNextOrder={(id) => router.push(`/admin/orders/${encodeURIComponent(id)}?${PACK_SCAN_PARAM}=1`)}
          onZoom={showProof}
        />
        {confirmDialog}
        {lightbox && (
          <ImageLightbox
            src={lightbox.src}
            alt={lightbox.alt}
            caption={lightbox.caption}
            {...lightboxNav()}
            footer={
              lightbox.at ? (
                <PackCheckPanel
                  proof={proofsOf(order.items[lightbox.at.item])[lightbox.at.proof]}
                  onConfirm={(status, got) => {
                    setPackCheck(lightbox.at!.item, lightbox.at!.proof, status, got);
                    setLightbox(null);
                  }}
                />
              ) : undefined
            }
            onClose={() => setLightbox(null)}
          />
        )}
      </>
    );
  }
  // ออเดอร์อื่นของลูกค้าคนเดียวกันที่ยังไม่ปิด (จับคู่จากเบอร์โทร) — เตือนให้พิจารณารวมส่ง
  const phoneKey = (order.phone ?? "").replace(/\D/g, "");
  const related = allOrders.filter(
    (o) =>
      o.id !== order.id &&
      phoneKey.length >= 8 &&
      (o.phone ?? "").replace(/\D/g, "") === phoneKey &&
      o.status !== "เสร็จสิ้น" &&
      o.status !== "ยกเลิก"
  );
  /** รายการไหนควรกางไว้เองตั้งแต่แรก — ออเดอร์ยาว ๆ กางเฉพาะอันที่ยังมีเรื่องต้องจัดการ */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const autoOpen = (_it: OrderItem) => true;
  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  /** ⚡ ค่าส่งที่ระบบคิดให้ (ตัวคิดอยู่ที่ autoShipOf ด้านบน — ใช้ร่วมกับตัวเติมอัตโนมัติ) */
  const autoShip = autoShipOf(order);
  /**
   * ค่าส่งที่ตั้งไว้ "ต่ำกว่า" ที่ระบบคิดให้ — เติมของหนัก/ของเยอะทีหลังแล้วลืมขยับค่าส่ง = ร้านออกค่ากล่องเอง
   * เตือนเฉพาะขาขาดทุน: ตั้งไว้แพงกว่าถือว่าตั้งใจ (คิดค่ากล่องพิเศษ/ส่งหลายกล่อง) ไม่ต้องไปยุ่ง
   * ⚠️ ไม่เตือนใบที่มีเงินเข้าแล้ว (ลูกค้าโอนตามยอดเดิมไปแล้ว) และใบที่ลูกค้ามารับเอง (ไม่มีพัสดุ)
   */
  const shipUnderAuto =
    !!autoShip?.method &&
    order.items.length > 0 &&
    paidSoFar(order) === 0 &&
    !isPickupOrder(order) &&
    autoShip.cost > order.shippingCost;
  /** เปลี่ยนวิธีส่ง + ค่าส่งพร้อมกัน (ช่องเลือก กับปุ่มค่าอัตโนมัติ ใช้ทางเดียวกัน — ต้องลงประวัติเสมอ)
   * 🚚 เปลี่ยนวิธีส่งคือ "แก้ยอดเงิน" ค่าส่งเปลี่ยนตามทันที · เดิมเงียบสนิท:
   * OD-260911-5435 เปลี่ยนเป็น "มารับเอง" แล้วค่าส่ง ฿100 ตามใบ FlowAccount หายไปโดยไม่มีร่องรอย */
  const applyShipMethod = (m: ShippingMethod, cost: number, why?: string) => {
    const before = `${resolveShipLabel(order, shipMethods) || "—"} ${formatPrice(order.shippingCost)}`;
    const next = Math.max(0, cost);
    applyOrder(
      withLog(
        {
          ...order,
          shipping: (m.name.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา") as Order["shipping"],
          shippingLabel: m.name,
          shippingCost: next,
        },
        actor,
        "เปลี่ยนวิธีส่ง",
        `${before} → ${m.name} ${formatPrice(next)}${why ? ` (${why})` : ""}`
      )
    );
  };
  /** 🔢 "17 เซ็ต · 102 ชิ้น" — บรรทัดรวมสินค้าเคยบวก qty ดิบแล้วเขียน "ชิ้น" ทุกกรณี (งานเซ็ต/แผ่นเลยผิด) */
  const qtyText = orderQtyText(order.items, (id) => productOfItem(id));
  /**
   * 📄 ยอดในระบบเพี้ยนจากใบ FlowAccount กี่บาท (0/null = ตรง) — บิลจริงออกที่ FlowAccount ลูกค้าโอนตามใบนั้น
   * ต่างเมื่อไหร่ = ตรวจสลิปเพี้ยน + ใบเสร็จ/ใบงานไม่ตรงบิล ต้องเตือนตรงที่แอดมินแก้ตัวเลข (โซนยอดเงิน)
   */
  const faGap = flowAccountGap(order);
  // 🧾 VAT/หัก ณ ที่จ่าย ห่างจาก "เรต × ยอดก่อน VAT" กี่บาท (ไม่ 0 = ตัวเลขภาษีค้างของฐานเก่า ยอดรวมยังเชื่อไม่ได้)
  const taxDrift = orderTaxDrift(order);
  // ลิงก์ฝั่งลูกค้า (ต้องมี key ถึงเปิดได้) — origin ตั้งใน useEffect กัน SSR mismatch
  const customerUrl = origin
    ? `${origin}/order/${encodeURIComponent(order.id)}${order.key ? `?key=${encodeURIComponent(order.key)}` : ""}`
    : "";

  /**
   * งานที่ต้องทำต่อ + สิ่งที่ถูกล็อกอยู่ — ยกขึ้นบนสุดของหน้า
   * ⚠️ ของเดิมต้องเลื่อนหาเองว่าใบนี้ติดตรงไหน (เก็บเงินไม่ครบ? ยังไม่ตรวจแบบ?)
   */
  const blockers: string[] = [];
  // ลูกค้าขอแก้ไขออเดอร์ — ขึ้นก่อนเรื่องเงิน เพราะถ้าแก้แล้วยอดเปลี่ยน เก็บเงินตอนนี้ก็ต้องเก็บใหม่อยู่ดี
  const openEditReq = order.editRequest && !order.editRequest.doneAt ? order.editRequest : null;
  if (openEditReq && order.status !== "ยกเลิก")
    blockers.push(`ลูกค้าขอแก้ไขออเดอร์ — “${openEditReq.text}”`);
  if (order.deposit && !order.deposit.settledAt && order.status !== "ยกเลิก") {
    // ➗ หัก ณ ที่จ่าย: บอกยอดที่จะเข้าบัญชีจริงของงวดนั้นด้วย — ไม่งั้นแอดมินเทียบเงินเข้ากับยอดมัดจำเต็มแล้วคิดว่าโอนขาด
    const inst = depositInstallments(order);
    const due = amountDueNow(order);
    // ค้างทั้งงวด + หัก ณ ที่จ่าย → เลขหลักคือโอนจริง (ยอดงวดในวงเล็บ) · โอนมาบางส่วนแล้ว → ยอดค้างตามจริง
    const dueText = (gross: number, net: number) =>
      inst && inst.wht > 0 && Math.abs(due - gross) < 0.01 ? `${formatPrice(net)} (โอนจริงหลังหัก ณ ที่จ่าย · ยอดงวด ${formatPrice(gross)})` : formatPrice(due);
    blockers.push(
      order.deposit.firstPaidAt
        ? `ยังเก็บครึ่งหลังไม่ครบ ${inst ? dueText(inst.second, inst.secondNet) : formatPrice(due)} — พิมพ์ใบงาน/ยิงเลขพัสดุไม่ได้จนเก็บครบ`
        : `รอลูกค้าโอนมัดจำงวดแรก ${inst ? dueText(inst.first, inst.firstNet) : formatPrice(due)} — ยังไม่เริ่มงาน`
    );
  }
  const nextStep = NEXT_STATUS[order.status]?.to;

  return (
    <PageShell>
      {blockers.length > 0 && (
        <div className="mb-4">
          <Banner tone="hot" title={`ต้องทำต่อ · ${blockers[0]}`} detail={nextStep ? `ขั้นถัดไปหลังเคลียร์แล้ว: ${nextStep}` : undefined} />
        </div>
      )}

      {/* 🛒 รอของเข้า — กราฟฟิกต้องเห็นก่อนอย่างอื่นว่าใบนี้ยังห้ามส่งเข้าผลิต */}
      {order.needsPurchase && order.status !== "ยกเลิก" && (
        <NeedsPurchaseStrip
          key={order.needsPurchase.at}
          value={order.needsPurchase}
          paid={order.status !== "รอชำระเงิน" && order.status !== "รอตรวจสอบ"}
          canManage={mayEdit}
          canArrive={mayEdit || can("pack.check") || can("pack.ship")}
          onArrived={() =>
            saveNeedsPurchase(
              { ...order.needsPurchase!, arrivedAt: new Date().toISOString(), arrivedBy: actor },
              "🛒 ของเข้าแล้ว — ส่งเข้าผลิตได้",
              order.needsPurchase!.note
            )
          }
          onUndoArrived={() =>
            saveNeedsPurchase({ ...order.needsPurchase!, arrivedAt: undefined, arrivedBy: undefined }, "🛒 ยกเลิก “ของเข้าแล้ว” — กลับไปรอของเข้า")
          }
          onNote={(note) => saveNeedsPurchase({ ...order.needsPurchase!, note: note || undefined }, "🛒 แก้รายการที่ต้องสั่ง", note || "ลบโน้ต")}
        />
      )}

      {/*
        ✏️ ลูกค้าขอแก้ไขออเดอร์ — ลูกค้าพิมพ์มาจากหน้าออเดอร์ของตัวเอง (ไม่ได้แก้ยอดเอง)
        คนดูแลอ่าน → แก้รายการ/ราคาให้เอง → กด "จัดการแล้ว" ให้แบนเนอร์หาย
      */}
      {openEditReq && order.status !== "ยกเลิก" && (
        <div
          className="dkb-g mb-4 p-4"
          style={{ background: "var(--dk-lilac-wash)", borderLeft: "5px solid var(--dk-lilac)" }}
        >
          <p className="dkb-eyebrow" style={{ color: "var(--dk-lilac-ink)" }}>
            ✏️ ลูกค้าขอแก้ไขออเดอร์
          </p>
          <p className="mt-1.5 text-[.95rem] leading-relaxed" style={{ color: "var(--dk-navy)" }}>
            “{openEditReq.text}”
          </p>
          <p className={`mt-1 text-xs ${faint}`}>
            ส่งเมื่อ{" "}
            {new Date(openEditReq.at).toLocaleString("th-TH", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · ลูกค้าแก้เองไม่ได้ — แก้รายการ/ราคาให้ในหน้านี้ แล้วทักยืนยันยอดใหม่กับลูกค้า
          </p>
          {mayEdit && (
            <button type="button" onClick={resolveEditRequest} className="dkb-btn dkb-btn-ghost mt-3">
              ✓ จัดการแล้ว
            </button>
          )}
        </div>
      )}

      {/* 🚫 ใบที่ลูกค้ากดยกเลิกเอง (ยกเลิกได้เฉพาะตอนยังไม่มีเงินเข้า) — แยกจากที่ร้านยกเลิกให้ */}
      {order.cancelledByCustomer && (
        <div
          className="dkb-g mb-4 p-4"
          style={{ background: "var(--dk-coral-wash)", borderLeft: "5px solid var(--dk-coral-deep)" }}
        >
          <p className="dkb-eyebrow" style={{ color: "var(--dk-coral-ink)" }}>
            🚫 ลูกค้ากดยกเลิกออเดอร์เอง
          </p>
          <p className={`mt-1.5 text-xs ${faint}`}>
            {new Date(order.cancelledByCustomer.at).toLocaleString("th-TH", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · ยังไม่มีเงินเข้าตอนที่ยกเลิก (ระบบเปิดให้ยกเลิกเองเฉพาะกรณีนี้)
          </p>
          {order.cancelledByCustomer.reason && (
            <p className="mt-1.5 text-[.95rem] leading-relaxed" style={{ color: "var(--dk-navy)" }}>
              เหตุผล: “{order.cancelledByCustomer.reason}”
            </p>
          )}
        </div>
      )}

      <div className="dkb-g overflow-hidden">
      {/* ── แถบหัว ── */}
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--dk-hair)" }}>
        {/* บรรทัดบน = ข้อมูลล้วน (เลขออเดอร์ · สถานะตอนนี้ · ยอดรวม) ไม่มีปุ่มปน */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/admin/orders" className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
                คำสั่งซื้อทั้งหมด
              </Link>
              {/* ไล่ใบก่อนหน้า/ถัดไปตามลำดับหน้ารายการ (allOrders = ใบเบาเรียงใหม่→เก่าจาก API) */}
              {!demo && <PrevNextNav ids={allOrders.map((o) => o.id)} current={order.id} hrefOf={orderHref} />}
            </div>
            <h1 className="dkb-display mt-1 flex flex-wrap items-center gap-2 text-[1.55rem] leading-tight">
              {order.id}
              {order.rush && (
                <span className="dkb-tag" style={{ background: "var(--dk-coral-deep)", color: "#fff" }}><i />งานเร่ง</span>
              )}
              {(() => {
                const d = order.useByDate ? daysToUseBy(order) : null;
                if (d == null || order.status === "เสร็จสิ้น" || order.status === "ยกเลิก") return null;
                if (d < 0) return <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">เลยวันใช้งาน {Math.abs(d)} วัน</span>;
                if (d <= 3) return <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200">{d === 0 ? "ต้องใช้งานวันนี้" : `อีก ${d} วันถึงวันใช้งาน`}</span>;
                return null;
              })()}
            </h1>
            <p className={`text-xs ${faint}`}>
              {order.date}
              {demo && <span className="ml-1">· ตัวอย่าง</span>}
            </p>
          </div>
          {/* ขวาบน = แผงเงิน+สถานะชิดขวา — เลขที่โชว์ใหญ่คือ "เงินที่ยังต้องเก็บ" ไม่ใช่ยอดตั้งบิล (งานค้างเด่นกว่างานจบ)
              และมีบรรทัดเทียบใต้เลขเสมอ (ยอดรวม/รับแล้วเท่าไหร่) เลขไม่ลอยเดี่ยว */}
          <div className="ml-auto flex flex-col items-end gap-2.5">
            {seesMoney &&
              (() => {
                const total = orderTotal(order);
                const dep = order.deposit;
                const inst = depositInstallments(order);
                // ➗ ลูกค้าหัก ณ ที่จ่าย: เลขใหญ่ = เงินที่จะเข้าบัญชีจริง (โอนจริง) · ยอดงวดรวม VAT ไปอยู่บรรทัดรอง — เทียบเงินเข้าได้ทันที
                const hasWht = !!inst && inst.wht > 0;
                const grossNote = (gross: number) => (hasWht ? `ยอดงวด ${formatPrice(gross)} ก่อนหัก ณ ที่จ่าย · ` : "");
                const canceled = order.status === "ยกเลิก";
                const paidUp = orderFullyPaid(order);
                const m = canceled
                  ? { label: "ยอดรวม", num: total, hot: false, sub: "ออเดอร์ถูกยกเลิก" }
                  : paidUp
                    ? { label: "ยอดรวม", num: total, hot: false, sub: "✓ รับเงินครบแล้ว", subTone: "text-emerald-600" }
                    : dep && !dep.firstPaidAt
                      ? {
                          label: hasWht ? "รอมัดจำงวดแรก · โอนจริง" : "รอมัดจำงวดแรก",
                          num: hasWht ? inst!.firstNet : Math.min(total, dep.amount),
                          hot: true,
                          sub: `${grossNote(inst!.first)}ยอดรวมทั้งบิล ${formatPrice(total)}`,
                        }
                      : dep && !dep.settledAt
                        ? (() => {
                            const due = amountDueNow(order);
                            const whole = Math.abs(due - inst!.second) < 0.01; // ค้างทั้งงวด → ใช้ตัวเลขโอนจริงของงวดได้
                            return {
                              label: hasWht && whole ? "ค้างงวดที่ 2 · โอนจริง" : "ค้างงวดที่ 2",
                              num: hasWht && whole ? inst!.secondNet : due,
                              hot: true,
                              sub: `${whole ? grossNote(inst!.second) : ""}ยอดรวม ${formatPrice(total)} · รับแล้ว ${formatPrice(dep.amount)}`,
                            };
                          })()
                        : order.paidTotal != null && total - order.paidTotal > 0
                          ? { label: "ค้างส่วนต่าง", num: total - order.paidTotal, hot: true, sub: `ยอดรวม ${formatPrice(total)} · รับแล้ว ${formatPrice(order.paidTotal)}` }
                          : {
                              label: "ยอดรวม",
                              num: total,
                              hot: false,
                              sub:
                                order.status === "รอชำระเงิน"
                                  ? "ยังไม่ได้รับเงิน"
                                  : order.status === "รอตรวจสอบ"
                                    ? "ลูกค้าแจ้งโอนแล้ว — รอตรวจ"
                                    : undefined,
                            };
                return (
                  <div className="text-right">
                    <div className={`text-[11px] font-bold uppercase tracking-[0.09em] ${m.hot ? "text-rose-500" : "text-slate-400"}`}>
                      {m.label}
                    </div>
                    <div className={`dkb-num mt-0.5 text-[1.6rem] ${m.hot ? "text-rose-600" : ""}`}>{formatPrice(m.num)}</div>
                    {m.sub && <p className={`mt-1 text-[11px] font-semibold ${m.subTone ?? "text-slate-400"}`}>{m.sub}</p>}
                  </div>
                );
              })()}
            <div className="flex items-center gap-2">
              {/* ป้ายสถานะ = ตัวเลือกในตัว — สีป้ายบอกสถานะอยู่แล้ว ไม่ต้องมี label ซ้ำ · กดที่ป้ายเลือกสถานะใหม่ได้เลย */}
              {mayEdit ? (
                <div className="relative">
                  <select
                    value={order.status}
                    onChange={(e) => void changeStatus(e.target.value as OrderStatus)}
                    aria-label="สถานะตอนนี้ — กดเพื่อเปลี่ยน"
                    title="สถานะตอนนี้ — กดเพื่อเปลี่ยน"
                    className={`cursor-pointer appearance-none rounded-xl py-2 pl-3.5 pr-8 text-sm font-bold ring-1 focus:outline-none focus:ring-2 focus:ring-[#2472ae]/40 ${STATUS_STYLES[order.status]}`}
                  >
                    {STATUS_GROUPS.map((g) => (
                      <optgroup key={g.title} label={g.title}>
                        {g.items.map((st) => (
                          // "ชำระแล้ว" ปิดไว้สำหรับคนที่ไม่มีสิทธิ์ยืนยันเงินเข้า — เห็นได้แต่เลือกไม่ได้
                          <option key={st} value={st} disabled={st === "ชำระแล้ว" && !mayMarkPaid}>
                            {/* ออเดอร์มัดจำ: ป้าย "ชำระแล้ว" ต้องบอกว่าเงินเข้างวดไหน (แรก = ครึ่งเดียว · หลัง = ครบ 100%) */}
                            {st === "ชำระแล้ว" && order.deposit?.firstPaidAt
                              ? order.deposit.settledAt
                                ? "ชำระแล้ว 50% หลัง"
                                : "ชำระแล้ว 50% แรก"
                              : st}
                            {st === "ชำระแล้ว" && !mayMarkPaid
                              ? "  (เฉพาะคนที่มีสิทธิ์ยืนยันเงินเข้า)"
                              : NEXT_STATUS[order.status]?.to === st
                                ? "  ← ขั้นถัดไป"
                                : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {(mayCancel || order.status === "ยกเลิก") && (
                      <optgroup label="⚠️ ยกเลิก">
                        <option value="ยกเลิก">ยกเลิกออเดอร์</option>
                      </optgroup>
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] opacity-70">▼</span>
                </div>
              ) : (
                <span className={`inline-flex rounded-xl px-3.5 py-2 text-sm font-bold ring-1 ${STATUS_STYLES[order.status]}`}>
                  {orderStatusLabel(order)}
                </span>
              )}
            </div>
            {/* ใครสร้างใบนี้ — ใต้ป้ายสถานะ ให้เห็นทันทีตั้งแต่หัวหน้า (เจ้าของร้านขอ 16 ก.ย. 69)
                พนักงานทำให้ (สั่งแทนที่ตะกร้า · งานพิเศษ · แปลงจากใบเสนอราคา/FlowAccount · redo) = ป้ายทึบ + ชื่อคนทำ
                ลูกค้ากดสั่งเองจากหน้าเว็บ = ป้ายจาง ๆ · คำเดียวกับหน้ารายการออเดอร์ (dkb-by) จะได้ไม่งงข้ามหน้า */}
            {order.placedBy ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200"
                title="ออเดอร์นี้พนักงานเป็นคนทำบิลให้ลูกค้า"
              >
                <span aria-hidden>🧑‍💼</span>
                แอดมินสร้างให้ · {order.placedBy}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200"
                title="ลูกค้ากดสั่งเองจากหน้าเว็บ ไม่ใช่ใบที่พนักงานกรอก"
              >
                <span aria-hidden>🛒</span>
                ลูกค้าสั่งเองจากเว็บ
              </span>
            )}
          </div>
        </div>

        {/* บรรทัดล่าง = ปุ่ม — งานรองอยู่ซ้าย (เงียบ) · "ขั้นถัดไป" อยู่ขวา เด่นอันเดียว */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* พิมพ์เอกสาร: รวมเป็นปุ่มเดียว เมนูค่อยเลือกว่าใบไหน */}
          <div className="relative">
            <button type="button" onClick={() => setPrintMenu((v) => !v)} className={HBTN} aria-expanded={printMenu}>
              🖨️ พิมพ์เอกสาร ▾
            </button>
            {printMenu && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="ปิดเมนู" onClick={() => setPrintMenu(false)} />
                <div className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {(
                    [
                      ["work", "🧾 ใบงาน + ใบปะหน้า"],
                      ["receipt", "💳 ใบเสร็จ"],
                    ] as const
                  ).map(([doc, label]) => (
                    <Link
                      key={doc}
                      href={`/admin/orders/${encodeURIComponent(order.id)}/print?doc=${doc}`}
                      onClick={() => setPrintMenu(false)}
                      className="block px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      {label}
                    </Link>
                  ))}
                  <Link
                    href={`/admin/orders/${encodeURIComponent(order.id)}/print`}
                    onClick={() => setPrintMenu(false)}
                    className="block border-t border-slate-100 px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  >
                    ⚙️ เลือกเอกสารเอง…
                  </Link>
                </div>
              </>
            )}
          </div>
          {mayEdit && (
            <button
              type="button"
              onClick={() => {
                setRedoOpen(true);
                setRedoErr("");
                setRedoPicks({});
              }}
              title="ทำงานชิ้นนี้ใหม่ — เคลม (ไม่คิดเงิน) หรือสั่งซ้ำ (คิดเงินปกติ)"
              className={HBTN}
            >
              ♻️ ทำใหม่ / เคลม
            </button>
          )}
        </div>
      </div>

      {/* ── แถบมัดจำ 50% — ให้ทุกแผนกที่เปิดออเดอร์นี้รู้ทันทีว่าเก็บเงินสองงวด และตอนนี้ค้างอะไร ── */}
      {order.deposit &&
        order.status !== "ยกเลิก" &&
        (() => {
          const waitFirst = !order.deposit!.firstPaidAt;
          const settled = !!order.deposit!.settledAt;
          const paid = order.paidTotal ?? order.deposit!.amount;
          const bal = Math.max(0, orderTotal(order) - (order.paidTotal ?? 0));
          // ➗ หัก ณ ที่จ่าย: แถบนี้เป็นที่แรกที่ทุกแผนกเห็น — บอกเงินเข้าจริงของงวดคู่กับยอดงวด
          const inst = depositInstallments(order)!;
          const whtRate = order.wht?.rate ? ` ${order.wht.rate}%` : "";
          const hasWht = inst.wht > 0;
          const balWhole = hasWht && Math.abs(bal - inst.second) < 0.01;
          const tone = settled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : waitFirst
              ? "border-violet-200 bg-violet-50 text-violet-800"
              : "border-rose-200 bg-rose-50 text-rose-800";
          return (
            <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-6 py-3 text-sm ${tone}`}>
              <span className="font-bold">➗ ออเดอร์มัดจำ 50%</span>
              {settled ? (
                // เงินครบแล้วก็จริง แต่ถ้าสถานะยังค้างขั้นตรวจเงิน เอกสารก็ยังล็อกอยู่ — อย่าบอกว่าปลดล็อกแล้ว
                orderFullyPaid(order) ? (
                  <span>เก็บครบ 100% แล้ว — พิมพ์เอกสาร/ยิงเลขพัสดุได้ตามปกติ</span>
                ) : (
                  <span>
                    เก็บครบ 100% แล้ว — แต่สถานะยังเป็น “{order.status}” · เปลี่ยนเป็น “ชำระแล้ว” ก่อน ถึงจะพิมพ์ใบปะหน้า/ใบเสร็จได้
                  </span>
                )
              ) : waitFirst ? (
                <span>
                  รอลูกค้าโอน<b>งวดแรก</b>
                  {seesMoney &&
                    (hasWht ? (
                      <>
                        {" "}
                        <b>{formatPrice(inst.firstNet)}</b> (โอนจริงหลังหัก ณ ที่จ่าย{whtRate} · ยอดงวด {formatPrice(order.deposit!.amount)} · ยอดเต็ม{" "}
                        {formatPrice(orderTotal(order))})
                      </>
                    ) : (
                      ` ${formatPrice(order.deposit!.amount)} (จากยอดเต็ม ${formatPrice(orderTotal(order))})`
                    ))}{" "}
                  — เริ่มงานได้หลังมัดจำเข้า
                </span>
              ) : (
                <span>
                  รับมัดจำแล้ว{seesMoney && ` ${formatPrice(paid)}`} ·{" "}
                  <b>ค้างยอดคงเหลือ{seesMoney && ` ${formatPrice(balWhole ? inst.secondNet : bal)}`}</b>
                  {seesMoney && balWhole && ` (โอนจริงหลังหัก ณ ที่จ่าย${whtRate} · ยอดงวด ${formatPrice(bal)})`} — ⛔
                  ห้ามส่งของ ยิงเลขพัสดุ/พิมพ์ใบปะหน้า-ใบเสร็จไม่ได้จนกว่าจะเก็บครบ
                </span>
              )}
            </div>
          );
        })()}

      {related.length > 0 && (
        <div className="border-b border-orange-200 bg-orange-50 px-6 py-3">
          <p className="text-sm font-bold text-orange-800">
            ⚠️ ลูกค้ารายนี้มีอีก {related.length} ออเดอร์ที่ยังไม่ปิด — พิจารณารวมส่งกล่องเดียว
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {related.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${encodeURIComponent(o.id)}`}
                className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100"
              >
                {o.id} · {o.status}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── ⛔ บังคับผูก LINE — ต้องครบทั้ง "ลิงก์ห้องแชท" และ "userId" ──
           ลิงก์ห้องแชท = พนักงานกระโดดกลับไปคุยกับลูกค้าได้ · userId = ระบบส่งแจ้งสถานะเองได้
           ขาดอย่างใดอย่างหนึ่งก็ยังทำงานต่อได้ แต่ต้องเห็นชัดว่ายังไม่ครบ */}
      {(() => {
        const needChat = !lineChatOf(order, allOrders);
        const needUser = !lineUserOf(order, allOrders);
        if (!needChat && !needUser) return null;
        if (isBlankOrder(order)) return null; // เพิ่งกดสร้าง ยังไม่กรอกอะไร — รอให้เริ่มใส่ข้อมูลลูกค้า/รายการก่อนค่อยเตือน
        const missing = [needChat && "ลิงก์ห้องแชท", needUser && "LINE userId"].filter(Boolean).join(" + ");
        return (
          <a href="#line-bind" className="block border-b border-rose-200 bg-rose-50 px-6 py-3 transition hover:bg-rose-100">
            <p className="text-sm font-bold text-rose-800">⛔ บังคับ: ยังไม่ได้ผูก {missing} ของลูกค้า</p>
            <p className="mt-0.5 text-[11px] font-semibold text-rose-600">
              ทุกออเดอร์ต้องมีครบทั้ง <b>ลิงก์ห้องแชท</b> และ <b>LINE userId</b> — แตะเพื่อไปที่ช่องผูก ↓
            </p>
          </a>
        );
      })()}

      {/* ── 💬 ยังมีรายการรอตีราคา — ลูกค้าเปิดหน้าแจ้งโอนไม่ได้จนกว่าจะใส่ราคาครบ (ต้องเห็นทันทีที่เปิดออเดอร์) ── */}
      {(() => {
        if (!seesMoney || order.claimOf) return null;
        const waiting = order.items.filter((it) => it.unitPrice <= 0);
        if (!waiting.length) return null;
        return (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
            <p className="text-sm font-bold text-amber-800">
              💬 รอตีราคา {waiting.length} รายการ — ลูกค้ายังโอนเงินไม่ได้
            </p>
            <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-amber-700">
              หน้าเช็คออเดอร์ของลูกค้าจะยัง<b>ไม่เปิดปุ่มแจ้งโอน</b> จนกว่าทุกรายการมีราคา — กดที่ป้าย{" "}
              <b>“💬 รอตีราคา · กดใส่ราคา”</b> ในช่องราคา/หน่วยของรายการนั้น ใส่ราคา<b>ต่อ 1 หน่วย</b> แล้วกด Enter
              {mayEdit ? " · ใส่ครบแล้วระบบแจ้งลูกค้าทางไลน์ให้เอง" : " · บัญชีนี้ไม่มีสิทธิ์แก้ ต้องให้แอดมินใส่"}
            </p>
            <p className="mt-1 text-[11px] text-amber-600">
              {waiting.map((it) => `• ${it.name} ×${it.qty.toLocaleString("th-TH")}`).join("  ")}
            </p>
          </div>
        );
      })()}

      {/* ── งานเคลม / สั่งซ้ำ — โยงกันสองทางให้กดข้ามไปมาได้ ── */}
      {(order.claimOf || order.reorderOf || (order.redoOrders?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 px-6 py-3">
          {order.claimOf && (
            <span className="inline-flex flex-wrap items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
              ♻️ งานเคลม — ไม่คิดเงินกับลูกค้า
              <Link href={`/admin/orders/${encodeURIComponent(order.claimOf)}`} className="underline decoration-rose-300 underline-offset-2">
                จากออเดอร์ {order.claimOf}
              </Link>
              {order.claimReason && <span className="font-normal text-rose-600">· เหตุผล: {order.claimReason}</span>}
            </span>
          )}
          {order.reorderOf && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
              🔁 สั่งซ้ำ
              <Link href={`/admin/orders/${encodeURIComponent(order.reorderOf)}`} className="underline decoration-sky-300 underline-offset-2">
                จากออเดอร์ {order.reorderOf}
              </Link>
            </span>
          )}
          {(order.redoOrders ?? []).map((rid) => (
            <Link
              key={rid}
              href={`/admin/orders/${encodeURIComponent(rid)}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100"
            >
              ♻️ มีงานที่ทำใหม่จากออเดอร์นี้ · {rid} →
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── ซ้าย: งานแบบ ── */}
        <div className="px-4 py-6 sm:px-6">
          <div className="mb-5">
            <GH t="sky">👤 ลูกค้า / จัดส่ง</GH>
            <div className={`mt-2 ${soft("sky")}`}>
              {mayEdit ? (
                /* แอดมินแก้ข้อมูลลูกค้าตรงนี้ได้เลย (บันทึกอัตโนมัติตอนออกจากช่อง) — ใช้กับออเดอร์ที่สร้างจากหลังบ้านด้วย */
                <div className="space-y-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                    <div className="min-w-0">
                      <p className="mb-1 text-[10.5px] font-bold text-slate-400">ชื่อลูกค้า</p>
                      <CustomerContactInput
                        // ออเดอร์เก่าเก็บ "ยังไม่ระบุชื่อ" เป็นค่าจริงในช่อง — ถือว่าว่าง ให้ขึ้นเป็นลายน้ำ (placeholder) แทน
                        value={order.customer === "ยังไม่ระบุชื่อ" ? "" : order.customer}
                        onChange={(v) => setOrder((cur) => (cur ? { ...cur, customer: v } : cur))}
                        onBlur={persist}
                        onPick={(c) =>
                          applyOrder({
                            ...order,
                            customer: c.name || order.customer,
                            phone: c.phone || order.phone,
                            address: c.address || order.address,
                            contactId: c.id,
                          })
                        }
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10.5px] font-bold text-slate-400">เบอร์โทร</p>
                      <input
                        value={order.phone}
                        onChange={(e) => setOrder((cur) => (cur ? { ...cur, phone: e.target.value.replace(/[^\d\-+ ]/g, "") } : cur))}
                        onBlur={persist}
                        inputMode="tel"
                        placeholder="08x-xxx-xxxx"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] tabular-nums text-slate-700 focus:border-amber-300 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10.5px] font-bold text-slate-400">ที่อยู่จัดส่ง</p>
                    <textarea
                      value={order.address}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, address: e.target.value } : cur))}
                      onBlur={persist}
                      rows={2}
                      placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                  {/* 📮 ผู้ส่งบนใบปะหน้า — ใบฝากส่งของตัวแทนต้องขึ้นชื่อร้านตัวแทน ไม่ใช่ชื่อเรา (15 ก.ย. 69) */}
                  <SenderPicker
                    orderId={order.id}
                    sender={order.sender}
                    dealer={order.dealer}
                    mayEdit
                    demo={demo}
                    onChange={(next) =>
                      applyOrder(
                        withLog(
                          { ...order, sender: next },
                          actor,
                          next ? "ตั้งผู้ส่งบนใบปะหน้า" : "ใช้ชื่อร้านเป็นผู้ส่ง",
                          next ? [next.name, next.phone, next.address].filter(Boolean).join(" · ") : undefined
                        )
                      )
                    }
                  />
                  {/* แถวลงมือทำต่อ — คัดลอกไปตอบ LINE/จ่าหน้า · โทรหาลูกค้า · สถานะการผูกผู้ติดต่อ */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {order.contactId ? (
                      <ContactChip contactId={order.contactId} onUnlink={() => applyOrder({ ...order, contactId: undefined })} />
                    ) : (
                      <span className="text-[11px] text-slate-400">💡 พิมพ์ชื่อเพื่อผูกผู้ติดต่อ — เริ่มสะสมแต้มตั้งแต่ออเดอร์แรก</span>
                    )}
                    {(order.customer || order.address || order.phone) && order.customer !== "ยังไม่ระบุชื่อ" && (
                      <CopyChip
                        label="คัดลอกที่อยู่จัดส่ง"
                        text={() =>
                          [
                            [order.customer, order.phone && `โทร. ${formatPhone(order.phone)}`].filter(Boolean).join("  "),
                            order.address,
                          ]
                            .filter(Boolean)
                            .join("\n")
                        }
                      />
                    )}
                    {order.phone && (
                      <a
                        href={`tel:${order.phone.replace(/\D/g, "")}`}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                      >
                        📞 {formatPhone(order.phone)}
                      </a>
                    )}
                  </div>
                  <p className={`text-xs ${faint}`}>
                    {order.payment} · {resolveShipLabel(order, shipMethods)}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-bold text-slate-800">{order.customer || "ยังไม่ระบุชื่อ"}</span>{" "}
                    <span className={muted}>· {order.phone}</span>
                  </p>
                  <p className={`text-sm ${muted}`}>{order.address}</p>
                  {/* 📮 ใบฝากส่ง — คนแพ็คต้องรู้ว่ากล่องนี้ใช้ชื่อผู้ส่งของตัวแทน (แก้ไม่ได้ตรงนี้) */}
                  <div className="mt-1.5">
                    <SenderPicker orderId={order.id} sender={order.sender} dealer={order.dealer} mayEdit={false} onChange={() => {}} />
                  </div>
                  <p className={`mt-2 text-xs ${faint}`}>
                    {order.payment} · {resolveShipLabel(order, shipMethods)}
                  </p>
                </>
              )}
              {order.placedBy && (
                <p className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
                  🧑‍💼 พนักงานสั่งแทนลูกค้า — {order.placedBy}
                </p>
              )}
              {(order.flowAccount || order.taxInvoice) && (
                <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
                  {/* 🧾 ใส่ใบกำกับลงกล่องหรือยัง — เจ้าของร้านแจ้ง 10 ก.ย. 69 ว่าพนักงานมักลืมพิมพ์ใบกำกับไปกับใบปะหน้า */}
                  <p
                    className={`mb-1 flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1 font-bold ${
                      order.taxInvoiceDelivery === "email"
                        ? "bg-slate-100 text-slate-600"
                        : order.taxInvoicePacked
                          ? "bg-green-50 text-green-700"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}
                  >
                    {order.taxInvoiceDelivery === "email"
                      ? "📧 ใบกำกับส่ง E-tax/อีเมลแล้ว — ไม่ต้องแนบกล่อง"
                      : order.taxInvoicePacked
                        ? `✅ ใส่ใบกำกับลงกล่องแล้ว · ${order.taxInvoicePacked.by} · ${shortTime(order.taxInvoicePacked.at)}`
                        : "🧾 ต้องใส่ใบกำกับภาษีลงกล่อง — ยังไม่ยืนยัน (กันยิงเลขพัสดุ)"}
                    {mayEdit && (
                      <span className="ml-auto flex gap-1">
                        {order.taxInvoiceDelivery !== "email" && (
                          <button
                            type="button"
                            onClick={toggleTaxInvoicePacked}
                            className="rounded-md border border-current px-2 py-0.5 text-[11px] font-bold"
                          >
                            {order.taxInvoicePacked ? "ยกเลิกยืนยัน" : "ใส่กล่องแล้ว"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTaxInvoiceDelivery(order.taxInvoiceDelivery === "email" ? "box" : "email")}
                          className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-bold text-slate-500"
                        >
                          {order.taxInvoiceDelivery === "email" ? "ต้องแนบกล่อง" : "ส่ง E-tax แล้ว ไม่แนบ"}
                        </button>
                      </span>
                    )}
                  </p>
                  {order.flowAccount && (
                    <p className="font-bold text-sky-800">
                      📄 {order.flowAccount.docTypeLabel} FlowAccount {order.flowAccount.docNo}
                      {order.flowAccount.date ? ` · ${order.flowAccount.date}` : ""}
                      {" · "}
                      <a href={order.flowAccount.url} target="_blank" rel="noreferrer" className="underline">
                        เปิดเอกสาร ↗
                      </a>
                    </p>
                  )}
                  {order.flowAccount?.grandTotal != null && (
                    <p className={muted}>
                      ยอดตามใบ {formatPrice(order.flowAccount.grandTotal)}
                      {order.flowAccount.vat ? ` (รวม VAT ${formatPrice(order.flowAccount.vat)})` : ""}
                      {order.flowAccount.wht ? ` · หัก ณ ที่จ่าย ${formatPrice(order.flowAccount.wht)} → โอนจริง ${formatPrice(order.flowAccount.net ?? 0)}` : ""}
                      {" · "}บิลจริง/รับชำระที่ FlowAccount — ใบนี้เป็นใบงาน
                    </p>
                  )}
                  {/* ➗ ใบมัดจำของ FlowAccount: ยอดด้านบนคือมูลค่างานเต็ม · งวดแรกตามใบแจ้งหนี้มัดจำ · รายการอาจมาจากอีกใบ */}
                  {order.flowAccount?.deposit && (
                    <p className={muted}>
                      ➗ มัดจำงวดแรกตามเอกสาร {formatPrice(order.flowAccount.deposit.amount)}
                      {order.flowAccount.deposit.net != null ? ` (โอนจริง ${formatPrice(order.flowAccount.deposit.net)} หลังหัก ณ ที่จ่าย)` : ""}
                      {order.flowAccount.deposit.refDocNo
                        ? ` · ${order.flowAccount.deposit.kind === "deposit" ? "อ้างอิงใบเสนอราคา" : "หักมัดจำตามใบ"} ${order.flowAccount.deposit.refDocNo}`
                        : ""}
                      {order.flowAccount.itemsFrom ? (
                        <>
                          {" · รายการจาก "}
                          <a href={order.flowAccount.itemsFrom.url} target="_blank" rel="noreferrer" className="underline">
                            {order.flowAccount.itemsFrom.docTypeLabel} {order.flowAccount.itemsFrom.docNo} ↗
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                  {order.flowAccount && mayEdit && <FlowAccountSync order={order} actor={actor} onApply={applyOrder} />}
                  {order.taxInvoice && (
                    <p className={muted}>
                      🧾 ใบกำกับ: <b className="text-slate-800">{order.taxInvoice.company}</b>
                      {order.taxInvoice.branch ? ` (${order.taxInvoice.branch})` : ""}
                      {order.taxInvoice.taxId ? ` · เลขผู้เสียภาษี ${order.taxInvoice.taxId}` : ""}
                      {order.taxInvoice.address ? ` · ${order.taxInvoice.address}` : ""}
                      {order.taxInvoice.docNo && (
                        <>
                          {" · "}
                          {order.taxInvoice.docUrl ? (
                            <a href={order.taxInvoice.docUrl} target="_blank" rel="noreferrer" className="underline">
                              {order.taxInvoice.docTypeLabel ?? "เอกสาร"} {order.taxInvoice.docNo} ↗
                            </a>
                          ) : (
                            `${order.taxInvoice.docTypeLabel ?? "เอกสาร"} ${order.taxInvoice.docNo}`
                          )}
                        </>
                      )}
                      {mayEdit && !taxForm && (
                        <button
                          type="button"
                          onClick={() =>
                            setTaxForm({
                              company: order.taxInvoice!.company,
                              taxId: order.taxInvoice!.taxId ?? "",
                              branch: order.taxInvoice!.branch ?? "",
                              address: order.taxInvoice!.address,
                              docUrl: order.taxInvoice!.docUrl ?? "",
                              docNo: order.taxInvoice!.docNo,
                              docTypeLabel: order.taxInvoice!.docTypeLabel,
                            })
                          }
                          className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
                        >
                          ✏️ แก้
                        </button>
                      )}
                    </p>
                  )}
                  {/* 🗑 ลูกค้าเปลี่ยนใจไม่เอาบิลบริษัท — ถอดใบกำกับ/FlowAccount/VAT ออกทั้งชุด (OD-260915-6489 · 16 ก.ย. 69) */}
                  {mayEdit && order.status !== "ยกเลิก" && !taxForm && (
                    <div className="mt-1.5 flex justify-end border-t border-sky-200/70 pt-1.5">
                      <button
                        type="button"
                        onClick={removeCompanyBill}
                        className="rounded-md px-2.5 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                      >
                        🗑 ลบบิลบริษัท — ลูกค้าไม่เอาใบกำกับแล้ว
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* 🧾 ลูกค้าขอใบกำกับภาษีทีหลัง — ใส่ข้อมูลผู้ซื้อได้ที่นี่ (คู่กับปุ่ม "เปิด VAT 7%" ในกล่องยอดเงิน) */}
              {mayEdit && !order.flowAccount && !order.taxInvoice && !taxForm && order.status !== "ยกเลิก" && (
                <button
                  type="button"
                  onClick={() => setTaxForm({ company: order.customer, taxId: "", branch: "", address: order.address, docUrl: "" })}
                  className="mt-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 transition hover:bg-sky-50 hover:text-sky-700"
                >
                  🧾 ใส่ข้อมูลใบกำกับภาษี
                </button>
              )}
              {taxForm && (
                <div className="mt-2 rounded-lg border border-dashed border-sky-300 bg-sky-50/60 p-2.5 text-xs">
                  <p className="font-bold text-sky-800">🧾 ข้อมูลใบกำกับภาษี (ขึ้นใบงาน/ใบเสร็จ)</p>
                  {/* วางลิงก์แชร์ FlowAccount แทนการพิมพ์ — ดึงชื่อ/เลขผู้เสียภาษี/สาขา/ที่อยู่ให้เอง (ไม่สร้างออเดอร์ใหม่) */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      value={taxForm.docUrl}
                      onChange={(e) => setTaxForm({ ...taxForm, docUrl: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void fetchTaxFromFlowAccount();
                        }
                      }}
                      placeholder="วางลิงก์แชร์ FlowAccount (share.flowaccount.com/…) แล้วกดดึงข้อมูล"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-sky-300 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={fetchTaxFromFlowAccount}
                      disabled={taxFetching || !taxForm.docUrl.trim()}
                      className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {taxFetching ? "⏳ กำลังอ่าน…" : "📄 ดึงข้อมูล"}
                    </button>
                  </div>
                  {taxForm.docNo && (
                    <p className="mt-1 text-[11px] font-semibold text-sky-700">
                      ✓ อ่านจาก {taxForm.docTypeLabel ?? "เอกสาร"} {taxForm.docNo} แล้ว — ตรวจข้อมูลด้านล่างก่อนบันทึก
                    </p>
                  )}
                  {/* 📋 รายการในเอกสาร — ใบงานว่างเปล่ากราฟฟิกทำงานต่อไม่ได้ ต้องดึงมาพร้อมข้อมูลผู้ซื้อ */}
                  {!!taxForm.docItems?.length && (
                    <div className="mt-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-sky-200">
                      <label className="flex items-start gap-2 text-[11px] font-bold text-sky-900">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0"
                          checked={!!taxForm.applyDocItems}
                          onChange={(e) => setTaxForm({ ...taxForm, applyDocItems: e.target.checked })}
                        />
                        <span>
                          ดึงรายการในเอกสารมาใส่ใบงานด้วย ({taxForm.docItems.length} รายการ
                          {taxForm.docShip != null ? ` · ค่าส่ง ${formatPrice(taxForm.docShip)}` : ""}
                          {(taxForm.docDiscount ?? 0) > 0 ? ` · ส่วนลด ${formatPrice(taxForm.docDiscount!)}` : ""}
                          {(taxForm.docVat ?? 0) > 0 ? ` · VAT ${formatPrice(taxForm.docVat!)}` : ""}
                          {(taxForm.docWht ?? 0) > 0 ? ` · หัก ณ ที่จ่าย ${formatPrice(taxForm.docWht!)}` : ""})
                          {order.items.length > 0 && (
                            <span className="font-extrabold text-rose-700"> — ทับรายการเดิม {order.items.length} รายการ</span>
                          )}
                        </span>
                      </label>
                      <ul className="mt-1 space-y-0.5 pl-6 text-[11px] text-slate-600">
                        {taxForm.docItems.map((it, i) => (
                          <li key={i} className="truncate">
                            {it.name} <span className="tabular-nums text-slate-500">×{it.qty} @ {formatPrice(it.unitPrice)}</span>
                          </li>
                        ))}
                      </ul>
                      {taxForm.docGrandTotal != null && (
                        <p className="mt-1 pl-6 text-[11px] font-semibold tabular-nums text-slate-500">
                          ยอดตามเอกสาร {formatPrice(taxForm.docGrandTotal)}
                          {(taxForm.docNet ?? 0) > 0 && (taxForm.docWht ?? 0) > 0 ? ` · โอนจริง ${formatPrice(taxForm.docNet!)}` : ""}
                        </p>
                      )}
                      {/* ภาษีไปพร้อมรายการเสมอ — รายการฉบับใหม่ + VAT ฉบับเก่า = ยอดไม่ตรงบิลทั้งสองใบ (OD-260915-1705) */}
                      {!!taxForm.applyDocItems && ((taxForm.docVat ?? 0) > 0 || (taxForm.docWht ?? 0) > 0) && (
                        <p className="mt-1 pl-6 text-[11px] font-semibold leading-snug text-sky-700">
                          VAT / หัก ณ ที่จ่าย จะถูกตั้งตามเอกสารฉบับนี้ด้วย
                          {order.vat && Math.abs((order.vat.amount ?? 0) - (taxForm.docVat ?? 0)) >= 0.01
                            ? ` (ของเดิม VAT ${formatPrice(order.vat.amount)} → ${formatPrice(taxForm.docVat ?? 0)})`
                            : ""}
                        </p>
                      )}
                    </div>
                  )}
                  {taxForm.docNo && !taxForm.docItems?.length && (
                    <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                      เอกสารนี้ไม่มีรายการสินค้า (ใบมัดจำ/ใบวางบิลมักเป็นแบบนี้) — ใส่รายการในใบงานเองด้านล่าง
                    </p>
                  )}
                  {taxForm.docVat != null && taxForm.docVat > 0 && !order.vat && (
                    <label className="mt-1.5 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                      <input type="checkbox" checked={!!taxForm.applyDocVat} onChange={(e) => setTaxForm({ ...taxForm, applyDocVat: e.target.checked })} />
                      เอกสารมี VAT {taxForm.docVatRate ?? 7}% = {formatPrice(taxForm.docVat)} — เปิด VAT ตามเอกสารพร้อมกัน (ยอดค้างขึ้น + แจ้งลูกค้าทางไลน์)
                    </label>
                  )}
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <input value={taxForm.company} onChange={(e) => setTaxForm({ ...taxForm, company: e.target.value })} placeholder="ชื่อบริษัท / ผู้ซื้อ *" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-sky-300 focus:outline-none sm:col-span-2" />
                    <input value={taxForm.taxId} onChange={(e) => setTaxForm({ ...taxForm, taxId: e.target.value })} placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-sky-300 focus:outline-none" />
                    <input value={taxForm.branch} onChange={(e) => setTaxForm({ ...taxForm, branch: e.target.value })} placeholder="สาขา เช่น สำนักงานใหญ่" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-sky-300 focus:outline-none" />
                    <textarea value={taxForm.address} onChange={(e) => setTaxForm({ ...taxForm, address: e.target.value })} placeholder="ที่อยู่ตามใบกำกับภาษี" rows={2} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-sky-300 focus:outline-none sm:col-span-2" />
                  </div>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button type="button" onClick={() => setTaxForm(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">ยกเลิก</button>
                    <button type="button" onClick={saveTaxInvoice} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700">บันทึก</button>
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {order.dealer && (
                  <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700 ring-1 ring-teal-200">
                    🤝 ตัวแทนจำหน่าย — ราคาเรทตัวแทน (ไม่มีส่วนลด/คูปอง/โอนไว/ของแถม)
                  </span>
                )}
                {/*
                  🤝 ตัวแทนลืมล็อกอินแล้วสั่ง = เว็บไม่รู้ว่าเป็นตัวแทน คิดราคาปลีกให้ (OD-260915-3447)
                  ปุ่มนี้คิดราคาใหม่ทั้งใบตามเรทตัวแทน + ถอดส่วนลดที่ตัวแทนไม่ได้ ในคลิกเดียว
                  โชว์เฉพาะใบที่ยังแก้ยอดได้ (ยังไม่มีเงินเข้า/ยังไม่เลยขั้นเก็บเงิน — เซิร์ฟเวอร์บังคับซ้ำ)
                */}
                {mayEdit && seesMoney && dealerToggleReady && (
                  <button
                    type="button"
                    onClick={() => setDealerPrice(!order.dealer)}
                    disabled={dealerBusy}
                    className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-bold text-teal-700 transition hover:bg-teal-50 disabled:opacity-50"
                  >
                    {dealerBusy ? "กำลังคิดราคา…" : order.dealer ? "ถอดราคาตัวแทน" : "🤝 คิดราคาตัวแทน"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GH t="indigo">🎨 งานแบบ · {order.items.length} รายการ</GH>
            {order.items.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const anyOpen = order.items.some((it, i) => itemOpen[i] ?? autoOpen(it));
                  const next: Record<number, boolean> = {};
                  order.items.forEach((_, i) => (next[i] = !anyOpen));
                  setItemOpen(next);
                }}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50"
              >
                {order.items.some((it, i) => itemOpen[i] ?? autoOpen(it)) ? "▴ ยุบทุกรายการ" : "▾ กางทุกรายการ"}
              </button>
            )}
          </div>
          {/* โชว์เฉพาะ "รอตรวจสอบ" (ลูกค้าแจ้งโอนแล้ว รอตรวจสลิป) — ตอน "รอชำระเงิน" ยังไม่ต้องเตือน
              ตัวล็อกอัปโหลดแบบยังคุมทุกสถานะที่ยังไม่จ่ายเหมือนเดิม (มีป้าย+ปุ่มปลดล็อกที่รายการ) */}
          {order.status === "รอตรวจสอบ" && (
            <div className="mt-2 rounded-xl bg-yellow-50 p-3 ring-1 ring-yellow-200">
              <p className="text-xs font-bold text-yellow-800">
                ⚠️ ยังไม่ยืนยันการชำระเงิน (สถานะ “{order.status}”)
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-yellow-700">
                ล็อกการอัปโหลดแบบไว้ก่อน กันทำงานฟรีถ้าลูกค้าไม่โอน — ตรวจสลิปแล้วเปลี่ยนสถานะเป็น “ชำระแล้ว” ก่อน
              </p>
              <button
                type="button"
                onClick={() => setOverrideLock((v) => !v)}
                className="mt-2 rounded-lg border border-yellow-300 bg-white px-3 py-1.5 text-[11px] font-bold text-yellow-800 hover:bg-yellow-50"
              >
                {overrideLock ? "✓ ปลดล็อกแล้ว — กดเพื่อล็อกกลับ" : "ทำแบบก่อนได้ (ลูกค้าประจำ)"}
              </button>
            </div>
          )}
          {/* ปุ่มสลับเข้าโหมดแพ็ค (เฉพาะคนที่มีสิทธิ์ตรวจแพ็ค) — งานแพ็คแยกไปหน้าโหมดแพ็ค ไม่ปนหน้านี้ */}
          {can("pack.check") && (
            <button
              type="button"
              onClick={() => setPackMode(true)}
              className={`mt-3 flex w-full items-center justify-between rounded-xl p-3 text-left ring-1 transition ${
                gate.ready ? "bg-green-50 ring-green-200 hover:bg-green-100" : "bg-slate-50 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              <span className={`text-xs font-bold ${gate.ready ? "text-green-800" : "text-slate-700"}`}>
                📦 {gate.ready ? "ตรวจแพ็คครบแล้ว — พร้อมยิงเลขพัสดุ" : "เข้าโหมดแพ็ค (ตรวจนับ/ยืนยันอ่าน)"}
              </span>
              <span className="text-slate-400">›</span>
            </button>
          )}

          {err && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-200">
              ⚠️ {err}
            </p>
          )}
          {/* หัวตาราง (จอกว้างพอจะเรียงคอลัมน์เดียวกันได้) — อ่านรายการแบบใบสั่งงาน
              ซ่อนต่ำกว่า xl เพราะแถวข้างล่างจะพับคอลัมน์ตัวเลขลงบรรทัดใหม่ หัวตารางจะไม่ตรงกัน */}
          <div className="mt-3 hidden items-center gap-3 px-4 text-[11px] font-bold uppercase tracking-wide text-slate-400 xl:flex">
            <span className="w-6 shrink-0 text-center">#</span>
            <span className="w-20 shrink-0 text-center">รูป</span>
            <span className="min-w-0 flex-1">ชื่อสินค้า / รายละเอียด</span>
            <span className="w-24 shrink-0 text-center">จำนวน</span>
            {seesMoney && <span className="w-28 shrink-0 text-right">ราคา/หน่วย</span>}
            {seesMoney && <span className="w-24 shrink-0 text-right">ยอดรวม</span>}
          </div>
          <div className="mt-1.5 space-y-4">
            {order.items.map((it, i) => {
              const proofs = proofsOf(it);
              // เทียบจำนวนบนแบบกับที่ลูกค้าสั่ง — คูณ "กี่ชิ้นต่อหน่วย" ให้แล้ว (สั่ง 12 เซ็ต × 20 ใบ = 240 ใบ)
              const qc = proofQtyCheck(it, proofs);
              const open = itemOpen[i] ?? autoOpen(it);
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
                    <span
                      className={`shrink-0 whitespace-nowrap text-xs font-extrabold ${i % 2 === 0 ? "text-indigo-800" : "text-sky-800"}`}
                    >
                      รายการที่ {i + 1} / {order.items.length}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-400">{it.name}</span>
                      {mayEdit && (
                        <button
                          type="button"
                          title="ลบรายการนี้ออกจากออเดอร์ (ระบบลงประวัติทุกครั้ง)"
                          onClick={async () => {
                            const lost = it.qty * it.unitPrice - itemDiscountAmount(it);
                            const ok = await askConfirm({
                              icon: "🗑",
                              title: `ลบ “${it.name}” ออกจากออเดอร์?`,
                              detail: [
                                `⚠️ ยอดออเดอร์จะลดลง ${formatPrice(lost)} (เหลือ ${order.items.length - 1} รายการ)`,
                                proofsOf(it).length ? `⚠️ แบบงาน ${proofsOf(it).length} รูปของรายการนี้จะหายจากหน้าลูกค้าด้วย` : "",
                                (it.artworkUrls?.length ?? 0) ? `⚠️ ลายที่ลูกค้าแนบ ${it.artworkUrls!.length} รูปจะไม่แสดงในออเดอร์นี้อีก (ไฟล์ยังอยู่ในคลัง)` : "",
                                "📝 ระบบจะบันทึกในประวัติว่าใครลบ ลบอะไร และยอดลดลงเท่าไร",
                              ]
                                .filter(Boolean)
                                .join("\n"),
                              confirmLabel: "ลบรายการนี้",
                              danger: true,
                            });
                            if (ok) removeItemFromOrder(i);
                          }}
                          className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          🗑 ลบรายการ
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="p-4">
                  {/* แถวรายการ — อ่านเป็นตาราง: # · รูป · รายละเอียด · จำนวน · ราคา/หน่วย · ยอดรวม
                      พับได้: คอลัมน์ตัวเลขกินที่ 256px ถ้าเบียดจนช่องรายละเอียดแคบกว่า 16rem
                      มันจะตกลงบรรทัดใหม่ ให้รายละเอียดงานได้กว้างเต็มแถว (เดิมเหลือ 135px
                      บนจอ 1280 ข้อความหักบรรทัดทีละ 2-3 คำจนอ่านไม่รู้เรื่อง) */}
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setItemOpen((cur) => ({ ...cur, [i]: !open }))}
                      title={open ? "ยุบรายการนี้" : "กางรายการนี้"}
                      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100"
                    >
                      {i + 1}
                    </button>
                    {/* รูปตัวอย่างในแถว — กดเพื่อกาง แล้วจัดการรูปทั้งหมดด้านล่าง */}
                    {(() => {
                      const cover = proofs[proofs.length - 1]?.url ?? it.artworkUrls?.[0];
                      // ไม่ต้องทำแบบ + ไม่มีรูป = ไม่ต้องโชว์กรอบรูปเปล่า ๆ (เลขรายการยังกด กาง/ยุบ ได้)
                      if (!cover && it.noProof) return null;
                      // ยังไม่มีทั้งแบบและลายลูกค้า → ใช้ภาพสินค้าแทนกรอบเปล่า จะได้รู้ว่ารายการนี้คือสินค้าอะไร
                      // (เจ้าของร้านสั่ง 17 ก.ย. 69 · OD-260917-6158) · รายการพิเศษ = สินค้าที่ร้านจับคู่ไว้ในคลังสินค้าพิเศษ
                      const prodPic = cover ? undefined : productOfItem(picProductIdOf(it) ?? "");
                      const prodSrc = prodPic?.imageSrc ? versionedSrc(prodPic.imageSrc, imgVersion(prodPic.savedAt)) : undefined;
                      return (
                        <button
                          type="button"
                          onClick={() => setItemOpen((cur) => ({ ...cur, [i]: !open }))}
                          className="w-20 shrink-0 text-left"
                          title={open ? "ยุบรายการนี้" : "กางเพื่อจัดการรูป"}
                        >
                          {cover ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={cover} alt={it.name} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                          ) : prodSrc ? (
                            <ProductVisual
                              emoji={prodPic!.emoji}
                              gradient={prodPic!.gradient}
                              src={prodSrc}
                              alt={it.name}
                              sizes="80px"
                              className="h-20 w-20 rounded-lg ring-1 ring-slate-200"
                            />
                          ) : (
                            <span className="grid h-20 w-20 place-items-center rounded-lg bg-slate-50 text-xl text-slate-300 ring-1 ring-slate-200">
                              🖼️
                            </span>
                          )}
                          <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">
                            {proofs.length ? `🖼 แบบ ${proofs.length}` : it.noProof ? "ไม่ต้องทำแบบ" : prodSrc ? "ภาพสินค้า · ยังไม่มีแบบ" : "ยังไม่มีแบบ"}
                            {(it.artworkUrls?.length ?? 0) > 0 ? ` · 🎨 ลาย ${it.artworkUrls!.length}` : ""}
                          </span>
                        </button>
                      );
                    })()}
                    <div className="min-w-0 flex-1 basis-64">
                      <button
                        type="button"
                        onClick={() => setItemOpen((cur) => ({ ...cur, [i]: !open }))}
                        className="text-left text-sm font-bold text-slate-800 hover:text-indigo-700"
                      >
                        {it.name} <span className="text-xs font-normal text-slate-400">{open ? "▴" : "▾"}</span>
                      </button>
                      {/* ♻️ ป้ายใช้ไฟล์เก่า — ข้างชื่อสินค้า เห็นตั้งแต่ยังไม่กางการ์ด · เลขออเดอร์เดิมกดเปิดใบเดิมในแท็บใหม่ */}
                      {it.reuseArt && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-bold text-amber-800 ring-1 ring-amber-300"
                          title={`${reuseArtText(it.reuseArt)} · ${it.reuseArt.by} ${shortTime(it.reuseArt.at)}`}
                        >
                          ♻️ ใช้ไฟล์เก่า
                          {it.reuseArt.fromOrderId ? (
                            <a
                              href={`/admin/orders/${encodeURIComponent(it.reuseArt.fromOrderId)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                            >
                              {it.reuseArt.fromOrderId}
                            </a>
                          ) : (
                            <span className="font-semibold">(ลูกค้าแจ้ง)</span>
                          )}
                          {it.reuseArt.note && <span className="max-w-[14rem] truncate font-semibold">· {it.reuseArt.note}</span>}
                        </span>
                      )}
                      {editSel === i ? (
                        // ✏️ ช่องแก้ชื่อ + รายละเอียด (เจ้าของร้านสั่ง 11 ก.ย. 69 ให้แก้หัวข้อรายการได้ — OD-260911-5586)
                        //    บันทึกเมื่อโฟกัสออกจากทั้งกล่อง (สลับระหว่างช่องชื่อ↔รายละเอียดยังไม่บันทึก) · Cmd/Ctrl+Enter = บันทึก · Esc = ยกเลิก
                        <div
                          className="mt-1 space-y-1"
                          onBlur={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                            saveSelections(i, selDraft, nameDraft);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditSel(null);
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveSelections(i, selDraft, nameDraft);
                          }}
                        >
                          <input
                            autoFocus
                            type="text"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                saveSelections(i, selDraft, nameDraft);
                              }
                            }}
                            placeholder={it.name}
                            aria-label="ชื่อรายการ"
                            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
                          />
                          <textarea
                            value={selDraft}
                            onChange={(e) => setSelDraft(e.target.value)}
                            rows={4}
                            placeholder="รายละเอียดงาน เช่น ขนาด · สี · ตำแหน่งลาย"
                            className="w-full resize-y rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[11px] leading-snug text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                          />
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            ช่องบน = ชื่อรายการ (ว่าง = คงชื่อเดิม) · รายละเอียดบรรทัดละหัวข้อ “หัวข้อ: ค่า” · คลิกนอกช่องเพื่อบันทึก · Esc = ยกเลิก · ระบบลงประวัติว่าใครแก้
                          </p>
                        </div>
                      ) : (
                        <div className={`mt-0.5 text-[11px] leading-snug text-slate-500 ${open ? "" : "line-clamp-2"}`}>
                          {/* 🎨 จอกราฟฟิก — ซ่อนเรทราคา + งานสแตนดี้ยุบบรรทัด (production) · หน้าลูกค้ายังบรรทัดละหัวข้อ */}
                          <SelDetails sel={it.sel} text={it.selections} workSize={productOfItem(it.productId)?.workSize} production />
                          {mayEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelDraft(selectionsDraft(it));
                                setNameDraft(it.name);
                                setEditSel(i);
                                setItemOpen((cur) => ({ ...cur, [i]: true }));
                              }}
                              title="แก้ชื่อ/รายละเอียดของรายการนี้ (จำนวนแก้ที่ช่องจำนวน · ราคาแก้ที่ช่องราคา)"
                              className="mt-0.5 whitespace-nowrap rounded px-1 text-[10px] font-bold text-amber-600 transition hover:bg-amber-50"
                            >
                              ✏️ แก้ชื่อ/รายละเอียด
                            </button>
                          )}
                          {/* 🛠 แก้ตัวเลือก — เจ้าของร้านเลือกให้อยู่ตรงนี้ข้าง "แก้รายละเอียด" (10 ก.ย. 69) · เฉพาะรายการที่หยิบจากหน้าร้าน
                              (มีสินค้าจริง + ตัวเลือกแบบหัวข้อ) รายการที่กรอกชื่อ/ราคาเองไม่มีปุ่มนี้ · เปิดหน้าสินค้าพร้อมตัวเลือก/จำนวน/ลายเดิม
                              เหมือนปุ่มแก้ไขในตะกร้า แก้แล้วกดสั่ง ระบบแทนที่รายการนี้ให้ */}
                          {mayEdit && isShopLine(productOfItem(it.productId), it) && mayChangeQty(it) && (
                            <button
                              type="button"
                              onClick={() => editItemOptionsInShop(i)}
                              title="เปิดหน้าสินค้าพร้อมตัวเลือก/จำนวน/ลายเดิม (เหมือนปุ่มแก้ไขในตะกร้า) — แก้แล้วกดสั่ง ระบบจะแทนที่รายการนี้ให้ แบบงาน/หมายเหตุย้ายตามไป"
                              className="ml-1 mt-0.5 whitespace-nowrap rounded px-1 text-[10px] font-bold text-sky-600 transition hover:bg-sky-50"
                            >
                              🛠 แก้ตัวเลือก (หน้าร้าน)
                            </button>
                          )}
                        </div>
                      )}
                      {/* 📐 จำนวนชิ้นรวมของรายการนี้ — งานที่ขายเป็นแผ่น/เซ็ต จำนวนที่สั่งไม่ใช่จำนวนชิ้น
                          กราฟฟิกขอให้บอกยอดรวมมาให้เลย จะได้ไม่ต้องคูณเอง (เจ้าของร้านแจ้ง 14 ก.ย. 69)
                          อยู่นอกกล่องสเปคที่ line-clamp เพื่อให้เห็นทั้งตอนยุบและตอนกาง */}
                      <ItemPiecesChip
                        item={it}
                        product={productOfItem(it.productId)}
                        onSetPerUnit={mayProof || mayEdit ? (per) => setItemPerUnit(i, per) : undefined}
                      />
                      {/* 📝 ที่มาของราคาที่แอดมินตีไว้ (ลูกค้าเห็นด้วย) — กดเพื่อเปิดแผงตีราคาไปแก้ */}
                      {it.quoteNote && seesMoney && (
                        <button
                          type="button"
                          disabled={!mayQuote(it)}
                          onClick={() => {
                            setPriceDraft(it.unitPrice > 0 ? String(it.unitPrice) : "");
                            setEditPrice(i);
                          }}
                          title={mayQuote(it) ? "กดเพื่อแก้ที่มาของราคา" : "ลูกค้าโอนแล้ว — แก้ไม่ได้"}
                          className="mt-1 block w-full rounded-lg bg-indigo-50 px-2 py-1 text-left text-[11px] font-semibold leading-snug text-indigo-800 ring-1 ring-indigo-200 transition enabled:hover:bg-indigo-100"
                        >
                          <span className="text-[10px] font-bold text-indigo-500">📝 ที่มาของราคา (ลูกค้าเห็น)</span>
                          <span className="block whitespace-pre-line">{it.quoteNote}</span>
                        </button>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {it.proofStatus ? `แบบ: ${it.proofStatus === "รอตรวจ" ? "รอลูกค้าตรวจ" : it.proofStatus === "อนุมัติ" ? "ลูกค้าอนุมัติแล้ว" : "ลูกค้าขอแก้ไข"}` : it.noProof ? "แบบ: ไม่ต้องทำแบบ" : "แบบ: รอกราฟฟิกทำแบบ"}
                        {proofs.length > 0 ? ` · ${proofs.length} แบบ` : ""}
                        {(it.artworkUrls?.length ?? 0) > 0 ? ` · 🎨 ภาพลาย ${it.artworkUrls!.length}` : ""}
                        {it.reuseArt ? ` · ♻️ ${reuseArtText(it.reuseArt)}` : ""}
                        {noteHasText(it.adminNote) ? " · 📝 มีหมายเหตุ" : ""}
                        {it.needStockCheck ? " · 📦 รอเช็คสต๊อก" : ""}
                      </p>
                    </div>
                    {/* จำนวน · ราคา/หน่วย · ยอดรวม — มัดไว้ด้วยกัน จะพับลงบรรทัดใหม่ทั้งชุด ไม่แตกกลางทาง */}
                    <span className="ml-auto flex shrink-0 items-start gap-3">
                    {/* 🔢 จำนวน — แก้ได้เหมือนตะกร้า: [−] ช่องพิมพ์ [+] · ราคาขั้นบันได/เรทคิดใหม่ให้เอง (ดู changeItemQty) */}
                    {(() => {
                      const prod = productOfItem(it.productId);
                      const areaLocked = qtyLockedByArea(prod, it);
                      const editable = mayChangeQty(it) && !areaLocked;
                      if (!editable) {
                        return (
                          <span
                            className="w-24 shrink-0 text-center text-sm font-semibold text-slate-700"
                            title={
                              areaLocked
                                ? "สินค้าคิดตามพื้นที่ — จำนวนล็อกตามขนาดที่กรอกไว้ตอนสั่ง (แก้ขนาดผ่าน “แก้ตัวเลือก” แทน)"
                                : mayEdit && it.unitPrice > 0
                                  ? "ลูกค้าโอนเงินเข้ามาแล้ว — แก้จำนวนไม่ได้ กันยอดในบิลไม่ตรงกับสลิป (ถ้าต้องแก้จริง ลบรายการแล้วเพิ่มใหม่)"
                                  : undefined
                            }
                          >
                            {it.qty.toLocaleString("th-TH")}
                          </span>
                        );
                      }
                      const draft = qtyDraft[i];
                      const commit = () => {
                        if (draft === undefined) return;
                        setQtyDraft((cur) => {
                          const n = { ...cur };
                          delete n[i];
                          return n;
                        });
                        const v = Math.floor(Number(draft));
                        if (Number.isFinite(v) && v >= 1 && v !== it.qty) changeItemQty(i, v);
                      };
                      const shopLine = isShopLine(prod, it);
                      return (
                        <span
                          className="flex w-24 shrink-0 items-center justify-center gap-0.5"
                          title={
                            shopLine
                              ? "แก้จำนวนแล้วระบบคิดราคาขั้นบันได/เรทให้ใหม่เหมือนตะกร้า (ลงประวัติทุกครั้ง)"
                              : it.quoteNote
                                ? "แก้จำนวน — คงราคา/หน่วยที่ตีไว้ (ลงประวัติทุกครั้ง)"
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
                            value={draft ?? String(it.qty)}
                            onChange={(e) => setQtyDraft((cur) => ({ ...cur, [i]: e.target.value }))}
                            onBlur={commit}
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
                      );
                    })()}
                    <span className={`w-28 shrink-0 text-right text-sm font-bold text-slate-900 ${seesMoney ? "" : "hidden"}`}>
                      {/* ราคา/หน่วย — กดที่ตัวเลข (หรือป้าย "รอตีราคา") เพื่อตีราคา · Enter บันทึก · Esc ยกเลิก */}
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
                            onBlur={(e) => {
                              /**
                               * ย้ายโฟกัสไปช่องในแผงช่วยตีราคา (เช่น "ที่มาของราคา") = ยังตีราคาไม่เสร็จ
                               * ห้ามบันทึก+ปิดแผงตรงนี้ ไม่งั้นแผงหายทันทีที่คลิกช่องนั้น (พิมพ์ไม่ได้เลย)
                               */
                              const to = e.relatedTarget as HTMLElement | null;
                              if (to?.closest("[data-quote-panel]")) return;
                              saveQuote(i, { price: priceDraft });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditPrice(null);
                              if (e.key === "Enter") saveQuote(i, { price: priceDraft });
                            }}
                            placeholder="0"
                            title="ราคาต่อ 1 หน่วย (ไม่ใช่ยอดรวม) — ระบบคูณจำนวนให้เอง"
                            className="w-20 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-right text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                          />
                        </span>
                      ) : it.unitPrice > 0 ? (
                        mayQuote(it) ? (
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
                          <span
                            title={
                              order.claimOf
                                ? "งานเคลม — ไม่คิดเงิน"
                                : "ลูกค้าโอนเงินเข้ามาแล้ว — แก้ราคาไม่ได้ กันยอดในบิลไม่ตรงกับสลิป (ถ้าต้องแก้จริง ลบรายการแล้วเพิ่มใหม่)"
                            }
                          >
                            {formatPrice(it.unitPrice)}
                          </span>
                        )
                      ) : order.claimOf ? (
                        // งานเคลมตั้งใจให้ ฿0 อยู่แล้ว — อย่าให้ขึ้น "รอตีราคา" จนทีมงานนึกว่าต้องไปตั้งราคา
                        <span className="text-[11px] font-bold text-emerald-600">เคลม · ฟรี</span>
                      ) : mayQuote(it) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPriceDraft("");
                            setEditPrice(i);
                          }}
                          title="กดเพื่อตีราคา — ใส่ราคาต่อ 1 หน่วย แล้วกด Enter (ลูกค้าจะเปิดหน้าแจ้งโอนได้เมื่อตีราคาครบทุกรายการ)"
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-300 transition hover:bg-amber-100"
                        >
                          💬 รอตีราคา · กดใส่ราคา
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-600">รอตีราคา</span>
                      )}
                      {/* ส่วนลดเฉพาะรายการนี้ — เลือกได้ทั้งบาทและ % (บันทึกตอนออกจากช่อง พร้อมลง log) */}
                      {mayEdit && seesMoney && (discOpen[i] || itemDiscountAmount(it) > 0) ? (
                        <span className="mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold text-rose-500">
                          ลด
                          <input
                            type="number"
                            min={0}
                            value={it.discountPct !== undefined ? (it.discountPct || "") : (it.discount ?? "")}
                            placeholder="0"
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              const isPct = it.discountPct !== undefined;
                              setOrder((cur) =>
                                cur
                                  ? {
                                      ...cur,
                                      items: cur.items.map((x, j) =>
                                        j === i
                                          ? isPct
                                            ? { ...x, discountPct: Math.min(100, v), discount: undefined }
                                            : { ...x, discount: v > 0 ? v : undefined, discountPct: undefined }
                                          : x
                                      ),
                                    }
                                  : cur
                              );
                            }}
                            onFocus={(e) => (e.currentTarget.dataset.orig = String(itemDiscountAmount(it)))}
                            onBlur={(e) => {
                              const orig = Number(e.currentTarget.dataset.orig || 0);
                              const now = itemDiscountAmount(it);
                              if (orig === now) return;
                              const pct = (it.discountPct ?? 0) > 0 ? ` (${it.discountPct}%)` : "";
                              const next = withLog(order, actor, "ส่วนลดรายการ", `${it.name}: −${formatPrice(now)}${pct}`);
                              applyOrder(next);
                            }}
                            className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] font-semibold text-rose-600 focus:border-amber-300 focus:outline-none"
                          />
                          <select
                            value={it.discountPct !== undefined ? "pct" : "baht"}
                            onChange={(e) => {
                              const toPct = e.target.value === "pct";
                              // สลับหน่วย — ย้ายตัวเลขเดิมไปหน่วยใหม่ (แล้วบันทึก)
                              const cur = it.discountPct !== undefined ? it.discountPct : (it.discount ?? 0);
                              const next = withLog(
                                {
                                  ...order,
                                  items: order.items.map((x, j) =>
                                    j === i
                                      ? toPct
                                        ? { ...x, discountPct: Math.min(100, cur), discount: undefined }
                                        : { ...x, discount: cur > 0 ? cur : undefined, discountPct: undefined }
                                      : x
                                  ),
                                },
                                actor,
                                "ส่วนลดรายการ",
                                `${it.name}: สลับหน่วยเป็น ${toPct ? "%" : "บาท"}`
                              );
                              applyOrder(next);
                            }}
                            className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-semibold text-rose-600 focus:border-amber-300 focus:outline-none"
                          >
                            <option value="baht">฿</option>
                            <option value="pct">%</option>
                          </select>
                          {(it.discountPct ?? 0) > 0 && itemDiscountAmount(it) > 0 && (
                            <span className="text-slate-400">= −{formatPrice(itemDiscountAmount(it))}</span>
                          )}
                        </span>
                      ) : itemDiscountAmount(it) > 0 && seesMoney ? (
                        <span className="mt-0.5 block text-[11px] font-semibold text-rose-500">
                          ลด{(it.discountPct ?? 0) > 0 ? ` ${it.discountPct}%` : ""} −{formatPrice(itemDiscountAmount(it))}
                        </span>
                      ) : null}
                    </span>
                    <span className={`w-24 shrink-0 text-right ${seesMoney ? "" : "hidden"}`}>
                      <span className="block text-sm font-extrabold text-slate-900">
                        {formatPrice(it.qty * it.unitPrice - itemDiscountAmount(it))}
                      </span>
                      {itemDiscountAmount(it) > 0 ? (
                        <span className="mt-0.5 block text-[10px] font-bold text-rose-500">
                          ลดแล้ว −{formatPrice(itemDiscountAmount(it))}
                        </span>
                      ) : mayEdit && seesMoney && !discOpen[i] ? (
                        <button
                          type="button"
                          onClick={() => setDiscOpen((cur) => ({ ...cur, [i]: true }))}
                          title="ใส่ส่วนลดเฉพาะรายการนี้"
                          className="mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
                        >
                          ＋ ใส่ส่วนลด
                        </button>
                      ) : null}
                    </span>
                    </span>
                  </div>

                  {/* 💬 แผงช่วยตีราคา — กางเต็มความกว้างใต้แถว (ช่องราคาแคบเกินจะยัดตาราง) */}
                  {editPrice === i && (
                    <QuotePanel
                      item={it}
                      onPick={(p) => setPriceDraft(String(p))}
                      /* ออกจากช่อง = เก็บที่มาของราคาไว้ก่อน แต่ยังไม่ปิดแผง (ยังตีราคาไม่เสร็จ) */
                      onNote={mayEdit ? (t) => saveQuote(i, { note: t, close: false }) : undefined}
                      /* ปุ่ม ✓ = เก็บราคา + ที่มา ในครั้งเดียว แล้วปิดแผง */
                      onDone={mayEdit ? (t) => saveQuote(i, { price: priceDraft, note: t }) : undefined}
                    />
                  )}

                  {open && (
                    <>
                  {/* ยืนยันอ่านของกราฟฟิก (การยืนยันของแพ็คอยู่ในโหมดแพ็ค) — รายละเอียดงานอยู่บนแถวด้านบนแล้ว */}

                  {/* 📦 สั่งจำนวนมาก — ต้องเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้าก่อนเริ่มงาน */}
                  {it.needStockCheck && (
                    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
                      <p className="text-xs font-bold text-amber-800">
                        📦 สั่งจำนวนมาก ({itemQtyText(it, productOfItem(it.productId))}) — เช็คสต๊อก/คิวผลิตก่อนเริ่มงาน
                      </p>
                      {mayEdit && (
                        <button
                          type="button"
                          onClick={() => confirmStock(i)}
                          className="mt-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-600"
                        >
                          ✅ ยืนยันของพอ/ผลิตได้ — แจ้งลูกค้า
                        </button>
                      )}
                    </div>
                  )}

                  {mayProof && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleGraphicAck(i)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          it.graphicAck
                            ? "bg-violet-600 text-white hover:bg-violet-700"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-700"
                        }`}
                      >
                        {it.graphicAck ? "✅ กราฟฟิกอ่านรายละเอียดแล้ว" : "☐ ยืนยันว่าอ่านรายละเอียดแล้ว (กราฟฟิก)"}
                      </button>
                      {it.graphicAck && (
                        <span className="text-[10px] text-slate-400">
                          {it.graphicAck.by} · {shortTime(it.graphicAck.at)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSampleRequired(i)}
                        title="ติ๊กเฉพาะเมื่อมี “ชิ้นงานตัวอย่างของจริง” ต้องใส่กล่องไปให้ลูกค้า — ไม่ใช่การขึ้นแบบ/ขึ้นตัวอย่างในไฟล์ · ติ๊กแล้วฝ่ายแพ็คจะยิงเลขพัสดุไม่ได้จนกว่าจะยืนยันว่าใส่กล่องแล้ว"
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          it.sampleRequired
                            ? "bg-amber-500 text-white hover:bg-amber-600"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-700"
                        }`}
                      >
                        {it.sampleRequired ? "🎁 มีชิ้นงานตัวอย่าง (ของจริง) ต้องใส่กล่อง" : "☐ มีชิ้นงานตัวอย่าง (ของจริง) ส่งให้ลูกค้า"}
                      </button>
                      {it.sampleRequired && (
                        <span className="text-[10px] text-slate-400">
                          {it.sampleRequired.by} · {shortTime(it.sampleRequired.at)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ยอดโอนเพิ่ม/ค่าบริการที่ไม่มีชิ้นงานให้ออกแบบ — ติ๊กแล้วรายการจะไม่ค้างเป็น "รอกราฟฟิกทำแบบ" · แนบภาพได้ถ้าอยาก */}
                  {(mayProof || mayEdit) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleNoProof(i)}
                        title="ติ๊กเมื่อรายการนี้เป็นยอดโอนเพิ่ม/ค่าบริการ (ค่าตัดไฟล์, เพิ่มขนาด, คละลายเพิ่ม, ซื้อตะขอ ฯลฯ) — จะไม่ขึ้นคิวกราฟฟิก ไม่ติดป้ายยังไม่มีแบบในใบงาน · แนบภาพประกอบได้ถ้าอยาก"
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          it.noProof
                            ? "bg-slate-600 text-white hover:bg-slate-700"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {it.noProof ? "🚫 ไม่ต้องทำแบบ (ยอดเพิ่ม/ค่าบริการ)" : "☐ รายการนี้ไม่ต้องทำแบบ"}
                      </button>
                      {it.noProof && (
                        <span className="text-[10px] text-slate-400">
                          {it.noProof.by} · {shortTime(it.noProof.at)}
                          {proofs.length === 0 ? " · จะแนบภาพประกอบก็ได้ ไม่บังคับ" : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ♻️ ใช้ไฟล์เก่า — ลูกค้าเคยสั่งลายนี้แล้ว บอกทางไลน์/ใบ FlowAccount → แอดมิน/กราฟฟิกติ๊กให้ + ใส่เลขออเดอร์เดิม */}
                  {(mayProof || mayEdit) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleReuseArt(i)}
                        title="ติ๊กเมื่อลูกค้าใช้ลายเดิมจากออเดอร์ก่อน ไม่แนบไฟล์ใหม่ — กราฟฟิกจะเห็นป้าย ♻️ ข้างชื่อสินค้า และดึงลายจากใบเดิมได้ในคลิกเดียว · เป็นแค่ป้าย ไม่ข้ามขั้นตรวจแบบ"
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          it.reuseArt
                            ? "bg-amber-500 text-white hover:bg-amber-600"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-700"
                        }`}
                      >
                        {it.reuseArt ? "♻️ ใช้ไฟล์เก่า (ลายจากออเดอร์ก่อน)" : "☐ รายการนี้ใช้ไฟล์เก่า"}
                      </button>
                      {it.reuseArt && (
                        <>
                          <input
                            type="text"
                            defaultValue={[it.reuseArt.fromOrderId, it.reuseArt.note].filter(Boolean).join(" · ")}
                            onBlur={(e) => setReuseArtRef(i, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            placeholder="เลขออเดอร์เดิม เช่น OD-260801-1234 · หมายเหตุ"
                            aria-label="เลขออเดอร์เดิมที่ใช้ไฟล์"
                            className="w-72 max-w-full rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 placeholder:font-normal placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          />
                          <span className="text-[10px] text-slate-400">
                            {it.reuseArt.by} · {shortTime(it.reuseArt.at)}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {it.proofStatus ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${PROOF_STYLES[it.proofStatus]}`}>
                        {it.proofStatus === "รอตรวจ"
                          ? "รอลูกค้าตรวจ"
                          : it.proofStatus === "อนุมัติ"
                            ? "ลูกค้าอนุมัติแล้ว"
                            : "ลูกค้าขอแก้ไข"}
                      </span>
                    ) : it.noProof ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-300/70">
                        ไม่ต้องทำแบบ
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200/70">
                        รอกราฟฟิกทำแบบ
                      </span>
                    )}
                    {proofs.length > 0 && (
                      <span
                        className={`text-[11px] ${qc.comparable && !qc.ok ? "font-bold text-rose-600" : faint}`}
                        title={qc.math || undefined}
                      >
                        {proofs.length} แบบ ·{" "}
                        {qc.comparable
                          ? `ระบุจำนวนรวม ${qc.total}/${qc.target} ${qc.unit}${qc.ok ? "" : " ⚠️ ไม่ตรง"}`
                          : `ระบุจำนวนรวม ${qc.total} ${qc.unit || "หน่วย"} (สั่ง ${qc.orderedText})`}
                        {qc.per > 1 && <span className="ml-1 font-normal opacity-70">({qc.math})</span>}
                      </span>
                    )}
                    {it.sampleRequired && (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${
                          it.samplePacked
                            ? "bg-teal-50 text-teal-700 ring-teal-200/70"
                            : "bg-amber-50 text-amber-700 ring-amber-200/70"
                        }`}
                        title={
                          it.samplePacked
                            ? `ยืนยันโดย ${it.samplePacked.by} · ${shortTime(it.samplePacked.at)}`
                            : "ฝ่ายแพ็คต้องยืนยันว่าใส่ชิ้นงานตัวอย่างลงกล่องก่อนยิงเลขพัสดุ"
                        }
                      >
                        {it.samplePacked ? "🎁 งานตัวอย่างใส่กล่องแล้ว" : "🎁 มีงานตัวอย่างต้องส่ง"}
                      </span>
                    )}
                    {/* 📦 ฝ่ายแพ็คปักว่าของยังไม่มา/มาไม่ครบ — แอดมินเห็นจากหน้าปกติได้เลยว่าใบนี้ติดของ ไม่ต้องเข้าโหมดแพ็ค */}
                    {it.arrival && it.arrival.status !== "มาครบ" && (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${
                          it.arrival.status === "ยังไม่มา"
                            ? "bg-rose-50 text-rose-700 ring-rose-200/70"
                            : "bg-amber-50 text-amber-700 ring-amber-200/70"
                        }`}
                        title={[
                          `ปักโดย ${it.arrival.by} · ${shortTime(it.arrival.at)}`,
                          it.arrival.expectedAt ? `คาดว่ามา ${fmtExpected(it.arrival.expectedAt)}` : "",
                          it.arrival.note ?? "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        📦 {arrivalSummary(it.arrival, it.qty)}
                        {it.arrival.expectedAt && (
                          <span className={`ml-1 ${arrivalOverdue(it.arrival.expectedAt) ? "text-rose-700 underline" : "opacity-80"}`}>
                            · {arrivalOverdue(it.arrival.expectedAt) ? "เลยกำหนด" : "คาดว่ามา"} {fmtExpected(it.arrival.expectedAt)}
                          </span>
                        )}
                        {it.arrival.note && <span className="ml-1 font-normal opacity-80">· {it.arrival.note}</span>}
                      </span>
                    )}
                  </div>

                  {/* ── รูปงาน แยกชัดว่าใครเป็นคนใส่ · ใครเห็น ── */}
                  {/* ไม่ต้องทำแบบ + ยังไม่มีรูปสักใบ = ซ่อนช่องรูปทั้งสองกล่อง เหลือลิงก์เล็ก ๆ เผื่ออยากแนบภาพประกอบ */}
                  {it.noProof && !proofs.length && !(it.artworkUrls?.length ?? 0) && !picOpen[i] ? (
                    <p className="mt-3 text-[11px] text-slate-400">
                      🚫 รายการนี้ไม่ต้องทำแบบ — ไม่มีช่องรูปให้กราฟฟิก
                      {(mayProof || mayEdit) && (
                        <button
                          type="button"
                          onClick={() => setPicOpen((cur) => ({ ...cur, [i]: true }))}
                          className="ml-2 font-bold text-slate-500 underline-offset-2 hover:text-indigo-700 hover:underline"
                        >
                          แนบภาพประกอบ (ไม่บังคับ)
                        </button>
                      )}
                    </p>
                  ) : (
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
                    {/* ซ้าย: ลายที่ลูกค้าส่งมา (ทีมงานเห็นเท่านั้น) */}
                    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                      <p className="text-xs font-bold text-sky-800">
                        🎨 ลายจากลูกค้า ({it.artworkUrls?.length ?? 0})
                        {(it.artworkBackUrls?.length ?? 0) > 0 && (
                          /* งานพิมพ์ 2 ด้าน — สรุปให้เห็นทันทีว่ามาแยกหน้า/หลังกี่รูป */
                          <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            หน้า {((it.artworkUrls?.length ?? 0) - (it.artworkBackUrls?.length ?? 0)).toLocaleString("th-TH")} · หลัง{" "}
                            {(it.artworkBackUrls?.length ?? 0).toLocaleString("th-TH")}
                          </span>
                        )}
                        <span className="ml-1 font-normal text-sky-600">— ทีมงานเห็นเท่านั้น ลูกค้าไม่เห็นในหน้าเช็คออเดอร์</span>
                      </p>
                      {/*
                        แยกตามหน้าที่ของไฟล์ให้ชัด:
                          · "ไฟล์พร้อมพิมพ์ (.ai)" = ภาพที่ระบบประกอบบนเทมเพลตแล้ว (เซฟเป็น .jpg เสมอ)
                            แสดงเป็นรายการ: เลขลำดับ · รูปย่อ · ชื่อไฟล์ .ai ที่จะได้ (กดชื่อ = โหลดเลย)
                          · "ไฟล์ภาพต้นฉบับ" = ไฟล์ที่ลูกค้าอัปมาดิบ ๆ ไว้ทำงานใหม่ ไม่ใช่ไฟล์ส่งพิมพ์
                        จับคู่กับจำนวนลายได้พอดี = ภาพพร้อมพิมพ์ทั้งชุด (ออเดอร์ที่สร้างหลังแก้บั๊ครูปซ้ำ)
                      */}
                      {(() => {
                        const { arts, specs, matched, ready, raw } = printFilesOf(it, order.id, i);
                        if (!arts.length) return null;
                        return (
                          <div className="mt-2 space-y-2">
                            {!matched && specs.length > 0 && (
                              <p className="text-[11px] font-semibold text-amber-700">
                                ⚠️ ออเดอร์นี้มี {specs.length} ลาย แต่แนบรูปมา {arts.length} ใบ (ของเก่ามีรูปซ้ำ) —
                                เอาใบที่ไม่ใช้ออกด้วยปุ่ม ✕ ได้
                              </p>
                            )}

                            {/* 🔢 ยอดรวมจำนวนต่อลายเทียบกับที่สั่ง — เห็นทันทีว่าลูกค้าระบุครบ/ขาด/เกิน */}
                            <ArtQtySummary it={it} />

                            {/* ── ไฟล์พร้อมพิมพ์ — แสดงเป็นรายการพร้อมชื่อไฟล์ ── */}
                            {ready.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold text-sky-800">
                                  📐 ไฟล์พร้อมพิมพ์ ({ready.length}) — ลูกค้าออกแบบมาเองแล้ว ไม่ต้องทำแบบใหม่
                                </p>
                                <ol className="mt-1 space-y-1.5">
                                  {ready.map((r) => {
                                    const aiKey = `${order.id}-${i}-ai-${r.no}`;
                                    return (
                                      <li
                                        key={r.u}
                                        className="flex items-start gap-2 rounded-lg bg-white p-2 ring-1 ring-sky-200"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setLightbox({ src: r.u, alt: `${it.name} ลายที่ ${r.no}`, caption: it.name })}
                                          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-sky-200 transition hover:ring-2 hover:ring-sky-400"
                                          title="ดูรูปเต็ม"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={r.u} alt={`ลายที่ ${r.no}`} className="h-full w-full object-cover" />
                                        </button>
                                        {/* หัวแถวบอก "ลายที่เท่าไหร่ · กรอบกี่มิล" แล้วค่อยเป็นปุ่มโหลด
                                            ชื่อไฟล์ยาว ๆ ไม่โชว์แล้ว (โดน truncate จนอ่านไม่ออกอยู่ดี) ย้ายไปอยู่ใน title */}
                                        <span className="min-w-0 flex-1">
                                          <span className="flex items-baseline justify-between gap-2">
                                            <span className="text-xs font-semibold text-slate-700">
                                              ลายที่ {r.no}
                                              {/* 🔢 จำนวนของลายนี้ — กราฟฟิก/แอดมินแก้ได้ตรงนี้ (10 ก.ย. 69) */}
                                              {mayEdit || mayProof ? (
                                                <span className="ml-1.5 inline-block align-middle">
                                                  <ArtQtyInput
                                                    value={artQtyOf(it, r.u, r.no - 1)}
                                                    unit={artQtyUnitOf(it, orderedPieces(it).piece)}
                                                    label={`ลายที่ ${r.no}`}
                                                    disabled={demo}
                                                    onCommit={(q) => setArtQty(i, r.u, q)}
                                                  />
                                                </span>
                                              ) : artQtyOf(it, r.u, r.no - 1) ? (
                                                <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                                  × {artQtyOf(it, r.u, r.no - 1)!.toLocaleString("th-TH")} ชิ้น
                                                </span>
                                              ) : null}
                                              {/* 📐 ขนาดที่ลูกค้าระบุให้ลายนี้ (คละหลายขนาดใน 1 แผ่น) */}
                                              {artSizeOf(it, r.u, r.no - 1) ? (
                                                <span className="ml-1 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                                                  📐 {artSizeText(artSizeOf(it, r.u, r.no - 1)!)}
                                                </span>
                                              ) : null}
                                            </span>
                                            <span className={`shrink-0 text-[11px] tabular-nums ${muted}`}>
                                              {r.frame ? `${r.frame.widthMm}×${r.frame.heightMm} มม.` : "ไม่มีข้อมูลกรอบงาน"}
                                              {r.dpi ? ` · ${r.dpi} DPI` : ""}
                                            </span>
                                          </span>
                                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                                            <button
                                              type="button"
                                              disabled={!r.frame || aiBusy === aiKey}
                                              onClick={async () => {
                                                if (!r.frame) return;
                                                setAiBusy(aiKey);
                                                try {
                                                  /**
                                                   * ไฟล์นี้มีแต่ "ลายของลูกค้า" ล้วน ๆ ขนาดเท่ากรอบงานจริง (รวมตัดตก)
                                                   * ไม่รวมงานของเทมเพลต — สำหรับงานที่กราฟฟิกอยากวางเองใน Illustrator
                                                   * (แบบรวมเทมเพลต+เลเยอร์ครบ ใช้ปุ่ม 🧩 ข้าง ๆ แทน)
                                                   */
                                                  const blob = await buildPrintAi({
                                                    imageUrl: r.u,
                                                    widthMm: r.frame.widthMm,
                                                    heightMm: r.frame.heightMm,
                                                    title: `${order.id} ${it.name} ลายที่ ${r.no}`,
                                                  });
                                                  downloadBlob(blob, r.name);
                                                } catch (e) {
                                                  alert(e instanceof Error ? e.message : "สร้างไฟล์ .ai ไม่สำเร็จ");
                                                } finally {
                                                  setAiBusy(null);
                                                }
                                              }}
                                              className={`${btnSm} whitespace-nowrap border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100`}
                                              title={`ลายของลูกค้าล้วน ๆ ขนาดเท่ากรอบงานจริง — ${r.name}`}
                                            >
                                              {aiBusy === aiKey ? "กำลังสร้าง…" : "⬇️ ลายอย่างเดียว"}
                                            </button>
                                            {/* 🧩 ไฟล์รวมเทมเพลต — ลายเป็นเลเยอร์ล่างสุด เส้นไดคัท/ไกด์ของเทมเพลตทับอยู่
                                                มีเฉพาะออเดอร์ที่จดไฟล์เทมเพลตไว้ ([ai:…|tpl:…]) และเทมเพลตเป็น PDF compatible */}
                                            {r.frame?.tplUrl && (
                                              <button
                                                type="button"
                                                disabled={aiBusy === `${aiKey}-tpl`}
                                                onClick={async () => {
                                                  const frame = r.frame;
                                                  if (!frame?.tplUrl) return;
                                                  setAiBusy(`${aiKey}-tpl`);
                                                  try {
                                                    const blob = await buildTplMergedAi({
                                                      tplUrl: frame.tplUrl,
                                                      imageUrl: r.u,
                                                      layerName: `ลายลูกค้า ${order.id} ลายที่ ${r.no}`,
                                                      title: `${order.id} ${it.name} ลายที่ ${r.no} (รวมเทมเพลต)`,
                                                    });
                                                    downloadBlob(blob, r.name.replace(/-พร้อมพิมพ์\.ai$/, "-รวมเทมเพลต.ai"));
                                                  } catch (e) {
                                                    alert(e instanceof Error ? e.message : "สร้างไฟล์รวมเทมเพลตไม่สำเร็จ");
                                                  } finally {
                                                    setAiBusy(null);
                                                  }
                                                }}
                                                className={`${btnSm} whitespace-nowrap border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100`}
                                                title="ไฟล์ .ai ที่มีทั้งเทมเพลต (เส้นไดคัท/ไกด์) และลายลูกค้าในไฟล์เดียว — Illustrator เปิดมาเป็นชั้นเดียว ใช้ปุ่ม “โหลด .jsx” ท้ายรายการสินค้าแยกเลเยอร์"
                                              >
                                                {aiBusy === `${aiKey}-tpl` ? "กำลังรวม…" : "🧩 รวมเทมเพลต"}
                                              </button>
                                            )}
                                            {/* 🔁 เปลี่ยนรูปลายนี้เป็นรูปอื่น — แทนที่ตำแหน่งเดิม ลำดับ/จำนวนต่อลายไม่เปลี่ยน */}
                                            {mayEdit && (
                                              <label
                                                className={`${btnSm} cursor-pointer whitespace-nowrap border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 ${
                                                  artUpIdx === i ? "pointer-events-none opacity-50" : ""
                                                }`}
                                                title={`เปลี่ยนรูปลายที่ ${r.no} เป็นรูปอื่น — ยังเป็นลายที่ ${r.no} เหมือนเดิม จำนวน/ขนาดต่อลายคงไว้`}
                                              >
                                                {artUpIdx === i ? "กำลังอัป…" : "🔁 เปลี่ยนรูป"}
                                                <input
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp"
                                                  className="hidden"
                                                  disabled={artUpIdx === i}
                                                  onChange={(e) => {
                                                    void replaceArtwork(i, r.u, e.target.files?.[0]);
                                                    e.target.value = "";
                                                  }}
                                                />
                                              </label>
                                            )}
                                          </span>
                                        </span>
                                        {isOwner && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (confirm(`เอารูปลายที่ ${r.no} ออกจากออเดอร์นี้?\n(ไฟล์ยังอยู่ในคลัง ลบเฉพาะการผูกกับออเดอร์)`))
                                                removeArtwork(i, r.u);
                                            }}
                                            title="เอารูปนี้ออกจากออเดอร์"
                                            aria-label="เอารูปลายนี้ออก"
                                            className="shrink-0 rounded px-1 py-0.5 text-[11px] font-bold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>
                            )}

                            {/* ── ไฟล์ภาพต้นฉบับ — ไม่ใช่ไฟล์ส่งพิมพ์ ── */}
                            {raw.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold text-slate-500">
                                  🖼 ไฟล์ภาพต้นฉบับจากลูกค้า ({raw.length})
                                  <span className="ml-1 font-normal text-slate-400">— ไว้ทำงานใหม่ ไม่ใช่ไฟล์ส่งพิมพ์</span>
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {raw.map((u, k) => (
                                    <span key={`${u}-${k}`} className="group relative block">
                                      <button
                                        type="button"
                                        onClick={() => setLightbox({ src: u, alt: `${it.name} ต้นฉบับ ${k + 1}`, caption: it.name })}
                                        className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-sky-400"
                                        title="ดูรูปเต็ม"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={u} alt={`ต้นฉบับ ${k + 1}`} className="h-full w-full object-cover" />
                                        {/* 🔢 จำนวนที่ลูกค้าระบุให้ลายนี้ */}
                                        {artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u)) || artSizeOf(it, u, (it.artworkUrls ?? []).indexOf(u)) ? (
                                          <span className="absolute inset-x-0 bottom-0 bg-sky-900/75 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                                            {artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u)) ? `×${artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u))!.toLocaleString("th-TH")}` : ""}
                                            {/* 📐 ขนาดต่อลาย (คละหลายขนาด) — ต่อท้ายจำนวน */}
                                            {artSizeOf(it, u, (it.artworkUrls ?? []).indexOf(u))
                                              ? `${artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u)) ? " " : ""}${artSizeText(artSizeOf(it, u, (it.artworkUrls ?? []).indexOf(u))!, "")}`
                                              : ""}
                                          </span>
                                        ) : null}
                                      </button>
                                      {/* งานพิมพ์ 2 ด้าน: ลูกค้าแยกช่องหน้า/หลังมาแล้ว — ติดป้ายให้กราฟฟิกไม่ต้องเดาจากลำดับ */}
                                      {artworkSide(it, u) && (
                                        <span
                                          className={`pointer-events-none absolute bottom-0 left-0 right-0 rounded-b-lg px-1 py-0.5 text-center text-[9px] font-bold text-white ${
                                            artworkSide(it, u) === "ด้านหลัง" ? "bg-violet-600/90" : "bg-sky-600/90"
                                          }`}
                                        >
                                          {artworkSide(it, u)}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => void downloadImage(u, `${order.id}-item${i + 1}-ต้นฉบับ-${k + 1}.${(u.split(".").pop() || "jpg").split("?")[0]}`)}
                                        title="โหลดรูปนี้เก็บลงเครื่อง"
                                        aria-label="ดาวน์โหลดไฟล์ต้นฉบับนี้"
                                        className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                                      >
                                        ⬇
                                      </button>
                                      {/* 🔁 เปลี่ยนรูปนี้เป็นรูปอื่น (ตำแหน่งเดิม) */}
                                      {mayEdit && (
                                        <label
                                          title="เปลี่ยนรูปนี้เป็นรูปอื่น — อยู่ตำแหน่งเดิม จำนวน/ขนาดต่อลายคงไว้"
                                          aria-label="เปลี่ยนรูปลายนี้"
                                          className={`absolute -right-1 top-5 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100 ${
                                            artUpIdx === i ? "pointer-events-none" : ""
                                          }`}
                                        >
                                          {artUpIdx === i ? "…" : "🔁"}
                                          <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            disabled={artUpIdx === i}
                                            onChange={(e) => {
                                              void replaceArtwork(i, u, e.target.files?.[0]);
                                              e.target.value = "";
                                            }}
                                          />
                                        </label>
                                      )}
                                      {/* 🔢 จำนวนของลายนี้ — แก้ได้ใต้รูป (10 ก.ย. 69) */}
                                      {(mayEdit || mayProof) && (
                                        <span className="mt-1 block">
                                          <ArtQtyInput
                                            value={artQtyOf(it, u, (it.artworkUrls ?? []).indexOf(u))}
                                            unit={artQtyUnitOf(it, orderedPieces(it).piece)}
                                            label={`ต้นฉบับ ${k + 1}`}
                                            disabled={demo}
                                            onCommit={(q) => setArtQty(i, u, q)}
                                          />
                                        </span>
                                      )}
                                      {isOwner && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (confirm(`เอารูปต้นฉบับใบที่ ${k + 1} ออกจากออเดอร์นี้?\n(ไฟล์ยังอยู่ในคลัง ลบเฉพาะการผูกกับออเดอร์)`))
                                              removeArtwork(i, u);
                                          }}
                                          title="เอารูปนี้ออกจากออเดอร์"
                                          aria-label="เอารูปลายนี้ออก"
                                          className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
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
                        );
                      })()}

                      {/* ♻️ ลูกค้าใช้ไฟล์เก่า — บอกกราฟฟิกว่าลายอยู่ที่ใบเดิม + ปุ่มดึงมาในคลิกเดียว (มีเลขออเดอร์เดิมถึงจะดึงได้) */}
                      {it.reuseArt && (
                        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
                          <p className="font-bold">
                            ♻️ ลูกค้าใช้ไฟล์เก่า
                            {it.reuseArt.fromOrderId ? (
                              <>
                                {" "}
                                — ดูจากออเดอร์{" "}
                                <a
                                  href={`/admin/orders/${encodeURIComponent(it.reuseArt.fromOrderId)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                                >
                                  {it.reuseArt.fromOrderId}
                                </a>
                              </>
                            ) : (
                              " — ไม่ได้ระบุเลขออเดอร์เดิม ค้นจากชื่อ/เบอร์ลูกค้าในรายการออเดอร์ หรือถามลูกค้าทางไลน์"
                            )}
                          </p>
                          {it.reuseArt.note && <p className="mt-0.5">“{it.reuseArt.note}”</p>}
                          {(mayProof || mayEdit) && it.reuseArt.fromOrderId && (
                            <button
                              type="button"
                              disabled={artUpIdx === i}
                              onClick={() => void pullArtworkFromOld(i)}
                              title="คัดลอกลายที่ลูกค้าแนบ (หรือแบบงาน ถ้าใบเดิมไม่มีลาย) จากออเดอร์เดิมมาใส่รายการนี้ — ไม่ทับของเดิม"
                              className="mt-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                            >
                              {artUpIdx === i ? "กำลังดึง…" : `⬇️ ดึงลายจากออเดอร์ ${it.reuseArt.fromOrderId}`}
                            </button>
                          )}
                        </div>
                      )}

                      {/* แนบลายเพิ่มได้เสมอ */}
                      {mayEdit && (
                        <label
                          className="mt-2 inline-grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-sky-300 bg-white text-center text-[10px] font-bold leading-tight text-sky-600 transition hover:bg-sky-50"
                          title="แนบลายจากลูกค้าเพิ่ม (ลากวางก็ได้)"
                        >
                          {artUpIdx === i ? "อัป…" : <span>＋<br />แนบลาย</span>}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="hidden"
                            disabled={artUpIdx === i}
                            onChange={(e) => {
                              void addArtwork(i, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}

                      {mayProof &&
                        (() => {
                          const have = new Set(proofs.map((pf) => pf.url));
                          const pending = (it.artworkUrls ?? []).filter((u) => !have.has(u));
                          if (!pending.length) return null;
                          return (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await askConfirm({
                                  icon: "🎨",
                                  title: `ใช้ลาย ${pending.length} รูปนี้เป็นแบบเลยไหม?`,
                                  detail: "คัดลอกไปฝั่งขวา (แบบที่เราส่งให้ตรวจ) ลูกค้าจะเห็นและกดอนุมัติได้",
                                  confirmLabel: "ใช้เป็นแบบ",
                                });
                                if (ok) sendAllArtAsProofs(i);
                              }}
                              className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-sky-700"
                            >
                              ใช้ลายนี้เป็นแบบ → ({pending.length} รูป)
                            </button>
                          );
                        })()}
                    </div>

                    {/* ขวา: แบบที่ร้านส่งให้ลูกค้าตรวจ — โยนไฟล์ลงกล่องนี้ได้เลย */}
                    <div
                      onDragOver={(e) => {
                        if (!mayProof) return;
                        e.preventDefault();
                        setProofDropIdx(i);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setProofDropIdx(null);
                      }}
                      onDrop={(e) => {
                        if (!mayProof) return;
                        e.preventDefault();
                        setProofDropIdx(null);
                        void sendProofs(i, e.dataTransfer.files);
                      }}
                      className={`rounded-xl border p-3 transition ${
                        proofDropIdx === i ? "border-violet-500 bg-violet-100 ring-2 ring-violet-400" : "border-violet-200 bg-violet-50/40"
                      }`}
                    >
                      <p className="text-xs font-bold text-violet-800">
                        🖼 แบบที่เราส่งให้ตรวจ ({proofs.length})
                        <span className="ml-1 font-normal text-violet-600">— ลูกค้าเห็นชุดนี้ และกดอนุมัติ / ขอแก้ไข</span>
                        {mayProof && <span className="ml-1 font-normal text-violet-400">· ลากไฟล์มาวางในกล่องนี้ได้เลย</span>}
                      </p>
                      {/* ลูกค้าออกแบบเอง = ชุดนี้ผ่านการอนุมัติมาแล้ว ไม่ต้องรอลูกค้าตรวจซ้ำ */}
                      {proofs.length > 0 && proofs.every((pf) => /ลูกค้าจัดวางเองบนเทมเพลต/.test(pf.note ?? "")) && (
                        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-emerald-800 ring-1 ring-emerald-200">
                          ✅ ลูกค้าออกแบบเองบนเทมเพลต — ระบบใส่แบบให้และอนุมัติอัตโนมัติแล้ว
                          <span className="font-normal"> ไม่ต้องทำแบบใหม่ ไม่ต้องรอลูกค้าตรวจ ส่งผลิตได้เลย</span>
                        </p>
                      )}
                      {/* ออเดอร์ยังไม่ยืนยันการชำระ = อัปแบบไม่ได้ (กันทำงานฟรี) — บอกตรงนี้เลย ไม่ต้องเดา */}
                      {!paidOk && !overrideLock && (
                        <div className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-[11px] leading-relaxed text-yellow-800 ring-1 ring-yellow-300">
                          <strong>⚠️ ยังอัปแบบไม่ได้</strong> — ออเดอร์นี้สถานะ “{order.status}” ระบบล็อกไว้กันทำงานฟรี
                          <button
                            type="button"
                            onClick={() => setOverrideLock(true)}
                            className="ml-1 rounded border border-yellow-400 bg-white px-1.5 py-0.5 text-[10px] font-bold text-yellow-800 transition hover:bg-yellow-100"
                          >
                            ปลดล็อก — ทำแบบก่อนได้
                          </button>
                        </div>
                      )}
                      {/* ผลตรวจชุดแบบ — อ่านจากชื่อไฟล์ที่ลากเข้ามา เทียบกับจำนวนที่ลูกค้าสั่ง */}
                      <ProofDropCheck
                        proofs={proofs}
                        item={it}
                        catalog={nameIndex}
                        onSetPerUnit={mayProof || mayEdit ? (per) => setItemPerUnit(i, per) : undefined}
                      />
                      {proofs.length === 0 ? (
                        <p
                          className={`mt-2 rounded-lg border-2 border-dashed bg-white px-3 py-3 text-center text-[11px] ${
                            it.noProof ? "border-slate-200 text-slate-500" : "border-violet-200 text-slate-400"
                          }`}
                        >
                          {proofDropIdx === i
                            ? "⬇️ ปล่อยไฟล์ตรงนี้ได้เลย"
                            : it.noProof
                              ? "🚫 รายการนี้ไม่ต้องทำแบบ — จะแนบภาพประกอบก็ได้ ไม่บังคับ (แนบแล้วลูกค้าจะเห็นและกดตรวจตามปกติ)"
                              : "ยังไม่ได้ส่งแบบให้ลูกค้า — ลากไฟล์มาวาง กดปุ่มด้านล่าง หรือกด “ใช้ลายนี้เป็นแบบ” จากฝั่งซ้าย"}
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {proofs.map((pf, j) => (
                            <div
                              key={`${pf.url}-${j}`}
                              onDragOver={(e) => {
                                if (!mayProof) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setReplaceDrop(`${i}:${j}`);
                              }}
                              onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) setReplaceDrop(null);
                              }}
                              onDrop={(e) => {
                                if (!mayProof) return;
                                e.preventDefault();
                                e.stopPropagation(); // อย่าให้กล่องแม่รับไปเพิ่มเป็นรูปใหม่
                                setReplaceDrop(null);
                                setProofDropIdx(null);
                                void replaceProof(i, j, e.dataTransfer.files?.[0] ?? null);
                              }}
                              title={mayProof ? "ลากรูปมาวางบนการ์ดนี้ = เปลี่ยนรูปนี้" : undefined}
                              className={`w-36 overflow-hidden rounded-xl border bg-white transition ${
                                replaceDrop === `${i}:${j}`
                                  ? "border-indigo-500 ring-2 ring-indigo-400"
                                  : pf.review === "ขอแก้ไข"
                                    ? "border-rose-300 ring-2 ring-rose-200"
                                    : pf.review === "อนุมัติ"
                                      ? "border-teal-300 ring-2 ring-teal-100"
                                      : "border-violet-200"
                              }`}
                            >
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => showProof(i, j)}
                                  aria-label={`ขยายดูแบบงาน ${it.name} รูปที่ ${j + 1}`}
                                  className="block aspect-[4/3] w-full cursor-zoom-in bg-slate-50"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={pf.url} alt={`แบบงาน ${it.name} รูปที่ ${j + 1}`} className="h-full w-full object-contain" />
                                </button>
                                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  รูปที่ {j + 1}
                                </span>
                                {pf.review ? (
                                  <span
                                    className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                                      pf.review === "อนุมัติ" ? "bg-teal-50 text-teal-700 ring-teal-200" : "bg-rose-50 text-rose-700 ring-rose-200"
                                    }`}
                                  >
                                    {pf.review === "อนุมัติ" ? "✔ อนุมัติ" : "✏️ ขอแก้ไข"}
                                  </span>
                                ) : pf.revisedAt ? (
                                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                                    🔄 แก้แล้ว · รอตรวจ
                                  </span>
                                ) : null}
                                {mayProof && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      // ลบแล้วเลขรูปที่อยู่หลังจะเลื่อนขึ้น — ความเห็นลูกค้าที่อ้าง "รูปที่ N" จะไม่ตรงกัน
                                      const after = proofs.length - 1 - j;
                                      const warn = [
                                        after > 0
                                          ? `⚠️ เลขรูปจะเลื่อน — รูปที่ ${j + 2}${after > 1 ? `–${proofs.length}` : ""} จะกลายเป็นรูปที่ ${j + 1}${after > 1 ? `–${proofs.length - 1}` : ""} ถ้าลูกค้าเคยทักถึง “รูปที่ …” ไว้ จะอ้างกันคนละรูปทันที`
                                          : "",
                                        pf.review === "ขอแก้ไข"
                                          ? `⚠️ รูปนี้ลูกค้ากำลังขอแก้อยู่ (“${pf.reviewNote || "-"}”) — ลบแล้วคำขอนี้จะหายไปด้วย`
                                          : pf.review === "อนุมัติ"
                                            ? "⚠️ รูปนี้ลูกค้าอนุมัติแล้ว — ลบแล้วผลอนุมัติจะหายไปด้วย"
                                            : "",
                                        "💡 ถ้าจะแก้งานรูปนี้ ใช้ปุ่ม “🔄 เปลี่ยนรูปนี้” แทน จะได้คงเลขรูปและความเห็นของลูกค้าไว้",
                                      ]
                                        .filter(Boolean)
                                        .join("\n");
                                      const ok = await askConfirm({
                                        icon: "🗑",
                                        title: `ลบแบบรูปที่ ${j + 1}?`,
                                        detail: warn,
                                        confirmLabel: "ลบทิ้งเลย",
                                        danger: true,
                                      });
                                      if (ok) removeProof(i, j);
                                    }}
                                    aria-label="ลบรูปนี้"
                                    title="ลบรูปนี้ (เลขรูปของรูปถัดไปจะเลื่อน — ถ้าจะแก้งาน ใช้ “เปลี่ยนรูปนี้” ดีกว่า)"
                                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-900/60 text-xs font-bold text-white transition hover:bg-rose-600"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              {mayProof ? (
                                <div className="space-y-1.5 p-2">
                                  <div
                                    className="flex items-center gap-1"
                                    title={
                                      'ตั้งชื่อไฟล์บอกจำนวน+หน่วยไว้ ระบบเติมช่องจำนวนกับรายละเอียดให้เอง — เช่น "ลายหน้า x3.png" · "ลายหลัง 5 ชิ้น.png" · "เจตนา 5 เซ็ต.png"'
                                    }
                                  >
                                    <span className="shrink-0 text-[10px] font-bold text-slate-400">จำนวน</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={pf.qty ?? ""}
                                      placeholder="—"
                                      onChange={(e) => patchProof(i, j, { qty: Math.max(0, Number(e.target.value) || 0) || undefined })}
                                      onBlur={persist}
                                      aria-label={`จำนวนของแบบรูปที่ ${j + 1}`}
                                      className="w-full min-w-0 rounded-md border border-slate-200 px-1 py-0.5 text-center text-[11px] focus:border-violet-300 focus:outline-none"
                                    />
                                    {/* หน่วยนับ — งานเซ็ต (พวงกุญแจ+การ์ดในไฟล์เดียว) นับเป็นเซ็ต ใบงาน/ฝ่ายแพ็คจะได้ไม่นับเป็นชิ้น */}
                                    <select
                                      value={proofUnit(pf)}
                                      onChange={(e) => patchProofSave(i, j, { unit: e.target.value === "ชิ้น" ? undefined : e.target.value })}
                                      aria-label={`หน่วยนับของแบบรูปที่ ${j + 1}`}
                                      title="หน่วยนับของรูปนี้ — โชว์ในใบงาน ช่องตรวจนับของฝ่ายแพ็ค และหน้าที่ลูกค้าเห็น"
                                      className={`shrink-0 rounded-md border px-0.5 py-0.5 text-[10px] focus:outline-none ${
                                        proofUnit(pf) === "ชิ้น"
                                          ? "border-slate-200 bg-white text-slate-500"
                                          : "border-violet-300 bg-violet-50 font-bold text-violet-700"
                                      }`}
                                    >
                                      {PROOF_UNITS.map((u) => (
                                        <option key={u} value={u}>
                                          {u}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <ProofNoteInput
                                    value={pf.note ?? ""}
                                    label={`รายละเอียดของแบบรูปที่ ${j + 1}`}
                                    onChange={(v) => patchProof(i, j, { note: v || undefined })}
                                    onBlur={persist}
                                  />
                                  {pf.review === "ขอแก้ไข" && pf.reviewNote ? (
                                    <p className="rounded-md bg-rose-50 px-1.5 py-1 text-[10px] font-bold leading-snug text-rose-700">
                                      ลูกค้าขอแก้: “{pf.reviewNote}”
                                    </p>
                                  ) : !pf.review && pf.revisedAt ? (
                                    <p className="rounded-md bg-amber-50 px-1.5 py-1 text-[10px] font-bold leading-snug text-amber-700">
                                      🔄 ส่งฉบับแก้ให้ลูกค้าแล้ว {shortTime(pf.revisedAt)}
                                      {pf.revisedFromNote ? <span className="block font-normal">เดิมขอ: “{pf.revisedFromNote}”</span> : null}
                                    </p>
                                  ) : null}
                                  <label
                                    title="อัปรูปใหม่ทับตำแหน่งเดิม (ไม่ต้องลบก่อน)"
                                    className={`block cursor-pointer rounded-lg px-2 py-1 text-center text-[11px] font-bold transition ${
                                      pf.review === "ขอแก้ไข" ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    } ${uploadingIdx === i ? "pointer-events-none opacity-50" : ""}`}
                                  >
                                    {uploadingIdx === i
                                      ? "กำลังอัปโหลด…"
                                      : replaceDrop === `${i}:${j}`
                                        ? "⬇️ ปล่อยเพื่อเปลี่ยนรูป"
                                        : "🔄 เปลี่ยนรูปนี้ (ลากรูปมาวางก็ได้)"}
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp,image/gif"
                                      className="hidden"
                                      onChange={(e) => {
                                        void replaceProof(i, j, e.target.files?.[0] ?? null);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="p-2 text-[11px] leading-snug text-slate-600">
                                  {pf.qty ? (
                                    <strong>
                                      {pf.qty} {proofUnit(pf)}
                                    </strong>
                                  ) : (
                                    <span className="text-slate-400">ไม่ระบุจำนวน</span>
                                  )}
                                  {pf.note ? <span className="block text-slate-500">{pf.note}</span> : null}
                                  {pf.review === "ขอแก้ไข" && pf.reviewNote && (
                                    <span className="block text-rose-600">ลูกค้าขอแก้: “{pf.reviewNote}”</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 📣 แจ้งลูกค้าทางไลน์ครั้งเดียว — มีรูปค้างแจ้ง = แถบเหลือง+ปุ่ม · ไม่มี = แถบเทาบอกว่าแจ้งแล้ว+ปุ่มแจ้งซ้ำ · ไม่กดใน 30 นาที ระบบแจ้งเอง */}
                      {mayProof && proofs.length > 0 && (proofPending.perItem[i] ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-300">
                          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-amber-900">
                            <strong>📣 ยังไม่ได้แจ้งลูกค้า</strong> — {pendingProofsLabel(proofPending)}
                            {proofPending.total > proofPending.perItem[i] ? (
                              <span className="text-amber-700"> (รวมทุกรายการ {proofPending.total} รูป)</span>
                            ) : null}
                            <span className="block text-amber-700">
                              กรอกจำนวน/รายละเอียดให้ครบก่อน แล้วกดแจ้งทีเดียว · ไม่กดภายใน {PROOF_AUTO_NOTIFY_MINUTES} นาที ระบบแจ้งให้เอง
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => void notifyProofs(i)}
                            disabled={notifyingProof || uploadingIdx !== null}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
                          >
                            {notifyingProof ? "กำลังส่ง…" : "📣 แจ้งลูกค้าทางไลน์"}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500">
                            {proofNotifyMsg?.item === i ? (
                              <span className="font-semibold text-emerald-700">{proofNotifyMsg.text}</span>
                            ) : (
                              <>
                                📣 แจ้งลูกค้าแล้ว
                                {order.proofNotifiedAt
                                  ? ` · ${new Date(order.proofNotifiedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                                  : " · ตอนอัปแบบ"} — อัปรูปใหม่เมื่อไหร่ แถบเหลืองจะขึ้นให้กดแจ้งทีเดียว
                              </>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => void notifyProofs(i, true)}
                            disabled={notifyingProof || uploadingIdx !== null}
                            className="rounded-lg bg-white px-3 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-60"
                            title="ส่งไลน์ย้ำว่าแบบพร้อมให้ตรวจ (ทุกรูปที่ลูกค้ายังไม่อนุมัติ)"
                          >
                            {notifyingProof ? "กำลังส่ง…" : "📣 แจ้งอีกครั้ง"}
                          </button>
                        </div>
                      ))}
                      {mayProof && (
                        <label
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAddProofDrop(i);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setAddProofDrop(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAddProofDrop(null);
                            setProofDropIdx(null);
                            void sendProofs(i, e.dataTransfer.files);
                          }}
                          className={`mt-2 block cursor-pointer rounded-lg px-3 py-1.5 text-center text-[11px] font-bold text-white transition ${
                            addProofDrop === i ? "bg-violet-800 ring-2 ring-violet-300" : "bg-violet-600 hover:bg-violet-700"
                          } ${uploadingIdx === i ? "pointer-events-none opacity-60" : ""}`}
                          title="อัปแบบที่กราฟฟิกทำเสร็จ ให้ลูกค้าตรวจ — ลากรูปมาวางบนปุ่มนี้ก็ได้"
                        >
                          {uploadingIdx === i
                            ? "กำลังอัปโหลด…"
                            : addProofDrop === i
                              ? "⬇️ ปล่อยเพื่ออัปเป็นแบบใหม่"
                              : "＋ อัปแบบใหม่ให้ลูกค้าตรวจ (ลากรูปมาวางก็ได้)"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              void sendProofs(i, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {mayProof && (
                        <p className="mt-1 text-center text-[10px] leading-snug text-violet-400">
                          💡 ชื่อไฟล์ลงช่อง “รายละเอียด” ให้เอง และเลขในชื่อลงช่อง “จำนวน” — <span className="font-bold">ลายหน้า x3.png</span> ·{" "}
                          <span className="font-bold">ลายหลัง 5 ชิ้น.png</span> แล้วระบบเทียบยอดรวมกับจำนวนที่สั่งให้
                        </p>
                      )}
                      {/* 📌 หมายเหตุถึงลูกค้า — กราฟฟิกฝากเตือนตอนส่งแบบ ลูกค้าเห็นในหน้าเช็คแบบก่อนกดอนุมัติ
                          (กราฟฟิกขอไว้ 15 ก.ย. 69) · ฝ่ายแพ็คไม่เห็นช่องนี้ และไม่ขึ้นใบงาน */}
                      {(mayProof || mayEdit) && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                          <label htmlFor={`proof-memo-${i}`} className="block text-[11px] font-bold text-amber-800">
                            📌 หมายเหตุถึงลูกค้า <span className="font-normal text-amber-700">— ลูกค้าเห็นตอนเข้ามาเช็คแบบ</span>
                          </label>
                          <textarea
                            id={`proof-memo-${i}`}
                            rows={2}
                            value={it.proofMemo ?? ""}
                            onChange={(e) => setProofMemo(i, e.target.value)}
                            onBlur={persist}
                            placeholder="เช่น สีจริงอาจเพี้ยนจากจอเล็กน้อย · ตรวจตัวสะกดชื่อให้ด้วยนะคะ"
                            className="mt-1 w-full resize-y rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] leading-snug text-slate-700 focus:border-amber-400 focus:outline-none"
                          />
                          <p className="mt-1 text-[10px] leading-snug text-amber-700">
                            ข้อความนี้ขึ้นในหน้าตรวจแบบของลูกค้า (ทั้งการ์ดรายการและตอนกดขยายรูป) — ฝ่ายแพ็คไม่เห็น ไม่ขึ้นใบงาน
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {/* 📝 หมายเหตุใบงานของรายการนี้ — อยู่ติดกับรายการเลย ไม่ต้องไปหาที่คอลัมน์ขวา
                      ⚠️ เดิมอยู่หลัง mayEdit อย่างเดียว → กราฟฟิกที่ไม่ใช่หัวหน้า (proof.manage ไม่มี orders.edit) ไม่เห็นหมายเหตุเลย
                      ทั้งที่เป็นคำสั่งงานของตัวเอง (9 ก.ย. 69) → กราฟฟิกเห็นแบบอ่านอย่างเดียว (เซิร์ฟเวอร์ mergeProofFields ไม่รับ adminNote อยู่แล้ว) */}
                  {!mayEdit && mayProof && noteHasText(it.adminNote) && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-xs font-bold text-teal-700">📝 หมายเหตุใบงานของรายการนี้</p>
                      <div
                        className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-snug text-slate-900 ring-1 ring-amber-200 [&_span]:whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: it.adminNote! }}
                      />
                    </div>
                  )}
                  {mayEdit && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setNoteOpen((cur) => ({ ...cur, [i]: !(cur[i] ?? noteHasText(it.adminNote)) }))}
                        className={`text-xs font-bold transition ${
                          noteHasText(it.adminNote) ? "text-teal-700 hover:text-teal-800" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        📝 หมายเหตุใบงานของรายการนี้{noteHasText(it.adminNote) ? " (มีข้อความ)" : ""}{" "}
                        {(noteOpen[i] ?? noteHasText(it.adminNote)) ? "▴" : "▾"}
                      </button>
                      {(noteOpen[i] ?? noteHasText(it.adminNote)) && (
                        <div className="mt-2 rounded-xl bg-teal-50/40 p-2.5 ring-1 ring-teal-100">
                          <RichNoteEditor
                            value={it.adminNote}
                            onChange={(html, commit) => setNote(i, html, commit)}
                            placeholder="หมายเหตุรายการนี้ (เช่น ห่อแยก / งานด่วน) — จะพิมพ์ลงใบงาน"
                          />
                        </div>
                      )}
                    </div>
                  )}
                    </>
                  )}
                  </div>
                </div>
              );
            })}
            {/* 📜 เครื่องมือของทั้งออเดอร์ ไม่ใช่ของรายการใดรายการหนึ่ง — สคริปต์เป็นไฟล์เดียวกันเป๊ะ
                ทุกครั้ง (layerSplitJsx() ไม่รับพารามิเตอร์) และทำงานทีละ "โฟลเดอร์" อยู่แล้ว
                จึงขึ้นครั้งเดียวท้ายรายการสินค้า ไม่ใช่ในทุกลาย/ทุกรายการ */}
            {order.items.some((it, i) => printFilesOf(it, order.id, i).ready.some((r) => r.frame?.tplUrl)) && (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                <span className="shrink-0 text-sm leading-5">📜</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-700">แยกเลเยอร์ไฟล์ “รวมเทมเพลต”</span>
                  <span className={`mt-0.5 block text-[11px] leading-snug ${faint}`}>
                    ไฟล์รวมเปิดมาเป็นชั้นเดียว — รันครั้งเดียวแยกได้ทั้งโฟลเดอร์
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => downloadBlob(layerSplitJsx(), "แยกเลเยอร์-ทั้งโฟลเดอร์.jsx")}
                  className={`${btnSmNeutral} shrink-0 whitespace-nowrap`}
                  title="ใน Illustrator: File → Scripts → Other Script… เลือกไฟล์นี้ → เลือกโฟลเดอร์ → แยกเลเยอร์ทุกไฟล์ .ai ในโฟลเดอร์ เซฟทับไฟล์เดิมแล้วปิดเอง (ได้เลเยอร์ Details Cut + ลายลูกค้า)"
                >
                  โหลด .jsx
                </button>
              </div>
            )}
            {/* 🎁 การ์ดของแถม — ขึ้นเป็นรายการงานต่อท้าย ให้แนบลาย/เห็นว่าต้องใส่กล่อง
                (ข้อมูลอยู่ order.gifts เหมือนเดิม — ห้ามยัดเป็นสินค้า ฿0 เดี๋ยวปนยอด/สต๊อก) */}
            {(order.gifts ?? []).map((g) => (
              <div key={g.promoId} className="overflow-hidden rounded-2xl bg-emerald-50/50 ring-1 ring-emerald-200">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-lg" aria-hidden>🎁</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-emerald-800">
                      ของแถมฟรี — {g.name}
                      {g.size ? ` (${g.size})` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-700">
                      {giftLinesOf(g)
                        .map((ln) => `${ln.label} ×${ln.qty}`)
                        .join(" · ")}{" "}
                      · ต้องใส่กล่องไปกับออเดอร์
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-emerald-600">ฟรี</span>
                </div>
                {/* 🎨 ลาย + 🖼 แบบงานของแถม — โครงเดียวกับการ์ดสินค้า (ซ้ายลายจากลูกค้า · ขวาแบบที่ส่งให้ตรวจ) */}
                {(giftArtLabel(g) || mayEdit || mayProof) && (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-emerald-100 px-4 py-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
                    <div
                      className={`rounded-xl border p-3 transition ${
                        giftArtDragOver === g.promoId ? "border-sky-400 bg-sky-100/70" : "border-sky-200 bg-sky-50/40"
                      }`}
                      /* ลากรูปมาวางได้ทั้งกล่อง (หลายรูปพร้อมกัน) — เข้าท่ออัปโหลดเดียวกับการกดเลือกไฟล์ */
                      onDragOver={(e) => {
                        if (!mayEdit) return;
                        e.preventDefault();
                        if (giftArtBusy !== g.promoId) setGiftArtDragOver(g.promoId);
                      }}
                      onDragLeave={() => setGiftArtDragOver(null)}
                      onDrop={(e) => {
                        if (!mayEdit) return;
                        e.preventDefault();
                        setGiftArtDragOver(null);
                        if (giftArtBusy === g.promoId) return;
                        const files = Array.from(e.dataTransfer.files ?? []);
                        if (!files.length) return;
                        if (!files.some((f) => f.type.startsWith("image/"))) {
                          setErr("ลายต้องเป็นไฟล์รูปภาพ (PNG / JPG / WEBP)");
                          return;
                        }
                        void addGiftArtwork(g.promoId, files);
                      }}
                    >
                      <p className="text-xs font-bold text-sky-800">
                        🎨 ลายของแถม ({g.artworkUrls?.length ?? 0})
                        <span className="ml-1 font-normal text-sky-600">
                          — {giftArtLabel(g) ?? "ลูกค้าส่งลายมาทางแชท แนบแทนได้ · ลากไฟล์มาวางในกล่องนี้ได้เลย"}
                        </span>
                      </p>
                      {(g.artworkUrls?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(g.artworkUrls ?? []).map((u, k) => (
                            <span key={u} className="group relative block">
                              <button
                                type="button"
                                onClick={() => setLightbox({ src: u, alt: `ลายของแถม ${k + 1}`, caption: `ของแถม — ${g.name}` })}
                                className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-sky-400"
                                title="ดูรูปเต็ม"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={`ลายของแถม ${k + 1}`} className="h-full w-full object-cover" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadImage(u, `${order.id}-ของแถม-ลาย${k + 1}.${(u.split(".").pop() || "jpg").split("?")[0]}`)}
                                title="โหลดรูปนี้เก็บลงเครื่อง"
                                aria-label="ดาวน์โหลดลายของแถมรูปนี้"
                                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                              >
                                ⬇
                              </button>
                              {mayEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`เอาลายของแถมใบที่ ${k + 1} ออกจากออเดอร์นี้?\n(ไฟล์ยังอยู่ในคลัง ลบเฉพาะการผูกกับออเดอร์)`))
                                      removeGiftArtwork(g.promoId, u);
                                  }}
                                  title="เอารูปนี้ออกจากออเดอร์"
                                  aria-label="เอาลายของแถมรูปนี้ออก"
                                  className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* แนบลายเพิ่มได้เสมอ — ไทล์เดียวกับกล่องลายจากลูกค้า */}
                      {mayEdit && (
                        <label
                          className="mt-2 inline-grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-sky-300 bg-white text-center text-[10px] font-bold leading-tight text-sky-600 transition hover:bg-sky-50"
                          title="แนบลายของแถม (ลากวางก็ได้)"
                        >
                          {giftArtBusy === g.promoId ? "อัป…" : <span>＋<br />แนบลาย</span>}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="hidden"
                            disabled={giftArtBusy === g.promoId}
                            onChange={(e) => {
                              void addGiftArtwork(g.promoId, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* ขวา: แบบของแถมที่ส่งให้ลูกค้าตรวจ — ลูกค้าเห็นชุดนี้ในการ์ดของแถม แล้วกดอนุมัติ/ขอแก้ */}
                    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                      <p className="text-xs font-bold text-violet-800">
                        🖼 แบบของแถมที่ส่งให้ตรวจ ({(g.proofs ?? []).length})
                        <span className="ml-1 font-normal text-violet-600">— ลูกค้าเห็นชุดนี้ และกดอนุมัติ / ขอแก้ไขได้</span>
                        {g.proofStatus && (
                          <span className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${PROOF_STYLES[g.proofStatus]}`}>
                            {g.proofStatus}
                          </span>
                        )}
                      </p>
                      {g.proofStatus === "ขอแก้ไข" && g.proofNote && (
                        <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                          ✏️ ลูกค้าขอแก้: “{g.proofNote}”
                        </p>
                      )}
                      {(g.proofs ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(g.proofs ?? []).map((p, k) => (
                            <span key={p.url} className="group relative block">
                              <button
                                type="button"
                                onClick={() => setLightbox({ src: p.url, alt: `แบบของแถม รูปที่ ${k + 1}`, caption: `ของแถม — ${g.name}` })}
                                className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-violet-200 transition hover:ring-2 hover:ring-violet-400"
                                title="ดูรูปเต็ม"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.url} alt={`แบบของแถม ${k + 1}`} className="h-full w-full object-cover" />
                              </button>
                              {p.review && (
                                <span
                                  className={`absolute bottom-1 left-1 rounded px-1 text-[9px] font-bold text-white ${
                                    p.review === "อนุมัติ" ? "bg-emerald-500" : "bg-rose-500"
                                  }`}
                                >
                                  {p.review === "อนุมัติ" ? "✓ อนุมัติ" : "✏ ขอแก้"}
                                </span>
                              )}
                              {(mayEdit || mayProof) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`ลบแบบของแถมรูปที่ ${k + 1}?`)) removeGiftProof(g.promoId, p.url);
                                  }}
                                  title="ลบแบบรูปนี้"
                                  aria-label="ลบแบบของแถมรูปนี้"
                                  className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* กราฟฟิก (proof.manage ไม่มี orders.edit) ต้องอัป/ลบแบบของแถมได้เหมือนแบบสินค้า — เดิมล็อกที่ mayEdit อย่างเดียว
                          กราฟฟิกเลยไม่เห็นปุ่มอัปแบบ (10 ก.ย. 69) · ฝั่ง API mergeProofFields รับ gifts[].proofs อยู่แล้ว */}
                      {(mayEdit || mayProof) && (
                        <label
                          className="mt-2 inline-grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-violet-300 bg-white text-center text-[10px] font-bold leading-tight text-violet-600 transition hover:bg-violet-50"
                          title="อัปแบบของแถมให้ลูกค้าตรวจ"
                        >
                          {giftProofBusy === g.promoId ? "อัป…" : <span>＋<br />อัปแบบ</span>}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="hidden"
                            disabled={giftProofBusy === g.promoId}
                            onChange={(e) => {
                              void addGiftProof(g.promoId, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* เพิ่มรายการพิเศษ — งานสั่งทำที่ไม่มีหน้าเว็บ (เฉพาะคนที่แก้ออเดอร์ได้) */}
          {mayEdit && (
            <ItemAdder
              draftKey={`order.${order.id}`}
              actor={actor}
              onShopAdd={() => {
                // ใช้กลไกเดียวกับที่ลูกค้ากด "สั่งเพิ่มในออเดอร์นี้" — ของที่หยิบจะเข้าออเดอร์นี้ ไม่คิดค่าส่งซ้ำ
                try {
                  localStorage.setItem(
                    "iducky-append-order-v1",
                    JSON.stringify({ id: order.id, key: order.key ?? "", customer: order.customer, needShipping: shippingUnset(order) })
                  );
                  localStorage.removeItem("iducky-append-picks-v1");
                } catch {}
                window.open("/products", "_blank", "noopener");
              }}
              onAdd={(item) => {
                const next = withLog(
                  { ...order, items: [...order.items, item] },
                  actor,
                  "เพิ่มรายการพิเศษ",
                  `${item.name} ×${item.qty} @${formatPrice(item.unitPrice)}${item.noProof ? " · ไม่ต้องทำแบบ" : ""}`
                );
                applyOrder(next);
              }}
            />
          )}

          {/* ยอดเงิน — ย้ายมาไว้ใต้รายการสินค้า (มองไล่จากบนลงล่างจบในคอลัมน์เดียว) */}
          <div className={seesMoney ? "" : "hidden"}>
            <GH t="emerald">💰 ยอดเงิน</GH>
            <div className={`mt-2 ${soft("emerald")}`}>
              {/* โซนคำนวณ — ตัวเลขเงินอยู่คอลัมน์ขวาคอลัมน์เดียว (tabular) หลักตรงกันไล่ลงถึงยอดรวม · ตัวเลือก/ช่องกรอกเกาะฝั่งชื่อแถว */}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className={muted}>รวมสินค้า · {qtyText}</span>
                <span className="font-semibold tabular-nums text-slate-800">{formatPrice(subtotal)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                {mayEdit ? (
                  /* เลือกวิธีส่งจากตั้งค่าร้าน — ราคาเติมอัตโนมัติ แล้วแก้ตัวเลขต่อได้ (จุดเดียวของทั้งหน้า) */
                  <>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={`shrink-0 ${muted}`}>ค่าจัดส่ง</span>
                      <select
                        value={shipMethods.find((m) => m.name === resolveShipLabel(order, shipMethods))?.id ?? ""}
                        onChange={(e) => {
                          // ⚡ อัตโนมัติ = ให้ระบบคิดจากของในออเดอร์ (ของเยอะ/ของหนักเด้งกล่องใหญ่เอง) แล้วเติมให้เลย
                          if (e.target.value === AUTO_SHIP) {
                            if (autoShip?.method) applyShipMethod(autoShip.method, autoShip.cost, `อัตโนมัติ — ${autoShip.reason}`);
                            return;
                          }
                          const m = shipMethods.find((x) => x.id === e.target.value);
                          if (m) applyShipMethod(m, m.price);
                        }}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                      >
                        <option value="" disabled>
                          {order.shippingLabel || "เลือกวิธีส่ง…"}
                        </option>
                        {autoShip?.method && (
                          <option value={AUTO_SHIP}>
                            ⚡ อัตโนมัติ — {autoShip.method.name} {formatPrice(autoShip.cost)}
                          </option>
                        )}
                        {shipMethods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — ฿{m.price}
                          </option>
                        ))}
                      </select>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={order.shippingCost}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, shippingCost: Math.max(0, Number(e.target.value) || 0) } : cur))}
                      onFocus={(e) => (e.currentTarget.dataset.orig = String(order.shippingCost))}
                      onBlur={(e) => {
                        // แก้ตัวเลขค่าส่งเองก็คือแก้ยอดบิล — ต้องมีร่องรอยว่าใครเปลี่ยนจากเท่าไรเป็นเท่าไร
                        const orig = Number(e.currentTarget.dataset.orig || 0);
                        if (orig === order.shippingCost) return persist();
                        applyOrder(withLog(order, actor, "แก้ค่าจัดส่ง", `${formatPrice(orig)} → ${formatPrice(order.shippingCost)}`));
                      }}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold tabular-nums text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                  </>
                ) : (
                  <>
                    <span className={muted}>ค่าจัดส่ง</span>
                    <span className="font-semibold tabular-nums text-slate-800">{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
                  </>
                )}
              </div>
              {/* ⚡ ค่าส่งต่ำกว่าที่ระบบคิดให้ — กดปุ่มเดียวเติมให้ตรง (ไม่กดก็ไม่มีอะไรเปลี่ยน) */}
              {mayEdit && shipUnderAuto && autoShip?.method && (
                <button
                  type="button"
                  onClick={() => applyShipMethod(autoShip.method!, autoShip.cost, `อัตโนมัติ — ${autoShip.reason}`)}
                  title={autoShip.reason}
                  className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-2 text-left text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                >
                  <span className="shrink-0">⚡ ใช้ค่าส่งอัตโนมัติ</span>
                  <span className="min-w-0 flex-1 truncate font-normal text-sky-800">
                    {autoShip.method.name} · {autoShip.reason}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatPrice(autoShip.cost)}</span>
                </button>
              )}
              {(order.gifts ?? []).map((g) => (
                <div key={g.promoId}>
                  {giftLinesOf(g).map((ln, k) => (
                    <div key={k} className="mt-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-600">
                      <span className="min-w-0">🎁 ของแถม — {ln.label} ×{ln.qty}</span>
                      <span className="shrink-0">ฟรี</span>
                    </div>
                  ))}
                  {/* 🎨 ของแถมที่ต้องพิมพ์ลาย — บอกกราฟฟิกว่าใช้ลายสินค้า หรือลูกค้าแนบมาต่างหาก */}
                  {giftArtLabel(g) && (
                    <p className="mt-0.5 text-[11px] text-slate-500">🎨 {giftArtLabel(g)}</p>
                  )}
                  {/* การ์ดยอดเงินโชว์ตัวเลขล้วน — แนบ/ลบลายของแถมทำที่การ์ดของแถมในโซนงานแบบด้านบน */}
                </div>
              ))}
              {order.discount && order.discount.amount > 0 && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-600">
                  <span className="min-w-0">{order.discount.label}</span>
                  <span className="shrink-0 tabular-nums">−{formatPrice(order.discount.amount)}</span>
                </div>
              )}
              {earlyPayState(order) === "waived" ? (
                <div
                  className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400"
                  title={`ลูกค้าไม่รับส่วนลดนี้ — ${order.earlyPay!.waivedBy ?? "แอดมิน"} ติ๊กเอาออก ยอดกลับเป็นราคาเต็ม`}
                >
                  <span className="min-w-0">{order.earlyPay!.label} · ลูกค้าไม่รับส่วนลด</span>
                  <span className="shrink-0 tabular-nums line-through">−{formatPrice(order.earlyPay!.amount)}</span>
                </div>
              ) : earlyPayState(order) === "superseded" ? (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400" title="มีส่วนลดอื่นแล้ว (ระดับสมาชิก/คูปอง/ส่วนลดจากแอดมิน) — ส่วนลดโอนไวไม่ใช้ร่วมกัน · ตัดเฉพาะใบที่ยังไม่มีเงินเข้า รับเงินแล้วส่วนลดที่ลูกค้าจ่ายมาคงเดิม">
                  <span className="min-w-0">{order.earlyPay!.label} · ไม่ใช้ร่วมกับส่วนลดอื่น</span>
                  <span className="shrink-0 tabular-nums line-through">−{formatPrice(order.earlyPay!.amount)}</span>
                </div>
              ) : earlyPayState(order) === "expired" ? (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400" title="ลูกค้าไม่ได้แจ้งโอนภายในเวลา ส่วนลดหายไปตามกติกา — เห็นบนสลิปว่าโอนทัน/ตกลงกับลูกค้าแล้ว กดปุ่มคืนส่วนลดด้านล่าง">
                  <span className="min-w-0">{order.earlyPay!.label} · หมดเวลาแจ้งโอน</span>
                  <span className="shrink-0 tabular-nums line-through">−{formatPrice(order.earlyPay!.amount)}</span>
                </div>
              ) : orderEarlyPayAmount(order) > 0 ? (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-600">
                  <span className="min-w-0">
                    {order.earlyPay!.label}
                    {earlyPayState(order) === "active" && (
                      <span className="ml-1 font-normal text-slate-500">⏳ เหลือ {Math.max(1, Math.ceil(earlyPayMsLeft(order) / 60_000))} นาที</span>
                    )}
                    {order.earlyPay!.lockedAt && (
                      <span className="ml-1 font-normal text-slate-500" title={`ล็อกโดย ${order.earlyPay!.lockedBy ?? ""}`}>
                        🔒 {new Date(order.earlyPay!.lockedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">−{formatPrice(orderEarlyPayAmount(order))}</span>
                </div>
              ) : null}
              {/* ☑️ ลูกค้าบางคนขอโอนเต็มจำนวน ไม่เอาส่วนลดโอนไว (โอนมาแล้วจะค้างเป็น "ชำระเกิน ฿5/฿10") — ติ๊กเอาออกแล้วยอดกลับเป็นราคาเต็มทุกหน้าจอ · ติ๊กออกได้ถ้าเข้าใจผิด */}
              {mayEdit && ["active", "locked", "waived"].includes(earlyPayState(order)) && (
                <label className="mt-1 flex w-fit cursor-pointer select-none items-center gap-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">
                  <input
                    type="checkbox"
                    checked={earlyPayState(order) === "waived"}
                    onChange={(e) => {
                      const off = e.target.checked;
                      const next = setEarlyPayWaived(order, off, new Date().toISOString(), actor);
                      // รับก้อนจากเซิร์ฟเวอร์กลับมา — เซิร์ฟเวอร์นับเงินที่ลูกค้าโอนเกินเข้ายอดชำระให้ตอนติ๊ก (ยอดค้างต้องอัปเดตทันที)
                      void applyOrderFromServer(
                        withLog(
                          next,
                          actor,
                          off ? "ยกเลิกส่วนลดโอนไว" : "คืนส่วนลดโอนไว",
                          `${order.earlyPay!.label} ${formatPrice(order.earlyPay!.amount)} — ${off ? "ลูกค้าไม่รับส่วนลด คิดยอดเต็ม" : "กลับมาคิดส่วนลดตามเดิม"}`
                        )
                      );
                    }}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  ลูกค้าไม่รับส่วนลดนี้ (คิดยอดเต็ม)
                </label>
              )}
              {/* ⚡↩️ หมดเวลาแล้วแต่ลูกค้าโอนทัน (SlipOK อ่านเวลาไม่ได้) หรือตกลงกันแล้ว — คืนส่วนลดทีเดียว ไม่ต้องไปใส่ส่วนลดทั้งบิลเอง */}
              {mayEdit && earlyPayState(order) === "expired" && (
                <button
                  type="button"
                  onClick={() => void restoreEarlyPay()}
                  className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  title="ส่วนลดหมดเวลาไปแล้ว — กดคืนเมื่อเห็นบนสลิปว่าลูกค้าโอนทันเวลา หรือตกลงกับลูกค้าแล้ว"
                >
                  ⚡ คืนส่วนลดโอนไว −{formatPrice(order.earlyPay!.amount)}
                </button>
              )}
              {orderItemDiscounts(order) > 0 && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-rose-500">
                  <span>ส่วนลดรายรายการ</span>
                  <span className="tabular-nums">−{formatPrice(orderItemDiscounts(order))}</span>
                </div>
              )}
              {/* ส่วนลดทั้งบิล (แอดมินใส่เอง) — บันทึกตอนออกจากช่อง + ลง log · ช่องเหตุผลเกาะฝั่งชื่อแถว คอลัมน์ขวาเป็นตัวเลขล้วน */}
              {mayEdit ? (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className={`shrink-0 ${muted}`}>ส่วนลดทั้งบิล</span>
                    <input
                      value={order.adminDiscount?.label ?? ""}
                      onChange={(e) =>
                        setOrder((cur) =>
                          cur ? { ...cur, adminDiscount: { amount: cur.adminDiscount?.amount ?? 0, label: e.target.value } } : cur
                        )
                      }
                      onBlur={persist}
                      placeholder="เหตุผล (ถ้ามี)"
                      className="w-full min-w-0 max-w-44 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-semibold text-rose-500">
                    −
                    <input
                      type="number"
                      min={0}
                      value={order.adminDiscount?.pct !== undefined ? (order.adminDiscount.pct || "") : (order.adminDiscount?.amount || "")}
                      placeholder="0"
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        const isPct = order.adminDiscount?.pct !== undefined;
                        setOrder((cur) => {
                          if (!cur) return cur;
                          if (v <= 0 && !isPct) return { ...cur, adminDiscount: cur.adminDiscount?.label ? { label: cur.adminDiscount.label } : undefined };
                          return {
                            ...cur,
                            adminDiscount: isPct
                              ? { label: cur.adminDiscount?.label, pct: Math.min(100, v) }
                              : { label: cur.adminDiscount?.label, amount: v },
                          };
                        });
                      }}
                      onFocus={(e) => (e.currentTarget.dataset.orig = String(adminDiscountAmount(order)))}
                      onBlur={(e) => {
                        const orig = Number(e.currentTarget.dataset.orig || 0);
                        const now = adminDiscountAmount(order);
                        if (orig === now) return persist();
                        const pct = (order.adminDiscount?.pct ?? 0) > 0 ? ` (${order.adminDiscount!.pct}%)` : "";
                        const next = withLog(order, actor, "ส่วนลดทั้งบิล", `−${formatPrice(now)}${pct}${order.adminDiscount?.label ? ` · ${order.adminDiscount.label}` : ""}`);
                        applyOrder(next);
                      }}
                      className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right text-xs font-semibold text-rose-600 focus:border-amber-300 focus:outline-none"
                    />
                    <select
                      value={order.adminDiscount?.pct !== undefined ? "pct" : "baht"}
                      onChange={(e) => {
                        const toPct = e.target.value === "pct";
                        const cur = order.adminDiscount?.pct !== undefined ? order.adminDiscount.pct : (order.adminDiscount?.amount ?? 0);
                        const next = withLog(
                          {
                            ...order,
                            adminDiscount: toPct
                              ? { label: order.adminDiscount?.label, pct: Math.min(100, cur) }
                              : { label: order.adminDiscount?.label, amount: cur },
                          },
                          actor,
                          "ส่วนลดทั้งบิล",
                          `สลับหน่วยเป็น ${toPct ? "%" : "บาท"}`
                        );
                        applyOrder(next);
                      }}
                      className="rounded-md border border-slate-200 bg-white px-1 py-1 text-xs font-semibold text-rose-600 focus:border-amber-300 focus:outline-none"
                    >
                      <option value="baht">฿</option>
                      <option value="pct">%</option>
                    </select>
                    {(order.adminDiscount?.pct ?? 0) > 0 && adminDiscountAmount(order) > 0 && (
                      <span className="text-xs text-slate-400">= −{formatPrice(adminDiscountAmount(order))}</span>
                    )}
                  </span>
                </div>
              ) : (
                adminDiscountAmount(order) > 0 && (
                  <div className="mt-1.5 flex justify-between text-sm font-semibold text-rose-500">
                    <span>{order.adminDiscount?.label || "ส่วนลดพิเศษ"}{(order.adminDiscount?.pct ?? 0) > 0 ? ` (${order.adminDiscount!.pct}%)` : ""}</span>
                    <span>−{formatPrice(adminDiscountAmount(order))}</span>
                  </div>
                )
              )}
              {/* 🧾 ลูกค้าขอใบกำกับภาษีทีหลัง — เปิด VAT 7% บวกจากยอดบิลปัจจุบัน (ยอดค้างขึ้นเอง + แจ้งไลน์) */}
              {!order.vat && mayEdit && seesMoney && !order.claimOf && !order.flowAccount && order.status !== "ยกเลิก" && (
                <button
                  type="button"
                  onClick={enableVat}
                  className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
                >
                  ＋ เปิด VAT 7% — ลูกค้าขอใบกำกับภาษีทีหลัง (+{formatPrice(Math.round(orderTotal(order) * 7) / 100)})
                </button>
              )}
              {/* VAT ตามบิล — ออเดอร์จาก FlowAccount (ราคาสินค้าข้างบนเป็นราคาก่อน VAT) หรือเปิดทีหลังตอนลูกค้าขอใบกำกับ */}
              {order.vat && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className={`flex items-center gap-1.5 ${muted}`}>
                    ภาษีมูลค่าเพิ่ม {order.vat.rate}%
                    {mayEdit && !order.flowAccount && (
                      <button type="button" onClick={removeVat} title="ยกเลิก VAT (ใส่ผิด)" className="rounded-full px-1.5 text-[10px] font-bold text-rose-500 ring-1 ring-rose-200 transition hover:bg-rose-50">
                        ✕
                      </button>
                    )}
                  </span>
                  {mayEdit ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={order.vat.amount}
                      onChange={(e) => setOrder((cur) => (cur?.vat ? { ...cur, vat: { ...cur.vat, amount: Math.max(0, Number(e.target.value) || 0) } } : cur))}
                      onFocus={(e) => (e.currentTarget.dataset.orig = String(order.vat?.amount ?? 0))}
                      onBlur={(e) => {
                        const orig = Number(e.currentTarget.dataset.orig || 0);
                        if (orig === (order.vat?.amount ?? 0)) return persist();
                        applyOrder(withLog(order, actor, "แก้ VAT ตามบิล", `${formatPrice(orig)} → ${formatPrice(order.vat?.amount ?? 0)}`));
                      }}
                      title="แก้ให้ตรงยอด VAT ในเอกสาร FlowAccount"
                      className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold tabular-nums text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                  ) : (
                    <span className="font-semibold tabular-nums text-slate-800">{formatPrice(orderVatAmount(order))}</span>
                  )}
                </div>
              )}
              {/* 🧾 ค่าบริการเพิ่มที่เก็บทีหลัง — บรรทัดแยกจากสินค้า (อยู่นอกฐานส่วนลด %) · ถอดได้ · ปุ่ม "เก็บเพิ่ม" เปิดฟอร์มเล็ก */}
              {(order.charges ?? []).map((c) => (
                <div key={c.id} className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 ${muted}`}>🧾 {c.label}</span>
                    {c.note && (
                      <span className="truncate text-[11px] text-slate-400" title={c.note}>
                        · {c.note}
                      </span>
                    )}
                    {mayEdit && seesMoney && (
                      <button
                        type="button"
                        onClick={() => removeCharge(c)}
                        title={`เพิ่มโดย ${c.by} · ถอดรายการนี้`}
                        className="shrink-0 rounded-full px-1.5 text-[10px] font-bold text-rose-500 ring-1 ring-rose-200 transition hover:bg-rose-50"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatPrice(c.amount)}</span>
                </div>
              ))}
              {mayEdit &&
                seesMoney &&
                order.status !== "ยกเลิก" &&
                !order.claimOf &&
                (chargeForm ? (
                  <div className="mt-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-2.5 text-xs">
                    <p className="font-bold text-amber-800">🧾 เก็บค่าบริการเพิ่ม — ระบบจะแจ้งลูกค้าทางไลน์พร้อมยอดที่ต้องโอนเพิ่มทันที</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {CHARGE_PRESETS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setChargeForm({ ...chargeForm, label: l })}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                            chargeForm.label === l ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-amber-100"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <input
                        value={chargeForm.label}
                        onChange={(e) => setChargeForm({ ...chargeForm, label: e.target.value })}
                        placeholder="ชื่อรายการ เช่น ค่าตัดภาพ 3 รูป"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-amber-300 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        value={chargeForm.amount}
                        onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                        placeholder="บาท"
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-800 focus:border-amber-300 focus:outline-none"
                      />
                    </div>
                    <input
                      value={chargeForm.note}
                      onChange={(e) => setChargeForm({ ...chargeForm, note: e.target.value })}
                      placeholder="เหตุผล/รายละเอียดที่ลูกค้าจะเห็น (ไม่บังคับ)"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button type="button" onClick={() => setChargeForm(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={addCharge}
                        disabled={chargeBusy}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60"
                      >
                        {chargeBusy ? "กำลังบันทึก…" : "เก็บเพิ่ม + แจ้งลูกค้า"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChargeForm({ label: "", amount: "", note: "" })}
                    className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
                  >
                    ＋ เก็บเพิ่ม (ค่าตัดภาพ · ค่าส่งเพิ่ม · ค่าเร่งงาน …)
                  </button>
                ))}
              {/* 📄 ยอดในระบบต้องเท่าใบ FlowAccount ทุกบาท — เพี้ยนง่ายมากเวลาไปแก้ค่าส่ง/ส่วนลด/VAT ทีหลัง
                  (OD-260911-5435: เปลี่ยนวิธีส่งเป็น "มารับเอง" ค่าส่ง ฿100 ในใบหายเงียบ ๆ → SlipOK หาว่าลูกค้าโอนขาด) */}
              {!!faGap && (
                <div className="mt-2.5 rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-800">
                  <p className="font-extrabold">⚠️ ยอดในระบบไม่ตรงกับใบ FlowAccount {order.flowAccount?.docNo ?? ""}</p>
                  <p className="mt-0.5 tabular-nums">
                    ตามใบ <b>{formatPrice(flowAccountBillTotal(order) ?? 0)}</b> · ในระบบ <b>{formatPrice(orderBilledTotal(order))}</b> · ต่าง{" "}
                    <b>{formatPrice(Math.abs(faGap))}</b> ({faGap > 0 ? "ระบบน้อยกว่าใบ" : "ระบบมากกว่าใบ"})
                  </p>
                  <p className="mt-0.5">
                    ลูกค้าโอนตามใบ — ปล่อยไว้ระบบจะตรวจสลิปผิด (หาว่าโอนขาด/โอนเกิน) และใบเสร็จไม่ตรงบิล ·
                    แก้ค่าส่ง/ส่วนลด/VAT ให้ตรงใบ หรือกด “🔄 เทียบกับเอกสารล่าสุด” ในกล่องฟ้าด้านบนสุด
                  </p>
                </div>
              )}
              {/* 🧾 ตัวเลขภาษีไม่ตรงเรต × ยอดก่อน VAT = ค้างของฐานเก่า (แก้รายการทีหลังแล้วภาษีไม่ตาม) หรือพิมพ์ทับเอง
                  ปล่อยไว้ = ยอดรวม/ยอดโอนจริงผิด → ตรวจสลิปเพี้ยนและใบเสร็จไม่ตรงบิล (OD-260915-1705) */}
              {(Math.abs(taxDrift.vat) >= 0.01 || Math.abs(taxDrift.wht) >= 0.01) && (
                <div className="mt-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                  <p className="font-extrabold">⚠️ ตัวเลขภาษีไม่ตรงกับยอดในใบงาน</p>
                  <p className="mt-0.5 tabular-nums">
                    ยอดก่อน VAT <b>{formatPrice(orderTaxBase(order))}</b>
                    {Math.abs(taxDrift.vat) >= 0.01 && (
                      <>
                        {" · "}VAT {order.vat?.rate}% ควรเป็น <b>{formatPrice(orderVatAmount(order) + taxDrift.vat)}</b> แต่ในใบเป็น{" "}
                        <b>{formatPrice(orderVatAmount(order))}</b>
                      </>
                    )}
                    {Math.abs(taxDrift.wht) >= 0.01 && (
                      <>
                        {" · "}หัก ณ ที่จ่าย {order.wht?.rate}% ควรเป็น <b>{formatPrice(orderWhtAmount(order) + taxDrift.wht)}</b> แต่ในใบเป็น{" "}
                        <b>{formatPrice(orderWhtAmount(order))}</b>
                      </>
                    )}
                  </p>
                  {mayEdit && seesMoney && (
                    <button
                      type="button"
                      onClick={() => {
                        const vat = order.vat ? { ...order.vat, amount: taxFromRate(orderTaxBase(order), order.vat.rate) } : undefined;
                        const wht = order.wht ? { ...order.wht, amount: taxFromRate(orderTaxBase(order), order.wht.rate) } : undefined;
                        const next = withLog(
                          { ...order, ...(vat ? { vat } : {}), ...(wht ? { wht } : {}) },
                          actor,
                          "คิดภาษีใหม่ตามยอดในใบงาน",
                          `${vat ? `VAT ${formatPrice(orderVatAmount(order))} → ${formatPrice(vat.amount)}` : ""}${vat && wht ? " · " : ""}${
                            wht ? `หัก ณ ที่จ่าย ${formatPrice(orderWhtAmount(order))} → ${formatPrice(wht.amount)}` : ""
                          }`
                        );
                        void applyOrderFromServer(next);
                      }}
                      className="mt-1.5 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100"
                    >
                      ↻ คิดภาษีใหม่ตามยอดนี้
                    </button>
                  )}
                  <p className="mt-1 text-[11px]">ถ้าบิลจริงเป็นตัวเลขอื่น (บัญชีลูกค้าคิดคนละฐาน) พิมพ์ทับในช่องด้านล่างได้ — แต่ยอดต้องเท่าบิลที่ลูกค้าถือเสมอ</p>
                </div>
              )}
              {/* ── แถบสรุป: ยอดรวมบิล → หัก ณ ที่จ่าย → ยอดโอนจริง จบในก้อนเดียว ──
                  ไม่หักภาษี = ยอดรวมคือเลขใหญ่ · หักภาษี = ยอดโอนจริงคือเลขใหญ่ (เลขที่ต้องเทียบเงินเข้าบัญชี) */}
              <div className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700">ยอดรวม</span>
                  <span
                    className={
                      order.wht && orderWhtAmount(order) > 0
                        ? "text-sm font-bold tabular-nums text-slate-600"
                        : "text-lg font-extrabold tabular-nums tracking-tight text-slate-900"
                    }
                  >
                    {formatPrice(orderTotal(order))}
                  </span>
                </div>

                {/* หัก ณ ที่จ่าย — ลูกค้านิติบุคคลโอนยอดหลังหัก 1%/3% ส่วนต่างต้องตามใบ 50 ทวิ */}
                {(mayEdit || order.wht) && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className={muted}>หัก ณ ที่จ่าย</span>
                      {mayEdit ? (
                        <select
                          value={order.wht?.rate ?? 0}
                          onChange={(e) => {
                            const rate = Number(e.target.value) || 0;
                            // ฐานหัก ณ ที่จ่าย = ยอดก่อน VAT (สรรพากรคิดจากค่าบริการ ไม่ใช่ยอดรวม VAT) — ใบ FlowAccount คิดแบบนี้
                            const amt = taxFromRate(orderTaxBase(order), rate);
                            const next = withLog(
                              { ...order, wht: rate > 0 ? { rate, amount: amt } : undefined },
                              actor,
                              "หัก ณ ที่จ่าย",
                              rate > 0 ? `หัก ${rate}% = ${formatPrice(amt)} · ยอดโอนจริง ${formatPrice(orderTotal(order) - amt)}` : "ยกเลิกหัก ณ ที่จ่าย"
                            );
                            applyOrder(next);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                        >
                          <option value={0}>ไม่หัก</option>
                          <option value={1}>1%</option>
                          <option value={3}>3%</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-600">{order.wht!.rate}%</span>
                      )}
                    </span>
                    {order.wht &&
                      (mayEdit ? (
                        <span className="flex items-center gap-1 font-semibold text-rose-500">
                          −
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={order.wht.amount}
                            onChange={(e) =>
                              setOrder((cur) =>
                                cur?.wht ? { ...cur, wht: { ...cur.wht, amount: Math.max(0, Number(e.target.value) || 0) } } : cur
                              )
                            }
                            onFocus={(e) => (e.currentTarget.dataset.orig = String(order.wht?.amount ?? 0))}
                            onBlur={(e) => {
                              const orig = Number(e.currentTarget.dataset.orig || 0);
                              const now = order.wht?.amount ?? 0;
                              if (orig === now) return persist();
                              // บัญชีลูกค้าคิดฐานไม่เท่าเรา (เช่น ก่อน VAT) — แอดมินแก้ตัวเลขให้ตรงใบ 50 ทวิได้
                              const next = withLog(order, actor, "หัก ณ ที่จ่าย", `แก้ยอดหักเป็น ${formatPrice(now)} (${order.wht?.rate}%)`);
                              applyOrder(next);
                            }}
                            className="w-20 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-rose-600 focus:border-amber-300 focus:outline-none"
                          />
                        </span>
                      ) : (
                        <span className="font-semibold tabular-nums text-rose-500">−{formatPrice(orderWhtAmount(order))}</span>
                      ))}
                  </div>
                )}
                {order.wht && orderWhtAmount(order) > 0 && (
                  <>
                    <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1.5">
                      <span className="text-sm font-bold text-emerald-700">ยอดโอนจริง</span>
                      <span className="text-lg font-extrabold tabular-nums tracking-tight text-emerald-700">{formatPrice(orderNetTransfer(order))}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                      ลูกค้าหักภาษี {order.wht.rate}% แล้วโอนยอดนี้ — ตามหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) มาแทนส่วนต่าง
                    </p>
                  </>
                )}

                {/* 💵 เงินเข้าบัญชีจริง — ธนาคารหักค่าธรรมเนียมจากยอดที่เข้า (SMART/ข้ามธนาคาร) เข้าน้อยกว่ายอดโอนไม่กี่บาท
                    กรอกเลขจากรายการเดินบัญชี → ส่งไปหน้าตรวจสลิป (msVerify) แทนยอดบิล กระทบยอดกับธนาคารได้พอดี
                    ⚠️ ไม่ใช่ยอดชำระ — ไม่ลดยอดบิล ไม่สร้างยอดค้าง (ค่าธรรมเนียมเป็นต้นทุนของร้าน ไม่ใช่ลูกค้าโอนขาด) */}
                {seesMoney && !order.deposit && (mayEdit || orderCashReceived(order) > 0) && (
                  <div className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className={muted}>เงินเข้าบัญชีจริง</span>
                      {mayEdit ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={order.cashReceived ?? ""}
                          placeholder={String(orderNetTransfer(order))}
                          onChange={(e) =>
                            setOrder((cur) => {
                              if (!cur) return cur;
                              const v = e.target.value.trim();
                              return { ...cur, cashReceived: v === "" ? undefined : Math.max(0, Number(v) || 0) };
                            })
                          }
                          onFocus={(e) => (e.currentTarget.dataset.orig = String(order.cashReceived ?? ""))}
                          onBlur={(e) => {
                            const orig = e.currentTarget.dataset.orig ?? "";
                            const now = order.cashReceived != null ? String(order.cashReceived) : "";
                            if (orig === now) return persist();
                            const got = orderCashReceived(order);
                            const fee = orderBankFee(order);
                            applyOrder(
                              withLog(
                                order,
                                actor,
                                "เงินเข้าบัญชีจริง",
                                got > 0
                                  ? `เข้าจริง ${formatPrice(got)} (ยอดโอน ${formatPrice(orderNetTransfer(order))}${fee > 0 ? ` · ธนาคารหักค่าธรรมเนียม ${formatPrice(fee)}` : ""}) — ส่งยอดนี้ไปหน้าตรวจสลิป`
                                  : "ล้างยอดเงินเข้าจริง — กลับไปใช้ยอดโอนตามบิล"
                              )
                            );
                          }}
                          className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-xs font-bold tabular-nums text-slate-800 focus:border-amber-300 focus:outline-none"
                        />
                      ) : (
                        <span className="font-bold tabular-nums text-slate-700">{formatPrice(orderCashReceived(order))}</span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-[10px] leading-snug ${orderBankFee(order) > 0 ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                      {orderBankFee(order) > 0
                        ? `💸 ธนาคารหักค่าธรรมเนียม ${formatPrice(orderBankFee(order))} — ร้านรับเอง ไม่ใช่ลูกค้าโอนขาด · หน้าตรวจสลิปได้ยอด ${formatPrice(orderCashReceived(order))} ตรงกับรายการเดินบัญชี`
                        : "ว่างไว้ = เข้าเท่ายอดโอน · กรอกเมื่อธนาคารหักค่าธรรมเนียม (เลขจากรายการเดินบัญชี)"}
                    </p>
                  </div>
                )}
              </div>

              {/* ── ออเดอร์ธรรมดาที่ยังไม่มีสลิป: ช่องแนบสลิปอยู่ใกล้ยอดรวมเลย (ลูกค้าส่งมาทางแชท) ── */}
              {!order.deposit &&
                mayEdit &&
                !order.slipUrl &&
                !order.slipPath &&
                (order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ") && (
                  <button
                    type="button"
                    onClick={() => pickAdminSlip("first")}
                    disabled={slipUploading}
                    /* รับลากรูปมาวางได้เหมือนช่องสลิปงวดที่ 2 — เข้าท่ออัปโหลดเดียวกับการกดเลือกไฟล์ */
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!slipUploading) setSlipDragOver(true);
                    }}
                    onDragLeave={() => setSlipDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSlipDragOver(false);
                      if (slipUploading) return;
                      const f = e.dataTransfer.files?.[0];
                      if (!f) return;
                      if (!f.type.startsWith("image/")) {
                        setErr("สลิปต้องเป็นไฟล์รูปภาพ (PNG / JPG / WEBP)");
                        return;
                      }
                      slipPhase.current = "first";
                      void uploadAdminSlip(f);
                    }}
                    className={`mt-2.5 w-full rounded-lg border border-dashed px-3 py-2 text-left text-[11px] font-semibold transition disabled:opacity-50 ${
                      slipDragOver
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 bg-transparent text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    {slipUploading
                      ? "กำลังอัปโหลด…"
                      : slipDragOver
                        ? "🫳 วางรูปตรงนี้ได้เลย"
                        : "📎 รอสลิปการโอน — ลูกค้าส่งมาทางแชท? แตะเลือกรูป หรือลากมาวาง"}
                  </button>
                )}

              {/* ── เคยรับเงินแล้วแต่ยอดค้างโต (โอนขาด · สั่งเพิ่ม · ค่าบริการเพิ่ม) — ช่องรอสลิปใบถัดไป ── */}
              {mayEdit && seesMoney && resolveSlipPhase(order) === "extra" && (
                <button
                  type="button"
                  onClick={() => pickAdminSlip("extra")}
                  disabled={slipUploading}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!slipUploading) setSlipDragOver(true);
                  }}
                  onDragLeave={() => setSlipDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSlipDragOver(false);
                    if (slipUploading) return;
                    const f = e.dataTransfer.files?.[0];
                    if (!f) return;
                    if (!f.type.startsWith("image/")) {
                      setErr("สลิปต้องเป็นไฟล์รูปภาพ (PNG / JPG / WEBP)");
                      return;
                    }
                    slipPhase.current = "extra";
                    void uploadAdminSlip(f);
                  }}
                  className={`mt-2.5 w-full rounded-lg border border-dashed px-3 py-2 text-left text-[11px] font-semibold transition disabled:opacity-50 ${
                    slipDragOver ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50/40 text-rose-600 hover:border-rose-400 hover:bg-rose-50"
                  }`}
                >
                  {slipUploading
                    ? "กำลังอัปโหลด…"
                    : slipDragOver
                      ? "🫳 วางรูปตรงนี้ได้เลย"
                      : `📎 รอสลิปโอนเพิ่ม — ค้าง ${formatPrice(amountDueNow(order))} · ลูกค้าส่งมาทางแชท? แตะเลือกรูป หรือลากมาวาง`}
                </button>
              )}

              {/* ── มัดจำ 50% — ลูกค้าขอโอนงวดแรกก่อนเริ่มงาน ── */}
              {!order.deposit && mayEdit && (order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ") && (
                <button
                  type="button"
                  onClick={enableDeposit}
                  className="mt-2.5 w-full rounded-lg border border-dashed border-violet-300 bg-violet-50/60 py-2 text-xs font-bold text-violet-600 transition hover:bg-violet-100"
                >
                  ➗ เปิดโหมดมัดจำ 50% (โอนก่อน {formatPrice(Math.ceil(orderTotal(order) / 2))})
                </button>
              )}
              {order.deposit &&
                (() => {
                  /**
                   * ใบแบ่งงวดแบบบัญชีร้าน — งวดที่ "ยังค้าง" ต้องเด่นสุดในกล่อง (ตัวเลขใหญ่ ตัวหนา)
                   * งวดที่จบแล้วหุบเป็นบรรทัดเงียบสีจาง มี ✓ กับเวลารับเงินพอ (งานค้างเด่นกว่างานจบเสมอ)
                   */
                  const dep = order.deposit;
                  const balance = Math.max(0, orderTotal(order) - dep.amount);
                  const phase: "first" | "balance" | "done" = !dep.firstPaidAt ? "first" : !dep.settledAt ? "balance" : "done";
                  // ➗ ลูกค้าหัก ณ ที่จ่าย: เลขใหญ่ของงวด = "โอนจริง" (เลขที่ต้องเทียบเงินเข้าบัญชี ตรงกับ "ยอดชำระ" ในใบของ FlowAccount)
                  // ยอดงวดรวม VAT + ยอดหักเป็นบรรทัดรอง — เจ้าของร้านสั่ง 11 ก.ย. 69 "โอนจริงมันควรเด่นชัด"
                  const inst = depositInstallments(order)!;
                  const hasWht = inst.wht > 0;
                  const amountBlock = (gross: number, net: number, wht: number, hot: boolean, hotCls: string) => (
                    <div className="flex shrink-0 flex-col items-end">
                      <span className={hot ? hotCls : "text-xs font-bold tabular-nums text-slate-400"}>{formatPrice(hasWht ? net : gross)}</span>
                      {hasWht && (
                        <p className={`text-[10px] font-semibold tabular-nums ${hot ? "text-slate-500" : "text-slate-400"}`}>
                          {hot ? "โอนจริงหลังหัก ณ ที่จ่าย · " : ""}ยอดงวด {formatPrice(gross)} · หัก −{formatPrice(wht)}
                        </p>
                      )}
                    </div>
                  );
                  const thDT = (iso: string) =>
                    new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                  const rowQuiet = "text-xs font-semibold text-slate-400";
                  const rowHot = "text-[13px] font-bold text-slate-800";
                  return (
                    <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {/* หัวใบ: ชื่อโหมด + สถานะรวมของการแบ่งงวด */}
                      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                        <span className="text-[11px] font-bold tracking-wide text-slate-500">แบ่งชำระ 2 งวด · มัดจำ 50%</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                            phase === "done"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : phase === "balance"
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-yellow-50 text-yellow-700 ring-yellow-200"
                          }`}
                        >
                          {phase === "done" ? "รับครบ 100% แล้ว" : phase === "balance" ? "ค้างงวดที่ 2" : "รอมัดจำงวดแรก"}
                        </span>
                      </div>

                      {/* งวดที่ 1 — มัดจำ 50% แรก */}
                      <div className={`flex items-center justify-between gap-3 px-3 ${phase === "first" ? "py-2.5" : "py-2"}`}>
                        <div className="min-w-0">
                          <p className={phase === "first" ? rowHot : rowQuiet}>
                            งวดที่ 1 · มัดจำ 50% แรก{dep.firstPaidAt ? " ✓ รับแล้ว" : ""}
                          </p>
                          {phase === "first" ? (
                            <p className="text-[10px] font-semibold text-yellow-700">รอลูกค้าโอนก่อนเริ่มงาน</p>
                          ) : (
                            dep.firstPaidAt && <p className="text-[10px] text-slate-400">{thDT(dep.firstPaidAt)}</p>
                          )}
                        </div>
                        {amountBlock(
                          dep.amount,
                          inst.firstNet,
                          inst.firstWht,
                          phase === "first",
                          `text-xl font-extrabold tabular-nums tracking-tight ${hasWht ? "text-emerald-700" : "text-slate-900"}`
                        )}
                      </div>
                      <div className="mx-3 border-t border-dashed border-slate-200" />

                      {/* งวดที่ 2 — ยอดคงเหลือ 50% หลัง */}
                      <div className={`flex items-center justify-between gap-3 px-3 ${phase === "balance" ? "py-2.5" : "py-2"}`}>
                        <div className="min-w-0">
                          <p className={phase === "balance" ? "text-[13px] font-bold text-rose-700" : rowQuiet}>
                            งวดที่ 2 · อีก 50% หลัง{phase === "done" ? " ✓ รับแล้ว" : ""}
                          </p>
                          {phase === "balance" ? (
                            <p className="text-[10px] font-semibold text-rose-500">เก็บให้ครบก่อนจัดส่ง</p>
                          ) : phase === "done" && dep.settledAt ? (
                            <p className="text-[10px] text-slate-400">{thDT(dep.settledAt)}</p>
                          ) : (
                            <p className="text-[10px] text-slate-400">เก็บก่อนจัดส่ง</p>
                          )}
                        </div>
                        {amountBlock(balance, inst.secondNet, inst.secondWht, phase === "balance", "text-2xl font-extrabold tabular-nums tracking-tight text-rose-600")}
                      </div>

                      {/* ช่องสลิปงวดที่ 2 — เกาะใต้แถวงวดที่มันเป็นหลักฐาน (ไม่ไปแข่งพื้นที่กับปุ่มยืนยัน) */}
                      {seesMoney && dep.firstPaidAt && (dep.balanceSlipUrl || (mayEdit && phase === "balance")) && (
                        <div className="mx-3 mb-2.5">
                          {dep.balanceSlipUrl ? (
                            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
                              <button
                                type="button"
                                onClick={() =>
                                  setLightbox({ src: dep.balanceSlipUrl!, alt: "สลิปยอดคงเหลือ", caption: `${order.id} · งวดที่ 2 (50% หลัง)` })
                                }
                                aria-label="ขยายดูสลิปงวดหลัง"
                                className="h-9 w-9 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-slate-200 transition hover:border-amber-300"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={dep.balanceSlipUrl} alt="สลิปยอดคงเหลือ" className="h-full w-full object-cover" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-slate-600">สลิปงวดที่ 2 มาแล้ว</p>
                                <p className="text-[10px] text-slate-400">แตะรูปเพื่อขยายดู</p>
                              </div>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={deleteBalanceSlip}
                                  title="แนบผิดใบ — ลบแล้วแนบใหม่ได้"
                                  className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                                >
                                  🗑 ลบ
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => pickAdminSlip("balance")}
                              disabled={slipUploading}
                              /* รับลากรูปมาวางได้ด้วย — เข้าท่ออัปโหลดเดียวกับการกดเลือกไฟล์ */
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (!slipUploading) setSlipDragOver(true);
                              }}
                              onDragLeave={() => setSlipDragOver(false)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setSlipDragOver(false);
                                if (slipUploading) return;
                                const f = e.dataTransfer.files?.[0];
                                if (!f) return;
                                if (!f.type.startsWith("image/")) {
                                  setErr("สลิปต้องเป็นไฟล์รูปภาพ (PNG / JPG / WEBP)");
                                  return;
                                }
                                slipPhase.current = "balance";
                                void uploadAdminSlip(f);
                              }}
                              className={`w-full rounded-lg border border-dashed px-3 py-2 text-left text-[11px] font-semibold transition disabled:opacity-50 ${
                                slipDragOver
                                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                  : "border-slate-300 bg-transparent text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700"
                              }`}
                            >
                              {slipUploading
                                ? "กำลังอัปโหลด…"
                                : slipDragOver
                                  ? "🫳 วางรูปตรงนี้ได้เลย"
                                  : "📎 รอสลิปงวดที่ 2 — ลูกค้าส่งมาทางแชท? แตะเลือกรูป หรือลากมาวาง"}
                            </button>
                          )}
                        </div>
                      )}

                      {/* ท้ายใบ: หมายเหตุชิดซ้าย · ปุ่มยืนยันกะทัดรัดชิดขวา (จอแคบปุ่มลงมาอยู่ล่าง) */}
                      {phase !== "done" && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-2.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="flex-1 text-[10px] leading-snug text-slate-400">
                              ใบงานพิมพ์ได้ แต่ใบปะหน้าพัสดุ/ใบเสร็จและการยิงเลขยังล็อก จนกว่าจะเก็บครบ 100%
                            </p>
                            {mayEdit && phase === "first" && (
                              <div className="flex shrink-0 gap-1.5">
                                <button
                                  type="button"
                                  onClick={cancelDeposit}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                                >
                                  ยกเลิกโหมด
                                </button>
                                {/* ยืนยันรับมัดจำ = ดันสถานะเป็น "ชำระแล้ว" ด้วย → ใช้สิทธิ์ยืนยันเงินเข้าเหมือนกัน */}
                                {mayMarkPaid && (
                                  <button
                                    type="button"
                                    onClick={confirmDepositFirst}
                                    className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 active:scale-[.98]"
                                  >
                                    ยืนยันรับมัดจำ <span className="tabular-nums">{formatPrice(hasWht ? inst.firstNet : dep.amount)}</span>
                                    {hasWht && <span className="ml-1 font-semibold opacity-80">(ยอดงวด {formatPrice(dep.amount)})</span>}
                                  </button>
                                )}
                              </div>
                            )}
                            {mayEdit && mayMarkPaid && phase === "balance" && (
                              <button
                                type="button"
                                onClick={confirmDepositSettled}
                                className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]"
                              >
                                ยืนยันรับงวดที่ 2 ครบ <span className="tabular-nums">{formatPrice(hasWht ? inst.secondNet : balance)}</span>
                                {hasWht && <span className="ml-1 font-semibold opacity-80">(ยอดงวด {formatPrice(balance)})</span>}
                              </button>
                            )}
                          </div>
                          {/* ไม่มีสิทธิ์ยืนยันเงินเข้า — บอกให้รู้ว่าต้องไปตามใคร ไม่ใช่ปุ่มหายเฉย ๆ */}
                          {mayEdit && !mayMarkPaid && (
                            <p className="mt-1.5 rounded-lg bg-white px-2 py-1.5 text-[10px] font-semibold leading-snug text-slate-500 ring-1 ring-slate-200">
                              การยืนยันรับเงินสงวนไว้ให้เจ้าของร้าน (หรือคนที่เปิดสิทธิ์ “ยืนยันเงินเข้า” ไว้) เป็นคนกด
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>

        {/* ── ขวา: ข้อมูล ── */}
        <div className="space-y-4 border-t border-slate-200/70 bg-slate-50/50 px-4 py-5 lg:border-l lg:border-t-0">

          {/* ── 💬 LINE ลูกค้า: ลิงก์ห้องแชท + userId ── */}
          <LineChatBox
            order={order}
            allOrders={allOrders}
            mayEdit={mayEdit}
            demo={demo}
            onSave={(url) => {
              const next = { ...order, lineChatUrl: url || undefined };
              setOrder(next);
              // อัปเดตสำเนาในลิสต์รวมด้วย — ไม่งั้น lineChatOf ไป "จำ" ลิงก์จากตัวเก่าของใบนี้เอง ลบแล้วก็เด้งกลับ
              setAllOrders((cur) => cur.map((o) => (o.id === next.id ? next : o)));
              if (!demo) void saveOrWarn(next);
            }}
            onBound={(next) => {
              setOrder(next);
              // อัปเดตสำเนาในลิสต์รวมด้วย — ไม่งั้น "จำจากใบเก่า" จะไปเจอตัวเก่าของใบนี้เองที่ยังผูกอยู่
              setAllOrders((cur) => cur.map((o) => (o.id === next.id ? next : o)));
            }}
          />

          {/* ── ข้อมูลใบงาน: วันที่จัดส่ง + หมายเหตุ (โชว์ตอนปริ้น) ── */}
          {mayEdit && (
            <div>
              <GH t="teal">🖨 ใบงาน · การจัดส่ง</GH>
              <div className={`mt-2 space-y-4 ${soft("teal")}`}>
                {/*
                  📷 โค้ดสำหรับสแกน — เดิมมีแต่บนใบงานที่ปริ้นออกมา
                  ถ้ายังไม่ได้ปริ้น (หรือใบหาย) ก็ยิงจากจอนี้ได้เลย
                  บาร์โค้ด = เลขออเดอร์ล้วน สำหรับเครื่องยิงที่สถานีแพ็ค
                  QR = ลิงก์หน้านี้ สำหรับเปิดบนมือถือ
                */}
                {origin && (
                  <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="shrink-0">
                      <QRCodeSVG
                        value={`${origin}/admin/orders/${encodeURIComponent(order.id)}?${PACK_SCAN_PARAM}=1`}
                        size={68}
                        level="M"
                        marginSize={0}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-600">📱 สแกนเข้าโหมดแพ็คบนมือถือ</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                        ส่องด้วยกล้องมือถือ → เข้าโหมดแพ็คของใบนี้ทันที เช็คของตามภาพได้เลย ไม่ต้องรอปริ้นใบงาน ·
                        พนักงานแผนกไหนก็ใช้ได้ ขอแค่ล็อกอินหลังบ้านอยู่
                      </p>
                    </div>
                  </div>
                )}

                {/* วันที่จัดส่ง — ปกติช่องเดียว (เจ้าของร้านสั่ง 11 ก.ย. 69) · กด "+ ถึงวันที่" เมื่ออยากนัดเป็นช่วง (สั่ง 14 ก.ย. 69 "ระบุ 1 วันก็ได้ ระบุจาก–ถึงก็ได้")
                    เติมให้เองจากวันใช้งาน (ดู shipWindowForUseBy) · แอดมินแก้ทับได้
                    วันเดียว = เก็บ shipDate.from และ .to เป็นวันเดียวกัน · เป็นช่วง = to มากกว่า from (ใบปริ้น/บอร์ด WIP/หน้าลูกค้าอ่านทั้งคู่และโชว์ช่วงอยู่แล้ว) */}
                {(() => {
                  // วันที่สั่ง → เตือนเมื่อนัดส่งวันเดียวกับวันสั่ง/ก่อนมีรอบคิวผลิต (17 ก.ย. 69)
                  const warns = shipWindowWarnings(order.shipDate, order.useByDate, orderDateYmd(order));
                  const shipFrom = order.shipDate?.from || order.shipDate?.to || "";
                  const shipTo = order.shipDate?.to || order.shipDate?.from || "";
                  const isRange = !!shipTo && shipTo !== shipFrom;
                  const rangeOn = isRange || shipRangeFor === order.id;
                  /** วันส่งเร็วสุด = วันทำการถัดจากวันที่งานเข้าคิวผลิต (สั่งวันไหน ส่งวันนั้นไม่ได้) · งานเร่งที่ตกลงกันแล้ว (🔥) ไม่ล็อก */
                  const orderedOn = orderDateYmd(order);
                  const shipMin = !order.rush && orderedOn ? earliestShipDate(orderedOn) : undefined;
                  const shipMinReason = shipMin
                    ? `⛔ สั่ง ${shortThaiDay(orderedOn)} ไม่มีรอบคิวผลิตส่งในวัน — ส่งได้เร็วสุด ${shortThaiDay(shipMin)} · งานด่วนจริงให้กด 🔥 ทำเป็นงานเร่งก่อน`
                    : undefined;
                  /** กด "+ ถึงวันที่" — มีวันใช้งานอยู่แล้วเติมวันปลายช่วงตามกติกาให้เลย (ก่อนใช้งาน 1 วันทำการ) */
                  const openRange = () => {
                    setShipRangeFor(order.id);
                    const win = order.useByDate ? shipWindowForUseBy(order.useByDate, todayYmd(), orderDateYmd(order)) : null;
                    if (shipFrom && win && win.to > shipFrom) applyOrder({ ...order, shipDate: { from: shipFrom, to: win.to } });
                  };
                  return (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600" title={SHIP_WINDOW_RULE}>
                    📅 วันที่จัดส่ง{rangeOn ? " (ช่วงวันที่)" : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* ปฏิทินของร้านเอง (17 ก.ย. 69): วันหยุดร้านตัวแดงกดไม่ติด · วันก่อนมีรอบคิวผลิต (วันสั่ง) กดไม่ติด — ใบที่ติ๊ก 🔥 งานเร่ง ปลดล็อกวันกระชั้นให้ */}
                    <div className="min-w-[9.5rem] flex-1 [&>div]:block">
                      <HolidayDatePicker
                        value={shipFrom}
                        min={shipMin}
                        minReason={shipMinReason}
                        holidaySelectable={false}
                        ariaLabel="วันที่จัดส่ง"
                        onChange={(v) => {
                          // ช่วงที่ตั้งไว้ยังอยู่ถ้าวันปลายยังอยู่หลังวันเริ่ม · ไม่งั้นยุบเหลือวันเดียว
                          const to = rangeOn && shipTo && v && shipTo > v ? shipTo : v;
                          applyOrder({ ...order, shipDate: { from: v, to } });
                        }}
                        className="min-h-[2.25rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none"
                      />
                    </div>
                    {rangeOn ? (
                      <>
                        {/* "ถึง" ติดกับช่องปลายช่วงเสมอ — คอลัมน์นี้แคบ ถ้าปล่อยให้ตัดบรรทัดแยกกันจะอ่านเป็น "วันที่ ... ถึง" ห้อยท้ายบรรทัด */}
                        <div className="flex min-w-[9.5rem] flex-1 items-center gap-1.5">
                          <span className="shrink-0 text-xs font-bold text-slate-400">ถึง</span>
                          <div className="min-w-0 flex-1 [&>div]:block">
                            <HolidayDatePicker
                              value={shipTo}
                              min={shipFrom || shipMin}
                              minReason={shipFrom ? "⛔ วันส่งถึงต้องไม่ก่อนวันเริ่มส่ง" : shipMinReason}
                              holidaySelectable={false}
                              ariaLabel="ส่งถึงวันที่"
                              onChange={(v) => applyOrder({ ...order, shipDate: { from: shipFrom, to: v || shipFrom } })}
                              className="min-h-[2.25rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          title="เอาช่วงออก — นัดส่งวันเดียว"
                          onClick={() => {
                            setShipRangeFor("");
                            if (isRange) applyOrder({ ...order, shipDate: { from: shipFrom, to: shipFrom } });
                          }}
                          className="min-h-[2.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        >
                          ✕ วันเดียว
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        title="นัดส่งเป็นช่วงวันที่ เช่น ส่ง 10–11 ก.ย."
                        onClick={openRange}
                        className="min-h-[2.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      >
                        + ถึงวันที่
                      </button>
                    )}
                  </div>
                  {warns.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] font-bold text-rose-600">
                      {warns.map((w) => (
                        <li key={w}>⚠️ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
                  );
                })()}

                {/* 🔥 วันที่ลูกค้าต้องใช้งาน + งานเร่ง — สีบอกความด่วนตั้งแต่เหลือบมอง */}
                {(() => {
                  const d = order.useByDate ? daysToUseBy(order) : null;
                  const late = d != null && d < 0;
                  const soon = d != null && d >= 0 && d <= 3;
                  const box = order.rush || late
                    ? "border-rose-300 bg-rose-50"
                    : soon
                      ? "border-orange-300 bg-orange-50"
                      : "border-slate-200 bg-slate-50/70";
                  const head = order.rush || late ? "text-rose-700" : soon ? "text-orange-700" : "text-slate-600";
                  return (
                    <div className={`rounded-xl border p-2.5 transition ${box}`}>
                      <p className={`mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold ${head}`}>
                        🔥 วันที่ลูกค้าต้องใช้งาน
                        {order.rush && (
                          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">งานเร่ง</span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* ปฏิทินร้าน: วันหยุดตัวแดง แต่ไม่ล็อกวัน — ช่องนี้บันทึกตามที่ลูกค้าแจ้งจริง (ตัวล็อกอยู่ที่ช่องวันที่จัดส่ง) */}
                        <div className="min-w-fit flex-1 [&>div]:block">
                        <HolidayDatePicker
                          value={order.useByDate ?? ""}
                          ariaLabel="วันที่ลูกค้าต้องใช้งาน"
                          placeholder="ยังไม่ระบุ"
                          onChange={(picked) => {
                            // ระบุวันใช้งาน → เติมวันส่งให้ทันที (วันเดียว = วันแรกของช่วงที่ควรส่ง · ก่อนใช้งาน 2 วันทำการ เว้นเสาร์-อาทิตย์/วันหยุด)
                            const v = picked || undefined;
                            const win = v ? shipWindowForUseBy(v, todayYmd(), orderDateYmd(order)) : null;
                            // ใบที่แอดมินเปิดโหมดช่วงไว้ เติมให้ทั้งช่วง (จาก–ถึง) · ใบปกติเติมวันเดียว
                            const wide = shipRangeFor === order.id || (!!order.shipDate?.to && order.shipDate.to !== order.shipDate.from);
                            applyOrder({
                              ...order,
                              useByDate: v,
                              ...(win ? { shipDate: { from: win.from, to: wide ? win.to : win.from } } : {}),
                            });
                          }}
                          className={`min-h-[2.25rem] rounded-lg border bg-white px-2 py-1 text-[13px] focus:outline-none ${
                            order.rush || late ? "border-rose-300 font-bold text-rose-700" : soon ? "border-orange-300 font-bold text-orange-700" : "border-slate-200 text-slate-800 focus:border-amber-300"
                          }`}
                        />
                        </div>
                        <button
                          type="button"
                          title={order.rush ? "กดอีกครั้งเพื่อยกเลิกงานเร่ง" : "ทำเครื่องหมายว่าเป็นงานเร่ง"}
                          onClick={() => applyOrder({ ...order, rush: !order.rush })}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            order.rush
                              ? "bg-rose-500 text-white shadow-sm hover:bg-rose-600"
                              : "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                          }`}
                        >
                          {order.rush ? "🔥 งานเร่ง (กดเพื่อยกเลิก)" : "🔥 ทำเป็นงานเร่ง"}
                        </button>
                      </div>
                      {d != null && (
                        <p className={`mt-1 text-[11px] font-bold ${late ? "text-rose-600" : soon ? "text-orange-600" : d <= 7 ? "text-orange-500" : "text-slate-400"}`}>
                          {late ? `⚠️ เลยวันใช้งานมาแล้ว ${Math.abs(d)} วัน` : d === 0 ? "⚠️ ต้องใช้งานวันนี้!" : `เหลืออีก ${d} วันถึงวันใช้งาน`}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* 🛒 รอของเข้า / ต้องสั่งของ — แอดมินติ๊ก (ตอนสร้างคำสั่งซื้อ หรือทีหลังตรงนี้) · ติ๊กแล้วแถบใหญ่ขึ้นบนสุดของหน้า */}
                {mayEdit && (
                  <div className={`rounded-xl border p-2.5 transition ${order.needsPurchase ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50/70"}`}>
                    <p className={`mb-1.5 text-xs font-bold ${order.needsPurchase ? "text-rose-700" : "text-slate-600"}`}>🛒 รอของเข้า / ต้องสั่งของ</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          order.needsPurchase
                            ? saveNeedsPurchase(undefined, "ยกเลิกติ๊กรอของเข้า")
                            : saveNeedsPurchase({ by: actor, at: new Date().toISOString() }, "🛒 ติ๊กรอของเข้า — ต้องสั่งของก่อนผลิต")
                        }
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          order.needsPurchase ? "bg-rose-500 text-white shadow-sm hover:bg-rose-600" : "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                        }`}
                      >
                        {order.needsPurchase ? "🛒 รอของเข้า (กดเพื่อยกเลิก)" : "🛒 ติ๊กว่าต้องสั่งของ"}
                      </button>
                      <span className="text-[11px] text-slate-500">
                        {order.needsPurchase
                          ? order.needsPurchase.arrivedAt
                            ? `ของเข้าแล้ว · ${order.needsPurchase.arrivedBy ?? ""}`
                            : "กรอก “ต้องสั่งอะไร” ที่แถบบนสุดของหน้า · ลูกค้าโอนแล้วระบบแจ้งกลุ่มไลน์ร้านให้เอง"
                          : "ของยังไม่มีในร้าน ต้องสั่งและรอของเข้าก่อนผลิต — กราฟฟิกจะเห็นแถบ “รอของเข้า” บนใบนี้"}
                      </span>
                    </div>
                  </div>
                )}

                {/* 🏭 ส่งเข้าผลิตแล้ว — ติ๊กเองสำหรับใบที่ไม่ผ่านบอร์ดกราฟฟิก TP (ปกติคิวปริ้นอ่านจากการ์ดกราฟฟิกให้เอง) */}
                {(can("orders.edit") || mayProof || can("pack.ship")) && (
                  <div className={`rounded-xl border p-2.5 transition ${order.productionSent ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50/70"}`}>
                    <p className={`mb-1.5 text-xs font-bold ${order.productionSent ? "text-emerald-700" : "text-slate-600"}`}>🏭 ส่งเข้าผลิต (คิวปริ้น)</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        title={
                          order.productionSent
                            ? "กดอีกครั้งเพื่อยกเลิก — ใบจะกลับไปกอง \"ยังไม่ส่งผลิต\" (ถ้าการ์ดกราฟฟิก TP อนุมัติแล้ว ยังนับว่าส่งแล้วอยู่)"
                            : "ใบที่ไม่ได้เดินผ่านบอร์ดกราฟฟิก TP (สั่งโรงงานตรง/งานพิเศษ) ติ๊กตรงนี้ให้ขึ้นกอง \"ส่งผลิตแล้ว รอปริ้น\" ในคิวปริ้น"
                        }
                        onClick={async () => {
                          // 🛒 ใบยังรอของเข้า — ถามย้ำก่อน (เซิร์ฟเวอร์ลง log "ส่งเข้าผลิตทั้งที่ยังรอของเข้า" ให้อีกชั้น)
                          if (!order.productionSent && orderAwaitingStock(order)) {
                            const ok = await askConfirm({
                              icon: "🛒",
                              title: "ใบนี้ยังรอของเข้า — ส่งเข้าผลิตเลยไหม?",
                              detail: `${order.needsPurchase?.note ? `ต้องสั่ง: ${order.needsPurchase.note}\n\n` : ""}ถ้าของเข้าแล้ว ให้กด “✓ ของเข้าแล้ว” ที่แถบบนสุดก่อน แล้วค่อยติ๊กส่งเข้าผลิต`,
                              confirmLabel: "ส่งเข้าผลิตทั้งที่ยังรอของ",
                            });
                            if (!ok) return;
                          }
                          applyOrder(
                            order.productionSent
                              ? withLog({ ...order, productionSent: undefined }, actor, "ยกเลิกติ๊กส่งเข้าผลิต")
                              : withLog({ ...order, productionSent: { by: actor, at: new Date().toISOString() } }, actor, "🏭 ติ๊กส่งเข้าผลิตแล้ว", "ใบขึ้นกอง “ส่งผลิตแล้ว รอปริ้น” ในคิวปริ้น")
                          );
                        }}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          order.productionSent ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {order.productionSent ? "🏭 ส่งเข้าผลิตแล้ว (กดเพื่อยกเลิก)" : "🏭 ติ๊กว่าส่งเข้าผลิตแล้ว"}
                      </button>
                      <span className="text-[11px] text-slate-500">
                        {order.productionSent
                          ? `ติ๊กโดย ${order.productionSent.by} · ${thaiDateTime(new Date(order.productionSent.at))}`
                          : "ปกติไม่ต้องกด — คิวปริ้นอ่านจากการ์ดกราฟฟิกบอร์ด TP (✅ อนุมัติ) ให้เอง · กดเฉพาะใบที่ไม่ผ่านบอร์ด"}
                      </span>
                    </div>
                  </div>
                )}

                {/* หมายเหตุท้ายบิล */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">📄 หมายเหตุท้ายบิล</p>
                  <RichNoteEditor
                    value={order.billNote}
                    onChange={(html, commit) => setNote(null, html, commit)}
                    placeholder="เช่น ขอบคุณที่อุดหนุน 🦆 / นัดรับหน้าร้าน"
                  />
                </div>

                <p className={`text-[11px] ${faint}`}>บันทึกอัตโนมัติ · แสดงบนใบงานตอนปริ้น</p>
              </div>
            </div>
          )}
          {/* 📄 หมายเหตุท้ายบิลสำหรับกราฟฟิกที่ไม่มี orders.edit — ทั้งกล่อง "ใบงาน · การจัดส่ง" ข้างบนซ่อนไป
              แต่หมายเหตุเป็นคำสั่งงานที่กราฟฟิกต้องอ่าน → โชว์อ่านอย่างเดียวเมื่อมีข้อความ (9 ก.ย. 69) */}
          {!mayEdit && mayProof && noteHasText(order.billNote) && (
            <div>
              <GH t="teal">📄 หมายเหตุท้ายบิล</GH>
              <div
                className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-snug text-slate-900 ring-1 ring-amber-200 [&_span]:whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: order.billNote! }}
              />
            </div>
          )}

          {/* ลิงก์ที่ลูกค้าใช้เปิดดูออเดอร์/ตรวจแบบ — ก๊อปส่งให้ลูกค้าได้เลย */}
          <div>
            <GH t="violet">🔗 ลิงก์สำหรับลูกค้า</GH>
            <div className={`mt-2 ${soft("violet")}`}>
              <p className={`text-xs ${muted}`}>ลูกค้าใช้ลิงก์นี้เช็คสถานะ · ดูแบบงาน · กดอนุมัติ</p>
              <p className="mt-1.5 break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
                {customerUrl || "…"}
              </p>
              {/* ปุ่มหลัก = คัดลอกลิงก์ (เต็มแถว) · ปุ่มรองแบ่งครึ่ง · ตัวเลือกไฟล์ทางลัดเป็นลิงก์เล็กใต้ปุ่ม */}
              <button
                type="button"
                disabled={!customerUrl}
                onClick={() => {
                  navigator.clipboard?.writeText(customerUrl).catch(() => {});
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-40 ${
                  linkCopied ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {linkCopied ? "✓ คัดลอกแล้ว" : "🔗 คัดลอกลิงก์"}
              </button>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!customerUrl}
                  onClick={() => downloadOrderShortcut(order.id, customerUrl)}
                  title="ไฟล์ .html — วางในโฟลเดอร์งานของลูกค้า ดับเบิลคลิกแล้วเปิดหน้าออเดอร์ทันที ทั้ง Windows / Mac / มือถือ"
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  ⬇️ ทางลัด .html
                </button>
                <a
                  href={customerUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  ↗ หน้าลูกค้า
                </a>
              </div>
              <p className={`mt-1.5 text-[10px] leading-relaxed ${faint}`}>
                ทางลัด = ไฟล์เปิดออเดอร์นี้ เก็บไว้ในโฟลเดอร์งานลูกค้าคู่กับไฟล์ลาย · ดับเบิลคลิกได้ทุกเครื่อง
                <br />
                อยากได้ทางลัดแบบเนทีฟ:{" "}
                <button
                  type="button"
                  disabled={!customerUrl}
                  onClick={() => downloadOrderShortcut(order.id, customerUrl, os === "mac" ? "webloc" : "url")}
                  title={
                    os === "mac"
                      ? "ไฟล์ .webloc ของ Finder"
                      : "ไฟล์ .url ของ Windows — ถ้าดับเบิลคลิกแล้วขึ้นเป็นข้อความ [InternetShortcut] แปลว่านามสกุล .url ในเครื่องถูกโปรแกรมอื่นยึดไป ให้ใช้ไฟล์ .html แทน"
                  }
                  className="font-bold text-amber-600 underline decoration-amber-300 underline-offset-2 hover:text-amber-700 disabled:opacity-40"
                >
                  {os === "mac" ? "Mac (.webloc)" : "Windows (.url)"}
                </button>
                {" · "}
                <button
                  type="button"
                  disabled={!customerUrl}
                  onClick={() => downloadOrderShortcut(order.id, customerUrl, os === "mac" ? "url" : "webloc")}
                  className="font-bold text-amber-600 underline decoration-amber-300 underline-offset-2 hover:text-amber-700 disabled:opacity-40"
                >
                  {os === "mac" ? "Windows (.url)" : "Mac (.webloc)"}
                </button>
              </p>
              {!order.key && (
                <p className="mt-2 text-[11px] text-amber-700">
                  ⚠️ ออเดอร์นี้สร้างก่อนมีระบบรหัส — ลิงก์ไม่มี key (ยังเปิดได้ปกติ)
                </p>
              )}
            </div>
          </div>


          {/* ── 🧾 หลักฐานการโอน — สลิปทุกใบ (ใบแรก · งวดหลังใบมัดจำ · ใบเพิ่ม) รายการเดียวเรียงตามเวลา + บรรทัดสรุป รับแล้ว/ยอดบิล/ค้าง ── */}
          {seesMoney &&
            (() => {
              const entries = paymentEntries(order);
              const paid = order.paidTotal != null ? paidSoFar(order) : null;
              const bal = orderBalance(order);
              const over = overpaidAmount(order);
              const captionOf = (e: PaymentEntry) => `${order.id} · ใบที่ ${e.n} · ${e.label}`;
              const canAttach = mayEdit && order.status !== "ยกเลิก";
              if (!entries.length && !canAttach) return null;
              return (
                <div>
                  <GH t="green">🧾 หลักฐานการโอน{entries.length > 1 ? ` (${entries.length} ใบ)` : ""}</GH>
                  {!entries.length ? (
                    <div className={`mt-2 flex flex-wrap items-center gap-2 ${soft("green")}`}>
                      <p className="min-w-0 flex-1 text-sm text-slate-500">ยังไม่มีสลิปในออเดอร์นี้</p>
                      <button type="button" onClick={() => pickAdminSlip("auto")} disabled={slipUploading} className={HBTN}>
                        {slipUploading ? "กำลังอัปโหลด…" : "📎 แนบสลิปแทนลูกค้า"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {entries.map((e) => (
                        <div key={e.key}>
                          {e.verify && (
                            <SlipVerifyNote
                              v={e.verify}
                              credited={e.state === "partial" ? e.credited : undefined}
                              settled={
                                e.phase === "first"
                                  ? order.deposit
                                    ? !!order.deposit.firstPaidAt
                                    : !(order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ")
                                  : e.phase === "balance"
                                    ? !!order.deposit?.settledAt
                                    : true
                              }
                              onRecheck={e.state === "fail" || e.state === "pending" ? () => recheckSlip(e.phase, e.paymentId) : undefined}
                              rechecking={slipRechecking}
                            />
                          )}
                          {e.state === "accepted" && e.accepted && (
                            <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              ✅ {e.accepted.by} รับยอด {formatPrice(e.credited ?? 0)} เอง (เทียบกับธนาคารแล้ว)
                            </div>
                          )}
                          {!e.verify && e.state === "pending" && e.phase === "extra" && (
                            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                              ⚠️ ยังไม่ได้ตรวจอัตโนมัติ (SlipOK ไม่พร้อม) — ตรวจยอดเองแล้วกด “รับยอดเอง” หรือ
                              <button
                                type="button"
                                onClick={() => recheckSlip(e.phase, e.paymentId)}
                                disabled={slipRechecking}
                                className="ml-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60"
                              >
                                {slipRechecking ? "⏳ กำลังตรวจ…" : "🔄 ตรวจซ้ำ"}
                              </button>
                            </div>
                          )}
                          {/*
                            แถวสลิป — รูป + ชื่อใบ อยู่บรรทัดบน · ปุ่มทั้งชุดรวมกันอยู่ขวา แล้ว "ตกลงมาทั้งชุด" เมื่อการ์ดแคบ
                            (เดิมปุ่มเป็น shrink-0 เรียงต่อท้ายในแถวเดียว พอคอลัมน์แคบชื่อใบถูกบีบจนเหลือบรรทัดละตัวอักษร)
                          */}
                          <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${soft("green")}`}>
                            {e.url ? (
                              <button
                                type="button"
                                onClick={() => setLightbox({ src: e.url!, alt: `สลิปใบที่ ${e.n}`, caption: captionOf(e) })}
                                aria-label="ขยายดูสลิป"
                                className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition hover:border-amber-300"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={e.url} alt={`สลิปใบที่ ${e.n}`} className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl">🧾</span>
                            )}
                            <div className="min-w-0 flex-1 basis-40">
                              <p className="text-sm font-bold text-slate-800">
                                {entries.length > 1 ? `ใบที่ ${e.n} · ` : ""}
                                {e.label}
                              </p>
                              <p className={`mt-0.5 text-xs ${faint}`}>
                                {[
                                  e.at ? new Date(e.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
                                  e.by && e.by !== "ลูกค้า" ? `แนบโดย ${e.by}` : "",
                                  e.credited ? `นับยอด ${formatPrice(e.credited)}` : "",
                                  e.expected != null ? `ตอนแนบค้าง ${formatPrice(e.expected)}` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                              {e.phase === "extra" && (e.state === "fail" || e.state === "pending") && mayMarkPaid && (
                                <button
                                  type="button"
                                  onClick={() => acceptPayment(e)}
                                  disabled={acceptBusy === e.paymentId}
                                  title="SlipOK ตรวจไม่ได้ — เทียบยอดกับธนาคารแล้วรับยอดใบนี้เอง"
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {acceptBusy === e.paymentId ? "…" : "💰 รับยอดเอง"}
                                </button>
                              )}
                              {e.url && (
                                <button
                                  type="button"
                                  onClick={() => setLightbox({ src: e.url!, alt: `สลิปใบที่ ${e.n}`, caption: captionOf(e) })}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                >
                                  ดูเต็ม
                                </button>
                              )}
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => (e.phase === "first" ? deleteSlip() : e.phase === "balance" ? deleteBalanceSlip() : deletePayment(e))}
                                  title="ลบสลิปใบนี้"
                                  className="rounded-xl px-2.5 py-2 text-xs font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* บรรทัดสรุป: รับแล้ว / ยอดบิล / ค้าง — ภาพเดียวกับที่ลูกค้าเห็น */}
                      {paid != null &&
                        (() => {
                          /*
                           * 💵 ตัวเลขหลักต้องเป็น "เงินเข้าบัญชีจริง" — เดิมเขียน "รับแล้ว ฿1,626.40" ทั้งที่ลูกค้าโอนมา ฿1,580.80
                           * (paidTotal นับภาษีหัก ณ ที่จ่ายที่ลูกค้าส่งสรรพากรแทนร้านรวมเข้าไปด้วย ใบถึงปิดครบได้)
                           * เจ้าของร้านทัก 16 ก.ย. 69 (OD-260915-1705): ยอดนั้นไม่ใช่เงินที่รับเข้าจริง → แยกภาษีออกเป็นอีกก้อน
                           * ภาษีที่ "นับแล้ว" = ยอด deduction ของสลิปที่ผ่าน/รับบางส่วน/แอดมินรับยอดเอง · ไม่มีในสลิป (ยอดปรับมือ) แต่ใบครบ → ใช้ wht ของออเดอร์
                           */
                          const whtCounted = Math.min(
                            paid,
                            entries.reduce(
                              (s, e) => (e.verify?.deduction?.kind === "wht" && (e.state === "pass" || e.state === "partial" || e.state === "accepted") ? s + e.verify.deduction.amount : s),
                              0
                            ) || (bal <= 0 ? orderWhtAmount(order) : 0)
                          );
                          const cash = orderCashReceived(order) || Math.max(0, Math.round((paid - whtCounted) * 100) / 100);
                          const whtRate = order.wht?.rate ?? entries.find((e) => e.verify?.deduction?.kind === "wht")?.verify?.deduction?.rate;
                          return (
                            <div
                              className={`mt-2 flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-xs ring-1 ${
                                bal > 0 ? "bg-rose-50 text-rose-800 ring-rose-200" : over > 0 ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                              }`}
                            >
                              {whtCounted > 0 ? (
                                <span className="font-bold">
                                  เงินเข้าจริง {formatPrice(cash)} + หัก ณ ที่จ่าย{whtRate ? ` ${whtRate}%` : ""} {formatPrice(whtCounted)} = {formatPrice(paid)} / ยอดบิล {formatPrice(orderTotal(order))}
                                </span>
                              ) : (
                                <span className="font-bold">
                                  รับแล้ว {formatPrice(paid)} / ยอดบิล {formatPrice(orderTotal(order))}
                                </span>
                              )}
                              <span className="font-bold">{bal > 0 ? `ค้าง ${formatPrice(bal)}` : over > 0 ? `โอนเกิน ${formatPrice(over)} — คืน/แปลงเป็นแต้ม` : "✓ ครบแล้ว"}</span>
                              {whtCounted > 0 && (
                                <span className="block w-full font-normal opacity-80">
                                  {formatPrice(whtCounted)} ไม่ใช่เงินที่ร้านได้รับ — เป็นภาษีที่ลูกค้าหักส่งสรรพากรแทนร้าน ตามใบ 50 ทวิที่ลูกค้าส่งมาเก็บไว้ · เงินโอนเข้าบัญชีร้านจริง {formatPrice(cash)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      {canAttach && (
                        <button
                          type="button"
                          onClick={() => pickAdminSlip("extra")}
                          disabled={slipUploading}
                          className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                        >
                          {slipUploading ? "กำลังอัปโหลด…" : hasUnpaidBalance(order) ? `＋ แนบสลิปเพิ่ม (ค้าง ${formatPrice(amountDueNow(order))})` : "＋ แนบสลิปเพิ่ม (หลักฐานเพิ่มเติม)"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          <div>
            <GH t="orange">📮 เลขพัสดุ</GH>
            <div className={`mt-2 ${soft("orange")}`}>
              {/* 📋 แผนแบ่งส่ง — แอดมินระบุว่ารูปไหนต้องส่งก่อน ฝ่ายแพ็คทำตาม (ไม่มีแผน = ฝ่ายแพ็คไม่มีปุ่มแบ่งส่ง) */}
              {(mayEdit || (order.shipPlan?.length ?? 0) > 0) && !(order.tracking ?? "").trim() && (
                <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-amber-800">📋 แผนแบ่งส่ง {order.shipPlan?.length ? `· ${order.shipPlan.length} รอบก่อนรอบสุดท้าย` : "— ยังไม่ระบุ (ส่งครบทีเดียว)"}</p>
                    {mayEdit && (
                      <button
                        type="button"
                        onClick={() => setPlanOpen(true)}
                        className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-amber-950 hover:bg-amber-300"
                      >
                        ＋ ระบุของที่ส่งก่อน
                      </button>
                    )}
                  </div>
                  {(order.shipPlan ?? []).map((r, n) => {
                    const done = order.shipments?.[n];
                    const qty = r.proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
                    const open = planDetail === n;
                    return (
                      <div key={`plan-${n}`} className="mt-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] ring-1 ring-amber-100">
                        {/* สรุปสั้น — รายละเอียดรายรูปกดกางดู (เดิมพ่นชื่อทุกรูปยาวเป็นหน้า อ่านไม่ออก · เจ้าของร้านทัก 16 ก.ย. 69) */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-slate-800">
                            รอบที่ {n + 1}: {r.proofs.length} รูป{qty ? ` · รวม ${qty.toLocaleString("th-TH")} ชิ้น` : ""}
                            {r.sampleFolder ? " · 🎁 จากโฟลเดอร์ตัวอย่าง" : ""}
                          </span>
                          {done ? (
                            <span className="font-bold text-green-700">✅ ส่งแล้ว {done.tracking}</span>
                          ) : (
                            <span className="font-bold text-amber-700">รอแพ็ค</span>
                          )}
                          <span className="ml-auto flex items-center gap-2">
                            <button type="button" onClick={() => setPlanDetail(open ? null : n)} className="font-bold text-sky-700 hover:underline">
                              {open ? "▲ ซ่อน" : "🔍 รายละเอียด"}
                            </button>
                            {done ? (
                              <span className="font-bold text-slate-400" title="รอบนี้ยิงเลขพัสดุไปแล้ว แก้ไขไม่ได้">
                                🔒 ส่งแล้ว
                              </span>
                            ) : mayEdit ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPlanEditIdx(n);
                                    setPlanOpen(true);
                                  }}
                                  className="font-bold text-amber-700 hover:underline"
                                >
                                  ✏️ แก้ไข
                                </button>
                                <button type="button" onClick={() => removePlanRound(n)} className="font-bold text-rose-500 hover:underline">
                                  ลบ
                                </button>
                              </>
                            ) : null}
                          </span>
                        </div>
                        {open && (
                          <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {r.proofs.map((p, pi) => {
                              const it = order.items[p.item];
                              const pr = it ? proofsOf(it)[p.proof] : undefined;
                              const url = p.url ?? pr?.url;
                              return (
                                <li key={`${n}-${pi}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-1.5 py-1 ring-1 ring-slate-200">
                                  {url ? (
                                    <button type="button" onClick={() => showProof(p.item, p.proof)} className="h-10 w-10 shrink-0 overflow-hidden rounded bg-white ring-1 ring-slate-200" aria-label="ขยายดูรูป">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt="" className="h-full w-full object-contain" />
                                    </button>
                                  ) : (
                                    <span className="h-10 w-10 shrink-0 rounded bg-slate-200" />
                                  )}
                                  <span className="min-w-0 leading-tight">
                                    <span className="block truncate font-bold text-slate-700">{p.itemName ?? it?.name ?? ""}</span>
                                    <span className="text-slate-500">
                                      รูปที่ {p.proof + 1}
                                      {p.qty ? ` · ${p.qty.toLocaleString("th-TH")}${p.ofQty && p.ofQty > p.qty ? `/${p.ofQty.toLocaleString("th-TH")}` : ""} ${p.unit || "ชิ้น"}` : " · ทั้งรูป"}
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <p className={faint}>
                          {r.dueDate ? `ส่งภายใน ${r.dueDate} · ` : ""}
                          {r.note ? `📝 ${r.note} · ` : ""}
                          {r.by} · {shortTime(r.at)}
                        </p>
                        {/* 🎁➗ ใบมัดจำที่ยังเก็บยอดคงเหลือไม่ครบ: รอบตัวอย่างออกได้ต่อเมื่อเจ้าของร้านอนุมัติ (16 ก.ย. 69) */}
                        {!done && order.deposit?.firstPaidAt && !order.deposit.settledAt && (
                          r.sampleApproved ? (
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-green-700">
                              ✅ เจ้าของร้านอนุมัติส่งตัวอย่างก่อนเก็บยอดคงเหลือ · {r.sampleApproved.by} · {shortTime(r.sampleApproved.at)}
                              {r.samplePrintedAt && (
                                <span className="text-slate-600">
                                  · 🖨 พิมพ์ใบปะหน้าแล้ว {r.samplePrintedAt.by} {shortTime(r.samplePrintedAt.at)} — ล็อกกลับแล้ว
                                  {isOwner && (
                                    <button
                                      type="button"
                                      className="ml-2 rounded-lg bg-violet-100 px-2 py-0.5 font-extrabold text-violet-800 hover:bg-violet-200"
                                      onClick={() => {
                                        const shipPlan = order.shipPlan!.map((x, i) => (i === n ? { ...x, samplePrintedAt: undefined } : x));
                                        applyOrder(withLog({ ...order, shipPlan }, actor, "🔁 อนุญาตพิมพ์ใบปะหน้ารอบตัวอย่างซ้ำ", `รอบที่ ${n + 1} — พิมพ์ได้อีก 1 ครั้ง`));
                                      }}
                                    >
                                      🔁 อนุญาตพิมพ์ซ้ำ
                                    </button>
                                  )}
                                </span>
                              )}
                              {isOwner && (
                                <button
                                  type="button"
                                  className="font-bold text-rose-500 hover:underline"
                                  onClick={() => {
                                    const shipPlan = order.shipPlan!.map((x, i) => (i === n ? { ...x, sampleApproved: undefined } : x));
                                    applyOrder(withLog({ ...order, shipPlan }, actor, "↩️ ถอนอนุมัติส่งตัวอย่าง", `รอบที่ ${n + 1}`));
                                  }}
                                >
                                  ถอนอนุมัติ
                                </button>
                              )}
                            </p>
                          ) : isOwner ? (
                            <button
                              type="button"
                              className="mt-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-violet-500"
                              onClick={() => {
                                const shipPlan = order.shipPlan!.map((x, i) => (i === n ? { ...x, sampleApproved: { by: actor, at: new Date().toISOString() } } : x));
                                applyOrder(
                                  withLog(
                                    { ...order, shipPlan },
                                    actor,
                                    "✅ อนุมัติส่งตัวอย่างก่อนเก็บยอดคงเหลือ",
                                    `รอบที่ ${n + 1}: ${roundProofsText(order, r.proofs)}${qty ? ` · รวม ${qty} ชิ้น` : ""} · ยอดคงเหลือ ${formatPrice(Math.max(0, orderTotal(order) - (order.paidTotal ?? 0)))} ยังไม่เข้า`
                                  )
                                );
                              }}
                            >
                              ✅ อนุมัติส่งตัวอย่างรอบนี้ก่อนเก็บยอดคงเหลือ (เจ้าของร้าน)
                            </button>
                          ) : (
                            <p className="mt-1 text-[11px] font-bold" style={{ color: "#6d28d9" }}>
                              ⏳ รอเจ้าของร้านอนุมัติส่งตัวอย่างก่อนเก็บยอดคงเหลือ — ใบปะหน้า/ปุ่มส่งบางส่วนยังไม่เปิด
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                  {(order.shipPlan?.length ?? 0) > 0 && <p className="mt-1 text-[11px] text-amber-700">รูปที่เหลือ = รอบสุดท้าย ยิงที่ช่องเลขพัสดุด้านล่างตามปกติ</p>}
                </div>
              )}
              {/* 🚚 รอบแบ่งส่งที่ยิงไปแล้ว — เลขรอบสุดท้ายอยู่ช่องด้านล่างเหมือนเดิม */}
              {(order.shipments?.length ?? 0) > 0 && (
                <div className="mb-2 space-y-2">
                  {order.shipments!.map((sh, n) => (
                    <div key={`${sh.tracking}-${n}`} className="rounded-xl bg-sky-50 px-3 py-2 ring-1 ring-sky-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-sky-700">
                          🚚 แบ่งส่ง รอบที่ {n + 1} · {sh.proofs.length} รูป{shipmentQty(sh) ? ` · ${shipmentQty(sh).toLocaleString("th-TH")} ชิ้น` : ""}
                        </p>
                        {mayEdit && (
                          <button type="button" onClick={() => void removeShipment(n)} className="text-[11px] font-bold text-rose-500 hover:underline">
                            ลบรอบนี้
                          </button>
                        )}
                      </div>
                      {sh.pickup ? (
                        <p className="mt-0.5 text-[13px] font-bold text-slate-800">🏪 แพ็คเสร็จรอบนี้ — ลูกค้ามารับเอง (ไม่มีเลขพัสดุ)</p>
                      ) : (
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] font-bold text-slate-800">
                          {sh.tracking} <CopyChip label="คัดลอก" text={() => sh.tracking} />
                        </p>
                      )}
                      <p className={`mt-0.5 text-[11px] ${faint}`}>
                        {sh.by} · {shortTime(sh.at)} · {roundProofsText(order, sh.proofs)}
                        {sh.note ? ` · 📝 ${sh.note}` : ""}
                      </p>
                      {!sh.pickup && <ThaiPostStatus number={sh.tracking.trim()} />}
                    </div>
                  ))}
                  {!(order.tracking ?? "").trim() && !order.packedAt && (
                    <p className="text-[11px] font-bold text-amber-700">
                      {isPickupOrder(order)
                        ? "ใบยังไม่ปิด — ปุ่มด้านล่างคือ “แพ็คเสร็จรอบสุดท้าย” กดแล้วสถานะเป็นแพ็คเสร็จ รอมารับ"
                        : "ใบยังไม่ปิด — ช่องด้านล่างคือเลขพัสดุ “รอบสุดท้าย” ยิงแล้วสถานะเป็นจัดส่งแล้ว"}
                    </p>
                  )}
                </div>
              )}
              {isPickupOrder(order) ? (
                // 🏪 มารับเอง: ไม่มีเลขพัสดุ — ปุ่มแพ็คเสร็จแทน (ด่านตรวจเดียวกับยิงเลข)
                order.packedAt ? (
                  <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-[12px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                    ✅ แพ็คเสร็จแล้ว รอลูกค้ามารับ · {order.packedAt.by} · {shortTime(order.packedAt.at)}
                    {order.status === "เสร็จสิ้น" ? " · ลูกค้ารับแล้ว" : ""}
                  </p>
                ) : packGate(order).planPending && planNext ? (
                  // 📋 แผนแบ่งส่งค้าง: ปิดทั้งใบไม่ได้ — กดแพ็คเสร็จ "เฉพาะรอบนี้" (ใบยังไม่ปิด ที่เหลือกลับไปคิวปริ้นรอบถัดไป)
                  <>
                    <button
                      type="button"
                      onClick={() => setPartialOpen(true)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border-b-4 border-amber-600 bg-amber-400 px-3 py-2.5 text-left text-sm font-extrabold text-amber-950 shadow-md ring-2 ring-amber-500 transition hover:bg-amber-300 active:translate-y-0.5 active:border-b-2"
                    >
                      <span>🏪 แพ็คเสร็จบางส่วน รอบที่ {(order.shipments?.length ?? 0) + 1} (ตามแผนแบ่งส่ง)</span>
                      <span className="shrink-0 text-lg" aria-hidden>
                        →
                      </span>
                    </button>
                    <p className={`mt-1.5 text-[11px] ${faint}`}>
                      ใบนี้แอดมินสั่งแบ่งส่ง — กดแล้วแจ้งลูกค้าให้มารับเฉพาะของรอบนี้ · ใบยังไม่ปิด ของที่เหลือไปรอที่คิวปริ้น “ใบปะหน้ารอบถัดไป”
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={confirmPackedPickup}
                      // ปุ่มแอ็กชันสีเหลืองขอบหนา — ให้รู้ว่ากดได้ ไม่ใช่ป้ายสถานะ (เหมือนปุ่มในโหมดแพ็ค)
                      className="flex w-full items-center justify-between gap-2 rounded-xl border-b-4 border-amber-600 bg-amber-400 px-3 py-2.5 text-left text-sm font-extrabold text-amber-950 shadow-md ring-2 ring-amber-500 transition hover:bg-amber-300 active:translate-y-0.5 active:border-b-2"
                    >
                      <span>🏪 แพ็คเสร็จแล้ว — รอลูกค้ามารับ</span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-950 text-sm text-amber-300" aria-hidden>
                        ✓
                      </span>
                    </button>
                    <p className={`mt-1.5 text-[11px] ${faint}`}>
                      ใบนี้ลูกค้ามารับเอง ไม่ต้องยิงเลขพัสดุ · กดแล้วสถานะเป็น “แพ็คเสร็จ รอมารับ” และแจ้งลูกค้าทางไลน์ · ลูกค้ารับของแล้วค่อยปิดงานเป็นเสร็จสิ้น
                    </p>
                  </>
                )
              ) : (
                <>
                  <input
                    value={order.tracking ?? ""}
                    onChange={(e) => setOrder((cur) => (cur ? { ...cur, tracking: e.target.value } : cur))}
                    onBlur={saveTracking}
                    placeholder={order.shipments?.length ? "เลขพัสดุรอบสุดท้าย — ยิง QR หรือพิมพ์" : "ยิง QR หรือพิมพ์เลขพัสดุ"}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[13px] text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
                  />
                  <p className={`mt-1.5 text-[11px] ${faint}`}>
                    กรอกแล้วสถานะจะเปลี่ยนเป็น “จัดส่งแล้ว” · ลูกค้าจะเห็นเลขนี้ในหน้าเช็คออเดอร์
                  </p>
                  <Link href="/admin/orders/scan" className="mt-1.5 inline-block text-[11px] font-bold text-amber-600 hover:underline">
                    📮 ใช้เครื่องยิง QR แทน →
                  </Link>
                </>
              )}
            </div>
            {(order.tracking ?? "").trim() && <ThaiPostStatus number={order.tracking!.trim()} />}
          </div>

          {/* 📸 ภาพที่ฝ่ายแพ็คถ่ายก่อนปิดกล่อง — โชว์ในหน้าตรวจสอบด้วย (จัดการรูปทำในโหมดแพ็ค) */}
          {(order.packPhotos?.length ?? 0) > 0 && (
            <div>
              <GH t="cyan">📸 ภาพก่อนปิดกล่อง ({order.packPhotos!.length})</GH>
              <div className={`mt-2 ${soft("cyan")}`}>
                <div className="grid grid-cols-3 gap-2">
                  {(order.packPhotos ?? []).map((ph, i) => (
                    <a key={`${ph.url}-${i}`} href={ph.url} target="_blank" rel="noreferrer" className="group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ph.url}
                        alt={`ภาพก่อนปิดกล่อง ${i + 1}`}
                        className="h-20 w-full rounded-lg object-cover ring-1 ring-slate-200 transition group-hover:ring-amber-300"
                      />
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        {ph.by} · {shortTime(ph.at)}
                      </p>
                    </a>
                  ))}
                </div>
                <p className={`mt-1.5 text-[11px] ${faint}`}>ลูกค้าเห็นภาพชุดนี้ในหน้าออเดอร์ด้วย · เพิ่ม/ลบรูปได้ในโหมดแพ็ค</p>
              </div>
            </div>
          )}


          {order.note && (
            <div>
              <GH t="rose">💬 หมายเหตุลูกค้า</GH>
              <p className="mt-2 rounded-xl bg-amber-50/60 p-3 text-sm text-slate-600 ring-1 ring-amber-100">{order.note}</p>
            </div>
          )}

          <div>
            <GH t="slate">🕘 ประวัติการทำงาน{order.log?.length ? ` (${order.log.length})` : ""}</GH>
            <LogTimeline log={order.log} empty="ยังไม่มีประวัติ — จะบันทึกอัตโนมัติเมื่อมีการเปลี่ยนแปลง" />
          </div>
        </div>
      </div>

      {skipGate && <SkipGateModal reasons={skipGate} onCancel={cancelSkipGate} onConfirm={confirmSkipGate} />}
      {partialOpen && (
        <PartialShipModal
          order={order}
          sel={activeShipSel}
          mayEdit={mayEdit}
          editableQty={adHocSplit}
          defaultNote={planNext?.round.note ?? ""}
          pickup={isPickupOrder(order)}
          onCancel={() => setPartialOpen(false)}
          onConfirm={(t, note, sel) => commitPartialShipment(t, note, sel)}
        />
      )}
      {planOpen && (
        <ShipPlanModal
          order={order}
          editIndex={planEditIdx}
          onCancel={() => {
            setPlanOpen(false);
            setPlanEditIdx(null);
          }}
          onSave={(sel, note, due) => savePlanRound(sel, note, due, planEditIdx)}
        />
      )}

      {/* 💰 รับยอดสลิปใบเพิ่มเอง — แทน prompt() ของเบราว์เซอร์ */}
      {acceptForm && (
        <AcceptPaymentModal
          entry={acceptForm}
          order={order}
          busy={acceptBusy === acceptForm.paymentId}
          onCancel={() => setAcceptForm(null)}
          onConfirm={(amount) => confirmAccept(acceptForm, amount)}
        />
      )}

      {/* หน้าตรวจสอบออเดอร์: ขยายรูปดูอย่างเดียว (ไม่มีปุ่มตรวจนับ — งานแพ็คอยู่ในโหมดแพ็ค) */}
      {redoOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setRedoOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-lg font-extrabold text-slate-900">♻️ ทำงานใหม่จากออเดอร์ {order.id}</p>
              <p className="mt-0.5 text-xs text-slate-500">ระบบจะสร้างออเดอร์ใหม่ ใช้ชื่อ/ที่อยู่/สเปคงาน/ลายของลูกค้าชุดเดิม</p>
            </div>

            <div className="space-y-3 p-5">
              {/* เลือกแบบงาน */}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRedoMode("claim")}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    redoMode === "claim" ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white hover:border-rose-200"
                  }`}
                >
                  <p className="text-sm font-extrabold text-rose-700">♻️ งานเคลม</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    งานเสีย/พิมพ์ผิด/ส่งผิด — ทำส่งใหม่ให้ฟรี
                    <span className="mt-0.5 block font-bold text-rose-600">ราคา ฿0 · ค่าส่ง ฿0 · เริ่มงานได้เลย</span>
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setRedoMode("reorder")}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    redoMode === "reorder" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:border-sky-200"
                  }`}
                >
                  <p className="text-sm font-extrabold text-sky-700">🔁 สั่งซ้ำ (ออเดอร์ใหม่)</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    ลูกค้าอยากได้อีก — คิดเงินตามปกติ
                    <span className="mt-0.5 block font-bold text-sky-600">ราคาเดิม · เริ่มที่ “รอชำระเงิน”</span>
                  </p>
                </button>
              </div>

              {/* เหตุผล (บังคับเฉพาะงานเคลม) */}
              {redoMode === "claim" && (
                <div>
                  <p className="text-xs font-bold text-slate-600">เหตุผลที่ต้องเคลม *</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {["งานพิมพ์เสีย/สีเพี้ยน", "ทำผิดสเปค", "ส่งผิดรายการ", "ชำรุดจากขนส่ง", "ของหาย/ไม่ครบ"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRedoReason(r)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${
                          redoReason === r ? "bg-rose-500 text-white ring-rose-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-rose-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    value={redoReason}
                    onChange={(e) => setRedoReason(e.target.value)}
                    placeholder="หรือพิมพ์เหตุผลเอง — จะบันทึกไว้ในประวัติทั้งสองออเดอร์"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none"
                  />
                </div>
              )}

              {/* เลือกรายการ */}
              <div>
                <p className="text-xs font-bold text-slate-600">ทำใหม่รายการไหน (ค่าเริ่มต้น = ทั้งหมด)</p>
                <div className="mt-1 space-y-1">
                  {order.items.map((it, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={redoPicks[i] ?? true}
                        onChange={(e) => setRedoPicks((cur) => ({ ...cur, [i]: e.target.checked }))}
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {i + 1}. {it.name}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        ×{it.qty} · {redoMode === "claim" ? "฿0" : formatPrice(it.unitPrice)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {redoErr && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{redoErr}</p>}
              <p className="text-[11px] leading-relaxed text-slate-400">
                แบบงานเก่าไม่ถูกคัดลอกไป (ต้องทำ/ตรวจใหม่อยู่ดี) แต่ลายที่ลูกค้าแนบมาจะติดไปให้ · ทั้งสองออเดอร์จะลิงก์ถึงกันและลงประวัติไว้
                {redoMode === "claim" && (
                  <span className="mt-1 block font-semibold text-rose-500">
                    🧰 เปิดเคสในหน้า “เคลมสินค้า” ให้เองด้วย (ถ้าออเดอร์นี้มีเคสค้างอยู่จะผูกกับเคสเดิม) — ตามเรื่อง/ตอบลูกค้าต่อได้ที่นั่น
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setRedoOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submitRedo}
                disabled={redoBusy}
                className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white shadow-sm transition disabled:opacity-40 ${
                  redoMode === "claim" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"
                }`}
              >
                {redoBusy ? "กำลังสร้าง…" : redoMode === "claim" ? "สร้างงานเคลม (ฟรี)" : "สร้างออเดอร์สั่งซ้ำ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ช่องเลือกไฟล์สลิปของแอดมิน — ซ่อนไว้ เรียกจากปุ่ม/กล่องเตือน */}
      <input
        ref={adminSlipInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadAdminSlip(f);
          else pendingStatus.current = null;
        }}
      />
      {confirmDialog}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          caption={lightbox.caption}
          {...lightboxNav()}
          onClose={() => setLightbox(null)}
        />
      )}
      </div>
    </PageShell>
  );
}

/**
 * หน้าแพ็คบนมือถือ (แบบ B) — สำหรับฝ่ายแพ็คเท่านั้น เห็นแค่ที่จำเป็น
 * ของแต่ละรายการ + รูปเทียบใหญ่ + 2 ปุ่มยืนยัน + ยิงเลขพัสดุ (ล็อกจนตรวจครบ)
 * ตัดออก: ราคา · ลิงก์ลูกค้า · ปุ่มปริ้น · แก้ไข/ลบแบบ · log ยาว
 */
/**
 * แกลเลอรีปัดดูรูปแบบงาน (สำหรับหน้าแพ็คมือถือ) — ทีละรูป กด "ครบ" เลื่อนไปรูปถัดไปที่ยังไม่ตรวจ
 * มีตัวนับ "ตรวจแล้ว N/M" กันลืม · "ไม่ครบ" เปิดรูปใหญ่ให้กรอกจำนวนที่ได้จริง
 */
function ProofCarousel({
  itemIndex,
  itemName,
  proofs,
  onCheck,
  onZoom,
  shipState,
  planRound,
  planActive,
  planQty,
  shipSelected,
  shipSelQty,
  onToggleShip,
}: {
  itemIndex: number;
  itemName: string;
  proofs: Proof[];
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onZoom: (i: number, j: number) => void;
  /** 🚚 สถานะแบ่งส่งของรูปนี้ — ส่งไปแล้วกี่ชิ้น เหลือกี่ชิ้น รอบไหนบ้าง */
  shipState?: (j: number) => ProofShipState | undefined;
  /** 📋 รูปนี้อยู่ในแผนแบ่งส่งรอบที่เท่าไร (แอดมินระบุ) */
  planRound?: (j: number) => number | undefined;
  /** 📋 รูปนี้อยู่ในรอบถัดไปที่กำลังจะส่ง (ป้ายเข้ม "ส่งก่อน — รอบนี้") */
  planActive?: (j: number) => boolean;
  /** 📋 จำนวนชิ้นที่รอบนี้ต้องส่ง (แบ่งจำนวนได้) */
  planQty?: (j: number) => number | undefined;
  /** 🚚 รูปนี้ถูกติ๊กว่าจะไปกับรอบแบ่งส่งรอบนี้ — ไม่ส่งมา = ใบนี้แบ่งส่งไม่ได้ (รูปเดียว/ปิดแล้ว) */
  shipSelected?: (j: number) => boolean;
  /** 🚚 จำนวนชิ้นที่ติ๊กไว้ให้ไปรอบนี้ */
  shipSelQty?: (j: number) => number | undefined;
  onToggleShip?: (j: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const checked = proofs.filter((p) => p.pack).length;

  const goTo = (idx: number) => {
    const sc = scrollRef.current;
    // ใช้ children ตรง ๆ (เสถียรกว่า inline ref ที่ถูกล้างชั่วขณะตอน re-render)
    const el = sc?.children[idx] as HTMLElement | undefined;
    if (!sc || !el) return;
    // ระยะจากขอบซ้ายของ container ถึงขอบซ้ายของสไลด์ (viewport px) → บวกกับ scroll ปัจจุบัน
    const delta = el.getBoundingClientRect().left - sc.getBoundingClientRect().left;
    // ใช้ 'auto' (เด้งทันที) — 'smooth' โดน scroll-snap-mandatory ดึงกลับ 0
    sc.scrollTo({ left: sc.scrollLeft + delta, behavior: "auto" });
  };

  // อัปเดตจุดบอกตำแหน่งตามการปัด
  const onScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const idx = Math.round(sc.scrollLeft / sc.clientWidth);
    setCurrent(Math.max(0, Math.min(proofs.length - 1, idx)));
  };

  const handleOk = (j: number) => {
    onCheck(itemIndex, j, "ครบ");
    // เลื่อนไปรูปถัดไปที่ยังไม่ตรวจ (วน หา k != j ที่ยังไม่มีผล)
    const order = [...proofs.keys()].filter((k) => k !== j);
    const nextUnchecked = order.find((k) => k > j && !proofs[k].pack) ?? order.find((k) => !proofs[k].pack);
    if (nextUnchecked != null) setTimeout(() => goTo(nextUnchecked), 120);
  };

  // รูปเดียว — ไม่ต้องปัด แสดงเต็ม
  const single = proofs.length === 1;

  return (
    <div>
      {!single && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className={`font-bold ${checked === proofs.length ? "text-green-600" : "text-slate-500"}`}>
            ตรวจแล้ว {checked}/{proofs.length} รูป
          </span>
          <span className="text-slate-400">← ปัดดูรูป →</span>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`proof-carousel flex gap-2 ${single ? "" : "snap-x snap-mandatory overflow-x-auto"}`}
      >
        {proofs.map((p, j) => (
          <div
            key={`${p.url}-${j}`}
            className={`${single ? "w-full" : "w-full shrink-0 snap-center"} overflow-hidden rounded-xl ring-1 ${
              p.pack?.status === "ครบ"
                ? "ring-green-300"
                : p.pack?.status === "ไม่ครบ"
                  ? "ring-rose-300"
                  : "ring-slate-200"
            }`}
          >
            <button
              type="button"
              onClick={() => onZoom(itemIndex, j)}
              className="relative block aspect-[4/3] w-full bg-slate-50"
              aria-label={`ดูแบบงาน ${itemName} รูปที่ ${j + 1} เต็มจอ`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`แบบงาน ${itemName}`} className="h-full w-full object-contain" />
              {p.qty ? (
                <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-bold text-white">
                  {p.qty} {proofUnit(p)}
                </span>
              ) : null}
              {!single && (
                <span className="absolute right-1.5 top-1.5 rounded bg-slate-900/60 px-2 py-0.5 text-xs font-bold text-white">
                  {j + 1}/{proofs.length}
                </span>
              )}
              <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-900/60 px-2 py-0.5 text-[11px] text-white">
                🔍 ดูใหญ่
              </span>
            </button>
            <div className="flex">
              <button
                type="button"
                onClick={() => handleOk(j)}
                className={`flex-1 py-3 text-base font-bold ${
                  p.pack?.status === "ครบ" ? "bg-green-600 text-white" : "bg-slate-50 text-slate-500"
                }`}
              >
                ✓ ครบ
              </button>
              {/* ไม่ครบต้องกรอกจำนวน → เปิดรูปใหญ่ให้กรอกในแผงตรวจนับ */}
              <button
                type="button"
                onClick={() => onZoom(itemIndex, j)}
                className={`flex-1 border-l border-white py-3 text-base font-bold ${
                  p.pack?.status === "ไม่ครบ" ? "bg-rose-600 text-white" : "bg-slate-50 text-slate-500"
                }`}
              >
                {p.pack?.status === "ไม่ครบ" ? `⚠️ ได้ ${p.pack.got ?? 0}` : "✕ ไม่ครบ"}
              </button>
            </div>
            {/* 🚚 แบ่งส่ง — รูปที่ออกไปแล้วบอกรอบ · รูปที่นับครบแล้วติ๊กเลือกไปรอบนี้ได้ (ลูกค้าขอส่งบางลายก่อน) */}
            {(() => {
              const st = shipState?.(j);
              const unit = proofUnit(p);
              // ออกไปครบแล้ว = ไม่ต้องแพ็คซ้ำ · ออกไปบางส่วน = ยังเหลือของรอบถัดไป
              if (st && st.rounds.length > 0 && st.remaining <= 0)
                return <div className="bg-sky-600 py-2 text-center text-xs font-extrabold text-white">🚚 ส่งไปแล้ว — รอบที่ {st.rounds.join(", ")}</div>;
              const sentSome = st && st.shipped > 0;
              // 📋 แอดมินระบุไว้ว่ารูปนี้ส่งก่อน — ฝ่ายแพ็คเห็นป้ายเฉย ๆ ไม่ต้องเลือกเอง
              const pr = planRound?.(j);
              if (pr) {
                const active = planActive?.(j);
                const pq = planQty?.(j);
                return (
                  <div className={`py-2 text-center text-xs font-extrabold ${active ? "bg-amber-400 text-amber-950" : "bg-amber-50 text-amber-700"}`}>
                    📋 แอดมินสั่งส่งก่อน — รอบที่ {pr}
                    {active && pq && st?.labeled ? ` · รอบนี้ ${pq.toLocaleString("th-TH")}/${st.total.toLocaleString("th-TH")} ${unit}` : ""}
                    {sentSome ? ` · ส่งไปแล้ว ${st!.shipped.toLocaleString("th-TH")} เหลือ ${st!.remaining.toLocaleString("th-TH")}` : ""}
                    {active ? (p.pack?.status === "ครบ" ? " · นับครบแล้ว พร้อมยิง" : " · นับรูปนี้แล้วกด ✓ ครบ") : ""}
                  </div>
                );
              }
              if (sentSome)
                return (
                  <div className="bg-sky-50 py-2 text-center text-xs font-extrabold text-sky-700">
                    🚚 ส่งไปแล้ว {st!.shipped.toLocaleString("th-TH")}/{st!.total.toLocaleString("th-TH")} {unit} (รอบที่ {st!.rounds.join(", ")}) · เหลือรอบถัดไป {st!.remaining.toLocaleString("th-TH")}
                  </div>
                );
              if (!shipSelected || !onToggleShip || p.pack?.status !== "ครบ") return null;
              const on = shipSelected(j);
              const sq = shipSelQty?.(j);
              return (
                <button
                  type="button"
                  onClick={() => onToggleShip(j)}
                  className={`flex w-full items-center justify-center gap-2 py-2 text-xs font-extrabold ${
                    on ? "bg-amber-400 text-amber-950" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 place-items-center rounded border-2 text-[10px] leading-none ${
                      on ? "border-amber-900 bg-amber-900 text-white" : "border-amber-500 bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  {on ? `ส่งรอบนี้${sq && st?.labeled ? ` ${sq.toLocaleString("th-TH")}/${st.total.toLocaleString("th-TH")} ${unit} (แก้จำนวนในหน้ายิงเลข)` : " (แบ่งส่ง)"}` : "แบ่งส่ง: เลือกรูปนี้ไปรอบนี้"}
                </button>
              );
            })()}
          </div>
        ))}
      </div>
      {/* จุดบอกตำแหน่ง + สถานะแต่ละรูป */}
      {!single && (
        <div className="mt-2 flex justify-center gap-1.5">
          {proofs.map((p, j) => (
            <button
              key={j}
              type="button"
              onClick={() => goTo(j)}
              aria-label={`ไปรูปที่ ${j + 1}`}
              className={`h-2 rounded-full transition-all ${
                j === current ? "w-5" : "w-2"
              } ${p.pack?.status === "ครบ" ? "bg-green-500" : p.pack?.status === "ไม่ครบ" ? "bg-rose-500" : "bg-slate-300"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * จุดที่ยังต้องยืนยันก่อนยิงเลขพัสดุ — บอกเป็นรายจุดพร้อมชื่อรายการ ไม่ใช่แค่นับจำนวน
 * ใช้ทั้งหัวจอ (เหลือจุดไหนบ้าง) และแถบล่าง (ทำไมยังยิงเลขไม่ได้) ตัวเลขจะได้ตรงกันเสมอ
 */
function packTodos(order: Order, gate: ReturnType<typeof packGate>): { icon: string; text: string }[] {
  const out: { icon: string; text: string }[] = [];
  // ของยังไม่มา/มาไม่ครบขึ้นก่อนสุด — แพ็คต่อไม่ได้เลยจนกว่าของจะถึง
  gate.missing.forEach((m) =>
    out.push({
      icon: "📦",
      text: `${m.status === "ยังไม่มา" ? "ของยังไม่มา" : `ของมาไม่ครบ (${m.got ?? 0}/${m.need})`}: ${m.item}${
        m.expectedAt ? ` · ${arrivalOverdue(m.expectedAt) ? "เลยกำหนด" : "คาดว่ามา"} ${fmtExpected(m.expectedAt)}` : ""
      }`,
    })
  );
  // 📋 แผนแบ่งส่งค้าง — ปิดทั้งใบไม่ได้ ต้องส่งรอบตามแผนทางปุ่มเหลืองก่อน (17 ก.ย. 69 · OD-260911-5435)
  if (gate.planPending)
    out.push({
      icon: "📋",
      text: `แอดมินสั่งแบ่งส่ง รอบที่ ${gate.planPending.round}${gate.planPending.qty ? ` (${gate.planPending.qty.toLocaleString("th-TH")} ชิ้น)` : ""} — กดปุ่มเหลือง “ส่งบางส่วน” ห้ามปิดทั้งใบ`,
    });
  // ของไม่ครบขึ้นก่อน — ต้องถามแอดมินก่อนทำอย่างอื่น
  gate.short.forEach((s) => out.push({ icon: "⚠️", text: `ของไม่ครบ: ${s.item} (นับได้ ${s.got}/${s.need})` }));
  // ตรวจนับ: รวมรูปของรายการเดียวกันเป็นบรรทัดเดียว คนแพ็คไล่ทีละรายการอยู่แล้ว
  const uncountedByItem = new Map<string, number[]>();
  gate.uncounted.forEach((u) => uncountedByItem.set(u.item, [...(uncountedByItem.get(u.item) ?? []), u.index]));
  uncountedByItem.forEach((idx, item) => out.push({ icon: "🔢", text: `ตรวจนับรูป: ${item} (รูปที่ ${idx.join(", ")})` }));
  gate.unread.forEach((n) => out.push({ icon: "📄", text: `ยืนยันอ่านรายละเอียด: ${n}` }));
  gate.unsampled.forEach((n) => out.push({ icon: "🎁", text: `ใส่งานตัวอย่างลงกล่อง: ${n}` }));
  if (gate.noPhoto) out.push({ icon: "📸", text: "ถ่ายภาพของในกล่อง ก่อนปิดกล่อง" });
  if (gate.taxInvoiceUnpacked) out.push({ icon: "🧾", text: "ใส่ใบกำกับภาษีลงกล่อง (พิมพ์จาก FlowAccount)" });
  if (gate.unpaidBalance)
    out.push({ icon: "💳", text: order.deposit ? "เก็บยอดคงเหลือ (มัดจำ) ให้ครบ" : "เก็บส่วนต่างที่ค้างให้ครบ" });
  return out;
}

function PackView({
  order,
  gate,
  shipSel,
  onToggleShip,
  onPartialShip,
  onCheck,
  onAck,
  onSampleAck,
  onSampleClear,
  onTaxInvoiceAck,
  onTaxInvoiceDelivery,
  onArrival,
  onTrackingChange,
  onTrackingSave,
  onTrackingScanned,
  trackingSaved,
  pickup,
  onPickupPacked,
  onNextOrder,
  onZoom,
  onPhotoAdd,
  onPhotoDelete,
  workSizeOf,
}: {
  order: Order;
  /** 📐 ขนาดงานตายตัวของสินค้า (สินค้าที่ไม่มีกลุ่มขนาดให้เลือก) — คนแพ็คเช็คของในกล่องกับขนาดที่สั่ง */
  workSizeOf: (productId: string) => string | undefined;
  gate: ReturnType<typeof packGate>;
  /** 🏪 ใบมารับเอง — ไม่มีพัสดุ ใช้ปุ่ม "แพ็คเสร็จ" แทนช่องเลขพัสดุ */
  pickup: boolean;
  /** กดยืนยันแพ็คเสร็จ (มารับเอง) — ด่านตรวจเดียวกับยิงเลขพัสดุ */
  onPickupPacked: () => void;
  /** 🚚 แบ่งส่ง: รูปที่จะไปกับรอบนี้ (คีย์ "item:proof") — ตามแผนแอดมิน หรือที่แอดมินติ๊กเองในโหมดแพ็ค */
  /** คีย์รูป → จำนวนชิ้นที่จะไปกับรอบแบ่งส่งรอบนี้ */
  shipSel: Map<string, number>;
  /** แอดมินเลือกรูปเองได้ (ไม่มีแผน) · ไม่ส่งมา = ล็อกตามแผน/ไม่มีปุ่มเลือก (ฝ่ายแพ็ค) */
  onToggleShip?: (i: number, j: number) => void;
  /** เปิดโมดัลยิงเลขพัสดุรอบแบ่งส่ง */
  onPartialShip: () => void;
  /** 📷 เลขพัสดุที่สแกนจากกล้องมือถือ — บันทึกทันทีด้วยค่านี้ */
  onTrackingScanned: (v: string) => void;
  /** เลขพัสดุในช่องถูกบันทึกลง DB แล้ว → โชว์ ✅ + ปุ่มสแกนใบถัดไป */
  trackingSaved: boolean;
  /** 📷 สแกนใบปะหน้า/QR ใบงานของออเดอร์ถัดไป → เปิดโหมดแพ็คใบนั้น */
  onNextOrder: (id: string) => void;
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onAck: (i: number) => void;
  onSampleAck: (i: number) => void;
  /** เอาป้าย "มีชิ้นงานตัวอย่าง" ออก (กราฟฟิก/แอดมิน) — ไว้ปลดล็อกใบที่ติ๊กมาผิด ไม่ต้องติ๊กโกหกว่าใส่กล่องแล้ว */
  onSampleClear?: (i: number) => void;
  onTaxInvoiceAck: () => void;
  onTaxInvoiceDelivery: (v: "box" | "email") => void;
  onArrival: (i: number, patch: ArrivalPatch) => void;
  onTrackingChange: (v: string) => void;
  onTrackingSave: () => void;
  onZoom: (i: number, j: number) => void;
  onPhotoAdd: (files: FileList | null) => void;
  onPhotoDelete: (i: number) => void;
}) {
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0);
  const todos = packTodos(order, gate);
  // 🚚 แบ่งส่ง: สถานะรูปแต่ละรูป (ส่งไปแล้ว/เหลือกี่ชิ้น) · แบ่งได้เมื่อมีหลายรูป หรือรูปเดียวแต่หลายชิ้น · จำนวนชิ้นที่ติ๊กไว้
  const shipStates = proofShipStates(order);
  const planRounds = plannedProofRounds(order);
  const planNext = nextPlannedRound(order);
  const partial = partialShipSummary(order);
  const proofCount = order.items.reduce((n, it) => n + proofsOf(it).length, 0);
  const splittable = proofCount > 1 || [...shipStates.values()].some((st) => st.total > 1);
  const canSplit = !!onToggleShip && splittable && !(order.tracking ?? "").trim();
  const selQty = [...shipSel.values()].reduce((n, q) => n + q, 0);
  // 📷 กล้องมือถือของพนักงานเอง — "tracking" = สแกนเลขพัสดุใบนี้ · "next" = สแกนใบถัดไป
  const [cam, setCam] = useState<null | "tracking" | "next">(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 pb-28">
      {/* 📦 คิวแพ็ค/ชุดงานจากสถานี — มีเฉพาะตอนไล่ทำตามคิว · เปิดจาก QR ตรง ๆ ไม่ขึ้น */}
      <PackQueueStrip currentId={order.id} onGo={onNextOrder} />
      {/* หัวเข้ม + ความคืบหน้า */}
      <div className="bg-slate-900 px-4 py-4 text-white">
        <Link href="/admin/orders" className="text-xs text-slate-400">
          ← คำสั่งซื้อทั้งหมด
        </Link>
        <p className="mt-1 font-mono text-xl font-extrabold">{order.id}</p>
        <p className="text-xs text-slate-300">
          {order.customer || "ยังไม่ระบุชื่อ"} · รวม {totalQty} ชิ้น
        </p>
        {/* 📋 แผนแบ่งส่งจากแอดมิน — บอกคนแพ็คตั้งแต่หัวจอว่ารอบนี้เอารูปไหนไป ไม่ต้องเดา */}
        {(order.shipPlan?.length ?? 0) > 0 && !(order.tracking ?? "").trim() && (
          <div className="mt-2 rounded-xl bg-amber-400/15 px-3 py-2 ring-1 ring-amber-400/50">
            <p className="text-sm font-extrabold text-amber-300">📋 แอดมินสั่งแบ่งส่ง</p>
            <ul className="mt-1 space-y-1">
              {order.shipPlan!.map((r, n) => {
                const done = order.shipments?.[n];
                const qty = r.proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
                return (
                  <li key={`hp-${n}`} className={`text-xs font-bold leading-tight ${done ? "text-emerald-300" : "text-amber-50"}`}>
                    {done ? "✅" : n === planNext?.index ? "▶" : "•"} รอบที่ {n + 1}: {roundProofsText(order, r.proofs)}
                    {r.proofs.length > 1 && qty ? ` · รวม ${qty.toLocaleString("th-TH")} ชิ้น` : ""}
                    {r.dueDate ? ` · ส่งภายใน ${r.dueDate}` : ""}
                    {done ? ` · ${done.tracking}` : ""}
                    {r.note ? <span className="block font-normal text-amber-100/80">📝 {r.note}</span> : null}
                  </li>
                );
              })}
              <li className="text-[11px] text-amber-100/70">รูปที่เหลือ = รอบสุดท้าย ยิงที่ช่องเลขพัสดุด้านล่างหลังตรวจครบทั้งใบ</li>
            </ul>
          </div>
        )}
        {partial && (
          <p className="mt-0.5 text-xs font-bold text-sky-300">
            🚚 แบ่งส่งไปแล้ว {partial.rounds} รอบ · {partial.proofsShipped}/{partial.proofsTotal} รูป
            {partial.total ? ` · ${partial.shipped.toLocaleString("th-TH")}/${partial.total.toLocaleString("th-TH")} ชิ้น` : ""} — ที่เหลือยิงเลขรอบสุดท้ายเมื่อครบ
          </p>
        )}
        {/* 📷 ใบถัดไปจากจอนี้เลย — ไม่ต้องกลับไปสถานีหรือเปิดแอปกล้องแยก */}
        <button
          type="button"
          onClick={() => {
            setCamErr(null);
            setCam("next");
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold ring-1 ring-white/20"
        >
          📷 สแกนใบถัดไป <span className="text-xs font-normal text-slate-300">บาร์โค้ดใบปะหน้า / QR ใบงาน</span>
        </button>
        {camErr && <p className="mt-1 text-xs font-bold text-rose-300">{camErr}</p>}
        {/* เหลือกี่จุด + จุดไหนบ้าง — เดิมบอกแค่จำนวน คนแพ็คต้องเลื่อนหาเองว่าค้างตรงไหน */}
        {gate.ready ? (
          <p className="mt-1 text-sm font-bold text-green-400">✅ ตรวจครบแล้ว — ยิงเลขพัสดุได้</p>
        ) : (
          <div className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 ring-1 ring-amber-400/40">
            <p className="text-sm font-extrabold text-amber-300">
              ⏳ เหลืออีก <span className="tabular-nums">{todos.length}</span> จุดต้องยืนยัน
            </p>
            <ul className="mt-1.5 space-y-1">
              {todos.slice(0, 5).map((t, n) => (
                <li key={`${t.text}-${n}`} className="flex gap-1.5 text-xs font-bold leading-tight text-amber-50">
                  <span className="shrink-0">{t.icon}</span>
                  <span className="min-w-0 flex-1">{t.text}</span>
                </li>
              ))}
              {todos.length > 5 && (
                <li className="pl-5 text-xs font-bold text-amber-200/80">+ อีก {todos.length - 5} จุด (เลื่อนดูด้านล่าง)</li>
              )}
            </ul>
          </div>
        )}
        {/* ตรวจครบแล้วค่อยโชว์บาร์โค้ด — ยิงจากจอนี้เข้าสถานีได้เลย ไม่ต้องหาใบงาน */}
        {gate.ready && (
          <div className="mt-3 rounded-xl bg-white p-2 text-center">
            <Barcode value={order.id} displayValue={false} height={38} width={1.3} />
            <p className="text-[10px] leading-tight text-slate-400">ยิงบาร์โค้ดนี้ที่สถานีแพ็ค–ส่ง</p>
          </div>
        )}
      </div>

      {/* รายการ */}
      <div className="space-y-4 p-3">
        {order.items.map((it, i) => {
          const proofs = proofsOf(it);
          // จำนวนที่ระบุไว้บนรูปแบบงาน (ป้ายมุมซ้ายบนของรูป) เทียบกับจำนวนที่ลูกค้าสั่ง
          // หน่วยต่างกัน (เซ็ต/ชุด) เทียบตรง ๆ ไม่ได้ — บอกให้รู้เฉย ๆ ไม่ตีว่าผิด
          const qc = proofQtyCheck(it, proofs);
          const qtyMismatch = qc.comparable && !qc.ok;
          const qtyOtherUnit = qc.total > 0 && !qc.comparable && qc.unit !== "";
          const itemMissing = !!it.arrival && it.arrival.status !== "มาครบ";
          return (
            <div
              key={`${it.productId}-${i}`}
              className={`rounded-2xl bg-white p-3 shadow-sm ${itemMissing ? "ring-2 ring-rose-400" : "ring-1 ring-slate-200"}`}
            >
              {/* งานตัวอย่าง — วางบนสุดให้สะดุดตาก่อนเริ่มแพ็ค · บังคับยืนยันก่อนยิงเลขพัสดุ */}
              {it.sampleRequired && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => onSampleAck(i)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left ${
                      it.samplePacked ? "bg-green-50 ring-1 ring-green-200" : "bg-rose-50 ring-2 ring-rose-300"
                    }`}
                  >
                    <span className="text-lg">{it.samplePacked ? "✅" : "🎁"}</span>
                    <span className="min-w-0 flex-1 text-xs">
                      <span className={`block font-extrabold ${it.samplePacked ? "text-slate-700" : "text-rose-700"}`}>
                        อย่าลืม! ใส่ชิ้นงานตัวอย่าง (ของจริง) ลงกล่อง
                      </span>
                      <span className={it.samplePacked ? "text-green-700" : "font-bold text-rose-600"}>
                        {it.samplePacked
                          ? `ใส่แล้ว · ยืนยันโดย ${it.samplePacked.by}`
                          : "ใส่เรียบร้อยแล้วค่อยแตะยืนยันตรงนี้ — ยังไม่ยืนยัน ยิงเลขพัสดุไม่ได้"}
                      </span>
                    </span>
                  </button>
                  {/* ใบนี้ไม่มีชิ้นงานตัวอย่างจริง (ติ๊กมาผิด/หมายถึงขึ้นแบบในไฟล์) = เอาป้ายออกตรงนี้
                      ไม่งั้นด่านล็อกค้าง แล้วคนแพ็คจะไปอ้อมทางปุ่มแบ่งส่งแทน (15 ก.ย. 69) */}
                  {!it.samplePacked && onSampleClear && (
                    <button
                      type="button"
                      onClick={() => onSampleClear(i)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2 text-[11px] font-bold text-slate-600"
                    >
                      ใบนี้ไม่มีชิ้นงานตัวอย่างของจริง — เอาป้ายนี้ออก
                    </button>
                  )}
                </div>
              )}

              <div className="mb-2 flex items-baseline justify-between">
                <span className="min-w-0">
                  <p className="text-base font-extrabold text-slate-900">{it.name}</p>
                  {/* 📐 สินค้าขนาดเดียว — ขนาดไม่ได้อยู่ในตัวเลือก คนแพ็คจะได้เทียบของในกล่องกับที่สั่งได้ */}
                  {workSizeOf(it.productId) && !/ขนาด/.test(Object.keys(it.sel ?? {}).join("")) && (
                    <p className="text-xs font-bold text-slate-500">ขนาด {workSizeOf(it.productId)}</p>
                  )}
                </span>
                {/* สั่งเป็นเซ็ต/แผ่น = โชว์จำนวนชิ้นจริงต่อท้าย คนแพ็คจะได้นับถูก ("12 เซ็ต = 240 ใบ") */}
                <span className={`text-right text-lg font-black tabular-nums ${qtyMismatch ? "text-rose-600" : "text-slate-900"}`}>
                  {it.qty}
                  <span className={`text-xs font-bold ${qtyMismatch ? "text-rose-400" : "text-slate-400"}`}> {qc.saleUnit || "ชิ้น"}</span>
                  {qc.per > 1 && (
                    <span className="block text-xs font-bold text-slate-500">
                      = {qc.pieces} {qc.piece}
                    </span>
                  )}
                </span>
              </div>

              {/* 📦 ของมาถึงโต๊ะแพ็คหรือยัง — ปักก่อนนับ: ของยังไม่มา/มาไม่ครบ = ออเดอร์ไปรอที่ขั้น "รอของ" ห้ามยิงเลข */}
              <div className="mb-2">
                <ArrivalPicker
                  arrival={it.arrival}
                  need={it.qty}
                  unit={qc.saleUnit || "ชิ้น"}
                  onSave={(patch) => onArrival(i, patch)}
                />
              </div>

              {/* จำนวนบนรูปไม่ตรงกับที่ลูกค้าสั่ง — คนแพ็คต้องเห็นก่อนนับ ไม่งั้นแพ็คตามป้ายบนรูปผิดจำนวน */}
              {qtyMismatch && (
                <div className="mb-2 rounded-xl bg-rose-50 px-3 py-2 ring-2 ring-rose-300">
                  <p className="text-xs font-extrabold text-rose-700">⚠️ จำนวนไม่ตรงกัน — ถามแอดมินก่อนแพ็ค</p>
                  <p className="mt-0.5 text-[11px] font-bold text-rose-600">
                    ป้ายบนรูปรวม <span className="tabular-nums">{qc.total}</span> {qc.unit} · ลูกค้าสั่ง{" "}
                    <span className="tabular-nums">{qc.orderedText}</span>
                  </p>
                </div>
              )}
              {qtyOtherUnit && (
                <p className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                  งานนี้นับเป็น{qc.unit || "คนละหน่วยกัน"} — ป้ายบนรูปรวม <span className="tabular-nums">{qc.total}</span> {qc.unit} (ลูกค้าสั่ง{" "}
                  <span className="tabular-nums">{qc.orderedText}</span>)
                </p>
              )}

              {/* รูปแบบงาน — ปัดดูทีละรูป กด "ครบ" แล้วเลื่อนไปรูปถัดไปที่ยังไม่ตรวจ */}
              {proofs.length > 0 ? (
                <ProofCarousel
                  itemIndex={i}
                  itemName={it.name}
                  proofs={proofs}
                  onCheck={onCheck}
                  onZoom={onZoom}
                  shipState={(j) => shipStates.get(proofKey(i, j))}
                  planRound={(j) => planRounds.get(proofKey(i, j))}
                  planActive={(j) => shipSel.has(proofKey(i, j))}
                  planQty={(j) => shipSel.get(proofKey(i, j))}
                  shipSelected={canSplit ? (j) => shipSel.has(proofKey(i, j)) : undefined}
                  shipSelQty={(j) => shipSel.get(proofKey(i, j))}
                  onToggleShip={canSplit ? (j) => onToggleShip!(i, j) : undefined}
                />
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 ring-1 ring-slate-200">
                  ยังไม่มีรูปแบบงาน
                </p>
              )}

              {/* รายละเอียด + ยืนยันอ่านแล้ว */}
              <button
                type="button"
                onClick={() => onAck(i)}
                className={`mt-2 w-full overflow-hidden rounded-xl text-left ${
                  it.noteAck ? "bg-green-50 ring-1 ring-green-200" : "bg-amber-50 ring-2 ring-amber-400"
                }`}
              >
                <span className="flex items-start gap-2 px-3 pt-3 pb-2">
                  <span className="text-lg leading-none">{it.noteAck ? "✅" : "📄"}</span>
                  <span className="min-w-0 flex-1 text-xs">
                    {/* บรรทัดละหัวข้อเหมือนที่อื่น — คนแพ็คอ่านทีละบรรทัดไม่ตกหล่น (อยู่ในปุ่ม จึงใช้ span ล้วน) */}
                    <span className="block font-bold text-slate-700">
                      {foldSizeExtra(tidySpec(specEntries(it.sel, it.selections, SEL_HIDE_PRODUCTION), { compact: true })).length
                        ? foldSizeExtra(tidySpec(specEntries(it.sel, it.selections, SEL_HIDE_PRODUCTION), { compact: true })).map(([k, v], n) => (
                            <span key={`${k}-${n}`} className="block">
                              {k && <span className="text-slate-500">{specLabel(k)}: </span>}
                              <SelText text={v} plain />
                            </span>
                          ))
                        : "ไม่มีรายละเอียดเพิ่มเติม"}
                    </span>
                    {/* 📝 หมายเหตุใบงานของรายการนี้ (adminNote rich text) — เดิมโชว์แค่บนใบปริ้น คนแพ็คที่สแกน QR ไม่เห็น
                        วางในกล่องเดียวกับสเปค → กด "ยืนยันอ่านแล้ว" ครั้งเดียวครอบทั้งสเปค+หมายเหตุ · HTML ผ่าน sanitizeNoteHtml ตอนเซฟแล้ว */}
                    {noteHasText(it.adminNote) && (
                      <span className="mt-2 block rounded-lg bg-amber-100 px-2.5 py-2 ring-1 ring-amber-300">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-700">📝 หมายเหตุใบงาน</span>
                        <span
                          className="mt-0.5 block text-sm leading-snug text-slate-900 [&_span]:whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: it.adminNote! }}
                        />
                      </span>
                    )}
                  </span>
                </span>
                {/* แถบยืนยัน — แยกออกจากสเปคด้วยเส้นคั่น + พื้นทึบเต็มความกว้าง ให้เห็นว่า "กดได้" ไม่ใช่ข้อความต่อท้าย
                    ยังไม่ยืนยัน = พื้นเหลืองทึบ + ช่องติ๊กว่าง (แยกจากสถานะเสร็จได้แม้ไม่เห็นสี) */}
                <span
                  className={`flex items-center gap-2 border-t px-3 py-3 ${
                    it.noteAck ? "border-green-200 bg-green-100" : "border-amber-500 bg-amber-300"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-black leading-none ${
                      it.noteAck ? "border-green-700 bg-green-700 text-white" : "border-amber-800 bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className={`min-w-0 flex-1 text-sm font-extrabold ${it.noteAck ? "text-green-800" : "text-amber-950"}`}>
                    {it.noteAck ? "ยืนยันอ่านแล้ว" : "ยังไม่ยืนยัน — แตะเพื่อยืนยันว่าอ่านแล้ว"}
                    {/* ยืนยันแล้วบอกด้วยว่าใครกด เหมือนช่องงานตัวอย่าง จะได้ตามถามถูกคน */}
                    {it.noteAck?.by && <span className="block text-[11px] font-bold text-green-700">โดย {it.noteAck.by}</span>}
                  </span>
                </span>
              </button>

            </div>
          );
        })}
      </div>

      {/* 📄 หมายเหตุท้ายบิล (billNote) + หมายเหตุลูกค้า — ระดับออเดอร์ ไม่ผูกกับรายการไหน
          เดิมมีแต่บนใบปริ้น คนแพ็คบนมือถือไม่เห็นเลย · วางก่อนช่องถ่ายรูปให้เห็นก่อนปิดกล่อง */}
      {(noteHasText(order.billNote) || !!order.note) && (
        <div className="px-3 pb-3">
          <div className="rounded-2xl bg-amber-50 p-3 shadow-sm ring-2 ring-amber-300">
            <p className="text-sm font-extrabold text-slate-900">📄 หมายเหตุท้ายบิล</p>
            {noteHasText(order.billNote) && (
              <div
                className="mt-1.5 text-sm leading-snug text-slate-900 [&_span]:whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: order.billNote! }}
              />
            )}
            {order.note && (
              <p className="mt-1.5 text-sm leading-snug text-slate-700">
                <span className="font-bold text-slate-500">หมายเหตุลูกค้า: </span>
                {order.note}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 🧾 ใบกำกับภาษี — บิล FlowAccount/บิล VAT ต้องพิมพ์ใบกำกับใส่กล่องไปด้วย · บังคับยืนยันก่อนยิงเลขพัสดุ */}
      {orderHasTaxInvoice(order) && (
        <div className="px-3 pt-1">
          {(() => {
            const doc = taxInvoiceDocOf(order);
            const byEmail = order.taxInvoiceDelivery === "email";
            const packed = !!order.taxInvoicePacked;
            // เอกสารต้นทางมักเป็นใบเสนอราคา FlowAccount — บอกว่า "อ้างอิง" กันเข้าใจผิดว่าใบนั้นคือใบกำกับ
            const docLine = doc.docNo ? `อ้างอิง ${doc.label} ${doc.docNo}` : "ใบกำกับภาษี";
            if (byEmail)
              return (
                <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200">
                  <span className="text-lg">📧</span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block font-extrabold text-slate-700">ใบกำกับภาษีส่ง E-tax/อีเมลแล้ว — ไม่ต้องแนบกล่อง</span>
                    <span className="text-slate-500">{docLine}{doc.company ? ` · ${doc.company}` : ""}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onTaxInvoiceDelivery("box")}
                    className="shrink-0 rounded-xl border border-slate-300 px-3 py-2.5 text-[11px] font-bold text-slate-600"
                  >
                    ต้องแนบกล่อง
                  </button>
                </div>
              );
            return (
              <div className={`rounded-2xl bg-white p-3 shadow-sm ${packed ? "ring-1 ring-green-200" : "ring-2 ring-rose-300"}`}>
                <button
                  type="button"
                  onClick={onTaxInvoiceAck}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left ${packed ? "bg-green-50" : "bg-rose-50"}`}
                >
                  <span className="text-lg">{packed ? "✅" : "🧾"}</span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className={`block font-extrabold ${packed ? "text-slate-700" : "text-rose-700"}`}>
                      อย่าลืม! ใส่ใบกำกับภาษีลงกล่อง
                    </span>
                    <span className={packed ? "text-green-700" : "font-bold text-rose-600"}>
                      {packed
                        ? `ใส่แล้ว · ยืนยันโดย ${order.taxInvoicePacked!.by}`
                        : "พิมพ์ใบกำกับจาก FlowAccount ใส่กล่องแล้วค่อยแตะยืนยันตรงนี้"}
                    </span>
                  </span>
                </button>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="min-w-0 truncate">
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">
                        {docLine} ↗
                      </a>
                    ) : (
                      docLine
                    )}
                    {doc.company ? ` · ${doc.company}` : ""}
                  </span>
                  {!packed && (
                    <button
                      type="button"
                      onClick={() => onTaxInvoiceDelivery("email")}
                      className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 font-bold text-slate-500"
                      title="ลูกค้ารับใบกำกับทางอีเมลแล้ว ไม่ต้องใส่ตัวจริงลงกล่อง"
                    >
                      ส่งอีเมลแล้ว ไม่ต้องแนบ
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 🚚 รอบแบ่งส่งที่ยิงไปแล้ว — ให้คนแพ็ครู้ว่ารูปไหนออกไปแล้ว ไม่แพ็คซ้ำ */}
      {(order.shipments?.length ?? 0) > 0 && (
        <div className="px-3 pt-1">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-sky-200">
            <p className="text-sm font-extrabold text-slate-900">🚚 แบ่งส่งไปแล้ว {order.shipments!.length} รอบ</p>
            <ul className="mt-1.5 space-y-1.5">
              {order.shipments!.map((sh, n) => (
                <li key={`${sh.tracking}-${n}`} className="rounded-xl bg-sky-50 px-3 py-2 text-xs ring-1 ring-sky-100">
                  <p className="font-bold text-sky-800">
                    รอบที่ {n + 1} · {sh.pickup ? "🏪 แพ็คเสร็จ ลูกค้ามารับเอง" : <span className="font-mono">{sh.tracking}</span>}
                    {shipmentQty(sh) ? ` · ${shipmentQty(sh).toLocaleString("th-TH")} ชิ้น` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {roundProofsText(order, sh.proofs)} · {sh.by} · {shortTime(sh.at)}
                    {sh.note ? ` · 📝 ${sh.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {!(order.tracking ?? "").trim() && (
              <p className="mt-1.5 text-[11px] font-bold text-amber-700">
                {planNext
                  ? `รอบถัดไปตามแผน: รูปที่ติดป้าย “ส่งก่อน” · ส่งครบทุกรูป = ${pickup ? "กดแพ็คเสร็จ" : "ยิงเลขที่ช่อง"}ด้านล่างให้ใบปิด`
                  : `รูปที่เหลือทั้งหมด = รอบสุดท้าย ${pickup ? "กดแพ็คเสร็จ" : "ยิงเลขที่ช่อง"}ด้านล่างให้ใบปิด`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 📸 ภาพก่อนปิดกล่อง — บังคับอย่างน้อย 1 รูปก่อนยิงเลขพัสดุ */}
      <div className="px-3 pt-1">
        <div className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ${gate.noPhoto ? "ring-2 ring-rose-300" : "ring-slate-200"}`}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900">
            📸 ถ่ายภาพของในกล่อง ก่อนปิดกล่อง
            {gate.noPhoto ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">ยังไม่มีภาพ — ต้องถ่ายก่อนยิงเลข</span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">มีภาพแล้ว ✓</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            ถ่ายให้เห็นของครบทุกชิ้นในกล่อง — เก็บเป็นหลักฐานอ้างอิงเมื่อลูกค้าแจ้งของขาด/ผิด
          </p>
          {(order.packPhotos?.length ?? 0) > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(order.packPhotos ?? []).map((p, i) => (
                <div key={`${p.url}-${i}`} className="relative">
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`ภาพก่อนปิดกล่อง ${i + 1}`} className="h-24 w-full rounded-lg object-cover ring-1 ring-slate-200" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onPhotoDelete(i)}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow"
                    aria-label="ลบภาพ"
                  >
                    ✕
                  </button>
                  <p className="mt-0.5 truncate text-[9px] text-slate-400">{p.by}</p>
                </div>
              ))}
            </div>
          )}
          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-xs font-bold text-slate-500 hover:border-sky-300 hover:text-sky-600">
            📷 ถ่ายรูป / เลือกรูปจากเครื่อง
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                onPhotoAdd(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* แถบยิงเลขพัสดุ ติดล่างจอ */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {/* 🚚 ติ๊กรูปไว้ = ยิงเลขรอบแบ่งส่งได้จากตรงนี้ (ไม่ต้องผ่านด่านทั้งใบ — ตรวจเฉพาะรูปที่เลือกในโมดัล) */}
        {shipSel.size > 0 && (
          <button
            type="button"
            onClick={onPartialShip}
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-amber-400 px-3 py-3 text-left text-sm font-extrabold text-amber-950 ring-2 ring-amber-500"
          >
            <span>
              {pickup ? "🏪 แพ็คเสร็จบางส่วน" : "🚚 ส่งบางส่วน"} รอบที่ {(order.shipments?.length ?? 0) + 1}{planNext ? " (ตามแผนแอดมิน)" : ""}
              <span className="block text-[11px] font-bold text-amber-800">
                {shipSel.size} รูป{selQty ? ` · ${selQty.toLocaleString("th-TH")} ชิ้น` : ""} — {pickup ? "แตะเพื่อยืนยันแพ็คเสร็จรอบนี้ (ใบยังไม่ปิด)" : "แตะเพื่อยิงเลขพัสดุรอบนี้"}
              </span>
            </span>
            <span className="shrink-0 text-lg">→</span>
          </button>
        )}
        {gate.planPending && !order.packedAt ? (
          // 📋 แผนแบ่งส่งค้าง: ทางปิดทั้งใบ (ยิงเลขรอบสุดท้าย/แพ็คเสร็จมารับเอง) ปิดไว้ก่อน — ให้เหลือปุ่มเหลืองข้างบนทางเดียว
          // (17 ก.ย. 69 · OD-260911-5435: ใบมารับเองมีแผนรอบ 1 แต่ปุ่มใหญ่ที่กดได้คือ "แพ็คเสร็จ" → ปิดทั้งใบ รอบ 2 หลุดจากคิวปริ้น)
          <div className="rounded-xl bg-sky-50 px-3 py-2.5 ring-1 ring-sky-200">
            <p className="text-sm font-extrabold text-sky-900">
              📋 ใบนี้แอดมินสั่งแบ่งส่ง — รอบที่ {gate.planPending.round}
              {gate.planPending.qty ? ` (${gate.planPending.qty.toLocaleString("th-TH")} ชิ้น)` : ""} ยังไม่ได้ส่ง
            </p>
            <p className="mt-0.5 text-[11px] font-bold leading-tight text-sky-800">
              กดปุ่มเหลืองด้านบนเพื่อ{pickup ? "ยืนยันแพ็คเสร็จ" : "ยิงเลขพัสดุ"}เฉพาะรอบนี้ · ปุ่มปิดทั้งใบจะเปิดเมื่อเหลือแต่รอบสุดท้าย
            </p>
          </div>
        ) : pickup ? (
          // 🏪 มารับเอง: ไม่มีเลขพัสดุให้ยิง — ปุ่มเดียว "แพ็คเสร็จ" แล้วระบบแจ้งลูกค้าให้มารับ
          order.packedAt ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
              <p className="min-w-0 text-sm font-bold text-emerald-800">
                ✅ แพ็คเสร็จแล้ว — รอลูกค้ามารับ
                <span className="block text-[11px] font-semibold text-emerald-700/80">
                  {order.packedAt.by} · {new Date(order.packedAt.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · แจ้งลูกค้าทางไลน์แล้ว
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setCamErr(null);
                  setCam("next");
                }}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white"
              >
                📷 ใบถัดไป
              </button>
            </div>
          ) : gate.ready ? (
            <button
              type="button"
              onClick={onPickupPacked}
              // ต้องดูเป็น "ปุ่มให้กด" ชัด ๆ — สีเหลืองแอ็กชันเดียวกับปุ่มส่งบางส่วน ขอบหนา เงา ปุ่มใหญ่พอกดด้วยนิ้ว
              // (เดิมแถบเขียวเรียบ ๆ คนแพ็คคิดว่าเป็นป้ายสถานะ ไม่รู้ว่ากดได้ — เจ้าของร้าน 11 ก.ย. 69)
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border-b-4 border-amber-600 bg-amber-400 px-4 py-4 text-left text-amber-950 shadow-lg shadow-amber-500/30 ring-2 ring-amber-500 transition hover:bg-amber-300 active:translate-y-0.5 active:border-b-2 active:shadow-md"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-extrabold uppercase tracking-wide text-amber-800/80">ขั้นสุดท้าย · กดปุ่มนี้เมื่อแพ็คเสร็จ</span>
                <span className="mt-0.5 block text-lg font-extrabold leading-tight">🏪 แพ็คเสร็จแล้ว — รอลูกค้ามารับ</span>
                <span className="mt-1 block text-[11px] font-semibold text-amber-900/70">ใบนี้ลูกค้ามารับเอง ไม่ต้องยิงเลขพัสดุ · กดแล้วระบบแจ้งลูกค้าทางไลน์ให้มารับ</span>
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-950 text-xl font-black text-amber-300 transition group-hover:scale-105" aria-hidden>
                ✓
              </span>
            </button>
          ) : (
            <div className="rounded-xl bg-slate-100 px-3 py-3 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <span className="grayscale">🔒</span> ตรวจให้ครบก่อน ถึงกดแพ็คเสร็จได้ (มารับเอง)
              </p>
              <p className="mt-0.5 pl-6 text-[11px] leading-tight text-slate-400">
                {todos
                  .slice(0, 2)
                  .map((t) => `${t.icon} ${t.text}`)
                  .join(" · ")}
                {todos.length > 2 ? ` · + อีก ${todos.length - 2} จุด` : ""}
              </p>
            </div>
          )
        ) : gate.ready ? (
          <div className="space-y-2">
            {trackingSaved && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
                <p className="min-w-0 truncate text-sm font-bold text-emerald-800">
                  ✅ บันทึกแล้ว <span className="font-mono">{order.tracking}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCamErr(null);
                    setCam("next");
                  }}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white"
                >
                  📷 ใบถัดไป
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-green-600 px-2 py-2 text-white">
              <button
                type="button"
                onClick={() => setCam("tracking")}
                className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xl"
                aria-label="สแกนเลขพัสดุด้วยกล้องมือถือ"
                title="สแกนเลขพัสดุด้วยกล้องมือถือ"
              >
                📷
              </button>
              <input
                value={order.tracking ?? ""}
                onChange={(e) => onTrackingChange(e.target.value)}
                onBlur={onTrackingSave}
                placeholder="สแกน 📷 หรือพิมพ์เลขพัสดุ"
                className="w-full bg-transparent font-mono text-sm font-bold placeholder:font-sans placeholder:font-normal placeholder:text-white/70 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          // ล็อกอยู่ = ต้องบอกให้ชัดว่าเหลืออะไร ทำแล้วช่องยิงเลขเปิดเอง
          // (เดิมเป็นแถบเทาจาง ๆ คนแพ็คอ่านว่า "ยิงไม่ได้" แล้วไปอ้อมทางปุ่มแบ่งส่งแทน — 15 ก.ย. 69 OD-260909-6151)
          <div className="rounded-xl bg-amber-50 px-3 py-3 ring-2 ring-amber-300">
            <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
              🔒 เหลืออีก {todos.length} ข้อ ถึงยิงเลขพัสดุได้
            </p>
            <ul className="mt-1 space-y-0.5 pl-6">
              {todos.slice(0, 4).map((t, i) => (
                <li key={i} className="text-[12px] font-bold leading-tight text-amber-900">
                  {t.icon} {t.text}
                </li>
              ))}
              {todos.length > 4 && <li className="text-[11px] font-bold text-amber-700">+ อีก {todos.length - 4} ข้อ — เลื่อนดูในหน้านี้</li>}
            </ul>
            <p className="mt-1.5 pl-6 text-[11px] font-bold leading-tight text-amber-700">
              ทำครบแล้วช่องยิงเลขจะเปิดเอง — อย่าใช้ปุ่ม “แบ่งส่ง” แทน ลูกค้าจะได้ข้อความว่าส่งไม่ครบ
            </p>
          </div>
        )}
      </div>

      {/* ยิงเลขพัสดุเสร็จ → เด้งไปใบถัดไปในคิวเอง (ไม่มีคิว = เงียบ) */}
      {/* มารับเอง: กดแพ็คเสร็จ = จบใบนี้เหมือนยิงเลขพัสดุ → เด้งใบถัดไปเช่นกัน */}
      <PackNextToast currentId={order.id} trackingSaved={pickup ? !!order.packedAt : trackingSaved} onGo={onNextOrder} />

      {/* 📷 กล้องมือถือของพนักงานเอง */}
      <CameraScanner
        open={cam !== null}
        title={cam === "next" ? "สแกนใบถัดไป" : `สแกนเลขพัสดุของ ${order.id}`}
        hint={cam === "next" ? "จ่อบาร์โค้ดบนใบปะหน้า หรือ QR บนใบงานของออเดอร์ถัดไป" : "จ่อบาร์โค้ดเลขพัสดุบนใบส่งของ ปณ./ขนส่ง อ่านได้แล้วบันทึกทันที"}
        onResult={(text) => {
          const mode = cam;
          setCam(null);
          if (mode === "next") {
            const id = extractOrderId(text);
            if (!/^OD-\d{6}-\d{4}$/i.test(id)) {
              setCamErr(`ที่สแกนไม่ใช่เลขออเดอร์ (${text.length > 30 ? `${text.slice(0, 30)}…` : text}) — จ่อบาร์โค้ดบนใบปะหน้าหรือ QR ใบงาน`);
              return;
            }
            if (id.toUpperCase() === order.id.toUpperCase()) {
              setCamErr("นี่คือใบที่เปิดอยู่แล้ว — สแกนใบถัดไป");
              return;
            }
            onNextOrder(id.toUpperCase());
          } else {
            onTrackingScanned(text);
          }
        }}
        onClose={() => setCam(null)}
      />
    </div>
  );
}

/** ป้ายสีบอกว่าใครเป็นคนทำ */

/** ฟอร์มเพิ่มรายการพิเศษ (งานสั่งทำที่ไม่มีหน้าเว็บ) — พิมพ์ชื่อแล้วมีคลังสินค้าพิเศษขึ้นให้เลือก (เติมสเปคอัตโนมัติ) */


/** สถานะพัสดุจากไปรษณีย์ไทย — มี token = timeline สด · ไม่มี = ลิงก์ไปเช็คเว็บ ปณ. */
function ThaiPostStatus({ number }: { number: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    configured?: boolean;
    notThaiPost?: boolean;
    events?: { status: string; description: string; location?: string; at: string }[];
    error?: string;
  }>({ loading: true });
  const trackUrl = `https://track.thailandpost.co.th/?trackNumber=${encodeURIComponent(number)}`;

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    fetch(`/api/orders/track?number=${encodeURIComponent(number)}`)
      .then((r) => r.json())
      .then((j) => live && setState({ loading: false, ...j }))
      .catch(() => live && setState({ loading: false, error: "เชื่อมต่อไม่ได้" }));
    return () => {
      live = false;
    };
  }, [number]);

  if (!/^[A-Z]{2}\d{9}TH$/i.test(number)) return null; // ไม่ใช่เลข ปณ. (เช่น Flash/J&T) — ไม่โชว์

  return (
    <div className="mt-2 rounded-xl bg-rose-50/50 p-3 ring-1 ring-rose-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-rose-700">📮 สถานะพัสดุ ไปรษณีย์ไทย</p>
        <a href={trackUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-rose-600 hover:underline">
          เปิดเว็บ ปณ. ↗
        </a>
      </div>
      {state.loading ? (
        <p className="mt-1 text-xs text-slate-400">กำลังเช็คสถานะ…</p>
      ) : state.configured === false ? (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          กดลิงก์ด้านบนเพื่อเช็คสถานะ · อยากให้โชว์สถานะสดตรงนี้ — สมัคร Track&Trace API ฟรีที่ track.thailandpost.co.th
          แล้วตั้งค่า <code className="rounded bg-white px-1">THAILANDPOST_TRACK_TOKEN</code>
        </p>
      ) : state.error ? (
        <p className="mt-1 text-xs text-amber-600">{state.error}</p>
      ) : !state.events?.length ? (
        <p className="mt-1 text-xs text-slate-500">ปณ. ยังไม่มีข้อมูลเลขนี้ (พัสดุใหม่จะขึ้นหลังไปรษณีย์รับเข้าระบบ)</p>
      ) : (
        <div className="mt-2.5">
          <ThaiPostTimeline events={state.events!} />
        </div>
      )}
    </div>
  );
}


/** โหลดรูปเก็บลงเครื่อง (ลายของลูกค้า) — ดึงเป็น blob ก่อน กันเบราว์เซอร์เปิดแท็บใหม่แทนการเซฟ */
async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** กล่องยืนยันทั่วไปของหลังบ้าน — แทน confirm() ของเบราว์เซอร์ */

/**
 * 📋 โมดัลแอดมินระบุแผนแบ่งส่ง — เลือกรูปแบบงานที่ต้องส่งก่อน (รอบถัดไปของแผน) + วันส่งภายใน + หมายเหตุ
 * รูปที่ส่งแล้ว/อยู่ในแผนแล้วเลือกซ้ำไม่ได้ · เลือกรูปที่เหลือครบทุกรูป = ไม่ใช่แผนแบ่งส่ง (นั่นคือรอบสุดท้ายอยู่แล้ว)
 */
/** 📋 ข้อความสรุปของในแผน/รอบแบ่งส่ง 1 รอบ — บอกจำนวนที่แบ่งไปด้วย (เช่น "รูปที่ 1 · 1/10 ชิ้น") */
function roundProofsText(order: Order, proofs: Shipment["proofs"]): string {
  return proofs
    .map((p) => {
      const name = p.itemName ?? order.items[p.item]?.name ?? "";
      if (!p.qty) return `${name} รูปที่ ${p.proof + 1}`;
      const of = p.ofQty && p.ofQty > p.qty ? `/${p.ofQty.toLocaleString("th-TH")}` : "";
      return `${name} รูปที่ ${p.proof + 1} · ${p.qty.toLocaleString("th-TH")}${of} ${p.unit || "ชิ้น"}`;
    })
    .join(", ");
}

function ShipPlanModal({
  order,
  editIndex = null,
  onCancel,
  onSave,
}: {
  order: Order;
  /** ✏️ แก้รอบเดิมในแผน (index) — null = เพิ่มรอบใหม่ · รอบที่แก้ไม่ถูกนับว่า "จองไว้แล้ว" และค่าเดิมถูกเติมให้ */
  editIndex?: number | null;
  onCancel: () => void;
  onSave: (sel: Map<string, number>, note: string, dueDate: string) => void;
}) {
  const editing = editIndex !== null ? order.shipPlan?.[editIndex] : undefined;
  // คีย์รูป → จำนวนชิ้นที่จะส่งรอบนี้ (ติ๊กครั้งแรก = ที่เหลือทั้งหมด แล้วลดจำนวนได้ เช่น "ลายนี้ส่งก่อน 1 ชิ้น")
  const [sel, setSel] = useState<Map<string, number>>(() => (editing ? roundSel(order, editing.proofs) : new Map()));
  const [note, setNote] = useState(editing?.note ?? "");
  const [due, setDue] = useState(editing?.dueDate ?? "");
  /** รูปที่กำลังขยายดู (ตำแหน่งใน rows) — แอดมินต้องเห็นลายชัด ๆ ก่อนตัดสินใจว่ารูปไหนส่งก่อน */
  const [zoom, setZoom] = useState<number | null>(null);
  const states = proofShipStates(order);
  const planned = plannedProofRounds(order);
  const n = (editIndex ?? order.shipPlan?.length ?? 0) + 1;
  // จำนวนที่รอบอื่นในแผน (ที่ยังไม่ได้ส่ง) จองไว้แล้ว — รอบนี้เลือกได้แค่ส่วนที่เหลือจริง · รอบที่กำลังแก้ไม่นับ (ของมันเองเลือกใหม่ได้)
  const booked = new Map<string, number>();
  (order.shipPlan ?? []).forEach((r, ri) => {
    if (ri === editIndex) return;
    roundSel(order, r.proofs).forEach((q, k) => booked.set(k, (booked.get(k) ?? 0) + q));
  });
  const rows: { key: string; item: string; index: number; qty?: number; unit: string; url: string; left: number; labeled: boolean; taken?: string }[] = [];
  order.items.forEach((it, i) =>
    proofsOf(it).forEach((p, j) => {
      const k = proofKey(i, j);
      const st = states.get(k);
      const shipped = st?.shipped ?? 0;
      const total = st?.total ?? 1;
      const left = Math.max(0, total - Math.max(shipped, booked.get(k) ?? 0));
      rows.push({
        key: k,
        item: it.name,
        index: j + 1,
        qty: p.qty,
        unit: proofUnit(p),
        url: p.url,
        left,
        labeled: !!st?.labeled,
        taken: left > 0 ? undefined : shipped >= total ? `ส่งแล้ว รอบ ${st?.rounds.at(-1)}` : planned.has(k) && planned.get(k) !== n ? `ในแผน รอบ ${planned.get(k)}` : undefined,
      });
    })
  );
  const totalLeft = rows.reduce((s2, r) => s2 + r.left, 0);
  const qty = [...sel.entries()].reduce((s2, [, q]) => s2 + q, 0);
  const all = totalLeft > 0 && qty >= totalLeft;
  const toggle = (r: (typeof rows)[number]) =>
    setSel((cur) => {
      const next = new Map(cur);
      if (next.has(r.key)) next.delete(r.key);
      else if (r.left > 0) next.set(r.key, r.left);
      return next;
    });
  const setQty = (r: (typeof rows)[number], v: number) =>
    setSel((cur) => {
      const next = new Map(cur);
      const q = Math.max(0, Math.min(Math.floor(v) || 0, r.left));
      if (q > 0) next.set(r.key, q);
      else next.delete(r.key);
      return next;
    });
  /** −/＋ ต้องอ่านค่าล่าสุดจาก state เอง ไม่งั้นกดรัว ๆ ในจังหวะเดียวกันจะนับแค่ครั้งเดียว */
  const bumpQty = (r: (typeof rows)[number], d: number) =>
    setSel((cur) => {
      const next = new Map(cur);
      const q = Math.max(0, Math.min((next.get(r.key) ?? 0) + d, r.left));
      if (q > 0) next.set(r.key, q);
      else next.delete(r.key);
      return next;
    });
  /** รูปที่เปิดขยายอยู่ — ใต้รูปมีปุ่มเลือก/ช่องจำนวน จะได้กรอกจากจอใหญ่ได้เลย ไม่ต้องปิดกลับมาหาการ์ดเล็ก */
  const zr = zoom !== null ? rows[zoom] : undefined;
  return (
    /* 🎯 กึ่งกลางจอเสมอ + แขวนที่ body: อยู่ในหน้า ถ้ามีกล่องแม่ที่ใช้ filter/transform (การ์ด .dkb-g ใช้ backdrop-filter)
       position:fixed จะยึดกับกล่องนั้นแทนจอ โมดัลเลยไปโผล่ท้ายหน้าแทนที่จะลอยกลางจอ */
    <Portal>
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        /* px ขั้นต่ำเสมอ — เผื่อเบราว์เซอร์/พรีวิวรายงานความสูงจอเพี้ยน (ดูโน้ต browser pane) */
        style={{ maxHeight: "clamp(360px, 92dvh, 1000px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-amber-50 px-5 pb-3 pt-4 ring-1 ring-inset ring-amber-100">
          <p className="text-lg font-extrabold text-slate-900">{editing ? "✏️ แก้ไขของที่ส่งก่อน" : "📋 ระบุของที่ต้องส่งก่อน"} — รอบที่ {n}</p>
          {editing?.sampleApproved && (
            <p className="mt-1 text-xs font-bold text-rose-600">⚠️ รอบนี้เจ้าของร้านอนุมัติส่งตัวอย่างไว้แล้ว — บันทึกการแก้ไข = คำอนุมัติหลุด ต้องอนุมัติใหม่</p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            ติ๊กรูปแล้วใส่จำนวนที่จะส่งก่อนได้ (เช่น ลายนี้ส่งก่อน 1 ชิ้น ที่เหลือไปรอบหน้า) · ฝ่ายแพ็คจะเห็นป้าย “แอดมินสั่งส่งก่อน” พร้อมจำนวน และยิงเลขพัสดุรอบนี้ได้โดยไม่ต้องรอทั้งใบ
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">ใบนี้ยังไม่มีรูปแบบงาน แบ่งส่งไม่ได้ — รอกราฟฟิกอัปแบบก่อน</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 px-5 pt-3 sm:grid-cols-2">
            {rows.map((r, ri) => {
              const on = sel.has(r.key);
              const q = sel.get(r.key) ?? 0;
              return (
                <li key={r.key} className={`rounded-xl p-1.5 ring-2 transition ${on ? "bg-amber-50 ring-amber-400" : r.taken ? "bg-slate-50 opacity-50 ring-slate-200" : "bg-slate-50 ring-slate-200"}`}>
                  <div className="flex w-full items-center gap-2">
                    {/* รูปแยกปุ่มของตัวเอง = กดแล้วขยายเต็มจอ (ไม่ใช่ติ๊กเลือก) — ติ๊กเลือกกดที่ชื่อ/รายละเอียดข้าง ๆ */}
                    <button type="button" onClick={() => setZoom(ri)} className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200" aria-label={`ขยายดู ${r.item} รูปที่ ${r.index}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="h-full w-full object-contain" />
                      <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 text-center text-[9px] font-bold leading-4 text-white transition group-hover:bg-slate-900/80" aria-hidden>
                        🔍
                      </span>
                    </button>
                    <button type="button" disabled={!!r.taken || r.left <= 0} onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed">
                      <span className="min-w-0 text-[11px] leading-tight">
                        <span className="block truncate font-bold text-slate-800">{r.item}</span>
                        <span className="text-slate-500">
                          รูปที่ {r.index}
                          {r.qty ? ` · ทั้งหมด ${r.qty} ${r.unit}` : ""}
                          {r.qty && r.left !== r.qty ? ` · เหลือ ${r.left}` : ""}
                        </span>
                        {r.taken ? <span className="block font-bold text-sky-700">{r.taken}</span> : on ? <span className="block font-bold text-amber-700">✓ ส่งก่อน {r.labeled ? `${q} ${r.unit}` : "ทั้งรูป"}</span> : null}
                      </span>
                    </button>
                  </div>
                  {/* จำนวนที่จะส่งก่อน — มีเฉพาะรูปที่มีป้ายจำนวน (รูปไม่มีจำนวน = ส่งทั้งรูป) */}
                  {on && r.labeled && (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 ring-1 ring-amber-200">
                      <span className="text-[11px] font-bold text-amber-800">ส่งก่อน</span>
                      <button type="button" onClick={() => bumpQty(r, -1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-100 text-sm font-extrabold text-amber-900">
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={r.left}
                        value={q}
                        onChange={(e) => setQty(r, Number(e.target.value))}
                        className="w-14 rounded-lg border border-amber-200 px-2 py-1 text-center text-sm font-extrabold tabular-nums text-slate-800 focus:border-amber-400 focus:outline-none"
                      />
                      <button type="button" onClick={() => bumpQty(r, 1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-100 text-sm font-extrabold text-amber-900">
                        ＋
                      </button>
                      <span className="text-[11px] text-slate-500">/ {r.left} {r.unit}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {all && <p className="px-5 pt-3 text-xs font-bold text-rose-600">เลือกครบทุกชิ้นที่เหลือ = ส่งทีเดียวทั้งใบ ไม่ต้องตั้งแผน — เว้นของที่จะส่งรอบสุดท้ายไว้</p>}
        <div className="space-y-2 px-5 pt-3">
          <label className="block text-xs font-bold text-slate-600">
            ส่งภายในวันที่ (ไม่บังคับ)
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none" />
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุถึงฝ่ายแพ็ค เช่น ลูกค้าขอ 1 ชิ้นก่อนไปเช็คงาน"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2 p-5">
          <button
            type="button"
            disabled={sel.size === 0 || all}
            onClick={() => onSave(sel, note, due)}
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? "บันทึกการแก้ไข" : "บันทึกแผน"} รอบที่ {n} — {sel.size} รูป{qty ? ` · ${qty.toLocaleString("th-TH")} ชิ้น` : ""}
          </button>
          <button type="button" onClick={onCancel} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            ยกเลิก
          </button>
        </div>
      {/* ขยายรูปเต็มจอ — ซ้อนเหนือโมดัล (z สูงกว่า 110) และเลื่อนดูรูปอื่นในลิสต์ได้
          ต้องอยู่ใน <div> ที่ stopPropagation: Portal ส่ง event ตามต้นไม้ React ไม่ใช่ DOM คลิกในรูปจะเด้งไปปิดโมดัล */}
      {zr && (
        <ImageLightbox
          z={130}
          src={zr.url}
          alt={`${zr.item} รูปที่ ${zr.index}`}
          caption={`${zr.item} · รูปที่ ${zr.index}${zr.qty ? ` · ทั้งหมด ${zr.qty} ${zr.unit}` : ""}`}
          counter={`${zoom! + 1} / ${rows.length}`}
          onPrev={zoom! > 0 ? () => setZoom(zoom! - 1) : undefined}
          onNext={zoom! < rows.length - 1 ? () => setZoom(zoom! + 1) : undefined}
          /* ติ๊กเลือก + กรอกจำนวนได้จากจอขยายเลย (ดูลายชัด ๆ แล้วเคาะจำนวนตรงนั้น) */
          footer={
            <div className="rounded-2xl bg-white p-3 shadow-2xl">
              {zr.taken ? (
                <p className="text-center text-sm font-extrabold text-sky-700">{zr.taken}</p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={zr.left <= 0}
                    onClick={() => toggle(zr)}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      sel.has(zr.key) ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : "border-2 border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {sel.has(zr.key) ? `✓ เลือกส่งก่อนแล้ว${zr.labeled ? "" : " (ทั้งรูป)"} — กดอีกครั้งเพื่อเอาออก` : "＋ เลือกรูปนี้ส่งก่อน"}
                  </button>
                  {sel.has(zr.key) && zr.labeled && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <span className="text-xs font-extrabold text-amber-800">ส่งก่อน</span>
                      <button type="button" onClick={() => bumpQty(zr, -1)} className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-xl font-extrabold text-amber-900">
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={zr.left}
                        value={sel.get(zr.key) ?? 0}
                        onChange={(e) => setQty(zr, Number(e.target.value))}
                        className="w-20 rounded-xl border-2 border-amber-200 px-2 py-1.5 text-center text-lg font-extrabold tabular-nums text-slate-800 focus:border-amber-400 focus:outline-none"
                      />
                      <button type="button" onClick={() => bumpQty(zr, 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-xl font-extrabold text-amber-900">
                        ＋
                      </button>
                      <span className="text-xs font-bold text-slate-500">
                        / {zr.left.toLocaleString("th-TH")} {zr.unit}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          }
          onClose={() => setZoom(null)}
        />
      )}
      </div>
    </div>
    </Portal>
  );
}

/**
 * 🚚 โมดัลยิงเลขพัสดุ "รอบแบ่งส่ง" — สรุปรูปที่เลือก + ด่านตรวจเฉพาะรูปพวกนั้น + ช่องเลข (สแกนกล้องได้) + หมายเหตุรอบ
 * ฝ่ายแพ็ค: ด่านไม่ผ่านกดไม่ได้ · แอดมิน (orders.edit): ข้ามได้ เซิร์ฟเวอร์ลง log ชื่อ
 * รอบที่เอารูปที่เหลือไปทั้งหมด = รอบสุดท้าย → ปิดปุ่มทุกคน ให้ไปยิงช่องเลขพัสดุปกติ (ใบจะได้ปิด)
 */
function PartialShipModal({
  order,
  sel,
  mayEdit,
  editableQty = false,
  defaultNote = "",
  pickup = false,
  onCancel,
  onConfirm,
}: {
  order: Order;
  /** คีย์รูป → จำนวนชิ้นที่จะไปกับรอบนี้ (ตามแผนแอดมิน หรือที่ติ๊กเอง) */
  sel: Map<string, number>;
  mayEdit: boolean;
  /** 🏪 ใบมารับเอง — รอบนี้ไม่มีเลขพัสดุ กดยืนยัน "แพ็คเสร็จรอบนี้" แทน */
  pickup?: boolean;
  /** แก้จำนวนในโมดัลได้ไหม — ตามแผนแอดมิน = ล็อกตามแผน · ติ๊กเอง (แอดมิน) = แก้ได้ */
  editableQty?: boolean;
  /** หมายเหตุจากแผนแอดมิน — เติมให้ก่อน แก้ได้ */
  defaultNote?: string;
  onCancel: () => void;
  onConfirm: (tracking: string, note: string, sel: Map<string, number>) => void;
}) {
  const [qtyMap, setQtyMap] = useState<Map<string, number>>(() => new Map(sel));
  /** รูปที่กำลังขยายดู (ตำแหน่งใน rows) — ก่อนยิงเลข คนแพ็คควรเปิดดูลายชัด ๆ เทียบกับของในกล่องได้ */
  const [zoom, setZoom] = useState<number | null>(null);
  const gate = partialGate(order, qtyMap);
  /** ติ๊กยืนยันว่าตั้งใจแบ่งส่งจริง — บังคับเมื่อของที่เหลือพร้อมส่งอยู่แล้ว (กันกดผิดทางเหมือน 15 ก.ย. 69) */
  const [sureSplit, setSureSplit] = useState(false);
  /** ด่านของ "ทั้งใบ" — ไว้บอกว่าที่ยิงเลขรอบสุดท้ายไม่ได้เพราะติดอะไร จะได้ไปทำให้ครบแทนการแบ่งส่ง */
  const closeTodos = packTodos(order, packGate(order));
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState(defaultNote);
  const [cam, setCam] = useState(false);
  const states = proofShipStates(order);
  const round = (order.shipments?.length ?? 0) + 1;
  const rows = [...qtyMap.entries()]
    .map(([k, q]) => {
      const [i, j] = k.split(":").map(Number);
      const it = order.items[i];
      const p = it ? proofsOf(it)[j] : undefined;
      const st = states.get(k);
      return it && p
        ? { key: k, item: it.name, index: j + 1, qty: q, total: p.qty, left: st?.remaining ?? 0, labeled: !!st?.labeled, unit: proofUnit(p), url: p.url }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const qty = rows.reduce((n, r) => n + (r.labeled ? r.qty : r.total ?? 0), 0);
  const setQty = (k: string, left: number, v: number) =>
    setQtyMap((cur) => {
      const next = new Map(cur);
      const q = Math.max(0, Math.min(Math.floor(v) || 0, left));
      if (q > 0) next.set(k, q);
      else next.delete(k);
      return next;
    });
  /** −/＋ อ่านค่าล่าสุดจาก state เอง (กดรัว ๆ ไม่ตกหล่น) */
  const bumpQty = (k: string, left: number, d: number) =>
    setQtyMap((cur) => {
      const next = new Map(cur);
      const q = Math.max(0, Math.min((next.get(k) ?? 0) + d, left));
      if (q > 0) next.set(k, q);
      else next.delete(k);
      return next;
    });
  // 🏪 มารับเอง: ไม่มีเลขพัสดุ — ใช้ข้อความประจำรอบแทน (ไม่ซ้ำกันระหว่างรอบ)
  const t = pickup ? pickupRoundRef(round) : tracking.trim();
  const dupe = !pickup && !!t && ((order.shipments ?? []).some((s) => s.tracking.trim() === t) || (order.tracking ?? "").trim() === t);
  const blockedAll = gate.isLastRound || rows.length === 0;
  const otherReasons = gate.reasons.filter((r) => !r.startsWith(SPLIT_WHOLE_HINT));
  const needSkip = !gate.ready && !blockedAll;
  const canGo = !!t && !dupe && !blockedAll && (gate.ready || mayEdit) && (!gate.looksWhole || sureSplit);
  /** รูปที่เปิดขยายอยู่ — ใต้รูปมีช่องจำนวน จะได้เคาะจำนวนจากจอใหญ่ได้เลย */
  const zr = zoom !== null ? rows[zoom] : undefined;
  return (
    /* 🎯 กึ่งกลางจอเสมอ + แขวนที่ body: อยู่ในหน้า ถ้ามีกล่องแม่ที่ใช้ filter/transform (การ์ด .dkb-g ใช้ backdrop-filter)
       position:fixed จะยึดกับกล่องนั้นแทนจอ โมดัลเลยไปโผล่ท้ายหน้าแทนที่จะลอยกลางจอ */
    <Portal>
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "clamp(360px, 92dvh, 1000px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-amber-50 px-5 pb-3 pt-4 ring-1 ring-inset ring-amber-100">
          <p className="text-lg font-extrabold text-slate-900">{pickup ? "🏪 แพ็คเสร็จบางส่วน (มารับเอง)" : "🚚 ส่งบางส่วน"} — รอบที่ {round}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {order.id} · {rows.length} รูป{qty ? ` · ${qty.toLocaleString("th-TH")} ชิ้น` : ""} · ใบยังไม่ปิด {pickup ? "ที่เหลือกลับไปรอคิวปริ้น/ผลิตรอบถัดไป" : "ที่เหลือส่งรอบถัดไป"}
          </p>
        </div>

        {/* ของที่จะไปรอบนี้ — แบ่งจำนวนได้ (ลายนี้ส่งก่อน 1 ชิ้น ที่เหลือรอบหน้า) */}
        <ul className="grid grid-cols-1 gap-2 px-5 pt-3 sm:grid-cols-2">
          {rows.map((r, ri) => (
            <li key={r.key} className="rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                {/* กดรูป = ขยายเต็มจอ (เทียบลายกับของในกล่องก่อนยิงเลข) */}
                <button type="button" onClick={() => setZoom(ri)} className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200" aria-label={`ขยายดู ${r.item} รูปที่ ${r.index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt="" className="h-full w-full object-contain" />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 text-center text-[9px] font-bold leading-4 text-white transition group-hover:bg-slate-900/80" aria-hidden>
                    🔍
                  </span>
                </button>
                <span className="min-w-0 text-[11px] leading-tight">
                  <span className="block truncate font-bold text-slate-800">{r.item}</span>
                  <span className="text-slate-500">
                    รูปที่ {r.index}
                    {r.labeled ? ` · รอบนี้ ${r.qty.toLocaleString("th-TH")}/${(r.total ?? 0).toLocaleString("th-TH")} ${r.unit}` : ""}
                  </span>
                  {r.labeled && r.qty < r.left ? <span className="block font-bold text-amber-700">เหลือไว้รอบหน้าอีก {(r.left - r.qty).toLocaleString("th-TH")} {r.unit}</span> : null}
                </span>
              </div>
              {editableQty && r.labeled && (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 ring-1 ring-amber-200">
                  <span className="text-[11px] font-bold text-amber-800">ส่งรอบนี้</span>
                  <button type="button" onClick={() => bumpQty(r.key, r.left, -1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-100 text-sm font-extrabold text-amber-900">
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={r.left}
                    value={r.qty}
                    onChange={(e) => setQty(r.key, r.left, Number(e.target.value))}
                    className="w-14 rounded-lg border border-amber-200 px-2 py-1 text-center text-sm font-extrabold tabular-nums text-slate-800 focus:border-amber-400 focus:outline-none"
                  />
                  <button type="button" onClick={() => bumpQty(r.key, r.left, 1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-100 text-sm font-extrabold text-amber-900">
                    ＋
                  </button>
                  <span className="text-[11px] text-slate-500">/ {r.left.toLocaleString("th-TH")} {r.unit}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* 🚨 ของที่เหลือพร้อมส่งอยู่แล้ว = น่าจะกดผิดทาง — ต้องอ่านและติ๊กยืนยันก่อนถึงจะยิงได้ */}
        {gate.looksWhole && (
          <div className="mx-5 mt-3 rounded-xl bg-rose-50 p-3 ring-2 ring-rose-300">
            <p className="text-sm font-extrabold text-rose-700">⚠️ ของที่เหลือพร้อมส่งอยู่แล้ว — ใบนี้ต้องแบ่งส่งจริงหรือเปล่า?</p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-rose-700">
              ถ้าของทั้งใบไปกล่องเดียว ให้กดยกเลิก แล้วยิงเลขที่ช่องเลขพัสดุด้านล่างแทน — ใบจะปิดเป็น “จัดส่งแล้ว” และลูกค้าได้ข้อความถูกต้อง
              <br />
              กดต่อตรงนี้ = ลูกค้าจะได้ไลน์ว่า <strong>“จัดส่งบางส่วน · ที่เหลือส่งรอบถัดไป”</strong> และใบนี้จะยังไม่ปิด
            </p>
            {closeTodos.length > 0 && (
              <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-rose-200">
                <p className="text-[11px] font-extrabold text-rose-700">ที่ยิงเลขรอบสุดท้ายไม่ได้ เพราะยังเหลือ {closeTodos.length} ข้อ:</p>
                <ul className="mt-1 space-y-0.5">
                  {closeTodos.slice(0, 4).map((td, i) => (
                    <li key={i} className="text-[11px] font-bold text-slate-700">
                      {td.icon} {td.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] font-bold text-slate-500">ทำข้อพวกนี้ให้ครบแล้วยิงที่ช่องเลขพัสดุได้เลย ไม่ต้องแบ่งส่ง</p>
              </div>
            )}
            <label className="mt-2 flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 ring-1 ring-rose-200">
              <input type="checkbox" checked={sureSplit} onChange={(e) => setSureSplit(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-rose-600" />
              <span className="text-xs font-extrabold text-slate-800">ยืนยัน: ของที่เหลือยังอยู่ที่ร้าน ไม่ได้ใส่กล่องรอบนี้</span>
            </label>
          </div>
        )}

        {/* ด่านตรวจเฉพาะรูปที่เลือก (บรรทัด "ของที่เหลือพร้อมส่ง" ขึ้นเป็นกล่องเตือนข้างบนแล้ว) */}
        {otherReasons.length > 0 && (
          <ul className="space-y-1.5 px-5 pt-3">
            {otherReasons.map((r, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
                  blockedAll ? "bg-sky-50 text-sky-800 ring-sky-100" : "bg-rose-50 text-rose-700 ring-rose-100"
                }`}
              >
                <span className="mt-0.5">{blockedAll ? "ℹ️" : "✗"}</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {!blockedAll && (
          <div className="space-y-2 px-5 pt-3">
            {pickup ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-900 ring-1 ring-amber-200">
                🏪 ใบนี้ลูกค้ามารับเอง — รอบนี้ไม่ต้องยิงเลขพัสดุ กดยืนยันด้านล่างได้เลย
              </p>
            ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-2 py-2 text-white">
              <button type="button" onClick={() => setCam(true)} className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xl" aria-label="สแกนเลขพัสดุ">
                📷
              </button>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="สแกน 📷 หรือพิมพ์เลขพัสดุรอบนี้"
                autoFocus
                className="w-full bg-transparent font-mono text-sm font-bold placeholder:font-sans placeholder:font-normal placeholder:text-white/60 focus:outline-none"
              />
            </div>
            )}
            {dupe && <p className="text-xs font-bold text-rose-600">เลขนี้อยู่ในใบนี้แล้ว — ตรวจเลขบนใบส่งของอีกครั้ง</p>}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุรอบนี้ (ไม่บังคับ) เช่น ลูกค้าขอ 22 ใบก่อนงานอีเวนต์"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none"
            />
            <p className="text-[11px] leading-relaxed text-slate-400">
              {pickup
                ? "บันทึกแล้วระบบแจ้งลูกค้าทางไลน์ทันทีว่ามารับของรอบนี้ได้ · สถานะออเดอร์ยังเป็นเดิมจนกว่าจะกดแพ็คเสร็จรอบสุดท้าย"
                : "บันทึกแล้วระบบแจ้งลูกค้าทางไลน์ทันทีว่าส่งบางส่วน พร้อมเลขพัสดุรอบนี้ · สถานะออเดอร์ยังเป็นเดิมจนกว่าจะยิงเลขรอบสุดท้าย"}
              {needSkip && mayEdit && (
                <>
                  {" "}
                  · ยืนยันทั้งที่ด่านไม่ครบ = <strong className="text-amber-600">บันทึกในประวัติพร้อมชื่อคุณ</strong>
                </>
              )}
              {needSkip && !mayEdit && <> · ด่านยังไม่ครบ — กลับไปตรวจรูปที่เลือกให้ครบก่อน หรือให้แอดมินยิง</>}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 p-5">
          {!blockedAll && (
            <button
              type="button"
              disabled={!canGo}
              onClick={() => onConfirm(t, note, qtyMap)}
              className={`w-full rounded-xl py-3 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                needSkip ? "border-2 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {gate.looksWhole && !sureSplit
                ? "⬆️ ติ๊กยืนยันข้างบนก่อน"
                : needSkip
                  ? "⚠️ ยืนยันข้ามด่าน — ส่งรอบนี้เลย"
                  : pickup
                    ? `✅ แพ็คเสร็จรอบที่ ${round} — แจ้งลูกค้ามารับ`
                    : `✅ บันทึกเลขพัสดุรอบที่ ${round}`}
            </button>
          )}
          <button type="button" onClick={onCancel} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            {blockedAll ? "ปิด" : "ยกเลิก"}
          </button>
        </div>

        <CameraScanner
          open={cam}
          title={`สแกนเลขพัสดุ รอบที่ ${round}`}
          hint="จ่อบาร์โค้ดเลขพัสดุบนใบส่งของ ปณ./ขนส่ง"
          onResult={(text) => {
            setCam(false);
            setTracking(text.trim());
          }}
          onClose={() => setCam(false)}
        />

        {/* ขยายรูปเต็มจอ — ต้องอยู่ในกล่องที่ stopPropagation (Portal ส่ง event ตามต้นไม้ React) ไม่งั้นคลิกในรูปเด้งไปปิดโมดัล */}
        {zr && (
          <ImageLightbox
            z={130}
            src={zr.url}
            alt={`${zr.item} รูปที่ ${zr.index}`}
            caption={`${zr.item} · รูปที่ ${zr.index}${zr.labeled ? ` · รอบนี้ ${zr.qty.toLocaleString("th-TH")}/${(zr.total ?? 0).toLocaleString("th-TH")} ${zr.unit}` : ""}`}
            counter={`${zoom! + 1} / ${rows.length}`}
            onPrev={zoom! > 0 ? () => setZoom(zoom! - 1) : undefined}
            onNext={zoom! < rows.length - 1 ? () => setZoom(zoom! + 1) : undefined}
            /* แก้จำนวนที่จะไปกับรอบนี้ได้จากจอขยาย (เฉพาะโหมดติ๊กเอง — ตามแผนแอดมิน = ล็อกตามแผน) */
            footer={
              editableQty && zr.labeled ? (
                <div className="rounded-2xl bg-white p-3 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-extrabold text-amber-800">ส่งรอบนี้</span>
                    <button type="button" onClick={() => bumpQty(zr.key, zr.left, -1)} className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-xl font-extrabold text-amber-900">
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={zr.left}
                      value={zr.qty}
                      onChange={(e) => setQty(zr.key, zr.left, Number(e.target.value))}
                      className="w-20 rounded-xl border-2 border-amber-200 px-2 py-1.5 text-center text-lg font-extrabold tabular-nums text-slate-800 focus:border-amber-400 focus:outline-none"
                    />
                    <button type="button" onClick={() => bumpQty(zr.key, zr.left, 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-xl font-extrabold text-amber-900">
                      ＋
                    </button>
                    <span className="text-xs font-bold text-slate-500">
                      / {zr.left.toLocaleString("th-TH")} {zr.unit}
                    </span>
                  </div>
                  {zr.qty < zr.left && (
                    <p className="mt-1.5 text-center text-[11px] font-bold text-amber-700">เหลือไว้รอบหน้าอีก {(zr.left - zr.qty).toLocaleString("th-TH")} {zr.unit}</p>
                  )}
                </div>
              ) : undefined
            }
            onClose={() => setZoom(null)}
          />
        )}
      </div>
    </div>
    </Portal>
  );
}

/**
 * 💰 กล่อง "รับยอดเอง" ของสลิปใบเพิ่ม — แทน window.prompt เดิม
 *
 * prompt() ของเบราว์เซอร์โชว์ยอดดิบ (46.89999999999998) และไม่บอกว่ากดแล้วออเดอร์จะเหลือค้างเท่าไร
 * กล่องนี้ปัดสตางค์ให้ตั้งแต่ค่าเริ่มต้น มีปุ่มยอดที่ใช้บ่อย และบอกผลลัพธ์สดก่อนกดยืนยัน
 */
function AcceptPaymentModal({
  entry,
  order,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: PaymentEntry;
  order: Order;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const asText = (n: number) => (n % 1 ? n.toFixed(2) : String(n)); // ช่องกรอกโชว์ 46.90 ไม่ใช่ 46.89999999999998
  const due = round2(Math.max(0, orderBalance(order)));
  const read = entry.verify?.amount != null ? round2(entry.verify.amount) : null; // ยอดที่ SlipOK อ่านได้ (ถ้าอ่านได้)
  const [raw, setRaw] = useState(asText(read ?? due));

  const amount = round2(Number((raw || "").replace(/[^\d.]/g, "")) || 0);
  const ok = amount > 0;
  const left = round2(due - amount);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* หัวกล่อง — บอกว่ากำลังรับยอดใบไหน */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-emerald-50 px-4 py-3">
          {entry.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={entry.url} alt={`สลิปใบที่ ${entry.n}`} className="h-12 w-12 shrink-0 rounded-lg border border-emerald-200 bg-white object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-xl">🧾</span>
          )}
          <div className="min-w-0">
            <p className="text-base font-extrabold text-slate-900">💰 รับยอดเอง · ใบที่ {entry.n}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-emerald-800">
              SlipOK ตรวจให้ไม่ได้ — เทียบยอดกับธนาคารแล้วค่อยกด
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* ที่มาของยอด — ตัวเลขต้องมีตัวเทียบเสมอ */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-2 text-center ring-1 ring-slate-200/70">
            {[
              { k: "ยอดบิล", v: orderTotal(order), c: "text-slate-700" },
              { k: "รับแล้ว", v: paidSoFar(order), c: "text-slate-700" },
              { k: "ค้างตอนนี้", v: due, c: "text-rose-600" },
            ].map((x) => (
              <div key={x.k}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{x.k}</p>
                <p className={`text-sm font-extrabold tabular-nums ${x.c}`}>{formatPrice(x.v)}</p>
              </div>
            ))}
          </div>

          {/* ช่องยอด — จุดที่กล้าจุดเดียวของกล่องนี้ */}
          <div>
            <label htmlFor="accept-amount" className="text-xs font-bold text-slate-600">
              ยอดที่เข้าบัญชีจริงจากสลิปใบนี้
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-white px-3 py-2 focus-within:border-emerald-500">
              <span className="text-xl font-extrabold text-emerald-600">฿</span>
              <input
                id="accept-amount"
                autoFocus
                inputMode="decimal"
                value={raw}
                onChange={(ev) => setRaw(ev.target.value)}
                onFocus={(ev) => ev.currentTarget.select()}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && ok && !busy) onConfirm(amount);
                }}
                className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-slate-900 outline-none"
              />
            </div>
            {/* ยอดที่ใช้บ่อย — กดทีเดียวไม่ต้องพิมพ์ */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {read != null && read !== due && (
                <button
                  type="button"
                  onClick={() => setRaw(asText(read))}
                  className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  ยอดที่อ่านจากสลิป {formatPrice(read)}
                </button>
              )}
              {due > 0 && (
                <button
                  type="button"
                  onClick={() => setRaw(asText(due))}
                  className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                >
                  ค้างทั้งหมด {formatPrice(due)}
                </button>
              )}
            </div>
          </div>

          {/* ผลลัพธ์สดก่อนกด — กดแล้วออเดอร์จะเป็นยังไง */}
          <div
            className={`rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
              !ok
                ? "bg-slate-50 text-slate-400 ring-slate-200"
                : left > 0
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : left < 0
                    ? "bg-sky-50 text-sky-700 ring-sky-200"
                    : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}
          >
            {!ok
              ? "ใส่ยอดมากกว่า 0 ก่อน"
              : left > 0
                ? `รับแล้วจะยังค้างอีก ${formatPrice(left)} — ออเดอร์ยังไม่ครบ`
                : left < 0
                  ? `✓ ครบ แถมโอนเกิน ${formatPrice(-left)} — คืน/แปลงเป็นแต้มทีหลัง`
                  : "✓ ครบพอดี — ระบบจะยืนยันเงินเข้าและแจ้งลูกค้าให้เลย"}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            ยอดนี้จะถูกบันทึกในประวัติออเดอร์พร้อมชื่อคุณว่าเป็นคนรับยอดเอง
          </p>
        </div>

        {/* ปุ่มอยู่ครึ่งล่างของจอ กดด้วยนิ้วโป้งได้ */}
        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(amount)}
            disabled={!ok || busy}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? "กำลังบันทึก…" : `💰 รับยอด ${formatPrice(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** โมดัลยืนยัน "ข้ามด่านตรวจแพ็ค" — แทน confirm() เดิม เน้นให้เห็นชัดว่าขาดอะไรและมีผลอะไร */
function SkipGateModal({ reasons, onCancel, onConfirm }: { reasons: string[]; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {/* หัวโทนเตือน */}
        <div className="bg-amber-50 px-5 pb-4 pt-5 text-center ring-1 ring-inset ring-amber-100">
          <span className="text-4xl">📦⚠️</span>
          <p className="mt-2 text-lg font-extrabold text-slate-900">ด่านตรวจแพ็คยังไม่ครบ</p>
          <p className="mt-0.5 text-xs text-slate-500">ยังยิงเลขพัสดุตอนนี้ไม่ควร — เช็คก่อนว่าตั้งใจข้ามจริงไหม</p>
        </div>

        {/* รายการที่ขาด */}
        <ul className="space-y-2 px-5 py-4">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-100">
              <span className="mt-0.5 text-rose-500">✗</span>
              <span className="text-sm font-bold text-rose-700">{r}</span>
            </li>
          ))}
        </ul>

        <p className="px-5 text-center text-[11px] leading-relaxed text-slate-400">
          หากยืนยันข้าม ระบบจะ<strong className="text-amber-600">บันทึกในประวัติออเดอร์พร้อมชื่อคุณ</strong>ว่าเป็นผู้ข้ามด่านตรวจ
        </p>

        {/* ปุ่ม — ค่าเริ่มต้นชวนให้กลับไปทำให้ครบ */}
        <div className="flex flex-col gap-2 p-5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-extrabold text-white transition hover:bg-slate-700"
          >
            ← กลับไปตรวจให้ครบก่อน (แนะนำ)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl border-2 border-amber-300 bg-amber-50 py-2.5 text-sm font-extrabold text-amber-700 transition hover:bg-amber-100"
          >
            ⚠️ ยืนยันข้ามด่าน — ยิงเลขพัสดุเลย
          </button>
        </div>
      </div>
    </div>
  );
}

type ShortcutKind = "html" | "url" | "webloc";

/** เครื่องที่เปิดหน้านี้อยู่ — ใช้แค่ตั้งชื่อปุ่ม "ทางลัดแบบเนทีฟ" ให้ตรงเครื่องคนกด */
function shortcutOs(): "mac" | "win" {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "mac" : "win";
}

/** เอาอักขระที่ Windows/macOS ห้ามใช้ในชื่อไฟล์ออก (ชื่อออเดอร์เป็น OD-xxxxxx-xxxx อยู่แล้ว แต่กันไว้) */
function safeFileName(name: string) {
  return (name || "order").replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 80);
}

/**
 * ดาวน์โหลด "ทางลัดเปิดออเดอร์" — ดับเบิลคลิกแล้วเปิดหน้าออเดอร์ในเบราว์เซอร์ทันที
 * เอาไปวางในโฟลเดอร์งานของลูกค้าคู่กับไฟล์ลายได้เลย
 *
 * ค่าเริ่มต้น = .html ทุกเครื่อง (Windows / Mac / มือถือ)
 *   เพราะ .html ผูกกับเบราว์เซอร์เสมอ ดับเบิลคลิกแล้วเด้งเข้าออเดอร์แน่นอน
 *   ส่วน .url ของ Windows ต้องพึ่ง file association ของ InternetShortcut — ถ้าเครื่องไหนโดน
 *   Notepad / VS Code / โปรแกรมอื่นยึดไป ดับเบิลคลิกจะเห็นเป็นข้อความ "[InternetShortcut] URL=…"
 *   เฉย ๆ ไม่เปิดเว็บ (แถม Chrome/Edge ยังเตือนว่าไฟล์อันตรายตอนโหลดอีก)
 *   จึงเก็บ .url (Windows) / .webloc (Mac) ไว้เป็นตัวเลือกรองให้คนที่อยากได้ทางลัดแบบเนทีฟ
 */
/** ฟิลด์ที่เซิร์ฟเวอร์เป็นคนประทับเวลา/กันเขียนทับ (ดู reconcileItem ใน api/admin/orders/route.ts) — รับค่าจากก้อนที่บันทึกจริง */
const SERVER_STAMPED = ["graphicAck", "noProof", "sampleRequired", "samplePacked", "noteAck", "arrival", "proofs"] as const;
function withServerStamps(local: OrderItem, saved?: OrderItem): OrderItem {
  if (!saved) return local;
  const out = { ...local } as Record<string, unknown>;
  const src = saved as unknown as Record<string, unknown>;
  for (const k of SERVER_STAMPED) out[k] = src[k];
  return out as unknown as OrderItem;
}

function downloadOrderShortcut(orderId: string, url: string, kind: ShortcutKind = "html") {
  if (!url) return;
  const esc = (u: string) =>
    u.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body =
    kind === "webloc"
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${esc(url)}</string>\n</dict>\n</plist>\n`
      : kind === "url"
        ? // รูปแบบเดียวกับที่ Windows เขียนเอง (มีบล็อก Prop3) · ต้องเป็น CRLF ล้วน ไม่มี BOM
          `[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,11\r\n[InternetShortcut]\r\nIDList=\r\nURL=${url}\r\nIconIndex=0\r\n`
        : // .html — ใช้ได้ทุกเครื่อง (Mac / Windows / มือถือ) เด้งเข้าออเดอร์ทันที มีลิงก์สำรองถ้า JS ถูกปิด
          `<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(orderId)} — iDucky</title>\n<meta http-equiv="refresh" content="0;url=${esc(url)}">\n<script>location.replace(${JSON.stringify(url)});</script>\n</head>\n<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:56px 20px;color:#44403c">\n<p style="font-size:15px">🦆 กำลังเปิดออเดอร์ <b>${esc(orderId)}</b>…</p>\n<p style="font-size:13px;color:#a8a29e">ถ้าไม่เปิดอัตโนมัติ กดลิงก์ด้านล่าง</p>\n<p><a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#fbbf24;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px">เปิดหน้าออเดอร์</a></p>\n</body>\n</html>\n`;
  const type =
    kind === "webloc"
      ? "application/xml"
      : kind === "url"
        ? "application/internet-shortcut"
        : "text/html;charset=utf-8";
  const blob = new Blob([body], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${safeFileName(orderId)}.${kind}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}


/** ปุ่มคัดลอกข้อความ — กดแล้วบอกผลตรงตัวปุ่ม (แอดมินคัดลอกไปตอบ LINE/จ่าหน้าพัสดุบ่อยมาก) */

/**
 * 🟢 ห้องแชท LINE ของลูกค้า — พนักงานวางลิงก์ห้องแชท (chat.line.biz/…/chat/…) ครั้งเดียว
 *
 * ทำไมต้องเก็บ: ลูกค้าทักมาทาง LINE OA แต่หน้าออเดอร์ไม่มีทางกระโดดกลับไปห้องแชทเขาได้
 * ต้องไปไล่หาในคอนโซล LINE เอง ทั้งที่พนักงานคนที่คุยรู้อยู่แล้วว่าห้องไหน
 * เก็บไว้กับออเดอร์ แล้วออเดอร์ถัดไปของลูกค้าคนเดิมระบบดึงมาให้เอง (จับคู่จาก customerId/เบอร์/อีเมล)
 */
function LineChatBox({
  demo,
  order,
  allOrders,
  mayEdit,
  onSave,
  onBound,
}: {
  demo: boolean;
  order: Order;
  allOrders: Order[];
  mayEdit: boolean;
  onSave: (url: string) => void;
  onBound: (order: Order) => void;
}) {
  const chat = lineChatOf(order, allOrders);
  const line = lineUserOf(order, allOrders); // จำจากออเดอร์เก่าของลูกค้าคนเดิมได้
  const [draft, setDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState(""); // ช่องวางลิงก์ห้องแชทตอนผูก userId แล้วแต่ลิงก์ยังขาด
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [hits, setHits] = useState<{ userId: string; name: string; picture?: string; lastSeen?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [hitTotal, setHitTotal] = useState(0); // เจอทั้งหมดกี่คน (โชว์แค่บางส่วน)
  // ชื่อตรงพอดีกี่คน — ชื่อสั้น ๆ ("S") มีคนซ้ำเป็นสิบ ต้องบอกให้เทียบรูปโปรไฟล์เอา
  const [hitExact, setHitExact] = useState(0);
  // ค้นแล้วไม่เจอสักคน — เดิมกล่องผลค้นหาไม่ขึ้นอะไรเลย พนักงานไม่รู้ว่าพลาดตรงไหน (แจ้ง 14 ก.ย. 69)
  const [noHit, setNoHit] = useState<{ q: string; refreshed: boolean } | null>(null);
  const [changing, setChanging] = useState(false); // กด "เปลี่ยนคน" → กลับไปโหมดค้นหา
  const [picking, setPicking] = useState(false); // คลิกช่องค้นหาแล้ว → เริ่มโชว์รายชื่อให้เลือก
  // คนที่เลือกไว้ รอกดยืนยัน — กันแตะพลาดแล้วผูกผิดคน (ผูกผิด = ข้อมูลออเดอร์ไปโผล่แชทคนอื่น)
  const [picked, setPicked] = useState<{ userId: string; name: string; picture?: string } | null>(null);
  const awaitingReturn = useRef(false); // เพิ่งกดเปิดแชทไป → กลับมาแล้วรีเฟรชรายชื่อให้เอง
  // วางลิงก์ OA Manager แล้ว: รหัสท้ายลิงก์ที่รอจับคู่ + คนที่ระบบเดาว่าน่าจะใช่ (คุยล่าสุด)
  const [pendingManagerId, setPendingManagerId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ userId: string; name: string; picture?: string; lastSeen?: string; remembered?: boolean }[]>([]);

  // กลับมาจากห้องแชท (สลับแท็บกลับ) → ดึงรายชื่อคุยล่าสุดใหม่ ลูกค้าที่เพิ่งทักจะอยู่บนสุด
  useEffect(() => {
    const onFocus = () => {
      if (!awaitingReturn.current || demo) return;
      awaitingReturn.current = false;
      void refreshRecent();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  // พิมพ์ชื่อ → ค้นจากคลังแชท LINE ของร้านให้เลย (หน่วงไว้กันยิงถี่)
  // ยังไม่พิมพ์แต่คลิกช่องแล้ว → โชว์ "คนที่คุยล่าสุด" ให้เลือกได้เลย
  useEffect(() => {
    const q = draft.trim();
    setPicked(null);
    setNoHit(null);
    // วางลิงก์/URL/userId มา = ตั้งใจใช้ปุ่มบันทึก ไม่ต้องเด้งรายชื่อให้เลือก
    if (demo || !picking || /^https?:\/\//i.test(q) || /^U[0-9a-f]{32}$/i.test(q)) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/line-customers?q=${encodeURIComponent(q)}`);
        const j = (await res.json().catch(() => ({}))) as { customers?: typeof hits; total?: number; exact?: number; refreshed?: boolean; error?: string };
        setHits(j.customers ?? []);
        setHitTotal(j.total ?? (j.customers?.length ?? 0));
        setHitExact(j.exact ?? 0);
        // ไม่เจอ (หรือคลังแชทอ่านไม่ได้) → บอกให้รู้ พร้อมทางไปต่อ แทนที่จะเงียบ
        setNoHit((j.customers?.length ?? 0) === 0 && q.length >= 2 ? { q, refreshed: Boolean(j.refreshed) } : null);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [draft, demo, picking]);

  /**
   * ช่องเดียวรับได้ทั้ง 2 อย่าง:
   *   userId (U…32 ตัว) → ผูกให้ระบบส่งข้อความ (ยืนยันกับ LINE ก่อน)
   *   ลิงก์ chat.line.biz → เก็บไว้เป็นปุ่มเปิดแชท (ส่งข้อความด้วยไม่ได้ บอกให้รู้)
   */
  async function submit() {
    const input = draft.trim();
    if (!input) return;
    setHits([]);
    setPicking(false);
    setPingCopied(null);
    if (demo) {
      setMsg("⚠️ โหมดตัวอย่างบันทึกไม่ได้");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders/line-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, input }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        profile?: { name: string };
        order?: Order;
        error?: string;
        savedLink?: boolean;
        managerId?: string;
        suggestions?: typeof suggestions;
        resolved?: string;
      };
      if (j.ok && j.order) onBound(j.order);
      if (j.ok && j.profile) {
        // ผูกได้เลย (userId ตรง หรือลิงก์ที่เคยจับคู่ไว้)
        setMsg(`✅ ผูกกับ "${j.profile.name}" แล้ว${j.resolved === "override" ? " (จำจากลิงก์ห้องแชทที่เคยจับคู่ไว้)" : ""} — ระบบส่งข้อความถึงได้`);
        setDraft("");
        setChanging(false);
        return;
      }
      if (j.ok && j.savedLink) {
        // ลิงก์ OA Manager ที่ยังไม่เคยจับคู่ → เก็บลิงก์แล้ว เสนอคนที่น่าจะใช่ให้ยืนยัน
        setPendingManagerId(j.managerId ?? null);
        setSuggestions(j.suggestions ?? []);
        setMsg(j.suggestions?.length ? "" : "เก็บลิงก์ห้องแชทแล้ว · พิมพ์ชื่อลูกค้าเพื่อผูกให้ระบบส่งข้อความได้");
        setDraft("");
        return;
      }
      setMsg(`❌ ${j.error ?? "บันทึกไม่สำเร็จ"}`);
    } catch {
      setMsg("❌ ต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  /** เลือกคนจากผลค้นหา → ผูกเลย */
  async function bindUserId(uid: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders/line-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // แนบรหัสท้ายลิงก์ที่รอจับคู่ไปด้วย → ระบบจำว่าลิงก์นี้ = คนนี้ ครั้งหน้าผูกอัตโนมัติ
        body: JSON.stringify({ orderId: order.id, input: uid, managerId: pendingManagerId ?? undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; profile?: { name: string }; order?: Order; error?: string };
      if (j.ok) {
        if (j.order) onBound(j.order);
        setMsg(`✅ ผูกกับ "${j.profile?.name}" แล้ว — ระบบส่งข้อความถึงได้`);
        setDraft("");
        setHits([]);
        setChanging(false);
        setPicked(null);
        setPendingManagerId(null);
        setSuggestions([]);
      } else setMsg(`❌ ${j.error ?? "ผูกไม่สำเร็จ"}`);
    } catch {
      setMsg("❌ ต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  /**
   * ปุ่ม "เปิดแชท" ตอนยังไม่ผูก: ก๊อปข้อความทักสั้น ๆ ใส่คลิปบอร์ดให้ก่อน
   * พนักงานวางส่งในห้องแชท 1 ครั้ง → ห้องนั้นเด้งขึ้นบนสุด → กลับมาแตะเลือกจากรายชื่อได้ทันที
   * (ระบบส่งเองไม่ได้ เพราะยังไม่รู้ userId — นี่คือเหตุผลที่ต้องจับคู่)
   */
  const pingText = `สวัสดีค่ะ ทางร้าน iDucky ขอยืนยันออเดอร์ ${order.id} นะคะ 🦆`;
  const [pingCopied, setPingCopied] = useState<boolean | null>(null); // null = ยังไม่ได้ลอง · true/false = ผลก๊อป

  /**
   * เปิดห้องแชท + ก๊อปข้อความทัก — ต้อง "ก๊อปให้เสร็จก่อน" แล้วค่อยเปิดแท็บ
   * (เปิดแท็บก่อน โฟกัสจะกระโดดไปแท็บใหม่ทันที เบราว์เซอร์ตัดสิทธิ์ก๊อป → คลิปบอร์ดว่าง)
   */
  async function openChatWithPing(url: string) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(pingText);
      ok = true;
    } catch {
      ok = false;
    }
    setPingCopied(ok);
    setMsg(
      ok
        ? "📋 ก๊อปข้อความทักไว้แล้ว — วาง (⌘V) ส่งในห้องแชท แล้วสลับกลับมาแท็บนี้ รายชื่อจะรีเฟรชให้เอง"
        : "ก๊อปอัตโนมัติไม่ได้ — กดปุ่ม 📋 ด้านล่างเพื่อก๊อปข้อความทัก แล้วไปวางในห้องแชท"
    );
    awaitingReturn.current = true;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /** ปุ่มก๊อปสำรอง (กดในหน้านี้โดยตรง = สิทธิ์ก๊อปครบ) */
  async function copyPingOnly() {
    try {
      await navigator.clipboard.writeText(pingText);
      setPingCopied(true);
      setMsg("📋 ก๊อปแล้ว — ไปวาง (⌘V) ส่งในห้องแชทได้เลย");
    } catch {
      setPingCopied(false);
      setMsg("ก๊อปไม่ได้ — เลือกข้อความด้านล่างแล้วก๊อปเอง");
    }
  }

  /** ดึงรายชื่อคุยล่าสุดใหม่ (หลังทักลูกค้าแล้ว ห้องนั้นจะขึ้นบนสุด) */
  async function refreshRecent() {
    setSearching(true);
    setPicking(true);
    setNoHit(null);
    try {
      // fresh=1 = ไม่เอาแคช (เพิ่งไปทักลูกค้าในแชทมา ต้องเห็นคิวใหม่ทันที)
      const res = await fetch(`/api/admin/line-customers?q=&fresh=1`);
      const j = (await res.json().catch(() => ({}))) as { customers?: typeof hits; total?: number };
      setHits(j.customers ?? []);
      setHitTotal(j.total ?? (j.customers?.length ?? 0));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  /**
   * ยกเลิกการผูก — forget=true จะลบ "ลิงก์ห้องแชทนี้ = คนนี้" ที่จำไว้ด้วย (กันเดาผิดซ้ำ)
   * clearLink=true ลบลิงก์ห้องแชทของใบนี้ทิ้งด้วย (ผูกผิดคน = ลิงก์ก็เป็นของคนผิด ไม่ควรค้างไว้)
   */
  async function unbind(forget = false, clearLink = false) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/orders/line-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, input: "", forget, clearLink }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; order?: Order; error?: string };
      if (!j.ok) {
        setMsg(`❌ ${j.error ?? "ยกเลิกไม่สำเร็จ"}`);
        return;
      }
      if (j.order) onBound(j.order);
      setPingCopied(null);
      setMsg(
        clearLink
          ? forget
            ? "ยกเลิกการผูก + ลบลิงก์ห้องแชท + ลืมคู่ลิงก์แล้ว"
            : "ยกเลิกการผูก + ลบลิงก์ห้องแชทแล้ว"
          : forget
            ? "ยกเลิกการผูก + ลืมคู่ลิงก์แล้ว (ลิงก์ห้องแชทยังอยู่)"
            : "ยกเลิกการผูกแล้ว (ลิงก์ห้องแชทยังอยู่ — กด ✕ ที่บรรทัดลิงก์ถ้าต้องการลบ)"
      );
    } catch {
      setMsg("❌ ต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  /**
   * เก็บลิงก์ห้องแชทอย่างเดียว — ใช้ตอนผูก userId ได้แล้วแต่ยังไม่มีลิงก์
   * (บังคับต้องมีทั้งคู่ · ลิงก์ไม่ต้องยืนยันกับ LINE เก็บตรง ๆ ได้เลย)
   */
  function saveChatLink() {
    const url = linkDraft.trim();
    if (!/^https?:\/\/chat\.line\.biz\/[^/]+\/chat\//i.test(url)) {
      setMsg("❌ ต้องเป็นลิงก์ห้องแชทจาก OA Manager (chat.line.biz/…/chat/…)");
      return;
    }
    if (demo) {
      setMsg("⚠️ โหมดตัวอย่างบันทึกไม่ได้");
      return;
    }
    onSave(url);
    setLinkDraft("");
    setMsg("✅ เก็บลิงก์ห้องแชทแล้ว — ครบทั้งลิงก์และ userId");
  }

  /** ยิงข้อความทดสอบจริง — รู้ทันทีว่าส่งถึงลูกค้าได้ไหม */
  async function sendTest() {
    if (demo) return;
    setTesting(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders/notify-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; error?: string; level?: string };
      const warn =
        j.level === "off"
          ? " (แต่ลูกค้าปิดรับแจ้งเตือน — ระบบจะไม่ส่งอัตโนมัติให้)"
          : j.level === "key"
            ? " (ลูกค้าเลือกรับเฉพาะเรื่องสำคัญ — ข่าวคืบหน้าจะไม่ถูกส่ง)"
            : "";
      setMsg(j.ok ? `✅ ส่งข้อความทดสอบถึงลูกค้าแล้ว${warn}` : `❌ ส่งไม่ได้ — ${j.reason ?? j.error ?? "ไม่ทราบสาเหตุ"}`);
    } catch {
      setMsg("❌ ต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setTesting(false);
    }
  }

  const note = msg && (
    <p className={`mt-1 text-[11px] font-semibold ${msg.startsWith("✅") ? "text-emerald-600" : msg.startsWith("⚠️") ? "text-orange-600" : msg.startsWith("❌") ? "text-rose-600" : "text-slate-500"}`}>
      {msg}
    </p>
  );

  // ── ผูกแล้ว (ของใบนี้ หรือจำมาจากใบเก่า) ──
  if (line && !changing)
    return (
      <div
        id="line-bind"
        className={`mt-2 scroll-mt-24 rounded-xl p-2.5 ring-1 ${chat ? "bg-emerald-50/70 ring-emerald-200" : "bg-emerald-50/70 ring-rose-300"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {line.picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={line.picture} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          )}
          <span className="text-[11px] font-bold text-[#06C755]">🟢 LINE: {line.name ?? line.id.slice(0, 10) + "…"}</span>
          {/* บัญชีที่ล็อกอินตอนสั่งเป็นคนละ LINE กับที่ผูก — บอกให้รู้ว่าระบบส่งหาคนที่ผูกไว้ ไม่ใช่บัญชีที่ล็อกอิน */}
          {order.loginLine && order.loginLine.userId !== line.id && (
            <span
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200"
              title={`ตอนสั่งล็อกอินด้วย LINE "${order.loginLine.name ?? order.loginLine.userId.slice(0, 10) + "…"}" — ระบบจะส่งข้อความหา "${line.name ?? "คนที่ผูกไว้"}" ตามที่ผูก`}
            >
              ล็อกอินด้วยอีกบัญชี ({order.loginLine.name ?? "LINE อื่น"}) · ส่งหาคนที่ผูกไว้
            </span>
          )}
          {order.notifyLevel && order.notifyLevel !== "all" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                order.notifyLevel === "off" ? "bg-rose-50 text-rose-600 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
              title="ลูกค้าตั้งค่าเองในหน้าออเดอร์ของเขา"
            >
              {order.notifyLevel === "off" ? "🔕 ลูกค้าปิดรับแจ้งเตือน" : "🔔 รับเฉพาะเรื่องสำคัญ"}
            </span>
          )}
          {line.source === "prev" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500" title={`ลูกค้าคนเดียวกับออเดอร์ ${line.from}`}>
              จำจาก {line.from}
            </span>
          )}
          {chat && (
            <a
              href={chat.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-[#06C755] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[#05b34c]"
            >
              💬 เปิดแชท
            </a>
          )}
          {mayEdit && (
            <>
              {/* จำมาจากใบเก่า → ให้พนักงานกดยืนยันผูกกับใบนี้ไปเลย (ใบนี้จะมี LINE เป็นของตัวเอง) */}
              {line.source === "prev" && (
                <button
                  type="button"
                  onClick={() => void bindUserId(line.id)}
                  disabled={busy}
                  className="rounded-full bg-[#06C755] px-2.5 py-0.5 text-[11px] font-bold text-white transition hover:bg-[#05b34c] disabled:opacity-50"
                >
                  {busy ? "กำลังผูก…" : "🔗 ผูกกับใบนี้"}
                </button>
              )}
              <button
                type="button"
                onClick={sendTest}
                disabled={testing}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
              >
                {testing ? "กำลังส่ง…" : "🔔 ทดสอบส่ง"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChanging(true);
                  setMsg("");
                }}
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                เปลี่ยนคน
              </button>
              {line.source === "self" && (
                <>
                  <button
                    type="button"
                    onClick={() => void unbind(false)}
                    disabled={busy}
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  {chat && (
                    <button
                      type="button"
                      onClick={() => void unbind(true, true)}
                      disabled={busy}
                      title="ผูกผิดคน — ยกเลิก ลบลิงก์ห้องแชทของใบนี้ และลบที่ระบบจำว่าลิงก์ห้องแชทนี้เป็นคนนี้ (ครั้งหน้าจะไม่เดาคนนี้อีก)"
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      ผูกผิดคน — ยกเลิก+ลืม
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {/* ผูกคนได้แล้วแต่ยังไม่มีลิงก์ห้องแชท — บังคับต้องมีทั้งคู่ ให้วางลิงก์ตรงนี้ได้เลย */}
        {!chat && (
          <div className="mt-1.5 rounded-lg bg-rose-50 p-2 ring-1 ring-rose-200">
            <p className="text-[11px] font-bold text-rose-700">⛔ ยังขาด “ลิงก์ห้องแชท” (บังคับ) — ก๊อป URL จากหน้าห้องแชทใน OA Manager มาวาง</p>
            {mayEdit ? (
              <div className="mt-1 flex gap-1.5">
                <input
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveChatLink();
                  }}
                  placeholder="https://chat.line.biz/…/chat/…"
                  className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 focus:border-rose-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveChatLink}
                  disabled={!linkDraft.trim()}
                  className="shrink-0 rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  บันทึกลิงก์
                </button>
              </div>
            ) : (
              <p className="mt-0.5 text-[10px] text-rose-600">ให้พนักงานที่แก้ออเดอร์ได้เป็นคนวางลิงก์</p>
            )}
          </div>
        )}
        {chat && (
          <p className="mt-1.5 flex min-w-0 items-center gap-1 text-[10px] text-slate-400" title={chat.url}>
            <span className="min-w-0 truncate">
              🔗 <a href={chat.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">{chat.url}</a>
              {chat.source === "prev" && <span className="ml-1">(จาก {chat.from})</span>}
            </span>
            {/* ลบเฉพาะลิงก์ (คงคนที่ผูกไว้) — ลิงก์ของใบนี้เท่านั้น ลิงก์ที่จำจากใบเก่าต้องไปลบที่ใบนั้น */}
            {mayEdit && chat.source === "self" && (
              <button
                type="button"
                onClick={() => {
                  onSave("");
                  setPingCopied(null);
                  setMsg("ลบลิงก์ห้องแชทแล้ว — วางลิงก์ที่ถูกต้องในช่องสีแดงด้านล่างได้เลย");
                }}
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                title="ลบลิงก์ห้องแชทของใบนี้ (คนที่ผูกไว้ยังอยู่)"
              >
                ✕ ลบลิงก์
              </button>
            )}
          </p>
        )}
        {note}
      </div>
    );

  // ── ยังไม่ผูก — บังคับ ต้องใส่ให้ครบทั้งลิงก์ห้องแชทและ userId ──
  // ออเดอร์เพิ่งสร้างยังว่างเปล่า = ยังไม่รู้ว่าลูกค้าคือใคร → โทนปกติไว้ก่อน ค่อยขึ้นแดงเมื่อเริ่มกรอก
  if (!mayEdit) return null;
  const fresh = !changing && isBlankOrder(order);
  return (
    <div
      id="line-bind"
      className={`mt-2 scroll-mt-24 rounded-xl p-2.5 ring-1 ${changing ? "bg-slate-50 ring-dashed ring-slate-300" : fresh ? "bg-white ring-slate-200" : "bg-rose-50 ring-rose-300"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className={`min-w-[10rem] flex-1 text-[11px] font-bold ${changing ? "text-slate-500" : fresh ? "text-slate-600" : "text-rose-700"}`}>
          {changing
            ? "🔄 เปลี่ยน LINE ของลูกค้า — ค้นแล้วเลือกคนใหม่"
            : fresh
              ? "🔗 ผูก LINE ของลูกค้า (ลิงก์ห้องแชท + userId) — ผูกได้เลยถ้ารู้แล้วว่าลูกค้าคนไหน"
              : "⛔ บังคับ: ต้องผูก LINE ของลูกค้าให้ครบ (ลิงก์ห้องแชท + userId)"}
        </p>
        {/* มีลิงก์ห้องแชทเก็บไว้แล้ว (แต่ยังไม่ผูก userId) — โชว์ให้เห็นว่าไม่ได้หายไปไหน */}
        {chat && !changing && (
          <>
            <button
              type="button"
              onClick={() => void openChatWithPing(chat.url)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
              title="เปิดห้องแชท + ก๊อปข้อความทักให้ — วางส่ง 1 ครั้ง ห้องจะเด้งขึ้นบนสุด แล้วกลับมาเลือกจากรายชื่อได้"
            >
              💬 เปิดแชท
            </button>
            {mayEdit &&
              (chat.source === "self" ? (
                <button
                  type="button"
                  onClick={() => {
                    onSave("");
                    setPingCopied(null);
                    setMsg("ลบลิงก์ห้องแชทแล้ว");
                  }}
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                  title="ลบลิงก์ห้องแชท"
                >
                  ✕
                </button>
              ) : (
                <span
                  className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                  title={`ลิงก์นี้จำมาจากออเดอร์ ${chat.from} ของลูกค้าคนเดียวกัน — ไปลบที่ใบนั้น`}
                >
                  จำจาก {chat.from}
                </span>
              ))}
          </>
        )}
        {changing && (
          <button
            type="button"
            onClick={() => {
              setChanging(false);
              setDraft("");
              setHits([]);
            }}
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-white"
          >
            ย้อนกลับ
          </button>
        )}
      </div>
      {/* เช็กลิสต์ 2 ช่อง — เห็นทันทีว่าขาดอะไร (ในโหมดนี้ userId ยังไม่ผูกแน่นอน) */}
      {!changing && (
        <p className="mt-1 text-[10px] font-bold">
          <span className={chat ? "text-emerald-600" : fresh ? "text-slate-400" : "text-rose-600"}>{chat ? "✔" : "✖"} ลิงก์ห้องแชท</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className={fresh ? "text-slate-400" : "text-rose-600"}>✖ LINE userId</span>
        </p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setPicking(true)}
          onBlur={() => setTimeout(() => setPicking(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="แตะเพื่อเลือกจากรายชื่อ · หรือพิมพ์ชื่อ LINE ค้นหา"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 focus:border-amber-300 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-lg bg-[#06C755] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#05b34c] disabled:opacity-50"
        >
          {busy ? "กำลังเช็ค…" : "บันทึก"}
        </button>
        {chat && !draft.trim() && (
          <button
            type="button"
            onClick={() => void refreshRecent()}
            disabled={searching}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            title="ทักลูกค้าในแชทแล้ว → กดดูรายชื่อล่าสุด ห้องนั้นจะขึ้นบนสุด"
          >
            🔄
          </button>
        )}
      </div>
      {/* ข้อความทักที่จะไปวางในห้องแชท — เผื่อก๊อปอัตโนมัติไม่ติด กดปุ่มนี้ก๊อปเอง หรือเลือกข้อความแล้วก๊อป */}
      {pingCopied !== null && (
        <div className={`mt-1.5 flex items-center gap-2 rounded-lg p-2 ring-1 ${pingCopied ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
          <p className="min-w-0 flex-1 select-all text-[11px] leading-snug text-slate-700">{pingText}</p>
          <button
            type="button"
            onClick={() => void copyPingOnly()}
            className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-700"
          >
            📋 ก๊อป
          </button>
        </div>
      )}

      {/* วางลิงก์ OA Manager แล้ว → เดาว่าเป็นใครจากคนที่คุยล่าสุด ให้ยืนยันคลิกเดียว */}
      {pendingManagerId && suggestions.length > 0 && !picked && !draft.trim() && (
        <div className="mt-1.5 rounded-lg bg-sky-50 p-2 ring-1 ring-sky-200">
          <p className="text-[11px] font-bold text-sky-800">🔗 เก็บลิงก์ห้องแชทแล้ว — ลิงก์นี้น่าจะเป็นใคร? (คนที่คุยกับร้านล่าสุด)</p>
          <div className="mt-1.5 space-y-1">
            {suggestions.map((h) => (
              <button
                key={h.userId}
                type="button"
                onClick={() => setPicked({ userId: h.userId, name: h.name, picture: h.picture })}
                className="flex w-full items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-left ring-1 ring-sky-100 transition hover:bg-sky-100"
              >
                {h.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.picture} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full bg-slate-100" />
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{h.name}</span>
                {h.remembered ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">เคยจับคู่ไว้</span>
                ) : (
                  h.lastSeen && (
                    <span className="shrink-0 text-[10px] text-slate-400">
                      คุยล่าสุด {new Date(h.lastSeen).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )
                )}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-sky-700/80">ไม่ใช่สักคน? พิมพ์ชื่อในช่องด้านบนเพื่อค้นหา</span>
            <button
              type="button"
              onClick={() => {
                setPendingManagerId(null);
                setSuggestions([]);
              }}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white"
            >
              ข้ามไปก่อน
            </button>
          </div>
        </div>
      )}

      {/* เลือกไว้แล้ว รอยืนยัน — ต้องกดอีกครั้งถึงผูกจริง */}
      {picked && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-200">
          {picked.picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.picture} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-emerald-800">
            ผูกกับ “{picked.name}” ใช่ไหม?{pendingManagerId ? " (จะจำว่าลิงก์ห้องแชทนี้ = คนนี้)" : ""}
          </span>
          <button
            type="button"
            onClick={() => void bindUserId(picked.userId)}
            disabled={busy}
            className="shrink-0 rounded-lg bg-[#06C755] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#05b34c] disabled:opacity-50"
          >
            {busy ? "กำลังผูก…" : "ยืนยันผูก"}
          </button>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-white"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {chat && !changing && (
        <p className="mt-1.5 truncate text-[10px] text-slate-400" title={chat.url}>
          🔗{" "}
          <a
            href={chat.url}
            onClick={(e) => {
              e.preventDefault();
              void openChatWithPing(chat.url);
            }}
            className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
          >
            {chat.url}
          </a>
          {chat.source === "prev" && <span className="ml-1">(จาก {chat.from})</span>}
        </p>
      )}
      {/* ผลค้นหาจากคลังแชท LINE ของร้าน — แตะเลือกคน แล้วกดยืนยันอีกครั้ง */}
      {picking && !picked && (searching || hits.length > 0) && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {searching && hits.length === 0 && <p className="px-2.5 py-2 text-[11px] text-slate-400">กำลังค้นจากคลังแชท…</p>}
          {hits.length > 0 && (
            <div className="flex items-center border-b border-slate-100 bg-slate-50 px-2.5 py-1">
              <p className="min-w-0 flex-1 text-[10px] font-semibold text-slate-500">
                {draft.trim().length >= 1
                  ? pendingManagerId
                    ? "ผลค้นหา — เลือกแล้วจะจำว่าลิงก์ห้องแชทนี้ = คนนี้"
                    : hitExact > 1
                      ? `ชื่อนี้ตรงพอดี ${hitExact} คน — ดูรูปโปรไฟล์เทียบกับห้องแชท แล้วแตะเลือก`
                      : `ผลค้นหาจากคลังแชท${hitTotal > hits.length ? ` — เจอ ${hitTotal} คน แสดง ${hits.length} (พิมพ์เพิ่มให้แคบลง)` : ""}`
                  : "ลูกค้าที่คุยกับร้านล่าสุด — แตะเพื่อผูก"}
              </p>
              {draft.trim().length < 1 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void refreshRecent()}
                  disabled={searching}
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white disabled:opacity-50"
                  title="ทักลูกค้าในแชทแล้ว → กดรีเฟรช ห้องนั้นจะขึ้นบนสุด"
                >
                  🔄 รีเฟรช
                </button>
              )}
            </div>
          )}
          {hits.map((h) => (
            <button
              key={h.userId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPicked({ userId: h.userId, name: h.name, picture: h.picture })}
              disabled={busy}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 text-left transition last:border-0 hover:bg-slate-50 disabled:opacity-50"
            >
              {h.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.picture} alt="" className={`${hitExact > 1 ? "h-9 w-9" : "h-6 w-6"} shrink-0 rounded-full object-cover`} />
              ) : (
                <span className={`${hitExact > 1 ? "h-9 w-9" : "h-6 w-6"} shrink-0 rounded-full bg-slate-100`} />
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{h.name}</span>
              {h.lastSeen && (
                <span className="shrink-0 text-[10px] text-slate-400">
                  คุยล่าสุด {new Date(h.lastSeen).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* ค้นแล้วไม่เจอ — เดิมไม่ขึ้นอะไรเลย (เงียบ = พนักงานคิดว่าระบบเสีย) บอกสาเหตุที่เจอบ่อยและทางไปต่อ */}
      {picking && !picked && !searching && noHit && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-bold text-amber-800">
            ไม่เจอ “{noHit.q}” ในคลังแชท{noHit.refreshed ? " (ดึงรายชื่อใหม่แล้วก็ยังไม่เจอ)" : ""}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-amber-700/90">
            ต้องพิมพ์ <b>ชื่อ LINE ที่เห็นบนหัวห้องแชท</b> — ไม่ใช่ชื่อผู้รับในออเดอร์ (ส่วนใหญ่คนละชื่อกัน) · ลูกค้าที่เพิ่งทักมา ให้กดดูรายชื่อคุยล่าสุดแล้วแตะเลือกได้เลย
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft("");
                void refreshRecent();
              }}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-700"
            >
              🔄 ดูคนที่คุยกับร้านล่าสุด
            </button>
            {chat && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void openChatWithPing(chat.url)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
              >
                💬 เปิดแชทดูชื่อ LINE
              </button>
            )}
          </div>
        </div>
      )}
      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        ต้องได้ครบ 2 อย่าง: วาง <b>ลิงก์ห้องแชท</b> (chat.line.biz) แล้วแตะเลือกจากรายชื่อ หรือพิมพ์ <b>ชื่อ LINE</b> ค้นหาเพื่อผูก <b>userId</b>
      </p>
      {note}
    </div>
  );
}

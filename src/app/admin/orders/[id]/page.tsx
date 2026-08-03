"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ThaiPostTimeline from "@/components/ThaiPostTimeline";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  MOCK_ORDERS,
  ORDER_STATUSES,
  adminDiscountAmount,
  amountDueNow,
  daysToUseBy,
  itemDiscountAmount,
  orderItemDiscounts,
  orderTotal,
  packGate,
  PROOF_STYLES,
  proofsOf,
  STATUS_STYLES,
  withLog,
  NOTE_COLORS,
  NOTE_SIZES,
  NOTE_WEIGHTS,
  noteHasText,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Proof,
  type ProofStatus,
  type NoteColor,
  type NoteSize,
  type NoteWeight,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin, uploadProof } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { card, faint, muted, shortTime } from "@/lib/admin-ui";
import ImageLightbox from "@/components/ImageLightbox";
import PackCheckPanel from "@/components/PackCheckPanel";
import { useActor, useCan, useRoleLabel } from "@/lib/perm-context";
import { publicOrigin } from "@/lib/shop-info";
import { fetchShopPayment, shippingOf, type ShippingMethod } from "@/lib/shop-settings";

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
const SOFT = "rounded-xl border border-slate-200/70 bg-white p-4";

/** สีประจำกลุ่มข้อมูลในหน้าออเดอร์ — กวาดตาหาหัวข้อที่ต้องการได้เร็วขึ้น */
const GTONE: Record<string, { text: string; bar: string; card: string }> = {
  indigo: { text: "text-indigo-700", bar: "bg-indigo-400", card: "border-l-indigo-400" },
  emerald: { text: "text-emerald-700", bar: "bg-emerald-400", card: "border-l-emerald-400" },
  sky: { text: "text-sky-700", bar: "bg-sky-400", card: "border-l-sky-400" },
  violet: { text: "text-violet-700", bar: "bg-violet-400", card: "border-l-violet-400" },
  green: { text: "text-green-700", bar: "bg-green-500", card: "border-l-green-500" },
  orange: { text: "text-orange-700", bar: "bg-orange-400", card: "border-l-orange-400" },
  cyan: { text: "text-cyan-700", bar: "bg-cyan-400", card: "border-l-cyan-400" },
  teal: { text: "text-teal-700", bar: "bg-teal-400", card: "border-l-teal-400" },
  rose: { text: "text-rose-700", bar: "bg-rose-400", card: "border-l-rose-400" },
  slate: { text: "text-slate-500", bar: "bg-slate-300", card: "border-l-slate-300" },
};
/** หัวข้อกลุ่ม: ขีดสี + ตัวหนังสือสีเดียวกับแถบซ้ายของการ์ดข้างล่าง */
function GH({ t, children }: { t: string; children: React.ReactNode }) {
  const g = GTONE[t] ?? GTONE.slate;
  return (
    <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.09em] ${g.text}`}>
      <span className={`inline-block h-3 w-1 shrink-0 rounded-full ${g.bar}`} />
      {children}
    </p>
  );
}
/** การ์ดของกลุ่ม — ขอบซ้ายสีเดียวกับหัวข้อ */
const soft = (t: string) => `rounded-xl border border-slate-200/70 border-l-4 ${(GTONE[t] ?? GTONE.slate).card} bg-white p-3`;

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
  const lastPushed = useRef<string>(value ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [empty, setEmpty] = useState(!noteHasText(value));

  // เคลียร์ตัวตั้งเวลาเซฟตอน unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ซิงก์ค่าจากภายนอกเข้า editor (ไม่ทับตอนแอดมินกำลังพิมพ์เอง)
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

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = decodeURIComponent(String(params?.id ?? ""));

  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [err, setErr] = useState("");
  /** กล่องยืนยันของระบบเอง — แทน confirm() ของเบราว์เซอร์ (หน้าตาเข้ากับหลังบ้าน บอกผลของการกดชัดกว่า) */
  const [confirmBox, setConfirmBox] = useState<{
    icon: string;
    title: string;
    detail?: string;
    confirmLabel: string;
    danger: boolean;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const askConfirm = useCallback(
    (o: { icon?: string; title: string; detail?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setConfirmBox({
          icon: o.icon ?? "❓",
          title: o.title,
          detail: o.detail,
          confirmLabel: o.confirmLabel ?? "ยืนยัน",
          danger: o.danger ?? false,
          resolve,
        })
      ),
    []
  );
  // แอดมินแก้ "รายละเอียดงาน" ของรายการที่ลูกค้าสั่งได้ (แก้ได้เฉพาะรายละเอียด — ชื่อ/จำนวน/ราคาไม่แตะ)
  const [editSel, setEditSel] = useState<number | null>(null);
  const [selDraft, setSelDraft] = useState("");
  function saveSelections(itemIndex: number, text: string) {
    if (!order) return;
    const before = order.items[itemIndex]?.selections ?? "";
    const value = text.trim();
    setEditSel(null);
    if (value === before.trim()) return;
    const items = order.items.map((it, i) => (i === itemIndex ? { ...it, selections: value } : it));
    const next = withLog({ ...order, items }, actor, "แก้รายละเอียดรายการ", `${order.items[itemIndex]?.name}`);
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
  }
  const [statusMenu, setStatusMenu] = useState(false);
  const [artDropIdx, setArtDropIdx] = useState<number | null>(null);
  const [proofDropIdx, setProofDropIdx] = useState<number | null>(null);
  const [replaceDrop, setReplaceDrop] = useState<string | null>(null); // "itemIndex:proofIndex" ที่กำลังลากไฟล์ทับเพื่อเปลี่ยนรูป
  const [addPicIdx, setAddPicIdx] = useState<number | null>(null); // เปิดเมนู "เพิ่มรูป" ของรายการไหนอยู่
  // ช่องส่วนลดรายรายการ — ซ่อนไว้ กดป้าย "＋ ใส่ส่วนลด" ท้ายแถวถึงจะโผล่ (นาน ๆ ใช้ที)
  const [discOpen, setDiscOpen] = useState<Record<number, boolean>>({});
  // ช่องหมายเหตุใบงานของแต่ละรายการ — ซ่อนไว้ กดที่รายการนั้นเพื่อเปิด
  const [noteOpen, setNoteOpen] = useState<Record<number, boolean>>({});
  // ยุบ/กางรายละเอียดของแต่ละรายการ — ออเดอร์ที่มีหลายรายการจะได้ไม่ยาวจนหาของไม่เจอ
  const [itemOpen, setItemOpen] = useState<Record<number, boolean>>({});
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
  const [logOpen, setLogOpen] = useState(false); // ประวัติการทำงาน: หุบไว้ (โชว์ 3 รายการล่าสุด) กดค่อยขยาย

  useEffect(() => setShortcutExt(shortcutKind()), []);
  const [skipGate, setSkipGate] = useState<string[] | null>(null); // โมดัลยืนยันข้ามด่านแพ็ค (เหตุผลที่ยังไม่ครบ)
  const [shortcutExt, setShortcutExt] = useState<"webloc" | "url" | "">(""); // นามสกุลทางลัดตามเครื่องที่เปิด (รู้หลัง mount)
  const trackingRef = useRef<string>(""); // เลขพัสดุที่บันทึกไปแล้ว กันบันทึกซ้ำตอน blur

  const can = useCan();
  const actor = useActor(); // ชื่อคนที่ล็อกอินอยู่ (ไว้บันทึกประวัติว่าใครทำ)
  const seesMoney = can("orders.money"); // เห็นราคา/สลิป
  const isSuperAdmin = useRoleLabel() === "ผู้ดูแลระบบ"; // ลบสลิปได้เฉพาะผู้ดูแลระบบ (เซิร์ฟเวอร์บังคับซ้ำ)
  const mayEdit = can("orders.edit"); // เปลี่ยนสถานะ/แก้ข้อมูล
  const mayProof = can("proof.manage"); // อัปโหลด/ลบแบบงาน
  const mayCancel = can("orders.cancel");

  useEffect(() => setOrigin(publicOrigin()), []); // ลิงก์นี้ส่งให้ลูกค้า ต้องไม่ใช่ localhost

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    const list = r.orders.length > 0 ? r.orders : MOCK_ORDERS;
    setDemo(r.orders.length === 0);
    setAllOrders(list);
    setOrder(list.find((o) => o.id === orderId) ?? null);
    setLoading(false);
  }, [orderId]);

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

    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    const found = r.orders.find((o) => o.id === orderId);
    if (!found) return;
    setOrder((cur) => (JSON.stringify(cur) === JSON.stringify(found) ? cur : found));
  }, [orderId, uploadingIdx]);

  usePolling(refresh, { enabled: !demo && !!order });

  // วิธีจัดส่งจากตั้งค่าร้าน — ให้แอดมินเลือกแล้วเติมค่าส่งอัตโนมัติ (ใช้ในออเดอร์งานพิเศษ/สั่งแทน)
  const [shipMethods, setShipMethods] = useState<ShippingMethod[]>([]);
  useEffect(() => {
    void fetchShopPayment().then((p) => setShipMethods(shippingOf(p)));
  }, []);

  function changeStatus(status: OrderStatus) {
    if (!order || order.status === status) return;
    const next = withLog({ ...order, status }, actor, "เปลี่ยนสถานะ", `${order.status} → ${status}`);
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
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
    if (j.order) setOrder(j.order);
  }

  /** บันทึกออเดอร์ปัจจุบันลงฐานข้อมูล (เรียกตอน blur ช่องกรอก) */
  function persist() {
    if (!order || demo) return;
    void saveOrderAdmin(order);
  }

  /** อัปเดต order + บันทึกทันที (ใช้กับ select สี/ขนาด/วันที่ ที่ไม่มี blur) */
  function applyOrder(next: Order) {
    setOrder(next);
    if (demo) return;
    // บันทึกจริงลงฐาน — ถ้าพลาด ต้องขึ้นให้เห็น (เดิมเงียบ แล้วข้อมูลหายตอนรีเฟรช)
    void saveOrderAdmin(next).then((ok) => {
      if (!ok) setErr("บันทึกลงฐานข้อมูลไม่สำเร็จ — อย่าเพิ่งปิดหน้านี้ ลองแก้ค่าอีกครั้งหรือเช็คอินเทอร์เน็ต");
    });
  }

  /** บันทึกหมายเหตุ (HTML) ของท้ายบิล หรือของรายการที่ index (itemIdx = null → ท้ายบิล) · commit = บันทึกลง DB */
  function setNote(itemIdx: number | null, html: string, commit: boolean) {
    setOrder((cur) => {
      if (!cur) return cur;
      const next =
        itemIdx === null
          ? { ...cur, billNote: html }
          : { ...cur, items: cur.items.map((it, i) => (i === itemIdx ? { ...it, adminNote: html } : it)) };
      if (commit && !demo) void saveOrderAdmin(next);
      return next;
    });
  }

  /** บันทึกเลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" + ลง log
   *  ด่านตรวจยังไม่ครบ → แอดมินยืนยันข้ามได้ (เซิร์ฟเวอร์ลง log "ข้ามด่านตรวจ") · ฝ่ายแพ็คโดนเซิร์ฟเวอร์ปฏิเสธ */
  function saveTracking() {
    if (!order) return;
    const t = (order.tracking ?? "").trim();
    if (!t || t === trackingRef.current) return; // ไม่เปลี่ยน → ไม่ต้องบันทึกซ้ำ

    const g = packGate(order);
    if (!g.ready) {
      const reasons = [
        g.uncounted.length ? `ตรวจนับแบบงานอีก ${g.uncounted.length} รูป` : "",
        g.unread.length ? `ยืนยันอ่านรายละเอียดอีก ${g.unread.length} รายการ` : "",
        g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
        g.unsampled.length ? `ยังไม่ยืนยันใส่ชิ้นงานตัวอย่าง ${g.unsampled.length} รายการ` : "",
        g.noPhoto ? "ยังไม่ได้ถ่ายภาพก่อนปิดกล่อง" : "",
        g.unpaidBalance ? "ยังเก็บยอดคงเหลือ (มัดจำ 50%) ไม่ครบ" : "",
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
    if (!demo) void saveOrderAdmin(next);
  }

  /** แอดมินยืนยัน "ข้ามด่านตรวจ" จากโมดัล — เซิร์ฟเวอร์จะลง log ชื่อคนข้ามเสมอ */
  function confirmSkipGate() {
    setSkipGate(null);
    const t = (order?.tracking ?? "").trim();
    if (t) commitTracking(t);
  }

  /** ยกเลิกข้ามด่าน → คืนช่องเลขพัสดุเป็นค่าเดิม */
  function cancelSkipGate() {
    setSkipGate(null);
    setOrder((cur) => (cur ? { ...cur, tracking: trackingRef.current || undefined } : cur));
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
        p.qty ? `${p.qty} ชิ้น` : "",
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
    if (!demo) void saveOrderAdmin(next);
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
    if (!(await askConfirm({ icon: "💰", title: `ยืนยันว่าได้รับมัดจำ ${formatPrice(order.deposit.amount)} แล้ว?`, detail: "ระบบจะบันทึกว่าเก็บงวดแรกแล้ว เริ่มงานได้เลย", confirmLabel: "ยืนยันรับมัดจำ" }))) return;
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
        `ยอด ${order.deposit.amount} บาท`
      )
    );
  }

  /** แอดมินยืนยันว่าเก็บยอดคงเหลือครบแล้ว — ปลดล็อกพิมพ์เอกสาร/ยิงเลขพัสดุ */
  async function confirmDepositSettled() {
    if (!order?.deposit || !order.deposit.firstPaidAt || order.deposit.settledAt) return;
    const bal = Math.max(0, orderTotal(order) - (order.paidTotal ?? order.deposit.amount));
    if (!(await askConfirm({ icon: "💰", title: `ยืนยันว่าได้รับยอดคงเหลือ ${formatPrice(bal)} แล้ว?`, detail: "ครบ 100% แล้วจะปลดล็อกการพิมพ์ใบงาน/ใบเสร็จ และยิงเลขพัสดุได้", confirmLabel: "ยืนยันรับครบแล้ว" }))) return;
    const now = new Date().toISOString();
    applyOrder(
      withLog(
        { ...order, deposit: { ...order.deposit, settledAt: now }, paidTotal: orderTotal(order) },
        actor,
        "รับยอดคงเหลือครบแล้ว",
        `ยอด ${bal} บาท — จ่ายครบ 100%`
      )
    );
  }

  /** แอดมินเช็คสต๊อก/คิวผลิตแล้วกดยืนยัน → เคลียร์ธง + ระบบแจ้งลูกค้าทางไลน์ให้อัตโนมัติ */
  async function confirmStock(itemIndex: number) {
    if (!order) return;
    const it = order.items[itemIndex];
    if (!it?.needStockCheck) return;
    const ship = order.shipDate?.from ? ` (วันส่งที่ตั้งไว้: ${order.shipDate.from})` : "";
    if (!(await askConfirm({ icon: "📦", title: "ยืนยันว่าเช็คสต๊อก/คิวผลิตแล้ว?", detail: `${it.name} × ${it.qty.toLocaleString("th-TH")} ชิ้น${ship} — ระบบจะแจ้งลูกค้าว่ารับผลิตได้`, confirmLabel: "ยืนยัน — แจ้งลูกค้า" }))) return;
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
      fd.append("file", f);
      const res = await fetch("/api/admin/orders/pack-photo", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
      if (!res.ok || !j?.order) {
        setErr(j?.error ?? "อัปโหลดภาพไม่สำเร็จ");
        return;
      }
      setOrder(j.order);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, index }),
    });
    const j = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
    if (!res.ok || !j?.order) {
      setErr(j?.error ?? "ลบภาพไม่สำเร็จ");
      return;
    }
    setOrder(j.order);
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
    if (!demo) void saveOrderAdmin(next);
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
    if (!demo) void saveOrderAdmin(next);
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
    if (!demo) void saveOrderAdmin(next);
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
    if (!demo) void saveOrderAdmin(next);
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
        proofs: [...proofsOf(it), ...fresh.map((url) => ({ url, at: now }))],
        proofStatus: "รอตรวจ" as ProofStatus,
        proofUpdatedAt: now,
      };
    });
    if (!added) return;
    const next = withLog({ ...order, items }, actor, "ส่งแบบให้ลูกค้าตรวจ", `${order.items[itemIndex]?.name} — ใช้ลายที่แนบ ${added} รูป`);
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
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
        proofs: [...proofsOf(it), { url, at: now }],
        proofStatus: "รอตรวจ" as ProofStatus,
        proofUpdatedAt: now,
      };
    });
    const next = withLog({ ...order, items }, actor, "ส่งแบบให้ลูกค้าตรวจ", `${order.items[itemIndex]?.name} — ใช้ลายที่แนบไว้`);
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
  }

  /** ลบภาพลายของลูกค้าออกจากรายการ (ไฟล์ยังอยู่ในคลัง แต่ไม่ผูกกับออเดอร์แล้ว) */
  function removeArtwork(itemIndex: number, url: string) {
    if (!order) return;
    const items = order.items.map((it, i) =>
      i === itemIndex ? { ...it, artworkUrls: (it.artworkUrls ?? []).filter((u) => u !== url) } : it
    );
    const next = withLog({ ...order, items }, actor, "ลบภาพลาย", order.items[itemIndex]?.name);
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
  }

  /** แนบภาพลายเพิ่มให้รายการนี้ (ลากวาง/เลือกไฟล์ที่คอลัมน์รูป) */
  const [artUpIdx, setArtUpIdx] = useState<number | null>(null);
  async function addArtwork(itemIndex: number, fileList: FileList | File[] | null) {
    if (!order || !fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setArtUpIdx(itemIndex);
    const urls: string[] = [];
    for (const f of files.slice(0, 8)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) {
        setErr(j?.error ?? "อัปโหลดภาพลายไม่สำเร็จ");
        break;
      }
      urls.push(j.url);
    }
    setArtUpIdx(null);
    if (!urls.length) return;
    setOrder((cur) => {
      if (!cur) return cur;
      const items = cur.items.map((it, i) =>
        i === itemIndex ? { ...it, artworkUrls: [...(it.artworkUrls ?? []), ...urls] } : it
      );
      const next = withLog({ ...cur, items }, actor, "แนบภาพลาย", `${cur.items[itemIndex]?.name} +${urls.length} รูป`);
      if (!demo) void saveOrderAdmin(next);
      return next;
    });
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
    if (!demo) void saveOrderAdmin(next);
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
    for (const file of files) {
      const res = await uploadProof(order.id, itemIndex, file);
      if (!res.ok) {
        setErr(res.error ?? "อัปโหลดแบบไม่สำเร็จ");
        break;
      }
      if (res.order) setOrder(res.order);
    }
    setUploadingIdx(null);
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
    const res = await uploadProof(order.id, itemIndex, file, { replaceIndex: proofIdx });
    setUploadingIdx(null);
    if (!res.ok) {
      setErr(res.error ?? "เปลี่ยนรูปไม่สำเร็จ");
      return;
    }
    if (res.order) setOrder(res.order);
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
  // ฝ่ายแพ็ค (ตรวจนับได้ แต่แก้ออเดอร์ไม่ได้) → เห็นหน้าแพ็คเสมอ · แอดมิน/พนักงานแอดมินกด "โหมดแพ็ค" เอง
  const isPackOnly = can("pack.check") && !mayEdit;
  const showPackView = isPackOnly || packMode;

  if (showPackView) {
    return (
      <>
        {packMode && !isPackOnly && (
          <div className="mx-auto mb-3 flex max-w-[480px] items-center justify-between px-3">
            <span className="text-sm font-bold text-slate-500">📦 โหมดแพ็ค</span>
            <button
              type="button"
              onClick={() => setPackMode(false)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ← กลับหน้าตรวจสอบออเดอร์
            </button>
          </div>
        )}
        {skipGate && <SkipGateModal reasons={skipGate} onCancel={cancelSkipGate} onConfirm={confirmSkipGate} />}
        <PackView
          order={order}
          onPhotoAdd={addPackPhotos}
          onPhotoDelete={deletePackPhoto}
          gate={gate}
          onCheck={setPackCheck}
          onAck={toggleNoteAck}
          onSampleAck={toggleSamplePacked}
          onTrackingChange={(v) => setOrder((cur) => (cur ? { ...cur, tracking: v } : cur))}
          onTrackingSave={saveTracking}
          onZoom={showProof}
        />
        {confirmBox && (
          <ConfirmModal
            icon={confirmBox.icon}
            title={confirmBox.title}
            detail={confirmBox.detail}
            confirmLabel={confirmBox.confirmLabel}
            danger={confirmBox.danger}
            onCancel={() => {
              confirmBox.resolve(false);
              setConfirmBox(null);
            }}
            onConfirm={() => {
              confirmBox.resolve(true);
              setConfirmBox(null);
            }}
          />
        )}
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
  const qty = order.items.reduce((s, i) => s + i.qty, 0);
  // ลิงก์ฝั่งลูกค้า (ต้องมี key ถึงเปิดได้) — origin ตั้งใน useEffect กัน SSR mismatch
  const customerUrl = origin
    ? `${origin}/order/${encodeURIComponent(order.id)}${order.key ? `?key=${encodeURIComponent(order.key)}` : ""}`
    : "";

  return (
    <div className={`mx-auto w-full max-w-[112rem] overflow-hidden ${card}`}>
      {/* ── แถบหัว ── */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/70 bg-slate-50/70 px-6 py-5">
        <div>
          <Link href="/admin/orders" className="text-xs text-slate-400 hover:text-slate-600">
            ← คำสั่งซื้อทั้งหมด
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            {order.id}
            {order.rush && (
              <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">🔥 งานเร่ง</span>
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
        <div className="ml-auto flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-1.5">
            {(
              [
                ["work", "🧾 ใบงาน + ใบปะหน้า"],
                ["receipt", "💳 ใบเสร็จ"],
              ] as const
            ).map(([doc, label]) => (
              <Link
                key={doc}
                href={`/admin/orders/${encodeURIComponent(order.id)}/print?doc=${doc}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {label}
              </Link>
            ))}
          </div>
          {mayEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${STATUS_STYLES[order.status]}`}>{order.status}</span>
              {/* ปุ่มเดียวสำหรับ "ขั้นถัดไป" ที่ปกติจะกด — ไม่ต้องไล่หาในลิสต์ */}
              {NEXT_STATUS[order.status] && (
                <button
                  type="button"
                  onClick={() => changeStatus(NEXT_STATUS[order.status]!.to)}
                  className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700"
                  title={`เปลี่ยนสถานะเป็น “${NEXT_STATUS[order.status]!.to}”`}
                >
                  {NEXT_STATUS[order.status]!.label} →
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStatusMenu((v) => !v)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                  aria-expanded={statusMenu}
                >
                  เปลี่ยนสถานะ ▾
                </button>
                {statusMenu && (
                  <>
                    <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="ปิดเมนู" onClick={() => setStatusMenu(false)} />
                    <div className="absolute right-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      {STATUS_GROUPS.map((g) => (
                        <div key={g.title} className="border-b border-slate-100 py-1 last:border-0">
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
                          {g.items.map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                setStatusMenu(false);
                                if (st !== order.status) changeStatus(st);
                              }}
                              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-slate-50 ${
                                st === order.status ? "font-bold text-slate-900" : "text-slate-600"
                              }`}
                            >
                              {st}
                              {st === order.status && <span className="text-xs text-emerald-600">● ตอนนี้</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                      {(mayCancel || order.status === "ยกเลิก") && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusMenu(false);
                            if (order.status !== "ยกเลิก") changeStatus("ยกเลิก");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                        >
                          ❌ ยกเลิกออเดอร์
                          {order.status === "ยกเลิก" && <span className="text-xs">● ตอนนี้</span>}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <span className={`rounded-xl px-3.5 py-2.5 text-sm font-bold ring-1 ${STATUS_STYLES[order.status]}`}>
              {order.status}
            </span>
          )}
          {seesMoney && (
            <div className="text-right">
              <div className={LBL}>ยอดรวม</div>
              <div className="text-2xl font-bold tracking-tight text-slate-900">{formatPrice(orderTotal(order))}</div>
            </div>
          )}
        </div>
      </div>

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

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── ซ้าย: งานแบบ ── */}
        <div className="px-6 py-6">
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
          {!paidOk && (
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
          {/* หัวตาราง (จอกว้าง) — อ่านรายการแบบใบสั่งงาน */}
          <div className="mt-3 hidden items-center gap-3 px-4 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:flex">
            <span className="w-6 shrink-0 text-center">#</span>
            <span className="w-72 shrink-0 text-center">รูป</span>
            <span className="min-w-0 flex-1">ชื่อสินค้า / รายละเอียด</span>
            <span className="w-12 shrink-0 text-center">จำนวน</span>
            {seesMoney && <span className="w-28 shrink-0 text-right">ราคา/หน่วย</span>}
            {seesMoney && <span className="w-24 shrink-0 text-right">ยอดรวม</span>}
          </div>
          <div className="mt-1.5 space-y-4">
            {order.items.map((it, i) => {
              const proofs = proofsOf(it);
              const proofQty = proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
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
                    <span className={`text-xs font-extrabold ${i % 2 === 0 ? "text-indigo-800" : "text-sky-800"}`}>
                      รายการที่ {i + 1} / {order.items.length}
                    </span>
                    <span className="truncate text-xs font-bold text-slate-400">{it.name}</span>
                  </div>
                  <div className="p-4">
                  {/* แถวรายการ — อ่านเป็นตาราง: # · รูป · รายละเอียด · จำนวน · ราคา/หน่วย · ยอดรวม */}
                  <div className="flex items-start gap-3">
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
                          ) : (
                            <span className="grid h-20 w-20 place-items-center rounded-lg bg-slate-50 text-xl text-slate-300 ring-1 ring-slate-200">
                              🖼️
                            </span>
                          )}
                          <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">
                            {proofs.length ? `🖼 แบบ ${proofs.length}` : "ยังไม่มีแบบ"}
                            {(it.artworkUrls?.length ?? 0) > 0 ? ` · 🎨 ลาย ${it.artworkUrls!.length}` : ""}
                          </span>
                        </button>
                      );
                    })()}
                    <div className="min-w-0 max-w-xl flex-1">
                      <button
                        type="button"
                        onClick={() => setItemOpen((cur) => ({ ...cur, [i]: !open }))}
                        className="text-left text-sm font-bold text-slate-800 hover:text-indigo-700"
                      >
                        {it.name} <span className="text-xs font-normal text-slate-400">{open ? "▴" : "▾"}</span>
                      </button>
                      {editSel === i ? (
                        <div className="mt-1">
                          <textarea
                            autoFocus
                            value={selDraft}
                            onChange={(e) => setSelDraft(e.target.value)}
                            onBlur={() => saveSelections(i, selDraft)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditSel(null);
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveSelections(i, selDraft);
                            }}
                            rows={4}
                            placeholder="รายละเอียดงาน เช่น ขนาด · สี · ตำแหน่งลาย"
                            className="w-full resize-y rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[11px] leading-snug text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                          />
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            คลิกนอกช่องเพื่อบันทึก · Esc = ยกเลิก · ระบบลงประวัติว่าใครแก้
                          </p>
                        </div>
                      ) : (
                        <p
                          className={`mt-0.5 whitespace-pre-line text-[11px] leading-snug text-slate-500 ${open ? "" : "line-clamp-2"}`}
                        >
                          {it.selections || (mayEdit ? <span className="text-slate-300">— ยังไม่มีรายละเอียด —</span> : null)}
                          {mayEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelDraft(it.selections ?? "");
                                setEditSel(i);
                                setItemOpen((cur) => ({ ...cur, [i]: true }));
                              }}
                              title="แก้รายละเอียดของรายการนี้ (ชื่อ/จำนวน/ราคาแก้ไม่ได้)"
                              className="ml-1 whitespace-nowrap rounded px-1 text-[10px] font-bold text-amber-600 transition hover:bg-amber-50"
                            >
                              ✏️ แก้รายละเอียด
                            </button>
                          )}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {it.proofStatus ? `แบบ: ${it.proofStatus === "รอตรวจ" ? "รอลูกค้าตรวจ" : it.proofStatus === "อนุมัติ" ? "ลูกค้าอนุมัติแล้ว" : "ลูกค้าขอแก้ไข"}` : "แบบ: รอกราฟฟิกทำแบบ"}
                        {proofs.length > 0 ? ` · ${proofs.length} แบบ` : ""}
                        {(it.artworkUrls?.length ?? 0) > 0 ? ` · 🎨 ภาพลาย ${it.artworkUrls!.length}` : ""}
                        {noteHasText(it.adminNote) ? " · 📝 มีหมายเหตุ" : ""}
                        {it.needStockCheck ? " · 📦 รอเช็คสต๊อก" : ""}
                      </p>
                    </div>
                    <span className="w-12 shrink-0 text-center text-sm font-semibold text-slate-700">{it.qty}</span>
                    <span className={`w-28 shrink-0 text-right text-sm font-bold text-slate-900 ${seesMoney ? "" : "hidden"}`}>
                      {formatPrice(it.unitPrice)}
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
                  </div>

                  {open && (
                    <>
                  {/* ยืนยันอ่านของกราฟฟิก (การยืนยันของแพ็คอยู่ในโหมดแพ็ค) — รายละเอียดงานอยู่บนแถวด้านบนแล้ว */}

                  {/* 📦 สั่งจำนวนมาก — ต้องเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้าก่อนเริ่มงาน */}
                  {it.needStockCheck && (
                    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
                      <p className="text-xs font-bold text-amber-800">
                        📦 สั่งจำนวนมาก ({it.qty.toLocaleString("th-TH")} ชิ้น) — เช็คสต๊อก/คิวผลิตก่อนเริ่มงาน
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
                        title="ติ๊กเมื่อขึ้นชิ้นงานตัวอย่างให้ลูกค้า — ฝ่ายแพ็คจะถูกบังคับให้ยืนยันว่าใส่กล่องแล้วก่อนยิงเลขพัสดุ"
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          it.sampleRequired
                            ? "bg-amber-500 text-white hover:bg-amber-600"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-700"
                        }`}
                      >
                        {it.sampleRequired ? "🎁 มีงานตัวอย่างต้องส่งให้ลูกค้า" : "☐ งานนี้มีชิ้นงานตัวอย่าง"}
                      </button>
                      {it.sampleRequired && (
                        <span className="text-[10px] text-slate-400">
                          {it.sampleRequired.by} · {shortTime(it.sampleRequired.at)}
                        </span>
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
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200/70">
                        รอกราฟฟิกทำแบบ
                      </span>
                    )}
                    {proofs.length > 0 && (
                      <span className={`text-[11px] ${proofQty && proofQty !== it.qty ? "font-bold text-rose-600" : faint}`}>
                        {proofs.length} แบบ · ระบุจำนวนรวม {proofQty}/{it.qty} ชิ้น
                        {proofQty > 0 && proofQty !== it.qty ? " ⚠️ ไม่ตรง" : ""}
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
                  </div>

                  {/* ── รูปงาน แยกชัดว่าใครเป็นคนใส่ · ใครเห็น ── */}
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
                    {/* ซ้าย: ลายที่ลูกค้าส่งมา (ทีมงานเห็นเท่านั้น) */}
                    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                      <p className="text-xs font-bold text-sky-800">
                        🎨 ลายจากลูกค้า ({it.artworkUrls?.length ?? 0})
                        <span className="ml-1 font-normal text-sky-600">— ทีมงานเห็นเท่านั้น ลูกค้าไม่เห็นในหน้าเช็คออเดอร์</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(it.artworkUrls ?? []).map((u, k) => (
                          <span key={`${u}-${k}`} className="group relative block">
                            <button
                              type="button"
                              onClick={() => setLightbox({ src: u, alt: `${it.name} ลายที่ลูกค้าส่ง ${k + 1}`, caption: it.name })}
                              className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-sky-200 transition hover:ring-2 hover:ring-sky-400"
                              title="ดูรูปเต็ม"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt={`ลาย ${k + 1}`} className="h-full w-full object-cover" />
                            </button>
                            {/* ลายของลูกค้าลบไม่ได้ (เป็นหลักฐานงาน) — โหลดเก็บไปทำงานได้ */}
                            <button
                              type="button"
                              onClick={() => void downloadImage(u, `${order.id}-item${i + 1}-ลายลูกค้า-${k + 1}.${(u.split(".").pop() || "jpg").split("?")[0]}`)}
                              title="โหลดรูปนี้เก็บลงเครื่อง"
                              aria-label="ดาวน์โหลดลายรูปนี้"
                              className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-[10px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                            >
                              ⬇
                            </button>
                          </span>
                        ))}
                        {mayEdit && (
                          <label
                            className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-sky-300 bg-white text-center text-[10px] font-bold leading-tight text-sky-600 transition hover:bg-sky-50"
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
                      </div>
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
                      {proofs.length === 0 ? (
                        <p className="mt-2 rounded-lg border-2 border-dashed border-violet-200 bg-white px-3 py-3 text-center text-[11px] text-slate-400">
                          {proofDropIdx === i ? "⬇️ ปล่อยไฟล์ตรงนี้ได้เลย" : "ยังไม่ได้ส่งแบบให้ลูกค้า — ลากไฟล์มาวาง กดปุ่มด้านล่าง หรือกด “ใช้ลายนี้เป็นแบบ” จากฝั่งซ้าย"}
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
                                  <label className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400">จำนวน</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={pf.qty ?? ""}
                                      placeholder="—"
                                      onChange={(e) => patchProof(i, j, { qty: Math.max(0, Number(e.target.value) || 0) || undefined })}
                                      className="w-full min-w-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-center text-[11px] focus:border-violet-300 focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-400">ชิ้น</span>
                                  </label>
                                  <input
                                    value={pf.note ?? ""}
                                    placeholder="รายละเอียด เช่น ลายหน้า"
                                    onChange={(e) => patchProof(i, j, { note: e.target.value || undefined })}
                                    className="w-full rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] focus:border-violet-300 focus:outline-none"
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
                                  {pf.qty ? <strong>{pf.qty} ชิ้น</strong> : <span className="text-slate-400">ไม่ระบุจำนวน</span>}
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
                      {mayProof && (
                        <label
                          className="mt-2 block cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-center text-[11px] font-bold text-white transition hover:bg-violet-700"
                          title="อัปแบบที่กราฟฟิกทำเสร็จ ให้ลูกค้าตรวจ"
                        >
                          {uploadingIdx === i ? "กำลังอัปโหลด…" : "＋ อัปแบบใหม่ให้ลูกค้าตรวจ"}
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
                    </div>
                  </div>

                  {/* 📝 หมายเหตุใบงานของรายการนี้ — อยู่ติดกับรายการเลย ไม่ต้องไปหาที่คอลัมน์ขวา */}
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
          </div>

          {/* เพิ่มรายการพิเศษ — งานสั่งทำที่ไม่มีหน้าเว็บ (เฉพาะคนที่แก้ออเดอร์ได้) */}
          {mayEdit && (
            <SpecialItemAdder
              orderId={order.id}
              onAdd={(item) => {
                const next = withLog(
                  { ...order, items: [...order.items, item] },
                  actor,
                  "เพิ่มรายการพิเศษ",
                  `${item.name} ×${item.qty} @${formatPrice(item.unitPrice)}`
                );
                applyOrder(next);
              }}
            />
          )}

          {/* ยอดเงิน — ย้ายมาไว้ใต้รายการสินค้า (มองไล่จากบนลงล่างจบในคอลัมน์เดียว) */}
          <div className={seesMoney ? "" : "hidden"}>
            <GH t="emerald">💰 ยอดเงิน</GH>
            <div className={`mt-2 ${soft("emerald")}`}>
              <div className="flex justify-between text-sm">
                <span className={muted}>รวมสินค้า ({qty} ชิ้น)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className={muted}>ค่าจัดส่ง</span>
                {mayEdit ? (
                  /* เลือกวิธีส่งจากตั้งค่าร้าน — ราคาเติมอัตโนมัติ แล้วแก้ตัวเลขต่อได้ (จุดเดียวของทั้งหน้า) */
                  <span className="flex items-center gap-1.5">
                    <select
                      value={shipMethods.find((m) => m.name === order.shippingLabel)?.id ?? ""}
                      onChange={(e) => {
                        const m = shipMethods.find((x) => x.id === e.target.value);
                        if (!m) return;
                        applyOrder({
                          ...order,
                          shipping: (m.name.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา") as Order["shipping"],
                          shippingLabel: m.name,
                          shippingCost: Math.max(0, m.price),
                        });
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                    >
                      <option value="" disabled>
                        {order.shippingLabel || "เลือกวิธีส่ง…"}
                      </option>
                      {shipMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — ฿{m.price}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={order.shippingCost}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, shippingCost: Math.max(0, Number(e.target.value) || 0) } : cur))}
                      onBlur={persist}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                  </span>
                ) : (
                  <span>{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
                )}
              </div>
              {order.discount && order.discount.amount > 0 && (
                <div className="mt-1.5 flex justify-between text-sm font-semibold text-emerald-600">
                  <span>{order.discount.label}</span>
                  <span>−{formatPrice(order.discount.amount)}</span>
                </div>
              )}
              {orderItemDiscounts(order) > 0 && (
                <div className="mt-1.5 flex justify-between text-sm font-semibold text-rose-500">
                  <span>ส่วนลดรายรายการ</span>
                  <span>−{formatPrice(orderItemDiscounts(order))}</span>
                </div>
              )}
              {/* ส่วนลดทั้งบิล (แอดมินใส่เอง) — บันทึกตอนออกจากช่อง + ลง log */}
              {mayEdit ? (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                  <input
                    value={order.adminDiscount?.label ?? ""}
                    onChange={(e) =>
                      setOrder((cur) =>
                        cur ? { ...cur, adminDiscount: { amount: cur.adminDiscount?.amount ?? 0, label: e.target.value } } : cur
                      )
                    }
                    onBlur={persist}
                    placeholder="ส่วนลดทั้งบิล (เหตุผล)"
                    className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                  />
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
              <div className="mt-2.5 flex justify-between border-t border-slate-100 pt-2.5 font-bold text-slate-900">
                <span>ยอดรวม</span>
                <span>{formatPrice(orderTotal(order))}</span>
              </div>

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
              {order.deposit && (
                <div className="mt-2.5 space-y-1.5 rounded-xl bg-violet-50/60 p-2.5 ring-1 ring-violet-100">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-violet-700">➗ มัดจำ 50% {order.deposit.firstPaidAt ? "· รับแล้ว ✓" : "· รอโอน"}</span>
                    <span className={order.deposit.firstPaidAt ? "text-emerald-600" : "text-slate-700"}>{formatPrice(order.deposit.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-violet-700">ยอดคงเหลือ {order.deposit.settledAt ? "· ครบแล้ว ✓" : "· เก็บก่อนส่ง"}</span>
                    <span className={order.deposit.settledAt ? "text-emerald-600" : "text-rose-600"}>
                      {formatPrice(Math.max(0, orderTotal(order) - order.deposit.amount))}
                    </span>
                  </div>
                  {mayEdit && !order.deposit.firstPaidAt && (
                    <div className="flex gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={confirmDepositFirst}
                        className="flex-1 rounded-lg bg-violet-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-violet-700"
                      >
                        ✔️ ยืนยันรับมัดจำ (ตรวจเอง)
                      </button>
                      <button
                        type="button"
                        onClick={cancelDeposit}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50"
                      >
                        ยกเลิกโหมด
                      </button>
                    </div>
                  )}
                  {mayEdit && order.deposit.firstPaidAt && !order.deposit.settledAt && (
                    <button
                      type="button"
                      onClick={confirmDepositSettled}
                      className="w-full rounded-lg bg-emerald-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700"
                    >
                      ✔️ ยืนยันรับยอดคงเหลือครบ (ตรวจเอง)
                    </button>
                  )}
                  {!order.deposit.settledAt && (
                    <p className="text-[10px] leading-snug text-violet-500">
                      ยังพิมพ์ใบงาน/ใบเสร็จและยิงเลขพัสดุไม่ได้ จนกว่าจะเก็บครบ 100%
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ขวา: ข้อมูล ── */}
        <div className="space-y-4 border-t border-slate-200/70 bg-slate-50/50 px-4 py-5 lg:border-l lg:border-t-0">
          <div>
            <GH t="sky">👤 ลูกค้า / จัดส่ง</GH>
            <div className={`mt-2 ${soft("sky")}`}>
              {mayEdit ? (
                /* แอดมินแก้ข้อมูลลูกค้าตรงนี้ได้เลย (บันทึกอัตโนมัติตอนออกจากช่อง) — ใช้กับออเดอร์ที่สร้างจากหลังบ้านด้วย */
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={order.customer}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, customer: e.target.value } : cur))}
                      onBlur={persist}
                      placeholder="ชื่อลูกค้า"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-bold text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <input
                      value={order.phone}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, phone: e.target.value.replace(/[^\d\-+ ]/g, "") } : cur))}
                      onBlur={persist}
                      inputMode="tel"
                      placeholder="เบอร์โทร"
                      className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={order.address}
                    onChange={(e) => setOrder((cur) => (cur ? { ...cur, address: e.target.value } : cur))}
                    onBlur={persist}
                    rows={2}
                    placeholder="ที่อยู่จัดส่ง"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-700 focus:border-amber-300 focus:outline-none"
                  />
                  <p className={`text-xs ${faint}`}>
                    {order.payment} · {order.shippingLabel || order.shipping}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-bold text-slate-800">{order.customer}</span>{" "}
                    <span className={muted}>· {order.phone}</span>
                  </p>
                  <p className={`text-sm ${muted}`}>{order.address}</p>
                  <p className={`mt-2 text-xs ${faint}`}>
                    {order.payment} · {order.shippingLabel || order.shipping}
                  </p>
                </>
              )}
              {order.placedBy && (
                <p className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
                  🧑‍💼 พนักงานสั่งแทนลูกค้า — {order.placedBy}
                </p>
              )}
            </div>
          </div>

          {/* ── ข้อมูลใบงาน: วันที่จัดส่ง + หมายเหตุ (โชว์ตอนปริ้น) ── */}
          {mayEdit && (
            <div>
              <GH t="teal">🖨 ใบงาน · การจัดส่ง</GH>
              <div className={`mt-2 space-y-4 ${soft("teal")}`}>
                {/* วันที่จัดส่ง */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">📅 วันที่จัดส่ง (จาก–ถึง)</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={order.shipDate?.from ?? ""}
                      onChange={(e) => applyOrder({ ...order, shipDate: { ...order.shipDate, from: e.target.value } })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <span className="shrink-0 text-slate-400">–</span>
                    <input
                      type="date"
                      value={order.shipDate?.to ?? ""}
                      onChange={(e) => applyOrder({ ...order, shipDate: { ...order.shipDate, to: e.target.value } })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                </div>

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
                        <input
                          type="date"
                          value={order.useByDate ?? ""}
                          onChange={(e) => applyOrder({ ...order, useByDate: e.target.value || undefined })}
                          className={`min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-[13px] focus:outline-none ${
                            order.rush || late ? "border-rose-300 font-bold text-rose-700" : soon ? "border-orange-300 font-bold text-orange-700" : "border-slate-200 text-slate-800 focus:border-amber-300"
                          }`}
                        />
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
                  title="วางในโฟลเดอร์งานของลูกค้า ดับเบิลคลิกเปิดหน้าออเดอร์ได้ทันที"
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  ⬇️ ทางลัด{shortcutExt ? ` .${shortcutExt}` : ""}
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
              {shortcutExt && (
                <p className={`mt-1.5 text-[10px] leading-relaxed ${faint}`}>
                  ทางลัด = ไฟล์เปิดออเดอร์นี้ เก็บไว้ในโฟลเดอร์งานลูกค้าคู่กับไฟล์ลาย · เครื่องอื่น:{" "}
                  <button
                    type="button"
                    onClick={() => downloadOrderShortcut(order.id, customerUrl, shortcutExt === "webloc" ? "url" : "webloc")}
                    className="font-bold text-amber-600 underline decoration-amber-300 underline-offset-2 hover:text-amber-700"
                  >
                    {shortcutExt === "webloc" ? "Windows (.url)" : "Mac (.webloc)"}
                  </button>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => downloadOrderShortcut(order.id, customerUrl, "html")}
                    title="ไฟล์เดียวเปิดได้ทั้ง Mac / Windows / มือถือ"
                    className="font-bold text-amber-600 underline decoration-amber-300 underline-offset-2 hover:text-amber-700"
                  >
                    ทุกเครื่อง (.html)
                  </button>
                </p>
              )}
              {!order.key && (
                <p className="mt-2 text-[11px] text-amber-700">
                  ⚠️ ออเดอร์นี้สร้างก่อนมีระบบรหัส — ลิงก์ไม่มี key (ยังเปิดได้ปกติ)
                </p>
              )}
            </div>
          </div>


          {order.slipUrl && seesMoney && (
            <div>
              <GH t="green">🧾 หลักฐานการโอน</GH>
              {/* ผลตรวจสลิปอัตโนมัติ (SlipOK) */}
              {order.slipVerify && (
                <p
                  className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${
                    order.slipVerify.status === "pass"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-amber-50 text-amber-800 ring-amber-200"
                  }`}
                >
                  {order.slipVerify.status === "pass" ? (
                    <>
                      ✅ SlipOK ตรวจแล้ว: ยอดถูกต้อง {order.slipVerify.amount ? formatPrice(order.slipVerify.amount) : ""} — ยืนยันการชำระให้อัตโนมัติ
                      {order.slipVerify.transRef ? ` · อ้างอิง ${order.slipVerify.transRef}` : ""}
                    </>
                  ) : (
                    <>⚠️ SlipOK ตรวจไม่ผ่าน{order.slipVerify.detail ? `: ${order.slipVerify.detail}` : ""} — กรุณาตรวจสลิปเอง</>
                  )}
                </p>
              )}
              <div className={`mt-2 flex items-center gap-3 ${soft("green")}`}>
                <button
                  type="button"
                  onClick={() => setLightbox({ src: order.slipUrl!, alt: "สลิปการโอน", caption: `${order.id} · ${formatPrice(orderTotal(order))}` })}
                  aria-label="ขยายดูสลิป"
                  className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition hover:border-amber-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={order.slipUrl} alt="สลิปการโอน" className="h-full w-full object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">
                    ลูกค้าแจ้งโอนแล้ว
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={deleteSlip}
                        className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                      >
                        🗑 ลบสลิป
                      </button>
                    )}
                  </p>
                  {order.paidReportedAt && (
                    <p className={`text-xs ${faint}`}>
                      {new Date(order.paidReportedAt).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLightbox({ src: order.slipUrl!, alt: "สลิปการโอน", caption: `${order.id} · ${formatPrice(orderTotal(order))}` })}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  ดูเต็ม
                </button>
              </div>
            </div>
          )}

          <div>
            <GH t="orange">📮 เลขพัสดุ</GH>
            <div className={`mt-2 ${soft("orange")}`}>
              <input
                value={order.tracking ?? ""}
                onChange={(e) => setOrder((cur) => (cur ? { ...cur, tracking: e.target.value } : cur))}
                onBlur={saveTracking}
                placeholder="ยิง QR หรือพิมพ์เลขพัสดุ"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[13px] text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
              />
              <p className={`mt-1.5 text-[11px] ${faint}`}>
                กรอกแล้วสถานะจะเปลี่ยนเป็น “จัดส่งแล้ว” · ลูกค้าจะเห็นเลขนี้ในหน้าเช็คออเดอร์
              </p>
              <Link href="/admin/orders/scan" className="mt-1.5 inline-block text-[11px] font-bold text-amber-600 hover:underline">
                📮 ใช้เครื่องยิง QR แทน →
              </Link>
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
            {!order.log?.length ? (
              <p className={`mt-2 text-xs ${faint}`}>ยังไม่มีประวัติ — จะบันทึกอัตโนมัติเมื่อมีการเปลี่ยนแปลง</p>
            ) : (
              <ul className="relative mt-3 space-y-4 border-l-2 border-slate-200 pl-4">
                {[...order.log].reverse().slice(0, logOpen ? undefined : 3).map((l, i) => (
                  <li key={i} className="relative">
                    <span
                      className={`absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                        i === 0 ? "border-amber-500 bg-amber-500" : "border-slate-300 bg-white"
                      }`}
                    />
                    <p className="text-sm font-bold text-slate-700">
                      <Actor by={l.by} />
                      {l.action}
                    </p>
                    {l.detail && <p className={`text-xs ${muted}`}>{l.detail}</p>}
                    <p className={`text-[11px] ${faint}`}>
                      {new Date(l.at).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {(order.log?.length ?? 0) > 3 && (
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                className="mt-2 w-full rounded-lg bg-slate-50 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
              >
                {logOpen ? "หุบประวัติ ▴" : `ดูทั้งหมด ${order.log!.length} รายการ ▾`}
              </button>
            )}
          </div>
        </div>
      </div>

      {skipGate && <SkipGateModal reasons={skipGate} onCancel={cancelSkipGate} onConfirm={confirmSkipGate} />}

      {/* หน้าตรวจสอบออเดอร์: ขยายรูปดูอย่างเดียว (ไม่มีปุ่มตรวจนับ — งานแพ็คอยู่ในโหมดแพ็ค) */}
      {confirmBox && (
        <ConfirmModal
          icon={confirmBox.icon}
          title={confirmBox.title}
          detail={confirmBox.detail}
          confirmLabel={confirmBox.confirmLabel}
          danger={confirmBox.danger}
          onCancel={() => {
            confirmBox.resolve(false);
            setConfirmBox(null);
          }}
          onConfirm={() => {
            confirmBox.resolve(true);
            setConfirmBox(null);
          }}
        />
      )}
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
}: {
  itemIndex: number;
  itemName: string;
  proofs: Proof[];
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onZoom: (i: number, j: number) => void;
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
                  {p.qty} ชิ้น
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

function PackView({
  order,
  gate,
  onCheck,
  onAck,
  onSampleAck,
  onTrackingChange,
  onTrackingSave,
  onZoom,
  onPhotoAdd,
  onPhotoDelete,
}: {
  order: Order;
  gate: ReturnType<typeof packGate>;
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onAck: (i: number) => void;
  onSampleAck: (i: number) => void;
  onTrackingChange: (v: string) => void;
  onTrackingSave: () => void;
  onZoom: (i: number, j: number) => void;
  onPhotoAdd: (files: FileList | null) => void;
  onPhotoDelete: (i: number) => void;
}) {
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0);
  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 pb-28">
      {/* หัวเข้ม + ความคืบหน้า */}
      <div className="bg-slate-900 px-4 py-4 text-white">
        <Link href="/admin/orders" className="text-xs text-slate-400">
          ← คำสั่งซื้อทั้งหมด
        </Link>
        <p className="mt-1 font-mono text-xl font-extrabold">{order.id}</p>
        <p className="text-xs text-slate-300">
          {order.customer} · รวม {totalQty} ชิ้น
        </p>
        <p className={`mt-1 text-sm font-bold ${gate.ready ? "text-green-400" : "text-amber-300"}`}>
          {gate.ready
            ? "✅ ตรวจครบแล้ว — ยิงเลขพัสดุได้"
            : `⏳ เหลืออีก ${gate.uncounted.length + gate.unread.length + gate.unsampled.length + (gate.noPhoto ? 1 : 0) + (gate.unpaidBalance ? 1 : 0)} จุดต้องยืนยัน`}
        </p>
      </div>

      {/* รายการ */}
      <div className="space-y-4 p-3">
        {order.items.map((it, i) => {
          const proofs = proofsOf(it);
          return (
            <div key={`${it.productId}-${i}`} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              {/* งานตัวอย่าง — วางบนสุดให้สะดุดตาก่อนเริ่มแพ็ค · บังคับยืนยันก่อนยิงเลขพัสดุ */}
              {it.sampleRequired && (
                <button
                  type="button"
                  onClick={() => onSampleAck(i)}
                  className={`mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left ${
                    it.samplePacked ? "bg-green-50 ring-1 ring-green-200" : "bg-rose-50 ring-2 ring-rose-300"
                  }`}
                >
                  <span className="text-lg">{it.samplePacked ? "✅" : "🎁"}</span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className={`block font-extrabold ${it.samplePacked ? "text-slate-700" : "text-rose-700"}`}>
                      อย่าลืม! ใส่ชิ้นงานตัวอย่างลงกล่อง
                    </span>
                    <span className={it.samplePacked ? "text-green-700" : "font-bold text-rose-600"}>
                      {it.samplePacked
                        ? `ใส่แล้ว · ยืนยันโดย ${it.samplePacked.by}`
                        : "ใส่เรียบร้อยแล้วค่อยแตะยืนยันตรงนี้"}
                    </span>
                  </span>
                </button>
              )}

              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-base font-extrabold text-slate-900">{it.name}</p>
                <span className="text-lg font-black text-slate-900">
                  {it.qty}
                  <span className="text-xs font-bold text-slate-400"> ชิ้น</span>
                </span>
              </div>

              {/* รูปแบบงาน — ปัดดูทีละรูป กด "ครบ" แล้วเลื่อนไปรูปถัดไปที่ยังไม่ตรวจ */}
              {proofs.length > 0 ? (
                <ProofCarousel itemIndex={i} itemName={it.name} proofs={proofs} onCheck={onCheck} onZoom={onZoom} />
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 ring-1 ring-slate-200">
                  ยังไม่มีรูปแบบงาน
                </p>
              )}

              {/* รายละเอียด + ยืนยันอ่านแล้ว */}
              <button
                type="button"
                onClick={() => onAck(i)}
                className={`mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left ${
                  it.noteAck ? "bg-green-50 ring-1 ring-green-200" : "bg-amber-50 ring-1 ring-amber-200"
                }`}
              >
                <span className="text-lg">{it.noteAck ? "✅" : "📄"}</span>
                <span className="min-w-0 flex-1 text-xs">
                  <span className="block font-bold text-slate-700">{it.selections || "ไม่มีรายละเอียดเพิ่มเติม"}</span>
                  <span className={it.noteAck ? "text-green-700" : "font-bold text-amber-700"}>
                    {it.noteAck ? "ยืนยันอ่านแล้ว" : "แตะเพื่อยืนยันว่าอ่านแล้ว"}
                  </span>
                </span>
              </button>

            </div>
          );
        })}
      </div>

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
        {gate.ready ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-600 px-3 py-3 text-white">
            <span className="text-lg">📮</span>
            <input
              value={order.tracking ?? ""}
              onChange={(e) => onTrackingChange(e.target.value)}
              onBlur={onTrackingSave}
              placeholder="ยิง/พิมพ์เลขพัสดุ แล้ว Enter"
              className="w-full bg-transparent font-mono text-sm font-bold placeholder:font-sans placeholder:font-normal placeholder:text-white/70 focus:outline-none"
            />
          </div>
        ) : (
          <div className="rounded-xl bg-slate-100 px-3 py-3 ring-1 ring-slate-200">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <span className="grayscale">🔒</span> ตรวจให้ครบก่อน ถึงยิงเลขพัสดุได้
            </p>
            <p className="mt-0.5 pl-6 text-[11px] text-slate-400">
              {[
                gate.uncounted.length ? `ตรวจนับอีก ${gate.uncounted.length} รูป` : "",
                gate.unread.length ? `ยืนยันอ่านอีก ${gate.unread.length} รายการ` : "",
                gate.short.length ? `ของไม่ครบ ${gate.short.length} รายการ` : "",
                gate.unsampled.length ? `🎁 ใส่งานตัวอย่างอีก ${gate.unsampled.length} รายการ` : "",
                gate.noPhoto ? "📸 ถ่ายภาพก่อนปิดกล่อง" : "",
                gate.unpaidBalance ? "💳 เก็บยอดคงเหลือ (มัดจำ) ให้ครบ" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** ป้ายสีบอกว่าใครเป็นคนทำ */
function Actor({ by }: { by: string }) {
  const tone =
    by === "ลูกค้า"
      ? "bg-sky-50 text-sky-700 ring-sky-200/70"
      : by === "กราฟฟิก"
        ? "bg-violet-50 text-violet-700 ring-violet-200/70"
        : "bg-slate-100 text-slate-500 ring-slate-200/70";
  return (
    <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 align-[1px] text-[10px] font-bold ring-1 ${tone}`}>
      {by}
    </span>
  );
}

/** ฟอร์มเพิ่มรายการพิเศษ (งานสั่งทำที่ไม่มีหน้าเว็บ) — พิมพ์ชื่อแล้วมีคลังสินค้าพิเศษขึ้นให้เลือก (เติมสเปคอัตโนมัติ) */
function SpecialItemAdder({ onAdd, orderId }: { onAdd: (item: OrderItem) => void; orderId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState("");
  // ภาพลายที่ลูกค้าส่งมาทางแชท — แอดมินแนบให้กราฟฟิกดูตอนสั่งงานพิเศษ
  const [art, setArt] = useState<string[]>([]);
  // ── กันกรอกเสร็จแล้วรีเฟรชทิ้ง: เก็บร่างไว้ในเครื่อง จนกว่าจะกด "เพิ่มเข้าออเดอร์" หรือยกเลิก ──
  const DRAFT_KEY = `admin.order.${orderId}.specialDraft`;
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { name?: string; spec?: string; qty?: string; price?: string; art?: string[] };
        if (d.name || d.spec || d.price || (d.art?.length ?? 0)) {
          setName(d.name ?? "");
          setSpec(d.spec ?? "");
          setQty(d.qty ?? "1");
          setPrice(d.price ?? "");
          setArt(d.art ?? []);
          setOpen(true);
        }
      }
    } catch {}
    setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  const dirty = open && Boolean(name.trim() || spec.trim() || price.trim() || art.length);
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, spec, qty, price, art }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, dirty, name, spec, qty, price, art]);
  // เตือนก่อนปิด/รีเฟรชหน้าทั้งที่ยังไม่ได้กดเพิ่มเข้าออเดอร์
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [artBusy, setArtBusy] = useState(false);
  const [artDrag, setArtDrag] = useState(false);
  // คลังสินค้าพิเศษ (นำเข้าจากระบบเดิม/เพิ่มเอง) — โหลดครั้งเดียวตอนเปิดฟอร์ม
  const [catalog, setCatalog] = useState<{ name: string; detail: string }[]>([]);
  const [showSug, setShowSug] = useState(false);
  useEffect(() => {
    if (!open || catalog.length) return;
    fetch("/api/admin/special-products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCatalog(j.list ?? []))
      .catch(() => {});
  }, [open, catalog.length]);
  const kw = name.trim().toLowerCase();
  const suggestions = kw ? catalog.filter((p) => p.name.toLowerCase().includes(kw)).slice(0, 8) : [];

  function submit() {
    const n = name.trim();
    const q = Math.max(1, Math.floor(Number(qty) || 0));
    const p = Math.max(0, Number(price) || 0);
    if (!n) return setErr("ใส่ชื่องานก่อน");
    if (!Number(qty) || Number(qty) < 1) return setErr("จำนวนต้องอย่างน้อย 1");
    onAdd({ productId: "special-item", name: n, selections: spec.trim(), qty: q, unitPrice: p, ...(art.length ? { artworkUrls: art } : {}) });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setOpen(false);
    setName("");
    setSpec("");
    setQty("1");
    setPrice("");
    setArt([]);
    setErr("");
  }

  // ฟอร์มเปิดอยู่ → รับรูปจากคลิปบอร์ด (⌘/Ctrl+V) และกันเบราว์เซอร์เปิดไฟล์ที่โยนพลาดนอกกรอบ
  useEffect(() => {
    if (!open) return;
    const stop = (e: DragEvent) => e.preventDefault();
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      void uploadArt(dt.files);
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
      window.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, art.length]);

  async function uploadArt(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    setArtBusy(true);
    for (const f of Array.from(files).slice(0, 5 - art.length)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) {
        setErr(j?.error ?? "อัปโหลดภาพไม่สำเร็จ");
        break;
      }
      setArt((cur) => [...cur, j.url!]);
    }
    setArtBusy(false);
  }

  const inp =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700"
      >
        ＋ เพิ่มรายการพิเศษ (งานที่ไม่มีหน้าเว็บ)
      </button>
    );

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="mb-3 text-sm font-bold text-slate-800">＋ เพิ่มรายการพิเศษ (งานที่ไม่มีหน้าเว็บ)</p>
      {/* วางเป็นแถวเดียวกับตารางรายการ: รูป · ชื่อ/สเปค · จำนวน · ราคา/ชิ้น */}
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)_5.5rem_9rem]">
        {/* 🎨 ภาพลายจากลูกค้า (แชท/อีเมล) — ให้กราฟฟิกใช้เป็นแนวทางทำแบบ */}
        <div className="sm:row-span-2 lg:row-span-1">
          {art.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {art.map((u, i) => (
                <div key={u} className="relative">
                  <a href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`ภาพลาย ${i + 1}`} className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setArt((cur) => cur.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white"
                    aria-label="ลบภาพ"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {art.length < 5 && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArtDrag(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setArtDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setArtDrag(false);
                void uploadArt(e.dataTransfer.files);
              }}
              title="ลากรูปมาวาง · คลิกเลือกไฟล์ · หรือ ⌘/Ctrl+V วางรูปที่ก๊อปจากแชท"
              className={`flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-2 text-center transition ${
                artDrag ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-white hover:border-amber-300"
              }`}
            >
              {artBusy ? (
                <span className="text-[11px] font-bold text-slate-500">กำลังอัปโหลด…</span>
              ) : artDrag ? (
                <span className="text-xs font-extrabold text-amber-700">⬇️ ปล่อยตรงนี้</span>
              ) : (
                <>
                  <span className="text-xl leading-none">🖼️</span>
                  <span className="text-[10px] font-bold leading-tight text-slate-500">แนบภาพลาย
                    <br />ลาก · คลิก · ⌘V</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={artBusy}
                onChange={(e) => {
                  void uploadArt(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {/* ชื่องาน + สเปค */}
        <div className="space-y-2">
          <div className="relative">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              className={`${inp} font-semibold`}
              placeholder="ชื่องาน — พิมพ์แล้วมีคลังสินค้าพิเศษขึ้นให้เลือก"
            />
            {showSug && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setName(p.name);
                      setSpec(p.detail);
                      setShowSug(false);
                    }}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50"
                  >
                    <span className="block text-sm font-semibold text-slate-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">{p.detail.split("\n")[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            rows={3}
            className={`${inp} resize-y`}
            placeholder="สเปค/รายละเอียด (ไม่บังคับ) เช่น หนา 5 มม. · พิมพ์ UV 2 ด้าน"
          />
        </div>

        {/* จำนวน */}
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
          จำนวน
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={`${inp} mt-1 text-center text-sm font-bold`}
          />
        </label>

        {/* ราคา/ชิ้น + ยอดรวมที่คิดได้ */}
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
          ราคา/ชิ้น (บาท)
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${inp} mt-1 text-right text-sm font-bold`}
            placeholder="เช่น 1500"
          />
          <span className="mt-1 block text-right text-[11px] font-bold normal-case tracking-normal text-slate-500">
            {Number(price) > 0
              ? `รวม ${formatPrice(Math.max(1, Math.floor(Number(qty) || 0)) * Number(price))}`
              : "0 = รอตีราคา"}
          </span>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        🎨 ภาพลาย: เก็บไฟล์ตามต้นฉบับที่เลือก ไม่บีบอัดซ้ำ — ภาพจากแชทมักถูกลดคุณภาพมาแล้ว ใช้เป็นแนวทางให้กราฟฟิก ไฟล์งานพิมพ์จริงขอลิงก์/อีเมลจากลูกค้าเพิ่ม
      </p>
      {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
      {dirty && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
          ⚠️ ยังไม่ได้เพิ่มเข้าออเดอร์ — ต้องกดปุ่ม “✅ เพิ่มเข้าออเดอร์” ด้านล่างก่อน ข้อมูลถึงจะบันทึกลงฐาน
          <span className="block font-semibold text-rose-600">(ถ้าเผลอปิดหน้าไป ระบบจำร่างไว้ให้ เปิดหน้านี้ใหม่จะเห็นที่กรอกค้างไว้)</span>
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className={`rounded-full px-5 py-1.5 text-xs font-bold text-white transition ${
            dirty ? "bg-emerald-600 shadow-sm hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          ✅ เพิ่มเข้าออเดอร์
        </button>
        <button
          type="button"
          onClick={() => {
            if (dirty && !confirm("ทิ้งข้อมูลที่กรอกไว้ใช่ไหม? (ยังไม่ได้เพิ่มเข้าออเดอร์)")) return;
            try {
              localStorage.removeItem(DRAFT_KEY);
            } catch {}
            setName("");
            setSpec("");
            setQty("1");
            setPrice("");
            setArt([]);
            setOpen(false);
            setErr("");
          }}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          ยกเลิก
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        รายการจะเข้าออเดอร์นี้ทันที (มีบันทึกว่าใครเพิ่ม) · แนบแบบงาน/ตรวจแพ็คได้เหมือนสินค้าปกติ ·{" "}
        <Link href="/admin/special-products" className="font-semibold text-amber-600 hover:underline">
          จัดการรูปแบบการสินค้าสั่งพิเศษ →
        </Link>
      </p>
    </div>
  );
}


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
function ConfirmModal({
  icon,
  title,
  detail,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  icon: string;
  title: string;
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`px-5 pb-4 pt-5 text-center ring-1 ring-inset ${danger ? "bg-rose-50 ring-rose-100" : "bg-sky-50 ring-sky-100"}`}>
          <span className="text-3xl">{icon}</span>
          <p className="mt-1.5 text-base font-extrabold leading-snug text-slate-900">{title}</p>
          {detail && <p className="mt-1 whitespace-pre-line text-left text-xs leading-relaxed text-slate-600">{detail}</p>}
        </div>
        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white shadow-sm transition ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {confirmLabel}
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

/** Mac เปิด .url ไม่ได้ (มองเป็นไฟล์ข้อความ) — ต้องใช้ .webloc ของ Apple · Windows ใช้ .url */
function shortcutKind(): "webloc" | "url" {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "webloc" : "url";
}

/**
 * ดาวน์โหลด "ทางลัดเปิดออเดอร์" — ดับเบิลคลิกแล้วเปิดหน้าออเดอร์ในเบราว์เซอร์ทันที
 * เอาไปวางในโฟลเดอร์งานของลูกค้าคู่กับไฟล์ลายได้เลย
 *   • macOS → .webloc (plist ของ Apple — Finder รู้จักเป็น "ตำแหน่งที่ตั้งอินเทอร์เน็ต")
 *   • Windows → .url (Internet Shortcut)
 */
function downloadOrderShortcut(orderId: string, url: string, kind?: "webloc" | "url" | "html") {
  if (!url) return;
  const k = kind ?? shortcutKind();
  const esc = (u: string) => u.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body =
    k === "webloc"
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${esc(url)}</string>\n</dict>\n</plist>\n`
      : k === "html"
        ? // ใช้ได้ทุกเครื่อง (Mac / Windows / มือถือ) — เด้งเข้าออเดอร์ทันที มีลิงก์สำรองถ้า JS ถูกปิด
          `<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(orderId)} — iDucky</title>\n<meta http-equiv="refresh" content="0;url=${esc(url)}">\n<script>location.replace(${JSON.stringify(url)});</script>\n</head>\n<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:56px 20px;color:#44403c">\n<p style="font-size:15px">🦆 กำลังเปิดออเดอร์ <b>${esc(orderId)}</b>…</p>\n<p style="font-size:13px;color:#a8a29e">ถ้าไม่เปิดอัตโนมัติ กดลิงก์ด้านล่าง</p>\n<p><a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#fbbf24;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px">เปิดหน้าออเดอร์</a></p>\n</body>\n</html>\n`
        : `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
  const type = k === "webloc" ? "application/xml" : k === "html" ? "text/html;charset=utf-8" : "application/internet-shortcut";
  const blob = new Blob([body], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${orderId}.${k}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

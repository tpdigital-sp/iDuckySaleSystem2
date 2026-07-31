"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  MOCK_ORDERS,
  ORDER_STATUSES,
  adminDiscountAmount,
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
  type NoteColor,
  type NoteSize,
  type NoteWeight,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin, uploadProof } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { card, faint, muted, shortTime } from "@/lib/admin-ui";
import ImageLightbox from "@/components/ImageLightbox";
import PackCheckPanel from "@/components/PackCheckPanel";
import { useActor, useCan } from "@/lib/perm-context";
import { publicOrigin } from "@/lib/shop-info";

const LBL = "text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400";
const SOFT = "rounded-xl border border-slate-200/70 bg-white p-4";

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
          className="min-h-[58px] w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm leading-snug focus:border-amber-300 focus:outline-none"
        />
        {empty && placeholder && (
          <span className="pointer-events-none absolute left-2.5 top-1.5 text-sm text-slate-400">{placeholder}</span>
        )}
      </div>
      <p className="text-[10px] text-slate-400">✏️ เลือก (ไฮไลต์) คำที่ต้องการก่อน แล้วกดสี/ขนาด/น้ำหนัก — ใช้เฉพาะคำที่เลือก</p>
      <div className="space-y-2 rounded-lg bg-slate-50/80 p-2.5 ring-1 ring-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">สี</span>
          <div className="flex items-center gap-1.5">
            {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
              <button
                key={c}
                type="button"
                title={NOTE_COLORS[c].label}
                onMouseDown={keepSel}
                onClick={() => applyStyle({ color: NOTE_COLORS[c].hex })}
                className="h-6 w-6 rounded-full ring-2 ring-transparent transition hover:ring-slate-300"
                style={{ backgroundColor: NOTE_COLORS[c].hex }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">ขนาด</span>
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
            {(Object.keys(NOTE_SIZES) as NoteSize[]).map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={keepSel}
                onClick={() => applyStyle({ fontSize: `${NOTE_SIZES[s].px}px` })}
                className="border-r border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition last:border-r-0 hover:bg-slate-100"
              >
                {NOTE_SIZES[s].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">น้ำหนัก</span>
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
            {(Object.keys(NOTE_WEIGHTS) as NoteWeight[]).map((w) => (
              <button
                key={w}
                type="button"
                onMouseDown={keepSel}
                onClick={() => applyStyle({ fontWeight: String(NOTE_WEIGHTS[w].css) })}
                style={{ fontWeight: NOTE_WEIGHTS[w].css }}
                className="border-r border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 transition last:border-r-0 hover:bg-slate-100"
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
  const trackingRef = useRef<string>(""); // เลขพัสดุที่บันทึกไปแล้ว กันบันทึกซ้ำตอน blur

  const can = useCan();
  const actor = useActor(); // ชื่อคนที่ล็อกอินอยู่ (ไว้บันทึกประวัติว่าใครทำ)
  const seesMoney = can("orders.money"); // เห็นราคา/สลิป
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

  /** บันทึกออเดอร์ปัจจุบันลงฐานข้อมูล (เรียกตอน blur ช่องกรอก) */
  function persist() {
    if (!order || demo) return;
    void saveOrderAdmin(order);
  }

  /** อัปเดต order + บันทึกทันที (ใช้กับ select สี/ขนาด/วันที่ ที่ไม่มี blur) */
  function applyOrder(next: Order) {
    setOrder(next);
    if (!demo) void saveOrderAdmin(next);
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
        g.uncounted.length ? `• ตรวจนับอีก ${g.uncounted.length} รูป` : "",
        g.unread.length ? `• ยืนยันอ่านอีก ${g.unread.length} รายการ` : "",
        g.short.length ? `• ของไม่ครบ ${g.short.length} รายการ` : "",
        g.unsampled.length ? `• ยังไม่ยืนยันใส่งานตัวอย่าง ${g.unsampled.length} รายการ` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const okToSkip =
        mayEdit &&
        window.confirm(
          `⚠️ ด่านตรวจแพ็คยังไม่ครบ:\n${reasons}\n\nยืนยันข้ามด่านและยิงเลขพัสดุเลยไหม?\n(การข้ามจะถูกบันทึกในประวัติออเดอร์ พร้อมชื่อคุณ)`
        );
      if (!okToSkip) {
        // ยกเลิก → คืนช่องกรอกเป็นค่าที่บันทึกไว้ก่อนหน้า
        setOrder((cur) => (cur ? { ...cur, tracking: trackingRef.current || undefined } : cur));
        if (!mayEdit) setErr(`ยังยิงเลขพัสดุไม่ได้ — ต้องผ่านด่านตรวจก่อน:\n${reasons}`);
        return;
      }
    }
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
        <PackView
          order={order}
          gate={gate}
          onCheck={setPackCheck}
          onAck={toggleNoteAck}
          onSampleAck={toggleSamplePacked}
          onTrackingChange={(v) => setOrder((cur) => (cur ? { ...cur, tracking: v } : cur))}
          onTrackingSave={saveTracking}
          onZoom={showProof}
        />
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
  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const qty = order.items.reduce((s, i) => s + i.qty, 0);
  // ลิงก์ฝั่งลูกค้า (ต้องมี key ถึงเปิดได้) — origin ตั้งใน useEffect กัน SSR mismatch
  const customerUrl = origin
    ? `${origin}/order/${encodeURIComponent(order.id)}${order.key ? `?key=${encodeURIComponent(order.key)}` : ""}`
    : "";

  return (
    <div className={`mx-auto max-w-7xl overflow-hidden ${card}`}>
      {/* ── แถบหัว ── */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/70 bg-slate-50/70 px-6 py-5">
        <div>
          <Link href="/admin/orders" className="text-xs text-slate-400 hover:text-slate-600">
            ← คำสั่งซื้อทั้งหมด
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{order.id}</h1>
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
            <select
              value={order.status}
              onChange={(e) => changeStatus(e.target.value as OrderStatus)}
              className={`rounded-xl px-3.5 py-2.5 text-sm font-bold ring-1 focus:outline-none focus:ring-2 focus:ring-amber-300 ${STATUS_STYLES[order.status]}`}
            >
              {ORDER_STATUSES.filter((s) => s !== "ยกเลิก" || mayCancel || order.status === "ยกเลิก").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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

      <div className="grid lg:grid-cols-[1.45fr_0.95fr]">
        {/* ── ซ้าย: งานแบบ ── */}
        <div className="px-6 py-6">
          <p className={LBL}>งานแบบ · {order.items.length} รายการ</p>
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
          <div className="mt-3 divide-y divide-slate-100">
            {order.items.map((it, i) => {
              const proofs = proofsOf(it);
              const proofQty = proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
              return (
                <div key={`${it.productId}-${i}`} className="py-5">
                  {/* หัวรายการ */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{it.name}</p>
                    </div>
                    <span className="shrink-0 text-right text-sm font-bold text-slate-900">
                      {it.qty} × {formatPrice(it.unitPrice)}
                      {/* ส่วนลดเฉพาะรายการนี้ — เลือกได้ทั้งบาทและ % (บันทึกตอนออกจากช่อง พร้อมลง log) */}
                      {mayEdit && seesMoney ? (
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
                  </div>

                  {/* รายละเอียด (ตัวเลือก) + ยืนยันอ่านของกราฟฟิก (การยืนยันของแพ็คอยู่ในโหมดแพ็ค) */}
                  {it.selections && <p className={`mt-1 text-xs ${faint}`}>{it.selections}</p>}
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

                  {it.proofStatus === "ขอแก้ไข" && it.proofNote && (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-100">
                      ลูกค้าขอแก้: “{it.proofNote}”
                    </p>
                  )}

                  {/* แกลเลอรีแบบงาน — หลายรูป แต่ละรูประบุจำนวน/รายละเอียด */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {proofs.map((p, j) => (
                      <div
                        key={`${p.url}-${j}`}
                        className={`w-36 overflow-hidden rounded-xl border bg-white ${
                          p.review === "ขอแก้ไข" ? "border-rose-300 ring-2 ring-rose-200" : "border-slate-200"
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
                            <img src={p.url} alt={`แบบงาน ${it.name} รูปที่ ${j + 1}`} className="h-full w-full object-contain" />
                          </button>
                          {/* เลขรูป — ให้ตรงกับที่ลูกค้าอ้างถึง ("รูปที่ 8") ไม่ต้องนั่งนับ */}
                          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            รูปที่ {j + 1}
                          </span>
                          {/* ผลตรวจของลูกค้า "ต่อรูปนี้" — ไม่มีค่า = ลูกค้ายังไม่ตรวจรูปนี้ */}
                          {p.review && (
                            <span
                              className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${PROOF_STYLES[p.review]}`}
                            >
                              {p.review === "อนุมัติ" ? "✔ อนุมัติ" : "✏️ ขอแก้ไข"}
                            </span>
                          )}
                          {mayProof && (
                            <button
                              type="button"
                              onClick={() => removeProof(i, j)}
                              aria-label="ลบรูปนี้"
                              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-900/60 text-xs text-white transition hover:bg-rose-600"
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
                                value={p.qty ?? ""}
                                placeholder="—"
                                onChange={(e) => patchProof(i, j, { qty: e.target.value ? Number(e.target.value) : undefined })}
                                onBlur={persist}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-amber-300 focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-400">ชิ้น</span>
                            </label>
                            <input
                              type="text"
                              value={p.note ?? ""}
                              placeholder="รายละเอียด เช่น ลายหน้า"
                              onChange={(e) => patchProof(i, j, { note: e.target.value })}
                              onBlur={persist}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-amber-300 focus:outline-none"
                            />
                            {p.review === "ขอแก้ไข" && p.reviewNote && (
                              <p className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] leading-snug text-rose-700 ring-1 ring-rose-100">
                                ลูกค้าขอแก้: “{p.reviewNote}”
                              </p>
                            )}
                            {/* เปลี่ยนรูปทับตำแหน่งเดิม — ไม่ต้องลบแล้วอัปใหม่ เลขรูปไม่เลื่อน */}
                            <label
                              className={`block cursor-pointer rounded-lg px-2 py-1 text-center text-[11px] font-bold transition ${
                                p.review === "ขอแก้ไข"
                                  ? "bg-rose-500 text-white hover:bg-rose-600"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              } ${uploadingIdx === i ? "pointer-events-none opacity-50" : ""}`}
                            >
                              {uploadingIdx === i ? "กำลังอัปโหลด…" : "🔄 เปลี่ยนรูปนี้"}
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
                          /* ฝ่ายแพ็ค — อ่านอย่างเดียว แก้ไม่ได้ */
                          <div className="p-2 text-[11px] leading-snug text-slate-600">
                            {p.qty ? <strong>{p.qty} ชิ้น</strong> : <span className="text-slate-400">ไม่ระบุจำนวน</span>}
                            {p.note ? <span className="block text-slate-500">{p.note}</span> : null}
                            {p.review === "ขอแก้ไข" && p.reviewNote && (
                              <span className="block text-rose-600">ลูกค้าขอแก้: “{p.reviewNote}”</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* กล่องเพิ่มรูป — ลากมาวาง หรือแตะ (เฉพาะคนที่จัดการแบบงานได้) */}
                    {mayProof && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`เพิ่มแบบงาน ${it.name}`}
                      onClick={(e) => e.currentTarget.querySelector<HTMLInputElement>("input[type=file]")?.click()}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.currentTarget.querySelector<HTMLInputElement>("input[type=file]")?.click();
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragIdx(i);
                      }}
                      onDragLeave={() => setDragIdx(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragIdx(null);
                        void sendProofs(i, e.dataTransfer.files);
                      }}
                      className={`grid aspect-[4/3] w-36 cursor-pointer place-items-center self-start rounded-xl px-2 text-center text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        dragIdx === i
                          ? "border-2 border-dashed border-amber-400 bg-amber-50 text-amber-700"
                          : "border-2 border-dashed border-slate-200 bg-slate-50/60 text-slate-500 hover:border-amber-300 hover:bg-amber-50/40"
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          void sendProofs(i, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      {uploadingIdx === i ? "กำลังอัปโหลด…" : dragIdx === i ? "วางรูปที่นี่" : "＋ ลากหลายรูปมาวาง"}
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* เพิ่มรายการพิเศษ — งานสั่งทำที่ไม่มีหน้าเว็บ (เฉพาะคนที่แก้ออเดอร์ได้) */}
          {mayEdit && (
            <SpecialItemAdder
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
        </div>

        {/* ── ขวา: ข้อมูล ── */}
        <div className="space-y-6 border-t border-slate-200/70 bg-slate-50/50 px-6 py-6 lg:border-l lg:border-t-0">
          <div>
            <p className={LBL}>ลูกค้า / จัดส่ง</p>
            <div className={`mt-2 ${SOFT}`}>
              {mayEdit ? (
                /* แอดมินแก้ข้อมูลลูกค้าตรงนี้ได้เลย (บันทึกอัตโนมัติตอนออกจากช่อง) — ใช้กับออเดอร์ที่สร้างจากหลังบ้านด้วย */
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={order.customer}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, customer: e.target.value } : cur))}
                      onBlur={persist}
                      placeholder="ชื่อลูกค้า"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <input
                      value={order.phone}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, phone: e.target.value.replace(/[^\d\-+ ]/g, "") } : cur))}
                      onBlur={persist}
                      inputMode="tel"
                      placeholder="เบอร์โทร"
                      className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={order.address}
                    onChange={(e) => setOrder((cur) => (cur ? { ...cur, address: e.target.value } : cur))}
                    onBlur={persist}
                    rows={2}
                    placeholder="ที่อยู่จัดส่ง"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-amber-300 focus:outline-none"
                  />
                  <p className={`flex items-center gap-2 text-xs ${faint}`}>
                    {order.payment} · {order.shipping} · ค่าส่ง
                    <input
                      type="number"
                      min={0}
                      value={order.shippingCost}
                      onChange={(e) => setOrder((cur) => (cur ? { ...cur, shippingCost: Math.max(0, Number(e.target.value) || 0) } : cur))}
                      onBlur={persist}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                    บาท
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
                    {order.payment} · {order.shipping}
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

          {/* ลิงก์ที่ลูกค้าใช้เปิดดูออเดอร์/ตรวจแบบ — ก๊อปส่งให้ลูกค้าได้เลย */}
          <div>
            <p className={LBL}>ลิงก์สำหรับลูกค้า</p>
            <div className={`mt-2 ${SOFT}`}>
              <p className={`text-xs ${muted}`}>ลูกค้าใช้ลิงก์นี้เช็คสถานะ · ดูแบบงาน · กดอนุมัติ</p>
              <p className="mt-1.5 break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
                {customerUrl || "…"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!customerUrl}
                  onClick={() => {
                    navigator.clipboard?.writeText(customerUrl).catch(() => {});
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-40"
                >
                  {linkCopied ? "✓ คัดลอกแล้ว" : "🔗 คัดลอกลิงก์"}
                </button>
                <a
                  href={customerUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  ดูแบบที่ลูกค้าเห็น ↗
                </a>
              </div>
              {!order.key && (
                <p className="mt-2 text-[11px] text-amber-700">
                  ⚠️ ออเดอร์นี้สร้างก่อนมีระบบรหัส — ลิงก์ไม่มี key (ยังเปิดได้ปกติ)
                </p>
              )}
            </div>
          </div>

          <div className={seesMoney ? "" : "hidden"}>
            <p className={LBL}>ยอดเงิน</p>
            <div className={`mt-2 ${SOFT}`}>
              <div className="flex justify-between text-sm">
                <span className={muted}>รวมสินค้า ({qty} ชิ้น)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-sm">
                <span className={muted}>ค่าจัดส่ง</span>
                <span>{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
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
            </div>
          </div>

          {order.slipUrl && seesMoney && (
            <div>
              <p className={LBL}>หลักฐานการโอน</p>
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
              <div className={`mt-2 flex items-center gap-3 ${SOFT}`}>
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
                  <p className="text-sm font-bold text-slate-800">ลูกค้าแจ้งโอนแล้ว</p>
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
            <p className={LBL}>เลขพัสดุ</p>
            <div className={`mt-2 ${SOFT}`}>
              <input
                value={order.tracking ?? ""}
                onChange={(e) => setOrder((cur) => (cur ? { ...cur, tracking: e.target.value } : cur))}
                onBlur={saveTracking}
                placeholder="ยิง QR หรือพิมพ์เลขพัสดุ"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
              />
              <p className={`mt-1.5 text-[11px] ${faint}`}>
                กรอกแล้วสถานะจะเปลี่ยนเป็น “จัดส่งแล้ว” · ลูกค้าจะเห็นเลขนี้ในหน้าเช็คออเดอร์
              </p>
              <Link href="/admin/orders/scan" className="mt-1.5 inline-block text-[11px] font-bold text-amber-600 hover:underline">
                📮 ใช้เครื่องยิง QR แทน →
              </Link>
            </div>
          </div>

          {/* ── ข้อมูลใบงาน: วันที่จัดส่ง + หมายเหตุ (โชว์ตอนปริ้น) ── */}
          {mayEdit && (
            <div>
              <p className={LBL}>ใบงาน · การจัดส่ง</p>
              <div className={`mt-2 space-y-4 ${SOFT}`}>
                {/* วันที่จัดส่ง */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">📅 วันที่จัดส่ง (จาก–ถึง)</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={order.shipDate?.from ?? ""}
                      onChange={(e) => applyOrder({ ...order, shipDate: { ...order.shipDate, from: e.target.value } })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <span className="shrink-0 text-slate-400">–</span>
                    <input
                      type="date"
                      value={order.shipDate?.to ?? ""}
                      onChange={(e) => applyOrder({ ...order, shipDate: { ...order.shipDate, to: e.target.value } })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                </div>

                {/* หมายเหตุแต่ละรายการ */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">📝 หมายเหตุตรงรายการสินค้า</p>
                  <div className="space-y-2.5">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                        <p className="mb-1.5 truncate text-xs font-bold text-slate-600">
                          {idx + 1}. {it.name}
                        </p>
                        <RichNoteEditor
                          value={it.adminNote}
                          onChange={(html, commit) => setNote(idx, html, commit)}
                          placeholder="หมายเหตุรายการนี้ (เช่น ห่อแยก / งานด่วน)"
                        />
                      </div>
                    ))}
                  </div>
                </div>

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

          {order.note && (
            <div>
              <p className={LBL}>หมายเหตุลูกค้า</p>
              <p className="mt-2 rounded-xl bg-amber-50/60 p-3 text-sm text-slate-600 ring-1 ring-amber-100">{order.note}</p>
            </div>
          )}

          <div>
            <p className={LBL}>ประวัติการทำงาน{order.log?.length ? ` (${order.log.length})` : ""}</p>
            {!order.log?.length ? (
              <p className={`mt-2 text-xs ${faint}`}>ยังไม่มีประวัติ — จะบันทึกอัตโนมัติเมื่อมีการเปลี่ยนแปลง</p>
            ) : (
              <ul className="relative mt-3 space-y-4 border-l-2 border-slate-200 pl-4">
                {[...order.log].reverse().map((l, i) => (
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
          </div>
        </div>
      </div>

      {/* หน้าตรวจสอบออเดอร์: ขยายรูปดูอย่างเดียว (ไม่มีปุ่มตรวจนับ — งานแพ็คอยู่ในโหมดแพ็ค) */}
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
}: {
  order: Order;
  gate: ReturnType<typeof packGate>;
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onAck: (i: number) => void;
  onSampleAck: (i: number) => void;
  onTrackingChange: (v: string) => void;
  onTrackingSave: () => void;
  onZoom: (i: number, j: number) => void;
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
            : `⏳ เหลืออีก ${gate.uncounted.length + gate.unread.length + gate.unsampled.length} จุดต้องยืนยัน`}
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
function SpecialItemAdder({ onAdd }: { onAdd: (item: OrderItem) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState("");
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
    onAdd({ productId: "special-item", name: n, selections: spec.trim(), qty: q, unitPrice: p });
    setOpen(false);
    setName("");
    setSpec("");
    setQty("1");
    setPrice("");
    setErr("");
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
      <p className="mb-3 text-sm font-bold text-slate-800">＋ เพิ่มรายการพิเศษ</p>
      <div className="space-y-2.5">
        <div className="relative">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSug(true);
            }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            className={inp}
            placeholder="พิมพ์ชื่องาน — มีคลังสินค้าพิเศษขึ้นให้เลือก"
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
        <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} className={`${inp} resize-y`} placeholder="สเปค/รายละเอียด (ไม่บังคับ) เช่น หนา 5 มม. · พิมพ์ UV 2 ด้าน" />
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block text-xs font-semibold text-slate-500">
            จำนวน
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${inp} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-slate-500">
            ราคา/ชิ้น (บาท) — 0 = รอตีราคา
            <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={`${inp} mt-1`} placeholder="เช่น 1500" />
          </label>
        </div>
      </div>
      {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={submit} className="rounded-full bg-amber-500 px-5 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600">
          เพิ่มเข้าออเดอร์
        </button>
        <button type="button" onClick={() => { setOpen(false); setErr(""); }} className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
          ยกเลิก
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        รายการจะเข้าออเดอร์นี้ทันที (มีบันทึกว่าใครเพิ่ม) · แนบแบบงาน/ตรวจแพ็คได้เหมือนสินค้าปกติ ·{" "}
        <Link href="/admin/special-products" className="font-semibold text-amber-600 hover:underline">
          จัดการคลังสินค้าสั่งพิเศษ →
        </Link>
      </p>
    </div>
  );
}

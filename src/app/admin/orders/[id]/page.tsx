"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  MOCK_ORDERS,
  ORDER_STATUSES,
  orderTotal,
  packGate,
  PROOF_STYLES,
  proofsOf,
  STATUS_STYLES,
  withLog,
  type Order,
  type OrderStatus,
  type Proof,
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
    // กำลังพิมพ์ในช่องจำนวน/รายละเอียดอยู่ → ข้ามรอบนี้ ไม่งั้นข้อความที่พิมพ์จะหาย
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;

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

  /** บันทึกเลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" + ลง log */
  function saveTracking() {
    if (!order) return;
    const t = (order.tracking ?? "").trim();
    if (!t || t === trackingRef.current) return; // ไม่เปลี่ยน → ไม่ต้องบันทึกซ้ำ
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
      caption: [it.name, p.qty ? `${p.qty} ชิ้น` : "", p.note ?? ""].filter(Boolean).join(" · "),
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

  async function sendProof(itemIndex: number, file: File | null) {
    if (!file || !order) return;
    setErr("");
    if (!file.type.startsWith("image/")) {
      setErr("รองรับเฉพาะไฟล์รูปภาพ (PNG / JPG)");
      return;
    }
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
    const res = await uploadProof(order.id, itemIndex, file);
    setUploadingIdx(null);
    if (!res.ok) {
      setErr(res.error ?? "อัปโหลดแบบไม่สำเร็จ");
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
                    <span className="shrink-0 text-sm font-bold text-slate-900">
                      {it.qty} × {formatPrice(it.unitPrice)}
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
                  </div>

                  {it.proofStatus === "ขอแก้ไข" && it.proofNote && (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-100">
                      ลูกค้าขอแก้: “{it.proofNote}”
                    </p>
                  )}

                  {/* แกลเลอรีแบบงาน — หลายรูป แต่ละรูประบุจำนวน/รายละเอียด */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {proofs.map((p, j) => (
                      <div key={`${p.url}-${j}`} className="w-36 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                          </div>
                        ) : (
                          /* ฝ่ายแพ็ค — อ่านอย่างเดียว แก้ไม่ได้ */
                          <div className="p-2 text-[11px] leading-snug text-slate-600">
                            {p.qty ? <strong>{p.qty} ชิ้น</strong> : <span className="text-slate-400">ไม่ระบุจำนวน</span>}
                            {p.note ? <span className="block text-slate-500">{p.note}</span> : null}
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
                        void sendProof(i, e.dataTransfer.files?.[0] ?? null);
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
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          void sendProof(i, e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                      {uploadingIdx === i ? "กำลังอัปโหลด…" : dragIdx === i ? "วางรูปที่นี่" : "＋ ลากรูปมาวาง"}
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── ขวา: ข้อมูล ── */}
        <div className="space-y-6 border-t border-slate-200/70 bg-slate-50/50 px-6 py-6 lg:border-l lg:border-t-0">
          <div>
            <p className={LBL}>ลูกค้า / จัดส่ง</p>
            <div className={`mt-2 ${SOFT}`}>
              <p className="text-sm">
                <span className="font-bold text-slate-800">{order.customer}</span>{" "}
                <span className={muted}>· {order.phone}</span>
              </p>
              <p className={`text-sm ${muted}`}>{order.address}</p>
              <p className={`mt-2 text-xs ${faint}`}>
                {order.payment} · {order.shipping}
              </p>
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
              <div className="mt-2.5 flex justify-between border-t border-slate-100 pt-2.5 font-bold text-slate-900">
                <span>ยอดรวม</span>
                <span>{formatPrice(orderTotal(order))}</span>
              </div>
            </div>
          </div>

          {order.slipUrl && seesMoney && (
            <div>
              <p className={LBL}>หลักฐานการโอน</p>
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

          {order.note && (
            <div>
              <p className={LBL}>หมายเหตุ</p>
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
  onTrackingChange,
  onTrackingSave,
  onZoom,
}: {
  order: Order;
  gate: ReturnType<typeof packGate>;
  onCheck: (i: number, j: number, status: "ครบ" | "ไม่ครบ", got?: number) => void;
  onAck: (i: number) => void;
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
            : `⏳ เหลืออีก ${gate.uncounted.length + gate.unread.length} จุดต้องยืนยัน`}
        </p>
      </div>

      {/* รายการ */}
      <div className="space-y-4 p-3">
        {order.items.map((it, i) => {
          const proofs = proofsOf(it);
          return (
            <div key={`${it.productId}-${i}`} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
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

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, PROOF_STYLES, proofsOf, STATUS_STYLES, STEP_OF, type Order, type OrderStatus } from "@/lib/admin-data";
import { fetchOrderForCustomer, reportPayment, reviewProof, updateOrderAddress } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { setAppendTarget } from "@/lib/append-order";
import ImageLightbox from "@/components/ImageLightbox";

/** ป้ายขั้นตอนฝั่งลูกค้า (คำอ่านง่ายกว่าฝั่งหลังบ้าน) — ลำดับตรงกับ STEP_OF */
const STEPS = ["สั่งซื้อ", "ชำระเงิน", "ตรวจแบบงาน", "ผลิต", "จัดส่ง"];

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
  const [order, setOrder] = useState<Order | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  /* รายการที่กำลังพิมพ์ "ขอแก้ไข" อยู่ + ข้อความ */
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState("");
  // อ้างอิงด้วย index (ไม่เก็บ src ตรง ๆ) — ให้ปุ่มอนุมัติ/เลื่อนรูปใน lightbox ใช้ข้อมูลล่าสุดเสมอ
  const [lightbox, setLightbox] = useState<{ itemIdx: number; proofIdx: number } | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const [slipErr, setSlipErr] = useState("");

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

  async function act(itemIndex: number, action: "approve" | "request") {
    setActionErr("");
    setBusyIdx(itemIndex);
    const res = await reviewProof(orderId, orderKey, itemIndex, action, action === "request" ? note : undefined);
    setBusyIdx(null);
    if (!res.ok) {
      setActionErr(res.error ?? "ส่งผลตรวจไม่สำเร็จ");
      return;
    }
    if (res.order) setOrder(res.order);
    setEditingIdx(null);
    setNote("");
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
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-stone-400">กำลังโหลดออเดอร์…</div>;
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="text-5xl">🔒</span>
        <h1 className="mt-4 text-xl font-extrabold text-amber-950">เปิดออเดอร์ไม่ได้</h1>
        <p className="mt-2 text-sm text-stone-500">{loadErr}</p>
        <p className="mt-1 text-xs text-stone-400">กรุณาเปิดจากลิงก์ที่ร้านส่งให้ (ลิงก์ต้องมีรหัสครบ)</p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105"
        >
          🛍️ ไปเลือกสินค้า
        </Link>
      </div>
    );
  }

  const waiting = order.items.filter((it) => proofsOf(it).length && it.proofStatus === "รอตรวจ").length;
  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const step = STEP_OF[order.status];
  const balance = orderBalance(order);
  // สั่งเพิ่มได้เฉพาะออเดอร์ที่ยังไม่เข้าสายการผลิต
  const canAppend = (["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] as OrderStatus[]).includes(
    order.status
  );
  const cancelled = order.status === "ยกเลิก";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ── หัวออเดอร์ + แถบขั้นตอน ── */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">เลขออเดอร์</p>
            <p className="select-all text-xl font-extrabold tracking-wide text-amber-950">{order.id}</p>
            <p className="mt-1 text-xs text-stone-400">
              {order.date} · ยอดรวม <span className="font-bold text-amber-600">{formatPrice(orderTotal(order))}</span>
            </p>
            {live && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                หน้านี้อัปเดตเองอัตโนมัติ ไม่ต้องรีเฟรช
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[order.status]}`}>
              {order.status}
            </span>
            <Link
              href={`/order/${encodeURIComponent(orderId)}/receipt${orderKey ? `?key=${encodeURIComponent(orderKey)}` : ""}`}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600 transition hover:bg-stone-200"
            >
              🧾 ใบเสร็จ
            </Link>
          </div>
        </div>

        {/* แถบขั้นตอน */}
        {cancelled ? (
          <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-500">
            ออเดอร์นี้ถูกยกเลิกแล้ว — สอบถามเพิ่มเติมทักร้านได้เลยครับ
          </p>
        ) : (
          <ol className="mt-5 flex overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEPS.map((label, i) => {
              const done = i < step;
              const now = i === step;
              return (
                <li key={label} className="relative min-w-[92px] flex-1 pt-7 text-center">
                  {/* เส้นเชื่อม */}
                  {i < STEPS.length - 1 && (
                    <span
                      className={`absolute left-1/2 right-[-50%] top-[9px] h-0.5 ${done ? "bg-amber-500" : "bg-stone-200"}`}
                    />
                  )}
                  {/* จุด */}
                  <span
                    className={`absolute left-1/2 top-0.5 z-10 h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 ${
                      now
                        ? "border-ducky bg-ducky ring-4 ring-ducky/35"
                        : done
                          ? "border-amber-500 bg-amber-500"
                          : "border-stone-200 bg-white"
                    }`}
                  />
                  <span className={`block text-xs font-bold ${done || now ? "text-amber-950" : "text-stone-400"}`}>
                    {label}
                  </span>
                  <span className="block text-[10px] text-stone-400">
                    {now ? (STEP_HINT[order.status] ?? "กำลังทำ") : done ? "เรียบร้อย" : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* ── ชำระเงิน / แจ้งสลิป ── */}
      {order.status === "รอชำระเงิน" && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p className="text-sm font-bold text-rose-800">
            💸 {(order.paidTotal ?? 0) > 0 ? `มียอดค้างชำระ ${formatPrice(balance)}` : `รอชำระเงิน ${formatPrice(orderTotal(order))}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-700">
            {(order.paidTotal ?? 0) > 0
              ? `เกิดจากการสั่งเพิ่ม — โอนเฉพาะส่วนต่างมาที่บัญชีร้าน แล้วแนบสลิป (จ่ายแล้ว ${formatPrice(order.paidTotal ?? 0)} จาก ${formatPrice(orderTotal(order))})`
              : "โอนเงินมาที่บัญชีร้านแล้วแนบสลิปที่นี่ ทางร้านจะตรวจสอบและเริ่มงานให้"}
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700">
            {slipBusy ? "กำลังส่งสลิป…" : "📤 แนบสลิปการโอน"}
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
          {slipErr && <p className="mt-2 text-xs font-semibold text-rose-700">⚠️ {slipErr}</p>}
        </div>
      )}

      {order.status === "รอตรวจสอบ" && (
        <div className="mt-4 rounded-2xl bg-orange-50 p-4 text-sm text-orange-800 ring-1 ring-orange-200">
          🧾 <strong>ได้รับสลิปแล้ว</strong> — ทางร้านกำลังตรวจสอบการชำระเงิน เดี๋ยวจะเริ่มงานให้ครับ
        </div>
      )}

      {waiting > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          🎨 <strong>มีแบบงานรอให้คุณตรวจ {waiting} รายการ</strong> — ดูรูปแล้วกดอนุมัติ หรือขอแก้ไขได้เลย
        </div>
      )}

      {actionErr && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{actionErr}</p>}

      {/* ── 2 คอลัมน์: ซ้าย=แบบงาน/รายการ · ขวา=สรุป (ติดหนึบ) ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* ซ้าย */}
        <div className="space-y-4">
          {order.items.map((it, i) => {
            const proofs = proofsOf(it);
            return (
              <div key={`${it.productId}-${i}`} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-amber-950">{it.name}</p>
                    {it.selections && <p className="mt-0.5 text-xs text-stone-400">{it.selections}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-amber-950">
                    {it.qty} × {formatPrice(it.unitPrice)}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-600">
                    แบบตัวอย่าง{proofs.length > 1 ? ` (${proofs.length} แบบ)` : ""}
                  </span>
                  {it.proofStatus && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${PROOF_STYLES[it.proofStatus]}`}>
                      {it.proofStatus}
                    </span>
                  )}
                </div>

                {!proofs.length ? (
                  <div className="mt-2 grid aspect-[16/7] place-items-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/60 px-4 text-center text-xs leading-relaxed text-stone-400">
                    🎨 ยังไม่มีแบบงาน — ทีมกราฟฟิกกำลังจัดทำ เดี๋ยวจะแจ้งให้ตรวจครับ
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proofs.map((p, j) => (
                        <div key={`${p.url}-${j}`} className="w-24">
                          <button
                            type="button"
                            onClick={() => setLightbox({ itemIdx: i, proofIdx: j })}
                            aria-label={`ขยายดูแบบงาน ${it.name} รูปที่ ${j + 1}`}
                            className="block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-xl ring-1 ring-stone-200 transition hover:ring-amber-300"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`แบบงาน ${it.name} รูปที่ ${j + 1}`} className="h-full w-full bg-stone-50 object-contain" />
                          </button>
                          {(p.qty || p.note) && (
                            <p className="mt-1 text-[11px] leading-tight text-stone-500">
                              {p.qty ? <span className="font-bold text-stone-700">{p.qty} ชิ้น</span> : null}
                              {p.qty && p.note ? " · " : null}
                              {p.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-stone-400">แตะรูปเพื่อดูขนาดเต็ม</p>
                  </>
                )}

                {it.proofStatus === "ขอแก้ไข" && it.proofNote && (
                  <p className="mt-3 rounded-xl bg-rose-50/70 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-100">
                    ✏️ คุณขอแก้ไข: “{it.proofNote}” — ทีมกราฟฟิกกำลังแก้ให้ครับ
                  </p>
                )}

                {it.proofStatus === "อนุมัติ" && (
                  <p className="mt-3 rounded-xl bg-teal-50/70 px-3 py-2 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
                    ✅ คุณอนุมัติแบบนี้แล้ว — ทางร้านจะเริ่มผลิตให้เลย
                  </p>
                )}

                {it.proofStatus === "รอตรวจ" &&
                  (editingIdx === i ? (
                    <div className="mt-3 rounded-xl bg-stone-50 p-3">
                      <label className="mb-1 block text-xs font-bold text-stone-600">อยากให้แก้ตรงไหน?</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="เช่น ขอเปลี่ยนสีพื้นหลังเป็นฟ้า · ตัวหนังสือใหญ่ขึ้น"
                        className="w-full resize-y rounded-xl bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => act(i, "request")}
                          disabled={!note.trim() || busyIdx === i}
                          className="rounded-full bg-rose-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
                        >
                          {busyIdx === i ? "กำลังส่ง…" : "ส่งคำขอแก้ไข"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIdx(null);
                            setNote("");
                          }}
                          className="rounded-full px-4 py-2 text-[13px] font-semibold text-stone-500 hover:bg-stone-100"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => act(i, "approve")}
                        disabled={busyIdx === i}
                        className="rounded-full bg-amber-500 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
                      >
                        {busyIdx === i ? "กำลังส่ง…" : "✅ อนุมัติแบบนี้"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(i);
                          setNote("");
                        }}
                        className="rounded-full px-4 py-2 text-[13px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                      >
                        ✏️ ขอแก้ไข
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        {/* ขวา: สรุป (ติดหนึบตอนเลื่อน) */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">สรุปยอด</p>
            <div className="mt-2.5 flex justify-between text-sm">
              <span className="text-stone-500">รวมสินค้า ({order.items.reduce((s, i) => s + i.qty, 0)} ชิ้น)</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm">
              <span className="text-stone-500">ค่าจัดส่ง ({order.shipping})</span>
              <span>{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
            </div>
            {order.discount && order.discount.amount > 0 && (
              <div className="mt-1.5 flex justify-between text-sm font-semibold text-emerald-600">
                <span>{order.discount.label}</span>
                <span>−{formatPrice(order.discount.amount)}</span>
              </div>
            )}
            <div className="mt-2.5 flex justify-between border-t border-stone-100 pt-2.5 text-base font-extrabold text-amber-950">
              <span>ยอดรวม</span>
              <span className="text-amber-600">{formatPrice(orderTotal(order))}</span>
            </div>
          </div>

          {order.tracking && (
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">เลขพัสดุ</p>
              <p className="mt-1 select-all break-all font-mono text-lg font-extrabold text-amber-950">{order.tracking}</p>
              <p className="mt-1 text-xs text-stone-500">แตะค้างเพื่อคัดลอก แล้วนำไปเช็คสถานะกับขนส่งได้เลย</p>
            </div>
          )}

          {(() => {
            const addrLocked = !!order.printedAt || ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"].includes(order.status);
            return (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">จัดส่งถึง</p>
                  {!editAddr &&
                    (addrLocked ? (
                      <span className="text-[11px] font-semibold text-stone-400">🔒 ล็อกแล้ว</span>
                    ) : (
                      <button
                        type="button"
                        onClick={startEditAddr}
                        className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
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
                      className="w-full rounded-xl bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <input
                      value={addrForm.phone}
                      onChange={(e) => setAddrForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d\-+ ]/g, "") }))}
                      inputMode="tel"
                      placeholder="เบอร์โทร"
                      className="w-full rounded-xl bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <textarea
                      value={addrForm.address}
                      onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))}
                      rows={3}
                      placeholder="บ้านเลขที่ · ถนน · ตำบล/อำเภอ · จังหวัด · รหัสไปรษณีย์"
                      className="w-full resize-y rounded-xl bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    {addrErr && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{addrErr}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveAddr}
                        disabled={addrBusy}
                        className="flex-1 rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
                      >
                        {addrBusy ? "กำลังบันทึก…" : "💾 บันทึกที่อยู่"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAddr(false)}
                        className="rounded-full px-4 py-2 text-sm font-semibold text-stone-400 hover:text-stone-600"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-bold text-amber-950">{order.customer}</p>
                    <p className="text-sm leading-snug text-stone-500">{order.address}</p>
                    <p className="mt-1.5 text-xs text-stone-400">
                      {order.phone} · ชำระโดย{order.payment}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
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
            <details className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-stone-400">
                ประวัติทั้งหมด ({order.log.length})
              </summary>
              <ul className="mt-3 space-y-2 border-l-2 border-stone-100 pl-4">
                {[...order.log].reverse().map((l, i) => (
                  <li key={i} className="text-xs text-stone-500">
                    <span className="font-semibold text-stone-700">{l.action}</span>
                    {l.detail ? ` · ${l.detail}` : ""}
                    <br />
                    <span className="text-stone-400">
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
      <div className="mt-6 rounded-2xl bg-white p-5 text-center ring-1 ring-stone-200">
        {canAppend ? (
          <>
            <p className="text-sm font-bold text-amber-950">อยากสั่งเพิ่มไหม?</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">
              สั่งเพิ่มในออเดอร์นี้ได้เลย — <strong className="text-amber-700">ไม่เสียค่าส่งเพิ่ม</strong> เพราะส่งรวมกล่องเดียวกัน
              (โอนเฉพาะส่วนต่างทีหลัง)
            </p>
            <button
              type="button"
              onClick={() => {
                setAppendTarget({ id: order.id, key: orderKey, shippingCost: order.shippingCost });
                router.push("/products");
              }}
              className="mt-3 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600"
            >
              🛍️ สั่งเพิ่มในออเดอร์นี้
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-stone-700">ออเดอร์นี้ปิดรับสินค้าเพิ่มแล้ว</p>
            <p className="mt-1 text-xs text-stone-500">
              เพราะอยู่ในขั้น “{order.status}” — ถ้าอยากสั่งเพิ่ม จะเป็นออเดอร์ใหม่ (คิดค่าส่งแยก)
            </p>
          </>
        )}
        <Link href="/products" className="mt-3 block text-xs font-semibold text-stone-400 hover:text-stone-600">
          ← ดูสินค้าทั้งหมด
        </Link>
      </div>

      {lightbox &&
        (() => {
          const it = order.items[lightbox.itemIdx];
          const proofs = it ? proofsOf(it) : [];
          const p = proofs[lightbox.proofIdx];
          if (!it || !p) return null; // ข้อมูลเพิ่งรีเฟรชแล้วรูปหาย → ไม่แสดง
          const many = proofs.length > 1;
          const go = (d: number) =>
            setLightbox({ itemIdx: lightbox.itemIdx, proofIdx: (lightbox.proofIdx + d + proofs.length) % proofs.length });
          return (
            <ImageLightbox
              src={p.url}
              alt={`แบบงาน ${it.name} รูปที่ ${lightbox.proofIdx + 1}`}
              caption={[it.name, p.qty ? `${p.qty} ชิ้น` : "", p.note ?? ""].filter(Boolean).join(" · ")}
              counter={many ? `${lightbox.proofIdx + 1} / ${proofs.length}` : undefined}
              onPrev={many ? () => go(-1) : undefined}
              onNext={many ? () => go(1) : undefined}
              onClose={() => setLightbox(null)}
              footer={
                it.proofStatus === "รอตรวจ" ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => act(lightbox.itemIdx, "approve")}
                      disabled={busyIdx === lightbox.itemIdx}
                      className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-amber-600 disabled:opacity-50"
                    >
                      {busyIdx === lightbox.itemIdx ? "กำลังส่ง…" : "✅ อนุมัติแบบนี้"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLightbox(null);
                        setEditingIdx(lightbox.itemIdx);
                        setNote("");
                      }}
                      className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-rose-300 ring-1 ring-rose-300/50 transition hover:bg-rose-500/20"
                    >
                      ✏️ ขอแก้ไข
                    </button>
                  </div>
                ) : it.proofStatus === "อนุมัติ" ? (
                  <p className="text-center text-sm font-bold text-teal-300">✅ คุณอนุมัติแบบนี้แล้ว</p>
                ) : undefined
              }
            />
          );
        })()}
    </div>
  );
}

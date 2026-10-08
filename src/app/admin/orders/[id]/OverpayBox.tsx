"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Order } from "@/lib/admin-data";
import { overpayGross, overpayHandled, overpayOutstanding } from "@/lib/payments";
import { formatPrice } from "@/lib/products";

/**
 * 💸 กล่องเงินโอนเกิน (3 ต.ค. 69) — อยู่ใต้ "หลักฐานการโอน" ในหน้าออเดอร์
 * โชว์เมื่อยังมีเงินโอนเกินค้างจัดการ หรือเคยจัดการไปแล้ว (ประวัติ)
 *   คืนเงินลูกค้าแล้ว   → บันทึกยอด + สลิปที่ร้านโอนคืน (ไม่บังคับ)
 *   ใช้กับออเดอร์อื่น   → ลูกค้าโอนรวม: ย้ายยอดไปนับเป็นเงินชำระของอีกใบ (ไม่ต้องแนบสลิปซ้ำ/รับยอดเองที่ใบนั้น)
 *   ออกคูปองแทน        → ลูกค้าขอเก็บไว้ใช้ครั้งหน้า: ระบบสร้างคูปองลดเป็นบาทเท่ายอดให้เอง + ส่งรหัสทางไลน์ (8 ต.ค. 69)
 * เซิร์ฟเวอร์: /api/admin/orders/overpay
 * สิทธิ์ (เจ้าของร้านเคาะ 8 ต.ค. 69): คืนเงิน/ออกคูปอง = mayRefund (orders.money แอดมินทุกคน — แอดมินเป็นคนโอนคืน)
 *                                   ย้ายยอด = mayTransfer (orders.markPaid ยืนยันเงินเข้า — นับเป็นเงินเข้าของอีกใบ)
 */

interface Candidate {
  id: string;
  status: string;
  customer: string;
  total: number;
  balance: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const asText = (n: number) => (n % 1 ? n.toFixed(2) : String(n));
const parseAmount = (raw: string) => round2(Number((raw || "").replace(/[^\d.]/g, "")) || 0);
const thDate = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function OverpayBox({ order, mayRefund, mayTransfer, onOrder }: { order: Order; mayRefund: boolean; mayTransfer: boolean; onOrder: (o: Order) => void }) {
  const left = overpayOutstanding(order);
  const acts = order.overpayActions ?? [];
  const [mode, setMode] = useState<null | "refund" | "transfer" | "coupon">(null);
  const [lastCode, setLastCode] = useState(""); // รหัสคูปองที่เพิ่งออก — โชว์ให้ก๊อปส่งลูกค้าทันที
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [toId, setToId] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // เปิดฟอร์มย้ายยอด → ดึงออเดอร์อื่นของลูกค้าคนนี้ที่ยังค้างชำระ
  useEffect(() => {
    if (mode !== "transfer" || cands) return;
    let off = false;
    fetch(`/api/admin/orders/overpay?orderId=${encodeURIComponent(order.id)}`)
      .then((r) => r.json())
      .then((j: { candidates?: Candidate[]; error?: string }) => {
        if (off) return;
        setCands(j.candidates ?? []);
        if (j.error) setErr(j.error);
      })
      .catch(() => !off && setCands([]));
    return () => {
      off = true;
    };
  }, [mode, cands, order.id]);

  if (left <= 0 && !acts.length) return null;

  const open = (m: "refund" | "transfer" | "coupon") => {
    setMode(m);
    setErr("");
    setNote("");
    setFile(null);
    setToId("");
    setRaw(asText(left));
  };
  const pick = (c: Candidate) => {
    setToId(c.id);
    setRaw(asText(Math.min(left, c.balance)));
  };

  const amount = parseAmount(raw);
  const picked = cands?.find((c) => c.id === toId.trim().toUpperCase());
  const ok = amount > 0 && amount <= left + 0.005 && (mode !== "transfer" || !!toId.trim());

  async function save() {
    if (!ok || !mode) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("orderId", order.id);
      fd.append("kind", mode);
      fd.append("amount", String(amount));
      if (note.trim()) fd.append("note", note.trim());
      if (mode === "refund" && file) fd.append("file", file);
      if (mode === "transfer") fd.append("toOrderId", toId.trim().toUpperCase());
      const res = await fetch("/api/admin/orders/overpay", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string; couponCode?: string };
      if (!res.ok || !j.order) {
        setErr(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      onOrder(j.order);
      setLastCode(j.couponCode ?? "");
      setMode(null);
      setCands(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mt-2 rounded-xl px-3 py-2.5 ring-1 ${left > 0 ? "bg-amber-50 ring-amber-300" : "bg-slate-50 ring-slate-200"}`}>
      {/* หัวกล่อง — ตัวเลขค้างจัดการคือจุดเด่นจุดเดียว + ตัวเทียบ (ทั้งหมด/จัดการแล้ว) */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`text-sm font-extrabold ${left > 0 ? "text-amber-900" : "text-slate-600"}`}>
          💸 เงินโอนเกิน{left > 0 ? " — ยังไม่ได้คืน/ย้าย" : " — จัดการครบแล้ว"}
        </p>
        {left > 0 && <p className="text-lg font-extrabold tabular-nums text-amber-800">{formatPrice(left)}</p>}
      </div>
      <p className="mt-0.5 text-[11px] tabular-nums text-slate-600">
        โอนเกินทั้งหมด {formatPrice(overpayGross(order))} · จัดการแล้ว {formatPrice(overpayHandled(order))}
      </p>

      {acts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {acts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-700">
              <span className="font-bold tabular-nums">{formatPrice(a.amount)}</span>
              {a.kind === "transfer" && a.toOrderId ? (
                <span>
                  ↪ ย้ายไปใช้กับ{" "}
                  <Link href={`/admin/orders/${encodeURIComponent(a.toOrderId)}`} className="font-bold text-sky-700 underline">
                    {a.toOrderId}
                  </Link>
                </span>
              ) : a.kind === "coupon" ? (
                <span>
                  🎟 ออกคูปองแทน{" "}
                  <code className="rounded bg-teal-50 px-1 font-bold text-teal-800 ring-1 ring-teal-200">{a.couponCode}</code>
                  {a.couponCode && (
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(a.couponCode!)} className="ml-1 text-sky-700 underline">
                      ก๊อป
                    </button>
                  )}
                </span>
              ) : (
                <span>
                  ↩ คืนลูกค้าแล้ว
                  {a.slipUrl && (
                    <>
                      {" · "}
                      <a href={a.slipUrl} target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">
                        ดูสลิปที่โอนคืน
                      </a>
                    </>
                  )}
                </span>
              )}
              <span className="text-slate-500">
                · {a.by} · {thDate(a.at)}
                {a.note ? ` · ${a.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lastCode && !mode && (
        <p className="mt-2 rounded-lg bg-teal-50 px-2.5 py-2 text-[11px] text-teal-900 ring-1 ring-teal-200">
          🎟 ออกคูปอง <code className="font-extrabold">{lastCode}</code> แล้ว · ส่งรหัสให้ลูกค้าทางไลน์ถ้าผูกห้องแชทไว้ (ดูประวัติ) · ไม่ผูก = ก๊อปรหัสส่งเองในแชท
        </p>
      )}

      {left > 0 && !mode && (mayRefund || mayTransfer) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {mayRefund && (
            <button type="button" onClick={() => open("coupon")} className="col-span-2 min-h-11 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800">
              🎟 ออกคูปองแทนคืนเงิน (ลูกค้าเก็บไว้ใช้ครั้งหน้า)
            </button>
          )}
          {mayTransfer ? (
            <button type="button" onClick={() => open("transfer")} className="min-h-11 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700">
              ↪ ใช้กับออเดอร์อื่น
            </button>
          ) : (
            <p className="self-center text-[11px] leading-snug text-amber-800" title="ย้ายยอดไปนับเป็นเงินชำระของอีกใบ = ยืนยันเงินเข้า">
              ↪ ย้ายไปใบอื่น: เฉพาะคนที่มีสิทธิ์ “ยืนยันเงินเข้า”
            </p>
          )}
          {mayRefund && (
            <button type="button" onClick={() => open("refund")} className="min-h-11 rounded-lg bg-white px-3 text-xs font-bold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100">
              ↩ คืนเงินลูกค้าแล้ว
            </button>
          )}
        </div>
      )}
      {left > 0 && !mode && !mayRefund && !mayTransfer && (
        <p className="mt-2 text-[11px] text-amber-800">ฝ่ายแอดมินเป็นคนบันทึกคืนเงิน/ย้ายยอด</p>
      )}

      {mode && (
        <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-amber-200">
          <p className="text-xs font-extrabold text-slate-800">
            {mode === "transfer"
              ? "↪ ย้ายเงินโอนเกินไปนับเป็นยอดชำระของออเดอร์อื่น (ลูกค้าโอนรวม)"
              : mode === "coupon"
                ? "🎟 ออกคูปองลดเป็นบาทเท่ายอดโอนเกิน แทนโอนคืน"
                : "↩ บันทึกว่าร้านโอนเงินคืนลูกค้าแล้ว"}
          </p>
          {mode === "coupon" && (
            <p className="text-[11px] leading-snug text-slate-600">
              ระบบสร้างคูปองใช้ครั้งเดียว ไม่หมดอายุ ให้เอง
              {order.customerId ? " · ผูกกับบัญชี LINE ที่สั่งใบนี้ คนอื่นใช้ไม่ได้" : " · ใบนี้สั่งแบบไม่ล็อกอิน → ใครมีรหัสก็ใช้ได้ ส่งรหัสให้ลูกค้าคนเดียว"}
              {" · "}ส่งรหัสทางไลน์ให้เองถ้าผูกห้องแชทไว้
            </p>
          )}

          {mode === "transfer" && (
            <div>
              <p className="text-[11px] font-bold text-slate-600">ออเดอร์ปลายทาง</p>
              {cands === null ? (
                <p className="mt-1 text-[11px] text-slate-500">กำลังหาออเดอร์อื่นของลูกค้าคนนี้…</p>
              ) : cands.length ? (
                <div className="mt-1 space-y-1">
                  {cands.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pick(c)}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs ring-1 ${
                        toId === c.id ? "bg-amber-100 font-bold ring-amber-500" : "bg-white ring-slate-200 hover:bg-amber-50"
                      }`}
                    >
                      <span>
                        {c.id} <span className="text-slate-500">· {c.status}</span>
                      </span>
                      <span className="tabular-nums text-rose-700">ค้าง {formatPrice(c.balance)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">ไม่เจอออเดอร์อื่นของลูกค้าคนนี้ที่ยังค้างชำระ — พิมพ์เลขออเดอร์เองด้านล่าง</p>
              )}
              <input
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                placeholder="หรือพิมพ์เลขออเดอร์ เช่น OD-261003-1234"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2.5 text-xs uppercase"
              />
              {toId.trim() && !picked && cands !== null && (
                <p className="mt-1 text-[11px] text-amber-700">⚠️ ใบนี้ไม่ได้อยู่ในรายชื่อออเดอร์ของลูกค้าคนเดียวกัน — เช็คชื่อลูกค้าให้แน่ใจก่อนย้าย</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="overpay-amount" className="text-[11px] font-bold text-slate-600">
              ยอด (ไม่เกิน {formatPrice(left)}
              {picked ? ` · ใบปลายทางค้าง ${formatPrice(picked.balance)}` : ""})
            </label>
            <div className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border-2 border-amber-300 px-2.5 focus-within:border-amber-500">
              <span className="font-extrabold text-amber-700">฿</span>
              <input
                id="overpay-amount"
                inputMode="decimal"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="w-full bg-transparent text-base font-extrabold tabular-nums outline-none"
              />
            </div>
          </div>

          {mode === "refund" && (
            <label className="block text-[11px] font-bold text-slate-600">
              สลิปที่ร้านโอนคืน (ถ้ามี)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[11px]" />
            </label>
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "refund" ? "หมายเหตุ เช่น โอนคืนเข้าพร้อมเพย์ลูกค้า" : mode === "coupon" ? "หมายเหตุ เช่น ลูกค้าขอเก็บไว้ใช้รอบหน้า" : "หมายเหตุ (ถ้ามี)"}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-2.5 text-xs"
          />

          {err && <p className="text-[11px] font-bold text-rose-700">{err}</p>}

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setMode(null)} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
              ยกเลิก
            </button>
            <button type="button" onClick={save} disabled={!ok || busy} className="min-h-11 rounded-lg bg-amber-600 text-xs font-bold text-white disabled:opacity-40">
              {busy
                ? "กำลังบันทึก…"
                : mode === "transfer"
                  ? `ย้าย ${formatPrice(amount)} ไป ${toId.trim().toUpperCase() || "…"}`
                  : mode === "coupon"
                    ? `ออกคูปองลด ${formatPrice(Math.round(amount))}`
                    : `บันทึกว่าคืน ${formatPrice(amount)} แล้ว`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

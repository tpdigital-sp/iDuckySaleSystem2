"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { MOCK_ORDERS, orderTotal, STATUS_STYLES, withLog, type Order } from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin } from "@/lib/order-repo";
import { h1, muted } from "@/lib/admin-ui";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

/**
 * ดึงเลขออเดอร์ออกจากสิ่งที่ยิงเข้ามา
 * รองรับทั้งโค้ดล้วน (OD-260722-8143) และลิงก์เต็ม (กรณียิงโดน QR ของมือถือ)
 */
function extractOrderId(raw: string): string {
  const v = raw.trim();
  const m = v.match(/OD-\d{6}-\d{4}/i);
  if (m) return m[0].toUpperCase();
  // เผื่อรูปแบบเลขออเดอร์เปลี่ยนในอนาคต — ถ้าเป็น URL ให้เอาส่วนท้ายของ path
  if (/^https?:\/\//i.test(v)) {
    const tail = v.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (tail) return decodeURIComponent(tail);
  }
  return v;
}

/**
 * สถานีสแกน — ยิง QR เลขออเดอร์ แล้วยิง/พิมพ์เลขพัสดุต่อ
 * เครื่องสแกนทำงานเหมือนคีย์บอร์ด (พิมพ์ข้อความ + Enter) จึงรับผ่าน <form> ธรรมดา
 * ช่องกรอกจะโฟกัสค้างไว้เสมอ เพื่อให้ยิงต่อเนื่องได้โดยไม่ต้องคลิก
 */
export default function ScanTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [demo, setDemo] = useState(false);
  const [target, setTarget] = useState<Order | null>(null); // ออเดอร์ที่รอเลขพัสดุ
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; tracking: string; at: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length > 0) setOrders(r.orders);
    else {
      setOrders(MOCK_ORDERS);
      setDemo(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput, target]);

  function reset(message?: Msg) {
    setTarget(null);
    setValue("");
    setMsg(message ?? null);
    setTimeout(focusInput, 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v || busy) return;
    setValue("");

    // ── ขั้นที่ 1: ยิง QR เลขออเดอร์ ──
    if (!target) {
      const code = extractOrderId(v);
      const found = orders.find((o) => o.id.toLowerCase() === code.toLowerCase());
      if (!found) {
        setMsg({ kind: "err", text: `ไม่พบออเดอร์ “${code}” — ยิง QR บนใบงานอีกครั้ง` });
        setTimeout(focusInput, 50);
        return;
      }
      setTarget(found);
      setMsg({
        kind: "info",
        text: found.tracking ? `ออเดอร์นี้มีเลขพัสดุแล้ว (${found.tracking}) — ยิงใหม่เพื่อแทนที่` : "ยิงเลขพัสดุต่อได้เลย",
      });
      setTimeout(focusInput, 50);
      return;
    }

    // ── ขั้นที่ 2: ยิง/พิมพ์เลขพัสดุ ──
    setBusy(true);
    const next = withLog(
      { ...target, tracking: v, status: target.status === "เสร็จสิ้น" ? target.status : "จัดส่งแล้ว" },
      "แอดมิน",
      "บันทึกเลขพัสดุ",
      v
    );
    const ok = demo ? true : await saveOrderAdmin(next);
    setBusy(false);

    if (!ok) {
      setMsg({ kind: "err", text: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      setTimeout(focusInput, 50);
      return;
    }
    setOrders((os) => os.map((o) => (o.id === next.id ? next : o)));
    setHistory((h) => [{ id: next.id, tracking: v, at: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) }, ...h].slice(0, 12));
    reset({ kind: "ok", text: `บันทึกแล้ว — ${next.id} · ${v}` });
  }

  const waiting = !target;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📮 ยิงเลขพัสดุ</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            ยิง QR บนใบงาน → ยิงเลขพัสดุ → บันทึกอัตโนมัติ · ทำต่อเนื่องได้เลยไม่ต้องคลิก
          </p>
        </div>
        <Link href="/admin/orders" className="text-sm font-semibold text-amber-600 hover:underline">
          ← คำสั่งซื้อทั้งหมด
        </Link>
      </div>

      {demo && (
        <p className="mt-4 rounded-xl bg-yellow-50 px-4 py-2.5 text-sm text-yellow-800 ring-1 ring-yellow-200">
          โหมดตัวอย่าง — ยังไม่มีออเดอร์จริง การบันทึกจะไม่ถูกเก็บถาวร
        </p>
      )}

      {/* ── ขั้นตอน ── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StepCard n={1} title="ยิง QR เลขออเดอร์" active={waiting} done={!waiting} />
        <StepCard n={2} title="ยิงเลขพัสดุ" active={!waiting} done={false} />
      </div>

      {/* ── ช่องรับการยิง ── */}
      <form onSubmit={onSubmit} className="mt-4">
        <div
          className={`rounded-2xl border-2 p-5 transition ${
            waiting ? "border-amber-300 bg-amber-50/50" : "border-green-400 bg-green-50/50"
          }`}
        >
          <label htmlFor="scan" className="block text-xs font-bold uppercase tracking-widest text-slate-500">
            {waiting ? "รอยิง QR เลขออเดอร์" : `รอเลขพัสดุของ ${target.id}`}
          </label>
          <input
            id="scan"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTimeout(focusInput, 120)}
            autoComplete="off"
            autoFocus
            placeholder={waiting ? "ยิง QR หรือพิมพ์เลขออเดอร์ แล้วกด Enter" : "ยิงเลขพัสดุ แล้วกด Enter"}
            className="mt-2 w-full bg-transparent font-mono text-2xl font-bold tracking-wide text-slate-900 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            {busy ? "กำลังบันทึก…" : "ช่องนี้โฟกัสอยู่ตลอด — ยิงได้เลย"}
          </p>
        </div>
      </form>

      {msg && (
        <p
          className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 ring-green-200"
              : msg.kind === "err"
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : "bg-sky-50 text-sky-700 ring-sky-200"
          }`}
        >
          {msg.kind === "ok" ? "✅ " : msg.kind === "err" ? "⚠️ " : "👉 "}
          {msg.text}
        </p>
      )}

      {/* ── ออเดอร์ที่กำลังรอเลขพัสดุ ── */}
      {target && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-bold text-slate-900">{target.id}</p>
              <p className="text-sm text-slate-600">
                {target.customer} · {target.phone}
              </p>
              <p className="mt-1 text-sm leading-snug text-slate-500">{target.address}</p>
            </div>
            <div className="text-right">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[target.status]}`}>
                {target.status}
              </span>
              <p className="mt-1 font-bold text-slate-900">{formatPrice(orderTotal(target))}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => reset({ kind: "info", text: "ยกเลิกแล้ว — ยิง QR ออเดอร์ใหม่ได้เลย" })}
            className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            ยกเลิก / เปลี่ยนออเดอร์
          </button>
        </div>
      )}

      {/* ── ประวัติการยิงรอบนี้ ── */}
      {history.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">บันทึกแล้วรอบนี้ ({history.length})</p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {history.map((h, i) => (
              <li key={`${h.id}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono font-bold text-slate-800">{h.id}</span>
                <span className="flex-1 truncate font-mono text-slate-600">{h.tracking}</span>
                <span className="text-xs text-slate-400">{h.at}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepCard({ n, title, active, done }: { n: number; title: string; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-4 ${
        active ? "border-amber-300 bg-white shadow-sm" : done ? "border-green-200 bg-green-50/60" : "border-slate-200 bg-white/60"
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
          active ? "bg-amber-500 text-white" : done ? "bg-green-500 text-white" : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={`text-sm font-bold ${active || done ? "text-slate-800" : "text-slate-400"}`}>{title}</span>
    </div>
  );
}

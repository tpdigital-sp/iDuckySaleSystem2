"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MOCK_ORDERS,
  packGate,
  STATUS_STYLES,
  withLog,
  type Order,
  type OrderStatus,
  type PackGate,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { h1, muted } from "@/lib/admin-ui";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;
type Tab = "scan" | "print";

/** สถานะที่อยู่ในสายงานแพ็ค–ส่ง (แบบผ่านแล้ว ยังไม่ส่ง) */
const FULFILL: OrderStatus[] = ["อนุมัติแบบ", "กำลังผลิต"];

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

/**
 * ดึงเลขออเดอร์ออกจากสิ่งที่ยิงเข้ามา
 * รองรับทั้งโค้ดล้วน (OD-260722-8143) และลิงก์เต็ม (กรณียิงโดน QR ของมือถือ)
 */
function extractOrderId(raw: string): string {
  const v = raw.trim();
  const m = v.match(/OD-\d{6}-\d{4}/i);
  if (m) return m[0].toUpperCase();
  if (/^https?:\/\//i.test(v)) {
    const tail = v.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (tail) return decodeURIComponent(tail);
  }
  return v;
}

/**
 * สถานีแพ็ค–ส่ง — 2 แท็บ
 *  • ยิงเลขพัสดุ: ยิง QR เลขออเดอร์ → ยิงเลขพัสดุ + ลิสต์ออเดอร์ที่ตรวจแพ็คครบ พร้อมยิง
 *  • รอปริ้น/แพ็ค: ออเดอร์ที่แบบผ่านแล้ว ยังตรวจแพ็คไม่ครบ — ปริ้นใบงานไปทำ/แพ็ค
 */
export default function ScanTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<Tab>("scan");
  const [target, setTarget] = useState<Order | null>(null); // ออเดอร์ที่รอเลขพัสดุ
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; tracking: string; at: string }[]>([]);
  const [blocked, setBlocked] = useState<{ order: Order; gate: PackGate } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length > 0) {
      setOrders(r.orders);
      setDemo(false);
    } else {
      setOrders(MOCK_ORDERS);
      setDemo(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // อัปเดตลิสต์เงียบ ๆ (ออเดอร์ใหม่ที่แบบผ่าน / ตรวจแพ็คเสร็จ จะโผล่เอง) — ไม่แตะช่องยิง
  const refresh = useCallback(async () => {
    if (busy || target) return; // กำลังยิงอยู่ อย่าทับ
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(r.orders) ? cur : r.orders));
  }, [busy, target]);
  usePolling(refresh, { enabled: !demo });

  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (tab !== "scan") return;
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput, target, tab]);

  // ── แยกออเดอร์เป็น 2 กอง ตามผลตรวจแพ็ค ──
  const { toScan, toPrint } = useMemo(() => {
    const active = orders.filter((o) => FULFILL.includes(o.status) && !o.tracking);
    return {
      toScan: active.filter((o) => packGate(o).ready), // ตรวจครบ → พร้อมยิง
      toPrint: active.filter((o) => !packGate(o).ready), // ยังไม่ครบ → รอปริ้น/แพ็ค
    };
  }, [orders]);

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
      // ── ด่านกันพลาด: ต้องตรวจแพ็คครบก่อนถึงยิงเลขพัสดุได้ ──
      const gate = packGate(found);
      if (!gate.ready) {
        setBlocked({ order: found, gate });
        setMsg(null);
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
    setHistory((h) =>
      [{ id: next.id, tracking: v, at: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) }, ...h].slice(0, 12)
    );
    reset({ kind: "ok", text: `บันทึกแล้ว — ${next.id} · ${v}` });
  }

  const waiting = !target;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📮 สถานีแพ็ค–ส่ง</h1>
          <p className={`mt-1 text-sm ${muted}`}>ปริ้นใบงาน → แพ็ค+ตรวจ → ยิงเลขพัสดุ · แยกเป็นแท็บตามงานที่ต้องทำ</p>
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

      {/* ── แท็บ ── */}
      <div className="mt-4 flex gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab("scan")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
            tab === "scan" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📮 ยิงเลขพัสดุ{" "}
          <span className="ml-1 rounded-full bg-green-100 px-1.5 text-xs text-green-700">{toScan.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("print")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
            tab === "print" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🖨️ รอปริ้น/แพ็ค{" "}
          <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-700">{toPrint.length}</span>
        </button>
      </div>

      {tab === "scan" ? (
        <>
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
                onBlur={() => {
                  if (!blocked) setTimeout(focusInput, 120);
                }}
                autoComplete="off"
                autoFocus
                placeholder={waiting ? "ยิง QR หรือพิมพ์เลขออเดอร์ แล้วกด Enter" : "ยิงเลขพัสดุ แล้วกด Enter"}
                className="mt-2 w-full bg-transparent font-mono text-2xl font-bold tracking-wide text-slate-900 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">{busy ? "กำลังบันทึก…" : "ช่องนี้โฟกัสอยู่ตลอด — ยิงได้เลย"}</p>
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
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[target.status]}`}>
                  {target.status}
                </span>
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

          {/* ── ลิสต์ออเดอร์พร้อมยิง ── */}
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
            ✅ ตรวจแพ็คครบแล้ว พร้อมยิงเลข ({toScan.length})
          </p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {toScan.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-bold text-slate-800">{o.id}</p>
                  <p className="truncate text-xs text-slate-500">
                    {o.customer} · {qtyOf(o)} ชิ้น · {o.status}
                  </p>
                </Link>
                <span className="shrink-0 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 ring-1 ring-green-200">
                  พร้อมยิง
                </span>
              </li>
            ))}
            {toScan.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">ยังไม่มีออเดอร์พร้อมยิง — ตรวจแพ็คให้ครบก่อน</li>
            )}
          </ul>

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
        </>
      ) : (
        /* ── แท็บ รอปริ้น/แพ็ค ── */
        <>
          <p className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">
            🖨️ แบบผ่านแล้ว รอปริ้นใบงาน + แพ็ค ({toPrint.length})
          </p>
          <ul className="mt-2 space-y-2">
            {toPrint.map((o) => {
              const g = packGate(o);
              const need = [
                g.uncounted.length ? `ตรวจนับ ${g.uncounted.length} รูป` : "",
                g.unread.length ? `อ่านรายละเอียด ${g.unread.length} รายการ` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-800">{o.id}</p>
                    <p className="truncate text-xs text-slate-500">
                      {o.customer} · {qtyOf(o)} ชิ้น
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                      {o.status}
                      {need ? ` · เหลือ ${need}` : " · ยังไม่ได้ตรวจแพ็ค"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/admin/orders/${encodeURIComponent(o.id)}/print?doc=work`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700"
                    >
                      🖨️ ปริ้นใบงาน
                    </a>
                    <Link
                      href={`/admin/orders/${encodeURIComponent(o.id)}`}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      เปิด
                    </Link>
                  </div>
                </li>
              );
            })}
            {toPrint.length === 0 && (
              <li className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                ไม่มีออเดอร์รอปริ้น 🎉
              </li>
            )}
          </ul>
        </>
      )}

      {/* ── ป๊อปอัปเตือน: ตรวจแพ็คไม่ครบ ยิงไม่ได้ ── */}
      {blocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-title"
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-4xl">🚫</p>
            <h2 id="block-title" className="mt-2 text-xl font-extrabold text-slate-900">
              ยังยิงเลขพัสดุไม่ได้
            </h2>
            <p className="mt-1 font-mono text-sm font-bold text-slate-700">{blocked.order.id}</p>
            <p className="text-sm text-slate-600">{blocked.order.customer}</p>

            <div className="mt-4 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <p className="text-xs font-bold text-rose-800">ต้องทำให้ครบก่อน:</p>
              <ul className="mt-1 space-y-1 text-sm leading-relaxed text-rose-700">
                {blocked.gate.uncounted.length > 0 && <li>• ยังไม่ได้ตรวจนับของ {blocked.gate.uncounted.length} รูป</li>}
                {blocked.gate.unread.length > 0 && <li>• ยังไม่ได้ยืนยันอ่านรายละเอียด {blocked.gate.unread.length} รายการ</li>}
                {blocked.gate.short.map((s, k) => (
                  <li key={k} className="font-bold">
                    • ของไม่ครบ: {s.item} — นับได้ {s.got}
                    {s.need ? ` จาก ${s.need}` : ""} ชิ้น
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/orders/${encodeURIComponent(blocked.order.id)}`}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-700"
              >
                เปิดหน้าออเดอร์เพื่อตรวจ
              </Link>
              <button
                type="button"
                onClick={() => {
                  setBlocked(null);
                  setValue("");
                  setTimeout(focusInput, 50);
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                ปิด · ยิงออเดอร์อื่น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * 🔔 แจ้งเตือนเด้ง (Order.alertNote) — เจ้าของร้านขอ 12 ต.ค. 69
 *
 * แอดมินพิมพ์ข้อความถึงทีม (เช่น "ลูกค้าขอเปลี่ยนที่อยู่ ห้ามส่งตามใบเดิม" / "ใส่ของแถม 2 ชิ้น")
 * → เด้งเต็มจอทุกครั้งที่เปิดหน้าออเดอร์ · โหมดแพ็ค · หน้าปริ้น · สถานีแพ็คยิงใบนี้
 * จนกว่าใบจะจัดส่งแล้ว/เสร็จสิ้น/ยกเลิก หรือมีคนกด "ปิดแจ้งเตือน" (ปิดถาวรทุกเครื่อง)
 * "รับทราบ" = ปิดเฉพาะหน้านี้รอบนี้ เปิดใหม่ก็เด้งอีก
 *
 * OrderAlertPopup  — ตัวเด้ง (รับได้หลายใบ = หน้าปริ้นรวมหลายใบ)
 * OrderAlertEditor — ช่องตั้ง/แก้/ลบ ในหน้าออเดอร์ (แอดมิน)
 */

import { useEffect, useState } from "react";
import { orderAlertActive, type Order, type OrderAlertNote } from "@/lib/admin-data";
import { thaiDateTime } from "@/lib/bangkok-time";

type AlertResult = { alertNote: OrderAlertNote | null; savedAt?: string; log?: Order["log"] };

export async function postOrderAlert(body: { id: string; text?: string; dismiss?: boolean; reopen?: boolean }): Promise<AlertResult> {
  const res = await fetch("/api/admin/orders/alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as AlertResult & { error?: string };
  if (!res.ok) throw new Error(j.error || `บันทึกไม่สำเร็จ (${res.status})`);
  return j;
}

export function OrderAlertPopup({
  orders,
  onChanged,
}: {
  orders: Pick<Order, "id" | "status" | "alertNote">[];
  /** กดปิดแจ้งเตือนสำเร็จ — ให้หน้าที่เรียกอัปเดตออเดอร์ในจอ */
  onChanged?: (id: string, r: AlertResult) => void;
}) {
  // รับทราบแล้ว (เฉพาะหน้านี้รอบนี้) — จำตาม id+เวลาที่ตั้ง แอดมินแก้ข้อความ = เด้งใหม่
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const keyOf = (o: Pick<Order, "id" | "alertNote">) => `${o.id}|${o.alertNote?.at}`;
  const list = orders.filter((o) => orderAlertActive(o) && !acked.has(keyOf(o)));
  const cur = list[0];

  useEffect(() => setErr(""), [cur?.id]);
  if (!cur) return null;
  const a = cur.alertNote!;
  const ack = () => setAcked((s) => new Set(s).add(keyOf(cur)));

  async function dismiss() {
    setBusy(true);
    setErr("");
    try {
      const r = await postOrderAlert({ id: cur.id, dismiss: true });
      onChanged?.(cur.id, r);
      ack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปิดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/75 p-0 print:hidden sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="rounded-t-3xl bg-amber-500 px-5 py-4 text-white">
          <p className="text-lg font-extrabold">🔔 แจ้งเตือนจากแอดมิน</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-amber-50">
            {cur.id}
            {list.length > 1 && <span className="ml-2 font-sans">· อีก {list.length - 1} ใบมีแจ้งเตือน</span>}
          </p>
        </div>
        <div className="space-y-3 p-4">
          <p className="whitespace-pre-wrap rounded-2xl bg-amber-50 p-4 text-base font-bold leading-relaxed text-slate-900 ring-2 ring-amber-300">
            {a.text}
          </p>
          <p className="text-xs text-slate-500">
            ตั้งโดย {a.by} · {thaiDateTime(new Date(a.at))}
          </p>
          <p className="text-[11px] leading-snug text-slate-500">
            เด้งทุกครั้งที่เปิดใบนี้ จนกว่าจะจัดส่งแล้ว หรือกด “ปิดแจ้งเตือน” (ปิดให้ทุกคน)
          </p>
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{err}</p>}
        </div>
        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={ack}
            className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
          >
            รับทราบ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="min-h-[48px] rounded-xl bg-slate-900 px-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "กำลังปิด…" : "✓ ปิดแจ้งเตือน"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderAlertEditor({
  order,
  canEdit,
  onChanged,
}: {
  order: Pick<Order, "id" | "status" | "alertNote">;
  canEdit: boolean;
  onChanged: (r: AlertResult) => void;
}) {
  const a = order.alertNote;
  const [text, setText] = useState(a?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setText(order.alertNote?.text ?? ""), [order.alertNote?.text]);
  const active = orderAlertActive(order);
  const dirty = text.trim() !== (a?.text ?? "");

  async function run(body: { text?: string; dismiss?: boolean; reopen?: boolean }) {
    setBusy(true);
    setErr("");
    try {
      onChanged(await postOrderAlert({ id: order.id, ...body }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit && !a) return null;
  return (
    <div className={`rounded-2xl p-3 ring-2 ${active ? "bg-amber-100 ring-amber-400" : "bg-amber-50 ring-amber-200"}`}>
      <div className="mb-2 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-base text-white shadow-sm">🔔</span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-amber-900">แจ้งเตือนเด้ง (แอดมิน · คนปริ้น · คนแพ็ค)</p>
          <p className="text-[11px] leading-snug text-amber-800">
            ไม่พิมพ์ลงใบงาน — เด้งเต็มจอทุกครั้งที่เปิดออเดอร์/หน้าปริ้น/หน้าแพ็ค จนจัดส่งแล้วหรือกดปิด
          </p>
        </div>
      </div>
      {canEdit ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="เช่น ลูกค้าเปลี่ยนที่อยู่ ห้ามส่งตามใบเดิม / ใส่ของแถม 2 ชิ้น"
          className="w-full rounded-xl border-2 border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 ring-1 ring-amber-300">{a?.text}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {canEdit && dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ text })}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {text.trim() ? (a ? "บันทึก (เด้งใหม่ทุกคน)" : "🔔 ตั้งแจ้งเตือน") : "ลบแจ้งเตือน"}
          </button>
        )}
        {a && !dirty && active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ dismiss: true })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ✓ ปิดแจ้งเตือน
          </button>
        )}
        {canEdit && a?.dismissedAt && !dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ reopen: true })}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            🔔 เปิดเด้งอีกครั้ง
          </button>
        )}
        {a && !dirty && (
          <span className="text-[11px] font-semibold text-amber-800">
            {active
              ? `กำลังเด้ง · ตั้งโดย ${a.by}`
              : a.dismissedAt
                ? `ปิดแล้วโดย ${a.dismissedBy ?? "-"} · ${thaiDateTime(new Date(a.dismissedAt))}`
                : "ไม่เด้งแล้ว (ใบจัดส่ง/ปิดแล้ว)"}
          </span>
        )}
        {err && <span className="text-[11px] font-bold text-rose-600">{err}</span>}
      </div>
    </div>
  );
}

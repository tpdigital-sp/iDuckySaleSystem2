"use client";

/**
 * 📄➕ ออกใบเสนอราคา FlowAccount "เฉพาะรายการที่สั่งเพิ่ม" จากหน้าออเดอร์ (เจ้าของร้านสั่ง 16 ต.ค. 69 · OD-261002-9030)
 *
 * ลูกค้าบิลบริษัทสั่งเพิ่ม 1 ชิ้นหลังออกใบเสร็จ INV ไปแล้ว — รายการอยู่ในออเดอร์และโอนครบแล้ว ขาดแค่เอกสาร
 * ปุ่ม "ออกใบเสนอราคาใน FlowAccount" เดิมเอาทุกรายการ (ซ้ำบิลเดิม) → ปุ่มนี้ให้ติ๊กเลือกรายการ (ติ๊กรายการที่เพิ่มหลังบิลให้ล่วงหน้า)
 * ตรวจร่างกับเซิร์ฟเวอร์ → สร้าง QT → แนบเป็นบิลเพิ่มของออเดอร์ให้เอง (ยอดออเดอร์/สถานะไม่เปลี่ยน · ไม่แจ้งลูกค้า)
 * ใบกำกับ/ใบเสร็จของใบนี้ = อัปเกรดต่อในแอป FlowAccount ตามปกติ → ระบบจดเลข INV ให้เองใน ~5 นาที
 */

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/products";
import { addedItemCandidates, unbilledAmount, type Order } from "@/lib/admin-data";

type Draft = {
  lines: { name: string; quantity: number; pricePerUnit: number; total: number }[];
  afterDiscount: number;
  vat: number;
  grandTotal: number;
  wht?: { rate: number; amount: number };
  contact: { name: string; taxId?: string };
  problems: string[];
  warnings: string[];
  unbilled: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const printOf = (it: Order["items"][number]) => `${it.name}|${it.qty}|${it.unitPrice}`;

export default function FaExtraQuotation({ order, onApply }: { order: Order; onApply: (next: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "create">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ docNo: string; url?: string } | null>(null);

  const rows = useMemo(() => order.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.extraDoc), [order.items]);
  const unbilled = unbilledAmount(order);
  const afterBill = useMemo(() => new Set(addedItemCandidates(order)), [order]);
  const sub = r2([...picked].reduce((s, i) => s + (order.items[i] ? order.items[i].qty * order.items[i].unitPrice : 0), 0));
  const total = r2(sub + r2(sub * 0.07));
  const matches = unbilled != null && picked.size > 0 && Math.abs(unbilled - total) <= 0.05;

  function start() {
    setPicked(new Set(afterBill));
    setDraft(null);
    setErr("");
    setDone(null);
    setOpen(true);
  }

  function toggle(i: number) {
    setDraft(null);
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  async function call(create: boolean) {
    setBusy(create ? "create" : "draft");
    setErr("");
    try {
      const items = [...picked].sort((a, b) => a - b).map((idx) => ({ idx, print: printOf(order.items[idx]) }));
      const r = await fetch("/api/admin/orders/fa-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, kind: "qt-extra", items, create }),
      });
      const j = (await r.json().catch(() => null)) as { draft?: Draft; order?: Order; docNo?: string; url?: string; error?: string } | null;
      if (!create) {
        if (!r.ok || !j?.draft) throw new Error(j?.error ?? `ตรวจร่างไม่สำเร็จ (${r.status})`);
        setDraft(j.draft);
        return;
      }
      if (!r.ok || !j?.order) throw new Error(j?.error ?? `สร้างไม่สำเร็จ (${r.status})`);
      onApply(j.order);
      setDone({ docNo: j.docNo ?? "", url: j.url });
      setDraft(null);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!open)
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={start}
          className="min-h-[36px] rounded-full bg-white px-3 py-1 text-[12px] font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-50"
          title="ออเดอร์นี้มีบิลแล้ว — ออกใบเสนอราคาใบใหม่เฉพาะรายการที่ลูกค้าสั่งเพิ่ม แล้วแนบเป็นบิลเพิ่มให้เอง"
        >
          📄➕ ออกใบเสนอราคา เฉพาะรายการที่สั่งเพิ่ม
          {unbilled != null && unbilled > 0.05 && <span className="ml-1.5 font-semibold text-amber-700">· ยังไม่มีบิล {formatPrice(unbilled)}</span>}
        </button>
        {done && (
          <p className="mt-1.5 text-[12px] font-semibold text-emerald-700">
            ✅ ออก {done.docNo} แล้ว — แนบเป็นบิลเพิ่มให้แล้ว · ออกใบเสร็จต่อในแอป FlowAccount{" "}
            {done.url && (
              <a href={done.url} target="_blank" rel="noreferrer" className="underline">
                เปิดเอกสาร ↗
              </a>
            )}
          </p>
        )}
      </div>
    );

  return (
    <div className="mt-2 rounded-lg border border-sky-300 bg-white p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-slate-800">📄➕ ใบเสนอราคาเฉพาะรายการที่สั่งเพิ่ม</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100" disabled={!!busy}>
          ✕ ปิด
        </button>
      </div>
      <p className="mt-0.5 text-slate-500">ติ๊กรายการที่ยังไม่มีบิล ระบบติ๊กรายการที่เพิ่มหลังออกบิลล่าสุดให้แล้ว · ยอดออเดอร์และสถานะไม่เปลี่ยน ไม่ส่งไลน์ลูกค้า</p>

      <ul className="mt-2 divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
        {rows.map(({ it, i }) => (
          <li key={i}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-sky-50/60">
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={picked.has(i)} onChange={() => toggle(i)} disabled={!!busy} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-800">{it.name}</span>
                {afterBill.has(i) && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-bold text-amber-800">เพิ่มหลังออกบิล</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums text-slate-700">
                {it.qty.toLocaleString("th-TH")} × {formatPrice(it.unitPrice)} = <b>{formatPrice(r2(it.qty * it.unitPrice))}</b>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 tabular-nums">
        <span className="text-slate-600">
          ก่อน VAT {formatPrice(sub)} · VAT 7% {formatPrice(r2(sub * 0.07))} · <b className="text-slate-900">รวม {formatPrice(total)}</b>
        </span>
        {unbilled != null && (
          <span className={matches ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
            {matches ? "✓ " : "⚠ "}ยอดที่ยังไม่มีบิล {formatPrice(Math.max(0, unbilled))}
          </span>
        )}
      </div>

      {draft && (
        <div className="mt-2 rounded-md bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="font-semibold text-slate-700">
            ออกให้: {draft.contact.name}
            {draft.contact.taxId ? ` · ${draft.contact.taxId}` : ""}
          </p>
          {draft.wht && (
            <p className="text-slate-600">
              หัก ณ ที่จ่าย {draft.wht.rate}% {formatPrice(draft.wht.amount)}
            </p>
          )}
          {draft.problems.map((p) => (
            <p key={p} className="mt-1 font-bold text-rose-700">
              ⛔ {p}
            </p>
          ))}
          {draft.warnings.map((w) => (
            <p key={w} className="mt-1 font-semibold text-amber-800">
              ⚠️ {w}
            </p>
          ))}
          {!draft.problems.length && <p className="mt-1 text-slate-500">กดสร้างแล้วจะออกในบัญชี FlowAccount จริง แก้/ยกเลิกทีหลังต้องทำในแอป FlowAccount</p>}
        </div>
      )}

      {err && <p className="mt-2 font-bold text-rose-700">⚠️ {err}</p>}

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {!draft || draft.problems.length ? (
          <button
            type="button"
            onClick={() => void call(false)}
            disabled={!!busy || !picked.size}
            className="min-h-[40px] rounded-lg bg-white px-3 font-bold text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:opacity-50"
          >
            {busy === "draft" ? "⏳ กำลังตรวจ…" : `ตรวจร่าง (${picked.size} รายการ)`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void call(true)}
            disabled={!!busy}
            className="min-h-[40px] rounded-lg bg-sky-700 px-3 font-bold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {busy === "create" ? "⏳ กำลังสร้างใน FlowAccount…" : `สร้างใบเสนอราคา ${formatPrice(draft.grandTotal)}`}
          </button>
        )}
      </div>
    </div>
  );
}

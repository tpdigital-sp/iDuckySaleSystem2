"use client";

/**
 * 🧾➕ บิลเพิ่ม — เอกสาร FlowAccount ใบที่ 2, 3 … ของออเดอร์เดียวกัน (ส่วนต่างเปลี่ยนสเปค/วัสดุ · ค่าใช้จ่ายเพิ่ม)
 *
 * ทำไมต้องมี (OD-260921-1879 · 24 ก.ย. 69): ลูกค้าบิลบริษัทเปลี่ยนแก้วใส → ขาวขุ่นระหว่างผลิต ร้านออก QT010743 เป็นส่วนต่าง
 * แต่ออเดอร์ผูกเอกสารได้ใบเดียว → "จะแนบ 2 บิลยังไง ฝ่ายแพ็คต้องรู้ด้วยว่ามี 2 บิล"
 * วางลิงก์ใบที่ 2 → ระบบอ่านยอด เก็บเป็นค่าบริการเพิ่ม (นอกฐานภาษีบิลหลัก ยอดตามบิลหลักยังตรง) แจ้งไลน์ลูกค้าให้โอนตามใบนั้น
 * และทุกจอฝ่ายแพ็ค/ใบงาน/ใบปะหน้าขึ้นว่า "ใบกำกับภาษี 2 ใบ"
 */

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import { type FlowAccountExtraDoc, type Order } from "@/lib/admin-data";

type Mode = "charge" | "link" | "ref";

export default function FlowAccountExtraDocs({ order, mayEdit, onApply }: { order: Order; mayEdit: boolean; onApply: (next: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("charge");
  const [chargeId, setChargeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const extras = order.flowAccountExtras ?? [];
  // รายการเก็บเพิ่มที่ยังไม่ผูกบิล — ไว้ให้เลือกในโหมด "ผูกกับที่เก็บไปแล้ว"
  const freeCharges = (order.charges ?? []).filter((c) => !extras.some((x) => x.chargeId === c.id));
  const chargeOf = (x: FlowAccountExtraDoc) => (x.chargeId ? (order.charges ?? []).find((c) => c.id === x.chargeId) : undefined);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/flowaccount/extra", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, url: url.trim(), mode, ...(mode === "link" ? { chargeId } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string; reopen?: boolean };
      if (!res.ok || !j.order) throw new Error(j.error ?? "แนบบิลเพิ่มไม่สำเร็จ");
      onApply(j.order);
      setOpen(false);
      setUrl("");
      setMode("charge");
      setChargeId("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "แนบบิลเพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(x: FlowAccountExtraDoc) {
    if (busy) return;
    if (!window.confirm(`ถอดบิลเพิ่ม ${x.docTypeLabel} ${x.docNo} ออกจากใบนี้?${chargeOf(x) ? "\n(รายการเก็บเพิ่มที่คู่กันยังอยู่ — ถอดที่ปุ่มเก็บเพิ่มถ้าไม่เก็บแล้ว)" : ""}`)) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/flowaccount/extra", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, docNo: x.docNo }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; error?: string };
      if (!res.ok || !j.order) throw new Error(j.error ?? "ถอดไม่สำเร็จ");
      onApply(j.order);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ถอดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 text-[12px] leading-relaxed">
      {extras.map((x) => {
        const c = chargeOf(x);
        return (
          <p key={x.docNo} className="font-bold text-sky-800">
            🧾➕ บิลเพิ่ม {x.docTypeLabel} {x.docNo}
            {x.date ? ` · ${x.date}` : ""} · {formatPrice(x.grandTotal)}
            {x.vat ? <span className="font-normal text-slate-500"> (รวม VAT {formatPrice(x.vat)})</span> : null}
            {" · "}
            <a href={x.url} target="_blank" rel="noreferrer" className="underline">
              เปิดเอกสาร ↗
            </a>
            <span className="block font-normal text-slate-500">
              {c ? `เก็บเพิ่มแล้ว: ${c.label} ${formatPrice(c.amount)}` : "แนบไว้อ้างอิง (ไม่ได้เก็บเงินผ่านใบนี้)"}
              {x.lines?.length ? ` · ${x.lines.slice(0, 2).join(" · ")}` : ""}
              {` · แนบโดย ${x.by}`}
              {mayEdit && (
                <button type="button" onClick={() => void remove(x)} disabled={busy} className="ml-2 rounded border border-slate-300 px-1.5 text-[11px] text-slate-500">
                  ถอด
                </button>
              )}
            </span>
          </p>
        );
      })}
      {extras.length > 0 && (
        <p className="mt-0.5 text-rose-700">
          ⚠️ กล่องนี้ต้องมีใบกำกับภาษี {1 + extras.length} ใบ — ฝ่ายแพ็คเห็นบนใบปะหน้า/ใบงาน/ด่านแพ็คแล้ว
        </p>
      )}
      {mayEdit && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 rounded-md border border-sky-300 bg-white px-2 py-0.5 text-[11px] font-bold text-sky-700">
          ＋ แนบบิลเพิ่ม (เอกสาร FlowAccount ใบที่ {extras.length + 2})
        </button>
      )}
      {mayEdit && open && (
        <div className="mt-1.5 rounded-lg border border-sky-200 bg-white p-2.5">
          <p className="font-bold text-slate-700">🧾➕ แนบบิลเพิ่ม — วางลิงก์แชร์ของใบที่ 2 (ส่วนต่าง/ค่าใช้จ่ายเพิ่มที่ออกหลังบิลหลัก)</p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://share.flowaccount.com/qt/th/…"
            className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12px]"
          />
          <div className="mt-1.5 space-y-1">
            <label className="flex items-start gap-1.5">
              <input type="radio" name="fa-extra-mode" checked={mode === "charge"} onChange={() => setMode("charge")} className="mt-0.5" />
              <span>
                <b>เก็บเพิ่มตามยอดรวมในใบ + แจ้งลูกค้าทางไลน์</b>
                <span className="block text-slate-500">ยอดตามบิลหลักไม่ขยับ (เก็บเป็นค่าบริการเพิ่ม) · มียอดค้างใบจะกลับไป &quot;รอชำระเงิน&quot; เงินครบกลับขั้นเดิมเอง</span>
              </span>
            </label>
            {freeCharges.length > 0 && (
              <label className="flex items-start gap-1.5">
                <input type="radio" name="fa-extra-mode" checked={mode === "link"} onChange={() => setMode("link")} className="mt-0.5" />
                <span>
                  <b>ผูกกับรายการเก็บเพิ่มที่กดไปแล้ว</b> (ไม่คิดเงินซ้ำ ไม่แจ้งไลน์)
                  {mode === "link" && (
                    <select value={chargeId} onChange={(e) => setChargeId(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-[12px]">
                      <option value="">— เลือกรายการ —</option>
                      {freeCharges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} · {formatPrice(c.amount)}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            )}
            <label className="flex items-start gap-1.5">
              <input type="radio" name="fa-extra-mode" checked={mode === "ref"} onChange={() => setMode("ref")} className="mt-0.5" />
              <span>
                <b>แนบไว้อ้างอิงอย่างเดียว</b> <span className="text-slate-500">(ไม่คิดเงิน ไม่แจ้ง — แค่ให้ฝ่ายแพ็ครู้ว่าต้องใส่ใบนี้ด้วย)</span>
              </span>
            </label>
          </div>
          {err && <p className="mt-1.5 text-rose-700">⚠️ {err}</p>}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !url.trim() || (mode === "link" && !chargeId)}
              className="rounded-md bg-sky-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "กำลังอ่านเอกสาร…" : "อ่านเอกสารแล้วแนบ"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr(""); }} disabled={busy} className="rounded-md border border-slate-300 px-3 py-1 text-[12px] text-slate-600">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {err && !open && <p className="mt-1 text-rose-700">⚠️ {err}</p>}
    </div>
  );
}

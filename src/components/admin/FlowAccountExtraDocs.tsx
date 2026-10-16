"use client";

/**
 * 🧾➕ บิลเพิ่ม — เอกสาร FlowAccount ใบที่ 2, 3 … ของออเดอร์เดียวกัน (ส่วนต่างเปลี่ยนสเปค/วัสดุ · ค่าใช้จ่ายเพิ่ม)
 *
 * ทำไมต้องมี (OD-260921-1879 · 24 ก.ย. 69): ลูกค้าบิลบริษัทเปลี่ยนแก้วใส → ขาวขุ่นระหว่างผลิต ร้านออก QT010743 เป็นส่วนต่าง
 * แต่ออเดอร์ผูกเอกสารได้ใบเดียว → "จะแนบ 2 บิลยังไง ฝ่ายแพ็คต้องรู้ด้วยว่ามี 2 บิล"
 * วางลิงก์ใบที่ 2 → ระบบอ่านยอด เก็บเป็นค่าบริการเพิ่ม (นอกฐานภาษีบิลหลัก ยอดตามบิลหลักยังตรง) แจ้งไลน์ลูกค้าให้โอนตามใบนั้น
 * และทุกจอฝ่ายแพ็ค/ใบงาน/ใบปะหน้าขึ้นว่า "ใบกำกับภาษี 2 ใบ"
 *
 * 📦 แบบ "สินค้าสั่งเพิ่ม" (ค่าเริ่มต้น · OD-261005-7691 · 5 ต.ค. 69): ใบที่ 2 เป็นของที่ลูกค้าสั่งเพิ่ม ไม่ใช่ส่วนต่าง
 * เดิมมีแต่แบบเก็บเงิน → รายการไม่เข้าใบงาน กราฟฟิก/ผลิตไม่รู้ว่ามีของต้องทำเพิ่ม · ตอนนี้บรรทัดในใบเข้าเป็นรายการ (extraDoc)
 */

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import { type FlowAccountExtraDoc, type Order } from "@/lib/admin-data";

type Mode = "items" | "charge" | "link" | "ref";

export default function FlowAccountExtraDocs({ order, mayEdit, onApply }: { order: Order; mayEdit: boolean; onApply: (next: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("items");
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
      setMode("items");
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

  /** 🧾 เลข INV ของบิลเพิ่มใบนี้ (ระบบออกเอง หรือ cron จดจาก FlowAccount) */
  const invOf = (x: FlowAccountExtraDoc) => x.inv?.docNo ?? (order.faInvoices ?? []).find((v) => (v.ref ?? "").toUpperCase() === x.docNo.toUpperCase())?.docNo;

  /**
   * 🧾 ออกใบกำกับภาษี/ใบเสร็จรับเงินต่อจาก QT บิลเพิ่ม (16 ต.ค. 69 · OD-261002-9030 QT010927) — ร่างก่อน แล้วยืนยันสร้างจริง
   * อัปเกรดใบเดิม + เติมหัวกระดาษร้าน + บันทึกรับเงินโอน แบบเดียวกับ INV ของบิลหลัก · ด่านใบเสร็จปลดทันที
   */
  async function issueInv(x: FlowAccountExtraDoc) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const post = (create: boolean) =>
        fetch("/api/admin/orders/fa-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, kind: "inv-extra", docNo: x.docNo, create }) });
      const r = await post(false);
      const j = (await r.json().catch(() => null)) as {
        draft?: { lines: { name: string; quantity: number; pricePerUnit: number; total: number }[]; afterDiscount: number; vat: number; grandTotal: number; wht?: { rate: number; amount: number }; contact: { name: string; taxId?: string }; problems: string[]; paymentDate?: string };
        error?: string;
      } | null;
      const d = j?.draft;
      if (!r.ok || !d) throw new Error(j?.error ?? `อ่านร่างไม่สำเร็จ (${r.status})`);
      if (d.problems.length) throw new Error(d.problems.join(" · "));
      const net = Math.round((d.grandTotal - (d.wht?.amount ?? 0)) * 100) / 100;
      const ok = window.confirm(
        [
          `ออกใบกำกับภาษี/ใบเสร็จรับเงิน ต่อจาก ${x.docNo}?`,
          `${d.contact.name}${d.contact.taxId ? ` · ${d.contact.taxId}` : ""}`,
          "",
          ...d.lines.map((l) => `• ${l.name} × ${l.quantity} @ ${formatPrice(l.pricePerUnit)} = ${formatPrice(l.total)}`),
          `ก่อน VAT ${formatPrice(d.afterDiscount)} · VAT 7% ${formatPrice(d.vat)} · รวม ${formatPrice(d.grandTotal)}`,
          ...(d.wht ? [`หัก ณ ที่จ่าย ${d.wht.rate}% ${formatPrice(d.wht.amount)}`] : []),
          `วันที่เอกสาร ${d.paymentDate} (วันโอนเงิน) · บันทึกรับเงินโอน ${formatPrice(net)} เข้าบัญชีร้าน`,
          "",
          "สร้างในบัญชี FlowAccount จริง — แก้/ยกเลิกทีหลังต้องทำใน FlowAccount",
        ].join("\n")
      );
      if (!ok) return;
      const c = await post(true);
      const cj = (await c.json().catch(() => null)) as { order?: Order; error?: string; warning?: string } | null;
      if (!c.ok || !cj?.order) throw new Error(cj?.error ?? `สร้างไม่สำเร็จ (${c.status})`);
      onApply(cj.order);
      if (cj.warning) setErr(cj.warning);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ออกใบกำกับไม่สำเร็จ");
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
              {(x.items ?? 0) > 0
                ? `📦 เพิ่ม ${x.items} รายการเข้าใบงานแล้ว (ยอดรวมในรายการ + VAT ของใบนี้)`
                : c
                  ? `เก็บเพิ่มแล้ว: ${c.label} ${formatPrice(c.amount)}`
                  : "แนบไว้อ้างอิง (ไม่ได้เก็บเงินผ่านใบนี้)"}
              {x.lines?.length ? ` · ${x.lines.slice(0, 2).join(" · ")}` : ""}
              {` · แนบโดย ${x.by}`}
              {mayEdit && (
                <button type="button" onClick={() => void remove(x)} disabled={busy} className="ml-2 rounded border border-slate-300 px-1.5 text-[11px] text-slate-500">
                  ถอด
                </button>
              )}
            </span>
            {invOf(x) ? (
              <span className="block font-semibold text-emerald-700">
                ✅ ออกใบกำกับภาษี/ใบเสร็จแล้ว {invOf(x)}
                {x.inv?.url && (
                  <>
                    {" · "}
                    <a href={x.inv.url} target="_blank" rel="noreferrer" className="underline">
                      เปิดเอกสาร ↗
                    </a>
                  </>
                )}
                {x.inv && !x.inv.paid && <span className="ml-1 text-rose-700">· ⚠️ ยังไม่ได้บันทึกรับเงินใน FlowAccount</span>}
              </span>
            ) : (
              mayEdit &&
              x.docType === "qt" &&
              (x.items ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => void issueInv(x)}
                  disabled={busy}
                  className="mt-1 block min-h-[36px] rounded-full bg-white px-3 py-1 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {busy ? "⏳ กำลังทำ…" : `🧾 ออกใบกำกับภาษี/ใบเสร็จ ต่อจาก ${x.docNo}`}
                </button>
              )
            )}
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
          <p className="font-bold text-slate-700">🧾➕ แนบบิลเพิ่ม — วางลิงก์แชร์ของใบที่ 2 (สินค้าสั่งเพิ่ม · ส่วนต่าง/ค่าใช้จ่ายเพิ่มที่ออกหลังบิลหลัก)</p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://share.flowaccount.com/qt/th/…"
            className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12px]"
          />
          <div className="mt-1.5 space-y-1">
            <label className="flex items-start gap-1.5">
              <input type="radio" name="fa-extra-mode" checked={mode === "items"} onChange={() => setMode("items")} className="mt-0.5" />
              <span>
                <b>📦 สินค้าสั่งเพิ่ม — ใส่รายการในใบเข้าใบงาน + แจ้งลูกค้าทางไลน์</b>
                <span className="block text-slate-500">รายการขึ้นในใบงาน/บอร์ดกราฟฟิก/ฝ่ายผลิต ราคา + VAT ตามใบ · มียอดค้างใบจะกลับไป &quot;รอชำระเงิน&quot;</span>
              </span>
            </label>
            <label className="flex items-start gap-1.5">
              <input type="radio" name="fa-extra-mode" checked={mode === "charge"} onChange={() => setMode("charge")} className="mt-0.5" />
              <span>
                <b>ส่วนต่าง/ค่าใช้จ่ายเพิ่ม — เก็บตามยอดรวมในใบ + แจ้งลูกค้าทางไลน์</b>
                <span className="block text-slate-500">ไม่มีของต้องผลิตเพิ่ม (เช่น เปลี่ยนวัสดุ) · ยอดตามบิลหลักไม่ขยับ (เก็บเป็นค่าบริการเพิ่ม) · มียอดค้างใบจะกลับไป &quot;รอชำระเงิน&quot; เงินครบกลับขั้นเดิมเอง</span>
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

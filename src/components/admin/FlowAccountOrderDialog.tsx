"use client";

/**
 * 📄 กล่อง "สร้างออเดอร์จากลิงก์ FlowAccount"
 *
 * ทำไมต้องมี: ลูกค้าที่ขอใบกำกับภาษี ร้านออกใบเสนอราคา/ใบแจ้งหนี้ใน FlowAccount แล้ว
 * แต่ต้องมาคีย์ออเดอร์ซ้ำที่นี่อีกรอบ (ที่อยู่ + รายการ) เพื่อให้กราฟฟิกทำแบบ/ผลิต/ส่ง
 * → วางลิงก์แชร์ ระบบอ่านเอกสารให้ (ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ รายการ ยอด VAT หัก ณ ที่จ่าย)
 *   แอดมินตรวจ/แก้ในกล่องนี้ แล้วกดสร้างทีเดียวจบ
 *
 * ยังไม่กดสร้าง = ยังไม่มีอะไรเกิดในฐาน (ดึงข้อมูลมาดูเฉย ๆ ได้)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerContactInput } from "./CustomerContactInput";
import { formatPhone } from "@/lib/contacts";
import { formatPrice } from "@/lib/products";

/** ผลอ่านเอกสาร (สำเนาชนิดจาก src/lib/server/flowaccount.ts — ไฟล์นั้นเป็นของฝั่งเซิร์ฟเวอร์ ไม่ import ข้ามมา) */
export interface FADoc {
  url: string;
  docType: string;
  docTypeLabel: string;
  docNo: string;
  date?: string;
  customer: { name: string; branch?: string; address: string; taxId?: string; phone?: string; shippingAddress?: string };
  source?: "json" | "pdf";
  items: { name: string; detail: string; qty: number; unitPrice: number; amount: number }[];
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vat?: number;
  grandTotal?: number;
  whtRate?: number;
  wht?: number;
  net?: number;
  note?: string;
  rawText: string;
}

interface Preview {
  doc: FADoc;
  contact: { id: string; name: string; phone?: string; address?: string } | null;
  shipping: { id: string; name: string; price: number }[];
  existing: { id: string; status: string }[];
  canMarkPaid: boolean;
}

interface DraftItem {
  name: string;
  selections: string;
  qty: number;
  unitPrice: number;
  noProof: boolean;
}

const INP =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none";
const MINI = "mb-1 text-[10.5px] font-bold text-slate-400";
const SHIP_RE = /ค่าจัดส่ง|ค่าส่ง|ค่าขนส่ง|shipping|delivery/i;

export default function FlowAccountOrderDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pv, setPv] = useState<Preview | null>(null);

  // ฟอร์มที่แอดมินแก้ได้ก่อนสร้าง
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [shipLabel, setShipLabel] = useState("");
  const [shipCost, setShipCost] = useState(0);
  const [shipFromDoc, setShipFromDoc] = useState<string | null>(null);
  const [useWht, setUseWht] = useState(false);
  // ส่วนลด/VAT แก้ได้ — ลิงก์แชร์ของ FlowAccount บางทีส่งฉบับเก่ามา แอดมินพิมพ์ตามใบล่าสุดในแอปได้เลย
  const [discount, setDiscount] = useState(0);
  const [vat, setVat] = useState(0);
  const [vatRate, setVatRate] = useState(7);
  const [status, setStatus] = useState<"รอชำระเงิน" | "ชำระแล้ว">("รอชำระเงิน");
  const [note, setNote] = useState("");
  const [useByDate, setUseByDate] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function load(u: string) {
    const link = u.trim();
    if (!link || loading) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/flowaccount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<Preview> & { error?: string };
      if (!res.ok || !j.doc) throw new Error(j.error ?? "อ่านเอกสารไม่สำเร็จ");
      const p = j as Preview;
      setPv(p);
      const d = p.doc;
      setCustomer(d.customer.name);
      setPhone(p.contact?.phone ?? d.customer.phone ?? "");
      setAddress(d.customer.shippingAddress || d.customer.address || p.contact?.address || "");
      setContactId(p.contact?.id);

      // บรรทัด "ค่าจัดส่ง" ในใบ → ย้ายไปช่องค่าส่ง ไม่ให้กลายเป็นงานผลิต
      const shipLines = d.items.filter((it) => SHIP_RE.test(it.name));
      const workLines = d.items.filter((it) => !SHIP_RE.test(it.name));
      setItems(
        workLines.map((it) => ({
          name: it.name,
          selections: it.detail,
          qty: it.qty,
          unitPrice: it.unitPrice,
          noProof: false,
        }))
      );
      const pickup = /รับเอง|มารับ|pickup|pick up/i.test(d.note ?? "");
      const pickupMethod = p.shipping.find((m) => /รับเอง|มารับ/.test(m.name));
      if (shipLines.length) {
        const cost = shipLines.reduce((s, it) => s + it.amount, 0);
        setShipFromDoc(shipLines.map((it) => it.name).join(" · "));
        setShipLabel(shipLines[0].name);
        setShipCost(cost);
      } else if (pickup && pickupMethod) {
        setShipFromDoc(null);
        setShipLabel(pickupMethod.name);
        setShipCost(0);
      } else {
        setShipFromDoc(null);
        setShipLabel("");
        setShipCost(0);
      }
      setUseWht((d.wht ?? 0) > 0);
      setDiscount(d.discount ?? 0);
      setVat(d.vat ?? 0);
      setVatRate(d.vatRate ?? 7);
      setStatus("รอชำระเงิน");
      setNote(d.note ?? "");
      setUseByDate("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const doc = pv?.doc;
  const subtotal = useMemo(() => items.reduce((s, it) => s + it.qty * it.unitPrice, 0), [items]);
  // ยอดที่ออเดอร์จะได้ = สินค้า + ค่าส่ง − ส่วนลดตามใบ + VAT ตามใบ — ต้องเท่ากับ "รวมทั้งสิ้น" ในเอกสาร
  const total = Math.round((subtotal + shipCost - discount + vat) * 100) / 100;
  const mismatch = doc?.grandTotal != null && Math.abs(doc.grandTotal - total) >= 0.01;
  /** VAT ที่ควรเป็นจากตัวเลขในฟอร์มตอนนี้ (ฐาน = สินค้า + ค่าส่ง − ส่วนลด) */
  const vatCalc = Math.round((subtotal + shipCost - discount) * vatRate) / 100;
  const ready = !!doc && items.some((it) => it.name.trim()) && (customer.trim() || phone.trim());

  async function create() {
    if (!doc || !ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/flowaccount", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc,
          customer: customer.trim(),
          phone: phone.trim(),
          address: address.trim(),
          contactId,
          shippingLabel: shipLabel || undefined,
          shippingCost: shipCost,
          items: items.filter((it) => it.name.trim()),
          wht: useWht && doc.wht ? { rate: doc.whtRate ?? 0, amount: doc.wht } : null,
          discount,
          vat,
          vatRate,
          status,
          note: note.trim() || undefined,
          useByDate: useByDate || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? "สร้างออเดอร์ไม่สำเร็จ");
      onCreated(j.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างออเดอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function patchItem(i: number, patch: Partial<DraftItem>) {
    setItems((cur) => cur.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[6vh] backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="rounded-t-2xl bg-sky-50 px-5 pb-4 pt-5 text-center ring-1 ring-inset ring-sky-100">
          <span className="text-3xl">📄</span>
          <p className="mt-1.5 text-base font-extrabold leading-snug text-slate-900">สร้างออเดอร์จากลิงก์ FlowAccount</p>
          <p className="mt-1 text-left text-xs leading-relaxed text-slate-600">
            วางลิงก์แชร์ใบเสนอราคา/ใบแจ้งหนี้จาก FlowAccount — ระบบดึงชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ รายการ และยอดมาให้
            ตรวจแล้วกดสร้างทีเดียว ไม่ต้องคีย์ซ้ำ · บิลจริงยังออกที่ FlowAccount เหมือนเดิม ใบนี้เป็นใบงานให้กราฟฟิก/ผลิต/ส่ง
          </p>
        </div>

        <div className="space-y-3 p-4">
          {/* ── ลิงก์ ── */}
          <div className="flex gap-2">
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/share\.flowaccount\.com/.test(t)) {
                  e.preventDefault();
                  setUrl(t.trim());
                  void load(t);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && void load(url)}
              placeholder="https://share.flowaccount.com/qt/th/…"
              className={INP}
              inputMode="url"
            />
            <button
              type="button"
              onClick={() => void load(url)}
              disabled={loading || !url.trim()}
              className="shrink-0 rounded-lg bg-sky-600 px-3.5 text-[13px] font-bold text-white transition hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {loading ? "กำลังอ่าน…" : pv ? "อ่านใหม่" : "ดึงข้อมูล"}
            </button>
          </div>

          {doc && (
            <>
              {/* ── หัวเอกสาร ── */}
              <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
                ⚠️ ลิงก์แชร์ของ FlowAccount อาจส่งเอกสารฉบับก่อนแก้มาให้ — เทียบยอดกับใบในแอปก่อนกดสร้าง ถ้าไม่ตรง แก้ค่าส่ง/ส่วนลด/VAT ในกล่องนี้ให้ตรงใบล่าสุดได้เลย (หรือกด “แชร์” ใหม่ในแอปแล้ว “อ่านใหม่”)
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                <span className="font-extrabold text-slate-800">
                  {doc.docTypeLabel} {doc.docNo}
                </span>
                {doc.date && <span>วันที่ {doc.date}</span>}
                {doc.grandTotal != null && (
                  <span>
                    ยอดตามใบ <b className="text-slate-800">{formatPrice(doc.grandTotal)}</b>
                    {doc.vat ? ` (รวม VAT ${formatPrice(doc.vat)})` : ""}
                  </span>
                )}
                <a href={doc.url} target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">
                  เปิดเอกสาร ↗
                </a>
              </div>

              {pv!.existing.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  ⚠️ เอกสารเลขนี้เคยสร้างออเดอร์แล้ว:{" "}
                  {pv!.existing.map((o, i) => (
                    <span key={o.id}>
                      {i > 0 && ", "}
                      <a href={`/admin/orders/${o.id}`} target="_blank" rel="noreferrer" className="underline">
                        {o.id}
                      </a>{" "}
                      ({o.status})
                    </span>
                  ))}{" "}
                  — สร้างอีกใบได้ถ้าตั้งใจ (เช่น แบ่งส่งหลายรอบ)
                </p>
              )}

              {/* ── ข้อมูลออกใบกำกับ ── */}
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                <p className={MINI}>ข้อมูลออกใบกำกับภาษี (ตามเอกสาร — เก็บติดออเดอร์)</p>
                <p>
                  <b className="text-slate-800">{doc.customer.name || "—"}</b>
                  {doc.customer.branch && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{doc.customer.branch}</span>}
                </p>
                {doc.customer.taxId && <p>เลขประจำตัวผู้เสียภาษี {doc.customer.taxId}</p>}
                <p>{doc.customer.address || "— ไม่พบที่อยู่ในเอกสาร —"}</p>
              </div>

              {/* ── ลูกค้า / ที่อยู่จัดส่ง ── */}
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <div className="min-w-0">
                  <p className={MINI}>ชื่อลูกค้าในออเดอร์</p>
                  <CustomerContactInput
                    value={customer}
                    onChange={(v) => {
                      setCustomer(v);
                      setContactId(undefined);
                    }}
                    onBlur={() => {}}
                    onPick={(c) => {
                      setCustomer(c.name || customer);
                      if (c.phone) setPhone(c.phone);
                      if (c.address && !address.trim()) setAddress(c.address);
                      setContactId(c.id);
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <p className={MINI}>เบอร์โทร</p>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" className={INP} />
                </div>
              </div>
              <p className="-mt-1 text-[10.5px] font-semibold text-slate-400">
                {contactId ? (
                  <span style={{ color: "var(--dk-mint-ink)" }}>
                    ✓ ผูกกับผู้ติดต่อในคลังแล้ว{pv!.contact?.id === contactId ? ` (ระบบจับคู่ให้: ${pv!.contact?.name})` : ""} — แต้มเข้าคนนี้
                  </span>
                ) : phone.trim() ? (
                  formatPhone(phone.trim())
                ) : (
                  "ไม่มีเบอร์ในเอกสาร — พิมพ์ชื่อเพื่อค้นคลังผู้ติดต่อ หรือกรอกเบอร์เอง"
                )}
              </p>
              <div>
                <p className={MINI}>ที่อยู่จัดส่ง (เริ่มจากที่อยู่ในเอกสาร — แก้ได้ถ้าส่งที่อื่น)</p>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={`${INP} resize-y`} />
              </div>

              {/* ── รายการ ── */}
              <div>
                <p className={MINI}>รายการงาน · {items.length} รายการ · ราคาตามใบ (ก่อน VAT)</p>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] gap-2">
                        <input
                          value={it.name}
                          onChange={(e) => patchItem(i, { name: e.target.value })}
                          className={`${INP} font-bold`}
                          placeholder="ชื่อรายการ"
                        />
                        <input
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) => patchItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className={`${INP} text-right`}
                          title="จำนวน"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) => patchItem(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                          className={`${INP} text-right`}
                          title="ราคาต่อหน่วย"
                        />
                      </div>
                      <textarea
                        value={it.selections}
                        onChange={(e) => patchItem(i, { selections: e.target.value })}
                        rows={Math.min(6, Math.max(1, it.selections.split("\n").length))}
                        placeholder="รายละเอียด/สเปค (บรรทัดละหัวข้อ)"
                        className={`${INP} mt-1.5 resize-y text-[12px]`}
                      />
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                          <input type="checkbox" checked={it.noProof} onChange={(e) => patchItem(i, { noProof: e.target.checked })} />
                          ไม่ต้องทำแบบ (ไม่เข้าคิวกราฟฟิก)
                        </label>
                        <span>
                          = {formatPrice(it.qty * it.unitPrice)}
                          <button
                            type="button"
                            onClick={() => setItems((cur) => cur.filter((_, k) => k !== i))}
                            className="ml-3 font-bold text-rose-500 hover:underline"
                          >
                            ลบ
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                  {!items.length && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">ไม่พบรายการในเอกสาร — เพิ่มเองในหน้าออเดอร์ได้หลังสร้าง</p>}
                </div>
              </div>

              {/* ── ค่าส่ง · หัก ณ ที่จ่าย · วันใช้งาน ── */}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem]">
                <div className="min-w-0">
                  <p className={MINI}>วิธีส่ง{shipFromDoc ? ` — ในใบมีบรรทัด “${shipFromDoc}” ย้ายมาเป็นค่าส่งให้แล้ว` : ""}</p>
                  <select
                    value={pv!.shipping.some((m) => m.name === shipLabel) ? shipLabel : shipLabel ? "__doc" : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__doc") return;
                      const m = pv!.shipping.find((x) => x.name === v);
                      setShipLabel(m?.name ?? "");
                      setShipCost(m?.price ?? 0);
                    }}
                    className={INP}
                  >
                    <option value="">— ไม่คิดค่าส่งในใบนี้ —</option>
                    {shipLabel && !pv!.shipping.some((m) => m.name === shipLabel) && <option value="__doc">{shipLabel} (ตามเอกสาร)</option>}
                    {pv!.shipping.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} · {formatPrice(m.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <p className={MINI}>ค่าส่ง (บาท)</p>
                  <input
                    type="number"
                    min={0}
                    value={shipCost}
                    onChange={(e) => setShipCost(Math.max(0, Number(e.target.value) || 0))}
                    className={`${INP} text-right`}
                  />
                </div>
                <div className="min-w-0">
                  <p className={MINI}>วันที่ลูกค้าใช้งาน (ถ้ามี)</p>
                  <input type="date" value={useByDate} onChange={(e) => setUseByDate(e.target.value)} className={INP} />
                </div>
              </div>

              {/* ── สรุปยอด: ต้องเท่าบิล FlowAccount ทุกบาท ── */}
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-600">
                <div className="flex justify-between">
                  <span>รวมค่าสินค้า</span>
                  <span className="tabular-nums">{formatPrice(subtotal)}</span>
                </div>
                {shipCost > 0 && (
                  <div className="flex justify-between">
                    <span>ค่าจัดส่ง</span>
                    <span className="tabular-nums">{formatPrice(shipCost)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-emerald-700">
                  <span>ส่วนลดตามใบ</span>
                  <span className="flex items-center gap-1">
                    −
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      className={`${INP} w-24 py-0.5 text-right`}
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    ภาษีมูลค่าเพิ่ม {vatRate}%
                    {Math.abs(vatCalc - vat) >= 0.01 && (
                      <button
                        type="button"
                        onClick={() => setVat(vatCalc)}
                        className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-bold text-sky-700 hover:bg-sky-100"
                        title="คิด VAT ใหม่จากตัวเลขในฟอร์ม (สินค้า + ค่าส่ง − ส่วนลด)"
                      >
                        ↻ คิดใหม่ = {formatPrice(vatCalc)}
                      </button>
                    )}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={vat}
                    onChange={(e) => setVat(Math.max(0, Number(e.target.value) || 0))}
                    className={`${INP} w-24 py-0.5 text-right`}
                  />
                </div>
                <div className="mt-1 flex justify-between border-t border-dashed border-slate-200 pt-1 text-[13px] font-extrabold text-slate-900">
                  <span>ยอดรวมทั้งสิ้น (ออเดอร์นี้)</span>
                  <span className="tabular-nums">{formatPrice(total)}</span>
                </div>
                {useWht && (doc.wht ?? 0) > 0 && (
                  <>
                    <div className="mt-1 flex justify-between text-rose-600">
                      <span>หักภาษี ณ ที่จ่าย {doc.whtRate ?? ""}%</span>
                      <span className="tabular-nums">−{formatPrice(doc.wht!)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-extrabold text-slate-900">
                      <span>ยอดชำระ (โอนจริง)</span>
                      <span className="tabular-nums">{formatPrice(Math.round((total - doc.wht!) * 100) / 100)}</span>
                    </div>
                  </>
                )}
                {doc.grandTotal != null && (
                  <p className={`mt-1 text-[11px] font-semibold ${mismatch ? "text-rose-600" : "text-emerald-700"}`}>
                    {mismatch
                      ? `⚠️ ต่างจากฉบับที่ลิงก์ส่งมา (${formatPrice(doc.grandTotal)}) — ถ้าคุณแก้ตามใบล่าสุดในแอป FlowAccount ก็สร้างได้เลย · ถ้าไม่ได้ตั้งใจ ตรวจรายการ/ค่าส่ง/ส่วนลด/VAT อีกครั้ง`
                      : `✓ ตรงกับยอดรวมทั้งสิ้นในเอกสาร ${formatPrice(doc.grandTotal)}`}
                  </p>
                )}
              </div>

              {doc.wht != null && doc.wht > 0 && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                  <input type="checkbox" checked={useWht} onChange={(e) => setUseWht(e.target.checked)} />
                  ลูกค้าหัก ณ ที่จ่าย {doc.whtRate ?? ""}% = {formatPrice(doc.wht)} — บันทึกไว้ในออเดอร์ (ยอดโอนจริง {formatPrice(doc.net ?? 0)})
                </label>
              )}

              <div>
                <p className={MINI}>หมายเหตุ (จากเอกสาร — ติดไปทุกจอ)</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} className={`${INP} resize-y`} />
              </div>

              {/* ── สถานะเริ่มต้น ── */}
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                    status === "รอชำระเงิน" ? "border-amber-300 bg-amber-50" : "border-slate-200"
                  }`}
                >
                  <input type="radio" name="fa-status" checked={status === "รอชำระเงิน"} onChange={() => setStatus("รอชำระเงิน")} className="mt-0.5" />
                  <span>
                    <b>รอชำระเงิน</b>
                    <br />
                    <span className="text-slate-500">รอเงินเข้าตาม FlowAccount แล้วค่อยกด “ชำระแล้ว” ในหน้าออเดอร์</span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                    !pv!.canMarkPaid ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  } ${status === "ชำระแล้ว" ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}
                  title={pv!.canMarkPaid ? "" : "บัญชีนี้ไม่มีสิทธิ์ยืนยันเงินเข้า"}
                >
                  <input
                    type="radio"
                    name="fa-status"
                    disabled={!pv!.canMarkPaid}
                    checked={status === "ชำระแล้ว"}
                    onChange={() => setStatus("ชำระแล้ว")}
                    className="mt-0.5"
                  />
                  <span>
                    <b>ชำระแล้ว — เริ่มงานเลย</b>
                    <br />
                    <span className="text-slate-500">เงินเข้าแล้ว/เครดิตเทอม · ส่งเข้าคิวกราฟฟิกทันที (ลง log ว่ารับชำระตาม FlowAccount)</span>
                  </span>
                </label>
              </div>
            </>
          )}

          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={!ready || busy}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy ? "กำลังสร้าง…" : status === "ชำระแล้ว" ? "สร้างออเดอร์ + ส่งกราฟฟิก" : "สร้างออเดอร์"}
            </button>
          </div>
          {!doc && <p className="text-center text-[11px] text-slate-400">วางลิงก์แล้วระบบจะอ่านให้ทันที — ยังไม่สร้างอะไรจนกว่าจะกดสร้าง</p>}
        </div>
      </div>
    </div>
  );
}

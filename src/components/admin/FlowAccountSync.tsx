"use client";

/**
 * 🔄 เทียบออเดอร์กับเอกสาร FlowAccount ฉบับล่าสุด แล้วดึงยอดมาให้ตรง
 *
 * ทำไมต้องมี: ออเดอร์สร้างจากลิงก์ตอน 20:30 แต่แอดมินไปแก้ใบเสนอราคาใน FlowAccount ทีหลัง
 * (เพิ่มบรรทัดค่าส่ง เปลี่ยนส่วนลด) → ยอดในระบบไม่ตรงบิล กดปุ่มนี้ให้ระบบอ่านเอกสารอีกรอบ
 * โชว์ว่าต่างตรงไหน แล้วกด "ใช้ยอดตามเอกสาร" ทีเดียว ไม่ต้องไล่แก้เอง
 *
 * ⚠️ ลิงก์แชร์ของ FlowAccount อาจยังส่งฉบับเก่ามาสักพักหลังแก้ — ถ้ายอดยังไม่ตรง ให้กด "แชร์" ใหม่ในแอป FlowAccount แล้วลองอีกครั้ง
 */

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import { orderTotal, withLog, type Order } from "@/lib/admin-data";
import type { FADoc } from "./FlowAccountOrderDialog";
import type { ShippingMethod } from "@/lib/shop-settings";
import { normalizeShipLabel } from "@/lib/ship-label";

const SHIP_RE = /ค่าจัดส่ง|ค่าส่ง|ค่าขนส่ง|shipping|delivery/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

interface Diff {
  doc: FADoc;
  docShip: number;
  docShipLabel?: string;
  rows: { label: string; doc: string; now: string; same: boolean }[];
  /** รายการในระบบที่จับคู่กับเอกสารได้ (index → ค่าใหม่) */
  itemPatch: Record<number, { qty: number; unitPrice: number }>;
  unmatched: string[];
  sameTotal: boolean;
}

export default function FlowAccountSync({ order, actor, onApply }: { order: Order; actor: string; onApply: (next: Order) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const fa = order.flowAccount;
  if (!fa) return null;

  async function compare() {
    if (busy) return;
    setBusy(true);
    setErr("");
    setDiff(null);
    try {
      const res = await fetch("/api/admin/orders/flowaccount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: fa!.url }),
      });
      const j = (await res.json().catch(() => ({}))) as { doc?: FADoc; shipping?: ShippingMethod[]; error?: string };
      if (!res.ok || !j.doc) throw new Error(j.error ?? "อ่านเอกสารไม่สำเร็จ");
      setDiff(buildDiff(order, j.doc, j.shipping ?? []));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!diff) return;
    const d = diff.doc;
    const f = fullFigures(d);
    const items = order.items.map((it, i) => (diff.itemPatch[i] ? { ...it, qty: diff.itemPatch[i].qty, unitPrice: diff.itemPatch[i].unitPrice } : it));
    let next: Order = {
      ...order,
      items,
      // ค่าส่งเอาตามบรรทัด "ค่าส่ง" ในเอกสาร (ถ้ามี) — ไม่มีก็คงของเดิม
      ...(diff.docShipLabel ? { shippingCost: diff.docShip, shippingLabel: diff.docShipLabel } : {}),
      flowAccount: {
        ...fa!,
        ...(d.date ? { date: d.date } : {}),
        subtotal: f.subtotal,
        vat: f.vat,
        grandTotal: f.grandTotal,
        wht: f.wht,
        net: f.grandTotal != null ? Math.round((f.grandTotal - (f.wht ?? 0)) * 100) / 100 : d.net,
        fetchedAt: new Date().toISOString(),
      },
    };
    // ส่วนลด/VAT ตามเอกสาร — ไม่มีในเอกสาร = เอาออก
    if (d.discount && d.discount > 0) next.adminDiscount = { label: `ส่วนลดตามใบ ${d.docNo}`, amount: d.discount };
    else if (next.adminDiscount?.label?.startsWith("ส่วนลดตามใบ")) delete next.adminDiscount;
    if (f.vat && f.vat > 0) next.vat = { rate: d.vatRate ?? 7, amount: f.vat };
    else delete next.vat;
    if (f.wht && f.wht > 0) next.wht = { rate: d.whtRate ?? 0, amount: f.wht };
    next = withLog(next, actor, "ซิงก์ยอดจาก FlowAccount", `${d.docTypeLabel} ${d.docNo} · ยอดรวม ${orderTotal(next).toLocaleString("th-TH")} บาท${d.grandTotal != null ? ` (เอกสาร ${d.grandTotal.toLocaleString("th-TH")})` : ""}`);
    onApply(next);
    setDiff(null);
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => void compare()}
        disabled={busy}
        className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
      >
        {busy ? "กำลังอ่านเอกสาร…" : "🔄 เทียบกับเอกสารล่าสุด"}
      </button>
      {err && <p className="mt-1 text-[11px] font-semibold text-rose-600">{err}</p>}
      {diff && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2 text-[11.5px]">
          <table className="w-full">
            <thead>
              <tr className="text-[10.5px] text-slate-400">
                <th className="text-left font-bold">รายการ</th>
                <th className="text-right font-bold">เอกสารล่าสุด</th>
                <th className="text-right font-bold">ในระบบ</th>
              </tr>
            </thead>
            <tbody>
              {diff.rows.map((r) => (
                <tr key={r.label} className={r.same ? "text-slate-500" : "font-bold text-rose-600"}>
                  <td className="py-0.5">{r.label}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.doc}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.now}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diff.unmatched.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              ⚠️ รายการในเอกสารที่จับคู่กับรายการในระบบไม่ได้ (ต้องแก้เอง): {diff.unmatched.join(" · ")}
            </p>
          )}
          {diff.sameTotal ? (
            <p className="mt-1 text-[11px] font-semibold text-emerald-700">
              ✓ ยอดในระบบตรงกับเอกสารที่ลิงก์แชร์ส่งมาแล้ว — ถ้าในแอป FlowAccount เห็นยอดอื่น แปลว่าลิงก์แชร์ยังเป็นฉบับเก่า ให้กด “แชร์” ใหม่ในแอป แล้วลองอีกครั้ง
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                ✓ ใช้ยอดตามเอกสารล่าสุด
              </button>
              <button type="button" onClick={() => setDiff(null)} className="text-[11px] font-semibold text-slate-500 hover:underline">
                ปิด
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ➗ ใบมัดจำของ FlowAccount (ใบแจ้งหนี้มัดจำ/ใบยอดคงเหลือ) บอกยอดแค่ครึ่ง — ออเดอร์ในระบบเป็นยอดเต็ม
 * จึงเทียบ/ซิงก์กับ "มูลค่างานเต็ม" ที่ตัวอ่านคำนวณไว้ ไม่ใช่รวมทั้งสิ้นของใบนั้น
 */
function fullFigures(doc: FADoc): { subtotal?: number; vat?: number; grandTotal?: number; wht?: number } {
  const dep = doc.deposit;
  if (!dep) return { subtotal: doc.subtotal, vat: doc.vat, grandTotal: doc.grandTotal, wht: doc.wht };
  return {
    subtotal: dep.fullSubtotal ?? doc.subtotal,
    vat: dep.fullVat ?? doc.vat,
    grandTotal: dep.fullGrandTotal ?? doc.grandTotal,
    wht: dep.fullWht ?? doc.wht,
  };
}

function buildDiff(order: Order, doc: FADoc, methods: ShippingMethod[] = []): Diff {
  const f = fullFigures(doc);
  const shipLines = doc.items.filter((it) => SHIP_RE.test(it.name));
  const work = doc.items.filter((it) => !SHIP_RE.test(it.name));
  const docShip = shipLines.reduce((s, it) => s + it.amount, 0);
  // "ค่าส่ง" ในเอกสาร → ชื่อวิธีส่งของร้านที่ราคาตรง (ไม่งั้นซิงก์แล้วป้ายกลับเป็น "ค่าส่ง" อีก)
  const docShipLabel = shipLines[0] ? normalizeShipLabel(shipLines[0].name, docShip, methods) || shipLines[0].name : undefined;

  // จับคู่รายการตามชื่อ (ไม่สนช่องว่าง/ตัวพิมพ์) — ชื่อซ้ำหลายบรรทัดจับตามลำดับ
  const used = new Set<number>();
  const itemPatch: Record<number, { qty: number; unitPrice: number }> = {};
  const unmatched: string[] = [];
  for (const w of work) {
    const idx = order.items.findIndex((it, i) => !used.has(i) && norm(it.name) === norm(w.name));
    if (idx < 0) {
      unmatched.push(`${w.name} ×${w.qty}`);
      continue;
    }
    used.add(idx);
    itemPatch[idx] = { qty: w.qty, unitPrice: w.unitPrice };
  }

  const nowSub = order.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const docSub = work.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const nowShip = order.shippingCost ?? 0;
  const nowDisc = order.adminDiscount?.amount ?? 0;
  const docDisc = doc.discount ?? 0;
  const nowVat = order.vat?.amount ?? 0;
  const docVat = f.vat ?? 0;
  const nowTotal = orderTotal(order);
  const docTotal = f.grandTotal ?? 0;
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const rows: Diff["rows"] = [
    { label: "รวมค่าสินค้า", doc: formatPrice(docSub), now: formatPrice(nowSub), same: eq(docSub, nowSub) },
    { label: "ค่าส่ง", doc: docShipLabel ? formatPrice(docShip) : "— ไม่มีในใบ", now: formatPrice(nowShip), same: docShipLabel ? eq(docShip, nowShip) : true },
    { label: "ส่วนลด", doc: `−${formatPrice(docDisc)}`, now: `−${formatPrice(nowDisc)}`, same: eq(docDisc, nowDisc) },
    { label: `VAT ${doc.vatRate ?? 7}%`, doc: formatPrice(docVat), now: formatPrice(nowVat), same: eq(docVat, nowVat) },
    { label: doc.deposit ? "มูลค่างานเต็ม (ใบมัดจำ)" : "รวมทั้งสิ้น", doc: formatPrice(docTotal), now: formatPrice(nowTotal), same: eq(docTotal, nowTotal) },
  ];
  return { doc, docShip, docShipLabel, rows, itemPatch, unmatched, sameTotal: eq(docTotal, nowTotal) };
}

"use client";

/**
 * 🧾 ใบกำกับภาษี/ใบเสร็จรับเงินที่ออกใน FlowAccount แล้ว — ขึ้นเองในกล่อง FlowAccount หน้าออเดอร์ (เจ้าของร้านขอ 6 ต.ค. 69)
 * ใบงานเก็บแค่ใบเสนอราคา/ใบแจ้งหนี้ (QT/BL) · พนักงานออก INV ใน FlowAccount แล้ว → cron wht-sync ดึงมาภายใน ~5 นาที
 * กดเลข INV = เปิดเอกสารจริง (/api/admin/wht/doc → ลิงก์แชร์ FlowAccount) · ใบหักต่อที่ /admin/wht
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlowDocLinks } from "@/components/admin/FlowDocLinks";
import type { OrderInvoiceRow } from "@/app/api/admin/wht/by-order/route";

const dmy = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrderTaxInvoices({ orderId, className, hideIds }: { orderId: string; className?: string; hideIds?: string[] }) {
  const [rows, setRows] = useState<OrderInvoiceRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/wht/by-order?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { invoices?: OrderInvoiceRow[] } | null) => alive && setRows(j?.invoices ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (rows === null) return null;
  // ใบที่ระบบออกเอง (order.faChain) แสดงแยกอยู่แล้ว — ไม่ซ้ำ
  const shown = rows.filter((r) => !hideIds?.includes(r.id));
  if (!shown.length && hideIds?.length) return null;
  if (!shown.length)
    return <p className={`text-[12px] text-slate-500 ${className ?? ""}`}>🧾 ยังไม่ออกใบกำกับภาษี/ใบเสร็จรับเงินใน FlowAccount (ระบบเช็คให้ทุก 5 นาที)</p>;
  return (
    <div className={className}>
      {shown.map((r) => (
        <p key={r.id} className="font-bold text-emerald-800">
          🧾 ใบกำกับภาษี/ใบเสร็จรับเงิน {r.id} · {dmy(r.date)} · {baht(r.total)}
          {r.faStatus ? ` · ${r.faStatus}` : ""}
          {" · "}
          <FlowDocLinks
            url={`/api/admin/wht/doc?id=${encodeURIComponent(r.id)}`}
            label={`ใบกำกับภาษี/ใบเสร็จรับเงิน ${r.id}`}
            editUrl={`/api/admin/fa-edit?no=${encodeURIComponent(r.id)}`}
          />
          {r.guessed && <span className="ml-1 font-normal text-amber-700">(จับคู่จากเลขผู้เสียภาษี+ยอด — เช็คเลขอีกที)</span>}
          {r.wht && (
            <Link
              href={`/admin/wht?month=${r.date.slice(0, 7)}&q=${encodeURIComponent(r.id)}`}
              className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${r.wht.done ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}
              title="ไปหน้าใบหัก ณ ที่จ่าย"
            >
              {r.wht.label} · {baht(r.wht.amount)}
            </Link>
          )}
        </p>
      ))}
    </div>
  );
}

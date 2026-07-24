"use client";

import Link from "next/link";
import { formatPrice, PRODUCTS } from "@/lib/products";
import { MOCK_ORDERS, orderTotal, STATUS_STYLES } from "@/lib/admin-data";
import { badge, card, cardPad, faint, h1, h2, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";

export default function AdminDashboard() {
  const seesMoney = useCan()("orders.money"); // ฝ่ายแพ็คไม่เห็นตัวเลขยอดขาย
  const todaySales = MOCK_ORDERS.filter(
    (o) => o.date.startsWith("20 ก.ค.") && o.status !== "ยกเลิก"
  ).reduce((s, o) => s + orderTotal(o), 0);
  const waiting = MOCK_ORDERS.filter(
    (o) => o.status === "รอชำระเงิน" || o.status === "ชำระแล้ว"
  ).length;
  const producing = MOCK_ORDERS.filter((o) => o.status === "กำลังผลิต").length;

  const stats = [
    ...(seesMoney ? [{ emoji: "💰", tint: "bg-emerald-50 text-emerald-600", label: "ยอดขายวันนี้", value: formatPrice(todaySales), sub: "จากออเดอร์ที่ไม่ถูกยกเลิก" }] : []),
    { emoji: "🧾", tint: "bg-sky-50 text-sky-600", label: "ออเดอร์ใหม่", value: `${waiting}`, sub: "รอชำระ / รอเริ่มผลิต" },
    { emoji: "🖨️", tint: "bg-violet-50 text-violet-600", label: "กำลังผลิต", value: `${producing}`, sub: "อยู่ในคิวพิมพ์" },
    { emoji: "🏷️", tint: "bg-amber-50 text-amber-600", label: "สินค้าในร้าน", value: `${PRODUCTS.length}`, sub: "5 หมวดหมู่" },
  ];

  const bestSellers = [...PRODUCTS].sort((a, b) => b.sold - a.sold).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>ภาพรวมร้าน</h1>
      <p className={`mt-1 ${muted}`}>สรุปความเคลื่อนไหวของร้านวันนี้</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={cardPad}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${s.tint}`}>{s.emoji}</span>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{s.value}</p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-600">{s.label}</p>
            <p className={`mt-0.5 text-[11px] ${faint}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ออเดอร์ล่าสุด */}
        <section className={cardPad}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={h2}>ออเดอร์ล่าสุด</h2>
            <Link href="/admin/orders" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              ดูทั้งหมด →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {MOCK_ORDERS.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{o.id}</p>
                  <p className={`truncate text-xs ${faint}`}>
                    {o.customer} · {o.date}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {seesMoney && <span className="text-sm font-semibold text-slate-900">{formatPrice(orderTotal(o))}</span>}
                  <span className={`${badge} ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* สินค้าขายดี */}
        <section className={`h-fit ${cardPad}`}>
          <h2 className={`mb-3 ${h2}`}>ขายดี 5 อันดับ</h2>
          <ol className="space-y-2.5">
            {bestSellers.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-4 text-center text-sm font-bold text-slate-300">{i + 1}</span>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${p.gradient} text-lg`}>
                  {p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{p.name}</p>
                  <p className={`text-[11px] ${faint}`}>ขายแล้ว {p.sold.toLocaleString("th-TH")} ชิ้น</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className={`mt-6 text-center text-xs ${faint}`}>
        ยอดสรุปคำนวณจากออเดอร์จำลอง — เมื่อต่อฐานข้อมูลจริง ตัวเลขจะอัปเดตอัตโนมัติ
      </p>
    </div>
  );
}

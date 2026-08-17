"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  amountDueNow,
  daysToUseBy,
  lineUserOf,
  lineChatOf,
  MOCK_ORDERS,
  ORDER_STATUSES,
  orderTotal,
  proofsOf,
  STATUS_STYLES,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import StepDots from "@/components/StepDots";
import { h1, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";
import { PACKING_QUEUE_STATUSES } from "@/lib/permissions";

/** แบ่งสถานะตามแผนกที่รับผิดชอบ — แต่ละแผนกเห็นเฉพาะงานของตัวเอง */
const DEPARTMENTS: { key: string; label: string; emoji: string; statuses: OrderStatus[] }[] = [
  { key: "all", label: "ทั้งหมด", emoji: "📋", statuses: [...ORDER_STATUSES] },
  { key: "sales", label: "คำสั่งซื้อ", emoji: "🧾", statuses: ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "ยกเลิก"] },
  { key: "design", label: "ทำแบบ", emoji: "🎨", statuses: ["รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] },
  { key: "pack", label: "แพ็คของ", emoji: "📦", statuses: ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"] },
];

/** ฝ่ายแพ็คเห็นเฉพาะออเดอร์ที่ถึงคิวแพ็คแล้ว — จอสะอาด หยิบผิดใบยาก */
const visibleTo = (list: Order[], seesAll: boolean) =>
  seesAll ? list : list.filter((o) => PACKING_QUEUE_STATUSES.includes(o.status));

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");
/** งานแบบที่ยังไม่จบ (ยังไม่มีแบบ หรือ ลูกค้าขอแก้) */
const openProofs = (o: Order) => o.items.filter((i) => !proofsOf(i).length || i.proofStatus === "ขอแก้ไข").length;
/** ออเดอร์มัดจำที่ยังเก็บเงินไม่ครบ — ต้องตามเก็บก่อนส่งของ */
const isDue = (o: Order) => !!o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก";

/** งานที่ต้องให้ทีมงานลงมือตอนนี้ (ไม่ใช่รอลูกค้า) */
const NEEDS_US: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "แก้ไขแบบ", "อนุมัติแบบ"];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dept, setDept] = useState("all");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(false); // เห็นเฉพาะออเดอร์มัดจำที่ยังเก็บเงินไม่ครบ
  const [demo, setDemo] = useState(false);

  const can = useCan();
  const seesAll = can("orders.viewAll"); // ฝ่ายแพ็คเห็นเฉพาะคิวของตัวเอง
  const seesMoney = can("orders.money");

  useEffect(() => {
    const deepLink = new URLSearchParams(window.location.search).get("order");
    if (deepLink) {
      router.replace(`/admin/orders/${encodeURIComponent(deepLink)}`);
      return;
    }
    fetchOrdersAdmin().then((r) => {
      if (r.orders.length > 0) setOrders(visibleTo(r.orders, seesAll));
      else {
        setOrders(visibleTo(MOCK_ORDERS, seesAll));
        setDemo(true);
      }
    });
  }, [router, seesAll]);

  const refresh = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    const next = visibleTo(r.orders, seesAll);
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [seesAll]);
  usePolling(refresh, { enabled: !demo });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const s of ORDER_STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  const activeDept = DEPARTMENTS.find((d) => d.key === dept) ?? DEPARTMENTS[0];
  const deptCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of DEPARTMENTS) c[d.key] = orders.filter((o) => d.statuses.includes(o.status)).length;
    return c;
  }, [orders]);

  const stats = useMemo(() => {
    const today = orders[0] ? dayOf(orders[0].date) : "";
    const active = orders.filter((o) => o.status !== "ยกเลิก");
    return {
      total: orders.length,
      needUs: orders.filter((o) => NEEDS_US.includes(o.status)).length,
      waitCustomer: orders.filter((o) => o.status === "รอชำระเงิน" || o.status === "รอตรวจแบบ").length,
      making: orders.filter((o) => o.status === "กำลังผลิต").length,
      todaySales: active.filter((o) => dayOf(o.date) === today).reduce((s, o) => s + orderTotal(o), 0),
      // ออเดอร์มัดจำที่ยังเก็บเงินไม่ครบ + ยอดที่ยังต้องตามเก็บรวมทั้งหมด
      dueCount: active.filter(isDue).length,
      dueAmount: active.filter(isDue).reduce((s, o) => s + amountDueNow(o), 0),
    };
  }, [orders]);

  function pickDept(key: string) {
    setDept(key);
    setFilter("all");
  }

  // เบอร์ไหนมีออเดอร์ค้างมากกว่า 1 ใบ → ติดป้ายเตือนในแถว (อาจต้องรวมส่ง)
  const openByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "เสร็จสิ้น" || o.status === "ยกเลิก") continue;
      const k = (o.phone ?? "").replace(/\D/g, "");
      if (k.length >= 8) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [orders]);

  const kw = q.trim().toLowerCase();
  const shown = orders
    .filter((o) => (onlyDue ? isDue(o) : true))
    .filter((o) => (onlyDue ? o.status !== "ยกเลิก" : activeDept.statuses.includes(o.status)))
    .filter((o) => (filter === "all" ? true : o.status === filter))
    .filter((o) => (kw ? o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw) : true));

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── หัวหน้า ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>🦆 คำสั่งซื้อ</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            {orders.length} ออเดอร์ ·{" "}
            {demo ? (
              <span className="text-slate-400">ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน</span>
            ) : (
              <span className="font-semibold text-green-600">● ออเดอร์จริง</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("orders.edit") && <NewOrderButton onCreated={(id) => router.push(`/admin/orders/${id}`)} />}
          <Link
            href="/admin/orders/scan"
            className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            📮 ยิงเลขพัสดุ
          </Link>
          <label className="flex min-w-[240px] items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
            <span className="text-sm text-amber-500">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* แนะนำวิธีสั่งแทนลูกค้า — ให้เลือกทางถูกก่อนกดสร้าง (เห็นเฉพาะคนที่สร้างออเดอร์ได้) */}
      {can("orders.edit") && (
        <p className="mt-3 rounded-xl bg-sky-50/70 px-4 py-2.5 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-100">
          💡 <strong>สั่งแทนลูกค้า:</strong> สินค้ามีบนเว็บ →{" "}
          <Link href="/" className="font-bold underline underline-offset-2 hover:text-sky-600">
            ไปหน้าร้าน
          </Link>{" "}
          หยิบใส่ตะกร้าแล้วติ๊ก 🧑‍💼 สั่งแทนลูกค้า (ได้ตัวเลือก/ราคาอัตโนมัติ) · งานสั่งทำที่<strong>ไม่มีบนเว็บ</strong> → กด
          “🛠️ สร้างออเดอร์งานพิเศษ” แล้วเพิ่มรายการจาก{" "}
          <Link href="/admin/special-products" className="font-bold underline underline-offset-2 hover:text-sky-600">
            รูปแบบการสินค้าสั่งพิเศษ
          </Link>
        </p>
      )}

      {/* ── การ์ดสรุป ── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="ทั้งหมด" value={stats.total.toString()} />
        <Tile label="ต้องทำตอนนี้" value={stats.needUs.toString()} tone="warn" />
        <Tile label="รอลูกค้า" value={stats.waitCustomer.toString()} />
        {seesMoney && stats.dueCount > 0 ? (
          <Tile
            label={`ค้างเก็บเงิน ${stats.dueCount} ออเดอร์`}
            value={formatPrice(stats.dueAmount)}
            tone="due"
            onClick={() => setOnlyDue((v) => !v)}
            active={onlyDue}
          />
        ) : (
          <Tile label="กำลังผลิต" value={stats.making.toString()} />
        )}
        {seesMoney && <Tile label="ยอดขายวันนี้" value={formatPrice(stats.todaySales)} tone="brand" />}
      </div>

      {/* ── แท็บแผนก ── */}
      <div className="mt-5 flex flex-wrap gap-2">
        {DEPARTMENTS.map((d) => {
          const on = d.key === dept;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => pickDept(d.key)}
              aria-pressed={on}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                on
                  ? "bg-amber-500 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
              }`}
            >
              {d.emoji} {d.label}{" "}
              <span className={on ? "opacity-80" : "text-slate-400"}>{deptCounts[d.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* ── ชิปสถานะย่อยของแผนกนั้น ── */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {seesMoney && stats.dueCount > 0 && (
          <button
            type="button"
            onClick={() => setOnlyDue((v) => !v)}
            aria-pressed={onlyDue}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              onlyDue ? "bg-rose-600 text-white" : "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            }`}
          >
            💳 ค้างเก็บเงิน <span className={onlyDue ? "opacity-80" : "text-rose-400"}>{stats.dueCount}</span>
          </button>
        )}
        {!onlyDue && (
          <>
            <Chip active={filter === "all"} onClick={() => setFilter("all")} label="ทุกสถานะ" count={deptCounts[activeDept.key] ?? 0} />
            {activeDept.statuses.map((s) => (
              <Chip key={s} active={filter === s} onClick={() => setFilter(s)} label={s} count={counts[s]} status={s} />
            ))}
          </>
        )}
      </div>

      {/* ── ตาราง ── */}
      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <span className="text-4xl">🗒️</span>
          <p className="mt-3 font-semibold text-slate-600">
            {kw ? `ไม่พบออเดอร์ที่ตรงกับ "${q}"` : filter === "all" ? `ไม่มีงานในแผนก${activeDept.label}` : `ไม่มีออเดอร์สถานะ "${filter}"`}
          </p>
          {!kw && <p className="mt-1 text-sm text-slate-400">ว่างแล้ว 🎉</p>}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="bg-amber-500 text-white">
                  <Th>ออเดอร์</Th>
                  <Th>ลูกค้า</Th>
                  <Th className="w-[210px]">ความคืบหน้า</Th>
                  <Th>สถานะ</Th>
                  <Th className="w-[110px] text-right">{seesMoney ? "ยอด" : "จำนวน"}</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shown.map((o, i) => {
                  const open = openProofs(o);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/admin/orders/${encodeURIComponent(o.id)}`)}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-amber-100/60 ${
                        i % 2 === 1 ? "bg-amber-50/70" : ""
                      }`}
                    >
                      <td className={`px-4 py-3.5 align-middle ${o.rush ? "border-l-4 border-l-rose-500" : ""}`}>
                        <p className="flex flex-wrap items-center gap-1.5 font-bold tabular-nums text-slate-900">
                          {o.id}
                          {o.rush && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title="งานเร่ง">
                              🔥 เร่ง
                            </span>
                          )}
                          {o.claimOf && (
                            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200" title={`งานเคลมจาก ${o.claimOf}${o.claimReason ? ` — ${o.claimReason}` : ""}`}>
                              ♻️ เคลม
                            </span>
                          )}
                          {o.reorderOf && (
                            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200" title={`สั่งซ้ำจาก ${o.reorderOf}`}>
                              🔁 สั่งซ้ำ
                            </span>
                          )}
                          {/* ออเดอร์มัดจำที่ยังเก็บไม่ครบ — ทุกแผนกต้องเห็น (ฝ่ายแพ็คห้ามส่งของ) */}
                          {o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก" && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${
                                o.deposit.firstPaidAt
                                  ? "bg-rose-100 text-rose-700 ring-rose-200"
                                  : "bg-violet-100 text-violet-700 ring-violet-200"
                              }`}
                              title={
                                o.deposit.firstPaidAt
                                  ? "รับมัดจำงวดแรกแล้ว ยังค้างยอดคงเหลือ — ห้ามส่งของจนเก็บครบ 100%"
                                  : "ออเดอร์มัดจำ 50% — รอลูกค้าโอนงวดแรก"
                              }
                            >
                              ➗ {o.deposit.firstPaidAt ? "ค้างครึ่งหลัง" : "รอครึ่งแรก"}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {o.date}
                          {(() => {
                            const d = o.useByDate ? daysToUseBy(o) : null;
                            if (d == null || o.status === "เสร็จสิ้น" || o.status === "ยกเลิก") return null;
                            const tone = d < 0 ? "text-rose-600" : d <= 3 ? "text-orange-600" : "text-slate-400";
                            return (
                              <span className={`ml-1 font-bold ${tone}`} title="วันที่ลูกค้าต้องใช้งาน">
                                · ⏱ {d < 0 ? `เลย ${Math.abs(d)} วัน` : d === 0 ? "ใช้งานวันนี้" : `อีก ${d} วัน`}
                              </span>
                            );
                          })()}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="flex items-center gap-1.5 text-slate-700">
                          {/* ป้ายสถานะ LINE ของลูกค้า: เขียว = ผูก userId แล้ว (ระบบแจ้งเองได้) · เหลือง = มีแค่ลิงก์ห้องแชท · แดง = ยังไม่ผูก */}
                          {(() => {
                            const l = lineUserOf(o, orders);
                            const chat = lineChatOf(o, orders);
                            const done = o.status === "ยกเลิก" || o.status === "เสร็จสิ้น";
                            const cls = l
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : chat
                                ? "bg-amber-50 text-amber-700 ring-amber-200"
                                : "bg-rose-50 text-rose-600 ring-rose-200";
                            const label = l ? "✓ ผูก LINE แล้ว" : chat ? "LINE แค่ลิงก์แชท" : "✕ ยังไม่ผูก LINE";
                            const title = l
                              ? `ผูก LINE แล้ว${l.name ? ` — ${l.name}` : ""}${l.source === "prev" ? " (จำจากออเดอร์เก่า)" : ""}${chat ? "" : " · ยังไม่มีลิงก์ห้องแชท"}`
                              : chat
                                ? "มีลิงก์ห้องแชทแล้ว แต่ยังไม่ผูก userId — ระบบส่งข้อความอัตโนมัติไม่ได้"
                                : "ยังไม่ผูก LINE — ระบบแจ้งเตือนอัตโนมัติจะไม่ส่ง";
                            return (
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls} ${done ? "opacity-50" : ""}`}
                                title={title}
                              >
                                {label}
                              </span>
                            );
                          })()}
                          {o.customer}
                        </p>
                        <p className="text-xs text-slate-400">
                          {qtyOf(o)} ชิ้น
                          {o.slipUrl && <span className="ml-1 font-semibold text-orange-600">· 📎</span>}
                          {open > 0 && <span className="ml-1 font-semibold text-violet-600">· 🎨 {open}</span>}
                          {o.items.some((i) => i.needStockCheck) && (
                            <span className="ml-1 font-semibold text-amber-600" title="สั่งจำนวนมาก — ต้องเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้า">· 📦 รอเช็คสต๊อก</span>
                          )}
                        {(openByPhone[(o.phone ?? "").replace(/\D/g, "")] ?? 0) > 1 && (
                          <span className="ml-1 font-semibold text-orange-600">· ⚠️ ออเดอร์ซ้ำ</span>
                        )}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <StepDots status={o.status} />
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[o.status]}`}>
                          {o.status}
                        </span>
                        {/* ใครเป็นคนตรวจสลิป — SlipOK อัตโนมัติ หรือแอดมินตรวจเอง (เห็นเฉพาะคนเห็นข้อมูลเงิน) */}
                        {seesMoney && o.slipVerify?.status === "pass" && (
                          <span className="mt-1 block">
                            <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              🤖 SlipOK ตรวจ ✓
                            </span>
                          </span>
                        )}
                        {seesMoney && o.slipVerify?.status === "fail" && o.status === "รอตรวจสอบ" && (
                          <span className="mt-1 block">
                            <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                              ⚠️ SlipOK ไม่ผ่าน — ตรวจเอง
                            </span>
                          </span>
                        )}
                        {seesMoney &&
                          (o.slipPath || o.slipUrl) &&
                          o.slipVerify?.status !== "pass" &&
                          o.status !== "รอชำระเงิน" &&
                          o.status !== "รอตรวจสอบ" &&
                          o.status !== "ยกเลิก" && (
                            <span className="mt-1 block">
                              <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                                🧑‍💼 แอดมินตรวจเอง
                              </span>
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3.5 text-right align-middle font-bold tabular-nums text-slate-900">
                        {seesMoney ? formatPrice(orderTotal(o)) : `${qtyOf(o)} ชิ้น`}
                        {/* ออเดอร์มัดจำ: บอกยอดที่ยังต้องเก็บ "งวดนี้" ใต้ยอดเต็ม */}
                        {seesMoney && o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก" && (
                          <p className={`text-[10px] font-bold ${o.deposit.firstPaidAt ? "text-rose-600" : "text-violet-600"}`}>
                            {o.deposit.firstPaidAt ? "ค้าง" : "มัดจำ"} {formatPrice(amountDueNow(o))}
                          </p>
                        )}
                      </td>
                      <td className="pr-4 align-middle text-slate-300">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${className}`}>{children}</th>
  );
}

function Tile({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: "warn" | "brand" | "due";
  /** กดแล้วกรองรายการ (เช่นการ์ด "ค้างเก็บเงิน") */
  onClick?: () => void;
  active?: boolean;
}) {
  const box =
    tone === "warn"
      ? "border-ducky bg-ducky/15"
      : tone === "brand"
        ? "border-amber-200 bg-amber-50"
        : tone === "due"
          ? active
            ? "border-rose-400 bg-rose-100/70"
            : "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-white";
  const val =
    tone === "warn" ? "text-yellow-700" : tone === "brand" ? "text-amber-600" : tone === "due" ? "text-rose-600" : "text-slate-900";
  const inner = (
    <>
      <div className="text-xs text-slate-500">
        {label}
        {onClick && <span className="ml-1 text-slate-400">{active ? "· กำลังกรอง ✕" : "· กดเพื่อกรอง"}</span>}
      </div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight ${val}`}>{value}</div>
    </>
  );
  if (!onClick) return <div className={`rounded-2xl border p-4 ${box}`}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition hover:brightness-95 ${box}`}>
      {inner}
    </button>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  status,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  status?: OrderStatus;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? status
            ? `ring-1 ${STATUS_STYLES[status]}`
            : "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label} <span className={active && !status ? "opacity-70" : "text-slate-400"}>{count}</span>
    </button>
  );
}

/** ปุ่มสร้างออเดอร์ใหม่ — สร้างออเดอร์เปล่าทันที แล้วพาเข้าหน้าออเดอร์ (กรอกชื่อ/ที่อยู่/รายการ ที่นั่นหน้าเดียวจบ) */
function NewOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return alert(j.error ?? "สร้างออเดอร์ไม่สำเร็จ");
    onCreated(j.id);
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      className="rounded-full bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
    >
      {busy ? "กำลังสร้าง…" : "🛠️ สร้างออเดอร์งานพิเศษ"}
    </button>
  );
}

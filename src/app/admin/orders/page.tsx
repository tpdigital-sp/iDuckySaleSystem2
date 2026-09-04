"use client";

/**
 * หน้าคำสั่งซื้อ /admin/orders — ดีไซน์ "รางเบนโตะกระจก" ชุดเดียวกับหน้าภาพรวม
 *
 * ⚠️ ของเดิมเป็นตารางกว้างขั้นต่ำ 860px มือถือต้องเลื่อนซ้าย-ขวาถึงจะเห็นสถานะกับยอด
 *    ของใหม่เป็น "แถว" ที่พับ 3 บรรทัดบนจอแคบ และคลี่เป็นแถวเดียวบนจอกว้าง
 *    ข้อมูลทุกตัวยังอยู่ครบ (LINE · เร่ง · เคลม · สั่งซ้ำ · มัดจำ · SlipOK · วันใช้งาน · ออเดอร์ซ้ำ)
 *
 * แยกสถานะด้วยมากกว่าสี: แถบสีซ้ายสุดของแถว + ป้ายสถานะ + สีแถบความคืบหน้า
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  amountDueNow,
  daysToUseBy,
  hasUnpaidBalance,
  orderBalance,
  lineUserOf,
  lineChatOf,
  MOCK_ORDERS,
  ORDER_STATUSES,
  ORDER_STEPS,
  orderStatusLabel,
  orderTotal,
  proofsOf,
  STEP_OF,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { useCan } from "@/lib/perm-context";
import { PACKING_QUEUE_STATUSES } from "@/lib/permissions";
import StatusChip, { chipStyle, STATUS_TONE } from "@/components/admin/StatusChip";
import "@/components/admin/dashboard.css";

/** แบ่งสถานะตามแผนกที่รับผิดชอบ — แต่ละแผนกเห็นเฉพาะงานของตัวเอง */
const DEPARTMENTS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "all", label: "ทั้งหมด", statuses: [...ORDER_STATUSES] },
  { key: "sales", label: "คำสั่งซื้อ", statuses: ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "ยกเลิก"] },
  { key: "design", label: "ทำแบบ", statuses: ["รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] },
  { key: "pack", label: "แพ็คของ", statuses: ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"] },
];

/** ฝ่ายแพ็คเห็นเฉพาะออเดอร์ที่ถึงคิวแพ็คแล้ว — จอสะอาด หยิบผิดใบยาก */
const visibleTo = (list: Order[], seesAll: boolean) =>
  seesAll ? list : list.filter((o) => PACKING_QUEUE_STATUSES.includes(o.status));

/** โมเสกรูปโชว์ได้มากสุด 4 ช่อง — เกินจากนี้ช่องสุดท้ายกลายเป็น "+N" */
const PIC_CELLS = 4;
/**
 * ภาพของออเดอร์ทั้งใบ (เรียงตามรายการ) — รายการไหนมีแบบงานแล้วใช้แบบ ยังไม่มีก็ใช้ลายที่ลูกค้าแนบมา
 *
 * ⚠️ เก็บ "ทุกรูป" ไม่ใช่รูปเดียวต่อรายการ — ลูกค้าที่สั่งทีละหลายลายต้องเห็นว่าใบนี้มีหลายลาย
 *    (ของเดิมเก็บรายการละรูปเดียว ใบ 1 รายการ 8 ลายเลยดูเหมือนใบลายเดียว)
 */
const coversOf = (o: Order) => {
  const out: { url: string; name: string }[] = [];
  for (const it of o.items) {
    const ps = proofsOf(it);
    const urls = ps.length ? ps.map((p) => p.url) : (it.artworkUrls ?? []);
    for (const url of urls) if (url) out.push({ url, name: it.name });
  }
  return out;
};
/** ป้ายกำกับกรอบรูป — ชื่อรายการ (ไม่ซ้ำ) + จำนวนรูปทั้งใบ */
const picTitle = (covers: { url: string; name: string }[]) => {
  if (!covers.length) return "ยังไม่มีภาพลาย/แบบงาน";
  const names = [...new Set(covers.map((c) => c.name))];
  const head = names.slice(0, 3).join(" · ") + (names.length > 3 ? ` และอีก ${names.length - 3} รายการ` : "");
  return `${head} — ${covers.length} รูป`;
};
const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");
/** งานแบบที่ยังไม่จบ (ยังไม่มีแบบ หรือ ลูกค้าขอแก้) */
const openProofs = (o: Order) => o.items.filter((i) => !proofsOf(i).length || i.proofStatus === "ขอแก้ไข").length;
/**
 * ออเดอร์ที่ยังเก็บเงินไม่ครบ — ต้องตามเก็บก่อนส่งของ
 * ครอบทั้งออเดอร์มัดจำ (ยังไม่ปิดงวดหลัง) และใบธรรมดาที่ยอดโตขึ้นหลังลูกค้าโอนแล้ว
 * (แอดมินตีราคางานสั่งทำทีหลัง / ลูกค้าสั่งเพิ่ม) — ดู hasUnpaidBalance
 */
const isDue = (o: Order) => hasUnpaidBalance(o);
/** ยอดที่ยังต้องตามเก็บของใบนี้ — ใบมัดจำใช้ยอดงวดนี้ · ใบธรรมดาใช้ส่วนต่างที่ยังขาด */
const dueOf = (o: Order) => (o.deposit ? amountDueNow(o) : orderBalance(o));
/** งานที่ต้องให้ทีมงานลงมือตอนนี้ (ไม่ใช่รอลูกค้า) */
const NEEDS_US: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "แก้ไขแบบ", "อนุมัติแบบ"];
/** สถานะที่ถือว่าจบแล้ว — แถวต้องเงียบกว่าใบที่ยังค้าง */
const DONE: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dept, setDept] = useState("all");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(false); // เห็นเฉพาะออเดอร์ที่ยังเก็บเงินไม่ครบ (มัดจำ + ส่วนต่างที่ตีราคาเพิ่ม)
  const [demo, setDemo] = useState(false);

  const can = useCan();
  const seesAll = can("orders.viewAll"); // ฝ่ายแพ็คเห็นเฉพาะคิวของตัวเอง
  const seesMoney = can("orders.money");

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const deepLink = qs.get("order");
    if (deepLink) {
      router.replace(`/admin/orders/${encodeURIComponent(deepLink)}`);
      return;
    }
    // มาจากช่องขั้นงานในหน้าภาพรวม → เปิดมาพร้อมตัวกรองสถานะนั้นเลย
    const wanted = qs.get("status") as OrderStatus | null;
    if (wanted && ORDER_STATUSES.includes(wanted)) setFilter(wanted);

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
      // ออเดอร์ที่ยังเก็บเงินไม่ครบ (มัดจำ + ส่วนต่างที่ตีราคาเพิ่ม) + ยอดที่ยังต้องตามเก็บรวม
      dueCount: active.filter(isDue).length,
      dueAmount: active.filter(isDue).reduce((s, o) => s + dueOf(o), 0),
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
  const digits = kw.replace(/\D/g, "");
  const shown = orders
    .filter((o) => (onlyDue ? isDue(o) : true))
    .filter((o) => (onlyDue ? o.status !== "ยกเลิก" : activeDept.statuses.includes(o.status)))
    .filter((o) => (filter === "all" ? true : o.status === filter))
    .filter((o) => {
      if (!kw) return true;
      if (o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw)) return true;
      // ค้นด้วยเบอร์โทรได้ด้วย — แอดมินมักได้เบอร์จากไลน์ก่อนได้เลขออเดอร์
      return digits.length >= 4 && (o.phone ?? "").replace(/\D/g, "").includes(digits);
    });

  const needPct = stats.total > 0 ? Math.round((stats.needUs / stats.total) * 100) : 0;

  return (
    <div className="dkb -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1180px]">
        {/* ── หัวหน้า + แถบเครื่องมือ ── */}
        <div className="flex flex-wrap items-end justify-between gap-4 px-1">
          <div>
            <p className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
              งานขาย
            </p>
            <h1 className="dkb-display mt-1 text-[1.6rem] leading-tight sm:text-[1.95rem]">
              คำสั่งซื้อ
              <span className="ml-2.5 text-[1.05rem] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                {stats.total} ใบ
              </span>
            </h1>
            <p className="mt-0.5 text-[13px]">
              {demo ? (
                <span style={{ color: "var(--dk-faint)" }}>ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน</span>
              ) : (
                <span className="inline-flex items-center gap-1.5" style={{ color: "var(--dk-mint-ink)" }}>
                  <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: "var(--dk-mint)" }} />
                  ออเดอร์จริง
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2.5 sm:justify-end">
            <label className="dkb-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / เบอร์โทร" />
            </label>
            {can("orders.edit") && <NewOrderButton onCreated={(id) => router.push(`/admin/orders/${id}`)} />}
            <Link href="/admin/orders/scan" className="dkb-btn dkb-btn-navy">
              ยิงเลขพัสดุ
            </Link>
          </div>
        </div>

        {/* แนะนำวิธีสั่งแทนลูกค้า — ให้เลือกทางถูกก่อนกดสร้าง (เห็นเฉพาะคนที่สร้างออเดอร์ได้) */}
        {can("orders.edit") && (
          <p className="dkb-g mt-4 px-4 py-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
            <b style={{ color: "var(--dk-navy)" }}>สั่งแทนลูกค้า:</b> สินค้ามีบนเว็บ →{" "}
            <Link href="/" className="font-semibold underline underline-offset-2" style={{ color: "var(--dk-blue-deep)" }}>
              ไปหน้าร้าน
            </Link>{" "}
            หยิบใส่ตะกร้าแล้วติ๊ก “สั่งแทนลูกค้า” (ได้ตัวเลือก/ราคาอัตโนมัติ) · งานสั่งทำที่
            <b style={{ color: "var(--dk-navy)" }}>ไม่มีบนเว็บ</b> → กด “สร้างออเดอร์งานพิเศษ” แล้วเพิ่มรายการจาก{" "}
            <Link
              href="/admin/special-products"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--dk-blue-deep)" }}
            >
              รูปแบบการสินค้าสั่งพิเศษ
            </Link>
          </p>
        )}

        {/* ── การ์ดสรุปแบบเบนโตะ — "ต้องทำตอนนี้" ใหญ่สุด ── */}
        <div className="dkb-stats mt-4" data-cols={seesMoney ? undefined : "4"}>
          <div className="dkb-g dkb-stat dkb-stat-hero" style={{ ["--dk-pct" as string]: `${needPct}%` }}>
            <span className="dkb-ring-sm">
              <i>
                <span className="dkb-num text-[1.55rem]">{stats.needUs}</span>
              </i>
            </span>
            <span className="min-w-0">
              <span className="dkb-h2 block text-[1.02rem]">ต้องทำตอนนี้</span>
              <span className="block text-[0.75rem]" style={{ color: "var(--dk-yolk-ink)" }}>
                {needPct}% ของ {stats.total} ใบ · รอลูกค้าตอบอีก {stats.waitCustomer} ใบ
              </span>
            </span>
          </div>

          <div className="dkb-g dkb-stat">
            <span className="dkb-stat-lb">กำลังผลิต</span>
            <span className="dkb-num dkb-stat-v">{stats.making}</span>
            <span className="dkb-stat-hint">เดินอยู่ในโรงพิมพ์</span>
          </div>

          {seesMoney && stats.dueCount > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyDue((v) => !v)}
              aria-pressed={onlyDue}
              data-on={onlyDue ? "1" : undefined}
              className="dkb-g dkb-stat dkb-stat-due"
            >
              <span className="dkb-stat-lb">ค้างเก็บเงิน · {onlyDue ? "กำลังกรอง ✕" : "กดเพื่อกรอง"}</span>
              <span className="dkb-num dkb-stat-v" style={{ color: "var(--dk-coral-ink)" }}>
                {formatPrice(stats.dueAmount)}
              </span>
              <span className="dkb-stat-hint">{stats.dueCount} ใบ (มัดจำ/ส่วนต่างที่ยังไม่ครบ)</span>
            </button>
          ) : (
            <div className="dkb-g dkb-stat">
              <span className="dkb-stat-lb">รอลูกค้าตอบ</span>
              <span className="dkb-num dkb-stat-v">{stats.waitCustomer}</span>
              <span className="dkb-stat-hint">รอชำระ / รอตรวจแบบ</span>
            </div>
          )}

          {seesMoney && (
            <div className="dkb-g dkb-stat dkb-stat-money">
              <span className="dkb-stat-lb">ยอดขายวันนี้</span>
              <span className="dkb-num dkb-stat-v">{formatPrice(stats.todaySales)}</span>
              <span className="dkb-stat-hint">จากออเดอร์ที่ไม่ถูกยกเลิก</span>
            </div>
          )}
        </div>

        {/* ── ตัวกรอง: แผนก + สถานะ ── */}
        <div className="dkb-g mt-4 px-3 py-3">
          <div className="dkb-scroll">
            {DEPARTMENTS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => pickDept(d.key)}
                aria-pressed={d.key === dept}
                className="dkb-tab"
              >
                {d.label} <b>{deptCounts[d.key] ?? 0}</b>
              </button>
            ))}
          </div>
          <div className="dkb-scroll mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--dk-hair)" }}>
            {seesMoney && stats.dueCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyDue((v) => !v)}
                aria-pressed={onlyDue}
                className="dkb-fchip"
                style={onlyDue ? undefined : { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
              >
                <i />
                ค้างเก็บเงิน <b>{stats.dueCount}</b>
              </button>
            )}
            {!onlyDue && (
              <>
                <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className="dkb-fchip">
                  <i />
                  ทุกสถานะ <b>{deptCounts[activeDept.key] ?? 0}</b>
                </button>
                {activeDept.statuses.map((s) => {
                  const n = counts[s] ?? 0;
                  const on = filter === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilter(s)}
                      aria-pressed={on}
                      data-zero={n === 0 ? "1" : undefined}
                      className="dkb-fchip"
                      style={on || n === 0 ? undefined : chipStyle(s)}
                    >
                      <i />
                      {s} <b>{n}</b>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ── รายการ ── */}
        <div className="flex items-baseline justify-between gap-3 px-2 pb-2 pt-5">
          <h2 className="dkb-h2 text-[1.06rem]">รายการ</h2>
          <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            เรียงใหม่ → เก่า · แสดง {shown.length} จาก {orders.length} ใบ
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="dkb-g px-4 py-12 text-center">
            <p className="dkb-h2 text-[16px]">
              {kw
                ? `ไม่พบออเดอร์ที่ตรงกับ “${q}”`
                : filter === "all"
                  ? `ไม่มีงานในแผนก${activeDept.label}`
                  : `ไม่มีออเดอร์สถานะ “${filter}”`}
            </p>
            <p className="mt-1.5 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
              {kw ? "ลองค้นด้วยเลขออเดอร์ ชื่อลูกค้า หรือเบอร์โทรแทน" : "เคลียร์หมดแล้ว — ใบใหม่จะโผล่ตรงนี้ทันทีที่ลูกค้าสั่ง"}
            </p>
          </div>
        ) : (
          <div className="dkb-rows">
            {shown.map((o) => (
              <OrderRow key={o.id} o={o} orders={orders} openByPhone={openByPhone} seesMoney={seesMoney} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  o,
  orders,
  openByPhone,
  seesMoney,
}: {
  o: Order;
  orders: Order[];
  openByPhone: Record<string, number>;
  seesMoney: boolean;
}) {
  const open = openProofs(o);
  const done = DONE.includes(o.status);
  const step = STEP_OF[o.status];
  const days = o.useByDate && !done ? daysToUseBy(o) : null;
  const line = lineUserOf(o, orders);
  const chat = lineChatOf(o, orders);
  const dup = (openByPhone[(o.phone ?? "").replace(/\D/g, "")] ?? 0) > 1;
  const covers = coversOf(o);

  return (
    <Link
      href={`/admin/orders/${encodeURIComponent(o.id)}`}
      className="dkb-g dkb-lrow has-pic"
      data-done={done ? "1" : undefined}
      style={{ ["--dk-tone" as string]: STATUS_TONE[o.status] }}
    >
      {/* รูปที่ลูกค้าสั่ง — แบบงานก่อน ถ้ายังไม่มีแบบก็ใช้ลายที่ลูกค้าแนบมา · หลายลายซอยเป็นโมเสกในกรอบเดิม */}
      <span className="dkb-pic" data-n={covers.length ? Math.min(covers.length, PIC_CELLS) : 1} title={picTitle(covers)}>
        {covers.length === 0 ? (
          <span className="ph" aria-hidden>
            🖼️
          </span>
        ) : (
          <>
            {covers.slice(0, covers.length > PIC_CELLS ? PIC_CELLS - 1 : PIC_CELLS).map((c) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={c.url} src={c.url} alt="" loading="lazy" decoding="async" />
            ))}
            {covers.length > PIC_CELLS && <span className="more">+{covers.length - (PIC_CELLS - 1)}</span>}
          </>
        )}
      </span>

      <span className="dkb-main">
        <span className="dkb-who">
          <span className="nm">{o.customer || "ยังไม่ระบุชื่อ"}</span>
          {o.rush && (
            <span className="dkb-tag" style={{ background: "var(--dk-coral-deep)", color: "#fff" }} title="งานเร่ง">
              <i />
              งานเร่ง
            </span>
          )}
          {o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก" && (
            <span
              className="dkb-tag"
              style={
                o.deposit.firstPaidAt
                  ? { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }
                  : { background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }
              }
              title={
                o.deposit.firstPaidAt
                  ? "รับมัดจำงวดแรกแล้ว ยังค้างยอดคงเหลือ — ห้ามส่งของจนเก็บครบ 100%"
                  : "ออเดอร์มัดจำ 50% — รอลูกค้าโอนงวดแรก"
              }
            >
              <i />
              {o.deposit.firstPaidAt ? "ค้างครึ่งหลัง" : "รอมัดจำครึ่งแรก"}
            </span>
          )}
          {/* ลูกค้าพิมพ์ขอแก้ไขออเดอร์เข้ามาแล้วยังไม่มีใครรับเรื่อง — ต้องเห็นตั้งแต่ในลิสต์ */}
          {o.editRequest && !o.editRequest.doneAt && o.status !== "ยกเลิก" && (
            <span
              className="dkb-tag"
              style={{ background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }}
              title={`ลูกค้าขอแก้ไข — “${o.editRequest.text}”`}
            >
              <i />
              ลูกค้าขอแก้ไข
            </span>
          )}
          {o.claimOf && (
            <span
              className="dkb-tag"
              style={{ background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }}
              title={`งานเคลมจาก ${o.claimOf}${o.claimReason ? ` — ${o.claimReason}` : ""}`}
            >
              <i />
              งานเคลม
            </span>
          )}
          {o.reorderOf && (
            <span
              className="dkb-tag"
              style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}
              title={`สั่งซ้ำจาก ${o.reorderOf}`}
            >
              <i />
              สั่งซ้ำ
            </span>
          )}
          {/* สถานะ LINE ของลูกค้า — ใบที่จบแล้วไม่ต้องเตือน */}
          {!done && (
            <span
              className="dkb-tag"
              style={
                line
                  ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }
                  : chat
                    ? { background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }
                    : { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }
              }
              title={
                line
                  ? `ผูก LINE แล้ว${line.name ? ` — ${line.name}` : ""}${line.source === "prev" ? " (จำจากออเดอร์เก่า)" : ""}`
                  : chat
                    ? "มีลิงก์ห้องแชทแล้ว แต่ยังไม่ผูก userId — ระบบส่งข้อความอัตโนมัติไม่ได้"
                    : "ยังไม่ผูก LINE — ระบบแจ้งเตือนอัตโนมัติจะไม่ส่ง"
              }
            >
              <i />
              {line ? "ผูก LINE แล้ว" : chat ? "LINE แค่ลิงก์แชท" : "ยังไม่ผูก LINE"}
            </span>
          )}
          {seesMoney && o.slipVerify?.status === "pass" && (
            <span
              className="dkb-tag"
              style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}
              title="ระบบตรวจสลิปอัตโนมัติผ่านแล้ว"
            >
              <i />
              SlipOK ตรวจผ่าน
            </span>
          )}
          {seesMoney && o.slipVerify?.status === "fail" && o.status === "รอตรวจสอบ" && (
            <span
              className="dkb-tag"
              style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
              title="ตรวจสลิปอัตโนมัติไม่ผ่าน — ต้องตรวจเอง"
            >
              <i />
              SlipOK ไม่ผ่าน
            </span>
          )}
        </span>

        <span className="dkb-meta">
          <span className="id">{o.id}</span>
          <span>{o.date}</span>
          {days !== null && (
            <span className={days <= 3 ? "hot" : undefined}>
              {days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? "ใช้งานวันนี้" : `ใช้งานอีก ${days} วัน`}
            </span>
          )}
          <span>{qtyOf(o)} ชิ้น</span>
          {o.slipUrl && <span className="warn">แนบสลิปแล้ว</span>}
          {open > 0 && <span className="warn">แบบรอทำ {open}</span>}
          {o.items.some((i) => i.needStockCheck) && <span className="warn">รอเช็คสต๊อก</span>}
          {dup && <span className="warn">ออเดอร์ซ้ำเบอร์เดียวกัน</span>}
          {o.tracking && <span className="id">{o.tracking}</span>}
        </span>
      </span>

      <span className="dkb-dots">
        {step < 0 ? (
          <span className="lb" style={{ marginLeft: 0 }}>
            ยกเลิกแล้ว
          </span>
        ) : (
          <>
            <span className="lb">
              {step >= ORDER_STEPS.length ? "จบงานแล้ว" : ORDER_STEPS[step]} ·{" "}
              {Math.min(step + 1, ORDER_STEPS.length)}/{ORDER_STEPS.length}
            </span>
            <span className="bars" aria-hidden>
              {ORDER_STEPS.map((label, i) => (
                <span key={label} className="seg" data-on={i <= step ? "1" : undefined} />
              ))}
            </span>
          </>
        )}
      </span>

      <span className="dkb-side">
        <StatusChip s={o.status} label={orderStatusLabel(o)} />
        <span className="dkb-amt">
          {seesMoney ? formatPrice(orderTotal(o)) : `${qtyOf(o)} ชิ้น`}
          {/* ยังเก็บเงินไม่ครบ: บอกยอดที่ยังต้องตามเก็บใต้ยอดเต็ม
              ใบมัดจำ = ยอดงวดนี้ · ใบธรรมดา = ส่วนต่างที่โตขึ้นหลังลูกค้าโอนแล้ว (ตีราคาเพิ่ม/สั่งเพิ่ม) */}
          {seesMoney && isDue(o) && (
            <small style={{ color: o.deposit && !o.deposit.firstPaidAt ? "var(--dk-lilac-ink)" : "var(--dk-coral-ink)" }}>
              {o.deposit && !o.deposit.firstPaidAt ? "มัดจำ" : "ค้าง"} {formatPrice(dueOf(o))}
            </small>
          )}
        </span>
      </span>
    </Link>
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
    <button type="button" onClick={create} disabled={busy} className="dkb-btn dkb-btn-yolk">
      {busy ? "กำลังสร้าง…" : "สร้างออเดอร์งานพิเศษ"}
    </button>
  );
}

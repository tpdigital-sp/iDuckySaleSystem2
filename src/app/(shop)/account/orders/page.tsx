"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, STEP_OF, type Order, type OrderStatus } from "@/lib/admin-data";
import { useCustomer } from "@/lib/customer-context";
import { useReorder } from "@/lib/reorder";
import { fetchMyOrders, readStoredOrders, setOrdersOwner } from "@/lib/my-orders";
import { AccountHead, AccountShell, OrderTracker, statusIcon } from "@/components/account/AccountShell";

/*
 * ประวัติการสั่งซื้อ — ดีไซน์เดียวกับหน้าแรก/แดชบอร์ด (โทนฟ้า-กรมท่า-ไข่แดง, ฟอนต์ Mitr + IBM Plex Sans Thai Looped)
 * โครง: เมนูข้าง + [หัวเรื่อง → สรุปตัวเลข → ตัวกรอง → การ์ดออเดอร์]
 */

/** กลุ่มกรอง — รวมสถานะที่ลูกค้าเข้าใจง่าย */
const FILTERS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: "all", label: "ทั้งหมด", match: () => true },
  { key: "active", label: "กำลังดำเนินการ", match: (s) => !["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"].includes(s) },
  { key: "shipped", label: "จัดส่งแล้ว", match: (s) => s === "จัดส่งแล้ว" || s === "เสร็จสิ้น" },
  { key: "cancelled", label: "ยกเลิก", match: (s) => s === "ยกเลิก" },
];

/** จำนวนรายการที่โชว์ในการ์ดก่อนยุบเป็น "+ อีก n รายการ" */
const ITEM_PEEK = 3;

export default function MyOrdersPage() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    setOrdersOwner(customer.id);
    // ชุดล่าสุดที่เก็บไว้ในเครื่องขึ้นก่อน (API ตอบราว 1 วิ) แล้วค่อยทับด้วยของจริง
    const snap = readStoredOrders(customer.id);
    if (snap) {
      setOrders(snap);
      setState("ready");
    }
    (async () => {
      const data = await fetchMyOrders();
      setOrders(data.orders);
      setState("ready");
    })();
  }, [customer]);

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = useMemo(() => orders.filter((o) => active.match(o.status)), [orders, active]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = orders.filter((o) => f.match(o.status)).length;
    return c;
  }, [orders]);
  /** ยอดที่ยังค้างชำระรวมทุกออเดอร์ (ไม่นับที่ยกเลิก) */
  const owedAll = useMemo(() => orders.reduce((s, o) => (o.status === "ยกเลิก" ? s : s + orderBalance(o)), 0), [orders]);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 2600);
  }

  const { reorder, canReorder } = useReorder(showToast);

  if (loading || !customer) {
    return (
      <AccountShell active="orders">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="orders">
      <AccountHead
        ico="orders"
        title="ประวัติการสั่งซื้อ"
        sub={orders.length > 0 ? "ทุกออเดอร์ของคุณอยู่ที่นี่ — กดสั่งซ้ำหรือดูรายละเอียดได้เลย" : "ออเดอร์ที่สั่งผ่านเว็บจะมาโผล่ที่หน้านี้"}
      />

      {/* สรุปตัวเลข */}
      {orders.length > 0 && (
        <div className="acd-stats">
          <div className="acd-stat">
            <span className="acd-stat-label">ออเดอร์ทั้งหมด</span>
            <b className="acd-stat-value">{orders.length}</b>
          </div>
          <div className="acd-stat">
            <span className="acd-stat-label">กำลังดำเนินการ</span>
            <b className="acd-stat-value">{counts.active}</b>
          </div>
          <div className={`acd-stat${owedAll > 0 ? " warn" : ""}`}>
            <span className="acd-stat-label">{owedAll > 0 ? "ยอดค้างชำระ" : "ค้างชำระ"}</span>
            <b className="acd-stat-value">{owedAll > 0 ? formatPrice(owedAll) : "ไม่มี ✓"}</b>
          </div>
        </div>
      )}

      {/* ตัวกรอง */}
      {orders.length > 0 && (
        <div className="acd-filters" role="tablist" aria-label="กรองออเดอร์">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`acd-ttab${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="acd-ttab-n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {state === "loading" && orders.length === 0 ? (
        <div className="acd-olist">
          {[0, 1].map((i) => (
            <div key={i} className="acd-ocard" aria-label="กำลังโหลดออเดอร์">
              <span className="acd-skel acd-skel-line w40" />
              <span className="acd-skel acd-skel-line w60" />
              <span className="acd-skel acd-skel-btn" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">🧾</span>
          <h3>ยังไม่มีคำสั่งซื้อ</h3>
          <p>เลือกสินค้าที่ถูกใจ แล้วออเดอร์แรกของคุณจะมาอยู่ตรงนี้</p>
          <Link href="/products" className="btn btn-yolk">
            ไปเลือกสินค้า <span className="dot">→</span>
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="acd-empty small">
          <span className="acd-empty-ico">🔍</span>
          <p>ไม่มีออเดอร์ในกลุ่ม &quot;{active.label}&quot;</p>
          <button type="button" className="btn btn-ghost acd-btn-compact" onClick={() => setFilter("all")}>
            ดูทั้งหมด <span className="dot">↺</span>
          </button>
        </div>
      ) : (
        <div className="acd-olist">
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} onReorder={reorder} canReorder={canReorder(o)} />
          ))}
        </div>
      )}

      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountShell>
  );
}

/** การ์ดออเดอร์ 1 ใบ */
function OrderCard({ order: o, onReorder, canReorder }: { order: Order; onReorder: (o: Order) => void; canReorder: boolean }) {
  const [openItems, setOpenItems] = useState(false);
  const owed = orderBalance(o);
  const href = `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;
  const rest = o.items.length - ITEM_PEEK;
  const items = openItems ? o.items : o.items.slice(0, ITEM_PEEK);

  return (
    <article className={`acd-ocard${o.status === "ยกเลิก" ? " cancelled" : ""}`}>
      <div className="acd-ocard-top">
        <div className="acd-ocard-idcol">
          <div className="acd-order-id">{o.id}</div>
          <div className="acd-order-date">
            {o.date} · {o.items.length} รายการ
          </div>
        </div>
        <span className={`acd-status s-${STEP_OF[o.status]}`}>
          <i>{statusIcon(o)}</i> {o.status}
        </span>
      </div>

      {o.status !== "ยกเลิก" && <OrderTracker order={o} compact />}

      <ul className="acd-ocard-items">
        {items.map((it, i) => (
          <li key={i}>
            <span className="acd-ocard-item-name">{it.name}</span>
            <span className="acd-ocard-item-qty">×{it.qty}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="acd-ocard-more">
            <button type="button" onClick={() => setOpenItems((v) => !v)}>
              {openItems ? "ย่อรายการ ▴" : `อีก ${rest} รายการ ▾`}
            </button>
          </li>
        )}
      </ul>

      {o.tracking && (
        <p className="acd-ocard-track">
          🚚 เลขพัสดุ <b>{o.tracking}</b>
        </p>
      )}

      <div className="acd-divider" />

      <div className="acd-ocard-foot">
        <div className={`acd-ocard-sum${owed > 0 && o.status !== "ยกเลิก" ? " owed" : ""}`}>
          <span>{owed > 0 && o.status !== "ยกเลิก" ? "ค้างชำระ" : "ยอดรวม"}</span>
          <b>{formatPrice(owed > 0 && o.status !== "ยกเลิก" ? owed : orderTotal(o))}</b>
        </div>
        <div className="acd-ocard-actions">
          {canReorder && (
            <button type="button" className="btn btn-ghost acd-btn-compact" onClick={() => onReorder(o)}>
              สั่งซ้ำ <span className="dot">🔁</span>
            </button>
          )}
          {owed > 0 && o.status !== "ยกเลิก" ? (
            <Link href={href} className="btn btn-yolk acd-btn-compact">
              ชำระเงิน <span className="dot">→</span>
            </Link>
          ) : (
            <Link href={href} className="btn btn-primary acd-btn-compact">
              ดูรายละเอียด <span className="dot">→</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

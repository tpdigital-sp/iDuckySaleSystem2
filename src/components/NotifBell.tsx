"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { graphicWaitingItems, orderBalance, type Order } from "@/lib/admin-data";
import { formatPrice } from "@/lib/products";
import { useCustomer } from "@/lib/customer-context";
import { fetchMyOrders, setOrdersOwner } from "@/lib/my-orders";

/**
 * กระดิ่งแจ้งเตือนบนแถบเมนู (มาร์กอัป/สไตล์ .nav-bell-* ตามต้นแบบ LADNDING PAGE.html) — โชว์ทุกคน (ยังไม่ล็อกอิน = ชวนเข้าสู่ระบบ)
 * รายการแจ้งเตือนคำนวณสดจากออเดอร์ของลูกค้า (ไม่มีตารางแจ้งเตือนแยก):
 *   💳 ค้างชำระ · 🖼️ แบบพร้อมให้อนุมัติ · 🚚 จัดส่งแล้ว (มีเลขพัสดุ)
 * ตัวเลขบนกระดิ่ง = จำนวนเรื่องที่ยังต้องทำ/ควรรู้ตอนนี้ (ไม่ใช่ "ยังไม่ได้อ่าน")
 */
interface Notif {
  key: string;
  ico: string;
  t1: string;
  t2: string;
  href: string;
}

const orderHref = (o: Order) => `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;

function buildNotifs(orders: Order[]): Notif[] {
  const out: Notif[] = [];
  for (const o of orders) {
    if (o.status === "ยกเลิก" || o.status === "เสร็จสิ้น") continue;
    const bal = orderBalance(o);
    if ((o.status === "รอชำระเงิน" || o.deposit) && bal > 0)
      out.push({ key: `pay:${o.id}`, ico: "💳", t1: `ออเดอร์ ${o.id} ค้างชำระ ${formatPrice(bal)}`, t2: o.date, href: orderHref(o) });
    const waiting = graphicWaitingItems(o).length;
    if (waiting > 0)
      out.push({ key: `proof:${o.id}`, ico: "🖼️", t1: `แบบพิมพ์พร้อมให้อนุมัติแล้ว (${waiting} รายการ)`, t2: `ออเดอร์ ${o.id}`, href: orderHref(o) });
    if (o.status === "จัดส่งแล้ว")
      out.push({ key: `ship:${o.id}`, ico: "🚚", t1: `ออเดอร์ ${o.id} จัดส่งแล้ว`, t2: o.tracking ? `พัสดุ ${o.tracking}` : "กำลังเดินทางไปหาคุณ", href: orderHref(o) });
  }
  return out.slice(0, 6);
}

export default function NotifBell() {
  const { customer } = useCustomer();
  const pathname = usePathname();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // โหลดใหม่เมื่อ: ล็อกอิน / เปลี่ยนหน้า / กลับมาที่แท็บ (หลังไปจ่ายเงิน-อนุมัติแบบมา)
  useEffect(() => {
    if (!customer) {
      setNotifs([]);
      return;
    }
    let alive = true;
    setOrdersOwner(customer.id); // ให้สำเนาในเครื่องถูกเขียนไว้แม้จะเปิดอยู่หน้าอื่น
    // ใช้ผลร่วมกับหน้าที่กำลังเปิด (my-orders) — ไม่ยิง /api/orders/mine ซ้ำอีกรอบต่อการโหลดหนึ่งครั้ง
    const load = async (force?: boolean) => {
      const j = await fetchMyOrders({ force });
      if (alive) setNotifs(buildNotifs(j.orders));
    };
    load();
    // กลับมาที่แท็บ (หลังไปจ่ายเงิน/อนุมัติแบบมา) = ขอของใหม่จริงๆ
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [customer, pathname]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ต้นแบบมีกระดิ่งบนแถบเมนูเสมอ (เจ้าของร้านยืนยัน 9 ก.ย. 69) — ยังไม่ล็อกอินก็เห็นปุ่ม กดแล้วชวนเข้าสู่ระบบ
  const n = customer ? notifs.length : 0;

  return (
    <div ref={wrapRef} className="nav-bell-wrap" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="icon-btn nav-bell-icon"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={n ? `แจ้งเตือน ${n} รายการ` : "แจ้งเตือน"}
        title="แจ้งเตือน"
      >
        <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        </svg>
        {n > 0 && <span className="nav-bell-dot" aria-hidden="true" />}
      </button>
      <div className={`nav-bell-drop${open ? " open" : ""}`} role="menu" aria-hidden={!open}>
        <div className="nav-bell-head">การแจ้งเตือน{n > 0 ? ` (${n})` : ""}</div>
        {!customer ? (
          <div className="nav-bell-empty">
            <span>🐣</span>
            เข้าสู่ระบบเพื่อรับแจ้งเตือนออเดอร์ ยอดค้างชำระ และแบบที่รอตรวจ
          </div>
        ) : n === 0 ? (
          <div className="nav-bell-empty">
            <span>🦆</span>
            ไม่มีเรื่องค้าง — เรียบร้อยดีทุกออเดอร์
          </div>
        ) : (
          notifs.map((x) => (
            <Link key={x.key} href={x.href} role="menuitem" onClick={() => setOpen(false)}>
              <i>{x.ico}</i>
              <b>{x.t1}</b>
              <span>{x.t2}</span>
            </Link>
          ))
        )}
        <Link href={customer ? "/account" : "/account/login"} className="nav-bell-all" onClick={() => setOpen(false)}>
          {customer ? "ดูทั้งหมด →" : "เข้าสู่ระบบ →"}
        </Link>
      </div>
    </div>
  );
}

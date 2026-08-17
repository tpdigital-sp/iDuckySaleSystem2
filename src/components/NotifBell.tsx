"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { graphicWaitingItems, orderBalance, type Order } from "@/lib/admin-data";
import { formatPrice } from "@/lib/products";
import { getAccessToken } from "@/lib/customer-auth";
import { useCustomer } from "@/lib/customer-context";

/**
 * กระดิ่งแจ้งเตือนบนแถบเมนู (ตามต้นแบบ USER PROFILE UPDATE_01.html) — โชว์เฉพาะสมาชิกที่ล็อกอิน
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
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/orders/mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (alive) setNotifs(buildNotifs(j.orders ?? []));
    };
    load();
    const onFocus = () => load();
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

  if (!customer) return null;
  const n = notifs.length;

  return (
    <div ref={wrapRef} className="nbell-wrap">
      <button
        type="button"
        className={`icon-btn nbell-btn${n ? " has" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={n ? `แจ้งเตือน ${n} รายการ` : "แจ้งเตือน"}
        title="แจ้งเตือน"
      >
        <span className="nbell-ico" aria-hidden="true">🔔</span>
        {n > 0 && <span className="nbell-count">{n > 9 ? "9+" : n}</span>}
      </button>
      <div className={`nbell-panel${open ? " show" : ""}`} role="menu" aria-hidden={!open}>
        <div className="nbell-head">การแจ้งเตือน</div>
        {n === 0 ? (
          <div className="nbell-empty">
            <span>🦆</span>
            ไม่มีเรื่องค้าง — เรียบร้อยดีทุกออเดอร์
          </div>
        ) : (
          notifs.map((x) => (
            <Link key={x.key} href={x.href} role="menuitem" className="nbell-row" onClick={() => setOpen(false)}>
              <span className="nbell-rico">{x.ico}</span>
              <span className="nbell-text">
                <span className="t1">{x.t1}</span>
                <span className="t2">{x.t2}</span>
              </span>
            </Link>
          ))
        )}
        <Link href="/account" className="nbell-foot" onClick={() => setOpen(false)}>
          ดูทั้งหมดในหน้าบัญชี →
        </Link>
      </div>
    </div>
  );
}

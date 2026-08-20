"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderFullyPaid, orderTotal, STEP_OF, type Order } from "@/lib/admin-data";
import { LINE_URL } from "@/components/LineButton";
import { AccountHead, AccountShell, statusIcon } from "@/components/account/AccountShell";
import { orderHref, useAccountOrders } from "@/components/account/useAccountOrders";

/*
 * ใบเสร็จ / ใบกำกับภาษี — รวมทุกออเดอร์ที่เปิดใบเสร็จได้ไว้หน้าเดียว
 * ใบเสร็จออกได้เมื่อชำระครบ 100% เท่านั้น (กติกาเดียวกับหน้า /order/[id]/receipt ที่ล็อกไว้อยู่แล้ว)
 * ใบกำกับภาษีเต็มรูปแบบ = เฟสถัดไป — ระหว่างนี้แนะนำให้ทักแอดมิน
 */

export default function ReceiptsPage() {
  const { customer, loading, orders } = useAccountOrders();

  const list = useMemo(() => (orders ?? []).filter((o) => o.status !== "ยกเลิก"), [orders]);
  const ready = list.filter((o) => orderFullyPaid(o));

  if (loading || !customer) {
    return (
      <AccountShell active="receipts">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="receipts">
      <AccountHead
        ico="receipt"
        title="ใบเสร็จ / ใบกำกับภาษี"
        sub={ready.length > 0 ? `เปิดใบเสร็จได้ ${ready.length} ออเดอร์ — กดเปิดแล้วสั่งพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าใบเสร็จ` : "ออเดอร์ที่ชำระครบแล้วจะเปิดใบเสร็จได้จากหน้านี้"}
      />

      {orders === null ? (
        <div className="acd-olist">
          {[0, 1].map((i) => (
            <div key={i} className="acd-ocard" aria-label="กำลังโหลด">
              <span className="acd-skel acd-skel-line w40" />
              <span className="acd-skel acd-skel-line w60" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">🧾</span>
          <h3>ยังไม่มีใบเสร็จ</h3>
          <p>สั่งซื้อและชำระเงินครบแล้ว ใบเสร็จของออเดอร์นั้นจะมารออยู่ที่นี่</p>
          <Link href="/products" className="btn btn-yolk">
            ไปเลือกสินค้า <span className="dot">→</span>
          </Link>
        </div>
      ) : (
        <div className="acd-olist">
          {list.map((o) => (
            <ReceiptRow key={o.id} order={o} />
          ))}
        </div>
      )}

      {/* ใบกำกับภาษี — ระหว่างรอระบบเต็มรูปแบบ */}
      <div className="acd-rcp-tax">
        <b>ต้องการใบกำกับภาษีเต็มรูปแบบ?</b> ระบบกรอกข้อมูลผู้เสียภาษีในเว็บกำลังจะเปิดใช้เร็วๆ นี้ — ตอนนี้แจ้งชื่อบริษัท เลขผู้เสียภาษี และที่อยู่กับแอดมินได้เลย เดี๋ยวออกให้ทันที{" "}
        <a href={LINE_URL} target="_blank" rel="noopener noreferrer">
          ทักแอดมินทาง LINE →
        </a>
      </div>
    </AccountShell>
  );
}

/** แถวออเดอร์ 1 ใบ — จ่ายครบ = ปุ่มเปิดใบเสร็จ · ยังไม่ครบ = บอกยอดค้างพร้อมทางไปจ่าย */
function ReceiptRow({ order: o }: { order: Order }) {
  const paid = orderFullyPaid(o);
  const owed = orderBalance(o);
  return (
    <article className="acd-ocard acd-rcp-row">
      <div className="acd-ocard-top">
        <div className="acd-ocard-idcol">
          <div className="acd-order-id">{o.id}</div>
          <div className="acd-order-date">
            {o.date} · {o.items.length} รายการ · ยอดรวม {formatPrice(orderTotal(o))}
          </div>
        </div>
        <span className={`acd-status s-${STEP_OF[o.status]}`}>
          <i>{statusIcon(o)}</i> {o.status}
        </span>
      </div>
      <div className="acd-divider" />
      <div className="acd-ocard-foot">
        <div className={`acd-ocard-sum${paid ? "" : " owed"}`}>
          <span>{paid ? "ชำระครบแล้ว" : "ยังออกใบเสร็จไม่ได้"}</span>
          <b>{paid ? formatPrice(orderTotal(o)) : `ค้างชำระ ${formatPrice(owed)}`}</b>
        </div>
        <div className="acd-ocard-actions">
          {paid ? (
            <Link href={orderHref(o, "/receipt")} className="btn btn-primary acd-btn-compact">
              เปิดใบเสร็จ <span className="dot">🧾</span>
            </Link>
          ) : (
            <Link href={orderHref(o)} className="btn btn-yolk acd-btn-compact">
              ชำระเงิน <span className="dot">→</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

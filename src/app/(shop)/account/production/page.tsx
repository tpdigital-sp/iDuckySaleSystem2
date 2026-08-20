"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, STEP_OF, type Order } from "@/lib/admin-data";
import ThaiPostTimeline, { type ThpEventView } from "@/components/ThaiPostTimeline";
import { AccountHead, AccountShell, OrderTracker, statusIcon } from "@/components/account/AccountShell";
import { orderHref, useAccountOrders } from "@/components/account/useAccountOrders";
import { Pager, usePager } from "@/components/account/Pager";

/*
 * ติดตามสถานะการผลิต — ทุกออเดอร์ที่ยังไม่จบ กางแถบ 5 ขั้นเต็ม + สถานะพัสดุไปรษณีย์ไทยสด
 * (ยกระดับจาก collapse tracker ในแดชบอร์ดให้เป็นหน้าเต็ม)
 */

export default function ProductionPage() {
  const { customer, loading, orders } = useAccountOrders();

  /** ออเดอร์ที่ยังเดินอยู่ — เรียงงานที่ใกล้เสร็จ (ขั้นสูงกว่า) ขึ้นก่อน */
  const ongoing = useMemo(
    () => (orders ?? []).filter((o) => !["เสร็จสิ้น", "ยกเลิก"].includes(o.status)).sort((a, b) => STEP_OF[b.status] - STEP_OF[a.status]),
    [orders],
  );
  const producing = ongoing.filter((o) => o.status === "กำลังผลิต").length;
  const shipping = ongoing.filter((o) => o.status === "จัดส่งแล้ว").length;
  const pager = usePager(ongoing, 6);

  if (loading || !customer) {
    return (
      <AccountShell active="production">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="production">
      <AccountHead
        ico="production"
        title="ติดตามสถานะการผลิต"
        sub={
          ongoing.length > 0
            ? `กำลังดำเนินการ ${ongoing.length} ออเดอร์${producing ? ` · ผลิตอยู่ ${producing}` : ""}${shipping ? ` · อยู่ระหว่างจัดส่ง ${shipping}` : ""}`
            : "ออเดอร์ที่กำลังทำแบบ ผลิต หรือจัดส่ง จะมาอยู่ที่หน้านี้"
        }
      />

      {orders === null ? (
        <div className="acd-olist">
          {[0, 1].map((i) => (
            <div key={i} className="acd-ocard" aria-label="กำลังโหลด">
              <span className="acd-skel acd-skel-line w40" />
              <span className="acd-skel acd-skel-line w60" />
              <span className="acd-skel acd-skel-btn" />
            </div>
          ))}
        </div>
      ) : ongoing.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">🏭</span>
          <h3>ไม่มีงานกำลังดำเนินการ</h3>
          <p>ทุกออเดอร์ของคุณเสร็จเรียบร้อยแล้ว — สั่งงานใหม่เมื่อไหร่ ติดตามได้ที่นี่</p>
          <Link href="/account/orders" className="btn btn-ghost acd-btn-compact">
            ดูประวัติการสั่งซื้อ <span className="dot">→</span>
          </Link>
        </div>
      ) : (
        <>
        <div className="acd-olist">
          {pager.slice.map((o) => {
            const owed = orderBalance(o);
            return (
              <article key={o.id} className="acd-ocard">
                <div className="acd-ocard-top">
                  <div className="acd-ocard-idcol">
                    <div className="acd-order-id">{o.id}</div>
                    <div className="acd-order-date">
                      {o.date} · {o.items[0]?.name ?? "—"}
                      {o.items.length > 1 ? ` +${o.items.length - 1}` : ""}
                      {o.rush ? " · ⚡ งานด่วน" : ""}
                    </div>
                  </div>
                  <span className={`acd-status s-${STEP_OF[o.status]}`}>
                    <i>{statusIcon(o)}</i> {o.status}
                  </span>
                </div>

                <OrderTracker order={o} />

                {o.shipDate?.from && (
                  <p className="acd-ocard-track">
                    📦 กำหนดส่งโดยประมาณ <b>{o.shipDate.from}{o.shipDate.to && o.shipDate.to !== o.shipDate.from ? ` – ${o.shipDate.to}` : ""}</b>
                  </p>
                )}

                {o.tracking && <ThaiPostBlock order={o} />}

                <div className="acd-divider" />
                <div className="acd-ocard-foot">
                  <div className={`acd-ocard-sum${owed > 0 ? " owed" : ""}`}>
                    <span>{owed > 0 ? "ค้างชำระ" : "สถานะล่าสุด"}</span>
                    <b>{owed > 0 ? formatPrice(owed) : o.status}</b>
                  </div>
                  <div className="acd-ocard-actions">
                    {owed > 0 ? (
                      <Link href={orderHref(o)} className="btn btn-yolk acd-btn-compact">
                        ชำระเงิน <span className="dot">→</span>
                      </Link>
                    ) : (
                      <Link href={orderHref(o)} className="btn btn-primary acd-btn-compact">
                        ดูรายละเอียด <span className="dot">→</span>
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <Pager {...pager} />
        </>
      )}
    </AccountShell>
  );
}

/** สถานะพัสดุไปรษณีย์ไทย — มี token = ไทม์ไลน์สดในหน้า · ไม่มี = ลิงก์ไปเว็บ ปณ. */
function ThaiPostBlock({ order: o }: { order: Order }) {
  const [st, setSt] = useState<{ loading: boolean; events?: ThpEventView[] }>({ loading: true });
  const trackUrl = `https://track.thailandpost.co.th/?trackNumber=${encodeURIComponent(o.tracking ?? "")}`;

  useEffect(() => {
    if (!o.key) {
      setSt({ loading: false });
      return;
    }
    let live = true;
    fetch(`/api/orders/track?orderId=${encodeURIComponent(o.id)}&key=${encodeURIComponent(o.key)}`)
      .then((r) => r.json())
      .then((j) => live && setSt({ loading: false, events: j.events }))
      .catch(() => live && setSt({ loading: false }));
    return () => {
      live = false;
    };
  }, [o.id, o.key]);

  return (
    <div className="acd-thp">
      <div className="acd-thp-head">
        🚚 เลขพัสดุ <b>{o.tracking}</b>
        <a href={trackUrl} target="_blank" rel="noreferrer" className="acd-track-link">
          เช็คที่เว็บ ปณ. →
        </a>
      </div>
      {st.loading ? (
        <p className="acd-thp-wait">กำลังเช็คสถานะกับไปรษณีย์ไทย…</p>
      ) : st.events?.length ? (
        <ThaiPostTimeline events={st.events} />
      ) : null}
    </div>
  );
}

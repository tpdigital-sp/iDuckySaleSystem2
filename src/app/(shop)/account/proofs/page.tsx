"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { proofsOf, type Order, type OrderItem } from "@/lib/admin-data";
import { reviewProof } from "@/lib/order-repo";
import { AccountHead, AccountShell } from "@/components/account/AccountShell";
import { orderHref, useAccountOrders } from "@/components/account/useAccountOrders";

/*
 * อนุมัติแบบ / ขอแก้ไข — กล่องรวมแบบงานจากทุกออเดอร์ไว้หน้าเดียว
 * อนุมัติ/ขอแก้ไขทั้งรายการได้จากตรงนี้เลย (ผ่าน /api/orders/review ตัวเดียวกับหน้าออเดอร์)
 * ส่วนการตรวจทีละภาพ + ภาพขยาย ใช้หน้าออเดอร์เดิมซึ่งมี lightbox ครบอยู่แล้ว
 */

/** รายการที่ยังรอลูกค้าตรวจ — มีแบบ และยังมีภาพที่ยังไม่ให้ผล */
const isPending = (it: OrderItem) => proofsOf(it).length > 0 && it.proofStatus !== "อนุมัติ" && proofsOf(it).some((p) => !p.review);

export default function ProofsPage() {
  const { customer, loading, orders, setOrders } = useAccountOrders();
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // "orderId:itemIdx"
  const [askEdit, setAskEdit] = useState<{ order: Order; itemIdx: number } | null>(null);
  const [note, setNote] = useState("");

  /** ออเดอร์ที่มีรายการรอตรวจ (เก็บ index จริงของรายการไว้เรียก API) */
  const pending = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.status !== "ยกเลิก")
        .map((o) => ({ order: o, items: o.items.map((it, i) => ({ it, i })).filter(({ it }) => isPending(it)) }))
        .filter((g) => g.items.length > 0),
    [orders],
  );
  /** ผลตรวจที่ผ่านมา — รายการที่มีแบบและจบแล้ว (อนุมัติ/ขอแก้ไขไปแล้ว) */
  const done = useMemo(
    () =>
      (orders ?? [])
        .flatMap((o) => o.items.map((it, i) => ({ order: o, it, i })))
        .filter(({ it }) => proofsOf(it).length > 0 && !isPending(it) && it.proofStatus)
        .slice(0, 12),
    [orders],
  );
  const pendingCount = pending.reduce((n, g) => n + g.items.length, 0);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 2600);
  }

  /** ส่งผลตรวจทั้งรายการ — สำเร็จแล้วเอาออเดอร์ล่าสุดจากเซิร์ฟเวอร์มาทับของเดิมในหน้า */
  async function act(order: Order, itemIdx: number, action: "approve" | "request", noteText?: string) {
    const k = `${order.id}:${itemIdx}`;
    if (busy) return;
    setBusy(k);
    const r = await reviewProof(order.id, order.key ?? "", itemIdx, action, noteText);
    setBusy(null);
    if (!r.ok || !r.order) return showToast(r.error ?? "ส่งผลตรวจไม่สำเร็จ");
    const updated = r.order;
    setOrders((os) => (os ? os.map((o) => (o.id === updated.id ? updated : o)) : os));
    showToast(action === "approve" ? "อนุมัติแบบแล้ว ✓ ทีมงานเริ่มขั้นตอนต่อไปได้เลย" : "ส่งคำขอแก้ไขแล้ว ✏️ ทีมกราฟฟิกจะแก้ให้โดยเร็ว");
  }

  async function submitEdit() {
    if (!askEdit) return;
    const text = note.trim();
    if (!text) return showToast("ช่วยพิมพ์จุดที่อยากให้แก้สักนิดนะครับ");
    const target = askEdit;
    setAskEdit(null);
    setNote("");
    await act(target.order, target.itemIdx, "request", text);
  }

  if (loading || !customer) {
    return (
      <AccountShell active="proof">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="proof" proofCount={pendingCount}>
      <AccountHead
        ico="proof"
        title="อนุมัติแบบ / ขอแก้ไข"
        sub={pendingCount > 0 ? `มีแบบรอคุณตรวจ ${pendingCount} รายการ — อนุมัติแล้วงานถึงเข้าคิวผลิตได้` : "แบบงานจากทุกออเดอร์จะมารอให้ตรวจที่หน้านี้"}
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
      ) : pending.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">🖼️</span>
          <h3>ไม่มีแบบรอตรวจ</h3>
          <p>เมื่อทีมกราฟฟิกทำแบบเสร็จ ภาพจะมาโผล่ที่นี่พร้อมแจ้งเตือนทาง LINE</p>
          <Link href="/account/orders" className="btn btn-ghost acd-btn-compact">
            ดูประวัติการสั่งซื้อ <span className="dot">→</span>
          </Link>
        </div>
      ) : (
        <div className="acd-olist">
          {pending.map(({ order: o, items }) => (
            <article key={o.id} className="acd-ocard">
              <div className="acd-ocard-top">
                <div className="acd-ocard-idcol">
                  <div className="acd-order-id">{o.id}</div>
                  <div className="acd-order-date">{o.date}</div>
                </div>
                <Link href={orderHref(o)} className="acd-track-link">
                  เปิดหน้าออเดอร์ →
                </Link>
              </div>

              {items.map(({ it, i }) => {
                const proofs = proofsOf(it);
                const left = proofs.filter((p) => !p.review).length;
                const working = busy === `${o.id}:${i}`;
                return (
                  <div key={i} className="acd-prf-item">
                    <div className="acd-prf-name">
                      <b>{it.name}</b>
                      <span>
                        ×{it.qty}
                        {proofs.length > 1 ? ` · ${proofs.length} ภาพ` : ""}
                      </span>
                    </div>
                    <div className="acd-thumbs">
                      {proofs.map((p, j) => (
                        <Link key={j} href={orderHref(o)} className="acd-thumb" title="แตะเพื่อดูภาพขยาย / ตรวจทีละภาพ">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={`แบบงาน ${it.name} ภาพที่ ${j + 1}`} loading="lazy" />
                          {p.review && <span className={`acd-thumb-mark ${p.review === "อนุมัติ" ? "ok" : "edit"}`}>{p.review === "อนุมัติ" ? "✓" : "✏"}</span>}
                        </Link>
                      ))}
                    </div>
                    <div className="acd-prf-acts">
                      <button type="button" className="btn btn-primary acd-btn-compact" disabled={working} onClick={() => act(o, i, "approve")}>
                        {working ? "กำลังส่ง…" : `✅ อนุมัติ${proofs.length > 1 && left < proofs.length ? `ที่เหลือ (${left})` : "แบบนี้"}`}
                      </button>
                      <button type="button" className="btn btn-ghost acd-btn-compact" disabled={working} onClick={() => setAskEdit({ order: o, itemIdx: i })}>
                        ✏️ ขอแก้ไข
                      </button>
                      {proofs.length > 1 && (
                        <Link href={orderHref(o)} className="acd-prf-more">
                          ตรวจทีละภาพ →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </article>
          ))}
        </div>
      )}

      {/* ผลตรวจที่ผ่านมา */}
      {done.length > 0 && (
        <div className="acd-prf-done">
          <div className="acd-menu-head">ผลตรวจที่ผ่านมา</div>
          <ul className="acd-prf-done-list">
            {done.map(({ order: o, it, i }) => (
              <li key={`${o.id}:${i}`}>
                <span className={`acd-prf-chip ${it.proofStatus === "อนุมัติ" ? "ok" : "edit"}`}>{it.proofStatus === "อนุมัติ" ? "✓ อนุมัติแล้ว" : "✏ กำลังแก้ไข"}</span>
                <span className="acd-prf-done-name">{it.name}</span>
                <Link href={orderHref(o)} className="acd-track-link">
                  {o.id} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ขอแก้ไข — กล่องพิมพ์รายละเอียด */}
      {askEdit && (
        <div className="acd-modal" onClick={(e) => e.target === e.currentTarget && setAskEdit(null)}>
          <div className="acd-modal-box" role="dialog" aria-modal="true" aria-labelledby="acd-prf-edit-h">
            <button type="button" className="acd-modal-close" aria-label="ปิด" onClick={() => setAskEdit(null)}>
              ✕
            </button>
            <div className="acd-confirm-icon">✏️</div>
            <h3 id="acd-prf-edit-h">ขอแก้ไขแบบ</h3>
            <p className="acd-modal-sub">
              {askEdit.order.items[askEdit.itemIdx]?.name} — บอกทีมกราฟฟิกหน่อยว่าอยากให้ปรับตรงไหน
            </p>
            <textarea
              className="acd-addr-input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ขยับโลโก้ขึ้นอีกนิด · เปลี่ยนสีตัวหนังสือเป็นสีขาว · ตัวสะกดชื่อร้านผิด"
              autoFocus
            />
            <div className="acd-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAskEdit(null)}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary" onClick={submitEdit}>
                ส่งคำขอแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountShell>
  );
}

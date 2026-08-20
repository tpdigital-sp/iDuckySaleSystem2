"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { proofsOf, type Order } from "@/lib/admin-data";
import { useReorder } from "@/lib/reorder";
import { AccountHead, AccountShell } from "@/components/account/AccountShell";
import { orderHref, useAccountOrders } from "@/components/account/useAccountOrders";

/*
 * ไฟล์งานของฉัน / สั่งซ้ำ — รวมไฟล์จากทุกออเดอร์ไว้ที่เดียว:
 * "ลายของฉัน" = ไฟล์ที่ลูกค้าอัปโหลดตอนสั่ง (artworkUrls) · "แบบจากร้าน" = แบบงานที่กราฟฟิกทำ (proofs)
 * ไม่มีตารางไฟล์แยก — เดินจากออเดอร์ที่มีอยู่ (ยอดต่อลูกค้ายังน้อย ประกอบฝั่งนี้เร็วพอ)
 */

type FileKind = "all" | "mine" | "shop";

interface OrderFiles {
  order: Order;
  mine: { url: string; label: string }[];
  shop: { url: string; label: string; approved: boolean }[];
}

export default function FilesPage() {
  const { customer, loading, orders } = useAccountOrders();
  const [kind, setKind] = useState<FileKind>("all");
  const [toast, setToast] = useState("");

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 2600);
  }
  const { reorder, canReorder } = useReorder(showToast);

  /** ออเดอร์ → ไฟล์สองกลุ่ม (ข้ามออเดอร์ที่ไม่มีไฟล์เลย) */
  const groups = useMemo<OrderFiles[]>(
    () =>
      (orders ?? [])
        .filter((o) => o.status !== "ยกเลิก")
        .map((o) => ({
          order: o,
          mine: o.items.flatMap((it) => (it.artworkUrls ?? []).map((url, j) => ({ url, label: `${it.name}${(it.artworkUrls?.length ?? 0) > 1 ? ` (${j + 1})` : ""}` }))),
          shop: o.items.flatMap((it) => proofsOf(it).map((p, j) => ({ url: p.url, label: `${it.name}${proofsOf(it).length > 1 ? ` (${j + 1})` : ""}`, approved: p.review === "อนุมัติ" || it.proofStatus === "อนุมัติ" }))),
        }))
        .filter((g) => g.mine.length + g.shop.length > 0),
    [orders],
  );
  const totalMine = groups.reduce((n, g) => n + g.mine.length, 0);
  const totalShop = groups.reduce((n, g) => n + g.shop.length, 0);
  const shown = groups.filter((g) => (kind === "mine" ? g.mine.length : kind === "shop" ? g.shop.length : g.mine.length + g.shop.length) > 0);

  if (loading || !customer) {
    return (
      <AccountShell active="files">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="files">
      <AccountHead
        ico="files"
        title="ไฟล์งานของฉัน / สั่งซ้ำ"
        sub={groups.length > 0 ? "ลายที่เคยอัปโหลดและแบบงานจากร้าน — แตะภาพเพื่อเปิด/ดาวน์โหลด หรือกดสั่งซ้ำได้เลย" : "ไฟล์ลายและแบบงานจากออเดอร์ของคุณจะมารวมอยู่ที่นี่"}
      />

      {groups.length > 0 && (
        <div className="acd-filters" role="tablist" aria-label="กรองชนิดไฟล์">
          {(
            [
              ["all", "ทั้งหมด", totalMine + totalShop],
              ["mine", "ลายของฉัน", totalMine],
              ["shop", "แบบจากร้าน", totalShop],
            ] as [FileKind, string, number][]
          ).map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`acd-ttab${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
              {label} <span className="acd-ttab-n">{n}</span>
            </button>
          ))}
        </div>
      )}

      {orders === null ? (
        <div className="acd-olist">
          {[0, 1].map((i) => (
            <div key={i} className="acd-ocard" aria-label="กำลังโหลด">
              <span className="acd-skel acd-skel-line w40" />
              <span className="acd-skel acd-skel-line w60" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">📁</span>
          <h3>ยังไม่มีไฟล์งาน</h3>
          <p>ไฟล์ลายที่อัปโหลดตอนสั่งซื้อ และแบบงานจากทีมกราฟฟิก จะถูกเก็บไว้ให้ที่นี่</p>
          <Link href="/products" className="btn btn-yolk">
            ไปเลือกสินค้า <span className="dot">→</span>
          </Link>
        </div>
      ) : (
        <div className="acd-olist">
          {shown.map(({ order: o, mine, shop }) => (
            <article key={o.id} className="acd-ocard">
              <div className="acd-ocard-top">
                <div className="acd-ocard-idcol">
                  <div className="acd-order-id">{o.id}</div>
                  <div className="acd-order-date">
                    {o.date} · {o.items.length} รายการ
                  </div>
                </div>
                <div className="acd-ocard-actions">
                  {canReorder(o) && (
                    <button type="button" className="btn btn-ghost acd-btn-compact" onClick={() => reorder(o)}>
                      สั่งซ้ำ <span className="dot">🔁</span>
                    </button>
                  )}
                  <Link href={orderHref(o)} className="acd-track-link">
                    เปิดออเดอร์ →
                  </Link>
                </div>
              </div>

              {kind !== "shop" && mine.length > 0 && (
                <FileGrid title={`🎨 ลายของฉัน (${mine.length})`} files={mine.map((f) => ({ ...f, tag: undefined }))} />
              )}
              {kind !== "mine" && shop.length > 0 && (
                <FileGrid title={`🖼️ แบบจากร้าน (${shop.length})`} files={shop.map((f) => ({ url: f.url, label: f.label, tag: f.approved ? "✓" : undefined }))} />
              )}
            </article>
          ))}
        </div>
      )}

      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountShell>
  );
}

/** กริดภาพไฟล์ — แตะเปิดไฟล์เต็มในแท็บใหม่ (ดาวน์โหลด/แชร์ต่อจากตรงนั้นได้) */
function FileGrid({ title, files }: { title: string; files: { url: string; label: string; tag?: string }[] }) {
  return (
    <div className="acd-file-sec">
      <div className="acd-file-head">{title}</div>
      <div className="acd-thumbs">
        {files.map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" className="acd-thumb" title={`เปิดไฟล์ ${f.label}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.label} loading="lazy" />
            {f.tag && <span className="acd-thumb-mark ok">{f.tag}</span>}
            <span className="acd-thumb-tag">{f.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

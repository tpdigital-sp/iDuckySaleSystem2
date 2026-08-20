"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { abbrevName, starsOf, type Review } from "@/lib/reviews";
import { fetchMyReviews, submitReview } from "@/lib/reviews-repo";
import { uploadArtworkFile } from "@/lib/artwork-upload";
import { AccountHead, AccountShell } from "@/components/account/AccountShell";
import { useAccountOrders } from "@/components/account/useAccountOrders";
import { Pager, usePager } from "@/components/account/Pager";

/*
 * รีวิว / ให้คะแนนสินค้า — รีวิวได้เฉพาะสินค้าจากออเดอร์ "เสร็จสิ้น" (ยืนยันซื้อจริง)
 * รีวิวขึ้นหน้าสินค้าหลังทีมงานตรวจ · 1 รีวิว/สินค้า/ออเดอร์
 */

interface PendingItem {
  orderId: string;
  productId: string;
  name: string;
  image?: string;
}

const thDate = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
};

export default function ReviewsPage() {
  const { customer, loading, orders } = useAccountOrders();
  const { productOf } = useCart();
  const [mine, setMine] = useState<Review[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [tab, setTab] = useState<"pending" | "mine">("pending");
  const [target, setTarget] = useState<PendingItem | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!customer) return;
    fetchMyReviews().then((r) => {
      setMine(r.reviews);
      setNeedsSetup(!!r.needsSetup);
    });
  }, [customer]);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 3200);
  }

  /** สินค้าที่รอรีวิว — จากออเดอร์เสร็จสิ้น ตัดตัวที่รีวิวแล้ว (คู่ ออเดอร์+สินค้า) */
  const pending = useMemo<PendingItem[]>(() => {
    const done = new Set((mine ?? []).map((r) => `${r.orderId}|${r.productId}`));
    const out: PendingItem[] = [];
    for (const o of (orders ?? []).filter((o) => o.status === "เสร็จสิ้น")) {
      const seen = new Set<string>();
      for (const it of o.items) {
        const key = `${o.id}|${it.productId}`;
        if (seen.has(key) || done.has(key)) continue;
        seen.add(key);
        out.push({ orderId: o.id, productId: it.productId, name: it.name, image: productOf(it.productId)?.imageSrc });
      }
    }
    return out;
  }, [orders, mine, productOf]);

  const pendingPager = usePager(pending, 8, tab);
  const minePager = usePager(mine ?? [], 8, tab);

  if (loading || !customer) {
    return (
      <AccountShell active="reviews">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="reviews">
      <AccountHead
        ico="review"
        title="รีวิว / ให้คะแนนสินค้า"
        sub={pending.length > 0 ? `มีสินค้า ${pending.length} รายการรอรีวิว — รีวิวของคุณช่วยลูกค้าคนถัดไปตัดสินใจง่ายขึ้นมาก 💙` : "รีวิวได้เฉพาะสินค้าที่ซื้อจริง — ขึ้นหน้าสินค้าหลังทีมงานตรวจ"}
      />

      {!needsSetup && (
        <div className="acd-filters" role="tablist" aria-label="เลือกดู">
          <button type="button" role="tab" aria-selected={tab === "pending"} className={`acd-ttab${tab === "pending" ? " on" : ""}`} onClick={() => setTab("pending")}>
            รอรีวิว <span className="acd-ttab-n">{pending.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "mine"} className={`acd-ttab${tab === "mine" ? " on" : ""}`} onClick={() => setTab("mine")}>
            รีวิวของฉัน <span className="acd-ttab-n">{mine?.length ?? 0}</span>
          </button>
        </div>
      )}

      {needsSetup ? (
        <div className="acd-empty small">
          <span className="acd-empty-ico">⭐</span>
          <p>ระบบรีวิวกำลังเตรียมเปิดใช้ — อีกไม่นานเจอกันครับ</p>
        </div>
      ) : mine === null || orders === null ? (
        <div className="acd-olist">
          <div className="acd-ocard" aria-label="กำลังโหลด">
            <span className="acd-skel acd-skel-line w40" />
            <span className="acd-skel acd-skel-line w60" />
          </div>
        </div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <div className="acd-empty">
            <span className="acd-empty-ico">🌟</span>
            <h3>ไม่มีสินค้ารอรีวิว</h3>
            <p>{(mine?.length ?? 0) > 0 ? "รีวิวครบทุกตัวแล้ว ขอบคุณมากครับ 💙" : "เมื่อออเดอร์เสร็จสิ้น สินค้าจะมารอให้รีวิวที่นี่"}</p>
            <Link href="/products" className="btn btn-yolk">
              ไปเลือกสินค้า <span className="dot">→</span>
            </Link>
          </div>
        ) : (
          <>
            <div className="acd-rvw-grid">
              {pendingPager.slice.map((p) => (
                <div key={`${p.orderId}|${p.productId}`} className="acd-rvw-card">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="acd-rvw-img" loading="lazy" />
                  ) : (
                    <span className="acd-rvw-img acd-rvw-img-empty">🖼️</span>
                  )}
                  <div className="acd-rvw-col">
                    <b>{p.name}</b>
                    <span>ออเดอร์ {p.orderId}</span>
                  </div>
                  <button type="button" className="btn btn-yolk acd-btn-compact" onClick={() => setTarget(p)}>
                    ⭐ รีวิว
                  </button>
                </div>
              ))}
            </div>
            <Pager {...pendingPager} unit="รายการ" />
          </>
        )
      ) : (mine?.length ?? 0) === 0 ? (
        <div className="acd-empty small">
          <span className="acd-empty-ico">⭐</span>
          <p>ยังไม่เคยรีวิว — เริ่มจากแท็บ &quot;รอรีวิว&quot; ได้เลย</p>
        </div>
      ) : (
        <>
          <div className="acd-olist">
            {minePager.slice.map((r) => (
              <article key={r.id} className="acd-ocard acd-rvw-mine">
                <div className="acd-ocard-top">
                  <div className="acd-ocard-idcol">
                    <div className="acd-rvw-stars" aria-label={`ให้ ${r.score} จาก 5 ดาว`}>
                      {starsOf(r.score)}
                    </div>
                    <div className="acd-order-date">
                      {r.productName ?? r.productId} · {thDate(r.createdAt)} · ในชื่อ {r.displayName}
                    </div>
                  </div>
                  <span className={`acd-clm-chip ${r.status === "แสดง" ? "ok" : r.status === "รอตรวจ" ? "new" : "done"}`}>
                    {r.status === "แสดง" ? "ขึ้นหน้าสินค้าแล้ว" : r.status === "รอตรวจ" ? "รอทีมงานตรวจ" : "ไม่แสดง"}
                  </span>
                </div>
                {r.text && <p className="acd-clm-detail">{r.text}</p>}
                {r.reply && (
                  <p className="acd-clm-items">
                    💬 ร้านตอบ: {r.reply.text}
                  </p>
                )}
              </article>
            ))}
          </div>
          <Pager {...minePager} unit="รีวิว" />
        </>
      )}

      {target && (
        <ReviewModal
          item={target}
          defaultName={abbrevName(customer.name || "")}
          onClose={() => setTarget(null)}
          onDone={(r) => {
            setTarget(null);
            setMine((ms) => [r, ...(ms ?? [])]);
            showToast("ส่งรีวิวแล้ว ✓ จะขึ้นหน้าสินค้าหลังทีมงานตรวจครับ ขอบคุณมาก 💙");
          }}
        />
      )}

      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountShell>
  );
}

/** ฟอร์มเขียนรีวิว */
function ReviewModal({ item, defaultName, onClose, onDone }: { item: PendingItem; defaultName: string; onClose: () => void; onDone: (r: Review) => void }) {
  const [score, setScore] = useState(5);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState(defaultName);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setErr("");
    setUploading(true);
    for (const f of files.slice(0, 3 - photos.length)) {
      try {
        const url = await uploadArtworkFile(f);
        setPhotos((ps) => [...ps, { url, name: f.name }]);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "อัปโหลดไม่สำเร็จ");
        break;
      }
    }
    setUploading(false);
  }

  async function submit() {
    if (busy) return;
    setErr("");
    setBusy(true);
    const r = await submitReview({
      orderId: item.orderId,
      productId: item.productId,
      score,
      text: text.trim() || undefined,
      displayName: name.trim() || undefined,
      photoUrls: photos.map((p) => p.url),
    });
    setBusy(false);
    if (!r.ok || !r.review) return setErr(r.error ?? "ส่งรีวิวไม่สำเร็จ");
    onDone(r.review);
  }

  const shownScore = hover || score;

  return (
    <div className="acd-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acd-modal-box acd-clm-form" role="dialog" aria-modal="true" aria-labelledby="acd-rvw-h">
        <button type="button" className="acd-modal-close" aria-label="ปิด" onClick={onClose}>
          ✕
        </button>
        <h3 id="acd-rvw-h">รีวิว {item.name}</h3>
        <p className="acd-modal-sub">จากออเดอร์ {item.orderId} · รีวิวจะขึ้นหน้าสินค้าพร้อมป้าย &quot;ซื้อจริง&quot;</p>

        <div className="acd-rvw-pick" role="radiogroup" aria-label="ให้คะแนน 1 ถึง 5 ดาว">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={score === s}
              aria-label={`${s} ดาว`}
              className={shownScore >= s ? "on" : ""}
              onClick={() => setScore(s)}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(0)}
            >
              ★
            </button>
          ))}
          <span className="acd-rvw-pick-label">{["", "ต้องปรับปรุง", "พอใช้", "โอเค", "ดีมาก", "เยี่ยมสุดๆ"][shownScore]}</span>
        </div>

        <label className="acd-clm-label">เล่าให้ลูกค้าคนถัดไปฟังหน่อย (ไม่บังคับ)</label>
        <textarea
          className="acd-addr-input"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="เช่น งานพิมพ์คมมาก สีตรงตามแบบ แพ็คมาดีไม่มีรอยขีดข่วน"
        />

        <label className="acd-clm-label">
          รูปงานจริง ({photos.length}/3) <span className="acd-clm-hint">รีวิวมีรูปช่วยลูกค้าคนอื่นได้มากที่สุด</span>
        </label>
        <div className="acd-clm-photos">
          {photos.map((p, i) => (
            <span key={p.url} className="acd-clm-photo-chip">
              📷 {p.name.length > 18 ? `${p.name.slice(0, 15)}…` : p.name}
              <button type="button" aria-label={`ลบรูป ${p.name}`} onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          ))}
          {photos.length < 3 && (
            <button type="button" className="btn btn-ghost acd-btn-compact" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "กำลังอัปโหลด…" : "＋ เพิ่มรูป"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPickFiles} />
        </div>

        <label className="acd-clm-label">ชื่อที่แสดงบนรีวิว</label>
        <input className="acd-clm-select" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="เช่น คุณดวงใจ ศ." />

        {err && <p className="acd-clm-err">{err}</p>}

        <div className="acd-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || uploading}>
            {busy ? "กำลังส่ง…" : "ส่งรีวิว"}
          </button>
        </div>
      </div>
    </div>
  );
}

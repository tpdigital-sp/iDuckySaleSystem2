"use client";

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { btnSmNeutral, cardPad, faint, h1, input, muted, pillActive, pillIdle } from "@/lib/admin-ui";
import { REVIEW_STATUS_STYLES, starsOf, type Review, type ReviewStatus } from "@/lib/reviews";

/**
 * รีวิวสินค้า (หลังบ้าน) — ตรวจก่อนขึ้นหน้าสินค้า
 * "แสดง" = ขึ้นหน้าสินค้า + นับเข้าคะแนนดาว (JSON-LD ให้ Google) · "ซ่อน" = เก็บไว้เฉยๆ ไม่แสดง
 */

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

function ReviewsPageInner() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<"รอตรวจ" | "ทั้งหมด" | ReviewStatus>("รอตรวจ");

  useEffect(() => {
    fetch("/api/admin/reviews", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setReviews(j.reviews ?? []);
        setNeedsSetup(!!j.needsSetup);
      })
      .catch(() => setReviews([]));
  }, []);

  const shown = useMemo(() => {
    const rs = reviews ?? [];
    return filter === "ทั้งหมด" ? rs : rs.filter((r) => r.status === filter);
  }, [reviews, filter]);

  const waiting = (reviews ?? []).filter((r) => r.status === "รอตรวจ").length;

  if (reviews === null) return <p className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>⭐ รีวิวสินค้า</h1>
      <p className={`mt-1 ${muted}`}>รีวิวจากลูกค้าที่ซื้อจริง — กด &quot;แสดง&quot; แล้วขึ้นหน้าสินค้า + นับเข้าดาวที่ Google เห็น</p>

      {needsSetup ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          ยังไม่มีตาราง <code className="font-mono">reviews</code> — รัน <code className="font-mono">supabase/reviews.sql</code> ใน Supabase SQL
          Editor หนึ่งครั้ง
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {(["รอตรวจ", "แสดง", "ซ่อน", "ทั้งหมด"] as const).map((f) => (
              <button key={f} type="button" className={filter === f ? pillActive : pillIdle} onClick={() => setFilter(f)}>
                {f}
                {f === "รอตรวจ" && waiting > 0 && <span className="ml-1 tabular-nums">({waiting})</span>}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className={`mt-5 p-10 text-center ${cardPad}`}>
              <span className="text-4xl">⭐</span>
              <p className={`mt-3 text-sm ${muted}`}>{filter === "รอตรวจ" ? "ไม่มีรีวิวรอตรวจ" : "ไม่มีรีวิวในกลุ่มนี้"}</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {shown.map((r) => (
                <ReviewRow key={r.id} review={r} onUpdate={(u) => setReviews((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewRow({ review: r, onUpdate }: { review: Review; onUpdate: (r: Review) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function patch(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, ...body }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !j.review) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
    onUpdate(j.review as Review);
  }

  return (
    <article className={cardPad}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            <span className="text-amber-500">{starsOf(r.score)}</span> {r.displayName}
            <span className={`ml-2 text-xs font-normal ${faint}`}>
              {r.id} · {thTime(r.createdAt)}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            <Link href={`/products/${encodeURIComponent(r.productId)}`} className="font-semibold text-sky-700 hover:underline" target="_blank">
              {r.productName ?? r.productId}
            </Link>{" "}
            · ออเดอร์{" "}
            <Link href={`/admin/orders/${encodeURIComponent(r.orderId)}`} className="text-sky-700 hover:underline">
              {r.orderId}
            </Link>
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REVIEW_STATUS_STYLES[r.status]}`}>{r.status}</span>
      </div>

      {r.text && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">{r.text}</p>}

      {(r.photoUrls?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.photoUrls!.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`รูปรีวิว ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {r.reply && (
        <p className="mt-3 text-sm text-slate-600">
          💬 <b>{r.reply.name || "ร้าน"}ตอบ:</b> {r.reply.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {r.status !== "แสดง" && (
          <button type="button" className={`${btnSmNeutral} !bg-emerald-600 !text-white !border-emerald-600 hover:!bg-emerald-700`} disabled={busy} onClick={() => patch({ status: "แสดง" })}>
            ✓ อนุมัติให้แสดง
          </button>
        )}
        {r.status !== "ซ่อน" && (
          <button type="button" className={btnSmNeutral} disabled={busy} onClick={() => patch({ status: "ซ่อน" })}>
            ซ่อน
          </button>
        )}
        <input
          className={`${input} !w-auto flex-1`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reply.trim() && patch({ reply: reply.trim() }).then(() => setReply(""))}
          placeholder="ตอบกลับรีวิว (โชว์ใต้รีวิวบนหน้าสินค้า)…"
        />
        <button type="button" className={btnSmNeutral} disabled={busy || !reply.trim()} onClick={() => patch({ reply: reply.trim() }).then(() => setReply(""))}>
          ตอบ
        </button>
      </div>

      {err && <p className="mt-2 text-sm font-semibold text-rose-600">{err}</p>}
    </article>
  );
}

export default function ReviewsPage() {
  return (
    <RequirePerm perm="orders.viewAll">
      <ReviewsPageInner />
    </RequirePerm>
  );
}

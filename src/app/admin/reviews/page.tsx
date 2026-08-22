"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * รีวิวสินค้า /admin/reviews — ตรวจก่อนขึ้นหน้าสินค้า  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * "แสดง" = ขึ้นหน้าสินค้า + นับเข้าคะแนนดาว (JSON-LD ให้ Google) · "ซ่อน" = เก็บไว้เฉย ๆ
 *
 * ของที่เพิ่มจากเดิม: รีวิวคะแนนต่ำเด้งเป็นแถบคอรัลและขึ้นก่อน — รีวิว 2 ดาว
 * ที่อนุมัติไปเฉย ๆ โดยไม่ตอบ คือสิ่งที่ลูกค้าคนถัดไปเห็น
 */

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { starsOf, type Review, type ReviewStatus } from "@/lib/reviews";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";

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

  const all = reviews ?? [];
  const m = useMemo(() => {
    const shown = all.filter((r) => r.status === "แสดง");
    return {
      waiting: all.filter((r) => r.status === "รอตรวจ").length,
      hidden: all.filter((r) => r.status === "ซ่อน").length,
      shown: shown.length,
      avg: shown.length ? shown.reduce((s, r) => s + r.score, 0) / shown.length : 0,
      // รีวิวคะแนนต่ำที่ยังไม่ได้ตอบ — สิ่งที่ลูกค้าคนถัดไปจะเห็น
      lowNoReply: all.filter((r) => r.score <= 2 && !r.reply).length,
    };
  }, [all]);

  const list = useMemo(() => {
    const rs = filter === "ทั้งหมด" ? all : all.filter((r) => r.status === filter);
    // คะแนนต่ำขึ้นก่อน แล้วใหม่สุดขึ้นก่อน
    return [...rs].sort((a, b) => a.score - b.score || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [all, filter]);

  if (reviews === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงรีวิวจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="รีวิวสินค้า"
        count={`${all.length} รีวิว`}
        sub="รีวิวจากลูกค้าที่ซื้อจริง — กด “อนุมัติให้แสดง” แล้วขึ้นหน้าสินค้า + นับเข้าดาวที่ Google เห็น"
      />

      {needsSetup ? (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่มีตาราง reviews"
            detail="รัน supabase/reviews.sql ใน Supabase SQL Editor หนึ่งครั้ง แล้วรีเฟรชหน้านี้"
          />
        </div>
      ) : (
        <>
          <Stats cols={4}>
            <HeroStat
              n={m.waiting}
              label="รอตรวจ"
              detail={
                m.lowNoReply
                  ? `ในนี้คะแนนต่ำที่ยังไม่ได้ตอบ ${m.lowNoReply} รีวิว — ตอบก่อนอนุมัติ`
                  : "ยังไม่ขึ้นหน้าร้านจนกว่าจะอนุมัติ"
              }
              pct={all.length ? (m.waiting / all.length) * 100 : 0}
            />
            <Stat label="คะแนนเฉลี่ย" value={m.avg ? m.avg.toFixed(1) : "—"} hint={`จาก ${m.shown} รีวิวที่แสดงอยู่`} />
            <Stat label="ซ่อนไว้" value={m.hidden} hint="ไม่แสดงหน้าร้าน" />
          </Stats>

          <FilterCard>
            <TabRow>
              {(["รอตรวจ", "แสดง", "ซ่อน", "ทั้งหมด"] as const).map((f) => (
                <FChip
                  key={f}
                  on={filter === f}
                  onClick={() => setFilter(f)}
                  label={f}
                  count={f === "ทั้งหมด" ? all.length : all.filter((r) => r.status === f).length}
                />
              ))}
            </TabRow>
          </FilterCard>

          <ListHead title="รีวิว" note="คะแนนต่ำขึ้นก่อน" />

          {list.length === 0 ? (
            <Empty
              title={filter === "รอตรวจ" ? "ไม่มีรีวิวรอตรวจ" : "ไม่มีรีวิวในกลุ่มนี้"}
              body={filter === "รอตรวจ" ? "เคลียร์หมดแล้ว — รีวิวใหม่จะขึ้นตรงนี้เมื่อลูกค้าเขียนเข้ามา" : "ลองดูกลุ่มอื่นจากปุ่มด้านบน"}
            />
          ) : (
            <div className="grid gap-3">
              {list.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onUpdate={(u) => setReviews((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function ReviewCard({ review: r, onUpdate }: { review: Review; onUpdate: (r: Review) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const low = r.score <= 2;

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
    <article
      className="dkb-g relative overflow-hidden p-4 pl-5"
      style={{ ["--dk-tone" as string]: low ? "var(--dk-coral-deep)" : r.status === "แสดง" ? "var(--dk-mint)" : "var(--dk-yolk-deep)" }}
    >
      <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dkb-display text-[1rem]">
            <span style={{ color: "var(--dk-yolk-deep)" }}>{starsOf(r.score)}</span> {r.displayName}
          </p>
          <p className="dkb-meta">
            <Link
              href={`/products/${encodeURIComponent(r.productId)}`}
              target="_blank"
              className="font-semibold underline-offset-4 hover:underline"
              style={{ color: "var(--dk-blue-deep)" }}
            >
              {r.productName ?? r.productId}
            </Link>
            <Link href={`/admin/orders/${encodeURIComponent(r.orderId)}`} className="id underline-offset-4 hover:underline">
              {r.orderId}
            </Link>
            <span>{thTime(r.createdAt)}</span>
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {low && !r.reply && <Tag tone="solid">คะแนนต่ำ ยังไม่ได้ตอบ</Tag>}
          <Tag tone={r.status === "แสดง" ? "mint" : r.status === "ซ่อน" ? "quiet" : "yolk"}>{r.status}</Tag>
        </span>
      </div>

      {r.text && (
        <p
          className="mt-3 whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[14px]"
          style={{ background: low ? "var(--dk-coral-wash)" : "rgba(255,255,255,.65)", color: low ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}
        >
          {r.text}
        </p>
      )}

      {(r.photoUrls?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.photoUrls!.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer" className="dkb-thumb !h-20 w-20">
              <img src={u} alt={`รูปรีวิว ${i + 1}`} />
            </a>
          ))}
        </div>
      )}

      {r.reply && (
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          <b style={{ color: "var(--dk-navy)" }}>{r.reply.name || "ร้าน"}ตอบ:</b> {r.reply.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {r.status !== "แสดง" && (
          <Btn tone="navy" small disabled={busy} onClick={() => void patch({ status: "แสดง" })}>
            อนุมัติให้แสดง
          </Btn>
        )}
        {r.status !== "ซ่อน" && (
          <Btn small disabled={busy} onClick={() => void patch({ status: "ซ่อน" })}>
            ซ่อน
          </Btn>
        )}
        <label className="dkb-search !min-h-[38px] flex-1">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reply.trim()) void patch({ reply: reply.trim() }).then(() => setReply(""));
            }}
            placeholder="ตอบกลับรีวิว (โชว์ใต้รีวิวบนหน้าสินค้า)…"
          />
        </label>
        <Btn small disabled={busy || !reply.trim()} onClick={() => void patch({ reply: reply.trim() }).then(() => setReply(""))}>
          ตอบ
        </Btn>
      </div>

      {err && (
        <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}
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

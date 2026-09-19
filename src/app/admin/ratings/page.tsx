"use client";

/**
 * ความพึงพอใจลูกค้า /admin/ratings  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * ประเมินแบบนิรนาม — ระบบไม่บันทึกว่าใครประเมิน (เก็บเวลาแค่ระดับเดือน) จึงเปิดไปหาออเดอร์ไม่ได้
 *
 * ⚠️ แท็กมีความหมายกลับกันตามคะแนน (ดูฟอร์มใน (shop)/order/[id]/page.tsx):
 *    4–5 ดาว ถาม "ชอบตรงไหน" · 1–3 ดาว ถาม "อยากให้ปรับเรื่องไหน"
 *    ของเดิมนับแท็กรวมกันก้อนเดียว → "คุณภาพงานพิมพ์ · 5" ไม่รู้ว่าชมหรือติ
 *    ตอนนี้แยกเป็น ชม / ติ ต่อหมวด แล้วกดหมวดเพื่อกรองรายการได้
 *
 * ⚠️ month เก็บเป็น ค.ศ. "2026-09" (currentMonth ใน lib/ratings) — ของเดิมลบ 543 ทุกครั้ง
 *    ทำให้ "เฉลี่ยเดือนนี้" ว่างตลอดและตกไปใช้ค่าเฉลี่ยตลอดกาลเงียบ ๆ · monthsAgo รับได้ทั้ง ค.ศ./พ.ศ.
 */

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useMemo, useState } from "react";
import { markRatingsSeen, RATING_TAGS, SCORE_FACES, seenRatingIds, type RatingRow } from "@/lib/ratings";
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

const face = (s: number) => SCORE_FACES.find((f) => f.score === s);
/** 4–5 ดาว = แท็กคือเรื่องที่ชอบ · 1–3 = เรื่องที่อยากให้ปรับ (ตรงกับคำถามในฟอร์มลูกค้า) */
const isPraise = (s: number) => s >= 4;
const scoreTone = (s: number) => (s <= 2 ? "var(--dk-coral-deep)" : s === 3 ? "var(--dk-yolk-deep)" : "var(--dk-mint)");

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-09" (หรือ "2569-09") → { ce, m } */
function parseMonth(month: string): { ce: number; m: number } | null {
  const mm = month?.match(/(\d{4})-(\d{2})/);
  if (!mm) return null;
  const y = Number(mm[1]);
  return { ce: y > 2400 ? y - 543 : y, m: Number(mm[2]) };
}

/** เดือนนี้ห่างจากเดือนปัจจุบันกี่เดือน (0 = เดือนนี้) */
function monthsAgo(month: string): number | null {
  const p = parseMonth(month);
  if (!p) return null;
  const now = new Date();
  return (now.getFullYear() - p.ce) * 12 + (now.getMonth() + 1 - p.m);
}

/** "2026-09" → "ก.ย. 69" */
function thMonth(month: string): string {
  const p = parseMonth(month);
  if (!p) return month || "—";
  return `${TH_MON[p.m - 1] ?? p.m} ${String(p.ce + 543).slice(-2)}`;
}

const avgOf = (list: RatingRow[]) => (list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : 0);

type View = "all" | "low" | "comment" | "new";
type TagPick = { tag: string; side: "praise" | "gripe" } | null;

function RatingsPageInner() {
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  /** id ที่ยังไม่เคยเปิดดูก่อนรอบนี้ — จำไว้ก่อน markRatingsSeen จะเคลียร์ */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("all");
  const [score, setScore] = useState<number | null>(null);
  const [tagPick, setTagPick] = useState<TagPick>(null);
  const [showQuiet, setShowQuiet] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setRatings(null);
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        const rows = (j.ratings ?? []) as RatingRow[];
        const seen = seenRatingIds();
        // กด ↻ โหลดใหม่ = รายการที่เพิ่งเห็นรอบก่อนยังนับเป็น "ใหม่" อยู่ (markRatingsSeen เคลียร์ไปแล้ว)
        setFresh((prev) => new Set([...prev, ...rows.filter((r) => !seen.has(r.id)).map((r) => r.id)]));
        setRatings(rows);
        setNeedsSetup(!!j.needsSetup);
        markRatingsSeen(rows.map((r) => r.id)); // เปิดหน้านี้ = เห็นครบแล้ว (เคลียร์ badge)
      })
      .catch(() => {
        setFailed(true);
        setRatings([]);
      });
  }, []);

  useEffect(load, [load]);

  const m = useMemo(() => {
    const rows = ratings ?? [];
    const thisMonth = rows.filter((r) => monthsAgo(r.month) === 0);
    const lastMonth = rows.filter((r) => monthsAgo(r.month) === 1);

    // ชม / ติ ต่อหมวด — เรียงหมวดที่โดนติมากสุดขึ้นก่อน (เรื่องที่ต้องแก้)
    const tags = RATING_TAGS.map((t) => ({
      tag: t,
      praise: rows.filter((r) => isPraise(r.score) && (r.tags ?? []).includes(t)).length,
      gripe: rows.filter((r) => !isPraise(r.score) && (r.tags ?? []).includes(t)).length,
    })).sort((a, b) => b.gripe - a.gripe || b.praise - a.praise);
    const tagMax = Math.max(1, ...tags.map((t) => Math.max(t.praise, t.gripe)));

    // สรุปรายเดือน (ใหม่สุดก่อน · สูงสุด 6 เดือน)
    const byMonth = new Map<string, RatingRow[]>();
    rows.forEach((r) => byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]));
    const months = [...byMonth.entries()]
      .sort((a, b) => (monthsAgo(a[0]) ?? 999) - (monthsAgo(b[0]) ?? 999))
      .slice(0, 6)
      .map(([month, list]) => ({ month, n: list.length, avg: avgOf(list), low: list.filter((r) => r.score <= 2).length }));

    return {
      count: rows.length,
      avg: avgOf(rows),
      thisMonth,
      lastMonth,
      avgThis: avgOf(thisMonth),
      avgLast: avgOf(lastMonth),
      low: rows.filter((r) => r.score <= 2),
      happy: rows.filter((r) => r.score >= 4).length,
      withComment: rows.filter((r) => r.comment).length,
      dist: [5, 4, 3, 2, 1].map((s) => ({ s, n: rows.filter((r) => r.score === s).length })),
      tags,
      tagMax,
      months,
    };
  }, [ratings]);

  const list = useMemo(() => {
    let rows = ratings ?? [];
    if (view === "low") rows = rows.filter((r) => r.score <= 2);
    if (view === "comment") rows = rows.filter((r) => r.comment);
    if (view === "new") rows = rows.filter((r) => fresh.has(r.id));
    if (score !== null) rows = rows.filter((r) => r.score === score);
    if (tagPick)
      rows = rows.filter((r) => (r.tags ?? []).includes(tagPick.tag) && isPraise(r.score) === (tagPick.side === "praise"));
    // คะแนนต่ำขึ้นก่อน → เดือนใหม่สุด → มีคอมเมนต์ก่อน
    const sorted = [...rows].sort(
      (a, b) =>
        a.score - b.score ||
        (monthsAgo(a.month) ?? 999) - (monthsAgo(b.month) ?? 999) ||
        Number(!!b.comment) - Number(!!a.comment),
    );
    // แถว 4–5 ดาวที่ไม่มีคอมเมนต์ = ไม่มีอะไรให้อ่าน → ยุบเป็นบรรทัดเดียว
    const quiet = sorted.filter((r) => !r.comment && r.score >= 4);
    const loud = sorted.filter((r) => r.comment || r.score < 4);
    return { loud, quiet };
  }, [ratings, view, score, tagPick, fresh]);

  const filtered = view !== "all" || score !== null || tagPick !== null;
  const clearFilters = () => {
    setView("all");
    setScore(null);
    setTagPick(null);
  };

  if (ratings === null) {
    return (
      <PageShell>
        <PageHead group="ลูกค้า" title="ความพึงพอใจ" />
        <div className="mt-4">
          <Empty title="กำลังโหลดผลประเมิน…" body="ถ้าค้างนานเกิน 10 วินาที ลองรีเฟรชหน้า" />
        </div>
      </PageShell>
    );
  }

  const hasLast = m.lastMonth.length > 0;
  const hasThis = m.thisMonth.length > 0;
  const delta = hasThis && hasLast ? m.avgThis - m.avgLast : null;
  const heroN = hasThis ? m.avgThis : m.avg;
  const lowNew = m.low.filter((r) => fresh.has(r.id)).length;

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="ความพึงพอใจ"
        count={`${m.count} ครั้ง`}
        sub="ประเมินแบบนิรนาม — ไม่รู้ว่าใครประเมิน เก็บเวลาแค่ระดับเดือน"
        tools={
          <Btn onClick={load} title="ดึงผลประเมินล่าสุด">
            ↻ โหลดใหม่
          </Btn>
        }
      />

      {failed ? (
        <div className="mt-4">
          <Banner tone="hot" title="โหลดผลประเมินไม่สำเร็จ" detail="เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบ — กด ↻ โหลดใหม่ ด้านบน" />
        </div>
      ) : needsSetup ? (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่มีตาราง ratings"
            detail="รัน supabase/ratings.sql ใน Supabase SQL Editor หนึ่งครั้ง แล้วรีเฟรชหน้านี้"
          />
        </div>
      ) : m.count === 0 ? (
        <div className="mt-4">
          <Empty
            title="ยังไม่มีการประเมิน"
            body="ลูกค้าเห็นแบบประเมินในหน้าออเดอร์เมื่อสถานะเป็น จัดส่งแล้ว — ส่งลิงก์ออเดอร์ให้ลูกค้าหลังได้ของ จะได้คะแนนเข้ามา"
          />
        </div>
      ) : (
        <>
          <Stats>
            <HeroStat
              n={heroN.toFixed(1)}
              label={hasThis ? "คะแนนเฉลี่ยเดือนนี้" : "คะแนนเฉลี่ย (เดือนนี้ยังไม่มี)"}
              detail={`${
                delta !== null
                  ? `${delta > 0 ? "▲" : delta < 0 ? "▼" : "="} ${Math.abs(delta).toFixed(1)} จากเดือนก่อน (${m.avgLast.toFixed(1)}) · ${m.thisMonth.length} ครั้ง`
                  : hasThis
                    ? `จาก ${m.thisMonth.length} ครั้ง · เดือนก่อนไม่มีคะแนนให้เทียบ`
                    : `ทั้งหมด ${m.count} ครั้ง`
              }${hasThis ? ` · ตลอดกาล ${m.avg.toFixed(1)}` : ""}`}
              pct={heroN * 20}
            />
            <Stat
              label="ประทับใจ 4–5 ดาว"
              value={`${Math.round((m.happy / m.count) * 100)}%`}
              hint={`${m.happy} จาก ${m.count} ครั้ง`}
            />
            <Stat
              label="ต่ำกว่า 3 ดาว"
              value={m.low.length}
              hint={
                m.low.length
                  ? `ครั้ง — กดดูว่าติเรื่องอะไร${lowNew ? ` · ใหม่ ${lowNew}` : ""}`
                  : "ครั้ง · ไม่มีเรื่องต้องตาม"
              }
              tone={m.low.length ? "due" : undefined}
              onClick={m.low.length ? () => (clearFilters(), setView("low")) : undefined}
              active={view === "low"}
            />
          </Stats>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            {/* ชม / ติ ต่อหมวด — จุดเด่นของหน้า */}
            <section className="dkb-g p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 className="dkb-h2 text-[1.06rem]">ลูกค้าพูดถึงเรื่องไหน</h2>
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  กดตัวเลขเพื่อดูรายการ
                </span>
              </div>
              <p className="mt-1 px-1 text-[12px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
                ตัวเลข = จำนวนคนที่ติ๊กหมวดนั้นตอนประเมิน (1 คนติ๊กได้หลายหมวด) · ให้ 4–5 ดาว นับเป็นคำชม · ให้ 1–3 ดาว นับเป็นเรื่องที่อยากให้ปรับ
              </p>
              <div
                className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 px-1 text-[11.5px] font-semibold"
                style={{ color: "var(--dk-faint)" }}
              >
                <span>หมวด</span>
                {/* หัวคอลัมน์ชิดฝั่งตัวเลขของมันเอง — เดิมกองกลางจอ อ่านไม่ออกว่าเลขไหนของอะไร */}
                <span className="px-1.5" style={{ color: "var(--dk-coral-ink)" }}>
                  โดนติ (ครั้ง)
                </span>
                <span className="px-1.5 text-right" style={{ color: "var(--dk-mint-ink)" }}>
                  ได้คำชม (ครั้ง)
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {m.tags.map((t) => {
                  const gOn = tagPick?.tag === t.tag && tagPick.side === "gripe";
                  const pOn = tagPick?.tag === t.tag && tagPick.side === "praise";
                  return (
                    <div key={t.tag} className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2">
                      <span className="truncate px-1 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }} title={t.tag}>
                        {t.tag}
                      </span>
                      <button
                        type="button"
                        disabled={!t.gripe}
                        aria-pressed={gOn}
                        onClick={() => setTagPick(gOn ? null : { tag: t.tag, side: "gripe" })}
                        className="flex min-h-[40px] items-center justify-end gap-2 rounded-lg px-1.5 disabled:cursor-default"
                        style={gOn ? { background: "var(--dk-coral-wash)", outline: "2px solid var(--dk-coral-deep)" } : undefined}
                        title={t.gripe ? `ดู ${t.gripe} ครั้งที่ติเรื่อง${t.tag}` : "ไม่มีใครติเรื่องนี้"}
                      >
                        <span
                          className="dkb-num-sm w-6 text-right text-[14px]"
                          style={{ color: t.gripe ? "var(--dk-coral-ink)" : "var(--dk-quiet)" }}
                        >
                          {t.gripe || "–"}
                        </span>
                        <span className="flex h-[10px] flex-1 justify-end overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                          <i className="block h-full rounded-full" style={{ width: `${(t.gripe / m.tagMax) * 100}%`, background: "var(--dk-coral-deep)" }} />
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!t.praise}
                        aria-pressed={pOn}
                        onClick={() => setTagPick(pOn ? null : { tag: t.tag, side: "praise" })}
                        className="flex min-h-[40px] items-center gap-2 rounded-lg px-1.5 disabled:cursor-default"
                        style={pOn ? { background: "var(--dk-mint-wash)", outline: "2px solid var(--dk-mint)" } : undefined}
                        title={t.praise ? `ดู ${t.praise} ครั้งที่ชมเรื่อง${t.tag}` : "ยังไม่มีใครชมเรื่องนี้"}
                      >
                        <span className="flex h-[10px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                          <i className="block h-full rounded-full" style={{ width: `${(t.praise / m.tagMax) * 100}%`, background: "var(--dk-mint)" }} />
                        </span>
                        <span
                          className="dkb-num-sm w-6 text-[14px]"
                          style={{ color: t.praise ? "var(--dk-mint-ink)" : "var(--dk-quiet)" }}
                        >
                          {t.praise || "–"}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* การกระจายคะแนน + รายเดือน */}
            <section className="dkb-g p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 className="dkb-h2 text-[1.06rem]">คะแนนที่ได้</h2>
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  กดแถวเพื่อดูรายการ
                </span>
              </div>
              <p className="mt-1 px-1 text-[12px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
                แต่ละแถว = มีลูกค้าให้คะแนนระดับนั้นกี่ครั้ง (1 ครั้ง = ประเมิน 1 ออเดอร์) · % เทียบกับทั้งหมด {m.count} ครั้ง
              </p>
              <div className="mt-2 space-y-0.5">
                {m.dist.map(({ s, n }) => {
                  const on = score === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!n}
                      aria-pressed={on}
                      onClick={() => setScore(on ? null : s)}
                      className="flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-1.5 text-[13px] disabled:cursor-default"
                      style={on ? { background: "var(--dk-sky)", outline: "2px solid var(--dk-blue-deep)" } : undefined}
                    >
                      <span className="w-[4.2rem] shrink-0 text-left font-semibold" style={{ color: n ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                        {face(s)?.emoji} {s} ดาว
                      </span>
                      <span className="flex h-[10px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                        <i className="block h-full rounded-full" style={{ width: `${(n / m.count) * 100}%`, background: scoreTone(s) }} />
                      </span>
                      <span className="w-[5.6rem] shrink-0 text-right" style={{ color: n ? "var(--dk-navy)" : "var(--dk-quiet)" }}>
                        <b className="dkb-num-sm">{n}</b> ครั้ง
                        <span className="dkb-num-sm ml-1 text-[11.5px] font-normal" style={{ color: n ? "var(--dk-faint)" : "var(--dk-quiet)" }}>
                          {Math.round((n / m.count) * 100)}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dk-hair)" }}>
                <p className="px-1 text-[12px] font-semibold" style={{ color: "var(--dk-faint)" }}>
                  คะแนนเฉลี่ยรายเดือน
                </p>
                <table className="mt-1 w-full text-[13px]">
                  <thead>
                    <tr className="text-[11.5px] font-semibold" style={{ color: "var(--dk-faint)" }}>
                      <th className="py-1 pl-1 text-left font-semibold">เดือน</th>
                      <th className="py-1 text-right font-semibold">เฉลี่ย (เต็ม 5)</th>
                      <th className="py-1 text-right font-semibold">เทียบเดือนก่อน</th>
                      <th className="py-1 pr-1 text-right font-semibold">ประเมิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.months.map((mo, i) => {
                      const prev = m.months[i + 1];
                      const d = prev ? mo.avg - prev.avg : null;
                      return (
                        <tr key={mo.month} className="border-b last:border-0" style={{ borderColor: "var(--dk-hair)" }}>
                          <td className="py-1.5 pl-1 font-semibold" style={{ color: "var(--dk-navy)" }}>
                            {thMonth(mo.month)}
                          </td>
                          <td className="dkb-num-sm py-1.5 text-right" style={{ color: "var(--dk-navy)" }}>
                            {mo.avg.toFixed(1)}
                          </td>
                          <td className="py-1.5 text-right text-[12px] font-semibold">
                            {d === null ? (
                              <span className="font-normal" style={{ color: "var(--dk-faint)" }}>
                                ไม่มีเดือนก่อน
                              </span>
                            ) : (
                              <span style={{ color: d < 0 ? "var(--dk-coral-ink)" : d > 0 ? "var(--dk-mint-ink)" : "var(--dk-faint)" }}>
                                {d > 0 ? "▲" : d < 0 ? "▼" : "="}
                                {Math.abs(d).toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-1 text-right text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                            {mo.n} ครั้ง{mo.low ? <b style={{ color: "var(--dk-coral-ink)" }}> · 1–2 ดาว {mo.low}</b> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <FilterCard>
            <TabRow>
              <FChip on={view === "all"} onClick={() => setView("all")} label="ทั้งหมด" count={m.count} />
              <FChip
                on={view === "low"}
                onClick={() => setView("low")}
                label="ต้องตามต่อ 1–2 ดาว"
                count={m.low.length}
                style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
              />
              <FChip on={view === "comment"} onClick={() => setView("comment")} label="มีคอมเมนต์" count={m.withComment} />
              <FChip
                on={view === "new"}
                onClick={() => setView("new")}
                label="ใหม่ตั้งแต่ครั้งก่อน"
                count={fresh.size}
                style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
              />
            </TabRow>
          </FilterCard>

          <ListHead
            title={
              tagPick
                ? `${tagPick.side === "praise" ? "ชม" : "ติ"}เรื่อง${tagPick.tag}`
                : score !== null
                  ? `${score} ดาว`
                  : "คอมเมนต์และคะแนน"
            }
            note={
              filtered ? (
                <button type="button" onClick={clearFilters} className="min-h-[32px] font-semibold underline underline-offset-4" style={{ color: "var(--dk-blue-deep)" }}>
                  ล้างตัวกรอง
                </button>
              ) : (
                "คะแนนต่ำขึ้นก่อน"
              )
            }
          />

          {list.loud.length + list.quiet.length === 0 ? (
            <Empty title="ไม่มีรายการตรงตัวกรองนี้" body="กด ล้างตัวกรอง ด้านบนเพื่อดูทั้งหมด" />
          ) : (
            <Rows>
              {list.loud.map((r) => {
                const praise = isPraise(r.score);
                const isNew = fresh.has(r.id);
                return (
                  <Row key={r.id} tone={scoreTone(r.score)} done={praise && !r.comment}>
                    <RowMain
                      name={
                        r.comment ? (
                          <span className="whitespace-normal" style={r.score <= 2 ? { color: "var(--dk-coral-ink)" } : undefined}>
                            “{r.comment}”
                          </span>
                        ) : (
                          <span style={{ color: "var(--dk-navy-soft)" }}>
                            {face(r.score)?.label} — ไม่ได้เขียนคอมเมนต์
                          </span>
                        )
                      }
                      tags={
                        <>
                          {r.score <= 2 && <Tag tone="solid">ควรตามต่อ</Tag>}
                          {isNew && <Tag tone="yolk">ใหม่</Tag>}
                        </>
                      }
                      meta={
                        <>
                          <span>{thMonth(r.month)}</span>
                          {(r.tags ?? []).length > 0 && (
                            <span style={{ color: praise ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)", fontWeight: 600 }}>
                              {praise ? "ชอบ: " : "อยากให้ปรับ: "}
                              {(r.tags ?? []).join(" · ")}
                            </span>
                          )}
                        </>
                      }
                    />
                    <RowSide>
                      <span className="flex flex-col items-end leading-none">
                        <span className="dkb-num text-[1.35rem]" style={{ color: r.score <= 2 ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}>
                          {r.score}
                          <small className="text-[0.7rem]" style={{ color: "var(--dk-faint)" }}>
                            /5
                          </small>
                        </span>
                        <span className="mt-1 text-[1.05rem]">{face(r.score)?.emoji}</span>
                      </span>
                    </RowSide>
                  </Row>
                );
              })}
              {list.quiet.length > 0 &&
                (showQuiet ? (
                  list.quiet.map((r) => (
                    <Row key={r.id} tone={scoreTone(r.score)} done>
                      <RowMain
                        name={<span style={{ color: "var(--dk-navy-soft)" }}>{face(r.score)?.emoji} {r.score} ดาว · ไม่มีคอมเมนต์</span>}
                        tags={fresh.has(r.id) ? <Tag tone="yolk">ใหม่</Tag> : undefined}
                        meta={
                          <>
                            <span>{thMonth(r.month)}</span>
                            {(r.tags ?? []).length > 0 && <span>ชอบ: {(r.tags ?? []).join(" · ")}</span>}
                          </>
                        }
                      />
                    </Row>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowQuiet(true)}
                    className="dkb-g flex min-h-[48px] w-full items-center justify-between gap-3 px-4 text-left text-[13px]"
                    style={{ color: "var(--dk-navy-soft)" }}
                  >
                    <span>
                      <b style={{ color: "var(--dk-mint-ink)" }}>อีก {list.quiet.length} ครั้งให้ 4–5 ดาว</b> ไม่ได้เขียนคอมเมนต์
                      <span style={{ color: "var(--dk-faint)" }}>
                        {" "}
                        (5 ดาว {list.quiet.filter((r) => r.score === 5).length} · 4 ดาว {list.quiet.filter((r) => r.score === 4).length})
                      </span>
                    </span>
                    <span className="font-semibold" style={{ color: "var(--dk-blue-deep)" }}>
                      แสดง ▾
                    </span>
                  </button>
                ))}
            </Rows>
          )}
        </>
      )}
    </PageShell>
  );
}

/** กันคนที่ไม่มีสิทธิ์ (เช่น ฝ่ายแพ็ค) พิมพ์ URL เข้าตรง ๆ */
export default function RatingsPage() {
  return (
    <RequirePerm perm="orders.viewAll">
      <RatingsPageInner />
    </RequirePerm>
  );
}

"use client";

/**
 * ความพึงพอใจลูกค้า /admin/ratings  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * ประเมินแบบนิรนาม — ระบบไม่บันทึกว่าใครประเมิน (เก็บเวลาแค่ระดับเดือน)
 *
 * ⚠️ ของเดิมโชว์ค่าเฉลี่ยลอย ๆ ตัวเดียว ซึ่งบอกอะไรไม่ได้เลยว่าดีขึ้นหรือแย่ลง
 *    ของใหม่เทียบ "30 วันล่าสุด" กับ "ก่อนหน้านั้น" และแยกจำนวนที่ต่ำกว่า 3 ดาวออกมา
 *    เพราะนั่นคือรายการที่ต้องตามต่อ ไม่ใช่ตัวเลขไว้ดูเฉย ๆ
 */

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import { markRatingsSeen, SCORE_FACES, type RatingRow } from "@/lib/ratings";
import { Banner, Empty, HeroStat, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Stat, Stats, Tag } from "@/components/admin/ui";

const face = (s: number) => SCORE_FACES.find((f) => f.score === s)?.emoji ?? "⭐";

/** "2569-08" → เดือนนี้ห่างจากเดือนปัจจุบันกี่เดือน (0 = เดือนนี้) */
function monthsAgo(month: string): number | null {
  const m = month?.match(/(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]) - 543;
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - Number(m[2]));
}

function RatingsPageInner() {
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const rows = (j.ratings ?? []) as RatingRow[];
        setRatings(rows);
        setNeedsSetup(!!j.needsSetup);
        markRatingsSeen(rows.map((r) => r.id)); // เปิดหน้านี้ = เห็นครบแล้ว (เคลียร์ badge)
      })
      .catch(() => setRatings([]));
  }, []);

  const m = useMemo(() => {
    const rows = ratings ?? [];
    const avgOf = (list: RatingRow[]) => (list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : 0);
    // เทียบเดือนนี้กับเดือนก่อน — ตัวเลขคะแนนที่ไม่มีตัวเทียบบอกอะไรไม่ได้
    const recent = rows.filter((r) => (monthsAgo(r.month) ?? 99) <= 0);
    const before = rows.filter((r) => (monthsAgo(r.month) ?? 99) === 1);
    const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: rows.filter((r) => r.score === s).length }));
    const tagCount = new Map<string, number>();
    rows.forEach((r) => (r.tags ?? []).forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
    return {
      count: rows.length,
      avg: avgOf(rows),
      avgRecent: avgOf(recent),
      avgBefore: avgOf(before),
      recentCount: recent.length,
      low: rows.filter((r) => r.score <= 2).length,
      dist,
      topTags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]),
      // คะแนนต่ำขึ้นก่อน แล้วค่อยเรียงตามเดือนใหม่สุด
      rows: [...rows].sort((a, b) => a.score - b.score || (monthsAgo(a.month) ?? 99) - (monthsAgo(b.month) ?? 99)),
    };
  }, [ratings]);

  if (ratings === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงผลประเมินจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  const delta = m.avgBefore > 0 ? m.avgRecent - m.avgBefore : null;

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="ความพึงพอใจ"
        count={`${m.count} ครั้ง`}
        sub="ประเมินแบบนิรนาม — ระบบไม่บันทึกว่าใครประเมิน (เก็บเวลาแค่ระดับเดือน)"
      />

      {needsSetup ? (
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
            body="ลูกค้าจะเห็นแบบประเมินในหน้าออเดอร์เมื่อได้รับสินค้าแล้ว — ยังไม่ต้องทำอะไร"
          />
        </div>
      ) : (
        <>
          <Stats cols={4}>
            <HeroStat
              n={m.avgRecent > 0 ? m.avgRecent.toFixed(1) : m.avg.toFixed(1)}
              label="คะแนนเฉลี่ยเดือนนี้"
              detail={
                delta === null
                  ? `จาก ${m.recentCount || m.count} ครั้ง · ยังไม่มีเดือนก่อนให้เทียบ`
                  : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} จากเดือนก่อน (${m.avgBefore.toFixed(1)}) · ${m.recentCount} ครั้ง`
              }
              pct={(m.avgRecent || m.avg) * 20}
            />
            <Stat label="เฉลี่ยตลอดกาล" value={m.avg.toFixed(1)} hint={`จาก ${m.count} ครั้ง`} />
            <Stat
              label="ต่ำกว่า 3 ดาว"
              value={m.low}
              hint={m.low ? "ครั้ง — ควรตามต่อ" : "ครั้ง"}
              tone={m.low ? "due" : undefined}
            />
          </Stats>

          {/* การกระจายคะแนน + คำที่ลูกค้าเลือกบ่อย */}
          <div className="dkb-g mt-4 p-4 sm:p-5">
            <h2 className="dkb-h2 px-1 text-[1.06rem]">การกระจายคะแนน</h2>
            <div className="mt-3 space-y-2">
              {m.dist.map(({ s, n }) => (
                <div key={s} className="flex items-center gap-3 text-[13px]">
                  <span className="w-6 text-center text-base">{face(s)}</span>
                  <span className="dkb-bar !mt-0 flex-1" style={{ ["--dk-tone" as string]: s <= 2 ? "var(--dk-coral-deep)" : "var(--dk-yolk-deep)", ["--dk-pct" as string]: m.count ? `${(n / m.count) * 100}%` : "0%" }}>
                    <i />
                  </span>
                  <span className="dkb-num-sm w-8 text-right" style={{ color: "var(--dk-faint)" }}>
                    {n}
                  </span>
                </div>
              ))}
            </div>
            {m.topTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--dk-hair)" }}>
                {m.topTags.map(([t, n]) => (
                  <Tag key={t} tone="sky">
                    {t} · {n}
                  </Tag>
                ))}
              </div>
            )}
          </div>

          <ListHead title="คะแนนที่ได้" note="คะแนนต่ำขึ้นก่อน" />
          <Rows>
            {m.rows.map((r) => (
              <Row key={r.id} tone={r.score <= 2 ? "var(--dk-coral-deep)" : r.score <= 3 ? "var(--dk-yolk-deep)" : "var(--dk-mint)"} done={r.score >= 4}>
                <RowMain
                  name={`${face(r.score)} ${r.score} ดาว`}
                  tags={r.score <= 2 ? <Tag tone="solid">ควรตามต่อ</Tag> : undefined}
                  meta={
                    <>
                      <span>{r.month}</span>
                      {(r.tags ?? []).length > 0 && <span>{(r.tags ?? []).join(" · ")}</span>}
                      {r.comment && (
                        <span className={r.score <= 2 ? "hot" : undefined} title={r.comment}>
                          “{r.comment}”
                        </span>
                      )}
                      {!r.comment && <span style={{ opacity: 0.7 }}>ไม่มีคอมเมนต์</span>}
                    </>
                  }
                />
                <RowSide>
                  <span className="dkb-num text-[1.3rem]">{r.score}</span>
                </RowSide>
              </Row>
            ))}
          </Rows>
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

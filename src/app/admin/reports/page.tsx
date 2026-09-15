"use client";

/**
 * 📈 รายงานยอดขาย/กำไร (/admin/reports)
 *
 * คำถามที่หน้านี้ต้องตอบใน 3 วินาที: "ช่วงนี้ขายได้เท่าไหร่ ดีขึ้นหรือแย่ลงกว่าช่วงก่อน และเหลือกำไรเท่าไหร่"
 * ทุกตัวเลขจึงมาคู่กับช่วงก่อนหน้าที่ยาวเท่ากันเสมอ — ตัวเลขลอยเดี่ยวไม่บอกว่าควรดีใจหรือกังวล
 *
 * ⚠️ ต้นทุนมาจากราคาทุนที่ใส่ไว้ใน "คลังสต๊อก" เท่านั้น และไม่ครบทุกใบ
 *    → กำไรคิดเฉพาะใบที่รู้ต้นทุนจริง แล้วบอกตรง ๆ ว่าคิดจากกี่ใบ (ดู lib/reports.ts)
 *    ห้ามเอาต้นทุนบางใบไปลบยอดขายทั้งหมด เพราะกำไรจะดูดีเกินจริงแล้วตัดสินใจผิด
 *
 * ⚠️ ห้ามเขียน hex ตรง ๆ — ใช้ var(--dk-*) จาก dashboard.css เหมือนหน้าภาพรวม
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { PageHead, PageShell, Stat, Stats } from "@/components/admin/ui";
import "@/components/admin/dashboard.css";
import { formatPrice } from "@/lib/products";
import { bkkParts } from "@/lib/bangkok-time";
import { daysBetween, deltaPct, shiftDay, type ReportData, type ReportRow } from "@/lib/reports";

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — เครื่องพนักงานอาจตั้งโซนเวลาไว้คนละแบบ */
function today(): string {
  const p = bkkParts();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

type PresetKey = "month" | "lastMonth" | "d7" | "d30" | "year" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "month", label: "เดือนนี้" },
  { key: "lastMonth", label: "เดือนก่อน" },
  { key: "d7", label: "7 วัน" },
  { key: "d30", label: "30 วัน" },
  { key: "year", label: "ปีนี้" },
  { key: "custom", label: "เลือกวัน" },
];

/** ช่วงวันของแต่ละปุ่มลัด */
function rangeOf(key: PresetKey): { from: string; to: string } {
  const t = today();
  const [y, m] = t.split("-").map(Number);
  switch (key) {
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const first = `${py}-${String(pm).padStart(2, "0")}-01`;
      return { from: first, to: shiftDay(`${y}-${String(m).padStart(2, "0")}-01`, -1) };
    }
    case "d7":
      return { from: shiftDay(t, -6), to: t };
    case "d30":
      return { from: shiftDay(t, -29), to: t };
    case "year":
      return { from: `${y}-01-01`, to: t };
    default:
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: t };
  }
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "1 ก.ย. 2569" — ทีมงานคุยกันด้วย พ.ศ. */
function thaiDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${TH_MONTH[(m || 1) - 1]} ${(y || 0) + 543}`;
}

/** ยอดใหญ่ ๆ ในกล่องสถิติ — "฿1.24 ล้าน" อ่านจากระยะแขนได้ ส่วนเลขเต็มไปอยู่บรรทัดใบ้ */
function short(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `฿${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")} ล้าน`;
  return formatPrice(Math.round(n));
}

/** ตัวเทียบช่วงก่อน — สีเขียว/คอรัลพร้อมลูกศร (ไม่ได้บอกด้วยสีอย่างเดียว มีลูกศรกำกับ) */
function Delta({ now, before, unit = "" }: { now: number; before: number; unit?: string }) {
  const pct = deltaPct(now, before);
  if (pct === null)
    return (
      <span style={{ color: "var(--dk-faint)" }}>
        ช่วงก่อนไม่มียอด{unit ? ` (${unit})` : ""}
      </span>
    );
  const up = pct >= 0;
  return (
    <>
      <span style={{ color: up ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
        {up ? "▲" : "▼"} {Math.abs(pct)}%
      </span>{" "}
      <span style={{ color: "var(--dk-faint)" }}>จากช่วงก่อน{unit ? ` (${unit})` : ""}</span>
    </>
  );
}

/** กราฟแท่งยอดขาย + เส้นค่าเฉลี่ย — วันที่ขายไม่ได้ต้องเห็นเป็นช่องว่าง ไม่ใช่หายไปจากกราฟ */
function Bars({ data }: { data: ReportData }) {
  const max = Math.max(...data.series.map((p) => p.revenue), 1);
  const avg = data.series.length ? data.series.reduce((s, p) => s + p.revenue, 0) / data.series.length : 0;
  const best = data.series.reduce((a, b) => (b.revenue > a.revenue ? b : a), data.series[0]);
  // ป้ายใต้แท่งไม่เกิน 7 จุด ไม่งั้นตัวหนังสือทับกันบนมือถือ
  const step = Math.max(1, Math.ceil(data.series.length / 7));

  return (
    <section className="dkb-g p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="dkb-h2 text-[15px]">ยอดขายราย{data.seriesUnit === "day" ? "วัน" : "เดือน"}</span>
        <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          เฉลี่ย {formatPrice(Math.round(avg))}/{data.seriesUnit === "day" ? "วัน" : "เดือน"}
        </span>
      </div>

      <div className="relative mt-3">
        {avg > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed"
            style={{ bottom: `${(avg / max) * 100}%`, borderColor: "var(--dk-quiet)" }}
          />
        )}
        <div className="dkb-spark" style={{ height: 116 }}>
          {data.series.map((p) => (
            <i
              key={p.key}
              title={`${p.label} · ${formatPrice(p.revenue)} · ${p.orders} ใบ`}
              style={{ height: p.revenue > 0 ? `${Math.max(4, Math.round((p.revenue / max) * 100))}%` : 2 }}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
        {data.series
          .filter((_, i) => i % step === 0 || i === data.series.length - 1)
          .map((p) => (
            <span key={p.key}>{p.label}</span>
          ))}
      </div>

      {best && best.revenue > 0 && (
        <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
          สูงสุด {formatPrice(Math.round(best.revenue))} ({best.label} · {best.orders} ใบ) · ทั้งช่วง {data.totals.orders} ใบ
        </p>
      )}
    </section>
  );
}

/** ตารางอันดับ (สินค้า/ลูกค้า/ช่องทาง) — ทุกแถวกดไปดูออเดอร์จริงได้ */
function RankList({
  title,
  note,
  rows,
  hrefOf,
  unitWord = "ชิ้น",
  showMargin,
  empty,
}: {
  title: string;
  note?: string;
  rows: ReportRow[];
  hrefOf?: (r: ReportRow) => string;
  unitWord?: string;
  showMargin?: boolean;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <section className="dkb-g p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="dkb-h2 text-[15px]">{title}</span>
        {note && (
          <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
            {note}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 px-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
          {empty}
        </p>
      ) : (
        <div className="mt-2">
          {rows.map((r, i) => {
            const margin =
              showMargin && r.cost != null && (r.costedRevenue ?? 0) > 0
                ? Math.round((((r.costedRevenue as number) - r.cost) / (r.costedRevenue as number)) * 100)
                : null;
            const inner = (
              <>
                <span
                  className="dkb-num-sm w-5 flex-none text-right text-[13px]"
                  style={{ color: i < 3 ? "var(--dk-navy)" : "var(--dk-faint)" }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="dkb-h2 block truncate text-[13.5px]">{r.label}</span>
                  <span className="mt-0.5 block h-[5px] w-full overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%`, background: "var(--dk-yolk-deep)" }}
                    />
                  </span>
                  <span className="mt-1 block truncate text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    {r.sub ? `${r.sub} · ` : ""}
                    {r.orders} ใบ
                    {r.qty > 0 ? ` · ${r.qty.toLocaleString("th-TH")} ${unitWord}` : ""}
                    {margin !== null ? ` · กำไร ${margin}%` : ""}
                  </span>
                </span>
                <span className="dkb-num flex-none text-[15px]">{formatPrice(Math.round(r.revenue))}</span>
              </>
            );
            const href = hrefOf?.(r);
            return href ? (
              <Link key={r.key} href={href} className="dkb-row">
                {inner}
              </Link>
            ) : (
              <div key={r.key} className="dkb-row">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReportsInner() {
  const [preset, setPreset] = useState<PresetKey>("month");
  const [range, setRange] = useState(() => rangeOf("month"));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?from=${from}&to=${to}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { report?: ReportData; error?: string; needsSetup?: boolean };
      if (!res.ok) {
        setErr(j.error ?? `เซิร์ฟเวอร์ตอบ ${res.status}`);
        return;
      }
      if (j.needsSetup) {
        setErr("ยังไม่ได้ต่อฐานข้อมูลออเดอร์");
        return;
      }
      setErr("");
      setData(j.report ?? null);
      setUpdatedAt(new Date());
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range.from, range.to);
  }, [load, range.from, range.to]);

  const pick = (key: PresetKey) => {
    setPreset(key);
    if (key !== "custom") setRange(rangeOf(key));
  };

  const t = data?.totals;
  const p = data?.prev;
  const days = daysBetween(range.from, range.to);
  /** เก็บเงินได้แล้วกี่ % ของยอดขายช่วงนี้ — วงแหวนของกล่องหัว */
  const paidPct = t && t.revenue > 0 ? Math.round((t.paid / t.revenue) * 100) : 0;
  const margin = t && t.costedSaleBase > 0 ? Math.round((t.profit / t.costedSaleBase) * 100) : null;
  const costPct = t && t.saleBase > 0 ? Math.round((t.costedSaleBase / t.saleBase) * 100) : 0;
  const prevMargin = p && p.costedSaleBase > 0 ? Math.round((p.profit / p.costedSaleBase) * 100) : null;

  const discounts = useMemo(
    () =>
      t
        ? [
            { key: "tier", label: "ส่วนลดระดับสมาชิก", amount: t.discountTier, tone: "var(--dk-blue)" },
            { key: "coupon", label: "คูปอง", amount: t.discountCoupon, tone: "var(--dk-lilac)" },
            { key: "admin", label: "ส่วนลดที่แอดมินใส่เอง", amount: t.discountAdmin, tone: "var(--dk-coral)" },
            { key: "early", label: "ส่วนลดโอนไว", amount: t.discountEarlyPay, tone: "var(--dk-mint)" },
          ].filter((d) => d.amount > 0)
        : [],
    [t]
  );

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="รายงานยอดขาย"
        count={data ? `${data.totals.orders} ใบ` : undefined}
        sub={
          data && !loading
            ? `${thaiDay(data.from)} – ${thaiDay(data.to)} (${data.days} วัน) · เทียบกับ ${thaiDay(data.prevFrom)} – ${thaiDay(data.prevTo)}`
            : `${thaiDay(range.from)} – ${thaiDay(range.to)} (${days} วัน) · กำลังดึงข้อมูล…`
        }
        live={
          updatedAt
            ? { ok: !err, text: err ? err : `ข้อมูลสด · ดึงเมื่อ ${updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` }
            : undefined
        }
        tools={
          <div className="dkb-scroll">
            {PRESETS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => pick(x.key)}
                aria-pressed={preset === x.key}
                className="dkb-tab"
              >
                {x.label}
              </button>
            ))}
          </div>
        }
      />

      {preset === "custom" && (
        <div className="dkb-g mt-3 flex flex-wrap items-end gap-3 p-3">
          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            ตั้งแต่
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="dkb-dfield min-h-[44px] rounded-xl px-3 text-[13px]"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            ถึง
            <input
              type="date"
              value={range.to}
              min={range.from}
              max={today()}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="dkb-dfield min-h-[44px] rounded-xl px-3 text-[13px]"
            />
          </label>
        </div>
      )}

      {err && !data && (
        <p className="mt-4 rounded-[20px] px-4 py-3 text-[13px]" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
          ดึงรายงานไม่ได้ ({err}) — ยอดขายไม่ได้หายไปไหน ลองกดเลือกช่วงวันใหม่อีกครั้ง
        </p>
      )}

      {loading && !data ? (
        <div className="mt-4 grid gap-3">
          <div className="dkb-skel h-[120px] rounded-[20px]" />
          <div className="dkb-skel h-[200px] rounded-[20px]" />
          <div className="dkb-skel h-[260px] rounded-[20px]" />
        </div>
      ) : !data || !t || !p ? null : t.orders === 0 && t.cancelled === 0 ? (
        <section className="dkb-g mt-4 p-8 text-center">
          <p className="dkb-h2 text-[15px]">ช่วงนี้ยังไม่มีออเดอร์</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            เลือกช่วงวันอื่น หรือดูใบที่เพิ่งเข้ามาที่หน้าคำสั่งซื้อ
          </p>
          <Link href="/admin/orders" className="dkb-btn dkb-btn-navy mt-4">
            ไปหน้าคำสั่งซื้อ
          </Link>
        </section>
      ) : (
        <>
          <Stats cols={4}>
            {/* กล่องหัว: ตัวเลขที่กล้าที่สุดของหน้า — วงแหวน = เก็บเงินได้แล้วกี่ % ของยอดที่ขายไป
                (HeroStat ยัดยอดเงินลงในวงแหวนแล้วตัวหนังสือล้นออกนอกวง จึงวางเองด้วยคลาสชุดเดียวกัน) */}
            <div className="dkb-g dkb-stat dkb-stat-hero" style={{ ["--dk-pct" as string]: `${paidPct}%` }}>
              <span className="dkb-ring-sm">
                <i>
                  <span className="dkb-num text-[1.05rem]">{paidPct}%</span>
                </i>
              </span>
              <span className="min-w-0">
                <span className="dkb-num block text-[1.75rem] leading-none">{short(t.revenue)}</span>
                <span className="dkb-h2 mt-1 block text-[0.95rem]">ยอดขายช่วงนี้</span>
                <span className="block text-[0.75rem]" style={{ color: "var(--dk-yolk-ink)" }}>
                  {t.orders} ใบ · เฉลี่ย {formatPrice(Math.round(t.revenue / Math.max(1, t.orders)))}/ใบ · เก็บเงินแล้ว{" "}
                  {formatPrice(Math.round(t.paid))}
                </span>
                <span className="mt-0.5 block text-[0.78rem] font-semibold" style={{ color: "var(--dk-yolk-ink)" }}>
                  {deltaPct(t.revenue, p.revenue) === null
                    ? "ช่วงก่อนไม่มียอดขายให้เทียบ"
                    : `${deltaPct(t.revenue, p.revenue)! >= 0 ? "▲" : "▼"} ${Math.abs(
                        deltaPct(t.revenue, p.revenue)!
                      )}% จากช่วงก่อน (${short(p.revenue)} · ${p.orders} ใบ)`}
                </span>
              </span>
            </div>
            <Stat
              label="กำไรขั้นต้น"
              value={margin === null ? "—" : short(t.profit)}
              hint={
                margin === null
                  ? "ยังไม่ได้ใส่ทุนวัสดุ — ใส่ที่คลังสต๊อก"
                  : `${margin}% ของยอดที่รู้ต้นทุน${prevMargin !== null ? ` · ช่วงก่อน ${prevMargin}%` : ""}`
              }
              wide
            />
            <Stat
              label="ยังเก็บเงินไม่ได้"
              value={short(t.outstanding)}
              hint={t.outstanding > 0 ? `จาก ${t.orders} ใบในช่วงนี้` : "เก็บครบทุกใบ"}
              tone={t.outstanding > 0 ? "due" : undefined}
              wide
            />
          </Stats>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            <Bars data={data} />

            {/* ── กำไร: โชว์ทางคิดทั้งเส้น ไม่ใช่โยนตัวเลขเดียวมา ── */}
            <section className="dkb-g p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="dkb-h2 text-[15px]">กำไรขั้นต้น</span>
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  ไม่รวมค่าส่ง/VAT
                </span>
              </div>

              {t.costedOrders === 0 ? (
                <div className="mt-3">
                  <p className="text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                    ยังคิดกำไรไม่ได้ เพราะวัสดุในคลังยังไม่ได้ใส่ราคาทุน — ใส่ทุน/หน่วยให้ SKU ที่ผูกกับสินค้าไว้แล้ว
                    ระบบจะคิดต้นทุนของทุกใบที่ขายหลังจากนั้นให้เอง
                  </p>
                  <Link href="/admin/stock" className="dkb-btn dkb-btn-yolk mt-3">
                    ไปใส่ทุนที่คลังสต๊อก
                  </Link>
                </div>
              ) : (
                <>
                  <dl className="mt-3 space-y-2">
                    <Line k="ยอดขาย (เฉพาะใบที่รู้ต้นทุน)" v={formatPrice(Math.round(t.costedSaleBase))} />
                    <Line k="− ต้นทุนวัสดุที่ตัดจากคลัง" v={`−${formatPrice(Math.round(t.cogs))}`} tone="coral" />
                    <div className="h-px" style={{ background: "var(--dk-hair)" }} />
                    <Line k="= กำไรขั้นต้น" v={formatPrice(Math.round(t.profit))} big tone={t.profit >= 0 ? "mint" : "coral"} />
                  </dl>

                  <div className="mt-3 rounded-[16px] px-3 py-2.5" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                    <p className="text-[12.5px] leading-relaxed">
                      คิดจาก <b>{t.costedOrders}</b> ใบ ({costPct}% ของยอดขายช่วงนี้)
                      {data.costGap.orders > 0 && (
                        <>
                          {" "}
                          · อีก {data.costGap.orders} ใบ ({formatPrice(Math.round(data.costGap.revenue))}) ยังไม่รู้ต้นทุน
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11.5px] opacity-80">
                      ต้นทุน = ค่าวัสดุที่ผูก SKU ไว้เท่านั้น ยังไม่รวมค่าแรง ค่าเครื่อง ค่าส่ง
                    </p>
                  </div>
                  {data.costGap.orders > 0 && (
                    <Link href="/admin/stock/link" className="dkb-btn mt-3">
                      ผูกวัสดุให้ครบขึ้น
                    </Link>
                  )}
                </>
              )}
            </section>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankList
              title="สินค้าขายดี"
              note={`${data.products.length} จาก ${data.totalProducts} รายการ`}
              rows={data.products}
              unitWord="ชิ้น"
              showMargin
              hrefOf={(r) => `/admin/orders?q=${encodeURIComponent(r.label)}`}
              empty="ช่วงนี้ยังไม่มีรายการสินค้า"
            />
            <RankList
              title="ลูกค้าที่ซื้อมากสุด"
              note={`${data.customers.length} จาก ${data.totalCustomers} ราย`}
              rows={data.customers}
              unitWord="ชิ้น"
              hrefOf={(r) => `/admin/orders?q=${encodeURIComponent((r.sub ?? "").split(" · ")[0] || r.label)}`}
              empty="ช่วงนี้ยังไม่มีลูกค้า"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── ส่วนลดที่จ่ายไป ── */}
            <section className="dkb-g p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="dkb-h2 text-[15px]">ส่วนลดที่จ่ายไป</span>
                <span className="dkb-num text-[15px]">{formatPrice(Math.round(t.discountTotal))}</span>
              </div>
              <p className="mt-0.5 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                {t.goods > 0 ? `${((t.discountTotal / t.goods) * 100).toFixed(1)}% ของยอดสินค้า` : "—"} ·{" "}
                <Delta now={t.discountTotal} before={p.discountTotal} />
              </p>

              {discounts.length === 0 ? (
                <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                  ช่วงนี้ไม่ได้ลดราคาให้ใครเลย
                </p>
              ) : (
                <>
                  <div className="mt-3 flex h-[9px] overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                    {discounts.map((d) => (
                      <span key={d.key} style={{ width: `${(d.amount / t.discountTotal) * 100}%`, background: d.tone }} />
                    ))}
                  </div>
                  <dl className="mt-3 space-y-2">
                    {discounts.map((d) => (
                      <div key={d.key} className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: d.tone }} />
                        <dt className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                          {d.label}
                        </dt>
                        <dd className="dkb-num-sm text-[13px]">{formatPrice(Math.round(d.amount))}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[12.5px]" style={{ borderColor: "var(--dk-hair)" }}>
                <KV k="ค่าส่งที่เก็บได้" v={formatPrice(Math.round(t.shipping))} />
                <KV k="ค่าบริการเพิ่ม" v={formatPrice(Math.round(t.charges))} />
                {t.vat > 0 && <KV k="VAT ตามบิล" v={formatPrice(Math.round(t.vat))} />}
                {t.cancelled > 0 && <KV k={`ใบยกเลิก ${t.cancelled} ใบ`} v={formatPrice(Math.round(t.cancelledValue))} />}
              </div>
            </section>

            {/* ── ช่องทาง + ใบเสนอราคา ── */}
            <div className="grid grid-cols-1 gap-4">
              <RankList title="ออเดอร์มาทางไหน" rows={data.channels} unitWord="ชิ้น" empty="ช่วงนี้ยังไม่มีออเดอร์" />

              <section className="dkb-g p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <span className="dkb-h2 text-[15px]">ใบเสนอราคา</span>
                  <Link href="/admin/quotes" className="text-[12.5px]" style={{ color: "var(--dk-blue-deep)" }}>
                    ดูทั้งหมด →
                  </Link>
                </div>
                {data.quotes.issued === 0 ? (
                  <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                    ช่วงนี้ยังไม่ได้ส่งใบเสนอราคาให้ใคร
                  </p>
                ) : (
                  <>
                    <p className="mt-2 px-1">
                      <span className="dkb-num text-[1.7rem]">{data.quotes.rate === null ? "—" : `${data.quotes.rate}%`}</span>
                      <span className="ml-2 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                        ปิดได้ {data.quotes.accepted} จาก {data.quotes.accepted + data.quotes.declined + data.quotes.expired} ใบที่ลูกค้าตอบแล้ว
                      </span>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                      <KV k="มูลค่าที่ปิดได้" v={formatPrice(Math.round(data.quotes.acceptedValue))} />
                      <KV k="มูลค่าที่เสียไป" v={formatPrice(Math.round(data.quotes.lostValue))} />
                      <KV k="รอลูกค้าตอบ" v={`${data.quotes.pending} ใบ`} />
                      <KV k="ส่งไปทั้งหมด" v={`${data.quotes.issued} ใบ`} />
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>

          <p className="mt-4 px-2 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
            นับตามวันที่บนใบสั่งซื้อ (ไม่ใช่วันที่เงินเข้า) · ใบยกเลิกไม่นับเป็นยอดขาย ·
            ต้นทุนอ่านจากประวัติตัดสต๊อก จึงใช้ราคาทุน ณ วันที่ขาย ไม่ใช่ราคาทุนวันนี้
          </p>
        </>
      )}
    </PageShell>
  );
}

/** บรรทัดในสมการกำไร */
function Line({ k, v, big, tone }: { k: string; v: string; big?: boolean; tone?: "mint" | "coral" }) {
  const color = tone === "mint" ? "var(--dk-mint-ink)" : tone === "coral" ? "var(--dk-coral-ink)" : undefined;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
        {k}
      </dt>
      <dd className={big ? "dkb-num text-[1.35rem]" : "dkb-num-sm text-[13.5px]"} style={color ? { color } : undefined}>
        {v}
      </dd>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[14px] px-3 py-2" style={{ background: "var(--dk-hair)" }}>
      <p style={{ color: "var(--dk-navy-soft)" }}>{k}</p>
      <p className="dkb-num-sm mt-0.5 text-[13.5px]">{v}</p>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequirePerm perm="reports.view">
      <ReportsInner />
    </RequirePerm>
  );
}

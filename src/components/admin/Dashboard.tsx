"use client";

/**
 * แผงหน้าร้าน — หน้าภาพรวมหลังบ้าน (/admin)  ดีไซน์ "รางเบนโตะกระจก"
 *
 * โครงหน้า: รางไล่สีเรียงตาม "ลำดับที่ใบงานเดินจริง" (ตรวจสลิป → แบบต้องแก้ →
 * เริ่มผลิตได้ → กำลังผลิต) แขวนกล่องกระจกไว้บนราง โดย
 *   · วงแหวนรอบตัวเลข = ขั้นนี้คิดเป็นกี่ % ของงานที่อยู่บนรางทั้งหมด
 *   · ความสูงของกล่อง = ปริมาณงานที่ค้างอยู่ขั้นนั้น (กล่องสูงสุด = คอขวด)
 * กวาดตาลงรางครั้งเดียวได้ทั้งลำดับและปริมาณ ซึ่งการ์ดเรียงเท่ากันทำไม่ได้
 *
 * คนที่ใช้: เจ้าของร้านเปิดจากมือถือ 3 วินาที · ฝ่ายผลิตมองจากระยะแขน
 * งานค้างต้องเด่นกว่างานที่จบแล้วเสมอ (ตัวเลขใหญ่ + กล่องสูง vs ป้ายไม่มีพื้น)
 *
 * ⚠️ ห้ามเขียน hex ตรง ๆ ในไฟล์นี้ — อ้าง var(--dk-*) จาก dashboard.css เท่านั้น
 * ⚠️ อย่าไล่ใส่ font-bold ทั่วหน้า — ลำดับความสำคัญมาจากขนาดกับพื้นที่ว่าง
 */

import Link from "next/link";
import { useMemo } from "react";
import "./dashboard.css";
import { formatPrice } from "@/lib/products";
import { orderTotal, type Order, type OrderStatus } from "@/lib/admin-data";
import { CLOSED, computeDash, parseThaiDate, thaiToday } from "@/lib/admin-dash";

/** สีป้ายสถานะ — งานที่จบแล้วไม่มีพื้น (เงียบกว่างานค้างเสมอ) */
const CHIP: Record<OrderStatus, { fg: string; bg: string }> = {
  รอชำระเงิน: { fg: "var(--dk-yolk-ink)", bg: "var(--dk-yolk-wash)" },
  รอตรวจสอบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  ชำระแล้ว: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  รอตรวจแบบ: { fg: "var(--dk-lilac-ink)", bg: "var(--dk-lilac-wash)" },
  แก้ไขแบบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  อนุมัติแบบ: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  กำลังผลิต: { fg: "var(--dk-blue-deep)", bg: "var(--dk-sky)" },
  จัดส่งแล้ว: { fg: "var(--dk-navy-soft)", bg: "transparent" },
  เสร็จสิ้น: { fg: "var(--dk-faint)", bg: "transparent" },
  ยกเลิก: { fg: "var(--dk-faint)", bg: "transparent" },
};

function StatusChip({ s }: { s: OrderStatus }) {
  const t = CHIP[s] ?? CHIP["เสร็จสิ้น"];
  return (
    <span className="dkb-chip" data-done={CLOSED.includes(s) ? "1" : undefined} style={{ color: t.fg, background: t.bg }}>
      <i />
      {s}
    </span>
  );
}

/** "20 ส.ค. 14:22" — ตัดปีออกให้แถวสั้น (ปีเต็มอยู่ในหน้ารายละเอียดแล้ว) */
function shortDate(raw: string): string {
  const d = parseThaiDate(raw);
  if (!d) return raw;
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** ค้างมากี่วันแล้ว — สัญญาณที่บอกว่าใบไหนต้องหยิบก่อน */
function ageOf(raw: string, now: Date): { text: string; hot: boolean } | null {
  const d = parseThaiDate(raw);
  if (!d) return null;
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((midnight(now) - midnight(d)) / 86400000);
  if (days <= 0) return { text: "วันนี้", hot: false };
  if (days === 1) return { text: "เมื่อวาน", hot: false };
  return { text: `ค้าง ${days} วัน`, hot: days >= 3 };
}

export interface DashboardProps {
  orders: Order[];
  /** กำลังโหลดครั้งแรก */
  loading: boolean;
  /** ยังไม่ได้ต่อฐานข้อมูลจริง — ตัวเลขที่เห็นเป็นออเดอร์ตัวอย่าง */
  demo: boolean;
  /** ดึงข้อมูลล่าสุดไม่สำเร็จ (เน็ตหลุด) — ที่เห็นคือของเก่า */
  stale?: boolean;
  /** เวลาที่ดึงข้อมูลสำเร็จครั้งล่าสุด */
  updatedAt?: Date;
  /** เห็นตัวเลขเงินไหม (ฝ่ายแพ็คไม่เห็น) */
  seesMoney: boolean;
}

const SHELL = "dkb -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8";

export default function Dashboard({ orders, loading, demo, stale, updatedAt, seesMoney }: DashboardProps) {
  const now = useMemo(() => new Date(), []);
  const m = useMemo(() => computeDash(orders, now), [orders, now]);

  /** ขั้นตอนบนราง — เรียงตามลำดับที่ใบงานเดินจริง ไม่ใช่เรียงตามความสำคัญ */
  const steps = [
    {
      key: "slip",
      n: m.toCheckSlip,
      label: "ตรวจสลิป",
      hint: "ลูกค้าแจ้งโอนแล้ว รอเรากดยืนยัน",
      tone: "var(--dk-yolk-deep)",
      href: "/admin/orders?status=รอตรวจสอบ",
      act: true,
    },
    {
      key: "proof",
      n: m.toFixProof,
      label: "แบบต้องแก้",
      hint: "ลูกค้าขอแก้ไข รอทำแบบใหม่",
      tone: "var(--dk-coral-deep)",
      href: "/admin/orders?status=แก้ไขแบบ",
      act: true,
    },
    {
      key: "start",
      n: m.toStart,
      label: "เริ่มผลิตได้",
      hint: "จ่ายครบและอนุมัติแบบแล้ว",
      tone: "var(--dk-mint)",
      href: "/admin/orders?status=ชำระแล้ว",
      act: true,
    },
    {
      key: "press",
      n: m.making,
      label: "กำลังผลิต",
      hint: "เดินอยู่ในโรงพิมพ์ ไม่ต้องทำอะไร",
      tone: "var(--dk-blue)",
      href: "/admin/orders?status=กำลังผลิต",
      act: false,
    },
  ];
  const railTotal = steps.reduce((s, t) => s + t.n, 0);
  const railMax = Math.max(...steps.map((t) => t.n), 1);
  /** ความสูงกล่อง = ปริมาณงาน · ขั้นที่ว่างยุบเหลือแถบบาง ๆ */
  const tileHeight = (n: number) => (n === 0 ? 68 : 84 + Math.round((n / railMax) * 56));
  const pctOf = (n: number) => (railTotal > 0 ? Math.round((n / railTotal) * 100) : 0);

  const heroPct = m.openTotal > 0 ? Math.round((m.needUs / m.openTotal) * 100) : 0;
  const deltaYesterday = m.salesYesterday > 0 ? Math.round(((m.salesToday - m.salesYesterday) / m.salesYesterday) * 100) : null;
  const maxBar = Math.max(...m.series.map((p) => p.total), 1);
  const best = m.series.reduce((a, b) => (b.total > a.total ? b : a), m.series[0]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className={SHELL}>
      <div className="mx-auto max-w-[1180px]">
        {/* ── หัวหน้า: วันนี้เป็นวันไหน ข้อมูลสดแค่ไหน ── */}
        <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-2">
          <div>
            <p className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
              แผงหน้าร้าน
            </p>
            <h1 className="dkb-display mt-1 text-[1.5rem] leading-tight sm:text-[2rem]">{thaiToday(now)}</h1>
          </div>
          <p className="text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            รับเข้าวันนี้ <span className="dkb-num-sm" style={{ color: "var(--dk-navy)" }}>{m.newToday}</span> ใบ
            <span style={{ color: "var(--dk-faint)" }}> · เมื่อวาน {m.newYesterday} ใบ</span>
            {updatedAt && (
              <span style={{ color: "var(--dk-faint)" }}>
                {" · อัปเดต "}
                {updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </header>

        {(demo || stale) && (
          <p
            className="mb-4 rounded-[20px] px-4 py-2.5 text-[13px]"
            style={{
              background: stale ? "var(--dk-coral-wash)" : "var(--dk-yolk-wash)",
              color: stale ? "var(--dk-coral-ink)" : "var(--dk-yolk-ink)",
            }}
          >
            {stale
              ? "ต่อเซิร์ฟเวอร์ไม่ได้ — ตัวเลขที่เห็นเป็นข้อมูลที่โหลดไว้ล่าสุด ลองใหม่อีกครั้งเมื่อเน็ตกลับมา"
              : "ยังไม่ได้ต่อฐานข้อมูล — ตัวเลขทั้งหน้าเป็นออเดอร์ตัวอย่าง ไม่ใช่ยอดจริง"}
          </p>
        )}

        <div className={`grid gap-4 ${m.urgent > 0 ? "lg:grid-cols-[1fr_360px]" : ""}`}>
        {/* ── กล่องหัว: งานที่รอมือเราทั้งหมด + วงแหวนสัดส่วน ── */}
        <section
          className="dkb-g relative flex items-center gap-4 overflow-hidden p-4 sm:gap-5 sm:p-5"
          style={{ ["--dk-pct" as string]: `${heroPct}%` }}
        >
          <span className="dkb-shine" />
          <span className="dkb-ring">
            <i>
              <span className="dkb-num text-[2.2rem]" style={{ color: m.needUs > 0 ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                {m.needUs}
              </span>
            </i>
          </span>
          <span className="min-w-0">
            <span className="dkb-display block text-[1.1rem] leading-tight">งานรอมือเรา</span>
            <span className="mt-1 block text-[13px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
              {heroPct}% ของ {m.openTotal} ใบที่ยังไม่ปิด
              <br />
              ไม่นับใบที่รอลูกค้าตอบ
            </span>
          </span>
        </section>

        {/* ── แถบงานด่วน: แทรกขวางทุกอย่าง โผล่เฉพาะตอนมีจริง ── */}
        {m.urgent > 0 && (
          <Link href="/admin/orders" className="dkb-g dkb-rush">
            <span className="dkb-shine" />
            <span className="dkb-num relative z-[1] text-[1.9rem]">{m.urgent}</span>
            <span className="relative z-[1] min-w-0 flex-1">
              <span className="dkb-h2 block text-[15px]">งานเร่ง / เลยกำหนดใช้งาน</span>
              <span className="block text-[12.5px] opacity-90">
                เลยกำหนด {m.late} ใบ · ติดธงเร่ง {m.rush} ใบ — แทรกคิวก่อนใบอื่น
              </span>
            </span>
            <span aria-hidden className="relative z-[1] text-lg opacity-70">
              →
            </span>
          </Link>
        )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-4 lg:content-start">
            {/* ── ราง: ลำดับงานจริง · กล่องสูงตามปริมาณ ── */}
            <div className="dkb-rail grid gap-3.5">
              {steps.map((t) => (
                <div
                  key={t.key}
                  className="dkb-node"
                  style={{
                    ["--dk-tone" as string]: t.n === 0 ? "var(--dk-sky-300)" : t.tone,
                    ["--dk-pct" as string]: `${pctOf(t.n)}%`,
                    ["--dk-h" as string]: `${tileHeight(t.n)}px`,
                  }}
                >
                  <span className="dkb-knob">
                    <i>
                      <span
                        className="dkb-num text-[1.45rem]"
                        style={{ color: t.n === 0 ? "var(--dk-faint)" : "var(--dk-navy)" }}
                      >
                        {t.n}
                      </span>
                    </i>
                  </span>
                  <Link href={t.href} className="dkb-g dkb-tile" data-void={t.n === 0 ? "1" : undefined}>
                    <span className="flex items-baseline gap-3">
                      <span
                        className="dkb-display text-[1.02rem]"
                        style={t.n === 0 ? { color: "var(--dk-faint)" } : undefined}
                      >
                        {t.label}
                      </span>
                      {t.n > 0 && (
                        <span className="dkb-num-sm ml-auto shrink-0 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                          {pctOf(t.n)}% ของงานบนราง
                        </span>
                      )}
                    </span>
                    <span
                      className="mt-0.5 text-[12.5px] leading-snug"
                      style={{ color: t.n === 0 ? "var(--dk-faint)" : "var(--dk-navy-soft)" }}
                    >
                      {t.n === 0 ? "ไม่มีงานค้างในขั้นนี้" : t.hint}
                    </span>
                    {t.n > 0 && (
                      <span className="dkb-bar">
                        <i />
                      </span>
                    )}
                    {t.n > 0 && t.act && <span className="dkb-h2 dkb-go">เปิดรายการ →</span>}
                  </Link>
                </div>
              ))}
            </div>

            {/* ── ของที่ต้องทำ: รวมจำนวนต่อรายการ สำหรับคนที่ยืนหน้าชั้นวาง ── */}
            <section className="dkb-g p-4 sm:p-5">
              <SectionHead title="ของที่ต้องทำ" note="รวมทุกใบที่ยังไม่ได้ส่ง" href="/admin/print" cta="คิวปริ้น" />
              {m.workload.length === 0 ? (
                <Empty title="คิวว่าง" body="ไม่มีของค้างผลิต — เริ่มงานใหม่ได้จากใบที่จ่ายครบแล้ว" />
              ) : (
                <ul className="mt-2">
                  {m.workload.slice(0, 6).map((w) => (
                    <li key={w.name} className="dkb-row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px]">{w.name}</span>
                        <span className="mt-0.5 block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          จาก {w.orders} ใบ
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="dkb-num text-[1.65rem]">{w.qty.toLocaleString("th-TH")}</span>
                        <span className="ml-1.5 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          ชิ้น
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:content-start">
            {/* ── เงิน: ยอดวันนี้ + กราฟ 7 วันในกล่องเดียว ── */}
            {seesMoney && (
              <section className="dkb-g p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <span className="text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                    ยอดขายวันนี้
                  </span>
                  <span className="dkb-num text-[1.7rem]">{formatPrice(m.salesToday)}</span>
                </div>
                <p className="mt-1 px-1 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                  {deltaYesterday === null ? (
                    <>เมื่อวานไม่มียอดขาย</>
                  ) : (
                    <>
                      <span style={{ color: deltaYesterday >= 0 ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
                        {deltaYesterday >= 0 ? "▲" : "▼"} {Math.abs(deltaYesterday)}%
                      </span>{" "}
                      จากเมื่อวาน
                    </>
                  )}
                  <span style={{ color: "var(--dk-faint)" }}>{` · เฉลี่ย 7 วัน ${formatPrice(m.avg7)}`}</span>
                </p>
                <div className="dkb-spark">
                  {m.series.map((p) => (
                    <i
                      key={p.key}
                      data-today={p.isToday ? "1" : undefined}
                      title={`${p.label} · ${formatPrice(p.total)}`}
                      style={{ height: p.total > 0 ? `${Math.max(6, Math.round((p.total / maxBar) * 100))}%` : 2 }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                  {m.series.map((p) => (
                    <span key={p.key} className="flex-1 text-center" style={p.isToday ? { color: "var(--dk-navy)" } : undefined}>
                      {p.label}
                    </span>
                  ))}
                </div>
                {best.total > 0 && !best.isToday && (
                  <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                    สูงสุดในรอบ {formatPrice(best.total)} ({best.label})
                  </p>
                )}
                {m.dueCount > 0 && (
                  <Link
                    href="/admin/orders"
                    className="mt-3 flex min-h-[58px] items-center gap-3.5 rounded-[18px] px-4"
                    style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
                  >
                    <span className="dkb-num text-[1.6rem]">{m.dueCount}</span>
                    <span className="min-w-0 flex-1">
                      <span className="dkb-h2 block text-[13.5px]">ใบที่ต้องตามเก็บเงิน</span>
                      <span className="dkb-num-sm block text-[12.5px] opacity-80">ค้างอยู่ {formatPrice(m.dueAmount)}</span>
                    </span>
                    <span aria-hidden className="opacity-60">
                      →
                    </span>
                  </Link>
                )}
              </section>
            )}

            {/* ── คิวงานที่รอมือเรา: ค้างนานสุดขึ้นก่อน ── */}
            <section className="dkb-g p-4 sm:p-5">
              <SectionHead title="รอมือเรา" note="ค้างนานสุดขึ้นก่อน" href="/admin/orders" cta="ทั้งหมด" />
              {m.queue.length === 0 ? (
                <Empty title="ไม่มีงานค้าง" body="เคลียร์หมดแล้ว — ใบใหม่จะโผล่ตรงนี้ทันทีที่ลูกค้าแจ้งโอน" />
              ) : (
                <ul className="mt-2">
                  {m.queue.slice(0, 5).map((o) => {
                    const age = ageOf(o.date, now);
                    return (
                      <li key={o.id}>
                        <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row">
                          {/* ชื่อลูกค้าขึ้นก่อน — คนกวาดตาหาชื่อ ไม่ได้หาเลขที่ใบ */}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{o.customer}</span>
                            <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
                              <span className="dkb-code truncate" style={{ color: "var(--dk-faint)" }}>
                                {o.id}
                              </span>
                              {age && (
                                <span
                                  className="shrink-0 text-[11.5px]"
                                  style={{ color: age.hot ? "var(--dk-coral-ink)" : "var(--dk-navy-soft)" }}
                                >
                                  {age.text}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1.5">
                            <StatusChip s={o.status} />
                            {seesMoney && (
                              <span className="dkb-num-sm text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                                {formatPrice(orderTotal(o))}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── ออเดอร์ล่าสุด (รวมใบที่จบแล้ว — จึงเงียบที่สุดในหน้า) ── */}
            <section className="dkb-g p-4 sm:p-5">
              <SectionHead title="เข้ามาล่าสุด" href="/admin/orders" cta="ทั้งหมด" />
              {m.recent.length === 0 ? (
                <Empty title="ยังไม่มีออเดอร์" body="เมื่อลูกค้าสั่งของ ใบแรกจะขึ้นตรงนี้" />
              ) : (
                <ul className="mt-2">
                  {m.recent.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row !min-h-[54px]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px]">{o.customer}</span>
                          <span className="dkb-code mt-0.5 block truncate" style={{ color: "var(--dk-faint)" }}>
                            {o.id} · {shortDate(o.date)}
                          </span>
                        </span>
                        <span className="shrink-0">
                          <StatusChip s={o.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, note, href, cta }: { title: string; note?: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="dkb-h2 text-[1.1rem]">
        {title}
        {note && (
          <span className="ml-2.5 text-[12px]" style={{ color: "var(--dk-faint)", fontFamily: "var(--font-prompt)" }}>
            {note}
          </span>
        )}
      </h2>
      {href && cta && (
        <Link href={href} className="shrink-0 text-[13px]" style={{ color: "var(--dk-blue-deep)" }}>
          {cta} →
        </Link>
      )}
    </div>
  );
}

/** ช่องว่างต้องบอกว่าต้องทำอะไรต่อ ไม่ใช่แค่บอกว่าไม่มีข้อมูล */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3 rounded-[18px] px-4 py-7 text-center" style={{ background: "rgba(255,255,255,0.45)" }}>
      <p className="dkb-h2 text-[15px]">{title}</p>
      <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
        {body}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={SHELL}>
      <div className="mx-auto max-w-[1180px]">
        <div className="dkb-skel h-10 w-60" style={{ borderRadius: 16 }} />
        <div className="dkb-skel mt-4 h-[120px] w-full" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="dkb-skel h-[420px]" />
          <div className="dkb-skel h-[420px]" />
        </div>
        <p className="mt-5 text-center text-[13px]" style={{ color: "var(--dk-faint)" }}>
          กำลังดึงออเดอร์…
        </p>
      </div>
    </div>
  );
}

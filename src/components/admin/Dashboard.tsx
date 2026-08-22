"use client";

/**
 * แผงหน้าร้าน — หน้าภาพรวมหลังบ้าน (/admin)
 *
 * ออกแบบสำหรับ "คนที่กำลังทำงานอยู่" ไม่ใช่รายงานสวย ๆ:
 *  · เจ้าของร้านเปิดจากมือถือ 3 วินาที ต้องได้คำตอบว่าวันนี้ต้องทำอะไร
 *  · ฝ่ายผลิตยืนหน้าชั้นวาง มองจอจากระยะแขน ตัวเลขจึงต้องใหญ่และหลักตรงกัน
 *  · งานค้าง (บอร์ดน้ำเงิน) เด่นกว่างานที่จบแล้ว (แถวเทาจาง) เสมอ
 *
 * โทนสี/เงา/มุม ยกมาจากหน้าร้าน (landing.css) ผ่าน token ใน dashboard.css
 * ⚠️ ห้ามเขียน hex ตรง ๆ ในไฟล์นี้ — อ้าง var(--dk-*) เท่านั้น
 */

import Link from "next/link";
import { useMemo } from "react";
import "./dashboard.css";
import { formatPrice } from "@/lib/products";
import { orderTotal, type Order, type OrderStatus } from "@/lib/admin-data";
import { computeDash, parseThaiDate, thaiToday } from "@/lib/admin-dash";

/** สีป้ายสถานะ — งานที่จบแล้วไม่มีพื้น (เงียบกว่างานค้างเสมอ) */
const CHIP: Record<OrderStatus, { fg: string; bg: string }> = {
  รอชำระเงิน: { fg: "var(--dk-yolk-ink)", bg: "var(--dk-yolk-wash)" },
  รอตรวจสอบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  ชำระแล้ว: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  รอตรวจแบบ: { fg: "var(--dk-lilac-ink)", bg: "var(--dk-lilac-wash)" },
  แก้ไขแบบ: { fg: "var(--dk-coral-ink)", bg: "var(--dk-coral-wash)" },
  อนุมัติแบบ: { fg: "var(--dk-mint-ink)", bg: "var(--dk-mint-wash)" },
  กำลังผลิต: { fg: "var(--dk-sky-deep)", bg: "var(--dk-sky-wash)" },
  จัดส่งแล้ว: { fg: "var(--dk-ink-soft)", bg: "transparent" },
  เสร็จสิ้น: { fg: "var(--dk-ink-faint)", bg: "transparent" },
  ยกเลิก: { fg: "var(--dk-ink-faint)", bg: "transparent" },
};

function StatusChip({ s }: { s: OrderStatus }) {
  const t = CHIP[s] ?? CHIP["เสร็จสิ้น"];
  return (
    <span className="dkb-chip" style={{ color: t.fg, background: t.bg }}>
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
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
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

export default function Dashboard({ orders, loading, demo, stale, updatedAt, seesMoney }: DashboardProps) {
  const now = useMemo(() => new Date(), []);
  const m = useMemo(() => computeDash(orders, now), [orders, now]);

  const tiles = [
    { n: m.toCheckSlip, label: "ตรวจสลิป", hint: "ลูกค้าแจ้งโอนแล้ว", bar: "var(--dk-yolk)", href: "/admin/orders?status=รอตรวจสอบ" },
    { n: m.toStart, label: "เริ่มผลิตได้", hint: "จ่ายครบ/อนุมัติแบบ", bar: "var(--dk-mint)", href: "/admin/orders?status=ชำระแล้ว" },
    { n: m.toFixProof, label: "แบบต้องแก้", hint: "ลูกค้าขอแก้ไข", bar: "var(--dk-coral)", href: "/admin/orders?status=แก้ไขแบบ" },
    { n: m.making, label: "กำลังผลิต", hint: "เดินอยู่ในโรงพิมพ์", bar: "var(--dk-blue)", href: "/admin/orders?status=กำลังผลิต", flow: true },
  ];

  const deltaYesterday = m.salesYesterday > 0 ? Math.round(((m.salesToday - m.salesYesterday) / m.salesYesterday) * 100) : null;
  const maxBar = Math.max(...m.series.map((p) => p.total), 1);
  const best = m.series.reduce((a, b) => (b.total > a.total ? b : a), m.series[0]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="dkb -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1180px]">
        {/* ── หัวหน้า: วันนี้เป็นวันไหน ข้อมูลสดแค่ไหน ── */}
        <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <p className="dkb-eyebrow" style={{ color: "var(--dk-ink-faint)" }}>
              แผงหน้าร้าน
            </p>
            <h1 className="dkb-display mt-0.5 text-[1.45rem] leading-tight sm:text-[1.9rem]">{thaiToday(now)}</h1>
          </div>
          <p className="text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
            รับเข้าวันนี้ <b className="dkb-num-sm" style={{ color: "var(--dk-ink)" }}>{m.newToday}</b> ใบ
            <span style={{ color: "var(--dk-ink-faint)" }}> · เมื่อวาน {m.newYesterday} ใบ</span>
            {updatedAt && (
              <span style={{ color: "var(--dk-ink-faint)" }}>
                {" · อัปเดต "}
                {updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </header>

        {(demo || stale) && (
          <p
            className="mb-3 rounded-xl px-3 py-2 text-[13px] font-medium"
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

        {/* ── บอร์ดงานค้าง: จุดที่กล้าที่สุดของหน้า ── */}
        <section className="dkb-board relative p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="dkb-eyebrow" style={{ color: "var(--dk-on-board-soft)" }}>
                ต้องทำตอนนี้
              </p>
              <div className="mt-1 flex items-end gap-2.5">
                <span
                  className="dkb-num"
                  style={{ fontSize: "clamp(2.9rem, 11vw, 3.6rem)", color: m.needUs > 0 ? "var(--dk-yolk)" : "var(--dk-on-board-soft)" }}
                >
                  {m.needUs}
                </span>
                <span className="dkb-display pb-1 text-lg" style={{ color: "var(--dk-on-board)" }}>
                  งานรอมือเรา
                </span>
              </div>
              <p className="mt-1 text-[13px]" style={{ color: "var(--dk-on-board-soft)" }}>
                จาก {m.openTotal} ใบที่ยังไม่ปิด · ไม่นับใบที่รอลูกค้าตอบ
              </p>
            </div>
          </div>

          {/* ช่องกดได้ทั้งช่อง — นิ้วโป้งข้างเดียวกดได้ */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className="dkb-tile"
                data-idle={t.n === 0 ? "1" : undefined}
                data-flow={t.flow ? "1" : undefined}
                style={t.n > 0 ? { borderLeftColor: t.bar } : undefined}
              >
                <span className="dkb-num dkb-tile-num block">{t.n}</span>
                <span className="dkb-h2 mt-2 block text-[15px]" style={{ color: "var(--dk-on-board)" }}>
                  {t.label}
                </span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--dk-on-board-soft)" }}>
                  {t.hint}
                </span>
              </Link>
            ))}
          </div>

          {/* แถบด่วน — โผล่เฉพาะตอนมีงานเลยกำหนด/งานเร่งจริง */}
          {m.urgent > 0 && (
            <Link href="/admin/orders" className="dkb-alarm mt-3">
              <span className="dkb-num" style={{ fontSize: "1.7rem" }}>
                {m.urgent}
              </span>
              <span className="min-w-0 flex-1">
                <b className="dkb-display block text-[15px]">งานเร่ง / เลยกำหนดใช้งาน</b>
                <span className="block text-[12px] opacity-80">
                  เลยกำหนด {m.late} ใบ · ติดธงเร่ง {m.rush} ใบ — หยิบก่อนใบอื่น
                </span>
              </span>
              <span aria-hidden className="text-lg">→</span>
            </Link>
          )}

          {/* ปุ่มหลัก — บนมือถืออยู่ใต้ช่องงาน (นิ้วโป้งเอื้อมถึง) · เดสก์ท็อปลอยไปมุมขวาบนของบอร์ด */}
          <Link
            href="/admin/orders"
            className="dkb-h2 mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] lg:absolute lg:right-6 lg:top-6 lg:mt-0 lg:w-auto"
            style={{ background: "var(--dk-yolk)", color: "var(--dk-ink)" }}
          >
            เปิดคำสั่งซื้อทั้งหมด <span aria-hidden>→</span>
          </Link>

          {/* ยอดขายวันนี้แบบย่อในบอร์ด — เจ้าของร้านได้คำตอบโดยไม่ต้องเลื่อน */}
          {seesMoney && (
            <div
              className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3"
              style={{ borderColor: "var(--dk-board-tile-line)" }}
            >
              <p className="flex items-baseline gap-2">
                <span className="text-[13px]" style={{ color: "var(--dk-on-board-soft)" }}>
                  ยอดขายวันนี้
                </span>
                <span className="dkb-num text-[1.6rem]" style={{ color: "var(--dk-on-board)" }}>
                  {formatPrice(m.salesToday)}
                </span>
              </p>
              <p className="text-[13px]" style={{ color: "var(--dk-on-board-soft)" }}>
                {deltaYesterday === null ? (
                  <>เมื่อวานไม่มียอดขาย</>
                ) : (
                  <>
                    <span style={{ color: deltaYesterday >= 0 ? "var(--dk-mint)" : "var(--dk-coral)" }}>
                      {deltaYesterday >= 0 ? "▲" : "▼"} {Math.abs(deltaYesterday)}%
                    </span>{" "}
                    จากเมื่อวาน ({formatPrice(m.salesYesterday)})
                  </>
                )}
                {" · เฉลี่ย 7 วัน "}
                {formatPrice(m.avg7)}
              </p>
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-4">
            {/* ── คิวงานที่รอมือเรา: ค้างนานสุดขึ้นก่อน ── */}
            <section className="dkb-card p-3 sm:p-4">
              <SectionHead title="รอมือเรา" note="ค้างนานสุดขึ้นก่อน" href="/admin/orders" cta="ทั้งหมด" />
              {m.queue.length === 0 ? (
                <Empty
                  title="ไม่มีงานค้าง"
                  body="เคลียร์หมดแล้ว — ใบใหม่จะโผล่ตรงนี้ทันทีที่ลูกค้าแจ้งโอน"
                />
              ) : (
                <ul className="mt-1">
                  {m.queue.slice(0, 6).map((o) => {
                    const age = ageOf(o.date, now);
                    return (
                      <li key={o.id}>
                        <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row">
                          {/* ชื่อลูกค้าขึ้นก่อน — คนกวาดตาหาชื่อ ไม่ได้หาเลขที่ใบ */}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold" style={{ color: "var(--dk-ink)" }}>
                              {o.customer}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
                              <b className="dkb-code truncate text-[11.5px]" style={{ color: "var(--dk-ink-faint)" }}>
                                {o.id}
                              </b>
                              {age && (
                                <span
                                  className="shrink-0 text-[11.5px] font-bold"
                                  style={{ color: age.hot ? "var(--dk-coral-ink)" : "var(--dk-ink-soft)" }}
                                >
                                  {age.text}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
                            <StatusChip s={o.status} />
                            {seesMoney && (
                              <span className="dkb-num-sm text-[14px]" style={{ color: "var(--dk-ink)" }}>
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

            {/* ── ของที่ต้องทำ: รวมจำนวนต่อรายการ สำหรับคนที่ยืนหน้าชั้นวาง ── */}
            <section className="dkb-card p-3 sm:p-4">
              <SectionHead title="ของที่ต้องทำ" note="รวมทุกใบที่ยังไม่ได้ส่ง" href="/admin/print" cta="คิวปริ้น" />
              {m.workload.length === 0 ? (
                <Empty title="คิวว่าง" body="ไม่มีของค้างผลิต — เริ่มงานใหม่ได้จากใบที่จ่ายครบแล้ว" />
              ) : (
                <ul className="mt-1">
                  {m.workload.slice(0, 6).map((w) => (
                    <li key={w.name} className="dkb-row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold" style={{ color: "var(--dk-ink)" }}>
                          {w.name}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--dk-ink-faint)" }}>
                          จาก {w.orders} ใบ
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="dkb-num text-[1.5rem]" style={{ color: "var(--dk-ink)" }}>
                          {w.qty.toLocaleString("th-TH")}
                        </span>
                        <span className="ml-1 text-[12px]" style={{ color: "var(--dk-ink-faint)" }}>
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
            {/* ── ยอดขาย 7 วัน ── */}
            {seesMoney && (
              <section className="dkb-card p-3 sm:p-4">
                <SectionHead title="ยอดขาย 7 วัน" note={`เฉลี่ย ${formatPrice(m.avg7)}/วัน`} />
                <div className="dkb-bars mt-3">
                  {m.series.map((p) => (
                    <div
                      key={p.key}
                      className="dkb-bar"
                      data-today={p.isToday ? "1" : undefined}
                      title={`${p.label} · ${formatPrice(p.total)}`}
                    >
                      <span style={{ height: p.total > 0 ? `${Math.max(6, Math.round((p.total / maxBar) * 100))}%` : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--dk-ink-faint)" }}>
                  {m.series.map((p) => (
                    <span key={p.key} className="flex-1 text-center" style={p.isToday ? { color: "var(--dk-ink)", fontWeight: 700 } : undefined}>
                      {p.label}
                    </span>
                  ))}
                </div>
                {/* ตัวเทียบให้แท่งวันนี้ — สูงสุดในรอบสัปดาห์คือเท่าไหร่ วันไหน */}
                <p className="mt-2 border-t pt-2 text-[12.5px]" style={{ borderColor: "var(--dk-line)", color: "var(--dk-ink-soft)" }}>
                  วันนี้ <b className="dkb-num-sm" style={{ color: "var(--dk-ink)" }}>{formatPrice(m.salesToday)}</b>
                  {best.total > 0 && (
                    <span style={{ color: "var(--dk-ink-faint)" }}>
                      {best.isToday ? " · สูงสุดในรอบ 7 วัน" : ` · สูงสุดในรอบ ${formatPrice(best.total)} (${best.label})`}
                    </span>
                  )}
                </p>
                {m.dueCount > 0 && (
                  <Link
                    href="/admin/orders"
                    className="mt-3 flex min-h-[52px] items-center gap-3 rounded-xl px-3"
                    style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
                  >
                    <span className="dkb-num text-[1.5rem]">{m.dueCount}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px]">ใบที่ต้องตามเก็บเงิน</b>
                      <span className="dkb-num-sm block text-[12.5px]">ค้างอยู่ {formatPrice(m.dueAmount)}</span>
                    </span>
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </section>
            )}

            {/* ── ออเดอร์ล่าสุด (รวมใบที่จบแล้ว — จึงเงียบที่สุดในหน้า) ── */}
            <section className="dkb-card p-3 sm:p-4">
              <SectionHead title="เข้ามาล่าสุด" href="/admin/orders" cta="ทั้งหมด" />
              {m.recent.length === 0 ? (
                <Empty title="ยังไม่มีออเดอร์" body="เมื่อลูกค้าสั่งของ ใบแรกจะขึ้นตรงนี้" />
              ) : (
                <ul className="mt-1">
                  {m.recent.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row !min-h-[52px]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--dk-ink)" }}>
                            {o.customer}
                          </span>
                          <span className="dkb-code block truncate text-[11.5px]" style={{ color: "var(--dk-ink-faint)" }}>
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
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="dkb-h2 text-[1.1rem]" style={{ color: "var(--dk-ink)" }}>
        {title}
        {note && (
          <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--dk-ink-faint)", fontFamily: "inherit" }}>
            {note}
          </span>
        )}
      </h2>
      {href && cta && (
        <Link href={href} className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--dk-sky-deep)" }}>
          {cta} →
        </Link>
      )}
    </div>
  );
}

/** ช่องว่างต้องบอกว่าต้องทำอะไรต่อ ไม่ใช่แค่บอกว่าไม่มีข้อมูล */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-2 rounded-xl px-3 py-6 text-center" style={{ background: "var(--dk-paper)" }}>
      <p className="dkb-display text-[15px]" style={{ color: "var(--dk-ink)" }}>
        {title}
      </p>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-ink-soft)" }}>
        {body}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dkb -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="dkb-skel h-9 w-56" />
        <div className="dkb-skel mt-4 h-[268px] w-full" style={{ borderRadius: "var(--dk-r-l)" }} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="dkb-skel h-64" />
          <div className="dkb-skel h-64" />
        </div>
        <p className="mt-4 text-center text-[13px]" style={{ color: "var(--dk-ink-faint)" }}>
          กำลังดึงออเดอร์…
        </p>
      </div>
    </div>
  );
}

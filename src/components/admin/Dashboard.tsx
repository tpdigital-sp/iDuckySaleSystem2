"use client";

/**
 * แผงหน้าร้าน — หน้าภาพรวมหลังบ้าน (/admin)
 *
 * ออกแบบสำหรับ "คนที่กำลังทำงานอยู่" ไม่ใช่รายงานสวย ๆ:
 *  · เจ้าของร้านเปิดจากมือถือ 3 วินาที ต้องได้คำตอบว่าวันนี้ต้องทำอะไร
 *  · ฝ่ายผลิตยืนหน้าชั้นวาง มองจอจากระยะแขน ตัวเลขจึงต้องใหญ่
 *  · งานค้างเด่นกว่างานที่จบแล้วเสมอ (ตัวเลขใหญ่ vs ป้ายไม่มีพื้น)
 *
 * ชั้นภาพ (สี/เงา/มุม/น้ำหนักตัวอักษร) อยู่ใน dashboard.css — โปร่ง สว่าง ตามหน้าร้าน
 * ⚠️ ห้ามเขียน hex ตรง ๆ ในไฟล์นี้ — อ้าง var(--dk-*) เท่านั้น
 * ⚠️ อย่าไล่ใส่ font-bold/font-semibold ทั่วหน้า — ลำดับความสำคัญมาจากขนาดกับพื้นที่ว่าง
 *    (รอบแรกใส่ตัวหนาทุกจุดจนหน้าดูแน่นและหนัก ต้องรื้อใหม่ทั้งชั้น)
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
  กำลังผลิต: { fg: "var(--dk-sky-deep)", bg: "var(--dk-sky-hover)" },
  จัดส่งแล้ว: { fg: "var(--dk-ink-soft)", bg: "transparent" },
  เสร็จสิ้น: { fg: "var(--dk-ink-faint)", bg: "transparent" },
  ยกเลิก: { fg: "var(--dk-ink-faint)", bg: "transparent" },
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

  const tiles = [
    { n: m.toCheckSlip, label: "ตรวจสลิป", hint: "ลูกค้าแจ้งโอนแล้ว", dot: "var(--dk-yolk-deep)", href: "/admin/orders?status=รอตรวจสอบ" },
    { n: m.toStart, label: "เริ่มผลิตได้", hint: "จ่ายครบ / อนุมัติแบบ", dot: "var(--dk-mint)", href: "/admin/orders?status=ชำระแล้ว" },
    { n: m.toFixProof, label: "แบบต้องแก้", hint: "ลูกค้าขอแก้ไข", dot: "var(--dk-coral)", href: "/admin/orders?status=แก้ไขแบบ" },
    { n: m.making, label: "กำลังผลิต", hint: "เดินอยู่ในโรงพิมพ์", dot: "var(--dk-blue)", href: "/admin/orders?status=กำลังผลิต" },
  ];

  const deltaYesterday = m.salesYesterday > 0 ? Math.round(((m.salesToday - m.salesYesterday) / m.salesYesterday) * 100) : null;
  const maxBar = Math.max(...m.series.map((p) => p.total), 1);
  const best = m.series.reduce((a, b) => (b.total > a.total ? b : a), m.series[0]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className={SHELL}>
      <div className="mx-auto max-w-[1180px]">
        {/* ── หัวหน้า: วันนี้เป็นวันไหน ข้อมูลสดแค่ไหน ── */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
          <div>
            <p className="dkb-eyebrow" style={{ color: "var(--dk-ink-faint)" }}>
              แผงหน้าร้าน
            </p>
            <h1 className="dkb-display mt-1 text-[1.55rem] leading-tight sm:text-[2.1rem]">{thaiToday(now)}</h1>
          </div>
          <p className="text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
            รับเข้าวันนี้ <span className="dkb-num-sm" style={{ color: "var(--dk-ink)" }}>{m.newToday}</span> ใบ
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
            className="mb-4 rounded-2xl px-4 py-2.5 text-[13px]"
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

        {/* ── การ์ดงานค้าง: ตัวเลขใหญ่บนพื้นขาวโล่ง ── */}
        <section className="dkb-hero p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="dkb-eyebrow" style={{ color: "var(--dk-ink-faint)" }}>
                ต้องทำตอนนี้
              </p>
              <div className="mt-2 flex items-end gap-3">
                <span
                  className="dkb-num"
                  style={{ fontSize: "clamp(3.2rem, 12vw, 4.2rem)", color: m.needUs > 0 ? "var(--dk-ink)" : "var(--dk-ink-faint)" }}
                >
                  {m.needUs}
                </span>
                <span className="dkb-display pb-1.5 text-[1.15rem]" style={{ color: "var(--dk-ink)" }}>
                  งานรอมือเรา
                </span>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
                จาก {m.openTotal} ใบที่ยังไม่ปิด · ไม่นับใบที่รอลูกค้าตอบ
              </p>
            </div>
            {/* ปุ่มหลัก — เดสก์ท็อปอยู่มุมขวาบน · มือถือลงไปอยู่ใต้ช่องงาน (นิ้วโป้งเอื้อมถึง) */}
            <Link href="/admin/orders" className="dkb-btn dkb-btn-rail dkb-h2 text-[15px]">
              เปิดคำสั่งซื้อทั้งหมด <span aria-hidden>→</span>
            </Link>
          </div>

          {/* ช่องกดได้ทั้งช่อง */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="dkb-tile" data-idle={t.n === 0 ? "1" : undefined}>
                <span className="dkb-num dkb-tile-num block">{t.n}</span>
                <span className="mt-2.5 flex items-center gap-2">
                  <i className="dkb-dot" style={{ background: t.dot }} />
                  <span className="dkb-h2 text-[15px]" style={{ color: "var(--dk-ink)" }}>
                    {t.label}
                  </span>
                </span>
                <span className="mt-1 block text-[12px]" style={{ color: "var(--dk-ink-faint)" }}>
                  {t.hint}
                </span>
              </Link>
            ))}
          </div>

          {/* แถบด่วน — โผล่เฉพาะตอนมีงานเลยกำหนด/งานเร่งจริง */}
          {m.urgent > 0 && (
            <Link href="/admin/orders" className="dkb-alarm mt-3">
              <span className="dkb-num" style={{ fontSize: "2rem" }}>
                {m.urgent}
              </span>
              <span className="min-w-0 flex-1">
                <span className="dkb-h2 block text-[15px]">งานเร่ง / เลยกำหนดใช้งาน</span>
                <span className="mt-0.5 block text-[12.5px] opacity-75">
                  เลยกำหนด {m.late} ใบ · ติดธงเร่ง {m.rush} ใบ — หยิบก่อนใบอื่น
                </span>
              </span>
              <span aria-hidden className="text-lg opacity-60">→</span>
            </Link>
          )}

          <Link href="/admin/orders" className="dkb-btn dkb-btn-wide dkb-h2 mt-3 text-[15px]">
            เปิดคำสั่งซื้อทั้งหมด <span aria-hidden>→</span>
          </Link>

          {/* ยอดขายวันนี้แบบย่อ — เจ้าของร้านได้คำตอบโดยไม่ต้องเลื่อน */}
          {seesMoney && (
            <div
              className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t pt-4"
              style={{ borderColor: "var(--dk-line)" }}
            >
              <p className="flex items-baseline gap-2.5">
                <span className="text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
                  ยอดขายวันนี้
                </span>
                <span className="dkb-num text-[1.75rem]" style={{ color: "var(--dk-ink)" }}>
                  {formatPrice(m.salesToday)}
                </span>
              </p>
              <p className="text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
                {deltaYesterday === null ? (
                  <>เมื่อวานไม่มียอดขาย</>
                ) : (
                  <>
                    <span style={{ color: deltaYesterday >= 0 ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
                      {deltaYesterday >= 0 ? "▲" : "▼"} {Math.abs(deltaYesterday)}%
                    </span>{" "}
                    จากเมื่อวาน ({formatPrice(m.salesYesterday)})
                  </>
                )}
                <span style={{ color: "var(--dk-ink-faint)" }}>{` · เฉลี่ย 7 วัน ${formatPrice(m.avg7)}`}</span>
              </p>
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-5 lg:content-start">
            {/* ── คิวงานที่รอมือเรา: ค้างนานสุดขึ้นก่อน ── */}
            <section className="dkb-card p-4 sm:p-5">
              <SectionHead title="รอมือเรา" note="ค้างนานสุดขึ้นก่อน" href="/admin/orders" cta="ทั้งหมด" />
              {m.queue.length === 0 ? (
                <Empty title="ไม่มีงานค้าง" body="เคลียร์หมดแล้ว — ใบใหม่จะโผล่ตรงนี้ทันทีที่ลูกค้าแจ้งโอน" />
              ) : (
                <ul className="mt-2">
                  {m.queue.slice(0, 6).map((o) => {
                    const age = ageOf(o.date, now);
                    return (
                      <li key={o.id}>
                        <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row">
                          {/* ชื่อลูกค้าขึ้นก่อน — คนกวาดตาหาชื่อ ไม่ได้หาเลขที่ใบ */}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15.5px]" style={{ color: "var(--dk-ink)" }}>
                              {o.customer}
                            </span>
                            <span className="mt-1 flex items-center gap-2 whitespace-nowrap">
                              <span className="dkb-code truncate" style={{ color: "var(--dk-ink-faint)" }}>
                                {o.id}
                              </span>
                              {age && (
                                <span
                                  className="shrink-0 text-[11.5px]"
                                  style={{ color: age.hot ? "var(--dk-coral-ink)" : "var(--dk-ink-faint)" }}
                                >
                                  {age.text}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row-reverse sm:items-center sm:gap-4">
                            <StatusChip s={o.status} />
                            {seesMoney && (
                              <span className="dkb-num-sm text-[14px]" style={{ color: "var(--dk-ink-soft)" }}>
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
            <section className="dkb-card p-4 sm:p-5">
              <SectionHead title="ของที่ต้องทำ" note="รวมทุกใบที่ยังไม่ได้ส่ง" href="/admin/print" cta="คิวปริ้น" />
              {m.workload.length === 0 ? (
                <Empty title="คิวว่าง" body="ไม่มีของค้างผลิต — เริ่มงานใหม่ได้จากใบที่จ่ายครบแล้ว" />
              ) : (
                <ul className="mt-2">
                  {m.workload.slice(0, 6).map((w) => (
                    <li key={w.name} className="dkb-row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px]" style={{ color: "var(--dk-ink)" }}>
                          {w.name}
                        </span>
                        <span className="mt-1 block text-[12px]" style={{ color: "var(--dk-ink-faint)" }}>
                          จาก {w.orders} ใบ
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="dkb-num text-[1.7rem]" style={{ color: "var(--dk-ink)" }}>
                          {w.qty.toLocaleString("th-TH")}
                        </span>
                        <span className="ml-1.5 text-[12px]" style={{ color: "var(--dk-ink-faint)" }}>
                          ชิ้น
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-5 lg:content-start">
            {/* ── ยอดขาย 7 วัน ── */}
            {seesMoney && (
              <section className="dkb-card p-4 sm:p-5">
                <SectionHead title="ยอดขาย 7 วัน" note={`เฉลี่ย ${formatPrice(m.avg7)}/วัน`} />
                <div className="dkb-bars mt-4">
                  {m.series.map((p) => (
                    <div key={p.key} className="dkb-bar" data-today={p.isToday ? "1" : undefined} title={`${p.label} · ${formatPrice(p.total)}`}>
                      <span style={{ height: p.total > 0 ? `${Math.max(6, Math.round((p.total / maxBar) * 100))}%` : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: "var(--dk-ink-faint)" }}>
                  {m.series.map((p) => (
                    <span key={p.key} className="flex-1 text-center" style={p.isToday ? { color: "var(--dk-ink)" } : undefined}>
                      {p.label}
                    </span>
                  ))}
                </div>
                {/* ตัวเทียบให้แท่งวันนี้ */}
                <p className="mt-4 text-[13px]" style={{ color: "var(--dk-ink-soft)" }}>
                  วันนี้ <span className="dkb-num-sm" style={{ color: "var(--dk-ink)" }}>{formatPrice(m.salesToday)}</span>
                  {best.total > 0 && (
                    <span style={{ color: "var(--dk-ink-faint)" }}>
                      {best.isToday ? " · สูงสุดในรอบ 7 วัน" : ` · สูงสุดในรอบ ${formatPrice(best.total)} (${best.label})`}
                    </span>
                  )}
                </p>
                {m.dueCount > 0 && (
                  <Link
                    href="/admin/orders"
                    className="mt-4 flex min-h-[58px] items-center gap-3.5 rounded-2xl px-4"
                    style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
                  >
                    <span className="dkb-num text-[1.7rem]">{m.dueCount}</span>
                    <span className="min-w-0 flex-1">
                      <span className="dkb-h2 block text-[13.5px]">ใบที่ต้องตามเก็บเงิน</span>
                      <span className="dkb-num-sm block text-[12.5px] opacity-75">ค้างอยู่ {formatPrice(m.dueAmount)}</span>
                    </span>
                    <span aria-hidden className="opacity-60">→</span>
                  </Link>
                )}
              </section>
            )}

            {/* ── ออเดอร์ล่าสุด (รวมใบที่จบแล้ว — จึงเงียบที่สุดในหน้า) ── */}
            <section className="dkb-card p-4 sm:p-5">
              <SectionHead title="เข้ามาล่าสุด" href="/admin/orders" cta="ทั้งหมด" />
              {m.recent.length === 0 ? (
                <Empty title="ยังไม่มีออเดอร์" body="เมื่อลูกค้าสั่งของ ใบแรกจะขึ้นตรงนี้" />
              ) : (
                <ul className="mt-2">
                  {m.recent.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="dkb-row !min-h-[56px]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px]" style={{ color: "var(--dk-ink)" }}>
                            {o.customer}
                          </span>
                          <span className="dkb-code mt-0.5 block truncate" style={{ color: "var(--dk-ink-faint)" }}>
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
      <h2 className="dkb-h2 text-[1.1rem]" style={{ color: "var(--dk-ink)" }}>
        {title}
        {note && (
          <span className="ml-2.5 text-[12px]" style={{ color: "var(--dk-ink-faint)", fontFamily: "var(--font-prompt)" }}>
            {note}
          </span>
        )}
      </h2>
      {href && cta && (
        <Link href={href} className="shrink-0 text-[13px]" style={{ color: "var(--dk-sky-deep)" }}>
          {cta} →
        </Link>
      )}
    </div>
  );
}

/** ช่องว่างต้องบอกว่าต้องทำอะไรต่อ ไม่ใช่แค่บอกว่าไม่มีข้อมูล */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3 rounded-2xl px-4 py-8 text-center" style={{ background: "var(--dk-sky-wash)" }}>
      <p className="dkb-h2 text-[15px]" style={{ color: "var(--dk-ink)" }}>
        {title}
      </p>
      <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--dk-ink-soft)" }}>
        {body}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={SHELL}>
      <div className="mx-auto max-w-[1180px]">
        <div className="dkb-skel h-10 w-60" style={{ borderRadius: "16px" }} />
        <div className="dkb-skel mt-5 h-[300px] w-full" style={{ borderRadius: "32px" }} />
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="dkb-skel h-64" />
          <div className="dkb-skel h-64" />
        </div>
        <p className="mt-5 text-center text-[13px]" style={{ color: "var(--dk-ink-faint)" }}>
          กำลังดึงออเดอร์…
        </p>
      </div>
    </div>
  );
}

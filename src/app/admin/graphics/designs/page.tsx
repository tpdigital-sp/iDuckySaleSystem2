"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSelfDesigned, proofsOf, STATUS_STYLES, type Order, type OrderItem, type Proof } from "@/lib/admin-data";
import { h1, muted } from "@/lib/admin-ui";
import { dayOf, orderMatches, useGraphicsOrders } from "../data";

/**
 * 📋 รายงานแบบงาน — ตารางสรุปว่า "แบบของออเดอร์ไหนค้างอยู่ตรงไหน"
 *
 * ไม่ใช่หน้าทำงาน แต่เป็นหน้ารายงานให้กวาดตาดูรวดเดียวว่าใบไหนลูกค้าขอแก้
 * ใบไหนส่งไปแล้วลูกค้ายังไม่กดยืนยัน และใบไหนจบแล้ว — 1 บรรทัด = 1 ลาย
 * (หน้าทำงานจริงอยู่ที่ "ออเดอร์กราฟฟิก")
 */

/** ผลยืนยันแบบของลูกค้า ต่อ 1 ลาย */
type State = "ขอแก้ไข" | "ยังไม่ยืนยัน" | "อนุมัติแล้ว";

/** ลำดับความสำคัญในตาราง — ที่ค้างอยู่ที่เราขึ้นก่อน */
const ORDER_OF: Record<State, number> = { ขอแก้ไข: 0, ยังไม่ยืนยัน: 1, อนุมัติแล้ว: 2 };

const STATE_STYLE: Record<State, string> = {
  ขอแก้ไข: "bg-rose-50 text-rose-700 ring-rose-200/70",
  ยังไม่ยืนยัน: "bg-violet-50 text-violet-700 ring-violet-200/70",
  อนุมัติแล้ว: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
};

const STATE_EMOJI: Record<State, string> = { ขอแก้ไข: "🔁", ยังไม่ยืนยัน: "⏳", อนุมัติแล้ว: "✅" };

/** ความละเอียดที่พิมพ์แล้วคม — ต่ำกว่านี้ควรทักลูกค้าก่อนพิมพ์ */
const DPI_WARN = 150;

/** 1 บรรทัดในรายงาน = แบบ 1 ลาย */
interface Row {
  order: Order;
  item: OrderItem;
  proof: Proof;
  /** ลายที่เท่าไหร่ของรายการนั้น (เริ่มที่ 1) */
  no: number;
  /** ลูกค้าจัดวางลายเองบนเทมเพลต (ไม่ใช่แบบที่กราฟฟิกทำ) */
  self: boolean;
  state: State;
  /** คอมเมนต์ที่ลูกค้าเขียนตอนขอแก้ */
  note: string;
  /** คอมเมนต์นี้เป็นของทั้งรายการ ไม่ใช่ของลายนี้ลายเดียว */
  noteWhole: boolean;
  dpi: number | null;
}

/** อ่านค่า DPI ที่จอวางลายคำนวณไว้ให้ จากบรรทัดพิกัดของทีมผลิต */
function dpiOf(item: OrderItem, no: number): number | null {
  const specs = (item.sel?.["ตำแหน่งลาย (ทีมผลิต)"] ?? "").split(" | ");
  const line = specs.length > 1 ? specs[no - 1] : specs[0];
  const m = line?.match(/(\d+)\s*DPI/);
  return m ? Number(m[1]) : null;
}

function buildRows(orders: Order[]): Row[] {
  const rows: Row[] = [];
  for (const order of orders) {
    if (order.status === "ยกเลิก") continue;
    for (const item of order.items) {
      const self = isSelfDesigned(item);
      proofsOf(item).forEach((proof, i) => {
        const state: State =
          proof.review === "อนุมัติ" || item.proofStatus === "อนุมัติ"
            ? "อนุมัติแล้ว"
            : proof.review === "ขอแก้ไข" || item.proofStatus === "ขอแก้ไข"
              ? "ขอแก้ไข"
              : "ยังไม่ยืนยัน";
        const note = proof.reviewNote || (state === "ขอแก้ไข" ? (item.proofNote ?? "") : "");
        rows.push({
          order,
          item,
          proof,
          no: i + 1,
          self,
          state,
          note,
          noteWhole: !proof.reviewNote && !!note,
          dpi: self ? dpiOf(item, i + 1) : null,
        });
      });
    }
  }
  // ที่ค้างอยู่ที่เราขึ้นก่อน · ในกลุ่มเดียวกันเอาใบใหม่สุดขึ้นก่อน
  return rows.reverse().sort((a, b) => ORDER_OF[a.state] - ORDER_OF[b.state]);
}

type Filter = State | "all" | "self" | "lowdpi";

export default function DesignReportPage() {
  const router = useRouter();
  const { orders, demo } = useGraphicsOrders();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => buildRows(orders), [orders]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      ขอแก้ไข: 0,
      ยังไม่ยืนยัน: 0,
      อนุมัติแล้ว: 0,
      self: 0,
      lowdpi: 0,
    };
    for (const r of rows) {
      c[r.state]++;
      if (r.self) c.self++;
      if (r.dpi !== null && r.dpi < DPI_WARN) c.lowdpi++;
    }
    return c;
  }, [rows]);

  const shown = rows
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "self"
          ? r.self
          : filter === "lowdpi"
            ? r.dpi !== null && r.dpi < DPI_WARN
            : r.state === filter,
    )
    .filter((r) => orderMatches(r.order, q));

  /** จับกลุ่มตามออเดอร์ — ลายของใบเดียวกันอยู่ติดกัน ไม่ต้องอ่านเลขออเดอร์ซ้ำทุกบรรทัด */
  const groups = useMemo(() => {
    const m = new Map<string, { order: Order; rows: Row[] }>();
    for (const r of shown) {
      const g = m.get(r.order.id) ?? { order: r.order, rows: [] };
      g.rows.push(r);
      m.set(r.order.id, g);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── หัวหน้า ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>📋 รายงานแบบงาน</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            สรุปว่าแบบของออเดอร์ไหนค้างอยู่ตรงไหน — ลูกค้าขอแก้ · ส่งไปแล้วยังไม่ยืนยัน · อนุมัติแล้ว ·{" "}
            {demo ? (
              <span className="text-slate-400">ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน</span>
            ) : (
              <span className="font-semibold text-green-600">● ออเดอร์จริง</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/graphics"
            className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            🎨 ออเดอร์กราฟฟิก
          </Link>
          <label className="flex min-w-[240px] items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
            <span className="text-sm text-amber-500">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / ชื่อสินค้า"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* ── การ์ดสรุป ── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="ลายทั้งหมด" value={counts.all} />
        <Tile label="🔁 ลูกค้าขอแก้" value={counts["ขอแก้ไข"]} tone={counts["ขอแก้ไข"] ? "alert" : undefined} />
        <Tile label="⏳ ยังไม่ยืนยัน" value={counts["ยังไม่ยืนยัน"]} tone="warn" />
        <Tile label="✅ อนุมัติแล้ว" value={counts["อนุมัติแล้ว"]} />
      </div>

      {/* ── ชิปกรอง ── */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip on={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
        <Chip on={filter === "ขอแก้ไข"} onClick={() => setFilter("ขอแก้ไข")} label="🔁 ขอแก้ไข" count={counts["ขอแก้ไข"]} />
        <Chip on={filter === "ยังไม่ยืนยัน"} onClick={() => setFilter("ยังไม่ยืนยัน")} label="⏳ ยังไม่ยืนยัน" count={counts["ยังไม่ยืนยัน"]} />
        <Chip on={filter === "อนุมัติแล้ว"} onClick={() => setFilter("อนุมัติแล้ว")} label="✅ อนุมัติแล้ว" count={counts["อนุมัติแล้ว"]} />
        <span className="my-1 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <Chip on={filter === "self"} onClick={() => setFilter("self")} label="🖼 ลูกค้าจัดวางเอง" count={counts.self} />
        <Chip on={filter === "lowdpi"} onClick={() => setFilter("lowdpi")} label="⚠️ ความละเอียดต่ำ" count={counts.lowdpi} />
      </div>

      {/* ── ตารางรายงาน (จัดกลุ่มตามออเดอร์) ── */}
      {groups.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <span className="text-4xl">📋</span>
          <p className="mt-3 font-semibold text-slate-600">
            {q.trim() ? `ไม่พบแบบที่ตรงกับ "${q}"` : "ไม่มีข้อมูลในกลุ่มนี้"}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="bg-amber-500 text-white">
                  <Th className="w-[300px]">ลาย</Th>
                  <Th className="w-[150px]">ที่มาของแบบ</Th>
                  <Th className="w-[140px]">การยืนยัน</Th>
                  <Th>คอมเมนต์ลูกค้า</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              {groups.map((g) => {
                const redo = g.rows.filter((r) => r.state === "ขอแก้ไข").length;
                const wait = g.rows.filter((r) => r.state === "ยังไม่ยืนยัน").length;
                return (
                  <tbody key={g.order.id} className="border-b-8 border-slate-100 last:border-b-0">
                    {/* หัวกลุ่ม = 1 ออเดอร์ */}
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/admin/orders/${encodeURIComponent(g.order.id)}`}
                            className="font-bold tabular-nums text-slate-900 hover:underline"
                          >
                            {g.order.id}
                          </Link>
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_STYLES[g.order.status]}`}>
                            {g.order.status}
                          </span>
                          <span className="truncate text-xs text-slate-500" title={g.order.customer}>
                            · {g.order.customer} · {dayOf(g.order.date)}
                          </span>
                          <span className="ml-auto flex flex-wrap items-center gap-1.5">
                            {redo > 0 && (
                              <span className="whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                🔁 ขอแก้ {redo}
                              </span>
                            )}
                            {wait > 0 && (
                              <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                                ⏳ ยังไม่ยืนยัน {wait}
                              </span>
                            )}
                            <span className="whitespace-nowrap text-[11px] text-slate-400">{g.rows.length} ลาย</span>
                          </span>
                        </div>
                      </td>
                    </tr>

                    {g.rows.map((r, i) => {
                      const low = r.dpi !== null && r.dpi < DPI_WARN;
                      return (
                        <tr
                          key={`${r.proof.url}-${i}`}
                          onClick={() => router.push(`/admin/orders/${encodeURIComponent(r.order.id)}`)}
                          className="cursor-pointer border-b border-slate-100 align-middle transition last:border-b-0 hover:bg-amber-100/60"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {/* รูปเล็กพอให้จำได้ว่าลายไหน — กดเพื่อเปิดเต็ม */}
                              <a
                                href={r.proof.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="เปิดรูปเต็ม"
                                className="shrink-0"
                              >
                                <img
                                  src={r.proof.url}
                                  alt={`ลายที่ ${r.no}`}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-11 w-11 rounded-lg border border-slate-200 bg-white object-contain transition hover:border-slate-400"
                                />
                              </a>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-800" title={r.item.name}>
                                  {r.item.name}
                                </p>
                                <p className="text-xs text-slate-400">
                                  ลายที่ {r.no}
                                  {r.proof.qty ? ` · ${r.proof.qty} ชิ้น` : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {r.self ? (
                              <>
                                <span className="inline-flex whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200/70">
                                  🖼 ลูกค้าจัดวางเอง
                                </span>
                                {r.dpi !== null && (
                                  <span
                                    className={`mt-1 block text-[11px] font-bold ${low ? "text-rose-600" : "text-slate-400"}`}
                                    title={low ? `ต่ำกว่า ${DPI_WARN} DPI — พิมพ์แล้วอาจไม่คม` : "ความละเอียดพอสำหรับงานพิมพ์"}
                                  >
                                    {low ? "⚠️ " : ""}
                                    {r.dpi} DPI
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                                🎨 กราฟฟิกทำ
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATE_STYLE[r.state]}`}>
                              {STATE_EMOJI[r.state]} {r.state}
                            </span>
                            {r.proof.revisedAt && (
                              <span className="mt-1 block text-[10px] font-bold text-emerald-600">แก้ให้แล้ว</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.note ? (
                              <p className="text-xs leading-relaxed text-rose-700">
                                {r.noteWhole && <span className="font-semibold">(ของทั้งรายการ) </span>}
                                {r.note}
                              </p>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="pr-4 text-slate-300">›</td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${className}`}>{children}</th>;
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warn" | "alert" }) {
  const box =
    tone === "warn" ? "border-ducky bg-ducky/15" : tone === "alert" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white";
  const val = tone === "warn" ? "text-yellow-700" : tone === "alert" ? "text-rose-600" : "text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 ${box}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight tabular-nums ${val}`}>{value}</div>
    </div>
  );
}

function Chip({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        on ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label} <span className={on ? "opacity-70" : "text-slate-400"}>{count}</span>
    </button>
  );
}

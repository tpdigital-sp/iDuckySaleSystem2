"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import { isSelfDesigned, proofsOf, STATUS_STYLES, type Order, type OrderItem, type Proof } from "@/lib/admin-data";
import { badge, card, faint, h1, muted } from "@/lib/admin-ui";
import { dayOf, orderMatches, useGraphicsOrders } from "../data";

/**
 * 🖼 ลายจากลูกค้า — ภาพที่ลูกค้าจัดวางลายบนเทมเพลตเองผ่านหน้าเว็บ
 *
 * งานกลุ่มนี้กราฟฟิกไม่ต้องทำแบบ (ระบบอนุมัติให้อัตโนมัติแล้ว) แต่ยังต้องเหลือบดูว่า
 * ลายที่ลูกค้าวางมาใช้พิมพ์ได้จริงไหม — เลยรวมรูปไว้ที่เดียว ดูรวดเดียวจบ ไม่ต้องเปิดทีละใบ
 */

/** 1 ภาพในคลัง */
interface Shot {
  order: Order;
  item: OrderItem;
  proof: Proof;
  /** ลายที่เท่าไหร่ของรายการนั้น (เริ่มที่ 1) */
  no: number;
}

/** ความละเอียดที่พิมพ์แล้วคม — ต่ำกว่านี้ควรทักลูกค้าก่อนพิมพ์ */
const DPI_WARN = 150;

/** อ่านค่า DPI ที่จอวางลายคำนวณไว้ให้ จากบรรทัดพิกัดของทีมผลิต */
function dpiOf(item: OrderItem, no: number): number | null {
  const specs = (item.sel?.["ตำแหน่งลาย (ทีมผลิต)"] ?? "").split(" | ");
  const line = specs.length > 1 ? specs[no - 1] : specs[0];
  const m = line?.match(/(\d+)\s*DPI/);
  return m ? Number(m[1]) : null;
}

export default function CustomerDesignsPage() {
  const { orders, demo } = useGraphicsOrders();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  /** ใบใหม่สุดขึ้นก่อน */
  const shots = useMemo(() => {
    const rows: Shot[] = [];
    for (const o of orders) {
      if (o.status === "ยกเลิก") continue;
      for (const item of o.items) {
        if (!isSelfDesigned(item)) continue;
        proofsOf(item).forEach((proof, i) => rows.push({ order: o, item, proof, no: i + 1 }));
      }
    }
    return rows.reverse();
  }, [orders]);

  const lowCount = shots.filter((s) => {
    const d = dpiOf(s.item, s.no);
    return d !== null && d < DPI_WARN;
  }).length;

  const list = shots.filter((s) => {
    if (!orderMatches(s.order, q)) return false;
    if (!lowOnly) return true;
    const d = dpiOf(s.item, s.no);
    return d !== null && d < DPI_WARN;
  });

  /** จัดกลุ่มตามออเดอร์ — ลายของใบเดียวกันอยู่ด้วยกัน หยิบไปตรวจทีเดียวจบ */
  const groups = useMemo(() => {
    const m = new Map<string, Shot[]>();
    for (const s of list) {
      if (!m.has(s.order.id)) m.set(s.order.id, []);
      m.get(s.order.id)!.push(s);
    }
    return [...m.values()];
  }, [list]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className={h1}>🖼 ลายจากลูกค้า</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          ภาพที่ลูกค้าจัดวางลายบนเทมเพลตมาเอง — งานกลุ่มนี้กราฟฟิกไม่ต้องทำแบบ ระบบอนุมัติให้อัตโนมัติแล้ว
          แค่ดูว่าลายพิมพ์ได้จริงไหม
        </p>
      </div>

      {demo && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          โหมดตัวอย่าง — ยังไม่ได้ตั้งค่าฐานข้อมูล ข้อมูลที่เห็นเป็นออเดอร์สมมติ
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={`${badge} bg-slate-100 text-slate-600`}>ทั้งหมด {shots.length} ลาย</span>
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          title={`ความละเอียดต่ำกว่า ${DPI_WARN} DPI — พิมพ์แล้วอาจไม่คม ควรทักลูกค้าก่อน`}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            lowOnly ? "bg-rose-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          ⚠️ ความละเอียดต่ำ
          <span
            className={`rounded-full px-1.5 text-xs font-bold ${lowOnly ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}
          >
            {lowCount}
          </span>
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา เลขออเดอร์ / ชื่อลูกค้า / ชื่อสินค้า"
          className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300 sm:w-72"
        />
      </div>

      {!groups.length ? (
        <div className={`${card} grid place-items-center gap-1 px-4 py-16 text-center`}>
          <span className="text-3xl">🖼</span>
          <p className="text-sm font-semibold text-slate-700">
            {shots.length ? "ไม่พบลายที่ตรงกับที่ค้นหา" : "ยังไม่มีลูกค้าจัดวางลายเองเข้ามา"}
          </p>
          <p className={`text-xs ${faint}`}>
            {shots.length ? "ลองเปลี่ยนคำค้นหา" : "ภาพจะขึ้นที่นี่เมื่อลูกค้าสั่งสินค้าที่มีเทมเพลตแล้ววางลายเองในเว็บ"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const o = g[0].order;
            return (
              <section key={o.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/orders/${encodeURIComponent(o.id)}`}
                    className="font-mono text-sm font-bold text-slate-900 hover:underline"
                  >
                    {o.id}
                  </Link>
                  <span className={`${badge} ring-1 ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                  <span className={`text-xs ${muted}`}>· {o.customer}</span>
                  <span className={`text-xs ${faint}`}>· {g.length} ลาย</span>
                  <span className={`ml-auto text-xs ${faint}`}>{dayOf(o.date)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.map((s, i) => (
                    <ShotCard key={`${s.proof.url}-${i}`} shot={s} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShotCard({ shot }: { shot: Shot }) {
  const dpi = dpiOf(shot.item, shot.no);
  const low = dpi !== null && dpi < DPI_WARN;
  return (
    <figure className={`${card} overflow-hidden`}>
      <a href={shot.proof.url} target="_blank" rel="noreferrer" className="block bg-slate-50" title="เปิดรูปเต็ม">
        <img
          src={shot.proof.url}
          alt={`ลายที่ ${shot.no} ของ ${shot.order.id}`}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-contain"
        />
      </a>
      <figcaption className="space-y-1 p-2.5">
        <p className="truncate text-xs font-semibold text-slate-800" title={shot.item.name}>
          {shot.item.name}
        </p>
        <p className={`text-[11px] ${faint}`}>
          ลายที่ {shot.no}
          {shot.proof.qty ? ` · ${shot.proof.qty} ชิ้น` : ""}
        </p>
        <div className="flex items-center gap-1.5">
          {dpi !== null && (
            <span
              className={`${badge} ${
                low ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
              }`}
              title={low ? `ต่ำกว่า ${DPI_WARN} DPI — พิมพ์แล้วอาจไม่คม` : "ความละเอียดพอสำหรับงานพิมพ์"}
            >
              {low ? "⚠️ " : ""}
              {dpi} DPI
            </span>
          )}
          <a href={shot.proof.url} download className="ml-auto text-[11px] font-semibold text-sky-700 hover:underline">
            ⬇️ โหลด
          </a>
        </div>
      </figcaption>
    </figure>
  );
}

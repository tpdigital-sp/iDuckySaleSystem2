"use client";

/**
 * 📦 แถบ "ส่งรวมกล่อง" บนหน้าออเดอร์ + หน้าต่างเลือกใบที่จะส่งรวม (Order.shipWith · กติกาอยู่ที่ lib/ship-with.ts)
 *
 * - ใบตาม = แถบคอรัลขอบซ้ายหนา "ห้ามส่งแยก" (ของค้างที่พลาดแล้วเสียหาย ต้องเด่นสุด) + ลิงก์ไปใบหลัก
 * - ใบหลัก = แถบเหลือง บอกว่าต้องเอาของใบไหนลงกล่องด้วย + ของใบนั้นพร้อมหรือยัง
 * - ยิงเลขไปแล้ว = บรรทัดเขียวเล็ก ๆ (งานจบแล้วต้องเงียบกว่างานค้าง)
 * สิทธิ์: ผูก/ยกเลิก = orders.edit · ฝ่ายแพ็คเห็นแถบอย่างเดียว
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@/lib/admin-data";
import { isShipMain, isShipRider, shipMainIdOf, shipRiderIdsOf, type ShipWithRow } from "@/lib/ship-with";

type Saved = { main: Order | null; rider: Order | null };

async function call(method: "POST" | "DELETE", body: { mainId: string; riderId: string }): Promise<Saved & { error?: string }> {
  try {
    const res = await fetch("/api/admin/orders/ship-with", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as Saved & { error?: string };
    // ใบมารับเองที่ผูกส่งรวม = หลุดจากเมนู "ลูกค้าที่มารับเอง" (ยกเลิก = กลับเข้า) → ป้ายตัวเลขข้างเมนูนับใหม่
    if (res.ok) window.dispatchEvent(new Event("iducky:pickup-changed"));
    return res.ok ? j : { main: null, rider: null, error: j.error ?? "ทำรายการไม่สำเร็จ" };
  } catch {
    return { main: null, rider: null, error: "ต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง" };
  }
}

/** ใบที่ผูกอยู่กับใบนี้ (ใบหลักได้สถานะ "ของพร้อมลงกล่องหรือยัง" ของใบตามมาด้วย) — หน้าออเดอร์ใช้ตัดสินด่านยิงเลข */
export function useShipWithLinked(order: Pick<Order, "id" | "shipWith" | "savedAt"> | null): ShipWithRow[] {
  const [rows, setRows] = useState<ShipWithRow[]>([]);
  const id = order?.id ?? "";
  const key = order?.shipWith ? `${order.shipWith.role}:${order.shipWith.orders.join(",")}` : "";
  useEffect(() => {
    if (!id || !key) {
      setRows([]);
      return;
    }
    let dead = false;
    const load = () =>
      fetch(`/api/admin/orders/ship-with?id=${encodeURIComponent(id)}&linked=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { linked?: ShipWithRow[] } | null) => !dead && j?.linked && setRows(j.linked))
        .catch(() => {});
    void load();
    // ของใบตามถูกตรวจนับจากอีกจอ — ถามใหม่เป็นระยะให้ป้าย "ยังไม่พร้อม" ตามทัน
    const t = setInterval(load, 30000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [id, key]);
  return rows;
}

export default function ShipWithStrip({
  order,
  linked,
  canManage,
  packMode,
  onSaved,
}: {
  order: Order;
  linked: ShipWithRow[];
  canManage: boolean;
  /** โหมดแพ็ค: ลิงก์ไปใบอื่นเปิดโหมดแพ็คของใบนั้นเลย */
  packMode?: boolean;
  /** เซิร์ฟเวอร์เขียนใบนี้แล้ว — หน้าออเดอร์รับก้อนใหม่ไปถือ */
  onSaved: (o: Order) => void;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!order.shipWith?.orders.length || order.status === "ยกเลิก") return null;

  const href = (id: string) => `/admin/orders/${encodeURIComponent(id)}${packMode ? "?pack=1" : ""}`;
  const shipped = !!(order.tracking ?? "").trim();
  const rider = isShipRider(order);
  const ids = rider ? [shipMainIdOf(order)] : shipRiderIdsOf(order);

  async function unlink(riderId: string, mainId: string) {
    if (!window.confirm(`ยกเลิกส่งรวมกล่อง ${riderId} ↔ ${mainId}?\nใบ ${riderId} จะกลับไปใช้วิธีส่งเดิม และระบบแจ้งลูกค้าทางไลน์`)) return;
    setBusy(riderId);
    setErr("");
    const r = await call("DELETE", { mainId, riderId });
    setBusy("");
    if (r.error) return setErr(r.error);
    const mine = rider ? r.rider : r.main;
    if (mine) onSaved(mine);
  }

  if (shipped) {
    return (
      <div className="mb-4 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}>
        ✓ ส่งรวมกล่องเดียวกับ{" "}
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            <Link href={href(id)} className="underline underline-offset-2">
              {id}
            </Link>
          </span>
        ))}{" "}
        แล้ว · เลขพัสดุเดียวกัน
      </div>
    );
  }

  if (rider) {
    const mainId = ids[0];
    const main = linked.find((l) => l.id === mainId);
    return (
      <div className="dkb-g mb-4 p-4" role="alert" style={{ background: "var(--dk-coral-wash)", borderLeft: "6px solid var(--dk-coral-ink)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[1.05rem] font-extrabold leading-snug" style={{ color: "var(--dk-coral-ink)" }}>
              📦 ห้ามส่งแยก — ใส่กล่องไปกับ {mainId}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-relaxed" style={{ color: "var(--dk-navy)" }}>
              ตรวจนับของใบนี้ตามปกติ แล้วพักไว้รอลงกล่อง {mainId}
              {main ? ` (${main.label})` : ""} · ยิงเลขพัสดุที่ {mainId} ใบเดียว เลขลงใบนี้ให้เอง
            </p>
          </div>
          <Link href={href(mainId)} className="dkb-btn dkb-btn-navy min-h-[44px] shrink-0">
            เปิดใบหลัก {mainId.replace(/^OD-\d{6}-/, "")} →
          </Link>
        </div>
        {canManage && (
          <button type="button" disabled={!!busy} onClick={() => unlink(order.id, mainId)} className="mt-2 text-[12px] font-semibold underline underline-offset-2" style={{ color: "var(--dk-coral-ink)" }}>
            {busy ? "กำลังยกเลิก…" : "ลูกค้าเปลี่ยนใจ — ยกเลิกส่งรวม"}
          </button>
        )}
        {err && <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>⚠️ {err}</p>}
      </div>
    );
  }

  // ใบหลัก
  return (
    <div className="dkb-g mb-4 p-4" role="alert" style={{ background: "var(--dk-yolk-wash)", borderLeft: "6px solid var(--dk-yolk-ink)" }}>
      <p className="text-[1.05rem] font-extrabold leading-snug" style={{ color: "var(--dk-yolk-ink)" }}>
        📦 กล่องนี้ต้องใส่ของอีก {ids.length} ออเดอร์ไปด้วย
      </p>
      <p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
        ยิงเลขพัสดุใบนี้ใบเดียว — เลขลงให้ทุกใบ · ใบปะหน้าปริ้นจากใบนี้
      </p>
      <ul className="mt-2.5 grid gap-1.5">
        {ids.map((id) => {
          const row = linked.find((l) => l.id === id);
          const wait = row?.notReady ?? [];
          return (
            <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/80 px-3 py-2">
              <Link href={href(id)} className="min-h-[28px] text-[14px] font-extrabold tabular-nums underline underline-offset-2" style={{ color: "var(--dk-navy)" }}>
                {id}
              </Link>
              {row ? (
                wait.length ? (
                  <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
                    ✗ ยังไม่พร้อมลงกล่อง — {wait.join(" · ")}
                  </span>
                ) : (
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--dk-mint-ink)" }}>
                    ✓ ของพร้อมลงกล่อง
                  </span>
                )
              ) : (
                <span className="text-[12px] text-slate-400">กำลังเช็ค…</span>
              )}
              {row && <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{row.items.join(" · ")}</span>}
              {canManage && (
                <button type="button" disabled={!!busy} onClick={() => unlink(id, order.id)} className="text-[12px] font-semibold text-slate-500 underline underline-offset-2">
                  {busy === id ? "กำลังยกเลิก…" : "ยกเลิก"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>⚠️ {err}</p>}
    </div>
  );
}

/**
 * 📦 ใบอื่นของลูกค้าคนนี้ที่ส่งรวมกล่องได้ — โชว์คาไว้ที่ช่องเลขพัสดุเลย (พนักงานขอ 23 ก.ย. 69)
 * เดิมเป็นปุ่มเปล่า ๆ ต้องกดเปิดหน้าต่างก่อนถึงจะรู้ว่ามีใบให้รวมไหม — ส่วนใหญ่กดแล้วว่าง
 * ไม่มีใบให้รวม = เหลือบรรทัดจาง ๆ (งานที่ไม่มีอะไรต้องทำ ห้ามเด่นกว่างานค้าง) แต่ยังค้นเลขออเดอร์เองได้
 */
export function ShipWithSuggest({
  order,
  onOpenPicker,
  onSaved,
}: {
  order: Order;
  /** เปิดหน้าต่างรายการเต็ม (ค้นเลขออเดอร์เองได้) */
  onOpenPicker: () => void;
  onSaved: (o: Order) => void;
}) {
  const [rows, setRows] = useState<ShipWithRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);
  const id = order.id;
  // ถามรายการใหม่เมื่อ "ชุดส่งรวมของใบนี้" เปลี่ยนเท่านั้น — ไม่ใช่ทุกครั้งที่เซฟใบ (หน้านี้เซฟบ่อย)
  const linkKey = (order.shipWith?.orders ?? []).join(",");

  useEffect(() => {
    let dead = false;
    fetch(`/api/admin/orders/ship-with?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { candidates?: ShipWithRow[] } | null) => !dead && setRows(j?.candidates ?? []))
      .catch(() => !dead && setRows([]));
    return () => {
      dead = true;
    };
  }, [id, linkKey]);

  async function pick(other: ShipWithRow) {
    if (!window.confirm(`ส่งรวมกล่องเดียวกับ ${other.id}?\nบิลยังแยกกัน ค่าส่งไม่เปลี่ยน · ระบบแจ้งลูกค้าทางไลน์ให้`)) return;
    setBusy(other.id);
    setErr("");
    const r = await call("POST", { mainId: order.id, riderId: other.id });
    setBusy("");
    if (r.error) return setErr(r.error);
    const mine = r.main?.id === order.id ? r.main : r.rider?.id === order.id ? r.rider : null;
    if (mine) onSaved(mine);
  }

  const ready = (rows ?? []).filter((r) => !r.blocked);
  const quiet = (
    <button
      type="button"
      onClick={onOpenPicker}
      className="mb-2 min-h-[44px] text-left text-[12.5px] font-bold underline underline-offset-2"
      style={{ color: "var(--dk-navy-soft)" }}
    >
      📦 ส่งรวมกล่องกับออเดอร์อื่น — ค้นเลขออเดอร์เอง →
    </button>
  );

  if (rows === null) return <p className="mb-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>📦 กำลังเช็คว่าลูกค้าคนนี้มีออเดอร์อื่นให้ส่งรวมกล่องไหม…</p>;
  if (!ready.length) return quiet;

  const show = all ? ready : ready.slice(0, 3);
  return (
    <div className="dkb-g mb-2 p-3" style={{ background: "var(--dk-yolk-wash)", borderLeft: "6px solid var(--dk-yolk-ink)" }}>
      <p className="text-[13.5px] font-extrabold leading-snug" style={{ color: "var(--dk-yolk-ink)" }}>
        📦 ลูกค้าคนนี้มีอีก {ready.length} ออเดอร์ที่ยังไม่ได้ส่ง — ใส่กล่องเดียวกันได้
      </p>
      <p className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
        บิลแยกกันเหมือนเดิม ค่าส่งไม่เปลี่ยน · ผูกแล้วยิงเลขพัสดุที่ใบนี้ใบเดียว
      </p>
      <ul className="mt-2 grid gap-1.5">
        {show.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl bg-white/85 px-3 py-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/orders/${encodeURIComponent(r.id)}`}
                className="text-[13.5px] font-extrabold tabular-nums underline underline-offset-2"
                style={{ color: "var(--dk-navy)" }}
              >
                {r.id}
              </Link>
              <span className="ml-2 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
                {r.label} · {r.shipLabel || "ยังไม่ระบุวิธีส่ง"}
              </span>
              <p className="truncate text-[12px]" style={{ color: "var(--dk-faint)" }}>
                {r.items.join(" · ")}
              </p>
            </div>
            <button type="button" disabled={!!busy} onClick={() => pick(r)} className="dkb-btn dkb-btn-yolk min-h-[44px] shrink-0">
              {busy === r.id ? "กำลังผูก…" : "ส่งรวมกับใบนี้"}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {ready.length > show.length && (
          <button type="button" onClick={() => setAll(true)} className="min-h-[32px] text-[12.5px] font-bold underline underline-offset-2" style={{ color: "var(--dk-navy)" }}>
            ดูอีก {ready.length - show.length} ใบ
          </button>
        )}
        <button type="button" onClick={onOpenPicker} className="min-h-[32px] text-[12.5px] font-bold underline underline-offset-2" style={{ color: "var(--dk-navy-soft)" }}>
          ไม่เจอใบที่ต้องการ? ค้นเลขออเดอร์เอง →
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>⚠️ {err}</p>}
    </div>
  );
}

/** หน้าต่างเลือกใบที่จะส่งรวมกล่องกับใบนี้ — โชว์ใบอื่นของลูกค้าคนเดียวกันก่อน · ค้นเลขออเดอร์เพิ่มได้ */
export function ShipWithPicker({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: (o: Order) => void }) {
  const [rows, setRows] = useState<ShipWithRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);

  const load = useCallback(
    (query: string) => {
      setErr("");
      setSearching(true);
      fetch(`/api/admin/orders/ship-with?id=${encodeURIComponent(order.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`)
        .then((r) => r.json())
        .then((j: { candidates?: ShipWithRow[]; error?: string }) => (j.error ? setErr(j.error) : setRows(j.candidates ?? [])))
        .catch(() => setErr("โหลดรายการไม่สำเร็จ — ลองใหม่อีกครั้ง"))
        .finally(() => setSearching(false));
    },
    [order.id]
  );

  // ค้นให้เองระหว่างพิมพ์/วาง — ไม่ต้องกดปุ่ม (พนักงานวางเลขแล้วรอผลเลย · ว่าง = กลับไปรายการใบของลูกค้าคนนี้)
  useEffect(() => {
    const s = q.trim();
    if (s && s.length < 3) return; // สั้นเกินไป ยิงไปก็ได้ทั้งร้าน
    const t = setTimeout(() => load(s), s ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  async function pick(other: ShipWithRow) {
    setBusy(other.id);
    setErr("");
    // เซิร์ฟเวอร์ตัดสินเองว่าใบไหนเป็นใบหลัก (ใบมารับเองเป็นใบหลักไม่ได้ — สลับให้)
    const r = await call("POST", { mainId: order.id, riderId: other.id });
    setBusy("");
    if (r.error) return setErr(r.error);
    const mine = r.main?.id === order.id ? r.main : r.rider?.id === order.id ? r.rider : null;
    if (mine) onSaved(mine);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="px-5 pb-3 pt-5">
          <p className="text-lg font-extrabold text-slate-900">📦 ส่งรวมกล่องกับออเดอร์ไหน</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            บิลยังแยกกัน ยอดเงินและค่าส่งของทั้งสองใบ<strong className="text-slate-700">ไม่เปลี่ยน</strong> · ใบที่มีพัสดุเป็นใบหลัก (ยิงเลข+ใบปะหน้า) อีกใบขึ้นป้าย “ห้ามส่งแยก” · ระบบแจ้งลูกค้าทางไลน์ให้
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load(q.trim());
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ไม่เจอในรายการ? พิมพ์เลขออเดอร์ เช่น 6141"
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 focus:border-amber-300 focus:outline-none"
            />
            <button type="submit" className="dkb-btn dkb-btn-ghost min-h-[44px] shrink-0" disabled={searching}>
              {searching ? "กำลังค้น…" : "ค้น"}
            </button>
          </form>
        </div>

        <div className="px-5 pb-2">
          {rows === null && !err && <p className="py-6 text-center text-[13px] text-slate-400">กำลังหาออเดอร์อื่นของลูกค้าคนนี้…</p>}
          {rows?.length === 0 &&
            (/^CL-/i.test(q.trim()) ? (
              // เลขเคลมกับเลขออเดอร์หน้าตาใกล้กัน — บอกให้รู้ตัวแทนปล่อยให้ค้นวนอยู่อย่างนั้น
              <p className="rounded-xl bg-amber-50 px-3 py-4 text-center text-[13px] text-amber-800">
                “{q.trim()}” เป็น<strong>เลขเคลม</strong> ไม่ใช่เลขออเดอร์ — ช่องนี้ค้นเลขออเดอร์ (ขึ้นต้น OD-) พิมพ์แค่ 4 ตัวท้ายก็พอ
              </p>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[13px] text-slate-500">
                {q.trim() ? (
                  <>ไม่เจอออเดอร์ที่ตรงกับ “{q.trim()}” — พิมพ์เลขออเดอร์ 4 ตัวท้ายก็พอ · ใบที่ส่งออกไปแล้วไม่อยู่ในรายการนี้</>
                ) : (
                  <>ไม่เจอใบที่รวมกล่องได้ — ใบที่ส่งออกไปแล้วไม่อยู่ในรายการนี้ · ถ้าชื่อ/เบอร์ในอีกใบไม่ตรงกัน พิมพ์เลขออเดอร์ในช่องค้นด้านบน</>
                )}
              </p>
            ))}
          <ul className="grid gap-2">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="rounded-xl px-3 py-2.5 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold tabular-nums text-slate-900">{r.id}</p>
                    <p className="text-[12.5px] font-semibold text-slate-600">
                      {r.customer} · {r.label} · {r.shipLabel || "ยังไม่ระบุวิธีส่ง"}
                      {r.shippingCost > 0 ? ` ฿${r.shippingCost.toLocaleString("th-TH")}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-slate-400">{r.items.join(" · ")}</p>
                    {/* ใบที่ผูกไม่ได้ยังโชว์อยู่ — บอกเหตุผลตรงนั้นดีกว่าให้กดแล้วเด้ง error */}
                    {r.blocked && (
                      <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
                        ✗ ส่งรวมไม่ได้ — {r.blocked}
                      </p>
                    )}
                  </div>
                  {r.blocked ? (
                    <span className="shrink-0 text-[12px] font-bold text-slate-400">—</span>
                  ) : (
                    <button type="button" disabled={!!busy} onClick={() => pick(r)} className="dkb-btn dkb-btn-yolk min-h-[44px] shrink-0">
                      {busy === r.id ? "กำลังผูก…" : "ส่งรวมกับใบนี้"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700 ring-1 ring-rose-100">⚠️ {err}</p>}
        </div>

        <div className="sticky bottom-0 bg-white p-4">
          <button type="button" onClick={onClose} className="w-full rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

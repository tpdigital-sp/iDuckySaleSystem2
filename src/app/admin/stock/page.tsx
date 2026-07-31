"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCan } from "@/lib/perm-context";

/**
 * 📦 คลังสต๊อกวัสดุ — ยอดคงเหลือมาจาก ledger (stockMoves) เท่านั้น แก้ตัวเลขลอย ๆ ไม่ได้
 * นำเข้า / เบิกเสีย / นับจริง(บังคับเหตุผลเมื่อไม่ตรง) + สถิติความเร็วขาย→วันหมด→จุดสั่งซื้อ
 * ฝั่งผลิตเบิกจากหน้า TP-Leader (เบิกวัสดุผลิต) — ตัดคลังเดียวกัน เห็นในประวัติที่นี่ด้วย
 */

interface Item {
  id: string;
  name: string;
  unit: string;
  category?: string;
  balance: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  productIds?: string[];
}
interface Move {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  reason: string;
  note?: string;
  refOrderId?: string;
  by: string;
  source: string;
  at: string;
  balanceAfter: number;
}

const fmtN = (n: number) => n.toLocaleString("th-TH");
const REASON_STYLE: Record<string, string> = {
  นำเข้า: "bg-emerald-50 text-emerald-700",
  ขาย: "bg-sky-50 text-sky-700",
  "คืน-ยกเลิก": "bg-slate-100 text-slate-600",
  เบิกผลิต: "bg-violet-50 text-violet-700",
  เบิกทำเสีย: "bg-rose-50 text-rose-700",
  ปรับยอดนับจริง: "bg-amber-50 text-amber-700",
  อื่นๆ: "bg-stone-100 text-stone-600",
};

export default function StockPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [items, setItems] = useState<Item[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [histFor, setHistFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<Item | null>(null);
  const [moveFor, setMoveFor] = useState<{ item: Item; mode: "in" | "out" | "count" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moveFilter, setMoveFilter] = useState<"ทั้งหมด" | "นำเข้า" | "ขาย" | "เบิกผลิต" | "เบิกทำเสีย" | "ปรับยอดนับจริง">("ทั้งหมด");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/stock");
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setItems(j.items);
    setMoves(j.moves);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000); // realtime พอประมาณสำหรับหน้าจอดู (การเดินสต๊อกจริง atomic ที่เซิร์ฟเวอร์)
    return () => clearInterval(t);
  }, [load]);

  /** สถิติจาก ledger: ความเร็วใช้ (ขาย+เบิกผลิต) 30 วันหลัง → วันหมด + จุดสั่งแนะนำ */
  const stats = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const usage = new Map<string, number>();
    for (const m of moves) {
      if (m.qty >= 0) continue;
      if (m.reason !== "ขาย" && m.reason !== "เบิกผลิต") continue;
      if (new Date(m.at).getTime() < cutoff) continue;
      usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + Math.abs(m.qty));
    }
    const out = new Map<string, { perDay: number; daysLeft: number | null; suggest: number | null; needOrder: boolean }>();
    for (const it of items) {
      const perDay = (usage.get(it.id) ?? 0) / 30;
      const daysLeft = perDay > 0 ? Math.floor(Math.max(0, it.balance) / perDay) : null;
      const suggest = perDay > 0 && it.leadTimeDays ? Math.ceil(perDay * it.leadTimeDays * 1.2) : null; // +20% กันชน
      const point = it.reorderPoint ?? suggest;
      out.set(it.id, { perDay, daysLeft, suggest, needOrder: point != null && it.balance <= point });
    }
    return out;
  }, [items, moves]);

  const shown = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()) || (i.category ?? "").includes(q.trim()));
  const needOrder = items.filter((i) => stats.get(i.id)?.needOrder);

  async function doMove(itemId: string, qty: number, reason: string, note?: string, refOrderId?: string) {
    setErr("");
    const res = await fetch("/api/admin/stock/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, qty, reason, note, refOrderId }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    await load();
    return true;
  }

  async function saveItem(body: Partial<Item> & { name: string }) {
    setErr("");
    const res = await fetch("/api/admin/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return false;
    }
    await load();
    return true;
  }

  const totalKinds = items.length;
  const todayMoves = moves.filter((m) => new Date(m.at).toDateString() === new Date().toDateString()).length;
  const monthDefect = moves
    .filter((m) => m.reason === "เบิกทำเสีย" && Date.now() - new Date(m.at).getTime() < 30 * 86400_000)
    .reduce((s2, m) => s2 + Math.abs(m.qty), 0);
  const shownMoves = moves.filter((m) => moveFilter === "ทั้งหมด" || m.reason === moveFilter).slice(0, 40);

  return (
    <div className="w-full pb-16">
      {/* ── หัว + ค้นหา ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">📦 คลังสต๊อกวัสดุ</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            ขายหน้าเว็บตัดอัตโนมัติ · ฝั่งผลิตเบิกจากระบบเบิกของ (แท็บ 🏭 เบิกวัสดุผลิต) · ทุกการเปลี่ยนมีบันทึก
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 ค้นหาวัสดุ…"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none"
          />
          {mayEdit && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600"
            >
              ＋ เพิ่มวัสดุ
            </button>
          )}
        </div>
      </div>

      {err && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200">⚠️ {err}</p>}

      {/* ── การ์ดสรุป ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "วัสดุในคลัง", value: fmtN(totalKinds), suffix: "รายการ", tone: "text-slate-900" },
          {
            label: "🛒 ถึงจุดต้องสั่ง",
            value: fmtN(needOrder.length),
            suffix: "รายการ",
            tone: needOrder.length > 0 ? "text-rose-600" : "text-emerald-600",
          },
          { label: "เคลื่อนไหววันนี้", value: fmtN(todayMoves), suffix: "ครั้ง", tone: "text-slate-900" },
          {
            label: "⚠️ เบิกทำเสีย 30 วัน",
            value: fmtN(monthDefect),
            suffix: "ชิ้น",
            tone: monthDefect > 0 ? "text-amber-600" : "text-slate-900",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums ${c.tone}`}>
              {c.value} <span className="text-xs font-semibold text-slate-400">{c.suffix}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── แจ้งของถึงจุดสั่ง ── */}
      {needOrder.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500 text-lg text-white">🛒</span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-rose-700">ถึงจุดต้องสั่งของ {needOrder.length} รายการ — ระบบจะแจ้งเข้า LINE ร้านทุกเช้า 9:00</p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-600">
              {needOrder
                .map((i) => {
                  const st = stats.get(i.id);
                  return `${i.name} เหลือ ${fmtN(i.balance)} ${i.unit}${st?.daysLeft != null ? ` (~${st.daysLeft} วันหมด)` : ""}`;
                })
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* ── การ์ดวัสดุ ── */}
      {loading ? (
        <p className="rounded-2xl border border-slate-200/70 bg-white py-14 text-center text-sm text-slate-400">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
          <span className="text-4xl">📦</span>
          <p className="mt-2 text-sm font-bold text-slate-600">{items.length === 0 ? "ยังไม่มีวัสดุในคลัง" : "ไม่พบวัสดุที่ค้นหา"}</p>
          {items.length === 0 && mayEdit && (
            <button type="button" onClick={() => setAddOpen(true)} className="mt-3 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600">
              ＋ เพิ่มวัสดุตัวแรก
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((it) => {
            const st = stats.get(it.id);
            const point = it.reorderPoint ?? st?.suggest ?? null;
            // แถบระดับสต๊อก: เต็มหลอด = จุดสั่ง×3 (ให้เห็นระยะห่างจากจุดสั่งชัด ๆ)
            const cap = point != null ? Math.max(point * 3, 1) : Math.max(it.balance, 1);
            const pct = Math.max(0, Math.min(100, (it.balance / cap) * 100));
            const level = point == null ? "ok" : it.balance <= point ? "danger" : it.balance <= point * 1.5 ? "warn" : "ok";
            const barTone = level === "danger" ? "bg-rose-500" : level === "warn" ? "bg-amber-400" : "bg-emerald-500";
            return (
              <div
                key={it.id}
                className={`flex flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
                  level === "danger" ? "border-rose-200" : "border-slate-200/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{it.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {it.category ? `${it.category} · ` : ""}
                      {(it.productIds?.length ?? 0) > 0 ? `ผูกสินค้า ${it.productIds!.length} ตัว` : "⚠️ ยังไม่ผูกสินค้า — ขายแล้วไม่ตัด"}
                    </p>
                  </div>
                  {level === "danger" && (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-600">🛒 ต้องสั่ง</span>
                  )}
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <p className={`text-3xl font-black tabular-nums leading-none ${it.balance < 0 ? "text-rose-600" : "text-slate-900"}`}>
                    {fmtN(it.balance)} <span className="text-sm font-bold text-slate-400">{it.unit}</span>
                  </p>
                  {point != null && <p className="text-[11px] font-semibold text-slate-400">จุดสั่ง ≤ {fmtN(point)}{it.reorderPoint == null ? " (แนะนำ)" : ""}</p>}
                </div>
                {/* แถบระดับ + ขีดจุดสั่งซื้อ */}
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${barTone} transition-all`} style={{ width: `${pct}%` }} />
                  {point != null && <span className="absolute top-0 h-full w-0.5 bg-slate-400/70" style={{ left: `${Math.min(99, (point / cap) * 100)}%` }} />}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">ใช้เฉลี่ย/วัน</p>
                    <p className="text-sm font-extrabold tabular-nums text-slate-700">{st && st.perDay > 0 ? st.perDay.toFixed(1) : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">จะหมดใน</p>
                    <p className="text-sm font-extrabold tabular-nums text-slate-700">{st?.daysLeft != null ? `~${fmtN(st.daysLeft)} วัน` : "—"}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3">
                  {mayEdit && (
                    <>
                      <button type="button" onClick={() => setMoveFor({ item: it, mode: "in" })} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700">＋ รับเข้า</button>
                      <button type="button" onClick={() => setMoveFor({ item: it, mode: "out" })} className="flex-1 rounded-lg bg-rose-50 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100">− เบิกออก</button>
                      <button type="button" onClick={() => setMoveFor({ item: it, mode: "count" })} className="flex-1 rounded-lg bg-amber-50 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100">🧮 นับจริง</button>
                      <button type="button" onClick={() => setEditFor(it)} className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50" title="แก้ไข">✏️</button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistFor(histFor === it.id ? null : it.id)}
                    className={`rounded-lg px-2 py-1.5 text-xs ring-1 transition ${histFor === it.id ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"}`}
                    title="ประวัติ"
                  >
                    📜
                  </button>
                </div>

                {histFor === it.id && (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                    {moves.filter((m) => m.itemId === it.id).slice(0, 40).map((m) => (
                      <MoveRow key={m.id} m={m} />
                    ))}
                    {moves.filter((m) => m.itemId === it.id).length === 0 && (
                      <p className="py-2 text-center text-xs text-slate-400">ยังไม่มีการเคลื่อนไหว</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ประวัติรวม + ตัวกรอง ── */}
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">การเคลื่อนไหวล่าสุด</p>
          <div className="flex flex-wrap gap-1">
            {(["ทั้งหมด", "นำเข้า", "ขาย", "เบิกผลิต", "เบิกทำเสีย", "ปรับยอดนับจริง"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setMoveFilter(f)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  moveFilter === f ? "bg-slate-800 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {shownMoves.map((m) => (
            <MoveRow key={m.id} m={m} showItem />
          ))}
          {shownMoves.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ไม่มีการเคลื่อนไหว{moveFilter !== "ทั้งหมด" ? `ประเภท "${moveFilter}"` : ""}</p>}
        </div>
      </div>

      {/* ── โมดัลเพิ่ม/แก้ไขวัสดุ ── */}
      {(addOpen || editFor) && (
        <ItemModal
          item={editFor}
          onClose={() => {
            setAddOpen(false);
            setEditFor(null);
          }}
          onSave={async (b) => {
            const ok = await saveItem(b);
            if (ok) {
              setAddOpen(false);
              setEditFor(null);
            }
          }}
        />
      )}

      {/* ── โมดัลเดินสต๊อก ── */}
      {moveFor && (
        <MoveModal
          target={moveFor}
          onClose={() => setMoveFor(null)}
          onSave={async (qty, reason, note, ref) => {
            const ok = await doMove(moveFor.item.id, qty, reason, note, ref);
            if (ok) setMoveFor(null);
          }}
        />
      )}
    </div>
  );
}

function MoveRow({ m, showItem }: { m: Move; showItem?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 text-xs last:border-0">
      <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${REASON_STYLE[m.reason] ?? "bg-slate-100 text-slate-600"}`}>{m.reason}</span>
      <span className={`w-14 shrink-0 text-right font-extrabold tabular-nums ${m.qty > 0 ? "text-emerald-600" : "text-rose-600"}`}>
        {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-600">
        {showItem ? <strong>{m.itemName}</strong> : null}
        {showItem && (m.note || m.refOrderId) ? " · " : ""}
        {m.note}
        {m.refOrderId ? ` (${m.refOrderId})` : ""}
      </span>
      <span className="hidden shrink-0 tabular-nums text-slate-400 sm:inline">เหลือ {fmtN(m.balanceAfter)}</span>
      <span className="shrink-0 text-slate-400">
        {m.by} · {new Date(m.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function ItemModal({
  item,
  onClose,
  onSave,
}: {
  item: Item | null;
  onClose: () => void;
  onSave: (b: Partial<Item> & { name: string }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "ชิ้น");
  const [category, setCategory] = useState(item?.category ?? "");
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint != null ? String(item.reorderPoint) : "");
  const [leadTimeDays, setLeadTimeDays] = useState(item?.leadTimeDays != null ? String(item.leadTimeDays) : "");
  const [productIds, setProductIds] = useState((item?.productIds ?? []).join(", "));
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none";
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold text-slate-900">{item ? "✏️ แก้ไขวัสดุ" : "＋ เพิ่มวัสดุใหม่"}</p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">ชื่อวัสดุ *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เคส Magsafe iPhone 15 ใส" className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">หน่วยนับ</span>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ชิ้น" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">หมวด</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="เช่น เคสมือถือ" className={inp} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">จุดสั่งซื้อ (เหลือ ≤ นี้ = แจ้งสั่ง)</span>
              <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="เช่น 20" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">รอของกี่วัน (lead time)</span>
              <input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="เช่น 7" className={inp} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">ผูกกับสินค้า iDucky (productId คั่นด้วย , ) — ขายแล้วตัดสต๊อกตัวนี้</span>
            <input value={productIds} onChange={(e) => setProductIds(e.target.value)} placeholder="เช่น magsafe-case, magsafe-clear" className={inp} />
            <span className="mt-1 block text-[11px] text-slate-400">ดู productId ได้จากลิงก์หน้าสินค้า /products/&lt;id&gt;</span>
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: item?.id,
                name,
                unit,
                category: category || undefined,
                reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
                leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
                productIds: productIds.split(",").map((x) => x.trim()).filter(Boolean),
              })
            }
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            💾 บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveModal({
  target,
  onClose,
  onSave,
}: {
  target: { item: Item; mode: "in" | "out" | "count" };
  onClose: () => void;
  onSave: (qty: number, reason: string, note?: string, refOrderId?: string) => void;
}) {
  const { item, mode } = target;
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(mode === "in" ? "นำเข้า" : "เบิกทำเสีย");
  const [note, setNote] = useState("");
  const [refId, setRefId] = useState("");
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none";
  const n = Number(qty);

  // นับจริง: กรอกยอดที่นับได้ → ระบบคิดส่วนต่างให้ + บังคับเหตุผลเมื่อไม่ตรง
  const diff = mode === "count" && qty !== "" ? n - item.balance : null;
  const needNote = (mode === "count" && (diff ?? 0) < 0) || (mode === "out" && reason === "อื่นๆ");

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold text-slate-900">
          {mode === "in" ? "＋ รับของเข้า" : mode === "out" ? "− เบิกออก / ตัดเสีย" : "🧮 นับสต๊อกจริง"}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {item.name} · คงเหลือในระบบ <strong className="tabular-nums">{fmtN(item.balance)}</strong> {item.unit}
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              {mode === "count" ? "จำนวนที่นับได้จริง *" : "จำนวน *"}
            </span>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" autoFocus className={inp} />
          </label>
          {mode === "count" && diff != null && (
            <p className={`rounded-xl px-3 py-2 text-xs font-bold ${diff === 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {diff === 0
                ? "✓ ยอดตรงกับระบบ — ไม่ต้องปรับ"
                : diff < 0
                  ? `⚠️ ขาดไป ${fmtN(Math.abs(diff))} ${item.unit} — ต้องระบุเหตุผลว่าหายไปไหน`
                  : `พบเกิน ${fmtN(diff)} ${item.unit} — ระบบจะปรับเพิ่มให้`}
            </p>
          )}
          {mode === "out" && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">เหตุผล</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inp}>
                <option value="เบิกทำเสีย">⚠️ เบิกทำเสีย (ของเสีย/พิมพ์พลาด)</option>
                <option value="เบิกผลิต">🏭 เบิกผลิตงาน</option>
                <option value="อื่นๆ">อื่นๆ (ระบุหมายเหตุ)</option>
              </select>
            </label>
          )}
          {(mode === "out" || (mode === "count" && (diff ?? 0) !== 0)) && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">
                หมายเหตุ{needNote ? " * (บังคับ)" : ""}
              </span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "count" ? "เช่น เบิกทำเสียไม่ได้ลงระบบ 5 ชิ้น" : "รายละเอียดเพิ่มเติม"} className={inp} />
            </label>
          )}
          {mode === "out" && reason === "เบิกผลิต" && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">เลขออเดอร์ (ถ้ามี)</span>
              <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="OD-…" className={inp} />
            </label>
          )}
          {mode === "in" && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">หมายเหตุ (ล็อต/ร้านที่สั่ง)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ล็อต ก.ค. จากร้าน A" className={inp} />
            </label>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={qty === "" || (mode !== "count" && n <= 0) || (mode === "count" && diff === 0) || (needNote && !note.trim())}
            onClick={() => {
              if (mode === "in") onSave(n, "นำเข้า", note || undefined);
              else if (mode === "out") onSave(-n, reason, note || undefined, refId || undefined);
              else if (diff != null && diff !== 0) onSave(diff, "ปรับยอดนับจริง", note || `นับจริงได้ ${n}`);
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 ${
              mode === "in" ? "bg-emerald-600 hover:bg-emerald-700" : mode === "out" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            💾 บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

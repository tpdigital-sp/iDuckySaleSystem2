"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCan } from "@/lib/perm-context";
import {
  badge,
  btnNeutral,
  btnPrimary,
  btnSmGhost,
  btnSmNeutral,
  card,
  code as codeCls,
  drawerPanel,
  drawerScrim,
  fieldLabel,
  h1,
  input as inputCls,
  label as labelCls,
  metric,
  pillActive,
  pillIdle,
  subtle,
  TONE,
  type Tone,
} from "@/lib/admin-ui";

/**
 * คลังสต๊อกวัสดุ — ยอดคงเหลือมาจาก ledger (stockMoves) เท่านั้น แก้ตัวเลขลอย ๆ ไม่ได้
 * รับเข้า / เบิกออก / นับจริง(บังคับเหตุผลเมื่อขาด) + สถิติความเร็วใช้ → วันหมด → จุดสั่งซื้อ
 * ฝั่งผลิตเบิกจากหน้า TP-Leader (เบิกวัสดุผลิต) — คลังเดียวกัน เห็นในประวัติที่นี่ด้วย
 *
 * เลย์เอาต์เป็น "ลิสต์แน่นจัดกลุ่มตามตระกูล" ไม่ใช่การ์ด เพราะคลังโตจาก 1 → 49 → หลักร้อย SKU
 * รายละเอียด/ประวัติ/ปุ่มเดินสต๊อกย้ายไปลิ้นชักขวา แทนการกางในแถว (กางในลิสต์ทำเลย์เอาต์กระโดด)
 */

interface Item {
  id: string;
  name: string;
  code?: string;
  aliases?: string[];
  family?: string;
  unit: string;
  category?: string;
  balance: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  productIds?: string[];
  needsReview?: boolean;
  autoCreated?: boolean;
  maybeDuplicateOf?: string;
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
interface Stat {
  perDay: number;
  daysLeft: number | null;
  suggest: number | null;
  point: number | null;
  level: Tone;
}

const fmtN = (n: number) => n.toLocaleString("th-TH");
const REASON_TONE: Record<string, Tone> = {
  นำเข้า: "ok",
  ขาย: "neutral",
  "คืน-ยกเลิก": "neutral",
  เบิกผลิต: "review",
  เบิกทำเสีย: "danger",
  ปรับยอดนับจริง: "warn",
};
const MOVE_FILTERS = ["ทั้งหมด", "นำเข้า", "ขาย", "เบิกผลิต", "เบิกทำเสีย", "ปรับยอดนับจริง"] as const;
const VIEWS = ["ต้องสั่ง", "ใกล้หมด", "รอตรวจ"] as const;
type View = (typeof VIEWS)[number] | "ทั้งหมด";

export default function StockPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [items, setItems] = useState<Item[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("ทั้งหมด");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<Item | null>(null);
  const [moveFor, setMoveFor] = useState<{ item: Item; mode: "in" | "out" | "count" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moveFilter, setMoveFilter] = useState<(typeof MOVE_FILTERS)[number]>("ทั้งหมด");
  const [logOpen, setLogOpen] = useState(false);

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
    const t = setInterval(load, 20_000); // การเดินสต๊อกจริง atomic ที่เซิร์ฟเวอร์ — ตรงนี้แค่รีเฟรชจอ
    return () => clearInterval(t);
  }, [load]);

  /** สถิติจาก ledger: ความเร็วใช้ (ขาย+เบิกผลิต) 30 วันหลัง → วันหมด + จุดสั่งแนะนำ + ระดับ */
  const stats = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const usage = new Map<string, number>();
    for (const m of moves) {
      if (m.qty >= 0) continue;
      if (m.reason !== "ขาย" && m.reason !== "เบิกผลิต") continue;
      if (new Date(m.at).getTime() < cutoff) continue;
      usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + Math.abs(m.qty));
    }
    const out = new Map<string, Stat>();
    for (const it of items) {
      const perDay = (usage.get(it.id) ?? 0) / 30;
      const daysLeft = perDay > 0 ? Math.floor(Math.max(0, it.balance) / perDay) : null;
      const suggest = perDay > 0 && it.leadTimeDays ? Math.ceil(perDay * it.leadTimeDays * 1.2) : null; // +20% กันชน
      const point = it.reorderPoint ?? suggest;
      const level: Tone =
        point == null ? "neutral" : it.balance <= point ? "danger" : it.balance <= point * 1.5 ? "warn" : "ok";
      out.set(it.id, { perDay, daysLeft, suggest, point, level });
    }
    return out;
  }, [items, moves]);

  const needOrder = useMemo(() => items.filter((i) => stats.get(i.id)?.level === "danger"), [items, stats]);
  const nearLow = useMemo(() => items.filter((i) => stats.get(i.id)?.level === "warn"), [items, stats]);
  const toReview = useMemo(() => items.filter((i) => i.needsReview), [items]);

  /** ค้นด้วยชื่อ/รหัส/ตระกูล/หมวด — และ alias ด้วย เพราะคนเรียกของคนละชื่อกัน */
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items;
    if (view === "ต้องสั่ง") list = needOrder;
    else if (view === "ใกล้หมด") list = nearLow;
    else if (view === "รอตรวจ") list = toReview;
    if (needle) {
      list = list.filter((i) =>
        [i.name, i.code, i.family, i.category, ...(i.aliases ?? [])]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(needle))
      );
    }
    const rank: Record<string, number> = { danger: 0, warn: 1, neutral: 2, ok: 3, review: 4 };
    return [...list].sort(
      (a, b) =>
        (rank[stats.get(a.id)?.level ?? "neutral"] ?? 9) - (rank[stats.get(b.id)?.level ?? "neutral"] ?? 9) ||
        a.name.localeCompare(b.name, "th")
    );
  }, [items, q, view, needOrder, nearLow, toReview, stats]);

  /** จัดกลุ่มตามตระกูล — คลังหลักร้อย SKU ถ้าเรียงยาวพรืดจะหาไม่เจอ */
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const it of shown) {
      const k = it.family ?? it.category ?? "ยังไม่จัดตระกูล";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(it);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "th"));
  }, [shown]);

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

  const todayMoves = moves.filter((m) => new Date(m.at).toDateString() === new Date().toDateString()).length;
  const monthDefect = moves
    .filter((m) => m.reason === "เบิกทำเสีย" && Date.now() - new Date(m.at).getTime() < 30 * 86400_000)
    .reduce((s, m) => s + Math.abs(m.qty), 0);
  const shownMoves = moves.filter((m) => moveFilter === "ทั้งหมด" || m.reason === moveFilter).slice(0, 60);
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

  return (
    <div className="w-full pb-16">
      {/* ── หัวหน้า ── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>คลังสต๊อกวัสดุ</h1>
          <p className={`mt-1 ${subtle}`}>
            ขายหน้าเว็บตัดอัตโนมัติ · ฝั่งผลิตเบิกจากระบบเบิกของ · ทุกการเปลี่ยนมีบันทึกใน ledger
          </p>
        </div>
        {mayEdit && (
          <button type="button" onClick={() => setAddOpen(true)} className={btnPrimary}>
            เพิ่มวัสดุ
          </button>
        )}
      </div>

      {err && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200">
          {err}
        </p>
      )}

      {/* ── สรุป ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="วัสดุในคลัง" value={fmtN(items.length)} suffix="รายการ" />
        <StatTile label="ถึงจุดต้องสั่ง" value={fmtN(needOrder.length)} suffix="รายการ" tone={needOrder.length ? "danger" : "ok"} />
        <StatTile label="เคลื่อนไหววันนี้" value={fmtN(todayMoves)} suffix="ครั้ง" />
        <StatTile label="เบิกทำเสีย 30 วัน" value={fmtN(monthDefect)} suffix="ชิ้น" tone={monthDefect ? "warn" : undefined} />
      </div>

      {/* ── แถบเครื่องมือ: ค้นหา + กรอง ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นชื่อ รหัส ตระกูล หรือชื่อที่เคยเรียก…"
          className={`${inputCls} w-full sm:w-72`}
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={view === "ทั้งหมด"} onClick={() => setView("ทั้งหมด")} count={items.length}>
            ทั้งหมด
          </FilterPill>
          <FilterPill active={view === "ต้องสั่ง"} onClick={() => setView("ต้องสั่ง")} count={needOrder.length} tone="danger">
            ต้องสั่ง
          </FilterPill>
          <FilterPill active={view === "ใกล้หมด"} onClick={() => setView("ใกล้หมด")} count={nearLow.length} tone="warn">
            ใกล้หมด
          </FilterPill>
          {toReview.length > 0 && (
            <FilterPill active={view === "รอตรวจ"} onClick={() => setView("รอตรวจ")} count={toReview.length} tone="review">
              รอตรวจ
            </FilterPill>
          )}
        </div>
      </div>

      {/* ── ลิสต์วัสดุ จัดกลุ่มตามตระกูล ── */}
      {loading ? (
        <div className={`${card} py-16 text-center text-sm text-slate-400`}>กำลังโหลด…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-600">
            {items.length === 0 ? "ยังไม่มีวัสดุในคลัง" : "ไม่พบวัสดุที่ค้นหา"}
          </p>
          {items.length === 0 && mayEdit && (
            <button type="button" onClick={() => setAddOpen(true)} className={`${btnPrimary} mt-3`}>
              เพิ่มวัสดุตัวแรก
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([family, list]) => {
            const isOpen = !collapsed.has(family);
            const alert = list.filter((i) => stats.get(i.id)?.level === "danger").length;
            return (
              <section key={family} className={`${card} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(family)) next.delete(family);
                      else next.add(family);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className={`text-slate-400 transition ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                    ›
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{family}</span>
                  <span className={`${badge} bg-slate-100 text-slate-500`}>{list.length}</span>
                  {alert > 0 && <span className={`${badge} ${TONE.danger.bg} ${TONE.danger.text}`}>ต้องสั่ง {alert}</span>}
                </button>
                {isOpen && (
                  <ul className="border-t border-slate-100">
                    {list.map((it) => (
                      <StockRow
                        key={it.id}
                        item={it}
                        stat={stats.get(it.id)}
                        onOpen={() => setOpenId(it.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── ประวัติรวม (พับเก็บได้ — ไม่ใช่สิ่งที่ดูทุกครั้งที่เข้าหน้า) ── */}
      <section className={`${card} mt-6 overflow-hidden`}>
        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
        >
          <span className={`text-slate-400 transition ${logOpen ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
          <span className="text-sm font-semibold text-slate-800">การเคลื่อนไหวล่าสุด</span>
          <span className={`${badge} bg-slate-100 text-slate-500`}>{moves.length}</span>
        </button>
        {logOpen && (
          <div className="border-t border-slate-100">
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5">
              {MOVE_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setMoveFilter(f)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    moveFilter === f ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="px-4 py-1">
              {shownMoves.map((m) => (
                <MoveRow key={m.id} m={m} showItem />
              ))}
              {shownMoves.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  ไม่มีการเคลื่อนไหว{moveFilter !== "ทั้งหมด" ? `ประเภท “${moveFilter}”` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── ลิ้นชักรายละเอียด ── */}
      {openItem && (
        <ItemDrawer
          item={openItem}
          stat={stats.get(openItem.id)}
          moves={moves.filter((m) => m.itemId === openItem.id)}
          mayEdit={mayEdit}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditFor(openItem)}
          onMove={(mode) => setMoveFor({ item: openItem, mode })}
        />
      )}

      {(addOpen || editFor) && (
        <ItemModal
          item={editFor}
          onClose={() => {
            setAddOpen(false);
            setEditFor(null);
          }}
          onSave={async (b) => {
            if (await saveItem(b)) {
              setAddOpen(false);
              setEditFor(null);
            }
          }}
        />
      )}

      {moveFor && (
        <MoveModal
          target={moveFor}
          onClose={() => setMoveFor(null)}
          onSave={async (qty, reason, note, ref) => {
            if (await doMove(moveFor.item.id, qty, reason, note, ref)) setMoveFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── ชิ้นส่วน ───────────────────────────

function StatTile({ label: text, value, suffix, tone }: { label: string; value: string; suffix: string; tone?: Tone }) {
  return (
    <div className={`${card} p-4`}>
      <p className={labelCls}>{text}</p>
      <p className={`mt-1.5 ${metric} ${tone ? TONE[tone].text : ""}`}>
        {value} <span className="text-xs font-medium text-slate-400">{suffix}</span>
      </p>
    </div>
  );
}

function FilterPill({
  children,
  active,
  count,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  count: number;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? pillActive : pillIdle}>
      <span className={!active && tone && count > 0 ? TONE[tone].text : undefined}>{children}</span>
      <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-slate-400"}`}>{count}</span>
    </button>
  );
}

/** แถวเดียวต่อ SKU — แน่นพอให้เห็นหลายสิบตัวในจอเดียว แต่ยังอ่านยอด/ความเร่งด่วนได้ */
function StockRow({ item, stat, onOpen }: { item: Item; stat?: Stat; onOpen: () => void }) {
  const level = stat?.level ?? "neutral";
  const point = stat?.point ?? null;
  // เต็มหลอด = จุดสั่ง×3 ให้เห็นระยะห่างจากจุดสั่งชัด
  const cap = point != null ? Math.max(point * 3, 1) : Math.max(item.balance, 1);
  const pct = Math.max(0, Math.min(100, (item.balance / cap) * 100));
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-50"
      >
        {/* จุดสถานะ — สีเดียวต่อแถว */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[level].bar}`} aria-hidden />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900">{item.name}</span>
            {item.needsReview && <span className={`${badge} ${TONE.review.bg} ${TONE.review.text}`}>รอตรวจ</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            {item.code && <span className={codeCls}>{item.code}</span>}
            <span className="truncate text-[11px] text-slate-400">
              {(item.productIds?.length ?? 0) > 0 ? `ผูกสินค้า ${item.productIds!.length}` : "ยังไม่ผูกสินค้า"}
              {point != null ? ` · จุดสั่ง ≤ ${fmtN(point)}` : ""}
            </span>
          </span>
        </span>

        {/* หลอดระดับ — ซ่อนบนจอแคบ */}
        <span className="relative hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100 lg:block">
          <span className={`absolute inset-y-0 left-0 rounded-full ${TONE[level].bar}`} style={{ width: `${pct}%` }} />
          {point != null && (
            <span className="absolute inset-y-0 w-px bg-slate-400/70" style={{ left: `${Math.min(99, (point / cap) * 100)}%` }} />
          )}
        </span>

        <span className="w-24 shrink-0 text-right">
          <span className={`text-base font-semibold tabular-nums ${item.balance < 0 ? TONE.danger.text : "text-slate-900"}`}>
            {fmtN(item.balance)}
          </span>
          <span className="ml-1 text-[11px] text-slate-400">{item.unit}</span>
        </span>

        <span className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400 sm:block">
          {stat?.daysLeft != null ? `~${fmtN(stat.daysLeft)} วัน` : "—"}
        </span>
      </button>
    </li>
  );
}

function MoveRow({ m, showItem }: { m: Move; showItem?: boolean }) {
  const tone = REASON_TONE[m.reason] ?? "neutral";
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-2 text-xs last:border-0">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[tone].bg} ${TONE[tone].text}`}>
        {m.reason}
      </span>
      <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}>
        {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-600">
        {showItem ? <span className="font-medium text-slate-800">{m.itemName}</span> : null}
        {showItem && (m.note || m.refOrderId) ? " · " : ""}
        {m.note}
        {m.refOrderId ? ` (${m.refOrderId})` : ""}
      </span>
      <span className="hidden shrink-0 tabular-nums text-slate-400 sm:inline">เหลือ {fmtN(m.balanceAfter)}</span>
      <span className="hidden shrink-0 text-slate-400 md:inline">
        {m.by} · {new Date(m.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

/** ลิ้นชักขวา — รายละเอียด + ปุ่มเดินสต๊อก + ประวัติของ SKU ตัวนั้น */
function ItemDrawer({
  item,
  stat,
  moves,
  mayEdit,
  onClose,
  onEdit,
  onMove,
}: {
  item: Item;
  stat?: Stat;
  moves: Move[];
  mayEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onMove: (mode: "in" | "out" | "count") => void;
}) {
  // ปิดด้วย Esc + ล็อกสกรอลล์พื้นหลัง ไม่งั้นเลื่อนลิ้นชักแล้วหน้าหลังเลื่อนตาม
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const level = stat?.level ?? "neutral";
  return (
    <>
      <div className={drawerScrim} onClick={onClose} />
      <aside className={drawerPanel} role="dialog" aria-label={`รายละเอียด ${item.name}`}>
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              {item.code && <span className={codeCls}>{item.code}</span>}
              {item.family && <span className="text-[11px] text-slate-400">{item.family}</span>}
              {item.needsReview && <span className={`${badge} ${TONE.review.bg} ${TONE.review.text}`}>รอตรวจ</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnSmGhost} aria-label="ปิด">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-end justify-between">
            <p className={`${metric} ${item.balance < 0 ? TONE.danger.text : ""}`}>
              {fmtN(item.balance)} <span className="text-sm font-medium text-slate-400">{item.unit}</span>
            </p>
            {stat?.point != null && (
              <span className={`${badge} ${TONE[level].bg} ${TONE[level].text}`}>
                จุดสั่ง ≤ {fmtN(stat.point)}
                {item.reorderPoint == null ? " (แนะนำ)" : ""}
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Fact k="ใช้เฉลี่ย/วัน" v={stat && stat.perDay > 0 ? stat.perDay.toFixed(1) : "—"} />
            <Fact k="จะหมดใน" v={stat?.daysLeft != null ? `~${fmtN(stat.daysLeft)} วัน` : "—"} />
            <Fact k="รอของ" v={item.leadTimeDays ? `${item.leadTimeDays} วัน` : "—"} />
            <Fact k="ผูกสินค้า" v={`${item.productIds?.length ?? 0} ตัว`} />
          </dl>

          {item.maybeDuplicateOf && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${TONE.warn.bg} ${TONE.warn.text}`}>
              อาจซ้ำกับ <span className="font-mono">{item.maybeDuplicateOf}</span> — ตรวจแล้วค่อยยุบรวม (ยุบผิดย้อนไม่ได้)
            </p>
          )}

          {(item.aliases?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className={labelCls}>ชื่อที่เคยเรียก</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {item.aliases!.map((a) => (
                  <span key={a} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className={labelCls}>ประวัติ</p>
            <div className="mt-1.5">
              {moves.slice(0, 40).map((m) => (
                <MoveRow key={m.id} m={m} />
              ))}
              {moves.length === 0 && <p className="py-4 text-center text-xs text-slate-400">ยังไม่มีการเคลื่อนไหว</p>}
            </div>
          </div>
        </div>

        {mayEdit && (
          <footer className="grid grid-cols-4 gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <button type="button" onClick={() => onMove("in")} className={btnSmNeutral}>
              รับเข้า
            </button>
            <button type="button" onClick={() => onMove("out")} className={btnSmNeutral}>
              เบิกออก
            </button>
            <button type="button" onClick={() => onMove("count")} className={btnSmNeutral}>
              นับจริง
            </button>
            <button type="button" onClick={onEdit} className={btnSmNeutral}>
              แก้ไข
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700">{v}</dd>
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
  const [codeVal, setCodeVal] = useState(item?.code ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "ชิ้น");
  const [family, setFamily] = useState(item?.family ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint != null ? String(item.reorderPoint) : "");
  const [leadTimeDays, setLeadTimeDays] = useState(item?.leadTimeDays != null ? String(item.leadTimeDays) : "");
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(", "));
  const [productIds, setProductIds] = useState((item?.productIds ?? []).join(", "));

  return (
    <Modal title={item ? "แก้ไขวัสดุ" : "เพิ่มวัสดุใหม่"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabel}>ชื่อวัสดุ *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ไหมเย็บ ขาว (1803)" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>รหัส (ติดป้ายชั้นวาง)</span>
            <input value={codeVal} onChange={(e) => setCodeVal(e.target.value.toUpperCase())} placeholder="THREAD-1803" className={inputCls} />
          </label>
          <label className="block">
            <span className={fieldLabel}>หน่วยนับ</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ชิ้น" className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>ตระกูล (ใช้จัดกลุ่ม)</span>
            <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="สีไหมเย็บ" className={inputCls} />
          </label>
          <label className="block">
            <span className={fieldLabel}>หมวด</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ด้าย/ไหม" className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>จุดสั่งซื้อ (เหลือ ≤ นี้ = แจ้ง)</span>
            <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="20" className={inputCls} />
          </label>
          <label className="block">
            <span className={fieldLabel}>รอของกี่วัน</span>
            <input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="7" className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className={fieldLabel}>ชื่อที่เคยเรียก (คั่นด้วย , ) — ใช้ค้นหาให้เจอ</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Gtดำ, GT ดำ" className={inputCls} />
        </label>
        <label className="block">
          <span className={fieldLabel}>ผูกกับสินค้า iDucky (productId คั่นด้วย , )</span>
          <input value={productIds} onChange={(e) => setProductIds(e.target.value)} placeholder="magsafe-case, magsafe-clear" className={inputCls} />
          <span className="mt-1 block text-[11px] text-slate-400">ดู productId ได้จากลิงก์หน้าสินค้า /products/&lt;id&gt;</span>
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        disabled={!name.trim()}
        onConfirm={() =>
          onSave({
            id: item?.id,
            name,
            code: codeVal.trim() || undefined,
            unit,
            family: family.trim() || undefined,
            category: category || undefined,
            reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
            leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
            aliases: aliases.split(",").map((x) => x.trim()).filter(Boolean),
            productIds: productIds.split(",").map((x) => x.trim()).filter(Boolean),
          })
        }
      />
    </Modal>
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
  const n = Number(qty);

  // นับจริง: กรอกยอดที่นับได้ → ระบบคิดส่วนต่างให้ + บังคับเหตุผลเมื่อขาด
  const diff = mode === "count" && qty !== "" ? n - item.balance : null;
  const needNote = (mode === "count" && (diff ?? 0) < 0) || (mode === "out" && reason === "อื่นๆ");
  const title = mode === "in" ? "รับของเข้า" : mode === "out" ? "เบิกออก / ตัดเสีย" : "นับสต๊อกจริง";

  return (
    <Modal
      title={title}
      subtitle={`${item.name} · คงเหลือในระบบ ${fmtN(item.balance)} ${item.unit}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabel}>{mode === "count" ? "จำนวนที่นับได้จริง *" : "จำนวน *"}</span>
          <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" autoFocus className={inputCls} />
        </label>
        {mode === "count" && diff != null && (
          <p
            className={`rounded-xl px-3 py-2 text-xs font-medium ${
              diff === 0 ? `${TONE.ok.bg} ${TONE.ok.text}` : `${TONE.danger.bg} ${TONE.danger.text}`
            }`}
          >
            {diff === 0
              ? "ยอดตรงกับระบบ — ไม่ต้องปรับ"
              : diff < 0
                ? `ขาดไป ${fmtN(Math.abs(diff))} ${item.unit} — ต้องระบุเหตุผลว่าหายไปไหน`
                : `พบเกิน ${fmtN(diff)} ${item.unit} — ระบบจะปรับเพิ่มให้`}
          </p>
        )}
        {mode === "out" && (
          <label className="block">
            <span className={fieldLabel}>เหตุผล</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
              <option value="เบิกทำเสีย">เบิกทำเสีย (ของเสีย/พิมพ์พลาด)</option>
              <option value="เบิกผลิต">เบิกผลิตงาน</option>
              <option value="อื่นๆ">อื่นๆ (ระบุหมายเหตุ)</option>
            </select>
          </label>
        )}
        {(mode === "out" || (mode === "count" && (diff ?? 0) !== 0)) && (
          <label className="block">
            <span className={fieldLabel}>หมายเหตุ{needNote ? " * (บังคับ)" : ""}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "count" ? "เช่น เบิกทำเสียไม่ได้ลงระบบ 5 ชิ้น" : "รายละเอียดเพิ่มเติม"}
              className={inputCls}
            />
          </label>
        )}
        {mode === "out" && reason === "เบิกผลิต" && (
          <label className="block">
            <span className={fieldLabel}>เลขออเดอร์ (ถ้ามี)</span>
            <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="OD-…" className={inputCls} />
          </label>
        )}
        {mode === "in" && (
          <label className="block">
            <span className={fieldLabel}>หมายเหตุ (ล็อต/ร้านที่สั่ง)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ล็อต ก.ค. จากร้าน A" className={inputCls} />
          </label>
        )}
      </div>
      <ModalFooter
        onClose={onClose}
        disabled={qty === "" || (mode !== "count" && n <= 0) || (mode === "count" && diff === 0) || (needNote && !note.trim())}
        onConfirm={() => {
          if (mode === "in") onSave(n, "นำเข้า", note || undefined);
          else if (mode === "out") onSave(-n, reason, note || undefined, refId || undefined);
          else if (diff != null && diff !== 0) onSave(diff, "ปรับยอดนับจริง", note || `นับจริงได้ ${n}`);
        }}
      />
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {subtitle && <p className={`mt-0.5 ${subtle}`}>{subtitle}</p>}
        <div className="mt-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onConfirm, disabled }: { onClose: () => void; onConfirm: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={onClose} className={`${btnNeutral} flex-1`}>
        ยกเลิก
      </button>
      <button type="button" disabled={disabled} onClick={onConfirm} className={`${btnPrimary} flex-1`}>
        บันทึก
      </button>
    </div>
  );
}

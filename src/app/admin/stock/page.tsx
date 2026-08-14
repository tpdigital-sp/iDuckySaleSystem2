"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  subtle,
  TONE,
  type Tone,
} from "@/lib/admin-ui";

/**
 * คลังสต๊อกวัสดุ — ยอดคงเหลือมาจาก ledger (stockMoves) เท่านั้น แก้ตัวเลขลอย ๆ ไม่ได้
 * ฝั่งผลิตเบิกจากหน้า TP-Leader (เบิกวัสดุผลิต) — คลังเดียวกัน เห็นในแท็บประวัติที่นี่ด้วย
 *
 * แบ่ง 4 แท็บให้ตรงกับงานจริง (โครงเดียวกับระบบรับของ/เบิกของฝั่ง TP):
 *   รายการสินค้า = ตารางดูยอด · รับเข้า / เบิกของ = ฟอร์มทำงาน · ประวัติ = ledger เต็ม
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

/** ช่องเลือกในแถบเครื่องมือ — inputCls มี w-full ติดมา ต้องถอดก่อนไม่งั้นกินเต็มบรรทัด */
const selectCls = `${inputCls.replace("w-full ", "")} w-auto max-w-[14rem]`;

const fmtN = (n: number) => n.toLocaleString("th-TH");
const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const REASON_TONE: Record<string, Tone> = {
  นำเข้า: "ok",
  ขาย: "neutral",
  "คืน-ยกเลิก": "neutral",
  เบิกผลิต: "review",
  เบิกทำเสีย: "danger",
  ปรับยอดนับจริง: "warn",
};
const MOVE_FILTERS = ["ทั้งหมด", "นำเข้า", "ขาย", "เบิกผลิต", "เบิกทำเสีย", "ปรับยอดนับจริง"] as const;
const TABS = ["รายการสินค้า", "รับเข้า", "เบิกของ", "ประวัติ"] as const;
type Tab = (typeof TABS)[number];
type Filter = "ทั้งหมด" | "ต้องสั่ง" | "ใกล้หมด" | "รอตรวจ";
type SortKey = "urgency" | "name" | "balance" | "daysLeft";

export default function StockPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [tab, setTab] = useState<Tab>("รายการสินค้า");
  const [items, setItems] = useState<Item[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ทุกหมวด");
  const [fam, setFam] = useState("ทุกตระกูล");
  const [filter, setFilter] = useState<Filter>("ทั้งหมด");
  const [sort, setSort] = useState<SortKey>("urgency");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<Item | null>(null);
  const [countFor, setCountFor] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moveFilter, setMoveFilter] = useState<(typeof MOVE_FILTERS)[number]>("ทั้งหมด");
  const [logQ, setLogQ] = useState("");

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

  /** รายการหมวด/ตระกูลที่มีจริงในคลัง — ตระกูลตามหมวดที่เลือกอยู่ ไม่ให้เลือกคู่ที่ไม่มีของ */
  const cats = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")),
    [items]
  );
  const fams = useMemo(
    () =>
      [
        ...new Set(
          items
            .filter((i) => cat === "ทุกหมวด" || i.category === cat)
            .map((i) => i.family)
            .filter(Boolean) as string[]
        ),
      ].sort((a, b) => a.localeCompare(b, "th")),
    [items, cat]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items;
    if (filter === "ต้องสั่ง") list = needOrder;
    else if (filter === "ใกล้หมด") list = nearLow;
    else if (filter === "รอตรวจ") list = toReview;
    if (cat !== "ทุกหมวด") list = list.filter((i) => i.category === cat);
    if (fam !== "ทุกตระกูล") list = list.filter((i) => i.family === fam);
    if (needle) list = list.filter((i) => matchItem(i, needle));
    const rank: Record<string, number> = { danger: 0, warn: 1, neutral: 2, ok: 3, review: 4 };
    return [...list].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sort === "name") return a.name.localeCompare(b.name, "th");
      if (sort === "balance") return a.balance - b.balance;
      if (sort === "daysLeft") return (sa?.daysLeft ?? 1e9) - (sb?.daysLeft ?? 1e9);
      return (
        (rank[sa?.level ?? "neutral"] ?? 9) - (rank[sb?.level ?? "neutral"] ?? 9) || a.name.localeCompare(b.name, "th")
      );
    });
  }, [items, q, cat, fam, filter, sort, needOrder, nearLow, toReview, stats]);

  async function doMove(itemId: string, qty: number, reason: string, note?: string, refOrderId?: string) {
    setErr("");
    setOk("");
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
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

  const logRows = useMemo(() => {
    const needle = logQ.trim().toLowerCase();
    return moves
      .filter((m) => moveFilter === "ทั้งหมด" || m.reason === moveFilter)
      .filter((m) => !needle || `${m.itemName} ${m.note ?? ""} ${m.by} ${m.refOrderId ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [moves, moveFilter, logQ]);

  return (
    <div className="w-full pb-16">
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

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="วัสดุในคลัง" value={fmtN(items.length)} suffix="รายการ" />
        <StatTile label="ถึงจุดต้องสั่ง" value={fmtN(needOrder.length)} suffix="รายการ" tone={needOrder.length ? "danger" : "ok"} />
        <StatTile label="เคลื่อนไหววันนี้" value={fmtN(todayMoves)} suffix="ครั้ง" />
        <StatTile label="เบิกทำเสีย 30 วัน" value={fmtN(monthDefect)} suffix="ชิ้น" tone={monthDefect ? "warn" : undefined} />
      </div>

      {/* ── แท็บ ── */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setOk("");
              setErr("");
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t}
            {t === "รายการสินค้า" && needOrder.length > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === t ? "bg-white/20" : `${TONE.danger.bg} ${TONE.danger.text}`}`}>
                {needOrder.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {err && <Banner tone="danger">{err}</Banner>}
      {ok && <Banner tone="ok">{ok}</Banner>}

      {/* ── รายการสินค้า ── */}
      {tab === "รายการสินค้า" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นชื่อ รหัส ตระกูล หรือชื่อที่เคยเรียก…"
              className={`${inputCls} w-full sm:w-64`}
            />
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setFam("ทุกตระกูล"); // เปลี่ยนหมวดแล้วตระกูลเดิมอาจไม่มีในหมวดใหม่
              }}
              className={selectCls}
            >
              <option>ทุกหมวด</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={fam} onChange={(e) => setFam(e.target.value)} className={selectCls}>
              <option>ทุกตระกูล</option>
              {fams.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filter === "ทั้งหมด"} onClick={() => setFilter("ทั้งหมด")} count={items.length}>
                ทั้งหมด
              </Chip>
              <Chip active={filter === "ต้องสั่ง"} onClick={() => setFilter("ต้องสั่ง")} count={needOrder.length} tone="danger">
                ต้องสั่ง
              </Chip>
              <Chip active={filter === "ใกล้หมด"} onClick={() => setFilter("ใกล้หมด")} count={nearLow.length} tone="warn">
                ใกล้หมด
              </Chip>
              {toReview.length > 0 && (
                <Chip active={filter === "รอตรวจ"} onClick={() => setFilter("รอตรวจ")} count={toReview.length} tone="review">
                  รอตรวจ
                </Chip>
              )}
            </div>
          </div>

          {loading ? (
            <div className={`${card} py-16 text-center text-sm text-slate-400`}>กำลังโหลด…</div>
          ) : rows.length === 0 ? (
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
            <div className={`${card} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[54rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <Th className="w-8" />
                      <Th className="w-28">รหัส</Th>
                      <Th sortKey="name" sort={sort} onSort={setSort}>ชื่อวัสดุ</Th>
                      <Th className="w-36">ตระกูล</Th>
                      <Th className="w-28 text-right" sortKey="balance" sort={sort} onSort={setSort}>คงเหลือ</Th>
                      <Th className="w-24 text-right">จุดสั่ง</Th>
                      <Th className="w-20 text-right">ใช้/วัน</Th>
                      <Th className="w-24 text-right" sortKey="daysLeft" sort={sort} onSort={setSort}>จะหมดใน</Th>
                      {mayEdit && <Th className="w-16" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => {
                      const st = stats.get(it.id);
                      const level = st?.level ?? "neutral";
                      return (
                        <tr
                          key={it.id}
                          onClick={() => setOpenId(it.id)}
                          className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                        >
                          <Td>
                            <span className={`block h-2 w-2 rounded-full ${TONE[level].bar}`} aria-hidden />
                          </Td>
                          <Td>
                            <span className={codeCls}>{it.code ?? "—"}</span>
                          </Td>
                          <Td>
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{it.name}</span>
                              {it.needsReview && <span className={`${badge} ${TONE.review.bg} ${TONE.review.text}`}>รอตรวจ</span>}
                            </span>
                            {/* ไม่เตือน "ยังไม่ผูกสินค้า" ตรงนี้ — SKU ที่ผูกผ่านตัวเลือก (สีไหม/สีตะขอ) ตัดสต๊อกได้
                                โดยไม่มี productIds ข้อความเลยผิดกับของครึ่งคลัง · ดูจำนวนที่ผูกได้ในลิ้นชัก */}
                          </Td>
                          <Td className="text-slate-500">{it.family ?? it.category ?? "—"}</Td>
                          <Td className="text-right">
                            <span className={`font-semibold tabular-nums ${it.balance < 0 ? TONE.danger.text : "text-slate-900"}`}>
                              {fmtN(it.balance)}
                            </span>
                            <span className="ml-1 text-[11px] text-slate-400">{it.unit}</span>
                          </Td>
                          <Td className="text-right tabular-nums text-slate-500">
                            {st?.point != null ? fmtN(st.point) : "—"}
                            {st?.point != null && it.reorderPoint == null && <span className="text-slate-300"> *</span>}
                          </Td>
                          <Td className="text-right tabular-nums text-slate-500">
                            {st && st.perDay > 0 ? st.perDay.toFixed(1) : "—"}
                          </Td>
                          <Td className={`text-right tabular-nums ${level === "danger" ? TONE.danger.text : "text-slate-500"}`}>
                            {st?.daysLeft != null ? `~${fmtN(st.daysLeft)} วัน` : "—"}
                          </Td>
                          {mayEdit && (
                            <Td>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCountFor(it);
                                }}
                                className={btnSmNeutral}
                              >
                                นับ
                              </button>
                            </Td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
                แสดง {fmtN(rows.length)} จาก {fmtN(items.length)} รายการ · <span className="text-slate-300">*</span> จุดสั่งที่ระบบแนะนำจากสถิติ ยังไม่ได้ตั้งเอง
              </p>
            </div>
          )}
        </>
      )}

      {/* ── รับเข้า / เบิกของ ── */}
      {(tab === "รับเข้า" || tab === "เบิกของ") && (
        <MovePanel
          key={tab}
          mode={tab === "รับเข้า" ? "in" : "out"}
          items={items}
          moves={moves}
          mayEdit={mayEdit}
          onSubmit={async (itemId, qty, reason, note, refId) => {
            const done = await doMove(itemId, qty, reason, note, refId);
            if (done) {
              const it = items.find((i) => i.id === itemId);
              setOk(`บันทึกแล้ว — ${it?.name ?? ""} ${qty > 0 ? "+" : ""}${fmtN(qty)} ${it?.unit ?? ""}`);
            }
            return done;
          }}
        />
      )}

      {/* ── ประวัติ ── */}
      {tab === "ประวัติ" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={logQ}
              onChange={(e) => setLogQ(e.target.value)}
              placeholder="ค้นชื่อวัสดุ หมายเหตุ ผู้ทำ หรือเลขออเดอร์…"
              className={`${inputCls} w-full sm:w-72`}
            />
            <div className="flex flex-wrap gap-1.5">
              {MOVE_FILTERS.map((f) => (
                <Chip
                  key={f}
                  active={moveFilter === f}
                  onClick={() => setMoveFilter(f)}
                  count={f === "ทั้งหมด" ? moves.length : moves.filter((m) => m.reason === f).length}
                  tone={f === "ทั้งหมด" ? undefined : REASON_TONE[f]}
                >
                  {f}
                </Chip>
              ))}
            </div>
          </div>
          <MoveTable rows={logRows} showItem />
        </>
      )}

      {openItem && (
        <ItemDrawer
          item={openItem}
          stat={stats.get(openItem.id)}
          moves={moves.filter((m) => m.itemId === openItem.id)}
          mayEdit={mayEdit}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditFor(openItem)}
          onCount={() => setCountFor(openItem)}
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

      {countFor && (
        <CountModal
          item={countFor}
          onClose={() => setCountFor(null)}
          onSave={async (diff, note) => {
            if (await doMove(countFor.id, diff, "ปรับยอดนับจริง", note)) {
              setOk(`ปรับยอด ${countFor.name} แล้ว (${diff > 0 ? "+" : ""}${fmtN(diff)})`);
              setCountFor(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── ค้นหา ───────────────────────────

/** ค้นด้วยชื่อ/รหัส/ตระกูล/หมวด และ alias — คนเรียกของคนละชื่อกัน alias คือตัวที่ทำให้เจอ */
function matchItem(i: Item, needle: string) {
  return [i.name, i.code, i.family, i.category, ...(i.aliases ?? [])]
    .filter(Boolean)
    .some((s) => String(s).toLowerCase().includes(needle));
}

// ─────────────────────────── ชิ้นส่วนร่วม ───────────────────────────

function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${TONE[tone].bg} ${TONE[tone].text} ${TONE[tone].ring}`}>
      {children}
    </p>
  );
}

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

function Chip({
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
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className={!active && tone && count > 0 ? TONE[tone].text : undefined}>{children}</span>
      <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-slate-400"}`}>{count}</span>
    </button>
  );
}

function Th({
  children,
  className = "",
  sortKey,
  sort,
  onSort,
}: {
  children?: React.ReactNode;
  className?: string;
  sortKey?: SortKey;
  sort?: SortKey;
  onSort?: (k: SortKey) => void;
}) {
  const active = sortKey && sort === sortKey;
  return (
    <th className={`px-3 py-2.5 text-left ${labelCls} ${className}`}>
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className={`transition hover:text-slate-600 ${active ? "text-slate-700" : ""}`}>
          {children}
          <span className="ml-1">{active ? "↓" : ""}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

function MoveTable({ rows, showItem }: { rows: Move[]; showItem?: boolean }) {
  if (rows.length === 0) {
    return <div className={`${card} py-12 text-center text-sm text-slate-400`}>ไม่มีการเคลื่อนไหว</div>;
  }
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <Th className="w-32">เวลา</Th>
              <Th className="w-32">ประเภท</Th>
              {showItem && <Th className="w-56">วัสดุ</Th>}
              <Th className="w-24 text-right">จำนวน</Th>
              <Th className="w-24 text-right">คงเหลือ</Th>
              <Th>หมายเหตุ</Th>
              <Th className="w-40">โดย</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const tone = REASON_TONE[m.reason] ?? "neutral";
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <Td className="whitespace-nowrap text-slate-500">{fmtAt(m.at)}</Td>
                  <Td>
                    <span className={`${badge} ${TONE[tone].bg} ${TONE[tone].text}`}>{m.reason}</span>
                  </Td>
                  {showItem && <Td className="font-medium text-slate-800">{m.itemName}</Td>}
                  <Td className={`text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}>
                    {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
                  </Td>
                  <Td className="text-right tabular-nums text-slate-500">{fmtN(m.balanceAfter)}</Td>
                  <Td className="text-slate-600">
                    {m.note}
                    {m.refOrderId ? <span className={`ml-1 ${codeCls}`}>{m.refOrderId}</span> : null}
                  </Td>
                  <Td className="text-slate-400">{m.by}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── แท็บ รับเข้า / เบิกของ ───────────────────────────

function MovePanel({
  mode,
  items,
  moves,
  mayEdit,
  onSubmit,
}: {
  mode: "in" | "out";
  items: Item[];
  moves: Move[];
  mayEdit: boolean;
  onSubmit: (itemId: string, qty: number, reason: string, note?: string, refId?: string) => Promise<boolean>;
}) {
  const [sel, setSel] = useState<Item | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(mode === "in" ? "นำเข้า" : "เบิกผลิต");
  const [note, setNote] = useState("");
  const [refId, setRefId] = useState("");
  const [busy, setBusy] = useState(false);

  const n = Number(qty);
  const needNote = mode === "out" && reason === "อื่นๆ";
  const after = sel ? sel.balance + (mode === "in" ? n : -n) : 0;
  const willNegative = mode === "out" && sel != null && qty !== "" && after < 0;
  const invalid = !sel || qty === "" || n <= 0 || (needNote && !note.trim());

  // รายการล่าสุดของฝั่งนี้ ให้เห็นว่าที่เพิ่งกดไปเข้าจริง
  const recent = useMemo(
    () => moves.filter((m) => (mode === "in" ? m.qty > 0 : m.qty < 0)).slice(0, 25),
    [moves, mode]
  );

  async function submit() {
    if (invalid || !sel) return;
    setBusy(true);
    const done = await onSubmit(sel.id, mode === "in" ? n : -n, reason, note || undefined, refId || undefined);
    setBusy(false);
    if (done) {
      setSel(null);
      setQty("");
      setNote("");
      setRefId("");
    }
  }

  if (!mayEdit) {
    return <div className={`${card} py-12 text-center text-sm text-slate-400`}>บัญชีนี้ไม่มีสิทธิ์เดินสต๊อก</div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className="text-sm font-semibold text-slate-800">{mode === "in" ? "รับของเข้าคลัง" : "เบิกของออกจากคลัง"}</p>
        <p className={`mt-0.5 ${subtle}`}>
          {mode === "in"
            ? "ของที่สั่งมาถึงแล้ว บันทึกเข้าคลังที่นี่ · ใบรับของฝั่ง TP ที่ผูก SKU ไว้จะบวกยอดให้เองตอนหัวหน้าอนุมัติ"
            : "เบิกไปใช้ผลิตหรือตัดของเสีย · ตัดยอดทันทีที่กดบันทึก"}
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_11rem]">
          <div>
            <span className={fieldLabel}>วัสดุ *</span>
            <SkuPicker items={items} value={sel} onChange={setSel} />
          </div>
          <label className="block">
            <span className={fieldLabel}>จำนวน *</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className={`${inputCls} text-right tabular-nums`}
            />
          </label>
          {mode === "out" ? (
            <label className="block">
              <span className={fieldLabel}>เหตุผล</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                <option value="เบิกผลิต">เบิกผลิตงาน</option>
                <option value="เบิกทำเสีย">เบิกทำเสีย (ของเสีย/พิมพ์พลาด)</option>
                <option value="อื่นๆ">อื่นๆ (ระบุหมายเหตุ)</option>
              </select>
            </label>
          ) : (
            <div className="flex items-end">
              <p className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {sel ? (
                  <>
                    คงเหลือหลังรับ <span className="font-semibold tabular-nums text-slate-800">{fmtN(after)}</span> {sel.unit}
                  </>
                ) : (
                  "เลือกวัสดุก่อน"
                )}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>
              {mode === "in" ? "หมายเหตุ (ล็อต / ร้านที่สั่ง)" : `หมายเหตุ${needNote ? " * (บังคับ)" : ""}`}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "in" ? "เช่น ล็อต ก.ค. จากร้าน A" : "รายละเอียดเพิ่มเติม"}
              className={inputCls}
            />
          </label>
          {mode === "out" && reason === "เบิกผลิต" && (
            <label className="block">
              <span className={fieldLabel}>เลขออเดอร์ (ถ้ามี)</span>
              <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="OD-…" className={inputCls} />
            </label>
          )}
        </div>

        {sel && qty !== "" && mode === "out" && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${willNegative ? `${TONE.danger.bg} ${TONE.danger.text}` : "bg-slate-50 text-slate-600"}`}>
            {willNegative
              ? `เบิกเกินยอดในระบบ — คงเหลือจะติดลบเป็น ${fmtN(after)} ${sel.unit} (ยังบันทึกได้ แต่ควรนับจริงก่อน)`
              : `คงเหลือหลังเบิก ${fmtN(after)} ${sel.unit}`}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" disabled={invalid || busy} onClick={submit} className={btnPrimary}>
            {busy ? "กำลังบันทึก…" : mode === "in" ? "บันทึกรับเข้า" : "บันทึกเบิกออก"}
          </button>
        </div>
      </div>

      <div>
        <p className={`mb-2 ${labelCls}`}>{mode === "in" ? "รับเข้าล่าสุด" : "เบิกออกล่าสุด"}</p>
        <MoveTable rows={recent} showItem />
      </div>
    </div>
  );
}

/** เลือก SKU ด้วยการค้นหา — 300 SKU ใช้ <select> ไม่ไหว และต้องค้น alias ได้ด้วย */
function SkuPicker({ items, value, onChange }: { items: Item[]; value: Item | null; onChange: (i: Item | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 30);
    return items.filter((i) => matchItem(i, needle)).slice(0, 30);
  }, [items, q]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{value.name}</span>
          <span className="mt-0.5 flex items-center gap-2">
            {value.code && <span className={codeCls}>{value.code}</span>}
            <span className="text-[11px] text-slate-400">
              คงเหลือ {fmtN(value.balance)} {value.unit}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
          }}
          className={btnSmGhost}
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="พิมพ์ชื่อ รหัส หรือชื่อที่เคยเรียก…"
        className={inputCls}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hits.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(i);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900">{i.name}</span>
                  {i.code && <span className={codeCls}>{i.code}</span>}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                  {fmtN(i.balance)} {i.unit}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-3 text-center text-xs text-slate-400">ไม่พบวัสดุที่ค้น</li>}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── ลิ้นชัก ───────────────────────────

function ItemDrawer({
  item,
  stat,
  moves,
  mayEdit,
  onClose,
  onEdit,
  onCount,
}: {
  item: Item;
  stat?: Stat;
  moves: Move[];
  mayEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCount: () => void;
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
              {moves.slice(0, 40).map((m) => {
                const tone = REASON_TONE[m.reason] ?? "neutral";
                return (
                  <div key={m.id} className="flex items-center gap-2 border-b border-slate-100 py-2 text-xs last:border-0">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[tone].bg} ${TONE[tone].text}`}>
                      {m.reason}
                    </span>
                    <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}>
                      {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-500">{m.note}</span>
                    <span className="shrink-0 text-slate-400">{fmtAt(m.at)}</span>
                  </div>
                );
              })}
              {moves.length === 0 && <p className="py-4 text-center text-xs text-slate-400">ยังไม่มีการเคลื่อนไหว</p>}
            </div>
          </div>
        </div>

        {mayEdit && (
          <footer className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <button type="button" onClick={onCount} className={btnSmNeutral}>
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

// ─────────────────────────── โมดัล ───────────────────────────

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
            <span className={fieldLabel}>ตระกูล</span>
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

/** นับจริง — กรอกยอดที่นับได้ ระบบคิดส่วนต่างให้ + บังคับเหตุผลเมื่อของขาด */
function CountModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (diff: number, note?: string) => void }) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const n = Number(qty);
  const diff = qty !== "" ? n - item.balance : null;
  const needNote = (diff ?? 0) < 0;

  return (
    <Modal title="นับสต๊อกจริง" subtitle={`${item.name} · คงเหลือในระบบ ${fmtN(item.balance)} ${item.unit}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabel}>จำนวนที่นับได้จริง *</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            autoFocus
            className={`${inputCls} text-right tabular-nums`}
          />
        </label>
        {diff != null && (
          <p className={`rounded-xl px-3 py-2 text-xs font-medium ${diff === 0 ? `${TONE.ok.bg} ${TONE.ok.text}` : `${TONE.danger.bg} ${TONE.danger.text}`}`}>
            {diff === 0
              ? "ยอดตรงกับระบบ — ไม่ต้องปรับ"
              : diff < 0
                ? `ขาดไป ${fmtN(Math.abs(diff))} ${item.unit} — ต้องระบุเหตุผลว่าหายไปไหน`
                : `พบเกิน ${fmtN(diff)} ${item.unit} — ระบบจะปรับเพิ่มให้`}
          </p>
        )}
        {diff != null && diff !== 0 && (
          <label className="block">
            <span className={fieldLabel}>หมายเหตุ{needNote ? " * (บังคับ)" : ""}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เบิกทำเสียไม่ได้ลงระบบ 5 ชิ้น"
              className={inputCls}
            />
          </label>
        )}
      </div>
      <ModalFooter
        onClose={onClose}
        disabled={qty === "" || diff === 0 || (needNote && !note.trim())}
        onConfirm={() => diff != null && diff !== 0 && onSave(diff, note || `นับจริงได้ ${n}`)}
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

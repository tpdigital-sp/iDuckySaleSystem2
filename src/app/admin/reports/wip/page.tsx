"use client";

/**
 * 🗂 รายงานงานค้าง (ชั่วคราว) — /admin/reports/wip
 *
 * พนักงานขอ 30 ก.ย. 69: "อยากได้ตั้งแต่สถานะโอนแล้วไปจนถึงกำลังผลิต" + "เรียงวันจัดส่งด้วย"
 * = ใบที่เงินเข้าแล้วแต่ยังไม่ได้ส่งของ (ชำระแล้ว → รอตรวจแบบ → แก้ไขแบบ → อนุมัติแบบ → กำลังผลิต)
 * เรียงตามวันจัดส่งเป็นค่าเริ่มต้น ใบที่ต้องส่งก่อนอยู่บนสุด · ไม่มีวันส่ง = อยู่ท้าย
 *
 * ⚠️ หน้าชั่วคราว — กวาดตาดู/คัดลอก/ส่งออก CSV · กดชื่อลูกค้าเปิดใบจริง
 * ✅ ช่องติ๊ก "งานเสร็จพร้อมส่งแล้ว" (Order.readyToShip · POST /api/admin/orders/ready) แทนคอลัมน์ในชีต Google ที่ฝ่ายผลิตเคยติ๊ก
 *    ใช้ Order.shipDate ที่แอดมินตั้ง ถ้าไม่มีคิดจากวันใช้งาน (shipRangeOf — กติกาเดียวกับใบงาน/บอร์ด WIP)
 *    ใบที่เด้งกลับ "รอชำระเงิน" เพราะค้างส่วนต่าง ยังนับตามขั้นที่จำไว้ (queueStageOf) ไม่หายจากรายงาน
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import StatusChip, { STATUS_TONE } from "@/components/admin/StatusChip";
import { Btn, Empty, FChip, FilterCard, ListHead, PageHead, PageShell, Row, RowDate, RowMain, RowSide, Rows, SearchBox, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import "@/components/admin/dashboard.css";
import { daysToUseBy, orderStatusLabel, orderTotal, queueStageOf, type Order, type OrderStatus } from "@/lib/admin-data";
import { parseThaiDate } from "@/lib/admin-dash";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { formatPrice } from "@/lib/products";
import { orderQtyText } from "@/lib/item-yield";
import { usePolling } from "@/lib/use-polling";
import { useCan } from "@/lib/perm-context";
import { bkkParts } from "@/lib/bangkok-time";
import { shipRangeLabel, shipRangeOf, thaiDay } from "../../graphics/UseBy";

/** สถานะที่รายงานนี้ครอบ — เรียงตามลำดับงาน (เงินเข้า → แบบ → ผลิต) */
const WIP: OrderStatus[] = ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต"];
const RANK: Record<string, number> = Object.fromEntries(WIP.map((s, i) => [s, i]));
/** โทนชิปกรองต่อสถานะ — สีเดียวกับป้ายสถานะในแถว */
const CHIP_TONE: Record<string, "mint" | "lilac" | "coral" | "sky"> = {
  ชำระแล้ว: "mint",
  รอตรวจแบบ: "lilac",
  แก้ไขแบบ: "coral",
  อนุมัติแบบ: "mint",
  กำลังผลิต: "sky",
};

type SortKey = "ship" | "useBy" | "status" | "ordered";
/** กรองตามป้ายงานเสร็จ — all = ทุกใบ · ready = ติ๊กแล้ว · todo = ยังไม่ติ๊ก */
type ReadyKey = "all" | "ready" | "todo";
const SORTS: { key: SortKey; label: string; title: string }[] = [
  { key: "ship", label: "วันจัดส่ง", title: "ใบที่ต้องส่งก่อนอยู่บน · ไม่มีวันส่ง = ท้ายสุด" },
  { key: "useBy", label: "วันใช้งาน", title: "วันที่ลูกค้าต้องใช้งาน · ไม่ระบุ = ท้ายสุด" },
  { key: "status", label: "ขั้นงาน", title: "เงินเข้า → ทำแบบ → ผลิต" },
  { key: "ordered", label: "วันสั่ง", title: "ใบเก่าสุดขึ้นก่อน — ใบที่ค้างนานสุด" },
];

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
function today(): string {
  const p = bkkParts();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dateParts(ymd: string): { wd: string; day: string; mon: string } {
  const d = new Date(`${ymd}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("th-TH", { timeZone: "UTC", ...o });
  return { wd: f({ weekday: "short" }), day: String(d.getUTCDate()), mon: f({ month: "short" }) };
}
/** วันสั่งแบบ YYYY-MM-DD จาก "30 ก.ย. 2569 14:15" */
function orderedYmd(o: Order): string {
  const d = parseThaiDate(o.date);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "30 ก.ย. 14:05" — เวลาที่ติ๊กงานเสร็จ */
function thTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** ค้างมากี่วันนับจากวันสั่ง */
function agedDays(o: Order, t: string): number {
  const y = orderedYmd(o);
  if (!y) return 0;
  return Math.max(0, Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / 86_400_000));
}

/** 1 แถวในรายงาน — คำนวณครั้งเดียวตอนโหลด */
interface WipRow {
  o: Order;
  stage: OrderStatus;
  ship: ReturnType<typeof shipRangeOf>;
  shipKey: string; // YYYY-MM-DD วันแรกของช่วงส่ง · "" = ไม่มี
  useBy: string;
  ordered: string;
  total: number;
  qty: string;
  items: string;
  aged: number;
  hay: string;
}

function toRow(o: Order, t: string): WipRow {
  const ship = shipRangeOf(o);
  const items = o.items.map((i) => `${i.name} ×${i.qty}`).join(" · ");
  return {
    o,
    stage: queueStageOf(o),
    ship,
    shipKey: ship?.from ?? "",
    useBy: o.useByDate ?? "",
    ordered: orderedYmd(o),
    total: orderTotal(o),
    qty: orderQtyText(o.items),
    items,
    aged: agedDays(o, t),
    hay: `${o.id} ${o.customer} ${o.phone} ${items}`.toLowerCase(),
  };
}

/** ส่งออก CSV (UTF-8 BOM ให้ Excel อ่านไทยออก) */
function exportCsv(rows: WipRow[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["เลขที่", "ลูกค้า", "เบอร์", "สถานะ", "รายการ", "จำนวน", "ยอดรวม", "วันสั่ง", "ค้าง(วัน)", "วันจัดส่ง", "วันใช้งาน", "งานเร่ง", "ปริ้นใบงานแล้ว", "งานเสร็จพร้อมส่ง"];
  const body = rows.map((r) =>
    [
      r.o.id,
      r.o.customer,
      r.o.phone ?? "",
      orderStatusLabel(r.o),
      r.items,
      r.qty,
      r.total,
      r.ordered,
      r.aged,
      r.ship ? `${r.ship.from}${r.ship.to !== r.ship.from ? ` – ${r.ship.to}` : ""}${r.ship.auto ? " (คิดจากวันใช้งาน)" : ""}` : "",
      r.useBy,
      r.o.rush ? "เร่ง" : "",
      r.o.printedAt ? "แล้ว" : "",
      r.o.readyToShip ? `เสร็จแล้ว (${r.o.readyToShip.by} ${thTime(r.o.readyToShip.at)})` : "",
    ]
      .map(esc)
      .join(","),
  );
  const csv = "\uFEFF" + [head.map(esc).join(","), ...body].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `งานค้าง-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** บล็อกวันซ้ายสุดของแถว — วันจัดส่ง (หรือวันใช้งานเมื่อเรียงตามวันใช้งาน) */
function DateBlock({ r, sort, t }: { r: WipRow; sort: SortKey; t: string }) {
  const useUseBy = sort === "useBy";
  const key = useUseBy ? r.useBy : r.shipKey;
  if (!key) return <RowDate note={useUseBy ? "ไม่ระบุวันใช้" : "ยังไม่มีวันส่ง"} tone="none" title="ยังไม่ได้ตั้งวันส่ง/วันใช้งานในใบ — ถามลูกค้าแล้วกรอกในหน้าออเดอร์" />;
  const last = useUseBy ? key : (r.ship?.to ?? key);
  const tone = last < t ? "late" : key <= t ? "today" : key === addDays(t, 1) ? "soon" : "later";
  const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000);
  const note = tone === "late" ? `เลย ${-diff} วัน` : tone === "today" ? (useUseBy ? "ใช้วันนี้" : "ส่งวันนี้") : tone === "soon" ? "พรุ่งนี้" : `อีก ${diff} วัน`;
  const title = useUseBy ? `วันใช้งาน ${thaiDay(key)}` : `${r.ship?.auto ? "วันส่งที่ควรเป็น (คิดจากวันใช้งาน)" : "วันส่งที่ตั้งไว้"}: ${shipRangeLabel(r.ship!.from, r.ship!.to)}`;
  return <RowDate {...dateParts(key)} note={note} tone={tone} title={title} />;
}

function WipInner() {
  const [all, setAll] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("ship");
  const [ready, setReady] = useState<ReadyKey>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleErr, setToggleErr] = useState("");
  const can = useCan();
  const mayTick = can("orders.edit") || can("pack.check") || can("pack.ship");
  const t = today();

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (!r.ok) {
      setErr(r.error ?? "ดึงข้อมูลไม่ได้");
      return;
    }
    setErr("");
    setAll(r.orders);
    setAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, { intervalMs: 60_000 });

  /** ติ๊ก/ถอด "งานเสร็จพร้อมส่งแล้ว" — เขียนฝั่งเซิร์ฟเวอร์ทีละใบ แล้วอัปเดตแถวในหน้าทันที */
  const toggleReady = useCallback(async (o: Order) => {
    const on = !o.readyToShip;
    setBusy(o.id);
    setToggleErr("");
    try {
      const res = await fetch("/api/admin/orders/ready", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, on }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; readyToShip?: { by: string; at: string } | null };
      if (!res.ok || !j.ok) throw new Error(j.error || `เซิร์ฟเวอร์ตอบ ${res.status}`);
      setAll((prev) => (prev ?? []).map((x) => (x.id !== o.id ? x : j.readyToShip ? { ...x, readyToShip: j.readyToShip } : (({ readyToShip: _r, ...rest }) => (void _r, rest as Order))(x))));
    } catch (e) {
      setToggleErr(`${o.id}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"} — ลองกดใหม่`);
    } finally {
      setBusy(null);
    }
  }, []);

  const rows = useMemo(() => (all ?? []).filter((o) => o.status !== "ยกเลิก" && WIP.includes(queueStageOf(o))).map((o) => toRow(o, t)), [all, t]);
  const countOf = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.stage] = (m[r.stage] ?? 0) + 1;
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) => (status === "all" || r.stage === status) && (ready === "all" || (ready === "ready") === !!r.o.readyToShip) && (!needle || r.hay.includes(needle)),
    );
    const byKey = (k: (r: WipRow) => string) => (a: WipRow, b: WipRow) => {
      const x = k(a);
      const y = k(b);
      if (!x && !y) return RANK[a.stage] - RANK[b.stage] || a.ordered.localeCompare(b.ordered);
      if (!x) return 1;
      if (!y) return -1;
      return x.localeCompare(y) || RANK[a.stage] - RANK[b.stage];
    };
    const cmp =
      sort === "ship"
        ? byKey((r) => r.shipKey)
        : sort === "useBy"
          ? byKey((r) => r.useBy)
          : sort === "status"
            ? (a: WipRow, b: WipRow) => RANK[a.stage] - RANK[b.stage] || (a.shipKey || "9").localeCompare(b.shipKey || "9")
            : (a: WipRow, b: WipRow) => a.ordered.localeCompare(b.ordered);
    return [...list].sort(cmp);
  }, [rows, status, sort, q, ready]);

  /** จัดกลุ่มตามวันเมื่อเรียงตามวันส่ง/วันใช้งาน — หัวกลุ่มบอกว่าวันนั้นมีกี่ใบ */
  const groups = useMemo(() => {
    if (sort !== "ship" && sort !== "useBy") return [{ key: "", label: "", rows: shown }];
    const out: { key: string; label: string; rows: WipRow[] }[] = [];
    for (const r of shown) {
      const k = sort === "ship" ? r.shipKey : r.useBy;
      let g = out[out.length - 1];
      if (!g || g.key !== k) {
        const label = !k ? (sort === "ship" ? "ยังไม่มีวันส่ง" : "ไม่ระบุวันใช้งาน") : k < t ? `เลยกำหนด · ${thaiDay(k)}` : k === t ? `วันนี้ · ${thaiDay(k)}` : k === addDays(t, 1) ? `พรุ่งนี้ · ${thaiDay(k)}` : thaiDay(k);
        g = { key: k, label, rows: [] };
        out.push(g);
      }
      g.rows.push(r);
    }
    return out;
  }, [shown, sort, t]);

  const sumShown = shown.reduce((s, r) => s + r.total, 0);
  const late = rows.filter((r) => r.shipKey && (r.ship?.to ?? r.shipKey) < t).length;
  const noShip = rows.filter((r) => !r.shipKey).length;
  const readyN = rows.filter((r) => r.o.readyToShip).length;

  return (
    <PageShell>
      <PageHead
        group="งานขาย · รายงาน (ชั่วคราว)"
        title="งานค้าง โอนแล้ว → กำลังผลิต"
        count={all ? `${rows.length} ใบ` : undefined}
        sub="ใบที่เงินเข้าแล้วแต่ยังไม่ได้ส่งของ · เรียงตามวันจัดส่ง ใบที่ต้องส่งก่อนอยู่บนสุด · กดแถวเปิดใบ"
        live={err ? { ok: false, text: `ดึงข้อมูลไม่ได้: ${err}` } : at ? { ok: true, text: `ข้อมูลล่าสุด ${at} น. (อัปเดตทุก 1 นาที)` } : undefined}
        tools={
          <>
            <Btn onClick={load} title="ดึงข้อมูลใหม่เดี๋ยวนี้">
              ↻ โหลดใหม่
            </Btn>
            <Btn tone="navy" onClick={() => exportCsv(shown)} disabled={!shown.length} title="ส่งออกรายการที่กรองอยู่เป็นไฟล์ CSV (เปิดใน Excel ได้)">
              ⬇ ส่งออก CSV ({shown.length})
            </Btn>
          </>
        }
      />

      <Stats cols={4}>
        <Stat label="ค้างทั้งหมด" value={all ? rows.length : "…"} hint={`ยอดรวม ${formatPrice(Math.round(rows.reduce((s, r) => s + r.total, 0)))}`} onClick={() => setStatus("all")} active={status === "all"} />
        <Stat label="เลยวันส่งแล้ว" value={all ? late : "…"} hint="วันส่งที่ตั้งไว้ผ่านไปแล้ว" tone={late ? "due" : undefined} />
        <Stat label="ยังไม่มีวันส่ง" value={all ? noShip : "…"} hint="ไม่มีทั้งวันส่งและวันใช้งาน" />
        <Stat label="งานเสร็จพร้อมส่งแล้ว" value={all ? readyN : "…"} hint={`ยังไม่เสร็จ ${all ? rows.length - readyN : "…"} ใบ · แสดงอยู่ ${shown.length} ใบ ${formatPrice(Math.round(sumShown))}`} onClick={() => setReady(ready === "ready" ? "all" : "ready")} active={ready === "ready"} />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={status === "all"} onClick={() => setStatus("all")} label="ทุกขั้น" count={rows.length} />
          {WIP.map((s) => (
            <FChip key={s} on={status === s} onClick={() => setStatus(status === s ? "all" : s)} label={s} count={countOf[s] ?? 0} tone={CHIP_TONE[s]} />
          ))}
        </TabRow>
        <TabRow divider>
          <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            งานเสร็จ
          </span>
          <FChip on={ready === "all"} onClick={() => setReady("all")} label="ทั้งหมด" />
          <FChip on={ready === "todo"} onClick={() => setReady("todo")} label="ยังไม่เสร็จ" count={rows.length - readyN} tone="yolk" />
          <FChip on={ready === "ready"} onClick={() => setReady("ready")} label="พร้อมส่งแล้ว" count={readyN} tone="mint" />
        </TabRow>
        <TabRow divider>
          <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            เรียงตาม
          </span>
          {SORTS.map((s) => (
            <FChip key={s.key} on={sort === s.key} onClick={() => setSort(s.key)} label={s.label} />
          ))}
          <div className="ml-auto min-w-[220px] flex-1 sm:max-w-[320px]">
            <SearchBox value={q} onChange={setQ} placeholder="ค้นเลขที่ · ชื่อลูกค้า · เบอร์ · สินค้า" />
          </div>
        </TabRow>
      </FilterCard>

      {toggleErr && (
        <p className="mt-3 px-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {toggleErr}
        </p>
      )}
      {!all && !err && (
        <div className="dkb-g mt-4 p-6 text-center text-[13px]" style={{ color: "var(--dk-faint)" }}>
          กำลังดึงออเดอร์ทั้งร้าน…
        </div>
      )}
      {all && !shown.length && (
        <div className="mt-4">
          <Empty title={rows.length ? "ไม่มีใบที่ตรงตัวกรอง" : "ไม่มีงานค้างในช่วงโอนแล้ว → กำลังผลิต"} body={rows.length ? "ลองล้างคำค้นหรือกด “ทุกขั้น”" : "ทุกใบที่เงินเข้าแล้วส่งของออกไปหมดแล้ว"} />
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key || "flat"}>
          {g.label && <ListHead title={g.label} note={`${g.rows.length} ใบ · ${formatPrice(Math.round(g.rows.reduce((s, r) => s + r.total, 0)))}`} />}
          {!g.label && shown.length > 0 && <ListHead title="รายการ" note={`${shown.length} ใบ`} />}
          <Rows>
            {g.rows.map((r) => {
              const left = daysToUseBy(r.o);
              const hot = r.o.rush || (left !== null && left <= 3);
              return (
                <Row key={r.o.id} tone={STATUS_TONE[r.stage]} done={!!r.o.readyToShip}>
                  <DateBlock r={r} sort={sort} t={t} />
                  <RowMain
                    name={r.o.customer}
                    href={`/admin/orders/${r.o.id}`}
                    tags={
                      <>
                        <StatusChip s={r.stage} label={orderStatusLabel(r.o)} />
                        {r.o.readyToShip && (
                          <Tag tone="mint" title={`ติ๊กโดย ${r.o.readyToShip.by} · ${thTime(r.o.readyToShip.at)}`}>
                            ✅ งานเสร็จพร้อมส่ง
                          </Tag>
                        )}
                        {r.o.rush && <Tag tone="solid">งานเร่ง</Tag>}
                        {r.o.printedAt && <Tag tone="sky" title="ปริ้นใบงานเข้าไลน์ผลิตแล้ว">ปริ้นแล้ว</Tag>}
                        {r.o.needsPurchase && !r.o.needsPurchase.arrivedAt && <Tag tone="yolk">รอของเข้า</Tag>}
                      </>
                    }
                    meta={
                      <>
                        <span className="id">{r.o.id}</span>
                        <span>สั่ง {r.ordered ? thaiDay(r.ordered) : r.o.date}</span>
                        <span className={r.aged >= 7 ? "hot" : undefined}>ค้าง {r.aged} วัน</span>
                        {r.useBy ? <span className={hot ? "hot" : undefined}>ใช้งาน {thaiDay(r.useBy)}{left !== null ? ` (${left < 0 ? `เลย ${-left} วัน` : left === 0 ? "วันนี้" : `อีก ${left} วัน`})` : ""}</span> : <span className="warn">ไม่ระบุวันใช้งาน</span>}
                        {r.ship && sort !== "ship" && <span>ส่ง {shipRangeLabel(r.ship.from, r.ship.to)}</span>}
                        {r.ship && sort === "ship" && r.ship.to !== r.ship.from && <span>ช่วงส่ง {shipRangeLabel(r.ship.from, r.ship.to)}</span>}
                        <span className="basis-full truncate" title={r.items}>
                          {r.items}
                        </span>
                      </>
                    }
                  />
                  <RowSide>
                    <span className="dkb-amt dkb-num">{formatPrice(Math.round(r.total))}</span>
                    <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                      {r.qty}
                    </span>
                    {/* ✅ ช่องติ๊กงานเสร็จ — ปุ่มสูง 44px กดด้วยนิ้วโป้งได้ · ติ๊กแล้วบอกว่าใครติ๊กเมื่อไหร่ */}
                    <button
                      type="button"
                      disabled={!mayTick || busy === r.o.id}
                      onClick={() => toggleReady(r.o)}
                      aria-pressed={!!r.o.readyToShip}
                      className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold disabled:opacity-60"
                      style={r.o.readyToShip ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" } : { background: "rgba(255,255,255,0.7)", color: "var(--dk-navy)", boxShadow: "inset 0 0 0 1.5px var(--dk-hair)" }}
                      title={!mayTick ? "ตำแหน่งของคุณดูได้อย่างเดียว (ติ๊กได้เฉพาะแอดมิน/ฝ่ายผลิต-แพ็ค)" : r.o.readyToShip ? `ติ๊กโดย ${r.o.readyToShip.by} · ${thTime(r.o.readyToShip.at)} — กดอีกครั้งเพื่อถอด` : "ของทำเสร็จแล้ว วางรอแพ็ค/ส่งได้"}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[13px]" style={r.o.readyToShip ? { background: "var(--dk-mint)", color: "#fff" } : { boxShadow: "inset 0 0 0 1.5px var(--dk-navy-soft)" }}>
                        {r.o.readyToShip ? "✓" : ""}
                      </span>
                      {busy === r.o.id ? "กำลังบันทึก…" : r.o.readyToShip ? `เสร็จแล้ว · ${r.o.readyToShip.by}` : "งานเสร็จพร้อมส่ง"}
                    </button>
                  </RowSide>
                </Row>
              );
            })}
          </Rows>
        </div>
      ))}
    </PageShell>
  );
}

export default function WipReportPage() {
  return (
    <RequirePerm perm="orders.view">
      <WipInner />
    </RequirePerm>
  );
}

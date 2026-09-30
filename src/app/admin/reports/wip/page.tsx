"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🗂 รายงานงานค้าง (ชั่วคราว) — /admin/reports/wip
 *
 * พนักงานขอ 30 ก.ย. 69: "อยากได้ตั้งแต่สถานะโอนแล้วไปจนถึงกำลังผลิต" + "เรียงวันจัดส่งด้วย"
 * = ใบที่เงินเข้าแล้วแต่ยังไม่ได้ส่งของ (ชำระแล้ว → รอตรวจแบบ → แก้ไขแบบ → อนุมัติแบบ → กำลังผลิต)
 * เรียงตามวันจัดส่งเป็นค่าเริ่มต้น ใบที่ต้องส่งก่อนอยู่บนสุด · ไม่มีวันส่ง = อยู่ท้าย
 *
 * 🏭 ฝ่ายผลิต (สิทธิ์ wip.view — ล็อกอินด้วยบัญชี TP เดิม) เข้าได้หน้านี้หน้าเดียว ขอบเขตที่เจ้าของร้านกำหนด 30 ก.ย. 69:
 *    ดูอย่างเดียว · ติ๊ก "งานเสร็จพร้อมส่งแล้ว" ได้ · กด "ดูรายการ" เห็นสเปค+รูปลาย/แบบงานเหมือนที่ลูกค้าเห็น (ไม่มีราคา ไม่มีปุ่มแก้)
 *    ข้อมูลมาจาก /api/admin/orders/wip ซึ่งตัดเบอร์/ยอดเงินออกตามสิทธิ์ (ดู lib/wip-report.ts) — ไม่ใช่ /api/admin/orders
 * ✅ ช่องติ๊ก "งานเสร็จพร้อมส่งแล้ว" (Order.readyToShip · POST /api/admin/orders/ready) แทนคอลัมน์ในชีต Google ที่ฝ่ายผลิตเคยติ๊ก
 *    ใช้ Order.shipDate ที่แอดมินตั้ง ถ้าไม่มีคิดจากวันใช้งาน (shipRangeOf — กติกาเดียวกับใบงาน/บอร์ด WIP)
 *    ใบที่เด้งกลับ "รอชำระเงิน" เพราะค้างส่วนต่าง ยังนับตามขั้นที่จำไว้ (wipStageOf) ไม่หายจากรายงาน
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip, { STATUS_TONE } from "@/components/admin/StatusChip";
import { Btn, Empty, FChip, FilterCard, ListHead, PageHead, PageShell, Row, RowDate, RowMain, RowSide, Rows, SearchBox, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import ImageLightbox from "@/components/ImageLightbox";
import { SpecLines } from "@/components/SpecLines";
import "@/components/admin/dashboard.css";
import { PROOF_STYLES, type OrderStatus } from "@/lib/admin-data";
import { parseThaiDate } from "@/lib/admin-dash";
import { formatPrice } from "@/lib/products";
import { itemQtyText, orderQtyText } from "@/lib/item-yield";
import { usePolling } from "@/lib/use-polling";
import { useCan, usePermsReady } from "@/lib/perm-context";
import { bkkParts } from "@/lib/bangkok-time";
import { WIP_STATUSES, wipStageOf, wipStatusLabel, type WipItem, type WipOrder, type WipResponse } from "@/lib/wip-report";
import { shipRangeLabel, shipRangeOf, thaiDay } from "../../graphics/UseBy";

const RANK: Record<string, number> = Object.fromEntries(WIP_STATUSES.map((s, i) => [s, i]));
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
function orderedYmd(o: WipOrder): string {
  const d = parseThaiDate(o.date);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "30 ก.ย. 14:05" — เวลาที่ติ๊กงานเสร็จ */
function thTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** เหลืออีกกี่วันถึงวันใช้งาน (null = ไม่ได้ระบุ) · ติดลบ = เลยกำหนด */
function daysLeft(useBy: string, t: string): number | null {
  if (!useBy) return null;
  const a = Date.parse(`${useBy}T00:00:00Z`);
  return Number.isNaN(a) ? null : Math.round((a - Date.parse(`${t}T00:00:00Z`)) / 86_400_000);
}
/** ค้างมากี่วันนับจากวันสั่ง */
function agedDays(o: WipOrder, t: string): number {
  const y = orderedYmd(o);
  if (!y) return 0;
  return Math.max(0, Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / 86_400_000));
}
/** ค่ากล่อง/ค่า Add on — บรรทัดค่าธรรมเนียม ไม่ใช่งานที่ต้องผลิต */
const isFee = (it: WipItem) => it.productId.includes("#");

/** 1 แถวในรายงาน — คำนวณครั้งเดียวตอนโหลด */
interface WipRow {
  o: WipOrder;
  stage: OrderStatus;
  ship: ReturnType<typeof shipRangeOf>;
  shipKey: string; // YYYY-MM-DD วันแรกของช่วงส่ง · "" = ไม่มี
  useBy: string;
  ordered: string;
  qty: string;
  items: string;
  /** จำนวนรายการที่ต้องผลิต (ไม่นับค่าธรรมเนียม) */
  nItems: number;
  aged: number;
  hay: string;
}

function toRow(o: WipOrder, t: string): WipRow {
  const ship = shipRangeOf(o);
  const items = o.items.map((i) => `${i.name} ×${i.qty}`).join(" · ");
  return {
    o,
    stage: wipStageOf(o),
    ship,
    shipKey: ship?.from ?? "",
    useBy: o.useByDate ?? "",
    ordered: orderedYmd(o),
    qty: orderQtyText(o.items),
    items,
    nItems: o.items.filter((i) => !isFee(i)).length,
    aged: agedDays(o, t),
    hay: `${o.id} ${o.customer} ${o.phone ?? ""} ${items}`.toLowerCase(),
  };
}

/** ส่งออก CSV (UTF-8 BOM ให้ Excel อ่านไทยออก) — คอลัมน์เบอร์/ยอดใส่เฉพาะคนที่เห็นได้ */
function exportCsv(rows: WipRow[], full: boolean, money: boolean) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["เลขที่", "ลูกค้า", ...(full ? ["เบอร์"] : []), "สถานะ", "รายการ", "จำนวน", ...(money ? ["ยอดรวม"] : []), "วันสั่ง", "ค้าง(วัน)", "วันจัดส่ง", "วันใช้งาน", "งานเร่ง", "ปริ้นใบงานแล้ว", "งานเสร็จพร้อมส่ง"];
  const body = rows.map((r) =>
    [
      r.o.id,
      r.o.customer,
      ...(full ? [r.o.phone ?? ""] : []),
      wipStatusLabel(r.o),
      r.items,
      r.qty,
      ...(money ? [r.o.total ?? ""] : []),
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
  const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");
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

type Pic = { url: string; label: string; kind: "proof" | "art" };
/** รูปที่จะโชว์ของรายการ — มีแบบงานแล้วใช้แบบ ยังไม่มีก็ใช้ลายที่ลูกค้าแนบ (กติกาเดียวกับหน้าลูกค้า) */
function picsOf(it: WipItem): Pic[] {
  if (it.proofs?.length)
    return it.proofs.map((p, k) => ({
      url: p.url,
      kind: "proof",
      label: [`แบบ ${k + 1}`, p.qty != null ? `${p.qty.toLocaleString("th-TH")} ${p.unit?.trim() || "ชิ้น"}` : "", p.note ?? "", p.review === "ขอแก้ไข" ? "ลูกค้าขอแก้" : ""].filter(Boolean).join(" · "),
    }));
  return (it.artworkUrls ?? []).map((u, k) => {
    const side = it.artworkBackUrls?.length ? (it.artworkBackUrls.includes(u) ? "ด้านหลัง" : "ด้านหน้า") : "";
    const q = it.artworkQty?.[u];
    const s = it.artworkSize?.[u];
    return { url: u, kind: "art", label: [`ลาย ${k + 1}`, side, q != null ? `${q.toLocaleString("th-TH")} ชิ้น` : "", s ? `${s.w}×${s.h} cm` : ""].filter(Boolean).join(" · ") };
  });
}

/**
 * 📋 รายการสินค้าของใบ — การ์ดละรายการ แบบเดียวกับที่ลูกค้าเห็นในหน้าออเดอร์ (ชื่อ · จำนวน · สเปคบรรทัดละหัวข้อ · รูปแบบงาน/ลาย)
 * ไม่มีราคา ไม่มีปุ่มแก้อะไรทั้งสิ้น — ฝ่ายผลิตดูว่า "งานนี้คืออะไร ทำกี่ชิ้น ลายไหน"
 */
function ItemsPanel({ o, onZoom }: { o: WipOrder; onZoom: (pics: Pic[], idx: number, title: string) => void }) {
  return (
    <div className="dkb-g mt-1 mb-2 px-3 py-3 sm:px-4" style={{ borderLeft: "6px solid var(--dk-sky-300)" }}>
      <p className="dkb-eyebrow mb-2" style={{ color: "var(--dk-faint)" }}>
        รายการในใบ {o.id} · {o.items.filter((i) => !isFee(i)).length} รายการ
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {o.items.map((it, i) => {
          if (isFee(it)) return null;
          const pics = picsOf(it);
          const picHead = pics.length ? (pics[0].kind === "proof" ? "แบบงาน" : "ลายที่ลูกค้าแนบ (ยังไม่มีแบบจากกราฟฟิก)") : it.noProof ? "ไม่มีแบบ — รายการนี้ไม่ต้องทำแบบ" : "ยังไม่มีแบบ/ลาย";
          return (
            <div key={`${it.productId}-${i}`} className="rounded-2xl bg-white/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-bold leading-snug" style={{ color: "var(--dk-navy)" }}>
                  <span className="mr-1.5 text-xs" style={{ color: "var(--dk-faint)" }}>
                    {i + 1}.
                  </span>
                  {it.name}
                </p>
                <span className="dkb-num shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
                  {itemQtyText(it)}
                </span>
              </div>
              <SpecLines sel={it.sel} text={it.selections} className="mt-1 text-[12.5px]" labelClassName="text-slate-700" stripLinks />
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                <b>🖼 {picHead}</b>
                {it.proofStatus && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${PROOF_STYLES[it.proofStatus]}`}>{it.proofStatus}</span>}
              </div>
              {pics.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pics.map((p, k) => (
                    <button
                      key={`${p.url}-${k}`}
                      type="button"
                      onClick={() => onZoom(pics, k, `${o.id} · ${it.name}`)}
                      className="w-[92px] overflow-hidden rounded-xl bg-white text-left ring-1 ring-slate-200"
                      title={`${p.label} — แตะเพื่อขยาย`}
                    >
                      <img src={p.url} alt={p.label} className="aspect-square w-full object-cover" loading="lazy" />
                      <span className="block truncate px-1.5 py-1 text-[10.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WipInner() {
  const [all, setAll] = useState<WipOrder[] | null>(null);
  const [full, setFull] = useState(false);
  const [money, setMoney] = useState(false);
  const [mayTick, setMayTick] = useState(false);
  const [err, setErr] = useState("");
  const [at, setAt] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("ship");
  const [ready, setReady] = useState<ReadyKey>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleErr, setToggleErr] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState<{ pics: Pic[]; idx: number; title: string } | null>(null);
  const t = today();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/wip", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Partial<WipResponse>;
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `เซิร์ฟเวอร์ตอบ ${res.status}`);
        return;
      }
      setErr("");
      setAll(j.orders ?? []);
      setFull(!!j.full);
      setMoney(!!j.money);
      setMayTick(!!j.mayTick);
      setAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, { intervalMs: 60_000 });

  /** ติ๊ก/ถอด "งานเสร็จพร้อมส่งแล้ว" — เขียนฝั่งเซิร์ฟเวอร์ทีละใบ แล้วอัปเดตแถวในหน้าทันที */
  const toggleReady = useCallback(async (o: WipOrder) => {
    const on = !o.readyToShip;
    setBusy(o.id);
    setToggleErr("");
    try {
      const res = await fetch("/api/admin/orders/ready", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, on }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; readyToShip?: { by: string; at: string } | null };
      if (!res.ok || !j.ok) throw new Error(j.error || `เซิร์ฟเวอร์ตอบ ${res.status}`);
      setAll((prev) =>
        (prev ?? []).map((x) => {
          if (x.id !== o.id) return x;
          if (j.readyToShip) return { ...x, readyToShip: j.readyToShip };
          const { readyToShip: _r, ...rest } = x;
          void _r;
          return rest;
        }),
      );
    } catch (e) {
      setToggleErr(`${o.id}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"} — ลองกดใหม่`);
    } finally {
      setBusy(null);
    }
  }, []);

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows = useMemo(() => (all ?? []).map((o) => toRow(o, t)), [all, t]);
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

  const sumOf = (list: WipRow[]) => list.reduce((s, r) => s + (r.o.total ?? 0), 0);
  const moneyNote = (list: WipRow[]) => (money ? ` · ${formatPrice(Math.round(sumOf(list)))}` : "");
  const late = rows.filter((r) => r.shipKey && (r.ship?.to ?? r.shipKey) < t).length;
  const noShip = rows.filter((r) => !r.shipKey).length;
  const readyN = rows.filter((r) => r.o.readyToShip).length;

  return (
    <PageShell>
      <PageHead
        group="งานขาย · รายงาน (ชั่วคราว)"
        title="งานค้าง โอนแล้ว → กำลังผลิต"
        count={all ? `${rows.length} ใบ` : undefined}
        sub={`ใบที่เงินเข้าแล้วแต่ยังไม่ได้ส่งของ · เรียงตามวันจัดส่ง ใบที่ต้องส่งก่อนอยู่บนสุด · กด "ดูรายการ" เห็นสเปคและรูปงาน${full ? " · กดชื่อลูกค้าเปิดใบ" : ""}`}
        live={err ? { ok: false, text: `ดึงข้อมูลไม่ได้: ${err}` } : at ? { ok: true, text: `ข้อมูลล่าสุด ${at} น. (อัปเดตทุก 1 นาที)` } : undefined}
        tools={
          <>
            <Btn onClick={load} title="ดึงข้อมูลใหม่เดี๋ยวนี้">
              ↻ โหลดใหม่
            </Btn>
            <Btn tone="navy" onClick={() => exportCsv(shown, full, money)} disabled={!shown.length} title="ส่งออกรายการที่กรองอยู่เป็นไฟล์ CSV (เปิดใน Excel ได้)">
              ⬇ ส่งออก CSV ({shown.length})
            </Btn>
          </>
        }
      />

      <Stats cols={4}>
        <Stat label="ค้างทั้งหมด" value={all ? rows.length : "…"} hint={money ? `ยอดรวม ${formatPrice(Math.round(sumOf(rows)))}` : `${rows.reduce((s, r) => s + r.nItems, 0)} รายการ`} onClick={() => setStatus("all")} active={status === "all"} />
        <Stat label="เลยวันส่งแล้ว" value={all ? late : "…"} hint="วันส่งที่ตั้งไว้ผ่านไปแล้ว" tone={late ? "due" : undefined} />
        <Stat label="ยังไม่มีวันส่ง" value={all ? noShip : "…"} hint="ไม่มีทั้งวันส่งและวันใช้งาน" />
        <Stat label="งานเสร็จพร้อมส่งแล้ว" value={all ? readyN : "…"} hint={`ยังไม่เสร็จ ${all ? rows.length - readyN : "…"} ใบ · แสดงอยู่ ${shown.length} ใบ${moneyNote(shown)}`} onClick={() => setReady(ready === "ready" ? "all" : "ready")} active={ready === "ready"} />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={status === "all"} onClick={() => setStatus("all")} label="ทุกขั้น" count={rows.length} />
          {WIP_STATUSES.map((s) => (
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
            <SearchBox value={q} onChange={setQ} placeholder={full ? "ค้นเลขที่ · ชื่อลูกค้า · เบอร์ · สินค้า" : "ค้นเลขที่ · ชื่อลูกค้า · สินค้า"} />
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
          กำลังดึงงานค้างทั้งร้าน…
        </div>
      )}
      {all && !shown.length && (
        <div className="mt-4">
          <Empty title={rows.length ? "ไม่มีใบที่ตรงตัวกรอง" : "ไม่มีงานค้างในช่วงโอนแล้ว → กำลังผลิต"} body={rows.length ? "ลองล้างคำค้นหรือกด “ทุกขั้น”" : "ทุกใบที่เงินเข้าแล้วส่งของออกไปหมดแล้ว"} />
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key || "flat"}>
          {g.label && <ListHead title={g.label} note={`${g.rows.length} ใบ${moneyNote(g.rows)}`} />}
          {!g.label && shown.length > 0 && <ListHead title="รายการ" note={`${shown.length} ใบ`} />}
          <Rows>
            {g.rows.map((r) => {
              const left = daysLeft(r.useBy, t);
              const hot = r.o.rush || (left !== null && left <= 3);
              const isOpen = open.has(r.o.id);
              return (
                <div key={r.o.id}>
                  <Row tone={STATUS_TONE[r.stage]} done={!!r.o.readyToShip}>
                    <DateBlock r={r} sort={sort} t={t} />
                    <RowMain
                      name={r.o.customer}
                      href={full ? `/admin/orders/${r.o.id}` : undefined}
                      tags={
                        <>
                          <StatusChip s={r.stage} label={wipStatusLabel(r.o)} />
                          {r.o.readyToShip && (
                            <Tag tone="mint" title={`ติ๊กโดย ${r.o.readyToShip.by} · ${thTime(r.o.readyToShip.at)}`}>
                              ✅ งานเสร็จพร้อมส่ง
                            </Tag>
                          )}
                          {r.o.rush && <Tag tone="solid">งานเร่ง</Tag>}
                          {r.o.printedAt && (
                            <Tag tone="sky" title="ปริ้นใบงานเข้าไลน์ผลิตแล้ว">
                              ปริ้นแล้ว
                            </Tag>
                          )}
                          {r.o.needsPurchase && !r.o.needsPurchase.arrivedAt && <Tag tone="yolk">รอของเข้า</Tag>}
                        </>
                      }
                      meta={
                        <>
                          <span className="id">{r.o.id}</span>
                          <span>สั่ง {r.ordered ? thaiDay(r.ordered) : r.o.date}</span>
                          <span className={r.aged >= 7 ? "hot" : undefined}>ค้าง {r.aged} วัน</span>
                          {r.useBy ? (
                            <span className={hot ? "hot" : undefined}>
                              ใช้งาน {thaiDay(r.useBy)}
                              {left !== null ? ` (${left < 0 ? `เลย ${-left} วัน` : left === 0 ? "วันนี้" : `อีก ${left} วัน`})` : ""}
                            </span>
                          ) : (
                            <span className="warn">ไม่ระบุวันใช้งาน</span>
                          )}
                          {r.ship && sort !== "ship" && <span>ส่ง {shipRangeLabel(r.ship.from, r.ship.to)}</span>}
                          {r.ship && sort === "ship" && r.ship.to !== r.ship.from && <span>ช่วงส่ง {shipRangeLabel(r.ship.from, r.ship.to)}</span>}
                          <span className="basis-full truncate" title={r.items}>
                            {r.items}
                          </span>
                        </>
                      }
                    />
                    <RowSide>
                      {money && r.o.total != null && <span className="dkb-amt dkb-num">{formatPrice(Math.round(r.o.total))}</span>}
                      <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                        {r.qty}
                      </span>
                      <span className="mt-1 flex flex-wrap justify-end gap-1.5">
                        {/* 📋 ดูรายการ — สเปค + รูปลาย/แบบงาน แบบเดียวกับที่ลูกค้าเห็น (ไม่มีราคา ไม่มีปุ่มแก้) */}
                        <button
                          type="button"
                          onClick={() => toggleOpen(r.o.id)}
                          aria-expanded={isOpen}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold"
                          style={isOpen ? { background: "var(--dk-navy)", color: "#fff" } : { background: "rgba(255,255,255,0.7)", color: "var(--dk-navy)", boxShadow: "inset 0 0 0 1.5px var(--dk-hair)" }}
                          title="ดูว่างานนี้คืออะไร ทำกี่ชิ้น ลายไหน"
                        >
                          📋 {isOpen ? "ซ่อนรายการ" : `ดูรายการ (${r.nItems})`}
                        </button>
                        {/* ✅ ช่องติ๊กงานเสร็จ — ปุ่มสูง 44px กดด้วยนิ้วโป้งได้ · ติ๊กแล้วบอกว่าใครติ๊กเมื่อไหร่ */}
                        <button
                          type="button"
                          disabled={!mayTick || busy === r.o.id}
                          onClick={() => toggleReady(r.o)}
                          aria-pressed={!!r.o.readyToShip}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold disabled:opacity-60"
                          style={r.o.readyToShip ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" } : { background: "rgba(255,255,255,0.7)", color: "var(--dk-navy)", boxShadow: "inset 0 0 0 1.5px var(--dk-hair)" }}
                          title={!mayTick ? "ตำแหน่งของคุณดูได้อย่างเดียว (ติ๊กได้เฉพาะฝ่ายผลิต/แพ็ค/แอดมิน)" : r.o.readyToShip ? `ติ๊กโดย ${r.o.readyToShip.by} · ${thTime(r.o.readyToShip.at)} — กดอีกครั้งเพื่อถอด` : "ของทำเสร็จแล้ว วางรอแพ็ค/ส่งได้"}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[13px]" style={r.o.readyToShip ? { background: "var(--dk-mint)", color: "#fff" } : { boxShadow: "inset 0 0 0 1.5px var(--dk-navy-soft)" }}>
                            {r.o.readyToShip ? "✓" : ""}
                          </span>
                          {busy === r.o.id ? "กำลังบันทึก…" : r.o.readyToShip ? `เสร็จแล้ว · ${r.o.readyToShip.by}` : "งานเสร็จพร้อมส่ง"}
                        </button>
                      </span>
                    </RowSide>
                  </Row>
                  {isOpen && <ItemsPanel o={r.o} onZoom={(pics, idx, title) => setZoom({ pics, idx, title })} />}
                </div>
              );
            })}
          </Rows>
        </div>
      ))}

      {zoom && (
        <ImageLightbox
          src={zoom.pics[zoom.idx].url}
          alt={zoom.pics[zoom.idx].label}
          caption={`${zoom.title} — ${zoom.pics[zoom.idx].label}`}
          counter={zoom.pics.length > 1 ? `${zoom.idx + 1} / ${zoom.pics.length}` : undefined}
          onPrev={zoom.idx > 0 ? () => setZoom({ ...zoom, idx: zoom.idx - 1 }) : undefined}
          onNext={zoom.idx < zoom.pics.length - 1 ? () => setZoom({ ...zoom, idx: zoom.idx + 1 }) : undefined}
          onClose={() => setZoom(null)}
        />
      )}
    </PageShell>
  );
}

/** ด่านสิทธิ์ของหน้านี้ — ฝ่ายผลิต (wip.view) หรือใครก็ตามที่ดูออเดอร์ได้ (orders.view) · ของจริงบังคับที่ API */
export default function WipReportPage() {
  const can = useCan();
  const ready = usePermsReady();
  if (!ready) return null;
  if (can("wip.view") || can("orders.view")) return <WipInner />;
  return (
    <div className="py-20 text-center">
      <span className="text-4xl">🔒</span>
      <p className="mt-3 font-bold text-slate-700">หน้านี้ไม่ได้เปิดให้ตำแหน่งของคุณ</p>
      <p className="mt-1 text-sm text-slate-500">ถ้าต้องใช้งาน กรุณาแจ้งผู้ดูแลระบบ</p>
    </div>
  );
}

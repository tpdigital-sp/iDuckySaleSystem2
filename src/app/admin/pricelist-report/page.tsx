"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { badge, btnNeutral, btnSmNeutral, card, code, faint, h1, label, metric, muted, pillActive, pillIdle } from "@/lib/admin-ui";

/**
 * 🔍 รายงานเทียบเว็บตารางราคา ↔ สินค้าในระบบ
 *
 * อ่านชื่อสินค้าทุกใบจาก "หน้าแรก" ของ iduckyofficial-pricelists.com (หน้าเดียว)
 * แล้วเทียบกับสินค้าหลังบ้าน — บอกทีละบรรทัดว่าใบนั้นเผยแพร่แล้ว ยังเป็นร่าง หรือยังไม่มีในระบบ
 * เป็นหน้ารายงานล้วน ๆ ไม่แก้ข้อมูลอะไรทั้งสิ้น
 */

type Status = "published" | "draft" | "missing";

/** ติ๊กว่าทำแล้ว — เก็บฝั่งเซิร์ฟเวอร์ ทีมงานเห็นตรงกัน */
interface DoneMark {
  at: string;
  by: string;
}

interface Row {
  key: string;
  done: DoneMark | null;
  /** ติ๊กว่า "ให้พี่ปุ๋ยทำราคา" (คนละช่องกับ "ทำแล้ว") */
  priceTask: DoneMark | null;
  name: string;
  category: string;
  url: string;
  status: Status;
  match: string | null;
  /** สินค้าในระบบที่ตรงกับชื่อนี้ — การ์ด 1 ใบบนเว็บอาจตรงกับหลายตัวในระบบ */
  products: {
    id: string;
    slug: string;
    name: string;
    category: string;
    published: boolean;
    reviewed: boolean;
    hasImage: boolean;
    hasPricing: boolean;
    /** true = ทีมงานจับคู่เอง ไม่ใช่ระบบเดา */
    manual?: boolean;
  }[];
}

/** สินค้าในระบบสำหรับช่องค้นหาตอนย้าย */
interface PickItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  published: boolean;
  /** ตอนนี้อยู่บรรทัดชื่อไหน (ว่าง = ยังไม่อยู่บรรทัดไหน) */
  at: string;
}

interface Extra {
  id: string;
  slug: string;
  name: string;
  category: string;
  published: boolean;
}

interface Report {
  source: string;
  fetchedAt: string;
  sum: {
    cards: number;
    categories: number;
    published: number;
    draft: number;
    missing: number;
    adminTotal: number;
    adminPublished: number;
    adminDraft: number;
    matched: number;
    extras: number;
    done: number;
    priceTasks: number;
  };
  rows: Row[];
  extras: Extra[];
}

const STATUS_LABEL: Record<Status, string> = {
  published: "เผยแพร่แล้ว",
  draft: "ฉบับร่าง",
  missing: "ยังไม่มีในระบบ",
};

const STATUS_STYLE: Record<Status, string> = {
  published: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70",
  draft: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/70",
  missing: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
};

const STATUS_EMOJI: Record<Status, string> = { published: "✓", draft: "✎", missing: "✕" };

const FILTERS: { id: Status | "all"; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "published", label: "เผยแพร่แล้ว" },
  { id: "draft", label: "ฉบับร่าง" },
  { id: "missing", label: "ยังไม่มีในระบบ" },
];

/** ชื่อลิงก์แบบสั้น — เอาชื่อหน้า (slug) ของเว็บตารางราคามาโชว์ เช่น /keyring */
const linkName = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname) || "/";
  } catch {
    return url;
  }
};

/** วันที่แบบสั้น เช่น 18 ส.ค. 14:20 */
const whenOf = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * คำค้นในช่อง "ย้ายสินค้ามาที่นี่" — วางลิงก์สินค้ามาทั้งเส้นก็ได้
 * (https://iduckystore.com/products/standymusic-3 → standymusic-3)
 */
const pickKey = (q: string) => {
  const t = q.trim().toLowerCase();
  if (!t.includes("/")) return t;
  const path = t.split(/[?#]/)[0].replace(/\/+$/, "");
  try {
    return decodeURIComponent(path.split("/").pop() ?? "");
  } catch {
    return path.split("/").pop() ?? "";
  }
};

/** ลิงก์หน้าแก้ไขสินค้า — ใช้ slug ถ้ามี (URL อ่านรู้เรื่องกว่า) */
const editPath = (p: { id: string; slug: string }) => `/admin/products/${encodeURIComponent(p.slug || p.id)}`;

/** โหลดไฟล์ CSV ให้เปิดใน Excel ได้เลย (ใส่ BOM ไม่งั้นภาษาไทยเพี้ยน) */
function downloadCsv(rows: Row[]) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      r.category,
      r.name,
      STATUS_LABEL[r.status],
      String(r.products.length),
      r.products.map((p) => `${p.published ? "เผยแพร่" : "ร่าง"}: ${p.name}`).join(" · "),
      r.match ?? "",
      r.done ? `ทำแล้ว · ${r.done.by} · ${new Date(r.done.at).toLocaleDateString("th-TH")}` : "ยังไม่ทำ",
      r.priceTask ? `ให้พี่ปุ๋ยทำราคา · สั่งโดย ${r.priceTask.by}` : "",
      r.url,
    ]
      .map(esc)
      .join(",")
  );
  const csv =
    "﻿" +
    ["หมวดบนเว็บ,ชื่อบนเว็บ,สถานะ,จำนวนที่ตรงกัน,ชื่อในระบบ,วิธีจับคู่,เช็กลิสต์,งานพี่ปุ๋ย,ลิงก์หน้าตารางราคา", ...body].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `pricelist-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Tile({ n, text, hint, tone }: { n: number; text: string; hint?: string; tone?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className={label}>{text}</p>
      <p className={`${metric} mt-2 ${tone ?? ""}`}>{n.toLocaleString("th-TH")}</p>
      {hint ? <p className={`mt-1 text-xs ${faint}`}>{hint}</p> : null}
    </div>
  );
}

/** ช่อง "สินค้าในระบบ" — จับคู่เองได้: ✕ เอาออก · ＋ ย้ายสินค้าจากบรรทัดอื่นมาที่นี่ */
function ProductCell({
  row,
  all,
  busy,
  onAssign,
}: {
  row: Row;
  all: PickItem[];
  busy: boolean;
  /** key = รหัสบรรทัดปลายทาง · "" = เอาออก · null = คืนค่าจับคู่อัตโนมัติ */
  onAssign: (productId: string, key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const list = open ? row.products : row.products.slice(0, 3);
  const rest = row.products.length - list.length;

  const found = useMemo(() => {
    const t = pickKey(q);
    if (t.length < 2) return [];
    const mine = new Set(row.products.map((p) => p.id));
    const pool = all.filter((p) => !mine.has(p.id));
    // วางลิงก์สินค้ามา = เจาะจงตัวนั้นตัวเดียว (id/slug ตรงเป๊ะขึ้นก่อนเสมอ)
    const exact = pool.filter((p) => p.id.toLowerCase() === t || p.slug.toLowerCase() === t);
    const rest = pool.filter(
      (p) => !exact.includes(p) && (p.name.toLowerCase().includes(t) || p.id.toLowerCase().includes(t) || p.slug.toLowerCase().includes(t))
    );
    return [...exact, ...rest].slice(0, 8);
  }, [q, all, row.products]);

  return (
    <div className="space-y-1">
      {!row.products.length ? <p className={faint}>ยังไม่มีสินค้าชื่อนี้ในระบบ</p> : null}
      {list.map((p) => (
        <div key={p.id} className="group flex flex-wrap items-center gap-1.5">
          <span className={`${badge} ${p.published ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
            {p.published ? "เผยแพร่" : "ร่าง"}
          </span>
          <Link
            href={editPath(p)}
            target="_blank"
            rel="noreferrer"
            title="เปิดหน้าแก้ไขสินค้าในแท็บใหม่"
            className="text-slate-700 hover:text-amber-600 hover:underline"
          >
            {p.name} ↗
          </Link>
          {p.manual ? <span className={`${badge} bg-sky-50 text-sky-700`}>จับคู่เอง</span> : null}
          {p.reviewed ? <span className={`${badge} bg-violet-50 text-violet-600`}>ตรวจแล้ว</span> : null}
          {!p.hasPricing ? <span className={`${badge} bg-slate-100 text-slate-500`}>ยังไม่มีตารางราคา</span> : null}
          {!p.hasImage ? <span className={`${badge} bg-slate-100 text-slate-500`}>ยังไม่มีรูป</span> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => onAssign(p.id, p.manual ? null : "")}
            title={p.manual ? "ยกเลิกที่จับคู่เองไว้ (กลับไปใช้ที่ระบบเดา)" : "ไม่ใช่สินค้าของชื่อนี้ — เอาออกจากบรรทัดนี้"}
            className="rounded px-1 text-xs text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 disabled:cursor-wait"
          >
            ✕
          </button>
        </div>
      ))}

      <div className={`flex flex-wrap items-center gap-2 text-xs ${faint}`}>
        {row.products.length > 1 ? (
          <span>
            ตรงกัน {row.products.length} รายการ · เผยแพร่ {row.products.filter((p) => p.published).length} · ร่าง{" "}
            {row.products.filter((p) => !p.published).length}
          </span>
        ) : null}
        {rest > 0 || open ? (
          <button type="button" className="font-semibold text-amber-600 hover:underline" onClick={() => setOpen((v) => !v)}>
            {open ? "ย่อรายการ" : `ดูอีก ${rest} รายการ`}
          </button>
        ) : null}
        <button
          type="button"
          className="font-semibold text-slate-500 hover:text-amber-600 hover:underline"
          onClick={() => setPicking((v) => !v)}
        >
          {picking ? "ปิด" : "＋ ย้ายสินค้ามาที่นี่"}
        </button>
      </div>

      {picking ? (
        <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="พิมพ์ชื่อสินค้า / รหัสสินค้า / วางลิงก์หน้าสินค้า…"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
          />
          <div className="mt-1.5 space-y-1">
            {q.trim().length < 2 ? (
              <p className={`text-xs ${faint}`}>พิมพ์อย่างน้อย 2 ตัวอักษร — วางลิงก์หน้าสินค้ามาทั้งเส้นก็ได้</p>
            ) : !found.length ? (
              <p className={`text-xs ${faint}`}>ไม่เจอสินค้าชื่อนี้ในระบบ</p>
            ) : (
              found.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onAssign(p.id, row.key);
                    setPicking(false);
                    setQ("");
                  }}
                  className="flex w-full flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm hover:bg-white disabled:cursor-wait"
                >
                  <span className={`${badge} ${p.published ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                    {p.published ? "เผยแพร่" : "ร่าง"}
                  </span>
                  <span className="text-slate-700">{p.name}</span>
                  <span className={code}>{p.slug || p.id}</span>
                  {p.at ? <span className={`text-xs ${faint}`}>· ตอนนี้อยู่ที่ “{p.at}”</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PricelistReportPage() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [doneFilter, setDoneFilter] = useState<"all" | "todo" | "done">("all");
  /** โชว์เฉพาะบรรทัดที่สั่งให้พี่ปุ๋ยทำราคา */
  const [onlyPrice, setOnlyPrice] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  /** บรรทัดที่กำลังบันทึกติ๊กอยู่ (กันกดรัวซ้ำ) */
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/pricelist-report${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j as Report);
    } catch (e) {
      setError(`ดึงรายงานไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * ติ๊ก/ยกเลิกติ๊กช่องของบรรทัดหนึ่ง — เปลี่ยนบนจอทันที ถ้าบันทึกไม่ผ่านค่อยคืนค่าเดิม
   * field "done" = ทำแล้ว · "priceTask" = ให้พี่ปุ๋ยทำราคา
   */
  const toggleMark = useCallback(async (row: Row, field: "done" | "priceTask") => {
    const want = !row[field];
    setSaving((s) => new Set(s).add(row.key));
    const apply = (mark: DoneMark | null) =>
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((r) => (r.key === row.key ? { ...r, [field]: mark } : r));
        return {
          ...d,
          rows,
          sum: { ...d.sum, done: rows.filter((r) => r.done).length, priceTasks: rows.filter((r) => r.priceTask).length },
        };
      });
    apply(want ? { at: new Date().toISOString(), by: "กำลังบันทึก…" } : null);
    try {
      const r = await fetch("/api/admin/pricelist-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field === "done" ? { key: row.key, done: want } : { key: row.key, price: want }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      apply((j.mark as DoneMark | null) ?? null);
    } catch (e) {
      apply(row[field]); // บันทึกไม่ผ่าน — คืนค่าเดิม จะได้ไม่เข้าใจผิดว่าทำแล้ว
      setError(`บันทึกเช็กลิสต์ไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(row.key);
        return n;
      });
    }
  }, []);

  /** สินค้าในระบบทุกตัว (ที่จับคู่ไว้แล้ว + ที่ยังไม่เจอบนเว็บ) ไว้ให้ช่องค้นหาตอนย้าย */
  const allProducts = useMemo<PickItem[]>(() => {
    const m = new Map<string, PickItem>();
    for (const r of data?.rows ?? []) {
      for (const p of r.products) {
        m.set(p.id, { id: p.id, slug: p.slug, name: p.name, category: p.category, published: p.published, at: r.name });
      }
    }
    for (const p of data?.extras ?? []) {
      if (!m.has(p.id)) m.set(p.id, { id: p.id, slug: p.slug, name: p.name, category: p.category, published: p.published, at: "" });
    }
    return [...m.values()];
  }, [data]);

  /** ย้ายสินค้าไปบรรทัดอื่น / เอาออก / คืนค่าอัตโนมัติ แล้วโหลดรายงานใหม่ให้ตรงกัน */
  const assignProduct = useCallback(
    async (productId: string, key: string | null) => {
      setSaving((s) => new Set(s).add(productId));
      try {
        const r = await fetch("/api/admin/pricelist-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, key }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        await load();
      } catch (e) {
        setError(`ย้ายสินค้าไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSaving((s) => {
          const n = new Set(s);
          n.delete(productId);
          return n;
        });
      }
    },
    [load]
  );

  const cats = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.category))].filter(Boolean), [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (cat === "all" || r.category === cat) &&
        (doneFilter === "all" || (doneFilter === "done" ? !!r.done : !r.done)) &&
        (!onlyPrice || !!r.priceTask) &&
        (!q || r.name.toLowerCase().includes(q) || r.products.some((p) => p.name.toLowerCase().includes(q)))
    );
  }, [data, filter, cat, doneFilter, onlyPrice, query]);

  /** จัดกลุ่มตามหมวดบนเว็บ เรียงตามลำดับที่ปรากฏบนหน้าเว็บจริง */
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.category || "ไม่มีหัวข้อหมวด";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  const sum = data?.sum;

  return (
    <RequirePerm perm="products.view">
      <div className="space-y-5">
        {/* ── หัวหน้า ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={h1}>🔍 เทียบเว็บตารางราคากับระบบ</h1>
            <p className={`mt-1 text-sm ${muted}`}>
              ชื่อสินค้าทุกใบบนหน้าแรก{" "}
              <a
                href="https://www.iduckyofficial-pricelists.com/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-amber-600 hover:underline"
              >
                iduckyofficial-pricelists.com
              </a>{" "}
              เทียบกับสินค้าในระบบ — ตัวไหนเผยแพร่แล้ว ตัวไหนยังเป็นร่าง ตัวไหนยังไม่มี
            </p>
            {data ? (
              <p className={`mt-1 text-xs ${faint}`}>
                ดึงข้อมูลเมื่อ {new Date(data.fetchedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                {" · "}หน้าเว็บถูกแคชไว้ 30 นาที กด “ดึงใหม่” ถ้าเพิ่งแก้หน้าเว็บ
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnNeutral} onClick={() => downloadCsv(rows)} disabled={!rows.length}>
              ⬇ ดาวน์โหลด CSV
            </button>
            <button type="button" className={btnNeutral} onClick={() => void load(true)} disabled={loading}>
              {loading ? "กำลังดึง…" : "🔄 ดึงใหม่"}
            </button>
          </div>
        </div>

        {error ? (
          <div className={`${card} border-rose-200 bg-rose-50 p-4 text-sm text-rose-700`}>⚠ {error}</div>
        ) : null}

        {/* ── สรุป ── */}
        {sum ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              <Tile n={sum.cards} text="ชื่อบนเว็บตารางราคา" hint={`จาก ${sum.categories} หมวดบนหน้าแรก`} />
              <Tile n={sum.published} text="เผยแพร่แล้ว" tone="text-emerald-600" hint="ลูกค้าเห็นบนหน้าร้าน" />
              <Tile n={sum.draft} text="ฉบับร่าง" tone="text-orange-600" hint="มีในระบบ แต่ยังไม่เผยแพร่" />
              <Tile n={sum.missing} text="ยังไม่มีในระบบ" tone="text-rose-600" hint="ต้องนำเข้า/สร้างเพิ่ม" />
              <Tile n={sum.priceTasks} text="ให้พี่ปุ๋ยทำราคา" tone="text-sky-600" hint="สั่งงานไว้แล้ว" />
              <Tile
                n={sum.done}
                text="ติ๊กว่าทำแล้ว"
                tone="text-sky-600"
                hint={`เหลืออีก ${sum.cards - sum.done} รายการ`}
              />
              <Tile
                n={sum.adminTotal}
                text="สินค้าในระบบทั้งหมด"
                hint={`เผยแพร่ ${sum.adminPublished} · ร่าง ${sum.adminDraft} · จับคู่กับเว็บได้ ${sum.matched}`}
              />
            </div>

            {/* ── ตัวกรอง ── */}
            <div className={`${card} flex flex-wrap items-center gap-2 p-3`}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={filter === f.id ? pillActive : pillIdle}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="ml-1.5 opacity-60">
                    {f.id === "all" ? sum.cards : f.id === "published" ? sum.published : f.id === "draft" ? sum.draft : sum.missing}
                  </span>
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <button
                type="button"
                className={onlyPrice ? pillActive : pillIdle}
                onClick={() => setOnlyPrice((v) => !v)}
                title="โชว์เฉพาะบรรทัดที่สั่งให้พี่ปุ๋ยทำราคา"
              >
                พี่ปุ๋ยทำราคา<span className="ml-1.5 opacity-60">{sum.priceTasks}</span>
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              {([
                { id: "all", label: "เช็กลิสต์ทั้งหมด" },
                { id: "todo", label: "ยังไม่ทำ" },
                { id: "done", label: "ทำแล้ว" },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={doneFilter === f.id ? pillActive : pillIdle}
                  onClick={() => setDoneFilter(f.id)}
                >
                  {f.label}
                  {f.id !== "all" ? (
                    <span className="ml-1.5 opacity-60">{f.id === "done" ? sum.done : sum.cards - sum.done}</span>
                  ) : null}
                </button>
              ))}
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="all">ทุกหมวดบนเว็บ</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า…"
                className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </>
        ) : null}

        {loading && !data ? <p className={`${card} p-8 text-center text-sm ${muted}`}>กำลังอ่านหน้าเว็บตารางราคา…</p> : null}

        {/* ── ตารางรายชื่อ ── */}
        {data ? (
          <div className={`${card} overflow-hidden`}>
            {/* จอแคบให้เลื่อนตารางแนวนอนแทนการบีบคอลัมน์จนอ่านไม่ออก */}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <th className={`w-10 px-3 py-2 ${label}`} title="ติ๊กเมื่อจัดการชื่อนี้เรียบร้อยแล้ว">
                    ทำแล้ว
                  </th>
                  <th className={`w-14 px-3 py-2 ${label}`} title="ติ๊กเพื่อสั่งงานให้พี่ปุ๋ยทำราคาของชื่อนี้">
                    พี่ปุ๋ย
                    <br />
                    ทำราคา
                  </th>
                  <th className={`px-4 py-2 ${label}`}>ชื่อบนเว็บตารางราคา</th>
                  <th className={`px-4 py-2 ${label}`}>หน้าตารางราคา</th>
                  <th className={`px-4 py-2 ${label}`}>สถานะ</th>
                  <th className={`px-4 py-2 ${label}`}>สินค้าในระบบ</th>
                  <th className={`px-4 py-2 ${label}`}>จับคู่ด้วย</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([name, list]) => (
                  <Fragment key={name}>
                    <tr className="bg-amber-50/60">
                      <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-slate-600">
                        {name}
                        <span className={`ml-2 font-normal ${faint}`}>
                          {list.length} รายการ · ทำแล้ว {list.filter((r) => r.done).length}
                          {list.some((r) => r.priceTask) ? ` · พี่ปุ๋ยทำราคา ${list.filter((r) => r.priceTask).length}` : ""}
                        </span>
                      </td>
                    </tr>
                    {list.map((r) => (
                      <tr
                        key={r.key}
                        className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${r.done ? "bg-slate-50/40 text-slate-400" : ""}`}
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={!!r.done}
                            disabled={saving.size > 0}
                            onChange={() => void toggleMark(r, "done")}
                            title={r.done ? `ทำแล้วโดย ${r.done.by} · ${whenOf(r.done.at)}` : "ติ๊กเมื่อจัดการชื่อนี้เรียบร้อยแล้ว"}
                            className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:cursor-wait"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={!!r.priceTask}
                            disabled={saving.size > 0}
                            onChange={() => void toggleMark(r, "priceTask")}
                            title={
                              r.priceTask
                                ? `สั่งให้พี่ปุ๋ยทำราคาโดย ${r.priceTask.by} · ${whenOf(r.priceTask.at)}`
                                : "ติ๊กเพื่อสั่งงานให้พี่ปุ๋ยทำราคาของชื่อนี้"
                            }
                            className="h-4 w-4 cursor-pointer accent-sky-600 disabled:cursor-wait"
                          />
                        </td>
                        <td className={`px-4 py-2 align-top ${r.done ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"}`}>
                          {r.name}
                          {r.done ? (
                            <span className={`ml-2 text-[11px] ${faint} no-underline`}>
                              ✓ {r.done.by} · {whenOf(r.done.at)}
                            </span>
                          ) : null}
                          {r.priceTask ? (
                            <span className={`${badge} ml-2 bg-sky-50 text-sky-700 no-underline`} title={`สั่งโดย ${r.priceTask.by} · ${whenOf(r.priceTask.at)}`}>
                              พี่ปุ๋ยทำราคา
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 align-top">
                          {r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              title={decodeURIComponent(r.url)}
                              className="font-mono text-xs text-slate-500 hover:text-amber-600 hover:underline"
                            >
                              {linkName(r.url)} ↗
                            </a>
                          ) : (
                            <span className={`text-xs ${faint}`}>ไม่มีลิงก์</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <span className={`${badge} ${STATUS_STYLE[r.status]}`}>
                            {STATUS_EMOJI[r.status]} {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2 align-top">
                          <ProductCell
                            row={r}
                            all={allProducts}
                            busy={saving.size > 0}
                            onAssign={(id, key) => void assignProduct(id, key)}
                          />
                        </td>
                        <td className={`px-4 py-2 align-top text-xs ${faint}`}>{r.match ?? "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {!rows.length && !loading ? (
                  <tr>
                    <td colSpan={7} className={`px-4 py-10 text-center text-sm ${muted}`}>
                      ไม่มีรายการที่ตรงกับตัวกรอง
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}

        {/* ── สินค้าในระบบที่ไม่ได้อยู่บนหน้าแรกเว็บตารางราคา ── */}
        {data && data.extras.length ? (
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  มีในระบบ แต่ไม่เจอบนหน้าแรกเว็บตารางราคา — {data.extras.length} รายการ
                </p>
                <p className={`mt-0.5 text-xs ${faint}`}>
                  ส่วนใหญ่คือสินค้าที่ตั้งชื่อไม่เหมือนกัน หรือเป็นตัวที่มีเฉพาะในเว็บขาย
                </p>
              </div>
              <button type="button" className={btnSmNeutral} onClick={() => setShowExtras((v) => !v)}>
                {showExtras ? "ซ่อน" : "ดูรายชื่อ"}
              </button>
            </div>
            {showExtras ? (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.extras.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className={`${badge} ${p.published ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                      {p.published ? "เผยแพร่" : "ร่าง"}
                    </span>
                    <Link
                      href={editPath(p)}
                      target="_blank"
                      rel="noreferrer"
                      title="เปิดหน้าแก้ไขสินค้าในแท็บใหม่"
                      className="truncate text-slate-700 hover:text-amber-600 hover:underline"
                    >
                      {p.name} ↗
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </RequirePerm>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { badge, btnNeutral, btnSmNeutral, card, code, faint, h1, label, metric, muted, pillActive, pillIdle } from "@/lib/admin-ui";
import { persistProduct } from "@/lib/product-repo";
import { useCan } from "@/lib/perm-context";
import type { Product } from "@/lib/products";

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
  /** พี่ปุ๋ยกดปุ่ม "เสร็จแล้ว" ของงานทำราคาบรรทัดนี้ (null = ยังไม่เสร็จ) */
  priceDone: DoneMark | null;
  name: string;
  category: string;
  url: string;
  status: Status;
  match: string | null;
  /** true = บรรทัดที่ทีมงานพิมพ์เพิ่มเอง ไม่ได้มาจากหน้าเว็บ */
  custom: boolean;
  /** ชื่อเดิมบนเว็บ ถ้าทีมงานแก้ชื่อไว้ (null = ยังใช้ชื่อเดิม) */
  webName: string | null;
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

/** บรรทัดที่ลบออกจากรายงานไว้ (กู้คืนได้) */
interface HiddenRow {
  key: string;
  name: string;
  category: string;
  url: string;
  at: string;
  by: string;
  /** true = บรรทัดที่เพิ่มเอง (ลบถาวรได้) */
  custom?: boolean;
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
    priceDone: number;
    hidden: number;
    custom: number;
  };
  rows: Row[];
  hiddenRows: HiddenRow[];
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

/** เว็บตารางราคา — ใช้เติมโฮสต์ให้ลิงก์ที่วางมาแบบ "/griptok" */
const PRICELIST_SITE = "https://www.iduckyofficial-pricelists.com";

/**
 * ข้อความที่วาง/พิมพ์มา เป็นลิงก์ไหม — คืนลิงก์เต็มที่เก็บได้เลย (ไม่ใช่ลิงก์ = คืนค่าว่าง)
 * รับทั้ง https://… · www…. · และ path สั้น ๆ อย่าง "/griptok" ที่ก๊อปมาจากแถบที่อยู่
 */
const asLink = (raw: string): string => {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return ""; // มีเว้นวรรค = เป็นชื่อสินค้า ไม่ใช่ลิงก์
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).toString();
    if (/^www\./i.test(t)) return new URL(`https://${t}`).toString();
    if (t.startsWith("/")) return new URL(t, PRICELIST_SITE).toString();
  } catch {
    return "";
  }
  return "";
};

/** ชื่อตั้งต้นจากท้ายลิงก์ เช่น …/griptok → "griptok" (ว่าง = เอาชื่อจากลิงก์ไม่ได้) */
const nameFromLink = (url: string): string => {
  try {
    const last = decodeURIComponent(new URL(url).pathname).split("/").filter(Boolean).pop() ?? "";
    return last.replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
};

/** ลิงก์ 2 อันชี้หน้าเดียวกันไหม (ตัดโฮสต์/สแลชท้าย/ตัวพิมพ์ออก) */
const samePage = (a: string, b: string): boolean => {
  const path = (u: string) => {
    try {
      return decodeURIComponent(new URL(u).pathname).replace(/\/+$/, "").toLowerCase();
    } catch {
      return "";
    }
  };
  const pa = path(a);
  return !!pa && pa === path(b);
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

/** ลิงก์นี้ชี้ "สินค้าในระบบ" ไหม (หน้าร้าน /products/… หรือหลังบ้าน /admin/products/…) */
const isProductLink = (url: string): boolean => {
  try {
    return /\/(admin\/)?products\//i.test(new URL(url).pathname);
  } catch {
    return false;
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
      r.priceTask
        ? r.priceDone
          ? `ทำราคาเสร็จแล้ว · ${r.priceDone.by} · ${new Date(r.priceDone.at).toLocaleDateString("th-TH")}`
          : `ให้พี่ปุ๋ยทำราคา · สั่งโดย ${r.priceTask.by}`
        : "",
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
  onCreate,
}: {
  row: Row;
  all: PickItem[];
  busy: boolean;
  /** key = รหัสบรรทัดปลายทาง · "" = เอาออก · null = คืนค่าจับคู่อัตโนมัติ */
  onAssign: (productId: string, key: string | null) => void;
  /** สร้างสินค้าใหม่ในระบบจากชื่อบรรทัดนี้ (undefined = ไม่มีสิทธิ์แก้สินค้า → ไม่ต้องโชว์ปุ่ม) */
  onCreate?: () => void;
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
        {onCreate ? (
          // บรรทัดที่ยังไม่มีสินค้าเลย = งานที่ต้องทำจริง เน้นสีเขียว · บรรทัดที่มีแล้วเก็บไว้จาง ๆ กันรก
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            title={`สร้างสินค้าใหม่ในระบบชื่อ "${row.name}" (ฉบับร่าง หมวดอะคริลิค) แล้วผูกกับบรรทัดนี้ให้เลย — เข้าไปกรอกราคา/ตัวเลือกทีหลัง`}
            className={`font-semibold hover:underline disabled:cursor-wait disabled:opacity-50 ${
              row.products.length ? "text-slate-400 hover:text-emerald-600" : "text-emerald-600"
            }`}
          >
            🆕 {row.products.length ? "สร้างเพิ่ม" : "สร้างสินค้าในระบบ"}
          </button>
        ) : null}
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
  /** กรองงานพี่ปุ๋ยทำราคา — off = ไม่กรอง · all = ทุกงานที่สั่งไว้ · todo = ยังไม่เสร็จ · done = เสร็จแล้ว */
  const [priceFilter, setPriceFilter] = useState<"off" | "all" | "todo" | "done">("off");
  const [showExtras, setShowExtras] = useState(false);
  /** กางถังลบไหม */
  const [showTrash, setShowTrash] = useState(false);
  /** เปิดฟอร์ม "เพิ่มชื่อเอง" ไหม + ค่าที่พิมพ์ไว้ */
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ name: "", category: "", url: "" });
  /** ติ๊กไว้ = กดบันทึกแล้วสร้างสินค้าในระบบ (ฉบับร่าง) ผูกกับบรรทัดใหม่ให้เลย */
  const [addWithProduct, setAddWithProduct] = useState(true);
  /**
   * ลิงก์/รหัสสินค้าที่ "มีอยู่แล้ว" ในระบบ — ใส่ไว้ = ผูกตัวนั้นกับบรรทัดใหม่ แทนการสร้างตัวใหม่
   * รับทั้งลิงก์หน้าร้าน (/products/1-4) ลิงก์หลังบ้าน (/admin/products/1-4) รหัส และ slug
   */
  const [linkProduct, setLinkProduct] = useState("");
  /** บรรทัดที่กำลังแก้ชื่ออยู่ (null = ไม่ได้แก้อะไร) + ค่าที่พิมพ์ไว้ */
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editRow, setEditRow] = useState({ name: "", category: "", url: "" });
  /** บรรทัดที่กำลังบันทึกติ๊กอยู่ (กันกดรัวซ้ำ) */
  const [saving, setSaving] = useState<Set<string>>(new Set());
  /** ข้อความบอกผลหลังสร้างสินค้าใหม่ (ว่าง = ไม่มี) */
  const [created, setCreated] = useState("");
  // ฝ่ายที่ดูรายงานได้แต่แก้สินค้าไม่ได้ (products.view อย่างเดียว) ไม่ต้องเห็นปุ่มสร้าง
  const mayManage = useCan()("products.manage");

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
   * field "done" = ทำแล้ว · "priceTask" = ให้พี่ปุ๋ยทำราคา · "priceDone" = พี่ปุ๋ยทำราคาเสร็จแล้ว
   */
  const toggleMark = useCallback(async (row: Row, field: "done" | "priceTask" | "priceDone") => {
    const want = !row[field];
    setSaving((s) => new Set(s).add(row.key));
    const apply = (mark: DoneMark | null) =>
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((r) =>
          r.key === row.key
            ? // ยกเลิกคำสั่งงานทำราคา = "เสร็จแล้ว" ของบรรทัดนั้นหายไปด้วย (ตรงกับฝั่งเซิร์ฟเวอร์)
              { ...r, [field]: mark, ...(field === "priceTask" && !mark ? { priceDone: null } : null) }
            : r
        );
        return {
          ...d,
          rows,
          sum: {
            ...d.sum,
            done: rows.filter((r) => r.done).length,
            priceTasks: rows.filter((r) => r.priceTask).length,
            priceDone: rows.filter((r) => r.priceDone).length,
          },
        };
      });
    apply(want ? { at: new Date().toISOString(), by: "กำลังบันทึก…" } : null);
    try {
      const r = await fetch("/api/admin/pricelist-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          field === "done"
            ? { key: row.key, done: want }
            : field === "priceDone"
              ? { key: row.key, priceDone: want }
              : { key: row.key, price: want }
        ),
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

  /** ยิงคำสั่งไปเซิร์ฟเวอร์แล้วโหลดรายงานใหม่ — ใช้ร่วมกันทั้งลบ/เพิ่มชื่อ/แก้ชื่อ (การจับคู่เปลี่ยนตามชื่อ) */
  const send = useCallback(
    async (body: Record<string, unknown>, busyKey: string, what: string) => {
      setSaving((s) => new Set(s).add(busyKey));
      try {
        const r = await fetch("/api/admin/pricelist-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        await load();
        // คืนคำตอบจากเซิร์ฟเวอร์ (ไม่ใช่แค่ true/false) เพราะตอนเพิ่มบรรทัดต้องใช้ key ที่เพิ่งได้มาต่อ
        return j as { key?: string };
      } catch (e) {
        setError(`${what}ไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        setSaving((s) => {
          const n = new Set(s);
          n.delete(busyKey);
          return n;
        });
      }
    },
    [load]
  );

  /** ลบบรรทัดออกจากรายงาน / กู้คืน */
  const setHidden = useCallback(
    (key: string, hidden: boolean) => send({ key, hidden }, key, hidden ? "ลบรายการ" : "กู้คืนรายการ"),
    [send]
  );

  /**
   * สร้างสินค้าใหม่ในระบบจากชื่อบรรทัดนี้ แล้วผูกเข้ากับบรรทัดทันที
   *
   * ใช้กับบรรทัดที่ขึ้น "ยังไม่มีในระบบ" — เดิมต้องไปหน้าสินค้า กด ＋ เพิ่มสินค้า
   * พิมพ์ชื่อใหม่ แล้ววนกลับมาจับคู่เอง · สินค้าที่ได้เป็น "ฉบับร่าง" เสมอ
   * (หมวดตั้งเป็นอะคริลิคไว้ก่อนเหมือนปุ่มเพิ่มสินค้าปกติ — เข้าไปแก้ในหน้าแก้ไขได้)
   */
  const createProductFor = useCallback(
    async (key: string, rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      {
        const id = `new-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
        const blank: Product = {
          id,
          name,
          category: "acrylic",
          price: 0,
          emoji: "🦆",
          gradient: "from-sky-200 to-cyan-300",
          rating: 5,
          sold: 0,
          description: "",
          highlights: [],
          options: [],
          images: [{ emoji: "🦆", gradient: "from-sky-200 to-cyan-300", label: "ด้านหน้า" }],
          hidden: true, // ยังไม่มีราคา/รูป — ห้ามโผล่หน้าร้าน
        };
        const res = await persistProduct(blank);
        if (!res.ok) throw new Error(res.error ?? "บันทึกสินค้าไม่สำเร็จ");
        // ผูกกับบรรทัดนี้เอง ไม่ต้องรอให้ระบบเดาชื่อตรง (ชื่อบนเว็บกับในระบบมักไม่เหมือนกันเป๊ะ)
        const r = await fetch("/api/admin/pricelist-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: id, key }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      }
    },
    []
  );

  /**
   * วางลิงก์ลงช่องไหนก็ได้ในฟอร์มเพิ่มชื่อ — ระบบย้ายไปช่อง "ลิงก์" ให้เอง
   * แล้วเติมหมวดจากบรรทัดอื่นที่ใช้ลิงก์หน้าเดียวกัน (เช่น วาง /griptok ได้หมวดของหน้านั้น)
   * และตั้งชื่อตั้งต้นจากท้ายลิงก์ให้ ถ้ายังไม่ได้พิมพ์ชื่อไว้
   */
  const fillFromLink = useCallback(
    (link: string) => {
      // วางลิงก์สินค้าในระบบมา = คนละความหมายกับลิงก์หน้าตารางราคา → ลงช่อง "สินค้าที่มีอยู่แล้ว"
      if (isProductLink(link)) {
        setLinkProduct(link);
        return;
      }
      setNewRow((r) => {
        const hit = (data?.rows ?? []).find((x) => x.url && samePage(x.url, link));
        return {
          name: r.name.trim() || nameFromLink(link),
          category: r.category.trim() || hit?.category || "",
          url: link,
        };
      });
    },
    [data]
  );

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

  /** เพิ่มบรรทัดชื่อเอง — ชื่อที่ยังไม่มีบนหน้าเว็บตารางราคา */
  /**
   * สินค้าในระบบที่ตรงกับลิงก์/รหัสในช่อง "สินค้าที่มีอยู่แล้ว" (undefined = ยังไม่ได้กรอก/หาไม่เจอ)
   * รับได้ทั้งลิงก์เต็ม ลิงก์สั้น รหัสสินค้า และ slug — ตัดเอาท่อนท้ายมาเทียบเหมือนช่องย้ายสินค้า
   */
  const linkedProduct = useMemo(() => {
    const t = pickKey(linkProduct);
    if (!t) return undefined;
    return allProducts.find((p) => p.id.toLowerCase() === t || p.slug.toLowerCase() === t);
  }, [linkProduct, allProducts]);

  const addRow = useCallback(async () => {
    const name = newRow.name.trim();
    if (!name) return;
    setCreated("");
    // เก็บลิงก์ให้เป็นรูปแบบเดียวกับบรรทัดที่มาจากเว็บเสมอ (วาง "/griptok" มาก็เติมโฮสต์ให้)
    // แล้วเดาหมวดจากบรรทัดอื่นที่ใช้ลิงก์หน้าเดียวกัน ถ้ายังไม่ได้ใส่หมวด
    const link = asLink(newRow.url) || newRow.url.trim();
    const category =
      newRow.category.trim() ||
      (link ? ((data?.rows ?? []).find((x) => x.url && samePage(x.url, link))?.category ?? "") : "");
    // กรอกช่อง "สินค้าที่มีอยู่แล้ว" มาแต่หาไม่เจอ = หยุดก่อน ไม่งั้นได้บรรทัดที่ไม่ได้ผูกอะไรเลย
    if (linkProduct.trim() && !linkedProduct) {
      setError(`ไม่พบสินค้าในระบบจาก “${linkProduct.trim()}” — ใส่ลิงก์หน้าสินค้า ลิงก์หน้าแก้ไข รหัสสินค้า หรือ slug`);
      return;
    }
    const added = await send({ add: { name, category, url: link } }, "__add__", "เพิ่มชื่อ");
    if (!added?.key) return;
    const picked = linkedProduct;
    setNewRow({ name: "", category: "", url: "" });
    setLinkProduct("");
    setAdding(false);
    setSaving((s) => new Set(s).add("__add__"));
    try {
      if (picked) {
        // ผูกสินค้าที่มีอยู่แล้วเข้ากับบรรทัดใหม่ (ไม่สร้างตัวใหม่ ถึงจะติ๊ก 🆕 ไว้ก็ตาม)
        const r = await fetch("/api/admin/pricelist-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: picked.id, key: added.key }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        await load();
        setCreated(`เพิ่ม “${name}” เข้ารายงาน และผูกกับสินค้าที่มีอยู่แล้ว “${picked.name}” ให้เรียบร้อย`);
      } else if (mayManage && addWithProduct) {
        // ติ๊ก "สร้างสินค้าในระบบให้ด้วย" ไว้ = ได้ทั้งบรรทัดในรายงานและสินค้าฉบับร่างที่ผูกกันแล้วในกดเดียว
        await createProductFor(added.key, name);
        await load();
        setCreated(`เพิ่ม “${name}” เข้ารายงาน และสร้างสินค้าฉบับร่างชื่อเดียวกันให้แล้ว — กดชื่อในช่อง “สินค้าในระบบ” เพื่อไปกรอกราคา/ตัวเลือก/รูป`);
      }
    } catch (e) {
      setError(`เพิ่มชื่อแล้ว แต่ผูก/สร้างสินค้าไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete("__add__");
        return n;
      });
    }
  }, [newRow, send, mayManage, addWithProduct, createProductFor, load, data, linkProduct, linkedProduct]);

  /** บันทึกชื่อที่แก้ — บรรทัดจากเว็บแก้ได้เฉพาะชื่อ · บรรทัดที่เพิ่มเองแก้หมวด/ลิงก์ได้ด้วย */
  const saveEdit = useCallback(
    async (row: Row) => {
      const name = editRow.name.trim();
      if (row.custom && !name) return;
      const edit = row.custom ? { name, category: editRow.category, url: editRow.url } : { name };
      if (await send({ key: row.key, edit }, row.key, "แก้ชื่อ")) setEditKey(null);
    },
    [editRow, send]
  );

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

  /** ปุ่ม "🆕 สร้างสินค้าในระบบ" ของบรรทัดหนึ่ง — สร้าง + ผูก + โหลดรายงานใหม่ */
  const createProduct = useCallback(
    async (row: Row) => {
      if (saving.has(row.key)) return;
      setSaving((s) => new Set(s).add(row.key));
      setError("");
      setCreated("");
      try {
        await createProductFor(row.key, row.name);
        await load();
        setCreated(`สร้าง “${row.name.trim()}” เป็นฉบับร่างแล้ว — กดชื่อในช่อง “สินค้าในระบบ” เพื่อไปกรอกราคา/ตัวเลือก/รูป`);
      } catch (e) {
        setError(`สร้างสินค้าไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSaving((s) => {
          const n = new Set(s);
          n.delete(row.key);
          return n;
        });
      }
    },
    [createProductFor, load, saving]
  );

  const cats = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.category))].filter(Boolean), [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (cat === "all" || r.category === cat) &&
        (doneFilter === "all" || (doneFilter === "done" ? !!r.done : !r.done)) &&
        (priceFilter === "off" ||
          (priceFilter === "all"
            ? !!r.priceTask
            : priceFilter === "todo"
              ? !!r.priceTask && !r.priceDone
              : !!r.priceDone)) &&
        // ค้นด้วยชื่อเดิมบนเว็บก็เจอ ถึงจะแก้ชื่อไปแล้ว
        (!q ||
          r.name.toLowerCase().includes(q) ||
          (r.webName ?? "").toLowerCase().includes(q) ||
          r.products.some((p) => p.name.toLowerCase().includes(q)))
    );
  }, [data, filter, cat, doneFilter, priceFilter, query]);

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
            <button
              type="button"
              className={btnNeutral}
              onClick={() => setAdding((v) => !v)}
              title="เพิ่มชื่อที่ยังไม่มีบนหน้าเว็บตารางราคาเข้ามาในรายงานเอง"
            >
              ➕ เพิ่มชื่อ
            </button>
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

        {created ? (
          <div className={`${card} flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800`}>
            <span className="flex-1">✓ {created}</span>
            <button
              type="button"
              onClick={() => setCreated("")}
              className="shrink-0 rounded px-1.5 text-emerald-500 transition hover:bg-emerald-100 hover:text-emerald-700"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* ── สรุป ── */}
        {sum ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              <Tile
                n={sum.cards}
                text="ชื่อบนเว็บตารางราคา"
                hint={`จาก ${sum.categories} หมวดบนหน้าแรก${sum.custom ? ` · เพิ่มเอง ${sum.custom}` : ""}`}
              />
              <Tile n={sum.published} text="เผยแพร่แล้ว" tone="text-emerald-600" hint="ลูกค้าเห็นบนหน้าร้าน" />
              <Tile n={sum.draft} text="ฉบับร่าง" tone="text-orange-600" hint="มีในระบบ แต่ยังไม่เผยแพร่" />
              <Tile n={sum.missing} text="ยังไม่มีในระบบ" tone="text-rose-600" hint="ต้องนำเข้า/สร้างเพิ่ม" />
              <Tile
                n={sum.priceTasks}
                text="ให้พี่ปุ๋ยทำราคา"
                tone="text-sky-600"
                hint={`เสร็จแล้ว ${sum.priceDone} · ยังไม่เสร็จ ${sum.priceTasks - sum.priceDone}`}
              />
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
              {([
                { id: "all", label: "พี่ปุ๋ยทำราคา", n: sum.priceTasks, title: "โชว์เฉพาะบรรทัดที่สั่งให้พี่ปุ๋ยทำราคา" },
                { id: "todo", label: "รอทำราคา", n: sum.priceTasks - sum.priceDone, title: "สั่งไว้แล้วแต่ยังไม่กดเสร็จแล้ว" },
                { id: "done", label: "ทำราคาเสร็จแล้ว", n: sum.priceDone, title: "กดปุ่มเสร็จแล้วไว้" },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={priceFilter === f.id ? pillActive : pillIdle}
                  onClick={() => setPriceFilter((v) => (v === f.id ? "off" : f.id))}
                  title={f.title}
                >
                  {f.label}
                  <span className="ml-1.5 opacity-60">{f.n}</span>
                </button>
              ))}
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

        {/* ── ฟอร์มเพิ่มชื่อเอง ── */}
        {adding ? (
          <div className={`${card} space-y-3 p-4`}>
            <div>
              <p className="text-sm font-semibold text-slate-800">➕ เพิ่มชื่อเข้ารายงานเอง</p>
              <p className={`mt-0.5 text-xs ${faint}`}>
                สำหรับชื่อที่ยังไม่มีบนหน้าเว็บตารางราคา — เพิ่มแล้วติ๊กทำแล้ว สั่งพี่ปุ๋ยทำราคา และจับคู่สินค้าในระบบได้เหมือนบรรทัดอื่น
                {mayManage ? " · ติ๊ก 🆕 ไว้ = สร้างสินค้าในระบบให้พร้อมกันเลย" : ""}
                {" · วางลิงก์ช่องไหนก็ได้ ระบบแยกให้เองว่าเป็นลิงก์หน้าตารางราคาหรือลิงก์สินค้าในระบบ"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newRow.name}
                onChange={(e) => {
                  const link = asLink(e.target.value);
                  if (link) fillFromLink(link); // วางลิงก์ผิดช่อง — ย้ายให้เอง ไม่ต้องตัดวางใหม่
                  else setNewRow((v) => ({ ...v, name: e.target.value }));
                }}
                onKeyDown={(e) => e.key === "Enter" && void addRow()}
                autoFocus
                placeholder="ชื่อสินค้า (จำเป็น) · วางลิงก์ตรงนี้ก็ได้"
                className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
              />
              <input
                value={newRow.category}
                onChange={(e) => {
                  const link = asLink(e.target.value);
                  if (link) fillFromLink(link);
                  else setNewRow((v) => ({ ...v, category: e.target.value }));
                }}
                onKeyDown={(e) => e.key === "Enter" && void addRow()}
                list="pricelist-cats"
                placeholder="หมวด (ว่างไว้ = เพิ่มเอง)"
                className="w-52 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
              />
              <datalist id="pricelist-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                value={newRow.url}
                onChange={(e) => setNewRow((v) => ({ ...v, url: e.target.value }))}
                onBlur={() => {
                  // วางเสร็จ/ออกจากช่อง = เติมโฮสต์ให้ลิงก์สั้น แล้วเดาหมวด+ชื่อจากลิงก์ให้ถ้ายังว่าง
                  const link = asLink(newRow.url);
                  if (link) fillFromLink(link);
                }}
                onKeyDown={(e) => e.key === "Enter" && void addRow()}
                placeholder="ลิงก์หน้าตารางราคา (ถ้ามี) เช่น /griptok"
                className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
              />
              <input
                value={linkProduct}
                onChange={(e) => setLinkProduct(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addRow()}
                placeholder="สินค้าที่มีในระบบแล้ว — วางลิงก์ / รหัส / slug"
                title="ผูกบรรทัดใหม่กับสินค้าที่มีอยู่แล้ว แทนการสร้างตัวใหม่ — รับทั้งลิงก์หน้าร้าน (/products/1-4) ลิงก์หลังบ้าน (/admin/products/1-4) รหัสสินค้า และ slug"
                className={`w-72 rounded-lg border bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 ${
                  !linkProduct.trim() ? "border-slate-200" : linkedProduct ? "border-emerald-300" : "border-rose-300"
                }`}
              />
              {linkProduct.trim() ? (
                <span className={`text-xs font-semibold ${linkedProduct ? "text-emerald-600" : "text-rose-500"}`}>
                  {linkedProduct ? `✓ ${linkedProduct.name}` : "ไม่พบสินค้านี้ในระบบ"}
                </span>
              ) : null}
              {mayManage && !linkedProduct ? (
                <label
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                  title="สร้างสินค้าในระบบชื่อเดียวกัน (ฉบับร่าง หมวดอะคริลิค) แล้วผูกกับบรรทัดใหม่ให้เลย"
                >
                  <input
                    type="checkbox"
                    checked={addWithProduct}
                    onChange={(e) => setAddWithProduct(e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  🆕 สร้างสินค้าในระบบให้ด้วย
                </label>
              ) : null}
              <button
                type="button"
                className={btnSmNeutral}
                disabled={!newRow.name.trim() || saving.size > 0}
                onClick={() => void addRow()}
              >
                บันทึก
              </button>
              <button
                type="button"
                className={`text-xs ${muted} hover:underline`}
                onClick={() => {
                  setAdding(false);
                  setLinkProduct("");
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
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
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([name, list]) => (
                  <Fragment key={name}>
                    <tr className="bg-amber-50/60">
                      <td colSpan={8} className="px-4 py-1.5 text-xs font-semibold text-slate-600">
                        {name}
                        <span className={`ml-2 font-normal ${faint}`}>
                          {list.length} รายการ · ทำแล้ว {list.filter((r) => r.done).length}
                          {list.some((r) => r.priceTask)
                            ? ` · พี่ปุ๋ยทำราคา ${list.filter((r) => r.priceTask).length} (เสร็จแล้ว ${list.filter((r) => r.priceDone).length})`
                            : ""}
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
                          {editKey === r.key ? (
                            <span className="flex flex-wrap items-center gap-1.5 no-underline">
                              <input
                                value={editRow.name}
                                onChange={(e) => setEditRow((v) => ({ ...v, name: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveEdit(r);
                                  if (e.key === "Escape") setEditKey(null);
                                }}
                                autoFocus
                                placeholder="ชื่อบนเว็บตารางราคา"
                                className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                              />
                              {r.custom ? (
                                <>
                                  <input
                                    value={editRow.category}
                                    onChange={(e) => setEditRow((v) => ({ ...v, category: e.target.value }))}
                                    list="pricelist-cats"
                                    placeholder="หมวด"
                                    className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                                  />
                                  <input
                                    value={editRow.url}
                                    onChange={(e) => setEditRow((v) => ({ ...v, url: e.target.value }))}
                                    placeholder="ลิงก์ (ถ้ามี)"
                                    className="w-48 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                                  />
                                </>
                              ) : null}
                              <button
                                type="button"
                                disabled={saving.size > 0 || (r.custom && !editRow.name.trim())}
                                onClick={() => void saveEdit(r)}
                                className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50"
                              >
                                บันทึก
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditKey(null)}
                                className={`text-[11px] ${muted} hover:underline`}
                              >
                                ยกเลิก
                              </button>
                              {!r.custom && r.webName ? (
                                <button
                                  type="button"
                                  disabled={saving.size > 0}
                                  onClick={async () => {
                                    if (await send({ key: r.key, edit: { name: "" } }, r.key, "คืนชื่อเดิม")) setEditKey(null);
                                  }}
                                  title={`คืนชื่อเดิมจากเว็บ — ${r.webName}`}
                                  className="text-[11px] font-semibold text-amber-600 hover:underline disabled:cursor-wait"
                                >
                                  คืนชื่อเดิม
                                </button>
                              ) : null}
                            </span>
                          ) : (
                            <>
                          {r.name}
                          {r.custom ? (
                            <span className={`ml-2 ${badge} bg-violet-50 text-violet-700 no-underline`} title="บรรทัดที่ทีมงานเพิ่มเอง ไม่ได้มาจากหน้าเว็บตารางราคา">
                              เพิ่มเอง
                            </span>
                          ) : null}
                          {r.webName ? (
                            <span className={`ml-2 text-[11px] ${faint} no-underline`} title="ชื่อเดิมบนหน้าเว็บตารางราคา">
                              (เว็บ: {r.webName})
                            </span>
                          ) : null}
                          {r.done ? (
                            <span className={`ml-2 text-[11px] ${faint} no-underline`}>
                              ✓ {r.done.by} · {whenOf(r.done.at)}
                            </span>
                          ) : null}
                          {r.priceTask ? (
                            <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
                              <span
                                className={`${badge} no-underline ${
                                  r.priceDone ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
                                }`}
                                title={`สั่งโดย ${r.priceTask.by} · ${whenOf(r.priceTask.at)}`}
                              >
                                {r.priceDone ? "✓ ทำราคาเสร็จแล้ว" : "พี่ปุ๋ยทำราคา"}
                              </span>
                              {/* ปุ่มให้พี่ปุ๋ยกดเองเมื่อทำราคาชื่อนี้เสร็จ — กดซ้ำเพื่อยกเลิก */}
                              <button
                                type="button"
                                disabled={saving.size > 0}
                                onClick={() => void toggleMark(r, "priceDone")}
                                title={
                                  r.priceDone
                                    ? `เสร็จแล้วโดย ${r.priceDone.by} · ${whenOf(r.priceDone.at)} — กดเพื่อยกเลิก`
                                    : "กดเมื่อทำราคาของชื่อนี้เสร็จแล้ว"
                                }
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold no-underline transition disabled:cursor-wait ${
                                  r.priceDone
                                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                    : "bg-white text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-50"
                                }`}
                              >
                                {r.priceDone ? "✓ เสร็จแล้ว" : "เสร็จแล้ว"}
                              </button>
                              {r.priceDone ? (
                                <span className={`text-[11px] ${faint} no-underline`}>
                                  {r.priceDone.by} · {whenOf(r.priceDone.at)}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                            </>
                          )}
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
                            onCreate={mayManage ? () => void createProduct(r) : undefined}
                          />
                        </td>
                        <td className={`px-4 py-2 align-top text-xs ${faint}`}>{r.match ?? "—"}</td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">
                          <button
                            type="button"
                            disabled={saving.size > 0}
                            onClick={() => {
                              setEditKey(r.key);
                              setEditRow({ name: r.name, category: r.category, url: r.url });
                            }}
                            title="แก้ชื่อบนเว็บตารางราคาของบรรทัดนี้"
                            className="rounded px-1.5 py-0.5 text-sm text-slate-300 transition hover:bg-amber-50 hover:text-amber-600 disabled:cursor-wait"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            disabled={saving.size > 0}
                            onClick={() => void setHidden(r.key, true)}
                            title="ลบบรรทัดนี้ออกจากรายงาน (ไม่ใช่สินค้าจริง) — กู้คืนได้จากถังลบท้ายหน้า"
                            className="rounded px-1.5 py-0.5 text-sm text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {!rows.length && !loading ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-10 text-center text-sm ${muted}`}>
                      ไม่มีรายการที่ตรงกับตัวกรอง
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}

        {/* ── ถังลบ: บรรทัดที่ลบออกจากรายงาน (กู้คืนได้) ── */}
        {data && data.hiddenRows.length ? (
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  🗑 ลบออกจากรายงานไว้ — {data.hiddenRows.length} รายการ
                </p>
                <p className={`mt-0.5 text-xs ${faint}`}>
                  ไม่ถูกนับในสถิติด้านบน · ไม่ได้ลบอะไรบนเว็บหรือในระบบจริง กดกู้คืนกลับมาได้ทุกเมื่อ
                </p>
              </div>
              <button type="button" className={btnSmNeutral} onClick={() => setShowTrash((v) => !v)}>
                {showTrash ? "ซ่อน" : "ดูรายชื่อ"}
              </button>
            </div>
            {showTrash ? (
              <ul className="mt-3 space-y-1">
                {data.hiddenRows.map((h) => (
                  <li key={h.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">{h.name}</span>
                    <span className={`text-xs ${faint}`}>
                      {h.category ? `หมวด ${h.category} · ` : ""}ลบโดย {h.by} · {whenOf(h.at)}
                    </span>
                    <button
                      type="button"
                      disabled={saving.size > 0}
                      onClick={() => void setHidden(h.key, false)}
                      className="ml-auto text-xs font-semibold text-amber-600 hover:underline disabled:cursor-wait"
                    >
                      กู้คืน
                    </button>
                    {h.custom ? (
                      <button
                        type="button"
                        disabled={saving.size > 0}
                        onClick={() => {
                          if (confirm(`ลบ "${h.name}" ทิ้งถาวร? (เป็นบรรทัดที่เพิ่มเอง กู้คืนไม่ได้อีก)`))
                            void send({ key: h.key, remove: true }, h.key, "ลบถาวร");
                        }}
                        className="text-xs font-semibold text-rose-600 hover:underline disabled:cursor-wait"
                      >
                        ลบถาวร
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
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

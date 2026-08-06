"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductVisual from "@/components/ProductVisual";
import {
  CATEGORIES,
  formatPrice,
  formatPriceRange,
  getCategory,
  priceRange,
  productPath,
  PRODUCTS,
  type CategoryId,
  type Product,
  BULK_ASK_DEFAULT,
} from "@/lib/products";
import { loadOverrides, resetAll } from "@/lib/product-store";
import { deleteProductDb, fetchProductRaw, fetchProducts, persistProduct } from "@/lib/product-repo";
import { getAdminSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { badge, btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";

type ViewMode = "table" | "cards";
type SortMode = "default" | "price-asc" | "price-desc" | "sold-desc";
type ReviewFilter = "all" | "checked" | "unchecked";

/** ป้ายวันที่ตรวจแบบสั้น เช่น "21 ก.ค." */
function reviewedTitle(p: Product): string {
  if (!p.reviewed) return "";
  const d = new Date(p.reviewed.at);
  const when = isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return `ตรวจแล้วโดย ${p.reviewed.by}${when ? ` · ${when}` : ""}`;
}

const SORTS: { id: SortMode; label: string }[] = [
  { id: "default", label: "ตามหมวด" },
  { id: "price-asc", label: "ราคาต่ำ→สูง" },
  { id: "price-desc", label: "ราคาสูง→ต่ำ" },
  { id: "sold-desc", label: "ขายดีสุด" },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [overriddenIds, setOverriddenIds] = useState<Set<string>>(new Set());

  // ── สถานะมุมมอง/ตัวกรอง ──
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<CategoryId | "all">("all");
  const [sort, setSort] = useState<SortMode>("default");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  // ชื่อผู้ตรวจ (คนที่ล็อกอินอยู่) — โหมดเดโมที่ไม่มีชื่อใช้ "ทีมงาน"
  const [reviewer, setReviewer] = useState("ทีมงาน");
  const [creating, setCreating] = useState(false);
  const mayManage = useCan()("products.manage"); // ฝ่ายแอดมินดูได้อย่างเดียว
  const router = useRouter();

  /** สร้างสินค้าใหม่เปล่า → บันทึกลงฐานข้อมูล → เด้งเข้าหน้าแก้ไขให้กรอกข้อมูล */
  async function createProduct() {
    setCreating(true);
    const id = `new-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    const blank: Product = {
      id,
      name: "สินค้าใหม่",
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
    };
    const res = await persistProduct(blank);
    if (res.ok) {
      router.push(`/admin/products/${id}`);
    } else {
      setCreating(false);
      alert(`สร้างสินค้าไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
    }
  }

  async function refresh() {
    setProducts(await fetchProducts());
    // ป้าย "แก้ไขแล้ว" ใช้เฉพาะโหมดเดโม (localStorage)
    setOverriddenIds(isSupabaseConfigured ? new Set() : new Set(Object.keys(loadOverrides())));
  }

  useEffect(() => {
    refresh();
    getAdminSession().then((s) => s.name && setReviewer(s.name));
  }, []);

  /** สลับสถานะ "ตรวจแล้ว" ของสินค้า — บันทึกทันที (ไม่ต้องเปิดหน้าแก้ไข) */
  async function toggleReview(p: Product) {
    const reviewed = p.reviewed ? undefined : { by: reviewer, at: new Date().toISOString() };
    // อัปเดตหน้าจอทันที (optimistic) แล้วเขียนลงฐานข้อมูลด้วยข้อมูลดิบ (กันทับตัวเลือกที่ลิงก์คลัง)
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, reviewed } : x)));
    const raw = (await fetchProductRaw(p.id)) ?? p;
    const res = await persistProduct({ ...raw, reviewed });
    if (!res.ok) refresh(); // ล้มเหลว → ดึงสถานะจริงกลับมา
  }

  /** ตั้ง "สั่งกี่ชิ้นถึงต้องถามสต๊อก" ของสินค้าตัวนี้ — บันทึกทันที (ค่าว่าง/0 = ใช้ค่ากลาง) */
  async function setBulkAsk(p: Product, value: string) {
    const n = Math.floor(Number(value) || 0);
    const bulkAskQty = n > 0 ? n : undefined;
    if ((p.bulkAskQty ?? 0) === (bulkAskQty ?? 0)) return; // ไม่เปลี่ยน → ไม่ต้องเขียน
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, bulkAskQty } : x)));
    const raw = (await fetchProductRaw(p.id)) ?? p;
    const res = await persistProduct({ ...raw, bulkAskQty });
    if (!res.ok) refresh();
  }

  // จำมุมมองที่เลือกไว้ในเบราว์เซอร์
  useEffect(() => {
    const saved = localStorage.getItem("admin.products.view");
    if (saved === "cards" || saved === "table") setView(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("admin.products.view", view);
  }, [view]);

  async function remove(id: string) {
    await deleteProductDb(id);
    refresh();
  }

  function handleResetAll() {
    resetAll();
    refresh();
  }

  // จำนวนต่อหมวด (จากทั้งหมด ไม่ขึ้นกับตัวกรอง) สำหรับ chip
  const catCounts = useMemo(() => {
    const m = new Map<CategoryId, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

  // สรุปตัวเลขภาพรวม
  const totalSold = useMemo(() => products.reduce((s, p) => s + p.sold, 0), [products]);
  const reviewedCount = useMemo(() => products.filter((p) => p.reviewed).length, [products]);

  // กรอง + ค้นหา
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (reviewFilter === "checked" && !p.reviewed) return false;
      if (reviewFilter === "unchecked" && p.reviewed) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, catFilter, reviewFilter, query]);

  // เรียงลำดับ
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "price-asc") arr.sort((a, b) => priceRange(a).min - priceRange(b).min);
    else if (sort === "price-desc") arr.sort((a, b) => priceRange(b).min - priceRange(a).min);
    else if (sort === "sold-desc") arr.sort((a, b) => b.sold - a.sold);
    return arr;
  }, [filtered, sort]);

  // จัดกลุ่มตามหมวดเฉพาะเมื่อดูทั้งหมด + เรียงตามหมวด
  const grouped = catFilter === "all" && sort === "default";

  return (
    <div className="mx-auto max-w-6xl">
      {/* หัวเรื่อง + ปุ่มหลัก */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>
            สินค้า <span className="font-medium text-slate-400">({products.length})</span>
          </h1>
          <p className={`mt-1 ${muted}`}>
            ค้นหา กรอง และแก้ไขสินค้าได้ในหน้าเดียว — การแก้ไขบันทึกลงฐานข้อมูลและหน้าร้านแสดงตามที่แก้
          </p>
        </div>
        <div className="flex gap-2">
          {!mayManage && (
            <span className="self-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
              👁 ดูอย่างเดียว
            </span>
          )}
          {mayManage && !isSupabaseConfigured && (
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
              title="ลบการแก้ไขทั้งหมด กลับเป็นข้อมูลตั้งต้น"
            >
              ↩ รีเซ็ตทั้งหมด
            </button>
          )}
          {mayManage && (
            <button
              type="button"
              onClick={createProduct}
              disabled={creating}
              title="สร้างสินค้าใหม่เปล่า แล้วไปหน้าแก้ไข"
              className={btnPrimary}
            >
              {creating ? "กำลังสร้าง…" : "＋ เพิ่มสินค้า"}
            </button>
          )}
        </div>
      </div>

      {/* แถบสรุปภาพรวม */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="สินค้าทั้งหมด" value={products.length.toString()} />
        <StatTile
          label="ตรวจแล้ว"
          value={`${reviewedCount}/${products.length}`}
          accent={reviewedCount > 0}
        />
        <StatTile label="หมวดหมู่" value={catCounts.size.toString()} />
        <StatTile label="ยอดขายรวม" value={totalSold.toLocaleString("th-TH")} />
      </div>

      {/* แถบเครื่องมือ: ค้นหา + เรียง + สลับมุมมอง */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-amber-400"
          aria-label="เรียงลำดับ"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="กรองสถานะตรวจสอบ">
          {([
            ["all", "ทั้งหมด"],
            ["unchecked", "⬜ ยังไม่ตรวจ"],
            ["checked", "✓ ตรวจแล้ว"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setReviewFilter(id)}
              aria-pressed={reviewFilter === id}
              className={`px-3 py-2 text-xs font-semibold transition ${
                reviewFilter === id
                  ? id === "checked"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            title="มุมมองตาราง"
            className={`px-3 py-2 text-sm transition ${
              view === "table" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            ☰
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
            title="มุมมองการ์ด"
            className={`px-3 py-2 text-sm transition ${
              view === "cards" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            ▦
          </button>
        </div>
      </div>

      {/* chip กรองหมวด */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <FilterChip
          active={catFilter === "all"}
          onClick={() => setCatFilter("all")}
          label="ทั้งหมด"
          count={products.length}
        />
        {CATEGORIES.filter((c) => (catCounts.get(c.id) ?? 0) > 0).map((c) => (
          <FilterChip
            key={c.id}
            active={catFilter === c.id}
            onClick={() => setCatFilter(c.id)}
            label={`${c.emoji} ${c.name}`}
            count={catCounts.get(c.id) ?? 0}
          />
        ))}
      </div>

      {/* คำอธิบายช่องตั้งค่าในแถว — บอกครั้งเดียวใช้ได้ทั้งหน้า */}
      {view === "table" && sorted.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 ring-1 ring-slate-200">
          <span className="rounded-md bg-white px-1.5 py-0.5 font-bold text-slate-600 ring-1 ring-slate-200">📦 สั่งเยอะ ≥</span>
          <span>
            = <strong className="text-slate-700">จำนวนที่ลูกค้าสั่งแล้วต้องเช็คสต๊อกก่อน</strong> — สั่งถึงจำนวนนี้ หน้าสินค้าจะขึ้นเตือนให้ทักแอดมินเช็คของ/คิวผลิต
            และออเดอร์จะติดธง &ldquo;รอเช็คสต๊อก&rdquo; ให้ทีมยืนยันจำนวนก่อนเริ่มงาน (ลูกค้ายังกดสั่งได้ตามปกติ)
          </span>
          <span className="text-slate-400">· เว้นว่าง = ใช้ค่ากลาง {BULK_ASK_DEFAULT} ชิ้น · แก้ในช่องแล้วบันทึกทันที</span>
        </p>
      )}

      {/* ผลลัพธ์ */}
      {sorted.length === 0 ? (
        <div className={`mt-5 p-10 text-center text-sm ${muted} ${card}`}>
          ไม่พบสินค้าที่ตรงกับ “{query}”
        </div>
      ) : view === "cards" ? (
        <CardGrid
          items={sorted}
          overriddenIds={overriddenIds}
          onRemove={remove}
          onToggleReview={toggleReview}
        />
      ) : grouped ? (
        <div className="mt-5 space-y-6">
          {CATEGORIES.map((c) => {
            const inCat = sorted.filter((p) => p.category === c.id);
            if (inCat.length === 0) return null;
            return (
              <section key={c.id}>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="text-sm">{c.emoji}</span> {c.name}
                  <span className="font-normal normal-case text-slate-300">· {inCat.length} รายการ</span>
                </h2>
                <TableList items={inCat} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onBulkAsk={setBulkAsk} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <TableList items={sorted} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onBulkAsk={setBulkAsk} />
        </div>
      )}
    </div>
  );
}

/* ── ชิ้นส่วนย่อย ─────────────────────────────────────────── */

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${accent ? "text-sky-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label} <span className={active ? "opacity-70" : "text-slate-400"}>{count}</span>
    </button>
  );
}

function PriceBlock({ p }: { p: Product }) {
  const range = priceRange(p);
  return (
    <div className="text-right">
      <span className="text-sm font-bold text-slate-900">{formatPriceRange(p)}</span>
      {range.max > range.min ? (
        <span className={`block text-[10px] ${faint}`}>
          ตั้งต้น {formatPrice(p.price)}
          {p.oldPrice ? ` · ก่อนลด ${formatPrice(p.oldPrice)}` : ""}
        </span>
      ) : (
        p.oldPrice && <span className={`ml-1 text-xs ${faint} line-through`}>{formatPrice(p.oldPrice)}</span>
      )}
    </div>
  );
}

/** ปุ่มสลับ "ตรวจแล้ว" — เขียว=ตรวจแล้ว, เทา=ยังไม่ตรวจ (กดเพื่อสลับ บันทึกทันที) */
function ReviewToggle({ p, onToggle, size = "sm" }: { p: Product; onToggle: (p: Product) => void; size?: "sm" | "xs" }) {
  const checked = !!p.reviewed;
  const pad = size === "xs" ? "px-2 py-1.5" : "px-3 py-1.5";
  return (
    <button
      type="button"
      onClick={() => onToggle(p)}
      title={checked ? `${reviewedTitle(p)} — กดเพื่อยกเลิก` : "ทำเครื่องหมายว่าตรวจสินค้านี้แล้ว"}
      aria-pressed={checked}
      className={`rounded-lg ${pad} text-xs font-semibold transition ${
        checked
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          : "text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {checked ? "✓ ตรวจแล้ว" : "ตรวจแล้ว?"}
    </button>
  );
}

function RowActions({ p, onRemove, onToggleReview }: { p: Product; onRemove: (id: string) => void; onToggleReview: (p: Product) => void }) {
  const mayManage = useCan()("products.manage");
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ReviewToggle p={p} onToggle={onToggleReview} />
      {mayManage && (
        <Link
          href={`/admin/products/${p.id}`}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
        >
          แก้ไข
        </Link>
      )}
      <a
        href={productPath(p)}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
        title="เปิดหน้าสินค้าจริงในแท็บใหม่"
      >
        ดู
      </a>
      {mayManage && (
        <button
          type="button"
          onClick={() => onRemove(p.id)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
        >
          ลบ
        </button>
      )}
    </div>
  );
}

function NameTags({ p, edited }: { p: Product; edited: boolean }) {
  return (
    <>
      {p.reviewed && (
        <span className={`${badge} bg-emerald-50 text-emerald-700`} title={reviewedTitle(p)}>
          ✓ ตรวจแล้ว
        </span>
      )}
      {p.badge && <span className={`${badge} bg-amber-50 text-amber-700`}>{p.badge}</span>}
      {edited && (
        <span className={`${badge} bg-sky-50 text-sky-700`} title="สินค้านี้มีการแก้ไขที่บันทึกไว้">
          แก้ไขแล้ว
        </span>
      )}
    </>
  );
}

/** ช่องตั้ง "สั่งเยอะเท่าไหร่ถึงต้องถามสต๊อก" — แก้ตรงลิสต์ได้เลย บันทึกตอนออกจากช่อง */
function BulkAskField({ p, onSave }: { p: Product; onSave: (p: Product, v: string) => void }) {
  const [v, setV] = useState(p.bulkAskQty ? String(p.bulkAskQty) : "");
  useEffect(() => setV(p.bulkAskQty ? String(p.bulkAskQty) : ""), [p.bulkAskQty]);
  return (
    <label
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200"
      title={`ลูกค้าสั่งถึงจำนวนนี้ = หน้าสินค้าเตือนให้ทักแอดมินเช็คสต๊อก/คิวผลิตก่อน และออเดอร์ติดธง "รอเช็คสต๊อก" ให้ทีมยืนยันจำนวน · เว้นว่าง = ใช้ค่ากลาง ${BULK_ASK_DEFAULT} ชิ้น`}
    >
      <span className="text-[11px] font-semibold text-slate-500">
        📦 สั่งเยอะ ≥<span className="ml-0.5 text-slate-300" aria-hidden>ⓘ</span>
      </span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        onBlur={() => onSave(p, v)}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        placeholder={String(BULK_ASK_DEFAULT)}
        inputMode="numeric"
        className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-700 focus:border-amber-400 focus:outline-none"
      />
    </label>
  );
}

/* ── มุมมองตาราง ── */
function TableList({
  items,
  overriddenIds,
  onRemove,
  onToggleReview,
  onBulkAsk,
}: {
  items: Product[];
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onBulkAsk: (p: Product, v: string) => void;
}) {
  return (
    <div className={`overflow-hidden ${card}`}>
      <ul className="divide-y divide-slate-100">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 transition hover:bg-slate-50/70">
            <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl">
              <ProductVisual
                emoji={p.emoji}
                gradient={p.gradient}
                src={p.imageSrc}
                alt={p.name}
                size="text-xl"
                className="h-11 w-11"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                {/* กดชื่อ = เข้าหน้าแก้ไขเลย ไม่ต้องเล็งปุ่มเล็กด้านขวา */}
                <Link
                  href={`/admin/products/${p.id}`}
                  className="truncate transition hover:text-amber-600 hover:underline"
                  title="เปิดหน้าแก้ไขสินค้านี้"
                >
                  {p.name}
                </Link>
                <NameTags p={p} edited={overriddenIds.has(p.id)} />
              </p>
              <p className={`truncate text-xs ${faint}`}>
                {getCategory(p.category).nameEn} · ⭐ {p.rating} · ขายแล้ว {p.sold.toLocaleString("th-TH")}
              </p>
              <p className={`mt-1 truncate text-[11px] ${faint}`}>
                {p.images.length} รูป · {p.highlights.length} จุดเด่น · {(p.body ?? []).length} เนื้อหา
                {p.options.length > 0
                  ? ` · ${p.options.map((o) => `${o.label} (${o.choices.length})`).join(" · ")}`
                  : ""}
              </p>
            </div>
            <BulkAskField p={p} onSave={onBulkAsk} />
            <PriceBlock p={p} />
            <RowActions p={p} onRemove={onRemove} onToggleReview={onToggleReview} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── มุมมองการ์ด ── */
function CardGrid({
  items,
  overriddenIds,
  onRemove,
  onToggleReview,
}: {
  items: Product[];
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
}) {
  const mayManage = useCan()("products.manage");
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <div key={p.id} className={`group flex flex-col overflow-hidden ${card}`}>
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-50">
            <ProductVisual
              emoji={p.emoji}
              gradient={p.gradient}
              src={p.imageSrc}
              alt={p.name}
              size="text-4xl"
              className="h-full w-full"
            />
            <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
              <NameTags p={p} edited={overriddenIds.has(p.id)} />
            </div>
          </div>
          <div className="flex flex-1 flex-col p-2.5">
            <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
            <p className={`truncate text-[11px] ${faint}`}>
              ⭐ {p.rating} · ขายแล้ว {p.sold.toLocaleString("th-TH")}
            </p>
            <div className="mt-1.5">
              <PriceBlock p={p} />
            </div>
            <div className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2">
              <ReviewToggle p={p} onToggle={onToggleReview} size="xs" />
              {mayManage && (
                <Link
                  href={`/admin/products/${p.id}`}
                  className="flex-1 rounded-lg bg-amber-500 px-2 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-amber-600"
                >
                  แก้ไข
                </Link>
              )}
              <a
                href={productPath(p)}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 ${mayManage ? "" : "flex-1 text-center"}`}
                title="เปิดหน้าสินค้าจริง"
              >
                ดู
              </a>
              {mayManage && (
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                  title="ลบ"
                >
                  ลบ
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

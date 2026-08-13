"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductVisual from "@/components/ProductVisual";
import {
  adminProductPath,
  formatPrice,
  formatPriceRange,
  getCategory,
  priceRange,
  productPath,
  PRODUCTS,
  type CategoryId,
  type Product,
} from "@/lib/products";
import { loadOverrides, resetAll } from "@/lib/product-store";
import { deleteProductDb, fetchProductRaw, fetchProductsAdminLite, fetchProductSort, persistProduct } from "@/lib/product-repo";
import { getAdminSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { badge, btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";

type ViewMode = "table" | "cards";
type SortMode = "default" | "price-asc" | "price-desc" | "sold-desc";
type ReviewFilter = "all" | "checked" | "unchecked";
/** ตัวกรองสถานะเผยแพร่ — published = ลูกค้าเห็นบนหน้าร้าน · draft = ยังไม่เผยแพร่ (data.hidden = true) */
type ShowFilter = "all" | "published" | "draft";

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
  // id หมวดเป็น string เพราะแอดมินเพิ่มหมวดใหม่เองได้จากตั้งค่าระบบ (ไม่จำกัดชุดใน CategoryId)
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("default");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [showFilter, setShowFilter] = useState<ShowFilter>("all");
  // กางรายการหมวดทั้งหมดไหม (ยุบไว้ก่อน — 15 หมวดกินพื้นที่ 3 บรรทัด)
  const [catOpen, setCatOpen] = useState(false);
  // งานเผยแพร่/เก็บร่างทีละหลายตัว — null = ไม่มีงานค้าง
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  // ชื่อผู้ตรวจ (คนที่ล็อกอินอยู่) — โหมดเดโมที่ไม่มีชื่อใช้ "ทีมงาน"
  const [reviewer, setReviewer] = useState("ทีมงาน");
  const [creating, setCreating] = useState(false);
  /** id ของสินค้าที่กำลังทำซ้ำอยู่ (กันกดรัว = ได้สำเนาหลายตัว) */
  const [duplicating, setDuplicating] = useState<string | null>(null);
  /** หมวดหมู่ตามที่แอดมินตั้งไว้ในตั้งค่าระบบ (ยังไม่โหลดเสร็จ = ค่าเริ่มต้นจากโค้ด) */
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
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
      // สินค้าใหม่เริ่มเป็น "ฉบับร่าง" เสมอ — กันของที่ยังกรอกไม่เสร็จ (ชื่อ "สินค้าใหม่" ราคา 0)
      // โผล่ขึ้นหน้าร้านทันที · กรอกครบแล้วค่อยกด "🌐 เผยแพร่ขึ้นหน้าร้าน"
      hidden: true,
    };
    const res = await persistProduct(blank);
    if (res.ok) {
      router.push(`/admin/products/${id}`);
    } else {
      setCreating(false);
      alert(`สร้างสินค้าไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
    }
  }

  /**
   * ทำซ้ำสินค้า — ก๊อปข้อมูลทั้งชุด (ตัวเลือก/ตารางราคา/แท็บ/SEO) เป็นสินค้าใหม่ แล้วเปิดหน้าแก้ไขให้เลย
   * สำเนาได้รหัสใหม่ · ลิงก์ตามชื่อ (slug) และยอดขาย/สถานะตรวจแล้ว ไม่ก๊อปมา (กันลิงก์ชนและตัวเลขหลอก)
   */
  async function duplicate(p: Product) {
    if (duplicating) return;
    setDuplicating(p.id);
    try {
      const taken = new Set(products.map((x) => x.id));
      let id = `${p.id}-copy`;
      for (let n = 2; taken.has(id); n++) id = `${p.id}-copy${n}`;
      // ดึงข้อมูลดิบ (คงกลุ่มตัวเลือกที่ลิงก์คลังไว้ ไม่คลี่เป็นสำเนา)
      const raw = (await fetchProductRaw(p.id)) ?? p;
      const copy: Product = {
        ...raw,
        id,
        name: `${raw.name} (สำเนา)`,
        slug: undefined,
        sold: 0,
        featured: false,
        reviewed: undefined,
        savedAt: undefined,
        // สำเนาเริ่มเป็นฉบับร่างเสมอ — กันสินค้าชื่อ "(สำเนา)" หลุดขึ้นหน้าร้านคู่กับตัวจริง
        hidden: true,
      };
      const sort = await fetchProductSort(p.id);
      const res = await persistProduct(copy, undefined, sort ?? undefined);
      if (!res.ok) {
        setDuplicating(null);
        alert(`ทำซ้ำไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
        return;
      }
      router.push(`/admin/products/${id}`);
    } catch {
      setDuplicating(null);
      alert("ทำซ้ำไม่สำเร็จ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
  }

  async function refresh() {
    setProducts(await fetchProductsAdminLite());
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

  /**
   * เผยแพร่ / เก็บกลับเป็นฉบับร่าง — บันทึกทันที (เก็บใน data.hidden)
   * ยังไม่เผยแพร่ = ลูกค้าไม่เห็นในหน้ารายการ/หน้าแรก/ค้นหา/sitemap และเปิดลิงก์ตรงก็ไม่เจอ
   * (ทีมงานที่ล็อกอินยังเปิดพรีวิวได้ · ใช้แทนการลบสำหรับของที่ยังไม่พร้อมขาย)
   */
  async function toggleHidden(p: Product) {
    const hidden = p.hidden ? undefined : true;
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, hidden } : x)));
    const raw = (await fetchProductRaw(p.id)) ?? p;
    const res = await persistProduct({ ...raw, hidden });
    if (!res.ok) refresh(); // ล้มเหลว → ดึงสถานะจริงกลับมา
  }

  /**
   * เผยแพร่ / เก็บเป็นฉบับร่าง ทั้งชุดที่กรองอยู่ตอนนี้
   * ถามยืนยันก่อนเสมอ (บอกจำนวนจริง) แล้วทยอยเขียนทีละ 4 ตัว — ยิงรวดเดียว 300 ตัวเซิร์ฟเวอร์รับไม่ไหว
   * เขียนจากข้อมูลดิบของแต่ละตัว กันทับตัวเลือกที่ลิงก์คลัง (เหมือน toggle ทีละตัว)
   */
  async function bulkPublish(hide: boolean) {
    const targets = sorted.filter((p) => !!p.hidden !== hide);
    if (!targets.length) {
      alert(hide ? "รายการที่กรองอยู่เป็นฉบับร่างอยู่แล้วทั้งหมด" : "รายการที่กรองอยู่เผยแพร่อยู่แล้วทั้งหมด");
      return;
    }
    const what = hide ? "เก็บเป็นฉบับร่าง (ลูกค้าจะไม่เห็นบนหน้าร้าน)" : "เผยแพร่ขึ้นหน้าร้าน";
    if (!confirm(`${what} ${targets.length} รายการที่กรองอยู่ตอนนี้?`)) return;

    const hidden = hide ? true : undefined;
    setBulk({ done: 0, total: targets.length });
    const ids = new Set(targets.map((p) => p.id));
    setProducts((ps) => ps.map((x) => (ids.has(x.id) ? { ...x, hidden } : x)));
    let done = 0;
    let failed = 0;
    const queue = [...targets];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const raw = (await fetchProductRaw(p.id)) ?? p;
        const res = await persistProduct({ ...raw, hidden });
        if (!res.ok) failed++;
        done++;
        setBulk({ done, total: targets.length });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBulk(null);
    if (failed) {
      alert(`บันทึกไม่สำเร็จ ${failed} รายการ — ดึงสถานะจริงกลับมาแสดงให้แล้ว`);
      refresh();
    }
  }

  // "สั่งกี่ชิ้นถึงต้องถามสต๊อก" ย้ายไปตั้งในหน้าแก้ไขสินค้าอย่างเดียวแล้ว (📦 เงื่อนไขการสั่ง)
  // — เอาช่องออกจากแถวลิสต์เพราะกินความกว้างจนชื่อสินค้าโดนบีบ

  useEffect(() => {
    fetchCategories().then(setCats);
  }, []);
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
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

  // สรุปตัวเลขภาพรวม
  const totalSold = useMemo(() => products.reduce((s, p) => s + p.sold, 0), [products]);
  const reviewedCount = useMemo(() => products.filter((p) => p.reviewed).length, [products]);
  const hiddenCount = useMemo(() => products.filter((p) => p.hidden).length, [products]);

  // กรอง + ค้นหา
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (reviewFilter === "checked" && !p.reviewed) return false;
      if (reviewFilter === "unchecked" && p.reviewed) return false;
      if (showFilter === "published" && p.hidden) return false;
      if (showFilter === "draft" && !p.hidden) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, catFilter, reviewFilter, showFilter, query]);

  // เรียงลำดับ
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "price-asc") arr.sort((a, b) => priceRange(a).min - priceRange(b).min);
    else if (sort === "price-desc") arr.sort((a, b) => priceRange(b).min - priceRange(a).min);
    else if (sort === "sold-desc") arr.sort((a, b) => b.sold - a.sold);
    return arr;
  }, [filtered, sort]);

  /**
   * ทยอยวาดทีละชุด — เดิมวาดครบ 341 รายการพร้อมกัน (DOM ~7,900 ชิ้น)
   * ทำให้เปิดหน้าช้าและพิมพ์ค้นหาแล้วหน่วง (ทุกตัวอักษร = วาดใหม่ทั้งลิสต์)
   * เลื่อนถึงท้ายลิสต์ค่อยเติมชุดถัดไปให้เอง · ตัวเลข "พบ N รายการ" ยังนับจากของทั้งหมด
   */
  const PAGE = 60;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [catFilter, reviewFilter, showFilter, query, sort]);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= sorted.length) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = moreRef.current;
      if (el && el.getBoundingClientRect().top < window.innerHeight + 500) setShown((n) => n + PAGE);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shown, sorted.length]);
  const visible = useMemo(() => sorted.slice(0, shown), [sorted, shown]);

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
        <StatTile label="ยังไม่เผยแพร่" value={hiddenCount.toString()} accent={hiddenCount > 0} />
        <StatTile label="ยอดขายรวม" value={totalSold.toLocaleString("th-TH")} />
      </div>

      {/*
        แถบเครื่องมือ — รวมเป็นการ์ดเดียว 3 ชั้น อ่านจากบนลงล่าง
        เดิมยัดทุกอย่างไว้แถวเดียวแล้วปล่อยตัดบรรทัดเอง: กลุ่ม "ตรวจสอบ" กับ "เผยแพร่" หน้าตาเหมือนกันเป๊ะ
        ขึ้นต้นด้วยปุ่ม "ทั้งหมด" ทั้งคู่ ไม่มีป้ายบอกว่าอันไหนคืออะไร — ต้องกดลองถึงจะรู้
        ชั้น 1 ค้นหา+มุมมอง · ชั้น 2 ตัวกรองสถานะ (มีป้ายกำกับ+ตัวเลข) · ชั้น 3 หมวด (ยุบได้)
      */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {/* ชั้น 1: ค้นหา · เรียง · มุมมอง */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
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
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {([
              ["table", "☰", "มุมมองตาราง"],
              ["cards", "▦", "มุมมองการ์ด"],
            ] as const).map(([id, glyph, tip]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                title={tip}
                className={`px-3 py-2 text-sm transition ${
                  view === id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        {/* ชั้น 2: ตัวกรองสถานะ — ป้ายกำกับหน้ากลุ่ม กันสับสนว่าปุ่ม "ทั้งหมด" อันไหนของอะไร */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5">
          <SegGroup
            label="เผยแพร่"
            aria="กรองสถานะเผยแพร่"
            value={showFilter}
            onChange={setShowFilter}
            items={[
              { id: "all", label: "ทั้งหมด", count: products.length },
              { id: "published", label: "🌐 เผยแพร่แล้ว", count: products.length - hiddenCount, on: "bg-sky-600" },
              { id: "draft", label: "📝 ยังไม่เผยแพร่", count: hiddenCount, on: "bg-rose-600" },
            ]}
          />
          <SegGroup
            label="ตรวจสอบ"
            aria="กรองสถานะตรวจสอบ"
            value={reviewFilter}
            onChange={setReviewFilter}
            items={[
              { id: "all", label: "ทั้งหมด", count: products.length },
              { id: "unchecked", label: "⬜ ยังไม่ตรวจ", count: products.length - reviewedCount },
              { id: "checked", label: "✓ ตรวจแล้ว", count: reviewedCount, on: "bg-emerald-600" },
            ]}
          />
          <span className="ml-auto text-xs font-semibold text-slate-400">
            พบ <strong className="text-slate-700 tabular-nums">{sorted.length.toLocaleString("th-TH")}</strong> รายการ
          </span>
        </div>

        {/* ชั้น 3: หมวด — 15 หมวดกินพื้นที่ 3 บรรทัด ยุบเหลือแถวเดียวไว้ก่อน กดกางเมื่อต้องใช้ */}
        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
          <div className={`flex flex-wrap gap-1.5 ${catOpen ? "" : "max-h-8 overflow-hidden"}`}>
            <FilterChip
              active={catFilter === "all"}
              onClick={() => setCatFilter("all")}
              label="ทุกหมวด"
              count={products.length}
            />
            {cats.filter((c) => (catCounts.get(c.id) ?? 0) > 0).map((c) => (
              <FilterChip
                key={c.id}
                active={catFilter === c.id}
                onClick={() => setCatFilter(c.id)}
                label={`${c.emoji} ${c.name}`}
                count={catCounts.get(c.id) ?? 0}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCatOpen((o) => !o)}
            className="mt-1.5 text-[11px] font-bold text-slate-400 transition hover:text-slate-600"
          >
            {catOpen ? "▴ ย่อรายการหมวด" : `▾ ดูหมวดทั้งหมด (${cats.filter((c) => (catCounts.get(c.id) ?? 0) > 0).length})`}
          </button>
        </div>

        {/*
          จัดการทีเดียวทั้งชุดที่กรองอยู่ — โผล่เมื่อกรองอยู่จริงเท่านั้น
          (เปิดมาเห็นปุ่ม "เก็บทั้งหมดเป็นร่าง" ตอนกรอง "ทั้งหมด" อยู่ = พลาดทีเดียวเว็บหายทั้งร้าน)
        */}
        {mayManage && sorted.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
            <span className="text-xs font-bold text-slate-500">จัดการทั้งชุดที่กรองอยู่ ({sorted.length}):</span>
            <button
              type="button"
              disabled={!!bulk}
              onClick={() => bulkPublish(false)}
              className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100 disabled:opacity-40"
            >
              🌐 เผยแพร่ทั้งหมด
            </button>
            <button
              type="button"
              disabled={!!bulk}
              onClick={() => bulkPublish(true)}
              className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-40"
            >
              📝 เก็บเป็นฉบับร่างทั้งหมด
            </button>
            {bulk && (
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                กำลังบันทึก {bulk.done}/{bulk.total}…
              </span>
            )}
          </div>
        )}
      </div>

      {/* ผลลัพธ์ */}
      {sorted.length === 0 ? (
        <div className={`mt-5 p-10 text-center text-sm ${muted} ${card}`}>
          ไม่พบสินค้าที่ตรงกับ “{query}”
        </div>
      ) : view === "cards" ? (
        <CardGrid
          items={visible}
          overriddenIds={overriddenIds}
          onRemove={remove}
          onToggleReview={toggleReview}
          onToggleHidden={toggleHidden}
          onDuplicate={duplicate}
          duplicating={duplicating}
        />
      ) : grouped ? (
        <div className="mt-5 space-y-6">
          {cats.map((c) => {
            const inCat = visible.filter((p) => p.category === c.id);
            if (inCat.length === 0) return null;
            return (
              <section key={c.id}>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="text-sm">{c.emoji}</span> {c.name}
                  <span className="font-normal normal-case text-slate-300">· {inCat.length} รายการ</span>
                </h2>
                <TableList items={inCat} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onToggleHidden={toggleHidden} onDuplicate={duplicate} duplicating={duplicating} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <TableList items={visible} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onToggleHidden={toggleHidden} onDuplicate={duplicate} duplicating={duplicating} />
        </div>
      )}

      {/* เลื่อนถึงตรงนี้ = เติมชุดถัดไปให้เอง (กดปุ่มเองก็ได้) */}
      {shown < sorted.length && (
        <div ref={moreRef} className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="rounded-full bg-white px-6 py-2.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            แสดงเพิ่ม (เหลืออีก {(sorted.length - shown).toLocaleString("th-TH")} รายการ)
          </button>
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

/**
 * กลุ่มปุ่มกรองแบบมีป้ายกำกับ + ตัวเลขในตัว
 * ป้ายซ้ายคือสิ่งที่แยกสองกลุ่มนี้ออกจากกัน — ไม่มีป้าย ปุ่ม "ทั้งหมด" สองอันจะดูเหมือนกันเป๊ะ
 */
function SegGroup<T extends string>({
  label,
  aria,
  value,
  onChange,
  items,
}: {
  label: string;
  aria: string;
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count: number; on?: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label={aria}>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-pressed={value === it.id}
            className={`px-2.5 py-1.5 text-xs font-semibold transition ${
              value === it.id ? `${it.on ?? "bg-slate-900"} text-white` : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {it.label} <span className="tabular-nums opacity-60">{it.count}</span>
          </button>
        ))}
      </div>
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

/** ปุ่มเผยแพร่/เก็บกลับเป็นฉบับร่าง — 🌐 = ลูกค้าเห็นแล้ว, 📝 = ยังไม่เผยแพร่ (กดสลับ บันทึกทันที) */
function ShowToggle({ p, onToggle, size = "sm" }: { p: Product; onToggle: (p: Product) => void; size?: "sm" | "xs" }) {
  const hidden = !!p.hidden;
  const pad = size === "xs" ? "px-2 py-1.5" : "px-2.5 py-1.5";
  return (
    <button
      type="button"
      onClick={() => onToggle(p)}
      title={
        hidden
          ? "ยังไม่เผยแพร่ — ลูกค้าไม่เห็นในหน้ารายการ/หน้าแรก/ค้นหา และเปิดลิงก์ตรงก็ไม่เจอ (ทีมงานที่ล็อกอินยังพรีวิวได้) · กดเพื่อเผยแพร่"
          : "เผยแพร่อยู่ — ลูกค้าเห็นสินค้านี้บนหน้าร้าน · กดเพื่อเก็บกลับเป็นฉบับร่าง"
      }
      aria-pressed={!hidden}
      className={`rounded-lg ${pad} text-xs font-semibold transition ${
        hidden
          ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100"
          : "bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
      }`}
    >
      {hidden ? "📝 ยังไม่เผยแพร่" : "🌐 เผยแพร่แล้ว"}
    </button>
  );
}

function RowActions({
  p,
  onRemove,
  onToggleReview,
  onToggleHidden,
  onDuplicate,
  duplicating,
}: {
  p: Product;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onToggleHidden: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  duplicating: string | null;
}) {
  const mayManage = useCan()("products.manage");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {mayManage && <ShowToggle p={p} onToggle={onToggleHidden} />}
      <ReviewToggle p={p} onToggle={onToggleReview} />
      {mayManage && (
        <Link
          href={adminProductPath(p)}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
        >
          แก้ไข
        </Link>
      )}
      {mayManage && (
        <button
          type="button"
          onClick={() => onDuplicate(p)}
          disabled={!!duplicating}
          title="สร้างสินค้าใหม่โดยก๊อปข้อมูลทั้งชุดจากตัวนี้ (ตัวเลือก/ตารางราคา/แท็บ/SEO)"
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-40"
        >
          {duplicating === p.id ? "กำลังทำซ้ำ…" : "ทำซ้ำ"}
        </button>
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
      {p.hidden && (
        <span className={`${badge} bg-rose-50 text-rose-600`} title="ยังไม่เผยแพร่ — ลูกค้าไม่เห็นสินค้านี้บนหน้าร้าน">
          📝 ยังไม่เผยแพร่
        </span>
      )}
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

/* ── มุมมองตาราง ── */
function TableList({
  items,
  overriddenIds,
  onRemove,
  onToggleReview,
  onToggleHidden,
  onDuplicate,
  duplicating,
}: {
  items: Product[];
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onToggleHidden: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  duplicating: string | null;
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
                  href={adminProductPath(p)}
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
            {/*
              เอาช่อง "📦 สั่งเยอะ ≥" กับช่วงราคาออกจากแถว (เจ้าของร้านสั่ง)
              ทั้งคู่กินความกว้างกลางแถวจนชื่อสินค้าโดนบีบ · สั่งเยอะตั้งได้ในหน้าแก้ไข (📦 เงื่อนไขการสั่ง)
              และราคายังเห็นได้ในมุมมองการ์ด · แถวลิสต์เหลือ รูป | ชื่อ+รายละเอียด | ปุ่มจัดการ
            */}
            <RowActions
              p={p}
              onRemove={onRemove}
              onToggleReview={onToggleReview}
              onToggleHidden={onToggleHidden}
              onDuplicate={onDuplicate}
              duplicating={duplicating}
            />
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
  onToggleHidden,
  onDuplicate,
  duplicating,
}: {
  items: Product[];
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onToggleHidden: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  duplicating: string | null;
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
              {mayManage && <ShowToggle p={p} onToggle={onToggleHidden} size="xs" />}
              <ReviewToggle p={p} onToggle={onToggleReview} size="xs" />
              {mayManage && (
                <Link
                  href={adminProductPath(p)}
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
                  onClick={() => onDuplicate(p)}
                  disabled={!!duplicating}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-40"
                  title="ทำซ้ำ — ก๊อปข้อมูลทั้งชุดเป็นสินค้าใหม่"
                >
                  {duplicating === p.id ? "…" : "ทำซ้ำ"}
                </button>
              )}
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

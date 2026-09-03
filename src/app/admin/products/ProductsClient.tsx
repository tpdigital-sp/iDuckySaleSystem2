"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductVisual from "@/components/ProductVisual";
import {
  adminProductPath,
  formatPrice,
  formatPriceLabel,
  getCategory,
  priceRange,
  productPath,
  type CategoryId,
  type Product,
} from "@/lib/products";
import { loadOverrides, resetAll } from "@/lib/product-store";
import { deleteProductDb, fetchProductRaw, fetchProductsAdminLite, fetchProductsAdminRows, fetchProductSort, persistProduct, persistProductSorts } from "@/lib/product-repo";
import { getAdminSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { badge, card, faint, muted } from "@/lib/admin-ui";
import { Btn, HeroStat, PageHead, PageShell, SearchBox, Stat, Stats } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";

type ViewMode = "table" | "cards";
type SortMode = "default" | "price-asc" | "price-desc" | "sold-desc";
/** วางไว้ ก่อน/หลัง เพื่อนบ้านเป้าหมาย — ใช้ร่วมกันทั้งลากวางและปุ่มลูกศร */
type Place = "before" | "after";
/** สินค้าพร้อมเลขลำดับในลิสต์ (คอลัมน์ sort — fetchProductsAdminLite ดึงมาให้อยู่แล้ว) */
type Sortable = Product & { sort?: number };
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

/**
 * `initial` = รายการที่เซิร์ฟเวอร์ดึงมาให้แล้ว (รูปปก/ชื่อ/สถานะ) — วาดได้ตั้งแต่ HTML แรก
 * เดิมเริ่มจากสินค้าชุดสแตติกในโค้ด แล้วรอโหลดจากฐานข้อมูล = รีเฟรชแล้วเห็นของเก่าค้างอยู่ 1-3 วิ
 */
export default function AdminProductsPage({ initial = [] }: { initial?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initial);
  const [overriddenIds, setOverriddenIds] = useState<Set<string>>(new Set());
  /** ชุดเต็มมาถึงหรือยัง (false = ยังมีแค่ฟิลด์ที่ใช้วาดแถว — ซ่อนบรรทัดรายละเอียด/ราคาไว้ก่อน ไม่งั้นขึ้นเลข 0 หลอกตา) */
  const [detailed, setDetailed] = useState(false);
  /** ลำดับรอบโหลดล่าสุด — ผลของรอบเก่าที่มาช้าจะถูกทิ้ง ไม่ให้ทับของใหม่ */
  const refreshRun = useRef(0);

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
  const can = useCan();
  const mayManage = can("products.manage"); // ฝ่ายแอดมินดูได้อย่างเดียว
  const maySettings = can("settings.manage"); // จัดลำดับหมวดหมู่ = แก้ตั้งค่าร้าน
  // โหมดจัดลำดับหมวดหมู่ (ปิดอยู่ = ชิปหมวดใช้กรองตามปกติ)
  const [catOrderMode, setCatOrderMode] = useState(false);
  const [savingCats, setSavingCats] = useState(false);
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

  /**
   * โหลดรายการ 2 จังหวะ — ชุดเบามาก่อน (รูปปก/ชื่อ/สถานะ ~170 KB) แล้วชุดเต็มตามมา (~4.8 MB)
   * เดิมรอชุดเต็มอย่างเดียว: รีเฟรชแล้วหน้าจอยังเป็นภาพหน้าเดิม (รูปปกเก่า) อยู่ 2-3 วิ
   * กว่าจะสลับเป็นของจริง · แบบนี้รูปปกที่ถูกต้องขึ้นตั้งแต่ ~0.5 วิ
   */
  async function refresh(opts?: { skipQuick?: boolean }) {
    const run = ++refreshRun.current;
    setDetailed(false);
    let fullDone = false;
    const full = fetchProductsAdminLite().then((ps) => {
      fullDone = true;
      if (run === refreshRun.current) {
        setProducts(ps);
        setDetailed(true);
      }
    });
    // เปิดหน้าครั้งแรก เซิร์ฟเวอร์ส่งแถวมาให้แล้ว = ไม่ต้องยิงชุดเบาซ้ำ ปล่อยแบนด์วิดท์ให้ชุดเต็ม
    const quick = opts?.skipQuick ? null : await fetchProductsAdminRows().catch(() => null);
    // ชุดเต็มมาถึงก่อน (เช่นข้อมูลอยู่ในแคชแล้ว) = ไม่ต้องเอาชุดเบามาทับ
    if (quick && !fullDone && run === refreshRun.current) setProducts(quick);
    await full;
    // ป้าย "แก้ไขแล้ว" ใช้เฉพาะโหมดเดโม (localStorage)
    if (run === refreshRun.current) setOverriddenIds(isSupabaseConfigured ? new Set() : new Set(Object.keys(loadOverrides())));
  }

  useEffect(() => {
    refresh({ skipQuick: initial.length > 0 });
    getAdminSession().then((s) => s.name && setReviewer(s.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
   * (ทีมงานพรีวิวได้ที่ /preview/[id] · ใช้แทนการลบสำหรับของที่ยังไม่พร้อมขาย)
   */
  async function toggleHidden(p: Product) {
    const hidden = p.hidden ? undefined : true;
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, hidden } : x)));
    const raw = (await fetchProductRaw(p.id)) ?? p;
    const res = await persistProduct({ ...raw, hidden });
    if (!res.ok) refresh(); // ล้มเหลว → ดึงสถานะจริงกลับมา
  }

  /**
   * ย้ายสินค้าไปไว้ ก่อน/หลัง เพื่อนบ้านที่เห็นในลิสต์ — ใช้ทั้งลากวางและปุ่มลูกศร ▲▼
   * อัปเดตหน้าจอทันที แล้วบันทึกเฉพาะแถวที่เลขลำดับ (คอลัมน์ sort) เปลี่ยนจริง:
   * แทรกลงช่องว่างระหว่างเลขเพื่อนบ้านได้ = เขียนแถวเดียวจบ · เลขชนกันค่อยไล่ขยับตัวถัดไปจนเจอช่องว่าง
   */
  async function moveProduct(id: string, targetId: string, place: Place) {
    if (id === targetId) return;
    const item = products.find((p) => p.id === id);
    if (!item) return;
    const arr: Sortable[] = products.filter((p) => p.id !== id);
    let idx = arr.findIndex((p) => p.id === targetId);
    if (idx < 0) return;
    if (place === "after") idx += 1;
    arr.splice(idx, 0, item);
    const num = (p: Sortable) => (typeof p.sort === "number" ? p.sort : 0);
    const changes: { id: string; sort: number }[] = [];
    // ตัวที่ย้าย: ต่อจากตัวก่อนหน้า (ไปหัวลิสต์ = ก่อนตัวแรกเดิมหนึ่งเลข — ติดลบได้ คอลัมน์เป็น int)
    let last = idx > 0 ? num(arr[idx - 1]) + 1 : num(arr[idx + 1]) - 1;
    if (num(arr[idx]) !== last) {
      arr[idx] = { ...arr[idx], sort: last };
      changes.push({ id: arr[idx].id, sort: last });
    }
    // ตัวถัด ๆ ไป: ขยับเฉพาะที่เลขชนกัน หยุดทันทีที่เจอช่องว่าง
    for (let i = idx + 1; i < arr.length; i++) {
      if (num(arr[i]) > last) break;
      last += 1;
      arr[i] = { ...arr[i], sort: last };
      changes.push({ id: arr[i].id, sort: last });
    }
    if (!changes.length) return;
    setProducts(arr);
    const res = await persistProductSorts(changes);
    if (!res.ok) {
      alert(`บันทึกลำดับไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
      refresh(); // ดึงลำดับจริงกลับมา
    }
  }

  /**
   * ย้ายหมวดหมู่ไปไว้ ก่อน/หลัง หมวดเป้าหมาย แล้วบันทึกทั้งชุดทันที
   * (ลำดับหมวด = ลำดับ array ในแถวตั้งค่า __categories__ — มีผลทั้งหน้านี้และหน้าร้าน)
   */
  async function moveCategory(id: string, targetId: string, place: Place) {
    if (id === targetId) return;
    const item = cats.find((c) => c.id === id);
    if (!item) return;
    const arr = cats.filter((c) => c.id !== id);
    let idx = arr.findIndex((c) => c.id === targetId);
    if (idx < 0) return;
    if (place === "after") idx += 1;
    arr.splice(idx, 0, item);
    const prev = cats;
    setCats(arr);
    setSavingCats(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: arr }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`บันทึกลำดับหมวดไม่สำเร็จ: ${j.error ?? "เกิดข้อผิดพลาด"}`);
        setCats(prev);
      }
    } catch {
      alert("บันทึกลำดับหมวดไม่สำเร็จ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      setCats(prev);
    }
    setSavingCats(false);
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
    fetchCategories({ fresh: true }).then(setCats);
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

  /**
   * หมวดที่ยังมีสินค้าอยู่ แต่ไม่มีในรายการหมวดของร้านแล้ว (แอดมินลบ/สลับชุดหมวดทีหลัง)
   * [FIX 2026-09-01] เดิมสินค้ากลุ่มนี้หายจากลิสต์เงียบ ๆ — โหมด "ตามหมวด" วาดจาก cats
   * จึงข้ามไปทั้งกลุ่ม และไม่มีชิปหมวดให้กดด้วย · ค้นหาแล้วขึ้น "พบ 1 รายการ" แต่ไม่มีแถวให้เห็น
   * (เจอจริงกับ POLAROID / PHOTO BOOTH (กระดาษ) ที่ค้างหมวด card-photo)
   * ใส่หมวดชั่วคราวติดป้าย ⚠️ ให้เห็น + กดเข้าไปแก้หมวดได้ — ไม่แตะรายการหมวดจริงในฐาน
   */
  const listCats = useMemo(() => {
    const known = new Set(cats.map((c) => c.id));
    const extra: ShopCategory[] = [];
    for (const id of catCounts.keys()) {
      if (known.has(id)) continue;
      extra.push({
        id,
        name: `หมวดที่ไม่มีในระบบแล้ว (${id})`,
        nameEn: "",
        emoji: "⚠️",
        gradient: "from-amber-100 to-amber-200",
        description: "",
      });
    }
    return extra.length ? [...cats, ...extra] : cats;
  }, [cats, catCounts]);

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
      // ค้นหาจากชื่อ + ลิงก์ (slug) + รหัสสินค้า — ทีมงานมักก๊อปลิงก์หน้าร้านมาวางค้นหา
      if (q && ![p.name, p.slug ?? "", p.id].some((v) => v.toLowerCase().includes(q))) return false;
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

  /**
   * จัดลำดับสินค้าได้เฉพาะโหมดเรียง "ตามหมวด" (= ลำดับจริงที่หน้าร้านใช้)
   * เรียงตามราคา/ยอดขายอยู่ = ตำแหน่งที่เห็นไม่ใช่ลำดับจริง ย้ายไปก็สับสน · โหมดเดโมไม่มีคอลัมน์ลำดับให้บันทึก
   */
  const canReorder = mayManage && isSupabaseConfigured && sort === "default";

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="สินค้า"
        count={`${products.length} รายการ`}
        sub="ค้นหา กรอง และแก้ไขสินค้าได้ในหน้าเดียว — การแก้ไขบันทึกลงฐานข้อมูลและหน้าร้านแสดงตามที่แก้"
        tools={
          <>
            {!mayManage && (
              <span className="dkb-tag" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
                <i />
                ดูอย่างเดียว
              </span>
            )}
            {mayManage && !isSupabaseConfigured && (
              <Btn onClick={handleResetAll} title="ลบการแก้ไขทั้งหมด กลับเป็นข้อมูลตั้งต้น">
                รีเซ็ตทั้งหมด
              </Btn>
            )}
            {mayManage && (
              <Btn tone="yolk" onClick={createProduct} disabled={creating} title="สร้างสินค้าใหม่เปล่า แล้วไปหน้าแก้ไข">
                {creating ? "กำลังสร้าง…" : "เพิ่มสินค้า"}
              </Btn>
            )}
          </>
        }
      />

      <Stats cols={4}>
        <HeroStat
          n={hiddenCount}
          label="ยังไม่เผยแพร่"
          detail={
            hiddenCount
              ? `ลูกค้ายังไม่เห็น ${hiddenCount} รายการ · ยังไม่ตรวจอีก ${products.length - reviewedCount}`
              : "เผยแพร่ครบทุกรายการแล้ว"
          }
          pct={products.length ? (hiddenCount / products.length) * 100 : 0}
        />
        <Stat label="ตรวจแล้ว" value={`${reviewedCount}/${products.length}`} hint="ทีมงานเช็คซ้ำแล้ว" />
        <Stat label="ยอดขายรวม" value={totalSold.toLocaleString("th-TH")} hint="ทุกสินค้ารวมกัน" />
      </Stats>

      {/*
        แถบเครื่องมือ — รวมเป็นการ์ดเดียว 3 ชั้น อ่านจากบนลงล่าง
        เดิมยัดทุกอย่างไว้แถวเดียวแล้วปล่อยตัดบรรทัดเอง: กลุ่ม "ตรวจสอบ" กับ "เผยแพร่" หน้าตาเหมือนกันเป๊ะ
        ขึ้นต้นด้วยปุ่ม "ทั้งหมด" ทั้งคู่ ไม่มีป้ายบอกว่าอันไหนคืออะไร — ต้องกดลองถึงจะรู้
        ชั้น 1 ค้นหา+มุมมอง · ชั้น 2 ตัวกรองสถานะ (มีป้ายกำกับ+ตัวเลข) · ชั้น 3 หมวด (ยุบได้)
      */}
      <div className="dkb-g mt-4 p-3">
        {/* ชั้น 1: ค้นหา · เรียง · มุมมอง */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อสินค้า" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="dkb-g border-0 px-3 py-2 text-[13.5px] outline-none"
            aria-label="เรียงลำดับ"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="dkb-g inline-flex overflow-hidden">
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
                  view === id ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)] hover:bg-white/70"
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        {/* ชั้น 2: ตัวกรองสถานะ — ป้ายกำกับหน้ากลุ่ม กันสับสนว่าปุ่ม "ทั้งหมด" อันไหนของอะไร */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2.5" style={{ borderColor: "var(--dk-hair)" }}>
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

        {/*
          ชั้น 3: หมวด — จัดเป็นกริดช่องเท่ากัน (ชิปกว้างไม่เท่ากันเรียงฟรีสไตล์ดูรก)
          ยุบเหลือ ~2 แถวไว้ก่อน กดช่อง "อีก N หมวด" เพื่อกางครบ
          ปุ่ม "จัดลำดับหมวด" เปิดโหมดลาก/กดลูกศรย้ายหมวด (เฉพาะคนมีสิทธิ์ตั้งค่าระบบ)
        */}
        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">หมวดหมู่</span>
            <div className="flex items-center gap-2">
              {savingCats && <span className="text-[11px] font-semibold text-slate-400">กำลังบันทึกลำดับ…</span>}
              {maySettings && isSupabaseConfigured && (
                <button
                  type="button"
                  onClick={() => setCatOrderMode((m) => !m)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    catOrderMode
                      ? "bg-[color:var(--dk-navy)] text-white"
                      : "text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                  title="จัดลำดับหมวดหมู่ — ลำดับนี้ใช้ทั้งหน้านี้และหน้าร้าน"
                >
                  {catOrderMode ? "✓ เสร็จสิ้น" : "↕ จัดลำดับหมวด"}
                </button>
              )}
            </div>
          </div>

          {catOrderMode ? (
            <>
              <p className="mt-1.5 text-[11px] text-slate-400">
                กดค้างแล้วลากการ์ดหมวด หรือกด ◀ ▶ เพื่อย้ายตำแหน่ง — บันทึกให้ทันทีทุกครั้ง · ลำดับนี้มีผลกับหน้าร้านด้วย
              </p>
              <CatOrderGrid cats={cats} counts={catCounts} onMove={moveCategory} />
            </>
          ) : (
            <CatFilterGrid
              cats={listCats.filter((c) => (catCounts.get(c.id) ?? 0) > 0)}
              counts={catCounts}
              total={products.length}
              active={catFilter}
              onPick={setCatFilter}
              open={catOpen}
              onToggleOpen={() => setCatOpen((o) => !o)}
            />
          )}
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
          detailed={detailed}
          overriddenIds={overriddenIds}
          onRemove={remove}
          onToggleReview={toggleReview}
          onToggleHidden={toggleHidden}
          onDuplicate={duplicate}
          duplicating={duplicating}
          canReorder={canReorder}
          onMove={moveProduct}
        />
      ) : grouped ? (
        <div className="mt-5 space-y-6">
          {listCats.map((c) => {
            const inCat = visible.filter((p) => p.category === c.id);
            if (inCat.length === 0) return null;
            return (
              <section key={c.id}>
                <h2 className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
                  <span className="text-sm">{c.emoji}</span>
                  <span className="font-display text-[13px] font-semibold text-slate-800">{c.name}</span>
                  <span className="text-xs text-slate-400">· {inCat.length} รายการ</span>
                </h2>
                <TableList items={inCat} detailed={detailed} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onToggleHidden={toggleHidden} onDuplicate={duplicate} duplicating={duplicating} canReorder={canReorder} onMove={moveProduct} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <TableList items={visible} detailed={detailed} overriddenIds={overriddenIds} onRemove={remove} onToggleReview={toggleReview} onToggleHidden={toggleHidden} onDuplicate={duplicate} duplicating={duplicating} canReorder={canReorder} onMove={moveProduct} />
        </div>
      )}

      {/* เลื่อนถึงตรงนี้ = เติมชุดถัดไปให้เอง (กดปุ่มเองก็ได้) */}
      {shown < sorted.length && (
        <div ref={moreRef} className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="dkb-btn dkb-btn-ghost"
          >
            แสดงเพิ่ม (เหลืออีก {(sorted.length - shown).toLocaleString("th-TH")} รายการ)
          </button>
        </div>
      )}
    </PageShell>
  );
}

/* ── ชิ้นส่วนย่อย ─────────────────────────────────────────── */

/** กริดหมวดช่องเท่ากัน ใช้ร่วมทั้งโหมดกรองและโหมดจัดลำดับ — ช่องกว้างเท่ากันอ่านเป็นระเบียบกว่าชิปเรียงฟรีสไตล์ */
const CAT_GRID = "mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
/** ยุบแล้วโชว์กี่หมวด — "ทุกหมวด" + 10 หมวด + ช่อง "อีก N หมวด" = 12 ช่อง ลงตัวทุกจำนวนคอลัมน์ (2/3/4/6) */
const CAT_COLLAPSED = 10;

/** ช่องหมวดในกริด (โหมดกรอง) — อีโมจิ | ชื่อ (ตัดท้าย) | จำนวน ชิดขวา */
function CatCell({
  active,
  onClick,
  emoji,
  label,
  count,
  title,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
  count: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-amber-500 text-white shadow-[0_4px_12px_rgba(44,129,196,0.25)]"
          : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50"
      }`}
    >
      <span className="shrink-0">{emoji}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className={`shrink-0 tabular-nums ${active ? "opacity-70" : "text-slate-400"}`}>{count}</span>
    </button>
  );
}

/** กริดหมวดโหมดกรอง — ยุบเหลือ ~2 แถว กดช่องสุดท้ายเพื่อกางครบ */
function CatFilterGrid({
  cats,
  counts,
  total,
  active,
  onPick,
  open,
  onToggleOpen,
}: {
  cats: ShopCategory[];
  counts: Map<string, number>;
  total: number;
  active: string;
  onPick: (id: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const shown = open ? cats : cats.slice(0, CAT_COLLAPSED);
  const hiddenCount = cats.length - shown.length;
  return (
    <div className={CAT_GRID}>
      <CatCell active={active === "all"} onClick={() => onPick("all")} emoji="🗂️" label="ทุกหมวด" count={total} />
      {shown.map((c) => (
        <CatCell
          key={c.id}
          active={active === c.id}
          onClick={() => onPick(c.id)}
          emoji={c.emoji}
          label={c.name}
          count={counts.get(c.id) ?? 0}
        />
      ))}
      {(hiddenCount > 0 || open) && (
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
        >
          {open ? "▴ ย่อรายการหมวด" : `▾ อีก ${hiddenCount} หมวด`}
        </button>
      )}
    </div>
  );
}

/**
 * กริดหมวดโหมดจัดลำดับ — ลากการ์ด หรือกด ◀ ▶ ย้ายทีละช่อง
 * โชว์ทุกหมวด (รวมหมวดว่าง/หมวดที่ซ่อน) เพราะการบันทึกเขียนทั้งชุด — ตัดออกไป = หมวดหายจากระบบ
 */
function CatOrderGrid({
  cats,
  counts,
  onMove,
}: {
  cats: ShopCategory[];
  counts: Map<string, number>;
  onMove: (id: string, targetId: string, place: Place) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; place: Place } | null>(null);
  // เริ่มกดที่ปุ่มลูกศร = ตั้งใจกดปุ่ม ไม่ใช่ลากการ์ด
  const grabOk = useRef(false);
  const placeOf = (e: React.DragEvent<HTMLDivElement>): Place => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? "before" : "after";
  };
  return (
    <div className={CAT_GRID}>
      {cats.map((c, i) => (
        <div
          key={c.id}
          draggable
          onMouseDown={(e) => {
            grabOk.current = !(e.target as HTMLElement).closest("button");
          }}
          onDragStart={(e) => {
            if (!grabOk.current) {
              e.preventDefault();
              return;
            }
            setDragId(c.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", c.id);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === c.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const place = placeOf(e);
            setOver((o) => (o?.id === c.id && o.place === place ? o : { id: c.id, place }));
          }}
          onDrop={(e) => {
            if (!dragId || dragId === c.id) return;
            e.preventDefault();
            onMove(dragId, c.id, placeOf(e));
            setDragId(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOver(null);
          }}
          title={c.hidden ? `${c.name} — ซ่อนจากหน้าร้านอยู่` : c.name}
          className={`flex min-w-0 cursor-grab select-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 transition active:cursor-grabbing ${
            dragId === c.id ? "opacity-40" : ""
          } ${c.hidden ? "opacity-60" : ""}`}
          style={
            over?.id === c.id && dragId
              ? {
                  boxShadow:
                    over.place === "before"
                      ? "inset 2px 0 0 0 var(--dk-blue-deep)"
                      : "inset -2px 0 0 0 var(--dk-blue-deep)",
                }
              : undefined
          }
        >
          <span className="shrink-0 text-slate-300">⠿</span>
          <span className="shrink-0">{c.emoji}</span>
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          <span className="shrink-0 tabular-nums text-slate-400">{counts.get(c.id) ?? 0}</span>
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => i > 0 && onMove(c.id, cats[i - 1].id, "before")}
              disabled={i === 0}
              title="เลื่อนไปก่อนหน้า"
              className="rounded px-1 text-[10px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => i < cats.length - 1 && onMove(c.id, cats[i + 1].id, "after")}
              disabled={i === cats.length - 1}
              title="เลื่อนไปถัดไป"
              className="rounded px-1 text-[10px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              ▶
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function PriceBlock({ p }: { p: Product }) {
  const range = priceRange(p);
  return (
    <div className="text-right">
      <span className="text-sm font-bold text-slate-900">{formatPriceLabel(p)}</span>
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
      <div className="inline-flex overflow-hidden rounded-xl border border-slate-200" role="group" aria-label={aria}>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-pressed={value === it.id}
            className={`px-2.5 py-1.5 text-xs font-semibold transition ${
              value === it.id ? `${it.on ?? "bg-amber-500"} text-white` : "bg-white text-slate-500 hover:bg-amber-50/60"
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
          ? "ยังไม่เผยแพร่ — ลูกค้าไม่เห็นในหน้ารายการ/หน้าแรก/ค้นหา และเปิดลิงก์ตรงก็ไม่เจอ (ทีมงานพรีวิวได้จากปุ่มในหน้าแก้ไข) · กดเพื่อเผยแพร่"
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
  detailed,
  overriddenIds,
  onRemove,
  onToggleReview,
  onToggleHidden,
  onDuplicate,
  duplicating,
  canReorder,
  onMove,
}: {
  items: Product[];
  /** ชุดข้อมูลเต็มมาถึงแล้วไหม (false = เพิ่งมีฟิลด์ที่ใช้วาดแถว ยังนับรูป/ตัวเลือกไม่ได้) */
  detailed: boolean;
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onToggleHidden: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  duplicating: string | null;
  canReorder: boolean;
  onMove: (id: string, targetId: string, place: Place) => void;
}) {
  // ลากจัดลำดับ — สถานะอยู่ในลิสต์ตัวเอง = มุมมองแบ่งหมวดลากข้ามหมวดไม่ได้ (หมวดของสินค้าไม่เปลี่ยนจากการจัดลำดับ)
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; place: Place } | null>(null);
  // จุดที่เริ่มกดเมาส์ — เริ่มจากปุ่ม/ลิงก์ = ไม่ใช่การลากแถว (กันลากค้างตอนตั้งใจกดปุ่ม)
  const grabOk = useRef(false);
  const placeOf = (e: React.DragEvent<HTMLLIElement>): Place => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "before" : "after";
  };
  return (
    <div className={`overflow-hidden ${card}`}>
      <ul className="divide-y divide-slate-100">
        {items.map((p, i) => (
          <li
            key={p.id}
            draggable={canReorder}
            onMouseDown={(e) => {
              grabOk.current = !(e.target as HTMLElement).closest("a,button,input,select");
            }}
            onDragStart={(e) => {
              if (!canReorder || !grabOk.current) {
                e.preventDefault();
                return;
              }
              setDragId(p.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", p.id);
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === p.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const place = placeOf(e);
              setOver((o) => (o?.id === p.id && o.place === place ? o : { id: p.id, place }));
            }}
            onDrop={(e) => {
              if (!dragId || dragId === p.id) return;
              e.preventDefault();
              onMove(dragId, p.id, placeOf(e));
              setDragId(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOver(null);
            }}
            className={`flex flex-wrap items-center gap-3 p-3 transition hover:bg-slate-50/70 ${
              dragId === p.id ? "opacity-40" : ""
            }`}
            style={
              over?.id === p.id && dragId
                ? {
                    boxShadow:
                      over.place === "before"
                        ? "inset 0 2px 0 0 var(--dk-blue-deep)"
                        : "inset 0 -2px 0 0 var(--dk-blue-deep)",
                  }
                : undefined
            }
          >
            {canReorder && (
              <div className="flex shrink-0 select-none flex-col items-center">
                <button
                  type="button"
                  onClick={() => i > 0 && onMove(p.id, items[i - 1].id, "before")}
                  disabled={i === 0}
                  title="เลื่อนขึ้นหนึ่งตำแหน่ง"
                  className="rounded px-1.5 text-[10px] leading-4 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <span className="cursor-grab text-[13px] leading-4 text-slate-300" title="กดค้างแล้วลากแถว เพื่อย้ายตำแหน่งสินค้า">
                  ⠿
                </span>
                <button
                  type="button"
                  onClick={() => i < items.length - 1 && onMove(p.id, items[i + 1].id, "after")}
                  disabled={i === items.length - 1}
                  title="เลื่อนลงหนึ่งตำแหน่ง"
                  className="rounded px-1.5 text-[10px] leading-4 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            )}
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
                {/* ชุดเต็มยังไม่มา = ยังนับไม่ได้ · ขึ้นจุดไข่ปลาไว้ก่อน ไม่ใช่เลข 0 ที่อ่านแล้วเข้าใจผิด */}
                {detailed
                  ? `${p.images.length} รูป · ${p.highlights.length} จุดเด่น · ${(p.body ?? []).length} เนื้อหา${
                      p.options.length > 0
                        ? ` · ${p.options.map((o) => `${o.label} (${o.display === "input" ? "กรอกเอง" : o.choices.length})`).join(" · ")}`
                        : ""
                    }`
                  : "กำลังโหลดรายละเอียด…"}
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
  detailed,
  overriddenIds,
  onRemove,
  onToggleReview,
  onToggleHidden,
  onDuplicate,
  duplicating,
  canReorder,
  onMove,
}: {
  items: Product[];
  /** ชุดข้อมูลเต็มมาถึงแล้วไหม (false = ยังคิดช่วงราคาไม่ได้ — ซ่อนไว้ก่อน ไม่ให้ขึ้นราคาผิดแวบหนึ่ง) */
  detailed: boolean;
  overriddenIds: Set<string>;
  onRemove: (id: string) => void;
  onToggleReview: (p: Product) => void;
  onToggleHidden: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  duplicating: string | null;
  canReorder: boolean;
  onMove: (id: string, targetId: string, place: Place) => void;
}) {
  const mayManage = useCan()("products.manage");
  // ลากจัดลำดับในกริด — วางครึ่งซ้ายของการ์ดเป้าหมาย = แทรกก่อน · ครึ่งขวา = แทรกหลัง
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; place: Place } | null>(null);
  const grabOk = useRef(false);
  const placeOf = (e: React.DragEvent<HTMLDivElement>): Place => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? "before" : "after";
  };
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((p, i) => (
        <div
          key={p.id}
          draggable={canReorder}
          onMouseDown={(e) => {
            grabOk.current = !(e.target as HTMLElement).closest("a,button,input,select");
          }}
          onDragStart={(e) => {
            if (!canReorder || !grabOk.current) {
              e.preventDefault();
              return;
            }
            setDragId(p.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", p.id);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === p.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const place = placeOf(e);
            setOver((o) => (o?.id === p.id && o.place === place ? o : { id: p.id, place }));
          }}
          onDrop={(e) => {
            if (!dragId || dragId === p.id) return;
            e.preventDefault();
            onMove(dragId, p.id, placeOf(e));
            setDragId(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOver(null);
          }}
          className={`group flex flex-col overflow-hidden ${card} ${dragId === p.id ? "opacity-40" : ""}`}
          style={
            over?.id === p.id && dragId
              ? {
                  boxShadow:
                    over.place === "before"
                      ? "inset 3px 0 0 0 var(--dk-blue-deep)"
                      : "inset -3px 0 0 0 var(--dk-blue-deep)",
                }
              : undefined
          }
        >
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
            {canReorder && (
              <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => i > 0 && onMove(p.id, items[i - 1].id, "before")}
                  disabled={i === 0}
                  title="เลื่อนไปก่อนหน้า (หรือกดค้างแล้วลากการ์ด)"
                  className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 shadow ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-30"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => i < items.length - 1 && onMove(p.id, items[i + 1].id, "after")}
                  disabled={i === items.length - 1}
                  title="เลื่อนไปถัดไป (หรือกดค้างแล้วลากการ์ด)"
                  className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 shadow ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-2.5">
            <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
            <p className={`truncate text-[11px] ${faint}`}>
              ⭐ {p.rating} · ขายแล้ว {p.sold.toLocaleString("th-TH")}
            </p>
            <div className="mt-1.5">
              {/* ช่วงราคาต้องใช้ตารางราคาที่มากับชุดเต็ม — ยังไม่มาก็เว้นไว้ ไม่ให้โชว์ราคาผิดแล้วค่อยกระตุก */}
              {detailed ? <PriceBlock p={p} /> : <span className={`text-sm ${faint}`}>…</span>}
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

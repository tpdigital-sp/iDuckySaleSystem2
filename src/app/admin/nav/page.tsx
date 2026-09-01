"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import NavTiles from "@/components/NavTiles";
import {
  BLOCK_CATS,
  BLOCK_LIBRARY,
  BLOCK_META,
  GALLERY_RATIOS,
  defaultHomeBlocks,
  makeBlock,
  videoEmbedUrl,
  type BlockCat,
  type GalleryRatio,
  type HomeBlock,
  type HomeBlockKind,
} from "@/lib/home-layout";
import HomeGallery from "@/components/HomeGallery";
import GradientPicker from "@/components/GradientPicker";
import { fetchCategories, type ShopCategory } from "@/lib/categories";
import {
  DEFAULT_MEGA,
  DEFAULT_SITE_NAV,
  DEFAULT_TILES_BG,
  clearSiteNavCache,
  siteNavOf,
  type MegaBadge,
  type MegaColumn,
  type MegaGroup,
  type MegaItem,
  type MegaPromo,
  type NavLink,
  type NavPerk,
  type NavTile,
  type SiteNav,
  type TileSize,
} from "@/lib/home-nav";
import { MegaPanel } from "@/components/MegaMenu";
import { fetchProductNamesLite } from "@/lib/product-repo";
import type { Product } from "@/lib/products";
import { btnNeutral, btnPrimary, btnSmDanger, btnSmGhost, card, faint, h1, muted } from "@/lib/admin-ui";
import { Btn, Empty, PageHead, PageShell } from "@/components/admin/ui";
import { Grip, reorder, useSortList } from "@/components/admin/SortList";

/**
 * 🧭 เมนูหน้าร้าน — แอดมินจัดเมนูเองได้ ไม่ต้องแก้โค้ด
 *
 * 3 ส่วน: การ์ดนำทางบนหน้าแรก · ลิงก์บนแถบเมนูด้านบน · เมนูดรอปดาวน์เต็มความกว้าง
 * ตัวอย่างทุกจุดใช้คอมโพเนนต์ตัวเดียวกับหน้าร้านจริง — เห็นยังไง ลูกค้าเห็นอย่างนั้น
 */

type Tab = "hero" | "tiles" | "menu" | "mega" | "perks";

/** หน้าที่ลิงก์ไปได้ (ให้เลือกจากรายการ จะได้ไม่พิมพ์ผิด) */
const PAGES: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/products", label: "สินค้าทั้งหมด" },
  { href: "/products?sort=popular", label: "สินค้าขายดี" },
  { href: "/how-to-order", label: "วิธีสั่งซื้อ" },
  { href: "/about", label: "เกี่ยวกับเรา" },
  { href: "/articles", label: "บทความ" },
  { href: "/cart", label: "ตะกร้าสินค้า" },
  { href: "/account", label: "บัญชีของฉัน" },
  { href: "/account/orders", label: "ประวัติการสั่งซื้อ" },
  { href: "/account/profile", label: "ข้อมูลส่วนตัว" },
  { href: "/account/login", label: "เข้าสู่ระบบ / สมัครสมาชิก" },
];

const SIZES: { value: TileSize; label: string; hint: string }[] = [
  { value: "big", label: "ใหญ่", hint: "การ์ดใหญ่ด้านซ้าย (สูง 2 แถว)" },
  { value: "wide", label: "กว้าง", hint: "แถบยาวเต็มความกว้างที่เหลือ" },
  { value: "small", label: "เล็ก", hint: "การ์ดเล็ก เรียงต่อกันได้ 3 ใบ" },
];

const inputBase =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
const input = `w-full ${inputBase}`;

const newId = (p: string) => `${p}${Date.now().toString(36)}`;

/** ช่องเลือกลิงก์ — เลือกจากหน้าที่มีจริง หรือพิมพ์เองก็ได้ */
function LinkPicker({
  value,
  cats,
  onChange,
}: {
  value: string;
  cats: ShopCategory[];
  onChange: (v: string) => void;
}) {
  const catHrefs = cats.map((c) => ({ href: `/products?category=${c.id}`, label: `${c.emoji} ${c.name}` }));
  const known = [...PAGES, ...catHrefs].some((p) => p.href === value);
  const [custom, setCustom] = useState(!known);

  useEffect(() => {
    // โหลดค่าจากฐานมาแล้วเป็นลิงก์นอกรายการ → เปิดโหมดพิมพ์เองให้เลย
    if (!known) setCustom(true);
  }, [known]);

  return (
    <div className="space-y-1.5">
      <select
        value={custom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={input}
        aria-label="ลิงก์ปลายทาง"
      >
        <optgroup label="หน้าหลัก">
          {PAGES.map((p) => (
            <option key={p.href} value={p.href}>
              {p.label}
            </option>
          ))}
        </optgroup>
        {catHrefs.length > 0 && (
          <optgroup label="หมวดหมู่สินค้า">
            {catHrefs.map((p) => (
              <option key={p.href} value={p.href}>
                {p.label}
              </option>
            ))}
          </optgroup>
        )}
        <option value="__custom__">✏️ ลิงก์อื่น (พิมพ์เอง)</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/products?category=acrylic หรือ https://…"
          className={input}
        />
      )}
    </div>
  );
}

/** อัปโหลดรูปขึ้นคลังของเมนู (ใช้ร่วมกันทั้งปุ่มเลือกไฟล์และการลากวาง) */
async function uploadNavImage(file: File): Promise<{ url?: string; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "sitenav");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) return { error: j.error ?? "อัปโหลดไม่สำเร็จ" };
    return { url: j.url };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

/**
 * ครอบพื้นที่ไหนก็ได้ให้ "โยนรูปมาวาง" ได้ — ไฮไลต์ฟ้าตอนลากทับ แล้วส่งไฟล์รูปให้ onFiles
 * ปุ่มเลือกไฟล์เดิมยังใช้ได้เหมือนเดิม (อันนี้เป็นทางลัดเพิ่ม)
 */
function DropZone({
  onFiles,
  className = "",
  children,
  innerRef,
  style,
}: {
  onFiles: (files: File[]) => void;
  className?: string;
  children: ReactNode;
  /** ให้ตัวลากสลับลำดับจับ element ตัวนี้ได้ (ดู SortList) */
  innerRef?: (el: HTMLDivElement | null) => void;
  style?: CSSProperties;
}) {
  const [over, setOver] = useState(false);
  // dragenter/leave ยิงซ้ำทุกครั้งที่ลากผ่านลูกข้างใน — นับชั้นไว้กันไฮไลต์กะพริบ
  const depth = useRef(0);
  const hasFiles = (e: ReactDragEvent) => e.dataTransfer.types.includes("Files");
  return (
    <div
      ref={innerRef}
      style={style}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setOver(false);
        const imgs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (imgs.length) onFiles(imgs);
      }}
      className={`relative rounded-xl transition ${over ? "ring-2 ring-sky-400" : ""} ${className}`}
    >
      {children}
      {over && (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-sky-100/80 text-sm font-bold text-sky-700">
          🖼 วางรูปตรงนี้เลย
        </span>
      )}
    </div>
  );
}

/** ปุ่มอัปโหลดรูป — ใช้ได้ทั้งรูปการ์ด รูปโปรโมทในเมนู และรูปหัวคอลัมน์ */
function ImageField({
  value,
  onChange,
  label = "รูป (ไม่ใส่ก็ได้)",
  hint,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  label?: string;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    const r = await uploadNavImage(file);
    if (r.url) onChange(r.url);
    else setErr(r.error ?? "อัปโหลดไม่สำเร็จ");
    setBusy(false);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      {hint && <p className={`mt-0.5 text-[11px] leading-relaxed ${faint}`}>{hint}</p>}
      <DropZone className="mt-1.5 flex flex-wrap items-center gap-2 p-1" onFiles={(fs) => void upload(fs[0])}>
        {value && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={value} alt="" className="h-10 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
        )}
        <label className={`${btnNeutral} cursor-pointer text-xs`}>
          {busy ? "กำลังอัปโหลด…" : value ? "🖼 เปลี่ยนรูป" : "🖼 อัปโหลดรูป"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className={btnSmDanger}>
            เอารูปออก
          </button>
        )}
      </DropZone>
      {err && <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p>}
    </div>
  );
}

/** หัวข้อส่วนย่อยในตัวแก้ไขเมนูดรอปดาวน์ — เลขตรงกับผังด้านบน */
/**
 * ภาพจำลองหน้าตาบล็อก (วาดด้วยกล่องสี) — ใช้ในจานเลือกบล็อกของ Home Builder
 * pv = id ของตัวเลือกใน BLOCK_LIBRARY (ตัวเลือกชนิดเดียวกันแต่คนละแบบ ได้พรีวิวคนละภาพ)
 */
function BlockPreview({ pv }: { pv: string }) {
  const box = "rounded bg-slate-300";
  // ตารางรูปนิ่ง 2-4 คอลัมน์
  const gridMatch = pv.match(/^gallery-grid-(\d)$/);
  if (gridMatch) {
    const n = Number(gridMatch[1]);
    return (
      <span className="grid w-full max-w-40 gap-1" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`${n === 2 ? "h-12" : n === 3 ? "h-10" : "h-8"} ${box}`} />
        ))}
      </span>
    );
  }
  switch (pv) {
    case "gallery-banner":
      return (
        <span className="w-full max-w-40">
          <span className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">❮</span>
            <span className="h-11 flex-1 rounded-md bg-gradient-to-br from-sky-300 to-teal-200" />
            <span className="text-[10px] text-slate-400">❯</span>
          </span>
          <span className="mt-1 flex justify-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-sky-500" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
          </span>
        </span>
      );
    case "video":
      return (
        <span className="grid h-14 w-full max-w-40 place-items-center rounded-md bg-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-500 text-[10px] text-white">▶</span>
        </span>
      );
    case "cards":
      return (
        <span className="flex w-full max-w-40 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex-1 rounded bg-white p-0.5 ring-1 ring-slate-200">
              <span className={`block h-5 ${box}`} />
              <span className="mt-0.5 block h-1 rounded bg-slate-400" />
              <span className="mt-0.5 block h-1 w-3/4 rounded bg-slate-200" />
              <span className="mx-auto mt-0.5 block h-1.5 w-2/3 rounded-full bg-amber-400" />
            </span>
          ))}
        </span>
      );
    case "imagetext-right":
      return (
        <span className="flex w-full max-w-40 items-center gap-1.5">
          <span className="flex-1">
            <span className="block h-2 w-12 rounded bg-slate-400" />
            <span className="mt-1 block h-1.5 rounded bg-slate-300" />
            <span className="mt-0.5 block h-1.5 w-3/4 rounded bg-slate-300" />
            <span className="mt-1 block h-2.5 w-10 rounded-full bg-amber-400" />
          </span>
          <span className={`h-12 w-1/2 ${box}`} />
        </span>
      );
  }
  // ตัวเลือกที่เหลือ พรีวิวตามชนิดบล็อก
  const kind = (BLOCK_LIBRARY.find((v) => v.id === pv)?.kind ?? pv) as HomeBlockKind;
  switch (kind) {
    case "image":
      return <span className="block h-12 w-full max-w-40 rounded-md bg-gradient-to-br from-sky-300 to-teal-200" />;
    case "hero":
      return (
        <span className="block w-full max-w-40 rounded-md bg-gradient-to-br from-amber-200 to-yellow-100 p-1.5">
          <span className="block h-1.5 w-10 rounded bg-white/80" />
          <span className="mt-1 block h-2 w-20 rounded bg-amber-900/50" />
          <span className="mt-0.5 block h-1.5 w-16 rounded bg-amber-900/30" />
          <span className="mt-1.5 flex gap-1">
            <span className="h-2.5 w-8 rounded-full bg-amber-400" />
            <span className="h-2.5 w-8 rounded-full bg-white" />
          </span>
        </span>
      );
    case "tiles":
      return (
        <span className="grid w-full max-w-40 grid-cols-5 gap-0.5">
          <span className="col-span-2 row-span-2 h-11 rounded bg-sky-200" />
          <span className="col-span-3 h-5 rounded bg-cyan-200" />
          <span className="h-5 rounded bg-teal-200" />
          <span className="h-5 rounded bg-amber-200" />
          <span className="h-5 rounded bg-yellow-200" />
        </span>
      );
    case "perks":
      return (
        <span className="flex w-full max-w-40 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-8 flex-1 rounded bg-white ring-1 ring-slate-200" />
          ))}
        </span>
      );
    case "categories":
      return (
        <span className="flex w-full max-w-40 gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="flex-1">
              <span className={`block h-6 ${box}`} />
              <span className="mt-0.5 block h-1.5 rounded bg-slate-200" />
            </span>
          ))}
        </span>
      );
    case "products":
      return (
        <span className="w-full max-w-40">
          <span className="mb-1 block h-2 w-16 rounded bg-slate-400" />
          <span className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex-1">
                <span className={`block h-7 ${box}`} />
                <span className="mt-0.5 block h-1 rounded bg-slate-200" />
              </span>
            ))}
          </span>
        </span>
      );
    case "text":
      return (
        <span className="w-full max-w-32 text-center">
          <span className="mx-auto block h-2 w-20 rounded bg-slate-400" />
          <span className="mx-auto mt-1 block h-1.5 w-28 rounded bg-slate-300" />
          <span className="mx-auto mt-0.5 block h-1.5 w-24 rounded bg-slate-300" />
        </span>
      );
    case "imagetext":
      return (
        <span className="flex w-full max-w-40 items-center gap-1.5">
          <span className={`h-12 w-1/2 ${box}`} />
          <span className="flex-1">
            <span className="block h-2 w-12 rounded bg-slate-400" />
            <span className="mt-1 block h-1.5 rounded bg-slate-300" />
            <span className="mt-0.5 block h-1.5 w-3/4 rounded bg-slate-300" />
            <span className="mt-1 block h-2.5 w-10 rounded-full bg-amber-400" />
          </span>
        </span>
      );
    case "gallery":
      return (
        <span className="w-full max-w-40">
          <span className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">❮</span>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-9 flex-1 ${box}`} />
            ))}
            <span className="text-[10px] text-slate-400">❯</span>
          </span>
          <span className="mt-1 flex justify-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-sky-500" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
          </span>
        </span>
      );
    case "html":
      return (
        <span className="block w-full max-w-32 rounded-md bg-slate-800 p-1.5 text-left">
          <span className="block h-1.5 w-16 rounded bg-emerald-400/70" />
          <span className="mt-0.5 block h-1.5 w-20 rounded bg-sky-400/60" />
          <span className="mt-0.5 block h-1.5 w-12 rounded bg-emerald-400/70" />
        </span>
      );
    case "cta":
      return (
        <span className="block w-full max-w-36 rounded-md bg-gradient-to-r from-pink-200 to-amber-100 p-2 text-center">
          <span className="mx-auto block h-2 w-20 rounded bg-stone-500/60" />
          <span className="mx-auto mt-1.5 block h-3 w-16 rounded-full bg-rose-400" />
        </span>
      );
  }
}

function SectionHead({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
        {no}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-[11px] leading-snug text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

/** ผังแผงดรอปดาวน์ — ให้เห็นว่าส่วน ①②③ อยู่ตรงไหนของจริง */
function PanelMap() {
  return (
    <div className="flex h-28 w-full max-w-xs select-none gap-1.5 rounded-xl bg-white p-2 ring-1 ring-slate-200">
      <div className="grid w-1/4 place-items-center rounded-lg bg-sky-100 text-xs font-bold text-sky-700">①</div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="grid h-2/5 place-items-center rounded-lg bg-amber-100 text-xs font-bold text-amber-700">②</div>
        <div className="grid flex-1 place-items-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">③</div>
      </div>
    </div>
  );
}

function NavEditorInner() {
  const [nav, setNav] = useState<SiteNav>(DEFAULT_SITE_NAV);
  /** ลากสลับลำดับด้วยเมาส์ — ทุกลิสต์ในหน้านี้ใช้ตัวเดียวกัน */
  const sort = useSortList();
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [tab, setTab] = useState<Tab>("mega");
  /** กำลังอัปโหลดภาพแบนเนอร์จากกล่องตัวอย่างอยู่ */
  const [heroBusy, setHeroBusy] = useState(false);
  // ── Home Builder ──
  const [addOpen, setAddOpen] = useState(false);
  const [openBlock, setOpenBlock] = useState("");
  /** หมวดที่เลือกในจานเลือกบล็อก (all = ทุกหมวด · fav = ที่กดหัวใจไว้) */
  const [blockCat, setBlockCat] = useState<"all" | "fav" | BlockCat>("all");
  /** เปิดพรีวิวแกลเลอรี/สไลด์แบบที่ลูกค้าเห็น (ของบล็อกที่กางอยู่) */
  const [galleryPreview, setGalleryPreview] = useState(false);
  /** ตัวเลือกบล็อกที่กดหัวใจไว้ (จำในเครื่องของแอดมินคนนั้น) */
  const [blockFavs, setBlockFavs] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("iducky-block-favs") ?? "[]") as unknown;
      if (Array.isArray(saved)) setBlockFavs(saved.filter((x): x is string => typeof x === "string"));
    } catch {
      /* ค่าเสียในเครื่อง = เริ่มว่าง */
    }
  }, []);
  const toggleBlockFav = (id: string) =>
    setBlockFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem("iducky-block-favs", JSON.stringify(next));
      } catch {
        /* โหมดไม่ให้เก็บ = ใช้ได้แค่ในหน้านี้ */
      }
      return next;
    });
  /** ผังปัจจุบัน — ยังไม่เคยจัด = ผังมาตรฐานจาก tilesPos (แตะครั้งแรกค่อยบันทึกลง nav.home) */
  const home = nav.home ?? defaultHomeBlocks(nav.tilesPos ?? "hero");
  const setHome = (blocks: HomeBlock[]) => edit((n) => ({ ...n, home: blocks }));
  const patchBlock = (id: string, patch: Partial<HomeBlock>) =>
    setHome(home.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  /** หัวข้อที่กางอยู่ในตัวแก้ไข และหัวข้อที่กดดูตัวอย่างแผงอยู่ */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  /** สินค้าจริง — ใช้แสดงตัวอย่างคอลัมน์ที่ตั้งให้ดึงอัตโนมัติ */
  const [products, setProducts] = useState<Product[]>([]);
  /** โซนที่กำลังลากรูปค้างอยู่ ("gid" = ทั้งแถว · "gid|promoId" = ทับการ์ดใบนั้น) */
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dropBusy, setDropBusy] = useState(0);
  const [dropErr, setDropErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      const [r, cs] = await Promise.all([
        fetch("/api/nav", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetchCategories({ fresh: true }),
      ]);
      setNav(siteNavOf((r as { nav?: Partial<SiteNav> } | null)?.nav));
      setCats(cs.filter((c) => !c.hidden));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (tab !== "mega" || products.length) return;
    void fetchProductNamesLite().then(setProducts);
  }, [tab, products.length]);

  // กันเบราว์เซอร์เปิดไฟล์รูปทับหน้า ถ้าเผลอปล่อยรูปนอกกรอบวาง
  useEffect(() => {
    const block = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const edit = useCallback((fn: (n: SiteNav) => SiteNav) => {
    setNav((n) => fn(n));
    setDirty(true);
    setMsg("");
  }, []);

  const setTile = (id: string, patch: Partial<NavTile>) =>
    edit((n) => ({ ...n, tiles: n.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setLink = (id: string, patch: Partial<NavLink>) =>
    edit((n) => ({ ...n, menu: n.menu.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const setPerk = (id: string, patch: Partial<NavPerk>) =>
    edit((n) => ({ ...n, perks: n.perks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const setGroup = (gid: string, patch: Partial<MegaGroup>) =>
    edit((n) => ({ ...n, mega: n.mega.map((g) => (g.id === gid ? { ...g, ...patch } : g)) }));
  const setCols = (gid: string, fn: (cols: MegaColumn[]) => MegaColumn[]) =>
    edit((n) => ({ ...n, mega: n.mega.map((g) => (g.id === gid ? { ...g, columns: fn(g.columns) } : g)) }));
  const setCol = (gid: string, cid: string, patch: Partial<MegaColumn>) =>
    setCols(gid, (cols) => cols.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  const setItems = (gid: string, cid: string, fn: (items: MegaItem[]) => MegaItem[]) =>
    setCols(gid, (cols) => cols.map((c) => (c.id === cid ? { ...c, items: fn(c.items) } : c)));
  const setPromos = (gid: string, fn: (ps: MegaPromo[]) => MegaPromo[]) =>
    edit((n) => ({ ...n, mega: n.mega.map((g) => (g.id === gid ? { ...g, promos: fn(g.promos ?? []) } : g)) }));

  /** ลากรูปมาวางในแถวภาพสินค้าแนะนำ — วางลงแถว = แทรกต่อท้าย · วางทับการ์ด = เปลี่ยนรูปใบนั้น */
  async function dropPromoFiles(gid: string, files: File[], replacePromoId?: string) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setDragOver(null);
    if (!imgs.length) return;
    setDropErr("");
    setDropBusy(imgs.length);
    for (const f of imgs) {
      const r = await uploadNavImage(f);
      if (r.url) {
        const url = r.url;
        // ต้องเก็บใส่ตัวแปรใหม่ก่อน — updater ของ React ทำงานทีหลัง ถ้าอ้าง replacePromoId ตรง ๆ จะเจอค่าที่ถูกล้างไปแล้ว
        const target = replacePromoId;
        replacePromoId = undefined; // ลากมาหลายรูป: รูปแรกแทนที่ ที่เหลือแทรกต่อท้าย
        if (target) {
          setPromos(gid, (ps) => ps.map((x) => (x.id === target ? { ...x, image: url } : x)));
        } else {
          setPromos(gid, (ps) => [...ps, { id: newId("p"), image: url, href: "/products" }]);
        }
      } else {
        setDropErr(r.error ?? "อัปโหลดไม่สำเร็จ");
      }
      setDropBusy((n) => n - 1);
    }
  }

  /** เลื่อนขึ้น/ลงทีละขั้นด้วยปุ่ม ↑↓ — จอสัมผัสใช้ทางนี้ (ลากด้วยนิ้วชนกับการเลื่อนหน้า) */
  function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  }

  /**
   * ── ลากสลับลำดับด้วยเมาส์ (ดู @/components/admin/SortList) ──
   * ประกาศไว้ที่เดียว แถวไหนจะลากได้ก็เรียกเอา .row ไปแปะที่แถว
   * แถวที่เป็นการ์ดใหญ่ (กางตัวแก้ไขข้างในได้) ใช้ mode "handle" แล้วเอา .handle
   * ไปแปะที่จุดจับ — กันเผลอลากทั้งการ์ดตอนกดพื้นที่ว่างของตัวแก้ไข
   * คีย์ของลิสต์ที่อยู่ในลูปชั้นนอกต้องผสม id ลงไป ไม่งั้นทุกกลุ่มใช้ทะเบียนเดียวกัน
   */
  const dragHome = (i: number) =>
    sort.item("home", i, home.length, (f, t) => setHome(reorder(home, f, t)), { mode: "handle" });
  const dragTile = (i: number) =>
    sort.item("tiles", i, nav.tiles.length, (f, t) => edit((n) => ({ ...n, tiles: reorder(n.tiles, f, t) })), {
      mode: "handle",
    });
  const dragMega = (i: number) =>
    sort.item("mega", i, nav.mega.length, (f, t) => edit((n) => ({ ...n, mega: reorder(n.mega, f, t) })), {
      mode: "handle",
    });
  const dragCol = (g: MegaGroup, i: number) =>
    sort.item(`cols:${g.id}`, i, g.columns.length, (f, t) => setCols(g.id, (cols) => reorder(cols, f, t)), {
      mode: "handle",
    });
  const dragItem = (g: MegaGroup, c: MegaColumn, i: number) =>
    sort.item(`items:${g.id}:${c.id}`, i, c.items.length, (f, t) => setItems(g.id, c.id, (xs) => reorder(xs, f, t)));
  const dragPerk = (i: number) =>
    sort.item("perks", i, nav.perks.length, (f, t) => edit((n) => ({ ...n, perks: reorder(n.perks, f, t) })));
  const dragLink = (i: number) =>
    sort.item("menu", i, nav.menu.length, (f, t) => edit((n) => ({ ...n, menu: reorder(n.menu, f, t) })));
  const dragPromo = (g: MegaGroup, i: number) =>
    sort.item(`promos:${g.id}`, i, (g.promos ?? []).length, (f, t) => setPromos(g.id, (ps) => reorder(ps, f, t)), {
      axis: "x",
    });
  const dragImg = (b: HomeBlock, i: number) =>
    sort.item(`imgs:${b.id}`, i, (b.images ?? []).length, (f, t) => patchBlock(b.id, { images: reorder(b.images ?? [], f, t) }), {
      axis: "x",
    });
  const dragCard = (b: HomeBlock, i: number) =>
    sort.item(`cards:${b.id}`, i, (b.cards ?? []).length, (f, t) => patchBlock(b.id, { cards: reorder(b.cards ?? [], f, t) }), {
      axis: "x",
      mode: "handle",
    });

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/nav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nav }),
      });
      const j = (await res.json()) as { error?: string; nav?: SiteNav };
      if (!res.ok) {
        setMsg(j.error ?? "บันทึกไม่สำเร็จ");
      } else {
        if (j.nav) setNav(siteNavOf(j.nav));
        clearSiteNavCache(); // หน้าร้านจะได้เห็นของใหม่ทันที
        setDirty(false);
        setMsg("บันทึกแล้ว ✓");
      }
    } catch {
      setMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  const shownTiles = nav.tilesOn ? nav.tiles.filter((t) => !t.hidden) : [];

  if (loading)
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงเมนูและผังหน้าแรกจากเซิร์ฟเวอร์" />
      </PageShell>
    );

  return (
    <PageShell>
      <PageHead
        group="ระบบ"
        title="เมนู & หน้าแรก"
        sub="คุมทุกอย่างที่ลูกค้าเห็นบนหัวเว็บและหน้าแรก — แก้แล้วกดบันทึก ลูกค้าเห็นทันที"
        tools={<Btn href="/">เปิดหน้าร้านจริง</Btn>}
      />

      {/* ── 🏠 ผังหน้าแรก (Home Builder) — เพิ่ม/ลบ/เลื่อน/ซ่อน บล็อกได้เหมือน page builder ── */}
      <section className="dkb-g mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">🏠 ผังหน้าแรก — เรียงจากบนลงล่างตามที่ลูกค้าเห็น</h2>
            <p className={`mt-0.5 text-xs ${faint}`}>
              ลากที่จุดจับ ⣿ สลับลำดับ (หรือกดปุ่ม ↑↓) · 👁 ซ่อนชั่วคราว · กดชื่อบล็อกเพื่อตั้งค่า · อย่าลืมกด 💾 บันทึก
            </p>
          </div>
          <button type="button" onClick={() => setAddOpen((v) => !v)} className={btnPrimary}>
            {addOpen ? "✕ ปิด" : "＋ เพิ่มบล็อก"}
          </button>
        </div>

        {/* จานเลือกชนิดบล็อก — กรองตามหมวดแบบ Shopware + กดหัวใจเก็บที่ใช้บ่อย */}
        {addOpen && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all" as const, label: "ทั้งหมด" },
                ...(blockFavs.length ? [{ id: "fav" as const, label: "❤️ ที่ใช้บ่อย" }] : []),
                ...BLOCK_CATS,
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBlockCat(c.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    blockCat === c.id ? "bg-slate-900 text-white shadow" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {BLOCK_LIBRARY.filter((v) =>
                blockCat === "all" ? true : blockCat === "fav" ? blockFavs.includes(v.id) : v.cat === blockCat
              ).map((v) => (
                <div
                  key={v.id}
                  className="group relative rounded-xl bg-white ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-amber-300"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const b = { ...makeBlock(v.kind), ...v.preset };
                      setHome([...home, b]);
                      setOpenBlock(b.id);
                      setAddOpen(false);
                    }}
                    className="block w-full p-3 text-left"
                  >
                    {/* พรีวิวหน้าตาบล็อก (วาดด้วยกล่องสี — เห็นภาพก่อนเพิ่ม) */}
                    <span className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100 p-2">
                      <BlockPreview pv={v.id} />
                    </span>
                    <span className="block text-sm font-bold text-slate-800">
                      {v.icon} {v.label}
                    </span>
                    <span className={`mt-0.5 block text-[11px] leading-snug ${faint}`}>{v.desc}</span>
                  </button>
                  {/* หัวใจเก็บเข้า "ที่ใช้บ่อย" (แบบ Favourites ของ Shopware) */}
                  <button
                    type="button"
                    onClick={() => toggleBlockFav(v.id)}
                    title={blockFavs.includes(v.id) ? "เอาออกจากที่ใช้บ่อย" : "เก็บเข้าที่ใช้บ่อย"}
                    className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-sm transition ${
                      blockFavs.includes(v.id)
                        ? "bg-rose-100 text-rose-500"
                        : "bg-white/80 text-slate-300 opacity-0 ring-1 ring-slate-200 hover:text-rose-400 group-hover:opacity-100"
                    }`}
                  >
                    {blockFavs.includes(v.id) ? "❤️" : "♡"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          {home.map((b, i) => {
            const meta = BLOCK_META[b.kind];
            const open = openBlock === b.id;
            /** ป้ายสรุปสั้น ๆ ต่อบล็อก */
            const summary =
              b.kind === "products"
                ? b.heading || (b.source === "featured" ? "สินค้าแนะนำ" : b.source === "category" ? `หมวด ${b.category ?? "-"}` : "สินค้าขายดี")
                : b.kind === "image"
                  ? b.image
                    ? "มีภาพแล้ว"
                    : "ยังไม่ได้ใส่ภาพ"
                  : b.kind === "video"
                    ? b.videoUrl
                      ? "มีวิดีโอแล้ว"
                      : "ยังไม่ได้วางลิงก์วิดีโอ"
                    : b.kind === "cards"
                      ? b.heading || `การ์ด ${(b.cards ?? []).length} ใบ`
                      : b.kind === "text" || b.kind === "cta"
                        ? b.heading || meta.desc
                        : meta.desc;
            return (
              <div key={b.id} {...dragHome(i).row} className={`rounded-xl ring-1 transition ${b.hidden ? "opacity-55" : ""} ${open ? "bg-amber-50/60 ring-amber-300" : "bg-slate-50 ring-slate-100"}`}>
                <div className="flex w-full items-center gap-2 px-3 py-2">
                  {/* เลขลำดับ = จุดจับลาก (ลากทั้งใบไม่ได้ เพราะข้างในเป็นตัวแก้ไขที่กางออกมา) */}
                  <span
                    {...dragHome(i).handle}
                    title="ลากเพื่อสลับลำดับ"
                    className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-slate-300"
                  >
                    <Grip className="px-0" />
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenBlock(open ? "" : b.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="shrink-0 text-base">{meta.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800">{meta.label}</span>
                      <span className={`block truncate text-[11px] ${faint}`}>{summary}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => i > 0 && setHome(move(home, i, -1))}
                    disabled={i === 0}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => i < home.length - 1 && setHome(move(home, i, 1))}
                    disabled={i === home.length - 1}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setHome(home.map((x) => (x.id === b.id ? { ...x, hidden: !x.hidden } : x)))}
                    className={btnSmGhost}
                    title={b.hidden ? "แสดงบล็อกนี้" : "ซ่อนบล็อกนี้ (ยังไม่ลบ)"}
                  >
                    {b.hidden ? "🚫" : "👁"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`ลบบล็อก “${meta.label}” ออกจากหน้าแรก?`)) return;
                      setHome(home.filter((x) => x.id !== b.id));
                    }}
                    className={btnSmDanger}
                    aria-label="ลบบล็อก"
                  >
                    ลบ
                  </button>
                </div>

                {/* ตั้งค่าของบล็อก (กางเมื่อกดชื่อ) */}
                {open && (
                  <div className="border-t border-amber-200/60 px-3 py-3">
                    {(b.kind === "hero" || b.kind === "tiles" || b.kind === "perks") && (
                        <button
                          type="button"
                          onClick={() => setTab(b.kind as Tab)}
                          className={`${btnNeutral} text-xs`}
                        >
                          ✎ ตั้งค่า{meta.label} (เปิดแท็บด้านล่าง)
                        </button>
                      )}
                    {b.kind === "categories" && (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          หัวข้อ
                          <input
                            value={b.heading ?? ""}
                            onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                            placeholder="🗂️ หมวดหมู่สินค้า"
                            className={`w-64 ${inputBase}`}
                          />
                        </label>
                        <Link href="/admin/settings?tab=cats" className={`${btnNeutral} text-xs`}>
                          ✎ แก้รูป/ชื่อหมวด (ตั้งค่าระบบ) ↗
                        </Link>
                      </div>
                    )}
                    {/* ตัวแก้ไขเรียงตามโครงสร้างบล็อกจริง — เห็นยังไง ลูกค้าเห็นอย่างนั้น */}
                    {b.kind === "image" && (
                      <DropZone
                        className="space-y-2 p-1"
                        onFiles={async (fs) => {
                          const r = await uploadNavImage(fs[0]);
                          if (r.url) patchBlock(b.id, { image: r.url });
                        }}
                      >
                        <label className="group/img relative block cursor-pointer overflow-hidden rounded-xl">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              const r = await uploadNavImage(f);
                              if (r.url) patchBlock(b.id, { image: r.url });
                            }}
                          />
                          {b.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.image} alt="" className="w-full rounded-xl ring-1 ring-slate-200" />
                          ) : (
                            <span className="grid h-36 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-center text-xs font-semibold text-slate-400">
                              🖼 กดหรือลากรูปมาวางตรงนี้
                              <br />
                              (ภาพเต็มความกว้าง · แนะนำกว้าง 1600px ขึ้นไป)
                            </span>
                          )}
                          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-700 shadow ring-1 ring-slate-200">
                            📤 {b.image ? "กดเพื่อเปลี่ยนภาพ" : "กดเพื่อใส่ภาพ"}
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 text-[11px] font-semibold ${faint}`}>กดที่ภาพแล้วไป →</span>
                          <div className="max-w-md flex-1">
                            <LinkPicker value={b.href ?? "/products"} cats={cats} onChange={(v) => patchBlock(b.id, { href: v })} />
                          </div>
                        </div>
                      </DropZone>
                    )}
                    {b.kind === "products" && (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                          หัวข้อแถว
                          <input
                            value={b.heading ?? ""}
                            onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                            placeholder="🔥 สินค้าขายดี"
                            className={`w-56 ${inputBase}`}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                          ดึงสินค้าจาก
                          <select
                            value={b.source ?? "best"}
                            onChange={(e) => patchBlock(b.id, { source: e.target.value as HomeBlock["source"] })}
                            className={inputBase}
                          >
                            <option value="best">🔥 ขายดี (ตามยอดขายจริง)</option>
                            <option value="featured">💛 สินค้าแนะนำ (ที่ติ๊กไว้)</option>
                            <option value="category">🗂️ ตามหมวด…</option>
                          </select>
                        </label>
                        {b.source === "category" && (
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            หมวด
                            <select
                              value={b.category ?? ""}
                              onChange={(e) => patchBlock(b.id, { category: e.target.value })}
                              className={inputBase}
                            >
                              <option value="">— เลือกหมวด —</option>
                              {cats.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                          จำนวนชิ้น
                          <select
                            value={b.limit ?? 4}
                            onChange={(e) => patchBlock(b.id, { limit: Number(e.target.value) })}
                            className={inputBase}
                          >
                            {[4, 8, 12].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {b.kind === "imagetext" && (
                      <DropZone
                        className="p-1"
                        onFiles={async (fs) => {
                          const r = await uploadNavImage(fs[0]);
                          if (r.url) patchBlock(b.id, { image: r.url });
                        }}
                      >
                        {/* สลับซ้าย/ขวา — ผังด้านล่างสลับตามให้เห็นเลยว่าลูกค้าจะเห็นแบบไหน */}
                        <div className="mb-2 flex items-center gap-2">
                          <span className={`text-[11px] font-semibold ${faint}`}>ตำแหน่งรูป</span>
                          <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                            {(["left", "right"] as const).map((al) => (
                              <button
                                key={al}
                                type="button"
                                onClick={() => patchBlock(b.id, { align: al })}
                                className={`px-2.5 py-1 text-[11px] font-semibold ${(b.align ?? "left") === al ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
                              >
                                {al === "left" ? "◧ รูปซ้าย" : "◨ รูปขวา"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid items-stretch gap-3 md:grid-cols-2">
                          {/* คอลัมน์รูป — อยู่ฝั่งเดียวกับที่ลูกค้าเห็นจริง */}
                          <label
                            className={`relative block min-h-36 cursor-pointer overflow-hidden rounded-xl ${b.align === "right" ? "md:order-2" : ""}`}
                          >
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (!f) return;
                                const r = await uploadNavImage(f);
                                if (r.url) patchBlock(b.id, { image: r.url });
                              }}
                            />
                            {b.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={b.image} alt="" className="h-full w-full rounded-xl object-cover ring-1 ring-slate-200" />
                            ) : (
                              <span className="grid h-full min-h-36 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-center text-xs font-semibold text-slate-400">
                                🖼 กดหรือลากรูปมาวางตรงนี้
                              </span>
                            )}
                            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-700 shadow ring-1 ring-slate-200">
                              📤 {b.image ? "เปลี่ยนรูป" : "ใส่รูป"}
                            </span>
                          </label>
                          {/* คอลัมน์ข้อความ — หัวข้อ / ข้อความ / ปุ่ม เรียงเหมือนหน้าร้าน */}
                          <div className={`flex flex-col gap-2 ${b.align === "right" ? "md:order-1" : ""}`}>
                            <input
                              value={b.heading ?? ""}
                              onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                              placeholder="หัวข้อ"
                              className={`w-full font-bold ${inputBase}`}
                            />
                            <textarea
                              value={b.body ?? ""}
                              onChange={(e) => patchBlock(b.id, { body: e.target.value })}
                              placeholder="ข้อความประกอบรูป"
                              rows={3}
                              className={`w-full flex-1 ${inputBase}`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={b.btnLabel ?? ""}
                                onChange={(e) => patchBlock(b.id, { btnLabel: e.target.value })}
                                placeholder="ข้อความบนปุ่ม (เว้นว่าง = ไม่มีปุ่ม)"
                                className={`w-48 ${inputBase}`}
                              />
                              <div className="min-w-44 flex-1">
                                <LinkPicker value={b.btnHref ?? "/products"} cats={cats} onChange={(v) => patchBlock(b.id, { btnHref: v })} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </DropZone>
                    )}
                    {b.kind === "gallery" && (
                      <DropZone
                        className="space-y-2.5 p-1"
                        onFiles={async (files) => {
                          // ลากมาหลายรูป = อัปโหลดครบก่อน แล้วค่อยเติมทีเดียวผ่านค่า state ล่าสุด (กันรูปทับกัน)
                          const urls: string[] = [];
                          for (const f of files) {
                            const r = await uploadNavImage(f);
                            if (r.url) urls.push(r.url);
                          }
                          if (urls.length)
                            edit((n) => ({
                              ...n,
                              home: (n.home ?? defaultHomeBlocks(n.tilesPos ?? "hero")).map((x) =>
                                x.id === b.id
                                  ? { ...x, images: [...(x.images ?? []), ...urls.map((src) => ({ src }))] }
                                  : x
                              ),
                            }));
                        }}
                      >
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            หัวข้อ (เว้นว่าง = ไม่แสดง)
                            <input
                              value={b.heading ?? ""}
                              onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                              placeholder="ALL PRODUCT"
                              className={`w-56 ${inputBase}`}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            รูปแบบ
                            <select
                              value={b.display ?? "grid"}
                              onChange={(e) => patchBlock(b.id, { display: e.target.value as HomeBlock["display"] })}
                              className={inputBase}
                            >
                              <option value="slider">🎠 สไลด์เลื่อนอัตโนมัติ (แบบ ALL PRODUCT)</option>
                              <option value="grid">▦ ตารางนิ่ง</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            เห็นพร้อมกัน (จอใหญ่)
                            <select
                              value={b.cols ?? 3}
                              onChange={(e) => patchBlock(b.id, { cols: Number(e.target.value) })}
                              className={inputBase}
                            >
                              {[2, 3, 4].map((n) => (
                                <option key={n} value={n}>{n} ใบ</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            สัดส่วนภาพ
                            <select
                              value={b.ratio ?? "16/12"}
                              onChange={(e) => patchBlock(b.id, { ratio: e.target.value as GalleryRatio })}
                              className={inputBase}
                            >
                              <option value="16/12">แนวนอน 16:12 (เดิม)</option>
                              <option value="16/9">จอกว้าง 16:9</option>
                              <option value="21/9">แบนเนอร์กว้าง 21:9</option>
                              <option value="1/1">จัตุรัส 1:1</option>
                              <option value="3/4">แนวตั้ง 3:4</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            การแสดงภาพ
                            <select
                              value={b.fit ?? "cover"}
                              onChange={(e) => patchBlock(b.id, { fit: e.target.value as HomeBlock["fit"] })}
                              className={inputBase}
                            >
                              <option value="cover">✂️ ครอปให้เต็มกรอบ (เดิม)</option>
                              <option value="contain">🖼 เห็นเต็มภาพ ไม่ครอป</option>
                            </select>
                          </label>
                          {(b.images ?? []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => setGalleryPreview((v) => !v)}
                              className={`${galleryPreview ? btnPrimary : btnNeutral} text-xs`}
                            >
                              {galleryPreview ? "✕ ปิดพรีวิว" : "👀 ดูพรีวิวแบบที่ลูกค้าเห็น"}
                            </button>
                          )}
                        </div>
                        {/* พรีวิวของจริง — คอมโพเนนต์เดียวกับหน้าร้าน (สไลด์เลื่อนเอง กดลูกศร/จุดได้) */}
                        {galleryPreview && (b.images ?? []).length > 0 && (
                          <div className="rounded-2xl bg-white p-2 ring-2 ring-sky-200">
                            <HomeGallery
                              heading={b.heading}
                              images={b.images ?? []}
                              cols={b.cols ?? 3}
                              display={b.display ?? "grid"}
                              fit={b.fit ?? "cover"}
                              ratio={b.ratio ?? "16/12"}
                            />
                          </div>
                        )}
                        {/* เรียงรูปเป็นตารางตามจำนวนคอลัมน์ที่ตั้ง — เห็นผังเหมือนหน้าร้านจริง */}
                        {b.display !== "grid" && (b.images ?? []).length > 0 && (
                          <p className={`text-[11px] ${faint}`}>🎠 บนหน้าร้านจะเลื่อนเป็นสไลด์ — ลำดับซ้าย→ขวาตามนี้</p>
                        )}
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(b.cols ?? 3, 1), 4)}, minmax(0, 1fr))` }}
                        >
                          {(b.images ?? []).map((im, ii) => (
                            <div key={ii} {...dragImg(b, ii).row} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={im.src}
                                  alt=""
                                  style={{ aspectRatio: b.ratio ?? "16/12" }}
                                  className={`w-full ${b.fit === "contain" ? "object-contain" : "object-cover"}`}
                                />
                                <span className="absolute right-1.5 top-1.5 flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => ii > 0 && patchBlock(b.id, { images: move(b.images ?? [], ii, -1) })}
                                    disabled={ii === 0}
                                    className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs text-slate-600 shadow disabled:opacity-30"
                                    aria-label="เลื่อนรูปไปก่อนหน้า"
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => ii < (b.images ?? []).length - 1 && patchBlock(b.id, { images: move(b.images ?? [], ii, 1) })}
                                    disabled={ii === (b.images ?? []).length - 1}
                                    className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs text-slate-600 shadow disabled:opacity-30"
                                    aria-label="เลื่อนรูปไปถัดไป"
                                  >
                                    →
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => patchBlock(b.id, { images: (b.images ?? []).filter((_, j) => j !== ii) })}
                                    className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-rose-500 shadow"
                                    aria-label="ลบรูปนี้"
                                  >
                                    ✕
                                  </button>
                                </span>
                              </div>
                              <div className="p-1.5">
                                <LinkPicker
                                  value={im.href ?? ""}
                                  cats={cats}
                                  onChange={(v) =>
                                    patchBlock(b.id, { images: (b.images ?? []).map((x, j) => (j === ii ? { ...x, href: v } : x)) })
                                  }
                                />
                              </div>
                            </div>
                          ))}
                          {/* ช่องเพิ่มรูปต่อท้าย — กดเลือกไฟล์ หรือลากรูปมาวางที่ไหนก็ได้ในบล็อกนี้ */}
                          <label className="grid min-h-28 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-center text-xs font-semibold text-slate-400 transition hover:border-sky-400 hover:text-sky-500">
                            ＋ เพิ่มรูป
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              multiple
                              className="hidden"
                              onChange={async (e) => {
                                const files = [...(e.target.files ?? [])];
                                e.target.value = "";
                                const urls: string[] = [];
                                for (const f of files) {
                                  const r = await uploadNavImage(f);
                                  if (r.url) urls.push(r.url);
                                }
                                if (urls.length)
                                  edit((n) => ({
                                    ...n,
                                    home: (n.home ?? defaultHomeBlocks(n.tilesPos ?? "hero")).map((x) =>
                                      x.id === b.id
                                        ? { ...x, images: [...(x.images ?? []), ...urls.map((src) => ({ src }))] }
                                        : x
                                    ),
                                  }));
                              }}
                            />
                          </label>
                        </div>
                      </DropZone>
                    )}
                    {b.kind === "video" && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            หัวข้อ (เว้นว่าง = ไม่แสดง)
                            <input
                              value={b.heading ?? ""}
                              onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                              placeholder="🎬 วิดีโอแนะนำร้าน"
                              className={`w-56 ${inputBase}`}
                            />
                          </label>
                          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold text-slate-500">
                            ลิงก์วิดีโอ (YouTube / Vimeo)
                            <input
                              value={b.videoUrl ?? ""}
                              onChange={(e) => patchBlock(b.id, { videoUrl: e.target.value })}
                              placeholder="https://www.youtube.com/watch?v=…"
                              className={`w-full ${inputBase}`}
                            />
                          </label>
                        </div>
                        {b.videoUrl?.trim() ? (
                          videoEmbedUrl(b.videoUrl) ? (
                            <iframe
                              src={videoEmbedUrl(b.videoUrl)!}
                              title="ตัวอย่างวิดีโอ"
                              className="aspect-video w-full max-w-md rounded-xl bg-black"
                              allowFullScreen
                            />
                          ) : (
                            <p className="text-xs font-semibold text-rose-600">
                              ลิงก์นี้ใช้ไม่ได้ — รองรับเฉพาะ YouTube (youtube.com / youtu.be) และ Vimeo
                            </p>
                          )
                        ) : (
                          <p className={`text-[11px] ${faint}`}>
                            💡 คัดลอกลิงก์จากช่อง URL ของ YouTube มาวางได้เลย (รองรับทั้งคลิปปกติ / Shorts / youtu.be)
                          </p>
                        )}
                      </div>
                    )}
                    {b.kind === "cards" && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                            หัวข้อเหนือการ์ด (เว้นว่าง = ไม่แสดง)
                            <input
                              value={b.heading ?? ""}
                              onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                              placeholder="บริการของเรา"
                              className={`w-64 ${inputBase}`}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={(b.cards ?? []).length >= 4}
                            onClick={() =>
                              patchBlock(b.id, {
                                cards: [...(b.cards ?? []), { title: `หัวข้อการ์ด ${(b.cards ?? []).length + 1}`, body: "", btnLabel: "", btnHref: "/products" }],
                              })
                            }
                            className={`${btnNeutral} text-xs disabled:opacity-40`}
                          >
                            ＋ เพิ่มการ์ด (สูงสุด 4 ใบ)
                          </button>
                        </div>
                        {/* การ์ดเรียงแถวเดียวกันเหมือนหน้าร้านจริง — รูปบน · หัวข้อ · คำอธิบาย · ปุ่มล่าง */}
                        <div
                          className="grid items-stretch gap-2.5"
                          style={{ gridTemplateColumns: `repeat(${Math.min(Math.max((b.cards ?? []).length, 2), 4)}, minmax(0, 1fr))` }}
                        >
                          {(b.cards ?? []).map((cd, ci) => (
                            <DropZone
                              key={ci}
                              innerRef={dragCard(b, ci).row.ref}
                              style={dragCard(b, ci).row.style}
                              className="flex flex-col overflow-hidden bg-white ring-1 ring-slate-200"
                              onFiles={async (fs) => {
                                const r = await uploadNavImage(fs[0]);
                                if (r.url)
                                  patchBlock(b.id, {
                                    cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, image: r.url } : x)),
                                  });
                              }}
                            >
                              {/* แถบคุมบาง ๆ บนหัวการ์ด */}
                              <div className="flex items-center gap-1 bg-slate-50 px-2 py-1">
                                <span
                                  {...dragCard(b, ci).handle}
                                  title="ลากเพื่อสลับลำดับการ์ด"
                                  className="flex flex-1 items-center gap-1 text-[10px] font-bold text-slate-400"
                                >
                                  <Grip />
                                  ใบที่ {ci + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => ci > 0 && patchBlock(b.id, { cards: move(b.cards ?? [], ci, -1) })}
                                  disabled={ci === 0}
                                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-slate-500 hover:bg-white disabled:opacity-30"
                                  aria-label="เลื่อนการ์ดไปก่อนหน้า"
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  onClick={() => ci < (b.cards ?? []).length - 1 && patchBlock(b.id, { cards: move(b.cards ?? [], ci, 1) })}
                                  disabled={ci === (b.cards ?? []).length - 1}
                                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-slate-500 hover:bg-white disabled:opacity-30"
                                  aria-label="เลื่อนการ์ดไปถัดไป"
                                >
                                  →
                                </button>
                                <button
                                  type="button"
                                  onClick={() => patchBlock(b.id, { cards: (b.cards ?? []).filter((_, j) => j !== ci) })}
                                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-rose-500 hover:bg-rose-50"
                                  aria-label="ลบการ์ดนี้"
                                >
                                  ✕
                                </button>
                              </div>
                              {/* รูปบนสุดของการ์ด — กด/ลากวางเพื่อใส่ */}
                              <label className="relative block cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!f) return;
                                    const r = await uploadNavImage(f);
                                    if (r.url)
                                      patchBlock(b.id, {
                                        cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, image: r.url } : x)),
                                      });
                                  }}
                                />
                                {cd.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={cd.image} alt="" className="aspect-[16/11] w-full object-cover" />
                                ) : (
                                  <span className="grid aspect-[16/11] w-full place-items-center border-b-2 border-dashed border-slate-200 bg-slate-50 text-center text-[11px] font-semibold text-slate-400">
                                    🖼 กด/ลากรูป
                                    <br />
                                    มาวางตรงนี้
                                  </span>
                                )}
                                {cd.image && (
                                  <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-600 shadow">
                                    📤 เปลี่ยนรูป
                                  </span>
                                )}
                              </label>
                              {/* ข้อความกลางการ์ด + ปุ่มล่าง — ตำแหน่งเดียวกับของจริง */}
                              <div className="flex flex-1 flex-col gap-1.5 p-2">
                                <input
                                  value={cd.title}
                                  onChange={(e) =>
                                    patchBlock(b.id, { cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, title: e.target.value } : x)) })
                                  }
                                  placeholder="หัวข้อการ์ด"
                                  className={`w-full text-center font-bold ${inputBase}`}
                                />
                                <textarea
                                  value={cd.body ?? ""}
                                  onChange={(e) =>
                                    patchBlock(b.id, { cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, body: e.target.value } : x)) })
                                  }
                                  placeholder="คำอธิบายสั้น ๆ"
                                  rows={2}
                                  className={`w-full flex-1 text-center ${inputBase}`}
                                />
                                <input
                                  value={cd.btnLabel ?? ""}
                                  onChange={(e) =>
                                    patchBlock(b.id, {
                                      cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, btnLabel: e.target.value } : x)),
                                    })
                                  }
                                  placeholder="ปุ่ม (ว่าง = ไม่มี)"
                                  className={`w-full text-center ${inputBase}`}
                                />
                                {(cd.btnLabel ?? "").trim() && (
                                  <LinkPicker
                                    value={cd.btnHref ?? "/products"}
                                    cats={cats}
                                    onChange={(v) =>
                                      patchBlock(b.id, {
                                        cards: (b.cards ?? []).map((x, j) => (j === ci ? { ...x, btnHref: v } : x)),
                                      })
                                    }
                                  />
                                )}
                              </div>
                            </DropZone>
                          ))}
                        </div>
                      </div>
                    )}
                    {b.kind === "html" && (
                      <div className="space-y-1.5">
                        <textarea
                          value={b.html ?? ""}
                          onChange={(e) => patchBlock(b.id, { html: e.target.value })}
                          rows={10}
                          spellCheck={false}
                          className="w-full resize-y rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-emerald-200 outline-none"
                          placeholder="<div>...</div>"
                        />
                        <p className={`text-[11px] ${faint}`}>
                          💡 ใส่ HTML + style ในตัวได้ · ระบบตัด script / on-event / iframe (ยกเว้น YouTube) ให้อัตโนมัติตอนบันทึก
                        </p>
                      </div>
                    )}
                    {b.kind === "text" && (
                      // ข้อความจริงจัดกึ่งกลาง — ตัวแก้ไขก็กึ่งกลางเหมือนกัน
                      <div className="mx-auto max-w-2xl space-y-2 text-center">
                        <input
                          value={b.heading ?? ""}
                          onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                          placeholder="หัวข้อ"
                          className={`w-full text-center text-base font-extrabold ${inputBase}`}
                        />
                        <textarea
                          value={b.body ?? ""}
                          onChange={(e) => patchBlock(b.id, { body: e.target.value })}
                          placeholder="ข้อความ (กด Enter ขึ้นบรรทัดใหม่ได้)"
                          rows={2}
                          className={`w-full text-center ${inputBase}`}
                        />
                      </div>
                    )}
                    {b.kind === "cta" && (
                      // กล่องสีชมพูเหมือนบนหน้าร้านจริง — พิมพ์ลงไปในกล่องได้เลย
                      <div className="space-y-2 rounded-2xl bg-gradient-to-r from-pink-200 via-rose-100 to-amber-100 p-5 text-center">
                        <span className="text-2xl">🎁</span>
                        <input
                          value={b.heading ?? ""}
                          onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
                          placeholder="มีลายในใจแล้วใช่ไหม? มาเริ่มกันเลย!"
                          className={`w-full bg-white/80 text-center text-base font-extrabold ${inputBase}`}
                        />
                        <textarea
                          value={b.body ?? ""}
                          onChange={(e) => patchBlock(b.id, { body: e.target.value })}
                          placeholder="ข้อความ (กด Enter ขึ้นบรรทัดใหม่ได้)"
                          rows={2}
                          className={`w-full bg-white/80 text-center ${inputBase}`}
                        />
                        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2">
                          <input
                            value={b.btnLabel ?? ""}
                            onChange={(e) => patchBlock(b.id, { btnLabel: e.target.value })}
                            placeholder="ข้อความบนปุ่ม"
                            className="w-56 rounded-full bg-rose-500 px-4 py-2 text-center text-xs font-bold text-white placeholder-rose-200 outline-none ring-rose-300 focus:ring-2"
                          />
                          <div className="min-w-52 flex-1">
                            <LinkPicker
                              value={b.btnHref ?? "/products"}
                              cats={cats}
                              onChange={(v) => patchBlock(b.id, { btnHref: v })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className={`mt-2.5 text-[11px] ${faint}`}>
          💡 <strong className="font-semibold text-slate-600">สินค้าขายดี</strong>เรียงจากยอดขายจริงอัตโนมัติ ·{" "}
          <strong className="font-semibold text-slate-600">สินค้าแนะนำ</strong>ติ๊กในหน้าแก้ไขสินค้าแต่ละตัว
        </p>
      </section>

      {/* ── ตัวอย่าง: แสดงเฉพาะส่วนของแท็บที่กำลังแก้อยู่ (จะได้รู้ว่ากำลังแก้อะไร) ── */}
      <section className={`mt-5 p-5 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            👀 ตัวอย่างที่ลูกค้าเห็น ·{" "}
            <span className="text-teal-700">
              {tab === "menu"
                ? "แถบเมนูด้านบน"
                : tab === "mega"
                  ? "แถบหมวดสินค้า"
                  : tab === "hero"
                    ? "แบนเนอร์ใหญ่"
                    : tab === "tiles"
                      ? "การ์ดนำทาง"
                      : "จุดเด่นร้าน"}
            </span>
          </h2>
          <span className={`text-[11px] ${faint}`}>แก้ด้านล่างแล้วดูผลตรงนี้ได้ทันที</span>
        </div>

        <div className="mt-3">
          {/* 1 · แถบเมนูด้านบน — โลโก้ + ลิงก์หน้า */}
          {tab === "menu" && (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-1 bg-slate-50 px-3 py-2.5">
                {nav.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nav.logo} alt="" className="mr-2 h-9 w-auto max-w-40 object-contain" />
                ) : (
                  <span className="mr-1 text-lg">🦆</span>
                )}
                {nav.menu.filter((l) => !l.hidden).length === 0 ? (
                  <span className={`text-xs ${faint}`}>(ไม่มีลิงก์บนแถบเมนู)</span>
                ) : (
                  nav.menu
                    .filter((l) => !l.hidden)
                    .map((l) => (
                      <span key={l.id} className="rounded-full px-3 py-1 text-xs font-semibold text-stone-600">
                        {l.label}
                      </span>
                    ))
                )}
                <span className="ml-auto flex gap-1 text-sm">🔑 🛒</span>
              </div>
            </div>
          )}

          {/* 2 · แถบหมวดสินค้า (เมนูดรอปดาวน์) */}
          {tab === "mega" && (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              {nav.mega.filter((g) => !g.hidden).length === 0 ? (
                <p className={`bg-slate-50 p-6 text-center text-sm ${faint}`}>ยังไม่มีหมวดที่เปิดแสดง</p>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-1 bg-white px-3 py-2">
                  {nav.mega
                    .filter((g) => !g.hidden)
                    .map((g) => (
                      <span key={g.id} className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        {g.label} ▾
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 3 · แบนเนอร์ใหญ่ */}
          {tab === "hero" &&
            (!nav.hero.on ? (
              <p className={`rounded-2xl bg-slate-50 p-8 text-center text-sm ${faint}`}>
                ปิดแบนเนอร์ใหญ่อยู่ — หน้าแรกจะไม่มีบล็อกนี้
              </p>
            ) : (
              // กดที่ตัวอย่าง (หรือลากรูปมาวางทับ) เพื่อเปลี่ยน/ใส่ภาพแบนเนอร์ได้เลย
              <DropZone
                onFiles={async (fs) => {
                  setHeroBusy(true);
                  const r = await uploadNavImage(fs[0]);
                  setHeroBusy(false);
                  if (r.url) edit((n) => ({ ...n, hero: { ...n.hero, bgImage: r.url } }));
                  else if (r.error) alert(r.error);
                }}
              >
              <div className="group relative overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <label className="block cursor-pointer" title="กดเพื่อเลือกภาพแบนเนอร์เต็มใบ">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      setHeroBusy(true);
                      const r = await uploadNavImage(f);
                      setHeroBusy(false);
                      if (r.url) edit((n) => ({ ...n, hero: { ...n.hero, bgImage: r.url } }));
                      else if (r.error) alert(r.error);
                    }}
                  />
                  {nav.hero.bgImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nav.hero.bgImage} alt="" className="w-full" />
                  ) : (
                    <div className="bg-gradient-to-br from-amber-200 via-amber-100 to-ducky p-5">
                      {nav.hero.badge && (
                        <span className="inline-block rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold text-amber-800">
                          {nav.hero.badge}
                        </span>
                      )}
                      <p className="mt-2 whitespace-pre-line text-xl font-extrabold leading-tight text-amber-950">
                        {nav.hero.title}
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-amber-900/80">
                        {nav.hero.subtitle}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {nav.hero.btn1Label && (
                          <span className="rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-white shadow">
                            {nav.hero.btn1Label}
                          </span>
                        )}
                        {nav.hero.btn2Label && (
                          <span className="rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-amber-900 shadow">
                            {nav.hero.btn2Label}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* ป้ายบอกว่ากดเปลี่ยนภาพได้ — โชว์ค้างมุมขวาล่างตลอด */}
                  <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-lg ring-1 ring-slate-200 transition group-hover:bg-white">
                    {heroBusy ? "⏳ กำลังอัปโหลด…" : nav.hero.bgImage ? "📤 กดเพื่อเปลี่ยนภาพ" : "📤 กดเพื่อใส่ภาพออกแบบเต็มใบ"}
                  </span>
                </label>
                {nav.hero.bgImage && (
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, hero: { ...n.hero, bgImage: undefined } }))}
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-rose-500 shadow transition hover:bg-white"
                    title="เอาภาพออก แล้วกลับไปใช้แบบพิมพ์ข้อความ"
                  >
                    ✕ เอาภาพออก
                  </button>
                )}
              </div>
              </DropZone>
            ))}

          {/* 4 · การ์ดนำทาง */}
          {tab === "tiles" && (
            <div className="overflow-hidden rounded-2xl">
              {shownTiles.length ? (
                <NavTiles tiles={shownTiles} preview bg={nav.tilesBg} wave={nav.tilesWave} />
              ) : (
                <p className={`rounded-2xl bg-slate-50 p-8 text-center text-sm ${faint}`}>
                  {nav.tilesOn ? "ยังไม่มีการ์ดที่เปิดแสดง" : "ปิดการ์ดนำทางอยู่ — หน้าแรกจะไม่มีบล็อกนี้"}
                </p>
              )}
            </div>
          )}

          {/* 5 · จุดเด่นร้าน */}
          {tab === "perks" &&
            (nav.perksOn && nav.perks.some((x) => !x.hidden) ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {nav.perks
                  .filter((x) => !x.hidden)
                  .map((x) => (
                    <div key={x.id} className="rounded-2xl bg-white p-3 text-center ring-1 ring-amber-100">
                      <p className="text-xl">{x.emoji}</p>
                      <p className="mt-1 text-xs font-bold text-stone-700">{x.title}</p>
                      <p className={`mt-0.5 text-[10px] ${faint}`}>{x.desc}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className={`rounded-2xl bg-slate-50 p-8 text-center text-sm ${faint}`}>
                {nav.perksOn ? "ยังไม่มีจุดเด่นที่เปิดแสดง" : "ปิดแถวจุดเด่นร้านอยู่ — หน้าแรกจะไม่มีบล็อกนี้"}
              </p>
            ))}
        </div>
      </section>

      {/* ══════ แบนเนอร์ใหญ่ (hero) ══════ */}
      {tab === "hero" && (
        <section className={`mt-4 p-5 ${card}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">🎉 แบนเนอร์ใหญ่บนหน้าแรก</h2>
              <p className={`mt-0.5 text-xs ${faint}`}>
                กล่องใหญ่สุดบนหน้าแรก — ป้ายโปร + หัวข้อ + คำโปรย + ปุ่ม 2 ปุ่ม
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={nav.hero.on}
                onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, on: e.target.checked } }))}
                className="h-4 w-4 accent-amber-500"
              />
              แสดงแบนเนอร์นี้
            </label>
          </div>

          {nav.hero.bgImage ? (
            <p className={`mt-4 rounded-xl bg-slate-50 p-3 text-center text-xs ${faint}`}>
              กำลังใช้<strong className="font-semibold text-slate-600">ภาพเต็มใบ</strong>อยู่ — ช่องข้อความ/ปุ่มด้านล่างจะไม่แสดงบนหน้าร้าน
              (เก็บไว้ให้ ถ้าเอาภาพออกเมื่อไหร่ก็กลับมาใช้ได้)
            </p>
          ) : null}

          {/* ทางเลือกที่ 2 — พิมพ์ข้อความเอง (ค่าเริ่มต้น) */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">ป้ายเล็กบนสุด (เว้นว่าง = ไม่แสดง)</span>
              <input
                value={nav.hero.badge}
                onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, badge: e.target.value } }))}
                placeholder="🎉 โปรเปิดร้าน ลดสูงสุด 25%"
                className={`mt-1 w-full ${inputBase}`}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">รูปด้านขวา (เว้นว่าง = ใช้อีโมจิเป็ด 🦆)</span>
              <DropZone
                className="mt-1 flex items-center gap-2 p-1"
                onFiles={async (fs) => {
                  const r = await uploadNavImage(fs[0]);
                  if (r.url) edit((n) => ({ ...n, hero: { ...n.hero, image: r.url } }));
                }}
              >
                {nav.hero.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nav.hero.image} alt="" className="h-10 w-10 rounded-lg object-contain ring-1 ring-slate-200" />
                )}
                <label className={`cursor-pointer ${btnNeutral} text-xs`}>
                  📤 อัปโหลดรูป
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const r = await uploadNavImage(f);
                      if (r.url) edit((n) => ({ ...n, hero: { ...n.hero, image: r.url } }));
                    }}
                  />
                </label>
                {nav.hero.image && (
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, hero: { ...n.hero, image: undefined } }))}
                    className="rounded-full px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50"
                  >
                    ✕ เอาออก
                  </button>
                )}
              </DropZone>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] font-semibold text-slate-400">หัวข้อใหญ่ (กด Enter ขึ้นบรรทัดใหม่ได้)</span>
            <textarea
              value={nav.hero.title}
              onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, title: e.target.value } }))}
              rows={2}
              className={`mt-1 w-full ${inputBase} font-bold`}
            />
          </label>
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold text-slate-400">คำโปรย (กด Enter ขึ้นบรรทัดใหม่ได้)</span>
            <textarea
              value={nav.hero.subtitle}
              onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, subtitle: e.target.value } }))}
              rows={2}
              className={`mt-1 w-full ${inputBase}`}
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-bold text-slate-600">ปุ่มหลัก (สีเหลือง)</p>
              <input
                value={nav.hero.btn1Label}
                onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, btn1Label: e.target.value } }))}
                placeholder="🛍️ ช้อปเลย"
                className={`mt-2 w-full ${inputBase}`}
              />
              <div className="mt-2">
                <LinkPicker
                  value={nav.hero.btn1Href}
                  cats={cats}
                  onChange={(v) => edit((n) => ({ ...n, hero: { ...n.hero, btn1Href: v } }))}
                />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-bold text-slate-600">ปุ่มรอง (สีขาว) — เว้นชื่อว่าง = ไม่แสดง</p>
              <input
                value={nav.hero.btn2Label}
                onChange={(e) => edit((n) => ({ ...n, hero: { ...n.hero, btn2Label: e.target.value } }))}
                placeholder="📖 วิธีสั่งซื้อ"
                className={`mt-2 w-full ${inputBase}`}
              />
              <div className="mt-2">
                <LinkPicker
                  value={nav.hero.btn2Href}
                  cats={cats}
                  onChange={(v) => edit((n) => ({ ...n, hero: { ...n.hero, btn2Href: v } }))}
                />
              </div>
            </div>
          </div>

        </section>
      )}

      {/* ══════ การ์ดนำทาง ══════ */}
      {tab === "tiles" && (
        <section className="mt-4 space-y-3">
          {/* เปิด/ปิด + ตำแหน่งบล็อกบนหน้าแรก (ย้ายมาอยู่ที่นี่ให้ตรงกับสิ่งที่กำลังแก้) */}
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 p-4 ${card}`}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={nav.tilesOn}
                onChange={(e) => edit((n) => ({ ...n, tilesOn: e.target.checked }))}
                className="h-4 w-4 accent-amber-500"
              />
              แสดงบล็อกการ์ดนำทางบนหน้าแรก
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              วางไว้ตรงไหน:
              <select
                value={nav.tilesPos ?? "hero"}
                onChange={(e) => edit((n) => ({ ...n, tilesPos: e.target.value as SiteNav["tilesPos"] }))}
                className={inputBase}
                disabled={!nav.tilesOn}
              >
                <option value="top">บนสุด — ก่อนแบนเนอร์ใหญ่</option>
                <option value="hero">กลาง — ใต้แบนเนอร์ใหญ่ (ค่าเริ่มต้น)</option>
                <option value="features">ล่าง — ใต้จุดเด่นร้าน</option>
              </select>
            </label>
            <span className={`w-full text-[11px] ${faint}`}>
              💡 ตำแหน่งนี้เทียบกับ &ldquo;แบนเนอร์ใหญ่&rdquo; และ &ldquo;จุดเด่นร้าน&rdquo; — เลื่อนแล้วดูผลได้ที่ตัวอย่างด้านบน
            </span>
          </div>
          <div className={`flex flex-wrap items-center gap-4 p-4 ${card}`}>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              แถบพื้นหลัง
              <input
                type="checkbox"
                checked={!!nav.tilesBg}
                onChange={(e) => edit((n) => ({ ...n, tilesBg: e.target.checked ? DEFAULT_TILES_BG : undefined }))}
                className="h-4 w-4 accent-amber-500"
              />
            </label>
            {nav.tilesBg && (
              <>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  สี
                  <input
                    type="color"
                    value={nav.tilesBg}
                    onChange={(e) => edit((n) => ({ ...n, tilesBg: e.target.value }))}
                    className="h-8 w-12 cursor-pointer rounded border border-slate-200"
                    aria-label="สีแถบพื้นหลัง"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!nav.tilesWave}
                    onChange={(e) => edit((n) => ({ ...n, tilesWave: e.target.checked }))}
                    className="h-4 w-4 accent-amber-500"
                  />
                  ขอบหยักคลื่นด้านล่าง
                </label>
              </>
            )}
            <span className={`text-[11px] ${faint}`}>แถบสีเต็มความกว้างจอ แบบเว็บหลักของร้าน</span>
          </div>
          <p className={`text-xs leading-relaxed ${muted}`}>
            เรียงตามลำดับในรายการนี้ · ขนาดที่เข้ากันสวยที่สุดคือ <strong>ใหญ่ 1 + กว้าง 1 + เล็ก 3</strong>{" "}
            (เหมือนบล็อกบนหน้าร้าน) แต่จะใส่กี่ใบก็ได้
          </p>

          {nav.tiles.map((t, i) => (
            <div key={t.id} {...dragTile(i).row} className={`p-4 ${card} ${t.hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span {...dragTile(i).handle} title="ลากเพื่อสลับลำดับ" className="flex shrink-0 items-center gap-1">
                  <Grip />
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${t.gradient} text-lg`}
                    aria-hidden="true"
                  >
                    {t.image ? "🖼" : t.emoji}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{t.title || "(ยังไม่ตั้งชื่อ)"}</span>
                  <span className={`block truncate text-xs ${faint}`}>{t.href}</span>
                </span>

                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, tiles: move(n.tiles, i, -1) }))}
                    disabled={i === 0}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, tiles: move(n.tiles, i, 1) }))}
                    disabled={i === nav.tiles.length - 1}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setTile(t.id, { hidden: !t.hidden })}
                    className={btnSmGhost}
                    title={t.hidden ? "เปิดแสดง" : "ซ่อนจากหน้าร้าน"}
                  >
                    {t.hidden ? "🚫 ซ่อนอยู่" : "👁 แสดงอยู่"}
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, tiles: n.tiles.filter((x) => x.id !== t.id) }))}
                    className={btnSmDanger}
                  >
                    ลบ
                  </button>
                </span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">บรรทัดใหญ่</span>
                  <input
                    value={t.title}
                    onChange={(e) => setTile(t.id, { title: e.target.value })}
                    placeholder="All Product"
                    className={`mt-1 ${input}`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">บรรทัดรอง</span>
                  <input
                    value={t.subtitle}
                    onChange={(e) => setTile(t.id, { subtitle: e.target.value })}
                    placeholder="สินค้าทั้งหมดของเรา"
                    className={`mt-1 ${input}`}
                  />
                </label>

                <div>
                  <span className="text-xs font-semibold text-slate-600">กดแล้วไปที่</span>
                  <div className="mt-1">
                    <LinkPicker value={t.href} cats={cats} onChange={(v) => setTile(t.id, { href: v })} />
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-600">ขนาดการ์ด</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SIZES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        title={s.hint}
                        onClick={() => setTile(t.id, { size: s.value })}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          t.size === s.value
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className={`mt-1 text-[11px] ${faint}`}>{SIZES.find((s) => s.value === t.size)?.hint}</p>
                </div>

                {!t.image && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="block text-xs font-semibold text-slate-600">ไอคอน</span>
                      <input
                        value={t.emoji}
                        onChange={(e) => setTile(t.id, { emoji: e.target.value })}
                        maxLength={4}
                        className={`mt-1 w-20 text-center text-lg ${inputBase}`}
                      />
                    </label>
                    <div>
                      <span className="block text-xs font-semibold text-slate-600">สีพื้น</span>
                      <div className="mt-1">
                        <GradientPicker
                          value={t.gradient}
                          emoji={t.emoji}
                          onChange={(v) => setTile(t.id, { gradient: v })}
                          ariaLabel={`สีพื้นของการ์ด ${t.title}`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <ImageField
                  value={t.image}
                  onChange={(v) => setTile(t.id, { image: v })}
                  label="รูปการ์ด (ไม่ใส่ก็ได้)"
                  hint="ใส่รูปที่ออกแบบมาแล้ว = ใช้รูปเต็มใบแทนพื้นสีและตัวหนังสือ"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              edit((n) => ({
                ...n,
                tiles: [
                  ...n.tiles,
                  {
                    id: newId("t"),
                    title: "การ์ดใหม่",
                    subtitle: "",
                    href: "/products",
                    emoji: "✨",
                    gradient: "from-sky-100 to-blue-200",
                    size: "small" as TileSize,
                  },
                ],
              }))
            }
            className={btnNeutral}
          >
            ＋ เพิ่มการ์ด
          </button>
        </section>
      )}

      {/* ══════ เมนูดรอปดาวน์ (mega) ══════ */}
      {tab === "mega" && (
        <section className="mt-4 space-y-3">
          <div className={`p-4 ${card}`}>
            <p className="text-sm font-semibold text-slate-800">🗂 เมนูดรอปดาวน์เต็มความกว้าง</p>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
              หัวข้อพวกนี้อยู่บนแถบเมนูด้านบน · ลูกค้าชี้เมาส์แล้วแผงกางเต็มความกว้าง ·
              บนมือถือจะกลายเป็นหัวข้อพับ–กางในปุ่ม ☰ ·{" "}
              <strong className="text-slate-600">คอลัมน์ที่ตั้ง “ดึงอัตโนมัติ” ไว้ จะอัปเดตเองเมื่อเพิ่มสินค้าใหม่</strong>
            </p>
          </div>

          {nav.mega.map((g, gi) => {
            const expanded = openGroup === g.id;
            return (
              <div key={g.id} {...dragMega(gi).row} className={`p-4 ${card} ${g.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span {...dragMega(gi).handle} title="ลากเพื่อสลับลำดับหัวข้อ" className="flex shrink-0 items-center">
                    <Grip />
                  </span>
                  <input
                    value={g.label}
                    onChange={(e) => setGroup(g.id, { label: e.target.value })}
                    placeholder="ชื่อหัวข้อ เช่น DIGITAL PRINT"
                    className={`w-52 font-bold ${inputBase}`}
                  />
                  <span className={`text-xs ${faint}`}>{g.columns.length} คอลัมน์</span>

                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewGroup(previewGroup === g.id ? null : g.id)}
                      className={btnSmGhost}
                    >
                      {previewGroup === g.id ? "ซ่อนตัวอย่าง" : "👀 ดูตัวอย่าง"}
                    </button>
                    <button
                      type="button"
                      onClick={() => edit((n) => ({ ...n, mega: move(n.mega, gi, -1) }))}
                      disabled={gi === 0}
                      className={`${btnSmGhost} disabled:opacity-30`}
                      aria-label="เลื่อนขึ้น"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => edit((n) => ({ ...n, mega: move(n.mega, gi, 1) }))}
                      disabled={gi === nav.mega.length - 1}
                      className={`${btnSmGhost} disabled:opacity-30`}
                      aria-label="เลื่อนลง"
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => setGroup(g.id, { hidden: !g.hidden })} className={btnSmGhost}>
                      {g.hidden ? "🚫 ซ่อนอยู่" : "👁 แสดงอยู่"}
                    </button>
                    <button
                      type="button"
                      onClick={() => edit((n) => ({ ...n, mega: n.mega.filter((x) => x.id !== g.id) }))}
                      className={btnSmDanger}
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(expanded ? null : g.id)}
                      className={`${btnNeutral} text-xs`}
                    >
                      {expanded ? "ปิด ▲" : "แก้ไข ▼"}
                    </button>
                  </span>
                </div>

                {previewGroup === g.id && (
                  <div className="mt-3 overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <MegaPanel group={g} products={products} preview />
                  </div>
                )}

                {expanded && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    {/* ผังบอกตำแหน่ง — เลข ①②③ ตรงกับส่วนแก้ไขด้านล่าง */}
                    <div className="flex flex-wrap items-center gap-4">
                      <PanelMap />
                      <p className={`max-w-56 text-[11px] leading-relaxed ${faint}`}>
                        ผังแผงที่ลูกค้าเห็น — <strong className="text-sky-600">① ภาพโปรโมทซ้าย</strong> ·{" "}
                        <strong className="text-amber-600">② แถวภาพสินค้าแนะนำ</strong> ·{" "}
                        <strong className="text-emerald-600">③ คอลัมน์รายการ</strong> · แก้เสร็จกด 👀
                        ดูตัวอย่างด้านบนได้เลย
                      </p>
                    </div>

                    {/* ══ ① แผงด้านซ้าย ══ */}
                    <div className="rounded-xl border-l-4 border-l-sky-300 bg-slate-50 p-3 ring-1 ring-slate-200">
                      <SectionHead
                        no="①"
                        title="ภาพโปรโมทด้านซ้าย + หัวเรื่อง"
                        desc="ภาพแนวตั้ง (ประมาณ 3:4) โชว์เฉพาะจอกว้าง · หัวเรื่องขึ้นเหนือแถวภาพสินค้าแนะนำ"
                      />
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <ImageField
                          value={g.image}
                          onChange={(v) => setGroup(g.id, { image: v })}
                          label="ภาพโปรโมท (ไม่ใส่ก็ได้)"
                        />
                        <div>
                          <span className="block text-xs font-semibold text-slate-600">กดภาพแล้วไปที่</span>
                          <div className="mt-1">
                            <LinkPicker
                              value={g.imageHref ?? "/products"}
                              cats={cats}
                              onChange={(v) => setGroup(g.id, { imageHref: v })}
                            />
                          </div>
                        </div>
                        <label className="block">
                          <span className="block text-xs font-semibold text-slate-600">หัวเรื่องในแผง</span>
                          <input
                            value={g.heading ?? ""}
                            onChange={(e) => setGroup(g.id, { heading: e.target.value })}
                            placeholder="สินค้าแนะนำ"
                            className={`mt-1 ${input}`}
                          />
                        </label>
                      </div>
                    </div>

                    {/* ══ ② แถวภาพสินค้าแนะนำ — ลากรูปมาวางได้เลย ══ */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver((cur) => (cur?.startsWith(`${g.id}|`) ? cur : g.id));
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void dropPromoFiles(g.id, [...e.dataTransfer.files]);
                      }}
                      className={`rounded-xl border-l-4 border-l-amber-300 p-3 ring-1 transition ${
                        dragOver === g.id
                          ? "bg-amber-50 ring-2 ring-amber-400 ring-dashed"
                          : "bg-slate-50 ring-slate-200"
                      }`}
                    >
                      <SectionHead
                        no="②"
                        title={`แถวภาพสินค้าแนะนำ (${(g.promos ?? []).length} รูป)`}
                        desc="รูปสี่เหลี่ยมจัตุรัสเรียงแถวบนของแผง กดแล้วไปหน้าที่ตั้งไว้"
                      />
                      <p className={`mt-1.5 text-[11px] ${faint}`}>
                        🖐 <strong className="text-slate-500">ลากรูปมาวางตรงนี้ได้เลย</strong> (หลายรูปพร้อมกันได้) —
                        วางทับรูปเดิม = เปลี่ยนรูปนั้น · วางที่ว่าง = แทรกต่อท้าย
                        {dropBusy > 0 && (
                          <strong className="ml-1 text-amber-600">· ⏳ กำลังอัปโหลดอีก {dropBusy} รูป…</strong>
                        )}
                        {dropErr && <strong className="ml-1 text-rose-600">· {dropErr}</strong>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {(g.promos ?? []).map((pm, pi) => (
                          <div
                            key={pm.id}
                            {...dragPromo(g, pi).row}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver(`${g.id}|${pm.id}`);
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(g.id);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void dropPromoFiles(g.id, [...e.dataTransfer.files], pm.id);
                            }}
                            className={`w-40 rounded-lg bg-white p-2 ring-1 transition ${
                              dragOver === `${g.id}|${pm.id}` ? "ring-2 ring-amber-400" : "ring-slate-200"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pm.image} alt="" className="aspect-square w-full rounded object-cover" />
                            <div className="mt-1.5">
                              <LinkPicker
                                value={pm.href}
                                cats={cats}
                                onChange={(v) => setPromos(g.id, (ps) => ps.map((x) => (x.id === pm.id ? { ...x, href: v } : x)))}
                              />
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="flex items-center gap-0.5">
                                <Grip />
                                <button
                                  type="button"
                                  onClick={() => setPromos(g.id, (ps) => move(ps, pi, -1))}
                                  disabled={pi === 0}
                                  className={`${btnSmGhost} disabled:opacity-30`}
                                  aria-label="เลื่อนซ้าย"
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPromos(g.id, (ps) => move(ps, pi, 1))}
                                  disabled={pi === (g.promos ?? []).length - 1}
                                  className={`${btnSmGhost} disabled:opacity-30`}
                                  aria-label="เลื่อนขวา"
                                >
                                  →
                                </button>
                              </span>
                              <button
                                type="button"
                                onClick={() => setPromos(g.id, (ps) => ps.filter((x) => x.id !== pm.id))}
                                className={btnSmDanger}
                              >
                                ลบ
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="w-40">
                          <ImageField
                            value={undefined}
                            onChange={(v) => {
                              if (v) setPromos(g.id, (ps) => [...ps, { id: newId("p"), image: v, href: "/products" }]);
                            }}
                            label="เพิ่มรูป"
                            hint="สี่เหลี่ยมจัตุรัสสวยสุด"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ══ ③ คอลัมน์รายการ ══ */}
                    <div className="rounded-xl border-l-4 border-l-emerald-300 bg-slate-50/60 p-3 ring-1 ring-slate-200">
                      <SectionHead
                        no="③"
                        title={`คอลัมน์รายการ (${g.columns.length} คอลัมน์)`}
                        desc="แต่ละคอลัมน์ = ชื่อหมวด + รายชื่อสินค้าข้างใต้ · ตั้งดึงอัตโนมัติได้ ไม่ต้องพิมพ์เอง"
                      />
                      <div className="mt-3 space-y-3">
                      {g.columns.map((c, ci) => (
                        <div key={c.id} {...dragCol(g, ci).row} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex flex-wrap items-center gap-2">
                            <span {...dragCol(g, ci).handle} title="ลากเพื่อสลับลำดับคอลัมน์" className="flex shrink-0 items-center">
                              <Grip />
                            </span>
                            <input
                              value={c.title}
                              onChange={(e) => setCol(g.id, c.id, { title: e.target.value })}
                              placeholder="ชื่อคอลัมน์"
                              className={`w-56 font-semibold ${inputBase}`}
                            />
                            <span className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setCols(g.id, (cols) => move(cols, ci, -1))}
                                disabled={ci === 0}
                                className={`${btnSmGhost} disabled:opacity-30`}
                                aria-label="เลื่อนคอลัมน์ขึ้น"
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => setCols(g.id, (cols) => move(cols, ci, 1))}
                                disabled={ci === g.columns.length - 1}
                                className={`${btnSmGhost} disabled:opacity-30`}
                                aria-label="เลื่อนคอลัมน์ลง"
                              >
                                →
                              </button>
                              <button
                                type="button"
                                onClick={() => setCols(g.id, (cols) => cols.filter((x) => x.id !== c.id))}
                                className={btnSmDanger}
                              >
                                ลบคอลัมน์
                              </button>
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <span className="block text-xs font-semibold text-slate-600">กดที่ชื่อคอลัมน์แล้วไปที่</span>
                              <div className="mt-1">
                                <LinkPicker
                                  value={c.href ?? "/products"}
                                  cats={cats}
                                  onChange={(v) => setCol(g.id, c.id, { href: v })}
                                />
                              </div>
                            </div>

                            <div>
                              <span className="block text-xs font-semibold text-slate-600">รายการในคอลัมน์</span>
                              <select
                                value={c.autoCategory ?? "__manual__"}
                                onChange={(e) =>
                                  setCol(g.id, c.id, {
                                    autoCategory: e.target.value === "__manual__" ? undefined : e.target.value,
                                  })
                                }
                                className={`mt-1 ${input}`}
                              >
                                <option value="__manual__">✏️ พิมพ์รายการเอง</option>
                                {cats.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    🔄 ดึงสินค้าจากหมวด {cat.name} อัตโนมัติ
                                  </option>
                                ))}
                              </select>
                              {c.autoCategory && (
                                <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                                  แสดงกี่รายการ
                                  <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={c.autoLimit ?? 6}
                                    onChange={(e) =>
                                      setCol(g.id, c.id, { autoLimit: Math.max(1, Number(e.target.value) || 6) })
                                    }
                                    className={`w-20 ${inputBase}`}
                                  />
                                </label>
                              )}
                            </div>
                          </div>

                          <div className="mt-3">
                            <ImageField
                              value={c.image}
                              onChange={(v) => setCol(g.id, c.id, { image: v })}
                              label="รูปหัวคอลัมน์ (ไม่ใส่ก็ได้)"
                            />
                          </div>

                          {/* รายการที่พิมพ์เอง */}
                          {c.autoCategory && c.items.length === 0 ? (
                            <p className={`mt-3 rounded-lg bg-white p-2.5 text-xs ${muted} ring-1 ring-slate-200`}>
                              🔄 คอลัมน์นี้ดึงสินค้าจากหมวด{" "}
                              <strong className="text-slate-700">
                                {cats.find((x) => x.id === c.autoCategory)?.name ?? c.autoCategory}
                              </strong>{" "}
                              มาแสดงเอง {c.autoLimit ?? 6} รายการ — ไม่ต้องพิมพ์ · ถ้าเพิ่มรายการเองด้านล่าง
                              จะใช้รายการที่พิมพ์แทน
                            </p>
                          ) : null}

                          <div className="mt-3 space-y-2">
                            {c.items.map((it, ii) => (
                              <div key={it.id} {...dragItem(g, c, ii).row} className="flex flex-wrap items-start gap-2">
                                <Grip className="mt-2" />
                                <input
                                  value={it.label}
                                  onChange={(e) => setItems(g.id, c.id, (xs) => xs.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)))}
                                  placeholder="ชื่อรายการ"
                                  className={`w-44 ${inputBase}`}
                                />
                                <div className="min-w-52 flex-1">
                                  <LinkPicker
                                    value={it.href}
                                    cats={cats}
                                    onChange={(v) => setItems(g.id, c.id, (xs) => xs.map((x) => (x.id === it.id ? { ...x, href: v } : x)))}
                                  />
                                </div>
                                <select
                                  value={it.badge ?? ""}
                                  onChange={(e) => setItems(g.id, c.id, (xs) => xs.map((x) => (x.id === it.id ? { ...x, badge: e.target.value as MegaBadge } : x)))}
                                  className={`w-28 ${inputBase}`}
                                  aria-label="ป้าย"
                                >
                                  <option value="">ไม่มีป้าย</option>
                                  <option value="N">🔴 N มาใหม่</option>
                                  <option value="H">🟠 H ขายดี</option>
                                </select>
                                <span className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setItems(g.id, c.id, (xs) => move(xs, ii, -1))}
                                    disabled={ii === 0}
                                    className={`${btnSmGhost} disabled:opacity-30`}
                                    aria-label="เลื่อนขึ้น"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItems(g.id, c.id, (xs) => move(xs, ii, 1))}
                                    disabled={ii === c.items.length - 1}
                                    className={`${btnSmGhost} disabled:opacity-30`}
                                    aria-label="เลื่อนลง"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItems(g.id, c.id, (xs) => xs.filter((x) => x.id !== it.id))}
                                    className={btnSmDanger}
                                  >
                                    ลบ
                                  </button>
                                </span>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setItems(g.id, c.id, (xs) => [
                                  ...xs,
                                  { id: newId("i"), label: "รายการใหม่", href: "/products", badge: "" as MegaBadge },
                                ])
                              }
                              className={`${btnNeutral} text-xs`}
                            >
                              ＋ เพิ่มรายการเอง
                            </button>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          setCols(g.id, (cols) => [
                            ...cols,
                            { id: newId("c"), title: "คอลัมน์ใหม่", href: "/products", items: [] },
                          ])
                        }
                        className={btnNeutral}
                      >
                        ＋ เพิ่มคอลัมน์
                      </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                edit((n) => ({
                  ...n,
                  mega: [...n.mega, { id: newId("g"), label: "หัวข้อใหม่", heading: "สินค้าแนะนำ", columns: [] }],
                }))
              }
              className={btnNeutral}
            >
              ＋ เพิ่มหัวข้อ
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("สร้างเมนูดรอปดาวน์ใหม่จากชุดเริ่มต้น? ของเดิมจะถูกแทนที่ (ยังต้องกดบันทึกอีกครั้ง)")) {
                  edit((n) => ({ ...n, mega: DEFAULT_MEGA }));
                }
              }}
              className={btnNeutral}
            >
              🔄 สร้างจากหมวดหมู่สินค้าให้อัตโนมัติ
            </button>
          </div>
        </section>
      )}

      {/* ══════ จุดเด่นร้าน ══════ */}
      {tab === "perks" && (
        <section className={`mt-4 p-5 ${card}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">⭐ จุดเด่นร้าน</h2>
              <p className={`mt-0.5 text-xs ${faint}`}>แถวการ์ดเล็กใต้แบนเนอร์หน้าแรก (อีโมจิ + หัวข้อ + คำอธิบาย)</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={nav.perksOn}
                onChange={(e) => edit((n) => ({ ...n, perksOn: e.target.checked }))}
                className="h-4 w-4 accent-amber-500"
              />
              แสดงบนหน้าแรก
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {nav.perks.map((x, i) => (
              <div
                key={x.id}
                {...dragPerk(i).row}
                className={`flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 p-3 ${x.hidden ? "opacity-60" : ""}`}
              >
                <Grip className="mt-2" />
                <input
                  value={x.emoji}
                  onChange={(e) => setPerk(x.id, { emoji: e.target.value })}
                  maxLength={4}
                  className={`w-16 text-center text-lg ${inputBase}`}
                  aria-label="อีโมจิ"
                />
                <input
                  value={x.title}
                  onChange={(e) => setPerk(x.id, { title: e.target.value })}
                  placeholder="หัวข้อ เช่น ส่งไวทั่วไทย"
                  className={`w-44 font-bold ${inputBase}`}
                />
                <input
                  value={x.desc}
                  onChange={(e) => setPerk(x.id, { desc: e.target.value })}
                  placeholder="คำอธิบายสั้น ๆ"
                  className={`min-w-52 flex-1 ${inputBase}`}
                />
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, perks: move(n.perks, i, -1) }))}
                    disabled={i === 0}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, perks: move(n.perks, i, 1) }))}
                    disabled={i === nav.perks.length - 1}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => setPerk(x.id, { hidden: !x.hidden })} className={btnSmGhost}>
                    {x.hidden ? "🚫 ซ่อนอยู่" : "👁 แสดงอยู่"}
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, perks: n.perks.filter((p) => p.id !== x.id) }))}
                    className={btnSmDanger}
                  >
                    ลบ
                  </button>
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              edit((n) => ({ ...n, perks: [...n.perks, { id: newId("pk"), emoji: "✨", title: "จุดเด่นใหม่", desc: "" }] }))
            }
            className={`mt-3 ${btnNeutral}`}
          >
            ＋ เพิ่มจุดเด่น
          </button>
          <p className={`mt-2 text-[11px] ${faint}`}>จอใหญ่เรียง 4 ใบต่อแถวสวยสุด · มือถือเรียง 2 ใบเสมอ</p>
        </section>
      )}

      {/* ══════ แถบเมนูด้านบน ══════ */}
      {tab === "menu" && (
        <>
        <section className={`mt-4 p-5 ${card}`}>
          <h2 className="text-sm font-semibold text-slate-800">🖼 โลโก้ร้าน</h2>
          <p className={`mt-0.5 text-xs ${faint}`}>
            แสดงมุมซ้ายของแถบเมนูทุกหน้า · แนะนำ PNG พื้นใส แนวนอน สูงอย่างน้อย 144px · ไม่ใส่ = โลโก้เป็ด 🦆 + ข้อความเดิม
          </p>
          <DropZone
            className="mt-3 flex flex-wrap items-center gap-4 p-1"
            onFiles={async (fs) => {
              const r = await uploadNavImage(fs[0]);
              if (r.url) edit((n) => ({ ...n, logo: r.url }));
            }}
          >
            <div className="flex h-24 min-w-48 items-center justify-center rounded-xl bg-slate-50 px-4 ring-1 ring-slate-200">
              {nav.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nav.logo} alt="โลโก้ร้าน" className="max-h-20 w-auto max-w-64 object-contain" />
              ) : (
                <span className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ducky text-xl">🦆</span>
                  iDucky Prints (ค่าเริ่มต้น)
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-full bg-amber-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-amber-600">
                📤 อัปโหลดโลโก้ใหม่
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const r = await uploadNavImage(f);
                    if (r.url) edit((n) => ({ ...n, logo: r.url }));
                  }}
                />
              </label>
              {nav.logo && (
                <button
                  type="button"
                  onClick={() => edit((n) => ({ ...n, logo: undefined }))}
                  className="rounded-full px-4 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-50"
                >
                  ✕ ลบโลโก้ (กลับไปใช้ค่าเริ่มต้น)
                </button>
              )}
            </div>
          </DropZone>
        </section>

        <section className={`mt-4 p-5 ${card}`}>
          <h2 className="text-sm font-semibold text-slate-800">🔗 ลิงก์บนแถบเมนูด้านบน</h2>
          <p className={`mt-0.5 text-xs ${faint}`}>อยู่ข้างโลโก้ทุกหน้า · บนมือถือจะอยู่ในเมนู ☰</p>

          <div className="mt-4 space-y-3">
            {nav.menu.map((l, i) => (
              <div
                key={l.id}
                {...dragLink(i).row}
                className={`flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 p-3 ${l.hidden ? "opacity-60" : ""}`}
              >
                <Grip className="mt-2" />
                <input
                  value={l.label}
                  onChange={(e) => setLink(l.id, { label: e.target.value })}
                  placeholder="ชื่อที่แสดง"
                  className={`w-40 ${inputBase}`}
                />
                <div className="min-w-56 flex-1">
                  <LinkPicker value={l.href} cats={cats} onChange={(v) => setLink(l.id, { href: v })} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, menu: move(n.menu, i, -1) }))}
                    disabled={i === 0}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, menu: move(n.menu, i, 1) }))}
                    disabled={i === nav.menu.length - 1}
                    className={`${btnSmGhost} disabled:opacity-30`}
                    aria-label="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => setLink(l.id, { hidden: !l.hidden })} className={btnSmGhost}>
                    {l.hidden ? "🚫 ซ่อนอยู่" : "👁 แสดงอยู่"}
                  </button>
                  <button
                    type="button"
                    onClick={() => edit((n) => ({ ...n, menu: n.menu.filter((x) => x.id !== l.id) }))}
                    className={btnSmDanger}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              edit((n) => ({ ...n, menu: [...n.menu, { id: newId("m"), label: "เมนูใหม่", href: "/products" }] }))
            }
            className={`mt-3 ${btnNeutral}`}
          >
            ＋ เพิ่มลิงก์
          </button>
        </section>
        </>
      )}

      {/* ── แถบบันทึก (การ์ดลอยติดขอบล่างในคอลัมน์เนื้อหา — ไม่พาดทับแถบเมนูซ้าย) ── */}
      <div className="sticky bottom-3 z-20 mt-5 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {msg && (
            <span className={`text-sm font-semibold ${msg.includes("✓") ? "text-emerald-600" : "text-rose-600"}`}>
              {msg}
            </span>
          )}
          {dirty && !msg && <span className={`text-xs ${faint}`}>มีการแก้ไขที่ยังไม่ได้บันทึก</span>}
          <button
            type="button"
            onClick={() => {
              if (confirm("คืนค่าเมนูทั้งหมดกลับเป็นค่าเริ่มต้น? (ยังต้องกดบันทึกอีกครั้ง)")) {
                edit(() => DEFAULT_SITE_NAV);
              }
            }}
            className={btnNeutral}
          >
            คืนค่าเริ่มต้น
          </button>
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}

export default function AdminNavPage() {
  return (
    <RequirePerm perm="settings.manage">
      <NavEditorInner />
    </RequirePerm>
  );
}

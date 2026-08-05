"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import NavTiles from "@/components/NavTiles";
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
import { fetchProductsLite } from "@/lib/product-repo";
import type { Product } from "@/lib/products";
import { btnNeutral, btnPrimary, btnSmDanger, btnSmGhost, card, faint, h1, muted } from "@/lib/admin-ui";

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
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
      </div>
      {err && <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p>}
    </div>
  );
}

/** หัวข้อส่วนย่อยในตัวแก้ไขเมนูดรอปดาวน์ — เลขตรงกับผังด้านบน */
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
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [tab, setTab] = useState<Tab>("mega");
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
        fetchCategories(),
      ]);
      setNav(siteNavOf((r as { nav?: Partial<SiteNav> } | null)?.nav));
      setCats(cs.filter((c) => !c.hidden));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (tab !== "mega" || products.length) return;
    void fetchProductsLite().then(setProducts);
  }, [tab, products.length]);

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

  /** เลื่อนขึ้น/ลง — ใช้แทนการลาก (ลากบนมือถือพลาดง่าย) */
  function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  }

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

  if (loading) return <div className={`mx-auto max-w-5xl p-10 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>;

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>🧭 หน้าร้าน — เมนู &amp; หน้าแรก</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            คุมทุกอย่างที่ลูกค้าเห็นบนหัวเว็บและหน้าแรก — แก้แล้วกด 💾 บันทึก ลูกค้าเห็นทันที
          </p>
        </div>
        <Link href="/" target="_blank" className={`${btnNeutral} text-xs`}>
          เปิดหน้าร้านจริง ↗
        </Link>
      </div>

      {/* ── แผนผังหน้าแรก: ส่วนไหนแก้ที่แท็บไหน (เรียงจากบนลงล่างตามที่ลูกค้าเห็น) ── */}
      <section className={`mt-5 p-4 ${card}`}>
        <h2 className="text-sm font-semibold text-slate-800">🗺 หน้าแรกมีอะไรบ้าง — กดเพื่อไปแก้ส่วนนั้น</h2>
        <p className={`mt-0.5 text-xs ${faint}`}>เรียงจากบนลงล่างตามที่ลูกค้าเห็นจริง</p>
        <div className="mt-3 space-y-1.5">
          {(
            [
              ["1", "🔗", "แถบเมนูด้านบน", "โลโก้ร้าน + ลิงก์หน้า (หน้าแรก · สินค้าทั้งหมด …)", "menu" as Tab, true],
              ["2", "🗂", "แถบหมวดสินค้า (เมนูดรอปดาวน์)", "DIGITAL PRINT · SIMPLE GIFTS … ชี้เมาส์แล้วกางแผงใหญ่", "mega" as Tab, true],
              ["3", "🎉", "แบนเนอร์ใหญ่", "ป้ายโปร + หัวข้อ + คำโปรย + ปุ่ม (แก้ข้อความได้แล้ว)", "hero" as Tab, nav.hero.on],
              ["4", "🧱", "การ์ดนำทาง", "How To Order · All Product · Review … เลื่อนขึ้น-ลงได้ 3 ตำแหน่ง", "tiles" as Tab, nav.tilesOn],
              ["5", "⭐", "จุดเด่นร้าน", "แถวการ์ดเล็ก (ลายของคุณเอง · ส่งไวทั่วไทย …)", "perks" as Tab, nav.perksOn],
            ] as [string, string, string, string, Tab, boolean][]
          ).map(([no, icon, title, desc, key, on]) => (
            <button
              key={no}
              type="button"
              onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                tab === key ? "bg-amber-50 ring-1 ring-amber-300" : "bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold text-slate-300">{no}</span>
              <span className="shrink-0 text-base">{icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800">{title}</span>
                <span className={`block truncate text-[11px] ${faint}`}>{desc}</span>
              </span>
              {!on && (
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  ปิดอยู่
                </span>
              )}
              <span className="shrink-0 text-xs text-slate-300">แก้ →</span>
            </button>
          ))}
        </div>
        <p className={`mt-2.5 text-[11px] ${faint}`}>
          💡 ส่วนอื่นของหน้าแรกที่ไม่ได้อยู่หน้านี้: <strong className="font-semibold text-slate-600">หมวดหมู่สินค้า</strong> แก้ที่{" "}
          <Link href="/admin/settings" className="font-semibold text-amber-600 underline">ตั้งค่าระบบ</Link> ·{" "}
          <strong className="font-semibold text-slate-600">สินค้าแนะนำ/ขายดี</strong> ตั้งในหน้าแก้ไขสินค้าแต่ละตัว
        </p>
      </section>

      {/* ── ตัวอย่าง (ใช้คอมโพเนนต์เดียวกับหน้าร้าน) ── */}
      <section className={`mt-5 p-5 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">👀 ตัวอย่างที่ลูกค้าเห็น</h2>
          <span className={`text-[11px] ${faint}`}>ภาพจริงจากหน้าร้าน · แก้ในแท็บด้านล่างแล้วดูผลตรงนี้ได้เลย</span>
        </div>

        {/* แถบเมนูด้านบน */}
        {/* หัวเว็บ 2 ชั้น — ชั้นบนลิงก์หน้า · ชั้นล่างหมวดสินค้า (ตรงกับหน้าร้านจริง) */}
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-1 bg-slate-50 px-3 py-2.5">
            <span className="mr-1 text-lg">🦆</span>
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
          {nav.mega.filter((g) => !g.hidden).length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1 border-t border-slate-200 bg-white px-3 py-1.5">
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

        {/* การ์ดนำทาง */}
        <div className="mt-3 overflow-hidden rounded-2xl">
          {shownTiles.length ? (
            <NavTiles tiles={shownTiles} preview bg={nav.tilesBg} wave={nav.tilesWave} />
          ) : (
            <p className={`rounded-2xl bg-slate-50 p-8 text-center text-sm ${faint}`}>
              {nav.tilesOn ? "ยังไม่มีการ์ดที่เปิดแสดง" : "ปิดการ์ดนำทางอยู่ — หน้าแรกจะไม่มีบล็อกนี้"}
            </p>
          )}
        </div>
      </section>

      {/* ── แท็บ ── */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["menu", `🔗 แถบเมนู + โลโก้ (${nav.menu.length})`],
            ["mega", `🗂 หมวดสินค้า (${nav.mega.length})`],
            ["hero", "🎉 แบนเนอร์ใหญ่"],
            ["tiles", `🧱 การ์ดนำทาง (${nav.tiles.length})`],
            ["perks", `⭐ จุดเด่นร้าน (${nav.perks.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === k
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
              <div className="mt-1 flex items-center gap-2">
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
              </div>
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

          {/* ตัวอย่างแบนเนอร์ */}
          <div className="mt-4">
            <p className={`mb-1.5 text-[11px] font-semibold ${faint}`}>ตัวอย่าง</p>
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-200 via-amber-100 to-ducky p-5">
              {nav.hero.badge && (
                <span className="inline-block rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold text-amber-800">
                  {nav.hero.badge}
                </span>
              )}
              <p className="mt-2 whitespace-pre-line text-xl font-extrabold leading-tight text-amber-950">
                {nav.hero.title}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-amber-900/80">{nav.hero.subtitle}</p>
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
            <div key={t.id} className={`p-4 ${card} ${t.hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${t.gradient} text-lg`}
                  aria-hidden="true"
                >
                  {t.image ? "🖼" : t.emoji}
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
              <div key={g.id} className={`p-4 ${card} ${g.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
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
                              <span className="flex gap-0.5">
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
                        <div key={c.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex flex-wrap items-center gap-2">
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
                              <div key={it.id} className="flex flex-wrap items-start gap-2">
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
                className={`flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 p-3 ${x.hidden ? "opacity-60" : ""}`}
              >
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
          <div className="mt-3 flex flex-wrap items-center gap-4">
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
          </div>
        </section>

        <section className={`mt-4 p-5 ${card}`}>
          <h2 className="text-sm font-semibold text-slate-800">🔗 ลิงก์บนแถบเมนูด้านบน</h2>
          <p className={`mt-0.5 text-xs ${faint}`}>อยู่ข้างโลโก้ทุกหน้า · บนมือถือจะอยู่ในเมนู ☰</p>

          <div className="mt-4 space-y-3">
            {nav.menu.map((l, i) => (
              <div
                key={l.id}
                className={`flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 p-3 ${l.hidden ? "opacity-60" : ""}`}
              >
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

      {/* ── แถบบันทึก (ลอยล่าง — เลื่อนแก้ไปเรื่อย ๆ ก็ยังกดบันทึกได้) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
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
            {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminNavPage() {
  return (
    <RequirePerm perm="settings.manage">
      <NavEditorInner />
    </RequirePerm>
  );
}

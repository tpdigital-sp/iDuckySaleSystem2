"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import NavTiles from "@/components/NavTiles";
import GradientPicker from "@/components/GradientPicker";
import { fetchCategories, type ShopCategory } from "@/lib/categories";
import {
  DEFAULT_SITE_NAV,
  clearSiteNavCache,
  siteNavOf,
  type NavLink,
  type NavTile,
  type SiteNav,
  type TileSize,
} from "@/lib/home-nav";
import { btnNeutral, btnPrimary, btnSmDanger, btnSmGhost, card, faint, h1, muted } from "@/lib/admin-ui";

/**
 * 🧭 เมนูหน้าร้าน — แอดมินจัดเมนูเองได้ ไม่ต้องแก้โค้ด
 *
 * 2 ส่วน: การ์ดนำทางบนหน้าแรก (บล็อกใหญ่/กว้าง/เล็ก) และลิงก์บนแถบเมนูด้านบน
 * ตัวอย่างด้านบนใช้คอมโพเนนต์ตัวเดียวกับหน้าร้านจริง — เห็นยังไง ลูกค้าเห็นอย่างนั้น
 */

type Tab = "tiles" | "menu";

/** หน้าที่ลิงก์ไปได้ (ให้เลือกจากรายการ จะได้ไม่พิมพ์ผิด) */
const PAGES: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/products", label: "สินค้าทั้งหมด" },
  { href: "/products?sort=popular", label: "สินค้าขายดี" },
  { href: "/how-to-order", label: "วิธีสั่งซื้อ" },
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

/** ปุ่มอัปโหลดรูปการ์ด (ใส่แล้วรูปจะแทนพื้นสี+ตัวหนังสือทั้งใบ) */
function TileImage({ tile, onChange }: { tile: NavTile; onChange: (v: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("productId", "sitenav");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) setErr(j.error ?? "อัปโหลดไม่สำเร็จ");
      else onChange(j.url);
    } catch {
      setErr("อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">รูปการ์ด (ไม่ใส่ก็ได้)</p>
      <p className={`mt-0.5 text-[11px] leading-relaxed ${faint}`}>
        ใส่รูปที่ออกแบบมาแล้ว = ใช้รูปเต็มใบแทนพื้นสีและตัวหนังสือ
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className={`${btnNeutral} cursor-pointer text-xs`}>
          {busy ? "กำลังอัปโหลด…" : tile.image ? "🖼 เปลี่ยนรูป" : "🖼 อัปโหลดรูป"}
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
        {tile.image && (
          <button type="button" onClick={() => onChange(undefined)} className={btnSmDanger}>
            เอารูปออก
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p>}
    </div>
  );
}

function NavEditorInner() {
  const [nav, setNav] = useState<SiteNav>(DEFAULT_SITE_NAV);
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [tab, setTab] = useState<Tab>("tiles");
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

  const edit = useCallback((fn: (n: SiteNav) => SiteNav) => {
    setNav((n) => fn(n));
    setDirty(true);
    setMsg("");
  }, []);

  const setTile = (id: string, patch: Partial<NavTile>) =>
    edit((n) => ({ ...n, tiles: n.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setLink = (id: string, patch: Partial<NavLink>) =>
    edit((n) => ({ ...n, menu: n.menu.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

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
          <h1 className={h1}>🧭 เมนูหน้าร้าน</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            จัดการ์ดนำทางบนหน้าแรก และลิงก์บนแถบเมนูด้านบน — แก้แล้วลูกค้าเห็นทันที
          </p>
        </div>
        <Link href="/" target="_blank" className={`${btnNeutral} text-xs`}>
          เปิดหน้าร้านจริง ↗
        </Link>
      </div>

      {/* ── ตัวอย่าง (ใช้คอมโพเนนต์เดียวกับหน้าร้าน) ── */}
      <section className={`mt-5 p-5 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">👀 ตัวอย่างที่ลูกค้าเห็น</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={nav.tilesOn}
              onChange={(e) => edit((n) => ({ ...n, tilesOn: e.target.checked }))}
              className="h-4 w-4 accent-amber-500"
            />
            แสดงการ์ดนำทางบนหน้าแรก
          </label>
        </div>

        {/* แถบเมนูด้านบน */}
        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
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

        {/* การ์ดนำทาง */}
        <div className="mt-3">
          {shownTiles.length ? (
            <NavTiles tiles={shownTiles} preview />
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
            ["tiles", `🧱 การ์ดนำทาง (${nav.tiles.length})`],
            ["menu", `🔗 แถบเมนูด้านบน (${nav.menu.length})`],
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

      {/* ══════ การ์ดนำทาง ══════ */}
      {tab === "tiles" && (
        <section className="mt-4 space-y-3">
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

                <TileImage tile={t} onChange={(v) => setTile(t.id, { image: v })} />
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

      {/* ══════ แถบเมนูด้านบน ══════ */}
      {tab === "menu" && (
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

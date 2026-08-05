"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MegaBadge, MegaColumn, MegaGroup, MegaItem } from "@/lib/home-nav";
import { fetchProductsLite } from "@/lib/product-repo";
import type { Product } from "@/lib/products";

/**
 * เมนูดรอปดาวน์เต็มความกว้าง (mega menu) — แบบเดียวกับหน้าเว็บหลักของร้าน
 *
 * จอใหญ่: ชี้/กดที่หัวข้อ → แผงกางเต็มความกว้างใต้แถบเมนู
 * มือถือ: อยู่ในปุ่ม ☰ เป็นหัวข้อพับ–กางทีละอัน
 *
 * คอลัมน์ที่ตั้ง autoCategory ไว้จะดึงรายชื่อสินค้าจริงมาแสดงเอง —
 * โหลดข้อมูลสินค้าตอนเปิดแผงครั้งแรกเท่านั้น (ไม่ถ่วงทุกหน้า)
 */

const BADGE_STYLE: Record<Exclude<MegaBadge, "">, string> = {
  N: "bg-rose-500",
  H: "bg-orange-500",
};

function Badge({ badge }: { badge?: MegaBadge }) {
  if (!badge) return null;
  return (
    <span
      className={`ml-1.5 inline-grid h-4 w-4 place-items-center rounded text-[10px] font-bold text-white ${BADGE_STYLE[badge]}`}
      title={badge === "N" ? "มาใหม่" : "ขายดี"}
    >
      {badge}
    </span>
  );
}

/** ป้ายบนสินค้า → ตัวย่อในเมนู */
const badgeOf = (p: Product): MegaBadge => (p.badge === "ใหม่" ? "N" : p.badge === "ขายดี" ? "H" : "");

/** รายการที่จะแสดงในคอลัมน์ — พิมพ์เองมาก่อน ถ้าไม่มีค่อยดึงจากหมวด */
function itemsOf(col: MegaColumn, products: Product[]): MegaItem[] {
  if (col.items.length) return col.items;
  if (!col.autoCategory) return [];
  return products
    .filter((p) => p.category === col.autoCategory)
    .slice(0, col.autoLimit ?? 6)
    .map((p) => ({ id: p.id, label: p.name, href: `/products/${p.id}`, badge: badgeOf(p) }));
}

/** เนื้อในของแผง — ใช้ทั้งหน้าร้านจริงและหน้าตัวอย่างในหลังบ้าน */
export function MegaPanel({
  group,
  products,
  onNavigate,
  preview = false,
}: {
  group: MegaGroup;
  products: Product[];
  onNavigate?: () => void;
  preview?: boolean;
}) {
  const A = preview
    ? ({ href: _href, children, ...rest }: { href: string; children: React.ReactNode; className?: string }) => (
        <span {...rest}>{children}</span>
      )
    : ({ href, children, ...rest }: { href: string; children: React.ReactNode; className?: string }) => (
        <Link href={href} onClick={onNavigate} {...rest}>
          {children}
        </Link>
      );

  return (
    <div className="flex gap-6">
      {group.image && (
        <div className="hidden w-60 shrink-0 self-stretch lg:block">
          <A href={group.imageHref || "/products"} className="block h-full overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={group.image} alt={group.label} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
          </A>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {group.heading && <p className="mb-3 text-base font-extrabold text-stone-800">{group.heading}</p>}

        {/* แถวภาพสินค้าแนะนำ */}
        {(group.promos?.length ?? 0) > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {group.promos!.map((pm) => (
              <A key={pm.id} href={pm.href} className="group/promo block overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pm.image}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-200 group-hover/promo:scale-105"
                />
              </A>
            ))}
          </div>
        )}

        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {group.columns.map((col) => {
            const items = itemsOf(col, products);
            return (
              <div key={col.id} className="min-w-0">
                {col.image && (
                  <A href={col.href || "/products"} className="mb-2 block overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={col.image} alt={col.title} className="aspect-[4/3] w-full object-cover" />
                  </A>
                )}
                {col.href ? (
                  <A
                    href={col.href}
                    className="block text-sm font-extrabold text-stone-800 transition hover:text-amber-600"
                  >
                    {col.title}
                  </A>
                ) : (
                  <p className="text-sm font-extrabold text-stone-800">{col.title}</p>
                )}

                <ul className="mt-2 space-y-1.5">
                  {items.map((it) => (
                    <li key={it.id}>
                      <A
                        href={it.href}
                        className="flex items-start text-[0.82rem] leading-snug text-stone-600 transition hover:text-amber-600"
                      >
                        {/* ชื่อสินค้าจริงยาวกว่าเมนูที่พิมพ์เอง — ตัด 2 บรรทัดแทนตัดกลางคำ */}
                        <span className="line-clamp-2">{it.label}</span>
                        <Badge badge={it.badge} />
                      </A>
                    </li>
                  ))}
                  {items.length === 0 && <li className="text-xs text-stone-400">(ยังไม่มีสินค้าในหมวดนี้)</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** โหลดสินค้าครั้งเดียวตอนต้องใช้จริง */
function useLazyProducts(needed: boolean) {
  const [products, setProducts] = useState<Product[]>([]);
  const asked = useRef(false);
  useEffect(() => {
    if (!needed || asked.current) return;
    asked.current = true;
    void fetchProductsLite().then(setProducts);
  }, [needed]);
  return products;
}

/** แถบหัวข้อ + แผงดรอปดาวน์ (จอใหญ่) */
export function MegaBar({ groups, pathname }: { groups: MegaGroup[]; pathname: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const products = useLazyProducts(openId !== null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // หน่วงนิดหนึ่งตอนเมาส์ออก — เผื่อคนลากเมาส์ผ่านช่องว่างระหว่างปุ่มกับแผง
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), 160);
  }, []);

  useEffect(() => () => cancelClose(), []);
  useEffect(() => setOpenId(null), [pathname]); // เปลี่ยนหน้าแล้วปิด

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!groups.length) return null;
  const open = groups.find((g) => g.id === openId) ?? null;

  return (
    <div className="hidden md:flex md:items-center" onMouseLeave={scheduleClose} onMouseEnter={cancelClose}>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          onMouseEnter={() => {
            cancelClose();
            setOpenId(g.id);
          }}
          onFocus={() => setOpenId(g.id)}
          onClick={() => setOpenId((v) => (v === g.id ? null : g.id))}
          aria-expanded={openId === g.id}
          aria-haspopup="true"
          className={`flex items-center gap-0.5 whitespace-nowrap rounded-full px-3 py-2 text-[0.85rem] font-semibold transition lg:px-3.5 ${
            openId === g.id ? "bg-amber-100 text-amber-900" : "text-stone-600 hover:bg-amber-50 hover:text-amber-800"
          }`}
        >
          {g.label}
          <span className={`text-[0.55rem] text-stone-400 transition ${openId === g.id ? "rotate-180 text-amber-700" : ""}`}>▼</span>
        </button>
      ))}

      {open && (
        <>
          {/* ฉากหลังจาง — กดที่ไหนก็ปิด */}
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setOpenId(null)}
            className="fixed inset-0 top-16 z-30 cursor-default bg-stone-900/10"
          />
          <div
            className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-amber-100 bg-white shadow-xl"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="mx-auto max-w-6xl px-4 py-6">
              <MegaPanel group={open} products={products} onNavigate={() => setOpenId(null)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** หัวข้อพับ–กาง (ในเมนู ☰ บนมือถือ) */
export function MegaMobile({ groups, onNavigate }: { groups: MegaGroup[]; onNavigate: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const products = useLazyProducts(openId !== null);
  if (!groups.length) return null;

  return (
    <div className="border-t border-amber-50 pt-1">
      {groups.map((g) => {
        const on = openId === g.id;
        return (
          <div key={g.id}>
            <button
              type="button"
              onClick={() => setOpenId(on ? null : g.id)}
              aria-expanded={on}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-stone-700"
            >
              {g.label}
              <span className={`text-xs transition ${on ? "rotate-180" : ""}`}>▼</span>
            </button>
            {on && (
              <div className="space-y-3 px-4 pb-3">
                {g.columns.map((col) => (
                  <div key={col.id}>
                    <p className="text-xs font-extrabold text-stone-800">{col.title}</p>
                    <ul className="mt-1 space-y-1">
                      {itemsOf(col, products).map((it) => (
                        <li key={it.id}>
                          <Link
                            href={it.href}
                            onClick={onNavigate}
                            className="flex items-start py-0.5 text-[0.82rem] leading-snug text-stone-600"
                          >
                            <span className="line-clamp-2">{it.label}</span>
                            <Badge badge={it.badge} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

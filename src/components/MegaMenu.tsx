"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MegaBadge, MegaColumn, MegaGroup, MegaItem } from "@/lib/home-nav";
import { fetchProductNamesLite } from "@/lib/product-repo";
import { productPath, type Product } from "@/lib/products";

/**
 * เมนูดรอปดาวน์เต็มความกว้าง (mega menu) — แบบเดียวกับหน้าเว็บหลักของร้าน
 *
 * จอใหญ่: ชี้/กดที่หัวข้อ → แผงกางเต็มความกว้างใต้แถบเมนู
 * มือถือ: อยู่ในปุ่ม ☰ เป็นหัวข้อพับ–กางทีละอัน
 *
 * คอลัมน์ที่ตั้ง autoCategory ไว้จะดึงรายชื่อสินค้าจริงมาแสดงเอง —
 * โหลดข้อมูลสินค้าตอนเปิดแผงครั้งแรกเท่านั้น (ไม่ถ่วงทุกหน้า)
 */

/** ป้ายท้ายรายการ ตามสไตล์เว็บหลักของร้าน — N กรอบแดงโปร่ง · H พื้นแดงทึบ */
const BADGE_STYLE: Record<Exclude<MegaBadge, "">, string> = {
  N: "border border-red-500 text-red-500",
  H: "border border-red-500 bg-red-500 text-white",
};

function Badge({ badge }: { badge?: MegaBadge }) {
  if (!badge) return null;
  return (
    <span
      className={`mega-badge ml-1.5 inline-block shrink-0 rounded-[5px] px-[5px] py-px text-[10px] font-semibold leading-4 ${BADGE_STYLE[badge]}`}
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
    .map((p) => ({ id: p.id, label: p.name, href: productPath(p), badge: badgeOf(p) }));
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
        {group.heading && <p className="mega-heading mb-3 text-[16px] font-semibold text-stone-800">{group.heading}</p>}

        {/* แถวภาพสินค้าแนะนำ */}
        {(group.promos?.length ?? 0) > 0 && (
          <div className="mega-promos mb-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
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
                  <A href={col.href || "/products"} className="mega-col-img mb-2 block overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={col.image} alt={col.title} className="aspect-[4/3] w-full object-cover" />
                  </A>
                )}
                {col.href ? (
                  <A
                    href={col.href}
                    className="mega-col-title block text-[16px] font-semibold text-stone-800 transition hover:text-[#26b6cf]"
                  >
                    {col.title}
                  </A>
                ) : (
                  <p className="mega-col-title text-[16px] font-semibold text-stone-800">{col.title}</p>
                )}

                <ul className="mega-list mt-2 space-y-1.5">
                  {items.map((it) => (
                    <li key={it.id}>
                      <A
                        href={it.href}
                        className="flex w-fit items-start text-sm leading-snug text-stone-600 transition duration-200 hover:translate-x-[5px] hover:text-[#26b6cf]"
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
    void fetchProductNamesLite().then(setProducts);
  }, [needed]);
  return products;
}

/** แถบหัวข้อ + แผงดรอปดาวน์ (จอใหญ่) */
export function MegaBar({
  groups,
  pathname,
  align = "center",
}: {
  groups: MegaGroup[];
  pathname: string;
  /** center = กึ่งกลางเต็มแถว (เดิม) · end = ชิดขวาในคอลัมน์ของตัวเอง (เลย์เอาต์โลโก้คร่อมสองแถว) */
  align?: "center" | "end";
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const products = useLazyProducts(openId !== null);

  // คลิกนอกแผง = ปิดเมนู "โดยไม่กินคลิก" — ลิงก์/ปุ่มที่ลูกค้าคลิกทำงานทันทีในคลิกเดียว
  // (เดิมใช้ฉากหลังเป็นปุ่มเต็มจอ คลิกแรกโดนฉากหลังกิน ต้องคลิกซ้ำถึงจะไปหน้าอื่น)
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return; // คลิกในแถบ/แผงเอง — ปล่อยตามปกติ
      setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [openId]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const cancelOpen = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  // หน่วงนิดหนึ่งตอนเมาส์ออก — เผื่อคนลากเมาส์ผ่านช่องว่างระหว่างปุ่มกับแผง
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), 160);
  }, []);
  /**
   * เปิดแบบหน่วง (hover-intent) — เมาส์แค่ "ลากผ่าน" หัวข้อระหว่างจะไปคลิกอย่างอื่น
   * ไม่ควรเด้งแผง+ฉากหลังมาดักคลิก (เคยทำให้ต้องคลิกซ้ำถึงจะไปหน้าอื่นได้)
   * ต้องชี้ค้าง ~140ms ถึงเปิด · แต่ถ้าแผงเปิดอยู่แล้ว เลื่อนข้ามหัวข้อ = สลับทันทีตามเดิม
   */
  const scheduleOpen = useCallback((id: string) => {
    cancelClose();
    cancelOpen();
    openTimer.current = setTimeout(() => setOpenId(id), 140);
  }, []);

  useEffect(() => () => {
    cancelClose();
    cancelOpen();
  }, []);
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
    <div
      ref={rootRef}
      className={`catbar${align === "end" ? " end" : ""}`}
      onMouseLeave={() => {
        cancelOpen();
        scheduleClose();
      }}
      onMouseEnter={cancelClose}
    >
      {/* แคปซูลแก้วใบเล็ก — เข้าชุดกับแถบเมนูด้านบน · เลื่อนแนวนอนได้ถ้าหมวดเยอะ */}
      <div className="catbar-in">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onMouseEnter={() => {
              // แผงเปิดอยู่แล้ว = สลับหัวข้อทันที · ยังไม่เปิด = รอชี้ค้างก่อน (กันเด้งมาดักคลิก)
              if (openId) {
                cancelClose();
                setOpenId(g.id);
              } else {
                scheduleOpen(g.id);
              }
            }}
            onMouseLeave={cancelOpen}
            onFocus={() => setOpenId(g.id)}
            onClick={() => {
              cancelOpen();
              setOpenId((v) => (v === g.id ? null : g.id));
            }}
            aria-expanded={openId === g.id}
            aria-haspopup="true"
            className={`catbar-btn${openId === g.id ? " on" : ""}`}
          >
            {g.label}
            <svg viewBox="0 0 10 6" aria-hidden="true" className="chev">
              <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      {open && (
        <>
          {/* ฉากหลังจาง — แค่ภาพ ไม่กินคลิก (ปิดเมนูด้วย listener ด้านบน คลิกเดียวทั้งปิดเมนูและไปหน้าที่คลิก) */}
          <div aria-hidden="true" className="catbar-scrim" />
          <div className="catbar-panel" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <div className="catbar-panel-in">
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
                            className="flex items-start py-0.5 text-sm leading-snug text-stone-600"
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

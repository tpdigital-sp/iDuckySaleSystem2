"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import Portal from "@/components/Portal";
import { LINE_SOCIAL, SOCIAL_LINKS } from "@/components/SocialLinks";
import { LINE_URL } from "@/components/LineButton";
import { useFreeShipMin } from "@/components/FooterFreeShip";
import { formatPrice } from "@/lib/products";
import { useCustomer } from "@/lib/customer-context";
import { accentOf } from "@/lib/cat-groups";
import { productPath } from "@/lib/products";
import { categoryIcon, splitCatName } from "@/lib/site-search";
import { useShopCatalog } from "@/lib/use-shop-catalog";
import { fallbackToOriginal, imgProps } from "@/lib/img";

/* eslint-disable @next/next/no-img-element */

/**
 * เมนูหมวดหมู่แบบเต็มจอ (มือถือ/แท็บเล็ต) — เปิดจากปุ่มสามขีด สไตล์ glassmorphism ตามต้นแบบ (.mnav-overlay)
 * รายการหมวด = หมวดจริงจากหลังบ้าน (ไอคอนหมวด + สี accent ชุดเดียวกับเมกะเมนู)
 * ปุ่มลูกศรท้ายแถว = กางชนิดย่อย (สินค้า 5 ตัวแรกของหมวด) แบบ accordion
 * แขวนที่ <body> ผ่าน Portal (แถบเมนูมี backdrop-filter ซึ่งจะกัก position:fixed ไว้) แล้วครอบ .dl ให้ CSS ครอบถึง
 */
export default function MobileNav({ open, onClose, logo }: { open: boolean; onClose: () => void; logo?: string }) {
  const { cats, byCat } = useShopCatalog(open);
  const { customer } = useCustomer();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const freeShipMin = useFreeShipMin();

  // ล็อกสกรอลล์หน้าหลังตอนเมนูเปิด + Esc ปิด
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Portal>
      <div className="dl dl-contents">
        <div
          className={`mnav-overlay${open ? " open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="เมนูหมวดหมู่สินค้า"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="mnav-panel">
            <div className="mnav-top">
              <Link className="mnav-logo" href="/" aria-label="iDucky Prints Studio" onClick={onClose}>
                {logo ? (
                  <img {...imgProps(logo, "160px", 384)} onError={fallbackToOriginal(logo)} alt="iDucky Prints Studio" />
                ) : (
                  <img src="/landing/logo-ducky.png" alt="iDucky Prints Studio" width={722} height={243} />
                )}
              </Link>
              <button type="button" className="mnav-close" aria-label="ปิดเมนู" onClick={onClose}>
                ✕
              </button>
            </div>

            <nav className="mnav-list" aria-label="หมวดหมู่สินค้า">
              {cats.map((c, i) => {
                const subs = byCat.get(c.id) ?? [];
                const isOpen = expanded.has(c.id);
                const icon = categoryIcon(c);
                return (
                  <Fragment key={c.id}>
                    <Link
                      href={`/products?category=${c.id}`}
                      data-cat={c.id}
                      className={isOpen ? "mnav-open" : undefined}
                      style={{ "--accent": accentOf(c.id, i) } as React.CSSProperties}
                      onClick={onClose}
                    >
                      <i>{icon ? <img className="mnav-real-ico" src={icon} alt="" loading="lazy" /> : c.emoji}</i>
                      <b>
                        {splitCatName(c.name).main}
                        {splitCatName(c.name).sub && <small>{splitCatName(c.name).sub}</small>}
                      </b>
                      <span>→</span>
                      {subs.length > 0 && (
                        <span
                          role="button"
                          tabIndex={0}
                          className={`mnav-expand${isOpen ? " open" : ""}`}
                          aria-label="ดูชนิดย่อย"
                          aria-expanded={isOpen}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggle(c.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              toggle(c.id);
                            }
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      )}
                    </Link>
                    {subs.length > 0 && (
                      <div className={`mnav-subs${isOpen ? " open" : ""}`} style={{ "--accent": accentOf(c.id, i) } as React.CSSProperties}>
                        {subs.map((p) => (
                          <Link key={p.id} href={productPath(p)} onClick={onClose}>
                            {p.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </nav>
            <Link className="mnav-all" href="/products" onClick={onClose}>
              ดูสินค้าทั้งหมด {cats.length} หมวด →
            </Link>

            <div className="mnav-divider" />
            <div className="mnav-sec-head">บัญชีของฉัน</div>
            <nav className="mnav-list mnav-list-sub mnav-grid" aria-label="บัญชี">
              {customer ? (
                <Link href="/account" onClick={onClose}>
                  <i>👤</i>
                  <b>บัญชีของฉัน</b>
                  <span>→</span>
                </Link>
              ) : (
                <Link href="/account/login" onClick={onClose}>
                  <i>👤</i>
                  <b>เข้าสู่ระบบ</b>
                  <span>→</span>
                </Link>
              )}
              <Link href="/account/orders" onClick={onClose}>
                <i>📦</i>
                <b>ติดตามออเดอร์</b>
                <span>→</span>
              </Link>
              <Link href="/cart" onClick={onClose}>
                <i>🛒</i>
                <b>ตะกร้าสินค้า</b>
                <span>→</span>
              </Link>
            </nav>

            <div className="mnav-divider" />
            <div className="mnav-sec-head">เกี่ยวกับร้าน</div>
            <nav className="mnav-list mnav-list-sub mnav-grid" aria-label="ลิงก์อื่นๆ">
              <Link href="/#bestseller" onClick={onClose}>
                <i>🔥</i>
                <b>สินค้าขายดี</b>
                <span>→</span>
              </Link>
              <Link href="/how-to-order" onClick={onClose}>
                <i>📝</i>
                <b>วิธีสั่งซื้อ</b>
                <span>→</span>
              </Link>
              <Link href="/how-to-order" onClick={onClose}>
                <i>🚚</i>
                <b>จัดส่ง &amp; เคลม</b>
                <span>→</span>
              </Link>
              <Link href="/#why" onClick={onClose}>
                <i>💗</i>
                <b>ทำไมต้องเรา</b>
                <span>→</span>
              </Link>
              <Link href="/dealer" onClick={onClose}>
                <i>🤝</i>
                <b>สมัครตัวแทน</b>
                <span>→</span>
              </Link>
            </nav>

            <div className="mnav-divider" />
            <div className="mnav-sec-head">ติดต่อร้าน</div>
            {/* ข้อมูลชุดเดียวกับท้ายเว็บ — แถวละเรื่อง มีปุ่มคัดลอกแยกอยู่ขวา (ปุ่มซ้อนใน <a> ไม่ได้) */}
            <div className="mnav-contact">
              <div className="mnav-cline">
                <a className="mnav-cbtn" href="tel:0965699414">
                  <i>📞</i>
                  <span>
                    <b>096-569-9414</b>
                    <small>โทรสอบถาม / สั่งงาน</small>
                  </span>
                </a>
                <CopyButton text="0965699414" label="คัดลอกเบอร์โทร" />
              </div>
              <div className="mnav-cline">
                <a className="mnav-cbtn line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                  <i>💬</i>
                  <span>
                    <b>แอด LINE ร้าน</b>
                    <small>@iduckyofficial</small>
                  </span>
                </a>
                <CopyButton text="@iduckyofficial" label="คัดลอกไอดีไลน์" />
              </div>
              <div className="mnav-cline">
                <Link className="mnav-cbtn" href="/#contact" onClick={onClose}>
                  <i>📍</i>
                  <span>
                    <b>บริษัท ทีพีดิจิตอล</b>
                    <small>663/8 ซ.ฉลองกรุง 1 ลาดกระบัง กทม. 10520</small>
                  </span>
                </Link>
                <CopyButton text="บริษัท ทีพีดิจิตอล 663/8 ซอยฉลองกรุง 1 แขวง/เขตลาดกระบัง กทม. 10520" label="คัดลอกที่อยู่" />
              </div>
            </div>
            <p className="mnav-hours">
              <span>🕓 จันทร์–ศุกร์ 09.00–18.00 น.</span>
              {/* ยอดส่งฟรีจากค่าที่ร้านตั้ง (ท้ายเว็บใช้ตัวเดียวกัน) · ปิดโปร = ไม่โชว์ */}
              {freeShipMin === null ? (
                <span>🚚 ส่งฟรีเมื่อครบยอดที่กำหนด</span>
              ) : freeShipMin > 0 ? (
                <span>🚚 ส่งฟรีเมื่อครบ {formatPrice(freeShipMin)} ทั่วไทย</span>
              ) : null}
            </p>
            <div className="mnav-legal">
              <Link href="/terms" onClick={onClose}>
                เงื่อนไขการใช้บริการ
              </Link>
              <Link href="/privacy" onClick={onClose}>
                นโยบายความเป็นส่วนตัว
              </Link>
            </div>
            {/* data-net = สีแบรนด์ของแพลตฟอร์มตอนชี้/กด (CSS .mnav-socials a[data-net]) · LINE นำหน้าตามต้นแบบ */}
            <nav className="mnav-socials" aria-label="ช่องทางโซเชียลของร้าน">
              {[LINE_SOCIAL, ...SOCIAL_LINKS].map((s) => (
                <a key={s.key} data-net={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}>
                  {s.icon}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * ปุ่มคัดลอกข้อความติดต่อ (เบอร์/ไอดีไลน์/ที่อยู่) — Clipboard API ถ้ามี ไม่มี (หรือไม่ใช่ https) ใช้ execCommand แทน
 * กดแล้วขึ้นสีเขียว "คัดลอกแล้ว" 1.4 วิ (CSS .mnav-copy.copied)
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* เบราว์เซอร์ไม่ให้คัดลอก — ปล่อยผ่าน */
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button type="button" className={`mnav-copy${copied ? " copied" : ""}`} aria-label={copied ? "คัดลอกแล้ว" : label} onClick={copy}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2.4" />
        <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 4h8A1.5 1.5 0 0 1 14.5 5.5V6" />
      </svg>
    </button>
  );
}

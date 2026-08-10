"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPriceRange, PRODUCTS, productPath, type Product } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { fetchProductsLite } from "@/lib/product-repo";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import HomeChat from "@/components/HomeChat";

/**
 * หน้าแรก — ดีไซน์ตามไฟล์ต้นแบบ iducky-landing-v8_83.html
 * สไตล์ทั้งหมดอยู่ใน (shop)/landing.css (ครอบด้วยคลาส .dl) · รูปประกอบอยู่ /public/landing
 * เนื้อหาที่เป็น "ของจริง" ดึงจากฐานข้อมูล: หมวดสินค้า · รายการสินค้าในแต่ละหมวด · สินค้าขายดี
 */

/** จัดหมวดจริงของร้านเข้ากลุ่มแท็บ 4 กลุ่มตามดีไซน์ */
const TAB_GROUPS: { id: string; label: string; cats: string[] }[] = [
  { id: "acrylic", label: "อะคริลิค & สแตนดี้", cats: ["acrylic", "acrylic-bending", "standee", "light", "mirror-magnet"] },
  { id: "paper", label: "งานกระดาษ & สติกเกอร์", cats: ["sticker-paper", "card-photo", "banner", "calendar-frame"] },
  { id: "goods", label: "ของใช้ & แก็ดเจ็ต", cats: ["phone-gadget", "home", "bag"] },
  { id: "wear", label: "เสื้อผ้า & ของขวัญ", cats: ["apparel", "fabric", "gifts"] },
];

/** ไอคอนวาดมือของหมวดหลัก (จากไฟล์ต้นแบบ) — หมวดอื่นใช้อีโมจิของหมวดนั้น */
const CAT_ICON: Record<string, string> = {
  acrylic: "/landing/cat-ico-1.webp",
  standee: "/landing/cat-ico-2.webp",
  "card-photo": "/landing/cat-ico-3.webp",
  "sticker-paper": "/landing/cat-ico-4.webp",
  home: "/landing/cat-ico-5.webp",
  light: "/landing/cat-ico-6.webp",
  "phone-gadget": "/landing/cat-ico-7.webp",
  apparel: "/landing/cat-ico-8.webp",
  fabric: "/landing/cat-ico-9.webp",
  gifts: "/landing/cat-ico-10.webp",
};

const groupOf = (catId: string) => TAB_GROUPS.find((g) => g.cats.includes(catId))?.id ?? "goods";

/**
 * ค่อย ๆ โผล่ตอนเลื่อนถึง (คลาส .rv → .in ตามดีไซน์)
 * ใช้การวัดตำแหน่งตอนเลื่อน ไม่ใช้ IntersectionObserver — IO ไม่ยิงตอนแท็บอยู่เบื้องหลัง
 * ถ้าพลาดจะกลายเป็นเนื้อหาโปร่งใสถาวร (เคยเจอตอนทดสอบ) แบบนี้ปลอดภัยกว่า
 */
function useReveal() {
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const els = document.querySelectorAll<HTMLElement>(".dl .rv:not(.in)");
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92 && r.bottom > 0) el.classList.add("in");
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // กันเหนียว: ถ้าอะไรผิดพลาด เนื้อหาต้องไม่หายถาวร
    const t = setTimeout(() => document.querySelectorAll(".dl .rv").forEach((el) => el.classList.add("in")), 4000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

export default function HomePage() {
  const [all, setAll] = useState<Product[]>(PRODUCTS);
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [tab, setTab] = useState<string>("all");

  useEffect(() => {
    fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
  }, []);
  useEffect(() => {
    let active = true;
    fetchProductsLite().then((ps) => {
      // ตัดสินค้าที่ปิดการมองเห็นไว้ออกก่อน — หน้าแรกโชว์เฉพาะของที่ขายจริง
      if (active && ps.length) setAll(ps.filter((p) => !p.hidden));
    });
    return () => {
      active = false;
    };
  }, []);
  useReveal();

  /** สินค้าตัวอย่างในแต่ละหมวด (โชว์ในเมนูย่อยของการ์ดหมวด) */
  const byCat = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of all) {
      const list = m.get(p.category) ?? [];
      if (list.length < 5) list.push(p);
      m.set(p.category, list);
    }
    return m;
  }, [all]);

  /**
   * ขายดี 8 ใบ — เอาสินค้าที่ติดธง "แนะนำ" ขึ้นก่อน (ร้านคุมได้ว่าจะโชว์ตัวไหนหน้าแรก)
   * แล้วค่อยเติมด้วยตัวที่ขายดีที่สุดจนครบ · ในแต่ละกลุ่มเรียงตามยอดขายจริง
   */
  const best = useMemo(() => {
    const bySold = (a: Product, b: Product) => b.sold - a.sold;
    const picked = all.filter((p) => p.featured).sort(bySold);
    const rest = all.filter((p) => !p.featured).sort(bySold);
    return [...picked, ...rest].slice(0, 8);
  }, [all]);

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="dl dl-page">
      {/* พื้นหลังวงกลมพาสเทลลอยช้า ๆ */}
      <div className="bg-fx" aria-hidden="true">
        <div className="bg-orb o1" />
        <div className="bg-orb o2" />
      </div>

      <div className="top-stack">
        {/* ── HERO ── */}
        <section className="hero" id="top">
          <img className="bg-cloud bc1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
          <img className="bg-cloud bc2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
          <img className="bg-cloud bc3" src="/landing/cloud.webp" alt="" aria-hidden="true" />
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">
                โรงพิมพ์สินค้าตามสั่ง &amp; ของสะสม <span className="beat">♥</span>
              </span>
              <h1 className="title">
                <span className="word" style={{ animationDelay: ".05s" }}>
                  พิมพ์ลายของคุณ
                </span>
                <span className="l2">
                  <span className="word" style={{ animationDelay: ".2s" }}>
                    ลงบน<span className="mark">ของที่คุณรัก</span>
                  </span>
                </span>
                <span className="l3">
                  <span className="word" style={{ animationDelay: ".35s" }}>
                    ได้ทุกชิ้น 💛
                  </span>
                </span>
              </h1>
              <p className="lead">
                พวงกุญแจ · สแตนดี้ · สติกเกอร์ · เสื้อยืด · แก้วมัค · เคสมือถือ
                <br />
                และอีกกว่า <b>{cats.length} หมวด</b> ครบจบในที่เดียว
              </p>
              <div className="chips">
                <div className="chip">
                  <i style={{ background: "var(--sky-200)", color: "#3E9BD4" }}>
                    <img src="/landing/chip-ico-1.webp" alt="" aria-hidden="true" />
                  </i>
                  <span>
                    <b>งานคุณภาพ</b>
                    <small>สีสด คมชัด</small>
                  </span>
                </div>
                <div className="chip">
                  <i style={{ background: "var(--yolk-soft)", color: "#D79A15" }}>
                    <img src="/landing/chip-ico-2.webp" alt="" aria-hidden="true" />
                  </i>
                  <span>
                    <b>ผลิตไว</b>
                    <small>ส่งตรงเวลา</small>
                  </span>
                </div>
                <div className="chip">
                  <i style={{ background: "#FFE0E6", color: "#E37D93" }}>
                    <img src="/landing/chip-ico-3.webp" alt="" aria-hidden="true" />
                  </i>
                  <span>
                    <b>แอดมินใจดี</b>
                    <small>ปรึกษาลายฟรี</small>
                  </span>
                </div>
              </div>
              <div className="hero-btns">
                <Link className="btn btn-primary" href="/products">
                  ดูสินค้าทั้งหมด <span className="dot">→</span>
                </Link>
                <Link className="btn btn-ghost" href="/how-to-order">
                  วิธีสั่งซื้อ 📖
                </Link>
              </div>
            </div>

            <div className="stage">
              <img className="duck" src="/landing/hero-duck.webp" alt="มาสคอตเป็ด iDucky ถือพวงกุญแจอะคริลิคหน้าร้าน" />
              <img
                className="deco d-cloud1"
                style={{ top: "3%", left: "13%", width: "13%", opacity: 0.92 }}
                src="/landing/cloud.webp"
                alt=""
                aria-hidden="true"
              />
              <img
                className="deco d-cloud2"
                style={{ top: "26%", right: "-6%", width: "23%", opacity: 0.97 }}
                src="/landing/cloud.webp"
                alt=""
                aria-hidden="true"
              />
              <div className="deco d-cart" style={{ top: "18%", left: "14%", width: "15%" }} aria-hidden="true">
                <img src="/landing/cart-balloon.webp" alt="" />
                {/* เส้นแสงวิ่งผ่านป้าย — ตัดตามรูปทรงด้วย mask */}
                <span
                  className="cart-shine"
                  style={{ WebkitMaskImage: "url(/landing/cart-balloon.webp)", maskImage: "url(/landing/cart-balloon.webp)" }}
                />
              </div>
              <img
                className="deco d-star1"
                style={{ top: "4%", right: "-17%", width: "7.5%", animationDuration: "5.2s", animationDelay: "-.7s" }}
                src="/landing/star.webp"
                alt=""
                aria-hidden="true"
              />
              <img
                className="deco d-star2"
                style={{ bottom: "44%", left: "-1%", width: "5.5%", animationDuration: "7.4s", animationDelay: "-3.1s" }}
                src="/landing/star.webp"
                alt=""
                aria-hidden="true"
              />
              <img
                className="deco d-star3"
                style={{ top: "56%", right: "-19%", width: "6.5%", animationDuration: "6.1s", animationDelay: "-4.6s" }}
                src="/landing/star.webp"
                alt=""
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        {/* ── หมวดสินค้า ── */}
        <section id="categories" className="shop-band rv">
          <img
            className="shop-cloud"
            style={{ width: 210, top: "4%", left: -58, opacity: 0.9, animation: "bgFloat1 19s ease-in-out infinite, bgPuff 8s ease-in-out infinite" }}
            src="/landing/cloud.webp"
            alt=""
            aria-hidden="true"
          />
          <img
            className="shop-cloud"
            style={{ width: 150, top: "30%", right: -40, opacity: 0.75, animation: "bgFloat2 24s ease-in-out infinite, bgPuff 10s ease-in-out infinite reverse" }}
            src="/landing/cloud.webp"
            alt=""
            aria-hidden="true"
          />
          <img
            className="shop-cloud"
            style={{ width: 110, bottom: "8%", left: "9%", opacity: 0.55, animation: "bgFloat3 16s ease-in-out infinite, bgPuff 9s ease-in-out infinite" }}
            src="/landing/cloud.webp"
            alt=""
            aria-hidden="true"
          />
          <div className="wrap">
            <div className="head">
              <span className="kicker kicker-yolk">
                <i className="folder">🗂️</i>เมนูสินค้าของร้าน
              </span>
              <h2>
                สินค้าและบริการ<em>ของเรา</em>
              </h2>
              <div className="tabs" role="tablist">
                <button className={`tab${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>
                  ทั้งหมด
                </button>
                {TAB_GROUPS.map((g) => (
                  <button key={g.id} className={`tab${tab === g.id ? " on" : ""}`} onClick={() => setTab(g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
              <p>รับผลิตสินค้าคุณภาพหลากหลาย ครบจบในที่เดียว</p>
            </div>

            <div className="cats">
              {cats.map((c, i) => {
                const group = groupOf(c.id);
                const show = tab === "all" || group === tab;
                const items = byCat.get(c.id) ?? [];
                const href = `/products?category=${c.id}`;
                return (
                  <div
                    key={c.id}
                    className={`cat${show ? " is-in" : " is-hide"}`}
                    data-group={group}
                    style={{ animationDelay: `${(i % 10) * 45}ms` }}
                  >
                    <Link className="cat-link" href={href}>
                      {c.image ? (
                        <img className="cat-ico" {...imgProps(c.image, "96px", 160)} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={fallbackToOriginal(c.image)} />
                      ) : CAT_ICON[c.id] ? (
                        <img className="cat-ico" src={CAT_ICON[c.id]} alt="" aria-hidden="true" />
                      ) : (
                        <em>{c.emoji}</em>
                      )}
                      <b>{c.name}</b>
                      <small>{c.description || c.nameEn}</small>
                    </Link>
                    {items.length > 0 && (
                      <div className="sub">
                        <span className="sub-title">สินค้าในหมวดนี้</span>
                        {items.map((p) => (
                          <Link key={p.id} href={productPath(p)}>
                            {p.name}
                            <span>›</span>
                          </Link>
                        ))}
                        <Link className="sub-all" href={href}>
                          ดูทั้งหมดในหมวดนี้ →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="center">
              <Link className="btn btn-primary" href="/products">
                ดูสินค้าทั้งหมด <span className="dot">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── แถบข้อความวิ่ง ── */}
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((k) => (
              <span key={k} style={{ display: "contents" }}>
                <span>ไม่มีขั้นต่ำ เริ่มที่ 1 ชิ้น</span>
                <span>ออกแบบฟรีทุกออเดอร์</span>
                <span>ยืนยันแบบก่อนผลิตทุกงาน</span>
                <span>แพ็คกันกระแทกอย่างดี</span>
                <span>ส่งไวทั่วไทย</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── สินค้าขายดี ── */}
      <section id="bestseller" className="wrap rv gap">
        <div className="head">
          <span className="kicker kicker-fire">
            <i className="flame">🔥</i>ขายดีประจำร้าน
          </span>
          <h2>
            ลูกค้า<em>สั่งซ้ำ</em>บ่อยที่สุด
          </h2>
          <p>ราคานี้รวมพิมพ์ลายของคุณแล้ว สั่งชิ้นเดียวก็ทำได้</p>
        </div>
        <div className="rail in">
          {best.map((p, i) => (
            <BestCard key={p.id} p={p} catLabel={catName(p.category)} rank={i} />
          ))}
        </div>
      </section>

      {/* ── ทำไมต้องเรา + ขั้นตอน ── */}
      <div className="ws-band">
        <div className="ws-bg" aria-hidden="true" />
        <img
          className="ws-cloud"
          style={{ width: 190, top: "6%", left: -40, opacity: 0.85, animation: "bgFloat1 22s ease-in-out infinite, bgPuff 9s ease-in-out infinite" }}
          src="/landing/cloud.webp"
          alt=""
          aria-hidden="true"
        />
        <img
          className="ws-cloud"
          style={{ width: 140, bottom: "14%", right: -30, opacity: 0.7, animation: "bgFloat2 27s ease-in-out infinite, bgPuff 11s ease-in-out infinite reverse" }}
          src="/landing/cloud.webp"
          alt=""
          aria-hidden="true"
        />
        <img className="ws-star" style={{ top: "12%", right: "8%", width: 30 }} src="/landing/star.webp" alt="" aria-hidden="true" />
        <img className="ws-star" style={{ top: "52%", left: "5%", width: 22, animationDelay: "-2.6s" }} src="/landing/star.webp" alt="" aria-hidden="true" />

        <section id="why" className="wrap rv">
          <div className="why">
            <img className="why-gift" src="/landing/cat-ico-5.webp" alt="" aria-hidden="true" />
            <img className="why-float wf-heart" src="/landing/heart.webp" alt="" aria-hidden="true" />
            <img className="why-float wf-star" src="/landing/star4.webp" alt="" aria-hidden="true" />
            <img className="hug" src="/landing/duck-hug.webp" alt="มาสคอตเป็ด iDucky ถือหัวใจ" />
            <div>
              <div className="why-head">
                <span className="kicker kicker-why">
                  <i className="beat-heart">💗</i>เหตุผลที่ลูกค้าไว้ใจ
                </span>
                <h2>
                  ทำไมต้องเลือก <span style={{ color: "var(--yolk-deep)" }}>iDucky?</span>
                </h2>
              </div>
              <div className="why-grid">
                <div className="why-item">
                  <div className="orb o-blue">
                    <img src="/landing/why-ico-1.webp" alt="" aria-hidden="true" />
                  </div>
                  <h3>งานคุณภาพพรีเมียม</h3>
                  <p>พิถีพิถันทุกขั้นตอน ใส่ใจทุกรายละเอียด</p>
                </div>
                <div className="why-item">
                  <div className="orb o-yolk">
                    <img src="/landing/why-ico-2.webp" alt="" aria-hidden="true" />
                  </div>
                  <h3>ผลิตรวดเร็ว</h3>
                  <p>แจ้งคิวชัดเจน ส่งตรงเวลาที่นัดไว้</p>
                </div>
                <div className="why-item">
                  <div className="orb o-peach">
                    <img src="/landing/why-ico-3.webp" alt="" aria-hidden="true" />
                  </div>
                  <h3>พิมพ์สีสวย คมชัด</h3>
                  <p>ด้วยเทคโนโลยีการพิมพ์คุณภาพสูง</p>
                </div>
                <div className="why-item">
                  <div className="orb o-mint">
                    <img src="/landing/why-ico-4.webp" alt="" aria-hidden="true" />
                  </div>
                  <h3>บริการใส่ใจ</h3>
                  <p>ให้คำแนะนำ ดูแลทุกออเดอร์จนถึงมือ</p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* ── ปิดท้าย: ขั้นตอนสั่งซื้อ + ช่องแชทที่คุยกับผู้ช่วยร้านได้จริง ── */}
      <div className="chat-band" id="steps">
        <div className="chat-bg" aria-hidden="true" />
        <section className="wrap rv">
          <div className="head">
            <span className="kicker">💬 ถามได้เลย ไม่ต้องรอแอดมิน</span>
            <h2>
              พิมพ์ถามตรงนี้ได้เลย <em>ตอบทันที</em>
            </h2>
            <p>ถามราคา ขนาด วัสดุ หรือขั้นตอนสั่งทำ ผู้ช่วยของร้านตอบให้ทันทีตลอด 24 ชม. — คุยได้จริง ไม่ใช่ภาพตัวอย่าง</p>
          </div>

          <HomeChat catCount={cats.length} />

          <div className="chat-cta">
            <div className="cc-text">
              <h3>มีลายในใจแล้วใช่ไหม?</h3>
              <p>เลือกสินค้าที่ชอบ แล้วอัปโหลดลายของคุณ เดี๋ยวเราจัดการที่เหลือให้เอง</p>
            </div>
            <div className="cc-btns">
              <Link className="btn btn-yolk" href="/products">
                เริ่มออกแบบสินค้าของฉัน <span className="dot">→</span>
              </Link>
              <a className="btn btn-line" href="https://lin.ee/x8GkqGZ" target="_blank" rel="noreferrer">
                ทักแอดมินทาง LINE <span className="dot">💬</span>
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ── ช่องทางโซเชียลลอยมุมจอ ── */}
      <nav className="social-dock" aria-label="ช่องทางโซเชียลของร้าน">
        <a className="sd-fb" data-label="Facebook" href="https://www.facebook.com/iduckyshop" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
          </svg>
        </a>
        <a className="sd-ig" data-label="Instagram" href="https://www.instagram.com/iduckyshop1" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5.4" />
            <circle cx="12" cy="12" r="4.2" />
            <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </a>
        <a className="sd-tt" data-label="TikTok" href="https://www.tiktok.com/@iduckyofficial" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16.5 2h-2.9v13.2a2.5 2.5 0 11-2.1-2.5v-3a5.5 5.5 0 105.1 5.5V9.1a6.6 6.6 0 003.9 1.3V7.5a3.8 3.8 0 01-3.9-3.8V2z" />
          </svg>
        </a>
        <a className="sd-x" data-label="X (Twitter)" href="https://x.com/iduckyshop" target="_blank" rel="noopener noreferrer" aria-label="X">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.4-5.7L6 21H2.9l7.3-8.3L2.5 3h6.4l4 5.3L17.5 3z" />
          </svg>
        </a>
      </nav>
    </div>
  );
}

/** การ์ดสินค้าขายดี — เอียงตามเมาส์เล็กน้อยเหมือนไฟล์ต้นแบบ */
function BestCard({ p, catLabel, rank }: { p: Product; catLabel: string; rank: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  function onMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover:hover)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-9px) rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <Link ref={ref} className="card" href={productPath(p)} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="thumb">
        {rank < 3 && p.sold > 0 && (
          <span className="tag tag-hot">
            <i className="flame">🔥</i>ขายดี
          </span>
        )}
        {!p.sold && p.badge === "ใหม่" && (
          <span className="tag tag-new">
            <i className="sparkle">✨</i>NEW
          </span>
        )}
        {p.imageSrc ? (
          <img {...imgProps(p.imageSrc, "(max-width: 768px) 45vw, 260px")} alt={p.name} loading="lazy" decoding="async" onError={fallbackToOriginal(p.imageSrc)} />
        ) : (
          <span className={`grid h-full w-full place-items-center bg-gradient-to-br text-6xl ${p.gradient}`}>{p.emoji}</span>
        )}
      </div>
      <div className="card-body">
        <span className="cat-l">{catLabel}</span>
        <h3>{p.name}</h3>
        <div className="meta">
          <span className="price">{formatPriceRange(p)}</span>
          <span className="stars">
            ⭐ {p.rating} · ขายแล้ว {p.sold.toLocaleString("th-TH")}
          </span>
        </div>
        <span className="add">เลือกลาย</span>
      </div>
    </Link>
  );
}

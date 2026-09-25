"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, priceRange, productPath, type Product } from "@/lib/products";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { fetchSpotlight, splitAccent, type Spotlight as SpotlightData } from "@/lib/spotlight";

/**
 * 🎯 จุดเชียร์ขายบนหน้าแรก — "ร้านเลือกสินค้ามาให้ลูกค้าเห็นผ่านตา" (เจ้าของร้าน 25 ก.ย. 69)
 * คั่นระหว่างป้ายประชาสัมพันธ์กับ "สินค้ามาใหม่" · แอดมินเลือกสินค้า/ข้อความที่ /admin/spotlight · ปิดสวิตช์ = ไม่วาดอะไรเลย
 *
 * โครงเดียวกับแถว "สินค้ามาใหม่": หัวข้อกลาง (.head) + รางเลื่อนแนวนอน (.fresh-rail) เลื่อนเองทีละใบ มีลูกศร ‹ ›
 * ลูกเล่นเฉพาะส่วนนี้: น้องเป็ดแอบมองข้างหัวข้อ · รูปบนการ์ดสลับเป็นรูปที่สองเองเป็นจังหวะ · ชิปโผล่ทีละใบ
 * ราคา/ลิงก์/รูป มาจากสินค้าจริงที่หน้าแรกโหลดอยู่แล้ว ไม่พิมพ์เลขตายตัว · CSS ชุด .spot-* ท้าย landing.css
 */
export default function Spotlight({ products, catName }: { products: Product[] | null; catName: (id: string) => string }) {
  const [s, setS] = useState<SpotlightData | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSpotlight().then((d) => {
      if (alive) setS(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  /** จับคู่การ์ดกับสินค้าจริง — สินค้าหาย/ถูกซ่อน = ข้ามใบนั้น (ไม่โชว์การ์ดที่กดแล้วไปหน้าไม่มีสินค้า) */
  const cards = useMemo(() => {
    if (!s) return [];
    return s.styles
      .map((st) => {
        const p = byId.get(st.productId);
        if (!p) return null;
        const image = st.image ?? p.imageSrc;
        // รูปที่สองไว้สลับ — ถ้าแอดมินตั้งรูปการ์ดเอง ให้รูปปกสินค้าเป็นรูปที่สองแทน
        const alt = st.image && p.imageSrc && p.imageSrc !== st.image ? p.imageSrc : p.altSrc;
        return { st, p, image, alt: alt && alt !== image ? alt : undefined, min: priceRange(p).min };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [s, byId]);

  /** รางเลื่อน — ท่าเดียวกับแถว "สินค้ามาใหม่": ลูกศรเลื่อนเกือบเต็มจอ · เลื่อนเองทุก 4 วิ · ผู้ใช้แตะ/ปัดแล้วพัก 6 วิ */
  const railRef = useRef<HTMLDivElement>(null);
  const hold = useRef(0);
  const [hover, setHover] = useState(false);
  const pause = () => {
    hold.current = Date.now() + 6000;
  };
  const slide = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    pause();
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.82), behavior: "smooth" });
  };
  const many = cards.length > 4;
  useEffect(() => {
    if (hover || !many) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = railRef.current;
      if (!el || document.hidden || Date.now() < hold.current) return;
      const card = el.firstElementChild?.getBoundingClientRect().width ?? 240;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 8) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: card + 18, behavior: "smooth" });
    }, 4000);
    return () => clearInterval(id);
  }, [hover, many]);

  if (!s || !s.on || (products && cards.length === 0)) return null;
  const [plain, accent] = splitAccent(s);

  return (
    <section id="spotlight" className="spot-band rv" aria-label="สินค้าที่ร้านคัดมาให้ดู">
      <div className="wrap">
        <div className="head spot-head">
          {s.kicker && (
            <span className="kicker kicker-yolk">
              <i className="spot-pin">📌</i>
              {s.kicker}
            </span>
          )}
          <h2>
            {plain}
            {accent && <em>{accent}</em>}
          </h2>
          {s.lead && <p>{s.lead}</p>}
          {s.chips.length > 0 && (
            <ul className="spot-chips" aria-label="จุดเด่น">
              {s.chips.map((c, i) => (
                <li key={i} style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
                  <i>✓</i>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {/* น้องเป็ดแอบมองข้างหัวข้อ — ชี้ทั้งส่วนแล้วโผล่ขึ้นมาอีกนิด */}
          <img className="spot-peek" src="/landing/fab-duck-peek.webp" alt="" aria-hidden="true" />
          <img className="spot-heart" src="/landing/heart.webp" alt="" aria-hidden="true" />
        </div>

        <div
          className={`fresh-wrap spot-wrap${many ? "" : " spot-few"}`}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocusCapture={() => setHover(true)}
          onBlurCapture={() => setHover(false)}
        >
          {many && (
            <button type="button" className="fresh-nav prev" aria-label="เลื่อนดูสินค้าก่อนหน้า" onClick={() => slide(-1)}>
              ‹
            </button>
          )}
          <div className="fresh-rail spot-rail in" ref={railRef} onTouchStart={pause} onWheel={pause}>
            {products === null
              ? null
              : cards.map(({ st, p, image, alt, min }, i) => (
                  <Link className="card fresh-card spot-card" href={productPath(p)} key={st.productId}>
                    <div className="thumb">
                      {st.tag && (
                        <span className={`tag tag-${st.tagTone ?? "hot"}`}>
                          {st.tagTone === "new" ? <i className="sparkle">✨</i> : st.tagTone === "mint" ? <i>🌱</i> : <i className="flame">🔥</i>}
                          {st.tag}
                        </span>
                      )}
                      {image ? (
                        <img {...imgProps(image, "(max-width: 768px) 76vw, 260px")} alt={st.name ?? p.name} loading="lazy" decoding="async" onError={fallbackToOriginal(image)} />
                      ) : (
                        <span className={`grid h-full w-full place-items-center bg-gradient-to-br text-6xl ${p.gradient}`}>{p.emoji}</span>
                      )}
                      {alt && (
                        <img
                          className="alt-img spot-alt"
                          style={{ animationDelay: `${(i % 6) * 1.2}s` }}
                          {...imgProps(alt, "(max-width: 768px) 76vw, 260px")}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={fallbackToOriginal(alt)}
                        />
                      )}
                    </div>
                    <div className="card-body">
                      <span className="cat-l">{st.desc ?? catName(p.category)}</span>
                      <h3>{st.name ?? p.name}</h3>
                      <div className="meta">
                        <span className="price">เริ่ม {formatPrice(min)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
          </div>
          {many && (
            <button type="button" className="fresh-nav next" aria-label="เลื่อนดูสินค้าถัดไป" onClick={() => slide(1)}>
              ›
            </button>
          )}
        </div>

        <div className="rv-more">
          <Link className="rv-viewall" href={s.ctaHref}>
            {s.ctaLabel} <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatPrice, priceRange, productPath, type Product } from "@/lib/products";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { fetchSpotlight, splitAccent, type Spotlight as SpotlightData } from "@/lib/spotlight";

/**
 * 🎯 ส่วนเชียร์ขายบนหน้าแรก — คั่นระหว่างป้ายประชาสัมพันธ์กับ "สินค้ามาใหม่"
 * แอดมินตั้งที่ /admin/spotlight · ปิดสวิตช์ = ไม่วาดอะไรเลย (หน้าแรกเหมือนเดิมทุกอย่าง)
 *
 * ชั้น 1 ลุคบุ๊ค: รูปใหญ่ + ป้ายลอย 2 ใบ · ชั้น 2 คำเชียร์: หัวข้อ / "ทีมงานบอก:" / ✓ จุดเด่น / ปุ่ม + ราคาเริ่ม
 * ชั้น 3 การ์ดทรงสินค้า (ผูกสินค้าจริง: ราคาเริ่ม + ลิงก์ + รูปปก) · ชั้น 4 ชิปไอเดีย
 * ราคาที่โชว์ทั้งหมดมาจากสินค้าจริงที่หน้าแรกโหลดอยู่แล้ว ไม่พิมพ์เลขตายตัว · สไตล์ชุด .spot-* ท้าย landing.css
 */
export default function Spotlight({ products }: { products: Product[] | null }) {
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

  /** การ์ดทรง: จับคู่สินค้าจริง — สินค้าหาย/ถูกซ่อน = ข้ามใบนั้น (ไม่โชว์การ์ดที่กดแล้วไปหน้าไม่มีสินค้า) */
  const styles = useMemo(() => {
    if (!s) return [];
    return s.styles
      .map((st) => {
        const p = byId.get(st.productId);
        if (!p) return null;
        const image = st.image ?? p.imageSrc;
        return { st, p, image, min: priceRange(p).min };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [s, byId]);

  /** ราคาเริ่มต้นข้างปุ่ม = ต่ำสุดของการ์ดที่แสดงอยู่ */
  const fromPrice = styles.length ? Math.min(...styles.map((x) => x.min)) : null;

  if (!s || !s.on) return null;
  const [t2plain, t2accent] = splitAccent(s);

  return (
    <section id="spotlight" className="spot-band rv" aria-label="สินค้าที่ร้านอยากเชียร์">
      <img className="spot-cloud sc1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
      <img className="spot-cloud sc2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
      <div className="wrap">
        <div className="spot-look">
          {s.heroImage && (
            <Link className="spot-pic" href={s.ctaHref} aria-label={s.heroAlt || s.ctaLabel}>
              <img
                {...imgProps(s.heroImage, "(max-width: 768px) 100vw, 560px")}
                alt={s.heroAlt ?? ""}
                loading="lazy"
                decoding="async"
                onError={fallbackToOriginal(s.heroImage)}
              />
              {s.floats.map((f, i) => (
                <span key={i} className={`spot-float sf${i + 1}`}>
                  {f.image && <img src={f.image} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
                  {f.text}
                </span>
              ))}
            </Link>
          )}
          <div className="spot-txt">
            {s.kicker && <span className="spot-kicker">{s.kicker}</span>}
            <h2>
              {s.title1}
              {s.title1 && s.title2 && <br />}
              {t2plain}
              {t2accent && <em>{t2accent}</em>}
            </h2>
            {s.lead && <p className="spot-lead">{s.lead}</p>}
            {s.pitch && (
              <div className="spot-pitch">
                <b>ทีมงานบอก:</b> {s.pitch}
              </div>
            )}
            {s.points.length > 0 && (
              <ul className="spot-pts">
                {s.points.map((pt, i) => (
                  <li key={i}>
                    <i>✓</i>
                    {pt}
                  </li>
                ))}
              </ul>
            )}
            <div className="spot-cta">
              <Link className="btn btn-yolk spot-btn" href={s.ctaHref}>
                {s.ctaLabel} <span aria-hidden="true">→</span>
              </Link>
              {fromPrice !== null && (
                <span className="spot-from">
                  เริ่มต้น <b>{formatPrice(fromPrice)}</b> /ชิ้น
                </span>
              )}
            </div>
          </div>
        </div>

        {styles.length > 0 && (
          <div className="spot-styles" style={{ ["--spot-n" as string]: styles.length }}>
            {styles.map(({ st, p, image, min }) => (
              <Link className="spot-st" href={productPath(p)} key={st.productId}>
                {st.tag && <span className={`spot-tag spot-tag-${st.tagTone ?? "coral"}`}>{st.tag}</span>}
                <div className="spot-st-pic">
                  {image ? (
                    <img {...imgProps(image, "(max-width: 768px) 46vw, 270px")} alt={st.name ?? p.name} loading="lazy" decoding="async" onError={fallbackToOriginal(image)} />
                  ) : (
                    <span className={`grid h-full w-full place-items-center bg-gradient-to-br text-5xl ${p.gradient}`}>{p.emoji}</span>
                  )}
                </div>
                <div className="spot-st-body">
                  <h3>{st.name ?? p.name}</h3>
                  {st.desc && <p>{st.desc}</p>}
                  <div className="spot-st-pr">
                    <b>{formatPrice(min)}+</b>
                    <span>ดูทรงนี้</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {s.ideas.length > 0 && (
          <div className="spot-ideas">
            {s.ideasLabel && <b>{s.ideasLabel}</b>}
            {s.ideas.map((t, i) => (
              <Link key={i} href={s.ctaHref}>
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

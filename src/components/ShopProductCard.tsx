"use client";

/*
 * การ์ดสินค้าของหน้ารายการสินค้า (/products)
 * ใช้มาร์กอัป/คลาสชุดเดียวกับการ์ด "ขายดี" ของหน้าแรก (.card/.thumb/.tag/.card-body)
 * → ต้องอยู่ใต้ .dl เท่านั้น (สไตล์อยู่ใน landing.css)
 *
 * หมายเหตุ: ไม่ได้รวมกับ BestCard ของหน้าแรกเพราะป้ายมุมซ้ายคนละเกณฑ์กัน
 * (หน้าแรกใช้อันดับขายดี · หน้านี้ใช้ป้ายที่แอดมินตั้งไว้กับตัวสินค้า)
 */

import Link from "next/link";
import { useRef } from "react";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { formatPriceLabel, getCategory, productPath, type Product } from "@/lib/products";

export default function ShopProductCard({ product: p }: { product: Product }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const cat = getCategory(p.category);

  /** เอียงตามเมาส์เล็กน้อย — เหมือนการ์ดขายดีหน้าแรก (เมาส์จริงเท่านั้น) */
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
        {p.badge === "ขายดี" && (
          <span className="tag tag-hot">
            <i className="flame">🔥</i>ขายดี
          </span>
        )}
        {p.badge === "ใหม่" && (
          <span className="tag tag-new">
            <i className="sparkle">✨</i>NEW
          </span>
        )}
        {p.badge === "ลดราคา" && (
          <span className="tag tag-sale">
            <i>🏷️</i>ลดราคา
          </span>
        )}
        {p.imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...imgProps(p.imageSrc, "(max-width: 760px) 45vw, 280px")}
            alt={p.name}
            loading="lazy"
            decoding="async"
            onError={fallbackToOriginal(p.imageSrc)}
          />
        ) : (
          <span className={`grid h-full w-full place-items-center bg-gradient-to-br text-6xl ${p.gradient}`}>{p.emoji}</span>
        )}
      </div>
      <div className="card-body">
        <span className="cat-l">
          {cat.emoji} {cat.name}
        </span>
        <h3>{p.name}</h3>
        <div className="meta">
          <span className="price">{formatPriceLabel(p)}</span>
          <span className="stars">
            ⭐ {p.rating} · ขายแล้ว {p.sold.toLocaleString("th-TH")}
          </span>
        </div>
        <span className="add">เลือกลาย</span>
      </div>
    </Link>
  );
}

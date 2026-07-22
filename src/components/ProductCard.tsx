import Link from "next/link";
import {
  formatPrice,
  formatPriceRange,
  getCategory,
  priceRange,
  type Product,
} from "@/lib/products";
import ProductVisual from "./ProductVisual";

const BADGE_STYLES: Record<string, string> = {
  ขายดี: "bg-rose-500 text-white",
  ใหม่: "bg-sky-500 text-white",
  ลดราคา: "bg-amber-400 text-amber-950",
};

export default function ProductCard({ product }: { product: Product }) {
  const category = getCategory(product.category);
  const range = priceRange(product);
  const isRange = range.max > range.min;
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_4px_20px_rgba(245,180,0,0.10)] ring-1 ring-amber-100 transition hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(245,180,0,0.20)]"
    >
      <div className="relative">
        <ProductVisual
          emoji={product.emoji}
          gradient={product.gradient}
          src={product.imageSrc}
          alt={product.name}
          className="aspect-square w-full transition-transform duration-300 group-hover:scale-105"
        />
        {product.badge && (
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${BADGE_STYLES[product.badge]}`}
          >
            {product.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="text-[11px] font-semibold text-amber-500">
          {category.emoji} {category.name}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold text-stone-800">{product.name}</h3>
        <div className="mt-auto flex flex-col gap-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className={`font-extrabold text-amber-600 ${isRange ? "text-base" : "text-lg"}`}>
              {formatPriceRange(product)}
            </span>
            {product.oldPrice && !isRange && (
              <span className="ml-1.5 text-xs text-stone-400 line-through">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>
          <span className="text-[11px] text-stone-400">
            ⭐ {product.rating} · ขายแล้ว {product.sold.toLocaleString("th-TH")}
          </span>
        </div>
      </div>
    </Link>
  );
}

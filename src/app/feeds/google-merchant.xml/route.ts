import { NextResponse } from "next/server";
import { SHOP, SITE_URL } from "@/lib/shop-info";
import { priceRange, productPath, type Product } from "@/lib/products";
import { productAutoSeo } from "@/lib/auto-seo";
import { getCategoriesServer } from "@/lib/server/categories-server";
import { listPublicProductsServer } from "@/lib/server/public-products";
import { getSeoServer } from "@/lib/server/settings-server";

/**
 * 🛍️ ฟีดสินค้าสำหรับ Google Merchant Center (เปิดได้ที่ /feeds/google-merchant.xml)
 *
 * เอา URL นี้ไปใส่ใน Merchant Center → สินค้า → ฟีด → "ดึงตามกำหนดเวลา" ครั้งเดียว
 * สินค้าทุกตัวของร้านจะไปโผล่ในแท็บ "ช็อปปิ้ง" ของ Google ฟรี (free listings) +
 * ใช้ยิงโฆษณา Shopping ได้ทันทีถ้าต้องการ · เพิ่ม/ซ่อนสินค้าในหลังบ้าน = ฟีดอัปเดตเองใน 1 ชม.
 *
 * ทำไมไม่อยู่ใต้ /api: robots.txt ปิด /api ทั้งก้อน บอทของ Google ดึงฟีดไม่ได้
 *
 * ราคาที่ส่ง = ราคาเริ่มต้น (ขั้นถูกสุดในตารางราคาสาธารณะ) ตรงกับคำว่า "เริ่มต้น ฿xx" บนหน้าสินค้า
 * สินค้าสั่งทำไม่มีบาร์โค้ด/GTIN → identifier_exists = no (Google อนุญาตสำหรับสินค้าทำตามสั่ง)
 */
export const revalidate = 3600;

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);
/** รูปที่ Google ดึงได้ต้องเป็น URL จริง — ตัด data: URL / คลิปวิดีโอ / ค่าว่าง */
const isHttp = (u?: string) => !!u && /^https?:\/\//i.test(u);

function imagesOf(p: Product): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [p.imageSrc, ...(p.images ?? []).map((i) => i.src)]) {
    if (!isHttp(u) || seen.has(u!)) continue;
    seen.add(u!);
    out.push(u!);
    if (out.length >= 11) break; // image_link 1 + additional_image_link สูงสุด 10
  }
  return out;
}

function itemXml(p: Product, categoryName: string): string | null {
  const imgs = imagesOf(p);
  if (!imgs.length) return null; // Merchant Center ไม่รับรายการที่ไม่มีรูป
  const { min } = priceRange(p);
  if (!(min > 0)) return null;
  const auto = productAutoSeo(p);
  const title = clip(p.seo?.title || auto.title || p.name, 150);
  const description = clip(
    (p.seo?.description || p.description || auto.description || p.name).replace(/\s+/g, " ").trim(),
    5000,
  );
  const link = `${SITE_URL}${productPath(p)}`;
  const [first, ...rest] = imgs;
  return [
    "<item>",
    `<g:id>${esc(p.id)}</g:id>`,
    `<g:title>${esc(title)}</g:title>`,
    `<g:description>${esc(description)}</g:description>`,
    `<g:link>${esc(link)}</g:link>`,
    `<g:image_link>${esc(first)}</g:image_link>`,
    ...rest.map((u) => `<g:additional_image_link>${esc(u)}</g:additional_image_link>`),
    `<g:availability>in_stock</g:availability>`,
    `<g:price>${min.toFixed(2)} THB</g:price>`,
    `<g:brand>${esc(SHOP.name)}</g:brand>`,
    `<g:condition>new</g:condition>`,
    `<g:identifier_exists>no</g:identifier_exists>`,
    `<g:product_type>${esc(categoryName)}</g:product_type>`,
    // สินค้าทำตามสั่ง — ไม่ให้ Google ตีความว่าของพร้อมส่งทันที
    `<g:custom_label_0>made-to-order</g:custom_label_0>`,
    "</item>",
  ].join("");
}

export async function GET() {
  const seo = await getSeoServer();
  const [products, categories] = seo.noindex
    ? [[], []]
    : await Promise.all([listPublicProductsServer(), getCategoriesServer()]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const items = products.map((p) => itemXml(p, catName(p.category))).filter((x): x is string => !!x);
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>${esc(SHOP.name)}</title>` +
    `<link>${esc(SITE_URL)}</link>` +
    `<description>${esc("สินค้าพิมพ์ลายตามสั่งทุกรายการของร้าน")}</description>` +
    items.join("") +
    `</channel></rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Items": String(items.length),
    },
  });
}

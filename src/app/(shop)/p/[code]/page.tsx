import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { encodePriceLink, PRICE_LINK_PARAM } from "@/lib/price-link";
import { daysLeft, priceLinkStatus, thaiDay } from "@/lib/price-links";
import { getPriceLink, bumpPriceLinkOpened } from "@/lib/server/price-links-db";
import { LINE_URL } from "@/components/LineButton";

/**
 * 🧾 การ์ดราคาที่ร้านจัดให้ลูกค้า — /p/<code>
 *
 * ลิงก์สั้นพอวางในไลน์ · ราคาที่โชว์คือราคาวันที่เสนอ (แช่ไว้ในฐานข้อมูล ไม่คิดใหม่)
 * กด "สั่งตามสเปคนี้" แล้วเด้งไปหน้าสินค้าที่ติ๊กตัวเลือกไว้ให้ครบ (ลิงก์ยาว ?s=)
 */
export const dynamic = "force-dynamic"; // ต้องนับยอดเปิด + เช็ควันหมดอายุสด ๆ ทุกครั้ง

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const link = await getPriceLink(decodeURIComponent(code).toUpperCase());
  if (!link) return { title: "ไม่พบราคานี้", robots: { index: false, follow: false } };
  const title = `${link.productName} — ${link.askPrice ? "ราคาที่ร้านจัดให้" : formatPrice(link.total)}`;
  const description = link.askPrice
    ? `สเปคที่ทางร้านจัดไว้ให้ · ${link.qty} ${link.unit}`
    : `${link.qty} ${link.unit} · ${formatPrice(link.unitPrice)}/${link.unit} — รวม ${formatPrice(link.total)}`;
  return {
    title,
    description,
    // ราคาที่เสนอลูกค้ารายคน ห้ามให้ Google เก็บ
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
  };
}

/** ตัวไล่อ่านลิงก์เพื่อทำพรีวิว (ไม่ใช่คน) */
function isLinkPreviewBot(ua: string | null): boolean {
  if (!ua) return true; // ไม่บอกว่าเป็นใคร = ไม่ใช่เบราว์เซอร์คนทั่วไป ไม่ต้องนับ
  return /line-?(bot|poker|spider)|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|embedly|bot\b|crawler|spider|preview/i.test(ua);
}

export default async function PriceLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await getPriceLink(decodeURIComponent(code).toUpperCase());
  if (!link) notFound();

  // นับว่าลูกค้าเปิดแล้ว (แอดมินดูได้ที่ /admin/price-links ว่าควรตามต่อไหม)
  // ⚠️ ไม่นับตัวไล่อ่านลิงก์ของแอป — ไลน์/เฟซยิงเข้ามาอ่านการ์ดทันทีที่วางลิงก์ในแชท
  //    นับด้วยจะกลายเป็น "ลูกค้าเปิดแล้ว" ตั้งแต่ยังไม่มีใครแตะ = ป้ายเตือนที่หน้าแอดมินใช้ไม่ได้เลย
  if (!isLinkPreviewBot((await headers()).get("user-agent"))) await bumpPriceLinkOpened(link);

  const status = priceLinkStatus(link);
  const left = daysLeft(link);
  const orderHref = `${link.productPath}?${PRICE_LINK_PARAM}=${encodePriceLink(link.spec)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
        {/* หัวการ์ด */}
        <div className="flex items-start gap-3 bg-gradient-to-br from-amber-50 to-white p-5">
          {link.imageSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.imageSrc}
              alt={link.productName}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">ราคาที่ทางร้านจัดให้</p>
            <h1 className="mt-0.5 text-lg font-extrabold leading-snug text-stone-900">{link.productName}</h1>
            <p className="mt-1 text-[11px] text-stone-400">
              เลขที่ {link.code} · เสนอเมื่อ {thaiDay(link.createdAt)}
            </p>
          </div>
        </div>

        {/* สเปคที่ตกลงกันไว้ */}
        <div className="border-t border-stone-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">รายละเอียดที่จัดไว้</p>
          <dl className="mt-2 space-y-1">
            {link.lines.map(([k, v], i) => (
              <div key={i} className="flex flex-wrap gap-x-2 text-[13px] leading-relaxed">
                <dt className="font-bold text-stone-700">{k}:</dt>
                <dd className="min-w-0 flex-1 text-stone-600">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ราคา */}
        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4">
          {link.askPrice ? (
            <p className="text-sm font-bold text-stone-700">💬 งานนี้ทางร้านตีราคาให้อีกที — ทักไลน์ได้เลยครับ</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span>
                  {link.qty.toLocaleString("th-TH")} {link.unit} × {formatPrice(link.unitPrice)}
                </span>
              </div>
              <div className="mt-1 flex items-end justify-between">
                <span className="text-sm font-bold text-stone-700">ยอดรวม</span>
                <span className="text-3xl font-extrabold text-amber-600">{formatPrice(link.total)}</span>
              </div>
              <p className="mt-1 text-right text-[11px] text-stone-400">ยังไม่รวมค่าจัดส่ง</p>
            </>
          )}
        </div>

        {link.note && (
          <div className="border-t border-stone-100 px-5 py-4">
            <p className="whitespace-pre-line rounded-2xl bg-amber-50/60 p-3 text-xs leading-relaxed text-stone-700 ring-1 ring-amber-100">
              {link.note}
            </p>
          </div>
        )}

        {/* ปุ่มสั่ง / สถานะ */}
        <div className="border-t border-stone-100 px-5 py-5">
          {status === "ใช้ได้" ? (
            <>
              <a
                href={orderHref}
                className="block w-full rounded-full bg-amber-500 py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition hover:bg-amber-600"
              >
                🛒 สั่งตามสเปคนี้
              </a>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-stone-400">
                กดแล้วระบบจะเปิดหน้าสินค้าที่ติ๊กตัวเลือกไว้ให้ครบ · ทางร้านยืนราคาตามใบนี้ถึง{" "}
                <span className="font-bold text-stone-500">{thaiDay(link.expiresAt)}</span>
                {left >= 0 && ` (อีก ${left} วัน)`}
              </p>
            </>
          ) : (
            <div className="rounded-2xl bg-stone-100 p-4 text-center">
              <p className="text-sm font-bold text-stone-600">
                {status === "หมดอายุ" ? "⌛ ราคานี้หมดอายุแล้ว" : "ราคานี้ปิดไปแล้ว"}
              </p>
              <p className="mt-1 text-xs text-stone-500">รบกวนทักร้านเพื่อขอราคาใหม่นะครับ</p>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-full bg-[#06C755] px-6 py-2.5 text-xs font-bold text-white"
              >
                💬 ทักร้านทางไลน์
              </a>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-stone-400">
        มีข้อสงสัย?{" "}
        <a href={LINE_URL} target="_blank" rel="noreferrer" className="font-bold text-[#06C755]">
          ทักแชทร้าน
        </a>
      </p>
    </div>
  );
}

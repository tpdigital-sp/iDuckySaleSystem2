import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  daysLeft,
  priceLinkHasAsk,
  priceLinkIsBundle,
  priceLinkItems,
  priceLinkStatus,
  priceLinkTitle,
  priceLinkTotal,
  thaiDay,
} from "@/lib/price-links";
import { getPriceLink, bumpPriceLinkOpened, productArtworkRequired } from "@/lib/server/price-links-db";
import { LINE_URL } from "@/components/LineButton";
import PriceSheet from "./PriceSheet";

/**
 * 🧾 การ์ดราคาที่ร้านจัดให้ลูกค้า — /p/<code>
 *
 * ลิงก์สั้นพอวางในไลน์ · ราคาที่โชว์คือราคาวันที่เสนอ (แช่ไว้ในฐานข้อมูล ไม่คิดใหม่)
 * กด "สั่งตามสเปคนี้" แล้วระบบเปิดหน้าสินค้า ติ๊กตัวเลือกให้ครบ หย่อนลงตะกร้าให้เอง แล้วพาไปหน้าตะกร้า (ลิงก์ยาว ?s= + &add=1)
 *
 * หน้าตา: โครง .shopp + คอมโพเนนต์ .ord-* ชุดเดียวกับตะกร้า/ติดตามออเดอร์ (ดู landing.css)
 * หัวใบอยู่บนพื้นฟ้าจาง ไม่ใส่การ์ด · การ์ดลอยมีแค่รายการกับสรุปยอด (บทเรียน "ลายตา" — อย่าทำทุกกล่องเป็นกระจก)
 */
export const dynamic = "force-dynamic"; // ต้องนับยอดเปิด + เช็ควันหมดอายุสด ๆ ทุกครั้ง

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const link = await getPriceLink(decodeURIComponent(code).toUpperCase());
  if (!link) return { title: "ไม่พบราคานี้", robots: { index: false, follow: false } };
  const items = priceLinkItems(link);
  const ask = priceLinkHasAsk(link);
  const title = `${priceLinkTitle(link)} — ${ask && items.length === 1 ? "ราคาที่ร้านจัดให้" : formatPrice(priceLinkTotal(link))}`;
  const description =
    items.length > 1
      ? `${items.length} รายการที่ทางร้านจัดไว้ให้ — รวม ${formatPrice(priceLinkTotal(link))}${ask ? " (ยังไม่รวมรายการที่รอตีราคา)" : ""}`
      : link.askPrice
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
  const items = priceLinkItems(link);
  const bundle = priceLinkIsBundle(link);
  const [artFlags] = await Promise.all([
    Promise.all(items.map((i) => productArtworkRequired(i.productId))),
    isLinkPreviewBot((await headers()).get("user-agent")) ? Promise.resolve() : bumpPriceLinkOpened(link),
  ]);

  const status = priceLinkStatus(link);
  const open = status === "ใช้ได้";
  const left = daysLeft(link);
  const askAll = items.every((i) => i.askPrice);

  /** ยืนราคาถึงเมื่อไร — ใต้ปุ่มสั่ง */
  const holdNote = (
    <p className="mt-2.5 text-center text-[11px] leading-relaxed t-soft">
      กดแล้วระบบใส่ตะกร้าให้ทันทีแล้วพาไปหน้าตะกร้า · ยืนราคาตามใบนี้ถึง{" "}
      <b className="t-ink">{thaiDay(link.expiresAt)}</b>
      {left >= 0 && ` (อีก ${left} วัน)`}
    </p>
  );
  /** ใบที่ปิด/หมดอายุ — ขึ้นแทนปุ่มสั่ง */
  const closedNote = (
    <div className="ord-note plain p-4 text-center">
      <p className="ord-title text-[15px]">{status === "หมดอายุ" ? "⌛ ราคานี้หมดอายุแล้ว" : "ราคานี้ปิดไปแล้ว"}</p>
      <p className="mt-1 text-xs t-soft">รบกวนทักร้านเพื่อขอราคาใหม่นะครับ</p>
      <a href={LINE_URL} target="_blank" rel="noreferrer" className="ord-btn line sm mt-3">
        💬 ทักร้านทางไลน์
      </a>
    </div>
  );

  return (
    <div className="shopp">
      {/* เมฆพื้นหลัง — ชุดเดียวกับหน้าแรก/ตะกร้า */}
      <div className="shopp-sky" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc1" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc2" src="/landing/cloud.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="oc4" src="/landing/cloud.webp" alt="" />
      </div>

      <div className="shopp-in" style={{ maxWidth: 1040 }}>
        {/* ── หัวใบ: ชื่อ + เลขที่ + วันยืนราคา (ไม่ใส่การ์ด) ── */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <span className="ord-eyebrow block">🧾 ใบราคาที่ทางร้านจัดให้</span>
            <h1 className="ord-title mt-1" style={{ fontSize: "clamp(1.35rem, 3.6vw, 1.85rem)", fontWeight: 600 }}>
              {priceLinkTitle(link)}
            </h1>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <span className="ord-chip ghost">เลขที่ {link.code}</span>
              <span className="ord-chip ghost">เสนอเมื่อ {thaiDay(link.createdAt)}</span>
              {bundle && <span className="ord-chip">📦 {items.length} รายการ</span>}
              {open ? (
                <span className="ord-chip ok">
                  ✓ ยืนราคาถึง {thaiDay(link.expiresAt)}
                  {left >= 0 && ` · อีก ${left} วัน`}
                </span>
              ) : (
                <span className="ord-chip danger">{status === "หมดอายุ" ? "⌛ หมดอายุแล้ว" : "ปิดแล้ว"}</span>
              )}
            </div>
          </div>

          {/* ยอดรวมโผล่ตั้งแต่บนหัวเฉพาะจอเล็ก — จอกว้างมีการ์ดสรุปอยู่ข้าง ๆ แล้ว */}
          {!askAll && (
            <div className="text-right lg:hidden">
              <span className="ord-eyebrow block">ยอดรวม</span>
              <p className="ord-title text-[1.7rem] leading-none t-blue">{formatPrice(priceLinkTotal(link))}</p>
              <p className="mt-1 text-[10.5px] t-faint">ยังไม่รวมค่าจัดส่ง</p>
            </div>
          )}
        </header>

        <PriceSheet
          code={link.code}
          items={items.map((it, i) => ({ ...it, artRequired: artFlags[i] }))}
          open={open}
          note={link.note}
          closedNote={closedNote}
          holdNote={holdNote}
        />
      </div>
    </div>
  );
}

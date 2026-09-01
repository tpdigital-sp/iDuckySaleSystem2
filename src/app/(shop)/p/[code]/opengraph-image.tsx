import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { formatPrice } from "@/lib/products";
import { thaiDay } from "@/lib/price-links";
import { getPriceLink } from "@/lib/server/price-links-db";
import { SITE_URL } from "@/lib/shop-info";

/**
 * 🖼 การ์ดราคาเป็นรูป — รูปนี้คือสิ่งที่ไลน์/เฟซเอาไปโชว์เป็นพรีวิวเวลาวางลิงก์ /p/<code>
 * ลูกค้าจึง "เห็นราคาทันทีในแชท" เหมือน screenshot แต่กดเข้าไปสั่งต่อได้
 *
 * ⚠️ ฟอนต์ต้องแนบไปเอง — ตัวเรนเดอร์ของ Next มีแต่ฟอนต์ละติน ภาษาไทยจะกลายเป็นช่องว่าง
 */
export const runtime = "nodejs";
export const alt = "ราคาที่ทางร้านจัดให้";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREAM = "#FFFBF2";
const INK = "#1C1917";
const MUTED = "#78716C";
const BRAND = "#D97706";

/**
 * ที่อยู่เว็บของตัวเอง — ฟอนต์อยู่ใน public/ ต้องดึงผ่าน http
 * (อ่านไฟล์จากดิสก์ตรง ๆ ไม่ได้ ตัวรันบน Netlify ไม่ได้เอาไฟล์ต้นทางไปด้วย
 *  และ fetch("file://…") ก็ใช้ไม่ได้ — เคยลองแล้ว TypeError: fetch failed)
 */
async function selfOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : SITE_URL;
}

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`โหลดฟอนต์ไม่ได้: ${url} (${res.status})`);
  return res.arrayBuffer();
}

/** โหลดรูปสินค้ามาฝังเป็น data URI เอง — ปล่อยให้ตัวเรนเดอร์ไปดึงเองแล้วพลาด = ทั้งรูปพัง */
async function photoData(src?: string): Promise<string | null> {
  if (!src || !/^https?:\/\//i.test(src)) return null;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png|webp)/i.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_500_000) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await getPriceLink(decodeURIComponent(code).toUpperCase());

  const origin = await selfOrigin();
  const [medium, semibold] = await Promise.all([
    loadFont(`${origin}/fonts/Mitr-Medium.ttf`),
    loadFont(`${origin}/fonts/Mitr-SemiBold.ttf`),
  ]);
  const fonts = [
    { name: "Mitr", data: medium, weight: 400 as const, style: "normal" as const },
    { name: "Mitr", data: semibold, weight: 600 as const, style: "normal" as const },
  ];

  if (!link) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: CREAM,
            color: MUTED,
            fontFamily: "Mitr",
            fontSize: 42,
          }}
        >
          ไม่พบราคานี้
        </div>
      ),
      { ...size, fonts }
    );
  }

  const photo = await photoData(link.imageSrc);
  // 4 บรรทัดพอ — ยาวกว่านั้นการ์ดแน่นจนอ่านไม่ออกในแชท (รายละเอียดครบอยู่ในหน้าที่กดเข้าไป)
  const lines = link.lines.slice(0, 4);
  /**
   * ชื่อสินค้ายาวไม่เท่ากัน และตัวเรนเดอร์ไม่ตัดบรรทัดให้ — ต้องย่อขนาด/ตัดท้ายเอง
   * ไม่งั้นชื่อยาวโดนตัดกลางคำ ("สแตนดี้อะคริลิค (Acrylic")
   */
  const name = link.productName.length > 46 ? `${link.productName.slice(0, 45)}…` : link.productName;
  const nameSize = name.length > 38 ? 34 : name.length > 30 ? 40 : name.length > 22 ? 46 : 52;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CREAM,
          fontFamily: "Mitr",
          color: INK,
        }}
      >
        {/* ซ้าย: ข้อความ */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 48px" }}>
          <div style={{ display: "flex", fontSize: 22, color: BRAND, fontWeight: 600, letterSpacing: 2 }}>
            iDUCKY PRINTS STUDIO
          </div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 14 }}>ราคาที่ทางร้านจัดให้</div>
          <div style={{ display: "flex", fontSize: nameSize, fontWeight: 600, lineHeight: 1.25, marginTop: 6 }}>
            {name}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 8 }}>
            {lines.map(([k, v], i) => (
              <div key={i} style={{ display: "flex", fontSize: 24, color: MUTED }}>
                <span style={{ fontWeight: 600, color: "#57534E" }}>{k}:&nbsp;</span>
                <span>{v.length > 42 ? `${v.slice(0, 42)}…` : v}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flex: 1, minHeight: 24 }} />

          {link.askPrice ? (
            <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: BRAND }}>
              ราคา: ทางร้านตีราคาให้อีกที
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
                {link.qty.toLocaleString("th-TH")} {link.unit} × {formatPrice(link.unitPrice)}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 2 }}>
                <span style={{ fontSize: 30, color: MUTED, paddingBottom: 14 }}>รวม</span>
                <span style={{ fontSize: 84, fontWeight: 600, color: BRAND, lineHeight: 1 }}>
                  {formatPrice(link.total)}
                </span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", fontSize: 20, color: MUTED, marginTop: 16 }}>
            ยืนราคาถึง {thaiDay(link.expiresAt)} · กดลิงก์เพื่อสั่งตามสเปคนี้ได้เลย
          </div>
        </div>

        {/* ขวา: รูปสินค้า (ไม่มีรูปก็เป็นแถบสีแทน การ์ดจะได้ไม่โหว่) */}
        <div style={{ display: "flex", width: 430, background: "#FDE9C8" }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={430} height={630} style={{ objectFit: "cover" }} />
          ) : (
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 120,
              }}
            >
              🦆
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}

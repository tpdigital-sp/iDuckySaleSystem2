import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE_URL } from "@/lib/shop-info";
import { getSeoServer } from "@/lib/server/settings-server";
import { IBM_Plex_Sans_Thai_Looped, Mitr, Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-prompt",
  display: "swap",
});

// ฟอนต์ดีไซน์หน้าแรก/หัว-ท้ายเว็บ (ตามไฟล์ต้นแบบ): Mitr = หัวเรื่อง/ปุ่ม · Plex Looped = เนื้อความ
const mitr = Mitr({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-mitr",
  display: "swap",
});
const looped = IBM_Plex_Sans_Thai_Looped({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-looped",
  display: "swap",
});

/**
 * เมตาแท็กของทั้งเว็บ — อ่านค่ายืนยันสิทธิ์ Google/Bing จากตั้งค่าร้าน (/admin/settings?tab=google)
 * ไม่ได้ตั้ง = ไม่ใส่แท็กนั้นเลย
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoServer();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: "iDucky Prints Studio — พิมพ์สินค้าตามสั่ง ลายของคุณเอง",
      template: "%s | iDucky Prints Studio",
    },
    description:
      "ร้านพิมพ์สินค้าตามสั่ง (Print on Demand) แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ กระเป๋าผ้า พิมพ์ลายของคุณเองได้ทุกชิ้น ส่งไวทั่วไทย",
    manifest: "/manifest.json",
    icons: { icon: "/icon.png", apple: "/icon.png" },
    ...(seo.noindex ? { robots: { index: false, follow: false } } : {}),
    verification: {
      ...(seo.googleVerification ? { google: seo.googleVerification } : {}),
      ...(seo.bingVerification ? { other: { "msvalidate.01": seo.bingVerification } } : {}),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#3fa1b6",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const seo = await getSeoServer();
  return (
    <html lang="th" className={`${prompt.variable} ${mitr.variable} ${looped.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        {/* Google Analytics 4 — โหลดเฉพาะเมื่อแอดมินใส่รหัสไว้ (ไม่ใส่ = เว็บไม่โหลดสคริปต์นี้เลย) */}
        {seo.ga4Id && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${seo.ga4Id}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${seo.ga4Id}');`}
            </Script>
          </>
        )}
        {/* Google Tag Manager */}
        {seo.gtmId && (
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${seo.gtmId}');`}
          </Script>
        )}
      </body>
    </html>
  );
}

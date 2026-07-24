import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-prompt",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "iDucky Prints Studio — พิมพ์สินค้าตามสั่ง ลายของคุณเอง",
    template: "%s | iDucky Prints Studio",
  },
  description:
    "ร้านพิมพ์สินค้าตามสั่ง (Print on Demand) แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ กระเป๋าผ้า พิมพ์ลายของคุณเองได้ทุกชิ้น ส่งไวทั่วไทย",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#3fa1b6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={prompt.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

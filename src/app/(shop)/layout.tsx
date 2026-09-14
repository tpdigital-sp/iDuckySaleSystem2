import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LineFloat } from "@/components/LineButton";
import ChatWidget from "@/components/ChatWidget";
import AdminEditFabAuto from "@/components/AdminEditFabAuto";
import NavProgress from "@/components/NavProgress";
import { CartProvider } from "@/lib/cart-context";
import { CustomerProvider } from "@/lib/customer-context";
// ดีไซน์ใหม่ (หัวเว็บ/ท้ายเว็บ/หน้าแรก) — ครอบด้วยคลาส .dl เท่านั้น หน้าอื่นไม่ได้รับผล
import "./landing.css";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerProvider>
      <CartProvider>
        <NavProgress />
        <div className="dl dl-contents no-print">
          <Navbar />
        </div>
        <main>{children}</main>
        <div className="dl dl-contents no-print">
          <Footer />
        </div>
        {/* ปุ่มลอยมุมขวาล่าง: LINE = แอดมินตัวจริง · ChatWidget = ผู้ช่วย AI ตอบทันที */}
        <div className="dl dl-contents no-print">
          <LineFloat />
        </div>
        <div className="no-print">
          <ChatWidget />
        </div>
        {/* ปุ่มลัดเข้าหลังบ้าน — เห็นเฉพาะทีมงาน · เสียบที่ layout ให้ขึ้นครบทุกหน้าร้าน */}
        <div className="no-print">
          <AdminEditFabAuto />
        </div>
      </CartProvider>
    </CustomerProvider>
  );
}

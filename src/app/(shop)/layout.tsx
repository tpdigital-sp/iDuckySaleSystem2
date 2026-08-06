import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LineFloat } from "@/components/LineButton";
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
        <div className="dl dl-contents">
          <Navbar />
        </div>
        <main>{children}</main>
        <div className="dl dl-contents">
          <Footer />
        </div>
        <LineFloat />
      </CartProvider>
    </CustomerProvider>
  );
}

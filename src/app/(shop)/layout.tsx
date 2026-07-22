import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LineFloat } from "@/components/LineButton";
import { CartProvider } from "@/lib/cart-context";
import { CustomerProvider } from "@/lib/customer-context";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerProvider>
      <CartProvider>
        <Navbar />
        <main>{children}</main>
        <Footer />
        <LineFloat />
      </CartProvider>
    </CustomerProvider>
  );
}

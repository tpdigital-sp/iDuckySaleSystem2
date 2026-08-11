import Link from "next/link";
import FooterFreeShip from "./FooterFreeShip";
/* eslint-disable @next/next/no-img-element */

const SOCIALS = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/iduckyshop",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/iduckyshop1",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5.4" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@iduckyofficial",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.5 2h-2.9v13.2a2.5 2.5 0 11-2.1-2.5v-3a5.5 5.5 0 105.1 5.5V9.1a6.6 6.6 0 003.9 1.3V7.5a3.8 3.8 0 01-3.9-3.8V2z" />
      </svg>
    ),
  },
  {
    name: "X",
    href: "https://x.com/iduckyshop",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.4-5.7L6 21H2.9l7.3-8.3L2.5 3h6.4l4 5.3L17.5 3zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3z" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer id="contact">
      <div className="wrap">
        <div className="f-grid">
          <div>
            <Link href="/" className="logo" style={{ marginBottom: 12 }}>
              <img className="logo-img" src="/landing/logo-word.webp" alt="iDucky Prints Studio" width={722} height={243} />
            </Link>
            <p>ทำด้วยใจ พิมพ์ด้วยรัก — รับผลิตสินค้าตามสั่งครบวงจร เริ่มต้นที่ 1 ชิ้น</p>
            <div className="socials">
              {SOCIALS.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4>สินค้า</h4>
            <Link href="/products">สินค้าทั้งหมด</Link>
            <Link href="/products?category=acrylic">พวงกุญแจ / อะคริลิค</Link>
            <Link href="/products?category=standee">สแตนดี้</Link>
            <Link href="/products?category=sticker-paper">สติกเกอร์ / งานกระดาษ</Link>
          </div>

          <div>
            <h4>ช่วยเหลือ</h4>
            <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
            <Link href="/how-to-order">การเตรียมไฟล์</Link>
            <Link href="/how-to-order">การจัดส่งสินค้า</Link>
            <Link href="/how-to-order">เงื่อนไขการเคลมสินค้า</Link>
            <Link href="/account/orders">ติดตามคำสั่งซื้อ</Link>
          </div>

          <div>
            <h4>ติดต่อเรา</h4>
            <p>บริษัท ทีพีดิจิตอล</p>
            <p>663/8 ซอยฉลองกรุง 1 แขวง/เขตลาดกระบัง กทม. 10520</p>
            <p>โทร. 096-569-9414</p>
            <p>จันทร์–ศุกร์ 09.00–18.00 น.</p>
            <a href="https://page.line.me/iduckyofficial?openQrModal=true" target="_blank" rel="noopener noreferrer">
              แอด LINE ร้าน (สแกน QR)
            </a>
          </div>
        </div>

        <div className="f-bottom">
          <span>© 2026 iDucky Prints Studio — ทำด้วยใจ พิมพ์ด้วยรัก 🦆💛</span>
          <span>
            <FooterFreeShip />
            <Link href="/admin" className="underline-offset-2 hover:underline">
              หลังบ้าน
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

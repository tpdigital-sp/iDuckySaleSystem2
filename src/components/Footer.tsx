import Link from "next/link";
/* eslint-disable @next/next/no-img-element */

const SOCIALS = [
  { name: "Facebook", label: "f", href: "https://www.facebook.com/iduckyshop" },
  { name: "Instagram", label: "📷", href: "https://www.instagram.com/iduckyshop1" },
  { name: "TikTok", label: "♪", href: "https://www.tiktok.com/@iduckyofficial" },
  { name: "X", label: "𝕏", href: "https://x.com/iduckyshop" },
];

export default function Footer() {
  return (
    <footer id="contact">
      <div className="wrap">
        <div className="f-grid">
          <div>
            <Link href="/" className="logo" style={{ marginBottom: 12 }}>
              <img className="duck-mini" src="/landing/logo-duck.webp" alt="" aria-hidden="true" />
              <span>
                i<b>DUCKY</b> Prints
              </span>
            </Link>
            <p>ทำด้วยใจ พิมพ์ด้วยรัก — รับผลิตสินค้าตามสั่งครบวงจร เริ่มต้นที่ 1 ชิ้น</p>
            <div className="socials">
              {SOCIALS.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  {s.label}
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
            ส่งฟรีเมื่อครบ ฿999 ทั่วไทย ·{" "}
            <Link href="/admin" className="underline-offset-2 hover:underline">
              หลังบ้าน
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

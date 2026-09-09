import Link from "next/link";
import FooterFreeShip from "./FooterFreeShip";
import { SOCIAL_LINKS } from "./SocialLinks";
/* eslint-disable @next/next/no-img-element */

export default function Footer() {
  return (
    <footer id="contact">
      <div className="wrap">
        <div className="f-grid">
          <div>
            <Link href="/" className="logo" style={{ marginBottom: 12 }}>
              <img className="logo-img" src="/landing/logo-ducky.png" alt="iDucky Prints Studio" width={722} height={243} />
            </Link>
            <p>ทำด้วยใจ พิมพ์ด้วยรัก — รับผลิตสินค้าตามสั่งครบวงจร เริ่มต้นที่ 1 ชิ้น</p>
            <div className="socials">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4>สินค้า</h4>
            <Link href="/products">สินค้าทั้งหมด</Link>
            <Link href="/products?sort=popular">สินค้าขายดี</Link>
            <Link href="/products?category=acrylic">พวงกุญแจ / อะคริลิค</Link>
            <Link href="/products?category=sticker-paper">สติกเกอร์</Link>
          </div>

          <div>
            <h4>ช่วยเหลือ</h4>
            <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
            <Link href="/how-to-order">การเตรียมไฟล์</Link>
            <Link href="/how-to-order">การจัดส่งสินค้า</Link>
            <Link href="/how-to-order">เงื่อนไขการเคลมสินค้า</Link>
            <Link href="/account/orders">ติดตามคำสั่งซื้อ</Link>
            <Link href="/dealer">สมัครตัวแทนจำหน่าย</Link>
            <Link href="/terms">เงื่อนไขการใช้บริการ</Link>
            <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
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

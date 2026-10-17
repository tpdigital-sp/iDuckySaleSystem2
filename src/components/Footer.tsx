import Link from "next/link";
import FooterFreeShip from "./FooterFreeShip";
import { SOCIAL_LINKS, LINE_SOCIAL } from "./SocialLinks";
import { LINE_URL } from "./LineButton";
import { SHOP } from "@/lib/shop-info";
/* eslint-disable @next/next/no-img-element */

export default function Footer() {
  return (
    <footer id="contact">
      <div className="wrap">
        <div className="f-grid">
          <div>
            <Link href="/" className="logo" style={{ marginBottom: 12 }}>
              <img className="logo-img" src="/landing/logo-ducky.png" alt="iDuckyOfficial" width={722} height={243} />
            </Link>
            <p>ทำด้วยใจ พิมพ์ด้วยรัก — รับผลิตสินค้าตามสั่งครบวงจร เริ่มต้นที่ 1 ชิ้น</p>
            {/* 📱 มือถือเท่านั้น: ปุ่มติดต่อใหญ่ 2 ใบใต้แท็กไลน์ — สิ่งที่คนเลื่อนมาถึงท้ายเว็บมองหาบ่อยสุด (จอคอมซ่อน · กล่องติดต่อเราด้านล่างยังอยู่) */}
            <div className="f-quick">
              <a href={`tel:${SHOP.phone.replace(/[^0-9+]/g, "")}`} className="fq-call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                <span><b>โทรหาเรา</b><small>{SHOP.phone}</small></span>
              </a>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="fq-line">
                {LINE_SOCIAL.icon}
                <span><b>แอด LINE</b><small>@iduckyofficial</small></span>
              </a>
            </div>
            <div className="socials">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="f-col">
            <h4>สินค้า</h4>
            <Link href="/products">สินค้าทั้งหมด</Link>
            <Link href="/products?sort=popular">สินค้าขายดี</Link>
            <Link href="/products?category=acrylic">พวงกุญแจ / อะคริลิค</Link>
            <Link href="/products?category=sticker-paper">สติกเกอร์</Link>
          </div>

          <div className="f-col">
            <h4>ช่วยเหลือ</h4>
            <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
            <Link href="/how-to-order">การเตรียมไฟล์</Link>
            <Link href="/how-to-order">การจัดส่งสินค้า</Link>
            <Link href="/how-to-order">เงื่อนไขการเคลมสินค้า</Link>
            <Link href="/order/find">ติดตามคำสั่งซื้อ</Link>
            <Link href="/dealer">สมัครตัวแทนจำหน่าย</Link>
            {/* มือถือ: 2 ลิงก์นี้ย้ายไปแถบท้ายสุด (.f-legal) เป็นตัวเล็ก ไม่กินที่ในตารางลิงก์ */}
            <Link href="/terms" className="f-legal-dup">เงื่อนไขการใช้บริการ</Link>
            <Link href="/privacy" className="f-legal-dup">นโยบายความเป็นส่วนตัว</Link>
          </div>

          <div className="f-contact">
            <h4>ติดต่อเรา</h4>
            <p className="fc-co">บริษัท ทีพีดิจิตอล</p>
            <p className="fc-addr">663/8 ซอยฉลองกรุง 1 แขวง/เขตลาดกระบัง กทม. 10520</p>
            {/* ลิงก์โทรออก — มือถือแตะแล้วโทรได้เลย (เดิมเป็นตัวหนังสือเฉย ๆ ต้องจำเบอร์ไปกดเอง) */}
            <a href={`tel:${SHOP.phone.replace(/[^0-9+]/g, "")}`} className="fc-tel">โทร. {SHOP.phone}</a>
            <p className="fc-hours">จันทร์–ศุกร์ 09.00–18.00 น.</p>
            {/* /line เลือกปลายทางตามอุปกรณ์: มือถือ = เข้าห้องแชทร้านตรง ๆ · คอม = โปรไฟล์ + QR
                (เดิม "สแกน QR" — บนมือถือสแกนจอตัวเองไม่ได้) */}
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="fc-line">
              แอด LINE ร้าน @iduckyofficial
            </a>
          </div>
        </div>

        <div className="f-bottom">
          <span>© 2026 iDuckyOfficial — ทำด้วยใจ พิมพ์ด้วยรัก 🦆💛</span>
          {/* ลิงก์ "หลังบ้าน" เอาออกแล้ว (17 ต.ค. 69) — ลูกค้าเห็นแล้วงง · ทีมงานใช้ปุ่มลัดหลังบ้าน (AdminEditFabAuto) หรือพิมพ์ /admin */}
          <span>
            <FooterFreeShip />
          </span>
          <span className="f-legal">
            <Link href="/terms">เงื่อนไขการใช้บริการ</Link>
            <i aria-hidden="true">·</i>
            <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

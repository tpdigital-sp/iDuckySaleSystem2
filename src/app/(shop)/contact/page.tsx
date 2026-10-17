/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { SHOP, SHOP_EMAIL, SHOP_MAPS_URL, shopAddressOneLine } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import { SOCIAL_LINKS } from "@/components/SocialLinks";
import CopyChip from "./CopyChip";
import "./contact.css";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description: `ติดต่อ ${SHOP.name} — LINE @iduckyofficial · โทร ${SHOP.phone} · อีเมล ${SHOP_EMAIL} · ${shopAddressOneLine}`,
  alternates: { canonical: "/contact" },
};

const LINE_ID = "@iduckyofficial";
const TEL_HREF = `tel:+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`;

/** แผนที่ฝังในหน้า (ไม่ต้องใช้ API key) — ค้นจากที่อยู่ชุดเดียวกับปุ่ม Google Maps */
const MAP_EMBED = `https://maps.google.com/maps?q=${encodeURIComponent(shopAddressOneLine)}&z=16&output=embed`;

/** ลิงก์ช่วยเหลือ — ไอคอน 3D ชุดเดียวกับหน้าวิธีสั่งซื้อ (/how-to) */
const HELP = [
  { href: "/order/find", ico: "ship", title: "ติดตามคำสั่งซื้อ", desc: "เช็คสถานะงานและเลขพัสดุ ด้วยเลขออเดอร์หรือเบอร์โทร" },
  { href: "/how-to-order", ico: "art", title: "วิธีสั่งซื้อ & เตรียมไฟล์", desc: "ขั้นตอนสั่ง ส่งไฟล์งาน และการจัดส่งสินค้า" },
  { href: "/how-to-order#faq", ico: "guide", title: "คำถามที่พบบ่อย", desc: "ระยะเวลาผลิต การเคลม การชำระเงิน" },
  { href: "/member", ico: "pick", title: "สิทธิ์สมาชิก", desc: "สะสมยอด รับส่วนลดตามระดับสมาชิก" },
];

/**
 * 📇 หน้าติดต่อเรา (/contact) — เดิมเมนู "ติดต่อเรา" เลื่อนลงท้ายเว็บ (/#contact)
 * เจ้าของร้านขอเป็นหน้าแยก 17 ต.ค. 69 · ข้อมูลร้านดึงจาก shop-info ที่เดียว
 *
 * 🎨 ดีไซน์: ภาษาเดียวกับหน้าแรก (เจ้าของร้านสั่ง "ให้สอดคล้องกับหน้า landing page")
 * ครอบ `.dl dl-page ctc-page` แล้วใช้ token/คอมโพเนนต์ของ landing.css (.btn/.kicker/.head/.chat-cta/.t-*)
 * ⚠️ ห้ามใช้คลาส Tailwind ในหน้านี้ — `.dl *{margin:0;padding:0}` ล้างทิ้งหมด
 * สไตล์เฉพาะหน้าอยู่ที่ ./contact.css prefix .ctc- (แยกไฟล์ ไม่ปน landing.css)
 *
 * มือถือ: QR LINE ซ่อน (สแกนจอตัวเองไม่ได้) · ปุ่มโทร/คัดลอกชิดซ้าย (ปุ่มลอยมุมขวาบัง)
 */
export default function ContactPage() {
  return (
    <div className="dl dl-page ctc-page">
      {/* ── แถบฟ้าหัวหน้า: ฮีโร่ + การ์ดช่องทางติดต่อ 4 ใบ ── */}
      <div className="top-stack ctc-stack">
        <img className="bg-cloud ctc-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud ctc-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud ctc-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <section className="ctc-top">
          <div className="ctc-hero">
            <div className="ctc-hero-txt">
              <span className="kicker kicker-yolk">
                <i className="folder">📇</i>ติดต่อเรา
              </span>
              <h1>
                มีอะไรให้ช่วย
                <br />
                <span className="yolk-underline">ทักน้องเป็ด</span>ได้เลย
              </h1>
              <p className="ctc-lead">
                สอบถามสินค้า ส่งไฟล์งาน เช็คคิวผลิต — <b>แอดมินตัวจริงตอบไวที่สุดทาง LINE</b>
              </p>
              <div className="ctc-facts">
                <span className="ctc-fact">{SHOP.hours}</span>
                <span className="ctc-fact mint">มีเลขออเดอร์ แจ้ง OD-… ในแชทได้เลย</span>
              </div>
              <div className="ctc-hero-btns">
                <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                  แชท LINE กับแอดมิน <span className="dot">💬</span>
                </a>
                <a className="btn btn-ghost" href={TEL_HREF}>
                  โทร {SHOP.phone} <span className="dot">📞</span>
                </a>
              </div>
            </div>

            <div className="ctc-hero-art">
              <div className="ctc-scene">
                <img src="/contact/contact-hero.webp" alt="น้องเป็ด iDucky ใส่หูฟังนั่งโต๊ะรับเรื่อง ข้างมือถือที่มีข้อความแชท โทรศัพท์ จดหมาย และหมุดแผนที่" />
              </div>
            </div>
          </div>

          {/* ช่องทางติดต่อ 4 ใบ — มือถือเรียงแถวเดียว ไอคอนซ้าย */}
          <div className="ctc-cards">
            <div className="ctc-card">
              <i className="ctc-ico line">LINE</i>
              <div className="ctc-card-body">
                <span className="ctc-label">LINE · สอบถาม / ขอใบเสนอราคา</span>
                <b className="ctc-value">{LINE_ID}</b>
                <div className="ctc-acts">
                  <a className="ctc-act line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                    💬 เปิดแชท
                  </a>
                  <CopyChip text={LINE_ID} />
                </div>
              </div>
            </div>

            <div className="ctc-card">
              <i className="ctc-ico t-yolk">📞</i>
              <div className="ctc-card-body">
                <span className="ctc-label">โทรสอบถาม / สั่งงาน</span>
                <a className="ctc-value" href={TEL_HREF}>
                  {SHOP.phone}
                </a>
                <div className="ctc-acts">
                  <a className="ctc-act yolk" href={TEL_HREF}>
                    📞 โทรเลย
                  </a>
                  <CopyChip text={SHOP.phone.replace(/\D/g, "")} />
                </div>
              </div>
            </div>

            <div className="ctc-card">
              <i className="ctc-ico t-sky">✉️</i>
              <div className="ctc-card-body">
                <span className="ctc-label">อีเมล · สำหรับส่งไฟล์งานเท่านั้น</span>
                <a className="ctc-value email" href={`mailto:${SHOP_EMAIL}`}>
                  {SHOP_EMAIL}
                </a>
                <span className="ctc-addr">ขอใบเสนอราคา / สอบถาม กรุณาทักทาง LINE</span>
                <div className="ctc-acts">
                  <a className="ctc-act blue" href={`mailto:${SHOP_EMAIL}`}>
                    ✉️ ส่งไฟล์งาน
                  </a>
                  <CopyChip text={SHOP_EMAIL} />
                </div>
              </div>
            </div>

            <div className="ctc-card">
              <i className="ctc-ico t-lilac">📍</i>
              <div className="ctc-card-body">
                <span className="ctc-label">ที่อยู่ร้าน</span>
                <b className="ctc-value sm">{SHOP.legalName}</b>
                <span className="ctc-addr">{SHOP.addressLines.join(" ")}</span>
                <div className="ctc-acts">
                  <a className="ctc-act navy" href={SHOP_MAPS_URL} target="_blank" rel="noopener noreferrer">
                    🧭 นำทาง
                  </a>
                  <CopyChip text={shopAddressOneLine} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── แวะมาที่ร้าน: แผนที่ + เวลาทำการ + QR (จอใหญ่) ── */}
      <section className="ctc-sec">
        <div className="head">
          <span className="kicker kicker-mint">
            <i className="chat-ico">🗺️</i>แวะมาที่ร้าน
          </span>
          <h2>
            ที่ตั้ง<em>ร้านเรา</em>
          </h2>
          <p>
            {SHOP.legalName} {SHOP.addressLines.join(" ")}
          </p>
        </div>

        <div className="ctc-visit">
          <div className="ctc-map">
            <iframe title="แผนที่ร้าน" src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
          <aside className="ctc-side">
            <div className="ctc-hours">
              <i className="ctc-ico t-sky">🕘</i>
              <div>
                <b>เวลาทำการ</b>
                <p>{SHOP.hours}</p>
                <span>นอกเวลาทำการ ทิ้งข้อความไว้ใน LINE ได้ แอดมินจะตอบเมื่อเปิดทำการ</span>
              </div>
            </div>
            <div className="ctc-qr">
              <img src="/about/line-qr.png" alt="QR เพิ่มเพื่อน LINE ของร้าน" />
              <div>
                <b>สแกนเพิ่มเพื่อน LINE</b>
                <p>
                  เปิดกล้องมือถือสแกนได้เลย หรือค้นหา <b>{LINE_ID}</b>
                </p>
              </div>
            </div>
            <a className="btn btn-primary ctc-nav-btn" href={SHOP_MAPS_URL} target="_blank" rel="noopener noreferrer">
              เปิดใน Google Maps <span className="dot">↗</span>
            </a>
          </aside>
        </div>
      </section>

      {/* ── ตอบได้เลยไม่ต้องรอแชท ── */}
      <section className="ctc-sec tight">
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">💡</i>ตอบได้เลยไม่ต้องรอแชท
          </span>
          <h2>
            หาคำตอบ<em>ด้วยตัวเอง</em>
          </h2>
        </div>
        <div className="ctc-help">
          {HELP.map((h) => (
            <Link key={h.href} href={h.href} className="ctc-help-card">
              <span className="ctc-help-ico">
                <img src={`/how-to/${h.ico}.webp`} alt="" aria-hidden="true" />
              </span>
              <span className="ctc-help-txt">
                <b>{h.title}</b>
                <span>{h.desc}</span>
              </span>
              <span className="ctc-help-go" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── ปิดท้าย — แถบเนวี่ตัวเดียวกับหน้าแรก + โซเชียล ── */}
      <div className="ctc-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>ติดตามเราได้ทุกช่องทาง</h3>
            <p>อัปเดตงานใหม่ โปรโมชัน และรีวิวจากลูกค้าจริง</p>
            <div className="ctc-socials">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
          <div className="cc-btns">
            <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
              ทักแอดมินทาง LINE <span className="dot">💬</span>
            </a>
            <Link className="btn btn-yolk" href="/products">
              ดูสินค้าทั้งหมด <span className="dot">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

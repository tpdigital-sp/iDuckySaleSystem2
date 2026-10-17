/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import { REVIEWS } from "@/lib/home-reviews";
import FreeShipNote from "../how-to-order/FreeShipNote";
import "./why.css";

export const metadata: Metadata = {
  title: "ทำไมต้องเลือก iDucky",
  description: `ทำไมลูกค้าไว้ใจ ${SHOP.name} — งานพิมพ์คุณภาพ ไม่มีขั้นต่ำ เริ่ม 1 ชิ้น เห็นแบบก่อนผลิต ผลิต 1–3 วันทำการ ติดตามงานได้ทุกขั้น เคลมได้ภายใน 7 วัน`,
  alternates: { canonical: "/why" },
};

/** 4 เหตุผลหลัก — หัวข้อ/ไอคอนชุดเดียวกับโซน #why หน้าแรก แต่ขยายเป็นข้อเท็จจริงของร้าน */
const PILLARS = [
  {
    orb: "o-blue",
    ico: "/landing/why-ico-1.webp",
    title: "งานคุณภาพพรีเมียม",
    lead: "พิถีพิถันทุกขั้นตอน ใส่ใจทุกรายละเอียด",
    points: ["เช็กไฟล์ลายให้ฟรีก่อนผลิต (แนะนำ 300 DPI)", "ส่งแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกงาน", "พิมพ์ผิดหรือชำรุดจากการผลิต พิมพ์ใหม่ให้ฟรี"],
  },
  {
    orb: "o-yolk",
    ico: "/landing/why-ico-2.webp",
    title: "ผลิตรวดเร็ว",
    lead: "แจ้งคิวชัดเจน ส่งตรงเวลาที่นัดไว้",
    points: ["ผลิต 1–3 วันทำการหลังอนุมัติแบบ", "จัดส่ง 1–5 วันตามวิธีที่เลือก", "มีวันใช้งานแน่นอน แจ้งตอนสั่งหรือเช็กคิวกับแอดมินก่อน"],
  },
  {
    orb: "o-peach",
    ico: "/landing/why-ico-3.webp",
    title: "พิมพ์สีสวย คมชัด",
    lead: "ด้วยเทคโนโลยีการพิมพ์คุณภาพสูง",
    points: ["สีสด คมชัด ทนทาน", "งานผ้าซักเครื่องได้ สีไม่ตก", "ไม่แน่ใจเรื่องวัสดุ ปรึกษาแอดมินให้ช่วยเลือกได้"],
  },
  {
    orb: "o-mint",
    ico: "/landing/why-ico-4.webp",
    title: "บริการใส่ใจ",
    lead: "ให้คำแนะนำ ดูแลทุกออเดอร์จนถึงมือ",
    points: [`แอดมินตัวจริงตอบทาง LINE · ${SHOP.hours}`, "ติดตามสถานะงานและเลขพัสดุได้เองบนเว็บ", "มีปัญหาแจ้งเคลมได้ภายใน 7 วันนับจากได้รับของ"],
  },
];

/** สั่งง่าย ไม่ยุ่งยาก — ไอคอน 3D ชุดเดียวกับหน้าคู่มือลูกค้า (/how-to) */
const EASY = [
  { ico: "pick", title: "ไม่มีขั้นต่ำ เริ่ม 1 ชิ้น", desc: "สั่งเยอะ ราคาต่อชิ้นถูกลงอัตโนมัติตามขั้นบันได" },
  { ico: "art", title: "ใช้ลายของคุณเอง", desc: "อัปโหลดรูป/โลโก้ได้เลย ไม่มีลาย ทีมงานช่วยออกแบบให้ได้" },
  { ico: "proof", title: "เห็นแบบก่อนผลิต", desc: "ตรวจแบบให้ถูกใจก่อน แล้วค่อยเริ่มผลิตจริง" },
  { ico: "pay", title: "โอนแล้วตรวจสลิปทันที", desc: "ระบบเช็กสลิปให้อัตโนมัติ ไม่ต้องรอแอดมินยืนยัน" },
  { ico: "ship", title: "ติดตามงานได้ทุกขั้น", desc: "เช็กสถานะและเลขพัสดุ ด้วยเลขออเดอร์หรือเบอร์โทร", href: "/order/find" },
  { ico: "parcel", title: "สั่งเพิ่มไม่เสียค่าส่งซ้ำ", desc: "เพิ่มในออเดอร์เดิมได้ ถ้างานยังไม่เข้าสายผลิต" },
  { ico: "receipt", title: "ใบเสร็จ / ใบกำกับภาษี", desc: "ลูกค้าบริษัทขอใบเสนอราคาและมัดจำ 50% ได้ ทักทาง LINE" },
  { ico: "orders", title: "สมาชิก ยิ่งสั่งยิ่งลด", desc: "สะสมยอด รับส่วนลดตามระดับสมาชิก", href: "/member" },
];

/** จากไฟล์ลายถึงมือคุณ — ย่อจาก 7 ขั้นตอนในหน้า /how-to-order เหลือ 5 จุดที่ลูกค้าสนใจ */
const PATH = [
  { no: 1, title: "เลือกสินค้า + แนบลาย", desc: "ทำเองบนเว็บได้ทุกขั้น" },
  { no: 2, title: "โอน + แนบสลิป", desc: "ระบบตรวจสลิปให้ทันที" },
  { no: 3, title: "ตรวจแบบ", desc: "ทีมงานส่งแบบให้อนุมัติ" },
  { no: 4, title: "ผลิต", desc: "1–3 วันทำการหลังอนุมัติ" },
  { no: 5, title: "แพ็คส่งถึงมือ", desc: "พร้อมเลขพัสดุให้ติดตาม" },
];

/** เหมาะกับใคร — ชี้ไปหน้าที่ตรงกับแต่ละกลุ่ม */
const FOR_WHO = [
  {
    tone: "t-sky",
    emoji: "🎁",
    title: "ของขวัญ · ของใช้ส่วนตัว",
    desc: "สั่งชิ้นเดียวก็ทำให้ ลายรูปคู่ รูปสัตว์เลี้ยง ชื่อคนพิเศษ",
    cta: "เลือกสินค้า",
    href: "/products",
  },
  {
    tone: "t-yolk",
    emoji: "🏢",
    title: "บริษัท · องค์กร · อีเวนต์",
    desc: "ของพรีเมียม ของแจก เสื้อทีม — ขอใบเสนอราคาและใบกำกับภาษีได้",
    cta: "ขอใบเสนอราคา",
    href: LINE_URL,
    external: true,
  },
  {
    tone: "t-mint",
    emoji: "🤝",
    title: "ร้านค้า · ตัวแทนจำหน่าย",
    desc: "สมัครตัวแทนรับเรทราคาตัวแทน ส่งงานลูกค้าคุณได้ต่อเนื่อง",
    cta: "สมัครตัวแทน",
    href: "/dealer",
  },
];

/**
 * 💗 หน้าทำไมต้องเรา (/why) — เดิมเมนู "ทำไมต้องเรา" เลื่อนลงโซน #why ของหน้าแรก
 * เจ้าของร้านขอเป็นหน้าใหม่ + "ออกแบบให้สอดคล้องกับหน้า Landing page" (17 ต.ค. 69)
 *
 * 🎨 ดีไซน์: ครอบ `.dl dl-page wy-page` ใช้ของกลาง landing.css (.btn/.kicker/.head/.orb/.chat-cta/.rvc/.t-*)
 * ⚠️ ห้ามใช้คลาส Tailwind ในหน้านี้ — `.dl *{margin:0;padding:0}` ล้างทิ้งหมด
 * สไตล์เฉพาะหน้าอยู่ที่ ./why.css prefix .wy- · ข้อเท็จจริง (เวลาผลิต/เคลม/ขั้นต่ำ) ตรงกับ /how-to-order และ /terms
 */
export default function WhyPage() {
  return (
    <div className="dl dl-page wy-page">
      {/* ── แถบฟ้าหัวหน้า: ฮีโร่ + 4 เหตุผลหลัก ── */}
      <div className="top-stack wy-stack">
        <img className="bg-cloud wy-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud wy-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud wy-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <section className="wy-top">
          <div className="wy-hero">
            <div className="wy-hero-txt">
              <span className="kicker kicker-why">
                <i className="beat-heart">💗</i>เหตุผลที่ลูกค้าไว้ใจ
              </span>
              <h1>
                ทำไมต้องเลือก
                <br />
                <span className="yolk-underline">iDucky?</span>
              </h1>
              <p className="wy-lead">
                ร้านพิมพ์ลายตามสั่งที่ดูแลงานของคุณ <b>ตั้งแต่ไฟล์ลายจนพัสดุถึงมือ</b> — ชิ้นเดียวก็ใส่ใจเท่างานหลักร้อย
              </p>
              <div className="wy-facts">
                <span className="wy-fact">ไม่มีขั้นต่ำ เริ่ม 1 ชิ้น</span>
                <span className="wy-fact yolk">
                  <FreeShipNote />
                </span>
                <span className="wy-fact mint">ผลิต 1–3 วันทำการ</span>
              </div>
              <div className="wy-hero-btns">
                <Link className="btn btn-yolk" href="/products">
                  เริ่มเลือกสินค้า <span className="dot">→</span>
                </Link>
                <a className="btn btn-ghost" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                  ปรึกษาแอดมิน <span className="dot">💬</span>
                </a>
              </div>
            </div>

            {/* น้องเป็ดชูเสื้อที่พิมพ์เสร็จ + คลิปบอร์ดเช็กถูก/แว่นขยาย (public/why/why-hero.webp · สร้างด้วย Gemini
                จากเป็ดหน้าแรก hero-duck เป็นภาพอ้างอิง 17 ต.ค. 69 — เจ้าของร้านขอ "ภาพเป็ดใหม่" แทน duck-hug) */}
            <div className="wy-hero-art">
              <span className="wy-bub wy-b1">สั่งชิ้นเดียวก็ได้ 🐥</span>
              <span className="wy-bub wy-b2">เห็นแบบก่อนผลิต ✨</span>
              <div className="wy-scene">
                <img src="/why/why-hero.webp" alt="น้องเป็ด iDucky ชูเสื้อที่พิมพ์ลายเสร็จ พร้อมแก้วมัค เคสมือถือ พวงกุญแจ และคลิปบอร์ดตรวจงาน" />
              </div>
            </div>
          </div>

          {/* 4 เหตุผลหลัก */}
          <div className="wy-pillars">
            {PILLARS.map((p) => (
              <article key={p.title} className="wy-pillar">
                <div className={`orb ${p.orb}`}>
                  <img src={p.ico} alt="" aria-hidden="true" />
                </div>
                <h2>{p.title}</h2>
                <p className="wy-pillar-lead">{p.lead}</p>
                <ul>
                  {p.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* ── สั่งง่าย ไม่ยุ่งยาก ── */}
      <section className="wy-sec">
        <div className="head">
          <span className="kicker kicker-yolk">
            <i className="folder">🛍️</i>สั่งง่าย ไม่ยุ่งยาก
          </span>
          <h2>
            สั่งกับเรา<em>ได้อะไรบ้าง</em>
          </h2>
          <p>ทุกอย่างที่ทำให้การสั่งของพิมพ์ลายเป็นเรื่องง่าย ทำเองได้บนเว็บ</p>
        </div>
        <div className="wy-easy">
          {EASY.map((e) => {
            const inner = (
              <>
                <span className="wy-easy-ico">
                  <img src={`/how-to/${e.ico}.webp`} alt="" aria-hidden="true" />
                </span>
                <span className="wy-easy-txt">
                  <b>{e.title}</b>
                  <span>{e.desc}</span>
                </span>
              </>
            );
            return e.href ? (
              <Link key={e.ico} href={e.href} className="wy-easy-card is-link">
                {inner}
                <span className="wy-easy-go" aria-hidden="true">
                  →
                </span>
              </Link>
            ) : (
              <div key={e.ico} className="wy-easy-card">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── จากไฟล์ลายถึงมือคุณ ── */}
      <section className="wy-sec wy-path-sec">
        <div className="head">
          <span className="kicker kicker-mint">
            <i className="chat-ico">🚚</i>จากไฟล์ลาย ถึงมือคุณ
          </span>
          <h2>
            ชัดเจน<em>ทุกขั้นตอน</em>
          </h2>
          <p>รู้ตลอดว่างานอยู่ตรงไหน ไม่ต้องทักถามซ้ำ</p>
        </div>
        <ol className="wy-path">
          {PATH.map((s) => (
            <li key={s.no}>
              <span className="wy-path-no">{s.no}</span>
              <b>{s.title}</b>
              <span>{s.desc}</span>
            </li>
          ))}
        </ol>
        <div className="wy-path-more">
          <Link className="rv-viewall" href="/how-to-order">
            ดูขั้นตอนสั่งซื้อแบบละเอียด <span>→</span>
          </Link>
        </div>
      </section>

      {/* ── รีวิวลูกค้า: การ์ดชุดเดียวกับหน้าแรก (เลื่อนอัตโนมัติ · ชี้เมาส์ = หยุด) ── */}
      <section className="reviews-sec wy-reviews">
        <div className="head">
          <span className="kicker kicker-peach">
            <i className="star-ico">⭐</i>รีวิวจากลูกค้า
          </span>
          <h2>
            ลูกค้า<em>พูดถึงเรา</em>ว่ายังไง
          </h2>
        </div>
        <div className="rv-marquee">
          <div className="rv-track">
            {[...REVIEWS, ...REVIEWS].map((r, i) => (
              <figure className="rvc" key={i} aria-hidden={i >= REVIEWS.length ? true : undefined}>
                <div className="rvc-shot">
                  <img src={r.photo} alt="ภาพรีวิวจากลูกค้า" loading="lazy" decoding="async" />
                </div>
                <figcaption>
                  <div className="rvc-star">★★★★★</div>
                  <p>{r.text}</p>
                  <span className="rvc-who">
                    <i>{r.name.replace(/^คุณ/, "").charAt(0)}</i>
                    <b>{r.name}</b>
                    <small>{r.item}</small>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── เหมาะกับใคร ── */}
      <section className="wy-sec">
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">🙌</i>สั่งได้ทุกรูปแบบ
          </span>
          <h2>
            เหมาะกับ<em>ใครบ้าง</em>
          </h2>
        </div>
        <div className="wy-who">
          {FOR_WHO.map((w) => {
            const body = (
              <>
                <i className={`wy-who-ico ${w.tone}`}>{w.emoji}</i>
                <b>{w.title}</b>
                <span className="wy-who-desc">{w.desc}</span>
                <span className="wy-who-cta">
                  {w.cta} <span aria-hidden="true">→</span>
                </span>
              </>
            );
            return w.external ? (
              <a key={w.title} className="wy-who-card" href={w.href} target="_blank" rel="noopener noreferrer">
                {body}
              </a>
            ) : (
              <Link key={w.title} className="wy-who-card" href={w.href}>
                {body}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── ปิดท้าย — แถบเนวี่ตัวเดียวกับหน้าแรก ── */}
      <div className="wy-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>พร้อมให้น้องเป็ดดูแลงานของคุณแล้วหรือยัง?</h3>
            <p>เลือกสินค้า แนบลาย สั่งได้เลย หรือทักแอดมินให้ช่วยแนะนำก่อนก็ได้</p>
          </div>
          <div className="cc-btns">
            <Link className="btn btn-yolk" href="/products">
              ช้อปเลย <span className="dot">→</span>
            </Link>
            <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
              ทัก LINE <span className="dot">💬</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

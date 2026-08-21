import type { Metadata } from "next";
import Link from "next/link";
import FreeShipNote from "./FreeShipNote";
import PageOverride from "@/components/PageOverride";
import { getArticleServer } from "@/lib/server/articles-server";

// เนื้อหาเขียนทับได้จากหลังบ้าน (บทความ → หน้าเว็บหลัก) — เช็คของใหม่ทุก 5 นาที
export const revalidate = 300;

export const metadata: Metadata = {
  title: "วิธีสั่งซื้อ",
  description: "ขั้นตอนการสั่งซื้อสินค้าพิมพ์ลายตามสั่งจาก iDucky Prints Studio ทีละขั้นตอน ง่ายมาก",
};

const STEPS = [
  {
    ico: "pick",
    title: "เลือกสินค้า + ตัวเลือก",
    desc: "เลือกสินค้าที่ต้องการ แล้วเลือกขนาด/วัสดุ/จำนวน — ราคาจะขยับให้เห็นทันที สั่งเยอะราคาต่อชิ้นถูกลงอัตโนมัติ",
  },
  {
    ico: "art",
    title: "แนบลายของคุณ",
    desc: "อัปโหลดไฟล์ลายบนเว็บได้เลย (JPG / PNG) หรือจะใส่ลิงก์ไฟล์/อีเมลก็ได้ · สินค้าส่วนใหญ่ต้องแนบลายก่อนถึงจะกดใส่ตะกร้าได้ · แนะนำไฟล์ความละเอียดสูง",
  },
  {
    ico: "parcel",
    title: "ตรวจตะกร้า เลือกวิธีจัดส่ง",
    desc: "เช็ครายการอีกครั้ง เลือกวิธีจัดส่ง และระบุวันที่ต้องใช้งานได้ถ้ามีกำหนด (ไม่บังคับ) — ระบบจะเลือกกล่องที่พอดีกับออเดอร์ให้เอง",
  },
  {
    ico: "address",
    title: "กรอกที่อยู่ ยืนยันคำสั่งซื้อ",
    desc: "กรอกชื่อผู้รับ เบอร์โทร ที่อยู่ และใส่โค้ดส่วนลดถ้ามี — ไม่ต้องสมัครสมาชิกก็สั่งได้ · ยืนยันแล้วจะได้ลิงก์ออเดอร์ของคุณเอง เก็บลิงก์นี้ไว้ใช้ทุกขั้นตอนถัดไป",
  },
  {
    ico: "pay",
    title: "โอนเงิน แล้วแนบสลิป",
    desc: "โอนเข้าบัญชีธนาคารของร้าน แล้วแนบสลิปในหน้าออเดอร์ของคุณ — ระบบตรวจสลิปอัตโนมัติ ผ่านแล้วเริ่มงานให้ทันที · ทางร้านเริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น",
  },
  {
    ico: "proof",
    title: "ตรวจแบบก่อนพิมพ์จริง",
    desc: "ทีมกราฟฟิกทำแบบแล้วส่งให้ตรวจ คุณกด “อนุมัติ” หรือ “ขอแก้ไข” ได้เองในหน้าออเดอร์ ขอแก้ได้จนกว่าจะพอใจ",
  },
  {
    ico: "ship",
    title: "ผลิต แล้วจัดส่ง",
    desc: "อนุมัติแบบแล้วเข้าสายผลิตทันที เสร็จแล้วแพ็คส่ง พร้อมเลขพัสดุที่กดติดตามได้เองในหน้าออเดอร์",
  },
];

/** สิ่งที่ลูกค้าทำเองได้หลังสั่งแล้ว — จุดที่ถูกถามบ่อยที่สุด */
const AFTER = [
  {
    ico: "address",
    title: "แก้ที่อยู่จัดส่งเอง",
    desc: "เปิดลิงก์ออเดอร์ → กดแก้ที่ช่องที่อยู่ แก้ได้ทั้งชื่อผู้รับ เบอร์โทร และที่อยู่",
    when: "แก้ได้เรื่อย ๆ จนกว่าทางร้านจะปริ้นใบงาน (ปกติคือตอนใกล้จะแพ็ค) · หลังจากนั้นระบบจะล็อกไว้ ต้องทักแอดมินให้แก้ให้",
    tone: "t-sky",
  },
  {
    ico: "orders",
    title: "สั่งเพิ่มในออเดอร์เดิม",
    desc: "เลื่อนลงล่างสุดของหน้าออเดอร์ → กด “สั่งเพิ่มในออเดอร์นี้” → เลือกสินค้าใส่ตะกร้าตามปกติ แล้วเลือกว่ารายการไหนจะรวมเข้าออเดอร์เดิม",
    when: "ทำได้ตราบใดที่งานยังไม่เข้าสายผลิต · รวมส่งกล่องเดียวกัน ไม่คิดค่าส่งเพิ่ม โอนแค่ส่วนต่างที่เพิ่มขึ้น",
    tone: "t-mint",
  },
  {
    ico: "receipt",
    title: "เปิดใบเสร็จเอง",
    desc: "กดปุ่มใบเสร็จในหน้าออเดอร์ ดูและสั่งพิมพ์ได้เอง",
    when: "เปิดได้เมื่อชำระครบแล้ว",
    tone: "t-lilac",
  },
  {
    ico: "ship",
    title: "ติดตามพัสดุ",
    desc: "พอทางร้านยิงเลขพัสดุ หน้าออเดอร์จะขึ้นสถานะให้ดูเอง ไม่ต้องทักถาม",
    when: "ดูได้ทันทีหลังสถานะเปลี่ยนเป็น “จัดส่งแล้ว”",
    tone: "t-yolk",
  },
];

const FAQS = [
  {
    q: "จ่ายเงินยังไงได้บ้าง?",
    a: "โอนผ่านธนาคารเข้าบัญชีของร้านเท่านั้น แล้วแนบสลิปในหน้าออเดอร์ · ทางร้านไม่รับบัตรเครดิต และไม่มีเก็บเงินปลายทาง (COD)",
  },
  {
    q: "ต้องสมัครสมาชิกไหม?",
    a: "ไม่ต้องก็สั่งได้ · แต่ถ้าสมัครหรือล็อกอินด้วย LINE จะเก็บประวัติออเดอร์ให้ กดสั่งซ้ำได้ง่าย และได้ส่วนลดตามระดับสมาชิก",
  },
  {
    q: "แก้ที่อยู่จัดส่งได้ถึงเมื่อไหร่?",
    a: "แก้เองได้ในหน้าออเดอร์ จนกว่าทางร้านจะปริ้นใบงาน — หลังจากนั้นที่อยู่จะถูกล็อกเพราะใบปะหน้าพัสดุออกไปแล้ว ถ้าจำเป็นต้องแก้จริง ๆ ทักแอดมินทางไลน์ได้เลย",
  },
  {
    q: "สั่งเพิ่มทีหลังได้ไหม ต้องจ่ายค่าส่งอีกรอบหรือเปล่า?",
    a: "ได้ กด “สั่งเพิ่มในออเดอร์นี้” ที่ท้ายหน้าออเดอร์เดิม · รวมส่งกล่องเดียวกันจึงไม่คิดค่าส่งซ้ำ โอนเพิ่มแค่ส่วนต่าง · ทำได้ถ้างานยังไม่เข้าสายผลิต ถ้าเลยไปแล้วจะเป็นออเดอร์ใหม่",
  },
  {
    q: "ขอมัดจำก่อนได้ไหม?",
    a: "ได้ ทักแอดมินแจ้งไว้ก่อน — จะเปิดโหมดมัดจำ 50% ให้ โอนครึ่งแรกแล้วเริ่มงานได้เลย ส่วนที่เหลือชำระก่อนจัดส่ง",
  },
  {
    q: "ไฟล์ลายต้องความละเอียดเท่าไหร่?",
    a: "แนะนำอย่างน้อย 300 DPI ที่ขนาดพิมพ์จริง ถ้าไม่แน่ใจส่งไฟล์มาให้แอดมินเช็กให้ฟรี",
  },
  {
    q: "สั่งขั้นต่ำกี่ชิ้น?",
    a: "เริ่มต้นแค่ 1 ชิ้นเท่านั้น! สั่งเยอะราคาต่อชิ้นถูกลงอัตโนมัติ",
  },
  {
    q: "ใช้เวลาผลิตกี่วัน?",
    a: "ผลิต 1-3 วันทำการหลังอนุมัติแบบ + จัดส่ง 1-5 วันตามวิธีที่เลือก · ถ้ามีกำหนดใช้งานแน่นอน ระบุวันที่ต้องใช้ตอนสั่ง หรือทักแอดมินเช็กคิวก่อนได้",
  },
  {
    q: "เปลี่ยน/คืนสินค้าได้ไหม?",
    a: "สินค้าพิมพ์ตามสั่งเปลี่ยนคืนได้เฉพาะกรณีพิมพ์ผิดหรือชำรุดจากการผลิต แจ้งภายใน 7 วันพร้อมรูปถ่าย เราจัดการให้ทันที",
  },
];

export default async function HowToOrderPage() {
  // มีฉบับที่แอดมินเขียนเอง (เผยแพร่แล้ว) → ใช้แทนหน้าสำเร็จรูปทั้งหน้า
  const override = await getArticleServer("page-how-to-order");
  if (override) return <PageOverride article={override} />;

  return (
    <div className="dl dl-page">
      {/* ── แถบฟ้าหัวหน้า (ผืนเดียวกับหน้าแรก): หัวข้อ + เงื่อนไขชำระเงิน + 7 ขั้นตอน ── */}
      <div className="top-stack">
        <section className="hto-top">
          {/* หัวหน้า — ข้อความซ้าย เป็ดขวา (ผังเดียวกับฮีโร่หน้าแรก) */}
          <div className="hto-hero">
            <div className="hto-hero-txt">
              <span className="kicker kicker-yolk">
                <i className="folder">📖</i>คู่มือการสั่งซื้อ
              </span>
              <h1>
                สั่งซื้อ<em>ง่าย ๆ</em>
                <br />
                แค่ <span className="yolk-underline">7 ขั้นตอน</span>
              </h1>
              <p className="hto-lead">
                สั่งของพิมพ์ลายกับ iDucky ตั้งแต่เลือกของจนพัสดุถึงบ้าน — ทำเองได้ทุกขั้นบนเว็บ
                ไม่ต้องรอแอดมินตอบทีละข้อความ
              </p>
              <div className="hto-facts">
                <span className="hto-fact">ไม่มีขั้นต่ำ เริ่มที่ 1 ชิ้น</span>
                <span className="hto-fact yolk">
                  <FreeShipNote />
                </span>
                <span className="hto-fact mint">ไม่ต้องสมัครสมาชิกก็สั่งได้</span>
              </div>
              <div className="hto-hero-btns">
                <Link className="btn btn-yolk" href="/products">
                  เริ่มเลือกสินค้า <span className="dot">→</span>
                </Link>
                <a className="btn btn-ghost" href="#faq">
                  ดูคำถามที่พบบ่อย <span className="dot">↓</span>
                </a>
              </div>
            </div>
            <div className="hto-hero-art">
              <span className="hto-bub b1">เลือก → แนบลาย → โอน 🐥</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/duck-hug.webp" alt="" aria-hidden="true" />
            </div>
          </div>

          {/* เงื่อนไขหลักของร้าน — วางไว้บนสุดก่อนขั้นตอน ลูกค้าจะได้เห็นก่อนสั่ง ไม่ใช่มารู้ทีหลัง */}
          <div className="hto-pay">
            <p className="hto-pay-title">💳 เรื่องการชำระเงิน — อ่านก่อนสั่ง</p>
            <ul>
              <li>
                <b>โอนผ่านธนาคารเท่านั้น</b> — โอนเข้าบัญชีของร้าน แล้วแนบสลิปในหน้าออเดอร์
              </li>
              <li className="no">
                <b className="warn">ไม่รับบัตรเครดิต และไม่มีเก็บเงินปลายทาง (COD)</b>
              </li>
              <li>
                ทางร้าน<b>เริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น</b> — ยังไม่โอน งานจะยังไม่เข้าคิว
              </li>
            </ul>
          </div>

          {/* 7 ขั้นตอน — ไทม์ไลน์สลับซ้าย-ขวา อ่านไล่ลงมาได้เป็นจังหวะ */}
          <ol className="hto-flow">
            {STEPS.map((s, i) => (
              <li className="hto-step" key={s.title}>
                <span className="hto-node">{i + 1}</span>
                <span className="hto-ico">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/how-to/${s.ico}.webp`} alt="" aria-hidden="true" />
                </span>
                <div>
                  <span className="stepno">ขั้นที่ {i + 1}</span>
                  <h2>{s.title}</h2>
                  <p>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* ── สั่งแล้วทำอะไรเองได้บ้าง — แถบ gradient แบบโซนขายดีหน้าแรก ── */}
      <div className="combo-band" style={{ padding: "56px 0 60px" }}>
        <div className="cb-bg" aria-hidden="true" />
        <section className="wrap">
          <div className="head">
            <span className="kicker kicker-mint">
              <i className="chat-ico">✨</i>ไม่ต้องรอแอดมิน
            </span>
            <h2>
              สั่งแล้ว<em>ทำเองได้</em>ทุกอย่าง
            </h2>
            <p>
              ทุกอย่างทำได้จาก<b>ลิงก์ออเดอร์ของคุณ</b> — เก็บลิงก์ไว้ที่เดียวจบ
            </p>
          </div>
          <div className="hto-after">
            {AFTER.map((a) => (
              <div className="hto-card" key={a.title}>
                <div className="hto-card-head">
                  <i className={a.tone}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/how-to/${a.ico}.webp`} alt="" aria-hidden="true" />
                  </i>
                  <b>{a.title}</b>
                </div>
                <p>{a.desc}</p>
                <p className="hto-when">
                  <span>⏱ {a.when}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── คำถามที่พบบ่อย ── */}
      <section className="hto-sec" id="faq" style={{ scrollMarginTop: 100 }}>
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">❓</i>คำถามที่พบบ่อย
          </span>
          <h2>
            ถาม-ตอบ<em>ก่อนสั่ง</em>
          </h2>
        </div>
        <div className="hto-faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>
                <i>▶</i>
                {f.q}
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── ปิดท้าย — แถบเนวี่ตัวเดียวกับหน้าแรก ── */}
      <div className="hto-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>ยังไม่แน่ใจ? ทักมาคุยกันก่อนได้</h3>
            <p>แอดมินยินดีให้คำปรึกษาเรื่องลาย ขนาด และวัสดุ ฟรี ไม่มีค่าใช้จ่าย</p>
          </div>
          <div className="cc-btns">
            <Link className="btn btn-yolk" href="/products">
              เริ่มเลือกสินค้า <span className="dot">→</span>
            </Link>
            <a className="btn btn-line" href="https://lin.ee/x8GkqGZ" target="_blank" rel="noreferrer">
              ทักแอดมินทาง LINE <span className="dot">💬</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

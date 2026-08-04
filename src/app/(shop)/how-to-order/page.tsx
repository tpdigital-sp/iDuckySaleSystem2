import type { Metadata } from "next";
import Link from "next/link";
import FreeShipNote from "./FreeShipNote";

export const metadata: Metadata = {
  title: "วิธีสั่งซื้อ",
  description: "ขั้นตอนการสั่งซื้อสินค้าพิมพ์ลายตามสั่งจาก iDucky Prints Studio ทีละขั้นตอน ง่ายมาก",
};

const STEPS = [
  {
    emoji: "🛍️",
    title: "เลือกสินค้า + ตัวเลือก",
    desc: "เลือกสินค้าที่ต้องการ แล้วเลือกขนาด/วัสดุ/จำนวน — ราคาจะขยับให้เห็นทันที สั่งเยอะราคาต่อชิ้นถูกลงอัตโนมัติ",
  },
  {
    emoji: "🎨",
    title: "แนบลายของคุณ",
    desc: "อัปโหลดไฟล์ลายบนเว็บได้เลย (JPG / PNG) หรือจะใส่ลิงก์ไฟล์/อีเมลก็ได้ · สินค้าส่วนใหญ่ต้องแนบลายก่อนถึงจะกดใส่ตะกร้าได้ · แนะนำไฟล์ความละเอียดสูง",
  },
  {
    emoji: "🛒",
    title: "ตรวจตะกร้า เลือกวิธีจัดส่ง",
    desc: "เช็ครายการอีกครั้ง เลือกวิธีจัดส่ง และระบุวันที่ต้องใช้งานได้ถ้ามีกำหนด (ไม่บังคับ) — ระบบจะเลือกกล่องที่พอดีกับออเดอร์ให้เอง",
  },
  {
    emoji: "📝",
    title: "กรอกที่อยู่ ยืนยันคำสั่งซื้อ",
    desc: "กรอกชื่อผู้รับ เบอร์โทร ที่อยู่ และใส่โค้ดส่วนลดถ้ามี — ไม่ต้องสมัครสมาชิกก็สั่งได้ · ยืนยันแล้วจะได้ลิงก์ออเดอร์ของคุณเอง เก็บลิงก์นี้ไว้ใช้ทุกขั้นตอนถัดไป",
  },
  {
    emoji: "💸",
    title: "โอนเงิน แล้วแนบสลิป",
    desc: "โอนเข้าบัญชีธนาคารของร้าน แล้วแนบสลิปในหน้าออเดอร์ของคุณ — ระบบตรวจสลิปอัตโนมัติ ผ่านแล้วเริ่มงานให้ทันที · ทางร้านเริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น",
  },
  {
    emoji: "👀",
    title: "ตรวจแบบก่อนพิมพ์จริง",
    desc: "ทีมกราฟฟิกทำแบบแล้วส่งให้ตรวจ คุณกด “อนุมัติ” หรือ “ขอแก้ไข” ได้เองในหน้าออเดอร์ ขอแก้ได้จนกว่าจะพอใจ",
  },
  {
    emoji: "📦",
    title: "ผลิต แล้วจัดส่ง",
    desc: "อนุมัติแบบแล้วเข้าสายผลิตทันที เสร็จแล้วแพ็คส่ง พร้อมเลขพัสดุที่กดติดตามได้เองในหน้าออเดอร์",
  },
];

/** สิ่งที่ลูกค้าทำเองได้หลังสั่งแล้ว — จุดที่ถูกถามบ่อยที่สุด */
const AFTER = [
  {
    emoji: "🏠",
    title: "แก้ที่อยู่จัดส่งเอง",
    desc: "เปิดลิงก์ออเดอร์ → กดแก้ที่ช่องที่อยู่ แก้ได้ทั้งชื่อผู้รับ เบอร์โทร และที่อยู่",
    when: "แก้ได้เรื่อย ๆ จนกว่าทางร้านจะปริ้นใบงาน (ปกติคือตอนใกล้จะแพ็ค) · หลังจากนั้นระบบจะล็อกไว้ ต้องทักแอดมินให้แก้ให้",
    tone: "sky",
  },
  {
    emoji: "➕",
    title: "สั่งเพิ่มในออเดอร์เดิม",
    desc: "เลื่อนลงล่างสุดของหน้าออเดอร์ → กด “สั่งเพิ่มในออเดอร์นี้” → เลือกสินค้าใส่ตะกร้าตามปกติ แล้วเลือกว่ารายการไหนจะรวมเข้าออเดอร์เดิม",
    when: "ทำได้ตราบใดที่งานยังไม่เข้าสายผลิต · รวมส่งกล่องเดียวกัน ไม่คิดค่าส่งเพิ่ม โอนแค่ส่วนต่างที่เพิ่มขึ้น",
    tone: "emerald",
  },
  {
    emoji: "🧾",
    title: "เปิดใบเสร็จเอง",
    desc: "กดปุ่มใบเสร็จในหน้าออเดอร์ ดูและสั่งพิมพ์ได้เอง",
    when: "เปิดได้เมื่อชำระครบแล้ว",
    tone: "violet",
  },
  {
    emoji: "🚚",
    title: "ติดตามพัสดุ",
    desc: "พอทางร้านยิงเลขพัสดุ หน้าออเดอร์จะขึ้นสถานะให้ดูเอง ไม่ต้องทักถาม",
    when: "ดูได้ทันทีหลังสถานะเปลี่ยนเป็น “จัดส่งแล้ว”",
    tone: "amber",
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

export default function HowToOrderPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <div className="text-center">
        <span className="text-5xl">📖</span>
        <h1 className="mt-2 text-2xl font-extrabold text-amber-950 md:text-3xl">วิธีสั่งซื้อ</h1>
        <p className="mt-2 text-sm text-stone-500">
          สั่งของพิมพ์ลายกับ iDucky ง่ายมาก แค่ 7 ขั้นตอน 💛 · <FreeShipNote />
        </p>
      </div>

      {/* เงื่อนไขหลักของร้าน — วางไว้บนสุดก่อนขั้นตอน ลูกค้าจะได้เห็นก่อนสั่ง ไม่ใช่มารู้ทีหลัง */}
      <div className="mt-6 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <p className="text-sm font-extrabold text-amber-900">💳 เรื่องการชำระเงิน — อ่านก่อนสั่ง</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-stone-700">
          <li>
            • <strong>โอนผ่านธนาคารเท่านั้น</strong> — โอนเข้าบัญชีของร้าน แล้วแนบสลิปในหน้าออเดอร์
          </li>
          <li>
            • <strong className="text-rose-600">ไม่รับบัตรเครดิต และไม่มีเก็บเงินปลายทาง (COD)</strong>
          </li>
          <li>
            • ทางร้าน<strong>เริ่มจัดทำงานหลังได้รับเงินแล้วเท่านั้น</strong> — ยังไม่โอน งานจะยังไม่เข้าคิว
          </li>
        </ul>
      </div>

      <ol className="mt-8 space-y-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="flex gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100"
          >
            <div className="flex shrink-0 flex-col items-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ducky text-2xl shadow-sm">
                {s.emoji}
              </span>
              <span className="mt-1.5 text-[11px] font-bold text-amber-500">ขั้นที่ {i + 1}</span>
            </div>
            <div>
              <h2 className="font-extrabold text-stone-800">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── หลังสั่งแล้วทำอะไรได้เอง — ตอบคำถามที่ลูกค้าทักมาถามบ่อยที่สุด ── */}
      <section className="mt-12">
        <h2 className="text-center text-xl font-extrabold text-amber-950">✨ สั่งแล้วทำอะไรเองได้บ้าง</h2>
        <p className="mt-1 text-center text-sm text-stone-500">
          ทุกอย่างทำได้จาก<strong className="text-stone-700">ลิงก์ออเดอร์ของคุณ</strong> ไม่ต้องรอแอดมิน
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {AFTER.map((a) => (
            <div key={a.title} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100">
              <p className="flex items-center gap-2 font-extrabold text-stone-800">
                <span className="text-xl">{a.emoji}</span>
                {a.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{a.desc}</p>
              <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
                ⏱ {a.when}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-center text-xl font-extrabold text-amber-950">❓ คำถามที่พบบ่อย</h2>
        <div className="mt-5 space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100"
            >
              <summary className="cursor-pointer list-none text-sm font-bold text-stone-800">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
                {f.q}
              </summary>
              <p className="mt-2 pl-6 text-sm leading-relaxed text-stone-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-10 rounded-[2rem] bg-gradient-to-r from-emerald-100 to-teal-100 p-8 text-center">
        <span className="text-4xl">💬</span>
        <h2 className="mt-2 text-lg font-extrabold text-stone-800">ยังไม่แน่ใจ? ทักมาคุยกันก่อนได้</h2>
        <p className="mt-1 text-sm text-stone-600">
          แอดมินยินดีให้คำปรึกษาเรื่องลาย ขนาด และวัสดุ ฟรี ไม่มีค่าใช้จ่าย
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a
            href="https://line.me/R/ti/p/@iduckyprints"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-emerald-500 px-7 py-3 text-sm font-bold text-white shadow transition hover:scale-105"
          >
            💬 แชท LINE OA
          </a>
          <Link
            href="/products"
            className="rounded-full bg-white px-7 py-3 text-sm font-bold text-stone-700 shadow transition hover:scale-105"
          >
            🛍️ เริ่มเลือกสินค้า
          </Link>
        </div>
      </div>
    </div>
  );
}

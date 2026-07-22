import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "วิธีสั่งซื้อ",
  description: "ขั้นตอนการสั่งซื้อสินค้าพิมพ์ลายตามสั่งจาก iDucky Prints Studio ทีละขั้นตอน ง่ายมาก",
};

const STEPS = [
  {
    emoji: "🛍️",
    title: "เลือกสินค้าที่ชอบ",
    desc: "เลือกจาก 5 หมวดหมู่ — งานพิมพ์ดิจิทัล ของขวัญ แก็ดเจ็ต ของแต่งบ้าน และผ้า จากนั้นเลือกขนาด สี วัสดุ ตามต้องการ",
  },
  {
    emoji: "🎨",
    title: "ส่งลายที่อยากพิมพ์",
    desc: "ส่งไฟล์รูปหรือโลโก้ของคุณให้แอดมินทาง LINE OA (รองรับ JPG, PNG, PDF ความละเอียดสูง) — เร็ว ๆ นี้จะอัปโหลดพร้อมพรีวิวบนเว็บได้เลย!",
  },
  {
    emoji: "🛒",
    title: "ยืนยันคำสั่งซื้อ",
    desc: "ตรวจสอบสินค้าในตะกร้า เลือกวิธีจัดส่ง แล้วยืนยันออเดอร์ แอดมินจะส่งแบบพรีวิวให้ตรวจก่อนพิมพ์จริงทุกครั้ง",
  },
  {
    emoji: "💳",
    title: "ชำระเงิน",
    desc: "ชำระผ่าน PromptPay / QR, โอนธนาคาร, บัตรเครดิต หรือเก็บเงินปลายทาง (COD) ได้ตามสะดวก",
  },
  {
    emoji: "🖨️",
    title: "เราเริ่มพิมพ์ทันที",
    desc: "หลังคุณอนุมัติแบบ ทีมงานจะพิมพ์และตรวจคุณภาพทุกชิ้น ใช้เวลาผลิต 1-3 วันทำการ",
  },
  {
    emoji: "📦",
    title: "รอรับที่บ้านได้เลย",
    desc: "จัดส่งทั่วไทย พร้อมเลขพัสดุติดตามได้ และแจ้งสถานะทางอีเมล/LINE ทุกขั้นตอน — ส่งฟรีเมื่อสั่งครบ ฿999",
  },
];

const FAQS = [
  {
    q: "ไฟล์ลายต้องความละเอียดเท่าไหร่?",
    a: "แนะนำอย่างน้อย 300 DPI ที่ขนาดพิมพ์จริง ถ้าไม่แน่ใจส่งไฟล์มาให้แอดมินเช็กให้ฟรี",
  },
  {
    q: "สั่งขั้นต่ำกี่ชิ้น?",
    a: "เริ่มต้นแค่ 1 ชิ้นเท่านั้น! สั่งเยอะมีส่วนลดพิเศษ ทักแอดมินได้เลย",
  },
  {
    q: "ใช้เวลาผลิตกี่วัน?",
    a: "ผลิต 1-3 วันทำการหลังอนุมัติแบบ + จัดส่ง 1-5 วันตามวิธีที่เลือก",
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
          สั่งของพิมพ์ลายกับ iDucky ง่ายมาก แค่ 6 ขั้นตอน 💛
        </p>
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

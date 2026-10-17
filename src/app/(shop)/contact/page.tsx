import type { Metadata } from "next";
import Link from "next/link";
import { SHOP, SHOP_EMAIL, SHOP_MAPS_URL, shopAddressOneLine } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import { SOCIAL_LINKS } from "@/components/SocialLinks";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description: `ติดต่อ ${SHOP.name} — LINE @iduckyofficial · โทร ${SHOP.phone} · อีเมล ${SHOP_EMAIL} · ${shopAddressOneLine}`,
  alternates: { canonical: "/contact" },
};

const TEL_HREF = `tel:+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`;

/** แผนที่ฝังในหน้า (ไม่ต้องใช้ API key) — ค้นจากที่อยู่ชุดเดียวกับปุ่ม Google Maps */
const MAP_EMBED = `https://maps.google.com/maps?q=${encodeURIComponent(shopAddressOneLine)}&z=16&output=embed`;

/** ลิงก์ช่วยเหลือที่ลูกค้าถามบ่อย — ตอบเองได้ก่อนทักแชท */
const HELP_LINKS = [
  { href: "/order/find", icon: "🔎", title: "ติดตามคำสั่งซื้อ", sub: "เช็คสถานะ/เลขพัสดุด้วยเลขออเดอร์หรือเบอร์โทร" },
  { href: "/how-to-order", icon: "📖", title: "วิธีสั่งซื้อ & เตรียมไฟล์", sub: "ขั้นตอนสั่ง ส่งไฟล์ การจัดส่ง เงื่อนไขเคลม" },
  { href: "/dealer", icon: "🤝", title: "สมัครตัวแทนจำหน่าย", sub: "ล็อกอินแล้วกรอกใบสมัคร รอร้านอนุมัติ" },
];

/**
 * 📇 หน้าติดต่อเรา (/contact) — เดิมเมนู "ติดต่อเรา" เลื่อนลงท้ายเว็บ (/#contact)
 * เจ้าของร้านขอเป็นหน้าแยก 17 ต.ค. 69 · ข้อมูลร้านดึงจาก shop-info ที่เดียว
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      {/* ── หัวหน้า ── */}
      <header className="text-center">
        <h1 className="text-3xl font-extrabold text-amber-950 md:text-4xl">ติดต่อเรา</h1>
        <p className="mt-2 text-sm text-stone-600 md:text-base">
          สอบถามสินค้า ส่งไฟล์งาน เช็คคิวผลิต — แอดมินตอบไวสุดทาง LINE 💬
        </p>
      </header>

      {/* ── ช่องทางหลัก 3 ทาง ── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-3xl bg-[#06c755] p-5 text-white shadow-sm transition hover:bg-[#05b34c]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-xs font-extrabold text-[#06c755]">
            LINE
          </span>
          <span className="min-w-0">
            <b className="block text-base">แชท LINE ร้าน</b>
            <span className="block text-sm text-white/90">@iduckyofficial</span>
          </span>
        </a>
        <a
          href={TEL_HREF}
          className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 transition hover:ring-amber-300"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-2xl">📞</span>
          <span className="min-w-0">
            <b className="block text-base text-stone-800">{SHOP.phone}</b>
            <span className="block text-sm text-stone-500">โทรสอบถาม / สั่งงาน</span>
          </span>
        </a>
        <a
          href={`mailto:${SHOP_EMAIL}`}
          className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 transition hover:ring-amber-300"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-2xl">✉️</span>
          <span className="min-w-0">
            <b className="block break-all text-base text-stone-800">{SHOP_EMAIL}</b>
            <span className="block text-sm text-stone-500">ส่งไฟล์งาน / ขอใบเสนอราคา</span>
          </span>
        </a>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.4fr]">
        {/* ── QR LINE ── */}
        <section className="flex flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-amber-100">
          <h2 className="text-lg font-extrabold text-amber-950">💬 สแกนเพิ่มเพื่อน LINE</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/line-qr.png" alt="QR เพิ่มเพื่อน LINE ของร้าน" className="mt-4 block h-48 w-48 rounded-xl" />
          <p className="mt-3 text-sm text-stone-600">
            มีเลขออเดอร์แล้ว แจ้งเลข <b className="text-stone-800">OD-…</b> ในแชทได้เลย
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.name}
                title={s.name}
                className="grid h-10 w-10 place-items-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-amber-100 hover:text-amber-800 [&_svg]:h-5 [&_svg]:w-5"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </section>

        {/* ── ที่อยู่ + แผนที่ ── */}
        <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-amber-100">
          <div className="p-6">
            <h2 className="text-lg font-extrabold text-amber-950">📍 ที่อยู่ร้าน</h2>
            <p className="mt-2 text-sm font-semibold text-stone-500">{SHOP.legalName}</p>
            {SHOP.addressLines.map((l) => (
              <p key={l} className="text-[0.95rem] leading-relaxed text-stone-700">
                {l}
              </p>
            ))}
            <p className="mt-2 text-sm text-stone-500">🕘 {SHOP.hours}</p>
            <a
              href={SHOP_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-full bg-sky-100 px-5 py-2.5 text-sm font-bold text-sky-800 transition hover:bg-sky-200"
            >
              🗺️ เปิดใน Google Maps ↗
            </a>
          </div>
          <iframe
            title="แผนที่ร้าน"
            src={MAP_EMBED}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-64 w-full border-0 md:h-72"
          />
        </section>
      </div>

      {/* ── ช่วยเหลือตัวเอง ── */}
      <section className="mt-8">
        <h2 className="text-lg font-extrabold text-amber-950">ตอบได้เลยไม่ต้องรอแชท</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {HELP_LINKS.map((h) => (
            <Link
              key={h.href}
              href={h.href}
              className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-sky-50 to-amber-50 p-4 ring-1 ring-amber-100 transition hover:ring-amber-300"
            >
              <span className="text-2xl">{h.icon}</span>
              <span className="min-w-0">
                <b className="block text-sm text-stone-800">{h.title} →</b>
                <span className="block text-xs leading-relaxed text-stone-500">{h.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

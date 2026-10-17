import type { Metadata } from "next";
import Link from "next/link";
import { SHOP, SHOP_EMAIL, SHOP_MAPS_URL, shopAddressOneLine } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import { SOCIAL_LINKS } from "@/components/SocialLinks";
import CopyChip from "./CopyChip";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description: `ติดต่อ ${SHOP.name} — LINE @iduckyofficial · โทร ${SHOP.phone} · อีเมล ${SHOP_EMAIL} · ${shopAddressOneLine}`,
  alternates: { canonical: "/contact" },
};

const LINE_ID = "@iduckyofficial";
const TEL_HREF = `tel:+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`;

/** แผนที่ฝังในหน้า (ไม่ต้องใช้ API key) — ค้นจากที่อยู่ชุดเดียวกับปุ่ม Google Maps */
const MAP_EMBED = `https://maps.google.com/maps?q=${encodeURIComponent(shopAddressOneLine)}&z=16&output=embed`;

/** ลิงก์ช่วยเหลือที่ลูกค้าถามบ่อย — ตอบเองได้ก่อนทักแชท */
const HELP_LINKS = [
  { href: "/order/find", icon: "🔎", title: "ติดตามคำสั่งซื้อ", sub: "เช็คสถานะ/เลขพัสดุด้วยเลขออเดอร์หรือเบอร์โทร" },
  { href: "/how-to-order", icon: "📖", title: "วิธีสั่งซื้อ & เตรียมไฟล์", sub: "ขั้นตอนสั่ง ส่งไฟล์ การจัดส่ง เงื่อนไขเคลม" },
  { href: "/dealer", icon: "🤝", title: "สมัครตัวแทนจำหน่าย", sub: "ล็อกอินแล้วกรอกใบสมัคร รอร้านอนุมัติ" },
];

const CARD = "rounded-3xl bg-white shadow-sm ring-1 ring-amber-100";
const PILL = "inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold transition";

/**
 * 📇 หน้าติดต่อเรา (/contact) — เดิมเมนู "ติดต่อเรา" เลื่อนลงท้ายเว็บ (/#contact)
 * เจ้าของร้านขอเป็นหน้าแยก 17 ต.ค. 69 · ข้อมูลร้านดึงจาก shop-info ที่เดียว
 *
 * มือถือก่อน: ลูกค้าส่วนใหญ่เปิดจากแอป LINE/มือถือ
 *  - QR LINE โชว์เฉพาะจอ md+ (สแกนจอตัวเองไม่ได้ — มือถือใช้ปุ่มเปิดแชทแทน)
 *  - ปุ่มโทร/คัดลอกชิดซ้ายใต้ข้อความ ไม่ชิดขอบขวา (ปุ่มลอยตะกร้า/แชทมุมขวาบัง)
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 md:pb-16 md:pt-10">
      {/* ── หัวหน้า ── */}
      <header className="text-center">
        <h1 className="text-2xl font-extrabold text-amber-950 md:text-4xl">ติดต่อเรา</h1>
        <p className="mt-1.5 text-sm text-stone-600 md:text-base">สอบถามสินค้า · ส่งไฟล์งาน · เช็คคิวผลิต</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100">
          🕘 {SHOP.hours}
        </p>
      </header>

      <div className="mt-6 grid gap-4 md:mt-8 md:grid-cols-2 md:gap-5">
        {/* ── คอลัมน์ซ้าย: LINE (ช่องทางหลัก) ── */}
        <div className="grid content-start gap-4 md:gap-5">
          <section className="rounded-3xl bg-[#06c755] p-5 text-white shadow-sm md:p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-sm font-extrabold text-[#06c755]">
                LINE
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold leading-tight">แชทกับแอดมิน</h2>
                <p className="text-sm text-white/90">ช่องทางที่ตอบไวที่สุด</p>
              </div>
            </div>

            {/* QR — จอใหญ่เท่านั้น */}
            <div className="mt-5 hidden justify-center md:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/about/line-qr.png" alt="QR เพิ่มเพื่อน LINE ของร้าน" className="block h-44 w-44 rounded-2xl bg-white p-2" />
            </div>

            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-white text-base font-extrabold text-[#06a447] shadow transition active:scale-[.98] md:hover:bg-emerald-50"
            >
              💬 เปิดแชท LINE
            </a>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-white/15 px-3 py-2">
              <span className="text-sm">
                LINE ID <b>{LINE_ID}</b>
              </span>
              <CopyChip text={LINE_ID} />
            </div>
            <p className="mt-3 text-xs text-white/85">มีเลขออเดอร์แล้ว แจ้งเลข OD-… ในแชทได้เลย</p>
          </section>

        </div>

        {/* ── คอลัมน์ขวา: โทร/อีเมล + ที่อยู่/แผนที่ ── */}
        <div className="grid content-start gap-4 md:gap-5">
          <section className={`${CARD} divide-y divide-amber-100`}>
            <div className="flex gap-3 p-5">
              <a href={TEL_HREF} aria-label="โทรหาร้าน" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-xl">
                📞
              </a>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-stone-500">โทรสอบถาม / สั่งงาน</p>
                <a href={TEL_HREF} className="text-lg font-extrabold text-stone-800">
                  {SHOP.phone}
                </a>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={TEL_HREF} className={`${PILL} bg-amber-400 text-white hover:bg-amber-500`}>
                    📞 โทรเลย
                  </a>
                  <CopyChip text={SHOP.phone.replace(/\D/g, "")} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5">
              <a href={`mailto:${SHOP_EMAIL}`} aria-label="ส่งอีเมลถึงร้าน" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-xl">
                ✉️
              </a>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-stone-500">อีเมล · ส่งไฟล์งาน / ขอใบเสนอราคา</p>
                <a href={`mailto:${SHOP_EMAIL}`} className="break-all text-base font-extrabold text-stone-800">
                  {SHOP_EMAIL}
                </a>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={`mailto:${SHOP_EMAIL}`} className={`${PILL} bg-sky-500 text-white hover:bg-sky-600`}>
                    ✉️ ส่งอีเมล
                  </a>
                  <CopyChip text={SHOP_EMAIL} />
                </div>
              </div>
            </div>
          </section>

          <section className={`${CARD} overflow-hidden`}>
            <div className="flex gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-xl">📍</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-stone-500">ที่อยู่ร้าน</p>
                <p className="text-sm font-bold text-stone-800">{SHOP.legalName}</p>
                <p className="text-sm leading-relaxed text-stone-700">{SHOP.addressLines.join(" ")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={SHOP_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${PILL} bg-rose-500 text-white hover:bg-rose-600`}
                  >
                    🧭 นำทาง
                  </a>
                  <CopyChip text={shopAddressOneLine} label="คัดลอกที่อยู่" />
                </div>
              </div>
            </div>
            <iframe
              title="แผนที่ร้าน"
              src={MAP_EMBED}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="block h-52 w-full border-0 md:h-64"
            />
          </section>
        </div>
      </div>

      {/* ── โซเชียล ── */}
      <section className={`${CARD} mt-4 p-5 md:mt-5`}>
        <h2 className="text-sm font-extrabold text-amber-950">ติดตามเรา</h2>
        <div className="mt-3 grid max-w-md grid-cols-4 gap-2">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.key}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-2xl py-2 text-stone-600 transition hover:bg-amber-50 hover:text-amber-800"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-stone-100 [&_svg]:h-5 [&_svg]:w-5">{s.icon}</span>
              <span className="text-[11px] font-semibold">{s.name}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── ช่วยเหลือตัวเอง ── */}
      <section className="mt-8">
        <h2 className="text-base font-extrabold text-amber-950 md:text-lg">ตอบได้เลยไม่ต้องรอแชท</h2>
        <div className={`${CARD} mt-3 divide-y divide-amber-100 md:grid md:grid-cols-3 md:divide-x md:divide-y-0`}>
          {HELP_LINKS.map((h) => (
            <Link key={h.href} href={h.href} className="flex items-center gap-3 p-4 transition hover:bg-amber-50/60">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-xl">{h.icon}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-sm text-stone-800">{h.title}</b>
                <span className="block text-xs leading-relaxed text-stone-500">{h.sub}</span>
              </span>
              <span className="text-stone-300" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

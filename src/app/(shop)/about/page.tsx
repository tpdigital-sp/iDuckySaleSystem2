import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";
import PageOverride from "@/components/PageOverride";
import { getArticleServer } from "@/lib/server/articles-server";

// เนื้อหาเขียนทับได้จากหลังบ้าน (บทความ → หน้าเว็บหลัก)
export const revalidate = 300;

export const metadata: Metadata = {
  title: "เกี่ยวกับเรา",
  description: `รู้จัก ${SHOP.name} — ที่อยู่ร้าน ช่องทางติดต่อ โทรศัพท์ LINE และอีเมล`,
};

/** อีเมลติดต่อร้าน (ตามหน้าเกี่ยวกับเราของเว็บหลัก) */
const SHOP_EMAIL = "iduckyshop03@gmail.com";

/** โซเชียลของร้าน (ลิงก์ชุดเดียวกับ footer เว็บหลัก · โลโก้จริงจากคลังงานของร้าน) */
const SOCIALS = [
  { name: "Facebook", icon: "/about/social/facebook.png", href: "https://www.facebook.com/iduckyshop" },
  { name: "Instagram", icon: "/about/social/instagram.png", href: "https://www.instagram.com/iduckyshop1" },
  { name: "TikTok", icon: "/about/social/tiktok.png", href: "https://www.tiktok.com/@iduckyofficial" },
  { name: "X", icon: "/about/social/x.png", href: "https://x.com/iduckyshop" },
];

const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  [SHOP.legalName, ...SHOP.addressLines].join(" ")
)}`;

/**
 * 🦆 เกี่ยวกับเรา — แบนเนอร์โลโก้ + การ์ดแยกเรื่อง (ที่อยู่ / LINE / โทร–อีเมล / โซเชียล)
 * LINE เป็นการ์ดเด่นสุดเพราะเป็นช่องทางหลักที่ลูกค้าใช้จริง
 */
export default async function AboutPage() {
  const override = await getArticleServer("page-about");
  if (override) return <PageOverride article={override} />;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8">
      {/* ── แบนเนอร์โลโก้ ── */}
      <section className="rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-amber-100 px-6 py-10 text-center shadow-sm ring-1 ring-amber-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/about/logo.png" alt={SHOP.name} className="mx-auto block w-60 max-w-full md:w-72" />
        <p className="mt-4 text-sm leading-relaxed text-stone-600 md:text-base">
          ร้านพิมพ์ลายตามสั่ง 🐥 ของขวัญ ของแจก งานอีเวนต์ — <strong className="text-amber-800">ลายของคุณ ให้เราดูแล</strong>
        </p>
      </section>

      {/* ── การ์ดข้อมูล ── */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {/* LINE — ช่องทางหลัก ให้เด่นสุด */}
        <section className="order-first flex flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-amber-100 md:order-none md:row-span-2">
          <h2 className="text-lg font-extrabold text-amber-950">💬 ทัก LINE ร้าน</h2>
          <p className="mt-1 text-xs text-stone-500">ช่องทางหลัก — สอบถาม/ส่งลาย/เช็คคิวงาน แอดมินตอบไวสุดทางนี้</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/line-qr.png" alt="QR เพิ่มเพื่อน LINE ของร้าน" className="mt-4 block h-48 w-48 rounded-xl" />
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#06c755] px-7 py-3 text-sm font-bold text-white shadow transition hover:scale-105 hover:bg-[#05b34c]"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-extrabold text-[#06c755]">
              LINE
            </span>
            เพิ่มเพื่อน
          </a>
          <p className="mt-2 text-[11px] text-stone-400">สแกน QR หรือกดปุ่มจากมือถือได้เลย</p>
        </section>

        {/* ที่อยู่ + เวลาทำการ */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100">
          <h2 className="text-lg font-extrabold text-amber-950">📍 ที่อยู่ร้าน</h2>
          <p className="mt-2 text-sm font-semibold text-stone-500">{SHOP.legalName}</p>
          {SHOP.addressLines.map((l) => (
            <p key={l} className="text-[0.95rem] leading-relaxed text-stone-700">
              {l}
            </p>
          ))}
          <p className="mt-2 text-sm text-stone-500">🕘 {SHOP.hours}</p>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-full bg-sky-100 px-5 py-2.5 text-sm font-bold text-sky-800 transition hover:bg-sky-200"
          >
            🗺️ เปิดใน Google Maps ↗
          </a>
        </section>

        {/* โทร + อีเมล + โซเชียล */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100">
          <h2 className="text-lg font-extrabold text-amber-950">📞 ติดต่อสอบถามข้อมูล</h2>
          <p className="mt-3 text-sm text-stone-500">
            โทร{" "}
            <a
              href={`tel:+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`}
              className="text-base font-bold text-stone-800 hover:text-amber-600 hover:underline"
            >
              {SHOP.phone}
            </a>{" "}
            <span className="text-xs text-stone-400">(admin)</span>
          </p>
          <p className="mt-2 text-sm text-stone-500">
            Email{" "}
            <a href={`mailto:${SHOP_EMAIL}`} className="font-bold text-sky-600 hover:underline">
              {SHOP_EMAIL}
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-stone-600 transition hover:bg-amber-100 hover:text-amber-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.icon} alt="" className="h-4 w-4 rounded-[3px]" />
                {s.name}
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* ── CTA ── */}
      <section className="mt-8 rounded-[2rem] bg-gradient-to-r from-sky-100 to-amber-100 p-8 text-center">
        <p className="text-lg font-extrabold text-stone-800">พร้อมเริ่มงานพิมพ์ของคุณแล้วหรือยัง? 🎨</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/products"
            className="rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-amber-500"
          >
            🛍️ ดูสินค้าทั้งหมด
          </Link>
          <Link
            href="/how-to-order"
            className="rounded-full bg-white/80 px-7 py-3 text-sm font-bold text-amber-900 shadow transition hover:scale-105 hover:bg-white"
          >
            📖 วิธีสั่งซื้อ
          </Link>
        </div>
      </section>
    </div>
  );
}

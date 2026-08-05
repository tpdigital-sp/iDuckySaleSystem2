import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/shop-info";
import { LINE_URL } from "@/components/LineButton";

export const metadata: Metadata = {
  title: "เกี่ยวกับเรา",
  description: `รู้จัก ${SHOP.name} — ที่อยู่ร้าน ช่องทางติดต่อ โทรศัพท์ LINE และอีเมล`,
};

/** อีเมลติดต่อร้าน (ตามหน้าเกี่ยวกับเราของเว็บหลัก) */
const SHOP_EMAIL = "iduckyshop03@gmail.com";

/**
 * 🦆 เกี่ยวกับเรา — โครงเดียวกับหน้า aboutus ของเว็บหลัก iduckyofficial
 * โลโก้ → ที่อยู่ → ติดต่อสอบถาม (โทร + LINE QR + ปุ่มเพิ่มเพื่อน) → อีเมล
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      {/* โลโก้ร้าน */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/about/logo.png" alt={SHOP.name} className="mx-auto block w-64 max-w-full md:w-80" />

      {/* ที่อยู่ */}
      <div className="mt-8 text-center">
        <p className="text-sm font-semibold text-stone-500">{SHOP.legalName}</p>
        {SHOP.addressLines.map((l) => (
          <p key={l} className="mt-1 text-base leading-relaxed text-stone-700">
            {l}
          </p>
        ))}
        <p className="mt-1 text-sm text-stone-500">เวลาทำการ : {SHOP.hours}</p>
      </div>

      <hr className="my-8 border-amber-100" />

      {/* ติดต่อสอบถาม */}
      <section className="text-center">
        <h1 className="text-xl font-extrabold text-amber-950 md:text-2xl">ติดต่อสอบถามข้อมูล</h1>

        <p className="mt-4 text-lg font-semibold text-stone-700">
          📞{" "}
          <a href={`tel:+66${SHOP.phone.replace(/\D/g, "").replace(/^0/, "")}`} className="hover:text-amber-600 hover:underline">
            {SHOP.phone}
          </a>{" "}
          <span className="text-sm font-normal text-stone-400">(admin)</span>
        </p>

        {/* LINE QR + ปุ่มเพิ่มเพื่อน — ทั้งคู่พาไปบัญชีเดียวกัน */}
        <div className="mx-auto mt-6 w-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/line-qr.png" alt="QR เพิ่มเพื่อน LINE ของร้าน" className="mx-auto block h-52 w-52" />
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#06c755] px-6 py-3 text-sm font-bold text-white shadow transition hover:scale-105 hover:bg-[#05b34c]"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-extrabold text-[#06c755]">
              LINE
            </span>
            เพิ่มเพื่อน
          </a>
          <p className="mt-2 text-[11px] text-stone-400">สแกน QR หรือกดปุ่มจากมือถือได้เลย</p>
        </div>
      </section>

      <hr className="my-8 border-amber-100" />

      {/* อีเมล */}
      <p className="text-center text-base font-semibold text-stone-700">
        Email :{" "}
        <a href={`mailto:${SHOP_EMAIL}`} className="font-bold text-sky-600 hover:underline">
          {SHOP_EMAIL}
        </a>
      </p>

      {/* ชวนไปช้อปต่อ */}
      <div className="mt-10 text-center">
        <Link
          href="/products"
          className="inline-block rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-amber-500"
        >
          🛍️ ดูสินค้าทั้งหมดของเรา →
        </Link>
      </div>
    </div>
  );
}

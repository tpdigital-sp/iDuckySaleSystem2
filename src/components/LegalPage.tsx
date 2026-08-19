import Link from "next/link";
import { SHOP } from "@/lib/shop-info";

/** วันที่ปรับปรุงเอกสารล่าสุด — แก้ที่นี่ที่เดียวเมื่อแก้เนื้อหานโยบาย */
export const LEGAL_UPDATED = "19 สิงหาคม 2569";

/** อีเมลติดต่อร้าน (ชุดเดียวกับหน้าเกี่ยวกับเรา) */
export const SHOP_EMAIL = "iduckyshop03@gmail.com";

/** หัวข้อหนึ่งบล็อกในหน้าเอกสาร — เลขข้อ + เนื้อหา */
export function LegalSection({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100">
      <h2 className="flex items-baseline gap-2 text-lg font-extrabold text-amber-950">
        <span className="text-sm font-black text-amber-600">{no}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-stone-600">{children}</div>
    </section>
  );
}

/** รายการแบบจุด — ใช้ซ้ำในทุกข้อ */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 marker:text-amber-400">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/**
 * โครงหน้าเอกสารทางกฎหมาย (นโยบายความเป็นส่วนตัว / เงื่อนไขการใช้งาน)
 * หน้าตาเดียวกับหน้าเกี่ยวกับเรา — แบนเนอร์หัวเรื่อง + การ์ดแยกข้อ + ท้ายด้วยช่องทางติดต่อ
 */
export default function LegalPage({
  emoji,
  title,
  lead,
  children,
}: {
  emoji: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <section className="rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-amber-100 px-6 py-8 text-center shadow-sm ring-1 ring-amber-100">
        <p className="text-3xl">{emoji}</p>
        <h1 className="mt-2 text-2xl font-extrabold text-amber-950 md:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone-600">{lead}</p>
        <p className="mt-4 text-xs text-stone-500">
          ปรับปรุงล่าสุด {LEGAL_UPDATED} · ใช้กับเว็บไซต์และบริการของ {SHOP.name}
        </p>
      </section>

      <div className="mt-6 space-y-4">{children}</div>

      <section className="mt-6 rounded-3xl bg-amber-50 p-6 text-center ring-1 ring-amber-100">
        <h2 className="text-base font-extrabold text-amber-950">มีคำถามเรื่องนี้?</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          {SHOP.legalName} · {SHOP.addressLines.join(" ")}
          <br />
          โทร. {SHOP.phone} ({SHOP.hours}) · อีเมล{" "}
          <a href={`mailto:${SHOP_EMAIL}`} className="font-bold text-amber-700 underline-offset-2 hover:underline">
            {SHOP_EMAIL}
          </a>
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          <Link
            href="/about"
            className="rounded-full bg-white px-4 py-2 font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            ช่องทางติดต่อทั้งหมด
          </Link>
          <Link
            href="/how-to-order"
            className="rounded-full bg-white px-4 py-2 font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            วิธีสั่งซื้อ
          </Link>
        </div>
      </section>
    </div>
  );
}

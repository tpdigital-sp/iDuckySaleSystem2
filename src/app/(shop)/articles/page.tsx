import type { Metadata } from "next";
import Link from "next/link";
import { listArticlesServer } from "@/lib/server/articles-server";
import { thaiDate } from "@/lib/articles";
import { SHOP } from "@/lib/shop-info";

export const metadata: Metadata = {
  title: "บทความ",
  description: `บทความ เทคนิค และไอเดียงานพิมพ์จาก ${SHOP.name} — เลือกวัสดุ เตรียมไฟล์ลาย และอีกมากมาย`,
};

// เนื้อหามาจากฐานข้อมูล — ให้หน้าอัปเดตเองโดยไม่ต้อง deploy ใหม่
export const revalidate = 300;

export default async function ArticlesPage() {
  const list = await listArticlesServer();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <h1 className="text-2xl font-extrabold text-amber-950 md:text-3xl">📝 บทความจากร้าน</h1>
      <p className="mt-2 text-sm text-stone-500">เทคนิคเตรียมไฟล์ เลือกวัสดุ และไอเดียงานพิมพ์ — เขียนโดยทีม iDucky</p>

      {list.length === 0 ? (
        <div className="mt-16 text-center">
          <span className="text-6xl">✍️</span>
          <p className="mt-4 font-bold text-stone-600">ยังไม่มีบทความ — กำลังเตรียมเนื้อหาดี ๆ ให้อยู่</p>
          <Link href="/products" className="mt-4 inline-block text-sm font-semibold text-amber-600 hover:underline">
            ← ไปดูสินค้าก่อนเลย
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Link
              key={a.slug}
              href={`/articles/${a.slug}`}
              className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-1 hover:shadow-md"
            >
              {a.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover} alt="" className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className="grid aspect-[16/9] w-full place-items-center bg-gradient-to-br from-sky-100 to-blue-200 text-5xl">
                  📝
                </div>
              )}
              <div className="p-4">
                <p className="text-[11px] font-semibold text-stone-400">
                  {thaiDate(a.createdAt)}
                  {a.tags.length > 0 && <> · {a.tags.slice(0, 3).join(" · ")}</>}
                </p>
                <h2 className="mt-1 line-clamp-2 text-base font-bold leading-snug text-stone-800 transition group-hover:text-amber-700">
                  {a.title}
                </h2>
                {a.excerpt && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-stone-500">{a.excerpt}</p>}
                <span className="mt-3 inline-block text-sm font-semibold text-amber-600">อ่านต่อ →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleServer, listArticlesServer } from "@/lib/server/articles-server";
import { thaiDate } from "@/lib/articles";
import { SHOP, SITE_URL } from "@/lib/shop-info";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticleServer(slug);
  if (!a) return { title: "ไม่พบบทความ" };
  return {
    title: a.title,
    description: a.excerpt || `${a.title} — บทความจาก ${SHOP.name}`,
    openGraph: {
      title: a.title,
      description: a.excerpt,
      type: "article",
      ...(a.cover ? { images: [{ url: a.cover }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const a = await getArticleServer(slug);
  if (!a) notFound();

  const others = (await listArticlesServer()).filter((x) => x.slug !== a.slug).slice(0, 3);

  // JSON-LD ให้ Google เข้าใจว่าเป็นบทความ (SEO/AEO)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt,
    ...(a.cover ? { image: [a.cover] } : {}),
    datePublished: a.createdAt,
    dateModified: a.updatedAt,
    author: { "@type": "Organization", name: a.author || SHOP.name },
    publisher: { "@type": "Organization", name: SHOP.name },
    mainEntityOfPage: `${SITE_URL}/articles/${a.slug}`,
  };

  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-xs text-stone-400">
        <Link href="/articles" className="hover:text-amber-600 hover:underline">
          📝 บทความ
        </Link>{" "}
        / <span className="text-stone-500">{a.title}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-extrabold leading-snug text-amber-950 md:text-3xl">{a.title}</h1>
      <p className="mt-2 text-xs text-stone-400">
        {thaiDate(a.createdAt)}
        {a.author && <> · โดย {a.author}</>}
        {a.tags.length > 0 && (
          <>
            {" · "}
            {a.tags.map((t) => (
              <span key={t} className="mr-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {t}
              </span>
            ))}
          </>
        )}
      </p>

      {a.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.cover} alt={a.title} className="mt-5 w-full rounded-3xl shadow-sm ring-1 ring-amber-100" />
      )}

      {a.excerpt && <p className="mt-5 text-base font-semibold leading-relaxed text-stone-600">{a.excerpt}</p>}

      <div className="mt-6 space-y-8">
        {a.blocks.map((b, i) => (
          <section key={i}>
            {b.heading && <h2 className="text-lg font-extrabold text-stone-800 md:text-xl">{b.heading}</h2>}
            <div className={`mt-3 gap-5 ${b.image ? "md:flex" : ""} ${b.align === "right" ? "md:flex-row-reverse" : ""}`}>
              {b.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image} alt={b.heading} className="mb-3 w-full rounded-2xl ring-1 ring-amber-100 md:mb-0 md:w-2/5 md:self-start" />
              )}
              {/* เก็บบรรทัดตามที่พิมพ์ — คนเขียนกด Enter ตรงไหน หน้าเว็บขึ้นบรรทัดตรงนั้น */}
              <p className="flex-1 whitespace-pre-line text-[0.95rem] leading-relaxed text-stone-600">{b.text}</p>
            </div>
          </section>
        ))}
      </div>

      {/* ชวนไปช้อป */}
      <div className="mt-12 rounded-3xl bg-gradient-to-r from-sky-100 to-amber-100 p-6 text-center">
        <p className="font-bold text-stone-700">อ่านแล้วอยากทำของตัวเองบ้าง? 🐥</p>
        <Link
          href="/products"
          className="mt-3 inline-block rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-white shadow transition hover:scale-105 hover:bg-amber-500"
        >
          🛍️ ดูสินค้าทั้งหมด →
        </Link>
      </div>

      {others.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-extrabold text-amber-950">อ่านต่อ</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/articles/${o.slug}`}
                className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="line-clamp-2 text-sm font-bold text-stone-700 group-hover:text-amber-700">{o.title}</p>
                <p className="mt-1 text-[11px] text-stone-400">{thaiDate(o.createdAt)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

import ArticleHtml from "@/components/ArticleHtml";
import { blocksToHtml, thaiDate, type Article } from "@/lib/articles";

/**
 * หน้าเว็บหลักฉบับที่แอดมินเขียนทับ (จากระบบบทความ slug "page-*")
 * — เรนเดอร์เนื้อหา rich text เต็มหน้า แทนหน้าสำเร็จรูปเดิม
 */
export default function PageOverride({ article }: { article: Article }) {
  const html = article.html || blocksToHtml(article.blocks);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <h1 className="text-2xl font-extrabold leading-snug text-amber-950 md:text-3xl">{article.title}</h1>
      <p className="mt-1 text-xs text-stone-400">อัปเดตล่าสุด {thaiDate(article.updatedAt)}</p>
      {article.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.cover} alt={article.title} className="mt-5 w-full rounded-3xl shadow-sm ring-1 ring-amber-100" />
      )}
      <div className="mt-4">
        <ArticleHtml html={html} />
      </div>
    </div>
  );
}

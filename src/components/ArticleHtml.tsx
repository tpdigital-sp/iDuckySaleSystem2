/**
 * เรนเดอร์เนื้อหาบทความแบบ rich text (HTML ที่กรองแล้วจากตัวเขียนหลังบ้าน)
 * — สไตล์ชุดเดียวกับที่ใช้ในตัวเขียน ให้เห็นตรงกับหน้าเว็บจริง (WYSIWYG)
 */
export const ARTICLE_PROSE =
  "text-[0.95rem] leading-relaxed text-stone-600 " +
  "[&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-amber-950 " +
  "[&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-stone-800 " +
  "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-stone-800 " +
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 " +
  "[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:ring-1 [&_img]:ring-amber-100 " +
  "[&_a]:font-semibold [&_a]:text-sky-600 [&_a]:underline " +
  "[&_strong]:font-bold [&_strong]:text-stone-700 [&_blockquote]:mt-3 [&_blockquote]:border-l-4 " +
  "[&_blockquote]:border-amber-200 [&_blockquote]:pl-3 [&_blockquote]:text-stone-500 " +
  "[&_iframe]:my-4 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-2xl " +
  // ตาราง/ไฮไลต์/ขีดเส้น จาก RichEditor (TipTap) — ไม่มี inline style ต้องให้สไตล์จากตรงนี้
  "[&_table]:mt-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-stone-300 [&_td]:p-2 [&_td]:align-top " +
  "[&_th]:border [&_th]:border-stone-300 [&_th]:bg-stone-50 [&_th]:p-2 [&_th]:text-left [&_th]:font-bold " +
  "[&_mark]:rounded [&_mark]:px-0.5 [&_u]:underline [&_s]:line-through [&_hr]:my-6 [&_hr]:border-stone-200";

export default function ArticleHtml({ html }: { html: string }) {
  // HTML ผ่าน sanitize ฝั่งเซิร์ฟเวอร์ตั้งแต่ตอนบันทึก (ตัด script/on*/javascript:)
  return <div className={ARTICLE_PROSE} dangerouslySetInnerHTML={{ __html: html }} />;
}

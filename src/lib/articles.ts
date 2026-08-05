/**
 * 📝 ระบบบทความ — เขียนจากหลังบ้าน (/admin/articles) แสดงหน้าเว็บ (/articles)
 *
 * เก็บบทความละ 1 แถวในตาราง products (id ขึ้นต้น "__article_" · category "__articles__")
 * — วิธีเดียวกับ __shop_payment__ / __site_nav__: ไม่ต้องสร้างตารางใหม่/รัน SQL
 *   และ fetchProducts กรอง id ที่ขึ้นต้น "__" ออกอยู่แล้ว จึงไม่โผล่เป็นสินค้า
 */

/** 1 ท่อนของบทความ — หัวข้อ + ข้อความ + รูป (โครงเดียวกับเนื้อหาสินค้า ใช้ง่ายเหมือนกัน) */
export interface ArticleBlock {
  heading: string;
  text: string;
  image?: string;
  /** รูปอยู่ซ้ายหรือขวาของข้อความ (จอกว้าง) — ไม่ใส่ = ซ้าย */
  align?: "left" | "right";
}

export interface Article {
  /** ใช้ใน URL: /articles/<slug> — a-z 0-9 ขีดกลาง */
  slug: string;
  title: string;
  /** เกริ่นสั้น ๆ โชว์ในหน้ารวม + meta description */
  excerpt: string;
  /** รูปปก (URL) */
  cover?: string;
  blocks: ArticleBlock[];
  tags: string[];
  /** ยังไม่เผยแพร่ = เห็นเฉพาะหลังบ้าน */
  published: boolean;
  author?: string;
  createdAt: string;
  updatedAt: string;
}

export const ARTICLE_PREFIX = "__article_";
export const ARTICLE_CATEGORY = "__articles__";

export const articleRowId = (slug: string) => `${ARTICLE_PREFIX}${slug}`;

/** slug จากชื่อเรื่อง — ไทยไม่แปลงอักษร ใช้ timestamp กันชนแทน */
export function slugify(title: string): string {
  const latin = title
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[ก-๙]/g, "") // ตัดอักษรไทยออกจาก URL (กันลิงก์เพี้ยนเวลาแชร์)
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return latin || `post-${Date.now().toString(36)}`;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** ล้างข้อมูลจากฐานให้อยู่ในรูปที่ใช้ได้เสมอ */
export function articleOf(raw: Partial<Article> | null | undefined): Article | null {
  if (!raw || !str(raw.slug).trim() || !str(raw.title).trim()) return null;
  return {
    slug: str(raw.slug).trim(),
    title: str(raw.title).trim(),
    excerpt: str(raw.excerpt).trim(),
    cover: str(raw.cover).trim() || undefined,
    blocks: (Array.isArray(raw.blocks) ? raw.blocks : [])
      .filter((b) => b && (str(b.heading).trim() || str(b.text).trim() || str(b.image).trim()))
      .map((b) => ({
        heading: str(b.heading).trim(),
        text: str(b.text),
        image: str(b.image).trim() || undefined,
        align: b.align === "right" ? ("right" as const) : ("left" as const),
      })),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((t) => str(t).trim()).filter(Boolean),
    published: raw.published !== false,
    author: str(raw.author).trim() || undefined,
    createdAt: str(raw.createdAt) || new Date().toISOString(),
    updatedAt: str(raw.updatedAt) || new Date().toISOString(),
  };
}

/** เรียงใหม่สุดก่อน */
export const byNewest = (a: Article, b: Article) => (a.createdAt < b.createdAt ? 1 : -1);

/** วันที่แบบไทยสั้น ๆ "5 ส.ค. 2569" */
export function thaiDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

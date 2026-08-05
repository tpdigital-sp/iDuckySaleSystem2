import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { ARTICLE_CATEGORY, articleOf, byNewest, type Article } from "@/lib/articles";

/**
 * อ่านบทความฝั่งเซิร์ฟเวอร์ (หน้า /articles + generateMetadata)
 * ใช้ anon key — RLS อ่านสาธารณะอยู่แล้ว · เฉพาะที่เผยแพร่เท่านั้น
 */
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export const listArticlesServer = cache(async (): Promise<Article[]> => {
  const sb = serverClient();
  if (!sb) return [];
  const { data, error } = await sb.from("products").select("data").eq("category", ARTICLE_CATEGORY);
  if (error || !data) return [];
  return data
    .map((r) => articleOf((r.data as { article?: Partial<Article> })?.article))
    .filter((a): a is Article => !!a && a.published)
    .sort(byNewest);
});

export const getArticleServer = cache(async (slug: string): Promise<Article | null> => {
  const list = await listArticlesServer();
  return list.find((a) => a.slug === slug) ?? null;
});

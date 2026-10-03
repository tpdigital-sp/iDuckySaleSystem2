import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ChatProduct } from "@/lib/server/chat-answer";

/**
 * 📁 path โฟลเดอร์ "ข้อมูลตอบลูกค้า" (NAS) ของสินค้าในคำตอบบอท — เฉพาะหน้า /admin/chatbot (3 ต.ค. 69)
 * แอดมิน WFH เปิดตาม path ไปหาใบราคา/รูปภาพของสินค้านั้นเอง · แชทลูกค้าหน้าเว็บไม่แนบ
 *
 * ดัชนีมาจาก scripts/answer-folders-index.mjs (เว็บจริงอ่าน /Volumes ไม่ได้) → แถว __answer_folders__ ในตาราง products
 * items: key = id หรือ slug ของสินค้า → path ต่อจาก root
 */
const ROW_ID = "__answer_folders__";
const TTL_MS = 5 * 60_000;

type Index = { root: string; winRoot?: string; items: Record<string, string> };
let cache: { at: number; idx: Index | null } | null = null;

async function loadIndex(): Promise<Index | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.idx;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let idx: Index | null = null;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
    const af = (data?.data as { answerFolders?: Partial<Index> } | null)?.answerFolders;
    if (af?.root && af.items) idx = { root: String(af.root).replace(/\/+$/, ""), winRoot: af.winRoot ? String(af.winRoot).replace(/\\+$/, "") : undefined, items: af.items };
  }
  cache = { at: Date.now(), idx };
  return idx;
}

/** ส่วนท้ายลิงก์หน้าสินค้า (slug หรือ id) — ลิงก์บอทคงอักษรไทยดิบ บางตัวเข้ารหัส % */
function segOf(url: string): string {
  const m = url.match(/\/products\/([^/?#]+)/);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** เติม folder ให้สินค้าที่มีโฟลเดอร์ · ล้มเหลว = คืนรายการเดิม (path เป็นของแถม ไม่ใช่เหตุให้คำตอบพัง) */
export async function withFolders<T extends ChatProduct>(products: T[] | undefined): Promise<T[] | undefined> {
  if (!products?.length) return products;
  const idx = await loadIndex().catch(() => null);
  if (!idx) return products;
  return products.map((p) => {
    const rel = idx.items[segOf(p.url)];
    if (!rel) return p;
    // 🪟 พนักงานใช้ Windows (3 ต.ค. 69) → folderWin เป็นหลัก · folder (Mac) เป็นรอง
    return { ...p, folder: `${idx.root}/${rel}`, ...(idx.winRoot ? { folderWin: `${idx.winRoot}\\${rel.replace(/\//g, "\\")}` } : {}) };
  });
}

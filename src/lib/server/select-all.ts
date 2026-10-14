/**
 * 📚 ดึงทุกแถวเกินเพดาน 1,000 แถวของ Supabase
 *
 * ⚠️ 14 ต.ค. 69 "ค้นหา OD-260911-4363 ไม่เจอ": PostgREST ตัดคำตอบที่ 1,000 แถว (max-rows) เงียบ ๆ ไม่ขึ้น error
 *    ตาราง orders โตถึง 1,175 ใบ → select ทั้งตารางได้แค่ 1,000 ใบใหม่สุด ใบเก่า 175 ใบหายจาก /admin/orders (ป้าย "ทั้งหมด 1000")
 * → คิวรีที่ไม่มีขอบเขต (ทั้งตาราง / กรองกว้าง) ต้องผ่านตัวนี้ ไล่ .range() ทีละหน้าจนหมด
 *
 * build ต้องสร้าง query ใหม่ทุกหน้า (builder ของ supabase-js ใช้ซ้ำไม่ได้) และต้องมี .order() ที่ไม่ซ้ำกัน
 * ไม่งั้นแถวอาจซ้ำ/ตกหล่นระหว่างหน้า — ใส่ .order("id") ปิดท้ายเป็นตัวตัดสินเสมอ
 */
export const PAGE_ROWS = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;

export async function selectAllRows<T>(
  build: (from: number, to: number) => PageResult<T>,
  maxPages = 200
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE_ROWS;
    const { data, error } = await build(from, from + PAGE_ROWS - 1);
    if (error) return { data: out, error };
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE_ROWS) break;
  }
  return { data: out, error: null };
}

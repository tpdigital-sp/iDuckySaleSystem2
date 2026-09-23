import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { getStockDb, STOCK_ITEMS, type StockItem } from "@/lib/server/stock";
import type { Product, ProductOption } from "@/lib/products";

/**
 * 📦 สินค้าใหม่ต้องโผล่ในหน้าคลังสต๊อกเอง — เจ้าของร้านสั่ง 23 ก.ย. 69
 * สร้าง SKU ตัวแทนสินค้าละ 1 ตัว (ผูก 1 ต่อ 1) ให้สินค้าที่ "ยังไม่มีสต๊อกผูกอยู่เลย"
 * เรียกจาก 2 ทาง: ตอนบันทึกสินค้าใหม่ (/api/admin/products) + กวาดซ้ำทุกเช้า (/api/cron/stock-cover)
 * ต้องมี 2 ทางเพราะสินค้าที่สร้างจากสคริปต์ไม่ผ่าน API (ดู scripts/stock-cover-all-products.mjs ที่ใช้กติกาเดียวกัน)
 *
 * ⚠️ ข้ามสินค้าที่ผูกอยู่แล้วทุกแบบ (ตัวสินค้า · ตัวเลือกของมันเอง · คลังตัวเลือกกลาง · วัสดุแฝง) — กันตัดซ้ำ 2 เด้ง
 * SKU ที่สร้างติดธง needsReview ไว้เสมอ = "ระบบสร้างให้ ยังไม่มีคนตรวจ"
 */

/** รหัส SKU จาก id สินค้า — id ยาวเกิน 20 ต้องต่อแฮช ไม่งั้น otheracrylicproducts2-1…5-1 ยุบเป็นรหัสเดียวกันหมด */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0");
}
export function productSkuCode(id: string): string {
  const base = id.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
  return base.length <= 20 ? `P-${base}` : `P-${base.slice(0, 15)}-${shortHash(id)}`;
}

const norm = (s: string | undefined) => String(s || "").toLowerCase().replace(/เเ/g, "แ").replace(/\s+/g, "").replace(/[็่้๊๋์]/g, "");
type Row = { id: string; category?: string | null; data: Product | null };

export type CoverResult = { checked: number; made: { code: string; name: string }[]; tied: { code: string; name: string }[] };

/**
 * กวาดสินค้าที่ยังไม่มีสต๊อก แล้วสร้าง/ผูกให้
 * productId = ทำตัวเดียว (ใช้ตอนบันทึกสินค้าใหม่) · ไม่ส่ง = ทั้งร้าน (cron)
 */
export async function coverStockForProducts(productId?: string): Promise<CoverResult> {
  const out: CoverResult = { checked: 0, made: [], tied: [] };
  const sb = getSupabaseAdmin();
  const db = getStockDb();
  if (!sb || !db) return out;

  const [target, presetRows] = await Promise.all([
    productId
      ? sb.from("products").select("id,category,data").eq("id", productId)
      : sb.from("products").select("id,category,data"),
    sb.from("products").select("id,data").eq("category", "__presets__"),
  ]);
  const rows = (target.data ?? []) as Row[];
  const prods = rows.filter((r) => r.category !== "__presets__" && !/^__/.test(r.id) && r.data?.name && typeof r.data?.price === "number");
  if (!prods.length) return out;

  /** คลังตัวเลือกกลางที่ผูก SKU ไว้แล้ว — สินค้าที่ใช้กลุ่มนี้ถือว่ามีสต๊อกแล้ว */
  const presetLinked = new Set(
    (presetRows.data ?? [])
      .map((r) => r.data as { id?: string; choices?: { stockItemId?: string }[] } | null)
      .filter((p) => p?.id && (p.choices ?? []).some((c) => c.stockItemId))
      .map((p) => p!.id as string)
  );

  const snap = await db.collection(STOCK_ITEMS).get();
  const items = snap.docs.map((d) => d.data() as StockItem);
  const live = items.filter((s) => s.active !== false);
  const codes = new Set(items.map((s) => String(s.code ?? "")).filter(Boolean)); // รวมตัวที่ลบแล้ว — รหัสห้ามซ้ำของเก่า
  const linked = new Set<string>();
  for (const s of live) {
    for (const p of s.productIds ?? []) linked.add(p);
    for (const p of Object.keys(s.bomFor ?? {})) linked.add(p);
  }
  /** SKU เดิมที่ชื่อตรงและยังไม่ถูกผูกกับสินค้าไหน — ผูกตัวเดิมดีกว่าสร้างซ้ำ */
  const freeByName = new Map<string, StockItem>();
  for (const s of live)
    if (!(s.productIds ?? []).length)
      for (const n of [s.name, ...(s.aliases ?? [])]) if (!freeByName.has(norm(n))) freeByName.set(norm(n), s);

  const catName = new Map<string, string>(
    (((rows.find((r) => r.id === "__categories__")?.data ?? null) as { categories?: { id: string; name: string }[] } | null)?.categories ?? [])
      .filter((c) => c?.id && c?.name)
      .map((c) => [c.id, c.name])
  );

  const now = new Date().toISOString();
  for (const r of prods) {
    out.checked++;
    const p = r.data as Product;
    const opts = (p.options ?? []) as ProductOption[];
    const hasOptionLink = opts.some((o) => (o.presetId && presetLinked.has(o.presetId)) || (o.choices ?? []).some((c) => c.stockItemId));
    if (linked.has(r.id) || hasOptionLink) continue;

    const reuse = freeByName.get(norm(p.name));
    if (reuse) {
      await db.collection(STOCK_ITEMS).doc(reuse.id).update({ productIds: [r.id], updatedAt: now });
      freeByName.delete(norm(p.name));
      linked.add(r.id);
      out.tied.push({ code: reuse.code ?? reuse.id, name: p.name });
      continue;
    }
    let code = productSkuCode(r.id);
    for (let n = 2; codes.has(code); n++) code = `${productSkuCode(r.id)}-${n}`;
    codes.add(code);
    const id = `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const family = catName.get(String(p.category ?? "")) ?? p.category ?? undefined;
    const item: StockItem = {
      id,
      name: p.name,
      code,
      unit: "ชิ้น",
      balance: 0,
      productIds: [r.id],
      ...(family ? { family } : {}),
      needsReview: true,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(STOCK_ITEMS).doc(id).set(item);
    linked.add(r.id);
    out.made.push({ code, name: p.name });
  }
  return out;
}

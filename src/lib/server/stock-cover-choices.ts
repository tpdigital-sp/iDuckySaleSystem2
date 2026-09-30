import "server-only";
import { allStockCodes, getStockDb, listStockItems, saveStockItem } from "@/lib/server/stock";
import { applyChoiceCover, planChoiceCover, type PlanItem } from "@/lib/stock-cover-plan";
import type { Product, ProductOption } from "@/lib/products";

/**
 * 📱 ตัวเลือกใหม่ในกลุ่มที่แยกสต๊อกแล้ว → สร้าง SKU + ผูกให้เอง (กติกาอยู่ที่ lib/stock-cover-plan.ts)
 *
 * ทางเข้าเดียว: ตอนบันทึกสินค้า /api/admin/products — coverChoicesInProduct() ทำ "ก่อน" เขียนลงฐาน
 *   จะได้เขียนสินค้าครั้งเดียวพร้อม stockItemId ไม่มีการเขียนซ้อนกับแท็บที่เปิดอยู่ (savedAt ไม่เพี้ยน)
 *   ทำเฉพาะค่าที่ "เพิ่งเพิ่ม" (เทียบกับแถวเดิมในฐาน) — ไม่มี cron กวาด เพราะกวาดแยกไม่ออกว่าช่องว่างไหนตั้งใจเว้น
 *   (สคริปต์ที่เติมตัวเลือกตรง ๆ ต้องใส่ stockItemId เอง หรือให้แอดมินเพิ่มผ่านหน้าแก้ไขสินค้า)
 *
 * ทนการบันทึกทับ: แท็บแก้ไขที่เปิดค้างไม่มี stockItemId ของค่าที่เพิ่งได้ → บันทึกอีกทีลิงก์หาย
 * → รอบถัดไปตัววางแผนเจอ SKU ชื่อเดียวกันลอยอยู่ (ไม่ผูกอะไร) ก็ผูกกลับตัวเดิม ไม่สร้างซ้ำ
 */

export type ChoiceCoverMade = { choice: string; pair?: string; label: string; code: string; name: string; reused: boolean };

/** สินค้ามีตัวเลือกที่ผูก SKU อยู่ไหม — ไม่มี = ไม่ต้องโหลดคลังให้เสียเวลา (เคสมือถือวันนี้ยังเป็นแบบนี้ทุกตัว) */
export function hasSplitChoices(p: Product): boolean {
  return (p.options ?? []).some((o) => !o.presetId && (o.choices ?? []).some((c) => c.stockItemId || (c.stockLinks ?? []).length));
}

/**
 * ค่าไหน "เพิ่งเพิ่ม" — ไม่มีชื่อนี้ในกลุ่มชื่อเดียวกันของเวอร์ชันก่อน (กลุ่มเทียบด้วย label · ชื่อกลุ่มซ้ำในสินค้าเดียวรวมค่ากัน)
 * เปลี่ยนชื่อค่าเดิม = ค่าเดิมยังถือ stockItemId อยู่ ตัววางแผนข้ามให้เอง · คืน null = ไม่มีค่าใหม่สักตัว
 */
export function newChoiceTest(next: ProductOption[], prev: ProductOption[]): ((optionIndex: number, choice: string) => boolean) | null {
  const before = new Map<string, Set<string>>();
  for (const o of prev) {
    const set = before.get(o.label) ?? new Set<string>();
    for (const c of o.choices ?? []) if (c.name?.trim()) set.add(c.name.trim());
    before.set(o.label, set);
  }
  let any = false;
  const fresh = next.map((o) => new Set((o.choices ?? []).map((c) => c.name?.trim()).filter((n): n is string => !!n && !before.get(o.label)?.has(n))));
  for (const f of fresh) if (f.size) any = true;
  if (!any) return null;
  return (i, choice) => fresh[i]?.has(choice.trim()) ?? false;
}

type Done = { item: PlanItem; stockItemId: string; code: string; reused: boolean };

async function makeSkus(plan: PlanItem[]): Promise<Done[]> {
  const done: Done[] = [];
  for (const it of plan) {
    const sku = await saveStockItem(
      it.reuseId
        ? { id: it.reuseId, name: it.name, needsReview: true, ...(it.imageUrl ? { imageUrl: it.imageUrl } : {}) }
        : {
            name: it.name,
            code: it.code,
            aliases: it.aliases,
            needsReview: true, // ระบบสร้างให้ ยังไม่มีคนตรวจ — หน้าคลังโชว์ป้ายรอตรวจ
            unit: it.template.unit,
            family: it.template.family,
            category: it.template.category,
            unitCost: it.template.unitCost,
            reorderPoint: it.template.reorderPoint,
            leadTimeDays: it.template.leadTimeDays,
            part: it.template.part,
            imageUrl: it.imageUrl,
          }
    );
    done.push({ item: it, stockItemId: sku.id, code: sku.code ?? it.code, reused: !!it.reuseId });
  }
  return done;
}

const summarize = (d: Done[]): ChoiceCoverMade[] =>
  d.map((x) => ({ choice: x.item.choice, ...(x.item.pairChoice ? { pair: x.item.pairChoice } : {}), label: x.item.label, code: x.code, name: x.item.name, reused: x.reused }));

/**
 * ทำกับสินค้าที่กำลังจะบันทึก — คืนสินค้าที่ใส่ stockItemId/stockLinks ให้แล้ว (ผู้เรียกเป็นคนเขียนลงฐาน)
 * ล้มตรงไหน (Firestore ล่ม) → คืนสินค้าเดิมไม่แตะ การบันทึกสินค้าต้องไม่ล้มเพราะเรื่องนี้
 */
export async function coverChoicesInProduct(p: Product, prev: Product | undefined): Promise<{ product: Product; made: ChoiceCoverMade[] }> {
  if (!prev || !hasSplitChoices(p) || !getStockDb()) return { product: p, made: [] };
  const isNew = newChoiceTest(p.options ?? [], prev.options ?? []);
  if (!isNew) return { product: p, made: [] }; // ไม่มีค่าใหม่เลย = ไม่ต้องโหลดคลัง
  try {
    const [items, codes] = await Promise.all([listStockItems(), allStockCodes()]);
    const plan = planChoiceCover(p, items, codes, isNew);
    if (!plan.length) return { product: p, made: [] };
    const done = await makeSkus(plan);
    return { product: applyChoiceCover(p, done), made: summarize(done) };
  } catch (e) {
    console.error("[stock-cover-choices] ", (e as Error)?.message);
    return { product: p, made: [] };
  }
}

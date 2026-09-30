import type { Product, ProductOption } from "@/lib/products";
import { normName } from "@/lib/stock-match";

/**
 * 📱 ตัวเลือกใหม่ในกลุ่มที่ "แยกสต๊อกแล้ว" ต้องได้ SKU เอง — เจ้าของร้านถาม 30 ก.ย. 69
 * ("ถ้ามีรุ่นมือถือใหม่เข้ามา จะเพิ่มลง stock ยังไง อยากให้เชื่อมกับสินค้าและเข้า stock เองอัตโนมัติ")
 *
 * หลัก: ถ้ากลุ่มตัวเลือกของสินค้ามี SKU ผูกอยู่แล้วบางค่า (เคยกด ✂️ แยกสต๊อกตามตัวเลือก) แปลว่าของบนชั้นแยกตามกลุ่มนี้
 * → ค่าที่เพิ่มมาใหม่โดยยังไม่มี SKU (iPhone 17) ก็ต้องเป็นของอีกชิ้นเช่นกัน ระบบสร้าง SKU ให้ตามแบบพี่ ๆ ในกลุ่ม
 * แล้วผูกกลับที่ตัวเลือกทันที ไม่ต้องไปกดแยกซ้ำทั้งกลุ่ม
 *
 * รู้จัก 2 แบบเดียวกับปุ่มแยก (api/admin/stock/split):
 *   1) แยกกลุ่มเดียว   — choice.stockItemId              → SKU ใหม่ต่อค่าใหม่ ผูกเป็น stockItemId
 *   2) แยกทุกคู่ 2 กลุ่ม — choice(A).stockLinks when B=b  → SKU ใหม่ต่อคู่ที่ยังไม่มี (ค่าใหม่ในกลุ่ม A หรือ B ก็ได้)
 *
 * ไฟล์นี้เป็นตัว "วางแผน" ล้วน ๆ (ไม่แตะฐานข้อมูล) — ตัวลงมือทำอยู่ที่ lib/server/stock-cover-choices.ts
 * แยกไว้เพื่อให้ทดสอบกติกาได้ด้วย npm run check:stock-cover-choices โดยไม่ต้องต่อ Firestore
 *
 * ⚠️ ไม่แตะ: กลุ่มจากคลังตัวเลือกกลาง (presetId — ผูกที่หน้าผูกคลัง) · ช่องกรอก (display input) · กลุ่มที่ยังไม่เคยแยก
 *   (สินค้าที่มี SKU รวมตัวเดียว = ยังไม่ตัดสินใจว่าจะนับแยกตามอะไร ปล่อยให้คนกดแยกเอง)
 * ⚠️ ทำเฉพาะค่าที่ "เพิ่งเพิ่มใหม่" (isNew — เทียบกับเวอร์ชันก่อนบันทึก) ไม่ใช่ทุกค่าที่ยังไม่มี SKU:
 *   วัดจริง 30 ก.ย. 69 — สินค้าที่แยกแล้ว 74 ตัวมีช่องว่างที่ตั้งใจเว้น 35 ช่อง (ผ้าห่ม/ผ้าขนหนูเลือกคู่เฉพาะบางคู่ ·
 *   LAPTOP BAG มีค่า "-" · พัดพับ "เพิ่มถุงเก็บพัด" ไม่ใช่ของอีกชิ้น) ถ้าเติมให้หมดจะไปทับการตัดสินใจของเจ้าของร้าน
 */

export type PlanLink = { stockItemId: string; per?: number; when?: { label: string; choices: string[] }[] };
export type PlanChoice = { name: string; stockItemId?: string; imageSrc?: string; stockLinks?: PlanLink[] };

/** SKU เท่าที่ตัววางแผนต้องรู้ (ชุดย่อยของ StockItem ฝั่งเซิร์ฟเวอร์) */
export type PlanSku = {
  id: string;
  name: string;
  code?: string;
  aliases?: string[];
  part?: string;
  unit?: string;
  family?: string;
  category?: string;
  unitCost?: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  productIds?: string[];
  bomFor?: Record<string, number>;
  active?: boolean;
};

/** สิ่งที่ต้องสร้าง/ผูก 1 รายการ */
export type PlanItem = {
  optionIndex: number;
  label: string;
  /** ค่าที่ต้องการ SKU (แบบคู่ = ค่าของกลุ่มแรกที่ถือลิงก์) */
  choice: string;
  /** แบบคู่: ค่าของกลุ่มที่ 2 */
  pairChoice?: string;
  pairLabel?: string;
  /** ชื่อ SKU ที่จะตั้ง (ตามแบบพี่ ๆ ในกลุ่ม) */
  name: string;
  /** รหัสที่จะตั้ง (ต่อท้ายจากพี่ ๆ ในกลุ่ม) */
  code: string;
  aliases: string[];
  imageUrl?: string;
  /** SKU เดิมในคลังที่ชื่อตรงและยังลอยอยู่ (ถูกถอดจากการบันทึกทับ) → ผูกกลับ ไม่สร้างซ้ำ */
  reuseId?: string;
  /** ต้นแบบที่ยืมหน่วย/ตระกูล/ทุน/จุดสั่ง */
  template: Pick<PlanSku, "part" | "unit" | "family" | "category" | "unitCost" | "reorderPoint" | "leadTimeDays">;
};

const trim = (s: string | undefined) => String(s ?? "").trim();

/** ตัด "-N" ท้ายรหัส → ฐานรหัสของกลุ่ม ("P-CASE-MAGSAFE-7" → "P-CASE-MAGSAFE") */
export function codeBaseOf(code: string | undefined, fallback: string): string {
  const c = trim(code);
  if (!c) return fallback;
  return c.replace(/-\d+$/, "") || fallback;
}

/** รหัสตั้งต้นจาก id สินค้า (แบบเดียวกับ split route) */
export function productCodeBase(productId: string): string {
  return `P-${productId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase()}`;
}

/**
 * ตั้งชื่อ SKU ตามแบบพี่ ๆ ในกลุ่ม: ถ้าพี่มี part → "<part> <ค่า> (<สินค้า>)" · ไม่มี → "<สินค้า> · <ค่า>"
 * (2 รูปแบบเดียวกับที่ปุ่มแยกสร้าง จะได้เรียงอยู่ด้วยกันในหน้าคลัง)
 */
export function nameForChoice(productName: string, part: string | undefined, choice: string): string {
  return part ? `${part} ${choice} (${productName})` : `${productName} · ${choice}`;
}

/** SKU ที่ยังลอยอยู่ = ไม่ผูกกับสินค้าไหน ไม่เป็นวัสดุแฝง และไม่มีตัวเลือกไหน (ของสินค้านี้) ชี้อยู่ */
function freeSkuByName(items: PlanSku[], referenced: Set<string>): Map<string, PlanSku> {
  const m = new Map<string, PlanSku>();
  for (const s of items) {
    if (s.active === false || (s.productIds ?? []).length || Object.keys(s.bomFor ?? {}).length || referenced.has(s.id)) continue;
    for (const n of [s.name, ...(s.aliases ?? [])]) {
      const k = normName(n);
      if (k && !m.has(k)) m.set(k, s);
    }
  }
  return m;
}

/** กลุ่มที่ตัววางแผนดู: ของสินค้าเอง · เป็นตัวเลือกให้เลือก · มีค่าที่มีชื่อ */
function ownGroups(p: Product): { o: ProductOption; i: number }[] {
  return (p.options ?? [])
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !o.presetId && o.display !== "input" && (o.choices ?? []).some((c) => trim(c.name)));
}

/** ลิงก์แบบ "คู่" = เงื่อนไขเดียว กลุ่มเดียว ค่าเดียว */
function pairWhen(l: PlanLink): { label: string; choice: string } | null {
  const w = l.when ?? [];
  if (w.length !== 1 || w[0].choices.length !== 1) return null;
  return { label: w[0].label, choice: w[0].choices[0] };
}

/**
 * วางแผนว่าสินค้านี้ต้องสร้าง/ผูก SKU ให้ตัวเลือกไหนบ้าง
 * items = SKU ทั้งคลัง (ไว้หาต้นแบบ + ตัวลอยที่ชื่อตรง + กันรหัสซ้ำ) · usedCodes = รหัสทุกตัวรวมที่ลบแล้ว
 */
export function planChoiceCover(
  p: Product,
  items: PlanSku[],
  usedCodes: Set<string>,
  /** ค่านี้เพิ่งเพิ่มใหม่ไหม (เทียบเวอร์ชันก่อนบันทึก) — ไม่ส่ง = ถือว่าทุกค่าที่ยังไม่มี SKU เป็นของใหม่ (ไว้ดูอย่างเดียว/ทดสอบ) */
  isNew: (optionIndex: number, choice: string) => boolean = () => true
): PlanItem[] {
  const out: PlanItem[] = [];
  if (!p?.id || !trim(p.name)) return out;
  const byId = new Map(items.map((s) => [s.id, s]));
  const live = (id: string | undefined) => (id && byId.get(id)?.active !== false ? byId.get(id) : undefined);
  const groups = ownGroups(p);
  const labelOf = new Map(groups.map(({ o, i }) => [o.label, i]));

  // ทุก SKU ที่ตัวเลือกของสินค้านี้ชี้อยู่ — ตัวพวกนี้ไม่ใช่ "ตัวลอย"
  const referenced = new Set<string>();
  for (const { o } of groups)
    for (const c of (o.choices ?? []) as PlanChoice[]) {
      if (c.stockItemId) referenced.add(c.stockItemId);
      for (const l of c.stockLinks ?? []) referenced.add(l.stockItemId);
    }
  const free = freeSkuByName(items, referenced);
  const codes = new Set(usedCodes);
  const nextCode = (base: string) => {
    let n = 0;
    let code = "";
    do code = `${base}-${++n}`;
    while (codes.has(code));
    codes.add(code);
    return code;
  };
  const tplOf = (s: PlanSku | undefined): PlanItem["template"] => ({
    part: s?.part,
    unit: s?.unit,
    family: s?.family,
    category: s?.category,
    unitCost: s?.unitCost,
    reorderPoint: s?.reorderPoint,
    leadTimeDays: s?.leadTimeDays,
  });
  const push = (it: Omit<PlanItem, "reuseId">) => {
    const hit = free.get(normName(it.name));
    if (hit) free.delete(normName(it.name)); // ตัวเดิมใช้ได้ทีเดียว
    out.push({ ...it, ...(hit ? { reuseId: hit.id } : {}) });
  };

  for (const { o, i } of groups) {
    const chs = ((o.choices ?? []) as PlanChoice[]).filter((c) => trim(c.name));
    const mains = chs.filter((c) => live(c.stockItemId));

    // ── แบบ 1: แยกกลุ่มเดียว — มีค่าที่ผูก stockItemId อยู่แล้ว ค่าที่ยังไม่มีอะไรเลย = ต้องได้ SKU
    if (mains.length) {
      const tpl = live(mains[0].stockItemId)!;
      const base = codeBaseOf(tpl.code, productCodeBase(p.id));
      for (const c of chs) {
        if (c.stockItemId || (c.stockLinks ?? []).length) continue; // ผูกอยู่แล้ว (ตัวหลักหรือแบบมีเงื่อนไข) ไม่ยุ่ง
        if (!isNew(i, c.name)) continue; // ช่องว่างเดิมที่คนตั้งใจเว้น ไม่เติมให้
        const name = nameForChoice(p.name, tpl.part, c.name);
        push({ optionIndex: i, label: o.label, choice: c.name, name, code: nextCode(base), aliases: [c.name], imageUrl: c.imageSrc, template: tplOf(tpl) });
      }
      continue;
    }

    // ── แบบ 2: แยกทุกคู่ 2 กลุ่ม — ไม่มีค่าไหนถือ stockItemId แต่มีลิงก์ "เมื่อ <กลุ่ม B> = b" ชี้ SKU ที่ยังอยู่
    const links = chs.flatMap((a) => (a.stockLinks ?? []).filter((l) => live(l.stockItemId)).map((l) => ({ a: a.name, w: pairWhen(l), sku: live(l.stockItemId)! })));
    const pairs = links.filter((x): x is typeof x & { w: NonNullable<typeof x.w> } => !!x.w);
    if (!pairs.length || pairs.length !== links.length) continue; // มีลิงก์แบบอื่นปน (ของเสริม/หลายเงื่อนไข) = ไม่ใช่ตารางคู่ ปล่อยคนดูแลเอง
    const bLabel = pairs[0].w.label;
    if (!pairs.every((x) => x.w.label === bLabel)) continue;
    const bi = labelOf.get(bLabel);
    if (bi === undefined || bi === i) continue;
    const bVals = new Set(pairs.map((x) => x.w.choice));
    if (bVals.size < 2) continue; // ค่าเดียว = ไม่ใช่ตารางคู่ อาจเป็นของเสริมมีเงื่อนไข
    const bChoices = ((groups.find((g) => g.i === bi)!.o.choices ?? []) as PlanChoice[]).filter((c) => trim(c.name));
    const tpl = pairs[0].sku;
    const base = codeBaseOf(tpl.code, productCodeBase(p.id));
    const partOrProduct = tpl.part || p.name;
    const key = (a: string, b: string) => JSON.stringify([a, b]);
    const have = new Set(pairs.map((x) => key(x.a, x.w.choice)));
    // ค่าที่ "ร่วมตาราง" อยู่แล้ว = เคยถูกแยก (มีลิงก์อย่างน้อย 1) — ค่าใหม่จับคู่กับพวกนี้เท่านั้น
    // (ค่าเก่าที่ไม่มีลิงก์เลย เช่น "-" ของ LAPTOP BAG คือตั้งใจไม่นับ ไม่ลากมาเข้าตาราง)
    const aIn = new Set(pairs.map((x) => x.a));
    for (const a of chs)
      for (const b of bChoices) {
        if (have.has(key(a.name, b.name))) continue;
        const aNew = isNew(i, a.name) && !aIn.has(a.name);
        const bNew = isNew(bi, b.name) && !bVals.has(b.name);
        if (!aNew && !bNew) continue; // ช่องว่างเดิมในตาราง = ตั้งใจเว้น
        if (aNew && !bNew && !bVals.has(b.name)) continue; // ค่าใหม่กลุ่มแรก × ค่าที่ไม่เคยนับ → ไม่ต้อง
        if (bNew && !aNew && !aIn.has(a.name)) continue; // ค่าใหม่กลุ่มสอง × ค่าที่ไม่เคยนับ → ไม่ต้อง
        push({
          optionIndex: i,
          label: o.label,
          choice: a.name,
          pairChoice: b.name,
          pairLabel: bLabel,
          name: `${partOrProduct} · ${b.name} · ${a.name}`,
          code: nextCode(base),
          aliases: [`${b.name} ${a.name}`],
          imageUrl: a.imageSrc ?? b.imageSrc,
          template: tplOf(tpl),
        });
      }
  }
  return out;
}

/** เขียน SKU ที่ได้กลับลงตัวเลือกของสินค้า (ไม่แตะฐาน — คืนสินค้าใบใหม่) */
export function applyChoiceCover(p: Product, done: { item: PlanItem; stockItemId: string }[]): Product {
  if (!done.length) return p;
  const options = (p.options ?? []).map((o, i) => {
    const mine = done.filter((d) => d.item.optionIndex === i && d.item.label === o.label);
    if (!mine.length) return o;
    return {
      ...o,
      choices: (o.choices ?? []).map((c) => {
        const forMe = mine.filter((d) => d.item.choice === c.name);
        if (!forMe.length) return c;
        let next = c as PlanChoice;
        for (const d of forMe) {
          next = d.item.pairChoice
            ? { ...next, stockLinks: [...(next.stockLinks ?? []), { stockItemId: d.stockItemId, when: [{ label: d.item.pairLabel!, choices: [d.item.pairChoice] }] }] }
            : { ...next, stockItemId: d.stockItemId };
        }
        return next as typeof c;
      }),
    };
  });
  return { ...p, options };
}

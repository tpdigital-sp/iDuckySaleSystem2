import type { OptionRule, PriceMatrix, Product, ProductOption } from "@/lib/products";

/**
 * ✏️ เปลี่ยนชื่อ "ตัวเลือกในกลุ่ม" ของสินค้าที่บันทึกแล้ว แล้วลาก "ทุกที่ที่อ้างชื่อนั้น" ตามไปด้วย
 *
 * ชื่อตัวเลือกเป็นคีย์ของหลายอย่าง — เปลี่ยนแค่ชื่อแล้วไม่ลากตาม = ราคากลายเป็น 0 / กลุ่มลูกซ่อนหาย / กฎไม่ทำงาน:
 *   · ช่องราคาขั้นบันได (pricing.cells และ priceRates[].pricing.cells คีย์ "a│b" ตาม driverLabels)
 *   · กฎตัวเลือก (rules[].when.choice/choices · rules[].limit.allow)
 *   · เงื่อนไขแสดงกลุ่ม (showWhen / showWhenAlso / showWhenAll / showWhenAny) ของทุกกลุ่ม
 *   · freeWhen · smallQtyFee (ทั้ง when ที่ชี้มา และ freeChoices ของกลุ่มตัวเอง) · defaultBy/labelBy (คีย์ map)
 *   · sizeInput.choice · exclusiveWith ในกลุ่มตัวเอง · imageWhen / stockLinks.when ของทุกตัวเลือก
 * ตรรกะชุดเดียวกับ renameOptionChoice + retargetChoiceName ใน ProductEditor (ฝั่ง draft) — แก้ที่ไหนให้ดูอีกที่ด้วย
 * ใช้จากหน้าต่าง "แยกสต๊อกตามตัวเลือก" (เจ้าของร้านขอแก้ชื่อตรงนั้น 1 ต.ค. 69) · กลุ่มที่ลิงก์คลังกลาง (presetId) ห้ามใช้ — ชื่ออยู่ที่คลัง
 */
export function renameChoiceInProduct(p: Product, optionIndex: number, oldName: string, newName: string): Product {
  const old = oldName.trim();
  const nu = newName.trim();
  const group = p.options?.[optionIndex];
  if (!group || !old || !nu || old === nu) return p;
  const gl = group.label.trim();
  const mine = (l?: string) => (l ?? "").trim() === gl;
  const sub = (v: string) => (v.trim() === old ? nu : v);
  const subList = (list?: string[]) => list?.map(sub);
  const cond = <T extends { label: string; choices: string[] }>(c: T): T => (mine(c?.label) ? { ...c, choices: subList(c.choices) ?? c.choices } : c);
  const subMapKeys = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [sub(k), v]));

  const options: ProductOption[] = (p.options ?? []).map((o, i) => {
    const n: ProductOption = { ...o };
    const own = i === optionIndex;
    if (own) n.choices = o.choices.map((c) => ({ ...c, name: sub(c.name), ...(c.exclusiveWith ? { exclusiveWith: sub(c.exclusiveWith) } : {}) }));
    if (n.showWhen && mine(n.showWhen.label)) n.showWhen = cond(n.showWhen);
    if (n.showWhenAlso && mine(n.showWhenAlso.label)) n.showWhenAlso = cond(n.showWhenAlso);
    if (n.showWhenAll) n.showWhenAll = n.showWhenAll.map(cond);
    if (n.showWhenAny) n.showWhenAny = n.showWhenAny.map(cond);
    if (n.freeWhen) n.freeWhen = { ...n.freeWhen, when: cond(n.freeWhen.when), ...(own ? { choices: subList(n.freeWhen.choices) ?? n.freeWhen.choices } : {}) };
    if (n.smallQtyFee)
      n.smallQtyFee = {
        ...n.smallQtyFee,
        ...(n.smallQtyFee.when ? { when: cond(n.smallQtyFee.when) } : {}),
        ...(own && n.smallQtyFee.freeChoices ? { freeChoices: subList(n.smallQtyFee.freeChoices) } : {}),
      };
    if (n.defaultBy && mine(n.defaultBy.label)) n.defaultBy = { ...n.defaultBy, map: subMapKeys(n.defaultBy.map) };
    if (n.labelBy && mine(n.labelBy.label)) n.labelBy = { ...n.labelBy, map: subMapKeys(n.labelBy.map) };
    if (own && n.sizeInput?.choice?.trim() === old) n.sizeInput = { ...n.sizeInput, choice: nu };
    n.choices = n.choices.map((c) =>
      c.imageWhen || c.stockLinks
        ? {
            ...c,
            ...(c.imageWhen ? { imageWhen: c.imageWhen.map((w) => ({ ...w, when: (w.when ?? []).map(cond) })) } : {}),
            ...(c.stockLinks ? { stockLinks: c.stockLinks.map((l) => (l.when ? { ...l, when: l.when.map(cond) } : l)) } : {}),
          }
        : c,
    );
    return n;
  });

  /** ย้ายคีย์ราคาไปชื่อใหม่ — ดูแกนของตารางนั้น ๆ (เรทที่มีแกนของตัวเองคีย์คนละชุดกับเรทหลัก) */
  const remap = (m?: PriceMatrix): PriceMatrix | undefined => {
    if (!m) return m;
    const di = (m.driverLabels ?? []).findIndex((l) => mine(l));
    if (di < 0) return m;
    return {
      ...m,
      cells: Object.fromEntries(
        Object.entries(m.cells ?? {}).map(([key, v]) => {
          const parts = key.split("│");
          if (parts[di]?.trim() === old) parts[di] = nu;
          return [parts.join("│"), v];
        }),
      ),
    };
  };

  const rules: OptionRule[] | undefined = p.rules?.map((r) => ({
    ...r,
    when: mine(r.when.label) ? { ...r.when, choice: sub(r.when.choice), ...(r.when.choices ? { choices: subList(r.when.choices) } : {}) } : r.when,
    limit: mine(r.limit.label) ? { ...r.limit, allow: subList(r.limit.allow) ?? r.limit.allow } : r.limit,
  }));

  return {
    ...p,
    options,
    ...(p.pricing ? { pricing: remap(p.pricing)! } : {}),
    ...(p.priceRates ? { priceRates: p.priceRates.map((r) => ({ ...r, pricing: remap(r.pricing)! })) } : {}),
    ...(rules ? { rules } : {}),
  };
}

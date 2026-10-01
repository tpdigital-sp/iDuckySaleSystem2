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

/**
 * 🔗 เปลี่ยนชื่อตัวเลือกใน "คลังตัวเลือกกลาง" แล้วลากสินค้าที่ลิงก์คลังนั้นตาม — กลุ่มที่ลิงก์คลังเก็บ choices เป็นสำเนา และ
 * showWhen/กฎ/ราคาในสินค้าอ้างชื่อตัวเลือกนั้นตรง ๆ · เปลี่ยนที่คลังอย่างเดียว = กลุ่มสีตะขอหายจากหน้าร้านเงียบ ๆ
 * (1 ต.ค. 69: เจ้าของร้านย่อชื่อ "G ตะขอสปริงพลาสติก (หลายสี)" → "G (หลายสี)" ที่ /admin/options แล้วสีตะขอ G/H/I หายทั้ง 5 สินค้า)
 * คืนสินค้าเดิม (อ้างอิงเดิม) ถ้าไม่มีกลุ่มที่ลิงก์คลังนี้
 */
export function renamePresetChoiceInProduct(p: Product, presetId: string, oldName: string, newName: string): Product {
  let out = p;
  (p.options ?? []).forEach((o, i) => {
    if (o.presetId === presetId) out = renameChoiceInProduct(out, i, oldName, newName);
  });
  return out;
}

/**
 * คู่ชื่อที่เปลี่ยนระหว่างคลังเวอร์ชันเก่า→ใหม่ — จับคู่ตามลำดับเมื่อจำนวนเท่ากัน · ไม่เท่ากัน (เพิ่ม/ลบ) จับคู่ด้วย "รหัสนำหน้า" (G / AA)
 * คืนเฉพาะคู่ที่ชื่อเปลี่ยนจริงและชื่อเก่าไม่มีในชุดใหม่แล้ว (กันสลับที่กันเฉย ๆ)
 */
export function presetRenames(oldChoices: { name: string }[], newChoices: { name: string }[]): [string, string][] {
  const o = oldChoices.map((c) => c.name.trim()).filter(Boolean);
  const n = newChoices.map((c) => c.name.trim()).filter(Boolean);
  const newSet = new Set(n);
  const pairs: [string, string][] = [];
  if (o.length === n.length) {
    o.forEach((a, i) => {
      if (a !== n[i] && !newSet.has(a)) pairs.push([a, n[i]]);
    });
    return pairs;
  }
  const code = (s: string) => s.split(/\s+/)[0] ?? "";
  const byCode = new Map<string, string[]>();
  for (const b of n) (byCode.get(code(b)) ?? byCode.set(code(b), []).get(code(b))!).push(b);
  for (const a of o) {
    if (newSet.has(a)) continue;
    const cands = byCode.get(code(a)) ?? [];
    if (cands.length === 1) pairs.push([a, cands[0]]);
  }
  return pairs;
}

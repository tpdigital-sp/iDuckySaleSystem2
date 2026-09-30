import { RATE_LABEL, type PriceRate, type ProductOption } from "@/lib/products";

/**
 * 📦 สต๊อกตาม "เรทราคา" — ให้ระบบสต๊อกมองเรทเป็นกลุ่มตัวเลือกเสมือน
 *
 * ทำไม: การ์ดสเปรย์แอลกอฮอล์ 20 ml กับ 40 ml เป็นขวดคนละแบบบนชั้น แต่ 2 แบบนี้ต่างกันที่ "เรทราคา"
 * ไม่ใช่กลุ่มตัวเลือก → กล่องแยกสต๊อกตามตัวเลือกไม่มีให้เลือก (เจ้าของร้านทัก 30 ก.ย. 69)
 *
 * วิธี: เรทถือ stockItemId / stockQtyPer / stockLinks เหมือน choice ทุกประการ (ดู PriceRate ใน products.ts)
 * แล้วทุกจุดที่ไล่กลุ่มตัวเลือก (ตัดสต๊อก · ผูก/ถอด · ภาพรวมการเชื่อม · ลบ SKU · กู้คืน · แยกสต๊อก)
 * ต่อกลุ่มเสมือน `{ label: "เรทราคา", choices: [เรทละ 1 ค่า] }` ที่ลำดับ RATE_OPTION_INDEX (-1) เข้าไป
 *   - ออเดอร์เก็บเรทที่เลือกไว้ที่ sel["เรทราคา"] = rate.label อยู่แล้ว → planStockCuts หาเจอเองโดยไม่ต้องแก้
 *   - เงื่อนไข when ที่อ้าง "เรทราคา" (ฐานตามเรท) ก็ทำงานเองด้วยเหตุผลเดียวกัน
 *   - เรทตัวแทน (id `<เรท public>-dealer`) ที่ไม่ได้ผูกเอง → ยืมของเรท public คู่ของมัน
 *     (ตัวแทนสั่ง = ของชิ้นเดียวกันบนชั้น · จับคู่ด้วย id แบบเดียวกับ dealerTwinRate)
 */
export const RATE_OPTION_INDEX = -1;

export function isRateGroup(label: string | undefined, optionIndex: number | undefined): boolean {
  return optionIndex === RATE_OPTION_INDEX && label === RATE_LABEL;
}

type StockFields = Pick<PriceRate, "stockItemId" | "stockQtyPer" | "stockLinks">;

/** เรทที่ "มีสต๊อกของตัวเอง" หรือยืมจากเรท public คู่ของมัน */
function stockOf(r: PriceRate, all: PriceRate[]): StockFields {
  if (r.stockItemId || r.stockLinks?.length) return { stockItemId: r.stockItemId, stockQtyPer: r.stockQtyPer, stockLinks: r.stockLinks };
  if (r.dealerOnly && r.id.endsWith("-dealer")) {
    const base = all.find((x) => x.id === r.id.slice(0, -"-dealer".length));
    if (base) return { stockItemId: base.stockItemId, stockQtyPer: base.stockQtyPer, stockLinks: base.stockLinks };
  }
  return {};
}

/**
 * กลุ่มตัวเลือกเสมือนของเรทราคา — ไม่มีเรท = null
 * `all=false` (ค่าเริ่มต้น) = เฉพาะเรท public (ไว้ให้หน้าจอผูก/แยก) · `all=true` = รวมเรทตัวแทนที่ยืมลิงก์แล้ว (ไว้ตัดสต๊อก)
 */
export function rateStockOption(rates: PriceRate[] | undefined, all = false): ProductOption | null {
  const rs = (rates ?? []).filter((r) => r?.label);
  if (!rs.length) return null;
  const choices = rs
    .filter((r) => all || !r.dealerOnly)
    .map((r) => {
      const s = stockOf(r, rs);
      return {
        name: r.label,
        ...(r.imageSrc ? { imageSrc: r.imageSrc } : {}),
        ...(s.stockItemId ? { stockItemId: s.stockItemId } : {}),
        ...(s.stockQtyPer ? { stockQtyPer: s.stockQtyPer } : {}),
        ...(s.stockLinks?.length ? { stockLinks: s.stockLinks } : {}),
      };
    });
  return { label: RATE_LABEL, choices } as ProductOption;
}

/**
 * ออเดอร์ที่ sel ไม่มี "เรทราคา" ทั้งที่สินค้ามีหลายเรท (ตะกร้าถอดเรทตัวแทนออกตอนปิดโหมดตัวแทน ฯลฯ)
 * = ราคาคิดจากเรทแรกอยู่แล้ว (activeRate fallback) → สต๊อกก็ต้องตัดของเรทแรกเหมือนกัน ไม่ใช่ไม่ตัดเลย
 * (เรทแรกเป็นเรทตัวแทนไม่ได้ — ProductEditor บังคับไว้)
 */
export function withDefaultRate(options: ProductOption[], sel: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!sel || sel[RATE_LABEL]) return sel;
  const first = options.find((o) => o.label === RATE_LABEL)?.choices?.[0]?.name;
  return first ? { ...sel, [RATE_LABEL]: first } : sel;
}

/** ตัวเลือกจริง + กลุ่มเรทเสมือนต่อท้าย (ไว้ส่งให้ planStockCuts) */
export function optionsWithRates(options: ProductOption[], rates: PriceRate[] | undefined): ProductOption[] {
  const r = rateStockOption(rates, true);
  return r ? [...options, r] : options;
}

/**
 * เขียนค่าสต๊อกกลับลงเรท — รับฟังก์ชันแปลง choice (แบบเดียวกับที่ใช้กับ o.choices) แล้วแมปผลกลับตาม label
 * แตะเฉพาะ 3 คีย์สต๊อก คีย์อื่นของเรท (pricing/minQty/…) คงเดิม · เรทที่ไม่อยู่ในผลลัพธ์ (ตัวแทน) ไม่แตะ
 */
export function writeRateStock(rates: PriceRate[], map: (choices: ProductOption["choices"]) => ProductOption["choices"]): PriceRate[] {
  const vo = rateStockOption(rates);
  if (!vo) return rates;
  const out = new Map((map(vo.choices) ?? []).map((c) => [c.name, c]));
  return rates.map((r) => {
    const c = out.get(r.label);
    if (!c) return r; // เรทตัวแทนไม่อยู่ในกลุ่มเสมือน → ไม่แตะ (ยืมของเรท public ตอนตัดอยู่แล้ว)
    const { stockItemId: _a, stockQtyPer: _b, stockLinks: _c, ...rest } = r;
    return {
      ...rest,
      ...(c.stockItemId ? { stockItemId: c.stockItemId } : {}),
      ...(c.stockQtyPer ? { stockQtyPer: c.stockQtyPer } : {}),
      ...(c.stockLinks?.length ? { stockLinks: c.stockLinks } : {}),
    } as PriceRate;
  });
}

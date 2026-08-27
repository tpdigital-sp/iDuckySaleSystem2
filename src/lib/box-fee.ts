/**
 * 📦 ค่ากล่อง/ค่าแพ็คอัตโนมัติ (บวกให้เองในตะกร้า)
 *
 * เช่น "งานโปสเตอร์ หรือ งานขนาด A3 = ค่ากล่องกันกระแทก +30 บาท"
 * ⚠️ คิด "ครั้งเดียวต่อออเดอร์" ต่อกติกา — หลายรายการเข้าเงื่อนไขก็ส่งกล่องเดียวกัน ไม่บวกซ้ำ
 * ลูกค้าเห็นเป็นแถบห้อยใต้รายการแรกที่เข้าเงื่อนไข (สไตล์ร้านค้าออนไลน์) รายการอื่นที่เข้าเงื่อนไข
 * มีป้ายบอกว่า "ใช้กล่องเดียวกัน ไม่คิดเพิ่ม" — ไม่ใช่ยอดโผล่มาเฉย ๆ ที่ยอดรวม
 *
 * เก็บตั้งค่าไว้ในแถวตั้งค่าร้าน (__shop_payment__ ฟิลด์ boxFees) — แอดมินแก้เองได้ที่ /admin/settings?tab=box
 *
 * ⚠️ ไฟล์นี้ตั้งใจไม่ใส่ "use client" เพราะฝั่งเซิร์ฟเวอร์ต้องคิดค่ากล่องใหม่เองตอนสร้างออเดอร์
 *    (เชื่อค่าที่หน้าเว็บส่งมาไม่ได้ — วิธีเดียวกับส่วนลดระดับสมาชิก/คูปอง/ของแถม)
 */

export interface BoxFee {
  id: string;
  /** ชื่อที่ลูกค้าเห็น เช่น "ค่ากล่องกันกระแทก" */
  name: string;
  /** คำอธิบายสั้น ๆ ใต้ชื่อ เช่น "งานขนาด A3 ส่งในกล่องแข็ง กันหักกันยับ" */
  note?: string;
  /** จำนวนเงินต่อ 1 กล่อง (บาท) */
  amount: number;
  /**
   * 1 กล่องใส่ได้กี่ชิ้น — นับจำนวนรวมของทุกรายการที่เข้าเงื่อนไขทั้งออเดอร์ เกินคิดกล่องเพิ่ม (ปัดขึ้น)
   * 0/ไม่ตั้ง = กล่องเดียวต่อออเดอร์เสมอ ไม่ว่าจะสั่งกี่ชิ้นกี่รายการ
   */
  perQty?: number;

  /** หมวดสินค้าที่เข้าเงื่อนไข */
  categories?: string[];
  /** สินค้าเฉพาะตัวที่เข้าเงื่อนไข (เช่น POSTER ที่อยู่ปนหมวดป้าย) */
  productIds?: string[];
  /** สินค้าที่ไม่คิดค่ากล่อง แม้จะเข้าเงื่อนไขข้ออื่น */
  excludeIds?: string[];

  /**
   * กลุ่มตัวเลือกที่ให้ระบบอ่านค่า เช่น ["ขนาด", "แนวกระดาษ"] — ต้องตรงชื่อกลุ่มเป๊ะ ๆ
   * ⚠️ เว้นว่าง = อ่านทุกกลุ่ม ซึ่งชนคำง่ายมาก (เช่น CASE AIRPODS มีสีเคสชื่อ "A3 ดำแข็ง"
   *    และเสื้อมีขนาดสกรีน "ไม่เกิน A4 / A3" — ทั้งคู่ไม่ควรโดนค่ากล่อง)
   */
  optionGroups?: string[];
  /** คำที่ถือว่าเข้าเงื่อนไข เช่น ["A3"] (ละติน/ตัวเลขเทียบแบบคำเดี่ยว · ไทยเทียบแบบมีคำนี้อยู่) */
  keywords?: string[];
  /** true = ต้องเข้าทั้ง "สินค้า/หมวด" และ "ตัวเลือก" · ไม่ตั้ง = อย่างใดอย่างหนึ่งก็พอ */
  matchAll?: boolean;

  /** ปิดชั่วคราวโดยไม่ต้องลบทิ้ง */
  active?: boolean;
}

/** ค่ากล่อง 1 กติกาที่คิดกับออเดอร์นี้ (ครั้งเดียวต่อออเดอร์) */
export interface OrderBoxFee {
  fee: BoxFee;
  /** คิดกี่กล่อง (perQty นับจำนวนรวมของทุกรายการที่เข้าเงื่อนไข · ไม่ตั้ง = 1) */
  boxes: number;
  /** ยอดรวมของกติกานี้ (บาท) */
  amount: number;
  /** ตำแหน่ง (index) ของรายการที่เข้าเงื่อนไข ในลิสต์ที่ส่งเข้ามา — ตัวแรกคือตัวที่แขวนป้ายราคา */
  matched: number[];
}

/** รายการในตะกร้า/ออเดอร์ที่เอามาเช็คเงื่อนไข */
export interface BoxFeeTarget {
  productId: string;
  /** หมวดของสินค้า (ตะกร้าดึงจากแคตตาล็อก · เซิร์ฟเวอร์ดึงจากตาราง products) */
  category?: string;
  selections: Record<string, string>;
  qty: number;
}

/** ต่อท้าย productId ของบรรทัดค่ากล่องในออเดอร์ — ไม่ไปตัดสต๊อก และคัดทิ้งง่ายตอนคิดใหม่ */
export const BOX_FEE_SUFFIX = "#boxfee";

/**
 * กติกาเริ่มต้น (ใช้ทันทีถ้าแอดมินยังไม่เคยตั้งค่า)
 * โปสเตอร์ + งานขนาด A3 = ค่ากล่อง 30 บาท "ต่อออเดอร์" (ใบเดียว ไม่ว่ากี่รายการ)
 */
export const DEFAULT_BOX_FEES: BoxFee[] = [
  {
    id: "box-a3",
    name: "ค่ากล่องกันกระแทก",
    note: "งานโปสเตอร์/ขนาด A3 ส่งในกล่องแข็ง กันหักกันยับระหว่างทาง",
    amount: 30,
    productIds: ["poster-a3", "uv-2"],
    optionGroups: ["ขนาด", "ขนาดกระดาษ", "แนวกระดาษ", "ขนาดงาน"],
    keywords: ["A3"],
    active: true,
  },
];

/** กติกาที่เปิดใช้อยู่และตั้งครบ (ชื่อ + ยอดเงิน) */
export function activeBoxFees(fees: BoxFee[] | null | undefined): BoxFee[] {
  return (fees ?? []).filter((f) => f?.id && f.name?.trim() && Number(f.amount) > 0 && f.active !== false);
}

/**
 * ค่าตัวเลือกนี้มีคำที่มองหาไหม
 * - คำละติน/ตัวเลข (A3) ต้องยืนเดี่ยว ๆ ไม่ใช่ส่วนหนึ่งของคำอื่น (A30 · XA3 ไม่นับ)
 * - คำไทยเทียบแบบ "มีคำนี้อยู่" เพราะภาษาไทยไม่มีช่องว่างคั่นคำ
 */
function hasKeyword(value: string, keyword: string): boolean {
  const v = String(value ?? "").trim();
  const k = keyword.trim();
  if (!v || !k) return false;
  if (/^[A-Za-z0-9.+-]+$/.test(k)) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i").test(v);
  }
  return v.toLowerCase().includes(k.toLowerCase());
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** รายการนี้เข้าเงื่อนไขค่ากล่องก้อนนี้ไหม */
export function boxFeeMatches(fee: BoxFee, line: BoxFeeTarget): boolean {
  if ((fee.excludeIds ?? []).includes(line.productId)) return false;

  const cats = (fee.categories ?? []).filter(Boolean);
  const ids = (fee.productIds ?? []).filter(Boolean);
  const kws = (fee.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  // ไม่ได้ตั้งเงื่อนไขอะไรเลย = ไม่คิด (กันเผลอบวกค่ากล่องทั้งร้าน)
  if (cats.length === 0 && ids.length === 0 && kws.length === 0) return false;

  const scoped = cats.length > 0 || ids.length > 0;
  const byProduct = ids.includes(line.productId) || (!!line.category && cats.includes(line.category));

  const groups = (fee.optionGroups ?? []).map((g) => g.trim()).filter(Boolean);
  const byOption =
    kws.length > 0 &&
    Object.entries(line.selections ?? {}).some(([label, value]) => {
      if (groups.length > 0 && !groups.some((g) => same(g, label))) return false;
      return kws.some((k) => hasKeyword(value, k));
    });

  if (fee.matchAll) return (!scoped || byProduct) && (kws.length === 0 || byOption);
  return byProduct || byOption;
}

/**
 * ค่ากล่องของ "ทั้งออเดอร์" — คิดกติกาละครั้งเดียว ไม่ว่ากี่รายการเข้าเงื่อนไข
 * (ตะกร้าส่งเฉพาะบรรทัดที่ลูกค้าติ๊กสั่งรอบนี้ ให้ตรงกับยอดที่เก็บจริง)
 */
export function orderBoxFees(lines: BoxFeeTarget[], fees: BoxFee[] | null | undefined): OrderBoxFee[] {
  return activeBoxFees(fees)
    .map((fee) => {
      const matched: number[] = [];
      let qty = 0;
      lines.forEach((l, i) => {
        if (!boxFeeMatches(fee, l)) return;
        matched.push(i);
        qty += Math.max(1, Math.floor(Number(l.qty) || 1));
      });
      if (matched.length === 0) return null;
      const per = Math.max(0, Math.floor(Number(fee.perQty) || 0));
      const boxes = per > 0 ? Math.ceil(qty / per) : 1;
      return { fee, boxes, amount: boxes * Math.max(0, Math.round(Number(fee.amount) || 0)), matched };
    })
    .filter((x): x is OrderBoxFee => x !== null);
}

/** ยอดรวมค่ากล่อง (บาท) */
export function boxFeeTotal(lines: OrderBoxFee[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/** ชื่อบรรทัดค่ากล่องในออเดอร์/ใบเสร็จ */
export function boxFeeItemName(fee: BoxFee): string {
  return `📦 ${fee.name}`.trim();
}

/** บรรทัดนี้เป็นค่ากล่องที่ระบบใส่ให้เอง (ไม่ใช่สินค้าจริง) */
export function isBoxFeeItem(productId: string): boolean {
  return String(productId ?? "").endsWith(BOX_FEE_SUFFIX);
}

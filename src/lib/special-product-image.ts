/**
 * 🖼 ภาพของ "รายการพิเศษ" (productId "special-item") — ยืมภาพปกจากสินค้าในร้าน
 *
 * รายการพิเศษไม่ได้ผูกสินค้า และคลังสินค้าพิเศษไม่มีรูป → แถวรายการในหน้าออเดอร์เป็นกรอบ 🖼️ เปล่า
 * จนกว่าจะมีแบบ/ลายลูกค้า (เจ้าของร้านสั่ง 17 ก.ย. 69 · OD-260917-6158 "Card Holder (สายสี)")
 * ชื่อรายการพิเศษมาจากระบบเก่า ตรงกับชื่อสินค้าร้านเป๊ะแค่ ~6% (วัดจริง 10/165) จึง "ไม่เดาอัตโนมัติ"
 * — ภาพผิดสินค้าทำให้ฝ่ายผลิตเข้าใจผิดได้ · ร้านเลือกคู่เองครั้งเดียวต่อรายการที่ /admin/special-products
 * (SpecialProduct.imageProductId) ตัวเดาด้านล่างใช้แค่ "แนะนำ" ให้กดรับในหน้านั้น
 */

export interface SpecialProduct {
  name: string;
  detail: string;
  /** id สินค้าในร้านที่ให้ยืมภาพปก (ไม่มี = ไม่มีภาพ) */
  imageProductId?: string;
}

/** ชื่อแบบเทียบกัน — ตัวเล็ก ตัดช่องว่างซ้ำ (แอดมินพิมพ์เว้นวรรคไม่เท่ากัน) */
const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * "หัวชื่อ" — ส่วนหน้า "(" · "//" · "/" · "+" · ตัวเลข · คำว่า จำนวน/ขนาด = ชนิดงาน ไม่รวมสเปคที่แอดมินเติมเองทีหลัง
 * เช่น "แผ่นอะคลิลิค (ความหนา 5 มิล) 2 ชิ้น / 1 ลาย" กับแม่แบบ "แผ่นอะคลิลิค ชิ้น / ลาย" → "แผ่นอะคลิลิค" ทั้งคู่
 */
export const specialNameHead = (s: string) =>
  nameKey(nameKey(s).split(/[(/+\d]|จำนวน|ขนาด| ชิ้น| เซ็ต| หลา/)[0] ?? "");

/**
 * สินค้าที่ให้ยืมภาพของรายการพิเศษชื่อนี้ (ใบเก่า/รายการที่พิมพ์ชื่อเอง — รายการใหม่จำ picProductId ไว้กับตัวแล้ว)
 * 1) ชื่อตรงเป๊ะ 2) ชื่อรายการ "ขึ้นต้นด้วย" ชื่อในคลัง (ยาวสุด = เจาะจงสุด)
 * 3) หัวชื่อตรงกัน และ "ทุกแม่แบบที่หัวชื่อนี้ชี้สินค้าตัวเดียวกัน" — ชี้คนละตัว (เช่น เคสคนละรุ่น) = ไม่เดา
 * วัดจริง 17 ก.ย. 69: ข้อ 1-2 จับได้แค่ 69/193 รายการ เพราะแอดมินแก้ชื่อต่อจากแม่แบบเกือบทุกครั้ง
 */
export function specialImageProductId(list: SpecialProduct[], itemName: string): string | undefined {
  const key = nameKey(itemName);
  if (!key) return undefined;
  let best: SpecialProduct | undefined;
  for (const sp of list) {
    if (!sp.imageProductId) continue;
    const k = nameKey(sp.name);
    if (!k) continue;
    if (k === key) return sp.imageProductId;
    if (key.startsWith(k) && k.length >= 6 && (!best || k.length > nameKey(best.name).length)) best = sp;
  }
  if (best) return best.imageProductId;
  const head = specialNameHead(itemName);
  if (head.length < 4) return undefined;
  const sameHead = list.filter((sp) => specialNameHead(sp.name) === head);
  const ids = new Set(sameHead.map((sp) => sp.imageProductId ?? ""));
  // แม่แบบหัวชื่อเดียวกันที่ยังไม่ผูก (id ว่าง) ก็นับเป็น "ไม่เป็นเอกฉันท์" — รอร้านผูกให้ครบก่อน
  return ids.size === 1 ? [...ids][0] || undefined : undefined;
}

/** ตัวอักษร/ตัวเลขล้วน (ไทย+อังกฤษ) — ไว้เทียบ "Card Holder" กับ id "cardholder-white" */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g, "");

/** ความยาวช่วงตัวอักษรที่ซ้ำกันติดกันยาวสุด */
function commonRun(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * เดาสินค้าที่น่าจะใช่ของรายการพิเศษ — ใช้ "แนะนำ" ในหน้าคลังเท่านั้น (ต้องมีคนกดรับ)
 * เทียบชื่อรายการ (ส่วนหน้า "(" / "//") กับ ชื่อ · id · slug ของสินค้า · ซ้ำกันไม่ถึง 5 ตัวอักษร/ไม่ถึงครึ่งชื่อ = ไม่แนะนำ
 */
export function suggestImageProduct<T extends { id: string; name: string; slug?: string }>(
  specialName: string,
  products: T[]
): T | undefined {
  const head = squash(specialName.split(/\(|\/\//)[0]);
  const full = squash(specialName);
  if (full.length < 3) return undefined;
  let best: { p: T; score: number } | undefined;
  for (const p of products) {
    // id สั้น ๆ แบบ "1-2" ห้ามเอามาเทียบ — เคยทำให้ "iPhone12 …" ได้สินค้า id 1-2 (ซ้ำ "12" ทั้ง id + โบนัส)
    const keys = [p.name, p.id, p.slug ?? ""].map(squash).filter((k) => k.length >= 4);
    let score = 0;
    for (const k of keys) {
      // ชื่อสินค้าทั้งชื่ออยู่ในชื่อรายการ = น้ำหนักเต็ม + โบนัส (กันสินค้าชื่อยาวที่บังเอิญซ้ำช่วงเดียว)
      const run = Math.max(commonRun(head, k), commonRun(full, k));
      // ซ้ำแค่คำสั้น ๆ ในชื่อยาว (เช่น "กล่อง…" กับ "กล่องดินสอ…") = ไม่นับ ต้องซ้ำเกินครึ่งของชื่อสินค้า หรือเกินครึ่งของชื่อรายการ
      // (เทียบกับ "ฝั่งที่สั้นกว่า" ไม่พอ — "iPhone12 … เคส PVC" เคยได้ "phone-stand" เพราะคำว่า phone คำเดียว)
      if (run < k.length * 0.55 && run < (head.length || full.length) * 0.55) continue;
      const s = run + (run === k.length ? 3 : 0);
      if (s > score) score = s;
    }
    if (score >= 5 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p;
}

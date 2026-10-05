/**
 * 📋 ดึงรายการตามเอกสาร FlowAccount ลงใบงานที่มีรายการอยู่แล้ว — "อัปเดตทับรายการเดิม" ไม่ใช่ "สร้างรายการใหม่ทั้งชุด"
 *
 * ทำไม (OD-261001-8513 · 5 ต.ค. 69): ลูกค้าสั่งงานเพิ่ม 1 บรรทัดในใบเสนอราคา QT010795 แอดมินวางลิงก์ใน
 * ฟอร์มใบกำกับภาษีแล้วติ๊ก "ดึงรายการในเอกสาร" → เดิมสร้างรายการใหม่ 5 แถวจากเอกสารล้วน ๆ
 * ภาพลายลูกค้า 19 รูป · จำนวนต่อลาย · แบบงานกราฟฟิก 21 รูป · ผลอนุมัติของลูกค้า ในรายการ 1–4 หายหมด
 *
 * ตอนนี้: จับคู่บรรทัดเอกสารกับรายการเดิม แล้วเก็บทุกอย่างของรายการเดิมไว้ เปลี่ยนแค่ ชื่อ/รายละเอียด/จำนวน/ราคา ตามเอกสาร
 *   1. ชื่อ + รายละเอียดตรงกัน (ไม่สนช่องว่าง/ตัวพิมพ์) — แม่นสุด ใช้ได้แม้ลำดับบรรทัดในเอกสารสลับ
 *   2. ชื่อตรง + จำนวน/ราคาเท่าเดิม → ชื่อ + ราคา → ชื่ออย่างเดียว ไล่ตามลำดับ (รายละเอียด/จำนวนถูกแก้ในเอกสาร)
 *   3. ตำแหน่งเดียวกัน — ชื่อถูกแก้ในเอกสารแต่ยังเป็นบรรทัดเดิม (เหลือคู่ที่ยังว่างทั้งสองฝั่งเท่านั้น)
 * บรรทัดเอกสารที่ไม่มีคู่ = รายการใหม่ · รายการเดิมที่ไม่มีในเอกสาร = ถูกเอาออก (เอกสารเป็นตัวจริง) — หน้าจอต้องเตือนก่อน
 */
import type { OrderItem } from "./admin-data";

export interface DocItemLine {
  name: string;
  selections: string;
  qty: number;
  unitPrice: number;
}

export interface DocItemsMerge {
  items: OrderItem[];
  /** บรรทัดเอกสารที่ไปอัปเดตรายการเดิม (เก็บแบบงาน/ลายไว้) */
  kept: number;
  /** บรรทัดเอกสารที่ไม่มีรายการเดิมคู่ = รายการใหม่ */
  added: number;
  /** รายการเดิมที่ไม่มีในเอกสาร → ถูกเอาออก */
  dropped: OrderItem[];
}

const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** รายการนี้มีงานของคนอื่นติดอยู่ (ลาย/แบบงาน/ผลตรวจ) — เอาออกแล้วเสียของ ต้องเตือน */
export function itemHasWork(it: OrderItem): boolean {
  return !!(it.artworkUrls?.length || it.proofs?.length || it.proofUrl || it.reuseArt || it.proofStatus);
}

export function mergeDocItems(prev: OrderItem[], doc: DocItemLine[]): DocItemsMerge {
  const match: (number | undefined)[] = doc.map(() => undefined);
  const used = new Set<number>();
  const pass = (same: (it: OrderItem, d: DocItemLine, oi: number, di: number) => boolean) => {
    doc.forEach((d, di) => {
      if (match[di] !== undefined) return;
      const oi = prev.findIndex((it, i) => !used.has(i) && same(it, d, i, di));
      if (oi < 0) return;
      match[di] = oi;
      used.add(oi);
    });
  };
  pass((it, d) => norm(it.name) === norm(d.name) && norm(it.selections) === norm(d.selections));
  // รายละเอียดถูกแก้ในเอกสาร แต่จำนวน+ราคาเท่าเดิม — กันบรรทัดใหม่ชื่อซ้ำ (โปสการ์ด 4 บรรทัด) แย่งคู่ของบรรทัดเดิมไป
  pass((it, d) => norm(it.name) === norm(d.name) && it.qty === d.qty && it.unitPrice === d.unitPrice);
  pass((it, d) => norm(it.name) === norm(d.name) && it.unitPrice === d.unitPrice);
  pass((it, d) => norm(it.name) === norm(d.name));
  pass((_it, _d, oi, di) => oi === di);

  const items: OrderItem[] = doc.map((d, di) => {
    const oi = match[di];
    if (oi === undefined) return { productId: "special-item", name: d.name, selections: d.selections, qty: d.qty, unitPrice: d.unitPrice };
    const old = prev[oi];
    return {
      ...old,
      // nameWas = ให้เซิร์ฟเวอร์จับคู่กับรายการเดิมได้แม้ชื่อเปลี่ยน (ไม่งั้นติ๊ก/แบบที่เพิ่งทำระหว่างจอค้างหลุด)
      ...(old.name !== d.name ? { name: d.name, nameWas: old.nameWas ?? old.name } : {}),
      selections: d.selections || old.selections,
      qty: d.qty,
      unitPrice: d.unitPrice,
    };
  });
  return {
    items,
    kept: match.filter((m) => m !== undefined).length,
    added: match.filter((m) => m === undefined).length,
    dropped: prev.filter((_it, i) => !used.has(i)),
  };
}

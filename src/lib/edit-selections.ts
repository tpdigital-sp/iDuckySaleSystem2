/**
 * ✏️ "แก้รายละเอียด" ของรายการในออเดอร์ (หน้าออเดอร์แอดมิน)
 *
 * รายการที่สั่งจากหน้าเว็บเก็บตัวเลือก 2 แบบ: `sel` (หัวข้อ→ค่า) กับ `selections` (ข้อความรวมคั่น " · ")
 * ทุกจอ (การ์ดรายการ · ใบงาน · โหมดแพ็ค · แผงตีราคา · หน้าออเดอร์ลูกค้า) อ่าน `sel` ก่อนเสมอ (specEntries)
 * ⚠️ เดิมปุ่มแก้รายละเอียดเขียนแค่ `selections` → บันทึกแล้ว log ขึ้น แต่หน้าจอยังโชว์ค่าเก่าจาก `sel`
 *    (OD-260908-3989 แก้ 3 รอบ 9 ก.ย. 69 ไม่เปลี่ยน) และแผงตีราคายังคิดจากเรทเดิม
 * → ช่องแก้ต้องเปิดจาก `sel` (บรรทัดละหัวข้อ) และตอนบันทึกกางข้อความกลับเป็น `sel` + สร้าง `selections` ใหม่ให้ตรงกัน
 *   หัวข้อของระบบ (ภาพลายที่แนบ/รอเช็คสต๊อก/พิกัดทีมผลิต) ไม่โผล่ในช่องแก้และคงค่าเดิมไว้เสมอ
 * รายการที่ไม่มี `sel` (ออเดอร์เก่า/รายการที่แอดมินเพิ่มเอง) ยังเป็นข้อความล้วนเหมือนเดิม — ไม่แปลงให้ เพราะข้อความอิสระ
 * หลายบรรทัดไม่มีหัวข้อจะยุบรวมกันถ้าจับเป็นหัวข้อ→ค่า
 */
import { PLACEMENT_SPEC_LABEL } from "@/lib/design-templates";
import { ART_BACK_QTY_LABEL, ART_QTY_LABEL, ART_SIZE_LABEL, artQtyFromSel, artSizeByUrl } from "@/lib/products";

/** หัวข้อที่ระบบดูแลเอง — ไม่ให้แก้ในช่องนี้ และคงค่าเดิมไว้ตอนบันทึก */
export const EDIT_SEL_KEEP = ["ภาพลายที่แนบ", "ภาพลายที่แนบ (ด้านหลัง)", "รอเช็คสต๊อก", PLACEMENT_SPEC_LABEL];
/** บรรทัดที่พิมพ์มาโดยไม่มีหัวข้อ ("ด่วน ส่งก่อนศุกร์") — เก็บใต้หัวข้อนี้ให้ sel ยังเป็นหัวข้อ→ค่า */
export const EDIT_SEL_OTHER = "รายละเอียดเพิ่มเติม";

export type SelItem = {
  selections?: string;
  sel?: Record<string, string>;
  artworkUrls?: string[];
  /** รูปด้านหลังของงาน 2 ด้าน (ส่วนย่อยของ artworkUrls) — ใช้จับคู่ "จำนวนแต่ละลาย (ด้านหลัง)" */
  artworkBackUrls?: string[];
  artworkQty?: Record<string, number>;
  artworkSize?: Record<string, { w: number; h: number }>;
};

/** คู่หัวข้อ/ค่าใน sel ที่มีค่าจริง (ค่าว่างถือว่าไม่มี) */
function selEntries(sel?: Record<string, string>): [string, string][] {
  return Object.entries(sel ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "");
}

/** รายการนี้มีตัวเลือกแบบหัวข้อไหม (= ทุกจอโชว์จาก sel ไม่ใช่ข้อความ) */
export function hasStructuredSel(item: SelItem): boolean {
  return selEntries(item.sel).length > 0;
}

/**
 * ข้อความตั้งต้นในช่องแก้ — ให้ตรงกับที่แอดมินเห็นบนการ์ด
 *   มี sel → บรรทัดละ "หัวข้อ: ค่า" (ไม่รวมหัวข้อของระบบ) · ไม่มี → ข้อความเดิมตามที่เก็บ
 */
export function selectionsDraft(item: SelItem): string {
  if (!hasStructuredSel(item)) return item.selections ?? "";
  return selEntries(item.sel)
    .filter(([k]) => !EDIT_SEL_KEEP.includes(k))
    .map(([k, v]) => `${k}: ${v.replace(/\s*\n+\s*/g, " · ")}`) // ค่าที่มีขึ้นบรรทัด (หมายเหตุลูกค้า) ยุบเป็นบรรทัดเดียว — บรรทัดใหม่ = หัวข้อใหม่
    .join("\n");
}

/**
 * กางข้อความในช่องแก้ทีละบรรทัด — "หัวข้อ: ค่า" ตัวแรกของบรรทัดเป็นหัวข้อ ที่เหลือทั้งบรรทัดเป็นค่าตรง ๆ
 * (ค่าอาจมี " · " และ ":" ซ้อนอยู่ เช่น "ลายที่ 1 × 5 ชิ้น · ลายที่ 2 × 3 ชิ้น" หรือ "เรทราคา: พรีเมี่ยม · สกรีน 2 ด้าน"
 *  ถ้าใช้ parseSpecText ของออเดอร์เก่าจะถูกหั่นเป็นหลายหัวข้อ) · บรรทัดไม่มีหัวข้อ → ["", ทั้งบรรทัด]
 */
export function parseDraftLines(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:\n]{1,60}?):\s*(.*)$/);
    if (m && !/^https?$/i.test(m[1].trim())) out.push([m[1].trim(), m[2].trim()]);
    else out.push(["", line]);
  }
  return out;
}

/**
 * ข้อความที่แก้แล้ว → ฟิลด์ที่ต้องทับลงรายการ
 *   ไม่มี sel → แค่ข้อความ (พฤติกรรมเดิม)
 *   มี sel → กางเป็นหัวข้อ→ค่า บรรทัดละหัวข้อ (parseDraftLines · หัวข้อซ้ำต่อค่าด้วย " · " · บรรทัดไม่มีหัวข้อไปอยู่ใต้ EDIT_SEL_OTHER)
 *            + หัวข้อของระบบจากค่าเดิม + สร้าง selections ใหม่แบบเดียวกับตอน checkout (ตัดพิกัดทีมผลิตออก)
 *            + ถ้าแก้ "จำนวนแต่ละลาย"/"ขนาดแต่ละลาย" คิด artworkQty/artworkSize (key = url) ใหม่ให้ตัวเทียบชิ้น/ใบแปะกล่อง
 */
export function applySelectionsDraft(item: SelItem, text: string): Partial<SelItem> {
  const value = text.trim();
  if (!hasStructuredSel(item)) return { selections: value };

  const sel: Record<string, string> = {};
  for (const [k, v] of parseDraftLines(value)) {
    const key = (k || EDIT_SEL_OTHER).trim();
    const val = v.trim();
    if (!val) continue;
    sel[key] = sel[key] ? `${sel[key]} · ${val}` : val;
  }
  for (const [k, v] of selEntries(item.sel)) {
    if (EDIT_SEL_KEEP.includes(k) && !sel[k]) sel[k] = v;
  }

  const selections = Object.entries(sel)
    .filter(([k]) => k !== PLACEMENT_SPEC_LABEL)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  const out: Partial<SelItem> = { selections, sel };
  const urls = item.artworkUrls ?? [];
  const before = item.sel ?? {};
  if ((sel[ART_QTY_LABEL] ?? "") !== (before[ART_QTY_LABEL] ?? "") || (sel[ART_BACK_QTY_LABEL] ?? "") !== (before[ART_BACK_QTY_LABEL] ?? ""))
    out.artworkQty = artQtyFromSel(sel, urls, item.artworkBackUrls ?? []);
  if ((sel[ART_SIZE_LABEL] ?? "") !== (before[ART_SIZE_LABEL] ?? "")) out.artworkSize = artSizeByUrl(sel[ART_SIZE_LABEL], urls);
  return out;
}

/** แก้แล้วต่างจากเดิมไหม (เทียบกับข้อความตั้งต้นของช่องเดียวกัน) */
export function selectionsDraftChanged(item: SelItem, text: string): boolean {
  return text.trim() !== selectionsDraft(item).trim();
}

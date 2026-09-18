import type { ReactNode } from "react";
import { parseSpecText, specLabel } from "@/lib/spec-text";

/**
 * รายละเอียดตัวเลือกของรายการ — "บรรทัดละหัวข้อ · หัวข้อหนาและเข้มกว่าค่าที่เลือก"
 * ใช้ร่วมกันทุกที่ที่โชว์ตัวเลือก (ตะกร้า/ออเดอร์ลูกค้า/ใบเสร็จ/ใบเสนอราคา/หลังบ้าน/ใบงาน)
 * เพื่อให้หน้าตาเหมือนกันทั้งระบบ ไม่ต้องแก้ทีละหน้าเวลาปรับสไตล์
 *
 * ขนาด/สีของ "ค่า" มาจาก className ของที่เรียกใช้ (แต่ละหน้าคุมเอง) — คอมโพเนนต์คุมแค่หัวข้อกับการขึ้นบรรทัด
 */

/** หัวข้อที่ไม่ต้องโชว์ (มีที่แสดงของตัวเองอยู่แล้ว หรือเป็นข้อมูลของทีมผลิต) */
export const SPEC_HIDE = ["ภาพลายที่แนบ", "ภาพลายที่แนบ (ด้านหลัง)", "รอเช็คสต๊อก", "ตำแหน่งลาย (ทีมผลิต)"];

/** ตัวกางข้อความสเปค + ชื่อหัวข้อที่โชว์ ย้ายไป lib/spec-text.ts (ให้ฝั่งเซิร์ฟเวอร์/สคริปต์ใช้ร่วม) — re-export ไว้ให้ที่เรียกเดิมไม่พัง */
export { parseSpecText, specLabel };

/** ตัดค่าที่มีหลายลายให้เป็นบรรทัดละลาย */
export function specValueLines(v: string): string[] {
  return v
    .split(" | ")
    .flatMap((part) => part.split(/\s·\s(?=ลายที่\s)/))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ใช้ตัวเลือกแบบมีหัวข้อก่อน (ออเดอร์ใหม่) — ไม่มีค่อยกางจากข้อความรวม (ออเดอร์เก่า) */
export function specEntries(
  sel?: Record<string, string>,
  text?: string,
  hide: string[] = SPEC_HIDE,
): [string, string][] {
  const entries = Object.entries(sel ?? {}).filter(([k, v]) => v && !hide.includes(k));
  if (entries.length) return entries;
  if (!text?.trim()) return [];
  return parseSpecText(text).filter(([k]) => !hide.includes(k));
}

/** ฐานของหัวข้อไว้จับคู่หน้า/หลัง — "เคลือบ (เฉพาะด้านหน้า)" กับ "เคลือบด้านหลัง" ฐานเดียวกันคือ "เคลือบ" */
const sideBase = (k: string) =>
  k.replace(/\([^)]*\)/g, " ").replace(/ด้านหน้า|ด้านหลัง/g, " ").replace(/\s+/g, " ").trim();

/** บรรทัดที่พูดถึงด้านหลัง — "จำนวนลาย (ด้านหลัง)" · "เคลือบฟอยล์ด้านหลัง" */
const isBackLine = (k: string) => /ด้านหลัง/.test(k);

/**
 * บรรทัดขนาด — สเปคที่ทีมผลิต/ลูกค้ามองหาก่อนเสมอ
 * ตัดวงเล็บทิ้งก่อนเช็ค — "เลือกสีพิเศษของฐาน (ขนาดฐาน 2 ซม. · …)" เป็นบรรทัด "สี" ไม่ใช่บรรทัดขนาด
 */
const isSizeLine = (k: string) => /ขนาด|size/i.test(k.replace(/\([^)]*\)/g, " "));

/**
 * ✂️ บรรทัด "การตัด" — กลุ่มที่ทุกใบต้องเลือก และคำตอบของมันคือ "ชิ้นงานออกมาขนาดไหน"
 * "ไม่ไดคัท (เต็มแผ่น A3)" = สั่งเต็มแผ่น ไม่ใช่ของเสริมที่ไม่ได้ทำ — เป็นบรรทัดขนาดของงานกระดาษ/แบนเนอร์
 * (เจ้าของร้านทัก 15 ก.ย. 69 · OD-260914-2824 — การ์ดไม่มีบรรทัดขนาดเลยเพราะบรรทัดนี้โดนตัดทิ้ง)
 */
const isCutLine = (k: string) => /^(การตัด|ตัดเป็นขนาด|ไดคัท)/.test(bareLabel(k));

/**
 * บรรทัดที่เป็น "ของฐาน" (งานสแตนดี้ = ตัว + ฐาน คนละชิ้นกัน)
 * ตัด "มาตรฐาน" ทิ้งก่อนเช็ค — "ขนาดมาตรฐาน" มีคำว่าฐานติดมาเฉย ๆ ไม่ใช่ฐานสแตนดี้
 */
const isBaseLine = (k: string) => /ฐาน/.test(k.replace(/มาตรฐาน/g, ""));

/** ชื่อหัวข้อที่ตัดวงเล็บหมายเหตุออกแล้ว — "สีอะคริลิค (เรทราคา)" = หัวข้อ "สีอะคริลิค" ที่บังเอิญเป็นตัวคุมราคา */
const bareLabel = (k: string) => k.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

/**
 * 🔻 หัวข้อท้ายการ์ด + ลำดับของมัน — เป็นข้อมูล "การสั่ง/เอาลายมาจากไหน" ไม่ใช่สเปคของชิ้นงาน
 * เจ้าของร้านสั่งลำดับเอง (15 ก.ย. 69): เรทราคา → ใช้ไฟล์เก่า → จำนวนลาย → จำนวนแต่ละลาย → หมายเหตุ (ล่างสุด)
 * เช็คทีละ regex ตามลำดับในลิสต์ — ตัวแรกที่ตรงคือลำดับของหัวข้อนั้น (/^จำนวนลาย/ แคบพอไม่ไปกิน "จำนวนแต่ละลาย")
 *
 * ⚠️ นับเฉพาะหัวข้อ "เรทราคา" ตรง ๆ — วงเล็บ "(เรทราคา)" ที่ห้อยท้ายหัวข้ออื่นเป็นแค่หมายเหตุว่ากลุ่มนี้คุมราคา
 * ตัวบรรทัดยังเป็นสเปคจริงของชิ้นงาน ("สีอะคริลิค (เรทราคา): อะคริลิคใส" ต้องอยู่ต้น ๆ ไม่ใช่ท้ายสุด)
 */
const TAIL_ORDER: RegExp[] = [
  /^เรทราคา/,
  /ไฟล์เก่า|ไฟล์เดิม/, // ♻️ "ใช้ไฟล์เก่า (ลายเดียวกับที่เคยสั่ง)" — มีป้ายของตัวเองข้างชื่อรายการอยู่แล้ว
  /^จำนวนลาย/,
  /^จำนวนแต่ละลาย/,
  /^หมายเหตุ/, // ข้อความที่ลูกค้า/แอดมินพิมพ์เอง — ยาวที่สุด อ่านทีหลังสเปคเสมอ
];

/** อยู่ท้ายการ์ดไหม + ลำดับที่เท่าไร (ไม่ใช่หัวข้อท้าย = -1) */
const tailAt = (k: string) => TAIL_ORDER.findIndex((re) => re.test(bareLabel(k)));

/**
 * บรรทัดวัสดุ/สีของตัวงาน — เจ้าของร้านสั่งให้ขึ้นไปอยู่ต้น ๆ ถัดจากขนาด (15 ก.ย. 69 · OD-260915-6742)
 * "ทำด้วยอะไร สีอะไร" คือสเปคที่อ่านคู่กับขนาดเสมอ ไม่ใช่รายละเอียดปลีกย่อยท้ายการ์ด
 */
const isMaterialLine = (k: string) => /^(สี|วัสดุ|เนื้อ|อะคริลิค|กระดาษ)/.test(bareLabel(k));

/**
 * 🎨 บรรทัด "เฉดสีพิเศษ" — กลุ่มเลือกเฉดที่โผล่ต่อจากตัวเลือก "สีพิเศษ / อะคริลิคพิเศษ" ของงานอะคริลิค
 * "เลือกเฉดสีพิเศษ (ตัวสแตนดี้)" · "เลือกสีพิเศษของฐาน (ขนาดฐาน 7 ซม. · …)" · "เลือกเฉดสีพิเศษ ชิ้นที่ 2" · "เลือกเฉดอะคริลิคพิเศษ"
 * (ชื่อกลุ่มทั้งร้านขึ้นต้น "เลือกเฉด…" หรือ "เลือกสีพิเศษ…" เท่านั้น — สำรวจ 18 ก.ย. 69)
 */
const isShadeLine = (k: string) => /^เลือก(เฉด|สีพิเศษ)/.test(bareLabel(k));

/** ชิ้นส่วนที่บรรทัดพูดถึง — ฐาน / ชิ้นที่ N / ตัวงาน (ไว้จับคู่บรรทัด "สีพิเศษ" กับบรรทัดเฉดของชิ้นเดียวกัน) */
const partOf = (k: string) => {
  if (isBaseLine(k)) return "base";
  const piece = /ชิ้นที่\s*(\d+)/.exec(k);
  return piece ? `piece${piece[1]}` : "body";
};

/**
 * 🎨 บรรทัดตัวแม่ "สีอะคริลิค: สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)" — ประตูเปิดเมนูเฉดหน้าร้าน
 * พอสั่งแล้วบรรทัดเฉด "เลือกเฉดสีพิเศษ: hologram-01" บอกครบกว่า สองบรรทัดซ้อนกันรก
 * (กราฟฟิกขอตัด 18 ก.ย. 69 · OD-260915-7011 — ทั้งของตัว "สีอะคริลิค: สีพิเศษ (…)" และของฐาน "สีอะคริลิคฐาน: อะคริลิคพิเศษ (…)")
 * ตัวแม่ = หัวข้อสี/ชนิด/ประเภทเนื้อ ที่ค่าเป็น "…พิเศษ" · จับคู่กับบรรทัดเฉดด้วยชิ้นส่วน (ตัว/ฐาน/ชิ้นที่ N)
 * เลือก "อะคริลิคใส" ไม่มีบรรทัดเฉด → ไม่ใช่ตัวแม่ ขึ้นเหมือนเดิม
 */
const isShadeParent = (k: string, v: string) =>
  !isShadeLine(k) && /อะคริลิคพิเศษ|สีพิเศษ/.test(v) && /^(สี|ชนิด|ประเภท|เนื้อ|วัสดุ|อะคริลิค)/.test(bareLabel(k));

/**
 * 🎨 ยุบตัวแม่ + บรรทัดเฉดของชิ้นเดียวกันเหลือบรรทัดเดียว — บรรทัดเฉดไปยืน "ตำแหน่งของตัวแม่" (ได้ลำดับกลุ่มของตัวแม่ด้วย
 * ผ่าน rankKey — "สีอะคริลิค" เป็นบรรทัดวัสดุ · "สีอะคริลิคฐาน" อยู่กลุ่มฐาน) แล้วบรรทัดเฉดเดิมตัดทิ้ง
 * ไม่มีตัวแม่ (ออเดอร์เก่า/สินค้าที่ไม่มีประตู) = บรรทัดเฉดอยู่ที่เดิมของมัน
 * ⚠️ แสดงผลอย่างเดียว — ค่าตัวแม่ยังอยู่ในออเดอร์ (ตารางราคา/QuotePanel อ่านแกน "สีอะคริลิค" จากมัน)
 */
function mergeShadeLines(entries: [string, string][]): { e: [string, string]; rankKey: string }[] {
  const shadeOf = new Map<string, [string, string]>(); // ชิ้นส่วน → บรรทัดเฉดบรรทัดแรก
  const parentAt = new Map<string, number>(); // ชิ้นส่วน → ตำแหน่งตัวแม่บรรทัดแรก
  entries.forEach(([k, v], i) => {
    if (!v) return;
    const part = partOf(k);
    if (isShadeLine(k)) {
      if (!shadeOf.has(part)) shadeOf.set(part, [k, v]);
    } else if (isShadeParent(k, v) && !parentAt.has(part)) parentAt.set(part, i);
  });
  const out: { e: [string, string]; rankKey: string }[] = [];
  entries.forEach(([k, v], i) => {
    const part = partOf(k);
    const shade = shadeOf.get(part);
    const at = parentAt.get(part);
    if (shade && at !== undefined) {
      if (i === at) return void out.push({ e: shade, rankKey: k }); // ตัวแม่ → บรรทัดเฉดยืนแทน
      if (isShadeParent(k, v) || (isShadeLine(k) && shade[0] === k)) return; // ตัวแม่ซ้ำ / บรรทัดเฉดที่ย้ายไปแล้ว
    }
    out.push({ e: [k, v], rankKey: k });
  });
  return out;
}

/**
 * 🧴 บรรทัด "เคลือบ" ผิวงาน — ต้องขึ้นเสมอ ถึงจะเลือก "ไม่เคลือบ" (เจ้าของร้านสั่ง 15 ก.ย. 69 · OD-260915-7842)
 * เป็นกลุ่มที่ทุกใบต้องเลือก — "ไม่เคลือบ" คือคำตอบจริงที่กราฟฟิก/ทีมผลิตต้องเห็น
 * ไม่ใช่ของเสริมที่ไม่ได้สั่ง (ไม่มีบรรทัด = ไม่รู้ว่าลูกค้าเลือกไว้ว่าอะไร ต้องย้อนไปเปิดหน้าสินค้าดูเอง)
 *
 * ⚠️ ของเสริมที่บังเอิญมีคำว่า "เคลือบ" ไม่นับ — ยังตัดทิ้งเหมือนเดิม (เจ้าของร้านสั่ง OD-260915-6742)
 *   เคลือบฟอยล์ · งานเคลือบนูน (เรซิ่น) · ลาย/ฟิล์มเคลือบพิเศษ — เป็น Add On ไม่ได้สั่ง = ไม่ต้องมีบรรทัด
 */
const isCoatingLine = (k: string) => /เคลือบ/.test(k) && !/ฟอยล์|นูน|เรซิ่น|พิเศษ|add\s*on/i.test(k);

/**
 * ลำดับกลุ่มของหัวข้อ — เรียงจากชิ้นงานหลักลงไปหาข้อมูลการสั่ง
 *   0 ขนาดของตัวงาน → 1 วัสดุ/สีของตัวงาน → 2 รายละเอียดของตัวงาน → 3 ขนาดฐาน → 4 รายละเอียดฐาน
 *   → 5 ขึ้นไป = หัวข้อท้ายการ์ดตาม TAIL_ORDER (เรทราคา · ใช้ไฟล์เก่า · จำนวนลาย · จำนวนแต่ละลาย · หมายเหตุ)
 * ภายในกลุ่มเดียวกันยังเรียงตามลำดับกลุ่มตัวเลือกของสินค้าเหมือนเดิม (เจ้าของร้านจัดเองในหน้าแก้สินค้า)
 */
function specRank(k: string): number {
  // หัวข้อท้ายการ์ด (เรทราคา → ใช้ไฟล์เก่า → จำนวนลาย → จำนวนแต่ละลาย → หมายเหตุ) = 5 ขึ้นไปตามลิสต์
  const tail = tailAt(k);
  if (tail >= 0) return 5 + tail;
  // ชุดที่ร้านกำหนดลำดับเอง (เจาะรู → รับตะขอ → ตะขอ) ต้องได้ลำดับกลุ่มเดียวกันทั้งชุด
  // ไม่งั้น "สีตะขอ" จะถูกดันไปอยู่กับบรรทัดวัสดุ แล้วชุดขาดออกจากกัน
  if (specGroup(k)) return 2;
  if (isBaseLine(k)) return isSizeLine(k) ? 3 : 4;
  if (isSizeLine(k) || isCutLine(k)) return 0;
  return isMaterialLine(k) ? 1 : 2;
}

/**
 * 🚫 บรรทัดตัวเลือกที่ "ไม่ได้ทำ/ไม่ได้เพิ่ม" — ไม่ต้องขึ้นบรรทัด (เจ้าของร้านสั่ง 15 ก.ย. 69 · OD-260915-6742)
 * "ติ่งห้อย: ไม่เพิ่ม" · "งานเคลือบนูน (เรซิ่น): ไม่เคลือบนูน (เรซิ่น)" · "เคลือบฟอยล์: ไม่เคลือบฟอยล์"
 * เป็นแค่บรรทัดรก — ไม่มีบรรทัด = ไม่ได้ทำ สิ่งที่ทุกจอต้องเห็นคือของที่ลูกค้าสั่งจริงเท่านั้น
 *
 * ⚠️ ค่าที่ขึ้นต้นด้วย "ไม่" แต่เป็นสเปคจริง ห้ามตัด:
 *   • บรรทัดขนาด — "ขนาดสกรีน ด้านหน้า: ไม่เกิน A5" · "ขนาดปัก: ไม่เกิน 10 ซม."
 *   • ค่าเปรียบเทียบ — ไม่เกิน / ไม่ต่ำกว่า / ไม่น้อยกว่า / ไม่จำกัด
 *   • ติ๊กหลายอย่างแล้วมี "ไม่…" ปนมาด้วย (มี · หรือ | คั่น) — ยังมีของอื่นในบรรทัดเดียวกัน
 *   • บรรทัดเคลือบผิวงาน (isCoatingLine) — "ไม่เคลือบ" เป็นคำตอบจริงของกลุ่มที่ต้องเลือกทุกใบ
 *   • บรรทัดการตัด (isCutLine) — "ไม่ไดคัท (เต็มแผ่น A3)" คือขนาดชิ้นงานที่สั่ง ไม่ใช่ของเสริมที่ไม่ได้ทำ
 *   • ข้อความที่ลูกค้า/แอดมินพิมพ์เอง ไม่ใช่ชื่อตัวเลือก — "หมายเหตุ: ไม่ตัดแบ่ง วางเรียงลงหลาได้เลย"
 *     และบรรทัดที่ไม่มีหัวข้อ (ออเดอร์เก่าที่กางจากข้อความรวม) — "ไม่รองขาวส่วน Backgrounds"
 */
const pickedNone = (k: string, v: string) => {
  const t = v.trim();
  if (!/^ไม่/.test(t) || /^ไม่(เกิน|ต่ำกว่า|น้อยกว่า|จำกัด|เท่ากับ)/.test(t)) return false;
  if (!k.trim() || /หมายเหตุ|note/i.test(k)) return false;
  if (isSizeLine(k) || isCoatingLine(k) || isCutLine(k)) return false;
  return !/\s·\s|\s\|\s/.test(t);
};

/**
 * 🔗 ชุดหัวข้อที่ต้องอยู่ติดกัน "ตามลำดับที่เจ้าของร้านกำหนด" — ทั้งชุดไปยืนที่ตำแหน่งบรรทัดแรกของชุด
 * (ลำดับกลุ่มตัวเลือกในหน้าสินค้าเรียงตามตอนตั้งราคา ไม่ได้เรียงตามที่คนอ่านใบงานต้องการ
 *  และออเดอร์เก่าแช่ลำดับตอนสั่งไว้แล้ว แก้ที่หน้าสินค้าไม่ช่วยใบที่สั่งไปแล้ว)
 * เช็คทีละ regex ตามลำดับในลิสต์ — ตัวแรกที่ตรงคือลำดับของหัวข้อนั้น ("รับตะขอไหม" ต้องมาก่อน /ตะขอ/ กว้าง ๆ)
 */
const SPEC_GROUPS: { key: string; order: RegExp[] }[] = [
  // งานเจาะรู/ตะขอ: เจาะรูไหม → รับตะขอไหม → แล้วค่อยบอกว่าตะขอแบบไหน (เจ้าของร้านสั่ง 15 ก.ย. 69)
  { key: "hook", order: [/เจาะรู/, /รับตะขอ/, /ตะขอ/] },
];

/** ชุดของหัวข้อนี้ + ลำดับในชุด (ไม่อยู่ชุดไหน = null) */
function specGroup(k: string): { key: string; at: number } | null {
  for (const g of SPEC_GROUPS) {
    const at = g.order.findIndex((re) => re.test(k));
    if (at >= 0) return { key: g.key, at };
  }
  return null;
}

/**
 * 🪝 ชื่อตะขอในคลังกลางพ่วงรายการสีที่มีให้เลือก — "L ตะขอดาว (เงิน/ทอง/โรสโกลด์/รุ้ง)" · "C โซ่ไข่ปลา (หลายสี)"
 * มีไว้ให้ลูกค้าดูตอนเลือกหน้าร้าน แต่พอสั่งแล้วบรรทัด "สีตะขอ" บอกสีจริงอยู่ถัดไป วงเล็บนี้เลยกลายเป็นของรก
 * ชวนอ่านผิดว่าได้ทุกสี (เจ้าของร้านสั่งตัด 17 ก.ย. 69 · OD-260917-4798)
 * ตัดเฉพาะตอนมีบรรทัดสีตะขอ — ตะขอสีเดียว "(สีเงิน)" / "(สุ่มสี · เลือกสีไม่ได้)" ไม่มีบรรทัดสี วงเล็บคือข้อมูลสี คงไว้
 * ⚠️ ห้ามไปแก้ชื่อในคลัง — showWhen ของกลุ่มสีตะขอทุกสินค้าชี้ชื่อเต็มนี้อยู่
 */
const HOOK_COLOR_LIST = /\s*\((?:[^()]*\/[^()]*|หลายสี)\)/g;
function trimHookColors(entries: [string, string][]): [string, string][] {
  if (!entries.some(([k]) => /^สีตะขอ/.test(k))) return entries;
  return entries.map(([k, v]): [string, string] =>
    /ตะขอ/.test(k) && !/^สี/.test(k) ? [k, v.replace(HOOK_COLOR_LIST, "")] : [k, v]
  );
}

/**
 * 🔁 จัดบรรทัดให้อ่านง่ายก่อนแสดง — ใช้ร่วมกันทุกจอที่โชว์รายละเอียดรายการ
 *
 *   • ตัวเลือกที่เลือกว่า "ไม่ทำ/ไม่เพิ่ม" = ตัดทิ้ง (pickedNone)
 *   • หัวข้อที่มีคู่หน้า/หลัง ให้อยู่ติดกัน หน้าก่อนหลังเสมอ — เดิมกระจัดกระจาย
 *     ("เคลือบด้านหลัง" อยู่กลางการ์ด ส่วน "เคลือบ (เฉพาะด้านหน้า)" ไปอยู่บรรทัดสุดท้าย)
 *   • เรียงเป็นกลุ่มตาม specRank — ขนาดตัว + วัสดุ/สี + ข้อมูลตัว · ขนาดฐาน + ข้อมูลฐาน · แล้วชุดท้ายการ์ด (TAIL_ORDER)
 *     (งานสแตนดี้เคยสลับกันไปมา: ทรงฐาน → ขนาดฐาน → เรทราคา → … → ขนาดตัวสแตนดี้ อยู่บรรทัดสุดท้าย)
 *   • ชุดหัวข้อที่ร้านกำหนดลำดับเอง (SPEC_GROUPS) อยู่ติดกันตามลำดับนั้น — เจาะรู → รับตะขอไหม → ตะขอ
 *   • ชื่อตะขอตัดวงเล็บรายการสีที่มีให้เลือกออก เมื่อมีบรรทัด "สีตะขอ" บอกสีจริงแล้ว (trimHookColors)
 *   • ตัวแม่ "สีอะคริลิค: สีพิเศษ (…)" + บรรทัดเฉดของชิ้นเดียวกัน ยุบเหลือบรรทัดเฉดบรรทัดเดียว ยืนที่ตัวแม่ (mergeShadeLines)
 *
 * ⚠️ แสดงผลอย่างเดียว — ค่าที่เก็บในออเดอร์/แผงตีราคาไม่เปลี่ยน (QuotePanel ยังอ่านครบทุกบรรทัด)
 */
/**
 * 🗜 แพทเทิร์นย่อของงานสแตนดี้ (ตัว + ฐาน) สำหรับจอฝ่ายผลิต — พนักงานส่งภาพต้นแบบ 18 ก.ย. 69 (OD-260915-7011):
 *   ขนาดตัวสแตนดี้: 15cm
 *   เลือกเฉดสีพิเศษ (ตัวสแตนดี้): hologram-01
 *   งานสกรีน: สกรีน 1 ด้าน (บน)          ← บรรทัดของตัวเอง (พนักงานสั่งแยกรอบ 2: เดิมต่อท้ายเฉดด้วย " + ")
 *   ขนาดฐาน: 7cm ทรงกลม hologram-01       ← ทุกบรรทัดของฐานยุบเข้าบรรทัดขนาดฐาน
 *   จำนวนลาย: 1 ลาย
 * ทำเฉพาะรายการที่มีบรรทัดฐาน (งานสแตนดี้) — สินค้าอื่นบรรทัดละหัวข้อเหมือนเดิม · ชุดท้ายการ์ด (เรท/จำนวนลาย/หมายเหตุ) ไม่แตะ
 * ใช้เฉพาะจอฝ่ายผลิต (tidySpec(..., { compact: true })) — หน้าลูกค้า/ใบเสร็จ/ใบเสนอราคายังบรรทัดละหัวข้อ
 */
function compactStandee<T extends { e: [string, string]; key: string }>(rows: T[]): T[] {
  const isTail = (k: string) => tailAt(k) >= 0;
  if (!rows.some(({ key }) => isBaseLine(key) && !isTail(key))) return rows;
  const out: T[] = [];
  let baseSize: T | null = null; // บรรทัดขนาดฐาน
  for (const r of rows) {
    const k = r.key;
    if (isTail(k)) {
      out.push(r);
      continue;
    }
    if (isBaseLine(k)) {
      if (isSizeLine(k) && !baseSize) {
        baseSize = { ...r, e: [r.e[0], r.e[1]] };
        out.push(baseSize);
      } else if (baseSize) baseSize.e = [baseSize.e[0], `${baseSize.e[1]} ${r.e[1]}`];
      else out.push(r); // ไม่มีบรรทัดขนาดฐานให้เกาะ — ปล่อยไว้ตามเดิม
      continue;
    }
    out.push(r);
  }
  return out;
}

export function tidySpec(entries: [string, string][], opts?: { compact?: boolean }): [string, string][] {
  const merged = mergeShadeLines(entries.filter(([k, v]) => !pickedNone(k, v)));
  // จัดลำดับด้วย rankKey (หัวข้อตัวแม่ถ้าบรรทัดนั้นไปแทนตัวแม่) · หัวข้อที่โชว์จริงอยู่ใน e
  const kept = trimHookColors(merged.map((x) => x.e)).map((e, i) => ({ e, key: merged[i].rankKey }));
  const paired = new Set(kept.filter(({ key }) => isBackLine(key)).map(({ key }) => sideBase(key)));
  /** กุญแจของ "ชุดที่ต้องอยู่ติดกัน" — ชุดที่ร้านกำหนดลำดับเอง หรือคู่หน้า/หลังของหัวข้อเดียวกัน */
  const groupKey = (k: string) => {
    const g = specGroup(k);
    if (g) return `g:${g.key}`;
    return paired.has(sideBase(k)) ? `p:${sideBase(k)}` : "";
  };
  // จุดยึดของแต่ละชุด = ตำแหน่งบรรทัดแรกของชุดนั้น (ทั้งชุดไปยืนตรงนั้น)
  const anchor = new Map<string, number>();
  kept.forEach(({ key: k }, i) => {
    const key = groupKey(k);
    if (key && !anchor.has(key)) anchor.set(key, i);
  });
  const sorted = kept
    .map(({ e, key: k }, i) => ({
      e,
      key: k,
      i,
      rank: specRank(k),
      at: anchor.get(groupKey(k)) ?? i,
      // ในชุดเดียวกัน: ชุดที่ร้านกำหนดเรียงตามลิสต์ · คู่หน้า/หลังเอาหน้าก่อนหลัง
      sub: specGroup(k)?.at ?? (isBackLine(k) ? 1 : 0),
    }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at || a.sub - b.sub || a.i - b.i);
  return (opts?.compact ? compactStandee(sorted) : sorted).map((x) => x.e);
}

/**
 * 📐 ขนาดงานตายตัวของสินค้า (Product.workSize) — เติมบรรทัด "ขนาด: …" ให้รายการที่ไม่มีกลุ่มขนาดให้เลือก
 * (CUP SLEEVE ขนาดเดียว 27.7 × 7.6 ซม. — กราฟฟิกอ่านจากรายการในออเดอร์ไม่เจอ ต้องไปเปิดหน้าสินค้าดูเอง)
 * มีบรรทัดขนาดจากตัวเลือกอยู่แล้ว (ขนาดตัด / ขนาดไดคัท / ขนาดแต่ละลาย) = ของจริงชนะ ไม่เติมซ้ำ
 * วางไว้บรรทัดแรก — ขนาดเป็นสเปคที่ทีมผลิตมองหาก่อนเสมอ
 */
export function withWorkSize(entries: [string, string][], workSize?: string): [string, string][] {
  const size = (workSize ?? "").trim();
  if (!size || entries.some(([k]) => /ขนาด|size/i.test(k))) return entries;
  return [["ขนาด", size], ...entries];
}

/* ──────────────────────────────────────────────────────────────
 * 📐 "เพิ่มขนาด" ที่ลูกค้ากดเพิ่มทีละเซน/นิ้ว — โชว์เป็นขนาดจริงที่ต้องผลิตในบรรทัด "ขนาด"
 * (15 ซม. + เซนละ ×2 → "17 ซม. (15 + เพิ่ม 2)") ไม่งั้นทีมผลิต/ลูกค้าต้องบวกเองทุกครั้ง
 * ⚠️ แสดงผลอย่างเดียว — ค่าที่เก็บในออเดอร์ยังเป็นชื่อตัวเลือกจริง เพราะตารางราคา/แผงตีราคา
 * เทียบชื่อตัวเลือกตรง ๆ (ดู QuotePanel → activeRate/cellPrice) แก้ค่าเมื่อไหร่ราคาหาย
 * ────────────────────────────────────────────────────────────── */

/** หน่วยความยาวที่เทียบกันได้ (เซน = ซม. = cm) — null = ไม่ใช่หน่วยความยาว */
function lengthUnit(text: string): "cm" | "inch" | "mm" | null {
  // หน่วยอังกฤษติดตัวเลขได้ ("35x35cm") จึงกันแค่ "ตัวอักษรขนาบข้าง" ไม่ใช่ \b (35cm จะไม่เข้า \bcm\b)
  if (/นิ้ว|inch|(?<![a-z])in(?![a-z])/i.test(text)) return "inch"; // เช็คนิ้วก่อน — "นิ้วละ 15 บาท (2.54 cm)" มีทั้งสองหน่วย
  if (/มม\.?|มิล|(?<![a-z])mm(?![a-z])/i.test(text)) return "mm";
  if (/ซม\.?|ซ\.ม\.|เซน|(?<![a-z])cm(?![a-z])/i.test(text)) return "cm";
  return null;
}

/** หน่วยความยาวที่รับรู้ (ใช้ประกอบ regex ด้านล่าง) */
const UNIT_RE = String.raw`ซม\.?|ซ\.ม\.|cm|มม\.?|mm|นิ้ว|inch(?:es)?|in`;
/** ค่าที่เป็น "ตัวเลข + หน่วย" ล้วน ๆ เท่านั้น ("15 ซม." / "4cm") — "55×33 ซม." หรือ "6 – 8 ซม." ไม่เข้าข่าย */
const SIZE_VALUE_RE = new RegExp(String.raw`^([\d.]+)(\s*)(${UNIT_RE})$`, "i");
/** ตัวเลือกที่ระบุจำนวน — "เซนละ ×2" (กติกาเดียวกับ formatMultiPick) */
const ADD_QTY_RE = /^(.+?)\s+×\s*(\d+(?:\.\d+)?)$/;
/** ค่าจากช่องกรอก — "2 นิ้ว" หรือ "2" เฉย ๆ (ดู formatInputValue) */
const ADD_INPUT_RE = new RegExp(String.raw`^([\d.]+)\s*(${UNIT_RE})?$`, "i");
/** ชื่อกลุ่ม/ชื่อตัวเลือกที่แปลว่า "บวกเพิ่มจากขนาดมาตรฐาน" */
const ADD_SIZE_RE = /เพิ่มขนาด|เพิ่มความยาว|เพิ่มความกว้าง|ขนาดมากกว่า/;
/** ชื่อตัวเลือกแบบคิดต่อหน่วย — "นิ้วละ 15 บาท" / "เซนละ" / "บวกเพิ่มเซนละ" */
const PER_UNIT_RE = /(?:นิ้ว|เซน|ซม|มม|inch|cm|mm)\.?\s*ละ/i;
/** ขนาดฐานที่เขียนไว้ในชื่อกลุ่ม/ชื่อตัวเลือกเอง — "ขนาดมากกว่า 8 ซม" · "เริ่มที่ 15 cm" · "จาก 6 ซม." */
const FROM = String.raw`(?:มากกว่า|เริ่มที่|เริ่มต้นที่|จาก)`;
const BASE_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*(${UNIT_RE})`, "i");
/** ฐานที่เป็นสองด้าน — "จาก 13×13 นิ้ว" (โตทั้งสองด้านพร้อมกัน) */
const BASE_2D_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*(${UNIT_RE})`, "i");

/** ปัดทศนิยม 2 ตำแหน่ง (กัน 7.5 + 0.3 = 7.799999) */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * แปลงหน่วยความยาว (1 นิ้ว = 2.54 ซม. = 25.4 มม.) — เจ้าของร้านสั่งให้บวกข้ามหน่วยได้เลย (5 ก.ย. 69)
 * กราฟฟิกจะได้ไม่ต้องคำนวณเอง (เสี่ยงพลาด) · ที่มาของเลขโชว์ในวงเล็บเสมอให้ตรวจทานได้
 */
const LEN_MM: Record<"cm" | "inch" | "mm", number> = { mm: 1, cm: 10, inch: 25.4 };
const convertLen = (n: number, from: "cm" | "inch" | "mm", to: "cm" | "inch" | "mm") =>
  round2((n * LEN_MM[from]) / LEN_MM[to]);

/** บรรทัดขนาดสองด้าน "40x85 ซม." — ร้านเขียนตามแบบ กว้าง×ยาว/สูง (ตัวแรก = ด้านกว้างเสมอ) */
const DIM2_RE = new RegExp(String.raw`^([\d.]+)\s*([×x])\s*([\d.]+)(\s*)(${UNIT_RE})$`, "i");
/** ขนาดสองด้านที่ฝังอยู่ในค่า — "Size XL (65x65cm)" (ชื่อรุ่นพ่วงขนาดจริงมาในวงเล็บ) */
const DIM2_IN_RE = new RegExp(String.raw`([\d.]+)\s*[×x]\s*([\d.]+)\s*(${UNIT_RE})`, "i");

/**
 * ชื่อด้านที่กลุ่ม/ตัวเลือกบอกไว้ — "เพิ่มขนาด · ด้านยาวสุด (นิ้ว)" → "ด้านยาวสุด" (ไม่ระบุ = "")
 * ชื่อกลุ่มยาว ๆ ที่ไม่ได้ตั้งใจเป็นชื่อด้าน ("FLEX กว้างเกินขนาดที่กำหนด") ให้ถอยไปอ่านจากชื่อตัวเลือกแทน
 */
function sideOf(label: string, name: string): string {
  const short = label.replace(/เพิ่มขนาด|เพิ่มความ/g, "").replace(/\([^)]*\)/g, "").replace(/[·|+\-–]/g, " ").replace(/\s+/g, " ").trim();
  if (short && short.length <= 16 && /ด้าน|กว้าง|ยาว|สูง/.test(short)) return short;
  const t = `${label} ${name}`;
  if (/ความกว้าง|ด้านกว้าง/.test(t)) return "ด้านกว้าง";
  if (/ความยาว|ด้านยาว/.test(t)) return "ด้านยาว";
  if (/ความสูง|ด้านสูง/.test(t)) return "ด้านสูง";
  return "";
}

/** ด้านที่ตัวเลือกเพิ่มขนาดชี้ชัด ๆ — ใช้เลือกว่าบวกตัวเลขไหนของ "40x85" (null = ไม่บอกด้าน) */
function dimSide(a: SizeAdd): "กว้าง" | "ยาว" | "สูง" | null {
  const t = `${a.label} ${a.name}`;
  if (/ความกว้าง|ด้านกว้าง/.test(t)) return "กว้าง";
  if (/ความยาว|ด้านยาว/.test(t)) return "ยาว";
  if (/ความสูง|ด้านสูง/.test(t)) return "สูง";
  return null;
}

/** ตัวเลือก 1 บรรทัดที่แปลว่า "บวกขนาดเพิ่ม N หน่วย" */
type SizeAdd = { i: number; label: string; name: string; step: number; unit: "cm" | "inch" | "mm"; unitText: string };

/** อ่านบรรทัดตัวเลือกว่าเป็น "เพิ่มขนาด" กี่หน่วยไหม — ไม่ใช่ = null */
function readSizeAdd(label: string, value: string, i: number): SizeAdd | null {
  const v = value.trim();
  const qty = ADD_QTY_RE.exec(v);
  const input = qty ? null : ADD_INPUT_RE.exec(v); // ช่องกรอกเก็บเป็นตัวเลขล้วน ไม่มี "×N"
  // เพิ่มแค่ 1 หน่วยถูกเก็บเป็นชื่อเปล่า ไม่มี "×1" (ดู formatMultiPick) — รับเฉพาะกลุ่มเพิ่มขนาดเอง
  // และชื่อแบบ "หน่วยละ…" เท่านั้น กันไปโดนตัวเลือกที่แค่เอ่ยถึงหน่วย ("เพิ่ม 2 ซม. (ไม่เกิน 11 ซม.)")
  const bare = !qty && !input && ADD_SIZE_RE.test(label) && PER_UNIT_RE.test(v);
  const name = qty ? qty[1] : bare ? v : "";
  if (!qty && !input && !bare) return null;
  if (!ADD_SIZE_RE.test(label) && !ADD_SIZE_RE.test(name)) return null;
  const step = Number(qty ? qty[2] : bare ? 1 : input![1]);
  const unitText = (input?.[2] ?? "").trim();
  const unit = lengthUnit(name) ?? lengthUnit(unitText) ?? lengthUnit(label);
  if (!unit || !(step > 0)) return null;
  return { i, label, name, step, unit, unitText: unitText || (unit === "inch" ? "นิ้ว" : unit === "mm" ? "มม." : "ซม.") };
}

/**
 * บวก "เพิ่มขนาด" ให้เห็นเป็นขนาดจริง — ทำเฉพาะตอนที่ไม่กำกวมเท่านั้น (ไม่เข้าเงื่อนไข = ปล่อยไว้เหมือนเดิม)
 * หน่วยไม่ตรงกับฐานก็แปลงให้ (นิ้ว→ซม.) แล้วบวกเลย พร้อมโชว์ที่มาในวงเล็บ — เจ้าของร้านสั่ง (5 ก.ย. 69)
 * กราฟฟิกจะได้ไม่ต้องคำนวณเอง · บวกตามลำดับ:
 *   1) บรรทัดขนาดสองด้าน + ตัวเลือกบอกด้าน  "40x85 ซม." + กว้าง 5 นิ้ว → "52.7x85 ซม. (กว้างเดิม 40 + เพิ่ม 5 นิ้ว = 12.7 ซม.)"
 *   2) บรรทัดขนาดเป็นตัวเลขเดี่ยว          "ขนาด: 15 ซม."           → "17 ซม. (15 + เพิ่ม 2)"
 *   3) บรรทัดขนาดระบุด้าน + กลุ่มบอกด้าน    "กว้าง 2.5 cm ยาว 10cm"  → บวกเฉพาะด้านยาว
 *   4) ฐานเขียนในชื่อกลุ่มเอง               "ขนาดมากกว่า 8 ซม"       → แทรกบรรทัด "ขนาด: 10 ซม. (8 + เพิ่ม 2)"
 *      (ฐานสองด้าน "จาก 13×13 นิ้ว" → "ขนาด: 15×15 นิ้ว (13×13 + เพิ่ม 2)" — โตทั้งสองด้าน ตามที่เจ้าของร้านยืนยัน 4 ก.ย. 69
 *       มีบรรทัดขนาดอยู่แล้วค่อยถอยไปต่อท้ายบรรทัดเพิ่มขนาดว่า "→ รวม …" กันหัวข้อ "ขนาด" ซ้ำ)
 *   5) บวกไม่ได้ (ไม่บอกด้าน/หาบรรทัดฐานไม่เจอ) → ต่อท้ายบรรทัดขนาดว่าเพิ่มไปกี่หน่วย
 * ที่เหลือปล่อยไว้ = ไม่รู้ฐานจริง ๆ (ช่วงขนาด "6 – 8 ซม." · ไม่มีขนาดฐานใน options · เพิ่มคนละชิ้นสองกลุ่ม)
 */
export function foldSizeExtra(entries: [string, string][]): [string, string][] {
  // กลุ่มติ๊กหลายอย่างเก็บค่ารวมคั่น " | " ("เพิ่มความกว้าง นิ้วละ ×2 | เพิ่มความยาว นิ้วละ ×3")
  // ต้องแตกอ่านทีละตัวเลือก — อ่านทั้งก้อน regex จะจับได้แค่ ×N ตัวท้ายแล้วบวกผิดด้าน (เจอกับผ้าเชียร์)
  const adds = entries.flatMap(
    ([k, v], i) => v.split(" | ").map((part) => readSizeAdd(k, part, i)).filter(Boolean) as SizeAdd[],
  );
  if (!adds.length) return entries;
  const put = (at: number, value: string) =>
    entries.map(([k, v], i) => (i === at ? ([k, value] as [string, string]) : ([k, v] as [string, string])));

  /** บรรทัดที่พูดถึง "ขนาด" และไม่ใช่บรรทัดเพิ่มขนาดเอง */
  const sizeLines = entries.flatMap(([k, v], i) =>
    // กลุ่ม "เพิ่มขนาด" ที่ไม่ได้กรอกตัวเลข (เช่น ติ๊กว่าต้องการเพิ่ม) ก็ไม่ใช่บรรทัดขนาดฐาน
    k.includes("ขนาด") && !ADD_SIZE_RE.test(k) && !adds.some((a) => a.i === i) ? [{ i, v: v.trim() }] : [],
  );

  // 1) ขนาดสองด้าน "40x85 ซม." + ทุกตัวเลือกบอกด้านชัดคนละด้าน → บวกเข้าด้านนั้นเลย (ตัวแรก = กว้าง)
  const dim2 = sizeLines.flatMap(({ i, v }) => {
    const s = DIM2_RE.exec(v);
    const u = s ? lengthUnit(s[5]) : null;
    return s && u ? [{ i, s, u }] : [];
  });
  const dimSides = adds.map((a) => dimSide(a));
  if (
    dim2.length === 1 &&
    dimSides.every(Boolean) &&
    new Set(dimSides.map((s) => (s === "กว้าง" ? 0 : 1))).size === dimSides.length
  ) {
    const { i, s, u } = dim2[0];
    const nums = [Number(s[1]), Number(s[3])];
    const notes: string[] = [];
    adds.forEach((a, k) => {
      const at = dimSides[k] === "กว้าง" ? 0 : 1;
      const step = convertLen(a.step, a.unit, u);
      notes.push(
        `${dimSides[k]}เดิม ${nums[at]} + เพิ่ม ${a.step}${a.unit === u ? "" : ` ${a.unitText} = ${step} ${s[5]}`}`,
      );
      nums[at] = round2(nums[at] + step);
    });
    return put(i, `${nums[0]}${s[2]}${nums[1]}${s[4]}${s[5]} (${notes.join(" · ")})`);
  }

  if (adds.length === 1) {
    const add = adds[0];

    // 2) ขนาดที่เป็นตัวเลขเดี่ยว → บวกตรง ๆ (หน่วยไม่ตรงก็แปลงก่อนบวก)
    const plain = sizeLines.flatMap(({ i, v }) => {
      const s = SIZE_VALUE_RE.exec(v);
      const u = s ? lengthUnit(s[3]) : null;
      return s && u ? [{ i, s, u }] : [];
    });
    if (plain.length === 1) {
      const { i, s, u } = plain[0];
      const base = Number(s[1]);
      const step = convertLen(add.step, add.unit, u);
      const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[3]}`;
      return put(i, `${round2(base + step)}${s[2]}${s[3]} (${base} + ${math})`);
    }

    // 2.5) ขนาดสองด้านฝังอยู่ในค่า ("Size XL (65x65cm)") → ถอดออกมาบวกให้ แล้วโชว์ขนาดจริงต่อท้าย
    //      ฐานสองด้านเท่ากัน + ตัวเลือกไม่บอกด้าน = โตทั้งสองด้าน (แบบเดียวกับฐาน "จาก 13×13 นิ้ว"
    //      ที่เจ้าของร้านยืนยัน 4 ก.ย. 69) · ไม่เท่ากันต้องมีด้าน/"ยาวสุด" ชี้ ไม่งั้นปล่อยไปข้อ 5
    const embedded = sizeLines.flatMap(({ i, v }) => {
      const s = DIM2_IN_RE.exec(v);
      const u = s ? lengthUnit(s[3]) : null;
      return s && u ? [{ i, v, s, u }] : [];
    });
    if (embedded.length === 1) {
      const { i, v, s, u } = embedded[0];
      const dims = [Number(s[1]), Number(s[2])];
      const from = `${add.label} ${add.name}`;
      const at = /ยาวสุด/.test(from)
        ? (dims[1] > dims[0] ? 1 : 0)
        : dimSide(add) === "กว้าง" ? 0 : dimSide(add) ? 1 : -1;
      if (at >= 0 || dims[0] === dims[1]) {
        const step = convertLen(add.step, add.unit, u);
        const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[3]}`;
        const total = dims.map((n, k) => (at < 0 || k === at ? round2(n + step) : n));
        const note = at >= 0
          ? `${sideOf(add.label, add.name) || "ด้านที่เพิ่ม"}เดิม ${dims[at]} + ${math}`
          : `${dims[0]}×${dims[1]} + ${math}`;
        // ตัดก้อนขนาดเดิม (รวมวงเล็บที่ครอบพอดี) ออก เหลือชื่อรุ่นนำหน้าขนาดจริง
        let a = s.index, b = s.index + s[0].length;
        if (v[a - 1] === "(" && v[b] === ")") { a--; b++; }
        const prefix = `${v.slice(0, a)}${v.slice(b)}`.replace(/\s+/g, " ").trim();
        const sized = `${total[0]}×${total[1]} ${s[3]} (${note})`;
        return put(i, prefix ? `${prefix} → ${sized}` : sized);
      }
    }

    // 3) ขนาดที่ระบุด้านไว้ + กลุ่มบอกว่าเพิ่มด้านไหน → บวกเฉพาะด้านนั้น
    const side = dimSide(add);
    if (side) {
      const sideRe = new RegExp(String.raw`(${side}\s*)([\d.]+)(\s*)(${UNIT_RE})`, "i");
      const sided = sizeLines.flatMap(({ i, v }) => {
        const s = sideRe.exec(v);
        const u = s ? lengthUnit(s[4]) : null;
        return s && u ? [{ i, v, s, u }] : [];
      });
      if (sided.length === 1) {
        const { i, v, s, u } = sided[0];
        const base = Number(s[2]);
        const step = convertLen(add.step, add.unit, u);
        const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[4]}`;
        return put(i, `${v.replace(sideRe, `$1${round2(base + step)}$3$4`)} (${side}เดิม ${base} + ${math})`);
      }
    }

    // 4) ฐานเขียนอยู่ในชื่อกลุ่ม/ชื่อตัวเลือกเอง → แทรกบรรทัด "ขนาด" แยกให้เห็นขนาดจริง
    //    บรรทัดขนาดที่ค่าเป็นการ์ด "เพิ่มขนาด" เอง (WALL TIDY เลือก "📐 เพิ่มขนาด (นิ้วละ ฿30)")
    //    = ไม่มีตัวเลขให้ลูกค้าเห็นเลย → เขียนขนาดจริงทับบรรทัดนั้นแทน
    //    มีบรรทัดขนาดตัวเลขอยู่แล้วค่อยถอยไปต่อท้ายบรรทัดเพิ่มขนาดแบบเดิม กันหัวข้อ "ขนาด" ซ้ำ
    const cardLine = sizeLines.find(({ v }) => ADD_SIZE_RE.test(v));
    // แบบต่อท้ายต้องคงวงเล็บที่มาของเลขไว้ — "จาก 6 ซม. ×2 → รวม 8 ซม." เฉย ๆ อ่านแล้วชวนงงว่า 6×2 ทำไมได้ 8
    // (×2 คือจำนวนหน่วยที่เพิ่ม ไม่ใช่คูณ) ใส่ "(6 + เพิ่ม 2)" ให้ตรวจทานได้ — เจ้าของร้านทัก 5 ก.ย. 69
    const placeSize = (value: string) =>
      cardLine
        ? put(cardLine.i, value)
        : sizeLines.length
          ? put(add.i, `${entries[add.i][1]} → รวม ${value}`)
          : [...entries.slice(0, add.i), ["ขนาด", value] as [string, string], ...entries.slice(add.i)];
    const from = `${add.name} ${add.label}`;
    const b2 = BASE_2D_RE.exec(from);
    const u2 = b2 ? lengthUnit(b2[3]) : null;
    if (b2 && u2) {
      const step = convertLen(add.step, add.unit, u2);
      const dims = [Number(b2[1]), Number(b2[2])];
      const math = add.unit === u2 ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${b2[3]}`;
      // กลุ่มบอกด้าน ("ด้านยาวสุด" = ตัวเลขที่มากกว่า · กว้าง = ตัวแรก · ยาว/สูง = ตัวหลัง) → โตด้านเดียว
      const at = /ยาวสุด/.test(from)
        ? (dims[1] > dims[0] ? 1 : 0)
        : dimSide(add) === "กว้าง" ? 0 : dimSide(add) ? 1 : -1;
      if (at >= 0) {
        const side = sideOf(add.label, add.name) || "ด้านที่เพิ่ม";
        const total = dims.map((n, i) => (i === at ? round2(n + step) : n));
        return placeSize(`${total[0]}×${total[1]} ${b2[3]} (${side}เดิม ${dims[at]} + ${math})`);
      }
      return placeSize(`${round2(dims[0] + step)}×${round2(dims[1] + step)} ${b2[3]} (${b2[1]}×${b2[2]} + ${math})`);
    }
    const b1 = BASE_RE.exec(from);
    const u1 = b1 ? lengthUnit(b1[2]) : null;
    if (b1 && u1) {
      const step = convertLen(add.step, add.unit, u1);
      const math = add.unit === u1 ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${b1[2]}`;
      return placeSize(`${round2(Number(b1[1]) + step)} ${b1[2]} (${b1[1]} + ${math})`);
    }
  }

  // 4.5) หลายตัวเลือกในกลุ่มเดียวกันที่มีฐานในชื่อกลุ่ม — คนละชิ้นแต่ฐานเดียวกัน
  //      ("เริ่มที่ 15 cm เพิ่มขนาด": แผ่นหน้า ×2 + แผ่นประกบ ×3) → แทรกบรรทัดขนาดรายชิ้น
  if (adds.length > 1 && adds.every((a) => a.i === adds[0].i)) {
    const b1 = BASE_RE.exec(adds[0].label);
    const u1 = b1 && !BASE_2D_RE.test(adds[0].label) ? lengthUnit(b1[2]) : null;
    if (b1 && u1) {
      const parts = adds.map((a) => {
        const step = convertLen(a.step, a.unit, u1);
        const math = a.unit === u1 ? `เพิ่ม ${a.step}` : `เพิ่ม ${a.step} ${a.unitText} = ${step} ${b1[2]}`;
        const piece = a.name.replace(new RegExp(String.raw`${PER_UNIT_RE.source}.*$`, "i"), "").trim();
        return `${piece ? `${piece} ` : ""}${round2(Number(b1[1]) + step)} ${b1[2]} (${b1[1]} + ${math})`;
      });
      const at = adds[0].i;
      return sizeLines.length
        ? put(at, `${entries[at][1]} → รวม ${parts.join(" · ")}`)
        : [...entries.slice(0, at), ["ขนาด", parts.join(" · ")] as [string, string], ...entries.slice(at)];
    }
  }

  // 5) หน่วยคนละอย่างแต่บวกให้ไม่ได้ (เช่น "40x85" ที่ตัวเลือกไม่บอกด้าน) → อย่างน้อยต่อท้ายว่าเพิ่มไปกี่หน่วย
  //    (หน่วยเดียวกันที่บวกไม่ได้ = เคสที่เจ้าของร้านสั่งปล่อยไว้ เช่น ขนาดเป็นช่วง "6 – 8 ซม." — ไม่แตะ)
  if (sizeLines.length === 1 && adds.every((a) => lengthUnit(sizeLines[0].v) !== null && lengthUnit(sizeLines[0].v) !== a.unit)) {
    const notes = adds
      .map((a) => {
        const side = sideOf(a.label, a.name);
        return `+ เพิ่ม ${a.step} ${a.unitText}${side ? ` (${side})` : ""}`;
      })
      .join(" ");
    return put(sizeLines[0].i, `${sizeLines[0].v} ${notes}`);
  }
  return entries;
}

const stripUrls = (v: string) =>
  v.replace(/https?:\/\/\S+/g, "").replace(/\s·\s·\s/g, " · ").replace(/[·\s]+$/, "").trim();

export function SpecLines({
  sel,
  text,
  className = "",
  labelClassName = "text-stone-700",
  hide,
  stripLinks = false,
  extras,
  after,
  workSize,
  compact = false,
}: {
  sel?: Record<string, string>;
  text?: string;
  /** 🗜 จอฝ่ายผลิต — งานสแตนดี้ยุบเป็นแพทเทิร์นสั้น (ดู compactStandee) */
  compact?: boolean;
  /** สไตล์ของ "ค่า" ทั้งบล็อก (ขนาด/สี) — กำหนดจากหน้าที่เรียกใช้ */
  className?: string;
  /** สีหัวข้อ (ตัวหนาให้อยู่แล้ว) — หลังบ้านใช้โทน slate หน้าร้านใช้ stone */
  labelClassName?: string;
  hide?: string[];
  /** ตัด URL ออกจากค่า (หน้าลูกค้า/ใบงานไม่ต้องเห็นลิงก์ยาว ๆ) */
  stripLinks?: boolean;
  /**
   * ค่าเพิ่มต่อชิ้นของแต่ละกลุ่ม (label → บาท) — บรรทัดที่มีบวกเงินจะโชว์ "+฿N/ชิ้น" ท้ายค่า
   * เช่น { "ตะขอ": 8 } → "ตะขอ: F ตะขอสปริง… +฿8/ชิ้น" (ติดลบ = ส่วนลด แสดง −฿N)
   * ⚠️ ใส่ได้เฉพาะเงินที่ "บวกเพิ่มจากราคาฐานจริง ๆ" — ส่วนต่างที่ฝังอยู่ในตารางเรทแล้วห้ามใส่ ลูกค้าจะบวกซ้ำ
   */
  extras?: Record<string, number>;
  /** บรรทัดเสริมท้ายรายละเอียด เช่น "🎨 แนบลายแล้ว N รูป" */
  after?: ReactNode;
  /** 📐 ขนาดงานตายตัวของสินค้า (Product.workSize) — ไม่มีกลุ่มขนาดให้เลือกถึงจะขึ้นบรรทัดให้ */
  workSize?: string;
}) {
  const entries = withWorkSize(
    foldSizeExtra(
      tidySpec(specEntries(sel, text, hide), { compact })
        .map(([k, v]) => [k, stripLinks ? stripUrls(v) : v] as [string, string])
        .filter(([, v]) => v),
    ),
    workSize,
  );
  if (!entries.length && !after) return null;
  const feeTag = (k: string) => {
    const fee = extras?.[k];
    if (!fee) return null;
    return (
      <span className="ml-1 whitespace-nowrap font-semibold text-sky-600">
        {fee < 0 ? "−" : "+"}฿{Math.abs(fee).toLocaleString("th-TH")}
        <span className="font-normal opacity-70">/ชิ้น</span>
      </span>
    );
  };
  return (
    <div className={`space-y-0.5 ${className}`}>
      {entries.map(([k, v], i) => {
        const parts = specValueLines(v);
        return (
          <p key={`${k}-${i}`} className="break-words leading-snug">
            {k && <span className={`font-semibold ${labelClassName}`}>{specLabel(k)}:</span>}
            {k && " "}
            {parts.length > 1 ? (
              <span className="mt-0.5 block space-y-0.5">
                {parts.map((x, n) => (
                  <span key={n} className="block pl-3">
                    {x}
                    {n === parts.length - 1 && feeTag(k)}
                  </span>
                ))}
              </span>
            ) : (
              <>
                {parts[0] ?? v}
                {feeTag(k)}
              </>
            )}
          </p>
        );
      })}
      {after}
    </div>
  );
}

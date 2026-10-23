/**
 * 🐶🧊 พรีวิว "ดูแบบ 3D" ปลอกคอสัตว์เลี้ยง (ผ้าพันคอสามเหลี่ยม) — ค่าที่จอออกแบบใช้สร้างภาพ (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "bandana" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts <id> bandana)
 * ทรงอ่านจาก "เรทราคา" (ปลีก/ตัวแทน ชื่อเดียวกัน + " (ตัวแทน)") ให้ตรงไฟล์เทมเพลตหมวด "ปลอกคอสัตว์เลี้ยง":
 *   แบบผูก       → "tie"    ผืนสามเหลี่ยม (แบบผูก-XS…XXL · ฐานกว้าง = อาร์ตบอร์ด · ยอด = ขอบล่าง) ผ้า 1 ชั้น พิมพ์ด้านเดียว ปลายผูกไว้ท้ายทอย
 *   แบบติดกระดุม  → "button" ผืนข้าวหลามตัด (ผ้าพันคอหมา …) พับครึ่งตามเส้นทแยงแนวนอน = สามเหลี่ยม 2 ชั้น · ปลายติดกระดุมแป๊กท้ายทอย
 *   แบบใส่กับสาย  → "strap"  ผืนข้าวหลามตัด (Dog …) พับครึ่ง 2 ชั้น · ช่องสอดสายตามแนวพับ สอดกับสายปลอกคอเดิม
 * ผืนข้าวหลามตัด: ครึ่งล่างของอาร์ตบอร์ด = ชั้นหน้า · ครึ่งบน = ชั้นหลัง (พับไปข้างหลัง ลายกลับหัวตามการพับ)
 *
 * ภาพ = รูปตุ๊กตาพุดเดิ้ลใส่ผ้าพันคอขาวของร้าน (public/mock/collar-animal · 23 ต.ค. 69 "นำภาพนี้ไปแทนที่ 3D เดิม")
 *   วางลายลูกค้าลงบนผ้าขาวในรูป · ชุด 5 มุม (หน้า เฉียงซ้าย ข้าง หลัง เฉียงขวา) หมุนได้ครบรอบ (ดู components/Bandana3D)
 */

export type BandanaStyle = "tie" | "button" | "strap";
/** ปุ่มมุมมอง — หน้า · หันซ้าย (เห็นข้างตัว จมูกชี้ซ้าย) · หลัง · หันขวา · ระหว่างนั้นมีรูปเฉียง (หมุนครบรอบ 360°) */
export type BandanaView = "front" | "left" | "back" | "right";

export interface BandanaMock {
  kind: "bandana";
  style: BandanaStyle;
  /** ค่า "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง) */
  label?: string;
}

export const BANDANA_STYLE_TH: Record<BandanaStyle, string> = {
  tie: "แบบผูก",
  button: "แบบติดกระดุม",
  strap: "แบบใส่กับสาย",
};

export const BANDANA_VIEW_TH: Record<BandanaView, string> = {
  front: "ด้านหน้า",
  left: "หันซ้าย",
  back: "ด้านหลัง",
  right: "หันขวา",
};

export function bandanaMockFrom(sel: Record<string, string | undefined>): BandanaMock {
  const rate = String(sel["เรทราคา"] ?? "");
  const style: BandanaStyle = /กระดุม/.test(rate) ? "button" : /สาย/.test(rate) ? "strap" : "tie";
  const size = String(sel["ขนาด"] ?? "").trim();
  return { kind: "bandana", style, label: size || undefined };
}

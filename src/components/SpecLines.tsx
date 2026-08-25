import type { ReactNode } from "react";

/**
 * รายละเอียดตัวเลือกของรายการ — "บรรทัดละหัวข้อ · หัวข้อหนาและเข้มกว่าค่าที่เลือก"
 * ใช้ร่วมกันทุกที่ที่โชว์ตัวเลือก (ตะกร้า/ออเดอร์ลูกค้า/ใบเสร็จ/ใบเสนอราคา/หลังบ้าน/ใบงาน)
 * เพื่อให้หน้าตาเหมือนกันทั้งระบบ ไม่ต้องแก้ทีละหน้าเวลาปรับสไตล์
 *
 * ขนาด/สีของ "ค่า" มาจาก className ของที่เรียกใช้ (แต่ละหน้าคุมเอง) — คอมโพเนนต์คุมแค่หัวข้อกับการขึ้นบรรทัด
 */

/** หัวข้อที่ไม่ต้องโชว์ (มีที่แสดงของตัวเองอยู่แล้ว หรือเป็นข้อมูลของทีมผลิต) */
export const SPEC_HIDE = ["ภาพลายที่แนบ", "รอเช็คสต๊อก", "ตำแหน่งลาย (ทีมผลิต)"];

/**
 * ออเดอร์เก่า/ใบเสนอราคาเก็บตัวเลือกเป็นข้อความรวมคั่นด้วย " · " — กางกลับเป็นคู่ หัวข้อ/ค่า
 * ค่าบางตัวมี " · " อยู่ข้างใน (เช่น "เรทราคา: พรีเมี่ยม · สกรีน 2 ด้าน") → ท่อนที่ไม่มีหัวข้อ
 * ให้ต่อท้ายค่าของหัวข้อก่อนหน้า ไม่ตัดเป็นบรรทัดใหม่
 */
export function parseSpecText(text: string): [string, string][] {
  const out: [string, string][] = [];
  // ขึ้นบรรทัดใหม่ = คนละหัวข้อเสมอ (ข้อความที่แอดมินพิมพ์เองในใบเสนอราคา/ออเดอร์เก่า)
  for (const line of text.split(/\n+/)) {
    const segs = line
      .split(/\s·\s/)
      .map((s) => s.trim())
      .filter(Boolean);
    let head = -1; // ตำแหน่งหัวข้อล่าสุดของบรรทัดนี้ — ท่อนที่ไม่มีหัวข้อไปต่อท้ายตัวนี้
    for (const seg of segs) {
      const m = seg.match(/^([^:]{1,60}?):\s*(.+)$/);
      // กัน "https://..." ถูกอ่านว่าเป็นหัวข้อ (มี : เหมือนกัน)
      const isLabel = m && !/^\s*https?$/i.test(m[1]);
      if (isLabel && m) {
        out.push([m[1].trim(), m[2].trim()]);
        head = out.length - 1;
      } else if (head >= 0) {
        out[head][1] += ` · ${seg}`;
      } else {
        out.push(["", seg]);
      }
    }
  }
  return out;
}

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
}: {
  sel?: Record<string, string>;
  text?: string;
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
}) {
  const entries = specEntries(sel, text, hide)
    .map(([k, v]) => [k, stripLinks ? stripUrls(v) : v] as [string, string])
    .filter(([, v]) => v);
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
            {k && <span className={`font-semibold ${labelClassName}`}>{k}:</span>}
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

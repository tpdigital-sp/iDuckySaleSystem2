"use client";

/**
 * รายละเอียดตัวเลือกของรายการ — บรรทัดละหัวข้อ "หัวข้อ: ค่า" แบบที่หน้าออเดอร์ใช้
 *
 * เดิมอยู่ในหน้าออเดอร์ตัวเดียว (src/app/admin/orders/[id]/page.tsx) แต่หน้าใบเสนอราคาต้องอ่าน
 * รายการแบบเดียวกันเป๊ะ (พนักงานสลับสองหน้านี้ทั้งวัน — 15 ก.ย. 69 ขอให้การ์ดรายการในใบเสนอราคา
 * "เหมือนหน้าคำสั่งซื้อ") จึงย้ายมาไว้ตรงกลาง ใช้ร่วมกันทั้งสองหน้า อย่าก๊อปโค้ดไปวางซ้ำ
 */
import { foldSizeExtra, specEntries, specLabel, specValueLines, tidySpec, withWorkSize } from "@/components/SpecLines";

/**
 * ข้อความรายละเอียดของรายการ — URL ยาวเหยียด (ลิงก์ไฟล์ต้นฉบับ) ทำให้อ่านไม่รู้เรื่อง
 * แทนด้วยไอคอน 🔗 กดเปิดไฟล์ได้ · ใช้ในที่ที่ห้ามมี <a> (เช่นในปุ่ม) ให้ส่ง plain
 */
export function SelText({ text, plain = false }: { text: string; plain?: boolean }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        !/^https?:\/\//.test(part) ? (
          <span key={i}>{part}</span>
        ) : plain ? (
          <span key={i} className="text-sky-600">
            🔗
          </span>
        ) : (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            title={part}
            onClick={(e) => e.stopPropagation()}
            className="mx-0.5 inline-flex items-center rounded bg-sky-50 px-1 align-middle text-sky-600 ring-1 ring-sky-200 transition hover:bg-sky-100"
          >
            🔗
          </a>
        ),
      )}
    </>
  );
}

/** ชื่อหัวข้อที่ไม่ต้องโชว์ในรายละเอียด (มีที่แสดงของตัวเองอยู่แล้ว) */
export const SEL_HIDE = ["ภาพลายที่แนบ", "ภาพลายที่แนบ (ด้านหลัง)", "รอเช็คสต๊อก"];
/**
 * 🎨 จอของฝ่ายผลิต (หน้าออเดอร์แอดมิน · โหมดแพ็ค · ใบงาน) — ซ่อน "เรทราคา" เพิ่ม (พนักงานแจ้ง 18 ก.ย. 69 · OD-260915-7011)
 * "เรทที่ 1 (สั่งแบบคละดีเทล)" เป็นเรื่องราคา กราฟฟิกไม่ได้ใช้ · หน้าลูกค้า/ใบเสร็จ/ใบเสนอราคายังโชว์เหมือนเดิม
 * ⚠️ ซ่อนเฉพาะตอนวาด — ค่ายังอยู่ในออเดอร์ (QuotePanel/ตารางราคาอ่านจาก sel ตรง ๆ)
 */
export const SEL_HIDE_PRODUCTION = [...SEL_HIDE, "เรทราคา"];
export const SEL_SPEC = "ตำแหน่งลาย (ทีมผลิต)";

/** ตัดค่าที่มีหลายลายให้เป็นบรรทัดละลาย (ใช้กติกาเดียวกับหน้าร้าน) */
const selLines = specValueLines;

/**
 * รายละเอียดของรายการ — บรรทัดละหัวข้อ · หลายลายแยกบรรทัดของใครของมัน
 * พิกัดของทีมผลิตยุบไว้ (กดกางเมื่อจะทำไฟล์เอง) เพราะยาวและไม่ได้ใช้ทุกครั้ง
 */
export function SelDetails({
  sel,
  text,
  workSize,
  production = false,
}: {
  sel?: Record<string, string>;
  text?: string;
  /** 📐 ขนาดงานตายตัวของสินค้า (Product.workSize) — สินค้าที่ไม่มีกลุ่มขนาดให้เลือก */
  workSize?: string;
  /**
   * 🎨 จอฝ่ายผลิต (หน้าออเดอร์แอดมิน) — ซ่อนเรทราคา (SEL_HIDE_PRODUCTION) + งานสแตนดี้ยุบเป็นแพทเทิร์นสั้น (compact)
   * ใบเสนอราคาไม่ส่ง = บรรทัดละหัวข้อครบเหมือนหน้าลูกค้า
   */
  production?: boolean;
}) {
  // ออเดอร์เก่าไม่มีตัวเลือกแบบหัวข้อ/ค่า — กางจากข้อความรวมให้เป็นบรรทัดละหัวข้อเหมือนกัน
  // บวก "เพิ่มขนาด" เข้าบรรทัดขนาดให้เหมือนหน้าร้าน/ใบงาน — ทีมผลิตอ่านขนาดจริงได้เลย
  const entries = withWorkSize(
    foldSizeExtra(tidySpec(specEntries(sel, text, production ? SEL_HIDE_PRODUCTION : SEL_HIDE), { compact: production })),
    workSize,
  );
  if (!entries.length) {
    return <span className="text-slate-300">— ยังไม่มีรายละเอียด —</span>;
  }
  return (
    <div className="space-y-0.5 break-words">
      {entries.map(([k, v], i) => {
        const lines = selLines(v);
        const label = k ? <span className="font-semibold text-slate-700">{specLabel(k)}:</span> : null;
        if (k === SEL_SPEC) {
          return (
            <details key={k} className="group">
              <summary className="cursor-pointer list-none text-slate-400 transition hover:text-slate-600">
                ▸ พิกัดสำหรับทำไฟล์เอง{lines.length > 1 ? ` (${lines.length} ลาย)` : ""}
              </summary>
              <div className="mt-0.5 space-y-0.5 border-l-2 border-slate-100 pl-2">
                {lines.map((x, n) => (
                  <p key={n}>
                    <SelText text={x} />
                  </p>
                ))}
              </div>
            </details>
          );
        }
        return (
          <div key={`${k}-${i}`}>
            {lines.length > 1 ? (
              <>
                <p>{label}</p>
                <div className="space-y-0.5 pl-3">
                  {lines.map((x, n) => (
                    <p key={n}>
                      <SelText text={x} />
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p>
                {label}
                {label && " "}
                <SelText text={lines[0] ?? v} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

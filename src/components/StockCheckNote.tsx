"use client";

import { LineButton } from "@/components/LineButton";
import type { StockCheckRow } from "@/lib/products";

/**
 * 📦 กล่องเตือน "สั่งจำนวนมาก — เช็คสต๊อกกับร้านก่อน" (หน้าสินค้า + ตะกร้า + หน้ายืนยันสั่งซื้อ)
 *
 * เดิมกล่องนี้มีที่หน้าสินค้าที่เดียว ลูกค้าที่เข้ามาทางอื่นจึงไม่เคยเห็น:
 *   · ปุ่ม "สั่งตามสเปคนี้" บนใบราคา /p/CODE หย่อนของลงตะกร้าให้เองแล้วเด้งไปตะกร้าเลย
 *   · เพิ่มจำนวนเอาทีหลังในตะกร้า (ตอนอยู่หน้าสินค้ายังไม่ถึงเกณฑ์)
 * → ออเดอร์จำนวนมากเข้ามาโดยลูกค้าไม่รู้ว่าต้องรอร้านยืนยันสต๊อก/คิวผลิตก่อน (พนักงานแจ้ง 14 ก.ย. 69)
 *
 * ⚠️ กติกา 2 ข้อของไฟล์นี้:
 *   1. ห้ามใช้คลาส ord-* — หน้ายืนยันสั่งซื้อไม่ได้อยู่ใต้ตัวครอบ .shopp สไตล์จะไม่ติด
 *   2. ห้ามใช้ ramp amber — ธีมแบรนด์รีแมป amber เป็นฟ้าไปแล้ว (globals.css) กล่องเตือนจะกลาย
 *      เป็นกล่องข้อมูลสีเดียวกับที่อื่นทั้งหน้า สีเตือนจริงของร้านคือเหลือง (เทียบ .ord-note.warn)
 */
export default function StockCheckNote({
  rows = [],
  title,
  note,
  highlight = false,
  className = "",
}: {
  /** บรรทัดที่ถึงเกณฑ์ (ตะกร้า/หน้ายืนยัน) — หน้าสินค้ามีรายการเดียวจึงบอกในหัวข้อแทน */
  rows?: StockCheckRow[];
  /** หัวข้อเอง (หน้าสินค้าบอกจำนวนที่กำลังจะสั่งเลย) */
  title?: React.ReactNode;
  /** แถบพิเศษเหนือหัวข้อ เช่นป้าย "ยังไม่ได้ใส่ตะกร้าให้" ของทางเข้าใบราคา */
  note?: React.ReactNode;
  /** ตีกรอบหนาขึ้น — ใช้ตอนที่ระบบจอดลูกค้าไว้ที่กล่องนี้ ต้องสะดุดตากว่าปกติ */
  highlight?: boolean;
  className?: string;
}) {
  if (rows.length === 0 && !title) return null;
  return (
    <div
      className={`rounded-2xl bg-yellow-50 p-4 ${
        highlight ? "ring-2 ring-yellow-400" : "ring-1 ring-yellow-300"
      } ${className}`}
    >
      {note}
      <p className="text-sm font-extrabold text-yellow-900">
        {title ?? "📦 สั่งจำนวนมาก — รบกวนเช็คสต๊อกกับแอดมินก่อนนะครับ"}
      </p>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="text-xs font-bold tabular-nums text-yellow-900">
              • {r.name} × {r.qty.toLocaleString("th-TH")} {r.unit}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs leading-relaxed text-yellow-800">
        จำนวนนี้อาจต้องสั่งวัสดุเพิ่มหรือจองคิวผลิต — ทักไลน์เช็คของกับรอบผลิตก่อนได้เลย
        หรือ<strong>สั่งไว้ก่อนก็ได้</strong> ทางร้านจะรีบยืนยันจำนวน/วันส่งให้ทางแชท
        (ยังไม่ต้องโอนจนกว่าจะยืนยัน)
      </p>
      <LineButton label="ทักไลน์เช็คสต๊อก" className="mt-3 w-full sm:w-auto" />
    </div>
  );
}

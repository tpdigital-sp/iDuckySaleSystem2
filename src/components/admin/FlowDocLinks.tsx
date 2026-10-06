"use client";

/**
 * 🔗 ลิงก์เอกสาร FlowAccount ในกล่อง FlowAccount หน้าออเดอร์ (ใบเสนอราคา/ใบแจ้งหนี้ + ใบกำกับภาษี/ใบเสร็จรับเงิน)
 * "เปิดเอกสาร ↗" = หน้าแชร์ share.flowaccount.com · "✏️ แก้ไขใน FlowAccount ↗" = หน้าแก้ไขในแอป (/api/admin/fa-edit → advance.flowaccount.com)
 * เคยมีปุ่ม 👁 พรีวิว (หน้าต่างซ้อน) — เจ้าของร้านให้เอาออก 6 ต.ค. 69 เหลือ 2 ลิงก์นี้
 */

export function FlowDocLinks({ url, editUrl }: { url: string; label?: string; editUrl?: string }) {
  return (
    <>
      <a href={url} target="_blank" rel="noreferrer" className="underline">
        เปิดเอกสาร ↗
      </a>
      {editUrl && (
        <>
          {" · "}
          <a href={editUrl} target="_blank" rel="noreferrer" className="underline" title="เปิดหน้าแก้ไขในแอป FlowAccount (ต้องล็อกอิน FlowAccount)">
            ✏️ แก้ไขใน FlowAccount ↗
          </a>
        </>
      )}
    </>
  );
}

import { orderForSsr, SSR_ORDER_SCRIPT_ID } from "@/lib/server/order-ssr";

/**
 * แปะข้อมูลออเดอร์ใบนี้มากับ HTML เลย — หน้ารายละเอียดจะได้ไม่ต้องเรียก API อีกรอบก่อนวาด
 * (บนเว็บจริงค่าเรียก serverless function รอบละ ~0.6-0.8 วิ · ตัดออกได้ 1 รอบเต็ม ๆ)
 *
 * ทำที่ layout เพราะหน้า page.tsx เป็น client component (ทั้งไฟล์) — layout เป็น server component
 * จึงดึงข้อมูลฝั่งเซิร์ฟเวอร์ได้โดยไม่ต้องรื้อหน้าใหญ่ · ไม่มีสิทธิ์/หาไม่เจอ = ไม่แปะอะไรเลย
 * แล้วหน้าเว็บก็โหลดทาง API ตามปกติเหมือนเดิม
 */
export default async function OrderDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await orderForSsr(decodeURIComponent(id));
  return (
    <>
      {order ? (
        <script
          id={SSR_ORDER_SCRIPT_ID}
          type="application/json"
          // ปิด </script> ในข้อมูลไม่ให้ตัด tag (ชื่อ/หมายเหตุลูกค้าพิมพ์อะไรมาก็ได้)
          dangerouslySetInnerHTML={{ __html: JSON.stringify(order).replace(/</g, "\\u003c") }}
        />
      ) : null}
      {children}
    </>
  );
}

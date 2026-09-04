/**
 * id ของ <script> ที่ layout ฝั่งเซิร์ฟเวอร์ใช้แปะข้อมูลออเดอร์มากับ HTML
 * แยกไฟล์เพราะฝั่งหน้าเว็บ (client) import จาก lib/server/* ไม่ได้ (มี "server-only")
 */
export const SSR_ORDER_SCRIPT_ID = "__iducky_ssr_order";

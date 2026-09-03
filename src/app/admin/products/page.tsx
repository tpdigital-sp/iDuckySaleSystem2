import { getAdminProductRows } from "@/lib/products-server";
import ProductsClient from "./ProductsClient";

/**
 * หน้ารายการสินค้าหลังบ้าน — เปลือกฝั่งเซิร์ฟเวอร์ที่ดึง "แถวรายการ" มาให้ก่อน
 * เพื่อให้ HTML แรกมีรูปปก/ชื่อ/สถานะครบ · หน้าจอจึงสลับจากภาพหน้าเดิมมาเป็นของจริงทีเดียว
 * ไม่ต้องผ่านช่วงที่ยังไม่มีข้อมูล (ที่ทำให้รู้สึกว่า "รีเฟรชแล้วยังเห็นรูปเก่า")
 * ของหนัก (ตัวเลือก/ตารางราคา/จำนวนรูป) ฝั่งหน้าเว็บโหลดตามมาเติมเอง
 */
export const dynamic = "force-dynamic"; // หน้าจัดการสินค้า ต้องเห็นของสดเสมอ ห้ามแคชหน้า

export default async function AdminProductsPage() {
  const initial = await getAdminProductRows();
  return <ProductsClient initial={initial} />;
}

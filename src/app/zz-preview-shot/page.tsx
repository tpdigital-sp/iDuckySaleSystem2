"use client";
/** ชั่วคราวสำหรับถ่ายภาพหน้าตัวอย่างเท่านั้น — ลบทิ้งหลังตรวจเสร็จ */
import { PermProvider } from "@/lib/perm-context";
import { ALL_PERMS } from "@/lib/permissions";
import OrdersPreviewPage from "@/app/admin/orders-preview/page";

export default function Shot() {
  return (
    <PermProvider value={{ perms: [...ALL_PERMS], role: "Administrator", name: "ทดสอบ", isAdministrator: true }}>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <OrdersPreviewPage />
      </div>
    </PermProvider>
  );
}

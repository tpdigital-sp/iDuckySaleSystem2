import { redirect } from "next/navigation";

/** ย้ายไปรวมที่หน้าตั้งค่าระบบแล้ว — คงเส้นทางเดิมไว้กันลิงก์เก่าพัง */
export default function AdminPaymentRedirect() {
  redirect("/admin/settings");
}

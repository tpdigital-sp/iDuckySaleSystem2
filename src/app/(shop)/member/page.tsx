import type { Metadata } from "next";
import MemberClient from "./MemberClient";

export const metadata: Metadata = {
  title: "สมาชิก iDucky — ยิ่งสั่ง ยิ่งลด",
  description: "สมัครสมาชิก iDucky ฟรีด้วย LINE ยอดซื้อสะสมขึ้นระดับ Bronze ถึง Diamond ได้ส่วนลดอัตโนมัติทุกบิล ใช้คูปอง และดูประวัติออเดอร์ได้ในที่เดียว",
  alternates: { canonical: "/member" },
};

export default function MemberPage() {
  return <MemberClient />;
}

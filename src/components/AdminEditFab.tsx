import Link from "next/link";

/**
 * ปุ่มลัด "เข้าหลังบ้าน" ลอยมุมขวาล่าง — เห็นเฉพาะทีมงานที่ล็อกอินหลังบ้านอยู่
 * ใช้ร่วมกันทุกหน้า (หน้าแรก · หน้าสินค้า · หน้าออเดอร์) จะได้หน้าตา/ตำแหน่งเหมือนกันหมด
 *
 * ⚠️ ทำไมพื้นขาว ไม่ใช่พื้นเข้มแบบเดิม (bg-stone-800 + ring-black/10)
 *    ท้ายทุกหน้าเป็น footer พื้นกรมท่าเข้ม ปุ่มเข้มบนพื้นเข้มจะจมหายทั้งใบ
 *    (ใส่แค่วงแหวนขาวช่วยได้แค่เห็นขอบ ตัวปุ่มยังกลืน) → กลับด้านเป็นพื้นขาวไปเลย
 *
 * รูปทรงล้อปุ่มหลักของหน้าร้าน (.btn + .dot ใน landing.css) — แคปซูลขาว + วงกลมไอคอนกรมท่า
 * ชี้เมาส์แล้ววงกลมเปลี่ยนเป็นเหลืองเป็ด เหมือนปุ่ม "ช้อปเลย →" จะได้เป็นภาษาเดียวกันทั้งเว็บ
 *
 * ตำแหน่ง bottom-5 = ชั้นล่างสุดของปุ่มลอย (ถัดขึ้นไป: bottom-20 LINE · bottom-36 แชทบอท)
 */
export default function AdminEditFab({
  href,
  title,
  label = "แก้ไขในหลังบ้าน",
}: {
  href: string;
  title: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="group fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-4 shadow-[0_8px_24px_rgba(15,23,42,0.22)] ring-1 ring-stone-900/10 backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.3)]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#173A6B] text-white transition duration-200 group-hover:bg-[#FFD447] group-hover:text-[#173A6B]">
        {/* ประแจ — ใช้ SVG แทนอิโมจิ 🔧 ที่แต่ละเครื่องวาดคนละแบบและดูเป็นภาพคลิปอาร์ต */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.6 2.6 0 0 1-3.7-3.7l9-9a4 4 0 0 0-1.3-1.3Z" />
        </svg>
      </span>
      <span className="text-[13px] font-bold leading-none text-[#173A6B]">{label}</span>
    </Link>
  );
}

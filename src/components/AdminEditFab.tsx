import Link from "next/link";

/**
 * ปุ่มลัด "เข้าหลังบ้าน" ลอยมุมขวาล่าง — เห็นเฉพาะทีมงานที่ล็อกอินหลังบ้านอยู่
 * ใช้ร่วมกันทุกหน้า (หน้าแรก · หน้าสินค้า · หน้าออเดอร์) จะได้หน้าตา/ตำแหน่งเหมือนกันหมด
 *
 * ⚠️ ทำไมพื้นขาวตัวอักษรเข้ม ไม่ใช่พื้นเข้มแบบเดิม (bg-stone-800 + ring-black/10)
 *    ท้ายทุกหน้าเป็น footer พื้นกรมท่าเข้ม ปุ่มเข้มบนพื้นเข้มจะจมหายทั้งใบ
 *    (ใส่วงแหวนขาวช่วยได้แค่เห็นขอบ ตัวปุ่มยังกลืน) → กลับด้านเป็นพื้นขาวไปเลย
 *    ขาวเด่นบนกรมท่า ส่วนบนพื้นสว่างใช้ขอบเทา + เงา คุมรูปทรงไว้
 *
 * ตำแหน่ง bottom-5 = ชั้นล่างสุดของปุ่มลอย (ถัดขึ้นไป: bottom-20 LINE · bottom-36 แชทบอท)
 */
export default function AdminEditFab({
  href,
  title,
  label = "🔧 แก้ไขในหลังบ้าน",
}: {
  href: string;
  title: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-stone-800 shadow-[0_6px_20px_rgba(15,23,42,0.28)] ring-1 ring-stone-900/15 transition hover:scale-105 hover:bg-stone-50"
    >
      {label}
    </Link>
  );
}

import Link from "next/link";

/**
 * ปุ่มลัด "เข้าหลังบ้าน" ลอยมุมขวาล่าง — เห็นเฉพาะทีมงานที่ล็อกอินหลังบ้านอยู่
 * ใช้ร่วมกันทุกหน้า (หน้าแรก · หน้าสินค้า · หน้าออเดอร์)
 *
 * ── โครงสร้าง ──
 * ล็อกความสูงปุ่มไว้ที่ 40px (h-10) แล้วให้วงกลมไอคอน 28px (h-7)
 * เหลือขอบบน-ล่างข้างละ 6px — วงกลมจึงอยู่ในส่วนโค้งของแคปซูลเสมอ
 * (ของเดิมวงกลม 32px ในแคปซูลสูง 44px เหลือขอบแค่ 6px แต่รัศมีโค้งของแคปซูล 22px
 *  มุมวงกลมเลยโผล่พ้นขอบโค้งออกมา ดูเหมือนปุ่มแตก)
 *
 * ── สี ──
 * พื้นขาวโปร่ง เพราะท้ายทุกหน้าเป็น footer กรมท่าเข้ม ปุ่มเข้มจะจมหาย
 * วงกลมใช้ "สเลท" ไม่ใช่กรมท่าแบรนด์ — ตั้งใจให้อ่านว่าเป็นเครื่องมือของทีมงาน
 * ไม่ใช่ปุ่มชวนลูกค้ากด (ปุ่มลูกค้าใช้กรมท่า/เขียว/เหลืองไปหมดแล้ว)
 * ชี้เมาส์แล้ววงกลมเป็นเหลืองเป็ด — จังหวะเดียวกับปุ่มหลักของร้าน
 *
 * มือถือซ่อนข้อความเหลือแต่วงกลม (เหมือนปุ่ม LINE/แชทบอท) กันปุ่มลอย 3 ตัวเบียดจอ
 * ตำแหน่ง bottom-5 = ชั้นล่างสุด (ถัดขึ้นไป: bottom-20 LINE · bottom-36 แชทบอท)
 *
 * ⚠️ ระยะห่างในปุ่มต้องสั่งด้วย inline style ห้ามใช้คลาส p-* ของ Tailwind
 *    หน้าแรกครอบด้วย .dl ซึ่ง landing.css มีกฎ `.dl *{margin:0;padding:0}`
 *    specificity เท่ากับคลาส Tailwind → padding โดนรีเซ็ตเป็น 0 เฉพาะหน้าแรก
 *    วงกลมเลยชิดขอบจนดูเหมือนปุ่มแตก (หน้าอื่นที่ไม่มี .dl กลับปกติ — หลอกตามาก)
 *    inline style ชนะทุกคลาส จึงได้หน้าตาเดียวกันทุกหน้า
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
      aria-label={title}
      style={{ paddingLeft: 6, paddingRight: 6 }}
      className="group fixed bottom-5 right-5 z-40 max-[1000px]:bottom-24 inline-flex h-10 items-center gap-2 rounded-full bg-white/90 shadow-[0_2px_6px_rgba(15,23,42,0.12),0_10px_24px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10 backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_10px_rgba(15,23,42,0.16),0_16px_32px_rgba(15,23,42,0.24)]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-white transition duration-200 group-hover:bg-[#FFD447] group-hover:text-slate-900">
        {/* ดินสอ (Lucide pencil) — ตรงกับคำว่า "แก้ไข" และรูปทรงเรียบพอที่จะอ่านออกที่ 14px
            ของเดิมใช้อิโมจิ 🔧 แล้วเปลี่ยนเป็น path ประแจที่วาดเองซึ่งกลายเป็นก้อนอ่านไม่ออก */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
      {/* ระยะขวาอยู่ที่ตัวข้อความ ไม่ใช่ที่ปุ่ม — พอมือถือซ่อนข้อความ ปุ่มจะหดเป็นวงกลมพอดีเอง
          (ถ้าไปใส่ pr แบบ responsive ที่ปุ่ม จะโดน .dl * รีเซ็ตทับอีก) */}
      <span
        style={{ paddingRight: 10 }}
        className="hidden text-[12.5px] font-bold leading-none tracking-tight text-slate-700 sm:inline"
      >
        {label}
      </span>
    </Link>
  );
}

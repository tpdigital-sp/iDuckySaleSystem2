import Link from "next/link";

/**
 * ปุ่มลัด "เข้าหลังบ้าน" ลอยมุมขวาล่าง — เห็นเฉพาะทีมงานที่ล็อกอินหลังบ้านอยู่
 * ใช้ร่วมกันทุกหน้า (หน้าแรก · หน้าสินค้า · หน้าออเดอร์)
 *
 * ── ทรงปุ่ม (เดสก์ท็อป) ──
 * มาจากชุด .fabx ท้าย landing.css — ชุดเดียวกับตะกร้า/LINE/แชทบอท
 * (พิลล์สูง 46px · ขอบขาว 2px · วงไอคอน 34px · ฟอนต์ Mitr) คลาส Tailwind ที่เหลือคุมมือถือ
 *
 * ── โครงสร้าง ──
 * เดสก์ท็อป: สูง 46px วงไอคอน 34px (จาก .fabx) — เหลือขอบบน-ล่างข้างละ 6px
 * มือถือ: สูง 40px (h-10) วงไอคอน 28px (h-7) ขอบข้างละ 6px
 * สัดส่วนนี้สำคัญ — ถ้าวงกลมใหญ่เกินจนขอบเหลือน้อยกว่านี้ มุมวงกลมจะโผล่พ้นขอบโค้งของแคปซูล
 * (ของเดิมวงกลม 32px ในแคปซูลสูง 44px มุมโผล่ออกมา ดูเหมือนปุ่มแตก)
 *
 * ── สี ──
 * พื้นขาวโปร่ง เพราะท้ายทุกหน้าเป็น footer กรมท่าเข้ม ปุ่มเข้มจะจมหาย
 * วงกลมใช้ "สเลท" ไม่ใช่กรมท่าแบรนด์ — ตั้งใจให้อ่านว่าเป็นเครื่องมือของทีมงาน
 * ไม่ใช่ปุ่มชวนลูกค้ากด (ปุ่มลูกค้าใช้กรมท่า/เขียว/เหลืองไปหมดแล้ว)
 * ชี้เมาส์แล้ววงกลมเป็นเหลืองเป็ด — จังหวะเดียวกับปุ่มหลักของร้าน
 *
 * มือถือซ่อนข้อความเหลือแต่วงกลม (เหมือนปุ่ม LINE/แชทบอท) กันปุ่มลอย 3 ตัวเบียดจอ
 * ตำแหน่ง = ชั้นล่างสุดของกอง (ถัดขึ้นไป: LINE · แชทบอท · ตะกร้า)
 *
 * ⚠️ ระยะห่างในปุ่มต้องมาจาก CSS ของ .fabx ห้ามใช้คลาส p-* ของ Tailwind
 *    หน้าแรกครอบด้วย .dl ซึ่ง landing.css มีกฎ `.dl *{margin:0;padding:0}`
 *    specificity เท่ากับคลาส Tailwind → padding โดนรีเซ็ตเป็น 0 เฉพาะหน้าแรก
 *    วงกลมเลยชิดขอบจนดูเหมือนปุ่มแตก (หน้าอื่นที่ไม่มี .dl กลับปกติ — หลอกตามาก)
 *    กฎ .fabx อยู่ท้าย landing.css จึงมาทีหลัง .dl * และชนะเสมอ
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
      className="group fabx fabx-admin fixed bottom-5 right-5 z-40 max-[1000px]:bottom-[92px] max-[1000px]:left-4 max-[1000px]:right-auto inline-flex h-10 items-center gap-2 rounded-full bg-white/90 ring-1 ring-slate-900/10 backdrop-blur-md transition duration-200"
    >
      <span className="fabx-ico grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-white transition duration-200">
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
      {/* ขนาด/น้ำหนักตัวอักษรมาจากชุด .fabx — ที่นี่สั่งแค่ "มือถือซ่อนข้อความ" กับระยะขวาตอนจอเล็ก */}
      <span className="fabx-label hidden max-[1000px]:text-[12.5px] sm:inline max-[1000px]:pr-2.5">
        {label}
      </span>
      <svg className="fabx-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

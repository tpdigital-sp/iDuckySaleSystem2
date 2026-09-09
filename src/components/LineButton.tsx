/** ปุ่ม LINE ร้าน — ติดต่อ/แจ้งยืนยันออเดอร์ทางแชท */

/**
 * ลิงก์ LINE ร้าน (แก้ที่นี่ที่เดียว)
 * ชี้เข้า /line ของเว็บเอง แล้วให้ route เลือกปลายทางตามอุปกรณ์:
 * มือถือ = เข้าห้องแชทร้านตรง ๆ · คอม = หน้าโปรไฟล์ + QR (ดู src/app/line/route.ts)
 */
export const LINE_URL = "/line";

/** ไอคอนแชท (สื่อถึงการทักแชท LINE) */
function ChatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.52 1.46 4.76 3.75 6.23-.14.94-.63 2.23-1.24 3.15-.22.33.06.76.44.66 2-.52 3.44-1.2 4.35-1.74.86.18 1.76.28 2.7.28 5.52 0 10-3.58 10-8S17.52 3 12 3Z" />
    </svg>
  );
}

/**
 * ปุ่ม LINE ลอยมุมขวาล่าง (ทุกหน้าร้าน) — มาร์กอัป .line-fab ตามไฟล์ต้นแบบ LADNDING PAGE.html
 * เดสก์ท็อป = พิลล์เขียวมีข้อความ · มือถือ = วงกลม 💬 เหนือแถบเมนูล่าง + ป้าย "ทักเราได้เลยนะ 👋" โผล่เป็นระยะ
 * สไตล์อยู่ใน landing.css (ต้องอยู่ใต้ตัวครอบ .dl — ดู (shop)/layout.tsx)
 */
export function LineFloat() {
  return (
    <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="line-fab" aria-label="คุยกับแอดมินตัวจริงทาง LINE">
      <i className="line-fab-ico">💬</i>
      <span className="line-fab-tip">ทักเราได้เลยนะ 👋</span>
    </a>
  );
}

/** ปุ่ม LINE แบบธรรมดา (ใช้ในหน้าตะกร้า/ที่อื่น) */
export function LineButton({
  label = "แจ้ง/ยืนยันออเดอร์ทาง LINE",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-[#05b34c] ${className}`}
    >
      <ChatIcon /> {label}
    </a>
  );
}

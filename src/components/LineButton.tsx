/** ปุ่ม LINE ร้าน — ติดต่อ/แจ้งยืนยันออเดอร์ทางแชท */

/** ลิงก์ LINE Official ของร้าน (แก้ที่นี่ที่เดียว) */
export const LINE_URL = "https://lin.ee/x8GkqGZ";

/** ไอคอนแชท (สื่อถึงการทักแชท LINE) */
function ChatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.52 1.46 4.76 3.75 6.23-.14.94-.63 2.23-1.24 3.15-.22.33.06.76.44.66 2-.52 3.44-1.2 4.35-1.74.86.18 1.76.28 2.7.28 5.52 0 10-3.58 10-8S17.52 3 12 3Z" />
    </svg>
  );
}

/** ปุ่ม LINE ลอยมุมจอ (ทุกหน้าร้าน) — ติดต่อสอบถาม */
export function LineFloat() {
  return (
    <a
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="แชทกับร้านทาง LINE"
      // มุมขวาล่างตามดีไซน์ — มุมซ้ายล่างเป็นแถวไอคอนโซเชียลของหน้าแรก
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-3 text-sm font-bold text-white shadow-lg ring-4 ring-[#06C755]/20 transition hover:scale-105 hover:bg-[#05b34c]"
    >
      <ChatIcon />
      <span className="hidden sm:inline">แชทกับร้าน (LINE)</span>
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

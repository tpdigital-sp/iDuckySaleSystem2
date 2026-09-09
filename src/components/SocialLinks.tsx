/**
 * ช่องทางโซเชียลของร้าน (ไอคอน SVG ชุดเดียวกับไฟล์ต้นแบบ) — ใช้ร่วมกัน 3 ที่:
 * ท้ายเว็บ (Footer) · ตุ่มลอยมุมซ้ายล่างหน้าแรก (social-dock) · เมนูสามขีดบนมือถือ (MobileNav)
 */
export const SOCIAL_LINKS: { key: string; name: string; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: "fb",
    name: "Facebook",
    label: "Facebook",
    href: "https://www.facebook.com/iduckyshop",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
      </svg>
    ),
  },
  {
    key: "ig",
    name: "Instagram",
    label: "Instagram",
    href: "https://www.instagram.com/iduckyshop1",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5.4" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "tt",
    name: "TikTok",
    label: "TikTok",
    href: "https://www.tiktok.com/@iduckyofficial",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.5 2h-2.9v13.2a2.5 2.5 0 11-2.1-2.5v-3a5.5 5.5 0 105.1 5.5V9.1a6.6 6.6 0 003.9 1.3V7.5a3.8 3.8 0 01-3.9-3.8V2z" />
      </svg>
    ),
  },
  {
    key: "x",
    name: "X",
    label: "X (Twitter)",
    href: "https://x.com/iduckyshop",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.4-5.7L6 21H2.9l7.3-8.3L2.5 3h6.4l4 5.3L17.5 3zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3z" />
      </svg>
    ),
  },
];

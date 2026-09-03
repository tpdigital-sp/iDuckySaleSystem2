/**
 * กลุ่มแท็บหมวดสินค้า 4 กลุ่ม (ตามดีไซน์ทีม Content) — ใช้ร่วมกัน 2 ที่
 *  1) แท็บกรองหมวดในโซน "สินค้าและบริการ" บนหน้าแรก ((shop)/page.tsx)
 *  2) เมนูดรอปดาวน์ "สินค้าและบริการ" บนแถบเมนู (NavCatMenu — ต้นแบบ MEGAMENU_01)
 * หมวดที่ไม่อยู่ในลิสต์ไหนเลย (เช่นหมวดที่แอดมินเพิ่งสร้าง) ตกไปกลุ่ม "ของใช้ & แก็ดเจ็ต"
 */
export const TAB_GROUPS: { id: string; label: string; emoji: string; cats: string[] }[] = [
  // ⚠️ อิงชุดหมวดจริงในฐาน ณ 2 ก.ย. 69 (แอดมินจัดหมวดใหม่ 13 หมวด — id เก่าบางตัวถูกเปลี่ยนความหมาย
  //    เช่น apparel = "Daily Goods ของใช้/แก้ว/กระจก" แล้ว ไม่ใช่เสื้อผ้า) · id เก่าที่ยังไม่มีในฐานคงไว้เผื่อกลับมาใช้
  { id: "acrylic", label: "อะคริลิค & สแตนดี้", emoji: "🔑", cats: ["acrylic", "acrylic-bending", "standee", "light", "mirror-magnet"] },
  { id: "paper", label: "งานกระดาษ & สติ๊กเกอร์", emoji: "💌", cats: ["sticker-paper", "card-photo", "banner", "calendar-frame", "cat-msrdpxqn"] },
  { id: "goods", label: "ของใช้ & แก็ดเจ็ต", emoji: "☕", cats: ["phone-gadget", "home", "bag", "apparel", "cat-mssijpgu"] },
  { id: "wear", label: "เสื้อผ้า & ของขวัญ", emoji: "👕", cats: ["fabric", "gifts", "cat-mt2bpoyj", "cat-mssnwupp"] },
];

export const groupOf = (catId: string) => TAB_GROUPS.find((g) => g.cats.includes(catId))?.id ?? "goods";

/** ไอคอนวาดมือของหมวดหลัก (จากไฟล์ต้นแบบ) — หมวดอื่นใช้อีโมจิของหมวดนั้น */
export const CAT_ICON: Record<string, string> = {
  acrylic: "/landing/cat-ico-1.webp",
  standee: "/landing/cat-ico-2.webp",
  "card-photo": "/landing/cat-ico-3.webp",
  "sticker-paper": "/landing/cat-ico-4.webp",
  home: "/landing/cat-ico-5.webp",
  light: "/landing/cat-ico-6.webp",
  "phone-gadget": "/landing/cat-ico-7.webp",
  apparel: "/landing/cat-ico-8.webp",
  fabric: "/landing/cat-ico-9.webp",
  gifts: "/landing/cat-ico-10.webp",
};

/** สีพาสเทลประจำหมวดในเมนูดรอปดาวน์ (ตามต้นแบบ MEGAMENU_01) — หมวดอื่นวนใช้ชุดสำรอง */
const CAT_ACCENT: Record<string, string> = {
  acrylic: "#BFE3FB",
  standee: "#FFE9A8",
  light: "#FFD8A8",
  "card-photo": "#FFD1DE",
  "sticker-paper": "#A9E5D2",
  home: "#D6CFFB",
  "phone-gadget": "#AEE0F7",
  apparel: "#FFC2D6",
  fabric: "#BDEEDA",
  gifts: "#E3B8F5",
};
const ACCENT_POOL = ["#BFE3FB", "#FFE9A8", "#FFD1DE", "#A9E5D2", "#D6CFFB", "#FFD8A8", "#AEE0F7", "#FFC2D6", "#BDEEDA", "#E3B8F5"];

export const accentOf = (catId: string, index: number) => CAT_ACCENT[catId] ?? ACCENT_POOL[index % ACCENT_POOL.length];

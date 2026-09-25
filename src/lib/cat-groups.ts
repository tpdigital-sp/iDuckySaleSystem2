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

/** ครึ่งอังกฤษของชื่อหมวด ("Keychain & Acrylic — พวงกุญแจ" → "Keychain & Acrylic") · ไม่มีขีด = ไม่มีชื่ออังกฤษ */
export const catEnName = (name: string) => {
  const i = name.indexOf("—");
  return i < 0 ? "" : name.slice(0, i).trim();
};

/** สีพาสเทลของการ์ดหมวดบนหน้าแรก — วนตามลำดับการ์ด (ไม่ผูก id) เพื่อให้ใบข้าง ๆ กันไม่ซ้ำสีเสมอ */
export const HOME_TILE_ACCENTS = ["#BFE3FB", "#FFE9A8", "#FFD1DE", "#A9E5D2", "#D6CFFB", "#FFD8A8", "#AEE0F7", "#E3B8F5", "#BDEEDA", "#FFC2D6"];

export const groupOf = (catId: string) => TAB_GROUPS.find((g) => g.cats.includes(catId))?.id ?? "goods";

/** ไอคอนหมวด — ชุดใหม่ 13 ชิ้น (เจ้าของร้านส่งเป็นภาพรวมแผ่นเดียว 25 ก.ย. 69 → ตัดแยก+ลบพื้นตารางด้วย scripts/_tmp/cut-icons.mjs)
 *  ครบทุกหมวดในฐาน ณ วันนั้น · หมวดใหม่ที่ยังไม่มีในนี้จะใช้รูปหมวดจากหลังบ้าน (ถ้ามี) หรืออีโมจิของหมวด
 *  ชุดเก่า cat-ico-1..10 (ต้นแบบทีม Content) ยังอยู่ใน /public/landing เผื่อสคริปต์สร้าง landing.css จับคู่รูป */
export const CAT_ICON: Record<string, string> = {
  acrylic: "/landing/cat-ico2-01.webp", // พวงกุญแจดาว
  standee: "/landing/cat-ico2-02.webp", // สแตนดี้
  "phone-gadget": "/landing/cat-ico2-03.webp", // เคสมือถือ
  "cat-mssijpgu": "/landing/cat-ico2-04.webp", // ซองใส่บัตร + สายคล้อง
  "sticker-paper": "/landing/cat-ico2-05.webp", // สติ๊กเกอร์/กระดาษโน้ต
  banner: "/landing/cat-ico2-06.webp", // โปสเตอร์ม้วน + ป้ายแขวน
  "cat-mt2bpoyj": "/landing/cat-ico2-07.webp", // เสื้อ + หมวก (Fashion)
  fabric: "/landing/cat-ico2-08.webp", // หมอน (Home & Living)
  gifts: "/landing/cat-ico2-09.webp", // กล่องของขวัญ
  "cat-msrdpxqn": "/landing/cat-ico2-10.webp", // สมุด + ปากกา (Stationery)
  apparel: "/landing/cat-ico2-11.webp", // แก้วมัค + แก้วใส (Daily Goods)
  bag: "/landing/cat-ico2-12.webp", // กระเป๋า
  "cat-mssnwupp": "/landing/cat-ico2-13.webp", // ปลอกคอสัตว์เลี้ยง
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

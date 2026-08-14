/**
 * หมวดหมู่สินค้าที่แอดมินแก้เองได้จากหลังบ้าน
 *
 * เก็บเป็นแถวพิเศษ id "__categories__" ในตาราง products (วิธีเดียวกับ __shop_payment__)
 * — ไม่ต้องสร้างตารางใหม่/รัน SQL และ fetchProducts กรอง id ที่ขึ้นต้น "__" ออกอยู่แล้ว
 *
 * ยังไม่เคยแก้ในหลังบ้าน = ใช้ CATEGORIES ในโค้ดเป็นค่าเริ่มต้น (หน้าเว็บจึงไม่มีวันว่าง)
 */
export interface ShopCategory {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  gradient: string;
  description: string;
  /** รูปหมวด (URL) — มีแล้วการ์ดหมวดบนหน้าแรกโชว์รูปนี้แทนอีโมจิ */
  image?: string;
  /** ซ่อนจากหน้าร้าน (ยังอยู่ในระบบ สินค้าเดิมไม่หาย) */
  hidden?: boolean;
}

/**
 * ค่าเริ่มต้นก่อนโหลด/เมื่อฐานว่าง = snapshot ของหมวดจริงในฐาน ณ 14 ส.ค. 2569 (18 หมวด)
 *
 * ⚠️ เดิม map มาจาก CATEGORIES ใน products.ts (ชุดออกแบบเก่า 15 หมวด) ทำให้เฟรมแรก
 * ของหน้าแรกขึ้น "15 หมวด" แล้วค่อยเด้งเป็น 18 หลังโหลดเสร็จ — snapshot นี้แก้อาการแว้บ
 * ค่าจริงยังมาจากฐานเสมอหลัง fetchCategories() สำเร็จ · ถ้าแอดมินแก้หมวดครั้งใหญ่
 * ควรอัปเดต snapshot นี้ตาม (ไม่อัปเดตก็แค่เฟรมแรกเพี้ยนชั่วครู่ ไม่พัง)
 */
export const DEFAULT_CATEGORIES: ShopCategory[] = [
  { id: "acrylic", name: "พวงกุญแจ / อะคริลิค", nameEn: "Acrylic", emoji: "🔑", gradient: "from-sky-200 to-cyan-300", description: "พวงกุญแจอะคริลิค Jibbitz บัคเคิ้ล เขย่า แจกัน กิ๊บ และงานอะคริลิคทั่วไป" },
  { id: "standee", name: "สแตนดี้", nameEn: "Standee", emoji: "🧍", gradient: "from-indigo-200 to-blue-300", description: "สแตนดี้อะคริลิคทุกแบบ ตั้งโต๊ะ จิ๋ว ตั้งมือถือ ฐานเพลง โยกเยก หมุน" },
  { id: "light", name: "สแตนดี้ฐานไฟ / LIGHT", nameEn: "Light", emoji: "💡", gradient: "from-blue-200 to-indigo-300", description: "สแตนดี้ฐานไฟ กล่องไฟ แท่งไฟ งานเรืองแสง" },
  { id: "phone-gadget", name: "เคสมือถือ / แก็ดเจ็ต", nameEn: "Phone & Gadget", emoji: "📱", gradient: "from-slate-200 to-blue-200", description: "เคสมือถือ Airpods สายคล้อง Griptok Magsafe นาฬิกา Power Bank" },
  { id: "cat-mssijpgu", name: "ซองใส่บัตร / สายคล้อง", nameEn: "", emoji: "🪪", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "sticker-paper", name: "สติ๊กเกอร์ / กระดาษ", nameEn: "Sticker & Paper", emoji: "🏷️", gradient: "from-sky-200 to-blue-200", description: "สติกเกอร์ Die-Cut งานกระดาษ พิมพ์ตามสั่ง" },
  { id: "card-photo", name: "Photocard / Postcard / Shikishi", nameEn: "Card & Photo", emoji: "🎴", gradient: "from-pink-200 to-rose-200", description: "โฟโต้การ์ด ชิกิชิ Card Board Name Tag ที่คั่นหนังสือ" },
  { id: "banner", name: "โปสเตอร์ / Banner / ป้าย", nameEn: "Banner & Poster", emoji: "📢", gradient: "from-amber-200 to-yellow-200", description: "โปสเตอร์แขวนผนัง ป้าย Banner ไวนิล ผ้าเชียร์ สโลแกน" },
  { id: "bag", name: "กระเป๋า", nameEn: "Bag", emoji: "👜", gradient: "from-emerald-200 to-teal-200", description: "กระเป๋าผ้าดิบ กระเป๋าโฮโล Laptop Bag Candybag" },
  { id: "apparel", name: "เสื้อผ้า / หมวก / ร่ม", nameEn: "Apparel", emoji: "👕", gradient: "from-green-200 to-emerald-300", description: "เสื้อสกรีน/ปัก หมวก ร่ม ปลอกคอ/เสื้อสัตว์เลี้ยง" },
  { id: "fabric", name: "ผ้า / หมอน / ผ้าห่ม", nameEn: "Fabric", emoji: "🧶", gradient: "from-emerald-200 to-teal-300", description: "ปลอกหมอน ผ้าห่ม ผ้าขนหนู ยางรัดผม ผ้าหลา" },
  { id: "mirror-magnet", name: "กระจก / แม่เหล็ก", nameEn: "Mirror & Magnet", emoji: "🪞", gradient: "from-cyan-200 to-teal-200", description: "กระจกอะคริลิค แม่เหล็กติดตู้เย็น เข็มกลัด" },
  { id: "calendar-frame", name: "กรอบรูป", nameEn: "Calendar & Frame", emoji: "🖼️", gradient: "from-orange-200 to-amber-200", description: "ปฏิทิน กรอบรูป Canvas Frame" },
  { id: "home", name: "ของแต่งบ้าน / แก้ว / เมาส์แพด", nameEn: "Home", emoji: "🏠", gradient: "from-teal-200 to-cyan-200", description: "แก้วน้ำ แผ่นรองแก้ว เมาส์แพด พรมเช็ดเท้า ฟองน้ำ" },
  { id: "gifts", name: "ของขวัญ / ปัก / ตุ๊กตา", nameEn: "Gifts", emoji: "🧸", gradient: "from-rose-200 to-pink-300", description: "อาร์มปัก ตุ๊กตาปัก ของขวัญชิ้นเล็ก" },
  { id: "cat-msrdpxqn", name: "สมุด / ปฏิทิน", nameEn: "", emoji: "🏷️", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "cat-mssnwupp", name: "สัตว์เลี้ยง", nameEn: "", emoji: "🐶", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "cat-mssj6ytb", name: "อื่นๆ", nameEn: "", emoji: "✨", gradient: "from-amber-100 to-amber-200", description: "" },
];

/** ค่าที่ใช้จริง — ไม่มีในฐาน/ว่าง = ค่าเริ่มต้นจากโค้ด */
export function categoriesOf(rows: ShopCategory[] | null | undefined): ShopCategory[] {
  if (!rows || rows.length === 0) return DEFAULT_CATEGORIES;
  return rows
    .filter((c) => c?.id && c?.name)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      nameEn: String(c.nameEn ?? ""),
      emoji: String(c.emoji ?? "🏷️"),
      gradient: String(c.gradient ?? "from-amber-100 to-amber-200"),
      description: String(c.description ?? ""),
      image: typeof c.image === "string" && c.image.trim() ? c.image.trim() : undefined,
      hidden: Boolean(c.hidden),
    }));
}

/** อ่านหมวดหมู่ (ฝั่งเบราว์เซอร์) — ใช้ในหน้าร้านและหลังบ้าน
 *  fresh: true = ข้ามแคช 60 วิ ใช้ในหลังบ้านทุกหน้า
 *  [FIX 2026-08-14] เดิมหลังบ้านโหลดผ่านแคชเดียวกับหน้าร้าน → บันทึกหมวดแล้วรีเฟรช
 *  เจอชุดเก่าจากแคช ดูเหมือน "หมวดหาย" และถ้าเซฟซ้ำจะเอาชุดเก่าเขียนทับ DB จริง */
export async function fetchCategories(opts?: { fresh?: boolean }): Promise<ShopCategory[]> {
  try {
    // หน้าร้านใช้แคช 60 วิที่ API ตั้งไว้ — หมวดหมู่ถูกยิงทุกหน้า ไม่ต้องโหลดใหม่ทุกครั้ง
    const res = opts?.fresh
      ? await fetch("/api/categories?fresh=1", { cache: "no-store" })
      : await fetch("/api/categories");
    if (!res.ok) return DEFAULT_CATEGORIES;
    const j = (await res.json()) as { list?: ShopCategory[] };
    return categoriesOf(j.list);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

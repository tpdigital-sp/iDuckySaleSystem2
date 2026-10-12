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
 * ค่าเริ่มต้นก่อนโหลด/เมื่อฐานว่าง = snapshot ของหมวดจริงในฐาน ณ 12 ต.ค. 2569 (13 หมวด · เดิม 14 ส.ค. 18 หมวด)
 * — snapshot เก่าทำให้หน้าแรกเฟรมแรกขึ้น "18 หมวด" + เมนูหมวดชุดเก่า แล้วเด้งเป็น 13 (และแชทตัวอย่างค้าง 18)
 *
 * ⚠️ เดิม map มาจาก CATEGORIES ใน products.ts (ชุดออกแบบเก่า 15 หมวด) ทำให้เฟรมแรก
 * ของหน้าแรกขึ้น "15 หมวด" แล้วค่อยเด้งเป็น 18 หลังโหลดเสร็จ — snapshot นี้แก้อาการแว้บ
 * ค่าจริงยังมาจากฐานเสมอหลัง fetchCategories() สำเร็จ · ถ้าแอดมินแก้หมวดครั้งใหญ่
 * ควรอัปเดต snapshot นี้ตาม (ไม่อัปเดตก็แค่เฟรมแรกเพี้ยนชั่วครู่ ไม่พัง)
 */
export const DEFAULT_CATEGORIES: ShopCategory[] = [
  { id: "acrylic", name: "Keychain & Acrylic — พวงกุญแจ / งานอะคริลิค", nameEn: "Acrylic", emoji: "🔑", gradient: "from-sky-200 to-cyan-300", description: "พวงกุญแจอะคริลิค Jibbitz บัคเคิ้ล เขย่า แจกัน กิ๊บ และงานอะคริลิคทั่วไป", image: "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/categories/3206ab9e-c013-47a0-9da6-7f1595e2b6aa.png" },
  { id: "standee", name: "Acrylic & Collectibles — สแตนดี้ / ของสะสม", nameEn: "Standee", emoji: "🧍", gradient: "from-indigo-200 to-blue-300", description: "สแตนดี้อะคริลิคทุกแบบ ตั้งโต๊ะ จิ๋ว ตั้งมือถือ ฐานเพลง โยกเยก หมุน" },
  { id: "phone-gadget", name: "Phone & Gadget — เคส / ของใช้มือถือ", nameEn: "Phone & Gadget", emoji: "📱", gradient: "from-slate-200 to-blue-200", description: "เคสมือถือ Airpods สายคล้อง Griptok Magsafe นาฬิกา Power Bank" },
  { id: "cat-mssijpgu", name: "Card Holder & Lanyard — ซองใส่บัตร / สายคล้อง", nameEn: "", emoji: "🪪", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "sticker-paper", name: "Paper Goods — สติ๊กเกอร์ / กระดาษ / โปสการ์ด", nameEn: "Sticker & Paper", emoji: "🏷️", gradient: "from-sky-200 to-blue-200", description: "สติกเกอร์ Die-Cut งานกระดาษ พิมพ์ตามสั่ง" },
  { id: "banner", name: "Posters & Banners— โปสเตอร์ / ป้ายเชียร์", nameEn: "Banner & Poster", emoji: "📢", gradient: "from-amber-200 to-yellow-200", description: "โปสเตอร์แขวนผนัง ป้าย Banner ไวนิล ผ้าเชียร์ สโลแกน" },
  { id: "cat-mt2bpoyj", name: "Fashion — เสื้อ / กางเกง / ยางรัดผม", nameEn: "", emoji: "🏷️", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "fabric", name: "Home & Living — เครื่องนอน / ของตกแต่งงานผ้า", nameEn: "Fabric", emoji: "🧶", gradient: "from-emerald-200 to-teal-300", description: "ปลอกหมอน ผ้าห่ม ผ้าขนหนู ยางรัดผม ผ้าหลา" },
  { id: "gifts", name: "Gift & Set — เซ็ตของขวัญ / ของแจก / ตุ๊กตา", nameEn: "Gifts", emoji: "🧸", gradient: "from-rose-200 to-pink-300", description: "อาร์มปัก ตุ๊กตาปัก ของขวัญชิ้นเล็ก" },
  { id: "cat-msrdpxqn", name: "Stationery & Office — สมุด / ปฏิทิน /เครื่องเขียน", nameEn: "", emoji: "🏷️", gradient: "from-amber-100 to-amber-200", description: "" },
  { id: "apparel", name: "Daily Goods — ของใช้ / แก้ว / กระจก", nameEn: "Apparel", emoji: "👕", gradient: "from-green-200 to-emerald-300", description: "เสื้อสกรีน/ปัก หมวก ร่ม ปลอกคอ/เสื้อสัตว์เลี้ยง" },
  { id: "bag", name: "Bags & Wallets  — กระเป๋า", nameEn: "Bag", emoji: "👜", gradient: "from-emerald-200 to-teal-200", description: "กระเป๋าผ้าดิบ กระเป๋าโฮโล Laptop Bag Candybag" },
  { id: "cat-mssnwupp", name: "สัตว์เลี้ยง", nameEn: "", emoji: "🐶", gradient: "from-amber-100 to-amber-200", description: "" },
];

/**
 * ชื่อหมวดแบบสั้น — หมวดในฐานตั้งชื่อเป็น "English — ไทย" (เช่น "Home & Living — เครื่องนอน / ของตกแต่งงานผ้า")
 * ที่ลูกค้าเห็น (ชิปหมวด · breadcrumb · ป้ายบนการ์ด/หน้าสินค้า) ใช้เฉพาะครึ่งไทย ไม่งั้นยาวจนล้นแถว
 * ไม่มีขีดคั่น = ใช้ชื่อเต็มตามเดิม
 */
export function catShortName(name: string): string {
  const i = name.indexOf("—");
  return i < 0 ? name : name.slice(i + 1).trim() || name;
}

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

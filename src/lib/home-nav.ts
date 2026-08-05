/**
 * เมนูนำทางของหน้าร้าน — แอดมินแก้เองได้จากหลังบ้าน (/admin/nav)
 *
 * มี 2 ส่วน
 *  1) menu  = ลิงก์บนแถบเมนูด้านบน (Navbar)
 *  2) tiles = การ์ดนำทางบนหน้าแรก แบบเรียงเป็นบล็อก (ใหญ่ / กว้าง / เล็ก)
 *
 * เก็บเป็นแถวพิเศษ id "__site_nav__" ในตาราง products (วิธีเดียวกับ __shop_payment__ / __categories__)
 * — ไม่ต้องสร้างตารางใหม่ และ fetchProducts กรอง id ที่ขึ้นต้น "__" ออกอยู่แล้ว
 *
 * ยังไม่เคยตั้งค่า = ใช้ค่าเริ่มต้นในไฟล์นี้ (หน้าเว็บจึงไม่มีวันว่าง)
 */

/** ขนาดการ์ดบนตาราง 12 ช่อง — ใหญ่ 3ช่อง×2แถว · กว้าง 9ช่อง · เล็ก 3ช่อง */
export type TileSize = "big" | "wide" | "small";

export interface NavTile {
  id: string;
  /** บรรทัดใหญ่ (ปกติเป็นอังกฤษ เช่น "All Product") */
  title: string;
  /** บรรทัดรอง (ไทย เช่น "สินค้าทั้งหมดของเรา") */
  subtitle: string;
  href: string;
  emoji: string;
  /** สีพื้นไล่เฉด (คลาส Tailwind เช่น "from-sky-100 to-blue-200") */
  gradient: string;
  /** รูปเต็มใบ — ใส่แล้วจะแทนที่พื้นสี+ตัวอักษรทั้งหมด (ใช้ภาพที่ออกแบบมาแล้ว) */
  image?: string;
  size: TileSize;
  /** ซ่อนจากหน้าร้าน (ยังเก็บไว้ในระบบ) */
  hidden?: boolean;
}

export interface NavLink {
  id: string;
  label: string;
  href: string;
  hidden?: boolean;
}

export interface SiteNav {
  /** ลิงก์บนแถบเมนูด้านบน */
  menu: NavLink[];
  /** การ์ดนำทางหน้าแรก */
  tiles: NavTile[];
  /** ปิดทั้งบล็อกการ์ดโดยไม่ต้องลบ */
  tilesOn: boolean;
}

export const NAV_ROW_ID = "__site_nav__";

/** ลิงก์บนแถบเมนูด้านบน (ค่าเริ่มต้น = ของเดิมที่เคยเขียนตายตัวใน Navbar) */
export const DEFAULT_MENU: NavLink[] = [
  { id: "home", label: "หน้าแรก", href: "/" },
  { id: "products", label: "สินค้าทั้งหมด", href: "/products" },
  { id: "howto", label: "วิธีสั่งซื้อ", href: "/how-to-order" },
];

/** การ์ดนำทางหน้าแรก (ค่าเริ่มต้น — ชี้ไปหน้าที่มีจริงทั้งหมด) */
export const DEFAULT_TILES: NavTile[] = [
  {
    id: "howto",
    title: "How To Order",
    subtitle: "วิธีสั่งซื้อสินค้า",
    href: "/how-to-order",
    emoji: "📖",
    gradient: "from-sky-100 to-blue-200",
    size: "big",
  },
  {
    id: "all",
    title: "All Product",
    subtitle: "สินค้าทั้งหมดของเรา",
    href: "/products",
    emoji: "🛍️",
    gradient: "from-cyan-100 to-sky-200",
    size: "wide",
  },
  {
    id: "best",
    title: "Best Seller",
    subtitle: "สินค้าขายดี",
    href: "/products?sort=popular",
    emoji: "🔥",
    gradient: "from-amber-100 to-yellow-200",
    size: "small",
  },
  {
    id: "myorders",
    title: "My Orders",
    subtitle: "ประวัติการสั่งซื้อ",
    href: "/account/orders",
    emoji: "🧾",
    gradient: "from-teal-100 to-cyan-200",
    size: "small",
  },
  {
    id: "member",
    title: "Member",
    subtitle: "สมาชิก · แต้มสะสม",
    href: "/account",
    emoji: "💛",
    gradient: "from-yellow-100 to-amber-200",
    size: "small",
  },
];

export const DEFAULT_SITE_NAV: SiteNav = {
  menu: DEFAULT_MENU,
  tiles: DEFAULT_TILES,
  tilesOn: true,
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/**
 * ค่าที่ใช้จริง — ล้างข้อมูลจากฐานให้อยู่ในรูปที่หน้าเว็บใช้ได้เสมอ
 * ไม่มี/ว่าง = ตกไปใช้ค่าเริ่มต้น (กันหน้าแรกโล่งเพราะเซฟพลาด)
 */
export function siteNavOf(raw: Partial<SiteNav> | null | undefined): SiteNav {
  const menu = (Array.isArray(raw?.menu) ? raw.menu : [])
    .filter((l) => l && str(l.label).trim() && str(l.href).trim())
    .map((l, i) => ({
      id: str(l.id) || `m${i}`,
      label: str(l.label).trim(),
      href: str(l.href).trim(),
      hidden: Boolean(l.hidden),
    }));

  const tiles = (Array.isArray(raw?.tiles) ? raw.tiles : [])
    .filter((t) => t && str(t.title).trim())
    .map((t, i) => ({
      id: str(t.id) || `t${i}`,
      title: str(t.title).trim(),
      subtitle: str(t.subtitle).trim(),
      href: str(t.href).trim() || "/products",
      emoji: str(t.emoji) || "✨",
      gradient: str(t.gradient) || "from-sky-100 to-blue-200",
      image: str(t.image).trim() || undefined,
      size: (["big", "wide", "small"] as TileSize[]).includes(t.size as TileSize) ? (t.size as TileSize) : "small",
      hidden: Boolean(t.hidden),
    }));

  return {
    menu: menu.length ? menu : DEFAULT_MENU,
    tiles: tiles.length ? tiles : DEFAULT_TILES,
    tilesOn: raw?.tilesOn !== false,
  };
}

/** เฉพาะที่ลูกค้าเห็น (ตัดที่ซ่อนไว้ออก) */
export const visibleMenu = (n: SiteNav) => n.menu.filter((l) => !l.hidden);
export const visibleTiles = (n: SiteNav) => (n.tilesOn ? n.tiles.filter((t) => !t.hidden) : []);

/**
 * อ่านเมนู (ฝั่งเบราว์เซอร์) — แชร์ผลลัพธ์ครั้งเดียวทั้งแอป
 * Navbar อยู่ทุกหน้า ถ้าไม่แคชจะยิง API ซ้ำทุกครั้งที่เปลี่ยนหน้า
 */
let cached: Promise<SiteNav> | null = null;

export function fetchSiteNav(): Promise<SiteNav> {
  cached ??= fetch("/api/nav", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { nav?: Partial<SiteNav> } | null) => siteNavOf(j?.nav))
    .catch(() => DEFAULT_SITE_NAV);
  return cached;
}

/** ล้างแคชหลังแอดมินกดบันทึก (จะได้เห็นของใหม่โดยไม่ต้องรีเฟรช) */
export function clearSiteNavCache() {
  cached = null;
}

/**
 * เมนูนำทางของหน้าร้าน — แอดมินแก้เองได้จากหลังบ้าน (/admin/nav)
 *
 * มี 3 ส่วน
 *  1) menu  = ลิงก์บนแถบเมนูด้านบน (Navbar)
 *  2) mega  = เมนูดรอปดาวน์เต็มความกว้าง (หัวข้อ → คอลัมน์ → รายการ)
 *  3) tiles = การ์ดนำทางบนหน้าแรก แบบเรียงเป็นบล็อก (ใหญ่ / กว้าง / เล็ก)
 *
 * เก็บเป็นแถวพิเศษ id "__site_nav__" ในตาราง products (วิธีเดียวกับ __shop_payment__ / __categories__)
 * — ไม่ต้องสร้างตารางใหม่ และ fetchProducts กรอง id ที่ขึ้นต้น "__" ออกอยู่แล้ว
 *
 * ยังไม่เคยตั้งค่า = ใช้ค่าเริ่มต้นในไฟล์นี้ (หน้าเว็บจึงไม่มีวันว่าง)
 */

import { homeBlocksOf, type HomeBlock } from "./home-layout";

/** ขนาดการ์ดบนตาราง 5 ช่อง — ใหญ่ 2ช่อง×2แถว · กว้าง 3ช่อง · เล็ก 1ช่อง */
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

/** ป้ายเล็กท้ายชื่อรายการในเมนู — N = มาใหม่ · H = ฮิต */
export type MegaBadge = "" | "N" | "H";

export interface MegaItem {
  id: string;
  label: string;
  href: string;
  badge?: MegaBadge;
}

/** 1 คอลัมน์ในเมนูดรอปดาวน์ */
export interface MegaColumn {
  id: string;
  title: string;
  /** กดที่ชื่อคอลัมน์แล้วไปไหน (ไม่ใส่ = ไม่ใช่ลิงก์) */
  href?: string;
  /** รูปหัวคอลัมน์ */
  image?: string;
  /**
   * ดึงรายชื่อสินค้าจากหมวดนี้มาแสดงอัตโนมัติ (ไม่ต้องพิมพ์เอง)
   * — เพิ่มสินค้าใหม่ในหมวดนี้เมื่อไหร่ เมนูขึ้นเองทันที
   * ถ้ามี items ที่พิมพ์เองอยู่แล้ว จะใช้ items เป็นหลัก
   */
  autoCategory?: string;
  /** ดึงมากี่รายการ (ไม่ตั้ง = 6) */
  autoLimit?: number;
  /** รายการที่เลือกเอง (มีแล้วจะใช้อันนี้แทน autoCategory) */
  items: MegaItem[];
}

/** ภาพสินค้าแนะนำในแผง (แถวบนสุด) */
export interface MegaPromo {
  id: string;
  image: string;
  href: string;
}

/** 1 หัวข้อบนแถบเมนู ที่กางเป็นแผงเต็มความกว้าง */
export interface MegaGroup {
  id: string;
  label: string;
  /** หัวเรื่องในแผง เช่น "สินค้าแนะนำ" */
  heading?: string;
  /** ภาพสินค้าแนะนำ เรียงเป็นแถวใต้หัวเรื่อง */
  promos?: MegaPromo[];
  /** ภาพโปรโมทด้านซ้ายของแผง */
  image?: string;
  /** กดที่ภาพโปรโมทแล้วไปไหน */
  imageHref?: string;
  columns: MegaColumn[];
  hidden?: boolean;
}

/** การ์ดจุดเด่นร้าน (แถวใต้แบนเนอร์ เช่น ลายของคุณเอง · ส่งไวทั่วไทย) */
export interface NavPerk {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  hidden?: boolean;
}

export interface SiteNav {
  /** ลิงก์บนแถบเมนูด้านบน */
  menu: NavLink[];
  /** จุดเด่นร้าน — แถวการ์ดเล็ก 4 ใบใต้แบนเนอร์ */
  perks: NavPerk[];
  /** ปิดทั้งแถวจุดเด่นโดยไม่ต้องลบ */
  perksOn: boolean;
  /** เมนูดรอปดาวน์เต็มความกว้าง (mega menu) */
  mega: MegaGroup[];
  /** การ์ดนำทางหน้าแรก */
  tiles: NavTile[];
  /** ปิดทั้งบล็อกการ์ดโดยไม่ต้องลบ */
  tilesOn: boolean;
  /** สีพื้นหลังของแถบการ์ด (เว้นว่าง = ไม่มีแถบสี) */
  tilesBg?: string;
  /** ขอบหยักคลื่นใต้แถบการ์ด */
  tilesWave?: boolean;
  /** ตำแหน่งบล็อกการ์ดบนหน้าแรก — top ก่อนแบนเนอร์ · hero ใต้แบนเนอร์ (เดิม) · features ใต้จุดเด่นร้าน */
  tilesPos?: "top" | "hero" | "features";
  /** โลโก้ร้านบนแถบเมนู (URL รูปที่อัปโหลด) — ไม่ตั้ง = ใช้โลโก้เป็ด+ข้อความเดิม */
  logo?: string;
  /** โลโก้ระบบหลังบ้าน (มุมซ้ายบน sidebar) — กดที่โลโก้ในหลังบ้านเพื่อเปลี่ยนได้เลย · ไม่ตั้ง = เป็ด 🦆 */
  adminLogo?: string;
  /** แบนเนอร์ใหญ่บนหน้าแรก (hero) */
  hero: HeroBanner;
  /**
   * ผังหน้าแรกแบบบล็อกเรียงลงมา (Home Builder) — ไม่ตั้ง = ผังมาตรฐานตาม tilesPos
   * ดูชนิดบล็อก/ตัวช่วยได้ที่ src/lib/home-layout.ts
   */
  home?: HomeBlock[];
}

/** แบนเนอร์ใหญ่หน้าแรก — ข้อความ/ปุ่ม/รูป แก้ได้จากหลังบ้าน */
export interface HeroBanner {
  /** ปิดแบนเนอร์โดยไม่ต้องลบข้อความ */
  on: boolean;
  /** ป้ายเล็กบนสุด เช่น "🎉 โปรเปิดร้าน ลดสูงสุด 25%" (เว้นว่าง = ไม่แสดง) */
  badge: string;
  /** หัวข้อใหญ่ — ขึ้นบรรทัดใหม่ด้วย Enter ได้ */
  title: string;
  /** คำโปรยใต้หัวข้อ — ขึ้นบรรทัดใหม่ด้วย Enter ได้ */
  subtitle: string;
  /** ปุ่มหลัก (สีเข้ม) */
  btn1Label: string;
  btn1Href: string;
  /** ปุ่มรอง (สีขาว) — เว้นชื่อว่าง = ไม่แสดงปุ่มนี้ */
  btn2Label: string;
  btn2Href: string;
  /** รูปด้านขวา (URL) — ไม่ใส่ = ใช้อีโมจิเป็ดตามเดิม */
  image?: string;
  /**
   * ภาพแบนเนอร์เต็มใบ (URL) — ใส่แล้วใช้ภาพนี้แทนทั้งกล่อง (พื้นสี+ข้อความ+ปุ่ม)
   * เหมาะกับงานออกแบบที่มีข้อความอยู่ในภาพแล้ว · กดที่ภาพ = ไปลิงก์ของปุ่มหลัก
   */
  bgImage?: string;
}

export const NAV_ROW_ID = "__site_nav__";

/** แบนเนอร์ใหญ่ค่าเริ่มต้น = ข้อความที่เคยเขียนตายตัวในหน้าแรก */
export const DEFAULT_HERO: HeroBanner = {
  on: true,
  badge: "🎉 โปรเปิดร้าน ลดสูงสุด 25%",
  title: "พิมพ์ลายของคุณ\nลงบนของที่คุณรัก 💛",
  subtitle: "แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ และอีกมากมาย\nอัปโหลดลาย → เลือกสินค้า → รอรับที่บ้าน ง่ายแค่นี้!",
  btn1Label: "🛍️ ช้อปเลย",
  btn1Href: "/products",
  btn2Label: "📖 วิธีสั่งซื้อ",
  btn2Href: "/how-to-order",
};

/** ลิงก์บนแถบเมนูด้านบน (ค่าเริ่มต้น = ของเดิมที่เคยเขียนตายตัวใน Navbar) */
export const DEFAULT_MENU: NavLink[] = [
  { id: "home", label: "หน้าแรก", href: "/" },
  { id: "categories", label: "สินค้าและบริการ", href: "/#categories" },
  { id: "bestseller", label: "สินค้าขายดี", href: "/#bestseller" },
  { id: "steps", label: "ขั้นตอนสั่งซื้อ", href: "/#steps" },
  { id: "why", label: "ทำไมต้องเรา", href: "/#why" },
  { id: "contact", label: "ติดต่อเรา", href: "/#contact" },
];

/**
 * การ์ดนำทางหน้าแรก (ค่าเริ่มต้น) — ใช้ภาพงานออกแบบจริงของร้านใน /public/nav
 * ลิงก์ชี้ไปหน้าที่มีจริง · แอดมินเปลี่ยนรูป/ลิงก์เองได้ที่ /admin/nav
 */
export const DEFAULT_TILES: NavTile[] = [
  {
    id: "howto",
    title: "How To Order",
    subtitle: "วิธีสั่งซื้อสินค้า",
    href: "/how-to-order",
    image: "/nav/how-to-order.png",
    emoji: "📖",
    gradient: "from-sky-100 to-blue-200",
    size: "big",
  },
  {
    id: "all",
    title: "All Product",
    subtitle: "สินค้าทั้งหมดของเรา",
    href: "/products",
    image: "/nav/all-product.png",
    emoji: "🛍️",
    gradient: "from-cyan-100 to-sky-200",
    size: "wide",
  },
  {
    id: "review",
    title: "Review",
    subtitle: "รีวิวจากลูกค้า",
    href: "https://www.iduckyprintsstudio.com/Review/",
    image: "/nav/review.png",
    emoji: "💬",
    gradient: "from-teal-100 to-cyan-200",
    size: "small",
  },
  {
    id: "about",
    title: "About Us",
    subtitle: "เกี่ยวกับเรา",
    href: "/about",
    image: "/nav/about-us.png",
    emoji: "🦆",
    gradient: "from-amber-100 to-yellow-200",
    size: "small",
  },
  {
    id: "member",
    title: "Member Card",
    subtitle: "สมัครสมาชิก",
    href: "/account",
    image: "/nav/member-card.png",
    emoji: "💛",
    gradient: "from-yellow-100 to-amber-200",
    size: "small",
  },
];

/**
 * เมนูดรอปดาวน์เริ่มต้น — โครงเมนูตามเว็บหลักของร้าน (iduckyprintsstudio.com)
 * แบนเนอร์/ภาพสินค้าแนะนำเก็บไว้ใน /public/nav/mega (ไม่พึ่งรูปบนเว็บเดิม)
 * ลิงก์รายการชี้เข้าหน้าสินค้าของระบบนี้ทั้งหมด — แก้เพิ่มได้ที่ /admin/nav
 * ⚠️ สินค้าที่ยังเป็น "ฉบับร่าง" ลูกค้าเปิดลิงก์ไม่ได้จนกว่าจะกดเผยแพร่
 */
const mi = (id: string, label: string, href: string, badge: MegaBadge = ""): MegaItem => ({ id, label, href, badge });
const mp = (id: string, n: number): MegaPromo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${id}-p${i + 1}`, image: `/nav/mega/${id}-p${i + 1}.jpg`, href: "/products" }));

export const DEFAULT_MEGA: MegaGroup[] = [
  {
    id: "digital-print",
    label: "DIGITAL PRINT",
    heading: "สินค้าแนะนำ",
    image: "/nav/mega/digital-print-banner.jpg",
    imageHref: "/products?category=sticker-paper",
    promos: mp("digital-print", 5),
    columns: [
      { id: "dp-paper", title: "Paper Product", items: [
        mi("dp1", "โปสการ์ด", "/products/postcard-th", "N"),
        mi("dp2", "โปสเตอร์", "/products/POSTER", "H"),
        mi("dp3", "แพ็คเกจกระดาษรองหลัง", "/products/packaging-paper"),
        mi("dp4", "Banner / Slogan", "/products/banner-slogan"),
        mi("dp5", "Photo Booth Strip", "/products/photobooth-paper"),
        mi("dp6", "Polaroid", "/products/polaroid-th"),
      ] },
      { id: "dp-photocard", title: "Photocard", items: [
        mi("dp7", "Photocard (Paper)", "/products/photocard-paper"),
        mi("dp8", "Photocard (PET)", "/products/photocard-pet"),
        mi("dp9", "Photocard (PVC)", "/products/photocard-pvc"),
      ] },
      { id: "dp-sticker", title: "Sticker", items: [
        mi("dp10", "Shape Sticker", "/products/shape-sticker"),
        mi("dp11", "Giveaway Sticker", "/products/giveaway-sticker"),
        mi("dp12", "Photo Booth Strip", "/products/photobooth-sticker"),
        mi("dp13", "สติ๊กเกอร์ติดบัตร", "/products/card-sticker"),
      ] },
      { id: "dp-calendar", title: "Calendar", items: [
        mi("dp14", "ปฏิทินตั้งโต๊ะ", "/products/calendar-desktop"),
        mi("dp15", "ปฏิทินผ้าแคนวาส", "/products/calendar-canvas"),
        mi("dp16", "ปฏิทินอะคริลิค", "/products/calendar-acrylic"),
        mi("dp17", "ปฏิทินโปสการ์ด", "/products/calendar-postcard"),
        mi("dp18", "ปฏิทินโฟโต้การ์ด", "/products/calendar-photocard"),
      ] },
      { id: "dp-other", title: "Other products", items: [
        mi("dp19", "Shikishi", "/products/shikishi"),
        mi("dp20", "Cup Sleeve", "/products/cup-sleeve"),
        mi("dp21", "Mini Folder", "/products/mini-folder"),
        mi("dp22", "Notebook", "/products/notebook"),
      ] },
    ],
  },
  {
    id: "simple-gifts",
    label: "SIMPLE GIFTS",
    heading: "สินค้าแนะนำ",
    image: "/nav/mega/simple-gifts-banner.jpg",
    imageHref: "/products?category=gifts",
    promos: mp("simple-gifts", 5),
    columns: [
      { id: "sg-frame", title: "Photo Frame", items: [
        mi("sg1", "กรอบรูปจิ๊กซอว์", "/products/กรอบรูป-จิ๊กซอว์-งานซับลิเมชั่น", "N"),
        mi("sg2", "กรอบรูปแคนวาส", "/products/Canvas-Frame", "H"),
      ] },
      { id: "sg-gadget", title: "Gadget", items: [
        mi("sg3", "Card Holder / การ์ดพลาสติกขาว", "/products/cardholder-white"),
        mi("sg4", "Card Holder / การ์ดพลาสติกใส", "/products/cardholder-clear"),
        mi("sg5", "Frame Card / การ์ดใส", "/products/Frame-Card-การ์ดใส"),
      ] },
      { id: "sg-drink", title: "Drinkware", items: [mi("sg6", "แก้วมัค 11 Oz", "/products/mug-11oz")] },
      { id: "sg-bag", title: "Knickknack Bag", items: [
        mi("sg7", "กระเป๋าพาสปอร์ต", "/products/passport-case"),
        mi("sg8", "กระเป๋าโฮโลแกรม", "/products/hologram-bag"),
        mi("sg9", "กระเป๋าโน๊ตบุ๊ค", "/products/laptop-bag"),
        mi("sg10", "CANDY BAG", "/products/candy-bag"),
      ] },
      { id: "sg-other", title: "Other products", items: [
        mi("sg11", "พัดพลาสติกใส", "/products/hand-fan"),
        mi("sg12", "แผ่นรองเมาส์", "/products/Mouse-Pad-แผ่นรองเมาส์"),
        mi("sg13", "กระจกทรงกลม", "/products/round-mirror"),
        mi("sg14", "กระจกถือ", "/products/handheld-mirror"),
        mi("sg15", "กระจกพับ", "/products/กระจกพับ"),
        mi("sg16", "เข็มกลัดพลาสติก", "/products/broochbadge-th"),
        mi("sg17", "จิ๊กซอว์ปริศนา", "/products/puzzle"),
      ] },
    ],
  },
  {
    id: "gadget-phone",
    label: "GADGET PHONE",
    heading: "สินค้าแนะนำ",
    image: "/nav/mega/gadget-phone-banner.jpg",
    imageHref: "/products?category=phone-gadget",
    promos: mp("gadget-phone", 5),
    columns: [
      { id: "gp-griptok", title: "Griptok", items: [
        mi("gp1", "Griptok ทรงกลม", "/products/griptok-th"),
        mi("gp2", "Magsafe Griptok", "/products/griptok-th"),
      ] },
      { id: "gp-case", title: "Case Phone", items: [
        mi("gp3", "เคสใสพรีเมี่ยม", "/products/casephone-clear"),
        mi("gp4", "Frame Phone Case", "/products?category=phone-gadget"),
        mi("gp5", "Phone Hanging", "/products/phone-hanging"),
      ] },
      { id: "gp-holder", title: "Holder Phone", items: [
        mi("gp6", "Magsafe Card Holder", "/products/Magsafe-Wallet-มีขาตั้ง"),
        mi("gp7", "Magsafe Wallet", "/products/Magsafe-Wallet-มีขาตั้ง"),
      ] },
      { id: "gp-stand", title: "Phone Stand", items: [mi("gp8", "PHONE Stand 360°", "/products/360-phone-stand", "N")] },
      { id: "gp-other", title: "Other Product", items: [mi("gp9", "Other Product", "/products?category=phone-gadget")] },
    ],
  },
  {
    id: "home-decor",
    label: "HOME DECOR",
    heading: "สินค้าแนะนำ",
    image: "/nav/mega/home-decor-banner.jpg",
    imageHref: "/products?category=home",
    promos: mp("home-decor", 5),
    columns: [
      { id: "hd-pillow", title: "Pillow Case / ปลอกหมอน", items: [
        mi("hd1", "หมอนอิงยัดใย", "/products/หมอนอิงยัดใย", "N"),
        mi("hd2", "ปลอกหมอนอิง", "/products/pillowcases-5", "H"),
        mi("hd3", "ปลอกหมอน", "/products/pillowcase"),
        mi("hd4", "ปลอกหมอนข้าง", "/products/pillowcases-2"),
      ] },
      { id: "hd-kitchen", title: "Kitchenware", items: [
        mi("hd5", "แผ่นหินรองแก้วน้ำ", "/products/coaster-ceramic"),
        mi("hd6", "แผ่นรองแก้วกลิสเตอร์", "/products/Quicksand-Coaster"),
        mi("hd7", "ผ้ารองจาน", "/products/ผ้ารองจาน"),
      ] },
      { id: "hd-decor", title: "Home Decor", items: [
        mi("hd8", "ผ้าห่ม", "/products/blanket-th"),
        mi("hd9", "ผ้าขนหนู", "/products/TOWEL-ผ้าขนหนู"),
        mi("hd10", "ผ้าเช็ดหน้า", "/products/ผ้าเช็ดหน้า"),
        mi("hd11", "พรมเช็ดเท้า", "/products/DOORMAT-พรมเช็ดเท้า"),
      ] },
      { id: "hd-pet", title: "PET", items: [
        mi("hd12", "ปลอกคอสัตว์เลี้ยง", "/products/collar-animal"),
        mi("hd13", "เสื้อสัตว์เลี้ยง", "/products/catdogcollar-4"),
      ] },
      { id: "hd-sign", title: "Sign & Display", items: [
        mi("hd14", "ป้ายแขวนประตู", "/products/door-hanger"),
        mi("hd15", "โปสเตอร์แคนวาส", "/products/โปสเตอร์แขวนผนัง"),
        mi("hd16", "X-Stand", "/products/ป้ายขาตั้ง-X-Stand"),
        mi("hd17", "Roll Up", "/products/ป้ายขาตั้ง-Roll-UP"),
        mi("hd18", "ผ้าแขวนผนัง", "/products/wall-cloth"),
      ] },
    ],
  },
  {
    id: "fabric",
    label: "FABRIC",
    heading: "สินค้าแนะนำ",
    image: "/nav/mega/fabric-banner.jpg",
    imageHref: "/products?category=fabric",
    promos: mp("fabric", 5),
    columns: [
      { id: "fb-tote", title: "Tote Bag", items: [
        mi("fb1", "กระเป๋าผ้า", "/products/กระเป๋าผ้าแคนวาส", "N"),
        mi("fb2", "กระเป๋าผ้า (พิมพ์ลายเต็มใบ)", "/products/กระเป๋าผ้าแคนวาส", "H"),
        mi("fb3", "ถุงผ้าดิบหูรูด", "/products/DRAWSTRING-BAG-ถุงผ้าหูรูด"),
        mi("fb4", "ถุงผ้าหูรูด (พิมพ์ลายเต็มใบ)", "/products/ถุงผ้าหูรูด-แบบสกรีนเต็มใบ", "H"),
      ] },
      { id: "fb-shirt", title: "Shirt", items: [mi("fb5", "เสื้อยืด", "/products/tshirt-th")] },
      { id: "fb-women", title: "Women Product", items: [
        mi("fb6", "ยางรัดผม", "/products/Scrunchy-ยางรัดผมผ้าซาติน"),
        mi("fb7", "ผ้าพันผม / ผ้าพันหูกระเป๋า", "/products/scarf"),
        mi("fb8", "ผ้าคลุมไหล่", "/products/SHAWL-ผ้าคลุมไหล่"),
      ] },
      { id: "fb-general", title: "General Products", items: [
        mi("fb9", "Clip Pouch", "/products/CLIP-POUCH-กระเป๋าต๊อบแต๊บ"),
        mi("fb10", "ผ้าหนึบ", "/products/sticky-fabric"),
      ] },
      { id: "fb-other", title: "Other Products", items: [
        mi("fb11", "ผ้าห่มมีฮู้ด", "/products/blanket-hoodie"),
        mi("fb12", "ผ้าปิดตา", "/products/sleep-mask"),
      ] },
    ],
  },
];

/** จุดเด่นร้านเริ่มต้น (= ของเดิมที่เคยเขียนตายในหน้าแรก) */
export const DEFAULT_PERKS: NavPerk[] = [
  { id: "art", emoji: "🎨", title: "ลายของคุณเอง", desc: "อัปโหลดรูป/โลโก้ได้เลย" },
  { id: "ship", emoji: "🚚", title: "ส่งไวทั่วไทย", desc: "มีโปรส่งฟรีเมื่อสั่งครบยอด" },
  { id: "quality", emoji: "💎", title: "งานพิมพ์คุณภาพ", desc: "สีสด คมชัด ทนทาน" },
  { id: "admin", emoji: "💬", title: "แอดมินใจดี", desc: "ปรึกษาลายฟรีทาง LINE" },
];

/** สีแถบพื้นหลังเริ่มต้น — ฟ้าอ่อนแบบเว็บหลักของร้าน */
export const DEFAULT_TILES_BG = "#c9e1f2";

export const DEFAULT_SITE_NAV: SiteNav = {
  menu: DEFAULT_MENU,
  perks: DEFAULT_PERKS,
  perksOn: true,
  mega: DEFAULT_MEGA,
  tiles: DEFAULT_TILES,
  tilesOn: true,
  hero: DEFAULT_HERO,
  tilesBg: DEFAULT_TILES_BG,
  tilesWave: true,
  tilesPos: "hero",
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/**
 * ค่าที่ใช้จริง — ล้างข้อมูลจากฐานให้อยู่ในรูปที่หน้าเว็บใช้ได้เสมอ
 * ไม่มี/ว่าง = ตกไปใช้ค่าเริ่มต้น (กันหน้าแรกโล่งเพราะเซฟพลาด)
 */
/** ทำความสะอาดค่าแบนเนอร์ใหญ่ (ช่องว่าง = ใช้ค่าเริ่มต้นของช่องนั้น) */
function heroOf(raw: Partial<HeroBanner> | null | undefined): HeroBanner {
  const t = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  const href = (v: unknown, fallback: string) => {
    const s0 = typeof v === "string" ? v.trim() : "";
    return /^(\/|https?:\/\/)/.test(s0) ? s0 : fallback;
  };
  const img = typeof raw?.image === "string" ? raw.image.trim() : "";
  return {
    on: raw?.on !== false,
    // ป้าย/ปุ่มรอง ปล่อยว่างได้ (= ไม่แสดง) จึงไม่เติมค่าเริ่มต้นทับ
    badge: typeof raw?.badge === "string" ? raw.badge.trim() : DEFAULT_HERO.badge,
    title: t(raw?.title, DEFAULT_HERO.title).slice(0, 200),
    subtitle: t(raw?.subtitle, DEFAULT_HERO.subtitle).slice(0, 400),
    btn1Label: t(raw?.btn1Label, DEFAULT_HERO.btn1Label),
    btn1Href: href(raw?.btn1Href, DEFAULT_HERO.btn1Href),
    btn2Label: typeof raw?.btn2Label === "string" ? raw.btn2Label.trim() : DEFAULT_HERO.btn2Label,
    btn2Href: href(raw?.btn2Href, DEFAULT_HERO.btn2Href),
    ...(/^(\/|https?:\/\/)/.test(img) ? { image: img } : {}),
    ...(() => {
      const bg = typeof raw?.bgImage === "string" ? raw.bgImage.trim() : "";
      return /^(\/|https?:\/\/)/.test(bg) ? { bgImage: bg } : {};
    })(),
  };
}

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

  const mega = (Array.isArray(raw?.mega) ? raw.mega : [])
    .filter((g) => g && str(g.label).trim())
    .map((g, i) => ({
      id: str(g.id) || `g${i}`,
      label: str(g.label).trim(),
      heading: str(g.heading).trim() || undefined,
      promos: (Array.isArray(g.promos) ? g.promos : [])
        .filter((pm) => pm && str(pm.image).trim())
        .map((pm, pi) => ({
          id: str(pm.id) || `p${i}_${pi}`,
          image: str(pm.image).trim(),
          href: str(pm.href).trim() || "/products",
        })),
      image: str(g.image).trim() || undefined,
      imageHref: str(g.imageHref).trim() || undefined,
      hidden: Boolean(g.hidden),
      columns: (Array.isArray(g.columns) ? g.columns : [])
        .filter((c) => c && str(c.title).trim())
        .map((c, ci) => ({
          id: str(c.id) || `c${i}_${ci}`,
          title: str(c.title).trim(),
          href: str(c.href).trim() || undefined,
          image: str(c.image).trim() || undefined,
          autoCategory: str(c.autoCategory).trim() || undefined,
          autoLimit: Number.isFinite(Number(c.autoLimit)) && Number(c.autoLimit) > 0 ? Number(c.autoLimit) : undefined,
          items: (Array.isArray(c.items) ? c.items : [])
            .filter((it) => it && str(it.label).trim())
            .map((it, ii) => ({
              id: str(it.id) || `i${i}_${ci}_${ii}`,
              label: str(it.label).trim(),
              href: str(it.href).trim() || "/products",
              badge: (["", "N", "H"] as MegaBadge[]).includes(it.badge as MegaBadge)
                ? (it.badge as MegaBadge)
                : "",
            })),
        })),
    }));

  const perks = (Array.isArray(raw?.perks) ? raw.perks : [])
    .filter((x) => x && str(x.title).trim())
    .map((x, i) => ({
      id: str(x.id) || `pk${i}`,
      emoji: str(x.emoji) || "✨",
      title: str(x.title).trim(),
      desc: str(x.desc).trim(),
      hidden: Boolean(x.hidden),
    }));

  return {
    menu: menu.length ? menu : DEFAULT_MENU,
    perks: perks.length ? perks : DEFAULT_PERKS,
    perksOn: raw?.perksOn !== false,
    // เมนูดรอปดาวน์ "ว่างได้" — ลบหมดคือตั้งใจไม่เอา ไม่ใช่ตั้งค่าพลาด
    mega: Array.isArray(raw?.mega) ? mega : DEFAULT_MEGA,
    tiles: tiles.length ? tiles : DEFAULT_TILES,
    tilesOn: raw?.tilesOn !== false,
    // สีต้องเป็นรหัสสีจริงเท่านั้น (ค่านี้ถูกยัดลง style ตรง ๆ)
    tilesBg: /^#[0-9a-f]{3,8}$/i.test(str(raw?.tilesBg)) ? str(raw?.tilesBg) : undefined,
    tilesWave: Boolean(raw?.tilesWave),
    tilesPos: (["top", "hero", "features"] as const).includes(raw?.tilesPos as "top") ? raw?.tilesPos : "hero",
    // โลโก้รับเฉพาะ path ภายใน หรือ URL http(s) (กัน javascript: หลุดเข้า src)
    logo: /^(\/|https?:\/\/)/.test(str(raw?.logo).trim()) ? str(raw?.logo).trim() : undefined,
    adminLogo: /^(\/|https?:\/\/)/.test(str(raw?.adminLogo).trim()) ? str(raw?.adminLogo).trim() : undefined,
    hero: heroOf(raw?.hero),
    ...(homeBlocksOf(raw?.home) ? { home: homeBlocksOf(raw?.home) } : {}),
  };
}

/** เฉพาะที่ลูกค้าเห็น (ตัดที่ซ่อนไว้ออก) */
export const visibleMenu = (n: SiteNav) => n.menu.filter((l) => !l.hidden);
export const visibleMega = (n: SiteNav) => n.mega.filter((g) => !g.hidden && g.columns.length);
export const visiblePerks = (n: SiteNav) => (n.perksOn ? n.perks.filter((x) => !x.hidden) : []);
export const visibleTiles = (n: SiteNav) => (n.tilesOn ? n.tiles.filter((t) => !t.hidden) : []);

/**
 * อ่านเมนู (ฝั่งเบราว์เซอร์) — แชร์ผลลัพธ์ครั้งเดียวทั้งแอป
 * Navbar อยู่ทุกหน้า ถ้าไม่แคชจะยิง API ซ้ำทุกครั้งที่เปลี่ยนหน้า
 */
let cached: Promise<SiteNav> | null = null;

export function fetchSiteNav(): Promise<SiteNav> {
  // ใช้แคช 60 วิที่ API ตั้งไว้ (เมนูแทบไม่เปลี่ยน · แก้แล้วเห็นผลใน ~1 นาที)
  cached ??= fetch("/api/nav")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { nav?: Partial<SiteNav> } | null) => siteNavOf(j?.nav))
    .catch(() => DEFAULT_SITE_NAV);
  return cached;
}

/** ล้างแคชหลังแอดมินกดบันทึก (จะได้เห็นของใหม่โดยไม่ต้องรีเฟรช) */
export function clearSiteNavCache() {
  cached = null;
}

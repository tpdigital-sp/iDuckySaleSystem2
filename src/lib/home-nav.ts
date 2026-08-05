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

export interface SiteNav {
  /** ลิงก์บนแถบเมนูด้านบน */
  menu: NavLink[];
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
}

export const NAV_ROW_ID = "__site_nav__";

/** ลิงก์บนแถบเมนูด้านบน (ค่าเริ่มต้น = ของเดิมที่เคยเขียนตายตัวใน Navbar) */
export const DEFAULT_MENU: NavLink[] = [
  { id: "home", label: "หน้าแรก", href: "/" },
  { id: "products", label: "สินค้าทั้งหมด", href: "/products" },
  { id: "howto", label: "วิธีสั่งซื้อ", href: "/how-to-order" },
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
 * เมนูดรอปดาวน์เริ่มต้น — เนื้อหาจริงจากเว็บหลักของร้าน (iduckyprintsstudio.com)
 * แบนเนอร์/ภาพสินค้าแนะนำเก็บไว้ใน /public/nav/mega (ไม่พึ่งรูปบนเว็บเดิม)
 * ลิงก์รายการยังชี้ไปหน้าเว็บเดิม — แอดมินค่อย ๆ เปลี่ยนเป็นหน้าในระบบนี้ได้ที่ /admin/nav
 */
const W = "https://www.iduckyprintsstudio.com";
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
        mi("dp1", "โปสการ์ด", `${W}/postcard-duplicate`, "N"),
        mi("dp2", "โปสเตอร์", `${W}/Poster/`, "H"),
        mi("dp3", "แพ็คเกจกระดาษรองหลัง", `${W}/PackagingPaper/`),
        mi("dp4", "Banner / Slogan", `${W}/Banner/`),
        mi("dp5", "Photo Booth Strip", `${W}/photoboothstripspaper/`),
        mi("dp6", "Polaroid", `${W}/Polaroid/`),
      ] },
      { id: "dp-photocard", title: "Photocard", items: [
        mi("dp7", "Photocard (Paper)", `${W}/photocardpaper/`),
        mi("dp8", "Photocard (PET)", `${W}/photocardpet/`),
        mi("dp9", "Photocard (PVC)", `${W}/PhotocardPVC/`),
      ] },
      { id: "dp-sticker", title: "Sticker", items: [
        mi("dp10", "Shape Sticker", `${W}/shapesticker/`),
        mi("dp11", "Giveaway Sticker", `${W}/giveawaysticker/`),
        mi("dp12", "Photo Booth Strip", `${W}/photoboothstrips/`),
        mi("dp13", "สติ๊กเกอร์ติดบัตร", `${W}/Card-Sticker/`),
      ] },
      { id: "dp-calendar", title: "Calendar", items: [
        mi("dp14", "ปฏิทินตั้งโต๊ะ", `${W}/Calendar_Desktop/`),
        mi("dp15", "ปฏิทินผ้าแคนวาส", `${W}/Calendar_CanvasFabric/`),
        mi("dp16", "ปฏิทินอะคริลิค", `${W}/Calendar_Acrylic/`),
        mi("dp17", "ปฏิทินโปสการ์ด", `${W}/Calendar_Poscard/`),
        mi("dp18", "ปฏิทินโฟโต้การ์ด", `${W}/Calendar-Photocard/`),
      ] },
      { id: "dp-other", title: "Other products", items: [
        mi("dp19", "Shikishi", `${W}/shikishi`),
        mi("dp20", "Cup Sleeve", `${W}/cupsleeves`),
        mi("dp21", "Mini Folder", `${W}/Mini-Folder/`),
        mi("dp22", "Notebook", `${W}/notebook/`),
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
        mi("sg1", "กรอบรูปจิ๊กซอว์", `${W}/jigsaws/`, "N"),
        mi("sg2", "กรอบรูปแคนวาส", `${W}/canvasframe/`, "H"),
      ] },
      { id: "sg-gadget", title: "Gadget", items: [
        mi("sg3", "Card Holder / การ์ดพลาสติกขาว", `${W}/cardholder/`),
        mi("sg4", "Card Holder / การ์ดพลาสติกใส", `${W}/cardholderclear/`),
        mi("sg5", "Frame Card / การ์ดใส", `${W}/framecard/`),
      ] },
      { id: "sg-drink", title: "Drinkware", items: [mi("sg6", "แก้วมัค 11 Oz", `${W}/mug11oz/`)] },
      { id: "sg-bag", title: "Knickknack Bag", items: [
        mi("sg7", "กระเป๋าพาสปอร์ต", `${W}/passport/`),
        mi("sg8", "กระเป๋าโฮโลแกรม", `${W}/hologrambag/`),
        mi("sg9", "กระเป๋าโน๊ตบุ๊ค", `${W}/laptopbag/`),
        mi("sg10", "CANDY BAG", `${W}/Candy-Bag/`),
      ] },
      { id: "sg-other", title: "Other products", items: [
        mi("sg11", "พัดพลาสติกใส", `${W}/handfan/`),
        mi("sg12", "แผ่นรองเมาส์", `${W}/mousepad/`),
        mi("sg13", "กระจกทรงกลม", `${W}/roundmirror/`),
        mi("sg14", "กระจกถือ", `${W}/handheldmirror`),
        mi("sg15", "กระจกพับ", `${W}/foldingmirror/`),
        mi("sg16", "เข็มกลัดพลาสติก", `${W}/broochbadge/`),
        mi("sg17", "จิ๊กซอว์ปริศนา", `${W}/puzzle/`),
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
        mi("gp1", "Griptok ทรงกลม", `${W}/griptok/`),
        mi("gp2", "Magsafe Griptok", `${W}/griptok/`),
      ] },
      { id: "gp-case", title: "Case Phone", items: [
        mi("gp3", "เคสใสพรีเมี่ยม", `${W}/casephones/`),
        mi("gp4", "Frame Phone Case", "/products?category=phone-gadget"),
        mi("gp5", "Phone Hanging", `${W}/phonehanging/`),
      ] },
      { id: "gp-holder", title: "Holder Phone", items: [
        mi("gp6", "Magsafe Card Holder", `${W}/magsafewallet/`),
        mi("gp7", "Magsafe Wallet", `${W}/magsafewallet/`),
      ] },
      { id: "gp-stand", title: "Phone Stand", items: [mi("gp8", "PHONE Stand 360°", `${W}/PhoneStand360/`, "N")] },
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
        mi("hd1", "หมอนอิงยัดใย", `${W}/cushions/`, "N"),
        mi("hd2", "ปลอกหมอนอิง", `${W}/cushions/`, "H"),
        mi("hd3", "ปลอกหมอน", `${W}/pillowcase/product/?productId=product`),
        mi("hd4", "ปลอกหมอนข้าง", `${W}/pillowcase/product/?productId=product`),
      ] },
      { id: "hd-kitchen", title: "Kitchenware", items: [
        mi("hd5", "แผ่นหินรองแก้วน้ำ", `${W}/coastersceramic/`),
        mi("hd6", "แผ่นรองแก้วกลิสเตอร์", `${W}/coastersglitter/`),
        mi("hd7", "ผ้ารองจาน", `${W}/Placemat/`),
      ] },
      { id: "hd-decor", title: "Home Decor", items: [
        mi("hd8", "ผ้าห่ม", `${W}/blanket`),
        mi("hd9", "ผ้าขนหนู", `${W}/towels/`),
        mi("hd10", "ผ้าเช็ดหน้า", `${W}/Facecloth/`),
        mi("hd11", "พรมเช็ดเท้า", `${W}/doormat/`),
      ] },
      { id: "hd-pet", title: "PET", items: [
        mi("hd12", "ปลอกคอสัตว์เลี้ยง", `${W}/collaranimal/`),
        mi("hd13", "เสื้อสัตว์เลี้ยง", `${W}/Petclothes/`),
      ] },
      { id: "hd-sign", title: "Sign & Display", items: [
        mi("hd14", "ป้ายแขวนประตู", `${W}/doorhanger/`),
        mi("hd15", "โปสเตอร์แคนวาส", `${W}/wallposterhang/`),
        mi("hd16", "X-Stand", `${W}/stand/`),
        mi("hd17", "Roll Up", `${W}/stand/`),
        mi("hd18", "ผ้าแขวนผนัง", `${W}/wallcloth/`),
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
        mi("fb1", "กระเป๋าผ้า", `${W}/tote`, "N"),
        mi("fb2", "กระเป๋าผ้า (พิมพ์ลายเต็มใบ)", `${W}/Tote-Full-Printing/`, "H"),
        mi("fb3", "ถุงผ้าดิบหูรูด", `${W}/Drawstring-Bag/`),
        mi("fb4", "ถุงผ้าหูรูด (พิมพ์ลายเต็มใบ)", `${W}/drawstringbag_fullprinting/`, "H"),
      ] },
      { id: "fb-shirt", title: "Shirt", items: [mi("fb5", "เสื้อยืด", `${W}/tshirt/`)] },
      { id: "fb-women", title: "Women Product", items: [
        mi("fb6", "ยางรัดผม", `${W}/scrunchy/`),
        mi("fb7", "ผ้าพันผม / ผ้าพันหูกระเป๋า", `${W}/scarf/`),
        mi("fb8", "ผ้าคลุมไหล่", `${W}/Shawl/`),
      ] },
      { id: "fb-general", title: "General Products", items: [
        mi("fb9", "Clip Pouch", `${W}/clip_pouch/`),
        mi("fb10", "ผ้าหนึบ", `${W}/StickyFabric/`),
      ] },
      { id: "fb-other", title: "Other Products", items: [
        mi("fb11", "ผ้าห่มมีฮู้ด", `${W}/Blanket_hoodie/product_card/product/?productId=product`),
        mi("fb12", "ผ้าปิดตา", `${W}/SLEEP_MASK/product_card/product`),
      ] },
    ],
  },
];

/** สีแถบพื้นหลังเริ่มต้น — ฟ้าอ่อนแบบเว็บหลักของร้าน */
export const DEFAULT_TILES_BG = "#c9e1f2";

export const DEFAULT_SITE_NAV: SiteNav = {
  menu: DEFAULT_MENU,
  mega: DEFAULT_MEGA,
  tiles: DEFAULT_TILES,
  tilesOn: true,
  tilesBg: DEFAULT_TILES_BG,
  tilesWave: true,
  tilesPos: "hero",
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

  return {
    menu: menu.length ? menu : DEFAULT_MENU,
    // เมนูดรอปดาวน์ "ว่างได้" — ลบหมดคือตั้งใจไม่เอา ไม่ใช่ตั้งค่าพลาด
    mega: Array.isArray(raw?.mega) ? mega : DEFAULT_MEGA,
    tiles: tiles.length ? tiles : DEFAULT_TILES,
    tilesOn: raw?.tilesOn !== false,
    // สีต้องเป็นรหัสสีจริงเท่านั้น (ค่านี้ถูกยัดลง style ตรง ๆ)
    tilesBg: /^#[0-9a-f]{3,8}$/i.test(str(raw?.tilesBg)) ? str(raw?.tilesBg) : undefined,
    tilesWave: Boolean(raw?.tilesWave),
    tilesPos: (["top", "hero", "features"] as const).includes(raw?.tilesPos as "top") ? raw?.tilesPos : "hero",
  };
}

/** เฉพาะที่ลูกค้าเห็น (ตัดที่ซ่อนไว้ออก) */
export const visibleMenu = (n: SiteNav) => n.menu.filter((l) => !l.hidden);
export const visibleMega = (n: SiteNav) => n.mega.filter((g) => !g.hidden && g.columns.length);
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

/**
 * 📸 อัลบั้มผลงาน (หน้า /gallery · เมนู "ผลงาน") — ข้อมูลดึงจากเว็บเดิม iduckyofficial.com/gallery
 * ด้วย scripts/gallery-sync.mjs → ./gallery-data.json (เก็บแค่ชื่อไฟล์ · ภาพจริงอยู่บน makewebcdn)
 *
 * makewebcdn ย่อภาพให้ตามขนาดใน path: r_WxH = ย่อให้พอดีกรอบ (ปกอัลบั้ม/ภาพย่อ) · m_Wx0 = กว้างสูงสุด W
 * ⚠️ ถ้าวันหนึ่งปิดเว็บเดิม ภาพหน้านี้หายทั้งหมด → ต้องย้ายไฟล์มาไว้ที่เราก่อน
 */
import raw from "./gallery-data.json";

export type GalleryAlbum = {
  id: number;
  /** ชื่ออัลบั้ม */
  t: string;
  /** คำอธิบาย (meta description ของเว็บเดิม · บางอัลบั้มไม่มี) */
  d?: string;
  /** ไฟล์ภาพปก */
  c: string;
  /** ไฟล์ภาพในอัลบั้ม เรียงตามเว็บเดิม */
  p: string[];
  /** หมวด (คิดจากชื่อด้วย GALLERY_CATS) */
  cat: GalleryCatId;
};

export type GalleryCatId =
  | "keychain"
  | "acrylic"
  | "case"
  | "sticker"
  | "paper"
  | "calendar"
  | "fabric"
  | "gift"
  | "review";

/** ชิปกรองหมวด — เช็กตามลำดับ ตัวแรกที่ชื่ออัลบั้มตรงคือหมวดนั้น (ตัวท้าย = ที่เหลือทั้งหมด) */
export const GALLERY_CATS: { id: GalleryCatId; label: string; emoji: string; re?: RegExp }[] = [
  { id: "review", label: "รีวิวลูกค้า", emoji: "⭐", re: /^review$/i },
  { id: "calendar", label: "ปฏิทิน", emoji: "🗓️", re: /ปฏิทิน|ปฎิทิน|calendar/i },
  { id: "keychain", label: "พวงกุญแจ", emoji: "🔑", re: /พวงกุญแจ|keychain|carabiner/i },
  {
    id: "fabric",
    label: "ผ้า เสื้อ กระเป๋า",
    emoji: "👕",
    re: /ผ้า|เสื้อ|กระเป๋า|bag|หมอน|หมวก|กางเกง|pouch|อาร์ม|ปัก|ยางรัดผม|สายคล้อง|slogan|ตุ๊กตา|พรม|ถุง|blanket|dtf|flex|wallet/i,
  },
  {
    id: "case",
    label: "เคส & กริ๊ปต๊อก",
    emoji: "📱",
    re: /เคส|case|griptok|กิ๊บต๊อก|กริ๊บต๊อก|magsafe|โทรศัพท์|มือถือ|phone|airpods|powerbank/i,
  },
  { id: "sticker", label: "สติ๊กเกอร์", emoji: "🌈", re: /สติ๊กเกอร์|sticker|รองขาว|รองเงิน/i },
  {
    id: "acrylic",
    label: "อะคริลิค & สแตนดี้",
    emoji: "💎",
    re: /อะคริลิ|อะคลิลิ|acrylic|สแตนดี้|standy|stand|shake|swinger|ชิงช้า|เรือโจรสลัด|กรอบรูป|frame/i,
  },
  {
    id: "paper",
    label: "กระดาษ & ป้าย",
    emoji: "📄",
    re: /กระดาษ|การ์ด|card|โปสเตอร์|ชิกิชิ|banner|ไวนิล|roll ?up|x-stand|โฟมบอร์ด|foam|spot ?uv|สมุด|ป้าย|bookmark|พัด|ฟอยด์/i,
  },
  { id: "gift", label: "ของใช้ & ของขวัญ", emoji: "🎁" },
];

/** ข้อยกเว้นที่เช็กก่อนชิปทั้งหมด (ชื่อที่คำในหมวดอื่นแทรกอยู่) */
const OVERRIDES: [RegExp, GalleryCatId][] = [
  [/^(กระดาษ|ปลอกกระดาษ)/, "paper"],
  [/^canvas frame$/i, "gift"],
];

const catOf = (title: string): GalleryCatId =>
  OVERRIDES.find(([re]) => re.test(title))?.[1] ??
  GALLERY_CATS.find((c) => !c.re || c.re.test(title))?.id ??
  "gift";

export const GALLERY_ALBUMS: GalleryAlbum[] = (raw as Omit<GalleryAlbum, "cat">[]).map((a) => ({
  ...a,
  cat: catOf(a.t),
}));

export const GALLERY_PHOTO_COUNT = GALLERY_ALBUMS.reduce((s, a) => s + a.p.length, 0);

const CDN = "https://image.makewebcdn.com/makeweb";
const SHOP_DIR = "uccSzrU5X/DefaultData";

/** URL ภาพตามขนาด — thumb = ปก/ภาพย่อ (สี่เหลี่ยม) · large = ดูเต็มจอ */
export function galleryImg(file: string, size: "thumb" | "small" | "large" = "thumb"): string {
  const s = size === "large" ? "m_1200x0" : size === "small" ? "r_260x260" : "r_400x400";
  return `${CDN}/${s}/${SHOP_DIR}/${encodeURIComponent(file)}`;
}

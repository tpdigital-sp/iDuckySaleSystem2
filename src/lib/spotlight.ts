/**
 * 🎯 ส่วน "เชียร์ขาย" บนหน้าแรก — คั่นระหว่างป้ายประชาสัมพันธ์กับ "สินค้ามาใหม่"
 *
 * เจ้าของร้านสั่ง 25 ก.ย. 69: "เสื้อขายไม่ค่อยได้ อยากได้การโชว์ให้ลูกค้าสนใจ" — เสื้อไม่เคยโผล่บนหน้าแรก
 * (มาใหม่/ขายดีเรียงตามยอด ของที่ยอดน้อยไม่ติดอันดับ ยิ่งไม่โชว์ยิ่งไม่ขาย) จึงทำเป็นส่วนแยกที่ร้านเลือกเองว่าจะเชียร์อะไร
 *
 * โครง 4 ชั้น: ลุคบุ๊ค (รูปใหญ่ + ป้ายลอย 2 ใบ) · คำเชียร์ (หัวข้อ/ทีมงานบอก/จุดเด่น/ปุ่ม) · ทรงสินค้า 4 ใบ · ชิปไอเดีย
 * แอดมินแก้ที่ /admin/spotlight · เก็บเป็นแถวพิเศษ "__spotlight__" ในตาราง products (วิธีเดียวกับ __promo_banners__)
 * ราคาบนการ์ดทรงสินค้าดึงจากสินค้าจริง (product.priceMin) ไม่พิมพ์เอง — ปรับราคาแล้วหน้าแรกไม่หลุด
 * ไม่มีข้อมูลในฐาน = ใช้ชุดเริ่มต้น "เสื้อ" ในไฟล์นี้ · ปิดสวิตช์ = ไม่วาดอะไรเลย (หน้าแรกเหมือนเดิม)
 */

export const SPOTLIGHT_ROW_ID = "__spotlight__";
export const MAX_STYLES = 6;
export const MAX_POINTS = 6;
export const MAX_IDEAS = 10;

/** ป้ายสีบนการ์ดทรงสินค้า */
export const STYLE_TAG_TONES = ["coral", "blue", "green"] as const;
export type StyleTagTone = (typeof STYLE_TAG_TONES)[number];

/** ป้ายลอยบนรูปใหญ่ (รูปเล็ก + ข้อความสั้น) */
export interface SpotFloat {
  image?: string;
  text: string;
}

/** การ์ดทรงสินค้า 1 ใบ — ผูกกับสินค้าจริงด้วย productId (ราคา + ลิงก์ดึงจากสินค้า) */
export interface SpotStyle {
  productId: string;
  /** ชื่อที่โชว์ (ว่าง = ใช้ชื่อสินค้า) */
  name?: string;
  /** บรรทัดรองสั้น ๆ เช่น "สายหวาน ใส่กับยีนส์เอวสูง" */
  desc?: string;
  /** รูปการ์ด (ว่าง = ใช้รูปปกสินค้า) */
  image?: string;
  /** ป้ายมุมซ้ายบน เช่น "ฮิตสุด" (ว่าง = ไม่มีป้าย) */
  tag?: string;
  tagTone?: StyleTagTone;
}

export interface Spotlight {
  /** ปิด = ส่วนนี้หายจากหน้าแรกทั้งก้อน */
  on: boolean;
  /** ป้ายเล็กเหนือหัวข้อ เช่น "👕 เสื้อพิมพ์ลายของคุณเอง" */
  kicker: string;
  /** หัวข้อบรรทัด 1 / บรรทัด 2 (บรรทัด 2 ท่อนท้ายเป็นสีเหลือง) */
  title1: string;
  title2: string;
  /** ท่อนท้ายของบรรทัด 2 ที่เน้นสีเหลือง (ต้องเป็นส่วนท้ายของ title2 ถึงจะเน้น) */
  title2Accent?: string;
  lead?: string;
  /** กล่อง "ทีมงานบอก:" */
  pitch?: string;
  /** จุดเด่น ✓ */
  points: string[];
  ctaLabel: string;
  ctaHref: string;
  /** รูปลุคบุ๊คใบใหญ่ */
  heroImage?: string;
  heroAlt?: string;
  floats: SpotFloat[];
  styles: SpotStyle[];
  /** หัวข้อแถวชิปไอเดีย เช่น "💡 ไอเดียยอดฮิต:" */
  ideasLabel?: string;
  ideas: string[];
}

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";

/** ชุดเริ่มต้น = เชียร์เสื้อ (ใช้รูปที่มีอยู่แล้วในคลังสินค้า ไม่ต้องอัปใหม่) */
export const DEFAULT_SPOTLIGHT: Spotlight = {
  on: true,
  kicker: "👕 เสื้อพิมพ์ลายของคุณเอง",
  title1: "ลายที่คุณวาด",
  title2: "ใส่ได้จริงในตัวเดียว",
  title2Accent: "ในตัวเดียว",
  lead: "เสื้อครอป · ยูนิเซ็กซ์ · โอเวอร์ไซส์ · เสื้อกีฬา — ส่งลายมา ทีมงานจัดวางให้ พิมพ์คม ซักไม่ลอก",
  pitch: "ลายไม่พร้อมไม่เป็นไร แค่ส่งรูปน้องหมา รูปคู่ หรือโลโก้ร้านมา เราช่วยออกแบบให้ฟรีจนกว่าจะพอใจ",
  points: ["พิมพ์ DTF สีสด ซักแล้วลายไม่แตก", "ผ้าคอตตอนนุ่ม มีให้เลือกทั้งขาว/ดำ/เบจ", "สั่ง 1 ตัวได้ · สั่งเป็นทีมยิ่งถูกลง", "แจ้งคิวชัดเจน ส่งทั่วไทย"],
  ctaLabel: "ออกแบบเสื้อของฉัน",
  ctaHref: "/products/crop",
  heroImage: `${IMG}/crop/photo-black-worn-moon-v1.jpg`,
  heroAlt: "ลูกค้าใส่เสื้อครอปสีดำพิมพ์ลายเป็ดนอนบนพระจันทร์",
  floats: [
    { image: `${IMG}/crop/photo-white-black-hangers-v1.jpg`, text: "สั่ง 1 ตัวก็ทำ ไม่มีขั้นต่ำ" },
    { image: `${IMG}/crop/cover-duck-icecream-v1.jpg`, text: "ลูกค้าใส่จริง 📸" },
  ],
  styles: [
    { productId: "crop", name: "เสื้อครอป", desc: "สายหวาน ใส่กับยีนส์เอวสูง", tag: "ฮิตสุด", tagTone: "coral" },
    { productId: "unisex", name: "ยูนิเซ็กซ์", desc: "ทรงมาตรฐาน ใส่ได้ทุกคน", image: `${IMG}/new-mt2eng6u-7593/6dd673d6-db76-471e-b3e3-bfc7ba88d537.jpg`, tag: "พิมพ์เต็มตัว", tagTone: "blue" },
    { productId: "oversize", name: "โอเวอร์ไซส์", desc: "หลวมสบาย สไตล์เกาหลี", tag: "ทรงใหม่", tagTone: "green" },
    { productId: "sport", name: "เสื้อกีฬา", desc: "ใส่ชื่อ-เบอร์ได้ทุกตัว", image: `${IMG}/sport/gallery-1.jpg`, tag: "ทีม/รุ่น", tagTone: "blue" },
  ],
  ideasLabel: "💡 ไอเดียยอดฮิต:",
  ideas: ["🐶 รูปน้องหมาน้องแมว", "💑 เสื้อคู่", "🎓 เสื้อรุ่น / เสื้อทีม", "🏪 ยูนิฟอร์มร้าน", "🎂 เสื้อวันเกิด", "🎤 แฟนคลับ / คอนเสิร์ต"],
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const text = (v: unknown, max: number) => str(v).trim().slice(0, max);
/** รับเฉพาะ path ภายใน หรือ URL http(s) — กัน javascript: หลุดเข้า src/href */
const safeUrl = (v: unknown) => {
  const s = str(v).trim();
  return /^(\/(?!\/)|https?:\/\/)/.test(s) ? s : undefined;
};
const strList = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => text(x, each))
    .filter(Boolean)
    .slice(0, max);

/** ล้างค่าที่รับมาให้เป็นรูปแบบที่ไว้ใจได้ (ใช้ทั้งตอนอ่านและก่อนบันทึก) · ช่องว่างไม่เติมค่าเริ่มต้นให้ — ร้านลบทิ้งได้จริง */
export function spotlightOf(raw: Partial<Spotlight> | null | undefined): Spotlight {
  if (!raw || typeof raw !== "object") return DEFAULT_SPOTLIGHT;
  const floats = (Array.isArray(raw.floats) ? raw.floats : [])
    .map((f) => ({ image: safeUrl(f?.image), text: text(f?.text, 60) }))
    .filter((f) => f.text)
    .slice(0, 2);
  const styles = (Array.isArray(raw.styles) ? raw.styles : [])
    .map((s) => ({
      productId: text(s?.productId, 80),
      name: text(s?.name, 60) || undefined,
      desc: text(s?.desc, 80) || undefined,
      image: safeUrl(s?.image),
      tag: text(s?.tag, 20) || undefined,
      tagTone: STYLE_TAG_TONES.find((t) => t === s?.tagTone),
    }))
    .filter((s) => s.productId)
    .slice(0, MAX_STYLES);
  return {
    on: raw.on !== false,
    kicker: text(raw.kicker, 60),
    title1: text(raw.title1, 60),
    title2: text(raw.title2, 60),
    title2Accent: text(raw.title2Accent, 40) || undefined,
    lead: text(raw.lead, 200) || undefined,
    pitch: text(raw.pitch, 240) || undefined,
    points: strList(raw.points, MAX_POINTS, 80),
    ctaLabel: text(raw.ctaLabel, 40) || DEFAULT_SPOTLIGHT.ctaLabel,
    ctaHref: safeUrl(raw.ctaHref) ?? DEFAULT_SPOTLIGHT.ctaHref,
    heroImage: safeUrl(raw.heroImage),
    heroAlt: text(raw.heroAlt, 120) || undefined,
    floats,
    styles,
    ideasLabel: text(raw.ideasLabel, 40) || undefined,
    ideas: strList(raw.ideas, MAX_IDEAS, 40),
  };
}

/** หัวข้อบรรทัด 2 แยกเป็น [ท่อนธรรมดา, ท่อนเน้นสี] — ท่อนเน้นต้องเป็นส่วนท้ายของบรรทัด */
export function splitAccent(s: Spotlight): [string, string] {
  const a = s.title2Accent?.trim();
  if (a && s.title2.endsWith(a) && s.title2 !== a) return [s.title2.slice(0, -a.length), a];
  if (a && s.title2 === a) return ["", a];
  return [s.title2, ""];
}

/** อ่านชุดเชียร์ (ฝั่งเบราว์เซอร์) — แชร์ผลลัพธ์ครั้งเดียวทั้งแท็บ */
let cached: Promise<Spotlight> | null = null;

export function fetchSpotlight(): Promise<Spotlight> {
  cached ??= fetch("/api/spotlight")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { spotlight?: Partial<Spotlight> } | null) => (j?.spotlight ? spotlightOf(j.spotlight) : DEFAULT_SPOTLIGHT))
    .catch(() => DEFAULT_SPOTLIGHT);
  return cached;
}

/** ล้างแคชหลังแอดมินกดบันทึก */
export function clearSpotlightCache() {
  cached = null;
}

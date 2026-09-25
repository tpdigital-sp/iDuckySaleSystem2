/**
 * 🎯 ส่วน "เชียร์ขาย" บนหน้าแรก — คั่นระหว่างป้ายประชาสัมพันธ์กับ "สินค้ามาใหม่"
 *
 * เจ้าของร้านสั่ง 25 ก.ย. 69: "เสื้อขายไม่ค่อยได้ อยากได้การโชว์ให้ลูกค้าสนใจ" — เสื้อไม่เคยโผล่บนหน้าแรก
 * (มาใหม่/ขายดีเรียงตามยอด ของที่ยอดน้อยไม่ติดอันดับ ยิ่งไม่โชว์ยิ่งไม่ขาย) จึงทำเป็นส่วนแยกที่ร้านเลือกเองว่าจะเชียร์อะไร
 * รอบแรกทำเป็นลุคบุ๊คใหญ่+ข้อความเยอะ เจ้าของร้านบอก "ใหญ่/ยาว ไม่เข้ากับหน้าเว็บ" → รอบ 2 ย่อเป็นโครงเดียวกับ
 * "สินค้ามาใหม่": หัวข้อกลาง + รางเลื่อนการ์ดสินค้าชุดเดิมของเว็บ + ลูกเล่นเป็ดแอบมอง/รูปสลับเอง
 * รอบ 3 เจ้าของร้านสรุป: "เป็นจุดที่ฉันเลือกสินค้ามาแสดง ให้ลูกค้าเห็นผ่านตา" → ข้อความกลาง ๆ เลือกสินค้าได้ถึง 12 ตัว รางเลื่อนเอง
 *
 * แอดมินแก้ที่ /admin/spotlight · เก็บเป็นแถวพิเศษ "__spotlight__" ในตาราง products (วิธีเดียวกับ __promo_banners__)
 * ราคาบนการ์ดดึงจากสินค้าจริง (priceRange) ไม่พิมพ์เอง — ปรับราคาแล้วหน้าแรกไม่หลุด
 * ไม่มีข้อมูลในฐาน = ใช้ชุดเริ่มต้น "เสื้อ" ในไฟล์นี้ · ปิดสวิตช์ = ไม่วาดอะไรเลย (หน้าแรกเหมือนเดิม)
 */

export const SPOTLIGHT_ROW_ID = "__spotlight__";
export const MAX_STYLES = 12;
export const MAX_CHIPS = 4;

/** สีป้ายบนการ์ด: hot = ส้มไฟ (ชุดเดียวกับ "ขายดี") · new = ฟ้า (ชุด "NEW") · mint = เขียว */
export const STYLE_TAG_TONES = ["hot", "new", "mint"] as const;
export type StyleTagTone = (typeof STYLE_TAG_TONES)[number];

/** การ์ด 1 ใบ — ผูกกับสินค้าจริงด้วย productId (ราคา + ลิงก์ + รูปปก + รูปที่สองดึงจากสินค้า) */
export interface SpotStyle {
  productId: string;
  /** ชื่อที่โชว์ (ว่าง = ใช้ชื่อสินค้า) */
  name?: string;
  /** บรรทัดเล็กเหนือชื่อ เช่น "สายหวาน ใส่กับยีนส์เอวสูง" (ว่าง = ชื่อหมวด) */
  desc?: string;
  /** รูปการ์ด (ว่าง = ใช้รูปปกสินค้า) */
  image?: string;
  /** ป้ายมุมการ์ด เช่น "ฮิตสุด" (ว่าง = ไม่มีป้าย) */
  tag?: string;
  tagTone?: StyleTagTone;
}

export interface Spotlight {
  /** ปิด = ส่วนนี้หายจากหน้าแรกทั้งก้อน */
  on: boolean;
  /** ป้ายเล็กเหนือหัวข้อ เช่น "ร้านเชียร์ตัวนี้" (อีโมจิ 👕 วาดให้เอง) */
  kicker: string;
  /** หัวข้อ — ท่อนท้ายที่ตรงกับ accent เป็นสีเหลือง (แบบ "สินค้า<em>มาใหม่</em>") */
  title: string;
  accent?: string;
  /** บรรทัดรองสั้น ๆ 1 บรรทัด */
  lead?: string;
  /** ชิปสั้น ๆ ใต้หัวข้อ (สูงสุด 4) เช่น "สั่ง 1 ตัวก็ทำ" */
  chips: string[];
  ctaLabel: string;
  ctaHref: string;
  styles: SpotStyle[];
}

/**
 * รูปการ์ดชุดเริ่มต้น — ภาพไลฟ์สไตล์ที่สร้างจากรูปสินค้าจริง (Gemini image · 25 ก.ย. 69 เจ้าของร้านบอกรูปปกเดิม "ไม่น่าสนใจ")
 * อยู่ในโฟลเดอร์ products/spotlight/ ของ bucket product-images · มีภาพสำรองให้เลือกที่หลังบ้าน:
 * crop-duo-oldtown-v1 · oversize-hangers-v1 · sport-team-skatepark-v1 (นามสกุล .webp เหมือนกัน)
 */
const SPOT_IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/spotlight/";

/**
 * ชุดเริ่มต้น — ข้อความกลาง ๆ ใช้กับสินค้าอะไรก็ได้ · รายการสินค้าเริ่มด้วยเสื้อ 4 ทรง (เจ้าของร้านบอกเสื้อขายไม่ออก)
 * รูปการ์ดใช้รูปปกที่ตั้งไว้ในสินค้า ไม่ต้องอัปใหม่ · เจ้าของร้านเปลี่ยน/เพิ่มสินค้าได้เองที่ /admin/spotlight
 */
export const DEFAULT_SPOTLIGHT: Spotlight = {
  on: true,
  kicker: "ร้านคัดมาให้",
  title: "สินค้าที่อยากให้ลองดู",
  accent: "ลองดู",
  lead: "ทีมงานเลือกมาให้เห็นก่อนใคร — เลื่อนดูได้เลย",
  chips: [],
  ctaLabel: "ดูสินค้าทั้งหมด",
  ctaHref: "/products",
  styles: [
    { productId: "crop", desc: "สายหวาน ใส่กับยีนส์เอวสูง", tag: "ฮิตสุด", tagTone: "hot", image: `${SPOT_IMG}crop-icecream-street-v1.webp` },
    { productId: "unisex", desc: "ทรงมาตรฐาน ใส่ได้ทุกคน", tag: "พิมพ์เต็มตัว", tagTone: "new" },
    { productId: "oversize", desc: "หลวมสบาย สไตล์เกาหลี", tag: "ทรงใหม่", tagTone: "mint", image: `${SPOT_IMG}oversize-headphones-street-v1.webp` },
    { productId: "sport", desc: "ใส่ชื่อ-เบอร์ได้ทุกตัว", tag: "ทีม / รุ่น", tagTone: "new", image: `${SPOT_IMG}sport-team-backs-v1.webp` },
  ],
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const text = (v: unknown, max: number) => str(v).trim().slice(0, max);
/** รับเฉพาะ path ภายใน หรือ URL http(s) — กัน javascript: หลุดเข้า src/href */
const safeUrl = (v: unknown) => {
  const s = str(v).trim();
  return /^(\/(?!\/)|https?:\/\/)/.test(s) ? s : undefined;
};

/** ล้างค่าที่รับมาให้เป็นรูปแบบที่ไว้ใจได้ (ใช้ทั้งตอนอ่านและก่อนบันทึก) · ช่องว่างไม่เติมค่าเริ่มต้นให้ — ร้านลบทิ้งได้จริง */
export function spotlightOf(raw: Partial<Spotlight> | null | undefined): Spotlight {
  if (!raw || typeof raw !== "object") return DEFAULT_SPOTLIGHT;
  const styles = (Array.isArray(raw.styles) ? raw.styles : [])
    .map((s) => ({
      productId: text(s?.productId, 80),
      name: text(s?.name, 60) || undefined,
      desc: text(s?.desc, 60) || undefined,
      image: safeUrl(s?.image),
      tag: text(s?.tag, 20) || undefined,
      tagTone: STYLE_TAG_TONES.find((t) => t === s?.tagTone),
    }))
    .filter((s) => s.productId)
    .slice(0, MAX_STYLES);
  return {
    on: raw.on !== false,
    kicker: text(raw.kicker, 40),
    title: text(raw.title, 60),
    accent: text(raw.accent, 40) || undefined,
    lead: text(raw.lead, 120) || undefined,
    chips: (Array.isArray(raw.chips) ? raw.chips : [])
      .map((c) => text(c, 30))
      .filter(Boolean)
      .slice(0, MAX_CHIPS),
    ctaLabel: text(raw.ctaLabel, 40) || DEFAULT_SPOTLIGHT.ctaLabel,
    ctaHref: safeUrl(raw.ctaHref) ?? DEFAULT_SPOTLIGHT.ctaHref,
    styles,
  };
}

/** หัวข้อแยกเป็น [ท่อนธรรมดา, ท่อนเน้นสี] — ท่อนเน้นต้องเป็นส่วนท้ายของหัวข้อ */
export function splitAccent(s: Spotlight): [string, string] {
  const a = s.accent?.trim();
  if (a && s.title.endsWith(a)) return [s.title.slice(0, -a.length), a];
  return [s.title, ""];
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

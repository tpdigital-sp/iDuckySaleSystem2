/**
 * 📣 ป้ายประชาสัมพันธ์หน้าแรก — แถบใต้แบนเนอร์ใหญ่ เหนือ "สินค้ามาใหม่"
 *
 * แอดมินจัดการที่ /admin/banners (เมนู ร้าน & ระบบ) · เก็บเป็นแถวพิเศษ id "__promo_banners__"
 * ในตาราง products (วิธีเดียวกับ __site_nav__ / __shop_payment__ — ไม่ต้องสร้างตารางใหม่)
 * จงใจแยกแถวจาก __site_nav__ : หน้า "เมนูหน้าร้าน" บันทึกทับทั้งก้อน nav ถ้าฝากไว้ด้วยกันป้ายจะหายตอนเขาเซฟ
 *
 * ป้าย 1 ใบเป็นได้ 2 แบบ: มีรูป = ป้ายภาพ (ทีม Content ออกแบบมาแล้ว) · ไม่มีรูป = แถบข้อความ (หัวข้อ + รายละเอียด + ปุ่ม)
 * หลายใบ = สไลด์สลับเอง · ตั้งวันเริ่ม/วันสิ้นสุดได้ (เวลาไทย) หมดเขตแล้วหายจากหน้าร้านเอง
 */

import { BKK_TZ } from "@/lib/bangkok-time";

/** ท่าขยับของชิ้นลูกเล่น — CSS อยู่ท้าย landing.css (.promo-fx-*) */
export const LAYER_ANIMS = ["bob", "twinkle", "drift", "ping", "rise", "blink", "hop", "nudge", "tap"] as const;
/** ท่าที่วาดด้วย CSS ล้วน ไม่ต้องมีรูป (ping = วงแหวนกลมเรียกกด · blink = เปลือกตาปิดแวบเดียว · tap = วงแหวนทรงปุ่มเรียกกดครอบปุ่มในรูป) */
const SHAPE_ANIMS: readonly LayerAnim[] = ["ping", "blink", "tap"];
export type LayerAnim = (typeof LAYER_ANIMS)[number];

/**
 * 🐣 ท่าขยับของ "ทั้งใบ" (ป้ายภาพ) — ลอยขึ้นลง / โยกซ้ายขวา / หายใจเข้าออก / เด้งดึ๋ง / สะบัดเป็นจังหวะ
 * ป้ายนิ่งสนิทดูเป็นรูปติดผนัง ขยับเบา ๆ แล้วสะดุดตาขึ้นเยอะ — CSS ชุด .promo-mo-* ท้าย landing.css
 * ต่างจาก BannerLayer: ไม่ต้องวางตำแหน่งเป็น % ไม่ผูกกับรูป เปลี่ยนรูปแล้วท่าเดิมใช้ต่อได้เลย (แอดมินเลือกเองได้ในหน้า /admin/banners)
 * ไม่ได้ตั้งค่า = ใช้ท่า DEFAULT_MOTION · "none" = สั่งให้นิ่ง
 */
export const BANNER_MOTIONS = ["float", "sway", "breathe", "hop", "wiggle"] as const;
export type BannerMotion = (typeof BANNER_MOTIONS)[number];
export const DEFAULT_MOTION: BannerMotion = "float";
const MOTION_VALUES = ["none", ...BANNER_MOTIONS] as const;

/**
 * ✨ ชิ้นลูกเล่นที่ลอยทับป้ายภาพแล้วขยับ (น้องเป็ดโยกตัว · ดาววิบวับ · เมฆลอย · วงแหวนเรียกกดที่ปุ่ม)
 * ตำแหน่ง/ขนาดเป็น "% ของป้าย" จึงย่อขยายตามจอได้เอง · ตำแหน่งผูกกับรูปใบนั้น → เปลี่ยนรูปเมื่อไหร่ต้องถอดลูกเล่นทิ้ง
 * ยังไม่มีหน้าจอให้วางเอง — ลงผ่านสคริปต์ (ดู scripts/promo-banner-web-order.mjs) · หลังบ้านเปิด/ปิดการขยับได้
 */
export interface BannerLayer {
  /** รูปของชิ้นนี้ (พื้นโปร่ง) — "ping" / "blink" ไม่ต้องมี (วาดด้วย CSS) */
  src?: string;
  /** ขอบซ้าย / ขอบบน / ความกว้าง เป็น % ของป้าย (ติดลบ/เกิน 100 ได้ = ล้นขอบแล้วโดนตัด) */
  x: number;
  y: number;
  w: number;
  /** ความสูงเป็น % ของป้าย — เฉพาะชิ้นที่วาดด้วย CSS ทรงไม่จัตุรัส ("tap" ครอบปุ่มทรงแคปซูล) · ชิ้นที่เป็นรูปสูงตามสัดส่วนรูปเอง */
  h?: number;
  anim: LayerAnim;
  /** หมุนค้างไว้กี่องศา (ดาวเอียง ๆ) */
  rot?: number;
  /** ความทึบ 0–1 */
  opacity?: number;
  /** รอบละกี่วินาที / เริ่มช้ากี่วินาที (เหลื่อมจังหวะกันจะได้ไม่ขยับพร้อมกันเป็นแผง) */
  dur?: number;
  delay?: number;
  /** สีของชิ้นที่วาดด้วย CSS (blink = สีผิวรอบตา) — รหัสสี #hex เท่านั้น */
  color?: string;
  /**
   * ชิ้นลูกที่เกาะไปกับชิ้นนี้ (เปลือกตาบนหน้าเป็ด) — x/y/w เป็น % ของ "ชิ้นแม่" ไม่ใช่ของป้าย
   * แม่โยกตัวไปทางไหนลูกไปด้วย · ซ้อนได้ชั้นเดียว
   */
  kids?: BannerLayer[];
}

export interface PromoBanner {
  id: string;
  /** ชื่อป้าย — หัวข้อของแถบข้อความ · ป้ายภาพใช้เป็นคำอธิบายรูป (alt) และชื่อในหลังบ้าน */
  title: string;
  /** รายละเอียดบรรทัดรอง (เฉพาะแถบข้อความ) */
  body?: string;
  /** รูปป้าย (จอกว้าง) — ไม่ใส่ = แถบข้อความ */
  image?: string;
  /** รูปสำหรับมือถือ (ไม่ใส่ = ใช้รูปเดียวกับจอกว้าง) */
  imageMobile?: string;
  /** ชิ้นลูกเล่นขยับบนรูปจอคอม / รูปมือถือ (คนละเลย์เอาต์ ตำแหน่งจึงแยกกัน) */
  layers?: BannerLayer[];
  layersMobile?: BannerLayer[];
  /** ท่าขยับของทั้งใบ (ไม่ตั้ง = DEFAULT_MOTION · "none" = นิ่ง) */
  motion?: BannerMotion | "none";
  /** แสงวิ่งพาดป้ายเป็นระยะ */
  shine?: boolean;
  /** ปิดการขยับทั้งหมดของป้ายนี้ (ชิ้นลูกเล่นยังวาดอยู่ แต่นิ่ง) */
  still?: boolean;
  /** กดแล้วไปไหน (path ภายใน หรือ https://) — ไม่ใส่ = กดไม่ได้ */
  href?: string;
  /** ข้อความบนปุ่มของแถบข้อความ (ไม่ใส่ = "ดูรายละเอียด") */
  btnLabel?: string;
  /** ซ่อนจากหน้าร้านโดยไม่ต้องลบ */
  hidden?: boolean;
  /** วันเริ่มแสดง "YYYY-MM-DD" (เวลาไทย · ไม่ตั้ง = แสดงเลย) */
  startAt?: string;
  /** วันสุดท้ายที่แสดง "YYYY-MM-DD" (เวลาไทย · ไม่ตั้ง = ไม่มีวันหมด) */
  endAt?: string;
}

export interface PromoBannerSet {
  /** ปิดทั้งแถบโดยไม่ต้องลบป้าย */
  on: boolean;
  /** สลับป้ายทุกกี่วินาที (3–20 · หลายใบเท่านั้น) */
  seconds: number;
  items: PromoBanner[];
}

/**
 * 📐 ขนาดไฟล์ที่ให้กราฟฟิกออกแบบ — แหล่งเดียวของตัวเลข (หน้า /admin/banners โชว์ + เตือนตอนอัปไฟล์ผิดขนาด)
 * จอคอม: กรอบเนื้อหาหน้าแรกกว้าง 1160px → ทำ 2 เท่าให้คมบนจอ retina · มือถือ: เต็มความกว้างจอ (~375px) ทำ ~3 เท่า
 * ความสูงไม่ถูกบังคับ (ระบบโชว์เต็มใบไม่ครอป) แต่ป้ายในสไลด์ชุดเดียวกันควรสูงเท่ากัน ไม่งั้นใบเตี้ยจะมีขอบขาวบนล่าง
 */
export const BANNER_SPEC = {
  desktop: { w: 2320, h: 810, shownAs: "1160×405", minText: 24, margin: 60 },
  mobile: { w: 1536, h: 1024, shownAs: "ประมาณ 375×250", minText: 36, margin: 50 },
  maxMB: 4.5,
} as const;

/** ข้อความสเปคไว้คัดลอกส่งกราฟฟิกทาง LINE */
export function bannerSpecText(): string {
  const { desktop: d, mobile: m, maxMB } = BANNER_SPEC;
  return [
    "📐 ขนาดป้ายประชาสัมพันธ์หน้าแรกเว็บ iDucky (ทำ 2 ไฟล์ต่อ 1 ป้าย)",
    `1) จอคอม: ${d.w}×${d.h} px (แสดงจริง ${d.shownAs}) · ตัวหนังสือเล็กสุด ${d.minText}px · เว้นขอบ ${d.margin}px`,
    `2) มือถือ: ${m.w}×${m.h} px (แสดงจริง${m.shownAs}) · ตัวหนังสือเล็กสุด ${m.minText}px · เว้นขอบ ${m.margin}px`,
    `ไฟล์: JPG / PNG / WEBP · RGB 72dpi · ไม่เกิน ${maxMB}MB ต่อไฟล์`,
    "ห้ามวางข้อความ/โลโก้ชิดมุม — ระบบตัดมุมโค้งให้ · ไม่ต้องทำเงา/ขอบโค้งมาในไฟล์",
    "มือถือจัดเลย์เอาต์ใหม่ (ไม่ใช่ย่อจากจอคอม) — ข้อความน้อยลง ตัวใหญ่ขึ้น",
  ].join("\n");
}

export const BANNERS_ROW_ID = "__promo_banners__";
export const MAX_BANNERS = 12;
export const DEFAULT_BANNER_SET: PromoBannerSet = { on: true, seconds: 6, items: [] };

const str = (v: unknown) => (typeof v === "string" ? v : "");
/** รับเฉพาะ path ภายใน หรือ URL http(s) — กัน javascript: หลุดเข้า src/href */
const safeUrl = (v: unknown) => {
  const s = str(v).trim();
  return /^(\/(?!\/)|https?:\/\/)/.test(s) ? s : undefined;
};
const ymd = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : undefined);

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};

export const MAX_LAYERS = 24;

function layersOf(raw: unknown, nested = false): BannerLayer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BannerLayer[] = [];
  for (const l of raw.slice(0, MAX_LAYERS) as Partial<BannerLayer>[]) {
    const anim = LAYER_ANIMS.find((a) => a === l?.anim);
    const x = num(l?.x, -60, 160);
    const y = num(l?.y, -60, 160);
    const w = num(l?.w, 0.5, 120);
    const src = safeUrl(l?.src);
    if (!anim || x === undefined || y === undefined || w === undefined) continue;
    if (!SHAPE_ANIMS.includes(anim) && !src) continue;
    out.push({
      src,
      x,
      y,
      w,
      h: num(l?.h, 0.5, 120),
      anim,
      rot: num(l?.rot, -180, 180),
      opacity: num(l?.opacity, 0, 1),
      dur: num(l?.dur, 0.5, 60),
      delay: num(l?.delay, 0, 60),
      // สีถูกยัดลง style ตรง ๆ — รับเฉพาะรหัสสีจริง
      color: /^#[0-9a-f]{3,8}$/i.test(str(l?.color)) ? str(l?.color) : undefined,
      kids: nested ? undefined : layersOf(l?.kids, true),
    });
  }
  return out.length ? out : undefined;
}

/** ล้างค่าที่รับมาให้เป็นรูปแบบที่ไว้ใจได้ (ใช้ทั้งตอนอ่านและก่อนบันทึก) */
export function bannerSetOf(raw: Partial<PromoBannerSet> | null | undefined): PromoBannerSet {
  const seen = new Set<string>();
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((b) => b && (str(b.title).trim() || safeUrl(b.image)))
    .slice(0, MAX_BANNERS)
    .map((b, i) => {
      let id = str(b.id) || `b${i}`;
      while (seen.has(id)) id += "_";
      seen.add(id);
      return {
        id,
        title: str(b.title).trim().slice(0, 120),
        body: str(b.body).trim().slice(0, 240) || undefined,
        image: safeUrl(b.image),
        imageMobile: safeUrl(b.imageMobile),
        // ลูกเล่นผูกกับรูป — ไม่มีรูปของฝั่งนั้นแล้วก็ไม่เก็บ
        layers: safeUrl(b.image) ? layersOf(b.layers) : undefined,
        layersMobile: safeUrl(b.imageMobile) ? layersOf(b.layersMobile) : undefined,
        motion: safeUrl(b.image) ? MOTION_VALUES.find((m) => m === b.motion) : undefined,
        shine: Boolean(b.shine) || undefined,
        still: Boolean(b.still) || undefined,
        href: safeUrl(b.href),
        btnLabel: str(b.btnLabel).trim().slice(0, 40) || undefined,
        hidden: Boolean(b.hidden) || undefined,
        startAt: ymd(b.startAt),
        endAt: ymd(b.endAt),
      };
    });
  const sec = Number(raw?.seconds);
  return {
    on: raw?.on !== false,
    seconds: Number.isFinite(sec) ? Math.min(20, Math.max(3, Math.round(sec))) : DEFAULT_BANNER_SET.seconds,
    items,
  };
}

/** วันนี้ตามเวลาไทย "YYYY-MM-DD" (เซิร์ฟเวอร์เป็น UTC — ห้ามใช้ toISOString ตรง ๆ) */
export function bkkToday(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BKK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** ท่าขยับที่ป้ายใบนี้ใช้จริง — null = นิ่ง (ไม่ใช่ป้ายภาพ / สั่งนิ่งเอง / กดหยุดลูกเล่นทั้งใบ) */
export function bannerMotion(b: PromoBanner): BannerMotion | null {
  if (!b.image || b.still) return null;
  const m = b.motion ?? DEFAULT_MOTION;
  return m === "none" ? null : m;
}

export type BannerState = "live" | "hidden" | "scheduled" | "expired";

/** สถานะของป้าย ณ วันนี้ — หลังบ้านใช้ติดป้าย · หน้าร้านใช้กรอง */
export function bannerState(b: PromoBanner, today: string = bkkToday()): BannerState {
  if (b.hidden) return "hidden";
  if (b.endAt && today > b.endAt) return "expired";
  if (b.startAt && today < b.startAt) return "scheduled";
  return "live";
}

/** เฉพาะป้ายที่ลูกค้าเห็นวันนี้ */
export const liveBanners = (s: PromoBannerSet, today: string = bkkToday()) =>
  s.on ? s.items.filter((b) => bannerState(b, today) === "live") : [];

/** อ่านป้าย (ฝั่งเบราว์เซอร์) — แชร์ผลลัพธ์ครั้งเดียวทั้งแท็บ กลับมาหน้าแรกซ้ำไม่ยิง API ใหม่ */
let cached: Promise<PromoBannerSet> | null = null;

export function fetchPromoBanners(): Promise<PromoBannerSet> {
  cached ??= fetch("/api/promo-banners")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { banners?: Partial<PromoBannerSet> } | null) => bannerSetOf(j?.banners))
    .catch(() => DEFAULT_BANNER_SET);
  return cached;
}

/** ล้างแคชหลังแอดมินกดบันทึก */
export function clearPromoBannersCache() {
  cached = null;
}

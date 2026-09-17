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
  desktop: { w: 2320, h: 320, shownAs: "1160×160", minText: 24, margin: 60 },
  mobile: { w: 1200, h: 600, shownAs: "ประมาณ 375×188", minText: 36, margin: 50 },
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

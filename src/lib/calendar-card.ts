/**
 * 🗓 ปฏิทินบนเว็บ — วาดทุกหน้าของปฏิทิน (รูปลูกค้า + ข้อความ + ตารางปี/เดือน) ลงแคนวาส
 *
 * ยกฟังก์ชันมาจากหน้าร้านเดิม iduckyprintsstudio.com (โปรแกรม Printbox) 4 สินค้า:
 *   - โฟโต้การ์ดปฏิทิน   หน้าปก = รูปเต็มใบ · ด้านหลัง = ปฏิทินทั้งปี
 *   - โปสการ์ดปฏิทิน     รายปี 1 ด้าน (รูป + ปฏิทินทั้งปีในหน้าเดียว) · 2 ด้าน · รายเดือน 13 ใบ
 *   - ปฏิทินตั้งโต๊ะ      ปก + 12 เดือน (รูปบน ตารางล่าง) + ภาพรวมทั้งปี · 14 แผ่น = รูปกับตารางแยกหน้า
 *   - ปฏิทินผ้าแคนวาส    ผืนเดียว รูปด้านบน + ปฏิทินทั้งปีด้านล่าง
 * ตั้งค่าฟอนต์/สี · ไฮไลต์วันหยุดนักขัตฤกษ์ไทย + สีวันอาทิตย์ · ลูกค้าใส่วันสำคัญของตัวเองได้
 *
 * หน่วยทั้งหมดเป็น "มิลลิเมตรของงานจริง" — ตัวเดียวกันใช้วาดพรีวิวบนจอและไฟล์ส่งพิมพ์
 * (ต่างกันแค่ตัวคูณพิกเซลต่อมิลลิเมตร k) ภาพบนจอจึงตรงกับของที่ได้จริง
 * ⚠️ คูณ k เองทุกค่า ไม่ใช้ ctx.scale — ฟอนต์ขนาด 1–2 px ใต้ ctx.scale บางเบราว์เซอร์ปัดจนเพี้ยน
 */

import { THAI_HOLIDAYS } from "@/lib/ship-date";
import { bkkParts } from "@/lib/bangkok-time";
import type { Product } from "@/lib/products";

/** ฟอนต์ที่ให้เลือก — 3 ตัวแรกเว็บโหลดอยู่แล้ว (next/font) ที่เหลือโหลดจาก Google Fonts ตอนเปิดจอ */
export const CAL_FONTS: { key: string; name: string; css: string; google?: string }[] = [
  { key: "prompt", name: "Prompt", css: "var(--font-prompt)" },
  { key: "mitr", name: "Mitr", css: "var(--font-mitr)" },
  { key: "looped", name: "IBM Plex Looped", css: "var(--font-looped)" },
  { key: "kanit", name: "Kanit", css: "'Kanit'", google: "Kanit:wght@400;600;700" },
  { key: "sarabun", name: "Sarabun", css: "'Sarabun'", google: "Sarabun:wght@400;700" },
  { key: "montserrat", name: "Montserrat", css: "'Montserrat'", google: "Montserrat:wght@500;700" },
  { key: "itim", name: "Itim (ลายมือ)", css: "'Itim'", google: "Itim" },
  { key: "pattaya", name: "Pattaya", css: "'Pattaya'", google: "Pattaya" },
];

export type CalLang = "en" | "th";

export interface CalEvent {
  /** "MM-DD" — วันสำคัญซ้ำทุกปี (วันเกิด/ครบรอบ) จึงไม่ผูกปี */
  date: string;
  label: string;
  color: string;
}

/** ตั้งค่าหน้าตาปฏิทิน (ใช้กับทุกหน้าที่มีตาราง) */
export interface CalBack {
  year: number;
  title: string;
  lang: CalLang;
  /** 0 = เริ่มอาทิตย์ · 1 = เริ่มจันทร์ */
  weekStart: 0 | 1;
  font: string;
  ink: string;
  accent: string;
  bg: string;
  sundayOn: boolean;
  sundayColor: string;
  holidayOn: boolean;
  holidayColor: string;
  events: CalEvent[];
}

/** ข้อความทับรูปหน้าปก */
export interface CalText {
  value: string;
  font: string;
  color: string;
  /** ขอบตัวอักษร (ว่าง = ไม่มี) — ช่วยให้อ่านออกบนรูปที่สีพื้นวุ่น */
  stroke: string;
  /** ความสูงตัวอักษร (มม.) */
  sizeMm: number;
  /** จุดกึ่งกลางข้อความ นับจากมุมซ้ายบนของผืน (รวมตัดตก) (มม.) */
  xMm: number;
  yMm: number;
  bold: boolean;
}

/** ตำแหน่งรูป (จุดกึ่งกลาง + ขนาดที่วาง + มุมหมุน) นับจากมุมซ้ายบนของผืนรวมตัดตก (มม.) */
export interface CalPlacement {
  cxMm: number;
  cyMm: number;
  wMm: number;
  hMm: number;
  rotDeg: number;
}

/** รูปของหน้าหนึ่ง — src = ลำดับรูปในคลังรูปของแบบนี้ */
export interface CalPhoto {
  src: number;
  pl: CalPlacement;
}

/** สิ่งที่ลูกค้าวางเองในแบบนี้ (รูปรายหน้า + ข้อความหน้าปก + สีพื้น) */
export interface CalDesign {
  bg: string;
  text: CalText | null;
  /** key = page.key · หน้าที่ไม่มีรูปของตัวเอง = ใช้รูปหน้าปก (รูปแรก) วางเต็มช่องให้อัตโนมัติ */
  photos: Record<string, CalPhoto>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PageKind = "photo" | "year" | "photo-year" | "photo-month" | "month";

export interface CalPage {
  key: string;
  name: string;
  kind: PageKind;
  month?: number;
  /** ช่องรูป (มม. บนผืนรวมตัดตก) — ช่องที่ชิดขอบเผื่อตัดตกไปถึงขอบผืน */
  photo?: Rect;
  /** พื้นที่ตาราง (อยู่ในเขตปลอดภัย) */
  grid?: Rect;
  /** ให้ใส่ข้อความทับรูปได้ (เฉพาะหน้าปก) */
  text?: boolean;
  /** เส้นกรอบบาง ๆ รอบใบ (มม. บนผืนรวมตัดตก) — แบบโปสการ์ดรายปีของหน้าร้านเดิม */
  border?: Rect;
  /** หัวข้อปฏิทินตัวบาง "Calendar 2026" + ตัวย่อวันไม่หนา (แบบหน้าร้านเดิม) */
  light?: boolean;
}

export interface CalFormat {
  key: string;
  name: string;
  trimW: number;
  trimH: number;
  bleed: number;
  safe: number;
  /** ความละเอียดไฟล์ส่งพิมพ์ — ผืนผ้าใหญ่ใช้ 150 (300 DPI บนผืน 40×85 ซม. เกินเพดานแคนวาสของมือถือ) */
  dpi: number;
  pages: CalPage[];
  /** ใบสั้น ๆ ให้ทีมผลิต เช่น "8 แผ่น · หน้า 15-16 ว่าง" */
  note?: string;
}

export const fmtW = (f: CalFormat) => f.trimW + f.bleed * 2;
export const fmtH = (f: CalFormat) => f.trimH + f.bleed * 2;

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTHS_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS_EN_LONG = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function monthName(m: number, lang: CalLang): string {
  return (lang === "th" ? MONTHS_TH : MONTHS_EN)[m];
}

/* ─────────────────────────── รูปแบบงาน ─────────────────────────── */

const IN = 25.4;

function frame(trimW: number, trimH: number, bleed: number, safe: number) {
  const W = trimW + bleed * 2;
  const H = trimH + bleed * 2;
  const s = bleed + safe;
  return { W, H, s, full: { x: 0, y: 0, w: W, h: H }, inner: { x: s, y: s, w: W - s * 2, h: H - s * 2 } };
}

/** หน้า "รูปบน/ซ้าย + ตาราง" — รูปชิดขอบผืน 3 ด้าน ตารางอยู่ในเขตปลอดภัย */
function split(fr: ReturnType<typeof frame>, share: number, gap: number): { photo: Rect; grid: Rect } {
  if (fr.W > fr.H) {
    const pw = fr.W * share;
    return {
      photo: { x: 0, y: 0, w: pw, h: fr.H },
      grid: { x: pw + gap, y: fr.s, w: fr.W - pw - gap - fr.s, h: fr.H - fr.s * 2 },
    };
  }
  const ph = fr.H * share;
  return {
    photo: { x: 0, y: 0, w: fr.W, h: ph },
    grid: { x: fr.s, y: ph + gap, w: fr.W - fr.s * 2, h: fr.H - ph - gap - fr.s },
  };
}

const monthsPages = (fr: ReturnType<typeof frame>, mode: "combined" | "separate"): CalPage[] => {
  const out: CalPage[] = [];
  for (let m = 0; m < 12; m++) {
    const name = MONTHS_TH[m];
    if (mode === "combined") out.push({ key: `m${m + 1}`, name, kind: "photo-month", month: m, ...split(fr, 0.56, 3) });
    else {
      out.push({ key: `m${m + 1}p`, name: `${name} (รูป)`, kind: "photo", photo: fr.full });
      out.push({ key: `m${m + 1}`, name: `${name} (ตาราง)`, kind: "month", month: m, grid: fr.inner });
    }
  }
  return out;
};

/**
 * รูปแบบงานทั้งหมด — key ตั้งใน Product.calendarStudio.formats
 *   card (2 ด้าน) · card1 (1 ด้าน) · postcard-year1-{L|P} · postcard-year2-{L|P}
 *   postcard-month-{L|P} (1 ด้าน) · postcard-month2-{L|P} (2 ด้าน)
 *   desktop14-{L|P} (8 แผ่น) · desktop26-{L|P} (14 แผ่น) · canvas
 */
export function calFormat(key: string): CalFormat {
  const L = key.endsWith("-L");
  // ── โปสการ์ด 4×6 นิ้ว ──
  if (key.startsWith("postcard-")) {
    const [w, h] = L ? [6 * IN, 4 * IN] : [4 * IN, 6 * IN];
    const fr = frame(w, h, 2, 4);
    const ori = L ? "แนวนอน" : "แนวตั้ง";
    if (key.startsWith("postcard-year1")) {
      /**
       * แบบหน้าร้านเดิม (ผู้ใช้ส่งภาพ 12 ต.ค. 69): ขอบขาวรอบใบ + เส้นกรอบบาง · รูปไม่ชนขอบกระดาษ
       * แนวนอน = รูปซ้าย ~46% · แนวตั้ง = รูปบน ~46% · หัวข้อ "Calendar 2026" ตัวบาง
       */
      const b0 = 2; // ตัดตก
      const border = { x: b0 + 2, y: b0 + 2, w: w - 4, h: h - 4 };
      const m = 4.4; // ขอบขาวจากเส้นตัดถึงรูป/ตาราง
      const inner = { x: b0 + m, y: b0 + m, w: w - m * 2, h: h - m * 2 };
      const photo = L ? { ...inner, w: w * 0.457 } : { ...inner, h: h * 0.46 };
      const grid = L
        ? { x: photo.x + photo.w + 4, y: inner.y, w: inner.x + inner.w - (photo.x + photo.w + 4), h: inner.h }
        : { x: inner.x, y: photo.y + photo.h + 4, w: inner.w, h: inner.y + inner.h - (photo.y + photo.h + 4) };
      return {
        key, name: `โปสการ์ดปฏิทินรายปี 4×6" ${ori} · พิมพ์ 1 ด้าน`, trimW: w, trimH: h, bleed: 2, safe: 4, dpi: 300,
        pages: [{ key: "front", name: "หน้าเดียว", kind: "photo-year", text: true, photo, grid, border, light: true }],
      };
    }
    if (key.startsWith("postcard-year2"))
      return {
        key, name: `โปสการ์ดปฏิทินรายปี 4×6" ${ori} · พิมพ์ 2 ด้าน`, trimW: w, trimH: h, bleed: 2, safe: 4, dpi: 300,
        pages: [
          { key: "front", name: "ด้านหน้า (รูป)", kind: "photo", photo: fr.full, text: true },
          { key: "back", name: "ด้านหลัง (ปฏิทิน)", kind: "year", grid: fr.inner },
        ],
      };
    if (key.startsWith("postcard-month2"))
      // 2 ด้าน: ใบละ 2 หน้าเรียงคู่กัน (หน้าคี่ = ด้านหน้า · หน้าคู่ = ด้านหลังของใบเดียวกัน)
      return {
        key, name: `โปสการ์ดปฏิทินรายเดือน 4×6" ${ori} · 13 ใบ · พิมพ์ 2 ด้าน`, trimW: w, trimH: h, bleed: 2, safe: 4, dpi: 300,
        note: "13 ใบ 26 หน้า — หน้าคี่ = ด้านหน้า (รูป) · หน้าคู่ = ด้านหลังของใบเดียวกัน (ตาราง)",
        pages: [
          { key: "cover", name: "ปก (รูป)", kind: "photo", photo: fr.full, text: true },
          { key: "year", name: "หลังปก (ภาพรวมทั้งปี)", kind: "year", grid: fr.inner },
          ...monthsPages(fr, "separate"),
        ],
      };
    return {
      key, name: `โปสการ์ดปฏิทินรายเดือน 4×6" ${ori} · 13 ใบ · พิมพ์ 1 ด้าน`, trimW: w, trimH: h, bleed: 2, safe: 4, dpi: 300,
      pages: [{ key: "cover", name: "ปก", kind: "photo", photo: fr.full, text: true }, ...monthsPages(fr, "combined")],
    };
  }
  // ── ปฏิทินตั้งโต๊ะ 6×8 นิ้ว ──
  if (key.startsWith("desktop")) {
    const [w, h] = L ? [8 * IN, 6 * IN] : [6 * IN, 8 * IN];
    const fr = frame(w, h, 2, 5);
    const separate = key.startsWith("desktop26");
    const ori = L ? "แนวนอน" : "แนวตั้ง";
    return {
      key,
      name: `ปฏิทินตั้งโต๊ะ 6×8" ${ori} · ${separate ? "14 แผ่น (รูป/ตารางแยกหน้า)" : "8 แผ่น"}`,
      trimW: w, trimH: h, bleed: 2, safe: 5, dpi: 300,
      note: separate ? "14 แผ่น 28 หน้า — พิมพ์ 26 หน้า หลังปก/หลังแผ่นสุดท้ายว่าง" : "8 แผ่น 16 หน้า — พิมพ์ 14 หน้า หลังปก/หลังแผ่นสุดท้ายว่าง",
      pages: [
        { key: "cover", name: "ปก", kind: "photo", photo: fr.full, text: true },
        ...monthsPages(fr, separate ? "separate" : "combined"),
        { key: "year", name: "ภาพรวมทั้งปี", kind: "year", grid: fr.inner },
      ],
    };
  }
  // ── ปฏิทินผ้าแคนวาส 40×85 ซม. (แนวตั้ง แขวนผนัง) ──
  if (key === "canvas") {
    const fr = frame(400, 850, 10, 25);
    const top = 70; // เผื่อหัวผืนสำหรับไม้แขวน/หมุด
    const photo = { x: fr.s, y: top, w: fr.W - fr.s * 2, h: 360 };
    return {
      key, name: "ปฏิทินผ้าแคนวาส 40×85 ซม.", trimW: 400, trimH: 850, bleed: 10, safe: 25, dpi: 150,
      note: "หัวผืน 6 ซม. เว้นไว้สำหรับไม้แขวน",
      pages: [
        {
          key: "front", name: "ผืนปฏิทิน", kind: "photo-year", text: true, photo,
          grid: { x: fr.s, y: top + photo.h + 20, w: fr.W - fr.s * 2, h: fr.H - fr.s - (top + photo.h + 20) },
        },
      ],
    };
  }
  // ── โฟโต้การ์ด 5.5×8.5 ซม. (ค่าเริ่มต้น) — ตัดตกเท่าไฟล์เทมเพลต Photocard 300g (57.1×87.1) ──
  const fr = frame(55, 85, 1.05, 3);
  if (key === "card1")
    return {
      key, name: "ปฏิทินโฟโต้การ์ด 5.5×8.5 ซม. · พิมพ์ 1 ด้าน", trimW: 55, trimH: 85, bleed: 1.05, safe: 3, dpi: 300,
      pages: [{ key: "front", name: "หน้าเดียว (รูป + ปฏิทิน)", kind: "photo-year", text: true, ...split(fr, 0.5, 2) }],
    };
  return {
    key: "card", name: "ปฏิทินโฟโต้การ์ด 5.5×8.5 ซม. · พิมพ์ 2 ด้าน", trimW: 55, trimH: 85, bleed: 1.05, safe: 3, dpi: 300,
    pages: [
      { key: "front", name: "หน้าปก", kind: "photo", photo: fr.full, text: true },
      { key: "back", name: "ด้านหลัง (ปฏิทิน)", kind: "year", grid: fr.inner },
    ],
  };
}

/* ─────────────────────────── ค่าเริ่มต้น ─────────────────────────── */

/** หัวข้ออัตโนมัติตามภาษา — ไทยใช้ พ.ศ. */
export function defaultTitle(year: number, lang: CalLang, light = false): string {
  return lang === "th" ? `ปฏิทิน ${year + 543}` : light ? `Calendar ${year}` : `CALENDAR ${year}`;
}

/** หัวข้อนี้เป็นของอัตโนมัติไหม (ลูกค้ายังไม่ได้พิมพ์เอง) — นับทุกแบบตัวอักษร */
export function isAutoTitle(title: string, year: number, lang: CalLang): boolean {
  return title === defaultTitle(year, lang) || title === defaultTitle(year, lang, true);
}

export function defaultBack(year: number): CalBack {
  return {
    year,
    title: defaultTitle(year, "en"),
    lang: "en",
    weekStart: 0,
    font: "prompt",
    ink: "#1c1917",
    accent: "#1c1917",
    bg: "#ffffff",
    sundayOn: true,
    sundayColor: "#dc2626",
    holidayOn: true,
    holidayColor: "#dc2626",
    events: [],
  };
}

/** ข้อความหน้าปกเริ่มต้น — ปีตัวใหญ่ล่างช่องรูป ขอบเข้มอ่านออกบนทุกรูป */
export function defaultText(year: number, f: CalFormat): CalText {
  const p = f.pages.find((x) => x.text) ?? f.pages[0];
  const r = p.photo ?? { x: 0, y: 0, w: fmtW(f), h: fmtH(f) };
  const size = Math.max(4, Math.min(r.w, r.h) * 0.13);
  const s = f.bleed + f.safe;
  return {
    value: String(year),
    font: "prompt",
    color: "#ffffff",
    stroke: "#1c1917",
    sizeMm: size,
    xMm: r.x + r.w / 2,
    yMm: Math.min(r.y + r.h - s - size, fmtH(f) - s - size),
    bold: true,
  };
}

/** อ่านปีจากชื่อตัวเลือก ("ปี ค.ศ. 2026" / "2027" / "พ.ศ. 2570") — ไม่เจอ = ปีหน้า */
export function yearFromChoice(v: string | undefined): number {
  const m = /(\d{4})/.exec(v ?? "");
  if (m) {
    const n = Number(m[1]);
    return n > 2400 ? n - 543 : n;
  }
  return new Date().getFullYear() + 1;
}

/** จำนวนปีที่ให้เลือกในกลุ่ม "ปีปฏิทิน" (นับจากปีปัจจุบันตามเวลาไทย) */
export const CAL_YEAR_COUNT = 5;

/**
 * 🗓 กลุ่มปีปฏิทินเลื่อนเอง — ปีที่ผ่านไปแล้วหลุดออก ปีใหม่เติมท้ายให้ครบ CAL_YEAR_COUNT ปี
 * ทำตอนแสดงผล (ไม่แก้ข้อมูลในฐาน) · ตัวเลือกปีที่มีอยู่แล้วคงฟิลด์เดิมไว้ (desc/รูป ฯลฯ) · บังคับเป็นเมนูเลือก (dropdown)
 * ไม่มีอะไรเปลี่ยน = คืนก้อนเดิม (ไม่ให้ useMemo ปลายทางคิดใหม่)
 */
export function rollCalendarYears(p: Product, now: Date = new Date()): Product {
  const label = p.calendarStudio?.yearLabel;
  const idx = label ? p.options.findIndex((o) => o.label === label) : -1;
  if (idx < 0) return p;
  const opt = p.options[idx];
  const start = bkkParts(now).y;
  const choices = Array.from({ length: CAL_YEAR_COUNT }, (_, i) => {
    const y = start + i;
    return opt.choices.find((c) => /\d{4}/.test(c.name) && yearFromChoice(c.name) === y) ?? { name: `ปี ค.ศ. ${y} (พ.ศ. ${y + 543})` };
  });
  const same =
    opt.display === "dropdown" &&
    choices.length === opt.choices.length &&
    choices.every((c, i) => c === opt.choices[i]);
  if (same) return p;
  const options = p.options.slice();
  options[idx] = { ...opt, display: "dropdown", choices };
  return { ...p, options };
}

/** แถวของเดือน — แต่ละแถว 7 ช่อง (0 = ช่องว่าง) */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): number[][] {
  const first = new Date(year, month, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: number[] = [...Array(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  const rows: number[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const TH_MONTH_ABBR: Record<string, number> = Object.fromEntries(MONTHS_TH_SHORT.map((m, i) => [m, i + 1]));

/**
 * วันหยุดนักขัตฤกษ์ของปี → { "MM-DD": ชื่อ }
 * ใช้ตารางวันหยุดราชการชุดเดียวกับระบบวันส่งของ (THAI_HOLIDAYS) + กางวันจริงที่ซ่อนอยู่ในวันชดเชย
 * ("ชดเชยวันวิสาขบูชา (31 พ.ค.)" → 31 พ.ค. ก็แดงด้วย เหมือนปฏิทินที่ขายทั่วไป)
 */
export function holidaysOf(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ymd, name] of Object.entries(THAI_HOLIDAYS)) {
    if (!ymd.startsWith(`${year}-`)) continue;
    out[ymd.slice(5)] = name;
    const m = /\((\d{1,2})\s*([ก-๙.]+)\)/.exec(name);
    const mo = m ? TH_MONTH_ABBR[m[2]] : undefined;
    if (m && mo) {
      const key = `${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      out[key] ??= name.replace(/^ชดเชย/, "").replace(/\s*\(.*\)$/, "");
    }
  }
  return out;
}

/** ตารางวันหยุดมีปีนี้ไหม — ไม่มี = ปิดสวิตช์วันหยุดพร้อมบอกลูกค้า (กันพิมพ์ปฏิทินที่วันหยุดหายเงียบ ๆ) */
export function hasHolidayData(year: number): boolean {
  return Object.keys(THAI_HOLIDAYS).some((k) => k.startsWith(`${year}-`));
}

/* ─────────────────────────── ฟอนต์ ─────────────────────────── */

/** ชื่อฟอนต์สำหรับ ctx.font — อ่านชื่อจริงที่ next/font ตั้งไว้ผ่านตัวแปร CSS */
export function fontFamilyOf(key: string): string {
  const f = CAL_FONTS.find((x) => x.key === key) ?? CAL_FONTS[0];
  if (f.css.startsWith("var(")) {
    const name = f.css.slice(4, -1);
    const v = typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue(name).trim() : "";
    return v || "sans-serif";
  }
  return `${f.css}, sans-serif`;
}

/** โหลดฟอนต์ Google ที่ยังไม่มี (ครั้งเดียวต่อหน้า) — แคนวาสวาดด้วยฟอนต์สำรองถ้ายังโหลดไม่เสร็จ */
let googleLinked = false;
export function linkGoogleFonts(): void {
  if (googleLinked || typeof document === "undefined") return;
  googleLinked = true;
  const fams = CAL_FONTS.filter((f) => f.google).map((f) => `family=${f.google!.replace(/ /g, "+")}`);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
  document.head.appendChild(link);
}

/** รอให้ฟอนต์ที่จะใช้พร้อมก่อนวาดไฟล์จริง (กันไฟล์ส่งพิมพ์ออกมาเป็นฟอนต์สำรอง) */
export async function ensureFonts(keys: string[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [...new Set(keys)].flatMap((k) => {
      const fam = fontFamilyOf(k);
      return ["400", "700"].map((w) => document.fonts.load(`${w} 20px ${fam}`, "ปฏิทิน2026").catch(() => []));
    }),
  );
}

/* ─────────────────────────── วาด ─────────────────────────── */

/** กรอบของข้อความหน้าปก (มม.) — ใช้จับลากและวาดกรอบเลือก */
export function textBox(ctx: CanvasRenderingContext2D, t: CalText): Rect {
  // วัดที่ขนาดใหญ่แล้วหารกลับ — ฟอนต์ขนาด 1–7 px วัดตรง ๆ ได้ค่าปัดเศษเพี้ยน
  ctx.save();
  ctx.font = `${t.bold ? 700 : 400} ${t.sizeMm * 20}px ${fontFamilyOf(t.font)}`;
  const lines = t.value.split("\n");
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width / 20), t.sizeMm);
  ctx.restore();
  const h = lines.length * t.sizeMm * 1.25;
  return { x: t.xMm - w / 2, y: t.yMm - h / 2, w, h };
}

/** รูปวางเต็มช่อง (คลุมทั้งช่อง ไม่เหลือขอบ) */
export function coverPlacement(r: Rect, img: { w: number; h: number }): CalPlacement {
  const s = Math.max(r.w / img.w, r.h / img.h);
  return { cxMm: r.x + r.w / 2, cyMm: r.y + r.h / 2, wMm: img.w * s, hMm: img.h * s, rotDeg: 0 };
}

/** รูปคลุมช่องเต็มไหม (คิดการหมุนด้วย) */
export function placementCovers(pl: CalPlacement, r: Rect): boolean {
  const a = (-pl.rotDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ].every(([x, y]) => {
    const dx = x - pl.cxMm;
    const dy = y - pl.cyMm;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= pl.wMm / 2 + 0.01 && Math.abs(ly) <= pl.hMm / 2 + 0.01;
  });
}

export interface ImgRef {
  el: CanvasImageSource;
  w: number;
  h: number;
}

/** รูปที่จะวาดลงหน้านี้ — มีของตัวเองใช้ของตัวเอง ไม่มี = ใช้รูปหน้าปก (รูปแรก) เต็มช่อง */
export function photoOf(page: CalPage, d: CalDesign, imgs: (ImgRef | null)[]): { img: ImgRef; pl: CalPlacement } | null {
  if (!page.photo) return null;
  const own = d.photos[page.key];
  if (own && imgs[own.src]) return { img: imgs[own.src]!, pl: own.pl };
  const first = imgs.findIndex(Boolean);
  if (first < 0) return null;
  return { img: imgs[first]!, pl: coverPlacement(page.photo, imgs[first]!) };
}

function drawText(ctx: CanvasRenderingContext2D, k: number, t: CalText) {
  if (!t.value.trim()) return;
  ctx.font = `${t.bold ? 700 : 400} ${t.sizeMm * k}px ${fontFamilyOf(t.font)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = t.value.split("\n");
  const lh = t.sizeMm * 1.25;
  const top = t.yMm - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((line, i) => {
    const y = (top + i * lh) * k;
    if (t.stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(0.25, t.sizeMm * 0.16) * k;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(line, t.xMm * k, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, t.xMm * k, y);
  });
}

interface GridCtx {
  ctx: CanvasRenderingContext2D;
  k: number;
  b: CalBack;
  fam: string;
  hol: Record<string, string>;
  ev: Map<string, CalEvent>;
  order: number[];
  /** แบบหน้าร้านเดิม (Printbox): ตัวเลขน้ำหนักกลาง วันหยุดไม่หนา */
  light?: boolean;
}

/** ตัวเลขวันในช่อง — วงกลมวันสำคัญ / สีวันหยุด / สีวันอาทิตย์ */
function dayNum(g: GridCtx, m: number, d: number, col: number, x: number, y: number, size: number, r: number, labelW = 0) {
  const { ctx, k, b } = g;
  const key = `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const e = g.ev.get(key);
  let color = b.ink;
  if (b.sundayOn && g.order[col] === 0) color = b.sundayColor;
  if (g.hol[key]) color = b.holidayColor;
  if (e) {
    ctx.beginPath();
    ctx.arc(x * k, y * k, r * k, 0, Math.PI * 2);
    ctx.fillStyle = e.color;
    ctx.fill();
    color = "#ffffff";
  }
  ctx.fillStyle = color;
  ctx.font = `${g.light ? (e ? 600 : 500) : e || g.hol[key] ? 700 : 400} ${size * k}px ${g.fam}`;
  ctx.fillText(String(d), x * k, (y + size * 0.04) * k);
  // หน้าเดือนเดี่ยวมีที่พอ — เขียนชื่อวันสำคัญ/วันหยุดเล็ก ๆ ใต้ตัวเลข
  // ย่อฟอนต์ให้พอดีช่อง (ไม่ต่ำกว่า 70%) แล้วค่อยตัดท้าย — ไม่ให้ล้นไปทับวันข้าง ๆ
  if (labelW > 0) {
    const name = (e?.label || g.hol[key] || "").replace(/\s*\(.*\)$/, "");
    if (name) {
      let s = size * 0.36;
      ctx.font = `400 ${s * k}px ${g.fam}`;
      const w = ctx.measureText(name).width / k;
      if (w > labelW) s = Math.max(s * 0.7, (s * labelW) / w);
      ctx.font = `400 ${s * k}px ${g.fam}`;
      let txt = name;
      while (txt.length > 1 && ctx.measureText(txt).width / k > labelW) txt = txt.slice(0, -1);
      if (txt !== name) txt = `${txt.slice(0, -1)}…`;
      ctx.fillStyle = e ? e.color : b.holidayColor;
      ctx.fillText(txt, x * k, (y + r + s * 0.9) * k);
    }
  }
}

function gridCtx(ctx: CanvasRenderingContext2D, k: number, b: CalBack): GridCtx {
  return {
    ctx,
    k,
    b,
    fam: fontFamilyOf(b.font),
    hol: b.holidayOn ? holidaysOf(b.year) : {},
    ev: new Map(b.events.map((e) => [e.date, e])),
    order: Array.from({ length: 7 }, (_, i) => (i + b.weekStart) % 7),
  };
}

/** เดือนเล็ก (ในตารางทั้งปี) */
function miniMonth(g: GridCtx, m: number, cx: number, cy: number, cellW: number, cellH: number, light = false) {
  const { ctx, k, b } = g;
  /**
   * แบบหน้าร้านเดิม (วัดจากภาพ Printbox ที่ผู้ใช้ส่ง 12 ต.ค. 69): ชื่อเดือน 16.5% · แถวตัวย่อวัน 14% · 6 แถววันที่
   * ตัวย่อวันขนาดใกล้ตัวเลข (ไม่หนา) · ตัวเลข ≈90% ความสูงแถว · ชื่อเดือนหนากลาง
   */
  const nameH = cellH * (light ? 0.165 : 0.16);
  const wkH = cellH * (light ? 0.143 : 0.115);
  const rowH = (cellH - nameH - wkH) / 6;
  const colW = cellW / 7;
  const numSize = light ? Math.min(rowH * 0.9, colW * 0.66) : Math.min(rowH * 0.72, colW * 0.62);
  const nameSize = light
    ? Math.min(rowH * (b.lang === "th" ? 0.95 : 1.02), cellW * 0.16)
    : Math.min(nameH * (b.lang === "th" ? 0.67 : 0.63), cellW * 0.13);
  const wkSize = light
    ? Math.min(rowH * (b.lang === "th" ? 0.72 : 0.8), colW * 0.62)
    : Math.min(wkH * (b.lang === "th" ? 0.55 : 0.6), colW * 0.6);
  ctx.fillStyle = b.accent;
  ctx.font = `${light ? 600 : 700} ${nameSize * k}px ${g.fam}`;
  ctx.fillText(monthName(m, b.lang), (cx + cellW / 2) * k, (cy + nameH / 2) * k);
  ctx.font = `${light ? 500 : 700} ${wkSize * k}px ${g.fam}`;
  const days = b.lang === "th" ? DAYS_TH : DAYS_EN;
  g.order.forEach((wd, i) => {
    ctx.fillStyle = b.sundayOn && wd === 0 ? b.sundayColor : b.ink;
    ctx.fillText(days[wd], (cx + colW * (i + 0.5)) * k, (cy + nameH + wkH / 2) * k);
  });
  monthGrid(b.year, m, b.weekStart).forEach((row, r) =>
    row.forEach((d, i) => {
      if (!d) return;
      dayNum(g, m, d, i, cx + colW * (i + 0.5), cy + nameH + wkH + rowH * (r + 0.5), numSize, Math.min(colW, rowH) * 0.5);
    }),
  );
}

/** ตารางทั้งปี: หัวข้อ + 12 เดือน — เลือก 3×4 / 4×3 / 6×2 ตามสัดส่วนพื้นที่ */
function drawYear(ctx: CanvasRenderingContext2D, k: number, b: CalBack, r: Rect, light = false) {
  const g = { ...gridCtx(ctx, k, b), light };
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // แบบตัวบาง: หัวข้อใหญ่กว่า (≈14% ของพื้นที่) ตามหน้าร้านเดิม
  const titleH = b.title.trim() ? Math.min(r.h * (light ? 0.13 : 0.108), r.w * 0.17) : 0;
  if (titleH) {
    const wt = light ? 400 : 700;
    let size = titleH * (light ? 0.68 : 0.61);
    ctx.font = `${wt} ${size * k}px ${g.fam}`;
    const w = ctx.measureText(b.title).width / k;
    if (w > r.w * 0.95) size *= (r.w * 0.95) / w;
    ctx.font = `${wt} ${size * k}px ${g.fam}`;
    ctx.fillStyle = b.accent;
    ctx.fillText(b.title, (r.x + r.w / 2) * k, (r.y + titleH / 2 - titleH * 0.05) * k);
  }
  const aspect = r.w / (r.h - titleH);
  const [cols, rows] = aspect > 2.2 ? [6, 2] : aspect > 1.05 ? [4, 3] : [3, 4];
  const cellW0 = r.w / cols;
  const gapX = cellW0 * (light ? 0.125 : 0.13);
  const cellW = (r.w - gapX * (cols - 1)) / cols;
  const cellH0 = (r.h - titleH) / rows;
  const gapY = cellH0 * 0.09;
  const cellH = (r.h - titleH - gapY * (rows - 1)) / rows;
  for (let m = 0; m < 12; m++)
    miniMonth(g, m, r.x + (m % cols) * (cellW + gapX), r.y + titleH + Math.floor(m / cols) * (cellH + gapY), cellW, cellH, light);
}

/** ตารางเดือนเดียว (หน้ารายเดือน) */
function drawMonth(ctx: CanvasRenderingContext2D, k: number, b: CalBack, r: Rect, m: number) {
  const g = gridCtx(ctx, k, b);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const headH = Math.min(r.h * 0.2, r.w * 0.12);
  const yearTxt = b.lang === "th" ? String(b.year + 543) : String(b.year);
  const head = `${b.lang === "th" ? monthName(m, "th") : monthName(m, "en").toUpperCase()} ${yearTxt}`;
  let size = headH * 0.58;
  ctx.font = `700 ${size * k}px ${g.fam}`;
  const w = ctx.measureText(head).width / k;
  if (w > r.w) size *= r.w / w;
  ctx.font = `700 ${size * k}px ${g.fam}`;
  ctx.fillStyle = b.accent;
  ctx.fillText(head, (r.x + r.w / 2) * k, (r.y + headH / 2) * k);

  const grid = monthGrid(b.year, m, b.weekStart);
  const wkH = Math.min((r.h - headH) * 0.12, r.w * 0.05);
  const rowH = (r.h - headH - wkH) / 6;
  const colW = r.w / 7;
  const days = b.lang === "th" ? DAYS_TH : DAYS_EN_LONG;
  ctx.font = `700 ${Math.min(wkH * 0.55, colW * 0.3) * k}px ${g.fam}`;
  g.order.forEach((wd, i) => {
    ctx.fillStyle = b.sundayOn && wd === 0 ? b.sundayColor : b.ink;
    ctx.fillText(days[wd], (r.x + colW * (i + 0.5)) * k, (r.y + headH + wkH / 2) * k);
  });
  const numSize = Math.min(rowH * 0.5, colW * 0.42);
  const showLabel = rowH > 7;
  grid.forEach((row, ri) =>
    row.forEach((d, i) => {
      if (!d) return;
      const cy = r.y + headH + wkH + rowH * (ri + (showLabel ? 0.4 : 0.5));
      dayNum(g, m, d, i, r.x + colW * (i + 0.5), cy, numSize, Math.min(colW, rowH) * 0.36, showLabel ? colW * 0.94 : 0);
    }),
  );
}

/**
 * 🖨 วาดหน้าหนึ่งของปฏิทินทั้งผืน (รวมตัดตก) · k = พิกเซลต่อมิลลิเมตร
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  k: number,
  f: CalFormat,
  page: CalPage,
  d: CalDesign,
  b: CalBack,
  imgs: (ImgRef | null)[],
): void {
  const W = fmtW(f);
  const H = fmtH(f);
  ctx.save();
  // พื้น: หน้าที่มีรูปใช้สีพื้นหน้าปก · หน้าตารางล้วนใช้สีพื้นปฏิทิน
  ctx.fillStyle = (page.kind === "photo" ? d.bg : b.bg) || "#ffffff";
  ctx.fillRect(0, 0, W * k, H * k);
  if (page.photo) {
    const ph = photoOf(page, d, imgs);
    const r = page.photo;
    if (page.kind !== "photo") {
      ctx.fillStyle = d.bg || "#ffffff";
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
    if (ph) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x * k, r.y * k, r.w * k, r.h * k);
      ctx.clip();
      ctx.translate(ph.pl.cxMm * k, ph.pl.cyMm * k);
      ctx.rotate((ph.pl.rotDeg * Math.PI) / 180);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(ph.img.el, (-ph.pl.wMm / 2) * k, (-ph.pl.hMm / 2) * k, ph.pl.wMm * k, ph.pl.hMm * k);
      ctx.restore();
    }
  }
  if (page.grid) {
    if (page.kind === "year" || page.kind === "photo-year") drawYear(ctx, k, b, page.grid, page.light);
    else if (page.month != null) drawMonth(ctx, k, b, page.grid, page.month);
  }
  if (page.border) {
    const r = page.border;
    ctx.strokeStyle = b.ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 0.3 * k;
    ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
    ctx.globalAlpha = 1;
  }
  if (page.text && d.text) drawText(ctx, k, d.text);
  ctx.restore();
}

/** สรุปตั้งค่าเป็นข้อความเดียว — ติดไปกับออเดอร์ให้ทีมผลิตตรวจ/ทำไฟล์ซ้ำได้ */
export function backSpec(b: CalBack): string {
  const parts = [
    `ปี ${b.year}`,
    b.lang === "th" ? "ภาษาไทย" : "ภาษาอังกฤษ",
    b.weekStart ? "เริ่มวันจันทร์" : "เริ่มวันอาทิตย์",
    `หัวข้อ "${b.title}"`,
    `ฟอนต์ ${(CAL_FONTS.find((f) => f.key === b.font) ?? CAL_FONTS[0]).name}`,
    b.holidayOn ? `วันหยุดไทย ${b.holidayColor}` : "ไม่ไฮไลต์วันหยุด",
    b.sundayOn ? `วันอาทิตย์ ${b.sundayColor}` : "",
  ];
  if (b.events.length)
    parts.push(
      "วันสำคัญ: " +
        b.events
          .map((e) => {
            const [mm, dd] = e.date.split("-").map(Number);
            return `${dd} ${MONTHS_TH_SHORT[mm - 1]}${e.label ? ` ${e.label}` : ""}`;
          })
          .join(", "),
    );
  return parts.filter(Boolean).join(" · ");
}

/** ประกอบไฟล์ส่งพิมพ์ของหน้าหนึ่ง (ทั้งผืนรวมตัดตก ตาม DPI ของรูปแบบ) */
export async function renderPage(
  f: CalFormat,
  draw: (ctx: CanvasRenderingContext2D, k: number) => void,
  type: "image/png" | "image/jpeg",
  name: string,
): Promise<File | null> {
  const k = f.dpi / 25.4;
  const cv = document.createElement("canvas");
  cv.width = Math.round(fmtW(f) * k);
  cv.height = Math.round(fmtH(f) * k);
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  draw(ctx, cv.width / fmtW(f));
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, type, 0.93));
  cv.width = cv.height = 0; // คืนหน่วยความจำทันที (มือถือ — หลายหน้าติดกัน)
  return blob ? new File([blob], name, { type }) : null;
}

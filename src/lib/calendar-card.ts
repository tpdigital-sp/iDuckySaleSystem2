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

/**
 * ฟอนต์ที่ให้เลือก — 3 ตัวแรกเว็บโหลดอยู่แล้ว (next/font) ที่เหลือโหลดจาก Google Fonts ตอนเปิดจอ
 * group = หมวดในรายการเลือก (optgroup) · เพิ่มเป็น 45 ตัว 13 ต.ค. 69 (ผู้ใช้ขอ "เพิ่มฟอนต์ให้เลือกเยอะกว่านี้") — ทุกตัวเช็ค Google Fonts ตอบ 200 แล้ว
 * ⚠️ ห้ามเปลี่ยน key ของตัวเดิม (แบบที่บันทึกไว้อ้างด้วย key)
 */
export const CAL_FONTS: { key: string; name: string; css: string; google?: string; group: string }[] = [
  { key: "prompt", name: "Prompt", css: "var(--font-prompt)", group: "ไทย · ทันสมัย" },
  { key: "mitr", name: "Mitr", css: "var(--font-mitr)", group: "ไทย · ทันสมัย" },
  { key: "looped", name: "IBM Plex Looped", css: "var(--font-looped)", group: "ไทย · ทันสมัย" },
  { key: "kanit", name: "Kanit", css: "'Kanit'", google: "Kanit:wght@400;600;700", group: "ไทย · ทันสมัย" },
  { key: "sarabun", name: "Sarabun", css: "'Sarabun'", google: "Sarabun:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "notosansthai", name: "Noto Sans Thai", css: "'Noto Sans Thai'", google: "Noto+Sans+Thai:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "anuphan", name: "Anuphan", css: "'Anuphan'", google: "Anuphan:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "plexthai", name: "IBM Plex Sans Thai", css: "'IBM Plex Sans Thai'", google: "IBM+Plex+Sans+Thai:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "baijamjuree", name: "Bai Jamjuree", css: "'Bai Jamjuree'", google: "Bai+Jamjuree:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "chakrapetch", name: "Chakra Petch", css: "'Chakra Petch'", google: "Chakra+Petch:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "k2d", name: "K2D", css: "'K2D'", google: "K2D:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "krub", name: "Krub", css: "'Krub'", google: "Krub:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "niramit", name: "Niramit", css: "'Niramit'", google: "Niramit:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "athiti", name: "Athiti", css: "'Athiti'", google: "Athiti:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "fahkwang", name: "Fahkwang", css: "'Fahkwang'", google: "Fahkwang:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "thasadith", name: "Thasadith", css: "'Thasadith'", google: "Thasadith:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "notolooped", name: "Noto Sans Thai Looped", css: "'Noto Sans Thai Looped'", google: "Noto+Sans+Thai+Looped:wght@400;700", group: "ไทย · ทันสมัย" },
  { key: "taviraj", name: "Taviraj", css: "'Taviraj'", google: "Taviraj:wght@400;700", group: "ไทย · มีหัว/ทางการ" },
  { key: "trirong", name: "Trirong", css: "'Trirong'", google: "Trirong:wght@400;700", group: "ไทย · มีหัว/ทางการ" },
  { key: "pridi", name: "Pridi", css: "'Pridi'", google: "Pridi:wght@400;700", group: "ไทย · มีหัว/ทางการ" },
  { key: "notoserifthai", name: "Noto Serif Thai", css: "'Noto Serif Thai'", google: "Noto+Serif+Thai:wght@400;700", group: "ไทย · มีหัว/ทางการ" },
  { key: "itim", name: "Itim (ลายมือ)", css: "'Itim (ลายมือ)'", google: "Itim", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "mali", name: "Mali", css: "'Mali'", google: "Mali:wght@400;700", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "sriracha", name: "Sriracha", css: "'Sriracha'", google: "Sriracha", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "kodchasan", name: "Kodchasan", css: "'Kodchasan'", google: "Kodchasan:wght@400;700", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "charm", name: "Charm", css: "'Charm'", google: "Charm:wght@400;700", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "charmonman", name: "Charmonman", css: "'Charmonman'", google: "Charmonman:wght@400;700", group: "ไทย · ลายมือ/น่ารัก" },
  { key: "pattaya", name: "Pattaya", css: "'Pattaya'", google: "Pattaya", group: "ไทย · ตัวเด่น" },
  { key: "chonburi", name: "Chonburi", css: "'Chonburi'", google: "Chonburi", group: "ไทย · ตัวเด่น" },
  { key: "srisakdi", name: "Srisakdi", css: "'Srisakdi'", google: "Srisakdi:wght@400;700", group: "ไทย · ตัวเด่น" },
  { key: "montserrat", name: "Montserrat", css: "'Montserrat'", google: "Montserrat:wght@400;500;600;700", group: "อังกฤษ" },
  { key: "poppins", name: "Poppins", css: "'Poppins'", google: "Poppins:wght@400;700", group: "อังกฤษ" },
  { key: "nunito", name: "Nunito", css: "'Nunito'", google: "Nunito:wght@400;700", group: "อังกฤษ" },
  { key: "quicksand", name: "Quicksand", css: "'Quicksand'", google: "Quicksand:wght@400;700", group: "อังกฤษ" },
  { key: "raleway", name: "Raleway", css: "'Raleway'", google: "Raleway:wght@400;700", group: "อังกฤษ" },
  { key: "oswald", name: "Oswald", css: "'Oswald'", google: "Oswald:wght@400;700", group: "อังกฤษ" },
  { key: "bebas", name: "Bebas Neue", css: "'Bebas Neue'", google: "Bebas+Neue", group: "อังกฤษ" },
  { key: "fredoka", name: "Fredoka", css: "'Fredoka'", google: "Fredoka:wght@400;700", group: "อังกฤษ" },
  { key: "comfortaa", name: "Comfortaa", css: "'Comfortaa'", google: "Comfortaa:wght@400;700", group: "อังกฤษ" },
  { key: "playfair", name: "Playfair Display", css: "'Playfair Display'", google: "Playfair+Display:wght@400;700", group: "อังกฤษ" },
  { key: "lora", name: "Lora", css: "'Lora'", google: "Lora:wght@400;700", group: "อังกฤษ" },
  { key: "dancing", name: "Dancing Script", css: "'Dancing Script'", google: "Dancing+Script:wght@400;700", group: "อังกฤษ · ลายมือ" },
  { key: "pacifico", name: "Pacifico", css: "'Pacifico'", google: "Pacifico", group: "อังกฤษ · ลายมือ" },
  { key: "greatvibes", name: "Great Vibes", css: "'Great Vibes'", google: "Great+Vibes", group: "อังกฤษ · ลายมือ" },
  { key: "caveat", name: "Caveat", css: "'Caveat'", google: "Caveat:wght@400;700", group: "อังกฤษ · ลายมือ" },
  { key: "lobster", name: "Lobster", css: "'Lobster'", google: "Lobster", group: "อังกฤษ · ลายมือ" },
  { key: "satisfy", name: "Satisfy", css: "'Satisfy'", google: "Satisfy", group: "อังกฤษ · ลายมือ" },
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
  /** ตัวอักษรแยกส่วน (หน้าต่าง Calendar settings แบบ Printbox) — ไม่ตั้ง = ค่าเดิมของแบบ */
  parts?: Partial<Record<CalPartKey, CalPart>>;
}

/** ส่วนของตารางปฏิทินที่ปรับตัวอักษรแยกได้: ชื่อเดือน · หัวข้อปี · ชื่อวัน · ตัวเลขวันที่ */
export type CalPartKey = "month" | "title" | "week" | "day";
export interface CalPart {
  /** ว่าง = ใช้ฟอนต์ปฏิทิน (b.font) */
  font?: string;
  /** ว่าง = น้ำหนักเดิมของแบบ */
  bold?: boolean;
  italic?: boolean;
  /** ตัวคูณขนาดจากขนาดอัตโนมัติ (1 = เดิม) */
  scale?: number;
  align?: "left" | "center" | "right";
  /** ว่าง = สีเดิม (ชื่อเดือน/หัวข้อ = accent · ชื่อวัน/ตัวเลข = ink) */
  color?: string;
}
export const CAL_PART_KEYS: CalPartKey[] = ["month", "title", "week", "day"];

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
  italic?: boolean;
  underline?: boolean;
  /** จัดชิดของบรรทัดในกล่อง (หลายบรรทัด) — ค่าเดิม = กึ่งกลาง */
  align?: "left" | "center" | "right";
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
  /** แต่งรูปช่องหลักแบบ Printbox (13 ต.ค. 69) — กลับด้าน · ความทึบ · ขอบ · มุมมน · เอฟเฟกต์ */
  flipX?: boolean;
  opacity?: number;
  stroke?: string;
  strokeW?: number;
  /** ความทึบของเส้นขอบ 0–1 (แถบขอบแบบ Printbox) */
  strokeA?: number;
  radius?: number;
  filter?: string;
  /** ปรับแสง/คอนทราสต์/ความอิ่มสี เป็น % (100 = เดิม) — แผงเอฟเฟกต์แบบ Printbox */
  bright?: number;
  contrast?: number;
  sat?: number;
}

/** ✨ เอฟเฟกต์รูป (ปุ่มไม้กายสิทธิ์) — key เก็บในแบบ · css = canvas filter (ไฟล์พิมพ์ใช้ตัวเดียวกัน) */
export const CAL_FILTERS: { key: string; name: string; css: string }[] = [
  { key: "", name: "ปกติ", css: "none" },
  { key: "bw", name: "ขาวดำ", css: "grayscale(1)" },
  { key: "sepia", name: "ซีเปีย", css: "sepia(0.85)" },
  { key: "vivid", name: "สดใส", css: "saturate(1.5) contrast(1.08)" },
  { key: "soft", name: "ละมุน", css: "saturate(0.8) brightness(1.06) contrast(0.92)" },
  { key: "vintage", name: "วินเทจ", css: "sepia(0.35) saturate(0.85) contrast(1.05) brightness(1.03)" },
  { key: "cool", name: "โทนเย็น", css: "hue-rotate(-12deg) saturate(1.1)" },
];
export const filterCss = (key?: string) => CAL_FILTERS.find((f) => f.key === (key ?? ""))?.css ?? "none";
/** ฟิลเตอร์รวมของรูป (เอฟเฟกต์สำเร็จรูป + ปรับแสง/คอนทราสต์/อิ่มสี) — "none" = ไม่ต้องตั้ง ctx.filter */
export function photoFilterCss(st?: { filter?: string; bright?: number; contrast?: number; sat?: number }): string {
  if (!st) return "none";
  const parts = [st.filter ? filterCss(st.filter) : "none"].filter((x) => x !== "none");
  if (st.bright != null && st.bright !== 100) parts.push(`brightness(${st.bright}%)`);
  if (st.contrast != null && st.contrast !== 100) parts.push(`contrast(${st.contrast}%)`);
  if (st.sat != null && st.sat !== 100) parts.push(`saturate(${st.sat}%)`);
  return parts.length ? parts.join(" ") : "none";
}

/** สิ่งที่ลูกค้าวางเองในแบบนี้ (รูปรายหน้า + ข้อความหน้าปก + สีพื้น) */
export interface CalDesign {
  bg: string;
  /** ข้อความหน้าปกแบบเก่า (กล่องเดียว) — จอใหม่แปลงเป็น elements ตอนเปิด · ยังวาดให้เพื่อแบบ/สคริปต์เดิม */
  text: CalText | null;
  /** key = page.key · หน้าที่ไม่มีรูปของตัวเอง = ใช้รูปหน้าปก (รูปแรก) วางเต็มช่องให้อัตโนมัติ */
  photos: Record<string, CalPhoto>;
  /** ✏️ ชิ้นส่วนที่ลูกค้าวางเอง (ข้อความหลายกล่อง · สี่เหลี่ยม · วงรี) ทุกหน้า — วาดทับบนสุด เรียงตามลำดับ */
  elements?: CalElement[];
  /** 🔁 เลย์เอาต์ที่เลือกต่อหน้า (key = page.key · ไม่มี = ตามรูปแบบงาน) — ดู layoutsOf */
  layouts?: Record<string, string>;
  /**
   * 🗂 ลำดับชั้นของหน้า (ล่าง → บน · key = หน้า) — "@slot" = รูปช่องหลัก · "@grid" = ตารางปฏิทิน · ที่เหลือ = id ชิ้นส่วน
   * ไม่มี/ไม่ครบ = ค่าเริ่มต้น (รูปหลัก → ปฏิทิน → ชิ้นส่วนตามลำดับที่เพิ่ม) — ดู orderOf (13 ต.ค. 69)
   */
  order?: Record<string, string[]>;
  /** 🖼 ขนาด/ตำแหน่งช่องรูปหลักที่ลูกค้าลากจุดจับปรับเอง (มม. · key = หน้า) — ไม่มี = ตามเลย์เอาต์ (13 ต.ค. 69) */
  slots?: Record<string, Rect>;
  /** 📅 ตำแหน่ง/ขนาดตารางปฏิทินที่ลูกค้าลากปรับเอง (มม. · key = หน้า) — ไม่มี = ตามเลย์เอาต์ (13 ต.ค. 69) */
  grids?: Record<string, Rect>;
  /** 🃏 ใบที่แยกออกแบบเอง (ลำดับ 1.. ของ CalFormat.cards) — ข้อมูลอยู่ใต้ key "c{i}:page" · ใบที่ไม่อยู่ในนี้ = เหมือนใบแรก */
  custom?: number[];
  /** 🎨 รูปแบบการพิมพ์ "คละลาย" (ชุดหลายใบ) — ทุกใบออกแบบแยกได้ · ไม่ตั้ง = ลายเดียว (ทุกใบเหมือนใบแรก) */
  mix?: boolean;
  /**
   * 🚫 หน้าที่ยังไม่ได้ใส่รูป = ว่าง ไม่ยืมรูปหน้าปก — งานหลายหน้า (ปฏิทินรายเดือน/ตั้งโต๊ะ) ที่เปิดแบบใหม่ตั้งแต่ 13 ต.ค. 69
   * (ผู้ใช้แจ้งบั๊ค "ลากภาพใส่หน้าปก ระบบใส่ภาพให้ทุกหน้าเอง") · แบบเก่าที่ไม่มีธงนี้ยังยืมรูปปกเหมือนเดิม
   */
  noBorrow?: boolean;
  /** 📮 หน้าด้านหลังที่ลูกค้าลบลายโปสการ์ดออก (key หน้า) — ไม่อยู่ในนี้ = มีลายโปสการ์ด */
  postOff?: string[];
}

/**
 * ✏️ ชิ้นส่วนบนหน้า (ปุ่ม Text / Rectangle / Ellipse แบบโปรแกรม Printbox)
 * x,y = จุดกึ่งกลาง (มม. บนผืนรวมตัดตก) · w,h = ขนาดรูปทรง (ข้อความคิดขนาดจากตัวอักษรเอง)
 * fill = สีพื้นรูปทรง / สีตัวอักษร · stroke = สีขอบ / ขอบตัวอักษร ("" = ไม่มี)
 */
export interface CalElement {
  id: string;
  page: string;
  /** photo = กรอบรูปอิสระ (ปุ่ม Photo แบบ Printbox) วางหน้าไหนก็ได้ ไม่ขึ้นกับช่องรูปประจำหน้า */
  kind: "text" | "rect" | "ellipse" | "photo";
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  fill: string;
  stroke: string;
  strokeW: number;
  /** มุมมนของสี่เหลี่ยม (มม.) */
  radius?: number;
  /** ความทึบของเส้นขอบ 0–1 */
  strokeA?: number;
  /** ความทึบ 0–1 */
  opacity?: number;
  text?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  /** กรอบรูป: ลำดับรูปในคลังรูปของแบบ · รูปเต็มกรอบเสมอ (cover) แล้วซูม/เลื่อนในกรอบได้ */
  src?: number;
  /** ซูมในกรอบ (1 = พอดีเต็มกรอบ) */
  zoom?: number;
  /** เลื่อนรูปในกรอบ −1…1 (ส่วนที่ล้นกรอบ) */
  ox?: number;
  oy?: number;
  /** กลับด้านรูปซ้าย-ขวา (กระจก) */
  flipX?: boolean;
  /** ✨ เอฟเฟกต์รูป (CAL_FILTERS) */
  filter?: string;
  bright?: number;
  contrast?: number;
  sat?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** postback = ด้านหลังลายโปสการ์ด (ช่องแสตมป์ · To/address · From · รหัสไปรษณีย์) วาดตายตัวเป็นพื้นหลัง — drawPostBack */
export type PageKind = "photo" | "year" | "photo-year" | "photo-month" | "month" | "postback";

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
  /** 📄 อยู่แผ่นที่เท่าไหร่ ด้านไหน (ปฏิทินตั้งโต๊ะพิมพ์หน้า-หลัง · ผู้ใช้ขอ 14 ต.ค. 69 ให้บอกว่าเดือนไหนหน้า/หลัง) */
  sheet?: { n: number; side: "front" | "back" };
  /** ช่องรูปไม่บังคับ — ว่างได้ (พิมพ์เป็นพื้นขาว/สีพื้น) เช่น หลังปก/หลังแผ่นสุดท้ายของปฏิทินตั้งโต๊ะ */
  optional?: boolean;
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
  /**
   * 🃏 จำนวนใบต่อชุดที่ "หน้าตาเหมือนกัน" (โปสการ์ดรายปี 8 · โฟโต้การ์ด 20) — ลูกค้าแยกออกแบบรายใบได้ (CalDesign.custom)
   * ไม่ตั้ง = 1 (ทุกหน้าใน pages เป็นของชิ้นเดียว เช่นปฏิทินตั้งโต๊ะ/รายเดือน)
   */
  cards?: number;
  /** กี่หน้าต่อ 1 ใบ (พิมพ์ 2 ด้าน = 2) — ใช้จัดกลุ่มแถบรูปย่อเป็น "ใบที่ N" · ไม่ตั้ง = เรียกเป็นหน้า (ปฏิทินตั้งโต๊ะ) */
  perCard?: number;
  /**
   * มุมมนของเส้นตัด (มม.) — โฟโต้การ์ดตัดมุมมน: บนจอวาดเส้นตัดโค้ง + ลายทแยงตรงตัดตก (แบบ Printbox) · รูปย่อตัดมุมให้เห็นทรงจริง
   * ไฟล์ส่งพิมพ์ยังเป็นสี่เหลี่ยมเต็มตัดตก (เครื่องตัดมุมเอง)
   */
  cornerR?: number;
  /**
   * 🕳 เว้นขอบบน (มม. จากขอบผืนรวมตัดตก) ไม่ให้ตาราง/หัวเดือนเข้าไป — ปฏิทินตั้งโต๊ะมีรูเจาะห่วงด้านบน
   * (ผู้ใช้แจ้ง 13 ต.ค. 69 "AUGUST 2026 ชนรูเจาะ") · รูปเต็มใบยังเลยขึ้นไปได้ (รูเจาะทะลุรูปอยู่แล้ว) · layPage บังคับให้
   */
  topClear?: number;
}

/** หน้าของใบที่ i (0 = ใบแรก ใช้ key เดิม · ใบอื่นที่แยกออกแบบ = "c{i}:key") */
export const cardKey = (i: number, key: string) => (i ? `c${i}:${key}` : key);

export const fmtW = (f: CalFormat) => f.trimW + f.bleed * 2;
export const fmtH = (f: CalFormat) => f.trimH + f.bleed * 2;

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
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

/** สลับคู่ [รูป, ตาราง] → [ตาราง, รูป] (ปฏิทินตั้งโต๊ะ 14 แผ่น: หน้าแผ่น = ตาราง) */
const swapPairs = (ps: CalPage[]): CalPage[] => ps.flatMap((p, i) => (i % 2 ? [] : [ps[i + 1], p]));

/** หน้าตามเลย์เอาต์ที่เลือก + ช่องรูปหลักที่ลูกค้าปรับขนาดเอง (design.slots) — ใช้ทั้งตอนวาดและบนจอ */
export function layPage(f: CalFormat, page: CalPage, d: Pick<CalDesign, "layouts" | "slots">): CalPage {
  let p = pageWithLayout(f, page, d.layouts?.[page.key]);
  // 🕳 ตาราง/หัวเดือนห้ามขึ้นไปทับแถบรูเจาะ (topClear)
  if (f.topClear && p.grid && p.grid.y < f.topClear) p = { ...p, grid: { ...p.grid, y: f.topClear, h: p.grid.h - (f.topClear - p.grid.y) } };
  const s = p.photo ? d.slots?.[page.key] : undefined;
  return s ? { ...p, photo: s } : p;
}

/** id ชั้นพิเศษใน CalDesign.order */
export const LAYER_SLOT = "@slot";
export const LAYER_GRID = "@grid";

/**
 * 🗂 ลำดับชั้นของหน้า (ล่าง → บน) — ที่ลูกค้าจัดไว้ (design.order) + ของที่ยังไม่อยู่ในรายการต่อท้ายตามค่าเริ่มต้น
 * ตัดของที่ไม่มีแล้ว (ชิ้นส่วนที่ลบ / หน้าที่ไม่มีช่องรูปหรือตาราง) · page = หน้าหลังจัดเลย์เอาต์แล้ว
 */
export function orderOf(page: CalPage, d: Pick<CalDesign, "order" | "elements">): string[] {
  const ids = [
    ...(page.photo ? [LAYER_SLOT] : []),
    ...(page.grid ? [LAYER_GRID] : []),
    ...(d.elements ?? []).filter((e) => e.page === page.key).map((e) => e.id),
  ];
  const saved = (d.order?.[page.key] ?? []).filter((id) => ids.includes(id));
  return [...saved, ...ids.filter((id) => !saved.includes(id))];
}

/** ตารางปฏิทินของหน้านี้ — ที่ลูกค้าลากปรับเอง (design.grids) มาก่อน ไม่มีใช้ตามเลย์เอาต์ */
export function gridOf(page: CalPage, d: Pick<CalDesign, "grids">): Rect | undefined {
  return page.grid ? (d.grids?.[page.key] ?? page.grid) : undefined;
}

/** มุมมนโฟโต้การ์ด (มม.) — วัดจากจอหน้าร้านเดิม (Printbox Calendar_Photocard ~3 มม.) */
const CARD_R = 3;
/** ตัดตกโฟโต้การ์ด (มม.) — ชุดเดียวกับเทมเพลต scripts/photocard-template-build.mts (PAD) */
const CARD_BLEED = 2.5;

const cmText = (mm: number) => String(Math.round(mm) / 10);

/**
 * 📐 ขนาดผืนหลังเพิ่มขนาด (ผ้าแคนวาส 40x85 ซม. + กลุ่ม "เพิ่มขนาด ด้านกว้าง/ด้านสูง (นิ้ว)") — null = ไม่ได้เพิ่ม
 * ขนาดตั้งต้นอ่านจากตัวเลือก "ขนาด" (เช่น "40x85 ซม.") · 1 นิ้ว = 2.54 ซม. · ใช้ทั้งหน้าสินค้า (สรุปขนาดใหม่) และจอสร้างปฏิทิน
 */
export function canvasSizeOf(
  sel: Record<string, string | undefined>,
): { baseW: number; baseH: number; addW: number; addH: number; w: number; h: number } | null {
  const base = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*ซม/.exec(sel["ขนาด"] ?? "");
  if (!base) return null;
  const num = (re: RegExp) => {
    const k = Object.keys(sel).find((x) => re.test(x));
    const n = k ? parseFloat(String(sel[k] ?? "")) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const addW = num(/^เพิ่มขนาด ด้านกว้าง/);
  const addH = num(/^เพิ่มขนาด ด้านสูง/);
  if (!addW && !addH) return null;
  const baseW = Number(base[1]);
  const baseH = Number(base[2]);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { baseW, baseH, addW, addH, w: r(baseW + addW * 2.54), h: r(baseH + addH * 2.54) };
}

/** เส้นตัด (มีมุมมนถ้ารูปแบบตั้ง cornerR) เป็น path — ใช้วาดไกด์/ตัดรูปย่อ */
export function trimPath(ctx: CanvasRenderingContext2D, k: number, f: CalFormat) {
  const b = f.bleed * k;
  ctx.roundRect(b, b, f.trimW * k, f.trimH * k, (f.cornerR ?? 0) * k);
}

/**
 * รูปแบบงานทั้งหมด — key ตั้งใน Product.calendarStudio.formats
 *   card / card-L (2 ด้าน) · card1 / card1-L (1 ด้าน · -L = แนวนอน) · postcard-year1-{L|P} · postcard-year2-{L|P}
 *   postcard-month-{L|P} (1 ด้าน) · postcard-month2-{L|P} (2 ด้าน)
 *   desktop14-{L|P} (8 แผ่น) · desktop26-{L|P} (14 แผ่น) · canvas
 */
export function calFormat(key: string, opts: { bleed?: number } = {}): CalFormat {
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
        key,
        name: `โปสการ์ดปฏิทินรายปี 4×6" ${ori} · พิมพ์ 1 ด้าน`,
        trimW: w,
        trimH: h,
        bleed: 2,
        safe: 4,
        dpi: 300,
        cards: 8,
        perCard: 1,
        pages: [{ key: "front", name: "หน้าเดียว", kind: "photo-year", text: true, photo, grid, border, light: true }],
      };
    }
    if (key.startsWith("postcard-year2"))
      return {
        key,
        name: `โปสการ์ดปฏิทินรายปี 4×6" ${ori} · พิมพ์ 2 ด้าน`,
        trimW: w,
        trimH: h,
        bleed: 2,
        safe: 4,
        dpi: 300,
        cards: 8,
        perCard: 2,
        pages: [
          { key: "front", name: "ด้านหน้า (รูป)", kind: "photo", photo: fr.full, text: true },
          { key: "back", name: "ด้านหลัง (ปฏิทิน)", kind: "year", grid: fr.inner },
        ],
      };
    /**
     * 📮 พิมพ์ 2 ด้าน "ด้านหลังเป็นลาย Postcard" (ผู้ใช้สั่ง 13 ต.ค. 69): ด้านหน้า = เหมือนพิมพ์ 1 ด้าน (รูป + ปฏิทิน)
     * ด้านหลัง = ลายโปสการ์ดตายตัว (drawPostBack) · ใบละ 2 หน้าเรียงคู่ (หน้า · หลัง)
     */
    if (key.startsWith("postcard-yearpb") || key.startsWith("postcard-monthpb")) {
      const month = key.startsWith("postcard-monthpb");
      const fronts = calFormat(`postcard-${month ? "month" : "year1"}-${L ? "L" : "P"}`).pages;
      // ช่องรูปเต็มใบ = ลูกค้าใส่ลายของตัวเองทับลายโปสการ์ดได้ (ไม่ยืมรูปหน้าปก · ว่าง = ไม่โชว์ช่องเทา) — ผู้ใช้สั่ง 13 ต.ค. 69
      const pb = (p: CalPage): CalPage => ({ key: `pb-${p.key}`, name: "ด้านหลัง (ลายโปสการ์ด)", kind: "postback", photo: fr.full });
      return {
        key,
        name: `โปสการ์ดปฏิทิน${month ? "รายเดือน" : "รายปี"} 4×6" ${ori} · ${month ? "13 ใบ · " : ""}พิมพ์ 2 ด้าน (หลังลายโปสการ์ด)`,
        trimW: w,
        trimH: h,
        bleed: 2,
        safe: 4,
        dpi: 300,
        ...(month ? {} : { cards: 8 }),
        perCard: 2,
        note: `${month ? "13 ใบ 26 หน้า" : "ใบละ 2 หน้า"} — หน้าคี่ = ด้านหน้า (รูป + ปฏิทิน) · หน้าคู่ = ด้านหลังลายโปสการ์ด`,
        pages: fronts.flatMap((p) => [month ? p : { ...p, name: "ด้านหน้า (รูป + ปฏิทิน)" }, pb(p)]),
      };
    }
    if (key.startsWith("postcard-month2"))
      // 2 ด้าน: ใบละ 2 หน้าเรียงคู่กัน (หน้าคี่ = ด้านหน้า · หน้าคู่ = ด้านหลังของใบเดียวกัน)
      return {
        key,
        name: `โปสการ์ดปฏิทินรายเดือน 4×6" ${ori} · 13 ใบ · พิมพ์ 2 ด้าน`,
        trimW: w,
        trimH: h,
        bleed: 2,
        safe: 4,
        dpi: 300,
        perCard: 2,
        note: "13 ใบ 26 หน้า — หน้าคี่ = ด้านหน้า (รูป) · หน้าคู่ = ด้านหลังของใบเดียวกัน (ตาราง)",
        pages: [
          { key: "cover", name: "ปก (รูป)", kind: "photo", photo: fr.full, text: true },
          { key: "year", name: "หลังปก (ภาพรวมทั้งปี)", kind: "year", grid: fr.inner },
          ...monthsPages(fr, "separate"),
        ],
      };
    return {
      key,
      name: `โปสการ์ดปฏิทินรายเดือน 4×6" ${ori} · 13 ใบ · พิมพ์ 1 ด้าน`,
      trimW: w,
      trimH: h,
      bleed: 2,
      safe: 4,
      dpi: 300,
      perCard: 1,
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
      trimW: w,
      trimH: h,
      bleed: 2,
      safe: 5,
      dpi: 300,
      note: separate
        ? "14 แผ่น 28 หน้า — แต่ละเดือน 1 แผ่น (หน้า = ตาราง · หลัง = รูป) · หลังปก/หลังแผ่นสุดท้ายใส่รูปได้ (ไม่บังคับ)"
        : "8 แผ่น 16 หน้า — แผ่นละ 2 เดือน (หน้า/หลัง) · หลังปก/หลังแผ่นสุดท้ายใส่รูปได้ (ไม่บังคับ)",
      // รูเจาะในเทมเพลต Calendar 6x8/8x6 อยู่ 5.3–9.3 มม. จากขอบอาร์ตบอร์ด (+0.7 เมื่อวางบนผืนนี้) → ตารางเริ่มต่ำกว่า 14 มม.
      topClear: 14,
      pages: [
        { key: "cover", name: "ปก", kind: "photo", photo: fr.full, text: true },
        // หลังปก + หลังแผ่นสุดท้าย ออกแบบได้ (ผู้ใช้สั่ง 14 ต.ค. 69 "ปกต้องมีด้านหลังด้วย · แผ่นสุดท้ายต้องมีด้านหลัง") · ไม่ใส่ = ขาว
        { key: "coverBack", name: "หลังปก", kind: "photo", photo: fr.full, optional: true },
        // 14 แผ่น: แต่ละเดือน ด้านหน้า = ตาราง · ด้านหลัง = รูป (ผู้ใช้สั่ง 14 ต.ค. 69) → เรียงตาราง ก่อนรูป
        ...(separate ? swapPairs(monthsPages(fr, "separate")) : monthsPages(fr, "combined")),
        { key: "year", name: "ภาพรวมทั้งปี", kind: "year", grid: fr.inner },
        { key: "yearBack", name: "หลังภาพรวมทั้งปี", kind: "photo", photo: fr.full, optional: true },
      ].map((p, i, all): CalPage => {
        /**
         * 📄 แผ่น/ด้าน (ตามโน้ตงานผลิต: หลังปก + หลังแผ่นสุดท้ายว่าง)
         * 8 แผ่น: ปก = แผ่น 1 หน้า · ม.ค./ก.พ. = แผ่น 2 หน้า/หลัง … พ.ย./ธ.ค. = แผ่น 7 · ภาพรวมทั้งปี = แผ่น 8 หน้า
         * 14 แผ่น: ปก = แผ่น 1 · แต่ละเดือน = 1 แผ่น (หน้า = ตาราง · หลัง = รูป) · ภาพรวมทั้งปี = แผ่น 14
         */
        const last = separate ? 14 : 8;
        if (i <= 1) return { ...p, sheet: { n: 1, side: i ? "back" : "front" } } as CalPage;
        if (i >= all.length - 2) return { ...p, sheet: { n: last, side: i === all.length - 1 ? "back" : "front" } } as CalPage;
        const j = i - 2;
        return { ...p, sheet: { n: 2 + Math.floor(j / 2), side: j % 2 ? "back" : "front" } } as CalPage;
      }),
    };
  }
  // ── ปฏิทินผ้าแคนวาส 40×85 ซม. (แนวตั้ง แขวนผนัง) ──
  if (key === "canvas" || key.startsWith("canvas@")) {
    // 📐 "canvas@<กว้าง>x<สูง>" (มม.) = ลูกค้าเพิ่มขนาดจากมาตรฐาน (canvasSizeOf · ผู้ใช้สั่ง 13 ต.ค. 69)
    const m = /^canvas@(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(key);
    const cw = m ? Number(m[1]) : 400;
    const chh = m ? Number(m[2]) : 850;
    const fr = frame(cw, chh, 10, 25);
    const top = 70; // เผื่อหัวผืนสำหรับไม้แขวน/หมุด
    // ช่องรูปโตตามผืน (ไม่เกินสัดส่วนด้านใดด้านหนึ่ง) · ตารางกินที่เหลือ
    const photo = { x: fr.s, y: top, w: fr.W - fr.s * 2, h: 360 * Math.min(cw / 400, chh / 850) };
    return {
      key,
      name: `ปฏิทินผ้าแคนวาส ${cmText(cw)}×${cmText(chh)} ซม.`,
      trimW: cw,
      trimH: chh,
      bleed: 10,
      safe: 25,
      dpi: 150,
      note: "หัวผืน 6 ซม. เว้นไว้สำหรับไม้แขวน",
      pages: [
        {
          key: "front",
          name: "ผืนปฏิทิน",
          kind: "photo-year",
          text: true,
          photo,
          grid: { x: fr.s, y: top + photo.h + 20, w: fr.W - fr.s * 2, h: fr.H - fr.s - (top + photo.h + 20) },
        },
      ],
    };
  }
  // ── โฟโต้การ์ด 5.5×8.5 ซม. (ค่าเริ่มต้น) — ตัดตกเท่าไฟล์เทมเพลต Photocard 300g (57.1×87.1) ──
  // แนวนอน (-L) = 8.5×5.5 ซม. (เพิ่ม 13 ต.ค. 69) · key เดิม card/card1 = แนวตั้ง (ออเดอร์เก่ายังเปิดแก้ได้)
  const [cw, ch] = L ? [85, 55] : [55, 85];
  // ตัดตก 2.5 มม. = มาตรฐานไฟล์ผลิตจริงของร้าน (วัดจากงานโฮโลแกรม 597 ชิ้น: ลาย 60×90 รอบเส้นตัด 55×85 · 13 ต.ค. 69)
  // เดิม 1.05 มม. ยกจากเทมเพลต Photocard 300g เก่า (57.1×87.1) — ภาพเลยเส้นตัดน้อยกว่าที่ผลิตจริงใช้
  // opts.bleed = ตัดตกตามเทมเพลตที่อัปเข้าระบบ (จอปฏิทินอ่านจากอาร์ตบอร์ดของไฟล์ที่ตรงสเปค) · ไม่ส่ง = มาตรฐาน
  const cb = opts.bleed && opts.bleed > 0 ? opts.bleed : CARD_BLEED;
  const fr = frame(cw, ch, cb, 3);
  const cOri = L ? "แนวนอน" : "แนวตั้ง";
  const cSize = L ? "8.5×5.5" : "5.5×8.5";
  if (key.startsWith("card1"))
    return {
      key: L ? "card1-L" : "card1",
      name: `ปฏิทินโฟโต้การ์ด ${cSize} ซม. ${cOri} · พิมพ์ 1 ด้าน`,
      trimW: cw,
      trimH: ch,
      bleed: cb,
      safe: 3,
      dpi: 300,
      cards: 20,
      perCard: 1,
      cornerR: CARD_R,
      pages: [{ key: "front", name: "หน้าเดียว (รูป + ปฏิทิน)", kind: "photo-year", text: true, ...split(fr, 0.5, 2) }],
    };
  return {
    key: L ? "card-L" : "card",
    name: `ปฏิทินโฟโต้การ์ด ${cSize} ซม. ${cOri} · พิมพ์ 2 ด้าน`,
    trimW: cw,
    trimH: ch,
    bleed: cb,
    safe: 3,
    dpi: 300,
    cards: 20,
    perCard: 2,
    cornerR: CARD_R,
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
  const same = opt.display === "dropdown" && choices.length === opt.choices.length && choices.every((c, i) => c === opt.choices[i]);
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
  // ลิงก์ละฟอนต์ — ฟอนต์ตัวไหนชื่อผิด/Google ตอบ 400 ไม่ลากทั้งชุดล่มตาม (ไฟล์ฟอนต์จริงโหลดเฉพาะตัวที่ใช้)
  for (const f of CAL_FONTS) {
    if (!f.google) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.google.replace(/ /g, "+")}&display=swap`;
    document.head.appendChild(link);
  }
}

/** รอให้ฟอนต์ที่จะใช้พร้อมก่อนวาดไฟล์จริง (กันไฟล์ส่งพิมพ์ออกมาเป็นฟอนต์สำรอง) */
export async function ensureFonts(keys: string[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [...new Set(keys)].flatMap((k) => {
      const fam = fontFamilyOf(k);
      return ["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 20px ${fam}`, "ปฏิทิน2026").catch(() => []));
    }),
  );
}

/* ─────────────────────────── วาด ─────────────────────────── */

/** กรอบของข้อความหน้าปก (มม.) — ใช้จับลากและวาดกรอบเลือก */
export function textBox(ctx: CanvasRenderingContext2D, t: CalText): Rect {
  // วัดที่ขนาดใหญ่แล้วหารกลับ — ฟอนต์ขนาด 1–7 px วัดตรง ๆ ได้ค่าปัดเศษเพี้ยน
  ctx.save();
  ctx.font = `${t.italic ? "italic " : ""}${t.bold ? 700 : 400} ${t.sizeMm * 20}px ${fontFamilyOf(t.font)}`;
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

/** รูปพอดีช่องทั้งรูป (เห็นทั้งรูป อาจเหลือขอบ) — ปุ่ม ⤢ ช่องรูปหลักแบบ Printbox "Fit the image within the photo slot" */
export function containPlacement(r: Rect, img: { w: number; h: number }): CalPlacement {
  const s = Math.min(r.w / img.w, r.h / img.h);
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
  // 📮 ด้านหลังลายโปสการ์ด: มีแต่ลายที่ลูกค้าใส่เอง ไม่ยืมรูปหน้าปก
  if (page.kind === "postback") return own && own.src >= 0 && imgs[own.src] ? { img: imgs[own.src]!, pl: own.pl } : null;
  // src < 0 = ลูกค้ากดลบรูปช่องนี้ → ว่าง (ไม่ยืมรูปหน้าปก)
  if (own && own.src < 0) return null;
  if (own && imgs[own.src]) return { img: imgs[own.src]!, pl: own.pl };
  if (d.noBorrow) return null;
  // ไม่มีรูปของตัวเอง = ยืมรูปช่องรูปหน้าปก (รูปแรกที่ลงช่องรูป) — ไม่ยืมรูปจากกรอบรูปอิสระ
  // (เดิมยืม "รูปแรกที่อัป" → ใส่รูปด้านหลังแล้วหน้าปกได้รูปนั้นไปด้วยเอง · 13 ต.ค. 69)
  const first = slotSrc(d, imgs);
  if (first < 0) return null;
  return { img: imgs[first]!, pl: coverPlacement(page.photo, imgs[first]!) };
}

/** รูปตั้งต้นของช่องรูป = รูปของช่องรูปแรกที่มีรูป (-1 = ยังไม่มีช่องไหนมีรูป) */
export function slotSrc(d: CalDesign, imgs: (ImgRef | null)[]): number {
  // ลายที่ใส่ด้านหลังโปสการ์ด (pb-*) ไม่ใช่รูปหน้าปก
  for (const [key, ph] of Object.entries(d.photos)) if (!/(^|:)pb-/.test(key) && imgs[ph.src]) return ph.src;
  return -1;
}

function drawText(ctx: CanvasRenderingContext2D, k: number, t: CalText) {
  if (!t.value.trim()) return;
  ctx.font = `${t.italic ? "italic " : ""}${t.bold ? 700 : 400} ${t.sizeMm * k}px ${fontFamilyOf(t.font)}`;
  const align = t.align ?? "center";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const lines = t.value.split("\n");
  const lh = t.sizeMm * 1.25;
  const top = t.yMm - (lines.length * lh) / 2 + lh / 2;
  // กล่องกว้างเท่าบรรทัดยาวสุด — ชิดซ้าย/ขวาวัดจากขอบกล่อง (กึ่งกลาง = จุดกลางเดิม)
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const x = align === "left" ? t.xMm * k - boxW / 2 : align === "right" ? t.xMm * k + boxW / 2 : t.xMm * k;
  lines.forEach((line, i) => {
    const y = (top + i * lh) * k;
    if (t.stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(0.25, t.sizeMm * 0.16) * k;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    if (t.underline && line.trim()) {
      // ขีดเส้นใต้ ใต้ตัวอักษรแต่ละบรรทัด (canvas ไม่มี text-decoration)
      const lw = ctx.measureText(line).width;
      const x0 = align === "left" ? x : align === "right" ? x - lw : x - lw / 2;
      ctx.fillRect(x0, y + t.sizeMm * 0.5 * k, lw, Math.max(0.15, t.sizeMm * 0.07) * k);
    }
  });
}

/** ค่าตัวอักษรของส่วนหนึ่ง — รวมค่าที่ลูกค้าปรับกับค่าเดิมของแบบ */
function partOf(b: CalBack, key: CalPartKey, k: number, defWeight: number, defColor: string) {
  const p = b.parts?.[key] ?? {};
  const fam = fontFamilyOf(p.font || b.font);
  const weight = p.bold === undefined ? defWeight : p.bold ? 700 : 400;
  const it = p.italic ? "italic " : "";
  return {
    fam,
    weight,
    bold: p.bold,
    scale: Math.min(2.5, Math.max(0.4, p.scale ?? 1)),
    align: p.align ?? "center",
    color: p.color || defColor,
    font: (sizeMm: number, w = weight) => `${it}${w} ${sizeMm * k}px ${fam}`,
  };
}

/**
 * จุดกึ่งกลางข้อความตามการจัดชิด — ในช่องกว้าง w ที่กึ่งกลาง cx (เว้นขอบ pad)
 * ต้องตั้ง ctx.font ก่อนเรียก (วัดความกว้างข้อความ) · วาดด้วย textAlign center เสมอ
 */
function alignedCenter(ctx: CanvasRenderingContext2D, k: number, text: string, cx: number, w: number, align: CalPart["align"], pad = 0): number {
  if (!align || align === "center") return cx;
  const tw = ctx.measureText(text).width / k;
  return align === "left" ? cx - w / 2 + pad + tw / 2 : cx + w / 2 - pad - tw / 2;
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
function dayNum(g: GridCtx, m: number, d: number, col: number, x: number, y: number, size: number, r: number, labelW = 0, colW = 0) {
  const { ctx, k, b } = g;
  const key = `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const e = g.ev.get(key);
  const pt = partOf(b, "day", k, 400, b.ink);
  size *= pt.scale;
  const wt = pt.bold ? 700 : g.light ? (e ? 600 : 500) : e || g.hol[key] ? 700 : 400;
  ctx.font = pt.font(size, wt);
  // จัดชิดซ้าย/ขวาในช่องวัน — วงกลมวันสำคัญย้ายตามตัวเลข
  if (colW) x = alignedCenter(ctx, k, String(d), x, colW, pt.align, colW * 0.12);
  let color = pt.color;
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
  ctx.font = pt.font(size, wt);
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
  const numSize = light ? Math.min(rowH * 0.86, colW * 0.56) : Math.min(rowH * 0.72, colW * 0.62);
  const nameSize = light ? Math.min(rowH * (b.lang === "th" ? 0.95 : 1.02), cellW * 0.16) : Math.min(nameH * (b.lang === "th" ? 0.67 : 0.63), cellW * 0.13);
  const wkSize = light ? Math.min(rowH * (b.lang === "th" ? 0.72 : 0.8), colW * 0.54) : Math.min(wkH * (b.lang === "th" ? 0.55 : 0.6), colW * 0.6);
  const pm = partOf(b, "month", k, light ? 600 : 700, b.accent);
  const mName = monthName(m, b.lang);
  ctx.fillStyle = pm.color;
  ctx.font = pm.font(nameSize * pm.scale);
  ctx.fillText(mName, alignedCenter(ctx, k, mName, cx + cellW / 2, cellW, pm.align, colW * 0.12) * k, (cy + nameH / 2) * k);
  const pw = partOf(b, "week", k, light ? 500 : 700, b.ink);
  ctx.font = pw.font(wkSize * pw.scale);
  const days = b.lang === "th" ? DAYS_TH : DAYS_EN;
  g.order.forEach((wd, i) => {
    ctx.fillStyle = b.sundayOn && wd === 0 ? b.sundayColor : pw.color;
    const c = cx + colW * (i + 0.5);
    ctx.fillText(days[wd], alignedCenter(ctx, k, days[wd], c, colW, pw.align, colW * 0.12) * k, (cy + nameH + wkH / 2) * k);
  });
  monthGrid(b.year, m, b.weekStart).forEach((row, r) =>
    row.forEach((d, i) => {
      if (!d) return;
      dayNum(g, m, d, i, cx + colW * (i + 0.5), cy + nameH + wkH + rowH * (r + 0.5), numSize, Math.min(colW, rowH) * 0.5, 0, colW);
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
    const pt = partOf(b, "title", k, light ? 400 : 700, b.accent);
    let size = titleH * (light ? 0.68 : 0.61) * pt.scale;
    ctx.font = pt.font(size);
    const w = ctx.measureText(b.title).width / k;
    if (w > r.w * 0.95) size *= (r.w * 0.95) / w;
    ctx.font = pt.font(size);
    ctx.fillStyle = pt.color;
    ctx.fillText(b.title, alignedCenter(ctx, k, b.title, r.x + r.w / 2, r.w, pt.align) * k, (r.y + titleH / 2 - titleH * 0.05) * k);
  }
  const aspect = r.w / (r.h - titleH);
  const [cols, rows] = aspect > 2.2 ? [6, 2] : aspect > 1.05 ? [4, 3] : [3, 4];
  const cellW0 = r.w / cols;
  const gapX = cellW0 * (light ? 0.125 : 0.13);
  const cellW = (r.w - gapX * (cols - 1)) / cols;
  const cellH0 = (r.h - titleH) / rows;
  const gapY = cellH0 * 0.09;
  const cellH = (r.h - titleH - gapY * (rows - 1)) / rows;
  for (let m = 0; m < 12; m++) miniMonth(g, m, r.x + (m % cols) * (cellW + gapX), r.y + titleH + Math.floor(m / cols) * (cellH + gapY), cellW, cellH, light);
}

/** ตารางเดือนเดียว (หน้ารายเดือน) */
function drawMonth(ctx: CanvasRenderingContext2D, k: number, b: CalBack, r: Rect, m: number) {
  const g = gridCtx(ctx, k, b);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const headH = Math.min(r.h * 0.2, r.w * 0.12);
  const yearTxt = b.lang === "th" ? String(b.year + 543) : String(b.year);
  const head = `${b.lang === "th" ? monthName(m, "th") : monthName(m, "en").toUpperCase()} ${yearTxt}`;
  const pm = partOf(b, "month", k, 700, b.accent);
  let size = headH * 0.58 * pm.scale;
  ctx.font = pm.font(size);
  const w = ctx.measureText(head).width / k;
  if (w > r.w) size *= r.w / w;
  ctx.font = pm.font(size);
  ctx.fillStyle = pm.color;
  ctx.fillText(head, alignedCenter(ctx, k, head, r.x + r.w / 2, r.w, pm.align, r.w * 0.015) * k, (r.y + headH / 2) * k);

  const grid = monthGrid(b.year, m, b.weekStart);
  const wkH = Math.min((r.h - headH) * 0.12, r.w * 0.05);
  // แถวเท่าจำนวนสัปดาห์จริงของเดือน (4–6) — กรอบตารางพอดีวันที่สุดท้าย ไม่เหลือแถวว่างท้าย (ผู้ใช้แจ้ง 14 ต.ค. 69)
  // ขนาดตัวเลขยังคิดจาก 6 แถว = ทุกเดือนตัวเลขเท่ากัน
  const rowH = (r.h - headH - wkH) / grid.length;
  const rowH6 = (r.h - headH - wkH) / 6;
  const colW = r.w / 7;
  const days = b.lang === "th" ? DAYS_TH : DAYS_EN_LONG;
  const pw = partOf(b, "week", k, 700, b.ink);
  ctx.font = pw.font(Math.min(wkH * 0.55, colW * 0.3) * pw.scale);
  g.order.forEach((wd, i) => {
    ctx.fillStyle = b.sundayOn && wd === 0 ? b.sundayColor : pw.color;
    const c = r.x + colW * (i + 0.5);
    ctx.fillText(days[wd], alignedCenter(ctx, k, days[wd], c, colW, pw.align, colW * 0.08) * k, (r.y + headH + wkH / 2) * k);
  });
  const numSize = Math.min(rowH6 * 0.5, colW * 0.42);
  const showLabel = rowH6 > 7;
  grid.forEach((row, ri) =>
    row.forEach((d, i) => {
      if (!d) return;
      const cy = r.y + headH + wkH + rowH * (ri + (showLabel ? 0.4 : 0.5));
      dayNum(g, m, d, i, r.x + colW * (i + 0.5), cy, numSize, Math.min(colW, rowH) * 0.36, showLabel ? colW * 0.94 : 0, colW);
    }),
  );
}

/* ─────────────────────────── เลย์เอาต์ต่อหน้า (ปุ่ม Layout) ─────────────────────────── */

/** ตัวเลือกเลย์เอาต์ของหน้านี้ — หน้า "รูป+ตาราง" สลับข้าง/ตารางล้วน · หน้ารูปล้วน เต็มใบ/มีขอบขาว */
export function layoutsOf(f: CalFormat, page: CalPage): { key: string; name: string }[] {
  const L = fmtW(f) > fmtH(f);
  if (page.photo && page.grid)
    return [
      { key: "", name: L ? "รูปซ้าย · ปฏิทินขวา" : "รูปบน · ปฏิทินล่าง" },
      { key: "swap", name: L ? "ปฏิทินซ้าย · รูปขวา" : "ปฏิทินบน · รูปล่าง" },
      { key: "nophoto", name: "ปฏิทินล้วน (ไม่มีรูป)" },
    ];
  if (page.photo)
    return [
      { key: "", name: "รูปเต็มใบ" },
      { key: "inset", name: "รูปมีขอบขาว" },
    ];
  return [];
}

/** หน้าเดิม + เลย์เอาต์ที่ลูกค้าเลือก → ช่องรูป/ตารางใหม่ (ค่าที่ไม่รู้จัก = เหมือนเดิม) */
export function pageWithLayout(f: CalFormat, page: CalPage, variant?: string): CalPage {
  if (!variant) return page;
  const W = fmtW(f);
  const H = fmtH(f);
  const s = f.bleed + f.safe;
  const safe = { x: s, y: s, w: W - s * 2, h: H - s * 2 };
  if (page.photo && page.grid) {
    const ph = page.photo;
    const g = page.grid;
    if (variant === "nophoto") {
      // ตารางกินพื้นที่ทั้งหมดในเขตที่ใช้อยู่ (ไม่ล้นเขตปลอดภัย)
      const x0 = Math.max(Math.min(ph.x, g.x), safe.x);
      const y0 = Math.max(Math.min(ph.y, g.y), safe.y);
      const x1 = Math.min(Math.max(ph.x + ph.w, g.x + g.w), safe.x + safe.w);
      const y1 = Math.min(Math.max(ph.y + ph.h, g.y + g.h), safe.y + safe.h);
      return { ...page, photo: undefined, grid: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    }
    if (variant === "swap") {
      const L = W > H;
      const flip = (r: Rect): Rect => (L ? { ...r, x: W - r.x - r.w } : { ...r, y: H - r.y - r.h });
      return { ...page, photo: flip(ph), grid: flip(g) };
    }
  }
  if (page.photo && !page.grid && variant === "inset") return { ...page, photo: safe };
  return page;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** ข้อความในชิ้นส่วน → รูปแบบเดียวกับข้อความหน้าปก (ใช้ตัววาด/วัดชุดเดียวกัน) */
export function elementText(e: CalElement): CalText {
  return {
    value: e.text ?? "",
    font: e.font ?? "prompt",
    color: e.fill,
    stroke: e.stroke,
    sizeMm: e.size ?? 6,
    xMm: e.x,
    yMm: e.y,
    bold: !!e.bold,
    italic: !!e.italic,
    underline: !!e.underline,
    align: e.align,
  };
}

/** กรอบของชิ้นส่วน (มม.) ไม่คิดการหมุน — ใช้จับลาก/วาดกรอบเลือก */
export function elementBox(ctx: CanvasRenderingContext2D, e: CalElement): Rect {
  if (e.kind === "text") return textBox(ctx, elementText(e));
  return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
}

/** ซูมต่ำสุดของกรอบรูป = รูปพอดีกรอบทั้งรูป (contain) เทียบกับเต็มกรอบ (cover = 1) */
export function containZoom(e: { w: number; h: number }, img: { w: number; h: number }): number {
  const cover = Math.max(e.w / img.w, e.h / img.h);
  return cover > 0 ? Math.min(e.w / img.w, e.h / img.h) / cover : 1;
}

/** ขนาดรูปที่วางจริงในกรอบรูปอิสระ (มม.) — ใช้คิด DPI */
export function elementPhotoSize(e: CalElement, img: { w: number; h: number }): { w: number; h: number } {
  // zoom 1 = รูปเต็มกรอบ (cover) · ต่ำกว่า 1 ได้ถึง "พอดีกรอบเห็นทั้งรูป" (containZoom) — ปุ่ม ⤢ แบบ Printbox (13 ต.ค. 69)
  const s = Math.max(e.w / img.w, e.h / img.h) * Math.max(containZoom(e, img), e.zoom ?? 1);
  return { w: img.w * s, h: img.h * s };
}

export function drawElement(ctx: CanvasRenderingContext2D, k: number, e: CalElement, imgs: (ImgRef | null)[] = []): void {
  ctx.save();
  ctx.globalAlpha = e.opacity ?? 1;
  if (e.rot) {
    ctx.translate(e.x * k, e.y * k);
    ctx.rotate((e.rot * Math.PI) / 180);
    ctx.translate(-e.x * k, -e.y * k);
  }
  if (e.kind === "text") drawText(ctx, k, elementText(e));
  else if (e.kind === "photo") {
    const x = (e.x - e.w / 2) * k;
    const y = (e.y - e.h / 2) * k;
    const img = e.src != null ? imgs[e.src] : null;
    ctx.save();
    roundRect(ctx, x, y, e.w * k, e.h * k, (e.radius ?? 0) * k);
    ctx.clip();
    if (img) {
      const sz = elementPhotoSize(e, img);
      const cx = e.x + ((sz.w - e.w) / 2) * (e.ox ?? 0);
      const cy = e.y + ((sz.h - e.h) / 2) * (e.oy ?? 0);
      ctx.imageSmoothingQuality = "high";
      const fc = photoFilterCss(e);
      if (fc !== "none") ctx.filter = fc;
      if (e.flipX) {
        // กลับด้านรอบจุดกึ่งกลางรูป
        ctx.translate(cx * k, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx * k, 0);
      }
      ctx.drawImage(img.el, (cx - sz.w / 2) * k, (cy - sz.h / 2) * k, sz.w * k, sz.h * k);
    } else {
      // กรอบรูปว่าง = ฟ้าอมเขียวแบบ Printbox (ไม่กลืนกับช่องรูปประจำหน้าที่เป็นสีเทา) — ไฟล์พิมพ์ข้ามกรอบว่างอยู่แล้ว
      ctx.fillStyle = "#9fc4cc";
      ctx.fillRect(x, y, e.w * k, e.h * k);
    }
    ctx.restore();
    if (e.stroke && e.strokeW > 0) {
      roundRect(ctx, x, y, e.w * k, e.h * k, (e.radius ?? 0) * k);
      ctx.globalAlpha = (e.opacity ?? 1) * (e.strokeA ?? 1);
      ctx.strokeStyle = e.stroke;
      ctx.lineWidth = e.strokeW * k;
      ctx.stroke();
    }
  } else {
    const x = (e.x - e.w / 2) * k;
    const y = (e.y - e.h / 2) * k;
    if (e.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(e.x * k, e.y * k, (e.w / 2) * k, (e.h / 2) * k, 0, 0, Math.PI * 2);
    } else roundRect(ctx, x, y, e.w * k, e.h * k, (e.radius ?? 0) * k);
    if (e.fill) {
      ctx.fillStyle = e.fill;
      ctx.fill();
    }
    if (e.stroke && e.strokeW > 0) {
      ctx.strokeStyle = e.stroke;
      ctx.lineWidth = e.strokeW * k;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * 🖨 วาดหน้าหนึ่งของปฏิทินทั้งผืน (รวมตัดตก) · k = พิกเซลต่อมิลลิเมตร
 * page = หน้าตามรูปแบบงาน — เลย์เอาต์ที่ลูกค้าเลือก (d.layouts) ใส่ให้เองข้างใน
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  k: number,
  f: CalFormat,
  page: CalPage,
  d: CalDesign,
  b: CalBack,
  imgs: (ImgRef | null)[],
  /** preview = วาดบนจอ (กรอบรูปว่างโชว์ "Drag here" สีเทา) · ไม่ตั้ง = ไฟล์ส่งพิมพ์ (กรอบว่างไม่พิมพ์) */
  /**
   * only = วาดชั้นเดียว (ไฟล์ .ai แยกเลเยอร์ · ดู calLayersOf) — "@bg" พื้น · "@slot" รูปหลัก · "@grid" ปฏิทิน · "@legacy" ข้อความแบบเก่า · id ชิ้นส่วน
   * ไม่ตั้ง = วาดทุกชั้นรวมกัน (ไฟล์พิมพ์/จอ)
   */
  opts: { preview?: boolean; only?: string } = {},
): void {
  const W = fmtW(f);
  const H = fmtH(f);
  const pageKey = page.key;
  page = layPage(f, page, d);
  const only = opts.only;
  ctx.save();
  // พื้น: หน้าที่มีรูปใช้สีพื้นหน้าปก · หน้าตารางล้วนใช้สีพื้นปฏิทิน
  if (!only || only === LAYER_BG) {
    ctx.fillStyle = bgOf(page, d, b);
    ctx.fillRect(0, 0, W * k, H * k);
    if (page.kind === "postback" && !d.postOff?.includes(pageKey)) drawPostBack(ctx, k, f);
  }
  // 🗂 วาดตามลำดับชั้นที่ลูกค้าจัด (ล่าง → บน) — รูปหลัก · ปฏิทิน · ชิ้นส่วน สลับบน/ล่างกันได้
  const drawSlot = () => {
    if (page.photo) {
      const ph = photoOf(page, d, imgs);
      const r = page.photo;
      // ด้านหลังลายโปสการ์ด: ช่องว่าง = เห็นลายโปสการ์ด (ไม่ปูพื้นทับ)
      if (page.kind !== "photo" && page.kind !== "postback") {
        ctx.fillStyle = d.bg || "#ffffff";
        ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
      }
      if (ph) {
        // แต่งรูปช่องหลัก (มุมมน · ความทึบ · เอฟเฟกต์ · กลับด้าน · ขอบ) — ของหน้านั้นเอง ไม่ยืมจากหน้าปก
        const own = d.photos[page.key];
        const st = own && own.src >= 0 ? own : undefined;
        ctx.save();
        roundRect(ctx, r.x * k, r.y * k, r.w * k, r.h * k, (st?.radius ?? 0) * k);
        ctx.clip();
        ctx.globalAlpha = st?.opacity ?? 1;
        const fc = photoFilterCss(st);
        if (fc !== "none") ctx.filter = fc;
        ctx.translate(ph.pl.cxMm * k, ph.pl.cyMm * k);
        ctx.rotate((ph.pl.rotDeg * Math.PI) / 180);
        if (st?.flipX) ctx.scale(-1, 1);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(ph.img.el, (-ph.pl.wMm / 2) * k, (-ph.pl.hMm / 2) * k, ph.pl.wMm * k, ph.pl.hMm * k);
        ctx.restore();
        if (st?.stroke && (st.strokeW ?? 0) > 0) {
          ctx.save();
          roundRect(ctx, r.x * k, r.y * k, r.w * k, r.h * k, (st.radius ?? 0) * k);
          ctx.globalAlpha = st.strokeA ?? 1;
          ctx.strokeStyle = st.stroke;
          ctx.lineWidth = st.strokeW! * k;
          ctx.stroke();
          ctx.restore();
        }
      } else if (opts.preview && page.kind !== "postback") {
        // ช่องรูปที่ยังว่าง = สีเทา + "Drag here" (บนจอเท่านั้น) — วาดในแคนวาสใต้ชิ้นส่วน กรอบรูป/ข้อความที่วางทับจึงยังเห็นและกดได้
        emptySlotBox(ctx, k, r);
        placeholder(ctx, k, r.x + r.w / 2, r.y + r.h / 2, phSize(r.w, r.h));
      }
    }
  };
  const drawGrid = () => {
    const grid = gridOf(page, d);
    if (grid) {
      if (page.kind === "year" || page.kind === "photo-year") drawYear(ctx, k, b, grid, page.light);
      else if (page.month != null) drawMonth(ctx, k, b, grid, page.month);
    }
    if (page.border) {
      const r = page.border;
      ctx.strokeStyle = b.ink;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.3 * k;
      ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
      ctx.globalAlpha = 1;
    }
  };
  const els = new Map((d.elements ?? []).filter((e) => e.page === pageKey).map((e) => [e.id, e]));
  for (const id of orderOf(page, d)) {
    if (only && id !== only) continue;
    if (id === LAYER_SLOT) drawSlot();
    else if (id === LAYER_GRID) drawGrid();
    else {
      const e = els.get(id);
      if (!e) continue;
      const empty = e.kind === "photo" && (e.src == null || !imgs[e.src]);
      if (empty && !opts.preview) continue; // กรอบรูปที่ยังไม่ใส่รูป ไม่พิมพ์ออกไปเป็นสี่เหลี่ยมเทา
      drawElement(ctx, k, e, imgs);
      if (empty) placeholder(ctx, k, e.x, e.y, phSize(e.w, e.h));
    }
  }
  // ขอบบางของแบบหน้าร้านเดิม (โปสการ์ดรายปี) — ไม่มีตาราง/อยู่นอกลำดับชั้น ก็ยังวาด
  if (!page.grid && page.border && (!only || only === LAYER_LEGACY)) {
    const r = page.border;
    ctx.strokeStyle = b.ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 0.3 * k;
    ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
    ctx.globalAlpha = 1;
  }
  if (page.text && d.text && (!only || only === LAYER_LEGACY)) drawText(ctx, k, d.text);
  ctx.restore();
}

/** ชั้นพื้น / ของแบบเก่านอกลำดับชั้น (ขอบบาง · ข้อความหน้าปกกล่องเดียว) — ใช้กับ drawPage({ only }) */
export const LAYER_BG = "@bg";

/**
 * 📮 ด้านหลังลายโปสการ์ด (ตามภาพที่ผู้ใช้ส่ง 13 ต.ค. 69 — 1800×1200 px = ใบ 6×4 นิ้วไม่รวมตัดตก)
 * ซ้าย = From · เส้นจุดกั้นกลาง · ขวา = ช่องแสตมป์ · To / address 5 เส้น · ช่องรหัสไปรษณีย์ 5 ช่อง
 * ใบแนวตั้งหมุนลาย 90° (หลังโปสการ์ดเป็นแนวนอนเสมอ) · ฟอนต์ Poppins (CAL_FONTS "poppins" — โหลดก่อนวาดไฟล์จริง)
 */
export function drawPostBack(ctx: CanvasRenderingContext2D, k: number, f: CalFormat) {
  const portrait = f.trimH > f.trimW;
  const LW = Math.max(f.trimW, f.trimH);
  const u = (LW / 1800) * k; // 1 px ของภาพต้นแบบ → พิกเซลแคนวาส
  ctx.save();
  if (portrait) {
    ctx.translate((f.bleed + f.trimW) * k, f.bleed * k);
    ctx.rotate(Math.PI / 2);
  } else ctx.translate(f.bleed * k, f.bleed * k);
  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#111111";
  ctx.lineWidth = 2.2 * u;
  const line = (x0: number, y: number, x1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 * u, y * u);
    ctx.lineTo(x1 * u, y * u);
    ctx.stroke();
  };
  // เส้นจุดกั้นกลาง
  for (let y = 128; y <= 1076; y += 18.95) {
    ctx.beginPath();
    ctx.arc(884 * u, y * u, 3.2 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeRect(1492 * u, 118 * u, 191 * u, 229 * u); // ช่องแสตมป์
  for (const y of [498, 590, 682, 773, 864]) line(968, y, 1683);
  line(118, 1031, 831);
  for (let i = 0; i < 5; i++) ctx.strokeRect((1086 + i * 102) * u, 950 * u, 72 * u, 81 * u); // รหัสไปรษณีย์
  ctx.font = `400 ${36 * u}px ${fontFamilyOf("poppins")}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("To:", 980 * u, 476 * u);
  ctx.fillText("address:", 980 * u, 570 * u);
  ctx.fillText("From:", 118 * u, 998 * u);
  ctx.restore();
}
export const LAYER_LEGACY = "@legacy";

/** สีพื้นของหน้า (หน้าที่มีรูปใช้สีพื้นหน้าปก · หน้าตารางล้วนใช้สีพื้นปฏิทิน) */
export function bgOf(page: CalPage, d: CalDesign, b: CalBack): string {
  return (page.kind === "photo" ? d.bg : b.bg) || "#ffffff";
}

/**
 * 🗂 รายชื่อชั้นของหน้า ล่าง → บน (ไฟล์ .ai แยกเลเยอร์) — ชื่อไทยตรงกับหน้าต่าง Layers ของจอ
 * กรอบรูปที่ยังว่างไม่นับ (ไม่พิมพ์)
 */
export function calLayersOf(f: CalFormat, page: CalPage, d: CalDesign, imgs: (ImgRef | null)[]): { id: string; name: string }[] {
  const lp = layPage(f, page, d);
  const els = (d.elements ?? []).filter((e) => e.page === page.key);
  const frames = els.filter((e) => e.kind === "photo");
  const out: { id: string; name: string }[] = [{ id: LAYER_BG, name: "พื้นหลัง" }];
  for (const id of orderOf(lp, d)) {
    if (id === LAYER_SLOT) {
      if (photoOf(lp, d, imgs)) out.push({ id, name: "รูปหลัก" });
    } else if (id === LAYER_GRID) out.push({ id, name: "ปฏิทิน" });
    else {
      const e = els.find((x) => x.id === id);
      if (!e) continue;
      if (e.kind === "photo") {
        if (e.src != null && imgs[e.src]) out.push({ id, name: `กรอบรูป ${frames.indexOf(e) + 1}` });
      } else if (e.kind === "text") {
        if (e.text?.trim()) out.push({ id, name: `ข้อความ “${e.text.trim().replace(/\s+/g, " ").slice(0, 24)}”` });
      } else out.push({ id, name: e.kind === "ellipse" ? "วงกลม" : "สี่เหลี่ยม" });
    }
  }
  if ((!lp.grid && lp.border) || (lp.text && d.text)) out.push({ id: LAYER_LEGACY, name: "ข้อความ/ขอบ" });
  return out;
}

/** ขนาดตัวอักษร "Drag here" (มม.) — เล็กพอดีช่อง ไม่ใหญ่เกินบนงานชิ้นใหญ่ (13 ต.ค. 69 ผู้ใช้ขอให้ย่อ) */
const phSize = (w: number, h: number) => Math.min(6, Math.max(1.8, Math.min(w, h) * 0.045));

/** ป้าย "Drag here" แบบโปรแกรมหน้าร้านเดิม (ช่องรูป/กรอบรูปที่ยังว่าง · บนจอเท่านั้น) */
/**
 * 🖼 ช่องรูปที่ยังว่าง (บนจอเท่านั้น · ผู้ใช้ขอออกแบบใหม่ 14 ต.ค. 69 — เดิมเทาทึบ + "Drag here" + อีโมจิกรอบรูป)
 * พื้นเทาฟ้าไล่เฉด · ตรงกลาง = วงกลมขาวไอคอนรูปภาพ (วาดเส้นเอง ไม่พึ่งอีโมจิของเครื่อง) + คำไทย
 */
function emptySlotBox(ctx: CanvasRenderingContext2D, k: number, r: Rect) {
  ctx.save();
  const g = ctx.createLinearGradient(r.x * k, r.y * k, r.x * k, (r.y + r.h) * k);
  g.addColorStop(0, "#eef2f7");
  g.addColorStop(1, "#dfe6ee");
  ctx.fillStyle = g;
  ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
  // ไม่มีเส้นประในช่อง (ผู้ใช้สั่งเอาออก 14 ต.ค. 69 — สับสนกับเส้นตัด/ขอบปลอดภัย และทับแถวรูเจาะ)
  ctx.restore();
}

function placeholder(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, size: number) {
  ctx.save();
  const R = size * 1.55; // วงกลมไอคอน
  const cy = y - size * 1.1;
  // วงกลมขาว + เงาอ่อน
  ctx.shadowColor = "rgba(15,23,42,.14)";
  ctx.shadowBlur = size * 0.6 * k;
  ctx.shadowOffsetY = size * 0.12 * k;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x * k, cy * k, R * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  // ไอคอนรูปภาพ (กรอบมุมมน · ภูเขา · ดวงอาทิตย์) สีฟ้า
  const s = R * 0.95;
  ctx.strokeStyle = "#0284c7";
  ctx.fillStyle = "#0284c7";
  ctx.lineWidth = Math.max(1, s * 0.09 * k);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  roundRect(ctx, (x - s * 0.55) * k, (cy - s * 0.42) * k, s * 1.1 * k, s * 0.84 * k, s * 0.14 * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo((x - s * 0.55) * k, (cy + s * 0.3) * k);
  ctx.lineTo((x - s * 0.2) * k, (cy - s * 0.02) * k);
  ctx.lineTo((x + s * 0.08) * k, (cy + s * 0.24) * k);
  ctx.lineTo((x + s * 0.25) * k, (cy + s * 0.1) * k);
  ctx.lineTo((x + s * 0.55) * k, (cy + s * 0.38) * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc((x + s * 0.24) * k, (cy - s * 0.17) * k, s * 0.09 * k, 0, Math.PI * 2);
  ctx.fill();
  // ป้าย ＋ มุมขวาล่างของวงกลม
  const px = x + R * 0.72;
  const py = cy + R * 0.72;
  const pr = R * 0.36;
  ctx.fillStyle = "#0284c7";
  ctx.beginPath();
  ctx.arc(px * k, py * k, pr * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, pr * 0.28 * k);
  ctx.beginPath();
  ctx.moveTo((px - pr * 0.45) * k, py * k);
  ctx.lineTo((px + pr * 0.45) * k, py * k);
  ctx.moveTo(px * k, (py - pr * 0.45) * k);
  ctx.lineTo(px * k, (py + pr * 0.45) * k);
  ctx.stroke();
  // ข้อความ
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#334155";
  ctx.font = `600 ${size * 0.85 * k}px ${fontFamilyOf("prompt")}`;
  ctx.fillText("ลากรูปมาวางที่นี่", x * k, (cy + R + size * 1.15) * k);
  ctx.fillStyle = "#64748b";
  ctx.font = `400 ${size * 0.6 * k}px ${fontFamilyOf("prompt")}`;
  ctx.fillText("หรือแตะเพื่อเลือกรูป", x * k, (cy + R + size * 2.15) * k);
  ctx.restore();
}

/**
 * 🎨 จำนวนลายของแบบปฏิทิน 1 ชุด (ใช้คิดค่าคละลายตามกติกาสินค้า)
 * ลายเดียว = 1 · คละลาย = จำนวนรูปที่อัปไว้ในคลังของแบบนี้ (ผู้ใช้สั่ง 13 ต.ค. 69 "คำนวณจากรูปที่อัปไว้")
 * ⚠️ เดิมนับเฉพาะรูปที่วางอยู่ในใบ → รูปที่ถูกเปลี่ยนออก/ยังไม่ได้วาง หลุดจากการนับ ป้าย "คละ 4 ลาย" แต่คลังมี 6 รูป
 * ไม่เกินจำนวนใบที่แยกแบบ · ยังไม่มีรูป = 1 · photos ไม่ส่งมา (แบบเก่า) = นับรูปที่ใช้จริงแทน
 */
export function calDesignCount(d: CalDesign | undefined, photos?: number, format?: string): number {
  if (!d) return 1;
  /**
   * 🖼 งานหลายหน้า (ปฏิทินรายเดือน/ตั้งโต๊ะ — ไม่ใช่ชุดหลายใบ) = นับลายตามรูปที่ใช้จริงทุกหน้า (ผู้ใช้สั่ง 13 ต.ค. 69
   * "เกิน 4 ลาย คิดเพิ่มลายละ 5 บาท เหมือนปฏิทินโฟโต้การ์ด" — ค่าคละตาม mixRule ของสินค้า) · หน้าที่ยืมรูปปกไม่นับเพิ่ม
   */
  if (format) {
    const f = calFormat(format);
    if ((f.cards ?? 1) <= 1 && f.pages.filter((p) => p.photo).length > 1) {
      const used = new Set<number>();
      for (const o of Object.values(d.photos)) if (o.src >= 0) used.add(o.src);
      for (const e of d.elements ?? []) if (e.kind === "photo" && e.src != null && e.src >= 0) used.add(e.src);
      return Math.max(1, used.size);
    }
  }
  if (!(d.mix || d.custom?.length)) return 1;
  let n = photos;
  if (n == null) {
    const used = new Set<number>();
    for (const o of Object.values(d.photos)) if (o.src >= 0) used.add(o.src);
    for (const e of d.elements ?? []) if (e.kind === "photo" && e.src != null && e.src >= 0) used.add(e.src);
    n = used.size;
  }
  return Math.max(1, Math.min(n, (d.custom?.length ?? 0) + 1));
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
    b.parts && Object.values(b.parts).some((x) => x && Object.keys(x).length) ? "ปรับตัวอักษรแยกส่วน" : "",
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

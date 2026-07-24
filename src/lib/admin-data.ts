export type OrderStatus =
  | "รอชำระเงิน"
  | "รอตรวจสอบ"
  | "ชำระแล้ว"
  | "รอตรวจแบบ"
  | "แก้ไขแบบ"
  | "อนุมัติแบบ"
  | "กำลังผลิต"
  | "จัดส่งแล้ว"
  | "เสร็จสิ้น"
  | "ยกเลิก";

export const ORDER_STATUSES: OrderStatus[] = [
  "รอชำระเงิน",
  "รอตรวจสอบ",
  "ชำระแล้ว",
  "รอตรวจแบบ",
  "แก้ไขแบบ",
  "อนุมัติแบบ",
  "กำลังผลิต",
  "จัดส่งแล้ว",
  "เสร็จสิ้น",
  "ยกเลิก",
];

/**
 * สีสถานะ — ไล่ตามลำดับงาน เหลือง→ส้ม→เขียว→ม่วง→แดง→เทอร์ควอยซ์→คราม→ฟ้า→เทา
 * ⚠️ ห้ามใช้ ramp "amber" ที่นี่ เพราะถูกรีแมปเป็นสีฟ้าแบรนด์ (globals.css)
 *    ถ้าใช้จะกลืนกับ sky/blue จนแยกสถานะไม่ออก
 */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  รอชำระเงิน: "bg-yellow-50 text-yellow-700 ring-yellow-200/70",
  รอตรวจสอบ: "bg-orange-50 text-orange-700 ring-orange-200/70",
  ชำระแล้ว: "bg-green-50 text-green-700 ring-green-200/70",
  รอตรวจแบบ: "bg-violet-50 text-violet-700 ring-violet-200/70",
  แก้ไขแบบ: "bg-rose-50 text-rose-700 ring-rose-200/70",
  อนุมัติแบบ: "bg-teal-50 text-teal-700 ring-teal-200/70",
  กำลังผลิต: "bg-indigo-50 text-indigo-700 ring-indigo-200/70",
  จัดส่งแล้ว: "bg-sky-50 text-sky-700 ring-sky-200/70",
  เสร็จสิ้น: "bg-slate-200 text-slate-700 ring-slate-300/70",
  ยกเลิก: "bg-stone-100 text-stone-400 ring-stone-200/70",
};

/** ขั้นตอนของออเดอร์ที่ลูกค้า/ทีมงานเข้าใจง่าย (ไม่ใช่สถานะดิบ) */
export const ORDER_STEPS = ["สั่งซื้อ", "ชำระเงิน", "แบบงาน", "ผลิต", "จัดส่ง"] as const;

/** สถานะ → อยู่ขั้นที่เท่าไหร่ (ขั้นก่อนหน้า = ผ่านแล้ว) · 5 = จบครบ · -1 = ยกเลิก */
export const STEP_OF: Record<OrderStatus, number> = {
  รอชำระเงิน: 1,
  รอตรวจสอบ: 1,
  ชำระแล้ว: 2,
  รอตรวจแบบ: 2,
  แก้ไขแบบ: 2,
  อนุมัติแบบ: 3,
  กำลังผลิต: 3,
  จัดส่งแล้ว: 4,
  เสร็จสิ้น: 5,
  ยกเลิก: -1,
};

/** สถานะการตรวจแบบของสินค้าแต่ละรายการ */
export type ProofStatus = "รอตรวจ" | "อนุมัติ" | "ขอแก้ไข";

export const PROOF_STYLES: Record<ProofStatus, string> = {
  รอตรวจ: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200/70",
  อนุมัติ: "bg-teal-50 text-teal-700 ring-teal-200/70",
  ขอแก้ไข: "bg-rose-50 text-rose-700 ring-rose-200/70",
};

/** 1 บรรทัดในประวัติการทำงานของออเดอร์ (audit log) */
export interface LogEntry {
  /** ISO timestamp */
  at: string;
  /** ใครทำ — "ลูกค้า" | "แอดมิน" | "กราฟฟิก" | "ระบบ" */
  by: string;
  /** สิ่งที่ทำ เช่น "อัปโหลดแบบ" */
  action: string;
  /** รายละเอียดเพิ่มเติม เช่น ชื่อรายการ / คอมเมนต์ลูกค้า */
  detail?: string;
}

/** ผลตรวจนับของพนักงานแพ็ค ต่อภาพแบบงาน 1 รูป */
export interface PackCheck {
  status: "ครบ" | "ไม่ครบ";
  /** จำนวนที่นับได้จริง — กรอกเมื่อเลือก "ไม่ครบ" */
  got?: number;
  /** ใครตรวจ */
  by: string;
  /** เวลาที่ตรวจ (ISO) */
  at: string;
}

/** ภาพแบบงาน 1 รูป ที่กราฟฟิกอัปโหลดให้ลูกค้าตรวจ */
export interface Proof {
  url: string;
  /** จำนวนชิ้นที่ใช้แบบรูปนี้ (กราฟฟิกกรอก) */
  qty?: number;
  /** รายละเอียดเพิ่มเติมของรูปนี้ เช่น "ลายด้านหน้า" (กราฟฟิกกรอก) */
  note?: string;
  /** เวลาอัปโหลด (ISO) */
  at: string;
  /** ผลตรวจนับของพนักงานแพ็ค — ต้องมีครบทุกรูปก่อนยิงเลขพัสดุ */
  pack?: PackCheck;
}

/** สีของหมายเหตุบนใบงาน (ชุดสำเร็จรูป) */
export type NoteColor = "black" | "red" | "blue" | "green" | "orange" | "gray";
/** ขนาดฟอนต์ของหมายเหตุ (ชุดสำเร็จรูป) */
export type NoteSize = "sm" | "base" | "lg" | "xl";
/** น้ำหนักฟอนต์ของหมายเหตุ */
export type NoteWeight = "thin" | "normal" | "bold";

/**
 * หมายเหตุใบงานเก็บเป็น "rich text HTML" — แอดมินเลือกเฉพาะคำที่ต้องการแล้วเปลี่ยนสี/ขนาด/น้ำหนักได้
 * (span ที่มี inline style: color / font-size / font-weight เท่านั้น · ผ่านการ sanitize ก่อนบันทึก)
 */

/** สีสำเร็จรูป → ป้ายไทย + ค่า hex (ใช้ inline style ให้พิมพ์ออกสีตรง) */
export const NOTE_COLORS: Record<NoteColor, { label: string; hex: string }> = {
  black: { label: "ดำ", hex: "#1e293b" },
  red: { label: "แดง", hex: "#dc2626" },
  blue: { label: "น้ำเงิน", hex: "#2563eb" },
  green: { label: "เขียว", hex: "#16a34a" },
  orange: { label: "ส้ม", hex: "#ea580c" },
  gray: { label: "เทา", hex: "#64748b" },
};

/** ขนาดสำเร็จรูป → ป้ายไทย + px */
export const NOTE_SIZES: Record<NoteSize, { label: string; px: number }> = {
  sm: { label: "เล็ก", px: 12 },
  base: { label: "ปกติ", px: 14 },
  lg: { label: "ใหญ่", px: 18 },
  xl: { label: "ใหญ่มาก", px: 24 },
};

/** น้ำหนักฟอนต์ → ป้ายไทย + ค่า CSS */
export const NOTE_WEIGHTS: Record<NoteWeight, { label: string; css: number }> = {
  thin: { label: "บาง", css: 300 },
  normal: { label: "ปกติ", css: 400 },
  bold: { label: "หนา", css: 700 },
};

/** มีข้อความจริงไหม (ตัด tag/ช่องว่างออก) — ใช้ตัดสินใจว่าจะโชว์บนใบงานไหม */
export function noteHasText(html?: string): boolean {
  return !!html && html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

export interface OrderItem {
  productId: string;
  name: string;
  /** ตัวเลือกแบบข้อความ (แสดงผล) เช่น "ขนาด: M · สี: ขาว" */
  selections: string;
  /** ตัวเลือกแบบมีโครงสร้าง — ใช้ปุ่ม "สั่งซ้ำ" ดึงกลับเข้าตะกร้าได้ตรง (ออเดอร์เก่าไม่มี) */
  sel?: Record<string, string>;
  qty: number;
  unitPrice: number;
  /** ภาพแบบงาน (proof) — หลายรูปได้ แต่ละรูประบุจำนวน/รายละเอียดของตัวเอง */
  proofs?: Proof[];
  /** @deprecated รูปแบบเดิม (รูปเดียว) — อ่านผ่าน proofsOf() เพื่อรองรับออเดอร์เก่า */
  proofUrl?: string;
  /** สถานะการตรวจแบบ "ของทั้งรายการ" (ลูกค้าอนุมัติ/ขอแก้ทีเดียวทั้งรายการ) */
  proofStatus?: ProofStatus;
  /** คอมเมนต์จากลูกค้าเมื่อกด "ขอแก้ไข" */
  proofNote?: string;
  /** เวลาที่อัปโหลด/อัปเดตแบบล่าสุด (ISO) */
  proofUpdatedAt?: string;
  /** พนักงานแพ็คยืนยันว่าอ่านรายละเอียดรายการนี้แล้ว — ต้องมีก่อนยิงเลขพัสดุ */
  noteAck?: { by: string; at: string };
  /** กราฟฟิกยืนยันว่าอ่านรายละเอียดรายการนี้แล้ว (ก่อนทำแบบงาน) — audit trail */
  graphicAck?: { by: string; at: string };
  /** หมายเหตุที่แอดมินพิมพ์ลงใบงาน (ตรงตำแหน่งรายการนี้) — rich text HTML (สี/ขนาด/น้ำหนักต่อคำ) */
  adminNote?: string;
}

export interface Order {
  id: string;
  customer: string;
  phone: string;
  address: string;
  date: string;
  payment: "PromptPay" | "บัตรเครดิต" | "โอนธนาคาร" | "เก็บเงินปลายทาง";
  shipping: "ส่งธรรมดา" | "ส่งด่วน";
  shippingCost: number;
  status: OrderStatus;
  tracking?: string;
  note?: string;
  items: OrderItem[];
  /** เชื่อมกับสมาชิก (ถ้าล็อกอินตอนสั่ง) — ไม่มี = สั่งแบบ guest */
  customerId?: string;
  email?: string;
  /**
   * หลักฐานการโอน — สำหรับออเดอร์ใหม่จะเป็น signed URL ชั่วคราวที่ฝั่งเซิร์ฟเวอร์เซ็นให้ตอนแอดมินดึงข้อมูล
   * (ออเดอร์เก่าเก็บเป็น public URL ถาวร) · มีค่า = ลูกค้าแจ้งโอนแล้ว
   */
  slipUrl?: string;
  /** path ของสลิปใน bucket ส่วนตัว (ออเดอร์ใหม่) — แอดมินเปิดผ่าน signed URL เท่านั้น กัน URL หลุด */
  slipPath?: string;
  /** เวลาที่ลูกค้ากดแจ้งโอน (ISO string) */
  paidReportedAt?: string;
  /** เวลาที่แอดมินปริ้นใบงานครั้งแรก (ISO) — มีค่า = ล็อกที่อยู่ ลูกค้าแก้ไม่ได้แล้ว */
  printedAt?: string;
  /** ช่วงวันที่จัดส่ง (แอดมินระบุ) — โชว์บนใบงาน · เก็บเป็น yyyy-mm-dd */
  shipDate?: { from?: string; to?: string };
  /** หมายเหตุท้ายบิล (แอดมินพิมพ์ลงใบงาน) — rich text HTML (สี/ขนาด/น้ำหนักต่อคำ) */
  billNote?: string;
  /** กุญแจลับต่อออเดอร์ (สุ่มตอนสร้าง) — ใช้ยืนยันสิทธิ์ตอนแจ้งโอน/ดูแบบ (public endpoint) */
  key?: string;
  /**
   * ยอดที่ลูกค้าแจ้งโอนไปแล้ว (บันทึกตอนกดแจ้งโอน = ยอดรวม ณ ตอนนั้น)
   * ใช้คำนวณ "ยอดค้างชำระ" เมื่อลูกค้าสั่งเพิ่มในออเดอร์เดิม
   */
  paidTotal?: number;
  /** ประวัติการทำงานของออเดอร์ (เก่า→ใหม่) — ใครทำอะไรเมื่อไหร่ */
  log?: LogEntry[];
  /** ส่วนลด (ระดับสมาชิก หรือ คูปอง) คิดฝั่งเซิร์ฟเวอร์ตอนสร้างออเดอร์ — หักออกจากยอดรวม */
  discount?: { label: string; amount: number; couponCode?: string };
}

/** ราคาสินค้ารวม (ก่อนค่าส่ง/ส่วนลด) */
export function orderSubtotal(o: Order): number {
  return o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
}

export function orderTotal(o: Order): number {
  return Math.max(0, orderSubtotal(o) + o.shippingCost - (o.discount?.amount ?? 0));
}

/** ยอดที่ลูกค้ายังค้างชำระ (มากกว่า 0 = ต้องโอนเพิ่ม เช่น หลังสั่งเพิ่มในออเดอร์เดิม) */
export function orderBalance(o: Order): number {
  return Math.max(0, orderTotal(o) - (o.paidTotal ?? 0));
}

/** รูปแบบงานของรายการ — รองรับออเดอร์เก่าที่เก็บเป็น proofUrl รูปเดียว */
export function proofsOf(item: OrderItem): Proof[] {
  if (item.proofs?.length) return item.proofs;
  return item.proofUrl ? [{ url: item.proofUrl, at: item.proofUpdatedAt ?? "" }] : [];
}

/** ผลตรวจ "พร้อมส่งหรือยัง" ของพนักงานแพ็ค */
export interface PackGate {
  /** ผ่านครบทุกเงื่อนไข → ยิงเลขพัสดุได้ */
  ready: boolean;
  /** รูปแบบงานที่ยังไม่ได้กดตรวจนับ */
  uncounted: { item: string; index: number }[];
  /** รายการที่ยังไม่ได้กดยืนยันว่าอ่านรายละเอียดแล้ว */
  unread: string[];
  /** รูปที่พนักงานกด "ไม่ครบ" — ของขาด ห้ามส่ง */
  short: { item: string; got: number; need?: number }[];
}

/**
 * ตรวจว่าออเดอร์ผ่านขั้นตอนแพ็คครบหรือยัง
 * ใช้ทั้งหน้าออเดอร์ (แสดงความคืบหน้า) และหน้ายิงเลขพัสดุ (บล็อกไม่ให้ยิง)
 */
export function packGate(order: Order): PackGate {
  const uncounted: PackGate["uncounted"] = [];
  const unread: string[] = [];
  const short: PackGate["short"] = [];

  order.items.forEach((it) => {
    if (!it.noteAck) unread.push(it.name);
    proofsOf(it).forEach((p, j) => {
      if (!p.pack) uncounted.push({ item: it.name, index: j + 1 });
      else if (p.pack.status === "ไม่ครบ") short.push({ item: it.name, got: p.pack.got ?? 0, need: p.qty });
    });
  });

  return { ready: !uncounted.length && !unread.length && !short.length, uncounted, unread, short };
}

/** เพิ่ม 1 บรรทัดลงประวัติออเดอร์ (คืน Order ใหม่ ไม่แก้ของเดิม) */
export function withLog(order: Order, by: string, action: string, detail?: string): Order {
  const entry: LogEntry = { at: new Date().toISOString(), by, action, ...(detail ? { detail } : {}) };
  return { ...order, log: [...(order.log ?? []), entry] };
}

/** ออเดอร์ตัวอย่างสำหรับเดโมหลังบ้าน — เฟสถัดไปจะดึงจากฐานข้อมูลจริง */
export const MOCK_ORDERS: Order[] = [
  {
    id: "OD-2607-0012",
    customer: "คุณน้ำหวาน ใจดี",
    phone: "081-234-5678",
    address: "88/12 หมู่บ้านสุขใจ ถ.ลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900",
    date: "20 ก.ค. 2569 14:22",
    payment: "PromptPay",
    shipping: "ส่งด่วน",
    shippingCost: 90,
    status: "รอชำระเงิน",
    items: [
      { productId: "tshirt-print", name: "เสื้อยืดพิมพ์ลาย", selections: "ขนาด: L · สีเสื้อ: ดำ · ตำแหน่งพิมพ์: อกหน้า", qty: 2, unitPrice: 369 },
      { productId: "sticker-diecut", name: "สติกเกอร์ไดคัทกันน้ำ", selections: "ขนาด: 8 ซม. · ผิวเคลือบ: ด้าน", qty: 5, unitPrice: 89 },
    ],
  },
  {
    id: "OD-2607-0011",
    customer: "คุณโบว์ รักสวย",
    phone: "089-876-5432",
    address: "45 ซ.สุขุมวิท 62 แขวงพระโขนงใต้ เขตพระโขนง กรุงเทพฯ 10260",
    date: "20 ก.ค. 2569 11:05",
    payment: "บัตรเครดิต",
    shipping: "ส่งธรรมดา",
    shippingCost: 0,
    status: "ชำระแล้ว",
    note: "ลูกค้าขอตรวจแบบก่อนพิมพ์",
    items: [
      { productId: "canvas-frame", name: "กรอบรูปผ้าใบแคนวาส", selections: "ขนาด: 16×20 นิ้ว · ขอบข้าง: ลายต่อเนื่อง", qty: 1, unitPrice: 859 },
      { productId: "pillow-print", name: "หมอนอิงพิมพ์ลาย", selections: "ขนาด: 45×45 ซม.", qty: 2, unitPrice: 389 },
    ],
  },
  {
    id: "OD-2607-0010",
    customer: "คุณเฟิร์น กรีนดี",
    phone: "062-345-6789",
    address: "199 หมู่ 4 ต.สันทราย อ.เมือง จ.เชียงใหม่ 50210",
    date: "19 ก.ค. 2569 16:40",
    payment: "โอนธนาคาร",
    shipping: "ส่งธรรมดา",
    shippingCost: 50,
    status: "กำลังผลิต",
    items: [
      { productId: "mug-ceramic", name: "แก้วเซรามิกพิมพ์ลาย", selections: "ขนาด: 11 oz · สีแก้ว: ขอบชมพู", qty: 4, unitPrice: 279 },
    ],
  },
  {
    id: "OD-2607-0009",
    customer: "คุณต้นกล้า พฤกษา",
    phone: "095-111-2233",
    address: "7/77 คอนโดริมน้ำ ถ.เจริญนคร เขตคลองสาน กรุงเทพฯ 10600",
    date: "19 ก.ค. 2569 10:18",
    payment: "เก็บเงินปลายทาง",
    shipping: "ส่งด่วน",
    shippingCost: 90,
    status: "กำลังผลิต",
    note: "กล่องของขวัญ + การ์ดอวยพร",
    items: [
      { productId: "blanket-print", name: "ผ้าห่มพิมพ์ลาย", selections: "ขนาด: 130×180 ซม.", qty: 1, unitPrice: 899 },
      { productId: "keychain-acrylic", name: "พวงกุญแจอะคริลิก", selections: "ขนาด: 6 ซม. · ห่วง: สายคล้อง", qty: 3, unitPrice: 114 },
    ],
  },
  {
    id: "OD-2607-0008",
    customer: "คุณมายด์ สดใส",
    phone: "084-999-8877",
    address: "23 ถ.นิมมานเหมินท์ ซ.9 ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
    date: "18 ก.ค. 2569 15:02",
    payment: "PromptPay",
    shipping: "ส่งธรรมดา",
    shippingCost: 0,
    status: "จัดส่งแล้ว",
    tracking: "TH0139XK8Q2A",
    items: [
      { productId: "phone-case", name: "เคสมือถือพิมพ์ลาย", selections: "รุ่น: iPhone 16 Pro · วัสดุ: แข็งผิวด้าน", qty: 2, unitPrice: 349 },
      { productId: "grip-holder", name: "กริปติดมือถือ", selections: "รูปทรง: หัวใจ", qty: 2, unitPrice: 169 },
    ],
  },
  {
    id: "OD-2607-0007",
    customer: "คุณภูผา มั่นคง",
    phone: "088-555-4433",
    address: "301 หมู่ 2 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000",
    date: "18 ก.ค. 2569 09:47",
    payment: "โอนธนาคาร",
    shipping: "ส่งด่วน",
    shippingCost: 0,
    status: "จัดส่งแล้ว",
    tracking: "TH0139XJ5M7B",
    items: [
      { productId: "jigsaw-custom", name: "จิ๊กซอว์พิมพ์ลาย", selections: "จำนวนชิ้น: 500 ชิ้น", qty: 2, unitPrice: 539 },
    ],
  },
  {
    id: "OD-2607-0006",
    customer: "คุณแพรวา แสนหวาน",
    phone: "091-222-3344",
    address: "12/3 ถ.ราชดำเนิน ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    date: "17 ก.ค. 2569 13:30",
    payment: "บัตรเครดิต",
    shipping: "ส่งธรรมดา",
    shippingCost: 50,
    status: "เสร็จสิ้น",
    tracking: "TH0139XH2C9D",
    items: [
      { productId: "tote-bag", name: "กระเป๋าผ้าแคนวาส", selections: "ขนาด: 35×40 ซม. · สีผ้า: ครีมธรรมชาติ", qty: 1, unitPrice: 299 },
      { productId: "pin-button", name: "เข็มกลัดพิมพ์ลาย", selections: "ขนาด: 4.4 ซม.", qty: 10, unitPrice: 49 },
    ],
  },
  {
    id: "OD-2607-0005",
    customer: "คุณกันต์ ธาราทิพย์",
    phone: "086-777-6655",
    address: "55 ซ.เพชรเกษม 48 แขวงบางด้วน เขตภาษีเจริญ กรุงเทพฯ 10160",
    date: "17 ก.ค. 2569 10:11",
    payment: "PromptPay",
    shipping: "ส่งธรรมดา",
    shippingCost: 50,
    status: "ยกเลิก",
    note: "ลูกค้าขอยกเลิก — ไฟล์ลายความละเอียดไม่พอและไม่มีไฟล์ใหม่",
    items: [
      { productId: "mirror-print", name: "กระจกพกพาพิมพ์ลาย", selections: "รูปทรง: กลม", qty: 2, unitPrice: 129 },
    ],
  },
];

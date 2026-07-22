export type OrderStatus =
  | "รอชำระเงิน"
  | "รอตรวจสอบ"
  | "ชำระแล้ว"
  | "กำลังผลิต"
  | "จัดส่งแล้ว"
  | "เสร็จสิ้น"
  | "ยกเลิก";

export const ORDER_STATUSES: OrderStatus[] = [
  "รอชำระเงิน",
  "รอตรวจสอบ",
  "ชำระแล้ว",
  "กำลังผลิต",
  "จัดส่งแล้ว",
  "เสร็จสิ้น",
  "ยกเลิก",
];

export const STATUS_STYLES: Record<OrderStatus, string> = {
  รอชำระเงิน: "bg-amber-50 text-amber-700 ring-amber-200/70",
  รอตรวจสอบ: "bg-orange-50 text-orange-700 ring-orange-200/70",
  ชำระแล้ว: "bg-sky-50 text-sky-700 ring-sky-200/70",
  กำลังผลิต: "bg-violet-50 text-violet-700 ring-violet-200/70",
  จัดส่งแล้ว: "bg-blue-50 text-blue-700 ring-blue-200/70",
  เสร็จสิ้น: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  ยกเลิก: "bg-slate-100 text-slate-500 ring-slate-200/70",
};

export interface OrderItem {
  productId: string;
  name: string;
  selections: string;
  qty: number;
  unitPrice: number;
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
  /** หลักฐานการโอน — URL รูปสลิปที่ลูกค้าอัปโหลด (มี = ลูกค้าแจ้งโอนแล้ว) */
  slipUrl?: string;
  /** เวลาที่ลูกค้ากดแจ้งโอน (ISO string) */
  paidReportedAt?: string;
  /** กุญแจลับต่อออเดอร์ (สุ่มตอนสร้าง) — ใช้ยืนยันสิทธิ์ตอนแจ้งโอน (public endpoint) · ไม่เปิดเผยใน URL */
  key?: string;
}

export function orderTotal(o: Order): number {
  return o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) + o.shippingCost;
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

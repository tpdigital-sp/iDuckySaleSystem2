import type { OrderGift } from "./gifts";

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

/**
 * สถานะ → กำลังอยู่ขั้นไหนของ ORDER_STEPS (index เริ่ม 0 · ขั้นก่อนหน้า = ผ่านแล้ว) · 5 = จบครบ · -1 = ยกเลิก
 * ⚠️ "อนุมัติแบบ" = 2 (ยังอยู่ขั้นแบบงาน) ไม่ใช่ 3 — แบบเพิ่งผ่าน ยังไม่เข้าไลน์ผลิต
 *    ถ้าใส่ 3 แถบจะเดินไปขั้น "ผลิต" ทั้งที่ยังไม่ได้ปริ้นใบงานด้วยซ้ำ
 */
export const STEP_OF: Record<OrderStatus, number> = {
  รอชำระเงิน: 1,
  รอตรวจสอบ: 1,
  ชำระแล้ว: 2,
  รอตรวจแบบ: 2,
  แก้ไขแบบ: 2,
  อนุมัติแบบ: 2,
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

/**
 * 🚚 แบ่งส่ง — พัสดุที่ส่งออกไปแล้ว "บางส่วน" ก่อนรอบสุดท้าย (รอบสุดท้ายยังใช้ Order.tracking + สถานะ "จัดส่งแล้ว" เหมือนเดิม)
 * เก็บว่ารอบนี้เอารูปแบบงานไหนไปบ้าง (ตำแหน่ง item/proof + จำนวนบนรูป) จะได้รู้ว่าเหลือรูปไหนยังไม่ส่ง
 * ลูกค้าเห็นเลขพัสดุทุกรอบในหน้าเช็คออเดอร์ · สถานีแพ็คยังเห็นใบค้างพร้อมป้าย "ส่งแล้ว a/b"
 * ⚠️ รอบที่เอารูปที่เหลือไปทั้งหมด = รอบสุดท้าย ต้องยิงที่ช่องเลขพัสดุปกติ ไม่ใช่ตรงนี้ (ไม่งั้นใบไม่ปิด)
 */
export interface Shipment {
  tracking: string;
  /** เวลาที่ยิง (ISO) */
  at: string;
  /** ใครยิง */
  by: string;
  /** รูปแบบงานที่ไปกับรอบนี้ — item = ตำแหน่งใน order.items · proof = ตำแหน่งใน proofsOf(item) · url ไว้จับคู่ถ้าลำดับรูปเปลี่ยน */
  proofs: { item: number; proof: number; url?: string; qty?: number; unit?: string; itemName?: string }[];
  /** หมายเหตุรอบนี้ เช่น "ลูกค้าขอ 22 ใบก่อนงานอีเวนต์" */
  note?: string;
}

/**
 * 📋 แผนแบ่งส่ง 1 รอบ — แอดมินระบุที่หน้าออเดอร์ว่ารูปไหนต้องส่งก่อน (ฝ่ายแพ็คไม่รู้เอง ทำตามแผน)
 * รอบที่ n ของแผน จับคู่กับ Order.shipments[n-1] เมื่อฝ่ายแพ็คยิงเลขแล้ว · รอบสุดท้าย (ที่เหลือทั้งหมด) ไม่ต้องระบุ
 */
export interface ShipPlanRound {
  proofs: Shipment["proofs"];
  /** ส่งภายในวันไหน (YYYY-MM-DD) — ขึ้นบนใบงาน/โหมดแพ็ค */
  dueDate?: string;
  note?: string;
  by: string;
  at: string;
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

/** สถานะ "ของมาถึงโต๊ะแพ็คหรือยัง" ของรายการ 1 รายการ */
export type PackArrivalStatus = "ยังไม่มา" | "มาไม่ครบ" | "มาครบ";

/**
 * 📦 ติดตามของยังไม่มา / ของยังไม่ครบ ต่อรายการ (ฝ่ายแพ็คปัก)
 * ต่างจาก PackCheck (ตรวจนับ "ต่อรูปแบบงาน" ตอนของอยู่ตรงหน้าแล้ว) — อันนี้คือของ "ยังไม่ถึงมือ" เลย
 * เช่น รอโรงงานส่ง / รอผลิตอีกล็อต / มาแค่บางส่วน · ปักแล้วออเดอร์ย้ายไปขั้น "รอของ" ที่สถานีแพ็ค–ส่ง
 * และห้ามยิงเลขพัสดุจนกว่าจะกด "มาครบ" — สถานะ "มาครบ" เก็บไว้เป็นประวัติ ไม่ลบทิ้ง
 */
export interface PackArrival {
  status: PackArrivalStatus;
  /** มาแล้วกี่ชิ้น (กรอกเมื่อ "มาไม่ครบ") — หน่วยเดียวกับ qty ของรายการ */
  got?: number;
  /** คาดว่าของจะมาวันไหน (YYYY-MM-DD) — เลยวันนี้แล้วยังไม่มา = ป้ายแดงที่สถานีแพ็ค */
  expectedAt?: string;
  /** รอจากไหน/ติดอะไร เช่น "รอโรงงานหุ้มอะคริลิค" */
  note?: string;
  /** ใครปัก */
  by: string;
  /** เวลาที่ปัก/อัปเดตล่าสุด (ISO) */
  at: string;
  /** เวลาที่ปักครั้งแรกว่ายังไม่มา (ISO) — ไว้บอกว่ารอมากี่วันแล้ว (ไม่รีเซ็ตตอนอัปเดตหมายเหตุ) */
  since?: string;
}

/** ภาพแบบงาน 1 รูป ที่กราฟฟิกอัปโหลดให้ลูกค้าตรวจ */
export interface Proof {
  url: string;
  /** จำนวนที่ใช้แบบรูปนี้ (กราฟฟิกกรอก) — หน่วยตาม unit */
  qty?: number;
  /** หน่วยนับของ qty — งานบางแบบขายเป็นเซ็ต (พวงกุญแจ+การ์ดในไฟล์เดียว) ไม่ใช่ชิ้น · ว่าง = "ชิ้น" */
  unit?: string;
  /** รายละเอียดเพิ่มเติมของรูปนี้ เช่น "ลายด้านหน้า" (กราฟฟิกกรอก) */
  note?: string;
  /** เวลาอัปโหลด (ISO) */
  at: string;
  /** ชื่อคนที่ทำแบบรูปนี้ (กราฟฟิกที่อัป/เปลี่ยนรูปล่าสุด) */
  by?: string;
  /** ผลตรวจนับของพนักงานแพ็ค — ต้องมีครบทุกรูปก่อนยิงเลขพัสดุ */
  pack?: PackCheck;
  /** ผลตรวจของลูกค้า "ต่อรูปนี้" — ไม่มีค่า = ยังไม่ตรวจ · รายการอนุมัติเมื่อครบทุกรูป */
  review?: "อนุมัติ" | "ขอแก้ไข";
  /** คอมเมนต์ของลูกค้าเมื่อขอแก้ไขรูปนี้ */
  reviewNote?: string;
  /** เวลาที่กราฟฟิกเปลี่ยนรูปนี้ "หลังลูกค้าขอแก้" (ISO) — ใช้ขึ้นป้าย "แก้ไขให้แล้ว" ให้ลูกค้าเห็น */
  revisedAt?: string;
  /** คำขอแก้ของลูกค้ารอบก่อน เก็บไว้อ้างอิงหลังแก้เสร็จ */
  revisedFromNote?: string;
}

/** หน่วยนับของแบบงานที่ให้เลือกในหลังบ้าน — ตัวแรกคือค่าเริ่มต้น */
export const PROOF_UNITS = ["ชิ้น", "เซ็ต", "ชุด", "ใบ", "ดวง", "อัน", "ตัว", "แผ่น", "เส้น", "คู่", "เล่ม"] as const;

/** หน่วยนับของรูปแบบงานนี้ (ไม่ได้ตั้ง = "ชิ้น") — ใช้ทุกที่ที่โชว์จำนวนของแบบ ใบงาน/ฝ่ายแพ็ค/หน้าลูกค้าจะได้ตรงกัน */
export function proofUnit(p?: { unit?: string }): string {
  return p?.unit?.trim() || "ชิ้น";
}

/**
 * คำหน่วยที่เขียนต่างกันแต่หมายถึงอันเดียวกัน → คำมาตรฐาน ("เซต"/"set" → "เซ็ต" · "pcs" → "ชิ้น")
 * ร้านสะกด "เซต" กับ "เซ็ต" ปนกันทั้งในสเปคและในหน่วยขาย ถ้าเทียบสตริงดิบจะกลายเป็นคนละหน่วย
 */
export function normalizeUnitWord(raw: string | undefined): string {
  const w = (raw ?? "").trim().toLowerCase();
  if (!w) return "";
  if (w === "เซต" || w === "set" || w === "sets") return "เซ็ต";
  if (w === "pc" || w === "pcs") return "ชิ้น";
  return (raw ?? "").trim();
}

/** คำที่ใช้เรียก "ชิ้นงานย่อย" ในชื่อตัวเลือก (ฝั่งซ้ายของ 20 ใบ/เซ็ต) */
const PIECE_WORDS = "ใบ|ชิ้น|ดวง|แผ่น|อัน|ตัว|เส้น|คู่|ผืน";
/** คำที่ใช้เรียก "หน่วยที่ลูกค้าสั่ง" (ฝั่งขวาของ 20 ใบ/เซ็ต) */
const PACK_WORDS = "เซ็ต|เซต|ชุด|แพ็ค|แพค|แผ่น|กล่อง|ถุง|ม้วน|เล่ม";

/**
 * สั่ง 1 หน่วย ได้ของกี่ชิ้น — อ่านจากชื่อตัวเลือกที่ร้านเขียนไว้เอง
 * เช่น "ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต)" = 1 เซ็ต ได้ 20 ใบ · "40 ชิ้น / แผ่น A3"
 * ทำไมต้องมี: ช่องจำนวนของออเดอร์นับเป็น "เซ็ต/แผ่น" แต่ป้ายจำนวนบนแบบงานนับเป็น "ใบ/ชิ้น"
 *   เอามาเทียบกันตรง ๆ ระบบจะฟ้อง "ไม่ตรง" ทั้งที่ถูกอยู่แล้ว (สั่ง 12 เซ็ต = 240 ใบ = ป้ายบนแบบรวม 240)
 * null = ไม่ได้เขียนไว้ → ถือว่า 1 หน่วย = 1 ชิ้น
 */
export function orderPiecesPerUnit(item: { selections?: string; sel?: Record<string, string> }): { per: number; piece: string; unit: string } | null {
  const re = new RegExp(`(\\d{1,4})\\s*(${PIECE_WORDS})\\s*/\\s*(${PACK_WORDS})(\\s?A\\d)?`);
  // "(1 เซตได้ 10 ชิ้น)" / "1 ชุด = 2 ชิ้น" — สำนวนของเข็มกลัดพลาสติก (ใบเก่าก่อน 10 ก.ย. 69 ยังไม่ได้แช่ unitYield)
  const rePack = new RegExp(`(?:^|\\D)1\\s*(${PACK_WORDS})\\s*(?:ได้|มี|=|ละ)\\s*(\\d{1,4})\\s*(${PIECE_WORDS})`);
  for (const text of [...Object.values(item.sel ?? {}), item.selections ?? ""]) {
    const m = text.match(re);
    const per = Number(m?.[1]);
    if (m && Number.isFinite(per) && per > 1 && per <= 9999) return { per, piece: m[2], unit: (m[3] + (m[4] ?? "")).trim() };
    const p = text.match(rePack);
    const perP = Number(p?.[2]);
    if (p && Number.isFinite(perP) && perP > 1 && perP <= 9999) return { per: perP, piece: p[3], unit: p[1] };
  }
  return null;
}

/** ขายเป็นหน่วยรวมไหม (เซ็ต/ชุด/แผ่น/กล่อง) — จำนวนที่สั่งไม่ใช่จำนวนชิ้นงานตรง ๆ */
export function isPackUnit(unit: string): boolean {
  const u = (unit ?? "").trim();
  return !!u && u !== "ชิ้น" && new RegExp(`^(${PACK_WORDS}|พวง)(\\s|\\(|$)`).test(u);
}

/** จำนวน "ชิ้นจริง" ที่ลูกค้าสั่งของรายการนี้ + ข้อความกางที่มาให้คนตรวจเห็นว่าคูณมาจากไหน */
export function orderedPieces(item: {
  qty: number;
  selections?: string;
  sel?: Record<string, string>;
  unitYield?: { per: number; piece: string; unit: string };
}) {
  // ค่าที่แช่ไว้ตอนสั่ง (อ่านจากสินค้าจริง) มาก่อนเสมอ — แม้ per = 1 ก็ยังมีประโยชน์ เพราะบอกหน่วยขาย ("12 เซ็ต")
  // เดาจากชื่อตัวเลือกไว้ใช้กับออเดอร์เก่าที่ยังไม่มีฟิลด์นี้
  const y = item.unitYield?.per ? item.unitYield : orderPiecesPerUnit(item);
  const pieces = y ? item.qty * y.per : item.qty;
  return {
    /** จำนวนชิ้นจริงที่ต้องผลิต/แพ็ค */
    pieces,
    /** ได้กี่ชิ้นต่อ 1 หน่วยที่สั่ง (1 = ไม่ได้แบ่ง) */
    per: y?.per ?? 1,
    /** คำเรียกชิ้นงานย่อย เช่น "ใบ" */
    piece: y?.piece ?? "ชิ้น",
    /** หน่วยที่ลูกค้าสั่ง เช่น "เซ็ต" (ว่าง = นับเป็นชิ้นอยู่แล้ว) */
    unit: y?.unit ?? "",
    /** "12 เซ็ต × 20 ใบ = 240 ใบ" — ว่างเมื่อยังไม่รู้ว่า 1 หน่วยกี่ชิ้น */
    math: y && y.per > 1 ? `${item.qty} ${y.unit || "หน่วย"} × ${y.per} ${y.piece} = ${pieces} ${y.piece}` : "",
  };
}

/**
 * เทียบ "จำนวนบนแบบงาน" กับ "จำนวนที่ลูกค้าสั่ง" ที่เดียวจบ — ใช้ร่วมกันทั้งหน้าออเดอร์ โหมดแพ็ค และแถบตรวจชื่อไฟล์
 * เทียบได้ 2 ทาง: แบบนับเป็นชิ้น → เทียบกับจำนวนชิ้นจริง · แบบนับเป็นหน่วยเดียวกับที่สั่ง (เซ็ต) → เทียบกับจำนวนที่สั่ง
 * คนละหน่วยกัน/ยังไม่ระบุจำนวน = comparable false (บอกให้รู้เฉย ๆ ไม่ตีว่าผิด)
 */
export function proofQtyCheck(
  item: { qty: number; selections?: string; sel?: Record<string, string>; unitYield?: { per: number; piece: string; unit: string } },
  proofs: Proof[]
) {
  const ord = orderedPieces(item);
  const total = proofs.reduce((s, p) => s + (p.qty ?? 0), 0);
  const units = [...new Set(proofs.filter((p) => p.qty).map((p) => proofUnit(p)))];
  const unit = units.length === 1 ? units[0] : "";
  const asPiece = unit === "ชิ้น" || (ord.per > 1 && unit === ord.piece);
  const asUnit = unit !== "" && unit === ord.unit;
  const comparable = total > 0 && (asPiece || asUnit);
  /*
   * งานขายเป็นเซ็ต/ชุด/แผ่น แต่ยังไม่ได้ตั้งว่า 1 หน่วยกี่ชิ้น (per = 1)
   * ป้ายจำนวนบนแบบรวมแล้วหารจำนวนที่สั่งลงตัวพอดี = แทบแน่นอนว่านั่นคือตัวคูณที่หายไป
   * (สั่ง 12 เซ็ต · แบบรวม 240 ชิ้น → 1 เซ็ต = 20 ชิ้น) — เสนอให้แอดมินกดตั้งค่า แทนที่จะฟ้องว่าผิด
   */
  const packUnit = ord.per <= 1 && isPackUnit(ord.unit);
  const suggestPer =
    packUnit && asPiece && !asUnit && item.qty > 0 && total > item.qty && total % item.qty === 0 ? total / item.qty : 0;
  return {
    ...ord,
    /** จำนวนรวมจากป้ายบนแบบงาน */
    total,
    /** หน่วยของป้ายบนแบบงาน (ว่าง = คละหน่วย) — ทับ ord.unit ตั้งใจ เพราะข้อความส่วนใหญ่พูดถึงหน่วยของแบบ */
    unit,
    /** หน่วยที่ลูกค้าสั่ง เช่น "เซ็ต" (ว่าง = สั่งเป็นชิ้น) — ord.unit ที่ถูกทับไป */
    saleUnit: ord.unit,
    /** จำนวนที่ควรได้ตามที่ลูกค้าสั่ง (หน่วยเดียวกับ unit) */
    target: asPiece ? ord.pieces : asUnit ? item.qty : 0,
    comparable,
    ok: comparable && total === (asPiece ? ord.pieces : item.qty),
    /** ขายเป็นเซ็ต/ชุด/แผ่น แต่ยังไม่รู้ว่า 1 หน่วยกี่ชิ้น */
    packUnit,
    /** ตัวคูณที่ระบบเดาให้จากป้ายบนแบบ (0 = เดาไม่ได้) — ให้แอดมินกดยืนยันแล้วเก็บลงรายการ */
    suggestPer,
    /** ต้องให้แอดมินตั้ง "1 หน่วยกี่ชิ้น" ไหม — ถามเฉพาะตอนตัวเลขไม่ตรงจริง ๆ (ตรงอยู่แล้ว = ไม่กวน) */
    needPerUnit: packUnit && comparable && total !== item.qty,
    /** ข้อความ "ลูกค้าสั่ง …" ที่กางที่มาให้เห็น เช่น "12 เซ็ต × 20 ใบ = 240 ใบ" */
    orderedText: ord.per > 1 && !asUnit ? ord.math : `${item.qty} ${ord.unit || "ชิ้น"}`,
  };
}

/** บรรทัดประวัติที่หมายถึง "มีคนอัป/เปลี่ยนแบบงาน" — ใช้ย้อนหาคนทำแบบของรูปเก่าที่ยังไม่มี proof.by */
const PROOF_LOG_ACTIONS = ["อัปโหลดแบบ", "เปลี่ยนรูปแบบงาน", "ส่งแบบให้ลูกค้าตรวจ", "อัปแบบของแถม"];

/**
 * ชื่อที่ไม่ใช่ "คน" — ชื่อแผนก/ระบบที่ระบบเก่าใส่ไว้แทนตอนไม่รู้ว่าใครทำ
 * ขึ้นเป็นชื่อคนทำไม่ได้ (พนักงานจริงใช้ชื่อเล่นตาม employees2) → นับเป็น "ไม่ระบุคนทำ"
 */
const GENERIC_BY = new Set(["กราฟฟิก", "กราฟิก", "แอดมิน", "ระบบ", "ลูกค้า"]);

/**
 * ใครเป็นคนทำแบบรูปนี้
 * รูปที่อัปหลังมีระบบนี้เก็บชื่อไว้ในตัวรูปเลย (proof.by)
 * รูปเก่ากว่านั้นย้อนหาจากประวัติออเดอร์ — บรรทัดอัปแบบที่เวลาใกล้กับรูปที่สุด (ไม่เกิน 2 นาที)
 * คืน undefined เมื่อไม่รู้จริง ๆ (จะได้ไม่เดาชื่อผิดคน)
 */
export function proofBy(order: Order, proof: Proof): string | undefined {
  const own = proof.by?.trim();
  if (own) return GENERIC_BY.has(own) ? undefined : own;
  const t = new Date(proof.at).getTime();
  if (!Number.isFinite(t)) return undefined;
  let best: string | undefined;
  let gap = 120_000;
  for (const e of order.log ?? []) {
    if (!PROOF_LOG_ACTIONS.some((a) => e.action.includes(a))) continue;
    const d = Math.abs(new Date(e.at).getTime() - t);
    if (!Number.isFinite(d) || d > gap) continue;
    gap = d;
    best = e.by?.trim();
  }
  // ชื่อแผนก/ระบบไม่ใช่คนทำแบบ — ปล่อยว่างดีกว่าขึ้นชื่อที่ไม่จริง
  return best && !GENERIC_BY.has(best) ? best : undefined;
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

/**
 * ข้อความธรรมดาหลายบรรทัด → HTML สำหรับ billNote/adminNote (RichNoteEditor เก็บเป็น HTML)
 * escape ทุกตัวอักษรพิเศษ + ขึ้นบรรทัดใหม่เป็น <br> — ใช้ตอนสร้างออเดอร์จากเอกสารภายนอก (FlowAccount) ที่ส่ง "หมายเหตุ" มาเป็น text
 */
export function textToNoteHtml(text: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => esc(l.trimEnd()))
    .join("<br>")
    .replace(/^(<br>)+|(<br>)+$/g, "");
}

/**
 * ♻️ รายการนี้ "ใช้ไฟล์เก่า" — ลูกค้าเคยสั่งลายนี้กับร้านแล้ว ไม่แนบใหม่ ให้กราฟฟิกหยิบไฟล์จากออเดอร์ก่อน
 * ทางเข้า: หน้าสินค้า/ตะกร้า (selections["ใช้ไฟล์เก่า"] → แกะตอน checkout) · ItemAdder · ปุ่มติ๊กในหน้าออเดอร์ · สั่งซ้ำ/เคลม (redo)
 * fromOrderId = เลขออเดอร์เดิมถ้าระบุมา (ลูกค้าพิมพ์เอง ระบบไม่ได้ตรวจว่าเป็นของคนเดียวกัน — แอดมินดูเอง)
 * ⚠️ เป็นแค่ "ป้ายบอก" ไม่ข้ามขั้นตรวจแบบ — กราฟฟิกกดใช้ไฟล์เดิมแล้วส่งตรวจตามปกติ (สเปครอบใหม่อาจต่างจากรอบก่อน)
 */
export interface ReuseArt {
  /** เลขออเดอร์เดิม เช่น OD-260801-1234 (ไม่มี = ลูกค้าบอกแค่ว่าใช้ไฟล์เก่า) */
  fromOrderId?: string;
  /** ข้อความที่ลูกค้า/แอดมินพิมพ์ประกอบ เช่น "ลายเดียวกับรอบก่อน แต่เปลี่ยนขนาด" */
  note?: string;
  by: string;
  at: string;
}

/** ดึงเลขออเดอร์ OD-YYMMDD-NNNN ออกจากข้อความที่ลูกค้าพิมพ์ (พิมพ์ตัวเล็ก/มีคำอื่นปนมาก็เจอ) */
export function orderIdIn(text: string): string | undefined {
  const m = /OD-\d{6}-\d{4}/i.exec(text);
  return m ? m[0].toUpperCase() : undefined;
}

/**
 * แปลงข้อความในช่อง "ใช้ไฟล์เก่า" (จากตะกร้า/หน้าสินค้า) เป็น ReuseArt
 * ว่าง = ไม่ได้ติ๊ก → undefined · มีเลขออเดอร์ → fromOrderId + ส่วนที่เหลือเป็น note
 */
export function parseReuseArt(raw: unknown, by: string, at = new Date().toISOString()): ReuseArt | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  const fromOrderId = orderIdIn(text);
  const note = fromOrderId ? text.replace(/OD-\d{6}-\d{4}/i, "").replace(/^[\s·,\-–—]+|[\s·,\-–—]+$/g, "").trim() : text;
  return { ...(fromOrderId ? { fromOrderId } : {}), ...(note ? { note: note.slice(0, 200) } : {}), by, at };
}

/** ข้อความสั้นสำหรับป้าย ♻️ เช่น "ใช้ไฟล์เก่า · OD-260801-1234" */
export function reuseArtText(r: ReuseArt): string {
  return `ใช้ไฟล์เก่า${r.fromOrderId ? ` · ${r.fromOrderId}` : ""}${r.note ? ` · ${r.note}` : ""}`;
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
  /**
   * ที่มาของราคาที่แอดมินตีให้ (งานสั่งทำ) เช่น "230 + 10 (เพิ่มขนาด) + 50 (สกรีนฐาน) = 290"
   * ⚠️ ลูกค้าเห็นข้อความนี้ในหน้าเช็คออเดอร์ และติดไปกับข้อความแจ้งราคาทางไลน์
   *    (ตั้งใจให้เห็น — ลูกค้าจะได้รู้ว่าราคามาจากไหน ไม่ต้องทักถาม)
   *    บันทึกภายในที่ลูกค้าไม่เห็น ใช้ adminNote (หมายเหตุใบงาน) แทน
   */
  quoteNote?: string;
  /** ส่วนลดเฉพาะรายการนี้ (บาท รวมทั้งบรรทัด) — แอดมินใส่เอง หักออกจากยอดรวม */
  discount?: number;
  /** ส่วนลดเฉพาะรายการนี้เป็น % ของราคาบรรทัด (มีค่า = ใช้ % แทนบาท) */
  discountPct?: number;
  /** ลูกค้าสั่งจำนวนมากเกินเกณฑ์ — ต้องเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้าก่อนเริ่มงาน */
  needStockCheck?: boolean;
  /**
   * ภาพลายที่ลูกค้า/แอดมินแนบตอนสั่ง (ไม่ใช่แบบงานที่กราฟฟิกทำ)
   * เก็บไฟล์ต้นฉบับที่อัปมา — ใช้เป็นแนวทางให้กราฟฟิก · ไฟล์งานพิมพ์จริงดูจากลิงก์/อีเมลใน selections
   */
  artworkUrls?: string[];
  /**
   * จำนวนชิ้นของแต่ละลายที่ลูกค้าระบุตอนแนบ (key = url ใน artworkUrls) — ไม่ระบุ = ไม่มีคีย์
   * แกะมาจาก selections["จำนวนแต่ละลาย"] ตอน checkout (ดู artQtyByUrl ใน products.ts)
   */
  artworkQty?: Record<string, number>;
  /**
   * 📐 ขนาดชิ้นงาน (กว้าง×สูง ซม.) ของแต่ละลายที่ลูกค้าระบุตอนแนบ — คละหลายขนาดใน 1 แผ่น (key = url)
   * แกะมาจาก selections["ขนาดแต่ละลาย"] ตอน checkout (ดู artSizeByUrl ใน products.ts) · ไม่ระบุ = ไม่มีคีย์ (ใช้ขนาดหลักในสเปค)
   */
  artworkSize?: Record<string, { w: number; h: number }>;
  /**
   * งานพิมพ์ 2 ด้าน — url ใน artworkUrls ชุดที่เป็น "ลายด้านหลัง" (เป็นส่วนย่อยของ artworkUrls ไม่ใช่รายการแยก)
   * ทุกจอที่นับ/ลบ/ก๊อป/ล้างไฟล์ยังใช้ artworkUrls ชุดเดียวได้เหมือนเดิม · ตัวนี้มีไว้ติดป้าย หน้า/หลัง อย่างเดียว
   * ไม่มีฟิลด์ = ออเดอร์เก่า หรืองานด้านเดียว → ไม่ติดป้าย (ดู artworkSide)
   */
  artworkBackUrls?: string[];
  /**
   * ♻️ ใช้ไฟล์เก่าจากออเดอร์ก่อน (ลูกค้าติ๊กตอนสั่ง / แอดมินติ๊ก / สั่งซ้ำ) — ดู ReuseArt
   * ไม่มี artworkUrls ก็ไม่ถือว่า "ยังไม่มีลาย" · ป้ายขึ้นข้างชื่อสินค้าในหน้าออเดอร์ บอร์ดกราฟฟิก และใบงาน
   */
  reuseArt?: ReuseArt;
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
  /** งานนี้มีชิ้นงานตัวอย่างที่ขึ้นให้ลูกค้าตรวจ — กราฟฟิก/แอดมินติ๊กไว้ ฝ่ายแพ็คต้องส่งไปพร้อมออเดอร์ */
  sampleRequired?: { by: string; at: string };
  /** พนักงานแพ็คยืนยันว่าใส่ชิ้นงานตัวอย่างลงกล่องแล้ว — ต้องมีก่อนยิงเลขพัสดุ (เมื่อ sampleRequired) */
  samplePacked?: { by: string; at: string };
  /** 📦 ของรายการนี้มาถึงโต๊ะแพ็คหรือยัง (ยังไม่มา/มาไม่ครบ/มาครบ) — ไม่มีค่า = ไม่เคยปัก ถือว่าปกติ */
  arrival?: PackArrival;
  /** กราฟฟิกยืนยันว่าอ่านรายละเอียดรายการนี้แล้ว (ก่อนทำแบบงาน) — audit trail */
  graphicAck?: { by: string; at: string };
  /**
   * รายการนี้ "ไม่ต้องทำแบบ" — ยอดโอนเพิ่มภายหลัง/ค่าบริการที่ไม่มีชิ้นงานให้ออกแบบ
   * (ค่าตัดไฟล์, เพิ่มขนาด, คละลายเพิ่ม, ซื้อตะขอ ฯลฯ) แอดมิน/กราฟฟิกติ๊กเองในหน้าออเดอร์ หรือติ๊กตอนเพิ่มรายการ
   * ผล: ไม่นับเป็น "รอกราฟฟิกทำแบบ" ไม่ขึ้นคิวกราฟฟิก ไม่ติดป้าย "ยังไม่มีแบบ" ในใบงาน/รายการ
   * ⚠️ แนบภาพได้ถ้าอยากแนบ — พอมีแบบแล้วเดินตามขั้นตอนตรวจแบบตามปกติ (ดู proofMissing)
   */
  noProof?: { by: string; at: string };
  /** หมายเหตุที่แอดมินพิมพ์ลงใบงาน (ตรงตำแหน่งรายการนี้) — rich text HTML (สี/ขนาด/น้ำหนักต่อคำ) */
  adminNote?: string;
  /**
   * สั่ง 1 หน่วย ได้ของกี่ชิ้น — แช่ไว้ตอนสั่ง (orderUnitYield ใน products.ts อ่านจาก piecesPerUnit/sheetYield ของสินค้า)
   * เช่น โฟโต้การ์ด { per: 20, piece: "ใบ", unit: "เซ็ต" } = สั่ง 12 เซ็ต ต้องผลิต 240 ใบ
   * ⚠️ แช่ไว้ ไม่ใช่คิดสดจากสินค้า — ร้านแก้จำนวนต่อเซ็ตทีหลัง ออเดอร์เก่าต้องคงตัวเลขวันที่สั่ง
   * ออเดอร์เก่าที่ยังไม่มีฟิลด์นี้ ระบบเดาจากชื่อตัวเลือก "(20 ใบ/เซ็ต)" ให้แทน (orderPiecesPerUnit)
   */
  unitYield?: { per: number; piece: string; unit: string };
}

export interface Order {
  id: string;
  customer: string;
  phone: string;
  address: string;
  date: string;
  payment: "PromptPay" | "บัตรเครดิต" | "โอนธนาคาร" | "เก็บเงินปลายทาง";
  shipping: "ส่งธรรมดา" | "ส่งด่วน";
  /** ชื่อวิธีส่งจริงที่เลือก (เช่น "EMS (50)") — ไม่มี = ใช้ shipping แสดงแทน */
  shippingLabel?: string;
  shippingCost: number;
  status: OrderStatus;
  tracking?: string;
  /** 🚚 แบ่งส่ง: รอบที่ส่งออกไปแล้วบางส่วน (ก่อนยิงเลขรอบสุดท้ายลง tracking) — ดู Shipment */
  shipments?: Shipment[];
  /** 📋 แผนแบ่งส่งที่แอดมินระบุ (รูปไหนส่งก่อน รอบไหน) — ฝ่ายแพ็คทำตาม แก้ไม่ได้ (mergePackFields ไม่รับ) */
  shipPlan?: ShipPlanRound[];
  /** โหมดมัดจำ 50% — ลูกค้าโอนงวดแรกก่อนเริ่มงาน เก็บส่วนที่เหลือให้ครบก่อนพิมพ์เอกสาร/ส่งของ */
  deposit?: OrderDeposit;
  /** ภาพของในกล่องก่อนปิด (ฝ่ายแพ็คถ่าย) — packGate บังคับอย่างน้อย 1 รูปก่อนยิงเลขพัสดุ */
  packPhotos?: PackPhoto[];
  note?: string;
  items: OrderItem[];
  /** เชื่อมกับสมาชิก (ถ้าล็อกอินตอนสั่ง) — ไม่มี = สั่งแบบ guest */
  customerId?: string;
  /**
   * รหัสผู้ติดต่อ (ตาราง contacts — คลังรายชื่อจากระบบเดิม) ที่ออเดอร์นี้ผูกอยู่
   * แอดมินเลือกจากรายชื่อที่เด้งตอนพิมพ์ชื่อลูกค้าในหน้าออเดอร์ — ใช้สะสมแต้มให้ถูกคนตั้งแต่ออเดอร์แรก
   * ไม่ผูกไว้ ระบบจะลองจับคู่จากเบอร์โทรตอนบวกแต้มแทน (ต้องเจอคนเดียวเท่านั้นถึงบวก)
   */
  contactId?: string;
  email?: string;
  /** ชื่อพนักงานที่สั่งแทนลูกค้า (โหมดพนักงานที่ checkout) — ไม่มี = ลูกค้าสั่งเอง */
  placedBy?: string;
  /**
   * ลิงก์ห้องแชท LINE OA ของลูกค้าคนนี้ (chat.line.biz/…/chat/…)
   * พนักงานวางครั้งเดียว — ออเดอร์ถัดไปของลูกค้าคนเดิมระบบดึงมาให้เอง (จับคู่จาก customerId/เบอร์โทร)
   */
  lineChatUrl?: string;
  /**
   * LINE userId ของลูกค้า (U + 32 ตัวอักษร) — ตัวที่ใช้ "ส่งข้อความ" ได้จริง
   * ⚠️ ไม่ใช่ท่อนท้ายของลิงก์ chat.line.biz — ลิงก์นั้นเป็น chat id คนละชุดกับ userId
   * พนักงานคัดลอกมาจากหน้าคลังแชท (AdminBuddy) แล้ววางในหน้าออเดอร์
   */
  lineUserId?: string;
  /** ชื่อ/รูป LINE ที่ระบบดึงมายืนยันตอนผูก userId — ไว้ให้แอดมินเช็คว่าผูกถูกคน */
  lineProfile?: { name: string; picture?: string; at: string };
  /**
   * LINE ของ "บัญชีที่ใช้ล็อกอินเว็บตอนสั่ง" — เซิร์ฟเวอร์เติมให้ตอนแอดมินดึงออเดอร์เดียว ไม่เก็บลงฐาน
   * ไว้โชว์เทียบกับที่พนักงานผูก ถ้าเป็นคนละคน (เช่น สั่งแทน/บัญชีร้าน) จะได้รู้ว่าข้อความไปเข้าใคร
   */
  loginLine?: { userId: string; name?: string };
  /**
   * ลูกค้าอยากรับแจ้งเตือนแค่ไหน (ลูกค้าเลือกเองในหน้าออเดอร์)
   *   all = ทุกขั้นตอน · key = เฉพาะเรื่องสำคัญ (เงิน/จัดส่ง/ยกเลิก) · off = ไม่รับเลย
   * ไม่ระบุ = "all" · ตั้งครั้งเดียวใช้กับออเดอร์ถัดไปของลูกค้าคนเดิมด้วย
   */
  notifyLevel?: "all" | "key" | "off";
  /** เวลาที่ลูกค้าเลือกระดับแจ้งเตือนล่าสุด (ISO) */
  notifyLevelAt?: string;
  /**
   * หลักฐานการโอน — สำหรับออเดอร์ใหม่จะเป็น signed URL ชั่วคราวที่ฝั่งเซิร์ฟเวอร์เซ็นให้ตอนแอดมินดึงข้อมูล
   * (ออเดอร์เก่าเก็บเป็น public URL ถาวร) · มีค่า = ลูกค้าแจ้งโอนแล้ว
   */
  slipUrl?: string;
  /** path ของสลิปใน bucket ส่วนตัว (ออเดอร์ใหม่) — แอดมินเปิดผ่าน signed URL เท่านั้น กัน URL หลุด */
  slipPath?: string;
  /** ลายนิ้วมือไฟล์สลิป (SHA-256) — กันเอาไฟล์เดิมมาแนบซ้ำ/แนบออเดอร์อื่น (ดู server/slip-dedupe.ts) */
  slipHash?: string;
  /** เวลาที่ลูกค้ากดแจ้งโอน (ISO string) */
  paidReportedAt?: string;
  /** ผลตรวจสลิปอัตโนมัติ (SlipOK) — pass = ยืนยันชำระให้แล้ว · fail = ให้แอดมินตรวจเอง */
  slipVerify?: {
    status: "pass" | "fail";
    detail?: string;
    amount?: number;
    transRef?: string;
    at: string;
    /**
     * ยอดในสลิปน้อยกว่ายอดที่ต้องโอน แต่ระบบรู้จักส่วนต่าง — ถือว่าจ่ายครบ
     * wht = ลูกค้านิติบุคคลหัก ณ ที่จ่าย (rate 1 หรือ 3%) ต้องตามใบ 50 ทวิจากลูกค้า
     * bankFee = ธนาคารหักค่าธรรมเนียมการโอน
     */
    deduction?: { kind: "wht" | "bankFee" | "earlyPay"; rate?: number; amount: number; label: string };
    /**
     * 💸 รับบางส่วน — สลิปแท้ (SlipOK ยืนยัน) แต่ยอดน้อยกว่าที่ต้องโอนและไม่เข้าข่ายส่วนต่างที่รู้จัก
     * ระบบนับยอดนี้เข้า paidTotal ให้แล้ว (บาท) แต่ยังไม่ยืนยันงวด → ลูกค้าเห็นยอดค้างที่เหลือและโอนเพิ่มได้
     * มีค่า = ห้ามนับซ้ำ (ตรวจซ้ำ/ลบสลิปต้องถอยยอดนี้ออก)
     */
    credited?: number;
    /** โอนเกินยอดที่ต้องชำระอยู่กี่บาท (ผ่านแล้ว แต่จดไว้ให้แอดมินคืน/แปลงเป็นแต้ม) */
    over?: number;
    /** ตรวจซ้ำไม่ช่วย (เช่น รูปไม่มี QR Code — SlipOK 1007) → หน้าออเดอร์ซ่อนปุ่ม "ตรวจสลิปอีกครั้ง" ให้เทียบยอดเองเลย */
    noRetry?: boolean;
  };
  /**
   * 💸 สลิปเพิ่มเติม (ใบที่ 2, 3, …) นอกช่องหลัก slipPath / deposit.balanceSlipPath
   * เกิดเมื่อลูกค้าโอนขาดแล้วโอนตาม · โอนแยกหลายบัญชี · โอนค่าบริการ/สั่งเพิ่มทีหลัง
   * ช่องหลักสองช่องคงไว้ตามเดิม (ทุกจอรู้จัก) — ใบที่เกินมาเข้าอาเรย์นี้ ไม่จำกัดจำนวน
   * ดู paymentEntries() ใน @/lib/payments ที่รวมทุกใบเป็นรายการเดียวไว้แสดงผล
   */
  payments?: OrderPayment[];
  /**
   * 🧾 ค่าบริการเพิ่มที่เก็บทีหลัง (ค่าตัดภาพ · ค่าส่งเพิ่ม · ค่าเร่งงาน …) — ไม่ใช่สินค้า ไม่เข้าใบงานผลิต
   * บวกเข้า orderTotal ตรง ๆ (อยู่นอกฐานส่วนลด %) · ลูกค้าเห็นเป็นบรรทัดแยกใต้รายการสินค้าว่ายอดโตเพราะอะไร
   */
  charges?: OrderCharge[];
  /** เวลาที่แอดมินปริ้นใบงานครั้งแรก (ISO) — มีค่า = ล็อกที่อยู่ ลูกค้าแก้ไม่ได้แล้ว */
  printedAt?: string;
  /** ปริ้นไปแล้วกี่ครั้ง (รวมปริ้นซ้ำ) — กันของไปสองรอบ ดูรายละเอียดแต่ละครั้งได้ในประวัติ */
  printCount?: number;
  /** เวลาที่ปริ้นครั้งล่าสุด (ISO) */
  lastPrintedAt?: string;
  /** ช่วงวันที่จัดส่ง (แอดมินระบุ) — โชว์บนใบงาน · เก็บเป็น yyyy-mm-dd */
  shipDate?: { from?: string; to?: string };
  /**
   * วันที่ลูกค้าต้องใช้งาน (YYYY-MM-DD) — ลูกค้าระบุตอนสั่ง หรือแอดมินกรอกให้ทีหลัง
   * ฝ่ายผลิตใช้จัดคิว · ใบงานโชว์เด่น · ใกล้ถึงวัน = งานเร่ง
   */
  useByDate?: string;
  /** งานเร่ง — แอดมินติ๊กเอง (โชว์ป้ายแดงทุกที่) */
  rush?: boolean;
  /**
   * 🏭 "ส่งเข้าผลิตแล้ว" — ไฟล์งานถูกวางในโฟลเดอร์ผลิตของวัน (/Volumes/iDuckyShop/1.Order Today/<คน วันที่>/…) แล้ว
   * ทางเข้า: (1) คิวปริ้น "โยนโฟลเดอร์งานที่เข้าผลิต" → เซิร์ฟเวอร์จับคู่ชื่อโฟลเดอร์กับออเดอร์ (production-match.ts) folder = ชื่อโฟลเดอร์ที่จับคู่ได้
   *          (2) ติ๊กเองในหน้าออเดอร์ (ใบที่ไม่มีโฟลเดอร์/สั่งโรงงานตรง)
   * มีค่า = ใบอยู่กอง "ส่งผลิตแล้ว รอปริ้น" ในคิวปริ้น · ยกเลิกได้ (ลบฟิลด์) · แอดมิน/กราฟฟิก/ฝ่ายแพ็คทำได้
   * ⚠️ ไม่ใช่สถานะออเดอร์ — "กำลังผลิต" ยังตั้งตอนปริ้นใบงานเหมือนเดิม
   */
  productionSent?: { by: string; at: string; folder?: string };
  /** งานเคลม/ทำใหม่ — เลขออเดอร์ต้นทางที่ทำงานนี้ขึ้นมาแทน */
  claimOf?: string;
  /** สั่งซ้ำจากออเดอร์เดิม (คิดเงินปกติ) — เลขออเดอร์ต้นทาง */
  reorderOf?: string;
  /** ออเดอร์นี้เกิดจากใบเสนอราคาใบไหน (ลูกค้าตกลงแล้วแปลงมา) */
  quoteOf?: string;
  /** เหตุผลที่ต้องเคลม (งานเสีย/พิมพ์ผิด/ส่งผิด/ชำรุดจากขนส่ง …) */
  claimReason?: string;
  /** เลขออเดอร์ลูกที่ทำใหม่/เคลมจากออเดอร์นี้ (ต้นทางเก็บไว้ให้กดข้ามไปดู) */
  redoOrders?: string[];
  /** หมายเหตุท้ายบิล (แอดมินพิมพ์ลงใบงาน) — rich text HTML (สี/ขนาด/น้ำหนักต่อคำ) */
  billNote?: string;
  /** กุญแจลับต่อออเดอร์ (สุ่มตอนสร้าง) — ใช้ยืนยันสิทธิ์ตอนแจ้งโอน/ดูแบบ (public endpoint) */
  key?: string;
  /**
   * ยอดที่ลูกค้าแจ้งโอนไปแล้ว (บันทึกตอนกดแจ้งโอน = ยอดรวม ณ ตอนนั้น)
   * ใช้คำนวณ "ยอดค้างชำระ" เมื่อลูกค้าสั่งเพิ่มในออเดอร์เดิม
   */
  paidTotal?: number;
  /**
   * 🔁 สถานะก่อนถูกเด้งกลับ "รอชำระเงิน" เพราะยอดโตทีหลัง (เปิด VAT/เก็บเพิ่ม/แก้ราคา) เช่น "อนุมัติแบบ"
   * เก็บเงินส่วนต่างครบแล้วให้กลับไปสถานะนี้ ไม่ใช่ถอยไป "ชำระแล้ว" แล้วให้กราฟฟิก/ลูกค้าตรวจแบบซ้ำ · ล้างเมื่อแอดมินเปลี่ยนสถานะเอง
   */
  reopenedFrom?: OrderStatus;
  /**
   * 💳 ยอดค้างล่าสุดที่บอกลูกค้าทางไลน์ด้วยข้อความ "ยอดที่ต้องโอนเพิ่ม" (แอดมินแก้ยอด/เก็บเพิ่ม)
   * ไว้เทียบตอนแอดมินแก้ยอดอีกรอบก่อนลูกค้าโอน (11 ก.ย. 69 OD-260910-5763: เพิ่มรายการ → ไลน์บอก 730 · 26 วิต่อมาใส่ส่วนลด −50
   * → หน้าเว็บค้าง 680 แต่ไลน์ไม่ได้บอกยอดใหม่) → ยอดต่างจากที่แจ้ง = ส่งข้อความยอดใหม่ให้ · เซิร์ฟเวอร์เป็นเจ้าของฟิลด์นี้
   * (reconcileFullEdit คงค่าจากฐานเสมอ หน้าจอแอดมินไม่ต้องรู้จัก)
   */
  balanceNotified?: { at: string; balance: number };
  /** ประวัติการทำงานของออเดอร์ (เก่า→ใหม่) — ใครทำอะไรเมื่อไหร่ */
  log?: LogEntry[];
  /**
   * 🕒 เวลาที่เซิร์ฟเวอร์บันทึกออเดอร์นี้ล่าสุด (ISO · นาฬิกาเซิร์ฟเวอร์) — ประทับที่ PATCH /api/admin/orders + อัปแบบงาน
   * หน้าจอส่งค่านี้กลับมาพร้อมก้อนที่บันทึก = "เห็นข้อมูลถึงตอนไหน" — เซิร์ฟเวอร์ใช้กันหน้าจอที่เปิดค้าง
   * เขียนทับติ๊ก (graphicAck ฯลฯ)/แบบงานที่คนอื่นเพิ่งทำ (ดู reconcileItem ใน api/admin/orders/route.ts)
   */
  savedAt?: string;
  /**
   * เวลาล่าสุดที่ "แจ้งลูกค้าทางไลน์ว่ามีแบบให้ตรวจ" (ISO) — รูปแบบงานที่อัป/แก้หลังเวลานี้ = ยังไม่ได้แจ้ง
   * กราฟฟิกอัปหลายรูปแล้วกดปุ่ม 📣 ครั้งเดียว (หรือ cron แจ้งให้เองเมื่อค้างเกินกำหนด) → ดู src/lib/proof-notify.ts
   */
  proofNotifiedAt?: string;
  /**
   * 🎁 ของแถมฟรีที่ออเดอร์นี้ได้ (คิดฝั่งเซิร์ฟเวอร์ตอนสร้างออเดอร์จากโปรในตั้งค่าร้าน)
   * ต้องโชว์บนใบงาน/หน้าแพ็คด้วย ไม่งั้นของแถมไม่ได้ลงกล่อง
   */
  gifts?: OrderGift[];
  /** ส่วนลด (ระดับสมาชิก หรือ คูปอง) คิดฝั่งเซิร์ฟเวอร์ตอนสร้างออเดอร์ — หักออกจากยอดรวม */
  discount?: { label: string; amount: number; couponCode?: string };
  /**
   * 🤝 ออเดอร์ของตัวแทนจำหน่าย (ยืนยันจากทะเบียน __dealers__ ด้วย token ตอนสร้างออเดอร์)
   * ราคาเป็นเรทตัวแทน · ไม่มีส่วนลด tier/คูปอง/โอนไว/ของแถม — ตัวตรวจสลิปห้ามผ่อนยอดโอนไวให้
   */
  dealer?: boolean;
  /** ส่วนลดทั้งบิลที่แอดมินใส่เอง (แยกจากคูปอง/ระดับสมาชิก — ใช้พร้อมกันได้) · pct มีค่า = คิดเป็น % ของยอดสินค้าหลังหักส่วนลดรายรายการ */
  adminDiscount?: { label?: string; amount?: number; pct?: number };
  /**
   * ⚡ ส่วนลด "โอนไว" — คิดฝั่งเซิร์ฟเวอร์ตอนสร้างออเดอร์จากยอดสินค้าก่อนค่าส่ง (ดู @/lib/early-pay)
   * ใช้พร้อมส่วนลดอื่นได้ทั้งหมด (ไม่ใช่ "เลือกอันที่ดีกว่า" แบบคูปอง/ระดับสมาชิก)
   * ⏳ expiresAt = หมดเวลาแจ้งโอน (ISO) — ไม่มี = ไม่จำกัดเวลา (ใบก่อน 10 ก.ย. 69) · เลยเวลาโดยยังไม่ล็อก = ส่วนลดหาย
   *    ยอดทุกหน้าจอคิดผ่าน orderEarlyPayAmount() จึงกลับเป็นยอดเต็มเองโดยไม่ต้องมี cron
   * 🔒 lockedAt = แจ้งโอน/ยืนยันเงินเข้าทันเวลา → ล็อกส่วนลดไว้ถาวร (ดู lockEarlyPay)
   */
  earlyPay?: { label: string; amount: number; expiresAt?: string; lockedAt?: string; lockedBy?: string };
  /**
   * หัก ณ ที่จ่าย (ลูกค้านิติบุคคล) — แอดมินเลือกอัตรา 1%/3% ระบบเติมจำนวนเงินจากยอดรวมให้
   * แล้วแก้ตัวเลขเองได้ตามใบ 50 ทวิของลูกค้า (บัญชีลูกค้าบางเจ้าคิดจากฐานก่อน VAT)
   * ไม่ลดยอดรวมของบิล — แค่บอกว่า "ยอดโอนจริง" น้อยกว่ายอดตั้งเท่าไหร่ ต้องตามใบ 50 ทวิมาแทน
   */
  wht?: { rate: number; amount: number };
  /**
   * ลูกค้าประเมินความพึงพอใจแล้ว (กันประเมินซ้ำ) — ตั้งใจเก็บแค่ boolean
   * ห้ามเก็บคะแนน/เวลา/รายละเอียดใด ๆ ที่นี่ เพื่อให้คะแนนในตาราง ratings นิรนามจริง
   */
  rated?: boolean;
  /**
   * ✏️ ลูกค้ากด "ขอแก้ไขออเดอร์" จากหน้าออเดอร์ — พิมพ์บอกว่าอยากแก้อะไร
   * ตั้งใจให้แอดมินเป็นคนแก้ให้ (ลูกค้าแก้สเปค/จำนวนเองไม่ได้ กันยอดกับสลิปเพี้ยน)
   * ส่งซ้ำได้ = ทับข้อความเดิม แต่ log เก็บครบทุกครั้ง · doneAt = แอดมินกดรับเรื่องแล้ว
   */
  editRequest?: { text: string; at: string; doneAt?: string; doneBy?: string };
  /**
   * 🚫 ลูกค้ากดยกเลิกออเดอร์เอง — เปิดให้เฉพาะใบที่ "ยังไม่มีเงินเข้าเลย" (ดู /api/orders/cancel)
   * มีค่า = ใบนี้ลูกค้ายกเลิกเอง ไม่ใช่ร้านยกเลิก (แยกไว้ดูสถิติ/ตามงานย้อนหลัง)
   */
  cancelledByCustomer?: { at: string; reason?: string };
  /**
   * 📄 ออเดอร์ที่สร้างจากลิงก์แชร์ FlowAccount (ลูกค้าที่ขอใบกำกับภาษี — บิลจริงออกที่ FlowAccount)
   * ใบนี้ในระบบเราเป็น "ใบงาน" ให้กราฟฟิก/ผลิต/จัดส่ง · ยอดเงิน/VAT/หัก ณ ที่จ่าย ยึดตามเอกสาร FlowAccount
   * ราคาต่อชิ้นในรายการ = ราคาก่อน VAT ตามใบ (grandTotal คือยอดรวม VAT แล้ว)
   */
  flowAccount?: {
    url: string;
    /** qt · bl · inv · re · ca … ตามตัวย่อในลิงก์ */
    docType: string;
    docTypeLabel: string;
    docNo: string;
    date?: string;
    subtotal?: number;
    vat?: number;
    grandTotal?: number;
    wht?: number;
    net?: number;
    /**
     * ➗ ใบมัดจำ 50% ของ FlowAccount (10 ก.ย. 69) — ออเดอร์เป็น "ยอดเต็ม" + Order.deposit.amount = งวดแรกรวม VAT
     * kind deposit = ใบหลักคือใบแจ้งหนี้มัดจำ (refDocNo = ใบเสนอราคาที่อ้าง) · balance = ใบหลักคือใบยอดคงเหลือ (refDocNo = ใบมัดจำที่ถูกหัก)
     * · manual = แอดมินติ๊กเปิดโหมดมัดจำเองจากใบเสนอราคา/ใบธรรมดา (ระบบคิดครึ่งหนึ่ง แก้ได้)
     * subtotal/vat/grandTotal/wht/net ด้านบนของใบมัดจำ = มูลค่างานเต็ม (ไม่ใช่ยอดของใบแจ้งหนี้มัดจำใบเดียว)
     */
    deposit?: { kind: "deposit" | "balance" | "manual"; amount: number; amountBeforeVat?: number; refDocNo?: string; net?: number };
    /** รายการสินค้าดึงมาจากเอกสารอีกใบ (ใบมัดจำไม่มีรายการ → ใบเสนอราคา/ใบยอดคงเหลือ) */
    itemsFrom?: { url: string; docNo: string; docTypeLabel: string };
    fetchedAt: string;
  };
  /** ข้อมูลออกใบกำกับภาษีของลูกค้า (ดึงจาก FlowAccount หรือแอดมินกรอก) */
  taxInvoice?: {
    company: string;
    taxId?: string;
    branch?: string;
    address: string;
    /** เอกสาร FlowAccount ที่ใช้ออกใบกำกับ (วางลิงก์แชร์แล้วดึงข้อมูลผู้ซื้อมา) — แค่อ้างอิง ไม่ใช่ order.flowAccount (นั่นคือใบที่ "ชำระตามเอกสาร") */
    docNo?: string;
    docUrl?: string;
    docTypeLabel?: string;
  };
  /**
   * ภาษีมูลค่าเพิ่มตามบิล — มีเฉพาะออเดอร์ที่สร้างจากลิงก์ FlowAccount (ราคาสินค้าในรายการเป็นราคาก่อน VAT)
   * บวกเข้ายอดรวม (orderTotal) ให้ยอดในระบบนี้เท่ากับ "จำนวนเงินรวมทั้งสิ้น" ในเอกสารทุกบาท
   * ออเดอร์ปกติจากหน้าเว็บไม่มีฟิลด์นี้ (ราคาหน้าร้านรวมทุกอย่างแล้ว)
   */
  vat?: { rate: number; amount: number };
  /**
   * 🧾 ใบกำกับภาษีส่งให้ลูกค้าทางไหน — เฉพาะใบที่มีใบกำกับ (flowAccount / taxInvoice / vat)
   * ไม่ระบุ = "box" ต้องใส่ใบกำกับลงกล่องไปกับของ → ขึ้นตราบนใบปะหน้า/ใบงาน + เป็นด่านก่อนยิงเลขพัสดุ
   * "email" = ส่งไฟล์ให้ลูกค้าแล้ว/ลูกค้าไม่ต้องการตัวจริง → ไม่ต้องแนบ ไม่ขึ้นป้าย ไม่กันยิงเลข
   */
  taxInvoiceDelivery?: "box" | "email";
  /**
   * 🧾 พนักงานแพ็คยืนยันว่าใส่ใบกำกับภาษีลงกล่องแล้ว — ต้องมีก่อนยิงเลขพัสดุ (เมื่อ orderNeedsTaxInvoiceInBox)
   * เจ้าของร้านแจ้ง 10 ก.ย. 69: บิล FlowAccount/บิล VAT พนักงานมักลืมพิมพ์ใบกำกับไปพร้อมใบปะหน้า
   */
  taxInvoicePacked?: { by: string; at: string };
}

/** 🧾 ใบนี้มีใบกำกับภาษี (สร้างจาก FlowAccount / แอดมินใส่ข้อมูลใบกำกับ / มี VAT ตามบิล) */
export function orderHasTaxInvoice(o: Order): boolean {
  return !!(o.flowAccount || o.taxInvoice || orderVatAmount(o) > 0);
}

/** 🧾 ต้องใส่ใบกำกับภาษีตัวจริงลงกล่อง (มีใบกำกับ และไม่ได้เลือกส่งทางอีเมล) */
export function orderNeedsTaxInvoiceInBox(o: Order): boolean {
  return orderHasTaxInvoice(o) && o.taxInvoiceDelivery !== "email";
}

/** 🧾 เลขที่ + ลิงก์เอกสารใบกำกับ — เอาจากข้อมูลใบกำกับก่อน (แอดมินวางลิงก์) ไม่มีค่อยใช้เอกสารต้นทาง FlowAccount */
export function taxInvoiceDocOf(o: Order): { docNo?: string; url?: string; label: string; company?: string } {
  const t = o.taxInvoice;
  const f = o.flowAccount;
  if (t?.docNo) return { docNo: t.docNo, url: t.docUrl, label: t.docTypeLabel ?? "เอกสาร", company: t.company };
  if (f) return { docNo: f.docNo, url: f.url, label: f.docTypeLabel, company: t?.company };
  return { label: "ใบกำกับภาษี", company: t?.company };
}

/** ราคาสินค้ารวม (ก่อนค่าส่ง/ส่วนลด) */
export function orderSubtotal(o: Order): number {
  return o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
}

/** ส่วนลดของรายการนี้เป็นบาท (รองรับทั้งใส่บาทตรง ๆ และ % ของราคาบรรทัด) — ไม่เกินราคาบรรทัด */
export function itemDiscountAmount(i: OrderItem): number {
  const line = i.qty * i.unitPrice;
  if ((i.discountPct ?? 0) > 0) return Math.min(line, Math.floor((line * i.discountPct!) / 100));
  return Math.min(line, Math.max(0, i.discount ?? 0));
}

/** รวมส่วนลดรายรายการ (แอดมินใส่เอง) */
export function orderItemDiscounts(o: Order): number {
  return o.items.reduce((s, i) => s + itemDiscountAmount(i), 0);
}

/** ส่วนลดทั้งบิลของแอดมินเป็นบาท — % คิดจากยอดสินค้าหลังหักส่วนลดรายรายการ */
export function adminDiscountAmount(o: Order): number {
  const d = o.adminDiscount;
  if (!d) return 0;
  if ((d.pct ?? 0) > 0) {
    const base = Math.max(0, orderSubtotal(o) - orderItemDiscounts(o));
    return Math.floor((base * d.pct!) / 100);
  }
  return Math.max(0, d.amount ?? 0);
}

/**
 * สถานะส่วนลดโอนไวของออเดอร์ ณ เวลา now
 * none = ไม่มีส่วนลด · active = ยังอยู่ในเวลา (นับถอยหลัง) · locked = ได้แน่แล้ว (แจ้งโอนทัน / ใบเก่าไม่จำกัดเวลา) · expired = เลยเวลาโดยไม่แจ้งโอน
 */
export type EarlyPayState = "none" | "active" | "locked" | "expired" | "superseded";

/** ส่วนลดอื่นของออเดอร์ (ระดับสมาชิก/คูปอง + ส่วนลดทั้งบิลจากแอดมิน + ส่วนลดรายรายการ) — ไม่รวมส่วนลดโอนไว */
export function orderOtherDiscounts(o: Order): number {
  return (o.discount?.amount ?? 0) + adminDiscountAmount(o) + orderItemDiscounts(o);
}

export function earlyPayState(o: Order, now: number = Date.now()): EarlyPayState {
  const e = o.earlyPay;
  if (!e || !(e.amount > 0)) return "none";
  // ⚡ ไม่ใช้ร่วมกับส่วนลดอื่น (เจ้าของร้านสั่ง 10 ก.ย. 69 "มีส่วนลดอื่นแล้วไม่ต้องลดโอนไวอีก") — คิดสด
  // ⚠️ เฉพาะใบที่ยังไม่มีเงินเข้า — รับเงินแล้วห้ามเปลี่ยนส่วนลดย้อนหลัง (11 ก.ย. 69 OD-260909-5711: ลูกค้าโอน 3,177 ครบตามที่
  // ระบบบอกตอนนั้น (ลด 2% + โอนไว 10) แล้วกติกาใหม่ไปตัด 10 ทีหลัง → โชว์ค้าง ฿10 ทั้งที่จ่ายครบ) · แอดมินใส่ส่วนลดหลังรับเงิน
  // = ตั้งใจลดเพิ่ม (ยอดเกินโชว์เป็นชำระเกิน ให้แอดมินคืน/ปรับเอง) ไม่ใช่มาแทนโอนไว
  if (orderOtherDiscounts(o) > 0 && paidSoFar(o) <= 0) return "superseded";
  if (e.lockedAt || !e.expiresAt) return "locked";
  const t = Date.parse(e.expiresAt);
  if (!Number.isFinite(t)) return "locked";
  return now > t ? "expired" : "active";
}

/** เหลือเวลาแจ้งโอนอีกกี่มิลลิวินาที (0 = ไม่อยู่ในสถานะนับถอยหลัง) */
export function earlyPayMsLeft(o: Order, now: number = Date.now()): number {
  if (earlyPayState(o, now) !== "active") return 0;
  return Math.max(0, Date.parse(o.earlyPay!.expiresAt!) - now);
}

/**
 * 🔒 ล็อกส่วนลดโอนไว — เรียกตอนลูกค้าแจ้งโอน (slip-apply) หรือแอดมินยืนยันเงินเข้าเอง
 * ทันเวลา = ประทับ lockedAt · เลยเวลา/ไม่มีส่วนลด/ล็อกแล้ว = คืนออเดอร์เดิม (ส่วนลดหายไปตามกติกา)
 */
export function lockEarlyPay(o: Order, at: string, by: string): Order {
  if (earlyPayState(o, Date.parse(at) || Date.now()) !== "active") return o;
  return { ...o, earlyPay: { ...o.earlyPay!, lockedAt: at, lockedBy: by } };
}

/** ส่วนลดโอนไวของออเดอร์นี้เป็นบาท (0 = ไม่ได้ลด หรือเลยเวลาแจ้งโอนแล้ว) */
export function orderEarlyPayAmount(o: Order, now?: number): number {
  const s = earlyPayState(o, now);
  return s === "active" || s === "locked" ? Math.max(0, o.earlyPay!.amount) : 0;
}

/** ส่วนลดทั้งหมดของออเดอร์ = คูปอง/ระดับ + ส่วนลดทั้งบิลจากแอดมิน + ส่วนลดรายรายการ + ส่วนลดโอนไว */
export function orderDiscountTotal(o: Order): number {
  return (o.discount?.amount ?? 0) + adminDiscountAmount(o) + orderItemDiscounts(o) + orderEarlyPayAmount(o);
}

/** VAT ตามบิล (บาท) — 0 = ออเดอร์ทั่วไปที่ราคารวมทุกอย่างแล้ว */
export function orderVatAmount(o: Order): number {
  return Math.max(0, o.vat?.amount ?? 0);
}

/** 🧾 ค่าบริการเพิ่มรวม (บาท) — ค่าตัดภาพ/ค่าส่งเพิ่ม/ค่าเร่งงาน ที่แอดมินเก็บทีหลัง (0 = ไม่มี) */
export function orderChargesTotal(o: Order): number {
  return (o.charges ?? []).reduce((s, c) => s + Math.max(0, Number(c.amount) || 0), 0);
}

export function orderTotal(o: Order): number {
  // ?? 0 กันออเดอร์เก่า/แถวที่ไม่มี shippingCost ทำให้ยอดกลายเป็น NaN แล้วลามไปทั้งระบบ
  // ปัดทศนิยม 2 ตำแหน่ง — ออเดอร์จาก FlowAccount มีสตางค์ (VAT 7%) ไม่ให้ลอยเป็น 1540.8000000001
  // ค่าบริการเพิ่ม (charges) บวกท้ายสุด — อยู่นอกฐานส่วนลด % (adminDiscountAmount คิดจาก subtotal สินค้า)
  return Math.max(
    0,
    Math.round((orderSubtotal(o) + (o.shippingCost ?? 0) - orderDiscountTotal(o) + orderVatAmount(o) + orderChargesTotal(o)) * 100) / 100
  );
}

/** ยอดหัก ณ ที่จ่ายของออเดอร์ (บาท) — 0 = ไม่ได้ตั้งหรือไม่หัก */
export function orderWhtAmount(o: Order): number {
  return Math.max(0, o.wht?.amount ?? 0);
}

/** ยอดโอนจริงหลังหัก ณ ที่จ่าย — ลูกค้านิติบุคคลโอนเท่านี้ ส่วนต่างตามใบ 50 ทวิ */
export function orderNetTransfer(o: Order): number {
  return Math.max(0, orderTotal(o) - orderWhtAmount(o));
}

/**
 * ➗ ออเดอร์มัดจำ 50% ที่ลูกค้าหัก ณ ที่จ่าย — แบ่งยอดหักตามสัดส่วนของแต่ละงวด ให้ "โอนจริง" ต่องวดตรงกับใบของ FlowAccount
 * (11 ก.ย. 69 OD-260911-8026: ระบบโชว์งวดละ 10,973.12 แต่ใบยอดคงเหลือ BL002059 บอกยอดชำระ 10,665.46
 *  เพราะหัก 3% ของงวดนั้น 307.66 — ก่อนหน้านี้หน้าออเดอร์โชว์แต่ยอดหักทั้งใบ 615.32 กับยอดเต็ม เจ้าของร้านเลยเห็นว่าไม่ตรง)
 * first/second = ยอดงวด (รวม VAT) · firstWht/secondWht = หัก ณ ที่จ่ายของงวดนั้น · firstNet/secondNet = เงินที่ลูกค้าโอนจริง
 * ไม่มีหัก ณ ที่จ่าย → wht 0 และ net = ยอดงวด · ไม่ใช่ออเดอร์มัดจำ → null
 */
export function depositInstallments(
  o: Order
): { first: number; second: number; wht: number; firstWht: number; secondWht: number; firstNet: number; secondNet: number } | null {
  if (!o.deposit) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const total = orderTotal(o);
  const first = r2(Math.min(total, Math.max(0, o.deposit.amount)));
  const second = r2(Math.max(0, total - first));
  const wht = orderWhtAmount(o);
  const firstWht = wht > 0 && total > 0 ? r2((wht * first) / total) : 0;
  const secondWht = r2(Math.max(0, wht - firstWht));
  return { first, second, wht, firstWht, secondWht, firstNet: r2(first - firstWht), secondNet: r2(second - secondWht) };
}

/** ยอดที่ลูกค้ายังค้างชำระ (มากกว่า 0 = ต้องโอนเพิ่ม เช่น หลังสั่งเพิ่มในออเดอร์เดิม) */
export function orderBalance(o: Order): number {
  return Math.max(0, orderTotal(o) - (o.paidTotal ?? 0));
}

/**
 * ลิงก์แชท LINE ของลูกค้าคนนี้ — ของใบนี้เอง หรือดึงจากออเดอร์เก่าของลูกค้าคนเดียวกัน
 * จับคู่จาก customerId ก่อน (แม่นสุด) ไม่มีค่อยใช้เบอร์โทร แล้วค่อยอีเมล
 * คืน source = "self" เมื่อเป็นของใบนี้ · "prev" เมื่อดึงมาจากใบก่อนหน้า (พนักงานไม่ต้องกรอกซ้ำ)
 */
export function lineChatOf(order: Order, all: Order[]): { url: string; source: "self" | "prev"; from?: string } | null {
  if (order.lineChatUrl) return { url: order.lineChatUrl, source: "self" };
  const phone = (order.phone ?? "").replace(/\D/g, "");
  const email = (order.email ?? "").trim().toLowerCase();
  const same = (o: Order) =>
    (order.customerId && o.customerId === order.customerId) ||
    (phone.length >= 8 && (o.phone ?? "").replace(/\D/g, "") === phone) ||
    (!!email && (o.email ?? "").trim().toLowerCase() === email);
  // ใบใหม่สุดที่มีลิงก์ = ห้องแชทล่าสุดที่พนักงานใช้จริง
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i];
    if (o.id === order.id || !o.lineChatUrl || !same(o)) continue;
    return { url: o.lineChatUrl, source: "prev", from: o.id };
  }
  return null;
}

/** ลูกค้าคนเดียวกันไหม — customerId แม่นสุด ไม่มีค่อยใช้เบอร์/อีเมล */
function sameCustomer(a: Order, b: Order): boolean {
  const phone = (a.phone ?? "").replace(/\D/g, "");
  const email = (a.email ?? "").trim().toLowerCase();
  return (
    (!!a.customerId && b.customerId === a.customerId) ||
    (phone.length >= 8 && (b.phone ?? "").replace(/\D/g, "") === phone) ||
    (!!email && (b.email ?? "").trim().toLowerCase() === email)
  );
}

/**
 * LINE ของลูกค้าคนนี้ — ของใบนี้เอง หรือ "จำ" มาจากออเดอร์เก่าของลูกค้าคนเดียวกัน
 * ลูกค้าเก่าจึงไม่ต้องให้พนักงานผูกซ้ำทุกใบ (ระบบส่งข้อความได้เลย)
 */
export function lineUserOf(
  order: Order,
  all: Order[]
): { id: string; name?: string; picture?: string; source: "self" | "prev"; from?: string } | null {
  if (order.lineUserId)
    return { id: order.lineUserId, name: order.lineProfile?.name, picture: order.lineProfile?.picture, source: "self" };
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i];
    if (o.id === order.id || !o.lineUserId || !sameCustomer(order, o)) continue;
    return { id: o.lineUserId, name: o.lineProfile?.name, picture: o.lineProfile?.picture, source: "prev", from: o.id };
  }
  return null;
}

/**
 * ออเดอร์ยังว่างเปล่า — เพิ่งกดสร้างจากหลังบ้าน ยังไม่ใส่ชื่อ/เบอร์/ที่อยู่/รายการเลย
 * ใช้ชะลอแถบแดง "บังคับผูก LINE" ไม่ให้ขึ้นตั้งแต่ยังไม่รู้ว่าลูกค้าคือใคร
 */
export function isBlankOrder(order: Order): boolean {
  const noName = !order.customer?.trim() || order.customer === "ยังไม่ระบุชื่อ";
  return (
    noName &&
    !(order.phone ?? "").trim() &&
    !(order.address ?? "").trim() &&
    !order.contactId &&
    !order.customerId &&
    order.items.length === 0
  );
}

/** รูปแบบงานของรายการ — รองรับออเดอร์เก่าที่เก็บเป็น proofUrl รูปเดียว */
/**
 * ป้ายด้านของภาพลายที่ลูกค้าแนบ — "ด้านหน้า" / "ด้านหลัง" · null = รายการนี้ไม่ได้แยกด้าน (งานด้านเดียว/ออเดอร์เก่า)
 * ใช้ติดใต้รูปในหน้าออเดอร์/ใบงาน/ใบเสนอราคา ให้กราฟฟิกรู้ว่าลายไหนพิมพ์ด้านไหนโดยไม่ต้องเดาจากลำดับ
 */
export function artworkSide(it: Pick<OrderItem, "artworkBackUrls">, url: string): "ด้านหน้า" | "ด้านหลัง" | null {
  const back = it.artworkBackUrls;
  if (!back?.length) return null;
  return back.includes(url) ? "ด้านหลัง" : "ด้านหน้า";
}

export function proofsOf(item: OrderItem): Proof[] {
  if (item.proofs?.length) return item.proofs;
  return item.proofUrl ? [{ url: item.proofUrl, at: item.proofUpdatedAt ?? "" }] : [];
}

/** รายการนี้ติ๊ก "ไม่ต้องทำแบบ" ไว้ (ยอดเพิ่ม/ค่าบริการ) — ดู OrderItem.noProof */
export function proofExempt(item: OrderItem): boolean {
  return !!item.noProof;
}

/**
 * รายการนี้ "ยังขาดแบบงาน" ที่ต้องมีคนทำ — ใช้แทน !proofsOf(it).length ทุกจอที่นับงานค้าง
 * รายการที่ติ๊กไม่ต้องทำแบบ = ไม่มีแบบก็ไม่ถือว่าขาด (แต่ถ้าแนบภาพมาแล้ว ก็เดินขั้นตอนตรวจแบบตามปกติ)
 */
export function proofMissing(item: OrderItem): boolean {
  return !proofsOf(item).length && !proofExempt(item);
}

/**
 * รายการนี้ "ลูกค้าจัดวางลายบนเทมเพลตเองมา" หรือเปล่า
 * ดูจากบรรทัดพิกัดของทีมผลิตที่จอวางลายแนบมาให้ (ออเดอร์ที่แนบไฟล์เฉย ๆ จะไม่มี)
 */
export function isSelfDesigned(item: OrderItem): boolean {
  return !!item.sel?.["ตำแหน่งลาย (ทีมผลิต)"];
}

/**
 * งานที่ "ลูกค้าจัดวางลายบนเทมเพลตเองมาแล้ว" ทุกรายการ และแบบผ่านการอนุมัติครบ
 * — ใช้ตัดสินว่าข้ามขั้นตอนทำแบบ/รอลูกค้าตรวจได้เลยไหม
 */
export function allSelfDesignedApproved(order: Order): boolean {
  if (!order.items.length) return false;
  return order.items.every((it) => {
    const proofs = proofsOf(it);
    // ยอดเพิ่ม/ค่าบริการที่ไม่ต้องทำแบบ = ไม่มีอะไรให้ตรวจ ถือว่าผ่าน
    if (!proofs.length && proofExempt(it)) return true;
    if (!proofs.length) return false;
    // แบบชุดนี้ต้องมาจากจอวางลายของลูกค้า และอนุมัติครบทุกรูป
    return isSelfDesigned(it) && proofs.every((p) => p.review === "อนุมัติ");
  });
}

/**
 * รายการที่กราฟฟิก "ต้องลงมือทำ" ในออเดอร์นี้
 * = ลูกค้าไม่ได้จัดวางเอง และ (ยังไม่มีแบบ หรือ ลูกค้าขอแก้)
 */
export function graphicTodoItems(order: Order): OrderItem[] {
  return order.items.filter((it) => {
    if (isSelfDesigned(it)) return false; // ลูกค้าทำมาแล้ว กราฟฟิกไม่ต้องแตะ
    return proofMissing(it) || it.proofStatus === "ขอแก้ไข";
  });
}

/** รายการที่ส่งแบบให้ลูกค้าแล้ว กำลังรอลูกค้ากดตรวจ */
export function graphicWaitingItems(order: Order): OrderItem[] {
  return order.items.filter(
    (it) => !isSelfDesigned(it) && proofsOf(it).length > 0 && it.proofStatus !== "ขอแก้ไข" && it.proofStatus !== "อนุมัติ",
  );
}

/**
 * สถานะที่ควรเป็น "หลังเงินเข้าครบ"
 * งานที่ลูกค้าออกแบบเองมาแล้วไม่ต้องรอทำแบบ/รอตรวจ → ข้ามไป "อนุมัติแบบ" เลย
 */
export function paidStatusFor(order: Order): OrderStatus {
  return allSelfDesignedApproved(order) ? "อนุมัติแบบ" : "ชำระแล้ว";
}

/** ผลตรวจ "พร้อมส่งหรือยัง" ของพนักงานแพ็ค */
/** ภาพถ่ายของจริงในกล่อง "ก่อนปิดกล่อง" — ฝ่ายแพ็คถ่ายเก็บเป็นหลักฐานทุกออเดอร์ */
export interface PackPhoto {
  url: string;
  /** path ใน storage (ใช้ตอนลบไฟล์จริง) */
  path?: string;
  by: string;
  at: string;
}

/**
 * 💸 สลิปเพิ่มเติมหนึ่งใบ (ดู Order.payments)
 * ยอดที่ "นับเข้า paidTotal แล้ว" อยู่ที่ verify.credited (SlipOK) หรือ accepted.amount (แอดมินรับเอง)
 * — ใบที่ยังไม่มีทั้งสองอย่าง = รอตรวจ ยังไม่กระทบยอด
 */
export interface OrderPayment {
  /** รหัสสั้นสุ่ม (ใช้ชี้ใบตอนตรวจซ้ำ/ลบ/รับยอดเอง) */
  id: string;
  /** path ใน bucket payment-slips-private */
  path: string;
  /** ลายนิ้วมือไฟล์ (SHA-256) — กันซ้ำ */
  hash?: string;
  /** signed URL ชั่วคราว — เซิร์ฟเวอร์เซ็นให้ตอนดึง ห้ามเก็บลงฐาน */
  url?: string;
  /** เวลาที่แนบ/แจ้งโอน (ISO) */
  at: string;
  /** ใครแนบ — "ลูกค้า" หรือชื่อแอดมิน */
  by: string;
  /** ผลตรวจ SlipOK ของใบนี้ (pass = นับยอดเข้า paidTotal แล้ว · fail+credited = รับบางส่วน · fail = รอแอดมิน) */
  verify?: Order["slipVerify"];
  /**
   * ยอดที่ใบนี้ "นับเข้า paidTotal แล้ว" (บาท) — ไม่ว่าผ่าน SlipOK หรือแอดมินรับเอง
   * ไม่มีค่า = ยังไม่กระทบยอด (รอตรวจ) · ลบใบนี้ต้องถอยยอดนี้ออกจาก paidTotal
   */
  credited?: number;
  /** แอดมินรับยอดเองเมื่อ SlipOK ตรวจไม่ได้/ตรวจตก (ยอดอยู่ใน credited) */
  accepted?: { by: string; at: string };
  /** ยอดที่ต้องโอนตอนแนบใบนี้ (บาท) — ไว้อ่านย้อนหลังว่าใบนี้ตั้งใจจ่ายส่วนไหน */
  expected?: number;
}

/** 🧾 ค่าบริการเพิ่มหนึ่งรายการ (ดู Order.charges) */
export interface OrderCharge {
  id: string;
  /** ชื่อรายการที่ลูกค้าเห็น เช่น "ค่าตัดภาพ 3 รูป" */
  label: string;
  /** บาท (บวกเข้ายอดรวมตรง ๆ) */
  amount: number;
  /** เหตุผล/รายละเอียดเพิ่ม (ไม่บังคับ) */
  note?: string;
  by: string;
  at: string;
}

/** โหมดมัดจำ 50% ของออเดอร์ */
export interface OrderDeposit {
  /** ยอดมัดจำงวดแรก (บาท) */
  amount: number;
  /** งวดแรก (มัดจำ) ยืนยันแล้วเมื่อ (ISO) — มีค่า = เริ่มงานได้ */
  firstPaidAt?: string;
  /** เก็บครบทั้งออเดอร์แล้วเมื่อ (ISO) — มีค่า = พิมพ์เอกสาร/ยิงเลขพัสดุได้ */
  settledAt?: string;
  /**
   * สลิป "งวดหลัง" (ยอดคงเหลือ) ใน storage — เก็บแยกจาก order.slipPath ที่เป็นสลิปงวดแรก
   * ออเดอร์มัดจำมีเงินเข้าสองครั้ง ถ้าใช้ช่องเดียวสลิปมัดจำจะถูกทับหาย
   */
  balanceSlipPath?: string;
  /** ลายนิ้วมือไฟล์สลิปงวดหลัง (SHA-256) — กันสลิปซ้ำ คู่กับ order.slipHash */
  balanceSlipHash?: string;
  /** signed URL ชั่วคราวของสลิปงวดหลัง — เซ็นใหม่ทุกครั้งที่ดึง ห้ามเก็บลงฐาน */
  balanceSlipUrl?: string;
  /** เวลาที่แจ้งโอนงวดหลัง (ISO) */
  balanceReportedAt?: string;
  /** ผลตรวจสลิป "งวดหลัง" (SlipOK) — แยกช่องจาก slipVerify ซึ่งเป็นของงวดแรก ไม่ให้ทับกัน */
  balanceVerify?: Order["slipVerify"];
  /** ทวงยอดคงเหลือครั้งล่าสุดเมื่อไหร่ (ISO) — กันทวงซ้ำถี่เกินไป */
  balanceRemindedAt?: string;
}

/**
 * ออเดอร์นี้ยังมี "ยอดค้างชำระ" ที่ยืนยันได้ไหม — เกิดตอนยอดรวมโตขึ้นหลังลูกค้าโอนแล้ว
 * (แอดมินตีราคางานสั่งทำทีหลัง · ลูกค้าสั่งเพิ่มในออเดอร์เดิม · แอดมินแก้ราคา/ค่าส่ง)
 *
 * ⚠️ ต้องมี `paidTotal` ก่อนถึงเทียบได้ — ออเดอร์ที่แอดมินกดชำระแล้วเองโดยไม่ผ่านสลิป
 * ไม่มีค่านี้ (ของจริง 34 จาก 40 ใบ ตอน 26 ส.ค. 69) ถ้าเช็คแค่ orderBalance > 0
 * ใบพวกนั้นจะกลายเป็น "ค้างเต็มจำนวน" แล้วโดนล็อกพิมพ์ใบงาน/ยิงเลขพัสดุยกกระดาน
 * ออเดอร์เคลมตั้งใจให้ ฿0 · ออเดอร์มัดจำมีเส้นทางเก็บงวดหลังของตัวเอง (deposit.settledAt)
 */
export function hasUnpaidBalance(o: Order): boolean {
  if (o.status === "ยกเลิก" || o.claimOf) return false;
  // ใบมัดจำ: ยังไม่ครบสองงวด · หรือครบแล้วแต่ยอดโตทีหลัง (ค่าบริการเพิ่ม/สั่งเพิ่ม) — paidTotal ถูกตั้งตอน settle เสมอ
  if (o.deposit) return !o.deposit.settledAt || (o.paidTotal != null && orderBalance(o) > 0);
  return o.paidTotal != null && orderBalance(o) > 0;
}

/** ได้รับเงินครบยอดออเดอร์หรือยัง — ใช้ล็อกการพิมพ์ใบงาน/ใบเสร็จ และยิงเลขพัสดุ */
export function orderFullyPaid(o: Order): boolean {
  const paidStage = !(["รอชำระเงิน", "รอตรวจสอบ", "ยกเลิก"] as OrderStatus[]).includes(o.status);
  // ยอดโตขึ้นหลังรับเงินแล้ว = ยังเก็บไม่ครบ ห้ามนับว่าจ่ายครบ (ไม่งั้นปิดงานส่งของทั้งที่ยังขาด)
  // ใบมัดจำรวมอยู่ใน hasUnpaidBalance แล้ว (ยังไม่ settle = ค้าง)
  return paidStage && !hasUnpaidBalance(o);
}

/**
 * ป้ายสถานะแบบที่ควรโชว์ให้คนอ่าน — ออเดอร์มัดจำที่เพิ่งรับงวดแรก
 * ต้องเห็นชัดว่าเงินเข้าแค่ครึ่ง ไม่ใช่ "ชำระแล้ว" เฉย ๆ (ค่า status จริงในฐานไม่เปลี่ยน)
 */
export function orderStatusLabel(o: Order): string {
  if (o.status === "ชำระแล้ว" && o.deposit?.firstPaidAt) {
    // งวดแรกเข้า = เงินยังครึ่งเดียว · งวดหลังเข้า = ครบ 100% แล้ว (บอกให้รู้ว่าเป็นใบมัดจำที่เก็บจบ)
    return o.deposit.settledAt ? "ชำระแล้ว 50% หลัง" : "ชำระแล้ว 50% แรก";
  }
  return o.status;
}

/**
 * ยอดที่ลูกค้าต้องโอน "งวดนี้" — มัดจำ / ยอดคงเหลือ / เต็มจำนวน / ส่วนต่างที่ค้าง
 * ⚠️ ใบธรรมดาที่เคยรับเงินแล้ว (paidTotal มีค่า) = ค้างเฉพาะส่วนต่าง ไม่ใช่ยอดเต็ม
 *    (เดิมคืนยอดเต็ม → สลิปโอนส่วนต่างถูก SlipOK เทียบกับยอดเต็มแล้วตกทุกใบ · 10 ก.ย. 69)
 */
export function amountDueNow(o: Order): number {
  const total = orderTotal(o);
  const paid = paidSoFar(o);
  if (o.deposit && !o.deposit.firstPaidAt) {
    // มัดจำงวดแรก — แต่ถ้ารับบางส่วนมาแล้ว (credited) เหลือเท่าไรก็เท่านั้น
    const dep = Math.min(total, Math.max(0, o.deposit.amount));
    return Math.max(0, dep - paid);
  }
  if (o.deposit && !o.deposit.settledAt) return Math.max(0, total - paid);
  return o.paidTotal != null && !paidTotalIsReportedOnly(o) ? Math.max(0, total - paid) : total;
}

/**
 * ⚠️ paidTotal ของออเดอร์นี้เป็นแค่ "ยอดที่ลูกค้าแจ้งโอน" ที่ระบบเก่าตั้งไว้ล่วงหน้าตอนแนบสลิป (ก่อน 10 ก.ย. 69
 * ตั้ง = ยอดที่ต้องโอน แม้ SlipOK จะตรวจตก) — ยังไม่มีเงินเข้าจริงที่ยืนยันได้
 * ต้องรู้ไว้ ไม่งั้นสลิปใบถัดไปถูกเทียบกับ "ยอดค้าง 0" แล้วผ่านทั้งที่ยังไม่ได้เงิน
 * เงื่อนไข: ยังรอตรวจสอบ · งวดแรกยังไม่ยืนยัน · สลิปช่องหลักไม่ผ่านและไม่เคยนับยอดบางส่วน · ไม่มีใบเพิ่มที่นับยอดแล้ว
 * (โค้ดใหม่ไม่ตั้ง paidTotal ตอนตรวจตกแล้ว — เหลือไว้ให้ออเดอร์เก่าที่ค้างอยู่)
 */
export function paidTotalIsReportedOnly(o: Order): boolean {
  if (o.paidTotal == null) return false;
  if (o.status !== "รอตรวจสอบ") return false;
  if (o.deposit?.firstPaidAt) return false;
  if (o.slipVerify?.status === "pass" || (o.slipVerify?.credited ?? 0) > 0) return false;
  if ((o.payments ?? []).some((p) => (p.credited ?? 0) > 0)) return false;
  return true;
}

/** ยอดที่ "รับแล้วจริง" ตามที่ระบบยืนยันได้ (บาท) — ตัดค่าที่ตั้งล่วงหน้าตอนแจ้งโอนของระบบเก่าออก */
export function paidSoFar(o: Order): number {
  return paidTotalIsReportedOnly(o) ? 0 : Math.max(0, o.paidTotal ?? 0);
}

export interface PackGate {
  /** ผ่านครบทุกเงื่อนไข → ยิงเลขพัสดุได้ */
  ready: boolean;
  /** รูปแบบงานที่ยังไม่ได้กดตรวจนับ */
  uncounted: { item: string; index: number }[];
  /** รายการที่ยังไม่ได้กดยืนยันว่าอ่านรายละเอียดแล้ว */
  unread: string[];
  /** รูปที่พนักงานกด "ไม่ครบ" — ของขาด ห้ามส่ง */
  short: { item: string; got: number; need?: number }[];
  /** รายการที่มีชิ้นงานตัวอย่างแต่ยังไม่ได้ยืนยันว่าใส่กล่องแล้ว — กันลืมส่งตัวอย่างไปกับออเดอร์ */
  unsampled: string[];
  /** ยังไม่มีภาพถ่ายของในกล่องก่อนปิด — บังคับอย่างน้อย 1 รูปก่อนยิงเลขพัสดุ */
  noPhoto: boolean;
  /** ยังเก็บเงินไม่ครบ (ยอดคงเหลือมัดจำ หรือส่วนต่างที่โตขึ้นหลังโอน) — ห้ามยิงเลขพัสดุ */
  unpaidBalance: boolean;
  /** 🧾 ใบนี้ต้องใส่ใบกำกับภาษีลงกล่อง แต่ยังไม่ได้กดยืนยัน — กันลืมใบกำกับ (บิล FlowAccount / บิล VAT) */
  taxInvoiceUnpacked: boolean;
  /** 📦 รายการที่ฝ่ายแพ็คปักว่า "ของยังไม่มา / มาไม่ครบ" — ห้ามส่งจนกว่าจะกดมาครบ */
  missing: PackMissing[];
}

/** รายการที่ของยังไม่ถึงโต๊ะแพ็ค (สรุปจาก OrderItem.arrival) */
export interface PackMissing {
  /** ตำแหน่งรายการใน order.items */
  index: number;
  item: string;
  status: Exclude<PackArrivalStatus, "มาครบ">;
  /** มาแล้วกี่ชิ้น (มาไม่ครบ) */
  got?: number;
  /** ต้องได้กี่ชิ้น (= qty ของรายการ) */
  need: number;
  expectedAt?: string;
  note?: string;
  by: string;
  at: string;
  /** ปักครั้งแรกเมื่อไหร่ */
  since: string;
}

/** รายการที่ของยังไม่มา/ไม่ครบของออเดอร์นี้ (ว่าง = ของครบทุกรายการหรือไม่เคยปัก) */
export function packMissingOf(order: Order): PackMissing[] {
  const out: PackMissing[] = [];
  order.items.forEach((it, i) => {
    const a = it.arrival;
    if (!a || a.status === "มาครบ") return;
    out.push({
      index: i,
      item: it.name,
      status: a.status,
      got: a.status === "มาไม่ครบ" ? a.got ?? 0 : undefined,
      need: it.qty,
      expectedAt: a.expectedAt,
      note: a.note,
      by: a.by,
      at: a.at,
      since: a.since ?? a.at,
    });
  });
  return out;
}

/** ของที่คาดว่าจะมา "เลยวันที่คาดแล้ว" หรือยัง (ไม่ได้ระบุวัน = ไม่เลย) */
export function arrivalOverdue(expectedAt?: string): boolean {
  if (!expectedAt) return false;
  const d = new Date(expectedAt + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

/** รอของมากี่วันแล้ว นับจากวันที่ปักครั้งแรก (0 = วันนี้) */
export function waitingDays(since?: string): number {
  if (!since) return 0;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return 0;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

/** วันที่ YYYY-MM-DD → "12 ก.ย. 69" (พ.ศ. ตามที่ทีมคุยกัน) */
export function fmtExpected(ymd?: string): string {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** ข้อความสรุปสถานะของบรรทัดเดียว — ใช้ในลิสต์/ป้าย ให้ทุกจอพูดเหมือนกัน */
export function arrivalSummary(a: Pick<PackArrival, "status" | "got">, need: number, unit = "ชิ้น"): string {
  if (a.status === "มาครบ") return "มาครบแล้ว";
  if (a.status === "มาไม่ครบ") return `มาแล้ว ${a.got ?? 0}/${need} ${unit}`;
  return "ยังไม่มา";
}

export type ArrivalPatch = { status: PackArrivalStatus; got?: number; expectedAt?: string; note?: string };

/**
 * 📦 ปักสถานะของรายการ (ยังไม่มา / มาไม่ครบ / มาครบ) + ลงประวัติ — คืน Order ใหม่ ไม่แก้ของเดิม
 * ใช้ทั้งโหมดแพ็คในหน้าออเดอร์และโมดัลที่สถานีแพ็ค–ส่ง จะได้ลง log/นับวันเหมือนกัน
 * since = วันที่ปักครั้งแรกในรอบนี้ (แก้หมายเหตุ/วันคาดไม่รีเซ็ต · มาครบแล้วปักใหม่ = เริ่มนับใหม่)
 * "มาครบ" เก็บไว้เป็นประวัติว่าเคยรอ (ไม่ลบ arrival ทิ้ง) แต่ไม่ติดด่านแล้ว
 */
export function applyArrival(order: Order, itemIndex: number, patch: ArrivalPatch, actor: string): Order {
  const item = order.items[itemIndex];
  if (!item) return order;
  const prev = item.arrival;
  const now = new Date().toISOString();
  const wasMissing = !!prev && prev.status !== "มาครบ";
  const done = patch.status === "มาครบ";
  const arrival: PackArrival = {
    status: patch.status,
    ...(patch.status === "มาไม่ครบ" ? { got: patch.got ?? 0 } : {}),
    ...(!done && patch.expectedAt ? { expectedAt: patch.expectedAt } : {}),
    ...(!done && patch.note ? { note: patch.note } : {}),
    by: actor,
    at: now,
    ...(!done ? { since: wasMissing ? prev!.since ?? prev!.at : now } : {}),
  };
  const items = order.items.map((it, i) => (i === itemIndex ? { ...it, arrival } : it));
  const detail = [
    item.name,
    patch.status === "มาไม่ครบ" ? `มาแล้ว ${patch.got ?? 0}/${item.qty}` : "",
    !done && patch.expectedAt ? `คาดว่ามา ${fmtExpected(patch.expectedAt)}` : "",
    !done && patch.note ? patch.note : "",
    done && wasMissing ? `รอมา ${waitingDays(prev!.since ?? prev!.at)} วัน` : "",
  ]
    .filter(Boolean)
    .join(" — ");
  return withLog(
    { ...order, items },
    actor,
    done ? "📦 ของมาครบแล้ว" : patch.status === "ยังไม่มา" ? "📦 ของยังไม่มา" : "📦 ของมาไม่ครบ",
    detail
  );
}

/**
 * ตรวจว่าออเดอร์ผ่านขั้นตอนแพ็คครบหรือยัง
 * ใช้ทั้งหน้าออเดอร์ (แสดงความคืบหน้า) และหน้ายิงเลขพัสดุ (บล็อกไม่ให้ยิง)
 */
/** คีย์รูปแบบงาน "item:proof" ไว้จับคู่ระหว่างที่เลือกส่ง/ที่ส่งไปแล้ว */
export function proofKey(item: number, proof: number): string {
  return `${item}:${proof}`;
}

/**
 * 🚚 รูปแบบงานที่ส่งออกไปแล้วในรอบแบ่งส่ง → คีย์ "item:proof" → เลขรอบ (1-based)
 * จับคู่ด้วย url ก่อน (กราฟฟิกลบ/สลับรูปทีหลังตำแหน่งเปลี่ยน) ไม่มี url ค่อยใช้ตำแหน่ง
 */
export function shippedProofRounds(order: Order): Map<string, number> {
  const out = new Map<string, number>();
  (order.shipments ?? []).forEach((s, n) => {
    s.proofs.forEach((sp) => {
      const it = order.items[sp.item];
      if (!it) return;
      const proofs = proofsOf(it);
      let j = sp.url ? proofs.findIndex((p) => p.url === sp.url) : -1;
      if (j < 0) j = sp.proof;
      if (j < 0 || j >= proofs.length) return;
      out.set(proofKey(sp.item, j), n + 1);
    });
  });
  return out;
}

/** 📋 รูปที่อยู่ในแผนแบ่งส่ง → คีย์ "item:proof" → รอบตามแผน (1-based) · จับคู่ url ก่อนเหมือน shippedProofRounds */
export function plannedProofRounds(order: Order): Map<string, number> {
  const out = new Map<string, number>();
  (order.shipPlan ?? []).forEach((r, n) => {
    r.proofs.forEach((sp) => {
      const it = order.items[sp.item];
      if (!it) return;
      const proofs = proofsOf(it);
      let j = sp.url ? proofs.findIndex((p) => p.url === sp.url) : -1;
      if (j < 0) j = sp.proof;
      if (j < 0 || j >= proofs.length) return;
      out.set(proofKey(sp.item, j), n + 1);
    });
  });
  return out;
}

/**
 * 📋 รอบถัดไปตามแผนที่ยังไม่ได้ส่ง (คีย์รูปที่ยังไม่ออก) — null = ไม่มีแผน หรือส่งตามแผนครบแล้ว (เหลือแค่รอบสุดท้าย)
 * ฝ่ายแพ็คเห็นรูปพวกนี้ติดป้าย "ส่งก่อน" และปุ่มส่งบางส่วนล็อกไว้ที่รูปชุดนี้ ไม่ต้องเลือกเอง
 */
export function nextPlannedRound(order: Order): { index: number; round: ShipPlanRound; keys: string[] } | null {
  const shipped = shippedProofRounds(order);
  const planned = plannedProofRounds(order);
  const rounds = order.shipPlan ?? [];
  for (let n = 0; n < rounds.length; n++) {
    const keys = [...planned.entries()].filter(([, r]) => r === n + 1).map(([k]) => k);
    const pending = keys.filter((k) => !shipped.has(k));
    if (pending.length) return { index: n, round: rounds[n], keys: pending };
  }
  return null;
}

/** จำนวนชิ้น (ตามป้ายบนรูป) ที่ไปกับรอบแบ่งส่งรอบหนึ่ง */
export function shipmentQty(s: Shipment): number {
  return s.proofs.reduce((n, p) => n + (p.qty ?? 0), 0);
}

/** สรุปแบ่งส่งของใบ: ส่งไปแล้วกี่รอบ กี่ชิ้น จากทั้งหมดกี่ชิ้น (นับจากป้ายบนรูปแบบงาน) · null = ไม่เคยแบ่งส่ง */
export function partialShipSummary(order: Order): { rounds: number; shipped: number; total: number; proofsShipped: number; proofsTotal: number } | null {
  const ships = order.shipments ?? [];
  if (!ships.length) return null;
  const rounds = shippedProofRounds(order);
  let total = 0;
  let proofsTotal = 0;
  order.items.forEach((it) => proofsOf(it).forEach((p) => {
    total += p.qty ?? 0;
    proofsTotal += 1;
  }));
  return {
    rounds: ships.length,
    shipped: ships.reduce((n, s) => n + shipmentQty(s), 0),
    total,
    proofsShipped: rounds.size,
    proofsTotal,
  };
}

/** ใบที่ส่งไปแล้วบางส่วนแต่ยังไม่ปิด (ยังไม่ยิงเลขรอบสุดท้าย) */
export function isPartiallyShipped(order: Order): boolean {
  return (order.shipments?.length ?? 0) > 0 && !(order.tracking ?? "").trim();
}

/** ด่านตรวจก่อน "ส่งบางส่วน" — ตรวจเฉพาะรูปที่เลือกไปรอบนี้ + รายการที่รูปนั้นอยู่ (ไม่บังคับงานตัวอย่าง/ใบกำกับ/ของครบทั้งใบ = ไปกับรอบสุดท้าย) */
export interface PartialGate {
  ready: boolean;
  /** เหตุผลที่ยังส่งรอบนี้ไม่ได้ (ไว้โชว์/ลง log) */
  reasons: string[];
  /** เป็นรอบที่เอารูปที่เหลือไปทั้งหมด = ต้องยิงเป็นรอบสุดท้ายแทน */
  isLastRound: boolean;
}

export function partialGate(order: Order, keys: Iterable<string>): PartialGate {
  const sel = new Set(keys);
  const shipped = shippedProofRounds(order);
  const reasons: string[] = [];
  if (!sel.size) reasons.push("ยังไม่ได้เลือกรูปที่จะส่งรอบนี้");
  const uncounted: string[] = [];
  const short: string[] = [];
  const dup: string[] = [];
  const unread = new Set<string>();
  let remaining = 0;
  order.items.forEach((it, i) => {
    proofsOf(it).forEach((p, j) => {
      const k = proofKey(i, j);
      if (!shipped.has(k)) remaining += 1;
      if (!sel.has(k)) return;
      if (shipped.has(k)) dup.push(`${it.name} รูปที่ ${j + 1}`);
      if (!p.pack) uncounted.push(`${it.name} รูปที่ ${j + 1}`);
      else if (p.pack.status === "ไม่ครบ") short.push(`${it.name} รูปที่ ${j + 1} (นับได้ ${p.pack.got ?? 0}/${p.qty ?? "?"})`);
      if (!it.noteAck) unread.add(it.name);
    });
  });
  if (dup.length) reasons.push(`รูปนี้ส่งไปแล้วในรอบก่อน: ${dup.join(", ")}`);
  if (uncounted.length) reasons.push(`ตรวจนับรูปที่จะส่งก่อน: ${uncounted.join(", ")}`);
  if (short.length) reasons.push(`ของไม่ครบ: ${short.join(", ")}`);
  if (unread.size) reasons.push(`ยืนยันอ่านรายละเอียด: ${[...unread].join(", ")}`);
  if (!(order.packPhotos && order.packPhotos.length > 0)) reasons.push("ยังไม่ได้ถ่ายภาพก่อนปิดกล่อง");
  if (hasUnpaidBalance(order)) reasons.push(order.deposit ? "ยังเก็บยอดคงเหลือ (มัดจำ 50%) ไม่ครบ" : "ยังเก็บส่วนต่างที่ตีราคาเพิ่มไม่ครบ");
  // เลือกครบทุกรูปที่เหลือ = รอบสุดท้าย ต้องยิงช่องเลขพัสดุปกติให้ใบปิด (สถานะจัดส่งแล้ว + ด่านเต็ม)
  const isLastRound = sel.size > 0 && remaining > 0 && [...sel].filter((k) => !shipped.has(k)).length >= remaining;
  if (isLastRound) reasons.push("รอบนี้เอารูปที่เหลือไปทั้งหมด = รอบสุดท้าย ให้ยิงที่ช่องเลขพัสดุด้านล่างแทน (ใบจะปิดเป็นจัดส่งแล้ว)");
  return { ready: reasons.length === 0, reasons, isLastRound };
}

export function packGate(order: Order): PackGate {
  const uncounted: PackGate["uncounted"] = [];
  const unread: string[] = [];
  const short: PackGate["short"] = [];
  const unsampled: string[] = [];

  order.items.forEach((it) => {
    if (!it.noteAck) unread.push(it.name);
    if (it.sampleRequired && !it.samplePacked) unsampled.push(it.name);
    proofsOf(it).forEach((p, j) => {
      if (!p.pack) uncounted.push({ item: it.name, index: j + 1 });
      else if (p.pack.status === "ไม่ครบ") short.push({ item: it.name, got: p.pack.got ?? 0, need: p.qty });
    });
  });

  const noPhoto = !(order.packPhotos && order.packPhotos.length > 0);
  const unpaidBalance = hasUnpaidBalance(order);
  const missing = packMissingOf(order);
  const taxInvoiceUnpacked = orderNeedsTaxInvoiceInBox(order) && !order.taxInvoicePacked;

  return {
    ready:
      !uncounted.length &&
      !unread.length &&
      !short.length &&
      !unsampled.length &&
      !noPhoto &&
      !unpaidBalance &&
      !missing.length &&
      !taxInvoiceUnpacked,
    uncounted,
    unread,
    short,
    unsampled,
    noPhoto,
    unpaidBalance,
    missing,
    taxInvoiceUnpacked,
  };
}

/** เหลืออีกกี่วันถึงวันใช้งาน (null = ไม่ได้ระบุ) · ติดลบ = เลยกำหนดแล้ว */
export function daysToUseBy(o: Order): number | null {
  if (!o.useByDate) return null;
  const d = new Date(o.useByDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
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

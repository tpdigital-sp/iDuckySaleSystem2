/**
 * ระบบแจ้งปัญหา / เคลมสินค้า — ชนิดข้อมูลและค่าคงที่ที่ใช้ร่วมกันทั้งฝั่งลูกค้า/หลังบ้าน/เซิร์ฟเวอร์
 * ตัวเคลมเก็บในตาราง claims (id + data jsonb) — ดู supabase/claims.sql
 */

export type ClaimStatus = "ใหม่" | "กำลังตรวจสอบ" | "อนุมัติเคลม" | "ปฏิเสธ" | "เสร็จสิ้น";

export const CLAIM_STATUSES: ClaimStatus[] = ["ใหม่", "กำลังตรวจสอบ", "อนุมัติเคลม", "ปฏิเสธ", "เสร็จสิ้น"];

export const CLAIM_TYPES = ["สินค้าเสียหาย / แตกหัก", "สี / สเปคไม่ตรงที่สั่ง", "ได้รับสินค้าผิด", "จำนวนไม่ครบ", "อื่นๆ"] as const;

/**
 * เดา "ประเภทปัญหา" จากเหตุผลที่แอดมินพิมพ์ตอนกด ♻️ ทำใหม่/เคลม ในหน้าออเดอร์
 * (ชิปเหตุผลในโมดัลนั้นเป็นคนละชุดกับ CLAIM_TYPES — แปลงให้เคสที่เปิดอัตโนมัติจัดกลุ่มได้)
 */
export function claimTypeFromReason(reason: string): (typeof CLAIM_TYPES)[number] {
  const r = reason.toLowerCase();
  if (/สเปค|สี|ขนาด|ผิดแบบ/.test(r)) return "สี / สเปคไม่ตรงที่สั่ง";
  if (/ส่งผิด|ผิดรายการ|ผิดของ/.test(r)) return "ได้รับสินค้าผิด";
  if (/ไม่ครบ|หาย|ขาด/.test(r)) return "จำนวนไม่ครบ";
  if (/เสีย|แตก|ชำรุด|พัง|เพี้ยน|ขนส่ง|ยับ|ลอก/.test(r)) return "สินค้าเสียหาย / แตกหัก";
  return "อื่นๆ";
}

/** ความผิดอยู่ที่ใคร — แอดมินประเมิน (ลูกค้าประเมินเองไม่ได้) · ตัวตัดสินว่าใครจ่าย: ร้าน = ผลิตใหม่ฟรี · ขนส่ง = เคลมขนส่ง · ลูกค้า = คิดเงินปกติ */
export const CLAIM_FAULTS = ["ร้าน", "ขนส่ง", "ลูกค้า", "ไม่ทราบ"] as const;
export type ClaimFault = (typeof CLAIM_FAULTS)[number];

/** ช่องทางที่ลูกค้าแจ้งเข้ามา (เคสที่ทีมงานเปิด) */
export const CLAIM_CHANNELS = ["LINE", "โทร", "หน้าร้าน", "Facebook", "อื่นๆ"] as const;

/** ยื่นเคลมได้ภายในกี่วันหลังจัดส่ง (ตกลงกับทางร้าน 20 ส.ค. 2569) — เกินแล้วให้ทักแอดมินทาง LINE แทน */
export const CLAIM_WINDOW_DAYS = 7;

export interface ClaimMessage {
  by: "customer" | "admin";
  /** ชื่อคนตอบฝั่งร้าน (ฝั่งลูกค้าไม่ต้องมี) */
  name?: string;
  text: string;
  at: string;
}

export interface ClaimResolution {
  action?: "ผลิตใหม่" | "คืนเงิน" | "ส่วนลด/ชดเชย" | "อื่นๆ";
  note?: string;
  /** ออเดอร์ผลิตซ่อมที่เปิดให้ (ผูกกับระบบ redo เดิมของหลังบ้าน) */
  redoOrderId?: string;
}

/** รายการในออเดอร์ที่เคลม — index ชี้ตำแหน่งใน order.items ไว้ส่งต่อเป็น picks ตอนสร้างงานผลิตใหม่ */
export interface ClaimItem {
  index: number;
  name: string;
  qty: number;
}

export interface Claim {
  id: string;
  orderId: string;
  /** uuid บัญชีลูกค้า — ไม่มีเมื่อแอดมินเปิดเคสให้ออเดอร์ที่สั่งโดยไม่ล็อกอิน (ลูกค้าจะไม่เห็นในหน้า /account/claims แต่ยังได้แจ้งเตือน LINE ผ่านออเดอร์) */
  customerId?: string;
  /** web = ลูกค้ายื่นเองจากหน้าบัญชี · admin = ทีมงานเปิดเคสให้ (จากปุ่ม ♻️ ทำใหม่/เคลม ในหน้าออเดอร์) — ไม่มี = เคสเก่าก่อนมีฟิลด์นี้ ถือเป็น web */
  source?: "web" | "admin";
  /** ชื่อทีมงานที่เปิดเคส (เฉพาะ source admin) */
  createdBy?: string;
  /** ช่องทางที่ลูกค้าแจ้งเข้ามา (เฉพาะ source admin) */
  channel?: string;
  /**
   * 📄 ใบนอกระบบ — orderId เป็นเลขที่ทีมงานพิมพ์เอง ไม่มีแถวในตาราง orders (ใบจากระบบเก่า/ขายหน้าร้าน)
   * ผลที่ตามมา: ยิง LINE อัตโนมัติไม่ได้ (ไม่มีช่องทางของลูกค้า) · กดสร้างงานผลิตใหม่จากเคสไม่ได้ (ไม่มีสเปคให้ก๊อป)
   * ชื่อ/เบอร์/รายการที่เสีย มาจากที่ทีมงานกรอกเอง ไม่ใช่สแนปช็อตจากใบ
   */
  legacy?: true;
  /** ลิงก์ใบในระบบเก่า (backoffice) ที่ทีมงานวางมา — ไว้กดเปิดจากการ์ดเคลม · http/https เท่านั้น */
  legacyUrl?: string;
  /** ที่อยู่ลูกค้าจากใบเก่า (ไม่มีใบให้เปิดดู ต้องเก็บไว้เองถ้าจะส่งของชดเชย) */
  legacyAddress?: string;
  /** ความผิดอยู่ที่ใคร — แอดมินประเมิน แก้ได้ทีหลังในหน้าเคลม */
  fault?: ClaimFault;
  /** สแนปช็อตไว้ให้แอดมินติดต่อ ไม่ต้องไล่เปิดออเดอร์ */
  customer?: string;
  phone?: string;
  /** รายการสินค้าที่เคลม (ชื่อ ณ ตอนยื่น) — ว่าง = ทั้งออเดอร์ */
  itemNames?: string[];
  /** รายการแบบมี index+จำนวน (เคสที่แอดมินเปิด) — ใช้เป็น picks ตอนสร้างงานผลิตใหม่จากหน้าเคลม */
  items?: ClaimItem[];
  type: string;
  detail: string;
  /** path ใน bucket ส่วนตัว claim-photos — URL เซ็นสดตอนอ่าน ไม่เก็บลงฐาน */
  photoPaths: string[];
  /** เติมโดย API ตอนอ่าน (อายุ 1 ชม.) */
  photoUrls?: string[];
  status: ClaimStatus;
  resolution?: ClaimResolution;
  messages: ClaimMessage[];
  createdAt: string;
  updatedAt?: string;
  log?: { at: string; by: string; action: string }[];
}

/**
 * 🔗 ใบจากระบบเก่า — วางลิงก์ backoffice มาทั้งเส้นได้เลย ระบบถอดเลขใบให้เอง
 * (ท่าเดียวกับวางลิงก์ FlowAccount/ลิงก์หน้าสินค้าในหน้าคลัง — คนทำงานก๊อปจากแท็บที่เปิดอยู่ ไม่ต้องมานั่งพิมพ์เลข)
 * รูปแบบที่รู้จัก: …/review-order?d=<base64 ของเลขใบ>  เช่น ?d=ODE1NDE → 81541
 * อย่างอื่นที่เป็น URL ก็รับ แต่จะใช้ชื่อโฮสต์+ส่วนท้ายพาธเป็นคำอ้างอิงแทน
 * ref คือค่าที่เก็บเป็น orderId ของเคส (ใช้กันเปิดเคสซ้ำใบเดียวกันด้วย) — ต้องนิ่งไม่ว่าจะวางลิงก์แบบไหน
 */
export function parseLegacyOrderRef(input: string): { ref: string; url?: string } {
  // ก๊อปมาจากแชท/โน้ตมักติดเครื่องหมายท้ายลิงก์มาด้วย (…?d=ODE1NDE, ) — ตัดทิ้งก่อน ไม่งั้นถอด base64 ไม่ออก
  const text = input.trim().replace(/[\s,.;:'"’”)\]}»।]+$/u, "");
  if (!/^https?:\/\//i.test(text)) return { ref: text };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ref: text };
  }
  const d = u.searchParams.get("d")?.replace(/[^A-Za-z0-9+/=_-]/g, "");
  if (d) {
    try {
      const raw = d.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
      const id = atob(raw + "=".repeat((4 - (raw.length % 4)) % 4));
      if (/^[A-Za-z0-9._-]{1,32}$/.test(id)) return { ref: `#${id}`, url: text };
    } catch {
      /* ถอดไม่ออก = ไม่ใช่ base64 ตกไปใช้ท่าสำรองข้างล่าง */
    }
  }
  const last = u.pathname.split("/").filter(Boolean).pop();
  return { ref: last ? `${u.hostname}/${last}` : u.hostname, url: text };
}

/** ผลการแกะข้อมูลจากใบระบบเก่าที่ทีมงานก๊อปมาวาง */
export interface LegacyPasteResult {
  customer?: string;
  phone?: string;
  address?: string;
  items: { index: number; name: string; detail?: string; qty: number }[];
}

const NUMERIC_CELL = /^[\d,]+(?:\.\d+)?$/;

/**
 * 📋 แกะข้อมูลลูกค้า + รายการ จากหน้าใบของระบบเก่า (backoffice) ที่ก๊อปมาทั้งหน้า
 *
 * ทำไมต้องแกะจากข้อความ: ใบเก่าอยู่คนละเว็บ ข้อมูลมาจาก POST /user/get-review-order-info
 * ที่อยู่หลังประตูล็อกอินของระบบนั้น — ฝั่งเราเรียกเองไม่ได้ถ้าไม่มี API/โทเคนจากเขา
 * แต่คนที่กำลังทำงานเปิดใบนั้นค้างอยู่แล้ว Ctrl+A Ctrl+V มาวางถูกกว่าพิมพ์ใหม่ทุกช่อง
 *
 * ท่าคัดลอกจากตาราง HTML ออกมาได้ 2 แบบ (แท็บคั่นช่อง / ช่องละบรรทัด) — ยุบแท็บเป็นบรรทัดก่อน
 * แล้วใช้กติกาเดียวจบ: เลขโดด ๆ = คอลัมน์ # ขึ้นรายการใหม่ · ตัวเลขที่ต่อกันท้ายบล็อก = จำนวน/ราคาต่อหน่วย/ยอดรวม
 */
export function parseLegacyOrderPaste(text: string): LegacyPasteResult {
  const lines = text
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .flatMap((l) => l.split("\t"))
    .map((l) => l.trim());
  const out: LegacyPasteResult = { items: [] };

  // ── บล็อก "ที่อยู่ลูกค้า": ชื่อ → ที่อยู่หลายบรรทัด → โทร. ──
  const addrHead = lines.findIndex((l) => /^ที่อยู่(ลูกค้า|ผู้รับ|จัดส่ง)/.test(l));
  if (addrHead >= 0) {
    const block: string[] = [];
    for (let i = addrHead + 1; i < lines.length && block.length < 10; i++) {
      const l = lines[i];
      if (!l) {
        if (block.length) break;
        continue;
      }
      if (block.length && /^(รายการ|ที่อยู่|#|รูปภาพ|รายละเอียด)/.test(l)) break;
      block.push(l);
      if (/^โทร/.test(l)) break;
    }
    const phoneLine = block.find((l) => /^โทร/.test(l));
    if (phoneLine) out.phone = (phoneLine.match(/[\d][\d\s-]{7,}/) ?? [""])[0].replace(/[\s-]/g, "");
    const body = block.filter((l) => !/^โทร/.test(l));
    if (body[0]) out.customer = body[0];
    if (body.length > 1) out.address = body.slice(1).join(" ");
  }

  // ── ตาราง "รายการ" ──
  const head = lines.findIndex((l) => /^รายการ$/.test(l) || (/รายละเอียด/.test(l) && /จำนวน/.test(l)));
  // ตัดท้ายที่แถวสรุปบิล ไม่ให้ยอดรวมทั้งใบถูกนับเป็นจำนวนของรายการสุดท้าย
  const tailAt = lines.findIndex(
    (l, i) => i > (head < 0 ? 0 : head) && /^(รวมเป็นเงิน|ยอดรวมทั้งสิ้น|รวมทั้งสิ้น|ยอดสุทธิ|ค่าจัดส่ง|ค่าส่ง|ส่วนลด)/.test(l)
  );
  const from = head >= 0 ? head + 1 : 0;
  const to = tailAt > from ? tailAt : lines.length;

  /** ตำแหน่งของเลขโดด ๆ ที่เป็นคอลัมน์ # (1, 2, 3 …) */
  const marks: number[] = [];
  for (let i = from; i < to; i++) if (/^\d{1,3}$/.test(lines[i]) && Number(lines[i]) === marks.length + 1) marks.push(i);

  marks.forEach((at, n) => {
    const end = n + 1 < marks.length ? marks[n + 1] : to;
    const body = lines.slice(at + 1, end).filter(Boolean);
    // ตัวเลขที่เกาะกันอยู่ท้ายบล็อก = จำนวน · ราคาต่อหน่วย · ยอดรวม (ตัวแรกคือจำนวน)
    let cut = body.length;
    while (cut > 0 && NUMERIC_CELL.test(body[cut - 1])) cut--;
    const qty = Math.max(1, Math.floor(Number((body[cut] ?? "").replace(/,/g, "")) || 1));
    const texts = body.slice(0, cut);
    const name = texts[0];
    if (!name) return;
    if (out.items.length >= 30) return;
    out.items.push({
      index: out.items.length,
      name,
      ...(texts.length > 1 ? { detail: texts.slice(1).join("\n") } : {}),
      qty,
    });
  });

  return out;
}

/** สีป้ายสถานะฝั่งหลังบ้าน (Tailwind) */
export const CLAIM_STATUS_STYLES: Record<ClaimStatus, string> = {
  ใหม่: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  กำลังตรวจสอบ: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  อนุมัติเคลม: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  ปฏิเสธ: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
  เสร็จสิ้น: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

/** เคลมที่ยังเดินเรื่องอยู่ (ไว้ขึ้น badge) */
export const isOpenClaim = (c: Claim) => c.status === "ใหม่" || c.status === "กำลังตรวจสอบ" || c.status === "อนุมัติเคลม";

/**
 * เคสที่ "ยังไม่มีใครตอบลูกค้าเลย" — ตัวเลขที่ต้องเป็นศูนย์ทุกวัน (ป้ายข้างเมนู + HeroStat หน้าเคลม ใช้ตัวนี้ตัวเดียว)
 * เคสที่ทีมงานเปิดเองถือว่าคุยกับลูกค้าแล้ว (เปิดจากแชท LINE/โทร) ไม่งั้นจะติดป้าย "ค้าง ยังไม่ตอบ" ตลอดกาล
 */
export const needsReply = (c: Claim) => isOpenClaim(c) && c.source !== "admin" && !(c.messages ?? []).some((m) => m.by === "admin");

"use client";

/**
 * 🔗 ลิงก์ออเดอร์ที่เคยเปิดในเครื่องนี้ — เจ้าของร้านสั่ง 21 ก.ย. 69
 *
 * ทำไมต้องมี: ออเดอร์ของลูกค้าที่ "ไม่ได้ล็อกอิน" เปิดได้ทางเดียวคือลิงก์ /order/<id>?key=<กุญแจลับ>
 * ซึ่งโชว์ครั้งเดียวบนหน้าสั่งซื้อสำเร็จ — ปิดเบราว์เซอร์แล้วลิงก์หายไปเลย ลูกค้าเลยพยายาม "เข้าสู่ระบบ"
 * ทั้งที่ไม่เคยสมัคร → ขึ้นรหัสผ่านไม่ถูก → กดลืมรหัสก็ไม่มีอีเมลมา (เพราะไม่มีบัญชีอีเมลนั้นจริง)
 * เคสจริง 21 ก.ย. 69: แอดมินต้องส่งลิงก์ให้ทางไลน์เอง
 *
 * ที่นี่จึงเก็บลิงก์ไว้ในเครื่องให้อัตโนมัติ (ตอนสั่งสำเร็จ + ทุกครั้งที่เปิดหน้าออเดอร์)
 * แล้วหน้า /order/find เอามาโชว์เป็น "ออเดอร์ล่าสุดของคุณ" กดเข้าได้เลยโดยไม่ต้องล็อกอิน
 *
 * ⚠️ กุญแจลับอยู่ในเครื่องลูกค้าเท่านั้น (localStorage ของโดเมนร้าน) ไม่ได้ส่งไปไหน
 *    คนละเครื่อง/ล้างประวัติ = หาย → ยังมีทางที่สองคือค้นด้วยเบอร์โทร + เลขออเดอร์ที่ /order/find
 */

const KEY = "ducky_order_links";
/** เก็บกี่ใบ — พอให้ลูกค้าประจำย้อนดูได้ แต่ไม่กิน localStorage */
const MAX = 20;
/** เก่ากว่านี้ตัดทิ้ง (วัน) — งานพิมพ์จบภายในไม่กี่สัปดาห์ ครึ่งปีถือว่าเลิกใช้แล้ว */
const MAX_AGE_DAYS = 180;

export interface OrderLink {
  id: string;
  /** กุญแจลับของออเดอร์ (ไม่มี = ออเดอร์เก่าก่อนมีระบบ key เปิดด้วยเลขออเดอร์อย่างเดียวได้) */
  key?: string;
  /** เวลาที่บันทึก/เปิดล่าสุด (ISO) — ใช้เรียงใหม่→เก่า และตัดใบเก่า */
  at: string;
  /** ชื่อผู้รับ + ยอดรวม ไว้โชว์ในการ์ดโดยไม่ต้องยิง API */
  name?: string;
  total?: number;
}

function read(): OrderLink[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as OrderLink[];
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return list
      .filter((l) => l && typeof l.id === "string" && l.id)
      .filter((l) => {
        const t = Date.parse(l.at ?? "");
        return !Number.isFinite(t) || t >= cutoff;
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  } catch {
    return [];
  }
}

function write(list: OrderLink[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* พื้นที่เต็ม/โหมดส่วนตัว — ไม่เป็นไร ยังค้นด้วยเบอร์โทรได้ */
  }
}

/** ออเดอร์ที่เคยเปิดในเครื่องนี้ (ใหม่→เก่า) */
export function readOrderLinks(): OrderLink[] {
  return read();
}

/**
 * จำลิงก์ออเดอร์ไว้ — เรียกได้บ่อยเท่าที่ต้องการ (ใบเดิมจะถูกอัปเดตเวลา ไม่ซ้ำ)
 * ฟิลด์ที่ไม่ได้ส่งมาจะคงค่าเดิมไว้ (เช่น เปิดหน้าออเดอร์ทีหลังแล้วยังไม่รู้ยอด)
 */
export function rememberOrderLink(link: { id: string; key?: string; name?: string; total?: number }) {
  if (!link.id) return;
  const list = read();
  const old = list.find((l) => l.id === link.id);
  const next: OrderLink = {
    id: link.id,
    key: link.key || old?.key,
    at: new Date().toISOString(),
    name: link.name ?? old?.name,
    total: link.total ?? old?.total,
  };
  write([next, ...list.filter((l) => l.id !== link.id)]);
}

/** ลืมออเดอร์ใบนี้ (ลูกค้ากดเอาออกจากรายการในเครื่อง) */
export function forgetOrderLink(id: string) {
  write(read().filter((l) => l.id !== id));
}

/** ลิงก์เปิดออเดอร์ */
export function orderLinkHref(l: Pick<OrderLink, "id" | "key">): string {
  return `/order/${encodeURIComponent(l.id)}${l.key ? `?key=${encodeURIComponent(l.key)}` : ""}`;
}

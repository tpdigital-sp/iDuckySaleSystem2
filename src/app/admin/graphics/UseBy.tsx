"use client";

import { daysToUseBy, type Order, type OrderStatus } from "@/lib/admin-data";
import { shipWindowForUseBy } from "@/lib/ship-date";

/** ใบที่จบไปแล้ว — ตัวนับ "เลยกำหนด N วัน" ไม่มีความหมาย ไม่ต้องขึ้น */
const DONE: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/** "2569-09-07" (ค.ศ.ในช่องวันที่) → "7 ก.ย. 2569" ให้ตรงกับที่ทีมคุยกัน */
export const thaiDay = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ช่วงวันส่งของใบนี้ (YYYY-MM-DD) — เอาที่แอดมินตั้งไว้ใน Order.shipDate ก่อน
 * ใบเก่าที่ยังไม่มี shipDate แต่มีวันใช้งาน → คิดให้ตามกติกาเดียวกับตอนสร้างออเดอร์ (ก่อนใช้งาน 1–2 วันทำการ)
 */
export function shipRangeOf(o: Order): { from: string; to: string; auto: boolean } | null {
  const from = YMD.test(o.shipDate?.from ?? "") ? o.shipDate!.from! : "";
  const to = YMD.test(o.shipDate?.to ?? "") ? o.shipDate!.to! : "";
  if (from || to) return { from: from || to, to: to || from, auto: false };
  if (!o.useByDate) return null;
  const w = shipWindowForUseBy(o.useByDate);
  return w ? { from: w.from, to: w.to, auto: true } : null;
}

/** "10–11 ก.ย. 2569" · คนละเดือน "30 ก.ย. – 1 ต.ค. 2569" · วันเดียว "11 ก.ย. 2569" */
export function shipRangeLabel(from: string, to: string): string {
  if (from === to) return thaiDay(from);
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}–${thaiDay(to)}`;
  const noYear = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  if (a.getFullYear() === b.getFullYear()) return `${noYear(a)} – ${thaiDay(to)}`;
  return `${thaiDay(from)} – ${thaiDay(to)}`;
}

/** ป้าย 🚚 วันส่ง (จาก–ถึง) วางต่อจากป้ายวันใช้งาน */
function ShipBadge({ r }: { r: NonNullable<ReturnType<typeof shipRangeOf>> }) {
  return (
    <span
      className="shipdate"
      title={
        (r.auto ? "วันส่งที่ควรเป็น (คิดจากวันใช้งาน ยังไม่ได้ตั้งในใบ): " : "วันที่จัดส่งที่ตั้งไว้ในใบ: ") +
        shipRangeLabel(r.from, r.to)
      }
    >
      🚚 ส่ง {shipRangeLabel(r.from, r.to)}
    </span>
  );
}

/**
 * วันใช้งานที่ลูกค้าแจ้งมา (Order.useByDate) — ตัวนับวัน + ป้ายม่วง 📅 วันที่จริง + ป้ายฟ้า 🚚 วันส่ง (จาก–ถึง)
 * หน้าตาเดียวกับหน้ารายการออเดอร์: ใกล้กำหนด ≤3 วัน หรืองานเร่ง → ป้ายแดงตัวหนังสือขาว
 * ใช้ได้ทั้งใน RowMain meta (.dkb-meta) และวางเดี่ยว ๆ ในหัวกลุ่ม (คลาส dkb-useby รับสไตล์เอง)
 * ไม่ได้ระบุวันใช้งาน → ป้ายเหลืองตัวหนา "⚠ ไม่ระบุวันใช้งาน" ให้สะดุดตาว่าต้องถามลูกค้า (ถ้าแอดมินตั้งวันส่งไว้ก็ยังโชว์ 🚚)
 * คืน null เฉพาะใบที่จบไปแล้ว
 */
export default function UseBy({ o }: { o: Order }) {
  if (DONE.includes(o.status)) return null;
  const left = o.useByDate ? daysToUseBy(o) : null;
  const ship = shipRangeOf(o); // ไม่มีทั้งวันส่งและวันใช้งาน = ไม่ขึ้นป้าย 🚚
  if (left === null || !o.useByDate) {
    return (
      <>
        <span className="dkb-useby none" title="ลูกค้าไม่ได้แจ้งวันใช้งานมา — ถามลูกค้าก่อนจัดคิว">
          ⚠ ไม่ระบุวันใช้งาน
        </span>
        {ship && (
          <span className="dkb-useby">
            <ShipBadge r={ship} />
          </span>
        )}
      </>
    );
  }
  const hot = left <= 3;
  return (
    <span
      className={hot ? "dkb-useby hot" : "dkb-useby"}
      data-rush={o.rush ? "1" : undefined}
      title={`ลูกค้าแจ้งวันใช้งาน ${thaiDay(o.useByDate)}`}
    >
      {left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : left === 0 ? "ใช้งานวันนี้" : `ใช้งานอีก ${left} วัน`}
      <span className="usedate">📅 ใช้งาน {thaiDay(o.useByDate)}</span>
      {ship && <ShipBadge r={ship} />}
    </span>
  );
}

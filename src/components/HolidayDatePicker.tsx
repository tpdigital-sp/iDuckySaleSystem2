"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, holidayName, weekdayOf } from "@/lib/ship-date";
import { useShopHolidays } from "@/lib/use-shop-holidays";
import Portal from "@/components/Portal";

/**
 * 📅 ช่องเลือกวันที่แบบปฏิทินของร้านเอง — แทน <input type="date"> ที่ระบายสีวัน/ปิดวันรายวันไม่ได้
 * เจ้าของร้านสั่ง 17 ก.ย. 69: "ปฏิทินแสดงเป็นสีแดงในวันหยุด และจิ้มวันที่กระชั้นชิดเกินไปไม่ได้"
 *  - วันหยุดร้าน (เสาร์-อาทิตย์ + ปฏิทิน TP-Leader ผ่าน useShopHolidays) = ตัวแดงพื้นแดงอ่อน + จุดใต้เลข (ไม่พึ่งสีอย่างเดียว)
 *  - วันที่เลือกไม่ได้ (ก่อน min / blocked() คืนเหตุผล) = เทา ขีดฆ่า กดไม่ติด · แตะค้างเห็นเหตุผลใน title
 *  - ใช้ทั้งหน้าร้าน (ตะกร้า) และหลังบ้าน (หน้าออเดอร์) — หน้าตาปุ่มเปิดส่งมาทาง className ของแต่ละจอ
 * ค่าเข้า-ออกเป็นข้อความ YYYY-MM-DD ล้วน ๆ (ค.ศ.) เหมือน input date เดิม · จอแสดงเป็น พ.ศ.
 */
export interface HolidayDatePickerProps {
  id?: string;
  value: string;
  onChange: (ymd: string) => void;
  /** วันแรกที่เลือกได้ (YYYY-MM-DD) — วันก่อนหน้านี้กดไม่ติด */
  min?: string;
  /** ข้อความบอกว่าทำไมวันก่อน min เลือกไม่ได้ (ขึ้นใต้ปฏิทิน + title ของวัน) */
  minReason?: string;
  /** false = วันหยุดร้านกดไม่ติดด้วย (ใช้กับ "วันที่จัดส่ง" — ร้านหยุดไม่ส่งของ) · ค่าเริ่มต้น true = แดงแต่เลือกได้ (วันใช้งานของลูกค้า) */
  holidaySelectable?: boolean;
  /** มีปุ่ม "ล้างวันที่" ในปฏิทินไหม */
  clearable?: boolean;
  placeholder?: string;
  /** คลาสของปุ่มเปิดปฏิทิน (หน้าตาช่องกรอกของจอนั้น ๆ) */
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_DOW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** วันนี้ตามนาฬิกาเครื่องคนใช้ (YYYY-MM-DD) — ไว้วาดกรอบ "วันนี้" อย่างเดียว ไม่ใช้ตัดสินกติกา */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "ศ. 18 ก.ย. 2569" */
function thaiLabel(ymd: string): string {
  const m = YMD.exec(ymd);
  if (!m) return "";
  return `${TH_DOW[weekdayOf(ymd)]}. ${Number(m[3])} ${TH_MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

/** เหตุผลที่วันนี้ร้านหยุด · undefined = วันทำการ */
function offReason(ymd: string): string | undefined {
  const h = holidayName(ymd);
  if (h) return `วันหยุดร้าน · ${h}`;
  const wd = weekdayOf(ymd);
  return wd === 0 || wd === 6 ? `ร้านหยุดวัน${TH_DOW_FULL[wd]}` : undefined;
}

export default function HolidayDatePicker({
  id,
  value,
  onChange,
  min,
  minReason,
  holidaySelectable = true,
  clearable = true,
  placeholder = "เลือกวันที่",
  className = "",
  style,
  ariaLabel,
}: HolidayDatePickerProps) {
  // วันหยุดจากปฏิทินร้านโหลดเสร็จ → hook ขยับ state ให้ปฏิทินวาดสีแดงใหม่เอง
  useShopHolidays();
  const [open, setOpen] = useState(false);
  /** เดือนที่กำลังดู "YYYY-MM" */
  const [view, setView] = useState("");
  /**
   * ตำแหน่งปฏิทินบนจอ (position: fixed แขวนที่ body ผ่าน Portal) — การ์ดหลังบ้านเป็น overflow-hidden วางแบบ absolute โดนตัดขอบ
   * และมีกรอบบรรพบุรุษที่ทำให้ fixed ไม่เทียบกับจอ (ลองแล้วปฏิทินหลุดไปนอกจอ) → ต้องออกไปอยู่ที่ body
   * คิดจากกรอบของช่อง: ไม่ล้นขอบซ้าย/ขวาจอ · ที่ว่างข้างล่างไม่พอ = เปิดขึ้นข้างบนแทน
   */
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // หน้าเลื่อน/จอหมุน → ปฏิทินตามช่องไปด้วย (fixed ไม่ขยับเอง)
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // วาดเสร็จ/เปลี่ยนเดือน → ความสูงจริงเปลี่ยน (5–6 แถว + รายชื่อวันหยุด) จัดตำแหน่งใหม่ด้วยความสูงจริง
  useEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  function toggle() {
    if (open) return setOpen(false);
    const today = localToday();
    // เปิดที่เดือนของค่าที่เลือกไว้ · ยังไม่เลือก = เดือนของวันแรกที่เลือกได้ (ไม่ต้องกดหาเอง)
    const start = YMD.test(value) ? value : min && min > today ? min : today;
    setView(start.slice(0, 7));
    place();
    setOpen(true);
  }

  function place() {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - width));
    // ความสูงจริงของปฏิทิน (รอบแรกยังไม่ได้วาด ใช้ค่าประมาณ 6 แถว + คำอธิบาย)
    const h = popRef.current?.offsetHeight || 460;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // ข้างล่างพอ = เปิดลง · ไม่พอแต่ข้างบนพอ = เปิดขึ้น · ไม่พอทั้งคู่ (จอเตี้ย) = ดันให้อยู่ในจอทั้งใบ ยอมทับช่อง
    const top = below >= h ? r.bottom + 4 : above >= h ? r.top - 4 - h : Math.max(8, window.innerHeight - 8 - h);
    setPos({ left, top });
  }

  function shiftMonth(n: number) {
    const [y, m] = view.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    setView(`${Math.floor(t / 12)}-${pad((t % 12) + 1)}`);
  }

  const [vy, vm] = (view || localToday().slice(0, 7)).split("-").map(Number);
  const first = `${vy}-${pad(vm)}-01`;
  const gridStart = addDays(first, -weekdayOf(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // แถวที่ 6 ว่างทั้งแถว (ของเดือนถัดไปล้วน) ไม่ต้องวาด
  const cells = days[35].slice(0, 7) === first.slice(0, 7) ? days : days.slice(0, 35);
  const today = localToday();
  const monthHolidays = cells.filter((d) => d.slice(0, 7) === first.slice(0, 7) && holidayName(d));
  const canGoPrev = !min || first > min;

  return (
    <div ref={wrapRef} className="relative inline-block max-w-full">
      <button
        type="button"
        id={id}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 text-left tabular-nums ${className}`}
        style={style}
      >
        <span className={value ? "" : "opacity-50"}>{value ? thaiLabel(value) : placeholder}</span>
        <span aria-hidden>📅</span>
      </button>

      {open && (
        <Portal>
        <div
          ref={popRef}
          role="dialog"
          aria-label="เลือกวันที่"
          className="fixed z-[1000] max-h-[calc(100vh-1rem)] w-[20rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-300 bg-white p-2 text-slate-800 shadow-xl"
          style={pos}
        >
          <div className="flex items-center justify-between gap-1 px-1 pb-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              disabled={!canGoPrev}
              aria-label="เดือนก่อนหน้า"
              className="h-11 w-11 rounded-lg text-xl font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            <p className="text-[15px] font-extrabold text-slate-900">
              {TH_MONTHS[vm - 1]} {vy + 543}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="เดือนถัดไป"
              className="h-11 w-11 rounded-lg text-xl font-bold text-slate-600 hover:bg-slate-100"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[12px] font-bold">
            {TH_DOW.map((d, i) => (
              <span key={d} className={`py-1 ${i === 0 || i === 6 ? "text-red-600" : "text-slate-500"}`}>
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d) => {
              const inMonth = d.slice(0, 7) === first.slice(0, 7);
              const off = offReason(d);
              const tooSoon = !!min && d < min;
              const blockedWhy = tooSoon ? (minReason ?? "กระชั้นเกินไป เลือกไม่ได้") : off && !holidaySelectable ? `${off} — ไม่ส่งของ` : undefined;
              const selected = d === value;
              const tone = selected
                ? "bg-sky-700 font-extrabold text-white"
                : blockedWhy
                  ? off
                    ? "cursor-not-allowed bg-red-50 text-red-300 line-through"
                    : "cursor-not-allowed text-slate-300 line-through"
                  : off
                    ? "bg-red-100 font-bold text-red-700 hover:bg-red-200"
                    : "font-semibold text-slate-800 hover:bg-sky-100";
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!!blockedWhy}
                  aria-pressed={selected}
                  aria-label={`${thaiLabel(d)}${off ? ` · ${off}` : ""}${blockedWhy ? " · เลือกไม่ได้" : ""}`}
                  title={blockedWhy ?? off}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`relative h-11 rounded-lg text-[15px] tabular-nums ${tone} ${inMonth ? "" : "opacity-45"} ${
                    d === today && !selected ? "ring-2 ring-inset ring-sky-600" : ""
                  }`}
                >
                  {Number(d.slice(8))}
                  {/* จุดใต้เลข = วันหยุด — ให้แยกออกแม้จอสีเพี้ยน/มองกลางแดด */}
                  {off && <span aria-hidden className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? "bg-white" : blockedWhy ? "bg-red-300" : "bg-red-600"}`} />}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 space-y-1 border-t border-slate-200 px-1 pt-1.5 text-[11.5px] leading-snug text-slate-600">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-block h-3 w-3 rounded bg-red-100 ring-1 ring-red-400" />
                <span className="font-bold text-red-700">ร้านหยุด</span>
                {holidaySelectable ? "" : " (ไม่ส่งของ)"}
              </span>
              {min && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="text-slate-400 line-through">12</span> เลือกไม่ได้
                </span>
              )}
            </p>
            {min && minReason && <p className="font-semibold text-slate-700">⛔ {minReason}</p>}
            {monthHolidays.map((d) => (
              <p key={d} className="text-red-700">
                <span className="font-bold tabular-nums">{Number(d.slice(8))} {TH_MONTHS_SHORT[vm - 1]}</span> {holidayName(d)}
              </p>
            ))}
          </div>

          {clearable && value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-1 h-11 w-full rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-100"
            >
              ล้างวันที่
            </button>
          )}
        </div>
        </Portal>
      )}
    </div>
  );
}

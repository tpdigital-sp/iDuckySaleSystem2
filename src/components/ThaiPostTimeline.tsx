"use client";

import { useState } from "react";

/**
 * สถานะพัสดุสไตล์เว็บไปรษณีย์ไทย — stepper 4 ขั้น (รับเข้าระบบ → ระหว่างขนส่ง →
 * ออกไปนำจ่าย → นำจ่ายสำเร็จ) + timeline จุดเขียวไล่เหตุการณ์ (ล่าสุดอยู่บน)
 * ใช้ทั้งหน้าออเดอร์ลูกค้าและหลังบ้าน
 */

export interface ThpEventView {
  /** รหัสสถานะ ปณ. เช่น 103 รับฝาก · 2xx ขนส่ง · 4xx นำจ่าย · 501 นำจ่ายสำเร็จ */
  status: string;
  description: string;
  location?: string;
  at: string;
}

const STEPS = [
  { icon: "📦", label: "รับเข้าระบบ" },
  { icon: "🚚", label: "ระหว่างขนส่ง" },
  { icon: "🛵", label: "ออกไปนำจ่าย" },
  { icon: "✅", label: "นำจ่ายสำเร็จ" },
];

/** เหตุการณ์ → อยู่ขั้นไหนของ stepper (นับจากรหัสสถานะสูงสุดที่เคยเกิด) */
function stageOf(events: ThpEventView[]): number {
  const codes = events.map((e) => parseInt(e.status, 10) || 0);
  if (codes.some((c) => c === 501)) return 4; // นำจ่ายสำเร็จ
  const max = Math.max(0, ...codes);
  if (max >= 400) return 3; // ออกไปนำจ่าย/รอนำจ่าย
  if (max >= 200) return 2; // เดินทางระหว่างศูนย์
  if (max >= 100) return 1; // รับฝากเข้าระบบ
  return 0;
}

/** "31/07/2569 16:02:44+07:00" → "31/07/2569 16:02 น." */
function fmtAt(at: string): string {
  const m = at.match(/^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]} น.` : at;
}

/**
 * foldFrom = จำนวนเหตุการณ์ล่าสุดที่โชว์ไว้ก่อน ที่เหลือพับไว้ใต้ปุ่ม "ดูอีก N รายการ"
 * (ใบที่มีหลายพัสดุ — แบ่งส่ง/หลายกล่อง — กางไทม์ไลน์เต็มทุกอันแล้วหน้ายาวจนหาเลขไม่เจอ · 23 ก.ย. 69)
 * ไม่ใส่ = กางทั้งหมดเหมือนเดิม
 */
export default function ThaiPostTimeline({ events, foldFrom }: { events: ThpEventView[]; foldFrom?: number }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  const stage = stageOf(events);
  const folded = !!foldFrom && !open && events.length > foldFrom;
  const shown = folded ? [...events].reverse().slice(0, foldFrom) : [...events].reverse();

  return (
    <div>
      {/* ── stepper 4 ขั้น ── */}
      <div className="flex items-start">
        {STEPS.map((s, i) => {
          const active = stage >= i + 1;
          const current = stage === i + 1 && stage < 4;
          return (
            <div key={s.label} className="flex min-w-0 flex-1 items-start">
              {i > 0 && (
                <div className={`mt-4 h-1 flex-1 rounded-full ${stage >= i + 1 ? "bg-red-500" : "bg-slate-200"}`} />
              )}
              <div className="flex w-14 shrink-0 flex-col items-center">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-full text-base shadow-sm ring-2 ${
                    active ? "bg-red-500 ring-red-500" : "bg-slate-100 ring-slate-200 grayscale"
                  } ${current ? "animate-pulse" : ""}`}
                >
                  <span className={active ? "drop-shadow" : "opacity-60"}>{s.icon}</span>
                </div>
                <p
                  className={`mt-1 text-center text-[9px] font-bold leading-tight ${
                    active ? "text-red-600" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── timeline เหตุการณ์ (ล่าสุดอยู่บน) ── */}
      <ul className="mt-3 space-y-0">
        {shown.map((e, i, arr) => (
          <li key={`${e.at}-${i}`} className="relative flex gap-2.5 pb-3 last:pb-0">
            {/* เส้นประเชื่อมจุด */}
            {i < arr.length - 1 && (
              <span className="absolute left-[7px] top-4 h-[calc(100%-8px)] border-l-2 border-dashed border-emerald-200" />
            )}
            <span
              className={`relative z-[1] mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black text-white ${
                i === 0 ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-emerald-400"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className={`text-xs leading-snug ${i === 0 ? "font-extrabold text-slate-800" : "font-semibold text-slate-600"}`}>
                {e.description}
                {e.location ? <span className="font-normal text-slate-400"> [ {e.location} ]</span> : null}
              </p>
              <p className="text-[10px] tabular-nums text-slate-400">{fmtAt(e.at)}</p>
            </div>
          </li>
        ))}
      </ul>
      {/* พับไว้ก่อน — คนอ่านอยากรู้ "ล่าสุดอยู่ไหน" ก่อน ประวัติเต็มกดดูได้ */}
      {!!foldFrom && events.length > foldFrom && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 min-h-[36px] w-full rounded-lg bg-slate-50 px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
        >
          {open ? "▴ ย่อประวัติการเดินทาง" : `▾ ดูประวัติการเดินทางทั้งหมด (${events.length} รายการ)`}
        </button>
      )}
    </div>
  );
}

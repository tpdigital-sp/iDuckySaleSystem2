"use client";

import { ORDER_STEPS, STEP_OF, type OrderStatus } from "@/lib/admin-data";

/**
 * ความคืบหน้าออเดอร์แบบจุด 5 ขั้น
 * — ขั้นที่ผ่านแล้ว = ฟ้าแบรนด์ · ขั้นที่กำลังทำ = เหลืองเป็ดมีวงเรือง · ยังไม่ถึง = เทาโปร่ง
 */
export default function StepDots({ status }: { status: OrderStatus }) {
  const step = STEP_OF[status];

  if (step < 0) {
    return <p className="text-xs font-semibold text-stone-400">ยกเลิกแล้ว</p>;
  }

  return (
    <div>
      <div className="flex items-center" aria-hidden>
        {ORDER_STEPS.map((label, i) => {
          const done = i < step;
          const now = i === step;
          return (
            <span key={label} className="flex flex-1 items-center last:flex-none">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                  now
                    ? "border-ducky-dark bg-ducky ring-[3px] ring-ducky/40"
                    : done
                      ? "border-amber-500 bg-amber-500"
                      : "border-slate-300 bg-white"
                }`}
              />
              {i < ORDER_STEPS.length - 1 && (
                <span className={`h-0.5 min-w-3.5 flex-1 ${done ? "bg-amber-500" : "bg-slate-200"}`} />
              )}
            </span>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs font-bold text-slate-700">
        {step >= ORDER_STEPS.length ? "จบงานแล้ว" : ORDER_STEPS[step]}{" "}
        <span className="font-normal text-slate-400">· {Math.min(step + 1, ORDER_STEPS.length)}/{ORDER_STEPS.length}</span>
      </p>
      <span className="sr-only">
        ความคืบหน้า ขั้นที่ {Math.min(step + 1, ORDER_STEPS.length)} จาก {ORDER_STEPS.length}
      </span>
    </div>
  );
}

"use client";

/**
 * 📦 ตัวปัก "ของมาถึงโต๊ะแพ็คหรือยัง" ของรายการ 1 รายการ
 *
 * ใช้ 2 ที่: โหมดแพ็คในหน้าออเดอร์ (มือถือ สแกน QR) และโมดัลที่สถานีแพ็ค–ส่ง (/admin/orders/scan)
 * กติกา:
 *  - ไม่เคยปัก = ปกติ (ของอยู่ตรงหน้า) ไม่ต้องกดอะไร — กดเฉพาะเมื่อของ "ยังไม่มา" หรือ "มาไม่ครบ"
 *  - กด "มาครบ" = บันทึกทันที (ออเดอร์หลุดจากขั้น "รอของ" เอง)
 *  - กด "ยังไม่มา"/"มาไม่ครบ" = เปิดช่องกรอก (มาแล้วกี่ชิ้น · คาดว่ามาวันไหน · รอจากไหน) แล้วกดบันทึก
 *  - แสดงเสมอว่าใครปัก เมื่อไหร่ รอมากี่วัน — จะได้ตามถามถูกคน
 */

import { useEffect, useState } from "react";
import {
  arrivalOverdue,
  arrivalSummary,
  fmtExpected,
  waitingDays,
  type ArrivalPatch,
  type PackArrival,
  type PackArrivalStatus,
} from "@/lib/admin-data";

export { arrivalSummary, fmtExpected, waitingDays, type ArrivalPatch };

const STATUS: { key: PackArrivalStatus; label: string; icon: string; on: string; off: string }[] = [
  { key: "ยังไม่มา", label: "ยังไม่มา", icon: "⏳", on: "bg-rose-600 text-white ring-rose-600", off: "bg-white text-rose-700 ring-rose-300 hover:bg-rose-50" },
  { key: "มาไม่ครบ", label: "มาไม่ครบ", icon: "⚠️", on: "bg-amber-500 text-white ring-amber-500", off: "bg-white text-amber-800 ring-amber-300 hover:bg-amber-50" },
  { key: "มาครบ", label: "มาครบแล้ว", icon: "✅", on: "bg-green-600 text-white ring-green-600", off: "bg-white text-green-700 ring-green-300 hover:bg-green-50" },
];

export default function ArrivalPicker({
  arrival,
  need,
  unit = "ชิ้น",
  compact,
  onSave,
}: {
  arrival?: PackArrival;
  /** จำนวนที่ต้องได้ (qty ของรายการ) */
  need: number;
  unit?: string;
  /** โหมดย่อ (ในโมดัลที่สถานี) — ไม่มีหัวข้อ */
  compact?: boolean;
  onSave: (patch: ArrivalPatch) => void;
}) {
  const [draft, setDraft] = useState<PackArrivalStatus | null>(null); // สถานะที่กำลังจะปัก (ยังไม่บันทึก)
  const [got, setGot] = useState<string>(arrival?.got != null ? String(arrival.got) : "");
  const [expectedAt, setExpectedAt] = useState(arrival?.expectedAt ?? "");
  const [note, setNote] = useState(arrival?.note ?? "");

  // ออเดอร์รีเฟรชจากเซิร์ฟเวอร์ → ซิงก์ช่องกรอกตามค่าที่บันทึกแล้ว
  // ⚠️ อิง "ค่า" ไม่ใช่ identity ของ arrival — หน้าโพลทุก 15 วิ ได้ออบเจ็กต์ใหม่ทั้งที่ค่าเท่าเดิม ถ้าอิง identity จะล้างที่กำลังพิมพ์ทิ้ง
  const savedKey = arrival ? `${arrival.status}|${arrival.got ?? ""}|${arrival.expectedAt ?? ""}|${arrival.note ?? ""}|${arrival.at}` : "";
  useEffect(() => {
    setDraft(null);
    setGot(arrival?.got != null ? String(arrival.got) : "");
    setExpectedAt(arrival?.expectedAt ?? "");
    setNote(arrival?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ซิงก์เมื่อค่าที่บันทึกเปลี่ยนจริงเท่านั้น (savedKey)
  }, [savedKey]);

  const saved = arrival?.status;
  const missing = saved === "ยังไม่มา" || saved === "มาไม่ครบ";
  const editing = draft ?? (missing ? saved : null); // สถานะที่ช่องกรอกอ้างอิง
  const showForm = editing === "ยังไม่มา" || editing === "มาไม่ครบ";
  const dirty =
    draft !== null ||
    (missing &&
      ((arrival?.got ?? "") !== (got === "" ? "" : Number(got)) ||
        (arrival?.expectedAt ?? "") !== expectedAt ||
        (arrival?.note ?? "") !== note));

  function pick(k: PackArrivalStatus) {
    if (k === "มาครบ") {
      setDraft(null);
      onSave({ status: "มาครบ" });
      return;
    }
    setDraft(k);
  }

  function commit() {
    const st = editing;
    if (!st || st === "มาครบ") return;
    const g = st === "มาไม่ครบ" ? Math.max(0, Number(got) || 0) : undefined;
    onSave({ status: st, got: g, expectedAt: expectedAt || undefined, note: note.trim() || undefined });
    setDraft(null);
  }

  const days = missing ? waitingDays(arrival?.since ?? arrival?.at) : 0;
  const overdue = missing && arrivalOverdue(arrival?.expectedAt);

  return (
    <div
      className={`rounded-xl p-2.5 ${
        missing ? (saved === "ยังไม่มา" ? "bg-rose-50 ring-2 ring-rose-300" : "bg-amber-50 ring-2 ring-amber-400") : "bg-slate-50 ring-1 ring-slate-200"
      }`}
    >
      {!compact && (
        <p className="mb-1.5 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-700">
          <span>📦 ของมาถึงโต๊ะแพ็คหรือยัง</span>
          {!missing && !draft && <span className="text-[10px] font-bold text-slate-400">ของอยู่ตรงหน้า = ไม่ต้องกด</span>}
        </p>
      )}

      {/* สถานะที่ปักไว้ — ใครปัก รอมากี่วัน คาดว่ามาวันไหน */}
      {missing && arrival && (
        <p className={`mb-1.5 text-xs font-bold ${saved === "ยังไม่มา" ? "text-rose-700" : "text-amber-800"}`}>
          {saved === "ยังไม่มา" ? "⏳ ยังไม่มา" : `⚠️ ${arrivalSummary(arrival, need, unit)}`}
          <span className="font-semibold text-slate-600">
            {" "}
            · รอมา <span className="tabular-nums">{days}</span> วัน · ปักโดย {arrival.by}
          </span>
          {arrival.expectedAt && (
            <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${overdue ? "bg-rose-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
              {overdue ? "เลยกำหนด " : "คาดว่ามา "}
              {fmtExpected(arrival.expectedAt)}
            </span>
          )}
        </p>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {STATUS.map((s) => {
          const on = editing === s.key || (s.key === "มาครบ" && saved === "มาครบ" && !draft);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => pick(s.key)}
              className={`min-h-[44px] rounded-lg px-1 py-2 text-xs font-extrabold ring-2 ${on ? s.on : s.off}`}
              aria-pressed={on}
            >
              {s.icon} {s.label}
            </button>
          );
        })}
      </div>

      {showForm && (
        <div className="mt-2 grid gap-2">
          {editing === "มาไม่ครบ" && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="w-24 shrink-0">มาแล้วกี่{unit}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={need}
                value={got}
                onChange={(e) => setGot(e.target.value)}
                className="min-h-[44px] w-24 rounded-lg border border-slate-300 bg-white px-2 text-base font-bold tabular-nums text-slate-900"
                placeholder="0"
              />
              <span className="text-slate-500">
                จาก <span className="tabular-nums">{need}</span> {unit}
              </span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-24 shrink-0">คาดว่ามาวันไหน</span>
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-900"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-24 shrink-0">รอจากไหน</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              placeholder="เช่น รอโรงงานส่ง / ผลิตอีกล็อต"
            />
          </label>
          <p className="text-[11px] font-bold text-slate-500">
            📡 บันทึกแล้วระบบส่งเรื่องไปหน้า “ติดตามของ iDucky” ในระบบ TP ให้เอง — ฝ่ายผลิตเห็นและตอบกลับได้
          </p>
          <div className="flex items-center justify-end gap-2">
            {draft && (
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-white"
              >
                ยกเลิก
              </button>
            )}
            <button
              type="button"
              onClick={commit}
              disabled={!dirty}
              className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {saved && !draft ? "บันทึกที่แก้" : `บันทึก “${editing}”`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

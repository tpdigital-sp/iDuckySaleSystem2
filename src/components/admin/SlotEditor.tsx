"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { gridSlots, type TemplateSlot } from "@/lib/design-templates";
import { btnSmDanger, btnSmDucky, btnSmNeutral, faint } from "@/lib/admin-ui";

/** ช่องกรอกเล็ก — ให้หน้าตาตรงกับหน้าคลังเทมเพลต */
const inputSm =
  "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-amber-300";

/**
 * 🧩 ตัวกำหนด "ช่องใส่รูป" บนเทมเพลต (Theme)
 *
 * ลากวาดกรอบบนรูปพรีวิวได้เลย — ลากตรงกลางเพื่อย้าย ลากมุมขวาล่างเพื่อย่อ-ขยาย
 * (พิมพ์ตัวเลข % เองก็ได้ แต่ลากเร็วกว่ามากเวลาต้องวางหลายช่อง)
 *
 * เก็บพิกัดเป็น % ของกรอบงาน — ไฟล์คนละขนาดก็ใช้ชุดเดียวกันได้ และวาดทับรูปพรีวิวได้ตรงเสมอ
 */
export default function SlotEditor({
  slots,
  previewUrl,
  onChange,
}: {
  slots: TemplateSlot[];
  /** รูปพรีวิวของไฟล์เทมเพลต — ไม่มีก็วาดบนพื้นขาว */
  previewUrl?: string;
  onChange: (next: TemplateSlot[]) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [circle, setCircle] = useState(false);
  /** กำลังลากอะไรอยู่ — move = ย้ายทั้งช่อง · resize = ลากมุมขวาล่าง */
  const drag = useRef<{ id: string; mode: "move" | "resize"; x: number; y: number; s: TemplateSlot } | null>(null);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const patch = (id: string, p: Partial<TemplateSlot>) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, ...p } : s)));

  /** แปลงระยะที่ลากบนจอ → % ของกรอบงาน */
  function pct(dxPx: number, dyPx: number) {
    const r = stage.current?.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) return { dx: 0, dy: 0 };
    return { dx: (dxPx / r.width) * 100, dy: (dyPx / r.height) * 100 };
  }

  function onDown(e: React.PointerEvent, s: TemplateSlot, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSel(s.id);
    drag.current = { id: s.id, mode, x: e.clientX, y: e.clientY, s };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { dx, dy } = pct(e.clientX - d.x, e.clientY - d.y);
    if (d.mode === "move") {
      patch(d.id, {
        xPct: Math.round(clamp(d.s.xPct + dx, 0, 100 - d.s.wPct) * 100) / 100,
        yPct: Math.round(clamp(d.s.yPct + dy, 0, 100 - d.s.hPct) * 100) / 100,
      });
    } else {
      patch(d.id, {
        wPct: Math.round(clamp(d.s.wPct + dx, 2, 100 - d.s.xPct) * 100) / 100,
        hPct: Math.round(clamp(d.s.hPct + dy, 2, 100 - d.s.yPct) * 100) / 100,
      });
    }
  }
  const onUp = () => {
    drag.current = null;
  };

  /**
   * ทำซ้ำช่อง — ได้ขนาด/ทรงเดิมเป๊ะ แล้วเลื่อนลงมานิดให้เห็นว่าเป็นอันใหม่
   * (ตั้งช่องแรกให้พอดีทีเดียว แล้วก๊อปวางที่เหลือ เร็วกว่ามาปรับขนาดใหม่ทุกช่อง)
   */
  const duplicate = (i: number) => {
    const s = slots[i];
    if (!s) return;
    const copy: TemplateSlot = {
      ...s,
      id: `sl-${Date.now().toString(36)}-${i}`,
      xPct: Math.round(clamp(s.xPct + 3, 0, Math.max(0, 100 - s.wPct)) * 100) / 100,
      yPct: Math.round(clamp(s.yPct + 3, 0, Math.max(0, 100 - s.hPct)) * 100) / 100,
    };
    const next = [...slots];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setSel(copy.id);
  };

  const addOne = () =>
    onChange([
      ...slots,
      { id: `sl-${Date.now().toString(36)}`, xPct: 20, yPct: 20, wPct: 40, hPct: 40, ...(circle ? { shape: "circle" as const } : {}) },
    ]);

  return (
    <div className="space-y-2 rounded-xl bg-violet-50/60 px-3 py-2.5 ring-1 ring-violet-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-violet-800">🧩 ช่องใส่รูป (Theme)</span>
        <span className={`text-[11px] ${faint}`}>
          กำหนดช่องแล้ว ลูกค้าจะเห็นเป็นกล่อง &ldquo;＋ เพิ่มรูป&rdquo; ทีละช่อง แทนการวางลายเดียวเต็มกรอบ
        </span>
      </div>

      {/* แถบเครื่องมือ: เพิ่มทีละช่อง · สร้างเป็นตาราง · ล้าง */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addOne} className={btnSmNeutral}>
          ＋ เพิ่มช่อง
        </button>
        <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
          จัดเป็นตาราง
          <input
            value={cols}
            onChange={(e) => setCols(Number(e.target.value) || 1)}
            inputMode="numeric"
            className="w-9 bg-transparent text-center outline-none"
            aria-label="จำนวนคอลัมน์"
          />
          ×
          <input
            value={rows}
            onChange={(e) => setRows(Number(e.target.value) || 1)}
            inputMode="numeric"
            className="w-9 bg-transparent text-center outline-none"
            aria-label="จำนวนแถว"
          />
          <button
            type="button"
            onClick={() => onChange(gridSlots(cols, rows, { shape: circle ? "circle" : "rect" }))}
            className={`${btnSmDucky} ml-1`}
            title="สร้างช่องเป็นตารางทับของเดิม — ปรับตำแหน่งทีหลังได้"
          >
            สร้าง
          </button>
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={circle} onChange={(e) => setCircle(e.target.checked)} className="h-3.5 w-3.5 accent-violet-500" />
          ทรงวงกลม
        </label>
        {slots.length > 0 && (
          <button type="button" onClick={() => onChange([])} className={`${btnSmDanger} ml-auto`}>
            ล้างทุกช่อง ({slots.length})
          </button>
        )}
      </div>

      {/* กระดานวาง — ลากกรอบได้ตรงนี้ */}
      <div
        ref={stage}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => setSel(null)}
        className="relative mx-auto aspect-square w-full max-w-[18rem] touch-none select-none overflow-hidden rounded-lg bg-white ring-1 ring-slate-300"
        style={
          previewUrl
            ? { backgroundImage: `url(${previewUrl})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }
            : undefined
        }
      >
        {slots.map((s, i) => (
          <div
            key={s.id}
            onPointerDown={(e) => onDown(e, s, "move")}
            style={{
              left: `${s.xPct}%`,
              top: `${s.yPct}%`,
              width: `${s.wPct}%`,
              height: `${s.hPct}%`,
              borderRadius: s.shape === "circle" ? "50%" : "6px",
            }}
            className={`absolute cursor-move border-2 bg-violet-500/15 ${
              sel === s.id ? "border-violet-600" : "border-violet-400/70"
            }`}
          >
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-violet-600 px-1 text-[9px] font-bold text-white">
              {i + 1}
            </span>
            {/* ทำซ้ำ — โผล่บนช่องที่เลือกอยู่ กดแล้วได้ช่องใหม่ขนาดเดิมวางเยื้องลงมา */}
            {sel === s.id && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  duplicate(i);
                }}
                title="ทำซ้ำช่องนี้"
                className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow"
              >
                ⧉
              </button>
            )}
            {/* มุมขวาล่าง = ย่อ-ขยาย */}
            <span
              onPointerDown={(e) => onDown(e, s, "resize")}
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-violet-600 bg-white"
            />
          </div>
        ))}
        {!slots.length && (
          <span className={`absolute inset-0 grid place-items-center text-center text-[11px] ${faint}`}>
            ยังไม่มีช่อง — กด ＋ เพิ่มช่อง หรือสร้างเป็นตาราง
          </span>
        )}
      </div>

      {/* ตัวเลขละเอียด — ปรับให้ตรงเป๊ะเวลาลากแล้วยังไม่พอดี */}
      {slots.length > 0 && (
        <div className="space-y-1">
          {slots.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
              <span className={`w-5 text-right ${faint}`}>{i + 1}.</span>
              {(["xPct", "yPct", "wPct", "hPct"] as const).map((k) => (
                <label key={k} className="flex items-center gap-0.5">
                  {{ xPct: "ซ้าย", yPct: "บน", wPct: "กว้าง", hPct: "สูง" }[k]}
                  <input
                    value={s[k]}
                    onChange={(e) => patch(s.id, { [k]: Number(e.target.value) || 0 })}
                    inputMode="decimal"
                    className={`${inputSm} w-14 text-center`}
                  />
                  %
                </label>
              ))}
              <select
                value={s.shape ?? "rect"}
                onChange={(e) => patch(s.id, { shape: e.target.value === "circle" ? "circle" : undefined })}
                className={`${inputSm} w-24`}
              >
                <option value="rect">สี่เหลี่ยม</option>
                <option value="circle">วงกลม</option>
              </select>
              <button
                type="button"
                onClick={() => duplicate(i)}
                className={`${btnSmNeutral} ml-auto`}
                title="ทำซ้ำช่องนี้ — ได้ขนาด/ทรงเดิม แล้วลากไปวางตำแหน่งใหม่"
              >
                ⧉ ทำซ้ำ
              </button>
              <button
                type="button"
                onClick={() => onChange(slots.filter((x) => x.id !== s.id))}
                className={btnSmDanger}
                title="ลบช่องนี้"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

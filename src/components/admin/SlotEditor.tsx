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
  required,
  onChange,
  onRequiredChange,
}: {
  slots: TemplateSlot[];
  /** รูปพรีวิวของไฟล์เทมเพลต — ไม่มีก็วาดบนพื้นขาว */
  previewUrl?: string;
  /** บังคับให้ลูกค้าใส่ครบทุกช่องก่อนสั่งไหม */
  required?: boolean;
  onChange: (next: TemplateSlot[]) => void;
  onRequiredChange: (v: boolean) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [circle, setCircle] = useState(false);
  /** กำลังลากอะไรอยู่ — move = ย้ายทั้งช่อง · resize = ลากมุมขวาล่าง */
  const drag = useRef<{ id: string; mode: "move" | "resize"; x: number; y: number; s: TemplateSlot } | null>(null);
  /** เส้นไกด์ที่กำลังโชว์ตอนลาก (ตำแหน่งเป็น % ของกระดาน) */
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const patch = (id: string, p: Partial<TemplateSlot>) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, ...p } : s)));

  /**
   * ระยะที่ถือว่า "ใกล้พอจะดูดเข้าหา" (% ของกรอบงาน)
   * 1% ของด้านกว้าง — พอให้กะเองได้ แต่ไม่ดูดจนขยับละเอียดไม่ได้
   */
  const SNAP = 1;

  /**
   * หาเส้นอ้างอิงทั้งหมดที่ช่องอื่น ๆ และตัวกระดานสร้างไว้
   * แนวตั้ง = ขอบซ้าย/กึ่งกลาง/ขอบขวาของทุกช่อง + ขอบและกึ่งกลางกระดาน
   */
  function refLines(exceptId: string) {
    const v = [0, 50, 100];
    const h = [0, 50, 100];
    for (const s of slots) {
      if (s.id === exceptId) continue;
      v.push(s.xPct, s.xPct + s.wPct / 2, s.xPct + s.wPct);
      h.push(s.yPct, s.yPct + s.hPct / 2, s.yPct + s.hPct);
    }
    return { v, h };
  }

  /**
   * ดูดค่าเข้าหาเส้นอ้างอิงที่ใกล้ที่สุด
   * edges = ตำแหน่งที่ต้องเทียบ (ซ้าย/กลาง/ขวา ของช่องที่กำลังลาก)
   * คืนค่าที่ต้องบวกเข้าไป + เส้นที่ดูดติด (ไว้วาดให้เห็น)
   */
  function snapDelta(edges: number[], lines: number[]) {
    let best: { d: number; line: number } | null = null;
    for (const e of edges)
      for (const ln of lines) {
        const d = ln - e;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: ln };
      }
    return best;
  }

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
    const lines = refLines(d.id);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const shown: { v: number[]; h: number[] } = { v: [], h: [] };

    if (d.mode === "move") {
      let x = clamp(d.s.xPct + dx, 0, 100 - d.s.wPct);
      let y = clamp(d.s.yPct + dy, 0, 100 - d.s.hPct);
      // ดูดขอบซ้าย/กึ่งกลาง/ขอบขวา เข้าหาเส้นอ้างอิง
      const sx = snapDelta([x, x + d.s.wPct / 2, x + d.s.wPct], lines.v);
      if (sx) {
        x = clamp(x + sx.d, 0, 100 - d.s.wPct);
        shown.v.push(sx.line);
      }
      const sy = snapDelta([y, y + d.s.hPct / 2, y + d.s.hPct], lines.h);
      if (sy) {
        y = clamp(y + sy.d, 0, 100 - d.s.hPct);
        shown.h.push(sy.line);
      }
      patch(d.id, { xPct: r2(x), yPct: r2(y) });
    } else {
      let w = clamp(d.s.wPct + dx, 2, 100 - d.s.xPct);
      let h = clamp(d.s.hPct + dy, 2, 100 - d.s.yPct);
      // ① ขอบขวา/ล่าง ดูดเข้าหาเส้นอ้างอิง
      const sw = snapDelta([d.s.xPct + w], lines.v);
      if (sw) {
        w = clamp(w + sw.d, 2, 100 - d.s.xPct);
        shown.v.push(sw.line);
      }
      const sh = snapDelta([d.s.yPct + h], lines.h);
      if (sh) {
        h = clamp(h + sh.d, 2, 100 - d.s.yPct);
        shown.h.push(sh.line);
      }
      // ② ขนาดเท่าช่องอื่น — ทำให้ทุกช่องเท่ากันเป๊ะโดยไม่ต้องพิมพ์ตัวเลข
      for (const o of slots) {
        if (o.id === d.id) continue;
        if (Math.abs(o.wPct - w) <= SNAP) w = o.wPct;
        if (Math.abs(o.hPct - h) <= SNAP) h = o.hPct;
      }
      patch(d.id, { wPct: r2(w), hPct: r2(h) });
    }
    setGuides(shown);
  }
  const onUp = () => {
    drag.current = null;
    setGuides({ v: [], h: [] });
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
          กำหนดช่องแล้ว ลูกค้าจะเห็นเป็นกล่อง &ldquo;＋ เพิ่มรูป&rdquo; ทีละช่อง แทนการวางลายเดียวเต็มกรอบ ·
          ลากแล้วมี<span className="font-semibold text-rose-600">เส้นแดง</span>ขึ้น = ตรงกับช่องอื่น/กึ่งกลางพอดี
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
          <>
            {/* บางงานตั้งใจเว้นช่อง บางงานลูกค้าลืม — ให้ร้านเลือกเองต่อชุด */}
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600"
              title="ติ๊กแล้วลูกค้าต้องใส่รูปให้ครบทุกช่องถึงจะกดใช้ลายได้"
            >
              <input
                type="checkbox"
                checked={!!required}
                onChange={(e) => onRequiredChange(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              ต้องใส่ครบทุกช่อง
            </label>
            <button type="button" onClick={() => onChange([])} className={`${btnSmDanger} ml-auto`}>
              ล้างทุกช่อง ({slots.length})
            </button>
          </>
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
              // มุมแหลม — กรอบต้องตรงกับช่องจริงที่ลูกค้าเห็น (ฝั่งลูกค้าไม่มีมุมมน)
              borderRadius: s.shape === "circle" ? "50%" : 0,
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
        {/* เส้นไกด์ตอนลาก — โผล่เมื่อขอบตรงกับช่องอื่นหรือกึ่งกลางกระดาน */}
        {guides.v.map((x, i) => (
          <span key={`v${i}`} style={{ left: `${x}%` }} className="pointer-events-none absolute inset-y-0 w-px bg-rose-500" />
        ))}
        {guides.h.map((y, i) => (
          <span key={`h${i}`} style={{ top: `${y}%` }} className="pointer-events-none absolute inset-x-0 h-px bg-rose-500" />
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

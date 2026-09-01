"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * 🖐 ลากสลับลำดับด้วยเมาส์ — ใช้คู่กับปุ่ม ↑↓ เดิม (ไม่ได้แทนที่)
 *
 * ทำไมเป็น "hook ตัวเดียวคุมหลายลิสต์" ไม่ใช่คอมโพเนนต์ห่อลิสต์:
 * หน้าหลังบ้านเขียนลิสต์ด้วย .map() ตรง ๆ อยู่แล้วสิบกว่าที่ (บางที่ซ้อนกัน 3 ชั้น)
 * ถ้าทำเป็นคอมโพเนนต์ห่อ ต้องรื้อ .map() ทุกอันเป็น render-prop — แก้เยอะและพลาดง่าย
 * แบบนี้เติมแค่ {...sort.item(...).row} ที่แถว ก็ลากได้เลย
 *
 * ── ใช้ยังไง ──
 *   const sort = useSortList();
 *   {list.map((x, i) => (
 *     <div key={x.id} {...sort.item("menu", i, list.length, mv).row} className="…">
 *       <Grip />            ← แค่ไอคอนบอกว่าลากได้ (ทั้งแถวลากได้อยู่แล้ว)
 *   ))}
 * แถวที่เป็นการ์ดใหญ่ (กางตัวแก้ไขอยู่ข้างใน) ใช้ mode "handle" แล้วเอา
 * {...d.handle} ไปแปะที่หัวแถว — กันเผลอลากทั้งการ์ดตอนกดพื้นที่ว่างในตัวแก้ไข
 *
 * ── กติกาที่จงใจ ──
 * · เมาส์/ปากกาเท่านั้น — นิ้วยังใช้ปุ่ม ↑↓ (ลากบนมือถือชนกับการเลื่อนหน้า)
 * · กดในช่องกรอก/ปุ่ม/ลิงก์ = ทำงานปกติ ไม่ถือว่าลาก (ดู SKIP)
 * · ต้องขยับเกิน 4px ถึงเริ่มลาก — คลิกธรรมดาจะไม่กลายเป็นการลากโดยไม่ตั้งใจ
 * · จำตำแหน่งแถวเป็นพิกัดของ "หน้าเว็บ" ไม่ใช่ของจอ — หน้าเลื่อนระหว่างลากแล้วยังคำนวณถูก
 */

/** กดตรงพวกนี้ = ใช้งานตัวมันเอง ไม่ใช่การลากแถว */
const SKIP = "input,select,textarea,button,a,label,[contenteditable],[data-nodrag]";
/** ระยะที่ต้องลากก่อนถึงจะนับว่า "ลาก" (px) */
const START = 4;
/** ระยะจากขอบจอที่เริ่มเลื่อนหน้าตามให้ (px) */
const EDGE = 90;
const LINE = "#f59e0b";

type Axis = "y" | "x";
type Mode = "anywhere" | "handle";

interface Reg {
  count: number;
  axis: Axis;
  onMove: (from: number, to: number) => void;
  els: (HTMLElement | null)[];
}

export interface DragBits {
  /** แปะที่ element ของแถว */
  row: {
    ref: (el: HTMLElement | null) => void;
    style: CSSProperties;
    onPointerDown?: (e: ReactPointerEvent) => void;
  };
  /** แปะที่จุดจับลาก (โหมด handle) — โหมดปกติเหลือแค่รูปเมาส์ */
  handle: { onPointerDown?: (e: ReactPointerEvent) => void; style: CSSProperties };
}

/** ย้ายสมาชิกจากตำแหน่ง from ไปแทรกที่ to (คนละอย่างกับ move ที่สลับกับตัวข้าง ๆ) */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const copy = [...list];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

/** ไอคอนจุด 6 เม็ด — บอกให้รู้ว่าแถวนี้ลากได้ (ตัวมันเองไม่ต้องรับ event) */
export function Grip({ className = "" }: { className?: string }) {
  return (
    <span
      title="ลากเพื่อสลับลำดับ"
      aria-hidden="true"
      className={`shrink-0 cursor-grab select-none px-0.5 text-slate-300 transition hover:text-slate-500 active:cursor-grabbing ${className}`}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="3" r="1.5" />
        <circle cx="7.5" cy="3" r="1.5" />
        <circle cx="2.5" cy="8" r="1.5" />
        <circle cx="7.5" cy="8" r="1.5" />
        <circle cx="2.5" cy="13" r="1.5" />
        <circle cx="7.5" cy="13" r="1.5" />
      </svg>
    </span>
  );
}

export function useSortList() {
  /** ทะเบียนลิสต์ — คีย์เป็นสตริงที่ผู้เรียกตั้ง (ลิสต์ซ้อนกันต้องใส่ id ลงไปด้วย) */
  const regs = useRef(new Map<string, Reg>());
  /** ref ของแต่ละแถว — แคชไว้ให้ identity คงที่ ไม่งั้น React ล้าง/ตั้งใหม่ทุกเฟรม */
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  /** แถวที่กำลังกดค้าง (ยังไม่นับเป็นลากจนกว่าจะขยับเกิน START) */
  const [press, setPress] = useState<{ key: string; from: number; x0: number; y0: number; cx: number; cy: number } | null>(null);
  /**
   * สถานะระหว่างลาก — ใช้วาดเงา/เส้นบอกตำแหน่งที่จะไปลง
   * ไม่มี dx/dy ในนี้โดยตั้งใจ: ตำแหน่งที่แถวขยับตามเมาส์สั่งที่ DOM ตรง ๆ
   * (หน้านี้ต้นไม้ใหญ่มาก ถ้า setState ทุกพิกเซลจะหน่วงทั้งหน้า) — state เปลี่ยนเฉพาะตอนข้ามแถว
   */
  const [drag, setDrag] = useState<{ key: string; from: number; to: number } | null>(null);

  useEffect(() => {
    if (!press) return;
    const reg = regs.current.get(press.key);
    if (!reg) return;

    let on = false; // ผ่านระยะเริ่มลากแล้วหรือยัง
    let to = press.from;
    let raf = 0;
    let cx = press.cx;
    let cy = press.cy;
    let rects: { l: number; t: number; w: number; h: number; mx: number; my: number }[] = [];
    /**
     * element ของแถวที่ยกอยู่ — จำตัวจริงไว้ ไม่ใช่อ่าน reg.els[from] ตอนวาง
     * เพราะพอปล่อยแล้วลิสต์สลับลำดับ ช่องที่ from ก็กลายเป็นแถวอื่นไปแล้ว
     * (เคลียร์ผิดตัว = แถวเดิมค้าง transform ลอยทับแถวอื่น)
     */
    let lifted: HTMLElement | null = null;

    // พิกัดเมาส์เทียบหน้าเว็บ — หน้าเลื่อนแล้วค่านี้ขยับตาม เทียบกับกรอบแถวที่จำไว้ได้ตรง ๆ
    const px = () => cx + window.scrollX;
    const py = () => cy + window.scrollY;

    /** จำกรอบของทุกแถวไว้ตอนเริ่มลาก — ระหว่างลากแถวมีการขยับ/ใส่เงา วัดสดจะเพี้ยน */
    const measure = () => {
      const els = reg.els.slice(0, reg.count);
      if (els.length < 2 || els.some((e) => !e)) return false;
      lifted = els[press.from] ?? null;
      rects = els.map((e) => {
        const r = e!.getBoundingClientRect();
        return {
          l: r.left + window.scrollX,
          t: r.top + window.scrollY,
          w: r.width,
          h: r.height,
          mx: r.left + window.scrollX + r.width / 2,
          my: r.top + window.scrollY + r.height / 2,
        };
      });
      return true;
    };

    /** แถวที่เมาส์อยู่ตอนนี้ — ไม่ทับแถวไหนเลยก็เอาแถวที่ใกล้ที่สุด (ตามแกนของลิสต์) */
    const hit = () => {
      const x = px();
      const y = py();
      let best = press.from;
      let bd = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.l && x <= r.l + r.w && y >= r.t && y <= r.t + r.h) return i;
        const d = reg.axis === "x" ? Math.abs(x - r.mx) : Math.abs(y - r.my);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    };

    const paint = (first = false) => {
      const el = lifted;
      if (el) {
        const dx = reg.axis === "x" ? px() - press.x0 : 0;
        const dy = reg.axis === "y" ? py() - press.y0 : 0;
        el.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      }
      const next = hit();
      if (!first && next === to) return; // ยังอยู่แถวเดิม — ไม่ต้องวาดหน้าใหม่
      to = next;
      setDrag({ key: press.key, from: press.from, to });
    };

    /** ลากไปชิดขอบจอ = เลื่อนหน้าตามให้ (ลิสต์ยาวกว่าหน้าจอจะได้ลากถึง) */
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const vh = window.innerHeight;
      const d = cy < EDGE ? -Math.ceil((EDGE - cy) / 5) : cy > vh - EDGE ? Math.ceil((cy - (vh - EDGE)) / 5) : 0;
      if (!d) return;
      const before = window.scrollY;
      window.scrollBy(0, d);
      if (window.scrollY !== before) paint();
    };

    const move = (e: PointerEvent) => {
      cx = e.clientX;
      cy = e.clientY;
      if (!on) {
        if (Math.abs(px() - press.x0) + Math.abs(py() - press.y0) < START) return;
        if (!measure()) {
          setPress(null);
          return;
        }
        on = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        raf = requestAnimationFrame(tick);
        e.preventDefault();
        paint(true);
        return;
      }
      e.preventDefault();
      paint();
    };
    const up = () => {
      if (on && to !== press.from) reg.onMove(press.from, to);
      setPress(null);
    };
    /** ยกเลิก (Esc / ระบบตัดการลาก) — ลำดับเดิมไม่เปลี่ยน */
    const cancel = () => {
      on = false;
      setPress(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      // transform สั่งไว้ที่ DOM เอง React ไม่รู้จัก ต้องล้างเองตอนวางแถว
      if (lifted) lifted.style.transform = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDrag(null);
    };
  }, [press]);

  /**
   * ขอ props ของแถวหนึ่ง — เรียกได้ตรง ๆ ใน .map() (ไม่ใช่ hook)
   * key ต้องไม่ซ้ำข้ามลิสต์ · ลิสต์ที่อยู่ในลูปชั้นนอก ให้ผสม id ลงไปด้วย เช่น `items:${g.id}:${c.id}`
   */
  const item = (
    key: string,
    i: number,
    count: number,
    onMove: (from: number, to: number) => void,
    opts?: { axis?: Axis; mode?: Mode }
  ): DragBits => {
    const axis = opts?.axis ?? "y";
    let reg = regs.current.get(key);
    if (!reg) {
      reg = { count, axis, onMove, els: [] };
      regs.current.set(key, reg);
    }
    // อัปเดตทุกเฟรม — ตัวที่ตอน pointerup อ่านคือค่าล่าสุดเสมอ
    reg.count = count;
    reg.axis = axis;
    reg.onMove = onMove;

    const rk = `${key}#${i}`;
    let ref = refs.current.get(rk);
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        const r = regs.current.get(key);
        if (r) r.els[i] = el;
      };
      refs.current.set(rk, ref);
    }

    const down = (e: ReactPointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if ((regs.current.get(key)?.count ?? 0) < 2) return;
      if (opts?.mode !== "handle" && (e.target as HTMLElement).closest(SKIP)) return;
      e.stopPropagation(); // ลิสต์ซ้อนลิสต์ — ลากตัวในสุดตัวเดียว ไม่ลามไปการ์ดแม่
      setPress({ key, from: i, x0: e.clientX + window.scrollX, y0: e.clientY + window.scrollY, cx: e.clientX, cy: e.clientY });
    };

    let style: CSSProperties = {};
    if (drag && drag.key === key) {
      if (drag.from === i) {
        // แถวที่ลากอยู่ — ยกลอยตามเมาส์
        style = {
          position: "relative",
          zIndex: 40,
          boxShadow: "0 12px 28px rgba(15,23,42,.22)",
          borderRadius: 12,
          background: "#fff",
          pointerEvents: "none",
          willChange: "transform",
        };
      } else if (drag.to === i) {
        // เส้นบอกว่าจะไปแทรกฝั่งไหนของแถวนี้
        const after = drag.from < i;
        style = {
          boxShadow:
            axis === "x"
              ? `inset ${after ? "-3px" : "3px"} 0 0 0 ${LINE}`
              : `inset 0 ${after ? "-3px" : "3px"} 0 0 ${LINE}`,
        };
      }
    }

    const grab: CSSProperties = { cursor: "grab" };
    return opts?.mode === "handle"
      ? { row: { ref, style }, handle: { onPointerDown: down, style: grab } }
      : { row: { ref, style, onPointerDown: down }, handle: { style: grab } };
  };

  return { item, dragging: drag };
}

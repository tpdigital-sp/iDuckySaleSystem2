"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🖼 วางลายบนเทมเพลต — ลูกค้าเอารูปมาวางในกรอบงานจริงได้เลยบนหน้าเว็บ
 *
 * ทำไมต้องมี: เดิมลูกค้าต้องโหลดไฟล์ .ai ไปวางเองใน Illustrator (คนทั่วไปทำไม่ได้)
 * ตัวนี้ทำให้วาง/ซูม/หมุนบนเว็บ แล้วกดใส่ตะกร้าได้เลย
 *
 * หน่วยภายในเป็น "มิลลิเมตรของงานจริง" ทั้งหมด (ไม่ใช่พิกเซลบนจอ)
 * → ตัวเลขที่ส่งให้ทีมผลิตเอาไปวางในไฟล์จริงได้ตรงเป๊ะ ไม่ต้องเดาสเกล
 *
 * ผืนผ้าใบ = ขนาดงาน + ตัดตกรอบด้าน · ลายต้องคลุมเต็มถึงขอบตัดตก
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { printFrameToken, type TemplateFrame } from "@/lib/design-templates";

export interface Placement {
  /** จุดกึ่งกลางของลาย นับจากมุมซ้ายบนของพื้นที่ตัดตก (มม.) */
  cxMm: number;
  cyMm: number;
  /** ขนาดลายที่วางจริง (มม.) */
  wMm: number;
  hMm: number;
  /** หมุนตามเข็ม (องศา) */
  rotDeg: number;
}

export interface StudioResult {
  /** ภาพงานที่ประกอบเสร็จ (ขนาดเท่าพื้นที่ตัดตก) — ใช้เป็นลายที่แนบไปกับออเดอร์ */
  composite: File;
  /** ไฟล์ต้นฉบับที่ลูกค้าเลือก — เก็บไว้ให้ทีมผลิตใช้ตอนทำไฟล์พิมพ์จริง */
  source: File;
  placement: Placement;
  /** ความละเอียดของลาย ณ ขนาดที่วาง (จุดต่อนิ้ว) */
  dpi: number;
  /** สรุปสั้น ๆ ให้ลูกค้าอ่านในตะกร้า */
  summary: string;
  /** บรรทัดตัวเลขให้ทีมผลิตวางในไฟล์จริง */
  spec: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** ชื่องานที่โชว์บนหัว เช่น "MousePad 30x60 cm" */
  title: string;
  /** กรอบงานจริง (ผืนผ้าใบ + เส้นตัด + เขตปลอดภัย) — มาจาก templateFrame() */
  frame: TemplateFrame;
  /** รูปเทมเพลตจาก .ai — วางเป็นไกด์จาง ๆ ทับลาย (ถ้ามี) */
  guideUrl?: string;
  onApply: (r: StudioResult) => void | Promise<void>;
}

/** ความละเอียดที่อยากได้ตอนส่งพิมพ์ และเพดานด้านยาวของภาพที่ประกอบ (กันไฟล์ใหญ่เกินไป) */
const EXPORT_DPI = 300;
const EXPORT_MAX_EDGE = 4500;
/** ต่ำกว่านี้เตือน (งานพิมพ์ทั่วไปควรได้ 150 ขึ้นไป) */
const DPI_WARN = 150;
const DPI_BAD = 100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function TemplateStudio({ open, onClose, title, frame, guideUrl, onApply }: Props) {
  /**
   * สลับแนวงาน — ใช้เมื่อขนาดมาจากชื่อตัวเลือก ("30x60" ไม่บอกว่าด้านไหนกว้าง)
   * ถ้าขนาดมาจากไฟล์จริงแล้วก็ไม่ต้องสลับ (ไฟล์บอกแนวมาเองแล้ว)
   */
  const [swapped, setSwapped] = useState(false);
  const bleedW = swapped ? frame.canvasHMm : frame.canvasWMm;
  const bleedH = swapped ? frame.canvasWMm : frame.canvasHMm;
  const bleedX = swapped ? frame.bleedYMm : frame.bleedXMm;
  const bleedY = swapped ? frame.bleedXMm : frame.bleedYMm;
  /** ขนาดงานจริงหลังตัด (กรอบเส้นแดง) */
  const artW = bleedW - bleedX * 2;
  const artH = bleedH - bleedY * 2;
  const safeMm = frame.safeMm;
  /**
   * พื้นที่ว่างรอบกรอบงานบนจอ (สัดส่วนของกรอบ) — ไม่ใช่ส่วนของงานพิมพ์
   * มีไว้ให้เห็นลายส่วนที่ล้นออกนอกกรอบ (ส่วนที่จะโดนตัดทิ้ง) และจับมุมลากย่อ-ขยายได้
   */
  const padX = bleedW * 0.18;
  const padY = bleedH * 0.18;
  const fullW = bleedW + padX * 2;
  const fullH = bleedH + padY * 2;

  const [src, setSrc] = useState<{ file: File; url: string; w: number; h: number } | null>(null);
  const [pl, setPl] = useState<Placement | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** กำลังลากไฟล์มาโยนอยู่เหนือพื้นที่วางลาย */
  const [dropOn, setDropOn] = useState(false);
  /**
   * เลือกลายอยู่ไหม — คลิกที่ลาย = เลือก (ขึ้นกรอบ transform) · คลิกพื้นที่ว่าง = ยกเลิก
   * ยกเลิกแล้วจะเห็นงานสะอาด ๆ ไม่มีเส้นกรอบบัง เหมือนตอนพิมพ์จริง
   */
  const [sel, setSel] = useState(false);
  /** ค่าล่าสุดของการวาง — ให้ตัวจัดการล้อเมาส์ (ผูกครั้งเดียว) อ่านได้โดยไม่ต้องผูกใหม่ทุกครั้ง */
  const plRef = useRef<Placement | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** ตัวชี้ที่กดค้างอยู่ (รองรับสองนิ้ว = ซูม) */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ pl: Placement; dist: number; cx: number; cy: number } | null>(null);

  /** มม. ต่อพิกเซลบนจอ — แปลงระยะลากนิ้วเป็นระยะบนงานจริง */
  const mmPerPx = useCallback(() => {
    const w = stageRef.current?.clientWidth ?? 0;
    return w >= 1 ? fullW / w : 0; // วัดไม่ได้ = ถือว่าไม่ขยับ ดีกว่าเลื่อนมั่ว
  }, [fullW]);

  /** วางลายให้คลุมเต็มพื้นที่ตัดตก (ค่าเริ่มต้น — งานแผ่นรองเมาส์/สติกเกอร์ต้องเต็มขอบ) */
  const fill = useCallback(
    (img?: { w: number; h: number }) => {
      const s = img ?? src;
      if (!s) return;
      const k = Math.max(bleedW / s.w, bleedH / s.h);
      setPl({ cxMm: bleedW / 2, cyMm: bleedH / 2, wMm: s.w * k, hMm: s.h * k, rotDeg: 0 });
    },
    [src, bleedW, bleedH],
  );

  /** วางทั้งรูปให้อยู่ในกรอบ (ไม่โดนตัด — เหลือขอบขาว) */
  const fit = useCallback(() => {
    if (!src) return;
    const k = Math.min(artW / src.w, artH / src.h);
    setPl({ cxMm: bleedW / 2, cyMm: bleedH / 2, wMm: src.w * k, hMm: src.h * k, rotDeg: 0 });
  }, [src, artW, artH, bleedW, bleedH]);

  // เปลี่ยนแนวงาน/ปิดจอ → จัดลายใหม่ให้พอดีเสมอ
  useEffect(() => {
    if (src) fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapped]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // วางรูปจากคลิปบอร์ด (Ctrl+V / Cmd+V) — แคปหน้าจอมาวางได้เลย
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (f) {
        e.preventDefault();
        void pick(f);
      }
    };
    /**
     * เบราว์เซอร์จะ "เปิดไฟล์ทับหน้าเว็บ" ถ้าปล่อยรูปนอกกรอบที่รับ
     * ระหว่างเปิดจอนี้เลยกันไว้ทั้งหน้า — ลากพลาดนิดหน่อยก็ไม่หลุดออกจากตะกร้า
     */
    const swallow = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("paste", paste);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    // กันหน้าเว็บด้านหลังเลื่อนตามตอนลากลายบนมือถือ
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("paste", paste);
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  // ล้าง object URL ทิ้งเมื่อเปลี่ยนรูป/ปิดจอ
  useEffect(() => () => { if (src) URL.revokeObjectURL(src.url); }, [src]);

  useEffect(() => {
    plRef.current = pl;
  }, [pl]);

  async function pick(file?: File | null) {
    if (!file) return;
    setErr("");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return setErr("ใช้ได้เฉพาะไฟล์รูป JPG / PNG / WEBP");
    if (file.size > 15 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 15MB — ย่อขนาดก่อนแล้วลองใหม่");
    const url = URL.createObjectURL(file);
    const dim = await new Promise<{ w: number; h: number }>((res) => {
      const im = new window.Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ w: 0, h: 0 });
      im.src = url;
    });
    if (!dim.w) {
      URL.revokeObjectURL(url);
      return setErr("เปิดไฟล์รูปไม่ได้ — ลองบันทึกใหม่แล้วเลือกอีกครั้ง");
    }
    setSrc((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return { file, url, ...dim };
    });
    fill(dim);
    setSel(true);
  }

  // ── ลาก / ซูมด้วยนิ้วหรือเมาส์ ──
  function onPointerDown(e: React.PointerEvent) {
    if (!pl) return;
    const onArt = hitsArt(toMm(e.clientX, e.clientY));
    // แตะพื้นที่ว่างทั้งที่ยังไม่ได้เลือกลาย = แค่ยกเลิกการเลือก ไม่ลากลายตาม
    if (!onArt && !sel) return;
    if (!onArt && pointers.current.size === 0) {
      setSel(false);
      return;
    }
    setSel(true);
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* จับตัวชี้ไม่ได้ก็ลากต่อได้ */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  }

  function startGesture() {
    if (!pl) return;
    const pts = [...pointers.current.values()];
    if (!pts.length) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { pl, dist, cx, cy };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const k = mmPerPx();
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let next: Placement = {
      ...g.pl,
      cxMm: g.pl.cxMm + (cx - g.cx) * k,
      cyMm: g.pl.cyMm + (cy - g.cy) * k,
    };
    if (pts.length > 1 && g.dist > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const z = clamp(d / g.dist, 0.2, 8);
      next = { ...next, wMm: g.pl.wMm * z, hMm: g.pl.hMm * z };
    }
    setPl(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture();
    else {
      gesture.current = null;
      setPl((p) => (p ? snapToCover(p) : p));
    }
  }

  /**
   * จุดบนงานจริง (มม.) ของตำแหน่งเมาส์/นิ้ว
   * คืน null เมื่อวัดขนาดจอไม่ได้ (จอยังไม่ได้จัดวาง/ถูกซ่อน) — ผู้เรียกต้องข้ามไป
   * ไม่งั้นจะได้พิกัดมั่ว ๆ แล้วลายหดเหลือนิดเดียว
   */
  const toMm = useCallback(
    (clientX: number, clientY: number) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r || r.width < 1 || r.height < 1) return null;
      return {
        x: ((clientX - r.left) / r.width) * fullW - padX,
        y: ((clientY - r.top) / r.height) * fullH - padY,
      };
    },
    [fullW, fullH, padX, padY],
  );

  /**
   * ดูดให้คลุมเต็มกรอบเมื่อ "ขาดอีกนิดเดียว" — ลากมุม/แตะแถบเลื่อนพลาดนิดหน่อย
   * แล้วเหลือขอบขาวบาง ๆ 1-2 มม. ตอนพิมพ์จะเห็นเป็นเส้นขาวรอบงาน
   * ห่างเกิน 2.5% ของกรอบ = ตั้งใจวางให้เล็ก (เช่น "พอดีกรอบ" ที่อยากได้พื้นขาว) ไม่ไปยุ่ง
   */
  const snapToCover = useCallback(
    (p: Placement): Placement => {
      const rad = (p.rotDeg * Math.PI) / 180;
      const w = Math.abs(p.wMm * Math.cos(rad)) + Math.abs(p.hMm * Math.sin(rad));
      const h = Math.abs(p.wMm * Math.sin(rad)) + Math.abs(p.hMm * Math.cos(rad));
      const gaps = [p.cxMm - w / 2, bleedW - (p.cxMm + w / 2), p.cyMm - h / 2, bleedH - (p.cyMm + h / 2)];
      if (gaps.every((g) => g <= 0.05)) return p; // คลุมอยู่แล้ว
      const tolX = bleedW * 0.025;
      const tolY = bleedH * 0.025;
      if (gaps[0] > tolX || gaps[1] > tolX || gaps[2] > tolY || gaps[3] > tolY) return p;
      const k = Math.max(bleedW / w, bleedH / h, 1);
      return { ...p, wMm: p.wMm * k, hMm: p.hMm * k, cxMm: bleedW / 2, cyMm: bleedH / 2 };
    },
    [bleedW, bleedH],
  );

  /** จุดนี้อยู่บนตัวลายไหม — หมุนพิกัดกลับตามมุมของลายก่อนเทียบกรอบ */
  const hitsArt = useCallback(
    (m: { x: number; y: number } | null) => {
      if (!m || !plRef.current) return false;
      const p = plRef.current;
      const r = (-p.rotDeg * Math.PI) / 180;
      const dx = m.x - p.cxMm;
      const dy = m.y - p.cyMm;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      return Math.abs(lx) <= p.wMm / 2 && Math.abs(ly) <= p.hMm / 2;
    },
    [],
  );

  /** เพดานย่อ-ขยาย — เล็กสุด 5% ของกรอบ ใหญ่สุด 12 เท่า (พอสำหรับซูมดูรายละเอียด) */
  const sizeLimits = useCallback(() => ({ min: bleedW * 0.05, max: bleedW * 12 }), [bleedW]);

  /**
   * ย่อ-ขยายรอบจุดที่กำหนด (ค่าเริ่มต้น = กลางลาย)
   * ซูมที่ตำแหน่งเมาส์ = จุดใต้เมาส์อยู่กับที่ ทำให้เล็งตำแหน่งได้ง่ายกว่าซูมจากกลางเสมอ
   */
  const zoomBy = useCallback(
    (f: number, at?: { x: number; y: number }) => {
      setPl((p) => {
        if (!p) return p;
        const { min, max } = sizeLimits();
        const nw = clamp(p.wMm * f, min, max);
        const k = nw / p.wMm;
        const a = at ?? { x: p.cxMm, y: p.cyMm };
        return {
          ...p,
          wMm: p.wMm * k,
          hMm: p.hMm * k,
          cxMm: a.x + (p.cxMm - a.x) * k,
          cyMm: a.y + (p.cyMm - a.y) * k,
        };
      });
    },
    [sizeLimits],
  );

  /** ตั้งขนาดลายตรง ๆ จากแถบเลื่อน (คงอัตราส่วนและจุดกึ่งกลางเดิม) */
  function setWidthMm(w: number) {
    setPl((p) => {
      if (!p) return p;
      const { min, max } = sizeLimits();
      const nw = clamp(w, min, max);
      return { ...p, wMm: nw, hMm: (p.hMm / p.wMm) * nw };
    });
  }

  // ล้อเมาส์ = ย่อ-ขยายที่ตำแหน่งเคอร์เซอร์ (ต้องผูกเองแบบ non-passive ถึงจะกันหน้าเลื่อนได้)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      if (!plRef.current) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, toMm(e.clientX, e.clientY) ?? undefined);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, src, zoomBy, toMm]);

  /** ลากมุมกรอบเพื่อขยาย — เก็บระยะจากกึ่งกลางตอนเริ่มลากไว้เทียบสัดส่วน */
  const resizing = useRef<{ dist: number; w: number; h: number } | null>(null);

  function onHandleDown(e: React.PointerEvent) {
    if (!pl) return;
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* บางเบราว์เซอร์/ตัวชี้จับไม่ได้ — ลากต่อได้ตามปกติ */
    }
    const m = toMm(e.clientX, e.clientY);
    if (!m) return;
    resizing.current = {
      dist: Math.max(1, Math.hypot(m.x - pl.cxMm, m.y - pl.cyMm)),
      w: pl.wMm,
      h: pl.hMm,
    };
  }

  function onHandleMove(e: React.PointerEvent) {
    const r = resizing.current;
    if (!r || !pl) return;
    e.stopPropagation();
    const m = toMm(e.clientX, e.clientY);
    if (!m) return;
    const k = Math.hypot(m.x - pl.cxMm, m.y - pl.cyMm) / r.dist;
    const { min, max } = sizeLimits();
    const nw = clamp(r.w * k, min, max);
    setPl({ ...pl, wMm: nw, hMm: (r.h / r.w) * nw });
  }

  function onHandleUp(e: React.PointerEvent) {
    e.stopPropagation();
    resizing.current = null;
    setPl((p) => (p ? snapToCover(p) : p));
  }

  /** ลากหูหมุน — มุมจากกึ่งกลางลายไปหาเคอร์เซอร์ (หูอยู่เหนือกรอบ เลยชดเชย 90°) */
  const rotating = useRef(false);

  function onRotateDown(e: React.PointerEvent) {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ไม่จับก็ลากได้ */
    }
    rotating.current = true;
  }

  function onRotateMove(e: React.PointerEvent) {
    if (!rotating.current || !pl) return;
    e.stopPropagation();
    const m = toMm(e.clientX, e.clientY);
    if (!m) return;
    const deg = (Math.atan2(m.y - pl.cyMm, m.x - pl.cxMm) * 180) / Math.PI + 90;
    // ใกล้มุมกลม ๆ (ทุก 15°) ให้ดูดเข้าหา — จัดตรงง่ายกว่าเล็งเอง
    const snapped = Math.round(deg / 15) * 15;
    const use = Math.abs(deg - snapped) <= 4 ? snapped : deg;
    setPl({ ...pl, rotDeg: ((use % 360) + 360) % 360 });
  }

  function onRotateUp(e: React.PointerEvent) {
    e.stopPropagation();
    rotating.current = false;
  }

  function rotate(deg: number) {
    setPl((p) => (p ? { ...p, rotDeg: (p.rotDeg + deg + 360) % 360 } : p));
  }

  /** ความละเอียดของลาย ณ ขนาดที่วางอยู่ */
  const dpi = src && pl ? Math.round(src.w / (pl.wMm / 25.4)) : 0;
  /** ขนาดที่ "คลุมเต็มกรอบพอดี" = 100% ของแถบเลื่อน */
  const fillW = src ? src.w * Math.max(bleedW / src.w, bleedH / src.h) : 1;
  const zoomPct = pl ? clamp((pl.wMm / fillW) * 100, 5, 400) : 100;
  /** ลายคลุมถึงขอบตัดตกครบไหม (เช็คแบบกรอบสี่เหลี่ยม — พอสำหรับเตือน) */
  const covers = (() => {
    if (!pl) return false;
    const rad = (pl.rotDeg * Math.PI) / 180;
    const w = Math.abs(pl.wMm * Math.cos(rad)) + Math.abs(pl.hMm * Math.sin(rad));
    const h = Math.abs(pl.wMm * Math.sin(rad)) + Math.abs(pl.hMm * Math.cos(rad));
    return (
      pl.cxMm - w / 2 <= 0.5 && pl.cyMm - h / 2 <= 0.5 && pl.cxMm + w / 2 >= bleedW - 0.5 && pl.cyMm + h / 2 >= bleedH - 0.5
    );
  })();

  /** ประกอบภาพจริงตามตัวเลขที่วางไว้ (ขนาดเท่าพื้นที่ตัดตก) */
  async function buildComposite(pl: Placement): Promise<File | null> {
    if (!src) return null;
    const scale = Math.min(EXPORT_DPI / 25.4, EXPORT_MAX_EDGE / Math.max(bleedW, bleedH));
    const W = Math.max(1, Math.round(bleedW * scale));
    const H = Math.max(1, Math.round(bleedH * scale));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const im = await new Promise<HTMLImageElement | null>((res) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src.url;
    });
    if (!im) return null;
    ctx.save();
    ctx.translate(pl.cxMm * scale, pl.cyMm * scale);
    ctx.rotate((pl.rotDeg * Math.PI) / 180);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, (-pl.wMm / 2) * scale, (-pl.hMm / 2) * scale, pl.wMm * scale, pl.hMm * scale);
    ctx.restore();
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return null;
    const stem = src.file.name.replace(/\.[^.]+$/, "") || "artwork";
    return new File([blob], `${stem}-บนเทมเพลต.jpg`, { type: "image/jpeg" });
  }

  async function apply() {
    const pl0 = pl;
    if (!src || !pl0 || busy) return;
    setBusy(true);
    setErr("");
    try {
      // ดูดให้เต็มกรอบอีกรอบก่อนส่งออก (กันขอบขาวบาง ๆ ที่ตาแทบไม่เห็นบนจอ)
      const pl = snapToCover(pl0);
      setPl(pl);
      const composite = await buildComposite(pl);
      if (!composite) {
        setErr("ประกอบภาพไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      const n = (v: number) => Math.round(v * 10) / 10;
      await onApply({
        composite,
        source: src.file,
        placement: pl,
        dpi,
        summary: `${title} · ${n(artW / 10)}×${n(artH / 10)} ซม. · ${dpi} DPI`,
        spec:
          `กรอบ ${n(bleedW)}×${n(bleedH)}mm (งานจริง ${n(artW)}×${n(artH)} + ตัดตก ${n(bleedX)}/${n(bleedY)}) · ` +
          `ลาย ${n(pl.wMm)}×${n(pl.hMm)}mm กึ่งกลางที่ ${n(pl.cxMm)},${n(pl.cyMm)}mm · หมุน ${n(pl.rotDeg)}° · ${dpi} DPI ` +
          printFrameToken(bleedW, bleedH),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // เปอร์เซ็นต์ของกรอบตัดตก — ใช้วางเส้นไกด์/รูปด้วย CSS ให้ยืดตามจอเอง
  const pctW = (mm: number) => `${((mm + padX) / fullW) * 100}%`;
  const pctH = (mm: number) => `${((mm + padY) / fullH) * 100}%`;
  /** ความยาว (ไม่ใช่ตำแหน่ง) เป็น % ของกรอบเต็ม */
  const lenW = (mm: number) => `${(mm / fullW) * 100}%`;
  const lenH = (mm: number) => `${(mm / fullH) * 100}%`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-stone-900/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col bg-white sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl sm:shadow-2xl">
        {/* หัว */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-stone-800">🖼 วางลายบนเทมเพลต</p>
            <p className="truncate text-[11px] text-stone-500">
              {title} · งานจริง {Math.round(artW) / 10}×{Math.round(artH) / 10} ซม. · ตัดตก{" "}
              {bleedX === bleedY ? `${bleedX} มม.` : `${bleedX}/${bleedY} มม.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ✕ ปิด
          </button>
        </div>

        {/* พื้นที่วางลาย — ลากไฟล์รูปมาโยนลงตรงไหนก็ได้ในโซนนี้ */}
        <div
          className={`relative flex-1 overflow-auto p-4 transition ${dropOn ? "bg-sky-50" : "bg-stone-50"}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropOn(true);
          }}
          onDragLeave={(e) => {
            // ออกจากโซนจริง ๆ เท่านั้น (ลากผ่านลูก ๆ ข้างในไม่นับ)
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files?.length) return;
            e.preventDefault();
            setDropOn(false);
            void pick(e.dataTransfer.files[0]);
          }}
        >
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative mx-auto max-h-full touch-none select-none overflow-hidden rounded-lg"
            style={{
              aspectRatio: `${fullW} / ${fullH}`,
              width: "100%",
              // 48vh = สูงสุดที่ยังพอดีจอโดยไม่ต้องเลื่อน (หัว + แถบเครื่องมือกินที่เหลือ)
              maxWidth: `min(100%, ${(fullW / fullH) * 48}vh)`,
              cursor: pl ? "move" : "default",
            }}
          >
            {/*
              กรอบงาน = พื้นขาว + ตัดทุกอย่างที่ล้นออกนอกกรอบทิ้ง
              (ส่วนที่ล้นคือส่วนที่จะโดนตัดจริงตอนผลิต — ไม่โชว์ให้สับสนว่าจะได้ติดมาด้วย)
              จุดจับ transform อยู่นอกกล่องนี้ เลยยังลากได้แม้ลายใหญ่กว่ากรอบ
            */}
            <div
              className="pointer-events-none absolute overflow-hidden bg-white shadow-[0_2px_14px_rgba(28,25,23,.12)] ring-1 ring-stone-300"
              style={{ left: pctW(0), top: pctH(0), width: lenW(bleedW), height: lenH(bleedH) }}
            >
              {/* ลายของลูกค้า (พิกัดในกล่องนี้อ้างอิงกรอบงาน ไม่รวมพื้นที่ว่างรอบ ๆ) */}
              {src && pl && (
                <img
                  ref={imgRef}
                  src={src.url}
                  alt="ลายที่กำลังวาง"
                  draggable={false}
                  className="absolute origin-center"
                  style={{
                    left: `${((pl.cxMm - pl.wMm / 2) / bleedW) * 100}%`,
                    top: `${((pl.cyMm - pl.hMm / 2) / bleedH) * 100}%`,
                    width: `${(pl.wMm / bleedW) * 100}%`,
                    height: `${(pl.hMm / bleedH) * 100}%`,
                    // ⚠️ ต้องปลดเพดานของ preflight (img{max-width:100%}) ไม่งั้นลายที่ซูมเกินกรอบ
                    // จะถูกบีบให้เท่ากรอบ → ที่เห็นบนจอไม่ตรงกับไฟล์ที่ประกอบออกมา
                    maxWidth: "none",
                    maxHeight: "none",
                    transform: `rotate(${pl.rotDeg}deg)`,
                  }}
                />
              )}

              {/* รูปจากไฟล์เทมเพลตจริง — ไกด์จาง ๆ ให้เห็นว่างานหน้าตาแบบไหน */}
              {guideUrl && showGuide && (
                <img
                  src={guideUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-fill opacity-25 mix-blend-multiply"
                />
              )}
            </div>

            {/* ── กรอบ transform — โผล่เมื่อคลิกเลือกลาย (คลิกที่ว่างเพื่อเอาออก) ── */}
            {src && pl && sel && (
              <div
                className="pointer-events-none absolute origin-center border border-sky-500"
                style={{
                  left: pctW(pl.cxMm - pl.wMm / 2),
                  top: pctH(pl.cyMm - pl.hMm / 2),
                  width: lenW(pl.wMm),
                  height: lenH(pl.hMm),
                  transform: `rotate(${pl.rotDeg}deg)`,
                }}
              >
                {/* มุมสี่มุม = ย่อ-ขยาย (คงอัตราส่วน) */}
                {(
                  [
                    ["-top-2 -left-2", "nwse-resize"],
                    ["-top-2 -right-2", "nesw-resize"],
                    ["-bottom-2 -left-2", "nesw-resize"],
                    ["-bottom-2 -right-2", "nwse-resize"],
                  ] as const
                ).map(([pos, cursor]) => (
                  <span
                    key={pos}
                    onPointerDown={onHandleDown}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    style={{ cursor, touchAction: "none" }}
                    className={`pointer-events-auto absolute ${pos} h-4 w-4 rounded-full border-2 border-sky-500 bg-white shadow`}
                    aria-label="ลากเพื่อย่อ-ขยายลาย"
                  />
                ))}

                {/* หูหมุน — ยื่นออกเหนือกรอบ ลากเพื่อหมุนอิสระ (ดูดเข้าทุก 15°) */}
                <span className="pointer-events-none absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-sky-500/70" />
                <span
                  onPointerDown={onRotateDown}
                  onPointerMove={onRotateMove}
                  onPointerUp={onRotateUp}
                  onPointerCancel={onRotateUp}
                  style={{ touchAction: "none" }}
                  className="pointer-events-auto absolute -top-11 left-1/2 grid h-7 w-7 -translate-x-1/2 cursor-grab place-items-center rounded-full border-2 border-sky-500 bg-white text-xs text-sky-600 shadow active:cursor-grabbing"
                  aria-label="ลากเพื่อหมุนลาย"
                >
                  ↻
                </span>

                {/* ป้ายบอกขนาด/มุม ณ ตอนนี้ — ติดใต้กรอบ หมุนกลับให้อ่านตรงเสมอ */}
                <span
                  className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white shadow"
                  style={{ transform: `translateX(-50%) rotate(${-pl.rotDeg}deg)` }}
                >
                  {Math.round(pl.wMm) / 10}×{Math.round(pl.hMm) / 10} ซม.
                  {pl.rotDeg ? ` · ${Math.round(pl.rotDeg)}°` : ""}
                </span>
              </div>
            )}

            {/* ยังไม่ได้เลือก — ใบ้ให้รู้ว่าคลิกที่ลายแล้วปรับได้ */}
            {src && pl && !sel && (
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/70 px-3 py-1 text-[11px] font-bold text-white">
                คลิกที่ลายเพื่อปรับขนาด/ตำแหน่ง
              </span>
            )}

            {!src && (
              <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-center">
                <span className="text-4xl">🖼</span>
                <span className="text-sm font-bold text-stone-700">ลากรูปมาวางตรงนี้ หรือกดเพื่อเลือกไฟล์</span>
                <span className="text-[11px] text-stone-400">JPG · PNG · WEBP (ไม่เกิน 15MB) · วางจากคลิปบอร์ดด้วย Ctrl+V ก็ได้</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void pick(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          {/* ป้ายบอกวิธีใช้ */}
          <p className="mt-2 text-center text-[11px] text-stone-400">
            <strong>คลิกที่ลายเพื่อปรับ</strong> แล้วลากเลื่อน · ลากมุมย่อ-ขยาย · ลากหู ↻ หมุน ·
            ล้อเมาส์/สองนิ้วซูม · คลิกพื้นที่ว่างเพื่อดูงานแบบไม่มีเส้นกรอบ
          </p>

          {/* ลากไฟล์อยู่เหนือจอ — บอกให้ชัดว่าปล่อยได้เลย */}
          {dropOn && (
            <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-2xl border-4 border-dashed border-sky-400 bg-sky-50/85">
              <p className="text-base font-extrabold text-sky-700">🖼 ปล่อยรูปตรงนี้ได้เลย</p>
            </div>
          )}
        </div>

        {/* แถบเครื่องมือ + สถานะ */}
        <div className="border-t border-stone-100 px-4 py-3">
          {err && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{err}</p>}

          {src && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  dpi >= DPI_WARN
                    ? "bg-emerald-50 text-emerald-700"
                    : dpi >= DPI_BAD
                      ? "bg-amber-50 text-amber-800"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                {dpi >= DPI_WARN ? "✓ ความคมชัดดี" : dpi >= DPI_BAD ? "⚠️ ค่อนข้างเบลอ" : "⚠️ เบลอแน่นอน"} · {dpi} DPI
              </span>
              {!covers && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                  ⚠️ ลายไม่คลุมถึงขอบตัด — จะมีขอบขาว
                </span>
              )}
            </div>
          )}

          {/* แถบเลื่อนย่อ-ขยาย — ปรับขนาดลายได้ละเอียดกว่ากด ＋/− และเห็นขนาดจริงเป็นเซนติเมตร */}
          {src && pl && (
            <div className="mb-2.5 flex items-center gap-2.5">
              <button type="button" onClick={() => zoomBy(1 / 1.1)} className={`${toolBtn} px-2.5`} aria-label="ย่อ">
                −
              </button>
              <input
                type="range"
                min={5}
                max={400}
                step={1}
                value={Math.round(zoomPct)}
                onChange={(e) => setWidthMm((fillW * Number(e.target.value)) / 100)}
                aria-label="ย่อ-ขยายลาย"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
              />
              <button type="button" onClick={() => zoomBy(1.1)} className={`${toolBtn} px-2.5`} aria-label="ขยาย">
                ＋
              </button>
              <span className="w-32 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-500">
                {Math.round(zoomPct)}% · {Math.round(pl.wMm) / 10}×{Math.round(pl.hMm) / 10} ซม.
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <label className="cursor-pointer rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200">
              {src ? "🔄 เปลี่ยนรูป" : "🖼 เลือกรูป"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={() => fill()} disabled={!src} className={toolBtn}>
              ⤢ เต็มพื้นที่
            </button>
            <button type="button" onClick={fit} disabled={!src} className={toolBtn}>
              ⧉ พอดีกรอบ
            </button>
            <button type="button" onClick={() => rotate(90)} disabled={!src} className={toolBtn}>
              ↻ หมุน
            </button>
            <button type="button" onClick={() => setSwapped((v) => !v)} className={toolBtn}>
              ⇄ สลับแนว
            </button>
            {guideUrl && (
              <button type="button" onClick={() => setShowGuide((v) => !v)} className={toolBtn}>
                {showGuide ? "👁 ซ่อนไกด์" : "👁 แสดงไกด์"}
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!src || busy}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังประกอบภาพ…" : "✓ ใช้ลายนี้"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const toolBtn =
  "rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40";

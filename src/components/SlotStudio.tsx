"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🧩 วางรูปลง "ช่อง" บนเทมเพลต (Theme)
 *
 * ใช้กับงานที่แผ่นเดียวมีหลายรูป — สติกเกอร์ 4 ดวง · photobooth strip · การ์ดหลายช่อง
 * ต่างจากจอวางลายปกติ (TemplateStudio) ตรงที่นั่นวางลายเดียวเต็มกรอบ ส่วนตัวนี้แบ่งเป็นช่อง
 *
 * ทุกช่องกำหนดมาจากหลังบ้านเป็น % ของกรอบงาน — ลูกค้าแค่กด "＋ เพิ่มรูป" ทีละช่อง
 * รูปจะถูกย่อ-ขยายให้เต็มช่องอัตโนมัติ (cover) แล้วเลื่อน/ซูมต่อได้
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { printFrameToken, type TemplateFrame, type TemplateSlot } from "@/lib/design-templates";

/** ความละเอียดตอนส่งออก และเพดานด้านยาว (กันไฟล์ใหญ่เกิน) */
const EXPORT_DPI = 300;
const EXPORT_MAX_EDGE = 4500;
/** ต่ำกว่านี้เตือนว่าจะเบลอ */
const DPI_WARN = 150;

/** รูปที่วางอยู่ในช่องหนึ่ง */
export interface SlotShot {
  file?: File;
  url: string;
  /** ขนาดจริงของไฟล์ (พิกเซล) — ใช้คิด DPI */
  natW: number;
  natH: number;
  /** ซูมเทียบกับ "พอดีเต็มช่อง" (1 = พอดี) */
  zoom: number;
  /** เลื่อนรูปในช่อง เป็นสัดส่วนของขนาดช่อง (-0.5..0.5) */
  offX: number;
  offY: number;
}

/**
 * กระดานหนึ่งใบ = หนึ่ง "ด้าน" ของงาน
 * งานด้านเดียวก็คือ sides ที่มีสมาชิกตัวเดียว (name ว่าง — ไม่โชว์แท็บ)
 */
export interface StudioSide {
  /** ไอดีคงที่ของด้านนี้ (ใช้ id ของไฟล์เทมเพลต) — ใช้เก็บรูปแยกด้าน */
  key: string;
  /** ชื่อด้านที่ลูกค้าเห็นบนแท็บ เช่น "ด้านหน้า" · ว่าง = งานด้านเดียว */
  name: string;
  frame: TemplateFrame;
  slots: TemplateSlot[];
  /** รูปเทมเพลตจาก .ai — วางเป็นไกด์จาง ๆ ใต้ช่อง */
  guideUrl?: string;
  /** 👕 สกินสินค้า (PNG โปร่งใส) — วางทับให้เห็นเป็นสินค้าจริง (ไม่ติดไปกับไฟล์พิมพ์) */
  skinUrl?: string;
  /** ไฟล์ .ai ต้นฉบับของด้านนี้ — จดติดไปกับออเดอร์ */
  tplUrl?: string;
}

/** ผลของด้านหนึ่ง */
export interface SideResult {
  key: string;
  name: string;
  composite: File;
  shots: (SlotShot | null)[];
  spec: string;
  /** DPI ต่ำสุดในด้านนี้ */
  dpi: number;
}

export interface SlotResult {
  /** ทุกด้านที่ลูกค้าใส่รูปไว้ (งานด้านเดียว = สมาชิกตัวเดียว) */
  sides: SideResult[];
  /** ด้านแรก — ไว้ใช้เป็นภาพหลักของลายนี้ */
  composite: File;
  /** รูปที่ลูกค้าใส่ในแต่ละช่องของด้านแรก */
  shots: (SlotShot | null)[];
  summary: string;
  head: string;
  spec: string;
  /** DPI ต่ำสุดในบรรดาช่องที่มีรูป (ทุกด้าน) */
  dpi: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** กระดานทั้งหมด — งานสกรีน 2 ด้านจะได้สองใบ สลับกันด้วยแท็บ */
  sides: StudioSide[];
  /** ต้องใส่รูปครบทุกช่อง (ทุกด้าน) ถึงจะกดใช้ลายได้ */
  requireAll?: boolean;
  /** จำนวนชิ้นต่อแผ่น — จดติดไปกับออเดอร์ */
  perSheet?: number;
  /** กลับมาแก้ของเดิม (ในหน้าเดียวกัน) — คีย์เดียวกับ StudioSide.key */
  initial?: Record<string, (SlotShot | null)[]>;
  /**
   * อัปโหลดไฟล์ต้นฉบับของแต่ละช่องขึ้นเซิร์ฟเวอร์ (คืน URL)
   * ทำตอนกด "ใช้ลายนี้" ครั้งเดียว — จะได้ไม่เปลืองโควตากับรูปที่ลูกค้าลองแล้วเปลี่ยนใจ
   */
  uploadSource?: (f: File) => Promise<string>;
  onApply: (r: SlotResult) => void | Promise<void>;
}

const MAX_MB = 15;
/** ชื่อช่องที่ลูกค้าเห็น — หลังบ้านตั้งเองได้ (เช่น "ด้านหน้า") ไม่ตั้ง = ใช้เลขช่อง */
const nameOf = (sl: TemplateSlot, i: number) => sl.label?.trim() || `ช่อง ${i + 1}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function SlotStudio({
  open,
  onClose,
  title,
  sides,
  requireAll,
  perSheet,
  initial,
  uploadSource,
  onApply,
}: Props) {
  /** ด้านที่กำลังเปิดอยู่ */
  const [active, setActive] = useState(0);
  /** รูปในช่อง แยกเก็บตามด้าน — สลับแท็บแล้วของเดิมไม่หาย */
  const [allShots, setAllShots] = useState<Record<string, (SlotShot | null)[]>>(() =>
    Object.fromEntries(sides.map((sd) => [sd.key, sd.slots.map((_, i) => initial?.[sd.key]?.[i] ?? null)])),
  );
  /** ช่องที่เลือกอยู่ — ต้องรู้ด้วยว่าอยู่หน้าไหน เพราะโหมดกางคู่เห็นหลายหน้าพร้อมกัน */
  const [sel, setSel] = useState<{ si: number; i: number } | null>(null);
  const [over, setOver] = useState<{ si: number; i: number } | null>(null);
  /** กางทุกหน้าให้เห็นพร้อมกัน (หน้า-หลังคู่กัน) */
  const [spreadView, setSpreadView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const drag = useRef<{ si: number; i: number; pointerId: number; x: number; y: number; s: SlotShot } | null>(null);
  /** นิ้วที่แตะกระดานอยู่ตอนนี้ (id → ตำแหน่ง) — ใช้จับท่าบีบสองนิ้ว */
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** ท่าบีบที่กำลังทำอยู่ — ผูกกับนิ้วสองนิ้วที่เริ่มท่า (a/b) ไม่ใช่ "สองนิ้วแรกใน map" */
  const pinch = useRef<{ si: number; i: number; a: number; b: number; dist: number; zoom: number } | null>(null);
  /** กระดานของแต่ละหน้าบนจอ (โหมดกางคู่มีหลายอันพร้อมกัน) */
  const stages = useRef<Map<number, HTMLDivElement>>(new Map());
  /** ความกว้างจริงของกระดานแต่ละหน้า — ใช้ตัดสินว่าช่องเล็กเกินจะใส่ปุ่มเต็ม ๆ ไหม */
  const [stageW, setStageW] = useState<Record<number, number>>({});
  /** โชว์สกินสินค้าทับช่องอยู่ไหม */
  const [showSkin, setShowSkin] = useState(true);
  /** จอสัมผัส — ลากไฟล์มาวางไม่ได้ ต้องบอกให้ "แตะ" แทน (เช็คหลัง mount กัน hydration ไม่ตรง) */
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

  // สลับหน้าแบบทีละหน้า = ช่องที่เลือกไว้ของหน้าเก่าใช้ต่อไม่ได้ (โหมดกางคู่เห็นทุกหน้าอยู่แล้ว)
  useEffect(() => {
    setSel((c) => (c && c.si !== active ? null : c));
  }, [active]);

  /** ด้านที่เปิดอยู่ (กันกรณี sides ว่างด้วยตัวสำรอง) */
  const side = sides[Math.min(active, Math.max(0, sides.length - 1))];
  const slots = side?.slots ?? [];
  const frame = side?.frame;
  const shots = (side && allShots[side.key]) || [];

  /** แก้รูปของหน้าที่ระบุ */
  const setShotsOf = useCallback(
    (si: number, up: (cur: (SlotShot | null)[]) => (SlotShot | null)[]) => {
      const k = sides[si]?.key;
      if (!k) return;
      setAllShots((all) => ({ ...all, [k]: up(all[k] ?? []) }));
    },
    [sides],
  );
  const shotsOf = (si: number) => allShots[sides[si]?.key ?? ""] ?? [];

  const W = frame?.canvasWMm ?? 0;
  const H = frame?.canvasHMm ?? 0;

  // วัดความกว้างกระดานไว้ย่อปุ่มในช่องเล็ก (มือถือ/ตารางหลายช่อง ปุ่มเต็มจะล้นกรอบ)
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<number, number> = {};
      stages.current.forEach((el, si) => (next[si] = el.getBoundingClientRect().width));
      setStageW(next);
    });
    stages.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [open, active, spreadView, sides.length]);

  // ปิดด้วย Esc + กันเบราว์เซอร์เปิดไฟล์ทับหน้าเว็บเวลาลากพลาดออกนอกช่อง
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const swallow = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && e.preventDefault();
    window.addEventListener("keydown", esc);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, [open, onClose]);

  /** อ่านไฟล์ที่ลูกค้าเลือก → ใส่ลงช่อง i (ย่อ-ขยายให้เต็มช่องให้เลย) */
  const put = useCallback(async (si: number, i: number, f?: File | null) => {
    setErr("");
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setErr("รับเฉพาะไฟล์ JPG · PNG · WEBP");
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`ไฟล์ใหญ่เกิน ${MAX_MB}MB`);
    const url = URL.createObjectURL(f);
    const im = await new Promise<HTMLImageElement | null>((res) => {
      const x = new window.Image();
      x.onload = () => res(x);
      x.onerror = () => res(null);
      x.src = url;
    });
    if (!im) {
      URL.revokeObjectURL(url);
      return setErr("เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น");
    }
    setShotsOf(si, (cur) => {
      const next = [...cur];
      next[i] = { file: f, url, natW: im.naturalWidth, natH: im.naturalHeight, zoom: 1, offX: 0, offY: 0 };
      return next;
    });
    setSel({ si, i });
  }, [setShotsOf]);

  /** ลากรูปในช่องเพื่อเลื่อน */
  function onDown(e: React.PointerEvent, si: number, i: number) {
    const s = shotsOf(si)[i];
    if (!s) return;
    e.preventDefault();
    setSel({ si, i });
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // จับนิ้วไว้กับช่องนี้ เผื่อนิ้วเลื่อนออกนอกช่องตอนลาก (บางเบราว์เซอร์โยน error — ไม่เป็นไร)
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {}

    const other = drag.current?.i === i && drag.current.si === si ? drag.current.pointerId : null;
    if (other !== null) {
      // นิ้วที่สองแตะช่องเดียวกัน → เลิกลาก เข้าโหมดบีบซูมแทน
      drag.current = null;
      pinch.current = { si, i, a: other, b: e.pointerId, dist: spread(other, e.pointerId), zoom: s.zoom };
      return;
    }
    drag.current = { si, i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, s };
  }

  /** ระยะห่างระหว่างนิ้วสองนิ้วที่ระบุ */
  function spread(a: number, b: number): number {
    const p = pts.current.get(a);
    const q = pts.current.get(b);
    if (!p || !q) return 0;
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  function onMove(e: React.PointerEvent) {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const p = pinch.current;
    if (p) {
      const now = spread(p.a, p.b);
      if (p.dist > 0 && now > 0) setZoom(p.si, p.i, (p.zoom * now) / p.dist);
      return;
    }

    const d = drag.current;
    if (!d) return;
    const box = stages.current.get(d.si)?.getBoundingClientRect();
    const sd = sides[d.si];
    const sl = sd?.slots[d.i];
    if (!box || !sl || !sd) return;
    const slotW = (box.width * sl.wPct) / 100;
    const slotH = (box.height * sl.hPct) / 100;
    if (slotW < 1 || slotH < 1) return;
    setShotsOf(d.si, (cur) => {
      const next = [...cur];
      const s = next[d.i];
      if (!s) return cur;
      const { mx, my } = panLimit(s, sl, sd);
      next[d.i] = {
        ...s,
        offX: clamp(d.s.offX + (e.clientX - d.x) / slotW, -mx, mx),
        offY: clamp(d.s.offY + (e.clientY - d.y) / slotH, -my, my),
      };
      return next;
    });
  }
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const p = pinch.current;
    if (p && (p.a === e.pointerId || p.b === e.pointerId)) pinch.current = null;
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  /**
   * ขนาดรูปแบบ cover เทียบกับช่อง (% ของช่อง — อย่างน้อยด้านละ 100)
   * ใช้ร่วมกันทั้งตอนวาดบนจอ ตอนจำกัดระยะเลื่อน และตอนส่งออก จะได้ตรงกันเป๊ะ
   */
  function coverPct(s: SlotShot, sl: TemplateSlot, sd: StudioSide) {
    const ratio = s.natW / s.natH;
    const slotRatio = (sl.wPct * sd.frame.canvasWMm) / (sl.hPct * sd.frame.canvasHMm);
    return {
      wPct: ratio > slotRatio ? (ratio / slotRatio) * 100 : 100,
      hPct: ratio > slotRatio ? 100 : (slotRatio / ratio) * 100,
    };
  }

  /**
   * เลื่อนได้ไกลสุดเท่าไรถึงจะยังไม่เห็นพื้นขาว — คิดจากส่วนที่รูป "ล้น" ออกนอกช่อง
   * รูปที่พอดีช่องเป๊ะ (เช่น ซูม 1 และสัดส่วนเท่าช่อง) เลื่อนไม่ได้เลย
   */
  function panLimit(s: SlotShot, sl: TemplateSlot, sd: StudioSide) {
    const { wPct, hPct } = coverPct(s, sl, sd);
    return {
      mx: Math.max(0, ((wPct * s.zoom) / 100 - 1) / 2),
      my: Math.max(0, ((hPct * s.zoom) / 100 - 1) / 2),
    };
  }

  /** เปลี่ยนซูมแล้วดึงรูปกลับเข้าขอบเขต (ซูมออกทีหลังไม่งั้นจะเหลือขอบขาว) */
  function setZoom(si: number, i: number, z: number) {
    const sd = sides[si];
    if (!sd) return;
    setShotsOf(si, (cur) =>
      cur.map((s, k) => {
        const sl = sd.slots[k];
        if (k !== i || !s || !sl) return s;
        const next = { ...s, zoom: clamp(z, 1, 3) };
        const { mx, my } = panLimit(next, sl, sd);
        return { ...next, offX: clamp(next.offX, -mx, mx), offY: clamp(next.offY, -my, my) };
      }),
    );
  }

  /** DPI ของรูปในช่อง i ของด้านที่ระบุ */
  function dpiIn(sd: StudioSide, sh: (SlotShot | null)[], i: number): number | null {
    const s = sh[i];
    const sl = sd.slots[i];
    if (!s || !sl) return null;
    const slotWmm = (sd.frame.canvasWMm * sl.wPct) / 100;
    const slotHmm = (sd.frame.canvasHMm * sl.hPct) / 100;
    // เต็มช่องแบบ cover → ด้านที่ "คับ" กำหนดสเกล
    // ซูมเข้า = รูปถูกขยาย ใช้พิกเซลต้นฉบับน้อยลงบนพื้นที่เท่าเดิม → มม.ต่อพิกเซลมากขึ้น
    const k = Math.max(slotWmm / s.natW, slotHmm / s.natH) * s.zoom;
    const pxPerMm = 1 / k;
    return Math.round(pxPerMm * 25.4);
  }
  /** DPI ของช่อง i ในหน้า si */
  const dpiOf = (si: number, i: number) => (sides[si] ? dpiIn(sides[si], shotsOf(si), i) : null);

  /** ด้านที่ยังใส่รูปไม่ครบ (ใช้ตอนบังคับใส่ครบทุกช่อง) */
  const shortSides = sides.filter((sd) => (allShots[sd.key] ?? []).filter(Boolean).length < sd.slots.length);
  /** ใส่รูปแล้วกี่ช่องรวมทุกด้าน — ต้องมีอย่างน้อยหนึ่งถึงจะกดใช้ลายได้ */
  const filledAll = sides.reduce((n, sd) => n + (allShots[sd.key] ?? []).filter(Boolean).length, 0);
  /** ชื่อหน้าที่ลูกค้าเห็น เช่น "ด้านหน้า 30×60 ซม." */
  const pageLabel = (sd: StudioSide, i: number) =>
    `${sd.name || `หน้า ${i + 1}`} ${Math.round(sd.frame.trimWMm) / 10}×${Math.round(sd.frame.trimHMm) / 10} ซม.`;

  /** อยู่หน้าสุดท้ายแล้วหรือยัง — หน้าสุดท้ายเท่านั้นที่กด "ใช้ลายนี้" ได้ */
  const last = active >= sides.length - 1;
  /** ด้านที่มีรูปแล้วอย่างน้อยหนึ่งช่อง = ด้านที่จะถูกประกอบเป็นไฟล์ */
  const results0 = sides.filter((sd) => (allShots[sd.key] ?? []).some(Boolean)).length;

  const filled = shots.filter(Boolean).length;
  /** ชื่อช่องที่ยังไม่ได้ใส่รูป — เอาไปบอกบนปุ่มตอนบังคับใส่ครบ */
  const missing = slots.map((sl, i) => (shots[i] ? null : nameOf(sl, i))).filter(Boolean) as string[];
  const minDpi = shots.reduce<number | null>((lo, s, i) => {
    if (!s) return lo;
    const d = dpiOf(active, i);
    return d === null ? lo : lo === null ? d : Math.min(lo, d);
  }, null);

  /** ประกอบทุกช่องของด้านหนึ่งเป็นภาพเดียวขนาดเท่ากรอบงาน */
  async function build(sd: StudioSide, sh: (SlotShot | null)[]): Promise<File | null> {
    const W = sd.frame.canvasWMm;
    const H = sd.frame.canvasHMm;
    const slots = sd.slots;
    const shots = sh;
    const scale = Math.min(EXPORT_DPI / 25.4, EXPORT_MAX_EDGE / Math.max(W, H));
    const cw = Math.max(1, Math.round(W * scale));
    const ch = Math.max(1, Math.round(H * scale));
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";

    for (let i = 0; i < slots.length; i++) {
      const s = shots[i];
      const sl = slots[i];
      if (!s || !sl) continue;
      const im = await new Promise<HTMLImageElement | null>((res) => {
        const x = new window.Image();
        x.onload = () => res(x);
        x.onerror = () => res(null);
        x.src = s.url;
      });
      if (!im) continue;
      const x = (sl.xPct / 100) * cw;
      const y = (sl.yPct / 100) * ch;
      const w = (sl.wPct / 100) * cw;
      const h = (sl.hPct / 100) * ch;
      ctx.save();
      ctx.beginPath();
      if (sl.shape === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.clip();
      // cover + ซูม + เลื่อน (เลื่อนคิดเป็นสัดส่วนของช่อง เหมือนตอนแสดงผล)
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight) * s.zoom;
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, x + (w - dw) / 2 + s.offX * w, y + (h - dh) / 2 + s.offY * h, dw, dh);
      ctx.restore();
    }

    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return null;
    return new File([blob], `ลายบนเทมเพลต${sd.name ? `-${sd.name}` : ""}.jpg`, { type: "image/jpeg" });
  }

  async function apply() {
    if (busy || !filledAll) return;
    setBusy(true);
    setErr("");
    try {
      const n = (v: number) => Math.round(v * 10) / 10;
      const results: SideResult[] = [];
      /** รูปต้นฉบับที่อัปแล้ว แยกตามด้าน — เขียนกลับเข้า state ทีเดียวตอนจบ */
      const savedAll: Record<string, (SlotShot | null)[]> = {};

      for (const sd of sides) {
        const sh = allShots[sd.key] ?? [];
        if (!sh.filter(Boolean).length) continue; // ด้านที่ไม่ได้ใส่รูปเลย ไม่ต้องประกอบไฟล์

        const composite = await build(sd, sh);
        if (!composite) throw new Error(`ประกอบภาพ${sd.name ? sd.name : ""}ไม่สำเร็จ`);

        /**
         * อัปไฟล์ต้นฉบับของแต่ละช่องขึ้นเซิร์ฟเวอร์
         * — กราฟฟิกจะได้ไฟล์เต็มรายช่อง ไม่ใช่แค่ภาพรวมที่แบนแล้ว
         * — และกดกลับมาแก้ได้แม้ลิงก์ชั่วคราวในเบราว์เซอร์หมดอายุไปแล้ว
         * อัปไม่ขึ้นก็ยังสั่งได้ (ภาพที่ประกอบแล้วพอผลิตได้) แค่ไม่มีลิงก์ต้นฉบับ
         */
        const saved: (SlotShot | null)[] = [...sh];
        if (uploadSource) {
          for (let i = 0; i < saved.length; i++) {
            const one = saved[i];
            if (!one?.file || /^https?:/.test(one.url)) continue;
            try {
              saved[i] = { ...one, url: await uploadSource(one.file) };
            } catch {
              /* ปล่อยให้ใช้ลิงก์ในเครื่องต่อไป */
            }
          }
          savedAll[sd.key] = saved;
        }

        const w = sd.frame.canvasWMm;
        const h = sd.frame.canvasHMm;
        const parts = sd.slots.map((sl, i) => {
          const one = saved[i];
          const src = one && /^https?:/.test(one.url) ? ` · ต้นฉบับ: ${one.url}` : "";
          return `${nameOf(sl, i)} ${n((w * sl.wPct) / 100)}×${n((h * sl.hPct) / 100)}mm ที่ ${n((w * sl.xPct) / 100)},${n(
            (h * sl.yPct) / 100,
          )}mm${sl.shape === "circle" ? " (วงกลม)" : ""} — ${one ? `${dpiIn(sd, saved, i)} DPI${src}` : "ว่าง"}`;
        });
        const dpis = saved.map((_, i) => dpiIn(sd, saved, i)).filter((d): d is number => d !== null);

        results.push({
          key: sd.key,
          name: sd.name,
          composite,
          shots: saved,
          spec: `${sd.name ? `[${sd.name}] ` : ""}กรอบ ${n(w)}×${n(h)}mm · ${parts.join(" · ")} ${printFrameToken(
            w,
            h,
            sd.tplUrl,
            perSheet,
          )}`,
          dpi: dpis.length ? Math.min(...dpis) : 0,
        });
      }

      if (!results.length) throw new Error("ยังไม่ได้ใส่รูปสักช่อง");
      if (Object.keys(savedAll).length) setAllShots((all) => ({ ...all, ...savedAll }));

      const first = results[0];
      const many = results.length > 1;
      const totalSlots = sides.reduce((a, sd) => a + sd.slots.length, 0);
      await onApply({
        sides: results,
        composite: first.composite,
        shots: first.shots,
        head: `${n(sides[0].frame.trimWMm / 10)}×${n(sides[0].frame.trimHMm / 10)} ซม. · ${
          many ? `${results.length} ด้าน` : `${sides[0].slots.length} ช่อง`
        }`,
        summary: `${title} · ${many ? results.map((r) => r.name).join(" + ") + " · " : ""}ใส่รูป ${filledAll}/${totalSlots} ช่อง`,
        spec: results.map((r) => r.spec).join(" ‖ "),
        dpi: Math.min(...results.map((r) => r.dpi)),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const selShot = sel ? shotsOf(sel.si)[sel.i] : null;
  /** หน้าที่กำลังโชว์อยู่ — กางคู่ = โชว์หมด · ไม่กาง = ทีละหน้า */
  const visible = spreadView ? sides.map((_, i) => i) : [active];

  /** กระดานหนึ่งหน้า (ใช้ทั้งโหมดทีละหน้าและโหมดกางคู่) */
  function board(si: number) {
    const sd = sides[si];
    const sh = shotsOf(si);
    const w = sd.frame.canvasWMm;
    const h = sd.frame.canvasHMm;
    // กางคู่ = แบ่งความสูงที่มีให้ทุกหน้า ไม่งั้นล้นจอ
    const vh = spreadView ? 40 : 46;
    return (
      <div className="flex min-w-0 flex-1 basis-0 flex-col items-center" key={sd.key}>
        {sides.length > 1 && (
          <p className={`mb-1 text-[11px] font-extrabold ${si === active ? "text-sky-700" : "text-stone-400"}`}>
            {pageLabel(sd, si)}
          </p>
        )}
        <div
          ref={(el) => {
            if (el) stages.current.set(si, el);
            else stages.current.delete(si);
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerDownCapture={() => setActive(si)}
          className={`relative touch-none select-none bg-white shadow-[0_2px_14px_rgba(28,25,23,.12)] ring-1 ${
            spreadView && si === active ? "ring-2 ring-sky-400" : "ring-stone-300"
          }`}
          style={{ aspectRatio: `${w} / ${h}`, width: "100%", maxWidth: `min(100%, ${(w / h) * vh}vh)` }}
        >
          {sd.guideUrl && (
            <img src={sd.guideUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-20" />
          )}

          {sd.slots.map((sl, i) => {
            const s = sh[i];
            const isOver = over?.si === si && over.i === i;
            const isSel = sel?.si === si && sel.i === i;
            return (
              <div
                key={sl.id}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setOver({ si, i });
                }}
                onDragLeave={() => setOver((c) => (c?.si === si && c.i === i ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(null);
                  void put(si, i, e.dataTransfer.files?.[0]);
                }}
                onPointerDown={(e) => onDown(e, si, i)}
                style={{
                  left: `${sl.xPct}%`,
                  top: `${sl.yPct}%`,
                  width: `${sl.wPct}%`,
                  height: `${sl.hPct}%`,
                  borderRadius: sl.shape === "circle" ? "50%" : 0,
                }}
                className={`absolute overflow-hidden ${s ? "cursor-move" : ""} ${
                  isOver ? "ring-4 ring-sky-400" : isSel ? "ring-2 ring-sky-500" : ""
                }`}
              >
                {s ? (
                  <img
                    src={s.url}
                    alt={`รูป${nameOf(sl, i)}`}
                    draggable={false}
                    className="pointer-events-none absolute"
                    style={(() => {
                      // cover + ซูม + เลื่อน (คำนวณเป็น % ของช่อง ให้ตรงกับตอนส่งออก)
                      const { wPct, hPct } = coverPct(s, sl, sd);
                      return {
                        width: `${wPct * s.zoom}%`,
                        height: `${hPct * s.zoom}%`,
                        left: `${50 - (wPct * s.zoom) / 2 + s.offX * 100}%`,
                        top: `${50 - (hPct * s.zoom) / 2 + s.offY * 100}%`,
                        maxWidth: "none",
                        maxHeight: "none",
                      };
                    })()}
                  />
                ) : (
                  /* ช่องว่าง — กล่องเทาแบบเดียวกับตัวอย่าง มีปุ่มเพิ่มรูปตรงกลาง */
                  <label
                    className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden text-center ${
                      isOver ? "bg-sky-200" : "bg-[#c4c4c4]"
                    }`}
                  >
                    {/* ช่องเล็กเหลือแค่ไอคอน ＋ · ช่องกลางเอาปุ่มไม่มีข้อความช่วย · ช่องใหญ่เต็มรูปแบบ */}
                    {(() => {
                      const px = ((stageW[si] ?? 0) * sl.wPct) / 100;
                      if (px < 64)
                        return (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e2653c] text-sm font-bold text-white shadow-sm">
                            ＋
                          </span>
                        );
                      return (
                        <>
                          <span
                            className={`max-w-[92%] truncate rounded-md bg-[#e2653c] font-bold text-white shadow-sm ${
                              px < 120 ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-[11px] sm:text-xs"
                            }`}
                          >
                            🖼 เพิ่มรูป
                          </span>
                          {px >= 120 && (
                            <span className="max-w-full truncate px-1 text-[10px] font-semibold text-white/95 sm:text-[11px]">
                              {/* มีชื่อช่อง = บอกว่าช่องนี้คืออะไรสำคัญกว่าคำใบ้วิธีใส่รูป */}
                              {sl.label?.trim() || (touch ? "แตะตรงไหนก็ได้ในช่อง" : "หรือลากรูปมาวางตรงนี้")}
                            </span>
                          )}
                        </>
                      );
                    })()}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void put(si, i, f);
                      }}
                    />
                  </label>
                )}

                {/* ชื่อ/เลขช่อง + ปุ่มลบ (เห็นเมื่อมีรูป) */}
                <span className="pointer-events-none absolute left-1 top-1 max-w-[calc(100%-1.75rem)] truncate rounded bg-stone-900/60 px-1.5 text-[9px] font-bold text-white">
                  {sl.label?.trim() || i + 1}
                </span>
                {s && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShotsOf(si, (cur) => {
                        const next = [...cur];
                        next[i] = null;
                        return next;
                      });
                      setSel(null);
                    }}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-stone-900/60 text-[10px] font-bold text-white hover:bg-rose-600"
                    title="เอารูปออกจากช่องนี้"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/*
            👕 สกินสินค้า — ทับบนช่องทั้งหมด ให้เห็นเป็นของจริง
            ⚠️ พรีวิวเท่านั้น ตอนประกอบไฟล์ (build) ไม่ได้วาดสกินลงไป
          */}
          {sd.skinUrl && showSkin && (
            <img src={sd.skinUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-center bg-stone-900/70 backdrop-blur-sm">
      <div
        className={`mx-auto flex max-h-full w-full flex-col overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-5 ${
          spreadView ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-stone-800">
              🧩 {sides.length > 1 ? (spreadView ? "ทุกหน้า" : side.name || `หน้า ${active + 1}`) : "วางรูปบนเทมเพลต"}
              {sides.length > 1 && !spreadView && (
                <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                  หน้า {active + 1}/{sides.length}
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {title} · งานจริง {Math.round(frame.trimWMm) / 10}×{Math.round(frame.trimHMm) / 10} ซม. · {slots.length} ช่อง
            </p>
          </div>
          {/* กางคู่ = เห็นหน้า-หลังพร้อมกัน แก้ได้ทั้งสองหน้าโดยไม่ต้องสลับ */}
          {sides.length > 1 && (
            <button
              type="button"
              onClick={() => setSpreadView((v) => !v)}
              className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-bold text-stone-600 transition hover:bg-stone-200"
              title="กางทุกหน้าให้เห็นพร้อมกัน"
            >
              {spreadView ? "▭ ทีละหน้า" : "▭▭ กางคู่"}
            </button>
          )}
          <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-stone-500 hover:bg-stone-100">
            ✕ ปิด
          </button>
        </div>

        {/* ── กระดานงาน ── */}
        <div className={`mt-3 flex justify-center gap-4 ${spreadView ? "flex-wrap items-start" : ""}`}>
          {visible.map((si) => board(si))}
        </div>

        {/* ── แถบปรับรูปในช่องที่เลือก ── */}
        {selShot && sel && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
            <span className="max-w-[12rem] truncate text-[11px] font-bold text-stone-600">
              {sides.length > 1 ? `${sides[sel.si].name || `หน้า ${sel.si + 1}`} · ` : ""}
              {nameOf(sides[sel.si].slots[sel.i], sel.i)}
            </span>
            <button
              type="button"
              onClick={() => selShot && setZoom(sel.si, sel.i, selShot.zoom - 0.1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-stone-600 ring-1 ring-stone-200"
            >
              −
            </button>
            <input
              type="range"
              min={100}
              max={300}
              value={Math.round(selShot.zoom * 100)}
              onChange={(e) => setZoom(sel.si, sel.i, Number(e.target.value) / 100)}
              className="h-1.5 w-40 accent-sky-500"
              aria-label="ซูมรูปในช่อง"
            />
            <button
              type="button"
              onClick={() => selShot && setZoom(sel.si, sel.i, selShot.zoom + 0.1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-stone-600 ring-1 ring-stone-200"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setShotsOf(sel.si, (c) => c.map((s, i) => (i === sel.i && s ? { ...s, zoom: 1, offX: 0, offY: 0 } : s)))}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200"
            >
              พอดีช่อง
            </button>
            {(() => {
              const d = dpiOf(sel.si, sel.i);
              return d !== null && d < DPI_WARN ? (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">⚠️ อาจเบลอ · {d} DPI</span>
              ) : d !== null ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{d} DPI</span>
              ) : null;
            })()}
          </div>
        )}

        {/* ปุ่มนี้ผูกกับหน้าที่เปิดอยู่ — เดิมเช็คทั้งชุด หน้าที่ไม่มีสกินเลยมีปุ่มให้กดแต่กดแล้วไม่มีอะไรเปลี่ยน */}
        {(spreadView ? sides.some((sd) => sd.skinUrl) : !!sides[active]?.skinUrl) && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setShowSkin((v) => !v)}
              className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600 transition hover:bg-stone-200"
              title="สกินคือภาพสินค้าที่วางทับให้ดูเหมือนของจริง — ไม่ติดไปกับไฟล์ที่ส่งพิมพ์"
            >
              {showSkin ? "👕 ซ่อนสกิน" : "👕 แสดงสกิน"}
            </button>
          </div>
        )}

        {/*
          ── แถบหน้ากระดาษ ──
          งานหลายด้าน = คนละหน้าจริง ๆ · เลื่อนหน้าด้วยปุ่ม ‹ › หรือกดที่รูปย่อด้านล่าง
          รูปย่อวาดจากช่องจริงของหน้านั้น จะได้เห็นว่าหน้าไหนใส่ครบแล้ว
        */}
        {sides.length > 1 && (
          <div className="mt-3 rounded-2xl bg-stone-50 p-2 ring-1 ring-stone-200">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActive(active - 1)}
                disabled={active === 0}
                className="rounded-full px-2.5 py-1 text-stone-500 transition hover:bg-stone-200 disabled:opacity-30"
              >
                ‹ หน้าก่อน
              </button>
              <span className="rounded-full bg-white px-3 py-1 text-stone-700 shadow-sm">{pageLabel(side, active)}</span>
              <button
                type="button"
                onClick={() => setActive(active + 1)}
                disabled={last}
                className="rounded-full px-2.5 py-1 text-stone-500 transition hover:bg-stone-200 disabled:opacity-30"
              >
                หน้าถัดไป ›
              </button>
            </div>

            <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
              {sides.map((sd, i) => {
                const sh = allShots[sd.key] ?? [];
                const done = sh.filter(Boolean).length;
                return (
                  <button
                    key={sd.key}
                    type="button"
                    onClick={() => setActive(i)}
                    className="shrink-0 text-center"
                    title={`ไปหน้า ${pageLabel(sd, i)}`}
                  >
                    <span
                      className={`relative block h-16 overflow-hidden rounded-md bg-white ring-2 transition ${
                        i === active ? "ring-sky-500" : "ring-stone-200 hover:ring-stone-300"
                      }`}
                      style={{ width: `${(sd.frame.canvasWMm / sd.frame.canvasHMm) * 4}rem` }}
                    >
                      {sd.guideUrl && (
                        <img src={sd.guideUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill opacity-20" />
                      )}
                      {sd.slots.map((sl, k) => {
                        const one = sh[k];
                        return (
                          <span
                            key={sl.id}
                            className={one ? "absolute bg-cover bg-center" : "absolute bg-stone-300"}
                            style={{
                              left: `${sl.xPct}%`,
                              top: `${sl.yPct}%`,
                              width: `${sl.wPct}%`,
                              height: `${sl.hPct}%`,
                              borderRadius: sl.shape === "circle" ? "50%" : 0,
                              ...(one ? { backgroundImage: `url(${one.url})` } : {}),
                            }}
                          />
                        );
                      })}
                    </span>
                    <span className={`mt-1 block text-[10px] font-bold ${i === active ? "text-sky-700" : "text-stone-500"}`}>
                      {sd.name || `หน้า ${i + 1}`}
                      <span className={done === sd.slots.length ? "ml-1 text-emerald-600" : "ml-1 text-stone-400"}>
                        {done}/{sd.slots.length}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-stone-400">
          กดที่ช่องเพื่อเพิ่มรูป · {touch ? "ลากด้วยนิ้วเพื่อเลื่อน · บีบสองนิ้วเพื่อซูม" : "ลากรูปในช่องเพื่อเลื่อน"} ·{" "}
          {requireAll ? "ต้องใส่รูปให้ครบทุกช่อง" : "ช่องที่เว้นไว้จะเป็นพื้นขาว"}
          {sides.length > 1 && " · แต่ละด้านเป็นคนละหน้า สลับที่แถบหน้าด้านล่าง (ทั้งหมดยังนับเป็นสินค้าชิ้นเดียว)"}
        </p>
        {err && <p className="mt-2 text-center text-xs font-semibold text-rose-600">{err}</p>}

        {/*
          ── ปุ่มล่าง ──
          งานด้านเดียว: ยกเลิก + ใช้ลายนี้ (เหมือนเดิม)
          งานหลายด้าน: เดินทีละหน้า — ย้อนกลับ / ถัดไป · หน้าสุดท้ายถึงจะเป็น "ใช้ลายนี้"
        */}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!filledAll || busy || (!!requireAll && shortSides.length > 0)}
            className="flex-1 rounded-full bg-sky-500 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-40"
          >
            {busy
              ? "กำลังบันทึก…"
              : requireAll && shortSides.length
                ? // ยังขาดอยู่หน้าไหนก็ต้องบอก ไม่งั้นกดไม่ได้แล้วงงว่าทำไม
                  shortSides[0] === side
                  ? missing.length <= 2
                    ? `ยังไม่ได้ใส่ ${missing.join(" · ")}`
                    : `ยังขาดอีก ${missing.length} ช่อง`
                  : `ยังขาดที่ ${shortSides.map((sd) => sd.name || "อีกหน้า").join(" · ")}`
                : sides.length > 1
                  ? `✓ ใช้ลายนี้ (${results0} หน้า)`
                  : `✓ ใช้ลายนี้ (${filled}/${slots.length} ช่อง)`}
          </button>
        </div>
      </div>
    </div>
  );
}

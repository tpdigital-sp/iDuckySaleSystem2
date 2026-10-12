"use client";

/**
 * 🗓 จอสร้างปฏิทินบนเว็บ — ยกฟังก์ชันจากโปรแกรมออกแบบของหน้าร้านเดิม (Printbox)
 *
 * ใช้กับทุกสินค้าปฏิทินที่ตั้ง Product.calendarStudio (โฟโต้การ์ด · โปสการ์ด · ตั้งโต๊ะ · ผ้าแคนวาส)
 * รูปแบบงาน (ขนาด/จำนวนหน้า/เลย์เอาต์) มาจาก calFormat() ใน lib/calendar-card ตามตัวเลือกที่ลูกค้าเลือก
 *
 * แต่ละหน้า: ช่องรูป (ลาก/ซูม/หมุน) + ข้อความทับรูปหน้าปก + ตารางปี/เดือนที่ระบบสร้างให้เอง
 * หน้าที่ไม่ได้ใส่รูปเอง = ใช้รูปหน้าปกวางเต็มช่องให้ (สั่งรูปเดียวทั้งเล่มได้)
 * ตั้งค่าปฏิทิน (ภาษา/วันเริ่มสัปดาห์/ฟอนต์/สี/วันหยุดไทย/วันสำคัญ) ใช้ร่วมทุกหน้า
 *
 * กด "ใช้แบบนี้" = ประกอบไฟล์ส่งพิมพ์ทุกหน้า (รวมตัดตก) ส่งกลับให้หน้าสินค้าแนบเข้าออเดอร์
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAL_FONTS,
  backSpec,
  calFormat,
  coverPlacement,
  defaultBack,
  defaultText,
  defaultTitle,
  isAutoTitle,
  drawPage,
  ensureFonts,
  fmtH,
  fmtW,
  hasHolidayData,
  holidaysOf,
  linkGoogleFonts,
  photoOf,
  placementCovers,
  renderPage,
  textBox,
  type CalBack,
  type CalDesign,
  type CalPlacement,
  type CalText,
  type ImgRef,
} from "@/lib/calendar-card";
import { printFrameToken } from "@/lib/design-templates";

export interface CalendarState {
  format: string;
  design: CalDesign;
  back: CalBack;
  /** รูปต้นฉบับทั้งหมดของแบบนี้ — เก็บไว้เปิดกลับมาแก้ได้เหมือนเดิม */
  sources: File[];
}

export interface CalendarResult {
  pages: { key: string; name: string; file: File }[];
  sources: File[];
  state: CalendarState;
  dpi: number;
  head: string;
  summary: string;
  spec: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** รูปแบบงานจากตัวเลือกของสินค้า (ดู calFormat) */
  format: string;
  /** ปีจากตัวเลือกของสินค้า (เปลี่ยนปีที่หน้าสินค้า) */
  year: number;
  initial?: CalendarState;
  onApply: (r: CalendarResult) => void | Promise<void>;
}

type Tab = "photo" | "cal";
type Src = { file: File; url: string; w: number; h: number; el: HTMLImageElement };

const DPI_WARN = 150;
const SWATCHES = ["#ffffff", "#1c1917", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#db2777"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

async function loadImg(file: File): Promise<Src | null> {
  const url = URL.createObjectURL(file);
  const el = new window.Image();
  const ok = await new Promise<boolean>((res) => {
    el.onload = () => res(true);
    el.onerror = () => res(false);
    el.src = url;
  });
  if (!ok || !el.naturalWidth) {
    URL.revokeObjectURL(url);
    return null;
  }
  return { file, url, w: el.naturalWidth, h: el.naturalHeight, el };
}

export default function CalendarStudio({ open, onClose, title, format, year, initial, onApply }: Props) {
  const fmt = useMemo(() => calFormat(format), [format]);
  const W = fmtW(fmt);
  const H = fmtH(fmt);
  const sameFormat = initial?.format === fmt.key;
  /** รูปแบบที่หัวข้อเป็นตัวบาง ("Calendar 2026") */
  const lightTitle = fmt.pages.some((p) => p.light);

  const [pageIdx, setPageIdx] = useState(0);
  const page = fmt.pages[Math.min(pageIdx, fmt.pages.length - 1)];
  const [tab, setTab] = useState<Tab>("photo");
  const [design, setDesign] = useState<CalDesign>(() => {
    if (initial && sameFormat) {
      const d = initial.design;
      // ข้อความหน้าปกที่ยังเป็นปีอัตโนมัติ (ลูกค้าไม่ได้พิมพ์เอง) → เปลี่ยนตามปีใหม่ด้วย
      const was = initial.back.year;
      if (d.text && was !== year && d.text.value.trim() === String(was)) return { ...d, text: { ...d.text, value: String(year) } };
      return d;
    }
    // รูปแบบงานเปลี่ยน (เช่นสลับแนว) — ตำแหน่งรูป/ข้อความเดิมใช้ไม่ได้ เริ่มวางใหม่ แต่รูปที่อัปไว้ยังอยู่
    return { bg: initial?.design.bg ?? "#ffffff", text: null, photos: {} };
  });
  const [back, setBack] = useState<CalBack>(() => {
    /**
     * แบบหน้าร้านเดิม (light): ฟอนต์ Montserrat + แดงเฉพาะวันอาทิตย์ (ภาพต้นแบบไม่ไฮไลต์วันหยุด) — ลูกค้าเปิดเองได้
     * ใช้เฉพาะตอนเริ่มแบบใหม่ แบบที่เปิดมาแก้คงค่าที่ลูกค้าตั้งไว้
     */
    const b = initial?.back ?? (lightTitle ? { ...defaultBack(year), font: "montserrat", holidayOn: false } : defaultBack(year));
    // หัวข้ออัตโนมัติ → ตามปีปัจจุบันและแบบตัวอักษรของรูปแบบงาน (แบบตัวบาง = "Calendar 2026")
    if (isAutoTitle(b.title, b.year, b.lang)) return { ...b, year, title: defaultTitle(year, b.lang, lightTitle) };
    return b.year !== year ? { ...b, year } : b;
  });
  const [srcs, setSrcs] = useState<Src[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dropOn, setDropOn] = useState(false);
  const [gapAsk, setGapAsk] = useState<string[] | null>(null);
  const [fontTick, setFontTick] = useState(0);
  /** แตะโดนข้อความหน้าปก = เลือกอยู่ (ขึ้นกรอบฟ้า) */
  const [textSel, setTextSel] = useState(false);
  /** แถวกรอกวันสำคัญ (ยังไม่กดเพิ่ม) */
  const [evDate, setEvDate] = useState("");
  const [evLabel, setEvLabel] = useState("");
  const [evColor, setEvColor] = useState("#db2777");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imgs: (ImgRef | null)[] = useMemo(() => srcs.map((s) => ({ el: s.el, w: s.w, h: s.h })), [srcs]);
  const holidayData = hasHolidayData(back.year);
  const holidays = useMemo(() => holidaysOf(back.year), [back.year]);
  /** หน้าแรกที่มีช่องรูป = หน้าปก (รูปของหน้านี้คือรูปตั้งต้นของทุกหน้า) */
  const coverPage = fmt.pages.find((p) => p.photo);
  const textPage = fmt.pages.find((p) => p.text);

  // หน้าไม่มีช่องรูป → แผงตั้งค่าปฏิทิน · มีรูป → แผงรูป
  useEffect(() => {
    setTab(page.photo ? "photo" : "cal");
    setTextSel(false);
  }, [page.key, page.photo]);

  // ── ฟอนต์: ลิงก์ Google Fonts ครั้งแรกที่เปิด + วาดใหม่เมื่อฟอนต์ไหนโหลดเสร็จ ──
  useEffect(() => {
    if (!open) return;
    linkGoogleFonts();
    const bump = () => setFontTick((n) => n + 1);
    document.fonts?.addEventListener?.("loadingdone", bump);
    void ensureFonts([back.font, design.text?.font ?? "prompt"]).then(bump);
    return () => document.fonts?.removeEventListener?.("loadingdone", bump);
  }, [open, back.font, design.text?.font]);

  // ── เปิดมาแก้แบบเดิม → โหลดรูปต้นฉบับกลับ (ลำดับเดิม — design.photos อ้างตามลำดับ) ──
  useEffect(() => {
    if (!open || !initial?.sources.length) return;
    let dead = false;
    void (async () => {
      const list = await Promise.all(initial.sources.map(loadImg));
      if (dead) return;
      if (list.some((x) => !x)) setErr("โหลดรูปเดิมบางรูปไม่สำเร็จ — เลือกรูปใหม่ได้เลย");
      setSrcs(list.filter((x): x is Src => !!x));
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Esc · วางรูปจากคลิปบอร์ด · กันหน้าเว็บด้านหลังเลื่อน/รับไฟล์ ──
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (f) {
        e.preventDefault();
        e.stopPropagation();
        void addPhoto(f);
      }
    };
    const swallow = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("paste", paste);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
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

  // คืน blob url ตอนปิดจอ
  const srcsRef = useRef(srcs);
  srcsRef.current = srcs;
  useEffect(() => () => srcsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  /**
   * ใส่รูปให้หน้าที่เปิดอยู่ (หน้าไม่มีช่องรูป = ให้หน้าปก)
   * รูปแรกของแบบ = รูปหน้าปก + ใส่ปีเป็นข้อความเริ่มต้นให้เลย (ลบ/แก้ได้)
   */
  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("ใช้ได้เฉพาะไฟล์รูป (JPG / PNG / WEBP)");
      return;
    }
    setErr("");
    const s = await loadImg(file);
    if (!s) {
      setErr("เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น");
      return;
    }
    const target = page.photo ? page : coverPage;
    if (!target?.photo) return;
    const idx = srcs.length;
    setSrcs((cur) => [...cur, s]);
    setDesign((d) => ({
      ...d,
      photos: { ...d.photos, [target.key]: { src: idx, pl: coverPlacement(target.photo!, s) } },
      text: d.text ?? (idx === 0 && textPage ? defaultText(back.year, fmt) : null),
    }));
    if (!page.photo && coverPage) setPageIdx(fmt.pages.indexOf(coverPage));
  }

  /** ใช้รูปที่อัปไว้แล้วกับหน้านี้ */
  function pickPhoto(i: number) {
    if (!page.photo || !srcs[i]) return;
    setDesign((d) => ({ ...d, photos: { ...d.photos, [page.key]: { src: i, pl: coverPlacement(page.photo!, srcs[i]) } } }));
  }

  /** แก้ตำแหน่งรูปของหน้านี้ (ไม่มีของตัวเอง = ทำสำเนาจากรูปหน้าปกที่วางเต็มช่องก่อน แล้วค่อยแก้) */
  function editPl(fn: (pl: CalPlacement) => CalPlacement) {
    if (!page.photo) return;
    setDesign((d) => {
      const cur = photoOf(page, d, imgs);
      if (!cur) return d;
      const own = d.photos[page.key];
      const src = own ? own.src : imgs.findIndex(Boolean);
      return { ...d, photos: { ...d.photos, [page.key]: { src, pl: fn(cur.pl) } } };
    });
  }

  function scalePl(pl: CalPlacement, f: number): CalPlacement {
    const r = page.photo!;
    const min = (Math.max(r.w, r.h) / Math.max(pl.wMm, pl.hMm)) * pl.wMm * 0.2;
    const w = clamp(pl.wMm * f, min, pl.wMm * 40);
    const q = w / pl.wMm;
    return { ...pl, wMm: pl.wMm * q, hMm: pl.hMm * q };
  }

  // ── วาดพรีวิว ──
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cssW = cv.clientWidth;
    if (!cssW) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const PW = Math.round(cssW * dpr);
    const PH = Math.round((cssW * H * dpr) / W);
    if (cv.width !== PW || cv.height !== PH) {
      cv.width = PW;
      cv.height = PH;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const k = PW / W;
    ctx.clearRect(0, 0, PW, PH);
    drawPage(ctx, k, fmt, page, design, back, imgs);

    // ไกด์บนจอ (ไม่ติดไปกับไฟล์พิมพ์): ตัดตกจาง ๆ + เส้นตัดแดง + เขตปลอดภัยฟ้า
    ctx.save();
    const b = fmt.bleed * k;
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.fillRect(0, 0, PW, b);
    ctx.fillRect(0, PH - b, PW, b);
    ctx.fillRect(0, b, b, PH - 2 * b);
    ctx.fillRect(PW - b, b, b, PH - 2 * b);
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.lineWidth = dpr;
    ctx.strokeStyle = "rgba(220,38,38,.85)";
    ctx.strokeRect(b, b, fmt.trimW * k, fmt.trimH * k);
    ctx.strokeStyle = "rgba(14,165,233,.55)";
    const s = (fmt.bleed + fmt.safe) * k;
    ctx.strokeRect(s, s, (fmt.trimW - fmt.safe * 2) * k, (fmt.trimH - fmt.safe * 2) * k);
    if (page.text && design.text?.value.trim() && textSel) {
      const tb = textBox(ctx, design.text);
      const p = design.text.sizeMm * 0.12;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(2,132,199,.9)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect((tb.x - p) * k, (tb.y - p) * k, (tb.w + p * 2) * k, (tb.h + p * 2) * k);
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt, page, design, back, imgs, fontTick, textSel, W, H]);

  useEffect(() => {
    if (open) draw();
  }, [open, draw]);
  useEffect(() => {
    if (!open) return;
    const r = () => draw();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, [open, draw]);

  // ── ลาก/ซูมบนภาพ ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<
    | { kind: "photo"; pl: CalPlacement; x: number; y: number }
    | { kind: "text"; t: CalText; x: number; y: number }
    | { kind: "pinch"; pl: CalPlacement; dist: number }
    | null
  >(null);

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const inRect = (p: { x: number; y: number }, r?: { x: number; y: number; w: number; h: number }) =>
    !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = toMm(e);
    const cur = photoOf(page, design, imgs);
    if (pointers.current.size === 2 && cur) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: "pinch", pl: cur.pl, dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const t = design.text;
    const ctx = canvasRef.current?.getContext("2d");
    if (page.text && t?.value.trim() && ctx) {
      const tb = textBox(ctx, t);
      const pad = t.sizeMm * 0.25;
      if (p.x >= tb.x - pad && p.x <= tb.x + tb.w + pad && p.y >= tb.y - pad && p.y <= tb.y + tb.h + pad) {
        setTextSel(true);
        setTab("photo");
        drag.current = { kind: "text", t, x: p.x, y: p.y };
        return;
      }
    }
    setTextSel(false);
    if (cur && inRect(p, page.photo)) drag.current = { kind: "photo", pl: cur.pl, x: p.x, y: p.y };
    else if (page.grid && inRect(p, page.grid)) setTab("cal");
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const f = Math.hypot(a.x - b.x, a.y - b.y) / (d.dist || 1);
      editPl(() => scalePl(d.pl, f));
      return;
    }
    const p = toMm(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (d.kind === "photo") editPl(() => ({ ...d.pl, cxMm: d.pl.cxMm + dx, cyMm: d.pl.cyMm + dy }));
    else setDesign((x) => ({ ...x, text: { ...d.t, xMm: clamp(d.t.xMm + dx, 0, W), yMm: clamp(d.t.yMm + dy, 0, H) } }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    drag.current = null;
  }

  // ล้อเมาส์ = ซูมรูป (ต้องผูกเองแบบ passive:false ถึงกันหน้าเลื่อนได้)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !open) return;
    const wheel = (e: WheelEvent) => {
      if (!page.photo || !photoOf(page, design, imgs)) return;
      e.preventDefault();
      editPl((pl) => scalePl(pl, e.deltaY < 0 ? 1.06 : 1 / 1.06));
    };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => cv.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, design, imgs]);

  const cur = photoOf(page, design, imgs);
  const own = design.photos[page.key];
  const curSrc = own ? srcs[own.src] : srcs[0];
  const zoomPct = cur && page.photo && curSrc ? Math.round((cur.pl.wMm / coverPlacement(page.photo, curSrc).wMm) * 100) : 100;
  const dpi = cur && curSrc ? Math.round(curSrc.w / (cur.pl.wMm / 25.4)) : 0;
  const covers = cur && page.photo ? placementCovers(cur.pl, page.photo) : true;
  const isCover = coverPage?.key === page.key;

  const setText = (patch: Partial<CalText>) =>
    setDesign((d) => ({ ...d, text: { ...(d.text ?? defaultText(back.year, fmt)), ...patch } }));

  function addEvent() {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(evDate);
    if (!m) {
      setErr("เลือกวันที่ของวันสำคัญก่อน");
      return;
    }
    setErr("");
    const date = `${m[1]}-${m[2]}`;
    setBack((b) => ({
      ...b,
      events: [...b.events.filter((x) => x.date !== date), { date, label: evLabel.trim(), color: evColor }].sort((x, y) =>
        x.date.localeCompare(y.date),
      ),
    }));
    setEvDate("");
    setEvLabel("");
  }

  async function apply(force = false) {
    if (busy) return;
    if (!srcs.length || !coverPage) {
      if (coverPage) setPageIdx(fmt.pages.indexOf(coverPage));
      setErr("ใส่รูปหน้าปกก่อน — แตะ 🖼 เลือกรูป หรือลากรูปมาวาง");
      return;
    }
    // หน้าที่ลูกค้าขยับรูปเองจนไม่เต็มช่อง — ถามก่อน (หน้าที่ใช้รูปปกอัตโนมัติวางเต็มช่องเสมอ)
    if (!force) {
      const gaps = fmt.pages.filter((p) => {
        const o = design.photos[p.key];
        return p.photo && o && !placementCovers(o.pl, p.photo);
      });
      if (gaps.length) {
        setPageIdx(fmt.pages.indexOf(gaps[0]));
        setGapAsk(gaps.map((p) => p.name));
        return;
      }
    }
    setGapAsk(null);
    setErr("");
    try {
      setBusy("กำลังเตรียมฟอนต์…");
      await ensureFonts([back.font, design.text?.font ?? "prompt"]);
      const stem = (srcs[0].file.name.replace(/\.[^.]+$/, "") || "calendar").slice(0, 40);
      const out: CalendarResult["pages"] = [];
      for (let i = 0; i < fmt.pages.length; i++) {
        const p = fmt.pages[i];
        setBusy(`กำลังประกอบหน้า ${i + 1}/${fmt.pages.length}…`);
        const photo = !!p.photo;
        const no = fmt.pages.length > 2 ? `${String(i + 1).padStart(2, "0")}-` : "";
        const f = await renderPage(
          fmt,
          (ctx, k) => drawPage(ctx, k, fmt, p, design, back, imgs),
          photo ? "image/jpeg" : "image/png",
          `${stem}-ปฏิทิน${back.year}-${no}${p.name}.${photo ? "jpg" : "png"}`,
        );
        if (!f) throw new Error(`ประกอบหน้า "${p.name}" ไม่สำเร็จ ลองใหม่อีกครั้ง`);
        out.push({ key: p.key, name: p.name, file: f });
      }
      // ความคมชัดต่ำสุดของทุกหน้า (ทีมผลิตดูตัวเลขเดียวพอ)
      const dpis = fmt.pages
        .map((p) => {
          const c = photoOf(p, design, imgs);
          const o = design.photos[p.key];
          const s = o ? srcs[o.src] : srcs[0];
          return c && s ? Math.round(s.w / (c.pl.wMm / 25.4)) : Infinity;
        })
        .filter(Number.isFinite);
      const minDpi = dpis.length ? Math.min(...dpis) : 0;
      const n = (v: number) => Math.round(v * 100) / 100;
      const ownCount = Object.keys(design.photos).length;
      const textNote = design.text?.value.trim() ? ` · ข้อความหน้าปก "${design.text.value.trim().replace(/\n/g, " ")}"` : "";
      setBusy("กำลังอัปโหลด…");
      await onApply({
        pages: out,
        sources: srcs.map((s) => s.file),
        state: { format: fmt.key, design, back, sources: srcs.map((s) => s.file) },
        dpi: minDpi,
        head: `${fmt.name} · ปี ${back.year}`,
        summary: `${title} · ปฏิทินปี ${back.year} · ${fmt.pages.length} หน้า · ${minDpi} DPI`,
        spec:
          `${fmt.name} · กรอบ ${n(W)}×${n(H)}mm (งานจริง ${n(fmt.trimW)}×${n(fmt.trimH)} + ตัดตก ${fmt.bleed}) · ไฟล์ ${fmt.dpi} DPI · ` +
          `${fmt.pages.length} หน้า: ${fmt.pages.map((p, i) => `${i + 1}.${p.name}`).join(" ")}` +
          `${fmt.note ? ` (${fmt.note})` : ""} · รูป ${srcs.length} ไฟล์ (ใส่รายหน้า ${ownCount} หน้า ที่เหลือใช้รูปหน้าปก) · ความคมชัดต่ำสุด ${minDpi} DPI${textNote} · ` +
          `ปฏิทิน: ${backSpec(back)} ` +
          printFrameToken(W, H),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองกดใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  }

  if (!open) return null;

  const t = design.text;
  const aspect = W / H;
  const multi = fmt.pages.length > 1;
  const coverIdx = coverPage ? fmt.pages.indexOf(coverPage) : -1;

  return (
    // z-[130]: เหนือแถบราคาล่าง (z-91) และปุ่มลอยของหน้าสินค้า — ไม่งั้นทับปุ่ม "ใช้แบบนี้"
    <div className="fixed inset-0 z-[130] flex flex-col justify-center bg-stone-900/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative mx-auto flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-white sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl sm:shadow-2xl">
        {/* หัว */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-stone-800">🗓 สร้างปฏิทิน</p>
            <p className="truncate text-[11px] text-stone-500">
              {title} · {fmt.name} · ปี {back.year} · {fmt.pages.length} หน้า
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
          {/* เวที */}
          <div
            className={`relative flex min-w-0 shrink-0 flex-col items-center gap-2 p-3 transition sm:flex-1 sm:justify-center sm:p-4 ${dropOn ? "bg-sky-50" : "bg-stone-50"}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropOn(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(false);
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files?.length) return;
              e.preventDefault();
              e.stopPropagation();
              setDropOn(false);
              void addPhoto(e.dataTransfer.files[0]);
            }}
          >
            <div className="relative w-full" style={{ maxWidth: `min(100%, ${aspect * 52}vh, ${aspect >= 1 ? 620 : 380}px)` }}>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`block w-full touch-none select-none rounded-md shadow-[0_2px_14px_rgba(28,25,23,.18)] ${cur ? "cursor-move" : ""}`}
                style={{ aspectRatio: `${W} / ${H}` }}
              />
              {!srcs.length && page.photo && (
                <label
                  className="absolute flex cursor-pointer flex-col items-center justify-center gap-1 bg-[#b8b8b8] text-center text-white transition hover:bg-[#adadad]"
                  style={{
                    left: `${(page.photo.x / W) * 100}%`,
                    top: `${(page.photo.y / H) * 100}%`,
                    width: `${(page.photo.w / W) * 100}%`,
                    height: `${(page.photo.h / H) * 100}%`,
                  }}
                >
                  {/* ช่องรูปว่าง = สีเทาแบบโปรแกรมหน้าร้านเดิม (บนจอเท่านั้น ไฟล์พิมพ์ต้องมีรูปก่อนกดใช้แบบ) */}
                  <span className="text-sm font-bold">เลือกรูป / ลากรูปมาวาง</span>
                  <span className="text-2xl leading-none">🖼</span>
                  <span className="px-3 text-[10.5px] text-white/85">แตะเพื่อเลือก · ⌘/Ctrl+V</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void addPhoto(e.target.files?.[0])} />
                </label>
              )}
            </div>
            {/* แถบเลือกหน้า */}
            {multi && (
              <div className="flex w-full max-w-full items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {fmt.pages.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPageIdx(i)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      i === pageIdx ? "bg-sky-600 text-white shadow" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                    }`}
                    title={p.name}
                  >
                    {fmt.pages.length > 2 ? `${i + 1}. ` : ""}
                    {p.name}
                    {design.photos[p.key] && i !== coverIdx ? " 🖼" : ""}
                  </button>
                ))}
              </div>
            )}
            <p className="text-center text-[10.5px] leading-tight text-stone-400">
              <span className="text-rose-500">- - -</span> เส้นตัด · <span className="text-sky-500">- - -</span> เขตปลอดภัย
              {fmt.note ? ` · ${fmt.note}` : ""}
            </p>
          </div>

          {/* แผงตั้งค่า */}
          <div className="w-full shrink-0 border-t border-stone-100 sm:flex sm:w-80 sm:flex-col sm:overflow-hidden sm:border-l sm:border-t-0">
            <div className="flex gap-1 p-3 pb-0">
              {(
                [
                  ["photo", "🖼 รูป & ข้อความ"],
                  ["cal", "🗓 ตั้งค่าปฏิทิน"],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${tab === k ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="space-y-3 p-3 sm:flex-1 sm:overflow-y-auto">
              {tab === "photo" ? (
                <>
                  {page.photo ? (
                    <Section title={`รูป · ${page.name}`}>
                      <div className="flex flex-wrap gap-1.5">
                        <label className={`${toolBtn} cursor-pointer`}>
                          {own ? "🔄 เปลี่ยนรูป" : srcs.length && !isCover ? "🖼 ใช้รูปอื่นกับหน้านี้" : "🖼 เลือกรูป"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void addPhoto(e.target.files?.[0])} />
                        </label>
                        <button
                          type="button"
                          disabled={!cur}
                          onClick={() => curSrc && page.photo && editPl(() => coverPlacement(page.photo!, curSrc))}
                          className={toolBtn}
                        >
                          ⤢ เต็มช่อง
                        </button>
                        <button type="button" disabled={!cur} onClick={() => editPl((pl) => ({ ...pl, rotDeg: (pl.rotDeg + 90) % 360 }))} className={toolBtn}>
                          ↻ หมุน
                        </button>
                        {!isCover && own && (
                          <button
                            type="button"
                            onClick={() =>
                              setDesign((d) => {
                                const photos = { ...d.photos };
                                delete photos[page.key];
                                return { ...d, photos };
                              })
                            }
                            className={toolBtn}
                          >
                            ↺ ใช้รูปหน้าปก
                          </button>
                        )}
                      </div>
                      {!isCover && !own && srcs.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-stone-500">หน้านี้ใช้รูปหน้าปกอยู่ — เลือกรูปใหม่ หรือแตะรูปที่อัปไว้ด้านล่าง</p>
                      )}
                      {srcs.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {srcs.map((s, i) => (
                            <button
                              key={s.url}
                              type="button"
                              onClick={() => pickPhoto(i)}
                              title="ใช้รูปนี้กับหน้านี้"
                              className={`h-10 w-10 overflow-hidden rounded-md ring-2 ${(own ? own.src : 0) === i ? "ring-sky-500" : "ring-transparent hover:ring-stone-300"}`}
                            >
                              <img src={s.url} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      {cur && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] font-bold text-stone-500">ซูม</span>
                          <input
                            type="range"
                            min={20}
                            max={400}
                            value={zoomPct}
                            onChange={(e) => editPl((pl) => scalePl(pl, Number(e.target.value) / Math.max(1, zoomPct)))}
                            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
                            aria-label="ย่อ-ขยายรูป"
                          />
                          <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-stone-500">{zoomPct}%</span>
                        </div>
                      )}
                      {cur && (
                        <p className={`mt-1.5 text-[11px] font-semibold ${dpi < DPI_WARN ? "text-amber-700" : "text-emerald-700"}`}>
                          {dpi < DPI_WARN ? `⚠️ ความคมชัด ${dpi} DPI — รูปอาจแตก ลองใช้รูปไฟล์ใหญ่ขึ้น` : `✓ ความคมชัด ${dpi} DPI`}
                          {!covers && <span className="block text-rose-600">⚠️ รูปยังไม่เต็มช่อง — จะเห็นสีพื้นตรงขอบ</span>}
                        </p>
                      )}
                      <p className="mt-1 text-[10.5px] text-stone-400">ลากบนภาพเพื่อเลื่อนรูป · ล้อเมาส์/สองนิ้วเพื่อซูม</p>
                    </Section>
                  ) : (
                    <Section title={page.name}>
                      <p className="text-[11px] text-stone-500">หน้านี้เป็นตารางปฏิทินล้วน — ปรับหน้าตาได้ที่แท็บ 🗓 ตั้งค่าปฏิทิน</p>
                    </Section>
                  )}

                  {page.photo && (
                    <Section title="สีพื้นช่องรูป">
                      <Colors value={design.bg} onChange={(bg) => setDesign((d) => ({ ...d, bg }))} />
                    </Section>
                  )}

                  {page.text && (
                    <Section
                      title="ข้อความบนหน้าปก"
                      right={
                        t ? (
                          <button type="button" onClick={() => setDesign((d) => ({ ...d, text: null }))} className="text-[11px] font-bold text-rose-500">
                            ลบข้อความ
                          </button>
                        ) : (
                          <button type="button" onClick={() => setText({})} className="text-[11px] font-bold text-sky-700">
                            ＋ เพิ่มข้อความ
                          </button>
                        )
                      }
                    >
                      {t ? (
                        <div className="space-y-2">
                          <textarea
                            value={t.value}
                            onChange={(e) => setText({ value: e.target.value.slice(0, 80) })}
                            rows={2}
                            className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
                            placeholder="เช่น 2026 / ชื่อร้าน / ชื่อคนรับ"
                          />
                          <FontSelect value={t.font} onChange={(font) => setText({ font })} />
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-stone-500">ขนาด</span>
                            <input
                              type="range"
                              min={Math.max(2, Math.min(W, H) * 0.03)}
                              max={Math.min(W, H) * 0.3}
                              step={Math.min(W, H) / 200}
                              value={t.sizeMm}
                              onChange={(e) => setText({ sizeMm: Number(e.target.value) })}
                              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
                              aria-label="ขนาดตัวอักษร"
                            />
                            <button
                              type="button"
                              onClick={() => setText({ bold: !t.bold })}
                              className={`${toolBtn} ${t.bold ? "bg-stone-800 text-white hover:bg-stone-700" : ""}`}
                            >
                              B
                            </button>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-bold text-stone-500">สีตัวอักษร</p>
                            <Colors value={t.color} onChange={(color) => setText({ color })} />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-bold text-stone-500">ขอบตัวอักษร</p>
                            <Colors value={t.stroke} onChange={(stroke) => setText({ stroke })} allowNone />
                          </div>
                          <button
                            type="button"
                            onClick={() => setText({ xMm: page.photo ? page.photo.x + page.photo.w / 2 : W / 2 })}
                            className={toolBtn}
                          >
                            ↔ จัดกึ่งกลาง
                          </button>
                          <p className="text-[10.5px] text-stone-400">ลากข้อความบนภาพเพื่อย้ายตำแหน่ง</p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-stone-400">ไม่มีข้อความบนหน้าปก</p>
                      )}
                    </Section>
                  )}
                </>
              ) : (
                <>
                  <Section title="ปฏิทิน">
                    <p className="text-[11px] text-stone-500">
                      ปี <b className="text-stone-800">{back.year}</b> (พ.ศ. {back.year + 543}) — เปลี่ยนปีได้ที่ตัวเลือกในหน้าสินค้า
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <Toggle
                        label="ภาษา"
                        options={[
                          ["en", "English"],
                          ["th", "ไทย"],
                        ]}
                        value={back.lang}
                        onChange={(lang) =>
                          setBack((b) => ({
                            ...b,
                            lang: lang as CalBack["lang"],
                            title: isAutoTitle(b.title, b.year, b.lang) ? defaultTitle(b.year, lang as CalBack["lang"], lightTitle) : b.title,
                          }))
                        }
                      />
                      <Toggle
                        label="เริ่มสัปดาห์"
                        options={[
                          ["0", "อาทิตย์"],
                          ["1", "จันทร์"],
                        ]}
                        value={String(back.weekStart)}
                        onChange={(v) => setBack((b) => ({ ...b, weekStart: v === "1" ? 1 : 0 }))}
                      />
                    </div>
                    {fmt.pages.some((p) => p.kind === "year" || p.kind === "photo-year") && (
                      <label className="mt-2 block text-[11px] font-bold text-stone-500">
                        หัวข้อปฏิทินทั้งปี
                        <input
                          value={back.title}
                          onChange={(e) => setBack((b) => ({ ...b, title: e.target.value.slice(0, 30) }))}
                          className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm font-normal text-stone-800"
                          placeholder="เว้นว่าง = ไม่มีหัวข้อ"
                        />
                      </label>
                    )}
                    <div className="mt-2">
                      <FontSelect value={back.font} onChange={(font) => setBack((b) => ({ ...b, font }))} />
                    </div>
                  </Section>

                  <Section title="สี">
                    <p className="mb-1 text-[11px] font-bold text-stone-500">หัวข้อ + ชื่อเดือน</p>
                    <Colors value={back.accent} onChange={(accent) => setBack((b) => ({ ...b, accent }))} />
                    <p className="mb-1 mt-2 text-[11px] font-bold text-stone-500">ตัวเลขวันที่</p>
                    <Colors value={back.ink} onChange={(ink) => setBack((b) => ({ ...b, ink }))} />
                    <p className="mb-1 mt-2 text-[11px] font-bold text-stone-500">สีพื้นปฏิทิน</p>
                    <Colors value={back.bg} onChange={(bg) => setBack((b) => ({ ...b, bg }))} />
                  </Section>

                  <Section title="วันหยุด">
                    <Switch
                      label="ไฮไลต์วันหยุดนักขัตฤกษ์ (ไทย)"
                      on={back.holidayOn && holidayData}
                      disabled={!holidayData}
                      color={back.holidayColor}
                      onToggle={() => setBack((b) => ({ ...b, holidayOn: !b.holidayOn }))}
                      onColor={(holidayColor) => setBack((b) => ({ ...b, holidayColor }))}
                    />
                    {!holidayData && <p className="mt-1 text-[10.5px] text-amber-700">ยังไม่มีตารางวันหยุดของปี {back.year} — ใส่เป็นวันสำคัญเองได้</p>}
                    {back.holidayOn && holidayData && (
                      <details className="mt-1 text-[10.5px] text-stone-500">
                        <summary className="cursor-pointer font-bold">ดูวันหยุดที่จะไฮไลต์ ({Object.keys(holidays).length} วัน)</summary>
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(holidays)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([d, nm]) => (
                              <li key={d}>
                                {Number(d.slice(3))}/{Number(d.slice(0, 2))} · {nm}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                    <div className="mt-2">
                      <Switch
                        label="สีวันอาทิตย์"
                        on={back.sundayOn}
                        color={back.sundayColor}
                        onToggle={() => setBack((b) => ({ ...b, sundayOn: !b.sundayOn }))}
                        onColor={(sundayColor) => setBack((b) => ({ ...b, sundayColor }))}
                      />
                    </div>
                  </Section>

                  <Section title="วันสำคัญของคุณ">
                    <p className="mb-1.5 text-[10.5px] text-stone-400">วันเกิด วันครบรอบ ฯลฯ — วงกลมสีบนวันนั้น (หน้ารายเดือนมีชื่อวันใต้ตัวเลขด้วย)</p>
                    {back.events.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {back.events.map((ev) => (
                          <li key={ev.date} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1 text-xs">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ev.color }} />
                            <span className="font-bold tabular-nums">
                              {Number(ev.date.slice(3))}/{Number(ev.date.slice(0, 2))}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-stone-600">{ev.label}</span>
                            <button
                              type="button"
                              onClick={() => setBack((b) => ({ ...b, events: b.events.filter((x) => x.date !== ev.date) }))}
                              className="font-bold text-rose-500"
                              aria-label="ลบวันสำคัญนี้"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-1.5">
                      <input
                        type="date"
                        value={evDate}
                        min={`${back.year}-01-01`}
                        max={`${back.year}-12-31`}
                        onChange={(e) => setEvDate(e.target.value)}
                        className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
                      />
                      <input
                        value={evLabel}
                        onChange={(e) => setEvLabel(e.target.value.slice(0, 40))}
                        placeholder="ชื่อวัน (ไม่บังคับ) เช่น วันเกิดแม่"
                        className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
                      />
                      <Colors value={evColor} onChange={setEvColor} exclude={["#ffffff"]} />
                      <button
                        type="button"
                        onClick={addEvent}
                        className="w-full rounded-full bg-sky-50 px-3 py-1.5 text-xs font-extrabold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                      >
                        ＋ เพิ่มวันสำคัญ
                      </button>
                    </div>
                  </Section>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ท้าย */}
        <div className="border-t border-stone-100 px-4 py-3">
          {err && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100">
              ยกเลิก
            </button>
            {multi && pageIdx < fmt.pages.length - 1 && srcs.length > 0 && (
              <button
                type="button"
                onClick={() => setPageIdx((i) => i + 1)}
                className="rounded-full bg-stone-100 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-200"
              >
                หน้าถัดไป →
              </button>
            )}
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!!busy}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy || "✓ ใช้แบบนี้"}
            </button>
          </div>
        </div>

        {gapAsk && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-900/45 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
              <p className="text-sm font-extrabold text-rose-700">⚠️ รูปยังไม่เต็มช่อง</p>
              <p className="mt-2 text-xs leading-relaxed text-stone-600">
                หน้า {gapAsk.join(", ")} — ขอบที่รูปไม่ถึงจะพิมพ์ออกมาเป็นสีพื้น แก้ทีหลังไม่ได้
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDesign((d) => {
                      const photos = { ...d.photos };
                      for (const p of fmt.pages) {
                        const o = photos[p.key];
                        if (p.photo && o && srcs[o.src] && !placementCovers(o.pl, p.photo))
                          photos[p.key] = { ...o, pl: coverPlacement(p.photo, srcs[o.src]) };
                      }
                      return { ...d, photos };
                    });
                    setGapAsk(null);
                  }}
                  className="rounded-full bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-sky-700"
                >
                  ⤢ ขยายรูปให้เต็มช่องทุกหน้า
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGapAsk(null)}
                    className="flex-1 rounded-full bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-200"
                  >
                    ← กลับไปปรับเอง
                  </button>
                  <button
                    type="button"
                    onClick={() => void apply(true)}
                    className="flex-1 rounded-full border border-stone-200 px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-stone-50"
                  >
                    ใช้แบบนี้เลย
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold text-stone-700">{title}</p>
        {right}
      </div>
      {children}
    </section>
  );
}

function Colors({
  value,
  onChange,
  allowNone,
  exclude = [],
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  exclude?: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`h-6 rounded-full px-2 text-[10px] font-bold ring-1 ${value === "" ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-500 ring-stone-300"}`}
        >
          ไม่มี
        </button>
      )}
      {SWATCHES.filter((c) => !exclude.includes(c)).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`สี ${c}`}
          className={`h-6 w-6 rounded-full ring-1 ring-stone-300 transition ${value.toLowerCase() === c ? "scale-110 outline outline-2 outline-offset-1 outline-sky-500" : ""}`}
          style={{ background: c }}
        />
      ))}
      <label
        className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-stone-300"
        title="เลือกสีเอง"
        style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
      >
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm">
      {CAL_FONTS.map((f) => (
        <option key={f.key} value={f.key}>
          ฟอนต์ {f.name}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-stone-500">{label}</p>
      <div className="flex rounded-full bg-stone-100 p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] font-bold transition ${value === v ? "bg-white text-sky-700 shadow" : "text-stone-500"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({
  label,
  on,
  disabled,
  color,
  onToggle,
  onColor,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  color: string;
  onToggle: () => void;
  onColor: (c: string) => void;
}) {
  return (
    <div>
      <button type="button" disabled={disabled} onClick={onToggle} className="flex w-full items-center justify-between gap-2 disabled:opacity-50">
        <span className="text-xs font-bold text-stone-700">{label}</span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-sky-600" : "bg-stone-300"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {on && (
        <div className="mt-1.5">
          <Colors value={color} onChange={onColor} exclude={["#ffffff"]} />
        </div>
      )}
    </div>
  );
}

const toolBtn =
  "rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40";

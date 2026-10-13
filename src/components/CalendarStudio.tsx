"use client";

/**
 * 🗓 จอสร้างปฏิทินบนเว็บ — ยกหน้าตา/ฟังก์ชันจากโปรแกรมออกแบบของหน้าร้านเดิม (Printbox)
 *
 * ใช้กับทุกสินค้าปฏิทินที่ตั้ง Product.calendarStudio (โฟโต้การ์ด · โปสการ์ด · ตั้งโต๊ะ · ผ้าแคนวาส)
 * รูปแบบงาน (ขนาด/จำนวนหน้า/เลย์เอาต์) มาจาก calFormat() ใน lib/calendar-card ตามตัวเลือกที่ลูกค้าเลือก
 *
 * โครงจอแบบ Printbox (ผู้ใช้ mark ตำแหน่งให้ 12 ต.ค. 69):
 *   ขวาสุด = แถบไอคอนแนวตั้ง Text · Photo · Layout · Rectangle · Ellipse · Calendar · Events · Settings
 *   ล่าง   = แถบรูปย่อของทุกหน้า (วาดจากตัววาดจริง) กดเพื่อสลับหน้า
 * แต่ละหน้า: ช่องรูป (ลาก/ซูม/หมุน) · ข้อความ/รูปทรงหลายชิ้น (ลากวางได้) · ตารางปี/เดือนที่ระบบสร้างให้
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
  cardKey,
  coverPlacement,
  defaultBack,
  defaultText,
  defaultTitle,
  isAutoTitle,
  drawPage,
  elementBox,
  elementPhotoSize,
  ensureFonts,
  fmtH,
  fmtW,
  hasHolidayData,
  holidaysOf,
  layoutsOf,
  linkGoogleFonts,
  pageWithLayout,
  photoOf,
  slotSrc,
  placementCovers,
  renderPage,
  calDesignCount,
  CAL_FILTERS,
  LAYER_GRID,
  LAYER_SLOT,
  orderOf,
  gridOf,
  layPage,
  trimPath,
  type CalBack,
  type CalPart,
  type CalPartKey,
  type CalDesign,
  type CalElement,
  type CalPage,
  type CalPhoto,
  type CalPlacement,
  type Rect,
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
  /** ปีที่เลือกได้ (ตามตัวเลือก "ปีปฏิทิน" ของสินค้า) — หน้าต่าง Settings เปลี่ยนปีได้ */
  years?: number[];
  /** เปลี่ยนปีในจอ → หน้าสินค้าเลือกตัวเลือกปีให้ตรง */
  onYear?: (year: number) => void;
  /** ค่าคละลายรวมของรายการ เมื่อแบบนี้มี n ลาย (คิดตามกติกาสินค้า · ตัวเดียวกับหน้าสินค้า/ตะกร้า) */
  mixFee?: (designs: number) => number;
  /** จำนวนที่สั่งอยู่ + หน่วย (โชว์คู่กับค่าคละ) */
  qty?: number;
  unit?: string;
  /** 💰 ราคารวมรายการนี้ถ้าแบบนี้มี n ลาย (ราคาตามสเปค × จำนวน + ค่าคละ) — โชว์บนปุ่มใส่ตะกร้า */
  price?: (designs: number) => number;
  /** 🛒 ใส่ตะกร้าเลย — เรียกหลัง onApply แนบแบบเสร็จ (หน้าสินค้ากดเพิ่มลงตะกร้าให้) */
  onOrder?: () => void | Promise<void>;
  /**
   * 📐 เทมเพลตของวัสดุที่เลือก (รูปตัวอย่างไฟล์ .ai/.pdf + ขนาดอาร์ตบอร์ด มม.) — วาดทับบนจอเป็นไกด์ (กรอบการ์ดจริงของวัสดุนั้น)
   * ไม่ติดไปกับไฟล์ส่งพิมพ์ · ไม่มี = ใช้เส้นตัดที่ระบบวาดเอง
   */
  guide?: {
    url: string;
    wMm: number;
    hMm: number;
    name?: string;
    fill?: boolean;
  };
  /** ลูกค้าเลือก "มุมแหลม" — โฟโต้การ์ดไม่ตัดมุมมน (ไกด์บนจอเป็นสี่เหลี่ยม) */
  square?: boolean;
  initial?: CalendarState;
  onApply: (r: CalendarResult) => void | Promise<void>;
}

/** แผงด้านข้างตามปุ่มในแถบเครื่องมือ (null = ปิดแผง) */
type Tool = "text" | "photo" | "layout" | "shape" | "calendar" | "events" | "settings";
/** removed = ลูกค้ากดลบจากคลังรูป — เก็บช่องไว้ (design อ้างรูปตามลำดับ) แล้วค่อยบีบลำดับตอน "ใช้แบบนี้" */
type Src = {
  file: File;
  url: string;
  w: number;
  h: number;
  el: HTMLImageElement;
  removed?: boolean;
};

const DPI_WARN = 150;
const SWATCHES = ["#ffffff", "#1c1917", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#db2777"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const uid = () => Math.random().toString(36).slice(2, 9);
/** วงกลมลูกศร 4 ทิศกลางรูป (แบบ Printbox) = จุดลากเลื่อนรูปในกรอบ · ลากที่อื่นในกรอบ = ย้ายทั้งกรอบ */
function drawPanIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, dpr: number) {
  ctx.save();
  ctx.setLineDash([]);
  const rad = 22 * dpr;
  ctx.fillStyle = "rgba(120,113,108,.45)";
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.2 * dpr;
  ctx.lineCap = "round";
  const a = rad * 0.55;
  const hd = rad * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - a, cy);
  ctx.lineTo(cx + a, cy);
  ctx.moveTo(cx, cy - a);
  ctx.lineTo(cx, cy + a);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const tx = cx + dx * a;
    const ty = cy + dy * a;
    ctx.moveTo(tx - dx * hd - dy * hd, ty - dy * hd - dx * hd);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx - dx * hd + dy * hd, ty - dy * hd + dx * hd);
  }
  ctx.stroke();
  ctx.restore();
}
/** เคอร์เซอร์ของจุดจับ 8 จุด (ลำดับเดียวกับ handlesOf) — มุม = ลูกศรทแยง · กลางขอบ = ลูกศรแกนเดียว */
const HANDLE_CURSOR = ["nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize", "ns-resize", "ns-resize", "ew-resize", "ew-resize"];
/**
 * ↔ ปรับขนาดช่องแล้วรูปคงขนาดเดิม (แบบ Printbox) — ขยายรูปเท่าที่จำเป็นเฉพาะตอนช่องใหญ่กว่ารูป
 * แล้วเลื่อนรูปให้ยังคลุมช่องเต็ม (ไม่เหลือขอบขาว)
 */
function keepCover(pl: CalPlacement, r: Rect): CalPlacement {
  if (placementCovers(pl, r)) return pl;
  let s = Math.max(1, r.w / pl.wMm, r.h / pl.hMm);
  for (let i = 0; i < 60; i++) {
    const w = pl.wMm * s;
    const h = pl.hMm * s;
    const lo = (a: number, b: number) => (a <= b ? [a, b] : [(a + b) / 2, (a + b) / 2]);
    const [x0, x1] = lo(r.x + r.w - w / 2, r.x + w / 2);
    const [y0, y1] = lo(r.y + r.h - h / 2, r.y + h / 2);
    const next = { ...pl, wMm: w, hMm: h, cxMm: clamp(pl.cxMm, x0, x1), cyMm: clamp(pl.cyMm, y0, y1) };
    if (placementCovers(next, r)) return next;
    s *= 1.03; // รูปหมุนเอียงอยู่ — ขยายทีละนิดจนคลุม
  }
  return pl;
}
/** จุดจับ 8 จุดของกรอบเลือก (มม.): 0 บนซ้าย 1 บนขวา 2 ล่างซ้าย 3 ล่างขวา 4 บน 5 ล่าง 6 ซ้าย 7 ขวา */
const handlesOf = (r: { x: number; y: number; w: number; h: number }, p: number): [number, number][] => {
  const x0 = r.x - p;
  const x1 = r.x + r.w + p;
  const y0 = r.y - p;
  const y1 = r.y + r.h + p;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  return [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
    [xm, y0],
    [xm, y1],
    [x0, ym],
    [x1, ym],
  ];
};

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

/** ข้อความหน้าปกแบบเก่า (design.text กล่องเดียว) → ชิ้นส่วนข้อความ แก้/เพิ่ม/ลบได้เหมือนกล่องอื่น */
function textToElement(t: NonNullable<CalDesign["text"]>, page: string): CalElement {
  return {
    id: uid(),
    page,
    kind: "text",
    x: t.xMm,
    y: t.yMm,
    w: 0,
    h: 0,
    rot: 0,
    fill: t.color,
    stroke: t.stroke,
    strokeW: 0,
    text: t.value,
    font: t.font,
    size: t.sizeMm,
    bold: t.bold,
  };
}

const KIND_TH: Record<CalElement["kind"], string> = {
  text: "ข้อความ",
  photo: "กรอบรูป",
  rect: "สี่เหลี่ยม",
  ellipse: "วงรี",
};

/** ชื่อขั้นในประวัติ — เดาจากสิ่งที่เปลี่ยนระหว่างสองสภาพ */
function diffLabel(a: { design: CalDesign; back: CalBack }, d: CalDesign, b: CalBack): string {
  const ea = a.design.elements ?? [];
  const eb = d.elements ?? [];
  if (eb.length > ea.length) {
    const added = eb.find((e) => !ea.some((x) => x.id === e.id));
    return `เพิ่ม${added ? KIND_TH[added.kind] : "ชิ้นส่วน"}`;
  }
  if (eb.length < ea.length) {
    const gone = ea.find((e) => !eb.some((x) => x.id === e.id));
    return `ลบ${gone ? KIND_TH[gone.kind] : "ชิ้นส่วน"}`;
  }
  if (a.design.elements !== d.elements) {
    const ch = eb.find((e) => {
      const o = ea.find((x) => x.id === e.id);
      return o && o !== e;
    });
    if (ch) {
      const o = ea.find((x) => x.id === ch.id)!;
      if (ch.kind === "text" && o.text !== ch.text) return "แก้ข้อความ";
      if (ch.kind === "photo" && o.src !== ch.src) return ch.src == null ? "เอารูปออกจากกรอบ" : "ใส่รูปในกรอบ";
      if (o.x !== ch.x || o.y !== ch.y) return o.w !== ch.w || o.h !== ch.h ? `ย่อ-ขยาย${KIND_TH[ch.kind]}` : `ย้าย${KIND_TH[ch.kind]}`;
      return `ปรับ${KIND_TH[ch.kind]}`;
    }
    return "จัดลำดับชั้น";
  }
  if (a.design.photos !== d.photos) return "ปรับรูปช่องหลัก";
  if (a.design.layouts !== d.layouts) return "เปลี่ยนเลย์เอาต์";
  if (a.design.custom !== d.custom) return "แยก/รวมแบบใบ";
  if (a.design.grids !== d.grids) return "ย้าย/ย่อ-ขยายปฏิทิน";
  if (a.design.order !== d.order) return "จัดลำดับชั้น";
  if (a.design.slots !== d.slots) return "ปรับขนาดช่องรูป";
  if (a.back !== b) return a.back.events !== b.events ? "วันสำคัญ" : "ตั้งค่าปฏิทิน";
  return "แก้ไข";
}

export default function CalendarStudio({
  open,
  onClose,
  title,
  format,
  year,
  years,
  onYear,
  mixFee,
  qty,
  unit,
  price,
  onOrder,
  guide,
  square,
  initial,
  onApply,
}: Props) {
  /** กด 🛒 ใส่ตะกร้า (ไม่ใช่ ✓ ใช้แบบนี้) — จำไว้ข้ามหน้าต่างถาม "รูปไม่เต็มช่อง" */
  const orderAfter = useRef(false);
  // มุมแหลม (ตัวเลือก "มุม" ของสินค้า) = เส้นตัดสี่เหลี่ยม — ไฟล์พิมพ์เหมือนกัน ต่างแค่ไกด์บนจอ
  /**
   * 📐 ใช้ขนาดของเทมเพลตที่อัปเข้าระบบ (ผู้ใช้สั่ง 13 ต.ค. 69) — ตัดตก = (อาร์ตบอร์ดของไฟล์ − ขนาดงาน) ÷ 2
   * ไฟล์ส่งพิมพ์ใหญ่เท่าอาร์ตบอร์ดของเทมเพลต · ปรับเฉพาะงานที่มีขนาดตายตัว (โฟโต้การ์ด) และค่าที่สมเหตุสมผล (0.5–6 มม.)
   * guide.fill (กรอบการ์ดใบเดียวจากไฟล์หลายช่อง) ไม่รู้ขนาดไฟล์ → ใช้ตัดตกมาตรฐาน (ทำกรอบชุดเดียวกัน)
   */
  const tplBleed = useMemo(() => {
    if (!guide || guide.fill || !guide.wMm || !guide.hMm) return undefined;
    const f0 = calFormat(format);
    if (f0.cornerR == null) return undefined;
    const b = ((guide.wMm - f0.trimW) / 2 + (guide.hMm - f0.trimH) / 2) / 2;
    return b >= 0.5 && b <= 6 ? Math.round(b * 20) / 20 : undefined;
  }, [format, guide]);
  const fmt = useMemo(() => {
    const f = calFormat(format, { bleed: tplBleed });
    return square && f.cornerR ? { ...f, cornerR: 0 } : f;
  }, [format, square, tplBleed]);
  const W = fmtW(fmt);
  const H = fmtH(fmt);
  const sameFormat = initial?.format === fmt.key;
  /** รูปแบบที่หัวข้อเป็นตัวบาง ("Calendar 2026") */
  const lightTitle = fmt.pages.some((p) => p.light);
  const textPage = fmt.pages.find((p) => p.text);

  /**
   * 🃏 หน้าทั้งหมดที่โชว์ในแถบล่าง — ชุดที่มีหลายใบเหมือนกัน (โปสการ์ดรายปี 8 · โฟโต้การ์ด 20) กางเป็นใบที่ 1..N
   * ใบที่ 2+ ที่ยังไม่ได้แยกออกแบบ = เหมือนใบที่ 1 (ล็อกไว้ กด "ออกแบบใบนี้แยก" ก่อนถึงแก้ได้)
   */
  const copies = Math.max(1, fmt.cards ?? 1);
  const vpages = useMemo(
    () =>
      Array.from({ length: copies }, (_, card) =>
        fmt.pages.map((p, j) => ({
          page: { ...p, key: cardKey(card, p.key) },
          base: p,
          card,
          j,
        })),
      ).flat(),
    [fmt, copies],
  );
  const [pageIdx, setPageIdx] = useState(0);
  const vcur = vpages[Math.min(pageIdx, vpages.length - 1)];
  const [tool, setTool] = useState<Tool | null>("photo");
  const [design, setDesign] = useState<CalDesign>(() => {
    let d: CalDesign =
      initial && sameFormat
        ? initial.design
        : // รูปแบบงานเปลี่ยน (เช่นสลับแนว) — ตำแหน่งรูป/ชิ้นส่วนเดิมใช้ไม่ได้ เริ่มวางใหม่ แต่รูปที่อัปไว้ยังอยู่
          { bg: initial?.design.bg ?? "#ffffff", text: null, photos: {} };
    if (d.text && textPage)
      d = {
        ...d,
        text: null,
        elements: [...(d.elements ?? []), textToElement(d.text, textPage.key)],
      };
    // ข้อความที่ยังเป็นปีอัตโนมัติ (ลูกค้าไม่ได้พิมพ์เอง) → เปลี่ยนตามปีใหม่ด้วย
    const was = initial?.back.year;
    if (was && was !== year && d.elements?.length)
      d = {
        ...d,
        elements: d.elements.map((e) => (e.kind === "text" && e.text?.trim() === String(was) ? { ...e, text: String(year) } : e)),
      };
    return d;
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

  /* ─────────── ↶ Undo / Redo / History ───────────
   * เก็บภาพรวม (design + ตั้งค่าปฏิทิน) หลังหยุดแก้ 350ms — ลาก/พิมพ์ต่อเนื่องนับเป็นขั้นเดียว
   * รูปต้นฉบับ (srcs) ไม่ย้อน (มีแต่เพิ่ม) — ขั้นเก่าที่อ้างรูปลำดับไหนยังอยู่ครบ
   */
  type Snap = { design: CalDesign; back: CalBack; label: string; at: number };
  const hist = useRef<{
    past: Snap[];
    future: Snap[];
    committed: Snap | null;
    skip: boolean;
  }>({
    past: [],
    future: [],
    committed: null,
    skip: false,
  });
  const [, setHistTick] = useState(0);
  const [headPop, setHeadPop] = useState<"" | "history" | "project">("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dropOn, setDropOn] = useState(false);
  /** ลากรูปอยู่เหนือปุ่ม "อัปโหลดรูปใส่หน้านี้" */
  const [freeDrop, setFreeDrop] = useState(false);
  const [gapAsk, setGapAsk] = useState<string[] | null>(null);
  const [fontTick, setFontTick] = useState(0);
  /** ชิ้นส่วนที่เลือกอยู่ (ข้อความ/รูปทรง) */
  const [sel, setSel] = useState<string | null>(null);
  /** แตะช่องรูปหลักอยู่ (โชว์แถบเครื่องมือลอยใต้ช่องรูป) */
  const [slotFocus, setSlotFocus] = useState(false);
  /** 📅 เลือกตารางปฏิทินอยู่ (ลากย้าย/ย่อ-ขยายได้) */
  const [gridSel, setGridSel] = useState(false);
  /** เมนูย่อยของแถบเครื่องมือลอยที่กางอยู่ */
  const [pop, setPop] = useState<"" | "opacity" | "border" | "layer" | "fill" | "filter" | "tcolor" | "tstyle" | "talign">("");
  /** 🗂 หน้าต่างลำดับชั้น (ปุ่ม Layers แถบขวา) */
  const [layersOpen, setLayersOpen] = useState(false);
  /** ขนาดพื้นที่เวที — ภาพปฏิทินขยายเต็มพื้นที่ตามจอ */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  /** ความกว้างจริงของแถบเครื่องมือลอย — ใช้ดันแถบให้อยู่ในพื้นที่เวทีเสมอ */
  const [barW, setBarW] = useState(0);
  const barRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const w = el.offsetWidth;
      setBarW((cur) => (Math.abs(cur - w) > 2 ? w : cur));
      // วัดใหม่เมื่อเปลี่ยนชิ้นที่เลือก (ปุ่มในแถบไม่เท่ากัน) — ref ใหม่ = React เรียกซ้ำให้
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [sel, slotFocus, srcs.length],
  );
  const custom = useMemo(() => design.custom ?? [], [design.custom]);
  /** หน้าที่ใช้วาด/แก้จริงของหน้าเสมือน — ใบที่ยังเหมือนใบแรก ใช้ข้อมูลของใบแรก */
  const resolve = useCallback((v: (typeof vpages)[number]) => (v.card > 0 && !custom.includes(v.card) ? v.base : v.page), [custom]);
  const basePage = resolve(vcur);
  /** ใบนี้ยังเหมือนใบที่ 1 — แก้ไม่ได้จนกว่าจะกดแยกออกแบบ */
  const locked = vcur.card > 0 && !custom.includes(vcur.card);
  /** ชื่อหน้าที่โชว์ (ชุดหลายใบ = "ใบที่ N · ด้าน…") */
  const vname = (v: (typeof vpages)[number]) => {
    if (copies > 1) return `ใบที่ ${v.card + 1}${fmt.pages.length > 1 ? ` · ${v.base.name}` : ""}`;
    if (fmt.perCard) {
      const n = Math.floor(v.j / fmt.perCard) + 1;
      return `ใบที่ ${n}${fmt.perCard > 1 || v.base.name ? ` · ${v.base.name}` : ""}`;
    }
    return `${v.j + 1}. ${v.base.name}`;
  };
  /** หน้าที่ต้องประกอบเป็นไฟล์ส่งพิมพ์ — ใบแรก + ใบที่แยกออกแบบ (ใบที่เหมือนกันพิมพ์ซ้ำจากใบแรก) */
  const printPages = useMemo(() => vpages.filter((v) => v.card === 0 || custom.includes(v.card)), [vpages, custom]);
  /**
   * 🎨 รูปแบบการพิมพ์ (ชุดหลายใบ): ลายเดียว = ออกแบบใบเดียว พิมพ์ซ้ำทุกใบ · คละลาย = ทุกใบออกแบบแยกได้
   * แบบเก่าที่มีใบแยกแบบอยู่แล้ว (ก่อนมีตัวเลือกนี้) = คละลาย
   */
  const mixMode = copies > 1 && (!!design.mix || custom.length > 0);
  /** เปิดจอสร้างแบบใหม่ (ชุดหลายใบ) = ถามก่อนว่าลายเดียวหรือคละลาย */
  const [askMode, setAskMode] = useState(() => copies > 1 && !initial);
  /** ถามครั้งแรกตอนเปิดแบบใหม่ (ยังไม่เคยเลือก) — ต้องเลือกก่อน ปิดไม่ได้ */
  const askModeFirst = useRef(copies > 1 && !initial);
  /** หน้าต่างยืนยันกลางจอ (แทน window.confirm ของเบราว์เซอร์) */
  const [ask, setAsk] = useState<{
    icon: string;
    title: string;
    body: string;
    ok: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  /** ค่าคละลายตามจำนวนลายของแบบนี้ (ลายเดียว = 1 · คละลาย = ทุกใบที่ออกแบบแยก) */
  const libCount = srcs.filter((x) => !x.removed).length;
  const designN = calDesignCount(design, libCount);
  /** รูปในคลังที่ยังไม่ได้วางลงใบไหน (นับเป็นลายแต่ไม่ได้พิมพ์) */
  const unusedSrcs = srcs
    .map((x, i) => (x.removed ? -1 : i))
    .filter((i) => i >= 0 && !Object.values(design.photos).some((o) => o.src === i) && !(design.elements ?? []).some((e) => e.kind === "photo" && e.src === i));
  const feeOf = (n: number) => (mixFee ? Math.max(0, mixFee(n)) : 0);
  const feeNow = feeOf(designN);
  function chooseMode(mix: boolean) {
    setAskMode(false);
    askModeFirst.current = false;
    if (mix === mixMode) return;
    if (mix) {
      // ทุกใบเริ่มจากแบบของใบที่ 1 แล้วแก้แยกกันได้เลย
      setDesign((d) => ({ ...d, mix: true }));
      for (let c = 1; c < copies; c++) customizeCard(c);
      // คละลาย = แต่ละใบเป็นของตัวเอง: ช่องรูปที่ยังว่างห้ามยืมรูปจากใบอื่น (src -1 = ว่างโดยตั้งใจ)
      setDesign((d) => {
        const photos = { ...d.photos };
        const none = {
          src: -1,
          pl: { cxMm: 0, cyMm: 0, wMm: 1, hMm: 1, rotDeg: 0 },
        };
        for (let c = 0; c < copies; c++) for (const p of fmt.pages) if (p.photo && !photos[cardKey(c, p.key)]) photos[cardKey(c, p.key)] = none;
        return { ...d, photos };
      });
      return;
    }
    const toSingle = () => {
      for (const c of custom) resetCard(c);
      setDesign((d) => ({ ...d, mix: false, custom: [] }));
      setPageIdx((i) => (vpages[i]?.card ? vpages[i].j : i));
    };
    if (!custom.length) return toSingle();
    setAsk({
      icon: "🖼",
      title: "เปลี่ยนเป็นลายเดียว?",
      body: `ใบที่ออกแบบแยกไว้ ${custom.length} ใบ จะกลับเป็นเหมือนใบที่ 1 ทั้งหมด (กด Undo ย้อนกลับได้)`,
      ok: "เปลี่ยนเป็นลายเดียว",
      run: toSingle,
    });
  }
  const [evDate, setEvDate] = useState("");
  const [evAdding, setEvAdding] = useState(false);
  const [evNote, setEvNote] = useState("");
  const [draft, setDraft] = useState<{
    year: number;
    lang: CalBack["lang"];
    weekStart: 0 | 1;
  } | null>(null);
  // เปิดหน้าต่าง Settings = ร่างจากค่าปัจจุบัน (Discard ทิ้งได้) · เปิด Events = ล้างฟอร์ม/ข้อความเดิม
  useEffect(() => {
    setDraft(tool === "settings" ? { year: back.year, lang: back.lang, weekStart: back.weekStart } : null);
    setEvAdding(false);
    setEvNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  const [evLabel, setEvLabel] = useState("");
  const [evColor, setEvColor] = useState("#db2777");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const thumbRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  /** หน้า + เลย์เอาต์ที่ลูกค้าเลือก (ช่องรูป/ตารางจริงที่ใช้วาด) */
  // เลย์เอาต์ + ช่องรูปหลักที่ลูกค้าปรับขนาดเอง (design.slots) — ชุดเดียวกับตัววาดไฟล์พิมพ์
  const lay = useCallback((p: CalPage) => layPage(fmt, p, design), [fmt, design]);
  const page = useMemo(() => lay(basePage), [lay, basePage]);
  const imgs: (ImgRef | null)[] = useMemo(() => srcs.map((s) => (s.removed ? null : { el: s.el, w: s.w, h: s.h })), [srcs]);
  const holidayData = hasHolidayData(back.year);
  const holidays = useMemo(() => holidaysOf(back.year), [back.year]);
  /** หน้าแรกที่มีช่องรูป (ตามรูปแบบงาน) = หน้าปก — รูปของหน้านี้คือรูปตั้งต้นของทุกหน้า */
  const coverPage = fmt.pages.find((p) => p.photo);
  const elements = useMemo(() => design.elements ?? [], [design.elements]);
  const pageEls = elements.filter((e) => e.page === basePage.key);
  const selEl = elements.find((e) => e.id === sel && e.page === basePage.key) ?? null;

  // เปลี่ยนหน้า = ยกเลิกเลือกชิ้นส่วน · หน้าตารางล้วนเปิดแผงปฏิทิน
  useEffect(() => {
    setSel(null);
    setGridSel(false);
    setTool((t) => (t === "photo" && !page.photo ? "calendar" : t === "shape" || t === "text" ? null : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePage.key]);

  // ── ฟอนต์ ──
  const fontKeys = useMemo(
    () => [
      back.font,
      ...Object.values(back.parts ?? {}).map((x) => x?.font ?? back.font),
      ...elements.filter((e) => e.kind === "text").map((e) => e.font ?? "prompt"),
    ],
    [back.font, back.parts, elements],
  );
  useEffect(() => {
    if (!open) return;
    linkGoogleFonts();
    const bump = () => setFontTick((n) => n + 1);
    document.fonts?.addEventListener?.("loadingdone", bump);
    void ensureFonts(fontKeys).then(bump);
    return () => document.fonts?.removeEventListener?.("loadingdone", bump);
  }, [open, fontKeys]);

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

  // ── Esc · Delete ลบชิ้นส่วน · วางรูปจากคลิปบอร์ด · กันหน้าเว็บด้านหลังเลื่อน/รับไฟล์ ──
  const selRef = useRef(sel);
  selRef.current = sel;
  const slotDelRef = useRef<(() => void) | null>(null);
  /** รูปเทมเพลต (ไกด์) ที่โหลดแล้ว — เปลี่ยนวัสดุ/แนวที่หน้าสินค้า = โหลดรูปใหม่ */
  const [guideImg, setGuideImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!open || !guide?.url) return setGuideImg(null);
    let alive = true;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => alive && setGuideImg(im);
    im.onerror = () => alive && setGuideImg(null); // โหลดไม่ได้ = กลับไปใช้เส้นตัดของระบบ
    im.src = guide.url;
    return () => {
      alive = false;
    };
  }, [open, guide?.url]);
  /** ปิดหน้าต่างที่ซ้อนอยู่บนสุด (ยืนยัน · รูปแบบการพิมพ์ · popup เครื่องมือ) — Esc */
  const overlayRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // มีหน้าต่างซ้อนอยู่ = ปิดหน้าต่างนั้นก่อน ไม่ปิดทั้งจอ
        if (overlayRef.current) return overlayRef.current();
        return onClose();
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      // ⌘/Ctrl+Z ย้อน · ⌘/Ctrl+Shift+Z หรือ Ctrl+Y ทำซ้ำ (ช่องพิมพ์ใช้ undo ของเบราว์เซอร์ตามเดิม)
      if (!typing && (e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y")) {
        e.preventDefault();
        if (e.key === "y" || e.shiftKey) redoRef.current();
        else undoRef.current();
        return;
      }
      if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        if (selRef.current) {
          e.preventDefault();
          removeEl(selRef.current);
        } else if (slotDelRef.current) {
          // เลือกรูปในช่องรูปหลักอยู่ = ลบรูปออกจากช่อง
          e.preventDefault();
          slotDelRef.current();
        }
      }
    };
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
    document.addEventListener("keydown", key);
    document.addEventListener("paste", paste);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
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

  useEffect(() => {
    const h = hist.current;
    if (!h.committed) {
      h.committed = { design, back, label: "เปิดแบบ", at: Date.now() };
      return;
    }
    if (h.skip) {
      h.skip = false;
      return;
    }
    const t = window.setTimeout(() => commitHist(), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, back]);

  /** บันทึกสภาพปัจจุบันเป็นขั้นใหม่ (ถ้าต่างจากขั้นล่าสุด) */
  function commitHist() {
    const h = hist.current;
    const c = h.committed;
    if (!c || (c.design === design && c.back === back)) return;
    h.past.push(c);
    if (h.past.length > 100) h.past.shift();
    h.committed = {
      design,
      back,
      label: diffLabel(c, design, back),
      at: Date.now(),
    };
    h.future = [];
    setHistTick((n) => n + 1);
  }
  /** ย้อน/ไปข้างหน้า n ขั้น (ลบ = ย้อน) แล้วตั้งสภาพทีเดียว */
  function stepHist(n: number) {
    commitHist();
    const h = hist.current;
    let moved = false;
    for (let i = 0; i < Math.abs(n); i++) {
      if (n < 0 && h.past.length && h.committed) {
        h.future.push(h.committed);
        h.committed = h.past.pop()!;
        moved = true;
      } else if (n > 0 && h.future.length && h.committed) {
        h.past.push(h.committed);
        h.committed = h.future.pop()!;
        moved = true;
      }
    }
    if (!moved || !h.committed) return;
    h.skip = true;
    setDesign(h.committed.design);
    setBack(h.committed.back);
    setSel(null);
    setHistTick((x) => x + 1);
  }
  const undo = () => stepHist(-1);
  const redo = () => stepHist(1);
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const canUndo =
    hist.current.past.length > 0 || (!!hist.current.committed && (hist.current.committed.design !== design || hist.current.committed.back !== back));
  const canRedo = hist.current.future.length > 0;

  /* ─────────── ชิ้นส่วน ─────────── */

  const patchEl = (id: string, patch: Partial<CalElement>) =>
    setDesign((d) => ({
      ...d,
      elements: (d.elements ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  function removeEl(id: string) {
    setDesign((d) => ({
      ...d,
      elements: (d.elements ?? []).filter((e) => e.id !== id),
    }));
    setSel(null);
  }
  function reorder(id: string, top: boolean) {
    moveLayer(id, top ? "top" : "bottom");
  }
  /**
   * 🗂 ย้ายชั้นในหน้านี้ — ชิ้นส่วน · "@slot" รูปหลัก · "@grid" ปฏิทิน (ดู orderOf)
   * top/bottom = บนสุด/ล่างสุด · up/down = ทีละชั้น
   */
  function moveLayer(id: string, how: "top" | "up" | "down" | "bottom") {
    const key = page.key;
    setDesign((d) => {
      const list = orderOf(page, d);
      const i = list.indexOf(id);
      if (i < 0) return d;
      const rest = list.filter((x) => x !== id);
      const at = how === "top" ? rest.length : how === "bottom" ? 0 : how === "up" ? Math.min(rest.length, i + 1) : Math.max(0, i - 1);
      rest.splice(at, 0, id);
      return { ...d, order: { ...(d.order ?? {}), [key]: rest } };
    });
  }
  function addEl(kind: CalElement["kind"]) {
    const m = Math.min(W, H);
    const s = fmt.bleed + fmt.safe;
    // วางกลางช่องรูป (ถ้ามี) ไม่งั้นกลางหน้า — ชิ้นถัดไปเหลื่อมลงขวาทีละนิด ไม่ซ้อนทับกันพอดีจนกดไม่ถึงชิ้นล่าง
    const r0 = page.photo ?? { x: s, y: s, w: W - s * 2, h: H - s * 2 };
    const off = (pageEls.length % 6) * m * 0.04;
    const r = { ...r0, x: r0.x + off, y: r0.y + off };
    const e: CalElement =
      kind === "text"
        ? {
            id: uid(),
            page: basePage.key,
            kind,
            x: r.x + r.w / 2,
            y: r.y + r.h / 2,
            w: 0,
            h: 0,
            rot: 0,
            fill: page.photo ? "#ffffff" : back.ink,
            stroke: page.photo ? "#1c1917" : "",
            strokeW: 0,
            text: "ข้อความ",
            font: back.font,
            size: Math.max(3, m * 0.09),
            bold: true,
          }
        : {
            id: uid(),
            page: basePage.key,
            kind,
            x: r.x + r.w / 2,
            y: r.y + r.h / 2,
            w: m * 0.3,
            h: m * (kind === "ellipse" ? 0.3 : 0.2),
            rot: 0,
            fill: "#fde047",
            stroke: "",
            strokeW: Math.max(0.3, m * 0.006),
            radius: 0,
            opacity: 1,
          };
    setDesign((d) => ({ ...d, elements: [...(d.elements ?? []), e] }));
    setSel(e.id);
    setTool(kind === "text" ? "text" : "shape");
  }

  /* ─────────── ใบที่แยกออกแบบ ─────────── */

  /** แยกใบนี้ออกมาออกแบบเอง — ก๊อปรูป/ข้อความ/เลย์เอาต์ของใบแรกมาเป็นจุดเริ่ม */
  function customizeCard(card: number) {
    setDesign((d) => {
      if ((d.custom ?? []).includes(card)) return d;
      const photos = { ...d.photos };
      const layouts = { ...(d.layouts ?? {}) };
      const grids = { ...(d.grids ?? {}) };
      const slots = { ...(d.slots ?? {}) };
      const orders = { ...(d.order ?? {}) };
      const extra: CalElement[] = [];
      for (const p of fmt.pages) {
        const nk = cardKey(card, p.key);
        if (d.photos[p.key]) photos[nk] = { ...d.photos[p.key] };
        if (d.layouts?.[p.key]) layouts[nk] = d.layouts[p.key];
        if (d.grids?.[p.key]) grids[nk] = { ...d.grids[p.key] };
        if (d.slots?.[p.key]) slots[nk] = { ...d.slots[p.key] };
        const idMap = new Map<string, string>();
        for (const e of d.elements ?? [])
          if (e.page === p.key) {
            const nid = uid();
            idMap.set(e.id, nid);
            extra.push({ ...e, id: nid, page: nk });
          }
        // ลำดับชั้นของใบนี้ = ของใบที่ 1 (id ชิ้นส่วนเปลี่ยนตามที่ก๊อป)
        if (d.order?.[p.key]) orders[nk] = d.order[p.key].map((id) => idMap.get(id) ?? id);
      }
      return {
        ...d,
        photos,
        layouts,
        ...(Object.keys(grids).length ? { grids } : {}),
        ...(Object.keys(slots).length ? { slots } : {}),
        ...(Object.keys(orders).length ? { order: orders } : {}),
        elements: [...(d.elements ?? []), ...extra],
        custom: [...(d.custom ?? []), card].sort((a, b) => a - b),
      };
    });
  }
  /** ใบนี้กลับไปเหมือนใบที่ 1 (ทิ้งของที่แยกไว้) */
  function resetCard(card: number) {
    const pre = `c${card}:`;
    setDesign((d) => {
      const photos = Object.fromEntries(Object.entries(d.photos).filter(([k]) => !k.startsWith(pre)));
      const layouts = Object.fromEntries(Object.entries(d.layouts ?? {}).filter(([k]) => !k.startsWith(pre)));
      const grids = Object.fromEntries(Object.entries(d.grids ?? {}).filter(([k]) => !k.startsWith(pre)));
      const slots = Object.fromEntries(Object.entries(d.slots ?? {}).filter(([k]) => !k.startsWith(pre)));
      const orders = Object.fromEntries(Object.entries(d.order ?? {}).filter(([k]) => !k.startsWith(pre)));
      return {
        ...d,
        order: Object.keys(orders).length ? orders : undefined,
        photos,
        layouts,
        grids: Object.keys(grids).length ? grids : undefined,
        slots: Object.keys(slots).length ? slots : undefined,
        elements: (d.elements ?? []).filter((e) => !e.page.startsWith(pre)),
        custom: (d.custom ?? []).filter((c) => c !== card),
      };
    });
    setSel(null);
  }

  /* ─────────── รูป ─────────── */

  /**
   * ใส่รูปให้หน้าที่เปิดอยู่ (หน้าไม่มีช่องรูป = ให้หน้าปก)
   * รูปแรกของแบบ = รูปหน้าปก + ใส่ปีเป็นข้อความเริ่มต้นให้ (หน้าที่รูปแบบงานเปิดให้มีข้อความ) — ลบ/แก้ได้
   */
  /**
   * 🖼 ใส่รูป — asFree = วางเป็นกรอบรูปอิสระบนหน้านี้ (ปุ่ม Photo แบบ Printbox)
   * หน้าที่ไม่มีช่องรูปประจำหน้า (ด้านหลังปฏิทิน ฯลฯ) = เป็นกรอบรูปอิสระเสมอ
   * 🐞 เดิม (12 ต.ค. 69): หน้าไม่มีช่องรูป → ยัดรูปไปช่องรูปหน้าปกแล้วดีดกลับหน้าแรก ลูกค้าเลยใส่รูปด้านหลังไม่ได้เลย
   * ⚠️ ใบที่ยังเหมือนใบแรก (locked) ไม่รับรูป — ไม่งั้นรูปไปลงใบแรกโดยไม่รู้ตัว
   */
  async function addPhoto(file: File | undefined, asFree = false, nth = 0) {
    if (!file) return;
    if (locked) {
      setErr("ใบนี้ยังเหมือนใบที่ 1 — กด ✏️ แยกแบบ ก่อนใส่รูปของใบนี้");
      return;
    }
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
    // ลำดับรูปจาก ref (วางหลายไฟล์ติดกัน state ยังไม่ทันอัปเดต — ใช้ srcs.length จะได้เลขซ้ำ)
    const idx = srcsRef.current.length;
    srcsRef.current = [...srcsRef.current, s];
    setSrcs((cur) => [...cur, s]);
    if (asFree || !page.photo) {
      addFreePhoto(idx, s, nth);
      return;
    }
    const target = page;
    setDesign((d) => {
      const firstText =
        idx === 0 && textPage && !(d.elements ?? []).some((e) => e.kind === "text") ? [textToElement(defaultText(back.year, fmt), textPage.key)] : [];
      return {
        ...d,
        photos: {
          ...d.photos,
          [target.key]: { src: idx, pl: coverPlacement(target.photo!, s) },
        },
        elements: [...(d.elements ?? []), ...firstText],
      };
    });
  }

  /** วางกรอบรูปอิสระของรูปที่ i ลงหน้านี้ — กรอบตามสัดส่วนรูป กว้างราว 45% ของด้านสั้น */
  function addFreePhoto(i: number, s: { w: number; h: number }, nth = 0) {
    const m = Math.min(W, H);
    const fw = m * 0.45;
    const fh = (fw * s.h) / s.w;
    const sc = Math.min(1, (H * 0.6) / fh);
    const off = ((pageEls.length + nth) % 6) * m * 0.04;
    const e: CalElement = {
      id: uid(),
      page: basePage.key,
      kind: "photo",
      x: W / 2 + off,
      y: H / 2 + off,
      w: fw * sc,
      h: fh * sc,
      rot: 0,
      fill: "",
      stroke: "",
      strokeW: Math.max(0.3, m * 0.006),
      radius: 0,
      opacity: 1,
      src: i,
      zoom: 1,
      ox: 0,
      oy: 0,
    };
    setDesign((d) => ({ ...d, elements: [...(d.elements ?? []), e] }));
    setSel(e.id);
    setTool("photo");
  }

  /**
   * 🖼 ปุ่ม Photo แบบ Printbox: วาง "กรอบรูปว่าง" (Drag here) ลงหน้านี้ — กดอีกได้อีกกรอบ
   * ใส่รูปทีหลังได้ทั้งลากรูปมาโยนลงกรอบบนภาพ หรือเลือกจากแผงด้านข้าง · กรอบที่ยังว่างไม่พิมพ์ออกไป
   */
  function addEmptyFrame() {
    const m = Math.min(W, H);
    const off = (pageEls.length % 6) * m * 0.05;
    const e: CalElement = {
      id: uid(),
      page: basePage.key,
      kind: "photo",
      x: Math.min(W * 0.75, W / 2 - m * 0.1 + off),
      y: Math.min(H * 0.8, H / 2 - m * 0.1 + off),
      w: m * 0.5,
      h: m * 0.36,
      rot: 0,
      fill: "",
      stroke: "",
      strokeW: Math.max(0.3, m * 0.006),
      radius: 0,
      opacity: 1,
      zoom: 1,
      ox: 0,
      oy: 0,
    };
    setDesign((d) => ({ ...d, elements: [...(d.elements ?? []), e] }));
    setSel(e.id);
    setTool("photo");
  }

  /** ใส่รูปลงกรอบรูปที่มีอยู่ (กรอบว่าง/เปลี่ยนรูป) — รูปเต็มกรอบใหม่ทุกครั้ง */
  async function fillFrame(id: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr("ใช้ได้เฉพาะไฟล์รูป (JPG / PNG / WEBP)");
    const s0 = await loadImg(file);
    if (!s0) return setErr("เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น");
    setErr("");
    const i = srcsRef.current.length;
    srcsRef.current = [...srcsRef.current, s0];
    setSrcs((cur) => [...cur, s0]);
    patchEl(id, { src: i, zoom: 1, ox: 0, oy: 0 });
    setSel(id);
    setTool("photo");
  }

  /**
   * รูปที่ลากมาโยนลงภาพ: ตกบนกรอบรูป → ใส่กรอบนั้น · ตกในช่องรูปประจำหน้า → ช่องรูป · ที่อื่น → กรอบใหม่ตรงจุดที่วาง
   * หลายไฟล์: ไฟล์แรกตามกติกาข้างบน ที่เหลือเป็นกรอบใหม่
   */
  /** รูปจากคลังด้านซ้ายที่ลากมาวางบนภาพ (ใช้รูปเดิม ไม่ต้องอัปซ้ำ) */
  function dropSrcOnStage(i: number, clientX: number, clientY: number) {
    if (locked || !srcs[i]) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const r = cv.getBoundingClientRect();
    const p = {
      x: ((clientX - r.left) / r.width) * W,
      y: ((clientY - r.top) / r.height) * H,
    };
    const frame = [...pageEls].reverse().find((el) => el.kind === "photo" && inRect(p, elementBox(ctx, el)));
    if (frame) {
      patchEl(frame.id, { src: i, zoom: 1, ox: 0, oy: 0 });
      setSel(frame.id);
    } else if (page.photo && inRect(p, page.photo)) {
      setSel(null);
      pickPhoto(i);
    } else addFreePhoto(i, srcs[i]);
    setTool("photo");
  }

  /** ทำซ้ำชิ้นที่เลือก (เหลื่อมลงขวานิดหน่อย) */
  /** 🗑 ลบรูปออกจากคลัง — ช่องรูป/กรอบที่ใช้รูปนี้กลายเป็นช่องว่าง (Undo เอาตำแหน่งกลับได้ แต่ต้องใส่รูปใหม่) */
  function removeSrc(i: number) {
    const used = Object.values(design.photos).some((o) => o.src === i) || (design.elements ?? []).some((e) => e.kind === "photo" && e.src === i);
    if (used)
      return setAsk({
        icon: "🗑",
        title: "ลบรูปนี้?",
        body: "รูปนี้ใช้อยู่ในแบบ — ลบแล้วช่องรูปที่ใช้รูปนี้จะว่าง",
        ok: "ลบรูป",
        danger: true,
        run: () => dropSrc(i),
      });
    dropSrc(i);
  }
  function dropSrc(i: number) {
    srcsRef.current = srcsRef.current.map((s, j) => (j === i ? { ...s, removed: true } : s));
    setSrcs((cur) => cur.map((s, j) => (j === i ? { ...s, removed: true } : s)));
    setDesign((d) => ({
      ...d,
      photos: Object.fromEntries(Object.entries(d.photos).map(([k, o]) => [k, o.src === i ? { ...o, src: -1 } : o])),
      elements: (d.elements ?? []).map((e) => (e.kind === "photo" && e.src === i ? { ...e, src: undefined, zoom: 1, ox: 0, oy: 0 } : e)),
    }));
  }

  function duplicateEl(id: string) {
    const e = elements.find((x) => x.id === id);
    if (!e) return;
    const off = Math.min(W, H) * 0.04;
    const c = {
      ...e,
      id: uid(),
      x: Math.min(W, e.x + off),
      y: Math.min(H, e.y + off),
    };
    setDesign((d) => ({ ...d, elements: [...(d.elements ?? []), c] }));
    setSel(c.id);
  }

  async function dropOnStage(files: File[], clientX: number, clientY: number) {
    if (locked) return setErr("ใบนี้ยังเหมือนใบที่ 1 — กด ✏️ แยกแบบ ก่อนใส่รูปของใบนี้");
    const imgsOnly = files.filter((f) => f.type.startsWith("image/"));
    if (!imgsOnly.length) return setErr("ใช้ได้เฉพาะไฟล์รูป (JPG / PNG / WEBP)");
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    let rest = imgsOnly;
    if (cv && ctx) {
      const r = cv.getBoundingClientRect();
      const p = {
        x: ((clientX - r.left) / r.width) * W,
        y: ((clientY - r.top) / r.height) * H,
      };
      const frame = [...pageEls].reverse().find((el) => el.kind === "photo" && inRect(p, elementBox(ctx, el)));
      if (frame) {
        await fillFrame(frame.id, imgsOnly[0]);
        rest = imgsOnly.slice(1);
      } else if (page.photo && inRect(p, page.photo)) {
        await addPhoto(imgsOnly[0]);
        rest = imgsOnly.slice(1);
      }
    }
    for (let i = 0; i < rest.length; i++) await addPhoto(rest[i], true, i);
  }

  /**
   * 🎯 แผง Photo แผงเดียว: รูปที่อัป/แตะ ลง "ที่ที่เลือกอยู่"
   * เลือกกรอบรูปอยู่ = กรอบนั้น · ไม่ได้เลือก = ช่องรูปหลักของหน้า · หน้าไม่มีช่องรูป = กรอบใหม่
   */
  function putIntoTarget(i: number) {
    const s0 = srcs[i];
    if (!s0) return;
    if (selEl?.kind === "photo") patchEl(selEl.id, { src: i, zoom: 1, ox: 0, oy: 0 });
    else if (page.photo) pickPhoto(i);
    else addFreePhoto(i, s0);
  }
  async function uploadToTarget(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/"));
    if (!list.length) return setErr("ใช้ได้เฉพาะไฟล์รูป (JPG / PNG / WEBP)");
    const [first, ...rest] = list;
    if (selEl?.kind === "photo") await fillFrame(selEl.id, first);
    else await addPhoto(first, !page.photo);
    // ไฟล์ที่เหลือ (เลือก/ลากมาหลายรูป) = กรอบใหม่คนละกรอบ
    for (let i = 0; i < rest.length; i++) await addPhoto(rest[i], true, i);
  }

  /** ใช้รูปที่อัปไว้แล้วกับหน้านี้ */
  function pickPhoto(i: number) {
    if (!page.photo || !srcs[i]) return;
    setDesign((d) => ({
      ...d,
      photos: {
        ...d.photos,
        [page.key]: { src: i, pl: coverPlacement(page.photo!, srcs[i]) },
      },
    }));
  }

  /** แก้ตำแหน่งรูปของหน้านี้ (ไม่มีของตัวเอง = ทำสำเนาจากรูปหน้าปกที่วางเต็มช่องก่อน แล้วค่อยแก้) */
  function editPl(fn: (pl: CalPlacement) => CalPlacement) {
    if (!page.photo) return;
    setDesign((d) => {
      const cur = photoOf(page, d, imgs);
      if (!cur) return d;
      const own = d.photos[page.key];
      const src = own ? own.src : slotSrc(d, imgs);
      return {
        ...d,
        // คงค่าแต่งรูป (กลับด้าน/ขอบ/เอฟเฟกต์) ของหน้านั้นไว้ — เดิมเขียนทับเหลือแค่ src+pl
        photos: { ...d.photos, [page.key]: { ...(own && own.src >= 0 ? own : {}), src, pl: fn(cur.pl) } },
      };
    });
  }

  /** แต่งรูปช่องหลักของหน้านี้ (กลับด้าน/ความทึบ/ขอบ/มุมมน/เอฟเฟกต์) — หน้าที่ยืมรูปหน้าปกอยู่ = ทำสำเนาเป็นของหน้านี้ก่อน */
  function editSlot(patch: Partial<CalPhoto>) {
    if (!page.photo) return;
    setDesign((d) => {
      const cur = photoOf(page, d, imgs);
      if (!cur) return d;
      const own = d.photos[page.key];
      const base = own && own.src >= 0 ? own : { src: slotSrc(d, imgs), pl: cur.pl };
      return { ...d, photos: { ...d.photos, [page.key]: { ...base, ...patch } } };
    });
  }

  /**
   * 🖼 ขนาด/ตำแหน่งช่องรูปหลักของหน้านี้ (จุดจับ 8 จุดแบบ Printbox) · ไม่ส่ง = กลับตามเลย์เอาต์
   * รูปไม่เต็มช่องใหม่ = จัดเต็มช่องให้ (ไม่ให้เหลือขอบว่าง)
   */
  function setSlot(r?: { x: number; y: number; w: number; h: number }, keep?: CalPhoto) {
    const key = basePage.key;
    setDesign((d) => {
      const slots = { ...(d.slots ?? {}) };
      if (r) slots[key] = r;
      else delete slots[key];
      const nd = { ...d, slots: Object.keys(slots).length ? slots : undefined };
      const np = layPage(fmt, basePage, nd).photo;
      const own = d.photos[key];
      // ลากจุดจับช่อง: รูปคงขนาด/ตำแหน่งตอนเริ่มลาก (คิดจากค่าตั้งต้นทุกครั้ง ไม่เพี้ยนสะสม)
      if (np && keep && keep.src >= 0 && srcs[keep.src]) nd.photos = { ...d.photos, [key]: { ...keep, pl: keepCover(keep.pl, np) } };
      else if (np && own && own.src >= 0 && srcs[own.src] && !placementCovers(own.pl, np))
        nd.photos = { ...d.photos, [key]: { ...own, pl: coverPlacement(np, srcs[own.src]) } };
      return nd;
    });
  }

  function scalePl(pl: CalPlacement, f: number): CalPlacement {
    const r = page.photo!;
    const min = (Math.max(r.w, r.h) / Math.max(pl.wMm, pl.hMm)) * pl.wMm * 0.2;
    const w = clamp(pl.wMm * f, min, pl.wMm * 40);
    const q = w / pl.wMm;
    return { ...pl, wMm: pl.wMm * q, hMm: pl.hMm * q };
  }

  /** เปลี่ยนเลย์เอาต์ของหน้านี้ — ช่องรูปเปลี่ยนขนาด รูปที่ลูกค้าวางเองจัดให้เต็มช่องใหม่ */
  function setLayout(key: string) {
    setDesign((d) => {
      const layouts = { ...(d.layouts ?? {}) };
      if (key) layouts[basePage.key] = key;
      else delete layouts[basePage.key];
      // เปลี่ยนเลย์เอาต์ = ตารางกลับไปตามเลย์เอาต์ใหม่ (ตำแหน่งที่ลากไว้เป็นของเลย์เอาต์เดิม)
      const grids = { ...(d.grids ?? {}) };
      delete grids[basePage.key];
      const slots = { ...(d.slots ?? {}) };
      delete slots[basePage.key];
      // ช่องรูปปัจจุบัน (รวมที่ลูกค้าปรับขนาดเอง) — ชิ้นส่วนที่วางบนช่องรูปย้ายตามไปเลย์เอาต์ใหม่
      const op = layPage(fmt, basePage, d).photo;
      const np = pageWithLayout(fmt, basePage, key);
      const photos = { ...d.photos };
      const own = photos[basePage.key];
      if (own && np.photo && srcs[own.src])
        photos[basePage.key] = {
          ...own,
          pl: coverPlacement(np.photo, srcs[own.src]),
        };
      // ข้อความ/รูปทรงที่วางอยู่บนช่องรูป → ย้ายตามช่องรูปไปด้วย (สลับซ้าย-ขวา ข้อความไม่ไปทับตาราง)
      const dx = op && np.photo ? np.photo.x + np.photo.w / 2 - (op.x + op.w / 2) : 0;
      const dy = op && np.photo ? np.photo.y + np.photo.h / 2 - (op.y + op.h / 2) : 0;
      const onPhoto = (e: CalElement) => !!op && e.page === basePage.key && e.x >= op.x && e.x <= op.x + op.w && e.y >= op.y && e.y <= op.y + op.h;
      const elements = (d.elements ?? []).map((e) => (onPhoto(e) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
      return {
        ...d,
        layouts,
        photos,
        elements,
        grids: Object.keys(grids).length ? grids : undefined,
        slots: Object.keys(slots).length ? slots : undefined,
      };
    });
  }

  /* ─────────── วาด ─────────── */

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
    drawPage(ctx, k, fmt, basePage, design, back, imgs, { preview: true });

    // ไกด์บนจอ (ไม่ติดไปกับไฟล์พิมพ์): ตัดตกจาง ๆ + เส้นตัดแดง + เขตปลอดภัยฟ้า + กรอบชิ้นที่เลือก
    ctx.save();
    const b = fmt.bleed * k;
    if (guide) {
      // 📐 สินค้าที่มีเทมเพลต = หน้าตาตามไฟล์ที่อัปเข้าระบบล้วน ๆ (ผู้ใช้สั่ง 13 ต.ค. 69) — ไม่ทับลายทแยง/แถบตัดตกของระบบ
      // (รวมตอนรูปเทมเพลตยังโหลดไม่เสร็จ/โหลดไม่ได้ — เดิมตกไปลายทแยง มุมแหลมกับมุมมนเลยหน้าตาไม่เหมือนกัน)
    } else if (fmt.cornerR != null) {
      // 🃏 โฟโต้การ์ด (มุมมน หรือมุมแหลม cornerR 0): ส่วนที่ถูกตัดทิ้ง (ตัดตก + มุม) = ลายทแยงแดงจาง แบบหน้าร้านเดิม
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, PW, PH);
      trimPath(ctx, k, fmt);
      ctx.clip("evenodd");
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillRect(0, 0, PW, PH);
      ctx.strokeStyle = "rgba(220,38,38,.5)";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let x = -PH; x < PW; x += 5 * dpr) {
        ctx.moveTo(x, PH);
        ctx.lineTo(x + PH, 0);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(0, 0, PW, b);
      ctx.fillRect(0, PH - b, PW, b);
      ctx.fillRect(0, b, b, PH - 2 * b);
      ctx.fillRect(PW - b, b, b, PH - 2 * b);
    }
    if (guideImg && guide) {
      // 📐 เทมเพลตของวัสดุที่เลือก — วางกึ่งกลางผืนตามขนาดมม.จริง · multiply = พื้นขาวของไฟล์หายไป เหลือเส้นกรอบ/สีวัสดุ (PET เทาอ่อน)
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      // fill = รูปเป็นกรอบการ์ดใบเดียวพอดีผืน (skin ของไฟล์หลายช่อง) → ปูเต็มผืน
      if (guide.fill) ctx.drawImage(guideImg, 0, 0, W * k, H * k);
      else ctx.drawImage(guideImg, ((W - guide.wMm) / 2) * k, ((H - guide.hMm) / 2) * k, guide.wMm * k, guide.hMm * k);
      ctx.restore();
    } else if (guide) {
      // รูปเทมเพลตโหลดไม่ได้ (เช่น หน้าเปิดค้างไว้ก่อนอัปเทมเพลตใหม่) — เส้นตัดทึบบาง ๆ แบบไฟล์เทมเพลต ไม่ใช้ลายทแยง
      ctx.lineWidth = dpr;
      ctx.strokeStyle = "rgba(220,38,38,.85)";
      ctx.beginPath();
      trimPath(ctx, k, fmt);
      ctx.stroke();
    } else {
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = "rgba(220,38,38,.85)";
      ctx.beginPath();
      trimPath(ctx, k, fmt);
      ctx.stroke();
    }
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.lineWidth = dpr;
    // เส้นเขตปลอดภัยสีฟ้าเอาออกแล้ว (ผู้ใช้สั่ง 13 ต.ค. 69)
    const se = elements.find((e) => e.id === sel && e.page === basePage.key);
    // เลือกช่องรูปหลักอยู่ = กรอบฟ้ารอบช่อง (คู่กับแถบเครื่องมือลอยใต้ช่อง)
    if (!se && slotFocus && page.photo && tool === "photo") {
      // 🖼 ช่องรูปหลักที่เลือก แบบ Printbox — กรอบ + จุดจับ 8 จุด (ปรับขนาดช่อง) + วงกลมลูกศรกลางรูป (ลากเลื่อนรูป)
      const r = page.photo;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(2,132,199,.95)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(120,113,108,.9)";
      ctx.lineWidth = 1.2 * dpr;
      handlesOf(r, 0).forEach(([hx, hy]) => {
        ctx.beginPath();
        ctx.arc(hx * k, hy * k, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      if (photoOf(page, design, imgs)) drawPanIcon(ctx, (r.x + r.w / 2) * k, (r.y + r.h / 2) * k, dpr);
    }
    const gr = gridOf(page, design);
    if (!se && gridSel && gr) {
      // 📅 ตารางปฏิทินที่เลือก — กรอบฟ้า + จุดจับ 8 จุด (ลากย้าย · จับจุดย่อ-ขยาย)
      const p = Math.min(W, H) * 0.012;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(2,132,199,.95)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect((gr.x - p) * k, (gr.y - p) * k, (gr.w + p * 2) * k, (gr.h + p * 2) * k);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(120,113,108,.9)";
      ctx.lineWidth = 1.2 * dpr;
      handlesOf(gr, p).forEach(([hx, hy]) => {
        ctx.beginPath();
        ctx.arc(hx * k, hy * k, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    if (se) {
      const r = elementBox(ctx, se);
      const p = Math.min(W, H) * 0.012;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(2,132,199,.95)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect((r.x - p) * k, (r.y - p) * k, (r.w + p * 2) * k, (r.h + p * 2) * k);
      // จุดจับ 8 จุด (มุม = ย่อ-ขยายสองแกน · กลางขอบ = แกนเดียว) — ข้อความใช้แค่ 4 มุม
      const hs = 6 * dpr;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(120,113,108,.9)";
      ctx.lineWidth = 1.2 * dpr;
      handlesOf(r, p)
        .slice(0, se.kind === "text" ? 4 : 8)
        .forEach(([hx, hy]) => {
          ctx.beginPath();
          ctx.arc(hx * k, hy * k, hs, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      if (se.kind === "photo" && se.src != null && imgs[se.src]) drawPanIcon(ctx, se.x * k, se.y * k, dpr);
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt, basePage, design, back, imgs, fontTick, sel, slotFocus, tool, page, W, H, guideImg, guide, gridSel]);

  useEffect(() => {
    if (open) draw();
  }, [open, draw]);
  useEffect(() => {
    if (!open) return;
    const r = () => draw();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, [open, draw]);

  // วัดพื้นที่เวทีเพื่อขยายภาพให้เต็มจอ (ทั้งกว้าง/สูง) — เปลี่ยนขนาดหน้าต่าง/เปิด-ปิดแผงข้างแล้วปรับเอง
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(() => setStageBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStageBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (open) draw();
  }, [stageBox, open, draw]);

  // รูปย่อทุกหน้า (แถบล่าง) — วาดจากตัววาดจริง หน่วงนิดหน่อยตอนลาก/พิมพ์รัว ๆ
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      vpages.forEach((v, i) => {
        const p = resolve(v);
        const cv = thumbRefs.current[i];
        if (!cv) return;
        const tw = Math.round((W >= H ? 120 : 80) * Math.min(2, window.devicePixelRatio || 1));
        cv.width = tw;
        cv.height = Math.round((tw * H) / W);
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        drawPage(ctx, tw / W, fmt, p, design, back, imgs, { preview: true });
        if (fmt.cornerR != null) {
          // รูปย่อโฟโต้การ์ด = ทรงหลังตัดจริง (ตัดตกออก + มุมมน)
          ctx.globalCompositeOperation = "destination-in";
          ctx.beginPath();
          trimPath(ctx, tw / W, fmt);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [open, fmt, vpages, resolve, design, back, imgs, fontTick, W, H]);

  /* ─────────── ลาก/ซูมบนภาพ ─────────── */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<
    | { kind: "photo"; pl: CalPlacement; x: number; y: number }
    /** ลากในช่องรูปหลัก (นอกวงกลมกลางรูป) = ย้ายทั้งช่อง รูปไปด้วย */
    | { kind: "slot-move"; r0: { x: number; y: number; w: number; h: number }; keep: CalPhoto; x: number; y: number }
    /** ลากวงกลมกลางกรอบรูป = เลื่อนรูปในกรอบ (กรอบอยู่กับที่) */
    | { kind: "frame-pan"; id: string; ox0: number; oy0: number; sw: number; sh: number; x: number; y: number }
    | { kind: "el"; id: string; ex: number; ey: number; x: number; y: number }
    | { kind: "pinch"; pl: CalPlacement; dist: number }
    | {
        kind: "resize";
        id: string;
        cx: number;
        cy: number;
        ax: number;
        ay: number;
        size0: number;
        d0: number;
        swap: boolean;
        axis: "xy" | "x" | "y";
        /** กรอบรูปที่มีรูป: ขนาด (มม./พิกเซลรูป) + จุดกลางรูปตอนเริ่มลาก — ย่อขยายกรอบแล้วรูปคงเดิม */
        img?: { s: number; cx: number; cy: number; iw: number; ih: number };
      }
    | {
        kind: "grid";
        r0: { x: number; y: number; w: number; h: number };
        x: number;
        y: number;
      }
    | {
        kind: "grid-resize";
        ax: number;
        ay: number;
        axis: "xy" | "x" | "y";
        r0: { x: number; y: number; w: number; h: number };
      }
    | {
        kind: "slot-resize";
        ax: number;
        ay: number;
        axis: "xy" | "x" | "y";
        r0: { x: number; y: number; w: number; h: number };
        keep?: CalPhoto;
      }
    | null
  >(null);

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };
  const inRect = (p: { x: number; y: number }, r?: { x: number; y: number; w: number; h: number }, pad = 0) =>
    !!r && p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked) return;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer หายไปแล้ว (บางเบราว์เซอร์/ระบบสัมผัส) — ลากต่อได้ตามปกติ */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = toMm(e);
    const cur = photoOf(page, design, imgs);
    if (pointers.current.size === 2 && cur && !sel) {
      const [a, b] = [...pointers.current.values()];
      drag.current = {
        kind: "pinch",
        pl: cur.pl,
        dist: Math.hypot(a.x - b.x, a.y - b.y),
      };
      return;
    }
    // ชิ้นส่วนบนสุดก่อน (วาดทีหลัง = อยู่บน)
    const ctx = canvasRef.current?.getContext("2d");
    const gr = gridOf(page, design);
    // 🖼 จับจุดของช่องรูปหลักที่เลือกอยู่ = ปรับขนาดช่อง (มุม/ขอบตรงข้ามอยู่กับที่)
    if (slotFocus && page.photo && !selEl && tool === "photo") {
      const sr = page.photo;
      const tol = (14 * W) / (canvasRef.current!.getBoundingClientRect().width || 1);
      const hi = handlesOf(sr, 0).findIndex(([hx, hy]) => Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol);
      if (hi >= 0) {
        const left = hi === 0 || hi === 2 || hi === 6;
        const top = hi === 0 || hi === 1 || hi === 4;
        drag.current = {
          kind: "slot-resize",
          ax: left ? sr.x + sr.w : sr.x,
          ay: top ? sr.y + sr.h : sr.y,
          axis: hi < 4 ? "xy" : hi < 6 ? "y" : "x",
          r0: { ...sr },
          keep: cur ? ((design.photos[basePage.key]?.src ?? -1) >= 0 ? design.photos[basePage.key] : { src: slotSrc(design, imgs), pl: cur.pl }) : undefined,
        };
        return;
      }
    }
    // 📅 จับจุดของตารางปฏิทินที่เลือกอยู่ = ย่อ-ขยาย (มุม/ขอบตรงข้ามอยู่กับที่)
    if (gridSel && gr && !selEl) {
      const pad = Math.min(W, H) * 0.012;
      const tol = (14 * W) / (canvasRef.current!.getBoundingClientRect().width || 1);
      const hi = handlesOf(gr, pad).findIndex(([hx, hy]) => Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol);
      if (hi >= 0) {
        const left = hi === 0 || hi === 2 || hi === 6;
        const top = hi === 0 || hi === 1 || hi === 4;
        drag.current = {
          kind: "grid-resize",
          ax: left ? gr.x + gr.w : gr.x,
          ay: top ? gr.y + gr.h : gr.y,
          axis: hi < 4 ? "xy" : hi < 6 ? "y" : "x",
          r0: { ...gr },
        };
        return;
      }
    }
    // จับมุมของชิ้นที่เลือกอยู่ = ย่อ-ขยาย (รอบจุดกึ่งกลาง)
    if (ctx && selEl) {
      const r = elementBox(ctx, selEl);
      const pad = Math.min(W, H) * 0.012;
      const tol = (14 * W) / (canvasRef.current!.getBoundingClientRect().width || 1);
      const hi = handlesOf(r, pad)
        .slice(0, selEl.kind === "text" ? 4 : 8)
        .findIndex(([hx, hy]) => Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol);
      if (hi >= 0) {
        // มุม/ขอบตรงข้ามอยู่กับที่ (เหมือนโปรแกรมแต่งรูปทั่วไป)
        const left = hi === 0 || hi === 2 || hi === 6;
        const top = hi === 0 || hi === 1 || hi === 4;
        drag.current = {
          kind: "resize",
          id: selEl.id,
          cx: selEl.x,
          cy: selEl.y,
          ax: left ? selEl.x + selEl.w / 2 : selEl.x - selEl.w / 2,
          ay: top ? selEl.y + selEl.h / 2 : selEl.y - selEl.h / 2,
          size0: selEl.size ?? 6,
          d0: Math.max(0.5, Math.hypot(p.x - selEl.x, p.y - selEl.y)),
          swap: Math.round(selEl.rot / 90) % 2 === 1,
          axis: hi < 4 ? "xy" : hi < 6 ? "y" : "x",
          img: (() => {
            const im = selEl.kind === "photo" && selEl.src != null ? imgs[selEl.src] : null;
            if (!im) return undefined;
            const sz = elementPhotoSize(selEl, im);
            return {
              s: sz.w / im.w,
              cx: selEl.x + ((sz.w - selEl.w) / 2) * (selEl.ox ?? 0),
              cy: selEl.y + ((sz.h - selEl.h) / 2) * (selEl.oy ?? 0),
              iw: im.w,
              ih: im.h,
            };
          })(),
        };
        return;
      }
    }
    // ✥ วงกลมกลางรูปของสิ่งที่เลือกอยู่ = เลื่อนรูปในกรอบ/ช่อง (ลากที่อื่น = ย้ายทั้งกรอบ แบบ Printbox)
    const panR = (24 * W) / (canvasRef.current!.getBoundingClientRect().width || 1);
    if (selEl?.kind === "photo" && selEl.src != null && imgs[selEl.src] && Math.hypot(p.x - selEl.x, p.y - selEl.y) <= panR) {
      const sz = elementPhotoSize(selEl, imgs[selEl.src]!);
      drag.current = { kind: "frame-pan", id: selEl.id, ox0: selEl.ox ?? 0, oy0: selEl.oy ?? 0, sw: sz.w, sh: sz.h, x: p.x, y: p.y };
      return;
    }
    if (
      !selEl &&
      slotFocus &&
      tool === "photo" &&
      cur &&
      page.photo &&
      Math.hypot(p.x - (page.photo.x + page.photo.w / 2), p.y - (page.photo.y + page.photo.h / 2)) <= panR
    ) {
      drag.current = { kind: "photo", pl: cur.pl, x: p.x, y: p.y };
      return;
    }
    // 🗂 แตะโดนอะไรบนสุดตามลำดับชั้น (รูปหลัก/ปฏิทิน/ชิ้นส่วน สลับบน-ล่างกันได้)
    const pad = Math.min(W, H) * 0.015;
    let topHit: string | null = null;
    for (const id of [...orderOf(page, design)].reverse()) {
      if (id === LAYER_GRID) {
        if (gr && inRect(p, gr)) topHit = id;
      } else if (id === LAYER_SLOT) {
        if (page.photo && inRect(p, page.photo)) topHit = id;
      } else {
        const el = pageEls.find((x) => x.id === id);
        if (el && ctx && inRect(p, elementBox(ctx, el), pad)) topHit = id;
      }
      if (topHit) break;
    }
    const hit = topHit && topHit !== LAYER_GRID && topHit !== LAYER_SLOT ? pageEls.find((x) => x.id === topHit) : undefined;
    if (hit) {
      setSel(hit.id);
      setSlotFocus(false);
      setGridSel(false);
      if (hit.id !== sel) setPop("");
      setTool(hit.kind === "text" ? "text" : hit.kind === "photo" ? "photo" : "shape");
      drag.current = { kind: "el", id: hit.id, ex: hit.x, ey: hit.y, x: p.x, y: p.y };
      return;
    }
    setSel(null);
    setPop("");
    // 📅 แตะตารางปฏิทิน (อยู่บนสุดตรงนั้น) = เลือกตาราง (ลากย้ายได้เลย)
    if (topHit === LAYER_GRID && gr) {
      setGridSel(true);
      setSlotFocus(false);
      drag.current = { kind: "grid", r0: { ...gr }, x: p.x, y: p.y };
      return;
    }
    setGridSel(false);
    setSlotFocus(!!(page.photo && inRect(p, page.photo)));
    if (!cur && page.photo && inRect(p, page.photo)) {
      // แตะช่องรูปที่ยังว่าง = เลือกรูปใส่ช่องนี้เลย
      pointers.current.delete(e.pointerId);
      slotInputRef.current?.click();
      return;
    }
    if (cur && page.photo && inRect(p, page.photo)) {
      // ลากในช่องรูป = ย้ายทั้งช่อง (รูปตามไปด้วย) — เลื่อนรูปในช่องใช้วงกลมกลางรูป/ล้อเมาส์ซูม
      const ownP = design.photos[basePage.key];
      drag.current = {
        kind: "slot-move",
        r0: { ...page.photo },
        keep: ownP && ownP.src >= 0 ? ownP : { src: slotSrc(design, imgs), pl: cur.pl },
        x: p.x,
        y: p.y,
      };
      setTool("photo");
    }
  }

  /** จุดจับใต้เมาส์ของสิ่งที่เลือกอยู่ (-1 = ไม่โดน) — เงื่อนไขเดียวกับตอนกดใน onPointerDown */
  function handleAt(p: { x: number; y: number }): number {
    const cv = canvasRef.current;
    if (!cv) return -1;
    const tol = (14 * W) / (cv.getBoundingClientRect().width || 1);
    const near = (hs: [number, number][]) => hs.findIndex(([hx, hy]) => Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol);
    const pad = Math.min(W, H) * 0.012;
    if (selEl) {
      const ctx = cv.getContext("2d");
      return ctx ? near(handlesOf(elementBox(ctx, selEl), pad).slice(0, selEl.kind === "text" ? 4 : 8)) : -1;
    }
    if (slotFocus && page.photo && tool === "photo") {
      const i = near(handlesOf(page.photo, 0));
      if (i >= 0) return i;
    }
    const gr = gridOf(page, design);
    return gridSel && gr ? near(handlesOf(gr, pad)) : -1;
  }

  /** 🖱 เคอร์เซอร์ตามสิ่งที่ชี้: จุดจับ = ลูกศรย่อ-ขยาย (แบบ Printbox) · บนชิ้นงาน = ย้าย · ช่องว่าง = มือชี้ */
  function hoverCursor(e: React.PointerEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return;
    let c = "default";
    if (!locked) {
      const p = toMm(e);
      const hi = handleAt(p);
      const ctx = cv.getContext("2d");
      const gr = gridOf(page, design);
      const pad = Math.min(W, H) * 0.015;
      if (hi >= 0) {
        const r = selEl ? Math.round(selEl.rot / 90) % 2 : 0;
        // ชิ้นหมุน 90° — สลับทิศลูกศร
        c = r
          ? ({ "nwse-resize": "nesw-resize", "nesw-resize": "nwse-resize", "ns-resize": "ew-resize", "ew-resize": "ns-resize" } as Record<string, string>)[
              HANDLE_CURSOR[hi]
            ]
          : HANDLE_CURSOR[hi];
      } else if ((ctx && pageEls.some((el) => inRect(p, elementBox(ctx, el), pad))) || (gr && inRect(p, gr))) c = "move";
      else if (page.photo && inRect(p, page.photo)) c = photoOf(page, design, imgs) ? "move" : "pointer";
    }
    if (cv.style.cursor !== c) cv.style.cursor = c;
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return hoverCursor(e);
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
    if (d.kind === "slot-move") {
      const nx = clamp(d.r0.x + p.x - d.x, -d.r0.w / 2, W - d.r0.w / 2);
      const ny = clamp(d.r0.y + p.y - d.y, -d.r0.h / 2, H - d.r0.h / 2);
      const pl = d.keep.pl;
      setSlot({ ...d.r0, x: nx, y: ny }, { ...d.keep, pl: { ...pl, cxMm: pl.cxMm + nx - d.r0.x, cyMm: pl.cyMm + ny - d.r0.y } });
      return;
    }
    if (d.kind === "frame-pan") {
      const el = elements.find((x) => x.id === d.id);
      if (!el) return;
      const ex = (d.sw - el.w) / 2;
      const ey = (d.sh - el.h) / 2;
      patchEl(d.id, {
        ox: ex > 0.01 ? clamp(d.ox0 + (p.x - d.x) / ex, -1, 1) : 0,
        oy: ey > 0.01 ? clamp(d.oy0 + (p.y - d.y) / ey, -1, 1) : 0,
      });
      return;
    }
    if (d.kind === "slot-resize") {
      const min = Math.min(W, H) * 0.15;
      const r = { ...d.r0 };
      if (d.axis !== "y") {
        const w = Math.max(min, Math.abs(p.x - d.ax));
        r.w = w;
        r.x = p.x >= d.ax ? d.ax : d.ax - w;
      }
      if (d.axis !== "x") {
        const h = Math.max(min, Math.abs(p.y - d.ay));
        r.h = h;
        r.y = p.y >= d.ay ? d.ay : d.ay - h;
      }
      setSlot(r, d.keep);
      return;
    }
    if (d.kind === "grid-resize") {
      const min = Math.min(W, H) * 0.2;
      const r = { ...d.r0 };
      if (d.axis !== "y") {
        const w = Math.max(min, Math.abs(p.x - d.ax));
        r.w = w;
        r.x = p.x >= d.ax ? d.ax : d.ax - w;
      }
      if (d.axis !== "x") {
        const h = Math.max(min * 0.6, Math.abs(p.y - d.ay));
        r.h = h;
        r.y = p.y >= d.ay ? d.ay : d.ay - h;
      }
      setGrid(r);
      return;
    }
    if (d.kind === "grid") {
      setGrid({
        ...d.r0,
        x: clamp(d.r0.x + p.x - d.x, -d.r0.w / 2, W - d.r0.w / 2),
        y: clamp(d.r0.y + p.y - d.y, -d.r0.h / 2, H - d.r0.h / 2),
      });
      return;
    }
    if (d.kind === "resize") {
      const el = elements.find((x) => x.id === d.id);
      if (!el) return;
      const min = Math.min(W, H) * 0.04;
      if (el.kind === "text") {
        const f = Math.hypot(p.x - d.cx, p.y - d.cy) / d.d0;
        patchEl(d.id, {
          size: clamp(d.size0 * f, Math.min(W, H) * 0.015, Math.min(W, H) * 0.5),
        });
      } else {
        // 🖼 กรอบรูปมีรูป: ย่อ-ขยายแค่กรอบ รูปคงขนาด+ตำแหน่งเดิม (ขยายรูปเฉพาะตอนกรอบใหญ่กว่ารูป)
        const keepImg = (patch: Partial<CalElement>): Partial<CalElement> => {
          const im = d.img;
          if (!im) return patch;
          const w = patch.w ?? el.w;
          const h = patch.h ?? el.h;
          const x = patch.x ?? el.x;
          const y = patch.y ?? el.y;
          const base = Math.max(w / im.iw, h / im.ih);
          const zoom = Math.max(1, im.s / base);
          const sw = im.iw * base * zoom;
          const sh = im.ih * base * zoom;
          return {
            ...patch,
            zoom,
            ox: sw - w > 0.01 ? clamp((im.cx - x) / ((sw - w) / 2), -1, 1) : 0,
            oy: sh - h > 0.01 ? clamp((im.cy - y) / ((sh - h) / 2), -1, 1) : 0,
          };
        };
        if (d.swap) {
          // หมุน 90° อยู่ — ขยายรอบจุดกลาง (มุมตรงข้ามคำนวณยุ่งเกินคุ้ม)
          patchEl(
            d.id,
            keepImg({
              w: Math.max(min, Math.abs(p.y - d.cy) * 2),
              h: Math.max(min, Math.abs(p.x - d.cx) * 2),
            }),
          );
        } else {
          const patch: Partial<CalElement> = {};
          if (d.axis !== "y") {
            const w = Math.max(min, Math.abs(p.x - d.ax));
            patch.w = w;
            patch.x = d.ax + ((p.x >= d.ax ? 1 : -1) * w) / 2;
          }
          if (d.axis !== "x") {
            const h = Math.max(min, Math.abs(p.y - d.ay));
            patch.h = h;
            patch.y = d.ay + ((p.y >= d.ay ? 1 : -1) * h) / 2;
          }
          patchEl(d.id, keepImg(patch));
        }
      }
      return;
    }
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (d.kind === "photo") editPl(() => ({ ...d.pl, cxMm: d.pl.cxMm + dx, cyMm: d.pl.cyMm + dy }));
    else patchEl(d.id, { x: clamp(d.ex + dx, 0, W), y: clamp(d.ey + dy, 0, H) });
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
      // เลือกกรอบรูปที่มีรูปอยู่ = ซูมรูปในกรอบ · ไม่งั้นซูมรูปช่องหลัก
      const fr = selEl?.kind === "photo" && selEl.src != null && imgs[selEl.src] ? selEl : null;
      if (fr) {
        e.preventDefault();
        patchEl(fr.id, {
          zoom: clamp((fr.zoom ?? 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 4),
        });
        return;
      }
      // 📅 เลือกตารางปฏิทินอยู่ = ล้อเมาส์ย่อ-ขยายตารางรอบจุดกลาง
      const gr = gridSel ? gridOf(page, design) : undefined;
      if (gr) {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        const w = clamp(gr.w * f, Math.min(W, H) * 0.2, W * 1.2);
        const h = (gr.h * w) / gr.w;
        setGrid({ x: gr.x + (gr.w - w) / 2, y: gr.y + (gr.h - h) / 2, w, h });
        return;
      }
      if (!page.photo || !photoOf(page, design, imgs)) return;
      e.preventDefault();
      editPl((pl) => scalePl(pl, e.deltaY < 0 ? 1.06 : 1 / 1.06));
    };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => cv.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, design, imgs, selEl, gridSel]);

  const cur = photoOf(page, design, imgs);
  const own = design.photos[basePage.key];
  const curSrc = own ? srcs[own.src] : srcs[slotSrc(design, imgs)];
  const zoomPct = cur && page.photo && curSrc ? Math.round((cur.pl.wMm / coverPlacement(page.photo, curSrc).wMm) * 100) : 100;
  const dpi = cur && curSrc ? Math.round(curSrc.w / (cur.pl.wMm / 25.4)) : 0;
  const covers = cur && page.photo ? placementCovers(cur.pl, page.photo) : true;
  const isCover = coverPage?.key === basePage.key;
  const layouts = layoutsOf(fmt, basePage);

  /** 📅 ตั้งตำแหน่ง/ขนาดตารางปฏิทินของหน้านี้ (ไม่ส่ง = กลับตามเลย์เอาต์) */
  function setGrid(r?: { x: number; y: number; w: number; h: number }) {
    const key = page.key;
    setDesign((d) => {
      const grids = { ...(d.grids ?? {}) };
      if (r) grids[key] = r;
      else delete grids[key];
      return { ...d, grids: Object.keys(grids).length ? grids : undefined };
    });
  }

  /** 🗂 รายการชั้นของหน้านี้ (บนสุดอยู่บน) — แตะแถว = เลือกชิ้นนั้น · ▲▼ ทีละชั้น · ปุ่มล่างย้ายชิ้นที่เลือกไปบนสุด/ล่างสุด */
  function renderLayerList(curId: string | null) {
    const list = [...orderOf(page, design)].reverse();
    const nameOf = (id: string) => {
      if (id === LAYER_SLOT) return "รูปหลัก";
      if (id === LAYER_GRID) return "ปฏิทิน";
      const e = pageEls.find((x) => x.id === id);
      if (!e) return id;
      if (e.kind === "text") return `“${(e.text ?? "").trim().slice(0, 14) || "ข้อความ"}”`;
      if (e.kind === "photo") return `กรอบรูป ${pageEls.filter((x) => x.kind === "photo").indexOf(e) + 1}`;
      return e.kind === "ellipse" ? "วงกลม" : "สี่เหลี่ยม";
    };
    /** 🖼 รูปย่อของแต่ละชั้น — รูปจริงที่ใส่ไว้ / ตัวอักษรตามฟอนต์+สี / ตารางปฏิทินจิ๋ว */
    const thumbOf = (id: string) => {
      const box = "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-stone-200";
      const pic = (src: number | undefined) => {
        const s = src != null && src >= 0 ? srcs[src] : undefined;
        return s && !s.removed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px] font-bold text-stone-400">ว่าง</span>
        );
      };
      if (id === LAYER_SLOT) {
        const own = design.photos[page.key];
        return <span className={`${box} bg-stone-100`}>{pic(own ? own.src : slotSrc(design, imgs))}</span>;
      }
      if (id === LAYER_GRID)
        return (
          <span className={`${box} bg-white`}>
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
              <rect x="3" y="4" width="18" height="17" rx="2" fill="#fff" stroke="#78716c" strokeWidth="1.4" />
              <rect x="3" y="4" width="18" height="4.5" rx="2" fill="#dc2626" />
              {[0, 1, 2, 3].map((r) =>
                [0, 1, 2, 3, 4].map((c) => (
                  <rect key={`${r}-${c}`} x={5 + c * 3} y={10.5 + r * 2.5} width="1.6" height="1.4" fill={c === 0 ? "#dc2626" : "#57534e"} />
                )),
              )}
            </svg>
          </span>
        );
      const e = pageEls.find((x) => x.id === id);
      if (!e) return <span className={box} />;
      if (e.kind === "photo") return <span className={`${box} bg-[#9fc4cc]`}>{pic(e.src)}</span>;
      if (e.kind === "text")
        return (
          <span
            className={`${box} bg-[repeating-conic-gradient(#e7e5e4_0_25%,#fafaf9_0_50%)] bg-[length:10px_10px] text-xl`}
            style={{
              color: e.fill || "#1c1917",
              fontFamily: CAL_FONTS.find((f) => f.key === (e.font ?? "prompt"))?.css,
              fontWeight: e.bold ? 800 : 400,
              fontStyle: e.italic ? "italic" : undefined,
              WebkitTextStroke: e.stroke ? `0.6px ${e.stroke}` : undefined,
            }}
          >
            {(e.text ?? "").trim().slice(0, 2) || "T"}
          </span>
        );
      return (
        <span className={`${box} bg-white`}>
          <span
            className={`h-6 w-6 ${e.kind === "ellipse" ? "rounded-full" : "rounded"}`}
            style={{ background: e.fill || "transparent", border: e.stroke ? `2px solid ${e.stroke}` : undefined }}
          />
        </span>
      );
    };
    const pick = (id: string) => {
      if (id === LAYER_GRID) {
        setSel(null);
        setSlotFocus(false);
        setGridSel(true);
      } else if (id === LAYER_SLOT) {
        setSel(null);
        setGridSel(false);
        setSlotFocus(true);
        setTool("photo");
      } else {
        const e = pageEls.find((x) => x.id === id);
        setGridSel(false);
        setSlotFocus(false);
        setSel(id);
        if (e) setTool(e.kind === "text" ? "text" : e.kind === "photo" ? "photo" : "shape");
      }
    };
    const arrow = "grid h-8 w-8 place-items-center rounded-lg text-xs text-stone-500 hover:bg-stone-200 disabled:opacity-25";
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-stone-500">บนสุดอยู่ด้านบน · แตะชื่อเพื่อเลือก แล้วกด ▲▼ เลื่อนชั้น</p>
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {list.map((id, i) => (
            <li
              key={id}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm ${id === curId ? "bg-sky-50 font-bold text-sky-800 ring-1 ring-sky-200" : "text-stone-700 hover:bg-stone-50"}`}
            >
              <button type="button" onClick={() => pick(id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                {thumbOf(id)}
                <span className="truncate">{nameOf(id)}</span>
              </button>
              <button type="button" disabled={i === 0} onClick={() => moveLayer(id, "up")} className={arrow} aria-label="ขึ้น 1 ชั้น">
                ▲
              </button>
              <button type="button" disabled={i === list.length - 1} onClick={() => moveLayer(id, "down")} className={arrow} aria-label="ลง 1 ชั้น">
                ▼
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={!curId} onClick={() => curId && moveLayer(curId, "top")} className={toolBtn}>
            ⬆ ขึ้นบนสุด
          </button>
          <button type="button" disabled={!curId} onClick={() => curId && moveLayer(curId, "bottom")} className={toolBtn}>
            ⬇ ลงล่างสุด
          </button>
        </div>
      </div>
    );
  }

  /** 🗂 หน้าต่าง Layers (ปุ่มแถบขวา) — เรียงชั้นของหน้านี้ */
  function renderLayersPopup() {
    const curId = sel && pageEls.some((e) => e.id === sel) ? sel : gridSel ? LAYER_GRID : slotFocus ? LAYER_SLOT : null;
    return (
      <Popup title={`Layers · ${basePage.name}`} onClose={() => setLayersOpen(false)} narrow>
        <div className="px-5 py-4">{renderLayerList(curId)}</div>
      </Popup>
    );
  }

  /** 📅 แถบเครื่องมือใต้ตารางปฏิทินที่เลือก — จัดกึ่งกลาง · ขนาดเดิม */
  function renderGridBar() {
    const gr = gridOf(page, design);
    if (!gridSel || !gr || selEl) return null;
    const cssW = canvasRef.current?.clientWidth ?? 0;
    const cssH = canvasRef.current?.clientHeight ?? 0;
    if (!cssW) return null;
    const { left, top: below } = barPos(gr, cssW, cssH);
    // ใต้ตารางไม่มีที่ (ตารางชิดขอบล่างการ์ด) → ขึ้นไปไว้เหนือตาราง ไม่บังจุดจับด้านล่าง
    const top = below + 44 > cssH ? Math.max(4, (gr.y / H) * cssH - 56) : below;
    const changed = !!design.grids?.[page.key];
    return (
      <div className="absolute z-20 w-max -translate-x-1/2" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className="flex items-center gap-1 rounded-2xl bg-white px-2 py-1 text-xs font-bold text-stone-700 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200"
        >
          <span className="px-1 text-[11px] text-stone-400">📅 ปฏิทิน · ลากย้าย · จับจุดย่อ-ขยาย</span>
          <button
            type="button"
            onClick={() => setGrid({ ...gr, x: (W - gr.w) / 2 })}
            className="rounded-lg px-2 py-1.5 hover:bg-stone-100"
            title="จัดกึ่งกลางแนวนอน"
          >
            ↔ กึ่งกลาง
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => setGrid(undefined)}
            className="rounded-lg px-2 py-1.5 hover:bg-stone-100 disabled:opacity-30"
            title="กลับขนาด/ตำแหน่งตามเลย์เอาต์"
          >
            ↺ ขนาดเดิม
          </button>
        </div>
      </div>
    );
  }

  /** 🗑 ลบรูปในช่องรูปหลักของหน้านี้ → ช่องว่าง "Drag here" (src -1 = ว่างโดยตั้งใจ ไม่ยืมรูปหน้าปก) */
  function removeSlotPhoto() {
    if (!cur) return;
    const key = basePage.key;
    const pl = cur.pl;
    setDesign((d) => ({
      ...d,
      photos: { ...d.photos, [key]: { src: -1, pl } },
    }));
    setSlotFocus(false);
  }
  overlayRef.current = ask
    ? () => setAsk(null)
    : layersOpen
      ? () => setLayersOpen(false)
      : askMode && !askModeFirst.current
        ? () => setAskMode(false)
        : tool === "calendar" || tool === "events" || tool === "settings"
          ? () => setTool(null)
          : pop || headPop
            ? () => (setPop(""), setHeadPop(""))
            : sel || gridSel || slotFocus
              ? () => (setSel(null), setGridSel(false), setSlotFocus(false))
              : null;
  slotDelRef.current = !locked && tool === "photo" && slotFocus && !sel && cur ? removeSlotPhoto : null;

  function addEvent(): boolean {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(evDate);
    if (!m) {
      setErr("เลือกวันที่ของวันสำคัญก่อน");
      return false;
    }
    setErr("");
    const date = `${m[1]}-${m[2]}`;
    setBack((b) => ({
      ...b,
      events: [...b.events.filter((x) => x.date !== date), { date, label: evLabel.trim(), color: evColor }].sort((x, y) => x.date.localeCompare(y.date)),
    }));
    setEvDate("");
    setEvLabel("");
    return true;
  }

  /** นำเข้าวันสำคัญจากไฟล์ปฏิทิน (.ics จาก Google/Apple Calendar) หรือรายการ วันที่,ชื่อ (.csv/.txt) */
  async function importEvents(f: File | undefined) {
    if (!f) return;
    const list = parseEventsText(await f.text());
    if (!list.length) {
      setErr("ไม่พบวันที่ในไฟล์ — ใช้ไฟล์ .ics หรือบรรทัดละวัน เช่น 14/05,วันเกิดแม่");
      return;
    }
    setErr("");
    setBack((b) => {
      const have = new Set(b.events.map((x) => x.date));
      const colors = SWATCHES.filter((c) => c !== "#ffffff");
      const add = list.filter((x) => !have.has(x.date) && (have.add(x.date), true));
      const events = [
        ...b.events,
        ...add.map((x, i) => ({
          ...x,
          color: colors[(b.events.length + i) % colors.length],
        })),
      ]
        .slice(0, 120)
        .sort((x, y) => x.date.localeCompare(y.date));
      return { ...b, events };
    });
    setEvNote(`นำเข้าแล้ว ${list.length} วัน`);
  }

  /** ปรับตัวอักษรแยกส่วน (Calendar settings) */
  const setPart = (k: CalPartKey, patch: Partial<CalPart>) =>
    setBack((b) => ({
      ...b,
      parts: { ...b.parts, [k]: { ...b.parts?.[k], ...patch } },
    }));

  /** Settings: ปี · ภาษา · เริ่มสัปดาห์ — กด Apply ค่อยใช้ (แบบ Printbox) */
  function applySettings(dr: { year: number; lang: CalBack["lang"]; weekStart: 0 | 1 }) {
    const was = back.year;
    if (dr.year !== was) {
      setDesign((d) => ({
        ...d,
        elements: (d.elements ?? []).map((e) => (e.kind === "text" && e.text?.trim() === String(was) ? { ...e, text: String(dr.year) } : e)),
      }));
      onYear?.(dr.year);
    }
    setBack((b) => ({
      ...b,
      year: dr.year,
      lang: dr.lang,
      weekStart: dr.weekStart,
      title: isAutoTitle(b.title, b.year, b.lang) ? defaultTitle(dr.year, dr.lang, lightTitle) : b.title,
    }));
    setTool(null);
  }

  async function apply(force = false) {
    if (busy) return;
    // มีช่องรูปแต่ยังไม่มีช่องไหนใส่รูป = ยังสั่งไม่ได้ (ช่องจะพิมพ์ออกมาว่าง)
    const needsPhoto = printPages.some((v) => lay(v.page).photo);
    if (needsPhoto && slotSrc(design, imgs) < 0) {
      if (coverPage) setPageIdx(fmt.pages.indexOf(coverPage));
      setTool("photo");
      setErr("ช่องรูปหน้าปกยังว่าง — แตะช่องสีเทาเพื่อเลือกรูป หรือลากรูปมาวาง");
      return;
    }
    // คละลาย: ค่าคละนับจากรูปในคลัง — รูปที่ไม่ได้วางลงใบไหนไม่ได้พิมพ์แต่ยังนับ → ถามให้ลบออกก่อน
    if (mixMode && unusedSrcs.length) {
      const list = unusedSrcs;
      setAsk({
        icon: "🖼",
        title: `มีรูปที่ยังไม่ได้ใช้ ${list.length} รูป`,
        body: `ค่าคละลายนับจากรูปที่อัปไว้ทั้งหมด (${libCount} รูป) — รูปที่ไม่ได้ใส่ลงใบไหนจะไม่ได้พิมพ์แต่ยังนับเป็นลาย ลบออกแล้วกด "ใช้แบบนี้" อีกครั้ง`,
        ok: `ลบรูปที่ไม่ใช้ ${list.length} รูป`,
        run: () => list.forEach((i) => dropSrc(i)),
      });
      return;
    }
    // คละลาย: ทุกใบต้องมีรูปของตัวเอง (ใบไหนว่างจะพิมพ์ออกมาเป็นช่องว่าง)
    if (mixMode) {
      const empty = printPages.find((v) => lay(v.page).photo && !photoOf(lay(v.page), design, imgs));
      if (empty) {
        setPageIdx(vpages.indexOf(empty));
        setTool("photo");
        setErr(`${vname(empty)} ยังไม่มีรูป — คละลายต้องใส่รูปให้ครบทุกใบ (หรือเปลี่ยนเป็นลายเดียวที่แถบด้านล่าง)`);
        return;
      }
    }
    // หน้าที่ลูกค้าขยับรูปเองจนไม่เต็มช่อง — ถามก่อน (หน้าที่ใช้รูปปกอัตโนมัติวางเต็มช่องเสมอ)
    if (!force) {
      const gaps = printPages.filter((v) => {
        const lp = lay(v.page);
        const o = design.photos[v.page.key];
        return lp.photo && o && o.src >= 0 && !placementCovers(o.pl, lp.photo);
      });
      if (gaps.length) {
        setPageIdx(vpages.indexOf(gaps[0]));
        setGapAsk(gaps.map(vname));
        return;
      }
    }
    setGapAsk(null);
    setErr("");
    setSel(null);
    try {
      setBusy("กำลังเตรียมฟอนต์…");
      await ensureFonts(fontKeys);
      const stem = ((srcs[0]?.file.name ?? "calendar").replace(/\.[^.]+$/, "") || "calendar").slice(0, 40);
      const out: CalendarResult["pages"] = [];
      for (let i = 0; i < printPages.length; i++) {
        const v = printPages[i];
        const p = v.page;
        const name = vname(v).replace(/^\d+\. /, "");
        setBusy(`กำลังประกอบหน้า ${i + 1}/${printPages.length}…`);
        // มีรูปบนหน้า (ช่องรูปหรือกรอบรูปอิสระ) = JPEG · ตารางล้วน = PNG คมกว่า
        const photo = !!lay(p).photo || elements.some((e) => e.page === p.key && e.kind === "photo");
        const no = printPages.length > 2 ? `${String(i + 1).padStart(2, "0")}-` : "";
        const f = await renderPage(
          fmt,
          (ctx, k) => drawPage(ctx, k, fmt, p, design, back, imgs),
          photo ? "image/jpeg" : "image/png",
          `${stem}-ปฏิทิน${back.year}-${no}${name}.${photo ? "jpg" : "png"}`.replace(/[\/:*?"<>|]/g, "-"),
        );
        if (!f) throw new Error(`ประกอบหน้า "${name}" ไม่สำเร็จ ลองใหม่อีกครั้ง`);
        out.push({ key: p.key, name, file: f });
      }
      // ความคมชัดต่ำสุดของทุกหน้า (ทีมผลิตดูตัวเลขเดียวพอ)
      const dpis = printPages
        .map(({ page: p }) => {
          const c = photoOf(lay(p), design, imgs);
          const o = design.photos[p.key];
          const s = o ? srcs[o.src] : srcs[slotSrc(design, imgs)];
          return c && s ? Math.round(s.w / (c.pl.wMm / 25.4)) : Infinity;
        })
        .concat(
          elements
            .filter((e) => e.kind === "photo" && e.src != null && srcs[e.src] && printPages.some((v) => v.page.key === e.page))
            .map((e) => Math.round(srcs[e.src!].w / (elementPhotoSize(e, srcs[e.src!]).w / 25.4))),
        )
        .filter(Number.isFinite);
      const minDpi = dpis.length ? Math.min(...dpis) : 0;
      const n = (v: number) => Math.round(v * 100) / 100;
      const ownCount = Object.values(design.photos).filter((o) => o.src >= 0).length;
      const texts = elements.filter((e) => e.kind === "text" && e.text?.trim());
      const shapes = elements.filter((e) => e.kind === "rect" || e.kind === "ellipse").length;
      // นับเฉพาะกรอบที่ใส่รูปแล้ว (กรอบว่างไม่พิมพ์)
      const freePhotos = elements.filter((e) => e.kind === "photo" && e.src != null && !!imgs[e.src]).length;
      const layoutNote = Object.entries(design.layouts ?? {})
        .map(
          ([k, v]) =>
            `${fmt.pages.find((p) => p.key === k)?.name ?? k}: ${
              layoutsOf(
                fmt,
                fmt.pages.find((p) => p.key === k)!,
              ).find((l) => l.key === v)?.name ?? v
            }`,
        )
        .join(", ");
      // รูปที่ลบจากคลังไม่ส่งไป — บีบลำดับรูปแล้วแก้เลขอ้างอิงใน design ให้ตรง
      const remap = new Map<number, number>();
      srcs.forEach((s, i) => !s.removed && remap.set(i, remap.size));
      const kept = srcs.filter((s) => !s.removed).map((s) => s.file);
      const savedDesign: CalDesign = {
        ...design,
        photos: Object.fromEntries(Object.entries(design.photos).map(([k, o]) => [k, { ...o, src: remap.get(o.src) ?? -1 }])),
        elements: (design.elements ?? []).map((e) => (e.src == null ? e : { ...e, src: remap.get(e.src) })),
      };
      setBusy("กำลังอัปโหลด…");
      await onApply({
        pages: out,
        sources: kept,
        state: { format: fmt.key, design: savedDesign, back, sources: kept },
        dpi: minDpi,
        head: `${fmt.name} · ปี ${back.year}`,
        summary: `${title} · ปฏิทินปี ${back.year} · ${copies > 1 ? `${copies} ใบ (${custom.length ? `คละลาย ${designN} รูป` : "เหมือนกันทุกใบ"})` : `${fmt.pages.length} หน้า`}${minDpi ? ` · ${minDpi} DPI` : ""}`,
        spec:
          `${fmt.name} · กรอบ ${n(W)}×${n(H)}mm (งานจริง ${n(fmt.trimW)}×${n(fmt.trimH)} + ตัดตก ${fmt.bleed}) · ไฟล์ ${fmt.dpi} DPI · ` +
          `${printPages.length} ไฟล์: ${printPages.map((v, i) => `${i + 1}.${vname(v).replace(/^\d+\. /, "")}`).join(" ")}` +
          (copies > 1
            ? ` · ชุดละ ${copies} ใบ: ใบที่ 1 พิมพ์ ${copies - custom.length} ใบ${custom.length ? ` · แยกแบบ ใบที่ ${custom.map((c) => c + 1).join(", ")} (ใบละ 1)` : ""}`
            : "") +
          `${fmt.note ? ` (${fmt.note})` : ""} · รูป ${kept.length} ไฟล์ (ใส่รายหน้า ${ownCount} หน้า ที่เหลือใช้รูปหน้าปก)` +
          `${minDpi ? ` · ความคมชัดต่ำสุด ${minDpi} DPI` : ""}` +
          `${texts.length ? ` · ข้อความ ${texts.length} กล่อง: ${texts.map((e) => `"${e.text!.trim().replace(/\n/g, " ")}"`).join(", ")}` : ""}` +
          `${shapes ? ` · รูปทรง ${shapes} ชิ้น` : ""}${freePhotos ? ` · กรอบรูปอิสระ ${freePhotos} กรอบ` : ""}${layoutNote ? ` · เลย์เอาต์: ${layoutNote}` : ""} · ` +
          `ปฏิทิน: ${backSpec(back)} ` +
          printFrameToken(W, H),
      });
      onClose();
      if (orderAfter.current && onOrder) await onOrder();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองกดใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  }

  /**
   * 🧰 แถบเครื่องมือลอยใต้รูปที่เลือก (แบบ Printbox) — กรอบรูปอิสระ หรือช่องรูปหลัก
   * เครื่องมือทุกอย่างอยู่ที่ภาพ ไม่ต้องไปหาในแผงข้าง
   */
  /* ─────────── หน้าต่างเด้ง Calendar / Events / Settings (แบบ Printbox) ─────────── */

  function renderCalendarPopup() {
    const hasTitle = fmt.pages.some((p) => p.kind === "year" || p.kind === "photo-year");
    const rows: {
      k: CalPartKey;
      label: string;
      en: string;
      defBold: boolean;
      defColor: string;
    }[] = [
      {
        k: "month",
        label: "ชื่อเดือน",
        en: "Month name",
        defBold: true,
        defColor: back.accent,
      },
      ...(hasTitle
        ? [
            {
              k: "title" as const,
              label: "หัวข้อปี",
              en: "Year name",
              defBold: !lightTitle,
              defColor: back.accent,
            },
          ]
        : []),
      {
        k: "week",
        label: "ชื่อวัน",
        en: "Weekday names",
        defBold: !lightTitle,
        defColor: back.ink,
      },
      {
        k: "day",
        label: "ตัวเลขวันที่",
        en: "Day numbers",
        defBold: false,
        defColor: back.ink,
      },
    ];
    const touched = Object.values(back.parts ?? {}).some((x) => x && Object.keys(x).length);
    return (
      <Popup
        title="Calendar settings"
        onClose={() => setTool(null)}
        footer={
          <>
            <button type="button" disabled={!touched} onClick={() => setBack((b) => ({ ...b, parts: undefined }))} className={toolBtn}>
              ↺ ค่าเริ่มต้น
            </button>
            <button
              type="button"
              onClick={() => setTool(null)}
              className="ml-auto rounded-full bg-sky-600 px-5 py-2 text-xs font-extrabold text-white shadow hover:bg-sky-700"
            >
              เสร็จ
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 pb-3">
          <span className="text-xs font-extrabold text-stone-800">ฟอนต์ทั้งปฏิทิน</span>
          <div className="min-w-[10rem] flex-1">
            <FontSelect value={back.font} onChange={(font) => setBack((b) => ({ ...b, font }))} />
          </div>
        </div>
        {rows.map((r) => {
          const pt = back.parts?.[r.k] ?? {};
          const bold = pt.bold ?? r.defBold;
          const scale = Math.round((pt.scale ?? 1) * 100);
          const align = pt.align ?? "center";
          return (
            <div key={r.k} className="border-b border-stone-100 py-3">
              <p className="mb-1.5 text-xs font-extrabold text-stone-800">
                {r.label} <span className="font-semibold text-stone-400">· {r.en}</span>
              </p>
              {r.k === "title" && (
                <input
                  value={back.title}
                  onChange={(e) =>
                    setBack((b) => ({
                      ...b,
                      title: e.target.value.slice(0, 30),
                    }))
                  }
                  className="mb-2 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-800"
                  placeholder="เว้นว่าง = ไม่มีหัวข้อ"
                />
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={pt.font ?? ""}
                  onChange={(e) => setPart(r.k, { font: e.target.value || undefined })}
                  className="h-9 min-w-[8.5rem] flex-1 rounded-lg border border-stone-200 bg-white px-2 text-sm"
                  aria-label={`ฟอนต์${r.label}`}
                >
                  <option value="">ตามฟอนต์ปฏิทิน</option>
                  {CAL_FONTS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-200">
                  <button type="button" title="ตัวหนา" onClick={() => setPart(r.k, { bold: !bold })} className={segBtn(bold)}>
                    <b>B</b>
                  </button>
                  <button type="button" title="ตัวเอียง" onClick={() => setPart(r.k, { italic: !pt.italic })} className={segBtn(!!pt.italic)}>
                    <i className="font-serif">I</i>
                  </button>
                </div>
                <div className="flex items-center overflow-hidden rounded-lg ring-1 ring-stone-200">
                  <button
                    type="button"
                    disabled={scale <= 40}
                    onClick={() => setPart(r.k, { scale: Math.max(40, scale - 10) / 100 })}
                    className={segBtn(false)}
                    aria-label="เล็กลง"
                  >
                    −
                  </button>
                  <span className="w-11 text-center text-xs font-bold tabular-nums text-stone-700">{scale}%</span>
                  <button
                    type="button"
                    disabled={scale >= 250}
                    onClick={() => setPart(r.k, { scale: Math.min(250, scale + 10) / 100 })}
                    className={segBtn(false)}
                    aria-label="ใหญ่ขึ้น"
                  >
                    ＋
                  </button>
                </div>
                <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-200">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      title={a === "left" ? "ชิดซ้าย" : a === "right" ? "ชิดขวา" : "กึ่งกลาง"}
                      onClick={() => setPart(r.k, { align: a })}
                      className={segBtn(align === a)}
                    >
                      <AlignIco a={a} />
                    </button>
                  ))}
                </div>
                <Swatch value={pt.color || r.defColor} onChange={(color) => setPart(r.k, { color })} label={`สี${r.label}`} />
              </div>
            </div>
          );
        })}
        <div className="space-y-3 pt-3">
          <RowSwitch
            label="วันหยุดนักขัตฤกษ์และวันพิเศษ (ไทย)"
            hint={!holidayData ? `ยังไม่มีตารางวันหยุดของปี ${back.year} — ใส่เป็นวันสำคัญเองได้ (Events)` : undefined}
            on={back.holidayOn && holidayData}
            disabled={!holidayData}
            color={back.holidayColor}
            onToggle={() => setBack((b) => ({ ...b, holidayOn: !b.holidayOn }))}
            onColor={(holidayColor) => setBack((b) => ({ ...b, holidayColor }))}
          />
          {back.holidayOn && holidayData && (
            <details className="-mt-1 text-[10.5px] text-stone-500">
              <summary className="cursor-pointer font-bold">ดูวันหยุดที่จะไฮไลต์ ({Object.keys(holidays).length} วัน)</summary>
              <ul className="mt-1 columns-2 space-y-0.5">
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
          <RowSwitch
            label="สีวันอาทิตย์"
            on={back.sundayOn}
            color={back.sundayColor}
            onToggle={() => setBack((b) => ({ ...b, sundayOn: !b.sundayOn }))}
            onColor={(sundayColor) => setBack((b) => ({ ...b, sundayColor }))}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-700">สีพื้นปฏิทิน</span>
            <Swatch value={back.bg} onChange={(bg) => setBack((b) => ({ ...b, bg }))} label="สีพื้นปฏิทิน" />
          </div>
          <p className="text-[10.5px] text-stone-400">หมายเหตุ: ปรับแล้วตรวจทุกหน้าของปฏิทินอีกครั้ง (รูปย่อด้านล่าง)</p>
        </div>
      </Popup>
    );
  }

  function renderEventsPopup() {
    return (
      <Popup
        title="Events"
        onClose={() => setTool(null)}
        footer={
          <>
            <button type="button" onClick={() => setEvAdding(true)} className={`${toolBtn} flex items-center gap-1.5`}>
              <span aria-hidden>📅</span> เพิ่มใหม่
            </button>
            <label className={`${toolBtn} flex cursor-pointer items-center gap-1.5`} title="ไฟล์ .ics จาก Google/Apple Calendar หรือ .csv (วันที่,ชื่อ)">
              <span aria-hidden>⤓</span> นำเข้า
              <input
                type="file"
                accept=".ics,.csv,.txt,text/calendar,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void importEvents(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setTool(null)}
              className="ml-auto rounded-full bg-sky-600 px-5 py-2 text-xs font-extrabold text-white shadow hover:bg-sky-700"
            >
              เสร็จ
            </button>
          </>
        }
      >
        {evAdding && (
          <div className="mb-3 space-y-2 rounded-2xl bg-sky-50/60 p-3 ring-1 ring-sky-100">
            <p className="text-xs font-extrabold text-stone-800">เพิ่มวันสำคัญ</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="date"
                value={evDate}
                min={`${back.year}-01-01`}
                max={`${back.year}-12-31`}
                onChange={(e) => setEvDate(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm"
              />
              <input
                value={evLabel}
                onChange={(e) => setEvLabel(e.target.value.slice(0, 40))}
                placeholder="ชื่อวัน (ไม่บังคับ) เช่น วันเกิดแม่"
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm"
              />
            </div>
            <Colors value={evColor} onChange={setEvColor} exclude={["#ffffff"]} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEvAdding(false)} className={toolBtn}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => addEvent() && setEvAdding(false)}
                className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-extrabold text-white shadow hover:bg-sky-700"
              >
                บันทึก
              </button>
            </div>
          </div>
        )}
        {evNote && <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">✓ {evNote}</p>}
        {back.events.length ? (
          <ul className="space-y-1.5">
            {back.events.map((ev) => {
              const [mm, dd] = ev.date.split("-").map(Number);
              return (
                <li key={ev.date} className="flex items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2 text-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white" style={{ background: ev.color }}>
                    {dd}
                  </span>
                  <span className="w-16 shrink-0 text-xs font-bold text-stone-500">{MONTH_TH_SHORT[mm - 1]}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-700">{ev.label || "—"}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBack((b) => ({
                        ...b,
                        events: b.events.filter((x) => x.date !== ev.date),
                      }))
                    }
                    className="grid h-7 w-7 place-items-center rounded-full text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="ลบวันสำคัญนี้"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          !evAdding && (
            <div className="py-6 text-center">
              <p className="text-xl font-extrabold text-stone-800">เพิ่มวันสำคัญ!</p>
              <p className="mt-1 text-sm text-stone-500">ยังไม่มีวันสำคัญเลย</p>
              <div className="mx-auto my-5 grid h-24 w-24 place-items-center rounded-full bg-stone-50 text-5xl" aria-hidden>
                🗓️
              </div>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-stone-500">
                ใส่วันเกิด วันครบรอบ และวันพิเศษของคนที่คุณรัก — เป็นวงกลมสีบนวันนั้น (หน้ารายเดือนมีชื่อวันใต้ตัวเลขด้วย)
              </p>
            </div>
          )
        )}
      </Popup>
    );
  }

  function renderSettingsPopup(dr: { year: number; lang: CalBack["lang"]; weekStart: 0 | 1 }) {
    const yearList = years?.length ? years : [back.year];
    const changed = dr.year !== back.year || dr.lang !== back.lang || dr.weekStart !== back.weekStart;
    return (
      <Popup
        title="Settings"
        onClose={() => setTool(null)}
        narrow
        footer={
          <>
            <button
              type="button"
              onClick={() => setTool(null)}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!changed}
              onClick={() => applySettings(dr)}
              className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow hover:bg-sky-700 disabled:opacity-40"
            >
              ใช้
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-xs font-bold text-stone-600">
            เลือกปี ค.ศ.
            <select
              value={dr.year}
              disabled={yearList.length < 2 || !onYear}
              onChange={(e) => setDraft({ ...dr, year: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-normal text-stone-800 disabled:bg-stone-50"
            >
              {yearList.map((y) => (
                <option key={y} value={y}>
                  ปี ค.ศ. {y} (พ.ศ. {y + 543})
                </option>
              ))}
            </select>
            {dr.year !== back.year && <span className="mt-1 block text-[10.5px] font-normal text-amber-700">ตัวเลือกปีในหน้าสินค้าจะเปลี่ยนตาม</span>}
          </label>
          <Toggle
            label="ภาษา"
            options={[
              ["en", "English"],
              ["th", "ไทย"],
            ]}
            value={dr.lang}
            onChange={(v) => setDraft({ ...dr, lang: v as CalBack["lang"] })}
          />
          <Toggle
            label="เริ่มสัปดาห์"
            options={[
              ["0", "อาทิตย์"],
              ["1", "จันทร์"],
            ]}
            value={String(dr.weekStart)}
            onChange={(v) => setDraft({ ...dr, weekStart: v === "1" ? 1 : 0 })}
          />
        </div>
      </Popup>
    );
  }

  /** ตำแหน่งแถบเครื่องมือลอย: กึ่งกลางใต้ชิ้นที่เลือก แต่ไม่ล้นขอบเวที (เวทีกว้างกว่ารูป = ล้นออกนอกรูปได้ถึงขอบเวที) */
  function barPos(r: { x: number; y: number; w: number; h: number }, cssW: number, cssH: number) {
    const offset = Math.max(0, (stageBox.w - cssW) / 2) - 8;
    const half = (barW || 360) / 2;
    const want = ((r.x + r.w / 2) / W) * cssW;
    const left = half * 2 > cssW + offset * 2 ? cssW / 2 : clamp(want, half - offset, cssW + offset - half);
    const top = Math.min(((r.y + r.h) / H) * cssH, cssH) + 14;
    return { left, top };
  }

  /** 🟦 แถบเครื่องมือลอยใต้รูปทรง (Rectangle / Ellipse) — แบบเดียวกับ Photo ไม่มีแผงข้าง */
  function renderShapeBar() {
    const se = selEl && (selEl.kind === "rect" || selEl.kind === "ellipse") ? selEl : null;
    if (!se) return null;
    const cssW = canvasRef.current?.clientWidth ?? 0;
    const cssH = canvasRef.current?.clientHeight ?? 0;
    if (!cssW) return null;
    const { left, top } = barPos({ x: se.x - se.w / 2, y: se.y - se.h / 2, w: se.w, h: se.h }, cssW, cssH);
    const sep = <span className="mx-0.5 h-6 w-px shrink-0 bg-stone-200" />;
    return (
      <div className="absolute z-20 w-max -translate-x-1/2" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        {pop && (
          <div className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200">
            {pop === "fill" && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-stone-500">สีพื้น</p>
                <Colors value={se.fill} onChange={(fill) => patchEl(se.id, { fill })} allowNone />
              </div>
            )}
            {pop === "border" && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-stone-500">สีเส้นขอบ</p>
                <Colors value={se.stroke} onChange={(stroke) => patchEl(se.id, { stroke, strokeW: se.strokeW || 0.6 })} allowNone />
                {se.stroke && (
                  <ValueSlider
                    label="หนา"
                    min={2}
                    max={Math.round(m * 0.4)}
                    value={Math.round(se.strokeW * 10)}
                    suffix=""
                    onChange={(v) => patchEl(se.id, { strokeW: v / 10 })}
                  />
                )}
                {se.kind === "rect" && (
                  <ValueSlider
                    label="มุมมน"
                    min={0}
                    max={Math.round(m * 2)}
                    value={Math.round((se.radius ?? 0) * 10)}
                    suffix=""
                    onChange={(v) => patchEl(se.id, { radius: v / 10 })}
                  />
                )}
              </div>
            )}
            {pop === "opacity" && (
              <ValueSlider
                label="ทึบ"
                min={10}
                max={100}
                value={Math.round((se.opacity ?? 1) * 100)}
                suffix="%"
                onChange={(v) => patchEl(se.id, { opacity: v / 100 })}
              />
            )}
            {pop === "layer" && (
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => reorder(se.id, true)} className={toolBtn}>
                  ⬆ ขึ้นบนสุด
                </button>
                <button type="button" onClick={() => reorder(se.id, false)} className={toolBtn}>
                  ⬇ ลงล่างสุด
                </button>
              </div>
            )}
          </div>
        )}
        <div
          ref={barRef}
          className="flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto rounded-2xl bg-white px-1.5 py-1 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none]"
        >
          <BarBtn title="สีพื้น" on={pop === "fill"} onClick={() => setPop((v) => (v === "fill" ? "" : "fill"))}>
            <span
              className="h-5 w-5 rounded-full ring-1 ring-stone-300"
              style={{
                background: se.fill || "repeating-linear-gradient(45deg,#fff 0 3px,#e7e5e4 3px 6px)",
              }}
            />
          </BarBtn>
          <BarBtn
            title={se.kind === "rect" ? "เส้นขอบและมุมมน" : "เส้นขอบ"}
            on={pop === "border"}
            onClick={() => setPop((v) => (v === "border" ? "" : "border"))}
          >
            <Ico n="border" />
          </BarBtn>
          <BarBtn title="ความโปร่ง" on={pop === "opacity"} onClick={() => setPop((v) => (v === "opacity" ? "" : "opacity"))}>
            <Ico n="opacity" />
          </BarBtn>
          {sep}
          <BarBtn title="หมุนซ้าย" onClick={() => patchEl(se.id, { rot: (se.rot + 270) % 360 })}>
            <Ico n="rotL" />
          </BarBtn>
          <BarBtn title="หมุนขวา" onClick={() => patchEl(se.id, { rot: (se.rot + 90) % 360 })}>
            <Ico n="rotR" />
          </BarBtn>
          <BarBtn title="จัดกึ่งกลางแนวนอน" onClick={() => patchEl(se.id, { x: W / 2 })}>
            <Ico n="center" />
          </BarBtn>
          {sep}
          <BarBtn title="ทำซ้ำ" onClick={() => duplicateEl(se.id)}>
            <Ico n="copy" />
          </BarBtn>
          <BarBtn title="ลบ (ปุ่ม Delete)" danger onClick={() => removeEl(se.id)}>
            <Ico n="trash" />
          </BarBtn>
        </div>
      </div>
    );
  }

  /**
   * 🔤 แถบข้อความแบบ Printbox (ลอยใต้ข้อความที่เลือก ไม่มีแผงข้างแล้ว)
   * แถว 1: ‹ ช่องพิมพ์ข้อความ › (สลับข้อความในหน้า) · แถว 2: ฟอนต์ · ขนาด (pt) · สี · ตัวหนา/เอียง/ขีดเส้นใต้ · จัดชิด · ชั้น · ลบ · Apply to all
   */
  function renderTextBar() {
    const te = selEl?.kind === "text" ? selEl : null;
    if (!te) return null;
    const cssW = canvasRef.current?.clientWidth ?? 0;
    const cssH = canvasRef.current?.clientHeight ?? 0;
    const ctx = canvasRef.current?.getContext("2d");
    if (!cssW || !ctx) return null;
    const r = elementBox(ctx, te);
    const { left } = barPos(r, cssW, cssH);
    const pad = Math.min(W, H) * 0.012;
    const below = ((r.y + r.h + pad) / H) * cssH + 12;
    // ใต้ข้อความไม่มีที่ (ข้อความอยู่ล่างการ์ด) = ขึ้นไปอยู่เหนือข้อความ
    const top = below + 120 > cssH + 40 ? Math.max(-8, ((r.y - pad) / H) * cssH - 120) : below;
    const texts = pageEls.filter((e) => e.kind === "text");
    const idx = texts.findIndex((e) => e.id === te.id);
    const go = (step: number) => texts.length > 1 && setSel(texts[(idx + step + texts.length) % texts.length].id);
    const PT = 72 / 25.4;
    const pt = Math.round((te.size ?? 6) * PT * 10) / 10;
    const sizes = [...new Set([6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120, pt])].sort((a, b) => a - b);
    const fontName = CAL_FONTS.find((f) => f.key === (te.font ?? "prompt"))?.name ?? te.font ?? "";
    const align = te.align ?? "center";
    const togglePop = (k: typeof pop) => setPop((v) => (v === k ? "" : k));
    const STYLE_KEYS = ["font", "size", "fill", "stroke", "bold", "italic", "underline", "align"] as const;
    const applyAll = () => {
      const st: Partial<CalElement> = {};
      for (const k of STYLE_KEYS) (st as Record<string, unknown>)[k] = te[k];
      setDesign((d) => ({ ...d, elements: (d.elements ?? []).map((e) => (e.kind === "text" && e.id !== te.id ? { ...e, ...st } : e)) }));
    };
    const box = "flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 text-sm text-stone-800";
    const alignIco = (a: string) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
        {a === "left" ? (
          <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
        ) : a === "right" ? (
          <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
        ) : (
          <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
        )}
      </svg>
    );
    const caret = <span className="text-[10px] text-stone-400">▾</span>;
    return (
      <div className="absolute z-20 w-max -translate-x-1/2" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <div ref={barRef} className="max-w-[calc(100vw-24px)] space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-2xl bg-white px-1.5 py-1.5 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200">
            <BarBtn title="ข้อความก่อนหน้า" disabled={texts.length < 2} onClick={() => go(-1)}>
              ‹
            </BarBtn>
            <textarea
              value={te.text ?? ""}
              onChange={(e) => patchEl(te.id, { text: e.target.value.slice(0, 120) })}
              rows={(te.text ?? "").split("\n").length > 1 ? 2 : 1}
              placeholder="พิมพ์ข้อความ"
              className="min-w-0 flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm leading-tight text-stone-800 sm:w-64"
              aria-label="ข้อความ"
            />
            <span className="hidden h-10 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 px-2.5 text-sm text-stone-700 sm:flex">
              <span className="max-w-[6rem] truncate">{fontName}</span>
              <span className="text-stone-400">{pt}</span>
              <span className="h-4 w-4 rounded ring-1 ring-stone-300" style={{ background: te.fill }} />
            </span>
            <BarBtn title="ข้อความถัดไป" disabled={texts.length < 2} onClick={() => go(1)}>
              ›
            </BarBtn>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-white px-1.5 py-1.5 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none]">
            <select
              value={te.font ?? "prompt"}
              onChange={(e) => patchEl(te.id, { font: e.target.value })}
              className={`${box} w-36 cursor-pointer`}
              aria-label="ฟอนต์"
            >
              {CAL_FONTS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={pt}
              onChange={(e) => patchEl(te.id, { size: Number(e.target.value) / PT })}
              className={`${box} w-20 cursor-pointer`}
              aria-label="ขนาดตัวอักษร (pt)"
            >
              {sizes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button type="button" title="สีตัวอักษร" onClick={() => togglePop("tcolor")} className={`${barBtn} ${pop === "tcolor" ? "bg-sky-50" : ""}`}>
              <span className="h-6 w-6 rounded-md ring-2 ring-stone-800 ring-offset-1" style={{ background: te.fill }} />
            </button>
            <button
              type="button"
              title="ตัวหนา / เอียง / ขีดเส้นใต้"
              onClick={() => togglePop("tstyle")}
              className={`${box} ${pop === "tstyle" ? "bg-sky-50" : ""}`}
            >
              <span className={`${te.bold ? "font-extrabold" : ""} ${te.italic ? "italic" : ""} underline`}>U</span>
              {caret}
            </button>
            <button type="button" title="จัดชิด" onClick={() => togglePop("talign")} className={`${box} ${pop === "talign" ? "bg-sky-50" : ""}`}>
              {alignIco(align)}
              {caret}
            </button>
            <BarBtn title="ลำดับชั้น (Layers)" onClick={() => setLayersOpen(true)}>
              <Ico n="layers" />
            </BarBtn>
            <BarBtn title="ลบข้อความ (ปุ่ม Delete)" danger onClick={() => removeEl(te.id)}>
              <Ico n="trash" />
            </BarBtn>
            <button
              type="button"
              onClick={applyAll}
              disabled={elements.filter((e) => e.kind === "text").length < 2}
              title="ใช้ฟอนต์/ขนาด/สี/รูปแบบนี้กับข้อความทุกช่องในงาน"
              className="h-10 shrink-0 rounded-xl bg-sky-500 px-4 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-40"
            >
              Apply to all
            </button>
          </div>
          {pop && (pop === "tcolor" || pop === "tstyle" || pop === "talign") && (
            <div className="mx-auto w-max max-w-full space-y-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200">
              {pop === "tcolor" && (
                <>
                  <p className="text-[11px] font-bold text-stone-500">สีตัวอักษร</p>
                  <Colors value={te.fill} onChange={(fill) => patchEl(te.id, { fill })} />
                  <p className="pt-1 text-[11px] font-bold text-stone-500">ขอบตัวอักษร</p>
                  <Colors value={te.stroke} onChange={(stroke) => patchEl(te.id, { stroke })} allowNone />
                </>
              )}
              {pop === "tstyle" && (
                <div className="flex gap-1">
                  {(
                    [
                      ["bold", "B", "font-extrabold", "ตัวหนา"],
                      ["italic", "I", "italic font-serif", "ตัวเอียง"],
                      ["underline", "U", "underline", "ขีดเส้นใต้"],
                    ] as const
                  ).map(([k, l, cls, name]) => (
                    <button
                      key={k}
                      type="button"
                      title={name}
                      onClick={() => patchEl(te.id, { [k]: !te[k] })}
                      className={`grid h-9 w-9 place-items-center rounded-lg text-base ${cls} ${te[k] ? "bg-stone-800 text-white" : "text-stone-700 hover:bg-stone-100"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {pop === "talign" && (
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      title={a === "left" ? "ชิดซ้าย" : a === "right" ? "ชิดขวา" : "กึ่งกลาง"}
                      onClick={() => patchEl(te.id, { align: a })}
                      className={`grid h-9 w-9 place-items-center rounded-lg ${align === a ? "bg-stone-800 text-white" : "text-stone-700 hover:bg-stone-100"}`}
                    >
                      {alignIco(a)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderPhotoBar() {
    const fr = selEl?.kind === "photo" ? selEl : null;
    const slot = !fr && slotFocus && page.photo && cur ? page.photo : null;
    if (!fr && !slot) return null;
    const cssW = canvasRef.current?.clientWidth ?? 0;
    const cssH = canvasRef.current?.clientHeight ?? 0;
    if (!cssW) return null;
    const r = fr ? { x: fr.x - fr.w / 2, y: fr.y - fr.h / 2, w: fr.w, h: fr.h } : slot!;
    // 🧰 แถบอยู่ "เหนือ" รูปแบบ Printbox (ทับขอบบนรูปได้ถ้าบนสุดของการ์ด) — เมนูย่อยกางลงล่าง
    const { left } = barPos(r, cssW, cssH);
    const top = Math.max(-8, (r.y / H) * cssH - 56);
    const frImg = fr && fr.src != null ? srcs[fr.src] : undefined;
    const has = fr ? !!frImg : true;
    const zoomNow = fr ? Math.round((fr.zoom ?? 1) * 100) : zoomPct;
    const setZoom = (v: number) => {
      if (fr) patchEl(fr.id, { zoom: clamp(v, 100, 400) / 100 });
      else editPl((pl) => scalePl(pl, clamp(v, 20, 400) / Math.max(1, zoomPct)));
    };
    const dpiNow = fr ? (frImg ? Math.round(frImg.w / (elementPhotoSize(fr, frImg).w / 25.4)) : 0) : dpi;
    // ค่าแต่งรูปของสิ่งที่เลือก (กรอบรูปอิสระ หรือรูปช่องหลักของหน้านี้)
    const ownSt = design.photos[basePage.key];
    const st = fr ?? (ownSt && ownSt.src >= 0 ? ownSt : undefined);
    const setSt = (patch: { opacity?: number; stroke?: string; strokeW?: number; radius?: number; filter?: string; flipX?: boolean }) =>
      fr ? patchEl(fr.id, patch) : editSlot(patch);
    const sep = <span className="mx-0.5 h-6 w-px shrink-0 bg-stone-200" />;
    const replace = (
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void (fr ? fillFrame(fr.id, f) : addPhoto(f));
        }}
      />
    );
    const togglePop = (k: typeof pop) => setPop((v) => (v === k ? "" : k));
    return (
      <div className="absolute z-20 w-max -translate-x-1/2" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className="flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto rounded-2xl bg-white px-1.5 py-1 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none]"
        >
          {fr && frImg && (
            <BarBtn title="เอารูปออกจากกรอบ" onClick={() => patchEl(fr.id, { src: undefined, zoom: 1, ox: 0, oy: 0 })}>
              <Ico n="imageOff" />
            </BarBtn>
          )}
          {!fr && !isCover && own && (
            <BarBtn
              title="เอารูปออก (กลับไปใช้รูปหน้าปก)"
              onClick={() =>
                setDesign((d) => {
                  const photos = { ...d.photos };
                  delete photos[basePage.key];
                  return { ...d, photos };
                })
              }
            >
              <Ico n="imageOff" />
            </BarBtn>
          )}
          <label className={barBtn} title={fr && !frImg ? "ใส่รูป" : "เปลี่ยนรูป"}>
            <Ico n="replace" />
            {replace}
          </label>
          {has && (
            <>
              <BarBtn title="ซูมเข้า" onClick={() => setZoom(zoomNow + 10)}>
                <Ico n="zoomIn" />
              </BarBtn>
              <BarBtn title="ซูมออก" disabled={fr ? zoomNow <= 100 : zoomNow <= 20} onClick={() => setZoom(zoomNow - 10)}>
                <Ico n="zoomOut" />
              </BarBtn>
              <BarBtn
                title={fr ? "รูปเต็มกรอบ" : "รูปเต็มช่อง"}
                onClick={() => (fr ? patchEl(fr.id, { zoom: 1, ox: 0, oy: 0 }) : curSrc && page.photo && editPl(() => coverPlacement(page.photo!, curSrc)))}
              >
                <Ico n="fit" />
              </BarBtn>
              <BarBtn
                title="หมุนซ้าย"
                onClick={() => (fr ? patchEl(fr.id, { rot: (fr.rot + 270) % 360 }) : editPl((pl) => ({ ...pl, rotDeg: (pl.rotDeg + 270) % 360 })))}
              >
                <Ico n="rotL" />
              </BarBtn>
              <BarBtn
                title="หมุนขวา"
                onClick={() => (fr ? patchEl(fr.id, { rot: (fr.rot + 90) % 360 }) : editPl((pl) => ({ ...pl, rotDeg: (pl.rotDeg + 90) % 360 })))}
              >
                <Ico n="rotR" />
              </BarBtn>
              <BarBtn title="กลับด้านซ้าย-ขวา" on={!!st?.flipX} onClick={() => setSt({ flipX: !st?.flipX })}>
                <Ico n="flip" />
              </BarBtn>
              <BarBtn title="ความโปร่ง" on={pop === "opacity"} onClick={() => togglePop("opacity")}>
                <Ico n="opacity" />
              </BarBtn>
              {sep}
              <div className="flex shrink-0 items-center rounded-xl ring-1 ring-stone-200">
                <button type="button" onClick={() => setZoom(zoomNow - 10)} className="px-1.5 py-1 text-stone-500 hover:text-stone-800" aria-label="ซูมออก">
                  −
                </button>
                <span className="w-11 text-center text-[11px] font-bold tabular-nums text-stone-700">{zoomNow}%</span>
                <button type="button" onClick={() => setZoom(zoomNow + 10)} className="px-1.5 py-1 text-stone-500 hover:text-stone-800" aria-label="ซูมเข้า">
                  ＋
                </button>
              </div>
              {sep}
              <BarBtn title={fr ? "ขอบและมุมมน" : "ขอบ · มุมมน · ขนาดช่อง"} on={pop === "border"} onClick={() => togglePop("border")}>
                <Ico n="border" />
              </BarBtn>
              <BarBtn title="เอฟเฟกต์รูป" on={pop === "filter" || !!st?.filter} onClick={() => togglePop("filter")}>
                <Ico n="magic" />
              </BarBtn>
            </>
          )}
          {fr && (
            <>
              <BarBtn title="ทำซ้ำ" onClick={() => duplicateEl(fr.id)}>
                <Ico n="copy" />
              </BarBtn>
              <BarBtn title="ลบกรอบ (ปุ่ม Delete)" danger onClick={() => removeEl(fr.id)}>
                <Ico n="trash" />
              </BarBtn>
            </>
          )}
          {slot && (
            <BarBtn title="ลบรูป (ปุ่ม Delete)" danger onClick={removeSlotPhoto}>
              <Ico n="trash" />
            </BarBtn>
          )}
          {dpiNow > 0 && (
            <span
              title="ความคมชัดตอนพิมพ์"
              className={`ml-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${dpiNow < DPI_WARN ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}
            >
              {dpiNow < DPI_WARN ? "⚠" : "✓"} {dpiNow}dpi
            </span>
          )}
        </div>
        {/* เมนูย่อย — กางลงใต้แถบ */}
        {pop && (
          <div className="absolute left-1/2 top-full mt-2 w-64 -translate-x-1/2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200">
            {pop === "opacity" && (
              <ValueSlider
                label="ทึบ"
                min={10}
                max={100}
                value={Math.round((st?.opacity ?? 1) * 100)}
                suffix="%"
                onChange={(v) => setSt({ opacity: v / 100 })}
              />
            )}
            {pop === "border" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] font-bold text-stone-500">ขอบ</span>
                  <MiniColors value={st?.stroke ?? ""} onChange={(stroke) => setSt({ stroke, strokeW: st?.strokeW || Math.min(W, H) * 0.012 })} />
                </div>
                {st?.stroke && (
                  <ValueSlider
                    label="หนา"
                    min={2}
                    max={Math.round(Math.min(W, H) * 0.4)}
                    value={Math.round((st.strokeW ?? 0) * 10)}
                    suffix=""
                    onChange={(v) => setSt({ strokeW: v / 10 })}
                  />
                )}
                <ValueSlider
                  label="มุมมน"
                  min={0}
                  max={Math.round(Math.min(W, H) * 2.5)}
                  value={Math.round((st?.radius ?? 0) * 10)}
                  suffix=""
                  onChange={(v) => setSt({ radius: v / 10 })}
                />
                {slot && design.slots?.[page.key] && (
                  <button type="button" onClick={() => setSlot(undefined)} className={`${toolBtn} w-full`}>
                    ↺ ช่องรูปขนาดเดิม (ตามเลย์เอาต์)
                  </button>
                )}
              </div>
            )}
            {pop === "filter" && (
              <div className="grid grid-cols-4 gap-1.5">
                {CAL_FILTERS.map((f) => (
                  <button
                    key={f.key || "none"}
                    type="button"
                    onClick={() => setSt({ filter: f.key || undefined })}
                    className={`flex flex-col items-center gap-1 rounded-xl p-1 text-[10px] font-bold transition ${
                      (st?.filter ?? "") === f.key ? "bg-sky-50 text-sky-800 ring-2 ring-sky-400" : "text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-300 via-rose-400 to-sky-500" style={{ filter: f.css }} />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {fr && frImg && (fr.zoom ?? 1) > 1 && !pop && (
          <div className="mt-1 flex flex-col items-center gap-1">
            <p className="text-center text-[10px] text-stone-400">ซูมอยู่ — ลากจุดในแป้นเพื่อเลือกส่วนของรูป</p>
            <FocusPad x={fr.ox ?? 0} y={fr.oy ?? 0} onChange={(ox, oy) => patchEl(fr.id, { ox, oy })} />
          </div>
        )}
      </div>
    );
  }

  if (!open) return null;

  const aspect = W / H;
  const multi = vpages.length > 1;
  const coverIdx = coverPage ? fmt.pages.indexOf(coverPage) : -1;
  const m = Math.min(W, H);

  /** ปุ่มในแถบเครื่องมือแนวตั้ง (แบบ Printbox) */
  const TOOLS: {
    key: Tool | "rect" | "ellipse" | "layers";
    icon: string;
    label: string;
    on: boolean;
    disabled?: boolean;
  }[] = [
    { key: "text", icon: "A+", label: "Text", on: tool === "text" },
    { key: "photo", icon: "🖼", label: "Photo", on: tool === "photo" },
    {
      key: "layout",
      icon: "⟲",
      label: "Layout",
      on: tool === "layout",
      disabled: !layouts.length,
    },
    // Rectangle / Ellipse ถอดออกจากแถบ (ผู้ใช้สั่ง 13 ต.ค. 69) — รูปทรงในแบบเก่ายังวาด/แตะแก้ได้ตามเดิม
    { key: "calendar", icon: "A̲", label: "Calendar", on: tool === "calendar" },
    { key: "events", icon: "📅", label: "Events", on: tool === "events" },
    { key: "settings", icon: "⚙", label: "Settings", on: tool === "settings" },
    { key: "layers", icon: "🗂", label: "Layers", on: layersOpen },
  ];
  function onTool(k: (typeof TOOLS)[number]["key"]) {
    if (k === "layers") return setLayersOpen((v) => !v);
    // ใบที่ยังเหมือนใบแรก: เปิดแผงได้ แต่ไม่เพิ่มชิ้นส่วนลงใบแรกแบบไม่รู้ตัว
    if (locked && (k === "rect" || k === "ellipse" || k === "text")) return setTool(k === "text" ? "text" : "shape");
    if (k === "rect" || k === "ellipse") return addEl(k);
    if (k === "photo") return locked ? setTool("photo") : addEmptyFrame();
    if (k === "text") {
      // กดซ้ำตอนแผงข้อความเปิดอยู่ = เพิ่มกล่องใหม่ · ครั้งแรก = เพิ่มกล่อง (หน้านี้ยังไม่มี) หรือเปิดแผง
      if (tool === "text" || !pageEls.some((e) => e.kind === "text")) return addEl("text");
      const firstText = pageEls.find((e) => e.kind === "text");
      setSel(firstText?.id ?? null);
      return setTool("text");
    }
    setSel(null);
    setTool((t) => (t === k ? null : k));
  }

  return (
    // z-[130]: เหนือแถบราคาล่าง (z-91) และปุ่มลอยของหน้าสินค้า — ไม่งั้นทับปุ่ม "ใช้แบบนี้"
    <div className="fixed inset-0 z-[130] flex flex-col justify-center bg-stone-900/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative mx-auto flex h-full max-h-full w-full max-w-[min(98vw,1800px)] flex-col overflow-hidden bg-white sm:my-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl sm:shadow-2xl">
        {/* หัว: ซ้าย = Undo · Redo · History · Project · กลาง = ชื่องาน · ขวา = ✓ ใช้แบบนี้ + ปิด (แบบ Printbox) */}
        <div className="relative z-40 flex items-center gap-1 border-b border-stone-100 px-2 py-1.5 sm:gap-2 sm:px-3">
          <div className="flex shrink-0 items-center">
            <HeadBtn label="Undo" title="ย้อน (⌘/Ctrl+Z)" disabled={!canUndo} onClick={undo}>
              <HIco n="undo" />
            </HeadBtn>
            <HeadBtn label="Redo" title="ทำซ้ำ (⌘/Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
              <HIco n="redo" />
            </HeadBtn>
            <div className="relative">
              <HeadBtn
                label="History"
                title="ประวัติการแก้ไข"
                on={headPop === "history"}
                onClick={() => {
                  commitHist();
                  setHeadPop((v) => (v === "history" ? "" : "history"));
                }}
              >
                <HIco n="history" />
              </HeadBtn>
              {headPop === "history" &&
                (() => {
                  const h = hist.current;
                  const line = [...h.past, ...(h.committed ? [h.committed] : []), ...[...h.future].reverse()];
                  const curI = h.past.length;
                  return (
                    <div className="absolute left-0 top-full mt-1 max-h-80 w-64 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-200">
                      <p className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-stone-400">ประวัติการแก้ไข · แตะเพื่อย้อนไปขั้นนั้น</p>
                      {[...line].reverse().map((sn, ri) => {
                        const i = line.length - 1 - ri;
                        const t = new Date(sn.at);
                        return (
                          <button
                            key={`${sn.at}-${i}`}
                            type="button"
                            onClick={() => {
                              stepHist(i - curI);
                              setHeadPop("");
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                              i === curI
                                ? "bg-sky-50 font-extrabold text-sky-800"
                                : i > curI
                                  ? "text-stone-400 hover:bg-stone-50"
                                  : "text-stone-700 hover:bg-stone-50"
                            }`}
                          >
                            <span className="truncate">
                              {i === curI ? "● " : ""}
                              {sn.label}
                            </span>
                            <span className="shrink-0 tabular-nums text-[10.5px] text-stone-400">
                              {String(t.getHours()).padStart(2, "0")}:{String(t.getMinutes()).padStart(2, "0")}:{String(t.getSeconds()).padStart(2, "0")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
            <div className="relative">
              <HeadBtn label="Project" title="ข้อมูลงาน" on={headPop === "project"} onClick={() => setHeadPop((v) => (v === "project" ? "" : "project"))}>
                <HIco n="project" />
              </HeadBtn>
              {headPop === "project" && (
                <div className="absolute left-0 top-full mt-1 w-72 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200">
                  <p className="text-xs font-extrabold text-stone-800">{title}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-stone-400">รูปแบบ</dt>
                    <dd className="text-stone-700">{fmt.name}</dd>
                    <dt className="text-stone-400">ปีปฏิทิน</dt>
                    <dd className="text-stone-700">
                      {back.year} (พ.ศ. {back.year + 543}) — เปลี่ยนที่หน้าสินค้า
                    </dd>
                    <dt className="text-stone-400">จำนวน</dt>
                    <dd className="text-stone-700">
                      {copies > 1 ? `${copies} ใบ/ชุด${custom.length ? ` · แยกแบบ ${custom.length} ใบ` : ""}` : `${fmt.pages.length} หน้า`}
                    </dd>
                    <dt className="text-stone-400">ขนาดงาน</dt>
                    <dd className="text-stone-700">
                      {Math.round(fmt.trimW) / 10} × {Math.round(fmt.trimH) / 10} ซม. + ตัดตก {fmt.bleed} มม. · {fmt.dpi} DPI
                    </dd>
                    <dt className="text-stone-400">รูปที่อัป</dt>
                    <dd className="text-stone-700">{srcs.filter((x) => !x.removed).length} รูป</dd>
                    <dt className="text-stone-400">ชิ้นส่วน</dt>
                    <dd className="text-stone-700">
                      {(["text", "photo", "rect", "ellipse"] as const)
                        .map((k) => [KIND_TH[k], elements.filter((e) => e.kind === k).length] as const)
                        .filter(([, n]) => n)
                        .map(([nm, n]) => `${nm} ${n}`)
                        .join(" · ") || "—"}
                    </dd>
                  </dl>
                  <div className="mt-3 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTool("calendar");
                        setHeadPop("");
                      }}
                      className={toolBtn}
                    >
                      🗓 ตั้งค่าปฏิทิน
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeadPop("");
                        setAsk({
                          icon: "↺",
                          title: "เริ่มใหม่ทั้งหมด?",
                          body: "ล้างแบบทั้งหมด — รูปที่อัปไว้ยังอยู่ในคลัง · กด Undo ย้อนกลับได้",
                          ok: "ล้างแล้วเริ่มใหม่",
                          danger: true,
                          run: () => {
                            setDesign({
                              bg: "#ffffff",
                              text: null,
                              photos: {},
                              elements: [],
                            });
                            setSel(null);
                          },
                        });
                      }}
                      className={`${toolBtn} bg-rose-50 text-rose-600 hover:bg-rose-100`}
                    >
                      ↺ เริ่มใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 text-center md:block">
            <p className="truncate text-sm font-extrabold text-stone-800">🗓 สร้างปฏิทิน</p>
            <p className="truncate text-[11px] text-stone-500">
              {title} · {fmt.name} · ปี {back.year} · {copies > 1 ? `${copies} ใบ/ชุด` : `${fmt.pages.length} หน้า`}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
            {copies > 1 && (
              <button
                type="button"
                onClick={() => setAskMode(true)}
                title="รูปแบบการพิมพ์ · ค่าคละลาย"
                className={`flex flex-col items-end rounded-xl px-2.5 py-1 text-right leading-tight ring-1 transition hover:brightness-95 ${
                  feeNow > 0 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                }`}
              >
                <span className="text-[11px] font-extrabold">{mixMode ? `🎨 คละ ${designN} ลาย (${designN} รูป)` : "🖼 ลายเดียว"}</span>
                <span className="text-[10.5px] font-bold">{feeNow > 0 ? `ค่าคละ +${formatBaht(feeNow)}` : "ไม่มีค่าคละ"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                orderAfter.current = false;
                void apply();
              }}
              disabled={!!busy}
              title="บันทึกแบบแล้วกลับไปหน้าสินค้า (ยังไม่ใส่ตะกร้า)"
              className={
                onOrder
                  ? "rounded-full px-3 py-2.5 text-sm font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
                  : "rounded-full bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6"
              }
            >
              {busy && !onOrder ? busy : "✓ ใช้แบบนี้"}
            </button>
            {onOrder && (
              <button
                type="button"
                onClick={() => {
                  orderAfter.current = true;
                  void apply();
                }}
                disabled={!!busy}
                title="บันทึกแบบแล้วใส่ตะกร้าเลย"
                className="flex flex-col items-center rounded-2xl bg-sky-600 px-4 py-1.5 leading-tight text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
              >
                <span className="text-sm font-extrabold">{busy || "🛒 ใส่ตะกร้า"}</span>
                {!busy && price && (
                  <span className="text-[11px] font-bold text-sky-100">
                    {formatBaht(price(designN))}
                    {qty ? ` · ${qty.toLocaleString("th-TH")} ${unit ?? ""}` : ""}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="ปิด (ไม่บันทึก)"
              className="grid h-10 w-10 place-items-center rounded-full text-lg font-bold text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            >
              ✕
            </button>
          </div>
        </div>
        {err && (
          <div className="flex items-center justify-between gap-2 bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-700">
            <span>{err}</span>
            <button type="button" onClick={() => setErr("")} className="text-rose-400 hover:text-rose-700" aria-label="ปิดข้อความ">
              ✕
            </button>
          </div>
        )}
        {headPop && <div className="fixed inset-0 z-30" onClick={() => setHeadPop("")} aria-hidden="true" />}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
          {/* 📚 คลังรูป (ซ้าย แบบ Printbox) — เลือกที่จะใส่ · อัป/ลากรูป · รูปที่อัปไว้ (แตะ = ใส่ · ลากไปวางบนภาพได้) */}
          {!locked &&
            tool === "photo" &&
            (() => {
              const frames = pageEls.filter((e) => e.kind === "photo");
              const fr = selEl?.kind === "photo" ? selEl : null;
              const frImg = fr && fr.src != null ? srcs[fr.src] : undefined;
              const slotOn = !fr && !!page.photo;
              const activeSrc = fr ? fr.src : slotOn ? (own ? own.src : slotSrc(design, imgs)) : undefined;
              const chip = (on: boolean) =>
                `rounded-full px-2.5 py-1 text-[11px] font-bold transition ${on ? "bg-sky-600 text-white shadow-sm" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"}`;
              return (
                <aside className="order-1 w-full shrink-0 space-y-3 border-t border-stone-100 bg-stone-50/60 p-3 sm:order-none sm:w-60 sm:overflow-y-auto sm:border-r sm:border-t-0">
                  {copies > 1 && vcur.card > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] ring-1 ring-sky-100">
                      <span className="font-bold text-sky-900">ใบที่ {vcur.card + 1} · แยกแบบเอง</span>
                      <button type="button" onClick={() => resetCard(vcur.card)} className="font-bold text-stone-500">
                        ↺ เหมือนใบที่ 1
                      </button>
                    </div>
                  )}
                  <p className="text-xs font-extrabold text-stone-700">รูปของคุณ</p>
                  <div>
                    <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-stone-400">ใส่รูปลง</p>
                    <div className="flex flex-wrap gap-1">
                      {page.photo && (
                        <button type="button" onClick={() => setSel(null)} className={chip(slotOn)}>
                          ช่องรูปหลัก
                        </button>
                      )}
                      {frames.map((e, n) => (
                        <button key={e.id} type="button" onClick={() => setSel(e.id)} className={chip(fr?.id === e.id)}>
                          กรอบ {n + 1}
                          {e.src == null || !srcs[e.src] ? " · ว่าง" : ""}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={addEmptyFrame}
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50"
                      >
                        ＋ กรอบ
                      </button>
                    </div>
                  </div>
                  <label
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes("Files")) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "copy";
                      setFreeDrop(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFreeDrop(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFreeDrop(false);
                      void uploadToTarget([...(e.dataTransfer.files ?? [])]);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-3 py-4 text-center transition ${
                      freeDrop ? "border-sky-400 bg-sky-50" : "border-stone-300 bg-white hover:border-sky-300 hover:bg-sky-50/50"
                    }`}
                  >
                    <span className="text-2xl leading-none">{freeDrop ? "⬇️" : "🖼"}</span>
                    <span className="text-xs font-extrabold text-stone-700">
                      {freeDrop
                        ? "ปล่อยรูปตรงนี้"
                        : fr
                          ? frImg
                            ? "เปลี่ยนรูปในกรอบนี้"
                            : "ใส่รูปในกรอบนี้"
                          : slotOn
                            ? cur
                              ? "เปลี่ยนรูปช่องหลัก"
                              : "ใส่รูปช่องหลัก"
                            : "เพิ่มรูปในหน้านี้"}
                    </span>
                    <span className="text-[10.5px] text-stone-400">แตะเพื่อเลือก · ลากไฟล์มาวาง · หลายรูปได้</span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const files = [...(e.target.files ?? [])];
                        e.target.value = "";
                        void uploadToTarget(files);
                      }}
                    />
                  </label>
                  {srcs.some((x) => !x.removed) && (
                    <div>
                      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-stone-400">รูปที่อัปไว้ · แตะ หรือลากไปวางบนภาพ</p>
                      {mixMode && (
                        <p className="mb-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10.5px] leading-snug text-amber-800">
                          คละลายนับจากรูปในคลัง: {libCount} รูป = คละ {designN} ลาย
                          {unusedSrcs.length ? ` · ยังไม่ได้ใช้ ${unusedSrcs.length} รูป (กด ✕ ลบได้)` : ""}
                        </p>
                      )}
                      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3">
                        {srcs.map((s0, i) =>
                          s0.removed ? null : (
                            <div key={s0.url} className="group relative">
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/x-cal-src", String(i));
                                  e.dataTransfer.effectAllowed = "copy";
                                }}
                                onClick={() => putIntoTarget(i)}
                                className={`aspect-square overflow-hidden rounded-lg ring-2 transition ${activeSrc === i ? "ring-sky-500" : "ring-transparent hover:ring-stone-300"}`}
                              >
                                <img src={s0.url} alt="" className="block h-full w-full object-cover" draggable={false} />
                              </button>
                              <button
                                type="button"
                                title="ลบรูปนี้"
                                aria-label="ลบรูปนี้"
                                onClick={() => removeSrc(i)}
                                className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-stone-500 shadow ring-1 ring-stone-200 transition hover:bg-rose-500 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              >
                                ✕
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </aside>
              );
            })()}
          {/* เวที */}
          <div
            ref={stageRef}
            className={`relative flex min-h-0 min-w-0 shrink-0 flex-col items-center justify-center gap-2 p-3 transition sm:flex-1 sm:p-5 ${dropOn ? "bg-sky-50" : "bg-stone-100"}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes("text/x-cal-src")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropOn(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(false);
            }}
            onDrop={(e) => {
              const srcI = e.dataTransfer.getData("text/x-cal-src");
              if (srcI !== "") {
                e.preventDefault();
                setDropOn(false);
                return dropSrcOnStage(Number(srcI), e.clientX, e.clientY);
              }
              if (!e.dataTransfer.files?.length) return;
              e.preventDefault();
              e.stopPropagation();
              setDropOn(false);
              void dropOnStage([...e.dataTransfer.files], e.clientX, e.clientY);
            }}
          >
            <div
              className="relative w-full"
              style={{
                // เต็มพื้นที่เวทีตามจอ: จำกัดทั้งกว้างและสูง (เผื่อแถบเครื่องมือลอยใต้รูป ~64px + บรรทัดไกด์)
                maxWidth:
                  stageBox.w && stageBox.h && stageBox.w >= 640
                    ? `${Math.max(240, Math.min(stageBox.w - 48, (stageBox.h - 110) * aspect))}px`
                    : `min(100%, ${aspect * 60}vh)`,
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`block w-full touch-none select-none bg-white shadow-[0_2px_14px_rgba(28,25,23,.18)]`}
                style={{ aspectRatio: `${W} / ${H}` }}
              />
              {!locked && tool === "photo" && renderPhotoBar()}
              {!locked && tool === "text" && renderTextBar()}
              {!locked && tool === "shape" && renderShapeBar()}
              {!locked && renderGridBar()}
              {locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/35">
                  <div className="rounded-2xl bg-white/95 px-4 py-3 text-center shadow-lg ring-1 ring-stone-200">
                    <p className="text-sm font-extrabold text-stone-800">ใบที่ {vcur.card + 1} เหมือนใบที่ 1</p>
                    <p className="mt-0.5 text-[11px] text-stone-500">แก้ใบที่ 1 = ทุกใบเปลี่ยนตาม · อยากให้ใบนี้ต่างออกไป กดด้านล่าง</p>
                    <button
                      type="button"
                      onClick={() => customizeCard(vcur.card)}
                      className="mt-2 rounded-full bg-sky-600 px-4 py-2 text-xs font-extrabold text-white shadow hover:bg-sky-700"
                    >
                      ✏️ ออกแบบใบนี้แยก
                    </button>
                  </div>
                </div>
              )}
              {/* ช่องรูปที่ยังว่าง: วาดสีเทา "Drag here" ในแคนวาสแล้ว (ไม่บังกรอบรูป/ข้อความที่วางทับ) — แตะช่องว่าง = เปิดเลือกไฟล์ */}
              <input
                ref={slotInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void addPhoto(f);
                }}
              />
            </div>
            {tool === "calendar" && renderCalendarPopup()}
            {tool === "events" && renderEventsPopup()}
            {tool === "settings" && draft && renderSettingsPopup(draft)}
            {layersOpen && renderLayersPopup()}
            <p className="text-center text-[10.5px] leading-tight text-stone-400">
              <span className="text-rose-500">{guideImg ? "—" : "- - -"}</span> เส้นตัด
              {guideImg && guide?.name ? ` · 📐 เทมเพลต ${guide.name}` : ""}
              {fmt.note ? ` · ${fmt.note}` : ""}
            </p>
          </div>

          {/* แผงตามปุ่มที่เลือก — Photo/รูปทรง ไม่มีแผงขวา (เครื่องมืออยู่บนภาพ) · Calendar/Events/Settings = หน้าต่างเด้งบนเวที */}
          {tool && (locked ? tool === "photo" || tool === "text" || tool === "shape" || tool === "layout" : tool === "layout") && (
            <div className="order-2 w-full shrink-0 space-y-3 border-t border-stone-100 bg-white p-3 sm:order-none sm:w-64 sm:overflow-y-auto sm:border-l sm:border-t-0">
              {copies > 1 && vcur.card > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] ring-1 ring-sky-100">
                  <span className="font-bold text-sky-900">
                    ใบที่ {vcur.card + 1} · {locked ? "เหมือนใบที่ 1" : "แยกแบบเอง"}
                  </span>
                  {locked ? (
                    <button type="button" onClick={() => customizeCard(vcur.card)} className="font-extrabold text-sky-700">
                      ✏️ แยกแบบ
                    </button>
                  ) : (
                    <button type="button" onClick={() => resetCard(vcur.card)} className="font-bold text-stone-500">
                      ↺ กลับไปเหมือนใบที่ 1
                    </button>
                  )}
                </div>
              )}
              {locked && (tool === "photo" || tool === "text" || tool === "shape" || tool === "layout") && (
                <p className="rounded-xl bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
                  ใบนี้ยังเหมือนใบที่ 1 — กด ✏️ แยกแบบ ก่อนแก้รูป/ข้อความ/รูปทรงของใบนี้ หรือไปแก้ที่ใบที่ 1 (ทุกใบเปลี่ยนตาม)
                </p>
              )}
              {!locked && tool === "text" && (
                <>
                  <Section
                    title={`Text · ${basePage.name}`}
                    right={
                      <button type="button" onClick={() => addEl("text")} className="text-[11px] font-bold text-sky-700">
                        ＋ เพิ่มข้อความ
                      </button>
                    }
                  >
                    {pageEls.filter((e) => e.kind === "text").length > 1 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {pageEls
                          .filter((e) => e.kind === "text")
                          .map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setSel(e.id)}
                              className={`max-w-[8rem] truncate rounded-full px-2 py-0.5 text-[11px] font-bold ${sel === e.id ? "bg-sky-600 text-white" : "bg-stone-100 text-stone-600"}`}
                            >
                              {e.text?.trim() || "(ว่าง)"}
                            </button>
                          ))}
                      </div>
                    )}
                    {selEl?.kind === "text" ? (
                      <div className="space-y-2">
                        <textarea
                          value={selEl.text ?? ""}
                          onChange={(e) =>
                            patchEl(selEl.id, {
                              text: e.target.value.slice(0, 120),
                            })
                          }
                          rows={2}
                          className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
                          placeholder="พิมพ์ข้อความ"
                        />
                        <FontSelect value={selEl.font ?? "prompt"} onChange={(font) => patchEl(selEl.id, { font })} />
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-stone-500">ขนาด</span>
                          <input
                            type="range"
                            min={Math.max(1.5, m * 0.02)}
                            max={m * 0.35}
                            step={m / 300}
                            value={selEl.size ?? 6}
                            onChange={(e) =>
                              patchEl(selEl.id, {
                                size: Number(e.target.value),
                              })
                            }
                            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
                            aria-label="ขนาดตัวอักษร"
                          />
                          <button
                            type="button"
                            onClick={() => patchEl(selEl.id, { bold: !selEl.bold })}
                            className={`${toolBtn} ${selEl.bold ? "bg-stone-800 text-white hover:bg-stone-700" : ""}`}
                          >
                            B
                          </button>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-bold text-stone-500">สีตัวอักษร</p>
                          <Colors value={selEl.fill} onChange={(fill) => patchEl(selEl.id, { fill })} />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-bold text-stone-500">ขอบตัวอักษร</p>
                          <Colors value={selEl.stroke} onChange={(stroke) => patchEl(selEl.id, { stroke })} allowNone />
                        </div>
                        <ElActions
                          onCenter={() =>
                            patchEl(selEl.id, {
                              x:
                                page.photo && selEl.page === basePage.key && inRect({ x: selEl.x, y: selEl.y }, page.photo)
                                  ? page.photo.x + page.photo.w / 2
                                  : W / 2,
                            })
                          }
                          onRotate={() => patchEl(selEl.id, { rot: (selEl.rot + 90) % 360 })}
                          onTop={() => reorder(selEl.id, true)}
                          onBottom={() => reorder(selEl.id, false)}
                          onDelete={() => removeEl(selEl.id)}
                        />
                        <p className="text-[10.5px] text-stone-400">ลากข้อความบนภาพเพื่อย้าย · ปุ่ม Delete เพื่อลบ</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-stone-400">แตะข้อความบนภาพเพื่อแก้ หรือกด ＋ เพิ่มข้อความ</p>
                    )}
                  </Section>
                </>
              )}

              {!locked && tool === "layout" && (
                <Section title={`Layout · ${basePage.name}`}>
                  {layouts.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {layouts.map((l) => (
                        <LayoutCard
                          key={l.key}
                          name={l.name}
                          on={(design.layouts?.[basePage.key] ?? "") === l.key}
                          page={pageWithLayout(fmt, basePage, l.key)}
                          W={W}
                          H={H}
                          onClick={() => setLayout(l.key)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-500">หน้านี้มีเลย์เอาต์เดียว</p>
                  )}
                </Section>
              )}
            </div>
          )}

          {/* แถบเครื่องมือแนวตั้ง (มือถือ = แถวแนวนอนใต้ภาพ) */}
          <div className="order-first flex shrink-0 gap-1 overflow-x-auto border-t border-stone-100 bg-white px-2 py-1.5 sm:order-none sm:w-[76px] sm:flex-col sm:overflow-y-auto sm:border-l sm:border-t-0 sm:px-1.5 sm:py-3">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={t.disabled}
                onClick={() => onTool(t.key)}
                className={`flex min-w-[58px] flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                  t.on ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span className="text-lg font-bold leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* รูปย่อทุกหน้า (แบบ Printbox — หน้าเดียวก็โชว์ ให้เห็นภาพรวมทั้งใบ) */}
        {
          <div className="flex shrink-0 items-end gap-2 overflow-x-auto border-t border-stone-200 bg-stone-50 px-3 py-2 [scrollbar-width:thin]">
            {copies > 1 && (
              <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-1 self-stretch bg-stone-50 pr-2">
                <span className="text-[10.5px] font-bold text-stone-500">รูปแบบการพิมพ์</span>
                <select
                  value={mixMode ? "mix" : "single"}
                  onChange={(e) => chooseMode(e.target.value === "mix")}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-bold text-stone-800"
                  aria-label="รูปแบบการพิมพ์"
                >
                  <option value="single">ลายเดียว</option>
                  <option value="mix">คละลาย</option>
                </select>
                <span className="text-[10px] text-stone-400">{mixMode ? `${copies} ใบ · ใช้ ${designN} รูป` : `พิมพ์เหมือนกัน ${copies} ใบ`}</span>
              </div>
            )}
            {vpages.map((v, i) =>
              !mixMode && v.card > 0 ? null : (
                <button
                  key={v.page.key}
                  type="button"
                  onClick={() => setPageIdx(i)}
                  className={`relative flex shrink-0 flex-col items-center gap-1 ${
                    // เว้นช่องระหว่างใบ (ใบละหลายหน้า) ให้เห็นว่าหน้าไหนเป็นของใบเดียวกัน
                    (fmt.perCard ?? 1) > 1 && i > 0 && i % (fmt.perCard ?? 1) === 0 ? "ml-3" : ""
                  }`}
                  title={vname(v)}
                >
                  <canvas
                    ref={(el) => {
                      thumbRefs.current[i] = el;
                    }}
                    className={`${fmt.cornerR ? "rounded-[5px] bg-white/0" : fmt.cornerR === 0 ? "bg-white/0" : "bg-white"} shadow-sm transition ${i === pageIdx ? "ring-[3px] ring-sky-400" : "ring-1 ring-stone-300 hover:ring-stone-400"} ${
                      v.card > 0 && !custom.includes(v.card) ? "opacity-60" : ""
                    }`}
                    style={{
                      width: W >= H ? 120 : 80,
                      aspectRatio: `${W} / ${H}`,
                    }}
                  />
                  {v.card > 0 && custom.includes(v.card) && (
                    <span className="absolute right-1 top-1 rounded-full bg-sky-600 px-1.5 text-[9px] font-bold text-white">แยกแบบ</span>
                  )}
                  <span className={`max-w-[120px] truncate text-[10.5px] ${i === pageIdx ? "font-extrabold text-stone-800" : "font-semibold text-stone-500"}`}>
                    {vname(v)}
                    {copies === 1 && (design.photos[v.page.key]?.src ?? -1) >= 0 && v.j !== coverIdx ? " 🖼" : ""}
                    {!mixMode && copies > 1 ? ` × ${copies} ใบ` : ""}
                  </span>
                </button>
              ),
            )}
          </div>
        }

        {askMode && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-stone-900/45 p-4">
            <div className="relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
              {!askModeFirst.current && (
                <button
                  type="button"
                  onClick={() => setAskMode(false)}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-lg text-stone-400 hover:bg-stone-100"
                  aria-label="ปิด"
                >
                  ✕
                </button>
              )}
              <h3 className="text-lg font-extrabold text-stone-800">รูปแบบการพิมพ์</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {fmt.name} · ชุดละ {copies} ใบ — เปลี่ยนทีหลังได้ที่แถบรูปย่อด้านล่าง
              </p>
              {mixFee && (
                <p className="mt-1 text-[11px] text-stone-400">
                  ค่าคละลายคิดตามเงื่อนไขของสินค้า
                  {qty ? ` · สั่งอยู่ ${qty.toLocaleString("th-TH")} ${unit ?? "ชุด"}` : ""} (เปลี่ยนจำนวนที่หน้าสินค้า ค่าคละปรับตาม)
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    mix: false,
                    name: "ลายเดียว",
                    icon: "🖼",
                    desc: `ออกแบบครั้งเดียว พิมพ์เหมือนกันทั้ง ${copies} ใบ`,
                    fee: feeOf(1),
                  },
                  {
                    mix: true,
                    name: "คละลาย",
                    icon: "🎨",
                    desc: `ออกแบบแต่ละใบไม่เหมือนกันได้ (ทั้ง ${copies} ใบ) · นับลายตามจำนวนรูปที่ใช้`,
                    fee: -1,
                  },
                ].map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => chooseMode(o.mix)}
                    className={`flex flex-col items-start gap-1 rounded-2xl p-4 text-left ring-1 transition hover:bg-sky-50 hover:ring-2 hover:ring-sky-400 ${
                      !askModeFirst.current && mixMode === o.mix ? "bg-sky-50 ring-2 ring-sky-500" : "ring-stone-200"
                    }`}
                  >
                    <span className="text-3xl" aria-hidden>
                      {o.icon}
                    </span>
                    <span className="text-base font-extrabold text-stone-800">{o.name}</span>
                    <span className="text-xs leading-relaxed text-stone-500">{o.desc}</span>
                    {o.fee < 0 ? (
                      <span className="mt-1 text-[11px] font-bold leading-relaxed text-amber-800">
                        {[2, 3, 5]
                          .filter((n) => n <= copies)
                          .map((n) => `${n} รูป ${feeOf(n) > 0 ? `+${formatBaht(feeOf(n))}` : "ไม่มีค่าคละ"}`)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span
                        className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${o.fee > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}
                      >
                        {o.fee > 0 ? `ค่าคละลาย +${formatBaht(o.fee)}` : "ไม่มีค่าคละ"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {ask && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/45 p-4 backdrop-blur-[2px]" onClick={() => setAsk(null)}>
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-label={ask.title}
            >
              <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl ${ask.danger ? "bg-rose-50" : "bg-sky-50"}`} aria-hidden>
                {ask.icon}
              </div>
              <h3 className="mt-3 text-lg font-extrabold text-stone-800">{ask.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{ask.body}</p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAsk(null)}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    const r = ask.run;
                    setAsk(null);
                    r();
                  }}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold text-white shadow ${ask.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"}`}
                >
                  {ask.ok}
                </button>
              </div>
            </div>
          </div>
        )}

        {gapAsk && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-900/45 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
              <p className="text-sm font-extrabold text-rose-700">⚠️ รูปยังไม่เต็มช่อง</p>
              <p className="mt-2 text-xs leading-relaxed text-stone-600">หน้า {gapAsk.join(", ")} — ขอบที่รูปไม่ถึงจะพิมพ์ออกมาเป็นสีพื้น แก้ทีหลังไม่ได้</p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDesign((d) => {
                      const photos = { ...d.photos };
                      for (const v of printPages) {
                        const p = lay(v.page);
                        const o = photos[p.key];
                        if (p.photo && o && srcs[o.src] && !placementCovers(o.pl, p.photo))
                          photos[p.key] = {
                            ...o,
                            pl: coverPlacement(p.photo, srcs[o.src]),
                          };
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

/** การ์ดเลย์เอาต์ (ผังสี่เหลี่ยมย่อ: เทา = รูป · เส้น = ตาราง) */
function LayoutCard({ name, on, page, W, H, onClick }: { name: string; on: boolean; page: CalPage; W: number; H: number; onClick: () => void }) {
  const pct = (r: { x: number; y: number; w: number; h: number }) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`,
    height: `${(r.h / H) * 100}%`,
  });
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-[10.5px] font-bold transition ${on ? "bg-sky-50 text-sky-800 ring-2 ring-sky-400" : "text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"}`}
    >
      <span className="relative block w-full bg-white ring-1 ring-stone-300" style={{ aspectRatio: `${W} / ${H}` }}>
        {page.photo && <span className="absolute bg-stone-400" style={pct(page.photo)} />}
        {page.grid && (
          <span className="absolute bg-[repeating-linear-gradient(0deg,#cbd5e1_0_1px,transparent_1px_5px)] ring-1 ring-stone-300" style={pct(page.grid)} />
        )}
      </span>
      {name}
    </button>
  );
}

function HeadBtn({
  label,
  title,
  onClick,
  disabled,
  on,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
        on ? "bg-sky-50 text-sky-700" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

function HIco({ n }: { n: "undo" | "redo" | "history" | "project" }) {
  const P = {
    undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
    redo: <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />,
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    project: <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" />,
  } as const;
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[n]}
    </svg>
  );
}

const formatBaht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

const MONTH_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * อ่านวันสำคัญจากไฟล์ — .ics (DTSTART + SUMMARY) หรือบรรทัดละวัน: 2026-05-14,ชื่อ · 14/05,ชื่อ · 14/5/2026 ชื่อ
 * เก็บเป็น "MM-DD" (วันสำคัญซ้ำทุกปี)
 */
function parseEventsText(text: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const push = (mo: number, d: number, label: string) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return;
    out.push({
      date: `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      label: label.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 40),
    });
  };
  if (/BEGIN:VEVENT/i.test(text)) {
    const flat = text.replace(/\r?\n[ \t]/g, "");
    for (const blk of flat.split(/BEGIN:VEVENT/i).slice(1)) {
      const d = /DTSTART[^:\r\n]*:(\d{4})(\d{2})(\d{2})/i.exec(blk);
      const sm = /\nSUMMARY[^:\r\n]*:([^\r\n]*)/i.exec(blk);
      if (d) push(Number(d[2]), Number(d[3]), (sm?.[1] ?? "").replace(/\\([,;\\])/g, "$1"));
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[\s,;\t]*(.*)$/.exec(line);
      if (iso) {
        push(Number(iso[2]), Number(iso[3]), iso[4]);
        continue;
      }
      const dm = /^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?[\s,;\t]*(.*)$/.exec(line);
      if (dm) push(Number(dm[2]), Number(dm[1]), dm[3]);
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => !seen.has(x.date) && (seen.add(x.date), true));
}

/** หน้าต่างเด้งบนเวที (แบบ Printbox) — มือถือ = แผ่นล่างจอ */
function Popup({
  title,
  onClose,
  footer,
  narrow,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* พื้นหลังจาง — แตะนอกหน้าต่าง = ปิด */}
      <div className="fixed inset-0 z-[59] bg-stone-900/25" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-hidden />
      <div
        className={`fixed inset-x-2 bottom-2 z-[60] flex max-h-[80vh] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_48px_rgba(28,25,23,.28)] ring-1 ring-stone-200 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86vh] sm:-translate-x-1/2 sm:-translate-y-1/2 ${
          narrow ? "sm:w-[min(420px,calc(100vw-2rem))]" : "sm:w-[min(600px,calc(100vw-2rem))]"
        }`}
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        onDragOver={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h3 className="text-lg font-extrabold text-stone-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-xl text-stone-500 hover:bg-stone-100"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-100 px-5 py-3">{footer}</div>}
      </div>
    </>
  );
}

const segBtn = (on: boolean) =>
  `grid h-9 min-w-9 place-items-center px-2 text-sm transition disabled:opacity-30 ${on ? "bg-sky-50 text-sky-700" : "bg-white text-stone-600 hover:bg-stone-50"}`;

function AlignIco({ a }: { a: "left" | "center" | "right" }) {
  const d = a === "left" ? "M4 6h16M4 10h10M4 14h16M4 18h10" : a === "right" ? "M4 6h16M10 10h10M4 14h16M10 18h10" : "M4 6h16M7 10h10M4 14h16M7 18h10";
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

/** ช่องสีสี่เหลี่ยม (กดเลือกสีเอง) */
function Swatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label
      className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-stone-300"
      title={label}
      style={{ background: value || "#ffffff" }}
    >
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}

/** แถวสวิตช์ + ช่องสี (วันหยุด / วันอาทิตย์) */
function RowSwitch({
  label,
  hint,
  on,
  disabled,
  color,
  onToggle,
  onColor,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  color: string;
  onToggle: () => void;
  onColor: (c: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xs font-bold text-stone-700">{label}</span>
        <Swatch value={color} onChange={onColor} label={`สี${label}`} />
        <button type="button" disabled={disabled} onClick={onToggle} aria-pressed={on} aria-label={label} className="disabled:opacity-40">
          <span className={`relative block h-6 w-11 rounded-full transition ${on ? "bg-sky-600" : "bg-stone-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-amber-700">{hint}</p>}
    </div>
  );
}

const barBtn =
  "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30";

function BarBtn({
  title,
  onClick,
  disabled,
  danger,
  on,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`${barBtn} ${on ? "bg-sky-50 text-sky-700" : ""} ${danger ? "hover:bg-rose-50 hover:text-rose-600" : ""}`}
    >
      {children}
    </button>
  );
}

/** ไอคอนเส้นบางแบบเดียวกันทั้งแถบ (24×24 stroke) */
function Ico({
  n,
}: {
  n: "imageOff" | "replace" | "zoomIn" | "zoomOut" | "fit" | "rotL" | "rotR" | "flip" | "opacity" | "border" | "copy" | "layers" | "trash" | "center" | "magic";
}) {
  const P: Record<typeof n, React.ReactNode> = {
    magic: <path d="m4 20 11-11M15 9l2 2M14 4v2M19 9h2M17.5 5.5 19 4M9 5V3M5 9H3M7 7 5.5 5.5" />,
    center: <path d="M12 3v18M8 8l-4 4 4 4M16 8l4 4-4 4" />,
    imageOff: (
      <>
        <rect x="3" y="4" width="15" height="13" rx="2" />
        <path d="m3 14 4-4 4 4 2-2 5 5" />
        <circle cx="18" cy="18" r="4" />
        <path d="m16.5 16.5 3 3m0-3-3 3" />
      </>
    ),
    replace: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
        <path d="M15 4h3a2 2 0 0 1 2 2v3m0 0-2-2m2 2 2-2M9 20H6a2 2 0 0 1-2-2v-3m0 0 2 2m-2-2-2 2" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4M11 8v6M8 11h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4M8 11h6" />
      </>
    ),
    fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5" />,
    rotL: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    rotR: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    flip: (
      <>
        <path d="M12 3v18" strokeDasharray="2 2" />
        <path d="M9 6 3 18h6z" fill="currentColor" />
        <path d="m15 6 6 12h-6z" />
      </>
    ),
    opacity: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity=".35" />
        <path d="M3 3h6v6H3zM9 9h6v6H9zM15 15h6v6h-6zM15 3h6v6h-6zM3 15h6v6H3z" fill="currentColor" stroke="none" />
      </>
    ),
    border: <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2.6" strokeDasharray="3 1.5" />,
    copy: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 13 9 5 9-5" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[n]}
    </svg>
  );
}

/** สไลเดอร์บรรทัดเดียว ป้าย-แถบ-ค่า */
function ValueSlider({
  label,
  min,
  max,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] font-bold text-stone-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
        aria-label={label}
      />
      <span className="w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-500">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** แป้นเลือกจุดโฟกัสของรูปในกรอบ (−1…1 ทั้งสองแกน) — ลาก/แตะครั้งเดียว */
function FocusPad({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    // ลากจุดไปทางไหน = โชว์ส่วนนั้นของรูป (ตำแหน่งรูปเลื่อนสวนทาง)
    onChange(-nx, -ny);
  };
  return (
    <div
      className="relative h-12 w-16 shrink-0 cursor-crosshair touch-none rounded-lg bg-[linear-gradient(#e7e5e4_1px,transparent_1px),linear-gradient(90deg,#e7e5e4_1px,transparent_1px)] bg-[size:25%_33%] bg-white ring-1 ring-stone-300"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ไม่มี pointer ให้จับ — ไม่เป็นไร */
        }
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      onDoubleClick={() => onChange(0, 0)}
      title="ลากจุด · ดับเบิลคลิก = กลาง"
    >
      <span
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 ring-2 ring-white"
        style={{
          left: `${((-x + 1) / 2) * 100}%`,
          top: `${((-y + 1) / 2) * 100}%`,
        }}
      />
    </div>
  );
}

/** แถบสีเล็ก (ขอบกรอบ) — ไม่มี + 7 สีหลัก + เลือกเอง */
function MiniColors({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = ["#ffffff", "#1c1917", "#dc2626", "#ca8a04", "#16a34a", "#2563eb", "#db2777"];
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        title="ไม่มีขอบ"
        onClick={() => onChange("")}
        className={`grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] text-stone-400 ring-1 ${value === "" ? "ring-2 ring-sky-500" : "ring-stone-300"}`}
      >
        ⊘
      </button>
      {list.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full ring-1 ring-stone-300 ${value.toLowerCase() === c ? "outline outline-2 outline-offset-1 outline-sky-500" : ""}`}
          style={{ background: c }}
        />
      ))}
      <label
        className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full ring-1 ring-stone-300"
        title="เลือกสีเอง"
        style={{
          background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
      >
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function ElActions({
  onCenter,
  onRotate,
  onTop,
  onBottom,
  onDelete,
}: {
  onCenter: () => void;
  onRotate: () => void;
  onTop: () => void;
  onBottom: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onCenter} className={toolBtn}>
        ↔ กึ่งกลาง
      </button>
      <button type="button" onClick={onRotate} className={toolBtn}>
        ↻ หมุน
      </button>
      <button type="button" onClick={onTop} className={toolBtn} title="ย้ายขึ้นบนสุด">
        ⬆ บนสุด
      </button>
      <button type="button" onClick={onBottom} className={toolBtn} title="ย้ายลงล่างสุด">
        ⬇ ล่างสุด
      </button>
      <button type="button" onClick={onDelete} className={`${toolBtn} bg-rose-50 text-rose-600 hover:bg-rose-100`}>
        🗑 ลบ
      </button>
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

function Colors({ value, onChange, allowNone, exclude = [] }: { value: string; onChange: (v: string) => void; allowNone?: boolean; exclude?: string[] }) {
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
        style={{
          background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
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

function Toggle({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
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

const toolBtn =
  "rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40";

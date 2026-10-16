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
  LAYER_BG,
  backSpec,
  calFormat,
  calLayersOf,
  calHasGrid,
  cardKey,
  containPlacement,
  coverPlacement,
  defaultBack,
  defaultText,
  defaultTitle,
  isAutoTitle,
  drawPage,
  elementBox,
  elementPhotoSize,
  containZoom,
  photoFilterCss,
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
  type CalFormat,
  type CalElement,
  type CalPage,
  type CalPhoto,
  type CalPlacement,
  type Rect,
  type ImgRef,
} from "@/lib/calendar-card";
import { curvesBox, curvesSvgD, printFrameToken, shiftCurves, type TemplateCurve } from "@/lib/design-templates";
import { buildCalendarAi, renderAiPages, type AiLayer, type AiPage, type AiPath } from "@/lib/calendar-ai";
import { buildPieceFiles, buildPrintPdf, type PieceDesign } from "@/lib/calendar-impose";
import CalendarFlip3D, { type FlipSheet } from "@/components/CalendarFlip3D";
import { BG_METHODS, detectBg, removeBackground, type BgMethod } from "@/lib/diecut-piece";
import { CUT_PARAMS_DEFAULT, CUT_PRESETS, cutSvg, pathCurves, processCut, type CutParams, type CutPreset, type CutResult } from "@/lib/diecut-engine";
import { dieCurvesPath, dieSvgD } from "@/lib/sleeve-dieline";

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
  /** 🗂 ไฟล์ .ai แยกเลเยอร์ (เฉพาะเจ้าของร้านช่วงทดสอบ — prop aiExport) */
  ai?: File;
  aiNote?: string;
  /** 🖨 .pdf ชิ้นงาน 1 ชิ้น/หน้า + เส้นไดคัท (สำหรับโปรแกรมจัดวาง localhost:8002) — เฉพาะเจ้าของร้านช่วงทดสอบ */
  pdf?: File;
  /** ✂️ งานไดคัท: ไฟล์พิมพ์ลายพื้นใส ขนาดจริง 300 DPI (pages[0] = ภาพจำลองชิ้นงาน + เส้นตัด) */
  print?: File;
  /** ✂️ งานไดคัท: มาสก์รองขาว (ดำบนพื้นใส · กรอบเดียวกับไฟล์พิมพ์) */
  white?: File;
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
  /**
   * 🗂 เจ้าของร้าน (ช่วงทดสอบ ผู้ใช้สั่ง 13 ต.ค. 69 "เฉพาะสิทธิ์เจ้าของ ทดสอบเสร็จจะสั่งปิด")
   * = ปุ่มโหลด .ai แยกเลเยอร์บนแถบบน + แนบ .ai ไปกับออเดอร์ (CalendarResult.ai)
   */
  aiExport?: boolean;
  /** 🛒 ใส่ตะกร้าเลย — เรียกหลัง onApply แนบแบบเสร็จ (หน้าสินค้ากดเพิ่มลงตะกร้าให้) */
  onOrder?: () => void | Promise<void>;
  /** 💾 ชื่อปุ่มแทน "🛒 ใส่ตะกร้า" (หลังบ้านเปิดแก้แบบในออเดอร์ = บันทึกกลับเข้าออเดอร์ · ไม่โชว์ราคา) */
  orderLabel?: string;
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
    /** ✂️ เส้นไดคัทจริงของไฟล์เทมเพลต (มม. นับจากมุมซ้ายบนอาร์ตบอร์ด · TemplateFile.cutCurves) — ใส่ลง .ai/.pdf แทนกรอบสี่เหลี่ยม */
    cut?: TemplateCurve[];
    /** 📏 ขนาดหน้างานจริง (มม. · TemplateFile.finishedMm = วงในเทมเพลต) — ชื่อรูปแบบงานแสดงขนาดนี้แทนอาร์ตบอร์ด */
    finished?: { w: number; h: number };
  };
  /** ลูกค้าเลือก "มุมแหลม" — โฟโต้การ์ดไม่ตัดมุมมน (ไกด์บนจอเป็นสี่เหลี่ยม) */
  square?: boolean;
  initial?: CalendarState;
  /**
   * 🖼 รูปตั้งต้นในคลัง "รูปที่อัปไว้" (ไม่มีแบบเดิม) — หลังบ้านออกแบบให้ออเดอร์ที่ลูกค้าแนบรูปมาเอง
   * (ผู้ใช้สั่ง 15 ต.ค. 69) · พนักงานลากรูปของลูกค้าลงหน้าได้เลย ไม่ต้องโหลดมาอัปใหม่
   */
  seedSources?: File[];
  /** ✂️ สูตรเส้นตัดตามชนิดงาน (ซิงก์จาก /admin/diecut?tab=bg · ไม่ส่ง = CUT_PRESETS ในโค้ด) */
  cutPresets?: CutPreset[];
  onApply: (r: CalendarResult) => void | Promise<void>;
  /**
   * 🚀 ไฟล์ที่ทำเสร็จระหว่าง "ใช้แบบนี้" — ส่งให้หน้าสินค้าเริ่มอัปล่วงหน้า ไม่ต้องรอ .ai/.pdf (15 ต.ค. 69)
   * files = หน้าที่ประกอบแล้ว + รูปต้นฉบับ · owner = .ai / .pdf ของเจ้าของร้าน · ไฟล์ชุดเดียวกันส่งไปใน onApply ด้วยเสมอ
   */
  onEarly?: (e: { files?: File[]; owner?: File }) => void;
}

/** แผงด้านข้างตามปุ่มในแถบเครื่องมือ (null = ปิดแผง) */
type Tool = "text" | "photo" | "layout" | "shape" | "calendar" | "events" | "settings" | "cut";
/** removed = ลูกค้ากดลบจากคลังรูป — เก็บช่องไว้ (design อ้างรูปตามลำดับ) แล้วค่อยบีบลำดับตอน "ใช้แบบนี้" */
type Src = {
  file: File;
  url: string;
  w: number;
  h: number;
  el: HTMLImageElement;
  removed?: boolean;
  /** ✂️ งานไดคัท: วิธีหาขอบงานที่ใช้กับรูปนี้แล้ว (ไม่ตั้ง = ยังไม่ได้หา → อัตโนมัติ) */
  bgDone?: BgMethod;
  /** ✂️ วิธีที่ลูกค้าเลือก (auto = ระบบเลือกตามภาพ แบบ engine.detect) */
  bgPick?: BgMethod | "auto";
  /** ✂️ รูปก่อนลบพื้น (กด ↩ คืนรูปเดิม) */
  orig?: Src;
};

/**
 * 🔍 ระดับความคมชัดตอนพิมพ์ (ผู้ใช้ขอ 14 ต.ค. 69 "เช็คคุณภาพรูปว่าคมชัดไหม") — เทียบกับ DPI ที่งานนั้นพิมพ์จริง (fmt.dpi)
 * งาน 300 DPI: ≥240 ดีมาก · ≥150 ดี · ≥100 พอใช้ · ต่ำกว่า = รูปอาจแตก (งานผืนใหญ่ 150 DPI ลดตามสัดส่วน)
 */
function qualityOf(dpi: number, target: number) {
  const r = dpi / Math.max(1, target);
  if (r >= 0.8) return { lv: 3, label: "คมชัดดีมาก", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500" } as const;
  if (r >= 0.5) return { lv: 2, label: "คมชัดดี", tone: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500" } as const;
  if (r >= 0.33) return { lv: 1, label: "พอใช้ อาจไม่คมนัก", tone: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500" } as const;
  return { lv: 0, label: "ต่ำ รูปอาจแตก", tone: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500" } as const;
}
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
  orderLabel,
  aiExport,
  guide,
  square,
  initial,
  seedSources,
  cutPresets,
  onApply,
  onEarly,
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
    // โฟโต้การ์ด + โปสการ์ด 4×6 (ขนาดตายตัว · 14 ต.ค. 69 เพิ่มโปสการ์ด: เทมเพลต 2 ด้านตัดตก 1/2.5 มม.) + งานพิมพ์แผ่นเรียบ print@/print2@ (โปสการ์ดธรรมดา 15 ต.ค. 69)
    if (f0.cornerR == null && !f0.key.startsWith("postcard-") && !/^print2?@/.test(f0.key)) return undefined;
    const b = ((guide.wMm - f0.trimW) / 2 + (guide.hMm - f0.trimH) / 2) / 2;
    // ตัดตก 0 ได้ (เทมเพลตอาร์ตบอร์ด = เส้นตัดพอดี เช่น โปสการ์ดปฏิทิน 1 ด้าน "อาร์ตมัน 300g + holo" · ผู้ใช้แจ้ง 14 ต.ค. 69
    // "1 ด้านไม่เหมือนเทมเพลต" — เดิมรับแค่ 0.5–6 มม. เลยตกไปใช้ 2 มม. มีขอบขาวเกินเส้นตัดที่ไฟล์ร้านไม่มี)
    return b >= -0.05 && b <= 6 ? Math.max(0, Math.round(b * 20) / 20) : undefined;
  }, [format, guide]);
  const fmt = useMemo(() => {
    const f = calFormat(format, { bleed: tplBleed });
    return square && f.cornerR ? { ...f, cornerR: 0 } : f;
  }, [format, square, tplBleed]);
  const W = fmtW(fmt);
  const H = fmtH(fmt);
  /**
   * 📐 "tpl@…" = สินค้าทั่วไปที่ขนาดงานมาจากอาร์ตบอร์ดของไฟล์เทมเพลตล้วน (เคสมือถือ · แผ่นรองเมาส์ ฯลฯ) ตัดตก 3 มม. เป็นค่าสมมุติ
   * → กรอบตัดสี่เหลี่ยมของระบบ "ไม่ใช่เส้นตัดจริง" ของงานพวกนี้เลย (เส้นจริงคือเส้นไดคัทในไฟล์/สกิน) จึงไม่วาดสี่เหลี่ยมแดงทับไม่ว่ากรณีไหน
   * รวมตอนสกินยังโหลดไม่เสร็จ/โหลดไม่ได้ (เดิมแว่บเป็นกรอบแดงจนรูปมา · เจ้าของร้านแจ้ง 16 ต.ค. 69 เคสพรีเมี่ยมใส/ขอบ "ยังคงติดกรอบแดง")
   */
  const tplGeneric = fmt.key.startsWith("tpl@");
  /**
   * 📏 ชื่อรูปแบบงานที่แสดง — tpl@ ใช้ขนาดอาร์ตบอร์ดของไฟล์ ซึ่งรวมส่วนพับหลัง/ขอบเผื่อไว้
   * (เข็มกลัด 58mm อาร์ตบอร์ด 70.5 มม. หัวจอขึ้น "งานออกแบบ 7.1×7.1 ซม." · เจ้าของร้านแจ้ง 16 ต.ค. 69 "แสดงขนาดไม่ตรงกับที่เลือก")
   * → เทมเพลตที่รู้ขนาดหน้างานจริง (guide.finished = วงในเทมเพลต) แสดงขนาดนั้น · ไม่รู้ = ชื่อเดิม
   */
  const fmtName = (() => {
    const fin = tplGeneric ? guide?.finished : undefined;
    if (!fin || !(fin.w > 0) || !(fin.h > 0)) return fmt.name;
    const cm = (mm: number) => String(Math.round(mm) / 10);
    return `งานออกแบบ ${cm(fin.w)}×${cm(fin.h)} ซม.`;
  })();
  /** ✂️ งานไดคัท: รูปลงช่อง "พอดีทั้งรูป" (ไม่ครอปขอบลาย) · งานอื่นเต็มช่อง */
  const fitPl = (r: Rect, img: { w: number; h: number }) => (fmt.diecut ? containPlacement(r, img) : coverPlacement(r, img));
  const sameFormat = initial?.format === fmt.key;
  /** รูปแบบที่หัวข้อเป็นตัวบาง ("Calendar 2026") */
  const lightTitle = fmt.pages.some((p) => p.light);
  const textPage = fmt.pages.find((p) => p.text);

  /**
   * 🃏 หน้าทั้งหมดที่โชว์ในแถบล่าง — ชุดที่มีหลายใบเหมือนกัน (โปสการ์ดรายปี 8 · โฟโต้การ์ด 20) กางเป็นใบที่ 1..N
   * ใบที่ 2+ ที่ยังไม่ได้แยกออกแบบ = เหมือนใบที่ 1 (ล็อกไว้ กด "ออกแบบใบนี้แยก" ก่อนถึงแก้ได้)
   */
  const copies = Math.max(1, fmt.cards ?? 1);
  /** คำเรียก 1 ใบ / 1 ชุด บนจอ — ปฏิทิน "ใบ/ชุด" · ปลอกแก้ว "ชิ้น/เซ็ต" (หน่วยขายจากหน้าสินค้า) */
  const cw = fmt.cardWord ?? "ใบ";
  const setWord = fmt.cardWord ? (unit ?? "ชุด") : "ชุด";
  /** 🎨 งานออกแบบล้วน (ไม่มีตารางปฏิทิน เช่น แผ่นรองเมาส์) — ซ่อนเครื่องมือ/ข้อความเรื่องปฏิทินทั้งหมด (14 ต.ค. 69) */
  const noCal = !calHasGrid(fmt);
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
          { bg: fmt.diecut ? "transparent" : (initial?.design.bg ?? "#ffffff"), text: null, photos: {} };
    // งานหลายหน้า (รายเดือน/ตั้งโต๊ะ) แบบใหม่ = แต่ละหน้าใส่รูปเอง ไม่ยืมรูปหน้าปกให้ทุกหน้า (บั๊คที่ผู้ใช้แจ้ง 13 ต.ค. 69)
    if (!(initial && sameFormat) && (fmt.cards ?? 1) <= 1 && fmt.pages.filter((p) => p.photo).length > 1) d = { ...d, noBorrow: true };
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
  /** แถวรูปตัวอย่างเอฟเฟกต์ (ปุ่ม ‹ › เลื่อน) */
  const filterRowRef = useRef<HTMLDivElement>(null);
  /** 📱 จอแคบ (มือถือ < 640px) — แถบเครื่องมือติดล่างจอแทนลอยเหนือรูป (ดู barWrap) */
  const [winW, setWinW] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));
  useEffect(() => {
    const r = () => setWinW(window.innerWidth);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  const narrow = winW < 640;
  /**
   * ที่วางแถบเครื่องมือลอย — จอกว้าง = ลอยเหนือ/ใต้ชิ้นที่เลือก · มือถือ = ติดล่างจอเต็มกว้าง เลื่อนซ้าย-ขวาได้
   * (ทดสอบบนมือถือ 13 ต.ค. 69: แถบลอยกว้างกว่าจอ ปุ่มขอบ/เอฟเฟกต์/ลบ ตกขอบขวากดไม่ได้)
   * เมนูย่อยของแถบ (เอฟเฟกต์/ขอบ) ขึ้นเหนือแถบ (flex-col-reverse)
   */
  const barWrap = (left: number, top: number): { className: string; style?: React.CSSProperties } =>
    narrow
      ? { className: "fixed inset-x-0 bottom-0 z-[80] flex flex-col-reverse gap-2 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1" }
      : { className: "absolute z-20 w-max -translate-x-1/2", style: { left, top } };
  /**
   * ⤢ กรอบรูป: หดกรอบให้พอดีรูป (สัดส่วนเท่ารูป · ไม่ใหญ่กว่ากรอบเดิม · จุดกลางเดิม) = เห็นทั้งรูปไม่มีที่ว่าง เหมือนช่องรูปหลัก
   * กดซ้ำ = กลับเป็นกรอบขนาดเดิม (รูปเต็มกรอบ)
   * ประวัติ 13 ต.ค. 69: รีเซ็ตซูม (ไม่เปลี่ยน) → ขยายกรอบเต็มการ์ด (ผิด) → รูปพอดีกรอบมีที่ว่าง → ผู้ใช้เลือก "หดกรอบให้พอดีรูป"
   */
  const fitPrev = useRef(new Map<string, { w: number; h: number; zoom?: number; ox?: number; oy?: number }>());
  const frameFitted = (fr: CalElement, img?: { w: number; h: number }) =>
    !!img && Math.abs(fr.w / fr.h - img.w / img.h) < 0.01 && Math.abs((fr.zoom ?? 1) - 1) < 0.01 && fitPrev.current.has(fr.id);
  function fitFrame(fr: CalElement) {
    const img = fr.src != null ? srcs[fr.src] : undefined;
    if (!img) return;
    const prev = fitPrev.current.get(fr.id);
    if (prev && frameFitted(fr, img)) {
      fitPrev.current.delete(fr.id);
      patchEl(fr.id, { w: prev.w, h: prev.h, zoom: prev.zoom ?? 1, ox: prev.ox ?? 0, oy: prev.oy ?? 0 });
      return;
    }
    const s = Math.min(fr.w / img.w, fr.h / img.h);
    fitPrev.current.set(fr.id, { w: fr.w, h: fr.h, zoom: fr.zoom, ox: fr.ox, oy: fr.oy });
    patchEl(fr.id, { w: img.w * s, h: img.h * s, zoom: 1, ox: 0, oy: 0 });
  }
  /** ยกเลิกการเลือกทุกอย่าง (ชิ้นส่วน · ช่องรูปหลัก · ตารางปฏิทิน · เมนูย่อย) */
  function clearSelection() {
    setSel(null);
    setSlotFocus(false);
    setGridSel(false);
    setPop("");
  }
  /** แถบขอบ: กางแถวเลือกสีขอบ (กดช่องสี) */
  const [borderColor, setBorderColor] = useState(false);
  /** ขนาดพื้นที่เวที — ภาพปฏิทินขยายเต็มพื้นที่ตามจอ */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  /** สัดส่วนของเวทีที่ให้การ์ดใช้ได้บนจอกว้าง (1 = เต็มเวที) — 0.7 เหลือขอบว่างรอบ ๆ ไม่ให้การ์ดใหญ่ล้นตา (ผู้ใช้ลอง 0.8 แล้วขอเล็กลงอีก 16 ต.ค. 69) */
  const STAGE_FIT = 0.7;
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
    if (copies > 1) return `${cw}ที่ ${v.card + 1}${fmt.pages.length > 1 ? ` · ${v.base.name}` : ""}`;
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
  const designN = calDesignCount(design, libCount, fmt.key);
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

  /* ─────────── ✂️ งานไดคัท (รูปแบบ cut@…) — ฟังก์ชันชุดเดียวกับ /admin/diecut?tab=bg (lib/diecut-engine) ─────────── */
  const presets = cutPresets ?? CUT_PRESETS;
  /** สูตรที่เลือกอยู่ (ไม่เลือก = พวงกุญแจ) — ค่าในสูตรเป็นฐาน ค่าที่ลูกค้าปรับเอง (design.cut) ทับ */
  const presetP = presets.find((x) => x.id === (design.cut?.preset ?? "keychain"))?.p ?? {};
  const cutP: CutParams = { ...CUT_PARAMS_DEFAULT, ...presetP, ...(design.cut ?? {}), edits: design.cut?.edits ?? [], hole: !!fmt.diecut?.hole };
  /** หดขอบตัด halo (พิกเซลของรูปเต็ม · ใช้ตอนตัดพื้นหลัง) */
  const shrink = design.cut?.shrink ?? presetP.shrink ?? 1;
  const setCut = (patch: Partial<CutParams> & { shrink?: number; preset?: string; autoShape?: boolean }) => setDesign((d) => ({ ...d, cut: { ...(d.cut ?? {}), ...patch } }));
  /** เส้นตัดที่คิดจากลายบนผืนตอนนี้ (null = ยังไม่มีลาย) */
  const [cutRes, setCutRes] = useState<CutResult | null>(null);
  const [cutErr, setCutErr] = useState("");
  /** มุมมองแบบหน้า bg: พื้นโปร่งใส/เข้ม/ขาว · แสดงเส้นตัด · แสดงรองขาว */
  const [cutView, setCutView] = useState<{ bg: "checker" | "dark" | "light"; line: boolean; white: boolean }>({ bg: "checker", line: true, white: true });
  /** แก้เฉพาะจุด: 0 ปิด · 1 ＋มน · −1 −ชิด */
  const [editMode, setEditMode] = useState<0 | 1 | -1>(0);
  /** ข้อความระหว่างตัดพื้นหลังรูป (AI โหลดโมเดล/กำลังรัน) */
  const [bgBusy, setBgBusy] = useState("");
  const [bgNote, setBgNote] = useState("");
  /** เรนเดอร์หน้า (พื้นใส) ที่ความละเอียด pxPerMm → แคนวาส + ImageData */
  const renderAlpha = useCallback(
    (pxPerMm: number, d: CalDesign = design) => {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(fmtW(fmt) * pxPerMm));
      cv.height = Math.max(1, Math.round(fmtH(fmt) * pxPerMm));
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      drawPage(ctx, pxPerMm, fmt, fmt.pages[0], d, back, imgs);
      return { cv, data: ctx.getImageData(0, 0, cv.width, cv.height) };
    },
    [fmt, design, back, imgs],
  );
  /** ความละเอียดภาพคำนวณเส้นตัด (พอดีจอ + ไม่หน่วงมือถือ) — ใช้ค่าเดียวกันตอนส่งออกให้เส้นตรงกับที่เห็น */
  const CUT_PPM = 600 / Math.max(fmtW(fmt), fmtH(fmt));
  /**
   * เส้นตัดต้อง "ตามรูป" ทันทีตอนซูม/ลาก (ผู้ใช้แจ้ง 14 ต.ค. 69 "ภาพขยายไปแล้ว เส้นถึงขยายตาม ไม่สมูท")
   * เดิมรอหยุดแก้ 200ms แล้วคิดที่ 600px (~150ms) → เส้นค้างอยู่ที่เดิมจนปล่อยนิ้ว
   * ตอนนี้: ทุกครั้งที่ลายเปลี่ยน คิดแบบหยาบ 300px (~30ms) ในเฟรมถัดไปทันที → เส้นเกาะรูปตลอด
   *         แล้วค่อยคิดละเอียด 600px หลังหยุดแก้ 180ms (เส้นสุดท้ายคม · ไฟล์ส่งออกใช้ 600px เสมอ)
   */
  const CUT_PPM_FAST = 300 / Math.max(fmtW(fmt), fmtH(fmt));
  /**
   * ✂️ เส้นตัด "ตามรูป" ตอนซูม/ลาก (ผู้ใช้ยืนยัน 14 ต.ค. 69 "ต้องการให้เส้นไดคัทและภาพขยายเข้าออกตามกัน เหมือนก่อนหน้า")
   * — แต่ห้ามกระดุก: ขนาดชิ้นล็อกตามที่สั่ง ดังนั้นซูม/เลื่อน "รูปหลัก" ไม่เปลี่ยนรูปทรงจริงของเส้นเลย
   *   → ไม่คิดใหม่ แค่ย้าย/สเกลกรอบเส้นตามรูปแบบเรขาคณิต (เฟรมเดียวกัน · เป๊ะ · ไม่มีการลากเส้นซ้ำที่ทำให้เส้นเปลี่ยน)
   * คิดเส้นใหม่เฉพาะเมื่อ "เนื้อหา" เปลี่ยน: รูปใหม่/ตัดพื้น · ข้อความ/กรอบ · ค่าเส้นตัด (sig ด้านล่างไม่รวมตำแหน่งรูปหลัก)
   * design.cut.ref = ขนาดรูปตอนใส่ (ไว้เป็นฐาน 100% ของปุ่มซูม)
   */
  const frontKey = fmt.pages[0].key;
  const cutSig = useMemo(() => {
    const ph = design.photos[frontKey];
    const { ref: _r, refSrc: _rs, ...cutNoRef } = design.cut ?? {};
    void _r;
    void _rs;
    return JSON.stringify({
      p: Object.fromEntries(Object.entries(design.photos).map(([k, o]) => [k, k === frontKey ? { ...o, pl: undefined } : o])),
      src: ph?.src,
      e: design.elements,
      c: cutNoRef,
      s: design.slots,
      g: design.gridOff,
      b: design.bg,
      t: design.text,
    });
  }, [design, frontKey]);
  /** ผลคิดล่าสุด + ตำแหน่งรูปหลักตอนคิด — ไว้ย้ายเส้นตามรูป */
  const lastCalc = useRef<{ pl: CalPlacement | null; cut: CutResult }>({ pl: null, cut: null as unknown as CutResult });
  useEffect(() => {
    if (!open || !fmt.diecut) return;
    const ph = design.photos[frontKey];
    if (ph && ph.src >= 0 && (!design.cut?.ref || design.cut.refSrc !== ph.src)) {
      // จำขนาดรูปตอนใส่ (ฐาน 100% ของซูม)
      setDesign((d) => {
        const p0 = d.photos[frontKey];
        return p0 && p0.src >= 0 ? { ...d, cut: { ...(d.cut ?? {}), ref: p0.pl, refSrc: p0.src } } : d;
      });
    }
    let raf = 0;
    let t = 0;
    const run = (ppm: number) => {
      try {
        const d = designRef.current;
        const r = processCut(renderAlpha(ppm, d).data, ppm, fmt.diecut!.size, cutP);
        if (r) lastCalc.current = { pl: d.photos[frontKey]?.pl ?? null, cut: r };
        setCutRes(r);
        setCutErr("");
      } catch (e) {
        setCutRes(null);
        setCutErr(e instanceof Error ? e.message : "คำนวณเส้นตัดไม่สำเร็จ");
      }
    };
    if (fitAnim.current) {
      t = window.setTimeout(() => run(CUT_PPM), 180);
      return () => clearTimeout(t);
    }
    raf = requestAnimationFrame(() => run(CUT_PPM_FAST));
    t = window.setTimeout(() => run(CUT_PPM), 180);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fmt, cutSig, imgs, fontTick]);
  // ซูม/เลื่อนรูปหลัก → ย้ายกรอบเส้นตามรูป (เรขาคณิต · ไม่คิดใหม่)
  const frontPl = design.photos[frontKey]?.pl;
  useEffect(() => {
    if (!fmt.diecut || !frontPl) return;
    const lc = lastCalc.current;
    if (!lc.cut || !lc.pl || lc.pl.wMm <= 0) return;
    const k = frontPl.wMm / lc.pl.wMm;
    const r = lc.cut;
    const moved: CutResult = {
      ...r,
      box: { x: frontPl.cxMm + (r.box.x - lc.pl.cxMm) * k, y: frontPl.cyMm + (r.box.y - lc.pl.cyMm) * k, w: r.box.w * k, h: r.box.h * k },
      scale: r.scale / k,
    };
    setCutRes(moved);
    lastCut.current = moved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontPl?.cxMm, frontPl?.cyMm, frontPl?.wMm, frontPl?.hMm, fmt.diecut]);
  /**
   * 📐 ย่อ/ขยายทุกอย่างบนผืน (รูป · ช่องรูป · ข้อความ/รูปทรง · จุดแก้) ให้ตัวชิ้นงานยาวสุดเท่าขนาดที่สั่งพอดี
   * แล้วจัดกลางจัตุรัส — จอจะเห็นขนาดจริง (scale = 1) ตรงกับไฟล์ผลิต (ผู้ใช้สั่ง 14 ต.ค. 69 "โยนภาพต้องตามขนาดที่ลูกค้าสั่ง")
   */
  const designRef = useRef(design);
  designRef.current = design;
  /** กำลังเลื่อนกลับพอดีขนาดอยู่ (rAF id) — กันสั่งจัดซ้อน */
  const fitAnim = useRef(0);
  const fitToSize = useCallback(
    (r: CutResult) => {
      const k = r.scale;
      const C = { x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2 };
      // ตัวชิ้นงาน (ไม่รวมติ่ง) อยู่กลางจัตุรัส — ติ่งยื่นขึ้นไปในขอบด้านบน
      const T = { x: fmt.bleed + fmt.trimW / 2, y: fmt.bleed + fmt.trimH / 2 };
      /**
       * เลื่อนกลับแบบนุ่ม 220ms (ease-out) แทนกระโดดทีเดียว — ผู้ใช้แจ้ง 14 ต.ค. 69 "ไม่สมูท"
       * ทุกเฟรมคิดจากแบบตอนเริ่ม (d0) ด้วยสเกล/จุดกลางที่ค่อย ๆ เข้าเป้า · เส้นตัดคิดหยาบตามทุกเฟรม (effect ข้างบน)
       */
      const d0 = designRef.current;
      const t0 = performance.now();
      cancelAnimationFrame(fitAnim.current);
      const apply = (kt: number, Ct: { x: number; y: number }) => {
        const mx = (v: number) => Ct.x + (v - C.x) * kt;
        const my = (v: number) => Ct.y + (v - C.y) * kt;
        setDesign(() => mapDesign(d0, kt, mx, my));
        // เส้นตัดตามเฟรม: effect ที่เฝ้าตำแหน่งรูปหลัก (frontPl) ย้ายกรอบเส้นให้เอง
      };
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / 220);
        const e = 1 - (1 - p) ** 3;
        apply(1 + (k - 1) * e, { x: C.x + (T.x - C.x) * e, y: C.y + (T.y - C.y) * e });
        if (p < 1) fitAnim.current = requestAnimationFrame(step);
        else fitAnim.current = 0;
      };
      fitAnim.current = requestAnimationFrame(step);
    },
    [fmt],
  );
  const mapDesign = (d: CalDesign, k: number, mx: (v: number) => number, my: (v: number) => number): CalDesign => ({
        ...d,
        photos: Object.fromEntries(
          Object.entries(d.photos).map(([key, o]) => [key, { ...o, pl: { ...o.pl, cxMm: mx(o.pl.cxMm), cyMm: my(o.pl.cyMm), wMm: o.pl.wMm * k, hMm: o.pl.hMm * k } }]),
        ),
        // ช่องรูปกลับเป็นเต็มผืนเสมอ — ไม่งั้นช่องหดตามลายแล้วซูมรูปทีหลังโดนครอปเป็นเหลี่ยม
        slots: undefined,
        elements: (d.elements ?? []).map((e) => ({
          ...e,
          x: mx(e.x),
          y: my(e.y),
          w: e.w * k,
          h: e.h * k,
          ...(e.size != null ? { size: e.size * k } : {}),
          ...(e.strokeW ? { strokeW: e.strokeW * k } : {}),
        })),
        // ⚠️ ห้ามใส่คีย์ค่า undefined (edits/ref) — spread ทับค่าเริ่มต้นใน cutP แล้ว processCut อ่าน .length พัง
        cut: d.cut
          ? {
              ...d.cut,
              ...(d.cut.edits?.length ? { edits: d.cut.edits.map(([x, y, rr, sg]) => [mx(x), my(y), rr, sg] as [number, number, number, number]) } : {}),
              ...(d.cut.ref ? { ref: { ...d.cut.ref, cxMm: mx(d.cut.ref.cxMm), cyMm: my(d.cut.ref.cyMm), wMm: d.cut.ref.wMm * k, hMm: d.cut.ref.hMm * k } } : {}),
            }
          : d.cut,
  });
  /**
   * 📐 จัดพอดีขนาด + กลางจัตุรัส "เสมอ" — ขนาดชิ้นงานตายตัวตามที่สั่ง ลูกค้าขยาย/ลากเองก็ถูกจัดกลับหลังปล่อยนิ้ว
   * (ผู้ใช้แจ้ง 14 ต.ค. 69 "ภาพแสดงใหญ่เกินไป และไม่อยู่ตรงกลาง" — เดิมจัดเฉพาะตอนใส่รูป ซูมเองแล้วจอไม่ตรงไฟล์)
   * กำลังลากอยู่ = รอปล่อยก่อน (ไม่กระตุกใต้นิ้ว)
   */
  const lastCut = useRef<CutResult | null>(null);
  /**
   * ✂️ ผู้ใช้เลือก 14 ต.ค. 69: ซูม/ลาก = "ขยายลายในชิ้นงาน" ขนาดชิ้นคงเดิม — ไม่ดึงกลับพอดีขนาดอัตโนมัติ ลูกค้าจัดเอง
   * จัดพอดี+กลางให้แค่ตอนรูปในคลังเปลี่ยน (ใส่รูปใหม่/ตัดพื้นเสร็จ) หรือเปลี่ยนขนาดสินค้า
   */
  const srcSig = srcs.map((x) => `${x.url}:${x.removed ? 0 : 1}`).join("|");
  const fitWant = useRef("");
  useEffect(() => {
    fitWant.current = `${srcSig}|${fmt.key}`;
  }, [srcSig, fmt.key]);
  const fitDone = useRef("");
  useEffect(() => {
    lastCut.current = cutRes;
    if (!fmt.diecut || !cutRes) return;
    if (fitDone.current === fitWant.current) return;
    const off = () => {
      const r = lastCut.current;
      if (!r) return false;
      const cx = r.box.x + r.box.w / 2 - (fmt.bleed + fmt.trimW / 2);
      const cy = r.box.y + r.box.h / 2 - (fmt.bleed + fmt.trimH / 2);
      return Math.abs(r.scale - 1) > 0.01 || Math.hypot(cx, cy) > 0.15;
    };
    if (!off()) return;
    let t = 0;
    const tryFit = () => {
      if (drag.current || fitAnim.current) {
        t = window.setTimeout(tryFit, 120);
        return;
      }
      fitDone.current = fitWant.current;
      if (lastCut.current && off()) fitToSize(lastCut.current);
    };
    tryFit();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutRes, fmt, fitToSize]);
  /** แทนรูปลำดับ i ด้วยไฟล์ใหม่ (ลำดับเดิม — design อ้างรูปตามลำดับ) */
  const swapSrc = useCallback(async (i: number, file: File, patch: Partial<Src>) => {
    const s2 = await loadImg(file);
    if (!s2) return false;
    setSrcs((cur) => cur.map((s, j) => (j === i ? { ...s2, ...patch } : s)));
    return true;
  }, []);
  /**
   * 🪄 หาขอบงานของรูปลำดับ i (engine.method_alpha): auto = ตรวจภาพแล้วเลือกเอง · alpha = ใช้พื้นใสของไฟล์
   * solid = ไล่สีพื้น · ai = AI ตัดพื้นหลัง · none = ทั้งใบ (ใช้รูปเดิม)
   */
  const applyBg = useCallback(
    async (i: number, pick: BgMethod | "auto", shrinkPx = shrink) => {
      const s0 = srcs[i];
      if (!s0) return;
      const base = s0.orig ?? s0;
      setBgNote("");
      let m: BgMethod = pick === "auto" ? detectBg(base.el, base.w, base.h).method : pick;
      if (m === "alpha" && detectBg(base.el, base.w, base.h).method !== "alpha") {
        setBgNote("รูปนี้ไม่มีพื้นโปร่งใส — เลือก “สีพื้น” หรือ “AI” แทน");
        m = "none";
      }
      if (m === "alpha" || m === "none") {
        setSrcs((cur) => cur.map((s, j) => (j === i ? { ...base, orig: undefined, bgDone: m, bgPick: pick } : s)));
        return;
      }
      setBgBusy(m === "ai" ? "กำลังเปิดตัวช่วย AI…" : "กำลังตัดพื้นหลัง…");
      try {
        const blob = await removeBackground(base.el, base.w, base.h, m, shrinkPx, (t) => setBgBusy(t));
        if (!blob) {
          setBgNote("รูปนี้พื้นหลังไม่ใช่สีเรียบ — ใช้ “AI” แทน");
          setSrcs((cur) => cur.map((s, j) => (j === i ? { ...base, orig: undefined, bgDone: "none", bgPick: pick } : s)));
          return;
        }
        const name = base.file.name.replace(/\.[^.]+$/, "") + "-cut.png";
        await swapSrc(i, new File([blob], name, { type: "image/png" }), { bgDone: m, bgPick: pick, orig: base });
      } catch {
        setBgNote("AI ตัดพื้นหลังไม่สำเร็จ (เครื่องอาจไม่รองรับ) — ลอง “สีพื้น” หรือใช้ไฟล์ PNG พื้นใส");
        setSrcs((cur) => cur.map((s, j) => (j === i ? { ...s, bgDone: s.bgDone ?? "none" } : s)));
      } finally {
        setBgBusy("");
      }
    },
    [srcs, shrink, swapSrc],
  );
  /**
   * ❓ รูปใหม่ที่ไม่มีพื้นใส (JPG ฯลฯ) — ถามก่อนว่าจะตัดพื้นหลังไหม (ผู้ใช้สั่ง 14 ต.ค. 69 "ลูกค้าบางคนต้องการทั้งภาพ")
   * null = ไม่มีคำถามค้าง · ตัวเลข = ลำดับรูปที่รอคำตอบ
   */
  const [bgAsk, setBgAsk] = useState<number | null>(null);
  // รูปใหม่ในงานไดคัท: PNG พื้นใส = ใช้ขอบโปร่งใสเลย · รูปทึบ = ถามก่อน (ตัดพื้นหลัง / ใช้ทั้งภาพ)
  useEffect(() => {
    if (!open || !fmt.diecut || bgBusy || bgAsk !== null) return;
    const i = srcs.findIndex((s) => !s.removed && !s.bgDone);
    if (i < 0) return;
    if (detectBg(srcs[i].el, srcs[i].w, srcs[i].h).method === "alpha") void applyBg(i, "alpha");
    else setBgAsk(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fmt.diecut, srcs, bgBusy, bgAsk]);
  /** ตอบคำถามตัดพื้นหลัง — cut = ตัดพื้น (ระบบเลือก ลบสีพื้น/AI ให้เอง) · whole = ใช้ทั้งภาพ (เส้นตัดสี่เหลี่ยมมุมมนรอบภาพ) */
  const answerBg = (cut: boolean) => {
    const i = bgAsk;
    setBgAsk(null);
    if (i === null) return;
    if (cut) {
      void applyBg(i, "auto");
      // มุมมนที่ระบบตั้งให้ตอนเลือก "ใช้ทั้งภาพ" รูปก่อน → กลับเป็นตามทรง (ถ้าลูกค้าเลือกรูปร่างเองไว้ ไม่แตะ)
      if (design.cut?.autoShape) setCut({ shape: "contour", autoShape: false });
      return;
    }
    void applyBg(i, "none");
    // ทั้งภาพ + ตามทรง = เส้นเหลี่ยมคม → เปลี่ยนเป็นมุมมนให้ (เปลี่ยนรูปร่างเองได้ในแผง ✂️)
    if (cutP.shape === "contour") setCut({ shape: "rounded", autoShape: true });
  };
  const holidayData = hasHolidayData(back.year);
  const holidays = useMemo(() => holidaysOf(back.year), [back.year]);
  /** หน้าแรกที่มีช่องรูป (ตามรูปแบบงาน) = หน้าปก — รูปของหน้านี้คือรูปตั้งต้นของทุกหน้า */
  const coverPage = fmt.pages.find((p) => p.photo);
  /** รูปที่หน้าว่างยืมมาวาง (รูปหน้าปก) — แบบที่ไม่ยืม (noBorrow) = ไม่มี */
  const fallbackSrc = design.noBorrow ? -1 : slotSrc(design, imgs);
  const elements = useMemo(() => design.elements ?? [], [design.elements]);
  const pageEls = elements.filter((e) => e.page === basePage.key);
  const selEl = elements.find((e) => e.id === sel && e.page === basePage.key) ?? null;

  // เปลี่ยนหน้า = ยกเลิกเลือกชิ้นส่วน · หน้าตารางล้วนเปิดแผงปฏิทิน
  useEffect(() => {
    setSel(null);
    setGridSel(false);
    // 📮 หลังลายโปสการ์ดไม่มีรูป/ตาราง — ไม่เปิดแผงปฏิทิน
    setTool((t) => (t === "photo" && !page.photo ? (page.kind === "postback" || noCal ? null : "calendar") : t === "shape" || t === "text" ? null : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePage.key]);

  // ── ฟอนต์ ──
  const fontKeys = useMemo(
    () => [
      back.font,
      ...Object.values(back.parts ?? {}).map((x) => x?.font ?? back.font),
      ...elements.filter((e) => e.kind === "text").map((e) => e.font ?? "prompt"),
      // 📮 ด้านหลังลายโปสการ์ดใช้ Poppins
      ...(fmt.pages.some((p) => p.kind === "postback") ? ["poppins"] : []),
    ],
    [back.font, back.parts, elements, fmt],
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
    const seed = initial?.sources.length ? initial.sources : (seedSources ?? []);
    if (!open || !seed.length) return;
    let dead = false;
    void (async () => {
      const list = await Promise.all(seed.map(loadImg));
      if (dead) return;
      if (list.some((x) => !x)) setErr("โหลดรูปเดิมบางรูปไม่สำเร็จ — เลือกรูปใหม่ได้เลย");
      const ok = list.filter((x): x is Src => !!x);
      setSrcs(ok);
      /**
       * 🪄 รูปตั้งต้น (หลังบ้านออกแบบให้ลูกค้า · ไม่มีแบบเดิม) → เรียงลงหน้าอัตโนมัติตามลำดับ: ปก → มกราคม → … (ผู้ใช้สั่ง 15 ต.ค. 69)
       * เฉพาะหน้าที่มีช่องรูปประจำหน้าและไม่ใช่หน้าไม่บังคับ (หลังปก/หลังแผ่นท้าย) · รูปไม่พอ = หน้าที่เหลือว่างไว้ · มีรูปวางอยู่แล้วไม่ยุ่ง
       */
      if (!initial?.sources.length && ok.length) {
        const targets = vpages.filter((v) => v.card === 0 && v.page.photo && !v.page.optional);
        setDesign((d) =>
          Object.keys(d.photos).length
            ? d
            : {
                ...d,
                photos: Object.fromEntries(
                  targets.slice(0, ok.length).map((v, k) => [v.page.key, { src: k, pl: fitPl(v.page.photo!, ok[k]) }]),
                ),
              },
        );
      }
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
  /**
   * 📐 เทมเพลตมี "เส้นตัดสี่เหลี่ยมสีแดง" ตรงกรอบตัดของระบบไหม — มี (เทมเพลตปฏิทิน/โปสการ์ด) = วาดเส้นตัดขอบขาว+แกนแดงทับให้เห็นบนรูปเข้ม
   * ไม่มี (แผ่นรองเมาส์ · ขอบจริงคือเส้นเทามุมมนในไฟล์) = ไม่วาดสี่เหลี่ยมแดงทับ (ผู้ใช้ถาม 14 ต.ค. 69 "ทำไมมีเส้นไดคัทแดง")
   * ⚠️ นับแค่ "มีพิกเซลแดง" ไม่พอ: สกินเคสมือถือ (Case Frame Card 16 ต.ค. 69) มีเส้นไดคัทแดงตามทรงเคส (มุมมน+ช่องกล้อง)
   * ชิดขอบอาร์ตบอร์ด แต่กรอบตัดของ tpl@ อยู่ลึกเข้ามา 3 มม. → เดิมเลยวาดสี่เหลี่ยมแดงทับไม่ตรงเส้นจริง (เจ้าของร้านแจ้ง "ติดกรอบเส้นสีแดง เอาออก")
   * → วาดทับเฉพาะเมื่อพิกเซลแดงเกือบทั้งหมด (≥90% · เคส 16PM ได้ ~70% เพราะเส้นในชั้นตรงแนวแต่มุมมน/ช่องกล้องหลุด · สี่เหลี่ยมจริงได้ ~100%) นอนอยู่บนขอบกรอบตัด (±1.5 มม. ในพิกัดผืน ตามตำแหน่งที่สกินถูกวาดจริง)
   */
  const guideRed = useMemo(() => {
    if (!guideImg || !guide) return false;
    try {
      const sc = Math.min(1, 600 / Math.max(guideImg.naturalWidth, guideImg.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(guideImg.naturalWidth * sc));
      cv.height = Math.max(1, Math.round(guideImg.naturalHeight * sc));
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true;
      ctx.drawImage(guideImg, 0, 0, cv.width, cv.height);
      const a = ctx.getImageData(0, 0, cv.width, cv.height).data;
      // ตำแหน่งสกินบนผืน (มม.) — สูตรเดียวกับตอนวาด (fill = พอดีผืน/ย่อกึ่งกลาง · ไม่ fill = กึ่งกลางตามขนาดมม.)
      let ox = 0, oy = 0, gw = W, gh = H;
      if (guide.fill) {
        const ar = guideImg.naturalWidth / Math.max(1, guideImg.naturalHeight);
        if (Math.abs(ar / (W / H) - 1) > 0.02) {
          gw = Math.min(W, H * ar);
          gh = gw / ar;
          ox = (W - gw) / 2;
          oy = (H - gh) / 2;
        }
      } else {
        gw = guide.wMm;
        gh = guide.hMm;
        ox = (W - gw) / 2;
        oy = (H - gh) / 2;
      }
      const TOL = 1.5;
      const x0 = fmt.bleed, y0 = fmt.bleed, x1 = fmt.bleed + fmt.trimW, y1 = fmt.bleed + fmt.trimH;
      let red = 0, on = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (!(a[i + 3] > 40 && a[i] > 150 && a[i] - a[i + 1] > 60 && a[i] - a[i + 2] > 60)) continue;
        red++;
        const px = (i / 4) % cv.width;
        const py = Math.floor(i / 4 / cv.width);
        const mx = ox + ((px + 0.5) / cv.width) * gw;
        const my = oy + ((py + 0.5) / cv.height) * gh;
        const inX = mx >= x0 - TOL && mx <= x1 + TOL;
        const inY = my >= y0 - TOL && my <= y1 + TOL;
        if ((inX && (Math.abs(my - y0) <= TOL || Math.abs(my - y1) <= TOL)) || (inY && (Math.abs(mx - x0) <= TOL || Math.abs(mx - x1) <= TOL))) on++;
      }
      return red > 20 && on / red >= 0.9;
    } catch {
      return true; // อ่านพิกเซลไม่ได้ = ทำแบบเดิม (วาดเส้นตัด)
    }
  }, [guideImg, guide, fmt, W, H]);
  /**
   * ⬜ พื้นนอกเส้นตัดเป็นขาวทึบ (เจ้าของร้านแจ้ง 16 ต.ค. 69 เข็มกลัด "ตรงที่ขีดสีแดงควรจะเป็นสีขาวทึบ")
   * งาน tpl@ (เข็มกลัด/เคส) ไกด์ถูกวาดแบบ multiply พื้นขาวของไฟล์จึงโปร่ง รูปที่วางเต็มผืนโผล่ที่มุมนอกวงกลม/ทรงไดคัท
   * ทั้งที่ของจริงถูกตัดทิ้ง → หา "เขตนอกเส้นตัด" จากรูปไกด์เอง: ไล่สี (flood fill) จากขอบรูปผ่านพิกเซลขาว/ใส
   * หยุดที่เส้น/ลายทแยงของเทมเพลต แล้วทาขาวทึบทับรูปตรงเขตนั้นก่อนวางไกด์ (บนจอเท่านั้น ไฟล์พิมพ์ยังเต็มผืนตามเดิม)
   * กันพลาด: ขอบรูปพรีวิวมีเงาเทา ~3px → เริ่มไล่จากแถบใน 4px (แถบเองนับเป็นนอกเมื่อเป็นเทากลาง) · ไล่ถึงกลางรูป
   * หรือได้เขต < 2% / > 85% = เส้นตัดไม่ปิด/ไม่มีทรง → ไม่ทา (เหมือนเดิม)
   */
  /**
   * 🎯 วงขอบ (ระหว่างเส้นตัดกับหน้างาน) ต้องเหมือนไฟล์เทมเพลต — พื้นขาวทึบ + ลายทแยงแดง (เจ้าของร้านแจ้ง 16 ต.ค. 69 เข็มกลัดหัวใจ
   * "ภาพบนจอควรเหมือนเทมเพลต ไม่ใช่สีขอบติดสีฟ้า") · เดิมวาดไกด์แบบ multiply ทั้งรูป พื้นขาวในวงขอบจึงโปร่ง
   * ช่องว่าง/รูปที่วางเต็มผืนโผล่สีฟ้าทะลุลายทแยง → ไล่สีจากกลางรูปผ่านพิกเซลขาว = "หน้างาน" (ด้านในเส้นเทาวงใน)
   * ทำรูปไกด์ที่เจาะหน้างานให้ใส (over) ใช้ตอน "ช่องรูปยังว่าง": นอกเส้นตัด = ขาว · วงขอบ = ขาว+ลายทแยงเหมือนไฟล์เปล่า
   * มีรูปแล้ว = mask + multiply (วงขอบเห็นรูปทะลุลายทแยงเหมือนเปิดใน Illustrator · เจ้าของร้านยืนยันด้วยภาพเทียบ 16 ต.ค. 69)
   * ไฟล์พิมพ์ยังเต็มผืนตามเดิม (วงขอบคือส่วนที่พับไปด้านหลัง)
   * หาหน้างานไม่ได้ (ไล่ถึงขอบรูป หรือได้ < 10% / > 95%) = multiply แบบเดิม
   * ⚠️ "นอกเส้นตัด" ที่ไล่สีจากพิกเซล ใช้ได้แค่เป็นพื้นขาวของ over (ตอนว่าง วงขอบขาวอยู่แล้วจึงไม่เห็นรอยรั่ว)
   *    ห้ามเอาไปทาขาวทับรูป — เส้นขอบนอก 0.25pt มีช่องเล็ก ๆ สีไหลเข้าไประหว่างเส้นทแยงเป็นแถบขาวในวงขอบ
   *    (เจ้าของร้านแจ้ง 16 ต.ค. 69 "ยังคงไม่สมบูรณ์แบบ" · วัดหัวใจ: ไล่สีได้เขตนอก 26–32% ของจริงจากเส้นเวกเตอร์ 23.8%) → ใช้ tplCut แทน
   */
  const guideFx = useMemo<{ over: HTMLCanvasElement | null }>(() => {
    const none = { over: null };
    if (!guideImg || !guide || !tplGeneric) return none;
    try {
      const sc = Math.min(1, 2000 / Math.max(guideImg.naturalWidth, guideImg.naturalHeight));
      const w = Math.max(8, Math.round(guideImg.naturalWidth * sc));
      const h = Math.max(8, Math.round(guideImg.naturalHeight * sc));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return none;
      ctx.drawImage(guideImg, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const a = img.data;
      const white = (i: number) => a[i * 4 + 3] < 40 || (a[i * 4] > 235 && a[i * 4 + 1] > 235 && a[i * 4 + 2] > 235);
      const neutral = (i: number) => Math.abs(a[i * 4] - a[i * 4 + 1]) < 12 && Math.abs(a[i * 4] - a[i * 4 + 2]) < 12;
      /** ไล่สีผ่านพิกเซลขาวจากจุดตั้งต้น → จำนวนพิกเซลที่ไปถึง (ทำเครื่องหมายใน seen) */
      const fill = (seen: Uint8Array, q: number[]) => {
        let n = 0;
        while (q.length) {
          const i = q.pop()!;
          n++;
          const x = i % w;
          const y = (i - x) / w;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
          for (const j of nb) {
            if (j < 0 || seen[j] || !white(j)) continue;
            seen[j] = 1;
            q.push(j);
          }
        }
        return n;
      };
      // ── นอกเส้นตัด: เริ่มจากแถบใน (ขอบรูปพรีวิวเก่ามีเงาเทา ~3px นับเป็นนอก) ──
      const out = new Uint8Array(w * h);
      const q: number[] = [];
      const inset = Math.max(3, Math.round(Math.min(w, h) * 0.01));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const edge = x < inset || y < inset || x >= w - inset || y >= h - inset;
          const seedRing = x === inset || y === inset || x === w - 1 - inset || y === h - 1 - inset;
          const i = y * w + x;
          if (edge && neutral(i)) out[i] = 1;
          else if (seedRing && white(i)) {
            out[i] = 1;
            q.push(i);
          }
        }
      const nOut = fill(out, q);
      const center = (h >> 1) * w + (w >> 1);
      const fracOut = nOut / (w * h);
      if (out[center] || fracOut < 0.02 || fracOut > 0.85) return none;
      // ── หน้างาน: ไล่จากกลางรูป · ห้ามรั่วไปเขตนอก ──
      let over: HTMLCanvasElement | null = null;
      if (white(center)) {
        const face = new Uint8Array(w * h);
        face[center] = 1;
        const nFace = fill(face, [center]);
        let leak = false;
        for (let i = 0; i < w * h && !leak; i++) if (face[i] && out[i]) leak = true;
        const frac = nFace / (w * h);
        if (!leak && frac > 0.1 && frac < 0.95) {
          const o = ctx.createImageData(w, h);
          for (let i = 0; i < w * h; i++) {
            if (face[i]) continue; // หน้างาน = ใส
            const k4 = i * 4;
            if (out[i]) {
              o.data[k4] = o.data[k4 + 1] = o.data[k4 + 2] = o.data[k4 + 3] = 255; // นอกเส้นตัด = ขาวทึบ
            } else {
              // วงขอบ/เส้น = สีตามไฟล์ ทึบ (พิกเซลใสของไฟล์ = ขาว)
              const al = a[k4 + 3] / 255;
              o.data[k4] = Math.round(a[k4] * al + 255 * (1 - al));
              o.data[k4 + 1] = Math.round(a[k4 + 1] * al + 255 * (1 - al));
              o.data[k4 + 2] = Math.round(a[k4 + 2] * al + 255 * (1 - al));
              o.data[k4 + 3] = 255;
            }
          }
          const oc = document.createElement("canvas");
          oc.width = w;
          oc.height = h;
          oc.getContext("2d")!.putImageData(o, 0, 0);
          over = oc;
        }
      }
      return { over };
    } catch {
      return none;
    }
  }, [guideImg, guide, tplGeneric]);
  /**
   * ✂️ เส้นไดคัทจริงของเทมเพลต (TemplateFile.cutCurves) ในพิกัดผืน — อาร์ตบอร์ดวางกึ่งกลางผืน (สูตรเดียวกับตอนวาดไกด์)
   * มี = .ai ได้เลเยอร์ "เส้นตัด (CutContour)" เป็นเส้นนี้ · .pdf ได้หน้าเส้นไดคัทตามทรง แทนกรอบสี่เหลี่ยมสมมุติของ tpl@
   * (เจ้าของร้านแจ้ง 16 ต.ค. 69 ".ai ต้องมีเส้นไดคัทด้วย" — เดิมเลเยอร์เส้นตัดเป็นสี่เหลี่ยมเว้นขอบ 3 มม. ไม่ใช่ทรงหัวใจ/วงกลม)
   */
  const tplCut = useMemo(() => {
    if (!guide?.cut?.length || guide.fill || !guide.wMm || !guide.hMm) return null;
    return shiftCurves(guide.cut, (W - guide.wMm) / 2, (H - guide.hMm) / 2);
  }, [guide, W, H]);
  /**
   * 🌗 เส้นไกด์เทมเพลตที่เปลี่ยนสีเองบนรูปเข้ม (เจ้าของร้านแจ้ง 16 ต.ค. 69 Puzzle "เส้นสีของเทมเพลต อยากให้มันเปลี่ยนถ้าเจอภาพสีเข้มที่ทำให้เส้นไดคัทจม")
   * ไกด์วาดแบบ multiply = เส้นมีแต่เข้มลง บนรูปมืดเส้นเทาจมหาย → ทำ "มาสก์เส้น" (สีขาว · ความทึบตามความเข้มของเส้นในไฟล์)
   * แล้วตอนวาด ทาเส้นขาวทับเฉพาะตรงที่ภาพใต้ไกด์มืด (วัดจากภาพย่อ · ดู draw) — พื้นสว่างเส้นยังเข้มเหมือนเดิม
   * นับเป็นเส้น: พิกเซลสีกลาง (เทา/ดำ) ที่มืดกว่า ~0.9 · พิกเซลมีสี (ลายทแยงแดง) ที่ช่องสีต่ำสุดมืดกว่า 0.5
   *   (กันพื้นถมชมพูอ่อนของวงพับหลังเข็มกลัดไม่ให้กลายเป็นแผ่นขาวทับรูป)
   */
  const guideLines = useMemo<HTMLCanvasElement | null>(() => {
    if (!guideImg || !guide) return null;
    try {
      const sc = Math.min(1, 1600 / Math.max(guideImg.naturalWidth, guideImg.naturalHeight));
      const w = Math.max(8, Math.round(guideImg.naturalWidth * sc));
      const h = Math.max(8, Math.round(guideImg.naturalHeight * sc));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(guideImg, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const a = img.data;
      let any = false;
      for (let i = 0; i < a.length; i += 4) {
        const r = a[i] / 255, g = a[i + 1] / 255, b = a[i + 2] / 255, al = a[i + 3] / 255;
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        const neutral = mx - mn < 0.12;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const s = neutral ? (0.92 - lum) / 0.35 : (0.5 - mn) / 0.3;
        const v = Math.max(0, Math.min(1, s)) * al;
        a[i] = a[i + 1] = a[i + 2] = 255;
        a[i + 3] = Math.round(v * 255);
        if (v > 0.1) any = true;
      }
      if (!any) return null;
      ctx.putImageData(img, 0, 0);
      return cv;
    } catch {
      return null;
    }
  }, [guideImg, guide]);
  /** กรอบเส้นตัดของไฟล์ .pdf (lib/calendar-impose · TrimBox + หน้าเส้นไดคัท) — เส้นจริงของเทมเพลตมาก่อน */
  const pdfCut = useMemo(() => {
    const box = tplCut ? curvesBox(tplCut) : null;
    if (tplCut && box) return { ...box, r: 0, svg: curvesSvgD(tplCut) };
    return { x: fmt.bleed, y: fmt.bleed, w: fmt.trimW, h: fmt.trimH, r: fmt.cornerR ?? 0, ...(fmt.dieline ? { svg: dieSvgD(fmt.dieline, fmt.bleed) } : {}) };
  }, [tplCut, fmt]);
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
      const gridOff = [...(d.gridOff ?? [])];
      const extra: CalElement[] = [];
      for (const p of fmt.pages) {
        const nk = cardKey(card, p.key);
        if (d.photos[p.key]) photos[nk] = { ...d.photos[p.key] };
        if (d.layouts?.[p.key]) layouts[nk] = d.layouts[p.key];
        if (d.grids?.[p.key]) grids[nk] = { ...d.grids[p.key] };
        if (d.slots?.[p.key]) slots[nk] = { ...d.slots[p.key] };
        if (d.gridOff?.includes(p.key)) gridOff.push(nk);
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
        ...(gridOff.length ? { gridOff } : {}),
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
        gridOff: d.gridOff?.some((k) => k.startsWith(pre)) ? d.gridOff.filter((k) => !k.startsWith(pre)) : d.gridOff,
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
          [target.key]: { src: idx, pl: fitPl(target.photo!, s) },
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
  /** 🗑 ลบรูปออกจากคลัง — กรอบรูปที่ใช้รูปนี้ถูกลบทิ้งไปด้วย · ช่องรูปหลักกลายเป็นช่องว่าง (Undo เอากลับได้) */
  function removeSrc(i: number) {
    const used = Object.values(design.photos).some((o) => o.src === i) || (design.elements ?? []).some((e) => e.kind === "photo" && e.src === i);
    if (used)
      return setAsk({
        icon: "🗑",
        title: "ลบรูปนี้?",
        body: "รูปนี้ใช้อยู่ในแบบ — ลบแล้วกรอบรูปที่ใช้รูปนี้จะถูกลบไปด้วย (ช่องรูปหลักจะว่าง)",
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
      // กรอบรูปอิสระที่ใช้รูปนี้ = ลบทั้งกรอบ (เดิมเหลือกรอบว่าง "Drag here" ค้างบนการ์ด · ผู้ใช้แจ้ง 13 ต.ค. 69)
      elements: (d.elements ?? []).filter((e) => !(e.kind === "photo" && e.src === i)),
    }));
    if (selEl?.kind === "photo" && selEl.src === i) setSel(null);
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
    setTool("photo"); // ใส่รูปจากคลัง = แถบเครื่องมือรูปขึ้นให้ปรับต่อได้เลย
    if (selEl?.kind === "photo") patchEl(selEl.id, { src: i, zoom: 1, ox: 0, oy: 0 });
    else if (page.photo) pickPhoto(i);
    else addFreePhoto(i, s0);
  }
  async function uploadToTarget(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/"));
    if (!list.length) return setErr("ใช้ได้เฉพาะไฟล์รูป (JPG / PNG / WEBP)");
    const [first, ...rest] = list;
    setTool("photo");
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
        [page.key]: { src: i, pl: fitPl(page.photo!, srcs[i]) },
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
      if (fmt.diecut) return d; // ✂️ ไดคัท: ช่องรูปตายตัวทั้งผืน รูปไม่ต้องคลุมช่อง
      if (np && keep && keep.src >= 0 && srcs[keep.src]) nd.photos = { ...d.photos, [key]: { ...keep, pl: keepCover(keep.pl, np) } };
      else if (np && own && own.src >= 0 && srcs[own.src] && !placementCovers(own.pl, np))
        nd.photos = { ...d.photos, [key]: { ...own, pl: fitPl(np, srcs[own.src]) } };
      return nd;
    });
  }

  /**
   * ⤢ ช่องรูปหลัก: หดช่องให้พอดีรูป (เหมือนกรอบรูป fitFrame · ผู้ใช้สั่ง 13 ต.ค. 69 "ช่องรูปหลักต้องเหมือนปฏิทินโฟโต้การ์ด")
   * สัดส่วนเท่ารูป · ไม่ใหญ่กว่าช่องเดิม · จุดกลางเดิม · รูปเต็มช่องใหม่พอดี — กดซ้ำ = กลับเป็นช่องเดิม
   * เดิมช่องหลักใช้ "รูปพอดีช่องเหลือที่ว่าง" (containPlacement) ต่างจากกรอบรูป
   */
  const slotPrev = useRef(new Map<string, { x: number; y: number; w: number; h: number } | null>());
  function fitSlot() {
    const r = page.photo;
    const own = design.photos[basePage.key];
    const img = own && own.src >= 0 ? srcs[own.src] : srcs[fallbackSrc];
    const src = own && own.src >= 0 ? own.src : fallbackSrc;
    if (!r || !img || src < 0) return;
    const key = basePage.key;
    if (slotFitted) {
      const prev = slotPrev.current.get(key);
      slotPrev.current.delete(key);
      setSlot(prev ?? undefined);
      return;
    }
    const sc = Math.min(r.w / img.w, r.h / img.h);
    const nr = { x: r.x + (r.w - img.w * sc) / 2, y: r.y + (r.h - img.h * sc) / 2, w: img.w * sc, h: img.h * sc };
    slotPrev.current.set(key, design.slots?.[key] ?? null);
    setDesign((d) => ({
      ...d,
      slots: { ...(d.slots ?? {}), [key]: nr },
      photos: { ...d.photos, [key]: { ...(own && own.src >= 0 ? own : {}), src, pl: fitPl(nr, img) } },
    }));
  }
  function scalePl(pl: CalPlacement, f: number): CalPlacement {
    const r = page.photo!;
    // ✂️ ไดคัท: ย่อได้ถึง 20% ของขนาดตอนใส่รูป (เดิม 20% ของผืน = ย่อแทบไม่ได้ เพราะรูปเริ่มที่ ~25% ของผืนอยู่แล้ว)
    const min = fmt.diecut && design.cut?.ref ? design.cut.ref.wMm * 0.2 : (Math.max(r.w, r.h) / Math.max(pl.wMm, pl.hMm)) * pl.wMm * 0.2;
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
          pl: fitPl(np.photo, srcs[own.src]),
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
    // ✂️ ขอบรอบรูป (stroke) อยู่ใต้ลาย — วาดก่อนหน้า (พื้นผืนไดคัทใส)
    if (fmt.diecut && cutRes?.stroke.length) {
      ctx.save();
      const u = k / cutRes.scale;
      ctx.setTransform(u, 0, 0, u, cutRes.box.x * k, cutRes.box.y * k);
      ctx.beginPath();
      pathCurves(ctx, cutRes.stroke);
      ctx.fillStyle = cutP.strokeColor;
      ctx.fill("evenodd");
      ctx.restore();
    }
    drawPage(ctx, k, fmt, basePage, design, back, imgs, { preview: true });

    // ไกด์บนจอ (ไม่ติดไปกับไฟล์พิมพ์): ตัดตกจาง ๆ + เส้นตัดแดง + เขตปลอดภัยฟ้า + กรอบชิ้นที่เลือก
    ctx.save();
    const b = fmt.bleed * k;
    if (fmt.diecut) {
      // ✂️ ไดคัท: ไม่มีตัดตก/เส้นตัดสี่เหลี่ยม — เส้นตัดตามรูปลายวาดด้านล่าง (piece)
    } else if (fmt.dieline) {
      // ☕✂️ ไดคัทตามทรง (ปลอกแก้วขนาดกำหนดเอง): นอกขอบตัดตก = ขาวทึบ (ผู้ใช้สั่ง 16 ต.ค. 69 — ไม่ได้พิมพ์ใช้)
      // ระหว่างขอบตัดตกกับเส้นตัด = จาง (ลายควรเลยถึงตรงนี้) · เส้นดำบาง = ขอบตัดตก
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, PW, PH);
      dieCurvesPath(ctx, fmt.dieline.bleed, k, fmt.bleed);
      ctx.fillStyle = "#ffffff";
      ctx.fill("evenodd");
      ctx.beginPath();
      dieCurvesPath(ctx, fmt.dieline.bleed, k, fmt.bleed);
      trimPath(ctx, k, fmt);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fill("evenodd");
      ctx.beginPath();
      dieCurvesPath(ctx, fmt.dieline.bleed, k, fmt.bleed);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = "rgba(28,25,23,.6)";
      ctx.stroke();
      ctx.restore();
    } else if (guide) {
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
      // ตำแหน่ง/ขนาดรูปไกด์บนผืน (มม.) — fill = รูปเป็นกรอบการ์ดใบเดียวพอดีผืน (skin ของไฟล์หลายช่อง) → ปูเต็มผืน
      // 🛡 สกินที่สัดส่วนไม่เท่าผืน (ครอปชิดชิ้นงาน ไม่ใช่เท่าอาร์ตบอร์ด) ห้ามยืดให้เต็ม — ย่อให้พอดีผืนแล้ววางกึ่งกลางแทน
      // (ปลอกแก้ว 16 ต.ค. 69: สกิน 3.2:1 ถูกยืดลงผืน 2:1 จนปลอกสูงเกินจริง ~70%)
      let gx = 0, gy = 0, gw = W, gh = H;
      if (guide.fill) {
        const ar = guideImg.naturalWidth / Math.max(1, guideImg.naturalHeight);
        if (Math.abs(ar / (W / H) - 1) > 0.02) {
          gw = Math.min(W, H * ar);
          gh = gw / ar;
          gx = (W - gw) / 2;
          gy = (H - gh) / 2;
        }
      } else {
        gw = guide.wMm;
        gh = guide.hMm;
        gx = (W - gw) / 2;
        gy = (H - gh) / 2;
      }
      // 🎯 เหมือนเปิดใน Illustrator (เจ้าของร้านส่งภาพเทียบ 16 ต.ค. 69 "มันต้องเป็นแบบภาพที่ 1"):
      //   มีรูปแล้ว = วงขอบเห็นรูปทะลุลายทแยงแดง (multiply) · นอกเส้นตัดขาว (mask)
      //   ช่องรูปยังว่าง = วงขอบขาว+ลายทแยงเหมือนไฟล์เปล่า (over) — ช่องว่างสีเทาฟ้าของระบบไม่โผล่ในวงขอบ
      const slotEmpty = !!basePage.photo && !photoOf(layPage(fmt, basePage, design), design, imgs);
      if (guideFx.over && slotEmpty) {
        ctx.drawImage(guideFx.over, gx * k, gy * k, gw * k, gh * k);
      } else {
        // ⬜ ทาขาวทึบนอกเส้นตัด ก่อนวางไกด์ — รูปส่วนที่ถูกตัดทิ้งจะไม่โผล่ที่มุม · ใช้เส้นไดคัทเวกเตอร์ของเทมเพลต (tplCut) เท่านั้น
        //    (ไม่มีเส้นเวกเตอร์ = ไม่ทา ปล่อยรูปเต็มผืนแบบเดิม ดีกว่าทาขาวรั่วเป็นแถบเข้าวงขอบ)
        if (tplCut) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W * k, H * k);
          for (const c of tplCut) {
            ctx.moveTo(c.s[0] * k, c.s[1] * k);
            for (const g of c.g) ctx.bezierCurveTo(g[0] * k, g[1] * k, g[2] * k, g[3] * k, g[4] * k, g[5] * k);
            ctx.closePath();
          }
          ctx.fillStyle = "#ffffff";
          ctx.fill("evenodd");
          ctx.restore();
        }
        // 🌗 วัดความมืดของภาพใต้ไกด์ก่อนวางเส้น (ภาพย่อ ~160px · อ่านพิกเซลถูก) — ใช้ทาเส้นขาวเฉพาะจุดมืด (ดู guideLines)
        let dark: HTMLCanvasElement | null = null;
        if (guideLines) {
          try {
            const sw = 160;
            const sh = Math.max(1, Math.round((sw * gh) / Math.max(0.1, gw)));
            const dc = document.createElement("canvas");
            dc.width = sw;
            dc.height = sh;
            const dx = dc.getContext("2d", { willReadFrequently: true });
            if (dx) {
              dx.drawImage(cv, gx * k, gy * k, gw * k, gh * k, 0, 0, sw, sh);
              const im = dx.getImageData(0, 0, sw, sh);
              const d = im.data;
              let any = false;
              for (let i = 0; i < d.length; i += 4) {
                const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                // ความสว่าง ≤ 0.32 = มืดเต็มที่ (เส้นขาวทึบ) · ≥ 0.52 = สว่าง (ไม่ทา) · ระหว่างนั้นค่อย ๆ จาง
                const t = Math.max(0, Math.min(1, (0.52 - l) / 0.2));
                d[i] = d[i + 1] = d[i + 2] = 255;
                d[i + 3] = Math.round(t * 255);
                if (t > 0) any = true;
              }
              if (any) {
                dx.putImageData(im, 0, 0);
                dark = dc;
              }
            }
          } catch {
            dark = null;
          }
        }
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(guideImg, gx * k, gy * k, gw * k, gh * k);
        ctx.restore();
        if (guideLines && dark) {
          // เส้นขาว = มาสก์เส้น ∩ เขตมืด (destination-in) แล้ววางทับแบบปกติ
          const lw = Math.max(1, Math.round(gw * k));
          const lh = Math.max(1, Math.round(gh * k));
          const lc = document.createElement("canvas");
          lc.width = lw;
          lc.height = lh;
          const lx = lc.getContext("2d");
          if (lx) {
            lx.drawImage(guideLines, 0, 0, lw, lh);
            lx.globalCompositeOperation = "destination-in";
            lx.imageSmoothingEnabled = true;
            lx.drawImage(dark, 0, 0, lw, lh);
            ctx.drawImage(lc, gx * k, gy * k);
          }
        }
      }
    } else if (guide && !tplGeneric) {
      // รูปเทมเพลตโหลดไม่ได้ (เช่น หน้าเปิดค้างไว้ก่อนอัปเทมเพลตใหม่) — เส้นตัดทึบบาง ๆ แบบไฟล์เทมเพลต ไม่ใช้ลายทแยง
      // (ยกเว้น tpl@ — กรอบตัดของมันไม่ใช่เส้นตัดจริง ดูคอมเมนต์ tplGeneric)
      ctx.lineWidth = dpr;
      ctx.strokeStyle = "rgba(220,38,38,.85)";
      ctx.beginPath();
      trimPath(ctx, k, fmt);
      ctx.stroke();
    } else if (!fmt.diecut && !fmt.dieline) {
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = "rgba(220,38,38,.85)";
      ctx.beginPath();
      trimPath(ctx, k, fmt);
      ctx.stroke();
    }
    /**
     * 🎯 เส้นตัดเห็นชัดทุกพื้น (ผู้ใช้แจ้ง 14 ต.ค. 69 "เส้นไดคัทยังกลมกลืนกับรูป") — เส้นแดงของเทมเพลตวาดแบบ multiply
     * บนรูปเข้มจึงจมหาย (เดิมปรับสีทีละท่อน ~8px เป็นขาว/ดำ เห็นเป็นเส้นขาด ๆ) → วาดเส้นตัดทับอีกชั้นแบบต่อเนื่อง:
     * ขอบขาวหนา (ตัดกับพื้นเข้ม) + แกนแดง (ตัดกับพื้นสว่าง) · เทมเพลต = เส้นทึบ · ไม่มีเทมเพลต = เส้นประ
     */
    // เทมเพลตที่ไม่มีเส้นตัดแดง (แผ่นรองเมาส์ ฯลฯ) = ขอบในไฟล์เทมเพลตคือไกด์ ไม่วาดสี่เหลี่ยมตัดทับ · tpl@ ไม่วาดเลย (tplGeneric)
    if (!fmt.diecut && !tplGeneric && !(guideImg && guide && !guideRed)) {
      ctx.save();
      if (!guide && !fmt.dieline) ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      trimPath(ctx, k, fmt);
      // ☕ รอยกรีดของปลอกแก้ว (เส้นเปิด) — เส้นตัดเหมือนกัน วาดชุดเดียวกัน
      if (fmt.dieline) dieCurvesPath(ctx, fmt.dieline.slits, k, fmt.bleed, true);
      ctx.lineWidth = Math.max(2, 3.2 * dpr);
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.stroke();
      ctx.lineWidth = Math.max(1, 1.4 * dpr);
      ctx.strokeStyle = "#e11d48";
      ctx.stroke();
      ctx.restore();
    }
    if (fmt.diecut) {
      // ✂️ พื้นที่จัดลาย (จัตุรัสเทาจาง) + รองขาว + เส้นตัด (ขาวหนา + ชมพู) + รูห่วง — คิดสดจากลายบนผืน
      ctx.save();
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = cutView.bg === "dark" ? "rgba(255,255,255,.3)" : "rgba(120,113,108,.35)";
      // กรอบขนาดเกาะ "ตัวชิ้นงาน" (ไม่รวมติ่ง) ตามที่คิดได้จริง — ลายซูมใหญ่แค่ไหน ชิ้นก็ยังเท่าที่สั่ง ป้ายจึงชี้ถูกเสมอ
      // ยังไม่มีลาย = จัตุรัสพื้นที่จัดลายตามเดิม
      let sx = b, sy = b, sw = fmt.trimW * k, sh = fmt.trimH * k;
      if (cutRes) {
        const u = k / cutRes.scale;
        const bodyW = cutRes.bodyW * u;
        const bodyH = cutRes.bodyH * u;
        // ตัวชิ้นงานอยู่ตรงกลางกรอบเส้นตัดทั้งชิ้นแนวนอน · ชิดล่างแนวตั้ง (ติ่งอยู่บน)
        sx = cutRes.box.x * k + (cutRes.bounds.x0 + (cutRes.bounds.x1 - cutRes.bounds.x0) / 2) * u - bodyW / 2;
        sy = cutRes.box.y * k + cutRes.bounds.y1 * u - bodyH;
        sw = bodyW;
        sh = bodyH;
      }
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = cutView.bg === "dark" ? "rgba(255,255,255,.55)" : "rgba(87,83,78,.6)";
      ctx.fillText(`ขนาด ${fmt.diecut.size / 10} ซม.`, sx + sw, sy + sh + 4 * dpr);
      ctx.restore();
      if (cutRes) {
        ctx.save();
        const u = k / cutRes.scale; // พิกเซลจอ ต่อ มม.จริง
        ctx.translate(cutRes.box.x * k, cutRes.box.y * k);
        ctx.scale(u, u);
        ctx.setLineDash([]);
        if (cutView.white && cutRes.white.length) {
          ctx.beginPath();
          pathCurves(ctx, cutRes.white);
          ctx.setLineDash([2 / u * dpr, 2 / u * dpr]);
          ctx.lineWidth = dpr / u;
          ctx.strokeStyle = "rgba(14,165,233,.7)";
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (cutView.line) {
          ctx.beginPath();
          pathCurves(ctx, cutRes.cut);
          if (cutRes.hole) {
            const hh = cutRes.hole;
            ctx.moveTo(hh.cx + hh.r, hh.cy);
            ctx.arc(hh.cx, hh.cy, hh.r, 0, Math.PI * 2);
          }
          ctx.lineWidth = (3.2 * dpr) / u;
          ctx.strokeStyle = "rgba(255,255,255,.95)";
          ctx.stroke();
          ctx.lineWidth = (1.6 * dpr) / u;
          ctx.strokeStyle = "#ec4899";
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.lineWidth = dpr;
    // เส้นเขตปลอดภัยสีฟ้าเอาออกแล้ว (ผู้ใช้สั่ง 13 ต.ค. 69)
    const se = elements.find((e) => e.id === sel && e.page === basePage.key);
    // เลือกช่องรูปหลักอยู่ = กรอบฟ้ารอบช่อง (คู่กับแถบเครื่องมือลอยใต้ช่อง)
    if (!se && slotFocus && page.photo && tool === "photo") {
      // 🖼 ช่องรูปหลักที่เลือก แบบ Printbox — กรอบ + จุดจับ 8 จุด (ปรับขนาดช่อง) + วงกลมลูกศรกลางรูป (ลากเลื่อนรูป)
      // กรอบฟ้า + จุดจับวาดเป็น HTML ทับแคนวาส (renderSelOverlay) — ช่องชิดขอบการ์ดจะได้ไม่โดนตัดครึ่งวง
      const r = page.photo;
      const phc = photoOf(page, design, imgs);
      // ✂️ ไดคัท: วงลูกศรอยู่กลาง "รูป" ที่วาง (ช่อง = ทั้งผืน)
      if (phc) drawPanIcon(ctx, (fmt.diecut ? phc.pl.cxMm : r.x + r.w / 2) * k, (fmt.diecut ? phc.pl.cyMm : r.y + r.h / 2) * k, dpr);
    }
    const gr = gridOf(page, design);
    if (!se && gridSel && gr) {
      // 📅 ตารางปฏิทินที่เลือก — กรอบฟ้า + จุดจับ 8 จุด วาดเป็น HTML (renderSelOverlay)
    }
    if (se) {
      // กรอบฟ้า + จุดจับ (ข้อความ 4 มุม · อื่น ๆ 8 จุด) วาดเป็น HTML (renderSelOverlay)
      if (se.kind === "photo" && se.src != null && imgs[se.src]) drawPanIcon(ctx, se.x * k, se.y * k, dpr);
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt, basePage, design, back, imgs, fontTick, sel, slotFocus, tool, page, W, H, guideImg, guide, guideRed, guideFx, guideLines, tplCut, gridSel, cutRes, cutView, cutP.strokeColor]);

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
        } else if (fmt.dieline) {
          // ☕ รูปย่อปลอกแก้วไดคัทตามทรง = ทรงถึงขอบตัดตก (นอกนั้นขาว เหมือนบนเวที)
          ctx.globalCompositeOperation = "destination-in";
          ctx.beginPath();
          dieCurvesPath(ctx, fmt.dieline.bleed, tw / W, fmt.bleed);
          ctx.fill();
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cv.width, cv.height);
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
    // ✂️ ไดคัท: ช่องรูป = ทั้งผืน ไม่มีการย่อ/ขยาย/ย้ายช่อง (ย้ายรูปตรง ๆ แทน) — ดูบั๊ก 14 ต.ค. 69 ด้านล่าง
    if (slotFocus && page.photo && !selEl && tool === "photo" && !fmt.diecut) {
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
          keep: cur ? ((design.photos[basePage.key]?.src ?? -1) >= 0 ? design.photos[basePage.key] : { src: fallbackSrc, pl: cur.pl }) : undefined,
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
    // 📮 แตะลายโปสการ์ด (ยังไม่มีลายของลูกค้า) = เลือกลาย → ลบ/เปลี่ยนเป็นลายตัวเองจากแถบด้านบน (ไม่เปิดหน้าต่างเลือกไฟล์ทันที · ผู้ใช้แจ้ง 13 ต.ค. 69)
    if (!cur && page.kind === "postback" && postOnHere && page.photo && inRect(p, page.photo)) {
      setTool("photo");
      return;
    }
    if (!cur && page.photo && inRect(p, page.photo)) {
      // แตะช่องรูปที่ยังว่าง = เลือกรูปใส่ช่องนี้เลย
      pointers.current.delete(e.pointerId);
      slotInputRef.current?.click();
      return;
    }
    /**
     * 🐛 14 ต.ค. 69 "กดซูมแล้วคลิกที่ภาพ ภาพขยายใหญ่เอง": คลิกบนรูป = เริ่มลาก "ย้ายช่องรูป" (slot-move)
     * ขยับแม้ 0.x พิกเซล → setSlot → keepCover ขยายรูปให้คลุมช่องเต็ม — ช่องของงานไดคัทคือทั้งผืน
     * รูปที่ลูกค้าย่อไว้เลยเด้งใหญ่เต็มผืนทันที · ไดคัท: ลากบนรูป = ย้ายรูปเฉย ๆ (ขนาดคงเดิม)
     */
    if (fmt.diecut && cur && page.photo) {
      // โดนตัวรูปจริง (ไม่ใช่ช่องทั้งผืน) ถึงจะย้าย · แตะพื้นว่าง = ยกเลิกเลือก
      const plr = { x: cur.pl.cxMm - cur.pl.wMm / 2, y: cur.pl.cyMm - cur.pl.hMm / 2, w: cur.pl.wMm, h: cur.pl.hMm };
      if (inRect(p, plr)) {
        setSlotFocus(true);
        setTool("photo");
        drag.current = { kind: "photo", pl: cur.pl, x: p.x, y: p.y };
      } else setSlotFocus(false);
      return;
    }
    if (cur && page.photo && inRect(p, page.photo)) {
      // ลากในช่องรูป = ย้ายทั้งช่อง (รูปตามไปด้วย) — เลื่อนรูปในช่องใช้วงกลมกลางรูป/ล้อเมาส์ซูม
      const ownP = design.photos[basePage.key];
      drag.current = {
        kind: "slot-move",
        r0: { ...page.photo },
        keep: ownP && ownP.src >= 0 ? ownP : { src: fallbackSrc, pl: cur.pl },
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
      // มุม = รูปย่อ-ขยายตามช่อง (แบบ Printbox) · กลางขอบ = ครอปเพิ่ม-ลด รูปคงขนาด
      if (d.axis === "xy" && d.keep) {
        const pl = d.keep.pl;
        const f = Math.max(r.w / d.r0.w, r.h / d.r0.h);
        setSlot(r, {
          ...d.keep,
          pl: {
            ...pl,
            cxMm: r.x + (pl.cxMm - d.r0.x) * (r.w / d.r0.w),
            cyMm: r.y + (pl.cyMm - d.r0.y) * (r.h / d.r0.h),
            wMm: pl.wMm * f,
            hMm: pl.hMm * f,
          },
        });
      } else setSlot(r, d.keep);
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
        // มุม = รูปขยาย/ย่อตามกรอบ (zoom/ox/oy เดิม = สัดส่วนเดิมในกรอบ) · กลางขอบ = ครอปเพิ่ม-ลด รูปคงขนาด
        const keepImg = (patch: Partial<CalElement>): Partial<CalElement> => {
          const im = d.img;
          if (!im || d.axis === "xy") return patch;
          const w = patch.w ?? el.w;
          const h = patch.h ?? el.h;
          const x = patch.x ?? el.x;
          const y = patch.y ?? el.y;
          const base = Math.max(w / im.iw, h / im.ih);
          const zoom = Math.max(Math.min(w / im.iw, h / im.ih) / base, im.s / base);
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
          zoom: clamp((fr.zoom ?? 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), containZoom(fr, imgs[fr.src!]!), 4),
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
  const curSrc = own ? srcs[own.src] : srcs[fallbackSrc];
  /** ช่องรูปหลักหดพอดีรูปอยู่ (กด ⤢ แล้ว) */
  const slotFitted = !!page.photo && !!curSrc && slotPrev.current.has(basePage.key) && Math.abs(page.photo.w / page.photo.h - curSrc.w / curSrc.h) < 0.01;
  const zoomPct = cur && page.photo && curSrc ? Math.round((cur.pl.wMm / coverPlacement(page.photo, curSrc).wMm) * 100) : 100;
  const dpi = cur && curSrc ? Math.round(curSrc.w / (cur.pl.wMm / 25.4)) : 0;
  const covers = cur && page.photo ? placementCovers(cur.pl, page.photo) : true;
  const isCover = coverPage?.key === basePage.key;
  const layouts = layoutsOf(fmt, basePage);

  /**
   * 📅 หน้าตารางเดือนที่ปรับไปพร้อมกันได้ (ผู้ใช้สั่ง 14 ต.ค. 69 "เลือกได้ว่าจะปรับทั้ง 12 เดือน หรือแค่หน้านั้น")
   * = หน้าเดือนชนิดเดียวกันที่ใช้เลย์เอาต์เดียวกับหน้านี้ (สลับข้างคนละแบบ ตำแหน่งตั้งต้นต่างกัน ไม่ลากไปด้วย)
   */
  const gridPeers = useMemo(() => {
    if (basePage.month == null || !basePage.grid) return [] as string[];
    const lay0 = design.layouts?.[basePage.key] ?? "";
    return [
      ...new Set(
        vpages
          .filter((v) => v.base.month != null && v.base.kind === basePage.kind && v.base.grid)
          .map((v) => resolve(v).key)
          .filter((k) => (design.layouts?.[k] ?? "") === lay0),
      ),
    ];
  }, [basePage, vpages, resolve, design.layouts]);
  /** ปรับตารางทุกเดือน (true) หรือเฉพาะหน้านี้ — จำไว้ตลอดที่เปิดจอ */
  const [gridAll, setGridAll] = useState(false);
  /** 📅 ตั้งตำแหน่ง/ขนาดตารางปฏิทินของหน้านี้ — หรือทุกเดือน (gridAll) · ไม่ส่ง = กลับตามเลย์เอาต์ */
  function setGrid(r?: { x: number; y: number; w: number; h: number }, all = gridAll) {
    const keys = all && gridPeers.length > 1 ? gridPeers : [page.key];
    setDesign((d) => {
      const grids = { ...(d.grids ?? {}) };
      for (const key of keys)
        if (r) grids[key] = { ...r };
        else delete grids[key];
      return { ...d, grids: Object.keys(grids).length ? grids : undefined };
    });
  }
  /** 🗑 หน้าไม่บังคับที่ลบออก (CalDesign.pageOff) */
  const pageOffSet = useMemo(() => new Set(design.pageOff ?? []), [design.pageOff]);
  /**
   * 🗑 ลบ/ใส่หน้าไม่บังคับกลับ (หลังปก/หลังแผ่นท้าย) — ลบ = ล้างรูป/ชิ้นส่วนของหน้านั้น (พิมพ์เป็นหน้าขาว) แล้วเลื่อนไปหน้าก่อนหน้า
   * ใส่กลับ = หน้าว่างให้ออกแบบใหม่ + เปิดหน้านั้น
   */
  function setPageOff(key: string, off: boolean, idx: number) {
    setDesign((d) => {
      const set = new Set(d.pageOff ?? []);
      if (off) set.add(key);
      else set.delete(key);
      const photos = { ...d.photos };
      if (off) delete photos[key];
      return {
        ...d,
        photos,
        elements: off ? (d.elements ?? []).filter((e) => e.page !== key) : d.elements,
        pageOff: set.size ? [...set] : undefined,
      };
    });
    if (off) {
      setSel(null);
      setSlotFocus(false);
      if (pageIdx === idx) setPageIdx(Math.max(0, idx - 1));
    } else setPageIdx(idx);
  }
  /**
   * 🗑 ลบ/ใส่ตารางปฏิทินกลับ (ผู้ใช้สั่ง 14 ต.ค. 69 "ตารางปฏิทินกดลบได้") — ตาม "หน้านี้/ทุกเดือน" เหมือนย้ายตาราง
   * ลบแล้วหน้านั้นเหลือแต่รูป/ชิ้นส่วน · ใส่กลับได้จากปุ่ม "📅 ใส่ตารางปฏิทินกลับ" บนภาพ
   */
  function setGridOff(off: boolean, all = gridAll) {
    const keys = all && gridPeers.length > 1 ? gridPeers : [page.key];
    setDesign((d) => {
      const set = new Set(d.gridOff ?? []);
      for (const k of keys)
        if (off) set.add(k);
        else set.delete(k);
      const nd = { ...d, gridOff: set.size ? [...set] : undefined };
      // ช่องรูปเปลี่ยนขนาด (เต็มหน้า ↔ ตามเลย์เอาต์) → รูปที่ใส่ไว้จัดให้เต็มช่องใหม่
      const photos = { ...d.photos };
      for (const k of keys) {
        const own = photos[k];
        const vp = vpages.find((v) => v.page.key === k);
        const np = vp && layPage(fmt, vp.page, nd).photo;
        if (own && own.src >= 0 && srcs[own.src] && np) photos[k] = { ...own, pl: fitPl(np, srcs[own.src]) };
      }
      return { ...nd, photos };
    });
    if (off) setGridSel(false);
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
        return <span className={`${box} bg-stone-100`}>{pic(own ? own.src : fallbackSrc)}</span>;
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

  /**
   * 🔵 กรอบเลือก + จุดจับ 8 จุด เป็น HTML ทับแคนวาส (ไม่รับเมาส์ — แคนวาสจับเอง)
   * วาดในแคนวาสแล้วจุดที่ขอบการ์ดโดนตัดครึ่งวง (ผู้ใช้แจ้ง 13 ต.ค. 69) · HTML ล้นขอบการ์ดออกไปได้เต็มวง
   */
  function renderSelOverlay() {
    if (locked) return null;
    const ctx = canvasRef.current?.getContext("2d");
    const pad = Math.min(W, H) * 0.012;
    let r: Rect | undefined;
    let p = 0;
    let n = 8;
    if (selEl && ctx) {
      r = elementBox(ctx, selEl);
      p = pad;
      n = selEl.kind === "text" ? 4 : 8;
    } else if (slotFocus && page.photo && tool === "photo") {
      // ✂️ ไดคัท: กรอบรอบรูปที่วาง (ไม่ใช่ช่องทั้งผืน) และไม่มีจุดจับ (ย่อ/ขยายด้วยซูม/บีบนิ้ว)
      // ✂️ ไดคัท: ไม่วาดกรอบฟ้า/จุดจับเลย (ผู้ใช้สั่ง 14 ต.ค. 69 "ไม่ควรมี") — เหลือวงลูกศร ✥ กลางรูปพอ
      if (fmt.diecut) return null;
      r = page.photo;
    } else if (gridSel) {
      r = gridOf(page, design);
      p = pad;
    }
    if (!r) return null;
    const pct = (v: number, of: number) => `${(v / of) * 100}%`;
    type PE = React.PointerEvent<HTMLCanvasElement>;
    const handlePointer = {
      down: (e: React.PointerEvent<HTMLSpanElement>) => onPointerDown(e as unknown as PE),
      move: (e: React.PointerEvent<HTMLSpanElement>) => onPointerMove(e as unknown as PE),
      up: (e: React.PointerEvent<HTMLSpanElement>) => onPointerUp(e as unknown as PE),
    };
    return (
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <div
          className="absolute border-[1.5px] border-sky-600/95"
          style={{ left: pct(r.x - p, W), top: pct(r.y - p, H), width: pct(r.w + p * 2, W), height: pct(r.h + p * 2, H) }}
        />
        {handlesOf(r, p)
          .slice(0, n)
          .map(([hx, hy], i) => (
            // จุดที่ล้นออกนอกการ์ด แคนวาสจับไม่ถึง → จุดรับเมาส์เองแล้วส่งต่อให้ตัวจับลากของแคนวาส (พิกัดคิดจาก clientX/Y เหมือนกัน)
            <span
              key={i}
              onPointerDown={handlePointer.down}
              onPointerMove={handlePointer.move}
              onPointerUp={handlePointer.up}
              onPointerCancel={handlePointer.up}
              className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-[1.5px] border-stone-500 bg-white shadow-sm"
              style={{ left: pct(hx, W), top: pct(hy, H), cursor: HANDLE_CURSOR[i] }}
            />
          ))}
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
  /**
   * 🧊 ดูแบบ 3D (ปฏิทินตั้งโต๊ะ — หน้าที่มี sheet) · วาดทุกหน้าจากตัววาดจริง (ตัดตัดตกออก) เป็นรูปเล็ก แล้วจับคู่หน้า/หลังตามแผ่น
   * (ผู้ใช้สั่ง 14 ต.ค. 69)
   */
  const hasSheets = copies === 1 && fmt.pages.some((p) => p.sheet);
  const [flip3d, setFlip3d] = useState<FlipSheet[] | "loading" | null>(null);
  async function open3d() {
    setFlip3d("loading");
    try {
      await ensureFonts(fontKeys);
      const k = 1200 / Math.max(fmt.trimW, fmt.trimH); // ซูมได้ถึง 3 เท่าในจอ 3D — วาดละเอียดพอไม่แตก
      const shot = (p: CalPage) => {
        const cv = document.createElement("canvas");
        cv.width = Math.round(fmt.trimW * k);
        cv.height = Math.round(fmt.trimH * k);
        const ctx = cv.getContext("2d");
        if (!ctx) return undefined;
        ctx.translate(-fmt.bleed * k, -fmt.bleed * k);
        drawPage(ctx, k, fmt, p, design, back, imgs, { preview: true });
        return cv.toDataURL("image/jpeg", 0.85);
      };
      const n = Math.max(...fmt.pages.map((p) => p.sheet?.n ?? 0));
      const out: FlipSheet[] = [];
      for (let i = 1; i <= n; i++) {
        const f = fmt.pages.find((p) => p.sheet?.n === i && p.sheet.side === "front");
        const b = fmt.pages.find((p) => p.sheet?.n === i && p.sheet.side === "back");
        out.push({ front: f && shot(f), back: b && shot(b), frontName: f?.name ?? "ว่าง", backName: b?.name ?? "ว่าง" });
      }
      setFlip3d(out);
    } catch {
      setFlip3d(null);
      setErr("เตรียมภาพ 3D ไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  }

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
      <div {...barWrap(left, top)} onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className={`flex items-center gap-1 rounded-2xl bg-white px-1.5 py-1 text-xs font-bold text-stone-700 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 ${narrow ? "mx-auto flex-wrap justify-center" : ""}`}
        >
          {/* 🎨 แถบตารางปฏิทิน (ผู้ใช้ขอออกแบบใหม่ 14 ต.ค. 69) — หัวสั้น · สวิตช์ใช้กับหน้าไหน · ปุ่มไอคอนพร้อมป้ายบอก แบบแถบรูป */}
          <span
            className="flex shrink-0 items-center gap-1.5 pl-1.5 pr-1 text-[12px] font-extrabold text-stone-700"
            title="ลากเพื่อย้าย · จับจุดวงกลมเพื่อย่อ-ขยาย"
          >
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-50 text-[13px]">📅</span>
            ตารางปฏิทิน
          </span>
          {gridPeers.length > 1 && (
            <>
              <span className="mx-0.5 h-6 w-px shrink-0 bg-stone-200" />
              {/* ปรับเฉพาะหน้านี้ / ทุกเดือน — เลือก "ทุกเดือน" = ก๊อปตำแหน่ง/ขนาดของหน้านี้ไปทุกเดือนทันที */}
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="hidden pl-1 text-[11px] font-semibold text-stone-400 sm:inline">ปรับ</span>
                <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="ปรับตารางหน้าไหน">
                  {[
                    { all: false, label: "หน้านี้", hint: "ย้าย/ย่อ-ขยายเฉพาะหน้านี้" },
                    { all: true, label: "ทุกเดือน", hint: `ทั้ง ${gridPeers.length} เดือนไปพร้อมกัน` },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={gridAll === o.all}
                      title={o.hint}
                      onClick={() => {
                        setGridAll(o.all);
                        if (o.all) setGrid(design.grids?.[page.key], true);
                      }}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] transition ${
                        gridAll === o.all ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      {o.label}
                      {o.all && (
                        <span
                          className={`rounded-full px-1.5 text-[10px] font-extrabold ${gridAll === o.all ? "bg-white/25 text-white" : "bg-stone-200 text-stone-500"}`}
                        >
                          {gridPeers.length}
                        </span>
                      )}
                    </button>
                  ))}
                </span>
              </span>
            </>
          )}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-stone-200" />
          <BarBtn title="จัดกึ่งกลางแนวนอน" onClick={() => setGrid({ ...gr, x: (W - gr.w) / 2 })}>
            <Ico n="center" />
          </BarBtn>
          <BarBtn title="กลับขนาด/ตำแหน่งเดิม" disabled={!changed} onClick={() => setGrid(undefined)}>
            <Ico n="reset" />
          </BarBtn>
          <BarBtn title={gridAll && gridPeers.length > 1 ? `ลบตารางปฏิทินทั้ง ${gridPeers.length} เดือน (ปุ่ม Delete)` : "ลบตารางปฏิทินหน้านี้ (ปุ่ม Delete)"} danger onClick={() => setGridOff(true)}>
            <Ico n="trash" />
          </BarBtn>
        </div>
      </div>
    );
  }
  /** 📅 หน้านี้ลบตารางปฏิทินไปแล้ว — ปุ่มเล็กบนภาพไว้ใส่กลับ (หน้านี้ · หรือทุกเดือนที่ลบไว้) */
  function renderGridRestore() {
    if (!page.grid || !(design.gridOff ?? []).includes(page.key)) return null;
    const offPeers = gridPeers.filter((k) => design.gridOff?.includes(k));
    const chip = "rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-extrabold text-sky-700 shadow-[0_4px_16px_rgba(28,25,23,.18)] ring-1 ring-sky-200 hover:bg-sky-50";
    return (
      <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className={chip} onClick={() => setGridOff(false, false)}>
          📅 ใส่ตารางปฏิทินกลับ
        </button>
        {offPeers.length > 1 && (
          <button type="button" className={chip} onClick={() => setGridOff(false, true)}>
            ใส่กลับทุกเดือน ({offPeers.length})
          </button>
        )}
      </div>
    );
  }

  /** 🗑 ลบรูปในช่องรูปหลักของหน้านี้ → ช่องว่าง "Drag here" (src -1 = ว่างโดยตั้งใจ ไม่ยืมรูปหน้าปก) */
  /** 📮 ลายโปสการ์ดของหน้านี้ยังอยู่ไหม · เลือกอยู่ไหม (แตะแล้วมีกรอบฟ้า) */
  const postOnHere = basePage.kind === "postback" && !(design.postOff ?? []).includes(basePage.key);
  const postSelected = postOnHere && slotFocus && !sel && !cur;
  function setPostOff(keys: string[], off: boolean) {
    setDesign((d) => {
      const set = new Set(d.postOff ?? []);
      for (const k of keys)
        if (off) set.add(k);
        else set.delete(k);
      return { ...d, postOff: [...set] };
    });
    if (off) setSlotFocus(false);
  }
  /** 📮 แถบเหนือลายโปสการ์ดที่เลือก: ใส่ลายของคุณแทน · ลบลาย */
  function renderPostBar() {
    if (!postSelected || !page.photo) return null;
    const cssW = canvasRef.current?.clientWidth ?? 0;
    const cssH = canvasRef.current?.clientHeight ?? 0;
    if (!cssW) return null;
    const { left } = barPos(page.photo, cssW, cssH);
    const top = Math.max(-8, (page.photo.y / H) * cssH - 56);
    return (
      <div {...barWrap(left, top)} onPointerDown={(e) => e.stopPropagation()}>
        <div ref={barRef} className="flex items-center gap-1 rounded-2xl bg-white px-1.5 py-1 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200">
          <span className="px-1.5 text-[11px] font-extrabold text-stone-600">📮 ลายโปสการ์ด</span>
          <button
            type="button"
            onClick={() => slotInputRef.current?.click()}
            className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            🖼 ใส่ลายของคุณแทน
          </button>
          <BarBtn title="ลบลายโปสการ์ด (ปุ่ม Delete)" danger onClick={() => setPostOff([basePage.key], true)}>
            <Ico n="trash" />
          </BarBtn>
        </div>
      </div>
    );
  }
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
  overlayRef.current = Array.isArray(flip3d)
    ? () => setFlip3d(null)
    : ask
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
  slotDelRef.current =
    !locked && gridSel && !sel && gridOf(page, design)
      ? () => setGridOff(true)
      : !locked && tool === "photo" && slotFocus && !sel
        ? cur
          ? removeSlotPhoto
          : postSelected
            ? () => setPostOff([basePage.key], true)
            : null
        : null;

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

  /** 🗂 ประกอบ .ai แยกเลเยอร์ของทุกหน้าที่จะพิมพ์ (ชั้นเรียงตามหน้าต่าง Layers) */
  async function makeAi(): Promise<{ file: File; note: string; real: boolean }> {
    await ensureFonts(fontKeys);
    const pages = await renderAiPages({
      fmt,
      pages: printPages.map((v) => ({ name: vname(v).replace(/^\d+\. /, ""), page: v.page })),
      design,
      back,
      imgs,
    });
    // ✂️ เทมเพลตมีเส้นไดคัทจริง (tplCut) → เลเยอร์ "เส้นตัด (CutContour)" เป็นเส้นนั้นแทนกรอบสี่เหลี่ยมสมมุติของ tpl@
    const aiPages: AiPage[] = tplCut
      ? pages.map((p) => ({
          ...p,
          cut: null,
          paths: [
            ...(p.paths ?? []),
            { layer: "เส้นตัด (CutContour)", spot: "CutContour", cmyk: [0, 100, 0, 0] as [number, number, number, number], fill: false, curves: tplCut },
          ],
        }))
      : pages;
    // งานไม่มีปฏิทิน (เข็มกลัด/โปสการ์ด ฯลฯ) ไม่ต่อ "-ปฏิทิน<ปี>" ท้ายชื่อไฟล์ (เดิมได้ "เข็มกลัดพลาสติก-ปฏิทิน2027.ai")
    const stem = (noCal ? title : `${title}-ปฏิทิน${back.year}`).replace(/[\/:*?"<>|]/g, "-").slice(0, 60);
    const r = await buildCalendarAi(aiPages, stem);
    return { file: new File([r.blob], `${stem}${r.real ? "" : "-pdf"}.ai`, { type: "application/postscript" }), note: r.note, real: r.real };
  }

  /** 🖨 ไฟล์ชิ้นงาน .pdf — งานการ์ดชุด (โฟโต้การ์ด) ที่โปรแกรมจัดวางรับ · แบบอื่น = .pdf ทั้งเล่ม (makeBookPdf) */
  const imposeOk = fmt.key.startsWith("card");

  /** 🖨 .pdf ทั้งเล่ม (ผู้ใช้สั่ง 14 ต.ค. 69 "ให้มี .pdf ด้วย" · เฉพาะเจ้าของร้านเหมือน .ai) — ทุกหน้าที่จะพิมพ์ + หน้าเส้นไดคัทท้ายไฟล์ */
  /**
   * @param rendered หน้าที่ประกอบไว้แล้วตอน "ใช้แบบนี้" (ลำดับเดียวกับ printPages) — ใช้ซ้ำได้เลย ไม่ต้องวาดใหม่ทั้งเล่ม
   *   (เดิมวาดทุกหน้าซ้ำอีกรอบ = เวลาเพิ่มเท่าตัวก่อนเริ่มอัปโหลด · ผู้ใช้แจ้ง 15 ต.ค. 69 "อัปโหลดค่อนข้างนาน")
   */
  async function makeBookPdf(rendered?: { name: string; file: Blob }[]): Promise<{ file: File; note: string }> {
    await ensureFonts(fontKeys);
    const pages: { name: string; file: Blob }[] = rendered?.length === printPages.length ? [...rendered] : [];
    for (let i = pages.length; i < printPages.length; i++) {
      const v = printPages[i];
      const name = vname(v).replace(/^\d+\. /, "");
      setBusy(`กำลังทำไฟล์ .pdf หน้า ${i + 1}/${printPages.length}…`);
      const f = await renderPage(fmt, (ctx, k) => drawPage(ctx, k, fmt, v.page, design, back, imgs), "image/jpeg", `${v.page.key}.jpg`);
      if (!f) throw new Error(`ประกอบหน้า "${name}" ไม่สำเร็จ`);
      pages.push({ name, file: f });
    }
    const file = await buildPrintPdf({
      pages,
      wMm: W,
      hMm: H,
      cut: pdfCut,
      name: (noCal ? title : `${title}-ปฏิทิน${back.year}`).slice(0, 60),
    });
    return {
      file,
      note: `ไฟล์เดียว ${pages.length + 1} หน้า — ${pages.length} หน้างาน (รวมตัดตก ${fmt.bleed} มม. · ตั้ง TrimBox ที่เส้นตัด) + หน้าเส้นไดคัทท้ายไฟล์`,
    };
  }

  /**
   * 🖨 ไฟล์ชิ้นงานสำหรับโปรแกรมจัดวาง (localhost:8002 Smart Imposition Pro) — ดู calendar-impose.ts
   * ไฟล์เดียว: ทีละชิ้น ด้านหน้า · ด้านหลัง · เส้นไดคัท (ผู้ใช้สั่ง "รวมอยู่ใน 1 ไฟล์" + "เส้นไดคัทตามจำนวนชิ้นงาน")
   * จำนวนต่อลาย = จำนวนใบของลายนั้น × จำนวนชุดที่สั่ง (ใส่ไว้ในชื่อไฟล์ "= N ชิ้น")
   */
  async function makePdf(): Promise<{ file: File; note: string }> {
    await ensureFonts(fontKeys);
    const sets = Math.max(1, qty ?? 1);
    const groups = [{ card: 0, count: (copies - custom.length) * sets }, ...[...custom].sort((a, b) => a - b).map((c) => ({ card: c, count: sets }))].filter(
      (g) => g.count > 0,
    );
    const designs: PieceDesign[] = [];
    for (const g of groups) {
      const files: File[] = [];
      for (const v of vpages.filter((x) => x.card === g.card)) {
        const f = await renderPage(fmt, (ctx, k) => drawPage(ctx, k, fmt, v.page, design, back, imgs), "image/jpeg", `${v.page.key}.jpg`);
        if (!f) throw new Error(`ประกอบ ${vname(v)} ไม่สำเร็จ`);
        files.push(f);
      }
      designs.push({ front: files[0], back: files[1], count: g.count });
    }
    const duplex = fmt.pages.length > 1;
    const r = await buildPieceFiles({
      designs,
      wMm: W,
      hMm: H,
      cut: pdfCut,
      name: noCal ? title : `${title} ปี ${back.year}`,
      duplex,
    });
    const total = r.counts.reduce((n, c) => n + c, 0);
    return {
      file: r.file,
      note:
        `ไฟล์เดียว ${r.pages} หน้า · ${total} ชิ้น (${copies} ใบ × ${Math.max(1, qty ?? 1)} ชุด) · ` +
        `เรียงทีละชิ้น ${duplex ? "ด้านหน้า · ด้านหลัง · เส้นไดคัท" : "ชิ้นงาน · เส้นไดคัท"} — สำหรับโปรแกรมจัดวาง localhost:8002`,
    };
  }

  async function downloadPdf() {
    if (busy) return;
    setErr("");
    try {
      setBusy(imposeOk ? "กำลังทำไฟล์ .pdf ชิ้นงาน…" : "กำลังทำไฟล์ .pdf…");
      const r = imposeOk ? await makePdf() : await makeBookPdf();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.file);
      a.download = r.file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setAsk({ icon: "🖨", title: imposeOk ? "โหลดไฟล์ .pdf ชิ้นงานแล้ว" : "โหลดไฟล์ .pdf แล้ว", body: r.note, ok: "ตกลง", run: () => {} });
    } catch (e) {
      setErr(e instanceof Error ? `ทำไฟล์ .pdf ไม่สำเร็จ: ${e.message}` : "ทำไฟล์ .pdf ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  /** ⬇ ปุ่มทดสอบของเจ้าของร้าน — โหลด .ai ลงเครื่องเลย ไม่แนบออเดอร์ */
  async function downloadAi() {
    if (busy) return;
    setErr("");
    try {
      setBusy("กำลังทำไฟล์ .ai…");
      const r = await makeAi();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.file);
      a.download = r.file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setAsk({ icon: r.real ? "✅" : "ℹ️", title: "โหลดไฟล์ .ai แล้ว", body: r.note, ok: "ตกลง", run: () => {} });
    } catch (e) {
      setErr(e instanceof Error ? `ทำไฟล์ .ai ไม่สำเร็จ: ${e.message}` : "ทำไฟล์ .ai ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  /** DPI ต่ำสุดของหน้านั้น (ช่องรูปหลัก + กรอบรูป) · ไม่มีรูป = Infinity */
  function pageMinDpi(p: CalPage): number {
    const lp = lay(p);
    const c = photoOf(lp, design, imgs);
    const o = design.photos[p.key];
    const sv = o && o.src >= 0 ? srcs[o.src] : srcs[fallbackSrc];
    const list = [
      c && sv ? Math.round(sv.w / (c.pl.wMm / 25.4)) : Infinity,
      ...elements
        .filter((e) => e.page === p.key && e.kind === "photo" && e.src != null && srcs[e.src])
        .map((e) => Math.round(srcs[e.src!].w / (elementPhotoSize(e, srcs[e.src!]).w / 25.4))),
    ];
    return Math.min(...list);
  }

  /**
   * ✂️ ไฟล์ชิ้นงานไดคัททั้งชุด (ตอน "ใช้แบบนี้" · การ์ดดาวน์โหลดในแผงเอาออกแล้วตามผู้ใช้สั่ง 14 ต.ค. 69)
   * print = ลาย + ขอบสี พื้นใส 300 DPI · white = มาสก์รองขาว · mock = ภาพจำลอง + เส้นตัด · svg = เส้นตัด · ai = .ai เส้นตัด CutContour
   */
  async function makeCutFiles(stem: string, withAi: boolean) {
    if (!fmt.diecut) throw new Error("not diecut");
    await ensureFonts(fontKeys);
    // เส้นตัดจากตำแหน่งอ้างอิง (ไม่ตามซูม) · ลายจริงตามที่ลูกค้าจัด แล้ว clip ตามเส้น
    const r = processCut(renderAlpha(CUT_PPM).data, CUT_PPM, fmt.diecut.size, cutP);
    if (!r) throw new Error("ยังไม่มีลายบนชิ้นงาน — ใส่รูปหรือข้อความก่อน");
    const outPpm = 300 / 25.4;
    const srcPpm = Math.min(outPpm * r.scale, 6000 / Math.max(W, H));
    const { cv } = renderAlpha(srcPpm);
    /** วาดลายทั้งผืน (มม.จริง) ให้ตรงกรอบเส้นตัด แล้ว clip ตามเส้น — ctx ตั้งสเกลพิกเซล/มม.จริงไว้แล้ว */
    const drawArtClipped = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.beginPath();
      pathCurves(ctx, r.cut);
      ctx.clip("evenodd");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cv, -r.box.x * r.scale, -r.box.y * r.scale, (cv.width / srcPpm) * r.scale, (cv.height / srcPpm) * r.scale);
      ctx.restore();
    };
    const drawPieceClipped = (ctx: CanvasRenderingContext2D, withCut: boolean) => {
      if (r.stroke.length) {
        ctx.save();
        ctx.beginPath();
        pathCurves(ctx, r.stroke);
        ctx.fillStyle = cutP.strokeColor;
        ctx.fill("evenodd");
        ctx.restore();
      }
      drawArtClipped(ctx);
      if (!withCut) return;
      ctx.save();
      ctx.lineWidth = 0.25;
      ctx.strokeStyle = "#ec4899";
      ctx.beginPath();
      pathCurves(ctx, r.cut);
      ctx.stroke();
      if (r.hole) {
        ctx.beginPath();
        ctx.arc(r.hole.cx, r.hole.cy, r.hole.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };
    const toFile = (c: HTMLCanvasElement, name: string) =>
      new Promise<File>((res, rej) => c.toBlob((bl) => (bl ? res(new File([bl], name, { type: "image/png" })) : rej(new Error("สร้างไฟล์ภาพไม่สำเร็จ"))), "image/png"));
    const pad = 1;
    /** แคนวาสขนาดเท่ากรอบเส้นตัดทั้งชิ้น (+1 มม.) ที่ ppm พิกเซลต่อ มม.จริง */
    const frame = (ppm: number) => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((r.bounds.x1 - r.bounds.x0 + pad * 2) * ppm));
      c.height = Math.max(1, Math.round((r.bounds.y1 - r.bounds.y0 + pad * 2) * ppm));
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.setTransform(ppm, 0, 0, ppm, (pad - r.bounds.x0) * ppm, (pad - r.bounds.y0) * ppm);
      return { c, ctx };
    };
    const clean = (n: string) => n.replace(/[\/:*?"<>|]/g, "-");
    const pf = frame(outPpm);
    drawPieceClipped(pf.ctx, false);
    const print = await toFile(pf.c, clean(`${stem}-ไดคัท-ไฟล์พิมพ์.png`));
    let white: File | undefined;
    if (r.white.length) {
      const wf = frame(outPpm);
      wf.ctx.beginPath();
      pathCurves(wf.ctx, r.white);
      wf.ctx.fillStyle = "#000";
      wf.ctx.fill("evenodd");
      white = await toFile(wf.c, clean(`${stem}-ไดคัท-รองขาว.png`));
    }
    const mf = frame(Math.min(2000 / Math.max(r.bounds.x1 - r.bounds.x0, r.bounds.y1 - r.bounds.y0), outPpm));
    drawPieceClipped(mf.ctx, true);
    const mock = await toFile(mf.c, clean(`${stem}-ไดคัท.png`));
    const svg = new File([cutSvg(r, pad)], clean(`${stem}-เส้นตัด.svg`), { type: "image/svg+xml" });
    /**
     * 🗂 .ai แยกเลเยอร์แบบปฏิทิน (ผู้ใช้สั่ง 14 ต.ค. 69 "ทำให้ไฟล์ .ai แยก layer โดยดูจากปฏิทิน")
     * ล่าง → บน: รองขาว (spot White · เวกเตอร์) · ขอบรอบรูป · ชั้นลายตามที่จัดใน Layers · เส้นตัด (spot Cut100/Cut50 · เวกเตอร์ · ล็อก)
     * Illustrator ในเครื่อง (cutout-py 8777) = .ai แท้แยกเลเยอร์ · ไม่มี = PDF-.ai แยกชั้น OCG (เหมือนปฏิทิน)
     */
    let ai: File | undefined;
    let aiNote = "";
    if (withAi) {
      try {
        const fw = r.bounds.x1 - r.bounds.x0 + pad * 2;
        const fh = r.bounds.y1 - r.bounds.y0 + pad * 2;
        const fx = (x: number) => Math.round((x - r.bounds.x0 + pad) * 1000) / 1000;
        const fy = (y: number) => Math.round((y - r.bounds.y0 + pad) * 1000) / 1000;
        const vec = (cs: CutResult["cut"]) =>
          cs.map((c) => ({
            s: [fx(c.start.x), fy(c.start.y)] as [number, number],
            g: c.segs.map((g) => [fx(g.c1.x), fy(g.c1.y), fx(g.c2.x), fy(g.c2.y), fx(g.to.x), fy(g.to.y)] as [number, number, number, number, number, number]),
          }));
        const layers: AiLayer[] = [];
        const toBlob = (c: HTMLCanvasElement, type = "image/png") => new Promise<Blob | null>((res) => c.toBlob(res, type));
        /** ครอปส่วนที่มีของ → เลเยอร์ (มม. ในกรอบไฟล์) */
        const pushLayer = async (name: string, c: HTMLCanvasElement, toMm: (px: number, py: number) => { x: number; y: number }, mmPerPx: number) => {
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          const a = ctx.getImageData(0, 0, c.width, c.height).data;
          let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (a[(y * c.width + x) * 4 + 3] > 2) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                y1 = y;
              }
          if (x1 < 0) return;
          const cw = x1 - x0 + 1;
          const ch = y1 - y0 + 1;
          const crop = document.createElement("canvas");
          crop.width = cw;
          crop.height = ch;
          crop.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
          const png = await toBlob(crop);
          if (!png) return;
          const o = toMm(x0, y0);
          layers.push({ name, png, x: o.x, y: o.y, w: cw * mmPerPx, h: ch * mmPerPx });
        };
        // ขอบรอบรูป (stroke) — สีทึบใต้ลาย
        if (r.stroke.length) {
          const sf = frame(outPpm);
          sf.ctx.beginPath();
          pathCurves(sf.ctx, r.stroke);
          sf.ctx.fillStyle = cutP.strokeColor;
          sf.ctx.fill("evenodd");
          await pushLayer("ขอบรอบรูป", sf.c, (x, y) => ({ x: x / outPpm, y: y / outPpm }), 1 / outPpm);
        }
        // ชั้นลายตามลำดับใน Layers (ล่าง → บน) · วาดทีละชั้นที่ความละเอียดไฟล์พิมพ์
        const pg0 = fmt.pages[0];
        for (const L of calLayersOf(fmt, pg0, design, imgs)) {
          if (L.id === LAYER_BG) continue;
          const lc = document.createElement("canvas");
          lc.width = cv.width;
          lc.height = cv.height;
          drawPage(lc.getContext("2d", { willReadFrequently: true })!, srcPpm, fmt, pg0, design, back, imgs, { only: L.id });
          await pushLayer(
            L.name,
            lc,
            (x, y) => ({ x: (x / srcPpm - r.box.x) * r.scale - r.bounds.x0 + pad, y: (y / srcPpm - r.box.y) * r.scale - r.bounds.y0 + pad }),
            r.scale / srcPpm,
          );
        }
        const paths: AiPath[] = [];
        if (r.white.length) paths.push({ layer: "รองขาว (White)", spot: "White", cmyk: [15, 0, 0, 0], fill: true, curves: vec(r.white) });
        paths.push({
          layer: `เส้นตัด (${cutP.cutType})`,
          spot: cutP.cutType,
          cmyk: cutP.cutType === "Cut50" ? [100, 0, 0, 0] : [0, 100, 0, 0],
          fill: false,
          curves: vec(r.cut),
          circles: r.hole ? [[fx(r.hole.cx), fy(r.hole.cy), r.hole.r]] : [],
        });
        const page: AiPage = { name: "ชิ้นงานไดคัท", wMm: fw, hMm: fh, bg: "none", layers, cut: null, paths };
        const res = await buildCalendarAi([page], clean(`${stem}-ไดคัท`));
        aiNote = res.note;
        ai = new File([res.blob], clean(`${stem}-ไดคัท${res.real ? "" : "-pdf"}.ai`), { type: "application/postscript" });
      } catch (e) {
        console.warn("diecut .ai", e);
      }
    }
    const cm1 = (v: number) => Math.round(v) / 10;
    const shapeTh = { contour: "ตามทรง", rect: "เหลี่ยม", rounded: `มุมมน ${cutP.radiusMm} มม.`, circle: "วงกลม", ellipse: "วงรี" }[cutP.shape];
    const methods = [...new Set(srcs.filter((x) => !x.removed && x.bgDone).map((x) => BG_METHODS.find((m) => m.key === x.bgDone)?.label))].join("/");
    const spec =
      ` · ✂️ ${cutP.cutType} เส้นตัด${shapeTh} ระยะ ${cutP.offsetMm} มม.` +
      (cutP.shape === "contour" ? ` · ถมร่อง ${cutP.bridge} · ความโค้ง ${cutP.smooth}${cutP.holes ? " · เว้นรูใน" : ""}${cutP.edits.length ? ` · แก้เฉพาะจุด ${cutP.edits.length} จุด` : ""}` : "") +
      (r.stroke.length ? ` · ขอบ ${cutP.strokeColor} ${cutP.strokeMm} มม.` : "") +
      ` · ตัวชิ้นงาน ${cm1(r.bodyW)}×${cm1(r.bodyH)} ซม. (วัตถุ ${cm1(r.objW)}×${cm1(r.objH)} ซม.)` +
      (r.extras.length ? ` · ${r.extras.join(" · ")}` : "") +
      (fmt.diecut.hole ? ` (เนื้อรอบรู ${cutP.ringMm} · ห่างงาน ${cutP.holeGapMm}${cutP.holeXMm ? ` · เลื่อน ${cutP.holeXMm}` : ""} มม.)` : " · ไม่เจาะรู") +
      (methods ? ` · หาขอบงาน: ${methods}` : "") +
      ` · ไฟล์แนบ = ภาพจำลองชิ้นงาน (เส้นชมพู = แนวตัด)`;
    return { r, print, white, mock, svg, ai, aiNote, spec };
  }

  /** ⬇ .ai ไดคัท (เจ้าของร้าน · ปุ่มบนแถบหัว) */
  async function downloadCutAi() {
    if (busy) return;
    setBusy("กำลังทำไฟล์ .ai…");
    setErr("");
    try {
      const stem = ((srcs.find((x) => !x.removed)?.file.name ?? "diecut").replace(/\.[^.]+$/, "") || "diecut").slice(0, 40);
      const cf = await makeCutFiles(stem, true);
      const f = cf.ai;
      if (!f) throw new Error("ทำไฟล์ .ai ไม่สำเร็จ ลองใหม่อีกครั้ง");
      // ไม่มี Illustrator ในเครื่อง = ได้ PDF-.ai (Illustrator รวมเป็น Layer 1) — บอกเหมือนปุ่ม .ai ของปฏิทิน
      if (!/Illustrator แยกเลเยอร์ให้แล้ว/.test(cf.aiNote)) setErr(cf.aiNote);
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ทำไฟล์ .ai ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function apply(force = false, lowOk = false) {
    if (busy) return;
    // มีช่องรูปแต่ยังไม่มีช่องไหนใส่รูป = ยังสั่งไม่ได้ (ช่องจะพิมพ์ออกมาว่าง)
    const needsPhoto = printPages.some((v) => lay(v.page).photo);
    if (needsPhoto && slotSrc(design, imgs) < 0) {
      if (coverPage) setPageIdx(fmt.pages.indexOf(coverPage));
      setTool("photo");
      setErr("ช่องรูปหน้าปกยังว่าง — แตะช่องสีเทาเพื่อเลือกรูป หรือลากรูปมาวาง");
      return;
    }
    // หน้าไม่ยืมรูปปก (รายเดือน/ตั้งโต๊ะแบบใหม่) — หน้าที่ยังไม่ใส่รูปจะพิมพ์ออกมาเป็นช่องว่าง
    if (design.noBorrow) {
      const empty = printPages.find((v) => v.page.kind !== "postback" && !lay(v.page).optional && lay(v.page).photo && !photoOf(lay(v.page), design, imgs));
      if (empty) {
        setPageIdx(vpages.indexOf(empty));
        setTool("photo");
        setErr(`${vname(empty)} ยังไม่มีรูป — แตะช่องสีเทาเพื่อเลือกรูป หรือลากรูปจากคลังด้านซ้ายมาวาง`);
        return;
      }
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
      const empty = printPages.find((v) => v.page.kind !== "postback" && !lay(v.page).optional && lay(v.page).photo && !photoOf(lay(v.page), design, imgs));
      if (empty) {
        setPageIdx(vpages.indexOf(empty));
        setTool("photo");
        setErr(`${vname(empty)} ยังไม่มีรูป — คละลายต้องใส่รูปให้ครบทุกใบ (หรือเปลี่ยนเป็นลายเดียวที่แถบด้านล่าง)`);
        return;
      }
    }
    // หน้าที่ลูกค้าขยับรูปเองจนไม่เต็มช่อง — ถามก่อน (หน้าที่ใช้รูปปกอัตโนมัติวางเต็มช่องเสมอ)
    if (!force && !fmt.diecut) {
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
    // 🔍 รูปความคมชัดต่ำ (รูปอาจแตก) — บอกก่อนส่งพิมพ์ ให้เลือกกลับไปแก้หรือใช้ต่อ
    if (!lowOk) {
      const lows = printPages.filter((v) => {
        const d = pageMinDpi(v.page);
        return Number.isFinite(d) && qualityOf(d, fmt.dpi).lv === 0;
      });
      if (lows.length) {
        setGapAsk(null);
        setPageIdx(vpages.indexOf(lows[0]));
        setTool("photo");
        setAsk({
          icon: "🔍",
          title: `รูป ${lows.length} หน้าความคมชัดต่ำ`,
          body:
            `${lows
              .slice(0, 6)
              .map((v) => `${vname(v)} (${pageMinDpi(v.page)} DPI)`)
              .join(" · ")}${lows.length > 6 ? " …" : ""} — ` +
            `พิมพ์ออกมาอาจแตก/เบลอ แนะนำใช้รูปไฟล์ใหญ่ขึ้น หรือย่อรูปให้เล็กลง (งานนี้พิมพ์ ${fmt.dpi} DPI)`,
          ok: "ใช้แบบนี้ต่อ",
          run: () => void apply(true, true),
        });
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
          `${stem}${noCal ? "" : `-ปฏิทิน${back.year}`}-${no}${name}.${photo ? "jpg" : "png"}`.replace(/[\/:*?"<>|]/g, "-"),
        );
        if (!f) throw new Error(`ประกอบหน้า "${name}" ไม่สำเร็จ ลองใหม่อีกครั้ง`);
        out.push({ key: p.key, name, file: f });
      }
      /**
       * ✂️ งานไดคัท: ไฟล์ที่แนบ = ภาพจำลองชิ้นงาน (ลาย + เส้นตัด + รู) · แยกไฟล์พิมพ์ลายพื้นใสขนาดจริง 300 DPI (print)
       * ลายถูกย่อ/ขยายด้วย pc.scale จนชิ้นงานยาวสุดเท่าขนาดที่เลือก
       */
      let print: File | undefined;
      let whiteFile: File | undefined;
      let cutAi: File | undefined;
      let cutSpec = "";
      let cutScale = 1;
      if (fmt.diecut) {
        setBusy("กำลังทำไฟล์ชิ้นงานไดคัท…");
        const cf = await makeCutFiles(stem, !!aiExport);
        cutScale = cf.r.scale;
        print = cf.print;
        whiteFile = cf.white;
        cutAi = cf.ai;
        cutSpec = cf.spec;
        out.splice(0, out.length, { key: fmt.pages[0].key, name: "ชิ้นงานไดคัท", file: cf.mock });
      }
      // ความคมชัดต่ำสุดของทุกหน้า (ทีมผลิตดูตัวเลขเดียวพอ)
      const dpis = printPages
        .map(({ page: p }) => {
          const c = photoOf(lay(p), design, imgs);
          const o = design.photos[p.key];
          const s = o ? srcs[o.src] : srcs[fallbackSrc];
          return c && s ? Math.round(s.w / (c.pl.wMm / 25.4)) : Infinity;
        })
        .concat(
          elements
            .filter((e) => e.kind === "photo" && e.src != null && srcs[e.src] && printPages.some((v) => v.page.key === e.page))
            .map((e) => Math.round(srcs[e.src!].w / (elementPhotoSize(e, srcs[e.src!]).w / 25.4))),
        )
        .filter(Number.isFinite);
      // ไดคัท: ลายถูกย่อ/ขยายตอนผลิต (cutScale) → DPI จริงเปลี่ยนตาม
      const minDpi = dpis.length ? Math.round(Math.min(...dpis) / cutScale) : 0;
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
      // 🚀 หน้า + ต้นฉบับพร้อมแล้ว → เริ่มอัปเลย ระหว่างที่ทำ .ai/.pdf ต่อ (ไดคัทไฟล์ที่แนบคือภาพจำลอง out ที่สลับแล้วด้านบน)
      onEarly?.({ files: [...out.map((o) => o.file), ...kept] });
      const savedDesign: CalDesign = {
        ...design,
        photos: Object.fromEntries(Object.entries(design.photos).map(([k, o]) => [k, { ...o, src: remap.get(o.src) ?? -1 }])),
        elements: (design.elements ?? []).map((e) => (e.src == null ? e : { ...e, src: remap.get(e.src) })),
      };
      // 🗂 เจ้าของร้าน: แนบ .ai แยกเลเยอร์ไปกับออเดอร์ด้วย (ผู้ใช้เคาะ 14 ต.ค. 69 "แนบ .ai ด้วย" · Supabase Pro)
      //    ปฏิทินรูปเต็ม .ai จาก Illustrator ~180 MB — ต้องตั้ง Upload file size limit ของโปรเจกต์ Supabase ให้พอ
      //    ทำไม่ได้/อัปไม่ขึ้นก็ยังสั่งต่อได้ (ไฟล์พิมพ์ + .pdf ครบแล้ว)
      let ai: { file: File; note: string } | undefined = cutAi ? { file: cutAi, note: "ไดคัท: เส้นตัดสีพิเศษ CutContour" } : undefined;
      if (aiExport && !fmt.diecut) {
        setBusy("กำลังทำไฟล์ .ai…");
        try {
          ai = await makeAi();
          if (ai) onEarly?.({ owner: ai.file });
        } catch (e) {
          ai = undefined;
          console.warn("calendar .ai", e);
        }
      }
      // 🖨 .pdf แนบออเดอร์ด้วย — การ์ดชุด = ไฟล์ชิ้นงาน (โปรแกรมจัดวาง) · แบบอื่น = .pdf ทั้งเล่ม (เดิมแนบเฉพาะการ์ด · แก้ 14 ต.ค. 69)
      let pdf: File | undefined;
      if (aiExport && !fmt.diecut) {
        setBusy(imposeOk ? "กำลังทำไฟล์ .pdf ชิ้นงาน…" : "กำลังทำไฟล์ .pdf…");
        try {
          pdf = (imposeOk ? await makePdf() : await makeBookPdf(out.map((o) => ({ name: o.name, file: o.file })))).file;
          if (pdf) onEarly?.({ owner: pdf });
        } catch (e) {
          console.warn("calendar .pdf", e);
        }
      }
      setBusy("กำลังอัปโหลด…");
      await onApply({
        print,
        white: whiteFile,
        pdf,
        ai: ai?.file,
        aiNote: ai?.note,
        pages: out,
        sources: kept,
        state: { format: fmt.key, design: savedDesign, back, sources: kept },
        dpi: minDpi,
        head: noCal ? fmtName : `${fmtName} · ปี ${back.year}`,
        summary: `${title} · ${noCal ? fmtName : `ปฏิทินปี ${back.year}`} · ${copies > 1 ? `${copies} ใบ (${custom.length ? `คละลาย ${designN} รูป` : "เหมือนกันทุกใบ"})` : `${fmt.pages.length} หน้า`}${minDpi ? ` · ${minDpi} DPI` : ""}`,
        spec:
          // 📏 เทมเพลตที่รู้ขนาดหน้างาน (เข็มกลัด) = บอกหน้างานจริง + ไฟล์รวมส่วนพับตามเส้นตัดของเทมเพลต · ไม่ใช่กรอบตัดสมมุติของ tpl@
          (fmtName !== fmt.name
            ? `${fmtName} · กรอบไฟล์ ${n(W)}×${n(H)}mm (รวมส่วนพับหลัง · เส้นตัดตามไฟล์เทมเพลต) · ไฟล์ ${fmt.dpi} DPI · `
            : `${fmt.name} · กรอบ ${n(W)}×${n(H)}mm (งานจริง ${n(fmt.trimW)}×${n(fmt.trimH)} + ตัดตก ${fmt.bleed}) · ไฟล์ ${fmt.dpi} DPI · `) +
          `${printPages.length} ไฟล์: ${printPages.map((v, i) => `${i + 1}.${vname(v).replace(/^\d+\. /, "")}`).join(" ")}` +
          (copies > 1
            ? ` · ชุดละ ${copies} ใบ: ใบที่ 1 พิมพ์ ${copies - custom.length} ใบ${custom.length ? ` · แยกแบบ ใบที่ ${custom.map((c) => c + 1).join(", ")} (ใบละ 1)` : ""}`
            : "") +
          `${fmt.note ? ` (${fmt.note})` : ""} · รูป ${kept.length} ไฟล์ (ใส่รายหน้า ${ownCount} หน้า ที่เหลือใช้รูปหน้าปก)` +
          `${minDpi ? ` · ความคมชัดต่ำสุด ${minDpi} DPI` : ""}` +
          `${texts.length ? ` · ข้อความ ${texts.length} กล่อง: ${texts.map((e) => `"${e.text!.trim().replace(/\n/g, " ")}"`).join(", ")}` : ""}` +
          `${shapes ? ` · รูปทรง ${shapes} ชิ้น` : ""}${freePhotos ? ` · กรอบรูปอิสระ ${freePhotos} กรอบ` : ""}${layoutNote ? ` · เลย์เอาต์: ${layoutNote}` : ""} · ` +
          (noCal ? "" : `ปฏิทิน: ${backSpec(back)} `) +
          (fmt.diecut ? cutSpec.replace(/^ · /, "") + " " : printFrameToken(W, H)),
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
                  <FontOptions />
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
      <div {...barWrap(left, top)} onPointerDown={(e) => e.stopPropagation()}>
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
          className={`flex max-w-[calc(100vw-24px)] items-center gap-0.5 rounded-2xl bg-white px-1.5 py-1 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none] ${
            narrow ? "mx-auto flex-wrap justify-center" : ""
          }`}
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
      <div {...barWrap(left, top)} onPointerDown={(e) => e.stopPropagation()}>
        <div ref={barRef} className={narrow ? "flex flex-col gap-1.5" : "max-w-[calc(100vw-24px)] space-y-1.5"}>
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
          <div
            className={`flex items-center gap-1.5 rounded-2xl bg-white px-1.5 py-1.5 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none] ${
              narrow ? "flex-wrap justify-center" : ""
            }`}
          >
            <select
              value={te.font ?? "prompt"}
              onChange={(e) => patchEl(te.id, { font: e.target.value })}
              className={`${box} w-36 cursor-pointer`}
              aria-label="ฟอนต์"
            >
              <FontOptions />
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
            <div className={`space-y-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 ${narrow ? "order-first w-full" : "mx-auto w-max max-w-full"}`}>
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
    // 🧰 แถบอยู่ "ใต้" รูป (เหมือนแถบรูปทรง) — รูปเต็มผืนก็ตกไปอยู่ใต้ผืนผ้าใบ ไม่บังชิ้นงาน
    // (เดิมอยู่เหนือรูปแล้ว clamp ที่ -8 → รูปที่ชิดขอบบน/เต็มผืนโดนแถบทับ · เจ้าของร้านแจ้ง 16 ต.ค. 69) — เมนูย่อยกางขึ้นบน
    const { left, top } = barPos(r, cssW, cssH);
    const frImg = fr && fr.src != null ? srcs[fr.src] : undefined;
    const has = fr ? !!frImg : true;
    // ✂️ ไดคัท: 100% = ขนาดตอนใส่รูป (ตำแหน่งอ้างอิงของเส้นตัด) ไม่ใช่ "เต็มช่อง" — ช่องคือทั้งผืน ถ้านับแบบเดิมรูปเริ่มที่ ~25% ซูมออกได้แค่ขั้นเดียว
    const refW = fmt.diecut && design.cut?.ref && cur ? design.cut.ref.wMm : 0;
    const zoomNow = fr ? Math.round((fr.zoom ?? 1) * 100) : refW > 0 && cur ? Math.round((cur.pl.wMm / refW) * 100) : zoomPct;
    /** กรอบรูปซูมออกได้ถึงพอดีกรอบทั้งรูป (เดิมล็อก 100% = เต็มกรอบเสมอ) */
    const frMin = fr && frImg ? Math.round(containZoom(fr, frImg) * 100) : 100;
    const setZoom = (v: number) => {
      if (fr) patchEl(fr.id, { zoom: clamp(v, frMin, 400) / 100 });
      else editPl((pl) => scalePl(pl, clamp(v, 20, 400) / Math.max(1, zoomNow)));
    };
    const dpiNow = fr ? (frImg ? Math.round(frImg.w / (elementPhotoSize(fr, frImg).w / 25.4)) : 0) : dpi;
    // ค่าแต่งรูปของสิ่งที่เลือก (กรอบรูปอิสระ หรือรูปช่องหลักของหน้านี้)
    const ownSt = design.photos[basePage.key];
    const st = fr ?? (ownSt && ownSt.src >= 0 ? ownSt : undefined);
    const setSt = (patch: {
      opacity?: number;
      stroke?: string;
      strokeW?: number;
      radius?: number;
      strokeA?: number;
      filter?: string;
      flipX?: boolean;
      bright?: number;
      contrast?: number;
      sat?: number;
    }) => (fr ? patchEl(fr.id, patch) : editSlot(patch));
    const opNow = Math.round((st?.opacity ?? 1) * 100);
    const thumbUrl = fr ? frImg?.url : curSrc?.url;
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
      <div {...barWrap(left, top)} onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className={`flex max-w-[calc(100vw-24px)] items-center gap-0.5 rounded-2xl bg-white px-1.5 py-1 shadow-[0_6px_24px_rgba(28,25,23,.18)] ring-1 ring-stone-200 [scrollbar-width:none] ${
            narrow ? "mx-auto flex-wrap justify-center" : ""
          }`}
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
          {/* กรอบยังว่าง = ปุ่มใส่รูป (เปลี่ยนรูปทีหลัง: ลากรูปจากคลังมาวาง / แผงซ้าย "เปลี่ยนรูปในกรอบนี้") */}
          {!has && (
            <label className={barBtn} title="ใส่รูป">
              <Ico n="replace" />
              {replace}
            </label>
          )}
          {has && (
            <>
              <BarBtn title="ซูมเข้า" onClick={() => setZoom(zoomNow + 10)}>
                <Ico n="zoomIn" />
              </BarBtn>
              <BarBtn title="ซูมออก" disabled={fr ? zoomNow <= frMin : zoomNow <= 20} onClick={() => setZoom(zoomNow - 10)}>
                <Ico n="zoomOut" />
              </BarBtn>
              <BarBtn
                title={
                  fr
                    ? frameFitted(fr, frImg)
                      ? "กลับเป็นกรอบขนาดเดิม"
                      : "หดกรอบให้พอดีรูป (เห็นทั้งรูป)"
                    : slotFitted
                      ? "กลับเป็นช่องขนาดเดิม"
                      : "หดช่องให้พอดีรูป (เห็นทั้งรูป)"
                }
                on={fr ? frameFitted(fr, frImg) : slotFitted}
                onClick={() => (fr ? fitFrame(fr) : fitSlot())}
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
              {/* ความทึบ (ลายตาราง = โปร่งใส) − 100% + ในกล่องเดียวแบบ Printbox */}
              <div className="mx-1 flex shrink-0 items-center rounded-xl ring-1 ring-stone-200">
                <BarBtn title="ความโปร่ง" on={pop === "opacity"} onClick={() => togglePop("opacity")}>
                  <Ico n="opacity" />
                </BarBtn>
                <button
                  type="button"
                  onClick={() => setSt({ opacity: clamp(opNow - 10, 10, 100) / 100 })}
                  disabled={opNow <= 10}
                  className="grid h-10 w-8 place-items-center text-xl text-stone-500 hover:text-stone-800 disabled:opacity-30"
                  aria-label="โปร่งขึ้น"
                >
                  −
                </button>
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-stone-800">{opNow}%</span>
                <button
                  type="button"
                  onClick={() => setSt({ opacity: clamp(opNow + 10, 10, 100) / 100 })}
                  disabled={opNow >= 100}
                  className="grid h-10 w-8 place-items-center text-xl text-stone-500 hover:text-stone-800 disabled:opacity-30"
                  aria-label="ทึบขึ้น"
                >
                  ＋
                </button>
              </div>
              <BarBtn title={fr ? "ขอบและมุมมน" : "ขอบ · มุมมน · ขนาดช่อง"} on={pop === "border"} onClick={() => togglePop("border")}>
                <Ico n="border" />
              </BarBtn>
              <BarBtn title="เอฟเฟกต์ · ปรับแสงสี" on={pop === "filter" || photoFilterCss(st) !== "none"} onClick={() => togglePop("filter")}>
                <Ico n="magic" />
              </BarBtn>
            </>
          )}
          <BarBtn title="ลำดับชั้น (Layers)" onClick={() => setLayersOpen(true)}>
            <Ico n="layers" />
          </BarBtn>
          {fr && (
            <BarBtn title="ลบกรอบ (ปุ่ม Delete)" danger onClick={() => removeEl(fr.id)}>
              <Ico n="trash" />
            </BarBtn>
          )}
          {slot && (
            <BarBtn title="ลบรูป (ปุ่ม Delete)" danger onClick={removeSlotPhoto}>
              <Ico n="trash" />
            </BarBtn>
          )}
          {/* 🔍 ความคมชัดของรูปที่เลือก — โชว์ตลอด (สัญญาณ 4 ขีด + คำ · ชี้ดูรายละเอียด) */}
          {dpiNow > 0 &&
            (() => {
              const q = qualityOf(dpiNow, fmt.dpi);
              return (
                <span className="group/tip relative ml-1 inline-flex shrink-0">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${q.tone}`}>
                    <span className="flex items-end gap-[2px]" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`w-[3px] rounded-sm ${i <= q.lv ? q.bar : "bg-stone-300"}`} style={{ height: 4 + i * 3 }} />
                      ))}
                    </span>
                    {q.label}
                  </span>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-60 rounded-lg bg-stone-700 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover/tip:opacity-100 sm:block"
                  >
                    ความคมชัดตอนพิมพ์ {dpiNow} DPI (งานนี้พิมพ์ {fmt.dpi} DPI)
                    {q.lv <= 1 ? " — รูปเล็กไปสำหรับขนาดนี้ ใช้รูปไฟล์ใหญ่ขึ้น หรือย่อรูปลง" : " — พิมพ์ออกมาชัด"}
                  </span>
                </span>
              );
            })()}
        </div>
        {/* เมนูย่อย — กางขึ้นเหนือแถบ (แถบอยู่ใต้รูป) */}
        {pop && (
          <div
            className={
              narrow
                ? "max-h-[45vh] w-full overflow-y-auto rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200"
                : `absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-2xl bg-white shadow-xl ring-1 ring-stone-200 ${pop === "filter" ? "w-[min(600px,calc(100vw-24px))] p-4" : pop === "border" ? "w-max max-w-[calc(100vw-24px)] p-2" : "w-64 p-3"}`
            }
          >
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
              // 🖼 แถบขอบแบบ Printbox: [ความทึบขอบ − % +] [สี − หนา +] [มุมมน − n +] ล้างมุมมน · ล้างขอบ
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Stepper
                    icon={<Ico n="opacity" />}
                    title="ความทึบของขอบ"
                    value={`${Math.round((st?.strokeA ?? 1) * 100)}%`}
                    disabled={!st?.stroke}
                    onMinus={() => setSt({ strokeA: clamp(Math.round(((st?.strokeA ?? 1) - 0.1) * 10) / 10, 0.1, 1) })}
                    onPlus={() => setSt({ strokeA: clamp(Math.round(((st?.strokeA ?? 1) + 0.1) * 10) / 10, 0.1, 1) })}
                  />
                  <Stepper
                    icon={
                      <button
                        type="button"
                        title="สีขอบ"
                        onClick={() => setBorderColor((v) => !v)}
                        className={`h-7 w-7 rounded-md ring-1 ${st?.stroke ? "ring-stone-300" : "bg-[repeating-conic-gradient(#d6d3d1_0_25%,#fff_0_50%)] bg-[length:8px_8px] ring-stone-300"} ${borderColor ? "outline outline-2 outline-offset-1 outline-sky-500" : ""}`}
                        style={st?.stroke ? { background: st.stroke } : undefined}
                      />
                    }
                    title="ความหนาขอบ"
                    value={String(st?.stroke ? Math.max(1, Math.round((st.strokeW ?? 0) / BORDER_STEP)) : 0)}
                    onMinus={() => st?.stroke && setSt({ strokeW: Math.max(1, Math.round((st.strokeW ?? 0) / BORDER_STEP) - 1) * BORDER_STEP })}
                    onPlus={() =>
                      setSt(
                        st?.stroke
                          ? { strokeW: Math.min(40, Math.round((st.strokeW ?? 0) / BORDER_STEP) + 1) * BORDER_STEP }
                          : { stroke: "#1c1917", strokeW: 4 * BORDER_STEP },
                      )
                    }
                  />
                  <Stepper
                    icon={<span className="grid h-7 w-7 place-items-center rounded-lg border-2 border-stone-700 text-[10px]" style={{ borderRadius: 9 }} />}
                    title="มุมมน"
                    value={String(Math.round(st?.radius ?? 0))}
                    onMinus={() => setSt({ radius: Math.max(0, Math.round(st?.radius ?? 0) - 1) })}
                    onPlus={() => setSt({ radius: Math.min(Math.round(Math.min(W, H) / 2), Math.round(st?.radius ?? 0) + 1) })}
                  />
                  <button
                    type="button"
                    disabled={!(st?.radius ?? 0)}
                    onClick={() => setSt({ radius: 0 })}
                    className="h-11 rounded-xl bg-stone-100 px-4 text-sm font-bold text-stone-700 hover:bg-stone-200 disabled:text-stone-300 disabled:hover:bg-stone-100"
                  >
                    ล้างมุมมน
                  </button>
                  <button
                    type="button"
                    disabled={!st?.stroke}
                    onClick={() => {
                      setSt({ stroke: "", strokeW: 0, strokeA: undefined });
                      setBorderColor(false);
                    }}
                    className="h-11 rounded-xl bg-[#8fc9d4] px-4 text-sm font-bold text-white hover:bg-[#7bbcc8] disabled:opacity-50"
                  >
                    ล้างขอบ
                  </button>
                </div>
                {borderColor && (
                  <MiniColors
                    value={st?.stroke ?? ""}
                    onChange={(stroke) => setSt(stroke ? { stroke, strokeW: st?.strokeW || 4 * BORDER_STEP } : { stroke: "", strokeW: 0 })}
                  />
                )}
                {slot && design.slots?.[page.key] && (
                  <button type="button" onClick={() => setSlot(undefined)} className="text-xs font-bold text-sky-700 hover:underline">
                    ↺ ช่องรูปขนาดเดิม (ตามเลย์เอาต์)
                  </button>
                )}
              </div>
            )}
            {pop === "filter" && (
              <div className="space-y-3">
                {(
                  [
                    ["bright", "ความสว่าง", "sun"],
                    ["contrast", "คอนทราสต์", "contrast"],
                    ["sat", "ความอิ่มสี", "drop"],
                  ] as const
                ).map(([k, label, ic]) => {
                  const v = st?.[k] ?? 100;
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <AdjIco n={ic} />
                      <span className="w-20 shrink-0 text-sm text-stone-700">{label}:</span>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={v}
                        onChange={(e) => setSt({ [k]: Number(e.target.value) })}
                        className="h-1 flex-1 cursor-pointer appearance-none rounded-full accent-sky-500"
                        style={{ background: `linear-gradient(to right, #7cc4d4 ${v / 2}%, #f0eeec ${v / 2}%)` }}
                        aria-label={label}
                      />
                      <button
                        type="button"
                        onClick={() => setSt({ [k]: undefined })}
                        disabled={v === 100}
                        title="ค่าเดิม"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                      >
                        ↻
                      </button>
                    </div>
                  );
                })}
                <div className="relative flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => filterRowRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
                    className="grid h-9 w-7 shrink-0 place-items-center text-xl text-stone-600 hover:text-stone-900"
                    aria-label="เลื่อนซ้าย"
                  >
                    ‹
                  </button>
                  <div ref={filterRowRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
                    {CAL_FILTERS.map((f) => {
                      const on = (st?.filter ?? "") === f.key;
                      return (
                        <button
                          key={f.key || "none"}
                          type="button"
                          onClick={() => setSt({ filter: f.key || undefined })}
                          className={`flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-lg p-1 text-xs transition ${on ? "bg-sky-50 text-sky-600" : "text-stone-700 hover:bg-stone-50"}`}
                        >
                          {thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbUrl} alt="" className="h-[68px] w-[76px] object-cover" style={{ filter: f.css }} />
                          ) : (
                            <span className="h-[68px] w-[76px] bg-gradient-to-br from-amber-300 via-rose-400 to-sky-500" style={{ filter: f.css }} />
                          )}
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => filterRowRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
                    className="grid h-9 w-7 shrink-0 place-items-center text-xl text-stone-600 hover:text-stone-900"
                    aria-label="เลื่อนขวา"
                  >
                    ›
                  </button>
                </div>
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
    // งานออกแบบล้วน (ไม่มีปฏิทิน) = ไม่มีเครื่องมือปฏิทิน/วันสำคัญ/ตั้งค่าปฏิทิน
    ...(noCal
      ? []
      : [
          { key: "calendar" as const, icon: "A̲", label: "Calendar", on: tool === "calendar" },
          { key: "events" as const, icon: "📅", label: "Events", on: tool === "events" },
          { key: "settings" as const, icon: "⚙", label: "Settings", on: tool === "settings" },
        ]),
    // ✂️ งานไดคัท: แผงทรง/ขอบ/รูห้อย/ลบพื้นหลัง
    ...(fmt.diecut ? [{ key: "cut" as const, icon: "✂️", label: "ไดคัท", on: tool === "cut" }] : []),
    { key: "layers", icon: "🗂", label: "Layers", on: layersOpen },
  ];
  const cutInput =
    "w-full min-w-0 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-stone-700 focus:border-sky-400 focus:outline-none disabled:opacity-60";
  const cutChip = (on: boolean, small = false) =>
    `rounded-full ${small ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]"} font-bold transition disabled:opacity-50 ${
      on ? "bg-sky-600 text-white shadow" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-sky-50"
    }`;
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
            {/* 📱 จอแคบ: ซ่อน History/Project — แถบบนต้องเหลือที่ให้ปุ่มใส่ตะกร้า/ปิด (เดิมล้นขอบจอ กดสั่งไม่ได้) */}
            <div className="relative hidden sm:block">
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
            <div className="relative hidden sm:block">
              <HeadBtn label="Project" title="ข้อมูลงาน" on={headPop === "project"} onClick={() => setHeadPop((v) => (v === "project" ? "" : "project"))}>
                <HIco n="project" />
              </HeadBtn>
              {headPop === "project" && (
                <div className="absolute left-0 top-full mt-1 w-72 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200">
                  <p className="text-xs font-extrabold text-stone-800">{title}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-stone-400">รูปแบบ</dt>
                    <dd className="text-stone-700">{fmtName}</dd>
                    <dt className={`text-stone-400 ${noCal ? "hidden" : ""}`}>ปีปฏิทิน</dt>
                    <dd className={`text-stone-700 ${noCal ? "hidden" : ""}`}>
                      {back.year} (พ.ศ. {back.year + 543}) — เปลี่ยนที่หน้าสินค้า
                    </dd>
                    <dt className="text-stone-400">จำนวน</dt>
                    <dd className="text-stone-700">
                      {copies > 1 ? `${copies} ${cw}/${setWord}${custom.length ? ` · แยกแบบ ${custom.length} ${cw}` : ""}` : `${fmt.pages.length} หน้า`}
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
                      className={`${toolBtn} ${noCal ? "hidden" : ""}`}
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
            <p className="truncate text-sm font-extrabold text-stone-800">{noCal ? "🎨 ออกแบบ" : "🗓 สร้างปฏิทิน"}</p>
            <p className="truncate text-[11px] text-stone-500">
              {title} · {fmtName}
              {noCal ? "" : ` · ปี ${back.year}`} · {copies > 1 ? `${copies} ${cw}/${setWord}` : `${fmt.pages.length} หน้า`}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
            {hasSheets && (
              <button
                type="button"
                onClick={() => void open3d()}
                disabled={flip3d === "loading"}
                title="ดูแบบ 3D — พลิกหน้าดูว่าแต่ละแผ่นด้านหน้า/หลังเป็นอะไร"
                // ✨ ให้เด่น (ผู้ใช้ขอ 14 ต.ค. 69) — ไล่สีม่วง-ชมพู ตัวขาว เงา + จุดกะพริบ "ใหม่"
                className="relative flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_4px_14px_rgba(139,92,246,.45)] ring-2 ring-white transition hover:scale-[1.03] hover:shadow-[0_6px_20px_rgba(139,92,246,.55)] disabled:opacity-70"
              >
                <span className="text-sm leading-none">🧊</span>
                {flip3d === "loading" ? "กำลังเตรียม…" : "ดูแบบ 3D"}
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" />
                </span>
              </button>
            )}
            {copies > 1 && (
              <button
                type="button"
                onClick={() => setAskMode(true)}
                title="รูปแบบการพิมพ์ · ค่าคละลาย"
                className={`hidden flex-col items-end rounded-xl px-2.5 py-1 text-right leading-tight ring-1 transition hover:brightness-95 sm:flex ${
                  feeNow > 0 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                }`}
              >
                <span className="text-[11px] font-extrabold">{mixMode ? `🎨 คละ ${designN} ลาย (${designN} รูป)` : "🖼 ลายเดียว"}</span>
                <span className="text-[10.5px] font-bold">{feeNow > 0 ? `ค่าคละ +${formatBaht(feeNow)}` : "ไม่มีค่าคละ"}</span>
              </button>
            )}
            {copies === 1 && fmt.pages.filter((p) => p.photo).length > 1 && (
              // 🖼 งานหลายหน้า: นับลายตามรูปที่ใช้ทุกหน้า → ค่าคละตามกติกาสินค้า (13 ต.ค. 69)
              <span
                title="นับลายตามจำนวนรูปที่ใช้ทุกหน้า · ค่าคละตามเงื่อนไขของสินค้า"
                className={`hidden flex-col items-end rounded-xl px-2.5 py-1 text-right leading-tight ring-1 sm:flex ${
                  feeNow > 0 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                }`}
              >
                <span className="text-[11px] font-extrabold">🖼 ใช้ {designN} รูป</span>
                <span className="text-[10.5px] font-bold">{feeNow > 0 ? `ค่าคละ +${formatBaht(feeNow)}` : "ไม่มีค่าคละ"}</span>
              </span>
            )}
            {aiExport && fmt.diecut && (
              <button
                type="button"
                onClick={() => void downloadCutAi()}
                disabled={!!busy || !cutRes}
                title="เฉพาะเจ้าของร้าน — ไฟล์ .ai เข้าเครื่องตัด (ลาย + ขอบ 300 DPI ขนาดจริง · เส้นตัดสีพิเศษ CutContour)"
                className="hidden rounded-full bg-amber-50 px-3 py-2.5 text-xs font-extrabold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60 sm:inline-block"
              >
                ⬇ .ai
              </button>
            )}
            {aiExport && !fmt.diecut && (
              <button
                type="button"
                onClick={() => void downloadAi()}
                disabled={!!busy}
                title="เฉพาะเจ้าของร้าน (ทดสอบ) — โหลดไฟล์ .ai แยกเลเยอร์ตามลำดับชั้นที่จัด"
                className="hidden rounded-full bg-amber-50 px-3 py-2.5 text-xs font-extrabold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60 sm:inline-block"
              >
                ⬇ .ai
              </button>
            )}
            {aiExport && !fmt.diecut && (
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={!!busy}
                title={
                  imposeOk
                    ? "เฉพาะเจ้าของร้าน (ทดสอบ) — .pdf ไฟล์เดียว: ทีละชิ้น ด้านหน้า · ด้านหลัง · เส้นไดคัท สำหรับโปรแกรมจัดวาง localhost:8002"
                    : "เฉพาะเจ้าของร้าน (ทดสอบ) — .pdf ทั้งเล่ม: ทุกหน้าเรียงตามลำดับ + หน้าเส้นไดคัทท้ายไฟล์"
                }
                className="hidden rounded-full bg-amber-50 px-3 py-2.5 text-xs font-extrabold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60 sm:inline-block"
              >
                ⬇ .pdf
              </button>
            )}
            {/* ✂️ ไดคัท: ปุ่ม ✓ ใช้แบบนี้ + 🛒 ใส่ตะกร้า "ปิดไว้ก่อน" = ยังเห็นเป็นปุ่มเทากดไม่ได้ (ผู้ใช้สั่ง 15 ต.ค. 69 "ต้องการเห็นปุ่มเทาๆ ที่ปิดอยู่") */}
            <button
              type="button"
              onClick={() => {
                orderAfter.current = false;
                void apply();
              }}
              disabled={!!busy || !!fmt.diecut}
              title={fmt.diecut ? "ปิดไว้ชั่วคราว — ยังสั่งผ่านจอออกแบบไม่ได้" : "บันทึกแบบแล้วกลับไปหน้าสินค้า (ยังไม่ใส่ตะกร้า)"}
              className={
                fmt.diecut
                  ? `${onOrder ? "hidden sm:inline-block" : ""} cursor-not-allowed rounded-full bg-stone-200 px-4 py-2.5 text-sm font-extrabold text-stone-400 shadow-none`
                  : onOrder
                  ? "hidden rounded-full px-3 py-2.5 text-sm font-bold text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-block sm:px-4"
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
                disabled={!!busy || !!fmt.diecut}
                title={fmt.diecut ? "ปิดไว้ชั่วคราว — ยังสั่งผ่านจอออกแบบไม่ได้" : orderLabel ? "อัปไฟล์ทุกหน้าแล้วเปลี่ยนแบบในรายการเดิมของออเดอร์ (ยอดเงินไม่เปลี่ยน)" : "บันทึกแบบแล้วใส่ตะกร้าเลย"}
                className={
                  fmt.diecut
                    ? "flex cursor-not-allowed flex-col items-center rounded-2xl bg-stone-200 px-3 py-1.5 leading-tight text-stone-400"
                    : "flex flex-col items-center rounded-2xl bg-sky-600 px-3 py-1.5 leading-tight text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
                }
              >
                {/* 💾 บันทึกกลับเข้าออเดอร์ (หลังบ้าน) — ข้อความยาวกว่า "ใส่ตะกร้า" ใช้ตัวเล็กลง (ผู้ใช้สั่ง 15 ต.ค. 69) */}
                <span className={orderLabel ? "text-xs font-bold" : "text-sm font-extrabold"}>{busy || orderLabel || "🛒 ใส่ตะกร้า"}</span>
                {!busy && price && !orderLabel && (
                  <span className={`text-[11px] font-bold ${fmt.diecut ? "text-stone-400" : "text-sky-100"}`}>
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
        {/* 🧪 ไดคัท: แถบบอกลูกค้าว่าจอนี้ยังทดสอบอยู่ สั่งผ่านจอไม่ได้ (ผู้ใช้สั่ง 15 ต.ค. 69) */}
        {fmt.diecut && (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-amber-50 px-4 py-2 text-center text-[12px] leading-snug text-amber-800 ring-1 ring-amber-200">
            <span className="font-extrabold">🧪 ระบบออกแบบพวงกุญแจบนเว็บ — กำลังทดสอบ ยังไม่เปิดใช้งาน</span>
            <span>ลองเล่นดูได้ แต่ยังบันทึกแบบ/ใส่ตะกร้าจากจอนี้ไม่ได้ · ต้องการสั่งทำ ปิดจอนี้แล้วใช้ “📎 แนบไฟล์ลาย” หรือทักไลน์ร้านได้เลย</span>
          </div>
        )}
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
          {/* 📚 คลังรูป (ซ้าย แบบ Printbox) — เลือกที่จะใส่ · อัป/ลากรูป · รูปที่อัปไว้ (แตะ = ใส่ · ลากไปวางบนภาพได้)
              โชว์ตลอด ไม่ต้องกด Photo ก่อน (ผู้ใช้แจ้ง 13 ต.ค. 69 — เดิมผูกกับ tool === "photo" หน้าอื่น/เครื่องมืออื่นคลังหาย) */}
          {!locked &&
            (() => {
              const frames = pageEls.filter((e) => e.kind === "photo");
              const fr = selEl?.kind === "photo" ? selEl : null;
              const frImg = fr && fr.src != null ? srcs[fr.src] : undefined;
              const slotOn = !fr && !!page.photo;
              const activeSrc = fr ? fr.src : slotOn ? (own ? own.src : fallbackSrc) : undefined;
              const chip = (on: boolean) =>
                `rounded-full px-2.5 py-1 text-[11px] font-bold transition ${on ? "bg-sky-600 text-white shadow-sm" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"}`;
              /**
               * 📱 มือถือ: คลังรูปเป็นแถบบาง ๆ "ใต้แถบเครื่องมือ เหนือภาพ" (ผู้ใช้สั่ง 13 ต.ค. 69 ให้ออกแบบตำแหน่งใหม่)
               * เดิมเป็นกล่องใหญ่อยู่ใต้ภาพ ต้องเลื่อนลงหาถึงจะเจอปุ่มอัปรูป/＋ กรอบ
               * แถว 1 = ใส่ลงช่องไหน · แถว 2 = ＋ เพิ่มรูป + รูปที่อัปไว้ (ปัดซ้าย-ขวา · แตะ = ใส่ทันที)
               */
              /**
               * 📮 ด้านหลังลายโปสการ์ด (ผู้ใช้สั่ง 13 ต.ค. 69 "ลูกค้าใส่ลายตัวเองได้ หรือลบลาย postcard ออกได้")
               * ใส่ลายเอง = ลงช่องรูปเต็มใบ (ทับลายโปสการ์ด · ปรับความทึบให้เห็นเส้นลอดได้) · ลบลาย = CalDesign.postOff
               */
              const postKeys = [...new Set(vpages.filter((v) => v.page.kind === "postback").map((v) => resolve(v).key))];
              const postHere = basePage.kind === "postback";
              const postOn = !(design.postOff ?? []).includes(basePage.key);
              const setPost = (keys: string[], on: boolean) =>
                setDesign((d) => {
                  const off = new Set(d.postOff ?? []);
                  for (const k of keys)
                    if (on) off.delete(k);
                    else off.add(k);
                  return { ...d, postOff: [...off] };
                });
              const postBox = postHere ? (
                <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
                  <p className="font-extrabold">📮 ด้านหลัง {postOn ? "· มีลายโปสการ์ด" : "· ลบลายโปสการ์ดแล้ว"}</p>
                  <p className="text-amber-800">ใส่ลายของคุณเองได้ — แตะด้านหลัง หรือลากรูปมาวาง (เต็มใบ ทับลายโปสการ์ด)</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setPost([basePage.key], !postOn)}
                      className="rounded-full bg-white px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                    >
                      {postOn ? "🗑 ลบลายโปสการ์ด" : "↺ ใส่ลายโปสการ์ดกลับ"}
                    </button>
                    {postKeys.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPost(postKeys, !postOn)}
                        className="rounded-full bg-white px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                      >
                        {postOn ? `ลบทุกใบ (${postKeys.length})` : `ใส่กลับทุกใบ (${postKeys.length})`}
                      </button>
                    )}
                  </div>
                </div>
              ) : null;
              if (narrow)
                return (
                  <div className="order-[-1] w-full shrink-0 space-y-1.5 border-b border-stone-100 bg-white px-2 py-2">
                    {postBox}
                    {copies > 1 && vcur.card > 0 && (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] ring-1 ring-sky-100">
                        <span className="font-bold text-sky-900">ใบที่ {vcur.card + 1} · แยกแบบเอง</span>
                        <button type="button" onClick={() => resetCard(vcur.card)} className="font-bold text-stone-500">
                          ↺ เหมือนใบที่ 1
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                      <span className="shrink-0 pr-0.5 text-[11px] font-bold text-stone-500">ใส่ลง:</span>
                      {page.photo && (
                        <button type="button" onClick={() => setSel(null)} className={`shrink-0 ${chip(slotOn)}`}>
                          ช่องรูปหลัก
                        </button>
                      )}
                      {frames.map((e, n) => (
                        <button key={e.id} type="button" onClick={() => setSel(e.id)} className={`shrink-0 ${chip(fr?.id === e.id)}`}>
                          กรอบ {n + 1}
                          {e.src == null || !srcs[e.src] ? " · ว่าง" : ""}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={addEmptyFrame}
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50"
                      >
                        ＋ กรอบ
                      </button>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 pt-1 [scrollbar-width:none]">
                      <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 text-center text-sky-700">
                        <span className="text-lg font-bold leading-none">＋</span>
                        <span className="mt-0.5 text-[10px] font-extrabold leading-tight">
                          {fr ? (frImg ? "เปลี่ยนรูป" : "ใส่รูป") : cur ? "เพิ่มรูป" : "ใส่รูป"}
                        </span>
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
                      {srcs.map((s0, i) =>
                        s0.removed ? null : (
                          <div key={s0.url} className="relative shrink-0 pr-1 pt-1">
                            <button
                              type="button"
                              onClick={() => putIntoTarget(i)}
                              className={`block h-16 w-16 overflow-hidden rounded-xl ring-2 transition ${activeSrc === i ? "ring-sky-500" : "ring-stone-200"}`}
                              aria-label={`ใส่รูปที่ ${i + 1}`}
                            >
                              <img src={s0.url} alt="" className="block h-full w-full object-cover" draggable={false} />
                            </button>
                            <button
                              type="button"
                              title="ลบรูปนี้"
                              aria-label="ลบรูปนี้"
                              onClick={() => removeSrc(i)}
                              className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-stone-500 shadow ring-1 ring-stone-200"
                            >
                              ✕
                            </button>
                          </div>
                        ),
                      )}
                      {!srcs.some((x) => !x.removed) && (
                        <span className="text-[11px] leading-snug text-stone-400">อัปรูปได้หลายรูปพร้อมกัน แล้วแตะรูปเพื่อใส่</span>
                      )}
                    </div>
                    {mixMode && (
                      <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10.5px] leading-snug text-amber-800">
                        คละลายนับจากรูปในคลัง: {libCount} รูป = คละ {designN} ลาย
                        {unusedSrcs.length ? ` · ยังไม่ได้ใช้ ${unusedSrcs.length} รูป (กด ✕ ลบได้)` : ""}
                      </p>
                    )}
                  </div>
                );
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
                  {postBox}
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
            className={`relative flex min-h-0 min-w-0 shrink-0 flex-col items-center justify-center gap-2 p-3 transition sm:flex-1 sm:p-5 ${dropOn ? "bg-sky-50" : "bg-stone-100"} ${
              narrow && (sel || slotFocus || gridSel) ? "pb-32" : ""
            }`}
            // 🖱 คลิกพื้นว่างรอบการ์ด = ยกเลิกการเลือก (กรอบฟ้า/แถบเครื่องมือหาย) — เดิมไม่มีตัวรับคลิกตรงนี้ กรอบฟ้าค้าง (ผู้ใช้แจ้ง 13 ต.ค. 69)
            // เฉพาะคลิกโดนพื้นเวทีเอง/ข้อความใต้การ์ด — แถบเครื่องมือ/จุดจับ/การ์ดมีตัวจับของตัวเอง
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              if (t === e.currentTarget || t.dataset.stageBlank !== undefined) clearSelection();
            }}
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
                // พอดีเวทีตามจอ: จำกัดทั้งกว้างและสูง (เผื่อแถบเครื่องมือลอยใต้รูป ~64px + บรรทัดไกด์)
                // × STAGE_FIT = ไม่ขยายจนชนขอบเวที เหลือพื้นว่างรอบการ์ด (ผู้ใช้ขอ 16 ต.ค. 69 "โปสการ์ด/ปลอกแก้ว ลดขนาดหน่อย")
                maxWidth:
                  stageBox.w && stageBox.h && stageBox.w >= 640
                    ? `${Math.max(240, Math.min(stageBox.w - 48, (stageBox.h - 110) * aspect) * STAGE_FIT)}px`
                    : `min(100%, ${aspect * 60}vh)`,
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`block w-full touch-none select-none shadow-[0_2px_14px_rgba(28,25,23,.18)] ${
                  !fmt.diecut
                    ? "bg-white"
                    : cutView.bg === "dark"
                      ? "bg-stone-800"
                      : cutView.bg === "light"
                        ? "bg-white"
                        : "bg-[repeating-conic-gradient(#e7e5e4_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
                }`}
                style={{ aspectRatio: `${W} / ${H}` }}
              />
              {/* ✂️ แก้เฉพาะจุด: จิ้มบนภาพ ＋ = เส้นมน/ถมร่อง · − = เส้นวิ่งชิดตามซอกงาน */}
              {fmt.diecut && tool === "cut" && editMode !== 0 && (
                <div
                  className={`absolute inset-0 z-10 ${editMode > 0 ? "cursor-cell" : "cursor-crosshair"}`}
                  onPointerDown={(e) => {
                    const rc = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rc.left) / rc.width) * W;
                    const y = ((e.clientY - rc.top) / rc.height) * H;
                    setCut({ edits: [...cutP.edits, [x, y, cutP.plusMm, editMode]] });
                  }}
                />
              )}
              {!locked && tool === "photo" && renderPhotoBar()}
              {!locked && tool === "photo" && renderPostBar()}
              {!locked && tool === "text" && renderTextBar()}
              {!locked && tool === "shape" && renderShapeBar()}
              {renderSelOverlay()}
              {!locked && renderGridBar()}
              {!locked && renderGridRestore()}
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
            <p data-stage-blank className="text-center text-[10.5px] leading-tight text-stone-400">
              {fmt.diecut ? (
                <>
                  <span className="text-pink-500">—</span> เส้นตัด
                  {cutRes
                    ? ` · ตัวชิ้นงาน ${(cutRes.bodyW / 10).toFixed(1)}×${(cutRes.bodyH / 10).toFixed(1)} ซม.${cutRes.extras.length ? ` · ${cutRes.extras.join(" · ")}` : ""}`
                    : cutErr
                      ? ` · ⚠️ ${cutErr}`
                      : " · ใส่รูป/ข้อความ แล้วระบบตีเส้นตัดรอบลายให้"}
                  {cutRes?.warnings.length ? ` · ⚠️ ${cutRes.warnings.join(" · ")}` : ""}
                  {bgBusy ? ` · ⏳ ${bgBusy}` : ""}
                </>
              ) : (
                <>
                  {/* เทมเพลตที่ระบบไม่วาดเส้นตัดทับ (เส้นในไฟล์ไม่ใช่สี่เหลี่ยม เช่น เคสมือถือ) = เส้นตัดคือเส้นในไฟล์ ไม่โชว์ขีดแดงหลอก */}
                  {guide && (tplGeneric || (guideImg && !guideRed)) ? (
                    "เส้นตัดตามไฟล์เทมเพลต"
                  ) : (
                    <>
                      <span className="text-rose-500">{guideImg || fmt.dieline ? "—" : "- - -"}</span> เส้นตัด
                    </>
                  )}
                </>
              )}
              {guideImg && guide?.name ? ` · 📐 เทมเพลต ${guide.name}` : ""}
              {fmt.note ? ` · ${fmt.note}` : ""}
            </p>
          </div>

          {/* แผงตามปุ่มที่เลือก — Photo/รูปทรง ไม่มีแผงขวา (เครื่องมืออยู่บนภาพ) · Calendar/Events/Settings = หน้าต่างเด้งบนเวที */}
          {tool && (locked ? tool === "photo" || tool === "text" || tool === "shape" || tool === "layout" : tool === "layout" || tool === "cut") && (
            <div
              className={`order-2 w-full shrink-0 space-y-3 border-t border-stone-100 bg-white p-3 sm:order-none ${tool === "cut" ? "sm:w-80" : "sm:w-64"} sm:overflow-y-auto sm:border-l sm:border-t-0`}
            >
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

              {!locked && tool === "cut" && fmt.diecut && (
                <>
                  {/* แบบหน้า /admin/diecut?tab=bg: การ์ด "สินค้า" (สูตรเส้นตัดตามชนิดงาน) → "เส้นตัด" → "มุมมอง" */}
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-extrabold text-stone-800">สินค้า</p>
                      <p className="text-[10.5px] text-stone-400">ตั้งค่าเส้นตัดตามชนิดงาน</p>
                    </div>
                    <select
                      value={design.cut?.preset ?? "keychain"}
                      onChange={(e) => {
                        // เปลี่ยนสูตร = ล้างค่าที่ปรับเอง แล้วใช้ค่าของสูตรนั้นเป็นฐาน
                        if (presets.some((x) => x.id === e.target.value)) setDesign((d) => ({ ...d, cut: { preset: e.target.value } }));
                      }}
                      className={cutInput}
                    >
                      {presets.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <CutLabel text="ชนิดเส้นตัด">
                        <select value={cutP.cutType} onChange={(e) => setCut({ cutType: e.target.value as CutParams["cutType"] })} className={cutInput}>
                          <option value="Cut100">Cut100 (ตัดขาด)</option>
                          <option value="Cut50">Cut50 (ตัดครึ่ง)</option>
                        </select>
                      </CutLabel>
                      <CutLabel text="รองขาว">
                        <select value={cutP.white} onChange={(e) => setCut({ white: e.target.value as CutParams["white"] })} className={cutInput}>
                          <option value="none">ไม่มี</option>
                          <option value="full">เต็มรูปทรง</option>
                        </select>
                      </CutLabel>
                    </div>
                    <label className="mt-2.5 flex items-center gap-2 text-[12px] font-bold text-stone-700">
                      <input type="checkbox" checked={fmt.diecut.hole} disabled readOnly />
                      มีรูห่วง (ติ่งด้านบน)
                      <span className="text-[10.5px] font-semibold text-stone-400">ตามตัวเลือก &quot;เจาะรู&quot;</span>
                    </label>
                    {fmt.diecut.hole && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <CutNum label="ขนาดรู (Ø)" value={cutP.holeMm} min={0.5} step={0.1} onChange={(v) => setCut({ holeMm: v })} />
                        <CutNum label="เนื้อรอบรู" value={cutP.ringMm} min={0.5} step={0.1} onChange={(v) => setCut({ ringMm: v })} />
                        <CutNum label="ระยะรูห่างจากงาน" value={cutP.holeGapMm} min={0} step={0.1} onChange={(v) => setCut({ holeGapMm: v })} />
                        <CutNum label="เลื่อนรู ซ้าย(−)/ขวา(+)" value={cutP.holeXMm} step={0.5} neg onChange={(v) => setCut({ holeXMm: v })} />
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                    <p className="mb-1 text-[13px] font-extrabold text-stone-800">เส้นตัด</p>
                    <p className="mt-2 text-[11.5px] font-bold text-stone-600">หาขอบงาน</p>
                    {srcs.some((x) => !x.removed) ? (
                      <div className="mt-1 space-y-1.5">
                        {srcs.map((x, i) =>
                          x.removed ? null : (
                            <div key={i} className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={x.url}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-lg bg-[repeating-conic-gradient(#e7e5e4_0%_25%,#fff_0%_50%)] bg-[length:8px_8px] object-contain ring-1 ring-stone-200"
                              />
                              <select
                                value={x.bgPick ?? "auto"}
                                disabled={!!bgBusy}
                                onChange={(e) => void applyBg(i, e.target.value as BgMethod | "auto")}
                                className={cutInput}
                              >
                                {BG_METHODS.map((m) => (
                                  <option key={m.key} value={m.key}>
                                    {m.key === "auto"
                                      ? `อัตโนมัติ${(x.bgPick ?? "auto") === "auto" && x.bgDone ? ` (${BG_METHODS.find((z) => z.key === x.bgDone)?.label})` : ""}`
                                      : m.key === "alpha"
                                        ? "ขอบโปร่งใส (PNG)"
                                        : m.key === "solid"
                                          ? "ลบสีพื้น"
                                          : m.key === "ai"
                                            ? "AI ตัดพื้นหลัง"
                                            : "ทั้งใบ (ไม่ตัดพื้น)"}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-stone-400">ใส่รูปก่อน — ระบบเลือกวิธีหาขอบงานให้เอง</p>
                    )}
                    {bgBusy && <p className="mt-1.5 text-[11px] font-bold text-sky-700">⏳ {bgBusy}</p>}
                    {bgNote && <p className="mt-1.5 text-[11px] font-semibold leading-snug text-amber-700">{bgNote}</p>}

                    <p className="mt-3 text-[11.5px] font-bold text-stone-600">รูปร่าง</p>
                    <div className="mt-1 grid grid-cols-5 gap-1">
                      {(
                        [
                          ["contour", "ตามทรง", <path key="p" d="M6 15c-2-4 1-9 5-9 2 0 3 2 5 2s3 2 3 5-3 6-7 6-5-1-6-4z" />],
                          ["rect", "เหลี่ยม", <rect key="p" x="4" y="6" width="16" height="12" />],
                          ["rounded", "มุมมน", <rect key="p" x="4" y="6" width="16" height="12" rx="4" />],
                          ["circle", "วงกลม", <circle key="p" cx="12" cy="12" r="8" />],
                          ["ellipse", "วงรี", <ellipse key="p" cx="12" cy="12" rx="9" ry="6" />],
                        ] as const
                      ).map(([k2, t, icon]) => (
                        <button
                          key={k2}
                          type="button"
                          onClick={() => setCut({ shape: k2, autoShape: false })}
                          className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-bold transition ${
                            cutP.shape === k2 ? "bg-sky-600 text-white shadow" : "bg-stone-50 text-stone-600 ring-1 ring-stone-200 hover:bg-sky-50"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            {icon}
                          </svg>
                          {t}
                        </button>
                      ))}
                    </div>
                    {cutP.shape === "rounded" && (
                      <div className="mt-2 w-36">
                        <CutNum label="ความมนของมุม" value={cutP.radiusMm} min={0} step={0.5} onChange={(v) => setCut({ radiusMm: v })} />
                      </div>
                    )}
                    <CutSlider label="ระยะเส้นตัด" value={cutP.offsetMm} min={-5} max={10} step={0.1} unit="มม." onChange={(v) => setCut({ offsetMm: v })} />
                    <CutSlider label="ความหนาขอบ" value={cutP.strokeMm} min={0} max={10} step={0.1} unit="มม." onChange={(v) => setCut({ strokeMm: v })} />
                    {cutP.strokeMm > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-stone-500">สีขอบ</span>
                        {["#ffffff", "#000000"].map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c === "#ffffff" ? "ขาว" : "ดำ"}
                            onClick={() => setCut({ strokeColor: c })}
                            className={`h-6 w-6 rounded-full ring-2 ${cutP.strokeColor === c ? "ring-sky-500" : "ring-stone-200"}`}
                            style={{ background: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={cutP.strokeColor}
                          onChange={(e) => setCut({ strokeColor: e.target.value })}
                          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          aria-label="เลือกสีขอบ"
                        />
                      </div>
                    )}
                    <p className="mt-1.5 rounded-lg bg-sky-50 px-2 py-1.5 text-[10.5px] leading-snug text-sky-800">
                      📐 ชิ้นงานล็อกขนาด {fmt.diecut.size / 10} ซม. ตามที่สั่ง — เพิ่มระยะเส้นตัด/ขอบ ลายจะเล็กลงแทน
                    </p>
                    {cutP.shape === "contour" && (
                      <>
                        <CutSlider label="ถมร่องแคบ" value={cutP.bridge} min={0} max={2.5} step={0.1} onChange={(v) => setCut({ bridge: v })} />
                        <p className="mb-1 mt-2.5 text-[11.5px] font-bold text-stone-600">แก้เฉพาะจุด</p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              [0, "ปิด"],
                              [1, "＋ มน"],
                              [-1, "− ชิด"],
                            ] as const
                          ).map(([v, t]) => (
                            <button key={v} type="button" className={cutChip(editMode === v, true)} onClick={() => setEditMode(v)}>
                              {t}
                            </button>
                          ))}
                          <button type="button" disabled={!cutP.edits.length} className={cutChip(false, true)} onClick={() => setCut({ edits: cutP.edits.slice(0, -1) })}>
                            ↶ ย้อน
                          </button>
                          <button type="button" disabled={!cutP.edits.length} className={cutChip(false, true)} onClick={() => setCut({ edits: [] })}>
                            ล้าง
                          </button>
                        </div>
                        {editMode !== 0 && (
                          <>
                            <p className="mt-1 text-[10.5px] text-sky-700">👆 จิ้มบนภาพตรงที่อยากให้เส้น{editMode > 0 ? "มน/ถมร่อง" : "วิ่งชิดตามซอกงาน"}</p>
                            <CutSlider label="ความมนของจุด" value={cutP.plusMm} min={0.5} max={15} step={0.5} unit="มม." onChange={(v) => setCut({ plusMm: v })} />
                          </>
                        )}
                        <label className="mt-2.5 flex items-center gap-2 text-[11.5px] font-bold text-stone-600">
                          <input type="checkbox" checked={cutP.holes} onChange={(e) => setCut({ holes: e.target.checked })} />
                          เว้นรูด้านใน (ไม่ถม · ตัดทะลุช่องว่างกลางลาย)
                        </label>
                        <CutSlider label="ความโค้งของเส้น" value={cutP.smooth} min={0} max={1.33} step={0.05} onChange={(v) => setCut({ smooth: v })} />
                      </>
                    )}
                    <CutSlider
                      label="หดขอบตัด halo"
                      value={shrink}
                      min={0}
                      max={6}
                      step={1}
                      unit="px"
                      onChange={(v) => setCut({ shrink: v })}
                      onCommit={(v) => srcs.forEach((x, i) => !x.removed && (x.bgDone === "solid" || x.bgDone === "ai") && void applyBg(i, x.bgPick ?? "auto", v))}
                    />
                    <button
                      type="button"
                      className="mt-3 w-full rounded-xl bg-stone-50 px-3 py-2 text-[11.5px] font-bold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                      onClick={() => {
                        setDesign((d) => ({ ...d, cut: { preset: d.cut?.preset } }));
                        setEditMode(0);
                      }}
                    >
                      ↺ กลับค่าเริ่มต้นของสูตรนี้
                    </button>
                  </div>

                  <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                    <p className="text-[13px] font-extrabold text-stone-800">มุมมอง</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-semibold text-stone-500">พื้น</span>
                      {(
                        [
                          ["checker", "โปร่งใส"],
                          ["dark", "เข้ม"],
                          ["light", "ขาว"],
                        ] as const
                      ).map(([v, t]) => (
                        <button key={v} type="button" className={cutChip(cutView.bg === v, true)} onClick={() => setCutView((cv) => ({ ...cv, bg: v }))}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3">
                      <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-stone-600">
                        <input type="checkbox" checked={cutView.line} onChange={(e) => setCutView((cv) => ({ ...cv, line: e.target.checked }))} />
                        แสดงเส้นตัด
                      </label>
                      <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-stone-600">
                        <input type="checkbox" checked={cutView.white} onChange={(e) => setCutView((cv) => ({ ...cv, white: e.target.checked }))} />
                        แสดงรองขาว
                      </label>
                    </div>
                  </div>

                  <p className="text-[10.5px] leading-snug text-stone-400">
                    ขนาด = ด้านยาวสุดของตัวชิ้นงาน (ไม่รวมติ่งรูห่วง) · เส้นชมพู = แนวตัด · เส้นประฟ้า = รองขาว · ทีมงานตรวจไฟล์ก่อนผลิตทุกงาน
                  </p>
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

        {/* ✂️ ไดคัท = หน้าเดียวเสมอ ไม่มีแถบรูปย่อ (บนมือถือแถบเครื่องมือลอยทับจนเลื่อนไม่ถึง · 14 ต.ค. 69) */}
        {/* รูปย่อทุกหน้า (แบบ Printbox — หน้าเดียวก็โชว์ ให้เห็นภาพรวมทั้งใบ) */}
        {!fmt.diecut && (
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
                <span className="text-[10px] text-stone-400">{mixMode ? `${copies} ${cw} · ใช้ ${designN} รูป` : `พิมพ์เหมือนกัน ${copies} ${cw}`}</span>
              </div>
            )}
            {vpages.map((v, i) =>
              !mixMode && v.card > 0 ? null : v.base.optional && pageOffSet.has(v.page.key) ? (
                // 🗑 หน้าไม่บังคับที่ลบไปแล้ว — ช่องประ "＋" แตะ = ใส่หน้ากลับ
                <button
                  key={v.page.key}
                  type="button"
                  onClick={() => setPageOff(v.page.key, false, i)}
                  className={`flex shrink-0 flex-col items-center gap-1 ${v.base.sheet && i > 0 && vpages[i - 1]?.base.sheet && vpages[i - 1].base.sheet!.n !== v.base.sheet.n ? "ml-3" : ""}`}
                  title={`เพิ่ม "${v.base.name}" กลับ`}
                >
                  <span
                    className="grid place-items-center rounded-sm border-2 border-dashed border-stone-300 text-center text-[10.5px] font-bold leading-tight text-stone-400 transition hover:border-sky-400 hover:text-sky-600"
                    style={{ width: W >= H ? 120 : 80, aspectRatio: `${W} / ${H}` }}
                  >
                    ＋ เพิ่ม
                    <br />
                    {v.base.name}
                  </span>
                  <span className="max-w-[120px] truncate text-[10.5px] font-semibold text-stone-400">หน้าขาว (ไม่ใส่)</span>
                  {v.base.sheet && (
                    <span className="-mt-0.5 rounded-full bg-stone-100 px-1.5 text-[9.5px] font-bold leading-4 text-stone-400">
                      แผ่น {v.base.sheet.n} · {v.base.sheet.side === "front" ? "ด้านหน้า" : "ด้านหลัง"}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  key={v.page.key}
                  type="button"
                  onClick={() => setPageIdx(i)}
                  className={`relative flex shrink-0 flex-col items-center gap-1 ${
                    // เว้นช่องระหว่างใบ (ใบละหลายหน้า) ให้เห็นว่าหน้าไหนเป็นของใบเดียวกัน
                    ((fmt.perCard ?? 1) > 1 && i > 0 && i % (fmt.perCard ?? 1) === 0) ||
                    // 📄 ปฏิทินตั้งโต๊ะ: เว้นช่องเมื่อขึ้นแผ่นใหม่ — เห็นว่าหน้าไหนอยู่แผ่นเดียวกัน
                    (v.base.sheet && i > 0 && vpages[i - 1]?.base.sheet && vpages[i - 1].base.sheet!.n !== v.base.sheet.n)
                      ? "ml-3"
                      : ""
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
                  {/* 🗑 หน้าไม่บังคับ (หลังปก/หลังแผ่นท้าย) ลบได้ — ผู้ใช้สั่ง 14 ต.ค. 69 */}
                  {v.base.optional && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={`ลบหน้า "${v.base.name}" (พิมพ์เป็นหน้าขาว)`}
                      aria-label={`ลบหน้า ${v.base.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPageOff(v.page.key, true, i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setPageOff(v.page.key, true, i);
                        }
                      }}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] font-extrabold text-rose-500 shadow ring-1 ring-stone-200 hover:bg-rose-50"
                    >
                      ✕
                    </span>
                  )}
                  {/* 🔍 หน้านี้มีรูปคมชัดต่ำ/พอใช้ — เตือนบนภาพย่อ */}
                  {(() => {
                    const d = pageMinDpi(resolve(v));
                    if (!Number.isFinite(d)) return null;
                    const q = qualityOf(d, fmt.dpi);
                    return q.lv <= 1 ? (
                      <span
                        title={`ความคมชัด ${q.label} (${d} DPI)`}
                        className={`absolute left-1 top-1 rounded-full px-1.5 text-[9px] font-extrabold text-white shadow ${q.lv === 0 ? "bg-rose-500" : "bg-amber-500"}`}
                      >
                        {q.lv === 0 ? "⚠ รูปแตก" : "⚠ ไม่คม"}
                      </span>
                    ) : null;
                  })()}
                  <span className={`max-w-[120px] truncate text-[10.5px] ${i === pageIdx ? "font-extrabold text-stone-800" : "font-semibold text-stone-500"}`}>
                    {vname(v)}
                    {copies === 1 && (design.photos[v.page.key]?.src ?? -1) >= 0 && v.j !== coverIdx ? " 🖼" : ""}
                    {!mixMode && copies > 1 ? ` × ${copies} ${cw}` : ""}
                  </span>
                  {/* 📄 แผ่นที่ · ด้านหน้า/หลัง (ปฏิทินตั้งโต๊ะพิมพ์หน้า-หลัง) */}
                  {v.base.sheet && (
                    <span
                      className={`-mt-0.5 rounded-full px-1.5 text-[9.5px] font-bold leading-4 ${
                        v.base.sheet.side === "front" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      แผ่น {v.base.sheet.n} · {v.base.sheet.side === "front" ? "ด้านหน้า" : "ด้านหลัง"}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        )}

        {Array.isArray(flip3d) && <CalendarFlip3D sheets={flip3d} aspect={fmt.trimW / fmt.trimH} title={fmtName} onClose={() => setFlip3d(null)} />}
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
                {fmtName} · 1 {setWord} = {copies} {cw} — เปลี่ยนทีหลังได้ที่แถบรูปย่อด้านล่าง
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
                    desc: `ออกแบบครั้งเดียว พิมพ์เหมือนกันทั้ง ${copies} ${cw}`,
                    fee: feeOf(1),
                  },
                  {
                    mix: true,
                    name: "คละลาย",
                    icon: "🎨",
                    desc: `ออกแบบแต่ละ${cw}ไม่เหมือนกันได้ (ทั้ง ${copies} ${cw}) · นับลายตามจำนวนรูปที่ใช้`,
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

        {/* ❓ ตัดพื้นหลังไหม — รูปที่ไม่มีพื้นใส (งานไดคัท) */}
        {bgAsk !== null && srcs[bgAsk] && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/45 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" role="dialog" aria-label="ตัดพื้นหลังไหม">
              <h3 className="text-center text-lg font-extrabold text-stone-800">ตัดพื้นหลังรูปนี้ไหม?</h3>
              <p className="mt-1 text-center text-[12.5px] leading-relaxed text-stone-500">
                รูปนี้ไม่มีพื้นโปร่งใส — เลือกได้ว่าจะให้ชิ้นงานเป็นรูปทรงตามตัวการ์ตูน หรือใช้ทั้งภาพ
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  autoFocus
                  onClick={() => answerBg(true)}
                  className="group flex flex-col items-center rounded-2xl p-3 text-center ring-2 ring-sky-200 transition hover:bg-sky-50 hover:ring-sky-500"
                >
                  <span className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#e7e5e4_0%_25%,#fff_0%_50%)] bg-[length:10px_10px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={srcs[bgAsk].url} alt="" className="h-16 w-16 rounded-full object-cover shadow ring-2 ring-white" />
                  </span>
                  <span className="mt-2 text-[14px] font-extrabold text-sky-700">✂️ ตัดพื้นหลัง</span>
                  <span className="mt-0.5 text-[11px] leading-snug text-stone-500">เส้นตัดตามรูปทรง · ระบบเลือกวิธีตัดให้ (ลบสีพื้น / AI)</span>
                </button>
                <button
                  type="button"
                  onClick={() => answerBg(false)}
                  className="group flex flex-col items-center rounded-2xl p-3 text-center ring-2 ring-stone-200 transition hover:bg-stone-50 hover:ring-stone-400"
                >
                  <span className="grid h-24 w-24 place-items-center rounded-xl bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={srcs[bgAsk].url} alt="" className="max-h-20 max-w-20 rounded-lg object-contain shadow" />
                  </span>
                  <span className="mt-2 text-[14px] font-extrabold text-stone-700">🖼 ใช้ทั้งภาพ</span>
                  <span className="mt-0.5 text-[11px] leading-snug text-stone-500">ไม่ตัดพื้น · เส้นตัดสี่เหลี่ยมมุมมนรอบภาพ (เปลี่ยนรูปร่างได้)</span>
                </button>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-stone-400">เปลี่ยนใจทีหลังได้ที่แผง ✂️ ไดคัท › หาขอบงาน</p>
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
                            pl: fitPl(p.photo, srcs[o.src]),
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
      className={`flex min-w-[40px] flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 sm:min-w-[52px] sm:px-2 ${
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
  "grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30";

/** ความหนาขอบ 1 ขั้น (มม.) — แถบขอบโชว์เป็นเลขขั้น 1, 2, 3 … แบบ Printbox (ค่าเริ่ม 4 = 1 มม.) */
const BORDER_STEP = 0.25;

/** กล่อง [ไอคอน − ค่า +] ของแถบขอบ */
function Stepper({
  icon,
  title,
  value,
  onMinus,
  onPlus,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
}) {
  const b = "grid h-9 w-8 place-items-center text-xl text-stone-500 hover:text-stone-800 disabled:opacity-30";
  return (
    <div title={title} className={`flex h-11 items-center gap-0.5 rounded-xl px-1.5 ring-1 ring-stone-200 ${disabled ? "opacity-40" : ""}`}>
      <span className="grid h-9 w-9 place-items-center">{icon}</span>
      <button type="button" disabled={disabled} onClick={onMinus} className={b} aria-label={`${title} ลด`}>
        −
      </button>
      <span className="w-11 text-center text-sm font-semibold tabular-nums text-stone-800">{value}</span>
      <button type="button" disabled={disabled} onClick={onPlus} className={b} aria-label={`${title} เพิ่ม`}>
        ＋
      </button>
    </div>
  );
}

/** ไอคอนแถวปรับแสงสี (ความสว่าง · คอนทราสต์ · ความอิ่มสี) */
function AdjIco({ n }: { n: "sun" | "contrast" | "drop" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-stone-700" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
      {n === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </>
      ) : n === "contrast" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
        </>
      ) : (
        <path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11z" />
      )}
    </svg>
  );
}

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
  // 💬 ป้ายบอกชื่อปุ่มแบบ Printbox (ป้ายดำมุมมน + หาง) แทน title ของเบราว์เซอร์ที่เด้งช้า/ตัวเล็ก (ผู้ใช้ขอ 13 ต.ค. 69)
  return (
    <span className="group/tip relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={`${barBtn} ${on ? "bg-sky-50 text-sky-600" : ""} ${danger ? "hover:bg-rose-50 hover:text-rose-600" : ""}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-700 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover/tip:opacity-100 sm:block"
      >
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-stone-700" />
        {title}
      </span>
    </span>
  );
}

/** ไอคอนเส้นบางแบบเดียวกันทั้งแถบ (24×24 stroke) */
function Ico({
  n,
}: {
  n:
    | "imageOff"
    | "replace"
    | "zoomIn"
    | "zoomOut"
    | "fit"
    | "rotL"
    | "rotR"
    | "flip"
    | "opacity"
    | "border"
    | "copy"
    | "layers"
    | "trash"
    | "center"
    | "magic"
    | "reset";
}) {
  const P: Record<typeof n, React.ReactNode> = {
    magic: <path d="m4 20 11-11M15 9l2 2M14 4v2M19 9h2M17.5 5.5 19 4M9 5V3M5 9H3M7 7 5.5 5.5" />,
    center: <path d="M12 3v18M8 8l-4 4 4 4M16 8l4 4-4 4" />,
    reset: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="1.5" strokeDasharray="2.5 2" />
        <path d="M4 12a8 8 0 0 1 8-8h1M10 2l3 2-3 2" />
      </>
    ),
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

/** ✂️ ป้ายหัวช่อง (แบบฟอร์มหน้า /admin/diecut?tab=bg) */
function CutLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[11px] font-semibold text-stone-500">{text}</span>
      {children}
    </label>
  );
}

/** ✂️ ช่องตัวเลข + หน่วย มม. (แบบฟอร์มหน้า bg) */
function CutNum({ label, value, onChange, min, step = 0.1, neg }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; neg?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <CutLabel text={label}>
      <span className="flex items-center rounded-xl border border-stone-200 bg-white pr-2 focus-within:border-sky-400">
        <input
          type="number"
          inputMode="decimal"
          value={txt}
          step={step}
          min={neg ? undefined : (min ?? 0)}
          onChange={(e) => {
            setTxt(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && (neg || v >= (min ?? 0))) onChange(v);
          }}
          className="w-full min-w-0 rounded-xl bg-transparent px-2.5 py-1.5 text-[12px] font-bold text-stone-700 outline-none"
        />
        <em className="shrink-0 text-[10px] not-italic text-stone-400">มม.</em>
      </span>
    </CutLabel>
  );
}

/** ✂️ แถบเลื่อน + ช่องตัวเลข (แบบหน้า /admin/diecut?tab=bg) · onCommit = ปล่อยนิ้ว/พิมพ์เสร็จ */
function CutSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const fix = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-stone-500">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            value={Number(value.toFixed(2))}
            min={min}
            max={max}
            step={step}
            inputMode="decimal"
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(fix(v));
            }}
            onBlur={() => onCommit?.(value)}
            className="w-14 rounded-md border border-stone-200 px-1.5 py-0.5 text-right text-[11px] font-bold text-stone-700"
          />
          {unit && <em className="text-[10px] not-italic text-stone-400">{unit}</em>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(fix(parseFloat(e.target.value)))}
        onPointerUp={(e) => onCommit?.(fix(parseFloat((e.target as HTMLInputElement).value)))}
        onKeyUp={(e) => onCommit?.(fix(parseFloat((e.target as HTMLInputElement).value)))}
        className="w-full accent-sky-600"
      />
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

/** รายการฟอนต์แบ่งหมวด (optgroup ตาม CAL_FONTS.group) — ใช้ทุกช่องเลือกฟอนต์ในจอ */
function FontOptions() {
  const groups = [...new Set(CAL_FONTS.map((f) => f.group))];
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {CAL_FONTS.filter((f) => f.group === g).map((f) => (
            <option key={f.key} value={f.key}>
              {f.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm">
      <FontOptions />
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

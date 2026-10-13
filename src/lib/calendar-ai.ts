"use client";

/**
 * 🗂 ไฟล์ .ai แยกเลเยอร์ของปฏิทินที่ลูกค้าออกแบบบนเว็บ (ผู้ใช้สั่ง 13 ต.ค. 69 — ทดสอบเฉพาะเจ้าของร้านก่อน)
 *
 * เลเยอร์เรียงตามที่ลูกค้าจัดในหน้าต่าง Layers (ล่าง → บน): พื้นหลัง · รูปหลัก · ปฏิทิน · ข้อความ · กรอบรูป …
 * + เลเยอร์ "เส้นตัด (CutContour)" บนสุด (ล็อก)
 *
 * แต่ละชั้นวาดแยกด้วยตัววาดเดียวกับไฟล์พิมพ์ (drawPage({ only })) เป็น PNG พื้นใส ครอปเฉพาะส่วนที่มีของ
 *
 * 2 ทาง:
 *  1) Illustrator ในเครื่องร้าน (โปรแกรม tools/cutout-py พอร์ต 8777 แบบแท็บ /admin/diecut?tab=bg)
 *     สร้างเอกสารใหม่ วางทีละชั้นลงเลเยอร์ชื่อไทยของตัวเอง แล้ว Save เป็น .ai แท้ → เปิดแล้วเห็นเลเยอร์เลย
 *  2) ไม่มีโปรแกรม/Illustrator = PDF-.ai ที่แยกชั้นเป็น OCG (Acrobat เห็นเลเยอร์ · Illustrator รวมเป็น Layer 1
 *     — ข้อจำกัดเดียวกับ template-merge-ai.ts)
 */

import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, PDFRef, rgb } from "pdf-lib";
import {
  calLayersOf,
  drawPage,
  drawPostBack,
  fmtH,
  fmtW,
  LAYER_BG,
  type CalBack,
  type CalDesign,
  type CalFormat,
  type CalPage,
  type ImgRef,
} from "@/lib/calendar-card";

export const CUTOUT_PY = "http://localhost:8777";
const PT = 72 / 25.4;

export interface AiLayer {
  name: string;
  png: Blob;
  /** ตำแหน่ง/ขนาดภาพบนหน้า (มม. นับจากมุมซ้ายบนรวมตัดตก) */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AiPage {
  name: string;
  wMm: number;
  hMm: number;
  bg: string;
  layers: AiLayer[];
  /** เส้นตัด (มม.) */
  cut: { x: number; y: number; w: number; h: number; r: number };
}

/** วาดทุกชั้นของทุกหน้าที่จะพิมพ์ แยกเป็น PNG พื้นใส (ครอปขอบว่างทิ้ง) */
export async function renderAiPages(input: {
  fmt: CalFormat;
  pages: { name: string; page: CalPage }[];
  design: CalDesign;
  back: CalBack;
  imgs: (ImgRef | null)[];
  dpi?: number;
}): Promise<AiPage[]> {
  const { fmt, design, back, imgs } = input;
  const W = fmtW(fmt);
  const H = fmtH(fmt);
  const k = (input.dpi ?? fmt.dpi ?? 300) / 25.4;
  const cw = Math.round(W * k);
  const ch = Math.round(H * k);
  const out: AiPage[] = [];
  for (const { name, page } of input.pages) {
    const layers: AiLayer[] = [];
    let bg = "#ffffff";
    for (const L of calLayersOf(fmt, page, design, imgs)) {
      if (L.id === LAYER_BG) {
        bg = (page.kind === "photo" ? design.bg : back.bg) || "#ffffff";
        // 📮 ด้านหลังลายโปสการ์ด = เลเยอร์ของตัวเอง (พื้นหลังเป็นสีเวกเตอร์ ลายจะหายถ้าไม่แยกออกมา)
        if (page.kind === "postback" && !design.postOff?.includes(page.key)) {
          const cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          const ctx = cv.getContext("2d");
          if (ctx) {
            drawPostBack(ctx, k, fmt);
            const png = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
            if (png) layers.push({ name: "ลายโปสการ์ด", png, x: 0, y: 0, w: W, h: H });
          }
        }
        continue;
      }
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext("2d");
      if (!ctx) continue;
      drawPage(ctx, k, fmt, page, design, back, imgs, { only: L.id });
      const box = alphaBox(ctx, cw, ch);
      if (!box) continue; // ชั้นนี้ไม่มีอะไรเลย
      const crop = document.createElement("canvas");
      crop.width = box.w;
      crop.height = box.h;
      crop.getContext("2d")!.drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      const png = await new Promise<Blob | null>((r) => crop.toBlob(r, "image/png"));
      if (!png) continue;
      layers.push({ name: L.name, png, x: box.x / k, y: box.y / k, w: box.w / k, h: box.h / k });
    }
    out.push({
      name,
      wMm: W,
      hMm: H,
      bg,
      layers,
      cut: { x: fmt.bleed, y: fmt.bleed, w: fmt.trimW, h: fmt.trimH, r: fmt.cornerR ?? 0 },
    });
  }
  return out;
}

/** กรอบของพิกเซลที่ไม่ใส (null = ว่างทั้งภาพ) */
function alphaBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const a = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (a[row + x * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const b64 = async (b: Blob) => {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** โปรแกรม cutout-py ในเครื่องเปิดอยู่ + มี Illustrator ไหม */
export async function illustratorReady(): Promise<boolean> {
  try {
    const r = await fetch(`${CUTOUT_PY}/calendar-ai`, { method: "GET", signal: AbortSignal.timeout(1500) });
    const j = (await r.json().catch(() => null)) as { illustrator?: boolean } | null;
    return !!j?.illustrator;
  } catch {
    return false;
  }
}

/** ทาง 1: ให้ Illustrator ในเครื่องสร้าง .ai แท้ที่แยกเลเยอร์ (ส่งเป็น text/plain = ไม่ต้อง preflight) */
export async function aiViaIllustrator(pages: AiPage[], title: string): Promise<Blob> {
  const body = {
    title,
    pages: await Promise.all(
      pages.map(async (p) => ({
        ...p,
        layers: await Promise.all(p.layers.map(async (l) => ({ name: l.name, x: l.x, y: l.y, w: l.w, h: l.h, png: await b64(l.png) }))),
      })),
    ),
  };
  const r = await fetch(`${CUTOUT_PY}/calendar-ai`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Illustrator สร้างไฟล์ไม่สำเร็จ (รหัส ${r.status})`);
  }
  return new Blob([await r.arrayBuffer()], { type: "application/postscript" });
}

/** ทาง 2: PDF-.ai แยกชั้นเป็น OCG (เปิดใน Acrobat เห็นเลเยอร์ · Illustrator รวมเป็น Layer 1) */
export async function aiOcgPdf(pages: AiPage[], title: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("iDucky Prints Studio — จอสร้างปฏิทิน");
  const order: PDFRef[] = [];
  const all: PDFRef[] = [];
  const many = pages.length > 1;
  for (const p of pages) {
    const Wpt = p.wMm * PT;
    const Hpt = p.hMm * PT;
    const pg = doc.addPage([Wpt, Hpt]);
    const props: Record<string, PDFRef> = {};
    let n = 0;
    const layer = (name: string, draw: () => void) => {
      const ref = doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFHexString.fromText(many ? `${p.name} · ${name}` : name) }));
      const tag = `OC${n++}`;
      props[tag] = ref;
      all.push(ref);
      order.unshift(ref); // พาเนลเลเยอร์โชว์บนสุดก่อน
      pg.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("OC"), PDFName.of(tag)]));
      draw();
      pg.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    };
    const hex = /^#?([0-9a-f]{6})$/i.exec(p.bg)?.[1] ?? "ffffff";
    const c = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
    layer("พื้นหลัง", () => pg.drawRectangle({ x: 0, y: 0, width: Wpt, height: Hpt, color: rgb(c(0), c(2), c(4)) }));
    for (const l of p.layers) {
      const img = await doc.embedPng(await l.png.arrayBuffer());
      layer(l.name, () => pg.drawImage(img, { x: l.x * PT, y: Hpt - (l.y + l.h) * PT, width: l.w * PT, height: l.h * PT }));
    }
    const { x, y, w, h, r } = p.cut;
    const path = r
      ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
      : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    layer("เส้นตัด (CutContour)", () => pg.drawSvgPath(path, { x: 0, y: Hpt, scale: PT, borderColor: rgb(1, 0, 1), borderWidth: 0.25 / PT }));
    pg.node.Resources()?.set(PDFName.of("Properties"), doc.context.obj(props));
  }
  doc.catalog.set(PDFName.of("OCProperties"), doc.context.obj({ OCGs: all, D: { Order: order, ON: all } }));
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as unknown as BlobPart], { type: "application/postscript" });
}

/** สร้าง .ai — ลอง Illustrator ในเครื่องก่อน ไม่ได้ค่อยใช้ PDF-.ai (บอกด้วยว่าได้แบบไหน) */
export async function buildCalendarAi(pages: AiPage[], title: string): Promise<{ blob: Blob; real: boolean; note: string }> {
  if (await illustratorReady()) {
    try {
      return { blob: await aiViaIllustrator(pages, title), real: true, note: "Illustrator แยกเลเยอร์ให้แล้ว" };
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return { blob: await aiOcgPdf(pages, title), real: false, note: `Illustrator ไม่สำเร็จ (${why}) — ได้ไฟล์ PDF-.ai แทน` };
    }
  }
  return {
    blob: await aiOcgPdf(pages, title),
    real: false,
    note:
      "⚠️ ไฟล์นี้ยังไม่แยกเลเยอร์ใน Illustrator (เปิดแล้วรวมเป็น Layer 1) — โปรแกรมตัดพื้นหลังในเครื่องไม่ได้เปิดอยู่: " +
      "ดับเบิลคลิก tools/cutout-py/start.command แล้วกด ⬇ .ai ใหม่ (ชื่อไฟล์ที่ลงท้าย -pdf.ai = ไฟล์สำรองแบบนี้)",
  };
}

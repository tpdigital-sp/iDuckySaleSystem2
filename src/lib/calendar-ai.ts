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
import { dieAiCurves } from "@/lib/sleeve-dieline";

export const CUTOUT_PY = "http://localhost:8777";
const PT = 72 / 25.4;

export interface AiLayer {
  name: string;
  /** ภาพของชั้น — PNG (มีส่วนใส) หรือ JPEG (ทึบทั้งกรอบ · ชื่อช่องคงเดิม) */
  png: Blob;
  /** ตำแหน่ง/ขนาดภาพบนหน้า (มม. นับจากมุมซ้ายบนรวมตัดตก) */
  x: number;
  y: number;
  w: number;
  h: number;
}
/** ✂️ เส้นเวกเตอร์ (งานไดคัท) — เส้นโค้งเบซิเยร์ มม. · s = จุดเริ่ม · g = [c1x,c1y,c2x,c2y,tox,toy] ต่อท่อน */
export interface AiPath {
  /** ชื่อเลเยอร์ */
  layer: string;
  /** ชื่อสีพิเศษ (Cut100 / Cut50 / White) */
  spot: string;
  cmyk: [number, number, number, number];
  /** true = ถมสี (รองขาว · อยู่ใต้ลาย) · false = เส้น (เส้นตัด · บนสุด ล็อก) */
  fill: boolean;
  /** open = เส้นเปิด (รอยกรีดของปลอกแก้ว) · ไม่ตั้ง = เส้นปิด */
  curves: { s: [number, number]; g: [number, number, number, number, number, number][]; open?: boolean }[];
  /** วงกลม [cx, cy, r] มม. (รูห่วง) */
  circles?: [number, number, number][];
}
export interface AiPage {
  name: string;
  wMm: number;
  hMm: number;
  /** สีพื้น · "none" = พื้นใส (งานไดคัท) */
  bg: string;
  layers: AiLayer[];
  /** เส้นตัดสี่เหลี่ยม (มม.) · null = ไม่มี (งานไดคัทใช้ paths) */
  cut: { x: number; y: number; w: number; h: number; r: number } | null;
  paths?: AiPath[];
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
      // 📉 ชั้นทึบทั้งกรอบ (รูปถ่าย) = JPEG · มีส่วนใส (ข้อความ/ตาราง/รูปทรง) = PNG
      //    เดิม PNG ทุกชั้น → ปฏิทิน 16 หน้ารูปเต็ม ส่ง 98 MB · .ai เกิน 50 MB อัปเข้าออเดอร์ไม่ได้ (14 ต.ค. 69)
      const png = await new Promise<Blob | null>((r) =>
        crop.toBlob(r, box.opaque ? "image/jpeg" : "image/png", box.opaque ? 0.92 : undefined),
      );
      if (!png) continue;
      layers.push({ name: L.name, png, x: box.x / k, y: box.y / k, w: box.w / k, h: box.h / k });
    }
    out.push({
      name,
      wMm: W,
      hMm: H,
      bg,
      layers,
      // ☕✂️ ไดคัทตามทรง (ปลอกแก้วขนาดกำหนดเอง) = เส้นเวกเตอร์ CutContour แทนสี่เหลี่ยม · รอยกรีดเป็นเส้นเปิดในเลเยอร์เดียวกัน
      cut: fmt.dieline ? null : { x: fmt.bleed, y: fmt.bleed, w: fmt.trimW, h: fmt.trimH, r: fmt.cornerR ?? 0 },
      ...(fmt.dieline
        ? {
            paths: [
              {
                layer: "เส้นตัด (CutContour)",
                spot: "CutContour",
                cmyk: [0, 100, 0, 0] as [number, number, number, number],
                fill: false,
                curves: [...dieAiCurves(fmt.dieline.cut, fmt.bleed), ...dieAiCurves(fmt.dieline.slits, fmt.bleed, true)],
              },
            ],
          }
        : {}),
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
  // ทึบทั้งกรอบไหม (ไม่มีพิกเซลโปร่งแสงเลย) → เก็บเป็น JPEG ได้
  let opaque = true;
  for (let y = y0; y <= y1 && opaque; y++) {
    const row = y * w * 4;
    for (let x = x0; x <= x1; x++)
      if (a[row + x * 4 + 3] < 255) {
        opaque = false;
        break;
      }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, opaque };
}

const b64 = async (b: Blob) => {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** สถานะโปรแกรม cutout-py ในเครื่อง: down = ไม่ได้เปิด · noai = เปิดอยู่แต่ไม่เจอ Illustrator · ready = ทำ .ai ได้ */
export type CutoutStatus = "down" | "noai" | "ready";
export async function cutoutStatus(timeoutMs = 1500): Promise<CutoutStatus> {
  try {
    const r = await fetch(`${CUTOUT_PY}/calendar-ai`, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    const j = (await r.json().catch(() => null)) as { illustrator?: boolean } | null;
    return j?.illustrator ? "ready" : "noai";
  } catch {
    return "down";
  }
}

/** โปรแกรม cutout-py ในเครื่องเปิดอยู่ + มี Illustrator ไหม */
export async function illustratorReady(): Promise<boolean> {
  return (await cutoutStatus()) === "ready";
}

/**
 * 🪟 เว็บสั่งเปิด cutout-py เอง (เครื่อง Windows ที่ติดตั้งด้วย start.bat — ลงทะเบียนลิงก์ iducky-cutout: ไว้ · 19 ต.ค. 69)
 * ⚠️ เบราว์เซอร์ยอมเปิดโปรแกรมภายนอกเฉพาะตอน "เพิ่งกดปุ่ม" — เรียกในตัวจัดการคลิกก่อน await ใด ๆ
 * ครั้งแรก Chrome/Edge ถาม "เปิด iDucky cutout-py ไหม" (ติ๊กอนุญาตเสมอได้) · Mac ใช้ start.command เปิดเอง → ไม่ทำอะไร
 */
export const canLaunchCutout = (): boolean => typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
export function launchCutoutPy(): boolean {
  if (!canLaunchCutout()) return false;
  try {
    window.location.href = "iducky-cutout:start";
    return true;
  } catch {
    return false;
  }
}

/** รอโปรแกรมที่เพิ่งสั่งเปิดตอบ (เปิดพอร์ตก่อนโหลด AI — ปกติไม่กี่วินาที) · หมดเวลา = สถานะล่าสุด */
export async function waitCutoutReady(ms = 45000): Promise<CutoutStatus> {
  const until = Date.now() + ms;
  let st: CutoutStatus = "down";
  while (Date.now() < until) {
    st = await cutoutStatus();
    if (st !== "down") return st;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return st;
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
  doc.setCreator("iDuckyOfficial — จอสร้างปฏิทิน");
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
    if (p.bg !== "none") layer("พื้นหลัง", () => pg.drawRectangle({ x: 0, y: 0, width: Wpt, height: Hpt, color: rgb(c(0), c(2), c(4)) }));
    /** ✂️ เส้นเวกเตอร์ → svg path (มม.) */
    const svgOf = (P: AiPath) =>
      P.curves.map((cv) => `M ${cv.s[0]} ${cv.s[1]} ` + cv.g.map((g) => `C ${g[0]} ${g[1]} ${g[2]} ${g[3]} ${g[4]} ${g[5]}`).join(" ") + (cv.open ? "" : " Z")).join(" ") +
      (P.circles ?? []).map(([cx, cy, r]) => ` M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`).join("");
    for (const P of (p.paths ?? []).filter((x) => x.fill))
      layer(P.layer, () => pg.drawSvgPath(svgOf(P), { x: 0, y: Hpt, scale: PT, color: rgb(0.85, 0.95, 1) }));
    for (const l of p.layers) {
      const img = l.png.type === "image/jpeg" ? await doc.embedJpg(await l.png.arrayBuffer()) : await doc.embedPng(await l.png.arrayBuffer());
      layer(l.name, () => pg.drawImage(img, { x: l.x * PT, y: Hpt - (l.y + l.h) * PT, width: l.w * PT, height: l.h * PT }));
    }
    if (p.cut) {
      const { x, y, w, h, r } = p.cut;
      const path = r
        ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
        : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      layer("เส้นตัด (CutContour)", () => pg.drawSvgPath(path, { x: 0, y: Hpt, scale: PT, borderColor: rgb(1, 0, 1), borderWidth: 0.25 / PT }));
    }
    for (const P of (p.paths ?? []).filter((x) => !x.fill))
      layer(P.layer, () => pg.drawSvgPath(svgOf(P), { x: 0, y: Hpt, scale: PT, borderColor: rgb(1, 0, 1), borderWidth: 0.25 / PT }));
    pg.node.Resources()?.set(PDFName.of("Properties"), doc.context.obj(props));
  }
  doc.catalog.set(PDFName.of("OCProperties"), doc.context.obj({ OCGs: all, D: { Order: order, ON: all } }));
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as unknown as BlobPart], { type: "application/postscript" });
}

/**
 * สร้าง .ai — ลอง Illustrator ในเครื่องก่อน ไม่ได้ค่อยใช้ PDF-.ai (บอกด้วยว่าได้แบบไหน)
 * @param local false = ไม่แตะโปรแกรม cutout-py/Illustrator เลย ทำไฟล์สำรอง PDF-.ai ในเบราว์เซอร์อย่างเดียว
 *   (ตอนกด ✓ ใช้แบบนี้ / 💾 บันทึกกลับ — .ai แท้ไปทำที่หน้าออเดอร์ปุ่ม 🔁 · 19 ต.ค. 69)
 */
export async function buildCalendarAi(pages: AiPage[], title: string, local = true): Promise<{ blob: Blob; real: boolean; note: string }> {
  if (local && (await illustratorReady())) {
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

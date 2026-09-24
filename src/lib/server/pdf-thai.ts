/**
 * 🇹🇭 เขียนข้อความไทยลงไฟล์ PDF ให้ตัวสะกดไม่เพี้ยน
 *
 * pdf-lib วางสระ/วรรณยุกต์ไทยเองไม่เป็น — มันส่งแต่ "ตัวไหน" ให้ไฟล์ PDF ไม่ส่ง "วางตรงไหน"
 * ที่ฟอนต์กำหนดไว้ (ตาราง GPOS) ผลคือ "ปั๊มนูน" ออกมาเป็น "ปั ๊ มนูน" สระลอยห่างเป็นช่องว่าง
 *
 * ที่นี่เลยให้ fontkit (ตัวจัดวางตัวอักษรที่ pdf-lib ใช้อยู่แล้ว) คำนวณให้ก่อน — มันอ่านทั้ง
 * GSUB (เปลี่ยนรูปวรรณยุกต์ให้ลอยสูงขึ้นเมื่อซ้อนสระ) และ GPOS (ขยับซ้าย/ขวา/บน/ล่าง) —
 * แล้วเราค่อยวาดทีละตัวตามพิกัดที่ได้
 *
 * ⚠️ กติกา 2 ข้อที่ห้ามแก้
 *  1) ฝังฟอนต์แบบไม่ subset — ตัวย่อฟอนต์ของ pdf-lib สลับรหัสตัวอักษรจนไทยอ่านไม่ออก (ลองแล้ว)
 *  2) วาดทีละตัวอักษร (1 คำสั่งต่อ 1 ตัว พร้อมระบุพิกัดเอง) ไม่มัดรวมเป็นสตริงเดียว
 *     เพราะถ้ามัดรวม ตัวอ่าน PDF จะเดินหน้าตามความกว้างในไฟล์เอง = สระวางผิดที่อีก
 */

import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { Font as KitFont } from "@pdf-lib/fontkit";
import {
  beginText,
  PDFDict,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  endText,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  type RGB,
} from "pdf-lib";

export interface ThaiFont {
  /** ตัวที่ฝังอยู่ในไฟล์ PDF */
  pdf: PDFFont;
  /** ตัวเดียวกันในมุมของ fontkit — ไว้ถามว่า "ตัวไหนวางตรงไหน กว้างเท่าไหร่" */
  kit: KitFont;
}

export interface ThaiFonts {
  reg: ThaiFont;
  bold: ThaiFont;
}

/** ฟอนต์ประจำร้าน (ไฟล์เดียวกับที่หน้าเว็บใช้) */
const FONT_FILES = { reg: "Mitr-Medium.ttf", bold: "Mitr-SemiBold.ttf" } as const;

const bytesCache = new Map<string, Uint8Array>();
const kitCache = new Map<string, KitFont>();

function fontBytes(file: string): Uint8Array {
  const hit = bytesCache.get(file);
  if (hit) return hit;
  // ⚠️ ไฟล์ฟอนต์อยู่ใน public/fonts — เว็บจริง (Netlify) ต้องมี outputFileTracingIncludes ใน
  //    next.config.ts ด้วย ไม่งั้นไฟล์ไม่ถูกแพ็คไปกับ API แล้วออกใบเสร็จพัง 500
  const b = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", "fonts", file)));
  bytesCache.set(file, b);
  return b;
}

function kitFont(file: string): KitFont {
  const hit = kitCache.get(file);
  if (hit) return hit;
  const f = fontkit.create(fontBytes(file));
  kitCache.set(file, f);
  return f;
}

/** ฝังฟอนต์ไทยลงเอกสาร (เรียกครั้งเดียวต่อเอกสาร) */
export async function embedThaiFonts(doc: PDFDocument): Promise<ThaiFonts> {
  doc.registerFontkit(fontkit);
  const one = async (file: string): Promise<ThaiFont> => ({
    pdf: await doc.embedFont(fontBytes(file), { subset: false }),
    kit: kitFont(file),
  });
  return { reg: await one(FONT_FILES.reg), bold: await one(FONT_FILES.bold) };
}

/**
 * ล้างตัวที่ฟอนต์ไม่มี — อีโมจิ/ตัวควบคุม (ชื่อรายการหลายตัวขึ้นต้นด้วย 🎨 🛒)
 * ไม่ล้างก่อนจะได้ช่องว่างค้างหน้าข้อความ เพราะตอนวาดเราข้ามตัวที่ไม่มีให้เอง
 */
export function plainThai(text: string): string {
  return String(text ?? "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** ความกว้างของข้อความเมื่อพิมพ์ด้วยขนาดนี้ (จุด) */
export function thaiWidth(font: ThaiFont, text: string, size: number): number {
  const t = plainThai(text);
  if (!t) return 0;
  return (font.kit.layout(t).advanceWidth * size) / font.kit.unitsPerEm;
}

export interface DrawThaiOpts {
  font: ThaiFont;
  size: number;
  x: number;
  y: number;
  color?: RGB;
  /** x ที่ให้มาคือขอบซ้าย (ปกติ) · ขอบขวา · หรือจุดกึ่งกลาง */
  align?: "left" | "right" | "center";
}

/** วาดข้อความไทย 1 บรรทัด — คืนความกว้างที่วาดจริง */
export function drawThai(page: PDFPage, raw: string, o: DrawThaiOpts): number {
  const text = plainThai(raw);
  if (!text) return 0;
  const { font, size } = o;
  const run = font.kit.layout(text);
  const scale = size / font.kit.unitsPerEm;
  const width = run.advanceWidth * scale;
  const startX = o.align === "right" ? o.x - width : o.align === "center" ? o.x - width / 2 : o.x;
  const color = o.color ?? rgb(0, 0, 0);

  // ชื่ออ้างอิงฟอนต์ในหน้านี้ (ลงทะเบียนซ้ำได้ ไม่บวม — pdf-lib จำของเดิมให้)
  const fontKey = page.node.newFontDictionary(font.pdf.name, font.pdf.ref);

  const ops = [
    // บอกตัวอ่าน PDF ว่าข้อความจริงคืออะไร — เวลา "คัดลอก" จากไฟล์จะได้ตัวสะกดถูก
    // (เราวาดรูปวรรณยุกต์แบบซ้อน ซึ่งในฟอนต์เป็นอักขระคนละตัว ถ้าไม่บอกไว้จะก๊อบได้ "ทั˔ง")
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      PDFName.of("Span"),
      // pdf-lib ไม่ได้ประกาศชนิดว่ารับ dict ตรงนี้ แต่มันเขียนลงไฟล์ได้ปกติ (ตรวจแล้วใน check:receipt-pdf)
      PDFDict.fromMapWithContext(new Map([[PDFName.of("ActualText"), PDFHexString.fromText(text)]]), page.doc.context) as unknown as PDFName,
    ]),
    pushGraphicsState(),
    setFillingRgbColor(color.red, color.green, color.blue),
    beginText(),
    setFontAndSize(fontKey, size),
  ];
  let pen = startX;
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i];
    const p = run.positions[i];
    if (g.id) {
      ops.push(setTextMatrix(1, 0, 0, 1, pen + p.xOffset * scale, o.y + p.yOffset * scale));
      ops.push(showText(PDFHexString.of(g.id.toString(16).padStart(4, "0"))));
    }
    pen += p.xAdvance * scale;
  }
  ops.push(endText(), popGraphicsState(), PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  page.pushOperators(...ops);
  return width;
}

/** ตัดข้อความยาวให้พอดีความกว้าง (ไทยไม่มีเว้นวรรคระหว่างคำ → ตัดทีละตัวอักษรเมื่อจำเป็น) */
export function wrapThai(font: ThaiFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of plainThai(text).split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    // ตัดที่ช่องว่างก่อน — ไม่พอค่อยไล่ตัดทีละตัวอักษร
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      if (thaiWidth(font, line + word, size) <= maxWidth) {
        line += word;
        continue;
      }
      if (line.trim()) {
        out.push(line.trimEnd());
        line = "";
      }
      if (thaiWidth(font, word, size) <= maxWidth) {
        line = word.trimStart();
        continue;
      }
      for (const ch of [...word]) {
        if (thaiWidth(font, line + ch, size) > maxWidth && line) {
          out.push(line);
          line = "";
        }
        line += ch;
      }
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [""];
}

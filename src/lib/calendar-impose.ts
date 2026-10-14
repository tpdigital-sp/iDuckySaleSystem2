"use client";

/**
 * 🖨 ไฟล์ .pdf ชิ้นงาน "ไฟล์เดียว" สำหรับโปรแกรมจัดวาง Smart Imposition Pro (~/Desktop/PDF Layout · localhost:8002)
 * (ผู้ใช้สั่ง 13 ต.ค. 69 "ต้องการให้งานรวมอยู่ใน 1 ไฟล์ ไม่ใช่แยกไฟล์" · ทดสอบเฉพาะเจ้าของร้าน)
 *
 * หน้าเรียงทีละชิ้น: ด้านหน้า · ด้านหลัง · เส้นไดคัท (งาน 1 ด้าน = ด้านหน้า · เส้นไดคัท) ต่อกันทุกชิ้น
 * (ผู้ใช้สั่งต่อ "เส้นไดคัทตามจำนวนชิ้นงานไปเลย" — เดิมเส้นไดคัทหน้าเดียวท้ายไฟล์)
 * ทุกใบเป็นชิ้นของตัวเอง (ใบ × ชุดที่สั่ง) — ภาพที่ซ้ำกันฝังครั้งเดียวใช้ซ้ำ ไฟล์ไม่บวม
 * Subject ของไฟล์ = "iducky-pieces {duplex, counts}" → โปรแกรมจัดวางจับคู่หน้า/หลัง/เส้นตัด + ตั้งจำนวนต่อลายเอง
 *   ⚠️ โปรแกรมจัดวางต้องมีโค้ดอ่านรหัสนี้ (classifySpecialGroupJobs) — ตัวเดิมเดาจากหมึก รวมหลายลายในไฟล์เดียวไม่ได้
 *      (ทดลองแล้ว: ด้านหลังกลายเป็นชิ้นใหม่ทุกแบบ)
 * ชื่อไฟล์แบบร้าน "01_000_<ชื่องาน> (2ด้าน) = N ชิ้น.pdf" · "ปฏิทิน" = โหมดปฏิทิน · "(2ด้าน)" = เปิดหน้า-หลัง
 */

import { PDFDocument, rgb, type PDFImage } from "pdf-lib";

const PT = 72 / 25.4;

/** เส้นตัด (มม. นับจากมุมซ้ายบนของชิ้นรวมตัดตก) */
export interface CutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export interface PieceDesign {
  front: Blob;
  back?: Blob;
  /** จำนวนชิ้นของลายนี้ (ใส่ในชื่อไฟล์ "= N ชิ้น" ให้คนจัดวางเห็น — โปรแกรมยังให้ตั้งจำนวนเอง) */
  count: number;
}

export const PIECES_TAG = "iducky-pieces";

/** ไฟล์ชิ้นงานไฟล์เดียว (ดูหัวไฟล์) */
export async function buildPieceFiles(input: {
  designs: PieceDesign[];
  wMm: number;
  hMm: number;
  cut: CutRect;
  name: string;
  duplex: boolean;
}): Promise<{ file: File; designs: number; pages: number; counts: number[] }> {
  // ✅ ทุกใบเป็นชิ้นของตัวเอง (ลายเดียว 20 ใบ = 20 ชิ้น) — เดิมรวมใบภาพซ้ำเหลือชิ้นเดียวแล้วฝากจำนวนไว้ในรหัสไฟล์
  //    แต่โปรแกรมจัดวางยังไม่อ่านรหัส → ไฟล์ขาดชิ้น (ผู้ใช้แจ้ง 13 ต.ค. 69 "จำนวนชิ้นไม่ครบ" ได้ 3 จาก 20)
  //    ภาพที่เหมือนกันฝังครั้งเดียวใช้ซ้ำทุกหน้า (ไฟล์ไม่บวม)
  const hash = async (b: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await b.arrayBuffer()))).join(",");
  const pieces: Blob[][] = [];
  for (const d of input.designs) for (let i = 0; i < d.count; i++) pieces.push(input.duplex ? [d.front, d.back ?? d.front] : [d.front]);
  const doc = await PDFDocument.create();
  const W = input.wMm * PT;
  const H = input.hMm * PT;
  // ✂️ เส้นไดคัท — เส้นเวกเตอร์บางสีแดงม่วงตรงเส้นตัดจริง · ต่อท้ายทุกชิ้น
  const { x, y, w, h, r } = input.cut;
  const path = r
    ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
    : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  const embedded = new Map<string, PDFImage>();
  const emb = async (b: Blob) => {
    const key = await hash(b);
    let img = embedded.get(key);
    if (!img) {
      const bytes = await b.arrayBuffer();
      img = b.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      embedded.set(key, img);
    }
    return img;
  };
  for (const sides of pieces) {
    for (const side of sides) doc.addPage([W, H]).drawImage(await emb(side), { x: 0, y: 0, width: W, height: H });
    doc.addPage([W, H]).drawSvgPath(path, { x: 0, y: H, scale: PT, borderColor: rgb(1, 0, 1), borderWidth: 0.5 / PT });
  }
  const counts = pieces.map(() => 1);
  const total = counts.reduce((a, b) => a + b, 0);
  const spec = `${input.name
    .replace(/[\\/:*?"<>|=_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()}${input.duplex ? " (2ด้าน)" : ""}`;
  const name = `01_000_${spec} = ${total} ชิ้น.pdf`;
  doc.setTitle(name.replace(/\.pdf$/, ""));
  doc.setSubject(`${PIECES_TAG} ${JSON.stringify({ duplex: input.duplex, counts })}`);
  doc.setCreator("iDucky Prints Studio — จอสร้างปฏิทิน");
  const bytes = await doc.save();
  return { file: new File([bytes as BlobPart], name, { type: "application/pdf" }), designs: pieces.length, pages: doc.getPageCount(), counts };
}

/**
 * 🖨 ไฟล์ .pdf ทั้งเล่ม (ปฏิทินตั้งโต๊ะ/แขวน/แคนวาส ฯลฯ ที่ไม่ใช่การ์ดชุด · ผู้ใช้สั่ง 14 ต.ค. 69 · เฉพาะเจ้าของร้าน)
 * ทุกหน้าที่จะพิมพ์เรียงตามลำดับในไฟล์เดียว (ขนาดรวมตัดตก · ตั้ง TrimBox ตรงเส้นตัด) + หน้าสุดท้าย = เส้นไดคัท
 */
export async function buildPrintPdf(input: {
  pages: { name: string; file: Blob }[];
  wMm: number;
  hMm: number;
  cut: CutRect;
  name: string;
}): Promise<File> {
  const doc = await PDFDocument.create();
  const W = input.wMm * PT;
  const H = input.hMm * PT;
  const { x, y, w, h, r } = input.cut;
  for (const p of input.pages) {
    const bytes = await p.file.arrayBuffer();
    const img = p.file.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const pg = doc.addPage([W, H]);
    pg.drawImage(img, { x: 0, y: 0, width: W, height: H });
    pg.setTrimBox(x * PT, H - (y + h) * PT, w * PT, h * PT);
  }
  const path = r
    ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
    : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  doc.addPage([W, H]).drawSvgPath(path, { x: 0, y: H, scale: PT, borderColor: rgb(1, 0, 1), borderWidth: 0.5 / PT });
  const name = `${input.name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim()}.pdf`;
  doc.setTitle(name.replace(/\.pdf$/, ""));
  doc.setSubject(input.pages.map((p, i) => `${i + 1}.${p.name}`).join(" · ") + ` · ${input.pages.length + 1}.เส้นไดคัท`);
  doc.setCreator("iDucky Prints Studio — จอสร้างปฏิทิน");
  const bytes = await doc.save();
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

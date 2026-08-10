"use client";

/**
 * 🖨 ไฟล์ .ai พร้อมพิมพ์ จากลายที่ลูกค้าวางเองบนเว็บ
 *
 * ลูกค้าจัดวาง/ย่อ-ขยายเสร็จแล้ว ระบบประกอบเป็นภาพขนาดเท่างานจริง (รวมตัดตก) ที่ 300 DPI
 * ตัวนี้แค่ห่อภาพนั้นเป็นไฟล์ .ai หน้าเดียวขนาดเท่างานจริง → กราฟฟิกเปิดแล้วส่งพิมพ์ได้เลย
 * ไม่ต้องมาจัดหน้าใหม่ (ลูกค้าอนุมัติแบบมาแล้วตั้งแต่หน้าเว็บ)
 *
 * ไฟล์ .ai ตั้งแต่ v9 คือ PDF ที่ Illustrator เปิด/แก้ได้ตรง ๆ — เขียนเป็น PDF ได้เลย
 * ภาพ JPEG ฝังลงไปดิบ ๆ ด้วย /DCTDecode (ไม่ต้องแตกแล้วบีบใหม่ ไฟล์เล็กและเร็ว)
 */

const PT_PER_MM = 72 / 25.4;
const enc = new TextEncoder();

/** ตัวเขียน PDF — จำ byte offset ของแต่ละ object ไว้ทำตาราง xref */
class PdfWriter {
  private parts: Uint8Array[] = [];
  length = 0;
  offsets: number[] = [];

  push(chunk: string | Uint8Array) {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  startObj(n: number) {
    this.offsets[n] = this.length;
    this.push(`${n} 0 obj\n`);
  }

  endObj() {
    this.push("endobj\n");
  }

  blob(type: string) {
    return new Blob(this.parts as BlobPart[], { type });
  }
}

/** ขนาดภาพ + จำนวนช่องสีจากส่วนหัว JPEG (ไม่ต้องพึ่ง DOM) */
function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // มาร์กเกอร์ที่ไม่มีความยาวต่อท้าย
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOFn (ยกเว้น DHT/JPG/DAC) = เฟรมจริง มีขนาดภาพอยู่ในนั้น
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    i += 2 + len;
  }
  return null;
}

/** ไม่ใช่ JPEG (เช่น PNG) → วาดลงแคนวาสแล้วเข้ารหัสเป็น JPEG ก่อนฝัง */
async function toJpegBytes(blob: Blob): Promise<{ bytes: Uint8Array; w: number; h: number; comps: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("เปิดไฟล์ภาพไม่ได้"));
      im.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    const jpg = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.94));
    if (!jpg) throw new Error("แปลงภาพเป็น JPEG ไม่สำเร็จ");
    return { bytes: new Uint8Array(await jpg.arrayBuffer()), w: cv.width, h: cv.height, comps: 3 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PrintAiInput {
  /** ภาพงานที่ประกอบแล้ว (ขนาดเท่ากรอบงานพอดี รวมตัดตก) */
  imageUrl: string;
  /** ขนาดกรอบงานจริงเป็นมิลลิเมตร (รวมตัดตก) */
  widthMm: number;
  heightMm: number;
  /** ชื่องาน — เขียนลง metadata ให้รู้ว่ามาจากออเดอร์ไหน */
  title?: string;
}

export async function buildPrintAi(input: PrintAiInput): Promise<Blob> {
  const res = await fetch(input.imageUrl);
  if (!res.ok) throw new Error(`โหลดภาพไม่สำเร็จ (${res.status})`);
  const blob = await res.blob();
  const raw = new Uint8Array(await blob.arrayBuffer());

  const info = jpegInfo(raw);
  const img = info ? { bytes: raw, ...info } : await toJpegBytes(blob);

  // ภาพขาวดำล้วนใช้ DeviceGray · 4 ช่อง = CMYK · นอกนั้น RGB
  const colorSpace = img.comps === 1 ? "/DeviceGray" : img.comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";

  const pageW = input.widthMm * PT_PER_MM;
  const pageH = input.heightMm * PT_PER_MM;
  const content = `q\n${pageW.toFixed(3)} 0 0 ${pageH.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(content);

  const w = new PdfWriter();
  w.push("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n");

  w.startObj(1);
  w.push("<< /Type /Catalog /Pages 2 0 R >>\n");
  w.endObj();

  w.startObj(2);
  w.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  w.endObj();

  w.startObj(3);
  w.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] ` +
      `/TrimBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n",
  );
  w.endObj();

  w.startObj(4);
  w.push(`<< /Length ${contentBytes.length} >>\nstream\n`);
  w.push(contentBytes);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(5);
  w.push(
    `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
      `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
  );
  w.push(img.bytes);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(6);
  const title = (input.title ?? "artwork").replace(/[()\\]/g, "");
  w.push(`<< /Title (${title}) /Creator (iDucky Prints Studio) /Producer (iDucky print-ai) >>\n`);
  w.endObj();

  const xrefAt = w.length;
  const count = 7; // object 0 + 1..6
  w.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) w.push(`${String(w.offsets[i]).padStart(10, "0")} 00000 n \n`);
  w.push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return w.blob("application/postscript");
}

/** สั่งเบราว์เซอร์ดาวน์โหลด blob เป็นชื่อไฟล์ที่กำหนด */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { makeZip } from "@/lib/zip";

/**
 * 📦 ชุดไฟล์พร้อมพิมพ์ (.zip) — เทมเพลตต้นฉบับ + ลายลูกค้า + สคริปต์วางให้อัตโนมัติ
 *
 * ทำไมไม่ยัดลายเข้าไฟล์ .ai ให้เลย: เลเยอร์ที่ Illustrator เห็นมาจากข้อมูลส่วนตัวของ Adobe
 * (`/PieceInfo` → `%AI24_ZStandard_Data` = PGF บีบด้วย Zstandard) เป็นรูปแบบปิด เขียนเพิ่มจากข้างนอกไม่ได้
 * ถ้าตัดข้อมูลก้อนนั้นทิ้งเพื่อยัดลาย เลเยอร์เดิมของเทมเพลตจะหายกลายเป็น Layer 1 อันเดียว
 *
 * ชุดนี้เลยให้ "เทมเพลตต้นฉบับที่ยังครบทุกเลเยอร์" แล้วเพิ่มลายเป็นเลเยอร์ใหม่ด้วยสคริปต์แทน
 * (ExtendScript เป็นของมาตรฐานที่ Illustrator รองรับ — เมนู File → Scripts)
 */
export async function buildPrintBundle(input: {
  templateUrl: string;
  imageUrl: string;
  /** ชื่อฐานของไฟล์ในซิป เช่น "OD-260810-7686-item1-ลาย1" */
  baseName: string;
}): Promise<Blob | null> {
  try {
    const [tplRes, artRes] = await Promise.all([fetch(input.templateUrl), fetch(input.imageUrl)]);
    if (!tplRes.ok || !artRes.ok) return null;
    const tpl = new Uint8Array(await tplRes.arrayBuffer());
    const art = new Uint8Array(await artRes.arrayBuffer());

    /**
     * ชื่อไฟล์ในซิปใช้ภาษาอังกฤษล้วน — โปรแกรมแตกซิปรุ่นเก่าบางตัวอ่านชื่อไทยไม่ออก
     * (ชื่อออเดอร์ภาษาไทยอยู่ที่ชื่อไฟล์ .zip ข้างนอกและในไฟล์ README แทน)
     */
    const aiName = "TEMPLATE.ai";
    const artName = "ARTWORK.jpg";

    /**
     * สคริปต์ ExtendScript — เปิดเทมเพลตแล้วสร้างเลเยอร์ "ลายลูกค้า (iDucky)" ไว้ล่างสุด
     * วางลายให้เต็มอาร์ตบอร์ดพอดี แล้วฝังไฟล์เข้าเอกสาร (จะได้ไม่ต้องพกไฟล์ลายไปด้วย)
     *
     * ⚠️ ตัวสคริปต์ต้องเป็น ASCII ล้วน — ExtendScript อ่านไฟล์ตามการเข้ารหัสของเครื่อง
     * ถ้าใส่ตัวอักษรไทยตรง ๆ บางเครื่องจะอ่านเพี้ยนจนตั้งชื่อเลเยอร์ไม่ได้ (กลายเป็น "Layer 3")
     * เลยแปลงข้อความไทยทุกตัวเป็น \uXXXX ก่อน
     */
    const th = (t: string) =>
      `"${[...t].map((c) => (c.charCodeAt(0) < 128 ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)).join("")}"`;
    /**
     * สคริปต์ทำน้อยที่สุดเท่าที่จำเป็น — แค่ "สร้างเลเยอร์ + วางรูป"
     * ตัดคำสั่ง embed()/ปรับขนาด ออก เพราะเป็นจุดที่พังบ่อยและต่างกันไปตามเวอร์ชัน
     * (ขนาดรูปเท่ากรอบงานพอดีอยู่แล้ว ลากให้ตรงอาร์ตบอร์ดใช้เวลาไม่กี่วินาที)
     */
    const jsx = [
      "// Place customer artwork onto the template - iDucky Prints Studio",
      "// Illustrator: File > Scripts > Other Script... then pick this file",
      "#target illustrator",
      "(function () {",
      '  function say(m) { alert("iDucky: " + m); }',
      "  var here = new File($.fileName).parent;",
      `  var artFile = new File(here.fsName + "/" + ${JSON.stringify(artName)});`,
      `  if (!artFile.exists) { say(${th("ไม่พบ ARTWORK.jpg ในโฟลเดอร์เดียวกับสคริปต์ — ต้องแตกซิปให้ครบทุกไฟล์ก่อน")}); return; }`,
      `  if (!app.documents.length) { say(${th("เปิด TEMPLATE.ai ก่อน แล้วค่อยรันสคริปต์นี้")}); return; }`,
      "  var doc = app.activeDocument;",
      "  try {",
      "    var layer = doc.layers.add();",
      `    try { layer.name = ${th("ลายลูกค้า (iDucky)")}; } catch (e) { layer.name = "Customer Artwork (iDucky)"; }`,
      "    var placed = layer.placedItems.add();",
      "    placed.file = artFile;",
      "    layer.zOrder(ZOrderMethod.SENDTOBACK);",
      "    if (!layer.pageItems.length) {",
      `      say(${th("วางรูปไม่สำเร็จ — ลาก ARTWORK.jpg จาก Finder เข้ามาวางบนอาร์ตบอร์ดแทนได้เลย")});`,
      "      return;",
      "    }",
      `    say(${th("เรียบร้อย — ปรับให้พอดีอาร์ตบอร์ดแล้วส่งพิมพ์ได้เลย")});`,
      "  } catch (e) {",
      `    say(${th("สคริปต์ทำไม่ได้: ")} + e + "\\n" + ${th("ให้ลาก ARTWORK.jpg เข้ามาวางเองแทน")});`,
      "  }",
      "})();",
      "",
    ].join("\n");

    const readme = [
      "ชุดไฟล์พร้อมพิมพ์ — iDucky Prints Studio",
      `งาน: ${input.baseName}`,
      "",
      `1) ${aiName}   = เทมเพลตต้นฉบับ (เลเยอร์ครบเหมือนไฟล์ในคลัง ไม่ถูกแก้อะไรเลย)`,
      `2) ${artName}  = ลายของลูกค้า ขนาดเท่ากรอบงานรวมตัดตกพอดี`,
      "3) PLACE-ARTWORK.jsx = สคริปต์ช่วยสร้างเลเยอร์+วางลาย (ไม่จำเป็นต้องใช้)",
      "",
      "วิธีทำ (ใช้ได้ทุกเครื่อง แนะนำวิธีนี้)",
      `  1. เปิด ${aiName} ใน Illustrator`,
      "  2. สร้างเลเยอร์ใหม่ ตั้งชื่อว่า ลายลูกค้า แล้วลากลงล่างสุด",
      `  3. File > Place เลือก ${artName}  (หรือลากไฟล์จาก Finder เข้ามาวางเลย)`,
      "  4. ลากให้เต็มอาร์ตบอร์ดพอดี — ขนาดไฟล์ทำมาให้เท่ากรอบงานอยู่แล้ว",
      "",
      "ถ้าอยากให้เร็วขึ้น",
      `  เปิด ${aiName} แล้ว File > Scripts > Other Script... > เลือก PLACE-ARTWORK.jsx`,
      "  สคริปต์จะสร้างเลเยอร์และวางลายให้ (บาง Illustrator อาจไม่รองรับ ใช้วิธีมือแทนได้)",
      "",
      "หมายเหตุ: ยัดลายเข้าไฟล์ .ai ให้เลยไม่ได้ เพราะโครงเลเยอร์ของ Illustrator",
      "เก็บอยู่ในข้อมูลรูปแบบปิดของ Adobe ที่เขียนเพิ่มจากโปรแกรมอื่นไม่ได้",
      "ถ้ายัดเข้าไป เลเยอร์เดิมจะยุบเหลือ Layer 1 อันเดียว",
      "",
    ].join("\r\n");

    return makeZip([
      { name: aiName, data: tpl },
      { name: artName, data: art },
      { name: "PLACE-ARTWORK.jsx", data: jsx },
      { name: "READ-ME.txt", data: readme },
    ]);
  } catch {
    return null;
  }
}

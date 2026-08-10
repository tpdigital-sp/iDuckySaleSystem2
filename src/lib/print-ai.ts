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

/**
 * สร้างไฟล์ .ai หน้าเดียว ขนาดเท่างานจริง มีลายเต็มหน้าพอดี
 * โยน Error เมื่อโหลดภาพไม่ได้ — ผู้เรียกเอาไปแสดงข้อความให้ทีมงาน
 */
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

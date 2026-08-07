/**
 * เขียนไฟล์ .ai (Illustrator) สำหรับงานไดคัท — เป็น PDF ที่ Illustrator เปิด/แก้ได้ตรง ๆ
 * (ไฟล์ .ai ตั้งแต่ v9 เป็นต้นมาคือ PDF ที่มีข้อมูลเสริมของ AI · ไม่มีข้อมูลเสริมก็เปิดแก้ได้ปกติ)
 *
 * ในไฟล์มี 2 ชั้น: รูปลายจริง (ขนาดเป๊ะเป็นมิลลิเมตร) + เส้นไดคัทเป็นเวกเตอร์
 * เส้นไดคัทใช้สีพิเศษชื่อ "CutContour" (Separation/spot) ตามมาตรฐานเครื่องตัด/RIP
 * เปิดใน Illustrator จะเห็นเป็นสวอตช์ spot ชื่อ CutContour — ส่งเข้าเครื่องตัดได้เลย
 */

const PT_PER_MM = 72 / 25.4;

type Pt = { x: number; y: number };

export interface AiFileInput {
  /** พิกเซลของลาย (RGBA เรียงตามแถว) */
  rgba: Uint8ClampedArray;
  pxWidth: number;
  pxHeight: number;
  /** ขนาดจริงของลาย (มม.) */
  widthMm: number;
  heightMm: number;
  /** เส้นไดคัท (มม. · y นับจากขอบบนของลาย · ติดลบได้ถ้าล้นออกนอกลาย) */
  paths: Pt[][];
  hole?: { cx: number; cy: number; r: number };
  /** ขนาดกรอบไฟล์ + ตำแหน่งที่วางลายในกรอบ (จาก exportFrame) */
  pageWidthMm: number;
  pageHeightMm: number;
  artXMm: number;
  artYMm: number;
  /** ชื่องาน — เขียนลง metadata ให้รู้ว่าไฟล์มาจากออเดอร์ไหน */
  title?: string;
}

/** บีบอัดแบบ zlib (PDF /FlateDecode) — เบราว์เซอร์รุ่นใหม่มี CompressionStream ให้ใช้ */
async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; filter: boolean }> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return { data: bytes, filter: false }; // ไม่มีก็ฝังดิบ ๆ ไฟล์ใหญ่ขึ้นแต่เปิดได้เหมือนกัน
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CS("deflate"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data: out, filter: true };
}

const enc = new TextEncoder();

/** ต่อไฟล์ PDF ทีละก้อน พร้อมจำตำแหน่ง byte ของแต่ละ object (ต้องเป๊ะ ไม่งั้นไฟล์เปิดไม่ขึ้น) */
class PdfWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;
  readonly offsets: number[] = [];

  push(part: string | Uint8Array) {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    this.chunks.push(bytes);
    this.len += bytes.length;
  }

  /** เริ่ม object ลำดับ n (1-based) */
  startObj(n: number) {
    this.offsets[n] = this.len;
    this.push(`${n} 0 obj\n`);
  }

  endObj() {
    this.push("endobj\n");
  }

  get length() {
    return this.len;
  }

  blob(type: string) {
    return new Blob(this.chunks as unknown as BlobPart[], { type });
  }
}

/** เส้นไดคัทเป็นคำสั่งวาดของ PDF (หน่วย point · y นับขึ้นจากขอบล่าง) */
function pathOps(paths: Pt[][], hole: AiFileInput["hole"], artX: number, artY: number, pageHmm: number): string {
  const X = (mm: number) => ((mm + artX) * PT_PER_MM).toFixed(3);
  const Y = (mm: number) => ((pageHmm - (mm + artY)) * PT_PER_MM).toFixed(3);
  const out: string[] = [];
  for (const loop of paths) {
    if (loop.length < 3) continue;
    out.push(`${X(loop[0].x)} ${Y(loop[0].y)} m`);
    for (let i = 1; i < loop.length; i++) out.push(`${X(loop[i].x)} ${Y(loop[i].y)} l`);
    out.push("h");
  }
  if (hole) {
    // วงกลมด้วยเบซิเยร์ 4 ท่อน (ค่าคงที่ 0.5523 = วงกลมมาตรฐาน)
    const k = 0.5523 * hole.r;
    const { cx, cy, r } = hole;
    out.push(`${X(cx - r)} ${Y(cy)} m`);
    out.push(`${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`);
    out.push(`${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c`);
    out.push(`${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`);
    out.push(`${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c`);
    out.push("h");
  }
  return out.join("\n");
}

/** สร้างไฟล์ .ai (PDF-compatible) — คืน Blob เอาไปดาวน์โหลดได้เลย */
export async function buildAiFile(input: AiFileInput): Promise<Blob> {
  const pageW = input.pageWidthMm;
  const pageH = input.pageHeightMm;

  // แยก RGB กับ alpha (PDF เก็บความโปร่งใสเป็นภาพ SMask ต่างหาก)
  const n = input.pxWidth * input.pxHeight;
  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = input.rgba[i * 4];
    rgb[i * 3 + 1] = input.rgba[i * 4 + 1];
    rgb[i * 3 + 2] = input.rgba[i * 4 + 2];
    alpha[i] = input.rgba[i * 4 + 3];
  }
  const rgbZ = await deflate(rgb);
  const alphaZ = await deflate(alpha);

  // วางลายตามตำแหน่งที่คำนวณไว้ (y ของ PDF นับขึ้น จึงวัดจากขอบล่างของกรอบ)
  const artBottomMm = pageH - input.artYMm - input.heightMm;
  const content = [
    "q",
    `${(input.widthMm * PT_PER_MM).toFixed(3)} 0 0 ${(input.heightMm * PT_PER_MM).toFixed(3)} ${(input.artXMm * PT_PER_MM).toFixed(3)} ${(artBottomMm * PT_PER_MM).toFixed(3)} cm`,
    "/Im0 Do",
    "Q",
    "/CS0 CS",
    "1 SCN",
    "0.25 w",
    "1 J 1 j",
    pathOps(input.paths, input.hole, input.artXMm, input.artYMm, pageH),
    "S",
  ].join("\n");

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
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(pageW * PT_PER_MM).toFixed(3)} ${(pageH * PT_PER_MM).toFixed(3)}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> /ColorSpace << /CS0 7 0 R >> >> /Contents 4 0 R >>\n"
  );
  w.endObj();

  const contentBytes = enc.encode(content);
  w.startObj(4);
  w.push(`<< /Length ${contentBytes.length} >>\nstream\n`);
  w.push(contentBytes);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(5);
  w.push(
    `<< /Type /XObject /Subtype /Image /Width ${input.pxWidth} /Height ${input.pxHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 6 0 R ` +
      `${rgbZ.filter ? "/Filter /FlateDecode " : ""}/Length ${rgbZ.data.length} >>\nstream\n`
  );
  w.push(rgbZ.data);
  w.push("\nendstream\n");
  w.endObj();

  w.startObj(6);
  w.push(
    `<< /Type /XObject /Subtype /Image /Width ${input.pxWidth} /Height ${input.pxHeight} ` +
      `/ColorSpace /DeviceGray /BitsPerComponent 8 ` +
      `${alphaZ.filter ? "/Filter /FlateDecode " : ""}/Length ${alphaZ.data.length} >>\nstream\n`
  );
  w.push(alphaZ.data);
  w.push("\nendstream\n");
  w.endObj();

  // สีพิเศษ (spot) ชื่อ CutContour — แปลงเป็นสีชมพูบานเย็นตอนแสดงผล แต่ชื่อสีคือสิ่งที่เครื่องตัดอ่าน
  w.startObj(7);
  w.push("[/Separation /CutContour /DeviceCMYK 8 0 R]\n");
  w.endObj();

  w.startObj(8);
  w.push("<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>\n");
  w.endObj();

  w.startObj(9);
  const title = (input.title ?? "diecut").replace(/[()\\]/g, "");
  w.push(`<< /Title (${title}) /Creator (iDucky Prints Studio) /Producer (iDucky diecut) >>\n`);
  w.endObj();

  const xrefAt = w.length;
  const count = 10; // object 0 + 1..9
  w.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) {
    w.push(`${String(w.offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  w.push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return w.blob("application/postscript");
}

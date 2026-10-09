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
  /** เส้นไดคัทแบบโค้งเบซิเยร์ (มม. · y นับจากขอบบนของลาย · ติดลบได้ถ้าล้นออกนอกลาย) */
  curves: { start: Pt; segs: { c1: Pt; c2: Pt; to: Pt }[] }[];
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

/** แปลงพิกัด "ในลาย" (มม.) → "บนหน้า" (มม. · y ลง) — ใช้วางลายหลายชิ้น/หมุนได้ */
type MapFn = (q: Pt) => Pt;

/** เส้นไดคัทเป็นคำสั่งวาดของ PDF (หน่วย point · y นับขึ้นจากขอบล่าง) */
function pathOps(curves: AiFileInput["curves"], hole: AiFileInput["hole"], map: MapFn, pageHmm: number): string {
  const P = (x: number, y: number) => {
    const q = map({ x, y });
    return `${(q.x * PT_PER_MM).toFixed(3)} ${((pageHmm - q.y) * PT_PER_MM).toFixed(3)}`;
  };
  const out: string[] = [];
  for (const c of curves) {
    if (!c.segs.length) continue;
    out.push(`${P(c.start.x, c.start.y)} m`);
    for (const s of c.segs) out.push(`${P(s.c1.x, s.c1.y)} ${P(s.c2.x, s.c2.y)} ${P(s.to.x, s.to.y)} c`);
    out.push("h");
  }
  if (hole) {
    // วงกลมด้วยเบซิเยร์ 4 ท่อน (ค่าคงที่ 0.5523 = วงกลมมาตรฐาน) · หมุนแล้วก็ยังเป็นวงกลม
    const k = 0.5523 * hole.r;
    const { cx, cy, r } = hole;
    out.push(`${P(cx - r, cy)} m`);
    out.push(`${P(cx - r, cy - k)} ${P(cx - k, cy - r)} ${P(cx, cy - r)} c`);
    out.push(`${P(cx + k, cy - r)} ${P(cx + r, cy - k)} ${P(cx + r, cy)} c`);
    out.push(`${P(cx + r, cy + k)} ${P(cx + k, cy + r)} ${P(cx, cy + r)} c`);
    out.push(`${P(cx - k, cy + r)} ${P(cx - r, cy + k)} ${P(cx - r, cy)} c`);
    out.push("h");
  }
  return out.join("\n");
}

/** ลายหนึ่งแบบ (รูป + เส้นตัดในพิกัดของลาย) */
export interface SheetArt {
  rgba: Uint8ClampedArray;
  pxWidth: number;
  pxHeight: number;
  widthMm: number;
  heightMm: number;
  curves: AiFileInput["curves"];
  hole?: AiFileInput["hole"];
}

export interface SheetAiInput {
  pageWidthMm: number;
  pageHeightMm: number;
  arts: SheetArt[];
  /** วางลายลำดับ art ตามตัวแปลงพิกัด map (ลาย → หน้า) */
  placements: { art: number; map: MapFn }[];
  title?: string;
}

/** สร้างไฟล์ .ai ชิ้นเดียว (ลาย 1 ชิ้น + เส้นตัด) — คืน Blob เอาไปดาวน์โหลดได้เลย */
export function buildAiFile(input: AiFileInput): Promise<Blob> {
  return buildSheetAiFile({
    pageWidthMm: input.pageWidthMm,
    pageHeightMm: input.pageHeightMm,
    arts: [input],
    placements: [{ art: 0, map: (q) => ({ x: q.x + input.artXMm, y: q.y + input.artYMm }) }],
    title: input.title,
  });
}

/**
 * สร้างไฟล์ .ai ทั้งแผ่น (หลายลาย หลายชิ้น หมุนได้) — รูปของแต่ละลายฝังครั้งเดียวแล้วอ้างซ้ำ
 * ไฟล์จึงไม่บวมตามจำนวนชิ้น · เส้นตัดทุกชิ้นอยู่ในสี spot CutContour ชุดเดียว
 */
export async function buildSheetAiFile(input: SheetAiInput): Promise<Blob> {
  const pageW = input.pageWidthMm;
  const pageH = input.pageHeightMm;
  const F = (v: number) => v.toFixed(3);

  // วัตถุ: 1 catalog · 2 pages · 3 page · 4 content · 5 สี spot · 6 ฟังก์ชันสี · 7 info · 8.. รูป (RGB+SMask คู่ละ 2)
  const imgObj = (i: number) => 8 + i * 2;
  // เลเยอร์ (PDF Optional Content) ต่อท้ายรูป: Art = ลาย · CutContour = เส้นตัด — Illustrator/VectorCraft เปิดเป็นเลเยอร์แยก
  const ocgArt = imgObj(input.arts.length);
  const ocgCut = ocgArt + 1;

  // รูปลาย: วางมุมหน่วยของรูป (0,0)=ซ้ายล่าง (1,0)=ขวาล่าง (0,1)=ซ้ายบน ผ่านตัวแปลงพิกัด → เมทริกซ์ cm
  const draws: string[] = [];
  for (const p of input.placements) {
    const a = input.arts[p.art];
    const toPt = (q: Pt) => {
      const m = p.map(q);
      return { x: m.x * PT_PER_MM, y: (pageH - m.y) * PT_PER_MM };
    };
    const o = toPt({ x: 0, y: a.heightMm });
    const ex = toPt({ x: a.widthMm, y: a.heightMm });
    const ey = toPt({ x: 0, y: 0 });
    draws.push("q", `${F(ex.x - o.x)} ${F(ex.y - o.y)} ${F(ey.x - o.x)} ${F(ey.y - o.y)} ${F(o.x)} ${F(o.y)} cm`, `/Im${p.art} Do`, "Q");
  }
  // เส้นตัดลากทีละชิ้น (S ต่อชิ้น) = เปิดแล้วคลิกเลือก/แก้ทีละชิ้นได้ · รูหูร้อยอยู่ในชิ้นเดียวกับขอบนอก
  const cuts = input.placements.map((p) => `${pathOps(input.arts[p.art].curves, input.arts[p.art].hole, p.map, pageH)}\nS`);
  const content = [
    "/OC /OCArt BDC",
    ...draws,
    "EMC",
    "/OC /OCCut BDC",
    "/CS0 CS",
    "1 SCN",
    "0.25 w",
    "1 J 1 j",
    ...cuts,
    "EMC",
  ].join("\n");

  const w = new PdfWriter();
  w.push("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n");

  w.startObj(1);
  // ลำดับใน /Order = บนลงล่างในแผง Layers (เส้นตัดอยู่บนลาย)
  w.push(
    `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [${ocgArt} 0 R ${ocgCut} 0 R] ` +
      `/D << /Order [${ocgCut} 0 R ${ocgArt} 0 R] /ON [${ocgArt} 0 R ${ocgCut} 0 R] >> >> >>\n`
  );
  w.endObj();

  w.startObj(2);
  w.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  w.endObj();

  const xobjs = input.arts.map((_, i) => `/Im${i} ${imgObj(i)} 0 R`).join(" ");
  w.startObj(3);
  w.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${F(pageW * PT_PER_MM)} ${F(pageH * PT_PER_MM)}] ` +
      `/Resources << /XObject << ${xobjs} >> /ColorSpace << /CS0 5 0 R >> /Properties << /OCArt ${ocgArt} 0 R /OCCut ${ocgCut} 0 R >> >> /Contents 4 0 R >>\n`
  );
  w.endObj();

  const contentBytes = enc.encode(content);
  w.startObj(4);
  w.push(`<< /Length ${contentBytes.length} >>\nstream\n`);
  w.push(contentBytes);
  w.push("\nendstream\n");
  w.endObj();

  // สีพิเศษ (spot) ชื่อ CutContour — แปลงเป็นสีชมพูบานเย็นตอนแสดงผล แต่ชื่อสีคือสิ่งที่เครื่องตัดอ่าน
  w.startObj(5);
  w.push("[/Separation /CutContour /DeviceCMYK 6 0 R]\n");
  w.endObj();

  w.startObj(6);
  w.push("<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>\n");
  w.endObj();

  w.startObj(7);
  const title = (input.title ?? "diecut").replace(/[()\\]/g, "");
  w.push(`<< /Title (${title}) /Creator (iDucky Prints Studio) /Producer (iDucky diecut) >>\n`);
  w.endObj();

  // แยก RGB กับ alpha (PDF เก็บความโปร่งใสเป็นภาพ SMask ต่างหาก)
  for (let i = 0; i < input.arts.length; i++) {
    const a = input.arts[i];
    const n = a.pxWidth * a.pxHeight;
    const rgb = new Uint8Array(n * 3);
    const alpha = new Uint8Array(n);
    for (let j = 0; j < n; j++) {
      rgb[j * 3] = a.rgba[j * 4];
      rgb[j * 3 + 1] = a.rgba[j * 4 + 1];
      rgb[j * 3 + 2] = a.rgba[j * 4 + 2];
      alpha[j] = a.rgba[j * 4 + 3];
    }
    const rgbZ = await deflate(rgb);
    const alphaZ = await deflate(alpha);

    w.startObj(imgObj(i));
    w.push(
      `<< /Type /XObject /Subtype /Image /Width ${a.pxWidth} /Height ${a.pxHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${imgObj(i) + 1} 0 R ` +
        `${rgbZ.filter ? "/Filter /FlateDecode " : ""}/Length ${rgbZ.data.length} >>\nstream\n`
    );
    w.push(rgbZ.data);
    w.push("\nendstream\n");
    w.endObj();

    w.startObj(imgObj(i) + 1);
    w.push(
      `<< /Type /XObject /Subtype /Image /Width ${a.pxWidth} /Height ${a.pxHeight} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 ` +
        `${alphaZ.filter ? "/Filter /FlateDecode " : ""}/Length ${alphaZ.data.length} >>\nstream\n`
    );
    w.push(alphaZ.data);
    w.push("\nendstream\n");
    w.endObj();
  }

  w.startObj(ocgArt);
  w.push("<< /Type /OCG /Name (Art) >>\n");
  w.endObj();
  w.startObj(ocgCut);
  w.push("<< /Type /OCG /Name (CutContour) >>\n");
  w.endObj();

  const xrefAt = w.length;
  const count = ocgCut + 1; // object 0 + 1..สุดท้าย
  w.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) {
    w.push(`${String(w.offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  w.push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return w.blob("application/postscript");
}

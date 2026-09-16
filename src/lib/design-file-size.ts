/**
 * 📏 อ่าน "ขนาดชิ้นงาน" จากไฟล์งานกราฟฟิกโดยไม่ต้องเปิดโปรแกรม — .ai / .pdf / .psd / .psb / .eps / รูป
 *
 * ทำงานได้ทั้งในเบราว์เซอร์ (หน้า /admin/file-size ลากไฟล์ทีเดียวหลายไฟล์) และใน Node (สคริปต์ทดสอบ)
 * ตัวอ่านรับ ByteSource — อ่านเฉพาะช่วงที่ต้องใช้ (.psd อ่านแค่หัวไฟล์ไม่กี่ร้อย KB แม้ไฟล์จะหลายร้อย MB)
 *
 * ขนาด 2 ชั้นต่อไฟล์:
 *  - "ผืน/อาร์ตบอร์ด" (widthMm/heightMm) = กรอบไฟล์ · อ่านได้จากหัวไฟล์เสมอ
 *  - "ชิ้นงาน" (board.object) = กรอบส่วนที่ไม่โปร่งใสจริง ๆ — ตรงกับ W/H ในแผง Transform ของ Illustrator
 *    (เจ้าของร้านทัก 16 ก.ย. 69: PNG ผืน 10×10 แต่ตัวงาน 9.81×9.92) · มีเมื่อไฟล์มีความโปร่งใสและงานไม่เต็มผืน
 *
 * สิ่งที่แต่ละชนิดบอกได้:
 *  - .ai/.pdf  → ทุกอาร์ตบอร์ด (1 หน้า PDF = 1 อาร์ตบอร์ด) เป็นมิลลิเมตรตรง ๆ · มี TrimBox = ขนาดไม่รวม bleed
 *                ชิ้นงาน: เรนเดอร์หน้าบนพื้นโปร่ง (เบราว์เซอร์เท่านั้น · ไม่เกิน 8 อาร์ตบอร์ด)
 *                ⚠️ .ai ที่ปิด "Create PDF Compatible File" ข้างในเป็นหน้าเปล่า 1 หน้าพร้อมข้อความเตือน → อ่านไม่ได้
 *                ⚠️ .ai รุ่น Illustrator 8 ลงไปเป็น PostScript ล้วน → อ่าน %%BoundingBox แบบ .eps แทน
 *  - .psd/.psb → กว้าง×สูงเป็นพิกเซล + DPI จาก ResolutionInfo (id 1005) → มม. · รูปย่อจาก resource 1036
 *                ไม่มี 1036 (เช่น CMYK จากบางรุ่น) → ถอดภาพรวมท้ายไฟล์เองใน เบราว์เซอร์ (RGB/CMYK/Gray 8 บิต raw/RLE)
 *                ชิ้นงาน: จากช่องความโปร่งใสของภาพรวม (RGB ช่องที่ 4 · CMYK ช่องที่ 5 · ต้องเซฟแบบ Maximize Compatibility)
 *                ขนาดมม. ถูกก็ต่อเมื่อ DPI ในไฟล์ถูก (ลูกค้าตั้ง 72 DPI แต่บอกว่า 5 ซม. = ไฟล์บอกผิดเอง)
 *  - .eps      → %%HiResBoundingBox / %%BoundingBox (point) → มม.
 *  - png/webp  → พิกเซล + DPI (PNG pHYs) + ชิ้นงานจากอัลฟา (เบราว์เซอร์) · jpg ไม่มีอัลฟา = ชิ้นงานเต็มผืน
 */

export type DesignKind = "ai" | "pdf" | "psd" | "psb" | "eps" | "png" | "jpg" | "webp" | "other";

export interface Board {
  /** เช่น "อาร์ตบอร์ด 1" · ชื่อจาก PageLabels ถ้ามี */
  label: string;
  widthMm: number;
  heightMm: number;
  /** ขนาดตัดจริงเมื่อไฟล์ตั้ง bleed ไว้ (TrimBox) — ต่างจาก widthMm/heightMm ที่รวม bleed */
  trim?: { widthMm: number; heightMm: number };
  /** ตัวชิ้นงาน = กรอบส่วนที่ไม่โปร่งใส (มีเมื่อเล็กกว่าผืน) — ตรงกับ W/H ใน Transform ของ Illustrator */
  object?: { widthMm: number; heightMm: number };
  /** ภาพของอาร์ตบอร์ดนี้ (PNG พื้นโปร่ง · ด้านยาว ≤ RENDER_EDGE px) — .ai/.pdf ในเบราว์เซอร์เท่านั้น · ไว้โชว์/ดาวน์โหลด */
  image?: Blob;
}

export interface DesignInfo {
  kind: DesignKind;
  /** อ่านขนาดจริง (มม.) ได้อย่างน้อย 1 ชิ้น */
  ok: boolean;
  boards: Board[];
  /** ขนาดพิกเซล (psd/รูป) */
  px?: { w: number; h: number };
  /** DPI ที่ไฟล์ระบุ · null = ไฟล์ไม่ได้บอก */
  dpi?: number | null;
  /** เหตุที่อ่านไม่ได้ หรือข้อควรระวัง — ภาษาคน บอกว่าต้องทำอะไรต่อ */
  note?: string;
  /** รูปตัวอย่าง (PNG/JPEG) ถ้าดึงได้ */
  preview?: Blob;
}

/** แหล่งไบต์ — อ่านเป็นช่วง จะได้ไม่ต้องโหลดไฟล์ใหญ่ทั้งก้อนเข้าหน่วยความจำ */
export interface ByteSource {
  size: number;
  bytes(start: number, end: number): Promise<Uint8Array>;
}

export const fromFile = (file: File): ByteSource => ({
  size: file.size,
  bytes: async (s, e) => new Uint8Array(await file.slice(s, e).arrayBuffer()),
});

export const fromBuffer = (buf: Uint8Array): ByteSource => ({
  size: buf.byteLength,
  bytes: async (s, e) => buf.subarray(s, Math.min(e, buf.byteLength)),
});

const MM_PER_PT = 25.4 / 72;
const r1 = (n: number) => Math.round(n * 10) / 10;
const ptToMm = (pt: number) => r1(pt * MM_PER_PT);
const pxToMm = (px: number, dpi: number) => r1((px / dpi) * 25.4);

/** อัลฟาตั้งแต่นี้ถือว่า "มีเนื้องาน" — กึ่งกลางของขอบ anti-alias ให้ตรงขอบเวกเตอร์ที่สุด (เท่ากับหน้าไดคัท) */
const ALPHA_THR = 128;
/** ด้านยาวสุดที่เรนเดอร์อาร์ตบอร์ด .ai (px) — ใช้ทั้งหาขอบชิ้นงาน (±0.1 มม.) และเป็นภาพให้ดาวน์โหลด (A6 ≈ 580 DPI · A3 ≈ 145 DPI) */
const RENDER_EDGE = 2400;
/** พิกเซลสูงสุดที่ยอมสแกนอัลฟา (กัน .psd ยักษ์กินหน่วยความจำ) */
const MAX_ALPHA_PX = 40_000_000;
/** .ai หลายอาร์ตบอร์ดเกินนี้ เรนเดอร์แค่หน้าแรก (หน้าละ ~1 วิ · ปฏิทิน 28 หน้ายังไหว) */
const MAX_RENDER_PAGES = 40;

export function kindOf(fileName: string): DesignKind {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (ext === "ai" || ext === "pdf" || ext === "psd" || ext === "psb" || ext === "eps" || ext === "png" || ext === "webp") return ext;
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return "other";
}

export const SUPPORTED_EXT = ["ai", "pdf", "psd", "psb", "eps", "png", "jpg", "jpeg", "webp"];

/**
 * สืบชนิดจากหัวไฟล์ — ไฟล์ที่ลากจาก Google Drive (.tmp.driveupload/2056829) หรือส่งผ่านแชทมักหลุดนามสกุล
 * PDF ที่มี XMP ของ Illustrator ถือเป็น .ai (ต่างกันแค่ชื่อ · เนื้อในเปิดด้วย pdf.js เหมือนกัน)
 */
export function sniffKind(head: Uint8Array): DesignKind {
  const t = latin1(head.subarray(0, Math.min(head.length, 4096)));
  if (t.startsWith("%PDF")) return /illustrator|AIPrivateData|Adobe Illustrator/i.test(t) ? "ai" : "pdf";
  if (t.startsWith("8BPS")) return head[5] === 2 ? "psb" : "psd";
  if (t.startsWith("%!PS") || (head[0] === 0xc5 && head[1] === 0xd0 && head[2] === 0xd3 && head[3] === 0xc6)) return "eps";
  if (head[0] === 0x89 && t.slice(1, 4) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8) return "jpg";
  if (t.startsWith("RIFF") && t.slice(8, 12) === "WEBP") return "webp";
  return "other";
}

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192)));
  return s;
};

/* ── กรอบส่วนที่ไม่โปร่งใส ─────────────────────────────────────── */

/**
 * หา bbox ของพิกเซลที่อัลฟา ≥ ALPHA_THR · data เรียงทีละพิกเซล stride ไบต์ อัลฟาอยู่ที่ offset
 * คืน null ถ้าโปร่งใสทั้งภาพ
 */
export function alphaBBox(data: Uint8Array | Uint8ClampedArray, w: number, h: number, stride: number, offset: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * stride + offset] >= ALPHA_THR) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** เต็มผืนแล้ว = ไม่ต้องแยกโชว์ (ต่างจากผืนไม่ถึง 1 px ต่อด้าน) */
const boxIsFull = (b: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) => b.x0 <= 0 && b.y0 <= 0 && b.x1 >= w - 1 && b.y1 >= h - 1;

/**
 * กรอบชิ้นงานของรูปที่เบราว์เซอร์เปิดได้ (PNG/WEBP) — ย่อลงก่อนสแกนถ้าใหญ่ แล้วคูณกลับเป็นพิกเซลจริง
 * คืน { w, h } เป็นพิกเซลของไฟล์ · null = ไม่มีอัลฟา/โปร่งทั้งภาพ/เต็มผืน/ไม่ใช่เบราว์เซอร์
 */
async function objectPxFromBlob(blob: Blob): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const box = alphaBBox(ctx.getImageData(0, 0, w, h).data, w, h, 4, 3);
    if (!box || boxIsFull(box, w, h)) return null;
    return { w: Math.round((box.x1 - box.x0) / scale), h: Math.round((box.y1 - box.y0) / scale) };
  } catch {
    return null;
  } finally {
    bmp?.close();
  }
}

/* ── PostScript / EPS ─────────────────────────────────────────── */

async function parseEps(src: ByteSource): Promise<DesignInfo> {
  const head = await src.bytes(0, 32);
  let start = 0;
  let end = Math.min(src.size, 512 * 1024);
  // DOS EPS binary header (C5 D0 D3 C6): บอกตำแหน่งส่วน PostScript
  if (head[0] === 0xc5 && head[1] === 0xd0 && head[2] === 0xd3 && head[3] === 0xc6) {
    const dv = new DataView(head.buffer, head.byteOffset);
    start = dv.getUint32(4, true);
    end = Math.min(src.size, start + Math.min(dv.getUint32(8, true), 512 * 1024));
  }
  const text = latin1(await src.bytes(start, end));
  const box = /%%HiResBoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(text) ?? /%%BoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(text);
  if (!box) {
    return { kind: "eps", ok: false, boards: [], note: "ไม่พบบรรทัด %%BoundingBox ในไฟล์ — เปิดใน Illustrator แล้วเซฟใหม่ หรือกรอกขนาดเอง" };
  }
  const w = Math.abs(Number(box[3]) - Number(box[1]));
  const h = Math.abs(Number(box[4]) - Number(box[2]));
  if (!(w > 0 && h > 0)) return { kind: "eps", ok: false, boards: [], note: "กรอบ BoundingBox เป็นศูนย์ — ไฟล์เปล่าหรือเสีย" };
  return { kind: "eps", ok: true, boards: [{ label: "กรอบงาน", widthMm: ptToMm(w), heightMm: ptToMm(h) }] };
}

/* ── Photoshop .psd / .psb ────────────────────────────────────── */

/** ถอด PackBits 1 แถว ลง out ตั้งแต่ outOff · คืนจำนวนไบต์ที่เขียน */
function unpackBits(src: Uint8Array, out: Uint8Array, outOff: number, outLen: number): number {
  let i = 0;
  let o = outOff;
  const end = outOff + outLen;
  while (i < src.length && o < end) {
    const n = src[i++];
    if (n < 128) {
      const len = Math.min(n + 1, end - o, src.length - i);
      out.set(src.subarray(i, i + len), o);
      i += len;
      o += len;
    } else if (n > 128) {
      const len = Math.min(257 - n, end - o);
      out.fill(src[i++], o, o + len);
      o += len;
    }
    // 128 = no-op
  }
  return o - outOff;
}

/**
 * อ่าน 1 ระนาบสี (channel) ของภาพรวม (merged image data ท้ายไฟล์) — 8 บิต
 * อ่านเป็นช่วง: raw = อ่านเฉพาะระนาบนั้น · RLE = อ่านตารางความยาวแถวแล้วอ่านเฉพาะแถวของระนาบนั้น
 */
async function psdChannel(src: ByteSource, imageOff: number, w: number, h: number, channels: number, psb: boolean, ch: number): Promise<Uint8Array | null> {
  if (imageOff + 2 > src.size || ch >= channels) return null;
  const compBytes = await src.bytes(imageOff, imageOff + 2);
  const comp = new DataView(compBytes.buffer, compBytes.byteOffset).getUint16(0);
  const plane = w * h;
  if (comp === 0) {
    const start = imageOff + 2 + ch * plane;
    if (start + plane > src.size) return null;
    return new Uint8Array(await src.bytes(start, start + plane));
  }
  if (comp !== 1) return null; // ZIP (2/3) ไม่รองรับ
  const entry = psb ? 4 : 2;
  const tableLen = h * channels * entry;
  const table = await src.bytes(imageOff + 2, imageOff + 2 + tableLen);
  if (table.length < tableLen) return null;
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = (i: number) => (psb ? tv.getUint32(i * 4) : tv.getUint16(i * 2));
  let skip = 0;
  for (let i = 0; i < ch * h; i++) skip += count(i);
  let len = 0;
  const rowLens: number[] = [];
  for (let i = ch * h; i < (ch + 1) * h; i++) {
    const c = count(i);
    rowLens.push(c);
    len += c;
  }
  const dataStart = imageOff + 2 + tableLen + skip;
  if (dataStart + len > src.size) return null;
  const packed = await src.bytes(dataStart, dataStart + len);
  const out = new Uint8Array(plane);
  let p = 0;
  for (let y = 0; y < h; y++) {
    unpackBits(packed.subarray(p, p + rowLens[y]), out, y * w, w);
    p += rowLens[y];
  }
  return out;
}

/** ตำแหน่งช่องความโปร่งใสในภาพรวมตามโหมดสี (null = โหมดที่ไม่รู้จัก) · ⚠️ CMYK ช่องที่ 4 คือหมึกดำ ไม่ใช่อัลฟา */
function psdAlphaIndex(mode: number): number | null {
  return mode === 3 ? 3 : mode === 4 ? 4 : mode === 1 ? 1 : null;
}

/** พิกเซลสูงสุดที่ยอมถอดภาพรวมเป็นรูปตัวอย่างในเบราว์เซอร์ (RGBA เต็ม = 4 ไบต์/px) */
const MAX_PREVIEW_PX = 16_000_000;
const PSD_PREVIEW_EDGE = 640;

/**
 * รูปตัวอย่างจากภาพรวมของ .psd ที่ไม่มี resource 1036 (Photoshop บางรุ่น/บางค่าเซฟไม่ฝังรูปย่อ) — เบราว์เซอร์เท่านั้น
 * RGB ตรง ๆ · CMYK เก็บกลับด้าน (255 = ไม่มีหมึก) → R = C·K/255 · Grayscale ใช้ช่องเดียว
 */
async function psdComposite(read: (ch: number) => Promise<Uint8Array | null>, w: number, h: number, mode: number, channels: number): Promise<Blob | undefined> {
  if (typeof OffscreenCanvas === "undefined" || w * h > MAX_PREVIEW_PX) return undefined;
  const alphaIdx = psdAlphaIndex(mode);
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (mode === 3 || mode === 1) {
    const chs = mode === 3 ? [await read(0), await read(1), await read(2)] : [await read(0)];
    if (chs.some((c) => !c)) return undefined;
    const [r, g, b] = mode === 3 ? (chs as Uint8Array[]) : [chs[0]!, chs[0]!, chs[0]!];
    for (let i = 0, o = 0; i < w * h; i++, o += 4) {
      rgba[o] = r[i];
      rgba[o + 1] = g[i];
      rgba[o + 2] = b[i];
      rgba[o + 3] = 255;
    }
  } else if (mode === 4) {
    const [c, m, y, k] = [await read(0), await read(1), await read(2), await read(3)];
    if (!c || !m || !y || !k) return undefined;
    for (let i = 0, o = 0; i < w * h; i++, o += 4) {
      rgba[o] = (c[i] * k[i]) / 255;
      rgba[o + 1] = (m[i] * k[i]) / 255;
      rgba[o + 2] = (y[i] * k[i]) / 255;
      rgba[o + 3] = 255;
    }
  } else return undefined;
  if (alphaIdx !== null && channels > alphaIdx) {
    const a = await read(alphaIdx);
    if (a) for (let i = 0, o = 3; i < w * h; i++, o += 4) rgba[o] = a[i];
  }
  const full = new OffscreenCanvas(w, h);
  const fctx = full.getContext("2d");
  if (!fctx) return undefined;
  fctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  const sc = Math.min(1, PSD_PREVIEW_EDGE / Math.max(w, h));
  const pw = Math.max(1, Math.round(w * sc));
  const ph = Math.max(1, Math.round(h * sc));
  const small = new OffscreenCanvas(pw, ph);
  const sctx = small.getContext("2d");
  if (!sctx) return undefined;
  sctx.drawImage(full, 0, 0, pw, ph);
  return await small.convertToBlob({ type: "image/png" });
}

async function parsePsd(src: ByteSource): Promise<DesignInfo> {
  const head = await src.bytes(0, 34);
  const dv = new DataView(head.buffer, head.byteOffset);
  if (latin1(head.subarray(0, 4)) !== "8BPS") return { kind: "psd", ok: false, boards: [], note: "ไม่ใช่ไฟล์ Photoshop (หัวไฟล์ไม่ใช่ 8BPS) — ไฟล์เสียหรือเปลี่ยนนามสกุลมา" };
  const version = dv.getUint16(4);
  const psb = version === 2;
  const kind: DesignKind = psb ? "psb" : "psd";
  const channels = dv.getUint16(12);
  const h = dv.getUint32(14);
  const w = dv.getUint32(18);
  const depth = dv.getUint16(22);
  const mode = dv.getUint16(24);
  const colorModeLen = dv.getUint32(26);
  const resOff = 30 + colorModeLen;
  const lenBytes = await src.bytes(resOff, resOff + 4);
  const resLen = new DataView(lenBytes.buffer, lenBytes.byteOffset).getUint32(0);
  // บล็อก image resources ปกติไม่กี่ร้อย KB (ยกเว้น path/ICC ใหญ่) — เผื่อไว้ 32MB กันไฟล์ประหลาด
  const res = await src.bytes(resOff + 4, resOff + 4 + Math.min(resLen, 32 * 1024 * 1024));
  const rv = new DataView(res.buffer, res.byteOffset, res.byteLength);

  let dpi: number | null = null;
  let preview: Blob | undefined;
  let p = 0;
  while (p + 12 <= res.length) {
    const sig = latin1(res.subarray(p, p + 4));
    if (sig !== "8BIM" && sig !== "MeSa" && sig !== "PHUT" && sig !== "AgHg" && sig !== "DCSR") break;
    const id = rv.getUint16(p + 4);
    const nameLen = res[p + 6];
    let q = p + 6 + 1 + nameLen;
    if ((1 + nameLen) % 2 === 1) q += 1; // pascal string เติมให้ครบคู่
    const size = rv.getUint32(q);
    const dataStart = q + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > res.length) break;
    if (id === 1005 && size >= 16) {
      // ResolutionInfo: hRes fixed 16.16 (พิกเซลต่อนิ้วเสมอ แม้หน่วยแสดงผลจะเป็น px/cm)
      dpi = Math.round((rv.getUint32(dataStart) / 65536) * 100) / 100;
    } else if (id === 1036 && size > 28 && typeof Blob !== "undefined") {
      // Thumbnail resource: format(4) w(4) h(4) widthbytes(4) total(4) compressed(4) bpp(2) planes(2) แล้วตามด้วย JPEG
      if (rv.getUint32(dataStart) === 1) preview = new Blob([res.slice(dataStart + 28, dataEnd)], { type: "image/jpeg" });
    }
    p = dataEnd + (size % 2);
  }

  const info: DesignInfo = { kind, ok: false, boards: [], px: { w, h }, dpi, preview };
  if (!(dpi && dpi > 0)) {
    info.note = "ไฟล์ไม่ได้ระบุ DPI — รู้แค่พิกเซล ขนาดจริงต้องถามลูกค้า";
    return info;
  }
  info.ok = true;
  const board: Board = { label: "ผืนงาน", widthMm: pxToMm(w, dpi), heightMm: pxToMm(h, dpi) };
  info.boards = [board];

  // ภาพรวมท้ายไฟล์ (merged image · 8 บิต): ใช้หาชิ้นงานจากช่องความโปร่งใส และเป็นรูปตัวอย่างเมื่อไฟล์ไม่ได้ฝังรูปย่อ
  if (depth === 8 && w * h <= MAX_ALPHA_PX) {
    try {
      const layerLenOff = resOff + 4 + resLen;
      const ll = await src.bytes(layerLenOff, layerLenOff + (psb ? 8 : 4));
      const lv = new DataView(ll.buffer, ll.byteOffset, ll.byteLength);
      const layerLen = psb ? Number(lv.getBigUint64(0)) : lv.getUint32(0);
      const imageOff = layerLenOff + (psb ? 8 : 4) + layerLen;
      const cache = new Map<number, Uint8Array | null>();
      const read = async (ch: number) => {
        if (!cache.has(ch)) cache.set(ch, await psdChannel(src, imageOff, w, h, channels, psb, ch));
        return cache.get(ch) ?? null;
      };
      const alphaIdx = psdAlphaIndex(mode);
      // ชิ้นงาน: มีช่องความโปร่งใส (RGB 4 ช่อง · CMYK 5 ช่อง · Gray 2 ช่อง) — ไม่มี = มี background = เต็มผืน
      if (alphaIdx !== null && channels > alphaIdx) {
        const alpha = await read(alphaIdx);
        if (alpha) {
          const box = alphaBBox(alpha, w, h, 1, 0);
          if (box && !boxIsFull(box, w, h)) board.object = { widthMm: pxToMm(box.x1 - box.x0, dpi), heightMm: pxToMm(box.y1 - box.y0, dpi) };
          else if (!box) info.note = "ภาพรวมในไฟล์โปร่งใสทั้งผืน — เซฟแบบ Maximize Compatibility แล้วลองใหม่";
        }
      }
      if (!info.preview) info.preview = await psdComposite(read, w, h, mode, channels);
    } catch {
      /* อ่านชิ้นงาน/รูปไม่ได้ก็ยังมีขนาดผืน */
    }
  }
  if (dpi < 150) info.note = `ไฟล์ตั้งไว้แค่ ${dpi} DPI — ขนาดมม. ที่ได้อาจไม่ใช่ขนาดที่ลูกค้าตั้งใจ ถามลูกค้ายืนยันก่อน`;
  return info;
}

/* ── PNG / JPEG / WEBP ─────────────────────────────────────────── */

async function parseImage(src: ByteSource, kind: DesignKind): Promise<DesignInfo> {
  const head = await src.bytes(0, Math.min(src.size, 256 * 1024));
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let w = 0;
  let h = 0;
  let dpi: number | null = null;
  if (kind === "png" && latin1(head.subarray(1, 4)) === "PNG") {
    w = dv.getUint32(16);
    h = dv.getUint32(20);
    // เดิน chunk หา pHYs (pixels per metre)
    let p = 8;
    while (p + 12 <= head.length) {
      const len = dv.getUint32(p);
      const type = latin1(head.subarray(p + 4, p + 8));
      if (type === "pHYs" && head[p + 16] === 1) dpi = Math.round((dv.getUint32(p + 8) * 0.0254) * 100) / 100;
      if (type === "IDAT" || type === "IEND") break;
      p += 12 + len;
    }
  } else if (kind === "jpg" && head[0] === 0xff && head[1] === 0xd8) {
    let p = 2;
    while (p + 4 <= head.length && head[p] === 0xff) {
      const marker = head[p + 1];
      const len = dv.getUint16(p + 2);
      if (marker === 0xe0 && latin1(head.subarray(p + 4, p + 9)) === "JFIF\0") {
        const units = head[p + 11];
        const x = dv.getUint16(p + 12);
        if (units === 1 && x > 1) dpi = x;
        else if (units === 2 && x > 1) dpi = Math.round(x * 2.54 * 100) / 100;
      } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = dv.getUint16(p + 5);
        w = dv.getUint16(p + 7);
        break;
      }
      p += 2 + len;
    }
  }
  // ตัวไฟล์เองใช้เป็นรูปตัวอย่างได้เลย (เบราว์เซอร์แสดง PNG/JPG/WEBP ได้ตรง ๆ) — Node ไม่มี Blob ก็ข้าม
  const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
  const blob = typeof Blob !== "undefined" ? new Blob([new Uint8Array(await src.bytes(0, src.size))], { type: MIME[kind] }) : null;
  if (!(w > 0 && h > 0) && blob && typeof createImageBitmap !== "undefined") {
    try {
      const bmp = await createImageBitmap(blob);
      w = bmp.width;
      h = bmp.height;
      bmp.close();
    } catch {
      /* ไม่ใช่รูปที่เบราว์เซอร์อ่านได้ */
    }
  }
  if (!(w > 0 && h > 0)) return { kind, ok: false, boards: [], note: "เปิดรูปไม่ได้ — ไฟล์เสียหรือไม่ใช่รูปจริง" };
  const info: DesignInfo = { kind, ok: false, boards: [], px: { w, h }, dpi, preview: blob ?? undefined };
  if (!(dpi && dpi > 0)) {
    info.note = "รูปไม่ได้ระบุ DPI — รู้แค่พิกเซล ขนาดจริงขึ้นกับตอนวางงาน";
    return info;
  }
  info.ok = true;
  const board: Board = { label: "ผืนรูป", widthMm: pxToMm(w, dpi), heightMm: pxToMm(h, dpi) };
  info.boards = [board];
  // ชิ้นงาน: PNG/WEBP มีอัลฟาได้ · JPG ไม่มี = เต็มผืนเสมอ
  if (kind !== "jpg" && blob) {
    const obj = await objectPxFromBlob(blob);
    if (obj) board.object = { widthMm: pxToMm(obj.w, dpi), heightMm: pxToMm(obj.h, dpi) };
  }
  if (dpi < 150) info.note = `รูปตั้งไว้แค่ ${dpi} DPI — ขนาดมม. อาจไม่ใช่ที่ลูกค้าตั้งใจ`;
  return info;
}

/* ── .ai / .pdf (pdf.js) ───────────────────────────────────────── */

const RENDER_TIMEOUT_MS = 20_000;

type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: { str?: string }[] }>;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; background?: string }): { promise: Promise<void>; cancel(): void; onContinue?: (c: () => void) => void };
};
// โครงสร้างของ pdf.js เท่าที่ใช้ — ไม่ผูก type ของแพ็กเกจตรง ๆ เพราะ build เบราว์เซอร์/legacy (Node) ต่างกัน
type PdfjsLike = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(p: { data: Uint8Array; disableFontFace?: boolean; isEvalSupported?: boolean; verbosity?: number }): {
    promise: Promise<{
      numPages: number;
      getPageLabels(): Promise<string[] | null>;
      getPage(n: number): Promise<PdfPage>;
      destroy(): Promise<void>;
    }>;
  };
};

let pdfjsOverride: PdfjsLike | null = null;
/** ให้สคริปต์ Node ส่ง build legacy ของ pdf.js เข้ามาแทน (ในเบราว์เซอร์ไม่ต้องเรียก) */
export function setPdfjs(mod: unknown) {
  pdfjsOverride = mod as PdfjsLike;
}
async function loadPdfjs(): Promise<PdfjsLike> {
  if (pdfjsOverride) return pdfjsOverride;
  const mod = (await import("pdfjs-dist")) as unknown as PdfjsLike;
  // worker เสิร์ฟจาก /public (scripts/copy-pdf-worker.mjs ก๊อปให้ตอน build) — เหมือน ai-thumbnail.ts
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return mod;
}

/** หา /TrimBox ทุกหน้าจากไบต์ดิบ — Illustrator เขียนไว้เมื่อตั้ง bleed · null = ไฟล์ใหญ่เกินสแกน */
function scanTrimBoxes(raw: Uint8Array): { w: number; h: number }[] | null {
  if (raw.byteLength > 80 * 1024 * 1024) return null; // ไฟล์ใหญ่มาก ไม่คุ้มถอดเป็นสตริง
  const text = latin1(raw);
  const out: { w: number; h: number }[] = [];
  const re = /\/TrimBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ w: Math.abs(+m[3] - +m[1]), h: Math.abs(+m[4] - +m[2]) });
  return out;
}

async function parsePdfLike(src: ByteSource, kind: "ai" | "pdf"): Promise<DesignInfo> {
  const raw = await src.bytes(0, src.size);
  const head = latin1(raw.subarray(0, 1024));
  if (!head.includes("%PDF")) {
    if (head.startsWith("%!PS")) {
      // Illustrator 8 ลงไป — PostScript ล้วน อ่านกรอบแบบ EPS
      const eps = await parseEps(src);
      return { ...eps, kind, note: eps.ok ? "ไฟล์ .ai รุ่นเก่า (PostScript) — ได้แค่กรอบงานรวม ไม่แยกอาร์ตบอร์ด" : eps.note };
    }
    return { kind, ok: false, boards: [], note: "ไม่ใช่ไฟล์ PDF/AI ที่รู้จัก — ไฟล์เสียหรือเปลี่ยนนามสกุลมา" };
  }

  // ⚠️ ต้องสแกนไบต์ดิบ "ก่อน" ส่งให้ pdf.js — pdf.js โอน ArrayBuffer ไปให้ worker แล้วบัฟเฟอร์ฝั่งนี้จะว่าง (detached)
  const trimsRaw = scanTrimBoxes(raw);
  let doc: Awaited<ReturnType<PdfjsLike["getDocument"]>["promise"]> | null = null;
  try {
    const pdfjs = await loadPdfjs();
    doc = await pdfjs.getDocument({ data: raw, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
    const n = doc.numPages;
    const labels = await doc.getPageLabels().catch(() => null);
    // จำนวน TrimBox ต้องตรงจำนวนหน้าถึงจะจับคู่หน้าได้ (ไม่งั้นไว้ใจไม่ได้ → ไม่โชว์)
    const trims = trimsRaw && trimsRaw.length === n ? trimsRaw : null;
    const boards: Board[] = [];
    let preview: Blob | undefined;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      if (kind === "ai" && n === 1) {
        // .ai ที่ปิด PDF compatibility = หน้าเดียวมีแต่ข้อความเตือนของ Adobe
        const txt = await page.getTextContent().then((t) => t.items.map((it) => it.str ?? "").join(" ")).catch(() => "");
        if (/without PDF content|PDF compatib/i.test(txt)) {
          return {
            kind,
            ok: false,
            boards: [],
            note: "ไฟล์นี้เซฟโดยปิด \"Create PDF Compatible File\" — ขอลูกค้าเซฟใหม่แบบเปิดตัวเลือกนี้ หรือกรอกขนาดเอง",
          };
        }
      }
      const label = labels?.[i - 1] && !/^\d+$/.test(labels[i - 1]) ? labels[i - 1] : n === 1 ? "อาร์ตบอร์ด" : `อาร์ตบอร์ด ${i}`;
      const b: Board = { label, widthMm: ptToMm(vp.width), heightMm: ptToMm(vp.height) };
      const t = trims?.[i - 1];
      if (t && (ptToMm(t.w) !== b.widthMm || ptToMm(t.h) !== b.heightMm)) b.trim = { widthMm: ptToMm(t.w), heightMm: ptToMm(t.h) };
      boards.push(b);
      // เรนเดอร์บนพื้นโปร่งครั้งเดียวต่อหน้า: ได้ทั้งกรอบชิ้นงาน + ภาพอาร์ตบอร์ดไว้โชว์/ดาวน์โหลด (หน้าแรกใช้เป็นรูปตัวอย่างด้วย)
      if (i === 1 || n <= MAX_RENDER_PAGES) {
        const r = await renderPage(page, vp);
        if (r?.image) {
          b.image = r.image;
          if (i === 1) preview = r.image;
        }
        if (r?.objectPt) b.object = { widthMm: ptToMm(r.objectPt.w), heightMm: ptToMm(r.objectPt.h) };
      }
    }
    const info: DesignInfo = { kind, ok: boards.length > 0, boards, preview };
    if (boards.some((b) => b.trim)) info.note = "ไฟล์ตั้ง bleed ไว้ — ขนาดใหญ่คือรวม bleed · ขนาดตัดจริงอยู่ในวงเล็บ";
    return info;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      kind,
      ok: false,
      boards: [],
      note: /password|encrypt/i.test(msg) ? "ไฟล์ใส่รหัสผ่านไว้ — ขอลูกค้าปลดรหัสก่อน" : "เปิดไฟล์ไม่ได้ (ไฟล์เสียหรือรูปแบบไม่รองรับ) — เปิดใน Illustrator แล้วเซฟใหม่",
    };
  } finally {
    void doc?.destroy().catch(() => {});
  }
}

/**
 * เรนเดอร์หน้าบนพื้นโปร่ง — เฉพาะในเบราว์เซอร์ · ใช้ OffscreenCanvas + onContinue กันค้างตอนแท็บอยู่เบื้องหลัง (ดู ai-thumbnail.ts)
 * คืนกรอบชิ้นงานเป็น point (null = โปร่งทั้งหน้า/เต็มหน้า) + ภาพ PNG พื้นโปร่งของหน้านั้น
 */
async function renderPage(page: PdfPage, base: { width: number; height: number }): Promise<{ objectPt: { w: number; h: number } | null; image?: Blob } | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    const scale = Math.min(RENDER_EDGE / Math.max(base.width, base.height), 6);
    const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
    const w = Math.max(1, Math.round(viewport.width));
    const h = Math.max(1, Math.round(viewport.height));
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d", { willReadFrequently: true }) as unknown as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    const task = page.render({ canvasContext: ctx, viewport, background: "rgba(0,0,0,0)" });
    task.onContinue = (cont) => cont();
    const ok = await Promise.race([task.promise.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), RENDER_TIMEOUT_MS))]);
    if (!ok) {
      task.cancel();
      return null;
    }
    const box = alphaBBox(ctx.getImageData(0, 0, w, h).data, w, h, 4, 3);
    const objectPt = box && !boxIsFull(box, w, h) ? { w: (box.x1 - box.x0) / scale, h: (box.y1 - box.y0) / scale } : null;
    const image = await off.convertToBlob({ type: "image/png" });
    return { objectPt, image };
  } catch {
    return null;
  }
}

/* ── ทางเข้า ───────────────────────────────────────────────────── */

export async function readDesignInfo(fileName: string, src: ByteSource): Promise<DesignInfo> {
  let kind = kindOf(fileName);
  if (src.size === 0) return { kind, ok: false, boards: [], note: "ไฟล์ว่าง (0 ไบต์)" };
  let sniffNote = "";
  if (kind === "other") {
    // ไม่มีนามสกุล/นามสกุลแปลก → ดูหัวไฟล์แทน
    kind = sniffKind(await src.bytes(0, Math.min(src.size, 4096)));
    if (kind !== "other") sniffNote = `ไฟล์ไม่มีนามสกุล — ดูจากเนื้อไฟล์แล้วเป็น .${kind}`;
  }
  const withNote = (info: DesignInfo) => (sniffNote ? { ...info, note: info.note ? `${sniffNote} · ${info.note}` : sniffNote } : info);
  try {
    switch (kind) {
      case "ai":
      case "pdf":
        return withNote(await parsePdfLike(src, kind));
      case "psd":
      case "psb":
        return withNote(await parsePsd(src));
      case "eps":
        return withNote(await parseEps(src));
      case "png":
      case "jpg":
      case "webp":
        return withNote(await parseImage(src, kind));
      default: {
        const ext = fileName.includes(".") ? `.${(fileName.split(".").pop() ?? "").toLowerCase()}` : "ไม่มีนามสกุลและดูจากเนื้อไฟล์ไม่ออก";
        return { kind, ok: false, boards: [], note: `ยังไม่รองรับไฟล์ ${ext} — รองรับ ${SUPPORTED_EXT.map((e) => "." + e).join(" ")}` };
      }
    }
  } catch (e) {
    return { kind, ok: false, boards: [], note: `อ่านไฟล์ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** ข้อความสั้น ๆ ไว้วางในแชท/ใบงาน — ชิ้นงานนำ ผืนตามในวงเล็บ เช่น "98.1 × 99.2 มม. (ผืน 100 × 100)" · หลายอาร์ตบอร์ดคั่นด้วย " · " */
export function sizeText(info: DesignInfo): string {
  if (!info.ok) return info.px ? `${info.px.w} × ${info.px.h} px` : "อ่านขนาดไม่ได้";
  return groupBoards(info.boards)
    .map(({ board: b, count }) => {
      const canvas = `${fmtMm(b.widthMm)} × ${fmtMm(b.heightMm)}`;
      let s: string;
      if (b.object) s = `${fmtMm(b.object.widthMm)} × ${fmtMm(b.object.heightMm)} มม. (ผืน ${canvas})`;
      else if (b.trim) s = `${canvas} มม. (ตัดจริง ${fmtMm(b.trim.widthMm)} × ${fmtMm(b.trim.heightMm)})`;
      else s = `${canvas} มม.`;
      return count > 1 ? `${s} × ${count} อาร์ตบอร์ด` : s;
    })
    .join(" · ");
}

/** ยุบอาร์ตบอร์ดขนาดเดียวกันที่ติดกันเป็นก้อนเดียว (ปฏิทิน 28 หน้าเท่ากัน = 1 บรรทัด × 28) · เรียงตามลำดับเดิม */
export function groupBoards(boards: Board[]): { board: Board; count: number }[] {
  const out: { board: Board; count: number }[] = [];
  const key = (b: Board) => [b.widthMm, b.heightMm, b.trim?.widthMm, b.trim?.heightMm, b.object?.widthMm, b.object?.heightMm].join("|");
  for (const b of boards) {
    const last = out[out.length - 1];
    if (last && key(last.board) === key(b)) last.count += 1;
    else out.push({ board: b, count: 1 });
  }
  return out;
}

export const fmtMm = (mm: number) => (Number.isInteger(mm) ? String(mm) : mm.toFixed(1));
/** มม. → ซม. ทศนิยม 2 ตำแหน่งตัดศูนย์ท้าย (ตรงกับแผง Transform ของ Illustrator: 9.81) */
export const fmtCm = (mm: number) => {
  const s = (Math.round(mm * 10) / 100).toFixed(2);
  return s.replace(/\.?0+$/, "");
};

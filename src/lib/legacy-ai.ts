/**
 * 🗂 .ai แยกเลเยอร์ที่สร้างในเบราว์เซอร์เอง — ไม่ต้องมี Illustrator / โปรแกรม cutout-py ในเครื่อง (เจ้าของร้านสั่ง 22 ต.ค. 69)
 *
 * เดิมเครื่องที่ไม่ได้เปิด cutout-py ได้แค่ไฟล์สำรอง -pdf.ai (Illustrator เปิดแล้วรวมเป็น Layer 1)
 * → เขียนไฟล์ "Adobe Illustrator 8" (PostScript) ตามสเปก AI7FileFormat.pdf (Adobe 1998) ซึ่ง Illustrator รุ่นปัจจุบันยังเปิดได้
 *   และอ่านเลเยอร์ (Lb/Ln/LB) · รูปฝัง (XI) · สี spot (CutContour/White ฯลฯ) · มาสก์ (q … W … Q) ได้ครบ
 *
 * ทดสอบกับ Illustrator 2026 (Mac) แล้ว — กติกาที่เจอจากการลอง (สเปกไม่ได้บอก):
 *  - เส้นปิด (f/s/h) ต้องลากกลับมาจุดเริ่มก่อน ไม่งั้นจุดสุดท้ายหาย กลายเป็นเส้นโค้งเพี้ยน
 *  - รูปใน q…Q ต้องตามด้วย F ไม่งั้นรูปหาย + ทุกอย่างหลังจากนั้นหายทั้งไฟล์
 *  - XI ลำดับขนาดจริงคือ "w h" (สเปกเขียน h w) · ข้อมูลไบนารีต่อท้ายบรรทัด XI ได้เลย (bin-ascii = 1)
 *  - ช่องโปร่งใส (AlphaChannelCount) ไม่รองรับ → ใช้ขอบโปร่งใสที่ลากเป็นเส้นโค้งเป็นมาสก์แทน (ขอบนุ่ม/เงาฟุ้ง = ขอบคม)
 *  - ชื่อเลเยอร์อ่านเป็น MacRoman → ภาษาไทยเพี้ยน ต้องตั้งชื่อภาษาอังกฤษ (englishLayerName)
 *  - ไฟล์มีหน้าเดียว (อาร์ตบอร์ดเดียว) → หลายหน้าเรียงเป็นตาราง 4 ต่อแถวบนอาร์ตบอร์ดเดียว (งาน 2 ด้าน = แถวละใบ หน้า|หลัง · legacyCols)
 *  - รูปไม่บีบอัด → ไฟล์ใหญ่กว่าที่ Illustrator บันทึกเองหลายเท่า (เจ้าของร้านรับได้)
 */
import type { AiPage } from "@/lib/calendar-ai";
import { traceAlphaMm, type CutCurve } from "@/lib/diecut-engine";
import { pageSideOf } from "@/lib/print-sides";

const PT = 72 / 25.4;
const GAP_MM = 10;
const COLS = 4;
const KAPPA = 0.5522847498;

/**
 * 📮 จำนวนช่องต่อแถว — งาน 2 ด้าน (ชื่อหน้าสลับ ด้านหน้า/ด้านหลัง) = แถวละ 1 ใบ ซ้ายหน้า ขวาหลัง (23 ต.ค. 69 OD-261023-1997)
 * เดิมแถวละ 4 ทุกงาน → ไฟล์ .ai ดูไม่ออกว่าช่องไหนด้านหน้า/ด้านหลัง (ชื่อหน้าเขียนบนอาร์ตบอร์ดไม่ได้ · ชื่อไทยเพี้ยน)
 */
export function legacyCols(pages: { name: string }[]): number {
  const n = pages.length;
  if (n >= 2 && n % 2 === 0 && pages.every((p, i) => pageSideOf(p.name) === (i % 2 ? "back" : "front"))) return 2;
  return Math.min(COLS, n);
}

/** พิกเซลของภาพชั้น (RGBA ไม่ premultiply) */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** ถอดรหัส PNG/JPEG เป็นพิกเซลในเบราว์เซอร์ */
export async function decodeBlob(b: Blob): Promise<Pixels> {
  const bmp = await createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** ชื่อเลเยอร์ภาษาอังกฤษ (Illustrator อ่านชื่อในไฟล์รุ่นเก่าเป็น MacRoman — ไทยเพี้ยน) */
export function englishLayerName(name: string): string {
  const n = name.trim();
  if (/^[\x20-\x7e]+$/.test(n)) return n;
  const paren = /\(([\x20-\x7e]+)\)\s*$/.exec(n);
  if (paren) return paren[1].trim();
  if (n === "พื้นหลัง") return "Background";
  if (n === "ลายโปสการ์ด") return "Postcard Back";
  if (n === "รูปหลัก") return "Photo";
  if (n === "ปฏิทิน") return "Calendar";
  if (n === "ข้อความ/ขอบ") return "Text & Border";
  if (n === "วงกลม") return "Circle";
  if (n === "สี่เหลี่ยม") return "Rectangle";
  if (n === "ลาย") return "Artwork";
  const frame = /^กรอบรูป\s*(\d+)/.exec(n);
  if (frame) return `Photo Frame ${frame[1]}`;
  if (n.startsWith("ข้อความ")) return "Text";
  if (n.startsWith("เส้นตัด")) return "CutContour";
  if (n.startsWith("รองขาว")) return "White";
  return "Layer";
}

/** PostScript string ภาษาอังกฤษล้วน */
const psStr = (s: string) => "(" + s.replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1") + ")";
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

type Seg = [number, number, number, number, number, number];
type Curve = { s: [number, number]; g: Seg[]; open?: boolean };

/** พื้นที่มีเครื่องหมาย (shoelace บนจุดแองเคอร์ · y ลง) */
function signedArea(c: Curve): number {
  const pts: [number, number][] = [c.s, ...c.g.map((g) => [g[4], g[5]] as [number, number])];
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function insidePoly(p: [number, number], c: Curve): boolean {
  const pts: [number, number][] = [c.s, ...c.g.map((g) => [g[4], g[5]] as [number, number])];
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function reverse(c: Curve): Curve {
  const pts: [number, number][] = [c.s, ...c.g.map((g) => [g[4], g[5]] as [number, number])];
  const g: Seg[] = [];
  for (let i = c.g.length - 1; i >= 0; i--) {
    const sg = c.g[i];
    const from = pts[i];
    g.push([sg[2], sg[3], sg[0], sg[1], from[0], from[1]]);
  }
  return { s: pts[pts.length - 1], g, open: c.open };
}

/**
 * รูกลาง (ตัว อ/ด/0 · รูห่วง) ต้องวนทิศตรงข้ามกับขอบนอก — Illustrator รุ่นเก่าใช้กติกา nonzero winding
 * ความลึกนับจากจำนวนเส้นที่ครอบจุดเริ่ม: คู่ = ขอบนอก · คี่ = รู
 */
function orientForFill(cs: Curve[]): Curve[] {
  return cs.map((c, i) => {
    let depth = 0;
    for (let j = 0; j < cs.length; j++) if (j !== i && insidePoly(c.s, cs[j])) depth++;
    const wantPositive = depth % 2 === 0;
    return signedArea(c) > 0 === wantPositive ? c : reverse(c);
  });
}

const fromCut = (cs: CutCurve[], dx: number, dy: number): Curve[] =>
  cs.map((c) => ({
    s: [c.start.x + dx, c.start.y + dy],
    g: c.segs.map((s) => [s.c1.x + dx, s.c1.y + dy, s.c2.x + dx, s.c2.y + dy, s.to.x + dx, s.to.y + dy] as Seg),
  }));

function roundRect(x: number, y: number, w: number, h: number, r: number): Curve {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) {
    const L = (ax: number, ay: number, bx: number, by: number): Seg => [ax, ay, bx, by, bx, by];
    return { s: [x, y], g: [L(x, y, x + w, y), L(x + w, y, x + w, y + h), L(x + w, y + h, x, y + h), L(x, y + h, x, y)] };
  }
  const k = rr * KAPPA;
  const g: Seg[] = [
    [x + rr, y, x + w - rr, y, x + w - rr, y],
    [x + w - rr + k, y, x + w, y + rr - k, x + w, y + rr],
    [x + w, y + rr, x + w, y + h - rr, x + w, y + h - rr],
    [x + w, y + h - rr + k, x + w - rr + k, y + h, x + w - rr, y + h],
    [x + w - rr, y + h, x + rr, y + h, x + rr, y + h],
    [x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr],
    [x, y + h - rr, x, y + rr, x, y + rr],
    [x, y + rr - k, x + rr - k, y, x + rr, y],
  ];
  return { s: [x + rr, y], g };
}

function circle(cx: number, cy: number, r: number): Curve {
  const k = r * KAPPA;
  return {
    s: [cx + r, cy],
    g: [
      [cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      [cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      [cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      [cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ],
  };
}

/** โค้งที่ปิดต้องจบที่จุดเริ่ม (กติกา Illustrator: ไม่งั้นจุดสุดท้ายหาย) */
function closeCurve(c: Curve): Curve {
  if (c.open || !c.g.length) return c;
  const last = c.g[c.g.length - 1];
  if (Math.abs(last[4] - c.s[0]) < 1e-6 && Math.abs(last[5] - c.s[1]) < 1e-6) return c;
  return { ...c, g: [...c.g, [last[4], last[5], c.s[0], c.s[1], c.s[0], c.s[1]]] };
}

interface Out {
  parts: BlobPart[];
  push(s: string): void;
}

/** สร้าง .ai (Illustrator 8) จากหน้าที่ renderAiPages วาดไว้ */
export async function buildLegacyAi(
  pages: AiPage[],
  opts: { title: string; decode?: (b: Blob) => Promise<Pixels>; onProgress?: (done: number, total: number) => void },
): Promise<Blob> {
  const decode = opts.decode ?? decodeBlob;
  const n = pages.length;
  const cols = legacyCols(pages);
  const cellW = Math.max(...pages.map((p) => p.wMm));
  const cellH = Math.max(...pages.map((p) => p.hMm));
  const rows = Math.ceil(n / cols);
  const totW = cols * cellW + (cols - 1) * GAP_MM;
  const totH = rows * cellH + (rows - 1) * GAP_MM;
  const H = totH * PT;
  const P = (x: number, y: number) => `${f3(x * PT)} ${f3(H - y * PT)}`;
  const origin = (i: number): [number, number] => [(i % cols) * (cellW + GAP_MM), Math.floor(i / cols) * (cellH + GAP_MM)];

  // สี spot ทั้งไฟล์
  const spots = new Map<string, [number, number, number, number]>();
  for (const p of pages) {
    if (p.cut) spots.set("CutContour", [0, 100, 0, 0]);
    for (const pth of p.paths ?? []) spots.set(pth.spot, pth.cmyk);
  }
  const spotOp = (name: string, stroke: boolean) => {
    const c = (spots.get(name) ?? [0, 100, 0, 0]).map((v) => f3(v / 100));
    return `${c.join(" ")} ${psStr(name)} 0 ${stroke ? "X" : "x"}\n`;
  };

  const pathOps = (c: Curve, dx: number, dy: number): string => {
    const cc = closeCurve(c);
    let s = `${P(cc.s[0] + dx, cc.s[1] + dy)} m\n`;
    for (const g of cc.g) s += `${P(g[0] + dx, g[1] + dy)} ${P(g[2] + dx, g[3] + dy)} ${P(g[4] + dx, g[5] + dy)} C\n`;
    return s;
  };

  // เลเยอร์รวมตามชื่อทุกหน้า (ลำดับ = ล่าง → บน ตามที่พบครั้งแรก)
  const layers: { name: string; locked: boolean; body: BlobPart[] }[] = [];
  const layerOf = (name: string, locked = false) => {
    let L = layers.find((l) => l.name === name);
    if (!L) {
      L = { name, locked, body: [] };
      layers.push(L);
    }
    return L;
  };

  let done = 0;
  const totalLayers = pages.reduce((a, p) => a + p.layers.length, 0);
  for (let i = 0; i < n; i++) {
    const pg = pages[i];
    const [ox, oy] = origin(i);
    // 1) พื้นหลัง
    const bg = pg.bg && pg.bg !== "none" && pg.bg !== "transparent" ? /^#?([0-9a-f]{6})$/i.exec(pg.bg.trim()) : null;
    if (bg) {
      const v = bg[1];
      const rgb = [0, 2, 4].map((j) => f3(parseInt(v.slice(j, j + 2), 16) / 255));
      layerOf("Background").body.push(`0 O\n${rgb.join(" ")} Xa\n` + pathOps(roundRect(0, 0, pg.wMm, pg.hMm, 0), ox, oy) + "f\n");
    }
    // 2) ถมสี (รองขาว) ใต้ลาย
    const over = [];
    for (const pth of pg.paths ?? []) {
      if (!pth.fill) {
        over.push(pth);
        continue;
      }
      const cs = orientForFill(pth.curves.map((c) => ({ s: c.s, g: c.g })));
      let s = "0 O\n" + spotOp(pth.spot, false);
      s += cs.length > 1 ? "*u\n" + cs.map((c) => pathOps(c, ox, oy) + "f\n").join("") + "*U\n" : pathOps(cs[0], ox, oy) + "f\n";
      layerOf(englishLayerName(pth.layer)).body.push(s);
    }
    // 3) ภาพแต่ละชั้น (ส่วนโปร่งใส = มาสก์เส้นโค้งจากขอบ alpha)
    const nameCount = new Map<string, number>();
    for (const l of pg.layers) {
      const base = englishLayerName(l.name);
      const k = (nameCount.get(base) ?? 0) + 1;
      nameCount.set(base, k);
      const lname = k > 1 || base === "Text" ? `${base} ${k}` : base;
      const px = await decode(l.png);
      const { width: pw, height: ph, data } = px;
      const rgb = new Uint8Array(pw * ph * 3);
      let opaque = true;
      for (let p = 0, q = 0; p < data.length; p += 4, q += 3) {
        rgb[q] = data[p];
        rgb[q + 1] = data[p + 1];
        rgb[q + 2] = data[p + 2];
        if (data[p + 3] < 255) opaque = false;
      }
      const X = (ox + l.x) * PT;
      const Y = H - (oy + l.y) * PT;
      const head =
        `%AI5_File:\n%AI5_BeginRaster\n[ ${(l.w * PT) / pw} 0 0 ${(l.h * PT) / ph} ${f3(X)} ${f3(Y)} ] ` +
        `0 0 ${pw} ${ph} ${pw} ${ph} 8 3 0 0 1 0 XI\n`;
      const raster: BlobPart[] = [head, rgb, "\n%AI5_EndRaster\nF\n"];
      const L = layerOf(lname);
      if (opaque) {
        L.body.push(...raster);
      } else {
        const ppm = pw / l.w;
        const traced = traceAlphaMm({ width: pw, height: ph, data, colorSpace: "srgb" } as ImageData, ppm, {
          chokeMm: 0,
          smooth: 0,
          minAreaMm2: 0.01,
        });
        if (!traced.length) continue; // ชั้นใสทั้งหมด
        const cs = orientForFill(fromCut(traced, l.x, l.y));
        let mask = "q\n";
        mask += cs.length > 1 ? "*u\n" + cs.map((c) => pathOps(c, ox, oy) + "h W n\n").join("") + "*U\n" : pathOps(cs[0], ox, oy) + "h W n\n";
        L.body.push(mask, ...raster, "Q\n");
      }
      opts.onProgress?.(++done, totalLayers);
    }
    // 4) เส้นตัดสี่เหลี่ยม + เส้นตัดตามรูป/รูห่วง — บนสุด ล็อก
    const stroke = (name: string) => "0 R\n" + spotOp(name, true) + "0.25 w\n";
    if (pg.cut) {
      const c = pg.cut;
      layerOf("CutContour", true).body.push(stroke("CutContour") + pathOps(roundRect(c.x, c.y, c.w, c.h, c.r || 0), ox, oy) + "s\n");
    }
    for (const pth of over) {
      let s = stroke(pth.spot);
      for (const c of pth.curves) s += pathOps({ s: c.s, g: c.g, open: c.open }, ox, oy) + (c.open ? "S\n" : "s\n");
      for (const [cx, cy, r] of pth.circles ?? []) s += pathOps(circle(cx, cy, r), ox, oy) + "s\n";
      layerOf(englishLayerName(pth.layer), true).body.push(s);
    }
  }
  // ชั้นที่ล็อก (เส้นตัด) ขึ้นบนสุดเสมอ
  layers.sort((a, b) => Number(a.locked) - Number(b.locked));

  const W = totW * PT;
  const spotNames = [...spots.keys()];
  const out: BlobPart[] = [
    "%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator(R) 8.0\n%%AI8_CreatorVersion: 8.0\n",
    `%%For: (iDuckyOfficial) ()\n%%Title: ${psStr(opts.title || "iducky")}\n`,
    `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}\n%%HiResBoundingBox: 0 0 ${f3(W)} ${f3(H)}\n`,
    "%%DocumentProcessColors: Cyan Magenta Yellow Black\n",
    spotNames.length ? `%%DocumentCustomColors: ${spotNames.map(psStr).join("\n%%+ ")}\n` : "",
    ...spotNames.map((s) => `%%CMYKCustomColor: ${spots.get(s)!.map((v) => f3(v / 100)).join(" ")} ${psStr(s)}\n`),
    "%AI5_FileFormat 4.0\n%AI3_ColorUsage: Color\n",
    `%AI3_TileBox: 0 0 ${f3(W)} ${f3(H)}\n%AI3_DocumentPreview: None\n%AI5_ArtSize: ${f3(W)} ${f3(H)}\n`,
    `%AI5_RulerUnits: 1\n%AI5_NumLayers: ${layers.length}\n%%PageOrigin:0 0\n%%EndComments\n`,
    "%%BeginProlog\n%%EndProlog\n%%BeginSetup\n%%EndSetup\n",
  ];
  layers.forEach((L, i) => {
    out.push(`%AI5_BeginLayer\n1 1 ${L.locked ? 0 : 1} 1 0 0 ${i % 27} 79 128 255 Lb\n${psStr(L.name)} Ln\n0 A\n`, ...L.body, "LB\n%AI5_EndLayer--\n");
  });
  out.push("%%PageTrailer\nshowpage\n%%Trailer\n%%EOF\n");
  return new Blob(out, { type: "application/postscript" });
}

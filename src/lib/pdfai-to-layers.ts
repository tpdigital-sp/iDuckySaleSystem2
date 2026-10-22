/**
 * 🔄 ไฟล์สำรอง -pdf.ai ที่แนบในออเดอร์ (aiOcgPdf · เปิดใน Illustrator แล้วรวมเป็น Layer 1) → .ai แยกเลเยอร์ (legacy-ai.ts)
 * เจ้าของร้านสั่ง 22 ต.ค. 69 "หลังบ้านโหลด .ai ได้เลย ไม่ต้องกด 🔁 ทำ .ai เลเยอร์ใหม่ด้วย Illustrator"
 *
 * ไฟล์สำรองเก็บแต่ละชั้นเป็น OCG (เลเยอร์ PDF) อยู่แล้ว: รูปชั้น (JPEG/PNG + SMask) · พื้นหลังสีเรียบ · เส้นตัด/รองขาวเป็นเส้นเวกเตอร์
 * → อ่านกลับเป็น AiPage[] ชุดเดียวกับที่จอออกแบบส่งให้ตัวสร้าง .ai แล้วสร้างใหม่ — ไม่ต้องเปิดแบบ/วาดใหม่ ใช้ได้กับออเดอร์เก่าด้วย
 *
 * อ่านเฉพาะไฟล์ที่ระบบเราเขียนเอง (Creator "iDuckyOfficial …" · ก่อน 17 ต.ค. 69 "iDucky Prints Studio …") — .ai แท้จาก Illustrator คืน null
 */
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
} from "pdf-lib";
import type { AiPage, AiPath } from "@/lib/calendar-ai";
import type { Pixels } from "@/lib/legacy-ai";

const PT = 72 / 25.4;
/** Creator ของไฟล์สำรองที่ระบบเขียน (ชื่อแบรนด์เปลี่ยน 17 ต.ค. 69 — ไฟล์เก่ายังเป็น iDucky Prints Studio) */
const OURS = (creator: string | undefined) => /^iDucky/i.test(creator ?? "");
type M = [number, number, number, number, number, number];
type Seg = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** spot ตามชื่อเลเยอร์ "เส้นตัด (Cut100)" · "รองขาว (White)" */
const SPOT_CMYK: Record<string, [number, number, number, number]> = {
  CutContour: [0, 100, 0, 0],
  Cut100: [0, 100, 0, 0],
  Cut50: [100, 0, 0, 0],
  White: [0, 0, 0, 100],
};

function tokenize(src: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /\/[^\s/<>[\]()%]+|-?\d*\.?\d+(?:[eE][-+]?\d+)?|[A-Za-z'"*]+\*?|\[|\]|<<|>>|\([^)]*\)|<[0-9a-fA-F\s]*>|%[^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t[0] === "%") continue;
    out.push(/^-?\d*\.?\d+/.test(t) && !/^[A-Za-z]/.test(t) ? Number(t) : t);
  }
  return out;
}

function textOf(o: unknown): string {
  if (o instanceof PDFHexString || o instanceof PDFString) return o.decodeText();
  return "";
}

/** ไฟล์สำรองของระบบเรา (aiOcgPdf) ไหม — ดูจาก Creator */
export async function isOurPdfAi(bytes: Uint8Array): Promise<boolean> {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  if (head !== "%PDF-") return false;
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    return OURS(doc.getCreator()) && !!doc.catalog.get(PDFName.of("OCProperties"));
  } catch {
    return false;
  }
}

/**
 * อ่านไฟล์สำรองเป็นหน้า + ชั้น · images = พิกเซลของรูปแต่ละชั้น (คีย์คือ Blob ที่ใส่ไว้ใน layers[].png)
 * JPEG ส่งเป็น Blob จริง (ถอดในเบราว์เซอร์) · PNG (RGB + SMask) ถอดเป็นพิกเซลเลยที่นี่
 */
export async function pdfAiToPages(bytes: Uint8Array): Promise<{ pages: AiPage[]; pixels: Map<Blob, Pixels> } | null> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  if (!OURS(doc.getCreator()) || !doc.catalog.get(PDFName.of("OCProperties"))) return null;
  const ctx = doc.context;
  const pixels = new Map<Blob, Pixels>();
  const pages: AiPage[] = [];
  const many = doc.getPageCount() > 1;

  for (const [pi, pg] of doc.getPages().entries()) {
    const { width: Wpt, height: Hpt } = pg.getSize();
    const res = pg.node.Resources();
    const props = res?.lookupMaybe(PDFName.of("Properties"), PDFDict);
    const xobj = res?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const ocgName = (tag: string) => {
      const ref = props?.get(PDFName.of(tag));
      const ocg = ref instanceof PDFRef ? ctx.lookup(ref, PDFDict) : ref instanceof PDFDict ? ref : undefined;
      return textOf(ocg?.get(PDFName.of("Name")));
    };
    // เนื้อหาหน้า (อาจเป็นหลายสตรีม)
    const contents = pg.node.Contents();
    const streams: PDFRawStream[] = [];
    const pushStream = (o: unknown) => {
      const s = o instanceof PDFRef ? ctx.lookup(o) : o;
      if (s instanceof PDFRawStream) streams.push(s);
    };
    if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) pushStream(contents.get(i));
    else pushStream(contents);
    const src = streams.map((s) => new TextDecoder("latin1").decode(decodePDFRawStream(s).decode())).join("\n");

    let pageName = `หน้า ${pi + 1}`;
    let bg = "none";
    const layers: AiPage["layers"] = [];
    const paths: AiPath[] = [];
    // สถานะตัวตีความ
    let ctm: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    let cur = "";
    let fill: [number, number, number] = [0, 0, 0];
    let sub: { s: [number, number]; g: Seg[]; closed: boolean } | null = null;
    let subs: { s: [number, number]; g: Seg[]; closed: boolean }[] = [];
    let last: [number, number] = [0, 0];
    const toMm = (x: number, y: number): [number, number] => {
      const [X, Y] = apply(ctm, x, y);
      return [X / PT, (Hpt - Y) / PT];
    };
    const flushSub = () => {
      if (sub && sub.g.length) subs.push(sub);
      sub = null;
    };
    const ops: (string | number)[] = [];
    const nameOf = (raw: string) => {
      const i = raw.lastIndexOf(" · ");
      if (many && i > 0) {
        pageName = raw.slice(0, i);
        return raw.slice(i + 3);
      }
      return raw;
    };
    const paint = (kind: "fill" | "stroke") => {
      flushSub();
      const list = subs;
      subs = [];
      if (!list.length) return;
      const lname = nameOf(cur);
      if (lname === "พื้นหลัง" && kind === "fill") {
        bg = "#" + fill.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
        return;
      }
      const spot = /\(([\x20-\x7e]+)\)\s*$/.exec(lname)?.[1]?.trim() || (kind === "fill" ? "White" : "CutContour");
      const curves = list.map((c) => ({ s: c.s, g: c.g, ...(kind === "stroke" && !c.closed ? { open: true } : {}) }));
      const prev = paths.find((p) => p.layer === lname && p.fill === (kind === "fill"));
      if (prev) prev.curves.push(...curves);
      else paths.push({ layer: lname, spot, cmyk: SPOT_CMYK[spot] ?? [0, 100, 0, 0], fill: kind === "fill", curves });
    };

    for (const t of tokenize(src)) {
      if (typeof t === "number" || t[0] === "/" || t === "[" || t === "]" || t[0] === "(" || t[0] === "<") {
        ops.push(t);
        continue;
      }
      const n = (i: number) => Number(ops[ops.length - i]);
      switch (t) {
        case "BDC": {
          const tag = String(ops[ops.length - 1]).slice(1);
          cur = ocgName(tag);
          break;
        }
        case "EMC":
          cur = "";
          break;
        case "q":
          stack.push(ctm);
          break;
        case "Q":
          ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          break;
        case "cm":
          ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm);
          break;
        case "rg":
          fill = [n(3), n(2), n(1)];
          break;
        case "g":
          fill = [n(1), n(1), n(1)];
          break;
        case "m":
          flushSub();
          last = toMm(n(2), n(1));
          sub = { s: last, g: [], closed: false };
          break;
        case "l": {
          const p = toMm(n(2), n(1));
          sub?.g.push([last[0], last[1], p[0], p[1], p[0], p[1]]);
          last = p;
          break;
        }
        case "c": {
          const a = toMm(n(6), n(5));
          const b = toMm(n(4), n(3));
          const p = toMm(n(2), n(1));
          sub?.g.push([a[0], a[1], b[0], b[1], p[0], p[1]]);
          last = p;
          break;
        }
        case "v": {
          const b = toMm(n(4), n(3));
          const p = toMm(n(2), n(1));
          sub?.g.push([last[0], last[1], b[0], b[1], p[0], p[1]]);
          last = p;
          break;
        }
        case "y": {
          const a = toMm(n(4), n(3));
          const p = toMm(n(2), n(1));
          sub?.g.push([a[0], a[1], p[0], p[1], p[0], p[1]]);
          last = p;
          break;
        }
        case "h":
          if (sub) {
            sub.closed = true;
            if (sub.g.length) {
              const e = sub.g[sub.g.length - 1];
              if (Math.abs(e[4] - sub.s[0]) > 1e-6 || Math.abs(e[5] - sub.s[1]) > 1e-6)
                sub.g.push([e[4], e[5], sub.s[0], sub.s[1], sub.s[0], sub.s[1]]);
            }
            last = sub.s;
          }
          break;
        case "re": {
          flushSub();
          const [x, y, w, h] = [n(4), n(3), n(2), n(1)];
          const pts = [toMm(x, y), toMm(x + w, y), toMm(x + w, y + h), toMm(x, y + h)];
          const g: Seg[] = [1, 2, 3, 0].map((k, i) => [pts[i][0], pts[i][1], pts[k][0], pts[k][1], pts[k][0], pts[k][1]] as Seg);
          subs.push({ s: pts[0], g, closed: true });
          break;
        }
        case "f":
        case "F":
        case "f*":
          paint("fill");
          break;
        case "S":
          paint("stroke");
          break;
        case "s":
          if (sub) sub.closed = true;
          paint("stroke");
          break;
        case "B":
        case "B*":
        case "b":
        case "b*":
          paint("fill");
          break;
        case "n":
          flushSub();
          subs = [];
          break;
        case "Do": {
          const nm = String(ops[ops.length - 1]).slice(1);
          const ref = xobj?.get(PDFName.of(nm));
          const img = ref instanceof PDFRef ? ctx.lookup(ref) : ref;
          if (!(img instanceof PDFRawStream)) break;
          const blob = await imageBlob(img, ctx, pixels);
          if (!blob) break;
          const [x0, y0] = apply(ctm, 0, 0);
          const [x1, y1] = apply(ctm, 1, 1);
          const left = Math.min(x0, x1);
          const top = Math.max(y0, y1);
          layers.push({
            name: nameOf(cur) || `ชั้น ${layers.length + 1}`,
            png: blob,
            x: left / PT,
            y: (Hpt - top) / PT,
            w: Math.abs(x1 - x0) / PT,
            h: Math.abs(y1 - y0) / PT,
          });
          break;
        }
      }
      ops.length = 0;
    }
    pages.push({ name: pageName, wMm: Wpt / PT, hMm: Hpt / PT, bg, layers, cut: null, paths });
  }
  return { pages, pixels };
}

/** รูปชั้นจาก XObject: DCTDecode = ไฟล์ JPEG ตรง ๆ · FlateDecode (PNG ที่ pdf-lib แยก RGB + SMask) = ถอดเป็นพิกเซล */
async function imageBlob(img: PDFRawStream, ctx: PDFDocument["context"], pixels: Map<Blob, Pixels>): Promise<Blob | null> {
  const d = img.dict;
  const filter = d.get(PDFName.of("Filter"));
  const fname = filter instanceof PDFName ? filter.asString() : filter instanceof PDFArray ? String(filter.get(0)) : "";
  if (fname === "/DCTDecode") return new Blob([img.contents.slice()], { type: "image/jpeg" });
  const w = (d.get(PDFName.of("Width")) as PDFNumber)?.asNumber();
  const h = (d.get(PDFName.of("Height")) as PDFNumber)?.asNumber();
  const bpc = (d.get(PDFName.of("BitsPerComponent")) as PDFNumber)?.asNumber() ?? 8;
  if (!w || !h || bpc !== 8) return null;
  const raw = decodePDFRawStream(img).decode();
  const ch = raw.length >= w * h * 3 ? 3 : 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += ch) {
    data[i * 4] = raw[j];
    data[i * 4 + 1] = raw[j + (ch === 3 ? 1 : 0)];
    data[i * 4 + 2] = raw[j + (ch === 3 ? 2 : 0)];
    data[i * 4 + 3] = 255;
  }
  const sRef = d.get(PDFName.of("SMask"));
  const sm = sRef instanceof PDFRef ? ctx.lookup(sRef) : sRef;
  if (sm instanceof PDFRawStream) {
    const a = decodePDFRawStream(sm).decode();
    if (a.length >= w * h) for (let i = 0; i < w * h; i++) data[i * 4 + 3] = a[i];
  }
  const key = new Blob([], { type: "image/x-pixels" });
  pixels.set(key, { width: w, height: h, data });
  return key;
}

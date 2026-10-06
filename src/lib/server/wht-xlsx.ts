import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * 📥 อ่านไฟล์ "รายงานยอดขาย" (.xlsx) ที่ส่งออกจาก FlowAccount → แถวใบกำกับภาษี
 *
 * .xlsx = zip ของ XML — แกะเองด้วย zlib ของ Node (ไม่ต้องลงแพ็กเกจ excel เพิ่ม)
 * หาแถวหัวตารางจากคำว่า "เลขที่เอกสาร" แล้วจับคอลัมน์ตามชื่อหัว (FlowAccount สลับลำดับคอลัมน์ได้ ไม่ยึดตำแหน่ง)
 * ตัวอย่างไฟล์จริง: "บริษัท ทีพีดิจิตอล จำกัด_SalesReport_September 2026.xlsx" (165 ใบ · 6 ต.ค. 69)
 */

export interface SalesReportRow {
  docNo: string;
  date: string;
  company: string;
  taxId?: string;
  branch?: string;
  base: number;
  vat: number;
  total: number;
  refDoc?: string;
  refNo?: string;
  depositRef?: string;
  status?: string;
}

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("ไฟล์นี้ไม่ใช่ .xlsx (เปิดเป็น zip ไม่ได้)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < count && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** ชีตแรกของไฟล์ → ตาราง 2 มิติ (ค่าเป็นข้อความ/ตัวเลข) */
function firstSheet(files: Map<string, Buffer>): (string | number | null)[][] {
  const shared = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error("ไม่พบชีตข้อมูลในไฟล์");
  const xml = files.get(sheetName)!.toString("utf8");
  const rows: (string | number | null)[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: (string | number | null)[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val: string | number | null = null;
      if (type === "s" && v != null) val = strings[Number(v)] ?? "";
      else if (type === "inlineStr") val = textOf(inner);
      else if (type === "str" && v != null) val = decode(v);
      else if (v != null && v !== "") val = isFinite(Number(v)) ? Number(v) : decode(v);
      row[colIndex(ref)] = val;
    }
    rows.push(row);
  }
  return rows;
}

/** วันที่ในเซลล์ → YYYY-MM-DD (เลข serial ของ Excel หรือข้อความ dd/mm/yyyy) */
function ymdOf(v: string | number | null | undefined): string {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v ?? ""));
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : "";
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v == null ? "" : String(v).trim());

export function parseSalesReport(buf: Buffer): SalesReportRow[] {
  const rows = firstSheet(unzip(buf));
  const hi = rows.findIndex((r) => r.some((c) => str(c) === "เลขที่เอกสาร"));
  if (hi < 0) throw new Error('ไม่พบหัวตาราง "เลขที่เอกสาร" — ใช้ไฟล์ "รายงานยอดขาย" จาก FlowAccount');
  const head = rows[hi].map(str);
  // "ยอดรวมสุทธิ" มี 2 คอลัมน์ (สกุลหลัก/สกุลอื่น) → ใช้ตัวแรก
  const col = (name: string) => head.indexOf(name);
  const C = {
    date: col("วัน/เดือน/ปี"),
    no: col("เลขที่เอกสาร"),
    name: col("ชื่อลูกค้า"),
    taxId: col("เลขผู้เสียภาษี"),
    branch: col("สำนักงานใหญ่/สาขา"),
    base: col("มูลค่า"),
    vat: col("ภาษีมูลค่าเพิ่ม"),
    total: col("ยอดรวมสุทธิ"),
    ref: col("เอกสารอ้างอิงในระบบ"),
    refNo: col("เลขที่อ้างอิง"),
    dep: col("เอกสารอ้างอิงรับมัดจำ"),
    status: col("สถานะ"),
  };
  if (C.no < 0 || C.total < 0 || C.name < 0) throw new Error("คอลัมน์ในไฟล์ไม่ครบ (ต้องมี เลขที่เอกสาร · ชื่อลูกค้า · ยอดรวมสุทธิ)");
  const at = (r: (string | number | null)[], i: number) => (i >= 0 ? r[i] : null);
  const out: SalesReportRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const docNo = str(at(r, C.no));
    if (!/^[A-Z]{2,4}\d{3,}$/i.test(docNo)) continue;
    const total = num(at(r, C.total));
    const base = C.base >= 0 ? num(at(r, C.base)) : Math.round((total / 1.07) * 100) / 100;
    out.push({
      docNo: docNo.toUpperCase(),
      date: ymdOf(at(r, C.date)),
      company: str(at(r, C.name)),
      taxId: str(at(r, C.taxId)) || undefined,
      branch: str(at(r, C.branch)) || undefined,
      base,
      vat: num(at(r, C.vat)),
      total,
      refDoc: str(at(r, C.ref)) || undefined,
      refNo: str(at(r, C.refNo)) || undefined,
      depositRef: str(at(r, C.dep)) || undefined,
      status: str(at(r, C.status)) || undefined,
    });
  }
  return out;
}

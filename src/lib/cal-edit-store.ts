"use client";

/**
 * 🗓 จำแบบปฏิทินที่ออกแบบบนเว็บไว้ต่อบรรทัดตะกร้า — กด ✏️ แก้ไขในตะกร้าแล้วจอสร้างปฏิทินเปิดแบบเดิมต่อได้
 * (ผู้ใช้สั่ง 13 ต.ค. 69 "กดใช้แบบนี้ หรือใส่ตะกร้า ให้สามารถกลับมาแก้ไขได้อีก")
 *
 * เดิมสถานะจอ (calState) อยู่แค่ในหน้าสินค้า → ใส่ตะกร้าแล้วหายทันที แก้จากตะกร้าได้แค่สเปค
 * เก็บใน localStorage ของเครื่องลูกค้า (คีย์ = key ของบรรทัดตะกร้า) · รูปต้นฉบับเก็บเป็น URL ที่อัปไว้แล้ว
 * (ไฟล์ File เก็บข้ามหน้าไม่ได้) → ตอนแก้ไขดึงกลับมาเป็นไฟล์ใหม่
 */

import type { CalBack, CalDesign } from "@/lib/calendar-card";

const KEY = "iducky-cal-edit-v1";
/** เก็บไว้ไม่เกินนี้ (บรรทัดเก่าสุดหลุดก่อน) — กัน localStorage เต็ม */
const MAX_LINES = 30;

export interface SavedCalDesign {
  format: string;
  design: CalDesign;
  back: CalBack;
  /** รูปต้นฉบับตามลำดับเดียวกับ design อ้างถึง ("" = อัปไม่ขึ้น) */
  sourceUrls: string[];
  summary: string;
  head: string;
  dpi: number;
  spec: string;
  artUrl: string;
  calBackFiles?: { url: string; name: string; w: number; h: number }[];
  qty: number;
  aiUrl?: string;
  pdfUrl?: string;
  /** ✏️ ลิงก์ที่ฝากแบบนี้ไว้บนเซิร์ฟเวอร์ (uploadCalDesign) */
  editUrl?: string;
}

type Store = Record<string, { at: number; designs: SavedCalDesign[] }>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

export function saveCalEdit(lineKey: string, designs: SavedCalDesign[]) {
  try {
    const s = read();
    s[lineKey] = { at: Date.now(), designs };
    const keys = Object.keys(s).sort((a, b) => s[b].at - s[a].at);
    for (const k of keys.slice(MAX_LINES)) delete s[k];
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* เต็ม/ปิดไว้ — แก้จากตะกร้าได้แค่สเปคเหมือนเดิม */
  }
}

export function loadCalEdit(lineKey: string): SavedCalDesign[] | null {
  return read()[lineKey]?.designs ?? null;
}

/**
 * ดึงรูปต้นฉบับกลับมาเป็นไฟล์ · ทุกรูปหาย = null (ใช้แค่ไฟล์ที่ประกอบแล้ว) เว้นแต่ keepAllMissing
 * หายบางรูป (อัปไม่ขึ้นตอนสั่ง เช่น ติดโควตาอัปโหลด) → ใส่รูปแทน "รูปหาย" เฉพาะช่องนั้น ที่เหลือเปิดแบบเดิมได้
 * (เดิมหายรูปเดียวทิ้งทั้งแบบ — OD-261015-7971 ต้นฉบับขึ้น 5/14 เปิดแก้ไม่ได้เลย · 15 ต.ค. 69)
 */
export async function fetchSources(urls: string[], keepAllMissing = false): Promise<File[] | null> {
  const got = await Promise.all(
    urls.map(async (u, i) => {
      try {
        if (!u) return null;
        const r = await fetch(u);
        if (!r.ok) return null;
        const b = await r.blob();
        const f = new File([b], decodeURIComponent(u.split("/").pop() || `รูป-${i + 1}`), { type: b.type || "image/jpeg" });
        rememberSource(f, u);
        return f;
      } catch {
        return null;
      }
    }),
  );
  // keepAllMissing: หลังบ้านเปิดดูแบบที่ต้นฉบับหายทุกรูป — ได้ภาพ "รูปหาย" ครบทุกช่อง (เห็นเลย์เอาต์/ข้อความ · ใส่รูปจริงแทนได้)
  if (!got.some(Boolean) && !keepAllMissing) return null;
  return Promise.all(got.map(async (f, i) => f ?? (await missingPhoto(i))));
}

/**
 * ♻️ รูปต้นฉบับที่อยู่บนเซิร์ฟเวอร์แล้ว (ดึงกลับมาตอนเปิดแก้ / อัปไปแล้วรอบก่อน) — กด "ใช้แบบนี้" ซ้ำไม่ต้องอัปใหม่
 * เดิมอัปต้นฉบับทุกรูปใหม่ทุกครั้ง: แก้แบบ 2–3 รอบชนเพดานอัปโหลด 120 ไฟล์/ชม. → รูปที่อัปไม่ขึ้นกลายเป็น "รูปหาย"
 * ตอนเปิดครั้งต่อไป (OD-261015-7971 · 15 ต.ค. 69)
 */
const known = new Map<string, string>();
const srcKey = (f: File) => `${f.name}|${f.size}|${f.type}`;
export function rememberSource(f: File, url: string) {
  if (url) known.set(srcKey(f), url);
}
export function knownSourceUrl(f: File): string | undefined {
  return known.get(srcKey(f));
}
/**
 * 🖼 รูปต้นฉบับหาย (อัปไม่ขึ้นตอนลูกค้าออกแบบ) → ใช้ "ไฟล์พร้อมพิมพ์" ของแบบนั้นแทนรูป (OD-261019-1860 · 19 ต.ค. 69)
 * ไฟล์พร้อมพิมพ์ = ผืนงานทั้งหน้า (รวมตัดตก) 300 DPI พิกัดเดียวกับจอ → วางเต็มผืน (กึ่งกลาง · กว้าง×สูงเท่ากรอบ) ได้ภาพเดิมทุกพิกเซล
 * ใช้ได้เฉพาะแบบที่ "ไฟล์พร้อมพิมพ์ = รูปนั้นล้วน ๆ": หน้าเดียว (ไม่มีหน้าหลัง/หน้าเดือน) · รูปช่องหลักรูปเดียว · ไม่มีข้อความ/ชิ้นส่วน
 * (มีข้อความ = ข้อความถูกวาดซ้ำทับของเดิม · หลายหน้า = หน้าอื่นไม่มีไฟล์ให้ยืม) → ไม่เข้าเงื่อนไขคืน null (ยังเป็นช่อง "รูปหาย")
 * ข้อจำกัด: ขยับ/ครอปรูปเกินกรอบเดิมไม่ได้ (ส่วนที่ล้นกรอบไม่มีในไฟล์พร้อมพิมพ์)
 */
export async function standInFromRender(d: SavedCalDesign, files: File[]): Promise<{ files: File[]; design: CalDesign } | null> {
  if (d.calBackFiles?.length || d.design.text || d.design.elements?.length || !d.artUrl) return null;
  const used = Object.entries(d.design.photos).filter(([, o]) => o.src >= 0);
  if (used.length !== 1) return null;
  const [key, o] = used[0];
  if (!files[o.src] || !isMissingPhoto(files[o.src])) return null;
  const m = /กรอบ ([\d.]+)×([\d.]+)mm/.exec(d.spec);
  const W = Number(m?.[1]);
  const H = Number(m?.[2]);
  if (!(W > 0 && H > 0)) return null;
  try {
    const r = await fetch(d.artUrl);
    if (!r.ok) return null;
    const b = await r.blob();
    const f = new File([b], `ไฟล์พร้อมพิมพ์แทนต้นฉบับ-${o.src + 1}.jpg`, { type: b.type || "image/jpeg" });
    rememberSource(f, d.artUrl);
    /**
     * ช่องรูปที่ลูกค้าลากขยายเลยขอบผืน (OD-261019-1860 ช่อง 207.7×134.9 บนผืน 178.3×127.5) → ตัดให้อยู่ในผืน
     * ส่วนที่เลยผืนไม่ได้พิมพ์อยู่แล้ว · ไม่ตัด = จอเด้ง "รูปยังไม่เต็มช่อง" ทั้งที่เต็มผืน (🔁 ทำไฟล์อัตโนมัติค้างที่กล่องถาม)
     */
    const sl = d.design.slots?.[key];
    const clip = (r: { x: number; y: number; w: number; h: number }) => {
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y };
    };
    return {
      files: files.map((x, i) => (i === o.src ? f : x)),
      // แต่งรูป (กลับด้าน/ความทึบ/เอฟเฟกต์/ขอบ) อยู่ในไฟล์พร้อมพิมพ์แล้ว — ไม่ใส่ซ้ำ
      design: {
        ...d.design,
        photos: { ...d.design.photos, [key]: { src: o.src, pl: { cxMm: W / 2, cyMm: H / 2, wMm: W, hMm: H, rotDeg: 0 } } },
        ...(sl ? { slots: { ...d.design.slots, [key]: clip(sl) } } : {}),
      },
    };
  } catch {
    return null;
  }
}

/** รูปแทน "รูปหาย" ที่ระบบใส่ให้ — ไม่ต้องอัปขึ้นเซิร์ฟเวอร์ (คงเป็นช่องว่างให้รู้ว่าต้องใส่รูปใหม่) */
export function isMissingPhoto(f: File): boolean {
  return f.name.startsWith(MISSING_PREFIX);
}
const MISSING_PREFIX = "รูปหาย-";

/** รูปแทนต้นฉบับที่หาย — สีเทา + ข้อความ ให้เห็นชัดว่าช่องนี้ต้องใส่รูปใหม่ */
async function missingPhoto(i: number): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const g = c.getContext("2d")!;
  g.fillStyle = "#cbd5e1";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#475569";
  g.font = "bold 72px sans-serif";
  g.textAlign = "center";
  g.fillText(`รูปต้นฉบับที่ ${i + 1} หาย`, 600, 430);
  g.font = "48px sans-serif";
  g.fillText("ใส่รูปใหม่ในช่องนี้", 600, 520);
  const b = await new Promise<Blob>((res) => c.toBlob((x) => res(x!), "image/jpeg", 0.85));
  return new File([b], `${MISSING_PREFIX}${i + 1}.jpg`, { type: "image/jpeg" });
}

/**
 * ✏️ ฝากแบบไว้บนเซิร์ฟเวอร์ด้วย (ลิงก์ติดไปกับออเดอร์ · CAL_EDIT_TAG) — หลังบ้านเปิดแบบที่ลูกค้าทำกลับมาแก้ได้
 * (ผู้ใช้สั่ง 15 ต.ค. 69 "เพิ่มลิ้งค์ที่ลูกค้าออกแบบบนเว็บ เพราะบางครั้งต้องแก้ไข") · อัปไม่ขึ้น = undefined ไม่ขวางการสั่ง
 */
export async function uploadCalDesign(d: SavedCalDesign): Promise<string | undefined> {
  try {
    const res = await fetch("/api/orders/cal-design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: 1, ...d }),
    });
    const j = (await res.json().catch(() => null)) as { url?: string } | null;
    return res.ok && j?.url ? j.url : undefined;
  } catch {
    return undefined;
  }
}

/** อ่านแบบที่ฝากไว้ (จากลิงก์ในสเปคออเดอร์) — ไม่ใช่แบบปฏิทิน/โหลดไม่ได้ = null */
export async function fetchCalDesign(url: string): Promise<SavedCalDesign | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as SavedCalDesign & { v?: number };
    return j?.v === 1 && typeof j.format === "string" && Array.isArray(j.sourceUrls) ? j : null;
  } catch {
    return null;
  }
}

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
 * ดึงรูปต้นฉบับกลับมาเป็นไฟล์ · ทุกรูปหาย = null (ใช้แค่ไฟล์ที่ประกอบแล้ว)
 * หายบางรูป (อัปไม่ขึ้นตอนสั่ง เช่น ติดโควตาอัปโหลด) → ใส่รูปแทน "รูปหาย" เฉพาะช่องนั้น ที่เหลือเปิดแบบเดิมได้
 * (เดิมหายรูปเดียวทิ้งทั้งแบบ — OD-261015-7971 ต้นฉบับขึ้น 5/14 เปิดแก้ไม่ได้เลย · 15 ต.ค. 69)
 */
export async function fetchSources(urls: string[]): Promise<File[] | null> {
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
  if (!got.some(Boolean)) return null;
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

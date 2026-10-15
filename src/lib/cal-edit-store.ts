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

/** ดึงรูปต้นฉบับกลับมาเป็นไฟล์ (ไม่ครบ = null — เปิดแบบเดิมไม่ได้ ใช้แค่ไฟล์ที่ประกอบแล้ว) */
export async function fetchSources(urls: string[]): Promise<File[] | null> {
  try {
    return await Promise.all(
      urls.map(async (u, i) => {
        if (!u) throw new Error("missing");
        const r = await fetch(u);
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.blob();
        return new File([b], decodeURIComponent(u.split("/").pop() || `รูป-${i + 1}`), { type: b.type || "image/jpeg" });
      }),
    );
  } catch {
    return null;
  }
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

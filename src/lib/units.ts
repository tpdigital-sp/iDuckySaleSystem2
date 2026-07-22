"use client";

/**
 * คลังหน่วยขนาด (ส่วนกลาง) — จัดการหน่วยที่ใช้ในงาน "กำหนดขนาดเอง" ที่เดียว
 * แล้วทุกสินค้าดึงไปโชว์ใน dropdown · เก็บใน localStorage (แชร์ทุกสินค้าในเบราว์เซอร์นี้)
 * ตอนบันทึกสินค้า จะ "อบ" ค่า toMeter ติดไปกับสินค้า (custom.unitToMeter) ให้คิดราคาได้เองแม้คลังเปลี่ยน
 */

export interface CustomUnit {
  /** ป้ายหน่วย เช่น "ซม." "หลา" — ใช้เป็น id ด้วย (ห้ามซ้ำ) */
  label: string;
  /** 1 หน่วยนี้ = กี่เมตร (ใช้แปลงเป็นพื้นที่ ตร.ม.) */
  toMeter: number;
  /** หน่วยตั้งต้น (ลบไม่ได้) */
  builtin?: boolean;
}

/** หน่วยตั้งต้น — ครอบคลุมงานพิมพ์/ผ้าทั่วไป */
export const DEFAULT_UNITS: CustomUnit[] = [
  { label: "ซม.", toMeter: 0.01, builtin: true },
  { label: "นิ้ว", toMeter: 0.0254, builtin: true },
  { label: "เมตร", toMeter: 1, builtin: true },
  { label: "ฟุต", toMeter: 0.3048, builtin: true },
  { label: "หลา", toMeter: 0.9144, builtin: true },
  { label: "มม.", toMeter: 0.001, builtin: true },
];

const KEY = "iducky-units-v1";

/** อ่านคลังหน่วย: หน่วยตั้งต้น + หน่วยที่ผู้ใช้เพิ่ม (ลบ default ที่ผู้ใช้เลือกซ่อนออก) */
export function loadUnits(): CustomUnit[] {
  if (typeof window === "undefined") return DEFAULT_UNITS;
  let extra: CustomUnit[] = [];
  let hidden: string[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    extra = Array.isArray(raw.extra) ? raw.extra : [];
    hidden = Array.isArray(raw.hidden) ? raw.hidden : [];
  } catch {
    /* เสียหาย → ใช้ตั้งต้น */
  }
  const defaults = DEFAULT_UNITS.filter((u) => !hidden.includes(u.label));
  // ผู้ใช้เพิ่มทับ label เดิมได้ (แทนที่)
  const extraLabels = new Set(extra.map((u) => u.label));
  return [...defaults.filter((u) => !extraLabels.has(u.label)), ...extra];
}

function save(extra: CustomUnit[], hidden: string[]) {
  localStorage.setItem(KEY, JSON.stringify({ extra, hidden }));
}

function readRaw(): { extra: CustomUnit[]; hidden: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { extra: Array.isArray(raw.extra) ? raw.extra : [], hidden: Array.isArray(raw.hidden) ? raw.hidden : [] };
  } catch {
    return { extra: [], hidden: [] };
  }
}

/** เพิ่ม/แก้หน่วย (label ซ้ำ = อัปเดต toMeter) */
export function upsertUnit(label: string, toMeter: number) {
  const l = label.trim();
  if (!l || !(toMeter > 0)) return;
  const { extra, hidden } = readRaw();
  const next = extra.filter((u) => u.label !== l);
  next.push({ label: l, toMeter });
  save(next, hidden.filter((h) => h !== l));
}

/** ลบหน่วย — ผู้ใช้เพิ่มเอง=ลบออก · หน่วยตั้งต้น=ซ่อน */
export function removeUnit(label: string) {
  const { extra, hidden } = readRaw();
  const isBuiltin = DEFAULT_UNITS.some((u) => u.label === label);
  if (isBuiltin) {
    if (!hidden.includes(label)) save(extra, [...hidden, label]);
  } else {
    save(extra.filter((u) => u.label !== label), hidden);
  }
}

/** หา toMeter ของหน่วยตาม label (ไม่เจอ → 0.01) */
export function unitToMeter(label: string): number {
  return loadUnits().find((u) => u.label === label)?.toMeter ?? 0.01;
}

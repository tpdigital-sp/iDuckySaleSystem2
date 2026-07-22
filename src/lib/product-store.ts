"use client";

/**
 * ที่เก็บการแก้ไขสินค้าฝั่งเบราว์เซอร์ (โหมดเดโม ยังไม่มีฐานข้อมูล)
 * - การแก้ไขจากหลังบ้านถูกเก็บเป็น "override" ราย id ใน localStorage
 * - หน้าร้านอ่านข้อมูลผ่าน mergedProducts() → เห็นผลการแก้ไขจริงในเบราว์เซอร์เดียวกัน
 * - เมื่อย้ายไปฐานข้อมูลจริง แทนที่ไฟล์นี้ด้วยการเรียก API ได้เลย
 */

import { PRODUCTS, type Product } from "./products";

const OVERRIDE_KEY = "iducky-product-overrides-v1";
const DELETED_KEY = "iducky-product-deleted-v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadOverrides(): Record<string, Product> {
  if (typeof window === "undefined") return {};
  return safeParse(localStorage.getItem(OVERRIDE_KEY), {});
}

export function loadDeletedIds(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(DELETED_KEY), []);
}

export function saveOverride(product: Product): void {
  const all = loadOverrides();
  all[product.id] = product;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
}

export function resetOverride(id: string): void {
  const all = loadOverrides();
  delete all[id];
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  localStorage.setItem(DELETED_KEY, JSON.stringify(loadDeletedIds().filter((d) => d !== id)));
}

export function markDeleted(id: string): void {
  const ids = new Set(loadDeletedIds());
  ids.add(id);
  localStorage.setItem(DELETED_KEY, JSON.stringify([...ids]));
}

export function resetAll(): void {
  localStorage.removeItem(OVERRIDE_KEY);
  localStorage.removeItem(DELETED_KEY);
}

export function hasOverride(id: string): boolean {
  return id in loadOverrides();
}

/** สินค้าทั้งหมดหลังรวมการแก้ไข (ตัดตัวที่ถูกลบออก) */
export function mergedProducts(): Product[] {
  const overrides = loadOverrides();
  const deleted = new Set(loadDeletedIds());
  return PRODUCTS.filter((p) => !deleted.has(p.id)).map((p) => overrides[p.id] ?? p);
}

/** สินค้ารายตัวหลังรวมการแก้ไข */
export function mergedProduct(id: string): Product | undefined {
  return mergedProducts().find((p) => p.id === id);
}

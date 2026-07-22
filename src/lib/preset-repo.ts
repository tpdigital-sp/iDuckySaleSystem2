"use client";

/**
 * ชั้นเข้าถึงคลังตัวเลือก — เลือกอัตโนมัติระหว่าง Supabase (ตั้งค่าคีย์แล้ว) กับโหมดเดโม (localStorage)
 * เลียนแบบแพตเทิร์นของ product-repo เพื่อความสม่ำเสมอ
 */
import { getSupabase } from "./supabase";
import { DEFAULT_PRESETS, type OptionPreset } from "./option-presets";
import {
  deletePresetLocal,
  loadPresetsLocal,
  upsertPresetLocal,
} from "./preset-store";

/** ดึงคลังทั้งหมด (Supabase → ตาราง option_presets; ไม่มีคีย์ → localStorage/ตั้งต้น) */
export async function fetchPresets(): Promise<OptionPreset[]> {
  const sb = getSupabase();
  if (!sb) return loadPresetsLocal();
  const { data, error } = await sb
    .from("option_presets")
    .select("data")
    .order("label", { ascending: true });
  if (error || !data) return loadPresetsLocal();
  // ตารางว่าง (ยังไม่ seed) → ใช้คลังตั้งต้นไปก่อน เพื่อให้ editor มีของให้ลิงก์
  if (data.length === 0) return DEFAULT_PRESETS;
  // กรอง reserved id (เช่น __shop_payment__ ที่เก็บตั้งค่าร้านในตารางเดียวกัน) ออกจากคลังตัวเลือก
  return data.map((r) => r.data as OptionPreset).filter((p) => p && !p.id?.startsWith("__"));
}

/** บันทึก/อัปเดตคลังหนึ่งรายการ — ผ่าน API route (ตรวจสิทธิ์+เขียน Supabase); ยังไม่ตั้งค่า → localStorage */
export async function persistPreset(
  preset: OptionPreset
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/option-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    });
    if (res.status === 503) {
      try {
        upsertPresetLocal(preset);
        return { ok: true };
      } catch {
        return { ok: false, error: "storage-full" };
      }
    }
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "บันทึกไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลบคลังหนึ่งรายการ — /api/admin/option-presets?id=xxx */
export async function deletePreset(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/admin/option-presets?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.status === 503) {
      deletePresetLocal(id);
      return true;
    }
    return res.ok;
  } catch {
    return false;
  }
}

"use client";

/**
 * ที่เก็บคลังตัวเลือกฝั่งเบราว์เซอร์ (โหมดเดโม — ยังไม่ตั้งค่า Supabase)
 * เก็บทั้งลิสต์เป็นก้อนเดียวใน localStorage · ยังไม่เคยบันทึก → คืนคลังตั้งต้น (DEFAULT_PRESETS)
 */
import { DEFAULT_PRESETS, type OptionPreset } from "./option-presets";

const PRESET_KEY = "iducky-option-presets-v1";

export function loadPresetsLocal(): OptionPreset[] {
  if (typeof window === "undefined") return DEFAULT_PRESETS;
  const raw = localStorage.getItem(PRESET_KEY);
  if (!raw) return DEFAULT_PRESETS;
  try {
    const arr = JSON.parse(raw) as OptionPreset[];
    return Array.isArray(arr) ? arr : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresetsLocal(presets: OptionPreset[]): void {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

export function upsertPresetLocal(preset: OptionPreset): void {
  const all = loadPresetsLocal();
  const i = all.findIndex((p) => p.id === preset.id);
  if (i >= 0) all[i] = preset;
  else all.push(preset);
  savePresetsLocal(all);
}

export function deletePresetLocal(id: string): void {
  savePresetsLocal(loadPresetsLocal().filter((p) => p.id !== id));
}

export function resetPresetsLocal(): void {
  localStorage.removeItem(PRESET_KEY);
}

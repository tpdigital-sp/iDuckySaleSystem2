"use client";

/**
 * ชั้นเข้าถึงคลังเทมเพลตไฟล์งาน — แพตเทิร์นเดียวกับ preset-repo
 * เก็บเป็นแถวพิเศษ category "__templates__" ในตาราง products
 * (Supabase ไม่มีตารางแยก — ใช้วิธีเดียวกับคลังตัวเลือก/ตั้งค่าร้าน/บทความ)
 */
import { getSupabase } from "./supabase";
import { sortTemplates, type DesignTemplate } from "./design-templates";

const LOCAL_KEY = "iducky-templates-v1";

/** โหมดเดโม (ยังไม่ตั้งคีย์ Supabase) — เก็บในเบราว์เซอร์ไปก่อน */
function loadLocal(): DesignTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as DesignTemplate[];
    return Array.isArray(arr) ? sortTemplates(arr.filter((t) => t?.id && t.name)) : [];
  } catch {
    return [];
  }
}

function saveLocal(list: DesignTemplate[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {}
}

/** คลังทั้งหมด (หน้าร้านก็เรียกได้ — ตาราง products อ่านสาธารณะอยู่แล้ว) */
export async function fetchTemplates(): Promise<DesignTemplate[]> {
  const sb = getSupabase();
  if (!sb) return loadLocal();
  const { data, error } = await sb.from("products").select("data").eq("category", "__templates__");
  if (error || !data) return loadLocal();
  return sortTemplates((data.map((r) => r.data) as DesignTemplate[]).filter((t) => t?.id && t.name));
}

/** บันทึก/อัปเดตเทมเพลตหนึ่งรายการ (ผ่าน API — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์) */
export async function persistTemplate(t: DesignTemplate): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (res.status === 503) {
      const list = loadLocal().filter((x) => x.id !== t.id);
      saveLocal([...list, t]);
      return { ok: true };
    }
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? "บันทึกไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลบเทมเพลต (ไฟล์ใน storage ถูกลบตามไปด้วยฝั่งเซิร์ฟเวอร์) */
export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.status === 503) {
      saveLocal(loadLocal().filter((x) => x.id !== id));
      return { ok: true };
    }
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? "ลบไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/**
 * รายชื่อหมวดหมู่ของคลัง (ที่แอดมินตั้งไว้เอง)
 * เก็บเป็นแถวพิเศษ __template_cats__ · รวมกับหมวดที่ชุดต่าง ๆ ใช้อยู่จริงตอนแสดงผล
 * (เผื่อข้อมูลเก่าที่พิมพ์หมวดไว้ก่อนมีระบบตั้งค่า จะได้ไม่หาย)
 */
export async function fetchTemplateCategories(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) {
    try {
      const arr = JSON.parse(localStorage.getItem(`${LOCAL_KEY}-cats`) ?? "[]") as string[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  const { data } = await sb.from("products").select("data").eq("id", "__template_cats__").maybeSingle();
  const cats = (data?.data as { categories?: unknown } | undefined)?.categories;
  return Array.isArray(cats) ? cats.map((c) => String(c)).filter(Boolean) : [];
}

/** บันทึกรายชื่อหมวดหมู่ (ทั้งชุด — ลำดับตามที่ส่งมา) */
export async function persistTemplateCategories(cats: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: cats }),
    });
    if (res.status === 503) {
      try {
        localStorage.setItem(`${LOCAL_KEY}-cats`, JSON.stringify(cats));
      } catch {}
      return { ok: true };
    }
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? "บันทึกหมวดไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** อัปโหลดไฟล์เทมเพลต (.ai ฯลฯ) หรือรูปตัวอย่าง → คืน url สาธารณะ */
export async function uploadTemplateFile(
  file: File,
  kind: "file" | "preview"
): Promise<{ ok: boolean; url?: string; name?: string; size?: number; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/admin/templates/upload", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as {
      url?: string;
      name?: string;
      size?: number;
      error?: string;
    };
    return res.ok && j.url
      ? { ok: true, url: j.url, name: j.name, size: j.size }
      : { ok: false, error: j.error ?? "อัปโหลดไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * 🆔 คลังเลขห้องแชท LINE ที่ OA ร้านเคยได้ยิน — ไว้หา groupId ของ "ไลน์กลุ่ม" มาใส่ LINE_STOCK_ALERT_TO
 *
 * LINE ไม่มี API ให้ถามว่า "OA อยู่ในกลุ่มไหนบ้าง" — รู้เลขกลุ่มได้ทางเดียวคือรับ webhook
 * ตอนมีคนพิมพ์ในกลุ่ม (หรือตอนเชิญ OA เข้ากลุ่ม) แล้วอ่าน event.source.groupId
 * → /api/line/webhook จดไว้ที่นี่ แล้วแอดมินไปคัดลอกที่ /admin/line-groups
 *
 * เก็บเป็นแถวพิเศษในตาราง products (วิธีเดียวกับ __shop_payment__ / __dealers__) ไม่ต้องรัน SQL
 * ⚠️ แถวในตาราง products อ่าน public ได้ (RLS เปิด select) — เก็บแค่เลขห้องกับชื่อกลุ่ม
 *    ห้ามเก็บข้อความที่คนพิมพ์ · เลขห้องอย่างเดียวส่งข้อความไม่ได้ ต้องมี access token ของ OA ด้วย
 *    คัดลอกไปใส่ Netlify แล้วกด "ล้างรายการ" ทิ้งได้เลย
 */
export const LINE_SOURCES_ID = "__line_sources__";

/** เก็บสูงสุดกี่ห้อง (ห้องใหม่ดันห้องเก่าสุดออก) */
const MAX = 8;

export interface LineSource {
  /** group = ไลน์กลุ่ม · room = ห้องแบบเก่า · user = แชทเดี่ยว */
  type: "group" | "room" | "user";
  /** เลขที่เอาไปใส่ LINE_STOCK_ALERT_TO ได้เลย (ขึ้นต้น C = กลุ่ม · U = คนเดียว) */
  id: string;
  /** ชื่อกลุ่มจาก LINE (ถามได้เฉพาะกลุ่ม) — ไม่ได้ก็เว้นไว้ */
  name?: string;
  /** ได้ยินครั้งล่าสุดเมื่อไหร่ (ISO) */
  at: string;
  /** ลายเซ็น x-line-signature ตรงไหม — ไม่ตรง/ไม่ได้ตั้ง channel secret = อย่าเพิ่งเชื่อ */
  verified: boolean;
}

export async function loadLineSources(): Promise<LineSource[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("products").select("data").eq("id", LINE_SOURCES_ID).maybeSingle();
  const rows = (data?.data as { sources?: LineSource[] } | undefined)?.sources;
  return Array.isArray(rows) ? rows : [];
}

/** จดห้องที่เพิ่งได้ยิน — ห้องเดิมอัปเดตเวลา/ชื่อ ไม่เพิ่มซ้ำ */
export async function rememberLineSources(found: LineSource[]): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb || found.length === 0) return;
  const old = await loadLineSources();
  const merged = [...found];
  for (const o of old) if (!merged.some((n) => n.id === o.id)) merged.push(o);
  // ⚠️ ตาราง products บังคับ name/category/price — ใส่ไม่ครบ upsert เงียบ ๆ ไม่เข้า (เหมือน __dealers__)
  await sb.from("products").upsert(
    {
      id: LINE_SOURCES_ID,
      name: "(ตั้งค่าระบบ — เลขห้องแชท LINE)",
      category: "__settings__",
      price: 0,
      data: { sources: merged.slice(0, MAX) },
    },
    { onConflict: "id" },
  );
}

export async function clearLineSources(): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("products").upsert(
    {
      id: LINE_SOURCES_ID,
      name: "(ตั้งค่าระบบ — เลขห้องแชท LINE)",
      category: "__settings__",
      price: 0,
      data: { sources: [] },
    },
    { onConflict: "id" },
  );
}

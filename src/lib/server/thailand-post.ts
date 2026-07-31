import "server-only";

/**
 * เชื่อมสถานะพัสดุกับ Track & Trace ของไปรษณีย์ไทย (trackapi.thailandpost.co.th)
 * ตั้งค่า THAILANDPOST_TRACK_TOKEN ใน .env.local (สมัครฟรีที่ track.thailandpost.co.th → Developer)
 *
 * ยังไม่ตั้ง token → คืน configured:false ให้หน้าเว็บโชว์ลิงก์ไปเช็คที่เว็บ ปณ. แทน (ใช้งานได้ทันที)
 */

export interface ThpEvent {
  /** รหัสสถานะ ปณ. เช่น 501 = นำจ่ายสำเร็จ */
  status: string;
  description: string;
  location?: string;
  /** เวลาตามรูปแบบ ปณ. เช่น "20/07/2569 14:20:22+07:00" (วันที่ พ.ศ.) */
  at: string;
}

export interface ThpResult {
  configured: boolean;
  events?: ThpEvent[];
  error?: string;
}

/** เลขพัสดุรูปแบบไปรษณีย์ไทย เช่น EY145587896TH */
export const isThaiPostNumber = (n: string): boolean => /^[A-Z]{2}\d{9}TH$/i.test(n.trim());

export const thailandPostConfigured = (): boolean => !!process.env.THAILANDPOST_TRACK_TOKEN;

// token ใช้งาน (Bearer) หมดอายุเป็นรอบ — cache ใน memory ต่อ process
let bearerCache: { token: string; expireAt: number } | null = null;
// ผลตาม barcode — cache 5 นาที กันยิง API ถี่เกิน (ปณ. จำกัดโควตา/วัน)
const trackCache = new Map<string, { at: number; result: ThpResult }>();

async function getBearer(): Promise<string | null> {
  const key = process.env.THAILANDPOST_TRACK_TOKEN;
  if (!key) return null;
  if (bearerCache && Date.now() < bearerCache.expireAt) return bearerCache.token;
  try {
    const res = await fetch("https://trackapi.thailandpost.co.th/post/api/v1/authenticate/token", {
      method: "POST",
      headers: { Authorization: `Token ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => null)) as { token?: string; expire?: string } | null;
    if (!res.ok || !j?.token) return null;
    // expire เป็นเวลาจริงจาก ปณ. — เผื่อ parse ไม่ได้ใช้ 12 ชม. (token ปณ. อายุ ~1 เดือน แต่ refresh บ่อยไม่เสียหาย)
    const exp = j.expire ? Date.parse(j.expire) : NaN;
    bearerCache = { token: j.token, expireAt: Number.isFinite(exp) ? exp - 60_000 : Date.now() + 12 * 3600_000 };
    return j.token;
  } catch {
    return null;
  }
}

export async function trackThailandPost(barcode: string): Promise<ThpResult> {
  const code = barcode.trim().toUpperCase();
  if (!thailandPostConfigured()) return { configured: false };

  const cached = trackCache.get(code);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.result;

  const bearer = await getBearer();
  if (!bearer) return { configured: true, error: "เชื่อมต่อระบบ ปณ. ไม่ได้ (token ใช้ไม่ได้/หมดโควตา)" };

  try {
    // เอกสาร ปณ. ใช้ scheme "Token <token>" — บางเวอร์ชันรับ "Bearer" · ลอง Token ก่อน ไม่ผ่านค่อย Bearer
    const call = (scheme: string) =>
      fetch("https://trackapi.thailandpost.co.th/post/api/v1/track", {
        method: "POST",
        headers: { Authorization: `${scheme} ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "all", language: "TH", barcode: [code] }),
        signal: AbortSignal.timeout(15_000),
      });
    let res = await call("Token");
    if (res.status === 401 || res.status === 403) res = await call("Bearer");
    const j = (await res.json().catch(() => null)) as {
      response?: { items?: Record<string, { status?: string; status_description?: string; status_date?: string; location?: string }[]> };
      message?: string;
    } | null;
    if (!res.ok) return { configured: true, error: `ปณ. ตอบกลับผิดปกติ (${j?.message ?? res.status})` };

    const raw = j?.response?.items?.[code] ?? [];
    const events: ThpEvent[] = raw.map((e) => ({
      status: String(e.status ?? ""),
      description: e.status_description ?? "",
      location: e.location || undefined,
      at: e.status_date ?? "",
    }));
    const result: ThpResult = { configured: true, events };
    trackCache.set(code, { at: Date.now(), result });
    return result;
  } catch {
    return { configured: true, error: "เชื่อมต่อระบบ ปณ. ไม่ได้" };
  }
}

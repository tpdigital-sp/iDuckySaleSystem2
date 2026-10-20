/**
 * 🧠 ทางผ่าน Gemini ให้บอท n8n "คิดน้อยลง" (เจ้าของร้าน 20 ต.ค. 69 "ปรับบอทตอบให้เร็วขึ้น" → เลือก "ลดการคิดของ Gemini")
 *
 * ปัญหา: AI Agent ใน n8n (ChatBot · Gemini 3.8 Flash) คิดก่อนตอบ 450–680 token ทุกครั้ง → เรียก 2 รอบ/คำตอบ ~7–10 วิต่อรอบ
 *   แต่โหนด Google Gemini Chat Model ของ n8n ไม่มีช่องตั้ง thinking (มีแค่ maxOutputTokens/temperature/topK/topP)
 * ทางแก้: ช่อง Host ของ credential "Google Gemini(PaLM) Api account" ใน n8n ชี้มาที่นี่
 *   https://iduckystore.com/api/bot/gemini-proxy  → ส่งต่อไป generativelanguage.googleapis.com เหมือนเดิมทุกอย่าง
 *   ยกเว้นเติม generationConfig.thinkingConfig = { thinkingLevel: "low" } เมื่อคำขอไม่ได้ตั้งเอง
 *   ทดสอบเคสจริง "รับทำอะคริลิคด่วนไหมคะ": 7–10 วิ → ~3 วิ ต่อรอบ คำตอบเท่าเดิม
 *
 * ไม่เก็บกุญแจ — ใช้กุญแจที่ n8n ส่งมาใน header x-goog-api-key (หรือ ?key=) ส่งต่อตรง ๆ
 * รับเฉพาะ v1beta/models/gemini-*:generateContent | streamGenerateContent (ไม่ใช่ทางผ่านทั่วไป)
 * ตอบแบบสตรีม (alt=sse) ก็ส่งต่อเป็นสตรีม
 */
export const dynamic = "force-dynamic";

const UPSTREAM = "https://generativelanguage.googleapis.com";
const ALLOWED = /^v1beta\/models\/(gemini-[\w.-]+):(generateContent|streamGenerateContent)$/;

function thinkingFor(model: string): Record<string, unknown> | null {
  if (/^gemini-3/.test(model)) return { thinkingLevel: "low" };
  if (/^gemini-2\.5-(flash|pro)/.test(model)) return { thinkingBudget: 512 };
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = (path ?? []).join("/");
  const m = ALLOWED.exec(p);
  if (!m) return Response.json({ error: { code: 404, message: "not allowed" } }, { status: 404 });
  const u = new URL(req.url);
  const key = req.headers.get("x-goog-api-key") || u.searchParams.get("key") || "";
  if (!key) return Response.json({ error: { code: 401, message: "missing api key" } }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: { code: 400, message: "invalid json" } }, { status: 400 });
  }
  const gc = body.generationConfig && typeof body.generationConfig === "object" ? { ...(body.generationConfig as Record<string, unknown>) } : {};
  const think = thinkingFor(m[1]);
  if (think && !gc.thinkingConfig) gc.thinkingConfig = think;
  body.generationConfig = gc;

  const up = new URL(`${UPSTREAM}/${p}`);
  for (const [k, v] of u.searchParams) if (k !== "key") up.searchParams.set(k, v);
  const res = await fetch(up, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store", "x-gemini-proxy": think ? "thinking-low" : "pass" },
  });
}

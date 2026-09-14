import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { rememberLineSources, type LineSource } from "@/lib/server/line-sources";
import { alertBotUserId, alertToken } from "@/lib/server/line-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 📬 ปลายทาง webhook ของ "บัญชีแจ้งเตือน" — มีไว้หาเลขห้องแชทอย่างเดียว
 *
 * ใช้ตอนตั้งให้ข้อความแจ้งร้าน (ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน) เข้าไลน์กลุ่ม:
 * LINE ไม่มี API ให้ถามว่าบัญชีอยู่ในกลุ่มไหน/กลุ่มนั้นเลขอะไร ต้องให้ LINE ยิง event มาบอกเองเท่านั้น
 * จดไว้แล้วแอดมินไปกดเลือกเป็นปลายทางที่ /admin/line-groups
 *
 * ⚠️ **ห้ามเอา URL นี้ไปใส่ใน channel ของบัญชีร้านที่ลูกค้าทัก** (iDuckyshop) — บอทตอบแชทอยู่ที่ n8n
 *    ใส่แล้วข้อความลูกค้าจะมาตายที่นี่ บอทเงียบทันที เส้นนี้ไม่ส่งต่อให้ใคร (เจตนา)
 *    ใส่เฉพาะ channel ของบัญชีแจ้งเตือนซึ่งไม่มีลูกค้าคุยด้วย
 *
 * 🔒 เส้นนี้ต้องเปิดรับจากใครก็ได้ (LINE ยิงมาโดยไม่ล็อกอิน) จึงกันของปลอม 2 ชั้น:
 *    1. ยังไม่ได้ตั้ง token ของบัญชีแจ้งเตือน = ไม่จดอะไรเลย
 *    2. ตั้งแล้ว = จดเฉพาะ event ที่ destination ตรงกับ userId ของบัญชีนั้น
 *    คนนอกที่ยิง JSON มั่ว ๆ เข้ามาจึงเขียนอะไรลงฐานข้อมูลไม่ได้
 *
 * ⚠️ ต้องตอบ 200 เร็ว ๆ เสมอ ไม่งั้น LINE มองว่า endpoint เสียแล้วปิด webhook ให้เอง
 *    และห้าม void งานที่ต้องทำ — Netlify แช่ฟังก์ชันทันทีที่ตอบกลับ งานค้างจะไม่ได้ทำ
 */

/** ลายเซ็นตรงกับ channel secret ไหม — ไม่ได้ตั้ง secret = ตรวจไม่ได้ (คืน false ไว้ก่อน) */
function signatureOk(raw: string, signature: string | null): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const mine = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(mine);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** ชื่อกลุ่มจาก LINE — ถามได้เฉพาะบัญชีที่อยู่ในกลุ่มนั้น ได้ชื่อ = ยืนยันว่าส่งเข้ากลุ่มได้แน่ */
async function groupName(groupId: string, token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { groupName?: string }).groupName;
  } catch {
    return undefined;
  }
}

interface LineEvent {
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  try {
    const raw = await req.text();
    const token = await alertToken();
    // ยังไม่ได้ตั้งบัญชีแจ้งเตือน = ไม่มีอะไรให้จด (และกันคนนอกเขียนของมั่วลงฐาน)
    if (!token) return NextResponse.json({ ok: true });

    const body = JSON.parse(raw) as { events?: LineEvent[]; destination?: string };
    const mine = await alertBotUserId();
    // event ของบัญชีอื่น (หรือของปลอม) — ไม่จด เพราะเลขห้องของบัญชีอื่นเอามาใช้ส่งไม่ได้อยู่ดี
    if (!body.destination || !mine || body.destination !== mine) return NextResponse.json({ ok: true });

    const verified = signatureOk(raw, signature);
    const at = new Date().toISOString();
    const seen = new Map<string, LineSource>();
    for (const ev of body.events ?? []) {
      const s = ev.source;
      if (!s) continue;
      const id = s.groupId ?? s.roomId ?? s.userId;
      const type = s.groupId ? "group" : s.roomId ? "room" : s.userId ? "user" : null;
      if (!id || !type) continue;
      seen.set(id, { type, id, at, verified, dest: body.destination });
    }
    const rows = [...seen.values()];
    if (rows.length > 0) {
      await Promise.all(
        rows.filter((r) => r.type === "group").map(async (r) => {
          r.name = await groupName(r.id, token);
        }),
      );
      await rememberLineSources(rows);
    }
  } catch {
    /* body ไม่ใช่ JSON / จดไม่ได้ — ยังต้องตอบ 200 ไม่งั้น LINE ปิด webhook ให้เอง */
  }
  return NextResponse.json({ ok: true });
}

/** ปุ่ม Verify ใน LINE console ยิง GET/POST มาเช็คว่า endpoint มีจริง */
export function GET() {
  return NextResponse.json({ ok: true, note: "LINE webhook ของ iDucky — ใช้หาเลขห้องแชทของบัญชีแจ้งเตือน" });
}

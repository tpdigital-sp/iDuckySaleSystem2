import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { loadChatIds, loadOaOwnerId } from "@/lib/server/line-chat";
import {
  cookieHint,
  DEFAULT_TAG_NAMES,
  loadOaConfig,
  peekOaTagged,
  probeOa,
  probeOaMessages,
  saveOaConfig,
} from "@/lib/server/line-oa-manager";

export const runtime = "nodejs";

/**
 * 🔌 ตั้งค่าการเชื่อม LINE OA Manager (คุกกี้ + ชื่อป้ายที่ดึง) ของหน้า /admin/line-customers
 *
 *  · GET  — สถานะ (ตั้งคุกกี้แล้วไหม · ป้ายที่ตั้ง · ผลดึงล่าสุด) — ไม่ส่งคุกกี้กลับ
 *  · POST config — บันทึกคุกกี้/ชื่อป้าย/เลข OA (สิทธิ์ตั้งค่าระบบเท่านั้น: คุกกี้ = ล็อกอิน OA ของร้าน)
 *  · POST probe  — ยิงทดสอบแล้วคืนผลดิบไว้ไล่ปัญหา
 *  · POST probe-messages {userId | chatId} — 🔌 ทดสอบดึงข้อความห้องเดียวจาก OA (หน้าแชทกด · 15 ต.ค. 69) คืนเส้นที่ตอบ + ฟิลด์ตัวอย่าง + ที่อ่านออก 5 ตัวท้าย
 *
 * การดึงป้ายจริงไปอยู่ใน GET /api/admin/line-customers/manage (พารามิเตอร์ oaTag) — คนละเส้น
 */

const VIEW_PERM = "orders.edit";
const EDIT_PERM = "settings.manage";

export interface OaStatus {
  configured: boolean;
  cookieHint: string;
  savedBy: string;
  savedAt: string;
  tagNames: string[];
  /** เลข OA ที่ตั้งทับ ("" = ใช้ค่าจากระบบแชท) */
  botId: string;
  /** เลข OA จากระบบแชท (settings/quick-setup) */
  oaOwnerId: string;
  /** ผลดึงล่าสุดที่แคชไว้ */
  last: { ok: boolean; error?: string; tags: { name: string; count: number }[]; ageMs: number } | null;
}

async function status(): Promise<OaStatus> {
  const db = getChatFirestore();
  const [cfg, oaOwnerId] = await Promise.all([loadOaConfig(true), db ? loadOaOwnerId(db) : Promise.resolve("")]);
  const last = peekOaTagged();
  return {
    configured: !!cfg?.cookie,
    cookieHint: cfg?.cookie ? cookieHint(cfg.cookie) : "",
    savedBy: cfg?.savedBy ?? "",
    savedAt: cfg?.savedAt ?? "",
    tagNames: cfg?.tagNames.length ? cfg.tagNames : DEFAULT_TAG_NAMES,
    botId: cfg?.botId ?? "",
    oaOwnerId,
    last: last ? { ok: last.ok, error: last.error, tags: last.tags, ageMs: Date.now() - last.fetchedAt } : null,
  };
}

export async function GET() {
  const gate = await requirePerm(VIEW_PERM);
  if (gate.res) return gate.res;
  try {
    return NextResponse.json(await status());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type Body = {
  action?: "config" | "probe" | "probe-messages";
  cookie?: string;
  tagNames?: string[] | string;
  botId?: string;
  /** probe-messages: userId ห้องในคลังแชท (ระบบหารหัสห้อง OA ให้) หรือ chatId ของ OA ตรง ๆ */
  userId?: string;
  chatId?: string;
};

export async function POST(req: Request) {
  const gate = await requirePerm(EDIT_PERM);
  if (gate.res) return gate.res;
  const b = (await req.json().catch(() => ({}))) as Body;
  const who = gate.actor.name || gate.actor.username;

  try {
    if (b.action === "config") {
      const patch: Parameters<typeof saveOaConfig>[0] = {};
      // ช่องคุกกี้ว่าง = ไม่แตะของเดิม (พนักงานแค่มาแก้ชื่อป้าย) · "ล้าง" ส่ง cookie: "-" มา
      if (typeof b.cookie === "string" && b.cookie.trim()) patch.cookie = b.cookie.trim() === "-" ? "" : b.cookie;
      if (b.tagNames !== undefined) patch.tagNames = Array.isArray(b.tagNames) ? b.tagNames : String(b.tagNames).split(/[,\n]/);
      if (typeof b.botId === "string") {
        const id = b.botId.trim();
        if (id && !/^U[0-9a-f]{32}$/i.test(id))
          return NextResponse.json({ error: "เลข OA ต้องเป็น U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว (ดูจากลิงก์ chat.line.biz/U…/)" }, { status: 400 });
        patch.botId = id;
      }
      await saveOaConfig(patch, who);
      return NextResponse.json({ ok: true, saved: "บันทึกการเชื่อม OA Manager แล้ว", status: await status() });
    }

    if (b.action === "probe") {
      const db = getChatFirestore();
      const oaOwnerId = db ? await loadOaOwnerId(db) : "";
      const probe = await probeOa(oaOwnerId);
      return NextResponse.json({ ok: probe.ok, probe });
    }

    if (b.action === "probe-messages") {
      const db = getChatFirestore();
      if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
      const userId = String(b.userId ?? "").trim();
      let chatId = String(b.chatId ?? "").trim();
      if (!chatId && /^U[0-9a-f]{32}$/.test(userId)) chatId = (await loadChatIds(db, true))[userId]?.id ?? "";
      if (chatId && !/^2?[A-Za-z][0-9a-f]{32}$/i.test(chatId)) return NextResponse.json({ error: "รหัสห้อง OA ไม่ถูกต้อง" }, { status: 400 });
      const probe = await probeOaMessages(await loadOaOwnerId(db), chatId);
      return NextResponse.json({ ok: probe.ok, probe });
    }

    return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

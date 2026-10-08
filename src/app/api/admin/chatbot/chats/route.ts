import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";

/**
 * 💬 แชท LINE ที่บอทเห็น — อ่านจาก Firestore `ordersure/line-conversations` (บอท n8n เขียน)
 *
 * เจ้าของร้าน 8 ต.ค. 69 18:45: "อยากให้บอทเริ่มตอบจากลูกค้าใหม่ก่อน และบันทึกแชทด้วย"
 *   · ห้องแชท 1 ห้อง = 1 ไอดี LINE (เอกสาร) · ข้อความครบทุกตัวอยู่ใน subcollection `log` (ลูกค้าพิมพ์ + บอทตอบ — แอดมินพิมพ์เองใน LINE ระบบไม่เห็น)
 *   · ใหม่/เก่า: `botScope` ที่บอทติดธงตอนข้อความแรกหลังเปิดโหมด (ห้องสร้างหลัง `settings/bot-whitelist.newSince` และไม่มีออเดอร์ = ใหม่)
 *     ห้องที่ยังไม่ติดธง → เทียบเวลาสร้างห้องกับ newSince
 *
 * GET ?limit=50&scope=new|old|all&q=ชื่อ        → รายการห้อง (ล่าสุดก่อน)
 * GET ?id=U…                                     → ห้องเดียว + log ทั้งหมด (fallback messages 20 ตัวล่าสุด)
 */
const COL = "line-conversations";

type Row = {
  id: string;
  displayName: string;
  pictureUrl: string;
  lastSeen: string;
  createdAt: string;
  messageCount: number;
  lastUserText: string;
  scope: "new" | "old";
  botScope: string;
  needsHumanFollowup: boolean;
};
type LogEntry = { role: string; text: string; at: string; type?: string; mode?: string };

function iso(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  return "";
}

async function botSettings(db: Firestore): Promise<{ mode: string; newSince: string; enabled: boolean }> {
  try {
    const d = await db.collection("settings").doc("bot-whitelist").get();
    const x = d.data() ?? {};
    return { mode: String(x.mode ?? ""), newSince: iso(x.newSince), enabled: x.enabled === true };
  } catch {
    return { mode: "", newSince: "", enabled: false };
  }
}

function toRow(id: string, x: Record<string, unknown>, createdAt: string, newSince: string): Row {
  const botScope = String(x.botScope ?? "");
  const scope: Row["scope"] = botScope === "new" || botScope === "old" ? botScope : newSince && createdAt && createdAt >= newSince ? "new" : "old";
  return {
    id,
    displayName: String(x.displayName ?? ""),
    pictureUrl: String(x.pictureUrl ?? ""),
    lastSeen: iso(x.lastSeen),
    createdAt,
    messageCount: Number(x.messageCount ?? 0) || 0,
    lastUserText: String(x.lastUserText ?? ""),
    scope,
    botScope,
    needsHumanFollowup: x.needsHumanFollowup === true,
  };
}

export async function GET(req: Request) {
  const gate = await requirePerm("reports.view");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const u = new URL(req.url);
  const cfg = await botSettings(db);
  const id = (u.searchParams.get("id") ?? "").trim();

  if (id) {
    if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const ref = db.collection(COL).doc(id);
    const d = await ref.get();
    if (!d.exists) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
    const x = (d.data() ?? {}) as Record<string, unknown>;
    const row = toRow(d.id, x, iso(d.createTime), cfg.newSince);
    const logSnap = await ref.collection("log").orderBy("at", "asc").limit(1000).get();
    const log: LogEntry[] = logSnap.docs.map((e) => {
      const y = e.data() as Record<string, unknown>;
      return { role: String(y.role ?? ""), text: String(y.text ?? ""), at: iso(y.at), type: y.type ? String(y.type) : undefined, mode: y.mode ? String(y.mode) : undefined };
    });
    // ห้องเก่าก่อนมี log (8 ต.ค. 69) → ใช้ messages 20 ตัวล่าสุดที่บอทเก็บไว้
    const messages: LogEntry[] = Array.isArray(x.messages)
      ? (x.messages as Record<string, unknown>[]).map((m) => ({ role: String(m.role ?? ""), text: String(m.text ?? ""), at: iso(m.at) }))
      : [];
    return NextResponse.json({ ...row, log, messages, settings: cfg }, { headers: { "Cache-Control": "no-store" } });
  }

  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50));
  const scope = (u.searchParams.get("scope") ?? "all").trim();
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
  let snap;
  if (q) {
    // ค้นชื่อ: nameLower ขึ้นต้นด้วย q (บอทเก็บ nameLower ไว้ตอน Save Profile)
    snap = await db.collection(COL).where("nameLower", ">=", q).where("nameLower", "<", `${q}`).limit(100).get();
  } else {
    snap = await db.collection(COL).orderBy("lastSeen", "desc").limit(scope === "all" ? limit : Math.min(400, limit * 6)).get();
  }
  let rows = snap.docs.map((d) => toRow(d.id, (d.data() ?? {}) as Record<string, unknown>, iso(d.createTime), cfg.newSince));
  if (scope === "new" || scope === "old") rows = rows.filter((r) => r.scope === scope);
  rows.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  rows = rows.slice(0, limit);
  return NextResponse.json({ rows, settings: cfg, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

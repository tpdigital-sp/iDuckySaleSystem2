import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { clearLineSources, loadLineSources } from "@/lib/server/line-sources";
import {
  loadLineAlert,
  openToken,
  pushShopAlert,
  saveLineAlert,
  sealToken,
  statusOf,
  type LineAlertStatus,
} from "@/lib/server/line-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ป้ายชื่อบัญชี LINE 1 ตัว — ไว้บอกว่าเลขห้องแถวไหนเป็นของบัญชีไหน */
export interface LineAccount {
  /** "alert" = บัญชีแจ้งเตือนที่ตั้งไว้ · "shop" = บัญชีร้านที่คุยกับลูกค้า */
  kind: "alert" | "shop";
  userId: string;
  name: string;
  basicId: string;
}

/** ถามชื่อบัญชีจาก token (ใช้จับคู่กับ destination ของ webhook) */
async function accountOf(token: string, kind: LineAccount["kind"]): Promise<LineAccount | null> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { userId?: string; displayName?: string; basicId?: string };
    if (!d.userId) return null;
    return { kind, userId: d.userId, name: d.displayName ?? "", basicId: d.basicId ?? "" };
  } catch {
    return null;
  }
}

async function accounts(): Promise<LineAccount[]> {
  const doc = await loadLineAlert();
  const out: LineAccount[] = [];
  const alert = openToken(doc.enc);
  if (alert) {
    const a = await accountOf(alert, "alert");
    if (a) out.push(a);
  }
  const shop = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (shop) {
    const s = await accountOf(shop, "shop");
    if (s) out.push(s);
  }
  return out;
}

export interface LineSourcesResponse {
  sources: Awaited<ReturnType<typeof loadLineSources>>;
  alert: LineAlertStatus;
  accounts: LineAccount[];
  /** ปลายทางเดิมที่ตั้งไว้ใน env (ใช้เมื่อยังไม่ได้ตั้งบัญชีแจ้งเตือน) */
  envTo: string;
}

/** เลขห้องแชทที่ /api/line/webhook จดไว้ + สถานะบัญชีแจ้งเตือน */
export async function GET() {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  const doc = await loadLineAlert();
  const body: LineSourcesResponse = {
    sources: await loadLineSources(),
    alert: statusOf(doc),
    accounts: await accounts(),
    // โชว์แค่ตัวอักษรแรกพอให้รู้ว่าเป็นกลุ่มหรือแชทเดี่ยว ไม่ต้องเปิดเลขเต็ม
    envTo: (process.env.LINE_STOCK_ALERT_TO ?? "").slice(0, 1),
  };
  return NextResponse.json(body);
}

/**
 * บันทึกบัญชีแจ้งเตือน / ทดสอบส่ง
 *   { action: "save", token?, to?, adminTo? }  — token ว่าง = ไม่แตะของเดิม
 *   { action: "test" }                          — ยิงข้อความทดสอบไปปลายทางที่ตั้งไว้
 */
export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    token?: string;
    to?: string;
    adminTo?: string;
    /** ทดสอบ/ตั้งค่าฝั่งกลุ่มเรื่องเงิน (เคลม · ยอดค้างงวด 2) */
    money?: boolean;
  };

  if (body.action === "test") {
    const who = gate.actor?.name || gate.actor?.username || "แอดมิน";
    const which = body.money ? "กลุ่มเรื่องเงิน" : "กลุ่มทั่วไป";
    const r = await pushShopAlert(
      {
        tone: "#0F766E",
        title: "🔔 ทดสอบการแจ้งเตือน",
        headline: "เห็นการ์ดนี้ในกลุ่ม = ตั้งค่าถูกแล้ว ข้อความจริงจะหน้าตาแบบนี้",
        hero: which,
        rows: [{ label: "ส่งโดย", value: who }],
        button: { label: "เปิดหน้าตั้งค่า", uri: "https://iduckystore.com/admin/line-groups" },
        alt: `🔔 ทดสอบการแจ้งเตือน (${which})`,
      },
      { money: !!body.money },
    );
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  if (body.action !== "save") return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });

  const patch: Parameters<typeof saveLineAlert>[0] = {
    savedAt: new Date().toISOString(),
    savedBy: gate.actor?.name || gate.actor?.username || "แอดมิน",
  };
  if (typeof body.to === "string") patch.to = body.to.trim();
  if (typeof body.adminTo === "string") patch.adminTo = body.adminTo.trim();

  /** บอกหน้าจอว่าเพิ่งทำอะไรสำเร็จ — เดิมขึ้นแค่ "บันทึกแล้ว" แยกไม่ออกว่า token เข้าหรือเปล่า */
  let saved = "";

  if (typeof body.token === "string" && body.token.trim()) {
    const raw = body.token.trim();
    /*
     * ⚠️ ต้องถาม LINE ก่อนว่า token ใช้ได้จริงไหม แล้วค่อยบันทึก
     * เดิมบันทึกดิบ ๆ แล้วตอบ "บันทึกแล้ว" ทุกกรณี — วางผิด/วางไม่ครบก็ขึ้นว่าสำเร็จ
     * กว่าจะรู้ว่าใช้ไม่ได้คือตอนกดส่งทดสอบ (เจอจริง 14 ก.ย. 69)
     */
    const acc = await accountOf(raw, "alert");
    if (!acc)
      return NextResponse.json(
        { error: "token นี้ใช้ไม่ได้ — LINE ไม่รับ ลองกด Issue ใหม่แล้วคัดลอกทั้งบรรทัด (อย่าให้มีช่องว่างติดมา)" },
        { status: 400 },
      );
    const sealed = sealToken(raw);
    if (!sealed)
      return NextResponse.json(
        { error: "เข้ารหัส token ไม่ได้ — เซิร์ฟเวอร์ยังไม่ได้ตั้ง ADMIN_SESSION_SECRET" },
        { status: 500 },
      );
    patch.enc = sealed;
    saved = `ผูกบัญชี ${acc.name || acc.basicId} แล้ว`;
  }
  // ล้าง token ทิ้ง = กลับไปใช้บัญชีร้านตามเดิม
  if (body.token === "") {
    patch.enc = undefined;
    saved = "ล้าง token แล้ว — กลับไปส่งจากบัญชีร้าน";
  }

  await saveLineAlert(patch);
  const doc = await loadLineAlert();
  return NextResponse.json({ ok: true, saved, alert: statusOf(doc), accounts: await accounts() });
}

/** คัดลอกเลขไปใช้แล้ว — ล้างรายการทิ้งได้ */
export async function DELETE() {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  await clearLineSources();
  return NextResponse.json({ ok: true });
}

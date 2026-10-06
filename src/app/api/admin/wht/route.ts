import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { WHT_BUCKET, WHT_TABLE, isMissingTable, lastSyncInfo, loadCert, refreshLineFlags, relinkCert, saveCert, withFileUrls } from "@/lib/server/wht-db";
import { flowAccountApiReady } from "@/lib/server/flowaccount-api";
import { WHT_RATE_DEFAULT, whtAmountOf, type WhtCert } from "@/lib/wht";

export const runtime = "nodejs";

/**
 * 🧾 ใบหัก ณ ที่จ่ายของเดือน (หน้า /admin/wht) — ?month=YYYY-MM · ไม่ส่ง = เดือนล่าสุดที่มีข้อมูล
 * ต้องมีสิทธิ์ orders.money (ยอดเงิน + เลขบัญชีโอนคืนลูกค้า)
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ certs: [], months: [] });

  const { data: mrows, error: merr } = await sb.from(WHT_TABLE).select("month:data->>month");
  if (merr) {
    if (isMissingTable(merr)) return NextResponse.json({ certs: [], months: [], needsSetup: true });
    return NextResponse.json({ error: merr.message, certs: [], months: [] }, { status: 500 });
  }
  const months = [...new Set((mrows ?? []).map((r) => String(r.month)))].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  const want = new URL(req.url).searchParams.get("month");
  const month = want && /^\d{4}-\d{2}$/.test(want) ? want : months[0];
  if (!month) return NextResponse.json({ certs: [], months, apiReady: await flowAccountApiReady(), lastSync: await lastSyncInfo(sb) });

  const { data, error } = await sb.from(WHT_TABLE).select("data").eq("data->>month", month).order("id", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: error.message, certs: [], months }, { status: 500 });
  const certs = await withFileUrls(sb, await refreshLineFlags(sb, (data ?? []).map((r) => r.data as WhtCert)));
  return NextResponse.json({ certs, months, month, apiReady: await flowAccountApiReady(), lastSync: await lastSyncInfo(sb) });
}

type Patch = {
  id?: string;
  mode?: "wht" | "none" | null;
  received?: boolean;
  retro?: { amount?: number; bank?: string; account?: string; accountName?: string } | null;
  refunded?: boolean;
  note?: string;
  orderId?: string;
  removeFile?: string;
};

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);

/** แก้ใบเดียว — หัก/ไม่หัก · ได้รับใบหัก · หักย้อนหลัง (เลขบัญชี/ยอดคืน) · โอนคืนแล้ว · หมายเหตุ · ผูกออเดอร์ · ลบไฟล์ */
export async function PATCH(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Patch | null;
  if (!body?.id) return NextResponse.json({ error: "ไม่รู้ว่าใบไหน" }, { status: 400 });
  const cur = await loadCert(sb, body.id);
  if (!cur) return NextResponse.json({ error: `ไม่พบใบ ${body.id}` }, { status: 404 });

  const by = gate.actor.name || gate.actor.username;
  const now = new Date().toISOString();
  let c: WhtCert = { ...cur };

  if (body.mode !== undefined) {
    if (body.mode === null) {
      delete c.mode;
      delete c.modeBy;
    } else {
      c.mode = body.mode === "wht" ? "wht" : "none";
      c.modeBy = by;
      c.rate ||= WHT_RATE_DEFAULT;
    }
  }
  if (body.received !== undefined) {
    if (body.received) c.received = { at: now, by };
    else delete c.received;
  }
  if (body.retro !== undefined) {
    if (body.retro === null) {
      if (c.retro?.refundedAt) return NextResponse.json({ error: "โอนคืนไปแล้ว — กด “ยังไม่ได้โอนคืน” ก่อนถึงจะยกเลิกได้" }, { status: 409 });
      delete c.retro;
    } else {
      const amount = Number(body.retro.amount);
      c.retro = {
        ...(c.retro ?? { at: now, by }),
        amount: isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : whtAmountOf(c),
        bank: s(body.retro.bank, 60),
        account: s(body.retro.account, 40),
        accountName: s(body.retro.accountName, 120),
      };
    }
  }
  if (body.refunded !== undefined) {
    if (!c.retro) return NextResponse.json({ error: "ใบนี้ไม่ได้ตั้งหักย้อนหลัง" }, { status: 400 });
    if (body.refunded) c.retro = { ...c.retro, refundedAt: now, refundedBy: by };
    else {
      const { refundedAt: _a, refundedBy: _b, ...rest } = c.retro;
      c.retro = rest;
    }
  }
  if (body.note !== undefined) c.note = s(body.note, 500) || undefined;
  if (body.orderId) {
    const r = await relinkCert(sb, c, body.orderId.trim().toUpperCase());
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
    c = { ...c, ...r };
  }
  if (body.removeFile) {
    const p = body.removeFile;
    c.certFiles = (c.certFiles ?? []).filter((x) => x !== p);
    c.refundSlips = (c.refundSlips ?? []).filter((x) => x !== p);
    await sb.storage.from(WHT_BUCKET).remove([p]);
  }

  const err = await saveCert(sb, c);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const [view] = await withFileUrls(sb, [c]);
  return NextResponse.json({ cert: view });
}

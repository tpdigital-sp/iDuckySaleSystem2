import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealers, saveDealers, type DealersMap } from "@/lib/server/dealers";

export const runtime = "nodejs";

/** ข้อมูลตัวแทน 1 คนที่หน้าแอดมินเห็น — ชื่อ/อีเมล join สดจาก auth.users (ไม่เก็บลงแถว __dealers__) */
export interface DealerRow {
  uid: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  note: string;
  since: string;
}

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string; phone?: string; picture?: string } | null;
};

/** บัญชีสมาชิกทั้งหมด — ⚠️ เพดาน 1000 บัญชีต่อหน้า (พอสำหรับร้านตอนนี้ เกินเมื่อไหร่ค่อยทำ paging) */
async function listUsers(): Promise<AuthUser[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return [];
  return data.users as AuthUser[];
}

const rowOf = (uid: string, entry: { note?: string; since: string }, u?: AuthUser): DealerRow => ({
  uid,
  email: u?.email ?? "",
  name: u?.user_metadata?.name ?? "",
  phone: u?.user_metadata?.phone ?? "",
  picture: u?.user_metadata?.picture ?? "",
  note: entry.note ?? "",
  since: entry.since,
});

/** รายชื่อตัวแทนจำหน่ายทั้งหมด (ใหม่→เก่า) */
export async function GET() {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const map = await loadDealers();
  const uids = Object.keys(map);
  if (!uids.length) return NextResponse.json({ dealers: [] });

  const users = new Map((await listUsers()).map((u) => [u.id, u]));
  const dealers = uids
    .map((uid) => rowOf(uid, map[uid], users.get(uid)))
    .sort((a, b) => (b.since || "").localeCompare(a.since || ""));
  return NextResponse.json({ dealers });
}

/** เพิ่มตัวแทนด้วยอีเมล (หรือแก้โน้ตด้วย uid) */
export async function POST(req: Request) {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  let body: { email?: string; uid?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const map: DealersMap = { ...(await loadDealers()) };
  const note = (body.note ?? "").trim().slice(0, 200);

  // แก้โน้ตของตัวแทนที่มีอยู่แล้ว
  if (body.uid) {
    const entry = map[body.uid];
    if (!entry) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
    map[body.uid] = { ...entry, ...(note ? { note } : { note: undefined }) };
    const { error } = await saveDealers(map);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true, dealer: rowOf(body.uid, map[body.uid], undefined) });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "กรอกอีเมลของบัญชีสมาชิก" }, { status: 400 });

  const user = (await listUsers()).find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user)
    return NextResponse.json(
      { error: "ไม่พบบัญชีสมาชิกอีเมลนี้ — ให้ตัวแทนสมัครสมาชิก/ล็อกอินบนเว็บก่อน แล้วค่อยเพิ่ม" },
      { status: 404 }
    );
  if (map[user.id]) return NextResponse.json({ error: "บัญชีนี้เป็นตัวแทนอยู่แล้ว" }, { status: 409 });

  map[user.id] = { since: new Date().toISOString(), ...(note ? { note } : {}) };
  const { error } = await saveDealers(map);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, dealer: rowOf(user.id, map[user.id], user) });
}

/** ถอดตัวแทน — ?uid=<auth uid> */
export async function DELETE(req: Request) {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const uid = new URL(req.url).searchParams.get("uid") ?? "";
  const map: DealersMap = { ...(await loadDealers()) };
  if (!uid || !map[uid]) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
  delete map[uid];
  const { error } = await saveDealers(map);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

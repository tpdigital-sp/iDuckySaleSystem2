import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealersDoc, saveDealersDoc } from "@/lib/server/dealers";

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

/** ใบสมัครที่รออนุมัติ 1 ใบ (join ข้อมูลบัญชีสดเหมือนกัน) */
export interface DealerApplicationRow {
  uid: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  shopName: string;
  channel: string;
  detail: string;
  at: string;
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

const userBits = (u?: AuthUser) => ({
  email: u?.email ?? "",
  name: u?.user_metadata?.name ?? "",
  phone: u?.user_metadata?.phone ?? "",
  picture: u?.user_metadata?.picture ?? "",
});

const rowOf = (uid: string, entry: { note?: string; since: string }, u?: AuthUser): DealerRow => ({
  uid,
  ...userBits(u),
  note: entry.note ?? "",
  since: entry.since,
});

/** รายชื่อตัวแทน (ใหม่→เก่า) + ใบสมัครที่รออนุมัติ (ใหม่→เก่า) */
export async function GET() {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const doc = await loadDealersDoc();
  const uids = [...Object.keys(doc.users), ...Object.keys(doc.applications)];
  const users = uids.length ? new Map((await listUsers()).map((u) => [u.id, u])) : new Map<string, AuthUser>();

  const dealers = Object.keys(doc.users)
    .map((uid) => rowOf(uid, doc.users[uid], users.get(uid)))
    .sort((a, b) => (b.since || "").localeCompare(a.since || ""));
  const applications: DealerApplicationRow[] = Object.keys(doc.applications)
    .map((uid) => {
      const a = doc.applications[uid];
      return { uid, ...userBits(users.get(uid)), shopName: a.shopName, channel: a.channel, detail: a.detail ?? "", at: a.at };
    })
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return NextResponse.json({ dealers, applications });
}

/**
 * จัดการทะเบียน — ก้อนเดียวหลายท่า:
 * { email, note? }   เพิ่มตัวแทนด้วยอีเมล (ทางลัด ไม่ต้องรอใบสมัคร)
 * { uid, note }      แก้โน้ตของตัวแทนเดิม
 * { approveUid }     อนุมัติใบสมัคร → ย้ายเข้าทะเบียน (โน้ต = ชื่อร้านจากใบสมัคร)
 * { rejectUid }      ปฏิเสธใบสมัคร → ลบใบสมัครทิ้ง (สมัครใหม่ได้)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  let body: { email?: string; uid?: string; note?: string; approveUid?: string; rejectUid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const doc = await loadDealersDoc();
  const next = { users: { ...doc.users }, applications: { ...doc.applications } };
  const note = (body.note ?? "").trim().slice(0, 200);

  // อนุมัติใบสมัคร
  if (body.approveUid) {
    const app = next.applications[body.approveUid];
    if (!app) return NextResponse.json({ error: "ไม่พบใบสมัครนี้ (อาจถูกจัดการไปแล้ว)" }, { status: 404 });
    delete next.applications[body.approveUid];
    next.users[body.approveUid] = { since: new Date().toISOString(), note: app.shopName.slice(0, 200) };
    const { error } = await saveDealersDoc(next);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ปฏิเสธใบสมัคร
  if (body.rejectUid) {
    if (!next.applications[body.rejectUid])
      return NextResponse.json({ error: "ไม่พบใบสมัครนี้ (อาจถูกจัดการไปแล้ว)" }, { status: 404 });
    delete next.applications[body.rejectUid];
    const { error } = await saveDealersDoc(next);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // แก้โน้ตของตัวแทนที่มีอยู่แล้ว
  if (body.uid) {
    const entry = next.users[body.uid];
    if (!entry) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
    next.users[body.uid] = { since: entry.since, ...(note ? { note } : {}) };
    const { error } = await saveDealersDoc(next);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // เพิ่มด้วยอีเมล
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "กรอกอีเมลของบัญชีสมาชิก" }, { status: 400 });

  const user = (await listUsers()).find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user)
    return NextResponse.json(
      { error: "ไม่พบบัญชีสมาชิกอีเมลนี้ — ให้ตัวแทนสมัครสมาชิก/ล็อกอินบนเว็บก่อน แล้วค่อยเพิ่ม" },
      { status: 404 }
    );
  if (next.users[user.id]) return NextResponse.json({ error: "บัญชีนี้เป็นตัวแทนอยู่แล้ว" }, { status: 409 });

  delete next.applications[user.id]; // มีใบสมัครค้างอยู่ = ถือว่าอนุมัติไปในตัว
  next.users[user.id] = { since: new Date().toISOString(), ...(note ? { note } : {}) };
  const { error } = await saveDealersDoc(next);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, dealer: rowOf(user.id, next.users[user.id], user) });
}

/** ถอดตัวแทน — ?uid=<auth uid> */
export async function DELETE(req: Request) {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const uid = new URL(req.url).searchParams.get("uid") ?? "";
  const doc = await loadDealersDoc();
  if (!uid || !doc.users[uid]) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
  const next = { users: { ...doc.users }, applications: { ...doc.applications } };
  delete next.users[uid];
  const { error } = await saveDealersDoc(next);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealersDoc, saveDealersDoc, type DealerApplication, type DealerEntry } from "@/lib/server/dealers";
import { cleanSender } from "@/lib/order-sender";
import type { OrderSender } from "@/lib/admin-data";

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
  /** ใบสมัครที่เขากรอกมาตอนสมัคร (เก็บไว้ตอนอนุมัติ) — เพิ่มด้วยอีเมล/อนุมัติก่อน 17 ก.ย. 69 = ไม่มี */
  application?: DealerApplication;
  /** ผู้ส่งบนกล่องที่ตัวแทนตั้งเองในหน้า /account (user_metadata.dealerSender) — ไม่ได้ตั้ง = ไม่มี */
  sender?: OrderSender;
  /** ที่อยู่ในโปรไฟล์สมาชิก (ถ้าเขากรอกไว้) */
  address: string;
  /** วันที่สมัครสมาชิกเว็บ / ล็อกอินล่าสุด (ISO) */
  joinedAt: string;
  lastSignInAt: string;
  /** จำนวนออเดอร์ที่สั่งด้วยบัญชีนี้ (นับจาก customerId) */
  orders: number;
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
  /** ที่อยู่ในโปรไฟล์สมาชิก (ถ้าเขากรอกไว้) */
  address: string;
  joinedAt: string;
  lastSignInAt: string;
  orders: number;
}

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: { name?: string; phone?: string; picture?: string; address?: string; dealerSender?: OrderSender | null } | null;
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

/** ข้อมูลบัญชีเพิ่มเติมที่โชว์ในแผงรายละเอียด (ทั้งใบรออนุมัติและตัวแทนแล้ว) */
const accountExtras = (u: AuthUser | undefined, orders: number) => ({
  address: typeof u?.user_metadata?.address === "string" ? u.user_metadata.address : "",
  joinedAt: u?.created_at ?? "",
  lastSignInAt: u?.last_sign_in_at ?? "",
  orders,
});

const rowOf = (uid: string, entry: DealerEntry, u?: AuthUser, orders = 0): DealerRow => {
  const sender = cleanSender(u?.user_metadata?.dealerSender);
  return {
    uid,
    ...userBits(u),
    note: entry.note ?? "",
    since: entry.since,
    ...(entry.application ? { application: entry.application } : {}),
    ...(sender ? { sender } : {}),
    ...accountExtras(u, orders),
  };
};

/** จำนวนออเดอร์ต่อบัญชี — ตัวแทนมีไม่กี่คน นับทีละคนพอ (head:true ไม่ดึงแถว) · นับไม่ได้ = 0 ไม่ให้หน้าล้ม */
async function orderCounts(uids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sb = getSupabaseAdmin();
  if (!sb) return out;
  await Promise.all(
    uids.map(async (uid) => {
      const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("data->>customerId", uid);
      out.set(uid, count ?? 0);
    })
  );
  return out;
}

/** รายชื่อตัวแทน (ใหม่→เก่า) + ใบสมัครที่รออนุมัติ (ใหม่→เก่า) */
export async function GET() {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const doc = await loadDealersDoc();
  const uids = [...Object.keys(doc.users), ...Object.keys(doc.applications)];
  const users = uids.length ? new Map((await listUsers()).map((u) => [u.id, u])) : new Map<string, AuthUser>();

  const counts = await orderCounts(uids);
  const dealers = Object.keys(doc.users)
    .map((uid) => rowOf(uid, doc.users[uid], users.get(uid), counts.get(uid) ?? 0))
    .sort((a, b) => (b.since || "").localeCompare(a.since || ""));
  const applications: DealerApplicationRow[] = Object.keys(doc.applications)
    .map((uid) => {
      const a = doc.applications[uid];
      return {
        uid,
        ...userBits(users.get(uid)),
        shopName: a.shopName,
        channel: a.channel,
        detail: a.detail ?? "",
        at: a.at,
        ...accountExtras(users.get(uid), counts.get(uid) ?? 0),
      };
    })
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return NextResponse.json({ dealers, applications });
}

/**
 * จัดการทะเบียน — ก้อนเดียวหลายท่า:
 * { email, note? }   เพิ่มตัวแทนด้วยอีเมล (ทางลัด ไม่ต้องรอใบสมัคร)
 * { uid, note }      แก้โน้ตของตัวแทนเดิม
 * { uid, application: { shopName, channel, detail? } }  แอดมินกรอก/แก้ข้อมูลร้านของตัวแทนเอง
 *                    (คนที่เพิ่มด้วยอีเมล หรืออนุมัติก่อนระบบเก็บใบสมัคร = ไม่มีใบ ให้กรอกย้อนหลังได้)
 * { approveUid }     อนุมัติใบสมัคร → ย้ายเข้าทะเบียน (โน้ต = ชื่อร้านจากใบสมัคร · ใบสมัครเก็บติดตัวไว้ดูย้อนหลัง)
 * { rejectUid }      ปฏิเสธใบสมัคร → ลบใบสมัครทิ้ง (สมัครใหม่ได้)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  let body: {
    email?: string;
    uid?: string;
    note?: string;
    approveUid?: string;
    rejectUid?: string;
    application?: { shopName?: string; channel?: string; detail?: string };
  };
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
    next.users[body.approveUid] = { since: new Date().toISOString(), note: app.shopName.slice(0, 200), application: app };
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

  // แอดมินกรอก/แก้ข้อมูลร้านของตัวแทน — ⚠️ แถวนี้อ่าน public ได้ เก็บแค่ 3 ช่องเดียวกับใบสมัคร ห้ามเพิ่มเบอร์/ที่อยู่
  if (body.uid && body.application) {
    const entry = next.users[body.uid];
    if (!entry) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
    const shopName = (body.application.shopName ?? "").trim().slice(0, 120);
    const channel = (body.application.channel ?? "").trim().slice(0, 200);
    const detail = (body.application.detail ?? "").trim().slice(0, 500);
    if (shopName.length < 2) return NextResponse.json({ error: "กรอกชื่อร้าน/ธุรกิจของตัวแทน" }, { status: 400 });
    next.users[body.uid] = {
      ...entry,
      // เวลาสมัครเดิมคงไว้ — แอดมินกรอกย้อนหลัง (ไม่มีใบ) = ไม่มีเวลาสมัคร หน้าแอดมินจะบอกว่า "แอดมินกรอกเอง"
      application: { shopName, channel, at: entry.application?.at ?? "", ...(detail ? { detail } : {}) },
    };
    const { error } = await saveDealersDoc(next);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // แก้โน้ตของตัวแทนที่มีอยู่แล้ว
  if (body.uid) {
    const entry = next.users[body.uid];
    if (!entry) return NextResponse.json({ error: "ไม่พบตัวแทนคนนี้" }, { status: 404 });
    // ⚠️ พาใบสมัครไปด้วย — สร้าง entry ใหม่ทั้งก้อน ลืม = ใบสมัครหายเงียบตอนแก้โน้ต
    next.users[body.uid] = {
      since: entry.since,
      ...(note ? { note } : {}),
      ...(entry.application ? { application: entry.application } : {}),
    };
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

  const pending = next.applications[user.id]; // มีใบสมัครค้างอยู่ = ถือว่าอนุมัติไปในตัว (เก็บใบไว้ดูย้อนหลังเหมือนกัน)
  delete next.applications[user.id];
  next.users[user.id] = {
    since: new Date().toISOString(),
    ...(note ? { note } : {}),
    ...(pending ? { application: pending } : {}),
  };
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

import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchLineProfile, lineUserIdFrom } from "@/lib/server/notify";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ผูก LINE ของลูกค้ากับออเดอร์ — พนักงานวาง "userId" ที่คัดลอกมาจากหน้าคลังแชท
 *
 * บันทึกเฉพาะ userId ที่ LINE ยืนยันแล้วว่าส่งข้อความถึงได้จริง (ดึงโปรไฟล์ผ่าน)
 * จะได้ไม่ไปรู้ตอนระบบทวงยอดจริงว่าส่งไม่ออก · เก็บชื่อ/รูปไว้ให้แอดมินเช็คว่าผูกถูกคน
 *
 * ⚠️ ลิงก์จาก OA Manager (chat.line.biz/…/chat/…) ใช้ไม่ได้ — ท่อนท้ายเป็น chat id ไม่ใช่ userId
 *    ทดสอบจริงแล้ว: chat id ของลูกค้าคนหนึ่งไม่ตรงกับ userId ของเขาเลย
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  let body: { orderId?: string; input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  const input = (body.input ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const who = gate.actor.name?.trim() || gate.actor.username;

  // ส่งค่าว่างมา = ยกเลิกการผูก
  if (!input) {
    const cleared = withLog({ ...order, lineUserId: undefined, lineProfile: undefined }, who, "ยกเลิกการผูก LINE ของลูกค้า");
    const { error } = await sb.from("orders").update({ data: cleared }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true, order: cleared });
  }

  const userId = lineUserIdFrom(input);
  if (!userId)
    return NextResponse.json(
      {
        error: /chat\.line\.biz/i.test(input)
          ? "ลิงก์จาก OA Manager ใช้ไม่ได้ — ท่อนท้ายเป็น chat id ไม่ใช่ userId · ให้คัดลอก userId จากหน้าคลังแชทแทน"
          : "ไม่พบ LINE userId — ต้องเป็นรหัสขึ้นต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว",
      },
      { status: 400 }
    );

  if (!process.env.LINE_MESSAGING_ACCESS_TOKEN)
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN) — ยืนยันไม่ได้" }, { status: 503 });

  const profile = await fetchLineProfile(userId);
  if (!profile)
    return NextResponse.json(
      {
        // ลิงก์ OA Manager มีรหัสหน้าตาเหมือน userId เป๊ะ (U + 32 ตัว) แต่เป็นคนละชุด — บอกให้ชัดว่าพลาดตรงนี้
        error: /chat\.line\.biz/i.test(input)
          ? "รหัสท้ายลิงก์ OA Manager ใช้ส่งข้อความไม่ได้ (เป็น chat id ไม่ใช่ userId) — ให้คัดลอก userId จากหน้าคลังแชทมาวางแทน"
          : "LINE ไม่รู้จักรหัสนี้ — อาจเป็นคนละบัญชีทางการ (OA) หรือลูกค้าบล็อก/ไม่ได้เป็นเพื่อนกับร้าน",
      },
      { status: 404 }
    );

  const next = withLog(
    { ...order, lineUserId: userId, lineProfile: { name: profile.name, picture: profile.picture, at: new Date().toISOString() } },
    who,
    "ผูก LINE ของลูกค้า",
    `${profile.name} · ${userId.slice(0, 8)}…`
  );
  const { error } = await sb.from("orders").update({ data: next }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile, order: next });
}

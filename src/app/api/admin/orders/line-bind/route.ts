import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchLineProfile, lineUserIdFrom } from "@/lib/server/notify";
import { CHAT_COLLECTION, CHAT_OVERRIDE_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
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

  let body: { orderId?: string; input?: string; managerId?: string };
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

  const managerId = input.match(/chat\.line\.biz\/[^/]+\/chat\/(U[0-9a-f]{32})/i)?.[1] ?? null;
  const db = getChatFirestore();

  // ── ลิงก์ OA Manager: รหัสท้ายลิงก์ไม่ใช่ userId — ต้อง "แปล" ก่อน ──
  if (managerId) {
    // 1) เคยจับคู่ไว้แล้ว (จากที่พนักงานยืนยัน หรือ AdminBuddy กรอกไว้) → ผูกทันที
    if (db) {
      try {
        const q = await db.collection(CHAT_OVERRIDE_COLLECTION).where("managerUserId", "==", managerId).limit(1).get();
        if (!q.empty) {
          const real = q.docs[0].id;
          const p = await fetchLineProfile(real);
          if (p) {
            const next = withLog(
              { ...order, lineChatUrl: input, lineUserId: real, lineProfile: { name: p.name, picture: p.picture, at: new Date().toISOString() } },
              who,
              "ผูก LINE ของลูกค้า",
              `${p.name} · จากลิงก์ห้องแชทที่เคยจับคู่ไว้`
            );
            const { error } = await sb.from("orders").update({ data: next }).eq("id", orderId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, profile: p, order: next, resolved: "override" });
          }
        }
      } catch {
        /* ตารางจับคู่อ่านไม่ได้ก็ไปขั้นถัดไป */
      }
    }
    // 2) ยังไม่เคยจับคู่ → เก็บลิงก์ไว้ก่อน + เสนอ "คนที่คุยล่าสุด" ให้พนักงานยืนยัน 1 คลิก
    //    (พนักงานเพิ่งเปิดห้องแชทคนนั้นมาก๊อปลิงก์ = เขาอยู่บนสุดของรายการเกือบทุกครั้ง)
    const saved = withLog({ ...order, lineChatUrl: input }, who, "บันทึกลิงก์ห้องแชท LINE");
    await sb.from("orders").update({ data: saved }).eq("id", orderId);
    type Sug = { userId: string; name: string; picture?: string; lastSeen?: string };
    const suggestions: Sug[] = [];
    if (db) {
      try {
        const snap = await db.collection(CHAT_COLLECTION).orderBy("lastSeen", "desc").limit(3).get();
        snap.forEach((d) => {
          const ls = d.get("lastSeen") as { _seconds?: number; toDate?: () => Date } | undefined;
          const at = ls?.toDate ? ls.toDate().toISOString() : ls?._seconds ? new Date(ls._seconds * 1000).toISOString() : undefined;
          suggestions.push({ userId: (d.get("userId") as string) || d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string, lastSeen: at });
        });
      } catch {
        /* ไม่มีคลังแชทก็ไม่มีข้อเสนอ */
      }
    }
    return NextResponse.json({ ok: true, savedLink: true, managerId, suggestions, order: saved });
  }

  let userId = lineUserIdFrom(input);
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

  let profile = await fetchLineProfile(userId);

  /**
   * รหัสในลิงก์ OA Manager ไม่ใช่ userId ที่ใช้ส่งข้อความ (คนละชุดกัน)
   * แต่ระบบแชทฝั่ง AdminBuddy มีตารางจับคู่ไว้ (customer-overrides: doc = userId จริง,
   * ฟิลด์ managerUserId = รหัสในลิงก์) → ถ้าเคยจับคู่ไว้ ก็แปลงกลับให้อัตโนมัติ
   */
  if (!profile) {
    const db = getChatFirestore();
    if (db) {
      try {
        const q = await db.collection(CHAT_OVERRIDE_COLLECTION).where("managerUserId", "==", userId).limit(1).get();
        if (!q.empty) {
          const real = q.docs[0].id;
          const p2 = await fetchLineProfile(real);
          if (p2) {
            profile = p2;
            userId = real;
          }
        }
      } catch {
        /* ไม่มีตารางจับคู่ก็ข้ามไป */
      }
    }
  }

  if (!profile)
    return NextResponse.json(
      {
        // ลิงก์ OA Manager มีรหัสหน้าตาเหมือน userId เป๊ะ (U + 32 ตัว) แต่เป็นคนละชุด — บอกให้ชัดว่าพลาดตรงนี้
        error: /chat\.line\.biz/i.test(input)
          ? "ลิงก์ OA Manager ใช้ส่งข้อความไม่ได้ (ท่อนท้ายเป็น chat id คนละชุดกับ userId) → ให้พิมพ์ “ชื่อ LINE ที่เห็นบนหัวห้องแชท” ลงช่องนี้แล้วเลือกจากรายการแทน"
          : "LINE ไม่รู้จักรหัสนี้ — อาจเป็นคนละบัญชีทางการ (OA) หรือลูกค้าบล็อก/ไม่ได้เป็นเพื่อนกับร้าน · ลองพิมพ์ชื่อ LINE ค้นหาแทน",
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

  // พนักงานยืนยันว่า "ลิงก์ห้องแชทนี้ = คนนี้" → จำไว้ ครั้งหน้าวางลิงก์เดิมผูกอัตโนมัติ (AdminBuddy ใช้ตารางเดียวกัน)
  const mid = (body.managerId ?? "").trim();
  if (db && /^U[0-9a-f]{32}$/i.test(mid)) {
    try {
      await db.collection(CHAT_OVERRIDE_COLLECTION).doc(userId).set(
        { managerUserId: mid, managerUserIdBy: who, managerUserIdAt: new Date().toISOString(), source: "iducky-order" },
        { merge: true }
      );
    } catch {
      /* จำไม่ได้ก็ไม่เป็นไร ครั้งหน้าถามใหม่ */
    }
  }
  return NextResponse.json({ ok: true, profile, order: next });
}

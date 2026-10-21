import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchLineProfile, lineUserIdFrom } from "@/lib/server/notify";
import { backfillMissedNotifies } from "@/lib/server/line-backfill";
import { CHAT_COLLECTION, CHAT_OVERRIDE_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { isLineGroupId } from "@/lib/line-room-id";

export const runtime = "nodejs";

/**
 * ผูก LINE ของลูกค้ากับออเดอร์ — พนักงานวาง "userId" ที่คัดลอกมาจากหน้าคลังแชท
 *
 * บันทึกเฉพาะ userId ที่ LINE ยืนยันแล้วว่าส่งข้อความถึงได้จริง (ดึงโปรไฟล์ผ่าน)
 * จะได้ไม่ไปรู้ตอนระบบทวงยอดจริงว่าส่งไม่ออก · เก็บชื่อ/รูปไว้ให้แอดมินเช็คว่าผูกถูกคน
 *
 * ⚠️ ลิงก์จาก OA Manager (chat.line.biz/…/chat/…) ใช้ไม่ได้ — ท่อนท้ายเป็น chat id ไม่ใช่ userId
 *    ทดสอบจริงแล้ว: chat id ของลูกค้าคนหนึ่งไม่ตรงกับ userId ของเขาเลย
 *
 * 👥 ห้องกลุ่ม/ห้องรวม: รหัสท้ายลิงก์ขึ้นต้น C (กลุ่ม) / R (ห้องรวม) ไม่ใช่ U — เดิมด่านรับเฉพาะ U เลยตีกลับ
 *    "ลิงก์จาก OA Manager ใช้ไม่ได้" ทั้งที่เป็นลิงก์ห้องแชทจริง (พนักงานแจ้ง 21 ต.ค. 69) → รับทุกตัวอักษรนำหน้า
 *    (+ แบบมีเลข 2 นำหน้าที่ OA Manager บางลิงก์ใส่มา) · เก็บลิงก์เป็นปุ่มเปิดห้อง แล้วให้เลือก "คนในกลุ่ม" ที่จะรับแจ้งเตือน
 *    ห้องกลุ่มไม่จำเป็นคู่ลิงก์↔คน (ตารางจับคู่คือลิงก์ห้อง 1:1 ของคนนั้น — เอากลุ่มไปทับจะพาปุ่มเปิดแชทของคนนั้นไปผิดห้อง)
 */
/** 👥 ชื่อ/รูปของห้องกลุ่ม (C…) / ห้องรวม (R…) จากคลังแชทที่ /api/bot/group-log จดไว้ — ไม่มีห้อง = ยังไม่เคยมีข้อความจากกลุ่มนี้ ผูกไม่ได้ */
async function groupProfile(id: string): Promise<{ name: string; picture?: string } | null> {
  const db = getChatFirestore();
  if (!db) return null;
  const d = await db.collection(CHAT_COLLECTION).doc(id).get().catch(() => null);
  if (!d?.exists) return null;
  const name = String(d.get("displayName") ?? "").trim() || `${id[0] === "C" ? "กลุ่ม" : "ห้องรวม"} ${id.slice(0, 8)}…`;
  const pic = String(d.get("pictureUrl") ?? "");
  return { name, picture: pic || undefined };
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  let body: { orderId?: string; input?: string; managerId?: string; forget?: boolean; clearLink?: boolean; inheritFrom?: string; restoreInherit?: boolean };
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

  // restoreInherit=true = พนักงานกดยกเลิกการจำพลาด → ปลดธง กลับไปจำจากใบเก่าตามปกติ
  if (!input && body.restoreInherit) {
    const back = withLog({ ...order, lineInheritOff: undefined }, who, "กลับไปจำ LINE จากใบเก่าของลูกค้าคนนี้");
    const { error } = await updateOrder(sb, back);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, restored: true, order: back });
  }

  // ส่งค่าว่างมา = ยกเลิกการผูก · forget=true = ลบ "คู่ลิงก์↔คน" ที่จำไว้ด้วย (ผูกผิดแล้วไม่อยากให้เดาซ้ำ)
  // ⚠️ ยกเลิกแล้วต้องตั้ง lineInheritOff ด้วย — ไม่งั้น lineUserOf/lineTargetOf ไป "จำจากใบเก่า" ของลูกค้าคนเดียวกันกลับมาทันที
  //    (21 ต.ค. 69 OD-261020-4764: กดยกเลิก → reload → "จำจาก OD-261020-8014" เหมือนเดิม) · ผูกคนใหม่ = ธงหาย
  if (!input) {
    if (body.forget && order.lineUserId) {
      const db0 = getChatFirestore();
      if (db0) {
        try {
          const ref = db0.collection(CHAT_OVERRIDE_COLLECTION).doc(order.lineUserId);
          const d = await ref.get();
          // ลบเฉพาะคู่ที่ระบบเราสร้าง — ไม่ไปลบของ AdminBuddy
          if (d.exists && d.get("source") === "iducky-order")
            await ref.update({ managerUserId: FieldValue.delete(), managerUserIdBy: FieldValue.delete(), managerUserIdAt: FieldValue.delete(), source: FieldValue.delete() });
        } catch {
          /* ลบไม่ได้ก็แค่ยังจำอยู่ */
        }
      }
    }
    // clearLink=true = ลบลิงก์ห้องแชทของใบนี้ทิ้งด้วย (ผูกผิดคน = ลิงก์ก็ผิดคนเช่นกัน — เจ้าของร้านแจ้ง 10 ก.ย. 69 ว่ากดยกเลิกแล้วลิงก์ยังค้าง)
    const wasInherited = !order.lineUserId; // ใบนี้ไม่ได้ผูกเอง แค่จำจากใบเก่า → ที่พนักงานกดคือ "ไม่ใช่คนนี้"
    const inheritFrom = (body.inheritFrom ?? "").trim() || undefined;
    const cleared = withLog(
      {
        ...order,
        lineUserId: undefined,
        lineProfile: undefined,
        lineInheritOff: { at: new Date().toISOString(), by: who, from: inheritFrom },
        ...(body.clearLink ? { lineChatUrl: undefined } : {}),
      },
      who,
      wasInherited
        ? "ไม่ใช่คนนี้ — เลิกจำ LINE จากใบเก่า"
        : body.forget
          ? body.clearLink
            ? "ยกเลิกการผูก LINE + ลบลิงก์ห้องแชท + ลืมคู่ลิงก์"
            : "ยกเลิกการผูก LINE + ลืมคู่ลิงก์"
          : body.clearLink
            ? "ยกเลิกการผูก LINE + ลบลิงก์ห้องแชท"
            : "ยกเลิกการผูก LINE ของลูกค้า",
      wasInherited && inheritFrom ? `เคยจำจาก ${inheritFrom}` : undefined
    );
    const { error } = await updateOrder(sb, cleared);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true, order: cleared });
  }

  // รหัสห้อง: U = แชท 1:1 · C = กลุ่ม · R = ห้องรวม (บางลิงก์มีเลข 2 นำหน้า — ตัดทิ้งให้ตรงกับ chatIdInUrl/ตารางจับคู่)
  const managerId = input.match(/chat\.line\.biz\/[^/]+\/chat\/2?([A-Za-z][0-9a-f]{32})/i)?.[1] ?? null;
  const isGroup = !!managerId && /^[CR]/i.test(managerId);
  const db = getChatFirestore();

  // ── ลิงก์ OA Manager: รหัสท้ายลิงก์ไม่ใช่ userId — ต้อง "แปล" ก่อน ──
  if (managerId) {
    // 1) เคยจับคู่ไว้แล้ว → "เสนอ" คนนั้นเป็นตัวเลือกแรก แต่ยังต้องกดยืนยัน (จำผิดครั้งเดียวจะได้ไม่ผิดตลอด)
    let remembered: { userId: string; name: string; picture?: string; kind?: "group" | "room" } | null = null;
    if (db) {
      try {
        const q = await db.collection(CHAT_OVERRIDE_COLLECTION).where("managerUserId", "==", managerId).limit(1).get();
        if (!q.empty) {
          const real = q.docs[0].id;
          // 👥 21 ต.ค. 69 ลิงก์กลุ่มที่เคยยืนยันแล้ว (doc = groupId จริง) → เสนอกลุ่มนั้นเป็นตัวแรก
          const p = isLineGroupId(real) ? await groupProfile(real) : await fetchLineProfile(real);
          if (p) remembered = { userId: real, name: p.name, picture: p.picture, ...(isLineGroupId(real) ? { kind: real[0] === "C" ? ("group" as const) : ("room" as const) } : {}) };
        }
      } catch {
        /* ตารางจับคู่อ่านไม่ได้ก็ไปขั้นถัดไป */
      }
    }
    // 2) ยังไม่เคยจับคู่ → เก็บลิงก์ไว้ก่อน + เสนอ "คนที่คุยล่าสุด" ให้พนักงานยืนยัน 1 คลิก
    //    (พนักงานเพิ่งเปิดห้องแชทคนนั้นมาก๊อปลิงก์ = เขาอยู่บนสุดของรายการเกือบทุกครั้ง)
    const saved = withLog({ ...order, lineChatUrl: input }, who, isGroup ? "บันทึกลิงก์ห้องกลุ่ม LINE" : "บันทึกลิงก์ห้องแชท LINE");
    await updateOrder(sb, saved);
    type Sug = { userId: string; name: string; picture?: string; lastSeen?: string; kind?: "group" | "room" };
    const suggestions: Sug[] = [];
    if (db) {
      try {
        const rowOf = (d: FirebaseFirestore.QueryDocumentSnapshot): Sug => {
          const ls = d.get("lastSeen") as { _seconds?: number; toDate?: () => Date } | undefined;
          const at = ls?.toDate ? ls.toDate().toISOString() : ls?._seconds ? new Date(ls._seconds * 1000).toISOString() : undefined;
          const kind = isLineGroupId(d.id) ? (d.id[0] === "C" ? ("group" as const) : ("room" as const)) : undefined;
          return { userId: (d.get("userId") as string) || d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string, lastSeen: at, ...(kind ? { kind } : {}) };
        };
        if (isGroup) {
          // 👥 21 ต.ค. 69 ลิงก์กลุ่ม → เสนอ "ห้องกลุ่มในคลังแชท" (ที่ Group Log จดไว้) ไม่ใช่คนเดี่ยว · รหัสท้ายลิงก์ OA (C96b…) ≠ groupId จริง (C3d4…) แปลงตรงไม่ได้
          //   ห้องกลุ่มมีน้อย → อ่านช่วงรหัส C…/R… (ไม่ต้องมี composite index) แล้วเรียง lastSeen เอง
          const [cs, rs] = await Promise.all([
            db.collection(CHAT_COLLECTION).where(FieldPath.documentId(), ">=", "C").where(FieldPath.documentId(), "<", "D").limit(50).get(),
            db.collection(CHAT_COLLECTION).where(FieldPath.documentId(), ">=", "R").where(FieldPath.documentId(), "<", "S").limit(50).get(),
          ]);
          const rows = [...cs.docs, ...rs.docs].map(rowOf).filter((r) => r.lastSeen).sort((a, b) => (a.lastSeen! < b.lastSeen! ? 1 : -1));
          suggestions.push(...rows.slice(0, 5));
        } else {
          const snap = await db.collection(CHAT_COLLECTION).orderBy("lastSeen", "desc").limit(3).get();
          snap.forEach((d) => suggestions.push(rowOf(d)));
        }
      } catch {
        /* ไม่มีคลังแชทก็ไม่มีข้อเสนอ */
      }
    }
    // คนที่จำไว้ขึ้นเป็นตัวเลือกแรก (ติดป้าย remembered) — ตัดซ้ำออกจากรายการคุยล่าสุด
    const list = remembered
      ? [{ ...remembered, remembered: true }, ...suggestions.filter((x) => x.userId !== remembered!.userId)]
      : suggestions;
    return NextResponse.json({ ok: true, savedLink: true, managerId, group: isGroup, suggestions: list, order: saved });
  }

  let userId = lineUserIdFrom(input);
  if (!userId)
    return NextResponse.json(
      {
        error: /chat\.line\.biz/i.test(input)
          ? "อ่านรหัสห้องจากลิงก์นี้ไม่ออก — ต้องเป็นลิงก์หน้าห้องแชทใน OA Manager รูปแบบ chat.line.biz/…/chat/… (ก๊อปจากแถบที่อยู่ตอนเปิดห้องนั้นอยู่)"
          : "ไม่พบ LINE userId — ต้องเป็นรหัสขึ้นต้นด้วย U (คนเดียว) หรือ C (กลุ่ม) ตามด้วยตัวอักษร/ตัวเลข 32 ตัว",
      },
      { status: 400 }
    );

  if (!process.env.LINE_MESSAGING_ACCESS_TOKEN)
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN) — ยืนยันไม่ได้" }, { status: 503 });

  // 👥 21 ต.ค. 69 ห้องกลุ่ม/ห้องรวม (C…/R…) ที่ Group Log จดไว้: LINE ไม่มี profile รายคนให้ → ใช้ชื่อ/รูปกลุ่มจากคลังแชท · การ์ดแจ้งสถานะ push เข้ากลุ่มด้วย id นี้ได้เลย
  let profile = isLineGroupId(userId) ? await groupProfile(userId) : await fetchLineProfile(userId);

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
    { ...order, lineUserId: userId, lineProfile: { name: profile.name, picture: profile.picture, at: new Date().toISOString() }, lineInheritOff: undefined },
    who,
    isLineGroupId(userId) ? "ผูก LINE กลุ่มของลูกค้า" : "ผูก LINE ของลูกค้า",
    `${profile.name} · ${userId.slice(0, 8)}…`
  );
  const { error } = await updateOrder(sb, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // พนักงานยืนยันว่า "ลิงก์ห้องแชทนี้ = คนนี้" → จำไว้ ครั้งหน้าวางลิงก์เดิมผูกอัตโนมัติ (AdminBuddy ใช้ตารางเดียวกัน)
  // ห้อง 1:1: mid เป็น U… · 👥 21 ต.ค. 69 ลิงก์กลุ่ม (mid C…/R…) จำได้เมื่อผูกกับห้องกลุ่มจริง (doc = groupId) — ครั้งหน้าวางลิงก์เดิมเสนอกลุ่มนั้นเลย
  const mid = (body.managerId ?? "").trim();
  const midOk = /^U[0-9a-f]{32}$/i.test(mid) ? !isLineGroupId(userId) : /^[CR][0-9a-f]{32}$/i.test(mid) ? isLineGroupId(userId) : false;
  if (db && midOk) {
    try {
      await db.collection(CHAT_OVERRIDE_COLLECTION).doc(userId).set(
        { managerUserId: mid, managerUserIdBy: who, managerUserIdAt: new Date().toISOString(), source: "iducky-order" },
        { merge: true }
      );
    } catch {
      /* จำไม่ได้ก็ไม่เป็นไร ครั้งหน้าถามใหม่ */
    }
  }
  /**
   * 📨 ส่งย้อนหลัง: ระหว่างที่ยังไม่ได้ผูก มีข้อความส่งไม่ถึงค้างอยู่ (ยืนยันเงินเข้า/แบบงาน/ทวงยอด) → ส่ง "สถานะล่าสุด" ให้ทันที
   * กติกาอยู่ที่ lib/server/line-backfill.ts (ใช้ร่วมกับ cron ส่งย้อนหลังตอนโควตา LINE กลับมา)
   */
  const { missed, resent, resentError, latest } = await backfillMissedNotifies(sb, next, new URL(req.url).origin, who, "ส่งย้อนหลังหลังผูก LINE");
  return NextResponse.json({ ok: true, profile, order: latest, missed, resent, resentError });
}

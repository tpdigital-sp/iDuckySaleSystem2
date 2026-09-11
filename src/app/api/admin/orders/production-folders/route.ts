import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { fetchGraphicCardsFromTP } from "@/lib/server/tp-report";
import { matchFoldersToOrders, type FolderMatchResult } from "@/lib/production-match";

export const runtime = "nodejs";

/** ออเดอร์ที่โฟลเดอร์ผลิตอาจเป็นของมันได้ — เงินเข้าแล้วจนถึงกำลังผลิต (ยังไม่ส่ง) */
const CANDIDATE_STATUSES: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต"];

/**
 * 🏭 โยนโฟลเดอร์งานที่เข้าผลิต (จาก /Volumes/iDuckyShop/1.Order Today/<คน วันที่>/…) มาจับคู่กับออเดอร์
 *   POST { paths: string[], apply?: boolean, pick?: { folder: string; orderId: string }[] }
 *   · paths = พาธโฟลเดอร์ทั้งหมดที่หน้าเว็บอ่านได้ (ชื่อชั้นในสุดคือชื่องาน)
 *   · apply=false (ค่าเริ่มต้น) = ลองจับคู่ให้ดูก่อน ไม่แตะ DB · apply=true = ติ๊ก productionSent ให้ใบที่จับคู่ได้
 *   · pick = ใบที่คนเลือกเองจากรายการคลุมเครือ (ติ๊กให้ตอน apply)
 * ตอบ { ...FolderMatchResult, alreadySent: [...] (จับคู่ได้แต่ติ๊กไว้แล้ว ไม่ทับ), applied: n }
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm(["pack.ship", "proof.manage", "orders.edit"]);
  if (gate.res) return gate.res;

  let body: { paths?: string[]; apply?: boolean; pick?: { folder: string; orderId: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const paths = (body.paths ?? []).filter((p) => typeof p === "string").slice(0, 5000);
  if (!paths.length) return NextResponse.json({ error: "ไม่มีชื่อโฟลเดอร์ส่งมา" }, { status: 400 });

  const { data: rows, error } = await sb.from("orders").select("id,data").in("data->>status", CANDIDATE_STATUSES);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const all = (rows ?? []).map((r) => r.data as Order);
  const cards = (await fetchGraphicCardsFromTP(all.map((o) => o.id))) ?? {};

  // ใบที่ติ๊กไว้แล้วไม่เอามาจับคู่ซ้ำ — แต่รายงานให้รู้ว่าโฟลเดอร์นี้เคยเข้าแล้ว
  const fresh = all.filter((o) => !o.productionSent);
  const result: FolderMatchResult = matchFoldersToOrders(paths, fresh, cards);
  const already = matchFoldersToOrders(paths, all.filter((o) => o.productionSent), cards).matched;

  // โฟลเดอร์ที่มีไฟล์ OD แต่ใบไม่อยู่ในกองรอผลิต → บอกสถานะจริงของใบนั้น (ส่งไปแล้ว/ยกเลิก/ยังไม่ชำระ) แทนคำว่า "ไม่อยู่ในคิว"
  const NOT_IN_QUEUE = /\((OD-\d{6}-\d{3,}) ไม่อยู่ในคิวรอผลิต\)$/;
  const missingIds = [...new Set(result.skippedNames.map((n) => n.match(NOT_IN_QUEUE)?.[1]).filter((x): x is string => !!x))];
  if (missingIds.length) {
    const { data: miss } = await sb.from("orders").select("id,status:data->>status").in("id", missingIds);
    const statusOf = new Map((miss ?? []).map((r) => [r.id as string, String(r.status ?? "")]));
    result.skippedNames = result.skippedNames.map((n) => {
      const id = n.match(NOT_IN_QUEUE)?.[1];
      if (!id) return n;
      const st = statusOf.get(id);
      return n.replace(NOT_IN_QUEUE, st ? `(${id} สถานะ ${st} — ไม่ต้องทำอะไร)` : `(${id} ไม่พบออเดอร์นี้ในระบบ)`);
    });
  }

  const picks = (body.pick ?? []).filter((p) => p && typeof p.orderId === "string" && typeof p.folder === "string");
  let applied = 0;
  if (body.apply) {
    const by = gate.actor.name || gate.actor.username;
    const at = new Date().toISOString();
    const todo = [...result.matched.map((m) => ({ orderId: m.orderId, folder: m.folder })), ...picks];
    for (const t of todo) {
      const o = fresh.find((x) => x.id === t.orderId);
      if (!o || o.productionSent) continue;
      const next = withLog(
        { ...o, productionSent: { by, at, folder: t.folder } },
        by,
        "🏭 ส่งเข้าผลิตแล้ว (โยนโฟลเดอร์)",
        `โฟลเดอร์ “${t.folder}” — ใบขึ้นกอง “ส่งผลิตแล้ว รอปริ้น” ในคิวปริ้น`
      );
      const { error: e } = await sb.from("orders").update({ data: next }).eq("id", o.id);
      if (!e) applied++;
    }
  }
  return NextResponse.json({ ok: true, ...result, alreadySent: already, applied });
}

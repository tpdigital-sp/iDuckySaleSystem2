import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import {
  hasUnpaidBalance,
  isSampleFolderName,
  orderAwaitingStock,
  proofBlockerLabel,
  proofBlockers,
  withLog,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { orderContactProblems } from "@/lib/contact-validate";
import { fetchGraphicCardsFromTP } from "@/lib/server/tp-report";
import { groupSampleFiles, matchFoldersToOrders, sampleRoundFromFiles, type FolderMatch, type FolderMatchResult } from "@/lib/production-match";
import { updateOrder } from "@/lib/server/order-write";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";

export const runtime = "nodejs";

/** ออเดอร์ที่โฟลเดอร์ผลิตอาจเป็นของมันได้ — เงินเข้าแล้วจนถึงกำลังผลิต (ยังไม่ส่ง) */
const CANDIDATE_STATUSES: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต"];

/**
 * 🏭 โยนโฟลเดอร์งานที่เข้าผลิต (จาก /Volumes/iDuckyShop/1.Order Today/<คน วันที่>/…) มาจับคู่กับออเดอร์
 *   POST { paths: string[], apply?: boolean, pick?: { folder: string; orderId: string }[], skip?: string[] }
 *   · paths = พาธโฟลเดอร์ทั้งหมดที่หน้าเว็บอ่านได้ (ชื่อชั้นในสุดคือชื่องาน)
 *   · apply=false (ค่าเริ่มต้น) = ลองจับคู่ให้ดูก่อน ไม่แตะ DB · apply=true = ติ๊ก productionSent ให้ใบที่จับคู่ได้
 *   · pick = ใบที่คนเลือกเองจากรายการคลุมเครือ (ติ๊กให้ตอน apply)
 *   · skip = orderId ที่คนติ๊กออกจากรายการจับคู่ได้ (โฟลเดอร์แค่ทำตัวอย่างให้ลูกค้าดู ยังไม่ส่งผลิต) — ไม่ติ๊กให้
 *   · folderFor = ใบที่มีหลายโฟลเดอร์ (ขึ้นตัวอย่าง + งานจริง) คนเลือกว่าอันไหนคือโฟลเดอร์งานจริง → จดชื่อนั้น
 *   · sampleFiles = พาธไฟล์ jpg/png ในโฟลเดอร์ "(…ตย)" (หน้าเว็บอ่านแค่ชื่อ) → อ่านจำนวนตัวอย่างต่อลายจากชื่อไฟล์ เสนอแผนแบ่งส่งรอบตัวอย่าง
 *   · samplePlan = orderId ที่คนติ๊กให้ตั้งแผนรอบตัวอย่าง (ตอน apply) — เขียน shipPlan + ติ๊ก 🎁 มีชิ้นงานตัวอย่างให้รายการที่เกี่ยว
 *     (ใช้ได้ทั้งใบที่เพิ่งจับคู่และใบที่ติ๊กส่งผลิตไปแล้ว — โยนโฟลเดอร์ตัวอย่างซ้ำเพื่อตั้งแผนได้)
 *   · ⛔ ใบที่แบบงานยังไม่ครบ (proofBlockers) → matched[].proofHold บอกรายการที่ค้าง · ไม่ติ๊กส่งผลิตให้ เว้นแต่ allowHold มี orderId นั้น
 *     และคนกดมีสิทธิ์ orders.edit (ลง log เตือนไว้) · โฟลเดอร์ "(…ตย)" ไม่ติดด่าน (ทำตัวอย่างให้ลูกค้าดูก่อนอนุมัติ) · ใบที่ถูกกัน → heldBack[]
 * ตอบ { ...FolderMatchResult, alreadySent: [...] (จับคู่ได้แต่ติ๊กไว้แล้ว ไม่ทับ), applied: n, sampleApplied: n }
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm(["pack.ship", "proof.manage", "orders.edit"]);
  if (gate.res) return gate.res;

  let body: {
    paths?: string[];
    apply?: boolean;
    pick?: { folder: string; orderId: string }[];
    skip?: string[];
    folderFor?: Record<string, string>;
    sampleFiles?: string[];
    samplePlan?: string[];
    allowHold?: string[];
  };
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
  // โยนโฟลเดอร์ "งานจริง" ทับใบที่ติ๊กไปแล้ว = จับคู่ไม่ขึ้นอีก คนโยนนึกว่าไม่ติด
  // → บอกกลับไปว่าใบอยู่กองไหนแล้ว (รอปริ้น/ปริ้นแล้ว) จะได้ไม่ต้องหาอีก (15 ก.ย. 69)
  const already = matchFoldersToOrders(paths, all.filter((o) => o.productionSent), cards).matched.map((m) => {
    const o = all.find((x) => x.id === m.orderId);
    return { ...m, status: o?.status ?? "", printed: (o?.printCount ?? (o?.printedAt ? 1 : 0)) > 0, folderWas: o?.productionSent?.folder ?? "" };
  });

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
  const skipIds = new Set((body.skip ?? []).filter((x): x is string => typeof x === "string"));
  const by = gate.actor.name || gate.actor.username;
  const at = new Date().toISOString();

  // 🎁 โฟลเดอร์ (…ตย) ที่มีไฟล์ jpg → อ่านจำนวนตัวอย่างต่อลายจากชื่อไฟล์ เสนอแผนรอบตัวอย่างต่อใบ (ทั้งใบใหม่และใบที่ติ๊กไปแล้ว)
  const sampleGroups = groupSampleFiles((body.sampleFiles ?? []).filter((p) => typeof p === "string").slice(0, 5000));
  const sampleBuildFor = (m: FolderMatch, o: Order | undefined) => {
    if (!o || (o.tracking ?? "").trim()) return null;
    for (const f of [m.folder, ...(m.alsoFolders ?? [])]) {
      const files = sampleGroups.get(f);
      if (!files?.length) continue;
      const b = sampleRoundFromFiles(o, f, files, by, at);
      if (b) return { folder: f, build: b };
    }
    return null;
  };
  const decorate = (m: FolderMatch) => {
    const o = all.find((x) => x.id === m.orderId);
    const hit = sampleBuildFor(m, o);
    if (!hit || !o) return;
    const sent = (o.shipments ?? []).length;
    m.sample = {
      folder: hit.folder,
      qty: hit.build.qty,
      designs: hit.build.designs,
      unmatchedFiles: hit.build.unmatchedFiles,
      replacesPlan: (o.shipPlan ?? []).length > sent,
      lines: hit.build.round.proofs.map((p) => `${p.itemName} รูปที่ ${p.proof + 1} ×${p.qty}${p.ofQty ? `/${p.ofQty}` : ""}`),
      // แยกกล่องส่งตัวอย่างก่อน มีเหตุผลเดียวคือ "ยังเก็บเงินไม่ครบ" — ใบที่จ่ายครบแล้วตัวอย่างไปกล่องเดียวกันได้
      needsRound: hasUnpaidBalance(o),
    };
  };
  /** ⛔ รายการที่ยังขวางการผลิตของใบนี้ — โฟลเดอร์ตัวอย่าง "(…ตย)" ไม่ติด */
  const holdOf = (o: Order | undefined, folder: string) => (!o || isSampleFolderName(folder) ? [] : proofBlockers(o).map(proofBlockerLabel));
  /**
   * 📞📍 เบอร์/ที่อยู่ไม่ครบ = ใบนี้พิมพ์เอกสารไม่ได้สักใบ (กติกา 18 ก.ย. 69) → ห้ามดันเข้าไลน์ผลิตตั้งแต่แรก
   * เดิมด่านนี้อยู่ที่ "ตอนกดพิมพ์" อย่างเดียว งานจึงเข้าผลิตไปแล้วค่อยมาตันตอนปริ้น
   * (เจ้าของร้านแจ้ง 23 ก.ย. 69 · วัดจริงตอนนั้น 14 ใบโยนโฟลเดอร์ทั้งที่เบอร์/ที่อยู่ไม่ครบ)
   * ไม่ยกเว้นโฟลเดอร์ตัวอย่าง — รอบตัวอย่างก็ต้องมีใบปะหน้าส่งของเหมือนกัน
   */
  const contactOf = (o: Order | undefined) => (o ? orderContactProblems(o) : []);
  for (const m of result.matched) {
    const folders = [m.folder, ...(m.alsoFolders ?? [])];
    // มีหลายโฟลเดอร์ = ยังไม่รู้ว่าคนจะเลือกอันไหน → เตือนไว้ก่อนถ้ามีอันที่ไม่ใช่โฟลเดอร์ตัวอย่าง (ตัดสินจริงตอน apply ตามอันที่เลือก)
    const o = all.find((x) => x.id === m.orderId);
    const hold = holdOf(o, folders.find((f) => !isSampleFolderName(f)) ?? m.folder);
    if (hold.length) m.proofHold = hold;
    const bad = contactOf(o);
    if (bad.length) m.contactHold = bad;
  }
  result.matched.forEach(decorate);
  already.forEach(decorate);

  let applied = 0;
  let sampleApplied = 0;
  const heldBack: { orderId: string; customer: string; waiting: string[]; contact?: boolean }[] = [];
  if (body.apply) {
    const allowHold = new Set((body.allowHold ?? []).filter((x): x is string => typeof x === "string"));
    const mayForce = can(gate.actor, "orders.edit", await loadRolePerms());
    /** ใบล่าสุดหลังเขียน productionSent — แผนตัวอย่างต้องต่อยอดจากก้อนนี้ ไม่งั้นทับกัน */
    const latest = new Map(all.map((o) => [o.id, o]));
    // ใบที่มีหลายโฟลเดอร์: จดชื่อที่คนเลือก (ต้องเป็นโฟลเดอร์ของใบนั้นจริง) ไม่เลือก = อันที่ระบบจับได้
    const folderFor = body.folderFor ?? {};
    const folderOf = (m: (typeof result.matched)[number]) => {
      const want = folderFor[m.orderId];
      return want && [m.folder, ...(m.alsoFolders ?? [])].includes(want) ? want : m.folder;
    };
    const todo = [
      ...result.matched.filter((m) => !skipIds.has(m.orderId)).map((m) => ({ orderId: m.orderId, folder: folderOf(m) })),
      ...picks.filter((p) => !skipIds.has(p.orderId)),
    ];
    for (const t of todo) {
      const o = fresh.find((x) => x.id === t.orderId);
      if (!o || o.productionSent) continue;
      // 📞📍 เบอร์/ที่อยู่ไม่ครบ — กันตายตัว ติ๊กกลับเข้าไม่ได้ (ต่างจากแบบไม่ครบ) เพราะใบนี้ปริ้นอะไรไม่ได้เลย
      const badContact = contactOf(o);
      if (badContact.length) {
        heldBack.push({ orderId: o.id, customer: o.customer ?? "", waiting: badContact, contact: true });
        continue;
      }
      const hold = holdOf(o, t.folder);
      if (hold.length && !(mayForce && allowHold.has(o.id))) {
        heldBack.push({ orderId: o.id, customer: o.customer ?? "", waiting: hold });
        continue;
      }
      let next = withLog(
        { ...o, productionSent: { by, at, folder: t.folder } },
        by,
        "🏭 ส่งเข้าผลิตแล้ว (โยนโฟลเดอร์)",
        `โฟลเดอร์ “${t.folder}” — ใบขึ้นกอง “ส่งผลิตแล้ว รอปริ้น” ในคิวปริ้น`
      );
      // 🛒 โฟลเดอร์ = ไฟล์เข้าผลิตไปแล้วจริง จึงไม่กัน — แต่ใบยังรอของเข้า ต้องทิ้งรอยไว้ให้ตรวจย้อนหลังได้
      if (hold.length) next = withLog(next, by, "⚠️ ส่งเข้าผลิตทั้งที่แบบงานยังไม่ครบ", `ยังค้าง: ${hold.join(" · ")} — ใบงานปริ้นได้เฉพาะแบบ “ปริ้นเฉพาะที่พร้อม”`);
      if (orderAwaitingStock(o)) next = withLog(next, by, "⚠️ ส่งเข้าผลิตทั้งที่ยังรอของเข้า", o.needsPurchase?.note);
      const { error: e } = await updateOrder(sb, next);
      if (!e) {
        applied++;
        latest.set(next.id, next);
      }
    }
    // 🎁 ตั้งแผนแบ่งส่งรอบตัวอย่างจากชื่อไฟล์ + ติ๊ก "มีชิ้นงานตัวอย่าง" ให้รายการที่มีลายในรอบนี้
    const wantPlan = new Set((body.samplePlan ?? []).filter((x): x is string => typeof x === "string"));
    for (const m of [...result.matched, ...already]) {
      if (!wantPlan.has(m.orderId) || !m.sample) continue;
      const o = latest.get(m.orderId);
      const hit = sampleBuildFor(m, o);
      if (!o || !hit) continue;
      const sent = (o.shipments ?? []).length;
      // รอบที่ส่งไปแล้วคงไว้ · รอบที่ยังไม่ออก (แผนเก่า) แทนด้วยรอบตัวอย่างนี้
      const shipPlan = [...(o.shipPlan ?? []).slice(0, sent), hit.build.round];
      const itemsInRound = new Set(hit.build.round.proofs.map((p) => p.item));
      const items = o.items.map((it, i) => (itemsInRound.has(i) && !it.sampleRequired ? { ...it, sampleRequired: { by, at } } : it));
      const next = withLog(
        { ...o, shipPlan, items },
        by,
        "🎁 ตั้งแผนส่งตัวอย่างจากโฟลเดอร์",
        `รอบที่ ${sent + 1}: ${m.sample.lines.join(", ")} · รวม ${hit.build.qty} ชิ้น — จำนวนตามชื่อไฟล์ jpg ในโฟลเดอร์ “${hit.folder}”${m.sample.replacesPlan ? " · แทนแผนรอบที่ยังไม่ส่งเดิม" : ""}${hit.build.unmatchedFiles.length ? ` · ไฟล์ที่จับลายไม่ได้: ${hit.build.unmatchedFiles.join(", ")}` : ""}`
      );
      const { error: e } = await updateOrder(sb, next);
      if (!e) {
        sampleApplied++;
        latest.set(next.id, next);
      }
    }
  }
  return NextResponse.json({ ok: true, ...result, alreadySent: already, applied, sampleApplied, heldBack });
}

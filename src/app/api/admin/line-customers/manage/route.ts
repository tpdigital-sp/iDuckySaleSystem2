import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { CHAT_COLLECTION, CHAT_OVERRIDE_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import type { ChatRow } from "@/lib/server/line-chat";
import {
  chatIndexAge,
  chatUrlOf,
  core,
  dropChatRow,
  extractLineUserId,
  invalidateChatIndex,
  isWaitingForAdmin,
  loadChatByField,
  loadChatByIds,
  loadChatIds,
  loadChatIndex,
  loadChatPage,
  loadOaOwnerId,
  peekChatIndex,
  loadWhitelist,
  norm,
  patchChatRow,
  setBotAllowed,
  setOverride,
  setWhitelistMode,
} from "@/lib/server/line-chat";
import { fetchLineProfile } from "@/lib/server/notify";
import { CUSTOMER_TAGS, TAG_KEYS, toCustomerTag, type CustomerTag } from "@/lib/line-tags";

export const runtime = "nodejs";

/**
 * 💬 หลังบ้านของหน้า /admin/line-customers — ดูแลลูกค้า LINE + สวิตช์บอทรายคน
 *
 * ย้ายมาจากหน้า AdminBuddy (line-customers.html) ที่ยิง Firestore จากเบราว์เซอร์ตรง ๆ
 * ที่นี่ผ่านเซิร์ฟเวอร์ทั้งหมด: คีย์ Firebase ไม่หลุดออกหน้าเว็บ และผ่านด่านสิทธิ์ของระบบขายชุดเดียวกัน
 *
 * ค้นหา/กรอง/แบ่งหน้า ทำในหน่วยความจำจากดัชนีที่แคชไว้ (lib/server/line-chat.ts)
 * — กรอง "เปิด/ไม่เปิด AI" ต้องมองทั้งคลัง ไม่ใช่แค่ 20 คนที่เห็นอยู่ ไม่งั้นตัวกรองไม่มีความหมาย
 */

const PAGE_SIZE = 20;
const PERM = "orders.edit";
const NO_DB = () => NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase (FIREBASE_SERVICE_ACCOUNT_B64)" }, { status: 503 });

export interface LineCustomerRow {
  userId: string;
  /** ชื่อจาก LINE (null = ลูกค้าไม่เคยให้ชื่อ หรือแอดมินเพิ่มเข้ามาเอง) */
  displayName: string | null;
  /** ชื่อที่แอดมินตั้งทับ */
  adminAlias: string | null;
  adminNote: string;
  /** ป้ายความเร่งด่วนที่แอดมินติดไว้ */
  tag: CustomerTag | null;
  picture?: string;
  lastSeen?: string;
  /** บอทยกธงว่าต้องให้คนตอบ และยังคุยกันอยู่ในช่วงนี้ — คิวงานจริงของแอดมิน */
  waiting: boolean;
  /** เปิดให้บอทตอบคนนี้ */
  allowed: boolean;
  /** รหัสในลิงก์ OA Manager (ตั้งเอง หรือเก็บตกจากลิงก์ในออเดอร์) */
  managerUserId: string | null;
  /** ลิงก์เปิดห้องแชทใน OA Manager — null = ยังไม่รู้รหัสห้องของคนนี้ */
  chatUrl: string | null;
  /** ลิงก์นี้เก็บตกมาจากออเดอร์ ไม่ได้ตั้งไว้เอง */
  chatFromOrder: boolean;
}

export interface LineCustomersResponse {
  master: { enabled: boolean; allowedCount: number };
  rows: LineCustomerRow[];
  /** เข้าเงื่อนไขที่กรอง/ค้นอยู่ทั้งหมดกี่คน */
  total: number;
  /**
   * จำนวนคนในผลค้นหานี้ แยกตามตัวกรอง — ตัวเลขบนชิปตัวกรอง
   * followup = -1 แปลว่า "ยังไม่ได้อ่านทั้งคลังเลยนับไม่ได้" (หน้าจอซ่อนตัวเลขไว้ก่อน)
   */
  counts: { all: number; aiOn: number; adminOnly: number; followup: number };
  /** จำนวนคนแยกตามป้าย (นับหลังกรองสถานะแล้ว) + untagged = ยังไม่ติดป้าย · null = ยังนับไม่ได้ */
  tagCounts: Record<string, number> | null;
  /** มีห้องแชทในคลังทั้งหมดกี่ห้อง (-1 = รอบนี้ถามเฉพาะชุดที่กรอง ยังไม่รู้ยอดรวม) */
  indexed: number;
  page: number;
  pages: number;
  /** ดัชนีที่ใช้ตอบรอบนี้อ่านสดมานานแล้วกี่มิลลิวินาที — หน้าจอเอาไปบอกว่าข้อมูลเก่าแค่ไหน */
  ageMs: number | null;
  /** เลข OA ไว้ประกอบลิงก์ chat.line.biz ในกล่องแก้ไข */
  oaOwnerId: string;
}

export async function GET(req: Request) {
  const gate = await requirePerm(PERM);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NO_DB();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const filter = url.searchParams.get("filter") ?? "all";
  /** กรองตามป้าย — คนละแกนกับ filter ใช้ร่วมกันได้ (เช่น "รอแอดมินตอบ" + "ด่วนมาก") */
  const tag = url.searchParams.get("tag") ?? "";
  const fresh = url.searchParams.get("fresh") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  try {
    const [chatIds, master, oaOwnerId] = await Promise.all([loadChatIds(db, fresh), loadWhitelist(db), loadOaOwnerId(db)]);

    /**
     * เลือกทางให้ถูก — ตัวชี้ขาดคือ "ต้องกวาดทั้งคลังจริงไหม"
     *
     * ⚠️ เดิมอ่านทั้งคลังทุกครั้งที่เปิดหน้า = ค้างหลายวินาที + ค่าอ่าน ~9,500 ต่อครั้ง
     *    (เจ้าของร้านแจ้ง 15 ก.ย. 69 ว่าค้างที่ "กำลังเปิดคลังแชท…")
     *
     *  · ค้นหาชื่อ            → ต้องกวาดทั้งคลัง (Firestore ค้นแบบ "มีคำนี้อยู่กลางชื่อ" ไม่ได้)
     *  · "แอดมินตอบเอง" / "ยังไม่ติดป้าย" → คือ "ทุกคนยกเว้น…" ก็ต้องกวาดทั้งคลัง
     *  · กรองด้วยป้าย / รอแอดมินตอบ / บอทตอบ → ยิงถามเฉพาะชุดนั้นได้ (หลักสิบ-หลักร้อยห้อง)
     *  · ไม่ได้กรองอะไรเลย    → ดึงทีละหน้า ~20 ห้อง
     */
    const realTag = toCustomerTag(tag);
    const needsWholeIndex = !!q || filter === "admin-only" || tag === "untagged";

    /** ดัชนีเต็มที่เคยอ่านไว้ — มีอยู่แล้วก็ใช้ฟรี ครบกว่าและนับชิปได้ทุกตัว */
    const warm = fresh ? null : peekChatIndex();
    let rows = needsWholeIndex || fresh ? await loadChatIndex(db, fresh) : warm?.rows ?? null;

    /** ชุดย่อยที่ยิงถามมาเฉพาะกิจ (ยังไม่มีดัชนีเต็ม) — นับชิปได้แค่ในชุดนี้ */
    let subset: ChatRow[] | null = null;
    if (!rows) {
      if (realTag) subset = await loadChatByField(db, "adminTag", realTag);
      else if (filter === "followup") subset = await loadChatByField(db, "needsHumanFollowup", true);
      else if (filter === "ai-on") subset = await loadChatByIds(db, [...master.allowed]);
      // ชุดใหญ่เกินจะคุ้มยิงแยก → ถอยไปใช้ดัชนีเต็ม
      if (subset === null && (realTag || filter !== "all")) rows = await loadChatIndex(db, false);
    }

    let slice: ChatRow[];
    let total: number;
    let indexed: number;
    let counts: LineCustomersResponse["counts"] | null = null;
    let tagCounts: Record<string, number> | null = null;
    let safePage = page;
    let pages: number;

    if (!rows && subset) {
      /* ── ทางชุดย่อย: กรองที่เหลือในชุดที่ยิงถามมา (หลักสิบ-หลักร้อยห้อง) ── */
      let hits = subset;
      if (filter === "ai-on") hits = hits.filter((r) => master.allowed.has(r.userId));
      else if (filter === "followup") hits = hits.filter(isWaitingForAdmin);
      if (realTag) hits = hits.filter((r) => r.tag === realTag);

      total = hits.length;
      indexed = -1; // ยังไม่รู้ว่าทั้งคลังมีกี่ห้อง
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      safePage = Math.min(page, pages);
      slice = hits.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
      counts = { all: -1, aiOn: -1, adminOnly: -1, followup: filter === "followup" ? total : -1 };
      if (realTag) tagCounts = { [realTag]: total };
    } else if (!rows) {
      /* ── ทางเบา: ดึงเฉพาะหน้าที่ดูอยู่ (~20 ค่าอ่าน) ── */
      const paged = await loadChatPage(db, page, PAGE_SIZE);
      slice = paged.rows;
      total = paged.total;
      indexed = paged.total;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      safePage = Math.min(page, pages);
      // หน้านี้ยังไม่ได้อ่านทั้งคลัง จึงนับแยกตามชิปไม่ได้ — ส่งเท่าที่รู้ฟรี ๆ
      counts = { all: total, aiOn: master.allowed.size, adminOnly: Math.max(0, total - master.allowed.size), followup: -1 };
    } else {
      /* ── ทางเต็ม: ค้น/กรอง/นับ จากดัชนีในหน่วยความจำ ── */
      const needle = norm(q);
      const needleCore = core(q);
      const isId = /^U[0-9a-f]{32}$/i.test(q);

      // ค้นก่อน กรองทีหลัง — ตัวเลขบนชิปตัวกรองจะได้บอกว่า "ในผลค้นหานี้ มีกี่คนที่บอทตอบอยู่"
      let found = rows;
      if (q) {
        found = isId
          ? rows.filter((r) => r.userId.toLowerCase() === q.toLowerCase())
          : // ค้นทั้งชื่อ LINE และชื่อที่แอดมินตั้งทับ — แอดมินจำชื่อที่ตัวเองตั้งไว้มากกว่าชื่อ LINE
            rows
              .filter((r) => r.key.includes(needle) || (r.aliasKey && r.aliasKey.includes(needle)))
              .sort((a, b) => rank(a, needle, needleCore) - rank(b, needle, needleCore));
      }

      const aiOn = found.filter((r) => master.allowed.has(r.userId)).length;
      counts = { all: found.length, aiOn, adminOnly: found.length - aiOn, followup: found.filter(isWaitingForAdmin).length };

      let hits = found;
      if (filter === "ai-on") hits = found.filter((r) => master.allowed.has(r.userId));
      else if (filter === "admin-only") hits = found.filter((r) => !master.allowed.has(r.userId));
      else if (filter === "followup") hits = found.filter(isWaitingForAdmin);

      tagCounts = { untagged: hits.filter((r) => !r.tag).length };
      for (const k of TAG_KEYS) tagCounts[k] = hits.filter((r) => r.tag === k).length;
      if (tag === "untagged") hits = hits.filter((r) => !r.tag);
      else if (toCustomerTag(tag)) hits = hits.filter((r) => r.tag === tag);

      total = hits.length;
      indexed = rows.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      safePage = Math.min(page, pages);
      slice = hits.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    }

    const body: LineCustomersResponse = {
      master: { enabled: master.enabled, allowedCount: master.allowed.size },
      rows: slice.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        adminAlias: r.adminAlias,
        adminNote: r.adminNote,
        tag: r.tag,
        picture: r.picture,
        lastSeen: r.lastSeen,
        waiting: isWaitingForAdmin(r),
        allowed: master.allowed.has(r.userId),
        managerUserId: chatIds[r.userId]?.id ?? null,
        chatUrl: chatUrlOf(oaOwnerId, chatIds[r.userId]?.id),
        chatFromOrder: !!chatIds[r.userId]?.fromOrder,
      })),
      total,
      counts,
      tagCounts,
      indexed,
      page: safePage,
      pages,
      // ทางเบาดึงสดจาก Firestore ทุกครั้ง → ไม่มี "อายุข้อมูล" ให้บอก
      ageMs: rows ? chatIndexAge() : null,
      oaOwnerId,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const tagLabel = (k: CustomerTag) => CUSTOMER_TAGS.find((t) => t.key === k)?.label ?? k;

/** ชื่อตรงพอดี → ขึ้นต้นด้วยคำที่พิมพ์ → มีคำนี้อยู่ตรงไหนก็ได้ (ชื่อที่แอดมินตั้งเองมาก่อนชื่อ LINE) */
function rank(r: { name: string; adminAlias: string | null }, needle: string, needleCore: string): number {
  const names = [r.adminAlias, r.name].filter(Boolean) as string[];
  return Math.min(...names.map((n) => (core(n) === needleCore ? 0 : norm(n).startsWith(needle) ? 1 : 2)));
}

/**
 * เขียน/ล้าง "รหัสห้องแชท" ในตารางจับคู่
 *
 * ⚠️ ล้างค่าต้องลบทีละฟิลด์ ห้ามลบทั้งเอกสาร — เอกสารใบเดียวกันนี้ระบบแชทฝั่ง AdminBuddy
 *    ก็เขียนของตัวเองไว้ด้วย (เช่น displayName) ลบทั้งใบ = ของเขาหายไปด้วย
 */
async function writeChatId(db: FirebaseFirestore.Firestore, userId: string, chatId: string, by: string) {
  const ref = db.collection(CHAT_OVERRIDE_COLLECTION).doc(userId);
  if (chatId) {
    await ref.set(
      { managerUserId: chatId, managerUserIdBy: by, managerUserIdAt: new Date().toISOString(), source: "iducky-order" },
      { merge: true }
    );
  } else {
    await ref
      .set(
        {
          managerUserId: FieldValue.delete(),
          managerUserIdBy: FieldValue.delete(),
          managerUserIdAt: FieldValue.delete(),
        },
        { merge: true }
      )
      .catch(() => {});
  }
  setOverride(userId, chatId);
}

type Body = {
  action?: string;
  userId?: string;
  enabled?: boolean;
  allow?: boolean;
  adminAlias?: string;
  adminNote?: string;
  /** ลิงก์ OA Manager หรือ userId — ว่าง = ล้างค่าที่ตั้งทับไว้ */
  managerUrl?: string;
  /** ป้ายความเร่งด่วน — ค่าที่ไม่รู้จัก/ว่าง = ถอดป้าย */
  tag?: string;
  /** ช่องวางของกล่อง "เพิ่มลูกค้า" — รับได้ทั้ง userId และลิงก์ห้องแชท */
  input?: string;
  name?: string;
};

export async function POST(req: Request) {
  const gate = await requirePerm(PERM);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NO_DB();

  const b = (await req.json().catch(() => ({}))) as Body;
  const who = gate.actor.name || gate.actor.username;
  const uid = (b.userId ?? "").trim();
  /**
   * รหัสห้องแชทใน Firestore เป็น "ตัวอักษรนำ 1 ตัว + hex 32 ตัว" — ส่วนใหญ่ขึ้นต้น U (แชทเดี่ยว)
   * แต่มีห้องกลุ่มขึ้นต้น C ปนอยู่ด้วย บังคับ U อย่างเดียว = แก้/ลบห้องกลุ่มไม่ได้เลย
   */
  const needUid = () =>
    /^[A-Za-z][0-9a-f]{32}$/i.test(uid) ? null : NextResponse.json({ error: "รหัสห้องแชทไม่ถูกต้อง" }, { status: 400 });

  try {
    switch (b.action) {
      /* ── สวิตช์ใหญ่: บอทตอบเฉพาะคนในรายชื่อ หรือตอบทุกคน ── */
      case "master": {
        await setWhitelistMode(db, !!b.enabled);
        return NextResponse.json({
          ok: true,
          saved: b.enabled ? "เปิดโหมดเลือกตอบแล้ว — บอทตอบเฉพาะคนที่เปิดสวิตช์ไว้" : "ปิดโหมดเลือกตอบแล้ว — บอทตอบทุกคน",
        });
      }

      /* ── เปิด/ปิดบอทรายคน ── */
      case "toggle": {
        const bad = needUid();
        if (bad) return bad;
        await setBotAllowed(db, uid, !!b.allow);
        return NextResponse.json({ ok: true, saved: b.allow ? "เปิดให้บอทตอบลูกค้ารายนี้" : "ปิดบอท — ให้แอดมินตอบเอง" });
      }

      /* ── ติด/ถอดป้ายความเร่งด่วน ── */
      case "tag": {
        const bad = needUid();
        if (bad) return bad;
        const tag = toCustomerTag(b.tag); // ค่าที่ระบบไม่รู้จัก = ถอดป้าย
        await db
          .collection(CHAT_COLLECTION)
          .doc(uid)
          .set(
            tag
              ? { adminTag: tag, adminTagBy: who, adminTagAt: new Date().toISOString() }
              : { adminTag: FieldValue.delete(), adminTagBy: FieldValue.delete(), adminTagAt: FieldValue.delete() },
            { merge: true }
          );
        patchChatRow(uid, { tag });
        return NextResponse.json({ ok: true, tag, saved: tag ? `ติดป้าย "${tagLabel(tag)}" แล้ว` : "เอาป้ายออกแล้ว" });
      }

      /* ── แก้ชื่อที่ตั้งเอง + โน้ต + รหัสห้องแชทที่ตั้งทับ ── */
      case "edit": {
        const bad = needUid();
        if (bad) return bad;
        const alias = (b.adminAlias ?? "").trim();
        const note = (b.adminNote ?? "").trim();
        const raw = (b.managerUrl ?? "").trim();
        const managerUserId = raw ? extractLineUserId(raw) : "";
        if (raw && !managerUserId)
          return NextResponse.json({ error: "ลิงก์ห้องแชทไม่ถูกต้อง — ต้องมี chat/U ตามด้วยรหัส 32 ตัว" }, { status: 400 });

        await db.collection(CHAT_COLLECTION).doc(uid).set(
          {
            adminAlias: alias, // ว่างได้ — หน้าจอจะกลับไปใช้ชื่อจาก LINE เอง
            adminNote: note,
            // ชื่อย่อตัวเล็กที่ระบบแชทใช้ค้นหา ต้องตามชื่อที่ตั้งใหม่ ไม่งั้นค้นจากฝั่ง AdminBuddy ไม่เจอ
            ...(alias ? { nameLower: alias.toLowerCase() } : {}),
          },
          { merge: true }
        );
        patchChatRow(uid, { adminAlias: alias, adminNote: note });

        await writeChatId(db, uid, managerUserId || "", who);
        return NextResponse.json({ ok: true, saved: "บันทึกแล้ว", managerUserId: managerUserId || null });
      }

      /* ── ใส่/ล้างลิงก์ห้องแชทจากในตารางเลย (ไม่ต้องเปิดกล่องแก้ไข) ── */
      case "chat-link": {
        const bad = needUid();
        if (bad) return bad;
        const raw = (b.managerUrl ?? "").trim();
        const chatId = raw ? extractLineUserId(raw) : "";
        if (raw && !chatId)
          return NextResponse.json(
            { error: "หารหัสห้องแชทในลิงก์ไม่เจอ — ก๊อปทั้งลิงก์จากช่อง URL ตอนเปิดห้องแชทใน OA Manager มาวาง" },
            { status: 400 }
          );
        await writeChatId(db, uid, chatId || "", who);
        return NextResponse.json({
          ok: true,
          saved: chatId ? "ผูกลิงก์ห้องแชทแล้ว — กด 💬 เปิดแชท ได้เลย" : "ล้างลิงก์ห้องแชทแล้ว",
          managerUserId: chatId || null,
        });
      }

      /* ── เพิ่มลูกค้าเข้ารายชื่อด้วยมือ (วาง userId หรือลิงก์ห้องแชท) ── */
      case "add": {
        const id = extractLineUserId(b.input ?? "");
        if (!id) return NextResponse.json({ error: "ไม่พบรหัสลูกค้าในข้อความที่วางมา" }, { status: 400 });
        const typed = (b.name ?? "").trim();

        // ชื่อจาก LINE ก่อนเสมอ — ได้ก็เก็บรูปโปรไฟล์มาด้วย ไม่ได้ค่อยใช้ชื่อที่แอดมินพิมพ์
        const prof = await fetchLineProfile(id);
        const ref = db.collection(CHAT_COLLECTION).doc(id);
        const existing = await ref.get();

        const fields: Record<string, unknown> = { userId: id };
        if (prof?.name) {
          fields.displayName = prof.name;
          fields.nameLower = prof.name.toLowerCase();
          if (prof.picture) fields.pictureUrl = prof.picture;
        }
        if (typed) fields.adminAlias = typed;
        if (!existing.exists) {
          fields.messageCount = 0;
          fields.addedManually = true;
          fields.lastUserText = "(แอดมินเพิ่มเข้ามาเอง)";
          fields.lastSeen = FieldValue.serverTimestamp();
        }
        await ref.set(fields, { merge: true });
        await setBotAllowed(db, id, true);
        invalidateChatIndex(); // ลูกค้าคนนี้ยังไม่อยู่ในดัชนี — ต้องอ่านสดรอบหน้า

        const shown = prof?.name || typed;
        return NextResponse.json({
          ok: true,
          userId: id,
          saved: shown
            ? `เพิ่ม "${shown}" แล้ว — เปิดให้บอทตอบไว้ให้`
            : "เพิ่มแล้ว แต่ LINE ยังไม่ให้ชื่อมา (ลูกค้ายังไม่ได้เพิ่มบัญชีร้านเป็นเพื่อน) — กดแก้ไขเพื่อตั้งชื่อเองได้",
        });
      }

      /* ── ลบทิ้ง: ห้องแชท + ประวัติของคนนี้หายถาวร ── */
      case "delete": {
        const bad = needUid();
        if (bad) return bad;
        await setBotAllowed(db, uid, false);
        await db.collection(CHAT_COLLECTION).doc(uid).delete();
        await db.collection(CHAT_OVERRIDE_COLLECTION).doc(uid).delete().catch(() => {});
        dropChatRow(uid);
        return NextResponse.json({ ok: true, saved: "ลบลูกค้ารายนี้ออกจากคลังแชทแล้ว" });
      }

      default:
        return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

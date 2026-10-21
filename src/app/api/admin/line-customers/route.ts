import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import { core, loadChatIndexWithin, loadRecentRows, norm, type ChatRow } from "@/lib/server/line-chat";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isLineRoomId } from "@/lib/line-room-id";

export const runtime = "nodejs";

/**
 * ค้นหาลูกค้าจาก "คลังแชท LINE" ของร้าน (Firestore: ordersure/line-conversations)
 * ไว้ให้พนักงานผูก LINE กับออเดอร์ได้ในหน้าออเดอร์เลย ไม่ต้องสลับไปเปิดระบบแชทแล้วค๊อป userId
 *
 * ค้นแบบ "มีคำนี้อยู่ตรงไหนของชื่อก็ได้" — ชื่อ LINE มักเอาอีโมจิ/ชื่อเล่นไว้ท้ายชื่อ
 * ไม่พิมพ์อะไร = โชว์คนที่คุยกับร้านล่าสุด · พิมพ์ userId (U…) = ดึงคนนั้นตรง ๆ
 *
 * ดัชนีรายชื่อ (+แคช) อยู่ที่ lib/server/line-chat.ts — ใช้ก้อนเดียวกับหน้า /admin/line-customers
 */
const LIMIT = 12;
/** ค้นหาชื่อสั้น ๆ (เช่น "S") มีคนชื่อเดียวกันหลายสิบ — โชว์ได้มากขึ้นเพื่อเทียบรูปโปรไฟล์ */
const SEARCH_LIMIT = 24;

/**
 * ห่างจากการดึงสดครั้งก่อนอย่างน้อยเท่านี้ ถึงจะยอมดึงสดให้อัตโนมัติตอนค้นไม่เจอ
 * (ไม่จำกัด = พิมพ์ชื่อที่ไม่มีจริงทีละตัวอักษร จะอ่านทั้งคลังแชทรอบใหม่ทุกตัวอักษร)
 */
const AUTO_FRESH_GAP_MS = 20 * 1000;

/**
 * รอดัชนีเต็มได้นานสุดเท่านี้ ก่อนถอยไปตอบจากห้องล่าสุด (partial)
 * Netlify ให้ฟังก์ชัน 10 วิ — เผื่อเวลาอ่านห้องล่าสุด (~0.5 วิ) + ตอบกลับ · คลัง 11,420 ห้อง อ่านขนาน 16 ชุดจากไทย 1.8 วิ
 */
const INDEX_BUDGET_MS = 6000;
/** ห้องล่าสุดที่ใช้ตอบแบบ partial — 1,500 ห้อง ≈ ย้อนหลัง 2 สัปดาห์ (วัด 15 ต.ค. 69 · อ่าน 0.33 วิ) */
const RECENT_SCAN = 1500;
/** รายชื่อคุยล่าสุดหน้าละกี่คน */
const RECENT_PAGE = 30;

/** เที่ยงคืนวันนี้ตามเวลาไทย — ไว้นับ "คุยกับร้านวันนี้" */
function bangkokDayStart(): Date {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+07:00`);
}

type Row = { userId: string; name: string; picture?: string; lastSeen?: string; source?: "login"; /** 👥 ห้องกลุ่ม/ห้องรวม (21 ต.ค. 69) */ kind?: "group" | "room" };
let lastAutoFreshAt = 0;

/**
 * 👤 บัญชีลูกค้าที่ล็อกอินเว็บด้วย LINE (Supabase auth · user_metadata.line_user_id) — ทางค้นสำรองนอกคลังแชท
 *
 * ทำไม (OD-261014-9696 · 15 ต.ค. 69): ลูกค้า "PooM" ทัก OA และล็อกอิน LINE สั่งของ แต่ห้องของเขาไม่ถูกเก็บลงคลังแชท
 * (AdminBuddy ไม่ได้บันทึก) พนักงานค้นชื่อเจอแต่ Poom คนอื่น ผูกไม่ได้ทั้งที่ระบบรู้ userId อยู่แล้ว
 * userId จาก LINE Login ใช้กับ Messaging API ได้ (provider เดียวกัน — การ์ดยืนยันเงินเข้าส่งถึงคนนี้ได้จริง)
 * บัญชีมีแค่ ~150 (121 มี LINE) อ่านหน้าเดียว ~0.4 วิ · แคช 5 นาที
 */
let loginIndex: { at: number; rows: Row[] } | null = null;
const LOGIN_CACHE_MS = 5 * 60 * 1000;
async function loadLoginIndex(): Promise<Row[]> {
  if (loginIndex && Date.now() - loginIndex.at < LOGIN_CACHE_MS) return loginIndex.rows;
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      const meta = u.user_metadata as { line_user_id?: string; full_name?: string; name?: string; picture?: string } | undefined;
      if (!meta?.line_user_id) continue;
      rows.push({ userId: meta.line_user_id, name: (meta.full_name || meta.name || "").trim() || "(ไม่มีชื่อ)", picture: meta.picture || undefined, lastSeen: u.last_sign_in_at ?? undefined, source: "login" });
    }
    if (data.users.length < 1000) break;
  }
  loginIndex = { at: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  // orders.money = ฝ่ายบัญชีผูก LINE ลูกค้าที่หน้าใบหัก ณ ที่จ่าย (/admin/wht)
  const gate = await requirePerm(["orders.edit", "orders.money"]);
  if (gate.res) return gate.res;

  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const fresh = url.searchParams.get("fresh") === "1"; // เพิ่งทักลูกค้าในแชท → ดึงใหม่ ไม่เอาแคช

  try {
    // พิมพ์ userId มาตรง ๆ → ดึงใบเดียว (ไม่ต้องใช้ดัชนี)
    if (isLineRoomId(q)) {
      const d = await db.collection(CHAT_COLLECTION).doc(q).get();
      const customers: Row[] = d.exists
        ? [{ userId: d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string, ...(/^[CR]/.test(d.id) ? { kind: d.id[0] === "C" ? ("group" as const) : ("room" as const) } : {}) }]
        : [];
      return NextResponse.json({ customers, total: customers.length });
    }

    /**
     * ไม่พิมพ์อะไร = "คนที่คุยกับร้านล่าสุด" แบ่งหน้า — อ่านสดจาก Firestore เรียง lastSeen (ไม่ผ่านดัชนีเต็ม · ~0.3 วิ)
     * ผู้ใช้ขอ 15 ต.ค. 69: อยากเห็นคนที่คุยวันนี้ทั้งหมด (เดิมตัดที่ 12 คนแรก) → หน้าละ RECENT_PAGE + นับ "วันนี้" ให้ดูว่าต้องเปิดอีกกี่หน้า
     */
    if (q.length < 1) {
      const page = Math.max(1, Math.min(200, Number(url.searchParams.get("page")) || 1));
      const dayStart = bangkokDayStart();
      const [rows, todayCount] = await Promise.all([
        loadRecentRows(db, RECENT_PAGE + 1, (page - 1) * RECENT_PAGE),
        db.collection(CHAT_COLLECTION).where("lastSeen", ">=", dayStart).count().get().then((c) => c.data().count),
      ]);
      const pageRows = rows.slice(0, RECENT_PAGE);
      return NextResponse.json({
        customers: pageRows.map((r): Row => ({ userId: r.userId, name: r.name, picture: r.picture, lastSeen: r.lastSeen, kind: r.kind })),
        total: todayCount,
        exact: 0,
        recent: true,
        page,
        hasMore: rows.length > RECENT_PAGE,
        todayCount, // คุยกับร้านตั้งแต่เที่ยงคืน (เวลาไทย) กี่ห้อง
        refreshed: true,
        partial: false,
      });
    }

    const needle = norm(q);
    const needleCore = core(q);
    /**
     * จัดอันดับผลค้นหา: ชื่อตรงพอดี → ขึ้นต้นด้วยคำที่พิมพ์ → มีคำนี้อยู่ตรงไหนก็ได้
     * (ในแต่ละชั้นยังเรียงคนคุยล่าสุดไว้บน เพราะดัชนีเรียงมาแล้วและ sort ของ JS เสถียร)
     *
     * ⚠️ ไม่จัดอันดับ = ชื่อสั้นอย่าง "S" หาไม่เจอ: มีชื่อที่ "มีตัว s" 1,469 คน
     *    คนชื่อ S จริงจมอยู่ท้ายแถว แล้วโชว์แค่ 12 คนแรก (พนักงานแจ้ง 14 ก.ย. 69 · OD-260910-9595)
     */
    const rank = (name: string): number => (core(name) === needleCore ? 0 : norm(name).startsWith(needle) ? 1 : 2);
    const search = (rows: ChatRow[]): ChatRow[] =>
      q.length < 1 ? rows : rows.filter((r) => r.key.includes(needle)).sort((a, b) => rank(a.name) - rank(b.name));

    /**
     * ดัชนีเต็ม (11,000+ ห้อง) อ่านไม่ทันในเวลาที่ให้ → ตอบจาก "ห้องที่คุยล่าสุด" ไปก่อน (partial)
     * หน้าเว็บจะขอซ้ำเองจนดัชนีเต็มพร้อม — ดีกว่ารอจนฟังก์ชันหมดเวลาแล้วช่องค้นหาเงียบ
     * (พนักงานแจ้ง 15 ต.ค. 69 · OD-261014-9696: พิมพ์ชื่อแล้วไม่ขึ้นอะไรเลย ทั้งที่ชื่อมีในคลัง)
     */
    let rows = await loadChatIndexWithin(db, INDEX_BUDGET_MS, fresh);
    const partial = rows === null;
    if (rows === null) rows = (await loadRecentRows(db, RECENT_SCAN)).filter((r) => r.lastSeen);
    let hits = search(rows);
    let refreshed = fresh;

    /**
     * ค้นไม่เจอสักคน = ลูกค้ามัก "เพิ่งทักเข้ามาครั้งแรก" — ห้องแชทเพิ่งเกิด ยังไม่อยู่ในดัชนีที่แคชไว้
     * (พนักงานแจ้ง 14 ก.ย. 69: ลูกค้าทักแล้วแต่พิมพ์ชื่อหาไม่เจอ → ผูกไม่ได้)
     * → ดึงสดให้เองรอบหนึ่งแล้วค้นซ้ำ จะได้ไม่ต้องรอแคชหมดอายุ 5 นาที
     * (ตอบแบบ partial อยู่ = อ่านจากคลังสด ๆ อยู่แล้ว ไม่ต้องสั่งซ้ำ)
     */
    if (!partial && !hits.length && q.length >= 2 && !refreshed && Date.now() - lastAutoFreshAt > AUTO_FRESH_GAP_MS) {
      lastAutoFreshAt = Date.now();
      const freshRows = await loadChatIndexWithin(db, INDEX_BUDGET_MS, true);
      if (freshRows) {
        hits = search(freshRows);
        refreshed = true;
      }
    }

    // 👤 บัญชีที่ล็อกอินด้วย LINE ที่ชื่อตรง — เติมต่อท้าย (คนที่อยู่ในคลังแชทอยู่แล้วไม่ซ้ำ) · อ่านไม่ได้ก็ข้าม ไม่ทำให้ค้นหาล้ม
    const seen = new Set(hits.map((r) => r.userId));
    const loginHits = q.length >= 2 ? (await loadLoginIndex().catch(() => [] as Row[])).filter((r) => !seen.has(r.userId) && norm(r.name).includes(needle)) : [];
    const customers: Row[] = [
      ...hits.slice(0, q.length < 1 ? LIMIT : SEARCH_LIMIT).map((r): Row => ({ userId: r.userId, name: r.name, picture: r.picture, lastSeen: r.lastSeen, kind: r.kind })),
      ...loginHits.sort((a, b) => rank(a.name) - rank(b.name)).slice(0, SEARCH_LIMIT),
    ];

    return NextResponse.json({
      customers,
      total: hits.length + loginHits.length, // เจอทั้งหมดกี่คน (โชว์แค่ LIMIT) — หน้าเว็บเอาไปบอกให้พิมพ์แคบลง
      exact: q.length < 1 ? 0 : customers.filter((r) => core(r.name) === needleCore).length, // ชื่อตรงพอดีกี่คน — หน้าเว็บบอกให้ดูรูปโปรไฟล์เทียบ
      recent: q.length < 1,
      refreshed, // ดึงรายชื่อสดมาแล้วรอบนี้ — หน้าเว็บเอาไปบอกว่า "ดึงใหม่แล้วก็ยังไม่เจอ"
      indexed: rows.length, // มีห้องแชทในคลังกี่ห้อง (ไว้ดูว่าคลังแชทว่างหรือเปล่า)
      partial, // true = ค้นจากห้องล่าสุด RECENT_SCAN ห้องเท่านั้น ดัชนีเต็มยังอ่านไม่เสร็จ — หน้าเว็บขอซ้ำอีกครั้ง
    });
  } catch (e) {
    // ⚠️ ต้องตอบ 500 จริง ๆ — หน้าเว็บแยก "ค้นไม่เจอ" กับ "ค้นไม่สำเร็จ" ให้พนักงานรู้ว่าต้องลองใหม่ ไม่ใช่ชื่อไม่มี
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

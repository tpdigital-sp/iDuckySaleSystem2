import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore, setBotPause, patchChatRow } from "@/lib/server/line-chat";
import { inBackground } from "@/lib/server/background";
import { productFlex } from "@/lib/server/product-card";
import { classifyRoom } from "@/lib/server/chat-urgency";
import { syncCurrentCycleSoon } from "@/lib/server/chat-stats-sync";
import { closePendingDrafts } from "@/lib/server/bot-drafts";
import { toEmojis } from "@/lib/server/line-oa-manager";

/**
 * 💬 แอดมินตอบลูกค้า LINE จากหน้า /admin/chatbot/chats (เจ้าของร้านขอ 9 ต.ค. 69 15:20 — แบบผสม: ใช้กับเคสที่บอทส่งต่อ/ลูกค้าที่เปิดบอท
 * แชททั่วไปยังตอบใน OA Manager เพราะส่งจากที่นี่ = push ผ่าน Messaging API นับโควตา 35,000/เดือน)
 *
 * POST { id, text?, emojis?, imageUrl?, card?: { name, url, image?, priceMin?, priceMax? }, pauseMinutes?: number }
 *   emojis = อิโมจิ LINE จากข้อความตอบกลับ (⊕ ในหน้าแชท · 14 ต.ค. 69): "$" ใน text ที่ index นั้นกลายเป็นรูป (LINE รับไม่เกิน 20 ตัว)
 *   1. push เข้า LINE ด้วย LINE_MESSAGING_ACCESS_TOKEN (token เดียวกับ notify.ts) — 429 = โควตาหมด บอกให้ไปตอบใน OA Manager
 *   2. เขียน line-conversations/{id}/log role "admin" (หน้าแชทโชว์ + บอทเห็นว่าแอดมินตอบแล้ว)
 *   3. อัปเดตห้อง: lastSeen · needsHumanFollowup=false · lastAdminAt · และพักบอท (botPausedUntil — ฟิลด์เดียวกับปุ่ม ⏸ ใน /admin/line-customers
 *      ซึ่ง Build AI Request ของ n8n เช็คอยู่แล้ว) ค่าเริ่มต้น 30 นาที · pauseMinutes=0 = ไม่พัก
 */
const COL = "line-conversations";

type Card = { name?: string; url?: string; image?: string; priceMin?: number; priceMax?: number; priceUnit?: string };
type FileAtt = { url?: string; name?: string; size?: number };
type Body = { id?: string; text?: string; emojis?: unknown; imageUrl?: string; card?: Card; file?: FileAtt; pauseMinutes?: number };
/** ลบตัว "$" ตำแหน่งอิโมจิออกจากข้อความ (ไล่จากท้ายจะได้ไม่ต้องเลื่อน index) */
function stripEmojiMarks(text: string, emojis: { index: number }[]): string {
  let out = text;
  for (const e of [...emojis].sort((a, b) => b.index - a.index)) out = out.slice(0, e.index) + out.slice(e.index + 1);
  return out.trim();
}
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function POST(req: Request) {
  const gate = await requirePerm("chat.reply");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN)" }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Body;
  const id = String(b.id ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const text = String(b.text ?? "").trim().slice(0, 2000);
  // หน้าเว็บคิด index จากข้อความที่ trim แล้ว · ตัวที่ไม่ชี้ "$" ถูกตัดทิ้ง (กัน LINE 400)
  const emojis = text ? toEmojis(b.emojis, text).slice(0, 20).map(({ index, productId, emojiId }) => ({ index, productId, emojiId })) : [];
  const imageUrl = String(b.imageUrl ?? "").trim();
  const card = b.card && b.card.url && /^https:\/\/(www\.)?iduckystore\.com\//.test(String(b.card.url)) ? b.card : null;
  if (imageUrl && !/^https:\/\//.test(imageUrl)) return NextResponse.json({ error: "รูปต้องเป็นลิงก์ https" }, { status: 400 });
  // 📎 ไฟล์งาน: LINE Messaging API ส่งข้อความชนิดไฟล์ไม่ได้ (ส่งได้แค่ใน OA Manager) → ส่งเป็นข้อความ + ลิงก์ดาวน์โหลด
  const file = b.file && /^https:\/\//.test(String(b.file.url ?? "")) ? { url: String(b.file.url), name: String(b.file.name ?? "ไฟล์").slice(0, 120), size: Number(b.file.size ?? 0) || 0 } : null;
  if (!text && !imageUrl && !card && !file) return NextResponse.json({ error: "ยังไม่ได้พิมพ์ข้อความ" }, { status: 400 });

  const messages: unknown[] = [];
  if (text) messages.push({ type: "text", text, ...(emojis.length ? { emojis } : {}) });
  if (imageUrl) messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  if (card) messages.push(productFlex([card]));
  if (file) messages.push({ type: "text", text: `📎 ไฟล์: ${file.name}${file.size ? ` (${fmtSize(file.size)})` : ""}\nดาวน์โหลด: ${file.url}` });

  // 1) ส่งเข้า LINE — ตอบกลับทันทีไม่ได้ (reply token อายุ 1 นาที) จึงเป็น push เสมอ
  let res: Response;
  try {
    res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: id, messages }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return NextResponse.json({ error: `ต่อ LINE ไม่ได้ — ${(e as Error).message}` }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const quota = res.status === 429;
    return NextResponse.json(
      {
        error: quota
          ? "โควตาข้อความ LINE เดือนนี้หมดแล้ว — ไปตอบลูกค้ารายนี้ใน LINE OA Manager แทนนะคะ"
          : `LINE ไม่รับข้อความ (HTTP ${res.status}) ${detail.slice(0, 160)}`,
        quota,
      },
      { status: quota ? 429 : 502 }
    );
  }

  // 2) บันทึกลง log ของห้อง + 3) อัปเดตห้อง/พักบอท
  const who = gate.actor.name || gate.actor.username;
  const now = new Date();
  const ref = db.collection(COL).doc(id);
  const entry = {
    role: "admin",
    // log: ตัด "$" ของอิโมจิ LINE ออก (บอท/หน้าแชทอ่านเป็นตัวอักษร) · เก็บ lineEmojis ไว้เผื่อวาดรูปทีหลัง
    text: (emojis.length ? stripEmojiMarks(text, emojis) : text) || (imageUrl ? "(ส่งรูป)" : card ? `(ส่งการ์ดสินค้า ${card.name ?? ""})` : file ? `(ส่งไฟล์ ${file.name})` : ""),
    ...(emojis.length ? { lineEmojis: emojis } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(card ? { card: { name: card.name ?? "", url: card.url ?? "" } } : {}),
    ...(file ? { file } : {}),
    at: now,
    by: who,
    mode: "web",
  };
  const pauseMin = b.pauseMinutes === undefined ? 30 : Math.max(0, Math.min(24 * 60, Number(b.pauseMinutes) || 0));
  const pausedUntil = pauseMin > 0 ? new Date(now.getTime() + pauseMin * 60_000) : null;
  try {
    await Promise.all([
      ref.collection("log").add(entry),
      ref.set({ lastSeen: now, lastAdminAt: now, lastAdminBy: who, needsHumanFollowup: false, handoffPending: FieldValue.delete() }, { merge: true }),
      pausedUntil ? setBotPause(db, id, pausedUntil) : Promise.resolve(),
    ]);
    if (pausedUntil) patchChatRow(id, { pausedUntil: pausedUntil.toISOString() });
    // 📊 สถิติตอบแชท/ค่าคอม: ซิงก์รอบปัจจุบันให้เองหลังตอบ (เจ้าของร้าน 9 ต.ค. 69 "ไม่ต้องกด 💾 บันทึกรอบนี้") — หน้าค่าคอมเดิมฟัง doc อยู่ ขยับเอง
    inBackground("chat-stats sync", syncCurrentCycleSoon(db));
    // 📝 แอดมินพิมพ์ตอบเองแล้ว → ร่างของบอทที่ค้างในห้องนี้ไม่ต้องส่ง (โหมดร่าง 13 ต.ค. 69)
    inBackground("close bot drafts", closePendingDrafts(db, id, who));
    // 🤖🏷 ร้านเพิ่งตอบ → ให้ AI ประเมินป้ายความเร่งด่วนใหม่ทันที (ตอบครบแล้ว 🔴 ลดเป็น 🟢 ไม่ต้องรอลูกค้าพิมพ์มาอีก)
    inBackground("chat urgency", classifyRoom(id));
  } catch (e) {
    // ส่งถึงลูกค้าแล้ว แต่จดไม่ได้ — บอกให้รู้ ไม่ใช่โยน error ทั้งก้อน (ข้อความไปแล้ว ส่งซ้ำไม่ได้)
    return NextResponse.json({ ok: true, sent: true, logged: false, warn: `ส่งถึงลูกค้าแล้ว แต่บันทึกลงห้องแชทไม่ได้: ${(e as Error).message}` });
  }
  return NextResponse.json({
    ok: true,
    sent: true,
    logged: true,
    entry: { ...entry, at: now.toISOString() },
    pausedUntil: pausedUntil ? pausedUntil.toISOString() : null,
  });
}

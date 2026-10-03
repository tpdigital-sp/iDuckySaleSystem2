import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { db, iso, KB_COL, pushKnowledge } from "@/lib/server/bot-kb";
import type { KbImage, KbItem } from "@/lib/bot-kb-types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 📚 คลังความรู้บอท (Firestore knowledge-base · ย้ายจาก AdminBuddy knowledge.html 3 ต.ค. 69)
 *
 * GET  → ทุกรายการ (~1,200 · ~700KB) เรียงใหม่สุดก่อน — หน้าจอกรอง/ค้น/นับเองทั้งหมด แคช 60 วิ
 * POST { action: "save" | "delete" | "bulk" | "sync" }
 *   save   บันทึก/แก้ 1 รายการ → ส่งเข้า Pinecone (n8n knowledge-ingest) แบบเดิม · taskId = ปิดงาน Leader Inbox
 *   delete ลบ + สั่ง n8n ลบออกจาก Pinecone (action:'delete' + docId แบบเดิม)
 *   bulk   บันทึก Q&A ที่ AI สร้าง (วางเนื้อหา/จากเว็บ) ทีละก้อน ≤8 — หน้าจอแบ่งส่ง กันเกิน 30 วิของ Netlify
 *   sync   ส่งรายการที่ระบุ (≤8) เข้า Pinecone ใหม่ — "ซิงก์ทั้งหมด" หน้าจอวนเรียกทีละก้อน (เดิมวนในเบราว์เซอร์ 500ms/ข้อ)
 */

let cache: { at: number; items: KbItem[] } | null = null;
const TTL = 60_000;

async function loadAll(): Promise<KbItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  const snap = await db().collection(KB_COL).get();
  const items: KbItem[] = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      title: String(x.title ?? ""),
      content: String(x.content ?? ""),
      type: String(x.type ?? ""),
      ...(x.source ? { source: String(x.source) } : {}),
      ...(x.localPath ? { localPath: String(x.localPath) } : {}),
      ...(x.linkedPriceLink ? { linkedPriceLink: String(x.linkedPriceLink), linkedPriceLinkUrl: String(x.linkedPriceLinkUrl ?? "") } : {}),
      ...(Array.isArray(x.images) && x.images.length ? { images: x.images as KbImage[] } : {}),
      ...(x.createdByName ? { createdByName: String(x.createdByName) } : {}),
      ...(x.updatedByName ? { updatedByName: String(x.updatedByName) } : {}),
      timestamp: iso(x.timestamp ?? x.createdAt ?? x.updatedAt),
    };
  });
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  cache = { at: Date.now(), items };
  return items;
}

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (new URL(req.url).searchParams.get("fresh")) cache = null;
  try {
    return NextResponse.json({ items: await loadAll() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดคลังความรู้ไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}

type Body = {
  action?: string;
  id?: string;
  title?: string;
  content?: string;
  type?: string;
  localPath?: string;
  linkedPriceLink?: string;
  linkedPriceLinkUrl?: string;
  images?: KbImage[];
  taskId?: string;
  source?: string;
  items?: { q?: string; a?: string; type?: string }[];
  ids?: string[];
};

const str = (v: unknown, max = 20_000) => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const who = { user: gate.actor.username, name: gate.actor.name || gate.actor.username };
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const col = db().collection(KB_COL);

  try {
    if (b.action === "save") {
      const title = str(b.title, 500);
      const content = str(b.content);
      const type = str(b.type, 40) || "tip";
      if (!title || !content) return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน — ต้องมีหัวข้อและเนื้อหา" }, { status: 400 });
      const data = {
        title,
        content,
        type,
        localPath: str(b.localPath, 500),
        linkedPriceLink: str(b.linkedPriceLink, 40),
        linkedPriceLinkUrl: str(b.linkedPriceLinkUrl, 1000),
        images: (b.images ?? []).filter((i) => i?.url).slice(0, 30).map((i) => ({ url: i.url, storagePath: i.storagePath ?? "", label: i.label ?? "" })),
        timestamp: FieldValue.serverTimestamp(),
      };
      let id = str(b.id, 100);
      if (id) await col.doc(id).update({ ...data, updatedBy: who.user, updatedByName: who.name, updatedAt: FieldValue.serverTimestamp() });
      else id = (await col.add({ ...data, createdBy: who.user, createdByName: who.name, createdAt: FieldValue.serverTimestamp() })).id;
      // 🙋 มาจาก Leader Inbox → ปิดงานนั้น (เหมือน activeTaskId ของหน้าเดิม · เฉพาะตอนเพิ่มใหม่)
      if (b.taskId && !b.id) await db().collection("leader-tasks").doc(str(b.taskId, 100)).update({ status: "solved" }).catch(() => undefined);
      cache = null;
      const pushed = await pushKnowledge({ question: title, answer: content, type });
      return NextResponse.json({ ok: true, id, pushed });
    }

    if (b.action === "delete") {
      const id = str(b.id, 100);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
      const x = snap.data() ?? {};
      await ref.delete();
      cache = null;
      const pushed = await pushKnowledge({ action: "delete", question: String(x.title ?? ""), answer: String(x.content ?? ""), type: String(x.type || "tip"), docId: id });
      return NextResponse.json({ ok: true, pushed });
    }

    if (b.action === "bulk") {
      const list = (b.items ?? []).filter((i) => str(i.q) && str(i.a)).slice(0, 8);
      const source = str(b.source, 1000) || "paste";
      let saved = 0;
      let pushed = 0;
      for (const it of list) {
        const type = str(it.type, 40) || (source === "paste" ? "paste-import" : "web-import");
        await col.add({
          title: str(it.q, 500),
          content: str(it.a),
          type,
          source,
          createdBy: who.user,
          createdByName: who.name,
          createdAt: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp(),
        });
        saved++;
        if (await pushKnowledge({ question: str(it.q, 500), answer: str(it.a), type })) pushed++;
      }
      cache = null;
      return NextResponse.json({ ok: true, saved, pushed });
    }

    if (b.action === "sync") {
      const ids = (b.ids ?? []).map((i) => str(i, 100)).filter(Boolean).slice(0, 8);
      const docs = await Promise.all(ids.map((id) => col.doc(id).get()));
      let ok = 0;
      for (let i = 0; i < docs.length; i++) {
        const x = docs[i].data();
        if (!x) continue;
        if (await pushKnowledge({ question: String(x.title ?? ""), answer: String(x.content ?? ""), type: String(x.type || "unknown") })) ok++;
        if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 500)); // เว้นจังหวะแบบเดิม ไม่ให้ n8n ล้น
      }
      return NextResponse.json({ ok: true, sent: ok, failed: docs.length - ok });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}

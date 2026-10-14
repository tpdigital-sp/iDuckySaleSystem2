import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { loadOaOwnerId } from "@/lib/server/line-chat";
import { fetchOaSavedReplies, OaError, parseOaSavedReplies, toEmojis, type OaSavedReply } from "@/lib/server/line-oa-manager";

export const runtime = "nodejs";

/**
 * 💬 ข้อความตอบกลับจาก LINE OA Manager (หน้า /admin/chatbot/saved-replies · เจ้าของร้านขอ 14 ต.ค. 69)
 *   GET                              → สำเนาล่าสุดที่เก็บไว้ (Firestore oaSavedReplies + settings/oa-saved-replies)
 *   POST { action: "sync" }          → ดึงใหม่จาก chat.line.biz ด้วยคุกกี้ OA (ตั้งที่หน้า ลูกค้า LINE ⚙️) แล้วเขียนทับสำเนา
 *   POST { action: "import", json }  → ทางสำรอง: วาง JSON ที่ก๊อปจาก DevTools (Network → savedReplies → Response)
 *   POST { action: "save", id?, title, text, emojis?, favorite? } → แก้/สร้างในสำเนาของเรา (ชื่อ ≤30 · ข้อความ ≤1000 ตาม OA)
 *   POST { action: "favorite", id, favorite } · { action: "delete", id }
 *   ⚠️ แก้/ลบที่นี่ = แก้สำเนาของเรา ไม่ยิงกลับ LINE OA · กดโหลดจาก OA ใหม่ = เขียนทับทั้งชุด (หน้าจอเตือนก่อน)
 * เก็บสำเนาไว้เอง = เปิดหน้าเร็ว + คุกกี้หมดอายุก็ยังดูของเดิมได้
 * สิทธิ์: ตอบลูกค้า LINE (chat.reply) หรือแก้ออเดอร์ (orders.edit) — อ่านอย่างเดียว ไม่แก้อะไรใน OA
 */
const PERMS = ["chat.reply", "orders.edit"] as const;
const COL = "oaSavedReplies";
const META = { col: "settings", id: "oa-saved-replies" } as const;

const TITLE_MAX = 30;
const TEXT_MAX = 1000;

type Meta = { fetchedAt: string; fetchedBy: string; source: string; count: number };

async function readAll(db: FirebaseFirestore.Firestore) {
  const [snap, meta] = await Promise.all([db.collection(COL).get(), db.collection(META.col).doc(META.id).get()]);
  const items = snap.docs
    .map((d) => ({ ...(d.data() as OaSavedReply & { order?: number }), id: d.id }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(({ order: _o, ...r }) => r);
  return { items, meta: meta.exists ? (meta.data() as Meta) : null };
}

/** เขียนทับทั้งชุด — ตัวที่ OA ลบไปแล้วก็ลบออกจากสำเนาด้วย */
async function writeAll(db: FirebaseFirestore.Firestore, replies: OaSavedReply[], meta: Meta) {
  const old = await db.collection(COL).listDocuments();
  const keep = new Set<string>();
  let batch = db.batch();
  let n = 0;
  const flush = async () => {
    if (n) await batch.commit();
    batch = db.batch();
    n = 0;
  };
  for (const [i, r] of replies.entries()) {
    const id = r.id.replace(/[/.#[\]]/g, "_").slice(0, 200) || `idx-${i}`;
    keep.add(id);
    batch.set(db.collection(COL).doc(id), JSON.parse(JSON.stringify({ ...r, order: i })));
    if (++n >= 400) await flush();
  }
  for (const d of old) {
    if (keep.has(d.id)) continue;
    batch.delete(d);
    if (++n >= 400) await flush();
  }
  batch.set(db.collection(META.col).doc(META.id), meta);
  n++;
  await flush();
}

export async function GET() {
  const gate = await requirePerm([...PERMS]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  return NextResponse.json(await readAll(db), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requirePerm([...PERMS]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; json?: string; id?: string; title?: string; text?: string; emojis?: unknown; favorite?: boolean };
  const by = gate.actor.name || gate.actor.username;

  if (b.action === "sync") {
    try {
      const r = await fetchOaSavedReplies(await loadOaOwnerId(db));
      if (!r.replies.length) {
        return NextResponse.json(
          { error: `ต่อ OA ได้ (${r.path}) แต่อ่านข้อความตอบกลับไม่ออก — ส่งรายละเอียดนี้ให้ทีมเทคนิค`, sampleKeys: r.sampleKeys, sample: r.sample },
          { status: 422 }
        );
      }
      await writeAll(db, r.replies, { fetchedAt: new Date().toISOString(), fetchedBy: by, source: r.path, count: r.replies.length });
      return NextResponse.json({ ok: true, ...(await readAll(db)), saved: `โหลดจาก LINE OA แล้ว ${r.replies.length} ข้อความ` });
    } catch (e) {
      const err = e as OaError;
      return NextResponse.json({ error: err.message + (err.detail ? ` · ${err.detail}` : "") }, { status: err.status >= 400 ? err.status : 502 });
    }
  }

  if (b.action === "import") {
    let body: unknown;
    try {
      body = JSON.parse(String(b.json ?? ""));
    } catch {
      return NextResponse.json({ error: "ข้อความที่วางไม่ใช่ JSON — ก๊อปจากแท็บ Response ของคำขอ savedReplies ใน DevTools" }, { status: 400 });
    }
    const replies = parseOaSavedReplies(body);
    if (!replies.length) return NextResponse.json({ error: "อ่านข้อความตอบกลับจาก JSON นี้ไม่ออก" }, { status: 422 });
    await writeAll(db, replies, { fetchedAt: new Date().toISOString(), fetchedBy: by, source: "วาง JSON", count: replies.length });
    return NextResponse.json({ ok: true, ...(await readAll(db)), saved: `นำเข้าแล้ว ${replies.length} ข้อความ` });
  }

  if (b.action === "save" || b.action === "favorite" || b.action === "delete") {
    const id = String(b.id ?? "").trim();
    if (id && !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const ref = id ? db.collection(COL).doc(id) : null;
    const cur = ref ? await ref.get() : null;
    if (b.action !== "save" || id) {
      if (!cur?.exists) return NextResponse.json({ error: "ไม่พบข้อความนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
    }
    if (b.action === "delete") {
      await ref!.delete();
      return NextResponse.json({ ok: true, ...(await readAll(db)), saved: "ลบแล้ว" });
    }
    if (b.action === "favorite") {
      await ref!.set({ favorite: !!b.favorite }, { merge: true });
      return NextResponse.json({ ok: true, ...(await readAll(db)), saved: b.favorite ? "ติดดาวแล้ว" : "เอาดาวออกแล้ว" });
    }
    const title = String(b.title ?? "").trim();
    const text = String(b.text ?? "").replace(/\r\n/g, "\n");
    if (!title) return NextResponse.json({ error: "ใส่ชื่อก่อน" }, { status: 400 });
    if ([...title].length > TITLE_MAX) return NextResponse.json({ error: `ชื่อยาวเกิน ${TITLE_MAX} ตัวอักษร` }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "ใส่ข้อความก่อน" }, { status: 400 });
    if ([...text].length > TEXT_MAX) return NextResponse.json({ error: `ข้อความยาวเกิน ${TEXT_MAX} ตัวอักษร` }, { status: 400 });
    // อิโมจิ LINE: หน้าจอส่ง index ใหม่ตามตำแหน่ง "$" หลังแก้มาแล้ว · ที่ไม่ชี้ "$" ถูกตัดทิ้ง
    const emojis = toEmojis(b.emojis, text);
    const fields = { title, messages: [{ type: "text", text, ...(emojis.length ? { emojis } : {}) }], editedAt: new Date().toISOString(), editedBy: by } as Record<string, unknown>;
    if (typeof b.favorite === "boolean") fields.favorite = b.favorite;
    if (ref) await ref.set(fields, { merge: true });
    else {
      // ของใหม่ต่อท้ายรายการ
      const last = await db.collection(COL).orderBy("order", "desc").limit(1).get();
      const order = last.empty ? 0 : Number(last.docs[0].get("order") ?? 0) + 1;
      await db.collection(COL).doc().set({ ...fields, order, favorite: !!b.favorite });
    }
    return NextResponse.json({ ok: true, ...(await readAll(db)), saved: id ? "บันทึกแล้ว" : "สร้างข้อความใหม่แล้ว" });
  }

  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}

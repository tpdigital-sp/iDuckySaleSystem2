import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { db, gemini, iso, KB_COL, PRICING_COL } from "@/lib/server/bot-kb";
import { PRICING_SYS, pricingPrompt } from "@/lib/server/bot-kb-prompts";
import type { PricingItem } from "@/lib/bot-kb-types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 💰 ตารางราคาของบอท (Firestore pricing · ย้ายจาก AdminBuddy pricing.html 3 ต.ค. 69)
 *
 * ⚠️ ระบบอื่นอ่านคอลเลกชันนี้ตรง ๆ: n8n quote-engine (REST · name/content ต้องเป็น string ·
 * บรรทัด "ชื่อสินค้า: 1-10=245, 11-29=225, 1000+=175") และ invoice-inspector → ห้ามเปลี่ยนทรงข้อมูล
 *
 * หน้าเดิมกันการลบ/นำเข้าด้วย PIN ที่เก็บในเบราว์เซอร์ (ใครก็รีเซ็ตได้) → ตรงนี้ใช้สิทธิ์ settings.manage แทน
 */

async function loadAll(): Promise<PricingItem[]> {
  const snap = await db().collection(PRICING_COL).get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { id: d.id, name: String(x.name ?? x.title ?? ""), content: String(x.content ?? ""), updatedAt: iso(x.updatedAt ?? x.importedAt ?? x.createdAt) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  try {
    return NextResponse.json({ items: await loadAll() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดตารางราคาไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}

type Body = { action?: string; id?: string; name?: string; content?: string; items?: { name?: string; content?: string }[]; deleteOriginal?: boolean };
const str = (v: unknown, max = 30_000) => String(v ?? "").trim().slice(0, max);
/** ลบ/นำเข้าทับ = ของหายถาวร ต้องเป็นคนตั้งค่าระบบ (แทน PIN ของหน้าเดิม) */
const DESTRUCTIVE = "settings.manage" as const;

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const col = db().collection(PRICING_COL);
  const now = new Date();

  try {
    switch (b.action) {
      case "save": {
        const name = str(b.name, 300);
        const content = str(b.content);
        if (!name) return NextResponse.json({ error: "กรุณากรอกชื่อ" }, { status: 400 });
        if (!content) return NextResponse.json({ error: "กรุณากรอกเนื้อหา" }, { status: 400 });
        if (b.id) {
          await col.doc(str(b.id, 100)).update({ name, content, updatedAt: now });
          return NextResponse.json({ ok: true, id: b.id });
        }
        const ref = await col.add({ name, content, createdAt: now, updatedAt: now });
        return NextResponse.json({ ok: true, id: ref.id });
      }

      case "duplicate": {
        const src = await col.doc(str(b.id, 100)).get();
        if (!src.exists) return NextResponse.json({ error: "ไม่พบรายการต้นฉบับ" }, { status: 404 });
        const ref = await col.add({ name: `${src.get("name") ?? ""} (Copy)`, content: String(src.get("content") ?? ""), createdAt: now, updatedAt: now, copiedFrom: src.id });
        return NextResponse.json({ ok: true, id: ref.id });
      }

      case "delete": {
        const g = await requirePerm(DESTRUCTIVE);
        if (g.res) return NextResponse.json({ error: "ต้องมีสิทธิ์ตั้งค่าระบบจึงจะลบได้ — ให้แอดมินหลักลบให้" }, { status: 403 });
        await col.doc(str(b.id, 100)).delete();
        return NextResponse.json({ ok: true });
      }

      case "split": {
        const items = (b.items ?? []).map((i) => ({ name: str(i.name, 300), content: str(i.content) })).filter((i) => i.name);
        if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่ใช้ได้" }, { status: 400 });
        const origin = str(b.id, 100) || null;
        let deleted = false;
        if (b.deleteOriginal && origin) {
          const g = await requirePerm(DESTRUCTIVE);
          deleted = !g.res;
        }
        for (let i = 0; i < items.length; i += 400) {
          const batch = db().batch();
          for (const it of items.slice(i, i + 400)) batch.set(col.doc(), { ...it, createdAt: now, updatedAt: now, splitFrom: origin });
          await batch.commit();
        }
        if (deleted && origin) await col.doc(origin).delete();
        return NextResponse.json({ ok: true, created: items.length, deletedOriginal: deleted, deniedDelete: !!b.deleteOriginal && !!origin && !deleted });
      }

      case "import": {
        // ล้างทั้งคอลเลกชันแล้วดึงจาก knowledge-base type=pricing (แบบหน้าเดิม) — ทำลายข้อมูลที่แก้มือไว้ทั้งหมด
        const g = await requirePerm(DESTRUCTIVE);
        if (g.res) return NextResponse.json({ error: "ต้องมีสิทธิ์ตั้งค่าระบบจึงจะนำเข้าได้ (นำเข้าจะลบของเดิมทั้งหมด)" }, { status: 403 });
        const kb = await db().collection(KB_COL).where("type", "==", "pricing").get();
        if (kb.empty) return NextResponse.json({ error: "ไม่มีรายการราคา (type: pricing) ในคลังความรู้ — ไม่ได้ลบของเดิม" }, { status: 400 });
        const old = await col.get();
        for (let i = 0; i < old.docs.length; i += 400) {
          const batch = db().batch();
          old.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        const docs = kb.docs.map((d) => ({ name: String(d.get("title") ?? "").replace(/^ราคา\s*/, "").trim(), content: String(d.get("content") ?? ""), sourceKbId: d.id, importedAt: now }));
        for (let i = 0; i < docs.length; i += 400) {
          const batch = db().batch();
          docs.slice(i, i + 400).forEach((p) => batch.set(col.doc(), p));
          await batch.commit();
        }
        return NextResponse.json({ ok: true, removed: old.size, imported: docs.length });
      }

      case "ai": {
        const content = str(b.content, 15_000);
        if (!content) return NextResponse.json({ error: "ไม่มีเนื้อหาให้เรียบเรียง" }, { status: 400 });
        const raw = await gemini({ system: PRICING_SYS, contents: [{ parts: [{ text: pricingPrompt(content) }] }] });
        const text = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        return NextResponse.json({ text });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}

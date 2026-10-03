import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { db, fetchPageText, gemini, parseAiJson, PRICE_LINKS_DOC, pushKnowledge } from "@/lib/server/bot-kb";
import { LINK_ANALYZE_SYS, linkAnalyzePrompt, LINK_KEYWORDS_SYS, linkKeywordsPrompt } from "@/lib/server/bot-kb-prompts";
import type { PriceLink, PriceLinkImage } from "@/lib/bot-kb-types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 🔗 ลิงก์ราคา & รูปตอบลูกค้าของบอท (Firestore settings/price_links.items · ย้ายจาก AdminBuddy pricelinks.html 3 ต.ค. 69)
 * — คนละเรื่องกับ /admin/price-links (ลิงก์ราคาที่ยิงให้ลูกค้าจากหน้าสินค้า)
 *
 * ⚠️ หน้าเดิม setDoc ทั้งอาร์เรย์ทับทุกครั้ง (สองคนแก้พร้อมกัน = ของอีกคนหาย) → ตรงนี้แก้ทีละรายการใน transaction
 * คนอ่านอื่น: chat.html (chatPriceLinks) · ใบรวมยอด (findMatchingPriceLinks) · คลังความรู้ (ผูกลิงก์)
 */
const ref = () => db().collection(PRICE_LINKS_DOC.col).doc(PRICE_LINKS_DOC.id);

async function loadItems(): Promise<PriceLink[]> {
  const snap = await ref().get();
  return ((snap.data()?.items ?? []) as PriceLink[]).filter((x) => x && x.id != null);
}

export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  try {
    return NextResponse.json({ items: await loadItems() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดลิงก์ราคาไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}

type Body = { action?: string; item?: Partial<PriceLink>; id?: number; url?: string; ids?: number[] };
const str = (v: unknown, max = 5_000) => String(v ?? "").trim().slice(0, max);

/** ทำความสะอาดภาพ — เก็บเฉพาะฟิลด์ทรงเดิม */
const cleanImages = (imgs: PriceLinkImage[] | undefined): PriceLinkImage[] =>
  (imgs ?? [])
    .filter((i) => i?.url)
    .slice(0, 80)
    .map((i) => ({ url: i.url, storagePath: i.storagePath ?? "", label: str(i.label, 200), kind: i.kind === "sample" ? "sample" : "price", caption: str(i.caption, 300) }));

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    switch (b.action) {
      case "save": {
        const it = b.item ?? {};
        const url = str(it.url, 1000);
        const description = str(it.description, 2000);
        if (!url || !description) return NextResponse.json({ error: "ต้องมีลิงก์และรายละเอียดสินค้า" }, { status: 400 });
        const editingId = typeof it.id === "number" ? it.id : null;
        const localPaths: Record<string, string> = {};
        for (const [k, v] of Object.entries(it.localPaths ?? {})) if (str(v)) localPaths[k] = str(v, 500);
        const isNew = editingId == null;
        // id ของรายการใหม่ = เวลาที่สร้าง (แบบเดิม) — หน้าจออัปรูปเข้าโฟลเดอร์นี้มาก่อนแล้ว จึงรับ id ที่จองไว้ได้
        const id = editingId ?? (typeof b.id === "number" ? b.id : Date.now());
        const out = await db().runTransaction(async (tx) => {
          const snap = await tx.get(ref());
          const items = ((snap.data()?.items ?? []) as PriceLink[]).slice();
          const dup = items.find((l) => l.url === url && l.id !== id);
          if (dup) return { error: `ลิงก์นี้มีอยู่แล้ว: ${dup.description}` };
          const next: PriceLink = { id, url, description, keywords: str(it.keywords, 2000), images: cleanImages(it.images), localPaths };
          const at = items.findIndex((l) => l.id === id);
          if (at >= 0) {
            const { localPath: _legacy, ...prev } = items[at]; // ย้ายไป localPaths แล้ว — ลบฟิลด์เก่าทิ้งแบบหน้าเดิม
            void _legacy;
            items[at] = { ...prev, ...next };
          } else items.push(next);
          tx.set(ref(), { items, updatedAt: FieldValue.serverTimestamp() });
          return { item: next };
        });
        if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });
        // รายการใหม่ → ส่งเข้า Pinecone ทรงเดิม (แก้ไขไม่ส่ง — เหมือนหน้าเดิม · ใช้ "ซิงก์ทั้งหมด" ถ้าต้องการ)
        const pushed = isNew
          ? await pushKnowledge({ question: `ราคาสินค้า: ${description}`, answer: `ดูราคาเพิ่มเติมได้ที่ ${url} สินค้าในลิงก์นี้ได้แก่: ${description}`, type: "price-link" })
          : null;
        return NextResponse.json({ ok: true, item: out.item, pushed });
      }

      case "delete": {
        await db().runTransaction(async (tx) => {
          const snap = await tx.get(ref());
          const items = ((snap.data()?.items ?? []) as PriceLink[]).filter((l) => l.id !== b.id);
          tx.set(ref(), { items, updatedAt: FieldValue.serverTimestamp() });
        });
        return NextResponse.json({ ok: true });
      }

      case "analyze": {
        const url = str(b.url, 1000);
        if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "ใส่ลิงก์ก่อน" }, { status: 400 });
        const page = await fetchPageText(url);
        if (!page || page.length < 20) return NextResponse.json({ error: "อ่านหน้าเว็บนี้ไม่ได้ — พิมพ์รายละเอียดเองได้เลย" }, { status: 422 });
        const raw = await gemini({ system: LINK_ANALYZE_SYS, contents: [{ parts: [{ text: linkAnalyzePrompt(page.slice(0, 10_000)) }] }] });
        try {
          const p = parseAiJson<{ description?: string; keywords?: string }>(raw);
          return NextResponse.json({ description: p.description || raw, keywords: p.keywords || "" });
        } catch {
          return NextResponse.json({ description: raw, keywords: "" });
        }
      }

      case "keywords": {
        // สร้างคีย์เวิร์ดให้รายการที่ยังว่าง ทีละ 5 — ทำได้เท่าที่เวลาเหลือ (~20 วิ) แล้วบอกจำนวนที่ค้าง ให้หน้าจอกดต่อ
        const t0 = Date.now();
        const items = await loadItems();
        const empty = items.filter((l) => !str(l.keywords));
        const got = new Map<number, string>();
        for (let i = 0; i < empty.length && Date.now() - t0 < 18_000; i += 5) {
          const batch = empty.slice(i, i + 5);
          try {
            const raw = await gemini({
              system: LINK_KEYWORDS_SYS,
              contents: [{ parts: [{ text: linkKeywordsPrompt(batch.map((l, k) => `${k + 1}. ${l.description}`).join("\n")) }] }],
              timeoutMs: 12_000,
            });
            const arr = parseAiJson<string[]>(raw);
            batch.forEach((l, k) => {
              if (typeof arr[k] === "string" && arr[k].trim()) got.set(l.id, arr[k].trim());
            });
          } catch {
            /* ก้อนนี้พลาด ข้ามไป (แบบหน้าเดิม) */
          }
        }
        if (got.size) {
          await db().runTransaction(async (tx) => {
            const snap = await tx.get(ref());
            const cur = ((snap.data()?.items ?? []) as PriceLink[]).map((l) => (got.has(l.id) && !str(l.keywords) ? { ...l, keywords: got.get(l.id) } : l));
            tx.set(ref(), { items: cur, updatedAt: FieldValue.serverTimestamp() });
          });
        }
        return NextResponse.json({ ok: true, done: got.size, remaining: Math.max(0, empty.length - got.size), total: empty.length });
      }

      case "sync": {
        const ids = new Set((b.ids ?? []).slice(0, 8));
        const items = (await loadItems()).filter((l) => ids.has(l.id));
        let ok = 0;
        for (let i = 0; i < items.length; i++) {
          const l = items[i];
          const desc = l.description || l.url;
          const kw = str(l.keywords);
          if (
            await pushKnowledge({
              question: `ราคาสินค้า: ${desc}${kw ? ` คีย์เวิร์ด: ${kw}` : ""}`,
              answer: `ดูราคาเพิ่มเติมได้ที่ ${l.url} สินค้าในลิงก์นี้ได้แก่: ${desc}`,
              type: "price-link",
            })
          )
            ok++;
          if (i < items.length - 1) await new Promise((r) => setTimeout(r, 500));
        }
        return NextResponse.json({ ok: true, sent: ok, failed: items.length - ok });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}

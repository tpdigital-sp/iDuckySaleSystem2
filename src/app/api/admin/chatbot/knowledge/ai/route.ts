import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { db, fetchPageText, gemini, inlineImage, KB_COL, parseAiJson, urlToInline, type GeminiPart } from "@/lib/server/bot-kb";
import { dedupePrompt, FAQ_FROM_IMAGES, FAQ_SYS, faqFromText, faqTurns, KB_REORG_SYS, kbReorgPrompt, OCR_PROMPT, OCR_SYS } from "@/lib/server/bot-kb-prompts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * ✨ งาน AI ของคลังความรู้ — แยกเป็นขั้นละคำขอ (เดิมหน้าเว็บเรียก Gemini ต่อกัน 2-3 ครั้งรวด เกิน 30 วิของ Netlify ได้)
 *   reorganize  เรียบเรียงเนื้อหา(+ภาพ) เป็น Markdown           { content, images[dataUrl], imageUrls[] } → { text }
 *   scrape      ดึงข้อความจากหน้าเว็บ                         { url } → { text }
 *   ocr         อ่านข้อความจากภาพ (ขั้นแรกของ "วางเนื้อหา + ภาพ") { images[dataUrl] } → { text }
 *   faq         สร้าง Q&A จากข้อความ หรือจากภาพล้วน            { content?, images? } → { items:[{q,a}] }
 *   dedupe      คัดข้อที่ซ้ำกับ 50 รายการล่าสุดในคลัง            { items:[{q,a}] } → { duplicates:[index เริ่ม 0] }
 */
type Body = { mode?: string; content?: string; url?: string; images?: string[]; imageUrls?: string[]; items?: { q: string; a: string }[] };

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลใหญ่เกินไป (รูปเยอะ/ใหญ่เกิน) หรือรูปแบบไม่ถูกต้อง" }, { status: 400 });
  }
  const content = String(b.content ?? "").trim().slice(0, 15_000);
  const imgs = (b.images ?? []).map(inlineImage).filter((p): p is GeminiPart => !!p).slice(0, 8);

  try {
    switch (b.mode) {
      case "reorganize": {
        const existing = (await Promise.all((b.imageUrls ?? []).slice(0, 6).map(urlToInline))).filter((p): p is GeminiPart => !!p);
        const all = [...imgs, ...existing];
        if (!content && !all.length) return NextResponse.json({ error: "ใส่เนื้อหาหรือแนบภาพก่อน" }, { status: 400 });
        const text = await gemini({ system: KB_REORG_SYS, contents: [{ parts: [{ text: kbReorgPrompt(content, all.length > 0) }, ...all] }] });
        return NextResponse.json({ text });
      }

      case "scrape": {
        const url = String(b.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "ใส่ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
        const text = await fetchPageText(url);
        if (!text || text.length < 50) return NextResponse.json({ error: "ไม่พบเนื้อหาในหน้าเว็บนี้ — ลองคัดลอกเนื้อหามาวางในโหมด “วางเนื้อหา” แทน" }, { status: 422 });
        return NextResponse.json({ text: text.slice(0, 15_000) });
      }

      case "ocr": {
        if (!imgs.length) return NextResponse.json({ error: "ไม่มีภาพ" }, { status: 400 });
        const text = await gemini({
          system: OCR_SYS,
          contents: [{ role: "user", parts: [...imgs, { text: OCR_PROMPT }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        });
        return NextResponse.json({ text });
      }

      case "faq": {
        if (!content && !imgs.length) return NextResponse.json({ error: "ใส่เนื้อหาหรือแนบภาพก่อน" }, { status: 400 });
        const last: GeminiPart[] = content ? [{ text: faqFromText(content) }] : [...imgs, { text: FAQ_FROM_IMAGES }];
        const raw = await gemini({ system: FAQ_SYS, contents: faqTurns(last), generationConfig: { temperature: 0.4, maxOutputTokens: 8192 } });
        let items: { q: string; a: string }[] = [];
        try {
          items = parseAiJson<{ q: string; a: string }[]>(raw).filter((x) => x?.q && x?.a);
        } catch {
          /* ตกด้านล่าง */
        }
        if (!items.length) return NextResponse.json({ error: "ไม่สามารถสร้าง Q&A ได้ — ลองเนื้อหาที่ยาวขึ้น หรือกดสร้างใหม่" }, { status: 422 });
        return NextResponse.json({ items });
      }

      case "dedupe": {
        const items = (b.items ?? []).slice(0, 60);
        if (!items.length) return NextResponse.json({ duplicates: [] });
        // orderBy ฟิลด์เดียว ไม่ต้องสร้าง index — 50 รายการล่าสุดแบบหน้าเดิม
        const snap = await db().collection(KB_COL).orderBy("timestamp", "desc").limit(50).get();
        const existingList = snap.docs.map((d, i) => `${i + 1}. Q: ${d.get("title") ?? ""} | A: ${String(d.get("content") ?? "").substring(0, 100)}`).join("\n");
        const newList = items.map((it, i) => `${i + 1}. Q: ${it.q} | A: ${String(it.a).substring(0, 100)}`).join("\n");
        try {
          const raw = await gemini({ contents: [{ parts: [{ text: dedupePrompt(existingList, newList) }] }], generationConfig: { temperature: 0, maxOutputTokens: 100 } });
          const idx = parseAiJson<number[]>(raw);
          return NextResponse.json({ duplicates: (Array.isArray(idx) ? idx : []).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < items.length) });
        } catch {
          // ตรวจซ้ำพลาด = เก็บไว้ทั้งหมด (เหมือนหน้าเดิม: เก็บไว้ดีกว่าลบ)
          return NextResponse.json({ duplicates: [] });
        }
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}

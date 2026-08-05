import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requirePerm } from "@/lib/server/require-perm";
import { ARTICLE_CATEGORY, articleOf, articleRowId, byNewest, type Article } from "@/lib/articles";

export const runtime = "nodejs";

/**
 * กรอง HTML จากตัวเขียน rich text — ตัด script/iframe/on* /javascript: ทิ้ง
 * (ตัวเขียนอยู่หลังล็อกอินก็จริง แต่เนื้อหาขึ้นหน้าเว็บสาธารณะ กรองไว้เสมอปลอดภัยกว่า)
 * ข้อยกเว้นเดียว: iframe ฝังวิดีโอจาก YouTube เท่านั้น (ปุ่มวิดีโอในตัวเขียน)
 */
const YT_IFRAME = /<iframe[^>]+src="https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/[\w-]+[^"]*"[^>]*>\s*<\/iframe>/gi;

function sanitizeHtml(h: string): string {
  // เก็บ iframe ของ YouTube ไว้ก่อน (แทนที่ด้วย placeholder สุ่มต่อครั้ง กันชนกับข้อความจริง) แล้วค่อยกรองของอันตราย
  const kept: string[] = [];
  const tag = `YTEMBED${Math.random().toString(36).slice(2, 10)}`;
  const out = h
    .replace(YT_IFRAME, (m) => {
      if (/\son\w+\s*=/i.test(m) || /srcdoc/i.test(m)) return ""; // กันยัด handler มากับแท็ก
      kept.push(m);
      return `[[${tag}:${kept.length - 1}]]`;
    })
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2/gi, '$1="#"')
    .slice(0, 300000);
  return out.replace(new RegExp(`\\[\\[${tag}:(\\d+)\\]\\]`, "g"), (_, i) => kept[Number(i)] ?? "");
}

/** รายการบทความทั้งหมด (รวมฉบับร่าง) — เฉพาะหลังบ้าน */
export async function GET() {
  const gate = await requirePerm("products.view");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const { data, error } = await sb.from("products").select("data").eq("category", ARTICLE_CATEGORY);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (data ?? [])
    .map((r) => articleOf((r.data as { article?: Partial<Article> })?.article))
    .filter((a): a is Article => !!a)
    .sort(byNewest);
  return NextResponse.json({ list });
}

/** บันทึก/แก้บทความ (upsert ตาม slug) — ทีมคอนเทนต์และแอดมิน */
export async function POST(req: Request) {
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { article?: Partial<Article> };
  try {
    body = (await req.json()) as { article?: Partial<Article> };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const a = articleOf(body.article);
  if (!a) return NextResponse.json({ error: "ต้องมีชื่อเรื่องและ slug" }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(a.slug))
    return NextResponse.json({ error: "slug ใช้ได้เฉพาะ a-z 0-9 และขีดกลาง" }, { status: 400 });

  // คนเขียนล่าสุดคือคนแก้ (โชว์ท้ายบทความ)
  const article: Article = {
    ...a,
    html: a.html ? sanitizeHtml(a.html) : undefined,
    author: a.author || gate.actor.name || gate.actor.username,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await sb.from("products").upsert(
    {
      id: articleRowId(article.slug),
      name: `(บทความ) ${article.title}`.slice(0, 120),
      category: ARTICLE_CATEGORY,
      price: 0,
      data: { article },
    },
    { onConflict: "id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, article });
}

/** ลบบทความ */
export async function DELETE(req: Request) {
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "slug ไม่ถูกต้อง" }, { status: 400 });

  const { error } = await sb.from("products").delete().eq("id", articleRowId(slug)).eq("category", ARTICLE_CATEGORY);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

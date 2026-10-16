import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { productsUsingTemplates, revalidateProductPages, verifyScriptSignature } from "@/lib/server/revalidate-products";

export const runtime = "nodejs";

/**
 * ⏱️ ล้างแคชหน้าสินค้า (/products/[id] แคช 1 ชม.) ตามรหัสสินค้า และ/หรือ ชุดเทมเพลตที่ผูก
 * body: { productIds?: string[], templateIds?: string[] }
 * สิทธิ์: แอดมินที่ล็อกอิน (products.manage) หรือสคริปต์ในเครื่องที่เซ็นคำขอ (x-revalidate-ts + x-revalidate-sig · ดู verifyScriptSignature)
 * (16 ต.ค. 69 — สคริปต์แก้เทมเพลตเข็มกลัดเขียน DB ตรง หน้าเว็บจริงถือไฟล์เก่าไว้ชั่วโมง)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const raw = await req.text();
  if (!verifyScriptSignature(req.headers.get("x-revalidate-ts"), req.headers.get("x-revalidate-sig"), raw)) {
    const gate = await requirePerm("products.manage");
    if (gate.res) return gate.res;
  }
  let body: { productIds?: unknown; templateIds?: unknown };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 200) : []);
  const productIds = list(body.productIds);
  const templateIds = list(body.templateIds);
  if (!productIds.length && !templateIds.length) return NextResponse.json({ error: "ต้องมี productIds หรือ templateIds" }, { status: 400 });

  const products = new Map<string, { id: string; slug?: string }>();
  if (productIds.length) {
    const { data } = await sb.from("products").select("id,slug:data->>slug").in("id", productIds);
    for (const r of (data ?? []) as { id: string; slug?: string | null }[]) products.set(r.id, { id: r.id, slug: r.slug ?? undefined });
  }
  for (const p of await productsUsingTemplates(sb, templateIds)) products.set(p.id, p);
  const paths = revalidateProductPages([...products.values()]);
  return NextResponse.json({ ok: true, products: [...products.keys()], paths });
}

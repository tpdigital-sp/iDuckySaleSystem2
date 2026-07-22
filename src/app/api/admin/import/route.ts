import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/admin-session";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { scrapeWixPage } from "@/lib/server/wix-scrape";
import type { CategoryId, Product } from "@/lib/products";

export const runtime = "nodejs";

async function requireAdmin() {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

function slugify(s: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base) return base;
  // ชื่อไทยล้วน → hash เสถียร (re-import ชื่อเดิม = id เดิม อัปเดตทับ)
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "p-" + h.toString(36);
}

const IMG_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** ดึงรูปจาก URL → อัปโหลด Supabase Storage → คืน public URL (ข้ามถ้าพลาด) */
async function pullImage(sb: ReturnType<typeof getSupabaseAdmin>, id: string, url: string): Promise<string | null> {
  if (!sb) return null;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/jpeg,image/*" } });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
    const ext = IMG_EXT[ct] || "jpg";
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;
    const path = `products/${id}/${randomUUID()}.${ext}`;
    const up = await sb.storage.from("product-images").upload(path, buf, { contentType: ct, upsert: true });
    if (up.error) return null;
    return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "ต้องล็อกอินแอดมิน" }, { status: 401 });

  const action = new URL(req.url).searchParams.get("action");
  const bodyIn = await req.json().catch(() => ({}));

  // ── preview: ดึง+แปลง คืนรายการให้ review (ยังไม่เขียน DB) ──
  if (action === "scrape") {
    const url = String(bodyIn.url || "").trim();
    if (!url) return NextResponse.json({ error: "ใส่ URL หน้าที่จะนำเข้า" }, { status: 400 });
    try {
      const { products, skipped } = await scrapeWixPage(url);
      return NextResponse.json({ ok: true, products, skipped });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
    }
  }

  // ── save: นำเข้าที่ผู้ใช้เลือก/แก้แล้ว (ดึงรูปเข้า Storage + upsert) ──
  if (action === "save") {
    const items = Array.isArray(bodyIn.items) ? bodyIn.items : [];
    if (!items.length) return NextResponse.json({ error: "ไม่มีสินค้าให้นำเข้า" }, { status: 400 });
    const results: { id: string; ok: boolean; image: boolean }[] = [];
    let sort = 400;
    for (const it of items) {
      const name = String(it.name || "").trim();
      const category = String(it.category || "acrylic") as CategoryId;
      if (!name) continue;
      const id = String(it.id || "").trim() || slugify(name);
      const emoji = String(it.emoji || "📦");
      const gradient = "from-sky-100 to-blue-200";
      let imageSrc: string | undefined;
      if (it.imageUrl) {
        const url = await pullImage(sb, id, String(it.imageUrl));
        if (url) imageSrc = url;
      }
      const product: Product = {
        id,
        name,
        category,
        price: Number(it.price) || 0,
        emoji,
        gradient,
        rating: 5,
        sold: 0,
        description: String(it.description || name),
        highlights: Array.isArray(it.highlights) && it.highlights.length ? it.highlights : [name, "พิมพ์ลายตามสั่ง", "ราคาปรับตามจำนวน"],
        options: Array.isArray(it.options) ? it.options : [],
        images: [{ emoji, gradient, label: name, ...(imageSrc ? { src: imageSrc } : {}) }],
        body: [],
        ...(it.pricing ? { pricing: it.pricing } : {}),
        ...(imageSrc ? { imageSrc } : {}),
      };
      const { error } = await sb.from("products").upsert(
        { id, name, category, price: product.price, sold: 0, featured: false, badge: null, sort: sort++, data: product },
        { onConflict: "id" }
      );
      results.push({ id, ok: !error, image: !!imageSrc });
    }
    return NextResponse.json({ ok: true, results, imported: results.filter((r) => r.ok).length });
  }

  return NextResponse.json({ error: "action ไม่ถูกต้อง (scrape | save)" }, { status: 400 });
}

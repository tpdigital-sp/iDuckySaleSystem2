import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { DiecutPresetSync, ShopPayment } from "@/lib/shop-settings";

export const runtime = "nodejs";
const SHOP_PAYMENT_ID = "__shop_payment__";

/**
 * ✂️ ซิงก์สูตรเส้นตัดตามชนิดงาน (products.py ของโปรแกรม cutout-py) ขึ้นตั้งค่าร้าน
 * — หน้า /admin/diecut?tab=bg (iframe) ส่งมาทุกครั้งที่เปิด/กดบันทึกสูตร → จอออกแบบพวงกุญแจของลูกค้าใช้ค่าเดียวกัน (14 ต.ค. 69)
 * เก็บในแถว __shop_payment__ (หน้าร้านอ่านแถวนี้อยู่แล้ว ไม่ต้องเพิ่ม policy) · ค่าเท่าเดิม = ไม่เขียนซ้ำ
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  let body: { products?: unknown };
  try {
    body = (await req.json()) as { products?: unknown };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const raw = Array.isArray(body.products) ? (body.products as Record<string, unknown>[]) : null;
  if (!raw?.length) return NextResponse.json({ error: "ไม่มีสูตรสินค้า" }, { status: 400 });
  const products: DiecutPresetSync["products"] = raw
    .filter((x) => x && typeof x.id === "string" && typeof x.p === "object" && x.p)
    .slice(0, 40)
    .map((x) => ({
      id: String(x.id).slice(0, 40),
      name: String(x.name ?? x.id).slice(0, 120),
      kind: typeof x.kind === "string" ? x.kind.slice(0, 40) : undefined,
      // เก็บเฉพาะค่าตัวเลข/ข้อความ/บูลีนสั้น ๆ (ตัดของแปลก ๆ ทิ้ง)
      p: Object.fromEntries(
        Object.entries(x.p as Record<string, unknown>)
          .filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 60)))
          .slice(0, 60),
      ),
    }));

  const { data: cur } = await sb.from("products").select("data").eq("id", SHOP_PAYMENT_ID).maybeSingle();
  const prev = (cur?.data as ShopPayment | undefined) ?? ({ banks: [] } as ShopPayment);
  // เทียบทีละสินค้า (jsonb เรียงคีย์ใหม่ ห้ามเทียบ JSON.stringify ทั้งก้อน)
  const same =
    !!prev.diecutPresets &&
    prev.diecutPresets.products.length === products.length &&
    products.every((n) => {
      const o = prev.diecutPresets!.products.find((x) => x.id === n.id);
      if (!o || o.name !== n.name) return false;
      const ks = new Set([...Object.keys(o.p), ...Object.keys(n.p)]);
      return [...ks].every((k) => o.p[k] === n.p[k]);
    });
  if (same) return NextResponse.json({ ok: true, changed: false });

  const next: ShopPayment = { ...prev, diecutPresets: { products, savedAt: new Date().toISOString() } };
  const { error } = await sb
    .from("products")
    .upsert({ id: SHOP_PAYMENT_ID, name: "(ตั้งค่าร้าน — บัญชีชำระเงิน)", category: "__settings__", price: 0, data: next }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, changed: true, count: products.length });
}

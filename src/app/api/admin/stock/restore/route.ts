import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listDeletedStock, restoreStockItem, type UnlinkedRef } from "@/lib/server/stock";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { invalidateProductsSlim } from "@/lib/server/products-slim";
import type { PriceRate, ProductOption } from "@/lib/products";
import { isRateGroup, writeRateStock } from "@/lib/stock-rate";

export const runtime = "nodejs";

/**
 * 🗑↩ SKU ที่ลบไปแล้ว + กู้คืน (เจ้าของร้านขอ 30 ก.ย. 69 — ลบ "ฐาน Griptok · สีดำ" ผิดตัว แล้วไม่มีทางเอากลับจากหน้าจอ)
 *   GET  → รายการที่ถูกลบ (ล่าสุดก่อน) พร้อมจำนวนตัวเลือกที่เคยผูก
 *   POST { id } → เปิดกลับ + ผูกกลับทุกตัวเลือกที่เคยชี้มา (เฉพาะค่าที่ยังว่าง — ถ้าไปผูกตัวอื่นแทนแล้วไม่ทับ)
 */
async function guard() {
  const actor = await currentActor();
  if (!actor) return { res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return { res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 }) };
  return { actor };
}

export async function GET() {
  const g = await guard();
  if (g.res) return g.res;
  try {
    const items = await listDeletedStock();
    return NextResponse.json({
      ok: true,
      items: items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, family: i.family, imageUrl: i.imageUrl, deletedAt: i.deletedAt, deletedBy: i.deletedBy, links: (i.unlinkedFrom ?? []).length })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });

  let restored: Awaited<ReturnType<typeof restoreStockItem>>;
  try {
    restored = await restoreStockItem(id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!restored) return NextResponse.json({ error: "ไม่พบวัสดุนี้" }, { status: 404 });

  // ผูกกลับตามที่จดไว้ตอนลบ — แถวละครั้ง
  let relinked = 0;
  const skipped: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && restored.refs.length) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const byRow = new Map<string, UnlinkedRef[]>();
    for (const r of restored.refs) byRow.set(r.rowId, [...(byRow.get(r.rowId) ?? []), r]);
    const { data: rows } = await sb.from("products").select("id,data").in("id", [...byRow.keys()]);
    type Link = { stockItemId: string; per?: number; when: { label: string; choices: string[] }[] };
    type Ch = { name: string; stockItemId?: string; stockQtyPer?: number; stockLinks?: Link[] };
    const apply = (c: Ch, r: UnlinkedRef): Ch => {
      if (r.main) {
        if (c.stockItemId && c.stockItemId !== id) {
          skipped.push(`${r.label ?? "คลังกลาง"} = ${r.choice} (ผูกตัวอื่นไปแล้ว)`);
          return c;
        }
        relinked++;
        return { ...c, stockItemId: id, ...(r.stockQtyPer ? { stockQtyPer: r.stockQtyPer } : {}) };
      }
      if (r.extra) {
        if ((c.stockLinks ?? []).some((l) => l.stockItemId === id)) return c;
        relinked++;
        return { ...c, stockLinks: [...(c.stockLinks ?? []), { stockItemId: id, ...(r.extra.per ? { per: r.extra.per } : {}), when: r.extra.when }] };
      }
      return c;
    };
    for (const row of rows ?? []) {
      const d = row.data as { choices?: Ch[]; options?: ProductOption[]; priceRates?: PriceRate[] } | null;
      if (!d) continue;
      const refs = byRow.get(row.id) ?? [];
      const before = relinked;
      let next: typeof d;
      if (row.id.startsWith("__preset_")) {
        next = { ...d, choices: (d.choices ?? []).map((c) => refs.filter((r) => r.choice === c.name).reduce(apply, c)) };
      } else {
        // สต๊อกตามเรท: ลิงก์ที่จดไว้ชี้กลุ่มเสมือน "เรทราคา" (-1) → เขียนกลับลง priceRates
        const rateRefs = refs.filter((r) => isRateGroup(r.label, r.optionIndex));
        next = {
          ...d,
          options: (d.options ?? []).map((o, oi) => {
            // ชี้กลุ่มด้วยลำดับ+ชื่อ (กลุ่มชื่อซ้ำมีจริง) · ลำดับเลื่อนไปแล้วก็ยังหาด้วยชื่อ
            const mine = refs.filter((r) => !isRateGroup(r.label, r.optionIndex) && ((r.optionIndex === oi && (!r.label || r.label === o.label)) || (r.optionIndex !== oi && r.label === o.label && !(d.options ?? [])[r.optionIndex ?? -1])));
            if (!mine.length) return o;
            return { ...o, choices: ((o.choices ?? []) as Ch[]).map((c) => mine.filter((r) => r.choice === c.name).reduce(apply, c)) };
          }),
          ...(rateRefs.length && d.priceRates?.length
            ? { priceRates: writeRateStock(d.priceRates, (chs) => ((chs ?? []) as Ch[]).map((c) => rateRefs.filter((r) => r.choice === c.name).reduce(apply, c)) as ProductOption["choices"]) }
            : {}),
        };
      }
      if (relinked === before) continue;
      await snapshotRevision(sb, row.id, d, g.actor, "save");
      const { error } = await sb.from("products").update({ data: next }).eq("id", row.id);
      if (error) return NextResponse.json({ error: `กู้คืนแล้ว แต่ผูกกลับที่ ${row.id} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
    }
    if (relinked) invalidateProductsSlim();
  }
  return NextResponse.json({ ok: true, item: restored.item, relinked, skipped });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { allStockCodes, deleteStockItem, listStockItems, saveStockItem } from "@/lib/server/stock";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { invalidateProductsSlim } from "@/lib/server/products-slim";
import { normName } from "@/lib/stock-match";
import type { Product, ProductOption } from "@/lib/products";

export const runtime = "nodejs";

/**
 * แยกสต๊อกของสินค้าตาม "ตัวเลือก" — สินค้าที่ลูกค้าเลือกแบบ/ขนาดแล้วได้ของคนละชิ้น
 * (360° PHONE STAND: 7×12 ซม. กับ 6.8×10.5 ซม. เป็นของคนละตัวบนชั้น ต้องนับแยก)
 *
 *   GET  ?productId=   → กลุ่มตัวเลือกของสินค้าที่แยกได้ + SKU รวมเดิมที่ผูกกับตัวสินค้า
 *   POST { productId, optionIndex, label, choices[], removeOld }
 *        → สร้าง SKU ต่อตัวเลือก + ผูกให้ + ถอด SKU รวมเดิมออกจากสินค้านี้
 *
 * ของ 2 ชิ้นที่ขึ้นกับ 2 ตัวเลือก (กรอบรูป+จิ๊กซอว์ งาน UV: แผ่นตามขนาด + กรอบตามขนาดเฉพาะเมื่อเลือกแบบมีกรอบ):
 *   partName = ชื่อของชิ้นหลัก ("แผ่นจิ๊กซอว์") → ผูกแบบตัดเสมอ (choice.stockItemId)
 *   extra    = { name: "กรอบรูป", when: { label: "ตัวเลือก", choices: ["กรอบรูป + แผ่นจิ๊กซอว์"] } }
 *              → SKU อีกตัวต่อ 1 ตัวเลือก ผูกแบบมีเงื่อนไข (choice.stockLinks) · กติกาตัดอยู่ที่ lib/stock-cut.ts
 * SKU นำเข้าที่ยัง "รอตรวจ" และชื่อตรงกับตัวเลือก (PL-* จากตารางราคา) ถูกหยิบมาใช้เป็นชิ้นหลักแทนการสร้างซ้ำ
 *
 * ⚠️ ต้องถอด SKU รวมเดิมเสมอ — ไม่งั้นออเดอร์เดียวตัด 2 ต่อ (ตัวสินค้า 1 + ตัวเลือก 1)
 */

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

async function guard() {
  const actor = await currentActor();
  if (!actor) return { res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return { res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 }) };
  return { actor };
}

type Link = { stockItemId: string; per?: number; when?: { label: string; choices: string[] }[] };
type Ch = { name: string; stockItemId?: string; imageSrc?: string; stockLinks?: Link[] };

export async function GET(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const productId = new URL(req.url).searchParams.get("productId")?.trim();
  if (!productId) return NextResponse.json({ error: "ไม่มี productId" }, { status: 400 });

  const [{ data: row }, items] = await Promise.all([
    db.from("products").select("id,data").eq("id", productId).maybeSingle(),
    listStockItems(),
  ]);
  const p = row?.data as Product | undefined;
  if (!p?.name) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  const skuName = new Map(items.map((i) => [i.id, i.name]));

  // กลุ่มที่แยกได้: ของสินค้าเอง (ไม่ลิงก์คลังกลาง — พวกนั้นผูกที่หน้าผูกคลัง) · เป็นตัวเลือกให้เลือก ไม่ใช่ช่องกรอก · มีค่าที่มีชื่อ
  const groups = (p.options ?? [])
    .map((o, optionIndex) => ({ o, optionIndex }))
    .filter(({ o }) => !o.presetId && o.display !== "input" && (o.choices ?? []).some((c) => c.name?.trim()))
    .map(({ o, optionIndex }) => ({
      optionIndex,
      label: o.label,
      choices: ((o.choices ?? []) as Ch[])
        .filter((c) => c.name?.trim())
        .map((c) => ({
          name: c.name,
          img: c.imageSrc,
          stockItemId: c.stockItemId ?? null,
          skuName: c.stockItemId ? skuName.get(c.stockItemId) ?? null : null,
          extras: (c.stockLinks ?? []).map((l) => skuName.get(l.stockItemId) ?? l.stockItemId),
          // ไว้ให้หน้าจอรู้ว่าคู่ไหน (ทรง × สี) มี SKU แล้ว
          links: (c.stockLinks ?? []).map((l) => ({ stockItemId: l.stockItemId, name: skuName.get(l.stockItemId) ?? null, when: l.when ?? [] })),
        })),
    }));

  const old = items
    .filter((i) => (i.productIds ?? []).includes(productId))
    .map((i) => ({ id: i.id, name: i.name, code: i.code, balance: i.balance, unit: i.unit, shared: (i.productIds ?? []).length > 1 }));

  return NextResponse.json({ ok: true, product: { id: productId, name: p.name }, groups, old });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    productId?: string;
    optionIndex?: number;
    label?: string;
    choices?: string[];
    removeOld?: boolean;
    partName?: string;
    extra?: { name?: string; when?: { label?: string; choices?: string[] } };
    /** แยกทุกคู่ของ 2 กลุ่ม (ทรง × สี) — กลุ่มที่ 2 + คู่ที่ต้องการ [ค่ากลุ่มแรก, ค่ากลุ่มที่ 2] */
    pair?: { optionIndex?: number; label?: string };
    combos?: [string, string][];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { productId, optionIndex, label } = body;
  const want = new Set((body.choices ?? []).map((x) => String(x)));
  if (!productId || typeof optionIndex !== "number" || !label || !want.size)
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await db.from("products").select("id,data").eq("id", productId).maybeSingle();
  const p = row?.data as Product | undefined;
  if (!p?.name) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  const opts: ProductOption[] = p.options ?? [];
  const opt = opts[optionIndex];
  if (!opt || opt.label !== label || opt.presetId)
    return NextResponse.json({ error: "กลุ่มตัวเลือกเปลี่ยนไปแล้ว — ปิดแล้วเปิดใหม่" }, { status: 409 });

  const items = await listStockItems();
  const oldSkus = items.filter((i) => (i.productIds ?? []).includes(productId));
  const tpl = oldSkus[0]; // ยืมหน่วย/ตระกูล/ทุน/จุดสั่งจาก SKU รวมเดิม จะได้ไม่ต้องกรอกซ้ำ
  const baseCode = tpl?.code ?? `P-${productId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase()}`;
  const usedCodes = await allStockCodes(); // รวมตัวที่ลบแล้ว — กันรหัสซ้ำของเก่า

  const partName = body.partName?.trim() ?? "";
  const extraName = body.extra?.name?.trim() ?? "";
  const extraWhen = body.extra?.when?.label && body.extra.when.choices?.length ? [{ label: body.extra.when.label, choices: body.extra.when.choices }] : null;
  if (extraName && !extraWhen) return NextResponse.json({ error: "ของชิ้นที่ 2 ต้องระบุเงื่อนไข (กลุ่ม + ค่าที่เลือก)" }, { status: 400 });
  if (extraWhen && !opts.some((o, i) => i !== optionIndex && o.label === extraWhen[0].label))
    return NextResponse.json({ error: "ไม่พบกลุ่มตัวเลือกของเงื่อนไข" }, { status: 409 });
  // มีชื่อชิ้นส่วน → "แผ่นจิ๊กซอว์ ขนาด 15*20cm (ชื่อสินค้า)" · ไม่มี → รูปแบบเดิม "ชื่อสินค้า · ตัวเลือก"
  const nameFor = (part: string, choice: string) => (part ? `${part} ${choice} (${p.name})` : `${p.name} · ${choice}`);
  const sameWhen = (l: Link) => JSON.stringify(l.when ?? []) === JSON.stringify(extraWhen ?? []);

  // SKU นำเข้าที่รอตรวจ ยังไม่ผูกกับอะไร และชื่อ/alias ตรงกับตัวเลือก → ใช้ตัวนั้นเป็นชิ้นหลัก ไม่สร้างซ้ำ
  const linkedIds = new Set(opts.flatMap((o) => ((o.choices ?? []) as Ch[]).flatMap((c) => [c.stockItemId, ...(c.stockLinks ?? []).map((l) => l.stockItemId)])).filter(Boolean));
  const reusable = (choice: string) =>
    items.find(
      (i) => i.needsReview && !(i.productIds ?? []).length && !linkedIds.has(i.id) && [i.name, ...(i.aliases ?? [])].some((n) => normName(n) === normName(choice))
    );

  // 1) สร้าง (หรือหยิบของนำเข้ามาใช้) SKU ให้ตัวเลือกที่ขอ
  const created: { choice: string; id: string; name: string; reused?: boolean; extra?: boolean }[] = [];
  const mainOf = new Map<string, string>();
  const extraOf = new Map<string, string>();
  let n = 0;
  const nextCode = () => {
    let code = "";
    do code = `${baseCode}-${++n}`;
    while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  };

  /** 3) ถอด SKU รวมเดิมออกจากสินค้านี้ (กันตัดซ้ำ 2 ต่อ) · ขอให้ลบ + ยอด 0 + ไม่ได้ใช้กับสินค้าอื่น → ลบออกจากคลัง */
  const retireOld = async () => {
    const removed: string[] = [];
    const kept: string[] = [];
    for (const o of oldSkus) {
      const rest = (o.productIds ?? []).filter((x) => x !== productId);
      await saveStockItem({ id: o.id, name: o.name, productIds: rest });
      if (body.removeOld && o.balance === 0 && rest.length === 0) {
        await deleteStockItem(o.id, g.actor.name || g.actor.username);
        removed.push(o.name);
      } else kept.push(o.name);
    }
    return { removed, kept };
  };

  /**
   * 🔀 แยกทุกคู่ของ 2 กลุ่ม — ของบนชั้นต่างกันทั้ง 2 อย่าง (กระจกถือ: ทรง 2 × สี 6 = 12 แบบ · เจ้าของร้านขอ 19 ก.ย. 69)
   * SKU ต่อคู่ ผูกเป็นลิงก์มีเงื่อนไขบนค่าของกลุ่มแรก: สี = สีดำ → ตัด "…ทรงสี่เหลี่ยม · สีดำ" เฉพาะเมื่อ ทรง = ทรงสี่เหลี่ยม
   * ใช้ stockLinks ตัวเดิม (planStockCuts ตัดให้อยู่แล้ว) ไม่ต้องมีโครงข้อมูลใหม่
   */
  if (body.pair) {
    const bi = body.pair.optionIndex;
    const bl = body.pair.label;
    const optB = typeof bi === "number" ? opts[bi] : undefined;
    if (typeof bi !== "number" || bi === optionIndex || !optB || optB.label !== bl || optB.presetId)
      return NextResponse.json({ error: "กลุ่มที่ 2 เปลี่ยนไปแล้ว — ปิดแล้วเปิดใหม่" }, { status: 409 });
    const bNames = new Set(((optB.choices ?? []) as Ch[]).map((c) => c.name));
    const combos = (body.combos ?? []).filter(([a, b]) => want.has(a) && bNames.has(b));
    if (!combos.length) return NextResponse.json({ error: "ยังไม่ได้เลือกคู่ที่จะสร้าง" }, { status: 400 });
    const made: { choice: string; id: string; name: string }[] = [];
    const linksOf = new Map<string, Link[]>();
    try {
      for (const [a, b] of combos) {
        const ca = ((opt.choices ?? []) as Ch[]).find((c) => c.name === a);
        const cb = ((optB.choices ?? []) as Ch[]).find((c) => c.name === b);
        if (!ca || !cb) continue;
        const has = (ca.stockLinks ?? []).some((l) => l.when?.length === 1 && l.when[0].label === bl && l.when[0].choices.length === 1 && l.when[0].choices[0] === b);
        if (has) continue; // คู่นี้มี SKU แล้ว
        const sku = await saveStockItem({
          name: `${partName || p.name} · ${b} · ${a}`,
          code: nextCode(),
          unit: tpl?.unit,
          family: tpl?.family,
          category: tpl?.category,
          unitCost: tpl?.unitCost,
          reorderPoint: tpl?.reorderPoint,
          leadTimeDays: tpl?.leadTimeDays,
          aliases: [`${b} ${a}`],
          imageUrl: ca.imageSrc ?? cb.imageSrc,
          part: partName || undefined,
        });
        made.push({ choice: `${b} · ${a}`, id: sku.id, name: sku.name });
        (linksOf.get(a) ?? linksOf.set(a, []).get(a)!).push({ stockItemId: sku.id, when: [{ label: bl!, choices: [b] }] });
      }
      if (!made.length) return NextResponse.json({ error: "คู่ที่เลือกมี SKU ครบแล้ว" }, { status: 409 });
      const next = {
        ...p,
        options: opts.map((o, i) =>
          i !== optionIndex
            ? o
            : { ...o, choices: ((o.choices ?? []) as Ch[]).map((c) => (linksOf.has(c.name) ? { ...c, stockLinks: [...(c.stockLinks ?? []), ...linksOf.get(c.name)!] } : c)) }
        ),
      };
      await snapshotRevision(db, productId, p, g.actor, "save");
      const { error } = await db.from("products").update({ data: next }).eq("id", productId);
      if (error) throw new Error(error.message);
      invalidateProductsSlim();
    } catch (e) {
      for (const x of made) await deleteStockItem(x.id, "ระบบ (แยกสต๊อกไม่สำเร็จ)").catch(() => null);
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, created: made, ...(await retireOld()) });
  }

  try {
    for (const c of (opt.choices ?? []) as Ch[]) {
      if (!c.name?.trim() || !want.has(c.name)) continue;
      if (!c.stockItemId) {
        const hit = reusable(c.name);
        const sku = await saveStockItem(
          hit
            ? { id: hit.id, name: nameFor(partName, c.name), imageUrl: hit.imageUrl ?? c.imageSrc, part: partName || undefined } // saveStockItem เก็บชื่อเดิมเป็น alias + ปลดรอตรวจให้
            : {
                name: nameFor(partName, c.name),
                code: nextCode(),
                unit: tpl?.unit,
                family: tpl?.family,
                category: tpl?.category,
                unitCost: tpl?.unitCost,
                reorderPoint: tpl?.reorderPoint,
                leadTimeDays: tpl?.leadTimeDays,
                aliases: [c.name],
                imageUrl: c.imageSrc,
                part: partName || undefined,
              }
        );
        if (hit) linkedIds.add(hit.id);
        mainOf.set(c.name, sku.id);
        created.push({ choice: c.name, id: sku.id, name: sku.name, reused: !!hit });
      }
      if (extraName && !(c.stockLinks ?? []).some(sameWhen)) {
        const main = items.find((i) => i.id === (c.stockItemId ?? mainOf.get(c.name)));
        const sku = await saveStockItem({
          name: nameFor(extraName, c.name),
          part: extraName,
          code: nextCode(),
          unit: tpl?.unit ?? main?.unit,
          family: tpl?.family ?? main?.family,
          category: tpl?.category ?? main?.category,
          imageUrl: c.imageSrc,
        });
        extraOf.set(c.name, sku.id);
        created.push({ choice: c.name, id: sku.id, name: sku.name, extra: true });
      }
    }
    if (!created.length) return NextResponse.json({ error: "ตัวเลือกที่เลือกผูก SKU ไว้ครบแล้ว" }, { status: 409 });

    // 2) ผูก SKU เข้าตัวเลือก — ชิ้นหลัก = ตัดเสมอ · ชิ้นที่ 2 = ตัดเมื่อเงื่อนไขตรง
    const next = {
      ...p,
      options: opts.map((o, i) =>
        i !== optionIndex
          ? o
          : {
              ...o,
              choices: ((o.choices ?? []) as Ch[]).map((c) => {
                const main = !c.stockItemId ? mainOf.get(c.name) : undefined;
                const extra = extraOf.get(c.name);
                if (!main && !extra) return c;
                return {
                  ...c,
                  ...(main ? { stockItemId: main } : {}),
                  ...(extra ? { stockLinks: [...(c.stockLinks ?? []), { stockItemId: extra, when: extraWhen! }] } : {}),
                };
              }),
            }
      ),
    };
    await snapshotRevision(db, productId, p, g.actor, "save");
    const { error } = await db.from("products").update({ data: next }).eq("id", productId);
    if (error) throw new Error(error.message);
    invalidateProductsSlim();
  } catch (e) {
    // เขียนสินค้าไม่สำเร็จ → เก็บ SKU ที่เพิ่งสร้างทิ้ง ไม่ให้ค้างเป็นตัวลอยในคลัง (ตัวที่หยิบของนำเข้ามาใช้ ไม่ลบ)
    for (const x of created) if (!x.reused) await deleteStockItem(x.id, "ระบบ (แยกสต๊อกไม่สำเร็จ)").catch(() => null);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created, ...(await retireOld()) });
}

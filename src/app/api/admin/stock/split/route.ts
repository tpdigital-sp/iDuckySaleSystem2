import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { allStockCodes, deleteStockItem, listStockItems, saveStockItem, setNoStock } from "@/lib/server/stock";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { getProductsSlim, invalidateProductsSlim } from "@/lib/server/products-slim";
import { normName, skuPage } from "@/lib/stock-match";
import { RATE_OPTION_INDEX, rateStockOption, writeRateStock } from "@/lib/stock-rate";
import type { Product, ProductOption } from "@/lib/products";
import type { OptionPreset } from "@/lib/option-presets";

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
 *   ⚠️ ชื่อสั้น ๆ (S/M/L/XL/สีดำ) ต้องมาจากหน้าตารางราคาเดียวกับสินค้าเท่านั้น — กติกาเดียวกับ "คู่ที่น่าจะใช่" ใน /links
 *   (30 ก.ย. 69: เสื้อ AWESOME.BKK ไซส์ S/M/L ไปหยิบ SKU "S/M/L" ของปลอกคอสัตว์เลี้ยงมาใช้ · ตัวนำเข้าพวกนี้ติดธง
 *   "ไม่ต้องมีสต๊อก" ทั้งชุด → ทุก SKU ของเสื้อโดนกรองหายจากหน้าคลัง = "สินค้าหาย") · หยิบมาใช้แล้วต้องปลดธง noStock ด้วย
 *
 * ⚠️ ต้องถอด SKU รวมเดิมเสมอ — ไม่งั้นออเดอร์เดียวตัด 2 ต่อ (ตัวสินค้า 1 + ตัวเลือก 1)
 *
 * 📦 "เรทราคา" แยกได้ด้วย (การ์ดสเปรย์ 20 ml / 40 ml เป็นขวดคนละแบบ · 30 ก.ย. 69): ส่งมาเป็นกลุ่มเสมือน
 * optionIndex = RATE_OPTION_INDEX (-1) label = "เรทราคา" · เขียนกลับลง priceRates[].stockItemId/stockLinks (lib/stock-rate.ts)
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
  /**
   * 🔗 กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ตะขอ preset-3 ที่พวงกุญแจทุกตัวใช้) — เดิมถูกตัดทิ้ง (ตั้งใจให้ไปผูกที่หน้าผูกคลัง)
   * เจ้าของร้านเปิดแยกสต๊อกพวงกุญแจแล้วไม่เจอรายการตะขอ 31 ตัว (1 ต.ค. 69) → โชว์ด้วย โดยอ่าน choices สดจากแถวคลัง (ไม่ใช่สำเนาในสินค้า)
   * แยกแล้วเขียน stockItemId ลง "คลังกลาง" = มีผลกับทุกสินค้าที่ใช้ชุดนั้น (ทางเดียวกับหน้าผูกคลัง)
   */
  const presetIds = [...new Set((p.options ?? []).map((o) => o.presetId).filter((x): x is string => !!x))];
  const presetRows = presetIds.length ? (await db.from("products").select("id,data").in("id", presetIds.map((id) => `__preset_${id}`))).data ?? [] : [];
  const presetOf = new Map(presetRows.map((r) => [String(r.id).replace(/^__preset_/, ""), r.data as OptionPreset]));
  const usedBy = new Map<string, number>();
  if (presetIds.length) {
    const slim = await getProductsSlim();
    for (const id of presetIds) usedBy.set(id, slim.products.filter((r) => (r.data.options ?? []).some((o: ProductOption) => o.presetId === id)).length);
  }

  // กลุ่มที่แยกได้: ของสินค้าเอง (ไม่ลิงก์คลังกลาง — พวกนั้นผูกที่หน้าผูกคลัง) · เป็นตัวเลือกให้เลือก ไม่ใช่ช่องกรอก · มีค่าที่มีชื่อ
  // + "เรทราคา" เป็นกลุ่มเสมือนนำหน้า (มีเมื่อสินค้ามีหลายเรท) — เรทตัวแทนไม่โชว์ เพราะยืม SKU ของเรท public คู่ของมันตอนตัด
  const rateGroup = rateStockOption(p.priceRates);
  const groups = [...(rateGroup && (rateGroup.choices ?? []).length > 1 ? [{ o: rateGroup, optionIndex: RATE_OPTION_INDEX }] : []), ...(p.options ?? []).map((o, optionIndex) => ({ o, optionIndex }))]
    .map(({ o, optionIndex }) => (o.presetId && presetOf.get(o.presetId) ? { o: { ...o, label: presetOf.get(o.presetId)!.label, choices: presetOf.get(o.presetId)!.choices }, optionIndex } : { o, optionIndex }))
    .filter(({ o, optionIndex }) => optionIndex === RATE_OPTION_INDEX || (o.display !== "input" && (o.choices ?? []).some((c) => c.name?.trim())))
    .map(({ o, optionIndex }) => ({
      optionIndex,
      label: o.label,
      rate: optionIndex === RATE_OPTION_INDEX,
      // 🔗 คลังตัวเลือกกลาง — แยกแล้วผูกที่คลัง มีผลทุกสินค้าที่ใช้ชุดนี้ · ของชิ้นที่ 2/โหมดคู่/แก้ชื่อ ทำที่คลังไม่ได้
      ...(o.presetId ? { preset: true, presetId: o.presetId, usedBy: usedBy.get(o.presetId) ?? 0 } : {}),
      // เงื่อนไขแสดงกลุ่ม (showWhen ฯลฯ) — ให้หน้าจอตัดคู่ที่กลุ่มนี้ไม่โชว์ทิ้ง (เช่น กลุ่มสีที่มีเฉพาะตอนเลือกทรงหัวใจ)
      show: [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter((s): s is { label: string; choices: string[] } => !!s?.label && !!s.choices?.length),
      showAny: (o.showWhenAny ?? []).filter((s): s is { label: string; choices: string[] } => !!s?.label && !!s.choices?.length),
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

  // กฎตัวเลือกขึ้นต่อกัน (OptionRule) — โหมด 2 กลุ่มต้องไม่สร้าง SKU ของคู่ที่ลูกค้าเลือกไม่ได้ (เคสธรรมดา ไม่มี iPhone 17 · เจ้าของร้านเจอ 30 ก.ย. 69)
  return NextResponse.json({ ok: true, product: { id: productId, name: p.name }, groups, old, rules: p.rules ?? [] });
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
    /** ✏️ ชื่อ SKU รายแถวที่ผู้ใช้แก้ในหน้าต่าง — คีย์ = ชื่อตัวเลือก หรือ "a\u0001b" ในโหมดคู่ · ไม่ส่ง/ว่าง = ตั้งจาก nameFor */
    /** 🏭 ใช้ตัวเลือกเป็น "รายชื่อ" เท่านั้น — สร้างวัสดุแบบเบิกเอง ไม่ผูกกับสินค้า ไม่แตะ product (เจ้าของร้านสั่ง 30 ก.ย. 69: สีผ้าสักหลาดไม่ตัดตามการขาย) */
    manualOnly?: boolean;
    /** 🧩 วัสดุกลางตามตัวเลือก — หน้าคลังจัดกลุ่มใต้ชื่อกลุ่มตัวเลือก ไม่ใช่ชื่อสินค้า (ยังผูก/ตัดตามปกติ) · ตระกูลไม่กรอก = ชื่อกลุ่มตัวเลือก */
    groupByOption?: boolean;
    names?: Record<string, string>;
    /**
     * 🌳 แตกตามกลุ่มย่อยที่ขึ้นกับค่า (ตะขอ K ตะขอแมว → สีตะขอ โลหะ = เงิน/ทอง/โรสโกลด์/รุ้ง · เจ้าของร้านขอ 1 ต.ค. 69 "ต้องเป็นแบบหน้าสินค้า")
     * [ค่ากลุ่มหลัก, ชื่อกลุ่มย่อย, ค่ากลุ่มย่อย] → SKU ต่อคู่ ผูกเป็นลิงก์มีเงื่อนไขบนค่ากลุ่มหลัก (เหมือนโหมดคู่ แต่กลุ่มย่อยต่างกันได้ต่อค่า)
     * คีย์ names/perRow = "a\u0001b"
     */
    tree?: [string, string, string][];
    /** 📍 จุดสั่งซื้อ/รอของ รายแถว (คีย์เดียวกับ names) — ทับ defaults เฉพาะแถวนั้น */
    perRow?: Record<string, { reorderPoint?: number; leadTimeDays?: number }>;
    /** 📝 รายละเอียดของวัสดุที่จะสร้าง (หน่วย/แพ็ค/ตระกูล/ทุน/จุดสั่ง) — เจ้าของร้านขอกรอกก่อนสร้าง ไม่ใช่ได้ "ชิ้น" ค่าว่างมาแล้วไล่แก้ทีหลัง (30 ก.ย. 69) */
    defaults?: { unit?: string; packUnit?: string; packSize?: number; family?: string; category?: string; unitCost?: number; reorderPoint?: number; leadTimeDays?: number };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { productId, optionIndex, label } = body;
  const want = new Set((body.choices ?? []).map((x) => String(x)));
  const tree = (body.tree ?? []).filter((t): t is [string, string, string] => Array.isArray(t) && t.length === 3 && t.every((x) => typeof x === "string" && !!x.trim()));
  if (!productId || typeof optionIndex !== "number" || !label || (!want.size && !tree.length))
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await db.from("products").select("id,data").eq("id", productId).maybeSingle();
  const p = row?.data as Product | undefined;
  if (!p?.name) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  const opts: ProductOption[] = p.options ?? [];
  const rateGroup = rateStockOption(p.priceRates);
  /** 🔗 กลุ่มที่ขอแยกเป็นคลังตัวเลือกกลาง → ใช้ choices สดจากแถวคลัง และเขียนกลับที่คลัง (ดู GET) */
  const presetId = typeof optionIndex === "number" && optionIndex >= 0 ? opts[optionIndex]?.presetId : undefined;
  const presetRowId = presetId ? `__preset_${presetId}` : null;
  // ทุกกลุ่มที่ลิงก์คลังกลางใช้ choices สด (กลุ่มย่อย "สีตะขอ X" ก็เป็นคลังกลาง — ต้องเห็นค่าจริงตอนแตกตามกลุ่มย่อย)
  const allPresetIds = [...new Set(opts.map((o) => o.presetId).filter((x): x is string => !!x))];
  const presetRows = allPresetIds.length ? (await db.from("products").select("id,data").in("id", allPresetIds.map((id) => `__preset_${id}`))).data ?? [] : [];
  const presetOf = new Map(presetRows.map((r) => [String(r.id).replace(/^__preset_/, ""), r.data as OptionPreset]));
  for (let i = 0; i < opts.length; i++) {
    const pr = opts[i].presetId ? presetOf.get(opts[i].presetId!) : undefined;
    if (pr) opts[i] = { ...opts[i], label: pr.label, choices: pr.choices };
  }
  const presetRow = presetId ? presetOf.get(presetId) : undefined;
  if (presetId && !presetRow) return NextResponse.json({ error: "ไม่พบคลังตัวเลือกกลางของกลุ่มนี้ — อาจถูกลบไปแล้ว" }, { status: 404 });
  /** กลุ่มตามลำดับ — -1 = กลุ่มเสมือน "เรทราคา" */
  const groupAt = (i: number): ProductOption | undefined => (i === RATE_OPTION_INDEX ? rateGroup ?? undefined : opts[i]);
  /** ทุกกลุ่มพร้อมลำดับ (ไว้เช็คเงื่อนไข/ลิงก์ที่มีอยู่) */
  const allGroups = [...(rateGroup ? [{ o: rateGroup, i: RATE_OPTION_INDEX }] : []), ...opts.map((o, i) => ({ o, i }))];
  /** เขียน choices ของกลุ่มที่ i กลับลงสินค้า — กลุ่มเสมือนเรท → priceRates · กลุ่มจริง → options */
  const applyTo = (i: number, f: (chs: Ch[]) => Ch[]): Product =>
    i === RATE_OPTION_INDEX
      ? { ...p, priceRates: writeRateStock(p.priceRates ?? [], (chs) => f((chs ?? []) as Ch[]) as ProductOption["choices"]) }
      : { ...p, options: opts.map((o, j) => (j !== i ? o : { ...o, choices: f((o.choices ?? []) as Ch[]) as ProductOption["choices"] })) };
  const opt = groupAt(optionIndex);
  if (!opt || opt.label !== label)
    return NextResponse.json({ error: "กลุ่มตัวเลือกเปลี่ยนไปแล้ว — ปิดแล้วเปิดใหม่" }, { status: 409 });
  if (presetRow && body.pair) return NextResponse.json({ error: "กลุ่มคลังตัวเลือกกลางแยกได้ทีละกลุ่ม (จับคู่กับกลุ่มอื่นไม่ได้ — ลิงก์อยู่ที่คลัง ไม่ใช่ที่สินค้า)" }, { status: 400 });
  if (presetRow && body.extra?.name?.trim()) return NextResponse.json({ error: "คลังตัวเลือกกลางยังตั้งของชิ้นที่ 2 แบบมีเงื่อนไขไม่ได้ — ต้องตั้งที่ตัวเลือกของสินค้าเอง" }, { status: 400 });

  const items = await listStockItems();
  const oldSkus = items.filter((i) => (i.productIds ?? []).includes(productId));
  const tpl = oldSkus[0]; // ยืมหน่วย/ตระกูล/ทุน/จุดสั่งจาก SKU รวมเดิม จะได้ไม่ต้องกรอกซ้ำ
  // ค่าที่กรอกในหน้าต่างมาก่อน · ไม่กรอก = ยืมจาก SKU รวมเดิม (ถ้ามี)
  const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  const dft = body.defaults ?? {};
  const D = {
    unit: dft.unit?.trim() || tpl?.unit,
    family: dft.family?.trim() || tpl?.family,
    category: dft.category?.trim() || tpl?.category,
    unitCost: fin(dft.unitCost) ?? tpl?.unitCost,
    reorderPoint: fin(dft.reorderPoint) ?? tpl?.reorderPoint,
    leadTimeDays: fin(dft.leadTimeDays) ?? tpl?.leadTimeDays,
    packUnit: dft.packUnit?.trim() || tpl?.packUnit,
    packSize: fin(dft.packSize) ?? tpl?.packSize,
    manualOnly: body.manualOnly ? true : undefined,
    // 🔗 กลุ่มคลังกลาง = ใช้ร่วมหลายสินค้าโดยนิยาม → หัวกลุ่มหน้าคลังเป็นชื่อกลุ่มตัวเลือก (ไม่ใช่ชื่อสินค้าตัวที่เปิดแยก)
    groupByOption: (body.groupByOption || !!presetRow) && !body.manualOnly ? true : undefined,
  };
  const baseCode = tpl?.code ?? `P-${productId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase()}`;
  const usedCodes = await allStockCodes(); // รวมตัวที่ลบแล้ว — กันรหัสซ้ำของเก่า

  const partName = body.partName?.trim() ?? "";
  const extraName = body.extra?.name?.trim() ?? "";
  const extraWhen = body.extra?.when?.label && body.extra.when.choices?.length ? [{ label: body.extra.when.label, choices: body.extra.when.choices }] : null;
  if (extraName && !extraWhen) return NextResponse.json({ error: "ของชิ้นที่ 2 ต้องระบุเงื่อนไข (กลุ่ม + ค่าที่เลือก)" }, { status: 400 });
  if (extraWhen && !allGroups.some(({ o, i }) => i !== optionIndex && o.label === extraWhen[0].label))
    return NextResponse.json({ error: "ไม่พบกลุ่มตัวเลือกของเงื่อนไข" }, { status: 409 });
  // มีชื่อชิ้นส่วน → "แผ่นจิ๊กซอว์ ขนาด 15*20cm (ชื่อสินค้า)" · ไม่มี → รูปแบบเดิม "ชื่อสินค้า · ตัวเลือก"
  // ชื่อ SKU ตั้งจาก "กลุ่มตัวเลือก" ไม่ใช่ชื่อสินค้า — วัสดุคือผ้าสักหลาดสีขาว ไม่ใช่อาร์มปัก (เจ้าของร้านสั่ง 30 ก.ย. 69)
  // ตัดวงเล็บท้ายชื่อกลุ่มทิ้ง: "สีไหม Madeira (รวมในราคา 3 สี …)" → "สีไหม Madeira"
  const shortLabel = (s: string) => s.replace(/\s*[(（].*$/, "").trim() || s;
  const nameFor = (part: string, choice: string) => (part ? `${part} ${choice} (${p.name})` : `${shortLabel(label)} · ${choice}`);
  const customName = (key: string) => body.names?.[key]?.trim() || "";
  // โหมดเบิกเอง: ตระกูล = ชื่อกลุ่มตัวเลือก (จะได้รวมกลุ่มกันในหน้าคลังใต้ "ของใช้ในโรงงาน") ถ้าไม่ได้กรอกมา
  if (body.manualOnly && !dft.family?.trim()) D.family = shortLabel(label);
  // 🧩 วัสดุกลางตามตัวเลือก: ตระกูล = ชื่อกลุ่มตัวเลือกเช่นกัน — มุมมอง "วัสดุทั้งหมด" และกลุ่ม "ใช้ร่วมหลายสินค้า" จะได้ชื่อเดียวกับหัวกลุ่ม
  if (D.groupByOption && !dft.family?.trim()) D.family = shortLabel(label);
  const rowMeta = (key: string) => {
    const r = body.perRow?.[key];
    return { reorderPoint: fin(r?.reorderPoint) ?? D.reorderPoint, leadTimeDays: fin(r?.leadTimeDays) ?? D.leadTimeDays };
  };
  const sameWhen = (l: Link) => JSON.stringify(l.when ?? []) === JSON.stringify(extraWhen ?? []);

  // SKU นำเข้าที่รอตรวจ ยังไม่ผูกกับอะไร และชื่อ/alias ตรงกับตัวเลือก → ใช้ตัวนั้นเป็นชิ้นหลัก ไม่สร้างซ้ำ
  const linkedIds = new Set(allGroups.flatMap(({ o }) => ((o.choices ?? []) as Ch[]).flatMap((c) => [c.stockItemId, ...(c.stockLinks ?? []).map((l) => l.stockItemId)])).filter(Boolean));
  //   ชื่อสั้นกว่า 8 ตัว (S/M/L/สีดำ) ซ้ำกันทั้งร้าน → ต้องมาจากหน้าตารางราคาเดียวกัน (รหัส PL-<PAGE>- อยู่ในรหัสสินค้า) เหมือนตัวเสนอคู่ใน /links
  const idNorm = productId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const reusable = (choice: string) => {
    const n = normName(choice);
    if (n.length < 2) return undefined;
    return items.find((i) => {
      if (!i.needsReview || (i.productIds ?? []).length || linkedIds.has(i.id)) return false;
      const page = skuPage(i.code);
      if (n.length < 8 && !(page && idNorm.includes(page))) return false;
      return [i.name, ...(i.aliases ?? [])].some((nm) => normName(nm) === n);
    });
  };

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
    const optB = typeof bi === "number" ? groupAt(bi) : undefined;
    if (typeof bi !== "number" || bi === optionIndex || !optB || optB.label !== bl || optB.presetId || presetRow)
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
        if (has && !body.manualOnly) continue; // คู่นี้มี SKU แล้ว (โหมดเบิกเองไม่สนลิงก์)
        const sku = await saveStockItem({
          name: customName(`${a}\u0001${b}`) || `${partName || shortLabel(label)} · ${b} · ${a}`,
          ...rowMeta(`${a}\u0001${b}`),
          code: nextCode(),
          unit: D.unit,
          family: D.family,
          category: D.category,
          unitCost: D.unitCost,
          reorderPoint: D.reorderPoint,
          leadTimeDays: D.leadTimeDays,
          packUnit: D.packUnit,
          packSize: D.packSize,
          manualOnly: D.manualOnly,
          groupByOption: D.groupByOption,
          aliases: [`${b} ${a}`],
          imageUrl: ca.imageSrc ?? cb.imageSrc,
          part: partName || undefined,
        });
        made.push({ choice: `${b} · ${a}`, id: sku.id, name: sku.name });
        (linksOf.get(a) ?? linksOf.set(a, []).get(a)!).push({ stockItemId: sku.id, when: [{ label: bl!, choices: [b] }] });
      }
      if (!made.length) return NextResponse.json({ error: "คู่ที่เลือกมี SKU ครบแล้ว" }, { status: 409 });
      if (body.manualOnly) return NextResponse.json({ ok: true, created: made, manualOnly: true }); // ไม่ผูกสินค้า ไม่แตะ product
      const next = applyTo(optionIndex, (chs) => chs.map((c) => (linksOf.has(c.name) ? { ...c, stockLinks: [...(c.stockLinks ?? []), ...linksOf.get(c.name)!] } : c)));
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
      if (!c.stockItemId || body.manualOnly) {
        const hit = reusable(c.name);
        const sku = await saveStockItem(
          hit
            ? {
                id: hit.id,
                name: customName(c.name) || nameFor(partName, c.name),
                ...rowMeta(c.name),
                // ย้ายมาอยู่ตระกูล/หมวด/หน่วยของสินค้านี้ (ตาม SKU รวมเดิม) — ไม่มีก็คงของนำเข้าไว้
                unit: D.unit,
                family: D.family,
                category: D.category,
                imageUrl: hit.imageUrl ?? c.imageSrc,
                part: partName || undefined,
                groupByOption: D.groupByOption,
              } // saveStockItem เก็บชื่อเดิมเป็น alias + ปลดรอตรวจให้
            : {
                name: customName(c.name) || nameFor(partName, c.name),
                ...rowMeta(c.name),
                code: nextCode(),
                unit: D.unit,
                family: D.family,
                category: D.category,
                unitCost: D.unitCost,
                reorderPoint: D.reorderPoint,
                leadTimeDays: D.leadTimeDays,
                packUnit: D.packUnit,
                packSize: D.packSize,
                manualOnly: D.manualOnly,
                groupByOption: D.groupByOption,
                aliases: [c.name],
                imageUrl: c.imageSrc,
                part: partName || undefined,
              }
        );
        if (hit) {
          linkedIds.add(hit.id);
          // ของนำเข้าที่รอตรวจถูกติดธง "ไม่ต้องมีสต๊อก" ไว้ทั้งชุด — แยกสต๊อกต่อตัวเลือกคือต้องนับ → ปลดธง ไม่งั้นแถวหายจากหน้าคลัง
          if (hit.noStock) await setNoStock([hit.id], false);
        }
        mainOf.set(c.name, sku.id);
        created.push({ choice: c.name, id: sku.id, name: sku.name, reused: !!hit });
      }
      if (extraName && !(c.stockLinks ?? []).some(sameWhen)) {
        const main = items.find((i) => i.id === (c.stockItemId ?? mainOf.get(c.name)));
        const sku = await saveStockItem({
          name: nameFor(extraName, c.name),
          part: extraName,
          code: nextCode(),
          unit: D.unit ?? main?.unit,
          family: D.family ?? main?.family,
          category: D.category ?? main?.category,
          packUnit: D.packUnit,
          packSize: D.packSize,
          manualOnly: D.manualOnly,
          groupByOption: D.groupByOption,
          imageUrl: c.imageSrc,
        });
        extraOf.set(c.name, sku.id);
        created.push({ choice: c.name, id: sku.id, name: sku.name, extra: true });
      }
    }
    // 🌳 แตกตามกลุ่มย่อย: SKU ต่อ (ค่าหลัก, ค่าย่อย) ผูกเป็นลิงก์มีเงื่อนไขบนค่าหลัก — ตะขอแมว + สีเงิน = "ตะขอ · K ตะขอแมว · สีเงิน"
    const treeLinks = new Map<string, Link[]>();
    for (const [a, depLabel, b] of tree) {
      const host = ((opt.choices ?? []) as Ch[]).find((c) => c.name === a);
      if (!host) return NextResponse.json({ error: `ไม่พบตัวเลือก “${a}” ในกลุ่ม “${label}”` }, { status: 409 });
      const dep = allGroups.find(({ o, i }) => i !== optionIndex && o.label === depLabel)?.o;
      if (!dep) return NextResponse.json({ error: `ไม่พบกลุ่มย่อย “${depLabel}”` }, { status: 409 });
      const bc = ((dep.choices ?? []) as Ch[]).find((c) => c.name === b);
      if (!bc) return NextResponse.json({ error: `กลุ่ม “${depLabel}” ไม่มีค่า “${b}”` }, { status: 409 });
      const when = [{ label: depLabel, choices: [b] }];
      if ((host.stockLinks ?? []).some((l) => JSON.stringify(l.when ?? []) === JSON.stringify(when))) continue; // มีแล้ว
      const key = `${a}\u0001${b}`;
      const sku = await saveStockItem({
        name: customName(key) || `${shortLabel(label)} · ${a} · ${b}`,
        ...rowMeta(key),
        code: nextCode(),
        unit: D.unit,
        family: D.family,
        category: D.category,
        unitCost: D.unitCost,
        reorderPoint: D.reorderPoint,
        leadTimeDays: D.leadTimeDays,
        packUnit: D.packUnit,
        packSize: D.packSize,
        manualOnly: D.manualOnly,
        groupByOption: D.groupByOption,
        aliases: [`${a} · ${b}`],
        imageUrl: bc.imageSrc ?? host.imageSrc,
        part: partName || undefined,
      });
      (treeLinks.get(a) ?? treeLinks.set(a, []).get(a)!).push({ stockItemId: sku.id, when });
      created.push({ choice: `${a} · ${b}`, id: sku.id, name: sku.name });
    }
    if (!created.length) return NextResponse.json({ error: "ตัวเลือกที่เลือกผูก SKU ไว้ครบแล้ว" }, { status: 409 });
    // 🏭 โหมดเบิกเอง: ได้วัสดุแล้วจบ ไม่ผูกเข้าตัวเลือก ไม่ปลดของเก่า
    if (body.manualOnly) return NextResponse.json({ ok: true, created, manualOnly: true });

    // 2) ผูก SKU เข้าตัวเลือก — ชิ้นหลัก = ตัดเสมอ · ชิ้นที่ 2 = ตัดเมื่อเงื่อนไขตรง
    const next = applyTo(optionIndex, (chs) =>
      chs.map((c) => {
        const main = !c.stockItemId ? mainOf.get(c.name) : undefined;
        const extra = extraOf.get(c.name);
        const kids = treeLinks.get(c.name) ?? [];
        if (!main && !extra && !kids.length) return c;
        return {
          ...c,
          ...(main ? { stockItemId: main } : {}),
          ...(extra || kids.length ? { stockLinks: [...(c.stockLinks ?? []), ...(extra ? [{ stockItemId: extra, when: extraWhen! }] : []), ...kids] } : {}),
        };
      })
    );
    if (presetRow && presetRowId) {
      // 🔗 ผูกที่คลังตัวเลือกกลาง — choices ของแถว __preset_ (สินค้าทุกตัวที่ลิงก์คลังนี้ตัดสต๊อกตามทันที)
      const nextPreset: OptionPreset = { ...presetRow, choices: (next.options[optionIndex] as ProductOption).choices };
      await snapshotRevision(db, presetRowId, presetRow, g.actor, "save");
      const { error } = await db.from("products").update({ data: nextPreset }).eq("id", presetRowId);
      if (error) throw new Error(error.message);
    } else {
      await snapshotRevision(db, productId, p, g.actor, "save");
      const { error } = await db.from("products").update({ data: next }).eq("id", productId);
      if (error) throw new Error(error.message);
    }
    invalidateProductsSlim();
  } catch (e) {
    // เขียนสินค้าไม่สำเร็จ → เก็บ SKU ที่เพิ่งสร้างทิ้ง ไม่ให้ค้างเป็นตัวลอยในคลัง (ตัวที่หยิบของนำเข้ามาใช้ ไม่ลบ)
    for (const x of created) if (!x.reused) await deleteStockItem(x.id, "ระบบ (แยกสต๊อกไม่สำเร็จ)").catch(() => null);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 🔗 แยกตามคลังกลาง (ตะขอ) ไม่ใช่ "วัสดุหลัก" ของสินค้า — SKU รวมเดิมของสินค้า (แผ่นอะคริลิค) ต้องอยู่ต่อ ไม่ปลด
  return NextResponse.json({ ok: true, created, ...(presetRow ? { preset: true, usedBy: presetRow.label, removed: [], kept: [] } : await retireOld()) });
}

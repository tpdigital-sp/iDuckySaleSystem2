import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listStock } from "@/lib/server/stock";
import { getProductsSlim, invalidateProductsSlim } from "@/lib/server/products-slim";
import { snapshotRevision } from "@/lib/server/product-revisions";
import type { Product, ProductOption } from "@/lib/products";

export const runtime = "nodejs";

/**
 * ผูก "ตัวเลือกสินค้า" เข้ากับ SKU ในคลัง — งานกวาดครั้งเดียว จึงรวมไว้หน้าเดียว
 * ผูกที่ preset ได้ผลกับทุกสินค้าที่ลิงก์คลังนั้น · ผูกที่สินค้าได้ผลเฉพาะตัวนั้น
 */

/** มิติที่กินสต๊อก vs มิติกระบวนการ — ชุดเดียวกับสคริปต์ฝั่ง node (product-variants.mjs) */
const PROC_DIM = /สกรีน|พิมพ์|ตำแหน่งงาน|เทคนิค|ไดคัท|เจาะรู|ระบบพิมพ์|จำนวน|ด้าน$/;
const MAT_DIM = /เนื้อผ้า|^ผ้า|สีไหม|ไหม|ซิป|ตะขอ|โซ่|อะคริลิค|ขนาด|ประเภท|วัสดุ|กลิตเตอร์|^สี|ฐาน|หูกระเป๋า|ชนิด|ความหนา/;
// ห้าม export — ไฟล์ route ของ Next ให้ export ได้เฉพาะ GET/POST ฯลฯ (เคยทำ build ล้มทั้งเว็บ)
function isMaterialDim(label: string): boolean {
  const L = (label ?? "").trim();
  if (!L || PROC_DIM.test(L)) return false;
  return MAT_DIM.test(L);
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

async function guard() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  return null;
}

type WhenCond = { label: string; choices: string[] };
type Target = {
  presetId?: string;
  productId?: string;
  label?: string;
  optionIndex?: number;
  choice?: string;
  index?: number;
  stockItemId?: string | null;
  stockQtyPer?: number | null;
  unlinkExtra?: string;
  /** ผูก "ของที่ตัดเพิ่มแบบมีเงื่อนไข" เข้ากับตัวเลือกนี้ (กรอบรูป A5 ตัดเพิ่มเมื่อ ตัวเลือก = กรอบรูป + แผ่นจิ๊กซอว์) */
  linkExtra?: { stockItemId?: string; per?: number | null; when?: WhenCond[] };
};

/**
 * หากลุ่มตัวเลือกของสินค้า — ชี้ด้วยลำดับก่อน (ต้องชื่อตรงด้วย กันหน้าจอเก่า) ไม่มี/ไม่ตรง = กลุ่มแรกที่ชื่อตรง
 * ⚠️ ห้ามใช้ label อย่างเดียว: กลุ่มชื่อซ้ำในสินค้าเดียวมีอยู่จริง
 */
function findOption(opts: ProductOption[], label: string | undefined, optionIndex: number | undefined): number {
  if (typeof optionIndex === "number" && opts[optionIndex]?.label === label && !opts[optionIndex]?.presetId) return optionIndex;
  return opts.findIndex((o) => o.label === label && !o.presetId);
}

/** อ่าน body + หาแถวใน products ที่จะแก้ (preset เก็บเป็นแถว __preset_<id> ในตารางเดียวกัน) */
type TargetRow = { id: string; data: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function readTarget(
  req: Request,
  db: NonNullable<ReturnType<typeof sb>>
): Promise<{ res: NextResponse; body?: undefined; rowId?: undefined; row?: undefined } | { res?: undefined; body: Target; rowId: string; row: TargetRow }> {
  let body: Target;
  try {
    body = await req.json();
  } catch {
    return { res: NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 }) };
  }
  const { presetId, productId, label, choice } = body;
  if (!choice || (!presetId && !(productId && label)))
    return { res: NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 }) };
  const rowId = presetId ? `__preset_${presetId}` : productId!;
  const { data: row } = await db.from("products").select("id,data").eq("id", rowId).maybeSingle();
  if (!row?.data) return { res: NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 }) };
  return { body, rowId, row: row as TargetRow };
}

/** ตารางงาน: ทุกมิติที่กินสต๊อกของทุกสินค้า พร้อมบอกว่าตัวเลือกไหนผูก SKU แล้ว */
export async function GET(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  /**
   * ?options=<productId> → กลุ่มตัวเลือก "ทุกกลุ่ม" ของสินค้าตัวเดียว (ไม่กรองเฉพาะมิติที่กินสต๊อก)
   * ฟอร์มตั้งเงื่อนไขต้องเลือกกลุ่มอย่าง "ตัวเลือก"/"แบบ" ที่ไม่ใช่มิติวัสดุได้ด้วย
   */
  const wantOptions = new URL(req.url).searchParams.get("options");
  if (wantOptions) {
    const { data: row } = await db.from("products").select("id,data").eq("id", wantOptions).maybeSingle();
    if (!row?.data) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
    const p = row.data as Product;
    return NextResponse.json({
      ok: true,
      productId: row.id,
      productName: p.name,
      options: (p.options ?? []).map((o, optionIndex) => ({
        label: o.label,
        optionIndex,
        fromPreset: !!o.presetId, // มาจากคลังตัวเลือกกลาง — ผูกของมีเงื่อนไขที่นี่ไม่ได้ (ต้องไปแก้ที่คลังกลาง)
        choices: (o.choices ?? []).map((c) => c.name),
      })),
    });
  }

  // สินค้า+คลังตัวเลือกจากแคชกลาง (products-slim) · SKU จาก Firestore — ยิงพร้อมกัน
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const [slimRes, stock] = await Promise.all([
    getProductsSlim({ fresh }).then((v) => ({ v }), (e: Error) => ({ e })),
    listStock(),
  ]);
  if ("e" in slimRes) return NextResponse.json({ error: slimRes.e.message }, { status: 502 });
  const presets = slimRes.v.presets.map((r) => r.data);
  const prods = slimRes.v.products;

  // มิติที่มาจาก preset รวบไว้แถวเดียว — ผูกครั้งเดียวมีผลทุกสินค้าที่ลิงก์
  const presetRows = presets
    .filter((p) => isMaterialDim(p.label))
    .map((p) => ({
      kind: "preset" as const,
      key: `preset:${p.id}`,
      presetId: p.id,
      label: p.label,
      usedBy: prods.filter((r) => (r.data.options ?? []).some((o: ProductOption) => o.presetId === p.id)).length,
      choices: (p.choices ?? []).map((c) => ({ name: c.name, stockItemId: c.stockItemId ?? null, stockQtyPer: c.stockQtyPer ?? null })),
    }));

  // มิติเฉพาะสินค้า (ไม่ได้ลิงก์คลัง)
  const productRows: {
    kind: "product";
    key: string;
    productId: string;
    productName: string;
    draft: boolean;
    label: string;
    optionIndex: number;
    choices: { name: string; stockItemId: string | null; stockQtyPer: number | null }[];
  }[] = [];
  for (const r of prods) {
    const p = r.data as Product;
    // วนตัวเลือก "ดิบ" พร้อมลำดับ — กลุ่มที่ไม่ลิงก์คลังไม่ถูก resolveOptions แตะอยู่แล้ว
    // ต้องมีลำดับ (optionIndex) เพราะสินค้าบางตัวมีกลุ่มชื่อซ้ำ 2 กลุ่ม (เช่น 1-3 มี "ขนาด" 2 กลุ่ม) ชี้ด้วยชื่ออย่างเดียวจะโดนผิดกลุ่ม
    (p.options ?? []).forEach((o, oi) => {
      if (o.presetId || !isMaterialDim(o.label)) return;
      productRows.push({
        kind: "product",
        key: `product:${r.id}:${oi}:${o.label}`,
        productId: r.id,
        productName: p.name,
        draft: !!(p as Product & { hidden?: boolean }).hidden,
        label: o.label,
        optionIndex: oi,
        choices: (o.choices ?? []).map((c) => ({ name: c.name, stockItemId: c.stockItemId ?? null, stockQtyPer: c.stockQtyPer ?? null })),
      });
    });
  }

  return NextResponse.json({
    ok: true,
    presetRows,
    productRows,
    items: stock.items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, family: i.family, aliases: i.aliases })),
  });
}

/**
 * ผูก/ถอดตัวเลือกหนึ่งค่า หรือตั้งอัตราใช้วัสดุ
 *   body มี stockItemId  → ผูก (มีค่า) / ถอด (null — ล้าง stockQtyPer ไปด้วย อัตราของ SKU เก่าไม่ควรติดไป SKU ใหม่)
 *   body มีแค่ stockQtyPer → ตั้ง "ใช้กี่หน่วยต่อสินค้า 1 ชิ้น" ของค่าที่ผูกแล้ว (รับทศนิยม เช่น 0.5 แผ่น)
 *                            1 / ว่าง / null = ลบคีย์ทิ้ง (ค่าเริ่มต้นตอนตัดสต๊อกคือ 1 อยู่แล้ว — ดู loadOptionStockMap)
 */
export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const t = await readTarget(req, db);
  if (t.res) return t.res;
  const { body, rowId, row } = t;
  const { presetId, label, choice } = body;
  const linkExtra = body.linkExtra;
  const linkMode = !linkExtra && ("stockItemId" in body || !("stockQtyPer" in body));
  const stockItemId = body.stockItemId || null;

  let per: number | null = null;
  if (!linkMode) {
    const n = Number(body.stockQtyPer);
    if (body.stockQtyPer != null && (!Number.isFinite(n) || n <= 0 || n > 100000))
      return NextResponse.json({ error: "อัตราใช้ต้องเป็นตัวเลขมากกว่า 0" }, { status: 400 });
    per = body.stockQtyPer == null || n === 1 ? null : Math.round(n * 10000) / 10000;
  }

  type Extra = { stockItemId: string; per?: number; when: WhenCond[] };
  type Ch = { name: string; stockItemId?: string; stockQtyPer?: number; stockLinks?: Extra[] };
  const unlinkExtra = body.unlinkExtra;
  let extra: Extra | null = null; // เติมค่าหลังตรวจ (setOn ถูกเรียกทีหลัง จึงอ่านค่าที่เติมแล้วเสมอ)
  const without = (c: Ch, keys: string[]) => Object.fromEntries(Object.entries(c).filter(([k]) => !keys.includes(k))) as Ch;
  let notLinked = false;
  const setOn = (choices: Ch[]) =>
    choices.map((c) => {
      if (c.name !== choice) return c;
      if (unlinkExtra) {
        // ถอดเฉพาะลิงก์แบบมีเงื่อนไขตัวนั้น — ลิงก์หลักของตัวเลือก (stockItemId) ไม่แตะ
        const rest = (c.stockLinks ?? []).filter((l) => l.stockItemId !== unlinkExtra);
        return rest.length ? { ...c, stockLinks: rest } : without(c, ["stockLinks"]);
      }
      if (extra) {
        // ผูกซ้ำ SKU เดิม = แก้เงื่อนไข/จำนวนของตัวนั้น ไม่ใช่เพิ่มอีกบรรทัด
        const rest = (c.stockLinks ?? []).filter((l) => l.stockItemId !== extra!.stockItemId);
        return { ...c, stockLinks: [...rest, extra!] };
      }
      if (linkMode) {
        if (!stockItemId) return without(c, ["stockItemId", "stockQtyPer"]); // ถอด = ลบคีย์ทิ้ง ไม่เก็บ null
        // เปลี่ยนไป SKU อื่น → อัตราเดิมไม่ตามไป (หน่วยนับอาจคนละแบบ)
        return c.stockItemId === stockItemId ? c : { ...without(c, ["stockQtyPer"]), stockItemId };
      }
      if (!c.stockItemId) {
        notLinked = true;
        return c;
      }
      return per == null ? without(c, ["stockQtyPer"]) : { ...c, stockQtyPer: per };
    });

  const opts: ProductOption[] = row.data.options ?? [];
  const oi = presetId ? -1 : findOption(opts, label, body.optionIndex);
  if (!presetId && oi < 0) return NextResponse.json({ error: "ไม่พบกลุ่มตัวเลือกนี้ในสินค้า" }, { status: 404 });

  // ── ผูกของที่ตัดเพิ่มแบบมีเงื่อนไข ─────────────────────────────────────────────
  if (linkExtra) {
    if (presetId)
      return NextResponse.json({ error: "คลังตัวเลือกกลางยังตั้งของมีเงื่อนไขไม่ได้ — ต้องตั้งที่ตัวเลือกของสินค้าเอง" }, { status: 400 });
    const sid = (linkExtra.stockItemId ?? "").trim();
    if (!sid) return NextResponse.json({ error: "ต้องเลือกวัสดุที่จะตัดเพิ่ม" }, { status: 400 });
    const host = (opts[oi].choices ?? []).find((c) => c.name === choice);
    if (!host) return NextResponse.json({ error: "ไม่พบตัวเลือกนี้ในกลุ่ม (อาจมีคนแก้ไปก่อน) — โหลดหน้าใหม่" }, { status: 404 });
    if (host.stockItemId === sid)
      return NextResponse.json({ error: "วัสดุตัวนี้เป็นลิงก์หลักของตัวเลือกอยู่แล้ว — ผูกซ้ำจะโดนตัด 2 เด้ง" }, { status: 409 });
    // ผูกกับรหัสที่ไม่มีจริง = ลิงก์ตายตั้งแต่เกิด (เคยมี 32 SKU แบบนี้)
    const stock = await listStock();
    if (!stock.items.some((i) => i.id === sid)) return NextResponse.json({ error: "ไม่พบวัสดุนี้ในคลัง" }, { status: 404 });

    const when = (linkExtra.when ?? [])
      .map((w) => ({ label: (w?.label ?? "").trim(), choices: [...new Set((w?.choices ?? []).map((c) => String(c).trim()).filter(Boolean))] }))
      .filter((w) => w.label && w.choices.length);
    if (!when.length)
      return NextResponse.json({ error: "ต้องมีเงื่อนไขอย่างน้อย 1 ข้อ — ถ้าตัดทุกครั้งอยู่แล้ว ให้ผูกแบบปกติหรือตั้งเป็นวัสดุแฝงแทน" }, { status: 400 });
    for (const w of when) {
      if (w.label === opts[oi].label)
        return NextResponse.json({ error: `เงื่อนไขต้องเป็นกลุ่มอื่น — "${w.label}" เป็นกลุ่มเดียวกับตัวหลัก` }, { status: 400 });
      const g = opts.find((o) => o.label === w.label);
      if (!g) return NextResponse.json({ error: `ไม่มีกลุ่มตัวเลือก "${w.label}" ในสินค้านี้` }, { status: 404 });
      const names = new Set((g.choices ?? []).map((c) => c.name));
      const miss = w.choices.filter((c) => !names.has(c));
      if (miss.length) return NextResponse.json({ error: `กลุ่ม "${w.label}" ไม่มีตัวเลือก: ${miss.join(", ")}` }, { status: 404 });
    }

    const n = Number(linkExtra.per ?? 1);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return NextResponse.json({ error: "จำนวนต่อชิ้นต้องมากกว่า 0" }, { status: 400 });
    extra = { stockItemId: sid, ...(n === 1 ? {} : { per: Math.round(n * 10000) / 10000 }), when };
  }

  const next = presetId
    ? { ...row.data, choices: setOn(row.data.choices ?? []) }
    : { ...row.data, options: opts.map((o, i) => (i === oi ? { ...o, choices: setOn((o.choices ?? []) as Ch[]) } : o)) };
  if (notLinked) return NextResponse.json({ error: "ต้องผูก SKU ก่อน ถึงจะตั้งอัตราใช้ได้" }, { status: 409 });

  // เปลี่ยนโครงตัวเลือก (ไม่ใช่แค่สลับรหัส SKU) → เก็บฉบับก่อนหน้าไว้ย้อนได้
  if (extra) await snapshotRevision(db, rowId, row.data, await currentActor(), "save");
  const { error } = await db.from("products").update({ data: next }).eq("id", rowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateProductsSlim();
  return NextResponse.json({ ok: true, stockQtyPer: linkMode ? undefined : per, extra: extra ?? undefined });
}

/**
 * ลบตัวเลือกหนึ่งค่าทิ้งจากกลุ่ม (ไม่ใช่แค่ถอด SKU) — ไว้เก็บกวาดค่าเก่า/ค่าซ้ำจากหน้าผูกคลังโดยไม่ต้องเปิดตัวแก้ไขสินค้า
 * body: { presetId | productId+label, choice, index }
 *   index = ลำดับในกลุ่ม (ข้อมูลเก่ามีชื่อซ้ำในกลุ่มเดียว เช่น "เคลือบพิเศษ" 2 ครั้ง — ลบด้วยชื่ออย่างเดียวจะหายทั้งคู่)
 * ลบที่ preset = หายจากทุกสินค้าที่ลิงก์คลังนั้น · เก็บ product_revisions ก่อนเขียนทับเสมอ
 * ห้ามลบค่าสุดท้ายของกลุ่ม — กลุ่มว่างจะถูก ProductEditor ตัดทิ้งเงียบตอนบันทึกครั้งถัดไป (ดู option-group-loss-guard)
 */
export async function DELETE(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const t = await readTarget(req, db);
  if (t.res) return t.res;
  const { body, rowId, row } = t;
  const { presetId, label, choice, index } = body;

  const pick = (choices: { name: string }[]) => {
    // ชี้ด้วย index ก่อน (ต้องชื่อตรงด้วย กันหน้าจอเก่าชี้ผิดตัวหลังมีคนลบไปก่อน) · ไม่มี index = ตัวแรกที่ชื่อตรง
    const at = typeof index === "number" && choices[index]?.name === choice ? index : choices.findIndex((c) => c.name === choice);
    return at;
  };
  const dropAt = (choices: { name: string }[]) => {
    const at = pick(choices);
    if (at < 0) return { err: "ไม่พบตัวเลือกนี้แล้ว (อาจมีคนลบไปก่อน) — โหลดหน้าใหม่" };
    if (choices.length <= 1) return { err: "เหลือค่าเดียวในกลุ่ม ลบไม่ได้ — ถ้าจะเลิกใช้ทั้งกลุ่ม ไปลบกลุ่มในหน้าแก้ไขสินค้าแทน" };
    return { choices: choices.filter((_, i) => i !== at) };
  };

  let next: Record<string, unknown>;
  if (presetId) {
    const r = dropAt(row.data.choices ?? []);
    if (r.err) return NextResponse.json({ error: r.err }, { status: 409 });
    next = { ...row.data, choices: r.choices };
  } else {
    const opts: ProductOption[] = row.data.options ?? [];
    const oi = findOption(opts, label, body.optionIndex);
    if (oi < 0) return NextResponse.json({ error: "ไม่พบกลุ่มตัวเลือกนี้ในสินค้า" }, { status: 404 });
    const r = dropAt(opts[oi].choices ?? []);
    if (r.err) return NextResponse.json({ error: r.err }, { status: 409 });
    next = { ...row.data, options: opts.map((o, i) => (i === oi ? { ...o, choices: r.choices } : o)) };
  }

  await snapshotRevision(db, rowId, row.data, await currentActor(), "save");
  const { error } = await db.from("products").update({ data: next }).eq("id", rowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateProductsSlim();
  return NextResponse.json({ ok: true });
}

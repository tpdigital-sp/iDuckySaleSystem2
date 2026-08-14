import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listStock } from "@/lib/server/stock";
import { resolveOptions, type OptionPreset } from "@/lib/option-presets";
import type { Product, ProductOption } from "@/lib/products";

export const runtime = "nodejs";

/**
 * ผูก "ตัวเลือกสินค้า" เข้ากับ SKU ในคลัง — งานกวาดครั้งเดียว จึงรวมไว้หน้าเดียว
 * ผูกที่ preset ได้ผลกับทุกสินค้าที่ลิงก์คลังนั้น · ผูกที่สินค้าได้ผลเฉพาะตัวนั้น
 */

/** มิติที่กินสต๊อก vs มิติกระบวนการ — ชุดเดียวกับสคริปต์ฝั่ง node (product-variants.mjs) */
const PROC_DIM = /สกรีน|พิมพ์|ตำแหน่งงาน|เทคนิค|ไดคัท|เจาะรู|ระบบพิมพ์|จำนวน|ด้าน$/;
const MAT_DIM = /เนื้อผ้า|^ผ้า|สีไหม|ไหม|ซิป|ตะขอ|โซ่|อะคริลิค|ขนาด|ประเภท|วัสดุ|กลิตเตอร์|^สี|ฐาน|หูกระเป๋า|ชนิด|ความหนา/;
export function isMaterialDim(label: string): boolean {
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

/** ตารางงาน: ทุกมิติที่กินสต๊อกของทุกสินค้า พร้อมบอกว่าตัวเลือกไหนผูก SKU แล้ว */
export async function GET() {
  const bad = await guard();
  if (bad) return bad;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  // ⚠️ ห้ามใส่ .neq("category","__presets__") ตรงนี้ — คลังตัวเลือกเก็บเป็นแถว category "__presets__"
  //    ในตารางเดียวกัน ถ้ากรองออกจะไม่เหลือ preset ให้หาเลย (แถวคลังกลางว่างเปล่า)
  const [{ data: rows }, stock] = await Promise.all([
    db.from("products").select("id,data"),
    listStock(),
  ]);
  const presets = (rows ?? [])
    .filter((r) => r.id.startsWith("__preset_"))
    .map((r) => r.data as OptionPreset)
    .filter((p) => p?.id);
  const prods = (rows ?? []).filter(
    (r) => r.data?.name && !r.id.startsWith("__") && typeof r.data?.price === "number"
  );

  // มิติที่มาจาก preset รวบไว้แถวเดียว — ผูกครั้งเดียวมีผลทุกสินค้าที่ลิงก์
  const presetRows = presets
    .filter((p) => isMaterialDim(p.label))
    .map((p) => ({
      kind: "preset" as const,
      key: `preset:${p.id}`,
      presetId: p.id,
      label: p.label,
      usedBy: prods.filter((r) => (r.data.options ?? []).some((o: ProductOption) => o.presetId === p.id)).length,
      choices: (p.choices ?? []).map((c) => ({ name: c.name, stockItemId: c.stockItemId ?? null })),
    }));

  // มิติเฉพาะสินค้า (ไม่ได้ลิงก์คลัง)
  const productRows: {
    kind: "product";
    key: string;
    productId: string;
    productName: string;
    draft: boolean;
    label: string;
    choices: { name: string; stockItemId: string | null }[];
  }[] = [];
  for (const r of prods) {
    const p = r.data as Product;
    for (const o of resolveOptions(p.options ?? [], presets)) {
      if (o.presetId || !isMaterialDim(o.label)) continue;
      productRows.push({
        kind: "product",
        key: `product:${r.id}:${o.label}`,
        productId: r.id,
        productName: p.name,
        draft: !!(p as Product & { hidden?: boolean }).hidden,
        label: o.label,
        choices: (o.choices ?? []).map((c) => ({ name: c.name, stockItemId: c.stockItemId ?? null })),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    presetRows,
    productRows,
    items: stock.items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, family: i.family, aliases: i.aliases })),
  });
}

/** ผูก/ถอดตัวเลือกหนึ่งค่า — stockItemId = null คือถอดลิงก์ */
export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const db = sb();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { presetId?: string; productId?: string; label?: string; choice?: string; stockItemId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { presetId, productId, label, choice } = body;
  const stockItemId = body.stockItemId || null;
  if (!choice || (!presetId && !(productId && label)))
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const rowId = presetId ? `__preset_${presetId}` : productId!;
  const { data: row } = await db.from("products").select("id,data").eq("id", rowId).maybeSingle();
  if (!row?.data) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const setOn = (choices: { name: string; stockItemId?: string }[]) =>
    choices.map((c) =>
      c.name !== choice
        ? c
        : stockItemId
          ? { ...c, stockItemId }
          : Object.fromEntries(Object.entries(c).filter(([k]) => k !== "stockItemId")) // ถอด = ลบคีย์ทิ้ง ไม่เก็บ null
    );

  const next = presetId
    ? { ...row.data, choices: setOn(row.data.choices ?? []) }
    : {
        ...row.data,
        options: (row.data.options ?? []).map((o: ProductOption) =>
          o.label === label ? { ...o, choices: setOn(o.choices ?? []) } : o
        ),
      };

  const { error } = await db.from("products").update({ data: next }).eq("id", rowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

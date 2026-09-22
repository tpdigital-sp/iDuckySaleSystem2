import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { listStockItems } from "@/lib/server/stock";
import { getProductsSlim } from "@/lib/server/products-slim";
import { normName, skuPage, type StockSuggest, type StockUsage } from "@/lib/stock-match";
import type { Product } from "@/lib/products";

export const runtime = "nodejs";

/**
 * ภาพรวม "SKU ตัวไหนเชื่อมกับสินค้าอะไร" สำหรับหน้าคลัง — โหลดครั้งเดียวตอนเปิดหน้า
 * (แยกจาก GET /api/admin/stock ที่รีเฟรชยอดทุก 20 วิ เพราะต้องลากตาราง products ทั้งก้อน)
 *
 *   usage[itemId]   = ขายอะไรแล้วตัดตัวนี้: ผูกที่ตัวสินค้า / ที่ตัวเลือกของสินค้า / ที่คลังตัวเลือกกลาง
 *   suggest[itemId] = SKU ที่ยังไม่เชื่อมอะไรเลย → ตัวเลือกที่ "ชื่อตรงกัน" และยังไม่ผูก (กดผูกได้จากลิ้นชัก)
 *                     มองทุกกลุ่มตัวเลือก ไม่ใช่เฉพาะมิติวัสดุแบบหน้า /admin/stock/link
 *                     (SKU กระจกจับคู่กับกลุ่ม "รูปทรง"/"แบบกระจก" ซึ่งหน้านั้นไม่โชว์)
 *   images[itemId]  = รูปที่ตั้งเอง → ภาพตัวเลือกที่ผูก → ปกสินค้าที่ผูก → ภาพของคู่ที่น่าจะใช่
 *   products        = รายชื่อสินค้าให้ตัวเลือกสินค้าในฟอร์มแก้ไข SKU (แทนการพิมพ์รหัสเอง)
 */

type Ch = {
  name: string;
  stockItemId?: string;
  stockQtyPer?: number;
  imageSrc?: string;
  stockLinks?: { stockItemId: string; per?: number; when?: { label: string; choices: string[] }[] }[];
};

export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  // Firestore (SKU) กับ Supabase (สินค้า) ไม่เกี่ยวกัน → ยิงพร้อมกัน
  const [slimRes, items] = await Promise.all([
    getProductsSlim({ fresh }).then((v) => ({ v }), (e: Error) => ({ e })),
    listStockItems(),
  ]);
  if ("e" in slimRes) return NextResponse.json({ error: slimRes.e.message }, { status: 502 });
  const slim = slimRes.v;
  const presets = slim.presets.map((r) => r.data);
  const prods = slim.products.map((r) => ({ id: r.id, p: r.data }));

  const cover = (p: Product) => (p.images ?? []).find((im) => im?.src)?.src;
  const products = prods
    .map(({ id, p }) => ({ id, name: p.name, img: cover(p), draft: !!p.hidden }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  const prodById = new Map(products.map((p) => [p.id, p]));

  const usage: Record<string, StockUsage[]> = {};
  const push = (id: string, u: StockUsage) => (usage[id] ??= []).push(u);

  // 1) ผูกที่ตัวสินค้า
  for (const it of items)
    for (const pid of it.productIds ?? []) {
      const p = prodById.get(pid);
      // อัตราต่อชุด (งานขายเป็นเซ็ต) — ไม่ตั้ง = 1 ต่อ 1
      const per = it.productQtyPer?.[pid];
      push(it.id, {
        kind: "product",
        productId: pid,
        productName: p?.name ?? `${pid} (ไม่พบสินค้านี้)`,
        img: p?.img,
        draft: p?.draft,
        ...(per && per > 1 ? { per } : {}),
        ...(p ? {} : { missing: true }),
      });
    }

  // 1b) วัสดุแฝง (ขาตั้ง/หมุด) — ตัดทุกชิ้นของสินค้า × จำนวนต่อชิ้น
  for (const it of items)
    for (const [pid, per] of Object.entries(it.bomFor ?? {})) {
      const p = prodById.get(pid);
      push(it.id, { kind: "product", productId: pid, productName: p?.name ?? `${pid} (ไม่พบสินค้านี้)`, img: p?.img, draft: p?.draft, bom: true, per, ...(p ? {} : { missing: true }) });
    }

  // 2) ผูกที่คลังตัวเลือกกลาง + เก็บตัวเลือกที่ยังว่างไว้หาคู่
  type Open = { n: string; s: StockSuggest; idNorm: string };
  const open: Open[] = [];
  for (const ps of presets) {
    const users = prods.filter(({ p }) => (p.options ?? []).some((o) => o.presetId === ps.id));
    for (const c of (ps.choices ?? []) as Ch[]) {
      if (c.stockItemId)
        push(c.stockItemId, {
          kind: "preset",
          presetId: ps.id,
          label: ps.label,
          choice: c.name,
          per: c.stockQtyPer ?? 1,
          img: c.imageSrc,
          usedBy: users.length,
          usedByNames: users.slice(0, 4).map((u) => u.p.name),
        });
      else if (users.length)
        open.push({ n: normName(c.name), idNorm: "", s: { kind: "preset", presetId: ps.id, label: ps.label, choice: c.name, img: c.imageSrc, usedBy: users.length } });
    }
  }

  // 3) ผูกที่ตัวเลือกของสินค้าเอง (กลุ่มที่ไม่ลิงก์คลัง) — เก็บลำดับกลุ่มไว้ชี้ตอนผูก/ถอด (กลุ่มชื่อซ้ำมีจริง)
  for (const { id, p } of prods) {
    const idNorm = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    (p.options ?? []).forEach((o, oi) => {
      if (o.presetId) return;
      for (const c of (o.choices ?? []) as Ch[]) {
        const img = c.imageSrc ?? cover(p);
        if (c.stockItemId)
          push(c.stockItemId, { kind: "choice", productId: id, productName: p.name, img, draft: !!p.hidden, label: o.label, optionIndex: oi, choice: c.name, per: c.stockQtyPer ?? 1 });
        else open.push({ n: normName(c.name), idNorm, s: { kind: "choice", productId: id, productName: p.name, img, label: o.label, optionIndex: oi, choice: c.name } });
        // ของชิ้นที่ต้องหยิบเพิ่มแบบมีเงื่อนไข (กรอบรูปตามขนาด เมื่อเลือกแบบมีกรอบ)
        for (const l of c.stockLinks ?? [])
          if (l.stockItemId)
            push(l.stockItemId, {
              kind: "choice",
              productId: id,
              productName: p.name,
              img,
              draft: !!p.hidden,
              label: o.label,
              optionIndex: oi,
              choice: c.name,
              per: l.per ?? 1,
              extra: true,
              cond: (l.when ?? []).map((w) => `${w.label} = ${w.choices.join(" / ")}`).join(" และ ") || undefined,
            });
      }
    });
  }

  // 4) คู่ที่น่าจะใช่ — เฉพาะ SKU ที่ยังไม่เชื่อมอะไรเลย · ชื่อ/alias ตรงกับชื่อตัวเลือก (หลัง normName)
  //    ชื่อสั้น ๆ กว้าง ๆ ("สีฟ้า", "พรีเมี่ยม") ต้องมาจากหน้าตารางราคาเดียวกับสินค้าด้วย ไม่งั้นจับผิดตัวเป็นร้อย
  const openBy = new Map<string, Open[]>();
  for (const o of open) if (o.n.length >= 2) (openBy.get(o.n) ?? openBy.set(o.n, []).get(o.n)!).push(o);
  const suggest: Record<string, StockSuggest[]> = {};
  for (const it of items) {
    if (usage[it.id]?.some((u) => !(u.kind === "product" && u.missing))) continue; // มีแต่ลิงก์ตาย = ยังต้องหาคู่ให้
    const page = skuPage(it.code);
    const seen = new Set<string>();
    const hits: { s: StockSuggest; near: boolean }[] = [];
    for (const nm of [it.name, ...(it.aliases ?? [])]) {
      const n = normName(nm);
      for (const o of openBy.get(n) ?? []) {
        const near = !!page && o.idNorm.includes(page);
        if (n.length < 8 && !near) continue;
        const k = o.s.kind === "preset" ? `p:${o.s.presetId}:${o.s.choice}` : `c:${o.s.productId}:${o.s.optionIndex}:${o.s.choice}`;
        if (!seen.has(k)) seen.add(k), hits.push({ s: o.s, near });
      }
    }
    if (hits.length) suggest[it.id] = hits.sort((a, b) => Number(b.near) - Number(a.near)).slice(0, 8).map((h) => h.s);
  }

  // 5) รูป
  const images: Record<string, string> = {};
  for (const it of items) {
    const us = usage[it.id] ?? [];
    const src =
      it.imageUrl ||
      us.find((u) => u.kind !== "product" && u.img)?.img || // ภาพตัวเลือกตรงตัวกว่าปกสินค้า
      us.find((u) => u.img)?.img ||
      suggest[it.id]?.find((s) => s.img)?.img;
    if (src) images[it.id] = src;
  }

  return NextResponse.json({ ok: true, images, usage, suggest, products });
}

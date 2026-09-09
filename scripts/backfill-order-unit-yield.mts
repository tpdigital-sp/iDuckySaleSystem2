#!/usr/bin/env node
/**
 * เติม item.unitYield ("สั่ง 1 หน่วย ได้กี่ชิ้น") ให้ออเดอร์/ใบเสนอราคาเก่าที่สร้างก่อนระบบจะแช่ค่านี้ไว้เอง
 *
 *   npx tsx scripts/backfill-order-unit-yield.mts            # ดูอย่างเดียว ไม่เขียน
 *   npx tsx scripts/backfill-order-unit-yield.mts --write    # เขียนจริง (ทั้งตาราง orders และ quotes)
 *   npx tsx scripts/backfill-order-unit-yield.mts --write --id OD-260904-8222   # ใบเดียว (เลข OD-/QT- ก็ได้)
 *
 * ใบเสนอราคาเก่าไม่มี sel (ตะกร้าส่งมาแต่ข้อความ) → กางจากข้อความสเปคด้วย itemSel ก่อนอ่านตัวเลือก
 *
 * ทำไมต้องเติม: หน้าออเดอร์/โหมดแพ็คเทียบ "จำนวนบนแบบงาน" กับ "จำนวนที่ลูกค้าสั่ง"
 * งานที่ขายเป็นเซ็ต/แผ่น (โฟโต้การ์ด 20 ใบ/เซ็ต · โปสการ์ด 8 ใบ/แผ่น A3) ถ้าไม่รู้ตัวคูณ
 * จะฟ้อง "จำนวนไม่ตรง" ทั้งที่ถูกอยู่แล้ว — ค่านี้อ่านจากสินค้าจริง (piecesPerUnit/sheetYield)
 *
 * ⚠️ ค่าที่เติมคือค่า "วันนี้" ของสินค้า — ถ้าร้านเคยแก้จำนวนต่อเซ็ตหลังลูกค้าสั่ง ตัวเลขจะเป็นของใหม่
 *    (ออเดอร์ที่สั่งหลังจากนี้ระบบแช่ค่าให้ตั้งแต่ตอนสั่ง ไม่ต้องรันสคริปต์นี้อีก)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderUnitYield } from "../src/lib/products.ts";
import { resolveOptions } from "../src/lib/option-presets.ts";
import type { Order } from "../src/lib/admin-data.ts";
import { itemSel } from "../src/lib/item-yield.ts";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const WRITE = process.argv.includes("--write");
const ONLY = process.argv[process.argv.indexOf("--id") + 1];
const onlyId = process.argv.includes("--id") ? ONLY : "";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// สินค้าทั้งร้าน + คลังตัวเลือก (กลุ่มที่ลิงก์คลังต้องคลี่ก่อน ไม่งั้นอ่าน piecesPerUnit ไม่เจอ)
const { data: rows, error: prodErr } = await sb.from("products").select("id,data");
if (prodErr) throw prodErr;
const presets = (rows ?? []).map((r: any) => r.data).filter((p: any) => p?.id && p?.choices);
const products = new Map<string, any>();
for (const r of rows ?? []) {
  const p: any = (r as any).data;
  if (!p?.id || String((r as any).id).startsWith("__")) continue;
  products.set(p.id, p.options?.some((o: any) => o.presetId) ? { ...p, options: resolveOptions(p.options, presets) } : p);
}

let scanned = 0;
let changed = 0;
const misses = new Map<string, number>();

for (const table of ["orders", "quotes"] as const) {
  const { data: docRows, error: docErr } = await sb.from(table).select("id,data");
  if (docErr) throw docErr;

  for (const row of docRows ?? []) {
    const doc = (row as any).data as Order;
    if (!doc?.items?.length) continue;
    if (onlyId && doc.id !== onlyId) continue;
    scanned++;
    let touched = false;
    const items = doc.items.map((it) => {
      if (it.unitYield || !it.productId || it.productId.includes("#") || it.productId === "special-item") return it;
      const sel = itemSel(it);
      if (!Object.keys(sel).length) return it;
      const prod = products.get(it.productId);
      if (!prod) {
        misses.set(it.productId, (misses.get(it.productId) ?? 0) + 1);
        return it;
      }
      const y = orderUnitYield(prod, sel);
      if (!y) return it;
      touched = true;
      console.log(`  ${doc.id} · ${it.name} — สั่ง ${it.qty} ${y.unit || "หน่วย"} × ${y.per} ${y.piece} = ${it.qty * y.per} ${y.piece}`);
      return { ...it, unitYield: y };
    });
    if (!touched) continue;
    changed++;
    if (WRITE) {
      const { error } = await sb.from(table).update({ data: { ...doc, items } }).eq("id", doc.id);
      if (error) console.error(`  ⛔ เขียนไม่ผ่าน ${doc.id}: ${error.message}`);
    }
  }
}

console.log(`\nใบที่ตรวจ (ออเดอร์+ใบเสนอราคา) ${scanned} ใบ · มีรายการที่เติมได้ ${changed} ใบ ${WRITE ? "(เขียนแล้ว)" : "(ยังไม่เขียน — ใส่ --write)"}`);
if (misses.size) console.log(`หาสินค้าไม่เจอ (สินค้าถูกลบ?): ${[...misses.entries()].map(([id, n]) => `${id}×${n}`).join(" · ")}`);

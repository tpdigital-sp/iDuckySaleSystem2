#!/usr/bin/env node
/**
 * เติม item.unitYield ("สั่ง 1 หน่วย ได้กี่ชิ้น") ให้ออเดอร์เก่าที่สั่งก่อนระบบจะแช่ค่านี้ไว้เอง
 *
 *   node scripts/backfill-order-unit-yield.mts            # ดูอย่างเดียว ไม่เขียน
 *   node scripts/backfill-order-unit-yield.mts --write    # เขียนจริง
 *   node scripts/backfill-order-unit-yield.mts --write --id OD-260904-8222
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

const { data: orderRows, error: ordErr } = await sb.from("orders").select("id,data");
if (ordErr) throw ordErr;

let scanned = 0;
let changed = 0;
const misses = new Map<string, number>();

for (const row of orderRows ?? []) {
  const order = (row as any).data as Order;
  if (!order?.items?.length) continue;
  if (onlyId && order.id !== onlyId) continue;
  scanned++;
  let touched = false;
  const items = order.items.map((it) => {
    if (it.unitYield || !it.productId || !it.sel) return it;
    const prod = products.get(it.productId);
    if (!prod) {
      misses.set(it.productId, (misses.get(it.productId) ?? 0) + 1);
      return it;
    }
    const y = orderUnitYield(prod, it.sel);
    if (!y) return it;
    touched = true;
    console.log(`  ${order.id} · ${it.name} — สั่ง ${it.qty} ${y.unit || "หน่วย"} × ${y.per} ${y.piece} = ${it.qty * y.per} ${y.piece}`);
    return { ...it, unitYield: y };
  });
  if (!touched) continue;
  changed++;
  if (WRITE) {
    const { error } = await sb.from("orders").update({ data: { ...order, items } }).eq("id", order.id);
    if (error) console.error(`  ⛔ เขียนไม่ผ่าน ${order.id}: ${error.message}`);
  }
}

console.log(`\nออเดอร์ที่ตรวจ ${scanned} ใบ · มีรายการที่เติมได้ ${changed} ใบ ${WRITE ? "(เขียนแล้ว)" : "(ยังไม่เขียน — ใส่ --write)"}`);
if (misses.size) console.log(`หาสินค้าไม่เจอ (สินค้าถูกลบ?): ${[...misses.entries()].map(([id, n]) => `${id}×${n}`).join(" · ")}`);

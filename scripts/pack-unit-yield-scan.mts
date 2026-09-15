#!/usr/bin/env node
/**
 * 🔎 สินค้าที่ "ขายเป็นเซ็ต/ชุด/แผ่น" แล้วตัวคูณชิ้นต่อหน่วยมาจาก choice.perUnit
 *
 *   npx tsx scripts/pack-unit-yield-scan.mts
 *
 * ดูอย่างเดียว ไม่เขียนอะไร — ใช้ตรวจว่าเลข "สั่ง N เซ็ต ได้ X ชิ้น" ที่ทุกจอโชว์ตรงกับที่ร้านตั้งไว้ไหม
 * (ดู orderUnitYield ใน src/lib/products.ts — perUnit เป็นทั้งเพดานจำนวนลายและจำนวนชิ้นต่อหน่วย)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { activeMatrix, isPackUnit, orderUnitYield, perUnitCapacity, resolveSelections } from "../src/lib/products.ts";
import { resolveOptions } from "../src/lib/option-presets.ts";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,data");
if (error) throw error;
const presets = (rows ?? []).map((r: any) => r.data).filter((p: any) => p?.id && p?.choices);

let n = 0;
for (const r of rows ?? []) {
  const p: any = (r as any).data;
  if (!p?.id || String((r as any).id).startsWith("__") || !p.options) continue;
  const prod = p.options.some((o: any) => o.presetId) ? { ...p, options: resolveOptions(p.options, presets) } : p;
  let sel: Record<string, string> = {};
  try {
    sel = resolveSelections(prod, {});
  } catch {
    continue;
  }
  const saleUnit = ((activeMatrix(prod, sel)?.unit ?? prod.pricing?.unit) ?? "").trim();
  if (!isPackUnit(saleUnit)) continue;
  const cap = perUnitCapacity(prod, sel);
  if (!cap || cap <= 1) continue;
  const y = orderUnitYield(prod, sel);
  console.log(`${p.id} · ${p.name} — 1 ${saleUnit} = ${y?.per} ${y?.piece} (perUnit ที่ตั้งไว้ ${cap})`);
  n++;
}
console.log(`\nรวม ${n} สินค้า`);

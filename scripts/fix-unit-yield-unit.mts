#!/usr/bin/env node
/**
 * 📏 ซ่อม "หน่วยที่ลูกค้าสั่ง" ที่แช่ไว้ในรายการ (item.unitYield.unit) เมื่อมันไม่ใช่หน่วยขายของเรทที่เลือกจริง
 *
 *   npx tsx scripts/fix-unit-yield-unit.mts                    # ดูอย่างเดียวทั้ง orders + quotes
 *   npx tsx scripts/fix-unit-yield-unit.mts --apply            # เขียนทุกใบที่หน่วยเพี้ยน
 *   npx tsx scripts/fix-unit-yield-unit.mts --apply --id OD-…  # เขียนเฉพาะใบที่ระบุ
 *
 * ทำไม: สติ๊กเกอร์ UV เรท "ขายแบบ ขนาด ตารางเมตร" เคยตั้ง pricing.unit เป็น "แผ่น A3" (แก้แล้วด้วย
 *   scripts/sticker-uv-sqm-unit.mjs) — ใบที่สั่งไปก่อนหน้านั้นแช่ `unit: "แผ่น A3"` ไว้ ทุกจอจึงอ่านว่า
 *   "สั่ง 1 แผ่น A3 (ขนาดตัด A6) ได้ 64 ชิ้น" ทั้งที่ลูกค้าสั่ง 1 ตร.ม. (OD-260914-7004 · 15 ก.ย. 69)
 * ⚠️ แก้เฉพาะรายการที่ "หน่วยเพี้ยน" — ตัวคูณที่ต่างเพราะร้านแก้ตารางทีหลังเป็นอีกเรื่อง ตั้งใจแช่ไว้
 *   (ดู scripts/stale-unit-yield-scan.mts) · per ของรายการที่หน่วยเพี้ยนต้องคิดใหม่ทั้งคู่ เพราะเลขเดิม
 *   นับ "ต่อแผ่น" ไม่ใช่ต่อหน่วยที่สั่ง
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

const APPLY = process.argv.includes("--apply");
const onlyId = process.argv.includes("--id") ? process.argv[process.argv.indexOf("--id") + 1] : "";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: rows, error: prodErr } = await sb.from("products").select("id,data");
if (prodErr) throw prodErr;
const presets = (rows ?? []).map((r: any) => r.data).filter((p: any) => p?.id && p?.choices);
const products = new Map<string, any>();
for (const r of rows ?? []) {
  const p: any = (r as any).data;
  if (!p?.id || String((r as any).id).startsWith("__")) continue;
  products.set(p.id, p.options?.some((o: any) => o.presetId) ? { ...p, options: resolveOptions(p.options, presets) } : p);
}

let found = 0;
let written = 0;
for (const table of ["orders", "quotes"] as const) {
  const { data: docRows, error } = await sb.from(table).select("id,data");
  if (error) throw error;
  for (const row of docRows ?? []) {
    const doc = (row as any).data as Order;
    if (!doc?.items?.length) continue;
    if (onlyId && doc.id !== onlyId) continue;
    const notes: string[] = [];
    const items = doc.items.map((it) => {
      const frozen = it.unitYield;
      if (!frozen?.unit || !it.productId || it.productId.includes("#") || it.productId === "special-item") return it;
      const prod = products.get(it.productId);
      if (!prod) return it;
      const sel = itemSel(it);
      if (!Object.keys(sel).length) return it;
      const now = orderUnitYield(prod, sel);
      // หน่วยตรงอยู่แล้ว (หรืออ่านหน่วยวันนี้ไม่ได้) = ไม่ใช่งานของสคริปต์นี้
      if (!now?.unit || now.unit === frozen.unit) return it;
      found++;
      notes.push(`${it.name} — 1 ${frozen.unit} = ${frozen.per} → 1 ${now.unit} = ${now.per} ${now.piece}`);
      console.log(
        `${doc.id} · ${it.name} (${it.productId}) — แช่ไว้ ${frozen.per} ${frozen.piece}/${frozen.unit}` +
          ` · หน่วยขายจริง ${now.per} ${now.piece}/${now.unit} → สั่ง ${it.qty} = ${it.qty * frozen.per} → ${it.qty * now.per} ${now.piece}` +
          ` · ${doc.status ?? ""}`
      );
      return APPLY ? { ...it, unitYield: now } : it;
    });
    if (notes.length && APPLY) {
      const log = [
        ...(doc.log ?? []),
        {
          at: new Date().toISOString(),
          by: "ระบบ",
          action: "แก้หน่วยที่สั่ง",
          detail: notes.join(" · ") + " (หน่วยขายของเรทที่เลือกตั้งไว้ผิด แก้ที่สินค้าแล้ว)",
        },
      ];
      const { data: back, error: wErr } = await sb.from(table).update({ data: { ...doc, items, log } }).eq("id", doc.id).select("id");
      if (wErr || !back?.length) {
        console.log(`  ⛔ เขียนไม่ผ่าน: ${wErr?.message ?? "ไม่โดนแถวไหนเลย"}`);
        process.exit(1);
      }
      written++;
      console.log(`  ✅ เขียนแล้ว ${doc.id}`);
    }
  }
}
console.log(`\nรายการที่หน่วยเพี้ยน: ${found}${APPLY ? ` · เขียนแล้ว ${written} ใบ` : " (ดูอย่างเดียว)"}`);

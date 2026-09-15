#!/usr/bin/env node
/**
 * 🔎 หาออเดอร์/ใบเสนอราคาที่ "จำนวนชิ้นต่อหน่วย" ที่แช่ไว้ตอนสั่ง (item.unitYield) ไม่ตรงกับตารางสินค้าวันนี้
 *
 *   npx tsx scripts/stale-unit-yield-scan.mts                 # ดูอย่างเดียว
 *   npx tsx scripts/stale-unit-yield-scan.mts --apply --id OD-260911-9877   # เขียนใบที่ระบุเท่านั้น
 *
 * ⚠️ ค่านี้ตั้งใจแช่ไว้ (ดู orderUnitYield) — ร้านแก้สินค้าทีหลังออเดอร์เก่าต้องคงเลขวันที่สั่ง
 *    สคริปต์นี้จึงไม่มีโหมด "เขียนทั้งตาราง" ต้องระบุ --id ทีละใบหลังดูแล้วว่าเลขใหม่ถูกจริง
 *    (เคสที่ต้องแก้ = ร้านแก้ตารางเพราะเลขเดิม "ผิด" เช่น กระดาษรองหลัง 7×7 จาก 20 → 24 ใบ/แผ่น A3)
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
if (APPLY && !onlyId) {
  console.error("⛔ --apply ต้องมาคู่กับ --id (กันเขียนทับทั้งตาราง)");
  process.exit(1);
}

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

let stale = 0;
for (const table of ["orders", "quotes"] as const) {
  const { data: docRows, error } = await sb.from(table).select("id,data");
  if (error) throw error;
  for (const row of docRows ?? []) {
    const doc = (row as any).data as Order;
    if (!doc?.items?.length) continue;
    if (onlyId && doc.id !== onlyId) continue;
    let touched = false;
    const notes: string[] = [];
    const items = doc.items.map((it) => {
      const frozen = it.unitYield;
      if (!frozen?.per || !it.productId || it.productId.includes("#") || it.productId === "special-item") return it;
      const prod = products.get(it.productId);
      if (!prod) return it;
      const sel = itemSel(it, prod);
      if (!Object.keys(sel).length) return it;
      const now = orderUnitYield(prod, sel);
      if (!now || now.per === frozen.per) return it;
      stale++;
      touched = true;
      notes.push(`${it.name} — 1 ${now.unit || "หน่วย"} = ${frozen.per} → ${now.per} ${now.piece}`);
      console.log(
        `${doc.id} · ${it.name} (${it.productId}) — แช่ไว้ ${frozen.per} ${frozen.piece}/${frozen.unit} · ตอนนี้ ${now.per} ${now.piece}/${now.unit}` +
          ` → สั่ง ${it.qty} = ${it.qty * frozen.per} → ${it.qty * now.per} ${now.piece} · ${doc.status ?? ""}`
      );
      return APPLY ? { ...it, unitYield: now } : it;
    });
    if (touched && APPLY) {
      // ลงประวัติไว้ด้วย — คนเปิดออเดอร์ทีหลังจะได้รู้ว่าเลขเปลี่ยนเพราะอะไร ไม่ใช่จู่ ๆ ก็ขยับเอง
      const log = [
        ...(doc.log ?? []),
        {
          at: new Date().toISOString(),
          by: "ระบบ",
          action: "ตั้งจำนวนต่อหน่วย",
          detail: notes.join(" · ") + " (ปรับตามตารางชิ้น/แผ่นของสินค้าวันนี้)",
        },
      ];
      const { error: wErr } = await sb.from(table).update({ data: { ...doc, items, log } }).eq("id", doc.id);
      console.log(wErr ? `  ⛔ เขียนไม่ผ่าน: ${wErr.message}` : `  ✅ เขียนแล้ว ${doc.id}`);
    }
  }
}
console.log(`\nรายการที่ตัวเลขไม่ตรงกับสินค้าวันนี้: ${stale}${APPLY ? " (เขียนเฉพาะใบที่ระบุ)" : " (ดูอย่างเดียว)"}`);

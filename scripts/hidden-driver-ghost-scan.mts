/**
 * 🔍 👻 กวาดสินค้าทุกตัวในฐาน: จำลองหย่อนลงตะกร้าทุกเรท × ทุกค่าของกลุ่มที่คุมการซ่อน (showWhen)
 * แล้วเรียก orderableSelections จริง — ดูว่ายังมี "กลุ่มที่ซ่อนอยู่" หลุดไปกับตะกร้าไหม
 *
 *   npm run scan:ghost            (ต้องมี .env.local · อ่านอย่างเดียว ไม่เขียนฐาน)
 *
 * ผลแบ่ง 3 กอง
 *   ❌ GHOST   กลุ่มซ่อนที่ไม่ใช่แกนของเรทที่เลือก แต่ยังติดไป  → บั๊ก (หลังแก้ 28 ก.ย. 69 ต้องเป็น 0)
 *   ⚠️ STUCK   กลุ่มซ่อนที่เป็นแกนของเรทที่เลือก และสลับเป็น "ไม่รับ" ไม่ได้ (ไม่มีตัวเลือกไม่รับ / ราคาต่างกัน)
 *              → ติดไปกับออเดอร์เป็นค่าตัวแรกของกลุ่ม ต้องแก้ที่ข้อมูลสินค้า (เพิ่มตัวเลือก ❌ ราคาเท่ากัน หรือย้ายกลุ่มออกจากแกน)
 *   ✅ SWAPPED กลุ่มซ่อนที่เป็นแกน สลับเป็น "ไม่รับ/ไม่ทำ" ได้ (ตั้งใจ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  orderableSelections,
  resolveSelections,
  optionActive,
  activeMatrix,
  unitPriceFor,
  RATE_LABEL,
  type Product,
  type ProductOption,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,name,price,category,data");
if (error) throw error;
const products = rows!.map((r) => ({ id: r.id, name: r.name, price: r.price, category: r.category, ...(r.data as any) }) as Product);

const isMulti = (o: ProductOption) => o.display === "multi";
const conds = (o: ProductOption) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter((c) => c?.label);

type Hit = { kind: "GHOST" | "STUCK" | "SWAPPED"; product: string; rate: string; scenario: string; group: string; value: string };
const hits: Hit[] = [];
const seen = new Set<string>();
let scenarios = 0;

for (const p of products) {
  const opts = p.options ?? [];
  if (!opts.some((o) => conds(o).length)) continue; // ไม่มีกลุ่มซ่อน = ไม่มีทางเกิด
  const rates = p.priceRates?.length ? p.priceRates : [undefined];
  // กลุ่มที่คุมการซ่อนของกลุ่มอื่น (ไม่รวมเรท — เรทวนแยก)
  const controllers = [...new Set(opts.flatMap((o) => conds(o).map((c) => c!.label)).filter((l) => l !== RATE_LABEL))];
  const base: Record<string, string> = {};
  for (const o of opts) base[o.label] = isMulti(o) ? "" : (o.choices?.[0]?.name ?? "");

  const run = (rateLabel: string | undefined, scenario: string, sel0: Record<string, string>) => {
    scenarios++;
    const view = { ...resolveSelections(p, sel0), ...(rateLabel ? { [RATE_LABEL]: rateLabel } : {}) };
    const out = orderableSelections(p, view);
    const m = activeMatrix(p, view);
    for (const o of opts) {
      if (!(o.label in out) || optionActive(o, view)) continue;
      const isDriver = !!m?.driverLabels.includes(o.label);
      const kind: Hit["kind"] = !isDriver ? "GHOST" : out[o.label] !== view[o.label] ? "SWAPPED" : "STUCK";
      const key = `${p.id}|${rateLabel}|${o.label}|${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ kind, product: `${p.id} · ${p.name}`, rate: rateLabel ?? "-", scenario, group: o.label, value: out[o.label] });
    }
    // ราคาต้องไม่ขยับหลังตัด
    const a = unitPriceFor(p, view, 1), b = unitPriceFor(p, out, 1);
    if (a !== b) {
      const key = `${p.id}|${rateLabel}|price`;
      if (!seen.has(key)) { seen.add(key); hits.push({ kind: "GHOST", product: `${p.id} · ${p.name}`, rate: rateLabel ?? "-", scenario, group: "💸 ราคาเปลี่ยนหลังตัด", value: `${a} → ${b}` }); }
    }
  };

  for (const r of rates) {
    const rl = r?.label;
    run(rl, "ค่าเริ่มต้น", base);
    for (const cl of controllers) {
      const co = opts.find((o) => o.label === cl);
      if (!co) continue;
      for (const c of co.choices ?? []) run(rl, `${cl}=${c.name}`, { ...base, [cl]: isMulti(co) ? c.name : c.name });
    }
  }
}

const by = (k: Hit["kind"]) => hits.filter((h) => h.kind === k);
const show = (title: string, list: Hit[]) => {
  console.log(`\n${title} ${list.length} จุด`);
  for (const h of list) console.log(`  ${h.product} · เรท ${h.rate} · [${h.scenario}] ${h.group}: ${h.value}`);
};
console.log(`สแกน ${products.length} สินค้า · ${scenarios} สถานการณ์`);
show("❌ GHOST (บั๊ก ต้องเป็น 0):", by("GHOST"));
show("⚠️ STUCK (ค่าค้างติดไปกับออเดอร์ · แก้ที่ข้อมูลสินค้า):", by("STUCK"));
show("✅ SWAPPED (สลับเป็นไม่รับ ตั้งใจ):", by("SWAPPED"));
if (by("GHOST").length) process.exit(1);

/**
 * 🔍 กวาดสินค้าทุกตัว: จำลอง "บรรทัดในตะกร้า" ทุกเรท × ทุกค่าของกลุ่มคุม showWhen แล้วดูว่า "รายละเอียดขาด" ไหม
 *
 *   npm run scan:cart-line     (อ่านฐานอย่างเดียว)
 *
 *   ❌ MISSING_DRIVER   แกนตารางราคาของเรทที่เลือก ไม่มีค่าติดไปกับตะกร้า → ราคาตะกร้าจะตกไปค่าเริ่มต้น (บั๊ก ต้อง 0)
 *   ❌ MISSING_VISIBLE  กลุ่มที่โชว์บนหน้าสินค้าและมีค่า แต่หายไปจากตะกร้า (บั๊ก ต้อง 0)
 *   ⚠️ CART_DROPPED     บรรทัดที่ tidySpec/รายการซ่อนของตะกร้าตัดทิ้ง ทั้งที่ค่าไม่ใช่ "ไม่…" (ดูทีละตัวว่าตั้งใจไหม)
 *   ℹ️ RATE_HIDDEN      สินค้ามีหลายเรทแต่ตะกร้าซ่อนบรรทัดเรท (ชื่อทั่วไป) — เจ้าของร้านดูว่าเรทไหนควรโชว์
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  orderableSelections, resolveSelections, optionActive, activeMatrix, publicRates, rateLineForCustomer,
  isInputOption, RATE_LABEL, type Product, type ProductOption,
} from "../src/lib/products";
import { SPEC_HIDE, specEntries, tidySpec } from "../src/components/SpecLines";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,name,price,category,data");
if (error) throw error;
const products = rows!.map((r) => ({ id: r.id, name: r.name, price: r.price, category: r.category, ...(r.data as any) }) as Product)
  .filter((p) => !(p as any).hidden);

const isMulti = (o: ProductOption) => o.display === "multi";
const conds = (o: ProductOption) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter((c) => c?.label);
const isNone = (v: string) => /^[❌✖✗]/.test(v) || (/^ไม่/.test(v) && !/^ไม่(เกิน|ต่ำกว่า|น้อยกว่า|จำกัด|เท่ากับ)/.test(v));
const CART_HIDE = [...SPEC_HIDE, "หมายเหตุ", "♻️ ใช้ไฟล์เก่า", "จำนวนลาย", "จำนวนแต่ละลาย", "จำนวนแต่ละลาย (ด้านหลัง)"];

type Kind = "MISSING_DRIVER" | "MISSING_VISIBLE" | "CART_DROPPED" | "RATE_HIDDEN";
const hits: { kind: Kind; text: string }[] = [];
const seen = new Set<string>();
const add = (kind: Kind, key: string, text: string) => { if (seen.has(kind + key)) return; seen.add(kind + key); hits.push({ kind, text }); };
let scenarios = 0;

for (const p of products) {
  const opts = p.options ?? [];
  if (!p.options) (p as any).options = [];
  const rates = p.priceRates?.length ? publicRates(p) : [undefined];
  const controllers = [...new Set(opts.flatMap((o) => conds(o).map((c) => c!.label)).filter((l) => l !== RATE_LABEL))];
  const base: Record<string, string> = {};
  for (const o of opts) base[o.label] = isMulti(o) || isInputOption(o) ? "" : (o.choices?.[0]?.name ?? "");
  const pname = `${p.id} · ${p.name}`;

  const run = (rateLabel: string | undefined, scenario: string, sel0: Record<string, string>) => {
    scenarios++;
    const view = { ...resolveSelections(p, sel0), ...(rateLabel ? { [RATE_LABEL]: rateLabel } : {}) };
    const out = orderableSelections(p, view);
    const m = activeMatrix(p, view);
    for (const l of m?.driverLabels ?? []) {
      if (!opts.some((o) => o.label === l)) continue;
      if (!out[l]) add("MISSING_DRIVER", `${p.id}|${rateLabel}|${l}`, `${pname} · เรท ${rateLabel ?? "-"} · [${scenario}] แกน "${l}" ไม่มีค่า`);
    }
    // บรรทัดที่ตะกร้าวาดจริง
    const hide = [...CART_HIDE, ...(rateLineForCustomer(p, out) ? [] : [RATE_LABEL])];
    const shown = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== ""));
    const lines = tidySpec(specEntries(shown, undefined, hide));
    const lineKeys = new Set(lines.map(([k]) => k));
    for (const o of opts) {
      if (!optionActive(o, view)) continue;
      const v = view[o.label];
      if (!v) continue; // ช่องกรอก/ติ๊กหลายอย่างที่ลูกค้ายังไม่ได้ใส่
      if (!out[o.label]) { add("MISSING_VISIBLE", `${p.id}|${rateLabel}|${o.label}`, `${pname} · เรท ${rateLabel ?? "-"} · [${scenario}] "${o.label}: ${v}" หายจากตะกร้า`); continue; }
      if (!lineKeys.has(o.label) && !isNone(v)) {
        // บรรทัดถูกยุบเข้าบรรทัดอื่น (ขนาดกำหนดเอง กว้าง/สูง · เฉดสี) = มีค่านั้นโผล่ในบรรทัดไหนสักบรรทัด → ไม่นับ
        const merged = lines.some(([, lv]) => lv.includes(v));
        if (!merged) add("CART_DROPPED", `${p.id}|${o.label}`, `${pname} · เรท ${rateLabel ?? "-"} · [${scenario}] "${o.label}: ${v}" ไม่ขึ้นบรรทัดในตะกร้า`);
      }
    }
    if (rateLabel && publicRates(p).length >= 2 && !rateLineForCustomer(p, out)) {
      add("RATE_HIDDEN", p.id, `${pname} · เรท: ${publicRates(p).map((r) => r.label).join(" / ")}`);
    }
  };
  for (const r of rates) {
    const rl = r?.label;
    run(rl, "ค่าเริ่มต้น", base);
    for (const cl of controllers) {
      const co = opts.find((o) => o.label === cl);
      if (!co) continue;
      for (const c of co.choices ?? []) run(rl, `${cl}=${c.name}`, { ...base, [cl]: c.name });
    }
  }
}

const by = (k: Kind) => hits.filter((h) => h.kind === k);
const show = (title: string, list: { text: string }[]) => { console.log(`\n${title} ${list.length} จุด`); for (const h of list) console.log("  " + h.text); };
console.log(`สแกน ${products.length} สินค้า (ที่เผยแพร่) · ${scenarios} สถานการณ์`);
show("❌ MISSING_DRIVER — แกนราคาของเรทที่เลือกไม่มีค่าในตะกร้า (ต้อง 0):", by("MISSING_DRIVER"));
show("❌ MISSING_VISIBLE — กลุ่มที่โชว์บนหน้าสินค้าแต่หายจากตะกร้า (ต้อง 0):", by("MISSING_VISIBLE"));
show("⚠️ CART_DROPPED — ค่าที่เลือกไม่ขึ้นเป็นบรรทัดในตะกร้า (ดูว่าตั้งใจไหม):", by("CART_DROPPED"));
show("ℹ️ RATE_HIDDEN — หลายเรทแต่ตะกร้าซ่อนบรรทัดเรท (ชื่อทั่วไป):", by("RATE_HIDDEN"));
if (by("MISSING_DRIVER").length || by("MISSING_VISIBLE").length) process.exit(1);

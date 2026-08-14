#!/usr/bin/env node
/**
 * แกะตัวเลือกสินค้าที่ "เผยแพร่แล้ว" ออกมาดู ว่าแต่ละตัวมีสี/ไซส์/วัสดุ/รุ่นอะไรบ้าง
 * ใช้ตัดสินใจว่าจะกาง SKU ต่อสินค้ายังไง — อ่านอย่างเดียว ไม่แก้อะไร
 *
 *   node scripts/product-options-survey.mjs              # สรุปภาพรวม
 *   node scripts/product-options-survey.mjs <คำค้น>      # เจาะดูสินค้าที่ชื่อตรงคำค้น
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from("products").select("id,data").neq("category", "__presets__");
if (error) throw error;

// เผยแพร่แล้ว = ไม่ได้ติดธง hidden
const live = data.filter((r) => r.data && !r.data.hidden);
const draft = data.length - live.length;

const q = process.argv[2];
if (q) {
  const needle = q.toLowerCase();
  const hits = live.filter(
    (r) => (r.data.name || "").toLowerCase().includes(needle) || (r.data.category || "").toLowerCase().includes(needle)
  );
  console.log(`พบ ${hits.length} สินค้าที่ชื่อ/หมวดมี "${q}"\n`);
  for (const r of hits) {
    console.log(`━━ ${r.data.name}  [${r.id}]  หมวด ${r.data.category} ━━`);
    for (const o of r.data.options ?? []) {
      const choices = (o.choices ?? []).map((c) => c.name + (c.extra ? `(+${c.extra})` : "")).join(" · ");
      console.log(`   ${o.label}${o.presetId ? " ⇢คลังกลาง" : ""}: ${choices || "—"}`);
    }
    console.log();
  }
  process.exit(0);
}

// ── ภาพรวม ──
console.log(`สินค้าทั้งหมด ${data.length} · เผยแพร่แล้ว ${live.length} · ฉบับร่าง ${draft}\n`);

const byCat = new Map();
for (const r of live) byCat.set(r.data.category, (byCat.get(r.data.category) || 0) + 1);
console.log("── หมวด ──");
for (const [c, n] of [...byCat].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} ${c}`);

// กลุ่มตัวเลือกที่ใช้บ่อย — บอกว่ามิติ SKU จริง ๆ คืออะไร
const labels = new Map(); // label -> { products:Set, choices:Map<choice,count> }
for (const r of live) {
  for (const o of r.data.options ?? []) {
    const L = (o.label || "").trim();
    if (!L) continue;
    if (!labels.has(L)) labels.set(L, { products: new Set(), choices: new Map() });
    const e = labels.get(L);
    e.products.add(r.id);
    for (const c of o.choices ?? []) e.choices.set(c.name, (e.choices.get(c.name) || 0) + 1);
  }
}
console.log(`\n── กลุ่มตัวเลือกที่ใช้บ่อยที่สุด (จาก ${labels.size} กลุ่ม) ──`);
for (const [L, e] of [...labels].sort((a, b) => b[1].products.size - a[1].products.size).slice(0, 25)) {
  const top = [...e.choices.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
  console.log(`  ${String(e.products.size).padStart(3)} สินค้า · ${L}`);
  console.log(`      ${top.join(" · ").slice(0, 110)}${e.choices.size > 8 ? ` … (${e.choices.size} ค่า)` : ""}`);
}

// สินค้าที่ตัวเลือกกางออกมาเป็นหลาย SKU มากที่สุด
console.log(`\n── สินค้าที่กางเป็น SKU ได้เยอะสุด (คูณทุกกลุ่มตัวเลือก) ──`);
const combos = live
  .map((r) => ({
    name: r.data.name,
    id: r.id,
    n: (r.data.options ?? []).reduce((m, o) => m * Math.max(1, (o.choices ?? []).length), 1),
    dims: (r.data.options ?? []).map((o) => `${o.label}×${(o.choices ?? []).length}`),
  }))
  .sort((a, b) => b.n - a.n);
for (const c of combos.slice(0, 12)) {
  console.log(`  ${String(c.n).padStart(6)} = ${c.dims.join(" × ").slice(0, 80)}`);
  console.log(`         ${c.name.slice(0, 70)}`);
}
const noOpt = live.filter((r) => !(r.data.options ?? []).length).length;
console.log(`\n  สินค้าที่ไม่มีตัวเลือกเลย: ${noOpt} ตัว`);
process.exit(0);

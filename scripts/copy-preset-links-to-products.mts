/**
 * 🔗 คัดลอก "ลิงก์สต๊อก" จากคลังตัวเลือกกลางไปยังสินค้าที่มี "กลุ่มของตัวเอง" ชื่อตัวเลือกชุดเดียวกัน (เจ้าของร้าน 1 ต.ค. 69:
 * สินค้ากลุ่ม B 6 ตัวมีกลุ่ม "ตะขอ" ของตัวเอง ราคา/ชื่อตั้งไว้เองไม่เท่าคลัง แต่ต้องตัดสต๊อกตะขอชุดเดียวกัน)
 *   npx tsx scripts/copy-preset-links-to-products.mts <presetId> <productId…> [--apply]
 * กติกา: จับคู่ตัวเลือกด้วยชื่อตรง → ไม่ตรงใช้รหัสนำหน้า (D/G/AA) · ลิงก์หลัก = stockItemId · ลิงก์มีเงื่อนไข {สี: [b]} → หา "กลุ่มสี" ของสินค้านั้นเอง
 * ที่แสดงเมื่อเลือกตะขอตัวนี้และมีค่า b (ชื่อกลุ่มต่างได้ เช่น "สีตะขอ" แทน "สีตะขอ · โลหะ") · ไม่ทับลิงก์เดิม · ไม่แตะชื่อ/ราคา/กฎ
 * ⚠️ เป็นสำเนา — แยกสต๊อกใหม่ที่คลังกลางภายหลัง ต้องรันสคริปต์นี้ซ้ำ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "../src/lib/option-presets";
import type { Product, ProductOption, ProductOptionChoice } from "../src/lib/products";

const [presetId, ...rest] = process.argv.slice(2);
const APPLY = rest.includes("--apply");
const productIds = rest.filter((x) => !x.startsWith("--"));
if (!presetId || !productIds.length) throw new Error("ใส่ presetId และ productId อย่างน้อย 1 ตัว");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: prRow } = await sb.from("products").select("data").eq("id", `__preset_${presetId}`).maybeSingle();
const preset = prRow?.data as OptionPreset | undefined;
if (!preset) throw new Error("ไม่พบคลัง " + presetId);
const { data: presetRows } = await sb.from("products").select("data").eq("category", "__presets__");
const presets = (presetRows ?? []).map((r) => r.data as OptionPreset);
const code = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const findPreset = (name: string) => preset.choices.find((c) => c.name === name) ?? preset.choices.find((c) => code(c.name) === code(name));
const { data: prods } = await sb.from("products").select("id,data").in("id", productIds);
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/copy-links-backup`;
mkdirSync(backupDir, { recursive: true });
type Link = NonNullable<ProductOptionChoice["stockLinks"]>[number];

for (const row of prods ?? []) {
  const p = row.data as Product;
  const opts = p.options ?? [];
  // กลุ่มตะขอของตัวเอง = กลุ่มที่ไม่ลิงก์คลัง และชื่อค่าตรงคลัง ≥ 2
  const gi = opts.findIndex((o) => !o.presetId && (o.choices ?? []).filter((c) => !!findPreset(c.name)).length >= 2);
  if (gi < 0) {
    console.log(`! ${row.id}: ไม่พบกลุ่มของตัวเองที่ตรงคลัง — ข้าม`);
    continue;
  }
  const g = opts[gi];
  /** กลุ่มสีของสินค้านี้ที่โชว์เมื่อเลือกตะขอ hookName และมีค่า b — คืน label ของกลุ่มนั้น (ชื่อค่าในกลุ่มลิงก์คลังอ่านจากคลังสด) */
  const colorGroupFor = (hookName: string, b: string): string | undefined => {
    for (const o of opts) {
      const conds = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter((c): c is { label: string; choices: string[] } => !!c?.label);
      if (!conds.some((c) => c.label === g.label && c.choices.includes(hookName))) continue;
      const live = o.presetId ? presets.find((ps) => ps.id === o.presetId) : undefined;
      const choices = (live?.choices ?? o.choices ?? []) as ProductOptionChoice[];
      if (choices.some((c) => c.name === b)) return live?.label ?? o.label;
    }
    return undefined;
  };
  let main = 0, cond = 0, skip = 0;
  const miss: string[] = [];
  const choices = (g.choices ?? []).map((c) => {
    const t = findPreset(c.name);
    if (!t) return c;
    const n: ProductOptionChoice = { ...c };
    if (t.stockItemId) {
      if (!n.stockItemId) { n.stockItemId = t.stockItemId; main++; }
      else skip++;
    }
    const links: Link[] = [...(n.stockLinks ?? [])];
    for (const l of t.stockLinks ?? []) {
      const w = (l.when ?? [])[0];
      const b = w?.choices?.[0];
      if (!w || !b) continue;
      const label = colorGroupFor(c.name, b);
      if (!label) { miss.push(`${code(c.name)} × ${b}`); continue; }
      const when = [{ label, choices: [b] }];
      if (links.some((x) => JSON.stringify(x.when ?? []) === JSON.stringify(when))) { skip++; continue; }
      links.push({ stockItemId: l.stockItemId, when });
      cond++;
    }
    if (links.length) n.stockLinks = links;
    return n;
  });
  console.log(`## ${row.id} (${p.name}) กลุ่ม “${g.label}”: ผูกหลัก ${main} · ตามสี ${cond} · มีอยู่แล้ว ${skip}${miss.length ? ` · ⚠️ หากลุ่มสีไม่เจอ ${miss.length}: ${miss.slice(0, 6).join(", ")}${miss.length > 6 ? " …" : ""}` : ""}`);
  if (!main && !cond) continue;
  if (APPLY) {
    writeFileSync(`${backupDir}/${row.id}.json`, JSON.stringify(p));
    const options: ProductOption[] = opts.map((o, i) => (i === gi ? { ...o, choices } : o));
    const { error } = await sb.from("products").update({ data: { ...p, options, savedAt: new Date().toISOString() } }).eq("id", row.id);
    if (error) throw new Error(`${row.id}: ${error.message}`);
    console.log("   ✓ เขียนแล้ว");
  }
}
console.log(APPLY ? `เสร็จ — สำรองที่ ${backupDir}` : "ยังไม่เขียน — ใส่ --apply");
process.exit(0);

/**
 * 🪝 เติม "กลุ่มสีตะขอ" ที่ขาดให้สินค้าที่ใช้ชุดตะขอ โดยใช้สินค้าต้นแบบ (พวงกุญแจอะคริลิค keyring-copy-copy) เป็นแม่แบบว่า
 * ตะขอตัวไหนมีกลุ่มสีอะไร (เจ้าของร้าน 1 ต.ค. 69: "ตะขอต้องใช้กับสินค้าจำนวนเท่ากันทุกรายการ" — D = 9, S = 10 เพราะจุกใส/กล่องดนตรีไม่มีกลุ่มสี)
 *   npx tsx scripts/hook-color-groups-fill.mts <productId…> [--apply]
 * ต่อสินค้า: หากลุ่มตะขอ (คลังหรือของตัวเอง) → ไล่กลุ่มสีของต้นแบบที่ showWhen ชี้ไปตะขอ → map ชื่อตะขอด้วยรหัสนำหน้า →
 *   ถ้าสินค้ายังไม่มีกลุ่มที่ (ก) แสดงเมื่อเลือกตะขอพวกนั้น และ (ข) มีค่าสีตรงกัน ≥ 1 → เพิ่มกลุ่ม
 *   · กลุ่มสีของสินค้าที่มีอยู่แต่ค่าไม่ครบ (กล่องดนตรี C ขาด 5 สีเงา) → เติมค่าที่ขาดต่อท้าย
 *   · ⚠️ ราคา: ถ้าตัวเลือกตะขอของสินค้านั้นคิดราคาเองอยู่แล้ว (extra > 0 ที่ตะขอมีสี) กลุ่มสีใหม่เป็น "กลุ่มของตัวเอง" ค่า extra 0 (กันคิดซ้ำ)
 *     ไม่งั้นลิงก์คลังสี (ราคาตามคลัง) เหมือนต้นแบบ
 * หลังรันให้คัดลอกลิงก์สต๊อกด้วย scripts/copy-preset-links-to-products.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "../src/lib/option-presets";
import type { Product, ProductOption, ProductOptionChoice } from "../src/lib/products";

const [...args] = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ids = args.filter((x) => !x.startsWith("--"));
if (!ids.length) throw new Error("ใส่ productId อย่างน้อย 1 ตัว");
const TEMPLATE = "keyring-copy-copy";
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
const { data: presetRows } = await sb.from("products").select("data").eq("category", "__presets__");
const presets = (presetRows ?? []).map((r) => r.data as OptionPreset);
const P3 = presets.find((p) => p.id === "preset-3")!;
const code = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const { data: tplRow } = await sb.from("products").select("data").eq("id", TEMPLATE).maybeSingle();
const tpl = tplRow!.data as Product;
const tplHook = tpl.options!.find((o) => o.presetId === "preset-3")!;
/** กลุ่มสีของต้นแบบ: label(สด) · ค่า(สด) · ตะขอที่ชี้ · presetId */
const tplColors = tpl
  .options!.filter((o) => o !== tplHook && [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].some((c) => c?.label === tplHook.label))
  .map((o) => {
    const live = o.presetId ? presets.find((p) => p.id === o.presetId) : undefined;
    const cond = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].find((c) => c?.label === tplHook.label)!;
    return { label: live?.label ?? o.label, choices: (live?.choices ?? o.choices) as ProductOptionChoice[], hooks: cond.choices.map(code), presetId: o.presetId, cfg: o };
  });
const { data: prods } = await sb.from("products").select("id,data").in("id", ids);
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/hook-color-fill-backup`;
mkdirSync(backupDir, { recursive: true });

for (const r of prods ?? []) {
  const p = r.data as Product;
  let opts = [...(p.options ?? [])];
  const hi = opts.findIndex((o) => o.presetId === "preset-3" || (!o.presetId && (o.choices ?? []).filter((c) => P3.choices.some((x) => x.name === c.name || code(x.name) === code(c.name))).length >= 2));
  if (hi < 0) {
    console.log(`! ${r.id}: ไม่พบกลุ่มตะขอ — ข้าม`);
    continue;
  }
  const hook = opts[hi];
  const hookChoices = (hook.presetId ? P3.choices : hook.choices) as ProductOptionChoice[];
  const hookName = (cd: string) => hookChoices.find((c) => code(c.name) === cd)?.name;
  // ตะขอมีสีคิดราคาที่ตัวตะขออยู่แล้วไหม (G/H/I/S ฯลฯ extra > 0) → กลุ่มสีต้องไม่คิดเพิ่ม
  const pricedAtHook = hookChoices.some((c) => ["G", "H", "I", "S", "T", "U", "W"].includes(code(c.name)) && (c.extra ?? 0) > 0);
  const accept = opts.find((o) => /รับตะขอ/.test(o.label) && (o.choices ?? []).some((c) => /รับตะขอ/.test(c.name) && !/ไม่/.test(c.name)));
  const acceptChoice = accept?.choices.find((c) => /รับตะขอ/.test(c.name) && !/ไม่/.test(c.name))?.name;
  const condsOf = (o: ProductOption) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].filter((c): c is { label: string; choices: string[] } => !!c?.label);
  const notes: string[] = [];
  for (const tc of tplColors) {
    const hooks = tc.hooks.map(hookName).filter((x): x is string => !!x);
    if (!hooks.length) continue;
    const norm = (s: string) => s.trim().replace(/^สี\s*/, "");
    const names = new Set(tc.choices.map((c) => norm(c.name)));
    // มีกลุ่มที่แสดงเมื่อเลือกตะขอพวกนี้และมีค่าสีตรงกัน (ตัดคำ "สี" นำหน้า — กล่องดนตรีใช้ "เงิน") ไหม
    const existing = opts.find((o) => condsOf(o).some((c) => c.label === hook.label && c.choices.some((h) => hooks.includes(h))) && ((o.presetId ? presets.find((ps) => ps.id === o.presetId)?.choices : o.choices) ?? []).some((c) => names.has(norm(c.name))));
    if (existing) {
      if (existing.presetId) continue; // ลิงก์คลังอยู่แล้ว ค่าครบตามคลัง
      const have = new Set(existing.choices.map((c) => norm(c.name)));
      // กลุ่มสีรวม (กล่องดนตรี "สีตะขอ" เงิน/ทอง/โรสโกลด์/รุ้ง ใช้กับหลายตะขอ + กฎจำกัดสี) ไม่เติมค่า — เติมเฉพาะกลุ่มที่เป็นชุดเดียวกับต้นแบบ (รหัสนำหน้าเหมือนกัน เช่น C)
      const sameSet = tc.choices.some((c) => /^[A-Z]+\d/.test(c.name));
      const missing = sameSet ? tc.choices.filter((c) => !have.has(norm(c.name))) : [];
      if (!missing.length) continue;
      // เติมค่าที่ขาด (สีเงาของ C) — ราคา: เงาแพงกว่าปกติ +1 ตามคลัง (3→4) เมื่อสินค้าคิดราคาที่ตะขอ
      const base = existing.choices[0]?.extra ?? 0;
      const add = missing.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}), ...(pricedAtHook ? (c.extra && c.extra > (tc.choices[0]?.extra ?? 0) ? { extra: base + (c.extra - (tc.choices[0]?.extra ?? 0)) } : base ? { extra: base } : {}) : c.extra ? { extra: c.extra } : {}) }));
      opts = opts.map((o) => (o === existing ? { ...o, choices: [...o.choices, ...add] } : o));
      notes.push(`เติม ${missing.length} ค่าใน “${existing.label}” (${missing.map((c) => c.name).join(", ")})`);
      continue;
    }
    const tplH = opts.find((o) => o.presetId === "hook-color-h") ?? opts.find((o) => /^สีตะขอ H$/.test(o.label));
    const baseCfg = tplH ? (({ choices: _c, presetId: _p, label: _l, showWhen: _s, showWhenAlso: _a, showWhenAll: _b, showWhenAny: _d, ...rest }) => rest)(tplH) : { display: "dropdown" as const, ...(hook.section ? { section: hook.section } : {}) };
    const alsoFromH = tplH ? { ...(tplH.showWhenAlso ? { showWhenAlso: tplH.showWhenAlso } : {}), ...(tplH.showWhenAll?.length ? { showWhenAll: tplH.showWhenAll } : {}) } : accept && acceptChoice ? { showWhenAlso: { label: accept.label, choices: [acceptChoice] } } : {};
    const useOwn = pricedAtHook || !tc.presetId;
    const group: ProductOption = {
      ...baseCfg,
      label: tc.label,
      ...(useOwn ? {} : { presetId: tc.presetId }),
      showWhen: { label: hook.label, choices: hooks },
      ...alsoFromH,
      choices: tc.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}), ...(!useOwn || !pricedAtHook ? (c.extra ? { extra: c.extra } : {}) : {}) })),
    };
    let at = -1;
    opts.forEach((o, i) => {
      if (/^สีตะขอ/.test(o.label)) at = i;
    });
    if (at < 0) at = hi;
    opts = [...opts.slice(0, at + 1), group, ...opts.slice(at + 1)];
    notes.push(`เพิ่ม “${tc.label}” (${tc.choices.length} สี · ${useOwn ? "กลุ่มของตัวเอง ราคา 0" : "ลิงก์คลัง"} · แสดงเมื่อ ${hook.label} = ${hooks.map(code).join("/")})`);
  }
  if (!notes.length) {
    console.log(`= ${r.id} (${p.name}): ครบแล้ว`);
    continue;
  }
  console.log(`→ ${r.id} (${p.name}) ${pricedAtHook ? "[ราคาอยู่ที่ตะขอ]" : "[ราคาอยู่ที่สี]"}:\n   ${notes.join("\n   ")}`);
  if (APPLY) {
    writeFileSync(`${backupDir}/${r.id}.json`, JSON.stringify(p));
    const { error } = await sb.from("products").update({ data: { ...p, options: opts, savedAt: new Date().toISOString() } }).eq("id", r.id);
    if (error) throw new Error(`${r.id}: ${error.message}`);
    console.log("   ✓ เขียนแล้ว");
  }
}
console.log(APPLY ? `เสร็จ — สำรองที่ ${backupDir}` : "ยังไม่เขียน — ใส่ --apply");
process.exit(0);

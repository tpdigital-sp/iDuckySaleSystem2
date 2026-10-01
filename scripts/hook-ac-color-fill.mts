/**
 * 🪝 เติมกลุ่ม "สีตะขอ AC" ให้สินค้าที่มีตะขอ AC แต่ยังไม่มีกลุ่มสี (เจ้าของร้านขอ 1 ต.ค. 69 — สี AC ใช้กับ 6 สินค้า ตะขออื่น 10–11)
 *   npx tsx scripts/hook-ac-color-fill.mts [--apply]
 * กติกาต่อสินค้า: มีตัวเลือก AC ในกลุ่มตะขอ (คลังกลางหรือกลุ่มของตัวเอง) และยังไม่มีกลุ่มที่ลิงก์ hook-color-ac
 *   · ลอกการตั้งค่าจากกลุ่ม "สีตะขอ H" ของสินค้านั้น (display/section/showWhenAlso/showWhenAll/extraFromQty) ถ้ามี
 *   · ไม่มีกลุ่มสีเลย (พวงกุญแจจุกใส) → dropdown + showWhen ตะขอของสินค้า = AC + showWhenAlso "รับตะขอไหม = รับตะขอ" ถ้ามีกลุ่มนั้น
 *   · ราคาสีไม่คิดเพิ่ม (คลัง AC extra 0 — ราคาอยู่ที่ตัวเลือกตะขอ AC +5 อยู่แล้ว)
 * หลังรันให้คัดลอกลิงก์สต๊อกด้วย scripts/copy-preset-links-to-products.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "../src/lib/option-presets";
import type { Product, ProductOption } from "../src/lib/products";

const APPLY = process.argv.includes("--apply");
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
const AC_ID = "hook-color-ac";
const { data: acRow } = await sb.from("products").select("data").eq("id", `__preset_${AC_ID}`).maybeSingle();
const AC = acRow?.data as OptionPreset | undefined;
if (!AC) throw new Error("ไม่พบคลัง สีตะขอ AC");
const { data: p3Row } = await sb.from("products").select("data").eq("id", "__preset_preset-3").maybeSingle();
const P3 = p3Row!.data as OptionPreset;
const code = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const { data: prods } = await sb.from("products").select("id,data").neq("category", "__presets__");
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/hook-ac-fill-backup`;
mkdirSync(backupDir, { recursive: true });
let n = 0;
for (const r of prods ?? []) {
  const p = r.data as Product;
  const opts = p.options ?? [];
  // กลุ่มตะขอ: ลิงก์คลัง preset-3 หรือกลุ่มของตัวเองที่ชื่อค่าตรงคลัง ≥ 2
  const hi = opts.findIndex((o) => o.presetId === "preset-3" || (!o.presetId && (o.choices ?? []).filter((c) => P3.choices.some((x) => x.name === c.name || code(x.name) === code(c.name))).length >= 2));
  if (hi < 0) continue;
  const hook = opts[hi];
  const hookChoices = hook.presetId ? P3.choices : hook.choices;
  const acName = hookChoices.find((c) => code(c.name) === "AC")?.name;
  if (!acName) continue;
  // มีอยู่แล้ว (ลิงก์คลัง หรือกลุ่มของตัวเองชื่อเดียวกัน เช่น กล่องดนตรี) → ไม่เพิ่มซ้ำ
  if (opts.some((o) => o.presetId === AC_ID || o.label === AC.label)) continue;
  const tpl = opts.find((o) => o.presetId === "hook-color-h") ?? opts.find((o) => /^สีตะขอ H$/.test(o.label));
  let group: ProductOption;
  if (tpl) {
    const { choices: _c, presetId: _p, label: _l, showWhen: _s, ...cfg } = tpl;
    group = { ...cfg, label: AC.label, presetId: AC_ID, showWhen: { label: tpl.showWhen?.label ?? hook.label, choices: [acName] }, choices: AC.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })) };
  } else {
    const accept = opts.find((o) => /รับตะขอ/.test(o.label) && (o.choices ?? []).some((c) => /รับตะขอ/.test(c.name) && !/ไม่/.test(c.name)));
    group = {
      label: AC.label,
      presetId: AC_ID,
      display: "dropdown",
      showWhen: { label: hook.label, choices: [acName] },
      ...(accept ? { showWhenAlso: { label: accept.label, choices: [accept.choices.find((c) => /รับตะขอ/.test(c.name) && !/ไม่/.test(c.name))!.name] } } : {}),
      ...(hook.section ? { section: hook.section } : {}),
      choices: AC.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
    };
  }
  let at = -1;
  opts.forEach((o, i) => {
    if (/^สีตะขอ/.test(o.label)) at = i;
  });
  if (at < 0) at = hi;
  const options = [...opts.slice(0, at + 1), group, ...opts.slice(at + 1)];
  console.log(`→ ${r.id} (${p.name}): เพิ่ม “${AC.label}” หลัง “${opts[at].label}” · showWhen ${group.showWhen!.label} = ${acName}${group.showWhenAlso ? ` และ ${group.showWhenAlso.label} = ${group.showWhenAlso.choices[0]}` : ""}${tpl ? " (ลอกจากสีตะขอ H)" : " (ตั้งค่าใหม่)"}`);
  n++;
  if (APPLY) {
    writeFileSync(`${backupDir}/${r.id}.json`, JSON.stringify(p));
    const { error } = await sb.from("products").update({ data: { ...p, options, savedAt: new Date().toISOString() } }).eq("id", r.id);
    if (error) throw new Error(`${r.id}: ${error.message}`);
  }
}
console.log(APPLY ? `เสร็จ — เพิ่มให้ ${n} สินค้า (สำรองที่ ${backupDir})` : `แผน: ${n} สินค้า — ใส่ --apply`);
process.exit(0);

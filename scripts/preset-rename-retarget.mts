/**
 * 🔗 ซ่อมสินค้าที่อ้างชื่อตัวเลือกเก่าของคลังตัวเลือกกลาง — หลังมีคนเปลี่ยนชื่อที่ /admin/options ก่อนที่ API จะลากให้ (1 ต.ค. 69)
 *   npx tsx scripts/preset-rename-retarget.mts <presetId>            # ดูแผน (ไม่เขียน)
 *   npx tsx scripts/preset-rename-retarget.mts <presetId> --apply    # เขียนจริง (สำรอง data เดิมเป็น JSON ไว้ที่ scratch ก่อน)
 * คู่ชื่อเก่า→ใหม่หาจาก "สำเนา choices ในสินค้า" เทียบกับคลังปัจจุบัน (presetRenames) ต่อสินค้า
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { presetRenames, renamePresetChoiceInProduct } from "../src/lib/option-rename";
import type { Product } from "../src/lib/products";
import type { OptionPreset } from "../src/lib/option-presets";

const presetId = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!presetId) throw new Error("ใส่ presetId เช่น preset-3");
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
const { data: pr } = await sb.from("products").select("data").eq("id", `__preset_${presetId}`).maybeSingle();
const preset = pr?.data as OptionPreset | undefined;
if (!preset) throw new Error("ไม่พบคลัง " + presetId);
const { data: prods } = await sb.from("products").select("id,data").neq("category", "__presets__");
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/preset-rename-backup`;
mkdirSync(backupDir, { recursive: true });
let changed = 0;
for (const r of prods ?? []) {
  const p0 = r.data as Product;
  const snaps = (p0.options ?? []).filter((o) => o.presetId === presetId);
  if (!snaps.length) continue;
  const pairs = presetRenames(snaps[0].choices ?? [], preset.choices ?? []);
  if (!pairs.length) continue;
  let p = p0;
  for (const [a, b] of pairs) p = renamePresetChoiceInProduct(p, presetId, a, b);
  const before = JSON.stringify(p0);
  const after = JSON.stringify(p);
  const stillOld = pairs.filter(([a]) => after.includes(`"${a}"`)).map(([a]) => a);
  console.log(`## ${r.id} (${p0.name}) — ${pairs.length} คู่: ${pairs.map(([a, b]) => `${a} → ${b}`).join(" · ")}${stillOld.length ? ` · ⚠️ ยังเหลือชื่อเก่า: ${stillOld.join(", ")}` : ""}`);
  if (before === after) continue;
  changed++;
  if (APPLY) {
    writeFileSync(`${backupDir}/${r.id}.json`, before);
    const { error } = await sb.from("products").update({ data: { ...p, savedAt: new Date().toISOString() } }).eq("id", r.id);
    if (error) throw new Error(`${r.id}: ${error.message}`);
    console.log("   ✓ เขียนแล้ว (สำรองที่ " + backupDir + ")");
  }
}
console.log(APPLY ? `เสร็จ: แก้ ${changed} สินค้า` : `แผน: จะแก้ ${changed} สินค้า — ใส่ --apply เพื่อเขียนจริง`);
process.exit(0);

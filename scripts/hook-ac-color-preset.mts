/**
 * 🪝 เพิ่มกลุ่ม "สีตะขอ AC" (เจ้าของร้านขอ 1 ต.ค. 69): สีชุดเดียวกับตะขอ H 15 สี ต่างแค่ไม่มีห่วงกลม
 *   npx tsx scripts/hook-ac-color-preset.mts <โฟลเดอร์ครอป hooksH> [--apply]
 * ทำ 3 อย่าง (รันซ้ำได้):
 *   1) อัปโหลดภาพ hook-H-<n>.jpg / hook-AC-<n>.jpg → product-images/presets/hooks/ · ใส่ imageSrc ให้คลัง "สีตะขอ H" (ไม่มีภาพรายสีมาก่อน)
 *   2) สร้างคลัง hook-color-ac "สีตะขอ AC" 15 สี (AC1 สีดำ … AC15 สีเหลือง) พร้อมภาพ · ราคาอยู่ที่ตัวเลือกตะขอ AC (+5) สีไม่คิดเพิ่ม (กันคิดซ้ำ)
 *   3) สินค้าที่ใช้คลัง "ตะขอ" (preset-3) ทุกตัว: เพิ่มกลุ่มลิงก์คลัง "สีตะขอ AC" โดยลอกการตั้งค่าจากกลุ่ม "สีตะขอ H" ของสินค้านั้น
 *      (display/section/showWhenAlso/showWhenAll/extraFromQty) เปลี่ยนแค่ showWhen → ตะขอ = AC · วางต่อท้ายกลุ่ม "สีตะขอ …" กลุ่มสุดท้าย
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "../src/lib/option-presets";
import type { Product, ProductOption } from "../src/lib/products";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!dir) throw new Error("ใส่โฟลเดอร์ครอป");
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
const BUCKET = "product-images";
const AC_ID = "hook-color-ac";
const AC_LABEL = "สีตะขอ AC";
const AC_HOOK = "AC ตะขอพลาสติกเล็ก (หลายสี)";
const COLORS = ["สีดำ", "สีเทาอ่อน", "สีขาว", "สีน้ำตาล", "สีม่วง", "สีแดง", "สีชมพูอ่อน", "สีชมพู", "สีฟ้าอ่อน", "สีฟ้า", "สีน้ำเงิน", "สีเขียวอ่อน", "สีเขียว", "สีส้ม", "สีเหลือง"];

async function upload(file: string): Promise<string> {
  const path = `presets/hooks/${file}`;
  if (APPLY) {
    const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(`${dir}/${file}`), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${file}: ${error.message}`);
  }
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const hUrl: string[] = [];
const acUrl: string[] = [];
for (let i = 1; i <= 15; i++) {
  hUrl.push(await upload(`hook-H-${i}.jpg`));
  acUrl.push(await upload(`hook-AC-${i}.jpg`));
}
console.log(`${APPLY ? "อัปโหลดแล้ว" : "จะอัปโหลด"} 30 ไฟล์`);

// 1) สีตะขอ H: ใส่ภาพรายสี (ตามลำดับเดียวกับโปสเตอร์ H1…H15)
const { data: hRow } = await sb.from("products").select("data").eq("id", "__preset_hook-color-h").maybeSingle();
const H = hRow!.data as OptionPreset;
const mismatch = H.choices.map((c, i) => [c.name, COLORS[i]] as const).filter(([n, col]) => !n.endsWith(col));
if (mismatch.length) throw new Error("ลำดับสีของคลัง H ไม่ตรงโปสเตอร์: " + JSON.stringify(mismatch));
const nextH: OptionPreset = { ...H, choices: H.choices.map((c, i) => ({ ...c, imageSrc: hUrl[i] })) };

// 2) คลัง สีตะขอ AC
const { data: acRow } = await sb.from("products").select("data").eq("id", `__preset_${AC_ID}`).maybeSingle();
const cur = acRow?.data as OptionPreset | undefined;
const nextAC: OptionPreset = {
  ...(cur ?? {}),
  id: AC_ID,
  label: AC_LABEL,
  note: "AC ตะขอพลาสติกเล็ก (หลายสี) — สีชุดเดียวกับตะขอ H แต่ไม่มีห่วงกลม · ราคาอยู่ที่ตัวเลือกตะขอ AC (+5) สีไม่คิดเพิ่ม",
  sort: (H.sort ?? 7) + 0.5,
  choices: COLORS.map((col, i) => ({ ...(cur?.choices.find((c) => c.name === `AC${i + 1} ${col}`) ?? {}), name: `AC${i + 1} ${col}`, imageSrc: acUrl[i] })),
};
console.log(`${cur ? "อัปเดต" : "สร้าง"}คลัง ${AC_LABEL} ${nextAC.choices.length} สี`);

// 3) สินค้าที่ใช้คลังตะขอ: เพิ่มกลุ่ม สีตะขอ AC (ลอกจากกลุ่ม สีตะขอ H)
const { data: prods } = await sb.from("products").select("id,data").neq("category", "__presets__");
const backupDir = `${process.env.TMPDIR ?? "/tmp"}/hook-ac-backup`;
mkdirSync(backupDir, { recursive: true });
const writes: { id: string; data: unknown; note: string }[] = [];
for (const r of prods ?? []) {
  const p = r.data as Product;
  const opts = p.options ?? [];
  if (!opts.some((o) => o.presetId === "preset-3")) continue;
  if (opts.some((o) => o.presetId === AC_ID)) {
    console.log(`= ${r.id}: มีกลุ่ม ${AC_LABEL} แล้ว`);
    continue;
  }
  const hi = opts.findIndex((o) => o.presetId === "hook-color-h");
  if (hi < 0) {
    console.log(`! ${r.id}: ไม่มีกลุ่ม สีตะขอ H ให้ลอก — ข้าม`);
    continue;
  }
  const h = opts[hi];
  const { choices: _c, ...cfg } = h;
  const group: ProductOption = {
    ...cfg,
    label: AC_LABEL,
    presetId: AC_ID,
    showWhen: { label: h.showWhen?.label ?? "ตะขอ", choices: [AC_HOOK] },
    choices: nextAC.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
  };
  // วางต่อท้ายกลุ่ม "สีตะขอ …" กลุ่มสุดท้าย
  let at = -1;
  opts.forEach((o, i) => {
    if (/^สีตะขอ/.test(o.label)) at = i;
  });
  const options = [...opts.slice(0, at + 1), group, ...opts.slice(at + 1)];
  writes.push({ id: r.id, data: { ...p, options, savedAt: new Date().toISOString() }, note: `${p.name}: เพิ่ม ${AC_LABEL} หลัง “${opts[at]?.label}” (showWhen ${group.showWhen!.label} = AC)` });
}
for (const w of writes) console.log(`→ ${w.id} — ${w.note}`);
if (APPLY) {
  let e = (await sb.from("products").update({ data: nextH }).eq("id", "__preset_hook-color-h")).error;
  if (e) throw new Error(e.message);
  e = (await sb.from("products").upsert({ id: `__preset_${AC_ID}`, name: `(คลังตัวเลือก) ${AC_LABEL}`, category: "__presets__", price: 0, data: nextAC }, { onConflict: "id" })).error;
  if (e) throw new Error(e.message);
  for (const w of writes) {
    const before = (prods ?? []).find((r) => r.id === w.id)!.data;
    writeFileSync(`${backupDir}/${w.id}.json`, JSON.stringify(before));
    e = (await sb.from("products").update({ data: w.data }).eq("id", w.id)).error;
    if (e) throw new Error(`${w.id}: ${e.message}`);
  }
  console.log(`เสร็จ — สำรองสินค้าเดิมที่ ${backupDir}`);
} else console.log("ยังไม่เขียน — ใส่ --apply");
process.exit(0);

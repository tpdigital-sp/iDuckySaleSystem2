/**
 * 🪧⬜ ป้ายขาตั้ง X-Stand + Roll UP: เลเยอร์รองขาว (เจ้าของร้านสั่ง 22 ต.ค. 69 "ต้องมีเลเยอร์รองขาวด้วย")
 *
 *   npx tsx scripts/xstand-rollup-white-under.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/xstand-rollup-white-under.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * รองขาวของจอออกแบบผูกกับเส้นตัด (TemplateFile.whiteUnder ต้องมี cutCurves) แต่ไฟล์ .ai ร้าน 2 ชุดนี้ไม่มีเส้นตัดเลย
 * (X-Stand มีแค่จุดเจาะตาไก่ · Roll UP ไม่มีเวกเตอร์) → เส้นตัด = กรอบเต็มอาร์ตบอร์ด (ป้ายไวนิลตัดตามขอบแผ่น)
 *   X-Stand tpl-pk12k9rd3 600×1600 · Roll UP tpl-7579x2fgb 600×1800 (รวมส่วนเผื่อหัวหนีบ/ม้วนฐาน — พิมพ์ทั้งแผ่น)
 * ผล: .ai จากจอออกแบบมีเลเยอร์ "รองขาว (White)" (ตามเนื้อภาพ) + "เส้นตัด (CutContour)" กรอบแผ่น · .pdf มีหน้ารองขาว/เส้นไดคัท
 * ⚠️ whiteUnder = โหมดวัสดุใสของจอ (พื้นผืนโปร่ง ส่วนขาวล้วนในลาย = ไม่พิมพ์ · รองขาวลงเฉพาะที่มีภาพ) — ถ้าร้านไม่ต้องการ ให้ถอด whiteUnder ออก
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateCurve } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const SETS: { tpl: string; product: string }[] = [
  { tpl: "tpl-pk12k9rd3", product: "x-stand" },
  { tpl: "tpl-7579x2fgb", product: "roll-up" },
];
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** สี่เหลี่ยมเต็มอาร์ตบอร์ด (ทางปิด · เส้นตรงเป็นเบซิเยร์ จุดควบคุมที่ 1/3) */
function rect(w: number, h: number): TemplateCurve[] {
  const pts: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
    [0, 0],
  ];
  const g: TemplateCurve["g"] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    g.push([ax + (bx - ax) / 3, ay + (by - ay) / 3, ax + (2 * (bx - ax)) / 3, ay + (2 * (by - ay)) / 3, bx, by]);
  }
  return [{ s: [0, 0], g }];
}
const flat = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g]));

type Row = { id: string; data: DesignTemplate };
const { data: rows } = await sb.from("products").select("id,data").in("id", SETS.map((s) => `__template_${s.tpl}`));
const plan: { row: Row; next: DesignTemplate }[] = [];
for (const s of SETS) {
  const row = ((rows ?? []) as Row[]).find((r) => r.data.id === s.tpl) ?? die(`ไม่พบชุด ${s.tpl}`);
  const files = row.data.files ?? [];
  if (files.length !== 1 || !files[0].widthMm || !files[0].heightMm) die(`ชุด ${row.data.name} ต้องมีไฟล์เดียวที่รู้ขนาด`);
  const f = files[0];
  const curves = rect(f.widthMm!, f.heightMm!);
  const same = flat(f.cutCurves) === flat(curves) && f.whiteUnder === true;
  console.log(`${same ? "✓" : "✎"} ${row.data.name} (${s.tpl} → ${s.product}) · เส้นตัดกรอบแผ่น ${f.widthMm}×${f.heightMm} มม. · whiteUnder`);
  if (!same) plan.push({ row, next: { ...row.data, files: [{ ...f, cutCurves: curves, whiteUnder: true }] } });
}
if (!plan.length) {
  console.log("✅ ครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ ${plan.length} ชุด · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const p of plan) {
  const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
  if (error) die(`บันทึก ${p.row.data.id}: ${error.message}`);
  console.log(`   ✅ ${p.row.data.name}`);
}
await revalidateLive(env, { productIds: SETS.map((s) => s.product), templateIds: plan.map((p) => p.row.data.id) });

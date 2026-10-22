/**
 * 📁✂️⬜ แฟ้มจิ๋ว (mini-folder): เส้นไดคัทตามเทมเพลต + เลเยอร์รองขาว (เจ้าของร้านสั่ง 22 ต.ค. 69 "ต้องมีเลเยอร์รองขาวด้วย · ต้องมีเส้นไดคัทตามเทมเพลต")
 *
 *   npx tsx scripts/mini-folder-cut-white.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/mini-folder-cut-white.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * ไฟล์ .ai ร้าน (หมวด "แฟ้มจิ๋ว" · เล็ก 79×49 / ใหญ่ 113×66 มม.) มีเส้นแดง 0.5pt: กรอบมุมมน "วงนอก" = เส้นตัดแฟ้ม (ห่างขอบ 1.5–1.7 มม. ·
 *   ใหญ่ 110×63 → ปิดแฟ้ม (110−17)/2 × 63 ≈ 4.65×6.3 ซม. ตรงชื่อ 4.8x6.2) · กรอบวงใน = เขตปลอดภัย · สี่เหลี่ยมกลาง+เส้นกลาง = สัน 17 มม. (เส้นพับ ไม่ตัด) · วงกลมแดงทึบ = ตำแหน่งกระดุม
 *   template-cut-curves.py หาแต่เส้นเทาจึงไม่เจอ → scripts/py/red-outer-cut.py เลือก "เส้นแดงทางปิดที่มีโค้ง ใหญ่สุด" = วงนอก
 * ตั้ง TemplateFile.cutCurves (กรอบนั้น · มม. พิกัดอาร์ตบอร์ด) + whiteUnder: true (ปก PVC ใสพิมพ์ UV → .ai จากจอออกแบบมีเลเยอร์ "รองขาว (White)" + "เส้นตัด (CutContour)")
 * ด่าน: อาร์ตบอร์ดในไฟล์ต้องตรง widthMm/heightMm ±0.3 · กรอบต้องอยู่ในอาร์ตบอร์ดและใหญ่กว่า 85% ของอาร์ตบอร์ด
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateCurve } from "../src/lib/design-templates";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "แฟ้มจิ๋ว";
const PRODUCT = "mini-folder";
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
const PY = new URL("./py/red-outer-cut.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/mini-folder-cut/`;
mkdirSync(OUT, { recursive: true });

type Row = { id: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

const plan: { row: Row; next: DesignTemplate }[] = [];
for (const row of sets) {
  const t = row.data;
  const files = t.files ?? [];
  if (files.length !== 1 || !files[0].fileUrl || !files[0].widthMm || !files[0].heightMm) die(`ชุด "${t.name}" ต้องมีไฟล์ .ai เดียวที่รู้ขนาด`);
  const f = files[0];
  const local = `${OUT}${t.id}.ai`;
  writeFileSync(local, Buffer.from(await (await fetch(f.fileUrl!)).arrayBuffer()));
  const res = JSON.parse(execFileSync(PYTHON, ["-I", PY, local], { encoding: "utf8" })) as { error?: string; w: number; h: number; curves: TemplateCurve[]; box: number[] };
  if (res.error) die(`${t.name}: ${res.error}`);
  if (Math.abs(res.w - f.widthMm) > 0.3 || Math.abs(res.h - f.heightMm) > 0.3) die(`${t.name}: อาร์ตบอร์ด ${res.w}×${res.h} ≠ ${f.widthMm}×${f.heightMm}`);
  const [bx, by, bw, bh] = res.box;
  if (bx < 0 || by < 0 || bx + bw > res.w + 0.01 || by + bh > res.h + 0.01) die(`${t.name}: กรอบหลุดอาร์ตบอร์ด`);
  if (bw < res.w * 0.85 || bh < res.h * 0.85) die(`${t.name}: กรอบเล็กเกิน (${bw}×${bh}) — ไม่ใช่วงนอก`);
  const nf = { ...f, cutCurves: res.curves, whiteUnder: true };
  // เทียบแบบอาร์เรย์ (jsonb ในฐานเรียงคีย์อ็อบเจกต์ใหม่ → stringify ทั้งก้อนไม่เท่ากันทั้งที่ค่าเหมือน)
  const flat = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g]));
  const same = flat(f.cutCurves) === flat(res.curves) && f.whiteUnder === true;
  console.log(`${same ? "✓" : "✎"} ${t.name} (${t.id}) · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · เส้นตัด (${bx},${by}) ${bw}×${bh} มม. ${res.curves[0].g.length} ช่วง · whiteUnder`);
  if (!same) plan.push({ row, next: { ...t, files: [nf] } });
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
await revalidateLive(env, { productIds: [PRODUCT], templateIds: plan.map((p) => p.row.data.id) });

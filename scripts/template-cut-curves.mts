/**
 * ✂️ บันทึก "เส้นไดคัทจริง" ของไฟล์เทมเพลตลงชุด (TemplateFile.cutCurves) — เจ้าของร้านแจ้ง 16 ต.ค. 69
 *    ".ai ต้องมีเส้นไดคัทด้วย" (เข็มกลัดหัวใจ: .ai จากจอออกแบบมีแต่กรอบสี่เหลี่ยมสมมุติของระบบ)
 *
 *   npx tsx scripts/template-cut-curves.mts --category เข็มกลัดพลาสติก            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/template-cut-curves.mts --category เข็มกลัดพลาสติก --write    # บันทึก
 *
 * โหลดไฟล์ .ai ของแต่ละไฟล์ในชุด → scripts/py/template-cut-curves.py (pymupdf · python ของ tools/cutout-py/.venv)
 *   เลือกเส้น stroke สีเทากลางวงนอกสุด = เส้นตัด (วงถัดเข้าไป = หน้างาน ไม่เก็บ)
 * ด่าน: ขนาดอาร์ตบอร์ดต้องตรง widthMm/heightMm ของไฟล์ ±0.2 มม. · ไม่เจอเส้นเทา/เส้นหลุดอาร์ตบอร์ด = ข้ามไฟล์นั้น (ไม่เดา)
 * รันซ้ำได้ · ไม่แตะไฟล์ .ai/พรีวิว/เงื่อนไข
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { curvesBox, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";

const WRITE = process.argv.includes("--write");
const ci = process.argv.indexOf("--category");
const CATEGORY = ci > 0 ? process.argv[ci + 1] : "";
if (!CATEGORY) {
  console.error("✗ ใส่ --category <หมวดชุดเทมเพลต>");
  process.exit(1);
}
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
const PY = new URL("./py/template-cut-curves.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/template-cut-curves/`;
mkdirSync(OUT, { recursive: true });

type Row = { id: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY.trim() && !r.data.hidden);
if (!sets.length) {
  console.error(`✗ ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);
  process.exit(1);
}

let changed = 0;
for (const row of sets) {
  const t = row.data;
  const files: TemplateFile[] = [];
  let dirty = false;
  for (const f of t.files ?? []) {
    if (!f.fileUrl) {
      files.push(f);
      continue;
    }
    const ext = (f.fileName ?? "").toLowerCase().endsWith(".pdf") ? "pdf" : "ai";
    const local = `${OUT}${f.id}.${ext}`;
    const res = await fetch(f.fileUrl);
    if (!res.ok) {
      console.log(`   ⚠️ ${t.name} · โหลดไฟล์ไม่ได้ (${res.status}) — ข้าม`);
      files.push(f);
      continue;
    }
    writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    let j: { widthMm: number; heightMm: number; cut: TemplateCurve[]; error?: string };
    try {
      j = JSON.parse(execFileSync(PYTHON, ["-I", PY, local], { encoding: "utf8" }).trim());
    } catch (e) {
      const out = (e as { stdout?: string }).stdout ?? "";
      console.log(`   ⚠️ ${t.name} · ${out.trim() || String(e)} — ข้าม`);
      files.push(f);
      continue;
    }
    if (Math.abs(j.widthMm - (f.widthMm ?? 0)) > 0.2 || Math.abs(j.heightMm - (f.heightMm ?? 0)) > 0.2) {
      console.log(`   ⚠️ ${t.name} · อาร์ตบอร์ด ${j.widthMm}×${j.heightMm} ไม่ตรงที่บันทึก ${f.widthMm}×${f.heightMm} — ข้าม`);
      files.push(f);
      continue;
    }
    const box = curvesBox(j.cut);
    // ⚠️ jsonb เรียงคีย์ใหม่ ({s,g} กลับมาเป็น {g,s}) → เทียบแบบไม่ขึ้นกับลำดับคีย์ ไม่งั้นขึ้น ✎ เขียนทับทุกรอบ (16 ต.ค. 69)
    const canon = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g, !!c.open]));
    const same = !!f.cutCurves?.length && canon(f.cutCurves) === canon(j.cut);
    console.log(
      `${same ? "✓" : "✎"} ${t.name} (${t.id}) · ${f.fileName} · เส้นตัด ${j.cut.length} เส้น ${j.cut.reduce((n, c) => n + c.g.length, 0)} ท่อน · กรอบ ${box ? `${box.w.toFixed(1)}×${box.h.toFixed(1)} มม. @(${box.x.toFixed(1)},${box.y.toFixed(1)})` : "-"} · อาร์ตบอร์ด ${j.widthMm}×${j.heightMm}`,
    );
    if (!same) dirty = true;
    files.push({ ...f, cutCurves: j.cut });
  }
  if (!dirty) continue;
  changed++;
  if (!WRITE) continue;
  const { error } = await sb
    .from("products")
    .update({ data: { ...t, files, savedAt: new Date().toISOString() } })
    .eq("id", row.id);
  if (error) {
    console.error(`✗ บันทึก ${t.id}: ${error.message}`);
    process.exit(1);
  }
  console.log(`   ✅ บันทึกเส้นตัดลงชุด ${t.id}`);
}
console.log(changed ? (WRITE ? `\nบันทึกแล้ว ${changed} ชุด` : `\n(dry-run — จะบันทึก ${changed} ชุด · ใส่ --write)`) : "\n✅ ทุกชุดมีเส้นตัดตรงแล้ว");

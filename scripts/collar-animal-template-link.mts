/**
 * 🐶🔗⬜ ปลอกคอสัตว์เลี้ยง: ผูก 15 ชุดหมวด "ปลอกคอสัตว์เลี้ยง" เข้ากับสินค้า collar-animal ตาม เรทราคา × ขนาด + ออกแบบบนเว็บ + รองขาว
 * (23 ต.ค. 69 เจ้าของร้านสั่ง "ลิ้งค์กับเทมเพลตให้หน่อย สำหรับ ตำแหน่งงาน: ไม่เน้นตำแหน่ง · เพิ่มการออกแบบบนเว็บให้ด้วย · มีเลเยอร์ รองขาวด้วย"
 *  — สินค้านี้ไม่มีกลุ่ม "ตำแหน่งงาน" แยกแบบด้วยเรทราคาแทน · ไฟล์ .ai ใหม่จาก NAS แทนแล้วด้วย template-folder-sync.mts)
 *
 *   npx tsx scripts/collar-animal-template-link.mts            # ดูผล
 *   npx tsx scripts/collar-animal-template-link.mts --write    # บันทึก (รันซ้ำได้)
 *
 * ชื่อชุด → เรท: "ผ้าพันคอหมา <ขนาด>" = ปลอกคอ แบบติดกระดุม · "แบบผูก-<ขนาด>" = ปลอกคอ แบบผูก · "Dog <ขนาด>" = ปลอกคอ แบบใส่กับสาย
 * ต่อชุด: optionLabel "ขนาด" + file.choice = ขนาด + file.when เรทราคา = [เรทปลีก, เรทตัวแทน] · optionProductId collar-animal · bleedMm 0
 * ต่อไฟล์: cutCurves = เส้นขอบผ้าในเลเยอร์ Print (scripts/py/layer-outline-cut.py · สามเหลี่ยม/ข้าวหลามตัด) + whiteUnder
 * สินค้า: templateIds = 15 ชุด · calendarStudio { yearLabel: "", formats: [] } (คงค่าอื่น) · ถอด studioOff
 * ด่าน: ทุกคู่ เรท × ขนาด ในตารางราคาต้องได้ไฟล์เดียว · ชุดที่ไม่มีคู่ในตารางราคา = หยุด
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "ปลอกคอสัตว์เลี้ยง";
const PRODUCT = "collar-animal";
const RATE = "เรทราคา";
const SIZE = "ขนาด";
const RULES: { re: RegExp; rate: string }[] = [
  { re: /^ผ้าพันคอหมา\s*(\w+)$/, rate: "ปลอกคอ แบบติดกระดุม" },
  { re: /^แบบผูก\s*-\s*(\w+)$/, rate: "ปลอกคอ แบบผูก" },
  { re: /^Dog\s*(\w+)$/, rate: "ปลอกคอ แบบใส่กับสาย" },
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
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const PY_CUT = new URL("./py/layer-outline-cut.py", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/collar-animal-template-link/`;
mkdirSync(OUT, { recursive: true });

const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr) die(perr.message);
const product = prow!.data as Product & { priceRates?: { label: string; dealerOnly?: boolean; pricing?: { cells?: Record<string, unknown> } }[] };
const rates = product.priceRates ?? [];
const sizesOf = (rate: string) => Object.keys(rates.find((r) => r.label === rate)?.pricing?.cells ?? {});

type Row = { id: string; data: DesignTemplate };
const { data: rows, error } = await sb.from("products").select("id,data").eq("category", "__templates__").like("id", "__template_tpl-%");
if (error) die(error.message);
const sets = ((rows ?? []) as Row[]).filter((r) => (r.data.category ?? "") === CATEGORY).sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0));
if (!sets.length) die(`ไม่มีชุดหมวด "${CATEGORY}"`);

type Plan = { row: Row; next: DesignTemplate; changed: boolean };
const plan: Plan[] = [];
for (const row of sets) {
  const name = row.data.name.trim();
  const rule = RULES.find((r) => r.re.test(name));
  if (!rule) die(`ชุด "${name}" ไม่เข้ากฎชื่อไหนเลย`);
  const size = name.match(rule!.re)![1];
  const dealer = `${rule!.rate} (ตัวแทน)`;
  if (!sizesOf(rule!.rate).includes(size)) die(`ชุด "${name}": เรท "${rule!.rate}" ไม่มีขนาด ${size}`);
  const rateChoices = rates.some((r) => r.label === dealer) ? [rule!.rate, dealer] : [rule!.rate];
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${name}" มี ${files.length} ไฟล์`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${name}" ไม่มีไฟล์/ขนาดอาร์ตบอร์ด`);
  const local = `${OUT}${row.data.id}.ai`;
  const res = await fetch(f.fileUrl!);
  if (!res.ok) die(`โหลด ${f.fileUrl}: ${res.status}`);
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  let cut: { widthMm: number; heightMm: number; cut: TemplateCurve[]; bbox: number[] };
  try {
    cut = JSON.parse(execFileSync(PYTHON, ["-I", PY_CUT, local, "Print"], { encoding: "utf8" }).trim());
  } catch {
    die(`ชุด "${name}": อ่านเส้นขอบเลเยอร์ Print ไม่ได้`);
  }
  if (Math.abs(cut!.widthMm - f.widthMm!) > 0.2 || Math.abs(cut!.heightMm - f.heightMm!) > 0.2)
    die(`ชุด "${name}": อาร์ตบอร์ดไฟล์ ${cut!.widthMm.toFixed(1)}×${cut!.heightMm.toFixed(1)} ≠ ในฐาน ${f.widthMm}×${f.heightMm}`);
  const nf: TemplateFile = { ...f, choice: size, when: [{ label: RATE, choices: rateChoices }], cutCurves: cut!.cut, whiteUnder: true };
  delete nf.choices;
  const next: DesignTemplate = { ...row.data, optionLabel: SIZE, optionProductId: PRODUCT, bleedMm: 0, files: [nf] };
  const key = (t: DesignTemplate) => {
    const x = t.files![0];
    return JSON.stringify([t.optionLabel, t.optionProductId, t.bleedMm, x.choice, x.when, x.cutCurves, x.whiteUnder ?? false]);
  };
  const changed = key(row.data) !== key(next);
  const b = cut!.bbox.map((v) => Math.round(v * 10) / 10);
  console.log(
    `${changed ? "✎" : "✓"} ${name} (${row.data.id}) → ${SIZE}=${size} · ${RATE}=${rateChoices.join(" / ")}` +
      ` · เส้นตัด ${cut!.cut[0].g.length} ท่อน กรอบ ${b.join(",")} ในอาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · รองขาว`,
  );
  plan.push({ row, next, changed });
}

// ด่าน: ทุกคู่ เรท × ขนาด ในตารางราคา (ปลีก+ตัวแทน) ได้ไฟล์เดียวพอดี
for (const r of rates) {
  for (const size of sizesOf(r.label)) {
    const sel = { [RATE]: r.label, [SIZE]: size };
    const hits = plan.flatMap((p) => filesForSelections(p.next, sel).map(() => p.next.name));
    if (hits.length !== 1) die(`${r.label} × ${size} ได้ ${hits.length} ไฟล์ (${hits.join(", ") || "-"})`);
  }
}
console.log(`✓ ตรวจทุกคู่เรท × ขนาด (${rates.length} เรท) ได้ไฟล์เดียว`);

const ids = plan.map((p) => p.row.data.id);
const wantStudio = { ...(product.calendarStudio ?? {}), yearLabel: product.calendarStudio?.yearLabel ?? "", formats: product.calendarStudio?.formats ?? [] };
if (wantStudio.formats.some((f) => f.format !== "tpl2")) die(`สินค้าตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);
const prodChanged = JSON.stringify(product.templateIds ?? []) !== JSON.stringify(ids) || !product.calendarStudio || product.studioOff === true;
console.log(`${prodChanged ? "✎" : "✓"} สินค้า ${PRODUCT}: templateIds ${(product.templateIds ?? []).length} → ${ids.length} ชุด · calendarStudio ${product.calendarStudio ? "มี" : "-"} → ${JSON.stringify(wantStudio)}`);

if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ชุด ${plan.filter((p) => p.changed).length} ชุด${prodChanged ? " + สินค้า" : ""} · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const p of plan.filter((p) => p.changed)) {
  const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
  if (error) die(`บันทึก ${p.row.data.id}: ${error.message}`);
}
if (prodChanged) {
  // อ่านสินค้าล่าสุดก่อนเขียน แล้วแตะเฉพาะ templateIds / calendarStudio / studioOff
  const { data: fresh, error: ferr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  if (ferr) die(ferr.message);
  const cur = fresh!.data as Product;
  const next: Product = { ...cur, templateIds: ids, calendarStudio: { ...(cur.calendarStudio ?? {}), ...wantStudio }, savedAt: new Date().toISOString() };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า: ${error.message}`);
}
console.log(`✅ บันทึกแล้ว: ชุด ${plan.filter((p) => p.changed).length}${prodChanged ? " + สินค้า" : ""}`);
await revalidateLive(env, { productIds: [PRODUCT], templateIds: ids });

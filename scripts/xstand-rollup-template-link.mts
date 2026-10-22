/**
 * 🪧 ป้ายขาตั้ง X-Stand (`x-stand`) + Roll UP (`roll-up`) ผูกชุดเทมเพลตหมวด "x-stand+Roll Up" (ชุดละสินค้า) + เปิดออกแบบบนเว็บ
 * (22 ต.ค. 69 เจ้าของร้านสั่ง "ลิ้งค์กับเทมเพลตให้หน่อย สำหรับ ตำแหน่งงาน: ไม่เน้นตำแหน่ง" + "เพิ่มการออกแบบบนเว็บให้ด้วย")
 *
 *   npx tsx scripts/xstand-rollup-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/xstand-rollup-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * สินค้า 2 ตัวนี้ "ไม่มีกลุ่มตัวเลือกเลย" (options ว่าง · ขนาดเดียว 60×160 ซม. · ไม่มีกลุ่ม "ตำแหน่งงาน")
 *   → ผูกชุดตรง ๆ ไม่ตั้ง optionLabel/when (แบบเดียวกับผ้าเช็ดหน้า 30x30 · เจ้าของร้านพิมพ์ "ไม่เน้นตำแหน่ง" ตามเคยแต่สินค้าไม่มีกลุ่มนั้น)
 * ชุดเทมเพลต (ชุดละ 1 ไฟล์ .ai + สกิน F-01):
 *   tpl-pk12k9rd3 "x-stand 60x160 cm" อาร์ตบอร์ด 600×1600 มม. (เลเยอร์ เจาะรู = จุดเขียว 4 มุม Ø14 ที่ 20 มม. จากขอบ)
 *   tpl-7579x2fgb "roll up 60x160 cm" อาร์ตบอร์ด 600×1800 มม. = งานโชว์ 1600 + เผื่อม้วนเข้าฐาน/หัวหนีบ (สกินแถบขาวบน 100 / ล่าง 100 มม.)
 *   → finishedMm = 600×1600 ทั้งคู่ (หัวจอบอก "งานออกแบบ 60×160 ซม." · roll up ไม่งั้นขึ้น 60×180)
 *   → roll up ตั้ง bleedMm = 0 (อาร์ตบอร์ดรวมส่วนเผื่อมาแล้ว · ไม่งั้น templateFrame ถอดชื่อ 60x160 จาก 600×1800 ไม่ได้ (เผื่อ 100 > 25) ตกไปตัดตก 3 มม.)
 * สินค้า: templateIds = [ชุดของตัวเอง] · calendarStudio = { yearLabel: "", formats: [] } (ขนาดจอจากอาร์ตบอร์ดเทมเพลต tpl@) · ถอด studioOff
 * ⚠️ 22 ต.ค. 69 รอบ 2: เพิ่มกลุ่ม "ขนาด" + ผูกชุดตามขนาดแล้วด้วย scripts/xstand-rollup-size-option.mts → สคริปต์นี้จะหยุดเอง (สินค้ามีกลุ่มตัวเลือก/ชุดมี choice) ใช้ตัวนั้นแทน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "x-stand+Roll Up";
/** สินค้า → คำขึ้นต้นชื่อชุดเทมเพลต (ชื่อชุดในฐาน "x-stand 60x160 cm" / "roll up 60x160 cm") */
const PAIRS: { product: string; prefix: string; finishedMm: { w: number; h: number }; bleedMm?: number }[] = [
  { product: "x-stand", prefix: "x-stand", finishedMm: { w: 600, h: 1600 } },
  { product: "roll-up", prefix: "roll up", finishedMm: { w: 600, h: 1600 }, bleedMm: 0 },
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

type Row = { id: string; name: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,name,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

type Plan = { pair: (typeof PAIRS)[number]; product: Product; row: Row; next: DesignTemplate; tplChanged: boolean; prodNext: Product; prodChanged: boolean };
const plan: Plan[] = [];
for (const pair of PAIRS) {
  const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", pair.product).single();
  if (perr || !prow) die(`อ่านสินค้า ${pair.product} ไม่ได้: ${perr?.message}`);
  const product = prow!.data as Product;
  if (product.options?.length) die(`${pair.product} มีกลุ่มตัวเลือก ${product.options.map((o) => o.label).join("/")} — สคริปต์นี้ผูกแบบไม่มีเงื่อนไข ตรวจก่อน`);
  const hit = sets.filter((r) => r.data.name.trim().toLowerCase().startsWith(pair.prefix));
  if (hit.length !== 1) die(`${pair.product}: ชุดชื่อขึ้นต้น "${pair.prefix}" ในหมวด "${CATEGORY}" มี ${hit.length} ชุด (${hit.map((h) => h.data.name).join(" · ")})`);
  const row = hit[0];
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${row.data.name}" มี ${files.length} ไฟล์ (รองรับชุดละไฟล์เดียว)`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${row.data.name}" ไฟล์ยังไม่มี .ai หรือไม่รู้ขนาดอาร์ตบอร์ด`);
  if (f.choice || f.choices?.length || f.when || row.data.optionLabel) die(`ชุด "${row.data.name}" มี optionLabel/choice/when ค้างอยู่ — ตรวจก่อน`);
  const nf: TemplateFile = { ...f, finishedMm: pair.finishedMm };
  const next: DesignTemplate = { ...row.data, files: [nf] };
  if (pair.bleedMm !== undefined) next.bleedMm = pair.bleedMm;
  // เทียบเฉพาะค่าที่สคริปต์ตั้ง (jsonb ในฐานเรียงคีย์ใหม่ → stringify ทั้งก้อนไม่เท่ากันทั้งที่ค่าเหมือน)
  const key = (fm?: { w: number; h: number }, b?: number) => `${fm?.w ?? "-"}x${fm?.h ?? "-"}/${b ?? "-"}`;
  const tplChanged = key(f.finishedMm, row.data.bleedMm) !== key(nf.finishedMm, next.bleedMm);
  // ตรวจว่าไม่มีเงื่อนไข → ได้ไฟล์เดียว + จอออกแบบรู้กรอบงาน
  if (filesForSelections(next, {}).length !== 1) die(`${row.data.name}: filesForSelections ไม่ได้ไฟล์เดียว`);
  const fr = templateFrame(next, nf);
  if (!fr) die(`${row.data.name}: templateFrame คืน null (จอออกแบบเปิดไม่ได้)`);
  const ids = product.templateIds ?? [];
  const wantIds = ids.includes(row.data.id) ? ids : [...ids, row.data.id];
  const wantStudio = { ...(product.calendarStudio ?? {}), yearLabel: product.calendarStudio?.yearLabel ?? "", formats: product.calendarStudio?.formats ?? [] };
  if (wantStudio.formats.length) die(`${pair.product} ตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);
  const prodNext: Product = { ...product, templateIds: wantIds, calendarStudio: wantStudio };
  delete prodNext.studioOff;
  const prodChanged = JSON.stringify({ a: ids, b: product.calendarStudio, c: product.studioOff }) !== JSON.stringify({ a: wantIds, b: wantStudio, c: undefined });
  plan.push({ pair, product, row, next, tplChanged, prodNext, prodChanged });
  console.log(
    `🔗 ${product.name} (${pair.product}) ← "${row.data.name}" (${row.data.id}) · ${f.fileName} · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · งานจริง ${pair.finishedMm.w}×${pair.finishedMm.h} มม.` +
      ` · bleed ${next.bleedMm ?? "(กลาง 3)"} → กรอบจอ ผืน ${fr.canvasWMm}×${fr.canvasHMm} ตัด ${fr.trimWMm}×${fr.trimHMm} ตัดตก ${fr.bleedXMm}/${fr.bleedYMm}`,
  );
  console.log(`   ชุด ${tplChanged ? "✎" : "✓"} · สินค้า ${prodChanged ? "✎" : "✓"}: templateIds ${JSON.stringify(ids)} → ${JSON.stringify(wantIds)} · calendarStudio ${JSON.stringify(product.calendarStudio)} → ${JSON.stringify(wantStudio)} · studioOff ${product.studioOff ?? "-"}`);
}
if (!plan.some((p) => p.tplChanged || p.prodChanged)) {
  console.log("✅ ผูกครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ชุด ${plan.filter((p) => p.tplChanged).length} ชุด + สินค้า ${plan.filter((p) => p.prodChanged).length} ตัว · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}

/* ── เขียน ── */
for (const p of plan) {
  if (p.tplChanged) {
    const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
    if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
    console.log(`   ✅ ชุด "${p.row.data.name}" finishedMm ${p.pair.finishedMm.w}×${p.pair.finishedMm.h}${p.pair.bleedMm !== undefined ? ` · bleedMm ${p.pair.bleedMm}` : ""}`);
  }
  if (p.prodChanged) {
    // อ่านสินค้าล่าสุดก่อนเขียน (เผื่อมีคนบันทึกระหว่างรัน) แล้วแตะเฉพาะ templateIds / calendarStudio / studioOff
    const { data: fresh } = await sb.from("products").select("data").eq("id", p.pair.product).single();
    const cur = (fresh?.data ?? p.product) as Product;
    const next: Product = { ...cur, templateIds: p.prodNext.templateIds, calendarStudio: p.prodNext.calendarStudio, savedAt: new Date().toISOString() };
    delete next.studioOff;
    const { error } = await sb.from("products").update({ data: next }).eq("id", p.pair.product);
    if (error) die(`บันทึกสินค้า ${p.pair.product}: ${error.message}`);
    console.log(`   ✅ สินค้า ${p.product.name}: ผูกชุด + เปิดออกแบบบนเว็บ`);
  }
}
await revalidateLive(env, { productIds: PAIRS.map((p) => p.product), templateIds: plan.map((p) => p.row.data.id) });

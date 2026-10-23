/**
 * 🎀 ผ้าผูกผม (`scarf`) + Scrunchy ยางรัดผม (`scrunchy`) ผูกชุดเทมเพลตหมวด "Women Product" (ชุดละสินค้า) + เปิดออกแบบบนเว็บ
 * (23 ต.ค. 69 เจ้าของร้านสั่ง "เพิ่มการออกแบบบนเว็บให้ด้วย" พร้อมภาพชุด ผ้าพันผม / ยางมัดผม)
 *
 *   npx tsx scripts/hair-accessory-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/hair-accessory-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง (รันซ้ำได้)
 *
 * สินค้าทั้ง 2 ตัวมีกลุ่ม "ขนาด" ค่าเดียว (5 × 100 / 5 × 45 ซม.) → ผูกชุดตรง ๆ ไม่ตั้ง when (ไฟล์เดียวใช้ทุกตัวเลือก)
 * ชุดเทมเพลต (ไฟล์บน NAS 0. งานผ้า/ผ้าพันผม+ยางมัดผม หน้าตาเหมือนไฟล์ที่อัปไว้ — ไม่แทน):
 *   tpl-3d24p1lam "ผ้าพันผม" อาร์ตบอร์ด 1022×133 · เส้นตัดแดง 3 มม. ในขอบ (ปลายตัด V) = กรอบกลาง bleed 3 → ตัด 1016×127 ไม่ต้องตั้ง
 *     ผืนพิมพ์ 2 เท่าความกว้างแล้วพับครึ่งตามยาว (เส้นประกลาง) → ได้ 5 × 100 ซม.
 *   tpl-erlm3ipsi "ยางมัดผม" อาร์ตบอร์ด 457.2×101.6 (18×4 นิ้ว) · เส้นตัดแดง = ขอบอาร์ตบอร์ด → finishedMm เท่าอาร์ตบอร์ด + bleedMm 0
 * ผ้า ไม่มีเส้นไดคัท ไม่มีรองขาว · calendarStudio = { yearLabel: "", formats: [] } · ถอด studioOff
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CATEGORY = "Women Product";
/** สินค้า → ชื่อชุดเทมเพลต (ตรงตัว) · finishedMm ไม่ตั้ง = ใช้กรอบกลาง (ตัดตก 3 มม.) */
const PAIRS: { product: string; prefix: string; finishedMm?: { w: number; h: number }; bleedMm?: number }[] = [
  { product: "scarf", prefix: "ผ้าพันผม" },
  { product: "scrunchy", prefix: "ยางมัดผม", finishedMm: { w: 457.2, h: 101.6 }, bleedMm: 0 },
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
  const size = product.options?.find((o) => o.label === "ขนาด");
  if (size && size.choices.length !== 1) die(`${pair.product} กลุ่ม "ขนาด" มี ${size.choices.length} ค่า — ต้องผูกตามขนาด (when) ไม่ใช่สคริปต์นี้`);
  const hit = sets.filter((r) => r.data.name.trim().toLowerCase() === pair.prefix.toLowerCase());
  if (hit.length !== 1) die(`${pair.product}: ชุดชื่อ "${pair.prefix}" ในหมวด "${CATEGORY}" มี ${hit.length} ชุด (${hit.map((h) => h.data.name).join(" · ")})`);
  const row = hit[0];
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${row.data.name}" มี ${files.length} ไฟล์ (รองรับชุดละไฟล์เดียว)`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${row.data.name}" ไฟล์ยังไม่มี .ai หรือไม่รู้ขนาดอาร์ตบอร์ด`);
  if (f.choice || f.choices?.length || f.when || row.data.optionLabel) die(`ชุด "${row.data.name}" มี optionLabel/choice/when ค้างอยู่ — ตรวจก่อน`);
  const nf: TemplateFile = pair.finishedMm ? { ...f, finishedMm: pair.finishedMm } : { ...f };
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
    `🔗 ${product.name} (${pair.product}) ← "${row.data.name}" (${row.data.id}) · ${f.fileName} · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · งานจริง ${pair.finishedMm ? `${pair.finishedMm.w}×${pair.finishedMm.h}` : "(กรอบกลาง)"} มม.` +
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
    console.log(`   ✅ ชุด "${p.row.data.name}" finishedMm ${p.pair.finishedMm ? `${p.pair.finishedMm.w}×${p.pair.finishedMm.h}` : "-"}${p.pair.bleedMm !== undefined ? ` · bleedMm ${p.pair.bleedMm}` : ""}`);
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

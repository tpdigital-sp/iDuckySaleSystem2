/**
 * 🛋🔗 หมอนอิงยัดใย (`cushion` · /products/หมอนอิงยัดใย) ผูกชุดเทมเพลต "หมอนอิง(ซิป)" ชุดเดียวกับปลอกหมอนอิง + เปิดออกแบบบนเว็บ
 * (22 ต.ค. 69 เจ้าของร้านสั่ง "ลิ้งค์กับเทมเพลต สำหรับ ตำแหน่งงาน: ไม่เน้นตำแหน่ง" + "เพิ่มการออกแบบบนเว็บ"
 *  — สินค้านี้ไม่มีกลุ่ม "ตำแหน่งงาน" · กลุ่ม "ขนาด" 7 ค่าชื่อเดียวกับ pillowcases-5 เป๊ะ จึงใช้ optionLabel/choice ที่ตั้งไว้ในชุดได้เลย)
 *
 *   npx tsx scripts/cushion-filled-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/cushion-filled-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้าบนเว็บจริง
 *
 * ทำอะไร: product.templateIds += ชุด Cushion Zip ที่ตั้ง choice ตรงค่า "ขนาด" ของสินค้า (12/14/16/18/20/24 · 22x22 ไม่มีชุด = การ์ดปิด tplModelMissing)
 *   + calendarStudio = { yearLabel: "", formats: [] } (ขนาดงานจากอาร์ตบอร์ด tpl@) + ถอด studioOff · ไม่แตะชุดเทมเพลต/ตัวเลือก/ราคา
 * ไม่ได้ผูกหมวด "หมอนอิง(ยัดใย)" (1ด้าน/2ด้าน 12/14/16/24 นิ้ว นำเข้า 12 ส.ค. 69 · อาร์ตบอร์ดสี่เหลี่ยมจัตุรัสด้านเดียว) — เจ้าของร้านชี้ไฟล์ Cushion Zip มาเอง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, type DesignTemplate } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "cushion";
const CATEGORY = "หมอนอิง(ซิป)";
const SIZE = "ขนาด";
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

const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const choices = product.options.find((o) => o.label === SIZE)?.choices.map((c) => c.name) ?? die(`สินค้าไม่มีกลุ่ม "${SIZE}"`);

type Row = { id: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

console.log(`🔗 ${product.name} (${PRODUCT}) · หมวด "${CATEGORY}" ${sets.length} ชุด · กลุ่ม "${SIZE}" ${choices.length} ค่า`);
const linkIds: string[] = [];
for (const c of choices) {
  const hits = sets.filter((s) => s.data.optionLabel?.trim() === SIZE && filesForSelections(s.data, { [SIZE]: c }).length === 1);
  if (hits.length > 1) die(`${c}: มี ${hits.length} ชุดตรงค่าเดียวกัน (${hits.map((h) => h.data.name).join(" · ")})`);
  if (!hits.length) {
    console.log(`   ⚠️ ${c} → ไม่มีชุดเทมเพลต (การ์ดออกแบบจะปิด "แนบไฟล์แทน")`);
    continue;
  }
  const f = filesForSelections(hits[0].data, { [SIZE]: c })[0];
  // ชุดนี้ต้องไม่โผล่ตอนเลือกขนาดอื่น
  for (const o of choices.filter((x) => x !== c)) if (filesForSelections(hits[0].data, { [SIZE]: o }).length) die(`${c}: ชุด "${hits[0].data.name}" ยังโผล่ตอนเลือก "${o}"`);
  console.log(`   ✓ ${c} ← "${hits[0].data.name}" (${hits[0].data.id}) · ${f.fileName} · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} มม.`);
  linkIds.push(hits[0].data.id);
}
for (const s of sets.filter((x) => !linkIds.includes(x.data.id))) console.log(`   · ไม่ผูก "${s.data.name}" (${s.data.id}) — ไม่มีค่าคู่ใน "${SIZE}"`);

const ids = product.templateIds ?? [];
const addIds = linkIds.filter((id) => !ids.includes(id));
const studioChange = !product.calendarStudio || product.studioOff === true;
console.log(`   templateIds ${ids.length} → ${ids.length + addIds.length} ชุด · studioOff ${product.studioOff === true ? "true" : "-"} · calendarStudio ${product.calendarStudio ? JSON.stringify(product.calendarStudio) : "-"}${studioChange ? " → เปิดออกแบบบนเว็บ" : " (เปิดอยู่แล้ว)"}`);
if (!addIds.length && !studioChange) {
  console.log("✅ ผูกครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะผูก ${addIds.length} ชุด${studioChange ? " + เปิดออกแบบบนเว็บ" : ""} · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
const cur = (fresh?.data ?? product) as Product;
const curIds = cur.templateIds ?? [];
const next: Product = { ...cur, templateIds: [...curIds, ...addIds.filter((id) => !curIds.includes(id))], savedAt: new Date().toISOString() };
if (studioChange) {
  if (!next.calendarStudio) next.calendarStudio = { yearLabel: "", formats: [] };
  delete next.studioOff;
}
const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
if (error) die(`บันทึกสินค้า: ${error.message}`);
console.log(`   ✅ ผูก ${addIds.length} ชุดเข้า ${product.name}${studioChange ? " + เปิดออกแบบบนเว็บ" : ""}`);
await revalidateLive(env, { productIds: [PRODUCT] });

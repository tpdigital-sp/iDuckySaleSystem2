/**
 * 🔗📐 ผูกชุดเทมเพลต (ชุดละไฟล์เดียว · ชื่อชุดมีขนาด "กว้างxสูง") เข้ากับสินค้า แยกตามตัวเลือกขนาด
 * (16 ต.ค. 69 เจ้าของร้านสั่ง "ทำการเชื่อมสินค้าให้หน่อย" — Puzzle 3 ขนาด · วิธีเดียวกับเข็มกลัดใน brooch-badge-design-studio.mts)
 *
 *   npx tsx scripts/template-link-by-size.mts --product puzzle --category Puzzle             # ดูผล (ไม่เขียน)
 *   npx tsx scripts/template-link-by-size.mts --product puzzle --category Puzzle --write     # บันทึก
 *   (ตัวเลือก) --label ขนาด   ชื่อกลุ่มตัวเลือกขนาดของสินค้า (ค่าเริ่ม "ขนาด")
 *   (ตัวเลือก) --studio-on    เปิด "ออกแบบบนเว็บ" ด้วย: calendarStudio = { yearLabel: "", formats: [] } (ขนาดงานจากอาร์ตบอร์ดเทมเพลต · tpl@)
 *                            + ถอด studioOff · สินค้าที่ตั้ง formats ไว้แล้ว (ปฏิทิน/โปสการ์ด) = ไม่แตะ
 *   ลายเดียว/คละลาย ในจอออกแบบโผล่เองเมื่อ 1 หน่วยได้หลายชิ้น (perUnit/piecesPerUnit ของตัวเลือก) — สินค้าขายทีละอัน (Puzzle) ไม่ถาม
 *
 * จับคู่: ตัวเลข "AxB" ในชื่อชุด ≈ ตัวเลข "AxB" ในชื่อค่าตัวเลือก (ไม่สนลำดับ 9x7.5 = 7.5x9 · ไม่สนหน่วย/ช่องว่าง/"*"
 *   · คลาดได้ด้านละ ≤ 0.5 หน่วย — "จิ๊กซอว์ 20 x29 cm" = "ขนาด 19.8*29 cm") หรือขนาดกระดาษ A0–A7 ตรงกัน ("จิ๊กซอว์ A5" = "A5")
 *   ชุดที่ไม่มีค่าคู่ = ข้าม + เตือน (ไม่ผูก — ผูกแบบไม่มีเงื่อนไขไฟล์จะโผล่ทุกขนาด) · --strict = หยุดแทน
 * ทำอะไร: ตั้ง TemplateFile.when = [{ label: <กลุ่มขนาด>, choices: [<ค่า>] }] → หน้าสินค้าโชว์ไฟล์เฉพาะขนาดที่เลือก
 *   + เติม templateIds ของสินค้า · ไม่แตะ studioOff/calendarStudio (เปิดออกแบบบนเว็บแยกเรื่อง) · ไม่แตะไฟล์/ราคา/ตัวเลือก
 *   + ล้างแคชหน้าสินค้าบนเว็บจริง (scripts/lib/revalidate-live.mts)
 * ด่าน: ทุกชุดต้องจับคู่ได้ค่าเดียว · ค่าเดียวห้ามมีหลายชุด · ชุดต้องมีไฟล์เดียวที่มีไฟล์ .ai และขนาดอาร์ตบอร์ด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, whenList, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PRODUCT = arg("--product");
const CATEGORY = arg("--category");
const SIZE = arg("--label", "ขนาด");
const STUDIO_ON = process.argv.includes("--studio-on");
const STRICT = process.argv.includes("--strict");
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
if (!PRODUCT || !CATEGORY) die("ใส่ --product <id สินค้า> --category <หมวดชุดเทมเพลต>");
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

/** ขนาดในชื่อ: "Puzzle 13.5x11.5 cm" / "ขนาด 19.8*29 cm" → { dims: [11.5, 13.5] } · "จิ๊กซอว์ A5" / "A5" → { paper: "A5" } */
function sizeOf(s: string): { dims?: [number, number]; paper?: string } | null {
  const m = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(s);
  if (m) return { dims: [Number(m[1]), Number(m[2])].sort((a, b) => a - b) as [number, number] };
  const a = /(?:^|[^A-Za-z0-9])(A[0-7])(?![0-9])/i.exec(s);
  if (a) return { paper: a[1].toUpperCase() };
  return null;
}
/** ขนาดเดียวกันไหม — กระดาษ A ตรงกัน หรือกว้าง/สูงคลาดกันด้านละไม่เกิน 0.5 */
function sameSize(a: ReturnType<typeof sizeOf>, b: ReturnType<typeof sizeOf>): boolean {
  if (!a || !b) return false;
  if (a.paper || b.paper) return !!a.paper && a.paper === b.paper;
  return Math.abs(a.dims![0] - b.dims![0]) <= 0.5 && Math.abs(a.dims![1] - b.dims![1]) <= 0.5;
}

/* ── สินค้า ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const choices = product.options.find((o) => o.label === SIZE)?.choices.map((c) => c.name) ?? die(`สินค้าไม่มีกลุ่ม "${SIZE}"`);

/* ── ชุดเทมเพลต ── */
type Row = { id: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY.trim() && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

const plan: { row: Row; choice: string; file: TemplateFile; next: TemplateFile; changed: boolean }[] = [];
const skipped: string[] = [];
for (const row of sets) {
  const t = row.data;
  const key = sizeOf(t.name);
  const hit = key ? choices.filter((c) => sameSize(sizeOf(c), key)) : [];
  if (hit.length !== 1) {
    const why = !key ? "ไม่มีขนาด AxB / A0–A7 ในชื่อ" : hit.length ? `จับคู่ได้ ${hit.length} ค่า (${hit.join(" · ")})` : `ไม่มีค่าคู่ใน "${SIZE}"`;
    if (STRICT || hit.length > 1) die(`ชุด "${t.name}" ${why}`);
    skipped.push(`${t.name} — ${why}`);
    continue;
  }
  const files = t.files ?? [];
  if (files.length !== 1) die(`ชุด "${t.name}" มี ${files.length} ไฟล์ (สคริปต์นี้รองรับชุดละไฟล์เดียว)`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${t.name}" ไฟล์ยังไม่มี .ai หรือไม่รู้ขนาดอาร์ตบอร์ด`);
  const want = [{ label: SIZE, choices: [hit[0]] }];
  plan.push({ row, choice: hit[0], file: f, next: { ...f, when: want }, changed: JSON.stringify(whenList(f)) !== JSON.stringify(want) });
}
for (const s of skipped) console.log(`   ⚠️ ข้ามชุด ${s} (ไม่ผูก)`);
if (!plan.length) die("ไม่มีชุดไหนจับคู่ได้เลย");
const seen = new Map<string, string>();
for (const p of plan) {
  if (seen.has(p.choice)) die(`ค่า "${p.choice}" มี 2 ชุด: ${seen.get(p.choice)} · ${p.row.data.name}`);
  seen.set(p.choice, p.row.data.name);
}

console.log(`🔗 ${product.name} (${PRODUCT}) · ชุดเทมเพลตหมวด "${CATEGORY}" ${sets.length} ชุด · กลุ่ม "${SIZE}"`);
for (const c of choices) {
  const p = plan.find((x) => x.choice === c);
  if (!p) {
    console.log(`   ⚠️ ${c} → ไม่มีชุดเทมเพลต`);
    continue;
  }
  // ยืนยันว่าหลังตั้ง when แล้ว ขนาดนี้ได้ไฟล์นี้ไฟล์เดียว และไม่โผล่ในขนาดอื่น
  const tt = { ...p.row.data, files: [p.next] };
  if (filesForSelections(tt, { [SIZE]: c }).length !== 1) die(`${c}: หลังตั้งเงื่อนไขแล้วไม่ได้ไฟล์`);
  for (const o of choices.filter((x) => x !== c)) if (filesForSelections(tt, { [SIZE]: o }).length) die(`${c}: ไฟล์ยังโผล่ตอนเลือก "${o}"`);
  console.log(`   ${p.changed ? "✎" : "✓"} ${c} ← "${p.row.data.name}" (${p.row.data.id}) · ${p.file.fileName} · อาร์ตบอร์ด ${p.file.widthMm}×${p.file.heightMm} มม.`);
}
const ids = product.templateIds ?? [];
const addIds = plan.map((p) => p.row.data.id).filter((id) => !ids.includes(id));
const hasFormats = !!product.calendarStudio?.formats?.length;
if (STUDIO_ON && hasFormats) die("สินค้านี้ตั้งรูปแบบงานไว้เอง (calendarStudio.formats) — ไม่แตะ ใช้สคริปต์ของสินค้านั้นแทน");
const studioChange = STUDIO_ON && (!product.calendarStudio || product.studioOff === true);
console.log(
  `   templateIds ${ids.length} → ${ids.length + addIds.length} ชุด · studioOff ${product.studioOff === true ? "true" : "-"} · calendarStudio ${product.calendarStudio ? "มี" : "-"}` +
    (STUDIO_ON ? (studioChange ? " → เปิดออกแบบบนเว็บ (calendarStudio formats ว่าง + ถอด studioOff)" : " (เปิดอยู่แล้ว)") : " (ไม่แตะ)"),
);
const nTpl = plan.filter((p) => p.changed).length;
if (!nTpl && !addIds.length && !studioChange) {
  console.log("✅ ผูกครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ชุด ${nTpl} ชุด${addIds.length ? ` + ผูก ${addIds.length} ชุดเข้าสินค้า` : ""}${studioChange ? " + เปิดออกแบบบนเว็บ" : ""} · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}

/* ── เขียน ── */
for (const p of plan.filter((x) => x.changed)) {
  const { error } = await sb
    .from("products")
    .update({ data: { ...p.row.data, files: [p.next], savedAt: new Date().toISOString() } })
    .eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
  console.log(`   ✅ ชุด "${p.row.data.name}" ตั้งเงื่อนไข ${SIZE} = ${p.choice}`);
}
if (addIds.length || studioChange) {
  // อ่านสินค้าล่าสุดก่อนเขียน (เผื่อมีคนบันทึกระหว่างรัน) แล้วแตะเฉพาะ templateIds / calendarStudio / studioOff
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
  if (addIds.length) console.log(`   ✅ ผูก ${addIds.length} ชุดเข้า ${product.name}`);
  if (studioChange) console.log(`   ✅ เปิดออกแบบบนเว็บให้ ${product.name}`);
}
await revalidateLive(env, { productIds: [PRODUCT] });

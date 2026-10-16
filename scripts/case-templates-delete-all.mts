/**
 * 🗑📱 ลบชุดเทมเพลตเคสมือถือทั้งหมด + ปลดออกจาก 3 สินค้า (เจ้าของร้านสั่ง 16 ต.ค. 69 "ลบเทมเพลตเคสออกทั้งหมด")
 *
 *   npx tsx scripts/case-templates-delete-all.mts            # dry-run + เขียน backup JSON
 *   npx tsx scripts/case-templates-delete-all.mts --write    # ลบจริง (แถวชุด + ไฟล์ใน storage แบบเดียวกับ DELETE /api/admin/templates) + แก้สินค้า
 *
 * เป้าหมาย = ชุดหมวด "เคสมือถือ" (tpl-case-* / ชุด iPhone 7–16 · 30 ชุด) + หมวด "Frame PhoneCase" (tpl-cfc-* · 18 ชุด)
 *   รวมชุดใด ๆ ที่ 3 สินค้าเคสผูกอยู่ (templateIds) · ด่าน: ห้ามมีสินค้าอื่นผูกชุดที่จะลบ
 * สินค้า case-premium-clear / case-premium-edge / case-frame-card → templateIds = [] · ลบ calendarStudio · studioOff = true
 *   (ถ้าปล่อย calendarStudio {formats:[]} ไว้โดยไม่มีเทมเพลต หน้าสินค้าจะตกไปใช้รูปแบบ "card" 5.5×8.5 ซม. ผิดงาน)
 * ไฟล์ต้นฉบับ .ai ยังอยู่บน NAS (/Volumes/iDuckyShop/All Template/3. Case เคส/) · backup แถวที่ลบ + สินค้าก่อนแก้ อยู่ที่ BACKUP_DIR
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const BACKUP_DIR = process.env.BACKUP_DIR ?? "backups/case-templates-delete-2026-10-16";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const BUCKET = "design-templates";
const CATEGORIES = new Set(["เคสมือถือ", "Frame PhoneCase"]);
const PRODUCT_IDS = ["case-premium-clear", "case-premium-edge", "case-frame-card"];

const { data: all, error } = await sb.from("products").select("id,data").eq("category", "__templates__");
if (error) die(error.message);
const tpls = (all ?? []).map((r) => r.data as DesignTemplate).filter((t) => t?.id);

const { data: prods, error: e2 } = await sb.from("products").select("id,data").neq("category", "__templates__");
if (e2) die(e2.message);
const targets = (prods ?? []).filter((p) => PRODUCT_IDS.includes(p.id));
if (targets.length !== PRODUCT_IDS.length) die(`พบสินค้าเป้าหมาย ${targets.length}/${PRODUCT_IDS.length}`);
const linkedByTargets = new Set(targets.flatMap((p) => ((p.data as Product).templateIds ?? [])));

const victims = tpls.filter((t) => CATEGORIES.has(t.category ?? "") || linkedByTargets.has(t.id));
const victimIds = new Set(victims.map((t) => t.id));

// ด่าน: สินค้าอื่นห้ามผูกชุดที่จะลบ
for (const p of prods ?? []) {
  if (PRODUCT_IDS.includes(p.id)) continue;
  const hit = ((p.data as Product).templateIds ?? []).filter((id) => victimIds.has(id));
  if (hit.length) die(`สินค้า ${p.id} ยังผูกชุด ${hit.join(",")} — ปลดก่อน`);
}
for (const t of victims) {
  const extra = !CATEGORIES.has(t.category ?? "") ? " · ⚠️ นอกหมวดเคส (ผูกกับสินค้าเคสอยู่)" : "";
  console.log(`🗑 ${t.id} · ${t.category} · ${t.name} · ${(t.files ?? []).length} ไฟล์${extra}`);
}
const byCat = victims.reduce<Record<string, number>>((m, t) => ((m[t.category ?? "?"] = (m[t.category ?? "?"] ?? 0) + 1), m), {});
console.log(`\nจะลบ ${victims.length} ชุด → ${JSON.stringify(byCat)}`);
for (const p of targets) {
  const d = p.data as Product;
  console.log(`📱 ${p.id}: templateIds ${(d.templateIds ?? []).length} → 0 · calendarStudio ${JSON.stringify(d.calendarStudio ?? null)} → ลบ · studioOff ${d.studioOff ?? "-"} → true`);
}

mkdirSync(BACKUP_DIR, { recursive: true });
writeFileSync(`${BACKUP_DIR}/template-sets.json`, JSON.stringify(victims, null, 1));
writeFileSync(`${BACKUP_DIR}/products-before.json`, JSON.stringify(targets, null, 1));
console.log(`💾 backup → ${BACKUP_DIR}/template-sets.json (${victims.length} ชุด) + products-before.json (${targets.length} สินค้า)`);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อลบจริง)"); process.exit(0); }

// 1) ปลดจากสินค้าก่อน (หน้าสินค้าจะได้ไม่ชี้ชุดที่หายไป)
for (const p of targets) {
  const d = p.data as Product;
  const next: Product = { ...d, templateIds: [], studioOff: true, savedAt: new Date().toISOString() };
  delete next.calendarStudio;
  const { error: ue } = await sb.from("products").update({ data: next }).eq("id", p.id);
  if (ue) die(`${p.id}: ${ue.message}`);
  const { data: chk } = await sb.from("products").select("data").eq("id", p.id).single();
  const c = chk!.data as Product;
  if ((c.templateIds ?? []).length || c.calendarStudio || c.studioOff !== true) die(`${p.id} อ่านกลับมาไม่ตรง`);
  console.log(`   ✅ สินค้า ${p.id} ปลดเทมเพลต + ปิดออกแบบบนเว็บ`);
}
// 2) ลบชุด + ไฟล์ storage
let files = 0;
for (const t of victims) {
  const urls = [...(t.files ?? []).flatMap((f) => [f.fileUrl, f.previewUrl, f.skinUrl]), t.fileUrl, t.previewUrl, t.skinUrl];
  const paths = [...new Set(urls.map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined)).filter(Boolean) as string[])];
  if (paths.length) { const { error: se } = await sb.storage.from(BUCKET).remove(paths); if (se) console.log(`   ⚠️ storage ${t.id}: ${se.message}`); }
  const { error: de } = await sb.from("products").delete().eq("id", `__template_${t.id}`).eq("category", "__templates__");
  if (de) die(`${t.id}: ${de.message}`);
  files += paths.length;
  console.log(`   ✅ ลบ ${t.id} ${t.name} · ไฟล์ storage ${paths.length}`);
}
const { data: left } = await sb.from("products").select("data").eq("category", "__templates__");
const remain = (left ?? []).map((r) => r.data as DesignTemplate).filter((t) => CATEGORIES.has(t?.category ?? ""));
console.log(`\nลบแล้ว ${victims.length} ชุด · ไฟล์ storage ${files} · เหลือชุดหมวดเคส ${remain.length}`);

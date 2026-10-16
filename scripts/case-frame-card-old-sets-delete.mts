/**
 * 🗑 ลบชุดเทมเพลตเก่าหมวด "Frame PhoneCase" ที่ซ้ำกับชุดใหม่ tpl-cfc-* (เจ้าของร้านสั่ง 16 ต.ค. 69)
 *
 *   npx tsx scripts/case-frame-card-old-sets-delete.mts            # dry-run + เขียน backup JSON
 *   npx tsx scripts/case-frame-card-old-sets-delete.mts --write    # ลบจริง (แถวชุด + ไฟล์ใน storage แบบเดียวกับ DELETE /api/admin/templates)
 *
 * เงื่อนไข: หมวด Frame PhoneCase · id ไม่ขึ้นต้น tpl-cfc- · ไม่มีสินค้าไหนผูก (templateIds) · ชื่อ norm ตรงกับชุดใหม่
 * ชุดเก่า 14 ชุด (11–12 ส.ค. 69) = ไฟล์ธรรมดาเวอร์ชันเก่า 1.1 MB ขนาดอ่านเป็นอาร์ตบอร์ด 99.9×179.3 · สำรองไว้ที่ BACKUP_DIR/old-frame-phonecase-sets.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate } from "../src/lib/design-templates";

const WRITE = process.argv.includes("--write");
const BACKUP_DIR = process.env.BACKUP_DIR ?? "backups";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const BUCKET = "design-templates";
const CATEGORY = "Frame PhoneCase";
const norm = (v: string) => v.toLowerCase().replace(/iphone/g, "").replace(/[\s\-_/]/g, "");

const { data: all, error } = await sb.from("products").select("id,data").eq("category", "__templates__");
if (error) die(error.message);
const tpls = (all ?? []).map((r) => r.data as DesignTemplate).filter((t) => t?.category === CATEGORY);
const fresh = tpls.filter((t) => t.id.startsWith("tpl-cfc-"));
const freshNames = new Set(fresh.map((t) => norm(t.name)));
const old = tpls.filter((t) => !t.id.startsWith("tpl-cfc-"));
if (!fresh.length) die("ไม่พบชุดใหม่ tpl-cfc-* — ยังไม่ได้รัน case-frame-card-templates.mts?");

// ด่าน: ไม่มีสินค้าไหนผูกชุดเก่า
const { data: prods, error: e2 } = await sb.from("products").select("id,name,data").neq("category", "__templates__");
if (e2) die(e2.message);
const linked = new Map<string, string[]>();
for (const p of prods ?? []) for (const id of ((p.data as { templateIds?: string[] }).templateIds ?? [])) linked.set(id, [...(linked.get(id) ?? []), p.id]);

const victims = old.filter((t) => {
  const dup = freshNames.has(norm(t.name));
  const used = linked.get(t.id) ?? [];
  console.log(`${dup && !used.length ? "🗑" : "⏭"} ${t.id} · ${t.name} · ${(t.files ?? []).length} ไฟล์ · ${t.savedAt?.slice(0, 10)}${used.length ? ` · ผูกอยู่กับ ${used.join(",")} (ข้าม)` : ""}${dup ? "" : " · ชื่อไม่ซ้ำชุดใหม่ (ข้าม)"}`);
  return dup && !used.length;
});
console.log(`\nชุดเก่าในหมวด ${old.length} · จะลบ ${victims.length} · ชุดใหม่ ${fresh.length}`);
if (victims.length !== 14) console.log(`⚠️ คาดไว้ 14 ชุด แต่พบ ${victims.length}`);

mkdirSync(BACKUP_DIR, { recursive: true });
const bk = `${BACKUP_DIR}/old-frame-phonecase-sets.json`;
writeFileSync(bk, JSON.stringify(victims, null, 1));
console.log(`💾 backup → ${bk}`);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อลบจริง)"); process.exit(0); }

for (const t of victims) {
  const urls = [...(t.files ?? []).flatMap((f) => [f.fileUrl, f.previewUrl, f.skinUrl]), t.fileUrl, t.previewUrl, t.skinUrl];
  const paths = urls.map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined)).filter(Boolean) as string[];
  if (paths.length) { const { error: se } = await sb.storage.from(BUCKET).remove(paths); if (se) console.log(`   ⚠️ storage ${t.id}: ${se.message}`); }
  const { error: de } = await sb.from("products").delete().eq("id", `__template_${t.id}`).eq("category", "__templates__");
  if (de) die(`${t.id}: ${de.message}`);
  console.log(`   ✅ ลบ ${t.id} ${t.name} · ไฟล์ storage ${paths.length}`);
}
const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("category", "__templates__").like("id", "__template_tpl-cfc-%");
console.log(`\nเหลือชุด tpl-cfc-* ${count} ชุด`);

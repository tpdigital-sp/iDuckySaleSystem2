/**
 * 📱🎨 เปิด "ออกแบบบนเว็บ" ให้เคสมือถือ 3 สินค้า (เจ้าของร้านสั่ง 16 ต.ค. 69)
 *
 *   npx tsx scripts/case-design-studio.mts            # ดูผลก่อน
 *   npx tsx scripts/case-design-studio.mts --write    # บันทึก
 *
 * ตั้ง Product.calendarStudio = { yearLabel: "", formats: [] } (ไม่มีปฏิทิน · ไม่กำหนด formats)
 *   → หน้าสินค้าเดาขนาดงานจากอาร์ตบอร์ดของชุดเทมเพลตที่ "ชื่อชุด = รุ่นที่เลือก" (tpl@กว้างxสูง มม.)
 *   แบบเดียวกับ case-magsafe ที่ตั้งไว้แล้ว · ชุดเทมเพลต 22 รุ่น (iPhone 11–16) ใช้ร่วมกันทั้ง 3 สินค้า
 * ปลด studioOff (เดิมหน้า /admin/templates ตั้ง true ให้ตอนผูกชุดแรก) — ไม่แตะราคา/ตัวเลือก/เทมเพลต
 * รันซ้ำได้ · สินค้าที่ตั้งครบแล้ว = ข้าม
 * รุ่นที่ยังไม่มีชุดเทมเพลต (iPhone 17 / Samsung / iPhone 6–X) หน้าสินค้าจะปิดปุ่มออกแบบบนเว็บเฉพาะรุ่นนั้นเอง (tplModelMissing)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";
import type { DesignTemplate } from "../src/lib/design-templates";

const WRITE = process.argv.includes("--write");
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
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};

const IDS = ["case-premium-clear", "case-premium-edge", "case-magsafe"];
const MODEL = "รุ่นมือถือ";
/** ชุดเทมเพลตต้นทาง — สินค้าที่ยังไม่ผูกชุดไหนเลย ยืมชุดเดียวกับ case-magsafe */
const SOURCE = "case-magsafe";

const { data: tplRows } = await sb.from("products").select("data").eq("category", "__templates__");
const tpls = (tplRows ?? []).map((r) => r.data as DesignTemplate);
const norm = (v: string) => v.toLowerCase().replace(/iphone/g, "").replace(/[\s\-_]/g, "");

const { data: src } = await sb.from("products").select("data").eq("id", SOURCE).single();
const srcIds = ((src?.data as Product | undefined)?.templateIds ?? []).filter((id) => tpls.some((t) => t.id === id));
if (!srcIds.length) die(`${SOURCE} ไม่มีชุดเทมเพลต`);

let changed = 0;
for (const id of IDS) {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !data) die(`อ่าน ${id} ไม่ได้: ${error?.message}`);
  const p = data.data as Product;
  const ids = (p.templateIds ?? []).length ? p.templateIds! : srcIds;
  const names = new Set(
    tpls.filter((t) => ids.includes(t.id) && !t.optionLabel?.trim()).flatMap((t) => t.name.split("/").map(norm).filter(Boolean)),
  );
  const models = p.options.find((o) => o.label === MODEL)?.choices.map((c) => c.name) ?? die(`${id} ไม่มีกลุ่ม "${MODEL}"`);
  const missing = models.filter((m) => !names.has(norm(m)));
  const hasStudio = !!p.calendarStudio && !(p.calendarStudio.formats?.length);
  const ok = hasStudio && p.studioOff !== true && (p.templateIds ?? []).length > 0;
  console.log(`\n📱 ${p.name} (${id})`);
  console.log(`   เทมเพลต ${ids.length} ชุด${(p.templateIds ?? []).length ? "" : ` (ยืมจาก ${SOURCE})`} · studioOff=${p.studioOff ?? "-"} · calendarStudio=${JSON.stringify(p.calendarStudio ?? null)}`);
  console.log(`   รุ่นที่มีเทมเพลต ${models.length - missing.length}/${models.length} · ยังไม่มี: ${missing.join(", ") || "-"}`);
  if (ok) {
    console.log("   ✓ ตั้งครบแล้ว — ข้าม");
    continue;
  }
  const next: Product = { ...p, templateIds: ids, calendarStudio: { yearLabel: "", formats: [] }, savedAt: new Date().toISOString() };
  delete next.studioOff;
  changed++;
  if (!WRITE) continue;
  const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", id);
  if (e2) die(e2.message);
  const { data: chk } = await sb.from("products").select("data").eq("id", id).single();
  const c = chk!.data as Product;
  if (!c.calendarStudio || c.studioOff === true || (c.templateIds ?? []).length !== ids.length) die(`${id} อ่านกลับมาไม่ตรง`);
  console.log("   ✅ บันทึกแล้ว");
}
if (!WRITE) console.log(changed ? `\n(dry-run — จะแก้ ${changed} สินค้า · ใส่ --write เพื่อบันทึก)` : "\n(ไม่มีอะไรต้องแก้)");

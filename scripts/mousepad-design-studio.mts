/**
 * 🎨 แผ่นรองเมาส์ใช้จอออกแบบแบบเดียวกับสินค้าปฏิทิน แต่ไม่มีปฏิทิน (14 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/mousepad-design-studio.mts            # ดูผลก่อน
 *   npx tsx scripts/mousepad-design-studio.mts --write    # บันทึก
 *
 * ตั้ง Product.calendarStudio = { yearLabel: "", formats: ขนาด → "pad@<กว้าง>x<สูง>" (มม. งานจริง · แนวนอน) }
 *   จอสร้างเห็นว่าไม่มีตารางปฏิทิน (calHasGrid) → ซ่อนเครื่องมือปฏิทิน/ปี · หน้าสินค้าปุ่ม "ออกแบบบนเว็บ"
 *   เส้นช่วย = เทมเพลต MousePad ที่ผูกไว้อยู่แล้ว (optionLabel ขนาด) · ⚠️ ไม่ตั้ง studioOff
 * ชื่อขนาด "18x21cm" = สั้น×ยาว ซม. → ผืนแนวนอน ยาว×สั้น (เทมเพลตของร้านเป็นแนวนอนทุกไฟล์)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

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

const ID = "mousepad";
const SIZE = "ขนาด";
const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !data) die(`อ่าน ${ID} ไม่ได้: ${error?.message}`);
const p = data!.data as Product;
const sizes = p.options.find((o) => o.label === SIZE)?.choices.map((c) => c.name) ?? die(`ไม่มีกลุ่ม "${SIZE}"`);
const formats = sizes.map((name) => {
  const m = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm/i.exec(name) ?? die(`อ่านขนาด "${name}" ไม่ได้`);
  const a = Number(m[1]) * 10;
  const b = Number(m[2]) * 10;
  return { format: `pad@${Math.max(a, b)}x${Math.min(a, b)}`, when: [{ label: SIZE, choices: [name] }] };
});
if (p.studioOff === true) die("สินค้าตั้ง studioOff — จอออกแบบจะไม่เปิด");
const next: Product = { ...p, calendarStudio: { yearLabel: "", formats }, savedAt: new Date().toISOString() };
console.log(`🎨 ${p.name} (${ID})`);
for (const f of formats) console.log(`   ${f.when[0].choices[0]} → ${f.format}`);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID);
if (e2) die(e2.message);
const { data: chk } = await sb.from("products").select("data").eq("id", ID).single();
if ((chk!.data as Product).calendarStudio?.formats?.length !== formats.length) die("อ่านกลับมาไม่ตรง");
console.log("   ✅ บันทึกแล้ว");

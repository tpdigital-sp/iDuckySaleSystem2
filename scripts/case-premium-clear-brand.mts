/**
 * Case Premium (เคสพรีเมี่ยมใส) — กลุ่ม "ยี่ห้อ" (iPhone / Samsung) เหนือ "รุ่นมือถือ" (ทีมขอ 6 ต.ค. 69)
 *
 * รุ่นมือถือ 57 รุ่นในดรอปดาวน์เดียวยาวเกิน → เลือกยี่ห้อก่อน แล้วกฎ (rules) กรองรุ่นให้เหลือของยี่ห้อนั้น
 * แบบเดียวกับ "ประเภทเคส" ของ case-frame-card · ยี่ห้อไม่มีผลราคา ไม่ใช่แกนตาราง · ไม่แยกสต๊อก (SKU อยู่ที่รุ่น)
 * ชื่อรุ่นคงคำนำหน้า "iPhone …" / "Samsung …" ไว้ — ออเดอร์/ใบงาน/SKU เดิมอ้างชื่อนี้
 * รุ่นที่เพิ่มทีหลัง: ขึ้นต้นด้วยชื่อยี่ห้อ → รันสคริปต์นี้ซ้ำ กฎจะอัปเดตเอง
 *
 *   npx tsx scripts/case-premium-clear-brand.mts          # ดูก่อน
 *   npx tsx scripts/case-premium-clear-brand.mts --write  # เขียนจริง (รันซ้ำได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const WRITE = process.argv.includes("--write");
const ID = "case-premium-clear";
const BRAND = "ยี่ห้อ";
const MODEL = "รุ่นมือถือ";
const BRANDS = ["iPhone", "Samsung"];

const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (error || !row) die(`อ่านสินค้าไม่ได้: ${error?.message}`);
const data = structuredClone(row!.data) as Product;
const models = data.options?.find((o) => o.label === MODEL) ?? die(`ไม่พบกลุ่ม ${MODEL}`);

const byBrand = Object.fromEntries(BRANDS.map((b) => [b, models.choices.map((c) => c.name).filter((n) => n.startsWith(`${b} `))]));
const orphan = models.choices.map((c) => c.name).filter((n) => !BRANDS.some((b) => n.startsWith(`${b} `)));
if (orphan.length) die(`รุ่นที่ไม่ขึ้นต้นด้วยยี่ห้อ: ${orphan.join(", ")}`);
for (const b of BRANDS) console.log(`${b}: ${byBrand[b].length} รุ่น`);

const brandGroup = {
  label: BRAND,
  display: "pills",
  ...(models.section ? { section: models.section } : {}),
  choices: BRANDS.map((name) => ({ name })),
};
const old = data.options!.find((o) => o.label === BRAND);
data.options = data.options!.filter((o) => o.label !== BRAND);
const at = data.options.findIndex((o) => o.label === MODEL);
data.options.splice(at, 0, { ...(old ?? {}), ...brandGroup } as never);

data.rules = [
  ...(data.rules ?? []).filter((r) => r.when?.label !== BRAND),
  ...BRANDS.map((b) => ({ when: { label: BRAND, choice: b, choices: [b] }, limit: { label: MODEL, allow: byBrand[b] } })),
] as never;

console.log("กลุ่ม:", data.options.map((o) => o.label).join(" → "));
if (!WRITE) { console.log("(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }

const out = { ...data, savedAt: Date.now() };
const { data: upd, error: e2 } = await sb.from("products").update({ data: out }).eq("id", ID).select("data");
if (e2 || upd?.length !== 1) die(`เขียนไม่ลง: ${e2?.message ?? `${upd?.length} แถว`}`);
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back!.data as Product;
const ok = b.options?.some((o) => o.label === BRAND) && BRANDS.every((x) => b.rules?.some((r) => r.when?.label === BRAND && r.when.choice === x));
if (!ok) die("อ่านกลับแล้วไม่มีกลุ่ม/กฎยี่ห้อ");
console.log("✓ เขียนแล้ว");
process.exit(0);

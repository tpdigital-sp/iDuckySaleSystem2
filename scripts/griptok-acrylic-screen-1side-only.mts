/**
 * Griptok อะคริลิค (id 1-4): งานสกรีนเหลือแค่ 1 ด้าน (ใต้/บน) — ถอด 2 ด้าน + 3 เลเยอร์ (9 ต.ค. 69)
 * ถอดตัวเลือก + ช่องราคาทุกเรท + กฎเนื้อทึบ + ข้อความ description/FAQ/แท็บ · เก็บ revision ก่อนเขียน
 * dry-run เป็นค่าเริ่ม · --write = บันทึกจริง · รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string) => { console.error("✗", m); process.exit(1); };

const ID = "1-4";
const DROP = ["สกรีน 2 ด้าน (ใต้-บน)", "สกรีน 2 ด้าน (บน-บน)", "สกรีน 3 เลเยอร์"];

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const before = row!.data;
const d = structuredClone(before);

const opt = d.options.find((o: any) => o.label === "งานสกรีน");
if (!opt) die("ไม่พบกลุ่ม งานสกรีน");
opt.choices = opt.choices.filter((c: any) => !DROP.includes(c.name));

const dropCells = (pr: any) => {
  if (!pr?.cells) return 0;
  let n = 0;
  for (const k of Object.keys(pr.cells)) if (k.split("│").some((p) => DROP.includes(p))) { delete pr.cells[k]; n++; }
  return n;
};
console.log("ช่องราคา pricing:", dropCells(d.pricing));
for (const r of d.priceRates ?? []) console.log("ช่องราคา", r.id, dropCells(r.pricing));

for (const r of d.rules ?? []) if (r.limit?.label === "งานสกรีน") r.limit.allow = r.limit.allow.filter((a: string) => !DROP.includes(a));

d.description = d.description.replace("สกรีน 1-2 ด้าน", "สกรีน 1 ด้าน (ใต้/บน)");
for (const f of d.seo?.faqs ?? []) f.a = f.a.replace(/, สกรีน 2 ด้าน \(ใต้-บน\), สกรีน 2 ด้าน \(บน-บน\), สกรีน 3 เลเยอร์/, "");
for (const t of d.tabs ?? []) if (t.text) t.text = t.text.replace(
  /เทียบให้เห็นครบทุกแบบ \(สกรีนใต้\/บน · 2 ด้าน ใต้-บน\/บน-บน · 3 เลเยอร์\) · ช่อง 4 เลเยอร์ในแผ่นทำได้เฉพาะงานประกบอะคริลิค 2 ชิ้น สินค้านี้จึงไม่มีให้เลือก/,
  "สินค้านี้สกรีนได้ 1 ด้าน (ใต้ หรือ บน) เท่านั้น — แบบ 2 ด้าน / 3-4 เลเยอร์ในแผ่นไม่มีให้เลือก"
);

const left = JSON.stringify(d).match(/สกรีน 2 ด้าน|สกรีน 3 เลเยอร์|3 เลเยอร์\)/g);
if (left) die("ยังเหลือคำที่ต้องถอด: " + left.length + " จุด");

const range = priceRange(d);
d.priceMin = range.min; d.priceMax = range.max; d.savedAt = new Date().toISOString();
console.log("ตัวเลือกสกรีน:", opt.choices.map((c: any) => c.name).join(" | "));
console.log("กฎ:", JSON.stringify(d.rules.filter((r: any) => r.limit?.label === "งานสกรีน").map((r: any) => r.limit.allow)));
console.log("ช่วงราคา", before.priceMin, before.priceMax, "→", range.min, range.max);

if (!WRITE) { console.log("(dry-run) ใส่ --write เพื่อบันทึก"); process.exit(0); }

const rev = await sb.from("product_revisions").insert({ product_id: ID, data: before, action: "save", editor: "script:griptok-acrylic-screen-1side-only" });
if (rev.error) console.warn("เก็บ revision ไม่สำเร็จ:", rev.error.message);
const up = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (up.data?.length !== 1) die("อัปเดต " + up.data?.length + " แถว");
const back = (await sb.from("products").select("data").eq("id", ID).single()).data!.data;
if (back.savedAt !== d.savedAt || JSON.stringify(back).includes("สกรีน 3 เลเยอร์")) die("อ่านกลับไม่ตรง — รันซ้ำ");
console.log("✓ เขียนแล้ว");

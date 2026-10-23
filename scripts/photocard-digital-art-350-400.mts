/**
 * Photo card Digital (photocard-digital) — เพิ่มเรท "กระดาษอาร์ตมัน 350 แกรม" + "400 แกรม"
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มกระดาษอาร์ตมัน 350 400 แกรม ให้หน่อย")
 *
 *   npx tsx scripts/photocard-digital-art-350-400.mts           # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-digital-art-350-400.mts --write
 *
 * ราคา: ตามกติการ้าน (paper-foil / paper-art-pet) 350 แกรม +5 · 400 แกรม +10 ต่อแผ่น A3
 *   1 เซ็ต (20 ใบ) = 1 แผ่น A3 → บวกทุกขั้นของเรท 300 แกรม (ทั้งปลีก + ตัวแทน) อ่านสดจาก DB
 * ทำได้ทุกอย่างเหมือน 300 แกรม: ทุกที่ที่อ้าง "กระดาษอาร์ตมัน 300 แกรม" ใน showWhen / rules ได้ 350/400 ต่อท้าย
 * รันซ้ำได้ (ถ้ามีเรทอยู่แล้ว = อัปเดตราคาตาม 300 ใหม่)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "photocard-digital";
const P300 = "กระดาษอาร์ตมัน 300 แกรม";
const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/paper-foil";
const ADD = [
  { gsm: 350, fee: 5, desc: "หนาขึ้น อยู่ทรง ไม่งอ · กระดาษนำเข้าจากเกาหลี · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง)" },
  { gsm: 400, fee: 10, desc: "หนาที่สุด แข็งแรงแบบการ์ดสะสม · กระดาษนำเข้าจากเกาหลี · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง)" },
];
const NEW = ADD.map((a) => `กระดาษอาร์ตมัน ${a.gsm} แกรม`);

const { data: row, error } = await sb.from("products").select("*").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);
if (!WRITE) writeFileSync(`.cache/backup-${ID}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(row, null, 1));

type Rate = { id: string; label: string; desc?: string; imageSrc?: string; dealerOnly?: boolean; pricing: { cells: Record<string, number[]> } };
const rates: Rate[] = d.priceRates;
const base = rates.find((r) => r.label === P300 && !r.dealerOnly);
const baseDealer = rates.find((r) => r.label === `${P300} (ตัวแทน)` && r.dealerOnly);
if (!base || !baseDealer) throw new Error("ไม่พบเรท 300 แกรม (ปลีก/ตัวแทน)");

const bump = (src: Rate, fee: number) => {
  const p = structuredClone(src.pricing);
  for (const k of Object.keys(p.cells)) p.cells[k] = p.cells[k].map((v) => v + fee);
  return p;
};
const upsert = (r: Rate, after: string) => {
  const i = rates.findIndex((x) => x.id === r.id);
  if (i >= 0) rates[i] = r;
  else rates.splice(rates.findIndex((x) => x.id === after) + 1, 0, r);
};
let prev = base.id, prevDealer = baseDealer.id;
for (const a of ADD) {
  const label = `กระดาษอาร์ตมัน ${a.gsm} แกรม`;
  const img = `${IMG}/gram-${a.gsm}.jpg`;
  upsert({ id: `art-${a.gsm}`, label, desc: a.desc, imageSrc: img, pricing: bump(base, a.fee) }, prev);
  upsert({ id: `art-${a.gsm}-dealer`, label: `${label} (ตัวแทน)`, desc: "ราคาตัวแทนจำหน่าย", imageSrc: img, dealerOnly: true, pricing: bump(baseDealer, a.fee) }, prevDealer);
  prev = `art-${a.gsm}`; prevDealer = `art-${a.gsm}-dealer`;
}

// ทุก choices ที่อ้างเรท 300 แกรม → เติม 350/400 ต่อท้าย
const addTo = (arr: string[] | undefined) => {
  if (!arr?.includes(P300)) return 0;
  const i = arr.indexOf(P300);
  const miss = NEW.filter((n) => !arr.includes(n));
  arr.splice(i + 1, 0, ...miss);
  return miss.length;
};
let touched = 0;
for (const g of d.options) {
  for (const k of ["showWhen", "showWhenAlso"]) if (g[k]?.label === "เรทราคา") touched += addTo(g[k].choices);
}
for (const r of d.rules) if (r.when?.label === "เรทราคา") touched += addTo(r.when.choices);

const txt = (s: string) => s
  .replace("เฉพาะกระดาษอาร์ตมัน 300 แกรม (เนื้อพิเศษ", "เฉพาะกระดาษอาร์ตมัน 300/350/400 แกรม (เนื้อพิเศษ")
  .replace("บนอาร์ตมัน 300 แกรม ·", "บนอาร์ตมัน 300/350/400 แกรม ·")
  .replace("3 แบบ — อาร์ตมัน 300 แกรม / กระดาษเนื้อพิเศษ", "3 กลุ่ม — อาร์ตมัน 300 / 350 / 400 แกรม / กระดาษเนื้อพิเศษ")
  .replace("(เฉพาะกระดาษอาร์ตมัน 300 แกรม)", "(เฉพาะกระดาษอาร์ตมัน 300 / 350 / 400 แกรม)")
  .replace("งานพิมพ์ 2 ด้าน (กระดาษอาร์ตมัน 300 แกรม)", "งานพิมพ์ 2 ด้าน (กระดาษอาร์ตมัน 300 / 350 / 400 แกรม)");
for (const g of d.options) if (g.note) g.note = txt(g.note);
for (const t of d.tabs ?? []) if (t.text) t.text = txt(t.text);
d.highlights = d.highlights.map(txt);
d.priceMax = Math.max(...rates.filter((r) => !r.dealerOnly).flatMap((r) => Object.values(r.pricing.cells).flat()));

console.log("เรท:", rates.map((r) => `${r.label} ${JSON.stringify(r.pricing.cells[""])}`).join("\n     "));
console.log("เติมชื่อเรทใน showWhen/rules:", touched, "ที่");
console.log("highlights:", d.highlights);
if (!WRITE) { console.log("\n(ดูอย่างเดียว · ใส่ --write เพื่อบันทึก)"); process.exit(0); }
const { error: e2 } = await sb.from("products").update({ data: { ...d, savedAt: new Date().toISOString() } }).eq("id", ID);
if (e2) throw e2;
console.log("✓ บันทึกแล้ว");
await revalidateLive(env, { productIds: [ID] });

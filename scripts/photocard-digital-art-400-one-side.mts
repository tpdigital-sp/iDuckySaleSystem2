/**
 * Photo card Digital — กระดาษอาร์ตมัน 400 แกรม พิมพ์ได้ 1 ด้านเท่านั้น
 * (เจ้าของร้านแจ้ง 23 ต.ค. 69 "400 แกรม มันสกรีน 2 ด้านไม่ได้" · ต่อจาก photocard-digital-art-350-400.mts)
 *
 *   npx tsx scripts/photocard-digital-art-400-one-side.mts           # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-digital-art-400-one-side.mts --write
 *
 * กฎ: เรทราคา = 400 แกรม → พิมพ์กี่ด้าน ล็อก "พิมพ์ 1 ด้าน" (เรทตัวแทนแฝดเข้ากฎเองผ่าน publicRateLabelOf)
 *   ฟอยล์ด้านหลัง/เคลือบด้านหลัง ซ่อนเองเพราะผูก showWhen พิมพ์ 2 ด้าน · แก้ข้อความที่บอกว่า 400 ทำ 2 ด้านได้
 * รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "photocard-digital";
const P400 = "กระดาษอาร์ตมัน 400 แกรม";
const SIDES = "พิมพ์กี่ด้าน";
const ONE = "พิมพ์ 1 ด้าน";

const { data: row, error } = await sb.from("products").select("*").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);

const sides = d.options.find((g: { label: string }) => g.label === SIDES);
if (!sides?.choices.some((c: { name: string }) => c.name === ONE)) throw new Error(`ไม่พบ ${SIDES} / ${ONE}`);

type Rule = { when: { label: string; choice: string; choices: string[] }; limit: { label: string; allow: string[] } };
const rules: Rule[] = d.rules;
const has = rules.some((r) => r.when.label === "เรทราคา" && r.when.choices.includes(P400) && r.limit.label === SIDES);
if (!has) rules.push({ when: { label: "เรทราคา", choice: P400, choices: [P400] }, limit: { label: SIDES, allow: [ONE] } });

for (const r of d.priceRates) if (r.id === "art-400") r.desc = "หนาที่สุด แข็งแรงแบบการ์ดสะสม · พิมพ์ได้ 1 ด้านเท่านั้น · กระดาษนำเข้าจากเกาหลี · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน";

const txt = (s: string) => s
  .replace("เฉพาะพิมพ์ 2 ด้าน บนอาร์ตมัน 300/350/400 แกรม", "เฉพาะพิมพ์ 2 ด้าน บนอาร์ตมัน 300/350 แกรม")
  .replace("งานพิมพ์ 2 ด้าน (กระดาษอาร์ตมัน 300 / 350 / 400 แกรม)", "งานพิมพ์ 2 ด้าน (กระดาษอาร์ตมัน 300 / 350 แกรม · 400 แกรม พิมพ์ได้ 1 ด้าน)");
for (const g of d.options) if (g.note) g.note = txt(g.note);
for (const t of d.tabs ?? []) if (t.text) t.text = txt(t.text);
if (!sides.note?.includes("400")) sides.note = [sides.note, "กระดาษอาร์ตมัน 400 แกรม พิมพ์ได้ 1 ด้านเท่านั้น"].filter(Boolean).join(" · ");

console.log("กฎใหม่:", has ? "(มีอยู่แล้ว)" : `${P400} → ${SIDES} = ${ONE}`);
console.log("note พิมพ์กี่ด้าน:", sides.note);
if (!WRITE) { console.log("\n(ดูอย่างเดียว · ใส่ --write เพื่อบันทึก)"); process.exit(0); }
const { error: e2 } = await sb.from("products").update({ data: { ...d, savedAt: new Date().toISOString() } }).eq("id", ID);
if (e2) throw e2;
console.log("✓ บันทึกแล้ว");
await revalidateLive(env, { productIds: [ID] });

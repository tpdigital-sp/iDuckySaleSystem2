/**
 * Photo card Digital (photocard-digital) — ถอด Add On "พิมพ์รองสีเงิน" ออก (ร้านสั่ง 24 ส.ค. 69)
 *
 *   npx tsx scripts/photocard-drop-silver-base.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-drop-silver-base.mts --write
 *
 * เหลือเฉพาะ "พิมพ์รองสีขาว +20" ซึ่งมีเฉพาะกระดาษเนื้อพิเศษ / PET (ตามตารางราคาเว็บ)
 *   → กลุ่มนี้เลยผูก showWhen ไว้กับ 2 เรทนั้น · งานอาร์ตมันไม่ต้องถามอีกต่อไป
 *   → กฎเดิม "อาร์ตมัน → เหลือแต่พิมพ์รองสีเงิน" ไม่มีความหมายแล้ว ถอดทิ้ง
 * ข้อความที่พูดถึงสีเงินบนหน้าสินค้าแก้ตามด้วย (ไม่งั้นลูกค้าอ่านเจอของที่กดสั่งไม่ได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const BASE = "พิมพ์รองพื้น (Add On)";
const SILVER = "พิมพ์รองสีเงิน";
const WHITE = "พิมพ์รองสีขาว";
const RATE_SPECIAL = "กระดาษเนื้อพิเศษ";
const RATE_PET = "พลาสติก PET 250 ไมครอน";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !row) throw new Error(`หาสินค้า ${ID} ไม่เจอ: ${error?.message}`);
const d = row.data as Product;

const base = d.options.find((o) => o.label === BASE);
if (!base) throw new Error(`ไม่เจอกลุ่ม "${BASE}"`);
if (!base.choices.some((c) => c.name === WHITE)) throw new Error(`ไม่เจอตัวเลือก "${WHITE}" — ตรวจก่อน`);

base.choices = base.choices.filter((c) => c.name !== SILVER);
base.showWhen = { label: "เรทราคา", choices: [RATE_SPECIAL, RATE_PET] };
base.note = "มีเฉพาะกระดาษเนื้อพิเศษ / PET · ไม่ต้องพิมพ์รองพื้น = ไม่ต้องติ๊ก";
d.rules = (d.rules ?? []).filter((r) => r.limit.label !== BASE);

/** แก้ข้อความแบบต้องเจอจริง — เจอไม่ครบให้หยุด ไม่ใช่เขียนทับเงียบ ๆ */
const swap = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 45)}…"`);
    out = out.split(from).join(to);
  }
  return out;
};

d.description = swap(d.description ?? "", [
  ["เคลือบฟอยล์ และพิมพ์รองสีเงิน/สีขาว", "เคลือบฟอยล์ และพิมพ์รองสีขาว"],
]);
d.terms = swap(d.terms ?? "", [
  [
    "งานพิมพ์รองสีเงิน/สีขาว จัดส่งทุกวันศุกร์ — สีพิเศษใส่เครื่องได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ",
    "งานพิมพ์รองสีขาว จัดส่งทุกวันศุกร์ — สีขาวเป็นสีพิเศษ ใส่เครื่องได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ",
  ],
]);
for (const t of d.tabs ?? []) {
  if (!t.text?.includes("Add On งานพิมพ์สีเงิน")) continue;
  t.text = swap(t.text, [
    ["Add On งานพิมพ์สีเงิน | สีขาว::", "Add On งานพิมพ์รองสีขาว::"],
    ["• พิมพ์รองสีเงิน บวกเพิ่ม 20 บาท/แผ่น\n", ""],
    [
      "• งานพิมพ์รองสีเงิน รอบจัดส่งทุกวันศุกร์ — สีเงินเป็นสีพิเศษ เครื่องพิมพ์ใส่สีพิเศษได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ",
      "• งานพิมพ์รองสีขาว รอบจัดส่งทุกวันศุกร์ — สีขาวเป็นสีพิเศษ เครื่องพิมพ์ใส่สีพิเศษได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ",
    ],
  ]);
}

const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log(
  `== ${base.label}${base.display ? ` (${base.display})` : ""} [แสดงเมื่อ ${base.showWhen.label} = ${base.showWhen.choices.join(" / ")}]`
);
for (const c of base.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "");
console.log("\nกฎเงื่อนไขที่เหลือ:");
for (const r of saved.rules ?? [])
  console.log(`   • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join(" / ")} → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
console.log("\nที่ยังพูดถึง 'สีเงิน' ในข้อความ:");
for (const [k, v] of [["description", saved.description], ["terms", saved.terms], ...(saved.tabs ?? []).map((t, i) => [`tab${i}`, t.text] as [string, string])] as [string, string][])
  for (const line of (v ?? "").split("\n")) if (line.includes("สีเงิน")) console.log(`   [${k}]`, line);
console.log("\nช่วงราคา:", range);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");

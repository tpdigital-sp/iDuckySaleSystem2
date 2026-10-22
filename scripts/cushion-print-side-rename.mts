/**
 * ✏️🛋 หมอนอิงยัดใย (`cushion`) เปลี่ยนชื่อค่าในกลุ่ม "พิมพ์ลาย" (เจ้าของร้านสั่ง 22 ต.ค. 69 จากภาพหน้าสินค้า)
 *   "ด้านเดียว / ด้านหลังสีขาว" → "พิมพ์ 1 ด้าน / ด้านหลังสีขาว"
 *   "สองด้าน เพิ่ม"              → "พิมพ์ 2 ด้าน"
 *
 *   npx tsx scripts/cushion-print-side-rename.mts            # ดูผล
 *   npx tsx scripts/cushion-print-side-rename.mts --write    # บันทึก + ล้างแคชเว็บจริง
 *
 * ชื่อค่าถูกอ้างหลายที่ — ลากตามให้ครบ ไม่งั้นเทมเพลต/จอ 2 หน้าหลุด (กับดักเดียวกับ [[iducky-preset-rename-retarget]]):
 *   · product.options[พิมพ์ลาย].choices[].name + note ("เลือก \"สองด้าน\"" → "พิมพ์ 2 ด้าน")
 *   · product.calendarStudio.formats[].when[].choices (tpl2 เมื่อพิมพ์ 2 ด้าน) + showWhen ของกลุ่มอื่น (ถ้ามี)
 *   · ชุดเทมเพลตหมวด "หมอนอิง(ยัดใย)" file.when[].choices (1ด้าน/2ด้าน)
 *   วิธี: เดินทั้ง JSON แทนสตริงที่ "เท่ากันเป๊ะ" กับชื่อเดิม (ชื่อค่าโผล่เป็น string เดี่ยวในทุกที่ข้างบน) + note แทนเฉพาะคำ
 *   ไม่แตะออเดอร์เก่า (7 ใบ ณ 22 ต.ค. 69 ยังเก็บชื่อเดิม — แสดงข้อความเดิมได้ตามปกติ) · ภาพตัวเลือกทำใหม่ด้วย cushion-print-side-art.mjs (v2)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "cushion";
const GROUP = "พิมพ์ลาย";
const CATEGORY = "หมอนอิง(ยัดใย)";
const MAP: Record<string, string> = {
  "ด้านเดียว / ด้านหลังสีขาว": "พิมพ์ 1 ด้าน / ด้านหลังสีขาว",
  "สองด้าน เพิ่ม": "พิมพ์ 2 ด้าน",
};
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
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

/** แทนสตริงที่เท่ากับชื่อเดิมทุกที่ใน JSON · คืน [ค่าใหม่, จำนวนที่แทน, เส้นทางที่แทน] */
function deepRename<T>(v: T, path = "", hits: string[] = []): [T, string[]] {
  if (typeof v === "string") {
    if (MAP[v] !== undefined) {
      hits.push(`${path} "${v}" → "${MAP[v]}"`);
      return [MAP[v] as unknown as T, hits];
    }
    return [v, hits];
  }
  if (Array.isArray(v)) return [v.map((x, i) => deepRename(x, `${path}[${i}]`, hits)[0]) as unknown as T, hits];
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = deepRename(x, path ? `${path}.${k}` : k, hits)[0];
    return [out as T, hits];
  }
  return [v, hits];
}

/* ── สินค้า ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const grp = product.options.find((o) => o.label === GROUP) ?? die(`สินค้าไม่มีกลุ่ม "${GROUP}"`);
const names = grp.choices.map((c) => c.name);
const already = Object.values(MAP).every((n) => names.includes(n));
if (!already) for (const old of Object.keys(MAP)) if (!names.includes(old)) die(`กลุ่ม "${GROUP}" ไม่มีค่า "${old}" (มี: ${names.join(" · ")})`);
const [nextProduct, phits] = deepRename(product);
const note = grp.note ?? "";
const nextNote = note.replace('เลือก "สองด้าน"', 'เลือก "พิมพ์ 2 ด้าน"');
if (nextNote !== note) {
  const g = nextProduct.options.find((o) => o.label === GROUP)!;
  g.note = nextNote;
  phits.push(`options[${GROUP}].note: "${note}" → "${nextNote}"`);
}
console.log(`✏️ ${product.name} (${PRODUCT}) — ${phits.length} จุด`);
for (const h of phits) console.log("   " + h);

/* ── ชุดเทมเพลต ── */
type Row = { id: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY);
const tplPlan = sets.map((r) => {
  const [next, hits] = deepRename(r.data);
  return { row: r, next, hits };
}).filter((p) => p.hits.length);
console.log(`📐 หมวด "${CATEGORY}" ${sets.length} ชุด — แก้ ${tplPlan.length} ชุด`);
for (const p of tplPlan) console.log(`   ${p.row.data.name}: ${p.hits.map((h) => h.replace(/^files\[0\]\./, "")).join(" · ")}`);

if (!phits.length && !tplPlan.length) {
  console.log("✅ เปลี่ยนครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
if (phits.length) {
  const { error } = await sb.from("products").update({ data: { ...nextProduct, savedAt: new Date().toISOString() } }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า: ${error.message}`);
  console.log(`   ✅ สินค้า ${product.name}`);
}
for (const p of tplPlan) {
  const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
  console.log(`   ✅ ชุด ${p.row.data.name}`);
}
await revalidateLive(env, { productIds: [PRODUCT], templateIds: tplPlan.map((p) => p.row.data.id) });

/**
 * เพิ่มตัวเลือก "สีขาว" ในกลุ่ม "สีหมวก" ของหมวกแก๊ป (new-mt2omp9n-3490)
 * เจ้าของร้านสั่ง 16 ก.ย. 69 จากภาพหน้าสินค้าตอนเลือก "ผ้า poly cotton"
 *
 * กลุ่มนี้ถูกกฎ rules.limit (ชนิดหมวก → สีที่ทำได้) ครอบทุกเส้นทาง
 * เติมแต่ choice ลูกค้าจะไม่เห็น ต้องเติมชื่อเข้า allow ของกฎด้วย (ดู memory iducky-rule-allow-new-choice)
 *
 * รันดูก่อน: node scripts/hat-cap-add-white.mjs
 * เขียนจริง: node scripts/hat-cap-add-white.mjs --write
 * ให้ผ้าลูกฟูกมีสีขาวด้วย: เพิ่ม --fabric=all (ค่าเริ่มต้น = เฉพาะ "ผ้า poly cotton")
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WRITE = process.argv.includes("--write");
const FABRIC_ALL = process.argv.includes("--fabric=all");
const ID = "new-mt2omp9n-3490";
const GROUP = "สีหมวก";
const NEW = "สีขาว";
const FABRICS = FABRIC_ALL ? ["ผ้าลูกฟูก", "ผ้า poly cotton"] : ["ผ้า poly cotton"];

const { data: row, error } = await sb.from("products").select("data,name").eq("id", ID).single();
if (error) {
  console.log(`❌ ${ID}: ${error.message}`);
  process.exit(1);
}
const d = row.data;
const groups = (d.options ?? []).filter((o) => o.label === GROUP);
if (groups.length !== 1) {
  console.log(`❌ กลุ่ม "${GROUP}" มี ${groups.length} กลุ่ม (ต้องมี 1)`);
  process.exit(1);
}

let touched = 0;
const options = (d.options ?? []).map((o) => {
  if (o.label !== GROUP) return o;
  if ((o.choices ?? []).some((c) => c.name === NEW)) return o;
  touched++;
  return { ...o, choices: [...(o.choices ?? []), { name: NEW }] };
});
const rules = (d.rules ?? []).map((r) => {
  if (r.limit?.label !== GROUP) return r;
  const fabric = r.when?.choice ?? r.when?.choices?.[0];
  if (!FABRICS.includes(fabric)) return r;
  if ((r.limit.allow ?? []).includes(NEW)) return r;
  touched++;
  return { ...r, limit: { ...r.limit, allow: [...(r.limit.allow ?? []), NEW] } };
});

console.log(`=== ${ID} · ${row.name}`);
const g = options.find((o) => o.label === GROUP);
console.log(`   ตัวเลือก ${GROUP}: ${g.choices.map((c) => c.name).join(" · ")}`);
for (const r of rules)
  if (r.limit?.label === GROUP)
    console.log(`   กฎ ${r.when.choice} → ${r.limit.allow.join(" · ")}`);

if (!touched) {
  console.log("   (มีสีขาวครบอยู่แล้ว ไม่ต้องแก้)");
  process.exit(0);
}
if (!WRITE) {
  console.log(`   [dry-run] จะแก้ ${touched} จุด — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}

const savedAt = new Date().toISOString();
const next = { ...d, options, rules, savedAt };
const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", ID);
if (upErr) {
  console.log(`   ❌ เขียนไม่สำเร็จ: ${upErr.message}`);
  process.exit(1);
}
// อ่านกลับมาเทียบ — update() เคยตอบไม่ error ทั้งที่ค่าไม่ลง
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
const okChoice = bg.choices.some((c) => c.name === NEW);
const okRules = FABRICS.every((f) =>
  back.data.rules.some((r) => r.limit?.label === GROUP && r.when?.choice === f && r.limit.allow.includes(NEW))
);
if (!okChoice || !okRules || back.data.savedAt !== savedAt) {
  console.log(`   ❌ อ่านกลับมาไม่ตรง (choice ${okChoice} · rules ${okRules} · savedAt ${back.data.savedAt})`);
  process.exit(1);
}
console.log(`   ✅ เพิ่ม "${NEW}" แล้ว (${touched} จุด · ${FABRICS.join(", ")})`);

// แผ่นอะคริลิค (acrylic-sheet) — กลุ่ม "รับตะขอไหม" เหลือแค่ "ไม่รับตะขอ" (เจ้าของร้านสั่ง 16 ก.ย. 69 "ภาพที่ 1 ให้มีแค่เฉพาะ ไม่รับตะขอ")
// สินค้านี้ทำซ้ำมาจากพวงกุญแจอะคริลิค (32f74cc) จึงติดกลุ่มตะขอ/สีตะขอมา 14 กลุ่ม + rules ค้าง 4 ข้อ ที่ไม่มีทางโชว์เมื่อไม่มี "รับตะขอ" → ตัดทิ้งพร้อมกัน
// ใช้: node scripts/acrylic-sheet-no-hook.mjs [--apply]   (รันซ้ำได้ · สำรอง data เดิมที่ .cache/acrylic-sheet-ai/backup-data-<เวลา>.json ก่อนเขียน)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const die = (m) => { console.error("✗", m); process.exit(1); };
const ID = "acrylic-sheet", EXPECT = "แผ่นอะคริลิค", GROUP = "รับตะขอไหม", KEEP = "ไม่รับตะขอ";

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT) die(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT}"`);
const d = row.data;
const options = Array.isArray(d.options) ? d.options : [];
const gi = options.findIndex((o) => o.label === GROUP);
if (gi < 0) die(`ไม่พบกลุ่ม "${GROUP}"`);
const g = options[gi];
const keepChoice = g.choices.find((c) => c.name === KEEP);
if (!keepChoice) die(`กลุ่ม "${GROUP}" ไม่มีตัวเลือก "${KEEP}"`);

// 1) กลุ่มที่พึ่งพา "รับตะขอไหม" ผ่าน showWhen/showWhenAlso เป็นทอด ๆ = ไม่มีทางโชว์อีกแล้ว
const dead = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const o of options) {
    if (o.label === GROUP || dead.has(o.label)) continue;
    const deps = [o.showWhen, ...(Array.isArray(o.showWhenAlso) ? o.showWhenAlso : o.showWhenAlso ? [o.showWhenAlso] : [])].filter(Boolean).map((w) => w.label);
    if (deps.some((l) => l === GROUP || dead.has(l))) { dead.add(o.label); grew = true; }
  }
}
const nextOptions = options.filter((o) => !dead.has(o.label)).map((o) => o.label !== GROUP ? o : { ...o, choices: [{ ...keepChoice, desc: "ได้เฉพาะชิ้นอะคริลิคเจาะรู ไม่รวมตะขอ" }] });
const alive = new Set(nextOptions.map((o) => o.label));
// 2) rules ที่ชี้กลุ่มที่ไม่มีอยู่ (ทั้งที่ตัดรอบนี้ และที่ค้างมาจากตอนก๊อป เช่น "ตะขอ E ")
const rules = Array.isArray(d.rules) ? d.rules : [];
const deadRules = rules.filter((r) => !alive.has(r?.when?.label) || !alive.has(r?.limit?.label));
const nextRules = rules.filter((r) => !deadRules.includes(r));

console.log(`# ${row.name} · กลุ่มทั้งหมด ${options.length} → ${nextOptions.length}`);
console.log(`  "${GROUP}": ${g.choices.map((c) => c.name).join(" / ")} → ${KEEP}`);
console.log(`  ตัดกลุ่มที่ไม่มีทางโชว์ ${dead.size} กลุ่ม: ${[...dead].join(" · ")}`);
console.log(`  ตัด rules ค้าง ${deadRules.length} ข้อ: ${deadRules.map((r) => `${r.when?.label?.trim()}→${r.limit?.label}`).join(" · ")}`);
const already = g.choices.length === 1 && dead.size === 0 && deadRules.length === 0;
if (already) { console.log("✓ ทำไปแล้ว ไม่มีอะไรต้องเขียน"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }

mkdirSync(".cache/acrylic-sheet-ai", { recursive: true });
const bk = `.cache/acrylic-sheet-ai/backup-data-${Date.now()}.json`;
writeFileSync(bk, JSON.stringify(d, null, 1));
console.log("  💾 สำรองเดิม →", bk);
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options: nextOptions, rules: nextRules, savedAt } }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bg = (b.options ?? []).find((o) => o.label === GROUP);
const ok = b.savedAt === savedAt
  && (b.options ?? []).length === nextOptions.length
  && bg && bg.choices.length === 1 && bg.choices[0].name === KEEP && typeof bg.choices[0].imageSrc === "string" && bg.choices[0].imageSrc.startsWith("https://")
  && !(b.options ?? []).some((o) => dead.has(o.label))
  && (b.rules ?? []).length === nextRules.length;
if (!ok) die(`อ่านกลับไม่ตรง: groups=${(b.options ?? []).length} rules=${(b.rules ?? []).length} savedAt=${b.savedAt}`);
console.log(`✓ เขียนแล้ว · กลุ่ม ${b.options.length} · rules ${b.rules.length} · savedAt ${savedAt}`);

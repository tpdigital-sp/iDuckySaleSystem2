// แผ่นอะคริลิค (acrylic-sheet) — เพิ่มกลุ่ม "งานเคลือบนูน (เรซิ่น)" เคลือบนูนบวกชิ้นละ ฿40 (เจ้าของร้านสั่ง 18 ก.ย. 69)
// แบบเดียวกับกริ๊บต๊อกอะคริลิค (1-4): กลุ่ม dropdown 2 ตัวเลือก · ค่าเริ่มต้น = ไม่เคลือบนูน · extra ต่อชิ้น
// ใช้: node scripts/acrylic-sheet-resin-coat.mjs [--apply]   (รันซ้ำได้ · สำรอง data เดิมที่ .cache/acrylic-sheet-ai/backup-data-<เวลา>.json ก่อนเขียน)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const die = (m) => { console.error("✗", m); process.exit(1); };
const ID = "acrylic-sheet", EXPECT = "แผ่นอะคริลิค", GROUP = "งานเคลือบนูน (เรซิ่น)", YES = "เคลือบนูน (เรซิ่น)", NO = "ไม่เคลือบนูน (เรซิ่น)", FEE = 40;

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT) die(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT}"`);
const d = row.data;
const options = Array.isArray(d.options) ? d.options : [];
const group = {
  label: GROUP,
  display: "dropdown",
  section: "5. เคลือบผิว",
  note: `เคลือบเรซิ่นใสนูนทับหน้าลาย ผิวโค้งมนเงาวาว — บวกเพิ่มชิ้นละ ฿${FEE}`,
  choices: [
    { name: NO, desc: "ผิวอะคริลิคเรียบตามปกติ — ไม่บวกเพิ่ม" },
    { name: YES, extra: FEE, desc: `เคลือบเรซิ่นใสนูนทับหน้าลาย — บวกเพิ่มชิ้นละ ฿${FEE}` },
  ],
};
const gi = options.findIndex((o) => o.label === GROUP);
const same = gi >= 0 && JSON.stringify(options[gi]) === JSON.stringify(group);
console.log(`# ${row.name} · กลุ่ม ${options.length} · "${GROUP}" ${gi < 0 ? "ยังไม่มี → เพิ่มท้ายสุด" : same ? "มีแล้วตรงกัน" : "มีแล้วแต่ไม่ตรง → เขียนทับ"}`);
if (same) { console.log("✓ ทำไปแล้ว ไม่มีอะไรต้องเขียน"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }

const nextOptions = gi < 0 ? [...options, group] : options.map((o, i) => (i === gi ? group : o));
mkdirSync(".cache/acrylic-sheet-ai", { recursive: true });
const bk = `.cache/acrylic-sheet-ai/backup-data-${Date.now()}.json`;
writeFileSync(bk, JSON.stringify(d, null, 1));
console.log("  💾 สำรองเดิม →", bk);
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options: nextOptions, savedAt } }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bg = (b.options ?? []).find((o) => o.label === GROUP);
const ok = b.savedAt === savedAt && (b.options ?? []).length === nextOptions.length
  && bg && bg.choices.length === 2 && bg.choices[0].name === NO && !bg.choices[0].extra && bg.choices[1].name === YES && bg.choices[1].extra === FEE;
if (!ok) die(`อ่านกลับไม่ตรง: groups=${(b.options ?? []).length} savedAt=${b.savedAt}`);
console.log(`✓ เขียนแล้ว · กลุ่ม ${b.options.length} · ${YES} +฿${bg.choices[1].extra}/ชิ้น · savedAt ${savedAt}`);

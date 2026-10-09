/**
 * Griptok อะคริลิค (id 1-4): เคลือบนูน (เรซิ่น) → สกรีนได้แค่ "สกรีน 1 ด้าน (บน)" (9 ต.ค. 69)
 * กฎทิศ เคลือบ → งานสกรีน: เลือกเรซิ่นแล้วสกรีนสลับเป็นด้านบนเอง (resolveSelections ใช้ค่าดิบของกลุ่มหลัง)
 * dry-run เป็นค่าเริ่ม · --write = บันทึกจริง · รันซ้ำได้ (ลบกฎตัวเองก่อนใส่ใหม่)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { allowedChoices, resolveSelections } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string) => { console.error("✗", m); process.exit(1); };

const ID = "1-4";
const RESIN_GROUP = "งานเคลือบนูน (เรซิ่น)";
const RESIN = "เคลือบนูน (เรซิ่น)";
const SCREEN_GROUP = "งานสกรีน";
const TOP = "สกรีน 1 ด้าน (บน)";

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const before = row!.data;
const d = structuredClone(before);

if (!d.options.find((o: any) => o.label === RESIN_GROUP)?.choices.some((c: any) => c.name === RESIN)) die("ไม่พบตัวเลือกเรซิ่น");
if (!d.options.find((o: any) => o.label === SCREEN_GROUP)?.choices.some((c: any) => c.name === TOP)) die("ไม่พบสกรีนด้านบน");

d.rules = (d.rules ?? []).filter((r: any) => !(r.when?.label === RESIN_GROUP && r.limit?.label === SCREEN_GROUP));
d.rules.push({ when: { label: RESIN_GROUP, choice: RESIN, choices: [RESIN] }, limit: { label: SCREEN_GROUP, allow: [TOP] } });

// ทดสอบกับ engine จริง
const r1 = resolveSelections(d, { [SCREEN_GROUP]: "สกรีน 1 ด้าน (ใต้)", [RESIN_GROUP]: RESIN });
const r2 = resolveSelections(d, { [SCREEN_GROUP]: "สกรีน 1 ด้าน (ใต้)", [RESIN_GROUP]: "ไม่เคลือบนูน (เรซิ่น)" });
console.log("เรซิ่น + ใต้ →", r1[SCREEN_GROUP], "/", r1[RESIN_GROUP]);
console.log("ไม่เคลือบ + ใต้ →", r2[SCREEN_GROUP]);
console.log("สกรีนที่เลือกได้ตอนเรซิ่น:", allowedChoices(d, r1, SCREEN_GROUP));
if (r1[SCREEN_GROUP] !== TOP || r1[RESIN_GROUP] !== RESIN || r2[SCREEN_GROUP] !== "สกรีน 1 ด้าน (ใต้)") die("ผลกฎไม่ตรงที่ตั้งใจ");

if (!WRITE) { console.log("(dry-run) ใส่ --write เพื่อบันทึก"); process.exit(0); }

writeFileSync(new URL(`../backups/griptok-acrylic-1-4-before-resin-top-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url), JSON.stringify(before, null, 2));
d.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (up.data?.length !== 1) die("อัปเดต " + up.data?.length + " แถว");
const back = (await sb.from("products").select("data").eq("id", ID).single()).data!.data;
if (back.savedAt !== d.savedAt || !back.rules.some((r: any) => r.when?.label === RESIN_GROUP)) die("อ่านกลับไม่ตรง — รันซ้ำ");
console.log("✓ เขียนแล้ว");

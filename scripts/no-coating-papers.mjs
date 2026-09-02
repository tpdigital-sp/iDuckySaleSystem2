/**
 * 100 Pound Paper (หนา 300gsm) และ E-Photo Paper 290 แกรม เคลือบไม่ได้
 * → เติมชื่อกระดาษ 2 ตัวนี้เข้ากฎที่ล็อก "เคลือบ (เฉพาะด้านหน้า)" ให้เหลือ "ไม่เคลือบ"
 * (กฎเดิมมีอยู่แล้วสำหรับ Canvas / Stardream / Extra)
 * รันซ้ำได้ ไม่ซ้ำซ้อน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PAPERS = ["100 Pound Paper (หนา 300gsm)", "E-Photo Paper 290 แกรม"];
const IDS = ["postcard-th", "new-mti1wu6o-1002", "new-mti1x6y4-5967"];
const PAPER_LABEL = "ชนิดกระดาษ";
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";
const NO_COAT = "ไม่เคลือบ";

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) throw error;
  const d = row.data;
  const rules = Array.isArray(d.rules) ? d.rules : [];

  const rule = rules.find(
    (r) => r?.when?.label === PAPER_LABEL && r?.limit?.label === COAT_LABEL &&
      Array.isArray(r.limit.allow) && r.limit.allow.length === 1 && r.limit.allow[0] === NO_COAT &&
      !(r.when.choices || []).includes("พลาสติก PET 250 แกรม")
  );
  if (!rule) throw new Error(`${id}: หากฎล็อก "${COAT_LABEL}" = ${NO_COAT} ไม่เจอ`);

  const paperGroup = (d.options || []).find((o) => o.label === PAPER_LABEL);
  for (const p of PAPERS) {
    if (!(paperGroup?.choices || []).some((c) => c.name === p)) throw new Error(`${id}: ไม่มีตัวเลือกกระดาษ "${p}"`);
    const cell = d.pricing?.cells?.[`${p}│${NO_COAT}`];
    if (!cell) throw new Error(`${id}: ตารางราคาไม่มีช่อง "${p}│${NO_COAT}"`);
  }

  const before = [...(rule.when.choices || [])];
  rule.when.choices = [...before, ...PAPERS.filter((p) => !before.includes(p))];
  rule.when.choice = rule.when.choices[0];

  if (rule.when.choices.length === before.length) { console.log("—", id, row.name, "(มีอยู่แล้ว)"); continue; }

  const { error: upErr } = await sb.from("products").update({ data: { ...d, rules } }).eq("id", id);
  if (upErr) throw upErr;
  console.log("✓", id, row.name, "→ ล็อกไม่เคลือบ:", rule.when.choices.join(", "));
}

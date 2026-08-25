/**
 * งานฟอยล์ → สเปคต้อง "ระบุ" เคลือบด้านจริง ๆ (ร้านสั่ง 25 ส.ค. 69 ต่อจากรอบใส่ note)
 *
 *   npx tsx scripts/foil-lock-matte-choice.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/foil-lock-matte-choice.mts --write  # บันทึกลง Supabase
 *
 * เดิมเลือกฟอยล์แล้วกฎล็อกเคลือบลามิเนตเป็น "ไม่เคลือบ" — หน้าจอ/ตะกร้า/ออเดอร์เลยเขียนว่าไม่เคลือบ
 * ทั้งที่งานจริงมีเคลือบด้านเสมอ ที่เปลี่ยน (4 สินค้าที่มีทั้งกลุ่มลามิเนต+ฟอยล์):
 *   1. เพิ่มตัวเลือก "เคลือบด้าน (มากับงานฟอยล์)" (0 บาท) ในกลุ่มลามิเนต
 *   2. กฎ "เลือกฟอยล์ → ล็อกลามิเนต" ชี้มาตัวใหม่นี้แทน "ไม่เคลือบ"
 *   3. กฎกัน: ไม่เลือกฟอยล์ → ซ่อนตัวใหม่ (กันลูกค้ากดเคลือบด้านฟรีโดยไม่มีฟอยล์)
 *   4. note กลุ่มฟอยล์ เน้นคำ "เคลือบด้าน" ด้วย **…** (หน้าสินค้าเรนเดอร์เป็นตัวหนาสีชมพู)
 *      — ข้อ 4 รวม paper-foil ที่ทั้งตัวเป็นงานฟอยล์ด้วย (ไม่มีกลุ่มลามิเนตให้ล็อก)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionRule, Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const NEW_CHOICE = "เคลือบด้าน (มากับงานฟอยล์)";
const NO_FOIL = "ไม่เคลือบฟอยล์";
const NO_LAM = "ไม่เคลือบ";

type Job = { lamLabel?: string; foilLabel: string };
const JOBS: Record<string, Job> = {
  "ultra-hard-cardboard-2-mm": { lamLabel: "เคลือบลามิเนต", foilLabel: "เคลือบฟอยล์ (Add On)" },
  "card-broad-foam-2-mm": { lamLabel: "เคลือบลามิเนต", foilLabel: "เคลือบฟอยล์ (Add On)" },
  "pricelist-shikishi": { lamLabel: "เคลือบลามิเนต", foilLabel: "เคลือบฟอยล์ (Add On)" },
  "photocard-digital": { lamLabel: "เคลือบ (เฉพาะด้านหน้า)", foilLabel: "เคลือบฟอยล์" },
  "paper-foil": { foilLabel: "จำนวนเลเยอร์ฟอยล์" }, // ทั้งตัวคืองานฟอยล์ — เน้น note อย่างเดียว
};

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

for (const [id, job] of Object.entries(JOBS)) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !row) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  const d = row.data as Product;
  console.log(`\n===== ${id} — ${d.name} =====`);

  // ── 4. เน้นคำ "เคลือบด้าน" ใน note กลุ่มฟอยล์ ─────────────────────────────
  const foil = d.options.find((o) => o.label === job.foilLabel);
  if (!foil) throw new Error(`${id}: ไม่เจอกลุ่ม "${job.foilLabel}"`);
  if (!foil.note?.includes("ต้องมีการเคลือบด้านร่วมด้วย") && !foil.note?.includes("**เคลือบด้าน**"))
    throw new Error(`${id}: note กลุ่มฟอยล์ไม่มีข้อความเคลือบด้าน — รัน foil-requires-matte ก่อน`);
  foil.note = foil.note.replace("ต้องมีการเคลือบด้านร่วมด้วย", "ต้องมีการ**เคลือบด้าน**ร่วมด้วย");
  console.log(`note ฟอยล์: ${foil.note}`);

  if (job.lamLabel) {
    const lam = d.options.find((o) => o.label === job.lamLabel);
    if (!lam) throw new Error(`${id}: ไม่เจอกลุ่ม "${job.lamLabel}"`);

    // ── 1. ตัวเลือกใหม่ 0 บาทท้ายกลุ่มลามิเนต ────────────────────────────────
    const originals = lam.choices.map((c) => c.name).filter((n) => n !== NEW_CHOICE);
    if (!lam.choices.some((c) => c.name === NEW_CHOICE)) lam.choices.push({ name: NEW_CHOICE });

    // ── 2. กฎล็อกเดิม (ฟอยล์ → ไม่เคลือบ) ชี้มาตัวใหม่ ───────────────────────
    const lockRule = (d.rules ?? []).find(
      (r) => r.when.label === job.foilLabel && r.limit.label === job.lamLabel
    );
    if (!lockRule) throw new Error(`${id}: ไม่เจอกฎ ฟอยล์→${job.lamLabel} — ข้อมูลเปลี่ยนไปแล้ว ตรวจก่อนรันทับ`);
    const allowNow = lockRule.limit.allow.join("|");
    if (allowNow !== NO_LAM && allowNow !== NEW_CHOICE)
      throw new Error(`${id}: กฎล็อกหน้าตาไม่ตรงที่คาด (allow=${allowNow})`);
    lockRule.limit.allow = [NEW_CHOICE];

    // ── 3. กฎกัน: ไม่เลือกฟอยล์ → เลือกได้เฉพาะชุดเดิม (ตัวใหม่ถูกซ่อน) ─────
    d.rules = d.rules ?? [];
    const guard = d.rules.find(
      (r) => r.when.label === job.foilLabel && r.when.choice === NO_FOIL && r.limit.label === job.lamLabel
    );
    if (!guard) {
      const rule: OptionRule = {
        when: { label: job.foilLabel, choice: NO_FOIL, choices: [NO_FOIL] },
        limit: { label: job.lamLabel, allow: originals },
      };
      d.rules.push(rule);
    }

    console.log(`กลุ่ม "${job.lamLabel}": ${lam.choices.map((c) => c.name).join(" | ")}`);
    for (const r of d.rules)
      if (r.limit.label === job.lamLabel && r.when.label === job.foilLabel)
        console.log(`  กฎ: ${r.when.label} ∈ [${(r.when.choices ?? [r.when.choice]).join(", ")}] → allow [${r.limit.allow.join(", ")}]`);
  }

  if (!WRITE) continue;
  const saved: Product = { ...d, savedAt: new Date().toISOString() };
  const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", id);
  if (upErr) throw new Error(`${id}: ${upErr.message}`);
  console.log("✓ บันทึกแล้ว");
}
if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");

#!/usr/bin/env node
/**
 * แยกตัวเลือก "สกรีน 2 ด้าน" ของสินค้าอะคริลิคเป็น 2 แบบ — (ใต้-บน) กับ (บน-บน)
 *
 *   node scripts/split-screen-2side.mjs            # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/split-screen-2side.mjs --write    # บันทึกจริง
 *   node scripts/split-screen-2side.mjs --write --only=standee-clip
 *
 * แผ่น HOW TO PRINT ของร้านแยกงานสองด้านไว้สองแบบ (ดู scripts/acrylic-howto-print.mjs):
 *   ใต้-บน  = สกรีนใต้อะคริลิคด้านหนึ่ง + สกรีนบนอีกด้าน · มีฟิล์มใสติดอยู่ด้านหน้า
 *   บน-บน  = สกรีนบนอะคริลิคทั้งสองด้าน · ไม่มีฟิล์มใสติด · ใช้ได้กับอะคริลิคทุกชนิด
 * ราคาเท่ากันทั้งคู่ (เป็นงานสองด้านเหมือนกัน) — ที่ต่างคือวิธีสกรีนกับผลลัพธ์ที่ได้
 *
 * ⚠️ กลุ่มงานสกรีนของเกือบทุกตัวเป็น "แกนตารางราคา" — แยก 1 เป็น 2 ต้องกางช่องราคาตามด้วย
 *    ไม่งั้นลูกค้าเลือกแล้วหาราคาไม่เจอ · สคริปต์กางให้แล้วเทียบราคาทีละช่องก่อนบันทึก
 * ⚠️ ตั้งชื่อใหม่โดย "ต่อท้ายชื่อเดิม" — สินค้าที่เขียน "2 ด้าน" ได้ "2 ด้าน (ใต้-บน)"
 *    ส่วนที่เขียน "สกรีน 2 ด้าน" ได้ "สกรีน 2 ด้าน (ใต้-บน)" ชื่อในกลุ่มเดียวกันจะได้เข้าชุดกัน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const CATEGORIES = ["acrylic", "standee"];
const EXTRA_IDS = ["1-4", "photoframe-4"];
/**
 * "2 ด้าน" ของกล่องดินสอคือ "สกรีนกี่ด้านของกล่อง" (มี 3 ด้าน/4 ด้าน ต่อท้ายด้วย)
 * ไม่ใช่งานสองด้านบนแผ่นเดียวแบบที่แผ่น HOW TO PRINT อธิบาย — แยกไปจะสื่อผิด
 */
const DENY = new Set(["otheracrylicproducts2-2"]);

const GROUP_RE = /^(งานสกรีน|สกรีน|การสกรีน)$/;
const TWO_RE = /2\s*ด้าน|สองด้าน/;
const DONE_RE = /ใต้\s*-\s*บน|บน\s*-\s*บน/;
const SUFFIX = ["(ใต้-บน)", "(บน-บน)"];
const CROP = ["screen-2side-under-top-v1", "screen-2side-top-top-v1"];

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
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/acrylic-howto/${name}.jpg`;

const a = await sb.from("products").select("id,data").in("category", CATEGORIES);
const b = await sb.from("products").select("id,data").in("id", EXTRA_IDS);
if (a.error || b.error) throw new Error((a.error || b.error).message);
const rows = [...a.data, ...b.data]
  .filter((r, i, x) => x.findIndex((y) => y.id === r.id) === i && !DENY.has(r.id))
  .filter((r) => !ONLY || r.id === ONLY)
  .sort((x, y) => x.id.localeCompare(y.id));

let touched = 0;
for (const row of rows) {
  const d = structuredClone(row.data);
  const before = structuredClone(row.data);
  const opt = (d.options ?? []).find((o) => GROUP_RE.test(o.label));
  if (!opt) continue;
  const i = opt.choices.findIndex((c) => TWO_RE.test(c.name) && !DONE_RE.test(c.name));
  if (i < 0) continue; // แยกไปแล้ว หรือไม่มีงานสองด้าน

  const old = opt.choices[i];
  const names = SUFFIX.map((s) => `${old.name} ${s}`);
  opt.choices = [
    ...opt.choices.slice(0, i),
    ...names.map((name, k) => ({ ...old, name, imageSrc: IMG(CROP[k]) })),
    ...opt.choices.slice(i + 1),
  ];

  // ตารางราคา — ทุกเรท ไม่ใช่แค่ตารางหลัก
  const matrices = [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)];
  const olds = [before.pricing, ...(before.priceRates ?? []).map((r) => r.pricing)];
  const grew = [];
  matrices.forEach((m, mi) => {
    if (!m?.cells || !(m.driverLabels ?? []).includes(opt.label)) return;
    const at = m.driverLabels.indexOf(opt.label);
    const cells = {};
    for (const [k, v] of Object.entries(m.cells)) {
      const parts = k.split("│");
      if (parts[at] !== old.name) cells[k] = v;
      else for (const n of names) cells[parts.map((p, j) => (j === at ? n : p)).join("│")] = v;
    }
    grew.push(`${Object.keys(m.cells).length}→${Object.keys(cells).length}`);
    m.cells = cells;
    // ราคาต้องไม่เปลี่ยน — ย้อนชื่อใหม่กลับเป็นชื่อเดิมแล้วเทียบทีละช่อง
    const bad = Object.entries(cells).filter(([k, v]) => {
      const parts = k.split("│");
      const oldKey = names.includes(parts[at]) ? parts.map((p, j) => (j === at ? old.name : p)).join("│") : k;
      return JSON.stringify(olds[mi].cells[oldKey]) !== JSON.stringify(v);
    });
    if (bad.length) throw new Error(`${row.id}: ราคาเพี้ยน ${bad.length} ช่อง เช่น ${bad[0][0]} — ไม่บันทึก`);
  });

  // กฎที่อ้างชื่อเดิม (ทั้งฝั่งเงื่อนไขและฝั่งลิสต์ที่อนุญาต)
  let ruleHits = 0;
  for (const r of d.rules ?? []) {
    if (r.limit?.label === opt.label && r.limit.allow?.includes(old.name)) {
      r.limit.allow = r.limit.allow.flatMap((n) => (n === old.name ? names : [n]));
      ruleHits++;
    }
    if (r.when?.label === opt.label) {
      const list = r.when.choices ?? [r.when.choice];
      if (list.includes(old.name)) {
        r.when.choices = list.flatMap((n) => (n === old.name ? names : [n]));
        if (r.when.choice === old.name) r.when.choice = names[0];
        ruleHits++;
      }
    }
  }

  // คำถามที่พบบ่อยไล่ชื่อตัวเลือกไว้ — ให้ตรงกับของจริง
  for (const f of d.seo?.faqs ?? []) {
    if (f.a?.includes(`${opt.label}:`))
      f.a = f.a.replace(new RegExp(`(${opt.label}:\\s*)([^·]*)`), `$1${opt.choices.map((c) => c.name).join(", ")}`);
  }

  console.log(`📦 ${row.id.padEnd(24)} "${d.name}"`);
  console.log(`      ${old.name} → ${names.join(" · ")}`);
  if (grew.length) console.log(`      ช่องราคา ${grew.join(" · ")} · ราคาตรงกับของเดิมทุกช่อง ✅`);
  if (ruleHits) console.log(`      อัปเดตกฎ ${ruleHits} จุด`);
  touched++;
  if (!WRITE) continue;
  const { error } = await sb.from("products").update({ data: d }).eq("id", row.id);
  if (error) throw new Error(`${row.id}: บันทึกไม่สำเร็จ — ${error.message}`);
}
console.log(WRITE ? `\n✅ แยกไป ${touched} สินค้า` : `\n(ยังไม่บันทึก — ใส่ --write · จะแยก ${touched} สินค้า)`);

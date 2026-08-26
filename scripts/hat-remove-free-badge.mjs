/**
 * เอาป้าย "ฟรี" ออกจากตัวเลือก "ปักธรรมดา" (หมวก Bucket / หมวกแก๊ป)
 * ราคายังเป็น +฿0 เหมือนเดิม แค่ไม่ต้องมีป้ายกำกับ — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * รันดูก่อน: node scripts/hat-remove-free-badge.mjs
 * เขียนจริง: node scripts/hat-remove-free-badge.mjs --write
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
const IDS = ["new-mt2omund-2845", "new-mt2omp9n-3490"];

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data,name").eq("id", id).single();
  if (error) {
    console.log(`❌ ${id}: ${error.message}`);
    continue;
  }
  const d = row.data;
  let touched = 0;
  const options = (d.options ?? []).map((o) => ({
    ...o,
    choices: (o.choices ?? []).map((c) => {
      if (c.badge !== "ฟรี") return c;
      touched++;
      const { badge: _drop, ...rest } = c;
      return rest;
    }),
  }));

  console.log(`\n=== ${id} · ${row.name}`);
  for (const o of options)
    for (const c of o.choices ?? [])
      console.log(`   ${o.label} → ${c.name} | ป้าย: ${c.badge ?? "— ไม่มี —"} | +฿${c.extra ?? 0}`);

  if (!touched) {
    console.log("   (ไม่มีป้าย ฟรี เหลืออยู่แล้ว)");
    continue;
  }
  if (!WRITE) {
    console.log(`   [dry-run] จะถอดป้าย ${touched} จุด — ใส่ --write เพื่อเขียนจริง`);
    continue;
  }
  const { error: upErr } = await sb.from("products").update({ data: { ...d, options } }).eq("id", id);
  console.log(upErr ? `   ❌ เขียนไม่สำเร็จ: ${upErr.message}` : `   ✅ ถอดป้ายแล้ว (${touched} จุด)`);
}

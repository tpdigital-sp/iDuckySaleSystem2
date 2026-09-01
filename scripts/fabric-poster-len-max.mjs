/**
 * ผ้าแขวนผนัง (fabric-poster) — เพดานช่องกรอกขนาด (1 ก.ย. 69)
 *   กว้าง ≤ 140 ซม. (หน้ากว้างผ้า) · ยาว ≤ 90 ซม. (1 หลา)
 * เดิมช่อง "ยาว" ตั้ง max 140 ตามหน้ากว้าง ทำให้ขึ้น "รับ 1–140 ซม." ทั้งสองช่อง
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-len-max.mjs
 * เขียนจริง: node scripts/fabric-poster-len-max.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const W_MAX = 140; // หน้ากว้างผ้า
const H_MAX = 90;  // 1 หลา
const G_W = "ขนาดชิ้นงาน (กว้าง)";
const G_H = "ขนาดชิ้นงาน (ยาว)";

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

const { data, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;
const d = data.data;

let changed = 0;
for (const o of d.options ?? []) {
  if (!o.input || o.input.kind !== "number") continue;
  const want = o.label === G_W ? W_MAX : o.label === G_H ? H_MAX : null;
  if (want == null || o.input.max === want) continue;
  console.log(`${o.label}: max ${o.input.max} → ${want}`);
  o.input.max = want;
  changed++;
}

if (!changed) {
  console.log("ไม่มีอะไรต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(ดูเฉย ๆ) แก้ ${changed} ช่อง — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log(`✅ เขียนแล้ว (${changed} ช่อง)`);

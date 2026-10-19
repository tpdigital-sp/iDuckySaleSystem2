/**
 * ผ้าแขวนผนัง (fabric-poster) — ช่อง "ขนาดชิ้นงาน (ยาว)" รับยาวเกิน 1 หลาได้เมื่อสั่งหลายหลา (19 ต.ค. 69)
 *   พนักงานแจ้ง: สั่ง 85×160 ซม. ต้องสั่ง 2 หลา แต่ช่องยาวรับแค่ 1–90 → ขยายตามจำนวนหลา
 *   ยาว 90 ซม. ต่อ 1 หลา · สั่ง 2 หลา = 180 · เพดานรวม 360 ซม. (4 หลา = ผืนยาวสุดเดียวกับตัดเต็มหลา)
 *   กลไก: OptionInput.maxPerQtyCap (lib/products.ts) — ⚠️ ต้อง deploy โค้ดก่อน เว็บจริงถึงรับยาวเกิน 90
 *   (ลงฐานก่อน deploy ไม่เสียหาย: โค้ดเก่าไม่รู้จักฟิลด์ = เพดาน 90 เท่าเดิม)
 *   + ข้อความใต้ช่องกว้าง "ใหญ่สุด 140 × 90 ซม. (1 หลา)" → "… ต่อ 1 หลา"
 *   + รอบ 2 (พนักงานแจ้งต่อ "160 ซม. จะคิดเป็น 25+5 = 30 · 75+15 = 90 คิดแค่ 1 ครั้ง"):
 *     sizeFee.longPiece = true ทุกตัวที่คูณชิ้น (perPiece: ตัดแบ่ง · เย็บขอบ · โพ้งขอบ)
 *     → เกิน 150 = ขั้น 150 + ขั้นของส่วนที่เกิน · ชิ้นยาวเกิน 1 หลาคิดครั้งเดียวต่อชิ้น (ไม่คูณทุกหลา)
 *     ตัดเต็มหลาไม่โดน (ไม่มี perPiece · ใช้ defaultLongest 140) — ยังคิดต่อหลาตามที่เจ้าของร้านเคาะ 1 ก.ย. 69
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-len-per-yard.mjs
 * เขียนจริง: node scripts/fabric-poster-len-per-yard.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const G_W = "ขนาดชิ้นงาน (กว้าง)";
const G_H = "ขนาดชิ้นงาน (ยาว)";
const CAP = 360; // 4 หลา
const HINT_OLD = "ใหญ่สุด 140 × 90 ซม. (1 หลา)";
const HINT_NEW = "ใหญ่สุด 140 × 90 ซม. ต่อ 1 หลา (ยาวกว่านี้สั่งเพิ่มหลา)";

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
  if (o.label === G_H && o.input.maxPerQtyCap !== CAP) {
    console.log(`${o.label}: maxPerQtyCap ${o.input.maxPerQtyCap ?? "—"} → ${CAP} (max ต่อหลา ${o.input.max})`);
    o.input.maxPerQtyCap = CAP;
    changed++;
  }
  if (o.label === G_W && o.input.hint?.includes(HINT_OLD)) {
    o.input.hint = o.input.hint.replace(HINT_OLD, HINT_NEW);
    console.log(`${o.label}: hint → ${o.input.hint}`);
    changed++;
  }
}

for (const o of d.options ?? []) {
  for (const c of o.choices ?? []) {
    if (!c.sizeFee?.perPiece || c.sizeFee.longPiece === true) continue;
    c.sizeFee.longPiece = true;
    console.log(`${o.label} › ${c.name}: sizeFee.longPiece → true`);
    changed++;
  }
}

if (!changed) {
  console.log("ไม่มีอะไรต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(ดูเฉย ๆ) แก้ ${changed} จุด — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log(`✅ เขียนแล้ว (${changed} จุด)`);

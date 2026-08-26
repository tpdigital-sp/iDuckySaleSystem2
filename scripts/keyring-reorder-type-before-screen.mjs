#!/usr/bin/env node
/**
 * พวงกุญแจอะคริลิค (keyring-copy-copy) — เรียงกลุ่มใหม่ตามผู้ใช้สั่ง 26 ส.ค. 69:
 *   เดิม: ความหนา · ขนาด · งานสกรีน · ประเภทอะคริลิค · สีอะคริลิค · …
 *   ใหม่: ความหนา · ขนาด · ประเภทอะคริลิค · สีอะคริลิค · งานสกรีน · …
 * (สีอะคริลิค = เฉดของประเภท ติดไปด้วยกัน · กลุ่มอื่นอยู่ที่เดิม)
 *
 * ผลพลอยได้: resolveSelections ไล่ตามลำดับกลุ่ม — เนื้อ/เฉดมาก่อนงานสกรีน
 * ทำให้กฎ "เนื้อทึบ → สกรีนบนเท่านั้น" คำนวณจากค่าที่แก้แล้วเสมอ
 *
 *   node scripts/keyring-reorder-type-before-screen.mjs           # ดูก่อน
 *   node scripts/keyring-reorder-type-before-screen.mjs --write   # บันทึกจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy";
const MOVE = ["ประเภทอะคริลิค", "สีอะคริลิค"]; // ย้ายมาก่อน "งานสกรีน" ตามลำดับนี้
const BEFORE = "งานสกรีน";

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

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);

for (const l of [...MOVE, BEFORE])
  if (!d.options.some((o) => o.label === l)) throw new Error(`ไม่เจอกลุ่ม "${l}" — โครงเปลี่ยน ตรวจก่อน`);

const moved = MOVE.map((l) => d.options.find((o) => o.label === l));
d.options = d.options.filter((o) => !MOVE.includes(o.label));
d.options.splice(d.options.findIndex((o) => o.label === BEFORE), 0, ...moved);

console.log(`📦 ${d.name} (${ID}) — ลำดับใหม่:`);
d.options.forEach((o, i) => console.log(`   ${i}. ${o.label}`));
const iT = d.options.findIndex((o) => o.label === MOVE[0]);
const iS = d.options.findIndex((o) => o.label === BEFORE);
if (iT > iS) throw new Error("เรียงแล้วประเภทยังอยู่หลังงานสกรีน — ผิด ไม่บันทึก");

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
d.savedAt = new Date().toISOString();
const { error: e } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e) throw new Error(`บันทึกไม่สำเร็จ — ${e.message}`);
console.log("\n✅ บันทึกแล้ว");

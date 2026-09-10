#!/usr/bin/env node
/**
 * เข็มกลัดพลาสติก (broochbadge-th) — เติม piecesPerUnit "1 เซ็ตได้กี่ชิ้น" ให้กลุ่ม "ขนาด"
 *
 *   node scripts/brooch-badge-pieces-per-unit.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/brooch-badge-pieces-per-unit.mjs --write
 *
 * ที่มา (10 ก.ย. 69): เข็มกลัดขายเป็นเซ็ต แต่ลูกค้าแนบลายเป็นชิ้น — ช่อง "ลายที่ N" ใต้รูปเทียบกับ 4 เซ็ต
 * เลยฟ้อง "รวม 20 เซ็ต แต่สั่งทั้งหมด 4 เซ็ต" ทั้งที่ 4 เซ็ต × 5 ชิ้น = 20 ชิ้นพอดี
 * ชื่อตัวเลือกบอกไว้แล้วว่า "(1 เซตได้ 10 ชิ้น)" แต่เป็นข้อความเฉย ๆ → ย้ายเลขมาเก็บเป็น piecesPerUnit
 * (orderUnitYield อ่านทางนี้ก่อน → หน้าสินค้า/ตะกร้า/ออเดอร์ได้ตัวคูณเดียวกัน)
 *
 * รันซ้ำได้ · ตรวจชื่อสินค้าก่อนเขียน · อ่านกลับเทียบทุกตัวเลือก + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "broochbadge-th";
const EXPECT_NAME = "เข็มกลัดพลาสติก";
const OPT = "ขนาด";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/** "ทรงกลม 25mm (1 เซตได้ 10 ชิ้น)" → 10 · ไม่เข้าแบบ = null */
function perFromName(name) {
  const m = /(?:เซ็ต|เซต|ชุด)\s*ได้\s*(\d{1,4})\s*ชิ้น/.exec(name ?? "");
  return m ? Number(m[1]) : null;
}

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;
const opt = (d.options ?? []).find((o) => o.label === OPT);
if (!opt) die(`ไม่พบกลุ่ม "${OPT}"`);

const plan = [];
for (const c of opt.choices) {
  const per = perFromName(c.name);
  if (!per) die(`อ่านจำนวนต่อเซ็ตจากชื่อไม่ได้: "${c.name}"`);
  const same = c.piecesPerUnit === per;
  console.log(`${same ? "=" : "→"} ${c.name}: piecesPerUnit ${c.piecesPerUnit ?? "-"} → ${per}`);
  plan.push({ name: c.name, per });
  if (!same) c.piecesPerUnit = per;
}
const changed = plan.filter((p) => opt.choices.find((c) => c.name === p.name).piecesPerUnit === p.per).length;
if (!WRITE) {
  console.log(`\n(dry-run) ${plan.length} ตัวเลือก — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (updErr) die(updErr.message);
if (!upd?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบค่าจริง (อย่าเชื่อว่าไม่ error = ลง)
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr.message);
const bo = (back.data.options ?? []).find((o) => o.label === OPT);
for (const p of plan) {
  const c = bo?.choices.find((x) => x.name === p.name);
  if (!c || typeof c.piecesPerUnit !== "number" || c.piecesPerUnit !== p.per) die(`อ่านกลับไม่ตรง: ${p.name} = ${c?.piecesPerUnit}`);
}
if (back.data.savedAt !== d.savedAt) die(`savedAt อ่านกลับไม่ตรง (${back.data.savedAt})`);
console.log(`\n✓ เขียนแล้ว ${changed}/${plan.length} ตัวเลือก · savedAt ${d.savedAt} · อ่านกลับตรงทุกตัว`);

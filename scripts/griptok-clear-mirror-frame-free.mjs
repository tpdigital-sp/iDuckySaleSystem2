#!/usr/bin/env node
/**
 * griptok-clear-mirror — กลุ่ม "ช่องกรอบใส่ภาพ" (ผู้ใช้สั่ง 26 ส.ค. 69)
 *   1) ไม่คิดเงินเพิ่มแล้ว (เดิม +15 บาท/ชิ้น) → ถอด extra ออก
 *   2) ทำเป็นกลุ่มของเสริมมีสวิตช์เปิด-ปิด (collapsible) ปิดไว้เป็นค่าเริ่มต้น
 *      — ตัวเลือกแรกของกลุ่มคือ "ไม่เพิ่ม" (0 บาท) ตามกฎ collapsible
 *   3) แก้ข้อความที่ยังเขียน +15 บาท ทุกที่ (note / แท็บ / terms / FAQ / description)
 *
 *   node scripts/griptok-clear-mirror-frame-free.mjs           # ดูก่อน
 *   node scripts/griptok-clear-mirror-frame-free.mjs --write   # เขียนจริง
 *
 * แก้แบบ patch จากข้อมูลสดใน DB (ไม่เขียนทับทั้งก้อนแบบสคริปต์ build) — รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-clear-mirror";
const GROUP = "ช่องกรอบใส่ภาพ";
const CHOICE = "เพิ่มช่องกรอบใส่ภาพ";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
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
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(`อ่านสินค้าไม่ได้: ${error.message}`);
const d = structuredClone(row.data);

/* ── 1) กลุ่มตัวเลือก ── */
const g = (d.options ?? []).find((o) => o.label === GROUP);
if (!g) die(`ไม่เจอกลุ่ม "${GROUP}" — โครงสินค้าเปลี่ยน ต้องตรวจก่อน`);
if ((g.choices?.[0]?.extra ?? 0) !== 0) die(`ตัวเลือกแรกของกลุ่มคิดเงิน — collapsible ห้ามใช้ (กฎ 0฿ ตัวแรก)`);
const c = g.choices.find((x) => x.name === CHOICE);
if (!c) die(`ไม่เจอตัวเลือก "${CHOICE}"`);
delete c.extra;
g.collapsible = true;
g.note =
  "เพิ่มชั้นอะคริลิคใสด้านหน้าอีก 1 มม. เป็นช่องเสียบภาพ ถอดเปลี่ยนรูปเองได้ **ไม่คิดเงินเพิ่ม** — ดูตัวอย่างคลิปทรงแสตมป์ในแกลเลอรี";

/* ── 2) ข้อความที่ยังเขียนราคา +15 ── */
d.description = d.description.replace("เพิ่มช่องกรอบใส่ภาพได้", "เพิ่มช่องกรอบใส่ภาพได้ ไม่คิดเงินเพิ่ม");
d.terms = d.terms.replace("ช่องกรอบใส่ภาพ +15 บาท", "ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม");
for (const t of d.tabs ?? [])
  t.text = t.text.replace(
    "• Add On ช่องกรอบใส่ภาพ บวกเพิ่ม 15 บาท/ชิ้น —",
    "• Add On ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม —"
  );
for (const f of d.seo?.faqs ?? [])
  f.a = f.a.replace("ถอดเปลี่ยนรูปเองได้) +15 บาท", "ถอดเปลี่ยนรูปเองได้) ไม่คิดเงินเพิ่ม");

const leftovers = [
  ["description", d.description],
  ["terms", d.terms],
  ...(d.tabs ?? []).map((t) => [`แท็บ ${t.title}`, t.text]),
  ...(d.seo?.faqs ?? []).map((f) => [`FAQ ${f.q}`, f.a]),
].filter(([, s]) => /ช่องกรอบ[^.\n]{0,80}15\s*บาท|15\s*บาท[^.\n]{0,40}ช่องกรอบ/.test(s ?? ""));
if (leftovers.length) die(`ยังมีข้อความ +15 บาทค้าง: ${leftovers.map(([k]) => k).join(", ")}`);

console.log(`กลุ่ม "${GROUP}" → collapsible: ${g.collapsible} · ตัวเลือก:`);
for (const x of g.choices) console.log(`   ${x.name} | extra: ${x.extra ?? 0}`);
console.log(`terms: ${d.terms}`);
if (!WRITE) {
  console.log("\n(dry-run) รันด้วย --write เพื่อบันทึก");
  process.exit(0);
}

d.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) die(`บันทึกไม่สำเร็จ: ${upErr.message}`);

/* ── 3) อ่านกลับตรวจ ── */
const { data: back, error: rdErr } = await sb.from("products").select("data").eq("id", ID).single();
if (rdErr) die(`อ่านกลับไม่สำเร็จ: ${rdErr.message}`);
const bg = (back.data.options ?? []).find((o) => o.label === GROUP);
const checks = [
  ["กลุ่มมีสวิตช์เปิด-ปิด (collapsible)", bg?.collapsible === true],
  ["ตัวเลือกแรก 'ไม่เพิ่ม' 0 บาท", (bg?.choices?.[0]?.extra ?? 0) === 0],
  ["ช่องกรอบใส่ภาพ ไม่บวกเงิน", (bg?.choices?.find((x) => x.name === CHOICE)?.extra ?? 0) === 0],
  ["ภาพตัวอย่างยังอยู่", !!bg?.choices?.find((x) => x.name === CHOICE)?.imageSrc],
  ["terms อัปเดตแล้ว", back.data.terms.includes("ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม")],
  ["แท็บอัปเดตแล้ว", (back.data.tabs ?? []).some((t) => t.text.includes("ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม"))],
  ["FAQ อัปเดตแล้ว", (back.data.seo?.faqs ?? []).some((f) => f.a.includes("ไม่คิดเงินเพิ่ม"))],
  ["savedAt", back.data.savedAt === d.savedAt],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${label}`);
  if (!pass) ok = false;
}
if (!ok) die("อ่านกลับแล้วไม่ตรง — ห้ามเชื่อว่าสำเร็จ");
console.log("\n✅ เสร็จ");

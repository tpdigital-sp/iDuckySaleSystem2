/**
 * 🩹 กู้ติ๊ก "✅ กราฟฟิกอ่านรายละเอียดแล้ว" (items[].graphicAck) ที่ถูกหน้าจอค้างเขียนทับก่อนแก้บั๊ก 9 ก.ย. 69
 *
 * วิธีดู: ใน log ของออเดอร์ เหตุการณ์ล่าสุดของรายการนั้นเป็น "กราฟฟิกยืนยันอ่านรายละเอียดแล้ว" (ไม่ใช่ยกเลิก)
 * แต่ items[].graphicAck ไม่มีค่า → เติมกลับตามคน/เวลาใน log + ลง log ว่าระบบกู้ให้
 *
 *   node scripts/restore-graphic-ack.mjs           # dry-run — แค่ลิสต์
 *   node scripts/restore-graphic-ack.mjs --apply   # เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");

const { data, error: qErr } = await sb.from("orders").select("id,data").order("created_at", { ascending: false }).limit(5000);
if (qErr) throw qErr;

let found = 0;
for (const r of data ?? []) {
  const o = r.data;
  const log = [...(o.log ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  let changed = false;
  const items = (o.items ?? []).map((it) => {
    if (it.graphicAck) return it;
    const ev = log.filter((l) => /^กราฟฟิก(ยกเลิก)?ยืนยันอ่านรายละเอียด/.test(l.action) && (l.detail ?? "") === (it.name ?? ""));
    const last = ev[ev.length - 1];
    if (!last || last.action.startsWith("กราฟฟิกยกเลิก")) return it;
    console.log(`${o.id} [${o.status}] ${(it.name ?? "").slice(0, 40)} ← ติ๊กโดย ${last.by} ${last.at} แต่ค่าหาย`);
    changed = true;
    return { ...it, graphicAck: { by: last.by, at: last.at } };
  });
  if (!changed) continue;
  found++;
  if (!apply) continue;
  const next = {
    ...o,
    items,
    log: [
      ...(o.log ?? []),
      { at: new Date().toISOString(), by: "ระบบ", action: "กู้ติ๊ก “กราฟฟิกอ่านรายละเอียดแล้ว” ที่ถูกหน้าจอค้างเขียนทับ", detail: "ตาม log เดิม" },
    ],
  };
  const { error } = await sb.from("orders").update({ data: next }).eq("id", o.id);
  console.log(error ? `  ❌ ${error.message}` : "  ✅ กู้แล้ว");
}
console.log(apply ? `กู้แล้ว ${found} ใบ` : `dry-run: พบ ${found} ใบ (ใส่ --apply เพื่อกู้)`);

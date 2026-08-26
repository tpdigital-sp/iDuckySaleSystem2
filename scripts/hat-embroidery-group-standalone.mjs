/**
 * 🎛️ ย้ายกลุ่ม "แบบงานปัก" ออกจากกล่อง 📐 ต้องการสั่งทำ → เป็นกลุ่มตัวเลือกแยกของตัวเอง
 *
 * เดิมกลุ่มนี้ติดธง madeToOrder ทำให้ไปโผล่ในกล่อง "📐 ต้องการสั่งทำ — กำหนดขนาด/รายละเอียดเอง"
 * และลูกค้าต้องติ๊กกล่องนั้นก่อนถึงจะเห็นการ์ด · ถอดธงออก = โผล่เป็นกลุ่มปกติเลย
 * เงื่อนไข showWhen (เรทราคา = งานปัก) คงเดิม — เลือกเรทพิมพ์ยังไม่เห็นกลุ่มนี้เหมือนเดิม
 *
 * --keep-ask = คงธง askPrice ไว้ (ราคาจะขึ้น "รอแอดมินตีราคา" ทันทีที่เลือกเรทงานปัก)
 * ไม่ใส่ = ถอด askPrice ด้วย เพื่อให้ราคายังคิดจากตารางเรท + ปักนูน +฿50 ตามปกติ
 *
 * รันดูก่อน: node scripts/hat-embroidery-group-standalone.mjs
 * เขียนจริง: node scripts/hat-embroidery-group-standalone.mjs --write
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
const KEEP_ASK = process.argv.includes("--keep-ask");
const LABEL = "แบบงานปัก";

for (const id of ["new-mt2omund-2845", "new-mt2omp9n-3490"]) {
  const { data: row, error } = await sb.from("products").select("data,name").eq("id", id).single();
  if (error) {
    console.log(`❌ ${id}: ${error.message}`);
    continue;
  }
  const d = row.data;
  let touched = 0;
  const options = (d.options ?? []).map((o) => {
    if (o.label !== LABEL || (!o.madeToOrder && (KEEP_ASK || !o.askPrice))) return o;
    touched++;
    const { madeToOrder: _m, askPrice: _a, ...rest } = o;
    return KEEP_ASK && o.askPrice ? { ...rest, askPrice: true } : rest;
  });

  console.log(`\n=== ${id} · ${row.name}`);
  for (const o of options)
    console.log(
      `   GROUP "${o.label}" → ${o.madeToOrder ? "อยู่ในกล่อง 📐 ต้องการสั่งทำ" : "กลุ่มแยกของตัวเอง"}` +
        ` · โผล่เมื่อ ${o.showWhen ? `${o.showWhen.label} = ${o.showWhen.choices.join("/")}` : "ตลอด"}` +
        ` · ราคา ${o.askPrice ? "รอแอดมินตีราคา" : "ตามตารางเรท + ฿ ของตัวเลือก"}`
    );
  if (!touched) {
    console.log("   (ตั้งไว้ตรงแล้ว ไม่ต้องแก้)");
    continue;
  }
  if (!WRITE) {
    console.log("   [dry-run] ใส่ --write เพื่อเขียนจริง");
    continue;
  }
  const { error: upErr } = await sb.from("products").update({ data: { ...d, options } }).eq("id", id);
  console.log(upErr ? `   ❌ เขียนไม่สำเร็จ: ${upErr.message}` : "   ✅ เขียนลง DB แล้ว");
}

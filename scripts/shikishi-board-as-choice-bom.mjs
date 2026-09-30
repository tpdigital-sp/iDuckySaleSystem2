/**
 * 🔩 กระดาษแข็ง Ultra-Hard 2 mm (A3–A7) → "วัสดุแฝงของตัวเลือก" ของกลุ่ม "ขนาด" ทั้ง SHIKISHI และ Ultra-Hard CardBoard (เจ้าของร้านเลือก 30 ก.ย. 69)
 * เดิม: choice.stockItemId (วัสดุหลักของตัวเลือก) · ใหม่: choice.stockLinks = [{ stockItemId, per: 1 }] ไม่มี when = ตัดทุกครั้งที่เลือกขนาดนั้น
 * การตัดยอดเท่าเดิม (planStockCuts อ่าน stockLinks ไม่มี when เป็น "ตัดเสมอ") · หน้าคลัง/ลิ้นชักจะเรียกว่า วัสดุแฝง ตรงกับป้าย part
 * ⚠️ หลังแปลง ตัวเลือก "ขนาด" ไม่มีวัสดุหลักแล้ว — ถ้ามีคนกด "แยกสต๊อกตามตัวเลือก" ซ้ำ ระบบจะเสนอสร้าง SKU ใหม่ (อย่ากด)
 * รัน: node scripts/shikishi-board-as-choice-bom.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BOARD = new Set(["sku-munr2ie91gmv","sku-munr2ih8ebu1","sku-munr2ikerudf","sku-munr2io36683","sku-munr2irjm9gg"]);
for (const pid of ["pricelist-shikishi","ultra-hard-cardboard-2-mm"]) {
  const { data: row } = await sb.from("products").select("id,data").eq("id", pid).maybeSingle();
  if (!row) die("ไม่พบ " + pid);
  const next = structuredClone(row.data);
  const opt = (next.options ?? []).find((o) => o.label === "ขนาด");
  if (!opt) die(pid + " ไม่มีกลุ่ม ขนาด");
  let n = 0;
  for (const c of opt.choices ?? []) {
    if (!c.stockItemId || !BOARD.has(c.stockItemId)) continue;
    const links = c.stockLinks ?? [];
    if (!links.some((l) => l.stockItemId === c.stockItemId)) links.push({ stockItemId: c.stockItemId, per: 1 });
    c.stockLinks = links;
    delete c.stockItemId;
    n++;
    console.log(`  ${pid} · ขนาด = ${c.name}: วัสดุหลัก → วัสดุแฝง (${links.length} ลิงก์)`);
  }
  if (!n) { console.log(`↷ ${pid}: ไม่มีอะไรต้องแปลง (ทำไปแล้ว?)`); continue; }
  if (!APPLY) continue;
  next.savedAt = new Date().toISOString();
  const { error, data: upd } = await sb.from("products").update({ data: next }).eq("id", pid).select("id");
  if (error || !upd?.length) die(`${pid} เขียนไม่ลง: ${error?.message ?? "0 แถว"}`);
  const { data: back } = await sb.from("products").select("data").eq("id", pid).maybeSingle();
  const bo = (back?.data?.options ?? []).find((o) => o.label === "ขนาด");
  const bad = (bo?.choices ?? []).filter((c) => BOARD.has(c.stockItemId) || !(c.stockLinks ?? []).some((l) => BOARD.has(l.stockItemId) && !l.when));
  if (bad.length && bad.length !== (bo.choices.length - n)) die(`${pid} อ่านกลับไม่ตรง`);
  console.log(`✓ ${pid} บันทึกแล้ว ${n} ตัวเลือก`);
}
console.log(APPLY ? "✅ เสร็จ" : "(dry-run — เติม --apply)");
process.exit(0);

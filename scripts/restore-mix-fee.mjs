/**
 * ♻️ คืนค่า "คละไม่ถึงขั้นต่ำ ชิ้นละ +฿5" (underMinPieceFee) ให้เรทฐานของสินค้าที่ระบุ
 *
 * ทำไมต้องมี — ค่านี้ถูกลบออกจากหน้าแก้ไขสินค้า/สคริปต์อื่นแล้วราคาเพี้ยนหนัก:
 *   สินค้าตั้ง tierByDesign ไว้ พอไม่มีค่าคละ การคละเกินโควตาต่อลายจะ "ตกไปเรทปลีก" ทั้งกอง
 *   (สแตนดี้ 3cm สั่ง 11 ชิ้น 3 ลาย: ฿39/ชิ้น + ค่าคละ ฿5 = ฿434 → กลายเป็น ฿140/ชิ้น = ฿1,540)
 *   และช่องจำนวนลายตันที่ ⌊จำนวน ÷ ลายละ N⌋ = ลูกค้าเจอว่า "ต้องสั่งเพิ่ม" ถึงจะคละได้
 *
 * แตะเฉพาะเรทที่ minQty ต่ำสุด (เรทฐาน) ทั้งฝั่งลูกค้าทั่วไปและฝั่งตัวแทน — เรทที่ 2 (ส่งโรงงาน)
 * ไม่แตะ เพราะค่าคละ ฿5 ไม่พอชดส่วนต่างราคาโรงงาน (กติกาเดียวกับ scripts/wholesale-mix-fee.mts)
 *
 *   node scripts/restore-mix-fee.mjs standy            # ดูก่อน (ไม่เขียน)
 *   node scripts/restore-mix-fee.mjs standy --write    # เขียนจริง + สำรองค่าเดิมลง backups/
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const FEE = 5;
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) throw new Error("ใส่รหัสสินค้ามาด้วย เช่น node scripts/restore-mix-fee.mjs standy");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", ids);
if (error) throw error;
for (const id of ids) if (!rows.some((r) => r.id === id)) throw new Error(`ไม่เจอสินค้า ${id}`);

const plan = [];
for (const row of rows) {
  const rates = row.data?.priceRates ?? [];
  if (!rates.length) throw new Error(`${row.id}: ไม่มีตารางเรท`);
  const floorQty = Math.min(...rates.map((r) => r.minQty ?? 1));
  const targets = rates
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.minQty ?? 1) === floorQty && (r.minPerDesign ?? 0) > 1 && !r.underMinPieceFee);
  if (!targets.length) {
    console.log(`⏭️  ${row.id} | ${row.name} — เรทฐานตั้งค่าคละไว้แล้ว (หรือไม่มีโควตาต่อลาย) ไม่ต้องแก้`);
    continue;
  }
  for (const { r, i } of targets) console.log(`✅ ${row.id} | ${row.name} → [${i}] ${r.label} · ลายละ ${r.minPerDesign} · ตั้งชิ้นละ ฿${FEE}`);
  plan.push({ row, indexes: targets.map((t) => t.i) });
}

if (!plan.length) process.exit(0);
if (!WRITE) {
  console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/restore-mix-fee-before-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    plan.map(({ row, indexes }) => ({ id: row.id, name: row.name, rates: indexes.map((i) => ({ index: i, underMinPieceFee: row.data.priceRates[i].underMinPieceFee ?? null })) })),
    null,
    1
  )
);
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

for (const { row, indexes } of plan) {
  const data = JSON.parse(JSON.stringify(row.data));
  for (const i of indexes) data.priceRates[i].underMinPieceFee = FEE;
  // pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน (ตามที่หน้าแก้ไขสินค้าคาดไว้)
  if (indexes.includes(0)) data.pricing = data.priceRates[0].pricing;
  data.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data }).eq("id", row.id);
  if (e) throw new Error(`${row.id}: เขียนไม่ผ่าน — ${e.message}`);
  // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
  const { data: back } = await sb.from("products").select("data").eq("id", row.id);
  for (const i of indexes) {
    const got = back?.[0]?.data?.priceRates?.[i]?.underMinPieceFee;
    if (got !== FEE) throw new Error(`${row.id}[${i}]: เขียนแล้วแต่อ่านกลับได้ ${got}`);
  }
  console.log(`✅ ${row.id} — เขียนแล้ว ${indexes.length} เรท (อ่านกลับยืนยันแล้ว)`);
}

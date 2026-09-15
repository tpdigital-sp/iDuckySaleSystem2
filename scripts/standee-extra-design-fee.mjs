/**
 * 🎨 สแตนดี้อะคริลิค — เปลี่ยนกติกาคละลายเป็น "เกินโควตา คิดลายละ ฿5" (เจ้าของร้านเคาะ 15 ก.ย. 69)
 *
 * กติกาที่เจ้าของร้านสั่ง: ขั้นต่ำลายละ 5 ชิ้น → สั่ง 11 ชิ้นได้ฟรี ⌊11÷5⌋ = 2 ลาย · เกินจากนั้นลายละ ฿5
 * = extraDesignFee ไม่ใช่ underMinPieceFee (ตัวหลังคิดเป็น "ชิ้น" ที่อยู่ในลายที่ไม่ครบ ซึ่งแพงกว่ามาก
 * เช่น 11 ชิ้น 5 ลาย ได้ ฿30 แทนที่จะเป็น 3 ลายเกิน × ฿5 = ฿15)
 *
 * แตะเฉพาะเรทฐาน (minQty ต่ำสุด) ทั้งฝั่งลูกค้าทั่วไปและฝั่งตัวแทน — เรทที่ 2 (ส่งโรงงาน ลายละ 25)
 * ไม่แตะ คงกติกาเดิม "ไม่ถึงตามจำนวน คิดตามเรทที่ 1"
 *
 *   node scripts/standee-extra-design-fee.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-extra-design-fee.mjs --write    # เขียนจริง + สำรองค่าเดิมลง backups/
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const FEE = 5;
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = ids.length ? ids : ["standy"];

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

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", TARGETS);
if (error) throw error;
for (const id of TARGETS) if (!rows.some((r) => r.id === id)) throw new Error(`ไม่เจอสินค้า ${id}`);

const plan = [];
for (const row of rows) {
  const rates = row.data?.priceRates ?? [];
  if (!rates.length) throw new Error(`${row.id}: ไม่มีตารางเรท`);
  const floorQty = Math.min(...rates.map((r) => r.minQty ?? 1));
  const targets = rates
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.minQty ?? 1) === floorQty && (r.minPerDesign ?? 0) > 1 && r.extraDesignFee !== FEE);
  if (!targets.length) {
    console.log(`⏭️  ${row.id} | ${row.name} — เรทฐานตั้งลายละ ฿${FEE} ไว้แล้ว`);
    continue;
  }
  for (const { r, i } of targets) {
    const free = Math.floor((r.minQty ?? r.freeMixBelowQty ?? 11) / r.minPerDesign);
    console.log(
      `✅ ${row.id} | ${row.name} → [${i}] ${r.label}\n` +
        `     ขั้นต่ำลายละ ${r.minPerDesign} ชิ้น · สั่ง ${r.minQty ?? "-"} ชิ้น = ฟรี ${free} ลาย · เกินจากนั้นลายละ +฿${FEE}\n` +
        `     เลิกใช้ "คละไม่ถึงขั้นต่ำ ชิ้นละ +฿${r.underMinPieceFee ?? 0}"`
    );
  }
  plan.push({ row, indexes: targets.map((t) => t.i) });
}

if (!plan.length) process.exit(0);
if (!WRITE) {
  console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/extra-design-fee-before-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    plan.map(({ row, indexes }) => ({
      id: row.id,
      name: row.name,
      rates: indexes.map((i) => ({
        index: i,
        extraDesignFee: row.data.priceRates[i].extraDesignFee ?? null,
        underMinPieceFee: row.data.priceRates[i].underMinPieceFee ?? null,
      })),
    })),
    null,
    1
  )
);
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

for (const { row, indexes } of plan) {
  const data = JSON.parse(JSON.stringify(row.data));
  for (const i of indexes) {
    data.priceRates[i].extraDesignFee = FEE;
    delete data.priceRates[i].underMinPieceFee; // สองกติกาใช้พร้อมกันไม่ได้ — underMinPieceFee ชนะใน mixFeeOfSide
  }
  // pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน (ตามที่หน้าแก้ไขสินค้าคาดไว้)
  if (indexes.includes(0)) data.pricing = data.priceRates[0].pricing;
  data.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data }).eq("id", row.id);
  if (e) throw new Error(`${row.id}: เขียนไม่ผ่าน — ${e.message}`);
  // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
  const { data: back } = await sb.from("products").select("data").eq("id", row.id);
  for (const i of indexes) {
    const got = back?.[0]?.data?.priceRates?.[i];
    if (got?.extraDesignFee !== FEE || got?.underMinPieceFee != null)
      throw new Error(`${row.id}[${i}]: เขียนแล้วแต่อ่านกลับได้ ลายละ ${got?.extraDesignFee} · ชิ้นละ ${got?.underMinPieceFee}`);
  }
  console.log(`✅ ${row.id} — เขียนแล้ว ${indexes.length} เรท (อ่านกลับยืนยันแล้ว)`);
}

/**
 * 🛒 ตะกร้าคิดราคาขายส่งให้ได้ทุกสินค้า — เปิด "ค่าคละชิ้นที่ไม่ถึงขั้นต่ำต่อลาย" (underMinPieceFee)
 * ให้เรทฐานของสินค้าทุกตัวที่มีตารางเรท (ผู้ใช้สั่ง 31 ส.ค. 69 — ทำตามต้นแบบเคสมือถือ)
 *
 * ปัญหาเดิม
 *   ตะกร้ารวมบรรทัดคิดเรทตามยอดรวมอยู่แล้ว (repriceCartGroups) แต่ "โควตาต่อลาย" (minPerDesign)
 *   กันบรรทัดเล็กออกจากล็อต — สั่ง 3+3+3+3 = 12 ชิ้น ยังโดนราคาปลีกทั้งกอง ทั้งที่ยอดรวมถึงเรทส่งแล้ว
 *
 * กติกาใหม่ (เหมือนเคส Case Frame Card ที่ใช้อยู่จริง)
 *   ชิ้นที่อยู่ในลายที่ไม่ถึงขั้นต่ำต่อลาย เข้าเรทส่งได้ โดยจ่ายเพิ่มชิ้นละ FEE บาท
 *   → 3+3+3+3 = เรทส่ง + ค่าคละ ถูกกว่าเดิมเสมอ · ยอดที่ไม่ถึงเกณฑ์เรทยังเป็นราคาปลีกตามเดิม
 *
 * ทำอะไร (ต่อสินค้า 1 ตัว)
 *   ตั้ง priceRates[เรทฐาน].underMinPieceFee = 5   ← จบแค่นี้
 *   ข้อความหน้าสินค้า/ตะกร้าเขียนจากค่านี้ให้เองอยู่แล้ว (ProductDetail + unitPriceParts) ไม่ต้องแก้ทีละตัว
 *
 * เรทฐาน = เรทที่ minQty ต่ำสุด (เรทที่ลูกค้าเจอก่อน) — เรทลึกกว่านั้น (เช่น "เรทที่ 2 ส่งโรงงาน 50 ชิ้น
 * ลายละ 25") ไม่แตะ เพราะค่าคละ 5 บาทไม่พอชดส่วนต่างราคาโรงงาน
 *
 * ข้ามเมื่อ
 *   • เรทฐานไม่มี minPerDesign (ไม่มีโควตาต่อลาย = ไม่มีอะไรให้ปลด)
 *   • ตั้ง underMinPieceFee ไว้แล้ว (เคส 7 ตัว + สินค้าที่ตั้งเอง)
 *   • ส่วนต่าง "ราคาปลีก → ราคาส่งขั้นแรก" ของช่องไหนก็ตาม < FEE
 *     (จ่ายค่าคละแล้วแพงกว่าราคาปลีก = ลูกค้าเสียเปรียบ ห้ามเปิด)
 *   • ตรวจราคาจริงด้วยเครื่องคิดราคาแล้วมีสถานการณ์ไหน "แพงขึ้น" (กันเหนียวชั้นสุดท้าย)
 *
 *   npx tsx scripts/wholesale-mix-fee.mts            # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/wholesale-mix-fee.mts --write    # เขียนจริง + สำรองค่าเดิมลง backups/
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { repriceCartGroups, maxDesignsFor, DESIGN_LABEL, type PriceRate, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const FEE = 5;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Row = { id: string; name: string; price: number; category: string; data: Record<string, unknown> };

/** ต่อ row ในฐานข้อมูลเป็น Product ที่เครื่องคิดราคาใช้ได้ (คอลัมน์กระจก + ก้อน data) */
function toProduct(row: Row): Product {
  return { id: row.id, name: row.name, price: row.price, category: row.category, ...(row.data as object) } as Product;
}

/** ราคาต่อหน่วยของทุกช่องในตาราง เรียงตามขั้นจำนวน — ใช้วัดส่วนต่าง "ปลีก → ส่งขั้นแรก" */
function tierGap(rate: PriceRate): { min: number; worst: string } | undefined {
  let min = Infinity;
  let worst = "";
  for (const [key, cell] of Object.entries(rate.pricing?.cells ?? {})) {
    const nums = (Array.isArray(cell) ? cell : [cell]).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length < 2) continue;
    const gap = nums[0] - nums[1];
    if (gap < min) {
      min = gap;
      worst = `${key || "(ช่องเดียว)"}: ${nums[0]} → ${nums[1]}`;
    }
  }
  return min === Infinity ? undefined : { min, worst };
}

/** สเปคตัวอย่างสำหรับทดลองคิดราคา — แกะจากคีย์ช่องแรกของตาราง (ค่าจริงที่ขายอยู่) */
function sampleSelections(rate: PriceRate): Record<string, string> | undefined {
  const labels = rate.pricing?.driverLabels ?? [];
  const key = Object.keys(rate.pricing?.cells ?? {})[0];
  if (key === undefined) return undefined;
  if (!labels.length) return {};
  const parts = key.split("│");
  if (parts.length !== labels.length) return undefined;
  return Object.fromEntries(labels.map((l, i) => [l, parts[i]]));
}

/** ยอดรวมที่ลูกค้าจ่ายจริงของตะกร้าชุดหนึ่ง (ราคา/หน่วย × จำนวน + ค่าคละ) */
function cartTotal(p: Product, lines: { qty: number; designs: number }[], base: Record<string, string>): number {
  const cart = lines.map((l) => ({
    productId: p.id,
    qty: l.qty,
    selections: l.designs > 1 ? { ...base, [DESIGN_LABEL]: String(l.designs) } : { ...base },
  }));
  const out = repriceCartGroups(cart, (id) => (id === p.id ? p : undefined));
  return out.reduce((s, r, i) => s + r.unitPrice * cart[i].qty + (r.extraFee ?? 0), 0);
}

/**
 * สถานการณ์ทดสอบ — อิงกติกาของเรทเอง (โควตาต่อลาย · ขั้นต่ำเรท · ช่วงคละอิสระ)
 * total = ยอดที่ "ถึงเรทส่งแน่ ๆ" · under = แบ่งบรรทัดให้ไม่ถึงโควตาต่อลาย (เคสที่ต้องดีขึ้น)
 */
function scenarios(rate: PriceRate) {
  const per = rate.minPerDesign ?? 1;
  const total = Math.max(rate.minQty ?? 1, rate.freeMixBelowQty ?? 0, per * 2);
  const underQty = Math.max(1, per - 1);
  const underLines = Math.max(2, Math.ceil(total / underQty));
  return [
    { name: `คละบรรทัดเล็ก ${underLines}×${underQty}`, lines: Array.from({ length: underLines }, () => ({ qty: underQty, designs: 1 })) },
    { name: `บรรทัดเดียว ${total} ชิ้น ${underLines} ลาย`, lines: [{ qty: total, designs: underLines }] },
    { name: `ถึงโควตาอยู่แล้ว 2×${per}`, lines: [{ qty: per, designs: 1 }, { qty: per, designs: 1 }], mustEqual: true },
    { name: "ของน้อย 2×1", lines: [{ qty: 1, designs: 1 }, { qty: 1, designs: 1 }], mustEqual: true },
    { name: `ยอดใหญ่ 2×${total}`, lines: [{ qty: total, designs: 1 }, { qty: total, designs: 1 }], mustEqual: true },
  ];
}

const { data, error } = await sb.from("products").select("id,name,price,category,data").limit(2000);
if (error) throw error;
const rows = (data ?? []) as Row[];

const changed: { row: Row; rateIndex: number; before?: number; note: string }[] = [];
const skipped: Record<string, string[]> = {};
const skip = (reason: string, line: string) => (skipped[reason] ??= []).push(line);

for (const row of rows) {
  const d = row.data ?? {};
  if ((d as { hidden?: boolean }).hidden) continue;
  const rates = ((d as { priceRates?: PriceRate[] }).priceRates ?? []) as PriceRate[];
  if (!rates.length) {
    skip("ไม่มีตารางเรท (ราคาเดียว ไม่มีราคาส่งให้คิด)", `${row.id} | ${row.name}`);
    continue;
  }

  // เรทฐาน = ขั้นต่ำน้อยสุด · เสมอกันเอาตัวแรก (ลำดับในหน้าแก้ไขสินค้า)
  let rateIndex = 0;
  rates.forEach((r, i) => {
    if ((r.minQty ?? 1) < (rates[rateIndex].minQty ?? 1)) rateIndex = i;
  });
  const rate = rates[rateIndex];
  const tag = `${row.id} | ${row.name} | ${rate.label}`;

  if (rate.underMinPieceFee) {
    skip(`ตั้งค่าคละไว้แล้ว`, `${tag} | ชิ้นละ ฿${rate.underMinPieceFee}`);
    continue;
  }
  if (!rate.minPerDesign || rate.minPerDesign <= 1) {
    skip("ไม่มีโควตาต่อลาย (คละได้อิสระอยู่แล้ว)", tag);
    continue;
  }
  const gap = tierGap(rate);
  if (!gap) {
    skip("ตารางมีขั้นราคาเดียว (ไม่มีราคาส่งให้ลด)", tag);
    continue;
  }
  if (gap.min < FEE) {
    skip(`ส่วนต่างปลีก→ส่ง < ฿${FEE} (จ่ายค่าคละแล้วแพงกว่าปลีก)`, `${tag} | ส่วนต่างน้อยสุด ฿${gap.min} — ${gap.worst}`);
    continue;
  }
  const base = sampleSelections(rate);
  if (!base) {
    skip("แกะสเปคตัวอย่างจากตารางไม่ได้ (ตรวจราคาก่อน/หลังไม่ได้)", tag);
    continue;
  }

  // ตรวจราคาจริงก่อน/หลัง — ห้ามมีสถานการณ์ไหนแพงขึ้น
  const before = toProduct(row);
  const afterRow = JSON.parse(JSON.stringify(row)) as Row;
  (afterRow.data as { priceRates: PriceRate[] }).priceRates[rateIndex].underMinPieceFee = FEE;
  const after = toProduct(afterRow);

  /**
   * สถานการณ์ที่ "เดิมสั่งไม่ได้เลย" — หน้าสินค้าตันจำนวนลายไว้ที่ ⌊จำนวน ÷ ลายละ N⌋
   * (เช่น 11 ชิ้น ลายละ 3 = คละได้ 3 ลาย) · เปิดค่าคละแล้วคละได้ถึงจำนวนชิ้น
   * เทียบราคาก่อน/หลังไม่ได้ เพราะของเดิมไม่มีให้สั่ง — เอาออกจากการตรวจ "แพงขึ้นไหม"
   */
  const orderableBefore = (l: { qty: number; designs: number }) => l.designs <= maxDesignsFor(rate, l.qty);
  const results = scenarios(rate)
    .filter((s) => s.lines.every(orderableBefore))
    .map((s) => {
      const b = cartTotal(before, s.lines, base);
      const a = cartTotal(after, s.lines, base);
      return { ...s, b, a };
    });
  const worse = results.find((r) => r.a > r.b + 0.001);
  if (worse) {
    skip("ตรวจราคาแล้วแพงขึ้น", `${tag} | ${worse.name}: ฿${worse.b} → ฿${worse.a}`);
    continue;
  }
  const drifted = results.find((r) => r.mustEqual && Math.abs(r.a - r.b) > 0.001);
  if (drifted) {
    skip("สถานการณ์ที่ควรเท่าเดิมกลับเปลี่ยน", `${tag} | ${drifted.name}: ฿${drifted.b} → ฿${drifted.a}`);
    continue;
  }
  const gains = results.filter((r) => r.a < r.b - 0.001);
  if (!gains.length) {
    skip("ตั้งแล้วราคาไม่เปลี่ยน (ไม่มีผล)", tag);
    continue;
  }

  changed.push({
    row,
    rateIndex,
    before: rate.underMinPieceFee,
    note:
      `ลายละ ${rate.minPerDesign} · ส่วนต่างปลีก→ส่ง ฿${gap.min} · ` +
      gains.map((g) => `${g.name} ฿${Math.round(g.b)}→฿${Math.round(g.a)}`).join(" · "),
  });
}

console.log(`\n📦 สินค้าเผยแพร่ทั้งหมด ${rows.filter((r) => !(r.data as { hidden?: boolean })?.hidden).length} ตัว`);
console.log(`✅ จะเปิดค่าคละชิ้นละ ฿${FEE} ให้ ${changed.length} ตัว`);
for (const c of changed) console.log(`   ${c.row.id} | ${c.row.name} — ${c.note}`);
console.log("\n⏭️  ข้าม:");
for (const [reason, list] of Object.entries(skipped).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`   • ${reason} — ${list.length} ตัว`);
  if (!/ไม่มีตารางเรท|ไม่มีโควตาต่อลาย/.test(reason)) for (const l of list) console.log(`       ${l}`);
}

if (!WRITE) {
  console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง");
  process.exit(0);
}

// สำรองค่าเดิมของเฉพาะตัวที่จะแก้ (กู้กลับได้ด้วย underMinPieceFee เดิม)
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/wholesale-mix-fee-before-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    changed.map((c) => ({ id: c.row.id, name: c.row.name, rateIndex: c.rateIndex, underMinPieceFee: c.before ?? null })),
    null,
    1
  )
);
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

let ok = 0;
for (const c of changed) {
  const data = JSON.parse(JSON.stringify(c.row.data)) as { priceRates: PriceRate[]; pricing?: unknown; savedAt?: string };
  data.priceRates[c.rateIndex].underMinPieceFee = FEE;
  // pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน (ตามที่หน้าแก้ไขสินค้าคาดไว้)
  if (c.rateIndex === 0) data.pricing = data.priceRates[0].pricing;
  data.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data }).eq("id", c.row.id);
  if (e) throw new Error(`${c.row.id}: เขียนไม่ผ่าน — ${e.message}`);
  // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
  const { data: back } = await sb.from("products").select("data").eq("id", c.row.id);
  const got = (back?.[0]?.data as { priceRates?: PriceRate[] })?.priceRates?.[c.rateIndex]?.underMinPieceFee;
  if (got !== FEE) throw new Error(`${c.row.id}: เขียนแล้วแต่อ่านกลับได้ ${got}`);
  ok++;
}
console.log(`✅ เขียนเรียบร้อย ${ok}/${changed.length} ตัว (อ่านกลับยืนยันแล้วทุกตัว)`);

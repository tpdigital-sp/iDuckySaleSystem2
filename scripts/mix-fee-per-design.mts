/**
 * 🎨 ค่าคละลายทั้งร้านเป็นกติกาเดียว — "คละเกินโควตา คิดลายละ ฿5" (เจ้าของร้านเคาะ 15 ก.ย. 69)
 *
 * กติกา: ขั้นต่ำลายละ N ชิ้น → สั่ง Q ชิ้นได้ฟรี ⌊Q÷N⌋ ลาย · เกินจากนั้นลายละ ฿5
 *   = extraDesignFee (ลายละ) แทน underMinPieceFee (ชิ้นละ — คิดจากจำนวน "ชิ้น" ที่อยู่ในลายที่ไม่ครบ
 *   ซึ่งแพงกว่าราว 2 เท่า: 11 ชิ้น 5 ลาย ได้ ฿30 แทนที่จะเป็น 3 ลายเกิน × ฿5 = ฿15)
 *
 * ทำอะไร (ต่อสินค้า 1 ตัว) — แตะ "เรทฐาน" = ทุกเรทที่ minQty ต่ำสุด ทั้งฝั่งลูกค้าทั่วไปและฝั่งตัวแทน
 *   (สคริปต์รุ่นก่อนแตะแค่ priceRates[0] เรทตัวแทนเลยไม่ได้ค่าคละ ตัวแทนคละลายแล้วตกราคาปลีก)
 *     rate.extraDesignFee = 5 · ลบ rate.underMinPieceFee ทิ้ง (สองกติกาใช้พร้อมกันไม่ได้ —
 *     mixFeeOfSide เช็ค underMinPieceFee ก่อน)
 *   เรทลึกกว่านั้น (เรทที่ 2 ส่งโรงงาน) ไม่แตะ คงกติกาเดิม "ไม่ถึงตามจำนวน คิดตามเรทที่ 1"
 *
 * ข้ามเมื่อ
 *   • เรทฐานไม่มีโควตาต่อลาย (minPerDesign ≤ 1) — คละอิสระอยู่แล้ว ไม่มีอะไรให้คิด
 *   • ตั้งลายละ ฿5 ไว้แล้วทุกเรทฐาน
 *   • ตรวจราคาจริงแล้วมีสถานการณ์ไหน "แพงขึ้น" (กันเหนียว — ห้ามลูกค้าจ่ายแพงกว่าเดิมเด็ดขาด)
 *
 *   npx tsx scripts/mix-fee-per-design.mts            # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/mix-fee-per-design.mts --write    # เขียนจริง + สำรองค่าเดิมลง backups/
 *   npx tsx scripts/mix-fee-per-design.mts --only standy,keyring   # เจาะเฉพาะบางตัว
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  repriceCartGroups, includedDesigns, tierQtyFor, unitPriceFor, feeBreakdown,
  RATE_LABEL, DESIGN_LABEL, type PriceRate, type Product,
} from "../src/lib/products";

const WRITE = process.argv.includes("--write");
/**
 * 🔓 --force = ยอมให้เขียนทั้งที่ด่านตรวจเจอเคส "แพงขึ้น" (เจ้าของร้านเคาะเองเป็นตัว ๆ เท่านั้น)
 * ใช้กับ 8 ตัวที่ค้างมาตั้งแต่ 15 ก.ย. 69 — เคสที่แพงขึ้นคือ "คละลายละ 1 ชิ้น" ซึ่งแพงขึ้นแค่ ฿1–5
 * แลกกับเคสคละกลาง ๆ ที่ถูกลงเป็นร้อย · ยังพิมพ์ส่วนต่างให้เห็นทุกตัวก่อนเขียนเหมือนเดิม
 */
const FORCE = process.argv.includes("--force");
const FEE = 5;
const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const ONLY = onlyArg ? new Set((onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1] ?? "").split(",").filter(Boolean)) : undefined;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Row = { id: string; name: string; price: number; category: string; data: Record<string, unknown> };
const toProduct = (row: Row): Product => ({ id: row.id, name: row.name, price: row.price, category: row.category, ...(row.data as object) } as Product);

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

/** ยอดที่ลูกค้าจ่ายจริงของบรรทัดเดี่ยว (ราคา/หน่วย × จำนวน + ค่าคละ) */
function linePrice(p: Product, sel: Record<string, string>, qty: number): number {
  const tq = tierQtyFor(p, sel, qty);
  return unitPriceFor(p, sel, qty) * qty + feeBreakdown(p, sel, qty, tq).reduce((s, l) => s + l.amount, 0);
}
/** ยอดที่ลูกค้าจ่ายจริงของตะกร้าหลายบรรทัด (ผ่านตัวรวมล็อตจริง) */
function cartPrice(p: Product, base: Record<string, string>, lines: { qty: number; designs: number }[]): number {
  const cart = lines.map((l) => ({ productId: p.id, qty: l.qty, selections: { ...base, [DESIGN_LABEL]: `${l.designs} ลาย` } }));
  const out = repriceCartGroups(cart, (id) => (id === p.id ? p : undefined));
  return out.reduce((s, r, i) => s + r.unitPrice * cart[i].qty + (r.extraFee ?? 0), 0);
}

const { data, error } = await sb.from("products").select("id,name,price,category,data").limit(2000);
if (error) throw error;
const rows = (data ?? []) as Row[];

const changed: { row: Row; indexes: number[]; note: string }[] = [];
const skipped: Record<string, string[]> = {};
const skip = (reason: string, line: string) => (skipped[reason] ??= []).push(line);

for (const row of rows) {
  if (ONLY && !ONLY.has(row.id)) continue;
  const rates = ((row.data as { priceRates?: PriceRate[] }).priceRates ?? []) as PriceRate[];
  const pub = rates.filter((r) => !r.dealerOnly);
  if (!pub.length) { skip("ไม่มีตารางเรท (ราคาเดียว ไม่มีโควตาคละให้คิด)", `${row.id} | ${row.name}`); continue; }

  // เรทฐาน = ทุกเรทที่ minQty ต่ำสุด (เรทที่ลูกค้าเจอก่อน) — รวมเรทตัวแทนที่ขั้นต่ำเท่ากัน
  const floorQty = Math.min(...pub.map((r) => r.minQty ?? 1));
  const targets = rates
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.minQty ?? 1) === floorQty && (r.minPerDesign ?? 0) > 1);
  const baseRate = pub.find((r) => (r.minQty ?? 1) === floorQty);
  const tag = `${row.id} | ${row.name} | ${baseRate?.label ?? "-"}`;

  if (!targets.length) { skip("เรทฐานไม่มีโควตาต่อลาย (คละอิสระอยู่แล้ว)", tag); continue; }
  // ค่าคละที่เจ้าของร้านตั้งสูงกว่า ฿5 เอง (หมวด Keychain & Acrylic 20 ตัว = ลายละ ฿10 · scripts/acrylic-mix-fee-10.mts 19 ก.ย. 69)
  // ห้ามดึงกลับเป็น ฿5 — ด่าน "ห้ามแพงขึ้น" ไม่กันเคสนี้เพราะ 10→5 คือถูกลง
  if (targets.some(({ r }) => (r.extraDesignFee ?? 0) > FEE)) { skip(`ตั้งค่าคละลายละสูงกว่า ฿${FEE} ไว้เอง (ไม่แตะ)`, tag); continue; }
  if (targets.every(({ r }) => r.extraDesignFee === FEE && !r.underMinPieceFee)) { skip(`ตั้งลายละ ฿${FEE} ไว้แล้วครบทุกเรทฐาน`, tag); continue; }

  const base = sampleSelections(baseRate!);
  if (!base) { skip("แกะสเปคตัวอย่างจากตารางไม่ได้ (ตรวจราคาก่อน/หลังไม่ได้)", tag); continue; }

  const before = toProduct(row);
  const afterRow = JSON.parse(JSON.stringify(row)) as Row;
  for (const { i } of targets) {
    const r = (afterRow.data as { priceRates: PriceRate[] }).priceRates[i];
    r.extraDesignFee = FEE;
    delete r.underMinPieceFee;
  }
  const after = toProduct(afterRow);

  // ── ตรวจราคาจริงก่อน/หลัง — ห้ามมีสถานการณ์ไหนแพงขึ้น ──
  const per = baseRate!.minPerDesign!;
  const sel = { ...base, [RATE_LABEL]: baseRate!.label };
  const big = Math.max(floorQty, baseRate!.freeMixBelowQty ?? 0, per * 2);
  const small = Math.max(1, per - 1);
  let worst: string | undefined;
  let worstDiff = 0;
  let gain = 0;
  const cmp = (name: string, b: number, a: number) => {
    if (!Number.isFinite(b) || !Number.isFinite(a)) return;
    // เก็บเคสที่ "แพงขึ้นมากที่สุด" ไว้ตัวเดียว (เดิมเก็บเคสแรกที่เจอ — ตัวเลขที่รายงานเลยไม่ใช่กรณีแย่สุด)
    if (a > b + 0.001 && a - b > worstDiff) { worstDiff = a - b; worst = `${name}: ฿${Math.round(b)} → ฿${Math.round(a)}`; }
    gain = Math.max(gain, b - a);
  };
  for (const qty of [small, floorQty, big, big * 2, per * 3]) {
    if (qty < 1) continue;
    const cap = Math.min(qty, includedDesigns(baseRate!, qty) + per * 2);
    for (let d = 1; d <= cap; d++) {
      const s = { ...sel, [DESIGN_LABEL]: `${d} ลาย` };
      cmp(`${qty} ชิ้น ${d} ลาย`, linePrice(before, s, qty), linePrice(after, s, qty));
    }
  }
  for (const [name, lines] of [
    [`ตะกร้า ${small}×3 ลายเดียว`, [{ qty: small, designs: 1 }, { qty: small, designs: 1 }, { qty: small, designs: 1 }]],
    [`ตะกร้า ${small}×3 คละ`, [{ qty: small, designs: small }, { qty: small, designs: 1 }, { qty: small, designs: 1 }]],
    [`ตะกร้า ใหญ่+เล็ก`, [{ qty: big, designs: 1 }, { qty: small, designs: 1 }]],
  ] as [string, { qty: number; designs: number }[]][]) {
    cmp(name, cartPrice(before, sel, lines), cartPrice(after, sel, lines));
  }

  if (worst && !FORCE) { skip("ตรวจราคาแล้วแพงขึ้น", `${tag} | ${worst}`); continue; }

  const kinds = targets.map(({ r }) => (r.underMinPieceFee ? `ชิ้นละ ฿${r.underMinPieceFee}` : r.extraDesignFee ? `ลายละ ฿${r.extraDesignFee}` : "ไม่มีค่าคละ"));
  changed.push({
    row, indexes: targets.map((t) => t.i),
    note: `ลายละ ${per} ชิ้น · ${targets.length} เรทฐาน (เดิม ${[...new Set(kinds)].join(" / ")})` + (gain > 0.001 ? ` · ถูกลงสูงสุด ฿${Math.round(gain)}` : " · ราคาเท่าเดิมทุกเคส") + (worst ? ` · ⚠️ แพงขึ้นสูงสุด ${worst}` : ""),
  });
}

console.log(`\n✅ จะตั้งค่าคละ "ลายละ ฿${FEE}" ให้ ${changed.length} ตัว`);
for (const c of changed) console.log(`   ${c.row.id} | ${c.row.name} — ${c.note}`);
console.log("\n⏭️  ข้าม:");
for (const [reason, list] of Object.entries(skipped).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`   • ${reason} — ${list.length} ตัว`);
  if (!/ไม่มีตารางเรท|ไม่มีโควตาต่อลาย/.test(reason)) for (const l of list) console.log(`       ${l}`);
}

if (!WRITE) { console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }
if (!changed.length) process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/mix-fee-per-design-before-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(changed.map((c) => ({
  id: c.row.id, name: c.row.name,
  rates: c.indexes.map((i) => {
    const r = (c.row.data as { priceRates: PriceRate[] }).priceRates[i];
    return { index: i, label: r.label, extraDesignFee: r.extraDesignFee ?? null, underMinPieceFee: r.underMinPieceFee ?? null };
  }),
})), null, 1));
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

let ok = 0;
for (const c of changed) {
  const d = JSON.parse(JSON.stringify(c.row.data)) as { priceRates: PriceRate[]; pricing?: unknown; savedAt?: string };
  for (const i of c.indexes) { d.priceRates[i].extraDesignFee = FEE; delete d.priceRates[i].underMinPieceFee; }
  // pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน (ตามที่หน้าแก้ไขสินค้าคาดไว้)
  if (c.indexes.includes(0)) d.pricing = d.priceRates[0].pricing;
  d.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data: d }).eq("id", c.row.id);
  if (e) throw new Error(`${c.row.id}: เขียนไม่ผ่าน — ${e.message}`);
  // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
  const { data: back } = await sb.from("products").select("data").eq("id", c.row.id);
  for (const i of c.indexes) {
    const got = (back?.[0]?.data as { priceRates?: PriceRate[] })?.priceRates?.[i];
    if (got?.extraDesignFee !== FEE || got?.underMinPieceFee != null)
      throw new Error(`${c.row.id}[${i}]: เขียนแล้วแต่อ่านกลับได้ ลายละ ${got?.extraDesignFee} · ชิ้นละ ${got?.underMinPieceFee}`);
  }
  ok++;
}
console.log(`✅ เขียนเรียบร้อย ${ok}/${changed.length} ตัว (อ่านกลับยืนยันแล้วทุกตัว)`);

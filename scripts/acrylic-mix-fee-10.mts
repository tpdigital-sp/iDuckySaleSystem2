/**
 * 🎨 หมวด Keychain & Acrylic 20 ตัว + หมวดสแตนดี้/ของสะสม 25 ตัว + หมวดมือถือ 19 ตัว + หมวดซองบัตร/สายคล้อง 7 ตัว + กระดาษ 3 · ป้าย 4 · แฟชั่น 7 · ของใช้ในบ้าน 14 · ของขวัญ 17 · เครื่องเขียน 14 · ของใช้ 17 · กระเป๋า 15 · สัตว์เลี้ยง 2 — ค่าคละเกินโควตา "ลายละ ฿5 → ฿10" (เจ้าของร้านสั่ง 19 ก.ย. 69)
 *
 * กติกา: สั่ง 11 ชิ้นขึ้นไป ขั้นต่ำลายละ 5 ชิ้น (ฟรี ⌊จำนวน÷5⌋ ลาย) · เกินจากนั้นลายละ ฿10
 *   minPerDesign 5 · freeMixBelowQty 11 ตั้งไว้ครบแล้วทุกตัว — สคริปต์นี้แตะแค่ extraDesignFee
 *   ของทุกเรทที่เดิมเป็น ฿5 (เรทปกติ + เรทตัวแทน) · เรทที่ 2 ส่งโรงงาน (ไม่มีค่าคละ) ไม่แตะ
 *   ข้อความในหน้าสินค้าที่เขียนว่า "ลายละ 5 บาท" แก้เป็น 10 บาทให้ด้วย
 * ⚠️ mix-fee-per-design.mts (ทั้งร้าน ฿5) ข้ามสินค้าที่ตั้งค่าไว้ไม่ใช่ 5 ไม่ได้ — ดู SKIP ในไฟล์นั้น
 *
 *   npx tsx scripts/acrylic-mix-fee-10.mts            # ดูก่อน
 *   npx tsx scripts/acrylic-mix-fee-10.mts --write    # เขียนจริง + สำรองลง backups/
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { tierQtyFor, unitPriceFor, feeBreakdown, RATE_LABEL, DESIGN_LABEL, type PriceRate, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const FROM = 5, FEE = 10;
export const ACRYLIC_FEE10_IDS = [
  "keyring-copy-copy", "acrylic-sheet", "keyring-multi-charm", "keyring-clear-stopper", "new-mt2rp5i3-9488",
  "new-mt2rpb1j-2194", "new-mt2rqayf-7835", "prb-acrylic", "3d-acrylic", "acrylic-ring-frame",
  "otheracrylicproducts5-1", "carabiner-acrylic", "acrylicmagnet-1", "1", "standymusic-2", "standymusic-3",
  "nfc", "peek-a-boo-acrylic", "oclockdigital-1", "acrylic-prakob",
  // ── หมวด Acrylic & Collectibles — สแตนดี้ / ของสะสม 25 ตัว (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) ──
  "standy", "new-mszjfv14-2341", "mini-standee", "standee-spring", "mini-standee-2", "standee-rotating",
  "rotating-stand", "standee-keyring", "standee-clip", "standee-frame-card", "standymusic-1", "new-mszsx3ql-5569",
  "new-mt1k6h3q-6601", "new-mt1dwpc1-6773", "1-3", "light-stick", "light-bon", "light-box", "acrylic-pirate-ship",
  "new-mt2ro493-8195", "acrylic-dream-world", "acrylic-swinger-variety", "acrylic-bending-1", "photoframe-2", "photoframe-3",
  // ── หมวด Phone & Gadget — เคส / ของใช้มือถือ 19 ตัว (เจ้าของร้านสั่งต่อ 19 ก.ย. 69 · เคสมือถือลายละ 3 ไม่อยู่ในลิสต์) ──
  "1-4", "griptok-th", "new-mt8fg70f-8328", "griptok-magsafe", "phone-stand-bend-base", "griptok-clear-mirror",
  "buckle-acrylic", "360-phone-stand", "phone-stand-3-step", "1-2", "case-airpods", "phone-strap", "power-bank",
  "phone-back-clip", "magsafe-wallet", "griptok-emboss", "griptok-glitter", "griptok-push-pull", "griptok-mirror",
  // ── หมวด Card Holder & Lanyard — ซองใส่บัตร / สายคล้อง 7 ตัว (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) ──
  "cardholder-white", "cardholder-clear", "frame-card", "photo-fram-acrylic", "gadgetphone-4", "cardholder", "passport-case",
  // ── Paper Goods 3 · Posters & Banners 4 · Fashion 7 (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) ──
  // ⚠️ หมวกบักเก็ต 2 ตัว + โปสเตอร์แขวนผนัง ขั้นต่ำลายละ 3 (ไม่ใช่ 5) — สคริปต์นี้แตะแค่ค่าคละ ไม่แตะ minPerDesign
  "pricelist-shikishi", "ultra-hard-cardboard-2-mm", "card-broad-foam-2-mm",
  "uv-2", "x-stand", "roll-up", "2-2-2",
  "new-mt2omp9n-3490", "new-mt2omund-2845", "new-mt2omz1g-3978", "scarf", "shawl", "scrunchy", "new-mt2pl7cv-132",
  // ── Home & Living 14 · Gift & Set 17 (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) ──
  // ⚠️ ตุ๊กตากระต่าย ขั้นต่ำลายละ 3 — แตะแค่ค่าคละ · การ์ดสเปรย์เรท 20 ml (ขั้นต่ำ 5 ไม่มีช่วงคละฟรี) ขึ้น ฿10 ด้วย
  "blanket-th", "doormat", "cushion", "towel", "facecloth", "pillowcases-1", "pillowcases-4", "pillowcases-5",
  "pillowcases-6", "pillow-blanket", "blanket-hoodie", "sleep-mask", "sticky-fabric", "pillowcase-bolster",
  "new-mt2s1we8-1325", "new-mt2saszv-9863", "folding-fan", "hand-fan-paper", "canvas-frame", "photoframe-4",
  "photoframe-5", "puzzle", "photoframe-8", "uv", "otherbag-7", "otherbag-8", "pillow-keychain", "doll-die-cut",
  "scented-stone", "scented-bag", "hand-fan-uv",
  // ── Stationery & Office 14 · Daily Goods 17 (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) · ⚠️ WALL TIDY ขั้นต่ำลายละ 3 — แตะแค่ค่าคละ ──
  "notebook-ring", "new-mt2s9i0u-5323", "mousepad", "otheracrylicproducts2-1", "otheracrylicproducts2-2", "clipboard-acrylic",
  "otheracrylicproducts2-5", "otheracrylicproducts2-6", "otheracrylicproducts2-9", "otheracrylicproducts3-3", "3x3-7-62cm",
  "mini-calendar", "40x85cm", "wall-tidy",
  "mirror-hand", "new-msodn3he-7357", "mug-11oz", "coaster-ceramic", "coasters-glitter", "placemat", "mirror-4",
  "mirror-comb-set", "otheracrylicproducts3-1", "lighter", "otheracrylicproducts3-5", "otheracrylicproducts4-4",
  "acrylic-coaster", "silicone-coaster", "mugcoaster-8", "doormat-2", "golf-umbrella",
  // ── Bags & Wallets 15 · สัตว์เลี้ยง 2 (เจ้าของร้านสั่งต่อ 19 ก.ย. 69) · ⚠️ ปลอกคอ/เสื้อสัตว์เลี้ยง ขั้นต่ำลายละ 3 — แตะแค่ค่าคละ ──
  "clip-pouch", "drawstring-bag", "hologram-bag", "candy-bag", "mini-folder", "laptop-bag", "shoulder-bag", "crossbody-bag",
  "flex-print", "clothbag-4", "premium-bag", "semi-bag", "20x34-5cm", "premiumbag-9", "wallet",
  "collar-animal", "catdogcollar-4",
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Row = { id: string; name: string; price: number; category: string; data: Record<string, unknown> };
const toProduct = (row: Row): Product => ({ id: row.id, name: row.name, price: row.price, category: row.category, ...(row.data as object) } as Product);

function sampleSelections(rate: PriceRate): Record<string, string> | undefined {
  const labels = rate.pricing?.driverLabels ?? [];
  const key = Object.keys(rate.pricing?.cells ?? {})[0];
  if (key === undefined) return undefined;
  if (!labels.length) return {};
  const parts = key.split("│");
  return parts.length === labels.length ? Object.fromEntries(labels.map((l, i) => [l, parts[i]])) : undefined;
}
function linePrice(p: Product, sel: Record<string, string>, qty: number): number {
  const tq = tierQtyFor(p, sel, qty);
  return unitPriceFor(p, sel, qty) * qty + feeBreakdown(p, sel, qty, tq).reduce((s, l) => s + l.amount, 0);
}
/** แก้ข้อความ "ลายละ 5 บาท" / "ลายละ ฿5" ทุกที่ใน data (แท็บ/FAQ/desc) — ไม่แตะตัวเลขอื่น */
const fixText = (json: string) => json.replace(/(ลายละ\s*)(?:5(\s*บาท)|฿\s*5(?!\d))/g, (_m, a, b) => (b ? `${a}${FEE}${b}` : `${a}฿${FEE}`));

const { data, error } = await sb.from("products").select("id,name,price,category,data").in("id", ACRYLIC_FEE10_IDS);
if (error) throw error;
const rows = (data ?? []) as Row[];
const missing = ACRYLIC_FEE10_IDS.filter((id) => !rows.some((r) => r.id === id));
if (missing.length) throw new Error(`หาไม่เจอ: ${missing.join(", ")}`);

const plan: { row: Row; next: Record<string, unknown>; indexes: number[] }[] = [];
for (const row of rows) {
  const rates = ((row.data as { priceRates?: PriceRate[] }).priceRates ?? []);
  const indexes = rates.map((r, i) => ({ r, i })).filter(({ r }) => (r.minPerDesign ?? 0) > 1 && (r.extraDesignFee === FROM || r.extraDesignFee === FEE)).map(({ i }) => i);
  const bad = rates.filter((r) => r.underMinPieceFee);
  if (bad.length) throw new Error(`${row.id}: มี underMinPieceFee ค้างอยู่ — ตรวจก่อน`);
  if (!indexes.length) throw new Error(`${row.id}: ไม่มีเรทที่ตั้งค่าคละลายละ ฿${FROM}`);
  const next = JSON.parse(fixText(JSON.stringify(row.data))) as { priceRates: PriceRate[]; pricing?: unknown; savedAt?: string };
  for (const i of indexes) next.priceRates[i].extraDesignFee = FEE;
  const textChanged = fixText(JSON.stringify(row.data)) !== JSON.stringify(row.data);
  const feeChanged = indexes.some((i) => rates[i].extraDesignFee !== FEE);

  // ตัวอย่างราคา 11 ชิ้น: 2 ลาย (ในโควตา) · 3 ลาย (เกิน 1) · 11 ลาย (เกิน 9)
  const base = rates.find((r) => !r.dealerOnly && (r.minPerDesign ?? 0) > 1)!;
  const s0 = sampleSelections(base);
  let sample = "(แกะสเปคตัวอย่างไม่ได้)";
  if (s0) {
    const before = toProduct(row), after = toProduct({ ...row, data: next });
    sample = [2, 3, 11].map((d) => {
      const sel = { ...s0, [RATE_LABEL]: base.label, [DESIGN_LABEL]: `${d} ลาย` };
      const b = Math.round(linePrice(before, sel, 11)), a = Math.round(linePrice(after, sel, 11));
      return `${d} ลาย ฿${b}→฿${a}`;
    }).join(" · ");
  }
  console.log(`${feeChanged || textChanged ? "✏️ " : "✔︎ "} ${row.id} | ${row.name} — เรท [${indexes.join(",")}]${textChanged ? " + ข้อความ" : ""} · 11 ชิ้น: ${sample}`);
  if (feeChanged || textChanged) plan.push({ row, next, indexes });
}

console.log(`\nจะเขียน ${plan.length}/${rows.length} ตัว`);
if (!WRITE) { console.log("👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }
if (!plan.length) process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/acrylic-mix-fee-10-before-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(plan.map((c) => ({ id: c.row.id, name: c.row.name, data: c.row.data })), null, 1));
console.log(`💾 สำรองค่าเดิม (data ทั้งก้อน) ไว้ที่ ${backupPath}`);

let ok = 0;
for (const c of plan) {
  const d = c.next as { priceRates: PriceRate[]; pricing?: unknown; savedAt?: string };
  if (c.indexes.includes(0)) d.pricing = d.priceRates[0].pricing;
  d.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data: d }).eq("id", c.row.id);
  if (e) throw new Error(`${c.row.id}: เขียนไม่ผ่าน — ${e.message}`);
  const { data: back } = await sb.from("products").select("data").eq("id", c.row.id);
  for (const i of c.indexes) {
    const got = (back?.[0]?.data as { priceRates?: PriceRate[] })?.priceRates?.[i];
    if (got?.extraDesignFee !== FEE) throw new Error(`${c.row.id}[${i}]: อ่านกลับได้ ลายละ ${got?.extraDesignFee}`);
  }
  ok++;
}
console.log(`✅ เขียนเรียบร้อย ${ok}/${plan.length} ตัว (อ่านกลับยืนยันแล้ว)`);

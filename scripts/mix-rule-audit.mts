/**
 * 🎨 ตรวจทั้งร้าน — สินค้าตัวไหน "ไม่แสดงระบบคละลาย" บนหน้าเว็บ (เจ้าของร้านถาม 15 ก.ย. 69)
 *
 * เกณฑ์เดียวกับหน้าสินค้า: กล่อง "🎨 คละกี่ลาย" ขึ้นเมื่อ needDesignsChoice = true
 *   = เรทที่เลือกอยู่มี minPerDesign > 0  หรือ  tierByDesign  หรือ  mixRule (สินค้า/เรท/ตัวเลือก)
 *   (ดู src/app/(shop)/products/[id]/ProductDetail.tsx บรรทัด needDesignsChoice)
 *
 * แบ่งผลเป็น 5 กอง เทียบกับ "สูตรมาตรฐาน" ของอะคริลิคกระจก = 11 ชิ้นขึ้นไป · ขั้นต่ำ 5 ชิ้น/แบบ · เกินโควตาลายละ ฿5
 *   A ตรงสูตร · B มีขั้นต่ำ+ค่าคละ แต่ตัวเลขต่าง · C มีขั้นต่ำแต่ไม่มีค่าคละ (คละเกินไม่ได้)
 *   D ไม่มีขั้นต่ำต่อแบบ (คละอิสระ) · E ไม่มีระบบคละเลย
 *
 *   npx tsx scripts/mix-rule-audit.mts            # สินค้าที่เปิดขาย
 *   npx tsx scripts/mix-rule-audit.mts --all      # รวมฉบับร่างด้วย
 *   npx tsx scripts/mix-rule-audit.mts --json     # ออกเป็น JSON
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ALL = process.argv.includes("--all");
const JSONOUT = process.argv.includes("--json");
const PSEUDO = ["__templates__", "__presets__", "__settings__"]; // ไม่ใช่สินค้าจริง

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from("products").select("id,name,category,data").limit(3000);
if (error) throw error;

type Item = ReturnType<typeof read> extends undefined ? never : NonNullable<ReturnType<typeof read>>;
function read(row: { id: string; name: string; category: string; data: any }) {
  const d = row.data ?? {};
  if (PSEUDO.includes(row.category)) return undefined;
  if (!ALL && d.hidden) return undefined;
  const rates: any[] = d.priceRates ?? [];
  const pub = rates.filter((r) => !r.dealerOnly);
  if (!pub.length) return undefined; // ไม่มีตารางเรท = ตั้งกติกาคละไม่ได้ (ดู memory legacy-pricing-no-rate)
  // เรทฐาน = เรทที่ลูกค้าเจอก่อน (minQty ต่ำสุด)
  const base = pub.reduce((a, b) => ((b.minQty ?? 1) < (a.minQty ?? 1) ? b : a));
  const mix = { prod: !!d.mixRule, rate: rates.some((r) => r.mixRule), option: JSON.stringify(d.options ?? []).includes('"mixRule"') };
  return {
    id: row.id, name: row.name, cat: row.category, hidden: !!d.hidden,
    unit: base.pricing?.unit ?? d.pricing?.unit ?? "?",
    minQty: base.minQty ?? 1, min: base.minPerDesign ?? 0, extra: base.extraDesignFee ?? 0,
    under: base.underMinPieceFee ?? 0, free: base.freeMixBelowQty ?? 0,
    tierByDesign: !!d.tierByDesign, mixRule: mix.prod || mix.rate || mix.option,
    showsMix: (base.minPerDesign ?? 0) > 0 || !!d.tierByDesign || mix.prod || mix.rate || mix.option,
  };
}

const items = ((data ?? []) as any[]).map(read).filter(Boolean) as NonNullable<ReturnType<typeof read>>[];
const bucketOf = (m: (typeof items)[number]) =>
  !m.showsMix ? "E" : m.min > 1 && (m.extra > 0 || m.under > 0) ? (m.min === 5 && m.extra === 5 && m.free === 11 ? "A" : "B") : m.min > 1 ? "C" : "D";
const TITLE: Record<string, string> = {
  A: "ตรงสูตรมาตรฐาน (11 ชิ้น · ขั้นต่ำ 5/แบบ · ลายละ ฿5)",
  B: "มีขั้นต่ำต่อแบบ + ค่าคละ แต่ตัวเลขต่างจากสูตร",
  C: "⚠️ มีขั้นต่ำต่อแบบ แต่ไม่มีค่าคละ — คละเกินโควตาไม่ได้ (ปุ่มตัน)",
  D: "คละอิสระ (ไม่มีขั้นต่ำต่อแบบ)",
  E: "❌ ไม่แสดงระบบคละลายเลย",
};

const groups: Record<string, typeof items> = {};
for (const m of items) (groups[bucketOf(m)] ??= []).push(m);

if (JSONOUT) {
  console.log(JSON.stringify(items.map((m) => ({ ...m, bucket: bucketOf(m) })), null, 1));
} else {
  for (const k of ["A", "B", "C", "D", "E"]) {
    const g = (groups[k] ?? []).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
    console.log(`\n### ${k} ${TITLE[k]} — ${g.length} รายการ`);
    if (k === "A") continue; // กองใหญ่ที่ถูกต้องแล้ว ไม่ต้องกาง
    for (const m of g)
      console.log(
        ` ${m.hidden ? "[ร่าง] " : ""}${m.cat.padEnd(14)} ${m.id.padEnd(28)} ${m.name.slice(0, 34).padEnd(36)}` +
          ` หน่วย:${m.unit} | ขั้นต่ำ ${m.minQty} | /แบบ ${m.min} | ลายละ ฿${m.extra}` +
          `${m.under ? ` | ชิ้นละ ฿${m.under}` : ""}${m.free ? ` | ฟรี<${m.free}` : ""}` +
          `${m.tierByDesign ? " | tierByDesign" : ""}${m.mixRule ? " | mixRule" : ""}`
      );
  }
  console.log(`\nรวมสินค้าจริง ${items.length} รายการ`);
}

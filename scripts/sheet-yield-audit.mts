/**
 * 🔍 ด่านตรวจ "จำนวนชิ้นต่อ 1 หน่วยขาย" ทั้งร้าน — หาจุดที่ตัวเลขบนหน้าเว็บจะเพี้ยนก่อนลูกค้าเจอ
 *
 *   npx tsx scripts/sheet-yield-audit.mts           สรุปผล (ปิดท้ายด้วย ❌/⚠️/✓)
 *   npx tsx scripts/sheet-yield-audit.mts --full    กางทุกเคสที่ไม่ตรง (ไม่ตัดเหลือตัวอย่าง)
 *   npx tsx scripts/sheet-yield-audit.mts --docs    ตรวจใบเสนอราคา/ออเดอร์ที่แช่เลขเก่าไว้ด้วย
 *
 * ทำไมต้องมี: เรื่อง "จำนวนไม่ตรง" กลับมาหลายรอบเพราะตัวเลขมาจาก 4 ทางที่แก้กันคนละที
 *   (ตารางของร้าน perSheetTiers · การจัดวาง sheetYield · เลขคงที่ piecesPerUnit · ตัวคูณหน่วยขาย unitSheets)
 * สคริปต์นี้เดินทุกสินค้าในฐาน แล้วเทียบกับ **โปรแกรม Print-Fit ตัวจริง** (~/Desktop/Print-Fit/js/print-fit.js)
 * ที่ร้านใช้จัดวางหน้างาน — ดู [[iducky-sheet-yield-printfit]] · [[iducky-diecut100-longest-only]]
 *
 * เกณฑ์:
 *   ❌ บอกเกินจริง  = เว็บบอกมากกว่าที่ Print-Fit วางได้ → ลูกค้าสั่งแผ่นน้อยกว่าที่ต้องใช้จริง (ร้านเสียหาย)
 *   ⚠️ บอกต่ำกว่าจริง = เว็บบอกน้อยกว่าจริงเกิน 20% → ลูกค้าจ่ายเกินความจำเป็น (เคส 13.97 × 7 = 6 แทนที่จะเป็น 10)
 * ⚠️ เทียบได้เฉพาะกลุ่มที่ใช้ชีทเดียวกับ Print-Fit (ไดคัท 43.76 × 28.89 เว้น 0.5) กลุ่มที่ใช้แผ่นอื่นจะบอกว่า "ไม่ได้เทียบ"
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetFitCount, orderUnitYield, type Product, type ProductOption, type SheetYield } from "../src/lib/products";
import { resolveOptions } from "../src/lib/option-presets";
import { itemSel } from "../src/lib/item-yield";

const FULL = process.argv.includes("--full");
const DOCS = process.argv.includes("--docs");

// ───────── โปรแกรมจัดวางตัวจริงของร้าน ─────────
const PF_PATH = `${process.env.HOME}/Desktop/Print-Fit/js/print-fit.js`;
let pfSrc = "";
try {
  pfSrc = readFileSync(PF_PATH, "utf8");
} catch {
  console.error(`✗ เปิด ${PF_PATH} ไม่ได้ — ต้องมี Print-Fit อยู่บนเครื่องถึงจะเทียบตัวเลขได้`);
  process.exit(1);
}
const grabFn = (name: string) => {
  const i = pfSrc.indexOf(`function ${name}(`);
  let depth = 0,
    end = pfSrc.indexOf("{", i);
  for (let k = end; k < pfSrc.length; k++) {
    if (pfSrc[k] === "{") depth++;
    else if (pfSrc[k] === "}" && !--depth) {
      end = k + 1;
      break;
    }
  }
  return pfSrc.slice(i, end);
};
const pf: any = await import(
  "data:text/javascript," +
    encodeURIComponent(`${grabFn("runPacking")}\n${grabFn("isRectContained")}\nexport { runPacking };`)
);
const PF_SHEET = { w: 48.26, h: 33.02, safe: { x0: 0.03627, y0: 0.04737, x1: 0.96373, y1: 0.95263 } };
const PF_PRINTABLE = {
  x: 0,
  y: 0,
  w: (PF_SHEET.safe.x1 - PF_SHEET.safe.x0) * PF_SHEET.w,
  h: (PF_SHEET.safe.y1 - PF_SHEET.safe.y0) * PF_SHEET.h,
};
const pfCache = new Map<string, number>();
/** จำนวนสูงสุดที่ Print-Fit วางได้ต่อ 1 แผ่น (โหมด Auto = ปล่อยช่องจำนวนว่าง) */
const printFitAuto = (w: number, h: number): number => {
  const k = `${w}|${h}`;
  let v = pfCache.get(k);
  if (v == null) {
    v = Math.max(
      ...["BSSF", "BAF"].map(
        (heuristic) =>
          pf.runPacking(
            [{ w, h, quantity: Infinity, isAuto: true, placedCount: 0 }],
            { w: PF_SHEET.w, h: PF_SHEET.h },
            PF_PRINTABLE,
            0.5,
            0.5,
            heuristic
          ).placedItems.length
      )
    );
    pfCache.set(k, v);
  }
  return v;
};
/** สเปกชีทที่เทียบกับ Print-Fit ได้ (ไดคัท 100% แผ่น A3 ของร้าน) */
const comparable = (cfg: SheetYield) =>
  Math.abs(cfg.sheetW - 43.76) < 0.01 && Math.abs(cfg.sheetH - 28.89) < 0.01 && (cfg.gap ?? 0) === 0.5 && !cfg.addH;

// ───────── โหลดสินค้าจริง ─────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,data");
if (error) throw error;
const presets = (rows ?? []).map((r: any) => r.data).filter((p: any) => p?.id && p?.choices);
const products: Product[] = [];
for (const r of rows ?? []) {
  const p: any = (r as any).data;
  if (!p?.id || String((r as any).id).startsWith("__") || p.choices) continue;
  products.push(p.options?.some((o: any) => o.presetId) ? { ...p, options: resolveOptions(p.options, presets) } : p);
}
console.log(`สินค้าในฐาน ${products.length} ตัว · เทียบกับ ${PF_PATH}\n`);

const over: string[] = []; // ❌ บอกเกินจริง
const under: string[] = []; // ⚠️ บอกต่ำกว่าจริงมาก
const broken: string[] = []; // ❌ ตั้งค่าพัง นับไม่ได้เลย
const skipped: string[] = []; // ℹ️ เทียบไม่ได้ (แผ่นคนละสเปก)
const push = (arr: string[], line: string) => {
  if (FULL || arr.length < 12) arr.push(line);
  else if (arr[arr.length - 1] !== "…") arr.push("…");
};

// ───────── 1) กลุ่มที่นับชิ้นจากขนาดที่ลูกค้ากรอก ─────────
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
for (const p of products) {
  for (const opt of p.options ?? []) {
    const cfg = opt.sheetYield;
    if (!cfg) continue;
    const pair = (p.options ?? []).filter((o: ProductOption) => o.label === cfg.pairLabel);
    if (!pair.length) {
      broken.push(`${p.id} / ${opt.label} — pairLabel "${cfg.pairLabel}" ไม่มีกลุ่มนี้ในสินค้า → นับชิ้นไม่ได้เลย`);
      continue;
    }
    if (pair.length > 1) broken.push(`${p.id} / ${opt.label} — มีกลุ่มชื่อ "${cfg.pairLabel}" ซ้ำ ${pair.length} กลุ่ม (อ่านผิดตัวได้)`);
    if (!comparable(cfg)) {
      skipped.push(
        `${p.id} / ${opt.label} — แผ่น ${cfg.sheetW}×${cfg.sheetH} เว้น ${cfg.gap ?? 0}${cfg.addH ? ` เผื่อสูง ${cfg.addH}` : ""} (ไม่ใช่ชีทไดคัทของ Print-Fit)`
      );
      continue;
    }
    const bound = { w: num(pair[0].input?.max), h: num(opt.input?.max) };
    const wMin = Math.max(num(pair[0].input?.min) ?? 3, 2),
      wMax = Math.min(bound.w ?? 30, 30);
    const hMin = Math.max(num(opt.input?.min) ?? 3, 2),
      hMax = Math.min(bound.h ?? 42, 42);
    let worstOver = 0,
      worstUnder = 0,
      exOver = "",
      exUnder = "",
      nOver = 0,
      nUnder = 0;
    for (let w = wMin; w <= wMax; w += 0.5)
      for (let h = hMin; h <= hMax; h += 0.5) {
        const web = sheetFitCount(cfg, w, h, bound);
        const real = printFitAuto(w, h);
        if (real === 0) continue; // งานเต็มแผ่น (เว็บนับ 1 ตามกติกาของร้าน)
        if (web > real) {
          nOver++;
          if (web - real > worstOver) (worstOver = web - real), (exOver = `${w}×${h} ซม. เว็บ ${web} · จริง ${real}`);
        } else if (web > 0 && real - web > Math.max(1, real * 0.2)) {
          nUnder++;
          if (real - web > worstUnder) (worstUnder = real - web), (exUnder = `${w}×${h} ซม. เว็บ ${web} · จริง ${real}`);
        }
      }
    const how = cfg.perSheetTiers ? (cfg.longestOnly ? "ตารางร้าน+จัดวาง" : "ตารางร้าน") : "จัดวาง";
    if (nOver) push(over, `${p.id} / ${opt.label} (${how}) — บอกเกิน ${nOver} ขนาด · หนักสุด ${exOver}`);
    if (nUnder) push(under, `${p.id} / ${opt.label} (${how}) — บอกต่ำ ${nUnder} ขนาด · หนักสุด ${exUnder}`);
  }
}

// ───────── 2) เลขคงที่ต่อตัวเลือก (piecesPerUnit) ที่ชื่อบอกขนาดมาด้วย ─────────
/*
 * ตัวเลือก "ตัดเป็นขนาด A4/A5/…" เป็นงาน **ตัดชิด** บนแผ่นเต็ม (ชีท 48.26 × 33.02 ไม่เว้นช่องไฟ)
 * ไม่ใช่งานไดคัทที่ต้องเว้น 5 มม. — เทียบกับ Print-Fit ตรง ๆ จะฟ้องผิดหมด (A4 = 2 ใบ/แผ่นถูกแล้ว)
 * เพดานที่ใช้จึงเป็นกริดตัดชิดบนแผ่นเต็ม: เกินเมื่อไหร่ = ตัวเลขเป็นไปไม่ได้จริง ๆ
 */
const sizeInName = (name: string) => {
  const m = [...name.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*ซม/g)].pop();
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};
const gridFull = (w: number, h: number) => {
  const one = (a: number, b: number) => Math.floor(PF_SHEET.w / a) * Math.floor(PF_SHEET.h / b);
  return Math.max(one(w, h), one(h, w));
};
for (const p of products) {
  for (const opt of p.options ?? []) {
    for (const c of opt.choices ?? []) {
      const per = c.piecesPerUnit;
      if (!per || per <= 1) continue;
      const sz = sizeInName(c.name);
      if (!sz) continue;
      const cap = gridFull(sz.w, sz.h);
      if (cap && per > cap)
        push(over, `${p.id} / ${opt.label} → "${c.name}" ตั้งไว้ ${per} ชิ้น/แผ่น · ตัดชิดบนแผ่นเต็มได้แค่ ${cap}`);
    }
  }
}

// ───────── 3) หน่วยขายของเรทที่ระบบยังไม่รู้ตัวคูณ (เคสสติ๊กเกอร์ UV ตร.ม.) ─────────
const unitless: string[] = [];
for (const p of products) {
  const sy = (p.options ?? []).find((o: ProductOption) => o.sheetYield)?.sheetYield;
  if (!sy) continue;
  const sheetName = sy.sheetName ?? "แผ่น";
  const units = new Set<string>();
  for (const r of (p as any).rates ?? []) if (r?.pricing?.unit) units.add(r.pricing.unit);
  if ((p as any).pricing?.unit) units.add((p as any).pricing.unit);
  for (const u of units)
    if (u !== sheetName && !sy.unitSheets?.[u] && u !== "ชิ้น")
      unitless.push(`${p.id} — เรทขายเป็น "${u}" แต่กลุ่มนับชิ้นเป็น "${sheetName}" และไม่มีตัวคูณใน unitSheets`);
}

// ───────── 4) ใบที่แช่เลขไว้ (ทางเลือก --docs) ─────────
const docs: string[] = [];
if (DOCS) {
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const table of ["orders", "quotes"] as const) {
    const { data: docRows } = await sb.from(table).select("id,data");
    for (const row of docRows ?? []) {
      const d: any = (row as any).data;
      for (const it of d?.items ?? []) {
        const frozen = it.unitYield?.per;
        if (!frozen || frozen <= 1) continue;
        const prod = byId.get(it.productId);
        if (!prod) continue;
        const now = orderUnitYield(prod, itemSel(it) as Record<string, string>);
        if (!now || now.per <= 1 || now.per === frozen) continue;
        docs.push(
          `${row.id} · ${it.name} — แช่ไว้ ${frozen} · วันนี้ ${now.per} ${now.piece}/${now.unit} (${d.status ?? "-"})`
        );
      }
    }
  }
}

// ───────── สรุป ─────────
const section = (icon: string, title: string, lines: string[]) => {
  console.log(`${icon} ${title}: ${lines.length ? lines.length : "ไม่มี"}`);
  for (const l of lines) console.log(`   ${l}`);
  console.log("");
};
section("❌", "บอกจำนวนเกินจริง (ลูกค้าสั่งแผ่นไม่พอ)", over);
section("⚠️", "บอกจำนวนต่ำกว่าจริงเกิน 20% (ลูกค้าจ่ายเกิน)", under);
section("❌", "ตั้งค่าพัง นับชิ้นไม่ได้", broken);
section("⚠️", "เรทที่ระบบไม่รู้ตัวคูณหน่วยขาย", unitless);
section("ℹ️", "กลุ่มที่เทียบกับ Print-Fit ไม่ได้ (ใช้แผ่นคนละสเปก — ต้องเช็คด้วยมือ)", skipped);
if (DOCS) section("🧊", "ใบที่แช่เลขไว้ไม่ตรงกับสินค้าวันนี้", docs);
const bad = over.filter((l) => l !== "…").length + broken.filter((l) => l !== "…").length;
console.log(bad ? `⛔ ต้องแก้ ${bad} จุด (บอกเกินจริง/นับไม่ได้)` : "✓ ไม่มีจุดที่บอกจำนวนเกินจริง");
process.exit(bad ? 1 : 0);

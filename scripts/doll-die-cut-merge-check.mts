/**
 * 🧪 ตรวจหน้ารวม "ตุ๊กตาไดคัท (DOLL DIE-CUT)" ด้วยเครื่องคิดราคาตัวจริง (ตัวเดียวกับตะกร้า)
 *
 *   npx tsx scripts/doll-die-cut-merge-check.mts                    # เทียบ .cache/doll-merge/merged.json กับสินค้าเดิม 2 ตัวใน DB
 *   npx tsx scripts/doll-die-cut-merge-check.mts --db               # เทียบของที่เขียนลง DB แล้ว กับ before-*.json ที่ดัมป์ไว้
 *
 * เช็ค 5 อย่าง:
 *  1. ราคา/หน่วยทุกช่อง ทุกช่วงจำนวน ต้องเท่าสินค้าเดิมเป๊ะ (งานสกรีน 16 ช่อง · งานปัก 3 ช่อง)
 *  2. ค่าเริ่มต้นของแต่ละเรทต้องตกที่ขนาดของเรทนั้น (resolveSelections)
 *  3. กลุ่มที่โผล่/ไม่โผล่ ตามแบบงานที่เลือก (optionActive)
 *  4. บรรทัดงานปักในตะกร้า ต้องไม่ถูก repairRateFromOptions สลับไปเรทงานสกรีน
 *  5. ตะกร้าที่มีทั้ง 2 แบบงาน ต้องไม่ข้ามตารางราคากัน (repriceCartGroups)
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  RATE_LABEL,
  optionActive,
  repairRateFromOptions,
  repriceCartGroups,
  resolveSelections,
  unitPriceFor,
  type Product,
} from "../src/lib/products";

const FROM_DB = process.argv.includes("--db");
const OUT = ".cache/doll-merge";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const toP = (r: any): Product => ({ id: r.id, name: r.name, price: r.price, category: r.category, ...(r.data as any) });

/** สินค้าเดิม 2 ตัว — อ่านจาก DB ถ้ายังไม่ยุบ, ไม่งั้นอ่านจากไฟล์ before-*.json ที่สคริปต์ยุบดัมป์ไว้ */
function beforeFile(id: string): Product {
  const re = new RegExp(`^before-${id}-\\d+\\.json$`); // ⚠️ startsWith เฉย ๆ จะทำให้ doll-die-cut ไปคว้าไฟล์ของ doll-die-cut-2
  const f = readdirSync(OUT).filter((n) => re.test(n)).sort().pop();
  if (!f) throw new Error(`ไม่เจอ ${OUT}/before-${id}-*.json — รัน scripts/doll-die-cut-merge.mjs ก่อน`);
  return toP(JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")));
}
const origScreen = beforeFile("doll-die-cut-2");
const origEmb = beforeFile("doll-die-cut");

let merged: Product;
if (FROM_DB) {
  const { data, error } = await sb.from("products").select("id,name,price,category,data").eq("id", "doll-die-cut").single();
  if (error) throw error;
  merged = toP(data);
} else {
  const d = JSON.parse(readFileSync(`${OUT}/merged.json`, "utf8"));
  merged = { id: d.id, name: d.name, price: d.price, category: d.category, ...d };
}
console.log(`ตรวจ: ${merged.name} (${FROM_DB ? "จาก DB" : "จาก merged.json"}) · ${merged.priceRates?.length} เรท\n`);

const RATE_SCREEN = "งานสกรีน";
const RATE_EMB = "งานปัก";
const QTYS = [1, 5, 10, 11, 49, 50, 199, 200, 499, 500, 1999, 2000, 4999, 5000];
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

// ── 1. ราคาทุกช่อง ทุกช่วงจำนวน ต้องเท่าของเดิม ──────────────────────
let checked = 0;
const sizesOf = (p: Product) => (p.options.find((o) => o.label === "ขนาด")?.choices ?? []).map((c) => c.name);
const sidesOf = (p: Product) => (p.options.find((o) => o.label === "พิมพ์ลาย")?.choices ?? []).map((c) => c.name);

for (const size of sizesOf(origScreen)) {
  for (const side of sidesOf(origScreen)) {
    for (const qty of QTYS) {
      const was = unitPriceFor(origScreen, { ขนาด: size, พิมพ์ลาย: side }, qty);
      const now = unitPriceFor(merged, { [RATE_LABEL]: RATE_SCREEN, ขนาด: size, พิมพ์ลาย: side }, qty);
      ok(was === now, `งานสกรีน ${size} · ${side} · ${qty} ใบ: เดิม ฿${was} → ใหม่ ฿${now}`);
      checked++;
    }
  }
}
for (const size of sizesOf(origEmb)) {
  for (const qty of QTYS) {
    const was = unitPriceFor(origEmb, { ขนาด: size }, qty);
    // บรรทัดจริงจะพก "พิมพ์ลาย" ติดมาด้วยเสมอ (แกนตารางราคา) — ราคาต้องไม่เปลี่ยนเพราะค่านั้น
    for (const side of ["", ...sidesOf(origScreen)]) {
      const sel: Record<string, string> = { [RATE_LABEL]: RATE_EMB, ขนาด: size };
      if (side) sel["พิมพ์ลาย"] = side;
      const now = unitPriceFor(merged, sel, qty);
      ok(was === now, `งานปัก ${size} · ${qty} ตัว${side ? ` (พก ${side})` : ""}: เดิม ฿${was} → ใหม่ ฿${now}`);
      checked++;
    }
  }
}
console.log(`1. ราคาต่อหน่วย ${checked} เคส — ${fails.length ? `❌ ต่างกัน ${fails.length}` : "✅ ตรงของเดิมทุกเคส"}`);

// ── 2. ค่าเริ่มต้นของแต่ละเรท ────────────────────────────────────────
const before2 = fails.length;
for (const [rate, want] of [[RATE_SCREEN, sizesOf(origScreen)], [RATE_EMB, sizesOf(origEmb)]] as const) {
  const r = resolveSelections(merged, { [RATE_LABEL]: rate });
  ok(want.includes(r["ขนาด"]), `เรท ${rate}: ค่าเริ่มต้นของ "ขนาด" = "${r["ขนาด"]}" ไม่ใช่ขนาดของเรทนี้`);
  const rateCells = Object.values(merged.priceRates!.find((x) => x.label === rate)!.pricing.cells).flat();
  ok(rateCells.includes(unitPriceFor(merged, { ...r, [RATE_LABEL]: rate }, 1)),
    `เรท ${rate}: ราคาค่าเริ่มต้นไม่ได้มาจากตารางของเรทนี้ (หาช่องไม่เจอ → หล่นไปราคาตั้งต้น ฿${merged.price})`);
}
console.log(`2. ค่าเริ่มต้นต่อเรท — ${fails.length > before2 ? "❌" : "✅ ตกที่ขนาดของเรทตัวเอง"}`);

// ── 3. กลุ่มที่โผล่ตามแบบงาน ─────────────────────────────────────────
const before3 = fails.length;
const shownAt = (rate: string) => {
  const sel = { ...resolveSelections(merged, { [RATE_LABEL]: rate }), [RATE_LABEL]: rate };
  return merged.options.filter((o) => optionActive(o, sel)).map((o) => o.label);
};
const atScreen = shownAt(RATE_SCREEN);
const atEmb = shownAt(RATE_EMB);
for (const l of ["ขนาด", "พิมพ์ลาย", "เนื้อผ้า", "สีไหมเย็บชิ้นงาน"]) ok(atScreen.includes(l), `เรทงานสกรีน: กลุ่ม "${l}" ไม่โผล่`);
ok(!atScreen.includes("สีไหมไม่เกิน 3 สี"), "เรทงานสกรีน: กลุ่มของงานปักโผล่มาด้วย");
for (const l of ["ขนาด", "สีไหมไม่เกิน 3 สี"]) ok(atEmb.includes(l), `เรทงานปัก: กลุ่ม "${l}" ไม่โผล่`);
for (const l of ["พิมพ์ลาย", "เนื้อผ้า", "สีไหมเย็บชิ้นงาน"]) ok(!atEmb.includes(l), `เรทงานปัก: กลุ่ม "${l}" ของงานสกรีนโผล่มาด้วย`);
console.log(`3. กลุ่มตัวเลือกตามแบบงาน — ${fails.length > before3 ? "❌" : `✅ สกรีน [${atScreen.join(", ")}] · ปัก [${atEmb.join(", ")}]`}`);

// ── 4. บรรทัดงานปักต้องไม่ถูกสลับเรท ─────────────────────────────────
const before4 = fails.length;
const embLine = { [RATE_LABEL]: RATE_EMB, ขนาด: sizesOf(origEmb)[2], พิมพ์ลาย: sidesOf(origScreen)[0] }; // พก "พิมพ์ลาย" มาแบบตะกร้าจริง
const repaired = repairRateFromOptions(merged, embLine);
ok(repaired[RATE_LABEL] === RATE_EMB, `บรรทัดงานปักถูกสลับเป็น "${repaired[RATE_LABEL]}" (repairRateFromOptions)`);
console.log(`4. เรทของบรรทัดงานปักในตะกร้า — ${fails.length > before4 ? "❌" : "✅ ยังเป็นงานปัก"}`);

// ── 5. ตะกร้าที่มีทั้ง 2 แบบงาน ──────────────────────────────────────
const before5 = fails.length;
const catalog = (id: string) => (id === merged.id ? merged : undefined);
const cart = [
  { productId: merged.id, selections: { ...embLine }, qty: 6 },
  { productId: merged.id, selections: { [RATE_LABEL]: RATE_SCREEN, ขนาด: sizesOf(origScreen)[2], พิมพ์ลาย: sidesOf(origScreen)[0] }, qty: 6 },
];
const priced = repriceCartGroups(cart, catalog);
const embCells = Object.values(origEmb.priceRates![0].pricing.cells).flat();
const scrCells = Object.values(origScreen.priceRates![0].pricing.cells).flat();
ok(embCells.includes(priced[0].unitPrice), `บรรทัดงานปัก 35 ซม. ในตะกร้าคิดได้ ฿${priced[0].unitPrice} — ไม่ใช่ราคาในตารางงานปักเลย`);
ok(scrCells.includes(priced[1].unitPrice), `บรรทัดงานสกรีน 35x35 ในตะกร้าคิดได้ ฿${priced[1].unitPrice} — ไม่ใช่ราคาในตารางงานสกรีน`);
ok(priced[0].unitPrice !== merged.price, `บรรทัดงานปักหล่นไปราคาตั้งต้น ฿${merged.price}`);
console.log(
  `5. ตะกร้าคละแบบงาน (ปัก 6 + สกรีน 6) — ${fails.length > before5 ? "❌" : `✅ ปัก ฿${priced[0].unitPrice}/ตัว · สกรีน ฿${priced[1].unitPrice}/ใบ (เรท ${priced[0].merged?.rateLabel ?? "-"} / ${priced[1].merged?.rateLabel ?? "-"})`}`
);

console.log(fails.length ? `\n❌ ไม่ผ่าน ${fails.length} ข้อ:\n` + fails.slice(0, 25).map((f) => " · " + f).join("\n") : "\n✅ ผ่านทั้งหมด");
process.exit(fails.length ? 1 : 0);

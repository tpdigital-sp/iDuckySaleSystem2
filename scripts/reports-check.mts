/**
 * 📈 ตรวจตัวเลขหน้ารายงานยอดขาย (/admin/reports) กับออเดอร์จริงในฐาน
 *
 *   npx tsx --tsconfig tsconfig.json scripts/reports-check.mts              เดือนนี้
 *   npx tsx --tsconfig tsconfig.json scripts/reports-check.mts 2026-08-01 2026-08-31
 *
 * ใช้ฟังก์ชันชุดเดียวกับที่เซิร์ฟเวอร์คิดจริง (src/lib/reports.ts) — ไม่มีสูตรก๊อปไว้ในสคริปต์
 * ตรวจ 2 อย่าง: (1) ยอดรวมตรงกับที่บวกเองทีละใบไหม (2) กำไรคิดจากเฉพาะใบที่รู้ต้นทุนจริงไหม
 *
 * ⚠️ ต้นทุนจริงอยู่ใน Firestore (ledger สต๊อก) ซึ่ง import จากสคริปต์ไม่ได้ (server-only)
 *    ตัวนี้จึงใส่ต้นทุนสมมติให้บางใบ เพื่อพิสูจน์ว่า "ใบที่ไม่รู้ต้นทุนไม่ถูกนับเป็นต้นทุน 0"
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildReport, orderDayKey, orderSaleBase, previousRange } from "../src/lib/reports";
import { orderTotal, type Order } from "../src/lib/admin-data";
import type { Quote } from "../src/lib/quotes";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const now = new Date();
const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const from = process.argv[2] ?? `${bkk.slice(0, 7)}-01`;
const to = process.argv[3] ?? bkk;

const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad++;
};

async function all<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await sb
      .from(table)
      .select("data")
      .order("created_at", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const chunk = (data ?? []).map((r) => (r as { data: T }).data).filter(Boolean);
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

const orders = await all<Order>("orders");
const quotes = await all<Quote>("quotes");
const prev = previousRange(from, to);
console.log(`\n📅 ${from} – ${to}  (เทียบ ${prev.from} – ${prev.to})`);
console.log(`ดึงมา ${orders.length} ใบ · ใบเสนอราคา ${quotes.length} ใบ\n`);

// ── ต้นทุนสมมติ: ใส่ให้ครึ่งแรกของใบในช่วง (30% ของฐานคิดกำไร) ──
const inRange = orders.filter((o) => {
  const k = orderDayKey(o);
  return k && k >= from && k <= to && o.status !== "ยกเลิก";
});
const costs = new Map<string, number>();
inRange.slice(0, Math.ceil(inRange.length / 2)).forEach((o) => {
  const c = Math.round(orderSaleBase(o) * 0.3);
  if (c > 0) costs.set(o.id, c);
});

const r = buildReport({ orders, quotes, costs, from, to });
const t = r.totals;

console.log("ยอดขาย         ", baht(t.revenue), `(${t.orders} ใบ)`);
console.log("เก็บเงินแล้ว    ", baht(t.paid), `· ค้าง ${baht(t.outstanding)}`);
console.log("ส่วนลดรวม      ", baht(t.discountTotal), `(สมาชิก ${baht(t.discountTier)} · คูปอง ${baht(t.discountCoupon)} · แอดมิน ${baht(t.discountAdmin)} · โอนไว ${baht(t.discountEarlyPay)})`);
console.log("ค่าส่ง/ค่าบริการ", `${baht(t.shipping)} / ${baht(t.charges)}`);
console.log("ช่วงก่อน       ", baht(r.prev.revenue), `(${r.prev.orders} ใบ)`);
console.log("ใบเสนอราคา     ", `ส่ง ${r.quotes.issued} · ปิดได้ ${r.quotes.accepted} (${r.quotes.rate ?? "—"}%)`);
console.log("\nสินค้าขายดี 5 อันดับ");
r.products.slice(0, 5).forEach((p, i) => console.log(`  ${i + 1}. ${p.label} — ${baht(p.revenue)} · ${p.qty} ชิ้น · ${p.orders} ใบ`));
console.log("\nช่องทาง");
r.channels.forEach((c) => console.log(`  · ${c.label} — ${baht(c.revenue)} · ${c.orders} ใบ`));

console.log("\n🔍 ตรวจความถูกต้อง");
const manual = inRange.reduce((s, o) => s + orderTotal(o), 0);
check("ยอดขายรวม = บวกเองทีละใบ", Math.abs(manual - t.revenue) < 1, `${baht(manual)} vs ${baht(t.revenue)}`);
check("จำนวนใบตรงกัน", inRange.length === t.orders, `${inRange.length} vs ${t.orders}`);
const seriesSum = r.series.reduce((s, p) => s + p.revenue, 0);
check("ผลรวมกราฟ = ยอดขาย", Math.abs(seriesSum - t.revenue) < 1, `${baht(seriesSum)}`);
check("ใบยกเลิกไม่ถูกนับเป็นยอดขาย", !inRange.some((o) => o.status === "ยกเลิก"));
check("กำไร = ยอดที่รู้ต้นทุน − ต้นทุน", Math.abs(t.costedSaleBase - t.cogs - t.profit) < 1, `${baht(t.profit)}`);
check("นับเฉพาะใบที่มีต้นทุน", t.costedOrders === costs.size, `${t.costedOrders} ใบ จากที่ใส่ไว้ ${costs.size} ใบ`);
check(
  "ใบที่ไม่รู้ต้นทุนไม่ถูกลากมาคิดกำไร",
  t.costedSaleBase < t.saleBase || costs.size === inRange.length,
  `ฐานกำไร ${baht(t.costedSaleBase)} · ฐานทั้งหมด ${baht(t.saleBase)}`
);
check("ใบที่ยังไม่รู้ต้นทุนถูกรายงานไว้", r.costGap.orders === inRange.length - t.costedOrders, `${r.costGap.orders} ใบ`);
const margin = t.costedSaleBase > 0 ? (t.profit / t.costedSaleBase) * 100 : 0;
check("กำไรของต้นทุนสมมติ 30% = 70%", Math.abs(margin - 70) < 1.5, `${margin.toFixed(1)}%`);
check("ยอดสินค้าในตารางอันดับไม่เกินยอดสินค้ารวม", r.products.reduce((s, p) => s + p.revenue, 0) <= t.goods + 1);

console.log(bad === 0 ? "\n✅ ผ่านทั้งหมด\n" : `\n❌ ไม่ผ่าน ${bad} ข้อ\n`);
process.exit(bad === 0 ? 0 : 1);

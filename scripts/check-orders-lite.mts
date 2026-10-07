/**
 * 🪶 ด่านเทียบ "ดึงออเดอร์แบบเบา" (src/lib/server/orders-lite.ts) กับก้อนเต็ม — รันกับฐานจริง (อ่านอย่างเดียว)
 *
 *   npm run check:orders-lite
 *
 * เช็คว่า REPORT_ORDER_KEYS / WIP_ORDER_KEYS / QUOTE_LIST_KEYS ยังครบทุกฟิลด์ที่ buildReport · orderTotal · จอ WIP · quoteTotal ใช้
 * (เพิ่มฟิลด์ใหม่ในฟังก์ชันพวกนั้นแล้วลืมเติมรายการคีย์ = ค่าหาย เงียบ ๆ → สคริปต์นี้จะฟ้อง)
 * ถ้ามีวิว orders_lite (supabase/orders-lite.sql) จะเทียบผลจากวิวด้วย
 */
import { getSupabaseAdmin } from "../src/lib/server/supabase-admin";
import { fetchOrdersByStatus, fetchReportOrders, fetchReportQuotes, REPORT_ITEM_KEYS } from "../src/lib/server/orders-lite";
import { buildReport } from "../src/lib/reports";
import { orderTotal, proofsOf, type Order } from "../src/lib/admin-data";
import { quoteStatusOf, quoteTotal, type Quote } from "../src/lib/quotes";
import { WIP_STATUSES } from "../src/lib/wip-report";

const sb = getSupabaseAdmin();
if (!sb) {
  console.error("ยังไม่ได้ตั้งค่า Supabase (.env.local)");
  process.exit(1);
}

const FROM = "2026-07-01T00:00:00+07:00";
const TO = "2099-12-31T23:59:59+07:00";
let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) fails++;
};

async function fullRange<T>(table: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 40; p++) {
    const { data, error } = await sb!.from(table).select("data").gte("created_at", FROM).lte("created_at", TO).order("created_at", { ascending: false }).range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => (r as { data: T }).data));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

// ── 📈 รายงาน ──
const full = await fullRange<Order>("orders");
const lite = await fetchReportOrders(sb, FROM, TO);
ok(!lite.error && lite.rows.length === full.length, `รายงาน: ดึงได้ ${lite.rows.length}/${full.length} ใบ ผ่านทาง ${lite.via}${lite.error ? ` · ${lite.error}` : ""}`);
const ranges: [string, string][] = [
  ["2026-10-01", "2026-10-31"],
  ["2026-09-01", "2026-09-30"],
  ["2026-07-01", "2026-12-31"],
];
for (const [from, to] of ranges) {
  const a = JSON.stringify(buildReport({ orders: full, quotes: [], costs: new Map(), from, to }));
  const b = JSON.stringify(buildReport({ orders: lite.rows, quotes: [], costs: new Map(), from, to }));
  ok(a === b, `รายงาน ${from}–${to}: ตัวเลขเท่ากับก้อนเต็ม`);
  if (a !== b) {
    const A = JSON.parse(a), B = JSON.parse(b);
    for (const k of Object.keys(A.totals)) if (A.totals[k] !== B.totals[k]) console.log(`     totals.${k}: ${A.totals[k]} → ${B.totals[k]}`);
  }
}
// วิวตัดรายการเหลือ REPORT_ITEM_KEYS — จำลองกรณีไม่มีวิว ให้แน่ใจว่าคีย์ชุดนั้นพอ
const viewSim = full.map((o) => ({
  ...o,
  items: (o.items ?? []).map((i) => Object.fromEntries(REPORT_ITEM_KEYS.filter((k) => i[k] != null).map((k) => [k, i[k]]))),
})) as Order[];
{
  const a = JSON.stringify(buildReport({ orders: full, quotes: [], costs: new Map(), from: "2026-07-01", to: "2026-12-31" }));
  const b = JSON.stringify(buildReport({ orders: viewSim, quotes: [], costs: new Map(), from: "2026-07-01", to: "2026-12-31" }));
  ok(a === b, "รายงาน: รายการเหลือแค่ REPORT_ITEM_KEYS (แบบวิว) ตัวเลขยังเท่าเดิม");
}

// ── 🗂 งานค้าง ──
const wipStatuses = [...WIP_STATUSES, "รอชำระเงิน"];
const { data: wipFullRaw, error: wipErr } = await sb.from("orders").select("data").in("data->>status", wipStatuses);
if (wipErr) throw new Error(wipErr.message);
const wipFull = (wipFullRaw ?? []).map((r) => r.data as Order);
const wipLite = await fetchOrdersByStatus(sb, wipStatuses);
const byId = new Map(wipLite.rows.map((o) => [o.id, o]));
ok(!wipLite.error && wipLite.rows.length === wipFull.length, `งานค้าง: ดึงได้ ${wipLite.rows.length}/${wipFull.length} ใบ ผ่านทาง ${wipLite.via}${wipLite.error ? ` · ${wipLite.error}` : ""}`);
const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const WIP_FIELDS = ["id", "customer", "phone", "date", "status", "reopenedFrom", "shipping", "shippingLabel", "shipDate", "useByDate", "rush", "printedAt", "readyToShip", "deposit", "needsPurchase"] as const;
let wipDiff = 0;
for (const a of wipFull) {
  const b = byId.get(a.id);
  if (!b) { wipDiff++; continue; }
  const sa = strip(a) as Record<string, unknown>, sb2 = strip(b) as Record<string, unknown>;
  for (const k of WIP_FIELDS) if (JSON.stringify(sa[k]) !== JSON.stringify(sb2[k])) { wipDiff++; console.log(`     ${a.id} ${k} ต่าง`); }
  if (orderTotal(a) !== orderTotal(b)) { wipDiff++; console.log(`     ${a.id} ยอดรวมต่าง ${orderTotal(a)} → ${orderTotal(b)}`); }
  const ia = (a.items ?? []).map((i) => [i.productId, i.name, i.qty, i.selections, i.sel, i.unitYield, i.artworkUrls, i.artworkBackUrls, i.artworkQty, i.artworkSize, proofsOf(i), i.proofStatus, i.noProof]);
  const ib = (b.items ?? []).map((i) => [i.productId, i.name, i.qty, i.selections, i.sel, i.unitYield, i.artworkUrls, i.artworkBackUrls, i.artworkQty, i.artworkSize, proofsOf(i), i.proofStatus, i.noProof]);
  if (JSON.stringify(ia) !== JSON.stringify(ib)) { wipDiff++; console.log(`     ${a.id} รายการต่าง`); }
}
ok(wipDiff === 0, `งานค้าง: ทุกฟิลด์ที่จอใช้ + ยอดรวม ตรงกับก้อนเต็ม (ต่าง ${wipDiff})`);

// ── 📄 ใบเสนอราคา ──
const qFull = await fullRange<Quote>("quotes");
const qLite = await fetchReportQuotes(sb, FROM, TO);
const qById = new Map(qLite.rows.map((q) => [q.id, q]));
let qDiff = 0;
for (const a of qFull) {
  const b = qById.get(a.id);
  if (!b || quoteTotal(a) !== quoteTotal(b) || quoteStatusOf(a) !== quoteStatusOf(b) || a.items.length !== b.items.length || a.customer !== b.customer) qDiff++;
}
ok(!qLite.error && qLite.rows.length === qFull.length && qDiff === 0, `ใบเสนอราคา: ${qLite.rows.length}/${qFull.length} ใบ ยอด/สถานะตรง (ต่าง ${qDiff})`);


console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ — เติมคีย์ที่ขาดใน src/lib/server/orders-lite.ts` : "\n✅ ผ่านทุกข้อ");
process.exit(fails ? 1 : 0);

/**
 * 🩹 OD-261012-4404 อาร์มปัก 12 ลาย ลายละ 5 ชิ้น (60 ชิ้น) — พนักงานแจ้ง 12 ต.ค. 69
 * 1) ตะกร้าไม่รวมล็อตสินค้าคิดตามพื้นที่ → ทุกบรรทัดได้ขั้น 5-30 ชิ้น (ควรเป็น 31-100)
 * 2) กลุ่มสีไหมไม่มี freeFirstN → คิด ฿10 ตั้งแต่สีแรก (ควรฟรี 3 สี)
 * แก้โค้ด+ข้อมูลสินค้าแล้ว · สคริปต์นี้คิดราคาใหม่ทั้งใบด้วย repriceCartGroups (สินค้าล่าสุดจากฐาน)
 * แล้วปรับราคาต่อชิ้น + บรรทัด Add on สีไหม (เหลือเฉพาะลายที่เกิน 3 สี) ผ่านประตู updateOrder
 *
 * รัน: node --conditions=react-server --import tsx scripts/fix-4404-armpatch-lot.mts [--apply]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, orderTotal, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { syncOrderMemberTier } from "../src/lib/server/order-member-tier";
import { repriceCartGroups, type Product } from "../src/lib/products";

const ID = "OD-261012-4404";
const PID = "armpatch-1";
const APPLY = process.argv.includes("--apply");
const BY = "ระบบ (แก้ย้อนหลัง)";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const existing = data.data as Order;
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PID).single();
if (perr) throw perr;
const product = prow.data as Product;
const thread = product.options.find((o) => o.label.startsWith("สีไหม Madeira"));
if (thread?.freeFirstN !== 3) throw new Error("สินค้ายังไม่ได้ตั้ง freeFirstN 3 — รัน scripts/thread-free-first-3.mjs --write ก่อน");
if ((existing.paidTotal ?? 0) > 0) throw new Error("ใบนี้มียอดรับแล้ว — หยุด ให้คนตัดสินใจ");

const hostIdx = existing.items.map((it, i) => (it.productId === PID ? i : -1)).filter((i) => i >= 0);
if (hostIdx.length !== 12) throw new Error(`คาด 12 บรรทัดอาร์มปัก เจอ ${hostIdx.length}`);
const feeIdx = existing.items.map((it, i) => (it.productId === `${PID}#designfee` ? i : -1)).filter((i) => i >= 0);

const lines = hostIdx.map((i) => ({ productId: PID, selections: existing.items[i].sel!, qty: existing.items[i].qty }));
const rep = repriceCartGroups(lines, (id) => (id === PID ? product : undefined));

const threadLabel = thread.label;
const items: Order["items"] = [];
const changes: string[] = [];
existing.items.forEach((it, i) => {
  if (feeIdx.includes(i)) return; // บรรทัด Add on เก่าทิ้งทั้งหมด สร้างใหม่ด้านล่าง
  const n = hostIdx.indexOf(i);
  if (n < 0) return void items.push(it);
  const r = rep[n];
  if (!(r.unitPrice > 0)) throw new Error(`บรรทัด ${i + 1} คิดราคาไม่ได้`);
  if (r.unitPrice !== it.unitPrice) changes.push(`#${i + 1} ฿${it.unitPrice} → ฿${r.unitPrice} ×${it.qty}`);
  items.push({ ...it, unitPrice: r.unitPrice });
});
// Add on สีไหม: แขวนต่อท้ายบรรทัดอาร์มปักสุดท้าย (เหมือนตอนสั่ง) เฉพาะลายที่เกินโควตา
const fees = hostIdx
  .map((i, n) => ({ host: existing.items[i], fee: rep[n].extraFee }))
  .filter((x) => x.fee > 0)
  .map(({ host, fee }) => {
    const label = `${threadLabel}: ${host.sel![threadLabel]}`;
    const note = `฿${fee} × 1 ลาย`;
    return {
      qty: 1,
      sel: {},
      name: `🎨 Add on — ${host.name} (${label} · ${note})`,
      addOnFor: host.lineKey,
      productId: `${PID}#designfee`,
      unitPrice: fee,
      addOnLines: [{ note, label, amount: fee }],
      selections: "",
    } as Order["items"][number];
  });
const lastHostPos = items.map((it) => it.productId).lastIndexOf(PID);
items.splice(lastHostPos + 1, 0, ...fees);

const oldFee = feeIdx.reduce((s, i) => s + existing.items[i].unitPrice * existing.items[i].qty, 0);
const newFee = fees.reduce((s, f) => s + f.unitPrice, 0);
const before = orderTotal(existing);
const draft = withLog(
  { ...existing, items },
  BY,
  "แก้ราคารายการ",
  `อาร์มปัก 12 ลาย รวม 60 ชิ้น → ขั้น 31-100 ชิ้น (เดิมคิดบรรทัดละ 5 ชิ้น) · ${changes.join(" · ")} · ค่าสีไหม ฿${oldFee} → ฿${newFee} (ฟรี 3 สีแรกต่อลาย) — แก้โค้ด/ข้อมูลสินค้าแล้ว 12 ต.ค. 69`
);
const synced = await syncOrderMemberTier(sb as never, draft);
const after = orderTotal(synced);
console.log(changes.join("\n"));
console.log(`ค่าสีไหม ฿${oldFee} (${feeIdx.length} บรรทัด) → ฿${newFee} (${fees.length} บรรทัด)`);
console.log(`ส่วนลด: ${JSON.stringify(existing.discount)} → ${JSON.stringify(synced.discount)}`);
console.log(`ยอดรวมใบ: ฿${before} → ฿${after}`);
if (!APPLY) {
  console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อบันทึก)");
  process.exit(0);
}
const res = await updateOrder(sb as never, synced, { prev: existing, by: BY });
if (res.error) throw new Error(`บันทึกไม่สำเร็จ: ${res.error.message}`);
const { data: back } = await sb.from("orders").select("data").eq("id", ID).single();
const b = back!.data as Order;
console.log(`\n✓ ${ID} บันทึกแล้ว · ยอดรวม ฿${orderTotal(b)} · รายการ ${b.items.length}`);

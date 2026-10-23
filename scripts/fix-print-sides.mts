/**
 * 🔄 ซ่อมป้ายด้านหน้า/ด้านหลังของแบบจากจอออกแบบ (ออเดอร์ก่อนแก้ 23 ต.ค. 69)
 *
 *   npx tsx --conditions=react-server scripts/fix-print-sides.mts                       (ดูเฉย ๆ ทุกใบ)
 *   npx tsx --conditions=react-server scripts/fix-print-sides.mts OD-261023-1997
 *   npx tsx --conditions=react-server scripts/fix-print-sides.mts OD-261023-1997 --apply
 *   npx tsx --conditions=react-server scripts/fix-print-sides.mts --apply               (แก้ทุกใบที่เจอ)
 *
 * ทำไม (OD-261023-1997): โปสการ์ด 2 ด้าน 8 ใบ = 16 หน้า (หน้า1 หลัง1 หน้า2 …) แต่ระบบนับหน้า 2–16 เป็น "ด้านหลัง" ทั้งหมด
 * → หน้าออเดอร์ขึ้น หน้า 1 · หลัง 15 · ใบสรุปหน้า-หลังไม่ขึ้น
 * ใช้กติกาตัวเดียวกับตะกร้า (fixItemSides ← calSideSplit) — เปลี่ยนแค่ลำดับ artworkUrls + artworkBackUrls ไฟล์ไม่หาย
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { selectAllRows } from "../src/lib/server/select-all";
import { fixItemSides } from "../src/lib/print-sides";

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

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => /^OD-/i.test(a)).map((a) => a.toUpperCase()));
const BY = "ซ่อมป้ายหน้า/หลัง (สคริปต์)";

const { data, error } = await selectAllRows<{ id: string; data: Order }>((from, to) =>
  sb.from("orders").select("id,data").order("id").range(from, to) as never,
);
if (error) {
  console.error(error.message);
  process.exit(1);
}

let hit = 0;
for (const row of data) {
  if (only.size && !only.has(row.id.toUpperCase())) continue;
  const order = row.data;
  const fixes = (order.items ?? []).map((it) => fixItemSides(it));
  if (!fixes.some(Boolean)) continue;
  hit++;
  console.log(`\n${row.id} · ${order.customer} · ${order.status}`);
  const notes: string[] = [];
  const items = order.items.map((it, i) => {
    const f = fixes[i];
    if (!f) return it;
    const was = `หน้า ${(it.artworkUrls?.length ?? 0) - (it.artworkBackUrls?.length ?? 0)} · หลัง ${it.artworkBackUrls?.length ?? 0}`;
    const now = `หน้า ${f.urls.length - f.back.length} · หลัง ${f.back.length}`;
    console.log(`   รายการที่ ${i + 1} ${it.name}: ${was} → ${now}`);
    notes.push(`รายการที่ ${i + 1} ${it.name}: ${was} → ${now}`);
    return { ...it, artworkUrls: f.urls, artworkBackUrls: f.back };
  });
  if (!apply) continue;
  const logged = withLog({ ...order, items }, BY, "🔄 ซ่อมป้ายด้านหน้า/ด้านหลังของไฟล์จากจอออกแบบ", notes.join(" · ") + " (ไฟล์เดิม เรียงตามหน้าในไฟล์ PDF)");
  const { error: saveErr } = await updateOrder(sb as never, logged, { prev: order, by: BY });
  console.log(saveErr ? `   ❌ บันทึกไม่สำเร็จ: ${saveErr.message}` : "   ✅ บันทึกแล้ว");
}
console.log(`\n${hit ? `พบ ${hit} ใบ` : "ไม่พบใบที่ป้ายหน้า/หลังผิด"}${apply ? "" : hit ? " · ใส่ --apply เพื่อแก้" : ""}`);

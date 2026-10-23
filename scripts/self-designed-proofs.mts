/**
 * 🎨 เติม "แบบอนุมัติอัตโนมัติ" ให้รายการที่ลูกค้าออกแบบเองบนเว็บแต่ยังไม่มีแบบ (งานหลายหน้า ก่อนแก้ 23 ต.ค. 69)
 *
 *   npx tsx --conditions=react-server scripts/self-designed-proofs.mts                     (ดูเฉย ๆ)
 *   npx tsx --conditions=react-server scripts/self-designed-proofs.mts OD-261023-1997 --apply
 *
 * ทำไม (OD-261023-1997): โปสการ์ด 2 ด้าน 8 ใบ = 1 ลาย 16 ไฟล์ — ด่านเดิมเช็ค "จำนวนไฟล์ = จำนวนลาย" ไม่ผ่าน
 * → กล่อง "แบบที่เราส่งให้ตรวจ (0)" ค้าง "รอกราฟฟิกทำแบบ" · ใช้กติกาตัวเดียวกับ checkout/หน้าออเดอร์ (selfDesignedProofs)
 * ใบที่ชำระแล้ว: เปิดหน้าออเดอร์ครั้งถัดไป ระบบเลื่อนเป็น "อนุมัติแบบ" เอง (allSelfDesignedApproved)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { proofsOf, selfDesignedProofs, withLog, type Order } from "../src/lib/admin-data";
import { PLACEMENT_SPEC_LABEL } from "../src/lib/design-templates";
import { updateOrder } from "../src/lib/server/order-write";
import { selectAllRows } from "../src/lib/server/select-all";

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
const BY = "แบบอนุมัติอัตโนมัติย้อนหลัง (สคริปต์)";

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
  if (order.status === "ยกเลิก") continue;
  const at = new Date().toISOString();
  const notes: string[] = [];
  const items = order.items.map((it, i) => {
    if (proofsOf(it).length || !it.sel?.[PLACEMENT_SPEC_LABEL]) return it;
    const proofs = selfDesignedProofs(it.sel, it.artworkUrls ?? [], at);
    if (!proofs) return it;
    notes.push(`รายการที่ ${i + 1} ${it.name}: แบบ ${proofs.length} รูป`);
    return { ...it, proofs, proofStatus: "อนุมัติ" as const, proofUpdatedAt: at };
  });
  if (!notes.length) continue;
  hit++;
  console.log(`\n${row.id} · ${order.customer} · ${order.status}\n   ${notes.join("\n   ")}`);
  if (!apply) continue;
  const logged = withLog({ ...order, items }, BY, "ใช้แบบที่ลูกค้าออกแบบเอง (อนุมัติอัตโนมัติ)", notes.join(" · "));
  const { error: saveErr } = await updateOrder(sb as never, logged, { prev: order, by: BY });
  console.log(saveErr ? `   ❌ บันทึกไม่สำเร็จ: ${saveErr.message}` : "   ✅ บันทึกแล้ว");
}
console.log(`\n${hit ? `พบ ${hit} ใบ` : "ไม่พบใบที่ค้าง"}${apply ? "" : hit ? " · ใส่ --apply เพื่อแก้" : ""}`);

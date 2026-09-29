/**
 * 🩹 OD-260924-2339 รายการที่ 8 (กระดาษอาร์ตมัน ไดคัท 1 แผ่น คละ 3 ลาย) ได้ค่าคละลาย ฿5 ทั้งที่กติกา = ฿10
 * (พนักงานแจ้ง 29 ก.ย. 69 · ลูกค้ายังไม่โอนยอดส่วนเพิ่ม)
 *
 * ต้นตอ: ตอนสั่งเพิ่ม 04:56 น. ตะกร้ายังรวมล็อตแล้วเกลี่ยลายของทุกบรรทัดลงทุกแผ่น (แก้แล้ว d7bddff deploy 11:11 น.)
 * ใบนี้สั่งก่อนแก้ → บรรทัด Add on ยังแช่ ฿5 ไว้ · แก้ราคา+ชื่อบรรทัด Add on ให้ตรงกติกา แล้วคิดส่วนลดสมาชิกใหม่
 * เขียนผ่านประตู updateOrder + ลงประวัติ (เหมือนแอดมินกด ✏️ แก้ไข ที่แถว Add on)
 *
 * รัน: node --conditions=react-server --import tsx scripts/fix-2339-mix-fee.mts [--apply]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, orderTotal, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { syncOrderMemberTier } from "../src/lib/server/order-member-tier";

const ID = "OD-260924-2339";
const APPLY = process.argv.includes("--apply");
const BY = "ระบบ (แก้ย้อนหลัง)";
const WANT = 10;
const NAME = "🎨 Add on — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET (ค่าคละลาย · คละ 3 ลาย)";

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

// บรรทัด Add on ฿5 ที่ยังไม่มีลิงก์แม่ (สั่ง 04:56 ก่อนแก้) — ต้องมีบรรทัดเดียวเท่านั้น
const hits = existing.items.map((it, i) => ({ it, i })).filter(({ it }) => it.productId === "paper-art-pet#designfee" && it.unitPrice === 5 && !it.addOnFor);
if (hits.length !== 1) throw new Error(`คาดว่ามีบรรทัด Add on ฿5 บรรทัดเดียว แต่เจอ ${hits.length} — หยุด`);
const { it: old, i } = hits[0];
const host = existing.items[i - 1];
if (host?.productId !== "paper-art-pet" || host.sel?.["จำนวนลาย"] !== "3 ลาย" || host.qty !== 1) throw new Error("บรรทัดก่อนหน้าไม่ใช่รายการแม่ 1 แผ่น 3 ลาย — หยุด");

const items = existing.items.map((x, k) => (k === i ? { ...x, unitPrice: WANT, name: NAME } : x));
const before = orderTotal(existing);
const draft = withLog(
  { ...existing, items },
  BY,
  "แก้ราคารายการ",
  `${old.name}: ฿5 → ฿${WANT} (ค่าคละลาย 1 แผ่น 3 ลาย ตามกติกา — ตอนสั่ง 04:56 น. ตะกร้าเกลี่ยลายรวมล็อตผิด แก้โค้ดแล้ว 29 ก.ย. 69)`
);
const synced = await syncOrderMemberTier(sb as never, draft);
const after = orderTotal(synced);
console.log(`${APPLY ? "✏️" : "•"} รายการ #${i + 1}: ${old.name}\n   ฿${old.unitPrice} → ฿${WANT} · ชื่อ → ${NAME}`);
console.log(`   ส่วนลด: ${JSON.stringify(existing.discount)} → ${JSON.stringify(synced.discount)}`);
console.log(`   ยอดรวมใบ: ฿${before} → ฿${after} · รับแล้ว ฿${existing.paidTotal ?? 0} · ค้าง ฿${after - (existing.paidTotal ?? 0)}`);
if (!APPLY) {
  console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อบันทึก)");
  process.exit(0);
}
const res = await updateOrder(sb as never, synced, { prev: existing, by: BY });
if (res.error) throw new Error(`บันทึกไม่สำเร็จ: ${res.error.message}`);
const { data: back } = await sb.from("orders").select("data").eq("id", ID).single();
const b = back!.data as Order;
if (b.items[i]?.unitPrice !== WANT || b.items[i]?.name !== NAME) throw new Error("อ่านกลับไม่ตรง");
console.log(`\n✓ ${ID} บันทึกแล้ว + อ่านกลับตรง · ยอดรวม ฿${orderTotal(b)} · ค้าง ฿${orderTotal(b) - (b.paidTotal ?? 0)}`);

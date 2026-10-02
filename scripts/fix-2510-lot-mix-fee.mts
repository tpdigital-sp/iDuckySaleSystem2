/**
 * 🧾 แก้ใบ OD-261001-2510 ให้ตรงกฎใหม่ 2 ต.ค. 69: ค่าคละของล็อตรวมกองไว้บรรทัดเดียว (บรรทัดสุดท้ายของล็อต)
 *   node --conditions=react-server --import tsx scripts/fix-2510-lot-mix-fee.mts [--write]
 * เดิม: Add on 3 บรรทัด ฿4 / ฿3 / ฿3 (เฉลี่ยจากล็อตรวม 12 ชิ้น) → ใหม่: บรรทัดเดียว ฿10 เกาะสแตนดี้ 1 ชิ้น (ลายที่ 3) · ยอดรวมเท่าเดิม
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const write = process.argv.includes("--write");
const ID = "OD-261001-2510";
const { data } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
const order = data?.data as Order | undefined;
if (!order) throw new Error("ไม่พบใบ");
const before = orderTotal(order);
const fees = order.items.filter((it) => it.productId === "standy#designfee");
console.log("เดิม:", fees.map((f) => `${f.addOnFor} ฿${f.unitPrice}`).join(" | "), "· ยอดรวม", before);
if (fees.length !== 3) throw new Error(`คาดว่ามี Add on 3 บรรทัด แต่เจอ ${fees.length} — อาจแก้ไปแล้ว`);
const total = fees.reduce((s, f) => s + f.unitPrice * f.qty, 0);
// บรรทัดสุดท้ายของล็อต = สแตนดี้ 1 ชิ้น (ลายที่ 3) → Add on ที่เกาะอยู่คือตัวที่เหลือ
const keep = fees[fees.length - 1];
const note = `ล็อตรวม 12 ชิ้น คละ 3 ลาย (ฟรี 2 ลาย · เกิน 1 ลาย × ฿10) คิดรวมไว้ที่บรรทัดนี้ · บรรทัดนี้ 1 ลาย`;
const items = order.items
  .filter((it) => it.productId !== "standy#designfee" || it === keep)
  .map((it) =>
    it === keep
      ? { ...it, unitPrice: total, name: `🎨 Add on — สแตนดี้อะคริลิค (ค่าคละลาย · ${note})`, addOnLines: [{ label: "ค่าคละลาย", amount: total, note }] }
      : it
  );
const next = withLog({ ...order, items }, "ระบบ", "ปรับค่าคละลายของล็อต", `รวม Add on ฿4/฿3/฿3 เป็น ฿${total} บรรทัดเดียว (กฎ 2 ต.ค. 69) ยอดรวมเท่าเดิม`);
const after = orderTotal(next);
console.log("ใหม่:", next.items.filter((it) => it.productId === "standy#designfee").map((f) => `${f.addOnFor} ฿${f.unitPrice}`).join(" | "), "· ยอดรวม", after);
if (after !== before) throw new Error(`ยอดรวมเปลี่ยน ${before} → ${after} ไม่เขียน`);
if (!write) { console.log("(ดูเฉย ๆ — ใส่ --write เพื่อบันทึก)"); process.exit(0); }
const res = await updateOrder(sb as never, next, { prev: order, by: "ระบบ" });
console.log("บันทึก:", JSON.stringify(res).slice(0, 300));

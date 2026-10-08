/**
 * 🎁 ไล่หาใบที่ "ลูกค้าสั่งเพิ่มแล้วของแถมตามจำนวนชิ้นยังค้างยอดรอบแรก"
 *
 *   npm run sync:order-gifts                          (ดูเฉย ๆ ทุกใบที่เคยสั่งเพิ่ม)
 *   npm run sync:order-gifts -- OD-261006-8507
 *   npm run sync:order-gifts -- OD-261006-8507 --apply
 *   npm run sync:order-gifts -- --apply               (แก้ทุกใบที่เจอ)
 *
 * ทำไม (8 ต.ค. 69 · OD-261006-8507): พวงกุญแจ 80 ชิ้น ได้รองหลัง 80 → สั่งเพิ่ม 20 ชิ้น ของแถมยังค้าง 80
 * ตั้งแต่ 8 ต.ค. 69 ประตูสั่งเพิ่ม (/api/orders/append) ปรับให้เองแล้ว — ตัวนี้ไว้เก็บใบเก่า
 * ใช้กติกาตัวเดียวกับที่ระบบคิดจริง (syncOrderGifts) — เพิ่มอย่างเดียว ไม่ลด · คงลาย/แบบ/ผลตรวจเดิม
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { giftSummary } from "../src/lib/gifts";
import { giftSyncNote, syncOrderGifts } from "../src/lib/server/order-gifts";
import { updateOrder } from "../src/lib/server/order-write";

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
const BY = "ปรับของแถมย้อนหลัง (สคริปต์)";
/** ใบที่จบแล้ว/ยกเลิก ไม่ยุ่ง (ของส่งไปแล้ว) — ระบุเลขใบมาเองค่อยดูให้ */
const CLOSED = new Set(["เสร็จสิ้น", "ยกเลิก", "จัดส่งแล้ว", "ส่งแล้ว"]);

const { data, error } = await sb.from("orders").select("id,data");
if (error) {
  console.error(error.message);
  process.exit(1);
}

let hit = 0;
for (const row of (data ?? []) as { id: string; data: Order }[]) {
  if (only.size && !only.has(row.id.toUpperCase())) continue;
  const order = row.data;
  // เฉพาะใบที่เคย "สั่งเพิ่ม" (มีบรรทัด addedAt) และมีของแถมอยู่แล้ว — ใบที่ไม่เคยได้ของแถมเลยไม่แตะ (เงื่อนไขโปรตอนนั้นอาจต่างจากวันนี้)
  if (!(order.items ?? []).some((it) => it.addedAt) || !order.gifts?.length) continue;
  if (!only.size && CLOSED.has(order.status)) continue;
  const { order: next, changed } = await syncOrderGifts(sb as never, order);
  if (!changed.length) continue;
  hit++;
  console.log(`\n${row.id} · ${order.customer} · ${order.status}`);
  console.log(`   เดิม: ${giftSummary(order.gifts)}`);
  console.log(`   ใหม่: ${giftSummary(next.gifts)}`);
  if (!apply) continue;
  const logged = withLog(next, BY, "ปรับของแถมตามยอดรวมทั้งใบ", giftSyncNote(changed));
  const { error: saveErr } = await updateOrder(sb as never, logged, { prev: order, by: BY });
  console.log(saveErr ? `   ❌ บันทึกไม่สำเร็จ: ${saveErr.message}` : "   ✅ บันทึกแล้ว");
}
console.log(`\n${hit ? `พบ ${hit} ใบ` : "ไม่พบใบที่ของแถมค้าง"}${apply ? "" : hit ? " · ใส่ --apply เพื่อแก้" : ""}`);

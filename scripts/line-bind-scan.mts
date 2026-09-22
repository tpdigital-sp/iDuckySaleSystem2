/**
 * 🔎 ตรวจ "ห้องแชท/LINE ที่ระบบยืมมาจากใบเก่า" ทั้งฐาน — หาใบที่เบอร์เดียวกันแต่เป็นคนละคน
 *
 * ทำไม (พนักงานแจ้ง 22 ก.ย. 69 · OD-260921-1336 "ลิงก์แชทกาออกไม่ได้ เหมือนผูกสลับคน"):
 * เบอร์เดียวกันไม่ได้แปลว่าคนเดียวกัน — ใบของอีกคนที่ใช้เบอร์ร่วมกันเคยถูกยืมห้องแชทมาโชว์
 * สคริปต์นี้บอกว่ามีเบอร์แบบนั้นกี่เบอร์ และตอนนี้แต่ละใบโชว์ห้องของใคร
 *
 *   npx tsx scripts/line-bind-scan.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { lineChatOf, lineUserOf, type Order } from "../src/lib/admin-data";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").order("created_at", { ascending: false });
if (error) throw error;
const all = (data ?? []).map((r) => r.data as Order);
console.log(`ออเดอร์ทั้งหมด ${all.length} ใบ`);

// เบอร์ที่มี LINE ผูกไว้มากกว่า 1 บัญชี = คนละคนใช้เบอร์เดียวกัน
const byPhone = new Map<string, Order[]>();
for (const o of all) {
  const p = (o.phone ?? "").replace(/\D/g, "");
  if (p.length < 8) continue;
  if (!byPhone.has(p)) byPhone.set(p, []);
  byPhone.get(p)!.push(o);
}
let clash = 0;
for (const [p, list] of byPhone) {
  const users = new Set(list.map((o) => o.lineUserId).filter(Boolean));
  if (users.size <= 1) continue;
  clash++;
  console.log(`\n⚠️ เบอร์ ${p} — ผูก LINE ไว้ ${users.size} บัญชี`);
  for (const o of list) {
    const u = lineUserOf(o, all);
    const c = lineChatOf(o, all);
    console.log(
      `   ${o.id} · ${o.customer} → LINE: ${u ? `${u.name ?? u.id.slice(0, 8)} (${u.source}${u.from ? " " + u.from : ""})` : "— ยังไม่ผูก"}` +
        ` · ห้องแชท: ${c ? `${c.source}${c.from ? " " + c.from : ""} ${c.url.slice(-20)}` : "— ไม่มี"}`
    );
  }
}
console.log(`\nเบอร์ที่คนละคนใช้ร่วมกัน: ${clash} เบอร์`);

// ใบที่ยืมห้องแชทมาจากใบเก่า — ต้องเป็นห้องของคนเดียวกับที่ผูกไว้เสมอ
let borrowed = 0, bad = 0;
for (const o of all) {
  const c = lineChatOf(o, all);
  if (!c || c.source !== "prev") continue;
  borrowed++;
  const from = all.find((x) => x.id === c.from);
  const user = lineUserOf(o, all)?.id;
  if (user && from?.lineUserId && from.lineUserId !== user) {
    bad++;
    console.log(`❌ ${o.id} ยืมห้องแชทของ ${c.from} ซึ่งผูก LINE คนละคน`);
  }
}
console.log(`ใบที่ยืมห้องแชทจากใบเก่า: ${borrowed} ใบ · ยืมผิดคน: ${bad} ใบ`);

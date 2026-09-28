/**
 * 🚫📨 ปักธง lineQuotaMissed ย้อนหลังให้ใบที่การ์ดไลน์หายไปเพราะ "โควตาข้อความ LINE OA หมด" ก่อนที่โค้ดจะเริ่มปักธงเอง
 * (28 ก.ย. 69 08:49 เป็นต้นมา บัญชีร้าน 15,000/15,000) → cron balance-notify จะส่งสถานะล่าสุดให้เองเมื่อโควตากลับมา
 *
 *   tsx --conditions=react-server --env-file=.env.local scripts/line-quota-missed-flag.mts           → ดูรายการ (ไม่เขียน)
 *   tsx --conditions=react-server --env-file=.env.local scripts/line-quota-missed-flag.mts --apply   → ปักธงจริง (ผ่าน updateOrder)
 *
 * รันซ้ำได้: ใบที่มีธงแล้ว/ส่งถึงแล้วหลังจากนั้น (missedLineNotifies ว่าง) ข้าม
 */
import { getSupabaseAdmin } from "../src/lib/server/supabase-admin.ts";
import { isQuotaMiss, missedLineNotifies } from "../src/lib/server/notify.ts";
import { updateOrder } from "../src/lib/server/order-write.ts";
import type { Order } from "../src/lib/admin-data.ts";

const apply = process.argv.includes("--apply");
const sb = getSupabaseAdmin();
if (!sb) throw new Error("ไม่มี Supabase env");
const since = new Date("2026-09-20T00:00:00+07:00").toISOString();
const { data, error } = await sb.from("orders").select("id,data").gte("created_at", since);
if (error) throw error;

let flagged = 0;
for (const row of data ?? []) {
  const o = row.data as Order;
  if (o.lineQuotaMissed || o.status === "ยกเลิก") continue;
  const missed = missedLineNotifies(o);
  if (!missed.length) continue;
  // เฉพาะใบที่มีบรรทัด "โควตาหมด" ค้างจริง (ไม่ใช่แค่ยังไม่ผูก LINE — อันนั้น line-bind ส่งให้ตอนผูก)
  const quotaLines = (o.log ?? []).filter((e) => e.action === "แจ้งลูกค้าทางไลน์ไม่สำเร็จ" && isQuotaMiss(e.detail));
  if (!quotaLines.length) continue;
  const at = quotaLines[quotaLines.length - 1].at;
  console.log(`${apply ? "🏳️ ปักธง" : "· จะปักธง"} ${o.id} (${o.status}) — ${missed.join(" / ")} · พลาดล่าสุด ${new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  if (apply) await updateOrder(sb, { ...o, lineQuotaMissed: { at, what: missed.slice(-8) } });
  flagged++;
}
console.log(`${apply ? "ปักธงแล้ว" : "จะปักธง"} ${flagged} ใบ${apply ? "" : " (เพิ่ม --apply เพื่อเขียนจริง)"}`);

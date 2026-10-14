/**
 * 🦆 บวกแต้มที่ตกหล่นให้ #357 จาก OD-261014-3893 (ชำระ ฿485 · ผูกผู้ติดต่อหลังโอน + เบอร์ซ้ำการ์ด #7940 → แต้มไม่เข้า)
 * ใช้ awardPointsForOrder ตัวเดียวกับระบบ — กันบวกซ้ำต่อออเดอร์อยู่แล้ว รันซ้ำได้ไม่บวกเพิ่ม
 *
 *   node --env-file=.env.local --require ./scripts/_tmp/shim-award.cjs --import tsx scripts/_tmp/award-3893.mts
 */
import { createClient } from "@supabase/supabase-js";
import { awardPointsForOrder } from "../../src/lib/server/contact-points";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, error } = await sb.from("orders").select("data").eq("id", "OD-261014-3893").single();
if (error || !data) throw error ?? new Error("ไม่พบออเดอร์");

const pick = async () => (await sb.from("contacts").select("data->point,data->tierCycleSpend,data->tierLevel").eq("id", "357").single()).data;
const before = await pick();
await awardPointsForOrder((data as { data: Parameters<typeof awardPointsForOrder>[0] }).data);
const after = await pick();
const log = (await sb.from("contact_points").select("id,data").eq("id", "357:od:OD-261014-3893").maybeSingle()).data;
console.log(JSON.stringify({ before, after, log }, null, 1));
console.log(log ? "✅ บวกแต้มแล้ว" : "⚠️ ไม่มีแถวประวัติ — แต้มไม่ได้บวก");

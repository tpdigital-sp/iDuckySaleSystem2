/**
 * 📦 npm run check:stock-arrived — การ์ดกลุ่ม "ของเข้าแล้ว — ส่งเข้าผลิตได้" ผ่านกติกา Flex ของ LINE (ไม่ส่งจริง ไม่เขียนฐาน)
 *
 * 1) เคสสังเคราะห์ 3 แบบ (มีรายการวัสดุ · ไม่มีวัสดุใช้ชื่อสินค้า · TP ติ๊กให้ + โน้ตยาว)
 * 2) ออเดอร์จริงที่ติ๊กของเข้าแล้ว 30 ใบล่าสุด (ต้อง --env-file=.env.local) — ข้ามเงียบถ้าไม่มี Supabase
 * --print = พิมพ์ JSON การ์ดใบแรกให้ดูรูป
 */
import { stockArrivedCard } from "../src/lib/server/needs-purchase";
import { bubbleOf } from "../src/lib/server/line-alert";
import { checkFlexMessages, type LineMessage } from "../src/lib/server/notify";
import type { Order } from "../src/lib/admin-data";

let fail = 0;
const ok = (c: boolean, label: string) => {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) fail++;
};
function verify(o: Order, label: string): string[] {
  const card = stockArrivedCard(o);
  if (!card) {
    ok(false, `${label}: ไม่ได้การ์ด (ยังไม่ติ๊กของเข้า?)`);
    return [];
  }
  const msg: LineMessage = { type: "flex", altText: card.alt.slice(0, 380), contents: bubbleOf(card) };
  const errs = checkFlexMessages([msg]);
  const link = `/admin/orders/${encodeURIComponent(o.id)}`;
  const hasLink = card.button?.uri.endsWith(link) && card.alt.includes(link);
  ok(!errs.length && hasLink && card.alt.length <= 400, `${label}: "${card.title}" · ${card.hero}${errs.length ? ` — ${errs.join(" · ")}` : ""}${hasLink ? "" : " — ไม่มีลิงก์ออเดอร์"}`);
  if (process.argv.includes("--print")) console.log(JSON.stringify(msg, null, 1));
  return errs;
}

const base: Order = {
  id: "OD-261016-0001",
  customer: "คุณทดสอบ ระบบ",
  status: "ชำระแล้ว",
  useByDate: "20 ต.ค. 69",
  items: [{ name: "ปลอกหมอนอิง 18×18 นิ้ว", qty: 120, price: 55 } as Order["items"][number]],
  needsPurchase: { by: "แอดมิน A", at: "2026-10-15T03:00:00.000Z", arrivedAt: "2026-10-16T02:30:00.000Z", arrivedBy: "แพ็ค B", items: [{ name: 'ซิป 16"', qty: 120, unit: "เส้น" }], note: "สั่งร้านซิปเจ้าประจำ" },
} as unknown as Order;

console.log("🧪 เคสสังเคราะห์");
verify(base, "มีรายการวัสดุ");
verify({ ...base, id: "OD-261016-0002", needsPurchase: { ...base.needsPurchase!, items: [], note: undefined }, useByDate: undefined } as Order, "ไม่มีวัสดุ → ใช้ชื่อสินค้า");
verify(
  { ...base, id: "OD-261016-0003", customer: "", needsPurchase: { ...base.needsPurchase!, arrivedBy: "สมชาย (TP)", note: "โน้ตยาว ".repeat(30).trim() } } as Order,
  "TP ติ๊กให้ + โน้ตยาว + ไม่มีชื่อลูกค้า",
);
ok(stockArrivedCard({ ...base, needsPurchase: { ...base.needsPurchase!, arrivedAt: undefined } } as Order) === null, "ยังไม่ติ๊กของเข้า → ไม่สร้างการ์ด");

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { getSupabaseAdmin } = await import("../src/lib/server/supabase-admin");
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from("orders")
      .select("data")
      .not("data->needsPurchase->arrivedAt", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) ok(false, `อ่านออเดอร์จริงไม่ได้: ${error.message}`);
    else {
      console.log(`\n🧪 ออเดอร์จริงที่ติ๊กของเข้าแล้ว ${data?.length ?? 0} ใบล่าสุด`);
      for (const r of data ?? []) verify(r.data as Order, "จริง");
    }
  }
} else console.log("\n⚠️ ไม่มี SUPABASE_SERVICE_ROLE_KEY — ข้ามออเดอร์จริง (รันด้วย --env-file=.env.local)");

if (fail) process.exit(1);

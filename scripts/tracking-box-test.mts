/**
 * 🧪 เทส "ใบเดียวส่งหลายกล่อง" (เลขพัสดุกล่องที่ 2 ขึ้นไป — Order.extraTrackings)
 *
 *   npm run check:track-box
 *
 * ทำไมต้องมี (พนักงานแจ้ง 22 ก.ย. 69 · OD-260917-1691):
 * ลูกค้าขอแยกส่ง 2 ที่อยู่ คนแพ็คยิง 2 เลขในช่องเดียว → เลขแรกถูกทับ เหลืออยู่แต่ในประวัติ
 * ลูกค้าเห็นเลขเดียว เช็คพัสดุอีกกล่องไม่ได้ · ตรงนี้กันไม่ให้ตรรกะ "กล่องที่เท่าไหร่/เลขนี้ของใบนี้ไหม" เพี้ยนอีก
 */
import { trackingBoxes, ownsTrackingNumber, type Order } from "../src/lib/admin-data";
import { statusFlex, statusMessage } from "../src/lib/server/notify";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => (cond ? pass++ : fails.push(`${name}${detail ? `\n   ${detail}` : ""}`));

const LINK = "https://iduckystore.com/order/OD-260917-1691?key=k";
const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "OD-260917-1691",
    date: "2026-09-17",
    customer: "คุณเอ",
    phone: "0812345678",
    status: "จัดส่งแล้ว",
    shipping: "ส่งธรรมดา",
    items: [{ name: "ตุ๊กตาไดคัท", qty: 2, unitPrice: 500 }],
    ...over,
  }) as unknown as Order;

const TWO = order({
  tracking: "EQ226638541TH",
  extraTrackings: [{ tracking: "EQ226638498TH", at: "2026-09-22T05:55:20.108Z", by: "แอดมิน", note: "ส่งไปที่อยู่ที่ 2" }],
});

// ── กล่องที่เท่าไหร่ ──
ok("ใบยังไม่ยิงเลข = ไม่มีกล่อง", trackingBoxes(order()).length === 0);
ok("ยิงเลขเดียว = กล่องเดียว", trackingBoxes(order({ tracking: "EQ1TH" })).length === 1);
{
  const b = trackingBoxes(TWO);
  ok("2 กล่อง: นับครบ", b.length === 2, `ได้ ${b.length}`);
  ok("2 กล่อง: เลขในใบคือกล่องที่ 1", b[0].tracking === "EQ226638541TH" && b[0].box === 1);
  ok("2 กล่อง: เลขที่เพิ่มคือกล่องที่ 2 + ติดหมายเหตุ", b[1].tracking === "EQ226638498TH" && b[1].box === 2 && b[1].note === "ส่งไปที่อยู่ที่ 2");
}
ok(
  "ใบมารับเองไม่มีกล่องพัสดุ",
  trackingBoxes(order({ tracking: "EQ1TH", shipping: "มารับเอง", shippingLabel: "มารับเองที่ร้าน" } as Partial<Order>)).length === 0
);
ok("เลขว่าง/ช่องว่างในลิสต์ ไม่นับเป็นกล่อง", trackingBoxes(order({ tracking: "EQ1TH", extraTrackings: [{ tracking: "  ", at: "", by: "" }] })).length === 1);

// ── เลขนี้เป็นของใบนี้ไหม (ใช้ตอนลูกค้าถามสถานะ ปณ. + ตอนถามว่า "ยิงซ้ำหรือกล่องใหม่") ──
ok("รู้จักเลขกล่องหลัก", ownsTrackingNumber(TWO, "EQ226638541TH"));
ok("รู้จักเลขกล่องเพิ่ม (พิมพ์เล็กก็ได้)", ownsTrackingNumber(TWO, "eq226638498th"));
ok("รู้จักเลขรอบแบ่งส่ง", ownsTrackingNumber(order({ shipments: [{ tracking: "EQ999TH", at: "", by: "", proofs: [] }] }), "EQ999TH"));
ok("เลขของใบอื่นไม่ใช่ของใบนี้", !ownsTrackingNumber(TWO, "EQ000000000TH"));
ok("เลขว่างไม่นับ", !ownsTrackingNumber(TWO, "   "));

// ── การ์ด/ข้อความไลน์ต้องมีครบทุกเลข ──
{
  const alt = statusMessage(TWO, LINK) ?? "";
  ok("ข้อความไลน์มีเลขครบ 2 กล่อง", alt.includes("EQ226638541TH") && alt.includes("EQ226638498TH"), alt);
  ok("ข้อความไลน์บอกว่ากล่องไหน", alt.includes("กล่องที่ 1") && alt.includes("กล่องที่ 2"), alt);
  const one = statusMessage(order({ tracking: "EQ226638541TH" }), LINK) ?? "";
  ok("ใบกล่องเดียวพูดเหมือนเดิม (ไม่มีคำว่ากล่องที่)", one.includes("เลขพัสดุ: EQ226638541TH") && !one.includes("กล่องที่"), one);
  const flex = JSON.stringify(statusFlex(TWO, LINK));
  ok("การ์ด Flex มีเลขครบ 2 กล่อง", flex.includes("EQ226638541TH") && flex.includes("EQ226638498TH"));
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ ผ่านครบ ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);

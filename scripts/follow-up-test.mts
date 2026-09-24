/**
 * 🧪 เทส "ส่งตามให้" — ใบปิดไปแล้วแต่ของในกล่องไม่ครบ ต้องส่งของที่ตกค้างตามไปอีกกล่อง
 *
 *   npm run check:follow-up
 *
 * ทำไมต้องมี (พนักงานแจ้ง 24 ก.ย. 69):
 * ของเดิมมี 3 อย่างที่หน้าตาใกล้กันมาก — แบ่งส่ง (ใบยังไม่ปิด) · กล่องที่ 2 (ออกวันเดียวกัน) · เคลม (ผลิตใหม่)
 * ตรงนี้กันไม่ให้รอบส่งตามไปโผล่เป็น "แบ่งส่ง" (ใบจะค้างในไปป์ไลน์) และกันเปิดรอบซ้อน/เปิดผิดใบ
 */
import {
  applyFollowUpShipped,
  canOpenFollowUp,
  followUpNote,
  followUpQty,
  isPartiallyShipped,
  openFollowUp,
  pendingPlanRound,
  shippedFollowUps,
  trackingBoxes,
  type FollowUpRound,
  type Order,
} from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => (cond ? pass++ : fails.push(`${name}${detail ? `\n   ${detail}` : ""}`));

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "OD-260920-1234",
    date: "2026-09-20",
    customer: "คุณเอ",
    phone: "0812345678",
    status: "จัดส่งแล้ว",
    shipping: "ส่งธรรมดา",
    shippingCost: 50,
    payment: "PromptPay",
    address: "1/1 กรุงเทพฯ",
    items: [{ name: "โฟโต้การ์ด PVC", qty: 100, unitPrice: 5 }],
    ...over,
  }) as unknown as Order;

const round = (over: Partial<FollowUpRound> = {}): FollowUpRound => ({
  items: [{ item: 0, qty: 3, unit: "ชิ้น", itemName: "โฟโต้การ์ด PVC" }],
  reason: "ลืมใส่กล่อง",
  fault: "ร้าน",
  by: "ฟินญาดา",
  at: "2026-09-24T03:00:00.000Z",
  ...over,
});

const SHIPPED = order({ tracking: "EQ226638541TH" });

// ── เปิดรอบได้ตอนไหน ──────────────────────────────────────────────
ok("ใบที่ยังไม่ส่งออก เปิดรอบส่งตามไม่ได้", !canOpenFollowUp(order()).ok);
ok("ใบที่ยิงเลขแล้ว เปิดรอบได้", canOpenFollowUp(SHIPPED).ok, canOpenFollowUp(SHIPPED).reason);
{
  const pickup = order({ shipping: "มารับเอง", packedAt: { at: "2026-09-21T02:00:00.000Z", by: "จาร์" } } as Partial<Order>);
  ok("ใบมารับเองที่แพ็คเสร็จแล้ว เปิดรอบได้ (ของออกจากมือร้านไปแล้ว)", canOpenFollowUp(pickup).ok, canOpenFollowUp(pickup).reason);
}
ok("ใบที่ยกเลิกแล้ว เปิดรอบไม่ได้", !canOpenFollowUp(order({ tracking: "EQ1TH", status: "ยกเลิก" })).ok);
ok("ใบเสร็จสิ้นแล้วก็ยังเปิดรอบได้ (ลูกค้าเพิ่งเจอว่าของขาด)", canOpenFollowUp(order({ tracking: "EQ1TH", status: "เสร็จสิ้น" })).ok);

// ── ห้ามเปิดซ้อน ──────────────────────────────────────────────────
{
  const busy = order({ tracking: "EQ1TH", followUp: [round()] });
  const gate = canOpenFollowUp(busy);
  ok("มีรอบค้างอยู่ เปิดรอบใหม่ไม่ได้", !gate.ok);
  ok("เหตุผลบอกว่ารอบไหนค้าง", /รอบที่ 1/.test(gate.reason), gate.reason);
  const done = order({ tracking: "EQ1TH", followUp: [round({ tracking: "EQ2TH", shippedAt: "2026-09-24T06:00:00.000Z", shippedBy: "จาร์" })] });
  ok("รอบเก่าส่งไปแล้ว เปิดรอบใหม่ได้", canOpenFollowUp(done).ok, canOpenFollowUp(done).reason);
}

// ── รอบไหนค้าง / รอบไหนส่งแล้ว ────────────────────────────────────
{
  const two = order({
    tracking: "EQ1TH",
    followUp: [round({ tracking: "EQ2TH", shippedAt: "2026-09-24T06:00:00.000Z" }), round({ items: [{ item: 0, qty: 2, itemName: "โฟโต้การ์ด PVC" }] })],
  });
  const open = openFollowUp(two);
  ok("หา 'รอบที่ค้าง' เจอ", !!open);
  ok("รอบที่ค้างคือรอบที่ 2", open?.no === 2 && open?.index === 1, `ได้ no=${open?.no} index=${open?.index}`);
  ok("รอบที่ส่งไปแล้วนับได้ 1 รอบ", shippedFollowUps(two).length === 1);
  ok("ใบที่ยังไม่มีรอบเลย = ไม่มีรอบค้าง", openFollowUp(SHIPPED) === null);
}

// ── นับจำนวน / ข้อความกลาง ────────────────────────────────────────
{
  const r = round({
    items: [
      { item: 0, qty: 3, unit: "ชิ้น", itemName: "โฟโต้การ์ด PVC" },
      { item: 1, qty: 2, unit: "เซ็ต", itemName: "พวงกุญแจ" },
    ],
  });
  ok("นับชิ้นที่ตกค้างรวมทุกรายการ", followUpQty(r) === 5, `ได้ ${followUpQty(r)}`);
  const note = followUpNote(r, 1);
  ok("ข้อความกล่องบอกจำนวน", /5 ชิ้น/.test(note), note);
  ok("ข้อความกล่องบอกว่าของอะไร", /โฟโต้การ์ด/.test(note), note);
  ok("ข้อความกล่องบอกว่าเป็นรอบส่งตาม", /ส่งตาม/.test(note), note);
  ok("จำนวนติดลบ/ขยะ ไม่ทำให้ยอดเพี้ยน", followUpQty(round({ items: [{ item: 0, qty: -5, itemName: "x" }] })) === 0);
}

// ── ⚠️ ห้ามไปโผล่เป็น "แบ่งส่ง" (ใบจะค้างในไปป์ไลน์ เหมือนเคส OD-260914-5746) ──
{
  const fu = order({ tracking: "EQ1TH", followUp: [round()] });
  ok("ใบที่มีรอบส่งตาม ไม่ถูกนับเป็นแบ่งส่ง", !isPartiallyShipped(fu));
  ok("ใบที่มีรอบส่งตาม ไม่ล็อกด่านปิดใบ (ไม่มีแผนแบ่งส่งค้าง)", pendingPlanRound(fu) === null);
  ok("สถานะใบไม่ถูกแตะ", fu.status === "จัดส่งแล้ว");
}

// ── กล่องส่งตามต้องโผล่เป็นกล่องที่ 2 พร้อมป้าย ────────────────────
{
  const r = round({ tracking: "EQ2TH", shippedAt: "2026-09-24T06:00:00.000Z", shippedBy: "จาร์" });
  const sent = order({
    tracking: "EQ1TH",
    followUp: [r],
    extraTrackings: [{ tracking: "EQ2TH", at: "2026-09-24T06:00:00.000Z", by: "จาร์", note: followUpNote(r, 1) }],
  });
  const boxes = trackingBoxes(sent);
  ok("นับได้ 2 กล่อง", boxes.length === 2, `ได้ ${boxes.length}`);
  ok("กล่องที่ 2 คือเลขส่งตาม", boxes[1]?.tracking === "EQ2TH" && boxes[1]?.box === 2);
  ok("กล่องที่ 2 มีป้ายบอกว่าส่งตาม", /ส่งตาม/.test(boxes[1]?.note ?? ""), boxes[1]?.note);
}

// ── ปิดรอบตอนยิงเลขกล่องเพิ่ม (คนแพ็คทำท่าเดิม ไม่มีปุ่มพิเศษ) ────
{
  const o = order({
    tracking: "EQ1TH",
    followUp: [round()],
    extraTrackings: [{ tracking: "EQ2TH", at: "2026-09-24T06:00:00.000Z", by: "จาร์" }],
  });
  const r = applyFollowUpShipped(o, "EQ2TH", "จาร์", "2026-09-24T06:00:01.000Z");
  ok("ยิงกล่องเพิ่ม = ปิดรอบให้เอง", !!r);
  ok("รอบถูกปักว่าส่งแล้ว", r?.round.shippedAt === "2026-09-24T06:00:01.000Z" && r?.round.shippedBy === "จาร์");
  ok("รอบจำเลขพัสดุกล่องส่งตาม", r?.round.tracking === "EQ2TH");
  ok("รอบเดิมในลิสต์ถูกแทนที่ ไม่ใช่ต่อท้าย", r?.followUp.length === 1);
  ok("กล่องที่ยิงได้ป้ายส่งตาม", /ส่งตาม/.test(r?.extraTrackings?.[0]?.note ?? ""), r?.extraTrackings?.[0]?.note);
  ok("ปิดรอบแล้วเปิดรอบใหม่ได้", canOpenFollowUp({ ...o, followUp: r!.followUp }).ok);

  const keep = applyFollowUpShipped(
    { ...o, extraTrackings: [{ tracking: "EQ2TH", at: "x", by: "จาร์", note: "ส่งไปที่อยู่ที่ 2" }] },
    "EQ2TH",
    "จาร์",
    "2026-09-24T06:00:01.000Z"
  );
  ok("ป้ายที่คนพิมพ์เองไว้ ไม่ถูกเขียนทับ", keep?.extraTrackings?.[0]?.note === "ส่งไปที่อยู่ที่ 2");

  ok("ใบที่ไม่มีรอบค้าง ยิงกล่องเพิ่มแล้วไม่มีอะไรเกิดขึ้น", applyFollowUpShipped(order({ tracking: "EQ1TH" }), "EQ2TH", "จาร์", "t") === null);
  ok("เลขว่าง = ไม่ปิดรอบ", applyFollowUpShipped(o, "  ", "จาร์", "t") === null);
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ ส่งตามให้: ผ่านครบ ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);

/**
 * 🥛 OD-260921-1879 — ลูกค้าเปลี่ยนวัสดุแก้วใส → ขาวขุ่น หลังผลิตชิ้นตัวอย่างไปแล้ว 1 ชิ้น (บิลบริษัท)
 * เจ้าของร้านเลือก "ทาง 1" 24 ก.ย. 69: ทำในใบเดิม ราคา/ฐานภาษีตาม QT010703 คงเดิม ส่วนต่างเก็บเพิ่ม (charges) ตาม QT010743
 *
 *   node --conditions=react-server --import tsx scripts/od-1879-frosted-switch.mts           (ดูเฉย ๆ)
 *   node --conditions=react-server --import tsx scripts/od-1879-frosted-switch.mts --apply   (เขียนจริง + ยิงไลน์ลูกค้า)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { flowAccountGap, orderBalance, orderTotal, withLog, type Order, type OrderCharge, type OrderItem } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { checkFlexMessages, notifyCustomerLogged, orderLink, orderNotice } from "../src/lib/server/notify";
import { syncItemsToTP } from "../src/lib/server/tp-report";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  })
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");
const ID = "OD-260921-1879";
const BY = "Claude (เจ้าของร้านสั่ง ทาง 1)";
const QT = "QT010743";
const QT_URL = "https://share.flowaccount.com/qt/th/rw1czxlvfemuuzxgv3l2hw";
const AMOUNT = 256.8;
const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const { data: row } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (!row) throw new Error("ไม่พบออเดอร์");
const prev = row.data as Order;
if ((prev.charges ?? []).some((c) => c.note?.includes(QT))) throw new Error("ทำไปแล้ว (มี charge อ้าง QT010743)");
if (prev.items.length !== 1 || prev.items[0].name !== "แก้วมัค (แก้วใส)") throw new Error("รายการไม่ใช่สภาพที่คาด");

const old = prev.items[0];
const oldProof = (old.proofs ?? [])[0];
if (!oldProof) throw new Error("ไม่มีแบบงาน");
const { pack, ...proofNoPack } = oldProof;

// รายการ 0 = ขาวขุ่น 20 ชิ้น ราคาเดิม 140 (ส่วนต่างเก็บเพิ่มนอกฐานภาษี) · ล้างการรับทราบของกราฟฟิก/แพ็ค ให้ต้องอ่านใหม่
const frosted: OrderItem = {
  ...old,
  name: "แก้วมัค (ขาวขุ่น)",
  selections:
    "จำนวน 20 ชิ้น / 1 ลาย ชิ้นละ 140 บาท · ⚠️ วัสดุ: ขาวขุ่น (ลูกค้าเปลี่ยนจากแก้วใส 24 ก.ย. 69 — ส่วนต่าง ฿5/ชิ้น เก็บเพิ่มตาม " +
    QT +
    ") · ผลิตขาวขุ่นครบ 20 ชิ้น — ชิ้นตัวอย่างแก้วใสที่ทำไปแล้วแยกเป็นบรรทัดถัดไป ไม่นับในนี้",
  proofs: [{ ...proofNoPack, note: "แก้ว MUG 11 Oz ขาวขุ่น (เปลี่ยนจากใส 24 ก.ย. 69 — แบบเดิมที่ลูกค้าอนุมัติ)" }],
};
delete (frosted as Partial<OrderItem>).graphicAck;
delete (frosted as Partial<OrderItem>).noteAck;
delete (frosted as Partial<OrderItem>).samplePacked;
delete (frosted as Partial<OrderItem>).sampleRequired;

// รายการ 1 = ชิ้นตัวอย่างแก้วใสที่ผลิต+ส่งไปแล้ว (รอบที่ 1) ราคา 0 ในใบนี้ — ค่า ฿140 อยู่ในยอดเก็บเพิ่ม
const sample: OrderItem = {
  productId: "special-item",
  name: "แก้วมัค (แก้วใส) — ชิ้นตัวอย่าง ผลิตแล้ว",
  qty: 1,
  unitPrice: 0,
  selections: "ชิ้นตัวอย่างที่ผลิตเป็นแก้วใสก่อนลูกค้าเปลี่ยนวัสดุ · ส่งแล้วรอบที่ 1 (มารับเอง 24 ก.ย. 69) · ค่าชิ้นนี้ ฿140 เก็บเพิ่มตาม " + QT + " · ไม่ต้องผลิตเพิ่ม",
  proofs: [{ ...oldProof, qty: 1 }],
  proofStatus: old.proofStatus,
  proofUpdatedAt: old.proofUpdatedAt,
  proofReviewedAt: old.proofReviewedAt,
  graphicAck: old.graphicAck,
  noteAck: old.noteAck,
  samplePacked: old.samplePacked,
  sampleRequired: old.sampleRequired,
};

const repoint = <T extends { proofs: Order["shipments"][number]["proofs"] }>(r: T): T => ({
  ...r,
  proofs: r.proofs.map((p) => (p.item === 0 && p.proof === 0 ? { ...p, item: 1, ofQty: 1, qty: 1, itemName: sample.name } : p)),
});

let next: Order = {
  ...prev,
  items: [frosted, sample],
  shipPlan: (prev.shipPlan ?? []).map(repoint),
  shipments: (prev.shipments ?? []).map(repoint),
  billNote: `${prev.billNote ?? ""}${prev.billNote ? " · " : ""}⚠️ เปลี่ยนวัสดุเป็นขาวขุ่น 24 ก.ย. 69 (ส่วนต่าง+ชิ้นตัวอย่างเก็บเพิ่มตาม ${QT})`,
};
next = withLog(next, BY, "แก้รายละเอียดรายการ", `แก้วมัค (แก้วใส) → แก้วมัค (ขาวขุ่น) 20 ชิ้น ราคาเดิม 140 (ส่วนต่างเก็บเพิ่มตาม ${QT})`);
next = withLog(next, BY, "เพิ่มรายการ", `ชิ้นตัวอย่างแก้วใสที่ผลิต+ส่งรอบที่ 1 แล้ว แยกเป็นรายการ 0 บาท · รอบส่งที่ 1 ชี้มาบรรทัดนี้แทน (ขาวขุ่นยังต้องผลิตครบ 20)`);

// เก็บเพิ่มตามใบใหม่ (นอกฐานภาษี — ยอดตามบิล QT010703 ยังตรง)
const now = new Date().toISOString();
const charge: OrderCharge = {
  id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  label: "เปลี่ยนวัสดุเป็นขาวขุ่น 20 ชิ้น + ชิ้นตัวอย่างแก้วใส 1 ชิ้น",
  amount: AMOUNT,
  note: `ตามใบเสนอราคา ${QT} (240 + VAT 16.80) · ${QT_URL}`,
  by: BY,
  at: now,
};
const totalBefore = orderTotal(next);
next = { ...next, charges: [...(next.charges ?? []), charge] };
const bal = orderBalance(next);
next = withLog(next, BY, `เก็บเพิ่ม: ${charge.label} ${thb(AMOUNT)} บาท`, `ยอดรวม ${thb(totalBefore)} → ${thb(orderTotal(next))} บาท · ค้าง ${thb(bal)} บาท · ${charge.note}`);
next = { ...next, balanceNotified: { at: now, balance: bal }, balancePending: undefined };

console.log("รายการใหม่:", next.items.map((i) => `${i.name} ×${i.qty} @${i.unitPrice}`));
console.log("แผนส่งรอบ 1:", JSON.stringify(next.shipPlan?.[0]?.proofs), "\nส่งแล้วรอบ 1:", JSON.stringify(next.shipments?.[0]?.proofs));
console.log("ยอดรวม", thb(orderTotal(prev)), "→", thb(orderTotal(next)), "· ค้าง", thb(bal), "· gap ใบ QT010703 =", flowAccountGap(next), "· vat", JSON.stringify(next.vat));
console.log("billNote:", next.billNote);
if (!apply) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

const r = await updateOrder(sb, next, { prev, by: BY });
if (r.error) throw r.error;
console.log("✅ เขียนออเดอร์แล้ว");
await syncItemsToTP(next).catch((e) => console.log("TP sync:", e?.message));

const link = orderLink("https://iduckystore.com", next);
const msg = orderNotice(next, link, {
  tone: "charge",
  head: "มีค่าบริการเพิ่ม",
  headline: `${charge.label} ${thb(AMOUNT)} บาท — ตามใบเสนอราคา ${QT}`,
  hero: { label: "ยอดที่ต้องโอนเพิ่ม", value: `${thb(bal)} บาท` },
  rows: [
    { label: "เปลี่ยนเป็นขาวขุ่น", value: "20 ชิ้น × 5 = 100 บาท" },
    { label: "ชิ้นตัวอย่างแก้วใส (ผลิตแล้ว)", value: "1 ชิ้น × 140 = 140 บาท" },
    { label: "VAT 7%", value: "16.80 บาท" },
    { label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(next))} บาท` },
    { label: "รับแล้ว", value: `${thb(next.paidTotal ?? 0)} บาท`, bold: true },
  ],
  note: `โอนตามใบเสนอราคา ${QT} แล้วส่งสลิปมาในแชทนี้ได้เลยครับ`,
  button: { label: "เปิดใบเสนอราคา", uri: QT_URL },
  alt: `🧾 ออเดอร์ ${ID} มีค่าบริการเพิ่ม: ${charge.label} ${thb(AMOUNT)} บาท (ตามใบเสนอราคา ${QT})\n💳 ยอดที่ต้องโอนเพิ่ม ${thb(bal)} บาท\nโอนแล้วส่งสลิปมาในแชทนี้ได้เลยครับ\n${QT_URL}`,
});
const flexErr = checkFlexMessages(msg);
if (flexErr.length) { console.log("❌ การ์ด Flex ไม่ผ่าน:", flexErr); process.exit(1); }
const n = await notifyCustomerLogged(sb, next, msg, `แจ้งเก็บเพิ่ม ${charge.label} ${thb(AMOUNT)} บาท`, "key");
console.log("LINE:", JSON.stringify(n));

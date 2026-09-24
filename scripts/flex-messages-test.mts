/**
 * 🧪 เทสการ์ด LINE ทุกใบที่ส่งหาลูกค้า (src/lib/server/notify.ts)
 *
 *   npm run check:flex
 *
 * ทำไมต้องมี (เจ้าของร้านสั่ง 22 ก.ย. 69 ให้ทุกข้อความเป็น Flex):
 * การ์ดผิดรูปแม้จุดเดียว LINE ตอบ 400 แล้ว **ลูกค้าไม่ได้ข้อความเลย** — เรื่องเงิน/จัดส่งหายเงียบไม่ได้
 * ตัวนี้สร้างการ์ดทุกแบบจากข้อมูลจริง ๆ แล้วตรวจกติกาที่ LINE ตีกลับ (ดู checkFlexMessages)
 * ⚠️ ของจริงมีชั้นกันตกอีกชั้นใน notifyCustomer: 400 = ส่งซ้ำเป็นข้อความล้วนจาก altText
 */
import { ALL_CARD_HEX, NOTICE_HEX, checkFlexMessages, followUpNotice, noticeFlex, orderNotice, statusFlex, type LineMessage, type NoticeTone } from "../src/lib/server/notify";
import { CLAIM_STATUSES } from "../src/lib/claims";
import type { Order, OrderStatus } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const check = (name: string, msgs: LineMessage[]) => {
  const errs = checkFlexMessages(msgs);
  if (!msgs.length) fails.push(`${name}\n   ไม่มีข้อความออกมาเลย`);
  else if (!msgs.some((m) => m.type === "flex")) fails.push(`${name}\n   ยังเป็นข้อความล้วน ไม่ใช่การ์ด Flex`);
  else if (errs.length) fails.push(`${name}\n   ${errs.join("\n   ")}`);
  else pass++;
};

const LINK = "https://iduckystore.com/order/OD-260918-1267?key=SrbOjgPy2KZw0B75MOoMaE2C75dbmeIw";
const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "OD-260918-1267",
    date: "2026-09-18",
    customer: "คุณเอ",
    phone: "0812345678",
    status: "ชำระแล้ว",
    items: [
      { name: "สติกเกอร์ไดคัท 5×5 ซม.", qty: 200, unitPrice: 8 },
      { name: "อะคริลิคสแตนดี้ 10 ซม.", qty: 20, unitPrice: 55 },
    ],
    paidTotal: 1062,
    key: "SrbOjgPy2KZw0B75MOoMaE2C75dbmeIw",
    ...over,
  }) as unknown as Order;

// ── การ์ดแจ้งสถานะ (ของเดิม) — ต้องผ่านครบทุกสถานะ ────────────────────────
const STATUSES: OrderStatus[] = [
  "รอชำระเงิน",
  "รอตรวจสอบ",
  "ชำระแล้ว",
  "รอตรวจแบบ",
  "แก้ไขแบบ",
  "อนุมัติแบบ",
  "กำลังผลิต",
  "จัดส่งแล้ว",
  "เสร็จสิ้น",
  "ยกเลิก",
];
for (const status of STATUSES) check(`แจ้งสถานะ "${status}"`, statusFlex(order({ status }), LINK));
check("แจ้งสถานะ จัดส่งแล้ว + เลขพัสดุ", statusFlex(order({ status: "จัดส่งแล้ว", tracking: "EX123456789TH" }), LINK));
check(
  "แจ้งสถานะ ใบมัดจำยังค้างงวดหลัง",
  statusFlex(order({ status: "กำลังผลิต", deposit: { amount: 1020, firstPaidAt: "2026-09-18T03:00:00Z" } } as Partial<Order>), LINK)
);
check("แจ้งสถานะ ใบมารับเอง", statusFlex(order({ status: "จัดส่งแล้ว", shipping: "มารับเอง", shippingLabel: "มารับเองที่ร้าน" }), LINK));

// ── การ์ดเรื่องเงิน ─────────────────────────────────────────────────────────
check(
  "ยอดที่ต้องโอนเพิ่ม (คิวแจ้งยอด)",
  orderNotice(order(), LINK, {
    tone: "balanceUp",
    head: "มียอดเพิ่ม",
    headline: "ยอดรวมเปลี่ยนเป็น 2,040 บาท",
    hero: { label: "ยอดที่ต้องโอนเพิ่ม", value: "978 บาท" },
    rows: [
      { label: "ยอดรวมทั้งบิล", value: "2,040 บาท" },
      { label: "รับแล้ว", value: "1,062 บาท", bold: true },
    ],
    note: "ยอดนี้แทนยอด 948 บาทที่แจ้งไว้ก่อนหน้าครับ\nโอนแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ",
    alt: "🧾 ออเดอร์ OD-260918-1267 มียอดเพิ่ม: ยอดรวมเปลี่ยนเป็น 2,040 บาท",
  })
);
check(
  "ไม่ต้องโอนเพิ่มแล้ว",
  orderNotice(order(), LINK, {
    tone: "noMoreDue",
    head: "ไม่ต้องโอนเพิ่มแล้ว",
    headline: "ปรับยอดใหม่: ส่วนลดมัดจำตีลาย −50 บาท",
    hero: { label: "ยอดที่ต้องโอนเพิ่ม", value: "ไม่มีแล้วครับ ✅" },
    note: "ยกเลิกยอด 730 บาทที่แจ้งไว้ก่อนหน้าครับ",
    alt: "🧾 ปรับยอดใหม่ — ไม่ต้องโอนเพิ่มแล้วครับ",
  })
);
check(
  "ค่าบริการเพิ่ม (เก็บเพิ่ม)",
  orderNotice(order(), LINK, {
    tone: "charge",
    head: "มีค่าบริการเพิ่ม",
    headline: "ค่าตัดภาพ 3 รูป 150 บาท — ลูกค้าขอให้ไดคัทตามลาย",
    hero: { label: "ยอดที่ต้องโอนเพิ่ม", value: "150 บาท" },
    rows: [{ label: "ยอดรวมทั้งบิล", value: "2,190 บาท" }],
    note: "โอนแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ",
    alt: "🧾 มีค่าบริการเพิ่ม: ค่าตัดภาพ 3 รูป 150 บาท",
  })
);
for (const [name, tone, head] of [
  ["รับมัดจำแล้ว", "depositIn", "รับมัดจำแล้ว"],
  ["รับยอดครบแล้ว", "fullIn", "รับยอดครบแล้ว"],
  ["รับเงินบางส่วน", "partial", "รับเงินบางส่วนแล้ว"],
  ["เหลือยอดค้าง (เข้าไลน์ผลิต)", "dueLeft", "เหลือยอดค้างชำระ"],
  ["รับยอดคงเหลือครบ", "settled", "รับยอดคงเหลือครบแล้ว"],
  ["รับยอดส่วนต่างครบ", "diffIn", "รับยอดส่วนต่างครบแล้ว"],
  ["ยืนยันการชำระเงิน", "paidIn", "ยืนยันการชำระเงินแล้ว"],
  ["ปรับยอดใหม่ (ยอดลด)", "balanceDown", "ปรับยอดใหม่"],
] as const)
  check(
    name,
    orderNotice(order(), LINK, {
      tone,
      head,
      headline: "ข้อความทดสอบความยาวปกติของประโยคนำในการ์ด",
      hero: { label: "ยอดคงเหลือ", value: "978 บาท" },
      rows: [
        { label: "ยอดรวมทั้งบิล", value: "2,040 บาท" },
        { label: "รับแล้ว", value: "1,062 บาท", bold: true },
      ],
      note: "โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลยครับ",
      alt: `${name} ออเดอร์ OD-260918-1267`,
    })
  );
check(
  "ตีราคางานสั่งทำ (หลายรายการ + ที่มาของราคา)",
  orderNotice(order(), LINK, {
    tone: "quote",
    head: "ตีราคาให้แล้ว",
    headline: "ตีราคางานสั่งทำให้แล้วครับ — โอนแล้วแนบสลิปได้เลย",
    hero: { label: "ยอดที่ต้องโอน", value: "2,040 บาท" },
    bullets: Array.from({ length: 12 }, (_, i) => `งานสั่งทำชิ้นที่ ${i + 1} ×10 = 500 บาท — 230 + 10 + 50 = 290`),
    alt: "💬 ตีราคางานสั่งทำให้แล้วครับ",
  })
);

// ── การ์ดแบบงาน / ผลิต / จัดส่ง ─────────────────────────────────────────────
check(
  "แบบงานพร้อมตรวจ",
  orderNotice(order(), LINK, {
    tone: "proofReady",
    head: "แบบงานพร้อมให้ตรวจ",
    headline: "แบบงานพร้อมให้คุณตรวจแล้วครับ",
    rows: [{ label: "รายการ", value: "สติกเกอร์ไดคัท 5×5 ซม.", bold: true }],
    note: "กดดูแล้วกดอนุมัติ หรือแจ้งจุดที่อยากแก้ได้เลยครับ",
    button: { label: "ดู / อนุมัติแบบ", uri: LINK },
    alt: "🎨 แบบงานพร้อมให้คุณตรวจแล้ว",
  })
);
check(
  "แบ่งส่งรอบใหม่ (มีเลขพัสดุ)",
  orderNotice(order(), LINK, {
    tone: "shipRound",
    head: "จัดส่งบางส่วน (รอบที่ 2)",
    headline: "ของรอบนี้จัดส่งแล้วครับ ตามเลขพัสดุด้านล่าง",
    rows: [
      { label: "รอบที่", value: "2", bold: true },
      { label: "จำนวนรอบนี้", value: "120 ชิ้น", bold: true },
      { label: "เลขพัสดุรอบนี้", value: "EX123456789TH", bold: true },
      { label: "📍 ส่งไปที่", value: "99/1 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" },
    ],
    bullets: ["สติกเกอร์ไดคัท 5×5 ซม. รูปที่ 1 × 100/200 ชิ้น", "อะคริลิคสแตนดี้ 10 ซม. รูปที่ 2 × 20 ชิ้น"],
    note: "ส่วนที่เหลือจะจัดส่งในรอบถัดไป แล้วแจ้งเลขพัสดุอีกครั้งครับ",
    alt: "🚚 จัดส่งบางส่วนแล้วครับ (รอบที่ 2)",
  })
);
check(
  "แบ่งส่งรอบใหม่ (มารับเอง — ไม่มีเลขพัสดุ)",
  orderNotice(order(), LINK, {
    tone: "pickupRound",
    head: "แพ็คเสร็จบางส่วน (รอบที่ 1)",
    headline: "ของรอบนี้แพ็คเสร็จแล้ว — มารับที่ร้านได้เลยครับ",
    rows: [{ label: "รอบที่", value: "1", bold: true }],
    bullets: ["สติกเกอร์ไดคัท 5×5 ซม. รูปที่ 1 × 100 ชิ้น"],
    note: "ส่วนที่เหลือทางร้านจะแจ้งอีกครั้งเมื่อพร้อมให้มารับครับ",
    alt: "🏪 แพ็คเสร็จบางส่วนแล้วครับ (รอบที่ 1)",
  })
);
check(
  "ส่งรวมกล่อง",
  orderNotice(order(), LINK, {
    tone: "shipTogether",
    head: "ส่งรวมกล่องเดียวกัน",
    headline: "ออเดอร์นี้จะจัดส่งรวมกล่องเดียวกับออเดอร์ OD-260919-1000 ครับ",
    rows: [{ label: "ส่งรวมกับ", value: "OD-260919-1000", bold: true }],
    note: "จัดส่งเมื่อไหร่ทางร้านแจ้งเลขพัสดุอีกครั้งครับ",
    alt: "📦 จะจัดส่งรวมกล่องเดียวกัน",
  })
);
check(
  "เช็คสต๊อกเรียบร้อย",
  orderNotice(order(), LINK, {
    tone: "stockOk",
    head: "เช็คสต๊อกเรียบร้อย",
    headline: "เช็คสต๊อกให้แล้วครับ — ผลิตได้ตามจำนวนที่สั่ง",
    bullets: ["สติกเกอร์ไดคัท 5×5 ซม. ×200"],
    rows: [{ label: "กำหนดส่ง", value: "25 ก.ย. 69 – 26 ก.ย. 69", bold: true }],
    alt: "✅ เช็คสต๊อกเรียบร้อยแล้วครับ",
  })
);
check(
  "ของเข้าร้านแล้ว",
  orderNotice(order(), LINK, {
    tone: "stockIn",
    head: "ของเข้าร้านแล้ว",
    headline: "สินค้าสำหรับออเดอร์นี้เข้าร้านแล้วครับ",
    note: "ทางร้านจะเริ่มผลิตให้ทันทีที่แบบงานได้รับการอนุมัติ",
    alt: "📦 สินค้าเข้าร้านแล้วครับ",
  })
);

// ── การ์ดเคลม (ใช้เลขเคลมเป็นหัวเรื่อง ไม่ใช่เลขออเดอร์) ────────────────────
for (const status of CLAIM_STATUSES)
  check(
    `อัปเดตเคลม — ${status}`,
    noticeFlex({
      tone: "claimUpdate",
      head: "อัปเดตเรื่องเคลม",
      headline: `สถานะล่าสุด: ${status}`,
      id: "CLM-260922-001",
      rows: [
        { label: "ออเดอร์", value: "OD-260918-1267", bold: true },
        { label: "สถานะ", value: status, bold: true },
      ],
      note: "ข้อความจากร้าน: ทางร้านผลิตชิ้นใหม่ให้แล้วครับ",
      button: { label: "ดูเรื่องที่แจ้งไว้", uri: "https://iduckystore.com/account/claims" },
      alt: `🧰 อัปเดตเคลม CLM-260922-001 · สถานะ: ${status}`,
    })
  );

// ── เคสสุดขอบที่เคยทำให้ LINE ตีกลับ ────────────────────────────────────────
{
  const long = "ก".repeat(3000);
  check(
    "ข้อความยาวมาก (ต้องถูกตัดให้อยู่ในลิมิต)",
    orderNotice(order(), LINK, {
      tone: "shipApart",
      head: long,
      headline: long,
      hero: { label: long, value: long },
      rows: [{ label: long, value: long }],
      bullets: [long, long],
      note: long,
      button: { label: "ป้ายปุ่มที่ยาวเกินยี่สิบตัวอักษรแน่นอน", uri: LINK },
      alt: long,
    })
  );
  check(
    "ออเดอร์ไม่มี key (ใบเก่า) — ลิงก์ยังต้องเป็น https",
    statusFlex(order({ key: undefined, status: "รอชำระเงิน" }), "https://iduckystore.com/order/OD-OLD-0001")
  );
  check("ออเดอร์ไม่มีรายการสินค้า", statusFlex(order({ items: [] }), LINK));
}

// ── 📦 ส่งตามให้ (ใบปิดแล้วแต่ของไม่ครบ) ────────────────────────────────
{
  const round = {
    items: [
      { item: 0, qty: 3, unit: "ชิ้น", itemName: "โฟโต้การ์ด PVC" },
      { item: 0, proof: 1, url: "https://x/y.jpg", qty: 1, unit: "เซ็ต", itemName: "พวงกุญแจอะคริลิค" },
    ],
    reason: "ลืมใส่กล่อง",
    fault: "ร้าน" as const,
    by: "แอดมิน",
    at: "2026-09-24T03:00:00.000Z",
  };
  check("ส่งของที่ตกค้างแล้ว (มีเลขพัสดุ)", followUpNotice(order({ tracking: "EQ226638541TH" }), LINK, round, "EQ226638999TH"));
  check(
    "ของที่ตกค้างพร้อมให้มารับ (ใบมารับเอง ไม่มีเลขพัสดุ)",
    followUpNotice(order({ shipping: "มารับเอง", shippingLabel: "มารับเองที่ร้าน" }), LINK, round, "")
  );
  check(
    "ส่งตาม: ชื่อรายการยาว + ของหลายรายการ",
    followUpNotice(order({ tracking: "EQ1TH" }), LINK, { ...round, items: Array.from({ length: 6 }, (_, i) => ({ item: 0, qty: i + 1, itemName: `${"ชื่อรายการยาวมากจนต้องถูกตัดในการ์ด ".repeat(3)}ชุดที่ ${i + 1}` })) }, "EQ2TH")
  );
}

// ── ทุกโทนต้องสร้างการ์ดได้จริง (เพิ่มโทนใหม่แล้วลืมทดสอบ = ตกตรงนี้) ──────
for (const tone of Object.keys(NOTICE_HEX) as NoticeTone[])
  check(
    `โทน "${tone}" สร้างการ์ดได้`,
    orderNotice(order(), LINK, {
      tone,
      head: `หัวการ์ดโทน ${tone}`,
      headline: "ประโยคนำของการ์ด",
      hero: { label: "ยอด", value: "978 บาท" },
      rows: [{ label: "ยอดรวมทั้งบิล", value: "2,040 บาท", bold: true }],
      bullets: ["รายการที่หนึ่ง", "รายการที่สอง"],
      note: "สิ่งที่ลูกค้าต้องทำต่อ",
      alt: `การ์ดโทน ${tone}`,
    })
  );

// ── 🎨 จานสี: หนึ่งเรื่องหนึ่งสี ห้ามซ้ำ · ตัวอักษรขาวต้องอ่านออก · ห้ามใกล้กันจนแยกไม่ออก ──
{
  const P = ALL_CARD_HEX();
  const names = Object.keys(P);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const contrast = (h: string) => {
    const [r, g, b] = rgb(h).map(lin);
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
  };
  const lab = (h: string) => {
    const [r, g, b] = rgb(h).map(lin);
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [x, y, z] = [f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), f(0.2126 * r + 0.7152 * g + 0.0722 * b), f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)];
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const dE = (a: string, b: string) => {
    const [A, B] = [lab(a), lab(b)];
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  };

  const seen = new Map<string, string>();
  const dup: string[] = [];
  for (const n of names) {
    const was = seen.get(P[n]);
    if (was) dup.push(`${P[n]} ใช้ทั้ง "${was}" และ "${n}"`);
    else seen.set(P[n], n);
  }
  if (dup.length) fails.push(`จานสี: มีสีซ้ำ\n   ${dup.join("\n   ")}`);
  else pass++;

  const faint = names.filter((n) => contrast(P[n]) < 3).map((n) => `"${n}" ${P[n]} = ${contrast(P[n]).toFixed(1)}:1`);
  if (faint.length) fails.push(`จานสี: ตัวอักษรขาวบนหัวการ์ดจางเกินไป (ต้อง ≥ 3:1 — อ่านกลางแดด)\n   ${faint.join("\n   ")}`);
  else pass++;

  const MIN_DE = 13;
  const near: string[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const d = dE(P[names[i]], P[names[j]]);
      if (d < MIN_DE) near.push(`"${names[i]}" ↔ "${names[j]}" = ${d.toFixed(1)}`);
    }
  if (near.length) fails.push(`จานสี: คู่ที่ใกล้กันจนแยกไม่ออก (ต้องห่าง ≥ ${MIN_DE})\n   ${near.join("\n   ")}`);
  else pass++;
  console.log(`🎨 จานสีการ์ด ${names.length} สี — ไม่ซ้ำ · อ่านออก · ห่างกันพอ`);
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ใบ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ การ์ดผ่านครบทั้ง ${pass} ใบ`);
process.exit(fails.length ? 1 : 0);

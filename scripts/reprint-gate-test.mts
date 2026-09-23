/**
 * ♻️🖨 เทสด่านปริ้นซ้ำ "ฉีกใบเก่าทิ้งก่อน" — npx tsx --tsconfig tsconfig.json scripts/reprint-gate-test.mts
 *
 * ที่มา (เจ้าของร้านสั่ง 23 ก.ย. 69): ใบงาน/ใบปะหน้าที่ปริ้นไปแล้วยังลอยอยู่ในไลน์ผลิต
 * พอปริ้นใบใหม่ทับ ของออกสองรอบ → ปริ้นซ้ำต้องฉีกใบเก่าทิ้งแล้วถ่ายรูปแนบก่อน
 *
 * กติกา (src/lib/admin-data.ts · reprintUnlock):
 *   - ปริ้นครั้งแรก = ไม่ต้องแนบอะไร
 *   - ครั้งที่ 2 ขึ้นไป = ต้องมีภาพที่ยังไม่ถูกใช้ และถ่ายหลังปริ้นครั้งล่าสุด (printedBefore >= จำนวนครั้งที่ปริ้นไปแล้ว)
 *   - ภาพ 1 ใบ = ปริ้นซ้ำได้ 1 รอบ (printed route ประทับ usedAt) — รอบถัดไปต้องถ่ายใหม่
 */
import { isReprint, lastReprintProof, orderPrintCount, reprintUnlock, type Order, type ReprintPhoto } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const mk = (o: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "",
    customer: "",
    phone: "",
    address: "",
    status: "อนุมัติแบบ",
    payment: "โอนธนาคาร",
    shipping: "",
    shippingCost: 0,
    items: [{ productId: "1-4", name: "สแตนดี้อะคริลิค", qty: 1, unitPrice: 100 }],
    ...o,
  }) as Order;

const photo = (p: Partial<ReprintPhoto>): ReprintPhoto => ({
  url: "https://x/1.jpg",
  by: "ToEy",
  at: "2026-09-23T03:00:00.000Z",
  printedBefore: 1,
  ...p,
});

// ── นับจำนวนครั้ง (ใบเก่าที่ไม่มี printCount) ──────────────────────────────────────
eq("ใบใหม่: ยังไม่เคยปริ้น", orderPrintCount(mk({})), 0);
eq("ใบเก่า: มี printedAt แต่ไม่มี printCount = 1 ครั้ง", orderPrintCount(mk({ printedAt: "2026-09-20T03:00:00.000Z" })), 1);
eq("ใบใหม่: กดพิมพ์รอบแรกไม่ใช่ปริ้นซ้ำ", isReprint(mk({})), false);
eq("ปริ้นแล้ว 1 ครั้ง: รอบต่อไปคือปริ้นซ้ำ", isReprint(mk({ printCount: 1 })), true);

// ── ด่าน: ปริ้นซ้ำต้องมีภาพฉีกใบเก่าที่ยังไม่ถูกใช้ ────────────────────────────────
eq("ปริ้นซ้ำ: ไม่มีภาพเลย = ปริ้นไม่ได้", reprintUnlock(mk({ printCount: 1 })), undefined);
eq(
  "ปริ้นซ้ำ: มีภาพถ่ายหลังปริ้นครั้งล่าสุด = ปริ้นได้",
  reprintUnlock(mk({ printCount: 1, reprintPhotos: [photo({ printedBefore: 1 })] }))?.by,
  "ToEy"
);
eq(
  "ปริ้นซ้ำ: ภาพที่ใช้ปลดล็อกไปแล้ว ใช้ซ้ำไม่ได้",
  reprintUnlock(mk({ printCount: 2, reprintPhotos: [photo({ printedBefore: 1, usedAt: "2026-09-23T03:05:00.000Z" })] })),
  undefined
);
eq(
  "ปริ้นซ้ำรอบที่ 3: ภาพเก่าของรอบที่ 2 ใช้ไม่ได้ ต้องถ่ายใหม่",
  reprintUnlock(mk({ printCount: 2, reprintPhotos: [photo({ printedBefore: 1 })] })),
  undefined
);
eq(
  "ปริ้นซ้ำรอบที่ 3: ถ่ายใหม่หลังปริ้นรอบที่ 2 = ปริ้นได้",
  reprintUnlock(
    mk({
      printCount: 2,
      reprintPhotos: [photo({ printedBefore: 1, usedAt: "2026-09-23T03:05:00.000Z" }), photo({ url: "https://x/2.jpg", printedBefore: 2 })],
    })
  )?.url,
  "https://x/2.jpg"
);
eq(
  "ใบเก่า (printedAt อย่างเดียว): ภาพจากรอบนั้นปลดล็อกได้",
  reprintUnlock(mk({ printedAt: "2026-09-20T03:00:00.000Z", reprintPhotos: [photo({ printedBefore: 1 })] }))?.by,
  "ToEy"
);

// ── ฝั่งแพ็ค: หยิบภาพของรอบปริ้นซ้ำล่าสุดมาโชว์ ───────────────────────────────────
eq("ฝั่งแพ็ค: ยังไม่เคยปริ้นซ้ำ = ไม่มีภาพให้โชว์", lastReprintProof(mk({ printCount: 1 })), undefined);
eq(
  "ฝั่งแพ็ค: โชว์ภาพของรอบที่ใช้ปลดล็อกล่าสุด",
  lastReprintProof(
    mk({
      printCount: 3,
      reprintPhotos: [
        photo({ url: "https://x/1.jpg", printedBefore: 1, usedAt: "2026-09-23T03:05:00.000Z" }),
        photo({ url: "https://x/2.jpg", printedBefore: 2, usedAt: "2026-09-23T04:05:00.000Z" }),
        photo({ url: "https://x/3.jpg", printedBefore: 3 }),
      ],
    })
  )?.url,
  "https://x/2.jpg"
);

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);

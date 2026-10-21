/**
 * 🔗 เทสต์จับคู่แบบของแถม ↔ แบบสินค้า "หลายรูป" (OD-261012-9950 · 21 ต.ค. 69)
 *    รองหลัง 2 ลาย แต่ MagSafe 4 แบบ / พวงกุญแจ 8 แบบ — เดิม pairUrl เก็บค่าเดียว กดจับคู่รูปถัดไปทับคู่เก่า
 *    รัน: npm run check:gift-pair
 */
import assert from "node:assert/strict";
import { giftDesignQtys, giftPairLabel, giftPairQty, giftPairsOf, giftPairOptions, proofPairUrls } from "../src/lib/gifts";
import { keepCustomerVerdict } from "../src/lib/server/order-merge";
import type { OrderGift, Proof } from "../src/lib/admin-data";

const P = (n: number) => `https://x/mag-${n}.jpg`;
const K = (n: number) => `https://x/key-${n}.jpg`;
const items = [
  { name: "กริ๊กต๊อก MagSafe", proofs: [25, 26, 26, 25].map((qty, i) => ({ url: P(i), qty })) },
  { name: "พวงกุญแจอะคริลิค", proofs: [37, 38, 38, 38, 38, 37, 37, 37].map((qty, i) => ({ url: K(i), qty })) },
];
const gift = (proofs: Partial<Proof>[]): OrderGift =>
  ({ promoId: "gift-backing-package", name: "แพ็กเกจรองหลัง", qty: 402, needArtwork: true, proofs: proofs.map((p) => ({ at: "2026-10-21T00:00:00Z", url: "", ...p })) }) as OrderGift;

let n = 0;
const ok = (name: string, f: () => void) => {
  f();
  n++;
  console.log("  ✓", name);
};

ok("proofPairUrls: ชุดเต็มมาก่อน · ไม่มีค่อยถอยไป pairUrl เดิม · ตัดซ้ำ/ว่าง", () => {
  assert.deepEqual(proofPairUrls({ pairUrl: P(0) }), [P(0)]);
  assert.deepEqual(proofPairUrls({ pairUrl: P(0), pairUrls: [P(1), P(2), P(1), ""] }), [P(1), P(2)]);
  assert.deepEqual(proofPairUrls({ pairUrls: [] , pairUrl: P(3) }), [P(3)]);
  assert.deepEqual(proofPairUrls(undefined), []);
});

ok("giftPairsOf: รองหลัง 1 ลายคู่ MagSafe 4 แบบ · อีกลายคู่พวงกุญแจ 8 แบบ · จำนวนรวมถูก", () => {
  const g = gift([
    { url: "https://x/back-a.jpg", pairUrls: [P(0), P(1), P(2), P(3)] },
    { url: "https://x/back-b.jpg", pairUrls: [0, 1, 2, 3, 4, 5, 6, 7].map(K) },
  ]);
  const pairs = giftPairsOf(g, items);
  assert.equal(pairs[0].length, 4);
  assert.equal(pairs[1].length, 8);
  assert.equal(giftPairQty(pairs[0]), 102);
  assert.equal(giftPairQty(pairs[1]), 300);
  const dq = giftDesignQtys(g, items);
  assert.deepEqual(dq, { qtys: [102, 300], sure: true });
});

ok("ข้อมูลเก่า pairUrl เดี่ยวยังอ่านได้ (1 คู่) · คู่ที่ถูกลบแบบไปแล้วหายจากรายการ", () => {
  const g = gift([{ url: "https://x/back-a.jpg", pairUrl: P(1) }, { url: "https://x/back-b.jpg", pairUrls: [K(0), "https://x/gone.jpg"] }]);
  const pairs = giftPairsOf(g, items);
  assert.deepEqual(pairs[0].map((p) => p.url), [P(1)]);
  assert.deepEqual(pairs[1].map((p) => p.url), [K(0)]);
  assert.equal(giftPairQty([]), null);
});

ok("giftPairLabel: รวมเลขรูปของสินค้าเดียวกัน ไม่พิมพ์ชื่อซ้ำ", () => {
  const opts = giftPairOptions(items);
  const pick = (urls: string[]) => urls.map((u) => opts.find((o) => o.url === u)!);
  assert.equal(giftPairLabel(pick([P(0), P(1), P(3)])), "กริ๊กต๊อก MagSafe รูปที่ 1, 2, 4");
  assert.equal(giftPairLabel(pick([P(0), K(2)])), "กริ๊กต๊อก MagSafe รูปที่ 1 · พวงกุญแจอะคริลิค รูปที่ 3");
  assert.equal(giftPairLabel(giftPairOptions([items[0]]).slice(0, 2)), "รูปที่ 1, 2");
});

ok("keepCustomerVerdict: หน้าจอแอดมินค้าง (pairAt เก่า) ส่งคู่เดี่ยวมา ไม่ทับชุดคู่ที่ลูกค้าเพิ่งจับหลายรูป", () => {
  const cur = { proofs: [{ url: "https://x/back-a.jpg", at: "t", pairUrl: P(0), pairUrls: [P(0), P(1), P(2)], pairAt: "2026-10-21T09:00:00Z" }] };
  const inc = { proofs: [{ url: "https://x/back-a.jpg", at: "t", pairUrl: P(0), pairAt: "2026-10-21T08:00:00Z" }] };
  const out = keepCustomerVerdict(cur, inc, "2026-10-21T08:30:00Z");
  assert.deepEqual(proofPairUrls(out.proofs![0]), [P(0), P(1), P(2)]);
  // หน้าจอที่ใหม่กว่าเปลี่ยนชุดคู่ได้
  const inc2 = { proofs: [{ url: "https://x/back-a.jpg", at: "t", pairUrl: P(3), pairUrls: [P(3)], pairAt: "2026-10-21T10:00:00Z" }] };
  assert.deepEqual(proofPairUrls(keepCustomerVerdict(cur, inc2, "2026-10-21T09:30:00Z").proofs![0]), [P(3)]);
});

console.log(`✅ ผ่าน ${n}/${n} เคส`);

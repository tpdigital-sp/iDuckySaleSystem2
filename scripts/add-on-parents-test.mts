/**
 * 🧪 จับคู่บรรทัด Add on → รายการแม่ (addOnParents) — npm run check:add-on
 * เคสจริง 29 ก.ย. 69 OD-260924-2339: เปิดใบด้วย paper-art-pet (ไม่มีค่าคละ) แล้วสั่งเพิ่ม paper-art-pet อีก 2 บรรทัด
 * + Add on 1 บรรทัด → ตัวเดาเดิมจับ Add on ไปเกาะรายการที่ 1 (รอบแรก) แทนรายการที่ 8 (รอบสั่งเพิ่ม) หน้าจอเลย "หายจากท้ายบิล"
 */
import { addOnParents, addOnDisplayName, addOnLinesOf, addOnNameHead } from "../src/lib/admin-data";
import { addOnFeeLines } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => (cond ? pass++ : fails.push(name));
const T = "2026-09-29T04:56:00.456Z";

// 1) ใบจริง OD-260924-2339 (ไม่มี lineKey — ข้อมูลเก่า) → Add on ต้องเกาะรายการรอบสั่งเพิ่มตัวแรก (index 7)
const real = [
  { productId: "paper-art-pet" },
  { productId: "poster-a3", addedAt: "2026-09-25T03:16:12.388Z" },
  { productId: "poster-a3", addedAt: "2026-09-25T03:22:01.773Z" },
  { productId: "poster-a3", addedAt: "2026-09-25T03:23:32.255Z" },
  { productId: "package-backing", addedAt: "2026-09-25T03:30:31.557Z" },
  { productId: "package-backing", addedAt: "2026-09-25T03:30:31.557Z" },
  { productId: "poster-a3#boxfee", addedAt: "2026-09-25T03:23:32.255Z" },
  { productId: "paper-art-pet", addedAt: T },
  { productId: "paper-art-pet", addedAt: T },
  { productId: "paper-art-pet#designfee", addedAt: T },
];
ok("OD-260924-2339: Add on เกาะรายการรอบสั่งเพิ่ม (index 7) ไม่ใช่รอบแรก", addOnParents(real).get(9) === 7);

// 2) ใบเปิดใหม่ (ไม่มี addedAt เลย) — ตัวเดาเดิมยังใช้ได้: Add on ตัวที่ k จับสินค้า X ตัวที่ k
const fresh = [
  { productId: "a" },
  { productId: "b" },
  { productId: "a" },
  { productId: "a#designfee" },
  { productId: "a#designfee" },
  { productId: "b#designfee" },
];
const m2 = addOnParents(fresh);
ok("ใบใหม่: Add on a ตัวแรก → a ตัวแรก", m2.get(3) === 0);
ok("ใบใหม่: Add on a ตัวที่สอง → a ตัวที่สอง", m2.get(4) === 2);
ok("ใบใหม่: Add on b → b", m2.get(5) === 1);

// 3) ลิงก์ตรงด้วย lineKey ชนะทุกอย่าง แม้ลำดับถูกสลับ/Add on อยู่ก่อนแม่
const linked = [
  { productId: "a#designfee", addOnFor: "k2" },
  { productId: "a", lineKey: "k1" },
  { productId: "a", lineKey: "k2" },
];
ok("lineKey: Add on ชี้ k2 → index 2 แม้ลำดับสลับ", addOnParents(linked).get(0) === 2);

// 4) addOnFor ชี้รหัสที่ไม่มีแล้ว (แม่ถูกลบ) → ถอยไปตัวเดา ไม่พัง
const orphanKey = [{ productId: "a" }, { productId: "a#designfee", addOnFor: "gone" }];
ok("addOnFor หาย → ถอยไปตัวเดา", addOnParents(orphanKey).get(1) === 0);

// 5) ชุดสั่งเพิ่มไม่มีสินค้านั้น (แอดมินลบแม่ไปแล้ว) → ถอยไปหาทั้งใบ ไม่หลุด Map
const noBatchHost = [{ productId: "a" }, { productId: "a#designfee", addedAt: T }];
ok("ชุดเดียวกันไม่มีแม่ → หาทั้งใบ", addOnParents(noBatchHost).get(1) === 0);

// 6) ไม่มีแม่เลย → ไม่อยู่ใน Map (โชว์เป็นรายการปกติ)
ok("ไม่มีแม่ → ไม่จับคู่", addOnParents([{ productId: "z#designfee" }]).size === 0);

// 7) 🏷 ชื่อโชว์ของบรรทัด Add on ใบเก่า ต้องบอกว่า "ค่าคละลาย"
const dn = (name: string) => addOnDisplayName({ productId: "paper-art-pet#designfee", name });
ok("ชื่อเก่า (3 ลาย) → เติมค่าคละลาย", dn("🎨 Add on — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET (3 ลาย)") === "🎨 Add on ค่าคละลาย — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET (คละ 3 ลาย)");
ok("ชื่อเก่าไม่มีวงเล็บ → เติมค่าคละลาย", dn("🎨 Add on — โปสเตอร์") === "🎨 Add on ค่าคละลาย — โปสเตอร์");
ok("ชื่อใหม่ที่มีคำว่าค่าอยู่แล้ว → คงเดิม", dn("🎨 Add on — โปสเตอร์ (ค่าคละลาย · คละ 3 ลาย)") === "🎨 Add on — โปสเตอร์ (ค่าคละลาย · คละ 3 ลาย)");
ok("ไม่ใช่บรรทัด Add on → คงเดิม", addOnDisplayName({ productId: "poster-a3", name: "🎨 Add on — โปสเตอร์ (3 ลาย)" }) === "🎨 Add on — โปสเตอร์ (3 ลาย)");

// 🧾 บรรทัดย่อย "ระบุว่าเพิ่มค่าอะไร กี่บาท" (29 ก.ย. 69) — ใบใหม่เก็บ addOnLines · ใบเก่าถอดจากชื่อ
const P = "paper-art-pet#designfee";
const twoSides = "🎨 Add on — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET (ค่าคละลาย (ด้านหน้า) · คละ 3 ลาย + ค่าคละลาย (ด้านหลัง) · คละ 3 ลาย)";
ok("หัวชื่อตัดวงเล็บซ้อนท้าย", addOnNameHead({ productId: P, name: twoSides }) === "🎨 Add on — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET");
ok("หัวชื่อไม่ใช่ Add on คงเดิม", addOnNameHead({ productId: "poster-a3", name: "โปสเตอร์ (A3)" }) === "โปสเตอร์ (A3)");
const stored = addOnLinesOf({ productId: P, name: twoSides, qty: 1, unitPrice: 20, addOnLines: [{ label: "ค่าคละลาย (ด้านหน้า)", amount: 10, note: "คละ 3 ลาย" }, { label: "ค่าคละลาย (ด้านหลัง)", amount: 10, note: "คละ 3 ลาย" }] });
ok("ใบใหม่ใช้ addOnLines ตรง ๆ", stored.length === 2 && stored[0].amount === 10 && stored[1].label === "ค่าคละลาย (ด้านหลัง)");
const parsed2 = addOnLinesOf({ productId: P, name: twoSides, qty: 1, unitPrice: 20 });
ok("ใบเก่า 2 ค่า → รู้ชื่อ+โน้ต ไม่รู้ยอดแยก", parsed2.length === 2 && parsed2[0].label === "ค่าคละลาย (ด้านหน้า)" && parsed2[0].note === "คละ 3 ลาย" && parsed2[0].amount === undefined && parsed2[1].label === "ค่าคละลาย (ด้านหลัง)");
const parsed1 = addOnLinesOf({ productId: P, name: "🎨 Add on — งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET (ค่าคละลาย · คละ 3 ลาย)", qty: 1, unitPrice: 10 });
ok("ใบเก่าค่าเดียว → ยอด = ทั้งบรรทัด", parsed1.length === 1 && parsed1[0].label === "ค่าคละลาย" && parsed1[0].amount === 10 && parsed1[0].note === "คละ 3 ลาย");
const legacy = addOnLinesOf({ productId: P, name: "🎨 Add on — โปสเตอร์ (3 ลาย)", qty: 1, unitPrice: 5 });
ok("ชื่อเก่าสุด (3 ลาย) → ค่าคละลาย", legacy.length === 1 && legacy[0].label === "ค่าคละลาย" && legacy[0].amount === 5 && legacy[0].note === "คละ 3 ลาย");
ok("ไม่ใช่ Add on → []", addOnLinesOf({ productId: "poster-a3", name: "โปสเตอร์ (3 ลาย)", qty: 1, unitPrice: 5 }).length === 0);
ok("ชื่อไม่มีวงเล็บ → []", addOnLinesOf({ productId: P, name: "🎨 Add on — โปสเตอร์", qty: 1, unitPrice: 5 }).length === 0);

// กระจายยอดจริงลงบรรทัดย่อยเมื่อค่าคละถูกเฉลี่ยจากล็อต (ผลรวมต้อง = fee เสมอ)
const sum = (ls: { amount: number }[]) => ls.reduce((s, l) => s + l.amount, 0);
const a = addOnFeeLines([{ label: "เคลือบ: เงา", amount: 40, note: "฿40 × 1 แผ่น" }, { label: "ค่าคละลาย", amount: 10, note: "คละ 3 ลาย" }], 45, "คละ 3 ลาย · เฉลี่ยจากล็อตรวม 5 แผ่น A3");
ok("ค่าต่อแผ่นคงเดิม · ค่าคละรับส่วนที่เหลือ", a.length === 2 && a[0].amount === 40 && a[1].amount === 5 && a[1].note === "คละ 3 ลาย · เฉลี่ยจากล็อตรวม 5 แผ่น A3" && sum(a) === 45);
const b = addOnFeeLines([{ label: "ค่าคละลาย (ด้านหน้า)", amount: 10 }, { label: "ค่าคละลาย (ด้านหลัง)", amount: 10 }], 15);
ok("2 บรรทัดคละแบ่งตามสัดส่วน", b.length === 2 && b[0].amount === 7.5 && b[1].amount === 7.5 && sum(b) === 15);
const c = addOnFeeLines([{ label: "ค่าคละลาย (ด้านหน้า)", amount: 10 }, { label: "ค่าคละลาย (ด้านหลัง)", amount: 20 }], 10);
ok("แบ่งตามสัดส่วน 1:2 เศษไปบรรทัดสุดท้าย", c[0].amount === 3.33 && c[1].amount === 6.67 && sum(c) === 10);
const d = addOnFeeLines([], 5, "คละ 3 ลาย");
ok("แจกแจงไม่ได้เลย → ค่าคละลายบรรทัดเดียว", d.length === 1 && d[0].label === "ค่าคละลาย" && d[0].amount === 5 && d[0].note === "คละ 3 ลาย");
const e = addOnFeeLines([{ label: "เคลือบ: เงา", amount: 40 }, { label: "ค่าคละลาย", amount: 10 }], 40);
ok("ยอดเหลือ 0 → ตัดบรรทัดคละทิ้ง", e.length === 1 && e[0].label === "เคลือบ: เงา" && sum(e) === 40);

console.log(`✅ ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log(" ❌", f);
if (fails.length) process.exit(1);

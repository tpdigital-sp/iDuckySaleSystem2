/**
 * 🧪 ตัวเลือกใหม่ในกลุ่มที่แยกสต๊อกแล้วต้องได้ SKU เอง (planChoiceCover) — npm run check:stock-cover-choices
 * เจ้าของร้านถาม 30 ก.ย. 69: "รุ่นมือถือใหม่เข้ามา จะเพิ่มลง stock ยังไง อยากให้เชื่อมกับสินค้าและเข้า stock เอง"
 */
import { applyChoiceCover, planChoiceCover, type PlanSku } from "../src/lib/stock-cover-plan";
import type { Product } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => (cond ? pass++ : fails.push(name));
const P = (options: Product["options"], extra: Partial<Product> = {}): Product =>
  ({ id: "case-magsafe", name: "Case Magsafe", price: 0, category: "phone-gadget", options, ...extra }) as unknown as Product;
const sku = (id: string, name: string, code: string, extra: Partial<PlanSku> = {}): PlanSku => ({ id, name, code, unit: "ชิ้น", family: "เคสมือถือ", active: true, ...extra });

// 1) ยังไม่เคยแยก (ไม่มีค่าไหนผูก SKU) → ไม่ทำอะไร แม้มีค่าใหม่ — ปล่อยให้คนกด ✂️ แยกเอง
{
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15" }, { name: "iPhone 16" }] }]);
  ok("ไม่เคยแยก → ไม่สร้าง", planChoiceCover(p, [sku("s0", "Case Magsafe", "P-CASE-MAGSAFE", { productIds: ["case-magsafe"] })], new Set(["P-CASE-MAGSAFE"])).length === 0);
}

// 2) แยกแล้ว 2 ค่า + เพิ่ม iPhone 17 → สร้าง 1 ตัว ชื่อ/รหัสตามพี่ ยืมหน่วย/ตระกูล/ทุน · ผูกกลับเป็น stockItemId
{
  const items = [
    sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1", { unitCost: 35, reorderPoint: 5, leadTimeDays: 7 }),
    sku("s2", "Case Magsafe · iPhone 16", "P-CASE-MAGSAFE-2", { unitCost: 35 }),
  ];
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15", stockItemId: "s1" }, { name: "iPhone 16", stockItemId: "s2" }, { name: "iPhone 17", imageSrc: "/img/17.jpg" }] }]);
  const plan = planChoiceCover(p, items, new Set(["P-CASE-MAGSAFE-1", "P-CASE-MAGSAFE-2"]));
  ok("เพิ่ม 1 รุ่น → 1 SKU", plan.length === 1);
  ok("ชื่อตามแบบพี่", plan[0]?.name === "Case Magsafe · iPhone 17");
  ok("รหัสต่อท้าย", plan[0]?.code === "P-CASE-MAGSAFE-3");
  ok("ยืมทุน/จุดสั่ง/ตระกูล", plan[0]?.template.unitCost === 35 && plan[0]?.template.reorderPoint === 5 && plan[0]?.template.family === "เคสมือถือ");
  ok("รูปจากตัวเลือก", plan[0]?.imageUrl === "/img/17.jpg");
  ok("ไม่ใช่ตัวเดิม", !plan[0]?.reuseId);
  const next = applyChoiceCover(p, [{ item: plan[0], stockItemId: "sNEW" }]);
  ok("ผูกกลับที่ค่าใหม่", next.options![0].choices[2].stockItemId === "sNEW");
  ok("ค่าเดิมไม่แตะ", next.options![0].choices[0].stockItemId === "s1" && next.options![0].choices[1].stockItemId === "s2");
}

// 3) รหัสห้ามซ้ำแม้ตัวที่ลบแล้ว (P-…-3 เคยใช้) → ข้ามไป -4
{
  const items = [sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1")];
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15", stockItemId: "s1" }, { name: "iPhone 17" }, { name: "iPhone 17 Pro" }] }]);
  const plan = planChoiceCover(p, items, new Set(["P-CASE-MAGSAFE-1", "P-CASE-MAGSAFE-2", "P-CASE-MAGSAFE-3"]));
  ok("2 รุ่นใหม่ → 2 ตัว รหัสเว้นของเก่า", plan.map((x) => x.code).join(",") === "P-CASE-MAGSAFE-4,P-CASE-MAGSAFE-5");
}

// 4) บันทึกทับแล้วลิงก์หาย: SKU "Case Magsafe · iPhone 17" ลอยอยู่ (ไม่ผูกอะไร) → ผูกตัวเดิม ไม่สร้างซ้ำ
{
  const items = [sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1"), sku("s3", "Case Magsafe · iPhone 17", "P-CASE-MAGSAFE-3")];
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15", stockItemId: "s1" }, { name: "iPhone 17" }] }]);
  const plan = planChoiceCover(p, items, new Set(["P-CASE-MAGSAFE-1", "P-CASE-MAGSAFE-3"]));
  ok("ตัวลอยชื่อตรง → reuse", plan.length === 1 && plan[0].reuseId === "s3");
  // ตัวเดียวกันแต่ถูกผูกกับสินค้าอื่นอยู่ (productIds) = ไม่ลอย ต้องสร้างใหม่
  const items2 = [sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1"), sku("s3", "Case Magsafe · iPhone 17", "P-CASE-MAGSAFE-3", { productIds: ["other"] })];
  ok("ผูกกับสินค้าอื่นอยู่ → ไม่ reuse", !planChoiceCover(p, items2, new Set())[0]?.reuseId);
  // SKU ที่ถูกลบแล้ว (active false) ไม่นับเป็นตัวลอย
  const items3 = [sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1"), sku("s3", "Case Magsafe · iPhone 17", "P-CASE-MAGSAFE-3", { active: false })];
  ok("ตัวที่ลบแล้ว → ไม่ reuse", !planChoiceCover(p, items3, new Set())[0]?.reuseId);
}

// 5) พี่ ๆ มี part ("เคส") → ชื่อ "<part> <ค่า> (<สินค้า>)" + ส่ง part ต่อ
{
  const items = [sku("s1", "เคส iPhone 15 (Case Magsafe)", "P-CASE-MAGSAFE-1", { part: "เคส" })];
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15", stockItemId: "s1" }, { name: "iPhone 17" }] }]);
  const plan = planChoiceCover(p, items, new Set());
  ok("ชื่อแบบมี part", plan[0]?.name === "เคส iPhone 17 (Case Magsafe)" && plan[0]?.template.part === "เคส");
}

// 6) ไม่แตะ: กลุ่มคลังกลาง (presetId) · ช่องกรอก · ค่าที่ผูกแบบมีเงื่อนไขอยู่แล้ว · SKU พี่ถูกลบ (active false) = เหมือนยังไม่แยก
{
  const items = [sku("s1", "x", "X-1")];
  ok("presetId ไม่ยุ่ง", planChoiceCover(P([{ label: "สี", presetId: "pp", choices: [{ name: "แดง", stockItemId: "s1" }, { name: "น้ำเงิน" }] }]), items, new Set()).length === 0);
  ok("ช่องกรอกไม่ยุ่ง", planChoiceCover(P([{ label: "ขนาด", display: "input", choices: [{ name: "a", stockItemId: "s1" }, { name: "b" }] }]), items, new Set()).length === 0);
  ok("ค่าที่มี stockLinks อยู่แล้วไม่ยุ่ง", planChoiceCover(P([{ label: "ขนาด", choices: [{ name: "a", stockItemId: "s1" }, { name: "b", stockLinks: [{ stockItemId: "s1" }] }] }]), items, new Set()).length === 0);
  const dead = [sku("s1", "x", "X-1", { active: false })];
  ok("พี่ถูกลบแล้ว = ยังไม่แยก", planChoiceCover(P([{ label: "ขนาด", choices: [{ name: "a", stockItemId: "s1" }, { name: "b" }] }]), dead, new Set()).length === 0);
}

// 7) แยกทุกคู่ 2 กลุ่ม (สีขอบ × รุ่น) — เพิ่มรุ่นใหม่ในกลุ่มที่ 2 → SKU ต่อทุกสีขอบ · เพิ่มสีขอบใหม่ → SKU ต่อทุกรุ่น
{
  const items = [
    sku("w15", "Case Premium · iPhone 15 · ขอบขาว", "P-EDGE-1"),
    sku("b15", "Case Premium · iPhone 15 · ขอบดำ", "P-EDGE-2"),
    sku("w16", "Case Premium · iPhone 16 · ขอบขาว", "P-EDGE-3"),
    sku("b16", "Case Premium · iPhone 16 · ขอบดำ", "P-EDGE-4"),
  ];
  const L = (id: string, model: string) => ({ stockItemId: id, when: [{ label: "รุ่นมือถือ", choices: [model] }] });
  const p = P(
    [
      { label: "สีขอบ", choices: [{ name: "ขอบขาว", stockLinks: [L("w15", "iPhone 15"), L("w16", "iPhone 16")] }, { name: "ขอบดำ", stockLinks: [L("b15", "iPhone 15"), L("b16", "iPhone 16")] }] },
      { label: "รุ่นมือถือ", choices: [{ name: "iPhone 15" }, { name: "iPhone 16" }, { name: "iPhone 17" }] },
    ],
    { id: "case-premium-edge", name: "Case Premium" }
  );
  const plan = planChoiceCover(p, items, new Set(["P-EDGE-1", "P-EDGE-2", "P-EDGE-3", "P-EDGE-4"]));
  ok("รุ่นใหม่ × 2 สีขอบ = 2 ตัว", plan.length === 2);
  ok("ชื่อคู่ตามแบบปุ่มแยก", plan.map((x) => x.name).sort().join("|") === "Case Premium · iPhone 17 · ขอบขาว|Case Premium · iPhone 17 · ขอบดำ");
  ok("รหัสต่อจาก -4", plan.map((x) => x.code).sort().join(",") === "P-EDGE-5,P-EDGE-6");
  const next = applyChoiceCover(p, plan.map((it, k) => ({ item: it, stockItemId: `n${k}` })));
  const white = next.options![0].choices[0].stockLinks ?? [];
  ok("ลิงก์ใหม่เกาะที่สีขอบ when รุ่น=iPhone 17", white.length === 3 && white[2].when?.[0].label === "รุ่นมือถือ" && white[2].when?.[0].choices[0] === "iPhone 17");
  ok("กลุ่มรุ่นไม่ถูกใส่ stockItemId", !next.options![1].choices.some((c) => c.stockItemId));

  // เพิ่มสีขอบใหม่ "ขอบใส" (ยังไม่มีลิงก์เลย) → ต้องได้ SKU ทุกรุ่น (3 รุ่น)
  const p2 = P(
    [
      { label: "สีขอบ", choices: [{ name: "ขอบขาว", stockLinks: [L("w15", "iPhone 15"), L("w16", "iPhone 16")] }, { name: "ขอบดำ", stockLinks: [L("b15", "iPhone 15"), L("b16", "iPhone 16")] }, { name: "ขอบใส" }] },
      { label: "รุ่นมือถือ", choices: [{ name: "iPhone 15" }, { name: "iPhone 16" }] },
    ],
    { id: "case-premium-edge", name: "Case Premium" }
  );
  const plan2 = planChoiceCover(p2, items, new Set());
  ok("สีขอบใหม่ × 2 รุ่น = 2 ตัว", plan2.length === 2 && plan2.every((x) => x.choice === "ขอบใส"));
}

// 8) ของเสริมมีเงื่อนไข (กรอบรูปเฉพาะเมื่อเลือกแบบมีกรอบ) — ค่าถือทั้ง stockItemId + stockLinks → ค่าใหม่ได้แค่ตัวหลัก ไม่เดาของเสริม
{
  const items = [sku("pl", "แผ่นจิ๊กซอว์ 15x20 (UV)", "P-UV-1", { part: "แผ่นจิ๊กซอว์" }), sku("fr", "กรอบรูป 15x20 (UV)", "P-UV-FRAME-1", { part: "กรอบรูป" })];
  const p = P(
    [
      { label: "ขนาด", choices: [{ name: "15x20", stockItemId: "pl", stockLinks: [{ stockItemId: "fr", when: [{ label: "ตัวเลือก", choices: ["กรอบรูป + แผ่นจิ๊กซอว์"] }] }] }, { name: "20x30" }] },
      { label: "ตัวเลือก", choices: [{ name: "แผ่นจิ๊กซอว์" }, { name: "กรอบรูป + แผ่นจิ๊กซอว์" }] },
    ],
    { id: "uv", name: "UV" }
  );
  const plan = planChoiceCover(p, items, new Set());
  ok("ได้แค่ตัวหลักของขนาดใหม่", plan.length === 1 && plan[0].name === "แผ่นจิ๊กซอว์ 20x30 (UV)" && !plan[0].pairChoice);
}

// 9) ทำเฉพาะค่าใหม่ (isNew) — ช่องว่างเดิมที่ตั้งใจเว้นต้องไม่ถูกเติม (วัดจริง 30 ก.ย. 69: 35 ช่องใน 74 สินค้า)
{
  const items = [sku("s1", "Case Magsafe · iPhone 15", "P-CASE-MAGSAFE-1")];
  const p = P([{ label: "รุ่นมือถือ", choices: [{ name: "iPhone 15", stockItemId: "s1" }, { name: "-" }, { name: "iPhone 17" }] }]);
  const plan = planChoiceCover(p, items, new Set(), (i, c) => c === "iPhone 17");
  ok("เฉพาะค่าใหม่ ไม่เติมช่องว่างเดิม", plan.length === 1 && plan[0].choice === "iPhone 17");
  ok("ไม่มีค่าใหม่ = ไม่ทำอะไร", planChoiceCover(p, items, new Set(), () => false).length === 0);

  // ตารางคู่: ผ้าห่ม ขนาด × ตำแหน่ง — "เน้นตำแหน่ง" ตั้งใจแยกแค่บางขนาด · เพิ่มขนาดใหม่ → ได้เฉพาะคู่กับค่าที่ร่วมตารางอยู่ (2 ค่า)
  const L = (id: string, size: string) => ({ stockItemId: id, when: [{ label: "ขนาด", choices: [size] }] });
  const bl = [sku("a1", "ผ้าห่ม · 100x150cm · ไม่เน้นตำแหน่ง", "P-BLANKET-1"), sku("a2", "ผ้าห่ม · 150x200cm · ไม่เน้นตำแหน่ง", "P-BLANKET-2"), sku("b1", "ผ้าห่ม · 100x150cm · เน้นตำแหน่ง", "P-BLANKET-3")];
  const pb = P(
    [
      { label: "ตำแหน่งพิมพ์", choices: [{ name: "ไม่เน้นตำแหน่ง", stockLinks: [L("a1", "100x150cm"), L("a2", "150x200cm")] }, { name: "เน้นตำแหน่ง", stockLinks: [L("b1", "100x150cm")] }, { name: "ไม่ระบุ" }] },
      { label: "ขนาด", choices: [{ name: "100x150cm" }, { name: "150x200cm" }, { name: "200x230cm" }] },
    ],
    { id: "blanket-th", name: "ผ้าห่ม" }
  );
  const all = planChoiceCover(pb, bl, new Set());
  ok("ไม่ส่ง isNew (โหมดดู) = เติมทุกช่อง", all.length === 5);
  const onlyNewSize = planChoiceCover(pb, bl, new Set(), (i, c) => c === "200x230cm");
  ok("ขนาดใหม่ → คู่กับ 2 ค่าที่ร่วมตาราง ไม่ลาก 'ไม่ระบุ' มา", onlyNewSize.length === 2 && onlyNewSize.every((x) => x.pairChoice === "200x230cm" && x.choice !== "ไม่ระบุ"));
  ok("ช่องว่างเดิม (เน้นตำแหน่ง × 150x200) ไม่ถูกเติม", !onlyNewSize.some((x) => x.choice === "เน้นตำแหน่ง" && x.pairChoice === "150x200cm"));
  const onlyNewA = planChoiceCover(pb, bl, new Set(), (i, c) => c === "ไม่ระบุ");
  ok("ค่าใหม่กลุ่มแรก → คู่กับขนาดที่เคยนับ (2 ขนาด) ไม่รวมขนาดที่ไม่เคยนับ", onlyNewA.length === 2 && onlyNewA.every((x) => x.choice === "ไม่ระบุ" && x.pairChoice !== "200x230cm"));
}

console.log(fails.length ? `❌ ${fails.length} ไม่ผ่าน · ผ่าน ${pass}\n - ${fails.join("\n - ")}` : `✅ ผ่านทั้งหมด ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);

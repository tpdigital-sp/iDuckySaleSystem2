/**
 * 🏪📦 ทดสอบกติกา "ชุดรับพร้อมกัน" (ลูกค้ามารับเองทั้งสองใบ แพ็ครวมรับทีเดียว) — ไม่แตะฐาน ไม่ยิงไลน์
 * ต้นเหตุ 25 ก.ย. 69: OD-260919-1322 + OD-260924-5507 มารับเองทั้งคู่ → cannotBeMain ห้ามใบมารับเองเป็นใบหลัก = ผูกไม่ได้เลย
 * รัน: npm run check:ship-with
 */
const R = process.cwd();
const SW = await import(`${R}/src/lib/ship-with.ts`);
const { isPickupOrder } = await import(`${R}/src/lib/ship-label.ts`);
const N = await import(`${R}/src/lib/server/notify.ts`);

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, info = "") => (cond ? pass++ : fails.push(`${name}${info ? ` — ${info}` : ""}`));

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  customer: "ลูกค้าทดสอบ",
  phone: "0812345678",
  date: "2026-09-25",
  status: "กำลังผลิต",
  shipping: "มารับเอง",
  shippingLabel: "มารับเองที่ร้าน",
  shippingCost: 0,
  items: [{ name: "สินค้า", qty: 1, price: 100 }],
  total: 100,
  paidTotal: 100,
  ...extra,
});
// oxlint-disable-next-line no-explicit-any
type O = any;

// 1) มารับเองทั้งคู่ → ผูกได้ ใบที่เปิดอยู่เป็นใบหลัก
const a = base("OD-260919-1322") as O;
const b = base("OD-260924-5507") as O;
ok("ใบมารับเองเป็นใบหลักได้", SW.cannotBeMain(a) === "", SW.cannotBeMain(a));
ok("ใบมารับเองเป็นใบตามได้", SW.cannotBeRider(b) === "", SW.cannotBeRider(b));
const r1 = SW.pickShipRoles(a, b);
ok("เปิดใบ 1322 → 1322 เป็นใบหลัก", r1.main.id === a.id && r1.rider.id === b.id);

// 2) มารับเอง + ส่ง ปณ. → ใบส่ง ปณ. เป็นใบหลักเสมอ (ของเดิม)
const ems = base("OD-260925-0001", { shipping: "ems", shippingLabel: "EMS (50)", shippingCost: 50 }) as O;
ok("มารับเอง+EMS: EMS นำ", SW.pickShipRoles(a, ems).main.id === ems.id && SW.pickShipRoles(ems, a).main.id === ems.id);

// 3) มารับเองทั้งคู่ ใบหนึ่งแพ็คแล้วรอมารับ → ใบที่ยังไม่แพ็คเป็นใบหลัก (ไม่งั้นใบตามไม่มีทางกดแพ็คเสร็จ)
const packed = base("OD-260920-0002", { status: "จัดส่งแล้ว", packedAt: { at: "2026-09-24T03:00:00Z", by: "แพ็ค" } }) as O;
ok("ใบแพ็คแล้วเปิดอยู่ → อีกใบที่ยังไม่แพ็คเป็นใบหลัก", SW.pickShipRoles(packed, a).main.id === a.id);
ok("ใบแพ็คแล้วยังเป็นใบตามได้ (ของยังอยู่ในร้าน)", SW.cannotBeRider(packed) === "", SW.cannotBeRider(packed));
ok("ใบแพ็คแล้วรอมารับ ไม่ถูกคัดว่าออกจากร้าน", !SW.alreadyShipped(packed));
ok("ใบแพ็คแล้ว = ของพร้อม ไม่ตรวจซ้ำ", SW.riderNotReady(packed).length === 0, JSON.stringify(SW.riderNotReady(packed)));

// 4) ลูกค้ารับไปแล้ว → เป็นใบหลัก/ใบตามไม่ได้
const gone = base("OD-260910-0003", { status: "เสร็จสิ้น", pickedUp: { at: "2026-09-20T03:00:00Z", by: "แอดมิน" } }) as O;
ok("รับไปแล้ว เป็นใบหลักไม่ได้", !!SW.cannotBeMain(gone));
ok("รับไปแล้ว เป็นใบตามไม่ได้", !!SW.cannotBeRider(gone));
const goneOpen = base("OD-260910-0004", { status: "จัดส่งแล้ว", pickedUp: { at: "2026-09-20T03:00:00Z", by: "แอดมิน" } }) as O;
ok("รับไปแล้ว (สถานะยังไม่ปิด) เป็นใบหลักไม่ได้", SW.cannotBeMain(goneOpen).includes("รับของ"), SW.cannotBeMain(goneOpen));

// 5) ใบส่ง ปณ. ที่ยิงเลขแล้ว/จัดส่งแล้ว ยังเป็นใบหลักไม่ได้ (ของเดิมต้องไม่พัง)
ok("EMS ยิงเลขแล้ว เป็นใบหลักไม่ได้", !!SW.cannotBeMain({ ...ems, tracking: "EX1TH" }));
ok("EMS จัดส่งแล้ว (ไม่มีเลข) เป็นใบหลักไม่ได้", !!SW.cannotBeMain({ ...ems, status: "จัดส่งแล้ว" }));

// 6) ผูกแล้ว: ใบตามยังเป็น "มารับเอง" (ไม่หลุดเมนู/ปุ่มแพ็คเสร็จ) · ยอดไม่เปลี่ยน · ที่อยู่ไม่ถูกเติม
const { nextMain, nextRider } = SW.buildShipLink(a, b, "เทส", new Date().toISOString());
ok("ใบตามยังเป็นมารับเอง", isPickupOrder(nextRider), nextRider.shippingLabel);
ok("ทั้งชุดเป็นชุดรับพร้อมกัน", SW.isPickupShipSet(nextMain) && SW.isPickupShipSet(nextRider));
ok("ใบหลักชี้ใบตาม", SW.shipRiderIdsOf(nextMain).join() === b.id && SW.shipMainIdOf(nextRider) === a.id);
ok("ค่าส่งไม่แตะ", nextRider.shippingCost === 0 && nextMain.shippingCost === 0);
ok("log ใบตามพูดเรื่องรับพร้อมกัน ไม่ใช่กล่อง", /รับพร้อม/.test(JSON.stringify(nextRider.log ?? nextRider.logs ?? nextRider)) && !/ห้ามส่งแยก/.test(JSON.stringify(nextRider.log ?? nextRider.logs ?? nextRider)));
ok("ใบหลักรับใบตามเพิ่มได้อีก", SW.cannotBeMain(nextMain) === "", SW.cannotBeMain(nextMain));
ok("ใบตามผูกซ้ำไม่ได้", !!SW.cannotBeRider(nextRider) && !!SW.cannotBeMain(nextRider));

// ชุดส่ง ปณ. ของเดิม: ใบตามที่มารับเองต้องหลุดจากมารับเอง (เปลี่ยนไปส่ง ปณ.)
const emsLink = SW.buildShipLink(ems, base("OD-260925-0005") as O, "เทส", new Date().toISOString());
ok("ชุดส่ง ปณ.: ใบตามไม่ใช่มารับเองแล้ว", !isPickupOrder(emsLink.nextRider), emsLink.nextRider.shippingLabel);
ok("ชุดส่ง ปณ.: ไม่ใช่ชุดรับพร้อมกัน", !SW.isPickupShipSet(emsLink.nextMain));

// 7) ข้อความไลน์ตอนแพ็คเสร็จ (สถานะจัดส่งแล้ว ไม่มีเลข) บอกใบที่รับพร้อมกัน ไม่พูดถึงกล่อง/เลขพัสดุ
const packedMain = { ...nextMain, status: "จัดส่งแล้ว", packedAt: { at: "2026-09-25T03:00:00Z", by: "แพ็ค" } };
const packedRider = { ...nextRider, status: "จัดส่งแล้ว", packedAt: { at: "2026-09-25T03:00:00Z", by: "แพ็ค" } };
const mm = N.statusMessage(packedMain, "LINK") ?? "";
const rm = N.statusMessage(packedRider, "LINK") ?? "";
ok("ข้อความใบหลักบอกใบที่รวม + มารับ", mm.includes(b.id) && mm.includes("มารับ") && !mm.includes("กล่อง") && !mm.includes("เลขพัสดุ"), mm);
ok("ข้อความใบตามบอกใบหลัก + มารับ", rm.includes(a.id) && rm.includes("มารับ") && !rm.includes("กล่อง"), rm);
const fm = JSON.stringify(N.statusFlex(packedMain, "LINK"));
const fr = JSON.stringify(N.statusFlex(packedRider, "LINK"));
ok("flex ใบหลักมีแถว รับพร้อมกับ", fm.includes("รับพร้อมกับ") && fm.includes(b.id) && !fm.includes("รวมในกล่อง"));
ok("flex ใบตามมีแถว รับพร้อมกับ", fr.includes("รับพร้อมกับ") && fr.includes(a.id));

console.log(fails.length ? `❌ พลาด ${fails.length}/${pass + fails.length}:\n  ${fails.join("\n  ")}` : `✅ ผ่าน ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);

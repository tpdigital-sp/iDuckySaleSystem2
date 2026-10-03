/**
 * 🤖 ด่านกติกาผลอ่านสลิปด้วย AI (normalizeOcr ใน src/lib/server/slip-ocr.ts) — npm run check:slip-ocr
 * เคสจริงที่ต้องไม่ถอย: แถว KBANK ไม่มีเลขอ้างอิง AI หยิบเลขบัญชีผู้โอน 1241107724 มาเป็น ref (3 ต.ค. 69)
 */
const { normalizeOcr } = await import("../src/lib/server/slip-ocr");
let fail = 0;
const ok = (name: string, cond: boolean) => (cond ? console.log(`  ✓ ${name}`) : (fail++, console.log(`  ✗ ${name}`)));

const scb = normalizeOcr({ kind: "report", amount: 17655, date: "2026-09-21", ref: "17092601181274248344", payerAccount: "0384357909", receiverAccount: "0278753328" });
ok("SCB report: เก็บเลขอ้างอิง 20 หลัก", scb?.ref === "17092601181274248344");
const kb = normalizeOcr({ kind: "statement", amount: "1,883.20", date: "2026-09-29", ref: "1241107724", docRef: "qt 010774" });
ok("แถวรายการเดินบัญชี: ไม่เชื่อ ref", !kb?.ref);
ok("ยอดมีจุลภาค → 1883.2", kb?.amount === 1883.2);
ok("docRef ตัดช่องว่าง + ตัวใหญ่", kb?.docRef === "QT010774");
ok("เลข 10-12 หลัก (เลขบัญชี) ไม่ใช่ ref", !normalizeOcr({ kind: "slip", amount: 50, ref: "124110772400" })?.ref);
ok("ref ที่มีเลขบัญชีอยู่ข้างใน ไม่ใช่ ref", !normalizeOcr({ kind: "slip", amount: 50, ref: "00384357909000", payerAccount: "0384357909" })?.ref);
ok("เลขอ้างอิง KBank จาก QR (มีตัวอักษร) ผ่าน", normalizeOcr({ kind: "slip", amount: 50, ref: "016275120723BTF05920" })?.ref === "016275120723BTF05920");
ok("ปี พ.ศ. → ค.ศ.", normalizeOcr({ amount: 10, date: "2569-09-30" })?.date === "2026-09-30");
ok("เวลา 9:05 → 09:05", normalizeOcr({ amount: 10, date: "2026-09-30", time: "9:05" })?.time === "09:05");
ok("ยอดติดลบ/ศูนย์ ทิ้ง", normalizeOcr({ amount: 0, date: "2026-09-30" })?.amount === undefined);
ok("ไม่มีอะไรใช้ได้เลย → null", normalizeOcr({ kind: "other" }) === null);

const AT = "2026-09-26T08:00:00.000Z";
ok("K BIZ ปีสองหลักอ่านเป็น 2023 → ใช้ปีที่แนบ", normalizeOcr({ kind: "slip", amount: 720.3, date: "2023-09-26" }, AT, AT)?.date === "2026-09-26");
ok("วันที่ห่างวันแนบมาก (ก.ค.) → ทิ้ง", normalizeOcr({ kind: "report", amount: 18501.6, date: "2026-07-15" }, AT, AT)?.date === undefined);
ok("แนบต้นปี สลิปปลายปีก่อน → ใช้ปีก่อน", normalizeOcr({ kind: "slip", amount: 10, date: "2023-12-30" }, AT, "2027-01-02T03:00:00.000Z")?.date === "2026-12-30");
ok("เอกสารอื่น (ใบสำคัญจ่าย) ไม่เชื่อ ref", !normalizeOcr({ kind: "other", amount: 5296.5, ref: "DC290926164431" })?.ref);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ slip-ocr ผ่านครบ");
process.exit(fail ? 1 : 0);

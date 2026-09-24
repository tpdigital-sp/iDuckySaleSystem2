/**
 * 🏦 เทสด่าน "สลิปต้องโอนเข้าบัญชีร้าน" — npm run check:slip-receiver
 *
 * เคสต้นเรื่อง OD-260922-2240 (22 ก.ย. 69): ลูกค้าแนบสลิปที่โอนให้ หจก. เอดีมีเดีย (xxx-x-x8919-x · memo "มัดจำงาน ad media")
 * SlipOK ตอบว่าสลิปแท้ ยอด 1,300 ≥ 750 → ระบบผ่านให้อัตโนมัติ ยืนยันเงินเข้า ปริ้น แพ็ค ทั้งที่เงินไม่ได้เข้าร้าน
 * ข้อมูลผู้รับในเทสนี้ = คำตอบจริงของ SlipOK ที่ยิงซ้ำดู 24 ก.ย. 69 (ใบดี OD-260922-2820 · ใบผิด OD-260922-2240)
 */
import { maskedNumberMatches, matchSlipReceiver, receiverNameMatches, type ShopReceiverAccounts, type SlipReceiver } from "../src/lib/server/slipok";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

// บัญชีร้านจริง (แถว __shop_payment__ 24 ก.ย. 69)
const shop: ShopReceiverAccounts = { banks: [{ bank: "กสิกร", accountNo: "027-8-75332-8", accountName: "บจก.ทีพีดิจิตอล" }] };

// ── ทาบเลขปิดบางส่วน ──
eq("กสิกร xxx-x-x5332-x ↔ 027-8-75332-8", maskedNumberMatches("xxx-x-x5332-x", "027-8-75332-8"), true);
eq("บัญชีอื่น xxx-x-x8919-x ↔ 027-8-75332-8", maskedNumberMatches("xxx-x-x8919-x", "027-8-75332-8"), false);
eq("เลขเต็มตรงกัน", maskedNumberMatches("0278753328", "027-8-75332-8"), true);
eq("เลขเต็มต่างกัน 1 หลัก", maskedNumberMatches("0278753329", "027-8-75332-8"), false);
eq("ความยาวต่าง — ช่วงที่เห็นอยู่ในเลขจริง", maskedNumberMatches("xxxx75332x", "027-8-75332-8"), true);
eq("ความยาวต่าง — ช่วงที่เห็นไม่อยู่ในเลขจริง", maskedNumberMatches("xxxx89190x", "027-8-75332-8"), false);
eq("ความยาวต่าง — ช่วงสั้นเกิน (2 หลัก) ไม่นับ", maskedNumberMatches("xxxxxxxx32x", "027-8-75332-8"), false);
eq("ตัวปิดล้วน ไม่มีเลข", maskedNumberMatches("xxx-x-xxxxx-x", "027-8-75332-8"), false);
eq("พร้อมเพย์ 086xxx0000 ↔ 0861230000", maskedNumberMatches("086xxx0000", "086-123-0000"), true);
eq("พร้อมเพย์ 086xxx0000 ↔ 0891230000", maskedNumberMatches("086xxx0000", "0891230000"), false);
eq("ว่าง", maskedNumberMatches("", "027-8-75332-8"), false);
// รูปแบบจริงที่ SlipOK ตอบสำหรับบัญชีร้านเดียวกัน 027-8-75332-8 (อีกเซสชันยิง log=false ดู 24 ก.ย. 69) — ต้องผ่านทุกแบบ
eq("แบบ 2: XXXXX5332X (ตัวใหญ่ ไม่มีขีด)", maskedNumberMatches("XXXXX5332X", "027-8-75332-8"), true);
eq("แบบ 3: 027-8-xxx328 (เปิดหัว-ท้าย ปิดกลาง)", maskedNumberMatches("027-8-xxx328", "027-8-75332-8"), true);
eq("แบบ 3 แต่หัวไม่ตรง: 028-8-xxx328", maskedNumberMatches("028-8-xxx328", "027-8-75332-8"), false);
eq("พร้อมเพย์ xxx-xxx-1129 ↔ บัญชีธนาคารร้าน (คนละเลข)", maskedNumberMatches("xxx-xxx-1129", "027-8-75332-8"), false);

// ── ชื่อ (ทางสำรอง) ──
eq("ชื่อถูกตัดสั้น 'บจก. ท'", receiverNameMatches("บจก. ท", "บจก.ทีพีดิจิตอล"), true);
eq("ชื่อเต็มเว้นวรรคต่างกัน", receiverNameMatches("บจก. ทีพีดิจิตอล", "บจก.ทีพีดิจิตอล"), true);
eq("ชื่อคนอื่น", receiverNameMatches("หจก. เอดีมีเดีย เ", "บจก.ทีพีดิจิตอล"), false);
eq("ชื่อว่าง", receiverNameMatches("", "บจก.ทีพีดิจิตอล"), false);
eq("ชื่ออังกฤษ ltd", receiverNameMatches("TP DIGITAL CO., LTD.", "TP Digital Company Limited"), true);

// ── ตัดสินรวม (รูปแบบคำตอบจริงจาก SlipOK) ──
const good: SlipReceiver = { displayName: "บจก. ท", name: "TPDIGITAL C", proxy: { type: "", value: "" }, account: { type: "BANKAC", value: "xxx-x-x5332-x" } };
const bad: SlipReceiver = { displayName: "หจก. เอดีมีเดีย เ", name: "AD M", proxy: { type: "", value: "" }, account: { type: "BANKAC", value: "xxx-x-x8919-x" } };
eq("OD-260922-2820 โอนเข้าร้าน", matchSlipReceiver(good, shop), "match");
eq("OD-260922-2240 โอนให้ หจก. เอดีมีเดีย", matchSlipReceiver(bad, shop), "mismatch");
eq("ชื่อเหมือนแต่เลขบัญชีคนละบัญชี = เลขชนะ", matchSlipReceiver({ displayName: "บจก. ทีพีดิจิตอล", account: { value: "xxx-x-x8919-x" } }, shop), "mismatch");
eq("ไม่มีเลขบัญชี ตกไปเทียบชื่อ (ตรง)", matchSlipReceiver({ displayName: "บจก. ท", account: { value: "" } }, shop), "match");
eq("ไม่มีเลขบัญชี ตกไปเทียบชื่อ (ไม่ตรง)", matchSlipReceiver({ displayName: "หจก. เอดีมีเดีย เ" }, shop), "mismatch");
eq("SlipOK ไม่ส่งผู้รับมาเลย", matchSlipReceiver(undefined, shop), "noReceiver");
eq("ผู้รับว่างเปล่า", matchSlipReceiver({ displayName: "", account: { value: "" } }, shop), "noReceiver");
eq("ร้านยังไม่ตั้งบัญชี = ข้ามด่าน", matchSlipReceiver(bad, { banks: [] }), "unconfigured");
eq("ไม่ส่งตั้งค่ามา = ข้ามด่าน", matchSlipReceiver(bad, undefined), "unconfigured");
eq("อ่านตั้งค่าไม่ได้ = ตรวจมือ (ไม่ปล่อยผ่าน)", matchSlipReceiver(good, { unavailable: true }), "noReceiver");
eq("พร้อมเพย์ร้าน — โอนผ่าน proxy", matchSlipReceiver({ displayName: "บจก. ท", proxy: { type: "MSISDN", value: "086xxx0000" } }, { banks: [], promptpay: "0861230000" }), "match");
eq("พร้อมเพย์ร้าน — โอนเข้าเบอร์อื่น", matchSlipReceiver({ displayName: "บจก. ท", proxy: { type: "MSISDN", value: "089xxx0000" } }, { banks: [], promptpay: "0861230000" }), "mismatch");
eq("ร้านมี 2 บัญชี — ตรงบัญชีที่สอง", matchSlipReceiver(bad, { banks: [...shop.banks!, { bank: "กรุงไทย", accountNo: "123-4-58919-0", accountName: "บจก.ทีพีดิจิตอล" }] }), "match");
// OD-260922-6100 (22 ก.ย. 69): สลิป 50 บาทพร้อมเพย์ให้ "นาย ศุภชัย แ" — account ว่าง ตัวเลขอยู่ที่ proxy MSISDN · receivingBank "" · ระบบเดิมนับเป็น "รับบางส่วน 50"
eq("OD-260922-6100 พร้อมเพย์ให้คนอื่น (ร้านไม่มีพร้อมเพย์)", matchSlipReceiver({ displayName: "นาย ศุภชัย แ", name: "SUPACHAI K", proxy: { type: "MSISDN", value: "xxx-xxx-1129" }, account: { type: "", value: "" } }, shop), "mismatch");
eq("บัญชีร้านแบบ XXXXX5332X", matchSlipReceiver({ displayName: "บจก. ท", account: { type: "BANKAC", value: "XXXXX5332X" } }, shop), "match");
eq("บัญชีร้านแบบ 027-8-xxx328", matchSlipReceiver({ displayName: "บจก. ท", account: { type: "BANKAC", value: "027-8-xxx328" } }, shop), "match");
eq("บัญชีร้านที่กรอกไม่ครบ (สั้นกว่า 4 หลัก) ไม่นับเป็นตั้งค่า", matchSlipReceiver(bad, { banks: [{ accountNo: "12" }] }), "unconfigured");

console.log(`✅ ผ่าน ${pass} ข้อ`);
if (fails.length) {
  console.log(`❌ ไม่ผ่าน ${fails.length} ข้อ`);
  for (const f of fails) console.log(" -", f);
  process.exit(1);
}

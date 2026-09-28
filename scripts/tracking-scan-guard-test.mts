/**
 * 🧪 ด่านกัน "สแกน QR ใบงาน/ลิงก์ ลงช่องเลขพัสดุ" — npm run check:track-scan
 * เคสจริง 25 ก.ย. 69 OD-260921-3212 รอบแบ่งส่งรอบที่ 2 ได้ค่า https://iduckystore.com/admin/orders/OD-260921-3212?pack=1
 */
import { trackingScanProblem } from "../src/lib/scan-code";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => (cond ? pass++ : fails.push(name));

const BAD = [
  "https://iduckystore.com/admin/orders/OD-260921-3212?pack=1",
  "https://iduckystore.com/order/OD-260921-3212?key=abc",
  "iduckystore.com/admin/orders/OD-260921-3212",
  "OD-260921-3212",
  "od-260921-3212",
  "http://localhost:3000/admin/orders/OD-260921-3212",
];
const GOOD = ["EQ226634655TH", "eq226634655th", "  EB123456789TH  ", "RB123456789TH"];
// 📮 กฎเจ้าของร้าน 28 ก.ย. 69: ต้อง 13 หลัก ลงท้าย TH — ขนส่งอื่น/พิมพ์ขาด/เกิน ไม่รับ
const NOT_TH = ["TH01234567890A", "KEX12345678901", "J&T 800123456789", "EQ22663465TH", "EQ2266346555TH", "EQ226634655", "226634655TH", "E1226634655TH"];
for (const v of BAD) ok(`ต้องปฏิเสธ: ${v}`, trackingScanProblem(v) !== null);
for (const v of GOOD) ok(`ต้องผ่าน: ${v}`, trackingScanProblem(v) === null);
for (const v of NOT_TH) ok(`ไม่ใช่ 13 หลัก TH ต้องปฏิเสธ: ${v}`, (trackingScanProblem(v) ?? "").includes("13 หลัก"));
ok("ว่าง = ไม่ฟ้อง", trackingScanProblem("") === null);
ok("ข้อความบอกเลขออเดอร์", (trackingScanProblem(BAD[0]) ?? "").includes("OD-260921-3212"));

console.log(`✅ ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log(" ❌", f);
if (fails.length) process.exit(1);

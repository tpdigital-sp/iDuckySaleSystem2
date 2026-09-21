/**
 * 📞📍 เทสด่านเบอร์โทร/ที่อยู่จัดส่ง — npm run check:contact
 * เคสจริง 18 ก.ย. 69: ออเดอร์ชื่อ "Nunn" เบอร์ "0" ที่อยู่ว่าง ผ่านช่องบังคับเดิม (เช็คแค่ไม่ว่าง) → ส่งของไม่ได้
 */
import { addressProblem, cleanPhone, contactProblems, phoneProblem } from "../src/lib/contact-validate";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};
const ok = (name: string, got: string | null) => eq(name, got, null);
const bad = (name: string, got: string | null) => eq(name, got !== null, true);

// ── เบอร์โทร ──
ok("มือถือ 10 หลัก", phoneProblem("0933981155"));
ok("บ้าน 9 หลัก", phoneProblem("021234567"));
ok("พิมพ์มีขีดจริง → ล้างได้", phoneProblem("093-398-1155"));
ok("+66 → 0", phoneProblem("+66933981155"));
eq("cleanPhone +66", cleanPhone("+66 93 398 1155"), "0933981155");
eq("cleanPhone ขีด", cleanPhone("093-398-1155"), "0933981155");
bad("ว่าง", phoneProblem(""));
bad("เบอร์ 0 (เคสจริง)", phoneProblem("0"));
bad("ขีดอย่างเดียว", phoneProblem("-"));
bad("ดอกจัน", phoneProblem("***"));
bad("บวก", phoneProblem("+"));
bad("สั้นไป", phoneProblem("08123"));
bad("ยาวไป", phoneProblem("081234567890"));
bad("ไม่ขึ้น 0", phoneProblem("8123456789"));
bad("เลขซ้ำ", phoneProblem("0000000000"));
bad("เลขเรียง", phoneProblem("0123456789"));
bad("เลขเรียง 1-0", phoneProblem("1234567890"));

// ── ที่อยู่ ──
ok("ที่อยู่ไทยครบ", addressProblem("99/1 หมู่ 2 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"));
ok("ที่อยู่ย่อ ต./อ./จ.", addressProblem("12 ม.5 ต.บางรัก อ.เมือง จ.ตรัง 92000"));
ok("เลขที่มีขีดระหว่างเลข", addressProblem("99/1-2 ซ.ลาดพร้าว 5-7 แขวงจอมพล เขตจตุจักร กทม. 10900"));
ok("ขึ้นบรรทัดใหม่/เว้นวรรคเยอะ", addressProblem("  88  หมู่ 3\nต.ท่าศาลา  อ.ท่าศาลา\nจ.นครศรีธรรมราช 80160 "));
ok("อังกฤษ", addressProblem("123 Sukhumvit Rd, Khlong Toei, Bangkok 10110"));
bad("ว่าง (เคสจริง)", addressProblem(""));
bad("ขีด", addressProblem("-"));
bad("บวก", addressProblem("+"));
bad("ดอกจัน", addressProblem("*"));
bad("ขีดหลังคำ", addressProblem("ที่อยู่ -"));
bad("ดอกจันในที่อยู่", addressProblem("99 ถ.สุขุมวิท กรุงเทพฯ 10110 *"));
bad("ชื่อคน", addressProblem("Nunn"));
bad("แค่เบอร์โทร", addressProblem("0933981155"));
bad("ไม่มีรหัสไปรษณีย์", addressProblem("99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ"));
bad("ตัวเลขล้วน", addressProblem("99 123 456 10110"));
bad("สั้นเกิน", addressProblem("บ้าน 10110"));
bad("มารับเอง (ต้องมีที่อยู่อยู่ดี)", addressProblem("มารับเอง"));

// ── รวม ──
eq("contactProblems ผ่าน", contactProblems({ phone: "0933981155", address: "12 ม.5 ต.บางรัก อ.เมือง จ.ตรัง 92000" }), []);
eq("contactProblems เคสจริง Nunn", contactProblems({ phone: "0", address: "" }).length, 2);

console.log(`✅ ผ่าน ${pass} เคส`);
if (fails.length) {
  console.log(`❌ ไม่ผ่าน ${fails.length} เคส\n` + fails.map((f) => `• ${f}`).join("\n"));
  process.exit(1);
}

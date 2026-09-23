/**
 * 🔗 เทสการรวมการ์ดตอนผูกบัญชีสมาชิกเว็บ — npm run check:contact-link
 *
 * เคสจริง 23 ก.ย. 69: ลูกค้าเก่าล็อกอิน LINE ครั้งแรก ระบบสร้างบัญชี + การ์ดใหม่เปล่า ๆ
 * ให้ → ระดับสมาชิกเริ่มนับหนึ่งใหม่ ทั้งที่แต้มเดิมอยู่ในการ์ดใบเก่า
 * กติกาที่ห้ามพลาดตอนยุบรวม: แต้มต้องบวกกัน · ของเดิมในใบเก่าห้ามถูกทับ · ระดับต้องยึดใบเก่า
 */
import { mergeMemberIntoContact, type Contact, type MemberAccount } from "../src/lib/contacts";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const NOW = "2026-09-23T04:00:00.000Z";
const opts = { by: "แอดมินทดสอบ", now: NOW };

/** การ์ดเดิมของลูกค้า — มาจากระบบเดิม มีแต้ม ระดับทอง และเคยสั่งแบบไม่ล็อกอิน 3 ใบ */
const old = (): Contact => ({
  id: "12345",
  name: "คุณจินอิน",
  phone: "0933981155",
  address: "99/1 ถ.สุขุมวิท กรุงเทพฯ 10110",
  point: 62000,
  pointActive: true,
  origins: ["legacy", "guest-order"],
  tierLevel: "gold",
  tierAnchor: "2026-01-05T00:00:00.000Z",
  tierCycleSpend: 18000,
  orders: { count: 3, firstAt: "2026-02-01T00:00:00.000Z", lastAt: "2026-08-01T00:00:00.000Z", lastId: "OD-260801-1111" },
  note: "ชอบสั่งสติกเกอร์ไดคัท",
});

/** การ์ดที่ระบบซิงก์สร้างให้ตอนสมัคร LINE — เปล่า ๆ ยังไม่มีเบอร์ */
const fresh = (): Contact => ({
  id: "28900",
  name: "ginin(´▾`)",
  phone: "",
  address: "",
  point: 0,
  origins: ["member"],
  memberId: "uuid-line-1",
  channel: "line",
  memberSince: "2026-09-23T03:00:00.000Z",
});

const lineAcc: MemberAccount = { id: "uuid-line-1", name: "ginin(´▾`)", email: "", picture: "https://line/pic.jpg", channel: "line", createdAt: "2026-09-23T03:00:00.000Z" };

// ── เคสหลัก: การ์ดเปล่าจากการสมัคร LINE ยุบเข้าการ์ดเดิม ──
{
  const r = mergeMemberIntoContact(old(), [fresh()], lineAcc, opts);
  eq("ผูก memberId เข้าใบเดิม", r.memberId, "uuid-line-1");
  eq("ช่องทางเป็น LINE", r.channel, "line");
  eq("ชื่อเดิมไม่ถูกทับด้วยชื่อ LINE", r.name, "คุณจินอิน");
  eq("เบอร์เดิมอยู่ครบ", r.phone, "0933981155");
  eq("แต้มเดิมอยู่ครบ", r.point, 62000);
  eq("ระดับยึดของใบเดิม", [r.tierLevel, r.tierCycleSpend], ["gold", 18000]);
  eq("สถิติออเดอร์เดิมไม่หาย", r.orders?.count, 3);
  eq("ที่มารวมกัน", r.origins, ["legacy", "guest-order", "member"]);
  eq("รูปโปรไฟล์ LINE ติดมาด้วย", r.picture, "https://line/pic.jpg");
  eq("ประทับคนแก้", [r.updatedAt, r.updatedBy], [NOW, "แอดมินทดสอบ"]);
}

// ── การ์ดใหม่ดันมีแต้ม/ออเดอร์ของตัวเอง (ลูกค้าสั่งไปแล้ว 1 ใบหลังสมัคร) → ต้องบวกรวม ไม่ใช่ทิ้ง ──
{
  const f: Contact = {
    ...fresh(),
    point: 1250.5,
    pointActive: true,
    orders: { count: 1, firstAt: "2026-09-23T03:30:00.000Z", lastAt: "2026-09-23T03:30:00.000Z", lastId: "OD-260923-9999" },
  };
  const r = mergeMemberIntoContact(old(), [f], lineAcc, opts);
  eq("แต้มบวกรวม", r.point, 63250.5);
  eq("จำนวนออเดอร์รวมกัน", r.orders?.count, 4);
  eq("ใบล่าสุดเป็นของใหม่กว่า", r.orders?.lastId, "OD-260923-9999");
  eq("ใบแรกสุดยังเป็นของเดิม", r.orders?.firstAt, "2026-02-01T00:00:00.000Z");
}

// ── การ์ดเดิมยังไม่มีเบอร์/ที่อยู่/ชื่อ → เติมจากใบใหม่ได้ (เติมเฉพาะช่องว่าง) ──
{
  const blank: Contact = { id: "777", name: "", phone: "", address: "", point: 500, origins: ["legacy"] };
  const f: Contact = { ...fresh(), phone: "0811112222", address: "12 ม.5 ต.บางรัก", email: "ginin@example.com" };
  const r = mergeMemberIntoContact(blank, [f], lineAcc, opts);
  eq("ชื่อว่าง → ใช้ชื่อจากใบใหม่", r.name, "ginin(´▾`)");
  eq("เบอร์ว่าง → เติมจากใบใหม่", r.phone, "0811112222");
  eq("ที่อยู่ว่าง → เติมจากใบใหม่", r.address, "12 ม.5 ต.บางรัก");
  eq("อีเมลว่าง → เติมจากใบใหม่", r.email, "ginin@example.com");
}

// ── ใบเดิมยังไม่เคยซีดระดับ แต่ใบใหม่มี → ใช้ของใบใหม่ไปก่อน ──
{
  const noTier: Contact = { id: "777", name: "ก", phone: "0811112222", address: "", point: 500, origins: ["legacy"] };
  const f: Contact = { ...fresh(), tierLevel: "silver", tierAnchor: "2026-09-01T00:00:00.000Z", tierCycleSpend: 300 };
  const r = mergeMemberIntoContact(noTier, [f], lineAcc, opts);
  eq("รับระดับจากใบใหม่เมื่อใบเดิมยังไม่มี", [r.tierLevel, r.tierCycleSpend], ["silver", 300]);
}

// ── บัญชีอีเมล (ไม่ใช่ LINE) + ใบเดิมผูกบัญชีอื่นอยู่ → ทับด้วยบัญชีใหม่ ──
{
  const bound: Contact = { ...old(), memberId: "uuid-เก่า", channel: "line" };
  const mail: MemberAccount = { id: "uuid-mail-9", name: "Jin", email: "jin@example.com", channel: "email", createdAt: "2026-05-05T00:00:00.000Z" };
  const r = mergeMemberIntoContact(bound, [], mail, opts);
  eq("บัญชีเดิมถูกแทนที่", r.memberId, "uuid-mail-9");
  eq("ช่องทางเปลี่ยนเป็นอีเมล", r.channel, "email");
  eq("ไม่มีใบให้ยุบ แต้มไม่เปลี่ยน", r.point, 62000);
}

// ── กันเผลอส่งการ์ดใบเดียวกันมาเป็น source (ต้องไม่บวกแต้มตัวเอง) ──
{
  const self = old();
  const r = mergeMemberIntoContact(self, [{ ...self }], lineAcc, opts);
  eq("ยุบตัวเองไม่ได้", r.point, 62000);
}

// ── โน้ตของใบใหม่ต่อท้าย ไม่ทับของเดิม และไม่ซ้ำ ──
{
  const f: Contact = { ...fresh(), note: "ทักมาทางไลน์ 23 ก.ย." };
  const r = mergeMemberIntoContact(old(), [f], lineAcc, opts);
  eq("โน้ตต่อท้าย", r.note, "ชอบสั่งสติกเกอร์ไดคัท\nทักมาทางไลน์ 23 ก.ย.");
  const again = mergeMemberIntoContact(r, [f], lineAcc, opts);
  eq("รวมซ้ำไม่ต่อโน้ตซ้ำ", again.note, "ชอบสั่งสติกเกอร์ไดคัท\nทักมาทางไลน์ 23 ก.ย.");
}

console.log(`\n🔗 เทสผูกบัญชีสมาชิกกับการ์ดเดิม — ผ่าน ${pass} ข้อ`);
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ:\n - ${fails.join("\n - ")}\n`);
  process.exit(1);
}
console.log("✅ ผ่านหมด\n");

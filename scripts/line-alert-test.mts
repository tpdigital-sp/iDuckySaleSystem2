/**
 * 🧪 npm run check:alert — ตรวจ "ลำดับการส่งแจ้งเตือนร้าน" ว่าถอยไปทางสำรองถูกไหม
 *
 * ทำไมต้องมี: 24 ก.ย. 69 ไลน์ไม่เข้ากลุ่มแอดมินทั้งวัน ต้นเหตุคือบัญชีแจ้งเตือน (แพ็กเกจฟรี 300 ข้อความ/เดือน)
 * โควตาหมด — การ์ด 1 ใบเข้ากลุ่มตัดโควตาเท่าจำนวนคนในกลุ่ม (8 คน) = ส่งได้เดือนละ ~37 ใบเท่านั้น
 * LINE ตอบ 429 แล้วทุกการ์ดหายเงียบ เพราะไม่มีทางสำรองและไม่มีใครดูค่าที่ตัวส่งคืนมา
 *
 * เทสนี้ไม่แตะฐานข้อมูลและไม่ยิงข้อความจริง — ตรวจแค่ planOf() ว่าจัดลำดับตามกติกา
 */
import { planOf, sealToken, type LineAlertDoc } from "@/lib/server/line-alert";

let bad = 0;
function check(name: string, got: string, want: string) {
  if (got === want) console.log(`  ✅ ${name}`);
  else {
    bad++;
    console.log(`  ❌ ${name}\n     ได้ ${got}\n     ควรได้ ${want}`);
  }
}
const plan = (doc: LineAlertDoc, money = false) =>
  planOf(doc, money)
    .map((a) => `${a.via}:${a.to}`)
    .join(" → ") || "(ไม่มีทางส่ง)";

if (!process.env.ADMIN_SESSION_SECRET) {
  console.log("⚠️ ไม่มี ADMIN_SESSION_SECRET — ข้ามเทส (รันด้วย tsx --env-file=.env.local)");
  process.exit(0);
}
process.env.LINE_MESSAGING_ACCESS_TOKEN = "shop-token";
process.env.LINE_STOCK_ALERT_TO = "Ushop-general";
process.env.LINE_ADMIN_ALERT_TO = "Ushop-money";

const enc = sealToken("alert-token")!;
const ready: LineAlertDoc = { enc, to: "Cgroup-general", adminTo: "Cgroup-money" };

console.log("🧪 ลำดับการส่งแจ้งเตือนร้าน");
check("ปกติ: บัญชีแจ้งเตือนก่อน แล้วค่อยบัญชีร้าน", plan(ready), "alert:Cgroup-general → shop:Ushop-general");
check("เรื่องเงิน: ใช้ห้องเรื่องเงินทั้งสองชั้น", plan(ready, true), "alert:Cgroup-money → shop:Ushop-money");
check(
  "โควตาเพิ่งหมด (ไม่ถึง 6 ชม.): ข้ามบัญชีแจ้งเตือนไปใช้ทางสำรองเลย",
  plan({ ...ready, outAt: new Date().toISOString() }),
  "shop:Ushop-general",
);
check(
  "โควตาหมดเมื่อวาน: กลับมาลองบัญชีแจ้งเตือนใหม่ (เผื่อขึ้นเดือน/อัปเกรดแล้ว)",
  plan({ ...ready, outAt: new Date(Date.now() - 26 * 3_600_000).toISOString() }),
  "alert:Cgroup-general → shop:Ushop-general",
);
check("ตั้งปลายทางสำรองเองในหน้าแอดมิน: ใช้ค่านั้นแทน env", plan({ ...ready, shopTo: "Cshop-group" }), "alert:Cgroup-general → shop:Cshop-group");

process.env.LINE_STOCK_ALERT_TO = "";
process.env.LINE_ADMIN_ALERT_TO = "";
check("ไม่มีทางสำรองเลย: ยังต้องลองบัญชีแจ้งเตือนอยู่ดี", plan({ ...ready, outAt: new Date().toISOString() }), "alert:Cgroup-general");
check("ยังไม่ได้ตั้งอะไรเลย: ไม่มีทางส่ง (ต้องขึ้นรายการที่ส่งไม่ออก)", plan({}), "(ไม่มีทางส่ง)");

console.log(bad ? `\n❌ ไม่ผ่าน ${bad} ข้อ` : "\n✅ ผ่านครบ");
process.exit(bad ? 1 : 0);

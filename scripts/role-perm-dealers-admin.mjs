/**
 * 🤝 เปิดสิทธิ์ "ตัวแทนจำหน่าย" (dealers.manage) ให้แผนกแอดมิน
 * เจ้าของร้านสั่ง 15 ก.ย. 69: ให้พนักงานแอดมินเห็นเมนูตัวแทนและกดอนุมัติใบสมัครได้เอง
 * ไม่ต้องรอเจ้าของร้านคนเดียว (ค่าเริ่มต้นในโค้ดมีสิทธิ์นี้อยู่แล้ว แต่แถว __role_perms__ ในฐานทับไว้)
 * ทำงานแบบ read-modify-write บนแถวจริง · รันซ้ำได้ · --dry = แค่โชว์ไม่เขียน
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "__role_perms__";
const ROLE = "แอดมิน";
const PERM = "dealers.manage";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error) die(error.message);
if (!row) die("ยังไม่มีแถว " + ID + " (ยังไม่เคยแก้บทบาทในหน้าตั้งค่า → ใช้ค่าเริ่มต้นในโค้ดซึ่งมีสิทธิ์นี้อยู่แล้ว)");

const data = row.data ?? {};
const roles = data.roles ?? {};
const perms = Array.isArray(roles[ROLE]) ? roles[ROLE] : null;
if (!perms) die(`ไม่พบบทบาท "${ROLE}" ในแถว ${ID} — มีแต่: ${Object.keys(roles).join(", ")}`);
if (perms.includes(PERM)) { console.log(`✓ "${ROLE}" มี ${PERM} อยู่แล้ว ไม่ต้องเขียน`); process.exit(0); }

const next = { ...data, roles: { ...roles, [ROLE]: [...perms, PERM] } };
console.log(`${ROLE}: +${PERM} → ${next.roles[ROLE].length} สิทธิ์`);
if (DRY) { console.log("(dry) ไม่เขียน"); process.exit(0); }

const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ บันทึกแล้ว — พนักงานแอดมินต้องล็อกอินใหม่/รีเฟรชหน้าถึงจะเห็นเมนู");

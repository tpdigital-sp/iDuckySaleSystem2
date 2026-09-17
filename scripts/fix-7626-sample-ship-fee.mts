/**
 * 🩹 ซ่อม OD-260914-7626 (QT010635) — ค้าง "รอชำระเงิน" หลังลองบวกค่าส่งตัวอย่าง ฿50 เข้าช่องค่าจัดส่งแล้วแก้กลับ (17 ก.ย. 69)
 *
 * เรื่องเดิม: ลูกค้าโอนค่าส่งตัวอย่าง ฿50 แยกมา → zz:s เปิดใบแยก OD-260917-2152 (SlipOK ผ่าน ฿50) ถูกแล้ว
 * แต่ 14:20 มีการแก้ค่าส่งใบหลัก 100 → 150 (ฐานภาษีขยับ: VAT 777 → 780.50 · หัก ณ ที่จ่าย 333 → 334.50 · รวม 11,930.50 ไม่ตรงบิล)
 * แล้วแก้กลับ 100 — ตัวเลขภาษีกลับมาตรงบิลแล้ว แต่ค้าง 3 อย่าง:
 *   1) สถานะ "รอชำระเงิน" (เดิม "อนุมัติแบบ" + ส่งเข้าผลิตแล้ว)   2) paidTotal 11,930.50 (ยอดบิลจริง 11,877)
 *   3) สลิปใบเพิ่มที่ตรวจตก — ไฟล์เดียวกับสลิป ฿50 ของ OD-260917-2152
 * ซ่อมเงียบ ๆ ไม่ยิงไลน์ · เงิน ฿50 อยู่ที่ใบแยกตามเดิม · โยงสองใบด้วยหมายเหตุท้ายบิล
 *
 * รัน: npx tsx --tsconfig tsconfig.json scripts/fix-7626-sample-ship-fee.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { flowAccountGap, orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const MAIN = "OD-260914-7626";
const FEE = "OD-260917-2152";
const BAD_PAYMENT = "pmu57aircbykq";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const read = async (id: string) => {
  const { data, error } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  if (error || !data) throw new Error(`อ่าน ${id} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
  return data.data as Order;
};
const addNote = (o: Order, text: string): Order =>
  (o.billNote ?? "").includes(text) ? o : { ...o, billNote: `${o.billNote ?? ""}<div>${text}</div>` };

const main = await read(MAIN);
const fee = await read(FEE);
mkdirSync("backups", { recursive: true });
for (const o of [main, fee]) writeFileSync(`backups/${o.id}-before-sample-ship-fee-fix.json`, JSON.stringify(o, null, 1));

// ── ใบหลัก ──
const bill = orderTotal(main);
console.log(`${MAIN} ก่อนแก้ : ${main.status} · ยอดบิล ${bill} · paidTotal ${main.paidTotal} · gap ${flowAccountGap(main)} · สลิปใบเพิ่ม ${(main.payments ?? []).length}`);
if (flowAccountGap(main) !== 0) throw new Error("ยอดในระบบยังไม่ตรงใบ FlowAccount — หยุด ไม่ซ่อมทับ");
if (main.status !== "รอชำระเงิน" || main.reopenedFrom !== "อนุมัติแบบ") throw new Error("สถานะไม่ใช่แบบที่คาดไว้ (อาจมีคนซ่อมไปแล้ว) — หยุด");
const bad = (main.payments ?? []).find((p) => p.id === BAD_PAYMENT);
if (bad && (bad.credited || bad.accepted)) throw new Error("สลิปใบเพิ่มถูกนับยอดไปแล้ว — หยุด");
const rest = (main.payments ?? []).filter((p) => p.id !== BAD_PAYMENT);

let nextMain: Order = { ...main, status: "อนุมัติแบบ", reopenedFrom: undefined, paidTotal: bill, payments: rest.length ? rest : undefined };
nextMain = addNote(nextMain, `📦 ค่าส่งตัวอย่าง ฿50 ลูกค้าโอนแยก — อยู่ที่ใบ ${FEE} (ไม่รวมในบิล QT010635)`);
nextMain = withLog(nextMain, BY, "🩹 ซ่อมใบหลังลองบวกค่าส่งตัวอย่าง ฿50", `สถานะ รอชำระเงิน → อนุมัติแบบ · ยอดชำระ ${main.paidTotal} → ${bill} (ตรงบิล QT010635 · หัก ณ ที่จ่าย 333 คงเดิม) · ถอดสลิปใบเพิ่มที่ตรวจตก (ไฟล์เดียวกับสลิป ฿50 ของ ${FEE}) · ค่าส่งตัวอย่างเก็บที่ใบ ${FEE} — ไม่แจ้งไลน์`);
console.log(`${MAIN} หลังแก้ : ${nextMain.status} · paidTotal ${nextMain.paidTotal} · สลิปใบเพิ่ม ${(nextMain.payments ?? []).length}`);

// ── ใบค่าส่งตัวอย่าง ──
let nextFee = addNote(fee, `📦 ค่าส่งตัวอย่าง 3 ชิ้น ของ ${MAIN} (QT010635) — ไม่มีงานผลิตในใบนี้ แพ็คไปกับตัวอย่างของใบหลัก`);
const feeChanged = nextFee !== fee;
if (feeChanged) nextFee = withLog(nextFee, BY, "โยงใบค่าส่งตัวอย่างกับใบหลัก", `ค่าส่งตัวอย่างของ ${MAIN}`);
console.log(`${FEE} : ${fee.status} · ยอด ${orderTotal(fee)} · ${feeChanged ? "เพิ่มหมายเหตุโยงใบหลัก" : "มีหมายเหตุแล้ว"}`);

if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
const r1 = await updateOrder(sb, nextMain, { prev: main, by: BY });
if (r1.error) throw new Error(r1.error.message);
if (feeChanged) {
  const r2 = await updateOrder(sb, nextFee, { prev: fee, by: BY });
  if (r2.error) throw new Error(r2.error.message);
}
console.log("✅ บันทึกแล้ว");

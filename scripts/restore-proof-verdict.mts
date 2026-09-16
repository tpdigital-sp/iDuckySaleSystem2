/**
 * 🧑‍⚖️ ซ่อมผลตรวจแบบของลูกค้าที่หน้าจอค้างทับหาย (ก่อนมีด่าน keepCustomerVerdict · 16 ก.ย. 69 · OD-260915-5892)
 *   node --conditions=react-server --import tsx scripts/restore-proof-verdict.mts --scan          → ไล่ทุกใบ หาใบที่ log บอกว่าลูกค้าตัดสินแล้วแต่รายการไม่ตรง
 *   node --conditions=react-server --import tsx scripts/restore-proof-verdict.mts OD-xxx [--apply] → ซ่อมใบเดียว (ไม่มี --apply = dry-run)
 *
 * แหล่งความจริง = log รายการ "อนุมัติแบบ"/"ขอแก้ไขแบบ" โดย "ลูกค้า" (detail ขึ้นต้นด้วยชื่อรายการ) ซึ่งเซิร์ฟเวอร์เขียนเองตอนลูกค้ากด
 * ซ่อมเฉพาะรายการที่ "ไม่มีรูปใหม่อัปหลังจากลูกค้าตัดสิน" (ถ้ามี รอตรวจรอบใหม่ถูกแล้ว) และไม่มีคำตัดสินใหม่กว่าใน log
 * เขียนผ่าน updateOrder (ประตูเขียนออเดอร์) พร้อม log · ไม่แตะสถานะออเดอร์ (ที่หน้าออเดอร์ยังถูกอยู่แล้ว)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { proofsOf, withLog, type Order, type OrderItem } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

type Verdict = { status: "อนุมัติ" | "ขอแก้ไข"; at: string; note?: string; whole: boolean; proofIndex?: number };

/** คำตัดสินล่าสุดของลูกค้าต่อรายการ จาก log (เหมาทั้งรายการ หรือ "รูปที่ n/m") */
function lastVerdict(o: Order, it: OrderItem): Verdict | null {
  let v: Verdict | null = null;
  for (const l of o.log ?? []) {
    if (l.by !== "ลูกค้า" || (l.action !== "อนุมัติแบบ" && l.action !== "ขอแก้ไขแบบ")) continue;
    const d = String(l.detail ?? "");
    if (!d.startsWith(it.name)) continue;
    const rest = d.slice(it.name.length);
    const per = rest.match(/^ รูปที่ (\d+)\/\d+/);
    const note = l.action === "ขอแก้ไขแบบ" ? rest.replace(/^ รูปที่ \d+\/\d+/, "").replace(/^ — /, "") : undefined;
    v = { status: l.action === "อนุมัติแบบ" ? "อนุมัติ" : "ขอแก้ไข", at: l.at, note, whole: !per, proofIndex: per ? Number(per[1]) - 1 : undefined };
  }
  return v;
}

/** รายการนี้ผลในฐานไม่ตรงกับคำตัดสินล่าสุดของลูกค้า และไม่มีรูปใหม่หลังจากนั้น → ซ่อมได้ */
function planItem(o: Order, it: OrderItem): { verdict: Verdict; next: OrderItem } | null {
  const v = lastVerdict(o, it);
  if (!v) return null;
  const proofs = proofsOf(it);
  if (!proofs.length) return null;
  if (proofs.some((p) => p.at > v.at)) return null; // ส่งแบบรอบใหม่หลังลูกค้าตัดสิน — "รอตรวจ" ถูกแล้ว
  if (it.proofStatus === v.status) return null;
  const fixed = proofs.map((p, j) =>
    v.whole || j === v.proofIndex
      ? v.status === "อนุมัติ"
        ? { ...p, review: "อนุมัติ" as const, reviewNote: undefined, reviewAt: v.at }
        : { ...p, review: "ขอแก้ไข" as const, reviewNote: v.note, reviewAt: v.at }
      : p
  );
  const anyEdit = fixed.some((p) => p.review === "ขอแก้ไข");
  const allOk = fixed.every((p) => p.review === "อนุมัติ");
  const status = anyEdit ? "ขอแก้ไข" : allOk ? "อนุมัติ" : "รอตรวจ";
  if (status === it.proofStatus) return null;
  const editNotes = fixed.map((p, j) => (p.review === "ขอแก้ไข" && p.reviewNote ? `รูปที่ ${j + 1}: ${p.reviewNote}` : "")).filter(Boolean).join(" · ");
  return { verdict: v, next: { ...it, proofs: fixed, proofStatus: status, proofNote: anyEdit ? editNotes || v.note : undefined, proofReviewedAt: v.at } };
}

function plan(o: Order) {
  return o.items.map((it, i) => ({ i, it, p: planItem(o, it) })).filter((x) => x.p);
}

const [arg, flag] = process.argv.slice(2);
if (!arg) throw new Error("ระบุ --scan หรือเลขออเดอร์");

if (arg === "--scan") {
  const { data, error } = await sb.from("orders").select("id,data").order("id", { ascending: false });
  if (error) throw new Error(error.message);
  let n = 0;
  for (const row of data ?? []) {
    const o = row.data as Order;
    const hits = plan(o);
    if (!hits.length) continue;
    n++;
    console.log(`${o.id} · ${o.status}`);
    for (const h of hits) console.log(`   [${h.i}] ${h.it.name} · ฐาน=${h.it.proofStatus ?? "-"} → ลูกค้า ${h.p!.verdict.status} เมื่อ ${h.p!.verdict.at}`);
  }
  console.log(n ? `\nพบ ${n} ใบ — ซ่อมทีละใบด้วย OD-xxx --apply` : "✅ ไม่พบใบที่ผลตรวจหลุด");
  process.exit(0);
}

const { data } = await sb.from("orders").select("data").eq("id", arg).maybeSingle();
const o = data?.data as Order | undefined;
if (!o) throw new Error("ไม่พบออเดอร์");
const hits = plan(o);
if (!hits.length) {
  console.log("ไม่มีรายการที่ต้องซ่อม");
  process.exit(0);
}
for (const h of hits) console.log(`[${h.i}] ${h.it.name} · ฐาน=${h.it.proofStatus ?? "-"} → ${h.p!.verdict.status} (ลูกค้ากดเมื่อ ${h.p!.verdict.at})`);
if (flag !== "--apply") {
  console.log("(dry-run — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}
const items = o.items.map((it, i) => hits.find((h) => h.i === i)?.p!.next ?? it);
const next = withLog(
  { ...o, items },
  "ระบบ",
  "🧑‍⚖️ คืนผลตรวจแบบของลูกค้าที่หน้าจอค้างทับหาย",
  hits.map((h) => `${h.it.name} → ${h.p!.verdict.status} (ลูกค้ากดเมื่อ ${h.p!.verdict.at})`).join(" · ")
);
const { error } = await updateOrder(sb, next);
if (error) throw new Error(error.message);
console.log("✅ เขียนแล้ว");

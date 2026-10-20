/**
 * 🏪↩ เปิดใบมารับเองที่แบ่งส่ง แต่ถูกกด "แพ็คเสร็จ — รอลูกค้ามารับ" (= รอบสุดท้าย ปิดทั้งใบ) ทั้งที่ลูกค้ารับไปแค่รอบก่อน
 * เคส 20 ต.ค. 69: OD-261007-2540 (ซ่อมด้วย fix-2540-pickup-round2-reopen.mts) · OD-261016-5502 (รับงานตัวอย่างรอบ 1 แล้วกดปิดทั้งใบ)
 *
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/pickup-round-reopen.mts OD-xxx [--reset-counts] [--apply]
 *
 * ถอด packedAt + pickedUp · สถานะ → กำลังผลิต · รอบแบ่งส่งเดิมคงไว้ · ไม่ส่งไลน์ · ไม่แตะเงิน · สำรองก่อนเขียน
 * --reset-counts: ล้างผลตรวจนับ (pack) ทุกรูป + สถานะของมา (arrival) ที่กดหลังรอบล่าสุด — ใช้เมื่อกดนับ "ครบ" เพื่อให้ผ่านด่าน ทั้งที่ของยังไม่มา
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { isPartiallyShipped, proofShipStates, withLog, type Order } from "../src/lib/admin-data";
import { isPickupOrder } from "../src/lib/ship-label";
import { updateOrder } from "../src/lib/server/order-write";

const ID = process.argv.find((a) => a.startsWith("OD-"));
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset-counts");
const BY = "ระบบ (แก้ย้อนหลัง)";
if (!ID) throw new Error("ระบุเลข OD-…");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const o = data.data as Order;
if (!isPickupOrder(o) || !(o.shipments?.length) || !o.packedAt || (o.tracking ?? "").trim()) {
  console.log("ไม่ใช่ใบมารับเองที่มีรอบแบ่งส่งและถูกกดแพ็คเสร็จ — ไม่ทำอะไร", { status: o.status, packedAt: o.packedAt, rounds: o.shipments?.length });
  process.exit(0);
}
let left = 0;
proofShipStates(o).forEach((s) => (left += s.remaining));
const lastAt = Math.max(...o.shipments.map((s) => Date.parse(s.at) || 0));
const { packedAt, pickedUp, ...rest } = o;
let next = { ...rest, status: "กำลังผลิต" } as Order;
const resetNote: string[] = [];
if (RESET) {
  next = {
    ...next,
    items: next.items.map((it) => {
      const arrivalLate = it.arrival && (Date.parse(it.arrival.at) || 0) > lastAt;
      if (arrivalLate) resetNote.push(`${it.name}: ล้างสถานะของมา (${it.arrival!.status})`);
      return {
        ...it,
        ...(arrivalLate ? { arrival: undefined } : {}),
        proofs: it.proofs?.map((p, j) => {
          if (!p.pack) return p;
          resetNote.push(`${it.name} รูปที่ ${j + 1}: ล้างผลตรวจนับ (${p.pack.status} · ${p.pack.by})`);
          const { pack: _p, ...pr } = p;
          void _p;
          return pr;
        }),
      };
    }),
  } as Order;
}
next = withLog(
  next,
  BY,
  `🏪↩ เปิดใบกลับ — รอบที่ ${o.shipments.length + 1} (รอบสุดท้าย) ยังไม่ได้แพ็ค`,
  `กด “แพ็คเสร็จ — รอลูกค้ามารับ” (${packedAt.by} ${packedAt.at})${pickedUp ? ` + “ลูกค้ามารับของแล้ว” (${pickedUp.by})` : ""} หลังแพ็คเสร็จบางส่วน ${o.shipments.length} รอบ — ลูกค้ารับไปแค่รอบก่อน · ของที่เหลือ ${left} ชิ้นยังไม่ได้ไป → ถอดแพ็คเสร็จ/รับของแล้ว · ${o.status} → กำลังผลิต${resetNote.length ? ` · ${resetNote.join(" · ")}` : ""}`
);
console.log(`${ID} · ${o.status} → ${next.status} · ค้าง ${left} ชิ้น · isPartiallyShipped ${isPartiallyShipped(o)} → ${isPartiallyShipped(next)}`);
resetNote.forEach((n) => console.log("  ", n));
if (!APPLY) {
  console.log("(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-pickup-round-reopen.json`, JSON.stringify(o, null, 1));
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");

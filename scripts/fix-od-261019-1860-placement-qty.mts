/**
 * 🔢 ซ่อมรายการที่ 4 (โปสการ์ด 5×7 · 2 ลาย) ของ OD-261019-1860 — สเปคตำแหน่งลายค้าง 30/30 ขัดกับจำนวนที่ลูกค้าระบุ 100/100 ชิ้น
 *
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-od-261019-1860-placement-qty.mts           (ดูเฉย ๆ)
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-od-261019-1860-placement-qty.mts --apply
 *
 * ต้นเหตุ (19 ต.ค. 69): รูปต้นฉบับอัปไม่ขึ้นตอนออกแบบ → แก้จากตะกร้าแล้วคืนแบบไม่ได้ → หน้าสินค้าเข้าโหมด "แนบไฟล์แล้ว"
 * ลูกค้าระบุ 100/100 ชิ้น (จำนวนแต่ละลาย · artworkQty) แต่สเปคตำแหน่งลายเดิม "ลายที่ N × 30 ชิ้น" (จริง ๆ คือ 30 แผ่น) ติดมาด้วย
 * → แบบอนุมัติอัตโนมัติ qty 30 · หลังบ้านขึ้น "ระบุจำนวนรวม 60/200 ชิ้น ไม่ตรง"
 * แก้เป็นรูปแบบใหม่ "ลายที่ N × 25 แผ่น A3 (100 ชิ้น)" + แบบอนุมัติ qty 100 · ไม่แตะยอดเงิน/จำนวนสั่ง/สถานะ/ไฟล์
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const ID = "OD-261019-1860";
const IDX = 3;
const PLACE = "วางบนเทมเพลต";
const SPEC = "ตำแหน่งลาย (ทีมผลิต)";

const { data: row } = await sb.from("orders").select("data").eq("id", ID).single();
const order = row!.data as Order;
const it = order.items[IDX];
if (it?.productId !== "postcard-th" || !/ลายที่ 1 × 30 ชิ้น/.test(it.sel?.[PLACE] ?? "")) {
  console.log("รายการไม่ตรงกับที่คาด (แก้ไปแล้ว/มีคนแก้) — ไม่ทำอะไร");
  process.exit(0);
}
const per = it.unitYield?.per ?? 4;
const pieces = [100, 100];
const qtyText = (n: number) => `${n / per} ${it.unitYield?.unit ?? "แผ่น A3"} (${n} ${it.unitYield?.piece ?? "ชิ้น"})`;
const fix = (s: string) =>
  s
    .replace(/ลายที่ (\d+) × 30 ชิ้น \((\d+) DPI\)/g, (_m, n: string, dpi: string) => `ลายที่ ${n} × ${qtyText(pieces[Number(n) - 1])} · ${dpi} DPI`)
    .replace(/ลายที่ (\d+) × 30 ชิ้น — /g, (_m, n: string) => `ลายที่ ${n} × ${qtyText(pieces[Number(n) - 1])} — `);

const sel = { ...it.sel!, [PLACE]: fix(it.sel![PLACE]), [SPEC]: fix(it.sel![SPEC]) };
const next: Order = {
  ...order,
  items: order.items.map((x, i) =>
    i === IDX
      ? {
          ...x,
          sel,
          selections: fix(x.selections ?? ""),
          proofs: (x.proofs ?? []).map((p, n) => (p.qty === 30 ? { ...p, qty: pieces[n] ?? p.qty } : p)),
        }
      : x,
  ),
};
console.log("วางบนเทมเพลต:", sel[PLACE]);
console.log("สเปค:", sel[SPEC].split(" | ").map((s) => s.slice(0, 50)));
console.log("แบบอนุมัติ qty:", next.items[IDX].proofs?.map((p) => p.qty));
if (!APPLY) process.exit(0);

fs.mkdirSync("backups", { recursive: true });
fs.writeFileSync(`backups/od-261019-1860-before-placement-qty.json`, JSON.stringify(order, null, 1));
const logged = withLog(
  next,
  "ระบบ",
  "แก้จำนวนต่อลาย (สเปคตำแหน่งลาย)",
  "รายการที่ 4 โปสการ์ด: สเปคค้าง ลายละ 30 (จริงคือแผ่น ไม่ใช่ชิ้น) ขัดกับที่ลูกค้าระบุ ลายละ 100 ชิ้น → ลายละ 25 แผ่น A3 (100 ชิ้น) รวม 200 ชิ้น = 50 แผ่น · ยอดเงินไม่เปลี่ยน",
);
const r = await updateOrder(sb as never, logged, { prev: order, by: "ระบบ" });
console.log("บันทึกแล้ว", r);

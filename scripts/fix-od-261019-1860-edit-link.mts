/**
 * 🔗 คืนลิงก์ "แบบบนเว็บ" ของลายที่ 1 (รายการที่ 4 โปสการ์ด) OD-261019-1860
 *
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-od-261019-1860-edit-link.mts           (ดูเฉย ๆ)
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-od-261019-1860-edit-link.mts --apply
 *
 * ต้นเหตุ (19 ต.ค. 69 10:51 champ กด 🔁/✏️ บันทึกกลับ): คืนแบบจากไฟล์แบบบนเซิร์ฟเวอร์ไม่ได้ใส่ editUrl → บันทึกกลับแล้วลายที่ไม่ได้แก้
 * (ลายที่ 1) เสีย " · แบบบนเว็บ: …" ทิ้ง (แก้โค้ดแล้ว ProductDetail) · ไฟล์แบบเดิม cal-design/2026-10-18/4d7676aa….json ยังอยู่ (artUrl 9aef845e ตรงกับรายการ)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { CAL_EDIT_TAG, calEditUrlOf, PLACEMENT_SPEC_LABEL } from "../src/lib/design-templates";
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
const URL1 = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/design-templates/cal-design/2026-10-18/4d7676aa-3f44-4b48-ac87-2556f00a7d50.json";

const { data: row } = await sb.from("orders").select("data").eq("id", ID).single();
const order = row!.data as Order;
const it = order.items[IDX];
const specs = (it?.sel?.[PLACEMENT_SPEC_LABEL] ?? "").split(" | ");
const j = (await (await fetch(URL1)).json()) as { artUrl?: string };
if (it?.productId !== "postcard-th" || specs.length !== 2 || calEditUrlOf(specs[0]) || it.artworkUrls?.[0] !== j.artUrl) {
  console.log("รายการไม่ตรงกับที่คาด (มีลิงก์แล้ว/ลายเปลี่ยน) — ไม่ทำอะไร", { has: !!calEditUrlOf(specs[0]), art0: it?.artworkUrls?.[0], json: j.artUrl });
  process.exit(0);
}
specs[0] = `${specs[0]}${CAL_EDIT_TAG}${URL1}`;
const next: Order = {
  ...order,
  items: order.items.map((x, i) => (i === IDX ? { ...x, sel: { ...x.sel!, [PLACEMENT_SPEC_LABEL]: specs.join(" | ") } } : x)),
};
console.log("ลายที่ 1 ท้ายสเปค:", specs[0].slice(-160));
if (!APPLY) process.exit(0);
fs.mkdirSync("backups", { recursive: true });
fs.writeFileSync("backups/od-261019-1860-before-edit-link.json", JSON.stringify(order, null, 1));
const logged = withLog(next, "ระบบ", "คืนลิงก์แบบบนเว็บ", "รายการที่ 4 ลายที่ 1: ลิงก์แบบหายตอนบันทึกกลับจากจอออกแบบ (บั๊ก editUrl แก้แล้ว) → ใส่ลิงก์ไฟล์แบบเดิมคืน · ไฟล์/ยอดเงินไม่เปลี่ยน");
const r = await updateOrder(sb as never, logged, { prev: order, by: "ระบบ" });
console.log("บันทึกแล้ว", r.error ?? "ok");

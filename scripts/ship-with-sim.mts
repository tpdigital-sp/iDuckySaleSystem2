/** จำลอง "ส่งรวมกล่อง" กับออเดอร์จริง — อ่านอย่างเดียว ไม่เขียนฐาน ไม่ยิงไลน์ */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const R = process.cwd();
const { orderTotal, orderBalance, hasUnpaidBalance } = await import(`${R}/src/lib/admin-data.ts`);
const { isPickupOrder, resolveShipLabel } = await import(`${R}/src/lib/ship-label.ts`);
const SW = await import(`${R}/src/lib/ship-with.ts`);
const N = await import(`${R}/src/lib/server/notify.ts`);
const env = Object.fromEntries(fs.readFileSync(`${R}/.env.local`, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean, info = "") => (cond ? pass++ : fails.push(`${name} ${info}`));

// 1) ใบมารับเองที่ยังไม่ปิด (คำถามเดียวกับเมนู pickup)
const { data: pk, error } = await sb.from("orders").select("data").or("data->>shippingLabel.ilike.*รับ*,data->>shipping.ilike.*รับ*").order("created_at", { ascending: false }).limit(60);
if (error) throw error;
const pickups = (pk ?? []).map((r) => r.data).filter((o: any) => isPickupOrder(o) && !SW.cannotBeRider(o));
console.log(`ใบมารับเองที่เป็นใบตามได้: ${pickups.length} ใบ`);

// 2) คำค้น "ใบอื่นของลูกค้าคนเดียวกัน" แบบเดียวกับ GET — เช็คว่า syntax ผ่านกับฐานจริง + หาคู่จริง
const digits = (s?: string) => (s ?? "").replace(/\D/g, "");
let pairs = 0, asked = 0;
for (const me of pickups.slice(0, 12) as any[]) {
  const phone = digits(me.phone).length >= 8 ? me.phone.trim() : "";
  const keys: [string, string | undefined][] = [["data->>contactId", me.contactId], ["data->>customerId", me.customerId], ["data->>lineUserId", me.lineUserId], ["data->>phone", phone], ["data->>customer", me.customer?.trim()]];
  const res = await Promise.all(keys.filter(([, v]) => !!v).map(([k, v]) => sb.from("orders").select("data").eq(k, v!).order("created_at", { ascending: false }).limit(30)));
  asked += res.length;
  for (const r of res) ok(`query ${me.id}`, !r.error, r.error?.message);
  const seen = new Set([me.id]);
  const others = res.flatMap((r) => r.data ?? []).map((r) => r.data as any).filter((o) => o?.id && !seen.has(o.id) && seen.add(o.id));
  const mains = others.filter((o) => !SW.cannotBeMain(o));
  for (const main of mains.slice(0, 2)) {
    pairs++;
    const { nextMain, nextRider } = SW.buildShipLink(main, me, "เทส", new Date().toISOString());
    ok(`${me.id} ยอดใบตามไม่เปลี่ยน`, orderTotal(nextRider) === orderTotal(me), `${orderTotal(me)}→${orderTotal(nextRider)}`);
    ok(`${main.id} ยอดใบหลักไม่เปลี่ยน`, orderTotal(nextMain) === orderTotal(main));
    ok(`${me.id} ยอดค้างไม่เปลี่ยน`, orderBalance(nextRider) === orderBalance(me) && hasUnpaidBalance(nextRider) === hasUnpaidBalance(me));
    ok(`${me.id} หลุดจากมารับเอง`, !isPickupOrder(nextRider), nextRider.shippingLabel);
    ok(`${me.id} ป้ายวิธีส่งอ่านได้`, !!resolveShipLabel(nextRider, []), nextRider.shippingLabel);
    ok(`${me.id} ผูกซ้ำไม่ได้`, !!SW.cannotBeRider(nextRider) && !!SW.cannotBeMain(nextRider));
    ok(`${main.id} ยังเป็นใบหลักรับใบตามเพิ่มได้`, !SW.cannotBeMain(nextMain));
    // ยิงเลขที่ใบหลัก
    const shippedMain = { ...nextMain, tracking: "EX123456789TH", status: "จัดส่งแล้ว" };
    const shippedRider = { ...nextRider, tracking: "EX123456789TH", status: "จัดส่งแล้ว" };
    const mm = N.statusMessage(shippedMain, "LINK") ?? ""; const rm = N.statusMessage(shippedRider, "LINK") ?? "";
    ok("ข้อความใบหลักบอกใบที่รวม", mm.includes(me.id) && mm.includes("EX123456789TH"), mm);
    ok("ข้อความใบตามไม่พูดเรื่องมารับ", rm.includes(main.id) && !rm.includes("มารับ"), rm);
    ok("flex ใบหลักสร้างได้", JSON.stringify(N.statusFlex(shippedMain, "LINK")).includes("รวมในกล่อง"));
    if (pairs === 1) {
      console.log(`\nตัวอย่างคู่จริง: ใบตาม ${me.id} (${me.shippingLabel || me.shipping} ฿${me.shippingCost} · ${me.status}) + ใบหลัก ${main.id} (${main.shippingLabel || main.shipping} ฿${main.shippingCost} · ${main.status})`);
      console.log(`  ใบตามหลังผูก: วิธีส่ง "${nextRider.shippingLabel}" ค่าส่ง ฿${nextRider.shippingCost} ยอดรวม ${orderTotal(nextRider)} (เดิม ${orderTotal(me)})`);
      console.log(`  ของใบตามพร้อมลงกล่อง?: ${JSON.stringify(SW.riderNotReady(nextRider))}`);
      console.log(`  ไลน์ตอนยิงเลข:\n    ${mm.replace(/\n/g, "\n    ")}`);
    }
  }
}
console.log(`\nคำค้นกับฐานจริง ${asked} ครั้ง · คู่ที่จำลอง ${pairs} คู่`);
console.log(fails.length ? `❌ พลาด ${fails.length}:\n${fails.join("\n")}` : `✅ ผ่าน ${pass} ข้อ`);

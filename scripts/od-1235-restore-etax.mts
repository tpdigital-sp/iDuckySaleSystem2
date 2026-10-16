/**
 * 🧾📧↩ OD-261014-1235 — คืนธง "ส่ง E-tax/อีเมลแล้ว ไม่ต้องแนบกล่อง" ที่ Pang ติ๊กไว้ 15 ต.ค. 69
 * (Jar เผลอแตะ "ต้องแนบกล่อง" ในโหมดแพ็ค 16 ต.ค. 15:03 → ระบบกลับมาบังคับถ่ายรูปใบเสร็จ ทั้งที่ใบปะหน้าพิมพ์ว่าไม่ต้องแนบ)
 *   node --conditions=react-server --import tsx scripts/od-1235-restore-etax.mts [--apply]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { updateOrder } from "../src/lib/server/order-write";
import { TAX_INVOICE_LOG_EMAIL, taxInvoiceDeliveryReverted, withLog, type Order } from "../src/lib/admin-data";

const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");
const ID = "OD-261014-1235";
const BY = "ระบบ (เจ้าของร้านสั่งแก้ 16 ต.ค. 69)";

const { data: row } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
const prev = row?.data as Order;
if (!prev) throw new Error("ไม่พบออเดอร์");
console.log("status", prev.status, "· delivery", prev.taxInvoiceDelivery, "· packed", prev.taxInvoicePacked, "· tracking", prev.tracking ?? "-");
const rev = taxInvoiceDeliveryReverted(prev);
console.log("reverted =", rev);
if (!rev) throw new Error("ไม่เข้าเคส (ธงเป็นอีเมลอยู่แล้ว หรือไม่เคยติ๊ก)");
const next = withLog({ ...prev, taxInvoiceDelivery: "email" }, BY, TAX_INVOICE_LOG_EMAIL, `คืนค่าที่ ${rev.emailBy} ติ๊กไว้ (ถูกเปลี่ยนโดย ${rev.boxBy} ${rev.boxAt})`);
if (!apply) { console.log("dry-run — ใส่ --apply เพื่อบันทึก"); process.exit(0); }
const r = await updateOrder(sb, next, { prev, by: BY });
console.log("saved", r);

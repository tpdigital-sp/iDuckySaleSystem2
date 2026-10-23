// ผ้าผูกผม (scarf): เพิ่มกลุ่ม "ชนิดผ้า: ผ้าซาติน โรม่า" ตัวเลือกเดียว ต่อจาก "ขนาด"
// ให้ออเดอร์มีบรรทัดชนิดผ้าเอง (เดิมอยู่แค่ใน terms) · เจ้าของร้านสั่ง 23 ต.ค. 69 (OD-261022-9435)
// npx tsx scripts/scarf-fabric-option.mts [--write]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { revalidateLive } from "./lib/revalidate-live.mts";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const WRITE = process.argv.includes("--write");
const { data: row, error } = await sb.from("products").select("data").eq("id", "scarf").single();
if (error) throw error;
const p: any = row.data;
if (p.options.some((g: any) => g.label === "ชนิดผ้า")) { console.log("✓ มีกลุ่ม ชนิดผ้า แล้ว"); process.exit(0); }
const group = {
  label: "ชนิดผ้า",
  note: "ผ้าซาติน โรม่า เนื้อลื่น เงาสวย — ร้านใช้ผ้าชนิดเดียว รวมในราคาแล้ว",
  choices: [{ name: "ผ้าซาติน โรม่า" }],
  display: "pills",
  section: "1. ขนาด + งานปัก",
};
const at = p.options.findIndex((g: any) => g.label === "ขนาด") + 1;
const options = [...p.options.slice(0, at), group, ...p.options.slice(at)];
console.log(options.map((g: any) => `${g.label} (${g.choices.length})`).join(" → "));
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อบันทึก)"); process.exit(0); }
const { error: e } = await sb.from("products").update({ data: { ...p, options, savedAt: new Date().toISOString() } }).eq("id", "scarf");
if (e) throw e;
console.log("✅ บันทึกแล้ว");
await revalidateLive(env, { productIds: ["scarf"] });

/**
 * ✂️ เปิดจอ "ออกแบบชิ้นงานไดคัท" ให้พวงกุญแจอะคริลิค (Product.diecutStudio)
 * node scripts/keyring-diecut-studio.mjs            → ดูอย่างเดียว
 * node scripts/keyring-diecut-studio.mjs --write    → บันทึก + อ่านกลับ
 * node scripts/keyring-diecut-studio.mjs --off --write → ถอดออก
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "keyring-copy-copy";
const WRITE = process.argv.includes("--write");
const OFF = process.argv.includes("--off");
const CFG = { sizeLabel: "ขนาด", customSizeLabel: "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)", holeLabel: "เจาะรู" };

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const labels = new Set((p.options ?? []).map((o) => o.label));
for (const l of Object.values(CFG)) if (!labels.has(l)) throw new Error(`ไม่พบกลุ่มตัวเลือก "${l}"`);
console.log("เดิม:", JSON.stringify(p.diecutStudio ?? null), "· studioOff:", p.studioOff ?? null);
if (OFF) delete p.diecutStudio;
else p.diecutStudio = CFG;
console.log("ใหม่:", JSON.stringify(p.diecutStudio ?? null));
if (!WRITE) {
  console.log("(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) throw up.error;
if (!up.data?.length) throw new Error("update ไม่โดนแถวไหนเลย");
const back = (await sb.from("products").select("data").eq("id", ID).single()).data?.data;
if (back?.savedAt !== p.savedAt) throw new Error("อ่านกลับ savedAt ไม่ตรง");
console.log("✅ บันทึกแล้ว:", JSON.stringify(back.diecutStudio ?? null));

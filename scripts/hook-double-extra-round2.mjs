/**
 * ตะขอบวกเบิ้ล รอบ 2 — 5 ต.ค. 69 (ไล่ทุกตะขอ × ทุกสี × จำนวน 10/50 ทั้ง 13 สินค้าที่มีตะขอ)
 *
 *   node scripts/hook-double-extra-round2.mjs           # ดูผล (ไม่เขียน)
 *   node scripts/hook-double-extra-round2.mjs --write   # บันทึกจริง
 *
 * 1) keyring-clear-stopper (พวงกุญแจจุกใส) · ตะขอ AC สั่ง ≤10 ชิ้น
 *    กลุ่ม "ตะขอ / ห่วง" มีค่าเหมาช่วงปลีก ฿10 (smallQtyFee แทนราคาตะขอทุกตัว) แต่กลุ่ม "สีตะขอ AC" (ลิงก์คลัง +5)
 *    ไม่มี extraFromQty → บวก +5 ซ้อนอีก = ฿15 · สินค้าอื่นตั้งกลุ่มสีตะขอ extraFromQty 11 (สีคิดเงินเฉพาะ 11 ชิ้นขึ้นไป)
 *    → ใส่ extraFromQty: 11 ให้ "สีตะขอ AC" (≤10 = ฿10 เหมา · ≥11 = สี +5)
 * 2) standymusic-3 (พวงกุญแจกล่องดนตรี) · ตะขอ C สีเงา: ตะขอ +3 และสีเงา +1 = 2 บรรทัด (ยอด ฿4 ถูก แต่บวก 2 รอบ)
 *    → ย้ายราคาไปไว้ที่สีอย่างเดียว: ตะขอ C ฿0 · สีปกติ +3 · สีเงา +4 (extraBelow 1) · กลุ่มสี extraFromQty 11 ตามกลุ่มตะขอ
 *    ราคาทุกช่วงเท่าเดิมเป๊ะ (≤10: ปกติ 0 เงา 1 · ≥11: ปกติ 3 เงา 4) — ตรวจด้วย unitPriceParts ก่อน/หลังในสคริปต์ทดสอบ
 * สำรองไว้ backups/ · รันซ้ำได้
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,data").in("id", ["keyring-clear-stopper", "standymusic-3"]);
if (error || rows?.length !== 2) die(`อ่านสินค้าไม่ได้ — ${error?.message}`);
const orig = JSON.parse(JSON.stringify(rows));
const changed = new Set();

// 1) จุกใส
{
  const r = rows.find((x) => x.id === "keyring-clear-stopper");
  const g = r.data.options.find((o) => o.label === "สีตะขอ AC");
  if (!g) die("จุกใส: ไม่มีกลุ่ม สีตะขอ AC");
  const hook = r.data.options.find((o) => o.label === "ตะขอ / ห่วง");
  if (!(hook?.smallQtyFee?.fee > 0)) die("จุกใส: กลุ่มตะขอไม่มีค่าเหมาช่วงปลีกแล้ว — ตรวจมือ");
  if (g.extraFromQty !== 11) { console.log(`จุกใส · สีตะขอ AC: extraFromQty ${g.extraFromQty ?? "-"} → 11`); g.extraFromQty = 11; changed.add(r.id); }
  else console.log("= จุกใส · สีตะขอ AC มี extraFromQty 11 แล้ว");
}

// 2) กล่องดนตรี
{
  const r = rows.find((x) => x.id === "standymusic-3");
  const hook = r.data.options.find((o) => o.label === "ตะขอ");
  const c = hook?.choices.find((x) => x.name === "C โซ่ไข่ปลา (หลายสี)");
  const g = r.data.options.find((o) => o.label === "สีตะขอ C (โซ่ไข่ปลา)");
  if (!c || !g) die("กล่องดนตรี: หาตะขอ C / กลุ่มสี C ไม่เจอ");
  if (g.presetId) die("กล่องดนตรี: กลุ่มสี C ลิงก์คลัง — แก้ที่สินค้าไม่ได้ ตรวจมือ");
  if ((c.extra ?? 0) > 0) {
    const base = c.extra; // 3
    if (hook.extraFromQty !== 11) die(`กล่องดนตรี: กลุ่มตะขอ extraFromQty ${hook.extraFromQty} ไม่ใช่ 11 — ตรวจมือ`);
    for (const x of g.choices) {
      const gloss = x.extra ?? 0; // 0 หรือ 1 (สีเงา)
      if (x.extraBelow != null) die(`กล่องดนตรี: ${x.name} มี extraBelow อยู่แล้ว — ตรวจมือ`);
      x.extra = base + gloss;
      if (gloss > 0) x.extraBelow = gloss;
    }
    g.extraFromQty = 11;
    delete c.extra;
    console.log(`กล่องดนตรี · ตะขอ C +${base} → 0 · สีตะขอ C: ปกติ +${base} · เงา +${base + 1} (≤10 +1) · extraFromQty 11`);
    changed.add(r.id);
  } else console.log("= กล่องดนตรี · ตะขอ C ไม่มีราคาแล้ว");
}

if (!WRITE) { console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)"); process.exit(0); }
if (!changed.size) { console.log("ไม่มีอะไรต้องเขียน"); process.exit(0); }
mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
const bak = new URL(`../backups/hook-double-extra-round2-${Date.now()}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(orig, null, 2));
console.log(`💾 สำรอง ${bak.pathname}`);
for (const r of rows.filter((x) => changed.has(x.id))) {
  const { error: e } = await sb.from("products").update({ data: r.data }).eq("id", r.id);
  if (e) die(`${r.id}: ${e.message}`);
}
const { data: back } = await sb.from("products").select("id,data").in("id", [...changed]);
const ok1 = back.find((x) => x.id === "keyring-clear-stopper")?.data.options.find((o) => o.label === "สีตะขอ AC")?.extraFromQty === 11 || !changed.has("keyring-clear-stopper");
const sm = back.find((x) => x.id === "standymusic-3");
const ok2 = !sm || !(sm.data.options.find((o) => o.label === "ตะขอ").choices.find((x) => x.name === "C โซ่ไข่ปลา (หลายสี)").extra > 0);
console.log(ok1 && ok2 ? `✅ บันทึกแล้ว อ่านกลับตรง ${back.length} สินค้า` : "❌ อ่านกลับไม่ตรง");

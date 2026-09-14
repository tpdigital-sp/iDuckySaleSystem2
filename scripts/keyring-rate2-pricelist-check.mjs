#!/usr/bin/env node
/**
 * 🔎 ด่านตรวจ "เรทที่ 2 (ราคาส่ง) ของพวงกุญแจอะคริลิค ตรงใบราคาจริงไหม"
 * เทียบทุกช่องของเรท 2 กับตารางในใบราคา www.iduckyofficial-pricelists.com/keyring
 *   ตาราง "(หนา 3mm) อะคริลิคใส | ขาวขุ่น C-02" และ "(หนา 2mm) …" (เรทที่ 2 · สั่งขั้นต่ำ 50 ชิ้น)
 *   บวกส่วนเพิ่มตามใบราคาเดียวกัน: งานสกรีน 2 ด้าน/3 เลเยอร์ · อคล.พิเศษ (แถว "เรทราคาส่ง")
 * ตรวจทั้งพวงกุญแจอะคริลิค และพวงกุญแจแบบหลายชิ้น (ก๊อปตารางเรท 2 มาจากตัวแรก)
 *
 *   node scripts/keyring-rate2-pricelist-check.mjs
 *
 * ที่มา: 14 ก.ย. 69 คอลัมน์ 3mm × 3cm เคยต่ำไป 5 บาท 2 ขั้นแรก (แก้ด้วย keyring-rate2-3cm-fix.mjs)
 * ⚠️ ตารางฝังไว้ในสคริปต์ — ร้านปรับราคาในใบราคาเมื่อไหร่ ต้องมาแก้ที่นี่ด้วย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const IDS = ["keyring-copy-copy", "keyring-multi-charm"];
/** ราคาฐาน = สกรีน 1 ด้าน บนอะคริลิคใส/ขาวขุ่น · 7 ขั้น: 50-100, 101-199, 200-4,999, 5,000-9,999, 10,000-49,999, 50,000-99,999, 100,000+ */
const WEB = {
  "3mm": { "2cm":[15,13,12,11,10,9,8], "3cm":[30,25,20,15,13,10,10], "4cm":[35,30,25,20,18,16,15],
           "5cm":[45,40,35,30,25,23,21], "6cm":[45,40,35,30,25,23,21], "7cm":[65,60,55,50,45,43,41],
           "8cm":[65,60,55,50,45,43,41], "9cm":[85,80,75,70,65,63,60], "10cm":[85,80,75,70,65,63,60] },
  "2mm": { "2cm":[15,10,9,8,7,6,6], "3cm":[20,15,15,10,9,8,8], "4cm":[30,25,20,15,13,11,10],
           "5cm":[40,35,30,25,20,18,16], "6cm":[40,35,30,25,20,18,16], "7cm":[60,55,50,45,40,37,34],
           "8cm":[60,55,50,45,40,37,34], "9cm":[80,75,70,65,60,57,54], "10cm":[80,75,70,65,60,57,54] },
};
const TWO_SIDE = { "2cm":10,"3cm":10,"4cm":10,"5cm":10,"6cm":15,"7cm":15,"8cm":25,"9cm":25,"10cm":25 };
const SCREEN = { "สกรีน 1 ด้าน (บน)":0, "สกรีน 1 ด้าน (ใต้)":0, "สกรีน 2 ด้าน (บน-บน)":TWO_SIDE, "สกรีน 2 ด้าน (ใต้-บน)":TWO_SIDE,
  "สกรีน 3 เลเยอร์":{ "2cm":20,"3cm":20,"4cm":20,"5cm":20,"6cm":30,"7cm":30,"8cm":50,"9cm":50,"10cm":50 } };
const MATERIAL = { "อะคริลิคใส":0, "อะคริลิคขาวขุ่น C-02":0,
  "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)":{ "2cm":5,"3cm":5,"4cm":5,"5cm":5,"6cm":8,"7cm":8,"8cm":8,"9cm":10,"10cm":10 } };
const add = (a, size) => (typeof a === "number" ? a : a?.[size]);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let bad = 0;
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("name,data").eq("id", id).single();
  if (error) throw error;
  const rate = (row.data.priceRates ?? []).find((r) => r.id === "r2" && !r.dealerOnly);
  if (!rate) { console.log(`✖ ${id}: ไม่เจอเรท 2`); bad++; continue; }
  let ok = 0, miss = 0;
  for (const [key, vals] of Object.entries(rate.pricing.cells)) {
    const [th, size, screen, mat] = key.split("│");
    const base = WEB[th]?.[size];
    const s = add(SCREEN[screen], size), m = add(MATERIAL[mat], size);
    if (!base || s == null || m == null) { console.log(`   ? ${key} — ไม่มีในใบราคาที่ฝังไว้ (ข้าม)`); continue; }
    const want = base.map((v) => v + s + m);
    if (JSON.stringify(want) === JSON.stringify(vals)) ok++;
    else { miss++; console.log(`   ✗ ${key}\n       ในระบบ ${JSON.stringify(vals)}\n       ใบราคา ${JSON.stringify(want)}`); }
  }
  bad += miss;
  console.log(`${miss ? "❌" : "✅"} ${id} · ${row.name} — ตรง ${ok} ช่อง · ไม่ตรง ${miss} ช่อง`);
}
console.log(bad ? `\nรวมไม่ตรง ${bad} ช่อง` : "\nเรทที่ 2 ตรงใบราคาทุกช่อง");
process.exit(bad ? 1 : 0);

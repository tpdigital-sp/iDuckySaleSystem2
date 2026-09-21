/**
 * CASE AIRPODS: ตัวเลือก "สกรีนบอดี้ หรือ ฝา" → "สกรีนบอดี้ 1 ด้าน และ ฝา" (เจ้าของร้านแจ้ง 19 ก.ย. 69)
 * ภาพการ์ดเป็นงานสกรีนบอดี้ + ฝา อยู่แล้ว · ราคา ฿230 อยู่กลางระหว่าง 1 ด้าน (200) กับ 2 ด้าน+ฝา (260)
 * — ชื่อเดิม "หรือ" + คำอธิบาย "ตำแหน่งเดียว" ทำให้ลูกค้าเข้าใจผิด
 *
 *   node scripts/case-airpods-body-and-lid-rename.mjs           # ดูว่าจะแก้อะไร
 *   node scripts/case-airpods-body-and-lid-rename.mjs --write   # เขียนลง Supabase (รันซ้ำได้)
 *
 * ⚠️ ชื่อตัวเลือกเป็นคอลัมน์ตารางราคา (pricing.cells) — ย้ายคีย์ไปพร้อมชื่อ ราคาไม่เปลี่ยน
 *    สคริปต์ไล่แทนชื่อเก่า "ทุกที่" ใน data (rules / imageWhen / ฯลฯ) แล้วเช็คว่าไม่เหลือ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "case-airpods";
const OLD = "สกรีนบอดี้ หรือ ฝา";
const NEW = "สกรีนบอดี้ 1 ด้าน และ ฝา";
const DESC = "สกรีนตัวเคส (บอดี้) ด้านหน้า 1 ด้าน พร้อมสกรีนฝาเคส — ลายต่อเนื่องจากฝาถึงตัวเคส";
const PRICES = [230, 210, 180, 120, 110, 100];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !row) die(`อ่านสินค้า ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);

/** แทนชื่อเก่าทั้งในค่าและในคีย์ (คอลัมน์ราคาหลายแกนต่อกันด้วย │ ก็โดนด้วย) */
const hits = [];
function swap(v, path) {
  if (typeof v === "string") {
    if (!v.includes(OLD)) return v;
    hits.push(path);
    return v.split(OLD).join(NEW);
  }
  if (Array.isArray(v)) return v.map((x, i) => swap(x, `${path}[${i}]`));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const nk = k.includes(OLD) ? k.split(OLD).join(NEW) : k;
      if (nk !== k) hits.push(`${path}.{คีย์ "${k}"}`);
      out[nk] = swap(x, `${path}.${k}`);
    }
    return out;
  }
  return v;
}
const product = swap(row.data, "data");

const group = product.options.find((o) => o.label === "แบบสกรีน" && o.choices?.some((c) => c.name === NEW));
if (!group) die(`ไม่พบตัวเลือก "${OLD}" / "${NEW}" ในกลุ่ม แบบสกรีน`);
const choice = group.choices.find((c) => c.name === NEW);
const descChanged = choice.desc !== DESC;
choice.desc = DESC;

if (product.pricing.cells[NEW]?.join() !== PRICES.join()) die(`ราคาคอลัมน์ "${NEW}" = ${product.pricing.cells[NEW]} ไม่ตรงที่คาด ${PRICES}`);
if (JSON.stringify(product).includes(OLD)) die("ยังเหลือชื่อเก่าอยู่ใน data");

console.log(hits.length ? `แทนชื่อ ${hits.length} จุด:\n  ` + hits.join("\n  ") : "ชื่อเป็นของใหม่อยู่แล้ว");
console.log(descChanged ? `คำอธิบายใหม่: ${DESC}` : "คำอธิบายเป็นของใหม่อยู่แล้ว");
if (!hits.length && !descChanged) { console.log("✓ ไม่มีอะไรต้องแก้"); process.exit(0); }
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

product.savedAt = new Date().toISOString();
const { data: wrote, error: wErr } = await sb.from("products").update({ data: product }).eq("id", ID).select("id");
if (wErr || wrote?.length !== 1) die(`เขียนไม่สำเร็จ: ${wErr?.message ?? `โดน ${wrote?.length} แถว`}`);
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
if (back.data.savedAt !== product.savedAt || JSON.stringify(back.data).includes(OLD) || !back.data.pricing.cells[NEW])
  die("อ่านกลับแล้วค่าไม่ตรง — รันซ้ำ");
console.log("✓ เขียนแล้ว + อ่านกลับตรง");

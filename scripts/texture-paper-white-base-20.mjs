#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — ค่าพิมพ์รองสีขาว (ด้านหน้า) 60 → 20 บาท/แผ่น A3
 *
 *   node scripts/texture-paper-white-base-20.mjs           # ดูก่อน
 *   node scripts/texture-paper-white-base-20.mjs --write
 *
 * ผู้ใช้แจ้ง 28 ส.ค. 69 · ข้อความเดิมกาง 60 ไว้เป็น "ค่าพิมพ์ 20 + ค่ากระดาษ 40"
 * พอเหลือ 20 การกางแบบนั้นบวกไม่ครบ จึงตัดวงเล็บออก เหลือตัวเลขเดียวทุกที่
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const GROUP = "พิมพ์รองสีขาว (ด้านหน้า)";
const CHOICE = "พิมพ์รองสีขาว";
const NEW_FEE = 20;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;
const d = JSON.parse(JSON.stringify(before));

/* ---------- 1) ราคาในตัวเลือก ---------- */
const opt = d.options.find((o) => o.label === GROUP);
if (!opt) { console.error(`หากลุ่ม "${GROUP}" ไม่เจอ — หยุด`); process.exit(1); }
const ch = opt.choices.find((c) => c.name === CHOICE);
if (!ch) { console.error(`หาตัวเลือก "${CHOICE}" ไม่เจอ — หยุด`); process.exit(1); }
const oldFee = ch.extra;
ch.extra = NEW_FEE;

/* ---------- 2) ข้อความที่เขียนเลข 60 ไว้ ---------- */
const swaps = [];
const swap = (get, set, from, to) => {
  const cur = get();
  if (typeof cur !== "string" || !cur.includes(from)) { swaps.push(["❌ ไม่เจอ", from.slice(0, 70)]); return; }
  set(cur.split(from).join(to));
  swaps.push(["✓", to.slice(0, 90)]);
};
const T = (from, to) => swap(() => d.terms, (v) => (d.terms = v), from, to);
const TAB = (i, from, to) => swap(() => d.tabs[i].text, (v) => (d.tabs[i].text = v), from, to);

T("พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น", "พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น");
T("พิมพ์รองสีขาว บวกเพิ่มแผ่นละ 60 บาท (ค่าพิมพ์ 20 + ค่ากระดาษ 40) คิดต่อแผ่น A3 แบบเดียวกับงานเคลือบ",
  "พิมพ์รองสีขาว บวกเพิ่มแผ่นละ 20 บาท คิดต่อแผ่น A3 แบบเดียวกับงานเคลือบ");
TAB(0, "(พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)", "(พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น)");
TAB(0, "· พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)", "· พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น)");
TAB(0, "• พิมพ์รองสีขาว บวกแผ่นละ 60 บาท (ค่าพิมพ์ 20 + ค่ากระดาษ 40) —", "• พิมพ์รองสีขาว บวกแผ่นละ 20 บาท —");
TAB(2, '"พิมพ์รองสีขาว" (บวกแผ่นละ 60 บาท)', '"พิมพ์รองสีขาว" (บวกแผ่นละ 20 บาท)');
swap(() => d.seo.faqs[2].a, (v) => (d.seo.faqs[2].a = v), "บวกเพิ่มแผ่นละ 60 บาท", "บวกเพิ่มแผ่นละ 20 บาท");

/* ---------- สรุป + กันเลข 60 ตกค้าง ---------- */
console.log(`"${GROUP}" → "${CHOICE}": +฿${oldFee} → +฿${ch.extra}\n`);
for (const [ok, t] of swaps) console.log(`  ${ok} ${t}`);

const left = [];
const walk = (v, p) => {
  if (typeof v === "string") { if (/รองสีขาว/.test(v) && /60/.test(v)) left.push(`${p}: ${v.slice(0, 120)}`); return; }
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
};
walk({ terms: d.terms, tabs: d.tabs, seo: d.seo, highlights: d.highlights, description: d.description }, "$");
console.log(left.length ? `\n⛔ ยังมีเลข 60 ค้างอยู่:\n   ${left.join("\n   ")}` : "\n✓ ไม่มีเลข 60 ค้างในข้อความเรื่องรองสีขาวแล้ว");

if (swaps.some(([ok]) => ok !== "✓") || left.length) { console.error("\n⛔ ไม่เขียน"); process.exit(1); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");

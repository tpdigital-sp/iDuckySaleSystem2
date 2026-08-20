#!/usr/bin/env node
/**
 * ถอดตัวเลือก "สกรีน 4 เลเยอร์" ออกจากสินค้าที่ไม่ใช่งานประกบ
 *
 *   node scripts/remove-4layer-nonlaminated.mjs           # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/remove-4layer-nonlaminated.mjs --write   # บันทึกจริง
 *
 * แผ่น HOW TO PRINT ของร้านเขียนกำกับช่อง 4 เลเยอร์ไว้ว่า "อะคริลิคงานประกบ (2ชิ้น)" และ
 * "สำหรับงานประกบอะคริลิค 2 ชิ้น เท่านั้น" — เพราะ 4 ชั้นคือสกรีนบน+ใต้ของอะคริลิค 2 แผ่นประกบกัน
 * สินค้าแผ่นเดียวจึงทำไม่ได้ ต้องไม่ให้เลือก
 *
 * ⚠️ กลุ่มงานสกรีนเป็นแกนตารางราคา — ลบตัวเลือกแล้วต้องลบช่องราคาของตัวนั้นด้วย
 *    ไม่งั้นเหลือช่องกำพร้าค้างในตาราง (ไม่พังหน้าร้าน แต่ตารางหลังบ้านจะรก)
 * ⚠️ ตรวจว่าช่องที่ "เหลืออยู่" ราคาไม่เปลี่ยนสักช่อง ก่อนบันทึกเสมอ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const CATEGORIES = ["acrylic", "standee"];
const EXTRA_IDS = ["1-3", "1-4", "photoframe-4"];
const GROUP_RE = /^(งานสกรีน|สกรีน|การสกรีน)$/;
const FOUR_RE = /4\s*เลเยอร์|4\s*layer/i;

/** งานประกบอะคริลิค 2 ชิ้น — พวกนี้ทำ 4 เลเยอร์ได้จริง เก็บไว้ */
const KEEP = new Set(["3d-acrylic", "acrylic-prakob"]);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const a = await sb.from("products").select("id,data").in("category", CATEGORIES);
const b = await sb.from("products").select("id,data").in("id", EXTRA_IDS);
if (a.error || b.error) throw new Error((a.error || b.error).message);
const rows = [...a.data, ...b.data]
  .filter((r, i, x) => x.findIndex((y) => y.id === r.id) === i)
  .sort((x, y) => x.id.localeCompare(y.id));

let touched = 0;
const leftovers = [];
for (const row of rows) {
  const d = structuredClone(row.data);
  const opt = (d.options ?? []).find((o) => GROUP_RE.test(o.label));
  if (!opt) continue;
  const gone = opt.choices.find((c) => FOUR_RE.test(c.name));
  if (!gone) continue;
  if (KEEP.has(row.id)) {
    console.log(`📦 ${row.id.padEnd(24)} "${d.name}" — งานประกบ 2 ชิ้น เก็บ "${gone.name}" ไว้`);
    continue;
  }

  opt.choices = opt.choices.filter((c) => c !== gone);

  // ตารางราคา — ตัดช่องของตัวเลือกที่ถอดออกทิ้ง แล้วเช็คว่าช่องที่เหลือราคาไม่เปลี่ยน
  const pruned = [];
  for (const m of [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)]) {
    if (!m?.cells || !(m.driverLabels ?? []).includes(opt.label)) continue;
    const at = m.driverLabels.indexOf(opt.label);
    const prev = m.cells;
    const cells = Object.fromEntries(Object.entries(prev).filter(([k]) => k.split("│")[at] !== gone.name));
    const bad = Object.entries(cells).filter(([k, v]) => JSON.stringify(prev[k]) !== JSON.stringify(v));
    if (bad.length) throw new Error(`${row.id}: ราคาช่องที่เหลือเปลี่ยน ${bad.length} ช่อง — ไม่บันทึก`);
    pruned.push(`${Object.keys(prev).length}→${Object.keys(cells).length}`);
    m.cells = cells;
  }

  // กฎที่อ้างตัวเลือกนี้ — ถอดชื่อออกจากลิสต์ · ถ้ากฎเหลือเงื่อนไขว่างก็ทิ้งทั้งกฎ
  let ruleHits = 0;
  d.rules = (d.rules ?? []).filter((r) => {
    if (r.limit?.label === opt.label && r.limit.allow?.includes(gone.name)) {
      r.limit.allow = r.limit.allow.filter((n) => n !== gone.name);
      ruleHits++;
    }
    if (r.when?.label === opt.label) {
      const list = (r.when.choices ?? [r.when.choice]).filter((n) => n !== gone.name);
      if (list.length !== (r.when.choices ?? [r.when.choice]).length) {
        ruleHits++;
        if (!list.length) return false; // ไม่เหลือเงื่อนไขแล้ว
        r.when.choices = list;
        if (r.when.choice === gone.name) r.when.choice = list[0];
      }
    }
    return true;
  });

  // คำถามที่พบบ่อยไล่ชื่อตัวเลือกไว้
  for (const f of d.seo?.faqs ?? []) {
    if (f.a?.includes(`${opt.label}:`))
      f.a = f.a.replace(new RegExp(`(${opt.label}:\\s*)([^·]*)`), `$1${opt.choices.map((c) => c.name).join(", ")}`);
  }

  // ข้อความที่ยังโฆษณา 4 เลเยอร์ — ต้องแก้ด้วย ไม่งั้นลูกค้าอ่านว่าทำได้แต่หาตัวเลือกไม่เจอ
  let textHits = 0;
  const fixText = (t) => {
    if (typeof t !== "string" || !t) return t;
    const before = t;
    t = t
      // ⚠️ ต้องแก้ "3-4 เลเยอร์" ก่อนลบบรรทัด — ไม่งั้นบรรทัดที่พูดถึงทั้ง 3 และ 4 เลเยอร์
      //    จะโดนกฎลบบรรทัดกินไปทั้งบรรทัด ข้อมูลของ 3 เลเยอร์หายตามไปด้วย
      .replace(/3-4\s*เลเยอร์/g, "3 เลเยอร์")
      // บรรทัดที่เป็นของ 4 เลเยอร์ล้วน ๆ (ไล่ราคาเฉพาะแบบนั้น) — ตัดทั้งบรรทัด
      // จับเฉพาะบรรทัดที่ขึ้นต้นด้วย "• สกรีน 4 เลเยอร์" เท่านั้น บรรทัดที่มี 3 เลเยอร์ปนอยู่จะไม่โดน
      .replace(/^[ \t]*•\s*สกรีน\s*4\s*เลเยอร์[^\n]*\n?/gm, "")
      // ไล่รายการ "… 3 เลเยอร์ / 4 เลเยอร์" หรือ "… 3 เลเยอร์ · 4 เลเยอร์"
      .replace(/(3\s*เลเยอร์)\s*[/·]\s*4\s*เลเยอร์/g, "$1")
      // "เลือกงานสกรีนได้ 4 แบบ" → เหลือ 3 แบบ
      .replace(/เลือกงานสกรีนได้ 4 แบบ/g, "เลือกงานสกรีนได้ 3 แบบ")
      // บรรทัดชี้แผ่น HOW TO PRINT — บอกด้วยว่าทำไมในแผ่นมี 4 เลเยอร์แต่สินค้านี้เลือกไม่ได้
      .replace(
        / · 3 และ 4 เลเยอร์\)/g,
        " · 3 เลเยอร์) · ช่อง 4 เลเยอร์ในแผ่นทำได้เฉพาะงานประกบอะคริลิค 2 ชิ้น สินค้านี้จึงไม่มีให้เลือก"
      );
    if (t !== before) textHits++;
    return t;
  };
  d.description = fixText(d.description);
  d.highlights = (d.highlights ?? []).map(fixText).filter(Boolean);
  for (const t of d.tabs ?? []) t.text = fixText(t.text);
  for (const r of d.priceRates ?? []) if (r.desc) r.desc = fixText(r.desc);

  // ยังเหลือที่ไหนอีกไหม (เผื่อมีสำนวนที่กฎข้างบนจับไม่ได้)
  const still = [
    ...(d.tabs ?? []).map((t, i) => [`tabs[${i}] "${t.title}"`, t.text]),
    ...(d.highlights ?? []).map((h, i) => [`highlights[${i}]`, h]),
    ...(d.priceRates ?? []).map((r, i) => [`priceRates[${i}].desc`, r.desc ?? ""]),
    ["description", d.description ?? ""],
  ].filter(([, txt]) => FOUR_RE.test(txt) && !/งานประกบ/.test(txt));
  still.forEach(([where]) => leftovers.push(`${row.id} · ${where}`));

  console.log(`📦 ${row.id.padEnd(24)} "${d.name}" — ถอด "${gone.name}"`);
  if (pruned.length) console.log(`      ช่องราคา ${pruned.join(" · ")} · ช่องที่เหลือราคาไม่เปลี่ยน ✅`);
  if (ruleHits) console.log(`      อัปเดตกฎ ${ruleHits} จุด`);
  if (textHits) console.log(`      แก้ข้อความที่ยังโฆษณา 4 เลเยอร์ ${textHits} จุด`);
  console.log(`      เหลือ: ${opt.choices.map((c) => c.name).join(" | ")}`);
  touched++;
  if (!WRITE) continue;
  const { error } = await sb.from("products").update({ data: d }).eq("id", row.id);
  if (error) throw new Error(`${row.id}: บันทึกไม่สำเร็จ — ${error.message}`);
}

if (leftovers.length) {
  console.log(`\n⚠️ ข้อความที่ยังพูดถึง 4 เลเยอร์ (สคริปต์ไม่แก้ให้ เพราะสำนวนคนละแบบ — ไปแก้เองที่หลังบ้าน):`);
  leftovers.forEach((l) => console.log(`   ${l}`));
}
console.log(WRITE ? `\n✅ ถอดไป ${touched} สินค้า` : `\n(ยังไม่บันทึก — ใส่ --write · จะถอด ${touched} สินค้า)`);

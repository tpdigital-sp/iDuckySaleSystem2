#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — ปรับกติกางานสกรีนตามที่ร้านสั่ง (24 ส.ค. 69)
 *
 *   node scripts/keyring-stopper-screen-rework.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/keyring-stopper-screen-rework.mjs --write   # บันทึกจริง
 *
 * งานนี้เป็นอะคริลิค 2 ชิ้นประกบกันด้วยจุกสีใส (แผ่นล่าง = ชิ้นหลัก · แผ่นบน = อะคริลิคใสหมุนได้)
 * ตารางราคาเป็นเมทริกซ์ 3 แกน [ขนาดแผ่นล่าง × งานสกรีน × ขนาดแผ่นบน]
 *
 * ของเดิม: ค่าสกรีน 2 ด้าน "คิดกับทั้งสองแผ่น" (แผ่นล่างตามขนาดล่าง + แผ่นบนตามขนาดบน)
 *          และมีตัวเลือก "สกรีน 3 เลเยอร์"
 *
 * ที่ร้านสั่งแก้:
 *   1. แผ่นบน สกรีนได้แค่ 1 ด้านเท่านั้น → แผ่นบนไม่มีค่าสกรีนเพิ่ม (ตัดส่วนของแผ่นบนออก)
 *   2. งานสกรีน 2 ด้าน บวกเพิ่ม "เฉพาะแผ่นล่าง" (ตามขนาดแผ่นล่าง)
 *   3. ตัดตัวเลือก "สกรีน 3 เลเยอร์" ออก
 *
 * วิธีคิด: ราคาช่อง "สกรีน 1 ด้าน" ปัจจุบัน = ราคาแผ่นล่าง + ราคาแผ่นบน (ยังไม่มีค่าสกรีน) — ใช้เป็นฐาน
 *   ช่อง 2 ด้าน (ใหม่) = ฐาน + ค่าสกรีน 2 ด้านของ "แผ่นล่าง" อย่างเดียว
 *     2-5 ซม. +10 · 6-7 ซม. +15 · 8-10 ซม. +25 บาท/ชิ้น (ตามขนาดแผ่นล่าง)
 *   เปลี่ยนชื่อกลุ่ม "งานสกรีน" → "งานสกรีน (แผ่นล่าง)" ให้ชัดว่าเลือกให้แผ่นล่าง
 *
 * ⚠️ แก้ทั้ง d.pricing และ d.priceRates[].pricing (หน้าร้านอ่าน priceRates ก่อน — ดู activeMatrix)
 * ⚠️ รันซ้ำได้ (กันด้วยการเช็ค driverLabels[1] ว่าเปลี่ยนชื่อแล้วหรือยัง)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";

const BOTTOM = "ขนาดแผ่นล่าง";
const SCREEN_OLD = "งานสกรีน";
const SCREEN_NEW = "งานสกรีน (แผ่นล่าง)";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const sizeName = (cm) => `${cm} ซม.`;

const S1U = "สกรีน 1 ด้าน (ใต้)";
const S1T = "สกรีน 1 ด้าน (บน)";
const S2UT = "สกรีน 2 ด้าน (ใต้-บน)";
const S2TT = "สกรีน 2 ด้าน (บน-บน)";
const S3L = "สกรีน 3 เลเยอร์";
const KEEP = [S1U, S1T, S2UT, S2TT]; // ตัด S3L ออก
const TWO_SIDE = new Set([S2UT, S2TT]);

/** ค่าสกรีน 2 ด้านของ "แผ่นล่าง" ตามขนาดแผ่นล่าง (2-5→10 · 6-7→15 · 8-10→25) */
const band = (cm) => (cm <= 5 ? 0 : cm <= 7 ? 1 : 2);
const bottomScreenFee = (cm) => [10, 15, 25][band(cm)];

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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);

if (!(d.pricing?.driverLabels ?? []).includes(SCREEN_OLD)) {
  console.log(`กลุ่มงานสกรีนถูกปรับเป็น "${SCREEN_NEW}" แล้ว — ไม่ต้องรันซ้ำ`);
  process.exit(0);
}

/* ── 1. ตารางราคา: คิดค่าสกรีน 2 ด้านเฉพาะแผ่นล่าง + ตัด 3 เลเยอร์ ─── */
const rebuild = (m, tag) => {
  if (!m?.cells) return null;
  if (JSON.stringify(m.driverLabels) !== JSON.stringify([BOTTOM, SCREEN_OLD, TOP]))
    throw new Error(`${tag}: แกนตารางไม่ใช่ [${BOTTOM}, ${SCREEN_OLD}, ${TOP}] (${JSON.stringify(m.driverLabels)}) — ตรวจก่อน`);

  const cells = {};
  for (const b of SIZES) {
    for (const t of SIZES) {
      const base = m.cells[`${sizeName(b)}│${S1U}│${sizeName(t)}`];
      const baseTop = m.cells[`${sizeName(b)}│${S1T}│${sizeName(t)}`];
      if (!base) throw new Error(`${tag}: ไม่มีช่องฐาน ${sizeName(b)}│${S1U}│${sizeName(t)}`);
      if (JSON.stringify(base) !== JSON.stringify(baseTop))
        throw new Error(`${tag}: ช่อง 1 ด้าน (ใต้) กับ (บน) ราคาไม่เท่ากันที่ ${b}/${t} — โครงเปลี่ยนไป ตรวจก่อน`);

      // ตรวจว่าโมเดลเดิมคือ "ล่าง+บน" จริง: ช่อง 2 ด้านขนาดเท่ากัน (bb) ต้อง = ฐาน + 2×feeล่าง
      if (b === t) {
        const old2 = m.cells[`${sizeName(b)}│${S2UT}│${sizeName(t)}`];
        const gotFee = (old2[0] - base[0]) / 2;
        if (gotFee !== bottomScreenFee(b))
          throw new Error(`${tag}: ค่าสกรีนเดิมที่ขนาด ${b} = ${gotFee} ไม่ตรงกับตารางร้าน (${bottomScreenFee(b)}) — ตรวจก่อน`);
      }

      for (const screen of KEEP) {
        const fee = TWO_SIDE.has(screen) ? bottomScreenFee(b) : 0; // เฉพาะแผ่นล่าง
        cells[`${sizeName(b)}│${screen}│${sizeName(t)}`] = base.map((p) => p + fee);
      }
    }
  }
  m.driverLabels = [BOTTOM, SCREEN_NEW, TOP];
  m.cells = cells;
  return { tag, cells: Object.keys(cells).length };
};

const built = [rebuild(d.pricing, "pricing")];
for (const [i, r] of (d.priceRates ?? []).entries()) built.push(rebuild(r.pricing, `priceRates[${i}] ${r.label}`));

/* ── 2. ตัวเลือก: เปลี่ยนชื่อกลุ่ม + ตัดตัวเลือก 3 เลเยอร์ ────────── */
for (const o of d.options ?? []) {
  if (o.label === SCREEN_OLD) {
    o.label = SCREEN_NEW;
    o.choices = (o.choices ?? []).filter((c) => c.name !== S3L);
  }
  for (const w of [o.showWhen, o.showWhenAlso]) {
    if (w?.label === SCREEN_OLD) w.label = SCREEN_NEW;
  }
}

/* ── 3. ราคาเริ่มต้น / min / max ────────────────────────────────── */
const all = Object.values((d.priceRates?.[0] ?? d).pricing.cells).flat();
const min = Math.min(...all);
const max = Math.max(...all);
const oldPrice = d.price;
const oldMax = d.priceMax;
d.price = min;
d.priceMin = min;
d.priceMax = max;
if (d.seo?.title && oldPrice !== min) d.seo.title = d.seo.title.replace(`${oldPrice} บาท`, `${min} บาท`);

/* ── 4. ข้อความ — ให้ตรงกติกาใหม่ (แผ่นบน 1 ด้าน · 2 ด้านเฉพาะล่าง · ไม่มี 3 เลเยอร์) ─── */
const M = (d.priceRates?.[0] ?? d).pricing;
const cell = (b, s, t, i) => M.cells[`${sizeName(b)}│${s}│${sizeName(t)}`][i];
const tab = (title) => (d.tabs ?? []).find((t) => t.title === title);

// description
d.description =
  "พวงกุญแจอะคริลิค 2 ชิ้นประกบกันด้วยอะไหล่จุกสีใส (แผ่นล่าง + แผ่นบนหมุน/ขยับได้) " +
  "พิมพ์ลายตามสั่ง อะคริลิคหนา 3 มม. พิมพ์ระบบ UV ไดคัทตามลาย " +
  "แผ่นล่างทำขนาด 2-10 ซม. เลือกสี/กลิตเตอร์/โฮโลแกรมได้ · แผ่นบนเป็นอะคริลิคใส 2-10 ซม. สกรีน 1 ด้าน " +
  `เลือกงานสกรีนแผ่นล่าง 1 หรือ 2 ด้าน เลือกตะขอ/ห่วงได้กว่า 30 แบบ ราคาเริ่ม ${min} บาท/ชิ้น (รวมทั้ง 2 แผ่นและจุกสีใสแล้ว)`;

// highlights
if (Array.isArray(d.highlights)) {
  d.highlights = d.highlights.map((h) =>
    /เลือกสกรีน|เลเยอร์/.test(h)
      ? "สกรีนแผ่นล่าง 1 ด้าน / 2 ด้าน (ใต้-บน · บน-บน) · แผ่นบนอะคริลิคใส สกรีน 1 ด้าน"
      : h
  );
}

// terms
if (typeof d.terms === "string") {
  const lines = d.terms.split("\n").filter((l) => !/สกรีน 3 เลเยอร์|4 เลเยอร์/.test(l));
  const out = [];
  for (const l of lines) {
    if (l.startsWith("สกรีน 2 ด้าน บวกเพิ่ม")) {
      out.push(
        "แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้านเสมอ — ไม่มีค่าสกรีนเพิ่มของแผ่นบน"
      );
      out.push(
        "งานสกรีน 2 ด้าน บวกเพิ่มเฉพาะแผ่นล่าง ตามขนาดแผ่นล่าง 2-5 ซม. 10 · 6-7 ซม. 15 · 8-10 ซม. 25 บาท/ชิ้น"
      );
    } else {
      out.push(l);
    }
  }
  d.terms = out.join("\n");
}

// tab: รายละเอียดเพิ่มเติม
{
  const t = tab("รายละเอียดเพิ่มเติม");
  if (t)
    t.text = t.text.replace(
      /• เลือกงานสกรีน[^\n]*/,
      "• เลือกงานสกรีนแผ่นล่าง: 1 ด้าน · 2 ด้าน (ใต้-บน / บน-บน) — แผ่นบนอะคริลิคใส สกรีน 1 ด้าน"
    );
}

// tab: แผ่นบน (ชิ้นที่ 2)
{
  const t = tab("แผ่นบน (ชิ้นที่ 2)");
  if (t) {
    t.text = t.text.replace(
      /• เลือกสกรีน[^\n]*/,
      "• แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้านเสมอ — ไม่มีค่าสกรีนเพิ่มของแผ่นบน (งานสกรีน 2 ด้านคิดเฉพาะแผ่นล่าง)"
    );
    // อัปเดตตัวอย่างราคา (สกรีน 1 ด้าน) ให้ตรงตารางใหม่
    t.text = t.text.replace(
      /ตัวอย่างราคาต่อชิ้น[\s\S]*$/,
      "ตัวอย่างราคาต่อชิ้น (สกรีน 1 ด้าน · รวมทั้งชุดแล้ว)::\n" +
        `• แผ่นล่าง 5 ซม. + แผ่นบน 2 ซม. — สั่ง 1-10 ชิ้น ${cell(5, S1U, 2, 0)} บาท · 11-29 ชิ้น ${cell(5, S1U, 2, 1)} บาท · 50-199 ชิ้น ${cell(5, S1U, 2, 3)} บาท\n` +
        `• แผ่นล่าง 5 ซม. + แผ่นบน 3 ซม. — สั่ง 1-10 ชิ้น ${cell(5, S1U, 3, 0)} บาท · 11-29 ชิ้น ${cell(5, S1U, 3, 1)} บาท · 50-199 ชิ้น ${cell(5, S1U, 3, 3)} บาท\n` +
        `• แผ่นล่าง 10 ซม. + แผ่นบน 5 ซม. — สั่ง 1-10 ชิ้น ${cell(10, S1U, 5, 0)} บาท · 11-29 ชิ้น ${cell(10, S1U, 5, 1)} บาท · 50-199 ชิ้น ${cell(10, S1U, 5, 3)} บาท`
    );
  }
}

// tab: ขนาดและงานสกรีน — เขียนหัวข้อ "งานสกรีน::" ใหม่
{
  const t = tab("ขนาดและงานสกรีน");
  if (t) {
    const head = t.text.split("งานสกรีน::")[0];
    t.text =
      head +
      "งานสกรีน (เลือกให้แผ่นล่าง)::\n" +
      "• แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้านเสมอ — งานสกรีนที่เลือกคิดกับแผ่นล่าง (ชิ้นหลัก)\n" +
      "• สกรีน 1 ด้าน (ใต้ / บน) — ราคามาตรฐานตามตาราง\n" +
      "• สกรีน 2 ด้าน (ใต้-บน / บน-บน) — บวกเพิ่มเฉพาะแผ่นล่าง 2-5 ซม. +10 · 6-7 ซม. +15 · 8-10 ซม. +25 บาท/ชิ้น\n" +
      "• ระบบรวมค่าสกรีนให้ในตารางราคาแล้ว เลือกแล้วเห็นราคาจริงทันที\n" +
      "• ดูแผ่น “HOW TO PRINT” ด้านล่าง — เทียบให้เห็น สกรีนใต้/บน และ 2 ด้าน (ใต้-บน / บน-บน)";
  }
}

// seo.faqs
for (const f of d.seo?.faqs ?? []) {
  if (/สกรีนกี่ด้าน|เลเยอร์/.test(f.q)) {
    f.q = "สกรีนกี่ด้านได้บ้าง คิดราคายังไง?";
    f.a =
      "แผ่นล่าง (ชิ้นหลัก) เลือกสกรีน 1 ด้าน หรือ 2 ด้านได้ (ใต้-บน / บน-บน) · " +
      "แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้านเสมอ · " +
      "งานสกรีน 2 ด้านคิดเพิ่มเฉพาะแผ่นล่าง ตามขนาดแผ่นล่าง 2-5 ซม. +10 · 6-7 ซม. +15 · 8-10 ซม. +25 บาท/ชิ้น";
  }
  if (/ราคาเท่าไหร่/.test(f.q)) {
    f.a =
      `ราคารวมทั้ง 2 แผ่นและจุกสีใสแล้ว เริ่มต้นชิ้นละ ${min} บาท (แผ่นล่าง 2 ซม. + แผ่นบน 2 ซม. สกรีน 1 ด้าน ที่ 500 ชิ้นขึ้นไป) · ` +
      `สั่ง 1-10 ชิ้น แผ่นล่าง 5 ซม. + แผ่นบน 2 ซม. อยู่ที่ ${cell(5, S1U, 2, 0)} บาท/ชิ้น · ` +
      `แผ่นล่าง 10 ซม. + แผ่นบน 5 ซม. ${cell(10, S1U, 5, 0)} บาท/ชิ้น — ยิ่งสั่งเยอะยิ่งถูกตามตารางราคา`;
  }
}

/* ── สรุป ──────────────────────────────────────────────────────── */
console.log(`📦 ${d.name} (${ID})`);
built.filter(Boolean).forEach((b) => console.log(`   • ${b.tag}: ${b.cells} ช่อง (9 ล่าง × ${KEEP.length} สกรีน × 9 บน)`));
console.log(`   • เปลี่ยนชื่อกลุ่ม "${SCREEN_OLD}" → "${SCREEN_NEW}" · ตัดตัวเลือก "${S3L}"`);
console.log(`   • ราคาเริ่มต้น ${oldPrice} → ${min} บาท · สูงสุด ${oldMax} → ${max} บาท`);
console.log("\n   ตัวอย่างช่องราคา — 1-10 / 11-29 / 30-49 / 50-199 / 200-499 / 500+");
for (const [b, s, t] of [
  [2, S1U, 2],
  [5, S2UT, 2],
  [5, S2UT, 5],
  [10, S2UT, 5],
  [10, S2UT, 10],
])
  console.log(`     ล่าง ${b} · ${s} · บน ${t}  ${[0, 1, 2, 3, 4, 5].map((i) => cell(b, s, t, i)).join(" / ")}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");

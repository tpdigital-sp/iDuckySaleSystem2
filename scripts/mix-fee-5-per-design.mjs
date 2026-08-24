#!/usr/bin/env node
/**
 * ค่าคละลายใหม่ "ลายละ 5 บาท ลายแรกไม่คิด" — 3 สินค้า (ร้านสั่ง 24 ส.ค. 69)
 *   paper-art-pet (กระดาษอาร์ตมัน | PET) · sticker-uv (Sticker-uv) · sticker-pp (สติ๊กเกอร์ PP Digital)
 *
 *   node scripts/mix-fee-5-per-design.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/mix-fee-5-per-design.mjs --write
 *
 * กติกาที่ร้านยืนยัน (ถาม-ตอบ 24 ส.ค. 69):
 *   - คิดเฉพาะการคละ "ในแผ่นเดียวกัน" (ลายเกินจำนวนแผ่น) — ลายละแผ่นขึ้นไปไม่คิด
 *   - ลายแรกของแผ่นไม่คิด: แผ่นที่มี n ลาย จ่าย (n-1)×5 บาท (คละ 2 ลาย = 5 · 3 ลาย = 10)
 *   → mixRule {baseFee: 5, includedDesigns: 2, extraFee: 5} (feeOfUnit = 5 + (n-2)×5)
 *
 * ของเดิมที่ถูกแทน:
 *   - paper-art-pet: mixRule 10/10/4 + onePerUnitFromQty:1 — ตัวหลังบล็อกการคละในแผ่น
 *     (เพดานลาย = จำนวนแผ่น) ทำให้ค่าคละไม่เคยถูกคิดเลย ต้องถอดออก · เรททั้ง 3 มี
 *     minPerDesign:1/freeMixBelowQty:1 ที่ขึ้นป้าย "คละลายขั้นต่ำลายละ 1 แผ่น" ขัดกับกติกาใหม่ — ถอดด้วย
 *   - sticker-uv: mixRule 20/5/4 (เหมา 20 ถึง 4 ลาย เกินบวกลายละ 5) + ข้อความแยกไดคัท 50%=ลายละ 20
 *   - sticker-pp: mixRule 20/20/2 + onePerUnitFromQty:1 (บล็อกเหมือนกัน) + ข้อความลายละ 20
 *   ⚠️ กติกาใหม่ใช้เรทเดียวทั้งไดคัท 50% และ 100% (ระบบคิด mixRule ได้กติกาเดียวต่อสินค้า)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const MIX_RULE = { baseFee: 5, includedDesigns: 2, extraFee: 5 };

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/** แทนข้อความแบบต้องเจอเป๊ะ — แทนแล้วรอบก่อนก็ผ่าน (สคริปต์รันซ้ำได้) ไม่เจอทั้งคู่ = โครงสร้างเปลี่ยน หยุดก่อน */
const swap = (id, text, from, to) => {
  if (text?.includes(to)) return text;
  if (!text?.includes(from)) die(`${id}: ไม่พบข้อความ "${from.slice(0, 60)}…"`);
  return text.replaceAll(from, to);
};

/** คำตอบ FAQ "คละลายได้ไหม?" (data.seo.faqs) — ข้อความเก่าอ้างเรทค่าคละเดิม ต้องตามแก้ด้วย */
const FAQ_Q = "คละลายได้ไหม?";
const FAQ_A =
  "ได้ครับ คละลายในแผ่นเดียวกันได้ คิดค่าคละลายละ 5 บาท ลายแรกไม่คิด (เช่น คละ 3 ลายในแผ่นเดียว = 10 บาท) ระบบคิดให้อัตโนมัติ ทั้งไดคัท 50% และ 100%";
const fixFaq = (id, d) => {
  const f = d.seo?.faqs?.find((x) => x.q === FAQ_Q);
  if (!f) die(`${id}: ไม่พบ FAQ "${FAQ_Q}"`);
  f.a = FAQ_A;
};

/** งานต่อสินค้า: ชื่อที่คาด + รายการแก้ข้อความ [field path, from, to] */
const JOBS = [
  {
    id: "paper-art-pet",
    expectName: "กระดาษอาร์ตมัน | PET",
    edit(d) {
      const from1 = "• 1 แผ่น A3 ต่อ 1 ลาย — คละลายบวกแผ่นละ 10 บาท (คละได้ไม่เกิน 3-4 ลาย)";
      const to1 = "• 1 แผ่น A3 ต่อ 1 ลาย — คละหลายลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)";
      d.tabs[1].text = swap(this.id, d.tabs[1].text, from1, to1);
      d.terms = swap(
        this.id,
        d.terms,
        "• 1 แผ่น A3 ต่อ 1 ลาย · คละลายบวกแผ่นละ 10 บาท (คละได้ไม่เกิน 3-4 ลาย)",
        "• 1 แผ่น A3 ต่อ 1 ลาย · คละหลายลายในแผ่นเดียวกันได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)"
      );
      // ป้าย "คละลายขั้นต่ำลายละ 1 แผ่น A3" มาจาก minPerDesign — ขัดกับการคละในแผ่น ถอดทั้ง 3 เรท
      for (const r of d.priceRates) {
        delete r.minPerDesign;
        delete r.freeMixBelowQty;
      }
    },
  },
  {
    id: "sticker-uv",
    expectName: "Sticker-uv",
    edit(d) {
      d.terms = swap(
        this.id,
        d.terms,
        "ไดคัท 100% คละลาย: คละได้ไม่เกิน 2-4 ลาย เพิ่ม 20 บาท · คละมากกว่านั้นบวกเพิ่มลายละ 5 บาท (ระบบคิดให้อัตโนมัติ)\nไดคัท 50% คละลาย: ลายละ 20 บาท ต่อ 1 แผ่น A3 หรือ 1 ตร.ม. (คละได้ไม่เกิน 3 ลาย) — แอดมินจะปรับค่าคละให้ตรงตอนตรวจแบบ",
        "คละลายในแผ่นเดียวกัน (1 แผ่น A3 หรือ 1 ตร.ม.): ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ ทั้งไดคัท 50% และ 100%)"
      );
      const tab = d.tabs.find((t) => (t.text || "").includes("ไดคัท 50% คละลาย") || (t.text || "").includes("คละลายในแผ่นเดียวกัน"));
      if (!tab) die(`${this.id}: ไม่พบแท็บที่มีข้อความค่าคละ`);
      tab.text = swap(
        this.id,
        tab.text,
        "• ไดคัท 50% คละลาย: ลายละ 20 บาท ต่อ 1 แผ่น A3 หรือ 1 ตร.ม. (คละได้ไม่เกิน 3 ลาย)\n• ไดคัท 100% คละลาย: คละได้ไม่เกิน 2-4 ลาย เพิ่ม 20 บาท · คละมากกว่านั้นบวกเพิ่มลายละ 5 บาท",
        "• คละลายในแผ่นเดียวกัน (1 แผ่น A3 หรือ 1 ตร.ม.): ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ทั้งไดคัท 50% และ 100%)"
      );
      fixFaq(this.id, d);
    },
  },
  {
    id: "sticker-pp",
    expectName: "สติ๊กเกอร์",
    edit(d) {
      d.terms = swap(
        this.id,
        d.terms,
        "• ไดคัท 50% คละลายใน 1 แผ่น A3 ลายละ 20 บาท/แผ่น (คละได้ไม่เกิน 3 ลายต่อ 1 แผ่น A3)\n• ไดคัท 100% คละได้ไม่เกิน 2-4 ลาย เพิ่ม 20 บาท · คละมากกว่านั้นบวกเพิ่มลายละ 5 บาท",
        "• คละลายใน 1 แผ่น A3: ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ ทั้งไดคัท 50% และ 100%)"
      );
      const tab = d.tabs.find((t) => (t.text || "").includes("ไดคัท 50%: คละลายใน 1 แผ่น A3") || (t.text || "").includes("คละลายใน 1 แผ่น A3: ค่าคละลายละ 5 บาท"));
      if (!tab) die(`${this.id}: ไม่พบแท็บที่มีข้อความค่าคละ`);
      tab.text = swap(
        this.id,
        tab.text,
        "• ไดคัท 50%: คละลายใน 1 แผ่น A3 ลายละ 20 บาท/แผ่น — คละได้ไม่เกิน 3 ลายต่อแผ่น A3\n• ไดคัท 100%: คละได้ไม่เกิน 2-4 ลาย เพิ่ม 20 บาท · คละมากกว่านั้นบวกลายละ 5 บาท (ระบบคิดค่าคละตามเรทไดคัท 50% ไว้ก่อน แอดมินปรับให้ตอนยืนยันแบบ)",
        "• คละลายใน 1 แผ่น A3: ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ ทั้งไดคัท 50% และ 100%)"
      );
      fixFaq(this.id, d);
    },
  },
];

for (const job of JOBS) {
  const { data: rows, error } = await sb.from("products").select("*").eq("id", job.id);
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die(`ไม่พบสินค้า id=${job.id}`);
  if (row.name !== job.expectName) die(`${job.id}: ชื่อไม่ตรงที่คาด (${row.name})`);
  const d = row.data;

  const before = JSON.stringify(d.mixRule);
  if (!d.mixRule) die(`${job.id}: ไม่มี mixRule เดิม — เช็คโครงสร้างก่อน`);
  d.mixRule = { ...MIX_RULE }; // แทนทั้งก้อน — onePerUnitFromQty เดิม (ถ้ามี) หายไปด้วยโดยตั้งใจ
  job.edit(d);
  d.savedAt = new Date().toISOString();

  console.log(`${job.id}: mixRule ${before} → ${JSON.stringify(d.mixRule)}`);
  if (!WRITE) continue;
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", job.id);
  if (e2) die(`${job.id}: ${e2.message}`);
  console.log(`  ✓ เขียนแล้ว`);
}
if (!WRITE) console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");

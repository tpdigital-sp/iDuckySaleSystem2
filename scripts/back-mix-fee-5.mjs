#!/usr/bin/env node
/**
 * 🔄 ค่าคละลาย "ด้านหลัง" = ลายละ 5 บาท (ลายแรกไม่คิด)
 *
 *   node scripts/back-mix-fee-5.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/back-mix-fee-5.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: "ด้านหลังถ้าคละลาย บวกเพิ่มลายละ 5 บาท"
 * → เดิมด้านหลังใช้กติกาชุดเดียวกับด้านหน้า (ดู scripts/paper-back-mix-designs.mjs)
 *   ตอนนี้ตั้งกติกาของด้านหลังเองที่ Product.backDesign.mixRule — ด้านหน้าไม่แตะ
 *
 * { baseFee: 0, includedDesigns: 1, extraFee: 5 } → 1 ลาย = 0 · 2 ลาย = 5 · 4 ลาย = 15
 * (ค่าคละยังคิดต่อ "แผ่น" ตามการเฉลี่ยลายลงแผ่นเหมือนด้านหน้า — ดู mixFeeTotal)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

/** กติกาค่าคละของด้านหลัง — ลายละ 5 บาท ลายแรกไม่คิด */
const BACK_MIX = { baseFee: 0, includedDesigns: 1, extraFee: 5 };

/** บรรทัด terms เดิม (ตอนที่ด้านหลังยังใช้กติกาเดียวกับด้านหน้า) — ถอดทิ้งแล้วเขียนบรรทัดใหม่แทน */
const OLD_TERM =
  "• พิมพ์ 2 ด้าน คละลายด้านหลังได้ด้วย — ใช้เงื่อนไขและค่าคละชุดเดียวกับด้านหน้า คิดแยกอีกชุดหนึ่ง (ด้านหลังใช้ลายเดียวกันทั้งหมด = ไม่มีค่าคละ)";
const NEW_TERM =
  "• พิมพ์ 2 ด้าน คละลายด้านหลังได้ด้วย — คิดค่าคละแยกจากด้านหน้าอีกชุดหนึ่ง ลายละ 5 บาท (ลายแรกไม่คิด · ด้านหลังใช้ลายเดียวกันทั้งหมด = ไม่มีค่าคละ)";

const TARGETS = [
  { id: "photocard-digital", name: "Photo card Digital" },
  { id: "texture-paper", name: "กระดาษ Texture Paper" },
  { id: "paper-art-pet", name: "กระดาษอาร์ตมัน | PET" },
  { id: "package-backing", name: "กระดาษรองหลัง" },
  { id: "poster-a3", name: "POSTER" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

for (const t of TARGETS) {
  const { data: rows, error } = await sb.from("products").select("*").eq("id", t.id);
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die(`ไม่พบสินค้า id=${t.id}`);
  if (row.name !== t.name) die(`${t.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);

  const d = row.data;
  // ต้องตั้งเงื่อนไข "พิมพ์ 2 ด้าน" ไว้ก่อน ไม่งั้นไม่มีด้านหลังให้คิดค่าคละ
  if (!d.backDesign?.label || !d.backDesign?.choices?.length)
    die(`${t.id}: ยังไม่ได้ตั้ง backDesign (รัน scripts/paper-back-mix-designs.mjs ก่อน)`);

  const before = JSON.stringify(d.backDesign.mixRule ?? null);
  d.backDesign = { ...d.backDesign, mixRule: { ...BACK_MIX } };

  const terms = typeof d.terms === "string" ? d.terms : "";
  const hadOld = terms.includes(OLD_TERM);
  let next = hadOld ? terms.replace(OLD_TERM, NEW_TERM) : terms;
  const clean = next.trim() === "." ? "" : next;
  const addTerm = !clean.includes(NEW_TERM);
  d.terms = addTerm ? (clean ? `${clean.replace(/\n+$/, "")}\n${NEW_TERM}` : NEW_TERM) : clean;

  console.log(
    `${WRITE ? "เขียน" : "ดูก่อน"} · ${t.id} (${row.name}) — backDesign.mixRule ${before} → ${JSON.stringify(BACK_MIX)}` +
      ` · terms ${hadOld ? "แทนบรรทัดเดิม" : addTerm ? "+1 บรรทัด" : "มีอยู่แล้ว"}`
  );

  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
    if (e2) die(`${t.id}: ${e2.message}`);
  }
}

console.log(WRITE ? "✓ เขียนครบแล้ว" : "— ยังไม่ได้เขียน (ใส่ --write)");

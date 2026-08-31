#!/usr/bin/env node
/**
 * 🔄 คละลายด้านหลัง — งานกระดาษ 5 ตัวที่พิมพ์ 2 ด้านได้
 *
 *   node scripts/paper-back-mix-designs.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-back-mix-designs.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: "จำนวนการคละลาย ด้านหลังด้วย ให้เงื่อนไขเป็นแบบเดียวกับด้านหน้า"
 * → ตั้ง Product.backDesign ชี้กลุ่ม/ตัวเลือกที่แปลว่า "พิมพ์ 2 ด้าน"
 *   หน้าสินค้าจะขึ้นช่อง "ด้านหลังคละกี่ลาย" อีกช่อง แล้วคิดค่าคละด้วยกติกาชุดเดียวกับ
 *   ด้านหน้า (mixRule เดิมของสินค้า) บวกเพิ่มอีกชุด — ดู backDesignFeeOf ใน src/lib/products.ts
 *
 * ⚠️ Paper Foil (paper-foil) กับ POSTCARD (postcard-th) ยังไม่มีกติกาคละลายของด้านหน้าเลย
 *    ไม่มีอะไรให้ก๊อป — ผู้ใช้สั่งข้ามไปก่อน (31 ส.ค. 69)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

/** ประโยคที่ต่อท้าย terms — เขียนครั้งเดียว (เช็คด้วยข้อความเต็มบรรทัด กันรันซ้ำแล้วซ้อน) */
const TERM_LINE =
  "• พิมพ์ 2 ด้าน คละลายด้านหลังได้ด้วย — ใช้เงื่อนไขและค่าคละชุดเดียวกับด้านหน้า คิดแยกอีกชุดหนึ่ง (ด้านหลังใช้ลายเดียวกันทั้งหมด = ไม่มีค่าคละ)";

const TARGETS = [
  { id: "photocard-digital", name: "Photo card Digital", label: "พิมพ์กี่ด้าน" },
  { id: "texture-paper", name: "กระดาษ Texture Paper", label: "จำนวนด้านที่พิมพ์" },
  { id: "paper-art-pet", name: "กระดาษอาร์ตมัน | PET", label: "จำนวนด้านที่พิมพ์" },
  { id: "package-backing", name: "กระดาษรองหลัง", label: "จำนวนด้านที่พิมพ์" },
  { id: "poster-a3", name: "POSTER", label: "จำนวนด้านที่พิมพ์" },
];
const CHOICE = "พิมพ์ 2 ด้าน";

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
  // กลุ่ม "พิมพ์กี่ด้าน" ต้องมีอยู่จริงและมีตัวเลือกนั้นจริง ไม่งั้นเงื่อนไขจะไม่มีวันเข้า (ช่องไม่เคยโผล่)
  const g = (d.options ?? []).find((o) => o.label === t.label);
  if (!g) die(`${t.id}: ไม่มีกลุ่ม "${t.label}"`);
  if (!(g.choices ?? []).some((c) => c.name === CHOICE)) die(`${t.id}: กลุ่ม "${t.label}" ไม่มีตัวเลือก "${CHOICE}"`);
  // ต้องมีกติกาคละของด้านหน้าอยู่ก่อน — ไม่มีก็ไม่มีอะไรให้ก๊อปไปด้านหลัง
  if (!d.mixRule?.tiers?.length && !d.mixRule?.extraFee) die(`${t.id}: ยังไม่มี mixRule (กติกาคละลายด้านหน้า)`);

  const before = JSON.stringify(d.backDesign ?? null);
  d.backDesign = { label: t.label, choices: [CHOICE] };

  const terms = typeof d.terms === "string" ? d.terms : "";
  const clean = terms.trim() === "." ? "" : terms;
  const addTerm = !clean.includes(TERM_LINE);
  if (addTerm) d.terms = clean ? `${clean.replace(/\n+$/, "")}\n${TERM_LINE}` : TERM_LINE;

  console.log(
    `${WRITE ? "เขียน" : "ดูก่อน"} · ${t.id} (${row.name}) — backDesign ${before} → ${JSON.stringify(d.backDesign)}` +
      (addTerm ? " · +1 บรรทัด terms" : " · terms มีอยู่แล้ว")
  );

  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
    if (e2) die(`${t.id}: ${e2.message}`);
  }
}

console.log(WRITE ? "✓ เขียนครบแล้ว" : "— ยังไม่ได้เขียน (ใส่ --write)");

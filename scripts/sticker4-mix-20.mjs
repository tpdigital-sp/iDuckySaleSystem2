#!/usr/bin/env node
/**
 * ค่าคละลาย "ลายละ 20 บาท ลายแรกไม่คิด" — สติ๊กเกอร์ 4 ตัวที่ยกสไลซ์ไดคัท 50% มาทั้งใบ (ผู้ใช้สั่ง 1 ก.ย. 69)
 *   SHAPE STICKER · CARD STICKER · GIVEAWAY STICKER · PHOTO BOOTH (สติ๊กเกอร์)
 *   ทั้ง 4 ตัวเป็นงานไดคัท 50% ล้วน (ไม่มีตัวเลือกไดคัท 100%) จึงตั้งที่ mixRule ระดับสินค้าได้เลย
 *   ตอนสร้างยกกติกา ลายละ 5 มาจากสติ๊กเกอร์ Digital ซึ่งเป็นเรทของไดคัท 100% → ต้องเป็น 20 ตามกติกา 26 ส.ค. 69
 *
 *   node scripts/sticker4-mix-20.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker4-mix-20.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const FEE = 20;
const MIX = { baseFee: FEE, includedDesigns: 2, extraFee: FEE, tiers: [{ fromQty: 1, baseFee: FEE, includedDesigns: 2, extraFee: FEE }] };

const JOBS = [
  { id: "new-mti1vffx-1253", expectName: "SHAPE STICKER" },
  { id: "new-mti1whnn-5683", expectName: "CARD STICKER" },
  { id: "new-mti1vpmh-5692", expectName: "GIVEAWAY STICKER" },
  { id: "new-mti1w47u-7312", expectName: "PHOTO BOOTH" },
];

/**
 * ข้อความ: แทนทุกที่ (terms + ทุกแท็บ + FAQ + จุดเด่น) · เจอแบบใหม่อยู่แล้ว = รันซ้ำได้
 * required = ไม่เจอทั้งแบบเก่าและใหม่ → หยุด (โครงข้อความเปลี่ยน กันแทนผิดที่)
 * ส่วน "ลายละ 5 บาท" ในจุดเด่นมีแค่ PHOTO BOOTH ตัวเดียว จึงไม่บังคับ
 */
const SWAPS = [
  { from: "ค่าคละลายละ 5 บาท", to: "ค่าคละลายละ 20 บาท", required: true },
  { from: "คละลายในแผ่นเดียวกันได้ ลายละ 5 บาท", to: "คละลายในแผ่นเดียวกันได้ ลายละ 20 บาท", required: false },
];

const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

function applySwaps(id, d) {
  for (const { from, to, required } of SWAPS) {
    let hit = false;
    const sub = (t) => {
      if (!t) return t;
      if (t.includes(to)) { hit = true; return t; }
      if (!t.includes(from)) return t;
      hit = true;
      return t.replaceAll(from, to);
    };
    d.terms = sub(d.terms);
    for (const tab of d.tabs ?? []) tab.text = sub(tab.text);
    for (const f of d.seo?.faqs ?? []) { f.q = sub(f.q); f.a = sub(f.a); }
    d.highlights = (d.highlights ?? []).map(sub);
    if (required && !hit) die(`${id}: ไม่พบข้อความ "${from}" (ทั้งแบบเก่าและแบบใหม่)`);
  }
}

for (const job of JOBS) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", job.id).maybeSingle();
  if (error) die(`${job.id}: ${error.message}`);
  if (!row) die(`${job.id}: ไม่พบสินค้า`);
  if (!row.name.includes(job.expectName)) die(`${job.id}: ชื่อไม่ตรงที่คาด (${row.name})`);
  const d = structuredClone(row.data ?? {});

  // กันพลาด: ถ้ามีตัวเลือก/เรทตั้ง mixRule เองอยู่ กติการะดับสินค้าจะไม่มีผล ต้องรู้ตัวก่อน
  const own = [
    ...(d.options ?? []).flatMap((g) => (g.choices ?? []).filter((c) => c.mixRule).map((c) => `${g.label}/${c.name}`)),
    ...(d.priceRates ?? []).filter((r) => r.mixRule).map((r) => `เรท ${r.name}`),
  ];
  if (own.length) die(`${job.id}: มี mixRule ระดับตัวเลือก/เรทอยู่แล้ว (${own.join(", ")}) — ต้องแก้ตรงนั้นแทน`);

  d.mixRule = structuredClone(MIX);
  applySwaps(job.id, d);

  console.log(`${WRITE ? "✔" : "•"} ${row.name} — คละลายละ ${FEE} บาท`);
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", job.id);
    if (e2) die(`${job.id}: ${e2.message}`);
  }
}
console.log(WRITE ? "\nเขียนแล้ว" : "\n(ยังไม่เขียน — ใส่ --write)");

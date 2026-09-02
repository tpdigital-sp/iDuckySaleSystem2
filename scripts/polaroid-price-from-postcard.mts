#!/usr/bin/env npx tsx
/**
 * POLAROID / โพลารอยด์ — ยกราคาต่อชนิดกระดาษมาจาก POSTCARD / โปสการ์ด ให้เท่ากันเป๊ะ
 *
 *   npx tsx scripts/polaroid-price-from-postcard.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/polaroid-price-from-postcard.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (2 ก.ย. 69): "ราคากระดาษแต่ละชนิดเท่ากันสินค้า POSTCARD / โปสการ์ด"
 * ตอนสร้าง POLAROID เคยยกตารางโปสการ์ดมาแล้วรอบหนึ่ง แต่หลังจากนั้นโปสการ์ดย้ายฐานราคา
 * กระดาษผิวพิเศษไปอิง texture-paper (ดู scripts/postcard-special-papers-from-texture.mts)
 * ตารางสองตัวจึงหลุดจากกัน — สคริปต์นี้อ่านโปสการ์ดสดทุกครั้งแล้วก๊อปทับ รันซ้ำได้เมื่อโปสการ์ดขยับอีก
 *
 * พร้อมกันนั้นถอด "กระดาษอาร์ตเกาหลี 300 แกรม" ออก (ผู้ใช้ตอบ: ลบทิ้ง) — เป็นชื่อซ้ำของ
 * อาร์ตมัน 300 (อาร์ตมันของร้าน = อาร์ตมันนำเข้าจากเกาหลี) และโปสการ์ดก็ถอดชื่อนี้ไปแล้ว
 * เหลือกระดาษ 8 ชนิด · ถอดตัวเลือกต้องเก็บกวาดทั้ง ตัวเลือก / ช่องราคา / กฎ / ข้อความที่นับจำนวน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1wu6o-1002";
const SRC = "postcard-th";
const DROP = "กระดาษอาร์ตเกาหลี 300 แกรม";
const PAPER = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
/** ชื่อกระดาษที่สองสินค้าเรียกไม่ตรงกัน — โพลารอยด์ → โปสการ์ด (ตอนนี้ตรงกันหมด เผื่อไว้เวลาเปลี่ยนชื่อข้างเดียว) */
const ALIAS: Record<string, string> = {};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const grab = async (id: string) => {
  const { data, error } = await sb.from("products").select("name,data").eq("id", id).single();
  if (error) throw error;
  return data as { name: string; data: any };
};

const me = await grab(ID);
const src = await grab(SRC);
if (!/POLAROID|โพลารอยด์/i.test(me.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${me.name}" — หยุดไว้ก่อน`);
if (!/POSTCARD|โปสการ์ด/i.test(src.name)) throw new Error(`id ${SRC} เป็นสินค้าอื่น: "${src.name}" — หยุดไว้ก่อน`);

const d: any = structuredClone(me.data);
const s: any = src.data;

// แกนตารางต้องเป็นคู่เดียวกันทั้งสองตัว ไม่งั้นก๊อปช่องข้ามกันไม่ได้ (ดู memory: price driver trap)
const axes = (p: any) => JSON.stringify(p.pricing?.driverLabels);
if (axes(d) !== axes(s)) throw new Error(`แกนตารางไม่ตรงกัน: ${axes(d)} vs ${axes(s)} — มาดูเองก่อน`);
const tiersOf = (p: any) => JSON.stringify(p.pricing.tiers);
if (tiersOf(d) !== tiersOf(s)) throw new Error("ขั้นจำนวนไม่ตรงกัน — ก๊อปราคาข้ามไม่ได้ มาดูเองก่อน");

const group = (d.options ?? []).find((o: any) => o.label === PAPER);
if (!group) throw new Error(`ไม่เจอกลุ่ม "${PAPER}"`);
const coats: string[] = (d.options ?? []).find((o: any) => o.label === COAT).choices.map((c: any) => c.name);

// ── 1. ถอดกระดาษชื่อซ้ำ ────────────────────────────────────────────────────
const dropped = group.choices.some((c: any) => c.name === DROP);
group.choices = group.choices.filter((c: any) => c.name !== DROP);
for (const k of Object.keys(d.pricing.cells)) if (k.startsWith(`${DROP}│`)) delete d.pricing.cells[k];
for (const r of d.rules ?? []) {
  const list: string[] = r.when.choices ?? [r.when.choice];
  if (!list.includes(DROP)) continue;
  const kept = list.filter((n) => n !== DROP);
  if (!kept.length) throw new Error(`กฎ "${r.when.label} → ${r.limit.label}" เหลือเงื่อนไขว่างหลังถอด — มาดูเองก่อน`);
  r.when.choices = kept;
  r.when.choice = kept[0];
}
const papers: string[] = group.choices.map((c: any) => c.name);

// ── 2. ก๊อปราคาทุกช่องจากโปสการ์ด ──────────────────────────────────────────
const changes: string[] = [];
for (const paper of papers) {
  for (const coat of coats) {
    const key = `${paper}│${coat}`;
    const want = s.pricing.cells[`${ALIAS[paper] ?? paper}│${coat}`];
    if (!want) throw new Error(`โปสการ์ดไม่มีช่อง "${ALIAS[paper] ?? paper}│${coat}" — ชื่อกระดาษไม่ตรงกัน มาดูเองก่อน`);
    const had = d.pricing.cells[key];
    if (JSON.stringify(had) !== JSON.stringify(want))
      changes.push(`${key}: ${JSON.stringify(had ?? "(ว่าง)")} → ${JSON.stringify(want)}`);
    d.pricing.cells[key] = [...want];
  }
}
for (const k of Object.keys(d.pricing.cells))
  if (!papers.some((p) => k.startsWith(`${p}│`))) throw new Error(`เหลือช่องราคาส่วนเกิน "${k}" — มาดูเองก่อน`);

// ── 3. ตัวเลขที่โผล่ในข้อความ ──────────────────────────────────────────────
const plain = (paper: string) => d.pricing.cells[`${paper}│ไม่เคลือบ`] as number[];
const cheapest = papers.reduce((a, b) => (plain(a)[0] <= plain(b)[0] ? a : b));
const [t1, t2] = plain(cheapest);
const all = Object.values(d.pricing.cells).flat() as number[];
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

const n = papers.length;
d.description = d.description
  .replace(/เลือกเนื้อกระดาษได้ \d+ ชนิด/, `เลือกเนื้อกระดาษได้ ${n} ชนิด`)
  .replace(/ตั้งแต่อาร์ตเกาหลี 300 แกรม · อาร์ตมัน/, "ตั้งแต่อาร์ตมัน");
d.highlights = d.highlights.map((h: string) =>
  /^เริ่ม /.test(h)
    ? `เริ่ม ${t1} บาท/แผ่น A3 — สั่ง 11-49 แผ่น A3 เหลือแผ่นละ ${t2} บาท`
    : h.replace(/กระดาษให้เลือก \d+ ชนิด/, `กระดาษให้เลือก ${n} ชนิด`)
);
d.seo = {
  ...d.seo,
  description: d.seo.description
    .replace(/เลือกกระดาษได้ \d+ ชนิด/, `เลือกกระดาษได้ ${n} ชนิด`)
    .replace(/เริ่ม \d+ บาท/, `เริ่ม ${t1} บาท`),
  faqs: d.seo.faqs.map((f: any) =>
    /คิดราคายังไง/.test(f.q)
      ? { ...f, a: `คิดเป็นแผ่น A3 — 1 แผ่น A3 ตัดได้ 12 ใบ ขนาด 10 × 8.5 ซม. เริ่มแผ่นละ ${t1} บาท (${cheapest}) · สั่ง 11-49 แผ่น A3 เหลือแผ่นละ ${t2} บาท` }
      : /กระดาษอะไรให้เลือก/.test(f.q)
        ? { ...f, a: `เลือกได้ ${n} ชนิด: ${papers.join(" · ")}` }
        : f
  ),
};
// แท็บ "รายละเอียดงานพิมพ์" มีลิสต์ราคาเริ่มต้นต่อชนิดกระดาษ — เขียนบล็อกนั้นใหม่จากตารางจริง
const tab = d.tabs.find((t: any) => /ชนิดกระดาษ::/.test(t.text ?? ""));
if (!tab) throw new Error('ไม่เจอบล็อก "::ชนิดกระดาษ::" ในแท็บ — โครงเปลี่ยน มาดูเองก่อน');
tab.text = tab.text.replace(
  /(::ชนิดกระดาษ::\n)(?:•[^\n]*\n)+/,
  (_m: string, head: string) => head + papers.map((p) => `• ${p} — ${plain(p)[0]} บาท/แผ่น A3 (1-10 แผ่น A3)\n`).join("")
);

console.log(`ถอด "${DROP}": ${dropped ? "ใช่" : "(ไม่มีอยู่แล้ว)"} · เหลือกระดาษ ${n} ชนิด`);
console.log("   " + papers.join(" · "));
console.log(`\nช่องราคาที่เปลี่ยน ${changes.length}/${papers.length * coats.length}:`);
for (const c of changes) console.log("   " + c);
console.log(`\nราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} · ถูกสุด ${cheapest} ${t1}/${t2} บาท`);
console.log(`highlights: ${d.highlights.join(" | ")}`);
console.log(`seo.description: ${d.seo.description}`);
console.log(`tab ชนิดกระดาษ:\n${tab.text.match(/::ชนิดกระดาษ::\n(?:•[^\n]*\n)+/)[0]}`);

if (!WRITE) {
  console.log("(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const back = await grab(ID);
const b: any = back.data;
const bp: string[] = b.options.find((o: any) => o.label === PAPER).choices.map((c: any) => c.name);
const mismatch = bp.flatMap((p) =>
  coats
    .filter((c) => JSON.stringify(b.pricing.cells[`${p}│${c}`]) !== JSON.stringify(s.pricing.cells[`${ALIAS[p] ?? p}│${c}`]))
    .map((c) => `${p}│${c}`)
);
const checks: [string, unknown, unknown][] = [
  ["จำนวนชนิดกระดาษ", bp.length, n],
  ["ไม่มีชื่อซ้ำในตัวเลือก", bp.includes(DROP), false],
  ["ไม่มีชื่อซ้ำในตารางราคา", Object.keys(b.pricing.cells).some((k) => k.startsWith(`${DROP}│`)), false],
  ["ไม่มีชื่อซ้ำในกฎ", (b.rules ?? []).some((r: any) => (r.when.choices ?? [r.when.choice]).includes(DROP)), false],
  ["ช่องราคาครบ", Object.keys(b.pricing.cells).length, n * coats.length],
  ["ทุกช่องเท่าโปสการ์ด", mismatch.join(",") || "ครบ", "ครบ"],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ราคาทุกชนิดกระดาษเท่าโปสการ์ด · ${d.priceMin}–${d.priceMax} บาท/แผ่น A3`);

#!/usr/bin/env node
/**
 * ป้ายแขวนประตู (id="mdf") — กติกาคละลายให้เหมือนกันทั้ง 3 เรท (ผู้ใช้สั่ง 27 ส.ค. 69)
 *
 *   MDF (r1) / อะคริลิค (r2) / กระดาษ|PET (r3 ชุดละ 3 ชิ้น)
 *     • 1-10 (ชิ้น/เซ็ต) คละลายได้อิสระ          → freeMixBelowQty 11
 *     • 11 ขึ้นไป 1 ลายต้องสั่ง 5                → minPerDesign 5
 *     • เกินโควตา ลายละ 5 บาท                    → extraDesignFee 5
 *
 * r1 (MDF) เดิมบล็อกตันที่โควตา → เติม extraDesignFee 5
 * r3 (กระดาษ|PET) ขายเป็นเซ็ต เซ็ตละ 3 ชิ้น = **ลายเดียว** → โควตา = จำนวนเซ็ตทุกช่วงจำนวน
 *   minPerDesign 1 (ไม่มี freeMixBelowQty) — สั่ง 1 เซ็ตคละได้ 1 ลาย · 11 เซ็ตคละได้ 11 ลาย
 *   คละเกินนั้นได้ จ่ายลายละ 5 บาท เพดาน = จำนวนชิ้น (1 เซ็ตคละ 3 ลาย = +10)
 *   ⚠️ ห้ามใส่ minPerDesign 5 ให้เรทนี้ — จะกลายเป็น 11 เซ็ตเหลือ 2 ลาย (ผู้ใช้ทักว่าผิด 27 ส.ค. 69)
 * + แก้ข้อความแท็บ/FAQ + หน่วยของเรทกระดาษ อัน → เซ็ต ให้ตรงกับตารางที่เขียนว่าเซ็ต
 *
 *   node scripts/door-hanger-mix-mdf.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/door-hanger-mix-mdf.mjs --write   # บันทึกจริง (รันซ้ำได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mdf";
const MIX = { freeMixBelowQty: 11, minPerDesign: 5, extraDesignFee: 5 };

const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};

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

/* ── อ่านของสด ────────────────────────────────────────────────────────────── */
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = structuredClone(row.data);

const rates = d.priceRates ?? [];
if (rates.length !== 3) die(`โครงเรทเปลี่ยน: เจอ ${rates.length} เรท (คาด 3)`);
if (d.mixRule) die("สินค้ามี mixRule ระดับสินค้า — extraDesignFee จะไม่ถูกใช้ ต้องดูก่อน");
if (d.tierByDesign) die("สินค้ามี tierByDesign — เพดานลายจะไม่ตามกติกานี้ ต้องดูก่อน");
if (d.hardMaxDesigns) die("สินค้ามี hardMaxDesigns — คละเกินโควตาจะถูกบล็อก ต้องถอดก่อน");

/* ── 1) กติกาคละลายทั้ง 3 เรท ─────────────────────────────────────────────── */
const changes = [];
for (const r of rates) {
  if (/กระดาษ/.test(r.label)) continue; // เรทเซ็ต ตั้งแยกด้านล่าง
  for (const [k, v] of Object.entries(MIX)) {
    if (r[k] !== v) {
      changes.push(`${r.id} (${r.label}): ${k} ${r[k] ?? "—"} → ${v}`);
      r[k] = v;
    }
  }
}

/* ── 1.5) กระดาษ|PET ขายเป็นเซ็ต: 1 เซ็ต (3 ชิ้น) = 1 ลาย ทุกช่วงจำนวน ────── */
const paper = rates.find((r) => /กระดาษ/.test(r.label));
if (!paper) die("ไม่พบเรทกระดาษ|PET");
// โควตาลาย = จำนวนเซ็ตเสมอ → minPerDesign 1 และไม่ต้องมีช่วงคละอิสระ (ช่วงปลีกได้ผลเท่ากันอยู่แล้ว)
if (paper.minPerDesign !== 1) {
  changes.push(`${paper.id} (${paper.label}): minPerDesign ${paper.minPerDesign} → 1 (เซ็ตละ 1 ลาย)`);
  paper.minPerDesign = 1;
}
for (const k of ["freeMixBelowQty", "freeMixByUnit"]) {
  if (paper[k] !== undefined) {
    changes.push(`${paper.id}: ถอด ${k} (${paper[k]}) — โควตาเท่าจำนวนเซ็ตทุกช่วงแล้ว`);
    delete paper[k];
  }
}
// หน่วยของเรทนี้เขียนว่า "อัน" แต่ขายเป็นเซ็ต (ตารางขั้นราคาก็เขียน "เซ็ต") — ให้ตรงกัน
if (paper.pricing?.unit !== "เซ็ต") {
  changes.push(`${paper.id}: หน่วย "${paper.pricing?.unit}" → "เซ็ต"`);
  paper.pricing.unit = "เซ็ต";
}

/* ── 2) ข้อความแท็บ + FAQ ให้ตรงกติกา ─────────────────────────────────────── */
const setText = (label, from, to) => {
  if (!from.test(label.text)) return;
  const next = label.text.replace(from, to);
  if (next !== label.text) {
    changes.push(`ข้อความ: …${to.slice(0, 60)}…`);
    label.text = next;
  }
};
const tab = (d.tabs ?? [])[0];
if (!tab?.text) die("ไม่พบแท็บรายละเอียด");
setText(
  tab,
  /11 อันขึ้นไปคละลายขั้นต่ำลายละ 5 อัน/,
  "11 อันขึ้นไปคละได้ลายละ 5 อัน เกินโควตาบวกเพิ่มลายละ 5 บาท"
);
// กระดาษ/PET: 1 เซ็ต (3 ชิ้น) = 1 ลาย — เขียนบรรทัดนี้ใหม่ทั้งบรรทัด (ผู้ใช้ยืนยัน 27 ส.ค. 69)
const PAPER_MIX_LINE =
  "• กระดาษ/PET: ขายเป็นเซ็ต 1 เซ็ต = 3 ชิ้น ลายเดียวกัน · คละได้เซ็ตละ 1 ลาย ทุกช่วงจำนวน " +
  "(สั่ง 1 เซ็ต = 1 ลาย · 11 เซ็ต = 11 ลาย) · อยากคละมากกว่านั้นบวกเพิ่มลายละ 5 บาท (สูงสุดเท่าจำนวนชิ้น)";
setText(tab, /^• กระดาษ\/PET: 1-10 เซ็ตคละลายอิสระ.*$/m, PAPER_MIX_LINE);
setText(tab, /^• กระดาษ\/PET: ขายเป็นเซ็ต.*$/m, PAPER_MIX_LINE);
setText(tab, /^• กระดาษ\/PET: ขายเป็นเซ็ต 1 เซ็ต = 3 ชิ้น ลายเดียวกัน · คละได้เซ็ตละ 1 ลาย \(สั่ง.*$/m, PAPER_MIX_LINE);

const faq = (d.seo?.faqs ?? []).find((f) => /คละลาย/.test(f.q ?? ""));
if (faq) {
  const a =
    "MDF และอะคริลิค: 1-10 ชิ้นคละลายได้อิสระ · 11 ชิ้นขึ้นไปคละได้ลายละ 5 ชิ้น เกินโควตาบวกเพิ่มลายละ 5 บาท · กระดาษ/PET ขายเป็นเซ็ต (1 เซ็ต = 3 ชิ้นลายเดียวกัน) คละได้เซ็ตละ 1 ลายทุกช่วงจำนวน สั่ง 11 เซ็ตคละได้ 11 ลาย อยากคละมากกว่านั้นลายละ 5 บาท";
  if (faq.a !== a) {
    changes.push("FAQ คละลาย → " + a);
    faq.a = a;
  }
}

/* ── 3) จำลองกฎก่อนเขียน ──────────────────────────────────────────────────── */
const isFreeMix = (r, qty) => !!r.freeMixBelowQty && qty < r.freeMixBelowQty;
const included = (r, qty, perUnit) =>
  isFreeMix(r, qty) ? qty * perUnit : Math.max(1, Math.floor(qty / r.minPerDesign));
const maxDesigns = (r, qty, perUnit) =>
  isFreeMix(r, qty) || r.extraDesignFee ? qty * perUnit : included(r, qty, perUnit);
const fee = (r, qty, designs, perUnit) =>
  Math.max(0, designs - included(r, qty, perUnit)) * (r.extraDesignFee ?? 0);

console.log("\n🧪 จำลองกติกาคละลาย");
for (const [r, perUnit, unit] of [
  [rates[0], 1, "อัน"],
  [rates[1], 1, "ชิ้น"],
  [rates[2], 3, "เซ็ต"],
]) {
  console.log(`\n— ${r.label}`);
  for (const [qty, designs] of [
    [1, 1],
    [1, 3],
    [10, 10],
    [10, 12],
    [11, 2],
    [11, 5],
    [30, 6],
    [30, 10],
  ]) {
    const cap = maxDesigns(r, qty, perUnit);
    console.log(
      `   ${String(qty).padStart(3)} ${unit} × ${String(designs).padStart(2)} ลาย → ` +
        `ในราคา ${included(r, qty, perUnit)} ลาย · เพดาน ${cap} ลาย · ค่าคละ ฿${fee(r, qty, designs, perUnit)}`
    );
  }
}

/* ── 4) เขียน ─────────────────────────────────────────────────────────────── */
console.log("\n📋 สิ่งที่เปลี่ยน:");
if (!changes.length) console.log("   (ไม่มี — ตรงตามกติกาอยู่แล้ว)");
for (const c of changes) console.log("   • " + c);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
if (!changes.length) process.exit(0);

d.pricing = rates[0].pricing; // ราคาระดับสินค้า = ตารางเรทแรกเสมอ
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) die(upErr.message);

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
console.log("\n✅ บันทึกแล้ว — อ่านกลับ:");
for (const r of back.data.priceRates)
  console.log(
    `   ${r.id} ${r.label}: คละอิสระ <${r.freeMixBelowQty ?? "—"} · ลายละ ${r.minPerDesign} · เกินลายละ ฿${r.extraDesignFee}`
  );

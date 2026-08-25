/**
 * แยกค่ากระดาษพิเศษออกจากค่าพิมพ์รองสีขาว (ร้านสั่ง 25 ส.ค. 69)
 * Ultra-Hard CardBoard + Card Broad Foam
 *
 *   npx tsx scripts/paper-fee-split.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/paper-fee-split.mts --write  # บันทึกลง Supabase
 *
 * เดิม: กระดาษพิเศษฟรี · พิมพ์รองสีขาว +60 (= ค่าหมึกขาว 20 + ค่ากระดาษ 40)
 * ใหม่: กระดาษพิเศษ 6 เนื้อ (โฮโลแกรม/เงิน/ทอง) +40 ที่ตัวเลือกชนิดกระดาษ · พิมพ์รองสีขาว +20 (ค่าหมึกขาว)
 * ทั้งคู่คิดต่อแผ่น A3 ปัดขึ้นเต็มแผ่นเหมือนเดิม (sheetFee from ขนาด)
 * เลือกกระดาษพิเศษ + รองสีขาว = 40+20 = 60 เท่าราคารวมเดิม — ช่วงราคาสินค้าไม่เปลี่ยน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const IDS = ["ultra-hard-cardboard-2-mm", "card-broad-foam-2-mm"];

const PAPER = "ชนิดกระดาษ";
const WHITE = "พิมพ์รองสีขาว";
const ART = "กระดาษอาร์ต 300 แกรม"; // กระดาษมาตรฐาน — ไม่บวก
const PAPER_FEE = 40;
const WHITE_FEE = 20;

// ข้อความในแท็บที่ต้องตามแก้ (เหมือนกันทั้ง 2 สินค้า) — terms ตอนนี้ยังเป็น "." จึงไม่มีให้แก้
const TEXT_SWAPS: [string, string][] = [
  [
    "เนื้อพิเศษ (Texture Paper) อีก 6 เนื้อ — ไม่คิดค่ากระดาษเพิ่ม",
    "เนื้อพิเศษ (Texture Paper) อีก 6 เนื้อ — คิดค่ากระดาษเพิ่ม 40 บาท ต่อ 1 แผ่น A3",
  ],
  [
    "• พิมพ์รองสีขาว (เฉพาะกระดาษโฮโลแกรม/เงิน/ทอง) +60 บาท ต่อ 1 แผ่น A3 = ค่าหมึกขาว 20 + ค่ากระดาษ 40",
    "• พิมพ์รองสีขาว (เฉพาะกระดาษโฮโลแกรม/เงิน/ทอง) +20 บาท ต่อ 1 แผ่น A3 (ค่าหมึกขาว)",
  ],
];

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

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !row) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  const d = row.data as Product;
  console.log(`\n===== ${id} — ${d.name} =====`);

  // ── 1. กระดาษพิเศษ +40 ต่อแผ่น A3 ────────────────────────────────────────
  const paper = d.options.find((o) => o.label === PAPER);
  if (!paper) throw new Error(`${id}: ไม่เจอกลุ่ม "${PAPER}"`);
  paper.sheetFee = { from: "ขนาด", unit: "แผ่น A3" }; // คิดต่อแผ่นแบบเดียวกับเคลือบ/รองสีขาว
  for (const c of paper.choices) {
    if (c.name === ART) continue;
    if (c.extra !== undefined && c.extra !== PAPER_FEE)
      throw new Error(`${id}: "${c.name}" มีราคา +${c.extra} อยู่แล้ว — ข้อมูลเปลี่ยนไปแล้ว ตรวจก่อนรันทับ`);
    c.extra = PAPER_FEE;
  }

  // ── 2. พิมพ์รองสีขาว 60 → 20 (เหลือค่าหมึกขาว) ──────────────────────────
  const white = d.options.find((o) => o.label === WHITE);
  if (!white) throw new Error(`${id}: ไม่เจอกลุ่ม "${WHITE}"`);
  const on = white.choices.find((c) => c.name === WHITE);
  if (!on) throw new Error(`${id}: ไม่เจอตัวเลือก "${WHITE}"`);
  if (on.extra !== 60 && on.extra !== WHITE_FEE)
    throw new Error(`${id}: รองสีขาวราคา +${on.extra} ไม่ตรงที่คาด`);
  on.extra = WHITE_FEE;

  // ── 3. ข้อความในแท็บให้ตรงราคาใหม่ ───────────────────────────────────────
  for (const [from, to] of TEXT_SWAPS) {
    let hits = 0;
    if (d.terms?.includes(from)) {
      d.terms = d.terms.split(from).join(to);
      hits++;
    }
    for (const t of d.tabs ?? [])
      if (t.text?.includes(from)) {
        t.text = t.text.split(from).join(to);
        hits++;
      }
    if (hits === 0 && !(d.terms ?? "").includes(to) && !(d.tabs ?? []).some((t) => t.text?.includes(to)))
      throw new Error(`${id}: หาข้อความเดิมไม่เจอ: "${from.slice(0, 50)}…"`);
    console.log(`ข้อความ (${hits} จุด): ${to}`);
  }

  console.log(`${PAPER}: ` + paper.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | "));
  console.log(`${WHITE}: ` + white.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | "));

  if (!WRITE) continue;
  const saved: Product = { ...d, savedAt: new Date().toISOString() };
  const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", id);
  if (upErr) throw new Error(`${id}: ${upErr.message}`);
  console.log("✓ บันทึกแล้ว");
}
if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");

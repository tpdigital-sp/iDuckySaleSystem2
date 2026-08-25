/**
 * การ์ดบอร์ด 2 ตัว — แยกค่ากระดาษพิเศษออกจากค่ารองขาว + เปลี่ยนชื่อกลุ่มเป็น "รองขาว" (ร้านสั่ง 25 ส.ค. 69)
 *
 *   npx tsx scripts/paper-fee-split-white-base.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/paper-fee-split-white-base.mts --write  # บันทึกลง Supabase
 *
 * สินค้า: card-broad-foam-2-mm · ultra-hard-cardboard-2-mm
 * โครงราคาใหม่ (ส่วนตัวเลขถูกใส่ไว้แล้วจากรอบ 03:29Z วันเดียวกัน — สคริปต์นี้ยืนยัน + เก็บส่วนที่เหลือ):
 *   1. ชนิดกระดาษ: ตัวที่ไม่ใช่กระดาษอาร์ต 300 แกรม (6 ตัว) ค่ากระดาษ +40 ต่อ 1 แผ่น A3
 *      ปัดขึ้นเต็มแผ่น (sheetFee ที่กลุ่ม — กลไกเดียวกับค่าเคลือบ)
 *   2. กลุ่ม "พิมพ์รองสีขาว" เปลี่ยนชื่อเป็น "รองขาว": ไม่รองขาว (ฟรี) / รองขาว +20 (ค่าหมึกขาวอย่างเดียว)
 *      เงื่อนไขเดิมคงไว้ — โชว์เฉพาะตอนเลือกกระดาษพิเศษ · คิดต่อแผ่น A3
 *   3. ไล่แก้ข้อความ terms/แท็บ/FAQ ที่ยังพูดราคาชุดเก่า (รองสีขาว 60 รวมค่ากระดาษ · เนื้อพิเศษฟรี)
 *      แล้วสแกนกันเลขเก่า/ชื่อเก่าตกค้าง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const IDS = ["card-broad-foam-2-mm", "ultra-hard-cardboard-2-mm"];

const PAPER_GROUP = "ชนิดกระดาษ";
const ART = "กระดาษอาร์ต 300 แกรม";
const SPECIALS = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีเงิน ผิวด้าน (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวด้าน (250 แกรม)",
];
const PAPER_FEE = 40;

const OLD_GROUP = "พิมพ์รองสีขาว";
const NEW_GROUP = "รองขาว";
const OLD_NO = "ไม่พิมพ์รองสีขาว";
const NEW_NO = "ไม่รองขาว";
const OLD_YES = "พิมพ์รองสีขาว";
const NEW_YES = "รองขาว";
const WHITE_FEE = 20;

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

/** ไล่เขียนข้อความให้ตรงราคาชุดใหม่ + ชื่อกลุ่มใหม่ — ประโยคเดิมของทั้งสองสินค้าเหมือนกัน */
const retext = (s: unknown) =>
  typeof s !== "string"
    ? (s as string)
    : s
        // terms: เนื้อพิเศษเคยบอกว่าฟรี → คิดค่ากระดาษ 40/แผ่น
        .replace(
          /เลือกเปลี่ยนเป็นเนื้อพิเศษได้อีก 6 เนื้อ \(Texture Paper\) โดยไม่คิดค่ากระดาษเพิ่ม/g,
          `เลือกเปลี่ยนเป็นเนื้อพิเศษได้อีก 6 เนื้อ (Texture Paper) คิดค่ากระดาษเพิ่ม ${PAPER_FEE} บาทต่อแผ่น A3 (ปัดขึ้นเต็มแผ่นแบบเดียวกับงานเคลือบ)`
        )
        // terms: รองสีขาวราคาเหมาเก่า 60 (รวมค่ากระดาษ) → รองขาว 20 เฉพาะหมึกขาว
        .replace(
          /อยากให้สีเด่นต้องเลือก "พิมพ์รองสีขาว" — คิดเพิ่ม 60 บาทต่อแผ่น A3 \(ค่าหมึกขาว 20 \+ ค่ากระดาษ 40\) ปัดขึ้นเต็มแผ่นแบบเดียวกับงานเคลือบ/g,
          `อยากให้สีเด่นต้องเลือก "${NEW_YES}" — คิดเพิ่ม ${WHITE_FEE} บาทต่อแผ่น A3 (ค่าหมึกขาว — ค่ากระดาษเนื้อพิเศษแยกคิดที่ชนิดกระดาษแล้ว) ปัดขึ้นเต็มแผ่นแบบเดียวกับงานเคลือบ`
        )
        // แท็บ: บรรทัดรองขาว +20 ใช้ชื่อกลุ่มใหม่
        .replace(
          /• พิมพ์รองสีขาว \(เฉพาะกระดาษโฮโลแกรม\/เงิน\/ทอง\) \+20 บาท ต่อ 1 แผ่น A3 \(ค่าหมึกขาว\)/g,
          `• ${NEW_YES} (เฉพาะกระดาษโฮโลแกรม/เงิน/ทอง) +${WHITE_FEE} บาท ต่อ 1 แผ่น A3 (ค่าหมึกขาว)`
        )
        // FAQ card-broad-foam: บรรทัดแจกแจงค่าวัสดุต่อแผ่น — เติมค่ากระดาษ/รองขาวหน้าค่าเคลือบ
        .replace(
          /และปัดขึ้นเป็นแผ่นเต็มเสมอ — เคลือบเงา\/ด้าน 10 บาท/g,
          `และปัดขึ้นเป็นแผ่นเต็มเสมอ — กระดาษเนื้อพิเศษ (โฮโลแกรม/เงิน/ทอง) ${PAPER_FEE} บาท · ${NEW_YES} ${WHITE_FEE} บาท · เคลือบเงา/ด้าน 10 บาท`
        );

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !row) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  const d = structuredClone(row.data) as Product;
  console.log(`\n===== ${id} — ${d.name} =====`);

  // ── 1. ชนิดกระดาษ: กระดาษพิเศษ +40/แผ่น A3 (ยืนยัน/เติมให้ครบ) ─────────────
  const paper = d.options?.find((o) => o.label === PAPER_GROUP);
  if (!paper) throw new Error(`${id}: ไม่เจอกลุ่ม "${PAPER_GROUP}"`);
  const names = paper.choices.map((c) => c.name);
  const expect = [ART, ...SPECIALS];
  if (names.length !== expect.length || expect.some((n) => !names.includes(n)))
    throw new Error(`${id}: รายชื่อกระดาษไม่ตรงที่คาด — มีคนแก้ไว้ ตรวจก่อนรันทับ (เจอ: ${names.join(" · ")})`);
  for (const c of paper.choices) {
    const now = (c as { extra?: number }).extra;
    if (c.name === ART) {
      if (now) throw new Error(`${id}: "${ART}" มี extra=${now} — ต้องฟรี ตรวจก่อนรันทับ`);
      continue;
    }
    if (now !== undefined && now !== PAPER_FEE)
      throw new Error(`${id}: "${c.name}" extra=${now} ไม่ตรงที่คาด (${PAPER_FEE} หรือยังไม่ตั้ง)`);
    (c as { extra?: number }).extra = PAPER_FEE;
  }
  paper.sheetFee = { from: "ขนาด", unit: "แผ่น A3" };
  console.log(
    `กลุ่ม "${PAPER_GROUP}": ${paper.choices.map((c) => `${c.name}${(c as { extra?: number }).extra ? ` +${(c as { extra?: number }).extra}` : ""}`).join(" | ")} · คิดต่อ${paper.sheetFee.unit}`
  );

  // ── 2. พิมพ์รองสีขาว → รองขาว (+20 เฉพาะค่าหมึกขาว) ───────────────────────
  const white = d.options?.find((o) => o.label === OLD_GROUP || o.label === NEW_GROUP);
  if (!white) throw new Error(`${id}: ไม่เจอกลุ่ม "${OLD_GROUP}"/"${NEW_GROUP}"`);
  const shown = white.showWhen?.choices ?? [];
  if (white.showWhen?.label !== PAPER_GROUP || SPECIALS.some((p) => !shown.includes(p)) || shown.some((p) => !SPECIALS.includes(p)))
    throw new Error(`${id}: showWhen ของกลุ่มรองขาวไม่ตรงกระดาษพิเศษ 6 ตัว — ตรวจก่อนรันทับ`);
  if (!white.sheetFee) throw new Error(`${id}: กลุ่มรองขาวไม่มี sheetFee — โครงสร้างเปลี่ยนไปแล้ว`);
  white.label = NEW_GROUP;
  for (const c of white.choices) {
    if (c.name === OLD_NO || c.name === NEW_NO) c.name = NEW_NO;
    else if (c.name === OLD_YES || c.name === NEW_YES) {
      const now = (c as { extra?: number }).extra;
      if (now !== WHITE_FEE && now !== 60)
        throw new Error(`${id}: "${c.name}" extra=${now} ไม่ตรงที่คาด (60 เดิม หรือ ${WHITE_FEE} ใหม่)`);
      c.name = NEW_YES;
      (c as { extra?: number }).extra = WHITE_FEE;
    } else throw new Error(`${id}: เจอตัวเลือกแปลกในกลุ่มรองขาว "${c.name}"`);
  }
  console.log(
    `กลุ่ม "${white.label}": ${white.choices.map((c) => `${c.name}${(c as { extra?: number }).extra ? ` +${(c as { extra?: number }).extra}` : ""}`).join(" | ")} · โชว์เฉพาะกระดาษพิเศษ · ต่อ${white.sheetFee.unit}`
  );

  // กลุ่มรองขาวต้องไม่เป็นแกนตารางราคา/กฎ — เปลี่ยนชื่อแล้วของพวกนี้จะพังเงียบ ๆ
  const touchesRule = (d.rules ?? []).some((r) => r.when.label === OLD_GROUP || r.limit.label === OLD_GROUP);
  const isDriver = [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)].some((p) =>
    (p as { driverLabels?: string[] } | undefined)?.driverLabels?.includes(OLD_GROUP)
  );
  if (touchesRule || isDriver) throw new Error(`${id}: กลุ่ม "${OLD_GROUP}" ถูกใช้ในกฎ/ตารางราคา — ห้ามเปลี่ยนชื่อเฉย ๆ`);

  // ── 3. ข้อความ (terms/แท็บ/FAQ/ไฮไลต์) ────────────────────────────────────
  d.terms = retext(d.terms);
  for (const t of d.tabs ?? []) t.text = retext(t.text);
  const seo = d.seo as { faqs?: { q: string; a: string }[]; faq?: { q: string; a: string }[] } | undefined;
  for (const f of seo?.faqs ?? seo?.faq ?? []) {
    f.q = retext(f.q);
    f.a = retext(f.a);
  }
  d.highlights = (d.highlights ?? []).map(retext);

  // สแกนกันตก — "รองสีขาว"/"ไม่คิดค่ากระดาษ" ต้องไม่เหลือ และบรรทัดรองขาวต้องมีเลข 20
  const stale: string[] = [];
  const scan = (s: unknown, where: string) => {
    if (typeof s !== "string") return;
    for (const line of s.split("\n")) {
      if (/รองสีขาว|ไม่คิดค่ากระดาษ/.test(line)) stale.push(`[${where}] ${line.trim()}`);
      else if (/รองขาว/.test(line) && /\d+ บาท/.test(line) && !line.includes(`${WHITE_FEE} บาท`))
        stale.push(`[${where}] ${line.trim()}`);
    }
  };
  scan(d.terms, "terms");
  for (const t of d.tabs ?? []) scan(t.text, t.title);
  for (const f of seo?.faqs ?? seo?.faq ?? []) scan(f.a, "FAQ");
  for (const h of d.highlights ?? []) scan(h, "highlight");
  if (stale.length) throw new Error(`${id}: ยังมีข้อความชุดเก่าตกค้าง — เติมรูปประโยคใน retext() ก่อน:\n   ${stale.join("\n   ")}`);

  console.log("📝 บรรทัดที่เกี่ยวข้องหลังแก้:");
  const show = (s: unknown, where: string) => {
    if (typeof s !== "string") return;
    for (const line of s.split("\n"))
      if (/รองขาว|ค่ากระดาษ|กระดาษเนื้อพิเศษ/.test(line)) console.log(`   [${where}] ${line.trim()}`);
  };
  show(d.terms, "terms");
  for (const t of d.tabs ?? []) show(t.text, t.title);
  for (const f of seo?.faqs ?? seo?.faq ?? []) show(f.a, "FAQ");

  if (!WRITE) continue;
  const saved: Product = { ...d, savedAt: new Date().toISOString() };
  const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", id);
  if (upErr) throw new Error(`${id}: ${upErr.message}`);
  console.log("✓ บันทึกแล้ว");
}
if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");

/**
 * งานเคลือบฟอยล์ทุกสินค้า — ระบุว่าต้องมีการเคลือบด้านร่วมด้วย (ร้านสั่ง 25 ส.ค. 69)
 *
 *   npx tsx scripts/foil-requires-matte.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/foil-requires-matte.mts --write  # บันทึกลง Supabase
 *
 * ครอบคลุมสินค้าที่มีงานฟอยล์ 9 ตัว:
 *   - มีกลุ่มตัวเลือกฟอยล์: ultra-hard-cardboard-2-mm · card-broad-foam-2-mm ·
 *     photocard-digital · pricelist-shikishi · paper-foil
 *   - พูดถึงฟอยล์ในข้อความ: sticker-gold-silver-rosegold · sticker-pp ·
 *     sticker-rainbow-film · photocard-paper
 *   (texture-paper เคลือบฟอยล์ไม่ได้ — ไม่แตะ)
 *
 * ที่เปลี่ยนต่อสินค้า: note ใต้กลุ่มตัวเลือกฟอยล์ + บรรทัดใน terms + bullet ในแท็บ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

// ประโยคมาตรฐาน (ยาว = จุดที่มีที่ว่าง · สั้น = ต่อท้าย bullet เดิม)
const STD = "งานเคลือบฟอยล์ทุกงานต้องมีการเคลือบด้านร่วมด้วย (รวมอยู่ในขั้นตอนงานฟอยล์แล้ว ไม่คิดเพิ่ม)";
const STD_SHORT = "งานเคลือบฟอยล์ต้องมีการเคลือบด้านร่วมด้วย";
const DONE_MARK = "ต้องมีการเคลือบด้านร่วมด้วย"; // กันรันซ้ำ

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

/** แทนที่ข้อความแบบต้องเจอจริง — เจอไม่ครบให้หยุด ไม่ใช่เขียนทับเงียบ ๆ */
const swap = (text: string, from: string, to: string) => {
  if (!text.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 50)}…"`);
  return text.split(from).join(to);
};
/** แทรกบรรทัดใหม่ต่อท้ายบรรทัด/ข้อความที่ระบุ */
const after = (text: string, anchor: string, added: string) => swap(text, anchor, anchor + "\n" + added);
/** เติม note ให้กลุ่มตัวเลือก (มี note เดิมให้ต่อท้าย) */
const noteOn = (d: Product, label: string) => {
  const o = d.options.find((x: ProductOption) => x.label === label);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "${label}" — ข้อมูลเปลี่ยนไปแล้ว ตรวจก่อนรันทับ`);
  o.note = o.note ? `${o.note} · ${STD}` : STD;
};
const swapTab = (d: Product, anchor: string, added: string) => {
  const t = (d.tabs ?? []).find((x) => x.text?.includes(anchor));
  if (!t) throw new Error(`ไม่เจอแท็บที่มีข้อความ: "${anchor.slice(0, 50)}…"`);
  t.text = after(t.text!, anchor, added);
};

const OPS: Record<string, (d: Product) => void> = {
  "ultra-hard-cardboard-2-mm": (d) => {
    noteOn(d, "เคลือบฟอยล์ (Add On)");
    d.terms = swap(
      d.terms ?? "",
      "งานเคลือบฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้",
      STD + "\nงานเคลือบฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้"
    );
    swapTab(d, "• เคลือบลามิเนตกับเคลือบฟอยล์ทำร่วมกันไม่ได้ — เลือกข้างไหน อีกข้างจะถูกล็อกให้เอง", `• ${STD}`);
  },
  "card-broad-foam-2-mm": (d) => {
    noteOn(d, "เคลือบฟอยล์ (Add On)");
    d.terms = swap(
      d.terms ?? "",
      "งานฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้",
      STD + "\nงานฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้"
    );
    swapTab(d, "• เคลือบลามิเนตกับงานฟอยล์ทำร่วมกันไม่ได้ — เลือกข้างไหน อีกข้างจะถูกล็อกให้เอง", `• ${STD}`);
  },
  "photocard-digital": (d) => {
    noteOn(d, "เคลือบฟอยล์");
    swapTab(d, '• งานเคลือบฟอยล์ทำร่วมกับงานเคลือบลามิเนตไม่ได้ — เลือกฟอยล์ได้เฉพาะงานที่ "ไม่เคลือบ"', `• ${STD}`);
  },
  "pricelist-shikishi": (d) => {
    noteOn(d, "เคลือบฟอยล์ (Add On)");
    d.terms = swap(
      d.terms ?? "",
      "*งานเคลือบฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้",
      `*${STD}\n*งานเคลือบฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้`
    );
    swapTab(d, "• เคลือบลามิเนตกับงานฟอยล์ทำร่วมกันไม่ได้ — เลือกข้างไหน อีกข้างจะถูกล็อกให้เอง", `• ${STD}`);
  },
  "paper-foil": (d) => {
    noteOn(d, "จำนวนเลเยอร์ฟอยล์");
    d.terms = after(d.terms ?? "", "• เคลือบฟอยล์ได้เฉพาะงานพิมพ์ระบบ Digital และ UV", `• ${STD}`);
    swapTab(d, "• เคลือบฟอยล์ได้เฉพาะงานพิมพ์ Digital และ UV เท่านั้น", `• ${STD}`);
  },
  "sticker-gold-silver-rosegold": (d) => {
    swapTab(
      d,
      "• เคลือบฟอยล์ (เงิน/ทอง/โรสโกล/โฮโลแกรม) พิมพ์ 1 เลเยอร์ 40 บาท · 2 เลเยอร์ 60 บาท — เคลือบฟอยล์ได้เฉพาะงาน Digital และ UV",
      `• ${STD_SHORT}`
    );
  },
  "sticker-pp": (d) => {
    swapTab(
      d,
      "• เคลือบฟอยล์ (เงิน/ทอง/โรสโกล/โฮโลแกรม) พิมพ์ 1 เลเยอร์ 40 บาท · 2 เลเยอร์ 60 บาท — แจ้งแอดมิน (โฮโลแกรมเพิ่ม 10 บาท)",
      `• ${STD_SHORT}`
    );
  },
  "sticker-rainbow-film": (d) => {
    swapTab(
      d,
      "• เคลือบฟอยล์ (เงิน/ทอง/โรสโกล/โฮโลแกรม) พิมพ์ 1 เลเยอร์ 40 บาท · 2 เลเยอร์ 60 บาท — เคลือบฟอยล์ได้เฉพาะงาน Digital และ UV",
      `• ${STD_SHORT}`
    );
  },
  "photocard-paper": (d) => {
    d.terms = after(d.terms ?? "", "ตัวฟอยล์อาจจะหลุด ติดไปไม่ครบ (ไม่ควรทำฟ้อนเล็กเกินไป)", `**${STD_SHORT}ทุกงาน`);
  },
};

for (const [id, op] of Object.entries(OPS)) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !row) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  const d = row.data as Product;

  const already = JSON.stringify(d).includes(DONE_MARK);
  console.log(`\n===== ${id} — ${d.name} =====`);
  if (already) {
    console.log("✓ มีข้อความเคลือบด้านอยู่แล้ว — ข้าม");
    continue;
  }
  op(d);

  for (const o of d.options ?? [])
    if (o.note?.includes(DONE_MARK)) console.log(`note กลุ่ม "${o.label}":\n  ${o.note}`);
  for (const line of (d.terms ?? "").split("\n")) if (line.includes(DONE_MARK)) console.log(`terms + ${line}`);
  for (const t of d.tabs ?? [])
    for (const line of (t.text ?? "").split("\n"))
      if (line.includes(DONE_MARK)) console.log(`tab(${t.title}) + ${line}`);

  if (!WRITE) continue;
  const saved: Product = { ...d, savedAt: new Date().toISOString() };
  const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", id);
  if (upErr) throw new Error(`${id}: ${upErr.message}`);
  console.log("✓ บันทึกแล้ว");
}
if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");

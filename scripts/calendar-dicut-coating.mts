#!/usr/bin/env npx tsx
/**
 * ปฏิทินตั้งโต๊ะ ไดคัทตามทรง (new-mt2s9i0u-5323) — เพิ่มกลุ่ม "เคลือบ" + "ลายฟิล์มเคลือบพิเศษ"
 * ตามสินค้าต้นแบบ /products/mini-calendar + ย้ำสเปก "ฐานปฏิทินหน้าขาว-หลังเทา" ให้เห็นชัด
 *
 *   npx tsx scripts/calendar-dicut-coating.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/calendar-dicut-coating.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (25 ส.ค. 69) — กติกาจากหน้า /calendar:
 *   เคลือบ เงา/ด้าน บวกด้านละ 10 บาท ต่อ A3 · เคลือบพิเศษ [เนื้อทราย|กลิสเตอร์|โฮโลแกรม] ชุดละ 40 บาท ต่อ A3
 *   จำนวนกระดาษ: 3x3" 8/14 แผ่น = 1 A3 · 4x4-5x5" 8 แผ่น = 2 A3 / 14 แผ่น = 3 A3 · 6-8" 8 แผ่น = 4 A3 / 14 แผ่น = 7 A3
 *
 * ⚠️ ต่างจากปฏิทินอีก 2 ตัว (อย่าก๊อปทื่อ ๆ):
 *   mini-calendar   1 เล่ม = 1 A3 คงที่           → sheetFee.from ชี้กลุ่มตัวเอง perSheet 1
 *   3x3-7-62cm      1 เล่ม = 4/7 A3 ตาม "ขนาด"    → sheetsPerUnit เป็นตัวเลขบนตัวเลือกกลุ่มเดียว
 *   ตัวนี้           จำนวน A3 ขึ้นกับ 2 กลุ่มพร้อมกัน (ขนาดกระดาษ × จำนวนแผ่น)
 *     และแยกเป็นตัวคูณไม่ได้ (3x3 →1/1 · 4x4-5x5 →2/3 · 6x6-8x8 →4/7 อัตราส่วนไม่คงที่)
 *     → ใช้ sheetsPerUnit แบบ "ตาราง" + sheetFee.by ที่เพิ่มเข้า products.ts รอบนี้
 *
 * ภาพ/คลิปฟิล์มใช้ร่วมกับโฟลเดอร์ mini-calendar (ฟิล์มม้วนเดียวกัน) — ไม่ก๊อปไฟล์ซ้ำใน storage
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2s9i0u-5323";
const FROM = "mini-calendar"; // ต้นแบบกลุ่มเคลือบ (ฟิล์มม้วนเดียวกัน ใช้ภาพ/คลิปร่วมกัน)
const FOIL = "เคลือบฟอยล์ (Add On)";
const FOIL_COLOR = "สีฟอยล์";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// ── ต้นแบบ: อ่านกลุ่มเคลือบสดจาก Mini Calendar (ชื่อกลุ่ม/ลายฟิล์มเปลี่ยน จะตามกันเอง) ──
// ⚠️ ยึดชื่อกลุ่มตาม Mini Calendar เป๊ะ ๆ ไม่ตั้งชื่อเอง — ปฏิทินสองตัวจะได้เรียกเหมือนกันทั้งหน้าร้านและใบงาน
const COAT_FRONT = "เคลือบ (ด้านหน้า)";
const FILM_FRONT = "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)";
const COAT_BACK = "เคลือบ (ด้านหลัง)";
const FILM_BACK = "ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)";
const { data: src, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
const srcOf = (label: string) => {
  const g = (src.data.options ?? []).find((o: { label: string }) => o.label === label);
  if (!g) throw new Error(`${FROM} ไม่มีกลุ่ม "${label}" แล้ว — โครงต้นแบบเปลี่ยน มาดูเองก่อน`);
  return g;
};
const srcCoatFront = srcOf(COAT_FRONT);
const srcFilmFront = srcOf(FILM_FRONT);
const srcCoatBack = srcOf(COAT_BACK);
const srcFilmBack = srcOf(FILM_BACK);
console.log(
  `📋 ต้นแบบ ${src.name}: ${COAT_FRONT} ${srcCoatFront.choices.length} แบบ · ${COAT_BACK} ${srcCoatBack.choices.length} แบบ · ลายฟิล์มด้านละ ${srcFilmFront.choices.length} ลาย`
);

// ── สินค้าปลายทาง ──
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/ไดคัท/.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

const K8 = "8 แผ่น (16หน้า)";
const K14 = "14 แผ่น (28หน้า)";
/** แผ่น A3 ที่ 1 เล่มกิน — ขนาดกระดาษ (ขึ้นต้นชื่อ) × จำนวนแผ่น */
const A3_PER_BOOK: Record<string, Record<string, number>> = {
  "3x3": { [K8]: 1, [K14]: 1 },
  "4x4": { [K8]: 2, [K14]: 3 },
  "6x6": { [K8]: 4, [K14]: 7 },
};

// 1) กลุ่ม "ขนาดกระดาษ" บอกว่า 1 เล่มกินกี่แผ่น A3 (ตัวคูณของค่าเคลือบ) — เป็นตารางตามกลุ่ม "จำนวนแผ่น"
const sizeGroup = (d.options ?? []).find((o: { label: string }) => o.label === "ขนาดกระดาษ");
const sheetGroup = (d.options ?? []).find((o: { label: string }) => o.label === "จำนวนแผ่น");
if (!sizeGroup || !sheetGroup) throw new Error('ไม่เจอกลุ่ม "ขนาดกระดาษ"/"จำนวนแผ่น" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน');
const sheetNames = sheetGroup.choices.map((c: { name: string }) => c.name);
if (JSON.stringify(sheetNames) !== JSON.stringify([K8, K14]))
  throw new Error(`ตัวเลือกกลุ่มจำนวนแผ่นเปลี่ยน: ${sheetNames.join(" | ")} — ตารางแผ่น A3 ต้องแก้ตาม`);
for (const c of sizeGroup.choices) {
  const table = A3_PER_BOOK[c.name.slice(0, 3)];
  if (!table) throw new Error(`ไม่รู้ว่าขนาด "${c.name}" ใช้กี่แผ่น A3 — ตารางเว็บเพิ่มขนาดใหม่? มาดูเองก่อน`);
  c.sheetsPerUnit = table;
}

// 2) กลุ่มเคลือบ "ด้านหน้า" และ "ด้านหลัง" แยกกัน — หน้าเว็บคิด **ด้านละ** 10 บาทต่อ A3
//    (ผู้ใช้สั่งเพิ่ม 25 ส.ค. 69: "ต้องมีเคลือบด้านหน้า - เคลือบด้านหลัง")
//    ทั้งสองกลุ่มตั้ง sheetFee เอง — sheetFeeTotalOf บวกทุกกลุ่มที่ตั้งไว้ เคลือบ 2 ด้านจึงเป็น 2 เท่าเอง
//    และเลือกฟิล์มคนละแบบต่อด้านได้ (หน้าเงา/หลังด้าน) ตามที่หน้างานจริงทำได้
const FEE: Record<string, number> = { ไม่เคลือบ: 0, เคลือบเงา: 10, เคลือบด้าน: 10, เคลือบพิเศษ: 40 };
const A3_NOTE =
  "กระดาษที่ใช้ต่อเล่ม: 3x3 นิ้ว 1 แผ่น A3 (ทั้ง 8 และ 14 แผ่น) · 4x4-5x5 นิ้ว 2 แผ่น (8 แผ่น) / 3 แผ่น (14 แผ่น) · " +
  "6x6-8x8 นิ้ว 4 แผ่น (8 แผ่น) / 7 แผ่น (14 แผ่น)";

/** ค่าเคลือบต่อแผ่น A3 จากชื่อตัวเลือก (ชื่อด้านหลังมีวงเล็บต่อท้าย เช่น "เคลือบเงา (ด้านหลัง)") */
function feeOfChoice(name: string): number {
  if (/^ไม่เคลือบ/.test(name)) return 0;
  if (/มากับงานฟอยล์/.test(name)) return 0; // ตัวล็อก 0฿ — ต้องดักก่อน /เคลือบด้าน/ ไม่งั้นโดนคิด 10 บาท
  if (/เคลือบพิเศษ/.test(name)) return FEE["เคลือบพิเศษ"];
  if (/เคลือบเงา/.test(name)) return FEE["เคลือบเงา"];
  if (/เคลือบด้าน/.test(name)) return FEE["เคลือบด้าน"];
  throw new Error(`ตัวเลือกเคลือบใหม่ "${name}" จาก ${FROM} — ยังไม่รู้ราคา มาดูเองก่อน`);
}

/** ก๊อปกลุ่มเคลือบ/ลายฟิล์มของด้านหนึ่ง ๆ จาก Mini Calendar แล้วเปลี่ยนฐานคิดเป็นแผ่นต่อเล่มของสินค้านี้ */
function coatingPair(srcCoat: { label: string; choices: { name: string }[] }, srcFilm: object, note: string) {
  const coat = structuredClone(srcCoat) as any;
  coat.sheetFee = { from: "ขนาดกระดาษ", by: "จำนวนแผ่น", unit: "แผ่น A3" };
  coat.note = note;
  for (const c of coat.choices) {
    delete c.perSheet; // ของ Mini (1 เล่ม = 1 A3) ใช้กับสินค้านี้ไม่ได้ — จำนวนแผ่นมาจากกลุ่ม "ขนาดกระดาษ" แทน
    const fee = feeOfChoice(c.name);
    if (fee) c.extra = fee;
    else delete c.extra;
  }
  // ลายฟิล์มของด้านนั้น — showWhen ชี้กลุ่มเคลือบด้านเดียวกัน (ก๊อปมาแล้วชื่อกลุ่มตรงกันอยู่)
  const film = structuredClone(srcFilm) as any;
  if (film.showWhen?.label !== coat.label)
    throw new Error(`ลายฟิล์ม "${film.label}" ชี้กลุ่ม "${film.showWhen?.label}" ไม่ใช่ "${coat.label}" — โครงต้นแบบเปลี่ยน`);
  return [coat, film] as const;
}

// 📝 note สั้นเข้าไว้ — ราคาอยู่บนการ์ดทุกใบแล้ว และตัวเลขแผ่น A3 กางให้เองในแถบ 📄 ใต้กลุ่ม
// (ผู้ใช้ทัก 25 ส.ค. 69 ว่าแผงเคลือบดูรก: note ยาว + ไฮไลต์ชมพูเกือบทุกวลี)
const [coatFront, filmFront] = coatingPair(
  srcCoatFront,
  srcFilmFront,
  "เคลือบฟิล์มด้านหน้าของกระดาษทุกแผ่นในเล่ม · คิดเป็นค่าวัสดุต่อแผ่น A3"
);
const [coatBack, filmBack] = coatingPair(
  srcCoatBack,
  srcFilmBack,
  "เคลือบเพิ่มอีกด้านได้ คิดแยกจากด้านหน้า · เลือกคนละแบบกับด้านหน้าได้"
);
// 🔽 ด้านหลังเป็นของเสริม — หน้าสินค้าปิดไว้ก่อน โชว์แค่สวิตช์ (ตั้งซ้ำให้ชัด ไม่พึ่งค่าที่ติดมากับ clone)
coatBack.collapsible = true;

// ── 3) ชุดเคลือบฟอยล์ "ตามงานกระดาษ" (ผู้ใช้สั่งเพิ่ม 25 ส.ค. 69) ────────────────────
// Mini Calendar ยกชุดฟอยล์ของงานกระดาษ (card-broad-foam-2-mm) มาไว้แล้วพร้อมกฎครบ — ก๊อปต่อจากตรงนั้น
// สองปฏิทินจะได้ชื่อกลุ่ม/ตัวเลือก/กฎ ตรงกันเป๊ะ (ก๊อปจากงานกระดาษเองเสี่ยงหลุดจากกันภายหลัง)
// กติกาที่ผูกมาด้วย: งานฟอยล์ต้องเคลือบด้านร่วมเสมอ (ตัวเลือกล็อก 0฿) · ฟอยล์ + ลามิเนตอื่นทำร่วมกันไม่ได้
const MATTE_FOIL = "เคลือบด้าน (มากับงานฟอยล์)";
const foil = structuredClone(srcOf(FOIL));
const foilColor = structuredClone(srcOf(FOIL_COLOR));
for (const g of [foil, foilColor]) {
  g.sheetFee = { from: "ขนาดกระดาษ", by: "จำนวนแผ่น", unit: "แผ่น A3" };
  for (const c of g.choices) delete c.perSheet;
}
foil.note =
  "ปั๊มฟอยล์เมทัลลิกทับลายด้านหน้า · คิดต่อแผ่น A3 · **ทำร่วมกับเคลือบลามิเนตไม่ได้** — " +
  "เลือกฟอยล์แล้วระบบสลับด้านหน้าเป็นเคลือบด้านให้เอง (ไม่คิดเพิ่ม)";
foilColor.note = "เงิน/ทอง/โรสโกลด์ ราคาเท่ากัน · โฮโลแกรมบวกเพิ่มตามป้าย";
foil.collapsible = true; // ของเสริมที่ลูกค้าส่วนใหญ่ไม่ได้ใช้ — ปิดไว้ก่อน หน้าจะได้ไม่ยาว
const FOIL_ON = foil.choices.filter((c: { extra?: number }) => (c.extra ?? 0) > 0).map((c: { name: string }) => c.name);
const FOIL_OFF = foil.choices.find((c: { extra?: number }) => !c.extra)?.name;
if (FOIL_ON.length !== 2 || !FOIL_OFF) throw new Error(`โครงกลุ่มฟอยล์ของ ${FROM} เปลี่ยน — มาดูเองก่อน`);
// ตัวล็อก 0฿ ต้องติดมากับกลุ่มเคลือบด้านหน้าของต้นแบบอยู่แล้ว (ฟอยล์ปั๊มด้านหน้า)
if (!coatFront.choices.some((c: { name: string }) => c.name === MATTE_FOIL))
  throw new Error(`${FROM} ไม่มีตัวเลือก "${MATTE_FOIL}" ในกลุ่ม ${COAT_FRONT} — กติกาฟอยล์เปลี่ยน มาดูเองก่อน`);

// กฎทั้งชุดก๊อปจากต้นแบบตรง ๆ — ชื่อกลุ่ม/ตัวเลือกเหมือนกันทุกตัว จึงใช้ได้เลยไม่ต้องแมป
d.rules = structuredClone(src.data.rules ?? []);
const ruleLabels = new Set(d.rules.flatMap((r: { when: { label: string }; limit: { label: string } }) => [r.when.label, r.limit.label]));
const haveLabels = new Set([COAT_FRONT, FILM_FRONT, COAT_BACK, FILM_BACK, FOIL, FOIL_COLOR]);
for (const label of ruleLabels)
  if (!haveLabels.has(label)) throw new Error(`กฎจากต้นแบบอ้างกลุ่ม "${label}" ที่สินค้านี้ไม่มี — มาดูเองก่อน`);

// ใส่ต่อท้าย (แทนของเดิมถ้าเคยมี) — เรียงตามต้นแบบ: เคลือบหน้า+ลาย → ฟอยล์ + สีฟอยล์ → เคลือบหลัง+ลาย
const COAT_LABELS = ["เคลือบ", "ลายฟิล์มเคลือบพิเศษ", ...haveLabels];
d.options = [
  ...d.options.filter((o: { label: string }) => !COAT_LABELS.includes(o.label)),
  coatFront,
  filmFront,
  foil,
  foilColor,
  coatBack,
  filmBack,
];

// 4) ย้ำสเปกฐานปฏิทินให้เห็นชัดตามผู้ใช้สั่ง (เดิมอยู่แค่ note ใต้กลุ่มขนาด + แท็บ)
const BASE_SPEC = "ฐานปฏิทินหน้าขาว-หลังเทา";
d.description =
  "ปฏิทินตั้งโต๊ะ ไดคัทตามทรง — ขอบปฏิทินตัดโค้งตามทรงลายของคุณ ไม่ใช่กรอบเหลี่ยมธรรมดา " +
  `เลือกได้ 3 ขนาด (3x3 / 4x4-5x5 / 6x6-8x8 นิ้ว) และ 2 แบบจำนวนแผ่น (8 หรือ 14 แผ่น) · กระดาษหนา 260 แกรม ${BASE_SPEC}`;
d.highlights = [
  "ไดคัทขอบตามทรงลาย ชิ้นเดียวไม่ซ้ำใคร",
  "เลือกได้ 3 ขนาด · 8 หรือ 14 แผ่น",
  `กระดาษหนา 260 แกรม · ${BASE_SPEC}`,
  "เลือกเคลือบด้านหน้า/ด้านหลังแยกกันได้ (คิดต่อแผ่น A3)",
];

// 5) แท็บรายละเอียด — เขียนบรรทัด Add On ใหม่ให้ตรงกับกลุ่มที่มีจริง (ของเดิมเขียนรวม ๆ ว่า "แจ้งในหมายเหตุ")
const detailTab = (d.tabs ?? []).find((t: { title: string }) => t.title === "รายละเอียดเพิ่มเติม");
if (!detailTab) throw new Error('ไม่เจอแท็บ "รายละเอียดเพิ่มเติม" — โครงแท็บเปลี่ยน มาดูเองก่อน');
detailTab.text =
  detailTab.text
    .split("\n")
    .filter((line: string) => !line.startsWith("• Add On"))
    .join("\n") +
  "\n• Add On เคลือบฟิล์ม (เลือกด้านหน้า/ด้านหลังแยกกันได้ คนละแบบก็ได้): เคลือบเงา/เคลือบด้าน ด้านละ 10 บาทต่อแผ่น A3 · " +
  "เคลือบพิเศษ (เนื้อทราย | กลิสเตอร์ | โฮโลแกรม 10 ลาย) ด้านละ 40 บาทต่อแผ่น A3" +
  "\n• Add On เคลือบฟอยล์: พิมพ์ 1 เลเยอร์ 40 บาท · 2 เลเยอร์ 60 บาท ต่อแผ่น A3 · เลือกสีฟอยล์ได้ 4 สี (สีโฮโลแกรม +10 บาทต่อแผ่น A3)" +
  "\n• งานเคลือบฟอยล์ทุกงานต้องเคลือบด้านร่วมด้วยเสมอ (รวมในขั้นตอนงานฟอยล์ ไม่คิดเพิ่ม) — จึงเลือกฟอยล์คู่กับเคลือบเงา/เคลือบพิเศษด้านหน้าไม่ได้" +
  `\n• ${BASE_SPEC} — ค่าเคลือบ/ฟอยล์คิดตามกระดาษ A3 ที่ใช้จริงต่อเล่ม (${A3_NOTE.replace("กระดาษที่ใช้ต่อเล่ม: ", "")})`;

// 6) FAQ เรื่องเคลือบ (เขียนทับข้อเดิมถ้ามี)
const faqQ = "ปฏิทินตั้งโต๊ะ ไดคัทตามทรง เคลือบฟิล์มได้ไหม คิดเงินยังไง?";
const faqFoil = "ปฏิทินตั้งโต๊ะ ไดคัทตามทรง ปั๊มฟอยล์ได้ไหม?";
d.seo.faqs = [
  ...(d.seo.faqs ?? []).filter((f: { q: string }) => f.q !== faqQ && f.q !== faqFoil),
  {
    q: faqFoil,
    a:
      "ได้ครับ เลือกกลุ่ม “เคลือบฟอยล์ (Add On)” — พิมพ์ฟอยล์ 1 เลเยอร์ 40 บาทต่อแผ่น A3 · 2 เลเยอร์ 60 บาทต่อแผ่น A3 " +
      "เลือกสีฟอยล์ได้ 4 สี (เงิน / ทอง / โรสโกลด์ / โฮโลแกรม +10 บาทต่อแผ่น A3) — " +
      "งานฟอยล์ทุกงานเคลือบด้านให้ด้วยเสมอ รวมอยู่ในขั้นตอนงานฟอยล์แล้วไม่คิดเพิ่ม จึงเลือกเคลือบเงา/เคลือบพิเศษด้านหน้าคู่กับฟอยล์ไม่ได้ " +
      "(ตัวอย่าง: 6x6-8x8 นิ้ว 14 แผ่น ใช้ 7 แผ่น A3 · ฟอยล์ 1 เลเยอร์สีทอง = 40 × 7 = 280 บาทต่อเล่ม)",
  },
  {
    q: faqQ,
    a:
      "ได้ครับ เลือกเคลือบด้านหน้าและด้านหลังแยกกันได้ (คนละแบบก็ได้) — คิด **ด้านละ** 10 บาทต่อแผ่น A3 สำหรับเคลือบเงา/เคลือบด้าน · " +
      "เคลือบพิเศษ (เนื้อทราย/กลิสเตอร์/โฮโลแกรม 10 ลาย) ด้านละ 40 บาทต่อแผ่น A3 — " +
      "คิดตามกระดาษที่ใช้จริงต่อเล่ม: 3x3 นิ้ว 1 แผ่น A3 (เคลือบเงาด้านหน้า +10 · เคลือบเงาทั้งสองด้าน +20 ต่อเล่ม) · " +
      "4x4-5x5 นิ้ว 8 แผ่นใช้ 2 แผ่น A3 / 14 แผ่นใช้ 3 แผ่น A3 · " +
      "6x6-8x8 นิ้ว 8 แผ่นใช้ 4 แผ่น A3 / 14 แผ่นใช้ 7 แผ่น A3 (เคลือบพิเศษสองด้าน = 40 × 7 × 2 = 560 บาทต่อเล่ม)",
  },
];

// ── ตรวจเลขก่อนเขียน (คิดมือตามกติกาเว็บ — ทุกกลุ่มที่คิดต่อแผ่นบวกกัน) ──
const foilFee = (name: string) => foil.choices.find((c: { name: string }) => c.name === name)?.extra ?? 0;
const colorFee = (name: string) => foilColor.choices.find((c: { name: string }) => c.name === name)?.extra ?? 0;
const expect: [size: string, sheets: string, front: string, back: string, foilPick: string, color: string, qty: number, total: number][] = [
  ["3x3", K8, "เคลือบเงา", "ไม่เคลือบด้านหลัง", FOIL_OFF, "", 1, 10], // 10 × 1 A3 · หน้าเดียว
  ["3x3", K8, "เคลือบเงา", "เคลือบเงา (ด้านหลัง)", FOIL_OFF, "", 1, 20], // ด้านละ 10 × 1 A3
  ["3x3", K14, "เคลือบพิเศษ", "ไม่เคลือบด้านหลัง", FOIL_OFF, "", 1, 40], // 40 × 1 A3 (14 แผ่นก็ยัง 1 A3)
  ["4x4", K8, "เคลือบด้าน", "ไม่เคลือบด้านหลัง", FOIL_OFF, "", 1, 20], // 10 × 2 A3
  ["4x4", K14, "เคลือบเงา", "เคลือบด้าน (ด้านหลัง)", FOIL_OFF, "", 1, 60], // (10+10) × 3 A3 คนละแบบต่อด้าน
  ["6x6", K14, "เคลือบพิเศษ", "เคลือบพิเศษ (ด้านหลัง)", FOIL_OFF, "", 1, 560], // 40 × 7 A3 × 2 ด้าน
  ["6x6", K14, "เคลือบพิเศษ", "ไม่เคลือบด้านหลัง", FOIL_OFF, "", 10, 2800], // 40 × 70 A3
  // งานฟอยล์: ด้านหน้าถูกล็อกเป็นเคลือบด้าน 0฿ · ค่าฟอยล์ (+ สีโฮโล) คิดต่อแผ่น A3 เหมือนกัน
  ["3x3", K8, MATTE_FOIL, "ไม่เคลือบด้านหลัง", FOIL_ON[0], "สีทอง", 1, 40], // 40 × 1 A3
  ["6x6", K8, MATTE_FOIL, "ไม่เคลือบด้านหลัง", FOIL_ON[1], "สีเงิน", 1, 240], // 60 × 4 A3
  ["6x6", K14, MATTE_FOIL, "ไม่เคลือบด้านหลัง", FOIL_ON[0], "สีโฮโลแกรม", 1, 350], // (40+10) × 7 A3
  ["3x3", K8, "ไม่เคลือบ", "ไม่เคลือบด้านหลัง", FOIL_OFF, "", 5, 0],
];
console.log("\n🧮 ตรวจค่าเพิ่มต่อแผ่น A3 (ตาราง sheetsPerUnit ขนาดกระดาษ × จำนวนแผ่น · บวกทุกกลุ่ม):");
for (const [size, sheets, front, back, foilPick, color, qty, want] of expect) {
  const a3 = Math.ceil(qty * A3_PER_BOOK[size][sheets]);
  const perSheetSum =
    feeOfChoice(front) + feeOfChoice(back) + foilFee(foilPick) + (foilPick === FOIL_OFF ? 0 : colorFee(color));
  const got = perSheetSum * a3;
  const mark = got === want ? "✓" : "✗";
  console.log(
    `   ${mark} ${size} · ${sheets} · หน้า:${front} หลัง:${back}` +
      `${foilPick === FOIL_OFF ? "" : ` ฟอยล์:${foilPick}/${color}`} · ${qty} เล่ม = ${a3} A3 → ฿${got} (คาด ฿${want})`
  );
  if (got !== want) throw new Error("สูตรค่าเคลือบ/ฟอยล์ไม่ตรงที่คาด — หยุดก่อนเขียน");
}
console.log("\nกลุ่มตัวเลือกหลังแก้:");
for (const g of d.options)
  console.log(
    ` - ${g.label} (${g.display ?? "pills"})${g.sheetFee ? ` [ค่าต่อ${g.sheetFee.unit} จากกลุ่ม "${g.sheetFee.from}"${g.sheetFee.by ? ` × "${g.sheetFee.by}"` : ""}]` : ""}` +
      `${g.showWhen ? ` [โชว์เมื่อ ${g.showWhen.label}=${g.showWhen.choices.join("/")}]` : ""}: ` +
      g.choices.map((c: { name: string; extra?: number }) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" · ")
  );

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
const bOpts = back.data.options;
const bAt = (label: string) => bOpts.find((o: { label: string }) => o.label === label);
const bSize = bAt("ขนาดกระดาษ");
const a3Of = (prefix: string, key: string) =>
  bSize?.choices.find((c: { name: string }) => c.name.startsWith(prefix))?.sheetsPerUnit?.[key];
const feeOf = (label: string, choice: string) =>
  bAt(label)?.choices.find((c: { name: string }) => c.name === choice)?.extra;
const checks: [string, unknown, unknown][] = [
  ["จำนวนกลุ่ม", bOpts.length, 8],
  ["ฐานคิดค่าเคลือบหน้า", `${bAt(COAT_FRONT)?.sheetFee?.from} × ${bAt(COAT_FRONT)?.sheetFee?.by}`, "ขนาดกระดาษ × จำนวนแผ่น"],
  ["ฐานคิดค่าเคลือบหลัง", `${bAt(COAT_BACK)?.sheetFee?.from} × ${bAt(COAT_BACK)?.sheetFee?.by}`, "ขนาดกระดาษ × จำนวนแผ่น"],
  ["ฐานคิดค่าฟอยล์", `${bAt(FOIL)?.sheetFee?.from} × ${bAt(FOIL)?.sheetFee?.by}`, "ขนาดกระดาษ × จำนวนแผ่น"],
  ["A3 ต่อเล่ม 3x3 · 14 แผ่น", a3Of("3x3", K14), 1],
  ["A3 ต่อเล่ม 4x4-5x5 · 8 แผ่น", a3Of("4x4", K8), 2],
  ["A3 ต่อเล่ม 4x4-5x5 · 14 แผ่น", a3Of("4x4", K14), 3],
  ["A3 ต่อเล่ม 6x6-8x8 · 8 แผ่น", a3Of("6x6", K8), 4],
  ["A3 ต่อเล่ม 6x6-8x8 · 14 แผ่น", a3Of("6x6", K14), 7],
  ["ค่าเคลือบเงา ด้านหน้า", feeOf(COAT_FRONT, "เคลือบเงา"), 10],
  ["ค่าเคลือบเงา ด้านหลัง", feeOf(COAT_BACK, "เคลือบเงา (ด้านหลัง)"), 10],
  ["ค่าเคลือบพิเศษ ด้านหน้า", feeOf(COAT_FRONT, "เคลือบพิเศษ"), 40],
  ["ค่าเคลือบพิเศษ ด้านหลัง", feeOf(COAT_BACK, "เคลือบพิเศษ (ด้านหลัง)"), 40],
  ["ตัวล็อกเคลือบด้านมากับฟอยล์ 0฿", feeOf(COAT_FRONT, MATTE_FOIL) ?? 0, 0],
  ["ค่าฟอยล์ 1 เลเยอร์", feeOf(FOIL, FOIL_ON[0]), 40],
  ["ค่าฟอยล์ 2 เลเยอร์", feeOf(FOIL, FOIL_ON[1]), 60],
  ["สีฟอยล์", bAt(FOIL_COLOR)?.choices.length, foilColor.choices.length],
  ["ลายฟิล์มด้านหน้า", bAt(FILM_FRONT)?.choices.length, srcFilmFront.choices.length],
  ["ลายฟิล์มด้านหลัง โชว์เมื่อ", bAt(FILM_BACK)?.showWhen?.label, COAT_BACK],
  ["จำนวนกฎ", back.data.rules?.length, (src.data.rules ?? []).length],
  ["สเปกฐานปฏิทินใน highlights", back.data.highlights.some((h: string) => h.includes(BASE_SPEC)), true],
  ["สเปกฐานปฏิทินใน description", back.data.description.includes(BASE_SPEC), true],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log("\n✅ บันทึกแล้ว — เคลือบหน้า/หลังแยกกลุ่ม คิดค่าฟิล์มด้านละต่อแผ่น A3 ตามกระดาษจริงของแต่ละขนาด × จำนวนแผ่น");

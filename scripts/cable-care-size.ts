/**
 * CABLE CARE — ตัวเลือก "เพิ่มขนาด" แบบเลือกขนาดจริงเป็น ซม. (ตามที่ผู้ใช้สั่ง 21 ส.ค. 69)
 *
 *   npx tsx scripts/cable-care-size.ts            # ดูสิ่งที่จะเปลี่ยน (ไม่เขียนจริง)
 *   npx tsx scripts/cable-care-size.ts --write    # เขียนลง Supabase
 *
 * เว็บตารางราคา (caseairpods) เขียนไว้ว่า
 *   "แผ่นอะคริลิค หนา 2mm (สกรีนบน) · ขนาดไม่เกิน 3cm (ถ้าเพิ่มขนาด cm ละ 8 บาท)"
 *
 * ของเดิมเป็นกลุ่มติ๊ก "เซนละ +฿8" แล้วให้กดจำนวนเอา — ลูกค้าไม่เห็นว่าตัวเองจะได้ขนาดกี่ ซม.
 * ของใหม่เป็นปุ่มขนาดจริง (ไม่เกิน 3 / 4 / 5 … ซม.) บวกราคาไว้ในตัวเลือกให้เสร็จ และแยกสองวิธีคิด
 *   • เพิ่มขนาดต่อชิ้น — ทั้ง 2 ชิ้นในชุดขนาดเท่ากัน คิด ซม.ละ 8 บาท "ต่อชิ้น" = ชุดละ 16 บาท/ซม.
 *   • เพิ่มขนาดต่อชุด — คิด ซม.ละ 8 บาท "ต่อชุด" ครั้งเดียว
 * ราคาในตาราง 1 แถว = 1 เซ็ต ตัวเลข extra จึงเป็นยอดต่อเซ็ตทั้งคู่ (ต่อชิ้นคูณ 2 มาให้แล้ว)
 *
 * สองกลุ่มนี้ตอบเรื่องเดียวกัน (ขนาดงาน) จึงตั้ง showWhen ไขว้กันไว้ — เลือกขนาดในกลุ่มไหน
 * อีกกลุ่มจะซ่อนทันที กันลูกค้าเลือกซ้อนแล้วโดนคิดเงินสองต่อ (กลุ่มที่ซ่อนไม่คิดเงิน ดู optionActive)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { unitPriceFor, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "cable-care";
/** ขนาดที่รวมอยู่ในราคาปกติแล้ว (วัดจากด้านที่ยาวที่สุด) */
const BASE_CM = 3;
/** ค่าเพิ่มขนาด — บาทต่อ 1 ซม. ต่อ 1 ชิ้น */
const PER_CM = 8;
/** 1 ชุด = 2 ชิ้น (ตรงกับกลุ่ม "จำนวนต่อชุด" ที่ตั้ง perUnit ไว้) */
const PIECES_PER_SET = 2;
/** ขนาดใหญ่สุดที่ให้เลือกในหน้าเว็บ — เกินกว่านี้ให้ทักแชทสั่งทำ */
const MAX_CM = 10;

const BASE_NAME = `ไม่เกิน ${BASE_CM} ซม. (ราคาปกติ)`;
const PER_PIECE = "เพิ่มขนาดต่อชิ้น";
const PER_SET = "เพิ่มขนาดต่อชุด";

/** ปุ่มขนาด: ตัวแรกคือขนาดมาตรฐาน (ไม่บวก) ที่เหลือบวกตามจำนวน ซม. ที่เกิน × ค่าต่อ ซม. */
function sizeChoices(multiplier: number) {
  const rest = [];
  for (let cm = BASE_CM + 1; cm <= MAX_CM; cm++)
    rest.push({ name: `${cm} ซม.`, extra: (cm - BASE_CM) * PER_CM * multiplier });
  return [{ name: BASE_NAME, extra: 0 }, ...rest];
}

const SIZE_OPTIONS: ProductOption[] = [
  {
    label: PER_PIECE,
    choices: sizeChoices(PIECES_PER_SET),
    // เลือกขนาดในกลุ่ม "ต่อชุด" ไว้แล้ว = ซ่อนกลุ่มนี้ (ตอบขนาดไปแล้ว ไม่ต้องถามซ้ำ)
    showWhen: { label: PER_SET, choices: [BASE_NAME] },
  },
  {
    label: PER_SET,
    choices: sizeChoices(1),
    showWhen: { label: PER_PIECE, choices: [BASE_NAME] },
  },
];

const SIZE_TAB_LINES = [
  `• ขนาดมาตรฐานไม่เกิน ${BASE_CM} ซม. (วัดจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง) — เพิ่มขนาดคิด ซม.ละ ${PER_CM} บาท`,
  `• เพิ่มขนาดต่อชิ้น = ทั้ง ${PIECES_PER_SET} ชิ้นในชุดใหญ่ขึ้นเท่ากัน คิด ซม.ละ ${PER_CM * PIECES_PER_SET} บาทต่อชุด`,
  `• เพิ่มขนาดต่อชุด = คิด ซม.ละ ${PER_CM} บาทต่อชุด · เลือกวิธีคิดได้อย่างใดอย่างหนึ่ง`,
  `• ต้องการใหญ่กว่า ${MAX_CM} ซม. ทักแชทร้านเพื่อตีราคาได้เลย`,
];
const SIZE_FAQ = {
  q: "เพิ่มขนาดคิดยังไง?",
  a: `ขนาดมาตรฐานไม่เกิน ${BASE_CM} ซม. (วัดด้านที่ยาวที่สุด) รวมในราคาแล้ว · เพิ่มขนาดคิด ซม.ละ ${PER_CM} บาทต่อชิ้น — เลือกได้ว่าจะคิดต่อชิ้น (ทั้ง ${PIECES_PER_SET} ชิ้นในชุด = ซม.ละ ${PER_CM * PIECES_PER_SET} บาทต่อชุด) หรือคิดต่อชุด (ซม.ละ ${PER_CM} บาทต่อชุด)`,
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
  if (error) throw error;
  const p = row.data as Product;

  const sizeLabels = [PER_PIECE, PER_SET];
  // ของเดิมชื่อ "เพิ่มขนาดต่อชิ้น" (ติ๊ก "เซนละ") — ทับด้วยชุดใหม่ รันซ้ำได้
  const kept = (p.options ?? []).filter((o) => !sizeLabels.includes(o.label));

  const mixTab = (p.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
  const tabText = [
    ...(mixTab?.text ?? "").split("\n").filter((l) => !l.includes("ขนาด") || !l.includes("ซม.ละ")),
    ...SIZE_TAB_LINES,
  ]
    // รันซ้ำแล้วบรรทัดขนาดต้องไม่ทับกันเป็นชั้น ๆ
    .filter((l, i, a) => a.indexOf(l) === i && !(SIZE_TAB_LINES.includes(l) && a.lastIndexOf(l) !== i))
    .join("\n");

  const next: Product = {
    ...p,
    options: [...kept, ...SIZE_OPTIONS],
    tabs: mixTab
      ? (p.tabs ?? []).map((t) => (t.title === mixTab.title ? { ...t, text: tabText } : t))
      : p.tabs,
    seo: p.seo
      ? {
          ...p.seo,
          faqs: [...(p.seo.faqs ?? []).filter((f) => !f.q.includes("เพิ่มขนาด")), SIZE_FAQ],
        }
      : p.seo,
  };

  console.log("— ตัวเลือกใหม่:");
  for (const o of SIZE_OPTIONS) {
    console.log(`  ▸ ${o.label} (ซ่อนเมื่อ ${o.showWhen!.label} ≠ "${BASE_NAME}")`);
    for (const c of o.choices) console.log(`     ${c.name.padEnd(22)} ${c.extra ? `+฿${c.extra}` : "—"}`);
  }
  console.log("\n— ราคา/เซ็ต ที่ลูกค้าจะเห็น (สั่ง 1 เซ็ต):");
  for (const [label, pick] of [
    [PER_PIECE, "5 ซม."],
    [PER_SET, "5 ซม."],
    [PER_PIECE, BASE_NAME],
  ] as const) {
    const sel = { [PER_PIECE]: BASE_NAME, [PER_SET]: BASE_NAME, [label]: pick };
    console.log(`   ${label} = ${pick.padEnd(22)} → ฿${unitPriceFor(next, sel, 1)}`);
  }
  console.log("\n— แท็บรายละเอียดเพิ่มเติม:\n" + tabText);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนจริง — ใส่ --write เพื่อบันทึก)");
    return;
  }
  const { error: upErr } = await sb
    .from("products")
    .update({ data: { ...next, savedAt: new Date().toISOString() } })
    .eq("id", ID);
  if (upErr) throw upErr;
  console.log("\n✅ บันทึกลง Supabase แล้ว");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

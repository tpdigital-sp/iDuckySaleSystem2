/**
 * สร้างสินค้า "ถุงหอม (เม็ดหอม)" — scented bag
 *
 *   node scripts/scented-bag-art.mjs --sheet                              # เตรียมภาพ + คอนแทคชีตไว้ตรวจ
 *   npx tsx scripts/add-scented-bag.ts                                    # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-scented-bag.ts --upload --images=.cache/scented-bag/upload
 *   npx tsx scripts/add-scented-bag.ts --write                            # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/รับทำแผ่นหินน้ำหอม
 *   ตารางที่ 2 ของหน้า หัวข้อ "scented bag ถุงหอม (เม็ดหอม)"
 *   (ตารางที่ 1 คือ "Scented Stone แผ่นหินน้ำหอม" — คนละสินค้า หัวคอลัมน์เกือบเหมือนกัน
 *    ต่างกันที่คอลัมน์แรก "แผ่นหินน้ำหอม" กับ "เฉพาะเม็ดหอม" จึงต้องยึดหัวข้อเหนือตาราง)
 *
 * สคริปต์อ่านตารางสดจากเว็บทุกครั้ง แล้วตรวจกับค่าที่รู้จัก (EXPECT ด้านล่าง)
 * ราคาบนเว็บเปลี่ยนเมื่อไหร่ รันซ้ำได้เลย — ถ้าโครงตารางเปลี่ยนจนอ่านไม่ตรง สคริปต์จะหยุดและบอกว่าเพี้ยนตรงไหน
 *
 * โครงราคา: เว็บแยกเป็น "ราคาเม็ดหอม" + "add on ค่าถุง" คนละคอลัมน์ และค่าถุงก็ลดตามจำนวนด้วย
 * ในระบบเราทำเป็นตารางแกนเดียว 4 คอลัมน์ = ราคาสุทธิต่อชิ้นที่ลูกค้าจ่ายจริง (เม็ดหอม + ถุง)
 * ลูกค้าเลือกทีเดียวจบ ไม่ต้องบวกเอง · ราคาที่ได้ตรงกับเว็บทุกช่อง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  hasQuoteOption,
  priceRange,
  type PriceMatrix,
  type PriceTier,
  type Product,
  type ProductOption,
} from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const UPLOAD = process.argv.includes("--upload");
const IMAGES_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
) as Record<string, string>;

const ID = "scented-bag";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

const PAGE = "https://www.iduckyofficial-pricelists.com/" + encodeURIComponent("รับทำแผ่นหินน้ำหอม");
const SECTION = "scented bag";
const UNIT = "ชิ้น";

const FORM_LABEL = "รูปแบบ / ถุงใส่";
const F_BEADS = "เฉพาะเม็ดหอม (ไม่มีถุงผ้า)";
const F_BAG10 = "+ ถุงผ้า 10x10 ซม.";
const F_BAG1113 = "+ ถุงผ้า 11x13 ซม.";
const F_DRAWSTRING = "+ ถุงหูรูด 11x12.5 ซม.";
const FORMS = [F_BEADS, F_BAG10, F_BAG1113, F_DRAWSTRING];

const FABRIC_LABEL = "ชนิดผ้าถุง";
const FAB_SATIN = "ผ้าซาตินอินโด";
const FAB_DUCHESS = "ผ้าดัชเชส";
const FAB_BARBIE = "ผ้าบาร์บี้";

const FORM_IMG: Record<string, string> = {
  [F_BEADS]: IMG("form-beads"),
  [F_BAG10]: IMG("form-bag10"),
  [F_BAG1113]: IMG("form-bag1113"),
  [F_DRAWSTRING]: IMG("form-drawstring"),
};
/**
 * ⛔ กลุ่ม "ชนิดผ้าถุง" ไม่มีภาพประจำตัวเลือก — เคยวาดภาพเทียบความเงาไว้ แต่ผู้ใช้ตรวจแล้วว่า
 * ไม่ตรงกับผ้าจริง เลยถอดออกทั้งชุด (ทั้งปุ่มตัวเลือกและแท็บ) · จะใส่กลับได้ก็ต่อเมื่อมีรูปถ่ายผ้าจริง
 */

/* ── 1. ดึงตารางราคาสดจากเว็บ ─────────────────────────────────────── */

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** ตารางแรกที่อยู่ถัดจากหัวข้อ "scented bag" (ต้องชิดกัน ไม่เกิน 2000 ตัวอักษร) */
function sectionTable(html: string): string[][] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 2000) continue;
    const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน") return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

/** หัวคอลัมน์ที่ควรเป็น (คอลัมน์ "add on" เป็นช่องเครื่องหมาย + ไม่ใช่ราคา) */
const HEAD = ["จำนวน", "เฉพาะเม็ดหอม", "add on", "ถุงผ้า 10x10cm", "ถุงผ้า 11x13cm", "ถุงหูรูด 11x12.5cm"];
/** ค่าที่เคยอ่านได้ (13 ส.ค. 69) — ใช้เตือนเมื่อเว็บขยับราคา ไม่ได้เอาไปใช้แทนค่าจริง */
const EXPECT = [
  ["1-10", "90", "+", "100", "110", "120"],
  ["11-29", "80", "+", "95", "105", "110"],
  ["30-49", "75", "+", "90", "100", "100"],
  ["50 ขึ้นไป", "70", "+", "85", "95", "90"],
];

async function loadPricing(): Promise<PriceMatrix> {
  const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
    if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
    return r.text();
  });

  const rows = sectionTable(html);
  if (JSON.stringify(rows[0]) !== JSON.stringify(HEAD))
    throw new Error(`หัวคอลัมน์บนเว็บไม่ตรงกับที่รู้จัก:\n  เว็บ: ${JSON.stringify(rows[0])}\n  ที่รู้จัก: ${JSON.stringify(HEAD)}`);
  if (rows.length - 1 !== EXPECT.length) throw new Error(`ตารางมี ${rows.length - 1} ช่วงจำนวน (เดิม ${EXPECT.length}) — ตรวจก่อน`);

  const num = (v: string, where: string) => {
    const n = Number(String(v).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคา ${where} อ่านไม่ออก ("${v}")`);
    return n;
  };

  const TIERS: PriceTier[] = rows.slice(1).map((r, i) => ({
    upTo: i === rows.length - 2 ? null : Number(r[0].match(/(\d+)\s*[-–]\s*(\d+)/)?.[2] ?? 0) || null,
    label: `${r[0].replace(/\s*ขึ้นไป\s*$/, "")} ${UNIT}${/ขึ้นไป/.test(r[0]) ? "ขึ้นไป" : ""}`,
  }));
  if (TIERS.some((t, i) => i < TIERS.length - 1 && !t.upTo)) throw new Error("อ่านช่วงจำนวนจากตารางไม่ครบ — ตรวจก่อน");

  /** ราคาสุทธิต่อชิ้น = ราคาเม็ดหอม + ค่าถุงของช่วงนั้น (คอลัมน์ 2 = "add on" ข้ามไป) */
  const cells: Record<string, number[]> = {};
  cells[F_BEADS] = rows.slice(1).map((r) => num(r[1], `เฉพาะเม็ดหอม / ${r[0]}`));
  [F_BAG10, F_BAG1113, F_DRAWSTRING].forEach((form, i) => {
    cells[form] = rows.slice(1).map((r, ti) => cells[F_BEADS][ti] + num(r[3 + i], `${HEAD[3 + i]} / ${r[0]}`));
  });

  const drift = rows
    .slice(1)
    .flatMap((r, ri) => r.map((v, ci) => (v === EXPECT[ri][ci] ? null : `${HEAD[ci]} / ${r[0]}: เว็บ "${v}" (เดิม "${EXPECT[ri][ci]}")`)))
    .filter(Boolean);
  if (drift.length) console.log(`⚠️  ราคาบนเว็บเปลี่ยนจากครั้งก่อน:\n   ${drift.join("\n   ")}\n   (สคริปต์ใช้ค่าจากเว็บเป็นหลัก — อัปเดต EXPECT ในไฟล์นี้ด้วย)`);

  return { unit: UNIT, driverLabels: [FORM_LABEL], tiers: TIERS, cells };
}


/* ── 2. ประกอบสินค้า ──────────────────────────────────────────────── */

function buildProduct(PRICING: PriceMatrix) {
  const cells = PRICING.cells;
  const TIERS = PRICING.tiers;

  const options: ProductOption[] = [
    {
      label: FORM_LABEL,
      stockBearing: true,
      choices: [
        { name: F_BEADS, imageSrc: FORM_IMG[F_BEADS] },
        { name: F_BAG10, imageSrc: FORM_IMG[F_BAG10], popular: true },
        { name: F_BAG1113, imageSrc: FORM_IMG[F_BAG1113] },
        { name: F_DRAWSTRING, imageSrc: FORM_IMG[F_DRAWSTRING] },
      ],
    },
    {
      label: FABRIC_LABEL,
      stockBearing: true,
      // เลือกเฉพาะตอนสั่งแบบมีถุงผ้า — สั่งเม็ดหอมล้วนไม่ต้องถาม
      showWhen: { label: FORM_LABEL, choices: [F_BAG10, F_BAG1113, F_DRAWSTRING] },
      choices: [
        { name: FAB_SATIN, popular: true },
        { name: FAB_DUCHESS },
        { name: FAB_BARBIE },
      ],
    },
  ];

  const TABS: Product["tabs"] = [
    {
      title: "รายละเอียดเพิ่มเติม",
      text:
        "ถุงหอม (เม็ดหอม) — เม็ดหอมสีใส ขนาด 30 กรัม ใส่ถุงผ้าพิมพ์ลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต\n" +
        "• เม็ดหอมสีใส 30 กรัม ใช้หัวน้ำหอมพรีเมี่ยม กลิ่น Penthouse\n" +
        "• ทางร้านผสมน้ำหอมไปกับเม็ดหอมให้เรียบร้อยแล้ว ลูกค้าไม่ต้องฉีดเอง\n" +
        "• สั่งเฉพาะเม็ดหอม (ไม่มีถุงผ้า) ก็ได้ หรือจะให้ใส่ถุงผ้าพิมพ์ลายก็ได้ 3 แบบ\n" +
        "• ถุงผ้าพิมพ์ลายเต็มใบด้วยระบบ Sublimation Printing\n" +
        "• เลือกชนิดผ้าถุงได้ 3 แบบ (ซาตินอินโด · ดัชเชส · บาร์บี้) ราคาเท่ากัน\n" +
        "• เหมาะกับของชำร่วยงานแต่ง/งานบวช ของแจกงานอีเวนต์ ของฝากลูกค้า แขวนตู้เสื้อผ้า/ในรถ",
      images: [IMG("photo-1"), IMG("photo-4"), IMG("photo-7")],
      imageSize: "md",
    },
    {
      title: "แบบถุง 3 แบบ + เม็ดหอมล้วน",
      text:
        "เลือกได้ 4 รูปแบบ (ราคาต่างกันตามตาราง)::\n" +
        "• เฉพาะเม็ดหอม (ไม่มีถุงผ้า) — เม็ดหอม 30 กรัม บรรจุซองในตัว ลูกค้าเอาไปใส่บรรจุภัณฑ์เองได้\n" +
        "• ถุงผ้า 10x10 ซม. — ทรงจัตุรัสใบเล็ก เชือกสีขาวเย็บติดกับถุง ห้อยได้เลย\n" +
        "• ถุงผ้า 11x13 ซม. — ทรงสูงใบใหญ่สุด เจาะรูตาไก่ร้อยเชือกสีขาว\n" +
        "• ถุงหูรูด 11x12.5 ซม. — ปากถุงรูดเชือกสองข้าง เปิด-ปิดได้ ใช้เม็ดหอมหมดแล้วใส่ของอื่นต่อได้\n\n" +
        "หมายเหตุ::\n" +
        "• ถุงผ้าแต่ละใบตัดเย็บมือ ขนาดอาจคลาดเคลื่อน 2-5 ซม.\n" +
        '• หน้าตารางราคาของร้านเขียนถุงแบบที่ 4 ไว้สองชื่อ ("ถุงหูรูด" ในตาราง · "ถุงหูหิ้ว" ในรายละเอียด) — ของจริงคือถุงหูรูด ตามรูปงานจริง',
      images: [IMG("form-beads"), IMG("form-bag10"), IMG("form-bag1113"), IMG("form-drawstring")],
      imageSize: "md",
    },
    {
      title: "ชนิดผ้า 3 แบบ",
      text:
        "ผ้าถุงเลือกได้ 3 ชนิด ราคาเท่ากันทุกแบบ::\n" +
        "• ผ้าซาตินอินโด — เงาวาว ผิวลื่นมัน สีลายสดที่สุด เนื้อบางทิ้งตัว (แบบมาตรฐาน)\n" +
        "• ผ้าดัชเชส — เนื้อหนากว่า ถุงตั้งอยู่ทรง เงานวลกระจายทั้งใบ ดูมีราคา\n" +
        "• ผ้าบาร์บี้ — ผิวเนียนนุ่มมือ เงาน้อยที่สุด โทนภาพนุ่มตา เหมาะกับลายพาสเทล\n\n" +
        "ข้อควรรู้::\n" +
        "• งานพิมพ์ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน/ผ้าเฉพาะเท่านั้น\n" +
        "• อยากดูเนื้อผ้าจริงก่อนสั่ง ทักไลน์ร้านขอดูรูปตัวอย่างได้",
    },
    {
      title: "ข้อจำกัดของงาน",
      text:
        "🚨 ข้อจำกัดในการผลิต::\n" +
        "• ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%\n" +
        "• ถุงผ้าแต่ละใบมีความคลาดเคลื่อนของขนาด 2-5 ซม.\n" +
        "• งานผ้าอาจมีรอยยับ จุดฝุ่นเล็กน้อย และการเคลื่อนของลายพิมพ์ ซึ่งไม่กระทบกับการใช้งาน\n" +
        "• เม็ดหอมเป็นวัสดุที่ระเหยกลิ่นตามเวลา ความแรงของกลิ่นจะค่อย ๆ ลดลงตามอายุการใช้งาน\n" +
        "• เม็ดหอมผสมน้ำหอมมาแล้ว ไม่ควรโดนความร้อน/แดดจัด และเก็บให้พ้นมือเด็กและสัตว์เลี้ยง",
    },
    {
      title: "วิธีสั่งงาน",
      text:
        "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
        "• เลือกรูปแบบ (เม็ดหอมล้วน หรือ ใส่ถุงแบบไหน) · เลือกชนิดผ้า แล้วใส่จำนวน\n" +
        '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
        '• ระบุรายละเอียดเพิ่มในช่อง "หมายเหตุถึงร้าน" เช่น วันที่ใช้งาน · สีเชือก\n' +
        "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย\n\n" +
        "หรือสั่งทางอีเมล::\n" +
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
        "• ระบุ: ประเภทงาน · ขนาด · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
        "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)\n" +
        "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส",
    },
    {
      title: "การรับประกันสินค้า",
      text:
        "รับเคลม::\n" +
        "• สีเพี้ยนเกิน 10-15%\n" +
        "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
        "• อะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
        "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
        "ไม่รับเคลม::\n" +
        "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
        "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
        "ระยะเวลาในการเคลม::\n" +
        "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ];

  const seo: Product["seo"] = {
    title: `รับทำ ถุงหอม (เม็ดหอม) พิมพ์ลาย เริ่ม ${cells[F_BEADS].at(-1)} บาท | iDucky`,
    description:
      "รับผลิตถุงหอม เม็ดหอมสีใส 30 กรัม กลิ่น Penthouse ใส่ถุงผ้าพิมพ์ลายตามสั่ง " +
      "เลือกได้ 3 แบบ (ถุงผ้า 10x10 · 11x13 · ถุงหูรูด 11x12.5 ซม.) 3 ชนิดผ้า พิมพ์ซับลิเมชั่นเต็มใบ ไม่มีขั้นต่ำ " +
      "เหมาะเป็นของชำร่วยงานแต่ง งานบวช ของแจกอีเวนต์",
    keywords: [
      "ถุงหอม",
      "เม็ดหอม",
      "scented bag",
      "ถุงหอมพิมพ์ลาย",
      "ของชำร่วยงานแต่ง",
      "ของชำร่วยงานบวช",
      "ถุงหูรูดพิมพ์ลาย",
      "ถุงผ้าซาตินพิมพ์ลาย",
      "iDucky",
    ],
    faqs: [
      {
        q: "ถุงหอม (เม็ดหอม) ราคาเท่าไหร่?",
        a:
          `เฉพาะเม็ดหอม 30 กรัม เริ่มชิ้นละ ${cells[F_BEADS].at(-1)} บาท (50 ชิ้นขึ้นไป) · สั่ง 1-10 ชิ้น ชิ้นละ ${cells[F_BEADS][0]} บาท · ` +
          `ถ้าให้ใส่ถุงผ้าด้วย เริ่มที่ชิ้นละ ${cells[F_BAG10][0]} บาท (ถุง 10x10 ซม. ที่ 1-10 ชิ้น) และลดลงตามจำนวนที่สั่ง`,
      },
      {
        q: "เม็ดหอมกลิ่นอะไร ต้องฉีดน้ำหอมเองไหม?",
        a: "เม็ดหอมสีใส 30 กรัม ใช้หัวน้ำหอมพรีเมี่ยม กลิ่น Penthouse · ทางร้านผสมน้ำหอมไปกับเม็ดหอมให้เรียบร้อยแล้ว ลูกค้าไม่ต้องฉีดเอง แกะใช้ได้เลย",
      },
      {
        q: "ถุงมีกี่แบบ ต่างกันยังไง?",
        a:
          "3 แบบ — ถุงผ้า 10x10 ซม. เชือกสีขาวเย็บติดกับถุง · ถุงผ้า 11x13 ซม. เจาะรูตาไก่ร้อยเชือกสีขาว · ถุงหูรูด 11x12.5 ซม. ปากถุงรูดเชือกเปิด-ปิดได้ · " +
          "หรือจะสั่งเฉพาะเม็ดหอมไม่เอาถุงก็ได้",
      },
      {
        q: "ผ้าถุงเลือกได้กี่ชนิด ราคาต่างกันไหม?",
        a: "3 ชนิด — ผ้าซาตินอินโด (เงาวาว) · ผ้าดัชเชส (หนา อยู่ทรง) · ผ้าบาร์บี้ (เนียนนุ่ม เงาน้อย) · ราคาเท่ากันทุกชนิด เลือกได้ตอนสั่ง",
      },
      {
        q: "สั่งขั้นต่ำกี่ชิ้น พิมพ์ลายเองได้ไหม?",
        a: "ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ได้ (คิดเรทราคาปลีก) · ถุงผ้าพิมพ์ลายของลูกค้าได้เต็มใบด้วยระบบซับลิเมชั่น · ขนาดถุงที่เย็บจริงคลาดเคลื่อนได้ 2-5 ซม.",
      },
    ],
  };

  const product: Product = {
    id: ID,
    slug: "scented-bag",
    name: "ถุงหอม (เม็ดหอม)",
    category: "gifts",
    price: cells[F_BEADS].at(-1)!,
    emoji: "🌸",
    gradient: "from-sky-100 to-amber-100",
    imageSrc: IMG("photo-1"),
    seo,
    rating: 5,
    sold: 0,
    badge: "ใหม่",
    hidden: true, // เข้าเป็นฉบับร่างก่อน — ตรวจแล้วค่อยกดเผยแพร่ที่ /admin/products
    description:
      "ถุงหอมเม็ดหอมสีใส 30 กรัม ใช้หัวน้ำหอมพรีเมี่ยมกลิ่น Penthouse (ร้านผสมน้ำหอมมาให้แล้ว ไม่ต้องฉีดเอง) " +
      "สั่งเฉพาะเม็ดหอม หรือให้ใส่ถุงผ้าพิมพ์ลายตามสั่งก็ได้ เลือกถุงได้ 3 แบบ (10x10 ซม. · 11x13 ซม. · ถุงหูรูด 11x12.5 ซม.) " +
      "และเลือกชนิดผ้าได้ 3 แบบ พิมพ์ลายเต็มใบระบบซับลิเมชั่น ไม่มีขั้นต่ำในการสั่งผลิต",
    highlights: [
      "เม็ดหอมสีใส 30 กรัม กลิ่น Penthouse (หัวน้ำหอมพรีเมี่ยม)",
      "ร้านผสมน้ำหอมมากับเม็ดหอมให้แล้ว แกะใช้ได้เลย",
      "เลือกได้ 4 รูปแบบ — เม็ดหอมล้วน · ถุง 10x10 · ถุง 11x13 · ถุงหูรูด 11x12.5 ซม.",
      "ผ้าถุง 3 ชนิด — ซาตินอินโด · ดัชเชส · บาร์บี้ (ราคาเท่ากัน)",
      "พิมพ์ลายเต็มใบ ระบบซับลิเมชั่น ไม่มีขั้นต่ำ",
      "ของชำร่วยงานแต่ง/งานบวช ของแจกอีเวนต์ ของฝากลูกค้า",
    ],
    images: [
      { emoji: "🌸", gradient: "from-sky-100 to-amber-100", label: "งานจริง — ถุงหอมลายเช็ค (เห็นซองเม็ดหอมด้านใน)", src: IMG("photo-1") },
      { emoji: "📏", gradient: "from-sky-100 to-indigo-100", label: "ถุงผ้า 10x10 ซม. เทียบกับ 11x13 ซม.", src: IMG("photo-2") },
      { emoji: "🎀", gradient: "from-rose-100 to-red-100", label: "ถุงหูรูด 11x12.5 ซม. พิมพ์ลายเต็มใบ", src: IMG("photo-3") },
      { emoji: "🖨️", gradient: "from-amber-100 to-yellow-100", label: "พิมพ์ลายได้ทั้งใบ ทุกแบบ", src: IMG("photo-4") },
      { emoji: "💝", gradient: "from-slate-100 to-sky-100", label: "ถุงหอม + ริบบิ้น JUST FOR YOU", src: IMG("photo-5") },
      { emoji: "🎄", gradient: "from-red-100 to-emerald-100", label: "งานเทศกาล — ถุงหูรูดลาย Merry Christmas", src: IMG("photo-6") },
      { emoji: "🎁", gradient: "from-violet-100 to-fuchsia-100", label: "จัดเซ็ตเป็นของชำร่วย/ของฝาก", src: IMG("photo-7") },
      { emoji: "✨", gradient: "from-orange-100 to-amber-100", label: "ลายพิมพ์คมชัด งานซับลิเมชั่น", src: IMG("photo-8") },
    ],
    options,
    pricing: PRICING,
    priceRates: [
      {
        id: "r1",
        label: "ราคาถุงหอม (เม็ดหอม)",
        desc: "ราคาต่อชิ้น รวมเม็ดหอม 30 กรัม + ถุงตามแบบที่เลือก · ไม่มีขั้นต่ำ",
        imageSrc: IMG("photo-1"),
        pricing: PRICING,
      },
    ],
    terms: [
      "ราคาตามตารางคิดต่อชิ้น รวมเม็ดหอม 30 กรัม กับถุงตามแบบที่เลือกแล้ว (ตรงตามตาราง scented bag ของร้าน)",
      "เม็ดหอมสีใส 30 กรัม ใช้หัวน้ำหอมพรีเมี่ยม กลิ่น Penthouse — ทางร้านผสมน้ำหอมไปกับเม็ดหอมให้เลย",
      "ไม่มีขั้นต่ำในการสั่งผลิต · ถุงผ้าพิมพ์ลายเต็มใบด้วยระบบ Sublimation Printing",
      "ถุงผ้ามีให้เลือก 3 ชนิด: ผ้าซาตินอินโด | ผ้าดัชเชส | ผ้าบาร์บี้ (ราคาเท่ากัน)",
      "ถุงผ้า 10x10 ซม. เป็นแบบเชือกห้อยสีขาวเย็บติดกับถุง · ถุงผ้า 11x13 ซม. เจาะรูห้อยเชือกสีขาว · ถุงหูรูด 11x12.5 ซม. ปากถุงรูดเชือก",
      "ถุงผ้าแต่ละใบมีความคลาดเคลื่อนของขนาด 2-5 ซม.",
      "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
      "เม็ดหอมระเหยกลิ่นตามเวลา ความแรงของกลิ่นจะค่อย ๆ ลดลง · เก็บให้พ้นแดดจัด ความร้อน มือเด็กและสัตว์เลี้ยง",
    ].join("\n"),
    tabs: TABS,
  };

  const range = priceRange(product);
  const saved: Product = {
    ...product,
    ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
    priceMin: range.min,
    priceMax: range.max,
    savedAt: new Date().toISOString(),
  };

  return saved;
}

const FILES = [
  "photo-1",
  "photo-2",
  "photo-3",
  "photo-4",
  "photo-5",
  "photo-6",
  "photo-7",
  "photo-8",
  "form-beads",
  "form-bag10",
  "form-bag1113",
  "form-drawstring",
];

const sb = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้> (รัน node scripts/scented-bag-art.mjs ก่อน)");
  const client = sb();
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await client.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}-${REV}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

async function main() {
  if (UPLOAD) await uploadImages();

  const PRICING = await loadPricing();
  const { cells, tiers: TIERS } = PRICING;
  const saved = buildProduct(PRICING);
  const range = { min: saved.priceMin!, max: saved.priceMax! };

  console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category}`);
  console.log(`   ราคา ${range.min}-${range.max} บาท/${UNIT} · ตัวเลือก ${saved.options.length} กลุ่ม · รูป ${saved.images.length} ภาพ`);
  console.log(`   ตารางราคาจากเว็บ: ${FORMS.length} แบบ × ${TIERS.length} ช่วงจำนวน`);
  console.log(`   ${"".padEnd(26)} ${TIERS.map((t) => t.label.padStart(13)).join(" ")}`);
  for (const form of FORMS) console.log(`   ${form.padEnd(26)} ${cells[form].map((v) => `฿${v}`.padStart(13)).join(" ")}`);
  const choices = saved.options.flatMap((o) => o.choices);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }

  const client = sb();
  const { data: exist } = await client.from("products").select("id,sort").eq("id", ID).maybeSingle();
  const { data: maxRow } = await client.from("products").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = (exist?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
  const { error } = await client.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: false,
      badge: saved.badge ?? null,
      sort,
      data: saved,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  console.log(`\n✅ บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

/**
 * สร้างสินค้า "อะคริลิคกระจก" (new-mt2rqayf-7835) — ร่างเปล่าที่ผู้ใช้เปิดไว้
 *
 *   npx tsx scripts/acrylic-mirror-build.mts            # ดึงตารางสด + ตรวจ (ไม่อัปรูป ไม่เขียน)
 *   npx tsx scripts/acrylic-mirror-build.mts --write    # อัปรูป + บันทึกลง Supabase (ฉบับร่าง)
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/อคลกระจก
 *   หน้าเดียวมี 3 แท็บ (พวงกุญแจกระจก · สแตนดี้กระจก · Griptok)
 *   ⚠️ แท็บ Griptok เป็นตารางเดียวกับสินค้า griptok-mirror ที่ขายอยู่แล้ว — ผู้ใช้เคาะ 1 ก.ย. 69
 *      ว่าตัวนี้เอาแค่ "พวงกุญแจ + สแตนดี้" สคริปต์จึงอ่านแท็บ Griptok มาเทียบกันซ้ำ แต่ไม่เอามาใช้
 *
 *   ตารางตัวชิ้นงาน (พวงกุญแจ = สแตนดี้ ราคาเท่ากันเป๊ะ ๆ ทั้งสองแท็บ):
 *     จำนวน            4cm  5cm  6cm
 *     1-10 ชิ้น        120  120  120
 *     11-49 ชิ้น        89   99  109
 *     50-199 ชิ้น       85   95  105
 *     200-499 ชิ้น      80   90  100
 *     500-999 ชิ้น      75   85   95
 *     1,000 ขึ้นไป      70   80   90
 *   หมายเหตุใต้ตาราง: 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น ไม่ถึงคิดราคาปลีก
 *
 * ขนาด: ตารางบนเว็บมีแค่ 4/5/6cm แต่แผ่นราคาของร้านเอง (ไดรฟ์ 10_อะคริลิค/.../P-nacl Mirror-01.jpg)
 *   เขียนไว้ว่า "เพิ่มขนาด บวกเพิ่ม cm ละ 15 บาท" — ผู้ใช้เคาะ 1 ก.ย. 69 ให้คิดอัตโนมัติตามนี้
 *   → กลุ่ม "ขนาด" มีตัวเลือก "กำหนดขนาดเอง" (sizeInput overRate 15) เกาะแถว 6cm แล้วบวกส่วนเกิน
 *     เพดานที่ระบบคิดเองคือ 20 ซม. (เท่าฐานสแตนดี้ใหญ่สุดที่ร้านมี) ใหญ่กว่านั้นตกไปให้แอดมินตีราคา
 *   ⚠️ overRate ของ sizeInput เป็นของใหม่ที่เพิ่มใน src/lib/products.ts รอบนี้ (เดิมเกินตาราง = ตีราคาอย่างเดียว)
 *
 * อะไหล่ 2 ฝั่ง โคลนสดจากชุดกลางทุกครั้งที่รัน (ชุดกลางขยับ = รันทับตัวนี้ตาม):
 *   • พวงกุญแจ → ชุดตะขอ/ห่วง + แท็บ "ตะขอ / ห่วง" จาก Acrylic Kit
 *   • สแตนดี้  → ระบบฐานสแตนดี้ (ฐาน/ขนาดฐาน/ทรงฐาน/สีฐาน + เฉดพิเศษ 19 กลุ่ม) จาก standy
 *   สคริปต์ assert ค่าฐานของ standy กับตารางฐานบนหน้านี้ก่อนโคลน
 *   ⚠️ ตาราง "ราคาฐานอะคริลิคพิเศษ" บนหน้านี้เป็นฉบับย่อ (11-13cm=15 · 14-16cm=20) ไม่ตรงกับ
 *      /pricestandy ที่ละเอียดกว่า (12=20 · 13=25 · 14=30 …) — ยึดชุดกลาง/pricestandy แล้วเตือนไว้
 *
 * ภาพประกอบตัวเลือก (ผู้ใช้สั่ง 1 ก.ย. 69 — "อยากเห็นว่าแต่ละแบบหน้าตาเป็นแบบไหน"):
 *   สร้างด้วย scripts/acrylic-mirror-art.py จากภาพงานจริงบนหน้าเว็บ → scripts/assets/acrylic-mirror/
 *   ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขยับ V
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  hasQuoteOption,
  needsQuote,
  priceRange,
  sizeInputPlan,
  unitPriceFor,
  type PriceTier,
  type Product,
  type ProductOption,
} from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2rqayf-7835";
const EXPECT_NAME = "อะคริลิคกระจก";
const SLUG = "acrylic-mirror";
const V = "v1";
const IMG_DIR = fileURLToPath(new URL("./assets/acrylic-mirror/", import.meta.url));
const PAGE =
  "https://www.iduckyofficial-pricelists.com/%E0%B8%AD%E0%B8%84%E0%B8%A5%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%88%E0%B8%81";

const SRC_HOOK = "new-mt2rpb1j-2194"; // Acrylic Kit — ต้นแบบชุดตะขอ (คิดค่าอะไหล่ตั้งแต่ชิ้นแรก)
const SRC_BASE = "standy"; // สแตนดี้อะคริลิค — ต้นแบบระบบฐานสแตนดี้

const FORM = "รูปแบบงาน";
const FORM_KEYRING = "พวงกุญแจกระจก";
const FORM_STANDEE = "สแตนดี้กระจก";
const SIZE = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (สูง)";
const OVER_RATE = 15; // เกินแถวใหญ่สุดในตาราง (6cm) บวก ซม. ละ 15 บาท/ชิ้น (แผ่นราคาของร้าน)
const ASK_OVER = 20; // เพดานที่ระบบคิดเองได้ — ใหญ่กว่านี้ให้แอดมินตีราคา
const HOOK_TAB = "ตะขอ / ห่วง";
const HOOK_NONE = "ไม่รับตะขอ (เจาะรูอย่างเดียว)";

/** กลุ่มตะขอที่ยกมาจาก Acrylic Kit (ไม่เอาเกต "รับตะขอไหม" — ที่นี่ใช้ "รูปแบบงาน" เป็นเกต) */
const HOOK_GROUPS = [
  "ตะขอ",
  "สีตะขอ AA",
  "สีตะขอ AB",
  "สีตะขอ C (โซ่ไข่ปลา)",
  "สีตะขอ G",
  "สีตะขอ H",
  "สีตะขอ I",
  "สีตะขอ R (โลหะ)",
  "สีตะขอ · เงิน/ทอง (D/X)",
  "สีตะขอ S",
  "สีตะขอ T",
  "สีตะขอ U",
  "สีตะขอ W",
  "สีตะขอ · โลหะ (F/J/K/L/M/N/O)",
];
/** กลุ่มฐานสแตนดี้ที่ยกมาจาก standy (กลุ่มเฉดพิเศษ 19 กลุ่มเก็บด้วย prefix) */
const BASE_GROUPS = ["ฐานสแตนดี้", "ขนาดฐาน", "ทรงฐาน", "สีอะคริลิคฐาน"];
const BASE_SHADE_PREFIX = "เลือกสีพิเศษของฐาน";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
/**
 * รูปที่แก้ทีหลังต้องขึ้นเลขรุ่นใหม่ (อัปทับชื่อไฟล์เดิมไม่ได้ CDN/Next แคชไว้)
 * form-standee v2 = 1 ก.ย. 69 ผู้ใช้ทักว่าภาพเดิมเป็น Griptok ไม่ใช่สแตนดี้ → เปลี่ยนเป็นภาพวาด
 * size-custom  v2 = 1 ก.ย. 69 เปลี่ยนกติกาเกิน 6 ซม. จาก "แอดมินตีราคา" เป็น "+15/ซม." ข้อความบนการ์ดเลยเปลี่ยนตาม
 */
const REV: Record<string, string> = { "form-standee": "v2", "size-custom": "v2" };
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${SLUG}/${name}-${REV[name] ?? V}.jpg`;

/* ── 1. ตารางราคาสดจากหน้าเว็บ ─────────────────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) =>
  decode(String(s).replace(/\x00/g, "").replace(/<[^>]+>/g, " ")).replace(/​/g, "").replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then(
  (r) => {
    if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
    return r.text();
  }
);
const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) =>
  [...m[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  )
);

/** ตารางตัวชิ้นงาน = หัว "จำนวน | 4cm | 5cm | 6cm" (หน้านี้มี 3 ใบ: พวงกุญแจ · สแตนดี้ · Griptok) */
const bodyTables = tables.filter((rows) => rows[0]?.join("|") === "จำนวน|4cm|5cm|6cm");
if (bodyTables.length !== 3)
  throw new Error(`คาดว่าจะเจอตาราง "จำนวน/4cm/5cm/6cm" 3 ใบ (พวงกุญแจ · สแตนดี้ · Griptok) แต่เจอ ${bodyTables.length} ใบ`);
const key = (rows: string[][]) => rows.map((r) => r.join("|")).join("¶");
const [keyring, standee, griptok] = bodyTables;
if (key(keyring) !== key(standee))
  throw new Error("ตารางแท็บพวงกุญแจกับสแตนดี้ไม่ตรงกันแล้ว — เว็บแยกราคา 2 แบบ ต้องแยกเรทก่อน");
if (key(griptok) === key(keyring)) throw new Error("ตารางแท็บ Griptok ดันเท่ากับพวงกุญแจ — หยิบตารางผิดใบ ตรวจก่อน");

const TIERS: PriceTier[] = keyring.slice(1).map((r) => {
  const m = r[0].match(/([\d,]+)\s*[-–]\s*([\d,]+)/);
  return { upTo: m ? Number(m[2].replace(/,/g, "")) : null, label: r[0] };
});
if (TIERS.some((t, i) => i < TIERS.length - 1 && !t.upTo) || TIERS[TIERS.length - 1].upTo !== null)
  throw new Error(`ช่วงจำนวนอ่านไม่ครบ (${TIERS.map((t) => t.label).join(" · ")})`);

const SIZES = keyring[0].slice(1); // ["4cm","5cm","6cm"]
const PRICES: Record<string, number[]> = Object.fromEntries(
  SIZES.map((s, col) => [
    s,
    keyring.slice(1).map((r) => {
      const n = Number(String(r[col + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ช่องราคา ${s} แถว "${r[0]}" อ่านไม่ออก ("${r[col + 1]}")`);
      return n;
    }),
  ])
);
for (const s of SIZES) {
  const p = PRICES[s];
  if (p[0] > 300 || p.some((v, i) => i > 0 && v > p[i - 1]))
    throw new Error(`ราคาขนาด ${s} ผิดคาด (${p.join(", ")}) — ตรวจหน้าเว็บก่อน`);
}
const FROM = PRICES[SIZES[0]][PRICES[SIZES[0]].length - 1]; // 70 บาท/ชิ้น (4cm · 1,000 ชิ้นขึ้นไป)

console.log(`📊 ตาราง "สกรีนลายบนอะคริลิคกระจก" จากเว็บ — ${TIERS.length} ช่วงจำนวน × ${SIZES.length} ขนาด`);
for (const s of SIZES) console.log(`   ${s.padEnd(5)}`, PRICES[s].join(" / "));
console.log(`   (แท็บ Griptok ${griptok[1].slice(1).join("/")} → ไม่เอามาใช้ ขายอยู่แล้วที่สินค้า griptok-mirror)`);

/** ตารางค่าฐาน "ไม่สกรีนฐาน / สกรีนฐาน" — เอามา assert กับชุดกลางของ standy */
const feeTable = tables.find((rows) => rows.some((r) => r[0] === "ไม่สกรีนฐาน"));
if (!feeTable) throw new Error("ไม่เจอตารางค่าฐานสแตนดี้ในหน้านี้ — โครงหน้าเว็บเปลี่ยน");
const feeHeads = feeTable[0].slice(1);
const rowOf = (name: string) => feeTable.find((r) => r[0] === name)!.slice(1).map(Number);
const plainRow = rowOf("ไม่สกรีนฐาน");
const printRow = rowOf("สกรีนฐาน");
const BASE_FEE: Record<number, number> = {};
feeHeads.forEach((h, i) => {
  const m = h.match(/^(\d+)(?:-(\d+))?/);
  if (!m) throw new Error(`หัวคอลัมน์ตารางฐานอ่านไม่ออก: "${h}"`);
  for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) BASE_FEE[s] = plainRow[i];
  if (+m[1] === 3) BASE_FEE[2] = plainRow[i]; // ตารางเริ่ม 3-5cm — ฐาน 2cm ใช้ช่วงเดียวกัน (ตรรกะ standy เดิม)
});
const printDiff = new Set(feeHeads.map((_, i) => printRow[i] - plainRow[i]));
if (printDiff.size !== 1) throw new Error(`ส่วนต่าง "สกรีนฐาน" ไม่คงที่: ${[...printDiff].join(",")}`);
const PRINT_FEE = [...printDiff][0];
console.log(`📐 ตารางค่าฐาน: 2-20cm = ${Object.values(BASE_FEE).join(",")} · สกรีนฐาน +${PRINT_FEE}`);

/* ── 2. ชุดกลาง: ตะขอจาก Acrylic Kit · ฐานจาก standy ─────────────────── */
const load = async (id: string) => {
  const { data, error } = await sb.from("products").select("name,data").eq("id", id).single();
  if (error) throw new Error(`อ่านสินค้า ${id} ไม่สำเร็จ — ${error.message}`);
  return data as { name: string; data: any };
};
const [kit, standy, current] = await Promise.all([load(SRC_HOOK), load(SRC_BASE), load(ID)]);
if (current.name !== EXPECT_NAME)
  throw new Error(`id ${ID} ชื่อ "${current.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดกันเขียนทับผิดตัว`);

const optOf = (d: any, label: string): ProductOption | undefined =>
  (d.options ?? []).find((o: ProductOption) => o.label === label);

// ── 2.1 ตะขอ (เกต = รูปแบบงาน พวงกุญแจ) ──
const missingHook = HOOK_GROUPS.filter((g) => !optOf(kit.data, g));
if (missingHook.length) throw new Error(`Acrylic Kit ไม่มีกลุ่ม: ${missingHook.join(", ")} — โครงต้นแบบเปลี่ยน`);
const kitHook = optOf(kit.data, "ตะขอ")! as any;
if (kitHook.freeWhen || kitHook.smallQtyFee)
  throw new Error('กลุ่ม "ตะขอ" ของ Kit ยังมี freeWhen/smallQtyFee — ต้องรัน acrylic-kit-hook-price-first-piece.mjs ก่อน');

const keyringOn = { label: FORM, choices: [FORM_KEYRING] };
const hookOptions: ProductOption[] = HOOK_GROUPS.map((label) => {
  const o = structuredClone(optOf(kit.data, label)!) as any;
  if (label === "ตะขอ") {
    o.showWhen = keyringOn; // เดิมชี้เกต "รับตะขอไหม" ของ Kit
    o.display = "dropdown"; // เลือก 1 แบบต่อชิ้น (Kit เป็นติ๊กหลายแบบ + ระบุจำนวน)
    o.note =
      "เจาะรูตะขอให้ฟรี ไม่มีค่าเจาะ — เลือกตะขอ/ห่วงได้ 1 แบบต่อชิ้น คิดตามราคาอะไหล่จริงตั้งแต่ชิ้นแรก · " +
      "กดรูปแผ่นอะไหล่ด้านล่างดูของจริงทุกแบบได้ (หรือดูในแท็บ “ตะขอ / ห่วง” ท้ายหน้า) · " +
      "ต้องการหลายแบบ แจ้งในหมายเหตุถึงร้าน";
    // แผ่นอะไหล่รวมของร้าน — ตัวเลือกตะขอไม่มีรูปรายชิ้น ให้กดดูแผ่นรวมตรงนี้แทน
    o.noteImageSrc = (kit.data.tabs ?? []).find((t: any) => t.title === HOOK_TAB)?.images?.[0];
    o.choices = [{ name: HOOK_NONE }, ...o.choices.map(({ qty, qtyUnit, qtyMax, ...c }: any) => c)];
  } else {
    o.showWhenAlso = keyringOn; // เดิมชี้ "รับตะขอไหม" — showWhen (ชี้กลุ่ม "ตะขอ") คงเดิม
  }
  return o as ProductOption;
});

// ── 2.2 ฐานสแตนดี้ (เกต = รูปแบบงาน สแตนดี้) + assert ค่ากับตารางบนหน้านี้ ──
const missingBase = BASE_GROUPS.filter((g) => !optOf(standy.data, g));
if (missingBase.length) throw new Error(`standy ไม่มีกลุ่ม: ${missingBase.join(", ")} — โครงต้นแบบเปลี่ยน`);
const standySize = optOf(standy.data, "ขนาดฐาน")! as any;
if (standySize.extraFromQty !== 11) throw new Error(`standy: ขนาดฐาน extraFromQty = ${standySize.extraFromQty} (ต้องเป็น 11)`);
const badFee = standySize.choices.filter((c: any) => (c.extra ?? 0) !== BASE_FEE[parseInt(c.name)]);
if (badFee.length)
  throw new Error(
    `ค่าฐานของ standy ไม่ตรงตารางบนหน้านี้ — ${badFee.map((c: any) => `${c.name}:${c.extra}≠${BASE_FEE[parseInt(c.name)]}`).join(", ")}`
  );
const standyPrint = optOf(standy.data, "ฐานสแตนดี้")!.choices.find((c) => c.name === "สกรีนฐาน") as any;
if ((standyPrint?.extra ?? 0) !== PRINT_FEE)
  throw new Error(`ค่าสกรีนฐานของ standy (${standyPrint?.extra}) ไม่ตรงตาราง (+${PRINT_FEE})`);

// ⚠️ ตาราง "ราคาฐานอะคริลิคพิเศษ" บนหน้านี้เป็นฉบับย่อ — เทียบกับชุดกลางแล้วเตือน ไม่ throw
const specialTable = tables.find((rows) => rows.some((r) => r[0]?.includes("อะคริลิคพิเศษ")));
if (specialTable) {
  const heads = specialTable[0].slice(1);
  const vals = specialTable.find((r) => r[0].includes("อะคริลิคพิเศษ"))!.slice(1).map(Number);
  const pageFee: Record<number, number> = {};
  heads.forEach((h, i) => {
    const m = h.match(/^(\d+)(?:-(\d+))?/);
    if (m) for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) pageFee[s] = vals[i];
  });
  const diffs: string[] = [];
  for (const o of standy.data.options as any[]) {
    if (!o.label.startsWith(BASE_SHADE_PREFIX)) continue;
    const cm = parseInt(o.showWhen?.choices?.[0] ?? "");
    const mine = o.choices[0]?.extra ?? 0;
    if (pageFee[cm] != null && pageFee[cm] !== mine) diffs.push(`${cm}cm: หน้านี้ ${pageFee[cm]} · ชุดกลาง ${mine}`);
  }
  if (diffs.length)
    console.log(
      `\n   ⚠️ ค่าอะคริลิคพิเศษของฐาน — ตารางย่อบนหน้านี้ต่างจาก /pricestandy ที่ชุดกลางยึดอยู่:\n      ${diffs.join(" · ")}\n      (ใช้ชุดกลางตาม standy — ถ้าจะยึดหน้านี้แทน บอกได้)`
    );
}

const standeeOn = { label: FORM, choices: [FORM_STANDEE] };
const baseOptions: ProductOption[] = [
  ...BASE_GROUPS.map((label) => {
    const o = structuredClone(optOf(standy.data, label)!) as any;
    o.showWhen = standeeOn;
    if (label === "ทรงฐาน")
      o.note =
        "ทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม (ต้องการวงรี เลือกทรงกลมแล้วเขียนบอกในหมายเหตุถึงร้าน) · " +
        "ทรงอื่น เช่น ดาว / หัวใจ ไดคัทตามทรง บวกชิ้นละ 5 บาท";
    return o as ProductOption;
  }),
  // กลุ่มเฉดพิเศษของฐาน: showWhen (ขนาดฐาน) + showWhenAlso (สีอะคริลิคฐาน) ถูกใช้ครบแล้ว
  // → เกตชั้นที่ 3 ต้องไปอยู่ใน showWhenAll (แพตเทิร์นเดียวกับ 3d-acrylic-standee-base)
  ...(standy.data.options as any[])
    .filter((o) => o.label.startsWith(BASE_SHADE_PREFIX))
    .map((o) => {
      const c = structuredClone(o);
      c.showWhenAll = [...(c.showWhenAll ?? []), standeeOn];
      return c as ProductOption;
    }),
];

/* ── 3. ตัวสินค้า ───────────────────────────────────────────────────────── */
const MIX_NOTE = `ตั้งแต่ ${TIERS[1].label.replace(/[\d,]+-/, "").replace("ชิ้น", "")}`.trim();
const sizeCard = (s: string) => ({
  name: s,
  imageSrc: IMG(`size-${s.replace("cm", "")}`),
  desc: `สั่งเยอะเหลือชิ้นละ ${PRICES[s][PRICES[s].length - 1]} บาท (${TIERS[TIERS.length - 1].label})`,
});

const inputField = (label: string, hint: string): ProductOption => ({
  label,
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE, choices: [CUSTOM] },
  choices: [],
  input: { kind: "number", unit: "ซม.", min: 1, max: 30, placeholder: "4.5", required: true, hint },
});

const options: ProductOption[] = [
  {
    label: FORM,
    display: "cards",
    note:
      "ราคาตัวชิ้นงานเท่ากันทั้งสองแบบ — ต่างกันที่อะไหล่ที่ประกอบ: " +
      "**พวงกุญแจ** คิดค่าตะขอ/ห่วงตามแบบที่เลือก · **สแตนดี้** คิดค่าฐานตามขนาด/ทรง/สีของฐาน",
    choices: [
      {
        name: FORM_KEYRING,
        desc: "ไดคัทตามลาย เจาะรูตะขอให้ฟรี — เลือกตะขอ/ห่วงกว่า 30 แบบได้ด้านล่าง",
        imageSrc: IMG("form-keyring"),
      },
      {
        name: FORM_STANDEE,
        // ⚠️ ภาพเป็น "ภาพวาด" ไม่ใช่รูปถ่าย — ร้านยังไม่มีรูปสแตนดี้กระจกเสียบฐานสักใบ (ดูหมายเหตุในสคริปต์ภาพ)
        desc: "ตัวชิ้นงานเนื้อกระจก + ฐานอะคริลิคเสียบตั้ง เลือกขนาด/ทรง/สีฐานได้ (ค่าฐานคิดเพิ่ม)",
        imageSrc: IMG("form-standee"),
      },
    ],
  },
  {
    label: SIZE,
    display: "cards",
    note:
      "งานอะคริลิคประกบ 2 ชั้น — ด้านหน้าอะคริลิคกระจก ด้านหลังอะคริลิคขาว **หนารวมประมาณ 3 มม.** · " +
      "ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง (พวงกุญแจไม่นับรูตะขอ) · " +
      `ตารางราคามีถึง 6 ซม. — ใหญ่กว่านั้นเลือก “กำหนดขนาดเอง” ระบบคิดให้ทันที **ราคาแถว 6 ซม. + ส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น** (ใหญ่กว่า ${ASK_OVER} ซม. แอดมินตีราคาให้)`,
    noteImageSrc: IMG("tab-size-2-4-6-8-10"),
    sizeInput: { choice: CUSTOM, widthLabel: W_LABEL, heightLabel: H_LABEL, overRate: OVER_RATE, askOver: ASK_OVER, unit: "ซม." },
    choices: [...SIZES.map(sizeCard), {
        name: CUSTOM,
        desc: `ระบุ ก.×ส. เอง — ไม่เกิน 6 ซม. คิดตามตาราง · เกิน 6 ซม. บวก ซม. ละ ${OVER_RATE} บาท/ชิ้น (เกิน ${ASK_OVER} ซม. แอดมินตีราคา)`,
        imageSrc: IMG("size-custom"),
      }],
  },
  inputField(W_LABEL, "ใส่ทศนิยมได้ เช่น 4.5"),
  inputField(
    H_LABEL,
    `ราคาคิดจากด้านที่ยาวที่สุด เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (4.5 ซม. = แถว 4cm · 4.6 ซม. = แถว 5cm) · ` +
      `เกิน 6 ซม. คิดราคาแถว 6cm แล้วบวกส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น · ด้านยาวสุดเกิน ${ASK_OVER} ซม. แอดมินตีราคาให้`
  ),
  ...hookOptions,
  ...baseOptions,
];

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text: [
      "• อะคริลิคกระจก (Acrylic Mirror) — งานอะคริลิคประกบ 2 ชั้น ด้านหน้าเป็นอะคริลิคกระจกเงาสะท้อน ด้านหลังอะคริลิคขาว หนารวมประมาณ 3 มม. พิมพ์ลายด้วยระบบ UV Printing สกรีนบนผิวกระจก",
      "• ไม่มีขั้นต่ำในการสั่งผลิต · ราคา 1-10 ชิ้น คละดีเทลได้ไม่จำกัด",
      `• ตั้งแต่ ${TIERS[1].label} ขึ้นไป คละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น — ลายที่ไม่ถึง 5 ชิ้น คิดเพิ่มชิ้นละ 5 บาท`,
      `• ขนาดตามตารางราคา 4-6 ซม. (นับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง) · ใหญ่กว่านั้นเลือก “กำหนดขนาดเอง” กรอก ก.×ส. ได้เลย ระบบคิดราคาให้ทันที = ราคาแถว 6 ซม. + ส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น (ด้านยาวสุดเกิน ${ASK_OVER} ซม. แอดมินตีราคาให้ก่อนเริ่มผลิต)`,
      "• พวงกุญแจ: ขนาดที่สั่งไม่นับรวมรูตะขอ — ต้องการให้นับรวม แจ้งในหมายเหตุถึงร้าน",
      "• สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษ (ดาว / หัวใจ ฯลฯ) บวกชิ้นละ 5 บาท · ฐานอะคริลิคพิเศษมีความหนาประมาณ 2.5-3 มม.",
      "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% · ใช้สีระบบ RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    ].join("\n"),
    images: [IMG("tab-screen-top")],
  },
  {
    title: "ขนาดเปรียบเทียบ",
    text:
      "ภาพเทียบขนาดงานอะคริลิคของร้าน (นับจากด้านที่ยาวที่สุด)::\n" +
      `• ตารางราคาอะคริลิคกระจกมีถึง 6 ซม. — ใหญ่กว่านั้นเลือก “กำหนดขนาดเอง” ในหน้าสินค้า ระบบคิดให้ทันที (ราคาแถว 6 ซม. + ส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น · เกิน ${ASK_OVER} ซม. แอดมินตีราคา)\n` +
      "• ภาพตัวอย่างเป็นงานอะคริลิคใส ใช้ดูสเกลเทียบขนาดเท่านั้น เนื้องานจริงของสินค้านี้เป็นอะคริลิคกระจก",
    images: [IMG("tab-size-2-4-6-8-10"), IMG("tab-size-3-5-7-9")],
    imagePos: "top",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกรูปแบบงาน (พวงกุญแจ / สแตนดี้) · ขนาด · อะไหล่ตะขอหรือฐาน แล้วใส่จำนวนที่ต้องการ\n" +
      "• แนบภาพลายในช่อง “แนบลายของคุณ” หรือใส่ลิงก์ไฟล์งาน (Google Drive ที่เปิดการเข้าถึงแล้ว)\n" +
      "• ระบุรายละเอียดเพิ่มเติมในช่อง “หมายเหตุถึงร้าน” เช่น จุดที่ต้องการเจาะรู · วันที่ต้องการใช้งาน\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: สิ่งที่ต้องการทำ (พวงกุญแจ / สแตนดี้) · ขนาดอะคริลิคกระจก · อะไหล่ตะขอ (ถ้ามี) · ฐานอะคริลิค ใส/สกรีน (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• สีอะคริลิค หรืออะไหล่ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];
// แท็บ "ตะขอ / ห่วง" ยกทั้งแท็บจาก Acrylic Kit (แผ่นอะไหล่รวม + ชาร์ตสี)
const kitTab = (kit.data.tabs ?? []).find((t: any) => t.title === HOOK_TAB);
if (!kitTab) throw new Error(`Acrylic Kit ไม่มีแท็บ "${HOOK_TAB}" — ตรวจก่อน`);
TABS!.splice(2, 0, structuredClone(kitTab));

const pricing = { unit: "ชิ้น", driverLabels: [SIZE], tiers: TIERS, cells: Object.fromEntries(SIZES.map((s) => [s, PRICES[s]])) };

const product: Product = {
  id: ID,
  slug: SLUG,
  name: EXPECT_NAME,
  category: "acrylic",
  price: FROM,
  emoji: "🪞",
  gradient: "from-slate-100 to-zinc-200",
  imageSrc: IMG("gal-1"),
  rating: 5,
  sold: current.data.sold ?? 0,
  badge: "ใหม่",
  description:
    "อะคริลิคกระจก (Acrylic Mirror) สกรีนลายตามสั่งด้วยระบบ UV Printing — งานอะคริลิคประกบ 2 ชั้น " +
    "ด้านหน้าเป็นอะคริลิคกระจกเงาสะท้อนแบบกระจกจริง ด้านหลังประกบอะคริลิคขาว หนารวมประมาณ 3 มม. " +
    "แข็งแรงไม่บางเปราะ ไดคัทตามลายที่ส่งมา ทำได้ทั้งพวงกุญแจกระจกและสแตนดี้กระจก " +
    `เลือกขนาดได้ 4-6 ซม. หรือกำหนดขนาดเอง (เกิน 6 ซม. บวก ซม. ละ ${OVER_RATE} บาท/ชิ้น) ไม่มีขั้นต่ำในการสั่งผลิต ยิ่งสั่งเยอะยิ่งถูก`,
  highlights: [
    "เนื้ออะคริลิคกระจก เงาสะท้อนแบบกระจกจริง",
    "ทำได้ 2 แบบ — พวงกุญแจกระจก / สแตนดี้กระจก (ราคาตัวงานเท่ากัน)",
    "ประกบ 2 ชั้น หน้ากระจก + หลังขาว หนารวม ~3 มม.",
    `ขนาด 4-6 ซม. · กำหนดขนาดเองได้ เกิน 6 ซม. บวก ซม. ละ ${OVER_RATE} บาท/ชิ้น`,
    `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${FROM} บาท/ชิ้น`,
  ],
  images: [
    { emoji: "🪞", gradient: "from-slate-100 to-zinc-200", label: "พวงกุญแจกระจกทรงกลม", src: IMG("gal-1") },
    { emoji: "💗", gradient: "from-pink-100 to-slate-200", label: "พวงกุญแจกระจกไดคัทตามลาย", src: IMG("gal-2") },
    { emoji: "👻", gradient: "from-violet-100 to-slate-200", label: "งานกระจกไล่เงาสะท้อน", src: IMG("gal-3") },
    { emoji: "🖼", gradient: "from-slate-100 to-zinc-200", label: "ชิ้นงานกระจกตั้งโชว์", src: IMG("gal-4") },
    { emoji: "🔑", gradient: "from-sky-100 to-slate-200", label: "ผิวกระจกสะท้อนของจริง", src: IMG("gal-5") },
  ],
  options,
  pricing,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      minQty: TIERS[0].upTo! + 1, // เรทส่งเริ่มที่ 11 ชิ้น (ต่ำกว่านั้นคิดช่วงปลีกในตารางเดียวกัน)
      minPerDesign: 5,
      freeMixBelowQty: TIERS[0].upTo! + 1,
      underMinPieceFee: 5, // ลายที่คละไม่ถึง 5 ชิ้น คิดส่วนต่างชิ้นละ 5 บาท (กติกาค่าคละทั้งร้าน)
      pricing,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 50,
  tabs: TABS,
  terms: [
    "งานอะคริลิคประกบ 2 ชั้น — ด้านหน้าอะคริลิคกระจก ด้านหลังอะคริลิคขาว หนารวมประมาณ 3 มม.",
    `ขนาดตามตารางราคา 4-6 ซม. · ใหญ่กว่านั้นกำหนดขนาดเองได้ คิดราคาแถว 6 ซม. + ส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น (ด้านยาวสุดเกิน ${ASK_OVER} ซม. แอดมินตีราคาให้)`,
    `ราคา 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · ตั้งแต่ ${TIERS[1].label} คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น (ไม่ถึงคิดเพิ่มชิ้นละ 5 บาท)`,
    "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · พวงกุญแจไม่นับรวมรูตะขอ (ต้องการให้นับรวมต้องแจ้ง)",
    "สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษบวกชิ้นละ 5 บาท",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  ].join("\n"),
  seo: {
    title: `รับทำอะคริลิคกระจก พวงกุญแจ / สแตนดี้ สกรีนลายตามสั่ง เริ่มต้น ${FROM} บาท`,
    description:
      "รับทำอะคริลิคกระจก (Acrylic Mirror) สกรีนลายตามสั่ง ทำได้ทั้งพวงกุญแจและสแตนดี้ " +
      `ขนาด 4-6 ซม. งานประกบ 2 ชั้น หนา ~3 มม. ไม่มีขั้นต่ำ เริ่มต้น ${FROM} บาท/ชิ้น`,
    keywords: [
      "อะคริลิคกระจก",
      "Acrylic Mirror",
      "พวงกุญแจกระจก",
      "สแตนดี้กระจก",
      "รับทำพวงกุญแจอะคริลิค",
      "รับทำสแตนดี้",
      "สกรีนอะคริลิค",
      "UV Printing",
      "งานสั่งทำ",
    ],
    faqs: [
      {
        q: "อะคริลิคกระจก ราคาเท่าไหร่?",
        a: `เริ่มต้นชิ้นละ ${FROM} บาท — ราคาจริงขึ้นกับขนาดและจำนวนที่สั่ง (1-10 ชิ้น ชิ้นละ ${PRICES["4cm"][0]} บาท) ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "อะคริลิคกระจกทำเป็นอะไรได้บ้าง?",
        a: "หน้านี้ทำได้ 2 แบบ — พวงกุญแจกระจก (เลือกตะขอ/ห่วงกว่า 30 แบบ) และสแตนดี้กระจก (เลือกฐานอะคริลิคตามขนาด/ทรง/สี) ราคาตัวชิ้นงานเท่ากัน ต่างกันที่ค่าอะไหล่",
      },
      {
        q: "มีขนาดอะไรให้เลือกบ้าง?",
        a: `ตารางราคาของร้านมี 4cm, 5cm และ 6cm (นับจากด้านที่ยาวที่สุด) — ใหญ่กว่านั้นเลือก “กำหนดขนาดเอง” กรอกขนาดที่ต้องการได้เลย ระบบคิดราคาให้ทันที: ราคาแถว 6 ซม. + ส่วนที่เกิน ซม. ละ ${OVER_RATE} บาท/ชิ้น (ด้านยาวสุดเกิน ${ASK_OVER} ซม. แอดมินตีราคาให้)`,
      },
      {
        q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
        a: "ไม่มีขั้นต่ำในการสั่งผลิต · ราคา 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไปคละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น ลายที่ไม่ถึงคิดเพิ่มชิ้นละ 5 บาท",
      },
    ],
  },
  hidden: true, // ฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  priceMin: range.min,
  priceMax: range.max,
  savedAt: new Date().toISOString(),
};

/* ── ตรวจก่อนบันทึก ────────────────────────────────────────────────────── */
let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${msg}`);
};
console.log("\n🔍 ตรวจผล:");
check(saved.options.length === 4 + hookOptions.length + baseOptions.length, `กลุ่มตัวเลือก ${saved.options.length} กลุ่ม`);
{
  // การ์ด (display "cards") ต้องมีรูปครบทุกใบ — เมนูเลื่อนยอมให้ตัวเลือก "ไม่เอา" ไม่มีรูปได้
  const cardsNoArt = saved.options.filter((o) => o.display === "cards" && o.choices.some((c) => !c.imageSrc));
  check(!cardsNoArt.length, `การ์ดตัวเลือกมีภาพครบทุกใบ (${saved.options.filter((o) => o.display === "cards").length} กลุ่ม)`);
  // เมนูเลื่อน: ฐานมีรูปรายตัวเลือกครบ · ชุดตะขอ/สีตะขอทั้งร้านใช้ "แผ่นอะไหล่รวม" แทนรูปรายชิ้น
  const dropNoArt = saved.options.filter(
    (o) => o.display === "dropdown" && o.choices.some((c) => !c.imageSrc) && !HOOK_GROUPS.includes(o.label)
  );
  check(!dropNoArt.length, `เมนูเลื่อนนอกชุดตะขอมีรูปครบ ${dropNoArt.length ? `(ขาด ${dropNoArt.map((o) => o.label).join(", ")})` : ""}`);
  console.log(`   ℹ️  ชุดตะขอ/สีตะขอ ${HOOK_GROUPS.length} กลุ่ม ใช้แผ่นอะไหล่รวมของร้านแทนรูปรายชิ้น (ปุ่มดูรูปใต้กลุ่ม + แท็บ "${HOOK_TAB}")`);
}
check(
  Object.keys(pricing.cells).length === SIZES.length && SIZES.every((s) => pricing.cells[s].length === TIERS.length),
  `ตารางราคา ${SIZES.length} ขนาด × ${TIERS.length} ช่วงจำนวน (แกน "${SIZE}")`
);
check(range.min === FROM, `ราคาเริ่มต้น ฿${range.min} (สูงสุด ฿${range.max})`);
check(
  hookOptions.every((o) => (o as any).showWhen?.choices?.[0] === FORM_KEYRING || (o as any).showWhenAlso?.choices?.[0] === FORM_KEYRING),
  `ชุดตะขอ ${hookOptions.length} กลุ่ม โผล่เฉพาะ "${FORM_KEYRING}"`
);
check(
  baseOptions.every(
    (o) => (o as any).showWhen?.choices?.[0] === FORM_STANDEE || (o as any).showWhenAll?.some((w: any) => w.choices?.[0] === FORM_STANDEE)
  ),
  `ชุดฐาน ${baseOptions.length} กลุ่ม โผล่เฉพาะ "${FORM_STANDEE}"`
);
{
  // 📐 จำลองราคางานกำหนดขนาดเอง ด้วยกติกาเดียวกับหน้าเว็บ/ตะกร้า (กันตั้งค่าแล้วคิดเงินไม่ตรง)
  const sel = (w: string, h: string) => ({
    [FORM]: FORM_KEYRING,
    [SIZE]: CUSTOM,
    [W_LABEL]: w,
    [H_LABEL]: h,
  });
  const at = (w: string, h: string, qty: number) => {
    const plan = sizeInputPlan(saved, sel(w, h));
    return {
      quote: needsQuote(saved, sel(w, h)),
      price: unitPriceFor(saved, sel(w, h), qty),
      row: plan?.choice,
      over: plan?.overCm ?? 0,
    };
  };
  const wholesale = PRICES[SIZES[SIZES.length - 1]][1]; // ราคาแถว 6cm ช่วง 11-49 ชิ้น
  const cases: [string, string, number, number | "quote", string][] = [
    ["6", "4", 11, wholesale, "อยู่ในตาราง"],
    ["8", "4", 11, wholesale + 2 * OVER_RATE, `เกิน 2 ซม. × ฿${OVER_RATE}`],
    ["12", "9", 11, wholesale + 6 * OVER_RATE, `เกิน 6 ซม. × ฿${OVER_RATE}`],
    ["20", "3", 11, wholesale + 14 * OVER_RATE, `เกิน 14 ซม. × ฿${OVER_RATE}`],
    ["21", "3", 11, "quote", `เกินเพดาน ${ASK_OVER} ซม.`],
  ];
  for (const [w, h, qty, want, why] of cases) {
    const got = at(w, h, qty);
    const ok = want === "quote" ? got.quote : !got.quote && got.price === want;
    check(
      ok,
      `${w}×${h} ซม. ที่ ${qty} ชิ้น → ${got.quote ? "รอแอดมินตีราคา" : `฿${got.price}/ชิ้น`} (${why}${
        got.over ? ` · เกาะแถว ${got.row}` : ""
      })`
    );
  }
}

const missingArt = [...new Set(JSON.stringify(saved).match(new RegExp(`products/${SLUG}/[a-z0-9-]+-v\\d+\\.jpg`, "g")) ?? [])]
  .map((p) => p.split("/").pop()!.replace(/-v\d+\.jpg$/, ".jpg"))
  .filter((f) => !existsSync(IMG_DIR + f));
check(!missingArt.length, `ไฟล์ภาพครบใน scripts/assets/acrylic-mirror/ ${missingArt.length ? `(ขาด ${missingArt.join(", ")})` : ""}`);

if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป/ไม่เขียนฐานข้อมูล — ใส่ --write)");
  process.exit(0);
}

/* ── อัปรูป + บันทึก ──────────────────────────────────────────────────── */
for (const file of readdirSync(IMG_DIR).filter((f) => f.endsWith(".jpg"))) {
  const base = file.replace(/\.jpg$/, "");
  const path = `products/${SLUG}/${base}-${REV[base] ?? V}.jpg`;
  const up = await sb.storage
    .from("product-images")
    .upload(path, readFileSync(IMG_DIR + file), { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file} ไม่สำเร็จ — ${up.error.message}`);
  console.log(`⬆️  ${path}`);
}

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, badge: saved.badge, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ — ${error.message}`);
console.log(`\n✅ บันทึกแล้ว — ${ID} (ฉบับร่าง กดเผยแพร่เองที่ /admin/products)`);
